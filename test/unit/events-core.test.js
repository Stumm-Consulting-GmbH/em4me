// 4T-0511 (Epic 3E-0092): Unit-Tests für den Ereignis-Kern — internes
// Profil, Rechen-Kern (Staffelung, Meilensteine, Wiederkehr, Spanne) und
// Fence-Datenformat (Direktiven, Datenzeilen, Round-Trip, Fence-Suche).
// Alle Rechen-Fälle laufen mit festem Stichtag (Determinismus).
import { describe, it, expect } from 'vitest';
import {
  EVENT_PROFILE_NAME,
  EVENT_FIELDS,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_COLORS,
  eventProfileFields,
  eventProfile,
  injectEventProfile,
  parseIsoDate,
  addMonthsClamped,
  eventDiff,
  spanDiff,
  JUBILEE_YEARS,
  eventMilestones,
  nextOccurrence,
  EVENT_VIEWS,
  parsePerspectiveEvents,
  serializePerspectiveEvents,
  effectiveEventsView,
  validateEventEntries,
  findPerspectiveEventsFences,
  EVENT_DATE_PRESETS,
  addDaysIso,
  sortEventIndices,
  datePresetRange,
  matchesEventFilter,
  filterEventIndices,
  eventFilterActiveCount,
  emptyFilterSpec,
  upcomingEventOccurrences,
  upcomingEventMilestones,
  categoryCounts,
  timelineGroups,
  calendarDayMap,
  nextEventId,
  toggleEventLink,
  cleanupEventLinks,
  eventLinksOf,
} from '../../src/shared/events-core.js';
import { resolveProfileFields } from '../../src/shared/property-profiles.js';

// Kompakter Helfer: parst und erwartet fehlerfreie Struktur.
function parseOk(body) {
  const model = parsePerspectiveEvents(body);
  expect(model.errors, JSON.stringify(model.errors)).toEqual([]);
  return model;
}

