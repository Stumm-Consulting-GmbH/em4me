// 4T-0504 (Epic 3E-0096): Rueckschreiben aus der Abfrage-Ansicht — die drei
// Treffer-Interaktionen der Task-Abfrage (Status-Toggle, Termin-Verschieben,
// Bearbeiten) mit definiertem Schreibweg in die Quelldateien.
//
// Schreibweg-Regeln (Muster Link-Update 3E-0062, offene Tabs werden ueber
// den Editor-Zustand aktualisiert und nie auf der Platte ueberholt):
// - Datei ist der AKTIVE Tab einer Pane: CodeMirror-Transaktion im Puffer
//   (ein Undo-Schritt); war der Tab vorher nicht dirty, wird direkt ueber
//   den regulaeren Save-Pfad gespeichert (die Abfrage zieht dann ueber den
//   Index-Watcher nach). Toggle laeuft ueber performStatusToggle und damit
//   ueber denselben Ketten-Toggle samt Automatik-Daten und Wiederholung
//   wie der Klick im Dokument.
// - Datei ist offen, aber INAKTIV und dirty: kein Schreiben (weder Puffer
//   noch Platte) — Statusbar-Hinweis, der Nutzer arbeitet im Editor weiter.
//   Der inaktive Editor-Zustand ist nicht gemountet; ihn blind zu patchen
//   waere ein zweiter Wahrheits-Stand neben dem Puffer.
// - Sonst (geschlossen oder inaktiv und nicht dirty): zeilen-genaues
//   Schreiben ueber den Main (task:applyLineEdit, Konflikt-Erkennung im
//   prozessneutralen Kern); offene nicht-dirty Tabs ziehen ueber den
//   file:changed-Reload nach, dirty Tabs anderer Fenster ueber den
//   Konflikt-Dialog. Konflikte (Zeile veraendert/verschwunden) melden
//   einen Statusbar-Hinweis statt blind zu schreiben.
//
// Der Bearbeiten-Knopf delegiert an einen registrierbaren Handler (Dialog
// aus 4T-0506); ohne Handler oeffnet er die Quelldatei an der Zeile.
'use strict';

import { api } from './api.js';
import { t } from '../i18n.js';
import { state, contextMenu } from './app-state.js';
import { paneEditors } from './editor.js';
import { activatePane, openInPane } from './tabs.js';
import { performStatusToggle, computeStatusToggle } from './task-states.js';
import { taskToggleAugmenter, todayIsoDate } from './tasks.js';
import {
  parseTaskLine,
  serializeTaskLine,
  setDateField,
  setStatusChar,
  shiftIsoDateByDays,
  primaryDateField,
} from '../../shared/task-markers.js';
import { showDateTimePicker } from './date-picker.js';
import { showStatusbarHint, saveTab, scrollToLineAfterOpen } from './views.js';
import { appendContextMenuItem, placeContextMenuAt } from './dialogs.js';

// --- Treffer-Aufloesung -------------------------------------------------------

// Offener Tab zur Quelldatei (exakter Pfad-Vergleich wie reloadFile).
function findOpenTab(path) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((tab) => tab.path === path);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx, tab: state.panes[p].tabs[idx] };
  }
  return null;
}

// Ziel-Zeile im Editor-Doc: erwartete Zeilennummer zuerst, sonst eindeutige
// Suche (Semantik wie computeLineReplacement im Main). 0 = fehlt, -1 = mehrdeutig.
function findDocLine(view, line, expectedText) {
  const doc = view.state.doc;
  if (line >= 1 && line <= doc.lines && doc.line(line).text === expectedText) return line;
  let found = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (doc.line(i).text !== expectedText) continue;
    if (found) return -1;
    found = i;
  }
  return found;
}

function conflictHint() {
  showStatusbarHint(null, { text: t('taskQuery.conflict'), error: true, duration: 3000 });
}

function dirtyOpenHint() {
  showStatusbarHint(null, { text: t('taskQuery.dirtyOpen'), error: true, duration: 3000 });
}

// Aktiver Tab seiner Pane? Nur dann ist der Editor-Zustand gemountet.
function isActiveTab(open) {
  return state.panes[open.paneIdx].activeIndex === open.tabIdx;
}

