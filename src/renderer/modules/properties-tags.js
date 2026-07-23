// Properties-Editor (Typ-Inferenz, Round-Trip-Speichern) und Sichtbarkeit der Properties-/Tag-Sektionen.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { t } from '../i18n.js';

// 4T-0491 (Epic 3E-0093): isolierte Undo-Einheit der Komplett-Übernahme.
import { isolateHistory } from '@codemirror/commands';
import { api, getDocText } from './api.js';
// 4T-0294 (Epic 3E-0052): Tag-Panel gehoert zur Tag-Erweiterung.
import { isExtensionActive } from './extension-lifecycle.js';
import { applyRenderPipeline } from './render-mermaid.js';
import { getPaneEls, state } from './app-state.js';
import { paneEditors, syncEditorForPane, updateWindowTitle } from './editor.js';
import { applySidebarVisibility } from './panels.js';
import { reportMenuStateNow } from './tabs.js';
import { isAllEmpty, persistSetting, renderTabbar, scheduleAutoSave } from './views.js';
import { renderTags } from './autocomplete-help.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Panel-Registry — Properties und Tags
// registrieren sich am Modul-Ende; Einblenden aktiviert den Gruppen-Reiter.
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
// 4T-0448 (Epic 3E-0083): Eigenschafts-Profile — gemeinsame Editor-Logik
// (Vorschläge, weiche Hinweise) aus dem Shared-Modul; die Auflösung liefert
// profiles:resolve (4T-0447) und wird pro Pane in state.properties gecacht.
import {
  fieldDefinitionHint,
  isEmptyPropertyValue,
  // 4T-0491 (Epic 3E-0093): Komplett-Übernahme (gemeinsame Leer-Wert-Quelle
  // und profil-gruppierte Menü-Struktur).
  emptyValueForType,
  profileSuggestGroups,
} from '../../shared/property-profiles.js';

// --- Properties-Sidebar (4T-0051) -------------------------------------------
// Live-editierbare Sidebar-Sektion fuer YAML-Frontmatter-Felder (Sektion
// neben Outline und Backlinks). Pro Spalte eine eigene Instanz; Sichtbar-
// keit pro Spalte persistent. Typ-Inferenz aus dem aktuellen Wert, Round-
// Trip-Schreiben via writeFrontmatter (src/shared/markdown/frontmatter.js) (erhaelt Kommentare
// und Stil nicht-geaenderter Felder). Felder leben direkt im DOM der
// jeweiligen Sektion; bei Field-Change laeuft Debounce-Save (500 ms).
//
// State:
//   state.properties = {
//     visibleByPane: { 0: false, 1: false },
//     saveTimers:    { 0: null,  1: null },
//     originalDataByPane: { 0: {}, 1: {} },  // fuer readonly-Felder-Lookup
//   }

export const PROPERTY_TYPES = [
  'string',
  'multistring',
  'number',
  'boolean',
  'date',
  'multiline',
  'readonly',
];

// Heuristik fuer Standard-Feldnamen: schlaegt einen Typ vor, wenn ein neu
// hinzugefuegtes Feld diesen Namen bekommt. Wirkt nur, solange der Nutzer
// keinen Typ explizit gewaehlt hat.
export const FIELD_TYPE_HINTS = {
  title: 'string',
  description: 'string',
  author: 'string',
  tags: 'multistring',
  aliases: 'multistring',
  date: 'date',
  created: 'date',
  modified: 'date',
  due: 'date',
  draft: 'boolean',
  published: 'boolean',
};

// --- 4T-0448 (Epic 3E-0083): Profil-Auflösung der aktiven Datei ---------------
// Die Auflösung (profiles:resolve, 4T-0447) läuft asynchron und wird pro
// Pane gecacht, damit renderProperties synchron bleiben kann (Begründung am
// renderProperties-Kommentar). Neu aufgelöst wird beim Rendern, nach jedem
// Properties-Save (das Zuordnungs-Feld kann sich geändert haben) und beim
// profiles:changed-Broadcast; neu gerendert nur, wenn sich die Auflösung
// tatsächlich geändert hat (JSON-Vergleich — laufende Eingaben behalten
// sonst ihren Fokus).

export async function refreshProfileResolution(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  let next = null;
  if (
    tab &&
    !tab.manualPage &&
    isExtensionActive('property-profiles') &&
    typeof api.profilesResolve === 'function'
  ) {
    let fmData;
    try {
      fmData = api.getFrontmatter(tab.content || '').data;
    } catch {
      fmData = null;
    }
    const token = ++state.properties.profileTokens[paneIdx];
    let result;
    try {
      result = await api.profilesResolve({ frontmatter: fmData || {}, path: tab.path || null });
    } catch {
      result = null;
    }
    if (token !== state.properties.profileTokens[paneIdx]) return;
    if (result && result.ok && result.hasConfig) {
      next = { assignField: result.assignField, fields: result.fields };
    }
  } else {
    // Laufende Anfragen entwerten (Tab-/Erweiterungs-Wechsel).
    state.properties.profileTokens[paneIdx]++;
  }
  // Sichtbarer Zustand der Auflösung an der Sektion (auch Test-Hook: 'on'
  // erst, wenn die Vorschläge wirklich verfügbar sind).
  const els = getPaneEls(paneIdx);
  if (els && els.propertiesSection) {
    els.propertiesSection.dataset.profiles = next ? 'on' : 'off';
  }
  const prev = state.properties.profileByPane[paneIdx];
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  state.properties.profileByPane[paneIdx] = next;
  if (!isAllEmpty() && state.properties.visibleByPane[paneIdx]) renderProperties(paneIdx);
  // 4T-0449: weitere Konsumenten der Auflösung (Block-Panel) nachziehen.
  for (const listener of profileResolutionListeners) listener(paneIdx);
}

// 4T-0449: Listener für Auflösungs-Änderungen (das Block-Panel registriert
// sich hier — bewusst als Callback-Registry statt Import, um den Zyklus
// properties-tags <-> block-props-panel zu vermeiden).
const profileResolutionListeners = [];
export function onProfileResolutionChanged(listener) {
  if (typeof listener === 'function') profileResolutionListeners.push(listener);
}

// profiles:changed-Broadcast (Konfigurations-Änderung, auch aus anderen
// Fenstern): beide Panes neu auflösen. Verdrahtung in app-init.js.
export function handleProfilesChanged() {
  for (let p = 0; p < state.panes.length; p++) void refreshProfileResolution(p);
}

