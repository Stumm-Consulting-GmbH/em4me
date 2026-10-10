// 4T-002001 (Epic 3E-000307): Schaltjahr-Muster als zweite Form der
// Schalt-Regel — Bestand der Teilbarkeits-Kette nach dem Umzug der
// Schalt-Rechnung in calendar-leap.js (AK1), Rechnung des Musters gegen eine
// im Test aufgezählte Rechnung über mehrere Zyklen beidseits des Jahres 1
// (AK2), Abweisung ungültiger Muster (AK3) und Weg der Form durch
// Normalisierung, Ablage-Form und Ableitung (AK4). Den Entwurfs-Weg der
// Einstellungen prüft test/unit/renderer/kalender-schaltjahr-muster-pflege.test.js.
import { describe, it, expect } from 'vitest';
import {
  tupleToAxis,
  axisToTuple,
  validateTuple,
  convertBetween,
} from '../../src/shared/calendar/calendar-core.js';
import {
  normalizeCalendarConfig,
  configForPersist,
} from '../../src/shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../src/shared/calendar/calendar-template.js';
import {
  normalizeLeapRule,
  leapRuleInfo,
  isLeapYear,
} from '../../src/shared/calendar/calendar-leap.js';

// --- Fixtures -----------------------------------------------------------------

// Mond-Zeitrechnung im Aufbau des tabellarischen islamischen Kalenders: zwölf
// Monate abwechselnd 30 und 29 Tage (354 Tage), im Schaltjahr erhält der
// Monat an targetIndex einen Tag (355 Tage).
const MONATSLAENGEN = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
// Die verbreitetste Folge (mit dem 16. Jahr) und die nach Ḥabash al-Ḥāsib,
// die den Platz 30 — also den Platz cycle selbst — enthält.
const MUSTER_16 = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
const MUSTER_30 = [2, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30];

function mondLeap(pattern, targetIndex = 11) {
  return { type: 'leap', count: 12, pattern, targetIndex, extra: 1 };
}

function mondKalender(id, rel) {
  return {
    id,
    name: id,
    levels: [
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        rel: { type: 'lengths', table: MONATSLAENGEN },
      },
      { id: 'jahr', name: 'Jahr', section: 'Datum', start: 1, rel },
    ],
  };
}

function normalisiert(...kalender) {
  const config = normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: kalender }] });
  return config ? config.blocks[0].calendars : [];
}

const [M16] = normalisiert(mondKalender('m16', mondLeap({ cycle: 30, years: MUSTER_16 })));
const [M30] = normalisiert(mondKalender('m30', mondLeap({ cycle: 30, years: MUSTER_30 })));

// Aufgezählte Rechnung: Die Plätze werden Jahr für Jahr weitergezählt —
// Jahr 1 steht auf Platz 1, danach aufwärts mit Umbruch nach cycle auf 1,
// Jahr 0 auf Platz cycle und abwärts mit Umbruch nach 1 auf cycle. Keine
// Modulo-Rechnung, damit der Vergleich nicht dieselbe Formel zweimal prüft.
function aufgezaehlteSchaltjahre(years, cycle, von, bis) {
  const schalt = new Set();
  let platz = 1;
  for (let jahr = 1; jahr <= bis; jahr++) {
    if (jahr >= von && years.includes(platz)) schalt.add(jahr);
    platz = platz === cycle ? 1 : platz + 1;
  }
  platz = cycle;
  for (let jahr = 0; jahr >= von; jahr--) {
    if (jahr <= bis && years.includes(platz)) schalt.add(jahr);
    platz = platz === 1 ? cycle : platz - 1;
  }
  return schalt;
}

// Achsen-Wert (Tage seit Beginn des internen Jahres 0) jedes Jahres-Anfangs
// von `von` bis `bis + 1`, durch Aufsummieren der Jahres-Längen.
function aufgezaehlteJahresAnfaenge(schalt, von, bis) {
  const anfaenge = new Map([[0, 0]]);
  let achse = 0;
  for (let jahr = 0; jahr <= bis; jahr++) {
    achse += schalt.has(jahr) ? 355 : 354;
    anfaenge.set(jahr + 1, achse);
  }
  achse = 0;
  for (let jahr = -1; jahr >= von; jahr--) {
    achse -= schalt.has(jahr) ? 355 : 354;
    anfaenge.set(jahr, achse);
  }
  return anfaenge;
}

