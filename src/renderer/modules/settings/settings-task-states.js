// 4T-0204: Bereich „Task-Status" — Verwaltung der Status-Zeichen, ihrer
// Typen und Folge-Zustände samt Validierung und Anwenden.
'use strict';

import { t } from '../../i18n.js';
import {
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  applyTaskStates,
  taskStatesResolved,
  toStoredTaskStates,
} from '../task-states.js';
import { persistSetting } from '../views/views.js';
import { jsonEqual } from './settings-shared.js';

// Spiegelt applyTaskStatesSection (aufgelöste Entwurfs-Form in der
// Persistenz-Form gegen das aktuell wirksame Set).
export function dirtyTaskStatesSection(draft) {
  if (!Array.isArray(draft.taskStates)) return false;
  return !jsonEqual(
    toStoredTaskStates(resolvedTaskStatesFromDraft(draft)),
    toStoredTaskStates(taskStatesResolved),
  );
}

// --- Bereich Task-Status (4T-0204) -----------------------------------------------
// Arbeitskopie des aufgeloesten Sets fuer die Seiten-Sitzung. Default-
// Eintraege: Zeichen und Bezeichnung readonly (Label kommt aus i18n),
// Farbe und Aktiv-Haken aenderbar. Custom-Eintraege: alles aenderbar
// plus Entfernen-Button.
// 4T-0497 (Epic 3E-0090): zusaetzlich pro Zeile Typ (Semantik) und
// Folge-Symbol (Ketten-Toggle), beide auch fuer builtin-Zeilen editierbar
// (freie Typ-Zuordnung ist PO-Anforderung, z.B. '*' = DONE).

// Typ-Konstante -> i18n-Key des Anzeige-Labels (Mapping 4T-0497).
const TASK_STATE_TYPE_LABEL_KEYS = {
  TODO: 'taskState.type.todo',
  IN_PROGRESS: 'taskState.type.inProgress',
  ON_HOLD: 'taskState.type.onHold',
  DONE: 'taskState.type.done',
  CANCELLED: 'taskState.type.cancelled',
  NON_TASK: 'taskState.type.nonTask',
};

// 4T-0497: mehrfach belegte Zeichen (in Reihenfolge des ersten Auftretens).
// Grundlage der Live-Warnung und der spezifischen Sektions-Fehlermeldung.
export function duplicateTaskStateChars(taskStates) {
  const counts = new Map();
  const order = [];
  for (const s of Array.isArray(taskStates) ? taskStates : []) {
    const ch = String((s && s.char) || '');
    if (ch.length !== 1) continue;
    if (!counts.has(ch)) {
      counts.set(ch, 0);
      order.push(ch);
    }
    counts.set(ch, counts.get(ch) + 1);
  }
  return order.filter((ch) => counts.get(ch) > 1);
}

// 4T-0497: Live-Warnung unter der Liste pflegen (unsichtbar ohne Duplikate).
function updateTaskStatesWarning(warningEl, draft) {
  if (!warningEl) return;
  const dups = duplicateTaskStateChars(draft.taskStates);
  if (dups.length === 0) {
    warningEl.hidden = true;
    warningEl.textContent = '';
  } else {
    warningEl.hidden = false;
    warningEl.textContent = t('settings.taskStates.duplicateWarning').replace(
      '{chars}',
      dups.join(' '),
    );
  }
}

function renderTaskStatesEditor(listEl, draft) {
  listEl.innerHTML = '';
  draft.taskStates.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'task-state-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'ts-enabled';
    enabled.checked = !!s.enabled;
    enabled.addEventListener('change', () => {
      s.enabled = enabled.checked;
    });

    const charInput = document.createElement('input');
    charInput.type = 'text';
    charInput.className = 'settings-input ts-char';
    charInput.maxLength = 1;
    charInput.value = s.char || '';
    charInput.spellcheck = false;
    if (s.builtin) charInput.readOnly = true;
    else
      charInput.addEventListener('input', () => {
        s.char = charInput.value;
        // 4T-0497: Duplikat-Warnung folgt jeder Zeichen-Aenderung live.
        updateTaskStatesWarning(
          listEl.parentElement && listEl.parentElement.querySelector('.task-states-warning'),
          draft,
        );
      });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'settings-input ts-label';
    labelInput.value = s.label || '';
    if (s.builtin) labelInput.readOnly = true;
    else
      labelInput.addEventListener('input', () => {
        s.label = labelInput.value;
      });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'ts-color';
    colorInput.value = /^#[0-9a-fA-F]{6}$/.test(String(s.color || '')) ? s.color : '#888888';
    colorInput.addEventListener('input', () => {
      s.color = colorInput.value;
    });

    // 4T-0497: Typ-Auswahl (auch bei builtin editierbar).
    const typeSelect = document.createElement('select');
    typeSelect.className = 'settings-input ts-type';
    for (const type of TASK_STATE_TYPES) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = t(TASK_STATE_TYPE_LABEL_KEYS[type]);
      typeSelect.appendChild(opt);
    }
    typeSelect.value = TASK_STATE_TYPES.includes(s.type) ? s.type : 'TODO';
    typeSelect.addEventListener('change', () => {
      s.type = typeSelect.value;
    });

    // 4T-0497: Folge-Symbol des Ketten-Toggles (Einzelzeichen, Default 'x').
    const nextInput = document.createElement('input');
    nextInput.type = 'text';
    nextInput.className = 'settings-input ts-next';
    nextInput.maxLength = 1;
    nextInput.placeholder = 'x';
    nextInput.spellcheck = false;
    nextInput.value = s.next || '';
    nextInput.addEventListener('input', () => {
      s.next = nextInput.value;
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn ts-remove';
    remove.textContent = '✕';
    remove.title = t('settings.taskStates.remove');
    if (s.builtin) remove.style.visibility = 'hidden';
    else
      remove.addEventListener('click', () => {
        draft.taskStates.splice(idx, 1);
        renderTaskStatesEditor(listEl, draft);
      });

    row.append(enabled, charInput, labelInput, colorInput, typeSelect, nextInput, remove);
    listEl.appendChild(row);
  });
  // 4T-0497: Warnung nach jedem Neuaufbau der Liste aktualisieren.
  updateTaskStatesWarning(
    listEl.parentElement && listEl.parentElement.querySelector('.task-states-warning'),
    draft,
  );
}

