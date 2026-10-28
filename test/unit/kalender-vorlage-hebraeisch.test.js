// 4T-002005 (Epic 3E-000333): Nachweis der hebräischen Kalender-Vorlage, der
// ersten Vorlage mit Jahres-Struktur (Regel hebrew, calendar-rule-hebrew.js).
// Grundsatz E8 des Epics: nie gegen die eigene Umrechnung. Der Nachweis läuft
// gegen drei Auskünfte:
//   a) die Kalender-Schnittstelle (Intl.DateTimeFormat, Kalender «hebrew»)
//      Tag für Tag 1900 bis 2100, mit EINER benannten Ausnahme (siehe Fall a);
//   b) eine unabhängige klassische Form der vier Verschiebe-Regeln, in dieser
//      Datei selbst gebaut, für jedes Jahr −300 000 bis 300 000;
//   c) Stichproben mit Herkunft.
// Dazu Grenzfälle, die Monats-Kennung mit L im Wert, ferne Jahre, Umrechnung
// mit Uhrzeit und das Anlegen wie das Menü. Menü-Platz und Namen in fünf
// Sprachen prüfen test/unit/kalender-vorlagen.test.js und
// test/unit/renderer/kalender-vorlagen-menue.test.js mit den übrigen Vorlagen.
//
// Die Messung vom 2026-10-24 (Tests/3E-000333/hebraeisch-2026-10-24/,
// unversioniert) hat Regel und Schnittstelle in System-Node (ICU 77.1) und im
// Electron des Programms (ICU 74.2) gleich gefunden; die Formeln des
// Referenzwerks stammen aus dem Gedächtnis der Sitzung, belegt durch ihre
// Übereinstimmung mit b) und a).
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import { RECHEN_ZEITLIMIT } from '../zeitlimits.js';
import {
  convertInBlock,
  cycleAt,
  epochOf,
  formatTuple,
  parseCanonical,
  validateTuple,
} from '../../src/shared/calendar/calendar-core.js';
import {
  calendarStartPoint,
  deriveCalendar,
  normalizeCalendarConfig,
} from '../../src/shared/calendar/calendar-config.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';
import regel from '../../src/shared/calendar/calendar-rule-hebrew.js';

const ID = 'hebrew';

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

// Block aus der gregorianischen und der hebräischen Vorlage, beide über die
// Sammlung mit deutschem Katalog erzeugt, wie das Aufklapp-Menü sie anlegt.
function blockMitHebraeisch() {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: ['gregorian', ID].map((id) => ({
          id,
          ...findCalendarTemplate(id).create(tDe),
        })),
      },
    ],
  });
  const block = config.blocks[0];
  expect(block.calendars.map((c) => c.id)).toEqual(['gregorian', ID]);
  return { block, kalender: block.calendars[1] };
}

const NULLUHR = [0, 0, 0];

// Hebräisches Tupel zu einem gregorianischen Tag; ohne expect, weil die
// Funktion in den Durchläufen für jeden Tag läuft.
function hebraeischAus(block, gregorianisch) {
  const r = convertInBlock(block, 'gregorian', gregorianisch.concat(NULLUHR), ID);
  if (!r.ok) throw new Error(`Umrechnung von ${gregorianisch.join('-')} scheitert: ${r.code}`);
  return r.tuple;
}

function gregorianischAus(block, tupel) {
  const r = convertInBlock(block, ID, tupel, 'gregorian');
  if (!r.ok) throw new Error(`Umrechnung von ${tupel.join('/')} scheitert: ${r.code}`);
  return r.tuple;
}

// Rata Die eines proleptisch-gregorianischen Tages nach dem Referenzwerk
// (fixed-from-gregorian), unabhängig vom Kalender-Kern; nachgewiesen im
// ersten Fall gegen Date.
function rataDie(jahr, monat, tag) {
  const y = jahr - 1;
  const schalt = (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
  return (
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) +
    Math.floor((367 * monat - 362) / 12) +
    (monat <= 2 ? 0 : schalt ? -1 : -2) +
    tag
  );
}

