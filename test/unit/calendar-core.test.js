// 4T-0542 (Epic 3E-0097): Unit-Tests des Kalender-Kerns — tolerante
// Normalisierung (Fehler-Isolation pro Block/Kalender), Gegenprobe der
// gregorianischen Vorlage gegen Date/Format-Kern, Roundtrip-Identität der
// Achsen-Arithmetik (BigInt), Epochen, Zyklen/Gruppierungen, kanonisches
// Format/Parsen und die Umrechnung über die Block-Achse.
import { describe, it, expect } from 'vitest';
import {
  normalizeCalendarConfig,
  createGregorianTemplate,
  tupleToAxis,
  axisToTuple,
  validateTuple,
  segmentRanges,
  epochOf,
  cycleAt,
  groupAt,
  formatTuple,
  parseCanonical,
  convertInBlock,
  findCalendarByName,
  spanUnits,
  spanTiers,
  configForPersist,
} from '../../src/shared/calendar-core.js';
import { formatDateMs, isoWeekOf } from '../../src/shared/perspective-query-eval.js';

// --- Fixtures ---------------------------------------------------------------

// Fantasie-Kalender „Dreimond": drei Monate (30/30/35 Tage), Schalt-Regel
// alle 5 Jahre (+2 Tage auf den Spätmond), Neun-Tage-Zyklus, drei Epochen
// (die dritte beginnt mitten im Jahr 500), reine Datums-Wirbelsäule.
const DREIMOND = {
  id: 'dreimond',
  name: 'Dreimond',
  levels: [
    { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
    {
      id: 'monat',
      name: 'Monat',
      section: 'Datum',
      start: 1,
      names: ['Frühmond', 'Mittmond', 'Spätmond'],
      rel: { type: 'lengths', table: [30, 30, 35] },
    },
    {
      id: 'jahr',
      name: 'Jahr',
      section: 'Datum',
      start: 1,
      rel: { type: 'leap', count: 3, rules: [{ cycle: 5 }], targetIndex: 2, extra: 2 },
    },
  ],
  cycles: [
    {
      id: 'woche',
      name: 'Neuntage',
      of: 'tag',
      length: 9,
      names: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'],
      anchor: { tuple: [1, 1, 1], position: 0 },
      numbering: { ruleIndex: 4 },
    },
  ],
  epochs: [
    { name: 'Erste Zeit', abbr: 'EZ', start: null },
    { name: 'Zweite Zeit', abbr: 'ZZ', start: [1, 1, 1] },
    { name: 'Dritte Zeit', abbr: 'DZ', start: [500, 2, 10] },
  ],
  blockAnchor: [1, 1, 1],
  blockScale: { num: 100, den: 1 },
};

// Parallel-Kalender „Takt" mit Zeit-Ebene: 100-Sekunden-Tage, 10-Tage-Monate;
// die Block-Achse zählt Takt-Sekunden (Skala 1/1).
const TAKT = {
  id: 'takt',
  name: 'Takt',
  levels: [
    { id: 'sekunde', name: 'Sekunde', section: 'Zeit', start: 0 },
    { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 100 } },
    { id: 'monat', name: 'Monat', section: 'Datum', start: 1, rel: { type: 'factor', count: 10 } },
  ],
  blockAnchor: [1, 1, 0],
  blockScale: { num: 1, den: 1 },
};

// Dreimond-Struktur unter anderem Namen mit gebrochener Skala (7/3 Block-
// Einheiten je Tag) für Rundungs- und Assoziativitäts-Tests.
const DRITTEL = {
  ...DREIMOND,
  id: 'drittel',
  name: 'Drittel',
  blockScale: { num: 7, den: 3 },
};

function normalizedWorld() {
  return normalizeCalendarConfig({
    blocks: [{ id: 'welt', name: 'Welt', calendars: [DREIMOND, TAKT, DRITTEL] }],
  });
}

function gregorian() {
  const config = normalizeCalendarConfig({
    blocks: [{ id: 'real', calendars: [createGregorianTemplate()] }],
  });
  return config.blocks[0].calendars[0];
}

const GREG = gregorian();
const WORLD = normalizedWorld();
const MOND = WORLD.blocks[0].calendars[0];
const TAKT_N = WORLD.blocks[0].calendars[1];

function gregTuple(y, m, d, hh = 0, mm = 0, ss = 0) {
  return [y, m, d, hh, mm, ss];
}

describe('calendar-core — Prozess-Neutralität', () => {
  it('läuft in reiner Node-Umgebung ohne DOM und ohne Electron', () => {
    // Der Import oben ist der Wächter: das Modul funktioniert ohne Browser-
    // Globals (Vitest-Umgebung "node").
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(tupleToAxis(GREG, gregTuple(2026, 7, 16))).toBeTypeOf('bigint');
  });
});

