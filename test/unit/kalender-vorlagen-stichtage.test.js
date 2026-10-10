// 4T-001998 (Epic 3E-000307): Nachweis der sechs Kalender-Vorlagen, Quelle 2 —
// veröffentlichte Stichtage. Die Datums-Paare stammen aus der Erhebung
// Tests/3E-000307/Erhebung/teil-b/ (unversioniert; dort stehen je Paar das
// wörtliche Zitat und der abgelegte Abruf-Text). Als Erwartung zählen die
// Tabellen «Ausdrücklich belegte Entsprechungen»; Paare aus den Tabellen
// «Abgeleitete Entsprechungen» stehen getrennt und als abgeleitet
// gekennzeichnet. Jedes Paar trägt die Adresse seiner Quelle, Abruf jeweils am
// 2026-09-30. Dazu die Umrechnung im Block zur gregorianischen Vorlage mit
// Zeit-Anteil in beiden Richtungen (AK5). Den Voll-Durchlauf gegen die
// Schnittstelle prüft test/unit/kalender-vorlagen-nachweis.test.js.
import { describe, it, expect } from 'vitest';
import de from '../../src/i18n/de.json';
import { convertInBlock, epochOf } from '../../src/shared/calendar/calendar-core.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';

const tDe = (key) => {
  if (!(key in de)) throw new Error(`Schlüssel fehlt im Katalog: ${key}`);
  return de[key];
};

function blockMit(id) {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: [
          findCalendarTemplate('gregorian').create(tDe),
          findCalendarTemplate(id).create(tDe),
        ],
      },
    ],
  });
  return { block: config.blocks[0], kalender: config.blocks[0].calendars[1] };
}

// Ein Paar: eigen = [Anzeige-Jahr, Monat, Tag] in der Epoche ab der Ära
// (epoche 1), sonst mit epoche: 0 (offen in die Vergangenheit, rückwärts
// zählend); gregorianisch = [Jahr (astronomisch), Monat, Tag]; nurJahr prüft
// allein Epoche und Anzeige-Jahr.
function pruefePaar(id, paar) {
  const { block, kalender } = blockMit(id);
  const hin = convertInBlock(block, 'gregorian', paar.gregorianisch.concat([0, 0, 0]), id);
  expect(hin.ok).toBe(true);
  const ep = epochOf(kalender, hin.tuple);
  const epoche = paar.epoche ?? 1;
  if (paar.nurJahr) {
    expect([ep.index, ep.year]).toEqual([epoche, paar.eigen[0]]);
    return;
  }
  expect([ep.index, ep.year, hin.tuple[1], hin.tuple[2]]).toEqual([epoche, ...paar.eigen]);
  // Rückweg: derselbe Tag der Vorlage ergibt wieder den gregorianischen Tag.
  expect(convertInBlock(block, id, hin.tuple, 'gregorian')).toEqual({
    ok: true,
    tuple: paar.gregorianisch.concat([0, 0, 0]),
  });
}

const WP = 'https://en.wikipedia.org/wiki/';

