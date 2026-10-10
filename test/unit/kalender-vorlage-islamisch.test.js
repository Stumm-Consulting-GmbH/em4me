// 4T-002002 (Epic 3E-000307): Nachweis der tabellarischen islamischen
// Kalender-Vorlage (Hidschri-Kalender, Schema II mit bürgerlicher Epoche, bei
// van Gent «IIc») — Voll-Durchlauf gegen die Internationalisierungs-
// Schnittstelle mit dem Kalender «islamic-civil», Stichtage der Erhebung,
// Grenzfälle, Umrechnung im Block mit Uhrzeit. Grundsatz E8 des Epics: nie
// gegen die eigene Umrechnung. Menü-Platz und Namen in fünf Sprachen prüft
// test/unit/kalender-vorlagen.test.js mit den übrigen Vorlagen.
//
// Achtung bei der Schnittstelle: Sie kennt neben «islamic-civil» auch
// «islamic-tbla» (dasselbe Schema, astronomische Epoche, einen Tag früher) und
// «islamic-umalqura» (saudi-arabischer Kalender). Verglichen wird allein mit
// «islamic-civil»; der Fall prüft den aufgelösten Kalender.
//
// Die Stichtage stammen aus der Erhebung Tests/3E-000307/Erhebung/teil-b/islamisch.md
// (unversioniert; dort je Paar das wörtliche Zitat und der abgelegte
// Abruf-Text, Abruf jeweils am 2026-09-30).
//
// Laufzeit: gemessen am 2026-09-30 isoliert rund 0,5 s für den Voll-Durchlauf
// (73 414 Tage, ein Formatierer für alle Tage).
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import {
  convertInBlock,
  epochOf,
  cycleAt,
  validateTuple,
} from '../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';

const ID = 'islamic-tabular';

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus der gregorianischen und der islamischen Vorlage, beide über die
// Sammlung mit deutschem Katalog erzeugt.
function blockMitIslamisch() {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: [
          findCalendarTemplate('gregorian').create(tDe),
          findCalendarTemplate(ID).create(tDe),
        ],
      },
    ],
  });
  const block = config.blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(['gregorian', ID]);
  return { block, kalender: block.calendars[1] };
}

// Stand der Vorlage zu einem gregorianischen Tag; ohne expect, weil die
// Funktion im Voll-Durchlauf für jeden Tag läuft.
function vorlagenStand(block, kalender, gregorianisch) {
  const r = convertInBlock(block, 'gregorian', gregorianisch.concat([0, 0, 0]), ID);
  if (!r.ok) throw new Error(`Umrechnung von ${gregorianisch.join('-')} scheitert: ${r.code}`);
  const ep = epochOf(kalender, r.tuple);
  return {
    epoche: ep.index,
    jahr: ep.year,
    monat: r.tuple[1],
    tag: r.tuple[2],
    wochentag: cycleAt(kalender, r.tuple, 'week').position,
    tupel: r.tuple,
  };
}

