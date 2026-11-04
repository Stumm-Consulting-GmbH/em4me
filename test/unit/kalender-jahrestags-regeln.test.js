// 4T-002445 (Epic 3E-000377): Jahrestags-Regeln im Rechen-Kern der Ableitung —
// abgeleitete Zeitrechnungen auf den vier Zeitrechnungen mit Jahres-Struktur
// (hebräisch, traditionell chinesisch, persisch amtlich, Umm al-Qura), mit den
// Regeln J0 bis J4 der Entscheidung vom 2026-10-29 (Story 4S-001123).
//
// Gerechnet wird gegen die mitgelieferten Quellen des Programms (hebräische
// Regel, Tafeln), nie gegen Proben, außer beim Austausch einer Tafel (AK10).
// Jeder Jahrestag wird zweifach festgehalten: als Wert des Bezugs in der Form
// der Anwendung und als gregorianischer Tag; der gregorianische Tag wird
// zusätzlich aus dem Wert des Bezugs über die Umrechnung des Programms
// gegengerechnet, damit Tabelle und Quelle nicht auseinanderlaufen.
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// Kern und Baustein über den CommonJS-Lader der Laufzeit: Der Prüf-Zugang
// setYearlySourcesForTests wirkt nur auf die Instanz, die der Kern lädt.
const require = createRequire(import.meta.url);
const de = require('../../src/i18n/de.json');
const {
  convertInBlock,
  formatTuple,
  parseCanonical,
  spanTiers,
  validateTuple,
} = require('../../src/shared/calendar/calendar-core.js');
const {
  configForPersist,
  deriveCalendar,
  normalizeCalendarConfig,
} = require('../../src/shared/calendar/calendar-config.js');
const { findCalendarTemplate } = require('../../src/shared/calendar/calendar-templates.js');
const {
  missingDateCode,
  setYearlySourcesForTests,
} = require('../../src/shared/calendar/calendar-yearly.js');
const { compileSafe } = require('../../src/shared/calendar/calendar-core.js');
const regelHebraeisch = require('../../src/shared/calendar/calendar-rule-hebrew.js');
const tafelChinesisch = require('../../src/shared/calendar/year-tables/chinese.js');

afterEach(() => setYearlySourcesForTests(null));

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

const NULLUHR = [0, 0, 0];

function vorlagen(id) {
  return ['gregorian', id].map((x) => ({ id: x, ...findCalendarTemplate(x).create(tDe) }));
}

// Datums-Segmente eines Werts der Bezugs-Zeitrechnung (Monats-Kennung mit L).
function segmenteVon(id, wert) {
  const bezug = normalizeCalendarConfig({ blocks: [{ id: 'w', calendars: vorlagen(id) }] })
    .blocks[0].calendars[1];
  const r = parseCanonical(bezug, wert);
  if (!r.ok) throw new Error(`Wert ${wert} in ${id}: ${r.code}`);
  return r.tuple.slice(0, 3);
}

// Block aus gregorianischer Vorlage, Bezug und Ableitung «abl» mit Nullpunkt.
function ableitung(id, nullpunkt, extra = {}) {
  const roh = {
    blocks: [
      {
        id: 'w',
        calendars: vorlagen(id).concat([
          {
            id: 'abl',
            name: 'Zählung',
            derivedFrom: id,
            zero: segmenteVon(id, nullpunkt),
            ...extra,
          },
        ]),
      },
    ],
  };
  const block = normalizeCalendarConfig(roh).blocks[0];
  return { roh, block, bezug: block.calendars[1], abl: block.calendars[2], id };
}

const gregorianisch = (tuple) =>
  tuple
    .slice(0, 3)
    .reverse()
    .map((x, i) => String(x).padStart(i === 2 ? 4 : 2, '0'))
    .join('.');

// Wert des Bezugs und gregorianischer Tag zu einem Tupel der Ableitung.
function imBezug(ctx, tuple) {
  const b = convertInBlock(ctx.block, 'abl', tuple, ctx.id);
  const g = convertInBlock(ctx.block, 'abl', tuple, 'gregorian');
  expect(b.ok).toBe(true);
  expect(g.ok).toBe(true);
  return { wert: formatTuple(ctx.bezug, b.tuple), tag: gregorianisch(g.tuple) };
}

