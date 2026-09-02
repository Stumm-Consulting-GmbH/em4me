// 4T-000988 (Epic 3E-000196): Bereich „Verhalten" der Einstellungs-Seite.
//
// Standard-Ansichtsmodus und die Schalter des Arbeitens am Dokument
// (Link-Update beim Umbenennen, Entwurfs-Zwischenspeicher, Link beim
// Einfügen, Tabulator-Verhalten, Skript-Blöcke, Lesezeichen-Reihenfolge).
// Die Dokument-Historie liegt im Nachbar-Modul settings-history.js.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { DEFAULT_VIEW_MODE, state } from '../app/app-state.js';
// 4T-001341 (Epic 3E-000238): Die Modus-Listen kommen aus der einen Quelle.
import { DEFAULT_EDIT_VIEW_MODE, EDIT_VIEW_MODES } from '../views/view-modes.js';
import { setBookmarksAreaFirst } from '../bookmarks/bookmarks.js';
import {
  applyPerspectiveScriptsEnabled,
  isPerspectiveScriptsEnabled,
} from '../query/perspective-script-view.js';
import { persistSetting } from '../views/views.js';
import {
  applyHistorySettings,
  dirtyHistorySettings,
  renderHistorySettings,
} from './settings-history.js';
import { buildSettingsRow } from './settings-shared.js';

// Spiegelt applyRenameLinkSettings (zwei Schalter gegen den Snapshot).
function dirtyRenameLinkSettings(draft) {
  if (!draft.renameLinks) return false;
  const snap = draft.renameLinksSnapshot || {};
  return (
    draft.renameLinks.updateLinks !== snap.updateLinks || draft.renameLinks.preview !== snap.preview
  );
}

// Spiegelt applyKeepDraftsSetting (Skalar gegen den Snapshot).
function dirtyKeepDraftsSetting(draft) {
  if (typeof draft.keepUnsavedDrafts !== 'boolean') return false;
  return draft.keepUnsavedDrafts !== draft.keepUnsavedDraftsSnapshot;
}

// Spiegelt applyPasteLinkSetting (Skalar gegen den Snapshot).
function dirtyPasteLinkSetting(draft) {
  if (typeof draft.pasteUrlAsLink !== 'boolean') return false;
  return draft.pasteUrlAsLink !== draft.pasteUrlAsLinkSnapshot;
}

// Spiegelt applyBehaviorSection (View-Mode gegen den Laufzeit-Zustand plus
// die vier Unter-Blöcke des Bereichs).
export function dirtyBehaviorSection(draft) {
  const mode = draft.defaultViewMode;
  if (['rendered', 'split', 'source', 'live'].includes(mode) && mode !== state.defaultViewMode) {
    return true;
  }
  // 4T-001341 (Epic 3E-000238): zweite Ansichts-Einstellung, gleiche Mechanik.
  const editMode = draft.editViewMode;
  if (EDIT_VIEW_MODES.includes(editMode) && editMode !== state.editViewMode) {
    return true;
  }
  return (
    dirtyHistorySettings(draft) ||
    dirtyRenameLinkSettings(draft) ||
    dirtyKeepDraftsSetting(draft) ||
    dirtyPasteLinkSetting(draft) ||
    dirtyTabIndentSetting(draft) ||
    (draft.scriptsRun === true) !== isPerspectiveScriptsEnabled()
  );
}

// --- Bereich Verhalten (4T-000085) -------------------------------------------------
const VIEW_MODE_OPTION_KEYS = [
  ['rendered', 'settings.defaultViewMode.rendered'],
  ['split', 'settings.defaultViewMode.split'],
  ['source', 'settings.defaultViewMode.source'],
  ['live', 'settings.defaultViewMode.live'],
];

// 4T-001341 (Epic 3E-000238): Ziel-Ansicht des Wechsels in den Aenderungsmodus.
// Die Werte-Beschriftungen sind die der Oeffnen-Einstellung darueber — es sind
// dieselben Ansichten, und eine zweite Uebersetzung derselben Woerter liefe
// auseinander. Die Lese-Ansicht fehlt: Sie ist der Ausgangspunkt, kein Ziel.
const EDIT_VIEW_MODE_OPTION_KEYS = [
  ['split', 'settings.defaultViewMode.split'],
  ['source', 'settings.defaultViewMode.source'],
  ['live', 'settings.defaultViewMode.live'],
];

