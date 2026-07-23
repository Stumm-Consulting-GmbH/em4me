'use strict';

// 4T-0512 (Epic 3E-0092): Editor des Ereignis-Fence — Anlage-Formularzeile,
// Inline-Zeilen-Bearbeitung mit Sperre der übrigen Zeilen, Duplizieren und
// Löschen mit Bestätigung, plus das Einfüge-Kommando für einen leeren Block.
//
// Architektur wie der Datatable-Grid-Editor (perspective-datatable-editor.js):
// Der Quelltext bleibt die eine Datenquelle. Jede Übernahme lokalisiert den
// Fence im AKTUELLEN Editor-Doc neu (findPerspectiveEventsFences), parst den
// Body frisch, mutiert das Modell und ersetzt den Body über view.dispatch
// mit userEvent 'input' — ein eigener, isoliert rückgängig machbarer
// Undo-Schritt pro Aktion. Zuordnung Grid -> Fence im Render-Pane über
// data-ev-index, im Live-Widget über posAtDOM; in beiden Fällen bestätigt
// der data-ev-source-Abgleich die Zuordnung, sonst wird nichts geschrieben.
//
// Geltungsbereich: editierbar sind Render-Pane der geteilten Ansicht und
// das Live-Block-Widget; Reading und Handbuch bleiben read-only (CSS plus
// Laufzeit-Guard). Blöcke mit Struktur-Fehlern, die Aggregations-Art
// (query-Direktive) und die Zeilen-Limit-Anzeige sind nicht editierbar.
//
// Komfort-Logik der Wiederkehr (Referenz-Verhalten, Workshop-Punkt 1):
// Kategorie Geburtstag/Todestag/Jahrestag aktiviert die Wiederkehr
// automatisch; ein gesetztes Ende deaktiviert sie (Checkbox gesperrt).

import { t, applyTranslations, getLanguage } from '../i18n.js';
import { state } from './app-state.js';
import { paneEditors, cancelPendingPreviewUpdate } from './editor.js';
import { api, getDocText } from './api.js';
// Zyklus-Hinweis: views.js -> render-mermaid.js -> dieses Modul -> views.js.
// Unkritisch, weil alle Zugriffe erst zur Laufzeit (im Event-Handler) erfolgen.
import { showStatusbarHint, renderPaneContent, saveTab } from './views.js';
// 4T-0515: Zeilen-Klick der Aggregation öffnet die Quell-Datei.
import { openInPane } from './tabs.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { showDateTimePicker } from './date-picker.js';
import {
  parsePerspectiveEvents,
  serializePerspectiveEvents,
  findPerspectiveEventsFences,
  parseIsoDate,
  addDaysIso,
  addMonthsClamped,
  effectiveEventsView,
  EVENT_CATEGORIES,
  EVENT_VIEWS,
  EVENT_DATE_PRESETS,
  sortEventIndices,
  filterEventIndices,
  eventFilterActiveCount,
  emptyFilterSpec,
  datePresetRange,
  toggleEventLink,
  cleanupEventLinks,
  eventLinksOf,
} from '../../shared/events-core.js';
import {
  localTodayIso,
  buildEventsTableHtml,
  buildEventsViewBarHtml,
  buildEventsDashboardHtml,
  buildEventsCalendarHtml,
  buildEventsTimelineHtml,
} from '../../shared/markdown/perspective-events.js';
// 4T-0514: Nachfüll-Pass (Differenz-Spalte, Hinweise) für client-seitig
// neu gebaute Tabellen (kein Zyklus: events-view importiert diesen Editor
// nicht).
import { applyPerspectiveEventsIfPresent } from './events-view.js';

// Kategorien mit automatischer Jahres-Wiederkehr (Referenz-Analyse §2).
const AUTO_RECURRING = new Set(['geburtstag', 'todestag', 'jahrestag']);

// --- Bindung -----------------------------------------------------------------

const boundRoots = new WeakSet();

export function bindPerspectiveEventsEditor(root) {
  if (!root || typeof root.addEventListener !== 'function' || boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', onRootKeydown);
  // Komfort-Logik reagiert auf Kategorie-Wechsel (change) und End-Eingabe
  // (input) in Formular- und Bearbeitungs-Zeile.
  root.addEventListener('change', onRootChange);
  root.addEventListener('input', onRootInput);
}

// --- Kontext und Fence-Zuordnung ----------------------------------------------

function resolveContext(el) {
  const container = el && el.closest ? el.closest('.perspective-events') : null;
  if (!container) return null;
  // Fences in Markdown-Embeds bleiben passiv: ihre data-ev-Attribute
  // beziehen sich auf die Embed-Datei, nicht auf das aktive Doc.
  if (container.closest('.wiki-embed-md-body')) return null;
  const cmRoot = container.closest('.cm-editor');
  let paneIdx;
  const live = !!cmRoot;
  if (cmRoot) {
    paneIdx = paneEditors.findIndex((v) => v && v.dom === cmRoot);
  } else {
    const group = container.closest('.pane-group');
    paneIdx = group ? parseInt(group.dataset.pane, 10) : -1;
  }
  if (!Number.isFinite(paneIdx) || paneIdx < 0) return null;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const view = paneEditors[paneIdx];
  if (!tab || !view) return null;
  // Pflege auch aus der Lese-Ansicht (PO-Entscheidung C1 vom 2026-07-15):
  // Schreiben läuft wie beim Checkbox-Toggle über den Pane-Editor; nur
  // Handbuch-Tabs und Embeds bleiben read-only.
  const modeOk = live
    ? tab.viewMode === 'live'
    : tab.viewMode === 'split' || tab.viewMode === 'rendered';
  const blocked = !!container.querySelector('.pev-errors');
  // 4T-0515: Aggregations-Art (Art 2) — anfangs am Pipeline-Platzhalter
  // erkennbar, nach dem client-seitigen Aufbau am Container-Marker.
  const aggregation =
    container.dataset.evAgg === '1' || !!container.querySelector('.pev-aggregation');
  const truncated = !!container.querySelector('.pev-limit');
  return {
    container,
    paneIdx,
    tab,
    view,
    live,
    blocked,
    aggregation,
    editable: modeOk && !tab.manualPage && !blocked && !truncated,
    evIndex: parseInt(container.dataset.evIndex, 10),
  };
}

function normalizeBody(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '');
}

function locateFence(ctx) {
  const doc = ctx.view.state.doc;
  const fences = findPerspectiveEventsFences(getDocText(doc));
  const expected = normalizeBody(ctx.container.dataset.evSource);
  if (ctx.live) {
    let pos;
    try {
      pos = ctx.view.posAtDOM(ctx.container);
    } catch {
      return null;
    }
    if (typeof pos !== 'number' || pos < 0) return null;
    const line = doc.lineAt(Math.min(pos, doc.length)).number;
    const hit = fences.find((f) => line >= f.openLine && line <= f.closeLine);
    return hit && normalizeBody(hit.body) === expected ? hit : null;
  }
  const byIndex = Number.isFinite(ctx.evIndex) ? fences[ctx.evIndex] : null;
  if (byIndex && normalizeBody(byIndex.body) === expected) return byIndex;
  const matching = fences.filter((f) => normalizeBody(f.body) === expected);
  return matching.length === 1 ? matching[0] : null;
}

// --- Rückschreiben -------------------------------------------------------------

function writeBody(ctx, fence, model) {
  const newBody = serializePerspectiveEvents(model);
  const doc = ctx.view.state.doc;
  if (fence.bodyStartLine > doc.lines) return false;
  const from = doc.line(fence.bodyStartLine).from;
  const to = doc.line(Math.min(fence.bodyEndLine, doc.lines)).to;
  // Leerer Fence-Body: bodyStartLine läge hinter bodyEndLine — dann wird
  // vor der Schließ-Zeile eingefügt (neuer Body samt Newline).
  if (fence.bodyEndLine < fence.bodyStartLine) {
    const insertAt = doc.line(Math.min(fence.closeLine, doc.lines)).from;
    ctx.view.dispatch({
      changes: { from: insertAt, to: insertAt, insert: newBody + '\n' },
      userEvent: 'input',
    });
  } else {
    ctx.view.dispatch({ changes: { from, to, insert: newBody }, userEvent: 'input' });
  }
  ctx.container.dataset.evSource = newBody + '\n';
  if (!ctx.live) {
    renderPaneContent(ctx.paneIdx);
    // 4T-0653: Der Dispatch oben hat ueber den Dokument-Listener bereits
    // einen verzoegerten Vorschau-Aufbau geplant. Nach dem synchronen Render
    // hier ist er redundant — und schaedlich, weil er verzoegert in die
    // naechste Bedienung faellt und ihr das DOM entzieht.
    cancelPendingPreviewUpdate(ctx.paneIdx);
  }
  return true;
}

function abortWithHint() {
  showStatusbarHint('events.hint.notFound', { error: true, duration: 2500 });
}

// --- Formular- und Eingabe-Helfer ---------------------------------------------------

