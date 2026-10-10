// 4T-002003 (Epic 3E-000307): Schutz gespeicherter Werte beim Nachtragen einer
// Epoche — der rechnende Kern (src/shared/calendar/calendar-epoch-guard.js).
//
// **Die Fixture ist die Lage der Messung vom 2026-09-30**, nicht eine erfundene
// Definition: ein «Eigenkalender» nach der gregorianischen Vorlage und ein
// «Vergleichskalender» im selben Block; nachgetragen wird eine dritte Epoche
// «Neu» ab 2030-01-01. Dort zeigte das gebaute Programm, dass ein Wert
// `2026-09-30` ohne Kürzel danach den 4055-09-30 des Vergleichskalenders
// bezeichnet.
//
// **Die Zusage wird an einem Zeitraum gemessen, nicht an Beispielen**
// (Plan-Änderung vom 2026-10-01, Schutz-Maßnahme der Fehler-Retrospektive): Der
// freigegebene Plan war von einem Wert VOR der neuen Grenze her gedacht und
// hätte jeden Wert ab ihrem Beginn still umgedeutet. Der Fall «Zusage über
// jeden Tag» prüft deshalb für jeden Tag beiderseits der Grenze und in beiden
// Schreibweisen, dass kein Wert seine Lesung ändert, ohne angeboten zu werden.
//
// **Der Nachweis der Ersetzung** läuft über den geteilten Kern der
// Ersetzen-Strecke (`wendeErsetzungenAn`) mit den Lauf-Optionen dieses Moduls —
// derselbe Weg, auf dem die Strecke im Hauptprozess und im Puffer offener
// Reiter schreibt.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import de from '../../src/i18n/de.json';

const require = createRequire(import.meta.url);
const {
  epochenNachtraege,
  sichereWert,
  findeUngesicherte,
  laufOptionen,
} = require('../../src/shared/calendar/calendar-epoch-guard.js');
const {
  parseCanonical,
  formatTuple,
  convertInBlock,
  validateTuple,
  epochOf,
  epochLabel,
  findCalendarValues,
} = require('../../src/shared/calendar/calendar-core.js');
const { normalizeCalendarConfig } = require('../../src/shared/calendar/calendar-config.js');
const { createGregorianTemplate } = require('../../src/shared/calendar/calendar-template.js');
const { findCalendarTemplate } = require('../../src/shared/calendar/calendar-templates.js');
const { wendeErsetzungenAn } = require('../../src/shared/ersetzen-kern.js');

const NEU = { name: 'Neu', abbr: 'Neu', start: [2030, 1, 1] };

// Die gespeicherte Sektion calendarSystems, wie die Einstellungen sie ablegen.
function rohKonfig({ eigen = {}, epochen = null } = {}) {
  const eigenKalender = createGregorianTemplate({ id: 'eigen', name: 'Eigenkalender' });
  if (epochen) eigenKalender.epochs = epochen(eigenKalender.epochs);
  return {
    blocks: [
      {
        id: 'welt',
        name: 'Welt',
        calendars: [
          { ...eigenKalender, ...eigen },
          createGregorianTemplate({ id: 'vergleich', name: 'Vergleichskalender' }),
        ],
      },
    ],
  };
}

const ALT = normalizeCalendarConfig(rohKonfig());
const MIT_NEU = normalizeCalendarConfig(rohKonfig({ epochen: (e) => [...e, NEU] }));

function nachtragVon(alt, neu) {
  const liste = epochenNachtraege(alt, neu);
  expect(liste).toHaveLength(1);
  return liste[0];
}

