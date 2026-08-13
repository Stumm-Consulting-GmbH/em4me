// 4T-0454 (Epic 3E-0084): Graph-Renderer der Graphenansicht — zeichnet ein
// Graph-Modell des Kerns (graph-core.js) als SVG und trägt die gesamte
// Interaktion: Zoom um den Zeiger, Pan der Fläche, Knoten-Ziehen (Position
// bleibt für die Sitzungs-Dauer), Hover-Hervorhebung der Nachbarschaft und
// Klick-Öffnen. Bereichs-Graph-Tab (4T-0455) und Datei-Graph-Panel (4T-0456)
// betten dieselbe Komponente ein.
//
// Bewusst abhängigkeitsfrei von api/i18n/app-state: der Aufrufer injiziert
// t und den Öffnen-Callback (Muster buildQueryListDom, 4T-0355) — die
// Komponente bleibt zyklenfrei und in jsdom ohne window.api-Stub testbar.
// Farben kommen ausschließlich aus Theme-Variablen (styles.css, Klassen
// graph-*); die Komponente setzt keine Farbwerte.
'use strict';

import { layoutGraph, limitToMostConnected } from '../../../shared/graph-core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Ober-Grenze der gerenderten Knoten (Epic-Risiko Performance): Layout mit
// Gitter-Abstoßung und SVG tragen Graphen dieser Größe noch flüssig; darüber
// rendert die Ansicht die am stärksten vernetzten Knoten plus Hinweis.
// Messung 4T-0454: 1500 Knoten layouten in <1 s, SVG bleibt bedienbar;
// deutlich darüber dominieren DOM-Kosten pro Interaktion.
export const GRAPH_MAX_RENDER_NODES = 1500;

const NODE_RADIUS = 7;
const ACTIVE_RADIUS = 9;
const LABEL_MAX_CHARS = 28;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 5;
// Unterhalb dieser Maus-Bewegung (px) gilt ein Drag als Klick.
const CLICK_MOVE_THRESHOLD = 3;

// Instanz-Zähler für eindeutige SVG-Marker-IDs (mehrere Graph-Ansichten
// pro Fenster: Tab plus Panel je Spalte).
let instanceCounter = 0;

