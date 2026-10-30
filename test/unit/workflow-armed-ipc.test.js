// 4T-002422 (Epic 3E-000366, Story 4S-001133): Die Kanäle der Scharf-Schaltung
// (src/main/ipc/workflow-armed.js), AK2 und AK5 des Tasks, AK1, AK3, AK4 der
// Story.
//
// Geprüft am echten Lauf-Stand: Workflow-Dateien und Begleitdateien im
// Temp-Verzeichnis, gelesen über `readRunState` und den Schreibweg
// `createWorkflowRunState`, Prüfsumme über `definitionsPruefsumme`. Attrappen
// sind allein Fenster, Bereichs-Bindung und Index-Fassade (`bufferTextFor`).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWorkflowArmedIpc } = require('../../src/main/ipc/workflow-armed.js');
const { readRunState } = require('../../src/main/ipc/workflow-runs.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');

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

const W = (kopf, zeilen = ['notify "x"']) =>
  [
    '---',
    'workflow: true',
    'name: Probe',
    ...kopf,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');
const ZEITPLAN = ['trigger: schedule', 'schedule: every day at 23:00'];
// Lokale Wanduhr 2026-10-28 10:00.
const JETZT = new Date(2026, 9, 28, 10, 0).getTime();

function welt(dateien, { puffer = {}, disabled = [], ohneBereich = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-scharf-'));
  tmpDirs.push(root);
  for (const [rel, text] of Object.entries(dateien)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
  }
  const kanaele = new Map();
  const defekte = [];
  registerWorkflowArmedIpc((k, fn) => kanaele.set(k, fn), {
    senderWindow: () => ({ id: 'Fenster' }),
    areaOfWindow: () => (ohneBereich ? null : { rootPath: root }),
    backlinks: {
      bufferTextFor: (abs) => {
        const rel = path.relative(root, abs).split(path.sep).join('/');
        return Object.prototype.hasOwnProperty.call(puffer, rel) ? puffer[rel] : null;
      },
    },
    getStore: () => ({ get: (k) => (k === 'extensions.disabled' ? disabled : undefined) }),
    mddSuspendedPaths: new Set(),
    mddKeyOf: (p) => p.toLowerCase(),
    notifyMddDefect: (...a) => defekte.push(a),
    now: () => JETZT,
  });
  const abs = (rel) => path.join(root, rel);
  const setArmed = (rel, armed) =>
    kanaele.get('workflow:setArmed')({}, { workflowPath: abs(rel), armed });
  const zustand = (rel) => kanaele.get('workflow:armedState')({}, { workflowPath: abs(rel) });
  return { root, abs, setArmed, zustand, kanaele, defekte };
}

describe('workflow:setArmed — scharf schalten', () => {
  it('schreibt Prüfsumme und ersten Termin ab der Wanduhr-Minute der Scharf-Schaltung', async () => {
    const text = W(ZEITPLAN);
    const w = welt({ 'Abläufe/Probe.md': text });
    expect(await w.setArmed('Abläufe/Probe.md', true)).toEqual({
      ok: true,
      status: 'armed',
      nextDue: '2026-10-28T23:00',
    });
    const { stand } = await readRunState(w.abs('Abläufe/Probe.md'));
    expect(stand.armed).toEqual({ at: expect.any(String), hash: definitionsPruefsumme(text) });
    expect(stand.nextDue).toBe('2026-10-28T23:00');
    expect(stand.runs).toBe(0);
    expect(await w.zustand('Abläufe/Probe.md')).toEqual({
      ok: true,
      isWorkflow: true,
      scheduled: true,
      status: 'armed',
      nextDue: '2026-10-28T23:00',
    });
  });

  it('rechnet über den ungespeicherten Stand vor der Platte', async () => {
    const platte = W(ZEITPLAN);
    const puffer = W(['trigger: schedule', 'schedule: every 2 hours']);
    const w = welt({ 'P.md': platte }, { puffer: { 'P.md': puffer } });
    const res = await w.setArmed('P.md', true);
    expect(res.nextDue).toBe('2026-10-28T12:00');
    const { stand } = await readRunState(w.abs('P.md'));
    expect(stand.armed.hash).toBe(definitionsPruefsumme(puffer));
  });

  it('weist bei einem Befund ab, mit Code und Zeile, und schreibt nichts (AK4)', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN, ['unbekannt "x"']) });
    const res = await w.setArmed('P.md', true);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('findings');
    expect(res.findings[0]).toMatchObject({ code: 'unknownCommand', line: 9 });
    expect(await readRunState(w.abs('P.md'))).toEqual({ stand: null, defekt: false });
  });

  it('weist auch den Befund «nur von Hand» ab, obwohl der Start von Hand ginge (AK2)', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN, ['delete "Alt.md"']) });
    const res = await w.setArmed('P.md', true);
    expect(res).toMatchObject({ ok: false, code: 'findings' });
    expect(res.findings.map((f) => f.code)).toEqual(['manualOnly']);
    expect(res.findings[0].line).toBe(9);
    expect((await w.zustand('P.md')).status).toBe('notArmed');
  });

  it('weist einen Workflow ohne trigger: schedule ab (AK3)', async () => {
    const w = welt({ 'P.md': W([]) });
    expect(await w.setArmed('P.md', true)).toEqual({ ok: false, code: 'noSchedule' });
    expect(await w.zustand('P.md')).toMatchObject({ scheduled: false, status: 'notArmed' });
    expect(await readRunState(w.abs('P.md'))).toEqual({ stand: null, defekt: false });
  });

  it('weist einen Pfad außerhalb des eigenen Bereichs ab, etwa einen verknüpften (2h)', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN) });
    const fremd = welt({ 'F.md': W(ZEITPLAN) });
    const res = await w.kanaele.get('workflow:setArmed')(
      {},
      { workflowPath: fremd.abs('F.md'), armed: true },
    );
    expect(res).toEqual({ ok: false, code: 'outsideArea' });
    expect(await readRunState(fremd.abs('F.md'))).toEqual({ stand: null, defekt: false });
  });

  it('weist ohne Bereich, mit relativem Pfad, ohne Wahrheitswert und bei ausgeschalteter Erweiterung ab', async () => {
    expect(
      await welt({ 'P.md': W(ZEITPLAN) }, { ohneBereich: true }).setArmed('P.md', true),
    ).toEqual({
      ok: false,
      code: 'noArea',
    });
    const w = welt({ 'P.md': W(ZEITPLAN), 'K.md': '# kein Workflow\n' });
    const kanal = w.kanaele.get('workflow:setArmed');
    expect(await kanal({}, { workflowPath: 'P.md', armed: true })).toEqual({
      ok: false,
      code: 'invalidPath',
    });
    expect(await kanal({}, { workflowPath: w.abs('P.md'), armed: 'ja' })).toEqual({
      ok: false,
      code: 'invalidPath',
    });
    expect(await w.setArmed('K.md', true)).toEqual({ ok: false, code: 'notWorkflow' });
    expect(await w.setArmed('Fehlt.md', true)).toEqual({ ok: false, code: 'unreadable' });
    const aus = welt({ 'P.md': W(ZEITPLAN) }, { disabled: ['workflows'] });
    expect(await aus.setArmed('P.md', true)).toEqual({ ok: false, code: 'extensionOff' });
  });
});

