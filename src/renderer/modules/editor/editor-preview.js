// Vorschau-Aufbau des Render-Pane: Debounce je Pane, Schutz einer laufenden
// Inline-Bearbeitung und der Voll-Render samt PDF-Knoten-Wiederverwendung.
//
// Auszug aus editor.js, 4T-1002 (Epic 3E-0196).
'use strict';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applyRenderPipeline } from '../render-mermaid.js';
import { notePaneRendered } from '../views/pane-render.js';
import { scheduleOutlineActiveUpdate } from '../panels/panel-outline.js';

// R2-01 (4T-0174): Preview-Debounce pro Pane (vorher global — ein Tipp in
// Pane B cancelte den anstehenden Preview-Refresh von Pane A, deren
// Split-Vorschau blieb stale).
export const pendingPreviewTimers = [null, null];

// 4T-0653: Laeuft im Render-Pane gerade eine Inline-Bearbeitung, darf der
// Vorschau-Aufbau nicht dazwischenfahren. renderPreviewForPane ersetzt das
// innerHTML der Pane vollstaendig und nimmt dabei die Eingabefelder mit.
// Betroffen sind die Zeilen-Bearbeitung der Ereignis-Tabelle (tr.pev-editing)
// und die Zellen-Bearbeitung der Datentabelle (.pdt-editing).
function hasOpenInlineEdit(paneIdx) {
  const els = getPaneEls(paneIdx);
  const root = els && els.renderedHtml;
  return !!(root && root.querySelector('tr.pev-editing, .pdt-editing'));
}

// 4T-0653: Bricht einen geplanten Vorschau-Aufbau ab. Fuer Komponenten, die
// ins Dokument schreiben und die Pane anschliessend SELBST synchron neu
// rendern (Ereignis-Fence, Datentabelle). Deren Schreib-Vorgang plant ueber
// den Dokument-Listener einen zweiten, verzoegerten Aufbau, der dieselbe
// Vorschau nochmal baut. Das ist nicht nur doppelte Arbeit: Er trifft
// verzoegert in eine laufende Bedienung und ersetzt das DOM unter ihr,
// woran zuvor die Zeilen-Bearbeitung (EV-03) und das Loeschen gespeicherter
// Filter (EV-06) unter Last scheiterten.
export function cancelPendingPreviewUpdate(paneIdx) {
  if (pendingPreviewTimers[paneIdx]) {
    clearTimeout(pendingPreviewTimers[paneIdx]);
    pendingPreviewTimers[paneIdx] = null;
  }
}

/**
 * Plant den Vorschau-Aufbau der Pane mit laengen-abhaengigem Debounce; eine
 * offene Inline-Bearbeitung schiebt den Lauf auf, statt ihn zu zerstoeren.
 *
 * @param {number} paneIdx Index der Pane.
 */
export function schedulePreviewUpdate(paneIdx) {
  if (pendingPreviewTimers[paneIdx]) clearTimeout(pendingPreviewTimers[paneIdx]);
  // R2-12 (4T-0180): adaptiver Debounce — der Voll-Render kostet bei
  // grossen Dokumenten zweistellige Millisekunden pro Lauf; seltener
  // rendern haelt die Eingabe-Latenz im Split-Modus stabil.
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const len = tab && tab.content ? tab.content.length : 0;
  const delay = len > 400000 ? 600 : len > 100000 ? 350 : 150;
  pendingPreviewTimers[paneIdx] = setTimeout(() => {
    pendingPreviewTimers[paneIdx] = null;
    // 4T-0653: Aufbau aufschieben statt die offene Bearbeitung zu zerstoeren.
    // Das Bestaetigen einer Ereignis-Zeile schreibt selbst ins Dokument und
    // plant damit genau den Aufbau, der die naechste Bearbeitung getroffen
    // haette. Sobald die Bearbeitung endet, laeuft der Aufbau nach; das
    // Rueckschreiben rendert die Pane ohnehin sofort selbst.
    if (hasOpenInlineEdit(paneIdx)) {
      schedulePreviewUpdate(paneIdx);
      return;
    }
    renderPreviewForPane(paneIdx);
  }, delay);
}

/**
 * Baut das Render-Pane der Pane aus dem Inhalt des aktiven Reiters neu auf.
 *
 * @param {number} paneIdx Index der Pane.
 */
export function renderPreviewForPane(paneIdx) {
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  const els = getPaneEls(paneIdx);
  if (!els.renderedHtml) return;
  // R2-12 (4T-0180): fertig geladene PDF-Embed-Knoten zwischen zwei
  // Preview-Renders wiederverwenden — der Voll-DOM-Ersatz wuerde das
  // <embed> sonst bei jedem Tipp-Render neu laden (sichtbares Flackern,
  // PDF-Plugin-Reload). Reuse nur bei unveraendertem basePath; Schluessel
  // ist embedPath plus Breiten-Attribut.
  const oldPdfEmbeds = new Map();
  if (els.renderedHtml.dataset.previewBase === (tab.path || '')) {
    for (const span of els.renderedHtml.querySelectorAll(
      '.wiki-embed-processed[data-embed-kind="pdf"]',
    )) {
      const key = `${span.dataset.embedPath}|${span.dataset.embedWidth || ''}`;
      if (!oldPdfEmbeds.has(key)) oldPdfEmbeds.set(key, span);
    }
  }
  els.renderedHtml.dataset.previewBase = tab.path || '';
  els.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
  if (oldPdfEmbeds.size > 0) {
    for (const span of els.renderedHtml.querySelectorAll(
      '.wiki-embed[data-embed-kind="pdf"]:not(.wiki-embed-processed)',
    )) {
      const key = `${span.dataset.embedPath}|${span.dataset.embedWidth || ''}`;
      const old = oldPdfEmbeds.get(key);
      if (old) {
        span.replaceWith(old);
        oldPdfEmbeds.delete(key);
      }
    }
  }
  // R2-13/R5-07 (4T-0179): vereinheitlichte Render-Nachverarbeitung
  // (enthaelt seit 4T-0324 auch die Aussen-Link-Warnung der Bereichs-Apps).
  applyRenderPipeline(els.renderedHtml, tab.path);
  // R4-12 (4T-0180): Render-Skip-Cache nachfuehren — das DOM entspricht
  // jetzt diesem Tab-Stand, der naechste renderPaneContent kann skippen.
  notePaneRendered(paneIdx, tab);
  // 4T-0014: Aktive Outline-Sektion neu ermitteln, weil DOM-Heading-Knoten
  // im Render-Pane jetzt frische BoundingClientRects haben.
  if (state.outline && state.outline.visibleByPane[paneIdx]) {
    scheduleOutlineActiveUpdate(paneIdx);
  }
}
