// 4T-002348 (Epic 3E-000184): Die Kanal-Gruppe der Workflows (src/main/ipc/
// workflows.js): fail-closed Prüfung der Nutzlast, Bereich des Absenders,
// Abbruch mitten im Lauf (AK6) und der Lauf-Stand über den Kanal.
//
// Bestands-Lesungen: Registrier-Funktion und Deps-Namen wie in main.js
// (`registriere`, `ipcDeps`); die Schritt-Form aus `prepareRun`
// (src/shared/workflows/workflow-placeholders.js). Die Schleife über die
// Schritte gehört zur Lauf-Steuerung (4T-002349); hier steht sie als kleine
// Nachbildung, damit AK6 an den echten Kanälen geprüft ist.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWorkflowsIpc } = require('../../src/main/ipc/workflows.js');
const { analyzeWorkflow, prepareRun } = require('../../src/shared/workflows/workflow-core.js');
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

// 4T-002352: `aus` ist die gespeicherte Aus-Liste der Erweiterungen; ohne sie
// gibt es keinen Speicher, und der Schalter gilt als eingeschaltet.
function welt({ mitBereich = true, aus = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-kanal-'));
  tmpDirs.push(root);
  const kanaele = new Map();
  const fenster = { id: 'Fenster' };
  registerWorkflowsIpc((kanal, fn) => kanaele.set(kanal, fn), {
    senderWindow: () => fenster,
    areaOfWindow: () => (mitBereich ? { rootPath: root, name: 'B' } : null),
    windows: new Map(),
    backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
    subpages,
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    renameSingleFile: async (von, nach) => {
      fs.renameSync(von, nach);
      return { ok: true };
    },
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
    ...(aus
      ? {
          getStore: () => ({
            get: (key) => (key === 'extensions.disabled' ? aus : undefined),
            onDidChange: () => () => {},
          }),
        }
      : {}),
  });
  const workflowPath = path.join(root, 'Workflows', 'Ablauf.md');
  const event = { sender: { id: 1 } };
  const rufe = (kanal, nutzlast) => kanaele.get(kanal)(event, nutzlast);
  return { root, kanaele, workflowPath, rufe };
}

const schritt = (keyword, args, extra = {}) => ({
  line: 3,
  blockLine: 1,
  keyword,
  args,
  source: null,
  position: null,
  ...extra,
});

describe('Kanäle', () => {
  it('registriert die drei Kanäle der Ausführung, die sechs des Workflow-Ordners und den der Läufe', () => {
    // 4T-002355: Die Kanäle des Workflow-Ordners meldet registerWorkflowsIpc mit
    // an (ipc/workflow-folder.js); geprüft werden sie in workflow-folder-ipc.test.js.
    // Teil 2 brachte workflow:setFolder, workflow:create und workflow:fileInfo;
    // 4T-002350 den Lese-Kanal workflow:runs (ipc/workflow-runs.js).
    expect([...welt().kanaele.keys()]).toEqual([
      'workflow:step',
      'workflow:bufferEditDone',
      'workflow:recordRun',
      'workflow:folderList',
      'workflow:getConfig',
      'workflow:setAreaConfig',
      'workflow:setFolder',
      'workflow:create',
      'workflow:fileInfo',
      'workflow:runs',
    ]);
  });
});

describe('workflow:step prüft die Nutzlast fail-closed', () => {
  it.each([
    ['keine Nutzlast', null],
    ['kein Schritt', {}],
    ['Zeile fehlt', { step: { ...schritt('mkdir', ['A']), line: undefined } }],
    ['unbekanntes Schlüsselwort', { step: schritt('delete', ['A']) }],
    ['Schritt der Fenster-Seite', { step: schritt('command', ['app.save']) }],
    ['zu wenige Argumente', { step: schritt('move', ['A']) }],
    ['falscher Typ', { step: schritt('mkdir', [7]) }],
    ['leerer Suchtext', { step: schritt('replace', ['a.md', ' ', 'x']) }],
    [
      'Quelle bei mkdir',
      { step: schritt('mkdir', ['A'], { source: { kind: 'file', path: 'x' } }) },
    ],
    ['append ohne Quelle', { step: schritt('append', ['a.md']) }],
    [
      'insert ohne Ort',
      { step: schritt('insert', ['a.md'], { source: { kind: 'section', name: 'S' } }) },
    ],
    [
      'unbekannte Quelle',
      { step: schritt('create', ['a.md'], { source: { kind: 'netz', path: 'x' } }) },
    ],
    ['Pfad zu lang', { step: schritt('mkdir', ['x'.repeat(5000)]) }],
  ])('%s: invalidStep, nichts geschieht', async (_name, nutzlast) => {
    const w = welt();
    const res = await w.rufe(
      'workflow:step',
      nutzlast ? { workflowPath: w.workflowPath, ...nutzlast } : null,
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('invalidStep');
    expect(fs.readdirSync(w.root)).toEqual([]);
  });

  it('ohne Bereich des Absenders: noArea', async () => {
    const w = welt({ mitBereich: false });
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A']),
    });
    expect(res).toMatchObject({ ok: false, line: 3, keyword: 'mkdir', code: 'noArea' });
  });

  it('eine Workflow-Datei außerhalb des Bereichs: outsideArea', async () => {
    const w = welt();
    const fremd = path.join(path.dirname(w.root), 'Fremd.md');
    const res = await w.rufe('workflow:step', {
      workflowPath: fremd,
      step: schritt('mkdir', ['A']),
    });
    expect(res.code).toBe('outsideArea');
  });

  it('ein gültiger Schritt trägt Zeile und Schlüsselwort im Ergebnis', async () => {
    const w = welt();
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A/B']),
    });
    expect(res).toEqual({
      ok: true,
      line: 3,
      keyword: 'mkdir',
      effect: { kind: 'folderCreated', paths: [path.join(w.root, 'A', 'B')], via: 'disk' },
    });
  });
});

