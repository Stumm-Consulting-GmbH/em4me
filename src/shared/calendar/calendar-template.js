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
  const sectionNames = { time: 'Zeit', date: 'Datum', ...(opts.sectionNames || {}) };
  const groupNames = { quarter: 'Quartal', halfYear: 'Halbjahr', ...(opts.groupNames || {}) };
  return {
    id: cleanString(opts.id) || 'gregorian',
    name: cleanString(opts.name) || 'Gregorianischer Kalender',
    levels: [
      { id: 'second', name: levelNames.second, section: sectionNames.time, start: 0 },
      {
        id: 'minute',
        name: levelNames.minute,
        section: sectionNames.time,
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      {
        id: 'hour',
        name: levelNames.hour,
        section: sectionNames.time,
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      {
        id: 'day',
        name: levelNames.day,
        section: sectionNames.date,
        start: 1,
        rel: { type: 'factor', count: 24 },
      },
      {
        id: 'month',
        name: levelNames.month,
        section: sectionNames.date,
        start: 1,
        names: monthNames,
        rel: { type: 'lengths', table: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] },
      },
      {
        id: 'year',
        name: levelNames.year,
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
        of: 'day',
        length: 7,
        names: weekdayNames,
        anchor: { tuple: [2000, 1, 1], position: 5 },
        numbering: { ruleIndex: 3 },
      },
    ],
    groups: [
      { id: 'quarter', name: groupNames.quarter, of: 'month', size: 3 },
      { id: 'half-year', name: groupNames.halfYear, of: 'month', size: 6 },
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
