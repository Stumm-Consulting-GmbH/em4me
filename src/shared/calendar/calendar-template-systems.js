// 4T-001998 (Epic 3E-000307): Fabriken der mitgelieferten Vorlagen, die sich im
// unveränderten Kalender-Modell ausdrücken lassen — Julianisch, Indischer
// Nationalkalender (Saka), Buddhistische Jahreszählung, Äthiopisch, Koptisch,
// Minguo —, samt ihren Einträgen für die Sammlung (Form wie in
// calendar-templates.js: { id, order, nameKey, referenceDay, create(t) }).
// 4T-002000 (Epic 3E-000307): dazu der Japanische Kalender mit den Ären ab
// Meiji; 4T-002002: der tabellarische Hidschri-Kalender mit dem Schalt-Muster
// aus 4T-002001.
//
// Der Kniff aller sechs: Die Schalt-Regel des Modells zählt auf der internen
// Jahres-Zählung (Schaltjahr, wenn das interne Jahr durch 4 teilbar ist, …),
// das Anzeige-Jahr einer Epoche ist dagegen «internes Jahr − Start-Jahr der
// Epoche + 1». Liegt die interne Zählung so, dass die Schalt-Regel dort
// greift, wo das System schaltet, zeigt die Epoche trotzdem die gewohnte
// Jahreszahl (Kern: epochInfo, internalYearOf).
//
// Namen: Menü-Name, Monats-Namen und Zeitalter kommen aus den Schlüsseln
// settings.calendar.tpl.<id>.* (Sprach-Fragment calendar); Ebenen,
// Woche, Wochentage, Quartal und Halbjahr aus den Schlüsseln der
// gregorianischen Vorlage.
//
// Import-Richtung im Ordner: Dieses Modul lädt calendar-template-tools.js;
// geladen wird es allein von calendar-templates.js. Der Ordner bleibt
// zyklenfrei.
'use strict';

const { buildTemplateDefinition } = require('./calendar-template-tools.js');

// Monats-Längen der gregorianischen Monate (Februar ohne Schalttag).
const GREGORIAN_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Zwölf Monate mit 30 Tagen und ein dreizehnter mit 5 (Äthiopisch, Koptisch).
const ALEXANDRIAN_MONTH_LENGTHS = [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 5];
// Chaitra 30 Tage (im Schaltjahr 31), Vaisakha bis Bhadra 31, danach 30.
const SAKA_MONTH_LENGTHS = [30, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30];

const tplKey = (id, suffix) => `settings.calendar.tpl.${id}.${suffix}`;

// Zeitalter einer Vorlage mit eigenen Schlüsseln: offene Vergangenheit, dann
// ab der Epoche, die mit start beginnt (4T-002000: Beginn je Epoche statt
// eines gesonderten Felds epochStart).
function ownEpochs(t, id, start) {
  return [
    { name: t(tplKey(id, 'epochPast')), abbr: t(tplKey(id, 'epochPastAbbr')), start: null },
    { name: t(tplKey(id, 'epoch')), abbr: t(tplKey(id, 'epochAbbr')), start },
  ];
}

const gregorianMonthNames = (t) => t('settings.calendar.templateMonths').split(',');

// --- Einträge ------------------------------------------------------------------------

// Julianischer Kalender: zwölf Monate wie gregorianisch, Schalttag im Februar
// alle 4 Jahre ohne Ausnahme; internes Jahr = julianisches Jahr (astronomisch),
// Epochen wie gregorianisch mit Grenze am 1. Januar des Jahres 1.
const JULIAN = {
  id: 'julian',
  order: 2,
  nameKey: tplKey('julian', 'name'),
  // Julianisch 5. Oktober 1582 = gregorianisch 15. Oktober 1582.
  referenceDay: { own: [1582, 10, 5], gregorian: [1582, 10, 15] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'julian',
      nameKey: JULIAN.nameKey,
      monthNames: gregorianMonthNames(t),
      monthLengths: GREGORIAN_MONTH_LENGTHS,
      leapRules: [4],
      leapMonthIndex: 1,
      epochs: [
        {
          name: t('settings.calendar.templateEpochPast'),
          abbr: t('settings.calendar.templateEpochPast'),
          start: null,
        },
        {
          name: t('settings.calendar.templateEpochFuture'),
          abbr: t('settings.calendar.templateEpochFuture'),
          start: [1, 1, 1],
        },
      ],
      referenceDay: JULIAN.referenceDay,
      numberedWeeks: false,
      monthGroups: true,
    });
  },
};