describe('Nachtrag erkennen (epochenNachtraege)', () => {
  it('erkennt die neue jüngste Epoche und nennt das Kürzel der bisherigen', () => {
    const [n] = epochenNachtraege(ALT, MIT_NEU);
    expect({ blockId: n.blockId, calId: n.calId, name: n.name, label: n.label }).toEqual({
      blockId: 'welt',
      calId: 'eigen',
      name: 'Eigenkalender',
      label: 'n. Chr.',
    });
    // `alt` und `neu` sind die normalisierten Kalender selbst.
    expect(n.alt).toBe(ALT.blocks[0].calendars[0]);
    expect(n.neu).toBe(MIT_NEU.blocks[0].calendars[0]);
  });

  it('erkennt keinen Nachtrag, wenn eine Epoche VOR der jüngsten eingefügt wird', () => {
    const davor = normalizeCalendarConfig(
      rohKonfig({
        epochen: (e) => [e[0], { name: 'Mitte', abbr: 'M', start: [-500, 1, 1] }, e[1]],
      }),
    );
    expect(davor.blocks[0].calendars[0].epochs).toHaveLength(3);
    expect(epochenNachtraege(ALT, davor)).toEqual([]);
  });

  it('erkennt keinen Nachtrag, wenn die jüngste Epoche entfernt wird', () => {
    const entfernt = normalizeCalendarConfig(rohKonfig());
    expect(epochenNachtraege(MIT_NEU, entfernt)).toEqual([]);
  });

  it('erkennt keinen Nachtrag, wenn der Beginn der jüngsten Epoche verschoben wird', () => {
    const verschoben = normalizeCalendarConfig(
      rohKonfig({ epochen: (e) => [...e, { ...NEU, start: [2031, 1, 1] }] }),
    );
    expect(epochenNachtraege(MIT_NEU, verschoben)).toEqual([]);
    // Auch nicht, wenn hinter der verschobenen eine weitere hinzukommt: Die
    // bisher jüngste steht mit ihrem Beginn nicht mehr in der Definition.
    const verschobenUndMehr = normalizeCalendarConfig(
      rohKonfig({
        epochen: (e) => [
          ...e,
          { ...NEU, start: [2031, 1, 1] },
          { name: 'Später', abbr: 'Sp', start: [2050, 1, 1] },
        ],
      }),
    );
    expect(epochenNachtraege(MIT_NEU, verschobenUndMehr)).toEqual([]);
  });

  it('erkennt keinen Nachtrag, wenn nur das Kürzel der jüngsten geändert wird', () => {
    const umbenannt = normalizeCalendarConfig(
      rohKonfig({ epochen: (e) => [e[0], { ...e[1], abbr: 'AD', name: 'Anno Domini' }] }),
    );
    expect(epochenNachtraege(ALT, umbenannt)).toEqual([]);
  });

  it('lässt neue, abgeleitete und blockfremde Zeitrechnungen aus', () => {
    const roh = rohKonfig({ epochen: (e) => [...e, NEU] });
    // Eine neu angelegte Zeitrechnung mit drei Epochen hat keinen Vorgänger.
    roh.blocks[0].calendars.push({
      ...createGregorianTemplate({ id: 'frisch', name: 'Frisch' }),
      epochs: [...createGregorianTemplate().epochs, NEU],
    });
    // Eine Ableitung steht in beiden Definitionen.
    const ableitung = { id: 'abl', name: 'Ableitung', derivedFrom: 'eigen', zero: [2000, 1, 1] };
    const altRoh = rohKonfig();
    altRoh.blocks[0].calendars.push(ableitung);
    roh.blocks[0].calendars.push(ableitung);
    // Ein zweiter Block mit Nachtrag, den die alte Definition nicht kennt.
    roh.blocks.push({
      id: 'anderswo',
      calendars: [
        {
          ...createGregorianTemplate({ id: 'eigen' }),
          epochs: [...createGregorianTemplate().epochs, NEU],
        },
      ],
    });
    const liste = epochenNachtraege(normalizeCalendarConfig(altRoh), normalizeCalendarConfig(roh));
    expect(liste.map((n) => `${n.blockId}/${n.calId}`)).toEqual(['welt/eigen']);
  });

  it('nimmt als Kürzel ersatzweise den Namen und zuletzt die Form #N', () => {
    const nurName = (abbr, name) =>
      normalizeCalendarConfig(rohKonfig({ epochen: (e) => [e[0], { ...e[1], abbr, name }, NEU] }));
    expect(nachtragVon(ALT, nurName('', 'Anno Domini')).label).toBe('Anno Domini');
    expect(nachtragVon(ALT, nurName('', '')).label).toBe('#2');
  });

  it('liefert ohne Definition auf einer Seite nichts', () => {
    expect(epochenNachtraege(null, MIT_NEU)).toEqual([]);
    expect(epochenNachtraege(ALT, null)).toEqual([]);
  });
});