describe('normalizeCalendarConfig — Leer-, Defekt- und Default-Fälle', () => {
  it('liefert null für fehlende, leere oder defekte Sektionen', () => {
    expect(normalizeCalendarConfig(undefined)).toBeNull();
    expect(normalizeCalendarConfig(null)).toBeNull();
    expect(normalizeCalendarConfig('kalender')).toBeNull();
    expect(normalizeCalendarConfig([])).toBeNull();
    expect(normalizeCalendarConfig({})).toBeNull();
    expect(normalizeCalendarConfig({ blocks: [] })).toBeNull();
    expect(normalizeCalendarConfig({ blocks: [{ name: 'ohne id' }] })).toBeNull();
  });

  it('defekte Kalender entfallen einzeln, gültige bleiben (Fehler-Isolation)', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'b1',
          calendars: [
            DREIMOND,
            null,
            'kein-objekt',
            { ...DREIMOND, id: '' },
            // Längen-Tabelle mit ungültigem Eintrag
            {
              ...DREIMOND,
              id: 'x1',
              levels: [
                DREIMOND.levels[0],
                { ...DREIMOND.levels[1], rel: { type: 'lengths', table: [30, 0, 35] } },
                DREIMOND.levels[2],
              ],
            },
            // Schalt-Zyklen nicht geschachtelt (6 ist kein Vielfaches von 4)
            {
              ...DREIMOND,
              id: 'x2',
              levels: [
                DREIMOND.levels[0],
                DREIMOND.levels[1],
                {
                  ...DREIMOND.levels[2],
                  rel: {
                    type: 'leap',
                    count: 3,
                    rules: [{ cycle: 4 }, { cycle: 6 }],
                    targetIndex: 2,
                    extra: 1,
                  },
                },
              ],
            },
            // Schalt-Ebene ohne Enkel (Index < 2)
            {
              id: 'x3',
              levels: [
                { id: 'tag' },
                {
                  id: 'jahr',
                  rel: { type: 'leap', count: 3, rules: [{ cycle: 5 }], targetIndex: 0, extra: 1 },
                },
              ],
            },
            // doppelte Ebenen-id
            {
              ...DREIMOND,
              id: 'x4',
              levels: [
                DREIMOND.levels[0],
                { ...DREIMOND.levels[1], id: 'tag' },
                DREIMOND.levels[2],
              ],
            },
            // Ebenen-Bereich der kleinsten Ebene weiter oben wiederaufgenommen
            {
              ...TAKT,
              id: 'x5',
              levels: [TAKT.levels[0], TAKT.levels[1], { ...TAKT.levels[2], section: 'Zeit' }],
            },
            // count der Ebene über der Längen-Tabelle kein Vielfaches
            {
              ...DREIMOND,
              id: 'x6',
              levels: [
                DREIMOND.levels[0],
                DREIMOND.levels[1],
                {
                  ...DREIMOND.levels[2],
                  rel: { type: 'leap', count: 4, rules: [{ cycle: 5 }], targetIndex: 2, extra: 2 },
                },
              ],
            },
            // Block-Skala ungültig (vorhanden, aber defekt → Kalender defekt)
            { ...TAKT, id: 'x7', blockScale: { num: 1, den: 0 } },
            // Block-Anker ungültig
            { ...TAKT, id: 'x8', blockAnchor: [1, 99, 0] },
            TAKT,
          ],
        },
      ],
    });
    expect(config.blocks[0].calendars.map((cal) => cal.id)).toEqual(['dreimond', 'takt']);
  });

  it('doppelte Block- und Kalender-ids behalten den ersten Eintrag', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        { id: 'b', name: 'Erster', calendars: [DREIMOND, { ...DREIMOND, name: 'Duplikat' }] },
        { id: 'b', name: 'Zweiter' },
      ],
    });
    expect(config.blocks).toHaveLength(1);
    expect(config.blocks[0].name).toBe('Erster');
    expect(config.blocks[0].calendars).toHaveLength(1);
    expect(config.blocks[0].calendars[0].name).toBe('Dreimond');
  });

  it('setzt Defaults: Epochen, Block-Anker, Block-Skala, Namen', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'b',
          calendars: [
            { ...TAKT, epochs: undefined, blockAnchor: undefined, blockScale: undefined, name: '' },
          ],
        },
      ],
    });
    const cal = config.blocks[0].calendars[0];
    expect(cal.name).toBe('takt');
    expect(cal.epochs).toHaveLength(2);
    expect(cal.epochs[0].start).toBeNull();
    expect(cal.epochs[1].start).toEqual([1, 1]);
    expect(cal.blockAnchor).toEqual([0, 1, 0]);
    expect(cal.blockScale).toEqual({ num: 1, den: 1 });
  });

  it('defekte Zyklen und Gruppen entfallen, der Kalender bleibt', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'b',
          calendars: [
            {
              ...DREIMOND,
              cycles: [
                ...DREIMOND.cycles,
                { id: 'kaputt', of: 'nixda', length: 9 },
                { id: 'kaputt2', of: 'tag', length: 9, anchor: { tuple: [1, 9, 1], position: 0 } },
              ],
              groups: [
                { id: 'drittel-jahr', name: 'Jahresdrittel', of: 'monat', size: 1 },
                { id: 'kaputt', of: 'jahr', size: 2 },
              ],
            },
          ],
        },
      ],
    });
    const cal = config.blocks[0].calendars[0];
    expect(cal.cycles.map((x) => x.id)).toEqual(['woche']);
    expect(cal.groups.map((x) => x.id)).toEqual(['drittel-jahr']);
  });

  it('Epochen: unsortierte Starts werden sortiert, Duplikate und Defekte entfallen', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'b',
          calendars: [
            {
              ...DREIMOND,
              epochs: [
                { name: 'Dritte Zeit', abbr: 'DZ', start: [500, 2, 10] },
                { name: 'Zweite Zeit', abbr: 'ZZ', start: [1, 1, 1] },
                { name: 'Duplikat', start: [500, 2, 10] },
                { name: 'Defekt', start: [1, 9, 1] },
                { name: 'Erste Zeit', abbr: 'EZ', start: null },
              ],
            },
          ],
        },
      ],
    });
    const cal = config.blocks[0].calendars[0];
    expect(cal.epochs.map((e) => e.name)).toEqual(['Erste Zeit', 'Zweite Zeit', 'Dritte Zeit']);
  });
});

