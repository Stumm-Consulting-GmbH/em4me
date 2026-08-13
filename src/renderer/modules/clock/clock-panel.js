// 4T-0372 (Epic 3E-0069): Uhr-Panel — analoge Uhr, digitale Zeit, Datum und
// optional die Kalenderwoche in der Sidebar.
//
// Aufbau pro Pane: eine SVG-Zeichnung (Zifferblatt aus Theme-Variablen,
// damit der Hell/Dunkel-Wechsel ohne Neuzeichnen mitgeht) plus zwei bis drei
// Textzeilen. Das Zifferblatt wird nur bei Options-Aenderung neu gebaut, im
// Sekunden- bzw. Minuten-Takt aendern sich ausschliesslich die Zeiger-
// Transformationen und die Textinhalte (kein DOM-Neuaufbau pro Tick).
//
// Timer-Disziplin (Akzeptanzkriterium des Tasks): EIN gemeinsamer Timer fuer
// beide Panes. Er laeuft nur, wenn die Erweiterung aktiv ist, mindestens ein
// Panel sichtbar ist und das Fenster sichtbar ist; der Takt ist sekuendlich
// nur bei sekundengenauer Anzeige, sonst minuetlich auf die Minutengrenze
// ausgerichtet. Deaktivieren der Erweiterung, Ausblenden des Panels und
// Verstecken des Fensters raeumen ihn ab.
//
// Rechen-Kern und Optionen-Normalisierung liegen prozessneutral in
// src/shared/clock/clock-options.js (unit-testbar ohne DOM).
'use strict';

import { getLanguage, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { persistSetting, updateEmptyState } from '../views/views.js';
import { attachExtensionRuntime, isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  CLOCK_MODES,
  CLOCK_OPTIONS_KEY,
  analogSizePx,
  clampCalendarYear,
  clockModeKey,
  clockScale,
  currentMonthView,
  formatClockDate,
  formatClockTime,
  handAngles,
  isoWeekNumber,
  needsSecondTick,
  normalizeClockMode,
  normalizeClockOptions,
  normalizeMonthView,
  shiftMonthView,
} from '../../../shared/clock/clock-options.js';
// 4T-0752 (Epic 3E-0146): gemeinsamer Gitter-Aufbau, geteilt mit dem
// Kalender-Panel der Journale und der Datums-Eingabe.
import { createDayCell, monthLabel, renderMonthGrid } from '../calendar/month-grid-view.js';
import { msToIsoDate } from '../../../shared/journal-core.js';
import { COMMAND_ICONS } from '../../../shared/commands/command-icons.js';
// 4T-0637 (Epic 3E-0069): Wecker-Modus. Einseitiger Import — das Wecker-
// Modul kennt clock-panel.js nicht (Options-Zugriff wird angehaengt).
import { attachClockOptions, buildAlarmsView, initClockAlarms } from './clock-alarms-panel.js';
// 4T-0638 (Epic 3E-0069): Timer- und Stoppuhr-Modus. Ebenfalls einseitig;
// das Modul haelt seinen eigenen Anzeige-Takt.
import {
  buildStopwatchView,
  buildTimersView,
  clearTimerViews,
  initClockTimers,
} from './clock-timers-panel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 4T-0636 (Epic 3E-0069): Icon der Modus-Taste. Uhr und Wecker greifen auf
// vorhandene Eintraege zurueck, Timer und Stoppuhr auf die beiden mit diesem
// Task ergaenzten. Das Wecker-Symbol ist bewusst die Glocke und nicht die
// Weckuhr — letztere ist bereits das Statusbar-Icon der Erinnerungen.
const MODE_ICONS = {
  clock: 'clock',
  alarm: 'bell',
  timer: 'hourglass',
  stopwatch: 'stopwatch',
  // 4T-0752 (Epic 3E-0146): Monatskalender. Das Kalender-Symbol ist im
  // kuratierten Satz vorhanden und wird sonst nirgends im Panel benutzt.
  calendar: 'calendar',
};

// --- Optionen-Zustand ------------------------------------------------------------
// Laufzeit-Wahrheit des Fensters; bis initClockOptionsFromStore gelaufen ist
// gelten die Defaults (normalizeClockOptions liefert sie fuer undefined).
let clockOptions = normalizeClockOptions(null);

export function getClockOptions() {
  return { ...clockOptions };
}

export async function initClockOptionsFromStore() {
  let stored;
  try {
    stored = await api.getSetting(CLOCK_OPTIONS_KEY);
  } catch {
    stored = null;
  }
  clockOptions = normalizeClockOptions(stored);
  return getClockOptions();
}

// Optionen setzen — normalisiert, baut die sichtbaren Panels neu auf,
// benachrichtigt offene Einstellungs-Entwuerfe und persistiert.
// persist:false fuer den Empfang des Fenster-Broadcasts (clock:changed),
// damit der Store nicht doppelt geschrieben wird; ein unveraenderter Stand
// ist ein No-op (Muster setFormatToolbar/setPanelToggleOrder).
export async function setClockOptions(next, opts = {}) {
  const normalized = normalizeClockOptions(next);
  const changed = JSON.stringify(normalized) !== JSON.stringify(clockOptions);
  if (changed) {
    clockOptions = normalized;
    rebuildAllClockPanels();
    document.dispatchEvent(new CustomEvent('scg:clock-options-changed'));
    if (opts.persist !== false) await persistSetting(CLOCK_OPTIONS_KEY, normalized);
  }
  return getClockOptions();
}

// --- Modus-Zustand (4T-0636) ------------------------------------------------------
// Der Modus gilt pro Sidebar-Spalte (PO-Festlegung 2026-07-20): links die Uhr
// und rechts der Timer sind damit gleichzeitig moeglich. Laufzeit-Wahrheit ist
// state.clock.modeByPane, Persistenz laeuft ueber clockPanel.modeColumn0/1.

export function getClockMode(paneIdx) {
  return normalizeClockMode(state.clock && state.clock.modeByPane[paneIdx]);
}

// Modus setzen: normalisieren, Panel neu aufbauen, Takt nachziehen und
// persistieren. Ein unveraenderter Modus ist ein No-op (Muster
// setClockOptions).
export async function setClockMode(paneIdx, mode) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = normalizeClockMode(mode);
  if (state.clock.modeByPane[paneIdx] === next) return;
  state.clock.modeByPane[paneIdx] = next;
  rendered[paneIdx] = null;
  renderClockPanel(paneIdx);
  ensureClockTimer();
  const key = clockModeKey(paneIdx);
  if (key) await persistSetting(key, next);
}