// Gregorianischer Tag eines Werts des Bezugs, über die Umrechnung des Programms.
function gregorianischVon(ctx, wert) {
  const t = parseCanonical(ctx.bezug, wert);
  expect(t.ok).toBe(true);
  return gregorianisch(convertInBlock(ctx.block, ctx.id, t.tuple, 'gregorian').tuple);
}

// Beginn des Monats m im gezählten Jahr Y (m ab 1).
const monatsAnfang = (ctx, Y, m = 1) => imBezug(ctx, [Y, m, 1, ...NULLUHR]);

function pruefeJahrestag(ctx, Y, wert, tag) {
  const ist = monatsAnfang(ctx, Y);
  expect(ist.wert).toBe(wert);
  expect(ist.tag).toBe(tag);
  expect(gregorianischVon(ctx, wert)).toBe(tag);
}

describe('Hebräisch: «Jahrestag» und «Jahrzeit (aschkenasisch)» (J1, Fälle H1 bis H9)', () => {
  // [Fall, Nullpunkt, gregorianisch, Zieljahr, Jahrestag, Tag, Jahrzeit, Tag]
  const FAELLE = [
    [
      'H1',
      '5783-06-10',
      '03.03.2023',
      5784,
      '5784-06-10',
      '20.03.2024',
      '5784-05L-10',
      '19.02.2024',
    ],
    [
      'H2',
      '5783-06-10',
      '03.03.2023',
      5785,
      '5785-06-10',
      '10.03.2025',
      '5785-06-10',
      '10.03.2025',
    ],
    [
      'H3',
      '5784-06-10',
      '20.03.2024',
      5785,
      '5785-06-10',
      '10.03.2025',
      '5785-06-10',
      '10.03.2025',
    ],
    [
      'H4',
      '5784-05L-10',
      '19.02.2024',
      5785,
      '5785-06-10',
      '10.03.2025',
      '5785-06-10',
      '10.03.2025',
    ],
    [
      'H5',
      '5784-05L-30',
      '10.03.2024',
      5785,
      '5785-07-01',
      '30.03.2025',
      '5785-05-30',
      '28.02.2025',
    ],
    [
      'H6',
      '5783-02-30',
      '24.11.2022',
      5784,
      '5784-03-01',
      '14.11.2023',
      '5784-02-29',
      '13.11.2023',
    ],
    [
      'H6',
      '5783-02-30',
      '24.11.2022',
      5785,
      '5785-02-30',
      '01.12.2024',
      '5785-02-30',
      '01.12.2024',
    ],
    [
      'H7',
      '5787-02-30',
      '10.11.2026',
      5788,
      '5788-02-30',
      '30.11.2027',
      '5788-02-30',
      '30.11.2027',
    ],
    [
      'H7',
      '5787-02-30',
      '10.11.2026',
      5789,
      '5789-03-01',
      '19.11.2028',
      '5789-03-01',
      '19.11.2028',
    ],
    [
      'H8',
      '5783-03-30',
      '24.12.2022',
      5784,
      '5784-04-01',
      '13.12.2023',
      '5784-03-29',
      '12.12.2023',
    ],
    [
      'H8',
      '5783-03-30',
      '24.12.2022',
      5785,
      '5785-03-30',
      '31.12.2024',
      '5785-03-30',
      '31.12.2024',
    ],
    [
      'H9',
      '5785-03-30',
      '31.12.2024',
      5786,
      '5786-03-30',
      '20.12.2025',
      '5786-03-30',
      '20.12.2025',
    ],
    [
      'H9',
      '5785-03-30',
      '31.12.2024',
      5790,
      '5790-04-01',
      '07.12.2029',
      '5790-04-01',
      '07.12.2029',
    ],
  ];

  it('die Jahre der Fälle haben den Aufbau, den die Tabelle des Tasks voraussetzt', () => {
    const tage = (y) =>
      Number(regelHebraeisch.jahresBeginn(BigInt(y + 1)) - regelHebraeisch.jahresBeginn(BigInt(y)));
    expect([5783, 5784, 5785, 5786, 5787, 5788, 5789, 5790].map(tage)).toEqual([
      355, 383, 355, 354, 385, 355, 354, 383,
    ]);
  });

  for (const [fall, nullpunkt, nullTag, Y, jt, jtTag, jz, jzTag] of FAELLE) {
    it(`${fall}: Nullpunkt ${nullpunkt}, Zieljahr ${Y} — «Jahrestag» ${jt}, «Jahrzeit» ${jz}`, () => {
      const jahrestag = ableitung('hebrew', nullpunkt);
      expect(monatsAnfang(jahrestag, Number(nullpunkt.slice(0, 4)))).toEqual({
        wert: nullpunkt,
        tag: nullTag,
      });
      pruefeJahrestag(jahrestag, Y, jt, jtTag);
      const jahrzeit = ableitung('hebrew', nullpunkt, { anniversaryRule: 'yahrzeit' });
      pruefeJahrestag(jahrzeit, Y, jz, jzTag);
    });
  }

  it('die Regel ist Teil der Definition; ohne Angabe gilt «Jahrestag»', () => {
    expect(ableitung('hebrew', '5783-06-10').abl.derived.anniversaryRule).toBe('anniversary');
    expect(
      ableitung('hebrew', '5783-06-10', { anniversaryRule: 'unbekannt' }).abl.derived
        .anniversaryRule,
    ).toBe('anniversary');
    expect(
      ableitung('hebrew', '5783-06-10', { anniversaryRule: 'yahrzeit' }).abl.derived
        .anniversaryRule,
    ).toBe('yahrzeit');
  });
});

