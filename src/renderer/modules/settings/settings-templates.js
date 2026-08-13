// 4T-0428 (Epic 3E-0080) und 4T-0555 (Epic 3E-0100): Bereich „Vorlagen"
// (globaler Ordner und Regeln) samt der Bereichs-Übersteuerung als eigener
// Sektion der Gruppe „Aktueller Bereich".
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { persistSetting, showStatusbarHint } from '../views/views.js';
import { refreshSettingsButtons, renderActiveSection } from './settings-mount.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';

// Spiegelt den globalen Teil von applyTemplatesSection (normalisierte
// Persistenz-Form gegen den Snapshot). Der Bereichs-Teil gehört zur
// Sektion templatesArea (4T-0555).
export function dirtyTemplatesSection(draft) {
  const values = draft.templates;
  if (!values) return false;
  const snap = draft.templatesSnapshot || {};
  return !jsonEqual(normalizedTemplatesPart(values.global), snap.global);
}

// Spiegelt den Bereichs-Teil von applyTemplatesSection (4T-0555).
export function dirtyTemplatesAreaSection(draft) {
  const values = draft.templates;
  if (!values || !values.hasArea) return false;
  const snap = draft.templatesSnapshot || {};
  const areaOut = values.areaEnabled ? normalizedTemplatesPart(values.area) : null;
  return !jsonEqual(areaOut, snap.area);
}

// Konfigurations-Stand in die Entwurfs-Form bringen: leere Strings statt
// null, Regel-Listen als bearbeitbare Kopien; snapshot trägt die
// normalisierte Form für den Nur-bei-Änderung-Persist.
export async function readTemplatesFromConfig() {
  let config;
  try {
    config = await api.templatesGetConfig();
  } catch {
    config = null;
  }
  const toDraftPart = (part) => ({
    folder: part && part.folder ? part.folder : '',
    rules:
      part && Array.isArray(part.rules)
        ? part.rules.map((r) => ({ folder: r.folder, template: r.template }))
        : [],
  });
  const global = toDraftPart(config && config.global);
  const area = toDraftPart(config && config.area);
  return {
    draft: {
      hasArea: !!(config && config.hasArea),
      areaName: (config && config.areaName) || '',
      global,
      areaEnabled: !!(config && config.area),
      area,
    },
    snapshot: {
      global: normalizedTemplatesPart(global),
      area: config && config.area ? normalizedTemplatesPart(area) : null,
    },
  };
}

// Persistenz-Form eines Konfigurations-Teils: getrimmter Ordner, Regeln ohne
// leere Vorlagen-Einträge (komplett leere Zeilen entfallen still).
function normalizedTemplatesPart(part) {
  return {
    folder: String(part.folder || '').trim(),
    rules: (part.rules || [])
      .map((r) => ({
        folder: String(r.folder || '').trim(),
        template: String(r.template || '').trim(),
      }))
      .filter((r) => r.template !== ''),
  };
}

