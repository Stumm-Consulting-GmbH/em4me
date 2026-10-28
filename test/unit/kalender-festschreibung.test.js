// 4T-002363 (Epic 3E-000333): Festschreibung des heutigen Kalender-Rechnens.
//
// Warum es diese Prüfdatei gibt: Der Baustein «Jahres-Struktur je Jahr» ändert
// den Rechen-Kern (calendar-core.js). Ein Fehler dort wäre in sich schlüssig
// und fiele erst bei einer Umrechnung auf. Deshalb wird das Rechnen aller
// bestehenden Definitionen VOR der ersten Änderung festgeschrieben und bleibt
// danach als Wächter stehen: Jede spätere Änderung am Kern muss für diese
// Definitionen Tag für Tag dasselbe liefern.
//
// Gegenstand: die neun Vorlagen der ersten Stufe (angelegt auf dem Weg des
// Aufklapp-Menüs: Fabrik, Normalisierung), die eingebaute Standard-
// Zeitrechnung, die beiden Kalender der Demo-Sammlung (src/demo) und drei
// Probe-Definitionen (nur feste Faktoren; Längen-Tabelle ohne Schalt-Regel
// mit eigenem Anker und gebrochener Skala; eine abgeleitete Zeitrechnung).
// Seit 4T-002005 dazu die hebräische Vorlage, die erste mit Jahres-Struktur;
// ihre Zeile kam mit ihrer Aufnahme hinzu, die übrigen blieben unverändert.
// Ebenso seit 4T-002007 die persische Vorlage, die erste mit einer Tafel; ihr
// Raster beginnt und endet am Zeitraum der Tafel (rasterGrenzen). Seit
// 4T-002006 ebenso die chinesische Vorlage mit ihrer Tafel; die übrigen Zeilen
// blieben unverändert. Seit 4T-002008 ebenso die Vorlage nach Umm al-Qura mit
// ihrer Tafel, Raster am Zeitraum der Tafel; die übrigen Zeilen unverändert.
//
// Raster: jeder eigene Tag vom 01.01.1890 bis 31.12.2110 (gregorianisch),
// dazu Stichproben in fernen Jahren bis ±1 Million und an den Grenzen der
// größten Jahreszahl (±2^53). Je Tag: Achse → Datum, Datum → Achse,
// kanonische Form (Zahlen und Namen), Lesen der kanonischen Form, Zeitalter,
// Woche (Stelle und Nummer), Gruppierung und Umrechnung zur gregorianischen
// Vorlage. Festgeschrieben wird je Definition eine Prüfsumme über alle
// Ergebnisse und eine über die Definition selbst; dazu Klartext-Fälle.
//
// Neu festschreiben (nur, wenn eine Änderung des Rechnens gewollt ist, etwa
// eine neue Ära einer Vorlage): EM4ME_FESTSCHREIBUNG_AUSGEBEN=1 setzen und
// die Prüfdatei laufen lassen; sie gibt die heutigen Prüfsummen aus.
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mddStore from '../../src/main/documents/mdd-store.js';
import { RECHEN_ZEITLIMIT } from '../zeitlimits.js';
import { CALENDAR_TEMPLATES } from '../../src/shared/calendar/calendar-templates.js';
import {
  configForPersist,
  normalizeCalendarConfig,
  standardCalendar,
} from '../../src/shared/calendar/calendar-config.js';
import {
  axisToTuple,
  compileSafe,
  convertBetween,
  cycleAt,
  epochOf,
  formatTuple,
  groupAt,
  parseCanonical,
  segmentRanges,
  tupleToAxis,
} from '../../src/shared/calendar/calendar-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAGMENT = path.resolve(HERE, '..', '..', 'src', 'i18n', 'fragments', 'de', 'calendar.json');
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// Deutsche Texte aus dem Kalender-Fragment (Quelle der Übersetzungen); ein
// fehlender Schlüssel bricht ab, damit keine Vorlage still mit Schlüsseln als
// Namen rechnet. Die Namen gehen in Definition und benannte Form ein: Eine
// Änderung der deutschen Vorlagen-Texte verlangt deshalb ein Neu-Festschreiben
// (Weg oben); die Prüfdatei steht dafür auch im Ausschnitt der Sprachdateien.
const DE = JSON.parse(fs.readFileSync(FRAGMENT, 'utf8'));
const t = (key) => {
  if (!(key in DE)) throw new Error(`Schlüssel fehlt in den deutschen Fragmenten: ${key}`);
  return DE[key];
};