describe('Traditionell chinesisch, persisch amtlich, Umm al-Qura (J2 bis J4)', () => {
  // [Fall, Zeitrechnung, Nullpunkt, gregorianisch, Zieljahr, Jahrestag, Tag]
  const FAELLE = [
    ['C1', 'chinese', '2025-06L-10', '03.08.2025', 2026, '2026-06-10', '23.07.2026'],
    ['C2', 'chinese', '2025-06L-10', '03.08.2025', 2036, '2036-06L-10', '01.08.2036'],
    ['C3', 'chinese', '2024-06-10', '15.07.2024', 2025, '2025-06-10', '04.07.2025'],
    ['C4', 'chinese', '2027-04-30', '04.06.2027', 2028, '2028-04-29', '23.05.2028'],
    ['P1', 'persian', '1403-12-30', '20.03.2025', 1404, '1404-12-29', '20.03.2026'],
    ['P2', 'persian', '1403-12-30', '20.03.2025', 1408, '1408-12-30', '20.03.2030'],
    ['U1', 'islamic-umalqura', '1446-02-30', '03.09.2024', 1447, '1447-02-29', '23.08.2025'],
  ];
  for (const [fall, id, nullpunkt, nullTag, Y, wert, tag] of FAELLE) {
    it(`${fall}: Nullpunkt ${nullpunkt}, Zieljahr ${Y} — Jahrestag ${wert}`, () => {
      const ctx = ableitung(id, nullpunkt);
      expect(monatsAnfang(ctx, Number(nullpunkt.slice(0, 4)))).toEqual({
        wert: nullpunkt,
        tag: nullTag,
      });
      pruefeJahrestag(ctx, Y, wert, tag);
    });
  }

  it('C3: der Normalmonat bleibt im Normalmonat, der Schaltmonat 2025 ist ein eigener gezählter Monat', () => {
    const ctx = ableitung('chinese', '2024-06-10');
    expect(monatsAnfang(ctx, 2025, 2).wert).toBe('2025-06L-10');
    expect(monatsAnfang(ctx, 2025, 3).wert).toBe('2025-07-10');
  });

  it('die Regel wird bei einem nicht hebräischen Bezug nicht geschrieben', () => {
    const ctx = ableitung('chinese', '2025-06L-10', { anniversaryRule: 'yahrzeit' });
    expect('anniversaryRule' in ctx.abl.derived).toBe(false);
    expect(ctx.abl.levels.at(-1).rel.anniversaryRule).toBeUndefined();
    expect(monatsAnfang(ctx, 2026).wert).toBe('2026-06-10');
  });
});

