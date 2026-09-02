// Ereignis-Verdrahtung der Spalten (Pane): Klick- und Scroll-Wege, Sidebar-
// Anteile, Reiterleisten-Ablage sowie die beiden Splitter.
//
// Auszug aus app-init.js, 4T-001001 (Epic 3E-000196).
'use strict';

import {
  MIME_TAB,
  getPaneEls,
  outerSplitter,
  paneRoots,
  panesContainer,
  state,
} from './app-state.js';
import { bindSidebarSplitters } from '../panels/panels.js';
import { bindOutlineEvents, scheduleOutlineActiveUpdate } from '../panels/panel-outline.js';
import { bindSidebarPanelDnd } from '../panels/sidebar-dnd.js';
import {
  activatePane,
  moveGroupInPane,
  moveTabBetweenPanes,
  parseTabDrag,
  reorderTabsWithinPane,
} from '../tabs/tabs.js';
import { handleRenderedClick } from '../views/link-navigation.js';
import { saveScroll } from '../views/pane-render.js';

/**
 * Verdrahtet die Ereignisse beider Spalten (einmalig beim Start).
 */
export function bindPaneEvents() {
  paneRoots.forEach((root, idx) => {
    root.addEventListener('mousedown', () => activatePane(idx));

    // 4T-000359 (Epic 3E-000066): spezifisch auf das Render-Pane (siehe buildPaneEls);
    // die Notizen-Vorschau traegt ebenfalls .markdown-body.
    const renderedHtml = root.querySelector('.pane-rendered .markdown-body');
    renderedHtml.addEventListener('click', (e) => handleRenderedClick(e, idx));

    const sourceEl = root.querySelector('.pane-source');
    const renderedEl = root.querySelector('.pane-rendered');
    sourceEl.addEventListener('scroll', () => saveScroll(idx));
    renderedEl.addEventListener('scroll', () => {
      saveScroll(idx);
      // 4T-000014: aktive Sektion folgt im Render-Modus dem Scroll-Stand.
      if (state.outline.visibleByPane[idx]) {
        scheduleOutlineActiveUpdate(idx);
      }
    });

    bindOutlineEvents(idx);
    bindSidebarSplitters(idx);
    // 4T-000289: Drag-and-Drop der Panel-Header und Container-Drop-Zonen.
    bindSidebarPanelDnd(idx);

    initInnerSplitter(idx);

    const tabbar = root.querySelector('.tabbar');
    tabbar.addEventListener('dragover', (e) => {
      if (Array.from(e.dataTransfer.types).includes(MIME_TAB)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tabbar.classList.add('drag-target');
      }
    });
    tabbar.addEventListener('dragleave', () => {
      tabbar.classList.remove('drag-target');
    });
    tabbar.addEventListener('drop', (e) => {
      if (!Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
      e.preventDefault();
      tabbar.classList.remove('drag-target');
      const data = parseTabDrag(e);
      if (!data) return;
      // 4T-000460 (Epic 3E-000085): Kopf-Ziehen auf die freie Tabbar-Flaeche —
      // die ganze Gruppe ans Leisten-Ende (nur eigene Leiste).
      if (data.kind === 'group') {
        if (data.fromPane === idx) {
          moveGroupInPane(idx, data.groupId, state.panes[idx].tabs.length);
        }
        return;
      }
      // 4T-000765 (Epic 3E-000158): Mehrfach-Auswahl auf die freie Flaeche — die
      // ganze Menge ans Leisten-Ende (nur eigene Leiste).
      const menge = Array.isArray(data.tabIndices) ? data.tabIndices : [];
      if (menge.length > 1 && data.fromPane === idx) {
        reorderTabsWithinPane(idx, menge, state.panes[idx].tabs.length);
        return;
      }
      moveTabBetweenPanes(data.fromPane, data.tabIndex, idx, state.panes[idx].tabs.length);
    });
  });
}

/**
 * Liefert den Spalten-Index zu einer Fenster-X-Koordinate.
 *
 * @param {number} clientX X-Koordinate des Zeigers.
 * @returns {number} Index der getroffenen Spalte.
 */
export function paneIndexAtPoint(clientX) {
  if (state.panes.length === 1) return 0;
  const rect1 = paneRoots[1].getBoundingClientRect();
  return clientX >= rect1.left ? 1 : 0;
}

// --- Splitter ---------------------------------------------------------------
function initInnerSplitter(paneIdx) {
  const els = getPaneEls(paneIdx);
  let dragging = false;
  els.innerSplitter.addEventListener('mousedown', (e) => {
    const pane = state.panes[paneIdx];
    if (!pane || pane.activeIndex < 0) return;
    const tab = pane.tabs[pane.activeIndex];
    if (!tab || tab.viewMode !== 'split') return;
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = els.content.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    els.sourceEl.style.flex = `${clamped} 1 0`;
    els.renderedEl.style.flex = `${1 - clamped} 1 0`;
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}

/**
 * Verdrahtet den Splitter zwischen den beiden Spalten.
 */
export function initOuterSplitter() {
  let dragging = false;
  outerSplitter.addEventListener('mousedown', (e) => {
    if (state.panes.length !== 2) return;
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = panesContainer.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    paneRoots[0].style.flex = `${clamped} 1 0`;
    paneRoots[1].style.flex = `${1 - clamped} 1 0`;
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}
