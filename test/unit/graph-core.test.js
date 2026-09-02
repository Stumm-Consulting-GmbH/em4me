// 4T-000453 (Epic 3E-000084): Unit-Tests des Graph-Kerns — Modell-Aufbau
// (Dedup, Doppel-Pfeil, Kanten-Bereinigung), Tiefen-Expansion (Richtungen,
// Zyklen, Klemmen), Ober-Grenze und Kraft-Layout (Determinismus,
// Reihenfolge-Unabhängigkeit, inkrementelle Stabilität).
import { describe, it, expect } from 'vitest';
import {
  GRAPH_DIRECTIONS,
  GRAPH_MIN_DEPTH,
  GRAPH_MAX_DEPTH,
  buildGraphModel,
  neighborhood,
  limitToMostConnected,
  layoutGraph,
} from '../../src/shared/graph-core.js';
import { isExtensionId } from '../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../src/shared/extensions/extensions-core.js';

// Kurzform: Knoten aus IDs, Name = ID.
function nodes(...ids) {
  return ids.map((id) => ({ path: id, name: id }));
}

function edge(from, to) {
  return { from, to };
}

function edgeKeys(model) {
  return model.edges.map((e) => `${e.from}>${e.to}${e.twoWay ? '*' : ''}`);
}

function nodeIds(model) {
  return model.nodes.map((n) => n.id);
}

describe('buildGraphModel — Modell-Aufbau', () => {
  it('übernimmt Knoten mit Namen und sortiert kanonisch', () => {
    const model = buildGraphModel(
      [
        { path: 'b.md', name: 'B' },
        { path: 'a.md', name: 'A' },
      ],
      [],
    );
    expect(model.nodes).toEqual([
      { id: 'a.md', name: 'A' },
      { id: 'b.md', name: 'B' },
    ]);
    expect(model.edges).toEqual([]);
  });

  it('verwirft Duplikate, ungültige Knoten und leere Namen fallen auf die ID zurück', () => {
    const model = buildGraphModel(
      [{ path: 'a.md', name: 'A' }, { path: 'a.md', name: 'Anders' }, { path: 'x.md' }, null, {}],
      [],
    );
    expect(model.nodes).toEqual([
      { id: 'a.md', name: 'A' },
      { id: 'x.md', name: 'x.md' },
    ]);
  });

  it('dedupliziert Kanten und verwirft Selbst-Kanten und unbekannte Endpunkte', () => {
    const model = buildGraphModel(nodes('a', 'b'), [
      edge('a', 'b'),
      edge('a', 'b'),
      edge('a', 'a'),
      edge('a', 'fremd'),
      edge('fremd', 'b'),
      null,
      { from: 'a' },
    ]);
    expect(edgeKeys(model)).toEqual(['a>b']);
  });

  it('verschmilzt Gegenrichtungs-Paare zu einer Doppel-Pfeil-Kante mit kanonischer Richtung', () => {
    // Beide Eingabe-Reihenfolgen liefern dieselbe kanonische Kante.
    const m1 = buildGraphModel(nodes('a', 'b'), [edge('a', 'b'), edge('b', 'a')]);
    const m2 = buildGraphModel(nodes('a', 'b'), [edge('b', 'a'), edge('a', 'b')]);
    expect(edgeKeys(m1)).toEqual(['a>b*']);
    expect(edgeKeys(m2)).toEqual(['a>b*']);
  });

  it('einseitige Kanten behalten ihre Richtung und twoWay false', () => {
    const model = buildGraphModel(nodes('a', 'b', 'c'), [edge('b', 'a'), edge('b', 'c')]);
    expect(edgeKeys(model)).toEqual(['b>a', 'b>c']);
  });
});

