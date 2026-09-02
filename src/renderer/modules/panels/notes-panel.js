// 4T-000359 / 4T-000398 (Epic 3E-000066): Notizen-Panel — editierbares Sidebar-Panel
// fuer die Dokument-Notiz (eine Notiz pro Dokument, gespeichert in der .mdd-
// Sektion `notes`, Datenpfad aus 4T-000358 ueber api.readNote/writeNote/onNoteChanged).
//
// Das Editier-Feld ist eine schlanke CodeMirror-Instanz (4T-000398, createNotesEditorState
// in editor.js), damit im Notiz-Feld dasselbe Rechtsklick-Kontextmenue und
// dieselben Formatierungs-Kuerzel (Strg+B usw.) wie im Haupt-Editor wirken. Pro
// Spalte eine Instanz in notesEditors[paneIdx] (Muster paneEditors).
//
// Unterschiede zum Haupt-Editor: die Notiz gehoert NICHT zum Dokument-Inhalt,
// also kein tab.content und kein Tab-Dirty. Lesen und Schreiben laufen asynchron
// gegen die .mdd, deshalb ein Generations-Token gegen Lade-Races. Speicher-
// Verhalten (PO-Entscheidung): implizit, debounced beim Tippen plus Sofort-Flush
// bei Fokus-Verlust, Datei-Wechsel und Fenster-Schliessen; kein Speichern-Button.
//
// PO-Entscheidungen: umschaltbare gerenderte Vorschau (standardmaessig aktiv,
// Setting notes.previewByDefault) und ein einfacher Konflikt-Hinweis bei
// Mehrfenster-Bearbeitung. Die Konflikt-Erkennung nutzt eine Baseline (zuletzt
// geladener bzw. geschriebener Stand); das eigene note:changed-Echo gleicht der
// (vor dem Schreiben gesetzten) Baseline und loest daher keinen Konflikt aus.
'use strict';

import { t } from '../../i18n.js';
import { EditorView } from '@codemirror/view';
import { api, getDocText } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applySidebarVisibility } from './panels.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { isAllEmpty, persistSetting } from '../views/views.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { decideNoteSync } from './notes-sync.js';
import { applySpellcheckToView, createNotesEditorState } from '../editor/editor.js';
import { showEditorContextMenu } from '../editor/editor-context-menu.js';
import { pathCompareKey } from '../../../shared/platform.js';

// Vorschau-Default (Setting notes.previewByDefault, Default an). Beim Panel-
// Oeffnen ist die Vorschau aktiv, sofern der Nutzer den Default nicht in den
// Einstellungen abschaltet; der Sitzungs-Toggle (previewByPane) startet daraus.
let notesPreviewDefault = true;

export function isNotesPreviewByDefault() {
  return notesPreviewDefault;
}

export function setNotesPreviewByDefault(value) {
  notesPreviewDefault = value !== false;
  for (let p = 0; p < 2; p++) {
    state.notes.previewByPane[p] = notesPreviewDefault;
    if (state.notes.visibleByPane[p]) applyNotesPreviewMode(p);
  }
}

// Eine CodeMirror-Instanz pro Spalte (Muster paneEditors).
const notesEditors = [];

// 4T-000581 (Epic 3E-000107): Schalter der Rechtschreibpruefung auch in den
// Notiz-Feldern nachziehen. Der Anstoss kommt als Dokument-Ereignis aus
// editor.js (Muster scg:taskstates-changed); ein direkter Aufruf von dort
// waere ein Modul-Zyklus, weil dieses Modul aus editor.js liest.
document.addEventListener('scg:spellcheck-changed', () => {
  for (const view of notesEditors) applySpellcheckToView(view);
});

function activeTabForPane(paneIdx) {
  const pane = state.panes[paneIdx];
  return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
}

function activePathForPane(paneIdx) {
  const tab = activeTabForPane(paneIdx);
  return tab && tab.path ? tab.path : null;
}

function hideNotesHints(els) {
  els.notesEmpty.hidden = true;
  els.notesSuspended.hidden = true;
  els.notesConflict.hidden = true;
}

// --- CodeMirror-Editor pro Spalte -------------------------------------------

function notesStateFor(paneIdx, content) {
  return createNotesEditorState({
    content,
    placeholderText: t('notes.placeholder'),
    onDocChanged: () => onNotesInput(paneIdx),
  });
}

// Doc-Aenderung durch den Nutzer: einen offenen Konflikt-Hinweis aufheben und
// den Debounce-Save planen.
function onNotesInput(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (els && els.notesConflict) els.notesConflict.hidden = true;
  scheduleSaveNotes(paneIdx);
}

function ensureNotesEditor(paneIdx) {
  if (notesEditors[paneIdx]) return notesEditors[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!els || !els.notesEditor) return null;
  const view = new EditorView({
    state: notesStateFor(paneIdx, ''),
    parent: els.notesEditor,
  });
  notesEditors[paneIdx] = view;
  // Editor-Kontextmenue (3E-000071) und Blur-Flush wie im Haupt-Editor.
  view.dom.addEventListener('contextmenu', (e) => showEditorContextMenu(e, view));
  view.contentDOM.addEventListener('blur', () => flushPendingNotesSave(paneIdx));
  return view;
}

