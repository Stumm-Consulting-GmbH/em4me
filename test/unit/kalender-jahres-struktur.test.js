// 4T-002363 (Epic 3E-000333): Baustein «Jahres-Struktur je Jahr» — Schnittstelle
// der Regeln und Tafeln (calendar-yearly.js) mit Probe-Regel und Probe-Tafel aus
// test/fixtures/kalender-jahres-struktur/. Die Fälle zum Rechen-Kern, zur
// Oberfläche und zu den Einstellungen kommen mit den Schritten 3 bis 9 hinzu.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import probeRegel from '../fixtures/kalender-jahres-struktur/probe-regel.js';
import probeTafel from '../fixtures/kalender-jahres-struktur/probe-tafel.js';

// Kern und Schnittstelle über den CommonJS-Lader der Laufzeit: Der Kern lädt
// calendar-yearly.js mit require, und der Prüf-Zugang wirkt nur auf genau
// diese Instanz. Ein ESM-Import gäbe der Prüfdatei eine zweite.
const require = createRequire(import.meta.url);
const {
  YEARLY_AXIS_ORIGIN,
  readYearTable,
  resolveYearlySource,
  setYearlySourcesForTests,
  yearlySourceNames,
} = require('../../src/shared/calendar/calendar-yearly.js');
const {
  axisToTuple,
  compileSafe,
  convertBetween,
  convertInBlock,
  cycleAt,
  epochOf,
  formatTuple,
  levelPositionCount,
  normalizeLevels,
  parseCanonical,
  segmentRanges,
  tupleToAxis,
  validateTuple,
} = require('../../src/shared/calendar/calendar-core.js');
const {
  calendarStartPoint,
  configForPersist,
  deriveCalendar,
  normalizeCalendarConfig,
} = require('../../src/shared/calendar/calendar-config.js');
const {
  blockEquivalents,
  EQUIVALENT_UNKNOWN,
} = require('../../src/shared/calendar/calendar-convert.js');
const { CALENDAR_TEMPLATES } = require('../../src/shared/calendar/calendar-templates.js');
const { createGregorianTemplate } = require('../../src/shared/calendar/calendar-template.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODUL = path.resolve(HERE, '..', '..', 'src', 'shared', 'calendar', 'calendar-yearly.js');
const REGEL_HEBRAEISCH = path.join(path.dirname(MODUL), 'calendar-rule-hebrew.js');
const TAFEL_PERSISCH = path.join(path.dirname(MODUL), 'year-tables', 'persian.js');
const TAFEL_CHINESISCH = path.join(path.dirname(MODUL), 'year-tables', 'chinese.js');
const TAFEL_UMM_AL_QURA = path.join(path.dirname(MODUL), 'year-tables', 'islamic-umalqura.js');

const PROBEN = { rules: { probe: probeRegel }, tables: { probe: probeTafel } };
const tafelMit = (aenderung) => ({ ...probeTafel, ...aenderung });

afterEach(() => setYearlySourcesForTests(null));

describe('Jahres-Struktur: Liste des Programms und Prüf-Zugang (4T-002363)', () => {
  // 4T-002005: Die Liste des Programms trägt seither die hebräische Regel,
  // 4T-002007 die persische Tafel, 4T-002006 die chinesische, 4T-002008 die
  // nach Umm al-Qura.
  it('die Liste des Programms enthält die Regel hebrew und die Tafeln persian, chinese und islamic-umalqura', () => {
    expect(yearlySourceNames()).toEqual({
      rules: ['hebrew'],
      tables: ['persian', 'chinese', 'islamic-umalqura'],
    });
    expect(resolveYearlySource({ type: 'yearly', rule: 'hebrew' }).kind).toBe('rule');
    expect(resolveYearlySource({ type: 'yearly', table: 'persian' }).kind).toBe('table');
    expect(resolveYearlySource({ type: 'yearly', table: 'chinese' }).kind).toBe('table');
    expect(resolveYearlySource({ type: 'yearly', table: 'islamic-umalqura' }).kind).toBe('table');
    expect(resolveYearlySource({ type: 'yearly', table: 'probe' })).toBe(null);
    expect(resolveYearlySource({ type: 'yearly', rule: 'probe' })).toBe(null);
  });

  it('der Prüf-Zugang hängt Proben ein, null stellt die Liste des Programms wieder her', () => {
    setYearlySourcesForTests(PROBEN);
    expect(yearlySourceNames()).toEqual({ rules: ['probe'], tables: ['probe'] });
    expect(resolveYearlySource({ type: 'yearly', table: 'probe' }).kind).toBe('table');
    expect(resolveYearlySource({ type: 'yearly', rule: 'probe' }).kind).toBe('rule');
    setYearlySourcesForTests(null);
    expect(resolveYearlySource({ type: 'yearly', table: 'probe' })).toBe(null);
  });

  it('ein unbekannter Name liefert keine Quelle', () => {
    setYearlySourcesForTests(PROBEN);
    expect(resolveYearlySource({ type: 'yearly', table: 'gibt-es-nicht' })).toBe(null);
    expect(resolveYearlySource({ type: 'yearly', rule: 'toString' })).toBe(null);
    expect(resolveYearlySource({ type: 'lengths', table: [30] })).toBe(null);
  });

  it('der Ursprung der eigenen Achse ist der 01.01. des gregorianischen Jahres 0 (Rata Die −365)', () => {
    expect(YEARLY_AXIS_ORIGIN).toBe(-365n);
  });
});

describe('Jahres-Struktur: Leser der Tafel-Form (4T-002363)', () => {
  it('liest Kopf, Zeilen, Schaltmonat und Jahresbeginne', () => {
    const t = readYearTable(probeTafel);
    expect([t.firstYear, t.lastYear, t.namensStellen]).toEqual([4700, 4703, 24]);
    expect(t.starts).toEqual([730155n, 730509n, 730893n, 731248n, 731602n]);
    const schaltjahr = t.years[1];
    expect(schaltjahr).toHaveLength(13);
    // Der Schaltmonat folgt dem 4. Monat: Kennung «04L», Namens-Stelle 12 + 4 − 1.
    expect(schaltjahr[4]).toEqual({ length: 29, slot: 15, number: 4, leap: true });
    expect(schaltjahr[3]).toEqual({ length: 29, slot: 3, number: 4, leap: false });
    expect(schaltjahr[5]).toEqual({ length: 30, slot: 4, number: 5, leap: false });
    expect(schaltjahr[12]).toEqual({ length: 30, slot: 11, number: 12, leap: false });
  });

  it.each([
    ['Zeile mit Buchstaben', { jahre: ['30,29x,30'] }],
    ['Monat mit null Tagen', { jahre: ['30,0,30'] }],
    ['Schaltmonat am Jahresanfang', { jahre: ['29L,30,29'] }],
    ['zwei Schaltmonate hintereinander', { jahre: ['30,29L,29L,30'] }],
    ['leere Zeile', { jahre: ['29,30', ''] }],
    ['Zeile ist keine Zeichenkette', { jahre: [[29, 30]] }],
    ['keine Zeilen', { jahre: [] }],
    ['Namens-Stelle jenseits der Namens-Stellen', { namensStellen: 12 }],
    ['erstes Jahr keine ganze Zahl', { ersteJahr: 4700.5 }],
    ['erster Tag fehlt', { ersterTag: undefined }],
    ['Name fehlt', { name: '' }],
  ])('weist eine unlesbare Tafel ab: %s', (_, aenderung) => {
    expect(readYearTable(tafelMit(aenderung))).toBe(null);
  });

  it('eine unlesbare Tafel lässt sich nicht auflösen; ihr Name muss zum Verweis passen', () => {
    setYearlySourcesForTests({
      tables: { kaputt: tafelMit({ name: 'kaputt', jahre: ['30,x'] }), anders: probeTafel },
    });
    expect(resolveYearlySource({ type: 'yearly', table: 'kaputt' })).toBe(null);
    expect(resolveYearlySource({ type: 'yearly', table: 'anders' })).toBe(null);
  });
});

describe('Jahres-Struktur: Auskunft je Jahr und Geltungs-Zeitraum (4T-002363)', () => {
  it('Tafel: Zeitraum aus ganzen Jahren, erster und letzter Tag, davor und danach nichts', () => {
    setYearlySourcesForTests(PROBEN);
    const q = resolveYearlySource({ type: 'yearly', table: 'probe' });
    expect(q.range).toEqual({
      firstYear: 4700,
      lastYear: 4703,
      firstDay: 730155n,
      endDay: 731602n,
    });
    expect(q.yearOfDay(730155n)).toBe(4700n);
    expect(q.yearOfDay(730154n)).toBe(null);
    expect(q.yearOfDay(731601n)).toBe(4703n);
    expect(q.yearOfDay(731602n)).toBe(null);
    expect(q.yearInfo(4699)).toBe(null);
    expect(q.yearInfo(4704)).toBe(null);
    expect(q.yearInfo(4701)).toMatchObject({ year: 4701n, start: 730509n, length: 384n });
    expect([q.maxMonths, q.maxLength, q.namensStellen]).toEqual([13, 30, 24]);
  });

  it('Tafel und Regel: aufeinanderfolgende Jahre ohne fehlenden oder doppelten Tag', () => {
    setYearlySourcesForTests(PROBEN);
    const tafel = resolveYearlySource({ type: 'yearly', table: 'probe' });
    const regel = resolveYearlySource({ type: 'yearly', rule: 'probe' });
    const pruefe = (q, von, bis) => {
      const arten = new Set();
      for (let y = von; y < bis; y++) {
        const a = q.yearInfo(y);
        const b = q.yearInfo(y + 1);
        expect(a.start + a.length, `Jahr ${y}`).toBe(b.start);
        const summe = a.months.reduce((s, m) => s + BigInt(m.length), 0n);
        expect(summe).toBe(a.length);
        expect(q.yearOfDay(a.start)).toBe(BigInt(y));
        expect(q.yearOfDay(b.start - 1n)).toBe(BigInt(y));
        arten.add(`${a.months.length}/${a.length}`);
      }
      return arten;
    };
    expect(pruefe(tafel, 4700, 4703)).toEqual(new Set(['12/354', '13/384', '12/355']));
    // Die Regel über zwei volle Zyklen, über das Jahr 0 hinweg.
    expect(pruefe(regel, -40, 40)).toEqual(new Set(['12/354', '12/355', '13/384', '13/385']));
  });

  it('Regel: verschobener Jahresbeginn und Schaltmonat mit Kennung', () => {
    setYearlySourcesForTests(PROBEN);
    const q = resolveYearlySource({ type: 'yearly', rule: 'probe' });
    expect(q.range).toBe(null);
    expect(q.yearInfo(0).start).toBe(730155n);
    // Jahr 2 ist ein Schaltjahr: nach dem 6. Monat der Schaltmonat «06L».
    const j2 = q.yearInfo(2).months;
    expect(j2).toHaveLength(13);
    expect(j2[6]).toEqual({ length: 30, slot: 12, number: 6, leap: true });
    // Das Jahr 0 ist durch 3 teilbar und hat 355 Tage; das Jahr 1 beginnt damit
    // zehn Tage früher im Sonnenjahr als das Jahr 0 (verschobener Jahresbeginn).
    expect(q.yearInfo(1).start - q.yearInfo(0).start).toBe(355n);
  });

  it('Regel: in sehr fernen Jahren exakt (keine Rundung, BigInt)', () => {
    setYearlySourcesForTests(PROBEN);
    const q = resolveYearlySource({ type: 'yearly', rule: 'probe' });
    for (const y of [10n ** 15n, -(10n ** 15n), 2n ** 53n - 2n, -(2n ** 53n) + 1n]) {
      const a = q.yearInfo(y);
      const b = q.yearInfo(y + 1n);
      expect(a.start + a.length).toBe(b.start);
      expect(q.yearOfDay(a.start)).toBe(y);
      expect(q.yearOfDay(a.start - 1n)).toBe(y - 1n);
      expect(q.yearOfDay(b.start - 1n)).toBe(y);
    }
    // 19 Jahre haben in jeder Lage sieben Schaltmonate und sechs oder sieben
    // lange Jahre: 19 × 354 + 7 × 30 + 6 oder 7 Tage.
    const zyklus = (y) => q.yearInfo(y + 19n).start - q.yearInfo(y).start;
    for (const y of [0n, 1n, 10n ** 15n, -(10n ** 15n) + 2n, 2n ** 53n - 40n]) {
      expect([6942n, 6943n]).toContain(zyklus(y));
    }
  });

  it('eine ausgetauschte Tafel wirkt unter demselben Namen ohne weiteres Zutun (Verweis, B3)', () => {
    setYearlySourcesForTests(PROBEN);
    expect(resolveYearlySource({ type: 'yearly', table: 'probe' }).range.lastYear).toBe(4703);
    const verlaengert = tafelMit({
      jahre: [...probeTafel.jahre, '30,29,30,29,30,29,30,29,30,29,30,29'],
    });
    setYearlySourcesForTests({ tables: { probe: verlaengert } });
    expect(resolveYearlySource({ type: 'yearly', table: 'probe' }).range.lastYear).toBe(4704);
  });
});

describe('Jahres-Struktur: keine Laufzeit-Kalender und kein Netz (4T-002363, Story AK6)', () => {
  // 4T-002005: Das Modul lädt allein Regel-Module calendar-rule-<Name>.js und
  // (4T-002007) erzeugte Tafeln year-tables/<Name>.js; Regel und Tafel selbst
  // laden nichts. «Intl» nennt der Kopf-Kommentar der Tafel als Herkunft;
  // geprüft wird der Code ohne Kommentarzeilen.
  it('das Modul ruft weder Intl noch das Netz auf und lädt allein Regeln und Tafeln', () => {
    const ohneKommentare = (datei) =>
      fs
        .readFileSync(datei, 'utf8')
        .split('\n')
        .filter((z) => !z.trim().startsWith('//'))
        .join('\n');
    const quelle = ohneKommentare(MODUL);
    expect(quelle).not.toMatch(/\bIntl\b/);
    const aufrufe = quelle.match(/\brequire\s*\([^)]*\)/g) || [];
    expect(aufrufe).toEqual([
      "require('./calendar-rule-hebrew.js')",
      "require('./year-tables/persian.js')",
      "require('./year-tables/chinese.js')",
      "require('./year-tables/islamic-umalqura.js')",
    ]);
    for (const aufruf of aufrufe) {
      expect(aufruf).toMatch(/^require\('\.\/(calendar-rule-|year-tables\/)[a-z-]+\.js'\)$/);
    }
    expect(quelle).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|https?:)/);
    const regel = ohneKommentare(REGEL_HEBRAEISCH);
    expect(regel).not.toMatch(/\bIntl\b/);
    expect(regel).not.toMatch(/\brequire\s*\(/);
    expect(regel).not.toMatch(/\bimport\b/);
    expect(regel).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|https?:)/);
    // 4T-002006: ebenso die chinesische Tafel, die aus einer Bibliothek erzeugt ist;
    // 4T-002008: und die Tafel nach Umm al-Qura.
    for (const datei of [TAFEL_PERSISCH, TAFEL_CHINESISCH, TAFEL_UMM_AL_QURA]) {
      const tafel = ohneKommentare(datei);
      expect(tafel, datei).not.toMatch(/\bIntl\b/);
      expect(tafel, datei).not.toMatch(/\brequire\s*\(/);
      expect(tafel, datei).not.toMatch(/\bimport\b/);
      expect(tafel, datei).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|https?:)/);
    }
  });

  it('auch der Rechen-Kern mit seinen Weichen ruft weder Intl noch das Netz auf', () => {
    const kern = fs
      .readFileSync(path.join(path.dirname(MODUL), 'calendar-core.js'), 'utf8')
      .split('\n')
      .filter((z) => !z.trim().startsWith('//'))
      .join('\n');
    expect(kern).toMatch(/yearlyApi\./);
    expect(kern).not.toMatch(/\bIntl\b/);
    expect(kern).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|https?:)/);
  });
});