describe('Regel an jeder Monatsgrenze (J0, Fälle M1 bis M4)', () => {
  it('M1 hebräisch «Jahrestag»: 30. Schevat vor einem Adar mit 29 Tagen', () => {
    const ctx = ableitung('hebrew', '5785-05-30');
    expect(monatsAnfang(ctx, 5785, 1)).toEqual({ wert: '5785-05-30', tag: '28.02.2025' });
    expect(monatsAnfang(ctx, 5785, 2)).toEqual({ wert: '5785-07-01', tag: '30.03.2025' });
    expect(monatsAnfang(ctx, 5785, 3).wert).toBe('5785-07-30');
  });

  it('M2 Umm al-Qura: 30. Muharram vor einem Safar mit 29 Tagen', () => {
    const ctx = ableitung('islamic-umalqura', '1447-01-30');
    expect(monatsAnfang(ctx, 1447, 1).tag).toBe('25.07.2025');
    expect(monatsAnfang(ctx, 1447, 2)).toEqual({ wert: '1447-02-29', tag: '23.08.2025' });
    expect(monatsAnfang(ctx, 1447, 3)).toEqual({ wert: '1447-03-30', tag: '22.09.2025' });
  });

  it('M3 chinesisch: 30. Tag vor einem Monat mit 29 Tagen', () => {
    const ctx = ableitung('chinese', '2027-02-30');
    expect(monatsAnfang(ctx, 2027, 1).tag).toBe('06.04.2027');
    expect(monatsAnfang(ctx, 2027, 2)).toEqual({ wert: '2027-03-29', tag: '05.05.2027' });
  });

  // Lesart von J0 bei der Jahrzeit (Schritt 1): Die Zweige zum 30. Cheschwan
  // und 30. Kislew greifen an jeder Monatsgrenze im Cheschwan beziehungsweise
  // Kislew, mit der Bedingung des ersten Jahres nach dem Nullpunkt; der Zweig
  // zum 30. Adar I allein am Jahrestag; sonst Überlauf wie beim «Jahrestag».
  it('M4a «Jahrzeit»: Nullpunkt 30. Cheschwan 5783, 5784 mit kurzem Kislew — Kislew-Grenze am 30. (langer Kislew 5783, letzter Tag des Monats nach J1a)', () => {
    const jz = ableitung('hebrew', '5783-02-30', { anniversaryRule: 'yahrzeit' });
    expect(monatsAnfang(jz, 5783, 2).wert).toBe('5783-03-30');
    expect(monatsAnfang(jz, 5783, 3).wert).toBe('5783-05-01');
    const jt = ableitung('hebrew', '5783-02-30');
    expect(monatsAnfang(jt, 5783, 2).wert).toBe('5783-03-30');
    expect(monatsAnfang(jt, 5783, 3).wert).toBe('5783-05-01');
  });

  it('M4b «Jahrzeit»: Nullpunkt 30. Tischri 5785, 5786 ohne 30. Cheschwan — Cheschwan-Grenze am 30. im langen Cheschwan 5785 und am 29. im kurzen 5786 (letzter Tag des Monats, J1a)', () => {
    const jz = ableitung('hebrew', '5785-01-30', { anniversaryRule: 'yahrzeit' });
    expect(monatsAnfang(jz, 5785, 2).wert).toBe('5785-02-30');
    expect(monatsAnfang(jz, 5785, 3).wert).toBe('5785-03-30');
    expect(monatsAnfang(jz, 5786, 2).wert).toBe('5786-02-29');
    const jt = ableitung('hebrew', '5785-01-30');
    expect(monatsAnfang(jt, 5785, 2).wert).toBe('5785-02-30');
    expect(monatsAnfang(jt, 5786, 2).wert).toBe('5786-03-01');
  });

  it('M4c «Jahrzeit»: Nullpunkt 30. Schevat 5784 — Adar I am 30., Adar II mit Überlauf auf den 1. Nisan', () => {
    const jz = ableitung('hebrew', '5784-05-30', { anniversaryRule: 'yahrzeit' });
    expect(monatsAnfang(jz, 5784, 2).wert).toBe('5784-05L-30');
    expect(monatsAnfang(jz, 5784, 3).wert).toBe('5784-07-01');
    expect(monatsAnfang(jz, 5785, 1).wert).toBe('5785-05-30');
    expect(monatsAnfang(jz, 5785, 2).wert).toBe('5785-07-01');
  });

  it('M4d «Jahrzeit»: Nullpunkt 30. Adar I 5784 — das gezählte Jahr endet am 30. Schevat 5785 nach zwölf Monaten', () => {
    const jz = ableitung('hebrew', '5784-05L-30', { anniversaryRule: 'yahrzeit' });
    expect(monatsAnfang(jz, 5784, 2).wert).toBe('5784-07-01');
    expect(monatsAnfang(jz, 5784, 12).wert).toBe('5785-05-01');
    expect(validateTuple(jz.abl, [5784, 13, 1, ...NULLUHR]).ok).toBe(false);
    expect(monatsAnfang(jz, 5785, 1).wert).toBe('5785-05-30');
  });
});

