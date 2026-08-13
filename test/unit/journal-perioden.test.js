// 4T-0432 (Epic 3E-0081): Unit-Tests des Perioden-Kerns — ISO-Perioden-
// Rechnung (KW-Grenzfälle 1/52/53, Monats-/Quartals-Grenzen, Schaltjahr),
// Schema-Auflösung mit Jahres-Unterordnern (Beleg-Muster 2026/2026-KW28),
// Journal-Grenzen und Eintrags-Ermittlung mit injiziertem Existenz-Check.
import { describe, it, expect } from 'vitest';
import {
  addPeriods,
  applyJournalProperties,
  entriesInRange,
  findPeriodForPath,
  monthGrid,
  replaceJournalNavFences,
  isoDateToMs,
  msToIsoDate,
  nextPeriod,
  parentPeriods,
  periodAllowed,
  periodOf,
  prevPeriod,
  resolveEntryPath,
} from '../../src/shared/journal-core.js';
import { isoWeekOf, formatDateMs } from '../../src/shared/query/query-format.js';
import { isExtensionId } from '../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../src/shared/extensions/extensions-core.js';

const ms = (iso) => isoDateToMs(iso);
const span = (p) => [msToIsoDate(p.startMs), msToIsoDate(p.endMs)];

// Minimal-Journal für Auflösungs- und Grenzen-Tests (Wochenbuch nach dem
// belegten PO-Muster: Jahres-Unterordner, KW-Namen).
const WEEKLY = {
  id: 'wochenbuch',
  granularity: 'week',
  folderPattern: 'Tagebuch/{{date::yyyy}}',
  namePattern: '{{date::kkkk-KWww}}',
  startDate: null,
  endDate: null,
};

describe('isoWeekOf — Donnerstags-Regel', () => {
  it('Jahreswechsel-Fälle: KW 1, KW 52 und KW 53', () => {
    expect(isoWeekOf(ms('2026-01-01'))).toEqual({ week: 1, year: 2026 }); // Donnerstag
    expect(isoWeekOf(ms('2021-01-01'))).toEqual({ week: 53, year: 2020 }); // Freitag
    expect(isoWeekOf(ms('2020-12-31'))).toEqual({ week: 53, year: 2020 });
    expect(isoWeekOf(ms('2024-12-30'))).toEqual({ week: 1, year: 2025 }); // Montag
    expect(isoWeekOf(ms('2023-01-01'))).toEqual({ week: 52, year: 2022 }); // Sonntag
    expect(isoWeekOf(ms('2026-07-09'))).toEqual({ week: 28, year: 2026 });
  });
});

describe('formatDateMs — ISO-KW- und Quartals-Token', () => {
  it('ww und kkkk formatieren KW und KW-Jahr; Literale bleiben', () => {
    expect(formatDateMs(ms('2026-07-09'), 'kkkk-KWww')).toBe('2026-KW28');
    // Kalenderjahr und KW-Jahr weichen am Jahreswechsel ab.
    expect(formatDateMs(ms('2021-01-01'), 'yyyy')).toBe('2021');
    expect(formatDateMs(ms('2021-01-01'), 'kkkk-Www')).toBe('2020-W53');
  });

  it('q formatiert die Quartals-Nummer (4T-0438)', () => {
    expect(formatDateMs(ms('2026-07-09'), 'yyyy-Qq')).toBe('2026-Q3');
    expect(formatDateMs(ms('2026-01-15'), 'q')).toBe('1');
    expect(formatDateMs(ms('2026-12-31'), 'q')).toBe('4');
  });
});

