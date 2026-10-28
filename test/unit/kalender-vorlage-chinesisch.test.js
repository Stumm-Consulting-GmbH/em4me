// 4T-002006 (Epic 3E-000333): Nachweis der chinesischen Kalender-Vorlage, der
// Vorlage mit der Tafel chinese (src/shared/calendar/year-tables/chinese.js,
// Erzeuger scripts/kalender-tafel-erzeugen.js). Grundsatz E8 des Epics: nie
// gegen die eigene Umrechnung und nie gegen die Quelle, aus der die Tafel
// stammt (A6). Die Tafel ist aus der astronomischen Rechnung der Bibliothek
// lunar-javascript erzeugt (Entwicklungs-Abhängigkeit, exakt 1.7.1);
// nachgewiesen wird sie gegen die amtlichen Dateien 2023 bis 2028 des
// Datenportals der Regierung Hongkongs (test/fixtures/kalender-chinesisch/,
// Quellenangabe in QUELLE.md) und über den ganzen Zeitraum gegen die
// Kalender-Schnittstelle der Laufzeit als zweite, unabhängige Rechnung:
//   1) Wiederholbarkeit des Erzeugers, Byte für Byte, mit derselben Bibliothek;
//   2) die Bibliothek nur in der Entwicklung, nie im Programm;
//   3) Umfang und Gestalt der Tafel;
//   4) amtliche Stichprobe 2023 bis 2028 Tag für Tag;
//   5) zweite Rechnung über den ganzen Zeitraum, abweichend allein an zwölf
//      dokumentierten Stellen;
//   6) die zwölf Stellen mit dem Wert der Tafel am ersten Tag;
//   7) Ränder und «nicht bekannt»; 8) Schaltmonat; 9) Vorlage.
// Menü-Platz und Namen in fünf Sprachen prüfen test/unit/kalender-vorlagen.test.js
// und test/unit/renderer/kalender-vorlagen-menue.test.js mit den übrigen Vorlagen.
//
// Die Messung vom 2026-10-24 (unversioniert) hat die zwölf Stellen unter ICU 74.2
// (Electron des Programms) und ICU 77.1 (System-Node) gleich gefunden und jede
// einzeln an der Tafel des Hong Kong Observatory gegengelesen; dieser Beleg
// liegt nicht im Projekt.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import de from '../../src/i18n/de.json';
import { RECHEN_ZEITLIMIT } from '../zeitlimits.js';
import erzeuger from '../../scripts/kalender-tafel-erzeugen.js';
import tafel from '../../src/shared/calendar/year-tables/chinese.js';
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

const ID = 'chinese';
const TAG_MS = 86400000;
const NULLUHR = [0, 0, 0];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const PORTAL = path.join(REPO, 'test', 'fixtures', 'kalender-chinesisch', 'portal');
const QUELLE_MD = path.join(REPO, 'test', 'fixtures', 'kalender-chinesisch', 'QUELLE.md');

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

function blockMitChinesisch() {
  const block = blockAus(['gregorian', ID]);
  return { block, kalender: block.calendars[1] };
}

// Kanonische Form der Vorlage zu einem gregorianischen Tag, etwa «2023-02L-01».
function chinesischAus(block, kalender, [j, m, t]) {
  const r = convertInBlock(block, 'gregorian', [j, m, t].concat(NULLUHR), ID);
  if (!r.ok) return `(${r.code})`;
  return formatTuple(kalender, r.tuple);
}

const zwei = (n) => String(n).padStart(2, '0');
const kennung = (jahr, monat, schalt, tag) =>
  `${jahr}-${zwei(monat)}${schalt ? 'L' : ''}-${zwei(tag)}`;
const rataDie = (j, m, t) => Math.floor(Date.UTC(j, m - 1, t) / TAG_MS) + 719163;
const isoVon = (ms) => new Date(ms).toISOString().slice(0, 10);
const teileVon = (ms) => {
  const d = new Date(ms);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
};
const msVon = (iso) => Date.parse(`${iso}T00:00:00Z`);

