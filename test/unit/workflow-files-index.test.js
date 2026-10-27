// 4T-002347 (Epic 3E-000184): Die Workflow-Dateien eines Bereichs aus dem Index (AK7).
//
// Geprüft wird die Sicht des Hauptprozesses am **echten Index** über ein
// Temp-Verzeichnis (Muster `eigenschafts-werte.test.js`), weil die Annahme,
// dass das Kennzeichen in `entry.propertiesPerFile` als `'true'` liegt, genau
// das ist, was hier zu belegen war. Gelesen wird über die Fassade
// `src/main/backlinks.js`, damit Aufbau und Sicht dieselbe Modul-Instanz sehen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  releaseRoot,
  rootForActiveFile,
  workflowFilesFor,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-workflows-'));
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
  let result = backlinksFor(activeFile, 'test:workflow-files', null);
  openRoots.add(rootForActiveFile(activeFile, null));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, 'test:workflow-files', null);
  }
  return result;
}

const BLOCK = '```workflow\nwait 1\n```\n';

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
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

describe('Workflow-Dateien eines Bereichs (AK7)', () => {
  it('findet die gekennzeichneten Dateien, sortiert und wurzel-relativ', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', 'Einstieg.');
    write(root, 'Workflows/Z-Abschluss.md', `---\nworkflow: true\n---\n${BLOCK}`);
    write(root, 'Workflows/A-Start.md', `---\nworkflow: "true"\nname: Start\n---\n${BLOCK}`);
    write(root, 'Ohne-Block.md', '---\nworkflow: true\n---\nNur Text.\n');
    write(root, 'Nein.md', `---\nworkflow: false\n---\n${BLOCK}`);
    write(root, 'Kein-Kopf.md', BLOCK);
    write(root, 'Anderes.md', '---\nstatus: offen\n---\nText.');
    await indexFor(start);
    const r = workflowFilesFor(start, null);
    expect(r.status).toBe('ready');
    expect(r.wurzel).toBe(rootForActiveFile(start, null));
    expect(r.dateien.map((d) => d.relPath)).toEqual([
      'Ohne-Block.md',
      'Workflows/A-Start.md',
      'Workflows/Z-Abschluss.md',
    ]);
    expect(r.dateien[1].absPath).toBe(path.join(root, 'Workflows', 'A-Start.md'));
  });

  it('liefert eine leere Liste, wenn kein Workflow da ist', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', 'Einstieg.');
    await indexFor(start);
    expect(workflowFilesFor(start, null)).toMatchObject({ status: 'ready', dateien: [] });
  });

  it('reicht fehlende Angaben und einen unbekannten Bereich als unavailable durch', () => {
    expect(workflowFilesFor(null, null)).toEqual({ status: 'unavailable', dateien: [] });
    const fremd = path.join(os.tmpdir(), 'em4me-workflows-gibtsnicht', 'x.md');
    expect(workflowFilesFor(fremd, null).status).toBe('unavailable');
  });
});
