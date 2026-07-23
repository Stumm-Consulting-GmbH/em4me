// 4T-0525 (Epic 3E-0095): Erinnerungs-Kern — reine Faelligkeits-,
// Gruppen- und Snooze-Logik des Erinnerungs-Systems.
//
// Aufgaben des Moduls:
// - Aus Roh-Task-Zeilen des Index die Erinnerungs-Anker sammeln
//   (collectReminders): Zeilen mit ⏰-Marker, Global Filter wie der
//   TASKS-Scope, erledigte und stornierte Status-Typen loesen nicht aus
//   (Workshop-Punkt 2 und 4).
// - Faelligkeit deterministisch berechnen (computeDue): faellig ist jeder
//   Anker mit Zeitpunkt kleiner/gleich jetzt, der weder gemeldet noch
//   gemutet ist. Der erste Pruef-Lauf nach App-Start liefert damit
//   automatisch alle zwischenzeitlich faellig gewordenen Anker als
//   Nachhol-Lieferung (Workshop-Punkt 6, ohne "letzter Lauf"-Persistenz).
// - Panel-Gruppen bilden (groupForPanel): ueberfaellig, heute, morgen,
//   spaeter (Workshop-Punkt 5).
// - Snooze-Optionen normalisieren und anwenden (Workshop-Punkt 4;
//   Standard-Set 10 min / 1 h / 4 h / 1 Tag / 1 Woche, PO-Festlegung bei
//   der Plan-Freigabe 2026-07-11).
//
// Zeit-Modell: Erinnerungs-Zeitpunkte sind lokale Wanduhr-Zeiten des
// Nutzers in der Form 'JJJJ-MM-TTTHH:MM' (String-Vergleich = zeitliche
// Ordnung). Die UTC-Konvention der Projekt-Standards betrifft System-
// Zeitstempel, nicht diese Fach-Werte. Der Bezugszeitpunkt kommt immer
// injiziert (nowLocal bzw. now-Date) — Tests rechnen deterministisch.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM) — Main-Scheduler (reminder-check.js), Renderer (Dialog,
// Panel) und Tests laden dasselbe Modul.
'use strict';

const {
  parseTaskLine,
  modelMatchesGlobalFilter,
  stripGlobalFilter,
  shiftIsoDateByDays,
  isValidTime,
  REMINDER_SYMBOL,
} = require('./task-markers');

// Default-Uhrzeit fuer Anker ohne Zeitanteil (Einstellung, Workshop-Punkt 1).
const DEFAULT_REMINDER_TIME = '09:00';

// Snooze-Einheiten: Minuten, Stunden, Tage, Wochen.
const SNOOZE_UNITS = ['m', 'h', 'd', 'w'];

const DEFAULT_SNOOZE_OPTIONS = [
  { amount: 10, unit: 'm' },
  { amount: 1, unit: 'h' },
  { amount: 4, unit: 'h' },
  { amount: 1, unit: 'd' },
  { amount: 1, unit: 'w' },
];

// --- Konfiguration -----------------------------------------------------------------
// Store-Wert remindersConfig robust normalisieren (Muster
// normalizeTasksConfig): defekte Teile fallen auf die Defaults zurueck.
function normalizeSnoozeOptions(raw) {
  if (!Array.isArray(raw)) return DEFAULT_SNOOZE_OPTIONS.map((o) => ({ ...o }));
  const out = [];
  for (const opt of raw) {
    const amount = Number(opt && opt.amount);
    const unit = opt && opt.unit;
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) continue;
    if (!SNOOZE_UNITS.includes(unit)) continue;
    out.push({ amount, unit });
  }
  return out.length > 0 ? out : DEFAULT_SNOOZE_OPTIONS.map((o) => ({ ...o }));
}

function normalizeRemindersConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const defaultTime =
    typeof src.defaultTime === 'string' &&
    /^\d{2}:\d{2}$/.test(src.defaultTime) &&
    isValidTime(src.defaultTime)
      ? src.defaultTime
      : DEFAULT_REMINDER_TIME;
  return {
    defaultTime,
    snoozeOptions: normalizeSnoozeOptions(src.snoozeOptions),
    systemNotification: src.systemNotification === true,
  };
}

// --- Zeitpunkte ---------------------------------------------------------------------
function pad2(n) {
  return String(n).padStart(2, '0');
}

// Lokaler Bezugszeitpunkt 'JJJJ-MM-TTTHH:MM' aus einem Date (injizierbar).
function localNowString(now = new Date()) {
  return (
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}` +
    `T${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  );
}

// Melde-Zeitpunkt eines Task-Modells oder null (kein/ungueltiger Anker).
function reminderInstant(model, defaultTime) {
  if (!model || !model.reminder || model.reminder.invalid) return null;
  return `${model.reminder.date}T${model.reminder.time || defaultTime || DEFAULT_REMINDER_TIME}`;
}

