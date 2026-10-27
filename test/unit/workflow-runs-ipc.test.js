// 4T-002350 (Epic 3E-000184): Der Lese-Kanal der Seite «Workflow-Läufe»
// (src/main/ipc/workflow-runs.js), Story 4S-001106, AK2 und AK6.
//
// Geprüft an echten Dateien im Temp-Verzeichnis: Workflow-Dateien, Begleitdateien
// mit dem Abschnitt `workflow`, geschrieben über den echten Schreibweg des
// Lauf-Stands (`createWorkflowRunState`, 4T-002348), damit Lesen und Schreiben
// dieselbe Form haben. Attrappe ist allein die Index-Sicht `workflowFilesFor`
// (am echten Index geprüft in workflow-files-index.test.js) samt dem
// ungespeicherten Stand eines Fensters (`bufferTextFor`).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  listWorkflowRuns,
  readRunState,
  registerWorkflowRunsIpc,
} = require('../../src/main/ipc/workflow-runs.js');
const { registerWorkflowsIpc } = require('../../src/main/ipc/workflows.js');
const { createWorkflowRunState } = require('../../src/main/workflows/workflow-run-state.js');

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const W = (name, ...zusatz) =>
  [
    '---',
    'workflow: true',
    `name: ${name}`,
    ...zusatz,
    '---',
    '',
    '```workflow',
    'notify "x"',
    '```',
    '',
  ].join('\n');