// Stichtage mit Herkunft (auch Vergleichswerte in
// test/unit/kalender-umrechnung-entsprechungen.test.js).
const STICHTAG_STORY = { gregorianisch: [2025, 1, 29], chinesisch: '2025-01-01' }; // Story AK14
const NEUJAHR_2027 = { gregorianisch: [2027, 2, 6], chinesisch: '2027-01-01' }; // Portal-Datei 2027

// --- 1) Wiederholbarkeit ---------------------------------------------------------------

describe('1) Erzeuger: Wiederholbarkeit Byte für Byte (4T-002006, AK2, AK3)', () => {
  it(
    'AK2: ein zweiter Lauf mit Stand und Fassung aus dem Kopf ergibt dieselbe Datei',
    () => {
      const vorhanden = fs.readFileSync(erzeuger.tafelPfad(ID), 'utf8');
      const kopf = erzeuger.liesKopf(vorhanden);
      expect(kopf).not.toBe(null);
      expect(
        kopf.fassung,
        'Bibliothek geändert: Tafel neu erzeugen und Nachweis neu bewerten',
      ).toBe(erzeuger.QUELLEN[ID].fassung());
      const neu = erzeuger.erzeugeTafelText(ID, kopf).text;
      if (neu !== vorhanden) {
        const a = vorhanden.split('\n');
        const b = neu.split('\n');
        const i = a.findIndex((z, k) => z !== b[k]);
        throw new Error(
          `Bibliothek rechnet anders: Zeile ${i + 1} Datei «${a[i]}», erzeugt «${b[i]}». ` +
            'Tafel neu erzeugen und den Nachweis neu bewerten.',
        );
      }
      expect(neu).toBe(vorhanden);
    },
    RECHEN_ZEITLIMIT,
  );

  it('AK2: der Kopf nennt Bibliothek 1.7.1 und die SHA-256 ihrer Datei lunar.js', () => {
    const kopf = erzeuger.liesKopf(fs.readFileSync(erzeuger.tafelPfad(ID), 'utf8'));
    expect(kopf.fassung).toBe(
      'lunar-javascript 1.7.1, lunar.js SHA-256 ' +
        '0130304df79a2530e736ad8843bb854f3152e9783694f3939826f520c0915897',
    );
    expect(tafel.erzeugt).toBe(
      `scripts/kalender-tafel-erzeugen.js, lunar-javascript 1.7.1, Stand ${kopf.stand}`,
    );
  });

  it('AK3: die Prüfsumme im Kopf ist die der Zeilen', () => {
    const summe = erzeuger.pruefsumme(tafel.jahre.slice());
    expect(tafel.pruefsumme).toBe(summe);
    expect(fs.readFileSync(erzeuger.tafelPfad(ID), 'utf8')).toContain(`// ${summe}.`);
  });
});

// --- 2) Nur in der Entwicklung ---------------------------------------------------------

describe('2) Die Tafel ist reine Daten-Datei (4T-002006, AK2, AK10)', () => {
  // Dass kein Modul unter src/ die Bibliothek lädt und package.json sie allein
  // als Entwicklungs-Abhängigkeit führt, prüft der Wächter
  // test/unit/entwicklungs-bibliotheken.test.js.
  it('AK10: die Tafel lädt nichts und ruft weder Laufzeit-Kalender noch Netz auf', () => {
    const code = fs
      .readFileSync(erzeuger.tafelPfad(ID), 'utf8')
      .split('\n')
      .filter((z) => !z.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/\b(require|import|Intl|fetch|XMLHttpRequest|WebSocket)\b/);
  });
});

// --- 3) Umfang und Gestalt --------------------------------------------------------------