describe('Annahme im Kern, Ketten ausgeschlossen (AK2)', () => {
  for (const [id, nullpunkt] of [
    ['hebrew', '5784-01-01'],
    ['chinese', '2025-01-01'],
    ['persian', '1404-01-01'],
    ['islamic-umalqura', '1446-01-01'],
  ]) {
    it(`${id}: eine Ableitung wird angenommen und zählt ab dem Nullpunkt`, () => {
      const ctx = ableitung(id, nullpunkt);
      expect(ctx.block.calendars.map((c) => c.id)).toEqual(['gregorian', id, 'abl']);
      expect(ctx.abl.derived.fromId).toBe(id);
      expect(ctx.abl.blockAnchor).toBeUndefined();
      const t = parseCanonical(ctx.abl, '0-0-1');
      expect(t.ok).toBe(true);
      expect(imBezug(ctx, t.tuple).wert).toBe(nullpunkt);
      expect(deriveCalendar(ctx.bezug, { id: 'x', zero: segmenteVon(id, nullpunkt) })).not.toBe(
        null,
      );
    });
  }

  it('eine Ableitung auf einer Ableitung entfällt', () => {
    const ctx = ableitung('chinese', '2025-01-01');
    ctx.roh.blocks[0].calendars.push({ id: 'kette', derivedFrom: 'abl', zero: [1, 0, 1] });
    const ids = normalizeCalendarConfig(ctx.roh).blocks[0].calendars.map((c) => c.id);
    expect(ids).toEqual(['gregorian', 'chinese', 'abl']);
  });
});