// Definition eines Feldnamens aus der gecachten Auflösung (case-insensitiv);
// null ohne Konfiguration oder für nicht definierte Felder. Exportiert für
// das Block-Panel (4T-0449: Blöcke erben die Datei-Auflösung).
export function profileDefFor(paneIdx, key) {
  const resolution = state.properties.profileByPane[paneIdx];
  if (!resolution || !Array.isArray(resolution.fields)) return null;
  const wanted = String(key == null ? '' : key)
    .trim()
    .toLowerCase();
  if (wanted === '') return null;
  return resolution.fields.find((f) => f.name.toLowerCase() === wanted) || null;
}

// Editor-Typ eines definierten Felds: der Definitions-Typ; weicht der
// Ist-Wert vom Typ ab, bleibt der inferierte Typ (der Wert bleibt sichtbar
// und unverändert editierbar — keine Blockade, PO-Entscheidung 3).
export function renderTypeFor(def, value) {
  if (isEmptyPropertyValue(value)) return def.type;
  return fieldDefinitionHint(def, value) === 'typeMismatch' ? inferType(value) : def.type;
}

export function inferType(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (value.includes('\n')) return 'multiline';
    return 'string';
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) return 'multistring';
    return 'readonly';
  }
  if (typeof value === 'object') return 'readonly';
  return 'string';
}

// Konvertiert einen Wert von einem Typ in einen anderen, so robust wie
// moeglich. Bei nicht erfolgreicher Konvertierung wird ein typgerechter
// Default zurueckgegeben (leer string, leeres Array, 0, false, '').
export function coerceValue(value, fromType, toType) {
  if (fromType === toType) return value;
  if (toType === 'string') {
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value);
  }
  if (toType === 'multistring') {
    if (Array.isArray(value)) return value.map((v) => String(v));
    if (typeof value === 'string') {
      return value
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s);
    }
    return [];
  }
  if (toType === 'number') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (toType === 'boolean') {
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return !!value;
  }
  if (toType === 'date') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return '';
  }
  if (toType === 'multiline') {
    if (Array.isArray(value)) return value.join('\n');
    return String(value || '');
  }
  return value;
}

// Liefert einen typgerechten Default-Wert fuer ein neu angelegtes Feld.
// 4T-0491 (Epic 3E-0093): die sechs Profil-Typen kommen aus der gemeinsamen
// Quelle (emptyValueForType); nur der DOM-interne 'readonly'-Fall bleibt hier.
export function defaultValueForType(type) {
  if (type === 'readonly') return null;
  return emptyValueForType(type);
}

// 4T-0051: Rendert die Properties-Sidebar-Sektion fuer eine Spalte neu.
// Wird gerufen bei Toggle-on, Tab-Wechsel, View-Mode-Wechsel und externer
// Datei-Aenderung. Bewusst synchron: api.getFrontmatter ist im Preload als
// sync-Funktion exposed. Wuerde renderProperties async sein, oeffnet ein
// 'await' zwischen Container-leeren und appendChild ein Race-Fenster, in
// dem ein paralleler Aufruf nochmals appendet — Folge: doppelte/dreifache
// Property-Listen je nach Zahl der parallelen Trigger.
export function renderProperties(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesSection) return;
  // R5-03 (4T-0172): pending Debounce-Save des bisherigen Tabs flushen,
  // BEVOR die Feld-DOM ersetzt wird — sonst ist die Eingabe still verloren.
  flushPendingPropertiesSave(paneIdx);
  // 4T-0448: Profil-Auflösung asynchron nachziehen (re-rendert nur bei
  // tatsächlicher Änderung); dieser Durchlauf nutzt den gecachten Stand.
  void refreshProfileResolution(paneIdx);
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;

  els.propertiesFields.innerHTML = '';
  els.propertiesParseError.hidden = true;
  els.propertiesParseError.textContent = '';
  els.propertiesEmpty.hidden = true;

  if (!tab) {
    els.propertiesEmpty.hidden = false;
    state.properties.originalDataByPane[paneIdx] = {};
    return;
  }

  // 4T-0213 (Epic 3E-0042): Handbuch-Tabs sind read-only — die Sektion
  // zeigt den Leer-Hinweis, und "Feld hinzufuegen" bleibt deaktiviert
  // (der Debounce-Save wuerde sonst in das Handbuch-Doc schreiben).
  if (tab.manualPage) {
    els.propertiesEmpty.hidden = false;
    state.properties.originalDataByPane[paneIdx] = {};
    if (els.propertiesAddBtn) {
      els.propertiesAddBtn.disabled = true;
      els.propertiesAddBtn.title = t('manual.editDisabled');
    }
    return;
  }

  let fm;
  try {
    fm = api.getFrontmatter(tab.content || '');
  } catch {
    fm = { raw: null, data: null, body: tab.content || '', parseError: null, endOffset: 0 };
  }

  if (fm.parseError) {
    els.propertiesParseError.hidden = false;
    els.propertiesParseError.textContent = t('properties.parseError').replace(
      '{error}',
      fm.parseError,
    );
  }
  // R5-02 (4T-0172): Bei defektem YAML kein "Feld hinzufuegen" — der
  // erste Debounce-Save wuerde das gesamte Frontmatter durch die leeren
  // Sidebar-Felder ersetzen. Tooltip nennt den Grund.
  if (els.propertiesAddBtn) {
    els.propertiesAddBtn.disabled = !!fm.parseError;
    els.propertiesAddBtn.title = fm.parseError ? t('properties.addDisabledParseError') : '';
  }

  const data = fm.data || {};
  state.properties.originalDataByPane[paneIdx] = data;

  const keys = Object.keys(data);
  if (keys.length === 0 && !fm.parseError) {
    els.propertiesEmpty.hidden = false;
  }
  for (const key of keys) {
    const value = data[key];
    // 4T-0448: definierte Felder nutzen den Definitions-Typ statt der
    // Inferenz; undefinierte Felder verhalten sich unverändert.
    const def = profileDefFor(paneIdx, key);
    const type = def ? renderTypeFor(def, value) : inferType(value);
    const fieldEl = buildPropertyFieldDom(paneIdx, key, value, type, def);
    els.propertiesFields.appendChild(fieldEl);
  }
}