// Datums-Eingabe prüfen: leer ist erlaubt (Aufrufer entscheidet über den
// Default), sonst muss ein echtes Kalender-Datum vorliegen.
function readDateInput(value, hintKey) {
  const raw = String(value || '').trim();
  if (raw === '') return { ok: true, value: '' };
  if (!parseIsoDate(raw)) {
    showStatusbarHint(hintKey, { error: true, duration: 2500 });
    return { ok: false };
  }
  return { ok: true, value: raw };
}

// Komfort-Logik auf einem Feld-Satz anwenden (Formular- oder Edit-Zeile).
function applyRecurringComfort(scope) {
  const category = scope.querySelector('select');
  const end = scope.querySelector('.pev-form-end, .pev-edit-end');
  const recurring = scope.querySelector('input[type="checkbox"]');
  if (!recurring) return;
  const hasEnd = !!(end && String(end.value).trim() !== '');
  recurring.disabled = hasEnd;
  if (hasEnd) recurring.checked = false;
  else if (category && AUTO_RECURRING.has(category.value)) recurring.checked = true;
}

// --- Anlage über die Formularzeile ---------------------------------------------------

function addFromForm(ctx, form) {
  const text = String(form.querySelector('.pev-form-text').value || '').trim();
  if (text === '') {
    showStatusbarHint('events.hint.textRequired', { error: true, duration: 2500 });
    form.querySelector('.pev-form-text').focus();
    return;
  }
  const date = readDateInput(
    form.querySelector('.pev-form-date').value,
    'events.hint.badDateInput',
  );
  const end = readDateInput(form.querySelector('.pev-form-end').value, 'events.hint.badEndInput');
  if (!date.ok || !end.ok) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  model.entries.push({
    // Zeitpunkt-Default heute (Referenz-Verhalten bei leerem Feld).
    date: date.value || localTodayIso(),
    end: end.value,
    text,
    category: form.querySelector('.pev-form-category').value,
    notes: String(form.querySelector('.pev-form-notes').value || '').trim(),
    recurring: form.querySelector('.pev-form-recurring-box').checked,
    id: null,
    predecessors: [],
    successors: [],
    line: 0,
  });
  writeBody(ctx, fence, model);
}

// --- Zeilen-Bearbeitung ---------------------------------------------------------------

// Genau eine offene Zeilen-Bearbeitung app-weit; die übrigen Zeilen sperrt
// die Container-Klasse pev-editing-locked (CSS) plus Laufzeit-Guard.
let activeRowEdit = null;

function mkInput(className, value, placeholderKey) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `pev-edit-input ${className}`;
  input.value = value || '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (placeholderKey) input.placeholder = t(placeholderKey);
  return input;
}

function mkPickButton(forClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pev-form-pick';
  btn.dataset.evPickEdit = forClass;
  btn.title = t('events.form.pickDate');
  btn.tabIndex = -1;
  btn.textContent = '📅';
  btn.hidden = !isExtensionActive('date-picker');
  return btn;
}

function startRowEdit(ctx, tr) {
  if (activeRowEdit) {
    // Erst die offene Bearbeitung abschließen (definierte Reihenfolge).
    if (!commitRowEdit()) return;
  }
  const rowIdx = parseInt(tr.dataset.evRow, 10);
  if (!Number.isFinite(rowIdx)) return;
  let entry;
  if (ctx.aggregation) {
    // 4T-0515: Eintrag aus dem Aggregations-Zustand (kein Fence-Zugriff).
    const ag = aggStates.get(ctx.container);
    entry = ag && ag.status === 'ready' ? ag.entries[rowIdx] : null;
    if (!entry) return;
  } else {
    const fence = locateFence(ctx);
    if (!fence) {
      abortWithHint();
      return;
    }
    const model = parsePerspectiveEvents(fence.body);
    entry = model.entries[rowIdx];
    if (!entry) return;
  }

  const originalHtml = tr.innerHTML;
  const cells = tr.querySelectorAll('td');
  if (cells.length < 6) return;

  const dateInput = mkInput('pev-edit-date', entry.date, 'events.form.datePlaceholder');
  const endInput = mkInput('pev-edit-end', entry.end, 'events.form.datePlaceholder');
  const select = document.createElement('select');
  select.className = 'pev-edit-input pev-edit-category';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = t('events.category.none');
  select.appendChild(noneOpt);
  for (const cat of EVENT_CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = t(`events.category.${cat}`);
    select.appendChild(opt);
  }
  select.value = EVENT_CATEGORIES.includes(entry.category) ? entry.category : '';
  const textInput = mkInput('pev-edit-text', entry.text, 'events.form.textPlaceholder');
  const notes = document.createElement('textarea');
  notes.className = 'pev-edit-input pev-edit-notes';
  notes.rows = 2;
  notes.value = entry.notes || '';
  notes.placeholder = t('events.form.notesPlaceholder');
  const recurringLabel = document.createElement('label');
  recurringLabel.className = 'pev-edit-recurring';
  const recurringBox = document.createElement('input');
  recurringBox.type = 'checkbox';
  recurringBox.checked = entry.recurring;
  recurringLabel.appendChild(recurringBox);
  recurringLabel.appendChild(document.createTextNode(` ${t('events.form.recurring')}`));

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'pev-save-btn';
  saveBtn.title = t('events.action.save');
  saveBtn.textContent = '✓';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'pev-cancel-btn';
  cancelBtn.title = t('events.action.cancel');
  cancelBtn.textContent = '✕';

  const fill = (td, ...nodes) => {
    td.textContent = '';
    for (const n of nodes) td.appendChild(n);
  };
  fill(cells[0], dateInput, mkPickButton('pev-edit-date'));
  fill(cells[1], endInput, mkPickButton('pev-edit-end'));
  fill(cells[2], select);
  fill(cells[3], textInput, notes);
  fill(cells[4], recurringLabel);
  fill(cells[5], saveBtn, cancelBtn);
  tr.classList.add('pev-editing');
  ctx.container.classList.add('pev-editing-locked');
  applyRecurringComfort(tr);

  activeRowEdit = { ctx, tr, rowIdx, originalHtml, entry, aggregation: !!ctx.aggregation };
  textInput.focus();
}

function cancelRowEdit() {
  if (!activeRowEdit) return;
  const { ctx, tr, originalHtml } = activeRowEdit;
  activeRowEdit = null;
  ctx.container.classList.remove('pev-editing-locked');
  if (tr.isConnected) {
    tr.classList.remove('pev-editing');
    tr.innerHTML = originalHtml;
  }
}

// Übernimmt die offene Zeilen-Bearbeitung. true, wenn beendet (übernommen
// oder abgebrochen); false, wenn eine ungültige Eingabe die Zeile im
// Edit-Modus hält.
function commitRowEdit() {
  if (!activeRowEdit) return true;
  const edit = activeRowEdit;
  if (!edit.tr.isConnected) {
    // Externes Re-Render hat die Zeile ersetzt: nichts zu schreiben.
    activeRowEdit = null;
    edit.ctx.container.classList.remove('pev-editing-locked');
    return true;
  }
  const text = String(edit.tr.querySelector('.pev-edit-text').value || '').trim();
  // Art 1 verlangt den Text (Referenz-Pflichtfeld); in der Aggregation ist
  // er optional — leer greift der Datei-Titel-Fallback (Workshop-Punkt 1).
  if (text === '' && !edit.aggregation) {
    showStatusbarHint('events.hint.textRequired', { error: true, duration: 2500 });
    return false;
  }
  const date = readDateInput(
    edit.tr.querySelector('.pev-edit-date').value,
    'events.hint.badDateInput',
  );
  const end = readDateInput(
    edit.tr.querySelector('.pev-edit-end').value,
    'events.hint.badEndInput',
  );
  if (!date.ok || !end.ok) return false;
  const category = edit.tr.querySelector('.pev-edit-category').value;
  const notes = String(edit.tr.querySelector('.pev-edit-notes').value || '').replace(/\r\n/g, '\n');
  const recurring = edit.tr.querySelector('.pev-edit-recurring input').checked;

  activeRowEdit = null;
  edit.ctx.container.classList.remove('pev-editing-locked');

  // 4T-0515: Aggregations-Eintrag — Rückschreiben in die Quell-Datei.
  // Die Zeile kehrt sofort in die Anzeige zurück (der Index-Refresh
  // bringt anschließend die geschriebenen Werte).
  if (edit.aggregation) {
    if (edit.tr.isConnected) {
      edit.tr.classList.remove('pev-editing');
      edit.tr.innerHTML = edit.originalHtml;
    }
    void commitAggRowEdit(edit, {
      date: date.value,
      end: end.value,
      text,
      category,
      notes,
      recurring,
    });
    return true;
  }
  const fence = locateFence(edit.ctx);
  const model = fence ? parsePerspectiveEvents(fence.body) : null;
  if (!fence || !model || !model.entries[edit.rowIdx]) {
    if (edit.tr.isConnected) {
      edit.tr.classList.remove('pev-editing');
      edit.tr.innerHTML = edit.originalHtml;
    }
    abortWithHint();
    return true;
  }
  const entry = model.entries[edit.rowIdx];
  entry.date = date.value || localTodayIso();
  entry.end = end.value;
  entry.text = text;
  entry.category = category;
  entry.notes = notes.trim() === '' ? '' : notes;
  entry.recurring = recurring;
  writeBody(edit.ctx, fence, model);
  return true;
}

