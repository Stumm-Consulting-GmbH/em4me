// 4T-002426 (Epic 3E-000366, Story 4S-001138): Die Workflows verknüpfter
// Bereiche im Hauptprozess — Quellen und Liste (workflow-linked-sources.js), die
// Liste des Workflow-Ordners samt Beobachtung (workflow-folder-service.js), die
// Seite «Workflow-Läufe» (ipc/workflow-runs.js), die Grenze der Schritt-Ziele
// (workflow-file-steps.js) und der Zeitplan-Prüfer (checks/workflow-schedule-check.js).
//
// Bereichsdateien, Workflow-Dateien und der Index sind echt (Temp-Verzeichnisse);
// Attrappen nur für Fenster, Beobachter und Lauf-Stand-Schreibweg.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mddStore = require('../../src/main/documents/mdd-store.js');
const {
  createLinkedWorkflowSources,
} = require('../../src/main/workflows/workflow-linked-sources.js');
const {
  createWorkflowFolderService,
} = require('../../src/main/workflows/workflow-folder-service.js');
const {
  listWorkflowRuns,
  registerWorkflowRunsIpc,
} = require('../../src/main/ipc/workflow-runs.js');
const { createWorkflowFileSteps } = require('../../src/main/workflows/workflow-file-steps.js');
const {
  createWorkflowScheduleChecker,
} = require('../../src/main/checks/workflow-schedule-check.js');
const backlinks = require('../../src/main/backlinks.js');

let tmpDirs = [];
const offeneWurzeln = new Set();
let dienst = null;

function neuerOrdner(name) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `scg-wf-${name}-`)));
  tmpDirs.push(dir);
  return dir;
}

function lege(root, rel, inhalt) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt, 'utf8');
  return abs;
}

function bereichsdatei(root, settings) {
  const container = mddStore.emptySettingsContainer();
  Object.assign(container.settings, settings);
  lege(root, mddStore.MDDA_FILENAME, mddStore.serializeContainer(container));
}

function workflowText(name, kopf = '') {
  return `---\nworkflow: true\nname: ${name}\n${kopf}---\n\n\`\`\`workflow\ncreate "${name}-Ergebnis.md"\n\`\`\`\n`;
}

function speicher(disabled = []) {
  const werte = { 'extensions.disabled': disabled };
  return { get: (k) => werte[k], onDidChange: () => {}, werte };
}

// Eigener Bereich A mit Workflow-Ordner, verknüpfter Bereich B mit eigenem.
function zweiBereiche({ workflows = true, bWorkflows = ['Fremd-Probe'] } = {}) {
  const a = neuerOrdner('a');
  const b = neuerOrdner('b');
  bereichsdatei(a, {
    workflows: { folder: 'Workflows' },
    areaLinks: [{ prefix: 'B', path: b, workflows }],
  });
  bereichsdatei(b, { workflows: { folder: 'Abläufe' } });
  lege(a, 'Workflows/Eigen.md', workflowText('Eigen'));
  const bPfade = bWorkflows.map((n) => lege(b, `Abläufe/${n}.md`, workflowText(n)));
  return { a, b, bPfade };
}

