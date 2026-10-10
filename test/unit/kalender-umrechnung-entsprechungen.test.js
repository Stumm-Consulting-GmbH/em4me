// 4T-001874 (Epic 3E-000323): Entsprechungen eines Zeitpunkts in den übrigen
// Zeitrechnungen desselben Blocks (blockEquivalents aus
// src/shared/calendar/calendar-convert.js), die Zusammenstellung für den Dialog
// «Datum umrechnen». Geprüft werden die Vergleichswerte in beiden Richtungen in
// einem Block mit allen neun Vorlagen, die Gleichheit jeder Zeile mit der
// Umrechnung des Kerns, die Fälle ohne Ergebnis, die eine Abrundung bei
// gebrochenem Maßstab und die exakte Rechnung jenseits einer Milliarde Jahre.
//
// Die Vergleichswerte rechnet diese Datei nicht selbst: Es sind die Stichtag-
// Paare, mit denen die Vorlagen in ihren Nachweis-Dateien gegen unabhängige
// Quellen belegt sind; je Paar steht die Herkunft (Datei:Zeile) dabei.
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import {
  blockEquivalents,
  EQUIVALENT_UNKNOWN,
} from '../../src/shared/calendar/calendar-convert.js';
import {
  axisToTuple,
  convertInBlock,
  epochOf,
  parseCanonical,
  tupleToAxis,
  validateTuple,
} from '../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { CALENDAR_TEMPLATES } from '../../src/shared/calendar/calendar-templates.js';

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus allen neun Vorlagen der Sammlung in Menü-Reihenfolge, mit
// deutschem Katalog erzeugt und normalisiert.
function neunerBlock() {
  const config = normalizeCalendarConfig({
    blocks: [{ id: 'welt', calendars: CALENDAR_TEMPLATES.map((entry) => entry.create(tDe)) }],
  });
  const block = config.blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(CALENDAR_TEMPLATES.map((e) => e.id));
  expect(block.calendars).toHaveLength(9);
  return block;
}

const kalenderIn = (block, id) => block.calendars.find((c) => c.id === id);
const zeileVon = (ergebnis, id) => ergebnis.rows.find((r) => r.calendar.id === id);

// Stichtag-Paare: eigen = [Epoche, Anzeige-Jahr, Monat, Tag] der Vorlage,
// gregorianisch = [Jahr (astronomisch), Monat, Tag]. Alle Paare stammen aus den
// Tabellen «ausdrücklich belegt» der jeweiligen Nachweis-Datei; dort sind sie
// in der Form [Anzeige-Jahr, Monat, Tag] mit Epoche 1 notiert, bei der
// japanischen Vorlage bereits mit der Epoche (Ära) vorn.
const ST = 'test/unit/kalender-vorlagen-stichtage.test.js';
const ISL = 'test/unit/kalender-vorlage-islamisch.test.js';
const JAP = 'test/unit/kalender-vorlage-japanisch.test.js';
const VERGLEICHSWERTE = [
  { id: 'julian', eigen: [1, 1582, 10, 5], gregorianisch: [1582, 10, 15], herkunft: `${ST}:69` },
  { id: 'julian', eigen: [1, 1917, 10, 25], gregorianisch: [1917, 11, 7], herkunft: `${ST}:80` },
  {
    id: 'islamic-tabular',
    eigen: [1, 1438, 9, 1],
    gregorianisch: [2017, 5, 27],
    herkunft: `${ISL}:149`,
  },
  {
    id: 'islamic-tabular',
    eigen: [1, 1445, 1, 1],
    gregorianisch: [2023, 7, 19],
    herkunft: `${ISL}:161`,
  },
  { id: 'indian', eigen: [1, 1879, 1, 1], gregorianisch: [1957, 3, 22], herkunft: `${ST}:114` },
  { id: 'indian', eigen: [1, 1941, 12, 20], gregorianisch: [2020, 3, 10], herkunft: `${ST}:177` },
  { id: 'buddhist', eigen: [1, 2484, 1, 1], gregorianisch: [1941, 1, 1], herkunft: `${ST}:209` },
  { id: 'buddhist', eigen: [1, 2569, 1, 1], gregorianisch: [2026, 1, 1], herkunft: `${ST}:220` },
  { id: 'ethiopic', eigen: [1, 1998, 1, 1], gregorianisch: [2005, 9, 11], herkunft: `${ST}:268` },
  { id: 'ethiopic', eigen: [1, 2011, 13, 6], gregorianisch: [2019, 9, 11], herkunft: `${ST}:281` },
  { id: 'coptic', eigen: [1, 1592, 1, 1], gregorianisch: [1875, 9, 11], herkunft: `${ST}:323` },
  { id: 'coptic', eigen: [1, 1816, 13, 1], gregorianisch: [2100, 9, 7], herkunft: `${ST}:337` },
  // Heisei 1 und Reiwa 1: Epoche 4 und 5 der Vorlage.
  { id: 'japanese', eigen: [4, 1, 1, 8], gregorianisch: [1989, 1, 8], herkunft: `${JAP}:265` },
  { id: 'japanese', eigen: [5, 1, 5, 1], gregorianisch: [2019, 5, 1], herkunft: `${JAP}:293` },
  { id: 'minguo', eigen: [1, 1, 1, 1], gregorianisch: [1912, 1, 1], herkunft: `${ST}:361` },
  { id: 'minguo', eigen: [1, 13, 2, 29], gregorianisch: [1924, 2, 29], herkunft: `${ST}:363` },
];