describe('Zeitspanne, Anzeige und Eingabe (AK5, Story AK5)', () => {
  const anzahl = (tier, id) => tier.find((u) => u.id === id).count;

  function amTag(ctx, wert) {
    const t = parseCanonical(ctx.bezug, wert);
    expect(t.ok).toBe(true);
    const r = convertInBlock(ctx.block, ctx.id, t.tuple, 'abl');
    expect(r.ok).toBe(true);
    return r.tuple;
  }

  it('«Jahrestag», Nullpunkt H1: am 10. Adar II 5784 genau ein volles Jahr, am Tag davor noch keines', () => {
    const ctx = ableitung('hebrew', '5783-06-10');
    const tag = amTag(ctx, '5784-06-10');
    expect(formatTuple(ctx.abl, tag)).toBe('1-0-1');
    const voll = spanTiers(ctx.abl, tag);
    expect(voll.direction).toBe('after');
    const jahre = voll.tiers.at(-1);
    expect(anzahl(jahre, 'year')).toBe(1);
    expect(anzahl(jahre, 'month')).toBe(0);
    // Das gezählte Jahr 5783 hat dreizehn Monate (Adar 5783 bis Adar I 5784).
    expect(anzahl(voll.tiers[2], 'month')).toBe(13);
    const davor = spanTiers(ctx.abl, amTag(ctx, '5784-06-09'));
    expect(anzahl(davor.tiers.at(-1), 'year')).toBe(0);
    expect(anzahl(davor.tiers.at(-1), 'month')).toBe(12);
    expect(anzahl(davor.tiers.at(-1), 'day')).toBe(2);
    expect(anzahl(davor.tiers.at(-1), 'week')).toBe(4);
    expect(formatTuple(ctx.abl, amTag(ctx, '5784-06-09'))).toBe('0-12-30');
  });

  it('«Jahrzeit», Nullpunkt H1: am 10. Adar I 5784 genau ein volles Jahr, am Tag davor noch keines', () => {
    const ctx = ableitung('hebrew', '5783-06-10', { anniversaryRule: 'yahrzeit' });
    const tag = amTag(ctx, '5784-05L-10');
    expect(formatTuple(ctx.abl, tag)).toBe('1-0-1');
    expect(anzahl(spanTiers(ctx.abl, tag).tiers.at(-1), 'year')).toBe(1);
    expect(anzahl(spanTiers(ctx.abl, tag).tiers[2], 'month')).toBe(12);
    const davor = spanTiers(ctx.abl, amTag(ctx, '5784-05L-09'));
    expect(anzahl(davor.tiers.at(-1), 'year')).toBe(0);
    expect(anzahl(davor.tiers.at(-1), 'month')).toBe(11);
    expect(formatTuple(ctx.abl, amTag(ctx, '5784-05L-09'))).toBe('0-11-30');
  });

  it('vor dem Nullpunkt zählt die Zeitspanne rückwärts ab 1', () => {
    const ctx = ableitung('hebrew', '5783-06-10');
    expect(spanTiers(ctx.abl, amTag(ctx, '5783-06-09')).direction).toBe('before');
    expect(formatTuple(ctx.abl, amTag(ctx, '5783-06-09'))).toBe('0-0-1 vor');
    // 5782 ist ein Schaltjahr: Der Jahrestag liegt am 10. Adar II, der Tag
    // davor ist der erste Tag vor dem vollen Jahr; das volle gezählte Jahr
    // 5782 (10. Adar II 5782 bis 9. Adar 5783) hat zwölf Monate.
    const tag = amTag(ctx, '5782-06-09');
    expect(formatTuple(ctx.abl, tag)).toBe('1-0-1 vor');
    expect(anzahl(spanTiers(ctx.abl, tag).tiers[2], 'month')).toBe(12);
    // Der 30. Schevat liegt zehn Tage vor dem 10. Adar.
    expect(formatTuple(ctx.abl, amTag(ctx, '5783-05-30'))).toBe('0-0-10 vor');
  });

  it('Anzeige und Eingabe sind zueinander rund, in beiden Richtungen und über Schaltjahre', () => {
    for (const [id, nullpunkt, extra] of [
      ['hebrew', '5783-06-10', {}],
      ['hebrew', '5784-05L-30', { anniversaryRule: 'yahrzeit' }],
      ['chinese', '2025-06L-10', {}],
      ['persian', '1403-12-30', {}],
      ['islamic-umalqura', '1446-02-30', {}],
    ]) {
      const ctx = ableitung(id, nullpunkt, extra);
      const start = amTag(ctx, nullpunkt);
      for (const versatz of [
        0, 1, 29, 30, 31, 200, 383, 384, 385, 1000, 2500, -1, -30, -400, -2500,
      ]) {
        const greg = convertInBlock(ctx.block, 'abl', start, 'gregorian').tuple;
        const d = new Date(Date.UTC(greg[0], greg[1] - 1, greg[2] + versatz));
        const r = convertInBlock(
          ctx.block,
          'gregorian',
          [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), ...NULLUHR],
          'abl',
        );
        expect(r.ok).toBe(true);
        const text = formatTuple(ctx.abl, r.tuple);
        // Ein Wert genau auf einer Einheiten-Grenze vor dem Nullpunkt trägt im
        // Bestand die Ordnungszahl 0, die die Eingabe abweist — bei festem
        // Aufbau ebenso (Nebenbefund, im Bericht des Tasks); er bleibt hier
        // außen vor.
        if (/-0 vor$/.test(text)) continue;
        const zurueck = parseCanonical(ctx.abl, text);
        expect(zurueck.ok, `${id} ${versatz} ${text}`).toBe(true);
        expect(zurueck.tuple).toEqual(r.tuple);
      }
    }
  });

  it('eine Eingabe mit mehr Monaten als das Jahr hat, läuft ins Folgejahr über', () => {
    const ctx = ableitung('hebrew', '5783-06-10');
    // 13 Monate ab dem Nullpunkt enden im Schaltjahr genau am Jahrestag.
    expect(formatTuple(ctx.abl, parseCanonical(ctx.abl, '0-13-1').tuple)).toBe('1-0-1');
    expect(formatTuple(ctx.abl, parseCanonical(ctx.abl, '0-25-1').tuple)).toBe('2-0-1');
  });
});