describe('periodOf — Grenzen der fünf Granularitäten', () => {
  it('Tag: Start = Ende = Kalendertag', () => {
    const p = periodOf(ms('2026-07-09'), 'day');
    expect(span(p)).toEqual(['2026-07-09', '2026-07-09']);
    expect(p.key).toBe('2026-07-09');
  });

  it('Woche: Montag bis Sonntag, Schlüssel mit KW-Jahr', () => {
    const p = periodOf(ms('2026-07-09'), 'week');
    expect(span(p)).toEqual(['2026-07-06', '2026-07-12']);
    expect(p.key).toBe('2026-W28');
    // Jahreswechsel-Woche: gehört zu KW 53 des Vorjahres.
    const jw = periodOf(ms('2021-01-01'), 'week');
    expect(span(jw)).toEqual(['2020-12-28', '2021-01-03']);
    expect(jw.key).toBe('2020-W53');
  });

  it('Monat: inklusive Schaltjahr-Februar', () => {
    expect(span(periodOf(ms('2024-02-15'), 'month'))).toEqual(['2024-02-01', '2024-02-29']);
    expect(periodOf(ms('2024-02-15'), 'month').key).toBe('2024-02');
    expect(span(periodOf(ms('2023-02-15'), 'month'))).toEqual(['2023-02-01', '2023-02-28']);
  });

  it('Quartal und Jahr', () => {
    const q = periodOf(ms('2026-07-09'), 'quarter');
    expect(span(q)).toEqual(['2026-07-01', '2026-09-30']);
    expect(q.key).toBe('2026-Q3');
    const y = periodOf(ms('2026-07-09'), 'year');
    expect(span(y)).toEqual(['2026-01-01', '2026-12-31']);
    expect(y.key).toBe('2026');
  });

  it('unbekannte Granularität liefert null', () => {
    expect(periodOf(ms('2026-07-09'), 'sprint')).toBeNull();
  });
});

describe('addPeriods — Verschiebung über Jahres- und Monatsgrenzen', () => {
  it('Wochen über den Jahreswechsel (KW 53 -> KW 1)', () => {
    const w53 = periodOf(ms('2020-12-31'), 'week');
    const w1 = addPeriods(w53, 1);
    expect(w1.key).toBe('2021-W01');
    expect(span(w1)).toEqual(['2021-01-04', '2021-01-10']);
    expect(addPeriods(w1, -1).key).toBe('2020-W53');
  });

  it('Monate, Quartale und Jahre rollen korrekt', () => {
    expect(addPeriods(periodOf(ms('2026-12-05'), 'month'), 1).key).toBe('2027-01');
    expect(addPeriods(periodOf(ms('2026-01-05'), 'month'), -1).key).toBe('2025-12');
    expect(addPeriods(periodOf(ms('2026-10-01'), 'quarter'), 1).key).toBe('2027-Q1');
    expect(addPeriods(periodOf(ms('2026-07-09'), 'year'), -2).key).toBe('2024');
  });

  it('Tages-Schritte über den Schaltjahres-Februar', () => {
    expect(addPeriods(periodOf(ms('2024-02-28'), 'day'), 1).key).toBe('2024-02-29');
    expect(addPeriods(periodOf(ms('2024-02-29'), 'day'), 1).key).toBe('2024-03-01');
  });
});

describe('parentPeriods — gröbere Granularitäten über den Perioden-Start', () => {
  it('Woche liefert Monat, Quartal, Jahr in dieser Reihenfolge', () => {
    const parents = parentPeriods(periodOf(ms('2026-07-09'), 'week'));
    expect(parents.map((p) => p.key)).toEqual(['2026-07', '2026-Q3', '2026']);
  });

  it('Jahreswechsel-Woche gehört über den Start zum Vorjahres-Monat', () => {
    const parents = parentPeriods(periodOf(ms('2021-01-01'), 'week'));
    expect(parents.map((p) => p.key)).toEqual(['2020-12', '2020-Q4', '2020']);
  });

  it('Jahr hat keine übergeordneten Perioden', () => {
    expect(parentPeriods(periodOf(ms('2026-07-09'), 'year'))).toEqual([]);
  });
});