describe('Gregorianische Vorlage — Gegenprobe gegen Date und Format-Kern', () => {
  const SAMPLE_YEARS = [1900, 1999, 2000, 2001, 2004, 2023, 2024, 2025, 2026, 2027, 2096, 2100];

  it('Monatslängen (inkl. Schaltjahre 1900/2000/2024) stimmen mit Date überein', () => {
    for (const y of SAMPLE_YEARS) {
      for (let m = 1; m <= 12; m++) {
        const first = tupleToAxis(GREG, gregTuple(y, m, 1));
        const nextFirst =
          m === 12
            ? tupleToAxis(GREG, gregTuple(y + 1, 1, 1))
            : tupleToAxis(GREG, gregTuple(y, m + 1, 1));
        const days = Number((nextFirst - first) / 86400n);
        expect(days, `${y}-${m}`).toBe(new Date(y, m, 0).getDate());
      }
    }
  });

  it('Tages-Abstände stimmen mit Date-Differenzen überein (DST-fest gerundet)', () => {
    const refAxis = tupleToAxis(GREG, gregTuple(2000, 1, 1));
    const refMs = new Date(2000, 0, 1).getTime();
    for (const y of SAMPLE_YEARS) {
      for (const [m, d] of [
        [1, 1],
        [2, 28],
        [3, 1],
        [7, 16],
        [12, 31],
      ]) {
        const axis = tupleToAxis(GREG, gregTuple(y, m, d));
        const ms = new Date(y, m - 1, d).getTime();
        expect(Number((axis - refAxis) / 86400n)).toBe(Math.round((ms - refMs) / 86400000));
      }
    }
  });

  it('Wochentage stimmen mit Date.getDay über 400 Tage ab 1999-12-01 überein', () => {
    for (let i = 0; i < 400; i++) {
      const dt = new Date(1999, 11, 1 + i);
      const tuple = gregTuple(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      const cycle = cycleAt(GREG, tuple, 'week');
      expect(cycle.position, dt.toDateString()).toBe((dt.getDay() + 6) % 7);
    }
  });

  it('Zyklus-Nummerierung reproduziert die ISO-KW inkl. Jahreswechsel-Wochen', () => {
    for (let y = 2015; y <= 2027; y++) {
      for (let offset = -4; offset <= 4; offset++) {
        const dt = new Date(y, 0, 1 + offset);
        const tuple = gregTuple(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
        const cycle = cycleAt(GREG, tuple, 'week');
        const iso = isoWeekOf(dt.getTime());
        expect({ number: cycle.number, year: cycle.year }, dt.toDateString()).toEqual({
          number: iso.week,
          year: iso.year,
        });
      }
    }
  });

  it('kanonische Datums-Form entspricht formatDateMs yyyy-MM-dd', () => {
    for (const [y, m, d] of [
      [2026, 7, 16],
      [2024, 2, 29],
      [2000, 1, 1],
      [1999, 12, 31],
    ]) {
      expect(formatTuple(GREG, gregTuple(y, m, d))).toBe(
        formatDateMs(new Date(y, m - 1, d).getTime(), 'yyyy-MM-dd'),
      );
    }
  });

  it('validiert Schalt-Tage korrekt (29. Februar)', () => {
    expect(validateTuple(GREG, gregTuple(2024, 2, 29)).ok).toBe(true);
    expect(validateTuple(GREG, gregTuple(2000, 2, 29)).ok).toBe(true);
    expect(validateTuple(GREG, gregTuple(1900, 2, 29))).toEqual({
      ok: false,
      code: 'segmentRange',
      levelId: 'day',
    });
    expect(validateTuple(GREG, gregTuple(2023, 2, 29)).ok).toBe(false);
  });
});

describe('Achsen-Arithmetik — Roundtrip und BigInt-Extremwerte', () => {
  it('Tupel → Achse → Tupel ist die Identität (gregorianisch, quer über Grenzen)', () => {
    for (const tuple of [
      gregTuple(2026, 7, 16, 14, 30, 15),
      gregTuple(2024, 2, 29),
      gregTuple(2000, 1, 1, 0, 0, 1),
      gregTuple(1, 1, 1),
      gregTuple(0, 12, 31, 23, 59, 59),
      gregTuple(-43, 3, 15, 8, 0, 0),
    ]) {
      expect(axisToTuple(GREG, tupleToAxis(GREG, tuple))).toEqual(tuple);
    }
  });

  it('Achse → Tupel → Achse ist die Identität (Achsen-Stichprobe inkl. negativer Werte)', () => {
    for (let k = -10; k <= 10; k++) {
      const axis = BigInt(k) * 977777n + BigInt(k);
      expect(tupleToAxis(GREG, axisToTuple(GREG, axis))).toBe(axis);
    }
  });

  it('rechnet jenseits von 2^53 exakt (BigInt-Entscheidung)', () => {
    const tuple = gregTuple(5000000000, 7, 16, 12, 0, 0);
    const axis = tupleToAxis(GREG, tuple);
    expect(axis > 2n ** 53n).toBe(true);
    expect(axisToTuple(GREG, axis)).toEqual(tuple);
    // Schalt-Regel wirkt auch in extremen Jahren (4 Mrd. ist durch 400 teilbar).
    expect(validateTuple(GREG, gregTuple(4000000000, 2, 29)).ok).toBe(true);
  });

  it('meldet Tupel-Fehler mit stabilen Codes', () => {
    expect(validateTuple(GREG, [2026, 7]).code).toBe('segmentCount');
    expect(validateTuple(GREG, gregTuple(2026, 7.5, 1)).code).toBe('segmentType');
    expect(validateTuple(GREG, gregTuple(2026, 13, 1)).code).toBe('segmentRange');
    expect(validateTuple(GREG, gregTuple(2026, 7, 16, 24, 0, 0)).code).toBe('segmentRange');
  });

  it('segmentRanges liefert kontext-abhängige Wertebereiche', () => {
    const ranges2024 = segmentRanges(GREG, gregTuple(2024, 2, 1));
    const byId = Object.fromEntries(ranges2024.map((r) => [r.levelId, r]));
    expect(byId.day).toMatchObject({ min: 1, max: 29 });
    expect(byId.month).toMatchObject({ min: 1, max: 12 });
    expect(byId.hour).toMatchObject({ min: 0, max: 23 });
    expect(segmentRanges(GREG, gregTuple(2023, 2, 1)).find((r) => r.levelId === 'day').max).toBe(
      28,
    );
  });
});

describe('Epochen — Auflösung, Zählung ab 1, Grenze mitten im Jahr', () => {
  it('gregorianisch: v. Chr. zählt rückwärts ab 1, ohne Jahr 0', () => {
    expect(epochOf(GREG, gregTuple(2026, 7, 16))).toMatchObject({ index: 1, year: 2026 });
    expect(epochOf(GREG, gregTuple(1, 1, 1))).toMatchObject({ index: 1, year: 1 });
    expect(epochOf(GREG, gregTuple(0, 12, 31))).toMatchObject({
      index: 0,
      abbr: 'v. Chr.',
      year: 1,
    });
    expect(epochOf(GREG, gregTuple(-43, 3, 15))).toMatchObject({ index: 0, year: 44 });
  });

  it('Dreimond: Epochen-Grenze mitten im Jahr 500 trennt taggenau', () => {
    expect(epochOf(MOND, [500, 2, 9])).toMatchObject({ index: 1, abbr: 'ZZ', year: 500 });
    expect(epochOf(MOND, [500, 2, 10])).toMatchObject({ index: 2, abbr: 'DZ', year: 1 });
    expect(epochOf(MOND, [500, 3, 1])).toMatchObject({ index: 2, year: 1 });
    expect(epochOf(MOND, [501, 1, 1])).toMatchObject({ index: 2, year: 2 });
    expect(epochOf(MOND, [0, 3, 37])).toMatchObject({ index: 0, abbr: 'EZ', year: 1 });
    expect(epochOf(MOND, [-1, 1, 1])).toMatchObject({ index: 0, year: 2 });
  });

  it('validateTuple prüft die Epochen-Zugehörigkeit', () => {
    expect(validateTuple(MOND, [500, 2, 9], { epochIndex: 1 }).ok).toBe(true);
    expect(validateTuple(MOND, [500, 2, 10], { epochIndex: 1 }).code).toBe('epochMismatch');
    expect(validateTuple(MOND, [500, 2, 9], { epochIndex: 2 }).code).toBe('epochMismatch');
    expect(validateTuple(MOND, [500, 2, 9], { epochIndex: 9 }).code).toBe('epochUnknown');
  });
});

describe('Zyklen und Gruppierungen', () => {
  it('gregorianische Woche: Positions-Namen aus der Namens-Liste', () => {
    const cycle = cycleAt(GREG, gregTuple(2026, 7, 16));
    expect(cycle.positionName).toBe('Donnerstag');
    expect(cycleAt(GREG, gregTuple(2000, 1, 1)).positionName).toBe('Samstag');
  });

  it('Dreimond: Neun-Tage-Zyklus mit generischer Nummerierungs-Regel', () => {
    expect(cycleAt(MOND, [1, 1, 1], 'woche')).toMatchObject({
      position: 0,
      positionName: 'T1',
      number: 1,
      year: 1,
    });
    expect(cycleAt(MOND, [1, 2, 1], 'woche')).toMatchObject({
      position: 3,
      positionName: 'T4',
      number: 4,
      year: 1,
    });
  });

  it('Gruppierungen: Quartal und Halbjahr rein rechnerisch', () => {
    expect(groupAt(GREG, gregTuple(2026, 7, 16), 'quarter')).toMatchObject({
      index: 2,
      number: 3,
    });
    expect(groupAt(GREG, gregTuple(2026, 7, 16), 'half-year')).toMatchObject({ number: 2 });
    expect(groupAt(GREG, gregTuple(2026, 1, 1), 'quarter')).toMatchObject({ number: 1 });
  });
});

describe('Kanonisches Format und Parsen', () => {
  it('formatiert gregorianisch mit Polsterung, Epochen-Kürzel und Zeit-Teil', () => {
    expect(formatTuple(GREG, gregTuple(2026, 7, 16))).toBe('2026-07-16');
    expect(formatTuple(GREG, gregTuple(2026, 7, 16, 14, 30, 15))).toBe('2026-07-16 14:30:15');
    expect(formatTuple(GREG, gregTuple(-43, 3, 15))).toBe('44-03-15 v. Chr.');
    expect(formatTuple(GREG, gregTuple(-43, 3, 15, 8, 0, 0))).toBe('44-03-15 v. Chr. 08:00:00');
    expect(formatTuple(GREG, gregTuple(2026, 13, 1))).toBeNull();
  });

  it('formatiert mit Namen (opts.named)', () => {
    expect(formatTuple(GREG, gregTuple(2026, 7, 16), { named: true })).toBe('2026-Juli-16');
    expect(formatTuple(MOND, [500, 2, 9], { named: true })).toBe('500-Mittmond-09 ZZ');
  });

  it('parst die kanonische Form inkl. Epochen-Label und verkürztem Zeit-Teil', () => {
    expect(parseCanonical(GREG, '2026-07-16')).toEqual({
      ok: true,
      tuple: gregTuple(2026, 7, 16),
      epochIndex: 1,
    });
    expect(parseCanonical(GREG, '2026-7-16 14:30').tuple).toEqual(
      gregTuple(2026, 7, 16, 14, 30, 0),
    );
    expect(parseCanonical(GREG, '44-03-15 v. Chr. 08:00:00')).toEqual({
      ok: true,
      tuple: gregTuple(-43, 3, 15, 8, 0, 0),
      epochIndex: 0,
    });
  });

  it('Format → Parse ist ein Roundtrip (auch für Epochen ohne Namen)', () => {
    for (const tuple of [
      gregTuple(2026, 7, 16, 14, 30, 15),
      gregTuple(-43, 3, 15),
      gregTuple(1, 1, 1),
    ]) {
      const text = formatTuple(GREG, tuple);
      const parsed = parseCanonical(GREG, text);
      expect(parsed.ok, text).toBe(true);
      expect(parsed.tuple).toEqual(tuple);
    }
    // Default-Epochen ohne Namen nutzen die technische #N-Ersatzform.
    const config = normalizeCalendarConfig({
      blocks: [{ id: 'b', calendars: [{ ...TAKT, epochs: undefined }] }],
    });
    const cal = config.blocks[0].calendars[0];
    const text = formatTuple(cal, [0, 10, 99]);
    expect(text).toBe('1-10 #1 99');
    expect(parseCanonical(cal, text)).toEqual({ ok: true, tuple: [0, 10, 99], epochIndex: 0 });
  });

  it('Dreimond: Anzeige-Jahr der Epoche, Stellen-Breite aus der Definition', () => {
    expect(formatTuple(MOND, [500, 2, 9])).toBe('500-2-09 ZZ');
    expect(formatTuple(MOND, [500, 2, 10])).toBe('1-2-10');
    expect(parseCanonical(MOND, '500-2-09 ZZ').tuple).toEqual([500, 2, 9]);
    expect(parseCanonical(MOND, '1-2-10').tuple).toEqual([500, 2, 10]);
    expect(parseCanonical(MOND, '500-2-10 ZZ').code).toBe('epochMismatch');
  });

  it('meldet Parse-Fehler mit stabilen Codes', () => {
    expect(parseCanonical(GREG, '').code).toBe('malformed');
    expect(parseCanonical(GREG, 'unsinn').code).toBe('malformed');
    expect(parseCanonical(GREG, '2026-07').code).toBe('malformed');
    expect(parseCanonical(GREG, '2026-07-16 kaputt').code).toBe('malformed');
    expect(parseCanonical(GREG, '0-01-01').code).toBe('yearZero');
    expect(parseCanonical(GREG, '2023-02-29').code).toBe('segmentRange');
    expect(parseCanonical(GREG, '2026-07-16 25:00').code).toBe('segmentRange');
  });
});

describe('Umrechnung über die Block-Achse', () => {
  it('rechnet deterministisch mit Floor-Rundung auf die kleinste Ziel-Ebene', () => {
    expect(convertInBlock(WORLD.blocks[0], 'dreimond', [1, 1, 1], 'takt')).toEqual({
      ok: true,
      tuple: [1, 1, 0],
    });
    expect(convertInBlock(WORLD.blocks[0], 'dreimond', [1, 1, 2], 'takt').tuple).toEqual([1, 2, 0]);
    // Takt 50 Sekunden nach Tages-Anfang → derselbe Dreimond-Tag (abgerundet).
    expect(convertInBlock(WORLD.blocks[0], 'takt', [1, 1, 50], 'dreimond').tuple).toEqual([
      1, 1, 1,
    ]);
    // Floor auch im Negativen: eine Sekunde vor dem Anker → Vortag.
    expect(convertInBlock(WORLD.blocks[0], 'takt', [0, 10, 99], 'dreimond').tuple).toEqual([
      0, 3, 37,
    ]);
  });

  it('gebrochene Skalen: exakter Bruch mit einer einzigen Rundung', () => {
    // Drittel-Tag = 7/3 Block-Einheiten: 1 Tag Differenz → floor(7/3) = 2.
    expect(convertInBlock(WORLD.blocks[0], 'drittel', [1, 1, 2], 'takt').tuple).toEqual([1, 1, 2]);
    expect(convertInBlock(WORLD.blocks[0], 'drittel', [1, 1, 4], 'takt').tuple).toEqual([1, 1, 7]);
    // Dreimond → Drittel direkt über die Block-Achse: 100 / (7/3) = floor(300/7) = 42.
    expect(convertInBlock(WORLD.blocks[0], 'dreimond', [1, 1, 2], 'drittel').tuple).toEqual([
      1, 2, 13,
    ]);
  });

  it('kennt nur Kalender desselben Blocks (Block-Grenzen sind nicht umrechenbar)', () => {
    expect(convertInBlock(WORLD.blocks[0], 'dreimond', [1, 1, 1], 'nixda').code).toBe(
      'unknownCalendar',
    );
    expect(convertInBlock(null, 'a', [1, 1, 1], 'b').code).toBe('unknownCalendar');
  });

  it('validiert das Quell-Tupel', () => {
    expect(convertInBlock(WORLD.blocks[0], 'dreimond', [1, 9, 1], 'takt').code).toBe(
      'segmentRange',
    );
  });
});

describe('Roundtrips der Fantasie-Kalender', () => {
  it('Dreimond: Tupel → Achse → Tupel über Schalt- und Epochen-Grenzen', () => {
    for (const tuple of [
      [0, 1, 1],
      [0, 3, 37],
      [1, 1, 1],
      [5, 3, 37],
      [499, 3, 35],
      [500, 2, 10],
      [-6, 3, 35],
      [123456, 2, 15],
    ]) {
      expect(axisToTuple(MOND, tupleToAxis(MOND, tuple)), JSON.stringify(tuple)).toEqual(tuple);
    }
    // Schaltjahr-Längen: Jahr 0 (Schalt) 97 Tage, Jahr 1 (normal) 95 Tage.
    expect(tupleToAxis(MOND, [1, 1, 1])).toBe(97n);
    expect(tupleToAxis(MOND, [2, 1, 1]) - tupleToAxis(MOND, [1, 1, 1])).toBe(95n);
  });

  it('Takt: Zeit-Ebene und unbegrenzte oberste Ebene', () => {
    for (const tuple of [
      [0, 1, 0],
      [1, 10, 99],
      [-3, 5, 42],
    ]) {
      expect(axisToTuple(TAKT_N, tupleToAxis(TAKT_N, tuple))).toEqual(tuple);
    }
  });
});

describe('Längen-Tabelle ohne Schalt-Regel (Tabellen-Zyklus mit Faktor-Eltern)', () => {
  // Jahr = 4 Monate = zwei volle Tabellen-Zyklen (10/12 Tage): prüft den
  // Arithmetik-Zweig ohne Schalt-Ebene samt Vielfachen-Regel des counts.
  const ZEHNMOND = normalizeCalendarConfig({
    blocks: [
      {
        id: 'b',
        calendars: [
          {
            id: 'zehnmond',
            levels: [
              { id: 'tag', section: 'Datum', start: 1 },
              {
                id: 'monat',
                section: 'Datum',
                start: 1,
                rel: { type: 'lengths', table: [10, 12] },
              },
              { id: 'jahr', section: 'Datum', start: 1, rel: { type: 'factor', count: 4 } },
            ],
          },
        ],
      },
    ],
  }).blocks[0].calendars[0];

  it('rechnet Tupel und Achse in beiden Richtungen verlustfrei', () => {
    expect(tupleToAxis(ZEHNMOND, [1, 3, 5])).toBe(70n);
    for (const tuple of [
      [0, 1, 1],
      [1, 3, 5],
      [2, 4, 12],
      [-1, 2, 7],
      [777, 1, 10],
    ]) {
      expect(axisToTuple(ZEHNMOND, tupleToAxis(ZEHNMOND, tuple)), JSON.stringify(tuple)).toEqual(
        tuple,
      );
    }
  });

  it('validiert die Tabellen-Längen positionsabhängig', () => {
    expect(validateTuple(ZEHNMOND, [1, 3, 10]).ok).toBe(true);
    expect(validateTuple(ZEHNMOND, [1, 3, 11]).code).toBe('segmentRange');
    expect(validateTuple(ZEHNMOND, [1, 4, 12]).ok).toBe(true);
    expect(validateTuple(ZEHNMOND, [1, 4, 13]).code).toBe('segmentRange');
  });
});

describe('findCalendarByName — Bezugsname der Wert-Syntax', () => {
  it('findet exakt, dann Groß/Klein-tolerant, dann per id', () => {
    expect(findCalendarByName(WORLD, 'Dreimond').calendar.id).toBe('dreimond');
    expect(findCalendarByName(WORLD, 'dreimond').calendar.id).toBe('dreimond');
    expect(findCalendarByName(WORLD, ' Takt ').calendar.id).toBe('takt');
    expect(findCalendarByName(WORLD, 'drittel').calendar.id).toBe('drittel');
    expect(findCalendarByName(WORLD, 'Nixda')).toBeNull();
    expect(findCalendarByName(null, 'Takt')).toBeNull();
  });
});

// --- Abgeleitete Zeitrechnungen (4T-0746, Epic 3E-0138) ---------------------
// Die Zahlen der Erwartungen stammen aus den Messungen der Konzept-Runde
// 4T-0745 (Protokoll-Zeilen 3b und 5).

// Block mit dem gregorianischen Kalender und einer Ableitung; `roh`
// ergänzt oder überschreibt die Angaben der Ableitung.
function abgeleitet(roh) {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'real',
        calendars: [
          createGregorianTemplate(),
          {
            id: 'abl',
            name: 'Ableitung',
            derivedFrom: 'gregorian',
            labelBefore: 'davor',
            labelAfter: 'danach',
            ...roh,
          },
        ],
      },
    ],
  });
  const block = config.blocks[0];
  return { block, cal: block.calendars[1] };
}