// --- Die festgeschriebenen Definitionen ---------------------------------------------

// Probe 1: nur feste Faktoren, zwei Ebenen-Bereiche, Woche und Gruppierung.
const PROBE_FAKTOREN = {
  id: 'probe-faktoren',
  name: 'Probe Faktoren',
  levels: [
    { id: 'minute', name: 'Minute', section: 'Zeit', start: 0 },
    { id: 'stunde', name: 'Stunde', section: 'Zeit', start: 0, rel: { type: 'factor', count: 50 } },
    { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 20 } },
    {
      id: 'monat',
      name: 'Monat',
      section: 'Datum',
      start: 1,
      names: ['Erster', 'Zweiter', 'Dritter', 'Vierter', 'Fünfter', 'Sechster', 'Siebter'],
      rel: { type: 'factor', count: 36 },
    },
    { id: 'jahr', name: 'Jahr', section: 'Datum', start: 1, rel: { type: 'factor', count: 10 } },
  ],
  cycles: [
    {
      id: 'woche',
      name: 'Woche',
      of: 'tag',
      length: 6,
      names: ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'],
      anchor: { tuple: [3, 2, 5], position: 4 },
      numbering: { ruleIndex: 3 },
    },
  ],
  groups: [{ id: 'quartal', name: 'Quartal', of: 'monat', size: 3 }],
  epochs: [
    { name: 'vor', abbr: 'v', start: null },
    { name: 'Zeitalter', abbr: 'Z', start: [1, 1, 1] },
    { name: 'Neue Zeit', abbr: 'NZ', start: [400, 4, 1] },
  ],
};

// Probe 2: Längen-Tabelle ohne Schalt-Regel (fünf Monate, zwei Durchläufe je
// Jahr), eigener Anker und gebrochene Skala (ein eigener Tag sind anderthalb
// Tage der Block-Achse): prüft die eine Abrundung der Umrechnung.
const PROBE_LAENGEN = {
  id: 'probe-laengen',
  name: 'Probe Längen',
  levels: [
    { id: 'stunde', name: 'Stunde', section: 'Zeit', start: 0 },
    { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 24 } },
    {
      id: 'monat',
      name: 'Monat',
      section: 'Datum',
      start: 1,
      rel: { type: 'lengths', table: [30, 31, 29, 33, 28] },
    },
    { id: 'jahr', name: 'Jahr', section: 'Datum', start: 0, rel: { type: 'factor', count: 10 } },
  ],
  cycles: [{ id: 'woche', name: 'Woche', of: 'tag', length: 7 }],
  epochs: [
    { name: 'früher', abbr: 'f', start: null },
    { name: 'später', abbr: 's', start: [5, 3, 7] },
  ],
  blockAnchor: [-1200, 4, 17, 6],
  blockScale: { num: 36, den: 24 },
};

// Probe 3: abgeleitete Zeitrechnung auf der gregorianischen Vorlage desselben
// Blocks (Nullpunkt mitten in einem Schaltjahr, hinter dem Schalttag).
const PROBE_ABGELEITET = {
  id: 'probe-abgeleitet',
  name: 'Probe abgeleitet',
  derivedFrom: 'gregorian',
  zero: [1904, 3, 15],
  depth: 2,
  labelBefore: 'vorher',
  labelAfter: 'nachher',
};