// --- Julianischer Kalender (teil-b/julianisch.md) ----------------------------------------
// Jahres-Zahlen der Umrechnungs-Tabelle in astronomischer Zählung: −500 ist
// 501 v. Chr., in der Vorlage also Epoche 0, Anzeige-Jahr 501.
const KONV = `${WP}Conversion_between_Julian_and_Gregorian_calendars`;
const JULIAN_AUSDRUECKLICH = [
  { eigen: [501, 3, 6], epoche: 0, gregorianisch: [-500, 3, 1], quelle: KONV },
  { eigen: [200, 3, 1], gregorianisch: [200, 3, 1], quelle: KONV },
  { eigen: [1582, 10, 4], gregorianisch: [1582, 10, 14], quelle: KONV },
  { eigen: [1582, 10, 5], gregorianisch: [1582, 10, 15], quelle: KONV },
  { eigen: [1700, 2, 19], gregorianisch: [1700, 3, 1], quelle: KONV },
  { eigen: [1700, 2, 29], gregorianisch: [1700, 3, 11], quelle: KONV },
  { eigen: [1800, 2, 29], gregorianisch: [1800, 3, 12], quelle: KONV },
  { eigen: [1900, 2, 17], gregorianisch: [1900, 3, 1], quelle: KONV },
  { eigen: [1900, 2, 29], gregorianisch: [1900, 3, 13], quelle: KONV },
  { eigen: [2100, 2, 15], gregorianisch: [2100, 2, 28], quelle: `${WP}Gregorian_calendar` },
  { eigen: [2100, 2, 16], gregorianisch: [2100, 3, 1], quelle: KONV },
  { eigen: [2100, 2, 29], gregorianisch: [2100, 3, 14], quelle: KONV },
  { eigen: [1642, 12, 25], gregorianisch: [1643, 1, 4], quelle: `${WP}Isaac_Newton` },
  { eigen: [1727, 3, 20], gregorianisch: [1727, 3, 31], quelle: `${WP}Isaac_Newton` },
  { eigen: [1917, 10, 25], gregorianisch: [1917, 11, 7], quelle: `${WP}October_Revolution` },
];
const JULIAN_ABGELEITET = [
  {
    eigen: [1752, 9, 2],
    gregorianisch: [1752, 9, 13],
    quelle: 'https://www.webexhibits.org/calendars/year-text-British.html',
  },
  {
    eigen: [1918, 1, 31],
    gregorianisch: [1918, 2, 13],
    quelle: `${WP}Adoption_of_the_Gregorian_calendar`,
  },
  {
    eigen: [1923, 2, 15],
    gregorianisch: [1923, 2, 28],
    quelle: `${WP}Adoption_of_the_Gregorian_calendar`,
  },
  { eigen: [1900, 1, 1], gregorianisch: [1900, 1, 13], quelle: `${WP}Old_New_Year` },
  { eigen: [2027, 1, 1], gregorianisch: [2027, 1, 14], quelle: `${WP}Old_New_Year` },
  { eigen: [2026, 1, 1], gregorianisch: [2026, 1, 14], quelle: `${WP}Old_New_Year` },
  { eigen: [2100, 1, 1], gregorianisch: [2100, 1, 14], quelle: `${WP}Old_New_Year` },
  { eigen: [2025, 12, 25], gregorianisch: [2026, 1, 7], quelle: `${WP}Gregorian_calendar` },
];