describe('Abbruch mitten im Lauf (AK6)', () => {
  it('ein fehlgeschlagener Schritt beendet den Lauf mit Zeile und Grund; die Schritte davor bleiben', async () => {
    const w = welt();
    fs.mkdirSync(path.join(w.root, 'Workflows'));
    fs.writeFileSync(path.join(w.root, 'Belegt.md'), 'alt', 'utf8');
    const text = [
      '---',
      'workflow: true',
      '---',
      '```workflow',
      'mkdir "Projekt"',
      'create "Belegt.md"',
      'mkdir "Danach"',
      '```',
    ].join('\n');
    const analyse = analyzeWorkflow(text, { fileName: 'Ablauf.md' });
    const lauf = prepareRun(analyse.steps, { nowMs: 0 }, {}, {});
    expect(lauf.ok).toBe(true);
    const ergebnisse = [];
    for (const s of lauf.steps) {
      const res = await w.rufe('workflow:step', { workflowPath: w.workflowPath, step: s });
      ergebnisse.push(res);
      if (!res.ok) break;
    }
    expect(ergebnisse.map((r) => [r.ok, r.line, r.code || null])).toEqual([
      [true, 5, null],
      [false, 6, 'targetExists'],
    ]);
    expect(fs.existsSync(path.join(w.root, 'Projekt'))).toBe(true);
    expect(fs.existsSync(path.join(w.root, 'Danach'))).toBe(false);
    expect(fs.readFileSync(path.join(w.root, 'Belegt.md'), 'utf8')).toBe('alt');
  });
});

describe('workflow:recordRun und workflow:bufferEditDone', () => {
  it('hält den Lauf in der Begleitdatei fest', async () => {
    const w = welt();
    fs.mkdirSync(path.dirname(w.workflowPath));
    fs.writeFileSync(w.workflowPath, '# W\n', 'utf8');
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: { status: 'failed', line: 6, code: 'targetExists' },
    });
    expect(res).toEqual({ ok: true });
    const begleit = JSON.parse(
      fs.readFileSync(path.join(w.root, 'Workflows', 'Ablauf.mdd'), 'utf8'),
    );
    expect(begleit.workflow.runs).toBe(1);
    expect(begleit.workflow.lastRun).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'targetExists',
    });
  });

  it('weist einen ungültigen Lauf und einen fremden Ort ab', async () => {
    const w = welt();
    expect(
      await w.rufe('workflow:recordRun', { workflowPath: w.workflowPath, run: { status: 'x' } }),
    ).toEqual({
      ok: false,
      code: 'invalidStep',
    });
    const fremd = path.join(path.dirname(w.root), 'Fremd.md');
    expect(
      await w.rufe('workflow:recordRun', { workflowPath: fremd, run: { status: 'ok' } }),
    ).toEqual({
      ok: false,
      code: 'outsideArea',
    });
  });

  it('eine Antwort ohne offenen Auftrag wird verworfen', async () => {
    const w = welt();
    expect(await w.rufe('workflow:bufferEditDone', { requestId: 'nie', ok: true })).toEqual({
      ok: false,
    });
    expect(await w.rufe('workflow:bufferEditDone', null)).toEqual({ ok: false });
  });
});

// 4T-002352 (Story 4S-001108): Im Aus-Zustand der Erweiterung «Workflows» führt
// der Ausführungs-Kanal keinen Schritt aus (Muster der Kanäle der Datenbank-
// Maske und der Bücher). Gelesen wird der echte Schalter über den Speicher; der
// Lauf-Stand bleibt schreibbar, weil Abschalten nichts verlieren darf.
describe('Aus-Zustand der Erweiterung workflows', () => {
  it('workflow:step verweigert mit extensionOff, und nichts geschieht', async () => {
    const w = welt({ aus: ['workflows'] });
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A']),
    });
    expect(res).toEqual({ ok: false, line: 3, keyword: 'mkdir', code: 'extensionOff', detail: {} });
    expect(fs.readdirSync(w.root)).toEqual([]);
  });

  it('eingeschaltet über denselben Speicher läuft der Schritt (Gegenprobe)', async () => {
    const w = welt({ aus: ['templates'] });
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A']),
    });
    expect(res.ok).toBe(true);
    expect(fs.statSync(path.join(w.root, 'A')).isDirectory()).toBe(true);
  });

  it('der Lauf-Stand bleibt auch im Aus-Zustand schreibbar', async () => {
    const w = welt({ aus: ['workflows'] });
    fs.mkdirSync(path.dirname(w.workflowPath));
    fs.writeFileSync(w.workflowPath, '# W\n', 'utf8');
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: { status: 'failed', line: 6, code: 'extensionOff' },
    });
    expect(res).toEqual({ ok: true });
  });
});