const VON = -95;
const BIS = 95;

// --- AK1: Bestand der Teilbarkeits-Kette -----------------------------------------------

// Fest eingetragene Erwartungen, gemessen am Quellstand vor dem Umzug der
// Schalt-Rechnung (Commit 594e64e1f) und dort zusätzlich gegen die
// proleptisch-gregorianische Rechnung von Date (UTC) gegengeprüft.
const GREG_ACHSEN = [
  [[1, 1, 1, 0, 0, 0], 31622400n],
  [[0, 1, 1, 0, 0, 0], 0n],
  [[0, 2, 29, 0, 0, 0], 5097600n],
  [[-1, 12, 31, 23, 59, 59], -1n],
  [[-100, 3, 1, 0, 0, 0], -3150576000n],
  [[-400, 2, 29, 12, 0, 0], -12617640000n],
  [[1900, 2, 28, 0, 0, 0], 59963241600n],
  [[1900, 3, 1, 0, 0, 0], 59963328000n],
  [[2000, 2, 29, 0, 0, 0], 63119001600n],
  [[2000, 3, 1, 0, 0, 0], 63119088000n],
  [[2024, 2, 29, 6, 30, 15], 63876407415n],
  [[2026, 9, 30, 0, 0, 0], 63957945600n],
  [[2100, 3, 1, 0, 0, 0], 66274761600n],
];

const GREG_SCHALTJAHRE_1890_2110 = [
  1892, 1896, 1904, 1908, 1912, 1916, 1920, 1924, 1928, 1932, 1936, 1940, 1944, 1948, 1952, 1956,
  1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020,
  2024, 2028, 2032, 2036, 2040, 2044, 2048, 2052, 2056, 2060, 2064, 2068, 2072, 2076, 2080, 2084,
  2088, 2092, 2096, 2104, 2108,
];

// Bestehende Definition mit zweistufiger Kette (alle 5, außer alle 25) und
// Längen-Tabelle; Werte ebenfalls vor dem Umzug gemessen.
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
      rel: { type: 'lengths', table: [30, 30, 35] },
    },
    {
      id: 'jahr',
      name: 'Jahr',
      section: 'Datum',
      start: 1,
      rel: {
        type: 'leap',
        count: 3,
        rules: [{ cycle: 5 }, { cycle: 25 }],
        targetIndex: 2,
        extra: 2,
      },
    },
  ],
};

const DREIMOND_ACHSEN = [
  [[0, 1, 1], 0n],
  [[1, 1, 1], 95n],
  [[5, 3, 37], 571n],
  [[5, 3, 1], 535n],
  [[25, 3, 35], 2477n],
  [[26, 1, 1], 2478n],
  [[-5, 3, 37], -381n],
  [[-25, 3, 35], -2289n],
  [[-26, 1, 1], -2478n],
  [[-1, 3, 35], -1n],
  [[100, 2, 30], 9591n],
];

// Jahres-Längen der internen Jahre −30 bis 30.
const DREIMOND_LAENGEN = [
  97, 95, 95, 95, 95, 95, 95, 95, 95, 95, 97, 95, 95, 95, 95, 97, 95, 95, 95, 95, 97, 95, 95, 95,
  95, 97, 95, 95, 95, 95, 95, 95, 95, 95, 95, 97, 95, 95, 95, 95, 97, 95, 95, 95, 95, 97, 95, 95,
  95, 95, 97, 95, 95, 95, 95, 95, 95, 95, 95, 95, 97,
];

