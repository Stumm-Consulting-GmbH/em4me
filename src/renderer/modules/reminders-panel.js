// 4T-0527 (Epic 3E-0095): Erinnerungs-Panel — die Übersicht aller
// Erinnerungs-Anker des Bereichs in der Sidebar (Workshop-Punkt 5).
//
// Aufbau: Fälligkeits-Gruppen überfällig / heute / morgen / später
// (Gruppen-Logik groupForPanel im Erinnerungs-Kern). Die Überfällig-
// Sektion enthält abgelaufene UND gemutete Einträge; gemutete sind
// gekennzeichnet und über „Erneut auslösen" wieder scharf schaltbar
// (reminders:retrigger — der Main-Prüfer liefert sie sofort erneut an
// den Dialog aus 4T-0526). Direkt-Aktionen pro Eintrag: Erledigt
// (Toggling-Kette) und Snooze (gemeinsames Menü mit dem Dialog); Klick
// auf den Eintrag öffnet die Quelle an der Zeile.
//
// Daten pro Render frisch vom Main-Prüfer (reminders:list; loadTokens
// gegen Async-Races, Muster Kalender-Panel). Live-Aktualisierung über
// den Index-Broadcast (backlinks:invalidated) und Zustands-Broadcasts
// des Prüfers (reminders:changed).
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import { getPaneEls, state } from './app-state.js';
import { applySidebarVisibility } from './panels.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
import { isAllEmpty, persistSetting, updateEmptyState } from './views.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { groupForPanel } from '../../shared/reminders.js';
import { openReminderSource, showSnoozeMenu } from './reminders.js';
import { toggleTaskFromQuery } from './task-query-actions.js';

// Gruppen in Anzeige-Reihenfolge mit ihren Titel-Keys.
const GROUPS = [
  { id: 'overdue', titleKey: 'reminders.group.overdue' },
  { id: 'today', titleKey: 'reminders.group.today' },
  { id: 'tomorrow', titleKey: 'reminders.group.tomorrow' },
  { id: 'later', titleKey: 'reminders.group.later' },
];

// --- Rendering -------------------------------------------------------------------

function buildEntry(paneIdx, item) {
  const row = document.createElement('div');
  row.className = 'reminders-entry';
  if (item.muted) row.classList.add('muted');

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'reminders-entry-main';
  const desc = document.createElement('span');
  desc.className = 'reminders-item-desc';
  desc.textContent = item.description || item.taskText;
  main.appendChild(desc);
  const meta = document.createElement('span');
  meta.className = 'reminders-item-meta';
  const mutedSuffix = item.muted ? ` · ${t('reminders.panel.muted')}` : '';
  meta.textContent = `${api.basename(item.path)} · ${item.date}${
    item.time ? ` ${item.time}` : ''
  }${mutedSuffix}`;
  main.appendChild(meta);
  main.addEventListener('click', () => void openReminderSource(item));
  row.appendChild(main);

  const actions = document.createElement('span');
  actions.className = 'reminders-entry-actions';
  if (item.muted) {
    const retriggerBtn = document.createElement('button');
    retriggerBtn.type = 'button';
    retriggerBtn.className = 'reminders-action-btn';
    retriggerBtn.textContent = '🔔';
    retriggerBtn.title = t('reminders.panel.retrigger');
    retriggerBtn.addEventListener('click', async () => {
      try {
        await api.remindersRetrigger([item.key]);
      } catch (err) {
        console.warn('reminders:retrigger fehlgeschlagen:', err);
      }
    });
    actions.appendChild(retriggerBtn);
  }
  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'reminders-action-btn';
  doneBtn.textContent = '✓';
  doneBtn.title = t('reminders.dialog.done');
  doneBtn.addEventListener('click', async () => {
    await toggleTaskFromQuery({ path: item.path, line: item.line, taskText: item.taskText });
    renderRemindersPanel(paneIdx);
  });
  actions.appendChild(doneBtn);
  const snoozeBtn = document.createElement('button');
  snoozeBtn.type = 'button';
  snoozeBtn.className = 'reminders-action-btn';
  snoozeBtn.textContent = '⏰';
  snoozeBtn.title = t('reminders.dialog.snooze');
  snoozeBtn.addEventListener('click', () => {
    const rect = snoozeBtn.getBoundingClientRect();
    showSnoozeMenu(item, rect.left, rect.bottom + 2, () => renderRemindersPanel(paneIdx));
  });
  actions.appendChild(snoozeBtn);
  row.appendChild(actions);
  return row;
}