// --- Zeichnen ---------------------------------------------------------------------
// Gerenderte Element-Referenzen pro Pane. sweepOffset haelt den fortlaufend
// aufaddierten Zusatz-Winkel des Sekundenzeigers: bei gleitender Bewegung
// laeuft der Winkel monoton weiter (statt bei 60 auf 0 zurueckzuspringen),
// sodass die CSS-Transition nicht rueckwaerts animiert.
const rendered = [null, null];

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// Punkt auf dem Zifferblatt: Winkel in Grad (0 = 12 Uhr), Radius in
// viewBox-Einheiten um den Mittelpunkt (50, 50).
function polar(angleDeg, radius) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

function buildDial(svg, options) {
  svg.appendChild(svgEl('circle', { class: 'clock-dial', cx: 50, cy: 50, r: 47 }));
  if (options.dial === 'plain') return;
  const numbers =
    options.dial === 'numbers'
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : options.dial === 'quarters'
        ? [3, 6, 9, 12]
        : [];
  for (let i = 1; i <= 12; i++) {
    const angle = i * 30;
    if (numbers.includes(i)) {
      const p = polar(angle, 36);
      const text = svgEl('text', {
        class: 'clock-number',
        x: p.x,
        y: p.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      text.textContent = String(i);
      svg.appendChild(text);
      continue;
    }
    // Stunden-Strich an allen Positionen ohne Ziffer; bei 'numbers' bleibt
    // das Zifferblatt bewusst strichfrei (sonst wird es unruhig).
    if (options.dial === 'numbers') continue;
    const outer = polar(angle, 43);
    const inner = polar(angle, 38);
    svg.appendChild(
      svgEl('line', {
        class: 'clock-tick',
        x1: outer.x,
        y1: outer.y,
        x2: inner.x,
        y2: inner.y,
      }),
    );
  }
}

// 4T-0636: Leiste der vier Modus-Tasten. Wird bei jedem Panel-Aufbau frisch
// erzeugt (vier Knoepfe sind billig) — damit ziehen Sprach-Wechsel und
// Modus-Wechsel ohne getrennten Aktualisierungs-Pfad mit. Ohne Text-Label
// sind Tooltip und aria-label Pflicht.
function buildModeBar(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.clockModes) return;
  const bar = els.clockModes;
  bar.innerHTML = '';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('clock.modes.groupLabel'));
  const active = getClockMode(paneIdx);
  for (const mode of CLOCK_MODES) {
    const label = t(`clock.mode.${mode}`);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clock-mode-btn';
    btn.dataset.clockMode = mode;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', mode === active ? 'true' : 'false');
    if (mode === active) btn.classList.add('active');
    btn.innerHTML = COMMAND_ICONS[MODE_ICONS[mode]];
    btn.addEventListener('click', () => {
      void setClockMode(paneIdx, mode);
    });
    bar.appendChild(btn);
  }
}

