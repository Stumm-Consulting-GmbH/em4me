// 4T-0434 (Epic 3E-0081): Kalender-Panel — Monatsansicht der Journale in
// der Sidebar. Wochentags-Kopf (Montag zuerst), ISO-KW-Spalte links,
// Monats-Blättern und Heute-Knopf; Kopf mit Regal-/Journal-Filter (Default:
// alle Journale des Bereichs). Tage mit vorhandenem Tages-Journal-Eintrag
// im gewählten Filter tragen einen Punkt; Heute ist theme-konform
// hervorgehoben. Klick auf einen Tag zielt auf das Tages-Journal, Klick auf
// die KW-Zelle auf das Wochen-Journal (bei mehreren Treffern Auswahl-Popup);
// beides läuft über den gemeinsamen Öffnen-/Anlage-Pfad aus 4T-0433.
//
// Daten-Beschaffung: Konfiguration frisch pro Render (journals:getConfig),
// Existenz-Punkte als EIN Batch-IPC pro sichtbarem Monat
// (journals:entriesExist, begrenzter Scan — Epic-Risiko Performance).
// Aktualisierung über den Konfigurations-Broadcast (journals:changed) und
// den Struktur-Watcher des Bereichs (area:changed). Ohne Bereich bzw. ohne
// Journale zeigt der Body den lokalisierten Hinweis statt des Kalenders.
'use strict';

import { getLanguage, t } from '../i18n.js';
import { api } from './api.js';
import { getPaneEls, state } from './app-state.js';
import { applySidebarVisibility } from './panels.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
import { isAllEmpty, persistSetting, showStatusbarHint } from './views.js';
import { openJournalEntry, pickJournal } from './journals.js';
// 4T-0568 (Epic 3E-0104): Haekchen im Panel-Untermenue folgt dem Toggle
// (Muster panels.js).
import { reportMenuStateNow } from './tabs.js';
import { monthGrid, msToIsoDate, periodOf, resolveEntryPath } from '../../shared/journal-core.js';

// --- Filter -----------------------------------------------------------------

// Journale zum Filter-Wert: 'all' (alle), 'shelf:<name>', 'journal:<id>'.
function filteredJournals(config, filter) {
  const journals = config.journals;
  if (typeof filter === 'string' && filter.startsWith('journal:')) {
    const id = filter.slice('journal:'.length);
    return journals.filter((j) => j.id === id);
  }
  if (typeof filter === 'string' && filter.startsWith('shelf:')) {
    const shelf = filter.slice('shelf:'.length);
    return journals.filter((j) => j.shelf === shelf);
  }
  return journals;
}

// Filter-Auswahl neu aufbauen (Regale und Journale als Gruppen); eine nicht
// mehr existente Auswahl fällt auf 'all' zurück.
function rebuildFilter(paneIdx, els, config) {
  const select = els.calendarFilter;
  const current = state.calendar.filterByPane[paneIdx] || 'all';
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = t('calendar.filterAll');
  select.appendChild(allOption);
  if (config.shelves.length > 0) {
    const group = document.createElement('optgroup');
    group.label = t('calendar.filterShelves');
    for (const shelf of config.shelves) {
      const option = document.createElement('option');
      option.value = `shelf:${shelf}`;
      option.textContent = shelf;
      group.appendChild(option);
    }
    select.appendChild(group);
  }
  const group = document.createElement('optgroup');
  group.label = t('calendar.filterJournals');
  for (const journal of config.journals) {
    const option = document.createElement('option');
    option.value = `journal:${journal.id}`;
    option.textContent = journal.name;
    group.appendChild(option);
  }
  select.appendChild(group);
  const values = ['all', ...config.shelves.map((s) => `shelf:${s}`)].concat(
    config.journals.map((j) => `journal:${j.id}`),
  );
  const value = values.includes(current) ? current : 'all';
  state.calendar.filterByPane[paneIdx] = value;
  select.value = value;
}

// --- Monats-Zustand -----------------------------------------------------------

