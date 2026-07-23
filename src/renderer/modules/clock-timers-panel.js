// 4T-0638 (Epic 3E-0069): Timer und Stoppuhr der Uhr-Erweiterung im
// Renderer.
//
// Aufgaben:
// - Timer-Liste im Panel: Restzeit, Fortschrittsbalken, Start/Pause und
//   Zuruecksetzen je Zeile, Bearbeiten und Loeschen im Zeilen-Menue, dazu
//   die drei Schnellwahl-Knoepfe und „Eigene Dauer".
// - Stoppuhr: eine einzige (PO-Festlegung), grosse Zeit mit Hundertsteln,
//   Pause/Runde/Zuruecksetzen und die Rundenliste.
// - Anlege-Dialog mit eigener Segment-Steuerung fuer die Dauer (Stunden,
//   Minuten, Sekunden). Der vorhandene Uhrzeit-Picker taugt dafuer nicht:
//   er bildet HH:mm mit Uhrzeit-Semantik ab und kennt keine Sekunden.
// - Meldung abgelaufener Timer mit „Bestaetigen" und „Erneut starten".
//
// Eigener Anzeige-Takt, getrennt vom gemeinsamen Uhr-Takt in clock-panel.js:
// sekuendlich fuer laufende Timer, rund 50 Millisekunden fuer die laufende
// Stoppuhr (Hundertstel). Er laeuft nur, solange eine der beiden Ansichten
// sichtbar ist und tatsaechlich etwas laeuft; Panel schliessen, Modus-
// Wechsel und verstecktes Fenster raeumen ihn ab (Timer-Disziplin 4T-0372).
//
// Die Faelligkeit selbst prueft der Main (timer-check.js) mit einem
// gezielten Weckruf — unabhaengig davon, ob das Panel offen ist.
'use strict';

import { api, $ } from './api.js';
import { t } from '../i18n.js';
import { appendContextMenuItem, placeContextMenuAt } from './dialogs.js';
import { contextMenu } from './app-state.js';
import {
  CLOCK_STOPWATCH_KEY,
  CLOCK_TIMERS_KEY,
  MAX_LABEL_LENGTH,
  QUICK_MINUTES,
  durationFromParts,
  formatDuration,
  formatStopwatch,
  lapStopwatch,
  nextTimerId,
  normalizeStopwatch,
  normalizeTimers,
  partsFromDuration,
  pauseStopwatch,
  pauseTimer,
  resetStopwatch,
  resetTimer,
  startStopwatch,
  startTimer,
  stopwatchElapsed,
  timerProgress,
  timerRemaining,
} from '../../shared/clock-timers.js';

const STOPWATCH_TICK_MS = 50;
const TIMER_TICK_MS = 250;

// --- Zustand ------------------------------------------------------------------------

let timers = [];
let stopwatch = normalizeStopwatch(null);

export function getTimers() {
  return timers.map((x) => ({ ...x }));
}

export function getStopwatch() {
  return { ...stopwatch, laps: [...stopwatch.laps] };
}

export async function initTimersFromStore() {
  let storedTimers;
  let storedSw;
  try {
    storedTimers = await api.getSetting(CLOCK_TIMERS_KEY);
    storedSw = await api.getSetting(CLOCK_STOPWATCH_KEY);
  } catch {
    storedTimers = null;
    storedSw = null;
  }
  timers = normalizeTimers(storedTimers);
  stopwatch = normalizeStopwatch(storedSw);
  return { timers: getTimers(), stopwatch: getStopwatch() };
}

async function setTimers(next, opts = {}) {
  const normalized = normalizeTimers(next);
  if (JSON.stringify(normalized) === JSON.stringify(timers)) return;
  timers = normalized;
  document.dispatchEvent(new CustomEvent('scg:clock-timers-changed'));
  if (opts.persist !== false) await api.setSetting(CLOCK_TIMERS_KEY, normalized);
}

async function setStopwatch(next, opts = {}) {
  const normalized = normalizeStopwatch(next);
  if (JSON.stringify(normalized) === JSON.stringify(stopwatch)) return;
  stopwatch = normalized;
  // Kein Dokument-Event: die Stoppuhr-Ansicht aktualisiert sich ohnehin im
  // eigenen Takt, ein Neuaufbau wuerde nur flackern. Nur der Broadcast-
  // Empfang baut neu auf (dort kann sich der Zustand sprunghaft aendern).
  if (opts.persist !== false) await api.setSetting(CLOCK_STOPWATCH_KEY, normalized);
  ensureTick();
}