// Regel-Tabelle (Ordner → Vorlage) mit Hinzufügen/Entfernen. Strukturelle
// Änderungen rendern den Bereich neu (renderActiveSection), Text-Eingaben
// schreiben nur in den Entwurf.
function buildTemplatesRulesEditor(container, rules, idPrefix) {
  const label = document.createElement('p');
  label.className = 'settings-row-hint';
  label.textContent = t('settings.templates.rulesLabel');
  container.appendChild(label);
  rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-templates-rule';
    const folderInput = document.createElement('input');
    folderInput.type = 'text';
    folderInput.id = `${idPrefix}-rule-folder-${idx}`;
    folderInput.className = 'settings-input settings-templates-rule-folder';
    folderInput.placeholder = t('settings.templates.ruleFolderPlaceholder');
    folderInput.value = rule.folder;
    folderInput.addEventListener('input', () => {
      rule.folder = folderInput.value;
    });
    const templateInput = document.createElement('input');
    templateInput.type = 'text';
    templateInput.id = `${idPrefix}-rule-template-${idx}`;
    templateInput.className = 'settings-input settings-templates-rule-template';
    templateInput.placeholder = t('settings.templates.ruleTemplatePlaceholder');
    templateInput.value = rule.template;
    templateInput.addEventListener('input', () => {
      rule.template = templateInput.value;
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = `${idPrefix}-rule-remove-${idx}`;
    removeBtn.className = 'btn settings-templates-rule-remove';
    removeBtn.textContent = t('settings.templates.ruleRemove');
    removeBtn.addEventListener('click', () => {
      rules.splice(idx, 1);
      renderActiveSection();
    });
    row.append(folderInput, templateInput, removeBtn);
    container.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = `${idPrefix}-rule-add`;
  addBtn.className = 'btn settings-templates-rule-add';
  addBtn.textContent = t('settings.templates.ruleAdd');
  addBtn.addEventListener('click', () => {
    rules.push({ folder: '', template: '' });
    renderActiveSection();
  });
  container.appendChild(addBtn);
}

// Ordner-Zeile (Text-Eingabe plus OS-Ordner-Auswahl). toRelative wandelt die
// Auswahl für die Bereichs-Gruppe in den wurzel-relativen Pfad, wenn der
// Ordner im Bereich liegt (absolute Angaben bleiben erlaubt).
function buildTemplatesFolderRow(container, part, idPrefix, toRelative) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-templates-folder-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `${idPrefix}-folder`;
  input.className = 'settings-input settings-templates-folder';
  input.placeholder = t('settings.templates.folderPlaceholder');
  input.value = part.folder;
  input.addEventListener('input', () => {
    part.folder = input.value;
  });
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.id = `${idPrefix}-folder-browse`;
  browseBtn.className = 'btn';
  browseBtn.textContent = t('settings.templates.folderBrowse');
  browseBtn.addEventListener('click', async () => {
    let result;
    try {
      result = await api.templatesChooseFolder();
    } catch {
      result = null;
    }
    if (!result || !result.ok || !result.path) return;
    const value = toRelative ? toRelative(result.path) : result.path;
    part.folder = value;
    input.value = value;
    // Mutation nach dem await: die delegierten Dokument-Listener der
    // Dirty-Erkennung liefen vor dem Dialog — explizit nachziehen (4T-0554).
    refreshSettingsButtons();
  });
  const row = document.createElement('div');
  row.className = 'settings-row';
  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.textContent = t('settings.templates.folderLabel');
  wrap.append(input, browseBtn);
  row.append(label, wrap);
  container.appendChild(row);
}

export function renderTemplatesSection(container, draft) {
  const values = draft.templates;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.templates.loading');
    container.appendChild(loading);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.templates.intro');
  container.appendChild(intro);

  // Globale Konfiguration (Fallback ohne Bereichs-Sektion).
  const globalHeading = document.createElement('h4');
  globalHeading.className = 'settings-export-group-title';
  globalHeading.textContent = t('settings.templates.globalGroup');
  container.appendChild(globalHeading);
  buildTemplatesFolderRow(container, values.global, 'settings-templates-global', null);
  buildTemplatesRulesEditor(container, values.global.rules, 'settings-templates-global');
  // 4T-0555 (Epic 3E-0100): Die Bereichs-Konfiguration lebt als eigene
  // Sektion in der Navigations-Gruppe „Aktueller Bereich"
  // (renderTemplatesAreaSection) — hier bleibt der globale Teil.
}

// --- 4T-0555 (Epic 3E-0100): Bereichs-Sektion Vorlagen -------------------------
// Bereichs-Konfiguration der Vorlagen (übersteuert die globale vollständig);
// vormals ein hasArea-Block innerhalb des Bereichs „Vorlagen"
// (PO-Entscheidung E3: hybride Bereiche aufteilen). Liest und schreibt
// denselben draft.templates; die Bereichsdatei entsteht erst beim ersten
// Setzen.
export function renderTemplatesAreaSection(container, draft) {
  const values = draft.templates;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.templates.loading');
    container.appendChild(loading);
    return;
  }
  // Guard für den Übergangs-Moment eines Bereichs-Wechsels (Muster
  // renderHistoryAreaSection); regulär ist die Sektion ohne Bereich nicht
  // erreichbar.
  if (!values.hasArea) return;
  const areaHeading = document.createElement('h4');
  areaHeading.className = 'settings-export-group-title';
  areaHeading.textContent = t('settings.templates.areaGroup').replace('{name}', values.areaName);
  container.appendChild(areaHeading);
  const enabledInput = document.createElement('input');
  enabledInput.id = 'settings-templates-area-enabled';
  enabledInput.type = 'checkbox';
  enabledInput.checked = values.areaEnabled === true;
  enabledInput.addEventListener('change', () => {
    values.areaEnabled = enabledInput.checked;
    renderActiveSection();
  });
  container.appendChild(buildSettingsRow('settings.templates.areaEnabled', enabledInput));
  if (values.areaEnabled) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.textContent = t('settings.templates.areaHint');
    container.appendChild(hint);
    buildTemplatesFolderRow(container, values.area, 'settings-templates-area', (absPath) => {
      // Auswahl innerhalb des Bereichs wird wurzel-relativ gespeichert
      // (umzugsfest); außerhalb bleibt der absolute Pfad (toleriert).
      if (!state.areaPath) return absPath;
      const rel = api.relative(state.areaPath, absPath);
      return rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel) ? rel : absPath;
    });
    buildTemplatesRulesEditor(container, values.area.rules, 'settings-templates-area');
  }
}