// Angezeigter Monat der Pane als ms des Monatsersten (Default: aktueller).
function shownMonthMs(paneIdx) {
  const stored = state.calendar.monthByPane[paneIdx];
  if (typeof stored === 'number') return stored;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function shiftMonth(paneIdx, delta) {
  const d = new Date(shownMonthMs(paneIdx));
  state.calendar.monthByPane[paneIdx] = new Date(
    d.getFullYear(),
    d.getMonth() + delta,
    1,
  ).getTime();
  renderCalendarPanel(paneIdx);
}

// --- Klick-Ziele ----------------------------------------------------------------

// Journal der Granularität im aktiven Filter wählen (Popup bei mehreren)
// und den Eintrag über den gemeinsamen Pfad öffnen bzw. anlegen.
async function openForGranularity(paneIdx, granularity, dayMs, missingHintKey) {
  let config;
  try {
    const result = await api.journalsGetConfig();
    config = result && result.ok && result.hasArea ? result.config : null;
  } catch {
    config = null;
  }
  if (!config) return;
  const candidates = filteredJournals(config, state.calendar.filterByPane[paneIdx]).filter(
    (j) => j.granularity === granularity,
  );
  if (candidates.length === 0) {
    showStatusbarHint(missingHintKey, { duration: 3500, error: true });
    return;
  }
  const journal = await pickJournal(candidates, t('journal.pick.title'));
  if (!journal) return;
  await openJournalEntry(journal, periodOf(dayMs, granularity));
  renderCalendarPanel(paneIdx);
}

// --- Rendering -------------------------------------------------------------------

// Existenz-Punkte des Gitters: Pfade aller Tages-Journale des Filters für
// alle Gitter-Tage auflösen und als EIN Batch prüfen. Liefert ein Set der
// ISO-Tage mit mindestens einem vorhandenen Eintrag.
async function loadEntryDots(journals, rows) {
  const dayJournals = journals.filter((j) => j.granularity === 'day');
  if (dayJournals.length === 0) return new Set();
  const relToIso = new Map();
  for (const row of rows) {
    for (const day of row.days) {
      for (const journal of dayJournals) {
        const resolved = resolveEntryPath(journal, periodOf(day.ms, 'day'));
        if (resolved.ok && !relToIso.has(resolved.relPath)) relToIso.set(resolved.relPath, day.iso);
      }
    }
  }
  let result;
  try {
    result = await api.journalsEntriesExist([...relToIso.keys()]);
  } catch {
    result = null;
  }
  const dots = new Set();
  if (result && result.ok && result.exists) {
    for (const [relPath, iso] of relToIso) {
      if (result.exists[relPath]) dots.add(iso);
    }
  }
  return dots;
}

// Wochentags-Kopf und Monats-Label lokalisiert über Intl in der App-Sprache;
// als Referenz-Woche dient eine bekannte Montag-Woche.
function weekdayLabels() {
  const format = new Intl.DateTimeFormat(getLanguage(), { weekday: 'short' });
  const labels = [];
  for (let i = 0; i < 7; i++) {
    // 2024-01-01 war ein Montag.
    labels.push(format.format(new Date(2024, 0, 1 + i)));
  }
  return labels;
}

export async function renderCalendarPanel(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.calendarSection || els.calendarSection.hidden) return;
  const token = ++state.calendar.loadTokens[paneIdx];
  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  if (token !== state.calendar.loadTokens[paneIdx]) return;
  const hasArea = !!(result && result.ok && result.hasArea);
  const config = hasArea ? result.config : null;
  els.calendarEmpty.hidden = hasArea;
  els.calendarNone.hidden = !hasArea || !!config;
  els.calendarMain.hidden = !config;
  if (!config) return;

  rebuildFilter(paneIdx, els, config);
  const journals = filteredJournals(config, state.calendar.filterByPane[paneIdx]);
  const monthMs = shownMonthMs(paneIdx);
  const month = new Date(monthMs);
  els.calendarMonthLabel.textContent = new Intl.DateTimeFormat(getLanguage(), {
    month: 'long',
    year: 'numeric',
  }).format(month);

  const rows = monthGrid(month.getFullYear(), month.getMonth());
  const dots = await loadEntryDots(journals, rows);
  if (token !== state.calendar.loadTokens[paneIdx]) return;

  const todayIso = msToIsoDate(Date.now());
  const grid = els.calendarGrid;
  grid.innerHTML = '';

  // Kopfzeile: KW-Ecke plus Wochentage (Montag zuerst).
  const corner = document.createElement('span');
  corner.className = 'calendar-cell calendar-head calendar-week-col';
  corner.textContent = t('calendar.weekColumn');
  grid.appendChild(corner);
  for (const label of weekdayLabels()) {
    const cell = document.createElement('span');
    cell.className = 'calendar-cell calendar-head';
    cell.textContent = label;
    grid.appendChild(cell);
  }

  for (const row of rows) {
    const weekBtn = document.createElement('button');
    weekBtn.type = 'button';
    weekBtn.className = 'calendar-cell calendar-week-col calendar-week-btn';
    weekBtn.textContent = String(row.week.week);
    weekBtn.title = row.week.key;
    weekBtn.addEventListener('click', () =>
      openForGranularity(paneIdx, 'week', row.week.startMs, 'journal.noWeekJournalInFilter'),
    );
    grid.appendChild(weekBtn);
    for (const day of row.days) {
      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = 'calendar-cell calendar-day-btn';
      dayBtn.textContent = String(day.day);
      dayBtn.title = day.iso;
      if (!day.inMonth) dayBtn.classList.add('other-month');
      if (day.iso === todayIso) dayBtn.classList.add('today');
      if (dots.has(day.iso)) dayBtn.classList.add('has-entry');
      dayBtn.addEventListener('click', () =>
        openForGranularity(paneIdx, 'day', day.ms, 'journal.noDayJournalInFilter'),
      );
      grid.appendChild(dayBtn);
    }
  }
}