describe('Angaben des Kerns (parseCanonical mit reportLabel)', () => {
  const eigen = ALT.blocks[0].calendars[0];
  const mit = (text) => parseCanonical(eigen, text, { reportLabel: true });

  it('meldet, ob der Wert ein Kürzel trägt, und den Zeit-Teil, wie er geschrieben steht', () => {
    expect([mit('2026-09-30').labeled, mit('2026-09-30').timeText]).toEqual([false, '']);
    expect([mit('2026-09-30  14:30').labeled, mit('2026-09-30  14:30').timeText]).toEqual([
      false,
      '14:30',
    ]);
    expect([mit('2026-09-30 n. Chr.').labeled, mit('2026-09-30 n. Chr.').timeText]).toEqual([
      true,
      '',
    ]);
    expect([mit('44-03-15 #1 08:00').labeled, mit('44-03-15 #1 08:00').timeText]).toEqual([
      true,
      '08:00',
    ]);
  });

  it('lässt die Rückgabe ohne Option Feld für Feld, wie sie war', () => {
    expect(Object.keys(parseCanonical(eigen, '2026-09-30 n. Chr.')).sort()).toEqual([
      'epochIndex',
      'ok',
      'tuple',
    ]);
  });
});

describe('Wert sichern (sichereWert)', () => {
  const nachtrag = nachtragVon(ALT, MIT_NEU);

  // Die Gegenprobe der Sitzung vom 2026-10-01, Zeile für Zeile.
  it.each([
    ['2026-09-30', '2026-09-30 n. Chr.'],
    ['2029-12-31', '2029-12-31 n. Chr.'],
    ['2030-01-01', '1-01-01'],
    ['2040-05-01', '11-05-01'],
    ['2040-05-01 14:30', '11-05-01 14:30'],
    ['2040-05-01 n. Chr.', '11-05-01'],
    ['2029-12-31 n. Chr.', null],
    ['44-03-15 v. Chr.', null],
    ['44-03-15 v. Chr. 08:00', null],
  ])('%s → %s', (wert, erwartet) => {
    expect(sichereWert(nachtrag, wert)).toBe(erwartet);
  });

  it('lässt den Zeit-Teil stehen, wie er geschrieben ist, und ersetzt ein bisheriges Kürzel', () => {
    expect(sichereWert(nachtrag, '2026-09-30 14:30')).toBe('2026-09-30 n. Chr. 14:30');
    expect(sichereWert(nachtrag, '2026-09-30 14')).toBe('2026-09-30 n. Chr. 14');
    expect(sichereWert(nachtrag, '2040-05-01 n. Chr. 14:30:05')).toBe('11-05-01 14:30:05');
  });

  it('bietet einen Wert mit Kürzel vor der Grenze nicht an — er bleibt richtig', () => {
    expect(sichereWert(nachtrag, '2026-09-30 n. Chr.')).toBeNull();
    expect(sichereWert(nachtrag, '2026-09-30 n. Chr. 14:30')).toBeNull();
    expect(sichereWert(nachtrag, '2026-09-30 #2')).toBeNull();
  });

  it('bietet einen ungültigen Wert nicht an', () => {
    expect(sichereWert(nachtrag, '2026-02-30')).toBeNull();
    expect(sichereWert(nachtrag, 'unsinn')).toBeNull();
    expect(sichereWert(nachtrag, '2026-09-30 kaputt')).toBeNull();
  });

  it('schreibt ab der Grenze mit Kürzel, wenn die Zeitrechnung es immer schreibt', () => {
    const immer = nachtragVon(
      normalizeCalendarConfig(rohKonfig({ eigen: { alwaysWriteEpoch: true } })),
      normalizeCalendarConfig(
        rohKonfig({ eigen: { alwaysWriteEpoch: true }, epochen: (e) => [...e, NEU] }),
      ),
    );
    expect(sichereWert(immer, '2040-05-01 n. Chr.')).toBe('11-05-01 Neu');
    expect(sichereWert(immer, '2026-09-30')).toBe('2026-09-30 n. Chr.');
  });

  // Die Probe auf die Tupel-Gleichheit: Die neue Definition gibt der bisher
  // jüngsten Epoche dasselbe Kürzel wie der ältesten. Die neue Schreibweise ist
  // dort gültig, wird aber als Jahr der ältesten gelesen — ein anderer Tag.
  it('bietet einen Wert nicht an, den die neue Definition in neuer Schreibweise anders liest', () => {
    const doppelt = normalizeCalendarConfig(
      rohKonfig({ epochen: (e) => [{ ...e[0], abbr: 'Z' }, { ...e[1], abbr: 'Z' }, NEU] }),
    );
    const n = nachtragVon(ALT, doppelt);
    expect(n.label).toBe('Z');
    expect(parseCanonical(n.neu, '2026-09-30 Z').ok).toBe(true);
    expect(sichereWert(n, '2026-09-30')).toBeNull();
  });

  it('bezeichnet nach dem Sichern denselben Tag wie zuvor (AK3), gemessen am Vergleichskalender', () => {
    const block = (konfig) => konfig.blocks[0];
    for (const wert of ['2026-09-30', '2026-09-30 14:30', '1-01-01', '2040-05-01 n. Chr.']) {
      const neu = sichereWert(nachtrag, wert);
      expect(neu).not.toBeNull();
      const vorher = parseCanonical(nachtrag.alt, wert).tuple;
      const nachher = parseCanonical(nachtrag.neu, neu).tuple;
      expect(nachher).toEqual(vorher);
      expect(convertInBlock(block(MIT_NEU), 'eigen', nachher, 'vergleich')).toEqual(
        convertInBlock(block(ALT), 'eigen', vorher, 'vergleich'),
      );
    }
    // Und der Schaden, gegen den das Ganze steht: ohne Sichern ein anderer Tag.
    const ohne = parseCanonical(nachtrag.neu, '2026-09-30').tuple;
    expect(convertInBlock(block(MIT_NEU), 'eigen', ohne, 'vergleich').tuple.slice(0, 3)).toEqual([
      4055, 9, 30,
    ]);
  });
});

