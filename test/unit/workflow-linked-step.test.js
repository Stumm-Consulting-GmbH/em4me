// 4T-002426 (Epic 3E-000366, Story 4S-001138, AK3 und AK4 des Tasks): Der
// Schritt-Kanal der Workflows (src/main/ipc/workflows.js) mit der Definition eines
// Workflows aus einem zugestimmten verknüpften Bereich.
//
// **Die Grenze** (Entscheidungen 2h und 1f, Präzisierung der Steuerung vom
// 2026-10-28): Fremd zugelassen ist allein die DEFINITION, also der Pfad der
// Workflow-Datei, und nur im Schritt-Kanal. Jedes Schritt-Ziel prüft der Kanal
// weiter gegen die eigene Bereichs-Wurzel; ein Ziel in der Quelle bleibt ein
// `outsideArea`. Den Lauf-Stand nimmt `workflow:recordRun` für einen fremden
// Pfad nie an — im fremden Bereich wird nichts geschrieben.
//
// Echt sind Kanäle, Bereichsdateien und Dateien (Temp-Verzeichnisse); Muster
// der Kanal-Welt aus workflow-ipc.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWorkflowsIpc } = require('../../src/main/ipc/workflows.js');
const mddStore = require('../../src/main/documents/mdd-store.js');
const subpages = require('../../src/shared/subpages.js');

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

function ordner(name) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `em4me-wf-${name}-`)));
  tmpDirs.push(dir);
  return dir;
}

function bereichsdatei(root, settings) {
  const container = mddStore.emptySettingsContainer();
  Object.assign(container.settings, settings);
  fs.writeFileSync(
    path.join(root, mddStore.MDDA_FILENAME),
    mddStore.serializeContainer(container),
    'utf8',
  );
}

// A ist der Bereich des Fensters, B die Quelle mit dem Workflow.
function welt({ zustimmung = true, aus = [] } = {}) {
  // 4T-002424: Papierkorb als Attrappe; er hält fest, was er hätte löschen sollen.
  const papierkorb = [];
  const a = ordner('a');
  const b = ordner('b');
  bereichsdatei(b, { workflows: { folder: 'Abläufe' } });
  bereichsdatei(a, { areaLinks: [{ prefix: 'B', path: b, workflows: zustimmung }] });
  fs.mkdirSync(path.join(b, 'Abläufe'));
  const workflowPath = path.join(b, 'Abläufe', 'Fremd.md');
  fs.writeFileSync(
    workflowPath,
    '---\nworkflow: true\nname: Fremd\n---\n\n```workflow\ncreate "Ergebnis.md"\n```\n\n## Text\n\nAus der Quelle.\n',
    'utf8',
  );
  const kanaele = new Map();
  const fenster = { id: 'Fenster' };
  registerWorkflowsIpc((kanal, fn) => kanaele.set(kanal, fn), {
    senderWindow: () => fenster,
    areaOfWindow: () => ({ rootPath: a, name: 'A' }),
    windows: new Map(),
    backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
    subpages,
    mddStore,
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    renameSingleFile: async () => ({ ok: true }),
    sendBookStateForDirs: async () => {},
    renamesFromPairs: (paare) => paare,
    applyLinkUpdatesForRename: async () => ({ updated: [], failed: [] }),
    broadcast: () => {},
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    mddSuspendedPaths: new Set(),
    mddKeyOf: (p) => p.toLowerCase(),
    notifyMddDefect: () => {},
    trashItem: async (p) => {
      papierkorb.push(p);
      fs.rmSync(p, { recursive: true, force: true });
    },
    getStore: () => ({
      get: (key) => (key === 'extensions.disabled' ? aus : undefined),
      onDidChange: () => () => {},
    }),
  });
  const rufe = (kanal, nutzlast) => kanaele.get(kanal)({ sender: { id: 1 } }, nutzlast);
  return { a, b, workflowPath, rufe, papierkorb };
}

const anlegen = (ziel, source = null) => ({
  line: 6,
  blockLine: 1,
  keyword: 'create',
  args: [ziel],
  source,
});

