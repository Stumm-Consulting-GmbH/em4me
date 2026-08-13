// Schreibweg der Properties-Sidebar: Felder auslesen, Duplikate markieren,
// Debounce-Save und Flush.
// 4T-0981 (Epic 3E-0196): Auszug aus properties-tags.js. Liegt bewusst
// unterhalb des Feld-Aufbaus (properties-fields), weil jeder Feld-Hook den
// Debounce-Save auslöst; die umgekehrte Richtung gibt es nicht.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { applyRenderPipeline } from '../render-mermaid.js';
import { getPaneEls, state } from '../app/app-state.js';
import { syncEditorForPane, updateWindowTitle } from '../editor/editor.js';
import { renderTabbar } from '../views/tabbar.js';
import { scheduleAutoSave } from '../views/views.js';
import { fieldDefinitionHint } from '../../../shared/property-profiles.js';
import { applyFieldHint, extractFieldValue, refreshProfileResolution } from './properties-types.js';

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