// Uhrzeiten, mit denen jedes Paar geprüft wird: Mitternacht und eine Tageszeit,
// die unverändert durchreichen muss (alle Vorlagen teilen die Zeit-Ebenen).
const ZEITEN = [
  [0, 0, 0],
  [13, 45, 30],
];

// Internes Tupel der Vorlage aus Epoche, Anzeige-Jahr, Monat, Tag und Uhrzeit,
// gelesen über die kanonische Schreibweise mit der technischen Epochen-Angabe
// «#N». So entsteht das Ausgangs-Tupel der Rückrichtung ohne die Umrechnung,
// die hier geprüft wird.
function eigenesTupel(kalender, [epoche, jahr, monat, tag], zeit) {
  const text = `${jahr}-${monat}-${tag} #${epoche + 1} ${zeit.join(':')}`;
  const gelesen = parseCanonical(kalender, text);
  expect(gelesen.ok, text).toBe(true);
  return gelesen.tuple;
}

const text = (p) => `${p.id} ${p.eigen.join('/')} = ${p.gregorianisch.join('-')} (${p.herkunft})`;

describe('Vergleichswerte in beiden Richtungen, Block mit allen neun Vorlagen (4T-001874)', () => {
  it('jede nicht-gregorianische Vorlage trägt mindestens ein belegtes Paar', () => {
    const mitPaar = new Set(VERGLEICHSWERTE.map((p) => p.id));
    const erwartet = CALENDAR_TEMPLATES.map((e) => e.id).filter((id) => id !== 'gregorian');
    expect([...mitPaar].sort()).toEqual([...erwartet].sort());
  });

  it.each(VERGLEICHSWERTE.map((p) => [text(p), p]))('AK4: hin — %s', (_name, paar) => {
    const block = neunerBlock();
    const kalender = kalenderIn(block, paar.id);
    for (const zeit of ZEITEN) {
      const ergebnis = blockEquivalents(block, 'gregorian', paar.gregorianisch.concat(zeit));
      expect(ergebnis.ok).toBe(true);
      const zeile = zeileVon(ergebnis, paar.id);
      expect(zeile.ok).toBe(true);
      const ep = epochOf(kalender, zeile.tuple);
      expect([ep.index, ep.year, zeile.tuple[1], zeile.tuple[2]]).toEqual(paar.eigen);
      expect(zeile.tuple.slice(3)).toEqual(zeit);
      expect(zeile.tuple).toEqual(eigenesTupel(kalender, paar.eigen, zeit));
    }
  });

  it.each(VERGLEICHSWERTE.map((p) => [text(p), p]))('AK4: zurück — %s', (_name, paar) => {
    const block = neunerBlock();
    const kalender = kalenderIn(block, paar.id);
    for (const zeit of ZEITEN) {
      const ergebnis = blockEquivalents(block, paar.id, eigenesTupel(kalender, paar.eigen, zeit));
      expect(ergebnis.ok).toBe(true);
      expect(zeileVon(ergebnis, 'gregorian')).toEqual({
        calendar: kalenderIn(block, 'gregorian'),
        ok: true,
        tuple: paar.gregorianisch.concat(zeit),
      });
    }
  });
});

// Ausgangs-Tupel je Zeitrechnung des Neuner-Blocks: die gregorianischen Tage
// der Paare und je Vorlage ihre eigenen Tage, dazu ein ferner Zeitpunkt.
function ausgaenge(block) {
  const liste = [];
  for (const p of VERGLEICHSWERTE) {
    for (const zeit of ZEITEN) {
      liste.push(['gregorian', p.gregorianisch.concat(zeit)]);
      liste.push([p.id, eigenesTupel(kalenderIn(block, p.id), p.eigen, zeit)]);
    }
  }
  liste.push(['gregorian', [1500000000, 6, 15, 12, 30, 45]]);
  liste.push(['gregorian', [-1500000000, 3, 1, 0, 0, 1]]);
  return liste;
}

