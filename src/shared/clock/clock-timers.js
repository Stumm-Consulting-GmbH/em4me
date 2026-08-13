// 4T-0638 (Epic 3E-0069): Timer- und Stoppuhr-Modell der Uhr-Erweiterung.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein DOM, kein
// Electron): dasselbe Modul bedient den Renderer (Liste, Anzeige) und den
// Pruefer im Main (timer-check.js). Muster src/shared/clock/clock-alarms.js,
// bewusst ohne require-Abhaengigkeiten.
//
// Zeit-Semantik: Anders als beim Wecker (Wanduhr-Zeit) zaehlen hier
// VERGANGENE Zeitspannen. Gerechnet wird deshalb ueber absolute
// Zeitstempel in Millisekunden (Date.now), nicht ueber Kalenderfelder —
// eine Zeitumstellung waehrend eines laufenden Timers verkuerzt oder
// verlaengert ihn dadurch nicht.
//
// Kern-Invariante: Die Restzeit wird IMMER aus Zeitstempeln gerechnet, nie
// sekuendlich heruntergezaehlt. Ein ausgefallener Tick, ein Fenster im
// Hintergrund oder ein Standby aendern das Ergebnis damit nicht.
'use strict';

// Store-Schluessel (app-weit, nicht bereichsgebunden).
const CLOCK_TIMERS_KEY = 'clock.timers';
const CLOCK_STOPWATCH_KEY = 'clock.stopwatch';

// Laufzustaende. 'idle' = eingestellt, aber nie gestartet bzw. zurueck-
// gesetzt; 'expired' = abgelaufen und noch nicht bestaetigt.
const TIMER_STATES = ['idle', 'running', 'paused', 'expired'];

// Grenzen der Dauer: mindestens eine Sekunde, hoechstens 24 Stunden.
const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 24 * 3600 * 1000;

// Schnellwahl im Panel (PO-Festlegung 2026-07-20, feste Werte in Minuten).
const QUICK_MINUTES = [1, 5, 25];

const MAX_LABEL_LENGTH = 80;
// Rundenliste der Stoppuhr begrenzen, damit ein Dauerlauf den Store nicht
// unbegrenzt fuellt.
const MAX_LAPS = 100;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// --- Normalisierung -----------------------------------------------------------

// Einen Timer bereinigen. Liefert null bei unbrauchbarem Eintrag (fehlende
// Kennung oder unbrauchbare Dauer).
function normalizeTimer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : null;
  const durationMs = Number(raw.durationMs);
  if (!id || !Number.isFinite(durationMs)) return null;
  const duration = clampInt(durationMs, MIN_DURATION_MS, MAX_DURATION_MS, MIN_DURATION_MS);
  const state = TIMER_STATES.includes(raw.state) ? raw.state : 'idle';
  const startedAt = Number.isFinite(Number(raw.startedAt)) ? Number(raw.startedAt) : null;
  const elapsedMs = clampInt(raw.elapsedMs, 0, MAX_DURATION_MS, 0);
  return {
    id,
    label: typeof raw.label === 'string' ? raw.label.trim().slice(0, MAX_LABEL_LENGTH) : '',
    durationMs: duration,
    // Ein 'running' ohne Startzeitpunkt waere unrechenbar; er faellt auf
    // 'paused' zurueck und behaelt die aufgelaufene Zeit.
    state: state === 'running' && startedAt == null ? 'paused' : state,
    startedAt: state === 'running' ? startedAt : null,
    elapsedMs,
  };
}

function normalizeTimers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const timer = normalizeTimer(entry);
    if (!timer || seen.has(timer.id)) continue;
    seen.add(timer.id);
    out.push(timer);
  }
  return out;
}

