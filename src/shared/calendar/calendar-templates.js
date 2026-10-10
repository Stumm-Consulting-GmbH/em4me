// 4T-001997 (Epic 3E-000307): Sammlung der mitgelieferten Kalender-Vorlagen.
// Aus ihr baut die Einstellungs-Sektion das Aufklapp-Menü «Vorlage einfügen …»;
// eine weitere Vorlage tritt allein durch ihren Eintrag in VORLAGEN hinzu, ohne
// dass Menü oder Einfügung angefasst werden.
//
// Form eines Eintrags: { id, order, nameKey, referenceDay, create(t) }
//   id            stabile Kennung der Vorlage (Wert im Menü)
//   order         Platz auf der festgelegten Liste des Product Owners; das Menü
//                   zeigt die Einträge aufsteigend danach
//   nameKey       Übersetzungs-Schlüssel des Menü-Namens; derselbe Text wird
//                   der Name der angelegten Zeitrechnung
//   referenceDay  Stichtag-Paar { own, gregorian }: Datums-Segmente desselben
//                   Tages in der eigenen Zeitrechnung und in der gregorianischen
//                   Vorlage (internes Jahr, also ohne Epochen-Zählung). Daraus
//                   errechnet templateBlockAnchor den Block-Anker, und die
//                   Prüfung der Sammlung weist daran die gemeinsame Tages-Achse
//                   nach.
//   create(t)     liefert die rohe Definition; t ist eine Übersetzungs-Funktion
//                   (Schlüssel → Text), die der Aufrufer hereinreicht. Das Modul
//                   bleibt damit frei von Electron und vom i18n-Modul des Fensters.
//
// Import-Richtung im Ordner (seit 4T-001998): Dieses Modul lädt die
// gregorianische Fabrik (calendar-template.js), die Bausteine
// (calendar-template-tools.js) und die Fabriken der weiteren Vorlagen
// (calendar-template-systems.js); die Bausteine laden den Kern. Weder der Kern
// noch die Fabrik noch calendar-config.js laden eines der drei Vorlagen-Module.
// Der Ordner bleibt zyklenfrei, und compileSafe bleibt mit seinem
// WeakMap-Cache eine einzige Instanz im Kern.
'use strict';

// 4T-001998 (Epic 3E-000307): Die Bausteine templateTimeLevels und
// templateBlockAnchor liegen seither in calendar-template-tools.js; die Sammlung
// reicht sie weiter, damit bestehende Aufrufer und Prüfdateien gültig bleiben.
// Die weiteren Vorlagen kommen aus calendar-template-systems.js.
const { createGregorianTemplate } = require('./calendar-template.js');
const { templateBlockAnchor, templateTimeLevels } = require('./calendar-template-tools.js');
const { SYSTEM_TEMPLATES } = require('./calendar-template-systems.js');

// --- Die Vorlagen ----------------------------------------------------------------------

// Gregorianischer Kalender: die bestehende Fabrik mit den lokalisierten Namen,
// deren Aufbau bis 4T-001997 im Knopf der Einstellungs-Sektion stand. Kein
// ausdrücklicher Anker — die Vorlage behält den Vorgabe-Anker und rechnet
// damit unverändert.
function createGregorian(t) {
  return createGregorianTemplate({
    name: t('settings.calendar.templateName'),
    monthNames: t('settings.calendar.templateMonths').split(','),
    weekdayNames: t('settings.calendar.templateWeekdays').split(','),
    weekName: t('settings.calendar.templateWeek'),
    epochNames: [
      {
        name: t('settings.calendar.templateEpochPast'),
        abbr: t('settings.calendar.templateEpochPast'),
      },
      {
        name: t('settings.calendar.templateEpochFuture'),
        abbr: t('settings.calendar.templateEpochFuture'),
      },
    ],
    levelNames: {
      second: t('settings.calendar.templateLevelSecond'),
      minute: t('settings.calendar.templateLevelMinute'),
      hour: t('settings.calendar.templateLevelHour'),
      day: t('settings.calendar.templateLevelDay'),
      month: t('settings.calendar.templateLevelMonth'),
      year: t('settings.calendar.templateLevelYear'),
    },
    // 4T-001863 (Epic 3E-000307): Mehrzahl der Ebenen, der Woche und der
    // Gruppierungen, lokalisiert wie die Einzahl.
    levelNamesPlural: {
      second: t('settings.calendar.templateLevelSecondPlural'),
      minute: t('settings.calendar.templateLevelMinutePlural'),
      hour: t('settings.calendar.templateLevelHourPlural'),
      day: t('settings.calendar.templateLevelDayPlural'),
      month: t('settings.calendar.templateLevelMonthPlural'),
      year: t('settings.calendar.templateLevelYearPlural'),
    },
    weekNamePlural: t('settings.calendar.templateWeekPlural'),
    sectionNames: {
      time: t('settings.calendar.templateSectionTime'),
      date: t('settings.calendar.templateSectionDate'),
    },
    groupNames: {
      quarter: t('settings.calendar.templateQuarter'),
      halfYear: t('settings.calendar.templateHalfYear'),
    },
    groupNamesPlural: {
      quarter: t('settings.calendar.templateQuarterPlural'),
      halfYear: t('settings.calendar.templateHalfYearPlural'),
    },
  });
}

const VORLAGEN = [
  {
    id: 'gregorian',
    order: 1,
    nameKey: 'settings.calendar.templateName',
    // Der Tag ist er selbst: Das Paar dient allein dem Nachweis der Tages-Achse
    // in der Prüfung der Sammlung; die Vorlage setzt daraus keinen Anker.
    referenceDay: { own: [2000, 1, 1], gregorian: [2000, 1, 1] },
    create: createGregorian,
  },
  // 4T-001998 (Epic 3E-000307): Julianisch, Indischer Nationalkalender,
  // Buddhistische Jahreszählung, Äthiopisch, Koptisch, Minguo.
  ...SYSTEM_TEMPLATES,
];

// Menü-Reihenfolge: aufsteigend nach dem Platz auf der festgelegten Liste.
const CALENDAR_TEMPLATES = Object.freeze(
  VORLAGEN.slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => Object.freeze(entry)),
);

// Eintrag zu einer Kennung; null, wenn es keine solche Vorlage gibt.
function findCalendarTemplate(id) {
  return CALENDAR_TEMPLATES.find((entry) => entry.id === id) || null;
}

module.exports = {
  CALENDAR_TEMPLATES,
  findCalendarTemplate,
  templateBlockAnchor,
  templateTimeLevels,
};