// Bezugs-Datum eines abgeleiteten Tupels als kanonische Zeichenkette.
function imBezug(block, tuple) {
  const res = convertInBlock(block, 'abl', tuple, 'gregorian');
  return res.ok ? formatTuple(block.calendars[0], res.tuple) : null;
}

function tageZwischen(block, von, bis) {
  const cal = block.calendars[1];
  return Number((tupleToAxis(cal, bis) - tupleToAxis(cal, von)) / 86400n);
}

describe('deriveCalendar — Phasenverschiebung', () => {
  it('legt die Einheiten-Grenzen auf den Nullpunkt und behält die Namen', () => {
    const { block, cal } = abgeleitet({ zero: [2026, 7, 23] });
    expect(imBezug(block, [2027, 1, 1, 0, 0, 0])).toBe('2026-07-23');
    for (let m = 1; m <= 12; m++) {
      expect(imBezug(block, [2027, m, 1, 0, 0, 0]).slice(8)).toBe('23');
    }
    expect(imBezug(block, [2028, 1, 1, 0, 0, 0])).toBe('2027-07-23');
    // Namen bleiben erhalten: der erste Monat heißt Juli, der erste
    // Wochentag Donnerstag (der 23.07.2026 ist ein Donnerstag).
    expect(cal.levels[4].names[0]).toBe('Juli');
    expect(cycleAt(cal, [2027, 1, 1, 0, 0, 0], 'week').positionName).toBe('Donnerstag');
    expect(cycleAt(cal, [2027, 1, 8, 0, 0, 0], 'week').positionName).toBe('Donnerstag');
  });

  it('erbt die Jahres-Längen des Bezugs ohne Drift', () => {
    const { block } = abgeleitet({ zero: [2026, 7, 23] });
    const laenge = (y) => tageZwischen(block, [y, 1, 1, 0, 0, 0], [y + 1, 1, 1, 0, 0, 0]);
    expect([2027, 2028, 2029, 2030].map(laenge)).toEqual([365, 366, 365, 365]);
    // Das 366-Tage-Jahr ist genau das, welches den 29.02.2028 enthält.
    expect(imBezug(block, [2028, 1, 1, 0, 0, 0])).toBe('2027-07-23');
  });

  it('hält den Jahrestag über Schaltjahre hinweg (Gegenprobe zur Drift)', () => {
    const { block } = abgeleitet({ zero: [2005, 9, 17] });
    // Drei Jahre ab dem 17.09.2005 sind 1096 Tage, nicht 1095.
    expect(tageZwischen(block, [2006, 1, 1, 0, 0, 0], [2009, 1, 1, 0, 0, 0])).toBe(1096);
    expect(imBezug(block, [2009, 1, 1, 0, 0, 0])).toBe('2008-09-17');
  });

  it('klemmt einen Nullpunkt über dem 28. auf den letzten Tag der Einheit', () => {
    const { block } = abgeleitet({ zero: [2027, 1, 31] });
    const anfaenge = (y) => [1, 2, 3, 4].map((m) => imBezug(block, [y, m, 1, 0, 0, 0]).slice(5));
    expect(anfaenge(2027)).toEqual(['01-31', '02-28', '03-31', '04-30']);
    expect(anfaenge(2028)).toEqual(['01-31', '02-29', '03-31', '04-30']);
    expect(tageZwischen(block, [2027, 1, 1, 0, 0, 0], [2028, 1, 1, 0, 0, 0])).toBe(365);
    expect(tageZwischen(block, [2028, 1, 1, 0, 0, 0], [2029, 1, 1, 0, 0, 0])).toBe(366);
  });

  it('trägt eine Fantasie-Zeitrechnung als Bezug', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'welt',
          calendars: [
            DREIMOND,
            { id: 'abl', name: 'Ableitung', derivedFrom: 'dreimond', zero: [500, 2, 12] },
          ],
        },
      ],
    });
    const block = config.blocks[0];
    expect(block.calendars[1].levels[1].names[0]).toBe('Mittmond');
    const res = convertInBlock(block, 'abl', [500, 1, 1], 'dreimond');
    expect(res.ok).toBe(true);
    expect(res.tuple).toEqual([500, 2, 12]);
  });
});

