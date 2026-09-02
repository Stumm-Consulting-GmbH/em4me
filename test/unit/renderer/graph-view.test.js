// @vitest-environment jsdom
// 4T-000454 (Epic 3E-000084): Unit-Tests des Graph-Renderers — SVG-Struktur
// (Knoten, Kanten, Pfeil-Marker, Doppel-Pfeil), Hover-Hervorhebung,
// Klick-Öffnen (inklusive Drag-Schwelle), Ober-Grenze mit lokalisiertem
// Hinweis und Positions-Erhalt über setData-Aktualisierungen. Die
// Komponente ist bewusst abhängigkeitsfrei (t und onOpenFile injiziert),
// deshalb ohne window.api-Stub testbar; der t-Stub liest die echte de.json.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphModel } from '../../../src/shared/graph-core.js';
import {
  createGraphView,
  GRAPH_MAX_RENDER_NODES,
} from '../../../src/renderer/modules/graph/graph-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

function nodes(...ids) {
  return ids.map((id) => ({ path: id, name: id.replace(/\.md$/, '') }));
}

function makeView(options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = createGraphView(container, { t: tStub, ...options });
  return { container, view };
}

const MODEL = buildGraphModel(nodes('a.md', 'b.md', 'c.md'), [
  { from: 'a.md', to: 'b.md' },
  { from: 'b.md', to: 'a.md' },
  { from: 'b.md', to: 'c.md' },
]);