describe('Gleichheit mit der Umrechnung des Kerns (4T-001874)', () => {
  it('AK4/AK2: jede Zeile ist gleich convertInBlock, Reihenfolge des Blocks ohne die Ausgangs-Zeitrechnung', () => {
    const block = neunerBlock();
    const ausgaengeListe = ausgaenge(block);
    // Jede Zeitrechnung des Blocks ist mindestens einmal Ausgangspunkt.
    expect(new Set(ausgaengeListe.map(([id]) => id)).size).toBe(9);
    for (const [fromId, tupel] of ausgaengeListe) {
      const ort = `${fromId} ${tupel.join('/')}`;
      const ergebnis = blockEquivalents(block, fromId, tupel);
      expect(ergebnis.ok, ort).toBe(true);
      expect(ergebnis.rows, ort).toHaveLength(block.calendars.length - 1);
      expect(
        ergebnis.rows.map((r) => r.calendar.id),
        ort,
      ).toEqual(block.calendars.map((c) => c.id).filter((id) => id !== fromId));
      for (const zeile of ergebnis.rows) {
        const { calendar, ...rest } = zeile;
        expect(calendar, ort).toBe(kalenderIn(block, calendar.id));
        expect(rest, `${ort} → ${calendar.id}`).toEqual(
          convertInBlock(block, fromId, tupel, calendar.id),
        );
      }
    }
  });
});

// Kleine Zeitrechnungen nach dem Vorbild «Takt» in test/unit/calendar-core.test.js:
// 100-Sekunden-Tage, 10-Tage-Monate, oberste Ebene der Monat; Tupel
// [Monat, Tag, Sekunde]. Der Maßstab ist frei wählbar.
function taktwerk(id, num, den) {
  return {
    id,
    name: id,
    levels: [
      { id: 'sekunde', name: 'Sekunde', section: 'Zeit', start: 0 },
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 100 } },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        rel: { type: 'factor', count: 10 },
      },
    ],
    blockAnchor: [1, 1, 0],
    blockScale: { num, den },
  };
}

function blockAus(calendars) {
  const block = normalizeCalendarConfig({ blocks: [{ id: 'probe', calendars }] }).blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(calendars.map((c) => c.id));
  return block;
}