describe('deriveCalendar — Auflösung in der Konfiguration', () => {
  it('löst unabhängig von der Reihenfolge der Definitionen auf', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'real',
          calendars: [
            { id: 'abl', name: 'Ableitung', derivedFrom: 'gregorian', zero: [2026, 7, 23] },
            createGregorianTemplate(),
          ],
        },
      ],
    });
    expect(config.blocks[0].calendars.map((c) => c.id)).toEqual(['gregorian', 'abl']);
  });

  it('lässt eine Ableitung mit unbekanntem, abgeleitetem oder ungültigem Bezug entfallen', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'real',
          calendars: [
            createGregorianTemplate(),
            { id: 'a', name: 'A', derivedFrom: 'gregorian', zero: [2026, 7, 23] },
            { id: 'b', name: 'B', derivedFrom: 'nixda', zero: [2026, 7, 23] },
            { id: 'c', name: 'C', derivedFrom: 'a', zero: [2026, 7, 23] },
            { id: 'd', name: 'D', derivedFrom: 'gregorian', zero: [2026, 13, 1] },
          ],
        },
      ],
    });
    expect(config.blocks[0].calendars.map((c) => c.id)).toEqual(['gregorian', 'a']);
  });

  it('nimmt die eingebaute Standard-Zeitrechnung als Bezug', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'real',
          calendars: [
            { id: 'golive', name: 'Go-Live', derivedFrom: '@standard', zero: [2028, 7, 1] },
          ],
        },
      ],
    });
    const cal = config.blocks[0].calendars[0];
    expect(cal.id).toBe('golive');
    expect(cal.derived.fromId).toBe('@standard');
    expect(cal.levels.length).toBe(6);
  });
});