// --- Indischer Nationalkalender (teil-b/saka.md) -----------------------------------------
// Monate: 1 Chaitra, 2 Vaisakha, 3 Jyaistha, 4 Asadha, 5 Sravana, 6 Bhadra,
// 7 Asvina, 8 Kartika, 9 Agrahayana, 10 Pausa, 11 Magha, 12 Phalguna.
const WS = 'https://en.wikisource.org/wiki/';
const GC = 'https://www.gconnect.in/orders-in-brief/leave-ltc/leave/';
const GC2020 = `${GC}central-government-holidays-2020.html`;
const GC2024 = `${GC}holidays-observed-central-government-offices-year-2024.html`;
const GC2025 = `${GC}holidays-observed-central-government-offices-2025.html`;
const INDIAN_AUSDRUECKLICH = [
  { eigen: [1879, 1, 1], gregorianisch: [1957, 3, 22], quelle: `${WP}Indian_national_calendar` },
  {
    eigen: [1882, 10, 8],
    gregorianisch: [1960, 12, 29],
    quelle: `${WS}Preventive_Detention_(Continuance)_Act,_1960`,
  },
  { eigen: [1883, 3, 1], gregorianisch: [1961, 5, 22], quelle: `${WS}Dowry_Prohibition_Act,_1961` },
  {
    eigen: [1885, 2, 21],
    gregorianisch: [1963, 5, 11],
    quelle: `${WS}Official_Languages_Act,_1963`,
  },
  {
    eigen: [1921, 10, 9],
    gregorianisch: [1999, 12, 30],
    quelle: `${WS}Geographical_Indications_of_Goods_(Registration_and_Protection)_Act,_1999`,
  },
  {
    eigen: [1925, 10, 18],
    gregorianisch: [2004, 1, 8],
    quelle: `${WS}Citizenship_(Amendment)_Act,_2003`,
  },
  {
    eigen: [1927, 3, 31],
    gregorianisch: [2005, 6, 21],
    quelle: `${WS}Right_to_Information_Act,_2005`,
  },
  {
    eigen: [1935, 12, 14],
    gregorianisch: [2014, 3, 5],
    quelle: `${WS}National_Institutes_of_Technology,_Science_Education_and_Research_(Amendment)_Act,_2014`,
  },
  {
    eigen: [1936, 12, 19],
    gregorianisch: [2015, 3, 10],
    quelle: `${WS}Citizenship_(Amendment)_Act,_2015`,
  },
  {
    eigen: [1939, 2, 1],
    gregorianisch: [2017, 4, 21],
    quelle: `${WS}Human_Immunodeficiency_Virus_and_Acquired_Immune_Deficiency_Syndrome_(Prevention_and_Control)_Act,_2017`,
  },
  {
    eigen: [1941, 1, 1],
    gregorianisch: [2019, 3, 22],
    quelle:
      'https://www.thequint.com/news/india/indian-national-calendar-saka-calendar-new-year-22-march-1941',
  },
  {
    eigen: [1941, 5, 9],
    gregorianisch: [2019, 7, 31],
    quelle: `${WS}Muslim_Women_(Protection_of_Rights_on_Marriage)_Act,_2019`,
  },
  {
    eigen: [1941, 5, 18],
    gregorianisch: [2019, 8, 9],
    quelle: `${WS}Jammu_and_Kashmir_Reorganisation_Act,_2019`,
  },
  {
    eigen: [1941, 9, 21],
    gregorianisch: [2019, 12, 12],
    quelle: `${WS}Citizenship_(Amendment)_Act,_2019`,
  },
  { eigen: [1941, 12, 20], gregorianisch: [2020, 3, 10], quelle: GC2020 },
  { eigen: [1942, 5, 31], gregorianisch: [2020, 8, 22], quelle: GC2020 },
  { eigen: [1945, 12, 18], gregorianisch: [2024, 3, 8], quelle: GC2024 },
  { eigen: [1946, 1, 5], gregorianisch: [2024, 3, 25], quelle: GC2024 },
  { eigen: [1946, 1, 9], gregorianisch: [2024, 3, 29], quelle: GC2024 },
  { eigen: [1947, 1, 10], gregorianisch: [2025, 3, 31], quelle: GC2025 },
  { eigen: [1946, 2, 1], gregorianisch: [2024, 4, 21], quelle: GC2024 },
  { eigen: [1946, 8, 9], gregorianisch: [2024, 10, 31], quelle: GC2024 },
  { eigen: [1947, 1, 30], gregorianisch: [2025, 4, 20], quelle: GC2025 },
  { eigen: [1947, 7, 30], gregorianisch: [2025, 10, 22], quelle: GC2025 },
  { eigen: [1947, 8, 1], gregorianisch: [2025, 10, 23], quelle: GC2025 },
];
const SAKA_DE = 'https://de.wikipedia.org/wiki/Indischer_Nationalkalender';
const INDIAN_ABGELEITET = [
  { eigen: [1946, 1, 1], gregorianisch: [2024, 3, 21], quelle: `${WP}Indian_national_calendar` },
  { eigen: [1946, 1, 31], gregorianisch: [2024, 4, 20], quelle: SAKA_DE },
  { eigen: [1945, 12, 30], gregorianisch: [2024, 3, 20], quelle: SAKA_DE },
  { eigen: [1945, 12, 10], gregorianisch: [2024, 2, 29], quelle: SAKA_DE },
  { eigen: [1922, 1, 1], gregorianisch: [2000, 3, 21], quelle: SAKA_DE },
  { eigen: [1948, 1, 1], gregorianisch: [2026, 3, 22], quelle: `${WP}Indian_national_calendar` },
  { eigen: [2022, 1, 1], gregorianisch: [2100, 3, 22], quelle: SAKA_DE },
  // Proleptisch: Keine Quelle nennt eine rückwirkende Anwendung vor 1957.
  { eigen: [1822, 1, 1], gregorianisch: [1900, 3, 22], quelle: SAKA_DE },
  { eigen: [1818, 1, 1], gregorianisch: [1896, 3, 21], quelle: `${WP}Indian_national_calendar` },
];