// --- Anzeige-Takt --------------------------------------------------------------------
// Gerenderte Ansichten pro Pane; erst dadurch weiss der Takt, ob es etwas
// zu aktualisieren gibt.
const views = [null, null];
let tickId = null;
let tickMode = null; // 'timer' | 'stopwatch'

export function clearTimerViews(paneIdx) {
  views[paneIdx] = null;
  ensureTick();
}

function anyStopwatchVisible() {
  return views.some((v) => v && v.kind === 'stopwatch' && v.root.isConnected);
}

function anyTimerVisible() {
  return views.some((v) => v && v.kind === 'timers' && v.root.isConnected);
}

function stopTick() {
  if (tickId != null) clearInterval(tickId);
  tickId = null;
  tickMode = null;
}

// Takt-Bedarf: die laufende Stoppuhr braucht den schnellen Takt, laufende
// Timer den langsamen. Nichts sichtbar oder nichts in Bewegung: kein Takt.
function wantedTickMode() {
  if (document.visibilityState === 'hidden') return null;
  if (anyStopwatchVisible() && stopwatch.state === 'running') return 'stopwatch';
  if (anyTimerVisible() && timers.some((x) => x.state === 'running')) return 'timer';
  return null;
}

function ensureTick() {
  const wanted = wantedTickMode();
  if (!wanted) {
    stopTick();
    return;
  }
  if (tickMode === wanted && tickId != null) return;
  stopTick();
  tickMode = wanted;
  tickId = setInterval(paintAll, wanted === 'stopwatch' ? STOPWATCH_TICK_MS : TIMER_TICK_MS);
}

function paintAll() {
  const now = Date.now();
  for (const view of views) {
    if (!view || !view.root.isConnected) continue;
    if (view.kind === 'timers') paintTimers(view, now);
    else paintStopwatch(view, now);
  }
}

// --- Timer-Liste ----------------------------------------------------------------------

export function buildTimersView(body, paneIdx) {
  const root = document.createElement('div');
  root.className = 'timer-list';
  body.appendChild(root);
  const rows = new Map();

  if (timers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'clock-placeholder';
    empty.textContent = t('clock.timer.empty');
    root.appendChild(empty);
  }
  for (const timer of timers) {
    rows.set(timer.id, buildTimerRow(root, timer));
  }

  // Schnellwahl: startet sofort einen neuen Timer mit fester Dauer.
  const quick = document.createElement('div');
  quick.className = 'timer-quick';
  for (const minutes of QUICK_MINUTES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'timer-quick-btn';
    btn.textContent = t('clock.timer.quick').replace('{n}', String(minutes));
    btn.addEventListener('click', () => {
      void addTimer({ durationMs: minutes * 60000, label: '', start: true });
    });
    quick.appendChild(btn);
  }
  body.appendChild(quick);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'alarm-add-btn';
  add.textContent = t('clock.timer.custom');
  add.addEventListener('click', () => {
    void addCustomTimer();
  });
  body.appendChild(add);

  views[paneIdx] = { kind: 'timers', root, rows };
  paintTimers(views[paneIdx], Date.now());
  ensureTick();
}

function buildTimerRow(root, timer) {
  const row = document.createElement('div');
  row.className = 'timer-row';
  row.dataset.timerId = timer.id;

  const head = document.createElement('div');
  head.className = 'timer-row-head';
  const time = document.createElement('div');
  time.className = 'timer-row-time';
  const label = document.createElement('div');
  label.className = 'timer-row-label';
  head.appendChild(time);
  head.appendChild(label);
  row.appendChild(head);

  const bar = document.createElement('div');
  bar.className = 'timer-bar';
  const fill = document.createElement('span');
  bar.appendChild(fill);
  row.appendChild(bar);

  const actions = document.createElement('div');
  actions.className = 'timer-actions';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'timer-action';
  toggle.addEventListener('click', () => {
    void toggleTimer(timer.id);
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'timer-action secondary';
  reset.textContent = t('clock.timer.reset');
  reset.addEventListener('click', () => {
    void updateTimer(timer.id, (x) => resetTimer(x));
  });
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'alarm-row-menu';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', t('clock.timer.rowMenu'));
  menu.title = t('clock.timer.rowMenu');
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    showTimerRowMenu(timer.id, e.clientX, e.clientY);
  });
  actions.append(toggle, reset, menu);
  row.appendChild(actions);
  root.appendChild(row);
  return { row, time, label, fill, toggle };
}