afterEach(() => {
  if (dienst) dienst.dispose();
  dienst = null;
  vi.useRealTimers();
  for (const root of offeneWurzeln) backlinks.releaseRoot(root);
  offeneWurzeln.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

describe('Quellen verknüpfter Bereiche (AK1 des Tasks, AK3 und AK5 der Story)', () => {
  let store;
  beforeEach(() => {
    store = speicher();
  });
  const quellen = () => createLinkedWorkflowSources({ getStore: () => store, mddStore });

  it('liest ohne Zustimmung nichts aus dem verknüpften Bereich', async () => {
    const { a } = zweiBereiche({ workflows: false });
    expect(await quellen().sources(a)).toEqual([]);
    expect(await quellen().list(a)).toEqual([]);
  });

  it('nimmt eine nicht streng boolesche Zustimmung als aus', async () => {
    const { a } = zweiBereiche({ workflows: 'true' });
    expect(await quellen().list(a)).toEqual([]);
  });

  it('liefert mit Zustimmung die Workflows der Quelle mit ihrem Kürzel', async () => {
    const { a, b, bPfade } = zweiBereiche();
    const liste = await quellen().list(a);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      key: 'B',
      name: path.basename(b),
      folder: path.join(b, 'Abläufe'),
    });
    expect(liste[0].workflows).toEqual([
      expect.objectContaining({
        name: 'Fremd-Probe',
        relPath: 'Fremd-Probe.md',
        absPath: bPfade[0],
        sourceKey: 'B',
        sourceName: path.basename(b),
      }),
    ]);
    expect(liste[0].items[0]).toMatchObject({ kind: 'workflow', sourceKey: 'B' });
  });

  it('übergeht eine nicht erreichbare oder ordnerlose Quelle still', async () => {
    const a = neuerOrdner('a');
    const ohneOrdner = neuerOrdner('c');
    bereichsdatei(ohneOrdner, {});
    const weg = path.join(os.tmpdir(), 'scg-wf-gibt-es-nicht', 'Bereich');
    bereichsdatei(a, {
      areaLinks: [
        { prefix: 'weg', path: weg, workflows: true },
        { prefix: 'leer', path: ohneOrdner, workflows: true },
      ],
    });
    expect(await quellen().list(a)).toEqual([]);
    // Eine Quelle mit festgelegtem, aber fehlendem Ordner fällt ebenso still weg.
    const ohneDateien = neuerOrdner('d');
    bereichsdatei(ohneDateien, { workflows: { folder: 'Fehlt' } });
    bereichsdatei(a, { areaLinks: [{ prefix: 'd', path: ohneDateien, workflows: true }] });
    expect(await quellen().sources(a)).toHaveLength(1);
    expect(await quellen().list(a)).toEqual([]);
  });

  it('zeigt bei ausgeschalteter Erweiterung «Bereichs-Verknüpfungen» nichts', async () => {
    const { a } = zweiBereiche();
    store = speicher(['area-links']);
    expect(await quellen().sources(a)).toEqual([]);
    expect(await quellen().list(a)).toEqual([]);
  });

  it('erkennt die Definition eines fremden Workflows, nie einen eigenen Pfad', async () => {
    const { a, b, bPfade } = zweiBereiche();
    const q = quellen();
    expect(await q.sourceFor(a, bPfade[0])).toMatchObject({ key: 'B' });
    expect(await q.sourceFor(a, path.join(b, 'Notiz.md'))).toBeNull();
    expect(await q.sourceFor(a, path.join(b, 'Abläufe'))).toBeNull();
    expect(await q.sourceFor(a, path.join(a, 'Workflows', 'Eigen.md'))).toBeNull();
    expect(await q.sourceFor(a, 'relativ.md')).toBeNull();
    store = speicher(['area-links']);
    expect(await q.sourceFor(a, bPfade[0])).toBeNull();
  });
});

function fenster(id, area) {
  return {
    area,
    gesendet: [],
    isDestroyed: () => false,
    webContents: {
      id,
      send(kanal) {
        this.owner.gesendet.push(kanal);
      },
      once: () => {},
    },
  };
}

