// 4T-000413 (Epic 3E-000078): Integrations-Test des Skript-Daten-Snapshots
// (backlinks.scriptDataFor) gegen den echten Index (Temp-Verzeichnis-Fixture,
// Setup-/Teardown-Muster aus perspective-query-index.test.js). Geprüft wird
// der Werte-Vertrag der Sandbox-Daten: pages mit props plus file.*-Feldern
// (inkl. Link-Graph in beide Richtungen), blocks nur mit aktiven Ankern
// (verwaiste .mdd-Einträge zählen nicht) und der Status-Pfad.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  releaseRoot,
  rootForActiveFile,
  scriptDataFor,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-scriptdata-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
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

function mddWith(blockData) {
  return JSON.stringify({ schemaVersion: 1, history: { anchors: [], packets: [] }, blockData });
}

let start;
let root;

beforeEach(async () => {
  root = makeRoot();
  start = write(root, 'Start.md', '# Start\nSiehe [[Alpha]].\n');
  write(
    root,
    'Projekte/Alpha.md',
    '---\nprio: 3\n---\n# Alpha\nZurück zu [[Start]].\n\nAufgabe. ^a1\n',
  );
  write(
    root,
    'Projekte/Alpha.mdd',
    mddWith({
      a1: { values: { status: 'offen' }, updated: '2026-07-01T10:00:00Z' },
      verwaist: { values: { status: 'weg' }, updated: '2026-07-01T10:00:00Z' },
    }),
  );
  await indexFor(start);
});

describe('scriptDataFor — Daten-Snapshot der Skript-Blöcke (4T-000413)', () => {
  it('pages tragen props und file.*-Felder inklusive Link-Graph', () => {
    const snap = scriptDataFor(start, null);
    expect(snap.status).toBe('ready');
    expect(snap.current).toBe(start);
    const byName = new Map(snap.pages.map((p) => [p.file.name, p]));
    expect([...byName.keys()].sort()).toEqual(['Alpha', 'Start']);

    const alphaPage = byName.get('Alpha');
    expect(alphaPage.props.prio).toBe('3');
    expect(alphaPage.file.folder).toBe('Projekte');
    expect(alphaPage.file.path).toBe('Projekte/Alpha.md');
    expect(path.isAbsolute(alphaPage.file.absPath)).toBe(true);
    expect(alphaPage.file.size).toBeGreaterThan(0);
    expect(alphaPage.file.mtimeMs).toBeGreaterThan(0);

    // Link-Graph in beide Richtungen (Start -> Alpha, Alpha -> Start).
    const startPage = byName.get('Start');
    expect(startPage.file.outlinks.map((l) => l.name)).toEqual(['Alpha']);
    expect(alphaPage.file.inlinks.map((l) => l.name)).toEqual(['Start']);
    expect(alphaPage.file.outlinks.map((l) => l.name)).toEqual(['Start']);
    // Link-Ziele als absolute Index-Pfade (Klick-Pfad des Renderers).
    expect(startPage.file.outlinks[0].path).toBe(alphaPage.file.absPath);
  });

  it('blocks enthalten nur aktive Anker; verwaiste mdd-Einträge fehlen', () => {
    const snap = scriptDataFor(start, null);
    expect(snap.blocks).toHaveLength(1);
    const block = snap.blocks[0];
    expect(block.anchor).toBe('a1');
    expect(block.values).toEqual({ status: 'offen' });
    expect(block.file.name).toBe('Alpha');
    expect(block.file.path).toBe('Projekte/Alpha.md');
    expect(typeof block.updatedMs).toBe('number');
  });

  it('Snapshot ist strukturiert klonbar (IPC-/postMessage-Vertrag)', () => {
    const snap = scriptDataFor(start, null);
    expect(() => structuredClone(snap)).not.toThrow();
  });

  it('ohne Datei bzw. ohne Index: unavailable', () => {
    expect(scriptDataFor(null, null)).toEqual({ status: 'unavailable' });
    const fremd = path.join(os.tmpdir(), 'scg-md-scriptdata-fremd', 'Nie-indexiert.md');
    expect(scriptDataFor(fremd, null).status).toBe('unavailable');
  });
});

// 4T-002126 (Epic 3E-000345): Der Abzug trägt den Vorlagen-Ordner in der
// Schreibweise von file.folder; die Vorlagen selbst bleiben im Abzug, weil erst
// die Ausführungs-Umgebung die Quelle des Skripts kennt (Story 4S-000327).
describe('scriptDataFor — Vorlagen-Ordner im Abzug (4T-002126)', () => {
  it('trägt den Ordner wurzel-relativ und lässt die Vorlagen im Abzug', () => {
    const snap = scriptDataFor(start, null, path.join(root, 'Projekte'));
    expect(snap.templatesFolder).toBe('Projekte');
    expect(snap.pages.map((p) => p.file.name).sort()).toEqual(['Alpha', 'Start']);
    expect(snap.blocks).toHaveLength(1);
    expect(() => structuredClone(snap)).not.toThrow();
  });

  it('Unterordner mit Schrägstrich, die Wurzel selbst als leerer Ordner', () => {
    expect(scriptDataFor(start, null, path.join(root, 'Projekte', 'Unter')).templatesFolder).toBe(
      'Projekte/Unter',
    );
    expect(scriptDataFor(start, null, root).templatesFolder).toBe('');
  });

  it('außerhalb des Suchraums und als Präfix-Nachbar der Wurzel: kein Ordner', () => {
    const fremd = path.join(os.tmpdir(), 'scg-md-scriptdata-fremd-vorlagen');
    expect(scriptDataFor(start, null, fremd).templatesFolder).toBeNull();
    expect(scriptDataFor(start, null, `${root}2`).templatesFolder).toBeNull();
  });

  it('ohne gewählten Ordner oder im Aus-Zustand der Erweiterung: kein Ordner', () => {
    expect(scriptDataFor(start, null, null).templatesFolder).toBeNull();
    expect(scriptDataFor(start, null).templatesFolder).toBeNull();
  });
});