describe('Fälle ohne Ergebnis (4T-001874)', () => {
  it('AK5: ohne Block oder ohne Liste der Zeitrechnungen: unknownCalendar', () => {
    const tupel = [2026, 10, 3, 0, 0, 0];
    expect(blockEquivalents(null, 'gregorian', tupel)).toEqual({
      ok: false,
      code: 'unknownCalendar',
    });
    expect(blockEquivalents(undefined, 'gregorian', tupel)).toEqual({
      ok: false,
      code: 'unknownCalendar',
    });
    expect(blockEquivalents({}, 'gregorian', tupel)).toEqual({
      ok: false,
      code: 'unknownCalendar',
    });
    expect(blockEquivalents({ calendars: 'gregorian' }, 'gregorian', tupel)).toEqual({
      ok: false,
      code: 'unknownCalendar',
    });
  });

  it('AK5: unbekannte Ausgangs-Zeitrechnung: unknownCalendar', () => {
    const block = neunerBlock();
    expect(blockEquivalents(block, 'gibt-es-nicht', [2026, 10, 3, 0, 0, 0])).toEqual({
      ok: false,
      code: 'unknownCalendar',
    });
  });

  it('AK5: ungültiges Ausgangs-Tupel: genau der Code der Gültigkeits-Prüfung des Kerns', () => {
    const block = neunerBlock();
    const greg = kalenderIn(block, 'gregorian');
    for (const [tupel, code] of [
      [[2026, 7], 'segmentCount'],
      [[2026, 7, 1, 0, 0, 0, 0], 'segmentCount'],
      [[2026, 7.5, 1, 0, 0, 0], 'segmentType'],
      [[2026, 13, 1, 0, 0, 0], 'segmentRange'],
      [[2026, 2, 29, 0, 0, 0], 'segmentRange'],
      [[2026, 10, 3, 24, 0, 0], 'segmentRange'],
    ]) {
      expect(validateTuple(greg, tupel).code, tupel.join('/')).toBe(code);
      expect(blockEquivalents(block, 'gregorian', tupel), tupel.join('/')).toEqual({
        ok: false,
        code,
      });
    }
    // Dasselbe von einer anderen Vorlage aus: Monat 14 gibt es im koptischen
    // Kalender nicht.
    const koptisch = kalenderIn(block, 'coptic');
    const tupel = [1742, 14, 1, 0, 0, 0];
    expect(blockEquivalents(block, 'coptic', tupel)).toEqual({
      ok: false,
      code: validateTuple(koptisch, tupel).code,
    });
    expect(validateTuple(koptisch, tupel).code).toBe('segmentRange');
  });

  it('AK5: Block mit nur einer Zeitrechnung: keine Zeile', () => {
    const block = blockAus([CALENDAR_TEMPLATES[0].create(tDe)]);
    expect(blockEquivalents(block, 'gregorian', [2026, 10, 3, 0, 0, 0])).toEqual({
      ok: true,
      rows: [],
    });
  });

  it('AK5: Ziel außerhalb des darstellbaren Bereichs: Zeile outOfRange ohne Tupel, die übrigen Zeilen rechnen', () => {
    // Eine Quell-Sekunde dauert 10^15 Block-Einheiten, eine Sekunde von
    // «winzig» eine. Eine Million Monate der Quelle ergeben bei «winzig» rund
    // 10^21 Monate — jenseits von ±2^53 für das oberste Segment; dort liefert
    // axisToTuple des Kerns null. «nachbar» hat den Maßstab der Quelle und
    // rechnet weiter.
    const GROSS = 1e15;
    expect(Number.isSafeInteger(GROSS)).toBe(true);
    const block = blockAus([
      taktwerk('quelle', GROSS, 1),
      taktwerk('winzig', 1, 1),
      taktwerk('nachbar', GROSS, 1),
    ]);
    const fern = [1000000, 1, 0];
    const ergebnis = blockEquivalents(block, 'quelle', fern);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.rows).toEqual([
      { calendar: kalenderIn(block, 'winzig'), ok: false, code: 'outOfRange' },
      { calendar: kalenderIn(block, 'nachbar'), ok: true, tuple: fern },
    ]);
    expect(ergebnis.rows[0]).not.toHaveProperty('tuple');
    // Gegenprobe: Am Anker rechnen alle Zeilen.
    expect(blockEquivalents(block, 'quelle', [1, 1, 0]).rows.every((r) => r.ok)).toBe(true);
  });
});