describe('3) Tafel: Umfang und Gestalt (4T-002006, AK3)', () => {
  it('AK3: 200 Jahre ab 1901, 19.02.1901 bis 28.01.2101, 2 473 Monate, 73 Schaltmonate', () => {
    expect(tafel.name).toBe(ID);
    expect(tafel.ersteJahr).toBe(1901);
    expect(tafel.ersterTag).toBe(694010);
    expect(tafel.ersterTag).toBe(rataDie(1901, 2, 19));
    expect(tafel.namensStellen).toBe(24);
    expect(tafel.jahre).toHaveLength(200);
    let tage = 0;
    let monate = 0;
    let schalt = 0;
    for (const zeile of tafel.jahre) {
      const teile = zeile.split(',');
      expect([12, 13], zeile).toContain(teile.length);
      const leaps = teile.filter((x) => x.endsWith('L')).length;
      expect(leaps, zeile).toBe(teile.length - 12);
      expect(teile[0].endsWith('L'), zeile).toBe(false);
      for (const x of teile) {
        expect(x, zeile).toMatch(/^(29|30)L?$/);
        tage += parseInt(x, 10);
      }
      monate += teile.length;
      schalt += leaps;
    }
    expect(monate).toBe(2473);
    expect(schalt).toBe(73);
    expect(tage).toBe(73028);
    expect(tafel.ersterTag + tage).toBe(767038);
    expect(tafel.ersterTag + tage).toBe(rataDie(2101, 1, 29));
  });
});

// --- 4) Amtliche Stichprobe ----------------------------------------------------------------

const MONATE = [
  '正月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];
const ZIFFER = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function tagZahl(s) {
  if (s === '初十') return 10;
  if (s === '二十') return 20;
  if (s === '三十') return 30;
  const n = ZIFFER[s[1]];
  if (s[0] === '初' && n) return n;
  if (s[0] === '十' && n) return 10 + n;
  if (s[0] === '廿' && n) return 20 + n;
  throw new Error(`unbekannter Tag ${s}`);
}
const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const ganZhi = (jahr) => `${GAN[(jahr - 4) % 10]}${ZHI[(jahr - 4) % 12]}年`;
const MON = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

// Liest eine Portal-Datei: Datum T-Mon-JJ, Jahr über den 60er-Zyklus dem
// gregorianischen Jahr oder dem Vorjahr zugeordnet, Monat 正月 bis 十二月 mit
// Vorsilbe 閏 beim Schaltmonat, Tag 初一 bis 三十.
function liesPortal(jahr) {
  const roh = fs.readFileSync(path.join(PORTAL, `nongli_calendar_${jahr}.csv`), 'utf8');
  const zeilen = roh
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((z) => z.trim() !== '');
  expect(zeilen[0]).toBe(
    'Gregorian Date,Chinese year (Gan-Zhi),Chinese year (Zodiac),Lunar month,Lunar Date',
  );
  return zeilen.slice(1).map((z) => {
    const [gd, gz, , mon, tag] = z.split(',').map((s) => s.trim());
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(gd);
    if (!m || !MON[m[2]]) throw new Error(`${jahr}: Datum ${gd}`);
    const g = [2000 + Number(m[3]), MON[m[2]], Number(m[1])];
    const schalt = mon.startsWith('閏');
    const monat = MONATE.indexOf(schalt ? mon.slice(1) : mon) + 1;
    if (monat < 1) throw new Error(`${jahr}: Monat ${mon}`);
    const cj = ganZhi(g[0]) === gz ? g[0] : ganZhi(g[0] - 1) === gz ? g[0] - 1 : null;
    if (cj === null) throw new Error(`${jahr}: Jahr ${gz} zu ${gd}`);
    return { g, wert: kennung(cj, monat, schalt, tagZahl(tag)) };
  });
}

function quellePruefsummen() {
  const text = fs.readFileSync(QUELLE_MD, 'utf8');
  const summen = {};
  for (const m of text.matchAll(/`nongli_calendar_(\d{4})\.csv` \| \d+ \| `([0-9a-f]{64})`/g)) {
    summen[m[1]] = m[2];
  }
  return summen;
}

describe('4) Amtliche Stichprobe 2023 bis 2028 (4T-002006, AK4)', () => {
  it('AK4: die sechs Dateien sind byte-gleich zum Original (SHA-256 aus QUELLE.md)', () => {
    const summen = quellePruefsummen();
    expect(Object.keys(summen)).toEqual(['2023', '2024', '2025', '2026', '2027', '2028']);
    for (const [jahr, soll] of Object.entries(summen)) {
      const ist = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(PORTAL, `nongli_calendar_${jahr}.csv`)))
        .digest('hex');
      expect(ist, `nongli_calendar_${jahr}.csv`).toBe(soll);
    }
  });

  it('AK4: jeder der 2 192 Tage 01.01.2023 bis 31.12.2028 gleich der Datei, 74 Monatsanfänge', () => {
    const { block, kalender } = blockMitChinesisch();
    const tage = [];
    for (let j = 2023; j <= 2028; j++) tage.push(...liesPortal(j));
    expect(tage).toHaveLength(2192);
    // Lückenlos und in Folge.
    tage.forEach((t, i) => {
      expect(Date.UTC(t.g[0], t.g[1] - 1, t.g[2])).toBe(Date.UTC(2023, 0, 1 + i));
    });
    const abweichend = tage
      .map((t) => ({ ...t, ist: chinesischAus(block, kalender, t.g) }))
      .filter((t) => t.ist !== t.wert)
      .map((t) => `${t.g.join('-')}: ${t.ist} statt ${t.wert}`);
    expect(abweichend).toEqual([]);
    const anfaenge = tage.filter((t) => t.wert.endsWith('-01'));
    expect(anfaenge).toHaveLength(74);
    expect(anfaenge.filter((t) => t.wert.includes('L')).map((t) => t.wert)).toEqual([
      '2023-02L-01',
      '2025-06L-01',
      '2028-05L-01',
    ]);
    // Story-Stichtag und amtliches Neujahr 2027 (die Schnittstelle sagt 07.02.2027).
    for (const s of [STICHTAG_STORY, NEUJAHR_2027]) {
      expect(tage.find((t) => t.g.join() === s.gregorianisch.join()).wert).toBe(s.chinesisch);
    }
  });
});