// Erzeugt eine Graph-Ansicht im Container.
//   options.t           i18n-Funktion (injiziert).
//   options.onOpenFile  (id) => void — Klick auf einen Knoten.
//   options.maxNodes    Ober-Grenze (Default GRAPH_MAX_RENDER_NODES).
// Rückgabe-Controller:
//   setData(model, { activeId })  Modell übernehmen und rendern; bekannte
//                                 Knoten behalten ihre Position (inkrementelles
//                                 Layout, gezogene Positionen eingeschlossen).
//   relayout()                    Positionen verwerfen, frisch layouten.
//   getStats()                    { nodeCount, hiddenCount } des Renders.
//   destroy()                     Listener lösen, DOM leeren.
export function createGraphView(container, options = {}) {
  const t = typeof options.t === 'function' ? options.t : (key) => key;
  const onOpenFile = typeof options.onOpenFile === 'function' ? options.onOpenFile : () => {};
  const maxNodes = Number.isFinite(options.maxNodes) ? options.maxNodes : GRAPH_MAX_RENDER_NODES;
  const instanceId = ++instanceCounter;

  // Sitzungs-Zustand der Ansicht.
  const positions = new Map(); // id -> {x, y} (inklusive gezogener Knoten)
  let model = { nodes: [], edges: [] };
  let activeId = null;
  let hiddenCount = 0;
  let side = 1000; // Kantenlänge der Layout-Fläche (viewBox)
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let hadLayout = false;

  // DOM-Grundgerüst: Wrapper mit SVG und Hinweis-Zeile (Ober-Grenze).
  const root = document.createElement('div');
  root.className = 'graph-view';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'graph-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const defs = document.createElementNS(SVG_NS, 'defs');
  for (const kind of ['end', 'start']) {
    // Pfeilspitzen-Marker: 'end' zeigt in Kanten-Richtung, 'start' entgegen
    // (Doppel-Pfeil). refX sitzt an der Spitze; die Kante endet am Knoten-
    // Rand (Geometrie in edgeGeometry), der Marker überlappt so nicht.
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', `graph-arrow-${kind}-${instanceId}`);
    marker.setAttribute('class', 'graph-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', kind === 'end' ? '9' : '1');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto');
    const tip = document.createElementNS(SVG_NS, 'path');
    tip.setAttribute('d', kind === 'end' ? 'M 0 0 L 10 5 L 0 10 z' : 'M 10 0 L 0 5 L 10 10 z');
    marker.appendChild(tip);
    defs.appendChild(marker);
  }
  svg.appendChild(defs);
  const viewport = document.createElementNS(SVG_NS, 'g');
  viewport.setAttribute('class', 'graph-viewport');
  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  edgeLayer.setAttribute('class', 'graph-edges');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  nodeLayer.setAttribute('class', 'graph-nodes');
  viewport.appendChild(edgeLayer);
  viewport.appendChild(nodeLayer);
  svg.appendChild(viewport);
  const hint = document.createElement('div');
  hint.className = 'graph-hint';
  hint.hidden = true;
  root.appendChild(svg);
  root.appendChild(hint);
  container.appendChild(root);

  // Element-Register des aktuellen Renders.
  const nodeEls = new Map(); // id -> <g>
  const edgeEls = []; // { el, edge }
  let neighborSets = new Map(); // id -> Set benachbarter IDs

  function applyViewportTransform() {
    viewport.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
  }

  // Client-Pixel -> viewBox-Einheiten. jsdom liefert eine 0-Breite —
  // Faktor 1 als Fallback hält die Interaktion dort definiert.
  function clientToViewBoxFactor() {
    const rect = svg.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return 1;
    // 'meet' skaliert nach der restriktiveren Achse.
    return side / Math.min(rect.width, rect.height);
  }

  // Kanten-Geometrie: Linie zwischen den Knoten-Rändern (Platz für die
  // Pfeilspitzen), Länge 0 bei deckungsgleichen Punkten abgefedert.
  function edgeGeometry(edge) {
    const p = positions.get(edge.from);
    const q = positions.get(edge.to);
    if (!p || !q) return null;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dist = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / dist;
    const uy = dy / dist;
    const fromR = nodeRadius(edge.from) + 2;
    const toR = nodeRadius(edge.to) + 2;
    return {
      x1: p.x + ux * fromR,
      y1: p.y + uy * fromR,
      x2: q.x - ux * toR,
      y2: q.y - uy * toR,
    };
  }

  function nodeRadius(id) {
    return id === activeId ? ACTIVE_RADIUS : NODE_RADIUS;
  }

  function updateEdgeElement(entry) {
    const geo = edgeGeometry(entry.edge);
    if (!geo) return;
    entry.el.setAttribute('x1', String(geo.x1));
    entry.el.setAttribute('y1', String(geo.y1));
    entry.el.setAttribute('x2', String(geo.x2));
    entry.el.setAttribute('y2', String(geo.y2));
  }

  function updateNodeElement(id) {
    const el = nodeEls.get(id);
    const p = positions.get(id);
    if (el && p) el.setAttribute('transform', `translate(${p.x} ${p.y})`);
  }

  // --- Hover-Hervorhebung -----------------------------------------------------
  function clearHighlight() {
    root.classList.remove('graph-hovering');
    for (const el of nodeEls.values()) el.classList.remove('graph-focus', 'graph-neighbor');
    for (const { el } of edgeEls) el.classList.remove('graph-edge-active');
  }

  function highlightNeighborhood(id) {
    root.classList.add('graph-hovering');
    const neighbors = neighborSets.get(id) || new Set();
    for (const [nodeId, el] of nodeEls) {
      el.classList.toggle('graph-focus', nodeId === id);
      el.classList.toggle('graph-neighbor', neighbors.has(nodeId));
    }
    for (const { el, edge } of edgeEls) {
      el.classList.toggle('graph-edge-active', edge.from === id || edge.to === id);
    }
  }

  // --- Interaktion ---------------------------------------------------------------
  // Ein aktiver Drag (Knoten oder Pan) läuft über Dokument-Listener, damit
  // die Bewegung auch außerhalb des SVG weiterzieht.
  let drag = null; // { type: 'node'|'pan', id?, lastX, lastY, moved }

  function onMouseMove(ev) {
    if (!drag) return;
    const dxClient = ev.clientX - drag.lastX;
    const dyClient = ev.clientY - drag.lastY;
    drag.lastX = ev.clientX;
    drag.lastY = ev.clientY;
    drag.moved += Math.abs(dxClient) + Math.abs(dyClient);
    const factor = clientToViewBoxFactor();
    if (drag.type === 'pan') {
      tx += dxClient * factor;
      ty += dyClient * factor;
      applyViewportTransform();
      return;
    }
    const p = positions.get(drag.id);
    if (!p) return;
    // Knoten-Koordinaten liegen unter der viewport-Skalierung.
    p.x += (dxClient * factor) / scale;
    p.y += (dyClient * factor) / scale;
    updateNodeElement(drag.id);
    for (const entry of edgeEls) {
      if (entry.edge.from === drag.id || entry.edge.to === drag.id) updateEdgeElement(entry);
    }
  }

  function onMouseUp() {
    if (!drag) return;
    const finished = drag;
    drag = null;
    root.classList.remove('graph-dragging');
    if (finished.type === 'node' && finished.moved <= CLICK_MOVE_THRESHOLD) {
      onOpenFile(finished.id);
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  svg.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    drag = { type: 'pan', lastX: ev.clientX, lastY: ev.clientY, moved: 0 };
    root.classList.add('graph-dragging');
  });

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = clientToViewBoxFactor();
    const rect = svg.getBoundingClientRect();
    // Zeiger-Position in viewBox-Einheiten ('meet' zentriert die kürzere
    // Achse; der Versatz kürzt sich in der Fixpunkt-Rechnung heraus, solange
    // beide Achsen gleich skaliert sind — deshalb genügt die Ecke).
    const px = (ev.clientX - (rect ? rect.left : 0)) * factor;
    const py = (ev.clientY - (rect ? rect.top : 0)) * factor;
    const nextScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale * Math.exp(-ev.deltaY * 0.0015)));
    if (nextScale === scale) return;
    // Fixpunkt-Zoom: der Graph-Punkt unter dem Zeiger bleibt unter dem Zeiger.
    tx = px - ((px - tx) / scale) * nextScale;
    ty = py - ((py - ty) / scale) * nextScale;
    scale = nextScale;
    applyViewportTransform();
  });

  // --- Rendering -------------------------------------------------------------------
  function render() {
    clearHighlight();
    nodeEls.clear();
    edgeEls.length = 0;
    edgeLayer.innerHTML = '';
    nodeLayer.innerHTML = '';

    // Nachbarschafts-Sets für die Hover-Hervorhebung (richtungs-agnostisch:
    // hervorgehoben wird die Verbindung, nicht die Richtung).
    neighborSets = new Map();
    const addNeighbor = (a, b) => {
      let set = neighborSets.get(a);
      if (!set) {
        set = new Set();
        neighborSets.set(a, set);
      }
      set.add(b);
    };
    for (const e of model.edges) {
      addNeighbor(e.from, e.to);
      addNeighbor(e.to, e.from);
    }

    // Namens-Duplikate: Tooltip zeigt den Pfad zur Unterscheidung.
    const nameCounts = new Map();
    for (const n of model.nodes) {
      nameCounts.set(n.name, (nameCounts.get(n.name) || 0) + 1);
    }

    for (const entry of model.edges) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', entry.twoWay ? 'graph-edge graph-edge-two-way' : 'graph-edge');
      line.setAttribute('marker-end', `url(#graph-arrow-end-${instanceId})`);
      if (entry.twoWay) {
        line.setAttribute('marker-start', `url(#graph-arrow-start-${instanceId})`);
      }
      const item = { el: line, edge: entry };
      updateEdgeElement(item);
      edgeEls.push(item);
      edgeLayer.appendChild(line);
    }

    for (const node of model.nodes) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', node.id === activeId ? 'graph-node graph-node-active' : 'graph-node');
      g.setAttribute('data-graph-id', node.id);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', String(nodeRadius(node.id)));
      g.appendChild(circle);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'graph-label');
      label.setAttribute('y', String(nodeRadius(node.id) + 13));
      label.textContent =
        node.name.length > LABEL_MAX_CHARS
          ? `${node.name.slice(0, LABEL_MAX_CHARS - 1)}…`
          : node.name;
      g.appendChild(label);
      if ((nameCounts.get(node.name) || 0) > 1 || node.name.length > LABEL_MAX_CHARS) {
        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent = (nameCounts.get(node.name) || 0) > 1 ? node.id : node.name;
        g.appendChild(title);
      }
      g.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        drag = { type: 'node', id: node.id, lastX: ev.clientX, lastY: ev.clientY, moved: 0 };
        root.classList.add('graph-dragging');
      });
      g.addEventListener('mouseenter', () => {
        if (!drag) highlightNeighborhood(node.id);
      });
      g.addEventListener('mouseleave', () => clearHighlight());
      nodeEls.set(node.id, g);
      updateNodeElement(node.id);
      nodeLayer.appendChild(g);
    }

    hint.hidden = hiddenCount === 0;
    if (hiddenCount > 0) {
      hint.textContent = t('graph.hiddenNodes').replace('{count}', String(hiddenCount));
    }
  }

  function runLayout({ fresh = false } = {}) {
    // Fläche wächst mit der Knoten-Zahl, damit Labels Platz behalten.
    side = Math.max(600, Math.round(Math.sqrt(Math.max(1, model.nodes.length)) * 160));
    svg.setAttribute('viewBox', `0 0 ${side} ${side}`);
    const previous = fresh ? new Map() : positions;
    const layouted = layoutGraph(model, {
      width: side,
      height: side,
      // Inkrementelle Läufe federn nur nach; frische Läufe iterieren voll.
      iterations: !fresh && hadLayout ? 40 : 150,
      previous,
    });
    positions.clear();
    for (const [id, p] of layouted) positions.set(id, p);
    hadLayout = true;
  }

  function setData(nextModel, opts = {}) {
    const limited = limitToMostConnected(
      nextModel && Array.isArray(nextModel.nodes) ? nextModel : { nodes: [], edges: [] },
      maxNodes,
    );
    model = limited.model;
    hiddenCount = limited.hiddenCount;
    activeId = opts.activeId != null ? opts.activeId : null;
    // Verwaiste Positionen austragen (Datei gelöscht/umbenannt), damit die
    // Karte über die Sitzung nicht unbegrenzt wächst.
    const known = new Set(model.nodes.map((n) => n.id));
    for (const id of [...positions.keys()]) {
      if (!known.has(id)) positions.delete(id);
    }
    runLayout();
    render();
  }

  function relayout() {
    positions.clear();
    hadLayout = false;
    runLayout({ fresh: true });
    render();
    scale = 1;
    tx = 0;
    ty = 0;
    applyViewportTransform();
  }

  function getStats() {
    return { nodeCount: model.nodes.length, hiddenCount };
  }

  function destroy() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    root.remove();
  }

  applyViewportTransform();
  return { setData, relayout, getStats, destroy, element: root };
}