// 4T-0051: Liest die Felder aus der Sidebar-Sektion einer Spalte und baut
// ein Plain-Objekt fuer writeFrontmatter. Read-only-Felder behalten ihren
// Original-Wert aus state.properties.originalDataByPane.
export function readPropertiesFromPane(paneIdx) {
  const els = getPaneEls(paneIdx);
  const out = {};
  if (!els || !els.propertiesFields) return out;
  const originalData = state.properties.originalDataByPane[paneIdx] || {};
  const fieldEls = els.propertiesFields.querySelectorAll('.properties-field');
  for (const fieldEl of fieldEls) {
    const keyInput = fieldEl.querySelector('.properties-field-key');
    const typeSelect = fieldEl.querySelector('.properties-field-type');
    const key = ((keyInput && keyInput.value) || '').trim();
    if (!key) continue;
    // 4T-0448: der Editor-Typ steht in dataset.currentType — bei einem
    // definierten Feld mit Typ-Abweichung zeigt der (gesperrte) Typ-Wechsler
    // den Definitions-Typ, der Wert-Editor bleibt aber beim Ist-Typ, damit
    // der Save den Wert nicht verändert (keine Blockade, keine Wert-Änderung).
    const type = fieldEl.dataset.currentType || (typeSelect ? typeSelect.value : 'string');
    if (type === 'readonly') {
      const originalKey = fieldEl.dataset.originalKey;
      if (originalKey && originalKey in originalData) {
        out[key] = originalData[originalKey];
      }
      continue;
    }
    out[key] = extractFieldValue(fieldEl, type);
  }
  return out;
}

// 4T-0051: Plant einen Speichervorgang fuer die Properties-Sektion einer
// Spalte. Debounce-Wert 500 ms: schnell genug, dass Live-Feedback im
// Render-Pane folgt, langsam genug, dass jeder Tastendruck nicht zu einer
// IPC-Roundtrip wird.
export function scheduleSavePropertiesFromPane(paneIdx) {
  const timers = state.properties.saveTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  // R5-03 (4T-0172): Ziel-Tab beim Schedulen merken. Der Save liest die
  // DOM-Felder der Pane; nach einem Tab-Wechsel zeigt pane.activeIndex
  // bereits auf den neuen Tab, waehrend die Felder noch zum alten gehoeren.
  const pane = state.panes[paneIdx];
  state.properties.saveTabs = state.properties.saveTabs || [null, null];
  state.properties.saveTabs[paneIdx] =
    pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    savePropertiesFromPane(paneIdx, state.properties.saveTabs[paneIdx]);
  }, 500);
}

// R5-03 (4T-0172): Pending Debounce-Save sofort ausfuehren, bevor die
// Feld-DOM der Pane ersetzt wird (Tab-Wechsel, Reload, Toggle). Ohne Flush
// liest der nachlaufende Timer die Felder des neuen Tabs (No-op) und die
// Eingabe ist still verloren.
export function flushPendingPropertiesSave(paneIdx) {
  const timers = state.properties.saveTimers;
  if (!timers[paneIdx]) return;
  clearTimeout(timers[paneIdx]);
  timers[paneIdx] = null;
  const targetTab = state.properties.saveTabs ? state.properties.saveTabs[paneIdx] : null;
  savePropertiesFromPane(paneIdx, targetTab);
}

export function savePropertiesFromPane(paneIdx, targetTab) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  // R5-03: explizit uebergebener Ziel-Tab hat Vorrang (Flush-Pfad); sonst
  // der aktive Tab der Pane (direkter Aufruf).
  const tab = targetTab || (pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null);
  if (!tab) return;
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesSection) return;
  // R5-02 (4T-0172): Bei YAML-Parse-Fehler niemals schreiben —
  // writeFrontmatter wuerde das gesamte defekte Frontmatter durch die
  // (leeren) Sidebar-Felder ersetzen. Erst wenn das YAML im Editor
  // repariert ist, sind die Properties wieder schreibbar.
  let fmNow;
  try {
    fmNow = api.getFrontmatter(tab.content || '');
  } catch {
    return;
  }
  if (fmNow && fmNow.parseError) return;
  // R5-10 (4T-0172): Doppelte Keys nicht still zusammenlegen. Betroffene
  // Felder markieren, Hinweis zeigen, Save aussetzen bis zur Aufloesung.
  if (markDuplicatePropertyKeys(paneIdx)) return;
  const newData = readPropertiesFromPane(paneIdx);
  const result = api.writeFrontmatter(tab.content || '', newData);
  if (!result || !result.ok) {
    els.propertiesParseError.hidden = false;
    const msg = result && result.error ? result.error : 'unknown';
    els.propertiesParseError.textContent = t('properties.writeError').replace('{error}', msg);
    return;
  }
  const newText = result.text;
  if (newText === tab.content) return; // no-op (Property-Eingabe ohne echte Aenderung)
  // 4T-0051: Properties-Aenderung verhaelt sich wie eine Editor-Aenderung.
  // tab.content wird aktualisiert, dirty-State neu berechnet, Auto-Save-
  // Timer nur dann geplant, wenn Auto-Save eingeschaltet ist. Wenn Auto-
  // Save aus ist, bleibt der Tab dirty und der Nutzer muss explizit per
  // Strg+S speichern — gleiches Modell wie beim CodeMirror-Editor.
  tab.content = newText;
  const wasDirty = tab.dirty;
  tab.dirty = tab.content !== tab.originalContent;
  els.propertiesParseError.hidden = true;
  // R5-03 (4T-0172): UI-Refresh nur, wenn der geschriebene Tab noch der
  // aktive der Pane ist. Im Flush-Pfad (Tab-Wechsel) zeigen Editor und
  // Vorschau bereits den neuen Tab; ein Refresh mit dem alten Inhalt
  // wuerde die falsche Datei anzeigen. Daten (content/dirty/Auto-Save)
  // sind oben bereits aktualisiert.
  const stillActive = pane.activeIndex >= 0 && pane.tabs[pane.activeIndex] === tab;
  if (!stillActive) {
    if (wasDirty !== tab.dirty) renderTabbar(paneIdx);
    scheduleAutoSave();
    return;
  }
  // Snapshot in originalDataByPane aktualisieren, damit readonly-Felder
  // beim naechsten Save aus den aktuellen Daten gelesen werden.
  state.properties.originalDataByPane[paneIdx] = newData;
  // 4T-0448: weiche Hinweise der definierten Felder live nachziehen (ohne
  // DOM-Neuaufbau, der Fokus bleibt) und die Auflösung neu anstoßen — das
  // Zuordnungs-Feld kann sich mit diesem Save geändert haben.
  updateProfileHints(paneIdx);
  void refreshProfileResolution(paneIdx);
  // Editor und Render-Pane synchron halten. renderProperties NICHT
  // aufrufen, damit der Sidebar-Fokus erhalten bleibt.
  syncEditorForPane(paneIdx);
  const elsRefresh = getPaneEls(paneIdx);
  if (elsRefresh.renderedHtml) {
    elsRefresh.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
    // R2-13/R5-07 (4T-0179): vereinheitlichte Render-Nachverarbeitung
    // (inkl. Search-Refresh, der hier zuvor fehlte — gewollter Fix).
    applyRenderPipeline(elsRefresh.renderedHtml, tab.path);
  }
  if (wasDirty !== tab.dirty) {
    renderTabbar(paneIdx);
    if (paneIdx === state.activePaneIndex) updateWindowTitle();
  }
  // Auto-Save-Trigger: hat genau die gleiche Wirkung wie nach einer
  // Editor-Aenderung. scheduleAutoSave ist no-op, wenn Auto-Save aus ist.
  scheduleAutoSave();
}

