// 4T-000637 (Epic 3E-000069): Wecker-Modell und Faelligkeits-Rechnung der
// Uhr-Erweiterung.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein DOM, kein
// Electron): dasselbe Modul bedient den Renderer (Liste, Anlege-Dialog) und
// den Pruefer im Main (alarm-check.js). Muster src/shared/clock/clock-options.js.
//
// Bewusst OHNE require-Abhaengigkeiten. Die vorhandenen Zeit-Helfer der
// Erinnerungen (localNowString in shared/reminders.js) haengen transitiv am
// Task-Parser; die wenigen hier noetigen Kalender-Funktionen stehen deshalb
// als geschlossene Kurz-Fassungen im Modul.
//
// Zeit-Semantik: Ein Wecker meint die lokale Wanduhr-Zeit ('HH:mm'), nicht
// UTC. Die projektweite UTC-Konvention gilt fuer persistierte Zeitstempel;
// hier ist die Wanduhr-Zeit der fachliche Wert (07:00 bleibt 07:00, auch
// ueber die Zeitumstellung hinweg).
'use strict';

// Store-Schluessel der Wecker-Liste (app-weit, nicht bereichsgebunden).
const CLOCK_ALARMS_KEY = 'clock.alarms';

// Wiederhol-Muster; erste Position ist Default und Rueckfall.
const ALARM_REPEATS = ['once', 'daily', 'weekdays'];

// Wochentage als 0..6 mit 0 = Montag (ISO-Zaehlung, passt zur Anzeige in
// der DACH-Region und zur ISO-Kalenderwoche der Uhr).
const WEEKDAY_COUNT = 7;

// Schlummer-Dauer in Minuten (Einstellung im Uhr-Bereich).
const DEFAULT_SNOOZE_MINUTES = 5;
const SNOOZE_MIN_MINUTES = 1;
const SNOOZE_MAX_MINUTES = 120;

// Laengen-Grenze der Bezeichnung: verhindert, dass ein versehentlich
// eingefuegter Absatz die Liste sprengt.
const MAX_LABEL_LENGTH = 80;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

// --- Kalender-Kurzfassungen ---------------------------------------------------

// Wochentag als 0..6 mit 0 = Montag (Date.getDay liefert 0 = Sonntag).
function isoWeekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

// Kalendertag 'JJJJ-MM-TT' in lokaler Zeit.
function dayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Zeitpunkt eines Weckers an einem konkreten Kalendertag.
function alarmDateOn(alarm, day) {
  const [hh, mm] = alarm.time.split(':');
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(hh), Number(mm), 0, 0);
}

// --- Normalisierung -----------------------------------------------------------

// Wochentags-Liste bereinigen: nur ganze Zahlen 0..6, ohne Duplikate,
// aufsteigend. Leer bleibt leer (der Aufrufer entscheidet, ob das ein
// gueltiger Wecker ist — siehe normalizeAlarm).
function normalizeDays(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const value of raw) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n >= WEEKDAY_COUNT) continue;
    seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

// Einen einzelnen Wecker bereinigen. Liefert null, wenn der Eintrag
// unbrauchbar ist (fehlende Kennung oder unguelige Uhrzeit) — solche
// Eintraege verschwinden beim naechsten Speichern, statt die Liste mit
// unbedienbaren Zeilen zu fuellen.
function normalizeAlarm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : null;
  const time = typeof raw.time === 'string' && TIME_RE.test(raw.time) ? raw.time : null;
  if (!id || !time) return null;
  const repeat = ALARM_REPEATS.includes(raw.repeat) ? raw.repeat : ALARM_REPEATS[0];
  const days = repeat === 'weekdays' ? normalizeDays(raw.days) : [];
  return {
    id,
    time,
    label: typeof raw.label === 'string' ? raw.label.trim().slice(0, MAX_LABEL_LENGTH) : '',
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    repeat,
    // Ein Wochentags-Wecker ohne gewaehlten Tag wuerde nie feuern; er faellt
    // auf 'taeglich' zurueck statt still zu verstummen.
    days: repeat === 'weekdays' && days.length === 0 ? [] : days,
  };
}

// Ganze Liste bereinigen: unbrauchbare Eintraege und Kennungs-Duplikate
// entfallen, sortiert nach Uhrzeit und bei Gleichstand nach Kennung.
function normalizeAlarms(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const alarm = normalizeAlarm(entry);
    if (!alarm || seen.has(alarm.id)) continue;
    // Wochentags-Wecker ohne Tag: auf taeglich zuruecksetzen (siehe oben).
    if (alarm.repeat === 'weekdays' && alarm.days.length === 0) alarm.repeat = 'daily';
    seen.add(alarm.id);
    out.push(alarm);
  }
  out.sort((a, b) => (a.time === b.time ? a.id.localeCompare(b.id) : a.time.localeCompare(b.time)));
  return out;
}

