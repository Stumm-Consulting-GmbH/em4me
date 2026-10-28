// 4T-002008 (Epic 3E-000333): Nachweis der islamischen Kalender-Vorlage nach
// Umm al-Qura in der heutigen amtlichen Ausgabe, Tafel
// src/shared/calendar/year-tables/islamic-umalqura.js (Erzeuger
// scripts/kalender-tafel-erzeugen.js). Grundsatz E8 des Epics: nie gegen die
// eigene Umrechnung und nie gegen die Quelle, aus der die Tafel stammt (A6).
// Die Tafel ist aus der Kalender-Schnittstelle erzeugt; nachgewiesen wird sie
// gegen die Monatsanfänge des amtlichen Portals der KACST
// (test/fixtures/kalender-umm-al-qura/, Quellenangabe in QUELLE.md):
//   1) Wiederholbarkeit des Erzeugers, Byte für Byte;
//   2) Umfang und Gestalt der Tafel;
//   3) amtliches Portal: Prüfsumme der Tafel-Zeilen gleich der allein aus den
//      Portal-Werten gebildeten (U6 des Tasks). Die Monatsanfänge selbst liegen
//      nicht im veröffentlichten Quellcode, weil die Nutzungsbedingungen des
//      Portals ihre Weitergabe nicht erlauben (F1, entschieden vom Product Owner
//      am 2026-10-24); sie stehen im unversionierten Protokoll
//      Tests/3E-000333/4T-002008/, das je Monat Portal und Schnittstelle
//      gegenüberstellt. Die Prüfsumme ist aus den Portal-Werten gebildet, nie
//      aus Schnittstelle oder Tafel; es ist ein Vergleich gegen eine zweite
//      Quelle, nicht gegen die eigene;
//   4) Gleichlauf mit der Quelle Tag für Tag (kein Nachweis im Sinne von A6,
//      sondern die Prüfung, dass Leser und Vorlage die Tafel unverfälscht zeigen);
//   5) Gegenprobe zur tabellarischen Lesart, unabhängig von Schnittstelle und
//      Portal: jeder Monatsanfang höchstens zwei Tage neben dem der
//      tabellarischen Rechnung (gemessen −2 bis +1 über alle 2 196 Monate);
//   6) Stichproben mit Herkunft; 7) Ränder und «nicht bekannt»; 8) Vorlage.
// Stichproben des Referenzwerks «Calendrical Calculations» entfallen für Umm
// al-Qura (F2, entschieden vom Product Owner am 2026-10-24): Jeder Monat ist
// gegen die Behörde selbst geprüft.
// Menü-Platz und Namen in fünf Sprachen prüfen test/unit/kalender-vorlagen.test.js
// und test/unit/renderer/kalender-vorlagen-menue.test.js mit den übrigen Vorlagen.
//
// Die Messung vom 2026-10-24 (Tests/3E-000333/4T-002008/, unversioniert) hat die
// Schnittstelle im System-Node (ICU 77.1) und im Electron des Programms
// (ICU 74.2) im Zeitraum Monat für Monat gleich gefunden.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import fr from '../../src/i18n/fr.json';
import es from '../../src/i18n/es.json';
import it_ from '../../src/i18n/it.json';
import { RECHEN_ZEITLIMIT } from '../zeitlimits.js';
import portal from '../fixtures/kalender-umm-al-qura/portal-abgleich.json';
import erzeuger from '../../scripts/kalender-tafel-erzeugen.js';
import tafel from '../../src/shared/calendar/year-tables/islamic-umalqura.js';
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

const ID = 'islamic-umalqura';
const TAG_MS = 86400000;
const NULLUHR = [0, 0, 0];
const PROTOKOLL = 'Tests/3E-000333/4T-002008/protokoll.md (unversioniert)';

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

function blockMitUmmAlQura() {
  const block = blockAus(['gregorian', ID]);
  return { block, kalender: block.calendars[1] };
}

