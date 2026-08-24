// Schreibweg des Block-Eigenschaften-Panels: Feld-Zeilen auslesen,
// Debounce-Save und Flush.
// 4T-0979 (Epic 3E-0196): Auszug aus block-props-panel.js. Liegt unterhalb des
// Feld-Aufbaus (block-props-fields), weil jeder Feld-Hook den Debounce-Save
// auslöst; die umgekehrte Richtung gibt es nicht (Muster properties-save).
'use strict';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { fieldDefinitionHint } from '../../../shared/property-profiles.js';
import { isValidBlockAnchorId } from '../../../shared/block-anchors.js';
import { applyFieldHint, defaultValueForType } from './properties-types.js';
import { activePathForPane } from './block-props-context.js';

// Liest den Wert einer Feld-Zeile passend zum Typ aus dem DOM.
export function extractRowValue(fieldEl, type) {
  const valueEl = fieldEl.querySelector('.properties-field-value');
  if (!valueEl) return defaultValueForType(type);
  // 4T-0449: Auswahl-Liste eines Wertebereichs-Felds (Einfach-Auswahl).
  const select = valueEl.querySelector('select.properties-field-value-select');
  if (select) {
    if (type === 'number') {
      const n = parseFloat(select.value);
      return Number.isFinite(n) ? n : 0;
    }
    return select.value;
  }
  // 4T-1156 (Epic 3E-0219): Zyklus-Knopf und Chips-Leiste vor der
  // Typ-Verzweigung, weil beide seit der Entkopplung an jedem Typ hängen
  // können; gleiche Reihenfolge wie in extractFieldValue des Dokument-Panels.
  const zyklus = valueEl.querySelector('button.properties-field-value-cycle');
  if (zyklus) return zyklus.dataset.value || '';
  const chipListe = valueEl.querySelector('.properties-field-multistring');
  if (chipListe) {
    const pills = chipListe.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  if (type === 'string' || type === 'date' || type === 'link' || type === 'time') {
    const input = valueEl.querySelector('input');
    return input ? input.value : '';
  }
  if (type === 'multiline') {
    const ta = valueEl.querySelector('textarea');
    return ta ? ta.value : '';
  }
  if (type === 'number') {
    const input = valueEl.querySelector('input');
    const n = input ? parseFloat(input.value) : NaN;
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') {
    const cb = valueEl.querySelector('input[type=checkbox]');
    return cb ? !!cb.checked : false;
  }
  if (type === 'multistring') {
    const pills = valueEl.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  return defaultValueForType(type);
}

// Baut das values-Objekt aus den Feld-Zeilen (leere Schluessel uebersprungen).
function readValuesFromDom(els) {
  const out = {};
  const rows = els.blockPropsFields.querySelectorAll('.properties-field');
  for (const row of rows) {
    const keyInput = row.querySelector('.properties-field-key');
    const typeSelect = row.querySelector('.properties-field-type');
    const key = ((keyInput && keyInput.value) || '').trim();
    if (!key) continue;
    const type = typeSelect ? typeSelect.value : 'string';
    out[key] = extractRowValue(row, type);
  }
  return out;
}

// --- Speichern (Debounce + Flush) -------------------------------------------

export function scheduleSaveBlockProps(paneIdx) {
  const timers = state.blockProps.saveTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  state.blockProps.saveContext[paneIdx] = {
    path: activePathForPane(paneIdx),
    anchorId: state.blockProps.activeAnchorByPane[paneIdx],
  };
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    saveBlockProps(paneIdx, state.blockProps.saveContext[paneIdx]);
  }, 500);
}

export function flushPendingSave(paneIdx) {
  const timers = state.blockProps.saveTimers;
  if (!timers[paneIdx]) return;
  clearTimeout(timers[paneIdx]);
  timers[paneIdx] = null;
  saveBlockProps(paneIdx, state.blockProps.saveContext[paneIdx]);
}

async function saveBlockProps(paneIdx, ctx) {
  if (!ctx || !ctx.path || !isValidBlockAnchorId(ctx.anchorId)) return;
  const els = getPaneEls(paneIdx);
  if (!els || !els.blockPropsFields) return;
  const values = readValuesFromDom(els);
  // 4T-0449: weiche Hinweise der definierten Felder live nachziehen
  // (gleiche Regel wie im Properties-Editor, ohne DOM-Neuaufbau).
  for (const row of els.blockPropsFields.querySelectorAll('.properties-field')) {
    const def = row._profileDef;
    if (!def) continue;
    const type = row.dataset.currentType || 'string';
    applyFieldHint(
      row.querySelector('.properties-field-hint'),
      def,
      fieldDefinitionHint(def, extractRowValue(row, type)),
    );
  }
  // Lokalen Datenstand optimistisch nachziehen (Broadcast-Echo-Abgleich).
  const store = state.blockProps.dataByPane[paneIdx];
  if (store) {
    if (Object.keys(values).length === 0) delete store[ctx.anchorId];
    else store[ctx.anchorId] = { values, updated: null };
  }
  try {
    await api.writeBlockData(ctx.path, ctx.anchorId, values);
  } catch {
    /* transienter Fehler: der naechste Save wiederholt */
  }
}