// Anlage wie das Aufklapp-Menü: Fabrik → Normalisierung (vollständige Definition).
function bestand() {
  const rohKalender = CALENDAR_TEMPLATES.map((entry) => ({ ...entry.create(t), id: entry.id }));
  const roh = {
    blocks: [
      {
        id: 'festschreibung',
        name: 'Festschreibung',
        calendars: [...rohKalender, PROBE_FAKTOREN, PROBE_LAENGEN, PROBE_ABGELEITET],
      },
    ],
  };
  const normalisiert = normalizeCalendarConfig(roh);
  const demoRoh = fs.readFileSync(path.join(DEMO_DIR, mddStore.MDDA_FILENAME), 'utf8');
  const demo = normalizeCalendarConfig(
    mddStore.parseSettingsContainer(demoRoh).container.settings.calendarSystems,
  );
  return { roh, normalisiert, demo };
}

const { roh: ROH, normalisiert: NORM, demo: DEMO } = bestand();
const BLOCK = NORM.blocks[0];
const GREG = BLOCK.calendars.find((c) => c.id === 'gregorian');

const DEFINITIONEN = [
  ...BLOCK.calendars.map((cal) => ({ key: cal.id, cal })),
  { key: '@standard', cal: standardCalendar() },
  ...DEMO.blocks[0].calendars.map((cal) => ({ key: `demo:${cal.id}`, cal })),
];

// --- Spur des Rechnens -------------------------------------------------------------------

const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x === undefined ? null : x));

function versuche(fn) {
  try {
    return fn();
  } catch (err) {
    return `throw:${err && err.message}`;
  }
}

// Alle Ergebnisse eines Tupels als eine Zeile.
function zeileZuTupel(cal, tuple) {
  const teile = [json(tuple)];
  teile.push(json(versuche(() => tupleToAxis(cal, tuple))));
  const fmt = versuche(() => formatTuple(cal, tuple));
  teile.push(json(fmt));
  teile.push(json(versuche(() => formatTuple(cal, tuple, { named: true }))));
  teile.push(json(typeof fmt === 'string' ? versuche(() => parseCanonical(cal, fmt)) : null));
  teile.push(json(versuche(() => epochOf(cal, tuple))));
  teile.push(json(versuche(() => (cal.cycles.length ? cycleAt(cal, tuple) : null))));
  teile.push(json(versuche(() => (cal.groups.length ? groupAt(cal, tuple) : null))));
  teile.push(json(versuche(() => segmentRanges(cal, tuple))));
  teile.push(json(versuche(() => convertBetween(cal, tuple, GREG))));
  return teile.join('|');
}

// Erste und letzte eigene Achsen-Stelle des Rasters: die Entsprechung von
// 01.01.1890 und 31.12.2110 der gregorianischen Vorlage, je auf den Tag.
// 4T-002007: Liegt ein Raster-Ende außerhalb des Zeitraums einer Tafel (die
// Umrechnung sagt «nicht bekannt»), gilt der erste beziehungsweise letzte Tag
// der Tafel; für alle übrigen Definitionen bleibt das Raster, wie es war.
function rasterGrenzen(cal) {
  const c = compileSafe(cal);
  const tagEinheit = c.unitLen[c.timeCount];
  const bei = (datum, randTupel) => {
    const r = convertBetween(GREG, [...datum, 0, 0, 0], cal);
    const t2 = r.ok
      ? r.tuple.map((v, k) => (k < c.dateCount ? v : c.levels[c.top - k].start))
      : randTupel();
    return tupleToAxis(cal, t2);
  };
  const ersterTag = () => {
    const jahre = segmentRanges(cal, jahresBeginn(cal, 1))[0];
    return jahresBeginn(cal, jahre.min);
  };
  const letzterTag = () => {
    const jahre = segmentRanges(cal, jahresBeginn(cal, 1))[0];
    const tupel = jahresBeginn(cal, jahre.max);
    for (let k = 1; k < c.dateCount; k++) tupel[k] = segmentRanges(cal, tupel)[k].max;
    return tupel;
  };
  return { von: bei([1890, 1, 1], ersterTag), bis: bei([2110, 12, 31], letzterTag), tagEinheit };
}