// 4T-0448: Hinweis-Icons aller definierten Felder gegen den aktuellen
// DOM-Stand neu bewerten (läuft nach jedem Save; kein DOM-Neuaufbau).
function updateProfileHints(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  for (const fieldEl of els.propertiesFields.querySelectorAll('.properties-field')) {
    const def = fieldEl._profileDef;
    if (!def) continue;
    const type = fieldEl.dataset.currentType || 'string';
    const value = extractFieldValue(fieldEl, type);
    applyFieldHint(
      fieldEl.querySelector('.properties-field-hint'),
      def,
      fieldDefinitionHint(def, value),
    );
  }
}

// R5-10 (4T-0172): Markiert Felder mit doppelten Keys (exakter Vergleich
// nach Trim) und zeigt den Hinweis in der ParseError-Box. Liefert true,
// wenn Duplikate vorliegen (Save wird dann ausgesetzt).
export function markDuplicatePropertyKeys(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return false;
  const counts = new Map();
  const keyInputs = els.propertiesFields.querySelectorAll('.properties-field-key');
  for (const inp of keyInputs) {
    const k = (inp.value || '').trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let hasDuplicates = false;
  for (const inp of keyInputs) {
    const k = (inp.value || '').trim();
    const dup = !!k && counts.get(k) > 1;
    inp.classList.toggle('duplicate', dup);
    inp.title = dup ? t('properties.duplicateKeys') : '';
    if (dup) hasDuplicates = true;
  }
  if (hasDuplicates) {
    els.propertiesParseError.hidden = false;
    els.propertiesParseError.textContent = t('properties.duplicateKeys');
  } else if (els.propertiesParseError.textContent === t('properties.duplicateKeys')) {
    els.propertiesParseError.hidden = true;
    els.propertiesParseError.textContent = '';
  }
  return hasDuplicates;
}

export function extractFieldValue(fieldEl, type) {
  const valueEl = fieldEl.querySelector('.properties-field-value');
  if (!valueEl) return defaultValueForType(type);
  // 4T-0448: Auswahl-Liste eines Wertebereichs-Felds (Einfach-Auswahl).
  const select = valueEl.querySelector('select.properties-field-value-select');
  if (select) {
    if (type === 'number') {
      const n = parseFloat(select.value);
      return Number.isFinite(n) ? n : 0;
    }
    return select.value;
  }
  if (type === 'string' || type === 'date') {
    const input = valueEl.querySelector('input');
    return input ? input.value : '';
  }
  if (type === 'multiline') {
    const ta = valueEl.querySelector('textarea');
    return ta ? ta.value : '';
  }
  if (type === 'number') {
    const input = valueEl.querySelector('input');
    if (!input) return 0;
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') {
    const cb = valueEl.querySelector('input[type=checkbox]');
    return cb ? !!cb.checked : false;
  }
  if (type === 'multistring') {
    const container = valueEl.querySelector('.properties-field-multistring');
    if (!container) return [];
    const pills = container.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  return defaultValueForType(type);
}

// 4T-0051: Baut die DOM-Komponente fuer ein Property-Feld in der Sidebar-
// Sektion. Layout zweizeilig: Head (Key | Type | Hint | Delete) ueber Value.
// Hooks fuer Live-Save: jedes input/change-Event triggert Debounce-Save.
// 4T-0448: optionaler def-Parameter (aufgelöste Profil-Definition) — dann
// dezente Kennzeichnung, Typ-Sperre (solange der Wert dem Typ entspricht),
// weicher Hinweis und ggf. Auswahl-Listen im Wert-Editor.
export function buildPropertyFieldDom(paneIdx, key, value, type, def = null) {
  const wrap = document.createElement('div');
  wrap.className = 'properties-field';
  if (type === 'readonly') wrap.classList.add('is-readonly');
  wrap.dataset.originalKey = key;
  wrap.dataset.currentType = type;
  wrap.dataset.paneIdx = String(paneIdx);
  // 4T-0448: Definition am Element hinterlegen (Hinweis-Aktualisierung beim
  // Save und Rückkehr zur Auswahl-Liste nach einem Typ-Wechsel).
  wrap._profileDef = def || null;
  const hintCode = def ? fieldDefinitionHint(def, value) : null;
  if (def) wrap.classList.add('is-profile-defined');

  // Head-Zeile: Key, Type, Hint, Delete
  const head = document.createElement('div');
  head.className = 'properties-field-head';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'properties-field-key';
  keyInput.value = key;
  keyInput.spellcheck = false;
  if (type === 'readonly') keyInput.disabled = true;
  if (def) keyInput.title = t('properties.profileDefined').replace('{profile}', def.profile);
  head.appendChild(keyInput);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'properties-field-type';
  for (const tname of PROPERTY_TYPES) {
    // 4T-0051: 'readonly' ist ein interner Fallback-Typ fuer verschachtelte
    // YAML-Strukturen (Objekte, Arrays mit Objekten). Im Dropdown nur
    // sichtbar, wenn das Feld ohnehin bereits readonly ist — dann ist der
    // Dropdown disabled, also keine Aktion. Bei nicht-readonly-Feldern
    // verbergen, damit der Nutzer ihn nicht versehentlich waehlt und sich
    // selbst in eine Sackgasse manoevriert.
    if (tname === 'readonly' && type !== 'readonly') continue;
    const opt = document.createElement('option');
    opt.value = tname;
    opt.textContent = t('properties.type.' + tname) || tname;
    typeSelect.appendChild(opt);
  }
  typeSelect.value = type;
  if (type === 'readonly') typeSelect.disabled = true;
  // 4T-0448: definierte Felder zeigen den Definitions-Typ, der Wechsler ist
  // gesperrt (Tooltip nennt das Profil). Ausnahme Typ-Abweichung: dann bleibt
  // der Wechsler frei, damit der Wert per Koerzierung auf den Definitions-Typ
  // gebracht werden KANN (keine Sackgasse) — der Hinweis nennt den Soll-Typ.
  if (def && hintCode !== 'typeMismatch') {
    typeSelect.value = def.type;
    typeSelect.disabled = true;
    typeSelect.title = t('properties.profileTypeLocked').replace('{profile}', def.profile);
  }
  typeSelect.addEventListener('change', () => onTypeChange(wrap, typeSelect.value));
  head.appendChild(typeSelect);

  // 4T-0448: weicher Validierungs-Hinweis (Icon plus Tooltip) — keine
  // Blockade, keine Wert-Änderung. Wird beim Save live nachgezogen.
  const hintEl = document.createElement('span');
  hintEl.className = 'properties-field-hint';
  hintEl.textContent = '⚠';
  applyFieldHint(hintEl, def, hintCode);
  head.appendChild(hintEl);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'properties-field-delete';
  delBtn.textContent = '×';
  delBtn.title = t('properties.deleteField');
  delBtn.addEventListener('click', () => {
    wrap.remove();
    scheduleSavePropertiesFromPane(paneIdx);
  });
  head.appendChild(delBtn);

  wrap.appendChild(head);

  // Value-Zeile.
  const valueWrap = document.createElement('div');
  valueWrap.className = 'properties-field-value';
  wrap.appendChild(valueWrap);
  renderValueEditor(valueWrap, type, value, paneIdx, hintCode === 'typeMismatch' ? null : def);

  // Live-Save-Hook: jede Eingabe in Key/Wert triggert Debounce-Save.
  wrap.addEventListener('input', () => scheduleSavePropertiesFromPane(paneIdx));
  wrap.addEventListener('change', () => scheduleSavePropertiesFromPane(paneIdx));

  return wrap;
}

// 4T-0448: Hinweis-Icon eines Felds setzen bzw. verbergen. code ist der
// Hinweis-Code aus fieldDefinitionHint (null = konform). Exportiert für
// das Block-Panel (4T-0449, gleiche Hinweis-Darstellung).
export function applyFieldHint(hintEl, def, code) {
  if (!hintEl) return;
  if (!def || !code) {
    hintEl.hidden = true;
    hintEl.title = '';
    return;
  }
  hintEl.hidden = false;
  hintEl.title =
    code === 'typeMismatch'
      ? t('properties.profileHint.typeMismatch').replace(
          '{type}',
          t('properties.type.' + def.type) || def.type,
        )
      : t('properties.profileHint.outsideValues');
}

// 4T-0448: laufende Nummer für eindeutige datalist-IDs der Wertebereichs-
// Eingaben (Mehrfach-Auswahl).
let valueListSeq = 0;

// 4T-0448: Einfach-Auswahl eines Wertebereichs-Felds — Auswahl-Liste mit
// den definierten Werten plus „Eigener Wert…" (freie Eingabe bleibt möglich,
// weiche Haltung; ein Wert außerhalb erzeugt den Hinweis beim Save). Ein
// gesetzter Wert außerhalb des Bereichs erscheint als eigene Option, damit
// er sichtbar bleibt und nicht still verändert wird.
function renderValueSelect(container, def, value, paneIdx) {
  const select = document.createElement('select');
  select.className = 'properties-field-value-select';
  const current = value == null ? '' : String(value);
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '—';
  select.appendChild(emptyOpt);
  const known = def.values.map((v) => String(v));
  for (const v of known) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  if (current !== '' && !known.includes(current)) {
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = current;
    opt.className = 'is-outside-values';
    select.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = t('properties.profileCustomValue');
  select.appendChild(customOpt);
  select.value = current === '' ? '' : current;
  select.addEventListener('change', () => {
    if (select.value !== '__custom__') return;
    // „Eigener Wert…": auf den Freitext-Editor des Definitions-Typs
    // wechseln, vorbelegt mit dem bisherigen Wert. Das change-Event hat den
    // Debounce-Save bereits geplant; der liest dann den (unveränderten)
    // Eingabe-Wert — kein versehentliches Schreiben des Sentinels.
    renderValueEditor(container, def.type, current, paneIdx, null);
    const input = container.querySelector('input, textarea');
    if (input) setTimeout(() => input.focus(), 0);
  });
  container.appendChild(select);
}

export function renderValueEditor(container, type, value, paneIdx, def = null) {
  container.innerHTML = '';
  // 4T-0448: Wertebereichs-Felder — Einfach-Auswahl als Auswahl-Liste,
  // Mehrfach-Auswahl über die Chips-Leiste mit Werte-Vorschlägen (datalist).
  if (def && Array.isArray(def.values) && def.values.length > 0 && !def.multiple) {
    renderValueSelect(container, def, value, paneIdx);
    return;
  }
  if (type === 'readonly') {
    const el = document.createElement('div');
    el.className = 'properties-field-readonly-value';
    let preview;
    try {
      preview = JSON.stringify(value);
    } catch {
      preview = String(value);
    }
    if (preview && preview.length > 80) preview = preview.slice(0, 77) + '…';
    el.textContent = t('properties.readonlyHint') + ': ' + preview;
    container.appendChild(el);
    return;
  }
  if (type === 'string' || type === 'date') {
    const input = document.createElement('input');
    input.type = type === 'date' ? 'date' : 'text';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    container.appendChild(input);
    return;
  }
  if (type === 'multiline') {
    const ta = document.createElement('textarea');
    ta.className = 'properties-field-value-textarea';
    ta.value = typeof value === 'string' ? value : value == null ? '' : String(value);
    container.appendChild(ta);
    return;
  }
  if (type === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'properties-field-value-input';
    input.value = typeof value === 'number' ? String(value) : value == null ? '' : String(value);
    container.appendChild(input);
    return;
  }
  if (type === 'boolean') {
    const wrap = document.createElement('div');
    wrap.className = 'properties-field-bool';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    wrap.appendChild(cb);
    container.appendChild(wrap);
    return;
  }
  if (type === 'multistring') {
    const list = document.createElement('div');
    list.className = 'properties-field-multistring';
    const arr = Array.isArray(value) ? value : value ? [String(value)] : [];
    for (const v of arr) {
      appendMultistringPill(list, String(v), undefined, paneIdx);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'properties-field-multistring-input';
    input.placeholder = t('properties.multistringPlaceholder');
    // PO-Befund Release 0.56.0: Chip nur anfügen, wenn der Wert noch nicht
    // gesetzt ist (doppelte Listen-Einträge sind nie sinnvoll; das Feld
    // leert sich trotzdem — die Absicht „Wert setzen" ist erfüllt).
    const addChip = (v) => {
      const exists = [...list.querySelectorAll('.properties-field-multistring-pill')].some(
        (p) => p.dataset.value === v,
      );
      if (!exists) appendMultistringPill(list, v, input, paneIdx);
      input.value = '';
      return !exists;
    };
    // 4T-0448: Mehrfach-Auswahl eines Wertebereichs — die definierten Werte
    // als Eingabe-Vorschläge (datalist); freie Eingabe bleibt möglich
    // (weiche Haltung) und erzeugt den Hinweis beim Save.
    if (def && def.multiple && Array.isArray(def.values) && def.values.length > 0) {
      const dl = document.createElement('datalist');
      dl.id = `properties-value-list-${paneIdx}-${valueListSeq++}`;
      for (const v of def.values) {
        const opt = document.createElement('option');
        opt.value = String(v);
        dl.appendChild(opt);
      }
      list.appendChild(dl);
      input.setAttribute('list', dl.id);
      // PO-Befund Release 0.56.0: die Übernahme aus der Vorschlagsliste wird
      // DIREKT zum Chip (ohne zusätzliches Enter). Erkennung über den
      // inputType der Ersetzung ('insertReplacementText'; manche Chromium-
      // Stände liefern undefined — dann greift der exakte Werte-Treffer);
      // Tipp-Eingaben ('insertText') bleiben unberührt, damit eigene Werte
      // wie bisher frei formulierbar sind.
      const allowed = def.values.map((v) => String(v));
      input.addEventListener('input', (e) => {
        if (e.inputType && e.inputType !== 'insertReplacementText') return;
        const v = input.value.trim();
        if (v && allowed.includes(v) && addChip(v)) scheduleSavePropertiesFromPane(paneIdx);
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = input.value.trim();
        if (v && addChip(v)) scheduleSavePropertiesFromPane(paneIdx);
      } else if (e.key === 'Backspace' && input.value === '') {
        const pills = list.querySelectorAll('.properties-field-multistring-pill');
        if (pills.length > 0) {
          pills[pills.length - 1].remove();
          scheduleSavePropertiesFromPane(paneIdx);
        }
      }
    });
    list.appendChild(input);
    container.appendChild(list);
    return;
  }
}

export function appendMultistringPill(list, value, beforeInputEl, paneIdx) {
  const pill = document.createElement('span');
  pill.className = 'properties-field-multistring-pill';
  pill.dataset.value = value;
  pill.textContent = value;
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'properties-field-multistring-pill-remove';
  rm.textContent = '×';
  rm.addEventListener('click', () => {
    pill.remove();
    if (paneIdx != null) scheduleSavePropertiesFromPane(paneIdx);
  });
  pill.appendChild(rm);
  if (beforeInputEl) list.insertBefore(pill, beforeInputEl);
  else list.appendChild(pill);
}

export function onTypeChange(wrap, newType) {
  const valueWrap = wrap.querySelector('.properties-field-value');
  if (!valueWrap) return;
  const typeSelect = wrap.querySelector('.properties-field-type');
  const oldType = wrap.dataset.currentType || inferType(extractFieldValue(wrap, typeSelect.value));
  const current = extractFieldValue(wrap, oldType);
  const coerced = coerceValue(current, oldType, newType);
  const paneIdx = parseInt(wrap.dataset.paneIdx || '0', 10);
  // 4T-0448: kehrt ein definiertes Feld (Typ-Abweichung, Wechsler frei) per
  // Koerzierung zum Definitions-Typ zurück, greifen Auswahl-Liste, Sperre
  // und Hinweis-Abgleich wieder.
  const def = wrap._profileDef || null;
  const backToDefined = def && def.type === newType;
  renderValueEditor(valueWrap, newType, coerced, paneIdx, backToDefined ? def : null);
  wrap.dataset.currentType = newType;
  if (backToDefined) {
    typeSelect.disabled = true;
    typeSelect.title = t('properties.profileTypeLocked').replace('{profile}', def.profile);
    applyFieldHint(
      wrap.querySelector('.properties-field-hint'),
      def,
      fieldDefinitionHint(def, coerced),
    );
  }
}

// --- 4T-0448: Vorschlags-Menü für „Eigenschaft hinzufügen" --------------------

let suggestMenuEl = null;

function closeSuggestMenu() {
  if (!suggestMenuEl) return;
  suggestMenuEl.remove();
  suggestMenuEl = null;
  document.removeEventListener('mousedown', onSuggestMenuOutside, true);
  document.removeEventListener('keydown', onSuggestMenuKey, true);
}

function onSuggestMenuOutside(e) {
  if (suggestMenuEl && !suggestMenuEl.contains(e.target)) closeSuggestMenu();
}

function onSuggestMenuKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSuggestMenu();
  }
}

// Öffnet das Vorschlags-Menü am Hinzufügen-Button als eine nach Profilen
// gruppierte, eingerückte Liste (PO-Festlegung 2026-07-11): pro aufgelöstem
// Profil ein KLICKBARER Kopf mit dem Profil-Namen (Komplett-Übernahme aller
// fehlenden Felder dieses Profils), darunter eingerückt die Einzel-Felder;
// danach die profillosen Standard-Vorschläge unter einer dezenten Überschrift
// „Weitere Felder", am Ende „Eigenes Feld". `groups` ist das Ergebnis von
// profileSuggestGroups. Exportiert generisch (handlers.onBulk / onSuggestion /
// onCustom) — das Block-Panel nutzt dasselbe Menü (ein Verhalten, zwei
// Oberflächen).
export function openFieldSuggestMenu(anchorEl, groups, handlers) {
  closeSuggestMenu();
  const menu = document.createElement('div');
  menu.className = 'properties-suggest-menu';
  const addButton = (label, opts = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'properties-suggest-item' +
      (opts.extraClass ? ' ' + opts.extraClass : '') +
      (opts.indent ? ' is-indent' : '');
    if (opts.title) btn.title = opts.title;
    const name = document.createElement('span');
    name.className = 'properties-suggest-name';
    name.textContent = label;
    btn.appendChild(name);
    btn.addEventListener('click', () => {
      closeSuggestMenu();
      opts.onPick();
    });
    menu.appendChild(btn);
  };
  const g = groups || {};
  const profileGroups = Array.isArray(g.profileGroups) ? g.profileGroups : [];
  const otherFields = Array.isArray(g.otherFields) ? g.otherFields : [];
  for (const grp of profileGroups) {
    addButton(grp.profile, {
      onPick: () => handlers.onBulk(grp),
      extraClass: 'is-profile-head',
      title: t('properties.profileSuggest.fillProfileHint').replace('{profile}', grp.profile),
    });
    for (const s of grp.fields) {
      addButton(s.name, { onPick: () => handlers.onSuggestion(s), indent: true });
    }
  }
  if (otherFields.length > 0) {
    const grouped = profileGroups.length > 0;
    if (grouped) {
      const lbl = document.createElement('div');
      lbl.className = 'properties-suggest-group-label';
      lbl.textContent = t('properties.profileSuggest.otherFields');
      menu.appendChild(lbl);
    }
    for (const s of otherFields) {
      addButton(s.name, { onPick: () => handlers.onSuggestion(s), indent: grouped });
    }
  }
  addButton(t('properties.profileSuggest.custom'), {
    onPick: () => handlers.onCustom(),
    extraClass: 'is-custom',
  });
  const rect = anchorEl.getBoundingClientRect();
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 2)}px`;
  document.body.appendChild(menu);
  // Menü im Fenster halten (die Sidebar sitzt am Rand).
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth - 4) {
    menu.style.left = `${Math.max(4, Math.round(window.innerWidth - menuRect.width - 4))}px`;
  }
  if (menuRect.bottom > window.innerHeight - 4) {
    menu.style.top = `${Math.max(4, Math.round(rect.top - menuRect.height - 2))}px`;
  }
  suggestMenuEl = menu;
  document.addEventListener('mousedown', onSuggestMenuOutside, true);
  document.addEventListener('keydown', onSuggestMenuKey, true);
}

// Legt ein Feld aus einem Vorschlag an: Definitions-Felder mit Definitions-
// Typ und Default (PO-Konzept), Heuristik-Felder mit dem Hint-Typ.
function addFieldFromSuggestion(paneIdx, suggestion) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  const def = suggestion.def || null;
  const type = suggestion.type || 'string';
  const value =
    def && def.default !== null && def.default !== undefined
      ? def.default
      : defaultValueForType(type);
  const fieldEl = buildPropertyFieldDom(paneIdx, suggestion.name, value, type, def);
  if (els.propertiesEmpty) els.propertiesEmpty.hidden = true;
  els.propertiesFields.appendChild(fieldEl);
  scheduleSavePropertiesFromPane(paneIdx);
  const focusTarget = fieldEl.querySelector(
    '.properties-field-value input, .properties-field-value select, .properties-field-value textarea',
  );
  if (focusTarget) setTimeout(() => focusTarget.focus(), 0);
}

// 4T-0491 (Epic 3E-0093): Komplett-Übernahme im Properties-Editor. Ergänzt alle
// fehlenden Felder des Ziels in EINEM writeFrontmatter-Aufruf (ein Undo-Schritt);
// leere Stub-Felder erscheinen als bare YAML-Schlüssel. Bestehende Werte und ihre
// Reihenfolge bleiben unangetastet; der Schreibpfad geht am DOM vorbei direkt auf
// den Datei-Inhalt (keine Feld-für-Feld-Debounce-Saves).
function applyProfileFill(paneIdx, target) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  // R5-02-Linie: bei defektem YAML ist der Hinzufügen-Button gesperrt.
  if (els.propertiesAddBtn && els.propertiesAddBtn.disabled) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || !target || !target.map) return;
  // Pending Debounce-Save zuerst flushen (ungespeicherter DOM-Stand).
  flushPendingPropertiesSave(paneIdx);
  let fm;
  try {
    fm = api.getFrontmatter(tab.content || '');
  } catch {
    return;
  }
  if (fm && fm.parseError) return; // defektes YAML: niemals schreiben
  const current = fm && fm.data ? fm.data : {};
  const stubKeys = Object.keys(target.map);
  const newData = { ...current, ...target.map };
  const result = api.writeFrontmatter(tab.content || '', newData, { emptyStubKeys: stubKeys });
  if (!result || !result.ok) {
    els.propertiesParseError.hidden = false;
    els.propertiesParseError.textContent = t('properties.writeError').replace(
      '{error}',
      result && result.error ? result.error : 'unknown',
    );
    return;
  }
  if (result.text === tab.content) return; // nichts Neues (alle Felder schon da)
  const wasDirty = tab.dirty;
  tab.content = result.text;
  tab.dirty = tab.content !== tab.originalContent;
  els.propertiesParseError.hidden = true;
  // Sidebar-Felder neu aufbauen (Menü-Aktion, kein Feld hat Fokus).
  renderProperties(paneIdx);
  // Editor-Inhalt als EIGENE, isolierte Undo-Einheit setzen: ein Undo-Schritt
  // nimmt genau die Komplett-Übernahme zurück und verschmilzt nicht mit einem
  // vorherigen Historien-Ereignis (Muster block-props applyRename, 4T-0484) —
  // sonst kann ein Undo bis zum leeren Dokument zurücklaufen.
  const view = paneEditors[paneIdx];
  if (view && getDocText(view.state.doc) !== tab.content) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tab.content },
      annotations: isolateHistory.of('full'),
    });
  } else if (!view) {
    syncEditorForPane(paneIdx);
  }
  const elsR = getPaneEls(paneIdx);
  if (elsR.renderedHtml) {
    elsR.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
    applyRenderPipeline(elsR.renderedHtml, tab.path);
  }
  if (wasDirty !== tab.dirty) {
    renderTabbar(paneIdx);
    if (paneIdx === state.activePaneIndex) updateWindowTitle();
  }
  scheduleAutoSave();
}

// 4T-0051: Fuegt der Sidebar-Sektion einer Pane ein neues, leeres Feld
// hinzu. Default-Typ 'string'; wenn der Nutzer den Key auf einen bekannten
// Standard-Namen setzt, wird der Typ aus FIELD_TYPE_HINTS uebernommen.
// 4T-0448: mit konfigurierten Profilen öffnet der Button zuerst das
// Vorschlags-Menü; ohne Konfiguration bleibt das Verhalten exakt wie bisher.
export function addPropertiesField(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  // R5-02 (4T-0172): Guard zusaetzlich zum disabled-Button (defensiv).
  if (els.propertiesAddBtn && els.propertiesAddBtn.disabled) return;
  const resolution = state.properties.profileByPane[paneIdx];
  if (resolution) {
    const existingKeys = [...els.propertiesFields.querySelectorAll('.properties-field-key')].map(
      (inp) => inp.value,
    );
    const heuristics = Object.keys(FIELD_TYPE_HINTS).map((name) => ({
      name,
      type: FIELD_TYPE_HINTS[name],
    }));
    // 4T-0491 (Epic 3E-0093): profil-gruppierte Menü-Struktur (Profil-Kopf =
    // Komplett-Übernahme, darunter die Einzel-Felder).
    const groups = profileSuggestGroups(resolution.fields, existingKeys, heuristics);
    openFieldSuggestMenu(els.propertiesAddBtn, groups, {
      onSuggestion: (s) => addFieldFromSuggestion(paneIdx, s),
      onCustom: () => appendCustomPropertiesField(paneIdx),
      onBulk: (grp) => applyProfileFill(paneIdx, grp),
    });
    return;
  }
  appendCustomPropertiesField(paneIdx);
}

function appendCustomPropertiesField(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesFields) return;
  const container = els.propertiesFields;
  let i = 1;
  const existingKeys = new Set();
  container
    .querySelectorAll('.properties-field-key')
    .forEach((inp) => existingKeys.add(inp.value.trim()));
  let key;
  while (true) {
    const candidate = `field${i}`;
    if (!existingKeys.has(candidate)) {
      key = candidate;
      break;
    }
    i++;
  }
  const fieldEl = buildPropertyFieldDom(paneIdx, key, '', 'string');
  const keyInput = fieldEl.querySelector('.properties-field-key');
  const typeSelect = fieldEl.querySelector('.properties-field-type');
  keyInput.addEventListener('change', () => {
    const k = keyInput.value.trim().toLowerCase();
    if (FIELD_TYPE_HINTS[k] && typeSelect.value === 'string') {
      typeSelect.value = FIELD_TYPE_HINTS[k];
      onTypeChange(fieldEl, FIELD_TYPE_HINTS[k]);
    }
  });
  // Empty-Hint und Empty-State entfernen, falls noch da.
  if (els.propertiesEmpty) els.propertiesEmpty.hidden = true;
  container.appendChild(fieldEl);
  setTimeout(() => keyInput.focus(), 0);
}

// --- Properties-Sidebar: Sichtbarkeit, Toggle, Persistenz -------------------
export function applyPropertiesVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.propertiesSection) return;
  // 4T-0075: Properties im Empty-State zwangsweise unsichtbar.
  const visible = !isAllEmpty() && !!state.properties.visibleByPane[paneIdx];
  els.propertiesSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderProperties(paneIdx);
  }
  updatePropertiesToggleButton();
}

export function updatePropertiesToggleButton() {
  const btn = document.getElementById('btn-properties');
  if (!btn) return;
  const visible = !!state.properties.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function togglePropertiesPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.properties.visibleByPane[paneIdx];
  state.properties.visibleByPane[paneIdx] = next;
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('properties');
  applyPropertiesVisibility(paneIdx);
  await persistPropertiesSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistPropertiesSettings() {
  await persistSetting('properties.visibleColumn0', !!state.properties.visibleByPane[0]);
  await persistSetting('properties.visibleColumn1', !!state.properties.visibleByPane[1]);
}

export async function loadPropertiesSettings() {
  const v0 = await api.getSetting('properties.visibleColumn0');
  const v1 = await api.getSetting('properties.visibleColumn1');
  state.properties.visibleByPane[0] = !!v0;
  state.properties.visibleByPane[1] = !!v1;
}

// --- Tag-Sidebar (4T-0056, Epic 3E-0011) ------------------------------------
// Vierte Sidebar-Sektion zwischen Properties und Backlinks. Zeigt alle
// Tags im Backlinks-Suchraum mit Haeufigkeits-Counts in hierarchischer
// Anzeige (Slash-getrennte Hierarchie). Filter-Eingabe macht Substring-
// Match. Klick auf einen Tag wechselt die Anzeige auf die Datei-Liste
// fuer diesen Tag; Back-Button geht zur Tag-Liste zurueck.
export function applyTagsVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.tagsSection) return;
  // 4T-0075: Tags im Empty-State zwangsweise unsichtbar.
  // 4T-0294: bei deaktivierter Tag-Erweiterung ebenso; die persistierte
  // Sichtbarkeits-Preference bleibt erhalten.
  const visible = !isAllEmpty() && isExtensionActive('tags') && !!state.tags.visibleByPane[paneIdx];
  els.tagsSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderTags(paneIdx);
  updateTagsToggleButton();
}

export function updateTagsToggleButton() {
  const btn = document.getElementById('btn-tags');
  if (!btn) return;
  const visible = !!state.tags.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleTagsPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.tags.visibleByPane[paneIdx];
  state.tags.visibleByPane[paneIdx] = next;
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('tags');
  applyTagsVisibility(paneIdx);
  await persistTagsSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistTagsSettings() {
  await persistSetting('tags.visibleColumn0', !!state.tags.visibleByPane[0]);
  await persistSetting('tags.visibleColumn1', !!state.tags.visibleByPane[1]);
}

export async function loadTagsSettings() {
  const v0 = await api.getSetting('tags.visibleColumn0');
  const v1 = await api.getSetting('tags.visibleColumn1');
  state.tags.visibleByPane[0] = !!v0;
  state.tags.visibleByPane[1] = !!v1;
}

// === 4T-0287 (Epic 3E-0051): Panel-Registrierung =============================
// getVisible spiegelt die effektive Sichtbarkeits-Logik aus
// applySidebarVisibility (panels.js) inklusive Empty-State-Override.

registerSidebarPanel({
  id: 'properties',
  titleKey: 'properties.title',
  buttonId: 'btn-properties',
  sectionClass: 'sidebar-properties',
  getVisible: (paneIdx) =>
    !isAllEmpty() && !!(state.properties && state.properties.visibleByPane[paneIdx]),
  applyVisibility: applyPropertiesVisibility,
  toggle: togglePropertiesPanel,
});

registerSidebarPanel({
  id: 'tags',
  titleKey: 'tags.title',
  buttonId: 'btn-tags',
  sectionClass: 'sidebar-tags',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('tags') &&
    !!(state.tags && state.tags.visibleByPane[paneIdx]),
  applyVisibility: applyTagsVisibility,
  toggle: toggleTagsPanel,
});
