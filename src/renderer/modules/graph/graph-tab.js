// 4T-0455 (Epic 3E-0084): Bereichs-Graph als read-only System-Seite —
// der Link-Graph des gesamten Bereichs in einem eigenen Tab (Muster
// Historien-Seite: eine Instanz pro Fenster, erneutes Öffnen aktiviert den
// bestehenden Tab). Steuerleiste mit Richtungs-Filter, Knoten-Zähler und
// Neu-Layout-Knopf; die Graph-Komponente kommt aus graph-view.js (4T-0454),
// Modell und Erreichbarkeits-Filter aus dem Graph-Kern (4T-0453).
//
// Richtungs-Filter des Bereichs-Graphen: „eingehend"/„ausgehend" wirken
// relativ zur Referenz-Datei — der beim Öffnen bzw. Aktualisieren aktiven
// Markdown-Datei des Fensters. Der Graph zeigt dann nur die von dort über
// Links der gewählten Richtung erreichbaren Knoten (volle Tiefe, im
// Unterschied zur Tiefen-Begrenzung des Datei-Panels). Ohne eine solche
// globale Bezugs-Datei ist ein Richtungs-Filter mathematisch wirkungslos
// (jede Kante ist zugleich aus- und eingehend); ohne Referenz zeigt der
// Graph deshalb alle Kanten plus lokalisierten Hinweis. Design-Entscheidung
// dieser Umsetzung, dokumentiert im Task-Lösungs-Kapitel; Prüf-Punkt der
// PO-Test-Iteration.
//
// Modul-Zyklen zu tabs/views sind Laufzeit-Zugriffe; Registrierung explizit
// über initGraphTab aus app-init (kein Modul-Seiteneffekt, Muster
// history-page.js).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { buildGraphModel, neighborhood } from '../../../shared/graph-core.js';
import { createGraphView } from './graph-view.js';
import { openOrJumpToPath } from '../bookmarks/bookmarks.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from '../app/system-pages.js';
import { showStatusbarHint } from '../views/views.js';

export const GRAPH_PAGE_ID = 'graph';

// Seiten-Zustand: Graph-Instanz, Richtungs-Filter und die Referenz-Datei
// des Richtungs-Filters (beim Öffnen bzw. Refresh aktive Markdown-Datei).
const pageState = {
  container: null,
  view: null,
  direction: 'both',
  referencePath: null,
  countEl: null,
  hintEl: null,
  statusEl: null,
  canvasEl: null,
};