// --- Schritt 3: Einlesen, Aufbau-Regeln, Namens-Stellen, Kompilat --------------------------

// Wirbelsäule einer Zeitrechnung mit Jahres-Struktur (kleinste Ebene zuerst):
// Sekunde, Minute, Stunde, Tag, Monat (byYear), Jahr (yearly).
function wirbelsaeule(jahresRel, aenderung = {}) {
  const levels = [
    { id: 'second', name: 'Sekunde', section: 'Zeit', start: 0 },
    { id: 'minute', name: 'Minute', section: 'Zeit', start: 0, rel: { type: 'factor', count: 60 } },
    { id: 'hour', name: 'Stunde', section: 'Zeit', start: 0, rel: { type: 'factor', count: 60 } },
    { id: 'day', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 24 } },
    {
      id: 'month',
      name: 'Monat',
      section: 'Datum',
      start: 1,
      names: ['Eins', 'Zwei', 'Drei'],
      rel: { type: 'byYear' },
    },
    { id: 'year', name: 'Jahr', section: 'Datum', start: 1, rel: jahresRel },
  ];
  for (const [i, rel] of Object.entries(aenderung)) levels[i] = { ...levels[i], rel };
  return levels;
}

describe('Jahres-Struktur: Einlesen und Aufbau-Regeln im Kern (4T-002363, Schritt 3)', () => {
  it('liest beide Beziehungs-Arten wörtlich und bringt die Monats-Namen auf die Namens-Stellen', () => {
    setYearlySourcesForTests(PROBEN);
    const regel = normalizeLevels(wirbelsaeule({ type: 'yearly', rule: 'probe' }));
    expect(regel[5].rel).toEqual({ type: 'yearly', rule: 'probe' });
    expect(regel[4].rel).toEqual({ type: 'byYear' });
    expect(regel[4].names).toHaveLength(13);
    expect(regel[4].names.slice(0, 4)).toEqual(['Eins', 'Zwei', 'Drei', null]);
    const tafel = normalizeLevels(wirbelsaeule({ type: 'yearly', table: 'probe' }));
    expect(tafel[5].rel).toEqual({ type: 'yearly', table: 'probe' });
    expect(tafel[4].names).toHaveLength(24);
    // Unter dem Monat keine feste Zahl: die Namens-Liste des Tags bliebe, wie sie ist.
    expect(levelPositionCount(tafel, 3)).toBe(null);
    expect(levelPositionCount(tafel, 4)).toBe(24);
  });

  it.each([
    ['unbekannter Name', { 5: { type: 'yearly', table: 'gibt-es-nicht' } }],
    ['Regel und Tafel zugleich', { 5: { type: 'yearly', rule: 'probe', table: 'probe' } }],
    ['weder Regel noch Tafel', { 5: { type: 'yearly' } }],
    ['Jahres-Beziehung ohne Monats-Beziehung', { 4: { type: 'factor', count: 12 } }],
    ['Monats-Beziehung ohne Jahres-Beziehung', { 5: { type: 'factor', count: 10 } }],
    ['Jahres-Beziehung nicht oben', { 4: { type: 'yearly', rule: 'probe' } }],
    ['Längen-Tabelle unter dem Monat', { 3: { type: 'lengths', table: [24, 24] } }],
    [
      'Schalt-Regel unter dem Monat',
      { 3: { type: 'leap', count: 24, rules: [{ cycle: 4 }], targetIndex: 0, extra: 1 } },
    ],
  ])('Aufbau-Regel verletzt, die Zeitrechnung ist defekt: %s', (_, aenderung) => {
    setYearlySourcesForTests(PROBEN);
    expect(normalizeLevels(wirbelsaeule({ type: 'yearly', rule: 'probe' }, aenderung))).toBe(null);
  });

  it('Monat direkt über dem Tag ohne Zeit-Ebenen ist zulässig, ein Jahr nur über dem Monat nicht', () => {
    setYearlySourcesForTests(PROBEN);
    const ohneZeit = wirbelsaeule({ type: 'yearly', rule: 'probe' }).slice(3);
    delete ohneZeit[0].rel;
    expect(normalizeLevels(ohneZeit)).not.toBe(null);
    const zuKurz = ohneZeit.slice(1);
    delete zuKurz[0].rel;
    expect(normalizeLevels(zuKurz)).toBe(null);
  });

  it('ohne eingehängte Quelle ist eine Zeitrechnung mit unbekanntem Namen defekt', () => {
    expect(normalizeLevels(wirbelsaeule({ type: 'yearly', table: 'probe' }))).toBe(null);
  });

  it('Kompilat: Lage der Jahres-Struktur, Tages-Einheit und Stellen-Breiten aus den Höchstwerten', () => {
    setYearlySourcesForTests(PROBEN);
    const c = compileSafe({
      levels: normalizeLevels(wirbelsaeule({ type: 'yearly', table: 'probe' })),
    });
    expect([c.yearly.iMonth, c.yearly.iDay, c.iIrrFirst, c.iYear]).toEqual([4, 3, 4, 5]);
    expect(c.unitLen[3]).toBe(86400n);
    expect(c.unitLen[4]).toBe(null);
    expect(c.yearly.source.kind).toBe('table');
    expect(c.widths).toEqual([2, 2, 2, 2, 2, 0]);
    // Eine Definition ohne Jahres-Struktur kompiliert ohne diesen Teil.
    const ohne = compileSafe({
      levels: normalizeLevels(
        wirbelsaeule({ type: 'factor', count: 12 }, { 4: { type: 'factor', count: 30 } }),
      ),
    });
    expect(ohne.yearly).toBe(undefined);
  });
});