// --- 5) Zweite Rechnung über den ganzen Zeitraum --------------------------------------------

// Die zwölf Stellen, an denen die Kalender-Schnittstelle (ICU 74.2 und 77.1)
// von der Tafel abweicht: erster und letzter abweichender Tag, Zahl der Tage,
// und der Wert der Tafel an benannten Tagen (Messung vom 2026-10-24).
const STELLEN = [
  {
    art: 'Schaltmonat 1917',
    von: '1917-03-23',
    bis: '1917-05-20',
    tage: 59,
    tafel: { '1917-03-23': '1917-02L-01', '1917-04-21': '1917-03-01' },
  },
  {
    art: 'Schaltmonat 1922',
    von: '1922-06-25',
    bis: '1922-08-22',
    tage: 59,
    tafel: { '1922-06-25': '1922-05L-01', '1922-07-24': '1922-06-01' },
  },
  {
    art: 'Neujahr 1954',
    von: '1954-02-03',
    bis: '1954-03-04',
    tage: 30,
    tafel: { '1954-02-03': '1954-01-01' },
  },
  {
    art: '2. Monat 1955',
    von: '1955-02-22',
    bis: '1955-03-23',
    tage: 30,
    tafel: { '1955-02-22': '1955-02-01' },
  },
  {
    art: 'Schaltmonat 1987',
    von: '1987-07-26',
    bis: '1987-09-22',
    tage: 59,
    tafel: { '1987-07-26': '1987-06L-01', '1987-08-24': '1987-07-01' },
  },
  {
    art: '12. Monat 1998',
    von: '1999-01-17',
    bis: '1999-02-15',
    tage: 30,
    tafel: { '1999-01-17': '1998-12-01' },
  },
  {
    art: '7. Monat 2012',
    von: '2012-08-17',
    bis: '2012-09-15',
    tage: 30,
    tafel: { '2012-08-17': '2012-07-01' },
  },
  {
    art: '10. Monat 2018',
    von: '2018-11-07',
    bis: '2018-12-06',
    tage: 30,
    tafel: { '2018-11-07': '2018-09-30', '2018-11-08': '2018-10-01' },
  },
  {
    art: 'Neujahr 2027',
    von: '2027-02-06',
    bis: '2027-03-07',
    tage: 30,
    tafel: { '2027-02-06': '2027-01-01' },
  },
  {
    art: 'Neujahr 2030',
    von: '2030-02-02',
    bis: '2030-03-03',
    tage: 30,
    tafel: { '2030-02-02': '2029-12-30', '2030-02-03': '2030-01-01' },
  },
  // Story AK12: vom Observatorium selbst als unsicher gekennzeichnet (TF1).
  {
    art: '9. Monat 2057',
    von: '2057-09-28',
    bis: '2057-10-27',
    tage: 30,
    tafel: { '2057-09-28': '2057-09-01' },
  },
  {
    art: '2. Monat 2070',
    von: '2070-03-12',
    bis: '2070-04-10',
    tage: 30,
    tafel: { '2070-03-12': '2070-02-01' },
  },
];
const GEMESSEN_UNTER = ['74', '77'];

