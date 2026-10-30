// 4T-002419 (Epic 3E-000366): Zeitplan-Grammatik und Fälligkeits-Rechnung der
// Workflows (Story 4S-001130).
//
// **Quelle** sind die Entscheidungen 2a und 2b der Konzept-Runde (4T-002418,
// Product Owner am 2026-10-28, «Alle wie empfohlen»): eine lesbare Regel in
// einer Zeile nach dem Muster der Aufgaben-Wiederholung,
//
//   every [N] (minutes | hours | day(s) | weekday | week(s) on <Wochentage> |
//              month(s) on the <Tag>th | last) [at HH:MM]
//
// dazu die Kurzform `every monday, thursday at 18:00` aus den Beispielen von
// 2a (gleichbedeutend mit `every week on monday, thursday`). `at` ist Pflicht
// bei Tag, Woche und Monat und verboten bei Minuten und Stunden. Eine zweite
// Schreibweise (cron) gibt es nicht.
//
// **Ausführungs-Entscheidungen im gesetzten Rahmen** (im Task festgehalten):
// - Groß- und Kleinschreibung zählt nicht, Leerraum wird zusammengezogen, wie
//   beim Vorbild `parseRecurrenceRule` in `src/shared/tasks/task-recurrence.js`;
//   Einzahl und Mehrzahl der Einheit gelten gleich.
// - **Im Zweifel streng:** `week(s)` verlangt `on <Wochentage>`, `month(s)`
//   verlangt `on the <Tag>`, weil ein Zeitplan anders als eine wiederkehrende
//   Aufgabe kein Bezugsdatum hat, aus dem der Wochentag oder Monatstag folgte.
//   `weekday` und die Kurzform mit Wochentagen nehmen keine Zahl `N`. Die
//   Uhrzeit hat genau die Form `HH:MM`. Eine spätere Lockerung bricht keine
//   vorhandene Datei, eine spätere Verschärfung schon.
// - **Zählung ab dem Bezugszeitpunkt:** Der nächste Termin liegt streng nach
//   `from` (dem letzten Lauf oder der Scharf-Schaltung). Ein Intervall
//   (`every 30 minutes`) zählt ab `from`; bei `every N days`, `every N weeks`
//   und `every N months` beginnt die Folge am Tag, in der Woche (ab Montag)
//   und im Monat von `from`.
//
// **Zeit-Modell (2b):** lokale Wanduhr-Zeit im Format der Erinnerungen
// `JJJJ-MM-TTTHH:MM` (`src/shared/reminders.js`); die Kalender-Arithmetik
// rechnet zeitzonenfrei auf Tages-Nummern und Wanduhr-Minuten. Allein die
// Frage, ob eine Wanduhr-Minute **existiert**, braucht die Zeitzone: Fällt sie
// beim Vorstellen der Uhr aus, gilt die nächste existierende Minute. Diese
// Prüfung nimmt die lokale `Date` und ist für Prüfdateien injizierbar.
//
// Der Kern kennt keine Sprache: Befunde sind Codes, die Texte entstehen in der
// Anzeige.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { daysInMonth } = require('../tasks/task-markers.js');
const {
  dateFromDayNumber,
  dayNumberFromDate,
  weekdayOfDayNumber,
} = require('../tasks/task-recurrence.js');

/** Der Auslöser-Wert eines Workflows nach Zeitplan im Dateikopf. */
const SCHEDULE_TRIGGER = 'schedule';

/** Die Werte des Dateikopf-Felds `missed` (2d); der erste ist die Vorgabe. */
const MISSED_VALUES = Object.freeze(['run-once', 'skip']);
const MISSED_DEFAULT = MISSED_VALUES[0];

/** Befund-Codes der Zeitplan-Prüfung. */
const SCHEDULE_FINDINGS = Object.freeze({
  /** Die Zeile folgt keiner Form der Grammatik. */
  unreadable: 'scheduleUnreadable',
  /** Tag, Woche oder Monat ohne Uhrzeit. */
  atMissing: 'scheduleAtMissing',
  /** Uhrzeit bei Minuten oder Stunden. */
  atNotAllowed: 'scheduleAtNotAllowed',
});

const WEEKDAY_NAMES = Object.freeze({
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
});

const MINUTES_PER_DAY = 1440;
// Einheiten ohne Uhrzeit und ihre Länge in Minuten.
const INTERVAL_MINUTES = Object.freeze({ minute: 1, hour: 60 });
// Sicherheits-Deckel der Suche (Muster `nextOccurrenceDate`): hundert Jahre.
const MAX_MONTHS = 1200;
const MAX_WEEKS = 5300;
// Längste Lücke beim Vorstellen der Uhr, die gesucht wird (weltweit höchstens
// zwei Stunden; ein Tag ist der großzügige Deckel).
const MAX_GAP_MINUTES = MINUTES_PER_DAY;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