// Höchstens so viele eigene Tage, wie das gregorianische Raster hat: Eine
// Probe mit anderer Skala hätte sonst ein Vielfaches an Tagen.
const RASTER_TAGE_HOECHSTENS = 80718;

function spurRaster(cal, hash) {
  const { von, bis, tagEinheit } = rasterGrenzen(cal);
  let tage = 0;
  for (let axis = von; axis <= bis && tage < RASTER_TAGE_HOECHSTENS; axis += tagEinheit) {
    const tuple = axisToTuple(cal, axis);
    hash.update(`${axis}>${zeileZuTupel(cal, tuple)}\n`);
    tage++;
  }
  return tage;
}

// Stichproben: ferne Jahre (je ihre ersten 40 Tage) und die Grenzen der
// größten Jahreszahl (dort auch die Achse darüber hinaus).
const FERNE_JAHRE = [-1000000, -654321, -1, 0, 1, 99999, 654321, 1000000];
const GRENZ_JAHRE = [MAX_SAFE, MAX_SAFE - 1, -MAX_SAFE, -MAX_SAFE + 1];

function jahresBeginn(cal, jahr) {
  const c = compileSafe(cal);
  const out = [jahr];
  for (let k = 1; k < c.levels.length; k++) out.push(c.levels[c.top - k].start);
  return out;
}

function spurStichproben(cal, hash) {
  const c = compileSafe(cal);
  const tagEinheit = c.unitLen[c.timeCount];
  for (const jahr of FERNE_JAHRE) {
    const start = versuche(() => tupleToAxis(cal, jahresBeginn(cal, jahr)));
    hash.update(`ferne:${jahr}:${json(start)}\n`);
    if (typeof start !== 'bigint') continue;
    for (let i = 0n; i < 40n; i++) {
      const axis = start + i * tagEinheit;
      hash.update(`${axis}>${zeileZuTupel(cal, axisToTuple(cal, axis))}\n`);
    }
  }
  for (const jahr of GRENZ_JAHRE) {
    const tuple = jahresBeginn(cal, jahr);
    hash.update(`grenze:${jahr}:${zeileZuTupel(cal, tuple)}\n`);
    const axis = versuche(() => tupleToAxis(cal, tuple));
    if (typeof axis !== 'bigint') continue;
    for (const d of [-1n, 1n, 400n * 366n]) {
      const a = axis + d * tagEinheit * (jahr > 0 ? 1n : -1n);
      hash.update(`grenze+${d}:${a}>${json(versuche(() => axisToTuple(cal, a)))}\n`);
    }
  }
}

function pruefsummen(cal) {
  const rechnen = crypto.createHash('sha256');
  const tage = spurRaster(cal, rechnen);
  spurStichproben(cal, rechnen);
  const definition = crypto.createHash('sha256').update(json(cal)).digest('hex').slice(0, 24);
  return { tage, definition, rechnen: rechnen.digest('hex').slice(0, 24) };
}

// --- Festgeschriebene Werte (Stand vor der ersten Änderung am Kern) -------------------