describe('Bestand der Teilbarkeits-Kette nach dem Umzug (4T-002001, AK1)', () => {
  const [GREG] = normalisiert(createGregorianTemplate());
  const [DREI] = normalisiert(DREIMOND);

  it('die gregorianische Vorlage normalisiert ihre Schalt-Ebene strukturgleich, ohne Muster-Feld', () => {
    expect(GREG.levels[5].rel).toStrictEqual({
      type: 'leap',
      count: 12,
      rules: [{ cycle: 4 }, { cycle: 100 }, { cycle: 400 }],
      targetIndex: 1,
      extra: 1,
    });
    expect(DREI.levels[2].rel).toStrictEqual(DREIMOND.levels[2].rel);
  });

  it('gregorianisch: Achsen-Werte und Rundreisen ausgewählter Tage wie vor dem Umzug', () => {
    for (const [tupel, achse] of GREG_ACHSEN) {
      expect(tupleToAxis(GREG, tupel)).toBe(achse);
      expect(axisToTuple(GREG, achse)).toEqual(tupel);
    }
  });

  it('gregorianisch: Schaltjahre 1890 bis 2110 wie vor dem Umzug', () => {
    const tag = 86400n;
    const schalt = [];
    for (let jahr = 1890; jahr <= 2110; jahr++) {
      const laenge =
        tupleToAxis(GREG, [jahr + 1, 1, 1, 0, 0, 0]) - tupleToAxis(GREG, [jahr, 1, 1, 0, 0, 0]);
      expect([365n * tag, 366n * tag]).toContain(laenge);
      if (laenge === 366n * tag) schalt.push(jahr);
    }
    expect(schalt).toEqual(GREG_SCHALTJAHRE_1890_2110);
  });

  it('zweistufige Kette mit Längen-Tabelle: Achsen-Werte, Rundreisen und Jahres-Längen wie vor dem Umzug', () => {
    for (const [tupel, achse] of DREIMOND_ACHSEN) {
      expect(tupleToAxis(DREI, tupel)).toBe(achse);
      expect(axisToTuple(DREI, achse)).toEqual(tupel);
    }
    const laengen = [];
    for (let jahr = -30; jahr <= 30; jahr++) {
      laengen.push(Number(tupleToAxis(DREI, [jahr + 1, 1, 1]) - tupleToAxis(DREI, [jahr, 1, 1])));
    }
    expect(laengen).toEqual(DREIMOND_LAENGEN);
  });
});

// --- AK2: Rechnung des Musters ------------------------------------------------------------

describe.each([
  ['Folge mit dem 16. Jahr', M16, MUSTER_16],
  ['Folge mit dem Platz 30 (Ḥabash al-Ḥāsib)', M30, MUSTER_30],
])('Schaltjahr-Muster, %s (4T-002001, AK2)', (_, cal, years) => {
  const schalt = aufgezaehlteSchaltjahre(years, 30, VON, BIS);
  const anfaenge = aufgezaehlteJahresAnfaenge(schalt, VON, BIS);
  const info = leapRuleInfo(cal.levels[2].rel);

  it('Schaltjahr-Auskunft der internen Jahre −95 bis 95 wie aufgezählt', () => {
    for (let jahr = VON; jahr <= BIS; jahr++) {
      expect(isLeapYear(info, BigInt(jahr)), `Jahr ${jahr}`).toBe(schalt.has(jahr));
    }
  });

  it('der erste Zyklus nach und vor dem Jahr 1 trägt die Plätze des Musters', () => {
    const imZyklus = (von, bis) =>
      [...schalt].filter((j) => j >= von && j <= bis).sort((a, b) => a - b);
    expect(imZyklus(1, 30)).toEqual(years);
    expect(imZyklus(-29, 0)).toEqual(years.map((p) => p - 30));
  });

  it('Jahres-Längen und Achsen-Werte der Jahres-Anfänge wie aufgezählt', () => {
    for (let jahr = VON; jahr <= BIS; jahr++) {
      const anfang = tupleToAxis(cal, [jahr, 1, 1]);
      expect(anfang, `Anfang Jahr ${jahr}`).toBe(BigInt(anfaenge.get(jahr)));
      const laenge = tupleToAxis(cal, [jahr + 1, 1, 1]) - anfang;
      expect(laenge, `Länge Jahr ${jahr}`).toBe(schalt.has(jahr) ? 355n : 354n);
    }
  });

  it('Rundreise für jeden Jahres-Anfang und jeden letzten Tag des Schalt-Monats', () => {
    for (let jahr = VON; jahr <= BIS; jahr++) {
      const letzter = schalt.has(jahr) ? 30 : 29;
      for (const tupel of [
        [jahr, 1, 1],
        [jahr, 12, letzter],
      ]) {
        expect(axisToTuple(cal, tupleToAxis(cal, tupel)), `Tupel ${tupel}`).toEqual(tupel);
      }
      // Der letzte Tag des Schalt-Monats liegt unmittelbar vor dem Folgejahr.
      expect(tupleToAxis(cal, [jahr, 12, letzter]) + 1n).toBe(BigInt(anfaenge.get(jahr + 1)));
      expect(validateTuple(cal, [jahr, 12, 30]).ok, `Tag 30 im Jahr ${jahr}`).toBe(
        schalt.has(jahr),
      );
    }
  });
});