describe('Journal-Grenzen — periodAllowed, nextPeriod, prevPeriod', () => {
  const bounded = { ...WEEKLY, startDate: '2026-01-01', endDate: '2026-12-31' };

  it('Perioden zählen, sobald sie den erlaubten Bereich berühren', () => {
    // KW 1/2026 beginnt 2025-12-29, berührt den Bereich aber.
    expect(periodAllowed(bounded, periodOf(ms('2026-01-01'), 'week'))).toBe(true);
    expect(periodAllowed(bounded, periodOf(ms('2025-12-20'), 'week'))).toBe(false);
    expect(periodAllowed(bounded, periodOf(ms('2027-01-15'), 'week'))).toBe(false);
  });

  it('next/prev kappen am Rand (null statt Übertritt)', () => {
    const first = periodOf(ms('2026-01-01'), 'week'); // KW 1
    expect(prevPeriod(bounded, first)).toBeNull();
    const last = periodOf(ms('2026-12-31'), 'week'); // KW 53 (endet 2027-01-03)
    expect(nextPeriod(bounded, last)).toBeNull();
    // Ohne Grenzen läuft die Navigation frei weiter.
    expect(prevPeriod(WEEKLY, first).key).toBe('2025-W52');
  });
});

describe('resolveEntryPath — Schema-Auflösung', () => {
  it('Beleg-Muster des PO: Jahres-Unterordner mit KW-Namen', () => {
    const r = resolveEntryPath(WEEKLY, periodOf(ms('2026-07-09'), 'week'));
    expect(r).toEqual({ ok: true, relPath: 'Tagebuch/2026/2026-KW28.md' });
  });

  it('leeres Ordner-Schema legt in der Bereichs-Wurzel ab', () => {
    const r = resolveEntryPath(
      { granularity: 'day', folderPattern: '', namePattern: '{{date}}' },
      periodOf(ms('2026-07-09'), 'day'),
    );
    expect(r).toEqual({ ok: true, relPath: '2026-07-09.md' });
  });

  it('interaktive Platzhalter sind in Schemata Fehler', () => {
    const r = resolveEntryPath(
      { granularity: 'day', folderPattern: '', namePattern: '{{prompt:Name}}' },
      periodOf(ms('2026-07-09'), 'day'),
    );
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('patternPlaceholder');
  });

  it('Pfad-Ausbrüche und verbotene Zeichen werden abgewiesen', () => {
    const day = periodOf(ms('2026-07-09'), 'day');
    expect(
      resolveEntryPath({ granularity: 'day', folderPattern: '../raus', namePattern: 'x' }, day).ok,
    ).toBe(false);
    expect(
      resolveEntryPath({ granularity: 'day', folderPattern: '', namePattern: 'a/b' }, day).ok,
    ).toBe(false);
    expect(
      resolveEntryPath({ granularity: 'day', folderPattern: '', namePattern: 'a:b' }, day).ok,
    ).toBe(false);
  });

  it('defektes Format-Token im Schema meldet den Engine-Fehler', () => {
    const r = resolveEntryPath(
      { granularity: 'day', folderPattern: '', namePattern: '{{date:kaputt}}' },
      periodOf(ms('2026-07-09'), 'day'),
    );
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('invalidOffset');
  });
});

describe('entriesInRange — Eintrags-Ermittlung', () => {
  it('liefert Perioden des Bereichs mit Pfad und Existenz-Ergebnis', async () => {
    const existing = new Set(['Tagebuch/2026/2026-KW28.md', 'Tagebuch/2026/2026-KW30.md']);
    const entries = await entriesInRange(WEEKLY, ms('2026-07-06'), ms('2026-07-26'), (p) =>
      existing.has(p),
    );
    expect(entries.map((e) => [e.period.key, e.exists])).toEqual([
      ['2026-W28', true],
      ['2026-W29', false],
      ['2026-W30', true],
    ]);
  });

  it('respektiert Journal-Grenzen und asynchrone Existenz-Checks', async () => {
    const bounded = { ...WEEKLY, startDate: '2026-07-13' };
    const entries = await entriesInRange(
      bounded,
      ms('2026-07-06'),
      ms('2026-07-19'),
      async () => true,
    );
    expect(entries.map((e) => e.period.key)).toEqual(['2026-W29']);
  });

  it('leere oder ungültige Bereiche liefern eine leere Liste', async () => {
    expect(await entriesInRange(WEEKLY, ms('2026-07-10'), ms('2026-07-06'), () => true)).toEqual(
      [],
    );
    expect(await entriesInRange(null, ms('2026-07-06'), ms('2026-07-10'), () => true)).toEqual([]);
  });
});