function schnittstelle() {
  const f = new Intl.DateTimeFormat('en-u-ca-chinese', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  expect(f.resolvedOptions().calendar).toBe('chinese');
  return (ms) => {
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    // ICU 74 liefert den Monat mit führender Null, ICU 77 ohne; «bis» ist der Schaltmonat.
    const m = /^(\d+)(bis)?$/.exec(p.month);
    if (!m) throw new Error(`unbekannte Monatsform ${p.month}`);
    return kennung(Number(p.relatedYear), Number(m[1]), Boolean(m[2]), Number(p.day));
  };
}

describe('5) Zweite Rechnung: Kalender-Schnittstelle über den ganzen Zeitraum (4T-002006, AK5)', () => {
  it('die zwölf Stellen umfassen 447 Tage', () => {
    expect(STELLEN.reduce((a, s) => a + s.tage, 0)).toBe(447);
    for (const s of STELLEN) expect((msVon(s.bis) - msVon(s.von)) / TAG_MS + 1, s.art).toBe(s.tage);
  });

  it(
    'AK5: jeder Tag 19.02.1901 bis 28.01.2101 gleich der Schnittstelle außer an den zwölf Stellen',
    () => {
      const { block, kalender } = blockMitChinesisch();
      const icu = schnittstelle();
      const ausserhalb = [];
      const jeStelle = new Map(STELLEN.map((s) => [s.art, 0]));
      let tage = 0;
      for (let ms = Date.UTC(1901, 1, 19); ms <= Date.UTC(2101, 0, 28); ms += TAG_MS) {
        tage += 1;
        const ist = chinesischAus(block, kalender, teileVon(ms));
        if (ist === icu(ms)) continue;
        const iso = isoVon(ms);
        const stelle = STELLEN.find((s) => iso >= s.von && iso <= s.bis);
        if (stelle) jeStelle.set(stelle.art, jeStelle.get(stelle.art) + 1);
        else if (ausserhalb.length < 10)
          ausserhalb.push(`${iso}: Tafel ${ist}, Schnittstelle ${icu(ms)}`);
      }
      expect(tage).toBe(73028);
      const icuFassung = `ICU ${process.versions.icu}`;
      // Eine neue Abweichung ist ein Befund über die Schnittstelle, nicht über die Tafel.
      expect(ausserhalb, icuFassung).toEqual([]);
      const major = String(process.versions.icu).split('.')[0];
      if (GEMESSEN_UNTER.includes(major)) {
        // Unter den gemessenen Fassungen genau die zwölf Stellen, jede ganz.
        expect(Object.fromEntries(jeStelle), icuFassung).toEqual(
          Object.fromEntries(STELLEN.map((s) => [s.art, s.tage])),
        );
      } else {
        // Unter einer anderen Fassung genügt die Teilmenge (Muster 4T-002199).
        for (const s of STELLEN)
          expect(jeStelle.get(s.art), `${s.art}, ${icuFassung}`).toBeLessThanOrEqual(s.tage);
      }
    },
    RECHEN_ZEITLIMIT,
  );
});

// --- 6) Die zwölf Stellen --------------------------------------------------------------------

describe('6) Die zwölf Stellen mit dem Wert der astronomischen Rechnung (4T-002006, AK5)', () => {
  it('AK5: an jeder Stelle trägt die Vorlage den Wert der Tafel; der 9. Monat 2057 beginnt am 28.09.', () => {
    const { block, kalender } = blockMitChinesisch();
    const icu = schnittstelle();
    for (const s of STELLEN) {
      for (const [iso, soll] of Object.entries(s.tafel)) {
        const g = iso.split('-').map(Number);
        expect(chinesischAus(block, kalender, g), `${s.art}, ${iso}`).toBe(soll);
      }
      // Am ersten Tag weicht die Schnittstelle ab, am Tag danach der Stelle nicht mehr.
      const vonMs = msVon(s.von);
      expect(chinesischAus(block, kalender, teileVon(vonMs)), s.art).not.toBe(icu(vonMs));
      const danach = msVon(s.bis) + TAG_MS;
      expect(chinesischAus(block, kalender, teileVon(danach)), s.art).toBe(icu(danach));
    }
    expect(chinesischAus(block, kalender, [2057, 9, 27])).toBe('2057-08-29');
    expect(chinesischAus(block, kalender, [2057, 9, 28])).toBe('2057-09-01');
  });
});

// --- 7) Ränder und «nicht bekannt» -----------------------------------------------------------

describe('7) Ränder und «nicht bekannt» (4T-002006, Story AK5, AK6, AK10)', () => {
  it('AK6: erster und letzter Tag mit Datum, die Tage davor und danach «nicht bekannt»', () => {
    const { block, kalender } = blockMitChinesisch();
    expect(chinesischAus(block, kalender, [1901, 2, 19])).toBe('1901-01-01');
    expect(chinesischAus(block, kalender, [2101, 1, 28])).toBe('2100-12-29');
    for (const tag of [
      [1901, 2, 18],
      [2101, 1, 29],
      [1900, 6, 15],
    ]) {
      expect(convertInBlock(block, 'gregorian', tag.concat(NULLUHR), ID), tag.join('-')).toEqual({
        ok: false,
        code: 'unknown',
      });
    }
    for (const tupel of [
      [1900, 12, 29, 0, 0, 0],
      [1900, 1, 1, 0, 0, 0],
      [2101, 1, 1, 0, 0, 0],
    ]) {
      expect(convertInBlock(block, ID, tupel, 'gregorian'), tupel.join('/')).toEqual({
        ok: false,
        code: 'unknown',
      });
      expect(validateTuple(kalender, tupel).ok, tupel.join('/')).toBe(false);
    }
  });

  it('AK6: im Dialog die Zeile «nicht bekannt», die übrigen Zeilen mit Wert', () => {
    const block = blockAus(['gregorian', ID, 'hebrew', 'persian']);
    const zeilen = blockEquivalents(block, 'gregorian', [1901, 2, 18, 0, 0, 0]);
    expect(zeilen.ok).toBe(true);
    const nach = Object.fromEntries(zeilen.rows.map((z) => [z.calendar.id, z]));
    expect(nach[ID]).toMatchObject({ ok: false, code: EQUIVALENT_UNKNOWN });
    expect(nach.hebrew).toMatchObject({ ok: true });
    expect(nach.persian).toMatchObject({ ok: true });
    const danach = blockEquivalents(block, 'gregorian', [2101, 1, 29, 0, 0, 0]);
    const nachDanach = Object.fromEntries(danach.rows.map((z) => [z.calendar.id, z]));
    expect(nachDanach[ID]).toMatchObject({ ok: false, code: EQUIVALENT_UNKNOWN });
    expect(nachDanach.hebrew).toMatchObject({ ok: true });
    const am = blockEquivalents(block, 'gregorian', [1901, 2, 19, 0, 0, 0]);
    expect(Object.fromEntries(am.rows.map((z) => [z.calendar.id, z]))[ID]).toMatchObject({
      ok: true,
      tuple: [1901, 1, 1, 0, 0, 0],
    });
  });

  it('AK6: die Eingabe-Hilfe bietet die Jahre 1901 bis 2100 an, im Jahr 2023 dreizehn Monate', () => {
    const { kalender } = blockMitChinesisch();
    const [jahr, monat] = segmentRanges(kalender, [2023, 1, 1, 0, 0, 0]);
    expect(jahr).toMatchObject({ min: 1901, max: 2100 });
    expect(monat).toMatchObject({ min: 1, max: 13 });
    expect(segmentRanges(kalender, [2024, 1, 1, 0, 0, 0])[1]).toMatchObject({ min: 1, max: 12 });
  });
});

// --- 8) Schaltmonat ----------------------------------------------------------------------------

describe('8) Schaltmonat als eigener Monat mit der Kennung L (4T-002006, Story AK11)', () => {
  it('AK7: 22.03.2023 ist 2023-02L-01 und wird zurück auf denselben Tag gelesen', () => {
    const { block, kalender } = blockMitChinesisch();
    expect(chinesischAus(block, kalender, [2023, 3, 21])).toBe('2023-02-30');
    expect(chinesischAus(block, kalender, [2023, 3, 22])).toBe('2023-02L-01');
    expect(chinesischAus(block, kalender, [2023, 4, 20])).toBe('2023-03-01');
    const gelesen = parseCanonical(kalender, '2023-02L-01');
    expect(gelesen).toMatchObject({ ok: true, tuple: [2023, 3, 1, 0, 0, 0] });
    expect(formatTuple(kalender, gelesen.tuple)).toBe('2023-02L-01');
    expect(convertInBlock(block, ID, gelesen.tuple, 'gregorian')).toEqual({
      ok: true,
      tuple: [2023, 3, 22, 0, 0, 0],
    });
  });

  it('AK7: benannte Form mit «Schaltmonat 2», gewöhnlicher Monat mit «Monat 3»', () => {
    const { kalender } = blockMitChinesisch();
    expect(formatTuple(kalender, [2023, 3, 1, 0, 0, 0], { named: true })).toBe(
      '2023-Schaltmonat 2-01',
    );
    expect(formatTuple(kalender, [2023, 4, 1, 0, 0, 0], { named: true })).toBe('2023-Monat 3-01');
    expect(formatTuple(kalender, [2023, 4, 1, 0, 0, 0])).toBe('2023-03-01');
  });

  it('AK7: ein Schaltmonat, den das Jahr nicht hat, wird nicht gelesen', () => {
    const { kalender } = blockMitChinesisch();
    expect(parseCanonical(kalender, '2024-02L-01')).toMatchObject({ ok: false });
    expect(parseCanonical(kalender, '2023-03L-01')).toMatchObject({ ok: false });
    expect(parseCanonical(kalender, '2023-02-31')).toMatchObject({ ok: false });
  });
});

// --- 9) Vorlage ---------------------------------------------------------------------------------

describe('9) Anlegen wie das Aufklapp-Menü (4T-002006, Story AK2, AK9)', () => {
  it('AK8: gültige Definition ohne Anker, Woche ab dem Stichtag, keine Gruppierungen', () => {
    const roh = findCalendarTemplate(ID).create(tDe);
    expect(roh).not.toHaveProperty('blockAnchor');
    const { kalender } = blockMitChinesisch();
    expect(kalender.name).toBe('Chinesischer Kalender');
    expect(kalender.blockAnchor).toBe(undefined);
    expect(kalender.levels.map((lv) => [lv.id, lv.rel ? lv.rel.type : null])).toEqual([
      ['second', null],
      ['minute', 'factor'],
      ['hour', 'factor'],
      ['day', 'factor'],
      ['month', 'byYear'],
      ['year', 'yearly'],
    ]);
    const namen = kalender.levels[4].names;
    expect(namen).toHaveLength(24);
    expect(namen.slice(0, 12)).toEqual(Array.from({ length: 12 }, (_, i) => `Monat ${i + 1}`));
    expect(namen.slice(12)).toEqual(Array.from({ length: 12 }, (_, i) => `Schaltmonat ${i + 1}`));
    expect(kalender.levels[5].rel).toEqual({ type: 'yearly', table: 'chinese' });
    // 29.01.2025 ist ein Mittwoch (Montag = 0).
    expect(kalender.cycles[0].anchor).toEqual({ tuple: [2025, 1, 1], position: 2 });
    expect(kalender.cycles[0].numbering).toBe(null);
    expect(kalender.groups).toEqual([]);
    expect(kalender.epochs.map((e) => [e.name, e.abbr, e.start])).toEqual([
      ['v. Chr.', 'v. Chr.', null],
      ['n. Chr.', 'n. Chr.', [1, 1, 1]],
    ]);
  });

  it('AK8: Stichtag der Story und Startpunkt ohne Anker-Datum am ersten Tag der Tafel', () => {
    const { block, kalender } = blockMitChinesisch();
    expect(chinesischAus(block, kalender, STICHTAG_STORY.gregorianisch)).toBe(
      STICHTAG_STORY.chinesisch,
    );
    const start = calendarStartPoint(kalender);
    expect(start).toEqual([1901, 1, 1, 0, 0, 0]);
    expect(convertInBlock(block, ID, start, 'gregorian')).toEqual({
      ok: true,
      tuple: [1901, 2, 19, 0, 0, 0],
    });
  });

  it('AK9: Rundlauf über die Bereichsdatei Zeichen für Zeichen, ohne Zeile der Tafel (B3)', () => {
    const roh = {
      blocks: [{ id: 'welt', calendars: [{ id: ID, ...findCalendarTemplate(ID).create(tDe) }] }],
    };
    const norm = normalizeCalendarConfig(roh);
    const abgelegt = JSON.stringify(configForPersist(roh, norm));
    const wieder = normalizeCalendarConfig(JSON.parse(abgelegt));
    expect(JSON.stringify(configForPersist(JSON.parse(abgelegt), wieder))).toBe(abgelegt);
    expect(JSON.parse(abgelegt).blocks[0].calendars[0].levels[5].rel).toEqual({
      type: 'yearly',
      table: 'chinese',
    });
    expect(abgelegt).not.toContain(tafel.jahre[0]);
    expect(abgelegt).not.toContain('29L');
  });

  it('AK9: umbenannt und mit anderen Wochentags- und Monatsnamen rechnet sie unverändert', () => {
    const roh = { id: ID, ...findCalendarTemplate(ID).create(tDe) };
    roh.name = 'Mein Kalender';
    roh.cycles[0].names = roh.cycles[0].names.map((n) => `${n} (geändert)`);
    roh.levels[4].names = roh.levels[4].names.map((n) => `${n}*`);
    const block = normalizeCalendarConfig({
      blocks: [{ id: 'welt', calendars: [findCalendarTemplate('gregorian').create(tDe), roh] }],
    }).blocks[0];
    const gregorianisch = block.calendars[0];
    expect(block.calendars[1].name).toBe('Mein Kalender');
    expect(convertInBlock(block, gregorianisch.id, [2027, 2, 6, 0, 0, 0], ID)).toEqual({
      ok: true,
      tuple: [2027, 1, 1, 0, 0, 0],
    });
  });

  it('AK9: nicht als Bezug einer Ableitung angeboten (B4)', () => {
    const { kalender } = blockMitChinesisch();
    const ableitung = { id: 'abl', name: 'abl', derivedFrom: ID, zero: [2025, 1, 1] };
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
