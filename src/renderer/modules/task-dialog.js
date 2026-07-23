// 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog — der komfortable
// Gegenpol zur Marker-Syntax (Workshop-Punkt 7). Formular mit Beschreibung,
// Status (aus der task-states-Konfiguration), Prioritaet, Wiederholungs-
// Regel (mit Validierungs-Hinweis) und den drei manuellen Terminen; die
// Datums-Eingabe laeuft AUSSCHLIESSLICH ueber den Picker aus 3E-0091
// (PO-Entscheidung: strukturierte Werte ueber einstellbare Steuerungen,
// kein Freitext). Automatik-Daten (erstellt/erledigt/abgebrochen) werden
// nur angezeigt; der Status-Wechsel auf einen DONE-/CANCELLED-Typ setzt
// bzw. entfernt das jeweilige Datum gemaess der Automatik-Schalter
// (dieselbe Semantik wie der Ketten-Toggle). Eine Wiederholungs-Instanz
// entsteht im Dialog bewusst NICHT (die Instanz-Erzeugung bleibt beim
// Toggle-Abschluss).
//
// Zugaenge: Registry-Kommando task.editDialog (auf einer Task-Zeile
// bearbeitend, auf einer leeren Zeile anlegend), Editor-Kontextmenue und
// der Bearbeiten-Knopf der Abfrage-Treffer (setTaskQueryEditHandler aus
// 4T-0504; der Schreibweg der Treffer laeuft ueber writeTaskHitLine).
// Schreiben ueber den Marker-Kern: verlustfreier Round-Trip, EIN
// Undo-Schritt pro Anwendung (eine Transaktion bzw. ein Main-Schreiben).
'use strict';

import { $, api } from './api.js';
import { t } from '../i18n.js';
import { state, activeTab } from './app-state.js';
import { paneEditors } from './editor.js';
import { activeNotesEditorView } from './notes-panel.js';
import { taskStatesResolved } from './task-states.js';
import { tasksConfig, todayIsoDate } from './tasks.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { showDateTimePicker } from './date-picker.js';
import { showStatusbarHint } from './views.js';
import { setTaskQueryEditHandler, writeTaskHitLine } from './task-query-actions.js';
import {
  parseTaskLine,
  serializeTaskLine,
  setDateField,
  setPriority,
  setStatusChar,
  setRecurrence,
  setReminder,
  setTaskId,
  setDependsOn,
  generateTaskId,
  parseRecurrenceRule,
  PRIORITY_ORDER,
} from '../../shared/task-markers.js';
import { taskStatusType } from '../../shared/markdown/plugins.js';

// Die drei manuellen Termin-Felder des Formulars (Automatik-Daten sind
// reine Anzeige).
const MANUAL_DATE_FIELDS = ['due', 'scheduled', 'start'];
const AUTO_DATE_FIELDS = ['created', 'done', 'cancelled'];

// Anzeige-Text eines Termin-Werts ('—' fuer leer; ungueltige Werte
// erscheinen roh, damit der Nutzer sie im Dialog erkennt und korrigiert).
function dateValueText(value) {
  if (!value) return '—';
  return value.time ? `${value.date} ${value.time}` : value.date;
}

// Status-Auswahl: Basis-Zustaende plus aktivierte erweiterte Status aus
// der aufgeloesten task-states-Konfiguration. Traegt die Zeile ein nicht
// (mehr) konfiguriertes Zeichen, bleibt es als eigener Eintrag waehlbar
// (kein stiller Status-Verlust beim Bearbeiten).
function statusOptions(currentChar) {
  const options = [
    { char: ' ', label: t('taskDialog.status.open') },
    { char: 'x', label: t('taskDialog.status.done') },
  ];
  for (const s of taskStatesResolved) {
    if (!s.enabled) continue;
    options.push({ char: s.char, label: `${s.label} [${s.char}]` });
  }
  if (currentChar != null && !options.some((o) => o.char === currentChar)) {
    options.push({ char: currentChar, label: `[${currentChar}]` });
  }
  return options;
}

// --- Abhaengigkeiten (4T-0508, Epic 3E-0096) ------------------------------------