const WOCHENTAG = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Leser der Schnittstelle mit EINEM Formatierer. «islamic-civil» führt ein
// einziges Zeitalter «AH» mit Jahr 0 und negativen Jahren (gemessen in der
// Erhebung: 600 n. Chr. ergibt −22 AH); ein Jahr y ≤ 0 ist in der Vorlage das
// Jahr 1 − y vor AH.
function schnittstelle() {
  const format = new Intl.DateTimeFormat('en-u-ca-islamic-civil-nu-latn', {
    timeZone: 'UTC',
    era: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  expect(format.resolvedOptions().calendar).toBe('islamic-civil');
  return (datum) => {
    const teile = {};
    for (const teil of format.formatToParts(datum)) teile[teil.type] = teil.value;
    const y = Number(teile.year);
    return {
      epoche: y >= 1 ? 1 : 0,
      jahr: y >= 1 ? y : 1 - y,
      monat: Number(teile.month),
      tag: Number(teile.day),
      wochentag: WOCHENTAG[teile.weekday],
    };
  };
}

// Mitternacht UTC eines proleptisch-gregorianischen Tages; setUTCFullYear statt
// Date.UTC, weil Date.UTC die Jahre 0 bis 99 als 1900 bis 1999 liest.
function utc(jahr, monat, tag) {
  const d = new Date(0);
  d.setUTCFullYear(jahr, monat - 1, tag);
  return d;
}

const TAG_MS = 86400000;
const segmente = (d) => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];

describe('Voll-Durchlauf gegen die Schnittstelle «islamic-civil» (4T-002002)', () => {
  it('AK1: 1900-01-01 bis 2100-12-31, Jahr, Monat, Tag und Wochentag ohne Abweichung', () => {
    const { block, kalender } = blockMitIslamisch();
    const lies = schnittstelle();
    const erster = Date.UTC(1900, 0, 1);
    const letzter = Date.UTC(2100, 11, 31);
    let tage = 0;
    const abweichungen = [];
    for (let ms = erster; ms <= letzter; ms += TAG_MS) {
      const d = new Date(ms);
      const g = segmente(d);
      tage++;
      const s = vorlagenStand(block, kalender, g);
      const i = lies(d);
      const modell = [s.epoche, s.jahr, s.monat, s.tag, s.wochentag];
      const soll = [i.epoche, i.jahr, i.monat, i.tag, i.wochentag];
      if (modell.some((v, k) => v !== soll[k])) {
        abweichungen.push(
          `${g.join('-')}: Modell ${modell.join('/')} ≠ Schnittstelle ${soll.join('/')}`,
        );
      }
    }
    expect(tage).toBe(73414);
    expect(abweichungen.length, abweichungen.slice(0, 10).join('\n')).toBe(0);
  });
});

// Stichtage aus islamisch.md: eigen = [Jahr AH, Monat, Tag]. Monate: 1 Muharram,
// 2 Safar, 3 Rabiʻ I, 4 Rabiʻ II, …, 9 Ramadan, 10 Schawwal, 11 Dhu l-qaʿda,
// 12 Dhu l-Hiddscha. Die Zeilen der englischen «List of Islamic years» nennen
// ihre Variante nicht («tabular schemes»); aufgenommen sind nur die Zeilen, die
// die Erhebung als ausdrücklich führt.
const DE_WP = 'https://de.wikipedia.org/wiki/Islamischer_Kalender';
const LISTE = 'https://en.wikipedia.org/wiki/List_of_Islamic_years';
const AUSDRUECKLICH = [
  { eigen: [1438, 9, 1], gregorianisch: [2017, 5, 27], quelle: DE_WP },
  { eigen: [1436, 1, 1], gregorianisch: [2014, 10, 25], quelle: DE_WP },
  { eigen: [1437, 1, 1], gregorianisch: [2015, 10, 15], quelle: DE_WP },
  { eigen: [1438, 1, 1], gregorianisch: [2016, 10, 3], quelle: DE_WP },
  { eigen: [1439, 1, 1], gregorianisch: [2017, 9, 22], quelle: DE_WP },
  { eigen: [1440, 1, 1], gregorianisch: [2018, 9, 12], quelle: DE_WP },
  { eigen: [1436, 12, 1], gregorianisch: [2015, 9, 15], quelle: DE_WP },
  { eigen: [1438, 4, 1], gregorianisch: [2016, 12, 31], quelle: DE_WP },
  { eigen: [1440, 4, 1], gregorianisch: [2018, 12, 10], quelle: DE_WP },
  { eigen: [1299, 1, 1], gregorianisch: [1881, 11, 23], quelle: LISTE },
  { eigen: [1300, 1, 1], gregorianisch: [1882, 11, 12], quelle: LISTE },
  { eigen: [1401, 1, 1], gregorianisch: [1980, 11, 9], quelle: LISTE },
  { eigen: [1445, 1, 1], gregorianisch: [2023, 7, 19], quelle: LISTE },
];
// Aus zitierter Regel gerechnet; die frühen Paare über die julianisch
// angegebene Epoche und die julianisch–gregorianische Differenz.
const ABGELEITET = [
  {
    eigen: [1, 1, 1],
    gregorianisch: [622, 7, 19],
    quelle: 'https://en.wikipedia.org/wiki/Islamic_calendar',
  },
  { eigen: [1, 12, 29], gregorianisch: [623, 7, 7], quelle: LISTE },
  { eigen: [367, 10, 28], gregorianisch: [978, 6, 13], quelle: DE_WP },
  { eigen: [1436, 12, 30], gregorianisch: [2015, 10, 14], quelle: DE_WP },
  { eigen: [1439, 12, 30], gregorianisch: [2018, 9, 11], quelle: DE_WP },
  { eigen: [1437, 12, 29], gregorianisch: [2016, 10, 2], quelle: DE_WP },
  { eigen: [1448, 1, 1], gregorianisch: [2026, 6, 17], quelle: DE_WP },
  { eigen: [1448, 4, 17], gregorianisch: [2026, 9, 30], quelle: DE_WP },
];

function pruefePaar(paar) {
  expect(paar.quelle).toMatch(/^https:\/\//);
  const { block, kalender } = blockMitIslamisch();
  const s = vorlagenStand(block, kalender, paar.gregorianisch);
  expect([s.epoche, s.jahr, s.monat, s.tag]).toEqual([1, ...paar.eigen]);
  // Rückweg: derselbe Tag der Vorlage ergibt wieder den gregorianischen Tag.
  expect(convertInBlock(block, ID, s.tupel, 'gregorian')).toEqual({
    ok: true,
    tuple: paar.gregorianisch.concat([0, 0, 0]),
  });
}

const text = (p) => `${p.eigen.join('-')} AH = ${p.gregorianisch.join('-')}`;

describe('Stichtage der Erhebung (4T-002002)', () => {
  it.each(AUSDRUECKLICH.map((p) => [text(p), p]))('AK2: ausdrücklich — %s', (_n, paar) =>
    pruefePaar(paar),
  );
  it.each(ABGELEITET.map((p) => [text(p), p]))('abgeleitet — %s', (_n, paar) => pruefePaar(paar));
});

// Grenzfälle: gregorianischer Tag → erwarteter Stand [Epoche (0 = vor AH),
// Anzeige-Jahr, Monat, Tag]; jede Erwartung zusätzlich gegen die Schnittstelle.
const GRENZFAELLE = [
  ['29. Dhu l-Hiddscha im Schaltjahr 1436', [2015, 10, 13], [1, 1436, 12, 29]],
  ['30. Dhu l-Hiddscha im Schaltjahr 1436 (Schalttag)', [2015, 10, 14], [1, 1436, 12, 30]],
  ['Tag nach dem Schalttag, Jahreswechsel (1 Muharram 1437)', [2015, 10, 15], [1, 1437, 1, 1]],
  ['Jahreswechsel im Gemeinjahr: 29. Dhu l-Hiddscha 1437', [2016, 10, 2], [1, 1437, 12, 29]],
  ['Jahreswechsel im Gemeinjahr: 1 Muharram 1438', [2016, 10, 3], [1, 1438, 1, 1]],
  ['Jahr 1: erster Tag der Epoche', [622, 7, 19], [1, 1, 1, 1]],
  ['Jahr 1 vor AH: letzter Tag', [622, 7, 18], [0, 1, 12, 29]],
  ['Jahr 1 vor AH: erster Tag', [621, 7, 30], [0, 1, 1, 1]],
  ['Jahr 2 vor AH (Schaltjahr): 30. Dhu l-Hiddscha', [621, 7, 29], [0, 2, 12, 30]],
  ['Jahr 2 vor AH: erster Tag', [620, 8, 9], [0, 2, 1, 1]],
];

describe('Grenzfälle (4T-002002)', () => {
  it.each(GRENZFAELLE.map(([name, g, e]) => [`${name}: ${g.join('-')} → ${e.join('/')}`, g, e]))(
    'AK2: %s',
    (_n, gregorianisch, erwartet) => {
      const { block, kalender } = blockMitIslamisch();
      const s = vorlagenStand(block, kalender, gregorianisch);
      expect([s.epoche, s.jahr, s.monat, s.tag]).toEqual(erwartet);
      const i = schnittstelle()(utc(...gregorianisch));
      expect([i.epoche, i.jahr, i.monat, i.tag]).toEqual(erwartet);
    },
  );

  it('AK2: der 30. Dhu l-Hiddscha ist im Schaltjahr gültig, im Gemeinjahr ungültig', () => {
    const { block, kalender } = blockMitIslamisch();
    // Interne Jahres-Zählung = Jahr AH.
    expect(validateTuple(kalender, [1436, 12, 30, 0, 0, 0]).ok).toBe(true);
    expect(validateTuple(kalender, [1439, 12, 30, 0, 0, 0]).ok).toBe(true);
    expect(validateTuple(kalender, [1437, 12, 30, 0, 0, 0])).toMatchObject({
      ok: false,
      code: 'segmentRange',
    });
    expect(validateTuple(kalender, [1438, 12, 30, 0, 0, 0]).ok).toBe(false);
    expect(convertInBlock(block, ID, [1437, 12, 30, 0, 0, 0], 'gregorian').ok).toBe(false);
  });

  it('AK2: Rundreise in sehr fernen Jahren (±1 000 000)', () => {
    const { block, kalender } = blockMitIslamisch();
    for (const tupel of [
      [1000000, 2, 3, 12, 30, 15],
      [-1000000, 2, 3, 12, 30, 15],
      [1000000, 1, 1, 0, 0, 0],
    ]) {
      expect(epochOf(kalender, tupel).index).toBe(tupel[0] > 0 ? 1 : 0);
      const hin = convertInBlock(block, ID, tupel, 'gregorian');
      expect(hin.ok).toBe(true);
      expect(convertInBlock(block, 'gregorian', hin.tuple, ID)).toEqual({ ok: true, tuple: tupel });
    }
  });
});

describe('Umrechnung im Block zur gregorianischen Vorlage mit Uhrzeit (4T-002002)', () => {
  it('AK3: belegte Tage rechnen mit Uhrzeit hin und zurück', () => {
    const { block } = blockMitIslamisch();
    for (const paar of [AUSDRUECKLICH[0], AUSDRUECKLICH[1], ABGELEITET[3]]) {
      for (const zeit of [
        [13, 45, 30],
        [23, 59, 59],
        [0, 0, 1],
      ]) {
        const eigen = paar.eigen.concat(zeit);
        const gregorianisch = paar.gregorianisch.concat(zeit);
        expect(convertInBlock(block, 'gregorian', gregorianisch, ID)).toEqual({
          ok: true,
          tuple: eigen,
        });
        expect(convertInBlock(block, ID, eigen, 'gregorian')).toEqual({
          ok: true,
          tuple: gregorianisch,
        });
      }
    }
  });
});