describe('events-core — internes Profil', () => {
  it('definiert die acht Felder im Format der Profil-Auflösung', () => {
    const fields = eventProfileFields();
    expect(fields.map((f) => f.name)).toEqual([
      'event-date',
      'event-end',
      'event-text',
      'event-category',
      'event-notes',
      'event-recurring',
      'event-predecessors',
      'event-successors',
    ]);
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(byName.get(EVENT_FIELDS.date).type).toBe('date');
    expect(byName.get(EVENT_FIELDS.category).values).toEqual(EVENT_CATEGORIES);
    expect(byName.get(EVENT_FIELDS.notes).type).toBe('multiline');
    expect(byName.get(EVENT_FIELDS.recurring).type).toBe('boolean');
    expect(byName.get(EVENT_FIELDS.predecessors).type).toBe('multistring');
  });

  it('läuft kompatibel durch die bestehende Profil-Auflösung', () => {
    const { fields, missing } = resolveProfileFields([eventProfile()], {
      assigned: [EVENT_PROFILE_NAME],
      defaultProfile: null,
    });
    expect(missing).toEqual([]);
    expect(fields).toHaveLength(8);
    expect(fields.every((f) => f.profile === EVENT_PROFILE_NAME)).toBe(true);
  });

  it('trägt für jede Kategorie eine Hell- und Dunkel-Farbe', () => {
    for (const cat of EVENT_CATEGORIES) {
      const colors = EVENT_CATEGORY_COLORS[cat];
      expect(colors, cat).toBeTruthy();
      expect(colors.light.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.light.fg).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.dark.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.dark.fg).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('kennzeichnet das Profil als intern und datei-los', () => {
    const profile = eventProfile();
    expect(profile.internal).toBe(true);
    expect(profile.fileName).toBeNull();
    expect(profile.errors).toEqual([]);
  });

  // 4T-0517: Einspeisung vor die Katalog-Profile, nur bei aktiver
  // Ereignis-Erweiterung (das Gating liefert der Aufrufer).
  it('injectEventProfile stellt das interne Profil voran (nur aktiv)', () => {
    const katalog = [{ name: 'Projekt', fileName: 'Projekt.md', fields: [], errors: [] }];
    const an = injectEventProfile(katalog, true);
    expect(an).toHaveLength(2);
    expect(an[0].name).toBe(EVENT_PROFILE_NAME);
    expect(an[0].internal).toBe(true);
    expect(an[1]).toBe(katalog[0]);
    // Aus-Zustand: Katalog unverändert, kein internes Profil.
    expect(injectEventProfile(katalog, false)).toEqual(katalog);
    // Leerer bzw. fehlender Katalog: das interne Profil wirkt allein.
    expect(injectEventProfile([], true).map((p) => p.name)).toEqual([EVENT_PROFILE_NAME]);
    expect(injectEventProfile(null, false)).toEqual([]);
  });

  it('eingespeistes Profil löst auch mit leerem Katalog auf', () => {
    const { fields, missing } = resolveProfileFields(injectEventProfile([], true), {
      assigned: [EVENT_PROFILE_NAME],
      defaultProfile: null,
    });
    expect(missing).toEqual([]);
    expect(fields).toHaveLength(8);
  });
});

describe('events-core — Datums-Arithmetik', () => {
  it('parst nur echte Kalender-Daten', () => {
    expect(parseIsoDate('2026-07-15')).toEqual({ y: 2026, m: 7, d: 15 });
    expect(parseIsoDate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-06-31')).toBeNull();
    expect(parseIsoDate('kein datum')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });

  it('klemmt Monats-Additionen ans Monatsende', () => {
    expect(addMonthsClamped({ y: 2026, m: 1, d: 31 }, 1)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(addMonthsClamped({ y: 2024, m: 1, d: 31 }, 1)).toEqual({ y: 2024, m: 2, d: 29 });
    expect(addMonthsClamped({ y: 2024, m: 2, d: 29 }, 12)).toEqual({ y: 2025, m: 2, d: 28 });
    expect(addMonthsClamped({ y: 2026, m: 11, d: 15 }, 2)).toEqual({ y: 2027, m: 1, d: 15 });
  });
});

describe('events-core — Zeitdifferenz-Staffelung', () => {
  it('liefert die vier Staffelungen für eine zurückliegende Differenz', () => {
    // 2020-01-01 -> 2026-07-15: 2 Schaltjahre (2020, 2024) in der Spanne.
    const diff = eventDiff('2020-01-01', '2026-07-15');
    expect(diff.valid).toBe(true);
    expect(diff.direction).toBe('past');
    expect(diff.totalDays).toBe(2387);
    expect(diff.tiers.days).toEqual({ days: 2387 });
    expect(diff.tiers.weeks).toEqual({ weeks: 341, days: 0 });
    // 78 volle Monate (2020-01-01 + 78M = 2026-07-01), Rest 14 Tage.
    expect(diff.tiers.months).toEqual({ months: 78, weeks: 2, days: 0 });
    expect(diff.tiers.years).toEqual({ years: 6, months: 6, weeks: 2, days: 0 });
  });

  it('behandelt heutige und zukünftige Zeitpunkte', () => {
    expect(eventDiff('2026-07-15', '2026-07-15').direction).toBe('today');
    expect(eventDiff('2026-07-15', '2026-07-15').totalDays).toBe(0);
    const future = eventDiff('2026-07-25', '2026-07-15');
    expect(future.direction).toBe('future');
    expect(future.signedDays).toBe(-10);
    expect(future.tiers.weeks).toEqual({ weeks: 1, days: 3 });
  });

  it('rechnet Monats-Grenzen kalender-genau mit Klemmung', () => {
    // Monatsende-Klemmung: 31.01. -> 28.02. ist genau ein Monat.
    const clamped = eventDiff('2026-01-31', '2026-02-28');
    expect(clamped.tiers.months).toEqual({ months: 1, weeks: 0, days: 0 });
    // Ein Tag vor der Monats-Grenze bleibt bei null Monaten.
    const before = eventDiff('2026-01-31', '2026-02-27');
    expect(before.tiers.months.months).toBe(0);
    expect(before.tiers.months.weeks).toBe(3);
    expect(before.tiers.months.days).toBe(6);
    // Schaltjahres-Geburtstag: 29.02.2024 -> 28.02.2025 ist ein volles Jahr.
    const leap = eventDiff('2024-02-29', '2025-02-28');
    expect(leap.tiers.years).toEqual({ years: 1, months: 0, weeks: 0, days: 0 });
  });

  it('liefert ungültig bei defekten Daten', () => {
    expect(eventDiff('2026-02-30', '2026-07-15').valid).toBe(false);
    expect(eventDiff('', '2026-07-15').valid).toBe(false);
  });
});

describe('events-core — Meilensteine', () => {
  it('erkennt 1000er-Tage und 100er-Wochen', () => {
    // 2020-01-01 + 1000 Tage = 2022-09-27; + 700 Tage = 2021-12-01.
    expect(eventMilestones('2020-01-01', '2022-09-27')).toEqual([{ kind: 'days', value: 1000 }]);
    expect(eventMilestones('2020-01-01', '2021-12-01')).toEqual([{ kind: 'weeks', value: 100 }]);
  });

  it('erkennt volle Jahre und Jubiläums-Jahre', () => {
    expect(eventMilestones('2000-06-15', '2026-06-15')).toEqual([{ kind: 'years', value: 26 }]);
    // 25 Jahre sind zugleich exakt 300 Monate: der 100er-Monats-Meilenstein
    // feuert mit (mehrere Badges, die Darstellung fasst zusammen).
    expect(eventMilestones('2000-06-15', '2025-06-15')).toEqual([
      { kind: 'months', value: 300 },
      { kind: 'years', value: 25 },
      { kind: 'jubilee', value: 25 },
    ]);
    expect(JUBILEE_YEARS).toContain(75);
  });

  it('erkennt 100er-Monate auf der Monats-Grenze', () => {
    // 2000-03-10 + 100 Monate = 2008-07-10.
    expect(eventMilestones('2000-03-10', '2008-07-10')).toEqual([{ kind: 'months', value: 100 }]);
  });

  it('liefert keine Meilensteine am Tag selbst oder abseits runder Werte', () => {
    expect(eventMilestones('2026-07-15', '2026-07-15')).toEqual([]);
    expect(eventMilestones('2020-01-01', '2026-07-15')).toEqual([]);
  });
});

describe('events-core — Wiederkehr und Spanne', () => {
  it('findet das nächste Jahres-Vorkommen mit Countdown', () => {
    // Geburtstag 10.03.: nächstes Vorkommen nach dem 15.07.2026 ist 2027.
    const occ = nextOccurrence('1990-03-10', '2026-07-15');
    expect(occ).toEqual({ dateIso: '2027-03-10', inDays: 238, years: 37 });
    // Am Jahrestag selbst: heute, null Tage.
    expect(nextOccurrence('1990-07-15', '2026-07-15')).toEqual({
      dateIso: '2026-07-15',
      inDays: 0,
      years: 36,
    });
  });

  it('klemmt den 29. Februar in Nicht-Schaltjahren', () => {
    const occ = nextOccurrence('1992-02-29', '2026-07-15');
    expect(occ.dateIso).toBe('2027-02-28');
    expect(occ.years).toBe(35);
  });

  it('nimmt zukünftige Zeitpunkte selbst als nächstes Vorkommen', () => {
    expect(nextOccurrence('2026-08-01', '2026-07-15')).toEqual({
      dateIso: '2026-08-01',
      inDays: 17,
      years: 0,
    });
  });

  it('rechnet die Spannen-Differenz und meldet verdrehte Reihenfolge', () => {
    const span = spanDiff('2026-01-01', '2026-01-15');
    expect(span.valid).toBe(true);
    expect(span.invalidOrder).toBe(false);
    expect(span.tiers.weeks).toEqual({ weeks: 2, days: 0 });
    expect(spanDiff('2026-01-15', '2026-01-01').invalidOrder).toBe(true);
    expect(spanDiff('2026-01-01', 'defekt').valid).toBe(false);
  });
});

describe('events-core — Fence-Format (Art 1)', () => {
  it('parst Direktiven und Datenzeilen', () => {
    const model = parseOk(
      [
        'view: dashboard',
        'filter: Wichtig := categories=geburtstag,jubilaeum; recurring=x',
        '| 2019-03-15 | | Projektstart | projekt | Notiz | x | | | |',
        '| 2020-01-01 | 2020-06-30 | Halbjahr | termin | | | a3f | b17 | |',
      ].join('\n'),
    );
    expect(model.view).toBe('dashboard');
    expect(model.query).toBeNull();
    expect(model.savedFilters).toEqual([
      {
        name: 'Wichtig',
        spec: {
          text: '',
          categories: ['geburtstag', 'jubilaeum'],
          from: '',
          to: '',
          notes: false,
          recurring: true,
          timespan: false,
        },
      },
    ]);
    expect(model.entries).toHaveLength(2);
    expect(model.entries[0]).toMatchObject({
      date: '2019-03-15',
      text: 'Projektstart',
      category: 'projekt',
      notes: 'Notiz',
      recurring: true,
      id: null,
      predecessors: [],
      successors: [],
    });
    expect(model.entries[1]).toMatchObject({
      id: 'a3f',
      predecessors: ['b17'],
      recurring: false,
    });
  });

  it('liest kurze Zeilen tolerant und meldet überzählige Zellen', () => {
    const model = parsePerspectiveEvents('| 2026-01-01 | | Nur Text |');
    expect(model.errors).toEqual([]);
    expect(model.entries[0]).toMatchObject({ text: 'Nur Text', end: '', recurring: false });
    const tooMany = parsePerspectiveEvents('| a | b | c | d | e | f | g | h | i | j |');
    expect(tooMany.errors.map((e) => e.code)).toEqual(['tooManyCells']);
    expect(tooMany.entries).toEqual([]);
  });

  it('un-escapt Pipe, Backslash und Zeilenumbruch in Zellen', () => {
    const model = parseOk('| 2026-01-01 | | A \\| B | | Zeile1\\nZeile2 \\\\ Ende | | | | |');
    expect(model.entries[0].text).toBe('A | B');
    expect(model.entries[0].notes).toBe('Zeile1\nZeile2 \\ Ende');
  });

  it('meldet unbekannte Direktiven, defekte Zeilen und Duplikate', () => {
    const model = parsePerspectiveEvents(
      ['view: table', 'view: month', 'spalten: x', 'freier text', 'filter: kaputt'].join('\n'),
    );
    expect(model.errors.map((e) => e.code)).toEqual([
      'duplicateDirective',
      'unknownDirective',
      'badLine',
      'badFilter',
    ]);
  });

  it('rundet verlustfrei (parse → serialize → parse modell-identisch)', () => {
    const body = [
      'view: timeline',
      'filter: Suche := text=Halb\\; jahr; from=2020-01-01; notes=x',
      '| 2019-03-15 | | A \\| B | projekt | Zeile1\\nZeile2 | x | a3f | b17,c22 | |',
      '| 2020-01-01 | 2020-06-30 | Kurz | | | | | | |',
    ].join('\n');
    const first = parseOk(body);
    const serialized = serializePerspectiveEvents(first);
    const second = parseOk(serialized);
    expect(second).toEqual(first);
    // Kanonische Form ist stabil (zweite Serialisierung identisch).
    expect(serializePerspectiveEvents(second)).toBe(serialized);
  });

  it('lässt die Kennungs-Spalte unverknüpfter Einträge leer', () => {
    const model = parseOk('| 2026-01-01 | | Text | | | | | | |');
    expect(model.entries[0].id).toBeNull();
    const serialized = serializePerspectiveEvents(model);
    expect(parseOk(serialized).entries[0].id).toBeNull();
  });
});

describe('events-core — Fence-Format (Art 2 und Ansicht)', () => {
  it('erkennt die query-Direktive als Aggregations-Art', () => {
    const model = parseOk('query: FROM "Personen" WHERE event-category = geburtstag');
    expect(model.query).toBe('FROM "Personen" WHERE event-category = geburtstag');
    expect(model.entries).toEqual([]);
    // Leere Abfrage: alle Bereichs-Dateien mit Ereignis-Profil.
    expect(parseOk('query:').query).toBe('');
  });

  it('meldet query zusammen mit Datenzeilen als Struktur-Fehler', () => {
    const model = parsePerspectiveEvents(
      ['query: WHERE event-date >= date(today)', '| 2026-01-01 | | Text | | | | | | |'].join('\n'),
    );
    expect(model.errors.map((e) => e.code)).toEqual(['queryWithEntries']);
  });

  it('behält unbekannte Ansichts-Werte verlustfrei und fällt wirksam auf table zurück', () => {
    const model = parseOk('view: kalender');
    expect(model.view).toBe('kalender');
    expect(effectiveEventsView(model)).toBe('table');
    expect(serializePerspectiveEvents(model)).toBe('view: kalender');
    for (const view of EVENT_VIEWS) {
      expect(effectiveEventsView({ view })).toBe(view);
    }
    expect(effectiveEventsView({ view: null })).toBe('table');
  });
});

describe('events-core — weiche Validierung', () => {
  it('meldet Wert-Hinweise ohne zu blockieren', () => {
    const model = parseOk(
      [
        '| | | Ohne Datum | | | | | | |',
        '| 2026-02-30 | | Defektes Datum | | | | | | |',
        '| 2026-03-01 | 2026-02-01 | Ende vor Beginn | | | | | | |',
        '| 2026-03-01 | 2026-04-31 | Defektes Ende | | | | | | |',
        '| 2026-03-01 | | | fantasie | | | | | |',
      ].join('\n'),
    );
    const hints = validateEventEntries(model.entries);
    expect(hints.map((h) => h.code)).toEqual([
      'missingDate',
      'invalidDate',
      'endBeforeDate',
      'invalidEnd',
      'missingText',
      'unknownCategory',
    ]);
    expect(model.entries).toHaveLength(5);
  });

  it('akzeptiert vollständig gültige Einträge ohne Hinweise', () => {
    const model = parseOk('| 2026-03-01 | 2026-04-30 | Gültig | termin | | | | | |');
    expect(validateEventEntries(model.entries)).toEqual([]);
  });
});

describe('events-core — Fence-Suche', () => {
  it('findet Fences mit korrekten Zeilennummern und Body', () => {
    const text = [
      '# Titel',
      '',
      '```perspective-events',
      '| 2026-01-01 | | A | | | | | | |',
      '```',
      '',
      '```js',
      'code();',
      '```',
      '~~~~perspective-events',
      'view: month',
      '~~~~',
    ].join('\n');
    const fences = findPerspectiveEventsFences(text);
    expect(fences).toHaveLength(2);
    expect(fences[0]).toMatchObject({
      openLine: 3,
      closeLine: 5,
      bodyStartLine: 4,
      bodyEndLine: 4,
    });
    expect(fences[0].body).toBe('| 2026-01-01 | | A | | | | | | |');
    expect(fences[1]).toMatchObject({ openLine: 10, closeLine: 12 });
    expect(fences[1].body).toBe('view: month');
  });

  it('lässt ungeschlossene Fences bis zum Datei-Ende laufen', () => {
    const fences = findPerspectiveEventsFences('```perspective-events\nview: week');
    expect(fences).toHaveLength(1);
    expect(fences[0].body).toBe('view: week');
    expect(fences[0].closeLine).toBe(3);
  });

  it('ignoriert fremde Fences und eingerückte Marker', () => {
    expect(findPerspectiveEventsFences('```js\nx();\n```')).toEqual([]);
    expect(findPerspectiveEventsFences('    ```perspective-events\n    x\n    ```')).toEqual([]);
  });
});

// --- 4T-0513: Sortierung, Filter und Presets -----------------------------------------

function mkEntry(over) {
  return {
    date: '',
    end: '',
    text: '',
    category: '',
    notes: '',
    recurring: false,
    id: null,
    predecessors: [],
    successors: [],
    line: 0,
    ...over,
  };
}

describe('events-core — Ansichts-Sortierung (4T-0513)', () => {
  const entries = [
    mkEntry({ date: '2020-05-01', text: 'Beta', category: 'projekt' }),
    mkEntry({ date: '2026-01-01', text: 'alpha', category: 'termin' }),
    mkEntry({ date: '2020-05-01', text: 'Gamma', category: '' }),
    mkEntry({ date: '', text: 'Delta', category: 'projekt' }),
  ];

  it('sortiert Zeitpunkt absteigend als Referenz-Default, leere Werte ans Ende', () => {
    expect(sortEventIndices(entries, { key: 'date', dir: -1 })).toEqual([1, 0, 2, 3]);
    expect(sortEventIndices(entries, { key: 'date', dir: 1 })).toEqual([0, 2, 1, 3]);
  });

  it('sortiert Text case-insensitiv und Kategorie mit Datum als Zweit-Kriterium', () => {
    expect(sortEventIndices(entries, { key: 'text', dir: 1 })).toEqual([1, 0, 3, 2]);
    // Kategorie 'projekt' doppelt: innerhalb der Gruppe Datum absteigend
    // (Delta ohne Datum hinter Beta).
    expect(sortEventIndices(entries, { key: 'category', dir: 1 })).toEqual([0, 3, 1, 2]);
  });

  it('fällt bei unbekanntem Kriterium auf den Zeitpunkt zurück', () => {
    expect(sortEventIndices(entries, { key: 'unsinn', dir: -1 })).toEqual([1, 0, 2, 3]);
    expect(sortEventIndices([], null)).toEqual([]);
  });
});

describe('events-core — Datumsbereichs-Presets (4T-0513)', () => {
  // 2026-07-15 ist ein Mittwoch (Wochenstart Montag: 13.07. bis 19.07.).
  const TODAY = '2026-07-15';

  it('liefert die festen Bereiche der Referenz', () => {
    expect(datePresetRange('today', TODAY)).toEqual({ from: '2026-07-15', to: '2026-07-15' });
    expect(datePresetRange('thisWeek', TODAY)).toEqual({ from: '2026-07-13', to: '2026-07-19' });
    expect(datePresetRange('thisMonth', TODAY)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(datePresetRange('thisYear', TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(datePresetRange('last7', TODAY)).toEqual({ from: '2026-07-08', to: '2026-07-15' });
    expect(datePresetRange('last30', TODAY)).toEqual({ from: '2026-06-15', to: '2026-07-15' });
    expect(datePresetRange('next7', TODAY)).toEqual({ from: '2026-07-15', to: '2026-07-22' });
    expect(datePresetRange('next30', TODAY)).toEqual({ from: '2026-07-15', to: '2026-08-14' });
    expect(datePresetRange('past', TODAY)).toEqual({ from: '', to: '2026-07-14' });
    expect(datePresetRange('future', TODAY)).toEqual({ from: '2026-07-15', to: '' });
  });

  it('bleibt bei unbekanntem Preset und defektem Stichtag offen', () => {
    expect(datePresetRange('unsinn', TODAY)).toEqual({ from: '', to: '' });
    expect(datePresetRange('today', 'defekt')).toEqual({ from: '', to: '' });
    expect(EVENT_DATE_PRESETS).toHaveLength(10);
  });

  it('verschiebt Monats-Grenzen kalender-korrekt', () => {
    expect(datePresetRange('thisMonth', '2024-02-10')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('defekt', 1)).toBe('');
  });
});

describe('events-core — Filter-Logik (4T-0513)', () => {
  const entries = [
    mkEntry({ date: '2026-07-10', text: 'Meilenstein-Review', category: 'projekt', notes: 'Q3' }),
    mkEntry({ date: '2026-07-20', end: '2026-07-25', text: 'Workshop', category: 'termin' }),
    mkEntry({
      date: '1990-03-10',
      text: 'Geburtstag Anna',
      category: 'geburtstag',
      recurring: true,
    }),
    mkEntry({ date: '2026-08-01', text: 'Ohne Kategorie-Eintrag' }),
    mkEntry({ date: 'defekt', text: 'Kaputtes Datum', category: 'projekt' }),
  ];
  const spec = (over) => ({ ...emptyFilterSpec(), ...over });

  it('filtert nach Kategorien inklusive „Ohne Kategorie"', () => {
    expect(filterEventIndices(entries, spec({ categories: ['projekt'] }))).toEqual([0, 4]);
    expect(filterEventIndices(entries, spec({ categories: ['none'] }))).toEqual([3]);
    expect(filterEventIndices(entries, spec({ categories: ['none', 'termin'] }))).toEqual([1, 3]);
  });

  it('filtert nach Datumsbereich; ungültige Daten fallen bei aktivem Bereich heraus', () => {
    expect(filterEventIndices(entries, spec({ from: '2026-07-01', to: '2026-07-31' }))).toEqual([
      0, 1,
    ]);
    expect(filterEventIndices(entries, spec({ from: '2026-07-15' }))).toEqual([1, 3]);
    expect(filterEventIndices(entries, spec({ to: '2000-01-01' }))).toEqual([2]);
  });

  it('filtert über die Zusatzfilter Notizen, Wiederkehr und Zeitspanne', () => {
    expect(filterEventIndices(entries, spec({ notes: true }))).toEqual([0]);
    expect(filterEventIndices(entries, spec({ recurring: true }))).toEqual([2]);
    expect(filterEventIndices(entries, spec({ timespan: true }))).toEqual([1]);
  });

  it('sucht Volltext über Text, Notizen, Datum und Kategorie-Label', () => {
    expect(filterEventIndices(entries, spec({ text: 'q3' }))).toEqual([0]);
    expect(filterEventIndices(entries, spec({ text: '1990-03' }))).toEqual([2]);
    // Technischer Kategorie-Wert zählt ohne Resolver …
    expect(filterEventIndices(entries, spec({ text: 'termin' }))).toEqual([1]);
    // … mit Resolver zusätzlich das lokalisierte Label.
    const labels = { projekt: 'Projekt-Vorhaben' };
    expect(
      filterEventIndices(entries, spec({ text: 'vorhaben' }), {
        categoryLabel: (c) => labels[c] || c,
      }),
    ).toEqual([0, 4]);
  });

  it('kombiniert Kriterien als UND-Verknüpfung und zählt aktive Kriterien', () => {
    const combined = spec({ categories: ['projekt'], from: '2026-01-01', text: 'review' });
    expect(filterEventIndices(entries, combined)).toEqual([0]);
    expect(eventFilterActiveCount(combined)).toBe(3);
    expect(eventFilterActiveCount(emptyFilterSpec())).toBe(0);
    expect(eventFilterActiveCount(spec({ notes: true, recurring: true, timespan: true }))).toBe(3);
    expect(matchesEventFilter(entries[0], null)).toBe(true);
  });
});

// --- 4T-0514: Ansichts-Datenaufbereitung ----------------------------------------------

describe('events-core — Ansichts-Datenaufbereitung (4T-0514)', () => {
  const TODAY = '2026-07-15';
  const entries = [
    mkEntry({ date: '2026-07-20', text: 'Workshop', category: 'termin' }),
    mkEntry({
      date: '1990-03-10',
      text: 'Geburtstag Anna',
      category: 'geburtstag',
      recurring: true,
    }),
    mkEntry({ date: '2023-10-19', text: 'Tausend Tage', category: 'projekt' }),
    mkEntry({ date: '2026-07-30', end: '2026-08-02', text: 'Spannen-Termin', category: 'termin' }),
    mkEntry({ date: '', text: 'Ohne Zeitpunkt' }),
    mkEntry({ date: '2001-07-20', text: 'Bald 25 Jahre', category: 'jubilaeum' }),
  ];
  const all = entries.map((_, i) => i);

  it('sammelt anstehende Ereignisse inklusive Jahres-Wiederkehr', () => {
    expect(upcomingEventOccurrences(entries, all, TODAY, 10)).toEqual([
      { index: 0, dateIso: '2026-07-20', inDays: 5, occurrence: false },
      { index: 3, dateIso: '2026-07-30', inDays: 15, occurrence: false },
      { index: 1, dateIso: '2027-03-10', inDays: 238, occurrence: true },
    ]);
    expect(upcomingEventOccurrences(entries, all, TODAY, 2)).toHaveLength(2);
    expect(upcomingEventOccurrences(entries, all, 'defekt', 10)).toEqual([]);
  });

  it('findet erreichte und nahende Meilensteine in geschlossener Form', () => {
    expect(upcomingEventMilestones(entries, all, TODAY, 30)).toEqual([
      { index: 2, kind: 'days', value: 1000, inDays: 0 },
      { index: 5, kind: 'months', value: 300, inDays: 5 },
      { index: 5, kind: 'years', value: 25, inDays: 5 },
      { index: 5, kind: 'jubilee', value: 25, inDays: 5 },
      // Anna: 1990-03-10 liegt 13276 Tage zurück, in 24 Tagen sind es
      // exakt 1900 Wochen.
      { index: 1, kind: 'weeks', value: 1900, inDays: 24 },
    ]);
    // Enger Horizont blendet die nahenden aus, der erreichte bleibt.
    expect(upcomingEventMilestones(entries, all, TODAY, 3)).toEqual([
      { index: 2, kind: 'days', value: 1000, inDays: 0 },
    ]);
  });

  it('zählt Kategorien in fester Reihenfolge mit Ohne-Kategorie am Ende', () => {
    expect(categoryCounts(entries, all)).toEqual([
      { category: 'geburtstag', count: 1 },
      { category: 'jubilaeum', count: 1 },
      { category: 'projekt', count: 1 },
      { category: 'termin', count: 2 },
      { category: '', count: 1 },
    ]);
  });

  it('gruppiert die Timeline chronologisch nach Jahr und Monat', () => {
    const groups = timelineGroups(entries, all);
    expect(groups.map((g) => g.year)).toEqual([1990, 2001, 2023, 2026]);
    expect(groups[0].months).toEqual([
      { monthIndex: 2, items: [{ index: 1, dateIso: '1990-03-10' }] },
    ]);
    expect(groups[3].months).toEqual([
      {
        monthIndex: 6,
        items: [
          { index: 0, dateIso: '2026-07-20' },
          { index: 3, dateIso: '2026-07-30' },
        ],
      },
    ]);
  });

  it('belegt Kalender-Tage mit Einzel-Terminen und Spannen-Balken', () => {
    const map = calendarDayMap(entries, [3], '2026-07-27', '2026-08-09');
    expect(map.get('2026-07-30')).toEqual([{ index: 3, kind: 'start' }]);
    expect(map.get('2026-07-31')).toEqual([{ index: 3, kind: 'mid' }]);
    expect(map.get('2026-08-01')).toEqual([{ index: 3, kind: 'mid' }]);
    expect(map.get('2026-08-02')).toEqual([{ index: 3, kind: 'end' }]);
    expect(map.has('2026-08-03')).toBe(false);
    const single = calendarDayMap(entries, [0], '2026-07-20', '2026-07-26');
    expect(single.get('2026-07-20')).toEqual([{ index: 0, kind: 'single' }]);
    expect(calendarDayMap(entries, all, 'defekt', '2026-08-01').size).toBe(0);
  });
});

// --- 4T-0516: Verknüpfungen ------------------------------------------------------------

describe('events-core — Verknüpfungen (4T-0516)', () => {
  it('vergibt die nächste freie Kennung deterministisch', () => {
    expect(nextEventId([])).toBe('e1');
    expect(nextEventId([mkEntry({ id: 'e1' }), mkEntry({ id: 'e3' })])).toBe('e2');
  });

  it('verknüpft bidirektional und vergibt Kennungen erst bei der ersten Verknüpfung', () => {
    const entries = [
      mkEntry({ text: 'A' }),
      mkEntry({ text: 'B' }),
      mkEntry({ text: 'C', id: 'e7' }),
    ];
    expect(toggleEventLink(entries, 0, 1, 'predecessor')).toBe(true);
    expect(entries[0].id).toBe('e1');
    expect(entries[1].id).toBe('e2');
    expect(entries[0].predecessors).toEqual(['e2']);
    expect(entries[1].successors).toEqual(['e1']);
    // Zweiter Toggle löst die Verknüpfung wieder (Kennungen bleiben).
    expect(toggleEventLink(entries, 0, 1, 'predecessor')).toBe(true);
    expect(entries[0].predecessors).toEqual([]);
    expect(entries[1].successors).toEqual([]);
    expect(entries[0].id).toBe('e1');
    // Nachfolger-Richtung und Selbst-Verknüpfung.
    expect(toggleEventLink(entries, 0, 2, 'successor')).toBe(true);
    expect(entries[0].successors).toEqual(['e7']);
    expect(entries[2].predecessors).toEqual(['e1']);
    expect(toggleEventLink(entries, 0, 0, 'successor')).toBe(false);
  });

  it('bereinigt beim Löschen die Bezüge beider Seiten', () => {
    const entries = [mkEntry({ text: 'A' }), mkEntry({ text: 'B' }), mkEntry({ text: 'C' })];
    toggleEventLink(entries, 0, 1, 'successor');
    toggleEventLink(entries, 2, 1, 'predecessor');
    const removedId = entries[1].id;
    entries.splice(1, 1);
    cleanupEventLinks(entries, removedId);
    expect(entries[0].successors).toEqual([]);
    expect(entries[1].predecessors).toEqual([]);
  });

  it('löst Bezüge zur Anzeige auf und meldet verwaiste Kennungen', () => {
    const entries = [
      mkEntry({ text: 'A', id: 'e1', predecessors: ['e2', 'weg'], successors: [] }),
      mkEntry({ text: 'B', id: 'e2', successors: ['e1'] }),
    ];
    const links = eventLinksOf(entries, 0);
    expect(links.predecessors).toEqual([
      { id: 'e2', index: 1, label: 'B', broken: false },
      { id: 'weg', index: -1, label: 'weg', broken: true },
    ]);
    expect(eventLinksOf(entries, 1).successors[0]).toMatchObject({ index: 0, label: 'A' });
  });

  it('rundet Kennungen und Bezugs-Listen verlustfrei durch das Fence-Format', () => {
    const entries = [
      mkEntry({ date: '2026-01-01', text: 'A' }),
      mkEntry({ date: '2026-01-02', text: 'B' }),
    ];
    toggleEventLink(entries, 0, 1, 'successor');
    const body = serializePerspectiveEvents({
      view: null,
      savedFilters: [],
      query: null,
      entries,
      errors: [],
    });
    const re = parseOk(body);
    expect(re.entries[0].id).toBe('e1');
    expect(re.entries[0].successors).toEqual(['e2']);
    expect(re.entries[1].predecessors).toEqual(['e1']);
  });
});