// Bereichs-Tasks fuer die Vorgaenger-/Nachfolger-Suche: laeuft ueber die
// bestehende Task-Abfrage (LIST TASKS gegen den Index; kein eigener IPC).
// Rueckgabe [{ path, line, taskText, id, description }] oder [].
async function loadAreaTasks(contextPath) {
  if (!contextPath) return [];
  let payload;
  try {
    payload = await api.runFrontmatterQuery(contextPath, 'LIST TASKS');
  } catch {
    return [];
  }
  if (!payload || payload.status !== 'ready' || !Array.isArray(payload.files)) return [];
  return payload.files.map((hit) => {
    const m = typeof hit.taskText === 'string' ? parseTaskLine(hit.taskText) : null;
    return {
      path: hit.path,
      line: hit.line,
      taskText: hit.taskText,
      id: m && m.id ? m.id : null,
      description: m ? m.description.trim() : hit.taskText || '',
    };
  });
}

// Nachfolger-Bezuege schreiben: die Ziel-Zeile erhaelt die eigene ID als
// zusaetzlichen Vorgaenger (Referenz-Verhalten). Schreibweg ist derselbe
// wie bei den Abfrage-Treffern (aktiver Tab per Transaktion, sonst Main
// mit Konflikt-Schutz) — Fehler einzelner Ziele stoppen die uebrigen nicht.
async function applySuccessorLinks(successors, ownId) {
  for (const target of successors) {
    const m = parseTaskLine(target.taskText);
    if (!m) continue;
    if ((m.dependsOn || []).includes(ownId)) continue;
    setDependsOn(m, [...(m.dependsOn || []), ownId]);
    await writeTaskHitLine(
      { path: target.path, line: target.line, taskText: target.taskText },
      serializeTaskLine(m),
    );
  }
}

// --- Dialog ------------------------------------------------------------------

