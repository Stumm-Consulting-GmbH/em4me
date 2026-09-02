// 4T-000453 (Epic 3E-000084): Graph-Kern der Graphenansicht — Knoten-/Kanten-
// Modell aus dem Link-Index, Tiefen-Expansion um eine Start-Datei,
// Richtungs-Filter und deterministisches Kraft-Layout.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM): der Main liefert die Roh-Kanten aus dem Link-Graph-Cache
// (backlinks.js, graph:edges), der Renderer (graph-view.js) baut Modell,
// Ausschnitt und Layout — Bereichs-Graph-Tab und Datei-Graph-Panel teilen
// sich denselben Kern.
//
// Determinismus als Grundsatz (Epic-Architekturentscheidung 2): keine
// Zufallsquelle. Start-Positionen des Layouts kommen aus einem Hash der
// Knoten-ID, Modell-Reihenfolgen sind kanonisch sortiert — gleiche Eingabe
// liefert exakt gleiche Positionen, unabhängig von der Eingabe-Reihenfolge.
'use strict';

// Richtungs-Werte des Filters (relativ zur Start-Datei bzw. Start-Menge).
const GRAPH_DIRECTIONS = ['both', 'in', 'out'];

// Tiefen-Grenzen der Datei-Umfeld-Expansion (PO-Anforderung I-14: 1 bis 5).
const GRAPH_MIN_DEPTH = 1;
const GRAPH_MAX_DEPTH = 5;

function clampDepth(depth) {
  const n = Number.isFinite(depth) ? Math.round(depth) : GRAPH_MIN_DEPTH;
  return Math.max(GRAPH_MIN_DEPTH, Math.min(GRAPH_MAX_DEPTH, n));
}

function normalizeDirection(direction) {
  return GRAPH_DIRECTIONS.includes(direction) ? direction : 'both';
}

// --- Modell-Aufbau -----------------------------------------------------------

// Baut aus Roh-Knoten ([{ path, name }]) und gerichteten Roh-Kanten
// ([{ from, to }]) das Graph-Modell:
//   { nodes: [{ id, name }], edges: [{ from, to, twoWay }] }
// Regeln:
//   - Knoten-IDs sind die absoluten Pfade des Index; Duplikate und
//     ungültige Einträge entfallen.
//   - Kanten ohne bekannte Endpunkte und Selbst-Kanten entfallen (der
//     Suchraum definiert die Knoten-Menge; Epic: nur Markdown-Knoten).
//   - Gegenläufige Kanten-Paare (A→B und B→A) verschmelzen zu EINER Kante
//     mit twoWay:true (Doppel-Pfeil); ihre Richtung wird kanonisch auf die
//     kleinere ID gelegt, damit das Ergebnis eingabe-reihenfolge-unabhängig
//     ist.
//   - nodes und edges sind kanonisch sortiert (Determinismus des Layouts).
function buildGraphModel(rawNodes, rawEdges) {
  const nameById = new Map();
  for (const n of Array.isArray(rawNodes) ? rawNodes : []) {
    const id = n && typeof n.path === 'string' ? n.path : null;
    if (!id || nameById.has(id)) continue;
    nameById.set(id, typeof n.name === 'string' && n.name !== '' ? n.name : id);
  }
  const edgeByKey = new Map();
  for (const e of Array.isArray(rawEdges) ? rawEdges : []) {
    const from = e && typeof e.from === 'string' ? e.from : null;
    const to = e && typeof e.to === 'string' ? e.to : null;
    if (!from || !to || from === to) continue;
    if (!nameById.has(from) || !nameById.has(to)) continue;
    if (edgeByKey.has(`${from}\n${to}`)) continue;
    const reverseKey = `${to}\n${from}`;
    const reverse = edgeByKey.get(reverseKey);
    if (reverse) {
      // Gegenrichtung existiert bereits: zu Doppel-Pfeil verschmelzen und
      // kanonisch orientieren (kleinere ID als from).
      edgeByKey.delete(reverseKey);
      const [a, b] = from < to ? [from, to] : [to, from];
      edgeByKey.set(`${a}\n${b}`, { from: a, to: b, twoWay: true });
      continue;
    }
    edgeByKey.set(`${from}\n${to}`, { from, to, twoWay: false });
  }
  const nodes = [...nameById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...edgeByKey.values()].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
  });
  return { nodes, edges };
}

// Adjazenz des Modells in einer Richtung: Map id -> Set erreichbarer IDs.
// Eine twoWay-Kante ist in BEIDEN Richtungen eine aus- wie eingehende
// Verlinkung (beide Links existieren real).
function adjacency(model, direction) {
  const dir = normalizeDirection(direction);
  const adj = new Map();
  for (const n of model.nodes) adj.set(n.id, new Set());
  const add = (a, b) => {
    const set = adj.get(a);
    if (set) set.add(b);
  };
  for (const e of model.edges) {
    const out = dir === 'both' || dir === 'out';
    const inn = dir === 'both' || dir === 'in';
    if (out) {
      add(e.from, e.to);
      if (e.twoWay) add(e.to, e.from);
    }
    if (inn) {
      add(e.to, e.from);
      if (e.twoWay) add(e.from, e.to);
    }
  }
  return adj;
}