// Baut die gesamte Panel-Struktur neu auf (Options-Aenderung, Modus-Wechsel,
// Sprach-Wechsel, erstes Einblenden) und liefert die Referenzen fuer die
// Ticks. Je Modus eine Aufbau-Funktion; die drei Modi ausserhalb der Uhr
// zeigen bis zu ihrer Umsetzung (4T-0637, 4T-0638) einen neutralen Hinweis.
function buildClock(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.clockBody) return null;
  const options = clockOptions;
  const mode = getClockMode(paneIdx);
  const body = els.clockBody;
  body.innerHTML = '';
  // 4T-0679 (Epic 3E-0139): Schrift-Faktor der Groessen-Stufe am
  // Panel-Koerper. Steht vor den Modus-Verzweigungen, damit der Wert in
  // jedem Modus aktuell ist; ausgewertet wird er nur von den drei
  // Textzeilen der Uhr (styles.css).
  body.style.setProperty('--clock-scale', String(clockScale(options)));
  buildModeBar(paneIdx);

  const refs = { options, mode, hour: null, minute: null, second: null, digital: null, date: null };
  refs.week = null;

  // 4T-0638: Referenzen des Timer-/Stoppuhr-Moduls fuer diese Pane
  // freigeben — der dortige Anzeige-Takt haengt daran.
  clearTimerViews(paneIdx);
  if (mode === 'alarm') {
    // 4T-0637: Wecker-Liste samt Anlege-Knopf; die Faelligkeits-Pruefung
    // laeuft unabhaengig davon im Main weiter.
    buildAlarmsView(body, getLanguage());
    rendered[paneIdx] = refs;
    return refs;
  }
  if (mode === 'timer') {
    buildTimersView(body, paneIdx);
    rendered[paneIdx] = refs;
    return refs;
  }
  if (mode === 'stopwatch') {
    buildStopwatchView(body, paneIdx);
    rendered[paneIdx] = refs;
    return refs;
  }
  if (mode === 'calendar') {
    // 4T-0752: Monatskalender zum Nachschlagen. Der angezeigte Tag wird beim
    // Takt gegen den heutigen geprueft (siehe paintCalendar), deshalb haelt
    // refs den gezeichneten Stand.
    refs.calendar = buildCalendarView(body, paneIdx);
    rendered[paneIdx] = refs;
    return refs;
  }

  if (options.showAnalog) {
    const size = analogSizePx(options);
    const svg = svgEl('svg', {
      class: 'clock-face',
      viewBox: '0 0 100 100',
      width: size,
      height: size,
      role: 'img',
      'aria-hidden': 'true',
    });
    svg.style.maxWidth = '100%';
    buildDial(svg, options);
    refs.hour = svgEl('line', {
      class: 'clock-hand clock-hand-hour',
      x1: 50,
      y1: 50,
      x2: 50,
      y2: 27,
    });
    refs.minute = svgEl('line', {
      class: 'clock-hand clock-hand-minute',
      x1: 50,
      y1: 50,
      x2: 50,
      y2: 17,
    });
    svg.appendChild(refs.hour);
    svg.appendChild(refs.minute);
    if (options.secondHand) {
      refs.second = svgEl('line', {
        class: 'clock-hand clock-hand-second',
        x1: 50,
        y1: 57,
        x2: 50,
        y2: 13,
      });
      // Gleitende Bewegung ueber eine CSS-Transition statt eines
      // Animations-Frames (Energie-Ruecksicht); der Winkel laeuft dafuer
      // monoton weiter, siehe sweepOffset.
      if (options.secondMotion === 'sweep') refs.second.classList.add('sweep');
      svg.appendChild(refs.second);
    }
    svg.appendChild(svgEl('circle', { class: 'clock-center', cx: 50, cy: 50, r: 2.4 }));
    body.appendChild(svg);
  }

  if (options.showDigital) {
    refs.digital = document.createElement('div');
    refs.digital.className = 'clock-digital';
    body.appendChild(refs.digital);
  }
  if (options.showDate) {
    refs.date = document.createElement('div');
    refs.date.className = 'clock-date';
    body.appendChild(refs.date);
  }
  if (options.showWeek) {
    refs.week = document.createElement('div');
    refs.week.className = 'clock-week';
    body.appendChild(refs.week);
  }

  refs.sweepOffset = 0;
  refs.lastSecondAngle = null;
  rendered[paneIdx] = refs;
  return refs;
}