// --- Buddhistische Jahreszählung (teil-b/thai.md) ----------------------------------------
// Die Vorlage rechnet durchgehend gregorianisches Jahr + 543 mit Jahresbeginn
// am 1. Januar (Entscheidung V5). Als Erwartung zählen deshalb nur die Paare
// ab 1941; die Paare davor stehen im benannten Fall weiter unten.
const THAI = `${WP}Thai_solar_calendar`;
const BUDDHIST_AUSDRUECKLICH = [
  { eigen: [2484, 1, 1], gregorianisch: [1941, 1, 1], quelle: THAI },
  {
    eigen: [2549, 9, 19],
    gregorianisch: [2006, 9, 19],
    quelle: `${WP}2006_Thai_coup_d%27%C3%A9tat`,
  },
  {
    eigen: [2567, 1, 30],
    gregorianisch: [2024, 1, 30],
    quelle: `${WP}Date_and_time_notation_in_Thailand`,
  },
  { eigen: [2569, 1, 1], gregorianisch: [2026, 1, 1], quelle: `${WP}Buddhist_calendar` },
];
const BUDDHIST_ABGELEITET = [
  {
    eigen: [2567, 2, 29],
    gregorianisch: [2024, 2, 29],
    quelle: `${WP}Date_and_time_notation_in_Thailand`,
  },
  {
    eigen: [2569, 9, 30],
    gregorianisch: [2026, 9, 30],
    quelle: `${WP}Date_and_time_notation_in_Thailand`,
  },
];
// Ausdrücklich belegte Paare vor 1941 in historischer Zählung (Jahresbeginn am
// 1. April, 2483 mit nur neun Monaten). Die Vorlage weicht dort ab: Im Januar
// bis März liegt ihr Anzeige-Jahr um eins höher als historisch, ab April
// stimmt es überein. Das Handbuch nennt diese Grenze.
const BUDDHIST_HISTORISCH_VOR_1941 = [
  { eigen: [2365, 4, 11], gregorianisch: [1822, 4, 11], quelle: THAI },
  { eigen: [2455, 4, 1], gregorianisch: [1912, 4, 1], quelle: THAI },
  { eigen: [2467, 3, 31], gregorianisch: [1925, 3, 31], quelle: `${WP}1925_in_Siam` },
  { eigen: [2468, 4, 1], gregorianisch: [1925, 4, 1], quelle: `${WP}1925_in_Siam` },
  { eigen: [2474, 1, 1], gregorianisch: [1932, 1, 1], quelle: `${WP}1932_in_Siam` },
  { eigen: [2475, 4, 1], gregorianisch: [1932, 4, 1], quelle: `${WP}1932_in_Siam` },
  { eigen: [2481, 3, 31], gregorianisch: [1939, 3, 31], quelle: `${WP}1939_in_Thailand` },
  { eigen: [2482, 4, 1], gregorianisch: [1939, 4, 1], quelle: `${WP}1939_in_Thailand` },
  { eigen: [2483, 4, 1], gregorianisch: [1940, 4, 1], quelle: THAI },
  {
    eigen: [2483, 12, 24],
    gregorianisch: [1940, 12, 24],
    quelle:
      "https://en.wikisource.org/wiki/Proclamation_on_Observance_of_New_Year's_Day_on_1_January,_dated_24_December_1940",
  },
  { eigen: [2483, 12, 31], gregorianisch: [1940, 12, 31], quelle: THAI },
];