// Naechste freie Kennung ('t1', 't2', …), deterministisch aus dem Bestand.
function nextTimerId(timers) {
  let max = 0;
  for (const timer of Array.isArray(timers) ? timers : []) {
    const m = /^t(\d+)$/.exec(String((timer && timer.id) || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `t${max + 1}`;
}

// Stoppuhr bereinigen. Genau eine (PO-Festlegung), deshalb ein Objekt statt
// einer Liste; Runden sind aufgelaufene Zeiten in Millisekunden.
function normalizeStopwatch(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const running = src.state === 'running';
  const startedAt = Number.isFinite(Number(src.startedAt)) ? Number(src.startedAt) : null;
  const laps = Array.isArray(src.laps)
    ? src.laps
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v >= 0)
        .slice(0, MAX_LAPS)
    : [];
  return {
    state: running && startedAt != null ? 'running' : running ? 'paused' : 'idle',
    startedAt: running && startedAt != null ? startedAt : null,
    elapsedMs: clampInt(src.elapsedMs, 0, Number.MAX_SAFE_INTEGER, 0),
    laps,
  };
}

// --- Rechnen ------------------------------------------------------------------

// Bereits abgelaufene Zeit eines Timers (aufgelaufene plus die seit dem
// letzten Start vergangene).
function timerElapsed(timer, now) {
  const base = timer.elapsedMs;
  if (timer.state !== 'running' || timer.startedAt == null) return base;
  return base + Math.max(0, now - timer.startedAt);
}

// Restzeit in Millisekunden, nie negativ.
function timerRemaining(timer, now) {
  return Math.max(0, timer.durationMs - timerElapsed(timer, now));
}

// Ist der Timer jetzt durchgelaufen? 'expired' zaehlt bereits als gemeldet.
function timerIsDue(timer, now) {
  return timer.state === 'running' && timerRemaining(timer, now) <= 0;
}

// Fortschritt 0..1 fuer den Balken.
function timerProgress(timer, now) {
  if (timer.durationMs <= 0) return 0;
  return Math.min(1, timerElapsed(timer, now) / timer.durationMs);
}

// Vergangene Zeit der Stoppuhr.
function stopwatchElapsed(sw, now) {
  const base = sw.elapsedMs;
  if (sw.state !== 'running' || sw.startedAt == null) return base;
  return base + Math.max(0, now - sw.startedAt);
}

// --- Zustands-Uebergaenge (reine Funktionen, Eingabe bleibt unveraendert) -----

function startTimer(timer, now) {
  if (timer.state === 'running') return timer;
  // Ein abgelaufener oder fertig gelaufener Timer startet wieder von vorn.
  const wieder = timer.state === 'expired' || timerRemaining(timer, now) <= 0;
  return {
    ...timer,
    state: 'running',
    startedAt: now,
    elapsedMs: wieder ? 0 : timer.elapsedMs,
  };
}

function pauseTimer(timer, now) {
  if (timer.state !== 'running') return timer;
  return { ...timer, state: 'paused', startedAt: null, elapsedMs: timerElapsed(timer, now) };
}

function resetTimer(timer) {
  if (timer.state === 'idle' && timer.elapsedMs === 0) return timer;
  return { ...timer, state: 'idle', startedAt: null, elapsedMs: 0 };
}

// Abgelaufene Timer auf 'expired' setzen (der Pruefer meldet sie danach).
// Liefert die Eingabe-Referenz, wenn nichts zu tun ist.
function expireDueTimers(timers, now) {
  const list = normalizeTimers(timers);
  let changed = false;
  const next = list.map((timer) => {
    if (!timerIsDue(timer, now)) return timer;
    changed = true;
    return { ...timer, state: 'expired', startedAt: null, elapsedMs: timer.durationMs };
  });
  return changed ? next : timers;
}

// Zeitpunkt des naechsten Ablaufs (Millisekunden-Zeitstempel) oder null,
// wenn kein Timer laeuft. Grundlage des gezielten Weckrufs im Pruefer.
function nextExpiryAt(timers, now) {
  let earliest = null;
  for (const timer of normalizeTimers(timers)) {
    if (timer.state !== 'running') continue;
    const at = now + timerRemaining(timer, now);
    if (earliest == null || at < earliest) earliest = at;
  }
  return earliest;
}

function startStopwatch(sw, now) {
  if (sw.state === 'running') return sw;
  return { ...sw, state: 'running', startedAt: now };
}

function pauseStopwatch(sw, now) {
  if (sw.state !== 'running') return sw;
  return { ...sw, state: 'paused', startedAt: null, elapsedMs: stopwatchElapsed(sw, now) };
}

function resetStopwatch() {
  return { state: 'idle', startedAt: null, elapsedMs: 0, laps: [] };
}

// Runde nehmen: der aktuelle Stand kommt vorne in die Liste (juengste
// zuerst). Nur sinnvoll, solange die Uhr laeuft.
function lapStopwatch(sw, now) {
  if (sw.state !== 'running') return sw;
  return { ...sw, laps: [stopwatchElapsed(sw, now), ...sw.laps].slice(0, MAX_LAPS) };
}

// --- Formatierung -------------------------------------------------------------

// Dauer als 'MM:SS' bzw. 'H:MM:SS' ab einer Stunde. Aufgerundet, damit eine
// Restzeit von 4,2 Sekunden als 5 erscheint und die Anzeige nicht eine
// Sekunde zu frueh auf null springt.
function formatDuration(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

// Stoppuhr-Anzeige: Hauptteil und Hundertstel getrennt, damit die Oberflaeche
// beide unterschiedlich gross setzen kann.
function formatStopwatch(ms) {
  const total = Math.max(0, ms);
  const hundredths = Math.floor((total % 1000) / 10);
  const secs = Math.floor(total / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return {
    main: h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`,
    hundredths: pad2(hundredths),
  };
}

// Dauer aus Stunden, Minuten und Sekunden der Segment-Steuerung.
function durationFromParts(h, m, s) {
  const ms = (Number(h) || 0) * 3600000 + (Number(m) || 0) * 60000 + (Number(s) || 0) * 1000;
  return clampInt(ms, MIN_DURATION_MS, MAX_DURATION_MS, MIN_DURATION_MS);
}

// Umkehrung fuer die Vorbelegung der Steuerung.
function partsFromDuration(ms) {
  const total = Math.floor(clampInt(ms, 0, MAX_DURATION_MS, 0) / 1000);
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

module.exports = {
  CLOCK_TIMERS_KEY,
  CLOCK_STOPWATCH_KEY,
  TIMER_STATES,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  QUICK_MINUTES,
  MAX_LABEL_LENGTH,
  MAX_LAPS,
  normalizeTimer,
  normalizeTimers,
  nextTimerId,
  normalizeStopwatch,
  timerElapsed,
  timerRemaining,
  timerIsDue,
  timerProgress,
  stopwatchElapsed,
  startTimer,
  pauseTimer,
  resetTimer,
  expireDueTimers,
  nextExpiryAt,
  startStopwatch,
  pauseStopwatch,
  resetStopwatch,
  lapStopwatch,
  formatDuration,
  formatStopwatch,
  durationFromParts,
  partsFromDuration,
};