describe('Außerhalb des Geltungs-Zeitraums «nicht bekannt» (Story AK9)', () => {
  it('chinesisch, Nullpunkt 2100-01-01: der Jahrestag 2101 ist nicht bekannt', () => {
    const ctx = ableitung('chinese', '2100-01-01');
    const jahrestag = [2101, 1, 1, ...NULLUHR];
    expect(validateTuple(ctx.abl, jahrestag).code).toBe('unknown');
    expect(convertInBlock(ctx.block, 'abl', jahrestag, 'gregorian').code).toBe('unknown');
    expect(parseCanonical(ctx.abl, '1-0-1').code).toBe(missingDateCode(compileSafe(ctx.abl)));
    expect(parseCanonical(ctx.abl, '1-0-1').code).toBe('unknown');
    expect(parseCanonical(ctx.abl, '0-14-1').code).toBe('unknown');
    expect(convertInBlock(ctx.block, 'gregorian', [2101, 2, 1, ...NULLUHR], 'abl').code).toBe(
      'unknown',
    );
  });

  it('Umm al-Qura, Nullpunkt 1500-01-01: der Jahrestag 1501 ist nicht bekannt', () => {
    const ctx = ableitung('islamic-umalqura', '1500-01-01');
    expect(validateTuple(ctx.abl, [1501, 1, 1, ...NULLUHR]).code).toBe('unknown');
    expect(parseCanonical(ctx.abl, '1-0-1').code).toBe('unknown');
  });

  it('vor dem ersten Jahrestag im Zeitraum ist ein Tag nicht bekannt, weil sein Monats-Anfang davor läge', () => {
    const ctx = ableitung('chinese', '2025-06L-10');
    expect(convertInBlock(ctx.block, 'chinese', [1901, 1, 1, ...NULLUHR], 'abl').code).toBe(
      'unknown',
    );
    expect(convertInBlock(ctx.block, 'chinese', [1901, 6, 10, ...NULLUHR], 'abl').ok).toBe(true);
  });
});

describe('Lebenszyklus: Ablage, Laden und fortgeschriebene Tafel (AK4, Story AK10)', () => {
  it('Rundlauf Normalisieren, Ablage-Form, Normalisieren hält die Regel', () => {
    for (const extra of [{ anniversaryRule: 'yahrzeit' }, { anniversaryRule: 'anniversary' }, {}]) {
      const ctx = ableitung('hebrew', '5783-06-10', extra);
      const ablage = configForPersist(ctx.roh, normalizeCalendarConfig(ctx.roh));
      const kurz = ablage.blocks[0].calendars[2];
      expect(kurz.levels).toBeUndefined();
      expect(kurz.anniversaryRule).toBe(extra.anniversaryRule);
      const zurueck = normalizeCalendarConfig(JSON.parse(JSON.stringify(ablage))).blocks[0];
      expect(JSON.stringify(zurueck.calendars[2])).toBe(JSON.stringify(ctx.abl));
      expect(zurueck.calendars[2].derived.anniversaryRule).toBe(
        extra.anniversaryRule || 'anniversary',
      );
    }
  });

  it('eine ausgetauschte Tafel mit geänderter Monatslänge verschiebt den Jahrestag (Verweis statt Abschrift)', () => {
    expect(monatsAnfang(ableitung('chinese', '2027-04-30'), 2028).wert).toBe('2028-04-29');
    // Zeile 2028 der Tafel: der 4. Monat mit 30 statt 29 Tagen.
    const i = 2028 - tafelChinesisch.ersteJahr;
    const zeile = tafelChinesisch.jahre[i].split(',');
    expect(zeile[3]).toBe('29');
    zeile[3] = '30';
    const jahre = tafelChinesisch.jahre.slice();
    jahre[i] = zeile.join(',');
    setYearlySourcesForTests({
      rules: { hebrew: regelHebraeisch },
      tables: {
        chinese: { ...tafelChinesisch, jahre },
        persian: require('../../src/shared/calendar/year-tables/persian.js'),
        'islamic-umalqura': require('../../src/shared/calendar/year-tables/islamic-umalqura.js'),
      },
    });
    expect(monatsAnfang(ableitung('chinese', '2027-04-30'), 2028).wert).toBe('2028-04-30');
  });
});