// --- Äthiopischer Kalender (teil-b/aethiopisch.md) ---------------------------------------
// Monate 1 Mäskäräm … 4 Taḫśaś, 5 Ṭərr, 6 Yäkatit … 13 Ṗagumen.
const ETH_WP = `${WP}Ethiopian_calendar`;
const BRADT = 'https://bradtethiopiaupdate.wordpress.com/2019/04/15/festival-dates-2019-2020/';
const WHO = 'https://www.afro.who.int/pt/node/11715';
const ETHIOPIC_AUSDRUECKLICH = [
  {
    eigen: [2000, 1, 1],
    gregorianisch: [2007, 9, 12],
    quelle: 'https://oikoumene.org/news/ethiopia-rings-in-a-millennium-of-hope',
  },
  { eigen: [1998, 1, 1], gregorianisch: [2005, 9, 11], quelle: ETH_WP },
  { eigen: [1992, 1, 1], gregorianisch: [1999, 9, 12], quelle: ETH_WP },
  { eigen: [1996, 1, 1], gregorianisch: [2003, 9, 12], quelle: ETH_WP },
  {
    eigen: [2016, 1, 1],
    gregorianisch: [2023, 9, 12],
    quelle: 'https://www.ena.et/web/eng/w/eng_3328038',
  },
  {
    eigen: [2018, 1, 1],
    gregorianisch: [2025, 9, 11],
    quelle: 'https://www.pulse.co.ke/story/enkutatash-ethiopian-new-year-2018-2025091110203830393',
  },
  { eigen: [2011, 13, 6], gregorianisch: [2019, 9, 11], quelle: WHO },
  { eigen: [2012, 1, 1], gregorianisch: [2019, 9, 12], quelle: WHO },
  {
    eigen: [2016, 13, 1],
    gregorianisch: [2024, 9, 6],
    quelle: 'https://www.ena.et/web/eng/w/eng_5110874',
  },
  {
    eigen: [2016, 13, 5],
    gregorianisch: [2024, 9, 10],
    quelle: 'https://www.ena.et/web/eng/w/eng_5110874',
  },
  { eigen: [2019, 1, 19], gregorianisch: [2026, 9, 29], quelle: ETH_WP },
  { eigen: [2019, 1, 1], gregorianisch: [2026, 9, 11], quelle: `${WP}Enkutatash` },
  {
    eigen: [1888, 6, 23],
    gregorianisch: [1896, 3, 1],
    quelle:
      'https://qz.com/africa/1811232/how-ethiopians-defeated-the-italian-army-in-the-battle-of-adwa',
  },
  { eigen: [2012, 4, 28], gregorianisch: [2020, 1, 7], quelle: BRADT },
  { eigen: [2012, 4, 29], gregorianisch: [2020, 1, 8], quelle: BRADT },
];
const ETHIOPIC_ABGELEITET = [
  { eigen: [2092, 13, 1], gregorianisch: [2100, 9, 7], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [2093, 1, 1], gregorianisch: [2100, 9, 12], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [2016, 4, 29], gregorianisch: [2024, 1, 8], quelle: ETH_WP },
  { eigen: [2016, 4, 28], gregorianisch: [2024, 1, 7], quelle: ETH_WP },
  { eigen: [2012, 5, 11], gregorianisch: [2020, 1, 20], quelle: BRADT },
  { eigen: [2017, 5, 11], gregorianisch: [2025, 1, 19], quelle: `${WP}Timkat` },
  { eigen: [1, 1, 1], gregorianisch: [8, 8, 27], quelle: ETH_WP },
  { eigen: [1888, 1, 1], gregorianisch: [1895, 9, 11], quelle: ETH_WP },
];

