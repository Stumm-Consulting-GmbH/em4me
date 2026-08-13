// === 4T-0289: Drag-and-Drop der Panels ======================================
// 4T-0990 (Epic 3E-0196): aus panels.js in den Ordner panels/ ausgezogen.
// HTML5-DnD nach dem Bookmarks-Muster (4T-0079), eigener MIME-Typ, damit
// Bookmark-Drags, Tab-Drags und Datei-Drops unberuehrt bleiben. Quellen:
// Sektions-Header (Einzel-Panels) und Gruppen-Reiter. Ziel-Zonen:
//   - Sektion oberes/unteres Drittel: davor/dahinter (eigener Slot),
//   - Sektion mittleres Drittel oder Reiterleiste: Gruppe bilden/erweitern,
//   - Container-Freiflaeche (auch leere Gegenseite): ans Ende der Seite.
// Waehrend des Drags zeigt body.panel-dragging leere (versteckte)
// Container als schmale Drop-Streifen. Aenderungen wirken auf das globale
// Layout; alle Panes und Fenster ziehen ueber Event bzw. Broadcast nach.
//
// Der Zieh-Zustand bleibt Modul-Variable dieses Moduls und wird nie als
// Export nach aussen gereicht (Entwicklungsrichtlinien: kein beschreibbares
// Export-Binding ueber Modul-Grenzen).
'use strict';

import { getPaneEls } from '../app/app-state.js';
import {
  SIDEBAR_SIDES,
  applySidebarLayout,
  getSidebarLayout,
  groupPanelWith,
  movePanelRelativeTo,
  movePanelToNewSlot,
  sidebarPanels,
} from '../sidebar-layout.js';

import { sectionElFor } from './panel-sections.js';

export const PANEL_DND_MIME = 'application/x-sidebar-panel';
// { panelId, targetPanelId, targetSide, zone } | null
let panelDrag = null;

const PANEL_DROP_CLASSES = [
  'is-panel-drop-before',
  'is-panel-drop-after',
  'is-panel-drop-into',
  'is-panel-drop-append',
];

function clearPanelDropIndicators() {
  document
    .querySelectorAll('.' + PANEL_DROP_CLASSES.join(', .'))
    .forEach((el) => el.classList.remove(...PANEL_DROP_CLASSES));
}

export function handlePanelDragStart(ev, panelId) {
  if (ev.dataTransfer) {
    ev.dataTransfer.setData(PANEL_DND_MIME, panelId);
    ev.dataTransfer.effectAllowed = 'move';
  }
  panelDrag = { panelId, targetPanelId: null, targetSide: null, zone: null };
  document.body.classList.add('panel-dragging');
  ev.stopPropagation();
}

// 4T-0289: bricht einen laufenden Panel-Drag ab bzw. raeumt nach dessen
// Ende auf (dragend, Esc-Kaskade in app-init).
export function cancelPanelDrag() {
  panelDrag = null;
  document.body.classList.remove('panel-dragging');
  clearPanelDropIndicators();
}

function setPanelDropTarget(el, zone, targetPanelId, targetSide) {
  if (
    panelDrag.targetPanelId === (targetPanelId || null) &&
    panelDrag.targetSide === (targetSide || null) &&
    panelDrag.zone === zone
  ) {
    return;
  }
  clearPanelDropIndicators();
  el.classList.add('is-panel-drop-' + zone);
  panelDrag.targetPanelId = targetPanelId || null;
  panelDrag.targetSide = targetSide || null;
  panelDrag.zone = zone;
}

function handlePanelDragOverSection(ev, targetPanelId, sectionEl) {
  if (!panelDrag) return;
  if (panelDrag.panelId === targetPanelId) {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  const rect = sectionEl.getBoundingClientRect();
  const offset = ev.clientY - rect.top;
  const third = rect.height / 3;
  const zone = offset < third ? 'before' : offset > rect.height - third ? 'after' : 'into';
  setPanelDropTarget(sectionEl, zone, targetPanelId, null);
}

export function handlePanelDragOverTabbar(ev, anchorPanelId, barEl) {
  if (!panelDrag) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  setPanelDropTarget(barEl, 'into', anchorPanelId, null);
}

function handlePanelDragOverContainer(ev, side, container) {
  if (!panelDrag) return;
  // Nur die Freiflaeche des Containers (Sektionen stoppen die Propagation
  // ihrer eigenen dragover-Events).
  if (ev.target !== container) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  setPanelDropTarget(container, 'append', null, side);
}

export async function handlePanelDrop(ev) {
  if (!panelDrag || !panelDrag.panelId) return;
  ev.preventDefault();
  ev.stopPropagation();
  const { panelId, targetPanelId, targetSide, zone } = panelDrag;
  cancelPanelDrag();
  const layout = getSidebarLayout();
  let next = layout;
  if (zone === 'append' && targetSide) {
    next = movePanelToNewSlot(layout, panelId, targetSide, Number.MAX_SAFE_INTEGER);
  } else if (zone === 'into' && targetPanelId) {
    next = groupPanelWith(layout, panelId, targetPanelId);
  } else if ((zone === 'before' || zone === 'after') && targetPanelId) {
    next = movePanelRelativeTo(layout, panelId, targetPanelId, zone);
  }
  if (next !== layout) await applySidebarLayout(next);
}

// Bindet die DnD-Handler einer Pane. Sektionen und Container sind statisches
// DOM (einmalige Bindung aus bindPaneEvents); die dynamischen Reiterleisten
// binden ihre Handler beim Aufbau in buildSlotTabbar.
export function bindSidebarPanelDnd(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.sidebarLeft || !els.sidebarRight) return;
  for (const def of sidebarPanels()) {
    const sectionEl = sectionElFor(els, def.id, def);
    if (!sectionEl) continue;
    const header = sectionEl.querySelector('.sidebar-section-header');
    if (header) {
      header.draggable = true;
      header.addEventListener('dragstart', (ev) => handlePanelDragStart(ev, def.id));
      header.addEventListener('dragend', cancelPanelDrag);
    }
    sectionEl.addEventListener('dragover', (ev) =>
      handlePanelDragOverSection(ev, def.id, sectionEl),
    );
    sectionEl.addEventListener('drop', handlePanelDrop);
  }
  for (const side of SIDEBAR_SIDES) {
    const container = side === 'left' ? els.sidebarLeft : els.sidebarRight;
    container.addEventListener('dragover', (ev) =>
      handlePanelDragOverContainer(ev, side, container),
    );
    container.addEventListener('drop', handlePanelDrop);
    container.addEventListener('dragleave', (ev) => {
      if (!container.contains(ev.relatedTarget)) clearPanelDropIndicators();
    });
  }
}
