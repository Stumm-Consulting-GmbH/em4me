// 4T-0456 (Epic 3E-0084): Datei-Graph-Panel — das Link-Umfeld der aktiven
// Datei als Sidebar-Sektion (Panel-Registry, links/rechts andockbar).
// Steuerung im Panel-Kopf: Tiefe 1 bis 5 und Richtung (eingehend/ausgehend/
// beide) — Sitzungs-Zustand ohne Persistenz (Task-Entscheidung). Das Panel
// folgt der aktiven Datei (debounct über die Tab-Wechsel-Hooks in tabs.js);
// die aktive Datei ist hervorgehoben, Klick öffnet die Nachbar-Datei über
// die bestehende Öffnen-Mechanik. Dateien ohne Links zeigen den Einzel-
// Knoten mit Hinweis; außerhalb eines Bereichs arbeitet das Panel über den
// Best-Effort-Suchraum der Ordner-Wurzel mit dezentem Hinweis
// (Epic-Architekturentscheidung 4).
//
// Gehört zur Erweiterung 'graph-view' (4T-0456): deaktiviert ist die
// Sektion ausgeblendet (Muster der wiki-links-Panels); die Sichtbarkeits-
// Preference bleibt persistiert und greift beim Wiedereinschalten.
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import { getPaneEls, state } from './app-state.js';
import { applySidebarVisibility } from './panels.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { isAllEmpty, persistSetting } from './views.js';
import { openOrJumpToPath } from './bookmarks.js';
// 4T-0568 (Epic 3E-0104): Haekchen im Panel-Untermenue folgt dem Toggle
// (Laufzeit-Zyklus tabs <-> file-graph-panel, Muster panels.js).
import { reportMenuStateNow } from './tabs.js';
import {
  GRAPH_MIN_DEPTH,
  GRAPH_MAX_DEPTH,
  buildGraphModel,
  neighborhood,
} from '../../shared/graph-core.js';
import { createGraphView } from './graph-view.js';

// Graph-Instanz pro Spalte (lazy beim ersten Render; hält die Knoten-
// Positionen für die Sitzungs-Dauer).
const views = [null, null];

function activeFilePathForPane(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (tab && tab.path && !tab.manualPage && !tab.systemPage) return tab.path;
  return null;
}

function ensureView(paneIdx) {
  if (views[paneIdx]) return views[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!els || !els.fileGraphCanvas) return null;
  views[paneIdx] = createGraphView(els.fileGraphCanvas, {
    t,
    onOpenFile: (id) => void openOrJumpToPath(id),
  });
  return views[paneIdx];
}

// Steuerungs-Selects (neu) befüllen — Labels lokalisiert, deshalb pro
// Render neu aufgebaut (Sprachwechsel zieht so automatisch nach).
function rebuildControls(paneIdx, els) {
  const depthSelect = els.fileGraphDepth;
  depthSelect.innerHTML = '';
  for (let d = GRAPH_MIN_DEPTH; d <= GRAPH_MAX_DEPTH; d++) {
    const option = document.createElement('option');
    option.value = String(d);
    option.textContent = String(d);
    depthSelect.appendChild(option);
  }
  depthSelect.value = String(state.fileGraph.depthByPane[paneIdx]);
  const directionSelect = els.fileGraphDirection;
  directionSelect.innerHTML = '';
  for (const [value, key] of [
    ['both', 'graph.direction.both'],
    ['in', 'graph.direction.in'],
    ['out', 'graph.direction.out'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    directionSelect.appendChild(option);
  }
  directionSelect.value = state.fileGraph.directionByPane[paneIdx];
}

export async function renderFileGraphPanel(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.fileGraphSection || els.fileGraphSection.hidden) return;
  const token = ++state.fileGraph.loadTokens[paneIdx];
  const filePath = activeFilePathForPane(paneIdx);
  els.fileGraphEmpty.hidden = !!filePath;
  els.fileGraphMain.hidden = !filePath;
  if (!filePath) return;

  rebuildControls(paneIdx, els);
  let result;
  try {
    result = await api.getGraphEdges(filePath);
  } catch {
    result = null;
  }
  if (token !== state.fileGraph.loadTokens[paneIdx]) return;
  const status = result && result.status;
  const statusEl = els.fileGraphStatus;
  if (status !== 'ready') {
    statusEl.hidden = false;
    statusEl.textContent = t(status === 'indexing' ? 'graph.indexing' : 'graph.loadError');
    els.fileGraphCanvas.hidden = true;
    els.fileGraphNote.hidden = true;
    els.fileGraphScopeHint.hidden = true;
    return;
  }
  statusEl.hidden = true;
  els.fileGraphCanvas.hidden = false;

  const model = buildGraphModel(result.nodes, result.edges);
  const sub = neighborhood(model, filePath, {
    depth: state.fileGraph.depthByPane[paneIdx],
    direction: state.fileGraph.directionByPane[paneIdx],
  });
  const view = ensureView(paneIdx);
  if (!view) return;
  view.setData(sub, { activeId: filePath });
  // Datei ohne Link-Beziehungen: Einzel-Knoten plus Hinweis.
  els.fileGraphNote.hidden = sub.nodes.length !== 1;
  // Best-Effort-Suchraum außerhalb eines Bereichs: dezenter Hinweis.
  els.fileGraphScopeHint.hidden = !!(result.meta && result.meta.isArea);
}

// Debounctes Folgen der aktiven Datei (Tab-/Datei-Wechsel, Hooks in tabs.js).
export function scheduleFileGraphRender(paneIdx) {
  const timers = state.fileGraph.renderTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    if (state.fileGraph.visibleByPane[paneIdx]) void renderFileGraphPanel(paneIdx);
  }, 150);
}

