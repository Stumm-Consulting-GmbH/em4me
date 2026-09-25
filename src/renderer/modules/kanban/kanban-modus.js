// 4T-001847 (Epic 3E-000110): Verfügbarkeit des Tafel-Ansichts-Modus.
//
// **Die eine Stelle, an der entschieden wird, ob die Tafel-Ansicht zur Wahl
// steht.** Zwei Bedingungen, und beide müssen zutreffen: Die Erweiterung
// «Kanban» ist eingeschaltet, und das geöffnete Dokument ist eine Tafel. Alle
// Zugänge — Statusleiste, Ansichtsmenü, Kommando, Kommando-Palette,
// Sitzungs-Wiederherstellung — fragen diese eine Stelle und tragen keine
// eigene Bedingung; damit gibt es die Lage «Schalter sagt ja, Menü sagt nein»
// nicht.
//
// **Bewusst ein eigenes, winziges Modul** — dieselbe Begründung wie bei
// `mindmap-modus.js` und `canvas-modus.js`: Die Regel wird von `app-state.js`
// (beim Erzeugen eines geöffneten Dokuments), von `views.js` (beim
// Umschalten), von `tabs/tabs.js` (Statusleisten-Schalter und Menü-Meldung)
// und von `command-palette.js` (Kontext des Verfügbarkeits-Modells) gebraucht.
// Läge sie bei der Tafel-Fläche, zöge jede dieser Stellen die Ansichts-Kette
// mit. Dieses Modul importiert deshalb ausschließlich den prozessneutralen
// Format-Kern und den Erweiterungs-Lebenszyklus und ist damit nachweislich
// zyklusfrei.
//
// **Abweichung vom Vorbild `canvas-modus.js`, benannt und begründet:** Dort
// steht die Erweiterungs-Kennung im geteilten Kern `canvas-core.js`, weil die
// Fence-Regel der Markdown-Pipeline sie im Preload braucht und dort kein
// Renderer-Modul geladen werden kann. Die Tafel bringt kein Markdown-Konstrukt
// mit — sie ist gewöhnliches Markdown —, also fragt niemand im Preload nach
// ihrer Kennung. Sie steht deshalb hier, wie bei `mindmap-modus.js`, und der
// Format-Kern bleibt frei von einem Begriff, den er nicht braucht.
'use strict';

import { istTafelDokument } from '../../../shared/kanban/kanban-core.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

// Kennung der Erweiterung; steht an genau einer Stelle, damit Registry,
// Rückfall und Prüfung nicht auseinanderlaufen (Muster MINDMAP_EXTENSION_ID).
export const KANBAN_EXTENSION_ID = 'kanban';

/**
 * Ist die Kanban-Erweiterung derzeit eingeschaltet?
 *
 * Die Frage schließt die Abhängigkeit zu «Aufgaben» mit ein:
 * `isExtensionActive` wertet die **effektiv** abgeschaltete Menge aus, und die
 * nimmt eine abhängige Erweiterung mit ihrer Voraussetzung mit (Story
 * 4S-000978, AK6).
 *
 * @returns {boolean}
 */
export function istKanbanErweiterungAn() {
  return isExtensionActive(KANBAN_EXTENSION_ID);
}

/**
 * Ist dieses Dokument eine Tafel?
 *
 * Die Antwort kommt aus dem Format-Kern und wird hier nicht ein zweites Mal
 * hergeleitet — ein eigener Erkennungs-Weg liefe früher oder später gegen den
 * des Kerns, und die Anwendung böte eine Ansicht an, die der Kern nicht lesen
 * kann.
 *
 * @param {string} inhalt Dokument-Text.
 * @returns {boolean}
 */
export function istTafelInhalt(inhalt) {
  return typeof inhalt === 'string' && istTafelDokument(inhalt);
}

/**
 * Ist der Tafel-Modus für dieses geöffnete Dokument verfügbar?
 *
 * Der Unterschied zwischen den beiden Bedingungen liegt in der **Darstellung**
 * und nicht hier: Die abgeschaltete Erweiterung lässt Schalter und
 * Menü-Eintrag **verschwinden** (es gibt die Funktion dann nicht), das
 * Dokument ohne Tafel lässt sie sichtbar **deaktiviert** stehen (es gibt sie,
 * dieses Dokument trägt sie nur nicht — Story 4S-000972, AK7).
 *
 * System- und Handbuch-Seiten bleiben außen vor: Erstere kennen überhaupt
 * keine Ansichts-Modi, Letztere sind Programm-Texte ohne Tafel.
 *
 * @param {object|null} tab geöffnetes Dokument.
 * @returns {boolean}
 */
export function istTafelModusVerfuegbar(tab) {
  if (!istKanbanErweiterungAn()) return false;
  if (!tab || tab.systemPage) return false;
  return istTafelInhalt(tab.content);
}

/**
 * Rückfall-Modus für ein geöffnetes Dokument, dessen gespeicherter Modus
 * «kanban» lautet, das aber keine Tafel (mehr) ist oder dessen Erweiterung
 * abgeschaltet ist.
 *
 * Beide Fälle entstehen real: Der Kopf-Schlüssel wird außerhalb der Anwendung
 * aus der Datei entfernt, nachdem das Dokument in der Tafel-Ansicht
 * gespeichert war; oder der Anwender schaltet die Erweiterung ab und öffnet
 * das Dokument danach (Story 4S-000978, AK2). Ohne den Rückfall trüge das
 * geöffnete Dokument einen Modus, den es nicht (mehr) gibt, und seine Fläche
 * bliebe leer.
 *
 * @param {string} mode gespeicherter Ansichts-Modus.
 * @param {string} inhalt Dokument-Text.
 * @returns {string}
 */
export function resolveTafelViewMode(mode, inhalt) {
  if (mode !== 'kanban') return mode;
  if (!istKanbanErweiterungAn() || !istTafelInhalt(inhalt)) return 'rendered';
  return mode;
}