// --- Kalender-Modus (4T-0752) -----------------------------------------------------
//
// Angezeigter Monat je Sidebar-Spalte als Bedien-Zustand ohne Persistenz
// (Muster state.calendar.monthByPane des Journal-Kalenders): Beim Oeffnen
// steht der laufende Monat. Das Gitter selbst kommt aus dem gemeinsamen
// Modul month-grid-view.js; hier stehen Navigation und Jahres-Eingabe.

function shownMonthView(paneIdx) {
  const stored = state.clock && state.clock.monthByPane[paneIdx];
  return stored ? normalizeMonthView(stored) : currentMonthView();
}

function navButton(text, titleKey, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'clock-cal-nav-btn';
  btn.textContent = text;
  btn.title = t(titleKey);
  btn.setAttribute('aria-label', t(titleKey));
  btn.addEventListener('click', onClick);
  return btn;
}

// Jahres-Eingabe als vier Ziffern-Stellen (Muster der Uhrzeit-Steuerung im
// Datums-Picker): Pfeiltasten stellen die aktive Stelle, Links/Rechts
// wechseln sie, Ziffern setzen direkt und ruecken weiter. Nach jeder
// Aenderung wird das Ergebnis auf den gueltigen Bereich geklemmt, sodass ein
// ungueltiges Jahr gar nicht erst darstellbar ist (Oberflaechen-Leitlinie:
// Fehleingaben konstruktiv unmoeglich statt abgewiesen).
function buildYearEditor(getYear, onCommit, onCancel) {
  const wrap = document.createElement('div');
  wrap.className = 'clock-cal-year';
  wrap.hidden = true;
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', t('clock.calendar.yearGroup'));

  let digits = [0, 0, 0, 0];
  let active = 0;
  const cells = [];

  const paint = () => {
    cells.forEach((cell, idx) => {
      cell.textContent = String(digits[idx]);
      cell.classList.toggle('active', idx === active);
    });
  };

  const yearFromDigits = () => digits[0] * 1000 + digits[1] * 100 + digits[2] * 10 + digits[3];

  // Klemmung nach jeder Aenderung: das angezeigte Jahr ist damit immer
  // gueltig, und die Stellen zeigen genau den geklemmten Wert.
  const clampDigits = () => {
    const clamped = clampCalendarYear(yearFromDigits());
    digits = String(clamped).padStart(4, '0').split('').map(Number);
  };

  const setActive = (idx) => {
    active = Math.max(0, Math.min(3, idx));
    paint();
    cells[active].focus();
  };

  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('span');
    cell.className = 'clock-cal-year-digit';
    cell.tabIndex = 0;
    cell.addEventListener('click', () => setActive(i));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        digits[i] = (digits[i] + (e.key === 'ArrowUp' ? 1 : -1) + 10) % 10;
        clampDigits();
        paint();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setActive(i + (e.key === 'ArrowRight' ? 1 : -1));
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        digits[i] = Number(e.key);
        clampDigits();
        paint();
        if (i < 3) setActive(i + 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommit(yearFromDigits());
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    });
    cells.push(cell);
    wrap.appendChild(cell);
  }

  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'clock-cal-year-ok';
  ok.textContent = '✓';
  ok.title = t('clock.calendar.yearApply');
  ok.setAttribute('aria-label', t('clock.calendar.yearApply'));
  ok.addEventListener('click', () => onCommit(yearFromDigits()));
  wrap.appendChild(ok);

  return {
    el: wrap,
    open() {
      digits = String(clampCalendarYear(getYear())).padStart(4, '0').split('').map(Number);
      wrap.hidden = false;
      setActive(0);
    },
    close() {
      wrap.hidden = true;
    },
    isOpen() {
      return !wrap.hidden;
    },
  };
}

