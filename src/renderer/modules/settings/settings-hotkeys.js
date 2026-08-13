// 4T-0208 (Epic 3E-0015): Bereich „Tastenkürzel" — Editor der Bindungen
// samt Tasten-Capture.
//
// 4T-0988 (Epic 3E-0196): Der Capture-Zustand ist modul-lokal; andere
// Module erreichen ihn ausschließlich über die Zugriffs-Funktionen
// (cancelHotkeyCapture, disarmHotkeysResetAll).
'use strict';

import {
  bindingToDisplayString,
  eventToBinding,
  isBindingCapturable,
  normalizeBinding,
} from '../../../shared/commands/command-bindings.js';
import {
  COMMANDS,
  COMMAND_CATEGORIES,
  findBindingConflict,
  findDuplicateBindings,
  mergeBindings,
} from '../../../shared/commands/commands.js';
import { disabledCommandIdSet } from '../../../shared/extensions/extensions-core.js';
import { t } from '../../i18n.js';
import { state } from '../app/app-state.js';
import { localizeKey, splitShortcutKeys } from '../editor/autocomplete-help.js';
import { getDisabledExtensionIds } from '../extensions/extension-lifecycle.js';
import { persistSetting } from '../views/views.js';
import { jsonEqual, pageState } from './settings-shared.js';

// Spiegelt applyHotkeysSection (Overrides gegen den wirksamen Stand).
export function dirtyHotkeysSection(draft) {
  if (!draft.hotkeys) return false;
  return !jsonEqual(hotkeysDraftToOverrides(draft.hotkeys), state.hotkeyOverrides || {});
}

// --- Bereich Tastenkürzel (4T-0208, Epic 3E-0015) ---------------------------------
// Tabelle aller Registry-Kommandos in den fuenf Hilfe-Gruppen, Hotkey-
// Capture pro Zeile, Konflikt-Erkennung gegen den Draft-Stand und die
// fixen Bindings, Einzel- und Gesamt-Reset. Persistiert werden nur
// Abweichungen vom Default (Store-Key 'hotkeys', siehe 4T-0207).

// Aktiver Capture-Zustand: { commandId, interim, warning } | null.
// warning: { kind: 'notAllowed' } | { kind: 'fixed', descKey }
//        | { kind: 'command', otherId, binding }.
let hotkeyCapture = null;
// Zwei-Schritt-Zustand des Gesamt-Reset-Buttons (erster Klick bewaffnet,
// zweiter fuehrt aus; Neuoeffnen der Seite entwaffnet).
let hotkeysResetAllArmed = false;
// DOM-Referenz der zuletzt gerenderten Tastenkuerzel-Liste (Bereich kann
// gerade nicht montiert sein — dann entfallen Re-Renders einfach).
let hotkeysListEl = null;

// 4T-0988 (Epic 3E-0196): Entwaffnet den Gesamt-Reset. Die Entwurfs-Strecke
// setzt den Zustand beim Neu-Öffnen und beim Schließen der Seite zurück und
// erreicht ihn ausschließlich hierüber (kein beschreibbares Binding über
// eine Modul-Grenze).
export function disarmHotkeysResetAll() {
  hotkeysResetAllArmed = false;
}

function defaultBindingOf(cmd) {
  return cmd.defaultBindings.length > 0 ? cmd.defaultBindings[0] : '';
}

export function buildHotkeysDraftFromState() {
  const effective = mergeBindings(state.hotkeyOverrides);
  const draft = {};
  for (const cmd of COMMANDS) {
    const bindings = effective[cmd.id] || [];
    draft[cmd.id] = bindings.length > 0 ? bindings[0] : '';
  }
  return draft;
}

// Bindet ein Binding als <kbd>-Folge in den Container (lokalisierte
// Tasten-Tokens ueber die bestehende Hilfe-Pipeline); unbelegt als '—'.
function renderBindingKbds(container, binding) {
  container.innerHTML = '';
  if (!binding) {
    container.textContent = '—';
    return;
  }
  const display = bindingToDisplayString(binding);
  const parts = splitShortcutKeys(display);
  parts.forEach((part, i) => {
    if (i > 0) container.appendChild(document.createTextNode(' + '));
    const kbd = document.createElement('kbd');
    kbd.textContent = localizeKey(part);
    container.appendChild(kbd);
  });
}