function renderEditViewModeSetting(container, draft) {
  const select = document.createElement('select');
  select.id = 'settings-edit-view-mode';
  select.className = 'settings-input';
  for (const [value, key] of EDIT_VIEW_MODE_OPTION_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = draft.editViewMode || DEFAULT_EDIT_VIEW_MODE;
  select.addEventListener('change', () => {
    draft.editViewMode = select.value;
  });
  container.appendChild(buildSettingsRow('settings.editViewMode.label', select));
}

export function renderBehaviorSection(container, draft) {
  const select = document.createElement('select');
  select.id = 'settings-default-view-mode';
  select.className = 'settings-input';
  for (const [value, key] of VIEW_MODE_OPTION_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = draft.defaultViewMode || DEFAULT_VIEW_MODE;
  select.addEventListener('change', () => {
    draft.defaultViewMode = select.value;
  });
  container.appendChild(buildSettingsRow('settings.defaultViewMode.label', select));
  renderEditViewModeSetting(container, draft);
  renderHistorySettings(container, draft);
  renderRenameLinkSettings(container, draft);
  renderKeepDraftsSetting(container, draft);
  renderPasteLinkSetting(container, draft);
  renderTabIndentSetting(container, draft);
  renderBookmarksAreaFirstSetting(container);
  renderScriptBlocksSetting(container, draft);
}

// 4T-000612 (Epic 3E-000115): Reihenfolge der Lesezeichen-Abschnitte (global,
// Default an: Bereichs-Lesezeichen oben). Bewusst kein Entwurf, sondern eine
// direkte Praeferenz (wie die Panel-Zugangs-Reihenfolge): der Schalter wirkt
// sofort (das Panel rendert neu) und persistiert unmittelbar, unabhaengig von
// Anwenden/Abbrechen. Deshalb ohne draft-/apply-/dirty-Hook.
function renderBookmarksAreaFirstSetting(container) {
  const input = document.createElement('input');
  input.id = 'settings-bookmarks-area-first';
  input.type = 'checkbox';
  input.checked = state.bookmarks.areaFirst !== false;
  input.addEventListener('change', () => {
    void setBookmarksAreaFirst(input.checked);
  });
  container.appendChild(buildSettingsRow('settings.bookmarksAreaFirst', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.bookmarksAreaFirst.hint');
  container.appendChild(hint);
}

// 4T-000656 (Epic 3E-000112): Schalter „Tabulator rückt ein" (Store-Key
// input.tabIndents, Default an). Aus lässt den Fokus weiterwandern, wie vor
// der Einstellung. In Listen und Tabellen behält die Taste in beiden
// Zuständen ihre eigene Bedeutung.
function renderTabIndentSetting(container, draft) {
  const input = document.createElement('input');
  input.id = 'settings-tab-indents';
  input.type = 'checkbox';
  input.checked = draft.tabIndents !== false;
  input.addEventListener('change', () => {
    draft.tabIndents = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.tabIndents.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.tabIndents.hint');
  container.appendChild(hint);
}

async function applyTabIndentSetting(draft) {
  if (typeof draft.tabIndents !== 'boolean') return;
  if (draft.tabIndents !== draft.tabIndentsSnapshot) {
    await persistSetting('input.tabIndents', draft.tabIndents);
    state.tabIndents = draft.tabIndents;
    draft.tabIndentsSnapshot = draft.tabIndents;
  }
}

function dirtyTabIndentSetting(draft) {
  if (typeof draft.tabIndents !== 'boolean') return false;
  return draft.tabIndents !== draft.tabIndentsSnapshot;
}

// --- 4T-000414 (Epic 3E-000078): Skript-Blöcke ausführen (Default aus) -----------
// Sicherheits-Schalter des Vertrauensmodells: Skripte stammen aus Dokumenten;
// der Warntext steht dauerhaft unter der Zeile (kein versteckter Tooltip).
function renderScriptBlocksSetting(container, draft) {
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.runScriptBlocks.group');
  container.appendChild(heading);

  const input = document.createElement('input');
  input.id = 'settings-run-script-blocks';
  input.type = 'checkbox';
  input.checked = draft.scriptsRun === true;
  input.addEventListener('change', () => {
    draft.scriptsRun = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.runScriptBlocks.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.runScriptBlocks.warn');
  container.appendChild(hint);
}

async function applyScriptBlocksSetting(draft) {
  const next = draft.scriptsRun === true;
  if (next === isPerspectiveScriptsEnabled()) return;
  applyPerspectiveScriptsEnabled(next);
  await persistSetting('scripts.run', next);
}

export async function applyBehaviorSection(draft) {
  const mode = draft.defaultViewMode;
  if (['rendered', 'split', 'source', 'live'].includes(mode) && mode !== state.defaultViewMode) {
    state.defaultViewMode = mode;
    await persistSetting('app.defaultViewMode', mode);
  }
  // 4T-001341 (Epic 3E-000238): zweite Ansichts-Einstellung, gleiche Mechanik.
  const editMode = draft.editViewMode;
  if (EDIT_VIEW_MODES.includes(editMode) && editMode !== state.editViewMode) {
    state.editViewMode = editMode;
    await persistSetting('app.editViewMode', editMode);
  }
  await applyHistorySettings(draft);
  await applyRenameLinkSettings(draft);
  await applyKeepDraftsSetting(draft);
  await applyPasteLinkSetting(draft);
  await applyTabIndentSetting(draft);
  await applyScriptBlocksSetting(draft);
}

// 4T-000346 (Epic 3E-000062): Link-Update-Einstellungen. Zwei App-weite Schalter
// (Update aktiv, Vorschau aktiv), beide Default an; die Vorschau-Option ist nur
// bedienbar, solange das Update aktiv ist.
export async function readRenameLinkSettings() {
  return {
    updateLinks: (await api.getSetting('renameUpdateLinks')) !== false,
    preview: (await api.getSetting('renameLinkPreview')) !== false,
  };
}

function renderRenameLinkSettings(container, draft) {
  const values = draft.renameLinks || { updateLinks: true, preview: true };
  const set = (key, value) => {
    if (!draft.renameLinks) draft.renameLinks = { ...values };
    draft.renameLinks[key] = value;
  };

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.renameLinks.group');
  container.appendChild(heading);

  const updateInput = document.createElement('input');
  updateInput.id = 'settings-rename-update-links';
  updateInput.type = 'checkbox';
  updateInput.checked = values.updateLinks !== false;

  const previewInput = document.createElement('input');
  previewInput.id = 'settings-rename-link-preview';
  previewInput.type = 'checkbox';
  previewInput.checked = values.preview !== false;

  const syncPreview = () => {
    previewInput.disabled = !updateInput.checked;
  };
  updateInput.addEventListener('change', () => {
    set('updateLinks', updateInput.checked);
    syncPreview();
  });
  previewInput.addEventListener('change', () => set('preview', previewInput.checked));
  syncPreview();

  container.appendChild(buildSettingsRow('settings.renameLinks.updateLinks', updateInput));
  container.appendChild(buildSettingsRow('settings.renameLinks.preview', previewInput));
}

async function applyRenameLinkSettings(draft) {
  if (!draft.renameLinks) return;
  const snap = draft.renameLinksSnapshot || {};
  const next = draft.renameLinks;
  if (next.updateLinks !== snap.updateLinks) {
    await persistSetting('renameUpdateLinks', next.updateLinks !== false);
  }
  if (next.preview !== snap.preview) {
    await persistSetting('renameLinkPreview', next.preview !== false);
  }
  draft.renameLinksSnapshot = { ...next };
}

// 4T-000369 (Epic 3E-000068): Entwurfs-Zwischenspeicher — App-weiter Schalter
// (Default an), ob nie gespeicherte Unbenannt-Tabs beim App-Ende ohne Dialog
// zwischengespeichert und beim Neustart wiederhergestellt werden.
function renderKeepDraftsSetting(container, draft) {
  const input = document.createElement('input');
  input.id = 'settings-keep-unsaved-drafts';
  input.type = 'checkbox';
  input.checked = draft.keepUnsavedDrafts !== false;
  input.addEventListener('change', () => {
    draft.keepUnsavedDrafts = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.keepUnsavedDrafts.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.keepUnsavedDrafts.hint');
  container.appendChild(hint);
}

async function applyKeepDraftsSetting(draft) {
  if (typeof draft.keepUnsavedDrafts !== 'boolean') return;
  if (draft.keepUnsavedDrafts !== draft.keepUnsavedDraftsSnapshot) {
    await persistSetting('keepUnsavedDrafts', draft.keepUnsavedDrafts);
    draft.keepUnsavedDraftsSnapshot = draft.keepUnsavedDrafts;
  }
}

// 4T-000603 (Epic 3E-000113): Schalter „URL beim Einfügen in eine Auswahl als
// Link" (Store-Key input.pasteUrlAsLink, Default an). Bei nicht-leerer Auswahl
// und einer URL in der Zwischenablage erzeugt Strg+V einen Markdown-Link, statt
// die Auswahl zu ersetzen.
function renderPasteLinkSetting(container, draft) {
  const input = document.createElement('input');
  input.id = 'settings-paste-url-as-link';
  input.type = 'checkbox';
  input.checked = draft.pasteUrlAsLink !== false;
  input.addEventListener('change', () => {
    draft.pasteUrlAsLink = input.checked;
  });
  container.appendChild(buildSettingsRow('settings.pasteUrlAsLink.label', input));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.pasteUrlAsLink.hint');
  container.appendChild(hint);
}

// Persistiert den Schalter und zieht den Laufzeit-Zustand nach, damit der
// Editor-Paste-Handler ohne Neustart den neuen Wert liest.
async function applyPasteLinkSetting(draft) {
  if (typeof draft.pasteUrlAsLink !== 'boolean') return;
  if (draft.pasteUrlAsLink !== draft.pasteUrlAsLinkSnapshot) {
    await persistSetting('input.pasteUrlAsLink', draft.pasteUrlAsLink);
    state.pasteUrlAsLink = draft.pasteUrlAsLink;
    draft.pasteUrlAsLinkSnapshot = draft.pasteUrlAsLink;
  }
}