// --- Zeilen-Aktionen -------------------------------------------------------------------

function duplicateRow(ctx, tr) {
  const rowIdx = parseInt(tr.dataset.evRow, 10);
  if (!Number.isFinite(rowIdx)) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const entry = model.entries[rowIdx];
  if (!entry) return;
  // Duplikat ohne Kennung und ohne Verknüpfungen (Workshop-Punkt 6).
  model.entries.splice(rowIdx + 1, 0, {
    ...entry,
    id: null,
    predecessors: [],
    successors: [],
  });
  writeBody(ctx, fence, model);
}

async function deleteRow(ctx, tr) {
  const rowIdx = parseInt(tr.dataset.evRow, 10);
  if (!Number.isFinite(rowIdx)) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const entry = model.entries[rowIdx];
  if (!entry) return;
  const confirmed = await api.eventsConfirmDelete(entry.text || entry.date);
  if (!confirmed) return;
  // Zuordnung nach dem Dialog erneut prüfen (das Dokument kann sich
  // während des offenen Dialogs geändert haben) — nie blind schreiben.
  const fresh = locateFence(ctx);
  if (!fresh || normalizeBody(fresh.body) !== normalizeBody(fence.body)) {
    abortWithHint();
    return;
  }
  model.entries.splice(rowIdx, 1);
  // 4T-0516: Löschen bereinigt die Bezüge auf beiden Seiten.
  cleanupEventLinks(model.entries, entry.id);
  writeBody(ctx, fresh, model);
}

// --- Datums-Picker ---------------------------------------------------------------------

async function pickDateInto(input, btn) {
  if (!isExtensionActive('date-picker')) return;
  const rect = btn.getBoundingClientRect();
  const current = String(input.value || '').trim();
  const result = await showDateTimePicker({
    x: rect.left,
    y: rect.bottom + 4,
    date: parseIsoDate(current) ? current : localTodayIso(),
    dateEnabled: true,
    timeEnabled: false,
  });
  if (result && result.date) {
    input.value = result.date;
    // Komfort-Logik nachziehen (End-Feld beeinflusst die Wiederkehr).
    const scope = input.closest('.pev-add-form, tr.pev-editing');
    if (scope) applyRecurringComfort(scope);
    input.focus();
  }
}

// --- Einfüge-Kommando --------------------------------------------------------------------

// Kommando „Ereignis-Block einfügen": leerer perspective-events-Fence an
// der Cursor-Position des Haupt-Editors (Guard-Muster edit.insertTemplate;
// eine Transaktion, Undo in einem Schritt).
export function insertEventsBlock() {
  const pane = state.panes[state.activePaneIndex];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const view = paneEditors[state.activePaneIndex];
  if (!tab || !tab.editMode || tab.viewMode === 'rendered' || !view || view.state.readOnly) {
    showStatusbarHint('events.hint.noEditor', { error: true, duration: 3000 });
    return false;
  }
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const prefix = line.length > 0 && range.from > line.from ? '\n' : '';
  const block = `${prefix}\`\`\`perspective-events\n\`\`\`\n`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: block },
    selection: { anchor: range.from + block.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}

// --- Event-Handler -------------------------------------------------------------------------

function onRootClick(e) {
  if (!(e.target instanceof Element)) return;
  const editBtn = e.target.closest('.pev-edit-btn');
  const dupBtn = e.target.closest('.pev-dup-btn');
  const delBtn = e.target.closest('.pev-del-btn');
  const addBtn = e.target.closest('.pev-add-btn');
  const saveBtn = e.target.closest('.pev-save-btn');
  const cancelBtn = e.target.closest('.pev-cancel-btn');
  const pickBtn = e.target.closest('.pev-form-pick');
  const sortTh = e.target.closest('th[data-ev-sort]');
  const filterToggle = e.target.closest('.pev-filter-toggle');
  const viewBtn = e.target.closest('.pev-viewbtn');
  const calNav = e.target.closest('.pev-cal-prev, .pev-cal-next, .pev-cal-today-btn');
  const jumpChip = e.target.closest('.pev-event-chip[data-ev-jump]');
  const aggRow = e.target.closest('tr.pev-agg-row[data-ev-source]');
  const linkBtn = e.target.closest('.pev-link-btn, .pev-link-ind');
  if (
    !editBtn &&
    !dupBtn &&
    !delBtn &&
    !addBtn &&
    !saveBtn &&
    !cancelBtn &&
    !pickBtn &&
    !sortTh &&
    !filterToggle &&
    !viewBtn &&
    !calNav &&
    !jumpChip &&
    !aggRow &&
    !linkBtn
  ) {
    return;
  }
  const ctx = resolveContext(e.target);
  if (!ctx) return;
  // 4T-0513/4T-0514: Ansichts-Funktionen (Sortieren, Filter, Umschalter,
  // Kalender-Navigation, Ereignis-Sprung) wirken in allen Kontexten —
  // nur der Umschalter persistiert im editierbaren Kontext die Direktive.
  if (filterToggle) {
    e.preventDefault();
    toggleFilterBar(ctx);
    return;
  }
  if (sortTh) {
    cycleSort(ctx, sortTh);
    return;
  }
  if (viewBtn) {
    e.preventDefault();
    switchView(ctx, viewBtn.dataset.evViewbtn);
    return;
  }
  if (calNav) {
    e.preventDefault();
    navigateCalendar(ctx, calNav);
    return;
  }
  if (jumpChip) {
    e.preventDefault();
    jumpToTableRow(ctx, parseInt(jumpChip.dataset.evJump, 10));
    return;
  }
  // 4T-0516: Verknüpfungs-Popup (Indikator und 🔗) — Anzeige in allen
  // Kontexten, die Toggle-Knöpfe erscheinen nur im editierbaren.
  if (linkBtn) {
    e.preventDefault();
    const linkTr = linkBtn.closest('tr[data-ev-row]');
    if (linkTr && !activeRowEdit) openLinkPopup(ctx, linkTr, linkBtn);
    return;
  }
  // 4T-0515: Zeilen-Klick der Aggregation öffnet die Quell-Datei
  // (Workshop-Punkt 5); Klicks auf Bedien-Elemente und während einer
  // offenen Bearbeitung bleiben davon unberührt.
  if (
    aggRow &&
    !editBtn &&
    !saveBtn &&
    !cancelBtn &&
    !pickBtn &&
    !activeRowEdit &&
    !e.target.closest('button, input, select, textarea')
  ) {
    e.preventDefault();
    // 4T-0631 (Epic 3E-0102): Zeilen-Klick im Ereignis-Widget des Dokuments
    // erbt die Gruppe.
    void openInPane(ctx.paneIdx, [aggRow.dataset.evSource], { inheritGroup: true });
    return;
  }
  e.preventDefault();
  if (pickBtn) {
    const scope = pickBtn.closest('.pev-add-form, tr');
    const cls = pickBtn.dataset.evPickEdit
      ? `.${pickBtn.dataset.evPickEdit}`
      : `.pev-form-${pickBtn.dataset.evPick}`;
    // Gezielt das Eingabefeld treffen: der Wrapper-Span des Formular-
    // Zeitpunkts trägt dieselbe Klasse pev-form-date wie sein Input
    // (PO-Befund C1: Kalender-Auswahl schrieb ins Span statt ins Feld).
    const input = scope ? scope.querySelector(`input${cls}`) : null;
    if (input) void pickDateInto(input, pickBtn);
    return;
  }
  if (saveBtn) {
    commitRowEdit();
    return;
  }
  if (cancelBtn) {
    cancelRowEdit();
    return;
  }
  if (!ctx.editable) {
    if (ctx.blocked && (editBtn || dupBtn || delBtn || addBtn)) {
      showStatusbarHint('events.hint.blocked', { error: true, duration: 2500 });
    }
    return;
  }
  if (addBtn) {
    if (activeRowEdit && !commitRowEdit()) return;
    const form = addBtn.closest('.pev-add-form');
    if (form) addFromForm(ctx, form);
    return;
  }
  const tr = e.target.closest('tr[data-ev-row]');
  if (!tr) return;
  // Während einer offenen Bearbeitung sind Aktionen anderer Zeilen gesperrt.
  if (activeRowEdit && activeRowEdit.tr !== tr) return;
  if (editBtn) startRowEdit(ctx, tr);
  else if (dupBtn) duplicateRow(ctx, tr);
  else if (delBtn) void deleteRow(ctx, tr);
}