// --- Schritt 4: Datum → Achse, Stellen je Ebene, Gültigkeit ------------------------------

// Zeitrechnung aus der Wirbelsäule, ohne Normalisierung der Sektion (Anker,
// Zeitalter und Wochen kommen mit Schritt 6).
function zeitrechnung(jahresRel) {
  return { id: 'probe', levels: normalizeLevels(wirbelsaeule(jahresRel)) };
}
const tag = (jahr, monat, t, h = 0) => [jahr, monat, t, h, 0, 0];
// Achse in Sekunden ab dem 01.01. des gregorianischen Jahres 0 zu einem Rata-Die-Tag.
const achseVon = (rd) => (rd + 365n) * 86400n;

describe('Jahres-Struktur: Datum → Achse und Gültigkeit (4T-002363, Schritt 4)', () => {
  it('Tafel: erster Tag des Zeitraums auf der gemeinsamen Tages-Achse der Vorlagen', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', table: 'probe' });
    expect(tupleToAxis(cal, tag(4700, 1, 1))).toBe(achseVon(730155n));
    // Dieselbe Stelle hat der 05.02.2000 in der gregorianischen Vorlage (Anker im Jahr 0).
    const greg = normalizeCalendarConfig({
      blocks: [{ id: 'b', calendars: [{ ...createGregorianTemplate({}), id: 'g' }] }],
    }).blocks[0].calendars[0];
    expect(tupleToAxis(greg, [2000, 2, 5, 0, 0, 0])).toBe(achseVon(730155n));
  });

  it('Tafel: Schaltmonat als zusätzliche Stelle, Rest über die festen Faktoren', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', table: 'probe' });
    // 4701: Monate 30, 29, 30, 29, dann der Schaltmonat «04L» an der 5. Stelle.
    expect(tupleToAxis(cal, tag(4701, 5, 1))).toBe(achseVon(730509n + 118n));
    expect(tupleToAxis(cal, tag(4701, 13, 30, 23))).toBe(achseVon(730893n - 1n) + 23n * 3600n);
  });

  it('Gültigkeit: außerhalb des Zeitraums «nicht bekannt», innerhalb die Längen des Jahres', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', table: 'probe' });
    expect(validateTuple(cal, tag(4699, 12, 30))).toEqual({ ok: false, code: 'unknown' });
    expect(validateTuple(cal, tag(4704, 1, 1))).toEqual({ ok: false, code: 'unknown' });
    expect(tupleToAxis(cal, tag(4704, 1, 1))).toBe(null);
    expect(validateTuple(cal, tag(4700, 13, 1))).toMatchObject({
      code: 'segmentRange',
      levelId: 'month',
    });
    expect(validateTuple(cal, tag(4701, 13, 1)).ok).toBe(true);
    expect(validateTuple(cal, tag(4700, 1, 30))).toMatchObject({
      code: 'segmentRange',
      levelId: 'day',
    });
    expect(validateTuple(cal, tag(4700, 2, 30)).ok).toBe(true);
    expect(validateTuple(cal, tag(4702, 1, 30)).ok).toBe(true);
    expect(validateTuple(cal, tag(4700, 1, 1, 24))).toMatchObject({
      code: 'segmentRange',
      levelId: 'hour',
    });
  });

  it('Regel: ohne Grenze, in sehr fernen Jahren exakt', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', rule: 'probe' });
    const q = resolveYearlySource({ type: 'yearly', rule: 'probe' });
    for (const jahr of [0, 1, -1, 10 ** 15, -(10 ** 15), Number.MAX_SAFE_INTEGER - 1]) {
      const beginn = q.yearInfo(jahr).start;
      expect(tupleToAxis(cal, tag(jahr, 1, 1))).toBe(achseVon(beginn));
    }
    // Jahr 2 hat den Schaltmonat nach dem 6. Monat: 13 Stellen, die 7. hat 30 Tage.
    expect(validateTuple(cal, tag(2, 13, 29)).ok).toBe(true);
    expect(validateTuple(cal, tag(1, 13, 1))).toMatchObject({ code: 'segmentRange' });
  });
});