// --- Tiefen-Expansion ---------------------------------------------------------

// Umfeld einer Start-Datei: Breitensuche bis zur Tiefe (geklemmt auf 1..5;
// Infinity erlaubt für die Erreichbarkeits-Sicht des Bereichs-Graph-Filters).
// Richtung: 'out' folgt ausgehenden Links, 'in' eingehenden, 'both' beiden.
// Ergebnis ist der auf die erreichten Knoten induzierte Teilgraph (alle
// Kanten zwischen erreichten Knoten, nicht nur die BFS-Baum-Kanten) — die
// Nachbarschaft soll ihre inneren Verbindungen vollständig zeigen.
// Unbekannte Start-ID liefert das leere Modell.
function neighborhood(model, startId, options = {}) {
  const depth = options.depth === Infinity ? Infinity : clampDepth(options.depth);
  const direction = normalizeDirection(options.direction);
  if (!model || !model.nodes.some((n) => n.id === startId)) {
    return { nodes: [], edges: [] };
  }
  const adj = adjacency(model, direction);
  const distance = new Map([[startId, 0]]);
  let frontier = [startId];
  let level = 0;
  while (frontier.length > 0 && level < depth) {
    const next = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) || []) {
        if (distance.has(neighbor)) continue;
        distance.set(neighbor, level + 1);
        next.push(neighbor);
      }
    }
    frontier = next;
    level++;
  }
  const nodes = model.nodes.filter((n) => distance.has(n.id));
  const edges = model.edges.filter((e) => distance.has(e.from) && distance.has(e.to));
  return { nodes, edges };
}

// --- Ober-Grenze (4T-000454) ------------------------------------------------------