// --- Die Zusage über jeden Tag eines Zeitraums ---------------------------------
//
// Für jeden Tag: Entweder liest die neue Definition den Wert unverändert als
// dasselbe Tupel (dann bietet `sichereWert` nichts an), oder `sichereWert`
// liefert einen Wert, den die neue Definition als dasselbe Tupel liest wie die
// alte den ursprünglichen. Ein Wert, dessen Lesung sich ändert und der nicht
// angeboten wird, ist ein Befund.

// Alle gültigen Tage zwischen zwei Daten (je einschließlich), in Minimal-Zeit.
function tage(cal, von, bis) {
  const vergleich = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const out = [];
  for (let j = von[0]; j <= bis[0]; j++) {
    for (let m = 1; m <= 12; m++) {
      for (let t = 1; t <= 31; t++) {
        const tag = [j, m, t];
        if (vergleich(tag, von) < 0 || vergleich(tag, bis) > 0) continue;
        const tupel = tag.concat([0, 0, 0]);
        if (validateTuple(cal, tupel).ok) out.push(tupel);
      }
    }
  }
  return out;
}

// Die Schreibweisen eines Tages, wie sie in Dokumenten stehen: ohne Kürzel und
// mit dem Kürzel der alten Lesung, je ohne und mit Zeit-Teil.
function schreibweisen(cal, tupel) {
  const datum = formatTuple(cal, tupel).split(' ')[0];
  const kuerzel = epochLabel(cal, epochOf(cal, tupel).index);
  return [datum, `${datum} ${kuerzel}`, `${datum} 14:30`, `${datum} ${kuerzel} 14:30`];
}