describe('Schritt-Kanal mit der Definition aus einer zugestimmten Quelle', () => {
  it('nimmt die Definition an; das Ziel entsteht in der eigenen Wurzel', async () => {
    const w = welt();
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: anlegen('Ergebnis.md'),
    });
    expect(res).toMatchObject({ ok: true, keyword: 'create' });
    expect(fs.existsSync(path.join(w.a, 'Ergebnis.md'))).toBe(true);
    expect(fs.existsSync(path.join(w.b, 'Ergebnis.md'))).toBe(false);
    expect(fs.existsSync(path.join(w.b, 'Abläufe', 'Ergebnis.md'))).toBe(false);
  });

  it('liest einen Abschnitt der Definition aus der Quelle (from-section)', async () => {
    const w = welt();
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: anlegen('Aus-Abschnitt.md', { kind: 'section', name: 'Text' }),
    });
    expect(res).toMatchObject({ ok: true });
    expect(fs.readFileSync(path.join(w.a, 'Aus-Abschnitt.md'), 'utf8')).toContain(
      'Aus der Quelle.',
    );
  });

  it('weist ein Schritt-Ziel in der Quelle ab (outsideArea), absolut wie relativ', async () => {
    const w = welt();
    for (const ziel of [
      path.join(w.b, 'Eindringling.md'),
      `../${path.basename(w.b)}/Eindringling.md`,
    ]) {
      const res = await w.rufe('workflow:step', {
        workflowPath: w.workflowPath,
        step: anlegen(ziel),
      });
      expect(res, ziel).toMatchObject({ ok: false, code: 'outsideArea' });
    }
    expect(fs.existsSync(path.join(w.b, 'Eindringling.md'))).toBe(false);
  });

  it('nimmt ohne Zustimmung und bei ausgeschalteter Erweiterung nichts an', async () => {
    for (const w of [welt({ zustimmung: false }), welt({ aus: ['area-links'] })]) {
      const res = await w.rufe('workflow:step', {
        workflowPath: w.workflowPath,
        step: anlegen('Ergebnis.md'),
      });
      expect(res).toMatchObject({ ok: false, code: 'outsideArea' });
      expect(fs.existsSync(path.join(w.a, 'Ergebnis.md'))).toBe(false);
    }
  });

  it('nimmt eine Datei der Quelle außerhalb ihres Workflow-Ordners nicht an', async () => {
    const w = welt();
    const daneben = path.join(w.b, 'Daneben.md');
    fs.writeFileSync(daneben, '---\nworkflow: true\n---\n', 'utf8');
    const res = await w.rufe('workflow:step', { workflowPath: daneben, step: anlegen('X.md') });
    expect(res).toMatchObject({ ok: false, code: 'outsideArea' });
  });

  it('schreibt für einen fremden Workflow keinen Lauf-Stand, weder in B noch in A', async () => {
    const w = welt();
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: { status: 'ok', startedAt: Date.UTC(2026, 9, 28, 9, 0, 0) },
    });
    expect(res).toMatchObject({ ok: false, code: 'outsideArea' });
    expect(fs.readdirSync(path.join(w.b, 'Abläufe'))).toEqual(['Fremd.md']);
    expect(fs.readdirSync(w.a)).toEqual([mddStore.MDDA_FILENAME]);
  });
});

// Die Pflege-Befehle aus 4T-002424 (`workflow-maintenance-steps.js`): Auch sie
// lösen jedes Ziel gegen die eigene Wurzel auf, nie gegen die Quelle und nie
// gegen den Ort der Definition (`ctx.workflowAbs`).
describe('Pflege-Befehle eines fremden Workflows bleiben in der eigenen Wurzel', () => {
  const schritt = (keyword, args) => ({ line: 4, blockLine: 1, keyword, args, source: null });

  it('delete weist jedes Ziel in der Quelle ab, auch die Definition selbst', async () => {
    const w = welt();
    const notiz = path.join(w.b, 'Notiz.md');
    fs.writeFileSync(notiz, '# Notiz\n', 'utf8');
    const name = path.basename(w.b);
    for (const ziel of [
      notiz,
      `../${name}/Notiz.md`,
      w.workflowPath,
      `../${name}/Abläufe/Fremd.md`,
    ]) {
      const res = await w.rufe('workflow:step', {
        workflowPath: w.workflowPath,
        step: schritt('delete', [ziel]),
      });
      expect(res, ziel).toMatchObject({ ok: false, code: 'outsideArea' });
    }
    expect(w.papierkorb).toEqual([]);
    expect(fs.existsSync(notiz)).toBe(true);
    expect(fs.existsSync(w.workflowPath)).toBe(true);
  });

  it('delete löst einen relativen Pfad in der eigenen Wurzel auf, nicht neben der Definition', async () => {
    const w = welt();
    // «Fremd.md» liegt nur neben der Definition in der Quelle: in A gibt es sie nicht.
    const daneben = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('delete', ['Fremd.md']),
    });
    expect(daneben).toMatchObject({ ok: false, code: 'targetMissing' });
    expect(fs.existsSync(w.workflowPath)).toBe(true);
    const eigene = path.join(w.a, 'Weg.md');
    fs.writeFileSync(eigene, 'x', 'utf8');
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('delete', ['Weg.md']),
    });
    expect(res).toMatchObject({ ok: true });
    expect(w.papierkorb).toEqual([eigene]);
  });

  it('complete-task weist ein Ziel in der Quelle ab und sucht relativ in der eigenen Wurzel', async () => {
    const w = welt();
    const liste = path.join(w.b, 'Aufgaben.md');
    fs.writeFileSync(liste, '- [ ] Probe\n', 'utf8');
    for (const ziel of [liste, `../${path.basename(w.b)}/Aufgaben.md`, w.workflowPath]) {
      const res = await w.rufe('workflow:step', {
        workflowPath: w.workflowPath,
        step: schritt('complete-task', [ziel, 'Probe']),
      });
      expect(res, ziel).toMatchObject({ ok: false, code: 'outsideArea' });
    }
    const relativ = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('complete-task', ['Aufgaben.md', 'Probe']),
    });
    expect(relativ).toMatchObject({ ok: false, code: 'targetMissing' });
    expect(fs.readFileSync(liste, 'utf8')).toBe('- [ ] Probe\n');
  });
});