const own = (table, key) => Object.prototype.hasOwnProperty.call(table, key);

function weekdayList(text) {
  const days = [];
  for (const part of text.split(/\s*,\s*|\s+and\s+/)) {
    const name = part.trim().replace(/s$/, '');
    if (!own(WEEKDAY_NAMES, name)) return null;
    if (!days.includes(WEEKDAY_NAMES[name])) days.push(WEEKDAY_NAMES[name]);
  }
  return days.sort((a, b) => a - b);
}

function monthDayOf(text) {
  if (text === 'last') return 'last';
  const m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
  if (!m) return null;
  const day = Number(m[1]);
  return day >= 1 && day <= 31 ? day : null;
}

// Die Regel ohne Uhrzeit; null, wenn die Form keiner Zeile der Grammatik folgt.
function ruleOf(rest, interval, hasNumber) {
  const unit = rest.match(/^(minute|hour|day|weekday|week|month)s?(?:\s+(.*))?$/);
  if (unit && unit[1] !== 'week' && unit[1] !== 'month') {
    if (unit[2] !== undefined) return null;
    if (unit[1] === 'weekday') return hasNumber ? null : { unit: 'weekday', interval: 1 };
    return { unit: unit[1], interval };
  }
  if (unit && unit[1] === 'week') {
    const on = (unit[2] || '').match(/^on\s+(.+)$/);
    const weekdays = on ? weekdayList(on[1]) : null;
    return weekdays ? { unit: 'week', interval, weekdays } : null;
  }
  if (unit && unit[1] === 'month') {
    const on = (unit[2] || '').match(/^on\s+the\s+(\S+)$/);
    const monthDay = on ? monthDayOf(on[1]) : null;
    return monthDay === null ? null : { unit: 'month', interval, monthDay };
  }
  // Kurzform `every monday, thursday`: jede Woche an diesen Tagen.
  const weekdays = hasNumber ? null : weekdayList(rest);
  return weekdays ? { unit: 'week', interval: 1, weekdays } : null;
}

/**
 * Liest die Zeitplan-Zeile aus dem Dateikopf.
 *
 * @param {*} text Wert des Felds `schedule`.
 * @returns {{ok: true, rule: {unit: ('minute'|'hour'|'day'|'weekday'|'week'|'month'),
 *   interval: number, time: (string|null), weekdays?: number[],
 *   monthDay?: (number|'last')}}|{ok: false, code: string}}
 *   Wochentage 0 = Montag bis 6 = Sonntag; `time` als `HH:MM` oder null.
 */
function parseSchedule(text) {
  const fail = (code) => ({ ok: false, code });
  if (typeof text !== 'string') return fail(SCHEDULE_FINDINGS.unreadable);
  const line = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const every = line.match(/^every (.+)$/);
  if (!every) return fail(SCHEDULE_FINDINGS.unreadable);
  let rest = every[1];
  let time = null;
  const at = rest.match(/^(.+) at (.+)$/);
  if (at) {
    if (!TIME_RE.test(at[2])) return fail(SCHEDULE_FINDINGS.unreadable);
    rest = at[1];
    time = at[2];
  }
  const number = rest.match(/^(\d+) (.+)$/);
  const interval = number ? Number(number[1]) : 1;
  if (number && interval < 1) return fail(SCHEDULE_FINDINGS.unreadable);
  const rule = ruleOf(number ? number[2] : rest, interval, Boolean(number));
  if (!rule) return fail(SCHEDULE_FINDINGS.unreadable);
  const isInterval = own(INTERVAL_MINUTES, rule.unit);
  if (isInterval && time !== null) return fail(SCHEDULE_FINDINGS.atNotAllowed);
  if (!isInterval && time === null) return fail(SCHEDULE_FINDINGS.atMissing);
  return { ok: true, rule: { ...rule, time } };
}

// --- Fälligkeit -----------------------------------------------------------------

const pad = (n, width = 2) => String(n).padStart(width, '0');

function wallToMinutes(text) {
  const m = typeof text === 'string' ? text.match(WALL_RE) : null;
  if (!m) throw new TypeError(`Kein Zeitpunkt im Format JJJJ-MM-TTTHH:MM: ${String(text)}`);
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new TypeError(`Kein gültiges Datum: ${text}`);
  }
  return dayNumberFromDate(y, mo, d) * MINUTES_PER_DAY + h * 60 + mi;
}