// Identitaet einer Erinnerung fuer den Session-Zustand (gemeldet/gemutet):
// Pfad plus Roh-Zeilentext. Snooze und Erledigen aendern den Text und
// erzeugen damit von selbst einen frischen Schluessel.
function reminderKey(path, taskText) {
  return `${path}\n${taskText}`;
}

// --- Sammeln ------------------------------------------------------------------------
// taskLines: Array { path, zeile, text } (Lese-API areaTaskLines des
// Index). env: { globalFilter, statusTypeOf, defaultTime }. Rueckgabe
// zeitlich sortierte Eintraege { key, path, line, taskText, description,
// instant, date, time }.
function collectReminders(taskLines, env) {
  const globalFilter = env && typeof env.globalFilter === 'string' ? env.globalFilter : '';
  const statusTypeOf =
    env && typeof env.statusTypeOf === 'function' ? env.statusTypeOf : () => null;
  const defaultTime = (env && env.defaultTime) || DEFAULT_REMINDER_TIME;
  const out = [];
  for (const tl of taskLines || []) {
    if (!tl || typeof tl.text !== 'string') continue;
    // Billige Vorpruefung vor dem vollen Zeilen-Parse (30-Sekunden-Takt).
    if (!tl.text.includes(REMINDER_SYMBOL)) continue;
    const model = parseTaskLine(tl.text);
    if (!model || !model.reminder || model.reminder.invalid) continue;
    if (!modelMatchesGlobalFilter(model, globalFilter)) continue;
    const statusType = statusTypeOf(model.statusChar);
    if (statusType === 'DONE' || statusType === 'CANCELLED') continue;
    out.push({
      key: reminderKey(tl.path, tl.text),
      path: tl.path,
      line: tl.zeile,
      taskText: tl.text,
      description: stripGlobalFilter(model.description, globalFilter).trim(),
      instant: reminderInstant(model, defaultTime),
      date: model.reminder.date,
      time: model.reminder.time,
    });
  }
  out.sort((a, b) => (a.instant < b.instant ? -1 : a.instant > b.instant ? 1 : 0));
  return out;
}

// --- Faelligkeit --------------------------------------------------------------------
// Faellige, noch nicht gemeldete und nicht gemutete Eintraege.
function computeDue(items, opts) {
  const nowLocal = opts && opts.nowLocal;
  const reported = (opts && opts.reportedKeys) || new Set();
  const muted = (opts && opts.mutedKeys) || new Set();
  if (!nowLocal) return [];
  return (items || []).filter(
    (it) => it.instant <= nowLocal && !reported.has(it.key) && !muted.has(it.key),
  );
}

// --- Panel-Gruppen ------------------------------------------------------------------
// Gruppen in Anzeige-Reihenfolge: ueberfaellig (Zeitpunkt erreicht oder
// vorbei — dort erscheinen auch gemutete Eintraege), heute (noch
// anstehend), morgen, spaeter.
function groupForPanel(items, opts) {
  const todayIso = opts && opts.todayIso;
  const nowLocal = opts && opts.nowLocal;
  const groups = { overdue: [], today: [], tomorrow: [], later: [] };
  if (!todayIso || !nowLocal) return groups;
  const tomorrowIso = shiftIsoDateByDays(todayIso, 1);
  for (const it of items || []) {
    if (it.instant <= nowLocal) groups.overdue.push(it);
    else if (it.date === todayIso) groups.today.push(it);
    else if (it.date === tomorrowIso) groups.tomorrow.push(it);
    else groups.later.push(it);
  }
  return groups;
}

// --- Snooze -------------------------------------------------------------------------
// Neuer Erinnerungs-Wert { date, time } ab dem Bezugszeitpunkt nowLocal:
// Minuten/Stunden rechnen minutengenau mit Tages-Uebertrag, Tage/Wochen
// verschieben das Datum und behalten die Uhrzeit des Bezugszeitpunkts.
function snoozedReminderValue(nowLocal, option) {
  const date = nowLocal.slice(0, 10);
  const time = nowLocal.slice(11, 16);
  if (option.unit === 'd' || option.unit === 'w') {
    const days = option.amount * (option.unit === 'w' ? 7 : 1);
    return { date: shiftIsoDateByDays(date, days), time };
  }
  const deltaMin = option.amount * (option.unit === 'h' ? 60 : 1);
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + deltaMin;
  const dayShift = Math.floor(total / 1440);
  const rest = total - dayShift * 1440;
  return {
    date: dayShift === 0 ? date : shiftIsoDateByDays(date, dayShift),
    time: `${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}`,
  };
}

module.exports = {
  DEFAULT_REMINDER_TIME,
  DEFAULT_SNOOZE_OPTIONS,
  SNOOZE_UNITS,
  normalizeRemindersConfig,
  normalizeSnoozeOptions,
  localNowString,
  reminderInstant,
  reminderKey,
  collectReminders,
  computeDue,
  groupForPanel,
  snoozedReminderValue,
};
