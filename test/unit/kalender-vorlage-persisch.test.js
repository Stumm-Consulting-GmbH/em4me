// 4T-002007 (Epic 3E-000333): Nachweis der persischen Kalender-Vorlage in der
// amtlichen Lesart, der ersten Vorlage mit einer erzeugten Tafel
// (src/shared/calendar/year-tables/persian.js, Erzeuger
// scripts/kalender-tafel-erzeugen.js). Grundsatz E8 des Epics: nie gegen die
// eigene Umrechnung und nie gegen die Quelle, aus der die Tafel stammt (A6).
// Die Tafel ist aus der Kalender-Schnittstelle erzeugt; nachgewiesen wird sie
// gegen die amtliche Schaltjahr-Tafel und zwei amtliche Anker-Tage des
// Kalender-Zentrums der Universität Teheran (test/fixtures/kalender-persisch/,
// Quellenangabe in QUELLE.md):
//   1) Wiederholbarkeit des Erzeugers, Byte für Byte;
//   2) Umfang und Gestalt der Tafel;
//   3) Schaltjahre aller 201 Jahre gegen die Teheraner Marken;
//   4) jeder Jahresbeginn aus Anker und Marken allein, ohne Schnittstelle,
//      ohne Tafel und ohne Rechen-Kern;
//   5) Gleichlauf mit der Quelle Tag für Tag (kein Nachweis im Sinne von A6,
//      sondern die Prüfung, dass Leser und Vorlage die Tafel unverfälscht zeigen);
//   6) Stichproben mit Herkunft; 7) Ränder und «nicht bekannt»; 8) Vorlage.
// Menü-Platz und Namen in fünf Sprachen prüfen test/unit/kalender-vorlagen.test.js
// und test/unit/renderer/kalender-vorlagen-menue.test.js mit den übrigen Vorlagen.
//
// Die Messung vom 2026-10-24 (Tests/3E-000333/4T-002007/, unversioniert) hat die
// Schnittstelle im System-Node (ICU 77.1) und im Electron des Programms
// (ICU 74.2) im Zeitraum Zeile für Zeile gleich gefunden.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import de from '../../src/i18n/de.json';
import { RECHEN_ZEITLIMIT } from '../zeitlimits.js';
import teheran from '../fixtures/kalender-persisch/teheran-schaltjahre.json';
import erzeuger from '../../scripts/kalender-tafel-erzeugen.js';
import tafel from '../../src/shared/calendar/year-tables/persian.js';
import {
  convertInBlock,
  formatTuple,
  parseCanonical,
  segmentRanges,
  validateTuple,
} from '../../src/shared/calendar/calendar-core.js';
import {
  calendarStartPoint,
  configForPersist,
  deriveCalendar,
  normalizeCalendarConfig,
} from '../../src/shared/calendar/calendar-config.js';
import {
  blockEquivalents,
  EQUIVALENT_UNKNOWN,
} from '../../src/shared/calendar/calendar-convert.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';

const ID = 'persian';
const TAG_MS = 86400000;
const NULLUHR = [0, 0, 0];

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus den Vorlagen, über die Sammlung mit deutschem Katalog erzeugt, wie
// das Aufklapp-Menü sie anlegt.
function blockAus(ids) {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: ids.map((id) => ({ id, ...findCalendarTemplate(id).create(tDe) })),
      },
    ],
  });
  const block = config.blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(ids);
  return block;
}

function blockMitPersisch() {
  const block = blockAus(['gregorian', ID]);
  return { block, kalender: block.calendars[1] };
}

function persischAus(block, gregorianisch) {
  const r = convertInBlock(block, 'gregorian', gregorianisch.concat(NULLUHR), ID);
  if (!r.ok) throw new Error(`Umrechnung von ${gregorianisch.join('-')} scheitert: ${r.code}`);
  return r.tuple;
}

function gregorianischAus(block, tupel) {
  const r = convertInBlock(block, ID, tupel, 'gregorian');
  if (!r.ok) throw new Error(`Umrechnung von ${tupel.join('/')} scheitert: ${r.code}`);
  return r.tuple;
}