// Zeigt den Dialog fuer ein Task-Modell (Kopie via Round-Trip; das
// uebergebene Modell bleibt unangetastet). Rueckgabe der neue Zeilen-Text
// oder null (Abbruch). mode 'create' | 'edit' steuert nur den Titel.
// opts (4T-0508): contextPath = Bereichs-Kontext der Task-Suche (aktive
// Datei bzw. Treffer-Datei), selfRef = { path, line } zur Selbst-
// Ausfilterung. Neue Nachfolger-Bezuege werden nach dem OK direkt auf die
// Ziel-Zeilen geschrieben (die eigene Zeile schreibt der Aufrufer).
export function showTaskDialog(model, mode, opts) {
  const modal = $('#task-dialog-modal');
  if (!modal) return Promise.resolve(null);
  const titleEl = $('#task-dialog-title');
  const descLabel = $('#task-dialog-description-label');
  const descInput = $('#task-dialog-description');
  const statusLabel = $('#task-dialog-status-label');
  const statusSelect = $('#task-dialog-status');
  const prioLabel = $('#task-dialog-priority-label');
  const prioSelect = $('#task-dialog-priority');
  const recLabel = $('#task-dialog-recurrence-label');
  const recInput = $('#task-dialog-recurrence');
  const recHint = $('#task-dialog-recurrence-hint');
  const datesEl = $('#task-dialog-dates');
  const autoEl = $('#task-dialog-auto-dates');
  const btnOk = $('#btn-task-dialog-ok');
  const btnCancel = $('#btn-task-dialog-cancel');

  // Arbeits-Kopie: der Dialog mutiert nur den Klon (Abbruch folgenlos).
  const draft = parseTaskLine(serializeTaskLine(model));
  const originalStatusChar = draft.statusChar;

  return new Promise((resolve) => {
    titleEl.textContent = t(
      mode === 'create' ? 'taskDialog.title.create' : 'taskDialog.title.edit',
    );
    descLabel.textContent = t('taskDialog.description');
    descInput.value = draft.description.trim();
    statusLabel.textContent = t('taskDialog.status');
    prioLabel.textContent = t('taskDialog.priority');
    recLabel.textContent = t('taskDialog.recurrence');
    recInput.value = draft.recurrence ? draft.recurrence.text : '';
    btnOk.textContent = t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');

    // Status-Auswahl.
    statusSelect.innerHTML = '';
    for (const opt of statusOptions(draft.statusChar)) {
      const option = document.createElement('option');
      option.value = opt.char;
      option.textContent = opt.label;
      statusSelect.appendChild(option);
    }
    statusSelect.value = draft.statusChar;

    // Prioritaets-Auswahl (sechs Stufen; 'normal' ohne Marker).
    prioSelect.innerHTML = '';
    for (const level of PRIORITY_ORDER) {
      const option = document.createElement('option');
      option.value = level;
      option.textContent = t(`taskDialog.priority.${level}`);
      prioSelect.appendChild(option);
    }
    prioSelect.value = draft.priority;

    // Wiederholungs-Hinweis (nicht blockierend: unparsebare Regeln bleiben
    // als Text erhalten, der Abschluss verhaelt sich dann wie ohne Regel).
    const updateRecurrenceHint = () => {
      const text = recInput.value.trim();
      const invalid = text !== '' && parseRecurrenceRule(text) === null;
      recHint.hidden = !invalid;
      recHint.textContent = invalid ? t('taskDialog.recurrenceInvalid') : '';
    };
    updateRecurrenceHint();
    recInput.addEventListener('input', updateRecurrenceHint);

    // Termin-Zeilen: Wert-Anzeige plus Picker- und Entfernen-Knopf.
    const dateValueEls = {};
    const renderDates = () => {
      datesEl.innerHTML = '';
      for (const field of MANUAL_DATE_FIELDS) {
        const row = document.createElement('div');
        row.className = 'task-dialog-date-row';
        const label = document.createElement('span');
        label.className = 'task-dialog-date-label';
        label.textContent = t(`taskMarker.${field}`);
        row.appendChild(label);
        const value = document.createElement('span');
        value.className = 'task-dialog-date-value';
        value.textContent = dateValueText(draft[field]);
        dateValueEls[field] = value;
        row.appendChild(value);
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'btn task-dialog-date-btn';
        pick.textContent = t('taskDialog.pickDate');
        pick.addEventListener('click', async () => {
          const current = draft[field];
          const rect = pick.getBoundingClientRect();
          const picked = await showDateTimePicker({
            x: rect.left,
            y: rect.bottom + 4,
            date: current && !current.invalid ? current.date : undefined,
            time: current && current.time ? current.time : undefined,
            dateEnabled: true,
            timeEnabled: !!(current && current.time),
          });
          if (!picked || !picked.date) return;
          setDateField(draft, field, { date: picked.date, time: picked.time || null });
          value.textContent = dateValueText(draft[field]);
          clearBtn.hidden = !draft[field];
        });
        row.appendChild(pick);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn task-dialog-date-btn';
        clearBtn.textContent = t('taskDialog.clearDate');
        clearBtn.hidden = !draft[field];
        clearBtn.addEventListener('click', () => {
          setDateField(draft, field, null);
          value.textContent = dateValueText(null);
          clearBtn.hidden = true;
        });
        row.appendChild(clearBtn);
        datesEl.appendChild(row);
      }
      // 4T-0528 (Epic 3E-0095): Erinnerungs-Zeile — Melde-Zeitpunkt mit
      // Datum plus Uhrzeit ueber den Picker (nur bei aktiver Erweiterung;
      // Muster der Termin-Zeilen, geschrieben ueber setReminder).
      if (isExtensionActive('reminders')) {
        const row = document.createElement('div');
        row.className = 'task-dialog-date-row';
        const label = document.createElement('span');
        label.className = 'task-dialog-date-label';
        label.textContent = t('taskMarker.reminder');
        row.appendChild(label);
        const value = document.createElement('span');
        value.className = 'task-dialog-date-value';
        value.textContent = dateValueText(draft.reminder);
        row.appendChild(value);
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'btn task-dialog-date-btn';
        pick.textContent = t('taskDialog.pickDate');
        pick.addEventListener('click', async () => {
          const current = draft.reminder;
          const rect = pick.getBoundingClientRect();
          const picked = await showDateTimePicker({
            x: rect.left,
            y: rect.bottom + 4,
            date: current && !current.invalid ? current.date : undefined,
            time: current && current.time ? current.time : undefined,
            dateEnabled: true,
            timeEnabled: true,
          });
          if (!picked || !picked.date) return;
          setReminder(draft, { date: picked.date, time: picked.time || null });
          value.textContent = dateValueText(draft.reminder);
          clearBtn.hidden = !draft.reminder;
        });
        row.appendChild(pick);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn task-dialog-date-btn';
        clearBtn.textContent = t('taskDialog.clearDate');
        clearBtn.hidden = !draft.reminder;
        clearBtn.addEventListener('click', () => {
          setReminder(draft, null);
          value.textContent = dateValueText(null);
          clearBtn.hidden = true;
        });
        row.appendChild(clearBtn);
        datesEl.appendChild(row);
      }
    };
    renderDates();

    // Automatik-Daten als Anzeige-Zeile (nur vorhandene Felder).
    const autoParts = AUTO_DATE_FIELDS.filter((f) => draft[f]).map(
      (f) => `${t(`taskMarker.${f}`)}: ${dateValueText(draft[f])}`,
    );
    autoEl.hidden = autoParts.length === 0;
    autoEl.textContent = autoParts.join(' · ');

    // 4T-0508: Abhaengigkeiten — ID-Zeile plus Vorgaenger/Nachfolger mit
    // Task-Suche ueber den Bereich (lazy beim ersten Fokus geladen).
    const depsEl = $('#task-dialog-deps');
    const contextPath = opts && opts.contextPath ? opts.contextPath : null;
    const selfRef = opts && opts.selfRef ? opts.selfRef : null;
    const pendingSuccessors = [];
    let areaTasks = null; // lazy; null = noch nicht geladen
    const ensureAreaTasks = async () => {
      if (areaTasks === null) {
        areaTasks = await loadAreaTasks(contextPath);
        if (selfRef) {
          areaTasks = areaTasks.filter(
            (task) => !(task.path === selfRef.path && task.line === selfRef.line),
          );
        }
      }
      return areaTasks;
    };
    const renderDeps = () => {
      depsEl.innerHTML = '';
      // ID-Zeile: Wert plus Erzeugen-/Entfernen-Knopf.
      const idRow = document.createElement('div');
      idRow.className = 'task-dialog-date-row';
      const idLabel = document.createElement('span');
      idLabel.className = 'task-dialog-date-label';
      idLabel.textContent = t('taskDialog.id');
      idRow.appendChild(idLabel);
      const idValue = document.createElement('span');
      idValue.className = 'task-dialog-date-value';
      idValue.textContent = draft.id || '—';
      idRow.appendChild(idValue);
      if (!draft.id) {
        const genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'btn task-dialog-date-btn';
        genBtn.textContent = t('taskDialog.generateId');
        genBtn.addEventListener('click', async () => {
          const tasks = await ensureAreaTasks();
          setTaskId(draft, generateTaskId(tasks.map((task) => task.id).filter(Boolean)));
          renderDeps();
        });
        idRow.appendChild(genBtn);
      } else {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn task-dialog-date-btn';
        clearBtn.textContent = t('taskDialog.clearDate');
        clearBtn.addEventListener('click', () => {
          setTaskId(draft, null);
          renderDeps();
        });
        idRow.appendChild(clearBtn);
      }
      depsEl.appendChild(idRow);
      // Vorgaenger: Chips plus Suche (nur Tasks MIT ID sind referenzierbar).
      depsEl.appendChild(
        buildDependencyRow({
          labelText: t('taskDialog.dependsOn'),
          chips: (draft.dependsOn || []).map((id) => ({ key: id, text: id })),
          onRemove: (key) => {
            setDependsOn(
              draft,
              (draft.dependsOn || []).filter((id) => id !== key),
            );
            renderDeps();
          },
          searchCandidates: async () => (await ensureAreaTasks()).filter((task) => task.id),
          candidateText: (task) => `${task.description} [${task.id}]`,
          onPick: (task) => {
            setDependsOn(draft, [...(draft.dependsOn || []), task.id]);
            renderDeps();
          },
        }),
      );
      // Nachfolger: neue Bezuege (geschrieben beim OK auf die Ziel-Zeilen).
      depsEl.appendChild(
        buildDependencyRow({
          labelText: t('taskDialog.successors'),
          chips: pendingSuccessors.map((task) => ({
            key: `${task.path}:${task.line}`,
            text: task.description,
          })),
          onRemove: (key) => {
            const idx = pendingSuccessors.findIndex((task) => `${task.path}:${task.line}` === key);
            if (idx >= 0) pendingSuccessors.splice(idx, 1);
            renderDeps();
          },
          searchCandidates: async () => {
            const tasks = await ensureAreaTasks();
            return tasks.filter(
              (task) =>
                !pendingSuccessors.some((p) => p.path === task.path && p.line === task.line),
            );
          },
          candidateText: (task) => task.description,
          onPick: (task) => {
            pendingSuccessors.push(task);
            renderDeps();
          },
        }),
      );
    };
    renderDeps();

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      recInput.removeEventListener('input', updateRecurrenceHint);
      resolve(value);
    };
    const onOk = () => {
      // Beschreibung: einzeilig (Zeilenumbrueche der Textarea werden zu
      // Leerzeichen — eine Task-Zeile bleibt eine Quelltext-Zeile).
      draft.description = descInput.value.replace(/\s*\n\s*/g, ' ').trim();
      setPriority(draft, prioSelect.value);
      setRecurrence(draft, recInput.value);
      const newChar = statusSelect.value;
      if (newChar !== originalStatusChar) {
        setStatusChar(draft, newChar);
        applyStatusDateAutomatics(draft, originalStatusChar, newChar);
      }
      // 4T-0508: Nachfolger-Bezuege brauchen die eigene ID — ohne ID wird
      // beim OK automatisch eine eindeutige erzeugt (Bereichs-IDs geprueft).
      if (pendingSuccessors.length > 0 && !draft.id) {
        const known = (areaTasks || []).map((task) => task.id).filter(Boolean);
        setTaskId(draft, generateTaskId(known));
      }
      const successors = pendingSuccessors.slice();
      const ownId = draft.id;
      if (successors.length > 0 && ownId) {
        // Ziel-Zeilen unabhaengig von der eigenen Zeile schreiben
        // (verschiedene Dateien, eigener Konflikt-Schutz pro Ziel).
        void applySuccessorLinks(successors, ownId);
      }
      finish(serializeTaskLine(draft));
    };
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      // Enter nur ausserhalb der Textarea bestaetigen (dort bricht es um).
      if (e.key === 'Enter' && e.target !== descInput) {
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
    setTimeout(() => {
      descInput.focus();
      descInput.select();
    }, 0);
  });
}