function buildCalendarView(body, paneIdx) {
  const options = clockOptions;
  const wrap = document.createElement('div');
  wrap.className = 'clock-calendar';

  const nav = document.createElement('div');
  nav.className = 'clock-calendar-nav';

  const shift = (delta) => {
    state.clock.monthByPane[paneIdx] = shiftMonthView(shownMonthView(paneIdx), delta);
    view.render();
  };

  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'clock-cal-label';
  label.title = t('clock.calendar.editYear');
  label.addEventListener('click', () => {
    if (yearEditor.isOpen()) {
      yearEditor.close();
      return;
    }
    yearEditor.open();
  });

  nav.appendChild(navButton('«', 'clock.calendar.prevYear', () => shift({ years: -1 })));
  nav.appendChild(navButton('‹', 'clock.calendar.prevMonth', () => shift({ months: -1 })));
  nav.appendChild(label);
  nav.appendChild(navButton('›', 'clock.calendar.nextMonth', () => shift({ months: 1 })));
  nav.appendChild(navButton('»', 'clock.calendar.nextYear', () => shift({ years: 1 })));
  wrap.appendChild(nav);

  const yearEditor = buildYearEditor(
    () => shownMonthView(paneIdx).year,
    (year) => {
      const current = shownMonthView(paneIdx);
      state.clock.monthByPane[paneIdx] = {
        year: clampCalendarYear(year),
        monthIndex: current.monthIndex,
      };
      yearEditor.close();
      view.render();
    },
    () => yearEditor.close(),
  );
  wrap.appendChild(yearEditor.el);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid clock-calendar-grid';
  if (!options.showCalendarWeek) grid.classList.add('no-week-col');
  wrap.appendChild(grid);

  const today = document.createElement('button');
  today.type = 'button';
  today.className = 'clock-cal-today';
  today.textContent = t('clock.calendar.today');
  today.addEventListener('click', () => {
    state.clock.monthByPane[paneIdx] = null;
    yearEditor.close();
    view.render();
  });
  wrap.appendChild(today);

  body.appendChild(wrap);

  const view = {
    todayIso: msToIsoDate(Date.now()),
    render() {
      const shown = shownMonthView(paneIdx);
      label.textContent = monthLabel(shown.year, shown.monthIndex);
      renderMonthGrid(grid, {
        year: shown.year,
        monthIndex: shown.monthIndex,
        weekColumnLabel: t('calendar.weekColumn'),
        showWeekColumn: options.showCalendarWeek,
        // Tage sind bewusst reine Anzeige: Der Uhr-Kalender ist ein
        // Nachschlage-Mittel, Journale und Termine liegen ausserhalb.
        dayCell: (day) =>
          createDayCell(day, { todayIso: view.todayIso, as: 'span', className: 'clock-cal-day' }),
      });
    },
    // Ein ueber Mitternacht offenes Panel zeigte sonst den falschen Tag als
    // heute; neu gezeichnet wird nur beim Tages-Wechsel.
    refreshToday(now) {
      const iso = msToIsoDate(now.getTime());
      if (iso === view.todayIso) return;
      view.todayIso = iso;
      view.render();
    },
  };
  view.render();
  return view;
}

// Ein Tick: nur Zeiger-Transformationen und Textinhalte. In den uebrigen
// Modi gibt es nichts zu zeichnen (4T-0636), ausser dem Tages-Wechsel des
// Kalenders (4T-0752).
function paintClock(paneIdx, now) {
  const refs = rendered[paneIdx];
  if (!refs) return;
  if (refs.mode === 'calendar') {
    if (refs.calendar) refs.calendar.refreshToday(now);
    return;
  }
  if (refs.mode !== 'clock') return;
  const options = refs.options;
  if (refs.hour || refs.minute || refs.second) {
    const angles = handAngles(now, options);
    if (refs.hour) refs.hour.setAttribute('transform', `rotate(${angles.hour} 50 50)`);
    if (refs.minute) refs.minute.setAttribute('transform', `rotate(${angles.minute} 50 50)`);
    if (refs.second) {
      // Monotoner Winkel: beim Ueberlauf 59 -> 0 eine volle Umdrehung
      // aufaddieren, damit die CSS-Transition vorwaerts laeuft.
      if (refs.lastSecondAngle != null && angles.second < refs.lastSecondAngle) {
        refs.sweepOffset += 360;
      }
      refs.lastSecondAngle = angles.second;
      refs.second.setAttribute('transform', `rotate(${angles.second + refs.sweepOffset} 50 50)`);
    }
  }
  if (refs.digital) {
    refs.digital.textContent = formatClockTime(now, options, {
      am: t('clock.meridiem.am'),
      pm: t('clock.meridiem.pm'),
    });
  }
  if (refs.date) refs.date.textContent = formatClockDate(now, options, getLanguage());
  if (refs.week) {
    refs.week.textContent = t('clock.week').replace('{week}', String(isoWeekNumber(now)));
  }
}