const FESTGESCHRIEBEN = {
  gregorian: {
    tage: 80718,
    definition: '927b6fec146176ff8a9dcf31',
    rechnen: '11e714825ed119071d9ac4f4',
  },
  julian: {
    tage: 80718,
    definition: '9b1d498ec83dc7b9b7f796d9',
    rechnen: 'e3ef02fe3ad48461e02fc1be',
  },
  'islamic-tabular': {
    tage: 80718,
    definition: '05de2f040d1d990f3beddeb1',
    rechnen: '30031e89b2276c0e8293625d',
  },
  // 4T-002008 (Epic 3E-000333): die Vorlage nach Umm al-Qura, festgeschrieben mit
  // ihrer Aufnahme über den Zeitraum der Tafel (64 850 Tage); die übrigen Zeilen
  // unverändert.
  'islamic-umalqura': {
    tage: 64850,
    definition: '61d000d4d7e8c0a738da8da4',
    rechnen: '84ab720d72b741665ce6fb2c',
  },
  // 4T-002007 (Epic 3E-000333): die erste Vorlage mit einer Tafel, festgeschrieben
  // mit ihrer Aufnahme über den Zeitraum der Tafel (73 414 Tage); die übrigen
  // Zeilen unverändert.
  persian: {
    tage: 73414,
    definition: '6e5f83075d5b4965e2370edd',
    rechnen: '214cb4a2a81e88e051e99786',
  },
  // 4T-002005 (Epic 3E-000333): die erste Vorlage mit Jahres-Struktur,
  // festgeschrieben mit ihrer Aufnahme; die übrigen Zeilen unverändert.
  hebrew: {
    tage: 80718,
    definition: 'd128c2bd716d76254ffd6e39',
    rechnen: '1c4e7e9d59ca97ba0514beed',
  },
  // 4T-002006 (Epic 3E-000333): die chinesische Vorlage, festgeschrieben mit
  // ihrer Aufnahme über den Zeitraum der Tafel (73 028 Tage); die übrigen
  // Zeilen unverändert.
  chinese: {
    tage: 73028,
    definition: 'cfa580504196cc8245ec6f0a',
    rechnen: 'b053578be09ab7c5ad5dc985',
  },
  indian: {
    tage: 80718,
    definition: '58e23a986d12f42dfceb4bd5',
    rechnen: '4a95241687764a8ab2100cc4',
  },
  buddhist: {
    tage: 80718,
    definition: '2948d24f3f366d99bdf9c600',
    rechnen: 'b2d3d43dd3ac2bf2ad5692c4',
  },
  ethiopic: {
    tage: 80718,
    definition: '2c6011b620bd7e219359db34',
    rechnen: '1b85f2e1eeab722e3c0d43ee',
  },
  coptic: {
    tage: 80718,
    definition: 'ddd0c5fc497f0bebda8b8d10',
    rechnen: '6e5eb12896c94f7b59590b69',
  },
  japanese: {
    tage: 80718,
    definition: '054655da77437a07de886b87',
    rechnen: 'e0da37111155e9916455aa14',
  },
  minguo: {
    tage: 80718,
    definition: '25b874fb1f5b702ae5ce294f',
    rechnen: 'f0bcdfb2482894f0dbc67802',
  },
  'probe-faktoren': {
    tage: 80718,
    definition: '0da15538ec68d4ea08d949d7',
    rechnen: '8c936bbf43087397f664e332',
  },
  'probe-laengen': {
    tage: 80718,
    definition: 'e80372178be3f65d31ef464e',
    rechnen: '20f8a0fba36c98f208cfb394',
  },
  'probe-abgeleitet': {
    tage: 80718,
    definition: 'befa591d604433a747b35491',
    rechnen: '76f31f9e4d49092b1098d2a9',
  },
  '@standard': {
    tage: 80718,
    definition: 'e4ee9aed6a74bd9a5d1023c1',
    rechnen: '11e714825ed119071d9ac4f4',
  },
  'demo:gregorian-calendar': {
    tage: 80718,
    definition: 'b3888c3e094fa5f3f3638eb3',
    rechnen: '754c644ad700650e931e1786',
  },
  'demo:japanese-calendar': {
    tage: 80718,
    definition: '386baa056c3e5130810b597a',
    rechnen: 'ff50a75151d1246f5a0435cc',
  },
};

// --- Prüffälle ---------------------------------------------------------------------------

const AUSGEBEN = process.env.EM4ME_FESTSCHREIBUNG_AUSGEBEN === '1';
const NEU_FESTSCHREIBEN =
  'Das Rechnen einer bestehenden Kalender-Definition hat sich geändert. Ist das ungewollt, liegt ' +
  'ein Fehler im Rechen-Kern vor. Ist es gewollt (geänderte Vorlage oder deutsche Vorlagen-Texte), ' +
  'mit EM4ME_FESTSCHREIBUNG_AUSGEBEN=1 neu ausgeben und die Werte übernehmen.';

