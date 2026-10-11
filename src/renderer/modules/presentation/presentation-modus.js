// 4T-002160 (Epic 3E-000149): Verfügbarkeit des Präsentations-Ansichts-Modus.
//
// **Die eine Stelle, an der entschieden wird, ob die Präsentations-Ansicht zur
// Wahl steht.** Zwei Bedingungen, und beide müssen zutreffen: Die Erweiterung
// «Präsentation» ist eingeschaltet, und das geöffnete Dokument ist eine
// Präsentation. Alle Zugänge — Statusleiste, Ansichtsmenü, Kommando,
// Kommando-Palette, Sitzungs-Wiederherstellung, Nachzug beim Tippen — fragen
// diese eine Stelle und tragen keine eigene Bedingung.
//
// **Bewusst ein eigenes, winziges Modul** — dieselbe Begründung wie bei
// `kanban-modus.js`: Die Regel wird von `app-state.js`, `views.js`,
// `tabs/tabs.js` und `command-palette.js` gebraucht. Läge sie bei der Fläche,
// zöge jede dieser Stellen die Ansichts-Kette mit. Das Modul importiert
// deshalb ausschließlich den prozessneutralen Format-Kern und den
// Erweiterungs-Lebenszyklus und ist damit zyklusfrei.
//
// **Die Erkennung kommt aus dem Format-Kern** (4T-002159) und wird hier nicht
// ein zweites Mal hergeleitet. Die Erweiterungs-Kennung steht hier und nicht im
// Kern, aus demselben Grund wie bei der Tafel: Die Präsentation bringt kein
// Markdown-Konstrukt mit, das die Pipeline im Preload nach ihrer Kennung
// fragen müsste.
'use strict';

import { istPraesentationsDokument } from '../../../shared/presentation/presentation-core.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

// Kennung der Erweiterung; steht an genau einer Stelle, damit Registry,
// Rückfall und Prüfung nicht auseinanderlaufen (Muster KANBAN_EXTENSION_ID).
export const PRESENTATION_EXTENSION_ID = 'presentation';

/** Der Ansichts-Modus, den dieses Modul bewacht. */
export const PRESENTATION_VIEW_MODE = 'presentation';

/**
 * Ist die Präsentations-Erweiterung derzeit eingeschaltet?
 *
 * @returns {boolean}
 */
export function istPraesentationsErweiterungAn() {
  return isExtensionActive(PRESENTATION_EXTENSION_ID);
}

/**
 * Ist dieser Dokument-Text eine Präsentation?
 *
 * @param {string} inhalt Dokument-Text.
 * @returns {boolean}
 */
export function istPraesentationsInhalt(inhalt) {
  return typeof inhalt === 'string' && istPraesentationsDokument(inhalt) === true;
}

/**
 * Ist der Präsentations-Modus für dieses geöffnete Dokument verfügbar?
 *
 * Der Unterschied zwischen den beiden Bedingungen liegt in der **Darstellung**
 * und nicht hier: Die abgeschaltete Erweiterung lässt Schalter und
 * Menü-Eintrag **verschwinden**, das Dokument ohne Kennzeichen lässt sie
 * sichtbar **deaktiviert** stehen (Story 4S-001049, AK6).
 *
 * @param {object|null} tab geöffnetes Dokument.
 * @returns {boolean}
 */
export function istPraesentationsModusVerfuegbar(tab) {
  if (!istPraesentationsErweiterungAn()) return false;
  if (!tab || tab.systemPage) return false;
  return istPraesentationsInhalt(tab.content);
}

/**
 * Rückfall-Modus für ein geöffnetes Dokument, dessen gespeicherter Modus
 * «presentation» lautet, das aber keine Präsentation (mehr) ist oder dessen
 * Erweiterung abgeschaltet ist (Story 4S-001049, AK7; Story 4S-001056, AK6).
 *
 * @param {string} mode gespeicherter Ansichts-Modus.
 * @param {string} inhalt Dokument-Text.
 * @returns {string}
 */
export function resolvePraesentationsViewMode(mode, inhalt) {
  if (mode !== PRESENTATION_VIEW_MODE) return mode;
  if (!istPraesentationsErweiterungAn() || !istPraesentationsInhalt(inhalt)) return 'rendered';
  return mode;
}
