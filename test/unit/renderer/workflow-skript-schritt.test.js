// @vitest-environment jsdom
// 4T-002465 (Epic 3E-000367, Story 4S-001149): Der Skript-Schritt eines
// Workflows im Ablauf-Kern und im Fenster.
//
// Geprüft werden mit einer Attrappe der Sandbox: das Ergebnis von `script … as`
// in folgenden Argumenten (AK1), die Bedingung `if-script` mit `else` (AK2),
// Fehler, Zeitüberschreitung und Schreibversuch als Fehlschlag des Schritts an
// seiner Zeile (AK3), die Einstellung unmittelbar vor dem Skript (AK7 der
// Story) und der Weg des Fensters vom Start bis zur Sandbox. Dass die Sandbox
// selbst keinen Schreibweg hat, belegt test/unit/script-sandbox-runtime.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import { analyzeWorkflow } from '../../../src/shared/workflows/workflow-core.js';
import { prepareRun } from '../../../src/shared/workflows/workflow-placeholders.js';
import {
  runWorkflow,
  scriptResultText,
  scriptResultTrue,
} from '../../../src/shared/workflows/workflow-runner.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

let skripteAn = true;
vi.mock('../../../src/renderer/modules/query/perspective-script-view.js', () => ({
  isPerspectiveScriptsEnabled: () => skripteAn,
}));
const runInScriptSandbox = vi.fn();
vi.mock('../../../src/renderer/modules/query/script-sandbox-lauf.js', async (orig) => ({
  ...(await orig()),
  runInScriptSandbox: (...a) => runInScriptSandbox(...a),
}));
// Die Prüfung des Fensters mit der Einstellung als Eingabe, wie sie die Stelle
// liefert, die den Prüfer im Fenster aufruft.
vi.mock('../../../src/renderer/modules/workflows/workflow-pruefung.js', async (orig) => ({
  ...(await orig()),
  pruefeWorkflow: (text, o = {}) =>
    analyzeWorkflow(text, { fileName: o.fileName, scriptsEnabled: skripteAn }),
  aktuelleRueckfragen: () => ({}),
}));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: async () => ({}),
  folderDisplayFor: () => '',
  templateDocumentContext: () => ({ file: '', area: 'Bereich' }),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-window.js', () => ({
  bestaetigeLoeschZiele: async () => true,
  frageJaNein: async () => true,
  schliesseVorDemLoeschen: async () => true,
  flushPendingBuffers: async () => {},
  runWindowAction: async (a) => ({ ok: true, line: a.line, keyword: a.keyword, effect: {} }),
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => ({ workflows: [] }),
}));
vi.mock('../../../src/renderer/modules/task-query-actions.js', () => ({
  findOpenTab: () => null,
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [] }));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { panes: [{ activeIndex: 0, tabs: [] }], areaPath: 'C:/b' },
  activeTab: () => null,
}));

