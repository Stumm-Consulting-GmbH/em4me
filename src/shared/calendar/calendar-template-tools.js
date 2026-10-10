// 4T-001998 (Epic 3E-000307): Bausteine der mitgelieferten Kalender-Vorlagen.
// Hier stehen die Teile, aus denen die Fabriken der Vorlagen ihre Definition
// zusammensetzen: Zeit-Ebenen (T2), Block-Anker aus dem Stichtag-Paar (T1),
// Datums-Ebenen, Sieben-Tage-Woche aus dem Stichtag-Paar, Quartal und
// Halbjahr, Zeitalter und der Zusammenbau einer ganzen Definition.
// templateTimeLevels und templateBlockAnchor standen bis 4T-001998 unverändert
// in calendar-templates.js; sie sind hierher verschoben, weil die Fabriken der
// weiteren Vorlagen (calendar-template-systems.js) sie brauchen und die
// Sammlung zu groß geworden wäre.
//
// Übersetzungen: Jeder Baustein, der Namen trägt, nimmt die Übersetzungs-
// Funktion t (Schlüssel → Text) entgegen; das Modul bleibt frei von Electron
// und vom i18n-Modul des Fensters.
//
// Import-Richtung im Ordner: Dieses Modul lädt den Kern und die gregorianische
// Fabrik (calendar-template.js); geladen wird es von calendar-template-systems.js
// und calendar-templates.js. Weder der Kern noch die Fabrik noch
// calendar-config.js laden es. Der Ordner bleibt zyklenfrei, und compileSafe
// bleibt mit seinem WeakMap-Cache eine einzige Instanz im Kern.
'use strict';

const {
  compileSafe,
  normalizeLevels,
  validateTuple,
  timeStartSegs,
  tupleToAxisUnchecked,
  axisToTuple,
  cycleAt,
} = require('./calendar-core.js');
const { createGregorianTemplate } = require('./calendar-template.js');

// --- Zeit-Ebenen und Block-Anker (aus 4T-001997, unverändert) ---------------------------

// T2: Zeit-Ebenen Sekunde, Minute, Stunde wie in der gregorianischen Vorlage,
// damit Maßstab und Umrechnung jeder Vorlage bis zur Sekunde gleich bleiben.
// Die folgende Tages-Ebene (Faktor 24 auf die Stunde, Bereich «Datum») trägt
// jede Vorlage selbst. Die gregorianische Fabrik nutzt den Baustein bewusst
// nicht, damit sie Zeichen für Zeichen unverändert bleibt.
function templateTimeLevels(t) {
  const section = t('settings.calendar.templateSectionTime');
  return [
    {
      id: 'second',
      name: t('settings.calendar.templateLevelSecond'),
      namePlural: t('settings.calendar.templateLevelSecondPlural'),
      section,
      start: 0,
    },
    {
      id: 'minute',
      name: t('settings.calendar.templateLevelMinute'),
      namePlural: t('settings.calendar.templateLevelMinutePlural'),
      section,
      start: 0,
      rel: { type: 'factor', count: 60 },
    },
    {
      id: 'hour',
      name: t('settings.calendar.templateLevelHour'),
      namePlural: t('settings.calendar.templateLevelHourPlural'),
      section,
      start: 0,
      rel: { type: 'factor', count: 60 },
    },
  ];
}

// Bezugs-Rahmen des Anker-Helfers: die Wirbelsäule der gregorianischen Vorlage.
// Einmal aufgebaut, damit compileSafe das Kompilat aus seinem Cache liefert.
let gregorianReference = null;

function gregorianReferenceCalendar() {
  if (!gregorianReference) {
    gregorianReference = { levels: normalizeLevels(createGregorianTemplate().levels) };
  }
  return gregorianReference;
}

// Vorgabe-Anker eines Kompilats: internes Jahr 0, alle übrigen Segmente in
// Start-Stellung — dieselbe Regel wie zeroTuple in calendar-config.js, das
// dieses Modul nicht lädt. Die gregorianische Vorlage trägt diesen Anker.
function defaultAnchorOf(c) {
  const segs = [0];
  for (let k = 1; k < c.levels.length; k++) segs.push(c.levels[c.top - k].start);
  return segs;
}