// Nach einer Puffer-Transaktion: war der Tab vorher nicht dirty, direkt
// ueber den regulaeren Save-Pfad persistieren (die Abfrage-Ansicht zieht
// dann ueber den Index-Watcher nach; ein dirty Puffer bleibt Sache des
// Nutzers — dokumentierte Semantik).
async function persistIfWasClean(open, wasDirty) {
  if (!wasDirty) await saveTab(open.paneIdx, open.tabIdx);
}

// Zeilen-Ersetzung in geschlossenen bzw. inaktiven sauberen Dateien ueber
// den Main; Konflikt-Antworten werden als Hinweis gemeldet.
async function writeLineViaMain(hit, newText, insert) {
  let res;
  try {
    res = await api.applyTaskLineEdit({
      filePath: hit.path,
      line: hit.line,
      expectedText: hit.taskText,
      newText,
      insert: insert || null,
    });
  } catch {
    res = null;
  }
  if (res && res.ok) return true;
  if (res && (res.reason === 'missing' || res.reason === 'ambiguous')) conflictHint();
  else showStatusbarHint(null, { text: t('taskQuery.writeFailed'), error: true, duration: 3000 });
  return false;
}

// --- Status-Toggle -------------------------------------------------------------

// Toggle eines Abfrage-Treffers. Aktiver Tab: derselbe Editor-Toggle-Weg wie
// der Klick im Dokument (performStatusToggle: Ketten-Toggle, Automatik-Daten,
// Wiederholung, ein Undo-Schritt). Sonst: identische Semantik ueber
// computeStatusToggle plus taskToggleAugmenter, geschrieben ueber den Main.
export async function toggleTaskFromQuery(hit) {
  const open = findOpenTab(hit.path);
  if (open && isActiveTab(open)) {
    const view = paneEditors[open.paneIdx];
    if (!view) return;
    const line = findDocLine(view, hit.line, hit.taskText);
    if (line <= 0) {
      conflictHint();
      return;
    }
    const wasDirty = !!open.tab.dirty;
    if (!performStatusToggle(view, line)) return;
    await persistIfWasClean(open, wasDirty);
    return;
  }
  if (open && open.tab.dirty) {
    dirtyOpenHint();
    return;
  }
  const toggle = computeStatusToggle(hit.taskText);
  if (!toggle) return;
  // Augmenter zuerst (Automatik-Daten plus Wiederholungs-Instanz); ohne
  // Erweiterung liefert er null — dann nur das Einzel-Zeichen schalten.
  let augmented;
  try {
    augmented = taskToggleAugmenter(hit.taskText, toggle);
  } catch {
    augmented = null;
  }
  let newText;
  let insert = null;
  if (augmented && typeof augmented.lineText === 'string') {
    newText = augmented.lineText;
    insert = augmented.insert || null;
  } else {
    const model = parseTaskLine(hit.taskText);
    if (!model) return;
    setStatusChar(model, toggle.toChar);
    newText = serializeTaskLine(model);
  }
  await writeLineViaMain(hit, newText, insert);
}

// --- Termin-Verschieben ---------------------------------------------------------

// Neuer Termin-Wert beim Verschieben: Basis ist der bestehende Termin,
// ueberfaellige Termine rechnen ab heute (damit "morgen" nie in der
// Vergangenheit landet); die Uhrzeit bleibt unveraendert (Querschnitt B).
export function postponedDateValue(value, mode, todayIso) {
  const base = value.date < todayIso ? todayIso : value.date;
  return { date: shiftIsoDateByDays(base, mode === 'week' ? 7 : 1), time: value.time };
}

// Neue Zeilen-Fassung eines Treffers schreiben — gemeinsamer Schreibweg
// des Verschiebe-Menues und des Bearbeitungs-Dialogs (4T-0506): aktiver
// Tab per CodeMirror-Transaktion (ein Undo-Schritt, Save nur wenn der Tab
// vorher sauber war), inaktiver dirty Tab Hinweis, sonst Main-Schreibweg.
export async function writeTaskHitLine(hit, newText) {
  const open = findOpenTab(hit.path);
  if (open && isActiveTab(open)) {
    const view = paneEditors[open.paneIdx];
    if (!view) return false;
    const line = findDocLine(view, hit.line, hit.taskText);
    if (line <= 0) {
      conflictHint();
      return false;
    }
    const wasDirty = !!open.tab.dirty;
    const lineObj = view.state.doc.line(line);
    view.dispatch({
      changes: { from: lineObj.from, to: lineObj.to, insert: newText },
      userEvent: 'input',
    });
    await persistIfWasClean(open, wasDirty);
    return true;
  }
  if (open && open.tab.dirty) {
    dirtyOpenHint();
    return false;
  }
  return writeLineViaMain(hit, newText, null);
}