export function renderClockPanel(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.clockSection || els.clockSection.hidden) return;
  const stale =
    !rendered[paneIdx] ||
    rendered[paneIdx].options !== clockOptions ||
    rendered[paneIdx].mode !== getClockMode(paneIdx);
  if (stale) buildClock(paneIdx);
  paintClock(paneIdx, new Date());
}

// Sichtbare Panels vollstaendig neu aufbauen (Options-Wechsel, Sprach-
// Wechsel) und den Timer-Takt nachziehen.
function rebuildAllClockPanels() {
  for (let i = 0; i < state.panes.length; i++) {
    rendered[i] = null;
    renderClockPanel(i);
  }
  ensureClockTimer();
}

// --- Timer -------------------------------------------------------------------------

let timerId = null;
let timerMode = null; // 'second' | 'minute'

// 4T-0636: Getaktet wird nur fuer sichtbare Panels im Uhr-Modus. Steht die
// einzige sichtbare Spalte auf Wecker, Timer oder Stoppuhr, laeuft kein Timer.
// 4T-0752: Der Kalender-Modus taktet mit, aber nur minuetlich — er braucht den
// Takt allein fuer den Tages-Wechsel um Mitternacht.
function anyClockTicking() {
  for (let i = 0; i < state.panes.length; i++) {
    if (!getClockVisible(i)) continue;
    const mode = getClockMode(i);
    if (mode === 'clock' || mode === 'calendar') return true;
  }
  return false;
}

// Sekunden-Takt lohnt nur, wenn eine sichtbare Spalte wirklich die Uhr zeigt.
function anyClockModeVisible() {
  for (let i = 0; i < state.panes.length; i++) {
    if (getClockVisible(i) && getClockMode(i) === 'clock') return true;
  }
  return false;
}

function stopClockTimer() {
  if (timerId != null) clearTimeout(timerId);
  timerId = null;
  timerMode = null;
}

function tick() {
  timerId = null;
  const now = new Date();
  for (let i = 0; i < state.panes.length; i++) {
    if (getClockVisible(i)) paintClock(i, now);
  }
  scheduleNextTick();
}

// setTimeout statt setInterval: der naechste Tick wird auf die kommende
// Sekunden- bzw. Minutengrenze gelegt, damit die Anzeige nicht traege
// nachlaeuft und der Minuten-Takt nicht ueber die Laufzeit driftet.
function scheduleNextTick() {
  if (timerId != null || timerMode == null) return;
  const now = Date.now();
  const period = timerMode === 'second' ? 1000 : 60000;
  const delay = period - (now % period);
  timerId = setTimeout(tick, delay);
}

// Timer-Zustand an Erweiterung, Panel-Sichtbarkeit, Fenster-Sichtbarkeit und
// Options-Takt angleichen. Idempotent; wird aus allen Zustands-Wechseln
// gerufen.
export function ensureClockTimer() {
  const wanted =
    isExtensionActive('clock') && anyClockTicking() && document.visibilityState !== 'hidden';
  if (!wanted) {
    stopClockTimer();
    return;
  }
  const mode = anyClockModeVisible() && needsSecondTick(clockOptions) ? 'second' : 'minute';
  if (timerMode === mode && timerId != null) return;
  stopClockTimer();
  timerMode = mode;
  scheduleNextTick();
}

// --- Sichtbarkeit, Toggle, Persistenz (Muster Erinnerungs-/Kalender-Panel) ---------
// Bewusst ohne Vorbedingung an Datei oder Bereich: die Uhr zeigt nichts
// Dokument-Gebundenes und bleibt deshalb auch im Empty-State nutzbar.

function getClockVisible(paneIdx) {
  return isExtensionActive('clock') && !!(state.clock && state.clock.visibleByPane[paneIdx]);
}