describe('spanTiers — gestaffelte Zeitspanne', () => {
  const zaehl = (tiers, i) => tiers[i].map((u) => `${u.count} ${u.name}`).join(', ');

  it('zerlegt das Beispiel der Konzept-Runde', () => {
    const { block, cal } = abgeleitet({ zero: [2005, 9, 17] });
    const wert = convertInBlock(block, 'gregorian', [2005, 9, 27, 0, 0, 0], 'abl').tuple;
    expect(wert.slice(0, 3)).toEqual([2006, 1, 11]);
    const { direction, tiers } = spanTiers(cal, wert);
    expect(direction).toBe('after');
    expect(zaehl(tiers, 0)).toBe('11 Tag');
    expect(zaehl(tiers, 1)).toBe('1 Woche, 4 Tag');
    expect(zaehl(tiers, 2)).toBe('0 Monat, 1 Woche, 4 Tag');
  });

  it('zerlegt über Jahre, Halbjahre und Quartale', () => {
    const { block, cal } = abgeleitet({ zero: [2005, 9, 17] });
    const wert = convertInBlock(block, 'gregorian', [2026, 9, 15, 0, 0, 0], 'abl').tuple;
    expect(wert.slice(0, 3)).toEqual([2026, 12, 30]);
    const { tiers } = spanTiers(cal, wert);
    expect(zaehl(tiers, 0)).toBe('7669 Tag');
    expect(zaehl(tiers, 1)).toBe('1095 Woche, 4 Tag');
    expect(zaehl(tiers, 2)).toBe('251 Monat, 4 Woche, 2 Tag');
    expect(zaehl(tiers, 5)).toBe('20 Jahr, 1 Halbjahr, 1 Quartal, 2 Monat, 4 Woche, 2 Tag');
  });

  it('zählt vor dem Nullpunkt rückwärts ab 1', () => {
    const { block, cal } = abgeleitet({ zero: [2028, 7, 1] });
    const davor = convertInBlock(block, 'gregorian', [2028, 6, 30, 0, 0, 0], 'abl').tuple;
    const eins = spanTiers(cal, davor);
    expect(eins.direction).toBe('before');
    expect(zaehl(eins.tiers, 0)).toBe('1 Tag');
    expect(zaehl(eins.tiers, 2)).toBe('0 Monat, 0 Woche, 1 Tag');
    const jahrDavor = convertInBlock(block, 'gregorian', [2027, 6, 30, 0, 0, 0], 'abl').tuple;
    expect(zaehl(spanTiers(cal, jahrDavor).tiers, 5)).toBe(
      '1 Jahr, 0 Halbjahr, 0 Quartal, 0 Monat, 0 Woche, 1 Tag',
    );
    // Der Nullpunkt selbst ist Tag 1 in Vorwärts-Richtung.
    const nullpunkt = convertInBlock(block, 'gregorian', [2028, 7, 1, 0, 0, 0], 'abl').tuple;
    expect(spanTiers(cal, nullpunkt).direction).toBe('after');
    expect(zaehl(spanTiers(cal, nullpunkt).tiers, 0)).toBe('1 Tag');
  });

  it('legt die Ableitung in kurzer Form ab, nicht als Abschrift (4T-0747)', () => {
    // Regressionstest: Die Ablage schrieb zunächst die aufgelöste Form. Damit
    // verlor die Ableitung ihren Bezug, und eine spätere Änderung am Bezug
    // hätte sie nie mehr erreicht.
    const roh = {
      blocks: [
        {
          id: 'real',
          name: 'Real',
          calendars: [
            createGregorianTemplate(),
            { id: 'golive', name: 'Go-Live', derivedFrom: 'gregorian', zero: [2028, 7, 1] },
          ],
        },
      ],
    };
    const normalisiert = normalizeCalendarConfig(roh);
    const ablage = configForPersist(roh, normalisiert);
    const [basis, abgeleitet2] = ablage.blocks[0].calendars;
    expect(basis.levels.length).toBe(6);
    expect(abgeleitet2.derivedFrom).toBe('gregorian');
    expect(abgeleitet2.zero).toEqual([2028, 7, 1]);
    expect(abgeleitet2.levels).toBeUndefined();
    // Rundreise: der abgelegte Stand löst wieder zur vollen Definition auf.
    const zurueck = normalizeCalendarConfig(ablage);
    expect(zurueck.blocks[0].calendars[1].derived.fromId).toBe('gregorian');
    expect(zurueck.blocks[0].calendars[1].levels.length).toBe(6);
    expect(configForPersist(roh, null)).toBeNull();
  });

  it('zählt in der kanonischen Form vom Nullpunkt weg (4T-0747, Variante B)', () => {
    // Der Nullpunkt ist 0-0-1: gröbere Einheiten als vollständige Anzahl
    // ab 0, die kleinste Datums-Einheit als Ordnungszahl ab 1. Vor dem
    // Nullpunkt zählt dieselbe Form spiegelbildlich.
    const { block, cal } = abgeleitet({
      zero: [2023, 2, 28],
      labelBefore: 'vor Haus',
      labelAfter: 'nach Haus',
    });
    const nullAchse = tupleToAxis(cal, parseCanonical(cal, '0-0-1').tuple);
    const kanonisch = (versatz) =>
      formatTuple(cal, axisToTuple(cal, nullAchse + BigInt(versatz) * 86400n));
    expect(kanonisch(0)).toBe('0-0-1');
    expect(kanonisch(14)).toBe('0-0-15');
    expect(kanonisch(45)).toBe('0-1-18');
    expect(kanonisch(400)).toBe('1-1-7');
    expect(kanonisch(-1)).toBe('0-0-1 vor Haus');
    expect(kanonisch(-15)).toBe('0-0-15 vor Haus');
    expect(kanonisch(-45)).toBe('0-1-14 vor Haus');
    // Rundreise in beide Richtungen.
    for (const versatz of [0, 14, 45, 400, -1, -15, -45, -400]) {
      const tuple = axisToTuple(cal, nullAchse + BigInt(versatz) * 86400n);
      const zurueck = parseCanonical(cal, formatTuple(cal, tuple));
      expect(zurueck.ok).toBe(true);
      expect(zurueck.tuple).toEqual(tuple);
    }
    // Der Nullpunkt liegt auf dem Bezugs-Datum, 15 Tage davor entsprechend.
    const bezug = (wert) =>
      formatTuple(
        block.calendars[0],
        convertInBlock(block, 'abl', parseCanonical(cal, wert).tuple, 'gregorian').tuple,
      );
    expect(bezug('0-0-1')).toBe('2023-02-28');
    expect(bezug('0-0-15 vor Haus')).toBe('2023-02-13');
    // Eingabe-Toleranz und Fehlerfälle.
    expect(parseCanonical(cal, '0-0-1 nach Haus').ok).toBe(true);
    expect(parseCanonical(cal, '0-0-0').code).toBe('segmentRange');
    expect(parseCanonical(cal, '1-15').code).toBe('malformed');
    expect(formatTuple(cal, parseCanonical(cal, '0-0-15 12:30').tuple)).toBe('0-0-15 12:30:00');
  });

  it('führt die Einheiten-Leiter von der kleinsten zur größten', () => {
    const { cal } = abgeleitet({ zero: [2026, 7, 23] });
    expect(spanUnits(cal).map((u) => u.name)).toEqual([
      'Tag',
      'Woche',
      'Monat',
      'Quartal',
      'Halbjahr',
      'Jahr',
    ]);
  });
});