// Verschobene Zeile schreiben (gemeinsamer Schreibweg).
async function writePostponedLine(hit, field, nextValue) {
  const model = parseTaskLine(hit.taskText);
  if (!model) return;
  setDateField(model, field, nextValue);
  await writeTaskHitLine(hit, serializeTaskLine(model));
}

// Verschiebe-Menue am Knopf: morgen, eine Woche, freie Wahl per Picker.
export function showPostponeMenu(hit, x, y) {
  const model = parseTaskLine(hit.taskText);
  const field = model ? primaryDateField(model) : null;
  if (!field) {
    showStatusbarHint(null, { text: t('taskQuery.postpone.noDate'), duration: 2000 });
    return;
  }
  const value = model[field];
  contextMenu.innerHTML = '';
  const items = [
    {
      key: 'taskQuery.postpone.tomorrow',
      action: () =>
        writePostponedLine(hit, field, postponedDateValue(value, 'day', todayIsoDate())),
    },
    {
      key: 'taskQuery.postpone.nextWeek',
      action: () =>
        writePostponedLine(hit, field, postponedDateValue(value, 'week', todayIsoDate())),
    },
    {
      key: 'taskQuery.postpone.pick',
      action: async () => {
        const picked = await showDateTimePicker({
          x,
          y,
          date: value.date,
          time: value.time || undefined,
          dateEnabled: true,
          timeEnabled: !!value.time,
        });
        if (!picked || !picked.date) return;
        await writePostponedLine(hit, field, { date: picked.date, time: picked.time || null });
      },
    },
  ];
  for (const item of items) appendContextMenuItem(contextMenu, item);
  placeContextMenuAt(contextMenu, x, y);
}

// --- Bearbeiten ------------------------------------------------------------------

// Andock-Punkt des Task-Dialogs (4T-0506). Ohne registrierten Handler
// oeffnet der Bearbeiten-Knopf die Quelldatei an der Treffer-Zeile.
let taskEditHandler = null;

export function setTaskQueryEditHandler(fn) {
  taskEditHandler = typeof fn === 'function' ? fn : null;
}

export async function editTaskFromQuery(hit, paneIdx) {
  if (taskEditHandler) {
    await taskEditHandler(hit);
    return;
  }
  const target = typeof paneIdx === 'number' && paneIdx >= 0 ? paneIdx : state.activePaneIndex;
  activatePane(target);
  // 4T-0631 (Epic 3E-0102): Bearbeiten-Klick im Abfrage-Treffer des Dokuments
  // erbt die Gruppe (beide Aufruf-Pfade sind Dokument-Klicks: Render-Pane und
  // Live-Widget).
  const realPane = await openInPane(target, [hit.path], { inheritGroup: true });
  scrollToLineAfterOpen(realPane, hit.line);
}

// --- Klick-Dispatch ----------------------------------------------------------------

// Zentraler Einstieg beider Klick-Pfade (Render-Pane views.js, Live-Widget
// bindFrontmatterQueryClicks): behandelt Klicks auf die Aktions-Elemente
// der Task-Treffer (data-task-action) und meldet true, wenn der Klick
// verbraucht wurde.
export function handleTaskQueryAction(target, paneIdx) {
  const actionEl = target instanceof Element ? target.closest('[data-task-action]') : null;
  if (!actionEl) return false;
  const li = actionEl.closest('li.perspective-query-task');
  if (!li || !li.dataset.taskPath || !li.dataset.taskText) return false;
  const hit = {
    path: li.dataset.taskPath,
    line: parseInt(li.dataset.taskLine || '', 10) || 1,
    taskText: li.dataset.taskText,
  };
  const kind = actionEl.dataset.taskAction;
  if (kind === 'toggle') {
    void toggleTaskFromQuery(hit);
    return true;
  }
  if (kind === 'postpone') {
    const rect = actionEl.getBoundingClientRect();
    showPostponeMenu(hit, rect.left, rect.bottom + 2);
    return true;
  }
  if (kind === 'edit') {
    void editTaskFromQuery(hit, paneIdx);
    return true;
  }
  return false;
}