describe('neighborhood — Tiefen-Expansion', () => {
  // Kette mit Rück-Kante und Seitenast:
  //   a -> b -> c -> a (Zyklus), d -> b, b <-> e (Doppel-Pfeil)
  const model = buildGraphModel(nodes('a', 'b', 'c', 'd', 'e'), [
    edge('a', 'b'),
    edge('b', 'c'),
    edge('c', 'a'),
    edge('d', 'b'),
    edge('b', 'e'),
    edge('e', 'b'),
  ]);

  it('Tiefe 1 ausgehend liefert die direkten Ziele', () => {
    const sub = neighborhood(model, 'a', { depth: 1, direction: 'out' });
    // a -> b; ueber die Doppel-Pfeil-Kante hinaus nichts (e ist Tiefe 2).
    expect(nodeIds(sub)).toEqual(['a', 'b']);
    expect(edgeKeys(sub)).toEqual(['a>b']);
  });

  it('Tiefe 1 eingehend liefert die Verlinker', () => {
    const sub = neighborhood(model, 'b', { depth: 1, direction: 'in' });
    // Verlinker von b: a, d und e (Doppel-Pfeil zaehlt in beide Richtungen).
    expect(nodeIds(sub)).toEqual(['a', 'b', 'd', 'e']);
    // Induzierter Teilgraph: auch a>b, d>b und die Doppel-Kante selbst.
    expect(edgeKeys(sub)).toEqual(['a>b', 'b>e*', 'd>b']);
  });

  it('Zyklen terminieren und erreichen alle Zyklus-Knoten', () => {
    const sub = neighborhood(model, 'a', { depth: 3, direction: 'out' });
    expect(nodeIds(sub)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('beide Richtungen vereinigen ein- und ausgehende Nachbarn', () => {
    const sub = neighborhood(model, 'b', { depth: 1, direction: 'both' });
    expect(nodeIds(sub)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('Tiefe wird auf 1..5 geklemmt, Infinity expandiert vollständig', () => {
    expect(GRAPH_MIN_DEPTH).toBe(1);
    expect(GRAPH_MAX_DEPTH).toBe(5);
    const clamped = neighborhood(model, 'a', { depth: 99, direction: 'out' });
    expect(nodeIds(clamped)).toEqual(['a', 'b', 'c', 'e']);
    const infinite = neighborhood(model, 'a', { depth: Infinity, direction: 'out' });
    expect(nodeIds(infinite)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('unbekannter Start und unbekannte Richtung sind definiert', () => {
    expect(neighborhood(model, 'nix', { depth: 2, direction: 'out' })).toEqual({
      nodes: [],
      edges: [],
    });
    // Unbekannte Richtung faellt auf 'both' zurueck.
    const sub = neighborhood(model, 'd', { depth: 1, direction: 'quer' });
    expect(nodeIds(sub)).toEqual(['b', 'd']);
    expect(GRAPH_DIRECTIONS).toEqual(['both', 'in', 'out']);
  });
});

describe('limitToMostConnected — Ober-Grenze', () => {
  it('lässt Modelle unter der Grenze unverändert (Identität)', () => {
    const model = buildGraphModel(nodes('a', 'b'), [edge('a', 'b')]);
    const { model: limited, hiddenCount } = limitToMostConnected(model, 5);
    expect(limited).toBe(model);
    expect(hiddenCount).toBe(0);
  });

  it('behält die am stärksten vernetzten Knoten und meldet die Ausblendung', () => {
    // Stern um hub plus isolierte Knoten: hub hat den höchsten Grad.
    const model = buildGraphModel(nodes('hub', 'x1', 'x2', 'x3', 'solo1', 'solo2'), [
      edge('hub', 'x1'),
      edge('hub', 'x2'),
      edge('x3', 'hub'),
      edge('x1', 'x2'),
    ]);
    const { model: limited, hiddenCount } = limitToMostConnected(model, 3);
    expect(nodeIds(limited)).toEqual(['hub', 'x1', 'x2']);
    expect(edgeKeys(limited)).toEqual(['hub>x1', 'hub>x2', 'x1>x2']);
    expect(hiddenCount).toBe(3);
  });
});

describe('layoutGraph — Determinismus und Stabilität', () => {
  const model = buildGraphModel(nodes('a', 'b', 'c', 'd'), [
    edge('a', 'b'),
    edge('b', 'c'),
    edge('c', 'a'),
    edge('a', 'd'),
  ]);

  it('liefert für jeden Knoten eine endliche Position innerhalb der Fläche', () => {
    const pos = layoutGraph(model, { width: 500, height: 400, iterations: 60 });
    expect(pos.size).toBe(4);
    for (const { x, y } of pos.values()) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(500);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(400);
    }
  });

  it('gleiche Eingabe liefert exakt gleiche Positionen', () => {
    const p1 = layoutGraph(model, { iterations: 80 });
    const p2 = layoutGraph(model, { iterations: 80 });
    expect([...p1.entries()]).toEqual([...p2.entries()]);
  });

  it('ist unabhängig von der Roh-Eingabe-Reihenfolge (kanonische Sortierung)', () => {
    const shuffled = buildGraphModel(nodes('d', 'c', 'b', 'a'), [
      edge('a', 'd'),
      edge('c', 'a'),
      edge('a', 'b'),
      edge('b', 'c'),
    ]);
    const p1 = layoutGraph(model, { iterations: 80 });
    const p2 = layoutGraph(shuffled, { iterations: 80 });
    expect([...p1.entries()]).toEqual([...p2.entries()]);
  });

  it('inkrementell: Bestand startet an bisherigen Positionen und bleibt in deren Nähe', () => {
    const base = layoutGraph(model, { width: 1000, height: 1000, iterations: 120 });
    const extended = buildGraphModel(nodes('a', 'b', 'c', 'd', 'neu'), [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('c', 'a'),
      edge('a', 'd'),
      edge('neu', 'a'),
    ]);
    const incremental = layoutGraph(extended, {
      width: 1000,
      height: 1000,
      iterations: 40,
      previous: base,
    });
    expect(incremental.size).toBe(5);
    // Bestehende Knoten federn nur lokal nach (deutlich unter der Fläche;
    // Schranke grosszuegig, aber weit unter einem Voll-Neulayout).
    for (const id of ['a', 'b', 'c', 'd']) {
      const before = base.get(id);
      const after = incremental.get(id);
      const dist = Math.hypot(after.x - before.x, after.y - before.y);
      expect(dist).toBeLessThan(250);
    }
    // Der neue Knoten liegt in Feder-Reichweite seines Nachbarn a (der
    // Gleichgewichts-Abstand des Layouts ist k = sqrt(Fläche/n) ≈ 447; die
    // Schranke lässt Abstoßungs-Spielraum, schließt aber den Hash-Zufallsort
    // quer über die Fläche aus).
    const a = incremental.get('a');
    const neu = incremental.get('neu');
    expect(Math.hypot(neu.x - a.x, neu.y - a.y)).toBeLessThan(750);
  });

  it('leeres Modell liefert leere Positions-Map', () => {
    expect(layoutGraph({ nodes: [], edges: [] }).size).toBe(0);
  });
});

// 4T-000456 (Epic 3E-000084): Wirkung des Aus-Zustands der Erweiterung
// graph-view — beide Kommandos verschwinden aus Dispatcher, Menü und
// Handbuch-Generatoren (Muster journal-perioden.test.js; die Panel-
// Ausblendung deckt der isExtensionActive-Guard der Sichtbarkeits-Pfade).
describe('Erweiterung graph-view — Kommando-Filterung im Aus-Zustand', () => {
  it('ist registriert und filtert beide Graph-Kommandos', () => {
    expect(isExtensionId('graph-view')).toBe(true);
    const disabled = disabledCommandIdSet(['graph-view']);
    expect(disabled.has('graph.openArea')).toBe(true);
    expect(disabled.has('view.toggleGraphPanel')).toBe(true);
    expect(disabledCommandIdSet([]).has('graph.openArea')).toBe(false);
  });
});