function minutesToWall(total) {
  const dayNumber = Math.floor(total / MINUTES_PER_DAY);
  const minute = total - dayNumber * MINUTES_PER_DAY;
  const { y, m, d } = dateFromDayNumber(dayNumber);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/**
 * Gibt es diese Wanduhr-Minute in der lokalen Zeitzone? Beim Vorstellen der
 * Uhr fällt eine Stunde aus; die lokale `Date` schiebt eine solche Angabe auf
 * eine andere Uhrzeit, was der Vergleich erkennt.
 *
 * @param {string} wall Zeitpunkt `JJJJ-MM-TTTHH:MM`.
 * @returns {boolean}
 */
function localMinuteExists(wall) {
  const [y, mo, d, h, mi] = wall.match(WALL_RE).slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  return (
    date.getFullYear() === y &&
    date.getMonth() === mo - 1 &&
    date.getDate() === d &&
    date.getHours() === h &&
    date.getMinutes() === mi
  );
}

// Erster Termin der Regel als Wanduhr-Minuten streng nach `from`, ohne
// Rücksicht auf die Zeitumstellung; null, wenn keiner erreichbar ist.
function nextWallMinutes(rule, from) {
  if (own(INTERVAL_MINUTES, rule.unit)) return from + rule.interval * INTERVAL_MINUTES[rule.unit];
  const fromDay = Math.floor(from / MINUTES_PER_DAY);
  const [h, mi] = rule.time.split(':').map(Number);
  const at = (day) => day * MINUTES_PER_DAY + h * 60 + mi;
  if (rule.unit === 'day') return at(fromDay) > from ? at(fromDay) : at(fromDay + rule.interval);
  if (rule.unit === 'weekday') {
    let day = fromDay;
    while (weekdayOfDayNumber(day) > 4 || at(day) <= from) day++;
    return at(day);
  }
  if (rule.unit === 'week') {
    const weekStart = fromDay - weekdayOfDayNumber(fromDay);
    for (let k = 0; k <= MAX_WEEKS; k += rule.interval) {
      for (const wd of rule.weekdays) {
        if (at(weekStart + k * 7 + wd) > from) return at(weekStart + k * 7 + wd);
      }
    }
    return null;
  }
  const start = dateFromDayNumber(fromDay);
  for (let k = 0; k <= MAX_MONTHS; k += rule.interval) {
    const total = start.m - 1 + k;
    const y = start.y + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const dim = daysInMonth(y, m);
    const day = rule.monthDay === 'last' ? dim : rule.monthDay;
    // Ein Zieltag, den der Monat nicht hat, wird übersprungen (2b).
    if (day <= dim && at(dayNumberFromDate(y, m, day)) > from) {
      return at(dayNumberFromDate(y, m, day));
    }
  }
  return null;
}

/**
 * Der nächste fällige Lauf nach einem Zeitplan, streng nach dem Bezugszeitpunkt.
 *
 * @param {object} rule Regel aus `parseSchedule` (`rule`).
 * @param {string} from Bezugszeitpunkt `JJJJ-MM-TTTHH:MM`, lokale Wanduhr-Zeit
 *   (letzter Lauf oder Scharf-Schaltung).
 * @param {{minuteExists?: function(string): boolean}} [options] Prüfung, ob
 *   eine Wanduhr-Minute existiert; Vorgabe ist die lokale Zeitzone.
 * @returns {string|null} Termin `JJJJ-MM-TTTHH:MM` oder null, wenn die Regel in
 *   hundert Jahren keinen Termin hat (etwa `every 12 months on the 30th` ab
 *   Februar).
 */
function nextScheduleDue(rule, from, options = {}) {
  if (!rule || typeof rule.unit !== 'string') throw new TypeError('Keine Zeitplan-Regel');
  const exists = options.minuteExists || localMinuteExists;
  const wall = nextWallMinutes(rule, wallToMinutes(from));
  if (wall === null) return null;
  // Fällt die Minute beim Vorstellen der Uhr aus, gilt die nächste existierende.
  for (let minute = wall; minute <= wall + MAX_GAP_MINUTES; minute++) {
    if (exists(minutesToWall(minute))) return minutesToWall(minute);
  }
  return minutesToWall(wall);
}

module.exports = {
  MISSED_DEFAULT,
  MISSED_VALUES,
  SCHEDULE_FINDINGS,
  SCHEDULE_TRIGGER,
  localMinuteExists,
  nextScheduleDue,
  parseSchedule,
};