// Ein Tick: nur Textinhalte und Balkenbreite, kein DOM-Neuaufbau.
function paintTimers(view, now) {
  for (const timer of timers) {
    const refs = view.rows.get(timer.id);
    if (!refs) continue;
    refs.time.textContent = formatDuration(timerRemaining(timer, now));
    const zustand = t(`clock.timer.state.${timer.state}`);
    refs.label.textContent = timer.label ? `${timer.label} · ${zustand}` : zustand;
    refs.label.title = refs.label.textContent;
    refs.fill.style.width = `${Math.round(timerProgress(timer, now) * 100)}%`;
    refs.toggle.textContent = t(
      timer.state === 'running' ? 'clock.timer.pause' : 'clock.timer.start',
    );
    refs.row.classList.toggle('running', timer.state === 'running');
    refs.row.classList.toggle('expired', timer.state === 'expired');
  }
}

async function updateTimer(id, fn) {
  const now = Date.now();
  await setTimers(timers.map((x) => (x.id === id ? fn(x, now) : x)));
}

async function toggleTimer(id) {
  const now = Date.now();
  const current = timers.find((x) => x.id === id);
  if (!current) return;
  await setTimers(
    timers.map((x) =>
      x.id === id ? (x.state === 'running' ? pauseTimer(x, now) : startTimer(x, now)) : x,
    ),
  );
}

async function addTimer({ durationMs, label, start }) {
  const now = Date.now();
  const timer = {
    id: nextTimerId(timers),
    label: label || '',
    durationMs,
    state: 'idle',
    startedAt: null,
    elapsedMs: 0,
  };
  await setTimers([...timers, start ? startTimer(timer, now) : timer]);
}

async function addCustomTimer() {
  const result = await showTimerDialog(null);
  if (!result) return;
  await addTimer({ durationMs: result.durationMs, label: result.label, start: true });
}

function showTimerRowMenu(id, x, y) {
  contextMenu.innerHTML = '';
  appendContextMenuItem(contextMenu, {
    key: 'clock.timer.edit',
    action: async () => {
      const current = timers.find((tt) => tt.id === id);
      if (!current) return;
      const result = await showTimerDialog(current);
      if (!result) return;
      // Eine geaenderte Dauer setzt den Lauf zurueck; alles andere waere
      // rechnerisch mehrdeutig (Restzeit gegen neue Dauer).
      await setTimers(
        timers.map((tt) =>
          tt.id === id
            ? { ...resetTimer(tt), durationMs: result.durationMs, label: result.label }
            : tt,
        ),
      );
    },
  });
  appendContextMenuItem(contextMenu, {
    key: 'clock.timer.delete',
    action: () => {
      void setTimers(timers.filter((tt) => tt.id !== id));
    },
  });
  placeContextMenuAt(contextMenu, x, y);
}

// --- Stoppuhr ------------------------------------------------------------------------