let abzug = { status: 'ready', pages: [], blocks: [] };
const schritte = [];
Object.assign(window.api, {
  dirname: (p) => p.slice(0, p.lastIndexOf('/')),
  readFile: async () => ({ ok: false, error: 'ENOENT' }),
  getPerspectiveScriptData: vi.fn(async () => abzug),
  workflowStep: async (pfad, step) => {
    schritte.push(step);
    return { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } };
  },
  workflowRecordRun: async () => ({ ok: true }),
});

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { skriptLauf, starteWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-start.js');

const FENCE = '```';
const ABSCHNITTE = [
  '## Zählen',
  `${FENCE}perspective-script`,
  'return 2;',
  FENCE,
  '## Leer',
  `${FENCE}perspective-script`,
  'return "";',
  FENCE,
];
const text = (zeilen) =>
  [
    '---',
    'workflow: true',
    'name: Probe',
    '---',
    `${FENCE}workflow`,
    ...zeilen,
    FENCE,
    '',
    ...ABSCHNITTE,
    '',
  ].join('\n');
// Erste Befehls-Zeile im Dokument (Kopf vier Zeilen, Zaun in Zeile 5).
const Z = 6;

// Vorbereiteter Plan aus Prüfen und Füllen, wie der Start ihn baut.
function plan(zeilen) {
  const analyse = analyzeWorkflow(text(zeilen), { scriptsEnabled: true });
  expect(analyse.findings).toEqual([]);
  const gefuellt = prepareRun(analyse.steps, { nowMs: 0 }, {}, {});
  expect(gefuellt.ok).toBe(true);
  return { path: 'C:/b/Probe.md', name: 'Probe', steps: gefuellt.steps, children: {} };
}

// Abhängigkeiten des Kerns mit einer Attrappe der Sandbox je Quelltext.
function deps(antworten) {
  const meldungen = [];
  const quellen = [];
  return {
    meldungen,
    quellen,
    step: async (p, s) => ({ ok: true, line: s.line, keyword: s.keyword, effect: {} }),
    runWindowAction: async (a) => a,
    flushBuffers: async () => {},
    executeCommand: () => true,
    runMacro: async () => ({ ok: true }),
    sleep: async () => {},
    confirm: async () => true,
    notify: (t) => meldungen.push(t),
    runScript: vi.fn(async (source, ort) => {
      quellen.push({ source, ort });
      const a = antworten[source];
      if (a instanceof Error) throw a;
      return a;
    }),
  };
}

describe('Ablauf-Kern: script … as und {{script:name}} (AK1)', () => {
  it('reicht das Ergebnis an jedes folgende Argument weiter', async () => {
    const d = deps({ 'return 2;': { ok: true, value: 2 } });
    const p = plan(['script "Zählen" as "offen"', 'notify "Offen: {{script:offen}}"']);
    expect(await runWorkflow(p, d)).toEqual({ status: 'ok' });
    expect(d.meldungen).toEqual(['Offen: 2']);
    expect(d.quellen).toEqual([{ source: 'return 2;', ort: { path: 'C:/b/Probe.md', line: Z } }]);
  });

  it('wandelt das Ergebnis in Text: Zahl, Wahrheitswert, null', () => {
    expect([2, 0, true, false, null, 'x', NaN].map(scriptResultText)).toEqual([
      '2',
      '0',
      'true',
      'false',
      '',
      'x',
      '',
    ]);
  });
});

describe('Ablauf-Kern: if-script (AK2)', () => {
  const zeilen = ['if-script "Zählen"', 'notify "ja"', 'else', 'notify "nein"', 'end'];

  it.each([
    [true, 'ja'],
    ['3', 'ja'],
    [2, 'ja'],
    ['', 'nein'],
    ['   ', 'nein'],
    [false, 'nein'],
    [0, 'nein'],
    [null, 'nein'],
  ])('Ergebnis %j führt in den Zweig «%s»', async (value, zweig) => {
    const d = deps({ 'return 2;': { ok: true, value } });
    expect(await runWorkflow(plan(zeilen), d)).toEqual({ status: 'ok' });
    expect(d.meldungen).toEqual([zweig]);
  });

  it('ist wahr genau bei true, nicht leerem Text und Zahl ungleich null', () => {
    expect(scriptResultTrue('false')).toBe(true);
    expect(scriptResultTrue(undefined)).toBe(false);
  });
});

describe('Ablauf-Kern: Fehlschlag des Schritts (AK3)', () => {
  const zeilen = ['notify "vorher"', 'script "Zählen" as "n"', 'notify "nachher"'];

  it.each([
    [{ ok: false, code: 'scriptFailed', detail: { message: 'pq.write is not a function' } }],
    [{ ok: false, code: 'scriptTimeout', detail: { seconds: 5 } }],
    [{ ok: false, code: 'scriptsDisabled', detail: {} }],
  ])('%j beendet den Lauf an der Zeile des Schritts', async (antwort) => {
    const d = deps({ 'return 2;': antwort });
    const ergebnis = await runWorkflow(plan(zeilen), d);
    expect(ergebnis).toMatchObject({ status: 'failed', line: Z + 1, code: antwort.code });
    expect(ergebnis.detail).toEqual(antwort.detail);
    expect(d.meldungen).toEqual(['vorher']);
  });

  it('eine unbekannte Antwort, ein fremder Code und eine Ausnahme sind Fehlschläge', async () => {
    const p = plan(zeilen);
    expect((await runWorkflow(p, deps({ 'return 2;': undefined }))).code).toBe('scriptFailed');
    const fremd = { ok: false, code: 'commandFailed' };
    expect((await runWorkflow(p, deps({ 'return 2;': fremd }))).code).toBe('scriptFailed');
    const ausnahme = deps({ 'return 2;': new Error('kaputt') });
    expect(await runWorkflow(p, ausnahme)).toMatchObject({ code: 'unexpected', line: Z + 1 });
    const ohne = deps({});
    delete ohne.runScript;
    expect((await runWorkflow(p, ohne)).code).toBe('unexpected');
  });

  it('ein Ergebnis aus einem nicht gelaufenen Zweig ist ein Fehlschlag', async () => {
    const d = deps({
      'return 2;': { ok: true, value: false },
      'return "";': { ok: true, value: 1 },
    });
    const p = plan(['if-script "Zählen"', 'script "Leer" as "x"', 'end', 'notify "{{script:x}}"']);
    expect(await runWorkflow(p, d)).toMatchObject({
      status: 'failed',
      line: Z + 3,
      code: 'scriptResultMissing',
      detail: { name: 'x' },
    });
  });

  it('läuft in einer Schleife je Datei mit {{item}} und dem Ergebnis', async () => {
    const d = deps({ 'return 2;': { ok: true, value: 'n' } });
    d.step = async (p, s) => ({
      ok: true,
      line: s.line,
      keyword: s.keyword,
      files: ['b.md', 'a.md'],
    });
    const p = plan([
      'for-each "Ordner/*.md"',
      'script "Zählen" as "z"',
      'notify "{{item}} {{script:z}}"',
      'end',
    ]);
    expect(await runWorkflow(p, d)).toEqual({ status: 'ok' });
    expect(d.meldungen).toEqual(['a.md n', 'b.md n']);
  });
});

describe('Fenster: skriptLauf und Start (AK1, AK3, AK7)', () => {
  beforeEach(() => {
    skripteAn = true;
    abzug = { status: 'ready', pages: [], blocks: [] };
    runInScriptSandbox.mockReset();
    showStatusbarHint.mockReset();
    schritte.length = 0;
  });

  it('nutzt die Sandbox mit dem Daten-Abzug der Workflow-Datei', async () => {
    runInScriptSandbox.mockResolvedValue({ type: 'result', output: [], value: 2 });
    expect(await skriptLauf('return 2;', { path: 'C:/b/Probe.md', line: 6 })).toEqual({
      ok: true,
      value: 2,
    });
    expect(window.api.getPerspectiveScriptData).toHaveBeenLastCalledWith('C:/b/Probe.md');
    expect(runInScriptSandbox).toHaveBeenCalledWith({ source: 'return 2;', data: abzug });
  });

  it('ohne Rückgabe-Wert gilt der Text der Ausgabe', async () => {
    const output = [{ kind: 'text', text: ' 3 ' }];
    runInScriptSandbox.mockResolvedValue({ type: 'result', output, value: null });
    expect(await skriptLauf('pq.out(3);', { path: 'C:/b/P.md' })).toEqual({ ok: true, value: '3' });
  });

  it('übersetzt Fehler und Zeitüberschreitung in Fehlschläge', async () => {
    runInScriptSandbox.mockResolvedValue({ type: 'error', message: 'kaputt', line: 2 });
    expect(await skriptLauf('x', { path: 'C:/b/P.md' })).toEqual({
      ok: false,
      code: 'scriptFailed',
      detail: { message: 'kaputt', line: 2 },
    });
    runInScriptSandbox.mockResolvedValue({ type: 'timeout' });
    expect(await skriptLauf('x', { path: 'C:/b/P.md' })).toEqual({
      ok: false,
      code: 'scriptTimeout',
      detail: { seconds: 5 },
    });
  });

  it('fragt die Einstellung unmittelbar vor dem Skript und startet bei aus keine Sandbox', async () => {
    skripteAn = false;
    expect(await skriptLauf('x', { path: 'C:/b/P.md' })).toEqual({
      ok: false,
      code: 'scriptsDisabled',
      detail: {},
    });
    expect(runInScriptSandbox).not.toHaveBeenCalled();
  });

  it('ein nicht bereiter Index ist ein Fehlschlag ohne Sandbox', async () => {
    abzug = { status: 'indexing' };
    const r = await skriptLauf('x', { path: 'C:/b/P.md' });
    expect(r).toMatchObject({ ok: false, code: 'scriptFailed' });
    expect(r.detail.message.length).toBeGreaterThan(0);
    expect(runInScriptSandbox).not.toHaveBeenCalled();
  });

  it('der Start führt das Skript aus und meldet sein Ergebnis über notify', async () => {
    runInScriptSandbox.mockResolvedValue({ type: 'result', output: [], value: 2 });
    const t = text(['script "Zählen" as "offen"', 'notify "Offen: {{script:offen}}"']);
    expect(await starteWorkflow({ path: 'C:/b/Probe.md', text: t })).toBe(true);
    const texte = showStatusbarHint.mock.calls.map((c) => c[1] && c[1].text);
    expect(texte).toContain('Offen: 2');
  });

  it('bei ausgeschalteter Einstellung läuft kein Schritt und keine Sandbox', async () => {
    skripteAn = false;
    const t = text(['notify "vorher"', 'script "Zählen" as "offen"']);
    expect(await starteWorkflow({ path: 'C:/b/Probe.md', text: t })).toBe(false);
    expect(runInScriptSandbox).not.toHaveBeenCalled();
    const texte = showStatusbarHint.mock.calls.map((c) => c[1] && c[1].text);
    expect(texte).not.toContain('vorher');
  });
});