// --- Schritt 5: Achse → Datum, Wertebereiche ----------------------------------------------

describe('Jahres-Struktur: Achse → Datum und Wertebereiche (4T-002363, Schritt 5)', () => {
  it('Tafel: jeder Tag des Zeitraums hin und zurück, ohne fehlenden oder doppelten Tag', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', table: 'probe' });
    let vorher = null;
    let tage = 0;
    for (let a = achseVon(730155n); a < achseVon(731602n); a += 86400n) {
      const t = axisToTuple(cal, a + 3600n * 5n);
      expect(t[3]).toBe(5);
      expect(tupleToAxis(cal, t)).toBe(a + 3600n * 5n);
      if (vorher) {
        const gleichesJahr = t[0] === vorher[0];
        const gleicherMonat = gleichesJahr && t[1] === vorher[1];
        if (gleicherMonat) expect(t[2]).toBe(vorher[2] + 1);
        else expect(t[2]).toBe(1);
        if (!gleichesJahr) expect([t[0], t[1]]).toEqual([vorher[0] + 1, 1]);
      }
      vorher = t;
      tage++;
    }
    expect(tage).toBe(731602 - 730155);
  });

  it('Tafel: erster und letzter Tag liefern ein Datum, der Tag davor und danach keines', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', table: 'probe' });
    expect(axisToTuple(cal, achseVon(730155n))).toEqual(tag(4700, 1, 1));
    expect(axisToTuple(cal, achseVon(730155n) - 1n)).toBe(null);
    expect(axisToTuple(cal, achseVon(731602n) - 1n)).toEqual([4703, 12, 30, 23, 59, 59]);
    expect(axisToTuple(cal, achseVon(731602n))).toBe(null);
  });

  it('Regel: hin und zurück über Jahres- und Schaltmonats-Grenzen und in fernen Jahren', () => {
    setYearlySourcesForTests(PROBEN);
    const cal = zeitrechnung({ type: 'yearly', rule: 'probe' });
    const q = resolveYearlySource({ type: 'yearly', rule: 'probe' });
    for (let a = achseVon(q.yearInfo(-3).start); a < achseVon(q.yearInfo(4).start); a += 86400n) {
      expect(tupleToAxis(cal, axisToTuple(cal, a))).toBe(a);
    }
    for (const jahr of [10 ** 15, -(10 ** 15)]) {
      const a = achseVon(q.yearInfo(jahr).start);
      expect(axisToTuple(cal, a)).toEqual(tag(jahr, 1, 1));
      expect(axisToTuple(cal, a - 1n)[0]).toBe(jahr - 1);
    }
    // Jenseits von ±2^53 Jahren kein Datum (Grenze des Modells).
    const ganzOben = achseVon(q.yearInfo(Number.MAX_SAFE_INTEGER).start) + 400n * 86400n;
    expect(axisToTuple(cal, ganzOben)).toBe(null);
  });

  it('Wertebereiche: Jahr auf den Zeitraum der Tafel begrenzt, Monate und Tage je Jahr', () => {
    setYearlySourcesForTests(PROBEN);
    const tafel = zeitrechnung({ type: 'yearly', table: 'probe' });
    const r = segmentRanges(tafel, tag(4701, 5, 1));
    expect(r.slice(0, 3)).toEqual([
      { levelId: 'year', min: 4700, max: 4703 },
      { levelId: 'month', min: 1, max: 13 },
      { levelId: 'day', min: 1, max: 29 },
    ]);
    expect(segmentRanges(tafel, tag(4700, 1, 1))[1].max).toBe(12);
    const regel = zeitrechnung({ type: 'yearly', rule: 'probe' });
    expect(segmentRanges(regel, tag(5, 1, 1))[0]).toEqual({
      levelId: 'year',
      min: -Number.MAX_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    });
  });
});