// T1: Block-Anker einer rohen Vorlagen-Definition aus ihrem Stichtag-Paar, so
// dass die Zeitrechnung auf derselben Tages-Achse liegt wie die gregorianische
// Vorlage mit dem Vorgabe-Anker. Voraussetzungen: Skala 1/1 und dieselbe
// kleinste Einheit (Sekunde, siehe templateTimeLevels). Die Rechnung ist die
// Verschiebung aus deriveCalendar (calendar-config.js): Der Abstand des
// Stichtags vom gregorianischen Anker wird vom eigenen Stichtag abgezogen.
// Liefert das volle Tupel des Ankers oder null bei ungültiger Eingabe.
function templateBlockAnchor(definition, referenceDay) {
  if (!definition || typeof definition !== 'object' || !referenceDay) return null;
  const scale = definition.blockScale;
  if (scale != null && (!scale || scale.num !== 1 || scale.den !== 1)) return null;
  const levels = normalizeLevels(definition.levels);
  if (!levels) return null;
  const own = { levels };
  const c = compileSafe(own);
  const greg = gregorianReferenceCalendar();
  const cg = compileSafe(greg);
  const { own: ownDay, gregorian: gregDay } = referenceDay;
  if (!Array.isArray(ownDay) || ownDay.length !== c.dateCount) return null;
  if (!Array.isArray(gregDay) || gregDay.length !== cg.dateCount) return null;
  const ownFull = ownDay.concat(timeStartSegs(c));
  const gregFull = gregDay.concat(timeStartSegs(cg));
  if (!validateTuple(own, ownFull).ok || !validateTuple(greg, gregFull).ok) return null;
  const offset = tupleToAxisUnchecked(cg, gregFull) - tupleToAxisUnchecked(cg, defaultAnchorOf(cg));
  return axisToTuple(own, tupleToAxisUnchecked(c, ownFull) - offset);
}

// --- Bausteine der weiteren Vorlagen (4T-001998) -----------------------------------------

// 4T-001998 (Epic 3E-000307): Wochentag eines gregorianischen Tages (Datums-
// Segmente, internes Jahr), Montag = 0. Gerechnet über den Wochen-Zyklus der
// gregorianischen Vorlage und nicht über Date, damit die Vorlagen dieselbe
// Wochen-Zählung haben wie die gregorianische. null bei ungültigem Tag.
let gregorianWeekReference = null;

function gregorianWeekdayOf(gregorianDay) {
  if (!gregorianWeekReference) {
    gregorianWeekReference = {
      levels: gregorianReferenceCalendar().levels,
      cycles: createGregorianTemplate().cycles,
    };
  }
  const c = compileSafe(gregorianWeekReference);
  if (!Array.isArray(gregorianDay) || gregorianDay.length !== c.dateCount) return null;
  const at = cycleAt(gregorianWeekReference, gregorianDay.concat(timeStartSegs(c)), 'week');
  return at ? at.position : null;
}

// 4T-001998 (Epic 3E-000307): Datums-Ebenen Tag, Monat, Jahr einer Vorlage im
// Bereich «Datum»: Tag mit Faktor 24 auf die Stunde, Monate per Längen-Tabelle,
// Jahr als Schalt-Ebene, die den Monat leapMonthIndex (0-basiert) im
// Schaltjahr um einen Tag verlängert. Die Schalt-Regel gilt auf der internen
// Jahres-Zählung der Vorlage.
// 4T-002002 (Epic 3E-000307): Die Schalt-Regel ist entweder eine
// Teilbarkeits-Kette (leapRules, etwa [4, 100, 400]) oder ein Muster
// (leapPattern: { cycle, years }, Plätze im Zyklus ab 1, Baustein 4T-002001),
// genau eines von beiden. Mit leapRules entsteht die Ebene Zeichen für Zeichen
// wie zuvor.
function templateDateLevels(
  t,
  { monthNames, monthLengths, leapRules, leapPattern, leapMonthIndex },
) {
  const section = t('settings.calendar.templateSectionDate');
  const leapRule = leapPattern
    ? { pattern: { cycle: leapPattern.cycle, years: leapPattern.years.slice() } }
    : { rules: leapRules.map((cycle) => ({ cycle })) };
  return [
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
      names: monthNames,
      rel: { type: 'lengths', table: monthLengths.slice() },
    },
    {
      id: 'year',
      name: t('settings.calendar.templateLevelYear'),
      namePlural: t('settings.calendar.templateLevelYearPlural'),
      section,
      start: 1,
      rel: {
        type: 'leap',
        count: monthLengths.length,
        ...leapRule,
        targetIndex: leapMonthIndex,
        extra: 1,
      },
    },
  ];
}