// Naechste freie Kennung ('a1', 'a2', …) aus dem Bestand — deterministisch
// und damit testbar (Muster nextGroupId der Tab-Gruppen).
function nextAlarmId(alarms) {
  let max = 0;
  for (const alarm of Array.isArray(alarms) ? alarms : []) {
    const m = /^a(\d+)$/.exec(String((alarm && alarm.id) || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `a${max + 1}`;
}

// Schlummer-Dauer bereinigen (Einstellungs-Wert).
function normalizeSnoozeMinutes(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SNOOZE_MINUTES;
  return Math.max(SNOOZE_MIN_MINUTES, Math.min(SNOOZE_MAX_MINUTES, Math.round(n)));
}

// --- Faelligkeit ---------------------------------------------------------------

// Gilt der Wecker an diesem Kalendertag? 'once' und 'daily' gelten immer,
// 'weekdays' nur an den gewaehlten Tagen. Ob er an diesem Tag schon
// gemeldet wurde, entscheidet der Melde-Schluessel.
function alarmAppliesOn(alarm, date) {
  if (!alarm || !alarm.enabled) return false;
  if (alarm.repeat !== 'weekdays') return true;
  return alarm.days.includes(isoWeekdayIndex(date));
}

// Melde-Schluessel: Kennung plus Kalendertag. Der Tag im Schluessel sorgt
// dafuer, dass ein taeglicher Wecker jeden Tag genau einmal feuert und
// derselbe Tag nicht doppelt gemeldet wird.
function alarmFireKey(alarm, date) {
  return `${alarm.id}|${dayKey(date)}`;
}

// Faellige Wecker im halboffenen Zeitfenster (from, to]:
//   from  Zeitpunkt des letzten Pruef-Laufs (exklusiv)
//   to    jetzt (inklusiv)
// Ein Wecker feuert, wenn sein Zeitpunkt in dieses Fenster faellt und der
// Melde-Schluessel noch nicht vergeben ist. Das Fenster (statt eines
// blossen „Zeitpunkt erreicht") verhindert, dass ein laengst vergangener
// Wecker beim App-Start nachtraeglich ausloest.
//
// Geprueft werden der Kalendertag von `from` und der von `to` — mehr kann
// ein Fenster nicht abdecken, weil der Aufrufer es auf wenige Minuten
// klemmt (alarm-check.js).
function computeDueAlarms(alarms, { from, to, firedKeys } = {}) {
  if (!(from instanceof Date) || !(to instanceof Date) || to <= from) return [];
  const fired = firedKeys instanceof Set ? firedKeys : new Set();
  const days = [from];
  if (dayKey(from) !== dayKey(to)) days.push(to);
  const due = [];
  for (const alarm of normalizeAlarms(alarms)) {
    for (const day of days) {
      if (!alarmAppliesOn(alarm, day)) continue;
      const at = alarmDateOn(alarm, day);
      if (at <= from || at > to) continue;
      const key = alarmFireKey(alarm, day);
      if (fired.has(key)) continue;
      due.push({ ...alarm, key, at: at.getTime() });
      break;
    }
  }
  return due;
}

// Zeitpunkt nach dem Schlummern.
function snoozeUntil(now, minutes) {
  return new Date(now.getTime() + normalizeSnoozeMinutes(minutes) * 60000);
}

// Ein einmaliger Wecker schaltet sich nach dem Ausloesen selbst ab; die
// uebrigen Muster bleiben unveraendert. Liefert die neue Liste (Eingabe
// unveraendert) bzw. die Eingabe-Referenz, wenn sich nichts aendert.
function disableFiredOnceAlarms(alarms, firedIds) {
  const ids = firedIds instanceof Set ? firedIds : new Set(firedIds || []);
  const list = normalizeAlarms(alarms);
  let changed = false;
  const next = list.map((alarm) => {
    if (alarm.repeat !== 'once' || !alarm.enabled || !ids.has(alarm.id)) return alarm;
    changed = true;
    return { ...alarm, enabled: false };
  });
  return changed ? next : alarms;
}

module.exports = {
  CLOCK_ALARMS_KEY,
  ALARM_REPEATS,
  WEEKDAY_COUNT,
  DEFAULT_SNOOZE_MINUTES,
  SNOOZE_MIN_MINUTES,
  SNOOZE_MAX_MINUTES,
  MAX_LABEL_LENGTH,
  isoWeekdayIndex,
  dayKey,
  normalizeAlarm,
  normalizeAlarms,
  nextAlarmId,
  normalizeSnoozeMinutes,
  alarmAppliesOn,
  alarmFireKey,
  computeDueAlarms,
  snoozeUntil,
  disableFiredOnceAlarms,
};
