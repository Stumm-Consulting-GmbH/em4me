// 4T-002355 (Epic 3E-000184): Einstellungs-Abschnitte «Workflows» — der
// Workflow-Ordner anwendungsweit (Abschnitt `workflows`) und je Bereich
// (Abschnitt `workflowsArea` in der Gruppe «Aktueller Bereich»).
//
// Nach dem Muster der Vorlagen-Abschnitte `templates` und `templatesArea`
// (settings-templates.js, Entscheidung 3b der Konzept-Stufe): beide teilen den
// Entwurf `draft.workflows`, persistiert wird über den Haken des
// anwendungsweiten Abschnitts; der Bereichs-Ordner ersetzt den anwendungsweiten
// vollständig und wird relativ zur Bereichs-Wurzel in der Bereichsdatei
// gespeichert. Anwendungsweit unter `workflows.folder` im Einstellungs-Speicher.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { persistSetting, showStatusbarHint } from '../views/views.js';
import { refreshSettingsButtons, renderActiveSection } from './settings-mount.js';
import { kontextSchluessel } from './settings-kontext.js';
import { buildSettingsRow, jsonEqual, pageState } from './settings-shared.js';

const GLOBAL_KEY = 'workflows.folder';

// Persistenz-Form eines Ordners: getrimmt, leer heißt «nicht festgelegt».
function ordnerAus(part) {
  return String((part && part.folder) || '').trim();
}

export function dirtyWorkflowsSection(draft) {
  const values = draft.workflows;
  if (!values) return false;
  const snap = draft.workflowsSnapshot || {};
  return ordnerAus(values.global) !== snap.global;
}

export function dirtyWorkflowsAreaSection(draft) {
  const values = draft.workflows;
  if (!values || !values.hasArea) return false;
  const snap = draft.workflowsSnapshot || {};
  return !jsonEqual(bereichsAusgabe(values), snap.area);
}

// Was der Bereich speichert: der Ordner bei eingeschalteter Konfiguration,
// sonst nichts. Ein eingeschalteter Schalter ohne Ordner gilt wie beim
// Vorlagen-Ordner als «nicht festgelegt».
function bereichsAusgabe(values) {
  if (!values.areaEnabled) return null;
  const folder = ordnerAus(values.area);
  return folder ? { folder } : null;
}

/**
 * Konfigurations-Stand in die Entwurfs-Form bringen.
 *
 * @returns {Promise<{draft: object, snapshot: object}>}
 */
export async function readWorkflowsFromConfig() {
  let config;
  try {
    config = await api.workflowGetConfig();
  } catch {
    config = null;
  }
  const global = { folder: (config && config.global && config.global.folder) || '' };
  const area = { folder: (config && config.area && config.area.folder) || '' };
  return {
    draft: {
      hasArea: !!(config && config.hasArea),
      areaName: (config && config.areaName) || '',
      global,
      areaEnabled: !!(config && config.area),
      area,
    },
    snapshot: {
      global: global.folder,
      area: config && config.area ? { folder: area.folder } : null,
    },
  };
}

// Nachlade-Strecke beim Öffnen der Seite (Muster Vorlagen in settings-draft.js).
export function loadWorkflowsIntoDraft(generation) {
  return readWorkflowsFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    pageState.draft.workflows = values.draft;
    pageState.draft.workflowsSnapshot = values.snapshot;
    if (['workflows', 'workflowsArea'].includes(pageState.activeSectionId)) renderActiveSection();
  });
}

// Bereichs-Wechsel einer offenen Seite: nur der Bereichs-Anteil samt Snapshot
// wird ersetzt, eine offene anwendungsweite Änderung bleibt.
export function reloadWorkflowsAreaPart(generation) {
  return readWorkflowsFromConfig().then((values) => {
    if (generation !== pageState.generation || !pageState.draft) return;
    const draft = pageState.draft;
    if (draft.workflows) {
      draft.workflows.hasArea = values.draft.hasArea;
      draft.workflows.areaName = values.draft.areaName;
      draft.workflows.areaEnabled = values.draft.areaEnabled;
      draft.workflows.area = values.draft.area;
      if (draft.workflowsSnapshot) draft.workflowsSnapshot.area = values.snapshot.area;
    }
    if (pageState.activeSectionId === 'workflowsArea') renderActiveSection();
  });
}