function pruefeZusage(nachtrag, tupelListe) {
  const befunde = [];
  const zahl = { unveraendert: 0, angeboten: 0 };
  for (const tupel of tupelListe) {
    for (const wert of schreibweisen(nachtrag.alt, tupel)) {
      const vorher = parseCanonical(nachtrag.alt, wert);
      if (!vorher.ok) continue;
      const heute = parseCanonical(nachtrag.neu, wert);
      const gesichert = sichereWert(nachtrag, wert);
      const gleich = heute.ok && heute.tuple.every((v, k) => v === vorher.tuple[k]);
      if (gleich) {
        zahl.unveraendert += 1;
        if (gesichert !== null)
          befunde.push(`${wert}: unverändert, aber angeboten als ${gesichert}`);
        continue;
      }
      zahl.angeboten += 1;
      if (gesichert === null) {
        befunde.push(`${wert}: Lesung ändert sich, aber nicht angeboten`);
        continue;
      }
      const nachher = parseCanonical(nachtrag.neu, gesichert);
      if (!nachher.ok || nachher.tuple.some((v, k) => v !== vorher.tuple[k])) {
        befunde.push(`${wert} → ${gesichert}: anderer Tag`);
      }
    }
  }
  return { befunde, zahl };
}

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

describe('Zusage über jeden Tag eines Zeitraums (Plan-Änderung vom 2026-10-01)', () => {
  it('gregorianische Vorlage, neue Epoche ab 2030-01-01: kein Wert ändert still seine Lesung', () => {
    const nachtrag = nachtragVon(ALT, MIT_NEU);
    const eigen = nachtrag.alt;
    const tupel = [
      // Ein Jahr vor bis ein Jahr nach der neuen Grenze, jeder Tag.
      ...tage(eigen, [2029, 1, 1], [2031, 1, 1]),
      // Die Grenze der Vergangenheits-Epoche (1 v. Chr. / 1 n. Chr.), jeder Tag.
      ...tage(eigen, [0, 12, 1], [1, 1, 31]),
      // Stichproben weit davor und weit danach.
      ...[-1000, -43, 500, 1582, 1999, 2026, 2100, 2500, 9999].flatMap((j) =>
        tage(eigen, [j, 1, 1], [j, 1, 3]).concat(tage(eigen, [j, 12, 30], [j, 12, 31])),
      ),
    ];
    const { befunde, zahl } = pruefeZusage(nachtrag, tupel);
    expect(befunde).toEqual([]);
    // Untere Schranke: Der Fall prüft wirklich beide Seiten der Grenze.
    expect(zahl.angeboten).toBeGreaterThan(1000);
    expect(zahl.unveraendert).toBeGreaterThan(500);
  });

  it('japanische Vorlage (Kürzel immer), neue Ära ab 2031-06-15: kein Wert ändert still seine Lesung', () => {
    const roh = findCalendarTemplate('japanese').create(tDe);
    const vorher = normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [roh] }] });
    const nachher = normalizeCalendarConfig({
      blocks: [
        {
          id: 'welt',
          calendars: [
            { ...roh, epochs: [...roh.epochs, { name: 'Neu', abbr: 'Neu', start: [2031, 6, 15] }] },
          ],
        },
      ],
    });
    const nachtrag = nachtragVon(vorher, nachher);
    expect(nachtrag.alt.alwaysWriteEpoch).toBe(true);
    const kal = nachtrag.alt;
    const tupel = [
      ...tage(kal, [2030, 6, 15], [2032, 6, 15]),
      // Die Grenze der Vergangenheits-Epoche («vor Meiji» / Meiji).
      ...tage(kal, [1868, 9, 1], [1868, 12, 31]),
      // Der Beginn von Reiwa und Stichproben weit davor und danach.
      ...tage(kal, [2019, 4, 25], [2019, 5, 5]),
      ...[1700, 1950, 2000, 2026, 2100, 2500].flatMap((j) => tage(kal, [j, 6, 14], [j, 6, 16])),
    ];
    const { befunde, zahl } = pruefeZusage(nachtrag, tupel);
    expect(befunde).toEqual([]);
    expect(zahl.angeboten).toBeGreaterThan(1000);
    expect(zahl.unveraendert).toBeGreaterThan(500);
    // Ab der Grenze in der Zählung der neuen Ära, mit ihrem Kürzel.
    expect(sichereWert(nachtrag, '13-07-01 Reiwa 09:15')).toBe('1-07-01 Neu 09:15');
  });
});