// --- Koptischer Kalender (teil-b/koptisch.md) --------------------------------------------
// Monate 1 Thout, 2 Paopi, 3 Hathor, 4 Koiak, 5 Tobi, 6 Meschir, 7 Paremhat,
// 8 Paremoude, … 13 Nasie.
const COP_WP = `${WP}Coptic_calendar`;
const MIDCOPTS = 'https://ukmidcopts.org/coptic/calendar/';
const COPTIST =
  'https://www.coptist.com/2025/01/05/why-is-coptic-christmas-celebrated-on-7-january/';
const COPTIC_AUSDRUECKLICH = [
  { eigen: [1592, 1, 1], gregorianisch: [1875, 9, 11], quelle: COP_WP },
  {
    eigen: [1738, 1, 1],
    gregorianisch: [2021, 9, 11],
    quelle:
      'https://egyptianstreets.com/2021/09/11/egyptian-christians-celebrate-coptic-new-year-nayrouz-today-2/',
  },
  {
    eigen: [1742, 1, 1],
    gregorianisch: [2025, 9, 11],
    quelle:
      'https://copticorthodox.church/en/2025/09/10/h-h-pope-tawadros-ii-extends-greetings-on-the-feast-of-nayrouz-and-the-coptic-new-year/',
  },
  { eigen: [1743, 1, 19], gregorianisch: [2026, 9, 29], quelle: ETH_WP },
  { eigen: [1816, 13, 1], gregorianisch: [2100, 9, 7], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [1816, 13, 5], gregorianisch: [2100, 9, 11], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [1738, 8, 16], gregorianisch: [2022, 4, 24], quelle: MIDCOPTS },
  { eigen: [1740, 6, 18], gregorianisch: [2024, 2, 26], quelle: MIDCOPTS },
  { eigen: [1740, 6, 20], gregorianisch: [2024, 2, 28], quelle: MIDCOPTS },
  { eigen: [1740, 7, 2], gregorianisch: [2024, 3, 11], quelle: MIDCOPTS },
  { eigen: [1740, 8, 27], gregorianisch: [2024, 5, 5], quelle: MIDCOPTS },
];
const COPTIC_ABGELEITET = [
  { eigen: [1740, 1, 1], gregorianisch: [2023, 9, 12], quelle: COP_WP },
  { eigen: [1739, 13, 6], gregorianisch: [2023, 9, 11], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [1732, 1, 1], gregorianisch: [2015, 9, 12], quelle: COP_WP },
  { eigen: [1740, 4, 28], gregorianisch: [2024, 1, 7], quelle: COPTIST },
  { eigen: [1740, 4, 29], gregorianisch: [2024, 1, 8], quelle: COPTIST },
  { eigen: [1741, 4, 29], gregorianisch: [2025, 1, 7], quelle: `${WP}Koiak` },
  { eigen: [1817, 1, 1], gregorianisch: [2100, 9, 12], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [1817, 4, 29], gregorianisch: [2101, 1, 8], quelle: COPTIST },
  { eigen: [1616, 13, 1], gregorianisch: [1900, 9, 6], quelle: `${WP}Pi_Kogi_Enavot` },
  { eigen: [1, 1, 1], gregorianisch: [284, 8, 29], quelle: COP_WP },
];