describe('Festschreibung des heutigen Kalender-Rechnens (4T-002363)', () => {
  // 4T-002005: zehn Vorlagen, seit die hebräische hinzukam; 4T-002007: elf mit
  // der persischen; 4T-002006: zwölf mit der chinesischen; 4T-002008: dreizehn
  // mit der nach Umm al-Qura.
  it('Bestand: dreizehn Vorlagen, drei Proben, Standard-Zeitrechnung und zwei Demo-Kalender', () => {
    expect(CALENDAR_TEMPLATES.map((e) => e.id)).toHaveLength(13);
    expect(BLOCK.calendars.map((c) => c.id)).toEqual([
      ...CALENDAR_TEMPLATES.map((e) => e.id),
      'probe-faktoren',
      'probe-laengen',
      'probe-abgeleitet',
    ]);
    expect(DEMO.blocks[0].calendars.map((c) => c.id)).toHaveLength(2);
    expect(DEFINITIONEN).toHaveLength(19);
  });

  it('Rundlauf-Zusage: Ablage-Form ist ein Fixpunkt von Einlesen und erneutem Ablegen', () => {
    const abgelegt = JSON.parse(JSON.stringify(configForPersist(ROH, NORM)));
    const wieder = normalizeCalendarConfig(abgelegt);
    expect(JSON.stringify(configForPersist(abgelegt, wieder))).toBe(JSON.stringify(abgelegt));
    // Die abgeleitete Zeitrechnung bleibt in ihrer kurzen Roh-Form abgelegt.
    expect(abgelegt.blocks[0].calendars.at(-1)).toEqual(PROBE_ABGELEITET);
  });

  it('Klartext-Fälle zur Lesbarkeit', () => {
    const jul = BLOCK.calendars.find((c) => c.id === 'julian');
    const tag = [2000, 1, 1, 0, 0, 0];
    expect(formatTuple(GREG, tag)).toBe('2000-01-01');
    expect(formatTuple(GREG, tag, { named: true })).toBe('2000-Januar-01');
    // Der 01.01.2000 ist ein Samstag und liegt in der 52. Woche von 1999.
    const woche = cycleAt(GREG, tag);
    expect([woche.positionName, woche.number, woche.year]).toEqual(['Samstag', 52, 1999]);
    expect(formatTuple(jul, convertBetween(GREG, tag, jul).tuple)).toBe('1999-12-19');
    // Schalttag und sein Fehlen.
    expect(parseCanonical(GREG, '2000-02-29').ok).toBe(true);
    expect(parseCanonical(GREG, '1900-02-29')).toEqual({
      ok: false,
      code: 'segmentRange',
      levelId: 'day',
    });
    expect(parseCanonical(jul, '1900-02-29').ok).toBe(true);
    // Die abgeleitete Zeitrechnung: der Nullpunkt ist Tag 1.
    const abg = BLOCK.calendars.find((c) => c.id === 'probe-abgeleitet');
    const null1904 = convertBetween(GREG, [1904, 3, 15, 0, 0, 0], abg);
    expect(formatTuple(abg, null1904.tuple)).toBe('0-0-1');
  });

  for (const { key, cal } of DEFINITIONEN) {
    it(
      `${key}: Prüfsummen über Definition und Rechnen unverändert`,
      { timeout: RECHEN_ZEITLIMIT },
      () => {
        const t0 = Date.now();
        const ist = pruefsummen(cal);
        if (AUSGEBEN) {
          const ms = Date.now() - t0;
          console.warn(
            `FESTSCHREIBUNG ${JSON.stringify(key)}: ${JSON.stringify(ist)}, // ${ms} ms`,
          );
          return;
        }
        expect(ist.tage).toBeGreaterThan(1000);
        expect(ist, NEU_FESTSCHREIBEN).toEqual(FESTGESCHRIEBEN[key]);
      },
    );
  }

  it('die eingebaute Standard-Zeitrechnung rechnet wie die gregorianische Vorlage', () => {
    expect(FESTGESCHRIEBEN['@standard'].rechnen).toBe(FESTGESCHRIEBEN.gregorian.rechnen);
  });
});
