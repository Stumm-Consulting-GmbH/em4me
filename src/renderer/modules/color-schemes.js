// 4T-0465 (Epic 3E-0086): Renderer-seitige Anwendung der Farbschemas.
//
// Setzt die abweichenden Slot-Variablen des aktiven Schemas inline auf das
// Wurzel-Element (document.documentElement) und räumt die nicht abweichenden,
// sodass Standard-Schemas die Stylesheet-Werte gelten lassen (pixel-identisch).
// Weil Inline-Styles am Wurzel-Element sowohl :root als auch [data-theme='dark']
// übersteuern, muss das Schema bei jedem Hell/Dunkel-Wechsel neu angewandt
// werden (app-init.js: onThemeChanged) — sonst klebt die zuletzt gesetzte
// Palette über beiden Modi. Weil alle Ansichten (Render-Pane, Live, Lese-
// Ansicht, Gliederung) dieselben Wurzel-Variablen nutzen, deckt das Setzen am
// Wurzel-Element alle Ansichten zugleich ab.
//
// Muster frontmatter-display.js / heading-numbering.js: Modul-State, Laden aus
// dem Store beim Start, idempotentes Anwenden beim Multi-Window-Broadcast. Die
// reine Slot-/Schema-Logik liegt im prozessneutralen src/shared/color-schemes.js.
'use strict';

import { api } from './api.js';
import {
  COLOR_SCHEMES_KEY,
  COLOR_SLOTS,
  defaultState,
  normalizeState,
  getActiveScheme,
  computeSchemeVars,
  resolveSchemeColors,
  hexToRgba,
} from '../../shared/color-schemes.js';

let schemeState = defaultState();

// Aktueller Modus aus dem data-theme-Attribut des Wurzel-Elements.
function currentMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Wendet ein Schema auf ein Wurzel-Element an: abweichende Slot-Variablen
// werden inline gesetzt, nicht abweichende geräumt (dann gilt das Stylesheet).
export function applySchemeToRoot(root, scheme) {
  const { set, clear } = computeSchemeVars(scheme);
  for (const varName of clear) root.style.removeProperty(varName);
  for (const [varName, value] of Object.entries(set)) root.style.setProperty(varName, value);
}

// Wendet das aktive Schema des aktuellen Modus auf das Wurzel-Element an
// (Standard: document.documentElement; ein anderes Element nur für Tests).
export function applyActiveColorScheme(root = document.documentElement) {
  applySchemeToRoot(root, getActiveScheme(schemeState, currentMode()));
}

export function getColorSchemeState() {
  return schemeState;
}

// Zustand übernehmen (aus Broadcast oder UI) und anwenden. Idempotent; ein
// unveränderter Zustand führt zum selben Ergebnis.
export function setColorSchemeState(next) {
  schemeState = normalizeState(next);
  applyActiveColorScheme();
}

// PDF-Export (Export-Option 2, PO-Freigabe 2026-07-13): Der Druck bleibt hell
// und folgt dem aktiven HELL-Schema (nie dem dunklen). Liefert den vollständigen
// Variablen-Satz des aktiven Hell-Schemas (alle Slot-Variablen plus die
// abgeleitete --accent-soft und das feste helle --shadow) als Override-Tabelle,
// die der Export für die Druck-Dauer auf das Wurzel-Element zwingt.
export function pdfColorOverrides() {
  const full = resolveSchemeColors(getActiveScheme(schemeState, 'light'));
  const overrides = {};
  for (const slot of COLOR_SLOTS) {
    for (const varName of slot.vars) overrides[varName] = full[slot.id];
  }
  overrides['--accent-soft'] = hexToRgba(full.accent, 0.12);
  overrides['--shadow'] = '0 2px 8px rgba(0, 0, 0, 0.08)';
  return overrides;
}

// App-Start: persistierten Zustand laden (Store-Key colorSchemes) und anwenden.
export async function initColorSchemesFromStore() {
  let stored;
  try {
    stored = await api.getSetting(COLOR_SCHEMES_KEY);
  } catch (err) {
    console.warn('Farbschema-Settings laden fehlgeschlagen:', err);
  }
  schemeState = normalizeState(stored);
  applyActiveColorScheme();
}