// --- Schritt 6: Startpunkt, Zeitalter, Wochen, Umrechnung, Ableitung ---------------------

// Roh-Definition einer Zeitrechnung mit Jahres-Struktur, wie sie in der Sektion
// `calendarSystems` steht: ohne Anker-Datum, mit Woche und Zeitalter.
function rohMitJahresStruktur(id, jahresRel, extra = {}) {
  return {
    id,
    name: id,
    levels: wirbelsaeule(jahresRel),
    cycles: [{ id: 'woche', name: 'Woche', of: 'day', length: 7 }],
    epochs: [
      { name: 'vorher', abbr: 'v', start: null },
      { name: 'Ära', abbr: 'Ä', start: [1, 1, 1] },
    ],
    blockScale: { num: 1, den: 1 },
    ...extra,
  };
}

function sektion(...kalender) {
  return { blocks: [{ id: 'b', calendars: kalender }] };
}

function blockMit(...kalender) {
  const greg = { ...createGregorianTemplate({}), id: 'greg', name: 'greg' };
  return normalizeCalendarConfig(sektion(greg, ...kalender));
}

const TAFEL = { type: 'yearly', table: 'probe' };
const REGEL = { type: 'yearly', rule: 'probe' };

describe('Jahres-Struktur: Startpunkt, Zeitalter, Wochen, Umrechnung (4T-002363, Schritt 6)', () => {
  it('ohne Anker-Datum normalisiert; das Feld entfällt, der Rundlauf ist Zeichen für Zeichen gleich', () => {
    setYearlySourcesForTests(PROBEN);
    const roh = sektion(rohMitJahresStruktur('t', TAFEL));
    const norm = normalizeCalendarConfig(roh);
    expect('blockAnchor' in norm.blocks[0].calendars[0]).toBe(false);
    const abgelegt = JSON.stringify(configForPersist(roh, norm));
    const wieder = normalizeCalendarConfig(JSON.parse(abgelegt));
    expect(JSON.stringify(configForPersist(JSON.parse(abgelegt), wieder))).toBe(abgelegt);
    expect(JSON.parse(abgelegt).blocks[0].calendars[0].levels[5].rel).toEqual(TAFEL);
  });

  it('Kern-Auskunft «Startpunkt»: erster Tag der Tafel, Ursprung bei der Regel, sonst Anker-Datum', () => {
    setYearlySourcesForTests(PROBEN);
    const norm = blockMit(rohMitJahresStruktur('t', TAFEL), rohMitJahresStruktur('r', REGEL));
    const [greg, t, r] = norm.blocks[0].calendars;
    expect(calendarStartPoint(t)).toEqual(tag(4700, 1, 1));
    // Bei der Regel der Tag am Ursprung der eigenen Achse, der 01.01. des Jahres 0.
    expect(convertBetween(r, calendarStartPoint(r), greg).tuple).toEqual([0, 1, 1, 0, 0, 0]);
    expect(calendarStartPoint(greg)).toEqual(greg.blockAnchor);
  });

  it('Kern-Auskunft «Startpunkt» ist für jede Vorlage der ersten Stufe ihr Anker-Datum (AK6)', () => {
    // Der Schlüssel steht für seinen Text: Der Anker hängt nicht an den Namen,
    // und die Prüfdatei bleibt frei von den Sprachdateien.
    const t = (k) => k;
    const norm = normalizeCalendarConfig(
      sektion(...CALENDAR_TEMPLATES.map((e) => ({ ...e.create(t), id: e.id }))),
    );
    // 4T-002005: Die Vorlagen mit Jahres-Struktur tragen keinen Anker; ihr
    // Startpunkt ist der Tag am Ursprung der eigenen Achse.
    const mitJahresStruktur = (cal) => cal.levels[cal.levels.length - 1].rel.type === 'yearly';
    const ersteStufe = norm.blocks[0].calendars.filter((cal) => !mitJahresStruktur(cal));
    expect(ersteStufe).toHaveLength(9);
    for (const cal of ersteStufe) {
      expect(calendarStartPoint(cal), cal.id).toEqual(cal.blockAnchor);
    }
    const hebraeisch = norm.blocks[0].calendars.find((cal) => cal.id === 'hebrew');
    expect(hebraeisch.blockAnchor).toBe(undefined);
    expect(calendarStartPoint(hebraeisch)).toEqual([3760, 5, 8, 0, 0, 0]);
    // 4T-002007: bei der persischen Tafel der erste Tag der Tafel (T9).
    const persisch = norm.blocks[0].calendars.find((cal) => cal.id === 'persian');
    expect(persisch.blockAnchor).toBe(undefined);
    expect(calendarStartPoint(persisch)).toEqual([1279, 1, 1, 0, 0, 0]);
    // 4T-002006: ebenso bei der chinesischen Tafel.
    const chinesisch = norm.blocks[0].calendars.find((cal) => cal.id === 'chinese');
    expect(chinesisch.blockAnchor).toBe(undefined);
    expect(calendarStartPoint(chinesisch)).toEqual([1901, 1, 1, 0, 0, 0]);
    // 4T-002008: ebenso bei der Tafel nach Umm al-Qura.
    const ummAlQura = norm.blocks[0].calendars.find((cal) => cal.id === 'islamic-umalqura');
    expect(ummAlQura.blockAnchor).toBe(undefined);
    expect(calendarStartPoint(ummAlQura)).toEqual([1318, 1, 1, 0, 0, 0]);
  });

  it('Umrechnung im Block über die gemeinsame Tages-Achse; Ziel außerhalb «nicht bekannt»', () => {
    setYearlySourcesForTests(PROBEN);
    const block = blockMit(rohMitJahresStruktur('t', TAFEL)).blocks[0];
    expect(convertInBlock(block, 'greg', [2000, 2, 5, 13, 0, 0], 't')).toEqual({
      ok: true,
      tuple: tag(4700, 1, 1, 13),
    });
    // Letzter Tag der Tafel: Rata Die 731 601 ist der 21.01.2004.
    expect(convertInBlock(block, 't', tag(4703, 12, 30), 'greg').tuple).toEqual([
      2004, 1, 21, 0, 0, 0,
    ]);
    expect(convertInBlock(block, 'greg', [2000, 2, 4, 0, 0, 0], 't')).toEqual({
      ok: false,
      code: 'unknown',
    });
    expect(convertInBlock(block, 'greg', [2004, 1, 22, 0, 0, 0], 't')).toEqual({
      ok: false,
      code: 'unknown',
    });
    expect(convertInBlock(block, 't', tag(4699, 1, 1), 'greg')).toEqual({
      ok: false,
      code: 'unknown',
    });
    // Die Zusammenstellung des Dialogs führt dieselbe Zeile als «nicht bekannt».
    const zeilen = blockEquivalents(block, 'greg', [1999, 1, 1, 0, 0, 0]);
    expect(zeilen.rows[0]).toMatchObject({ ok: false, code: EQUIVALENT_UNKNOWN });
    expect(blockEquivalents(block, 't', tag(4704, 1, 1))).toEqual({ ok: false, code: 'unknown' });
  });

  it('Zeitalter-Grenze außerhalb des Zeitraums auf einem Jahresbeginn ist zulässig (T8), sonst nicht', () => {
    setYearlySourcesForTests(PROBEN);
    const epochen = [
      { name: 'vorher', abbr: 'v', start: null },
      { name: 'Ära', abbr: 'Ä', start: [1, 1, 1] },
      { name: 'Alt', abbr: 'A', start: [300, 1, 1] },
      { name: 'Neu', abbr: 'N', start: [4702, 1, 1] },
      { name: 'Später', abbr: 'S', start: [5000, 1, 1] },
      { name: 'Ungültig', abbr: 'U', start: [3, 2, 1] },
    ];
    const norm = blockMit(rohMitJahresStruktur('t', TAFEL, { epochs: epochen }));
    const t = norm.blocks[0].calendars[1];
    expect(t.epochs.map((e) => e.abbr)).toEqual(['v', 'Ä', 'A', 'N', 'S']);
    expect(epochOf(t, tag(4700, 1, 1))).toMatchObject({ abbr: 'A', year: 4401 });
    expect(epochOf(t, tag(4703, 12, 30))).toMatchObject({ abbr: 'N', year: 2 });
    // Die 5. Stelle von 4701 ist der Schaltmonat nach dem 4. Monat (Kennung nach B1).
    expect(formatTuple(t, tag(4701, 5, 3))).toBe('4402-04L-03 A');
    expect(parseCanonical(t, '4402-04L-03 A')).toMatchObject({ ok: true, tuple: tag(4701, 5, 3) });
    expect(parseCanonical(t, '4402-04L-03 Ä')).toMatchObject({ ok: false });
  });

  it('Wochen-Anker: Vorgabe am Startpunkt, Folge über den Jahreswechsel, außerhalb keine Woche', () => {
    setYearlySourcesForTests(PROBEN);
    const aussen = [
      {
        id: 'woche',
        name: 'Woche',
        of: 'day',
        length: 7,
        anchor: { tuple: [4699, 1, 1], position: 0 },
      },
    ];
    const norm = blockMit(
      rohMitJahresStruktur('t', TAFEL),
      rohMitJahresStruktur('a', TAFEL, { cycles: aussen }),
    );
    const [, t, a] = norm.blocks[0].calendars;
    expect(t.cycles[0].anchor).toEqual({ tuple: [4700, 1, 1], position: 0 });
    expect(a.cycles).toEqual([]);
    expect(cycleAt(t, tag(4700, 1, 8)).position).toBe(0);
    // 4700 hat 354 Tage: der letzte Tag auf Stelle 353 mod 7 = 3, der nächste auf 4.
    expect(cycleAt(t, tag(4700, 12, 30)).position).toBe(3);
    expect(cycleAt(t, tag(4701, 1, 1)).position).toBe(4);
    expect(cycleAt(t, tag(4699, 1, 1))).toBe(null);
  });

  it('eine Ableitung auf einer Zeitrechnung mit Jahres-Struktur wird abgewiesen (B4)', () => {
    setYearlySourcesForTests(PROBEN);
    const abl = { id: 'abl', name: 'abl', derivedFrom: 't', zero: [4701, 1, 1] };
    const norm = blockMit(rohMitJahresStruktur('t', TAFEL), abl);
    expect(norm.blocks[0].calendars.map((c) => c.id)).toEqual(['greg', 't']);
    expect(deriveCalendar(norm.blocks[0].calendars[1], abl)).toBe(null);
  });

  it('unbekannter Name und unlesbare Tafel lassen nur die eigene Zeitrechnung entfallen (AK12)', () => {
    const kaputt = { ...probeTafel, name: 'kaputt', jahre: ['x'] };
    setYearlySourcesForTests({ rules: PROBEN.rules, tables: { probe: probeTafel, kaputt } });
    const norm = blockMit(
      rohMitJahresStruktur('t', TAFEL),
      rohMitJahresStruktur('u', { type: 'yearly', table: 'gibt-es-nicht' }),
      rohMitJahresStruktur('k', { type: 'yearly', table: 'kaputt' }),
      rohMitJahresStruktur('r', REGEL),
    );
    expect(norm.blocks[0].calendars.map((c) => c.id)).toEqual(['greg', 't', 'r']);
  });

  it('eine fortgeschriebene Tafel wirkt auf eine angelegte Zeitrechnung ohne Änderung der Definition (AK9)', () => {
    const roh = sektion(rohMitJahresStruktur('t', TAFEL));
    setYearlySourcesForTests(PROBEN);
    const vorher = normalizeCalendarConfig(roh).blocks[0].calendars[0];
    expect(validateTuple(vorher, tag(4704, 1, 1)).code).toBe('unknown');
    const zeile = '30,29,30,29,30,29,30,29,30,29,30,29';
    setYearlySourcesForTests({
      tables: { probe: { ...probeTafel, jahre: [...probeTafel.jahre, zeile] } },
    });
    const nachher = normalizeCalendarConfig(roh).blocks[0].calendars[0];
    expect(validateTuple(nachher, tag(4704, 1, 1)).ok).toBe(true);
    expect(JSON.stringify(nachher)).toBe(JSON.stringify(vorher));
  });
});