// Ordner-Zeile mit Eingabe und Ordner-Auswahl des Betriebssystems; toRelative
// wandelt die Auswahl für den Bereich in den wurzel-relativen Pfad.
function buildFolderRow(container, part, idPrefix, toRelative) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-templates-folder-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `${idPrefix}-folder`;
  input.className = 'settings-input settings-templates-folder';
  input.placeholder = t('settings.workflows.folderPlaceholder');
  input.value = part.folder;
  input.addEventListener('input', () => {
    part.folder = input.value;
  });
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.id = `${idPrefix}-folder-browse`;
  browseBtn.className = 'btn';
  browseBtn.textContent = t('settings.workflows.folderBrowse');
  browseBtn.addEventListener('click', async () => {
    let result;
    try {
      result = await api.templatesChooseFolder('workflows');
    } catch {
      result = null;
    }
    if (!result || !result.ok || !result.path) return;
    const value = toRelative ? toRelative(result.path) : result.path;
    part.folder = value;
    input.value = value;
    // Mutation nach dem await: die Änderungs-Erkennung explizit nachziehen.
    refreshSettingsButtons();
  });
  const row = document.createElement('div');
  row.className = 'settings-row';
  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = t('settings.workflows.folderLabel');
  wrap.append(input, browseBtn);
  row.append(label, wrap);
  container.appendChild(row);
}

function ladeHinweis(container) {
  const loading = document.createElement('p');
  loading.className = 'settings-row-hint';
  loading.textContent = t('settings.workflows.loading');
  container.appendChild(loading);
}

export function renderWorkflowsSection(container, draft) {
  const values = draft.workflows;
  if (!values) return ladeHinweis(container);
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.workflows.intro');
  container.appendChild(intro);
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.workflows.globalGroup');
  container.appendChild(heading);
  buildFolderRow(container, values.global, 'settings-workflows-global', null);
}

export function renderWorkflowsAreaSection(container, draft) {
  const values = draft.workflows;
  if (!values) return ladeHinweis(container);
  // Übergangs-Moment eines Bereichs-Wechsels (Muster renderTemplatesAreaSection).
  if (!values.hasArea) return;
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t(
    kontextSchluessel({
      area: 'settings.workflows.areaGroup',
      book: 'settings.workflows.bookGroup',
      shelf: 'settings.workflows.shelfGroup',
    }),
  ).replace('{name}', values.areaName);
  container.appendChild(heading);
  const enabledInput = document.createElement('input');
  enabledInput.id = 'settings-workflows-area-enabled';
  enabledInput.type = 'checkbox';
  enabledInput.checked = values.areaEnabled === true;
  enabledInput.addEventListener('change', () => {
    values.areaEnabled = enabledInput.checked;
    renderActiveSection();
  });
  container.appendChild(buildSettingsRow('settings.workflows.areaEnabled', enabledInput));
  if (!values.areaEnabled) return;
  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.workflows.areaHint');
  container.appendChild(hint);
  buildFolderRow(container, values.area, 'settings-workflows-area', (absPath) => {
    // Innerhalb des Bereichs wurzel-relativ (umzugsfest), außerhalb absolut.
    if (!state.areaPath) return absPath;
    const rel = api.relative(state.areaPath, absPath);
    return rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel) ? rel : absPath;
  });
}

export async function applyWorkflowsSection(draft) {
  const values = draft.workflows;
  if (!values) return;
  const snap = draft.workflowsSnapshot || {};
  const globalOut = ordnerAus(values.global);
  if (globalOut !== snap.global) await persistSetting(GLOBAL_KEY, globalOut);
  let areaOut = snap.area === undefined ? null : snap.area;
  if (values.hasArea) {
    const gewuenscht = bereichsAusgabe(values);
    if (!jsonEqual(gewuenscht, snap.area)) {
      let result;
      try {
        result = await api.workflowSetAreaConfig(gewuenscht);
      } catch {
        result = null;
      }
      if (result && result.ok) {
        areaOut = gewuenscht;
      } else {
        // Eine defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
        showStatusbarHint(null, {
          text: t('settings.workflows.areaWriteFailed'),
          error: true,
          duration: 4000,
        });
      }
    }
  }
  draft.workflowsSnapshot = { global: globalOut, area: areaOut };
}