// 4T-0508: eine Abhaengigkeits-Zeile des Dialogs — Label, entfernbare
// Chips und ein Such-Feld mit Vorschlagsliste (Filter ueber den
// Kandidaten-Text, Auswahl per Klick; Kandidaten laedt der Aufrufer lazy).
function buildDependencyRow({
  labelText,
  chips,
  onRemove,
  searchCandidates,
  candidateText,
  onPick,
}) {
  const row = document.createElement('div');
  row.className = 'task-dialog-dep-row';
  const label = document.createElement('span');
  label.className = 'task-dialog-date-label';
  label.textContent = labelText;
  row.appendChild(label);
  const body = document.createElement('div');
  body.className = 'task-dialog-dep-body';
  for (const chip of chips) {
    const chipEl = document.createElement('span');
    chipEl.className = 'task-dialog-chip';
    chipEl.textContent = chip.text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'task-dialog-chip-remove';
    remove.textContent = '✕';
    remove.title = t('taskDialog.clearDate');
    remove.addEventListener('click', () => onRemove(chip.key));
    chipEl.appendChild(remove);
    body.appendChild(chipEl);
  }
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'settings-input task-dialog-dep-search';
  search.placeholder = t('taskDialog.searchTask');
  search.autocomplete = 'off';
  search.spellcheck = false;
  const suggest = document.createElement('div');
  suggest.className = 'task-dialog-suggest';
  suggest.hidden = true;
  const updateSuggest = async () => {
    const query = search.value.trim().toLowerCase();
    const candidates = await searchCandidates();
    const matches = candidates
      .filter((task) => !query || candidateText(task).toLowerCase().includes(query))
      .slice(0, 8);
    suggest.innerHTML = '';
    suggest.hidden = matches.length === 0;
    for (const task of matches) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'task-dialog-suggest-entry';
      entry.textContent = candidateText(task);
      entry.addEventListener('click', () => onPick(task));
      suggest.appendChild(entry);
    }
  };
  search.addEventListener('focus', () => void updateSuggest());
  search.addEventListener('input', () => void updateSuggest());
  body.appendChild(search);
  body.appendChild(suggest);
  row.appendChild(body);
  return row;
}