// 4T-002002 (Epic 3E-000307): Hidschri-Kalender, tabellarisch (Entscheidung V1:
// Schema II mit bürgerlicher Epoche, bei van Gent «IIc», wie der Kalender
// islamic-civil der Internationalisierungs-Schnittstelle). Zwölf Monate
// abwechselnd mit 30 und 29 Tagen; im Schaltjahr hat der zwölfte Monat
// (Dhu l-Hiddscha) 30 Tage. Schaltjahre sind die Plätze 2, 5, 7, 10, 13, 16,
// 18, 21, 24, 26 und 29 des 30-Jahres-Zyklus. Internes Jahr = Jahr nach der
// Hidschra (AH), Epoche AH ab dem 1 Muharram 1, davor rückwärts zählend. Die
// Tage beginnen um Mitternacht, nicht bei Sonnenuntergang (T2).
const ISLAMIC_TABULAR_LENGTHS = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];

const ISLAMIC_TABULAR = {
  id: 'islamic-tabular',
  order: 3,
  nameKey: tplKey('islamicTabular', 'name'),
  // 1 Ramadan 1438 = 27. Mai 2017: Rechenbeispiel mit bürgerlicher Epoche und
  // Schema II in https://de.wikipedia.org/wiki/Islamischer_Kalender, abgerufen
  // am 2026-09-30 (Erhebung teil-b/islamisch.md, ausdrücklich belegt). Das
  // Epochen-Paar 1 Muharram 1 = 19. Juli 622 ist dort nur abgeleitet.
  referenceDay: { own: [1438, 9, 1], gregorian: [2017, 5, 27] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'islamic-tabular',
      nameKey: ISLAMIC_TABULAR.nameKey,
      monthNames: t(tplKey('islamicTabular', 'months')).split(','),
      monthLengths: ISLAMIC_TABULAR_LENGTHS,
      leapPattern: { cycle: 30, years: [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29] },
      leapMonthIndex: 11,
      epochs: ownEpochs(t, 'islamicTabular', [1, 1, 1]),
      referenceDay: ISLAMIC_TABULAR.referenceDay,
      numberedWeeks: false,
      monthGroups: false,
    });
  },
};

// Indischer Nationalkalender: zwölf Monate (30, 31 × 5, 30 × 6), Schalttag
// am Ende des Chaitra nach der gregorianischen Regel 4/100/400; internes Jahr =
// Saka-Jahr + 78, also das gregorianische Jahr, in dem das Saka-Jahr beginnt.
// Epoche Saka ab dem internen Jahr 79 (Saka-Jahr 1).
const INDIAN = {
  id: 'indian',
  order: 8,
  nameKey: tplKey('indian', 'name'),
  // 1 Chaitra 1879 = 22. März 1957 (Beginn der amtlichen Nutzung).
  referenceDay: { own: [1957, 1, 1], gregorian: [1957, 3, 22] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'indian',
      nameKey: INDIAN.nameKey,
      monthNames: t(tplKey('indian', 'months')).split(','),
      monthLengths: SAKA_MONTH_LENGTHS,
      leapRules: [4, 100, 400],
      leapMonthIndex: 0,
      epochs: ownEpochs(t, 'indian', [79, 1, 1]),
      referenceDay: INDIAN.referenceDay,
      numberedWeeks: false,
      monthGroups: false,
    });
  },
};

// Buddhistische Jahreszählung (thailändisch, Entscheidung V5): Monate und
// Schalt-Regel gregorianisch; internes Jahr = gregorianisches Jahr, Epoche B.E.
// ab dem internen Jahr −542, also Anzeige-Jahr = gregorianisches Jahr + 543.
const BUDDHIST = {
  id: 'buddhist',
  order: 9,
  nameKey: tplKey('buddhist', 'name'),
  referenceDay: { own: [2000, 1, 1], gregorian: [2000, 1, 1] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'buddhist',
      nameKey: BUDDHIST.nameKey,
      monthNames: gregorianMonthNames(t),
      monthLengths: GREGORIAN_MONTH_LENGTHS,
      leapRules: [4, 100, 400],
      leapMonthIndex: 1,
      epochs: ownEpochs(t, 'buddhist', [-542, 1, 1]),
      referenceDay: BUDDHIST.referenceDay,
      numberedWeeks: true,
      monthGroups: true,
    });
  },
};

// Äthiopischer Kalender: zwölf Monate mit 30 Tagen und der dreizehnte
// (Ṗagumen) mit 5, im Schaltjahr 6; Schaltjahr alle 4 Jahre ohne Ausnahme.
// Internes Jahr = äthiopisches Jahr + 1, damit das Schaltjahr (äthiopisches
// Jahr mit Rest 3 bei Teilung durch 4) auf ein durch 4 teilbares internes Jahr
// fällt; Epoche Amätä Məhrät ab dem internen Jahr 2.
const ETHIOPIC = {
  id: 'ethiopic',
  order: 10,
  nameKey: tplKey('ethiopic', 'name'),
  // 1 Mäskäräm 2000 = 12. September 2007.
  referenceDay: { own: [2001, 1, 1], gregorian: [2007, 9, 12] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'ethiopic',
      nameKey: ETHIOPIC.nameKey,
      monthNames: t(tplKey('ethiopic', 'months')).split(','),
      monthLengths: ALEXANDRIAN_MONTH_LENGTHS,
      leapRules: [4],
      leapMonthIndex: 12,
      epochs: ownEpochs(t, 'ethiopic', [2, 1, 1]),
      referenceDay: ETHIOPIC.referenceDay,
      numberedWeeks: false,
      monthGroups: false,
    });
  },
};