// --- 4T-0433 (Epic 3E-0081): Frontmatter-Datums-Properties ------------------------

describe('applyJournalProperties — automatische Datums-Properties', () => {
  const props = {
    dateProp: 'journal-date',
    startProp: 'journal-start-date',
    endProp: 'journal-end-date',
  };

  it('Tages-Journal: nur das Datum, neuer Frontmatter-Block entsteht', () => {
    const day = periodOf(ms('2026-07-09'), 'day');
    const text = applyJournalProperties('# Heute\n', { ...props }, day);
    expect(text).toContain('journal-date: 2026-07-09');
    expect(text).not.toContain('journal-start-date');
    expect(text).toContain('# Heute');
  });

  it('mehrtägige Periode: Start und Ende, bestehende Felder bleiben', () => {
    const week = periodOf(ms('2026-07-09'), 'week');
    const source = '---\ntags: [wochenbuch]\n---\n\n# KW\n';
    const text = applyJournalProperties(source, { ...props }, week);
    expect(text).toContain('journal-start-date: 2026-07-06');
    expect(text).toContain('journal-end-date: 2026-07-12');
    expect(text).toContain('tags:');
    expect(text).toContain('# KW');
  });

  it('gleichnamige Felder aus der Vorlage werden übersteuert', () => {
    const day = periodOf(ms('2026-07-09'), 'day');
    const source = '---\njournal-date: 1999-01-01\n---\nBody\n';
    const text = applyJournalProperties(source, { ...props }, day);
    expect(text).toContain('journal-date: 2026-07-09');
    expect(text).not.toContain('1999-01-01');
  });

  it('konfigurierte Feldnamen des Journals gelten', () => {
    const week = periodOf(ms('2026-07-09'), 'week');
    const text = applyJournalProperties('', { startProp: 'von', endProp: 'bis' }, week);
    expect(text).toContain('von: 2026-07-06');
    expect(text).toContain('bis: 2026-07-12');
  });
});

// --- 4T-0435 (Epic 3E-0081): Kontext-Ermittlung des Navigations-Blocks ------------

describe('findPeriodForPath — Pfad-Abgleich über die Schema-Auflösung', () => {
  it('findet die Periode eines Wochen-Eintrags (case-insensitiv, Backslashes)', () => {
    const period = findPeriodForPath(WEEKLY, 'tagebuch\\2026\\2026-kw28.md', {
      aroundMs: ms('2026-07-09'),
    });
    expect(period).not.toBeNull();
    expect(period.key).toBe('2026-W28');
  });

  it('findet zurückliegende und kommende Perioden im Fenster', () => {
    const past = findPeriodForPath(WEEKLY, 'Tagebuch/2024/2024-KW10.md', {
      aroundMs: ms('2026-07-09'),
    });
    expect(past && past.key).toBe('2024-W10');
    const future = findPeriodForPath(WEEKLY, 'Tagebuch/2026/2026-KW40.md', {
      aroundMs: ms('2026-07-09'),
    });
    expect(future && future.key).toBe('2026-W40');
  });

  it('liefert null für fremde Pfade und außerhalb der Journal-Grenzen', () => {
    expect(findPeriodForPath(WEEKLY, 'Notizen/irgendwas.md')).toBeNull();
    const bounded = { ...WEEKLY, startDate: '2026-07-13' };
    expect(
      findPeriodForPath(bounded, 'Tagebuch/2026/2026-KW28.md', { aroundMs: ms('2026-07-09') }),
    ).toBeNull();
  });

  it('Tages-Journal: heutiger Eintrag terminiert sofort (Spiral-Start)', () => {
    const daily = {
      granularity: 'day',
      folderPattern: 'J/{{date::yyyy}}',
      namePattern: '{{date}}',
    };
    const period = findPeriodForPath(daily, 'J/2026/2026-07-09.md', { aroundMs: ms('2026-07-09') });
    expect(period && period.key).toBe('2026-07-09');
  });
});