// --- Unabhängige Gegenrechnung: klassische Form der vier Verschiebe-Regeln ----------------
// Molad Tischri ab BaHaRaD (Tag 2, 5 Stunden, 204 Teile nach 18 Uhr des
// Vorabends), Monat 29 Tage 12 Stunden 793 Teile (765 433 Teile, 1 Tag = 25 920
// Teile); dann je nach Wochentag des Molad (0 Sonntag … 6 Samstag):
//   GaTaRaD      Gemeinjahr, Molad am Dienstag ab 9 h 204 p → Donnerstag
//   BeTU-TaKPaT  Vorjahr Schaltjahr, Molad am Montag ab 15 h 589 p → Dienstag
//   sonst        Molad Zaken (ab 18 h, also Mittag) → Folgetag, danach
//                «lo ADU Rosch» (nicht Sonntag, Mittwoch, Freitag) → Folgetag.
// Tag-Index 1 (Montag) ist der 1. Tischri 1 = Rata Die −1 373 427.
const TEIL_TAG = 25920n;
const MONAT = 29n * TEIL_TAG + 12n * 1080n + 793n;
const BAHARAD = TEIL_TAG + 5n * 1080n + 204n;

const fdiv = (a, b) => (a % b !== 0n && a < 0n ? a / b - 1n : a / b);
const fmod = (a, b) => a - fdiv(a, b) * b;
const klassischSchaltjahr = (y) => [3n, 6n, 8n, 11n, 14n, 17n, 0n].includes(fmod(y, 19n));

function klassischerJahresBeginn(y) {
  const monate = 235n * fdiv(y - 1n, 19n) + monateImZyklus(fmod(y - 1n, 19n));
  const t = BAHARAD + monate * MONAT;
  let tag = fdiv(t, TEIL_TAG);
  const teile = fmod(t, TEIL_TAG);
  const wochentag = fmod(tag, 7n);
  if (!klassischSchaltjahr(y) && wochentag === 2n && teile >= 9n * 1080n + 204n) {
    tag += 2n;
  } else if (klassischSchaltjahr(y - 1n) && wochentag === 1n && teile >= 15n * 1080n + 589n) {
    tag += 1n;
  } else {
    if (teile >= 18n * 1080n) tag += 1n;
    if ([0n, 3n, 5n].includes(fmod(tag, 7n))) tag += 1n;
  }
  return -1373428n + tag;
}

// Monate der ersten k Jahre eines 19-Jahres-Zyklus (Schaltjahre an den Stellen
// 3, 6, 8, 11, 14, 17, 19): 12 je Jahr und einer je Schaltjahr.
function monateImZyklus(k) {
  let n = 0n;
  for (let i = 1n; i <= k; i++) n += klassischSchaltjahr(i) ? 13n : 12n;
  return n;
}

const klassischeLaenge = (y) => klassischerJahresBeginn(y + 1n) - klassischerJahresBeginn(y);