describe('Liste des Workflow-Ordners mit verknüpften Bereichen (AK2)', () => {
  function aufbau(store, win) {
    win.webContents.owner = win;
    const beobachtet = [];
    dienst = createWorkflowFolderService({
      getStore: () => store,
      areaOfWindow: (w) => (w && w.area ? w.area : null),
      windows: new Map([[win.webContents.id, win]]),
      mddStore,
      buendelMs: 5,
      watchFolder: (folder) => {
        const watcher = new EventEmitter();
        watcher.folder = folder;
        watcher.close = async () => {};
        beobachtet.push(watcher);
        return watcher;
      },
    });
    return beobachtet;
  }

  it('trägt die fremden Workflows getrennt von den eigenen und beobachtet ihren Ordner', async () => {
    const { a, b } = zweiBereiche();
    const win = fenster(1, { rootPath: a, name: 'A' });
    const beobachtet = aufbau(speicher(), win);
    const liste = await dienst.folderListFor(win);
    expect(liste.workflows.map((w) => w.name)).toEqual(['Eigen']);
    expect(liste.linked.map((q) => [q.key, q.workflows.map((w) => w.name)])).toEqual([
      ['B', ['Fremd-Probe']],
    ]);
    expect(beobachtet.map((w) => w.folder).sort()).toEqual(
      [path.join(a, 'Workflows'), path.join(b, 'Abläufe')].sort(),
    );
    // Eine Änderung im Ordner der Quelle meldet das Fenster.
    beobachtet.find((w) => w.folder === path.join(b, 'Abläufe')).emit('all', 'add');
    await vi.waitFor(() => expect(win.gesendet).toContain('workflow:folderChanged'));
  });

  it('liefert ohne Zustimmung und im Aus-Zustand keine fremden Workflows', async () => {
    const { a } = zweiBereiche({ workflows: false });
    const win = fenster(2, { rootPath: a, name: 'A' });
    aufbau(speicher(), win);
    expect((await dienst.listForWindow(win)).linked).toEqual([]);
    const { a: a2 } = zweiBereiche();
    const win2 = fenster(3, { rootPath: a2, name: 'A2' });
    aufbau(speicher(['area-links']), win2);
    expect((await dienst.listForWindow(win2)).linked).toEqual([]);
    aufbau(speicher(['workflows']), win2);
    expect((await dienst.listForWindow(win2)).linked).toEqual([]);
  });

  it('meldet über linkedSourceFor allein zugestimmte Definitionen', async () => {
    const { a, bPfade } = zweiBereiche();
    const win = fenster(4, { rootPath: a, name: 'A' });
    aufbau(speicher(), win);
    expect(await dienst.linkedSourceFor(a, bPfade[0])).toMatchObject({ key: 'B' });
  });
});

describe('Seite «Workflow-Läufe» mit fremden Workflows (AK2, AK4)', () => {
  it('führt fremde Workflows nach den eigenen, ohne Lauf-Stand', async () => {
    const { a, bPfade } = zweiBereiche();
    // Ein Lauf-Stand im fremden Bereich wird weder gelesen noch gezeigt.
    fs.writeFileSync(bPfade[0].replace(/\.md$/, '.mdd'), '{"kaputt"', 'utf8');
    const quellen = createLinkedWorkflowSources({ getStore: () => speicher(), mddStore });
    const index = {
      workflowFilesFor: () => ({
        status: 'ready',
        dateien: [
          { absPath: path.join(a, 'Workflows', 'Eigen.md'), relPath: 'Workflows/Eigen.md' },
        ],
      }),
      bufferTextFor: () => null,
    };
    const res = await listWorkflowRuns(a, index, { linked: await quellen.list(a) });
    expect(res.workflows.map((w) => [w.name, !!w.foreign])).toEqual([
      ['Eigen', false],
      ['Fremd-Probe', true],
    ]);
    expect(res.workflows[1]).toMatchObject({
      sourceKey: 'B',
      runs: 0,
      lastRun: null,
      runStateDefect: false,
      absPath: bPfade[0],
    });
  });

  it('der Kanal liest die zugestimmten Quellen des sendenden Fensters', async () => {
    const { a } = zweiBereiche();
    const handler = {};
    registerWorkflowRunsIpc((kanal, fn) => (handler[kanal] = fn), {
      senderWindow: () => ({}),
      areaOfWindow: () => ({ rootPath: a }),
      backlinks: { workflowFilesFor: () => ({ status: 'ready', dateien: [] }) },
      getStore: () => speicher(),
      mddStore,
    });
    const res = await handler['workflow:runs']({});
    expect(res.workflows.map((w) => [w.name, w.sourceKey])).toEqual([['Fremd-Probe', 'B']]);
  });
});

