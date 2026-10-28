// 4T-002005 (Epic 3E-000333): Fabriken der mitgelieferten Vorlagen mit
// Jahres-Struktur je Jahr (Baustein 4T-002363) samt ihren Einträgen für die
// Sammlung (Form wie in calendar-templates.js: { id, order, nameKey,
// referenceDay, create(t) }). Einträge: der hebräische Kalender nach der
// Regel hebrew (calendar-rule-hebrew.js, 4T-002005), der persische nach der
// Tafel persian (year-tables/persian.js, 4T-002007), der chinesische nach der
// Tafel chinese (year-tables/chinese.js, 4T-002006) und der islamische nach Umm
// al-Qura nach der Tafel islamic-umalqura (year-tables/islamic-umalqura.js,
// 4T-002008).
//
// Unterschied zu den Vorlagen der ersten Stufe (calendar-template-systems.js):
// Monat und Jahr tragen keine Längen-Tabelle und keine Schalt-Regel, sondern
// die Beziehungen byYear und yearly mit dem Namen der Quelle; die Monatsfolge
// je Jahr liefert die Quelle des Programms (Epic A15, Verweis statt Abschrift).
// Die Tages-Achse liegt nach T6 des Bausteins ohne Anker-Datum fest; die
// Definition trägt deshalb kein Feld blockAnchor.
//
// Namen: Menü-Name, Monats-Namen (in der Reihenfolge der Namens-Stellen der
// Quelle) und Zeitalter kommen aus den Schlüsseln settings.calendar.tpl.<id>.*
// (Sprach-Fragment calendar); Ebenen, Woche und Wochentage aus den Schlüsseln
// der gregorianischen Vorlage. Ausnahme Umm al-Qura: Monatsnamen und Zeitalter
// aus den Schlüsseln der tabellarischen Lesart (islamicTabular), eigen ist
// allein der Name.
//
// Import-Richtung im Ordner: Dieses Modul lädt calendar-template-tools.js;
// geladen wird es allein von calendar-templates.js. Der Ordner bleibt
// zyklenfrei.
'use strict';

const {
  ownEpochs,
  templateTimeLevels,
  templateWeekCycle,
  tplKey,
} = require('./calendar-template-tools.js');

// Definition einer Vorlage mit Jahres-Struktur aus ihrer Beschreibung.
// spec: { id, nameKey, monthNames, yearlyRel, epochs: [{ name, abbr, start }, …],
// referenceDay, numberedWeeks }. Ebenen Sekunde, Minute, Stunde (T2), Tag mit
// Faktor 24, Monat mit byYear, Jahr mit der Jahres-Beziehung; Woche aus dem
// Stichtag-Paar; keine Gruppierungen, weil die Zahl der Monate je Jahr wechselt;
// die erste Epoche offen in die Vergangenheit; Skala 1/1; kein Anker.
function buildYearlyTemplateDefinition(t, spec) {
  const section = t('settings.calendar.templateSectionDate');
  const dateLevels = [
    {
      id: 'day',
      name: t('settings.calendar.templateLevelDay'),
      namePlural: t('settings.calendar.templateLevelDayPlural'),
      section,
      start: 1,
      rel: { type: 'factor', count: 24 },
    },
    {
      id: 'month',
      name: t('settings.calendar.templateLevelMonth'),
      namePlural: t('settings.calendar.templateLevelMonthPlural'),
      section,
      start: 1,
      names: spec.monthNames.slice(),
      rel: { type: 'byYear' },
    },
    {
      id: 'year',
      name: t('settings.calendar.templateLevelYear'),
      namePlural: t('settings.calendar.templateLevelYearPlural'),
      section,
      start: 1,
      rel: { ...spec.yearlyRel },
    },
  ];
  return {
    id: spec.id,
    name: t(spec.nameKey),
    levels: templateTimeLevels(t).concat(dateLevels),
    cycles: [templateWeekCycle(t, spec.referenceDay, spec.numberedWeeks)],
    groups: [],
    epochs: spec.epochs.map((epoch, i) => ({
      name: epoch.name,
      abbr: epoch.abbr,
      start: i === 0 ? null : epoch.start.slice(),
    })),
    blockScale: { num: 1, den: 1 },
  };
}