function onRootKeydown(e) {
  if (!(e.target instanceof Element)) return;
  // Formularzeile: Strg+Enter legt an (Referenz-Kürzel).
  if (e.target.closest('.pev-add-form')) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const ctx = resolveContext(e.target);
      if (!ctx || !ctx.editable) return;
      e.preventDefault();
      const form = e.target.closest('.pev-add-form');
      addFromForm(ctx, form);
    }
    return;
  }
  // Bearbeitungs-Zeile: Enter übernimmt (außer im Notizen-Textarea),
  // Escape bricht ab.
  if (activeRowEdit && e.target.closest('tr') === activeRowEdit.tr) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelRowEdit();
      return;
    }
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      e.stopPropagation();
      commitRowEdit();
    }
  }
}

function onRootChange(e) {
  if (!(e.target instanceof Element)) return;
  if (e.target.matches('.pev-form-category, .pev-edit-category')) {
    const scope = e.target.closest('.pev-add-form, tr.pev-editing');
    if (scope) applyRecurringComfort(scope);
  }
}

function onRootInput(e) {
  if (!(e.target instanceof Element)) return;
  if (e.target.matches('.pev-form-end, .pev-edit-end')) {
    const scope = e.target.closest('.pev-add-form, tr.pev-editing');
    if (scope) applyRecurringComfort(scope);
  }
}

// --- Ansichts-Sortierung und Filter (4T-0513) --------------------------------------
// Reiner Ansichts-Zustand pro Tab und Fence (Muster Datatable 4T-0420):
// lebt in einer WeakMap auf dem Tab-Objekt, überlebt Re-Render und
// Tab-Wechsel, stirbt mit dem Tab, wird nie persistiert. Sortieren und
// Filtern ordnen bzw. verstecken nur DOM-Zeilen; der Quelltext bleibt
// byte-identisch. Nur die GESPEICHERTEN Filter (filter:-Direktiven)
// schreiben in den Fence — mit einem eigenen Undo-Schritt.
// Default-Sortierung der Referenz: Zeitpunkt absteigend.

const viewStates = new WeakMap(); // tab -> Map<fenceKey, { sort, filtersOpen, spec }>
const DEFAULT_SORT = { key: 'date', dir: -1 };

function fenceKeyFor(ctx) {
  if (!ctx.live) return Number.isFinite(ctx.evIndex) ? ctx.evIndex : null;
  const doc = ctx.view.state.doc;
  try {
    const line = doc.lineAt(Math.min(ctx.view.posAtDOM(ctx.container), doc.length)).number;
    const fences = findPerspectiveEventsFences(getDocText(doc));
    const idx = fences.findIndex((f) => line >= f.openLine && line <= f.closeLine);
    return idx >= 0 ? idx : null;
  } catch {
    return null;
  }
}

function viewStateFor(ctx, create) {
  if (!ctx.tab) return null;
  let byFence = viewStates.get(ctx.tab);
  if (!byFence) {
    if (!create) return null;
    byFence = new Map();
    viewStates.set(ctx.tab, byFence);
  }
  const key = fenceKeyFor(ctx);
  if (key == null) return null;
  let st = byFence.get(key);
  if (!st && create) {
    // viewOverride: transiente Ansicht (Ereignis-Klick-Sprung bzw.
    // Umschalten in nicht editierbaren Kontexten); calAnchor: Kalender-
    // Navigation (4T-0514). Beides reiner Ansichts-Zustand.
    st = {
      sort: null,
      filtersOpen: false,
      spec: emptyFilterSpec(),
      viewOverride: null,
      calAnchor: null,
    };
    byFence.set(key, st);
  }
  return st || null;
}

// Wendet Sortierung/Filter aller Ereignis-Tabellen im Container an
// (Aufruf aus der Render-Nachverarbeitung und dem Live-Widget-Mount);
// baut Toggle-Button und Filter-Leiste auf. Live-Widgets werden vor dem
// Einhängen enhanced; posAtDOM braucht ein angeschlossenes Element —
// deshalb kurze rAF-Wiedervorlage (Muster Datatable).
export function applyPerspectiveEventsViewStates(container, attempts = 3) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  if (!container.isConnected) {
    if (attempts > 0) {
      requestAnimationFrame(() => applyPerspectiveEventsViewStates(container, attempts - 1));
    }
    return;
  }
  const roots =
    container.classList && container.classList.contains('perspective-events')
      ? [container]
      : container.querySelectorAll('.perspective-events');
  for (const el of roots) {
    const ctx = resolveContext(el);
    // Editierbarkeit als Container-Klasse: das CSS zeigt die Pflege-
    // Affordanzen nur hier. Damit bleiben Handbuch-Tabs und Embeds
    // (ctx null bzw. editable false) automatisch ohne inerte Formulare —
    // robuster als Ansichts-Modus-Selektoren (PO-Entscheidung C1:
    // Pflege auch in der Lese-Ansicht).
    el.classList.toggle('pev-editable', !!(ctx && ctx.editable));
    if (!ctx) continue;
    if (el.querySelector('.pev-errors, .pev-limit')) continue;
    // 4T-0515: Aggregations-Fences bauen ihre Anzeige client-seitig auf
    // (Umschalter + Wrapper) und holen die Treffer asynchron.
    if (ctx.aggregation) ensureAggregation(ctx);
    ensureFilterUi(ctx);
    applyEventsViewState(ctx);
  }
}

function toggleFilterBar(ctx) {
  const st = viewStateFor(ctx, true);
  if (!st) return;
  st.filtersOpen = !st.filtersOpen;
  // Zuklappen setzt die Ansichts-Filter zurück (Muster Datatable); die
  // gespeicherten Filter im Fence bleiben unberührt.
  if (!st.filtersOpen) st.spec = emptyFilterSpec();
  ensureFilterUi(ctx);
  applyEventsViewState(ctx);
}

function cycleSort(ctx, th) {
  const key = th.dataset.evSort;
  if (!key) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  const current = st.sort || DEFAULT_SORT;
  st.sort = current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 };
  applyEventsViewState(ctx);
}

// Filter-Umschalter (immer, sofern ein Anzeige-Wrapper da ist) plus
// Filter-Leiste (wenn eingeblendet). Idempotent pro DOM-Generation.
function ensureFilterUi(ctx) {
  const display = ctx.container.querySelector('.pev-display');
  if (!display) return;
  const st = viewStateFor(ctx, false);
  if (!ctx.container.querySelector('.pev-filter-toggle')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pev-filter-toggle';
    btn.title = t('events.filter.show');
    btn.setAttribute('aria-label', t('events.filter.show'));
    btn.textContent = '▽';
    ctx.container.insertBefore(btn, ctx.container.firstChild);
  }
  const toggle = ctx.container.querySelector('.pev-filter-toggle');
  toggle.classList.toggle('active', !!(st && st.filtersOpen));
  const count = st ? eventFilterActiveCount(st.spec) : 0;
  let badge = toggle.querySelector('.pev-filter-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'pev-filter-badge';
      toggle.appendChild(badge);
    }
    badge.textContent = String(count);
  } else if (badge) {
    badge.remove();
  }
  const existing = ctx.container.querySelector('.pev-filter-bar');
  if (!st || !st.filtersOpen) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    renderActiveChips(ctx, st);
    return;
  }
  buildFilterBar(ctx, st);
}

function rebuildFilterBar(ctx) {
  const existing = ctx.container.querySelector('.pev-filter-bar');
  if (existing) existing.remove();
  ensureFilterUi(ctx);
  applyEventsViewState(ctx);
}

function mkChipButton(className, text, active) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = text;
  if (active) btn.classList.add('active');
  return btn;
}

