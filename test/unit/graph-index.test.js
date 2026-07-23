// 4T-0453 (Epic 3E-0084): Unit-Tests der Graph-Daten-Lieferung aus dem
// Link-Index (graphFor in backlinks.js) — Knoten-/Kanten-Extraktion aus
// outMap, Status-Durchreichung und der Bereichs-Fall ohne aktive Datei.
// Setup-/Teardown-Muster wie backlinks.test.js (Temp-Verzeichnis, Soft-Timer
// per Fake-Timer feuern).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  graphFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-gr-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Index aufbauen und bis zum Endzustand pollen (Muster backlinks.test.js).
async function indexFor(activeFile, ownerKey, areaRoot) {
  let result = backlinksFor(activeFile, ownerKey, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, areaRoot);
  }
  return result;
}

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) {
    releaseRoot(root);
  }
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

describe('graphFor — Knoten und Kanten aus dem Link-Index', () => {
  it('liefert alle Markdown-Knoten und die aufgelösten Wiki-Kanten', async () => {
    const root = makeRoot();
    const a = write(root, 'Alpha.md', 'Siehe [[Beta]] und [[Beta]] doppelt.');
    const b = write(root, 'Beta.md', 'Zurück zu [[Alpha]].');
    write(root, 'Solo.md', 'Ohne Links.');
    await indexFor(a, 'test:graph');

    const result = graphFor(a, null);
    expect(result.status).toBe('ready');
    expect(result.meta.isArea).toBe(false);
    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['Alpha', 'Beta', 'Solo']);
    // Kanten dedupliziert pro Quelle; beide Richtungen als Roh-Kanten.
    const edges = result.edges.map((e) => `${path.basename(e.from)}>${path.basename(e.to)}`).sort();
    expect(edges).toEqual(['Alpha.md>Beta.md', 'Beta.md>Alpha.md']);
    expect(result.edges.every((e) => e.from !== e.to)).toBe(true);
    void b;
  });

  it('Bereichs-Fall: areaRoot ohne aktive Datei liefert den Bereichs-Graph', async () => {
    const root = makeRoot();
    const a = write(root, 'Start.md', '[[Unter/Ziel]]');
    write(root, 'Unter/Ziel.md', 'Inhalt.');
    // Bereichs-Index über den bereichsbewussten Request-Pfad aufbauen.
    await indexFor(a, 'test:graph-area', root);

    const result = graphFor(null, root);
    expect(result.status).toBe('ready');
    expect(result.meta.isArea).toBe(true);
    expect(result.nodes.map((n) => n.name).sort()).toEqual(['Start', 'Ziel']);
    expect(result.edges).toHaveLength(1);
    expect(path.basename(result.edges[0].to)).toBe('Ziel.md');
  });

  it('ohne Index bzw. ohne Suchraum ist der Status unavailable', () => {
    expect(graphFor(null, null).status).toBe('unavailable');
    expect(graphFor(path.join(makeRoot(), 'nie-indiziert.md'), null).status).toBe('unavailable');
  });
});
