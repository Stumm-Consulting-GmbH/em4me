// 4T-002348 (Epic 3E-000184): Die Weiche zum Editor-Puffer für die Inhalts-
// Befehle der Workflows (AK4 des Tasks, A3, S-c).
//
// Bestands-Lesungen: Die eine Regel, wer den ungespeicherten Stand hält, ist
// `pufferBesitzer` in src/main/ipc/puffer-fenster.js (ausgezogen aus
// `uebergibAnPufferBesitzer`, deren Fälle `meldungen-alle-fenster.test.js`
// unverändert prüft); der Besitzer kommt aus `bufferOwnerFor` des Index. Die
// Fenster sind Attrappen mit `webContents.send` und den Ereignis-Methoden des
// BrowserWindow.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const { createBufferRequests } = require('../../src/main/workflows/workflow-buffer-requests.js');
const {
  pufferBesitzer,
  uebergibAnPufferBesitzer,
} = require('../../src/main/ipc/puffer-fenster.js');

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

// Ein Fenster-Attrappe mit Kennung, Posteingang und dem Ereignis «closed».
function fenster(id) {
  const ereignisse = new EventEmitter();
  const post = [];
  return {
    post,
    zerstoert: false,
    isDestroyed() {
      return this.zerstoert;
    },
    webContents: { id, send: (kanal, daten) => post.push({ kanal, daten }) },
    once: (name, fn) => ereignisse.once(name, fn),
    removeListener: (name, fn) => ereignisse.removeListener(name, fn),
    schliessen: () => ereignisse.emit('closed'),
  };
}

function welt({ besitzer = null, frist = 1000 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-weiche-'));
  tmpDirs.push(root);
  const ziel = path.join(root, 'Ziel.md');
  fs.writeFileSync(ziel, 'Platte\n', 'utf8');
  const andere = fenster(7);
  const windows = new Map([[7, andere]]);
  const bufferRequests = createBufferRequests({ timeoutMs: frist, newId: () => 'k-1' });
  const schritte = createWorkflowContentSteps({
    windows,
    backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => besitzer },
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    bufferRequests,
  });
  const ctx = {
    root,
    owner: {},
    event: { sender: { id: 1 } },
    workflowAbs: path.join(root, 'Ablauf.md'),
  };
  const schritt = {
    line: 4,
    keyword: 'replace',
    args: ['Ziel.md', 'Platte', 'Neu'],
    source: null,
    position: null,
  };
  return {
    ziel,
    andere,
    windows,
    bufferRequests,
    lauf: () => schritte.runContentStep(ctx, schritt),
  };
}

const platte = (w) => fs.readFileSync(w.ziel, 'utf8');
const EDIT = { op: 'replace', search: 'Platte', replacement: 'Neu' };

describe('pufferBesitzer', () => {
  it('unterscheidet keiner, absender und anderes; ein zerstörtes Fenster zählt als keiner', () => {
    const andere = fenster(7);
    const quellen = (besitzer) => ({
      windows: new Map([[7, andere]]),
      backlinks: { bufferOwnerFor: () => besitzer },
    });
    const event = { sender: { id: 1 } };
    expect(pufferBesitzer(quellen(null), event, '/a.md').art).toBe('keiner');
    expect(pufferBesitzer(quellen(1), event, '/a.md').art).toBe('absender');
    expect(pufferBesitzer(quellen(7), event, '/a.md')).toEqual({ art: 'anderes', fenster: andere });
    expect(pufferBesitzer(quellen(9), event, '/a.md').art).toBe('keiner');
    andere.zerstoert = true;
    expect(pufferBesitzer(quellen(7), event, '/a.md').art).toBe('keiner');
  });

  it('uebergibAnPufferBesitzer sendet nur an ein anderes Fenster', () => {
    const andere = fenster(7);
    const quellen = (besitzer) => ({
      windows: new Map([[7, andere]]),
      backlinks: { bufferOwnerFor: () => besitzer },
    });
    const event = { sender: { id: 1 } };
    expect(uebergibAnPufferBesitzer(quellen(1), event, '/a.md', 'k', { x: 1 })).toBe(false);
    expect(uebergibAnPufferBesitzer(quellen(7), event, '/a.md', 'k', { x: 1 })).toBe(true);
    expect(andere.post).toEqual([{ kanal: 'k', daten: { x: 1 } }]);
  });
});

describe('Weg eines Inhalts-Schritts', () => {
  it('kein Besitzer: die Platte wird geschrieben', async () => {
    const w = welt();
    expect((await w.lauf()).effect.via).toBe('disk');
    expect(platte(w)).toBe('Neu\n');
  });

  it('das startende Fenster hält den Stand: Auftrag zurück, Platte unberührt', async () => {
    const w = welt({ besitzer: 1 });
    expect(await w.lauf()).toEqual({
      ok: true,
      window: { action: 'editOwnBuffer', path: w.ziel, edit: EDIT },
    });
    expect(platte(w)).toBe('Platte\n');
  });

  it('ein anderes Fenster: Auftrag mit Kennung, Antwort ok', async () => {
    const w = welt({ besitzer: 7 });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    expect(w.andere.post).toEqual([
      { kanal: 'workflow:bufferEdit', daten: { requestId: 'k-1', path: w.ziel, edit: EDIT } },
    ]);
    expect(w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true })).toEqual({
      ok: true,
    });
    expect(await lauf).toEqual({
      ok: true,
      effect: { kind: 'edited', paths: [w.ziel], via: 'otherBuffer' },
    });
    expect(platte(w)).toBe('Platte\n');
  });

  it('ein anderes Fenster meldet einen Fehlschlag mit seinem Code', async () => {
    const w = welt({ besitzer: 7 });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    w.bufferRequests.answer(
      { sender: { id: 7 } },
      { requestId: 'k-1', ok: false, code: 'textNotFound' },
    );
    expect((await lauf).code).toBe('textNotFound');
  });

  it('keine Antwort binnen Frist: bufferUnavailable, Platte unberührt', async () => {
    const w = welt({ besitzer: 7, frist: 30 });
    const res = await w.lauf();
    expect(res).toMatchObject({ ok: false, code: 'bufferUnavailable' });
    expect(platte(w)).toBe('Platte\n');
    expect(w.bufferRequests.pending()).toBe(0);
  });

  it('das Fenster wird geschlossen: bufferUnavailable', async () => {
    const w = welt({ besitzer: 7 });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    w.andere.schliessen();
    expect((await lauf).code).toBe('bufferUnavailable');
  });

  it('eine Antwort mit fremder Kennung oder von einem anderen Fenster wird verworfen', async () => {
    const w = welt({ besitzer: 7, frist: 80 });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    expect(
      w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'fremd', ok: true }),
    ).toEqual({
      ok: false,
    });
    expect(w.bufferRequests.answer({ sender: { id: 3 } }, { requestId: 'k-1', ok: true })).toEqual({
      ok: false,
    });
    expect((await lauf).code).toBe('bufferUnavailable');
  });

  it('ein unbekannter Code des Fensters wird zu bufferUnavailable', async () => {
    const w = welt({ besitzer: 7 });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    w.bufferRequests.answer(
      { sender: { id: 7 } },
      { requestId: 'k-1', ok: false, code: '<script>' },
    );
    expect((await lauf).code).toBe('bufferUnavailable');
  });
});
