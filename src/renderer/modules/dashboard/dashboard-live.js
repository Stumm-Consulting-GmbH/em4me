'use strict';

// 4T-002518 (Epic 3E-000402): Das Dashboard im Block-Widget des Live-Modus
// (Story 4S-001187, AK1 und AK5). Das Modul beantwortet eine Frage: wie ein
// Dashboard, das das Widget isoliert rendert, dieselben Kacheln mit denselben
// Werten zeigt wie in der gerenderten Ansicht.
//
// **Warum ein eigener Schritt und nicht die beiden Aufrufe der Lese-Ansicht:**
// Das Widget rendert allein den Quelltext seines Blocks; die Pipeline zählt die
// Dashboards darin ab null, jedes Widget trüge also die Ordnungszahl 0. Die
// gemerkte Auswahl hängt aber an der Ordnungszahl im Dokument
// (`dashboard-zustand.js`), und die kennt nur der Editor: Sie folgt aus der
// Stelle, an der das Widget steht (Muster `startZeileZu` in
// `canvas/canvas-block-zustand.js`). Die Stelle gibt es erst, wenn das Widget
// eingehängt ist; deshalb läuft der Schritt nach dem Einhängen, mit derselben
// Wiedervorlage wie der Canvas-Block. Bis dahin ist keine Kachel
// Abfrage-Container, und die Abfrage-Befüllung des Widgets übergeht sie; die
// erste Abfrage fragt so einmal, mit der gemerkten Auswahl.
//
// **Der Schreibpunkt bleibt draußen:** Ein Klick in ein Auswahlfeld ist eine
// Befüllung, keine Bearbeitung. Das Widget hält die Zeiger-Ereignisse vom
// Editor fern (`ignoreEvent`), und das Auswahlfeld hält sein `mousedown`
// zusätzlich bei sich, damit kein Zuhörer darüber den Schreibpunkt in den
// Block setzt; das Feld selbst öffnet wie gewohnt.
//
// Der Fenster-Zustand kommt vom Aufrufer, aus demselben Grund wie in
// `dashboard-filter.js`.

import { EditorView } from '@codemirror/view';
import { findDashboardFences } from '../../../shared/dashboard/dashboard-core.js';
import { befuelleAbfrageContainer } from '../query/frontmatter-query-view.js';
import { bereiteDashboardKachelnVor } from './dashboard-view.js';
import { richteDashboardFilterEin } from './dashboard-filter.js';

/**
 * Ordnungszahl eines Dashboards im Dokument des Editors, aus der Zeile, an der
 * sein Widget steht; `null`, wenn sie nicht zu bestimmen ist.
 * @param {Element} block `.perspective-dashboard` im Widget
 * @returns {number|null}
 */
export function ordnungszahlImEditor(block) {
  const editorEl = block && block.closest ? block.closest('.cm-editor') : null;
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  if (!view) return null;
  try {
    const doc = view.state.doc;
    const zeile = doc.lineAt(Math.max(0, Math.min(view.posAtDOM(block), doc.length))).number;
    const nr = findDashboardFences(doc.toString()).findIndex((f) => f.startZeile === zeile);
    return nr >= 0 ? nr : null;
  } catch {
    return null;
  }
}

function halteSchreibpunkt(block) {
  if (block.dataset.dashboardLiveGebunden === '1') return;
  block.dataset.dashboardLiveGebunden = '1';
  block.addEventListener('mousedown', (event) => {
    const ziel = event.target;
    if (ziel && typeof ziel.closest === 'function' && ziel.closest('.dashboard-kopf')) {
      event.stopPropagation();
    }
  });
}

/**
 * Richtet die Dashboards eines Block-Widgets ein: Ordnungszahl aus der Stelle,
 * Befüllungs-Schritt, Auswahlfelder mit der gemerkten Auswahl und die erste
 * Befüllung der Kacheln. Läuft bei jedem Einhängen (auch beim Klon aus dem
 * Zwischenspeicher, der seine Zuhörer verliert).
 * @param {Element} container Container des Widgets
 * @param {string} basePath Pfad des Dokuments
 * @param {{panes: Array}} [zustand] Fenster-Zustand
 * @param {number} [versuche] Wiedervorlagen, solange das Widget nicht eingehängt ist
 * @returns {boolean} ob der Container ein Dashboard trägt
 */
export function richteDashboardWidgetEin(container, basePath, zustand, versuche = 3) {
  if (!container || typeof container.querySelectorAll !== 'function') return false;
  const bloecke = Array.from(container.querySelectorAll('.perspective-dashboard')).filter(
    (b) => !b.closest('.wiki-embed-md-body') && !b.parentElement.closest('.perspective-dashboard'),
  );
  if (bloecke.length === 0) return false;
  // Nach der letzten Wiedervorlage wird ohne Stelle eingerichtet: lieber die
  // Vorbelegung als leere Kacheln.
  if (!container.isConnected && versuche > 0) {
    requestAnimationFrame(() =>
      richteDashboardWidgetEin(container, basePath, zustand, versuche - 1),
    );
    return true;
  }
  for (const block of bloecke) {
    const nr = ordnungszahlImEditor(block);
    if (nr !== null) block.dataset.dashboardIndex = String(nr);
    halteSchreibpunkt(block);
  }
  bereiteDashboardKachelnVor(container, basePath || '');
  richteDashboardFilterEin(container, basePath || '', zustand);
  for (const block of bloecke) {
    for (const el of block.querySelectorAll('.dashboard-kachel-inhalt.perspective-query')) {
      // Eine Kachel mit Abfrage-Datei befüllt ihre Auflösung selbst.
      if (el.dataset.dashboardQuelleBase !== undefined) continue;
      if (el.closest('.perspective-dashboard') !== block) continue;
      befuelleAbfrageContainer(el, basePath || '');
    }
  }
  return true;
}
