// 4T-1047 (Epic 3E-0151): Verfügbarkeit des Mindmap-Ansichts-Modus.
//
// **Bewusst ein eigenes, winziges Modul.** Die Regel wird von app-state.js
// (beim Erzeugen eines Reiters) und von views.js (beim Umschalten) gebraucht.
// Lag sie in mindmap-pane.js, zöge app-state über diesen Weg das
// Einstellungs-Modul mit, und dessen Registrierung läuft als Modul-
// Seiteneffekt: Die Kette app-state → mindmap-pane → mindmap-einstellungen →
// settings-page → system-pages traf in 4T-1048 auf ein noch nicht
// initialisiertes SYSTEM_PAGES und riss 21 Testdateien beim Import.
//
// Dieses Modul importiert deshalb ausschließlich den Erweiterungs-Zustand,
// und extension-lifecycle.js importiert seinerseits weder app-state noch
// settings-page. Damit ist die Kette nachweislich zyklusfrei.
'use strict';

import { isExtensionActive } from '../extensions/extension-lifecycle.js';

// Kennung der Erweiterung; steht an genau einer Stelle, damit Registry,
// Rückfall und Prüfung nicht auseinanderlaufen.
export const MINDMAP_EXTENSION_ID = 'mindmap';

/** Ist der Mindmap-Modus derzeit verfügbar? */
export function isMindmapModeAvailable() {
  return isExtensionActive(MINDMAP_EXTENSION_ID);
}

/**
 * Rückfall-Modus für einen gespeicherten Reiter. Ohne ihn trüge ein
 * wiederhergestellter Reiter einen Modus, den es nicht mehr gibt, und seine
 * Pane bliebe leer (Story S-0804, AK7).
 */
export function resolveViewModeForTab(mode) {
  if (mode === 'mindmap' && !isMindmapModeAvailable()) return 'rendered';
  return mode;
}