// Aktive Markdown-Datei des Fensters (Pfad-Tabs zählen, System-/Handbuch-
// Tabs nicht): zuerst die aktive Spalte, dann die andere.
function activeFilePath() {
  const order = [state.activePaneIndex, state.activePaneIndex === 0 ? 1 : 0];
  for (const paneIdx of order) {
    const pane = state.panes[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    if (tab && tab.path && !tab.manualPage && !tab.systemPage) return tab.path;
  }
  return null;
}

// Öffnet den Bereichs-Graph (Menü, Kontextmenü des Bereichs-Panels).
// Ohne Bereich lokalisierter Hinweis statt Seite (der Menü-Eintrag ist
// zusätzlich deaktiviert; der Guard deckt Kontextmenü- und Kürzel-Pfad ab).
export function openAreaGraphTab() {
  if (!state.areaPath) {
    showStatusbarHint('graph.noArea', { duration: 3000, error: true });
    return;
  }
  pageState.referencePath = activeFilePath();
  openSystemPage(GRAPH_PAGE_ID);
  void loadAndRender();
}

// --- Daten laden und rendern -----------------------------------------------------

let reloadTimer = null;

async function loadAndRender() {
  const container = pageState.container;
  if (!container || !container.isConnected || !pageState.view) return;
  let result;
  try {
    result = await api.getGraphEdges(null);
  } catch {
    result = null;
  }
  if (!pageState.container || !pageState.container.isConnected) return;
  const status = result && result.status;
  if (status !== 'ready') {
    const key = status === 'indexing' ? 'graph.indexing' : 'graph.loadError';
    setStatusText(t(key));
    return;
  }
  setStatusText(null);

  let model = buildGraphModel(result.nodes, result.edges);
  const reference = pageState.referencePath;
  const hasReference = !!reference && model.nodes.some((n) => n.id === reference);
  let missingReference = false;
  if (pageState.direction !== 'both') {
    if (hasReference) {
      model = neighborhood(model, reference, {
        depth: Infinity,
        direction: pageState.direction,
      });
    } else {
      missingReference = true;
    }
  }
  pageState.view.setData(model, { activeId: hasReference ? reference : null });
  if (pageState.hintEl) pageState.hintEl.hidden = !missingReference;
  updateCount();
}

function setStatusText(text) {
  if (!pageState.statusEl || !pageState.canvasEl) return;
  pageState.statusEl.hidden = !text;
  pageState.statusEl.textContent = text || '';
  pageState.canvasEl.classList.toggle('graph-canvas-hidden', !!text);
}

function updateCount() {
  if (!pageState.countEl || !pageState.view) return;
  const { nodeCount } = pageState.view.getStats();
  pageState.countEl.textContent = t('graph.nodeCount').replace('{count}', String(nodeCount));
}

// --- Seiten-DOM -------------------------------------------------------------------

function buildPage(container) {
  container.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'graph-page';

  const toolbar = document.createElement('div');
  toolbar.className = 'graph-toolbar';

  const label = document.createElement('label');
  label.className = 'graph-direction-label';
  label.textContent = t('graph.directionLabel');
  const select = document.createElement('select');
  select.className = 'graph-direction';
  for (const [value, key] of [
    ['both', 'graph.direction.both'],
    ['in', 'graph.direction.in'],
    ['out', 'graph.direction.out'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = pageState.direction;
  select.addEventListener('change', () => {
    pageState.direction = select.value;
    // Referenz beim Umschalten frisch bestimmen — die zuletzt aktive
    // Markdown-Datei kann seit dem Öffnen gewechselt haben.
    pageState.referencePath = activeFilePath() || pageState.referencePath;
    void loadAndRender();
  });
  label.appendChild(select);
  toolbar.appendChild(label);

  const count = document.createElement('span');
  count.className = 'graph-node-count';
  toolbar.appendChild(count);

  const hint = document.createElement('span');
  hint.className = 'graph-reference-hint';
  hint.hidden = true;
  hint.textContent = t('graph.noReference');
  toolbar.appendChild(hint);

  const relayout = document.createElement('button');
  relayout.type = 'button';
  relayout.className = 'graph-relayout';
  relayout.textContent = t('graph.relayout');
  relayout.addEventListener('click', () => {
    if (!pageState.view) return;
    pageState.view.relayout();
    updateCount();
  });
  toolbar.appendChild(relayout);

  page.appendChild(toolbar);

  const canvas = document.createElement('div');
  canvas.className = 'graph-canvas';
  page.appendChild(canvas);

  const statusEl = document.createElement('div');
  statusEl.className = 'graph-status';
  statusEl.hidden = true;
  page.appendChild(statusEl);

  container.appendChild(page);

  pageState.countEl = count;
  pageState.hintEl = hint;
  pageState.statusEl = statusEl;
  pageState.canvasEl = canvas;
  pageState.view = createGraphView(canvas, {
    t,
    onOpenFile: (id) => void openOrJumpToPath(id),
  });
}

// --- Registrierung -----------------------------------------------------------------

export function initGraphTab() {
  registerSystemPage({
    id: GRAPH_PAGE_ID,
    titleKey: 'graph.pageTitle',
    // Dynamischer Tab-Titel „Graph: <Bereichs-Name>" (Task-Vorgabe); der
    // titleKey bleibt Fallback ohne Bereichs-Namen.
    title() {
      return state.areaName ? `${t('graph.pageTitle')}: ${state.areaName}` : t('graph.pageTitle');
    },
    onOpen() {
      // Frischer Seiten-Zustand pro Neu-Öffnen (Muster Einstellungs-Seite):
      // Richtung zurück auf den Default; Positionen entstehen ohnehin neu.
      pageState.direction = 'both';
    },
    mount(container) {
      // Re-Mount (Erst-Anzeige, Sprachwechsel, Pane-Wechsel) baut die Seite
      // samt Graph-Instanz neu; Knoten-Positionen entstehen dann frisch —
      // bewusste Vereinfachung, innerhalb einer Anzeige hält der
      // Mount-Guard von system-pages das DOM samt Positionen stabil.
      if (pageState.view) pageState.view.destroy();
      pageState.container = container;
      buildPage(container);
      void loadAndRender();
    },
    onClose() {
      if (pageState.view) pageState.view.destroy();
      pageState.view = null;
      pageState.container = null;
    },
  });

  // Index-Invalidierung (Watcher, Initial-Aufbau fertig) lädt debounced
  // nach; das inkrementelle Layout erhält bestehende Positionen (4T-0453).
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => {
      if (!pageState.container || !findSystemTabAcrossPanes(GRAPH_PAGE_ID)) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void loadAndRender();
      }, 250);
    });
  }
}