// Reduziert ein Modell auf die maxNodes am stärksten vernetzten Knoten
// (Grad = Anzahl beteiligter Kanten; twoWay zählt wie eine Kante). Ties
// entscheidet die kanonische ID-Ordnung — deterministisch. Liefert das
// unveränderte Modell, wenn es die Grenze nicht reißt; sonst den induzierten
// Teilgraph plus hiddenCount für den lokalisierten Hinweis.
function limitToMostConnected(model, maxNodes) {
  const limit = Number.isFinite(maxNodes) ? Math.max(1, Math.round(maxNodes)) : Infinity;
  if (!model || model.nodes.length <= limit) {
    return { model, hiddenCount: 0 };
  }
  const degree = new Map();
  for (const n of model.nodes) degree.set(n.id, 0);
  for (const e of model.edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  const keep = new Set(
    [...model.nodes]
      .sort((a, b) => {
        const d = (degree.get(b.id) || 0) - (degree.get(a.id) || 0);
        if (d !== 0) return d;
        return a.id < b.id ? -1 : 1;
      })
      .slice(0, limit)
      .map((n) => n.id),
  );
  return {
    model: {
      nodes: model.nodes.filter((n) => keep.has(n.id)),
      edges: model.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    },
    hiddenCount: model.nodes.length - keep.size,
  };
}

// --- Kraft-Layout ----------------------------------------------------------------

// FNV-1a-Hash (32 Bit) — deterministische Pseudo-Streuung der Start-
// Positionen aus der Knoten-ID (Ersatz für Math.random, das die
// Reproduzierbarkeit bräche).
function hash32(str, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Anteil in [0, 1) aus dem Hash.
function hashUnit(str, seed) {
  return hash32(str, seed) / 0x100000000;
}

// Iteratives Feder-/Abstoßungs-Layout (Fruchterman-Reingold-artig) auf einer
// width×height-Fläche. Optionen:
//   width, height   Layout-Fläche (Default 1000×1000).
//   iterations      Iterations-Zahl (Default 150).
//   previous        Map bzw. Objekt id -> {x, y} bisheriger Positionen:
//                   bestehende Knoten starten dort (inkrementelles
//                   Nachlayouten, Epic-Risiko Layout-Stabilität); nur neue
//                   Knoten werden eingefügt — sie starten am Mittel ihrer
//                   bereits platzierten Nachbarn plus Hash-Versatz, sonst an
//                   der Hash-Position. Zugleich sinkt die Start-Temperatur,
//                   damit der Bestand nur lokal nachfedert statt neu zu
//                   mischen.
// Liefert Map id -> { x, y }. Abstoßung läuft über ein räumliches Gitter
// (Nachbar-Zellen), damit große Bereiche nicht in O(n²) pro Iteration laufen
// (Entwicklungsrichtlinien §5).
function layoutGraph(model, options = {}) {
  const width = Number.isFinite(options.width) ? options.width : 1000;
  const height = Number.isFinite(options.height) ? options.height : 1000;
  const nodes = model && Array.isArray(model.nodes) ? model.nodes : [];
  const edges = model && Array.isArray(model.edges) ? model.edges : [];
  const positions = new Map();
  if (nodes.length === 0) return positions;

  const prev =
    options.previous instanceof Map
      ? options.previous
      : new Map(Object.entries(options.previous || {}));
  const hasPrevious = [...prev.keys()].some((id) => nodes.some((n) => n.id === id));

  // Start-Positionen: Bestand aus previous, Neue am Nachbarschafts-Mittel
  // bzw. an der Hash-Position.
  const pts = new Map();
  const newIds = [];
  for (const n of nodes) {
    const p = prev.get(n.id);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      pts.set(n.id, { x: p.x, y: p.y });
    } else {
      newIds.push(n.id);
    }
  }
  const neighborsOf = new Map();
  for (const e of edges) {
    if (!neighborsOf.has(e.from)) neighborsOf.set(e.from, []);
    if (!neighborsOf.has(e.to)) neighborsOf.set(e.to, []);
    neighborsOf.get(e.from).push(e.to);
    neighborsOf.get(e.to).push(e.from);
  }
  for (const id of newIds) {
    const placed = (neighborsOf.get(id) || []).filter((nb) => pts.has(nb));
    // Versatz um die Hash-Position bzw. das Nachbar-Mittel; 0.5-Abzug
    // zentriert die Streuung.
    const jx = (hashUnit(id, 1) - 0.5) * width * 0.2;
    const jy = (hashUnit(id, 2) - 0.5) * height * 0.2;
    if (placed.length > 0) {
      let sx = 0;
      let sy = 0;
      for (const nb of placed) {
        sx += pts.get(nb).x;
        sy += pts.get(nb).y;
      }
      pts.set(id, { x: sx / placed.length + jx, y: sy / placed.length + jy });
    } else {
      pts.set(id, { x: hashUnit(id, 1) * width, y: hashUnit(id, 2) * height });
    }
  }

  const n = nodes.length;
  const k = Math.sqrt((width * height) / n);
  const iterations = Number.isFinite(options.iterations)
    ? Math.max(1, Math.round(options.iterations))
    : 150;
  // Inkrementell: niedrige Start-Temperatur hält den Bestand nahe an den
  // bisherigen Positionen; frisches Layout startet heiß (Fläche/10).
  let temperature = hasPrevious ? k * 0.6 : Math.max(width, height) / 10;
  const cooling = Math.pow(0.02 / temperature, 1 / iterations);

  const ids = nodes.map((node) => node.id);
  const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

  for (let iter = 0; iter < iterations; iter++) {
    for (const id of ids) {
      const d = disp.get(id);
      d.x = 0;
      d.y = 0;
    }
    // Abstoßung über räumliches Gitter: nur Paare aus Nachbar-Zellen
    // (Zell-Kante 2k deckt den relevanten Wirkradius ab).
    const cell = Math.max(1e-6, 2 * k);
    const grid = new Map();
    for (const id of ids) {
      const p = pts.get(id);
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(id);
    }
    for (const id of ids) {
      const p = pts.get(id);
      const d = disp.get(id);
      const cx = Math.floor(p.x / cell);
      const cy = Math.floor(p.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const bucket = grid.get(`${gx},${gy}`);
          if (!bucket) continue;
          for (const other of bucket) {
            if (other === id) continue;
            const q = pts.get(other);
            let dx = p.x - q.x;
            let dy = p.y - q.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1e-6) {
              // Deckungsgleiche Punkte deterministisch trennen (Hash statt
              // Zufall), sonst bliebe die Abstoßung richtungslos.
              dx = hashUnit(id + other, 3) - 0.5;
              dy = hashUnit(id + other, 4) - 0.5;
              dist = Math.sqrt(dx * dx + dy * dy);
            }
            const force = (k * k) / dist;
            d.x += (dx / dist) * force;
            d.y += (dy / dist) * force;
          }
        }
      }
    }
    // Anziehung entlang der Kanten.
    for (const e of edges) {
      const p = pts.get(e.from);
      const q = pts.get(e.to);
      if (!p || !q) continue;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const dist = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const dp = disp.get(e.from);
      const dq = disp.get(e.to);
      dp.x -= fx;
      dp.y -= fy;
      dq.x += fx;
      dq.y += fy;
    }
    // Verschiebung mit Temperatur-Deckel anwenden; Fläche begrenzt.
    for (const id of ids) {
      const p = pts.get(id);
      const d = disp.get(id);
      const dist = Math.sqrt(d.x * d.x + d.y * d.y);
      if (dist > 1e-6) {
        const step = Math.min(dist, temperature);
        p.x += (d.x / dist) * step;
        p.y += (d.y / dist) * step;
      }
      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(height, p.y));
    }
    temperature *= cooling;
  }

  for (const id of ids) {
    const p = pts.get(id);
    positions.set(id, { x: p.x, y: p.y });
  }
  return positions;
}

module.exports = {
  GRAPH_DIRECTIONS,
  GRAPH_MIN_DEPTH,
  GRAPH_MAX_DEPTH,
  buildGraphModel,
  neighborhood,
  limitToMostConnected,
  layoutGraph,
};