describe('replaceJournalNavFences — Portable-Export-Ersetzung', () => {
  it('ersetzt Fences mit leerem und mit gefülltem Body, Rest bleibt', () => {
    const src =
      'Vor\n\n```perspective-journal-nav\n```\n\nMitte\n\n```perspective-journal-nav\nx\n```\n\nNach\n';
    const out = replaceJournalNavFences(src, '**KW 28**');
    expect(out).not.toContain('perspective-journal-nav');
    expect(out.match(/\*\*KW 28\*\*/g)).toHaveLength(2);
    expect(out).toContain('Vor');
    expect(out).toContain('Mitte');
    expect(out).toContain('Nach');
  });

  it('lässt fremde Fences und Text ohne Fence unverändert', () => {
    const other = '```js\ncode\n```\n';
    expect(replaceJournalNavFences(other, 'X')).toBe(other);
    expect(replaceJournalNavFences('nur Text', 'X')).toBe('nur Text');
  });
});

// --- 4T-0434 (Epic 3E-0081): Monats-Gitter der Kalender-Ansicht -------------------

describe('monthGrid — Wochen-Zeilen der Monatsansicht', () => {
  it('Juli 2026: fünf Zeilen KW 27 bis KW 31, Randtage der Nachbar-Monate', () => {
    const rows = monthGrid(2026, 6);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.week.week)).toEqual([27, 28, 29, 30, 31]);
    // Erste Zeile beginnt am Montag 2026-06-29 (Juni-Randtage nicht inMonth).
    expect(rows[0].days[0].iso).toBe('2026-06-29');
    expect(rows[0].days[0].inMonth).toBe(false);
    expect(rows[0].days[2].iso).toBe('2026-07-01');
    expect(rows[0].days[2].inMonth).toBe(true);
    // Letzte Zeile endet am Sonntag 2026-08-02.
    const last = rows[4];
    expect(last.days[6].iso).toBe('2026-08-02');
    expect(last.days[6].inMonth).toBe(false);
    // Jede Zeile hat sieben Tage.
    for (const row of rows) expect(row.days).toHaveLength(7);
  });

  it('Februar 2021: beginnt am Monats-Montag, exakt vier Zeilen', () => {
    const rows = monthGrid(2021, 1);
    expect(rows).toHaveLength(4);
    expect(rows[0].days[0].iso).toBe('2021-02-01');
    expect(rows[3].days[6].iso).toBe('2021-02-28');
    expect(rows.every((r) => r.days.every((d) => d.inMonth))).toBe(true);
  });

  it('Januar 2026: Jahreswechsel-Zeile trägt KW 1 des neuen KW-Jahres', () => {
    const rows = monthGrid(2026, 0);
    expect(rows[0].days[0].iso).toBe('2025-12-29');
    expect(rows[0].week.week).toBe(1);
    expect(rows[0].week.year).toBe(2026);
  });
});

// 4T-0433 (Epic 3E-0081): Erweiterungs-Prüfschritt — die deaktivierte
// journals-Erweiterung filtert beide Kommandos (Dispatcher, Menü).
describe('Erweiterung journals — Aus-Zustand filtert die Kommandos', () => {
  it('ist registriert und liefert beide Kommando-IDs in die Filterung', () => {
    expect(isExtensionId('journals')).toBe(true);
    const disabled = disabledCommandIdSet(['journals']);
    expect(disabled.has('journal.openToday')).toBe(true);
    expect(disabled.has('journal.openForDate')).toBe(true);
  });
});