// Doc frisch setzen (eigener State je Datei -> frische Undo-Historie). setState
// loest keinen docChanged-Listener aus, der Save wird also nicht faelschlich geplant.
function setNotesEditorContent(paneIdx, text) {
  const view = ensureNotesEditor(paneIdx);
  if (view) view.setState(notesStateFor(paneIdx, text));
}

function notesEditorText(paneIdx) {
  const view = notesEditors[paneIdx];
  return view ? getDocText(view.state.doc) : '';
}

// Fokussierte Notiz-View (fuer den globalen Zeitstempel-Handler); null, wenn
// keine Notiz-Instanz den Fokus hat.
export function activeNotesEditorView() {
  for (let p = 0; p < 2; p++) {
    const view = notesEditors[p];
    if (view && view.hasFocus) return view;
  }
  return null;
}

// --- Laden ------------------------------------------------------------------

export async function renderNotes(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.notesSection) return;
  flushPendingNotesSave(paneIdx);
  const token = ++state.notes.loadTokens[paneIdx];
  hideNotesHints(els);
  const path = activePathForPane(paneIdx);
  if (!path) {
    // Unbenannte Datei: keine Notiz moeglich (die .mdd braucht einen Pfad).
    state.notes.currentFileByPane[paneIdx] = null;
    state.notes.baselineByPane[paneIdx] = '';
    setNotesEditorContent(paneIdx, '');
    showNotesHint(els, els.notesEmpty);
    return;
  }
  let result;
  try {
    result = await api.readNote(path);
  } catch {
    result = { ok: false };
  }
  if (token !== state.notes.loadTokens[paneIdx]) return;
  state.notes.currentFileByPane[paneIdx] = path;
  if (!result || !result.ok) {
    // Defekte .mdd: Notiz ausgesetzt (Hinweis wie bei der Historie).
    state.notes.baselineByPane[paneIdx] = '';
    setNotesEditorContent(paneIdx, '');
    showNotesHint(els, els.notesSuspended);
    return;
  }
  const text = result.note ? result.note.text : '';
  setNotesEditorContent(paneIdx, text);
  state.notes.baselineByPane[paneIdx] = text;
  applyNotesPreviewMode(paneIdx);
}

// Hinweis (unbenannt/defekt) zeigen und Editor wie Vorschau ausblenden.
function showNotesHint(els, hintEl) {
  hintEl.hidden = false;
  els.notesEditor.hidden = true;
  els.notesPreview.hidden = true;
}

// --- Vorschau ---------------------------------------------------------------

function renderNotesPreview(paneIdx, text) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.notesPreview) return;
  const path = state.notes.currentFileByPane[paneIdx] || '';
  els.notesPreview.innerHTML = text ? api.renderMarkdown(text, path) : '';
}

function applyNotesPreviewMode(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.notesSection) return;
  // Bei aktivem Hinweis (unbenannt/defekt) gibt es weder Editor noch Vorschau.
  if (!els.notesEmpty.hidden || !els.notesSuspended.hidden) return;
  const preview = !!state.notes.previewByPane[paneIdx];
  if (preview) renderNotesPreview(paneIdx, notesEditorText(paneIdx));
  els.notesEditor.hidden = preview;
  els.notesPreview.hidden = !preview;
  // Nach dem Sichtbar-Machen misst CodeMirror sein Layout neu (Editor war hidden).
  if (!preview) {
    const view = notesEditors[paneIdx];
    if (view) view.requestMeasure();
  }
  if (els.notesPreviewToggle) {
    els.notesPreviewToggle.classList.toggle('active', preview);
    els.notesPreviewToggle.setAttribute('aria-pressed', preview ? 'true' : 'false');
  }
}

export function toggleNotesPreview(paneIdx) {
  if (!state.notes || paneIdx < 0 || paneIdx >= 2) return;
  state.notes.previewByPane[paneIdx] = !state.notes.previewByPane[paneIdx];
  applyNotesPreviewMode(paneIdx);
}

// --- Speichern (Debounce + Flush) -------------------------------------------

export function scheduleSaveNotes(paneIdx) {
  const timers = state.notes.saveTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  state.notes.saveTabs[paneIdx] = activeTabForPane(paneIdx);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    saveNotesFromPane(paneIdx, state.notes.saveTabs[paneIdx]);
  }, 500);
}

export function flushPendingNotesSave(paneIdx) {
  const timers = state.notes.saveTimers;
  if (!timers[paneIdx]) return;
  clearTimeout(timers[paneIdx]);
  timers[paneIdx] = null;
  saveNotesFromPane(paneIdx, state.notes.saveTabs[paneIdx]);
}