// --- Schritt 7: Schreibweise des Monats nach B1 -------------------------------------------

describe('Jahres-Struktur: Monats-Kennung mit L im Kalender-Wert (4T-002363, Schritt 7, B1)', () => {
  const namen = [
    'Eins',
    'Zwei',
    'Drei',
    'Vier',
    'Fünf',
    'Sechs',
    'Sieben',
    'Acht',
    'Neun',
    'Zehn',
    'Elf',
    'Zwölf',
    'Schalt-Eins',
    'Schalt-Zwei',
    'Schalt-Drei',
    'Schalt-Vier',
  ];
  function tafelKalender() {
    const roh = rohMitJahresStruktur('t', TAFEL, { epochs: [] });
    roh.levels[4] = { ...roh.levels[4], names: namen };
    return blockMit(roh).blocks[0].calendars[1];
  }

  it('schreibt die Kennung: gleiche Zahl in jedem Jahr, Schaltmonat mit L, danach weiter wie ohne', () => {
    setYearlySourcesForTests(PROBEN);
    const t = tafelKalender();
    // Ohne nachgetragene Epoche: Zählung ab dem internen Jahr 1, Kürzel entfällt.
    expect(formatTuple(t, tag(4700, 5, 1))).toBe('4700-05-01');
    expect(formatTuple(t, tag(4701, 4, 1))).toBe('4701-04-01');
    expect(formatTuple(t, tag(4701, 5, 1))).toBe('4701-04L-01');
    expect(formatTuple(t, tag(4701, 6, 1))).toBe('4701-05-01');
    expect(formatTuple(t, tag(4701, 13, 30))).toBe('4701-12-30');
  });

  it('liest die Kennung in beide Richtungen und weist eine fehlende Kennung ab', () => {
    setYearlySourcesForTests(PROBEN);
    const t = tafelKalender();
    for (const text of ['4700-05-01', '4701-04L-01', '4701-05-01', '4701-12-30', '4703-12-30']) {
      const gelesen = parseCanonical(t, text);
      expect(gelesen.ok, text).toBe(true);
      expect(formatTuple(t, gelesen.tuple)).toBe(text);
    }
    expect(parseCanonical(t, '4701-05-01').tuple).toEqual(tag(4701, 6, 1));
    // Kein Schaltmonat nach dem 4. Monat im Jahr 4700; ein L am Tag ist keine Kennung.
    expect(parseCanonical(t, '4700-04L-01')).toMatchObject({
      ok: false,
      code: 'segmentRange',
      levelId: 'month',
    });
    expect(parseCanonical(t, '4701-04-01L')).toMatchObject({ ok: false, code: 'malformed' });
    expect(parseCanonical(t, '4701-L-01')).toMatchObject({ ok: false, code: 'malformed' });
    expect(parseCanonical(t, '4701-13-01')).toMatchObject({ ok: false, code: 'segmentRange' });
    expect(parseCanonical(t, '4704-01-01')).toEqual({ ok: false, code: 'unknown' });
  });

  it('benannte Form nach der Namens-Stelle, nicht nach der Stelle im Jahr', () => {
    setYearlySourcesForTests(PROBEN);
    const t = tafelKalender();
    expect(formatTuple(t, tag(4701, 5, 1), { named: true })).toBe('4701-Schalt-Vier-01');
    expect(formatTuple(t, tag(4701, 6, 1), { named: true })).toBe('4701-Fünf-01');
    expect(formatTuple(t, tag(4700, 5, 1), { named: true })).toBe('4700-Fünf-01');
  });

  it('Regel: Schaltmonat nach dem 6. Monat als «06L», fernes Jahr hin und zurück', () => {
    setYearlySourcesForTests(PROBEN);
    const r = blockMit(rohMitJahresStruktur('r', REGEL, { epochs: [] })).blocks[0].calendars[1];
    expect(formatTuple(r, tag(2, 7, 1))).toBe('2-06L-01');
    expect(formatTuple(r, tag(2, 8, 1))).toBe('2-07-01');
    expect(parseCanonical(r, '2-06L-01').tuple).toEqual(tag(2, 7, 1));
    expect(parseCanonical(r, '1-06L-01')).toMatchObject({ ok: false, code: 'segmentRange' });
    const fern = formatTuple(r, tag(10 ** 15, 12, 29));
    expect(parseCanonical(r, fern).tuple).toEqual(tag(10 ** 15, 12, 29));
  });
});