export function renderTaskStatesSection(container, draft) {
  const head = document.createElement('div');
  head.className = 'task-states-head';
  for (const key of [
    'settings.taskStates.enabled',
    'settings.taskStates.char',
    'settings.taskStates.label',
    'settings.taskStates.color',
    'settings.taskStates.type',
    'settings.taskStates.next',
  ]) {
    const span = document.createElement('span');
    span.textContent = t(key);
    head.appendChild(span);
  }
  head.appendChild(document.createElement('span'));
  container.appendChild(head);

  const list = document.createElement('div');
  list.id = 'settings-task-states-list';
  list.className = 'task-states-list';
  container.appendChild(list);

  // 4T-0497: Duplikat-Warnung unter der Liste (vor dem Editor-Lauf anlegen,
  // damit renderTaskStatesEditor sie beim ersten Aufbau schon findet).
  const warning = document.createElement('div');
  warning.id = 'settings-task-states-warning';
  warning.className = 'task-states-warning';
  warning.hidden = true;
  container.appendChild(warning);

  renderTaskStatesEditor(list, draft);

  const actions = document.createElement('div');
  actions.className = 'task-states-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'btn-task-state-add';
  addBtn.className = 'btn';
  addBtn.textContent = t('settings.taskStates.add');
  addBtn.addEventListener('click', () => {
    draft.taskStates.push({
      char: '',
      builtin: false,
      color: '#888888',
      enabled: true,
      label: '',
      type: 'TODO',
      next: 'x',
    });
    renderTaskStatesEditor(list, draft);
    const last = list.lastElementChild;
    const input = last && last.querySelector('.ts-char');
    if (input) input.focus();
  });
  actions.appendChild(addBtn);
  container.appendChild(actions);
}

export function validateTaskStatesDraft(taskStates) {
  const seen = new Set();
  for (const s of taskStates) {
    const ch = String(s.char || '');
    if (ch.length !== 1) return false;
    if (TASK_STATE_FORBIDDEN_CHARS.has(ch)) return false;
    if (seen.has(ch)) return false;
    seen.add(ch);
  }
  return true;
}

export function validateTaskStatesSection(draft) {
  // 4T-0497: Duplikate zuerst mit spezifischer Meldung (welche Zeichen);
  // sonstige Fehler (leer, verbotenes Zeichen) fallen auf die bestehende
  // generische Meldung zurueck.
  const dups = duplicateTaskStateChars(draft.taskStates);
  if (dups.length > 0) {
    return t('settings.taskStates.duplicateWarning').replace('{chars}', dups.join(' '));
  }
  return validateTaskStatesDraft(draft.taskStates) ? null : t('settings.taskStates.invalid');
}

// 4T-0497: Typ-/Folge-Symbol-Normalisierung beim Anwenden (Muster der
// normalize-Helfer in task-states.js). Ungueltiger Typ -> 'TODO';
// Folge-Symbol kein Einzelzeichen oder syntaxbrechend -> 'x'.
function normalizeApplyType(type) {
  return TASK_STATE_TYPES.includes(type) ? type : 'TODO';
}

function normalizeApplyNext(next) {
  const ch = typeof next === 'string' ? next : '';
  if (ch.length !== 1 || ch === '[' || ch === ']' || ch === '\\') return 'x';
  return ch;
}

// Aufgelöste Anwenden-Form des Task-Status-Entwurfs (gemeinsame Basis von
// applyTaskStatesSection und der Dirty-Erkennung, 4T-0554).
function resolvedTaskStatesFromDraft(draft) {
  return draft.taskStates.map((s) => ({
    ...s,
    char: String(s.char || ''),
    label: s.builtin
      ? t(`taskState.${s.name}.label`)
      : String(s.label || '').trim() || String(s.char || ''),
    type: normalizeApplyType(s.type),
    next: normalizeApplyNext(s.next),
  }));
}

export async function applyTaskStatesSection(draft) {
  // Task-Status anwenden (lokal sofort; der Broadcast erreicht zusaetzlich
  // alle Fenster inkl. diesem — idempotent) und persistieren.
  const resolvedNew = resolvedTaskStatesFromDraft(draft);
  applyTaskStates(resolvedNew);
  await persistSetting('taskStates', toStoredTaskStates(resolvedNew));
  draft.taskStates = resolvedNew.map((s) => ({ ...s }));
}
