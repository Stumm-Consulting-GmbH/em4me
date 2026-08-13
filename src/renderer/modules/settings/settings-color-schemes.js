// 4T-0466 (Epic 3E-0086): Bereich „Farbschemas" der Einstellungs-Seite
// (kuratierte Farb-Slots, Live-Vorschau, eigene Schemas).
'use strict';

import {
  BUILTIN_SCHEMES,
  COLOR_SLOTS,
  SLOT_GROUPS,
  addCustomScheme,
  allSchemes,
  deleteCustomScheme,
  duplicateScheme,
  isBuiltinId,
  renameCustomScheme,
  resetSlotColor,
  resolveSchemeColors,
  schemeById,
  setActiveScheme,
  setSlotColor,
} from '../../../shared/color-schemes.js';
import { t } from '../../i18n.js';
import { setColorSchemeState } from '../color-schemes.js';
import { persistSetting } from '../views/views.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';

// Spiegelt applyColorSchemesSection (JSON-Diff gegen den Snapshot).
export function dirtyColorSchemesSection(draft) {
  if (!draft.colorSchemes) return false;
  return !jsonEqual(draft.colorSchemes, draft.colorSchemesSnapshot);
}

// --- Bereich Farbschemas (4T-0466, Epic 3E-0086) -------------------------------
// Modus-Zuordnung (aktives Schema je Hell/Dunkel), Schema-Verwaltung und ein
// gruppierter Slot-Editor mit nativen Farbwählern. Live-Vorschau über
// setColorSchemeState (wendet das aktive Schema des aktuellen Anzeige-Modus
// sofort an); persistiert wird erst bei Anwenden/OK. Der Editor bearbeitet das
// aktive Schema des aktuellen Anzeige-Modus (data-theme): Was man sieht,
// bearbeitet man; das dunkle Schema bearbeitet man durch Umschalten auf Dunkel.

// Fortlaufender Zähler gegen ID-Kollisionen bei schnellen Klicks.
let colorSchemeIdCounter = 0;
function nextColorSchemeId() {
  colorSchemeIdCounter += 1;
  return `custom-${Date.now()}-${colorSchemeIdCounter}`;
}

function currentThemeMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function colorSchemeLabel(scheme) {
  if (isBuiltinId(scheme.id)) return t(scheme.nameKey);
  return scheme.name || t('settings.colorSchemes.unnamed');
}

// Live-Vorschau: Draft-Zustand in das Renderer-Modul spiegeln und anwenden.
function previewColorSchemes(draft) {
  setColorSchemeState(draft.colorSchemes);
}

// Auswahl-Liste des aktiven Schemas für einen Modus (nur Schemas dieser Basis).
function buildColorSchemeSelect(id, draft, mode) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  for (const scheme of allSchemes(draft.colorSchemes)) {
    if (scheme.base !== mode) continue;
    const opt = document.createElement('option');
    opt.value = scheme.id;
    opt.textContent = colorSchemeLabel(scheme);
    select.appendChild(opt);
  }
  select.value = mode === 'dark' ? draft.colorSchemes.activeDark : draft.colorSchemes.activeLight;
  select.addEventListener('change', () => {
    draft.colorSchemes = setActiveScheme(draft.colorSchemes, mode, select.value);
    previewColorSchemes(draft);
    renderActiveSection();
  });
  return select;
}

// Slot-Editor: Slots gruppiert mit nativem Farbwähler; für mitgelieferte
// Schemas nur-lesend (kein Wähler-Input, kein Zurücksetzen).
function renderColorSchemeEditor(container, draft, scheme) {
  const isBuiltin = isBuiltinId(scheme.id);
  const resolved = resolveSchemeColors(scheme);
  const editor = document.createElement('div');
  editor.className = 'color-scheme-editor';
  for (const group of SLOT_GROUPS) {
    const groupHead = document.createElement('div');
    groupHead.className = 'color-scheme-group-head';
    groupHead.textContent = t(group.nameKey);
    editor.appendChild(groupHead);
    for (const slot of COLOR_SLOTS) {
      if (slot.group !== group.id) continue;
      const row = document.createElement('div');
      row.className = 'settings-row color-scheme-slot-row';
      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'color-scheme-slot-color';
      color.id = `settings-color-slot-${slot.id}`;
      color.value = resolved[slot.id];
      const label = document.createElement('label');
      label.htmlFor = color.id;
      label.textContent = t(slot.nameKey);
      row.append(label, color);
      if (isBuiltin) {
        color.disabled = true;
      } else {
        color.addEventListener('input', () => {
          draft.colorSchemes = setSlotColor(draft.colorSchemes, scheme.id, slot.id, color.value);
          previewColorSchemes(draft);
        });
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'btn color-scheme-slot-reset';
        reset.textContent = '↺';
        reset.title = t('settings.colorSchemes.resetSlot');
        reset.addEventListener('click', () => {
          draft.colorSchemes = resetSlotColor(draft.colorSchemes, scheme.id, slot.id);
          previewColorSchemes(draft);
          renderActiveSection();
        });
        row.appendChild(reset);
      }
      editor.appendChild(row);
    }
  }
  container.appendChild(editor);
}