function hidschriAus(block, gregorianisch) {
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
const isoTag = (s) => s.split('-').map(Number);

// --- 1) Wiederholbarkeit ---------------------------------------------------------------

describe('1) Erzeuger: Wiederholbarkeit Byte für Byte (4T-002008, AK3)', () => {
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
            'nicht neu erzeugen, ohne den Nachweis gegen das Portal neu zu bewerten.',
        );
      }
      expect(neu).toBe(vorhanden);
    },
    RECHEN_ZEITLIMIT,
  );

  it('AK3: die Prüfsumme im Kopf ist die der Zeilen', () => {
    const summe = erzeuger.pruefsumme(tafel.jahre.slice());
    expect(tafel.pruefsumme).toBe(summe);
    expect(fs.readFileSync(erzeuger.tafelPfad(ID), 'utf8')).toContain(`// ${summe}.`);
  });
});

// --- 2) Umfang und Gestalt ------------------------------------------------------------

describe('2) Tafel: Umfang und Gestalt (4T-002008, AK3)', () => {
  it('AK3: 183 Jahre ab 1318, 30.04.1900 bis 16.11.2077, 2 196 Monate, 64 850 Tage', () => {
    expect(tafel.name).toBe(ID);
    expect(tafel.ersteJahr).toBe(1318);
    expect(tafel.ersterTag).toBe(rataDie(1900, 4, 30));
    expect(tafel.ersterTag).toBe(693715);
    expect(tafel.namensStellen).toBe(12);
    expect(tafel.jahre).toHaveLength(183);
    let tage = 0;
    let monate = 0;
    let lang = 0;
    for (const zeile of tafel.jahre) {
      expect(zeile, zeile).toMatch(/^(29|30)(,(29|30)){11}$/);
      const summe = zeile.split(',').reduce((a, b) => a + Number(b), 0);
      expect([354, 355], zeile).toContain(summe);
      if (summe === 355) lang += 1;
      monate += 12;
      tage += summe;
    }
    expect(monate).toBe(2196);
    expect(tage).toBe(64850);
    expect(lang).toBe(68);
    expect(tafel.ersterTag + tage).toBe(rataDie(2077, 11, 17));
    expect(tafel.ersterTag + tage).toBe(758565);
  });
});

// --- 3) Amtliches Portal -----------------------------------------------------------------

describe('3) Amtliches Portal der KACST (4T-002008, AK2; Story AK3, AK8)', () => {
  it('AK2: das Prüf-Material ist vollständig — 183 Jahre, 2 196 Monatsanfänge, Abruf 2026-10-24', () => {
    expect(portal).toMatchObject({
      abruf: '2026-10-24',
      erstesJahr: 1318,
      letztesJahr: 1500,
      jahre: 183,
      monatsanfaenge: 2196,
      laengeLetzterMonat: 30,
      tage: 64850,
      jahreMit355Tagen: 68,
    });
    expect(portal.pruefsummeZeilen).toMatch(/^[0-9a-f]{64}$/);
    expect(portal.quelle).toContain('www.ummulqura.org.sa');
  });

  it('AK2: jeder der 2 196 Monatsanfänge der Tafel ist der des Portals (Prüfsumme der Zeilen)', () => {
    // Über die Zeilen der Tafel neu gerechnet, nicht aus ihrem Kopf gelesen.
    const summe = erzeuger.pruefsumme(tafel.jahre.slice());
    if (summe !== portal.pruefsummeZeilen) {
      throw new Error(
        `Tafel weicht vom amtlichen Portal ab (Prüfsumme ${summe}, Portal ` +
          `${portal.pruefsummeZeilen}). Den betroffenen Monat zeigt der Abgleich je Monat ` +
          `im Protokoll ${PROTOKOLL}, Abschnitt 2c.`,
      );
    }
    const letzte = tafel.jahre[tafel.jahre.length - 1].split(',').map(Number);
    expect(letzte[11]).toBe(portal.laengeLetzterMonat);
  });

  it('AK2: die Stichtage des Portals aus dem Wortlaut der Story, hin und zurück', () => {
    const { block } = blockMitUmmAlQura();
    expect(portal.stichtage).toHaveLength(3);
    for (const { gregorianisch, hidschri, herkunft } of portal.stichtage) {
      const g = isoTag(gregorianisch);
      expect(hidschriAus(block, g), herkunft).toEqual(hidschri.concat(NULLUHR));
      expect(gregorianischAus(block, hidschri.concat(NULLUHR)), herkunft).toEqual(
        g.concat(NULLUHR),
      );
    }
  });
});

// --- 4) Gleichlauf mit der Quelle --------------------------------------------------------