// Ein Bereich mit Dateien; `index` sind die relativen Pfade, die der Index als
// gekennzeichnet meldet.
function bereich(dateien, { index = Object.keys(dateien), puffer = {}, status = 'ready' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-laeufe-'));
  tmpDirs.push(root);
  for (const [rel, text] of Object.entries(dateien)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
  }
  const backlinks = {
    workflowFilesFor: (filePath, areaRoot) => {
      expect(filePath).toBe(null);
      expect(areaRoot).toBe(root);
      if (status !== 'ready') return { status, dateien: [] };
      return {
        status: 'ready',
        wurzel: root,
        dateien: index.map((rel) => ({ absPath: path.join(root, rel), relPath: rel })),
      };
    },
    bufferTextFor: (abs) => {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      return Object.prototype.hasOwnProperty.call(puffer, rel) ? puffer[rel] : null;
    },
  };
  const abs = (rel) => path.join(root, rel);
  return { root, backlinks, abs };
}

const schreibweg = (jetzt = Date.UTC(2026, 9, 23, 8, 15, 30)) =>
  createWorkflowRunState({
    mddSuspendedPaths: new Set(),
    mddKeyOf: (p) => p.toLowerCase(),
    notifyMddDefect: () => {},
    now: () => jetzt,
  });

describe('listWorkflowRuns', () => {
  it('listet alle Workflows des Bereichs mit Lauf-Stand, nach Name sortiert (AK2)', async () => {
    const b = bereich({
      'Workflows/Zeitplan.md': W('Zeitplan'),
      'Workflows/Anlegen.md': W('Anlegen', 'description: Legt an'),
      'Außerhalb/Knopf.md': W('Knopf'),
    });
    const weg = schreibweg();
    await weg.recordRun(null, b.abs('Workflows/Anlegen.md'), { status: 'ok' });
    await weg.recordRun(null, b.abs('Workflows/Anlegen.md'), {
      status: 'failed',
      line: 9,
      code: 'fileMissing',
    });
    const res = await listWorkflowRuns(b.root, b.backlinks);
    expect(res.ok).toBe(true);
    expect(res.status).toBe('ready');
    expect(res.workflows.map((w) => [w.name, w.relPath])).toEqual([
      ['Anlegen', 'Workflows/Anlegen.md'],
      ['Knopf', 'Außerhalb/Knopf.md'],
      ['Zeitplan', 'Workflows/Zeitplan.md'],
    ]);
    const [anlegen] = res.workflows;
    expect(anlegen).toMatchObject({
      description: 'Legt an',
      absPath: b.abs('Workflows/Anlegen.md'),
      runs: 2,
      lastRun: { at: '2026-10-23T08:15:30Z', status: 'failed', line: 9, code: 'fileMissing' },
      runStateDefect: false,
    });
  });

  it('ein nie gelaufener Workflow und eine Kopie ohne Begleitdatei stehen ohne Lauf (AK6)', async () => {
    const b = bereich({ 'Neu.md': W('Neu') });
    const res = await listWorkflowRuns(b.root, b.backlinks);
    expect(res.workflows).toEqual([
      {
        name: 'Neu',
        description: '',
        relPath: 'Neu.md',
        absPath: b.abs('Neu.md'),
        runs: 0,
        lastRun: null,
        runStateDefect: false,
      },
    ]);
  });

  it('eine defekte Begleitdatei meldet runStateDefect, der Workflow bleibt in der Liste', async () => {
    const b = bereich({ 'A.md': W('A'), 'A.mdd': '{kaputt' });
    const [eintrag] = (await listWorkflowRuns(b.root, b.backlinks)).workflows;
    expect(eintrag).toMatchObject({ name: 'A', runs: 0, lastRun: null, runStateDefect: true });
  });

  it('nimmt den ungespeicherten Stand vor der Platte und lässt eine nicht mehr gekennzeichnete Datei aus', async () => {
    const b = bereich(
      { 'A.md': W('Alt'), 'B.md': W('B') },
      { puffer: { 'A.md': W('Neu benannt'), 'B.md': '# kein Workflow mehr\n' } },
    );
    const res = await listWorkflowRuns(b.root, b.backlinks);
    expect(res.workflows.map((w) => w.name)).toEqual(['Neu benannt']);
  });

  it('eine nicht lesbare Datei bleibt mit ihrem Dateinamen stehen', async () => {
    const b = bereich({ 'Da.md': W('Da') }, { index: ['Da.md', 'Weg.md'] });
    const res = await listWorkflowRuns(b.root, b.backlinks);
    expect(res.workflows.map((w) => w.name)).toEqual(['Da', 'Weg']);
  });

  it('reicht den Index im Aufbau durch', async () => {
    const b = bereich({}, { status: 'indexing' });
    expect(await listWorkflowRuns(b.root, b.backlinks)).toEqual({
      ok: true,
      status: 'indexing',
      workflows: [],
    });
  });
});

describe('readRunState', () => {
  it('liest den Abschnitt workflow, ohne Begleitdatei nichts', async () => {
    const b = bereich({ 'A.md': W('A') });
    expect(await readRunState(b.abs('A.md'))).toEqual({ stand: null, defekt: false });
    await schreibweg().recordRun(null, b.abs('A.md'), { status: 'stopped', line: 7 });
    expect(await readRunState(b.abs('A.md'))).toEqual({
      stand: { runs: 1, lastRun: { at: '2026-10-23T08:15:30Z', status: 'stopped', line: 7 } },
      defekt: false,
    });
  });
});

describe('Kanal workflow:runs', () => {
  function kanal(b, { mitBereich = true } = {}) {
    const kanaele = new Map();
    registerWorkflowRunsIpc((k, fn) => kanaele.set(k, fn), {
      senderWindow: () => ({ id: 'Fenster' }),
      areaOfWindow: () => (mitBereich ? { rootPath: b.root } : null),
      backlinks: b.backlinks,
    });
    return kanaele;
  }

  it('antwortet mit den Workflows des Bereichs des Absenders', async () => {
    const b = bereich({ 'A.md': W('A') });
    const res = await kanal(b).get('workflow:runs')({});
    expect(res.workflows.map((w) => w.name)).toEqual(['A']);
  });

  it('ohne Bereich mit dem Code noArea', async () => {
    const b = bereich({});
    expect(await kanal(b, { mitBereich: false }).get('workflow:runs')({})).toEqual({
      ok: false,
      code: 'noArea',
    });
  });

  it('ein Fehler der Index-Sicht wird zum Code unexpected', async () => {
    const b = bereich({});
    b.backlinks.workflowFilesFor = () => {
      throw new Error('kaputt');
    };
    const fehler = console.error;
    console.error = () => {};
    try {
      expect(await kanal(b).get('workflow:runs')({})).toEqual({ ok: false, code: 'unexpected' });
    } finally {
      console.error = fehler;
    }
  });

  it('registerWorkflowsIpc meldet den Kanal mit an', () => {
    const kanaele = new Map();
    registerWorkflowsIpc((k, fn) => kanaele.set(k, fn), {
      senderWindow: () => null,
      areaOfWindow: () => null,
      getStore: () => null,
      windows: new Map(),
      backlinks: {},
      mddSuspendedPaths: new Set(),
      mddKeyOf: (p) => p,
      notifyMddDefect: () => {},
      workflowFolders: { folderListFor: async () => ({ ok: true }), onChange: () => {} },
    });
    expect(kanaele.has('workflow:runs')).toBe(true);
  });
});