export function buildStopwatchView(body, paneIdx) {
  const root = document.createElement('div');
  root.className = 'stopwatch-view';
  body.appendChild(root);

  const display = document.createElement('div');
  display.className = 'stopwatch-display';
  const main = document.createElement('span');
  main.className = 'stopwatch-main';
  const hundredths = document.createElement('span');
  hundredths.className = 'stopwatch-hundredths';
  display.append(main, hundredths);
  root.appendChild(display);

  const actions = document.createElement('div');
  actions.className = 'stopwatch-actions';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'timer-action';
  toggle.addEventListener('click', () => {
    const now = Date.now();
    void setStopwatch(
      stopwatch.state === 'running'
        ? pauseStopwatch(stopwatch, now)
        : startStopwatch(stopwatch, now),
    );
  });
  const lap = document.createElement('button');
  lap.type = 'button';
  lap.className = 'timer-action secondary';
  lap.textContent = t('clock.stopwatch.lap');
  lap.addEventListener('click', () => {
    void setStopwatch(lapStopwatch(stopwatch, Date.now())).then(() => rebuildLaps(view));
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'timer-action secondary';
  reset.textContent = t('clock.timer.reset');
  reset.addEventListener('click', () => {
    void setStopwatch(resetStopwatch()).then(() => rebuildLaps(view));
  });
  actions.append(toggle, lap, reset);
  root.appendChild(actions);

  const lapsEl = document.createElement('div');
  lapsEl.className = 'stopwatch-laps';
  root.appendChild(lapsEl);

  const view = { kind: 'stopwatch', root, main, hundredths, toggle, lap, lapsEl };
  views[paneIdx] = view;
  rebuildLaps(view);
  paintStopwatch(view, Date.now());
  ensureTick();
}

function rebuildLaps(view) {
  if (!view || !view.lapsEl) return;
  view.lapsEl.innerHTML = '';
  stopwatch.laps.forEach((ms, i) => {
    const row = document.createElement('div');
    row.className = 'stopwatch-lap';
    const name = document.createElement('span');
    name.textContent = t('clock.stopwatch.lapNumber').replace(
      '{n}',
      String(stopwatch.laps.length - i),
    );
    const value = document.createElement('span');
    const parts = formatStopwatch(ms);
    value.className = 'stopwatch-lap-time';
    value.textContent = `${parts.main}.${parts.hundredths}`;
    row.append(name, value);
    view.lapsEl.appendChild(row);
  });
}

function paintStopwatch(view, now) {
  const parts = formatStopwatch(stopwatchElapsed(stopwatch, now));
  view.main.textContent = parts.main;
  view.hundredths.textContent = `.${parts.hundredths}`;
  view.toggle.textContent = t(
    stopwatch.state === 'running' ? 'clock.timer.pause' : 'clock.timer.start',
  );
  view.lap.disabled = stopwatch.state !== 'running';
}

// --- Dauer-Dialog ---------------------------------------------------------------------

// Segment-Steuerung fuer Stunden, Minuten und Sekunden. Pfeiltasten und die
// beiden Stepper aendern das fokussierte Segment; Ziffern-Eingabe schiebt
// von rechts nach. Ungueltige Werte sind konstruktionsbedingt unmoeglich.
function buildDurationControl(container, initial) {
  const parts = partsFromDuration(initial);
  const state = { hours: parts.hours, minutes: parts.minutes, seconds: parts.seconds };
  const limits = { hours: 23, minutes: 59, seconds: 59 };
  const order = ['hours', 'minutes', 'seconds'];
  let focused = 'minutes';
  container.innerHTML = '';

  const segs = {};
  order.forEach((name, i) => {
    if (i > 0) {
      const colon = document.createElement('span');
      colon.className = 'timer-duration-colon';
      colon.textContent = ':';
      container.appendChild(colon);
    }
    const seg = document.createElement('span');
    seg.className = 'timer-duration-seg';
    seg.tabIndex = 0;
    seg.dataset.seg = name;
    seg.setAttribute('role', 'spinbutton');
    seg.setAttribute('aria-label', t(`clock.timer.unit.${name}`));
    seg.addEventListener('focus', () => {
      focused = name;
    });
    seg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        step(-1);
      } else if (/^\d$/.test(e.key)) {
        e.preventDefault();
        const next = (state[name] % 10) * 10 + Number(e.key);
        state[name] = Math.min(limits[name], next);
        paint();
      }
    });
    segs[name] = seg;
    container.appendChild(seg);
  });

  const steppers = document.createElement('span');
  steppers.className = 'timer-duration-steppers';
  for (const [dir, symbol, key] of [
    [1, '▲', 'clock.timer.stepUp'],
    [-1, '▼', 'clock.timer.stepDown'],
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn timer-duration-step';
    btn.textContent = symbol;
    btn.setAttribute('aria-label', t(key));
    btn.title = t(key);
    btn.addEventListener('click', () => step(dir));
    steppers.appendChild(btn);
  }
  container.appendChild(steppers);

  function step(dir) {
    const max = limits[focused];
    state[focused] = (state[focused] + dir + (max + 1)) % (max + 1);
    paint();
    segs[focused].focus();
  }

  function paint() {
    for (const name of order) {
      segs[name].textContent = String(state[name]).padStart(2, '0');
      segs[name].setAttribute('aria-valuenow', String(state[name]));
    }
  }

  paint();
  return {
    value: () => durationFromParts(state.hours, state.minutes, state.seconds),
    focus: () => segs.minutes.focus(),
  };
}