async function saveNotesFromPane(paneIdx, targetTab) {
  const view = notesEditors[paneIdx];
  if (!view) return;
  const path = targetTab && targetTab.path ? targetTab.path : null;
  if (!path) return;
  const text = getDocText(view.state.doc);
  // Baseline optimistisch VOR dem Schreiben setzen (nur wenn der Ziel-Tab der
  // aktive der Pane ist). Der Main sendet den note:changed-Broadcast VOR der
  // invoke-Antwort; das eigene Echo traefe sonst auf eine veraltete Baseline und
  // erschiene faelschlich als Konflikt, auch bei nur einem Fenster.
  const pane = state.panes[paneIdx];
  if (pane && pane.activeIndex >= 0 && pane.tabs[pane.activeIndex] === targetTab) {
    state.notes.baselineByPane[paneIdx] = text;
  }
  try {
    await api.writeNote(path, text);
  } catch {
    /* transienter Fehler: die Notiz bleibt im Editor, der naechste Save wiederholt */
  }
}

// --- Mehrfenster-Sync und Konflikt-Hinweis ----------------------------------

export function handleNoteChanged(payload) {
  if (!payload || typeof payload.path !== 'string') return;
  // 4T-001276 (Epic 3E-000232, Befund B1): Pfad-Identität über die zentrale Auskunft.
  const incomingPath = pathCompareKey(payload.path);
  const incoming = payload.note && typeof payload.note.text === 'string' ? payload.note.text : '';
  for (let p = 0; p < state.panes.length; p++) {
    const current = state.notes.currentFileByPane[p];
    if (!current || pathCompareKey(current) !== incomingPath) continue;
    const els = getPaneEls(p);
    if (!els || !els.notesSection || !state.notes.visibleByPane[p]) continue;
    const view = notesEditors[p];
    if (!view) continue;
    const decision = decideNoteSync(
      incoming,
      state.notes.baselineByPane[p],
      getDocText(view.state.doc),
    );
    if (decision === 'ignore') continue;
    if (decision === 'adopt') {
      // Kein lokaler Bearbeitungsstand: die fremde Fassung still uebernehmen.
      setNotesEditorContent(p, incoming);
      state.notes.baselineByPane[p] = incoming;
      els.notesConflict.hidden = true;
      if (state.notes.previewByPane[p]) renderNotesPreview(p, incoming);
    } else {
      // 'conflict': lokale ungespeicherte Aenderung trifft eine fremde Aenderung.
      els.notesConflict.hidden = false;
    }
  }
}

// --- Sichtbarkeit, Toggle, Persistenz ---------------------------------------

export function applyNotesVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.notesSection) return;
  const visible = !isAllEmpty() && !!state.notes.visibleByPane[paneIdx];
  els.notesSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderNotes(paneIdx);
  }
  updateNotesToggleButton();
}

export function updateNotesToggleButton() {
  const btn = document.getElementById('btn-notes');
  if (!btn) return;
  const visible = !!state.notes.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleNotesPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.notes.visibleByPane[paneIdx];
  state.notes.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('notes', paneIdx);
  applyNotesVisibility(paneIdx);
  await persistNotesSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistNotesSettings() {
  await persistSetting('notes.visibleColumn0', !!state.notes.visibleByPane[0]);
  await persistSetting('notes.visibleColumn1', !!state.notes.visibleByPane[1]);
}

export async function loadNotesSettings() {
  const v0 = await api.getSetting('notes.visibleColumn0');
  const v1 = await api.getSetting('notes.visibleColumn1');
  state.notes.visibleByPane[0] = !!v0;
  state.notes.visibleByPane[1] = !!v1;
  // Vorschau-Default laden (nur explizites false schaltet ab).
  const pv = await api.getSetting('notes.previewByDefault');
  notesPreviewDefault = pv !== false;
  state.notes.previewByPane[0] = notesPreviewDefault;
  state.notes.previewByPane[1] = notesPreviewDefault;
}

// --- Init: Editor-Instanzen und statisches Wiring ---------------------------

export function initNotesPanel() {
  for (let p = 0; p < 2; p++) {
    ensureNotesEditor(p);
    const els = getPaneEls(p);
    if (els && els.notesPreviewToggle) {
      els.notesPreviewToggle.addEventListener('click', () => toggleNotesPreview(p));
    }
  }
  // Fenster-Schliessen/Reload: pending Saves best-effort flushen.
  window.addEventListener('beforeunload', () => {
    for (let p = 0; p < 2; p++) flushPendingNotesSave(p);
  });
  // Mehrfenster-Sync: fremde Notiz-Aenderungen ziehen nach bzw. loesen den
  // Konflikt-Hinweis aus.
  if (typeof api.onNoteChanged === 'function') {
    api.onNoteChanged(handleNoteChanged);
  }
}

// --- Registrierung ----------------------------------------------------------

registerSidebarPanel({
  id: 'notes',
  titleKey: 'notes.title',
  buttonId: 'btn-notes',
  sectionClass: 'sidebar-notes',
  getVisible: (paneIdx) => !isAllEmpty() && !!(state.notes && state.notes.visibleByPane[paneIdx]),
  applyVisibility: applyNotesVisibility,
  toggle: toggleNotesPanel,
});