describe('Feste Stichproben des Musters (4T-002001, AK2)', () => {
  it('Jahres-Anfänge von Hand gerechnet', () => {
    // Folge 16: Jahr 0 (Platz 30) ist kein Schaltjahr; 30 Jahre tragen 11.
    expect(tupleToAxis(M16, [1, 1, 1])).toBe(354n);
    expect(tupleToAxis(M16, [31, 1, 1])).toBe(31n * 354n + 11n);
    expect(tupleToAxis(M16, [-30, 1, 1])).toBe(-(30n * 354n + 11n));
    // Folge 30: Jahr 0 (Platz 30) ist Schaltjahr.
    expect(tupleToAxis(M30, [1, 1, 1])).toBe(355n);
    expect(tupleToAxis(M30, [-30, 1, 1])).toBe(-(30n * 354n + 11n));
  });

  it('das Muster { cycle: 4, years: [4] } rechnet wie die Kette «alle 4»', () => {
    const [muster, kette] = normalisiert(
      mondKalender('muster', mondLeap({ cycle: 4, years: [4] })),
      mondKalender('kette', {
        type: 'leap',
        count: 12,
        rules: [{ cycle: 4 }],
        targetIndex: 11,
        extra: 1,
      }),
    );
    for (let jahr = -12; jahr <= 12; jahr++) {
      expect(tupleToAxis(muster, [jahr, 12, 29])).toBe(tupleToAxis(kette, [jahr, 12, 29]));
    }
  });
});

// --- AK3: Ungültige Muster -----------------------------------------------------------------

describe('Ungültige Muster machen die Zeitrechnung defekt (4T-002001, AK3)', () => {
  const pattern = (p) => mondLeap(p);
  it.each([
    ['Jahr 0', pattern({ cycle: 30, years: [0, 2, 5] })],
    ['Jahr größer als cycle', pattern({ cycle: 30, years: [2, 31] })],
    ['doppeltes Jahr', pattern({ cycle: 30, years: [2, 5, 5] })],
    ['leere Liste', pattern({ cycle: 30, years: [] })],
    ['Jahr keine ganze Zahl', pattern({ cycle: 30, years: [2, 5.5] })],
    ['Jahr als Text', pattern({ cycle: 30, years: [2, '5'] })],
    ['cycle 0', pattern({ cycle: 0, years: [1] })],
    ['cycle nicht ganzzahlig', pattern({ cycle: 30.5, years: [2] })],
    ['cycle fehlt', pattern({ years: [2] })],
    ['years fehlt', pattern({ cycle: 30 })],
    ['Muster als Liste', pattern([2, 5])],
    [
      'rules und pattern zugleich',
      { ...mondLeap({ cycle: 30, years: MUSTER_16 }), rules: [{ cycle: 4 }] },
    ],
    ['weder rules noch pattern', { type: 'leap', count: 12, targetIndex: 11, extra: 1 }],
  ])('%s', (_, rel) => {
    expect(normalisiert(mondKalender('defekt', rel))).toEqual([]);
    expect(normalizeLeapRule(rel)).toBeNull();
  });

  it('ein unsortiertes, sonst gültiges Muster wird sortiert übernommen', () => {
    const [cal] = normalisiert(
      mondKalender('unsortiert', mondLeap({ cycle: 30, years: [29, 2, 16, 5] })),
    );
    expect(cal.levels[2].rel.pattern).toStrictEqual({ cycle: 30, years: [2, 5, 16, 29] });
  });
});