// 4T-001998 (Epic 3E-000307): Sieben-Tage-Woche aus dem Stichtag-Paar. Anker
// ist das eigene Datum des Stichtags, Position der Wochentag des
// gregorianischen Stichtags (Montag = 0). So läuft die Woche jeder Vorlage
// ohne Bruch mit der gregorianischen. Wochen-Nummerierung nach der
// Donnerstags-Regel nur auf Wunsch (numbered), weil sie nur dort eingeführt
// ist, wo das Jahr das gregorianische ist.
function templateWeekCycle(t, referenceDay, numbered) {
  const cycle = {
    id: 'week',
    name: t('settings.calendar.templateWeek'),
    namePlural: t('settings.calendar.templateWeekPlural'),
    of: 'day',
    length: 7,
    names: t('settings.calendar.templateWeekdays').split(','),
    anchor: {
      tuple: referenceDay.own.slice(),
      position: gregorianWeekdayOf(referenceDay.gregorian),
    },
  };
  if (numbered) cycle.numbering = { ruleIndex: 3 };
  return cycle;
}

// 4T-001998 (Epic 3E-000307): Quartal und Halbjahr wie in der gregorianischen
// Vorlage, für Vorlagen mit den zwölf gregorianischen Monaten.
function templateMonthGroups(t) {
  return [
    {
      id: 'quarter',
      name: t('settings.calendar.templateQuarter'),
      namePlural: t('settings.calendar.templateQuarterPlural'),
      of: 'month',
      size: 3,
    },
    {
      id: 'half-year',
      name: t('settings.calendar.templateHalfYear'),
      namePlural: t('settings.calendar.templateHalfYearPlural'),
      of: 'month',
      size: 6,
    },
  ];
}

// 4T-001998 (Epic 3E-000307): Definition einer Vorlage aus ihrer Beschreibung.
// spec: { id, nameKey, monthNames, monthLengths, leapRules oder leapPattern
// (4T-002002), leapMonthIndex,
// epochs: [{ name, abbr, start }, …], referenceDay, numberedWeeks,
// monthGroups, alwaysWriteEpoch }.
// 4T-002000 (Epic 3E-000307): verallgemeinert auf beliebig viele Epochen, je
// mit eigenem Beginn (start: Datums-Segmente in interner Jahres-Zählung), und
// das optionale Kennzeichen alwaysWriteEpoch (4T-001999). Anlass ist die
// japanische Vorlage mit fünf Ären; die Definitionen der Vorlagen mit zwei
// Epochen bleiben Zeichen für Zeichen gleich, weil das Kennzeichen nur als
// true und nur dann als Feld entsteht.
// Die erste Epoche ist offen in die Vergangenheit und zählt rückwärts (ihr
// start wird nicht gelesen), jede weitere beginnt mit ihrem start. Der
// Block-Anker entsteht aus dem Stichtag-Paar (T1), die Skala ist 1/1.
function buildTemplateDefinition(t, spec) {
  const definition = {
    id: spec.id,
    name: t(spec.nameKey),
    levels: templateTimeLevels(t).concat(templateDateLevels(t, spec)),
    cycles: [templateWeekCycle(t, spec.referenceDay, spec.numberedWeeks)],
    groups: spec.monthGroups ? templateMonthGroups(t) : [],
    epochs: spec.epochs.map((epoch, i) => ({
      name: epoch.name,
      abbr: epoch.abbr,
      start: i === 0 ? null : epoch.start.slice(),
    })),
    blockScale: { num: 1, den: 1 },
  };
  if (spec.alwaysWriteEpoch === true) definition.alwaysWriteEpoch = true;
  definition.blockAnchor = templateBlockAnchor(definition, spec.referenceDay);
  return definition;
}

module.exports = {
  templateTimeLevels,
  templateBlockAnchor,
  gregorianWeekdayOf,
  templateDateLevels,
  templateWeekCycle,
  templateMonthGroups,
  buildTemplateDefinition,
};