// --- Leser der Schnittstelle ---------------------------------------------------------------
// Gelesen wird OHNE Monats- und Zeitalter-Namen, weil sie je Fassung der
// Schnittstelle wechseln können: Jahr und Tag numerisch, die Stelle des Monats
// im Jahr mit einem eigenen Formatierer (mit Jahr und Tag zusammen liefert die
// Schnittstelle im Englischen den Namen statt der Zahl, gemessen am
// 2026-10-24), der Wochentag mit einem dritten.
const WOCHENTAG = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function schnittstelle() {
  const optionen = { timeZone: 'UTC' };
  const locale = 'en-u-ca-hebrew-nu-latn';
  const jahrTag = new Intl.DateTimeFormat(locale, { ...optionen, year: 'numeric', day: 'numeric' });
  const monat = new Intl.DateTimeFormat(locale, { ...optionen, month: 'numeric' });
  const wochentag = new Intl.DateTimeFormat(locale, { ...optionen, weekday: 'short' });
  for (const f of [jahrTag, monat, wochentag]) {
    expect(f.resolvedOptions().calendar).toBe('hebrew');
  }
  return (datum) => {
    const teile = {};
    for (const teil of jahrTag.formatToParts(datum)) teile[teil.type] = teil.value;
    return [
      Number(teile.year),
      Number(monat.format(datum)),
      Number(teile.day),
      WOCHENTAG[wochentag.format(datum)],
    ];
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
const iso = (d) => d.toISOString().slice(0, 10);

// --- Schritt 1: das Regel-Modul unmittelbar ------------------------------------------------

describe('Regel hebrew: Form und Kontrollwerte (4T-002005, Schritt 1)', () => {
  it('trägt die Form einer Regel der Jahres-Struktur und ist unveränderlich', () => {
    expect(regel.name).toBe('hebrew');
    expect([regel.namensStellen, regel.hoechstMonate, regel.hoechstLaenge]).toEqual([14, 13, 30]);
    expect(Object.isFrozen(regel)).toBe(true);
  });

  it('Kontrollwerte der Messung: Jahresbeginne und Jahreslängen', () => {
    const laenge = (y) => regel.jahresBeginn(y + 1n) - regel.jahresBeginn(y);
    expect(regel.jahresBeginn(5784n)).toBe(738779n);
    expect(regel.jahresBeginn(5785n)).toBe(739162n);
    expect(regel.jahresBeginn(5807n)).toBe(747195n);
    expect(regel.jahresBeginn(1n)).toBe(-1373427n);
    expect([laenge(5781n), laenge(5784n), laenge(5787n)]).toEqual([353n, 383n, 385n]);
  });

  it('die Monatsfolge summiert sich zur Jahreslänge, auch in sehr fernen Jahren', () => {
    const jahre = [];
    for (let y = -2000n; y <= 8000n; y++) jahre.push(y);
    jahre.push(-1000000n, 1000000n, 10n ** 15n, 2n ** 53n - 2n, -(2n ** 53n) + 2n);
    for (const y of jahre) {
      const monate = regel.monate(y);
      let summe = 0n;
      for (const m of monate) summe += BigInt(m.length);
      expect(summe, String(y)).toBe(regel.jahresBeginn(y + 1n) - regel.jahresBeginn(y));
      expect(monate.length, String(y)).toBe(klassischSchaltjahr(y) ? 13 : 12);
    }
  });
});

// --- a) Voll-Durchlauf gegen die Schnittstelle ---------------------------------------------

// Die benannte Ausnahme (4T-002005, Entscheidung F1 im Rahmen von A2): Der
// Molad Tischri 5807 fällt auf einen Sonntag gegen 11:04 Uhr, das Vorjahr ist
// ein Schaltjahr. «lo ADU Rosch» verschiebt auf Montag, 01.10.2046;
// BeTU-TaKPaT greift nur bei einem Molad am Montag und greift deshalb nicht.
// Die Schnittstelle beginnt 5807 am Dienstag, 02.10.2046, gibt 5806 einen
// langen Cheschwan und 5807 einen Tag weniger; vom 10.11.2045 bis 29.11.2046
// liegt ihr Datum deshalb einen Tag neben dem der Regel. Die Vorlage folgt der
// Regel. Eine berichtigte Fassung der Schnittstelle leert die Ausnahme; dann
// färbt sich dieser Fall rot und ist anzupassen.
const AUSNAHME_VON = Date.UTC(2045, 10, 10);
const AUSNAHME_BIS = Date.UTC(2046, 10, 29);

describe('a) Voll-Durchlauf gegen die Schnittstelle «hebrew» (4T-002005)', () => {
  it('die Hilfsrechnung Rata Die stimmt mit Date überein', () => {
    for (const [y, m, d] of [
      [1970, 1, 1],
      [1, 1, 1],
      [1900, 3, 1],
      [2000, 2, 29],
      [2046, 10, 1],
      [-3760, 9, 7],
    ]) {
      expect(rataDie(y, m, d), `${y}-${m}-${d}`).toBe(utc(y, m, d).getTime() / TAG_MS + 719163);
    }
  });

  it(
    'AK2: 1900-01-01 bis 2100-12-31 gleich, außer genau am 10.11.2045 bis 29.11.2046',
    { timeout: RECHEN_ZEITLIMIT },
    () => {
      const { block, kalender } = blockMitHebraeisch();
      const lies = schnittstelle();
      let tage = 0;
      const abweichend = [];
      const beispiele = [];
      for (let ms = Date.UTC(1900, 0, 1); ms <= Date.UTC(2100, 11, 31); ms += TAG_MS) {
        const d = new Date(ms);
        tage++;
        const tupel = hebraeischAus(block, segmente(d));
        const ep = epochOf(kalender, tupel);
        const modell = [ep.year, tupel[1], tupel[2], cycleAt(kalender, tupel, 'week').position];
        const soll = lies(d);
        if (ep.index !== 1 || modell.some((v, k) => v !== soll[k])) {
          abweichend.push(iso(d));
          if (beispiele.length < 10) {
            beispiele.push(
              `${iso(d)}: Vorlage ${modell.join('/')} ≠ Schnittstelle ${soll.join('/')}`,
            );
          }
        }
      }
      expect(tage).toBe(73414);
      const erwartet = [];
      for (let ms = AUSNAHME_VON; ms <= AUSNAHME_BIS; ms += TAG_MS)
        erwartet.push(iso(new Date(ms)));
      expect(erwartet).toHaveLength(385);
      // Zwei zulässige Ausgänge, nie ein dritter: Eine Schnittstelle mit dem
      // Reihenfolge-Fehler (ICU bis 77, gemessen am 2026-10-24) weicht genau an
      // den 385 Tagen der benannten Ausnahme ab; eine berichtigte Fassung
      // (ICU 78 im Linux-Prüfstand, gemessen am 2026-10-24) weicht an keinem
      // Tag ab. Jede andere Menge ist ein Befund an Regel oder Schnittstelle.
      const zulaessig = abweichend.length === 0 ? [] : erwartet;
      expect(
        abweichend,
        'Die abweichenden Tage sind weder leer (berichtigte Schnittstelle) noch genau die ' +
          'benannte Ausnahme 10.11.2045 bis 29.11.2046. Erste Abweichungen:\n' +
          beispiele.join('\n'),
      ).toEqual(zulaessig);
    },
  );
});

// --- b) Unabhängige Gegenrechnung -------------------------------------------------------------

describe('b) Gegenrechnung mit der klassischen Form (4T-002005)', () => {
  it(
    'AK2: der Jahresbeginn der Vorlage gleicht der klassischen Form in jedem Jahr −300 000 bis 300 000',
    { timeout: RECHEN_ZEITLIMIT },
    () => {
      const { block } = blockMitHebraeisch();
      const abweichungen = [];
      for (let y = -300000; y <= 300000; y++) {
        const g = gregorianischAus(block, [y, 1, 1, 0, 0, 0]);
        const rd = BigInt(rataDie(g[0], g[1], g[2]));
        const soll = klassischerJahresBeginn(BigInt(y));
        if (rd !== soll && abweichungen.length < 10) {
          abweichungen.push(`${y}: Vorlage R.D. ${rd} ≠ klassisch ${soll}`);
        }
      }
      expect(abweichungen, abweichungen.join('\n')).toEqual([]);
    },
  );
});

// --- c) Stichproben ------------------------------------------------------------------------------

// Kennung nach B1: Tischri 01 … Schevat 05, Adar I 05L, Adar / Adar II 06,
// Nisan 07 … Elul 12. Herkunft je Paar.
const AUFTRAG = 'Auftrag des Epics 3E-000333';
const STORY = 'Story 4S-001110, AK14';
const BEKANNT = 'allgemein bekannt, von der Schnittstelle bestätigt (Messung 2026-10-24)';
const STICHPROBEN = [
  { wert: '5784-01-01', gregorianisch: [2023, 9, 16], herkunft: AUFTRAG },
  { wert: '5785-01-01', gregorianisch: [2024, 10, 3], herkunft: AUFTRAG },
  { wert: '5784-07-15', gregorianisch: [2024, 4, 23], herkunft: AUFTRAG },
  { wert: '5786-01-01', gregorianisch: [2025, 9, 23], herkunft: STORY },
  { wert: '5760-01-01', gregorianisch: [1999, 9, 11], herkunft: BEKANNT },
  { wert: '5761-01-01', gregorianisch: [2000, 9, 30], herkunft: BEKANNT },
  { wert: '5785-07-15', gregorianisch: [2025, 4, 13], herkunft: BEKANNT },
  { wert: '5785-03-25', gregorianisch: [2024, 12, 26], herkunft: BEKANNT },
  { wert: '5784-06-14', gregorianisch: [2024, 3, 24], herkunft: BEKANNT },
  { wert: '5785-06-14', gregorianisch: [2025, 3, 14], herkunft: BEKANNT },
  { wert: '5734-01-10', gregorianisch: [1973, 10, 6], herkunft: BEKANNT },
  { wert: '5708-08-05', gregorianisch: [1948, 5, 14], herkunft: BEKANNT },
];
// Paare über die Tages-Zählung Rata Die des Referenzwerks. Anhang C ist aus dem
// Gedächtnis der Sitzung übernommen; das Buch war bei der Umsetzung nicht
// greifbar (so gekennzeichnet, 4T-002005).
const RATA_DIE = [
  { tupel: [1, 1, 1], rd: -1373427, herkunft: 'Referenzwerk, Epoche' },
  {
    tupel: [5706, 3, 7],
    rd: 710347,
    herkunft: 'Referenzwerk, Anhang C (aus dem Gedächtnis, nicht am Buch geprüft)',
  },
];

describe('c) Stichproben (4T-002005)', () => {
  it.each(STICHPROBEN.map((p) => [`${p.wert} = ${p.gregorianisch.join('-')} (${p.herkunft})`, p]))(
    'AK2: %s, hin und zurück',
    (_n, paar) => {
      const { block, kalender } = blockMitHebraeisch();
      const tupel = hebraeischAus(block, paar.gregorianisch);
      expect(formatTuple(kalender, tupel)).toBe(paar.wert);
      const gelesen = parseCanonical(kalender, paar.wert);
      expect(gelesen.ok).toBe(true);
      expect(gelesen.tuple).toEqual(tupel);
      expect(gregorianischAus(block, gelesen.tuple)).toEqual(paar.gregorianisch.concat(NULLUHR));
    },
  );

  it.each(RATA_DIE.map((p) => [`${p.tupel.join('/')} = R.D. ${p.rd} (${p.herkunft})`, p]))(
    'AK2: %s',
    (_n, paar) => {
      const { block } = blockMitHebraeisch();
      const g = gregorianischAus(block, paar.tupel.concat(NULLUHR));
      expect(rataDie(g[0], g[1], g[2])).toBe(paar.rd);
      expect(hebraeischAus(block, g.slice(0, 3))).toEqual(paar.tupel.concat(NULLUHR));
    },
  );

  it('7 Kislew 5706 ist der 12.11.1945', () => {
    const { block } = blockMitHebraeisch();
    expect(gregorianischAus(block, [5706, 3, 7, 0, 0, 0])).toEqual([1945, 11, 12, 0, 0, 0]);
  });
});

// --- d) Grenzfälle --------------------------------------------------------------------------------

describe('d) Grenzfälle (4T-002005)', () => {
  it('AK2: je ein Jahr jeder der sechs Längen', () => {
    const { block } = blockMitHebraeisch();
    const beginn = (y) => {
      const g = gregorianischAus(block, [y, 1, 1, 0, 0, 0]);
      return rataDie(g[0], g[1], g[2]);
    };
    for (const [jahr, laenge] of [
      [5781, 353],
      [5786, 354],
      [5783, 355],
      [5784, 383],
      [5782, 384],
      [5787, 385],
    ]) {
      expect(beginn(jahr + 1) - beginn(jahr), String(jahr)).toBe(laenge);
      expect(klassischeLaenge(BigInt(jahr)), String(jahr)).toBe(BigInt(laenge));
    }
  });

  it('AK5: der Schaltmonat ist ein eigener Monat: 13 Monate in 5784, 12 in 5785', () => {
    const { block, kalender } = blockMitHebraeisch();
    expect(formatTuple(kalender, hebraeischAus(block, [2024, 2, 10]))).toBe('5784-05L-01');
    expect(formatTuple(kalender, hebraeischAus(block, [2024, 2, 9]))).toBe('5784-05-30');
    expect(formatTuple(kalender, hebraeischAus(block, [2024, 3, 11]))).toBe('5784-06-01');
    expect(validateTuple(kalender, [5784, 13, 29, 0, 0, 0]).ok).toBe(true);
    expect(validateTuple(kalender, [5785, 12, 29, 0, 0, 0]).ok).toBe(true);
    expect(validateTuple(kalender, [5785, 13, 1, 0, 0, 0])).toMatchObject({
      ok: false,
      code: 'segmentRange',
    });
  });

  it('AK2: GaTaRaD 5789 und BeTU-TaKPaT 5766 mit ihrem Wochentag', () => {
    const { block, kalender } = blockMitHebraeisch();
    // Montag = 0: Donnerstag 3, Dienstag 1.
    const gatarad = hebraeischAus(block, [2028, 9, 21]);
    expect(formatTuple(kalender, gatarad)).toBe('5789-01-01');
    expect(cycleAt(kalender, gatarad, 'week').position).toBe(3);
    const betutakpat = hebraeischAus(block, [2005, 10, 4]);
    expect(formatTuple(kalender, betutakpat)).toBe('5766-01-01');
    expect(cycleAt(kalender, betutakpat, 'week').position).toBe(1);
  });

  it('AK2: die Stelle der benannten Ausnahme: 1. Tischri 5807 am Montag, 01.10.2046', () => {
    const { block, kalender } = blockMitHebraeisch();
    const neujahr = hebraeischAus(block, [2046, 10, 1]);
    expect(formatTuple(kalender, neujahr)).toBe('5807-01-01');
    expect(cycleAt(kalender, neujahr, 'week').position).toBe(0);
    expect(formatTuple(kalender, hebraeischAus(block, [2046, 9, 30]))).toBe('5806-12-29');
    expect(formatTuple(kalender, hebraeischAus(block, [2046, 9, 30]), { named: true })).toBe(
      '5806-Elul-29',
    );
    expect(klassischerJahresBeginn(5807n)).toBe(BigInt(rataDie(2046, 10, 1)));
  });

  it('AK2: Cheschwan 30 nur in Jahren mit 355 oder 385 Tagen, Kislew 30 nicht bei 353 oder 383', () => {
    const { kalender } = blockMitHebraeisch();
    for (let y = 5660; y <= 5861; y++) {
      const laenge = Number(klassischeLaenge(BigInt(y)));
      const cheschwan30 = validateTuple(kalender, [y, 2, 30, 0, 0, 0]).ok;
      const kislew30 = validateTuple(kalender, [y, 3, 30, 0, 0, 0]).ok;
      expect(cheschwan30, `${y} (${laenge} Tage)`).toBe(laenge === 355 || laenge === 385);
      expect(kislew30, `${y} (${laenge} Tage)`).toBe(laenge !== 353 && laenge !== 383);
    }
  });
});

// --- e) Monats-Kennung im Wert (A13) ----------------------------------------------------------

describe('e) Monats-Kennung mit L im Wert (4T-002005, A13)', () => {
  it('AK5: 5784-05L-01 ist der 10.02.2024, im Rundlauf gelesen und geschrieben', () => {
    const { block, kalender } = blockMitHebraeisch();
    const gelesen = parseCanonical(kalender, '5784-05L-01');
    expect(gelesen).toMatchObject({ ok: true, tuple: [5784, 6, 1, 0, 0, 0] });
    expect(formatTuple(kalender, gelesen.tuple)).toBe('5784-05L-01');
    expect(gregorianischAus(block, gelesen.tuple)).toEqual([2024, 2, 10, 0, 0, 0]);
  });

  it('AK5: 5785-05L-01 gibt es nicht (Gemeinjahr)', () => {
    const { kalender } = blockMitHebraeisch();
    expect(parseCanonical(kalender, '5785-05L-01')).toMatchObject({
      ok: false,
      code: 'segmentRange',
    });
  });

  it('AK5: die benannte Form nennt Adar I an Namens-Stelle 12, 06 meint Adar II oder Adar', () => {
    const { kalender } = blockMitHebraeisch();
    const monat = kalender.levels.find((lv) => lv.id === 'month');
    expect(monat.names).toHaveLength(14);
    expect([monat.names[5], monat.names[12], monat.names[13]]).toEqual([
      'Adar',
      'Adar I',
      'Adar II',
    ]);
    const benannt = (wert) =>
      formatTuple(kalender, parseCanonical(kalender, wert).tuple, { named: true });
    expect(benannt('5784-05L-01')).toBe('5784-Adar I-01');
    expect(benannt('5784-06-14')).toBe('5784-Adar II-14');
    expect(benannt('5785-06-14')).toBe('5785-Adar-14');
    expect(benannt('5784-07-15')).toBe('5784-Nisan-15');
  });
});

// --- f) Fernes Jahr (Story AK11) ----------------------------------------------------------------

describe('f) Fernes Jahr und Rückrechnung (4T-002005, Story AK11)', () => {
  it('AK5: Rundlauf Vorlage → gregorianisch → Vorlage in den internen Jahren ±1 000 000', () => {
    const { block, kalender } = blockMitHebraeisch();
    for (const tupel of [
      [1000000, 1, 1, 0, 0, 0],
      [1000000, 13, 29, 23, 59, 59],
      [-1000000, 3, 15, 12, 30, 15],
      [-1000000, 1, 1, 0, 0, 0],
    ]) {
      expect(validateTuple(kalender, tupel).ok, tupel.join('/')).toBe(true);
      const hin = convertInBlock(block, ID, tupel, 'gregorian');
      expect(hin.ok).toBe(true);
      expect(convertInBlock(block, 'gregorian', hin.tuple, ID)).toEqual({ ok: true, tuple: tupel });
    }
  });

  it('AK5: ein Jahr ≤ 0 erscheint im Zeitalter «vor AM» (internes Jahr 0 = Jahr 1 vor AM)', () => {
    const { block, kalender } = blockMitHebraeisch();
    expect(epochOf(kalender, [0, 1, 1, 0, 0, 0])).toMatchObject({
      index: 0,
      name: 'vor AM',
      year: 1,
    });
    expect(epochOf(kalender, [-1, 1, 1, 0, 0, 0])).toMatchObject({ index: 0, year: 2 });
    expect(epochOf(kalender, [1, 1, 1, 0, 0, 0])).toMatchObject({ index: 1, name: 'AM', year: 1 });
    // Letzter Tag vor dem 1. Tischri 1 AM: 29. Elul des Jahres 1 vor AM, eines
    // Schaltjahres (Elul an Stelle 13, Kennung 12).
    const vortag = hebraeischAus(block, [-3760, 9, 6]);
    expect(vortag.slice(0, 3)).toEqual([0, 13, 29]);
    expect(epochOf(kalender, vortag)).toMatchObject({ index: 0, year: 1 });
  });
});

// --- g) Umrechnung im Block mit Uhrzeit --------------------------------------------------------

describe('g) Umrechnung im Block zur gregorianischen Vorlage mit Uhrzeit (4T-002005)', () => {
  it('AK3: drei Stichtage mit Uhrzeit hin und zurück', () => {
    const { block } = blockMitHebraeisch();
    for (const [gregorianisch, hebraeisch] of [
      [
        [2023, 9, 16, 12, 30, 0],
        [5784, 1, 1, 12, 30, 0],
      ],
      [
        [2024, 2, 10, 0, 0, 0],
        [5784, 6, 1, 0, 0, 0],
      ],
      [
        [2046, 10, 1, 23, 59, 0],
        [5807, 1, 1, 23, 59, 0],
      ],
    ]) {
      expect(convertInBlock(block, 'gregorian', gregorianisch, ID)).toEqual({
        ok: true,
        tuple: hebraeisch,
      });
      expect(convertInBlock(block, ID, hebraeisch, 'gregorian')).toEqual({
        ok: true,
        tuple: gregorianisch,
      });
    }
  });
});

// --- h) Anlegen wie das Menü ---------------------------------------------------------------

describe('h) Anlegen wie das Aufklapp-Menü (4T-002005, Story AK2, AK9)', () => {
  it('AK3: gültige Definition ohne Anker, Woche ab dem Stichtag, keine Gruppierungen', () => {
    const roh = findCalendarTemplate(ID).create(tDe);
    expect(roh).not.toHaveProperty('blockAnchor');
    const { kalender } = blockMitHebraeisch();
    expect(kalender.name).toBe('Hebräischer Kalender');
    expect(kalender.blockAnchor).toBe(undefined);
    expect(kalender.levels.map((lv) => [lv.id, lv.rel ? lv.rel.type : null])).toEqual([
      ['second', null],
      ['minute', 'factor'],
      ['hour', 'factor'],
      ['day', 'factor'],
      ['month', 'byYear'],
      ['year', 'yearly'],
    ]);
    expect(kalender.levels[5].rel).toEqual({ type: 'yearly', rule: 'hebrew' });
    expect(kalender.cycles[0].anchor).toEqual({ tuple: [5784, 1, 1], position: 5 });
    expect(kalender.groups).toEqual([]);
    expect(kalender.epochs.map((e) => [e.name, e.abbr, e.start])).toEqual([
      ['vor AM', 'vor AM', null],
      ['AM', 'AM', [1, 1, 1]],
    ]);
  });

  it('AK3: Startpunkt ohne Anker-Datum ist der 8. Schevat 3760 (01.01. des Jahres 0)', () => {
    const { block, kalender } = blockMitHebraeisch();
    const start = calendarStartPoint(kalender);
    expect(formatTuple(kalender, start)).toBe('3760-05-08');
    expect(gregorianischAus(block, start)).toEqual([0, 1, 1, 0, 0, 0]);
  });

  it('AK8: nicht als Bezug einer Ableitung angeboten (B4)', () => {
    const { kalender } = blockMitHebraeisch();
    const ableitung = { id: 'abl', name: 'abl', derivedFrom: ID, zero: [5784, 1, 1] };
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