// Ein Text mit allen Lagen, in denen ein Wert stehen kann. Die Stellen, die
// gesichert werden müssen, tragen 2026-09-30, 2040-01-01 oder 2020-05-05; alles
// andere muss Zeichen für Zeichen stehen bleiben.
const TEXT = [
  '---',
  'termin: "@{Eigenkalender: 2026-09-30}"',
  '---',
  '',
  'Heute @{Eigenkalender: 2026-09-30 14:30} und klein @{eigenkalender: 2026-09-30}.',
  'Früher @{Eigenkalender: 44-03-15 v. Chr.}, gesichert @{Eigenkalender: 2026-09-30 n. Chr.}.',
  'Anderer @{Vergleichskalender: 2026-09-30}, Karte @@{14:00}, fremd @{Fremd: 2026-09-30}.',
  'Jenseits @{Eigenkalender: 2040-01-01}, ungültig @{Eigenkalender: 2026-02-30}.',
  '',
  '```js',
  'const beispiel = "@{Eigenkalender: 2020-05-05}";',
  '```',
  '',
].join('\n');

describe('Stellen finden (findeUngesicherte)', () => {
  const nachtraege = epochenNachtraege(ALT, MIT_NEU);

  it('findet die betroffenen Stellen in jedem Zusammenhang und nur diese', () => {
    const stellen = findeUngesicherte(TEXT, ALT, nachtraege);
    expect(stellen.map((s) => [s.wert, s.neu])).toEqual([
      ['2026-09-30', '2026-09-30 n. Chr.'],
      ['2026-09-30 14:30', '2026-09-30 n. Chr. 14:30'],
      ['2026-09-30', '2026-09-30 n. Chr.'],
      ['2040-01-01', '11-01-01'],
      ['2020-05-05', '2020-05-05 n. Chr.'],
    ]);
    for (const s of stellen) {
      expect(TEXT[s.offset]).toBe('@');
      expect(TEXT.slice(s.offset, s.offset + s.laenge)).toMatch(/^@\{[^}]*\}$/);
      expect([s.calId, s.blockId]).toEqual(['eigen', 'welt']);
    }
    // `ersatz` ist der ganze neue Text der Stelle, Kopf in der Schreibweise des
    // Dokuments.
    expect(stellen[2].ersatz).toBe('@{eigenkalender: 2026-09-30 n. Chr.}');
    expect(stellen[3].ersatz).toBe('@{Eigenkalender: 11-01-01}');
  });

  it('findet nichts ohne Nachtrag (AK4)', () => {
    expect(findeUngesicherte(TEXT, ALT, [])).toEqual([]);
    expect(findeUngesicherte(TEXT, ALT, epochenNachtraege(ALT, ALT))).toEqual([]);
  });

  it('übernimmt den Leerraum hinter dem Doppelpunkt in den Ersatz', () => {
    const text = 'A @{ Eigenkalender :2026-09-30}, B @{Eigenkalender:   2040-01-01 14:30 }.';
    expect(findeUngesicherte(text, ALT, nachtraege).map((s) => s.ersatz)).toEqual([
      '@{ Eigenkalender :2026-09-30 n. Chr.}',
      '@{Eigenkalender:   11-01-01 14:30}',
    ]);
  });
});