export function applyClockVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.clockSection) return;
  const visible = getClockVisible(paneIdx);
  els.clockSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderClockPanel(paneIdx);
  else rendered[paneIdx] = null;
  updateClockToggleButton();
  ensureClockTimer();
}

export function updateClockToggleButton() {
  const btn = document.getElementById('btn-clock');
  if (!btn) return;
  const visible = !!(state.clock && state.clock.visibleByPane[state.activePaneIndex]);
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleClockPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.clock.visibleByPane[paneIdx];
  state.clock.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('clock', paneIdx);
  applyClockVisibility(paneIdx);
  // Im Empty-State haengt die Pane-Container-Sichtbarkeit an den Panel-
  // Praeferenzen — nachziehen (Muster Erinnerungs-/Bereichs-Panel).
  updateEmptyState();
  await persistClockSettings();
}

export async function persistClockSettings() {
  await persistSetting('clockPanel.visibleColumn0', !!state.clock.visibleByPane[0]);
  await persistSetting('clockPanel.visibleColumn1', !!state.clock.visibleByPane[1]);
}

export async function loadClockSettings() {
  const v0 = await api.getSetting('clockPanel.visibleColumn0');
  const v1 = await api.getSetting('clockPanel.visibleColumn1');
  state.clock.visibleByPane[0] = !!v0;
  state.clock.visibleByPane[1] = !!v1;
  // 4T-0636: Modus je Spalte. Fehlende oder defekte Staende fallen ueber die
  // Normalisierung auf 'clock' zurueck.
  for (let i = 0; i < state.clock.modeByPane.length; i++) {
    const key = clockModeKey(i);
    state.clock.modeByPane[i] = normalizeClockMode(key ? await api.getSetting(key) : null);
  }
}

// --- Init ---------------------------------------------------------------------------

export function initClockPanel() {
  // Fenster im Hintergrund: Timer abraeumen und beim Zurueckkommen sofort
  // neu zeichnen (sonst zeigte die Uhr kurz den alten Stand).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopClockTimer();
      return;
    }
    const now = new Date();
    for (let i = 0; i < state.panes.length; i++) {
      if (getClockVisible(i)) paintClock(i, now);
    }
    ensureClockTimer();
  });
  // Sprach-Wechsel aendert Datumszeile und AM/PM-Kuerzel.
  document.addEventListener('i18n-language-changed', () => rebuildAllClockPanels());
  // 4T-0637: Wecker-Liste geaendert (eigene Bedienung oder Fenster-
  // Broadcast) — sichtbare Wecker-Ansichten neu aufbauen.
  document.addEventListener('scg:clock-alarms-changed', () => rebuildAllClockPanels());
  // 4T-0638: Timer-Liste geaendert (eigene Bedienung oder Broadcast) und
  // Stoppuhr-Broadcast aus einem anderen Fenster.
  document.addEventListener('scg:clock-timers-changed', () => rebuildAllClockPanels());
  document.addEventListener('scg:clock-stopwatch-changed', () => rebuildAllClockPanels());
  initClockTimers();
  // Options-Zugriff fuer die Schlummer-Dauer anhaengen und die Wecker-
  // Zustellung verdrahten.
  attachClockOptions(getClockOptions);
  initClockAlarms(getLanguage);
  // Fenster-Broadcast der Optionen (Muster Format-Toolbar).
  if (typeof api.onClockOptionsChanged === 'function') {
    api.onClockOptionsChanged((value) => {
      void setClockOptions(value, { persist: false });
    });
  }
  // Schalt-Zustand der Erweiterung: beim Deaktivieren Panel ausblenden und
  // Timer abraeumen, beim Aktivieren den Nutzer-Wunsch wiederherstellen.
  attachExtensionRuntime('clock', {
    activate: () => {
      for (let i = 0; i < state.panes.length; i++) applyClockVisibility(i);
      updateEmptyState();
    },
    deactivate: () => {
      for (let i = 0; i < state.panes.length; i++) applyClockVisibility(i);
      stopClockTimer();
      updateEmptyState();
    },
  });
}

// --- Registrierung --------------------------------------------------------------

registerSidebarPanel({
  id: 'clock',
  titleKey: 'clock.panel.title',
  buttonId: 'btn-clock',
  sectionClass: 'sidebar-clock',
  getVisible: (paneIdx) => getClockVisible(paneIdx),
  applyVisibility: applyClockVisibility,
  toggle: toggleClockPanel,
});