// --- Minguo-Kalender (teil-b/minguo.md) --------------------------------------------------
const ZH = 'https://zh.wikipedia.org/zh-tw/';
const MINGUO_AUSDRUECKLICH = [
  { eigen: [1, 1, 1], gregorianisch: [1912, 1, 1], quelle: `${ZH}民國紀年` },
  { eigen: [2, 2, 25], gregorianisch: [1913, 2, 25], quelle: `${ZH}雲南省_(中華民國)` },
  { eigen: [13, 2, 29], gregorianisch: [1924, 2, 29], quelle: `${ZH}沙克都尔扎布` },
  { eigen: [34, 10, 25], gregorianisch: [1945, 10, 25], quelle: `${ZH}鹿草鄉` },
  { eigen: [49, 2, 29], gregorianisch: [1960, 2, 29], quelle: `${ZH}中華民國空軍雷虎特技小組` },
  { eigen: [81, 3, 4], gregorianisch: [1992, 3, 4], quelle: `${ZH}民國紀年` },
  { eigen: [89, 1, 6], gregorianisch: [2000, 1, 6], quelle: `${ZH}2000年中華民國總統選舉` },
  { eigen: [89, 3, 18], gregorianisch: [2000, 3, 18], quelle: `${ZH}2000年中華民國總統選舉` },
  { eigen: [100, 1, 1], gregorianisch: [2011, 1, 1], quelle: `${ZH}勞工保險_(中華民國)` },
  { eigen: [100, 12, 31], gregorianisch: [2011, 12, 31], quelle: `${ZH}勞工保險_(中華民國)` },
  {
    eigen: [107, 11, 24],
    gregorianisch: [2018, 11, 24],
    quelle: `${ZH}2018年中華民國地方公職人員選舉`,
  },
  { eigen: [109, 2, 29], gregorianisch: [2020, 2, 29], quelle: `${ZH}第2屆走鐘獎` },
  { eigen: [114, 1, 1], gregorianisch: [2025, 1, 1], quelle: `${ZH}勞工保險_(中華民國)` },
  { eigen: [115, 12, 31], gregorianisch: [2026, 12, 31], quelle: `${ZH}勞工保險_(中華民國)` },
  { eigen: [114, 10, 10], gregorianisch: [2025, 10, 10], quelle: `${ZH}澳門國父紀念館` },
  { eigen: [115, 5, 1], gregorianisch: [2026, 5, 1], quelle: `${ZH}台灣電力公司` },
];
// Vor 1912 sind Monat und Tag in den Quellen oft Angaben des Mondkalenders;
// die Paare davor prüfen deshalb allein die rückwärts zählende Jahres-Zahl.
const MINGUO_ABGELEITET = [
  { eigen: [1], epoche: 0, nurJahr: true, gregorianisch: [1911, 10, 10], quelle: `${ZH}民國紀年` },
  {
    eigen: [89, 2, 29],
    gregorianisch: [2000, 2, 29],
    quelle: 'https://de.wikipedia.org/wiki/Minguo-Kalender',
  },
  {
    eigen: [189, 3, 1],
    gregorianisch: [2100, 3, 1],
    quelle: 'https://de.wikipedia.org/wiki/Minguo-Kalender',
  },
  { eigen: [12], epoche: 0, nurJahr: true, gregorianisch: [1900, 2, 28], quelle: `${ZH}民國紀年` },
  { eigen: [38, 12, 31], gregorianisch: [1949, 12, 31], quelle: `${WP}Republic_of_China_calendar` },
];

const STICHTAGE = {
  julian: { ausdruecklich: JULIAN_AUSDRUECKLICH, abgeleitet: JULIAN_ABGELEITET },
  indian: { ausdruecklich: INDIAN_AUSDRUECKLICH, abgeleitet: INDIAN_ABGELEITET },
  buddhist: { ausdruecklich: BUDDHIST_AUSDRUECKLICH, abgeleitet: BUDDHIST_ABGELEITET },
  ethiopic: { ausdruecklich: ETHIOPIC_AUSDRUECKLICH, abgeleitet: ETHIOPIC_ABGELEITET },
  coptic: { ausdruecklich: COPTIC_AUSDRUECKLICH, abgeleitet: COPTIC_ABGELEITET },
  minguo: { ausdruecklich: MINGUO_AUSDRUECKLICH, abgeleitet: MINGUO_ABGELEITET },
};