describe('workflow:setArmed — entschärfen', () => {
  it('nimmt Scharf-Zustand und Termin zurück; der Lauf-Stand bleibt sonst stehen (AK5)', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN) });
    await w.setArmed('P.md', true);
    expect(await w.setArmed('P.md', false)).toEqual({
      ok: true,
      status: 'notArmed',
      nextDue: null,
    });
    expect(await readRunState(w.abs('P.md'))).toEqual({ stand: null, defekt: false });
    expect(await w.zustand('P.md')).toMatchObject({ status: 'notArmed', nextDue: null });
  });

  it('entschärft auch bei ausgeschalteter Erweiterung und ohne Begleitdatei', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN) }, { disabled: ['workflows'] });
    expect(await w.setArmed('P.md', false)).toEqual({
      ok: true,
      status: 'notArmed',
      nextDue: null,
    });
    expect(fs.existsSync(w.abs('P.mdd'))).toBe(false);
  });

  it('eine defekte Begleitdatei wird nie überschrieben', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN), 'P.mdd': '{kaputt' });
    const fehler = console.error;
    console.error = () => {};
    try {
      expect(await w.setArmed('P.md', true)).toEqual({ ok: false, code: 'runStateNotSaved' });
    } finally {
      console.error = fehler;
    }
    expect(fs.readFileSync(w.abs('P.mdd'), 'utf8')).toBe('{kaputt');
    expect(w.defekte).toHaveLength(1);
  });
});

describe('workflow:armedState', () => {
  it('meldet «Definition geändert» nach einer Änderung im Block und scharf nach erneutem Schalten (AK5 der Story)', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN) });
    await w.setArmed('P.md', true);
    fs.writeFileSync(w.abs('P.md'), W(ZEITPLAN, ['notify "geändert"']), 'utf8');
    expect(await w.zustand('P.md')).toEqual({
      ok: true,
      isWorkflow: true,
      scheduled: true,
      status: 'definitionChanged',
      nextDue: null,
    });
    await w.setArmed('P.md', true);
    expect((await w.zustand('P.md')).status).toBe('armed');
  });

  it('auch eine Änderung an missed setzt zurück', async () => {
    const w = welt({ 'P.md': W(ZEITPLAN) });
    await w.setArmed('P.md', true);
    fs.writeFileSync(w.abs('P.md'), W([...ZEITPLAN, 'missed: skip']), 'utf8');
    expect((await w.zustand('P.md')).status).toBe('definitionChanged');
  });

  it('eine gewöhnliche Datei ist kein Workflow, ein fremder Pfad wird abgewiesen', async () => {
    const w = welt({ 'K.md': '# Notiz\n' });
    expect(await w.zustand('K.md')).toEqual({ ok: true, isWorkflow: false });
    const fremd = welt({ 'F.md': W(ZEITPLAN) });
    expect(
      await w.kanaele.get('workflow:armedState')({}, { workflowPath: fremd.abs('F.md') }),
    ).toEqual({ ok: false, code: 'outsideArea' });
  });
});
