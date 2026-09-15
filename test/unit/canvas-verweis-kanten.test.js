// 4T-001749 (Epic 3E-000289): Karten-Verweise als Kanten, Rückverweise und
// Knoten des Verweis-Graphen — die Hälfte, die einen echten Index braucht.
//
// Die prozessneutrale Hälfte (geteilte Erkennung, Parser-Treffer,
// Umbenennungs-Nachzug) steht in canvas-verweis-scan.test.js. Hier wird
// gemessen, was danach kommt: ob der Treffer dieselbe Datei trifft wie ein
// Wiki-Link, ob er am Ziel als Rückverweis erscheint und ob er im Graphen eine
// Kante ist. Der Graph selbst ist dabei die Gegenprobe — er braucht **keine**
// Änderung, und genau das wird hier nachgewiesen statt behauptet.
//
// Setup-/Teardown-Muster wie graph-index.test.js (Temp-Verzeichnis, Soft-Timer
// per Fake-Timer feuern).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  clearBufferOverlay,
  graphFor,
  releaseRoot,
  rootForActiveFile,
  setBufferOverlay,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-cv-'));
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

// Eine Fläche mit den übergebenen Marker-Zeilen als Dokument-Text.
function flaeche(...zeilen) {
  return ['# Fläche', '', '```perspective-canvas', ...zeilen, '```', ''].join('\n');
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

describe('Karten-Verweise in Rückverweisen und Verweis-Graph (4T-001749)', () => {
  it('AK5: der Rückverweis erscheint am Ziel, mit Zeile, Anker und Ausschnitt', async () => {
    const root = makeRoot();
    write(
      root,
      'Plan.md',
      flaeche('!karte k1 x=0 y=0 b=260 h=120 doc="Import#Zielbild"', 'Mein Überblick'),
    );
    const ziel = write(root, 'Import.md', '## Zielbild\n\nInhalt.\n');
    await indexFor(ziel, 'test:canvas-backlinks');

    const res = backlinksFor(ziel, 'test:canvas-backlinks');
    expect(res.status).toBe('ready');
    expect(res.results).toHaveLength(1);
    expect(path.basename(res.results[0].quelldatei)).toBe('Plan.md');
    expect(res.results[0].hits).toEqual([
      {
        zeile: 4,
        anker: 'Zielbild',
        snippet: 'Mein Überblick',
        linkTyp: 'canvas',
        viaAlias: null,
      },
    ]);
  });

  it('AK5: ein Ziel mit Pfad-Angabe trifft dieselbe Datei wie ein Wiki-Link', async () => {
    const root = makeRoot();
    write(root, 'Plan.md', flaeche('!karte k1 doc="Konzepte/Import.md"'));
    const ziel = write(root, 'Konzepte/Import.md', 'Inhalt.\n');
    // Bereichs-Index, weil das Ziel in einem Unterordner liegt und die Wurzel
    // ohne Bereich der Ordner der aktiven Datei wäre.
    await indexFor(ziel, 'test:canvas-pfad', root);

    const res = backlinksFor(ziel, 'test:canvas-pfad', root);
    expect(res.results.map((g) => path.basename(g.quelldatei))).toEqual(['Plan.md']);
  });

  it('AK5: ein Alias des Ziels trägt wie bei einem Wiki-Link', async () => {
    const root = makeRoot();
    write(root, 'Plan.md', flaeche('!karte k1 doc="MV"'));
    const ziel = write(root, 'Import.md', '---\naliases:\n  - MV\n---\n\nInhalt.\n');
    await indexFor(ziel, 'test:canvas-alias');

    const res = backlinksFor(ziel, 'test:canvas-alias');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].hits[0].viaAlias).toBe('MV');
    expect(res.results[0].hits[0].linkTyp).toBe('canvas');
  });

  it('AK4: der Karten-Verweis ist eine Kante im Verweis-Graph', async () => {
    const root = makeRoot();
    const plan = write(root, 'Plan.md', flaeche('!karte k1 doc="Import"'));
    write(root, 'Import.md', 'Inhalt.\n');
    await indexFor(plan, 'test:canvas-graph');

    const graph = graphFor(plan, null);
    expect(graph.status).toBe('ready');
    expect(graph.nodes.map((n) => n.name).sort()).toEqual(['Import', 'Plan']);
    expect(graph.edges.map((e) => `${path.basename(e.from)}>${path.basename(e.to)}`)).toEqual([
      'Plan.md>Import.md',
    ]);
  });

  it('AK4: die Kante hat dieselbe Form wie eine Wiki-Kante (Gegenprobe am Graph)', async () => {
    // Der Graph selbst bleibt unverändert: Eine Karten-Kante ist eine
    // gewöhnliche Kante zwischen zwei Dokumenten. Gemessen wird das, indem
    // beide Herkünfte im selben Bestand dieselbe Kanten-Form liefern.
    const root = makeRoot();
    const plan = write(root, 'Plan.md', flaeche('!karte k1 doc="Import"'));
    write(root, 'Notiz.md', 'Siehe [[Import]].\n');
    write(root, 'Import.md', 'Inhalt.\n');
    await indexFor(plan, 'test:canvas-graph-form');

    const graph = graphFor(plan, null);
    const kanten = graph.edges.map((e) => `${path.basename(e.from)}>${path.basename(e.to)}`).sort();
    expect(kanten).toEqual(['Notiz.md>Import.md', 'Plan.md>Import.md']);
    for (const kante of graph.edges) {
      expect(Object.keys(kante).sort()).toEqual(['from', 'to']);
    }
  });

  it('AK7 (Rot-Probe): bild= erzeugt weder Kante noch Rückverweis', async () => {
    const root = makeRoot();
    const plan = write(root, 'Plan.md', flaeche('!karte k1 bild="Skizze.png"'));
    write(root, 'Skizze.png', 'kein echtes Bild');
    const ziel = write(root, 'Import.md', 'Inhalt.\n');
    await indexFor(plan, 'test:canvas-bild');

    expect(graphFor(plan, null).edges).toEqual([]);
    expect(backlinksFor(ziel, 'test:canvas-bild').results).toEqual([]);
  });

  it('AK3 (Rot-Probe): ein Wiki-Link im eigenen Text einer Karte erzeugt keine Kante', async () => {
    const root = makeRoot();
    const plan = write(root, 'Plan.md', flaeche('!karte k1 x=0 y=0', 'Siehe [[Import]] dazu'));
    write(root, 'Import.md', 'Inhalt.\n');
    await indexFor(plan, 'test:canvas-eigentext');

    expect(graphFor(plan, null).edges).toEqual([]);
  });

  it('die geänderte Fläche zieht die Kanten nach wie ein geänderter Wiki-Link', async () => {
    // Index-Auffrischung: Der Puffer-Überlagerungs-Weg ist der Pfad, über den
    // eine noch nicht gespeicherte Änderung in Rückverweise und Graph
    // durchschlägt. Geprüft wird, dass eine Fläche darin nichts Eigenes
    // braucht — derselbe Weg, dieselbe Wirkung.
    const root = makeRoot();
    const plan = write(root, 'Plan.md', flaeche('!karte k1 doc="Import"'));
    write(root, 'Import.md', 'Inhalt.\n');
    const zweites = write(root, 'Anderes.md', 'Inhalt.\n');
    await indexFor(plan, 'test:canvas-auffrischung');

    const kanten = () =>
      graphFor(plan, null)
        .edges.map((e) => path.basename(e.to))
        .sort();
    expect(kanten()).toEqual(['Import.md']);

    setBufferOverlay(plan, flaeche('!karte k1 doc="Anderes"'));
    expect(kanten()).toEqual(['Anderes.md']);
    expect(
      backlinksFor(zweites, 'test:canvas-auffrischung').results.map((g) =>
        path.basename(g.quelldatei),
      ),
    ).toEqual(['Plan.md']);

    clearBufferOverlay(plan);
    expect(kanten()).toEqual(['Import.md']);
  });
});