// --- Sichtbarkeit, Toggle, Persistenz (Muster Kalender-Panel) ---------------------

export function applyFileGraphVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.fileGraphSection) return;
  const visible =
    !isAllEmpty() && isExtensionActive('graph-view') && !!state.fileGraph.visibleByPane[paneIdx];
  els.fileGraphSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) void renderFileGraphPanel(paneIdx);
  updateFileGraphToggleButton();
}

// 4T-0567 (Epic 3E-0104): Active-State des neuen Statusbar-Buttons
// (Muster updateOutgoingToggleButton in panels.js).
export function updateFileGraphToggleButton() {
  const btn = document.getElementById('btn-filegraph');
  if (!btn) return;
  const visible = !!state.fileGraph.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleFileGraphPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.fileGraph.visibleByPane[paneIdx];
  state.fileGraph.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('filegraph');
  applyFileGraphVisibility(paneIdx);
  await persistFileGraphSettings();
  // 4T-0568 (Epic 3E-0104): Menue-Haekchen nachziehen (Muster panels.js).
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistFileGraphSettings() {
  await persistSetting('fileGraph.visibleColumn0', !!state.fileGraph.visibleByPane[0]);
  await persistSetting('fileGraph.visibleColumn1', !!state.fileGraph.visibleByPane[1]);
}

export async function loadFileGraphSettings() {
  const v0 = await api.getSetting('fileGraph.visibleColumn0');
  const v1 = await api.getSetting('fileGraph.visibleColumn1');
  state.fileGraph.visibleByPane[0] = !!v0;
  state.fileGraph.visibleByPane[1] = !!v1;
}

// Sichtbare Panels beider Spalten neu aufbauen (Index-Invalidierung).
export function refreshFileGraphPanels() {
  for (let i = 0; i < state.panes.length; i++) {
    if (state.fileGraph.visibleByPane[i]) scheduleFileGraphRender(i);
  }
}

// --- Init: statisches Wiring pro Spalte -------------------------------------------

let reloadTimer = null;

export function initFileGraphPanel() {
  for (let p = 0; p < 2; p++) {
    const els = getPaneEls(p);
    if (!els || !els.fileGraphSection) continue;
    els.fileGraphDepth.addEventListener('change', () => {
      const value = parseInt(els.fileGraphDepth.value, 10);
      state.fileGraph.depthByPane[p] = Number.isInteger(value) ? value : GRAPH_MIN_DEPTH;
      void renderFileGraphPanel(p);
    });
    els.fileGraphDirection.addEventListener('change', () => {
      state.fileGraph.directionByPane[p] = els.fileGraphDirection.value || 'both';
      void renderFileGraphPanel(p);
    });
  }
  // Index-Invalidierung (Watcher, Initial-Aufbau) zieht sichtbare Panels
  // debounced nach; das inkrementelle Layout erhält die Positionen.
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        refreshFileGraphPanels();
      }, 250);
    });
  }
}

// --- Registrierung ------------------------------------------------------------

registerSidebarPanel({
  id: 'filegraph',
  titleKey: 'graph.panelTitle',
  // 4T-0567 (Epic 3E-0104): Statusbar-Button (Zugangs-Symmetrie).
  buttonId: 'btn-filegraph',
  sectionClass: 'sidebar-filegraph',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('graph-view') &&
    !!(state.fileGraph && state.fileGraph.visibleByPane[paneIdx]),
  applyVisibility: applyFileGraphVisibility,
  toggle: toggleFileGraphPanel,
});
