// --- Scroll-Sync (4T-000070, Epic 3E-000012) ------------------------------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
'use strict';

import { t } from '../../i18n.js';

import { activeTab, getPaneEls, state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { reportMenuStateNow } from '../tabs/tabs.js';

import { persistState } from './views.js';

// Synchronisiert beim Scrollen in der geteilten Ansicht (viewMode === 'split')
// die andere Pane proportional mit. Pro Tab via tab.scrollSyncEnabled
// togglebar. Anti-Loop-Schutz ueber das isSyncing-Flag pro Pane, das beim
// programmatischen Scrollen kurz gesetzt und in requestAnimationFrame
// zurueckgesetzt wird. Pro Pane unabhaengig — bei zwei Vertikal-Splits
// scrollt jede Pane mit ihrem eigenen Tab.

export const scrollSyncState = { isSyncing: [false, false] };

export function setupScrollSyncForPane(paneIdx) {
  const view = paneEditors[paneIdx];
  const els = getPaneEls(paneIdx);
  // Render-seitiger Scroll-Container ist .pane-rendered (els.renderedEl),
  // nicht das innere .markdown-body (els.renderedHtml). Letzteres ist nur
  // der Inhalt — overflow:auto sitzt auf der aeusseren Pane-Box.
  if (!view || !els || !els.renderedEl) return;
  view.scrollDOM.addEventListener('scroll', () => syncScrollFrom(paneIdx, 'source'));
  els.renderedEl.addEventListener('scroll', () => syncScrollFrom(paneIdx, 'rendered'));
}

export function syncScrollFrom(paneIdx, source) {
  if (scrollSyncState.isSyncing[paneIdx]) return;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab || !tab.scrollSyncEnabled) return;
  if (tab.viewMode !== 'split') return;
  const view = paneEditors[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!view || !els || !els.renderedEl) return;
  scrollSyncState.isSyncing[paneIdx] = true;
  try {
    if (source === 'source') syncSourceToRender(view, els.renderedEl);
    else syncRenderToSource(view, els.renderedEl);
  } catch {
    // Defensiv: bei DOM-Inkonsistenz lieber nichts tun als crashen.
  }
  requestAnimationFrame(() => {
    scrollSyncState.isSyncing[paneIdx] = false;
  });
}

// 4T-000070: Anchor-basierte Sync. Jedes Block-Open-Token traegt im Render-DOM
// ein data-source-line-Attribut (1-basierte Quell-Zeile, gesetzt vom
// sourceLineMapperPlugin im Preload). Beim Scrollen einer Pane wird die
// sichtbare Top-Zeile in der Quelle ermittelt; in der Ziel-Pane wird das
// Element gesucht, das diese Zeile (oder die naechste davor) abdeckt, und
// zum Top des Viewports gescrollt. Damit landet beim "Akzeptanzkriterien"-
// Heading tatsaechlich in beiden Panes dieselbe Stelle oben.
// R4-14 (4T-000180): Die [data-source-line]-Elemente samt geparster Zeile
// werden pro Render-DOM gecacht statt pro Scroll-Frame frisch per
// querySelectorAll + parseInt ermittelt. Invalidierung implizit: nach
// einem innerHTML-Ersatz sind die gecachten Elemente disconnected
// (Stichprobe erstes Element). Einzelne spaeter ersetzte Knoten (Mermaid
// tauscht <pre> gegen den Diagramm-Block) werden im Scan uebersprungen —
// das entspricht der frischen Query, in der der Ersatz-Knoten mangels
// data-source-line ebenfalls fehlte.
export function getSourceLineEntries(renderEl) {
  const cached = renderEl._scgLineEntries;
  if (cached && cached.length > 0 && cached[0].el.isConnected) return cached;
  const entries = [];
  for (const el of renderEl.querySelectorAll('[data-source-line]')) {
    const line = parseInt(el.dataset.sourceLine, 10);
    if (Number.isFinite(line)) entries.push({ line, el });
  }
  renderEl._scgLineEntries = entries;
  return entries;
}

export function syncSourceToRender(view, renderEl) {
  const sourceRect = view.scrollDOM.getBoundingClientRect();
  const pos = view.posAtCoords({ x: sourceRect.left + 10, y: sourceRect.top + 1 });
  if (pos == null) return;
  const line = view.state.doc.lineAt(pos).number;
  const target = findRenderElementForLine(renderEl, line);
  if (!target) return;
  const renderRect = renderEl.getBoundingClientRect();
  const elRect = target.getBoundingClientRect();
  const targetTop = elRect.top - renderRect.top + renderEl.scrollTop;
  renderEl.scrollTop = targetTop;
}

export function syncRenderToSource(view, renderEl) {
  const renderRect = renderEl.getBoundingClientRect();
  const entries = getSourceLineEntries(renderEl);
  let topEntry = null;
  for (const entry of entries) {
    if (!entry.el.isConnected) continue;
    const elRect = entry.el.getBoundingClientRect();
    if (elRect.bottom > renderRect.top + 1) {
      topEntry = entry;
      break;
    }
  }
  if (!topEntry) return;
  const line = topEntry.line;
  if (!Number.isFinite(line) || line < 1) return;
  if (line > view.state.doc.lines) return;
  const linePos = view.state.doc.line(line).from;
  const coords = view.coordsAtPos(linePos);
  if (!coords) return;
  const sourceRect = view.scrollDOM.getBoundingClientRect();
  const targetTop = coords.top - sourceRect.top + view.scrollDOM.scrollTop;
  view.scrollDOM.scrollTop = targetTop;
}

// Finde das beste Render-Element fuer eine gegebene Quell-Zeile. Strategie:
// "groesste Zeile <= line" — d.h. wir nehmen das Element, an dem der Block
// startet, der die gesuchte Zeile enthaelt. Wenn alle Elemente NACH der
// Zeile liegen (Edge-Case: ganz oben), nimm das erste.
// R4-14 (4T-000180): binaere Suche auf der gecachten, nach Dokument-
// Reihenfolge (= aufsteigender Quell-Zeile) sortierten Liste.
export function findRenderElementForLine(renderEl, line) {
  const entries = getSourceLineEntries(renderEl);
  if (entries.length === 0) return null;
  let lo = 0;
  let hi = entries.length - 1;
  let bestIdx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].line <= line) {
      bestIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Alle Elemente liegen nach der Zeile -> erstes nehmen (Edge-Case oben).
  if (bestIdx < 0) return entries[0].el;
  // Disconnected-Knoten (z.B. von Mermaid ersetzte <pre>) rueckwaerts
  // ueberspringen — wie bei der frischen Query, die sie nicht enthielte.
  for (let i = bestIdx; i >= 0; i--) {
    if (entries[i].el.isConnected) return entries[i].el;
  }
  return null;
}

export function toggleScrollSyncForActiveTab() {
  const tab = activeTab();
  if (!tab) return;
  tab.scrollSyncEnabled = !tab.scrollSyncEnabled;
  updateScrollSyncButton();
  reportMenuStateNow();
  persistState();
}

export function updateScrollSyncButton() {
  const btn = document.getElementById('btn-scroll-sync');
  if (!btn) return;
  const tab = activeTab();
  const enabled = !!(tab && tab.scrollSyncEnabled);
  btn.classList.toggle('active', enabled);
  btn.disabled = !tab;
  const titleKey = enabled ? 'statusbar.scrollSync.on' : 'statusbar.scrollSync.off';
  btn.setAttribute('data-i18n-title', titleKey);
  btn.title = t(titleKey);
}
