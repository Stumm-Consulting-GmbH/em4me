// 4T-001653 (Epic 3E-000287): Verfügbarkeit des Canvas-Ansichts-Modus.
//
// **Anordnung des Product Owners vom 2026-09-09:** Die Canvas-Ansicht ist nur
// auswählbar, wenn das Dokument eine Canvas-Fläche enthält. Anders als die
// übrigen fünf Modi ist sie damit **dokument-abhängig**: Quelltext, geteilte
// Ansicht, Lese-Ansicht, Live und Mindmap zeigen jedes Markdown-Dokument,
// eine Canvas-Ansicht ohne Fläche zeigte dagegen nichts als einen Hinweis.
// Ein Zugang, der zuverlässig ins Leere führt, ist keiner.
//
// **Bewusst ein eigenes, winziges Modul** — dieselbe Begründung wie bei
// `mindmap-modus.js`: Die Regel wird von app-state.js (beim Erzeugen eines
// geöffneten Dokuments), von views.js (beim Umschalten) und von tabs.js
// und Menü-Meldung) gebraucht. Läge sie in canvas-pane.js, zöge jede dieser
// Stellen die Ansichts-Kette mit. Dieses Modul importiert deshalb
// ausschließlich den prozessneutralen Kern und den Erweiterungs-Lebenszyklus
// und ist damit nachweislich zyklusfrei.
//
// Die **zweite** Bedingung, der Erweiterungs-Schalter, ist mit 4T-001656 hier
// hinzugekommen; die Aufrufer sind davon unberührt geblieben, weil sie schon
// zuvor diese eine Stelle gefragt haben. Der Zustand der Erweiterung kommt aus
// `extension-lifecycle.js` — demselben Modul, aus dem `mindmap-modus.js` ihn
// holt, und aus derselben Begründung: Es importiert weder app-state noch
// settings-page, die Kette bleibt nachweislich zyklusfrei.
'use strict';

import { CANVAS_EXTENSION_ID, istCanvasDokument } from '../../../shared/canvas/canvas-core.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

// Kennung der Erweiterung; steht an genau einer Stelle, damit Registry,
// Rückfall und Prüfung nicht auseinanderlaufen.
// Seit 4T-001668 ist diese eine Stelle der Kern: Die Fence-Regel der
// Markdown-Pipeline fragt dieselbe Kennung, lebt aber im Preload und kann ein
// Renderer-Modul nicht laden. Hier bleibt der Weiter-Export, damit die
// bisherigen Aufrufer unberührt bleiben.
export { CANVAS_EXTENSION_ID };

/**
 * Ist die Canvas-Erweiterung derzeit eingeschaltet?
 *
 * Muster `isMindmapModeAvailable`. Eine unbekannte Kennung gälte als Kern und
 * damit als aktiv; seit 4T-001656 steht sie in der Registry, die Antwort ist
 * also der echte Schalter-Stand.
 *
 * @returns {boolean}
 */
export function istCanvasErweiterungAn() {
  return isExtensionActive(CANVAS_EXTENSION_ID);
}

/**
 * Trägt dieses Dokument eine Canvas-Fläche?
 *
 * @param {string} inhalt Dokument-Text.
 * @returns {boolean}
 */
export function hatCanvasFlaeche(inhalt) {
  return typeof inhalt === 'string' && istCanvasDokument(inhalt);
}

/**
 * Ist der Canvas-Modus für dieses geöffnete Dokument verfügbar?
 *
 * Zwei Bedingungen, und beide müssen zutreffen: Die Erweiterung ist
 * eingeschaltet (4T-001656, Entscheidung E6 — im Aus-Zustand gibt es die
 * Ansicht nicht), und das Dokument trägt eine Fläche (4T-001653, Anordnung des
 * Product Owners vom 2026-09-09 — ohne Fläche führte der Zugang ins Leere).
 * Der Unterschied liegt in der Darstellung und nicht hier: Die abgeschaltete
 * Erweiterung lässt Schalter und Menü-Eintrag **verschwinden**, das Dokument
 * ohne Fläche lässt sie sichtbar **deaktiviert** stehen.
 *
 * System- und Handbuch-Seiten bleiben außen vor: Erstere kennen überhaupt
 * keine Ansichts-Modi, Letztere sind Programm-Texte ohne Flächen.
 *
 * @param {object|null} tab
 * @returns {boolean}
 */
export function istCanvasModusVerfuegbar(tab) {
  if (!istCanvasErweiterungAn()) return false;
  if (!tab || tab.systemPage) return false;
  return hatCanvasFlaeche(tab.content);
}

/**
 * Rückfall-Modus für ein geöffnetes Dokument, dessen gespeicherter Modus
 * «canvas» lautet, das aber keine Fläche (mehr) trägt oder dessen Erweiterung
 * abgeschaltet ist.
 *
 * Beide Fälle entstehen real: Ein Dokument wird in der Canvas-Ansicht
 * gespeichert und die Fence später außerhalb der Anwendung aus der Datei
 * entfernt (4T-001653); oder der Anwender schaltet die Erweiterung ab und
 * öffnet das Dokument danach (4T-001656, AK2). Ohne den Rückfall trüge das
 * geöffnete Dokument einen Modus, den es nicht (mehr) gibt, und seine Fläche
 * bliebe leer.
 *
 * @param {string} mode gespeicherter Ansichts-Modus.
 * @param {string} inhalt Dokument-Text.
 * @returns {string}
 */
export function resolveCanvasViewMode(mode, inhalt) {
  if (mode !== 'canvas') return mode;
  if (!istCanvasErweiterungAn() || !hatCanvasFlaeche(inhalt)) return 'rendered';
  return mode;
}