export async function renderRemindersPanel(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.remindersSection || els.remindersSection.hidden) return;
  const token = ++state.reminders.loadTokens[paneIdx];
  let result;
  try {
    result = await api.remindersList();
  } catch {
    result = null;
  }
  if (token !== state.reminders.loadTokens[paneIdx]) return;

  const groupsEl = els.remindersGroups;
  const statusEl = els.remindersStatus;
  groupsEl.innerHTML = '';
  if (!result || !result.ready) {
    statusEl.textContent = t(
      state.areaPath ? 'reminders.panel.notReady' : 'reminders.panel.noArea',
    );
    statusEl.hidden = false;
    return;
  }
  if (result.items.length === 0) {
    statusEl.textContent = t('reminders.panel.empty');
    statusEl.hidden = false;
    return;
  }
  statusEl.hidden = true;

  const todayIso = result.nowLocal.slice(0, 10);
  const grouped = groupForPanel(result.items, { todayIso, nowLocal: result.nowLocal });
  for (const group of GROUPS) {
    const items = grouped[group.id];
    if (!items || items.length === 0) continue;
    const header = document.createElement('div');
    header.className = 'reminders-group-header';
    header.textContent = `${t(group.titleKey)} (${items.length})`;
    groupsEl.appendChild(header);
    for (const item of items) groupsEl.appendChild(buildEntry(paneIdx, item));
  }
}

// --- Sichtbarkeit, Toggle, Persistenz (Muster Kalender-/Bereichs-Panel) -----------

// 4T-0527 (PO-Testbefund 2026-07-11): Erinnerungen sind bereichsweit, nicht
// datei-spezifisch. Das Panel ist sichtbar, wenn eine Datei offen ist ODER ein
// Bereich geoeffnet ist (auch ohne offene Datei — Muster Bereichs-Panel:
// getVisible haengt nicht an isAllEmpty). Ohne Bereich und ohne offene Datei
// gibt es keinen Suchraum, dann bleibt das Panel aus.
function canShowReminders() {
  return !isAllEmpty() || !!state.areaPath;
}

function getRemindersVisible(paneIdx) {
  return (
    canShowReminders() &&
    isExtensionActive('reminders') &&
    isExtensionActive('tasks') &&
    !!(state.reminders && state.reminders.visibleByPane[paneIdx])
  );
}

export function applyRemindersVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.remindersSection) return;
  const visible = getRemindersVisible(paneIdx);
  els.remindersSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderRemindersPanel(paneIdx);
  updateRemindersToggleButton();
}

export function updateRemindersToggleButton() {
  const btn = document.getElementById('btn-reminders');
  if (!btn) return;
  const visible = !!state.reminders.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleRemindersPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.reminders.visibleByPane[paneIdx];
  state.reminders.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('reminders', paneIdx);
  applyRemindersVisibility(paneIdx);
  // Im Empty-State eines Bereichs haengt die Pane-Container-Sichtbarkeit an
  // den Panel-Praeferenzen — nachziehen, damit das Panel auch ohne offene
  // Datei erscheint bzw. Aus-Schalten die Sidebar wieder ausblendet
  // (Muster area-panel toggleAreaPanel).
  updateEmptyState();
  await persistRemindersSettings();
}

export async function persistRemindersSettings() {
  await persistSetting('remindersPanel.visibleColumn0', !!state.reminders.visibleByPane[0]);
  await persistSetting('remindersPanel.visibleColumn1', !!state.reminders.visibleByPane[1]);
}

export async function loadRemindersSettings() {
  const v0 = await api.getSetting('remindersPanel.visibleColumn0');
  const v1 = await api.getSetting('remindersPanel.visibleColumn1');
  state.reminders.visibleByPane[0] = !!v0;
  state.reminders.visibleByPane[1] = !!v1;
}

// Sichtbare Panels beider Spalten neu aufbauen (Index-Invalidierung,
// Zustands-Änderung des Prüfers, Bereichs-Wechsel).
export function refreshRemindersPanels() {
  for (let i = 0; i < state.panes.length; i++) {
    if (state.reminders.visibleByPane[i]) renderRemindersPanel(i);
  }
}

// --- Init -------------------------------------------------------------------------

export function initRemindersPanel() {
  if (typeof api.onRemindersChanged === 'function') {
    api.onRemindersChanged(() => refreshRemindersPanels());
  }
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => refreshRemindersPanels());
  }
  if (typeof api.onAreaChanged === 'function') {
    api.onAreaChanged(() => refreshRemindersPanels());
  }
}

// --- Registrierung ------------------------------------------------------------

registerSidebarPanel({
  id: 'reminders',
  titleKey: 'reminders.panel.title',
  buttonId: 'btn-reminders',
  sectionClass: 'sidebar-reminders',
  getVisible: (paneIdx) => getRemindersVisible(paneIdx),
  applyVisibility: applyRemindersVisibility,
  toggle: toggleRemindersPanel,
});