function buildFilterBar(ctx, st) {
  const display = ctx.container.querySelector('.pev-display');
  const bar = document.createElement('div');
  bar.className = 'pev-filter-bar';

  // Volltextsuche (debounct; Hervorhebung übernimmt applyEventsViewState).
  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'pev-filter-text';
  text.placeholder = t('events.filter.textPlaceholder');
  text.value = st.spec.text || '';
  let timer = null;
  text.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      st.spec.text = text.value;
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    }, 150);
  });
  bar.appendChild(text);

  // Kategorie-Mehrfachauswahl als Badge-Chips inklusive „Ohne Kategorie".
  const cats = document.createElement('div');
  cats.className = 'pev-filter-cats';
  const catChip = (value, label) => {
    const chip = mkChipButton('pev-filter-cat', label, st.spec.categories.includes(value));
    chip.dataset.cat = value;
    chip.addEventListener('click', () => {
      const idx = st.spec.categories.indexOf(value);
      if (idx >= 0) st.spec.categories.splice(idx, 1);
      else st.spec.categories.push(value);
      chip.classList.toggle('active', idx < 0);
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    });
    cats.appendChild(chip);
  };
  for (const cat of EVENT_CATEGORIES) catChip(cat, t(`events.category.${cat}`));
  catChip('none', t('events.category.none'));
  bar.appendChild(cats);

  // Datumsbereich von/bis plus Presets.
  const range = document.createElement('div');
  range.className = 'pev-filter-range';
  const mkDate = (cls, value) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `pev-filter-input ${cls}`;
    input.placeholder = t('events.form.datePlaceholder');
    input.value = value || '';
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      if (raw !== '' && !parseIsoDate(raw)) {
        showStatusbarHint('events.hint.badDateInput', { error: true, duration: 2500 });
        return;
      }
      if (cls === 'pev-filter-from') st.spec.from = raw;
      else st.spec.to = raw;
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    });
    return input;
  };
  const fromInput = mkDate('pev-filter-from', st.spec.from);
  const toInput = mkDate('pev-filter-to', st.spec.to);
  range.appendChild(fromInput);
  range.appendChild(document.createTextNode(' – '));
  range.appendChild(toInput);
  const presets = document.createElement('select');
  presets.className = 'pev-filter-preset';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('events.filter.preset');
  presets.appendChild(none);
  for (const preset of EVENT_DATE_PRESETS) {
    const opt = document.createElement('option');
    opt.value = preset;
    opt.textContent = t(`events.filter.preset.${preset}`);
    presets.appendChild(opt);
  }
  presets.addEventListener('change', () => {
    if (presets.value === '') return;
    const r = datePresetRange(presets.value, localTodayIso());
    st.spec.from = r.from;
    st.spec.to = r.to;
    fromInput.value = r.from;
    toInput.value = r.to;
    ensureFilterUi(ctx);
    applyEventsViewState(ctx);
  });
  range.appendChild(presets);
  bar.appendChild(range);

  // Zusatzfilter (nur mit Notizen / nur wiederkehrend / nur mit Zeitspanne).
  const flags = document.createElement('div');
  flags.className = 'pev-filter-flags';
  const mkFlag = (key, labelKey) => {
    const label = document.createElement('label');
    label.className = 'pev-filter-flag';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!st.spec[key];
    box.addEventListener('change', () => {
      st.spec[key] = box.checked;
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode(` ${t(labelKey)}`));
    flags.appendChild(label);
  };
  mkFlag('notes', 'events.filter.onlyNotes');
  mkFlag('recurring', 'events.filter.onlyRecurring');
  mkFlag('timespan', 'events.filter.onlyTimespan');
  bar.appendChild(flags);

  // Gespeicherte benannte Filter (Anwenden überall; Speichern/Löschen
  // schreibt filter:-Direktiven und braucht den editierbaren Kontext).
  const saved = document.createElement('div');
  saved.className = 'pev-filter-saved-area';
  const model = parsePerspectiveEvents(normalizeBody(ctx.container.dataset.evSource));
  const select = document.createElement('select');
  select.className = 'pev-filter-saved';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('events.filter.savedPlaceholder');
  select.appendChild(placeholder);
  for (const f of model.savedFilters) {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    const hit = model.savedFilters.find((f) => f.name === select.value);
    if (!hit) return;
    st.spec = { ...hit.spec, categories: [...hit.spec.categories] };
    // Leiste mit den übernommenen Werten neu aufbauen, die Dropdown-
    // Auswahl aber erhalten — sonst könnte „Löschen" den gerade
    // angewendeten Filter nicht mehr adressieren.
    const keep = select.value;
    rebuildFilterBar(ctx);
    const fresh = ctx.container.querySelector('.pev-filter-saved');
    if (fresh) fresh.value = keep;
  });
  saved.appendChild(select);
  if (ctx.editable) {
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'pev-filter-input pev-filter-name';
    name.placeholder = t('events.filter.namePlaceholder');
    saved.appendChild(name);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'pev-add-btn pev-filter-save';
    saveBtn.textContent = t('events.filter.save');
    saveBtn.addEventListener('click', () => saveCurrentFilter(ctx, st, name.value));
    saved.appendChild(saveBtn);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'pev-add-btn pev-filter-delete';
    delBtn.textContent = t('events.filter.delete');
    delBtn.addEventListener('click', () => deleteSavedFilter(ctx, select.value));
    saved.appendChild(delBtn);
  }
  bar.appendChild(saved);

  // Aktive Filter als entfernbare Chips.
  const chips = document.createElement('div');
  chips.className = 'pev-filter-chips';
  bar.appendChild(chips);

  ctx.container.insertBefore(bar, display);
  renderActiveChips(ctx, st);
}

// Aktive Filter-Kriterien als entfernbare Chips (Referenz-Verhalten).
function renderActiveChips(ctx, st) {
  const chips = ctx.container.querySelector('.pev-filter-chips');
  if (!chips) return;
  chips.textContent = '';
  const addChip = (label, clear) => {
    const chip = document.createElement('span');
    chip.className = 'pev-filter-chip';
    chip.appendChild(document.createTextNode(label));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'pev-filter-chip-remove';
    x.title = t('events.filter.chipRemove');
    x.textContent = '×';
    x.addEventListener('click', () => {
      clear();
      rebuildFilterBar(ctx);
    });
    chip.appendChild(x);
    chips.appendChild(chip);
  };
  const spec = st.spec;
  if (String(spec.text || '').trim() !== '') {
    addChip(t('events.filter.chip.text').replace('{v}', spec.text), () => {
      spec.text = '';
    });
  }
  if (spec.categories.length > 0) {
    const labels = spec.categories
      .map((c) => (c === 'none' ? t('events.category.none') : t(`events.category.${c}`)))
      .join(', ');
    addChip(t('events.filter.chip.categories').replace('{v}', labels), () => {
      spec.categories = [];
    });
  }
  if (spec.from || spec.to) {
    addChip(
      t('events.filter.chip.range').replace('{v}', `${spec.from || '…'} – ${spec.to || '…'}`),
      () => {
        spec.from = '';
        spec.to = '';
      },
    );
  }
  if (spec.notes) {
    addChip(t('events.filter.onlyNotes'), () => {
      spec.notes = false;
    });
  }
  if (spec.recurring) {
    addChip(t('events.filter.onlyRecurring'), () => {
      spec.recurring = false;
    });
  }
  if (spec.timespan) {
    addChip(t('events.filter.onlyTimespan'), () => {
      spec.timespan = false;
    });
  }
}

// Text mit Treffer-Hervorhebung neu aufbauen (mehrzeilig, DOM-Knoten statt
// HTML; bestehende Hinweis-Icons der Zelle bleiben erhalten).
function setHighlightedText(el, text, needle) {
  if (!el) return;
  const hints = [...el.querySelectorAll('.pev-hint')];
  el.textContent = '';
  const lines = String(text == null ? '' : text).split('\n');
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    if (!needle) {
      el.appendChild(document.createTextNode(line));
      return;
    }
    const low = line.toLowerCase();
    let offset = 0;
    let pos;
    while ((pos = low.indexOf(needle, offset)) >= 0) {
      el.appendChild(document.createTextNode(line.slice(offset, pos)));
      const mark = document.createElement('mark');
      mark.textContent = line.slice(pos, pos + needle.length);
      el.appendChild(mark);
      offset = pos + needle.length;
    }
    el.appendChild(document.createTextNode(line.slice(offset)));
  });
  for (const hint of hints) el.appendChild(hint);
}