describe('Rundung und große Werte (4T-001874)', () => {
  // Fein: eine Sekunde = eine Block-Einheit. Grob: Tage zu 250/3 Block-
  // Einheiten (gebrochener Maßstab), 10-Tage-Monate; Tupel [Monat, Tag].
  // Beide Anker liegen auf dem Block-Nullpunkt.
  const GROB = {
    id: 'grob',
    name: 'Grob',
    levels: [
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        rel: { type: 'factor', count: 10 },
      },
    ],
    blockAnchor: [1, 1],
    blockScale: { num: 250, den: 3 },
  };
  const welt = () => blockAus([taktwerk('fein', 1, 1), GROB]);

  // Abstand eines Zeitpunkts vom Block-Nullpunkt in Block-Einheiten mal 3
  // (ganzzahlig): fein zählt Sekunden, grob zählt Tage zu 250/3.
  const feinDrittel = (block, tupel) =>
    3n *
    (tupleToAxis(kalenderIn(block, 'fein'), tupel) -
      tupleToAxis(kalenderIn(block, 'fein'), [1, 1, 0]));
  const grobDrittel = (block, tupel) =>
    250n *
    (tupleToAxis(kalenderIn(block, 'grob'), tupel) -
      tupleToAxis(kalenderIn(block, 'grob'), [1, 1]));

  it('AK3: fein → grob ergibt die Abrundung auf den Tag, auch bei negativen Achsen-Werten', () => {
    const block = welt();
    const nachGrob = (tupel) => zeileVon(blockEquivalents(block, 'fein', tupel), 'grob');
    // Benannte Stellen um die Tagesgrenze bei 250/3 ≈ 83,3 Sekunden.
    expect(nachGrob([1, 1, 0]).tuple).toEqual([1, 1]);
    expect(nachGrob([1, 1, 83]).tuple).toEqual([1, 1]);
    expect(nachGrob([1, 1, 84]).tuple).toEqual([1, 2]);
    // Vor dem Nullpunkt: eine Sekunde davor ist schon der Vortag.
    expect(nachGrob([0, 10, 99]).tuple).toEqual([0, 10]);
    expect(nachGrob([0, 10, 17]).tuple).toEqual([0, 10]);
    expect(nachGrob([0, 10, 16]).tuple).toEqual([0, 9]);
    // Lückenlos über ±1000 Sekunden: Der Tag des Ergebnisses beginnt am oder
    // vor dem Zeitpunkt, und der Folgetag beginnt danach.
    const fein = kalenderIn(block, 'fein');
    const anker = tupleToAxis(fein, [1, 1, 0]);
    for (let d = -1000n; d <= 1000n; d++) {
      const tupel = axisToTuple(fein, anker + d);
      const zeile = nachGrob(tupel);
      expect(zeile.ok).toBe(true);
      const start = grobDrittel(block, zeile.tuple);
      const x = feinDrittel(block, tupel);
      expect(start <= x && x < start + 250n, `${d}`).toBe(true);
    }
  });

  it('AK3: grob → fein rundet einmal ab, auch vor dem Nullpunkt', () => {
    const block = welt();
    const nachFein = (tupel) => zeileVon(blockEquivalents(block, 'grob', tupel), 'fein');
    // Ein Tag = 83 1/3 Sekunden → 83; ein Tag davor = −83 1/3 → −84.
    expect(nachFein([1, 2]).tuple).toEqual([1, 1, 83]);
    expect(nachFein([0, 10]).tuple).toEqual([0, 10, 16]);
    // Drei Tage = genau 250 Sekunden, ohne Rest.
    expect(nachFein([1, 4]).tuple).toEqual([1, 3, 50]);
  });

  it('AK3: gebrochener Maßstab bei Achsen-Werten jenseits von 2^53 rundet ebenso ab', () => {
    const block = welt();
    const fein = kalenderIn(block, 'fein');
    for (const tupel of [
      [10000000000000, 5, 42],
      [-10000000000000, 7, 99],
    ]) {
      expect(tupleToAxis(fein, tupel) > 2n ** 53n || tupleToAxis(fein, tupel) < -(2n ** 53n)).toBe(
        true,
      );
      const zeile = zeileVon(blockEquivalents(block, 'fein', tupel), 'grob');
      expect(zeile.ok).toBe(true);
      const start = grobDrittel(block, zeile.tuple);
      const x = feinDrittel(block, tupel);
      expect(start <= x && x < start + 250n, tupel.join('/')).toBe(true);
    }
  });

  it('AK3: ein Zeitpunkt jenseits von einer Milliarde Jahren rechnet in allen Vorlagen exakt hin und zurück', () => {
    const block = neunerBlock();
    const greg = kalenderIn(block, 'gregorian');
    for (const tupel of [
      [1500000000, 6, 15, 12, 30, 45],
      [-1500000000, 3, 1, 0, 0, 1],
    ]) {
      // Sekunden-Achse jenseits von 2^53: Die Rechnung läuft in BigInt.
      const achse = tupleToAxis(greg, tupel);
      expect(achse > 2n ** 53n || achse < -(2n ** 53n)).toBe(true);
      const hin = blockEquivalents(block, 'gregorian', tupel);
      expect(hin.ok).toBe(true);
      expect(hin.rows).toHaveLength(8);
      for (const zeile of hin.rows) {
        const ort = `${tupel[0]} → ${zeile.calendar.id}`;
        expect(zeile.ok, ort).toBe(true);
        expect(Math.abs(zeile.tuple[0]), ort).toBeGreaterThan(1000000000);
        const zurueck = blockEquivalents(block, zeile.calendar.id, zeile.tuple);
        expect(zeileVon(zurueck, 'gregorian').tuple, ort).toEqual(tupel);
      }
    }
  });
});

describe('Vorgesehener Fall «nicht bekannt» (4T-001874)', () => {
  it('AK5: die Konstante heißt unknown und wird heute von keiner Zeile geliefert', () => {
    expect(EQUIVALENT_UNKNOWN).toBe('unknown');
    const block = neunerBlock();
    let zeilen = 0;
    for (const [fromId, tupel] of ausgaenge(block)) {
      const ergebnis = blockEquivalents(block, fromId, tupel);
      expect(ergebnis.ok).toBe(true);
      for (const zeile of ergebnis.rows) {
        zeilen++;
        expect(zeile.code, `${fromId} → ${zeile.calendar.id}`).not.toBe(EQUIVALENT_UNKNOWN);
      }
    }
    expect(zeilen).toBeGreaterThan(0);
  });
});