// --- AK4: Normalisierung, Ablage, Ableitung --------------------------------------------------

describe('Weg des Musters durch Normalisierung, Ablage und Ableitung (4T-002001, AK4)', () => {
  it('die Schalt-Ebene trägt genau das Muster, in fester Feld-Reihenfolge', () => {
    expect(M16.levels[2].rel).toStrictEqual({
      type: 'leap',
      count: 12,
      pattern: { cycle: 30, years: MUSTER_16 },
      targetIndex: 11,
      extra: 1,
    });
    expect('rules' in M16.levels[2].rel).toBe(false);
  });

  it('übersteht configForPersist, JSON hin und zurück und erneutes Einlesen', () => {
    const roh = {
      blocks: [
        { id: 'welt', calendars: [mondKalender('m16', mondLeap({ cycle: 30, years: MUSTER_16 }))] },
      ],
    };
    const ablage = configForPersist(roh, normalizeCalendarConfig(roh));
    expect(ablage.blocks[0].calendars[0].levels[2].rel.pattern).toStrictEqual({
      cycle: 30,
      years: MUSTER_16,
    });
    const wieder = normalizeCalendarConfig(JSON.parse(JSON.stringify(ablage)));
    expect(wieder.blocks[0].calendars[0]).toStrictEqual(M16);
  });

  // Ableitung mit Nullpunkt am Monats-Anfang: Ihr Monat k, Tag d ist der
  // Monat (m0 − 1 + k) des Bezugs, Tag d. Ihr internes Jahr ist das Bezugs-
  // Jahr plus yearShift, vor dem Nullpunkt-Monat eines weniger.
  describe.each([
    // Schalt-Einheit Monat 12, Nullpunkt im Monat 3: davor, yearShift 0.
    ['Nullpunkt vor der Schalt-Einheit', 11, [33, 3, 1], 0],
    // Schalt-Einheit Monat 2, Nullpunkt im Monat 6: dahinter, yearShift 1.
    ['Nullpunkt hinter der Schalt-Einheit', 1, [33, 6, 1], 1],
  ])('Ableitung auf einem Muster-Kalender, %s', (_, targetIndex, zero, yearShift) => {
    const [bezug, ableitung] = normalisiert(
      mondKalender('bezug', mondLeap({ cycle: 30, years: MUSTER_16 }, targetIndex)),
      { id: 'ableitung', name: 'Ableitung', derivedFrom: 'bezug', zero },
    );
    const m0 = zero[1];

    it('die Ableitung trägt das Muster des Bezugs', () => {
      expect(ableitung.levels[2].rel.pattern).toStrictEqual({ cycle: 30, years: MUSTER_16 });
      expect('rules' in ableitung.levels[2].rel).toBe(false);
    });

    it('jeder Tag über mehrere Schaltjahr-Grenzen entspricht dem erwarteten Tag und kehrt zurück', () => {
      // Bezugs-Jahre 20 bis 40: Schaltjahre 21, 24, 26, 29, 32, 35, 37, 40.
      const von = tupleToAxis(bezug, [20, 1, 1]);
      const bis = tupleToAxis(bezug, [41, 1, 1]);
      let schaltTage = 0;
      for (let achse = von; achse < bis; achse++) {
        const [by, bm, bd] = axisToTuple(bezug, achse);
        const hin = convertBetween(bezug, [by, bm, bd], ableitung);
        expect(hin.ok).toBe(true);
        const erwartet = [by + yearShift - (bm < m0 ? 1 : 0), ((bm - m0 + 12) % 12) + 1, bd];
        expect(hin.tuple, `Bezug ${by}-${bm}-${bd}`).toEqual(erwartet);
        expect(convertBetween(ableitung, hin.tuple, bezug).tuple).toEqual([by, bm, bd]);
        if (bm === targetIndex + 1 && bd === MONATSLAENGEN[targetIndex] + 1) schaltTage++;
      }
      expect(schaltTage).toBe(8);
    });
  });
});