const text = (p) =>
  `${p.epoche === 0 ? 'vor ' : ''}${p.eigen.join('-')} = ${p.gregorianisch.join('-')}`;

describe('Quelle 2: ausdrücklich belegte Stichtage (4T-001998)', () => {
  for (const [id, { ausdruecklich }] of Object.entries(STICHTAGE)) {
    it.each(ausdruecklich.map((p) => [text(p), p]))(`AK4: ${id} — %s`, (_name, paar) => {
      expect(paar.quelle).toMatch(/^https:\/\//);
      pruefePaar(id, paar);
    });
  }
});

describe('Quelle 2: abgeleitete Stichtage, aus zitierter Regel gerechnet (4T-001998)', () => {
  for (const [id, { abgeleitet }] of Object.entries(STICHTAGE)) {
    it.each(abgeleitet.map((p) => [text(p), p]))(`abgeleitet: ${id} — %s`, (_name, paar) => {
      expect(paar.quelle).toMatch(/^https:\/\//);
      pruefePaar(id, paar);
    });
  }
});

describe('Buddhistische Jahreszählung vor 1941: benannte Abweichung vom historischen Gebrauch (4T-001998)', () => {
  it('Januar bis März vor 1941 zeigt die Vorlage das Anzeige-Jahr um eins höher als historisch, ab April gleich', () => {
    const { block, kalender } = blockMit('buddhist');
    for (const paar of BUDDHIST_HISTORISCH_VOR_1941) {
      const hin = convertInBlock(
        block,
        'gregorian',
        paar.gregorianisch.concat([0, 0, 0]),
        'buddhist',
      );
      const ep = epochOf(kalender, hin.tuple);
      const monat = paar.gregorianisch[1];
      const versatz = monat <= 3 ? 1 : 0;
      expect([ep.year, hin.tuple[1], hin.tuple[2]], text(paar)).toEqual([
        paar.eigen[0] + versatz,
        paar.eigen[1],
        paar.eigen[2],
      ]);
    }
    // Die Abweichung ist tatsächlich belegt, nicht nur möglich: drei der Paare
    // liegen im Januar bis März.
    expect(BUDDHIST_HISTORISCH_VOR_1941.filter((p) => p.gregorianisch[1] <= 3)).toHaveLength(3);
  });
});

describe('Umrechnung im Block zur gregorianischen Vorlage mit Zeit-Anteil (4T-001998)', () => {
  // Je Vorlage ein ausdrücklich belegter Stichtag, verschoben um eine
  // Tageszeit, in beiden Richtungen; dazu die letzte Sekunde vor Mitternacht,
  // die nicht in den Folgetag kippen darf.
  const PAARE = {
    julian: [
      [1582, 10, 5],
      [1582, 10, 15],
    ],
    indian: [
      [1957, 1, 1],
      [1957, 3, 22],
    ],
    buddhist: [
      [2006, 9, 19],
      [2006, 9, 19],
    ],
    ethiopic: [
      [2001, 1, 1],
      [2007, 9, 12],
    ],
    coptic: [
      [1743, 1, 1],
      [2025, 9, 11],
    ],
    minguo: [
      [2025, 10, 10],
      [2025, 10, 10],
    ],
  };
  for (const [id, [eigenIntern, gregorianisch]] of Object.entries(PAARE)) {
    it(`AK5: ${id} rechnet mit Uhrzeit hin und zurück`, () => {
      const { block } = blockMit(id);
      for (const zeit of [
        [13, 45, 30],
        [23, 59, 59],
        [0, 0, 1],
      ]) {
        expect(convertInBlock(block, 'gregorian', gregorianisch.concat(zeit), id)).toEqual({
          ok: true,
          tuple: eigenIntern.concat(zeit),
        });
        expect(convertInBlock(block, id, eigenIntern.concat(zeit), 'gregorian')).toEqual({
          ok: true,
          tuple: gregorianisch.concat(zeit),
        });
      }
    });
  }
});