// Regel-Zeilen mit Ordner, aber ohne Vorlage sind unvollständig (komplett
// leere Zeilen entfallen beim Anwenden still). Gemeinsamer Prüf-Helfer der
// globalen und der Bereichs-Sektion (4T-0555: getrennte validate-Hooks,
// damit der Fehler-Punkt am richtigen Navigations-Eintrag erscheint).
function templatesRulesError(part) {
  for (const rule of part.rules) {
    if (String(rule.template || '').trim() === '' && String(rule.folder || '').trim() !== '') {
      return t('settings.templates.error.ruleTemplate');
    }
  }
  return null;
}

export function validateTemplatesSection(draft) {
  const values = draft.templates;
  if (!values) return null;
  return templatesRulesError(values.global);
}

export function validateTemplatesAreaSection(draft) {
  const values = draft.templates;
  if (!values || !values.hasArea || !values.areaEnabled) return null;
  return templatesRulesError(values.area);
}

export async function applyTemplatesSection(draft) {
  const values = draft.templates;
  if (!values) return;
  const snap = draft.templatesSnapshot || {};
  const globalOut = normalizedTemplatesPart(values.global);
  if (JSON.stringify(globalOut) !== JSON.stringify(snap.global)) {
    await persistSetting('templates.folder', globalOut.folder);
    await persistSetting('templates.rules', globalOut.rules);
  }
  let areaOut = snap.area === undefined ? null : snap.area;
  if (values.hasArea) {
    areaOut = values.areaEnabled ? normalizedTemplatesPart(values.area) : null;
    if (JSON.stringify(areaOut) !== JSON.stringify(snap.area)) {
      let result;
      try {
        result = await api.templatesSetAreaConfig(areaOut);
      } catch {
        result = null;
      }
      if (!result || !result.ok) {
        // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
        showStatusbarHint(null, {
          text: t('settings.templates.areaWriteFailed'),
          error: true,
          duration: 4000,
        });
        areaOut = snap.area === undefined ? null : snap.area;
      }
    }
  }
  draft.templatesSnapshot = { global: globalOut, area: areaOut };
}