// Erledigt-/Abgebrochen-Automatik beim Status-Wechsel im Dialog — dieselbe
// Semantik wie der Ketten-Toggle (tasks.js), nur ohne Wiederholungs-Instanz.
function applyStatusDateAutomatics(draft, fromChar, toChar) {
  const fromType = taskStatusType(fromChar);
  const toType = taskStatusType(toChar);
  const today = todayIsoDate();
  if (tasksConfig.autoDone) {
    if (toType === 'DONE' && fromType !== 'DONE') setDateField(draft, 'done', { date: today });
    else if (fromType === 'DONE' && toType !== 'DONE' && draft.done) {
      setDateField(draft, 'done', null);
    }
  }
  if (tasksConfig.autoCancelled) {
    if (toType === 'CANCELLED' && fromType !== 'CANCELLED') {
      setDateField(draft, 'cancelled', { date: today });
    } else if (fromType === 'CANCELLED' && toType !== 'CANCELLED' && draft.cancelled) {
      setDateField(draft, 'cancelled', null);
    }
  }
}

// --- Kommando-Einstieg (task.editDialog) ---------------------------------------

// Neues Task-Modell fuer die Anlage auf einer leeren Zeile (Kern-Offen-
// Zeichen; das Erstellt-Datum folgt der Automatik der Task-Anlage).
function emptyTaskModel() {
  const model = parseTaskLine('- [ ] ');
  if (tasksConfig.autoCreated) setDateField(model, 'created', { date: todayIsoDate() });
  return model;
}