// Koptischer Kalender: Aufbau und Schalt-Regel wie der äthiopische, andere Ära.
// Internes Jahr = koptisches Jahr + 1; Epoche Anno Martyrum ab dem internen
// Jahr 2.
const COPTIC = {
  id: 'coptic',
  order: 11,
  nameKey: tplKey('coptic', 'name'),
  // 1 Thout 1742 = 11. September 2025.
  referenceDay: { own: [1743, 1, 1], gregorian: [2025, 9, 11] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'coptic',
      nameKey: COPTIC.nameKey,
      monthNames: t(tplKey('coptic', 'months')).split(','),
      monthLengths: ALEXANDRIAN_MONTH_LENGTHS,
      leapRules: [4],
      leapMonthIndex: 12,
      epochs: ownEpochs(t, 'coptic', [2, 1, 1]),
      referenceDay: COPTIC.referenceDay,
      numberedWeeks: false,
      monthGroups: false,
    });
  },
};

// 4T-002000 (Epic 3E-000307): Japanischer Kalender — Monate und Schalt-Regel
// gregorianisch, internes Jahr = gregorianisches Jahr. Epochen: «vor Meiji»
// offen in die Vergangenheit, dann die Ären Meiji, Taishō, Shōwa, Heisei und
// Reiwa, je ab ihrem gregorianischen Beginn-Tag; Jahr 1 einer Ära läuft vom
// Beginn bis zum 31. Dezember (Anzeige-Jahr = internes Jahr − Start-Jahr + 1).
// Die älteren Ären beruhen auf dem Mondkalender und entfallen. Das Kürzel der
// Ära wird immer geschrieben (alwaysWriteEpoch, 4T-001999), damit ein
// gespeicherter Wert seine Ära behält, wenn eine neue nachgetragen wird.
const JAPANESE_ERAS = [
  ['epochMeiji', [1868, 10, 23]],
  ['epochTaisho', [1912, 7, 30]],
  ['epochShowa', [1926, 12, 25]],
  ['epochHeisei', [1989, 1, 8]],
  ['epochReiwa', [2019, 5, 1]],
];

const JAPANESE = {
  id: 'japanese',
  order: 12,
  nameKey: tplKey('japanese', 'name'),
  referenceDay: { own: [2000, 1, 1], gregorian: [2000, 1, 1] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'japanese',
      nameKey: JAPANESE.nameKey,
      monthNames: gregorianMonthNames(t),
      monthLengths: GREGORIAN_MONTH_LENGTHS,
      leapRules: [4, 100, 400],
      leapMonthIndex: 1,
      // Name und Kürzel einer Ära sind derselbe ausgeschriebene Name, damit ein
      // heutiges Datum mit «Reiwa» geschrieben wird.
      epochs: [
        {
          name: t(tplKey('japanese', 'epochPast')),
          abbr: t(tplKey('japanese', 'epochPastAbbr')),
          start: null,
        },
        ...JAPANESE_ERAS.map(([key, start]) => ({
          name: t(tplKey('japanese', key)),
          abbr: t(tplKey('japanese', key)),
          start,
        })),
      ],
      referenceDay: JAPANESE.referenceDay,
      numberedWeeks: true,
      monthGroups: true,
      alwaysWriteEpoch: true,
    });
  },
};

// Minguo-Kalender: Monate und Schalt-Regel gregorianisch; internes Jahr =
// gregorianisches Jahr, Epoche Minguo ab 1912 (Anzeige-Jahr = gregorianisches
// Jahr − 1911), davor rückwärts zählend (1911 = Jahr 1 vor Minguo).
const MINGUO = {
  id: 'minguo',
  order: 13,
  nameKey: tplKey('minguo', 'name'),
  referenceDay: { own: [2000, 1, 1], gregorian: [2000, 1, 1] },
  create(t) {
    return buildTemplateDefinition(t, {
      id: 'minguo',
      nameKey: MINGUO.nameKey,
      monthNames: gregorianMonthNames(t),
      monthLengths: GREGORIAN_MONTH_LENGTHS,
      leapRules: [4, 100, 400],
      leapMonthIndex: 1,
      epochs: ownEpochs(t, 'minguo', [1912, 1, 1]),
      referenceDay: MINGUO.referenceDay,
      numberedWeeks: true,
      monthGroups: true,
    });
  },
};

const SYSTEM_TEMPLATES = [
  JULIAN,
  ISLAMIC_TABULAR,
  INDIAN,
  BUDDHIST,
  ETHIOPIC,
  COPTIC,
  JAPANESE,
  MINGUO,
];

module.exports = {
  SYSTEM_TEMPLATES,
};