export function renderColorSchemesSection(container, draft) {
  const cs = draft.colorSchemes;
  const mode = currentThemeMode();

  // 1. Modus-Zuordnung: aktives Schema je Hell/Dunkel.
  container.appendChild(
    buildSettingsRow(
      'settings.colorSchemes.schemeForLight',
      buildColorSchemeSelect('settings-color-scheme-light', draft, 'light'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.colorSchemes.schemeForDark',
      buildColorSchemeSelect('settings-color-scheme-dark', draft, 'dark'),
    ),
  );

  // 2. Verwaltung des aktiven Schemas des aktuellen Anzeige-Modus.
  const activeId = mode === 'dark' ? cs.activeDark : cs.activeLight;
  const active = schemeById(cs, activeId) || BUILTIN_SCHEMES[0];
  const isBuiltin = isBuiltinId(active.id);

  const manage = document.createElement('div');
  manage.className = 'color-scheme-manage';

  const info = document.createElement('div');
  info.className = 'color-scheme-editing-info';
  info.textContent = t('settings.colorSchemes.editingFor')
    .replace(
      '{mode}',
      t(mode === 'dark' ? 'settings.colorSchemes.modeDark' : 'settings.colorSchemes.modeLight'),
    )
    .replace('{name}', colorSchemeLabel(active));
  manage.appendChild(info);

  // 4T-0466 (Epic 3E-0086): Modus-Kopplung direkt im Bereich erklären (der
  // Editor folgt dem Anzeige-Modus; das andere Schema über den Theme-Umschalter).
  const modeHint = document.createElement('div');
  modeHint.className = 'color-scheme-mode-hint';
  modeHint.textContent = t('settings.colorSchemes.modeHint');
  manage.appendChild(modeHint);

  if (isBuiltin) {
    const note = document.createElement('div');
    note.className = 'color-scheme-builtin-note';
    note.textContent = t('settings.colorSchemes.builtinNote');
    manage.appendChild(note);
  } else {
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'settings-color-scheme-name';
    nameInput.className = 'settings-input';
    nameInput.value = active.name || '';
    nameInput.addEventListener('input', () => {
      draft.colorSchemes = renameCustomScheme(draft.colorSchemes, active.id, nameInput.value);
    });
    nameInput.addEventListener('change', () => renderActiveSection());
    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = nameInput.id;
    nameLabel.textContent = t('settings.colorSchemes.name');
    nameRow.append(nameLabel, nameInput);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn';
    del.id = 'settings-color-scheme-delete';
    del.textContent = t('settings.colorSchemes.delete');
    del.addEventListener('click', () => {
      draft.colorSchemes = deleteCustomScheme(draft.colorSchemes, active.id);
      previewColorSchemes(draft);
      renderActiveSection();
    });
    nameRow.appendChild(del);
    manage.appendChild(nameRow);
  }

  // Neu aus Vorlage (nur Schemas des aktuellen Modus als Vorlage) und Duplizieren.
  const actions = document.createElement('div');
  actions.className = 'color-scheme-actions';
  const templateSelect = document.createElement('select');
  templateSelect.id = 'settings-color-scheme-template';
  templateSelect.className = 'settings-input';
  for (const scheme of allSchemes(cs)) {
    if (scheme.base !== mode) continue;
    const opt = document.createElement('option');
    opt.value = scheme.id;
    opt.textContent = colorSchemeLabel(scheme);
    templateSelect.appendChild(opt);
  }
  templateSelect.value = active.id;
  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'btn';
  createBtn.id = 'settings-color-scheme-new';
  createBtn.textContent = t('settings.colorSchemes.newFromTemplate');
  createBtn.addEventListener('click', () => {
    const id = nextColorSchemeId();
    draft.colorSchemes = addCustomScheme(draft.colorSchemes, {
      id,
      name: t('settings.colorSchemes.newSchemeName'),
      templateId: templateSelect.value,
    });
    draft.colorSchemes = setActiveScheme(draft.colorSchemes, mode, id);
    previewColorSchemes(draft);
    renderActiveSection();
  });
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'btn';
  dupBtn.id = 'settings-color-scheme-duplicate';
  dupBtn.textContent = t('settings.colorSchemes.duplicate');
  dupBtn.addEventListener('click', () => {
    const id = nextColorSchemeId();
    const copyName = `${colorSchemeLabel(active)} ${t('settings.colorSchemes.copySuffix')}`;
    draft.colorSchemes = duplicateScheme(draft.colorSchemes, active.id, id, copyName);
    draft.colorSchemes = setActiveScheme(draft.colorSchemes, mode, id);
    previewColorSchemes(draft);
    renderActiveSection();
  });
  actions.append(templateSelect, createBtn, dupBtn);
  manage.appendChild(actions);
  container.appendChild(manage);

  // 3. Slot-Editor des aktiven Schemas.
  renderColorSchemeEditor(container, draft, active);
}

export async function applyColorSchemesSection(draft) {
  if (!draft.colorSchemes) return;
  // Nur bei echter Änderung persistieren (spart Store-Schreiben und Broadcast).
  if (JSON.stringify(draft.colorSchemes) === JSON.stringify(draft.colorSchemesSnapshot)) return;
  // Ein Store-Key trägt den ganzen Zustand; der Main broadcastet an alle
  // Fenster (auch dieses), der Empfangspfad wendet idempotent an.
  await persistSetting('colorSchemes', draft.colorSchemes);
  draft.colorSchemesSnapshot = structuredClone(draft.colorSchemes);
}