describe('Lauf über den Ersetzungs-Kern (laufOptionen und ersetzungen)', () => {
  it('beschreibt einen wörtlichen Lauf; der Text kommt je Fundstelle', () => {
    expect(laufOptionen()).toEqual({
      muster: '(?<!@)@\\{[^{}\\n]*\\}',
      flags: 'g',
      ersetzung: '',
      regexModus: false,
    });
  });

  it('schreibt an jeder Stelle genau ihren Ersatz und sonst nichts', () => {
    const nachtraege = epochenNachtraege(ALT, MIT_NEU);
    const stellen = findeUngesicherte(TEXT, ALT, nachtraege);
    expect(stellen).toHaveLength(5);
    const ergebnis = wendeErsetzungenAn(
      TEXT,
      stellen.map((s) => s.offset),
      laufOptionen(),
      stellen.map((s) => s.ersatz),
    );
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.anzahl).toBe(5);
    // Der ganze Text im Vergleich, von hinten nach vorn zusammengesetzt: Die
    // übrigen Werte — andere Zeitrechnung, schon gesichert, frühere Epoche,
    // ungültig, `@@{14:00}` — bleiben Zeichen für Zeichen stehen.
    let erwartet = TEXT;
    for (const s of [...stellen].reverse()) {
      erwartet = erwartet.slice(0, s.offset) + s.ersatz + erwartet.slice(s.offset + s.laenge);
    }
    expect(ergebnis.text).toBe(erwartet);
    expect(ergebnis.text).toContain('Jenseits @{Eigenkalender: 11-01-01}, ungültig');
    // Jeder geschriebene Wert bezeichnet in der neuen Definition denselben Tag
    // wie vorher in der alten. (Eine zweite Zählung mit der ALTEN Definition
    // über den geschriebenen Text wäre dagegen falsch: `11-01-01` ist in der
    // neuen Schreibweise richtig und in der alten ein anderer Tag — das Sichern
    // ist nicht wiederholbar, siehe den Fall unten.)
    const vorher = findCalendarValues(TEXT);
    const nachher = findCalendarValues(ergebnis.text);
    for (const s of stellen) {
      const i = vorher.findIndex((v) => v.from === s.offset);
      expect(parseCanonical(nachtraege[0].neu, nachher[i].value).tuple).toEqual(
        parseCanonical(nachtraege[0].alt, vorher[i].value).tuple,
      );
    }
  });

  // Kein Schutz, sondern die Beschreibung einer Grenze, auf die der Aufrufer
  // achten muss: Ein zweiter Lauf mit derselben alten Definition über bereits
  // gesicherten Text deutete die neu geschriebenen Werte als alte und
  // verschöbe sie ein zweites Mal. Gezählt wird deshalb vor dem Schreiben, und
  // nach dem Speichern der Einstellungen ist die gespeicherte Definition die
  // neue — ein Nachtrag liegt dann nicht mehr vor.
  it('ist nach dem Speichern nicht erneut anwendbar: dort ist die neue Definition die alte', () => {
    const nachtraege = epochenNachtraege(ALT, MIT_NEU);
    const stellen = findeUngesicherte(TEXT, ALT, nachtraege);
    const ergebnis = wendeErsetzungenAn(
      TEXT,
      stellen.map((s) => s.offset),
      laufOptionen(),
      stellen.map((s) => s.ersatz),
    );
    expect(epochenNachtraege(MIT_NEU, MIT_NEU)).toEqual([]);
    expect(findeUngesicherte(ergebnis.text, ALT, nachtraege).map((s) => s.wert)).toEqual([
      '11-01-01',
    ]);
  });

  it('weist einen Offset ab, der nicht auf einen Wert zeigt', () => {
    const karte = TEXT.indexOf('@@{14:00}');
    for (const offset of [karte, karte + 1]) {
      expect(wendeErsetzungenAn(TEXT, [offset], laufOptionen(), ['x'])).toEqual({
        ok: false,
        grund: 'offsetUngueltig',
      });
    }
  });
});