// --- Einträge ------------------------------------------------------------------------

// Islamischer Kalender nach Umm al-Qura in der heutigen amtlichen Ausgabe nach
// der Tafel islamic-umalqura (Epic A3, A5; TF3, TF4): zwölf Monate zu 29 oder
// 30 Tagen, das Jahr zu 354 oder 355 Tagen; Geltung 1318 bis 1500 AH
// (30.04.1900 bis 16.11.2077), davor und danach «nicht bekannt». Die Tage
// beginnen um Mitternacht, nicht bei Sonnenuntergang (T2). Platz 3 der Liste
// des Product Owners wie die tabellarische Lesart (Story 4S-001110); hinter ihr
// steht sie durch die stabile Sortierung der Sammlung (calendar-templates.js),
// im Menü mit allen dreizehn Einträgen an vierter Stelle.
//
// Monatsnamen und Zeitalter aus den Schlüsseln der tabellarischen Lesart
// (U4 des Tasks 4T-002008): derselbe Kalender in zwei Lesarten, nach CLDR mit
// denselben Namen in allen fünf Sprachen; eigene Schlüssel wären doppelte
// Übersetzungen, die auseinanderlaufen könnten. Die Schlüssel-Namen sind Texte,
// kein Modul-Bezug auf calendar-template-systems.js.
const UMM_AL_QURA = {
  id: 'islamic-umalqura',
  order: 3,
  nameKey: tplKey('islamicUmalqura', 'name'),
  // 1. Ramadan 1446 = 1. März 2025 (Samstag); Story 4S-001110, AK14, am
  // amtlichen Portal der KACST gelesen am 2026-10-24.
  referenceDay: { own: [1446, 9, 1], gregorian: [2025, 3, 1] },
  create(t) {
    return buildYearlyTemplateDefinition(t, {
      id: 'islamic-umalqura',
      nameKey: UMM_AL_QURA.nameKey,
      monthNames: t(tplKey('islamicTabular', 'months')).split(','),
      yearlyRel: { type: 'yearly', table: 'islamic-umalqura' },
      epochs: ownEpochs(t, 'islamicTabular', [1, 1, 1]),
      referenceDay: UMM_AL_QURA.referenceDay,
      numberedWeeks: false,
    });
  },
};

// Hebräischer Kalender nach der Rechenregel (Epic A2, ohne zeitliche Grenze):
// 12 oder 13 Monate, Adar I als eigener Monat in Schaltjahren (Kennung 05L),
// Jahr = Jahr der Welt (AM), davor rückwärts zählend «vor AM». Die Tage beginnen
// um Mitternacht, nicht bei Sonnenuntergang (T2). Platz 5 der Liste des
// Product Owners (Nummerierung des Epics, wie der indische an Platz 8); im
// Menü mit allen dreizehn Einträgen steht er an sechster Stelle, weil Umm
// al-Qura an Platz 3 neben die tabellarische Lesart tritt (Story 4S-001110).
const HEBREW = {
  id: 'hebrew',
  order: 5,
  nameKey: tplKey('hebrew', 'name'),
  // 1 Tischri 5784 = 16. September 2023 (Samstag); Messung 2026-10-24.
  referenceDay: { own: [5784, 1, 1], gregorian: [2023, 9, 16] },
  create(t) {
    return buildYearlyTemplateDefinition(t, {
      id: 'hebrew',
      nameKey: HEBREW.nameKey,
      monthNames: t(tplKey('hebrew', 'months')).split(','),
      yearlyRel: { type: 'yearly', rule: 'hebrew' },
      epochs: ownEpochs(t, 'hebrew', [1, 1, 1]),
      referenceDay: HEBREW.referenceDay,
      numberedWeeks: false,
    });
  },
};