// Ordnet und filtert die Anzeige gemäß Zustand: Tabelle über DOM-Zeilen
// (Sortier-Indikatoren, Treffer-Hervorhebung), Zusatz-Ansichten über den
// client-seitigen Neubau des Anzeige-Wrappers (4T-0514); dazu Umschalter-
// Zustand und Treffer-Zähler.
function applyEventsViewState(ctx) {
  const display = ctx.container.querySelector('.pev-display');
  if (!display) return;
  const st = viewStateFor(ctx, false);
  const parsed = parsePerspectiveEvents(normalizeBody(ctx.container.dataset.evSource));
  let model = parsed;
  if (ctx.aggregation) {
    // 4T-0515: Einträge kommen aus dem Aggregations-Zustand; solange die
    // Daten fehlen, zeigt der Wrapper den Status statt einer Tabelle.
    const ag = aggStates.get(ctx.container);
    const effectiveNow = (st && st.viewOverride) || effectiveEventsView(parsed);
    syncSwitcherButtons(ctx, effectiveNow);
    if (!ag || ag.status === 'pending') {
      renderAggStatus(display, t('events.aggregationPending'));
      return;
    }
    if (ag.status === 'queryError') {
      const msg = (ag.error && (ag.error.message || ag.error.code)) || '';
      renderAggStatus(display, t('events.agg.queryError').replace('{msg}', msg));
      return;
    }
    if (ag.status !== 'ready' && ag.status !== 'refreshing') {
      renderAggStatus(display, t(`events.agg.${ag.status}`));
      return;
    }
    model = { ...parsed, entries: ag.entries };
  }
  const spec = st ? st.spec : null;
  const hasFilter = eventFilterActiveCount(spec) > 0;
  const visible = hasFilter
    ? new Set(
        filterEventIndices(model.entries, spec, {
          categoryLabel: (c) => (c ? t(`events.category.${c}`) : t('events.category.none')),
        }),
      )
    : null;
  const effective = (st && st.viewOverride) || effectiveEventsView(model);
  syncSwitcherButtons(ctx, effective);

  if (effective !== 'table') {
    renderClientView(ctx, display, model, visible, effective, st);
  } else {
    ensureTableDisplay(ctx, display, model);
    const table = display.querySelector('table.pev-table');
    const tbody = table ? table.tBodies[0] : null;
    const order = sortEventIndices(model.entries, (st && st.sort) || DEFAULT_SORT);
    const needle = hasFilter
      ? String(spec.text || '')
          .trim()
          .toLowerCase()
      : '';
    if (tbody) {
      const trByRow = new Map();
      for (const tr of tbody.querySelectorAll('tr[data-ev-row]')) {
        trByRow.set(parseInt(tr.dataset.evRow, 10), tr);
      }
      for (const rowIdx of order) {
        const tr = trByRow.get(rowIdx);
        if (!tr) continue;
        tbody.appendChild(tr);
        tr.classList.toggle('pev-row-hidden', !!visible && !visible.has(rowIdx));
        const entry = model.entries[rowIdx];
        if (entry) {
          setHighlightedText(tr.querySelector('.pev-text-main'), entry.text, needle || null);
          const notesEl = tr.querySelector('.pev-notes');
          if (notesEl) setHighlightedText(notesEl, entry.notes, needle || null);
        }
      }
    }
    // Sortier-Indikator am Kopf (Default-Sortierung zeigt ihren Pfeil mit).
    if (table && table.tHead) {
      const sort = (st && st.sort) || DEFAULT_SORT;
      for (const th of table.tHead.querySelectorAll('th[data-ev-sort]')) {
        const active = th.dataset.evSort === sort.key;
        th.classList.toggle('pev-sort-asc', active && sort.dir === 1);
        th.classList.toggle('pev-sort-desc', active && sort.dir === -1);
      }
    }
  }

  // „n von m Einträgen"-Zusatz nur bei aktivem Filter (alle Ansichten).
  let count = ctx.container.querySelector('.pev-filter-count');
  if (hasFilter) {
    if (!count) {
      count = document.createElement('div');
      count.className = 'pev-filter-count';
      display.insertAdjacentElement('afterend', count);
    }
    count.textContent = t('events.filter.count')
      .replace('{shown}', String(visible.size))
      .replace('{total}', String(model.entries.length));
  } else if (count) {
    count.remove();
  }
}

function syncSwitcherButtons(ctx, effective) {
  for (const btn of ctx.container.querySelectorAll('.pev-viewbtn')) {
    btn.classList.toggle('active', btn.dataset.evViewbtn === effective);
  }
}

// Tabelle client-seitig herstellen, wenn der Wrapper gerade eine
// Zusatz-Ansicht zeigt (transienter Rück-Wechsel ohne Dokument-Write)
// oder der Aggregations-Datenstand gewechselt hat (evStamp).
function ensureTableDisplay(ctx, display, model) {
  // Eine offene Zeilen-Bearbeitung wird von Hintergrund-Refreshes nicht
  // zerstört; der nächste Apply nach dem Abschluss baut frisch.
  if (
    activeRowEdit &&
    activeRowEdit.ctx.container === ctx.container &&
    activeRowEdit.tr.isConnected
  ) {
    return;
  }
  const ag = ctx.aggregation ? aggStates.get(ctx.container) : null;
  const stamp = ag ? String(ag.stamp) : '';
  if (display.dataset.evDisplay === 'table' && (display.dataset.evStamp || '') === stamp) return;
  display.innerHTML = buildEventsTableHtml(model, { aggregation: ctx.aggregation });
  display.dataset.evDisplay = 'table';
  display.dataset.evStamp = stamp;
  applyTranslations(display);
  applyPerspectiveEventsIfPresent(ctx.container);
}

// Zusatz-Ansicht in den Wrapper bauen (lokalisiert über t(); Stichtag vom
// Container, Kalender-Anker aus dem Ansichts-Zustand).
function renderClientView(ctx, display, model, visibleSet, effective, st) {
  const indices = [];
  model.entries.forEach((_, i) => {
    if (!visibleSet || visibleSet.has(i)) indices.push(i);
  });
  const todayIso = ctx.container.dataset.evToday || localTodayIso();
  const opts = { todayIso, L: t, lang: getLanguage() };
  let html;
  if (effective === 'dashboard') {
    html = buildEventsDashboardHtml(model, indices, opts);
  } else if (effective === 'month' || effective === 'week') {
    html = buildEventsCalendarHtml(model, indices, {
      ...opts,
      mode: effective,
      anchorIso: (st && st.calAnchor) || todayIso,
    });
  } else {
    html = buildEventsTimelineHtml(model, indices, opts);
  }
  display.innerHTML = html;
  display.dataset.evDisplay = effective;
}

// --- Aggregation über Frontmatter (4T-0515) -----------------------------------------
// Art 2: Einträge kommen asynchron aus dem Bereichs-Index (IPC
// events:query); die Anzeige (Tabelle, Filter, Zusatz-Ansichten) läuft
// über dieselben Wege wie Art 1 auf den gemappten Einträgen. Inline-
// Bearbeitung schreibt in die Quell-Datei zurück (Workshop-Punkt 5);
// Neuanlage, Duplizieren und Löschen gibt es hier nicht.

const aggStates = new WeakMap(); // container -> { key, stamp, status, error, entries }
let aggStampCounter = 0;

function aggScalar(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : '';
  return String(v);
}

function aggList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s !== '');
  const s = aggScalar(v).trim();
  return s === '' ? [] : [s];
}

// Treffer-Datei -> Eintrag im Modell-Format der Art 1; event-text fällt
// auf den logischen Datei-Namen zurück (Workshop-Punkt 1).
function mapAggregatedEvent(hit) {
  const text = aggScalar(hit.fields.text).trim();
  const recurringRaw = hit.fields.recurring;
  return {
    date: aggScalar(hit.fields.date).trim(),
    end: aggScalar(hit.fields.end).trim(),
    text: text !== '' ? text : hit.name,
    textFallback: text === '',
    category: aggScalar(hit.fields.category).trim(),
    notes: aggScalar(hit.fields.notes),
    recurring: recurringRaw === true || recurringRaw === 'true',
    id: null,
    predecessors: aggList(hit.fields.predecessors),
    successors: aggList(hit.fields.successors),
    line: 0,
    source: { path: hit.path, name: hit.name, mtimeMs: hit.mtimeMs || 0 },
  };
}

function renderAggStatus(display, text) {
  display.textContent = '';
  const status = document.createElement('div');
  status.className = 'pev-agg-status';
  status.textContent = text;
  display.appendChild(status);
  display.dataset.evDisplay = 'status';
  display.dataset.evStamp = '';
}

// Baut die Anzeige-Hülle (Umschalter + Wrapper) beim ersten Kontakt und
// stößt den Abruf an; erneute Aufrufe mit unverändertem Query-Schlüssel
// sind No-ops (der Live-Refresh invalidiert den Schlüssel gezielt).
function ensureAggregation(ctx) {
  const container = ctx.container;
  container.dataset.evAgg = '1';
  const model = parsePerspectiveEvents(normalizeBody(container.dataset.evSource));
  if (!container.querySelector('.pev-display')) {
    container.innerHTML =
      buildEventsViewBarHtml(effectiveEventsView(model)) +
      '<div class="pev-display" data-ev-display="none"></div>';
    applyTranslations(container);
  }
  const key = model.query == null ? '' : model.query;
  let st = aggStates.get(container);
  if (!st || st.key !== key) {
    st = { key, stamp: ++aggStampCounter, status: 'pending', error: null, entries: [] };
    aggStates.set(container, st);
    void fetchAggregation(ctx, key);
    return;
  }
  if (st.status === 'stale') {
    // Refresh: bestehende Daten bleiben sichtbar ('refreshing' zählt wie
    // 'ready'); der Stamp bewegt sich nur bei tatsächlich neuen Daten,
    // damit Hintergrund-Refreshes die Anzeige nicht grundlos neu bauen.
    st.status = st.entries.length > 0 ? 'refreshing' : 'pending';
    void fetchAggregation(ctx, key);
  }
}

async function fetchAggregation(ctx, key) {
  let res;
  try {
    res = await api.eventsQuery(key);
  } catch {
    res = null;
  }
  const st = aggStates.get(ctx.container);
  if (!st || st.key !== key) return; // Antwort ist veraltet
  if (!res || res.status === 'disabled') {
    st.status = 'unavailable';
    st.entries = [];
  } else if (res.status === 'indexing') {
    // Index baut noch: gebremst nachfassen (der invalidated-Broadcast
    // beim Fertigwerden greift zusätzlich; doppelte Abrufe sind über den
    // key-Abgleich harmlos).
    st.status = 'indexing';
    st.entries = [];
    setTimeout(() => {
      const cur = aggStates.get(ctx.container);
      if (cur === st && st.status === 'indexing') {
        st.status = 'stale';
        ensureAggregation(ctx);
      }
    }, 1000);
  } else if (res.status !== 'ready') {
    st.status = res.status;
    st.entries = [];
  } else if (res.queryError) {
    st.status = 'queryError';
    st.error = res.queryError;
    st.entries = [];
  } else {
    const mapped = (res.events || []).map(mapAggregatedEvent);
    const unchanged =
      (st.status === 'ready' || st.status === 'refreshing') &&
      JSON.stringify(mapped) === JSON.stringify(st.entries);
    st.status = 'ready';
    if (!unchanged) {
      st.stamp = ++aggStampCounter;
      st.entries = mapped;
    }
  }
  applyEventsViewState(ctx);
}