// --- Sichtbarkeit, Toggle, Persistenz (Muster Notizen-Panel) ---------------------

export function applyCalendarVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.calendarSection) return;
  const visible = !isAllEmpty() && !!state.calendar.visibleByPane[paneIdx];
  els.calendarSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderCalendarPanel(paneIdx);
  updateCalendarToggleButton();
}

export function updateCalendarToggleButton() {
  const btn = document.getElementById('btn-calendar');
  if (!btn) return;
  const visible = !!state.calendar.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleCalendarPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.calendar.visibleByPane[paneIdx];
  state.calendar.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('calendar');
  applyCalendarVisibility(paneIdx);
  await persistCalendarSettings();
  // 4T-0568 (Epic 3E-0104): Menue-Haekchen nachziehen (Muster panels.js).
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistCalendarSettings() {
  await persistSetting('calendar.visibleColumn0', !!state.calendar.visibleByPane[0]);
  await persistSetting('calendar.visibleColumn1', !!state.calendar.visibleByPane[1]);
}

export async function loadCalendarSettings() {
  const v0 = await api.getSetting('calendar.visibleColumn0');
  const v1 = await api.getSetting('calendar.visibleColumn1');
  state.calendar.visibleByPane[0] = !!v0;
  state.calendar.visibleByPane[1] = !!v1;
}

// Sichtbare Kalender beider Spalten neu aufbauen (Bereichs-Wechsel,
// Konfigurations- oder Struktur-Änderung).
export function refreshCalendarPanels() {
  for (let i = 0; i < state.panes.length; i++) {
    if (state.calendar.visibleByPane[i]) renderCalendarPanel(i);
  }
}

// --- Init: statisches Wiring pro Spalte -------------------------------------------

export function initCalendarPanel() {
  for (let p = 0; p < 2; p++) {
    const els = getPaneEls(p);
    if (!els || !els.calendarSection) continue;
    els.calendarPrev.addEventListener('click', () => shiftMonth(p, -1));
    els.calendarNext.addEventListener('click', () => shiftMonth(p, 1));
    els.calendarToday.addEventListener('click', () => {
      state.calendar.monthByPane[p] = null;
      renderCalendarPanel(p);
    });
    els.calendarFilter.addEventListener('change', () => {
      state.calendar.filterByPane[p] = els.calendarFilter.value || 'all';
      renderCalendarPanel(p);
    });
  }
  // Konfigurations-Broadcast (Einstellungs-Änderungen) und Struktur-Watcher
  // des Bereichs (Datei angelegt/gelöscht) ziehen die Punkte nach.
  if (typeof api.onJournalsChanged === 'function') {
    api.onJournalsChanged(() => refreshCalendarPanels());
  }
  if (typeof api.onAreaChanged === 'function') {
    api.onAreaChanged(() => refreshCalendarPanels());
  }
}

// --- Registrierung ------------------------------------------------------------

registerSidebarPanel({
  id: 'calendar',
  titleKey: 'calendar.title',
  buttonId: 'btn-calendar',
  sectionClass: 'sidebar-calendar',
  getVisible: (paneIdx) =>
    !isAllEmpty() && !!(state.calendar && state.calendar.visibleByPane[paneIdx]),
  applyVisibility: applyCalendarVisibility,
  toggle: toggleCalendarPanel,
});