// Editor-Aufloesung wie die Picker-Kommandos (runDatePickerCommand in
// app-init.js): Notiz-Feld hat Vorrang, sonst der Haupt-Editor der aktiven
// Spalte im Edit-Modus.
function resolveEditorView() {
  const notes = activeNotesEditorView();
  if (notes) return notes;
  const tab = activeTab();
  if (!tab || !tab.editMode || tab.viewMode === 'rendered') return null;
  return paneEditors[state.activePaneIndex];
}

// Kommando-Handler: auf einer Task-Zeile bearbeitend, auf einer leeren
// Zeile anlegend; sonst Statusbar-Hinweis. EIN Undo-Schritt (eine
// Transaktion ersetzt die Zeile).
export async function runTaskEditDialogCommand() {
  if (!isExtensionActive('tasks')) return false;
  const view = resolveEditorView();
  if (!view || view.state.readOnly) return false;
  const lineObj = view.state.doc.lineAt(view.state.selection.main.head);
  const lineText = view.state.doc.sliceString(lineObj.from, lineObj.to);
  let model;
  let mode = 'edit';
  if (lineText.trim() === '') {
    model = emptyTaskModel();
    mode = 'create';
  } else {
    model = parseTaskLine(lineText);
    if (!model) {
      showStatusbarHint(null, { text: t('taskDialog.notATask'), duration: 2500 });
      return false;
    }
  }
  // 4T-0508: Bereichs-Kontext der Task-Suche ist die aktive Datei; die
  // eigene Zeile wird aus den Such-Kandidaten ausgefiltert.
  const tab = activeTab();
  const selfPath = tab && tab.path ? tab.path : null;
  const newText = await showTaskDialog(model, mode, {
    contextPath: selfPath,
    selfRef: selfPath ? { path: selfPath, line: lineObj.number } : null,
  });
  if (newText == null) return true;
  view.dispatch({
    changes: { from: lineObj.from, to: lineObj.to, insert: newText },
    userEvent: 'input',
  });
  view.focus();
  return true;
}

// --- Abfrage-Treffer (Bearbeiten-Knopf, 4T-0504) --------------------------------

// Registriert den Dialog als Edit-Handler der Task-Abfrage-Treffer; das
// Schreiben laeuft ueber den gemeinsamen Schreibweg der Treffer-Aktionen
// (aktiver Tab per Transaktion, sonst Main mit Konflikt-Schutz).
export function initTaskDialog() {
  setTaskQueryEditHandler(async (hit) => {
    const model = parseTaskLine(hit.taskText);
    if (!model) return;
    const newText = await showTaskDialog(model, 'edit', {
      contextPath: hit.path,
      selfRef: { path: hit.path, line: hit.line },
    });
    if (newText == null || newText === hit.taskText) return;
    await writeTaskHitLine(hit, newText);
  });
}