// Sichtbare Aggregationen bei Index-Updates neu befüllen (debounced;
// Aufruf aus dem backlinks:invalidated-Pfad in app-init, Muster
// refreshVisibleFrontmatterQueries).
let aggRefreshTimer = null;
export function refreshVisibleEventsAggregations() {
  if (aggRefreshTimer) clearTimeout(aggRefreshTimer);
  aggRefreshTimer = setTimeout(() => {
    aggRefreshTimer = null;
    for (const el of document.querySelectorAll('.perspective-events[data-ev-agg="1"]')) {
      const ctx = resolveContext(el);
      if (!ctx) continue;
      const st = aggStates.get(el);
      if (st) st.status = 'stale';
      ensureAggregation(ctx);
    }
  }, 250);
}

// Inline-Rückschreiben eines Aggregations-Eintrags: aktiver Tab über den
// Editor-Puffer (Frontmatter-Roundtrip, ein Undo-Schritt, Save nur wenn
// vorher sauber), geöffneter dirty Tab nur Hinweis, sonst Main-Schreibweg
// mit mtime-Konflikt-Erkennung (Muster writeTaskHitLine).
function findOpenTabByPath(path) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((tab) => tab.path === path);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx, tab: state.panes[p].tabs[idx] };
  }
  return null;
}

// Mehrfeld-Update in eine Quell-Datei schreiben (gemeinsamer Schreibweg
// der Inline-Bearbeitung und der Verknüpfungs-Pflege, 4T-0516): aktiver
// Tab über den Editor-Puffer, geöffneter dirty Tab nur Hinweis, sonst
// Main-Schreibweg mit mtime-Konflikt-Erkennung.
async function writeSourceFields(source, updates) {
  if (!source || !source.path) return false;
  const open = findOpenTabByPath(source.path);
  if (open && state.panes[open.paneIdx].activeIndex === open.tabIdx) {
    const view = paneEditors[open.paneIdx];
    if (!view) return false;
    const docText = getDocText(view.state.doc);
    const fm = api.getFrontmatter(docText);
    if (fm.parseError) {
      showStatusbarHint('events.agg.writeFailed', { error: true, duration: 3000 });
      return false;
    }
    const newData = { ...(fm.data || {}) };
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) delete newData[key];
      else newData[key] = value;
    }
    const written = api.writeFrontmatter(docText, newData);
    if (!written.ok) {
      showStatusbarHint('events.agg.writeFailed', { error: true, duration: 3000 });
      return false;
    }
    const wasDirty = !!open.tab.dirty;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: written.text },
      userEvent: 'input',
    });
    if (!wasDirty) await saveTab(open.paneIdx, open.tabIdx);
    return true;
  }
  if (open && open.tab.dirty) {
    showStatusbarHint('events.agg.dirtyOpen', { error: true, duration: 3000 });
    return false;
  }
  let res;
  try {
    res = await api.eventsApplyFrontmatterEdit({
      filePath: source.path,
      expectedMtimeMs: source.mtimeMs,
      updates,
    });
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    if (res && res.reason === 'conflict') {
      showStatusbarHint('events.agg.conflict', { error: true, duration: 3000 });
    } else {
      showStatusbarHint('events.agg.writeFailed', { error: true, duration: 3000 });
    }
    return false;
  }
  return true;
}

async function commitAggRowEdit(edit, values) {
  const updates = {
    'event-date': values.date || null,
    'event-end': values.end || null,
    'event-text': values.text || null,
    'event-category': values.category || null,
    'event-notes': values.notes.trim() === '' ? null : values.notes,
    'event-recurring': values.recurring ? true : null,
  };
  await writeSourceFields(edit.entry.source, updates);
  refreshVisibleEventsAggregations();
  return true;
}

// --- Verknüpfungen (4T-0516) ---------------------------------------------------------
// Ein leichtgewichtiges Popup pro Zeile: Suche über die übrigen Einträge
// (Art 1) bzw. aggregierten Quell-Dateien (Art 2), pro Treffer die beiden
// Toggle-Knöpfe Vorgänger/Nachfolger und der Sprung zum Ziel. Bestehende
// Bezüge stehen oben (inklusive verwaister Kennungen als weicher Hinweis
// mit Löse-Knopf). Verknüpfen nur innerhalb derselben Welt (Workshop-
// Punkt 6): das Popup kennt ausschließlich die Einträge seines Fence
// bzw. seiner Aggregation.

let linkPopup = null; // { el, ctx, rowIdx }

function closeLinkPopup() {
  if (!linkPopup) return;
  linkPopup.el.remove();
  linkPopup = null;
  document.removeEventListener('mousedown', onLinkPopupDocMousedown, true);
}

function onLinkPopupDocMousedown(e) {
  if (linkPopup && !(e.target instanceof Element && linkPopup.el.contains(e.target))) {
    closeLinkPopup();
  }
}

// Aktuelles Einträge-Modell des Popups (Art 1 frisch aus dem Fence-Quelltext,
// Art 2 aus dem Aggregations-Zustand).
function linkEntriesFor(ctx) {
  if (ctx.aggregation) {
    const ag = aggStates.get(ctx.container);
    return ag && (ag.status === 'ready' || ag.status === 'refreshing') ? ag.entries : null;
  }
  const fence = locateFence(ctx);
  return fence ? parsePerspectiveEvents(fence.body).entries : null;
}

// Bezüge eines Aggregations-Eintrags: Listen tragen logische Datei-Namen.
function aggLinksOf(entries, idx) {
  const entry = entries[idx];
  const out = { predecessors: [], successors: [] };
  if (!entry) return out;
  const resolve = (name) => {
    const target = entries.findIndex(
      (e) => e.source && e.source.name.toLowerCase() === String(name).toLowerCase(),
    );
    return { id: name, index: target, label: String(name), broken: target < 0 };
  };
  out.predecessors = (entry.predecessors || []).map(resolve);
  out.successors = (entry.successors || []).map(resolve);
  return out;
}

// Toggle in der Fence-Welt (Art 1): bidirektional im selben Fence, ein
// Undo-Schritt; Kennungen entstehen bei der ersten Verknüpfung.
function toggleLinkArt1(ctx, rowIdx, otherIdx, kind) {
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  if (!toggleEventLink(model.entries, rowIdx, otherIdx, kind)) return;
  writeBody(ctx, fence, model);
}

// Verwaiste Kennung lösen (Art 1).
function removeBrokenLinkArt1(ctx, rowIdx, kind, id) {
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const entry = model.entries[rowIdx];
  if (!entry) return;
  const list = kind === 'predecessor' ? entry.predecessors : entry.successors;
  const idx = list.indexOf(id);
  if (idx < 0) return;
  list.splice(idx, 1);
  writeBody(ctx, fence, model);
}

// Toggle in der Datei-Welt (Art 2): beide Frontmatter-Seiten über den
// definierten Schreibpfad (writeSourceFields).
async function toggleLinkArt2(ctx, rowIdx, otherIdx, kind) {
  const entries = linkEntriesFor(ctx);
  const a = entries && entries[rowIdx];
  const b = entries && entries[otherIdx];
  if (!a || !b || !a.source || !b.source) return;
  const mineKey = kind === 'predecessor' ? 'predecessors' : 'successors';
  const theirsKey = kind === 'predecessor' ? 'successors' : 'predecessors';
  const mine = [...a[mineKey]];
  const theirs = [...b[theirsKey]];
  const has = mine.some((n) => n.toLowerCase() === b.source.name.toLowerCase());
  if (has) {
    const mi = mine.findIndex((n) => n.toLowerCase() === b.source.name.toLowerCase());
    mine.splice(mi, 1);
    const ti = theirs.findIndex((n) => n.toLowerCase() === a.source.name.toLowerCase());
    if (ti >= 0) theirs.splice(ti, 1);
  } else {
    mine.push(b.source.name);
    if (!theirs.some((n) => n.toLowerCase() === a.source.name.toLowerCase())) {
      theirs.push(a.source.name);
    }
  }
  const okA = await writeSourceFields(a.source, {
    [`event-${mineKey}`]: mine.length > 0 ? mine : null,
  });
  if (okA) {
    await writeSourceFields(b.source, {
      [`event-${theirsKey}`]: theirs.length > 0 ? theirs : null,
    });
  }
  refreshVisibleEventsAggregations();
}

