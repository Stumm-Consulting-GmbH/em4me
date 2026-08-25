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
// 4T-1179 (Epic 3E-0220): `isEmptyPropertyValue` wird hier nicht mehr
// gebraucht — die Leer-Frage des Feld-Formulars beantwortet dessen eigene
// Prüfung am Bedienelement, weil der typisierte Wert sie für Zahlen und
// Ja/Nein-Felder falsch beantwortete.
import { fieldDefinitionHint } from '../../../shared/property-profiles.js';
import { applyFieldHint, extractFieldValue, refreshProfileResolution } from './properties-types.js';
// 4T-1172 (Epic 3E-0220): Die Regel, wann ein nur definiertes Feld draußen
// bleibt — sie gehört zur Fachlichkeit des Feld-Formulars.
import { bleibtAusDemDokument } from './properties-feld-formular.js';
// 4T-1185 (Epic 3E-0221): Marke der abgeleiteten Felder aus dem gemeinsamen
// Modul beider Panels — Setzen und Auswerten haben dieselbe Quelle.
import { istAbgeleitetesFeld } from './properties-neue-typen.js';

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
    // 4T-1185 (Epic 3E-0221, E1): Ein abgeleitetes Feld geht NIE ins Dokument.
    // Die Prüfung steht vor jeder anderen — vor dem Lesen des Wertes und vor
    // dem readonly-Zweig, der den Ursprungs-Wert zurückschreibt —, weil hier
    // die Zusage aus E1 hängt: Das Öffnen eines Dokuments verändert es nicht.
    // Anders als beim Angebot des Feld-Formulars gibt es keinen Fall, in dem
    // der Wert doch gehört: Er hat keinen Ursprung in der Datei.
    if (istAbgeleitetesFeld(fieldEl)) continue;
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
    const wert = extractFieldValue(fieldEl, type);
    // 4T-1172 (Epic 3E-0220): Ein Feld aus dem Ausklapp-Bereich des
    // Feld-Formulars ist definiert, steht aber noch nicht im Dokument; solange
    // es leer ist, bleibt es draußen. Die Regel selbst liegt beim Formular,
    // weil sie zu dessen Fachlichkeit gehört — hier steht nur ihre Anwendung,
    // und der Schreibweg bleibt der eine, den alle Felder nehmen.
    if (bleibtAusDemDokument(fieldEl)) continue;
    out[key] = wert;
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
  // 4T-1179 (Epic 3E-0220): Gezählt wird, was ins Dokument geht. Ein leeres
  // Angebot des Feld-Formulars bleibt draußen — dieselbe Regel wie oben in
  // readPropertiesFromPane — und darf deshalb kein Duplikat auslösen. Ohne
  // die Trennung sperrte das Angebot den Save genau des Feldes, das der
  // Anwender eben über das Vorschlags-Menü angelegt hatte: Es stand dann im
  // Dokument-Teil und zugleich noch als Angebot im Bereich, der Save setzte
  // wegen des scheinbaren Duplikats aus, und ohne Save kam auch kein Render,
  // der das Angebot entfernt hätte.
  const zaehlend = new Set();
  for (const fieldEl of els.propertiesFields.querySelectorAll('.properties-field')) {
    // 4T-1185: Ein abgeleitetes Feld zaehlt hier so wenig wie ein Angebot —
    // es geht nicht ins Dokument und darf deshalb keinen Duplikat-Alarm
    // ausloesen, der den Save eines gleichnamigen echten Feldes sperrt.
    if (istAbgeleitetesFeld(fieldEl)) continue;
    if (bleibtAusDemDokument(fieldEl)) continue;
    zaehlend.add(fieldEl);
  }
  const counts = new Map();
  const keyInputs = els.propertiesFields.querySelectorAll('.properties-field-key');
  for (const inp of keyInputs) {
    if (!zaehlend.has(inp.closest('.properties-field'))) continue;
    const k = (inp.value || '').trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let hasDuplicates = false;
  for (const inp of keyInputs) {
    const k = (inp.value || '').trim();
    const dup = !!k && zaehlend.has(inp.closest('.properties-field')) && counts.get(k) > 1;
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
