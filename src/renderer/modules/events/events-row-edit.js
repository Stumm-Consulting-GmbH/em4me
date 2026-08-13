// Anlage ueber die Formularzeile, Inline-Zeilen-Bearbeitung samt Sperre der
// uebrigen Zeilen, Duplizieren und Loeschen mit Bestaetigung sowie der
// Datums-Picker der Eingabefelder.
//
// Auszug aus events-editor.js, 4T-1003 (Epic 3E-0196). activeRowEdit ist der
// eine app-weite Zustand der offenen Bearbeitung und lebt ausschliesslich
// hier; die Fremd-Leser kommen ueber getActiveRowEdit().
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { showDateTimePicker } from '../calendar/date-picker.js';
import {
  parseIsoDate,
  EVENT_CATEGORIES,
  cleanupEventLinks,
} from '../../../shared/events/events-core.js';
import { parsePerspectiveEvents } from '../../../shared/events/events-fence.js';
import { localTodayIso } from '../../../shared/markdown/perspective-events.js';
// 4T-1003: Laufzeit-Zyklus mit dem Kern. Kontext-Aufloesung, Fence-Zuordnung
// und Rueckschreiben werden ausschliesslich im Funktionskoerper aufgerufen.
import {
  AUTO_RECURRING,
  abortWithHint,
  locateFence,
  normalizeBody,
  writeBody,
} from './events-editor.js';
// 4T-1003: Laufzeit-Zyklus mit der Aggregation. Der Aggregations-Fall der
// Uebernahme reicht dorthin weiter, gelesen wird erst im Funktionskoerper.
import { commitAggRowEdit, getAggState } from './events-aggregation.js';

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
export function applyRecurringComfort(scope) {
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

export function addFromForm(ctx, form) {
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

// 4T-1003: Zugriff der Fremd-Leser (Wurzel-Handler des Kerns,
// ensureTableDisplay des Ansichts-Zustands). Geschrieben wird activeRowEdit
// ausschliesslich in diesem Modul.
export function getActiveRowEdit() {
  return activeRowEdit;
}

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

export function startRowEdit(ctx, tr) {
  if (activeRowEdit) {
    // Erst die offene Bearbeitung abschließen (definierte Reihenfolge).
    if (!commitRowEdit()) return;
  }
  const rowIdx = parseInt(tr.dataset.evRow, 10);
  if (!Number.isFinite(rowIdx)) return;
  let entry;
  if (ctx.aggregation) {
    // 4T-0515: Eintrag aus dem Aggregations-Zustand (kein Fence-Zugriff).
    const ag = getAggState(ctx.container);
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

export function cancelRowEdit() {
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
export function commitRowEdit() {
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

export function duplicateRow(ctx, tr) {
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

export async function deleteRow(ctx, tr) {
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

export async function pickDateInto(input, btn) {
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