// Rata Die eines gregorianischen Tages über Date (Tag 1 ist der 01.01.0001),
// unabhängig vom Kalender-Kern; für die Jahre des Zeitraums genügt Date.UTC.
const rataDie = (j, m, t) => Math.floor(Date.UTC(j, m - 1, t) / TAG_MS) + 719163;
function gregorianischVon(rd) {
  const d = new Date((rd - 719163) * TAG_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

const SCHALT = new Set(teheran.schaltjahre);
const zeilenOhneKommentar = () => tafel.jahre.slice();

// --- 1) Wiederholbarkeit ---------------------------------------------------------------

describe('1) Erzeuger: Wiederholbarkeit Byte für Byte (4T-002007, AK3)', () => {
  it(
    'AK3: ein zweiter Lauf mit Stand und Fassung aus dem Kopf ergibt dieselbe Datei',
    () => {
      const vorhanden = fs.readFileSync(erzeuger.tafelPfad(ID), 'utf8');
      const kopf = erzeuger.liesKopf(vorhanden);
      expect(kopf).not.toBe(null);
      const neu = erzeuger.erzeugeTafelText(ID, kopf).text;
      if (neu !== vorhanden) {
        const a = vorhanden.split('\n');
        const b = neu.split('\n');
        const i = a.findIndex((z, k) => z !== b[k]);
        throw new Error(
          `Schnittstelle rechnet anders (ICU ${process.versions.icu}): Zeile ${i + 1} ` +
            `Datei «${a[i]}», erzeugt «${b[i]}». Befund über die Schnittstelle; die Tafel ` +
            'nicht neu erzeugen, ohne den Nachweis neu zu bewerten.',
        );
      }
      expect(neu).toBe(vorhanden);
    },
    RECHEN_ZEITLIMIT,
  );

  it('AK3: die Prüfsumme im Kopf ist die der Zeilen', () => {
    const summe = erzeuger.pruefsumme(zeilenOhneKommentar());
    expect(tafel.pruefsumme).toBe(summe);
    expect(fs.readFileSync(erzeuger.tafelPfad(ID), 'utf8')).toContain(`// ${summe}.`);
  });
});

// --- 2) Umfang und Gestalt ------------------------------------------------------------

describe('2) Tafel: Umfang und Gestalt (4T-002007, AK3)', () => {
  it('AK3: 201 Jahre ab 1279, 21.03.1900 bis 20.03.2101, 73 414 Tage, 49 Schaltjahre', () => {
    expect(tafel.name).toBe(ID);
    expect(tafel.ersteJahr).toBe(1279);
    expect(tafel.ersterTag).toBe(rataDie(1900, 3, 21));
    expect(tafel.namensStellen).toBe(12);
    expect(tafel.jahre).toHaveLength(201);
    let tage = 0;
    let schalt = 0;
    for (const zeile of tafel.jahre) {
      const laengen = zeile.split(',').map(Number);
      expect(laengen.slice(0, 6), zeile).toEqual([31, 31, 31, 31, 31, 31]);
      expect(laengen.slice(6, 11), zeile).toEqual([30, 30, 30, 30, 30]);
      expect([29, 30], zeile).toContain(laengen[11]);
      expect(laengen).toHaveLength(12);
      if (laengen[11] === 30) schalt += 1;
      tage += laengen.reduce((a, b) => a + b, 0);
    }
    expect(tage).toBe(73414);
    expect(schalt).toBe(49);
    expect(tafel.ersterTag + tage).toBe(rataDie(2101, 3, 21));
  });
});

// --- 3) Teheraner Tafel: Schaltjahre ------------------------------------------------------

describe('3) Teheraner Tafel: Schaltjahre (4T-002007, AK2)', () => {
  it('AK2: Prüf-Material vollständig — 49 Schaltjahre, sechs mit Fünf-Jahres-Schaltung', () => {
    expect([teheran.erstesJahr, teheran.letztesJahr]).toEqual([1279, 1479]);
    expect(teheran.schaltjahre).toHaveLength(49);
    expect(teheran.fuenfjaehrig).toEqual([1309, 1342, 1375, 1408, 1441, 1474]);
    for (const j of teheran.fuenfjaehrig) expect(SCHALT.has(j)).toBe(true);
  });

  it('AK2: für jedes Jahr 1279 bis 1479 hat Esfand genau dann 30 Tage, wenn Teheran es markiert', () => {
    const { block, kalender } = blockMitPersisch();
    const abweichend = [];
    for (let j = 1279; j <= 1479; j++) {
      const r = validateTuple(kalender, [j, 12, 30, 0, 0, 0]);
      if (r.ok !== SCHALT.has(j)) abweichend.push(j);
    }
    expect(abweichend).toEqual([]);
    // Die beiden Grenzjahre der Messung vom 2026-10-10, einzeln.
    expect(SCHALT.has(1309)).toBe(true);
    expect(gregorianischAus(block, [1309, 1, 1, 0, 0, 0])).toEqual([1930, 3, 21, 0, 0, 0]);
    expect(SCHALT.has(1469)).toBe(true);
    expect(gregorianischAus(block, [1470, 1, 1, 0, 0, 0])).toEqual([2091, 3, 21, 0, 0, 0]);
  });
});

// --- 4) Teheraner Tafel: Jahresbeginne aus Anker und Marken ---------------------------------

describe('4) Teheraner Tafel: jeder Jahresbeginn aus Anker und Marken (4T-002007, AK2)', () => {
  // Jahresbeginn je persischem Jahr allein aus dem Anker 1. Farvardin 1403 =
  // 20.03.2024 und den Teheraner Schaltmarken (365 oder 366 Tage je Jahr).
  function beginneAusTeheran() {
    const [aj, am, at] = teheran.anker[1].gregorianisch.split('-').map(Number);
    expect(teheran.anker[1].persisch).toEqual([1403, 1, 1]);
    const laenge = (j) => (SCHALT.has(j) ? 366 : 365);
    const beginn = new Map([[1403, rataDie(aj, am, at)]]);
    for (let j = 1404; j <= 1480; j++) beginn.set(j, beginn.get(j - 1) + laenge(j - 1));
    for (let j = 1402; j >= 1279; j--) beginn.set(j, beginn.get(j + 1) - laenge(j));
    return beginn;
  }

  it('AK2: alle 201 Jahresbeginne gleich der Vorlage, das Ende am 20.03.2101', () => {
    const { block } = blockMitPersisch();
    const beginn = beginneAusTeheran();
    const abweichend = [];
    for (let j = 1279; j <= 1479; j++) {
      const erwartet = gregorianischVon(beginn.get(j));
      const ist = gregorianischAus(block, [j, 1, 1, 0, 0, 0]).slice(0, 3);
      if (ist.join('-') !== erwartet.join('-')) abweichend.push(`${j}: ${ist} statt ${erwartet}`);
    }
    expect(abweichend).toEqual([]);
    expect(gregorianischVon(beginn.get(1279))).toEqual([1900, 3, 21]);
    expect(gregorianischVon(beginn.get(1480))).toEqual([2101, 3, 21]);
    const letzter = SCHALT.has(1479) ? 30 : 29;
    expect(gregorianischAus(block, [1479, 12, letzter, 0, 0, 0])).toEqual([2101, 3, 20, 0, 0, 0]);
  });

  it('AK2: der zweite amtliche Anker (29. Esfand 1359 = 20.03.1981) folgt aus derselben Rechnung', () => {
    const { block } = blockMitPersisch();
    const beginn = beginneAusTeheran();
    expect(teheran.anker[0]).toMatchObject({
      gregorianisch: '1981-03-20',
      persisch: [1359, 12, 29],
    });
    expect(gregorianischVon(beginn.get(1360) - 1)).toEqual([1981, 3, 20]);
    expect(persischAus(block, [1981, 3, 20]).slice(0, 3)).toEqual([1359, 12, 29]);
  });
});

// --- 5) Gleichlauf mit der Quelle --------------------------------------------------------

describe('5) Gleichlauf mit der Quelle Tag für Tag (4T-002007, AK3)', () => {
  it(
    'AK3: jeder Tag 21.03.1900 bis 20.03.2101 gleich der Kalender-Schnittstelle',
    () => {
      const { block } = blockMitPersisch();
      const f = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      expect(f.resolvedOptions().calendar).toBe('persian');
      const abweichend = [];
      let tage = 0;
      for (let ms = Date.UTC(1900, 2, 21); ms <= Date.UTC(2101, 2, 20); ms += TAG_MS) {
        const d = new Date(ms);
        const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
        const ist = persischAus(block, [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
        const soll = [Number(p.year), Number(p.month), Number(p.day)];
        if (ist.slice(0, 3).join('-') !== soll.join('-') && abweichend.length < 10) {
          abweichend.push(`${d.toISOString().slice(0, 10)}: ${ist.slice(0, 3)} statt ${soll}`);
        }
        tage += 1;
      }
      expect(tage).toBe(73414);
      expect(abweichend, `ICU ${process.versions.icu}`).toEqual([]);
    },
    RECHEN_ZEITLIMIT,
  );
});

// --- 6) Stichproben -----------------------------------------------------------------------

const STICHPROBEN = [
  { gregorianisch: [2025, 3, 21], persisch: [1404, 1, 1], herkunft: 'Story 4S-001110, AK14' },
  { gregorianisch: [2025, 3, 20], persisch: [1403, 12, 30], herkunft: 'Story AK14, Vortag' },
  { gregorianisch: [1981, 3, 20], persisch: [1359, 12, 29], herkunft: 'Teheran, Anker 1360' },
  { gregorianisch: [2024, 3, 20], persisch: [1403, 1, 1], herkunft: 'Teheran, Anker 1403' },
  // Rata Die 710 347, 727 274, 728 714, 744 313, 764 652.
  ...[
    [
      [1945, 11, 12],
      [1324, 8, 21],
    ],
    [
      [1992, 3, 17],
      [1370, 12, 27],
    ],
    [
      [1996, 2, 25],
      [1374, 12, 6],
    ],
    [
      [2038, 11, 10],
      [1417, 8, 19],
    ],
    [
      [2094, 7, 18],
      [1473, 4, 28],
    ],
  ].map(([gregorianisch, persisch]) => ({
    gregorianisch,
    persisch,
    herkunft: 'Referenzwerk, Anhang C (aus dem Gedächtnis, nicht am Buch geprüft)',
  })),
];

describe('6) Stichproben mit Herkunft (4T-002007, AK2)', () => {
  it('AK2: neun Stichproben hin und zurück', () => {
    const { block } = blockMitPersisch();
    expect(rataDie(1945, 11, 12)).toBe(710347);
    expect(rataDie(2094, 7, 18)).toBe(764652);
    for (const { gregorianisch, persisch, herkunft } of STICHPROBEN) {
      expect(persischAus(block, gregorianisch), herkunft).toEqual(persisch.concat(NULLUHR));
      expect(gregorianischAus(block, persisch.concat(NULLUHR)), herkunft).toEqual(
        gregorianisch.concat(NULLUHR),
      );
    }
  });
});

// --- 7) Ränder und «nicht bekannt» -----------------------------------------------------------

describe('7) Ränder und «nicht bekannt» (4T-002007, Story AK5, AK6, AK10)', () => {
  it('AK4: erster und letzter Tag mit Datum, die Tage davor und danach «nicht bekannt»', () => {
    const { block } = blockMitPersisch();
    expect(persischAus(block, [1900, 3, 21])).toEqual([1279, 1, 1, 0, 0, 0]);
    expect(persischAus(block, [2101, 3, 20])).toEqual([1479, 12, 29, 0, 0, 0]);
    for (const tag of [
      [1900, 3, 20],
      [2101, 3, 21],
      [1899, 6, 15],
    ]) {
      expect(convertInBlock(block, 'gregorian', tag.concat(NULLUHR), ID), tag.join('-')).toEqual({
        ok: false,
        code: 'unknown',
      });
    }
    for (const tupel of [
      [1278, 12, 29, 0, 0, 0],
      [1480, 1, 1, 0, 0, 0],
    ]) {
      expect(convertInBlock(block, ID, tupel, 'gregorian'), tupel.join('/')).toEqual({
        ok: false,
        code: 'unknown',
      });
      expect(validateTuple(block.calendars[1], tupel).ok, tupel.join('/')).toBe(false);
    }
  });

  it('AK4: im Dialog die Zeile «nicht bekannt», die übrigen Zeilen mit Wert', () => {
    const block = blockAus(['gregorian', ID, 'hebrew']);
    const zeilen = blockEquivalents(block, 'gregorian', [1900, 3, 20, 0, 0, 0]);
    expect(zeilen.ok).toBe(true);
    const nach = Object.fromEntries(zeilen.rows.map((z) => [z.calendar.id, z]));
    expect(nach[ID]).toMatchObject({ ok: false, code: EQUIVALENT_UNKNOWN });
    expect(nach.hebrew).toMatchObject({ ok: true });
    const am = blockEquivalents(block, 'gregorian', [1900, 3, 21, 0, 0, 0]);
    expect(Object.fromEntries(am.rows.map((z) => [z.calendar.id, z]))[ID]).toMatchObject({
      ok: true,
      tuple: [1279, 1, 1, 0, 0, 0],
    });
  });

  it('AK4: die Eingabe-Hilfe bietet die Jahre 1279 bis 1479 an', () => {
    const { kalender } = blockMitPersisch();
    expect(segmentRanges(kalender, [1404, 1, 1, 0, 0, 0])[0]).toMatchObject({
      min: 1279,
      max: 1479,
    });
  });
});

// --- 8) Vorlage -------------------------------------------------------------------------------

describe('8) Anlegen wie das Aufklapp-Menü (4T-002007, Story AK2, AK9)', () => {
  it('AK5: gültige Definition ohne Anker, Woche ab dem Stichtag, keine Gruppierungen', () => {
    const roh = findCalendarTemplate(ID).create(tDe);
    expect(roh).not.toHaveProperty('blockAnchor');
    const { kalender } = blockMitPersisch();
    expect(kalender.name).toBe('Persischer Kalender');
    expect(kalender.blockAnchor).toBe(undefined);
    expect(kalender.levels.map((lv) => [lv.id, lv.rel ? lv.rel.type : null])).toEqual([
      ['second', null],
      ['minute', 'factor'],
      ['hour', 'factor'],
      ['day', 'factor'],
      ['month', 'byYear'],
      ['year', 'yearly'],
    ]);
    expect(kalender.levels[4].names).toEqual(de['settings.calendar.tpl.persian.months'].split(','));
    expect(kalender.levels[4].names).toHaveLength(12);
    expect(kalender.levels[5].rel).toEqual({ type: 'yearly', table: 'persian' });
    // 21.03.2025 ist ein Freitag (Montag = 0).
    expect(kalender.cycles[0].anchor).toEqual({ tuple: [1404, 1, 1], position: 4 });
    expect(kalender.groups).toEqual([]);
    expect(kalender.epochs.map((e) => [e.name, e.abbr, e.start])).toEqual([
      ['vor AP', 'vor AP', null],
      ['AP', 'AP', [1, 1, 1]],
    ]);
  });

  it('AK5: Startpunkt ohne Anker-Datum ist der erste Tag der Tafel', () => {
    const { block, kalender } = blockMitPersisch();
    const start = calendarStartPoint(kalender);
    expect(start).toEqual([1279, 1, 1, 0, 0, 0]);
    expect(gregorianischAus(block, start)).toEqual([1900, 3, 21, 0, 0, 0]);
  });

  it('AK5: Monats-Kennung ohne L, benannte Form mit dem Monatsnamen', () => {
    const { kalender } = blockMitPersisch();
    const gelesen = parseCanonical(kalender, '1403-12-30');
    expect(gelesen).toMatchObject({ ok: true, tuple: [1403, 12, 30, 0, 0, 0] });
    expect(formatTuple(kalender, gelesen.tuple)).toBe('1403-12-30');
    expect(formatTuple(kalender, gelesen.tuple, { named: true })).toBe('1403-Essfand-30');
    expect(parseCanonical(kalender, '1404-12-30')).toMatchObject({ ok: false });
    expect(parseCanonical(kalender, '1403-12L-01')).toMatchObject({ ok: false });
  });

  it('AK6: Rundlauf über die Bereichsdatei Zeichen für Zeichen, ohne Zeile der Tafel (B3)', () => {
    const roh = {
      blocks: [{ id: 'welt', calendars: [{ id: ID, ...findCalendarTemplate(ID).create(tDe) }] }],
    };
    const norm = normalizeCalendarConfig(roh);
    const abgelegt = JSON.stringify(configForPersist(roh, norm));
    const wieder = normalizeCalendarConfig(JSON.parse(abgelegt));
    expect(JSON.stringify(configForPersist(JSON.parse(abgelegt), wieder))).toBe(abgelegt);
    expect(JSON.parse(abgelegt).blocks[0].calendars[0].levels[5].rel).toEqual({
      type: 'yearly',
      table: 'persian',
    });
    expect(abgelegt).not.toContain(tafel.jahre[0]);
    expect(abgelegt).not.toContain('31,31,31');
  });

  it('AK6: umbenannt und mit anderen Wochentags-Namen rechnet sie unverändert', () => {
    const roh = { id: ID, ...findCalendarTemplate(ID).create(tDe) };
    roh.name = 'Mein Kalender';
    roh.cycles[0].names = roh.cycles[0].names.map((n) => `${n} (geändert)`);
    const block = normalizeCalendarConfig({
      blocks: [{ id: 'welt', calendars: [findCalendarTemplate('gregorian').create(tDe), roh] }],
    }).blocks[0];
    const gregorianisch = block.calendars[0];
    expect(block.calendars[1].name).toBe('Mein Kalender');
    expect(convertInBlock(block, gregorianisch.id, [2025, 3, 21, 0, 0, 0], ID)).toEqual({
      ok: true,
      tuple: [1404, 1, 1, 0, 0, 0],
    });
  });

  it('AK6: nicht als Bezug einer Ableitung angeboten (B4)', () => {
    const { kalender } = blockMitPersisch();
    const ableitung = { id: 'abl', name: 'abl', derivedFrom: ID, zero: [1404, 1, 1] };
    expect(deriveCalendar(kalender, ableitung)).toBe(null);
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'welt',
          calendars: [{ id: ID, ...findCalendarTemplate(ID).create(tDe) }, ableitung],
        },
      ],
    });
    expect(config.blocks[0].calendars.map((c) => c.id)).toEqual([ID]);
  });
});
