// Schreibweg des Block-Eigenschaften-Panels: Feld-Zeilen auslesen,
// Debounce-Save und Flush.
// 4T-000979 (Epic 3E-000196): Auszug aus block-props-panel.js. Liegt unterhalb des
// Feld-Aufbaus (block-props-fields), weil jeder Feld-Hook den Debounce-Save
// auslöst; die umgekehrte Richtung gibt es nicht (Muster properties-save).
'use strict';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { fieldDefinitionHint } from '../../../shared/property-profiles.js';
import { isValidBlockAnchorId } from '../../../shared/block-anchors.js';
import { applyFieldHint, defaultValueForType } from './properties-types.js';
import { activePathForPane } from './block-props-context.js';
// 4T-001185 (Epic 3E-000221): Marke der abgeleiteten Felder aus dem gemeinsamen
// Modul beider Panels.
import { istAbgeleitetesFeld } from './properties-neue-typen.js';
// 4T-001185: Nachzug der abgeleiteten Werte nach einer Aenderung (Begruendung
// an der Funktion).
import { aktualisiereAbgeleiteteFelder } from './properties-abgeleitet.js';
// 4T-001187 (Epic 3E-000221): Auslese der gestapelten Bedienung, gemeinsam mit dem
// Dokument-Panel.
import { OBJECT_TYPES } from '../../../shared/property-profiles.js';
import { leseObjektWert } from './properties-objekt-felder.js';
import { extractFromValueEl } from './properties-typ-werte.js';

// Liest den Wert einer Feld-Zeile passend zum Typ aus dem DOM.
export function extractRowValue(fieldEl, type) {
  const valueEl = fieldEl.querySelector('.properties-field-value');
  if (!valueEl) return defaultValueForType(type);
  // 4T-001187 (Epic 3E-000221, E11): gestapelte Objekt-Bedienung — ZUERST, aus
  // demselben Grund wie im Dokument-Panel: Die Zweige darunter suchen in die
  // Tiefe der Wert-Zelle und fänden sonst die Bedienelemente der Kind-Felder
  // (Begründung an `extractFromValueEl` in properties-typ-werte.js).
  if (OBJECT_TYPES.includes(type)) {
    const def = fieldEl._profileDef || null;
    const kinder = def && Array.isArray(def.fields) ? def.fields : [];
    if (kinder.length === 0) return defaultValueForType(type);
    return leseObjektWert(valueEl, def, (zelle, name) => {
      const kindDef = kinder.find((k) => k && k.name === name) || null;
      return kindDef ? extractFromValueEl(zelle, kindDef.type, kindDef) : undefined;
    });
  }
  // 4T-000449: Auswahl-Liste eines Wertebereichs-Felds (Einfach-Auswahl).
  const select = valueEl.querySelector('select.properties-field-value-select');
  if (select) {
    if (type === 'number') {
      const n = parseFloat(select.value);
      return Number.isFinite(n) ? n : 0;
    }
    return select.value;
  }
  // 4T-001156 (Epic 3E-000219): Zyklus-Knopf und Chips-Leiste vor der
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
    // 4T-001185 (Epic 3E-000221, E1): Ein abgeleitetes Feld geht nie in die
    // Begleitdatei. Dieselbe Regel wie im Dokument-Schreibweg und aus
    // demselben Grund: Der Wert hat keinen Ursprung in den Daten, er wird
    // gerechnet. Ohne diese Zeile schriebe das blosse Anzeigen eines Blocks
    // seine abgeleiteten Felder als gewoehnliche Werte fest.
    if (istAbgeleitetesFeld(row)) continue;
    const keyInput = row.querySelector('.properties-field-key');
    const typeSelect = row.querySelector('.properties-field-type');
    const key = ((keyInput && keyInput.value) || '').trim();
    if (!key) continue;
    // 4T-001187 (Epic 3E-000221): Der Typ kommt aus `dataset.currentType`, wie im
    // Dokument-Schreibweg seit 4T-000448 — und aus einem Grund, der hier erst
    // mit den Objekt-Typen sichtbar wurde: Ein Typ, den der Wechsler nicht
    // als Option führt (weil er nicht wählbar ist), lässt sich an ihm auch
    // nicht setzen; `select.value` fällt dann still auf die erste Option
    // zurück. Der Datensatz an der Zeile trägt den Typ verlässlich.
    const type = row.dataset.currentType || (typeSelect ? typeSelect.value : 'string') || 'string';
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
  // 4T-000449: weiche Hinweise der definierten Felder live nachziehen
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
  // 4T-001185 (Epic 3E-000221, E1): Die abgeleiteten Werte haengen an den eben
  // geaenderten Feldern und werden deshalb hier nachgezogen — nur ihre
  // Anzeigen, ohne DOM-Neuaufbau, aus demselben Grund wie der Hinweis-Nachzug
  // darueber. Im Dokument-Panel uebernimmt das der ohnehin folgende Render.
  aktualisiereAbgeleiteteFelder(els.blockPropsFields, {
    aufloesung: state.properties.profileByPane[paneIdx],
    werte: values,
  });

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