// Modifier-Zwischenstand waehrend des Captures ("Strg+Umschalt+…").
function captureInterimText(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push(localizeKey('Strg'));
  if (e.altKey) parts.push(localizeKey('Alt'));
  if (e.shiftKey) parts.push(localizeKey('Umschalt'));
  parts.push('…');
  return parts.join(' + ');
}

function hotkeyRowEl(commandId) {
  return hotkeysListEl && hotkeysListEl.isConnected
    ? hotkeysListEl.querySelector(`.hotkey-row[data-command-id="${commandId}"]`)
    : null;
}

function buildHotkeyRow(cmd, hotkeysDraft) {
  const row = document.createElement('div');
  row.className = 'hotkey-row';
  row.dataset.commandId = cmd.id;
  const capturing = !!(hotkeyCapture && hotkeyCapture.commandId === cmd.id);
  if (capturing) row.classList.add('capturing');

  const label = document.createElement('span');
  label.className = 'hotkey-label';
  label.textContent = t(cmd.labelKey);
  label.title = cmd.id;

  const binding = document.createElement('span');
  binding.className = 'hotkey-binding';
  if (capturing) {
    binding.textContent = hotkeyCapture.interim || t('settings.hotkeys.capturePrompt');
    binding.classList.add('capturing');
  } else {
    renderBindingKbds(binding, hotkeysDraft[cmd.id]);
  }

  const actions = document.createElement('span');
  actions.className = 'hotkey-actions';
  if (capturing) {
    // Im Capture-Zustand: Binding entfernen oder Capture abbrechen.
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn hotkey-remove';
    removeBtn.textContent = t('settings.hotkeys.remove');
    removeBtn.addEventListener('click', () => {
      hotkeysDraft[cmd.id] = '';
      finishHotkeyCapture();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn hotkey-capture-cancel';
    cancelBtn.textContent = t('settings.hotkeys.cancel');
    cancelBtn.addEventListener('click', () => cancelHotkeyCapture());
    actions.append(removeBtn, cancelBtn);
  } else {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn hotkey-edit';
    editBtn.textContent = t('settings.hotkeys.edit');
    editBtn.addEventListener('click', () => startHotkeyCapture(cmd.id));
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn hotkey-reset';
    resetBtn.textContent = '⟲';
    const def = defaultBindingOf(cmd);
    resetBtn.title = t('settings.hotkeys.resetTitle').replace(
      '{default}',
      def ? bindingToDisplayString(def) : '—',
    );
    resetBtn.disabled =
      normalizeBinding(hotkeysDraft[cmd.id] || '') === normalizeBinding(def || '');
    resetBtn.addEventListener('click', () => {
      // 4T-0211 (Hotfix 0.28.1): Der Default kann inzwischen von einem
      // anderen Kommando belegt sein (z.B. nach "Ueberschreiben"). Dann
      // dieselbe Inline-Warnung wie beim Capture statt eines stillen
      // Setzens — sonst entsteht ein doppelt vergebenes Binding.
      const conflict = def ? findBindingConflict(hotkeysDraft, cmd.id, def) : null;
      if (conflict) {
        startHotkeyCapture(cmd.id);
        hotkeyCapture.warning =
          conflict.type === 'command'
            ? { kind: 'command', otherId: conflict.commandId, binding: def }
            : { kind: 'fixed', descKey: conflict.descKey };
        renderHotkeysEditor();
        return;
      }
      hotkeysDraft[cmd.id] = def;
      renderHotkeysEditor();
    });
    actions.append(editBtn, resetBtn);
  }

  row.append(label, binding, actions);

  // Konflikt-/Hinweis-Box unterhalb der Zeile (nur im Capture-Zustand).
  if (capturing && hotkeyCapture.warning) {
    const warning = hotkeyCapture.warning;
    const box = document.createElement('div');
    box.className = 'hotkey-conflict';
    const text = document.createElement('span');
    if (warning.kind === 'notAllowed') {
      text.textContent = t('settings.hotkeys.notAllowed');
    } else if (warning.kind === 'fixed') {
      text.textContent = t('settings.hotkeys.conflictFixed').replace(
        '{command}',
        t(warning.descKey),
      );
    } else {
      const other = COMMANDS.find((c) => c.id === warning.otherId);
      text.textContent = t('settings.hotkeys.conflict').replace(
        '{command}',
        other ? t(other.labelKey) : warning.otherId,
      );
    }
    box.appendChild(text);
    if (warning.kind === 'command') {
      const overwriteBtn = document.createElement('button');
      overwriteBtn.type = 'button';
      overwriteBtn.className = 'btn hotkey-overwrite';
      overwriteBtn.textContent = t('settings.hotkeys.overwrite');
      overwriteBtn.addEventListener('click', () => {
        // Das andere Kommando verliert sein Binding ('—').
        hotkeysDraft[warning.otherId] = '';
        hotkeysDraft[cmd.id] = warning.binding;
        finishHotkeyCapture();
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn hotkey-conflict-cancel';
      cancelBtn.textContent = t('settings.hotkeys.cancel');
      cancelBtn.addEventListener('click', () => cancelHotkeyCapture());
      box.append(overwriteBtn, cancelBtn);
    }
    row.appendChild(box);
  }
  return row;
}

function renderHotkeysEditor() {
  if (!hotkeysListEl || !hotkeysListEl.isConnected || !pageState.draft) return;
  const hotkeysDraft = pageState.draft.hotkeys;
  // 4T-0294: Kommandos effektiv deaktivierter Erweiterungen ausblenden.
  const disabledCommands = disabledCommandIdSet(getDisabledExtensionIds());
  hotkeysListEl.innerHTML = '';
  for (const categoryKey of COMMAND_CATEGORIES) {
    const cmds = COMMANDS.filter(
      (c) => c.categoryKey === categoryKey && !disabledCommands.has(c.id),
    );
    if (cmds.length === 0) continue;
    const heading = document.createElement('h4');
    heading.className = 'hotkeys-group-title';
    heading.textContent = t(categoryKey);
    hotkeysListEl.appendChild(heading);
    for (const cmd of cmds) hotkeysListEl.appendChild(buildHotkeyRow(cmd, hotkeysDraft));
  }
}

// Capture-Listener: keydown in der Capture-Phase MIT stopPropagation —
// laeuft damit vor dem globalen Kommando-Dispatcher (window, Bubble), der
// Esc-Kaskade und den CodeMirror-Keymaps. Tab wird als Taste erfasst,
// nicht als Fokus-Wechsel (preventDefault).
function onHotkeyCaptureKeydown(e) {
  if (!hotkeyCapture || !pageState.draft) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    cancelHotkeyCapture();
    return;
  }
  const binding = eventToBinding(e);
  if (!binding) {
    // Reiner Modifier-Druck: Zwischenstand anzeigen.
    hotkeyCapture.interim = captureInterimText(e);
    hotkeyCapture.warning = null;
    renderHotkeysEditor();
    return;
  }
  hotkeyCapture.interim = null;
  if (!isBindingCapturable(binding)) {
    hotkeyCapture.warning = { kind: 'notAllowed' };
    renderHotkeysEditor();
    return;
  }
  const hotkeysDraft = pageState.draft.hotkeys;
  const conflict = findBindingConflict(hotkeysDraft, hotkeyCapture.commandId, binding);
  if (!conflict) {
    hotkeysDraft[hotkeyCapture.commandId] = binding;
    finishHotkeyCapture();
    return;
  }
  if (conflict.type === 'fixed') {
    hotkeyCapture.warning = { kind: 'fixed', descKey: conflict.descKey };
  } else {
    hotkeyCapture.warning = { kind: 'command', otherId: conflict.commandId, binding };
  }
  renderHotkeysEditor();
}

// Klick ausserhalb der Capture-Zeile bricht das Capture ab.
function onHotkeyCaptureMousedown(e) {
  if (!hotkeyCapture) return;
  const row = hotkeyRowEl(hotkeyCapture.commandId);
  if (row && row.contains(e.target)) return;
  cancelHotkeyCapture();
}

function startHotkeyCapture(commandId) {
  cancelHotkeyCapture();
  hotkeyCapture = { commandId, interim: null, warning: null };
  document.addEventListener('keydown', onHotkeyCaptureKeydown, true);
  document.addEventListener('mousedown', onHotkeyCaptureMousedown, true);
  renderHotkeysEditor();
}

function teardownHotkeyCaptureListeners() {
  document.removeEventListener('keydown', onHotkeyCaptureKeydown, true);
  document.removeEventListener('mousedown', onHotkeyCaptureMousedown, true);
}

export function cancelHotkeyCapture() {
  if (!hotkeyCapture) return;
  hotkeyCapture = null;
  teardownHotkeyCaptureListeners();
  renderHotkeysEditor();
}

function finishHotkeyCapture() {
  hotkeyCapture = null;
  teardownHotkeyCaptureListeners();
  renderHotkeysEditor();
}

// Gesamt-Reset (zweistufig): erster Klick bewaffnet den Button mit dem
// Bestaetigungs-Text, der zweite setzt alle Kommandos auf den Default.
function handleHotkeysResetAllClick(btn, draft) {
  if (!hotkeysResetAllArmed) {
    hotkeysResetAllArmed = true;
    btn.textContent = t('settings.hotkeys.resetAllConfirm');
    btn.classList.add('armed');
    return;
  }
  for (const cmd of COMMANDS) {
    draft.hotkeys[cmd.id] = defaultBindingOf(cmd);
  }
  hotkeysResetAllArmed = false;
  btn.textContent = t('settings.hotkeys.resetAll');
  btn.classList.remove('armed');
  cancelHotkeyCapture();
  renderHotkeysEditor();
}

// Liefert das Override-Objekt fuer den Store: nur normalisierte
// Abweichungen vom Default ('' = bewusst entbunden).
export function hotkeysDraftToOverrides(hotkeysDraft) {
  const overrides = {};
  for (const cmd of COMMANDS) {
    const def = defaultBindingOf(cmd);
    const cur = hotkeysDraft[cmd.id] !== undefined ? hotkeysDraft[cmd.id] : def;
    if (normalizeBinding(cur || '') !== normalizeBinding(def || '')) {
      overrides[cmd.id] = cur || '';
    }
  }
  return overrides;
}

export function renderHotkeysSection(container, draft) {
  const hint = document.createElement('p');
  hint.className = 'hotkeys-hint';
  hint.textContent = t('settings.hotkeys.hint');
  container.appendChild(hint);

  const list = document.createElement('div');
  list.id = 'settings-hotkeys-list';
  list.className = 'hotkeys-list';
  container.appendChild(list);
  hotkeysListEl = list;
  renderHotkeysEditor();

  const actions = document.createElement('div');
  actions.className = 'hotkeys-actions';
  const resetAllBtn = document.createElement('button');
  resetAllBtn.type = 'button';
  resetAllBtn.id = 'btn-hotkeys-reset-all';
  resetAllBtn.className = 'btn';
  resetAllBtn.textContent = t(
    hotkeysResetAllArmed ? 'settings.hotkeys.resetAllConfirm' : 'settings.hotkeys.resetAll',
  );
  resetAllBtn.classList.toggle('armed', hotkeysResetAllArmed);
  resetAllBtn.addEventListener('click', () => handleHotkeysResetAllClick(resetAllBtn, draft));
  actions.appendChild(resetAllBtn);
  container.appendChild(actions);
}

// 4T-0211 (Hotfix 0.28.1): Sicherheitsnetz — ein Draft mit doppelt
// vergebenen Bindings blockiert Anwenden/OK komplett mit lokalisiertem
// Hinweis (Muster Task-Status-Validierung).
export function validateHotkeysSection(draft) {
  const duplicates = findDuplicateBindings(draft.hotkeys);
  if (duplicates.length === 0) return null;
  const first = duplicates[0];
  const labels = first.commandIds
    .map((id) => {
      const cmd = COMMANDS.find((c) => c.id === id);
      return cmd ? t(cmd.labelKey) : id;
    })
    .join(', ');
  return t('settings.hotkeys.duplicate')
    .replace('{binding}', bindingToDisplayString(first.binding))
    .replace('{commands}', labels);
}

export async function applyHotkeysSection(draft) {
  // Hotkey-Overrides persistieren (nur bei Aenderung gegenueber dem
  // aktuellen Stand — der Main broadcastet 'hotkeys:changed' an alle
  // Fenster inkl. diesem und baut die Menues neu; der Empfangspfad in
  // app-init wendet Dispatcher-Map und Editor-Keymap idempotent an).
  const overrides = hotkeysDraftToOverrides(draft.hotkeys);
  if (JSON.stringify(overrides) !== JSON.stringify(state.hotkeyOverrides || {})) {
    await persistSetting('hotkeys', overrides);
  }
}