describe('createGraphView — SVG-Struktur', () => {
  it('rendert Knoten mit Labels und Kanten mit Pfeil-Markern', () => {
    const { container, view } = makeView();
    view.setData(MODEL, {});
    const svg = container.querySelector('svg.graph-svg');
    expect(svg).not.toBeNull();
    const nodeEls = container.querySelectorAll('.graph-node');
    expect(nodeEls.length).toBe(3);
    const labels = [...container.querySelectorAll('.graph-label')].map((el) => el.textContent);
    expect(labels.sort()).toEqual(['a', 'b', 'c']);
    const edges = container.querySelectorAll('.graph-edge');
    expect(edges.length).toBe(2);
    // Jede Kante trägt die End-Pfeilspitze.
    for (const edge of edges) {
      expect(edge.getAttribute('marker-end')).toMatch(/^url\(#graph-arrow-end-/);
    }
    view.destroy();
  });

  it('Doppel-Pfeil-Kante trägt zusätzlich den Start-Marker und die two-way-Klasse', () => {
    const { container, view } = makeView();
    view.setData(MODEL, {});
    const twoWay = container.querySelector('.graph-edge-two-way');
    expect(twoWay).not.toBeNull();
    expect(twoWay.getAttribute('marker-start')).toMatch(/^url\(#graph-arrow-start-/);
    const oneWay = [...container.querySelectorAll('.graph-edge:not(.graph-edge-two-way)')];
    expect(oneWay.length).toBe(1);
    expect(oneWay[0].getAttribute('marker-start')).toBeNull();
    view.destroy();
  });

  it('hebt die aktive Datei hervor', () => {
    const { container, view } = makeView();
    view.setData(MODEL, { activeId: 'b.md' });
    const active = container.querySelectorAll('.graph-node-active');
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('data-graph-id')).toBe('b.md');
    view.destroy();
  });

  it('Tooltip mit Pfad nur bei Namens-Duplikaten', () => {
    const model = buildGraphModel(
      [
        { path: '/x/Gleich.md', name: 'Gleich' },
        { path: '/y/Gleich.md', name: 'Gleich' },
        { path: '/x/Solo.md', name: 'Solo' },
      ],
      [],
    );
    const { container, view } = makeView();
    view.setData(model, {});
    const titles = [...container.querySelectorAll('.graph-node title')].map((el) => el.textContent);
    expect(titles.sort()).toEqual(['/x/Gleich.md', '/y/Gleich.md']);
    view.destroy();
  });
});

describe('createGraphView — Interaktion', () => {
  function mouseEvent(type, opts = {}) {
    return new window.MouseEvent(type, { bubbles: true, button: 0, ...opts });
  }

  it('Hover dimmt den Rest und hebt Fokus, Nachbarn und beteiligte Kanten an', () => {
    const { container, view } = makeView();
    view.setData(MODEL, {});
    const nodeB = container.querySelector('.graph-node[data-graph-id="b.md"]');
    nodeB.dispatchEvent(mouseEvent('mouseenter'));
    const root = container.querySelector('.graph-view');
    expect(root.classList.contains('graph-hovering')).toBe(true);
    expect(nodeB.classList.contains('graph-focus')).toBe(true);
    const nodeA = container.querySelector('.graph-node[data-graph-id="a.md"]');
    const nodeC = container.querySelector('.graph-node[data-graph-id="c.md"]');
    expect(nodeA.classList.contains('graph-neighbor')).toBe(true);
    expect(nodeC.classList.contains('graph-neighbor')).toBe(true);
    expect(container.querySelectorAll('.graph-edge-active').length).toBe(2);
    nodeB.dispatchEvent(mouseEvent('mouseleave'));
    expect(root.classList.contains('graph-hovering')).toBe(false);
    expect(container.querySelectorAll('.graph-edge-active').length).toBe(0);
    view.destroy();
  });

  it('Klick ohne Bewegung öffnet die Datei, Ziehen über der Schwelle nicht', () => {
    const onOpenFile = vi.fn();
    const { container, view } = makeView({ onOpenFile });
    view.setData(MODEL, {});
    const nodeA = container.querySelector('.graph-node[data-graph-id="a.md"]');
    // Klick: mousedown + mouseup ohne Bewegung.
    nodeA.dispatchEvent(mouseEvent('mousedown', { clientX: 10, clientY: 10 }));
    document.dispatchEvent(mouseEvent('mouseup'));
    expect(onOpenFile).toHaveBeenCalledWith('a.md');
    // Drag: Bewegung über der Schwelle unterdrückt das Öffnen.
    onOpenFile.mockClear();
    nodeA.dispatchEvent(mouseEvent('mousedown', { clientX: 10, clientY: 10 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 40, clientY: 40 }));
    document.dispatchEvent(mouseEvent('mouseup'));
    expect(onOpenFile).not.toHaveBeenCalled();
    view.destroy();
  });

  it('Ziehen verschiebt den Knoten und die Position überlebt die Aktualisierung', () => {
    const { container, view } = makeView();
    view.setData(MODEL, {});
    const nodeA = container.querySelector('.graph-node[data-graph-id="a.md"]');
    const before = nodeA.getAttribute('transform');
    nodeA.dispatchEvent(mouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 80, clientY: 60 }));
    document.dispatchEvent(mouseEvent('mouseup'));
    const dragged = container
      .querySelector('.graph-node[data-graph-id="a.md"]')
      .getAttribute('transform');
    expect(dragged).not.toBe(before);
    // Aktualisierung mit identischem Modell: inkrementelles Layout startet
    // an der gezogenen Position — der Knoten springt nicht auf den alten Ort
    // zurück (Positions-Erhalt für die Sitzungs-Dauer).
    view.setData(MODEL, {});
    const after = container
      .querySelector('.graph-node[data-graph-id="a.md"]')
      .getAttribute('transform');
    expect(after).not.toBe(before);
    view.destroy();
  });

  it('relayout verwirft gezogene Positionen (deterministischer Neustart)', () => {
    const { container, view } = makeView();
    view.setData(MODEL, {});
    const initial = container
      .querySelector('.graph-node[data-graph-id="a.md"]')
      .getAttribute('transform');
    const nodeA = container.querySelector('.graph-node[data-graph-id="a.md"]');
    nodeA.dispatchEvent(mouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 120, clientY: 90 }));
    document.dispatchEvent(mouseEvent('mouseup'));
    view.relayout();
    const relaid = container
      .querySelector('.graph-node[data-graph-id="a.md"]')
      .getAttribute('transform');
    expect(relaid).toBe(initial);
    view.destroy();
  });
});

describe('createGraphView — Ober-Grenze', () => {
  it('reduziert auf die am stärksten vernetzten Knoten und zeigt den Hinweis', () => {
    expect(GRAPH_MAX_RENDER_NODES).toBe(1500);
    const model = buildGraphModel(nodes('hub.md', 'x1.md', 'x2.md', 'solo1.md', 'solo2.md'), [
      { from: 'hub.md', to: 'x1.md' },
      { from: 'hub.md', to: 'x2.md' },
    ]);
    const { container, view } = makeView({ maxNodes: 3 });
    view.setData(model, {});
    expect(container.querySelectorAll('.graph-node').length).toBe(3);
    const hint = container.querySelector('.graph-hint');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(de['graph.hiddenNodes'].replace('{count}', '2'));
    expect(view.getStats()).toEqual({ nodeCount: 3, hiddenCount: 2 });
    view.destroy();
  });

  it('unter der Grenze bleibt der Hinweis verborgen', () => {
    const { container, view } = makeView({ maxNodes: 10 });
    view.setData(MODEL, {});
    expect(container.querySelector('.graph-hint').hidden).toBe(true);
    expect(view.getStats()).toEqual({ nodeCount: 3, hiddenCount: 0 });
    view.destroy();
  });
});