// Verwaisten Datei-Verweis lösen (Art 2, nur die eigene Seite).
async function removeBrokenLinkArt2(ctx, rowIdx, kind, name) {
  const entries = linkEntriesFor(ctx);
  const entry = entries && entries[rowIdx];
  if (!entry || !entry.source) return;
  const key = kind === 'predecessor' ? 'predecessors' : 'successors';
  const list = entry[key].filter((n) => n !== name);
  if (list.length === entry[key].length) return;
  await writeSourceFields(entry.source, { [`event-${key}`]: list.length > 0 ? list : null });
  refreshVisibleEventsAggregations();
}

function mkLinkKindButton(labelKey, active, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pev-link-kind';
  btn.textContent = t(labelKey);
  if (active) btn.classList.add('active');
  btn.addEventListener('click', onClick);
  return btn;
}

function renderLinkPopupList(filterText) {
  if (!linkPopup) return;
  const { ctx, rowIdx } = linkPopup;
  const listEl = linkPopup.el.querySelector('.pev-link-list');
  listEl.textContent = '';
  const entries = linkEntriesFor(ctx);
  if (!entries || !entries[rowIdx]) {
    closeLinkPopup();
    return;
  }
  const links = ctx.aggregation ? aggLinksOf(entries, rowIdx) : eventLinksOf(entries, rowIdx);
  const linkedPred = new Set(links.predecessors.filter((l) => !l.broken).map((l) => l.index));
  const linkedSucc = new Set(links.successors.filter((l) => !l.broken).map((l) => l.index));

  // Verwaiste Bezüge zuerst (weicher Hinweis mit Löse-Knopf).
  for (const kind of ['predecessor', 'successor']) {
    const broken = (kind === 'predecessor' ? links.predecessors : links.successors).filter(
      (l) => l.broken,
    );
    for (const l of broken) {
      const row = document.createElement('div');
      row.className = 'pev-link-item pev-link-broken';
      row.appendChild(
        Object.assign(document.createElement('span'), {
          className: 'pev-link-label',
          textContent: `⚠ ${t('events.link.broken').replace('{v}', l.label)}`,
        }),
      );
      if (ctx.editable) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pev-link-kind active';
        remove.textContent = '×';
        remove.title = t('events.link.remove');
        remove.addEventListener('click', () => {
          if (ctx.aggregation) void removeBrokenLinkArt2(ctx, rowIdx, kind, l.id);
          else removeBrokenLinkArt1(ctx, rowIdx, kind, l.id);
          setTimeout(() => renderLinkPopupList(filterText), 50);
        });
        row.appendChild(remove);
      }
      listEl.appendChild(row);
    }
  }

  const needle = String(filterText || '')
    .trim()
    .toLowerCase();
  let shown = 0;
  entries.forEach((e, i) => {
    if (i === rowIdx) return;
    const label = e.text || e.date || (e.source && e.source.name) || '';
    const hay = `${label}\n${e.date}\n${e.source ? e.source.name : ''}`.toLowerCase();
    if (needle && !hay.includes(needle)) return;
    shown++;
    const row = document.createElement('div');
    row.className = 'pev-link-item';
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'pev-link-label pev-link-jump';
    jump.title = t(ctx.aggregation ? 'events.agg.openSource' : 'events.link.jump');
    jump.textContent = `${e.date ? `${e.date} · ` : ''}${label}`;
    jump.addEventListener('click', () => {
      closeLinkPopup();
      // 4T-0631 (Epic 3E-0102): Springen aus dem Verknüpfungs-Popup des
      // Ereignis-Widgets ist ein Dokument-Klick — Gruppe erben.
      if (ctx.aggregation) void openInPane(ctx.paneIdx, [e.source.path], { inheritGroup: true });
      else jumpToTableRow(ctx, i);
    });
    row.appendChild(jump);
    if (ctx.editable) {
      const rerender = () => setTimeout(() => renderLinkPopupList(filterText), 50);
      row.appendChild(
        mkLinkKindButton('events.link.predecessor', linkedPred.has(i), () => {
          if (ctx.aggregation) void toggleLinkArt2(ctx, rowIdx, i, 'predecessor');
          else toggleLinkArt1(ctx, rowIdx, i, 'predecessor');
          rerender();
        }),
      );
      row.appendChild(
        mkLinkKindButton('events.link.successor', linkedSucc.has(i), () => {
          if (ctx.aggregation) void toggleLinkArt2(ctx, rowIdx, i, 'successor');
          else toggleLinkArt1(ctx, rowIdx, i, 'successor');
          rerender();
        }),
      );
    }
    listEl.appendChild(row);
  });
  if (shown === 0) {
    const empty = document.createElement('div');
    empty.className = 'pev-link-empty';
    empty.textContent = t('events.link.empty');
    listEl.appendChild(empty);
  }
}

function openLinkPopup(ctx, tr, anchor) {
  closeLinkPopup();
  const rowIdx = parseInt(tr.dataset.evRow, 10);
  if (!Number.isFinite(rowIdx)) return;
  const el = document.createElement('div');
  el.className = 'pev-link-popup';
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'pev-filter-input pev-link-search';
  search.placeholder = t('events.link.searchPlaceholder');
  search.addEventListener('input', () => renderLinkPopupList(search.value));
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeLinkPopup();
    }
  });
  el.appendChild(search);
  const list = document.createElement('div');
  list.className = 'pev-link-list';
  el.appendChild(list);
  document.body.appendChild(el);
  const rect = anchor.getBoundingClientRect();
  el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 12)}px`;
  el.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - el.offsetHeight - 12)}px`;
  linkPopup = { el, ctx, rowIdx };
  document.addEventListener('mousedown', onLinkPopupDocMousedown, true);
  renderLinkPopupList('');
  search.focus();
}

// --- Ansichts-Umschalter, Kalender-Navigation und Ereignis-Sprung (4T-0514) ---------

// Umschalter: im editierbaren Kontext wird die view:-Direktive persistiert
// (ein Undo-Schritt, Workshop-Punkt 7); in read-only Kontexten (Handbuch)
// wechselt die Ansicht transient über den Ansichts-Zustand.
function switchView(ctx, view) {
  if (!EVENT_VIEWS.includes(view)) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  if (ctx.editable) {
    const fence = locateFence(ctx);
    if (!fence) {
      abortWithHint();
      return;
    }
    const model = parsePerspectiveEvents(fence.body);
    st.viewOverride = null;
    st.calAnchor = null;
    if (model.view === view) {
      applyEventsViewState(ctx);
      return;
    }
    model.view = view;
    writeBody(ctx, fence, model);
  } else {
    st.viewOverride = view;
    st.calAnchor = null;
    applyEventsViewState(ctx);
  }
}

function navigateCalendar(ctx, btn) {
  const st = viewStateFor(ctx, true);
  if (!st) return;
  const model = parsePerspectiveEvents(normalizeBody(ctx.container.dataset.evSource));
  const effective = st.viewOverride || effectiveEventsView(model);
  if (effective !== 'month' && effective !== 'week') return;
  const todayIso = ctx.container.dataset.evToday || localTodayIso();
  const current = st.calAnchor || todayIso;
  if (btn.classList.contains('pev-cal-today-btn')) {
    st.calAnchor = todayIso;
  } else {
    const dir = btn.classList.contains('pev-cal-next') ? 1 : -1;
    if (effective === 'week') {
      st.calAnchor = addDaysIso(current, dir * 7) || todayIso;
    } else {
      // Monats-Anker auf die Monatsmitte legen (keine Klemm-Drift).
      const parts = parseIsoDate(current) || parseIsoDate(todayIso);
      const next = addMonthsClamped({ ...parts, d: 15 }, dir);
      st.calAnchor = `${next.y}-${String(next.m).padStart(2, '0')}-15`;
    }
  }
  applyEventsViewState(ctx);
}

// Ereignis-Klick in einer Zusatz-Ansicht: transient zur Tabelle wechseln
// und die Zeile anspringen (kein Dokument-Write für reine Navigation).
function jumpToTableRow(ctx, rowIdx) {
  if (!Number.isFinite(rowIdx)) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  st.viewOverride = 'table';
  applyEventsViewState(ctx);
  requestAnimationFrame(() => {
    const tr = ctx.container.querySelector(`tr[data-ev-row="${rowIdx}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center' });
    tr.classList.add('pev-jump-flash');
    setTimeout(() => tr.classList.remove('pev-jump-flash'), 1600);
  });
}

// --- Gespeicherte Filter (filter:-Direktiven im Fence) -----------------------------

function saveCurrentFilter(ctx, st, rawName) {
  const name = String(rawName || '').trim();
  if (name === '') {
    showStatusbarHint('events.filter.nameRequired', { error: true, duration: 2500 });
    return;
  }
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const spec = { ...st.spec, categories: [...st.spec.categories] };
  const existing = model.savedFilters.findIndex((f) => f.name === name);
  if (existing >= 0) model.savedFilters[existing] = { name, spec };
  else model.savedFilters.push({ name, spec });
  writeBody(ctx, fence, model);
}

function deleteSavedFilter(ctx, name) {
  if (!name) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const before = model.savedFilters.length;
  model.savedFilters = model.savedFilters.filter((f) => f.name !== name);
  if (model.savedFilters.length === before) return;
  writeBody(ctx, fence, model);
}