describe('Lauf eines fremden Workflows: Schritt-Ziele bleiben in der eigenen Wurzel (AK3, AK4)', () => {
  function schritte() {
    return createWorkflowFileSteps({
      isMarkdownPath: (p) => p.endsWith('.md'),
      cascade: {},
      renameSingleFile: async () => ({ ok: true }),
      sendBookStateForDirs: () => {},
      applyLinkUpdatesForRename: async () => {},
      renamesFromPairs: () => [],
      broadcast: () => {},
    });
  }

  it('legt die Datei eines fremden Workflows in der eigenen Wurzel an, nie in der Quelle', async () => {
    const { a, b, bPfade } = zweiBereiche();
    const ctx = {
      root: a,
      owner: null,
      workflowAbs: bPfade[0],
      backlinks: { bufferTextFor: () => null },
    };
    const step = { line: 7, keyword: 'create', args: ['Fremd-Probe-Ergebnis.md'], source: null };
    const res = await schritte().runFileStep(ctx, step);
    expect(res.ok).toBe(true);
    expect(fs.existsSync(path.join(a, 'Fremd-Probe-Ergebnis.md'))).toBe(true);
    expect(fs.existsSync(path.join(b, 'Fremd-Probe-Ergebnis.md'))).toBe(false);
  });

  it('weist ein Schritt-Ziel in der Quelle mit outsideArea ab', async () => {
    const { a, b, bPfade } = zweiBereiche();
    const ctx = {
      root: a,
      owner: null,
      workflowAbs: bPfade[0],
      backlinks: { bufferTextFor: () => null },
    };
    for (const ziel of [
      path.join(b, 'Eindringling.md'),
      `../${path.basename(b)}/Eindringling.md`,
    ]) {
      const step = { line: 3, keyword: 'create', args: [ziel], source: null };
      const res = await schritte().runFileStep(ctx, step);
      expect(res, ziel).toMatchObject({ ok: false, code: 'outsideArea' });
    }
    expect(fs.existsSync(path.join(b, 'Eindringling.md'))).toBe(false);
  });
});

describe('Zeitplan-Prüfer sieht keine fremden Workflows (Abgrenzung der Story)', () => {
  it('stellt einen scharfen, fälligen Workflow der Quelle nie zu', async () => {
    const a = neuerOrdner('a');
    const b = neuerOrdner('b');
    bereichsdatei(b, { workflows: { folder: 'Abläufe' } });
    bereichsdatei(a, { areaLinks: [{ prefix: 'B', path: b, workflows: true }] });
    const start = lege(a, 'Start.md', 'Einstieg.');
    const fremd = lege(
      b,
      'Abläufe/Zeitplan.md',
      workflowText('Zeitplan', 'trigger: schedule\nschedule: every 30 minutes\n'),
    );
    // Der eigene Index ist bereit; die Quelle ist zugestimmt und gelistet.
    let r = backlinks.backlinksFor(start, 'test:workflow-linked', a);
    offeneWurzeln.add(backlinks.rootForActiveFile(start, a));
    for (let i = 0; i < 500 && r.status === 'indexing'; i++) {
      await new Promise((res) => setTimeout(res, 10));
      r = backlinks.backlinksFor(start, 'test:workflow-linked', a);
    }
    const quellen = createLinkedWorkflowSources({ getStore: () => speicher(), mddStore });
    expect((await quellen.list(a))[0].workflows[0].absPath).toBe(fremd);

    const gelesen = [];
    const zugestellt = [];
    const pruefer = createWorkflowScheduleChecker({
      areas: () => [{ root: a }],
      workflowFiles: (root) => backlinks.workflowFilesFor(null, root),
      readText: async (abs) => {
        gelesen.push(abs);
        return fs.readFileSync(abs, 'utf8');
      },
      // Wäre der fremde Workflow in der Sicht, wäre er scharf und fällig.
      readRunState: async () => ({
        stand: { armed: { at: 'x', hash: 'egal' }, nextDue: '2000-01-01T00:00:00' },
        defekt: false,
      }),
      runState: {
        setNextDue: async () => ({ ok: true }),
        recordSkipped: async () => ({ ok: true }),
      },
      enabled: () => true,
      deliver: (payload) => zugestellt.push(payload),
      claimDelivery: () => true,
      releaseDelivery: () => {},
      windowAlive: () => true,
      now: () => new Date(2026, 9, 28, 12, 0),
    });
    await pruefer.checkNewAreas();
    await pruefer.tick();
    expect(backlinks.workflowFilesFor(null, a).status).toBe('ready');
    expect(gelesen).not.toContain(fremd);
    expect(zugestellt).toEqual([]);
  });
});