// Persischer Kalender in der amtlichen Lesart nach der Tafel persian
// (Epic A3, A5): zwölf Monate, sechs zu 31, fünf zu 30, Esfand mit 29 oder im
// Schaltjahr 30 Tagen; Geltung 1279 bis 1479 AP (21.03.1900 bis 20.03.2101,
// B2), davor und danach «nicht bekannt». Jahr = Jahr der Schnittstelle (AP,
// Anno Persico, nach dem Namens-Grundsatz CLDR). Platz 4 der Liste des Product
// Owners (Nummerierung des Epics); im Menü mit allen dreizehn Einträgen steht
// er an fünfter Stelle, weil Umm al-Qura an Platz 3 neben die tabellarische
// Lesart tritt (Story 4S-001110).
const PERSIAN = {
  id: 'persian',
  order: 4,
  nameKey: tplKey('persian', 'name'),
  // 1. Farvardin 1404 = 21. März 2025 (Freitag); Story 4S-001110, AK14.
  referenceDay: { own: [1404, 1, 1], gregorian: [2025, 3, 21] },
  create(t) {
    return buildYearlyTemplateDefinition(t, {
      id: 'persian',
      nameKey: PERSIAN.nameKey,
      monthNames: t(tplKey('persian', 'months')).split(','),
      yearlyRel: { type: 'yearly', table: 'persian' },
      epochs: ownEpochs(t, 'persian', [1, 1, 1]),
      referenceDay: PERSIAN.referenceDay,
      numberedWeeks: false,
    });
  },
};

// Traditioneller chinesischer Kalender nach der Tafel chinese (Epic A3, A5;
// TF1, B1, B2): 12 oder 13 Monate zu 29 oder 30 Tagen, ein Schaltmonat als
// eigener Monat mit der Kennung L hinter dem Monat, dem er folgt (etwa 02L);
// Geltung chinesisches Jahr 1901 bis 2100 (19.02.1901 bis 28.01.2101), davor
// und danach «nicht bekannt». Platz 6 der Liste des Product Owners
// (Nummerierung des Epics); im Menü mit allen dreizehn Einträgen steht er an
// siebter Stelle, weil Umm al-Qura an Platz 3 neben die tabellarische Lesart
// tritt (Story 4S-001110).
//
// F1 und F2 des Tasks 4T-002006, entschieden vom Product Owner am 2026-10-24:
// Jahreszahl ist das gregorianische Jahr, in dem das chinesische Jahr beginnt
// (Erzeuger, chinesischesJahr), Zeitalter wie die gregorianische Vorlage
// (v. Chr. / n. Chr., im Zeitraum nie im Wert); Monatsnamen «Monat N» und
// «Schaltmonat N» aus den Mustern monthPattern und leapMonthPattern mit {n}.
function chineseMonthNames(t) {
  const reihe = (muster) =>
    Array.from({ length: 12 }, (_, i) => t(tplKey('chinese', muster)).replace('{n}', i + 1));
  // Namens-Stellen der Tafel: zwölf Monate, dann je Monat sein Schaltmonat.
  return reihe('monthPattern').concat(reihe('leapMonthPattern'));
}

function chineseEpochs(t) {
  const past = t('settings.calendar.templateEpochPast');
  const future = t('settings.calendar.templateEpochFuture');
  return [
    { name: past, abbr: past, start: null },
    { name: future, abbr: future, start: [1, 1, 1] },
  ];
}

const CHINESE = {
  id: 'chinese',
  order: 6,
  nameKey: tplKey('chinese', 'name'),
  // 1. Tag des 1. Monats 2025 = 29. Januar 2025 (Mittwoch); Story 4S-001110,
  // AK14, amtlich in der Portal-Datei 2025 (test/fixtures/kalender-chinesisch/).
  referenceDay: { own: [2025, 1, 1], gregorian: [2025, 1, 29] },
  create(t) {
    return buildYearlyTemplateDefinition(t, {
      id: 'chinese',
      nameKey: CHINESE.nameKey,
      monthNames: chineseMonthNames(t),
      yearlyRel: { type: 'yearly', table: 'chinese' },
      epochs: chineseEpochs(t),
      referenceDay: CHINESE.referenceDay,
      numberedWeeks: false,
    });
  },
};

const YEARLY_TEMPLATES = [UMM_AL_QURA, PERSIAN, HEBREW, CHINESE];

module.exports = {
  YEARLY_TEMPLATES,
  buildYearlyTemplateDefinition,
};
