// 4T-000995 (Epic 3E-000196): aus src/shared/calendar/calendar-core.js geschnitten.
// Gregorianische Vorlage der Kalender-Sektion: eine Objekt-Fabrik, die
// ausser der Zeichenketten-Saeuberung des Kerns nichts braucht.
//
// Import-Richtung im Ordner: calendar-config laedt Kern und Vorlage, die
// Vorlage laedt den Kern, der Kern laedt keines von beiden. Damit ist der
// Ordner zyklenfrei, und compileSafe bleibt mit seinem WeakMap-Cache eine
// einzige Instanz im Kern.
'use strict';

const { cleanString } = require('./calendar-core.js');

// Vollständige gregorianische Definition als Vorlage (Einstellungs-Knopf aus
// 4T-000544) und Referenz-Testfall: zwölf Monate per Längen-Tabelle,
// Schalt-Regel 4/100/400 auf den Februar, Sieben-Tage-Zyklus mit
// Donnerstags-Regel (Anker: 2000-01-01 war ein Samstag), Epochen
// v. Chr./n. Chr., Zeit-Ebenen Sekunde/Minute/Stunde. Namen mit deutschen
// Defaults, per opts lokalisierbar (die i18n-Anbindung liegt beim Aufrufer).
// 4T-001863 (Epic 3E-000307): Ebenen, Woche und Gruppierungen tragen zur
// Einzahl die Mehrzahl (Optionen levelNamesPlural, weekNamePlural,
// groupNamesPlural nach dem Muster der Einzahl-Optionen).
function createGregorianTemplate(opts = {}) {
  const monthNames = opts.monthNames || [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  const weekdayNames = opts.weekdayNames || [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
    'Sonntag',
  ];
  const epochNames = opts.epochNames || [
    { name: 'v. Chr.', abbr: 'v. Chr.' },
    { name: 'n. Chr.', abbr: 'n. Chr.' },
  ];
  const levelNames = {
    second: 'Sekunde',
    minute: 'Minute',
    hour: 'Stunde',
    day: 'Tag',
    month: 'Monat',
    year: 'Jahr',
    ...(opts.levelNames || {}),
  };
  const levelNamesPlural = {
    second: 'Sekunden',
    minute: 'Minuten',
    hour: 'Stunden',
    day: 'Tage',
    month: 'Monate',
    year: 'Jahre',
    ...(opts.levelNamesPlural || {}),
  };
  const sectionNames = { time: 'Zeit', date: 'Datum', ...(opts.sectionNames || {}) };
  const groupNames = { quarter: 'Quartal', halfYear: 'Halbjahr', ...(opts.groupNames || {}) };
  const groupNamesPlural = {
    quarter: 'Quartale',
    halfYear: 'Halbjahre',
    ...(opts.groupNamesPlural || {}),
  };
  return {
    id: cleanString(opts.id) || 'gregorian',
    name: cleanString(opts.name) || 'Gregorianischer Kalender',
    levels: [
      {
        id: 'second',
        name: levelNames.second,
        namePlural: levelNamesPlural.second,
        section: sectionNames.time,
        start: 0,
      },
      {
        id: 'minute',
        name: levelNames.minute,
        namePlural: levelNamesPlural.minute,
        section: sectionNames.time,
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      {
        id: 'hour',
        name: levelNames.hour,
        namePlural: levelNamesPlural.hour,
        section: sectionNames.time,
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      {
        id: 'day',
        name: levelNames.day,
        namePlural: levelNamesPlural.day,
        section: sectionNames.date,
        start: 1,
        rel: { type: 'factor', count: 24 },
      },
      {
        id: 'month',
        name: levelNames.month,
        namePlural: levelNamesPlural.month,
        section: sectionNames.date,
        start: 1,
        names: monthNames,
        rel: { type: 'lengths', table: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] },
      },
      {
        id: 'year',
        name: levelNames.year,
        namePlural: levelNamesPlural.year,
        section: sectionNames.date,
        start: 1,
        rel: {
          type: 'leap',
          count: 12,
          rules: [{ cycle: 4 }, { cycle: 100 }, { cycle: 400 }],
          targetIndex: 1,
          extra: 1,
        },
      },
    ],
    cycles: [
      {
        id: 'week',
        name: opts.weekName || 'Woche',
        namePlural: opts.weekNamePlural || 'Wochen',
        of: 'day',
        length: 7,
        names: weekdayNames,
        anchor: { tuple: [2000, 1, 1], position: 5 },
        numbering: { ruleIndex: 3 },
      },
    ],
    groups: [
      {
        id: 'quarter',
        name: groupNames.quarter,
        namePlural: groupNamesPlural.quarter,
        of: 'month',
        size: 3,
      },
      {
        id: 'half-year',
        name: groupNames.halfYear,
        namePlural: groupNamesPlural.halfYear,
        of: 'month',
        size: 6,
      },
    ],
    epochs: [
      { name: epochNames[0].name, abbr: epochNames[0].abbr, start: null },
      { name: epochNames[1].name, abbr: epochNames[1].abbr, start: [1, 1, 1] },
    ],
    blockScale: { num: 1, den: 1 },
  };
}

module.exports = {
  createGregorianTemplate,
};