describe('4) Gleichlauf mit der Quelle Tag für Tag (4T-002008, AK3)', () => {
  it(
    'AK3: jeder Tag 30.04.1900 bis 16.11.2077 gleich der Kalender-Schnittstelle',
    () => {
      const { block } = blockMitUmmAlQura();
      const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      expect(f.resolvedOptions().calendar).toBe(ID);
      const abweichend = [];
      let tage = 0;
      for (let ms = Date.UTC(1900, 3, 30); ms <= Date.UTC(2077, 10, 16); ms += TAG_MS) {
        const d = new Date(ms);
        const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
        const ist = hidschriAus(block, [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
        const soll = [Number(p.year), Number(p.month), Number(p.day)];
        if (ist.slice(0, 3).join('-') !== soll.join('-') && abweichend.length < 10) {
          abweichend.push(`${d.toISOString().slice(0, 10)}: ${ist.slice(0, 3)} statt ${soll}`);
        }
        tage += 1;
      }
      expect(tage).toBe(64850);
      expect(abweichend, `ICU ${process.versions.icu}`).toEqual([]);
    },
    RECHEN_ZEITLIMIT,
  );
});

// --- 5) Gegenprobe zur tabellarischen Lesart ---------------------------------------------------

describe('5) Gegenprobe zur tabellarischen Lesart (4T-002008, AK2)', () => {
  // Tabellarische Rechnung, Schema II, bürgerliche Epoche (1. Muharram 1 AH =
  // 16.07.622 julianisch = Rata Die 227 015), ganzzahlig nachgerechnet, nicht
  // über die Vorlage islamic-tabular; Rata Die des 1. Tages von Monat m im Jahr j.
  const anfangTabellarisch = (j, m) =>
    227014 + 354 * (j - 1) + Math.floor((3 + 11 * j) / 30) + 29 * (m - 1) + Math.floor(m / 2) + 1;

  it('AK2: die Rechnung trifft zwei bekannte Tage der tabellarischen Lesart', () => {
    // 1. Muharram 1 AH = 16.07.622 julianisch = 19.07.622 gregorianisch proleptisch.
    expect(anfangTabellarisch(1, 1)).toBe(227015);
    // 1. Ramadan 1438 = 27.05.2017: Stichtag der Vorlage islamic-tabular
    // (calendar-template-systems.js, Rechenbeispiel mit bürgerlicher Epoche und
    // Schema II, belegt dort).
    expect(anfangTabellarisch(1438, 9)).toBe(rataDie(2017, 5, 27));
  });

  it('AK2: jeder Monatsanfang 1318 bis 1500 liegt höchstens zwei Tage neben der tabellarischen Rechnung', () => {
    const { block } = blockMitUmmAlQura();
    const weit = [];
    const versatz = new Set();
    for (let j = 1318; j <= 1500; j++) {
      for (let m = 1; m <= 12; m++) {
        const [gj, gm, gt] = gregorianischAus(block, [j, m, 1, 0, 0, 0]);
        const v = rataDie(gj, gm, gt) - anfangTabellarisch(j, m);
        versatz.add(v);
        if (Math.abs(v) > 2) weit.push(`${j}-${m}: ${v}`);
      }
    }
    expect(weit).toEqual([]);
    // Spanne genau −2 bis +1 (Messung vom 2026-10-24 über alle 2 196 Monate,
    // Tests/3E-000333/4T-002008/versatz.js): Eine um einen Tag verschobene Tafel
    // hätte −1 bis +2 oder −3 bis 0 und fiele hier auf, nicht erst bei der Schranke.
    expect([Math.min(...versatz), Math.max(...versatz)]).toEqual([-2, 1]);
  });
});

// --- 6) Stichproben -----------------------------------------------------------------------

const STICHPROBEN = [
  { gregorianisch: [2025, 3, 1], hidschri: [1446, 9, 1], herkunft: 'Story 4S-001110, AK14' },
  {
    gregorianisch: [2026, 2, 18],
    hidschri: [1447, 9, 1],
    herkunft: 'Kalender-Schnittstelle, Messung vom 2026-10-24; am Portal gegengelesen (Protokoll)',
  },
  {
    gregorianisch: [2026, 2, 17],
    hidschri: [1447, 8, 29],
    herkunft: 'Kalender-Schnittstelle, Vortag des 1. Ramadan 1447',
  },
  {
    gregorianisch: [2002, 3, 15],
    hidschri: [1423, 1, 1],
    herkunft: 'erster Tag der heutigen Regel (Recherche vom 2026-10-22)',
  },
];

describe('6) Stichproben mit Herkunft (4T-002008, AK2)', () => {
  it('AK2: vier Stichproben hin und zurück', () => {
    const { block } = blockMitUmmAlQura();
    for (const { gregorianisch, hidschri, herkunft } of STICHPROBEN) {
      expect(hidschriAus(block, gregorianisch), herkunft).toEqual(hidschri.concat(NULLUHR));
      expect(gregorianischAus(block, hidschri.concat(NULLUHR)), herkunft).toEqual(
        gregorianisch.concat(NULLUHR),
      );
    }
  });
});

// --- 7) Ränder und «nicht bekannt» -----------------------------------------------------------

describe('7) Ränder und «nicht bekannt» (4T-002008, Story AK5, AK6, AK10)', () => {
  it('AK4: erster und letzter Tag mit Datum, die Tage davor und danach «nicht bekannt»', () => {
    const { block, kalender } = blockMitUmmAlQura();
    expect(hidschriAus(block, [1900, 4, 30])).toEqual([1318, 1, 1, 0, 0, 0]);
    expect(hidschriAus(block, [2077, 11, 16])).toEqual([1500, 12, 30, 0, 0, 0]);
    for (const tag of [
      [1900, 4, 29],
      [2077, 11, 17],
      [1899, 6, 15],
    ]) {
      expect(convertInBlock(block, 'gregorian', tag.concat(NULLUHR), ID), tag.join('-')).toEqual({
        ok: false,
        code: 'unknown',
      });
    }
    for (const tupel of [
      [1317, 12, 29, 0, 0, 0],
      [1501, 1, 1, 0, 0, 0],
    ]) {
      expect(convertInBlock(block, ID, tupel, 'gregorian'), tupel.join('/')).toEqual({
        ok: false,
        code: 'unknown',
      });
      expect(validateTuple(kalender, tupel), tupel.join('/')).toMatchObject({
        ok: false,
        code: 'unknown',
      });
    }
  });

  it('AK4: im Dialog vom 17.11.2077 aus die Zeile «nicht bekannt», die übrigen Zeilen mit Wert', () => {
    const block = blockAus(['gregorian', ID, 'hebrew', 'islamic-tabular']);
    const zeilen = blockEquivalents(block, 'gregorian', [2077, 11, 17, 0, 0, 0]);
    expect(zeilen.ok).toBe(true);
    const nach = Object.fromEntries(zeilen.rows.map((z) => [z.calendar.id, z]));
    expect(nach[ID]).toMatchObject({ ok: false, code: EQUIVALENT_UNKNOWN });
    expect(nach.hebrew).toMatchObject({ ok: true });
    expect(nach['islamic-tabular']).toMatchObject({ ok: true });
    const am = blockEquivalents(block, 'gregorian', [2077, 11, 16, 0, 0, 0]);
    expect(Object.fromEntries(am.rows.map((z) => [z.calendar.id, z]))[ID]).toMatchObject({
      ok: true,
      tuple: [1500, 12, 30, 0, 0, 0],
    });
  });

  it('AK4: die Eingabe-Hilfe bietet die Jahre 1318 bis 1500 an', () => {
    const { kalender } = blockMitUmmAlQura();
    expect(segmentRanges(kalender, [1446, 9, 1, 0, 0, 0])[0]).toMatchObject({
      min: 1318,
      max: 1500,
    });
  });
});

// --- 8) Vorlage -------------------------------------------------------------------------------

describe('8) Anlegen wie das Aufklapp-Menü (4T-002008, Story AK2, AK4, AK9)', () => {
  it('AK5: gültige Definition ohne Anker, Woche ab dem Stichtag, keine Gruppierungen', () => {
    const roh = findCalendarTemplate(ID).create(tDe);
    expect(roh).not.toHaveProperty('blockAnchor');
    const { kalender } = blockMitUmmAlQura();
    expect(kalender.name).toBe('Hidschri-Kalender (Umm al-Qura)');
    expect(kalender.blockAnchor).toBe(undefined);
    expect(kalender.levels.map((lv) => [lv.id, lv.rel ? lv.rel.type : null])).toEqual([
      ['second', null],
      ['minute', 'factor'],
      ['hour', 'factor'],
      ['day', 'factor'],
      ['month', 'byYear'],
      ['year', 'yearly'],
    ]);
    // Monatsnamen und Zeitalter aus den Schlüsseln der tabellarischen Lesart (U4).
    expect(kalender.levels[4].names).toEqual(
      de['settings.calendar.tpl.islamicTabular.months'].split(','),
    );
    expect(kalender.levels[4].names).toHaveLength(12);
    expect(kalender.levels[5].rel).toEqual({ type: 'yearly', table: ID });
    // 01.03.2025 ist ein Samstag (Montag = 0).
    expect(kalender.cycles[0].anchor).toEqual({ tuple: [1446, 9, 1], position: 5 });
    expect(kalender.groups).toEqual([]);
    expect(kalender.epochs.map((e) => [e.name, e.abbr, e.start])).toEqual([
      ['vor AH', 'vor AH', null],
      ['AH', 'AH', [1, 1, 1]],
    ]);
  });

  it('AK5: der Name unterscheidet sich in allen fünf Sprachen von der tabellarischen Lesart', () => {
    for (const [sprache, katalog] of Object.entries({ de, en, fr, es, it: it_ })) {
      const eigen = katalog['settings.calendar.tpl.islamicUmalqura.name'];
      expect(eigen, sprache).toMatch(/Umm al-Qura/);
      expect(eigen, sprache).not.toBe(katalog['settings.calendar.tpl.islamicTabular.name']);
    }
  });

  it('AK5: Startpunkt ohne Anker-Datum ist der erste Tag der Tafel', () => {
    const { block, kalender } = blockMitUmmAlQura();
    const start = calendarStartPoint(kalender);
    expect(start).toEqual([1318, 1, 1, 0, 0, 0]);
    expect(gregorianischAus(block, start)).toEqual([1900, 4, 30, 0, 0, 0]);
  });

  it('AK5: Monats-Kennung ohne L, benannte Form mit dem Monatsnamen', () => {
    const { kalender } = blockMitUmmAlQura();
    const gelesen = parseCanonical(kalender, '1446-09-01');
    expect(gelesen).toMatchObject({ ok: true, tuple: [1446, 9, 1, 0, 0, 0] });
    expect(formatTuple(kalender, gelesen.tuple)).toBe('1446-09-01');
    expect(formatTuple(kalender, gelesen.tuple, { named: true })).toBe('1446-Ramadan-01');
    // Ramadan 1446 hat 29 Tage (Tafel-Zeile 1446).
    expect(parseCanonical(kalender, '1446-09-30')).toMatchObject({ ok: false });
    expect(parseCanonical(kalender, '1446-09L-01')).toMatchObject({ ok: false });
  });

  it('AK6: Rundlauf über die Bereichsdatei Zeichen für Zeichen, ohne Zeile der Tafel (A15)', () => {
    const roh = {
      blocks: [{ id: 'welt', calendars: [{ id: ID, ...findCalendarTemplate(ID).create(tDe) }] }],
    };
    const norm = normalizeCalendarConfig(roh);
    const abgelegt = JSON.stringify(configForPersist(roh, norm));
    const wieder = normalizeCalendarConfig(JSON.parse(abgelegt));
    expect(JSON.stringify(configForPersist(JSON.parse(abgelegt), wieder))).toBe(abgelegt);
    expect(JSON.parse(abgelegt).blocks[0].calendars[0].levels[5].rel).toEqual({
      type: 'yearly',
      table: ID,
    });
    expect(abgelegt).not.toContain(tafel.jahre[0]);
    expect(abgelegt).not.toContain('29,30,29');
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
    expect(convertInBlock(block, gregorianisch.id, [2025, 3, 1, 0, 0, 0], ID)).toEqual({
      ok: true,
      tuple: [1446, 9, 1, 0, 0, 0],
    });
  });

  it('AK6: nicht als Bezug einer Ableitung angeboten (A16)', () => {
    const { kalender } = blockMitUmmAlQura();
    const ableitung = { id: 'abl', name: 'abl', derivedFrom: ID, zero: [1446, 1, 1] };
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