describe('Ränder (Story AK11 und AK12)', () => {
  // Je Fall drei aufeinanderfolgende Zieljahre: genau ein Jahrestag je Jahr,
  // im Bezugs-Jahr gleicher Nummer, aufsteigend.
  for (const [fall, id, nullpunkt, extra, ab] of [
    ['H6', 'hebrew', '5783-02-30', {}, 5784],
    ['H6 Jahrzeit', 'hebrew', '5783-02-30', { anniversaryRule: 'yahrzeit' }, 5784],
    ['H7', 'hebrew', '5787-02-30', {}, 5788],
    ['H7 Jahrzeit', 'hebrew', '5787-02-30', { anniversaryRule: 'yahrzeit' }, 5788],
    ['H8', 'hebrew', '5783-03-30', {}, 5784],
    ['H8 Jahrzeit', 'hebrew', '5783-03-30', { anniversaryRule: 'yahrzeit' }, 5784],
    ['H9', 'hebrew', '5785-03-30', {}, 5786],
    ['H9 Jahrzeit', 'hebrew', '5785-03-30', { anniversaryRule: 'yahrzeit' }, 5786],
    ['C1', 'chinese', '2025-06L-10', {}, 2026],
    ['C2', 'chinese', '2025-06L-10', {}, 2035],
    ['C3', 'chinese', '2024-06-10', {}, 2025],
  ]) {
    it(`${fall}: in drei aufeinanderfolgenden Jahren je genau ein Jahrestag, aufsteigend`, () => {
      const ctx = ableitung(id, nullpunkt, extra);
      let vorher = null;
      for (let Y = ab; Y < ab + 3; Y++) {
        const t = [Y, 1, 1, ...NULLUHR];
        expect(validateTuple(ctx.abl, t).ok).toBe(true);
        const b = convertInBlock(ctx.block, 'abl', t, id).tuple;
        expect(b[0]).toBe(Y);
        const g = convertInBlock(ctx.block, 'abl', t, 'gregorian').tuple;
        const tag = Date.UTC(g[0], g[1] - 1, g[2]);
        if (vorher !== null) expect(tag).toBeGreaterThan(vorher);
        vorher = tag;
      }
    });
  }

  function letzterTag(id, gregorianischerTag) {
    const block = normalizeCalendarConfig({ blocks: [{ id: 'w', calendars: vorlagen(id) }] })
      .blocks[0];
    const r = convertInBlock(block, 'gregorian', [...gregorianischerTag, ...NULLUHR], id);
    return formatTuple(block.calendars[1], r.tuple);
  }

  for (const [id, nullpunkt] of [
    ['chinese', '1901-01-01'],
    ['persian', '1279-01-01'],
    ['islamic-umalqura', '1318-01-01'],
    ['persian', '1479-12-29'],
    ['islamic-umalqura', '1500-12-30'],
    ['chinese', () => letzterTag('chinese', [2101, 1, 28])],
  ]) {
    const wert = typeof nullpunkt === 'function' ? nullpunkt() : nullpunkt;
    it(`${id}: ein Nullpunkt am Rand des Zeitraums (${wert}) wird angenommen`, () => {
      const ctx = ableitung(id, wert);
      expect(ctx.block.calendars.map((c) => c.id)).toEqual(['gregorian', id, 'abl']);
      const t = parseCanonical(ctx.abl, '0-0-1');
      expect(t.ok).toBe(true);
      expect(imBezug(ctx, t.tuple).wert).toBe(wert);
    });
  }

  it('der letzte Tag des chinesischen Zeitraums ist der 28.01.2101', () => {
    expect(letzterTag('chinese', [2101, 1, 28]).startsWith('2100-12-')).toBe(true);
  });
});

describe('Monate vor einem Jahr in geschlossener Form (hebräische Regel)', () => {
  it('die Differenz zweier Jahre ist die Zahl ihrer Monate', () => {
    for (let jahr = -2000n; jahr <= 8000n; jahr += 1n) {
      const zahl = regelHebraeisch.monateVor(jahr + 1n) - regelHebraeisch.monateVor(jahr);
      if (zahl !== BigInt(regelHebraeisch.monate(jahr).length)) {
        throw new Error(`Jahr ${jahr}: ${zahl} statt ${regelHebraeisch.monate(jahr).length}`);
      }
    }
  });
});