// Dialog fuer Anlegen und Bearbeiten. Ergebnis: { durationMs, label } oder
// null bei Abbruch.
export function showTimerDialog(existing) {
  const modal = $('#timer-modal');
  const titleEl = $('#timer-modal-title');
  const durationEl = $('#timer-duration');
  const labelInput = $('#timer-label');
  const btnOk = $('#btn-timer-ok');
  const btnCancel = $('#btn-timer-cancel');
  if (!modal || !durationEl || !labelInput) return Promise.resolve(null);

  return new Promise((resolve) => {
    titleEl.textContent = t(
      existing ? 'clock.timer.dialog.titleEdit' : 'clock.timer.dialog.titleNew',
    );
    labelInput.value = existing && existing.label ? existing.label : '';
    labelInput.placeholder = t('clock.timer.labelPlaceholder');
    labelInput.maxLength = MAX_LABEL_LENGTH;
    btnOk.textContent = t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');
    const control = buildDurationControl(durationEl, existing ? existing.durationMs : 5 * 60000);

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onOk = () => finish({ durationMs: control.value(), label: labelInput.value.trim() });
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => control.focus(), 0);
  });
}

// --- Meldung abgelaufener Timer -------------------------------------------------------

const pendingDue = new Map();
let dueOpen = false;

function renderDueList(listEl) {
  listEl.innerHTML = '';
  for (const item of pendingDue.values()) {
    const row = document.createElement('div');
    row.className = 'alarm-due-row';
    const time = document.createElement('div');
    time.className = 'alarm-due-time';
    time.textContent = formatDuration(item.durationMs);
    const label = document.createElement('div');
    label.className = 'alarm-due-label';
    label.textContent = item.label || t('clock.timer.due.noLabel');
    row.append(time, label);
    listEl.appendChild(row);
  }
}

function showDueDialog() {
  const modal = $('#timer-due-modal');
  const listEl = $('#timer-due-list');
  const btnRestart = $('#btn-timer-restart');
  const btnConfirm = $('#btn-timer-confirm');
  if (!modal || !listEl || dueOpen) return;
  dueOpen = true;
  btnRestart.textContent = t('clock.timer.due.restart');
  btnConfirm.textContent = t('clock.alarm.due.confirm');
  renderDueList(listEl);

  const finish = async (restart) => {
    const ids = [...pendingDue.keys()];
    pendingDue.clear();
    modal.hidden = true;
    dueOpen = false;
    modal.removeEventListener('keydown', onKeydown, true);
    btnRestart.removeEventListener('click', onRestart);
    btnConfirm.removeEventListener('click', onConfirm);
    backdrop.removeEventListener('click', onConfirm);
    const now = Date.now();
    await setTimers(
      timers.map((timer) => {
        if (!ids.includes(timer.id)) return timer;
        return restart ? startTimer(timer, now) : resetTimer(timer);
      }),
    );
  };
  const onRestart = () => void finish(true);
  const onConfirm = () => void finish(false);
  const onKeydown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onConfirm();
    }
  };
  const backdrop = modal.querySelector('.bookmark-modal-backdrop');

  modal.addEventListener('keydown', onKeydown, true);
  btnRestart.addEventListener('click', onRestart);
  btnConfirm.addEventListener('click', onConfirm);
  backdrop.addEventListener('click', onConfirm);
  modal.hidden = false;
  setTimeout(() => btnConfirm.focus(), 0);
}

function onTimerDue(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return;
  for (const item of items) pendingDue.set(item.id, item);
  if (!document.hasFocus() && typeof api.systemNotify === 'function') {
    const first = items[0];
    void api.systemNotify({
      title: t('clock.timer.due.title'),
      body: first.label || formatDuration(first.durationMs),
    });
  }
  if (dueOpen) {
    const listEl = $('#timer-due-list');
    if (listEl) renderDueList(listEl);
    return;
  }
  showDueDialog();
}

// --- Init -----------------------------------------------------------------------------

export function initClockTimers() {
  if (typeof api.onTimerDue === 'function') api.onTimerDue(onTimerDue);
  if (typeof api.onClockTimersChanged === 'function') {
    api.onClockTimersChanged((list) => {
      void setTimers(list, { persist: false });
    });
  }
  if (typeof api.onClockStopwatchChanged === 'function') {
    api.onClockStopwatchChanged((sw) => {
      void setStopwatch(sw, { persist: false });
      document.dispatchEvent(new CustomEvent('scg:clock-stopwatch-changed'));
    });
  }
  // Verstecktes Fenster: Takt abraeumen, beim Zurueckkommen sofort zeichnen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopTick();
      return;
    }
    paintAll();
    ensureTick();
  });
}
