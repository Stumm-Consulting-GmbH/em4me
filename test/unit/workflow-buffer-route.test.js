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
  createWorkflowMaintenanceSteps,
} = require('../../src/main/workflows/workflow-maintenance-steps.js');
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

function welt({
  besitzer = null,
  frist = 1000,
  schritt: eigenerSchritt = null,
  backlinks = null,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-weiche-'));
  tmpDirs.push(root);
  const ziel = path.join(root, 'Ziel.md');
  fs.writeFileSync(ziel, 'Platte\n', 'utf8');
  const andere = fenster(7);
  const windows = new Map([[7, andere]]);
  const bufferRequests = createBufferRequests({ timeoutMs: frist, newId: () => 'k-1' });
  const schritte = createWorkflowContentSteps({
    windows,
    backlinks: backlinks || { bufferTextFor: () => null, bufferOwnerFor: () => besitzer },
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
  const schritt = eigenerSchritt || {
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

// 4T-002812 (Epic 3E-000444, AK1 und AK2): Die Weiche am echten Index. Ein
// Fenster meldet seinen Stand mit dem Merkmal «ungespeichert» (tab.dirty); hält
// es das Dokument unverändert, ist es kein Schreibziel, und der Befehl schreibt
// die Datei. Vorher galt jedes meldende Fenster als Besitzer: Der Befehl landete
// im Fenster, und das unveränderte Dokument wurde zu einem ungespeicherten.
describe('Schreibziel nach dem Merkmal «ungespeichert» (4T-002812)', () => {
  const index = require('../../src/main/backlinks.js');
  afterEach(() => index.clearAllBufferOverlays());

  it('AK1: das startende Fenster hält das Dokument unverändert: die Datei wird geschrieben', async () => {
    const w = welt({ backlinks: index });
    index.setBufferOverlay(w.ziel, 'Platte\n', 1, false);
    expect(await w.lauf()).toEqual({
      ok: true,
      effect: { kind: 'edited', paths: [w.ziel], via: 'disk' },
    });
    expect(platte(w)).toBe('Neu\n');
    expect(w.andere.post).toEqual([]);
  });

  it('AK1: ein anderes Fenster hält es unverändert: die Datei wird geschrieben, kein Auftrag dorthin', async () => {
    const w = welt({ backlinks: index, frist: 80 });
    index.setBufferOverlay(w.ziel, 'Platte\n', 7, false);
    expect((await w.lauf()).effect).toEqual({ kind: 'edited', paths: [w.ziel], via: 'disk' });
    expect(platte(w)).toBe('Neu\n');
    expect(w.andere.post).toEqual([]);
  });

  it('AK1: auf den gespeicherten Text zurückgetippt: die letzte Meldung gilt, die Datei wird geschrieben', async () => {
    const w = welt({ backlinks: index });
    index.setBufferOverlay(w.ziel, 'Platte und mehr\n', 1, true);
    index.setBufferOverlay(w.ziel, 'Platte\n', 1, false);
    expect((await w.lauf()).effect).toEqual({ kind: 'edited', paths: [w.ziel], via: 'disk' });
    expect(platte(w)).toBe('Neu\n');
  });

  // Zweitblick des Epics, Runde 1, Befund 1: Der Eintrag des unverändert
  // haltenden Fensters folgt dem geschriebenen Stand sofort. Vorher las der
  // nächste Schritt desselben Laufs bis zum Nachladen im Fenster den Stand vor
  // dem Schreiben, und das Abhaken einer eben eingesetzten Aufgabe endete mit
  // `taskNotFound`.
  it('Zweitblick R1 B1: der nächste Schritt desselben Laufs liest den geschriebenen Stand', async () => {
    const einsetzen = {
      line: 4,
      keyword: 'replace',
      args: ['Ziel.md', 'Platte', '- [ ] Neue Aufgabe'],
      source: null,
      position: null,
    };
    const w = welt({ backlinks: index, schritt: einsetzen });
    index.setBufferOverlay(w.ziel, 'Platte\n', 1, false);
    expect((await w.lauf()).effect).toEqual({ kind: 'edited', paths: [w.ziel], via: 'disk' });
    expect(index.bufferTextFor(w.ziel)).toBe(platte(w));
    expect(index.bufferOwnerFor(w.ziel)).toBe(null);
    const pflege = createWorkflowMaintenanceSteps({ backlinks: index, trashItem: async () => {} });
    const ctx = {
      root: path.dirname(w.ziel),
      owner: null,
      event: null,
      workflowAbs: path.join(path.dirname(w.ziel), 'Ablauf.md'),
      backlinks: index,
    };
    const abhaken = await pflege.runMaintenanceStep(ctx, {
      line: 5,
      blockLine: 1,
      keyword: 'complete-task',
      args: ['Ziel.md', 'Neue Aufgabe'],
    });
    expect(abhaken).toEqual({
      ok: true,
      window: {
        action: 'completeTask',
        path: w.ziel,
        line: 1,
        taskText: '- [ ] Neue Aufgabe',
      },
    });
  });

  it('Zweitblick R1 B1: ein ungespeicherter Stand folgt der Platte nicht', () => {
    const w = welt({ backlinks: index });
    index.setBufferOverlay(w.ziel, 'Platte und mehr\n', 1, true);
    const { folgePlattenStand } = require('../../src/main/index/overlay.js');
    expect(folgePlattenStand(w.ziel, 'Neu\n')).toBe(false);
    expect(index.bufferTextFor(w.ziel)).toBe('Platte und mehr\n');
    expect(index.bufferOwnerFor(w.ziel)).toBe(1);
  });

  it('AK2: das startende Fenster hält einen geänderten Stand: Handgriff an den Puffer, Datei unverändert', async () => {
    const w = welt({ backlinks: index });
    index.setBufferOverlay(w.ziel, 'Platte und mehr\n', 1, true);
    expect(await w.lauf()).toEqual({
      ok: true,
      window: { action: 'editOwnBuffer', path: w.ziel, edit: EDIT },
    });
    expect(platte(w)).toBe('Platte\n');
  });

  it('AK2: ein anderes Fenster hält einen geänderten Stand: Auftrag dorthin, Datei unverändert', async () => {
    const w = welt({ backlinks: index });
    index.setBufferOverlay(w.ziel, 'Platte und mehr\n', 7, true);
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    expect(w.andere.post).toEqual([
      { kanal: 'workflow:bufferEdit', daten: { requestId: 'k-1', path: w.ziel, edit: EDIT } },
    ]);
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true });
    expect((await lauf).effect).toEqual({ kind: 'edited', paths: [w.ziel], via: 'otherBuffer' });
    expect(platte(w)).toBe('Platte\n');
  });
});

// 4T-002690 (Weg (i) des Tasks, AK2 bis AK4): Mit der Erweiterung «Datenbank»
// liest der Hauptprozess den Puffer-Stand des haltenden Fensters, urteilt am
// Ergebnis und schickt die Bearbeitung erst bei Freigabe, mit dem gelesenen
// Stand als Erwartung. Ein Halt schickt keine Bearbeitung; Platte und Puffer
// bleiben unverändert.
describe('Urteil der Datenbank vor den Fenster-Wegen (4T-002690)', () => {
  const LIBRARY = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: title',
    '  lastId: 1',
    '---',
    '',
    'Freier Text.',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Solaris',
    '```',
    '',
  ].join('\n');

  function dbWelt({ besitzer, schritt, datenbankAn = true }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-urteil-'));
    tmpDirs.push(root);
    const ziel = path.join(root, 'Library.md');
    fs.writeFileSync(ziel, LIBRARY, 'utf8');
    const eigenes = fenster(1);
    const andere = fenster(7);
    let kennung = 0;
    const bufferRequests = createBufferRequests({ timeoutMs: 1000, newId: () => `k-${++kennung}` });
    const schritte = createWorkflowContentSteps({
      windows: new Map([[7, andere]]),
      backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => besitzer },
      resolveHistoryFor: async () => ({ effective: false }),
      recordMddOnSave: async () => {},
      bufferRequests,
      datenbankAktiv: () => datenbankAn,
    });
    const ctx = {
      root,
      owner: eigenes,
      event: { sender: { id: 1 } },
      workflowAbs: path.join(root, 'Ablauf.md'),
    };
    return {
      ziel,
      eigenes,
      andere,
      bufferRequests,
      lauf: () =>
        schritte.runContentStep(ctx, { source: null, position: null, line: 3, ...schritt }),
    };
  }
  const warte = () => new Promise((r) => setTimeout(r, 20));
  const ERSETZE_DATENSATZ = { keyword: 'replace', args: ['Library.md', 'Solaris', 'Solaris X'] };
  const ERSETZE_FREI = { keyword: 'replace', args: ['Library.md', 'Freier Text.', 'Neu.'] };

  it('anderes Fenster, Datensatz-Zeile: Lesen, Halt, keine Bearbeitung geschickt', async () => {
    const w = dbWelt({ besitzer: 7, schritt: ERSETZE_DATENSATZ });
    const lauf = w.lauf();
    await warte();
    expect(w.andere.post).toEqual([
      { kanal: 'workflow:bufferEdit', daten: { requestId: 'k-1', path: w.ziel, read: true } },
    ]);
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true, text: LIBRARY });
    expect(await lauf).toEqual({
      ok: false,
      code: 'dbRecordsByText',
      detail: { command: 'replace', path: 'Library.md', table: 'Library' },
    });
    expect(w.andere.post).toHaveLength(1);
    expect(fs.readFileSync(w.ziel, 'utf8')).toBe(LIBRARY);
  });

  it('anderes Fenster, freier Text: Bearbeitung mit dem gelesenen Stand als Erwartung', async () => {
    const w = dbWelt({ besitzer: 7, schritt: ERSETZE_FREI });
    const lauf = w.lauf();
    await warte();
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true, text: LIBRARY });
    await warte();
    expect(w.andere.post[1]).toEqual({
      kanal: 'workflow:bufferEdit',
      daten: {
        requestId: 'k-2',
        path: w.ziel,
        edit: { op: 'replace', search: 'Freier Text.', replacement: 'Neu.' },
        expected: LIBRARY,
      },
    });
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-2', ok: true });
    expect((await lauf).effect).toMatchObject({ kind: 'edited', via: 'otherBuffer' });
  });

  it('der Puffer hat sich seit dem Lesen geändert: bufferChanged kommt durch', async () => {
    const w = dbWelt({ besitzer: 7, schritt: ERSETZE_FREI });
    const lauf = w.lauf();
    await warte();
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true, text: LIBRARY });
    await warte();
    w.bufferRequests.answer(
      { sender: { id: 7 } },
      { requestId: 'k-2', ok: false, code: 'bufferChanged' },
    );
    expect(await lauf).toMatchObject({ ok: false, code: 'bufferChanged' });
  });

  it('eigenes Fenster: gelesen beim Absender; Halt ohne Handgriff, Freigabe mit Erwartung', async () => {
    const halt = dbWelt({ besitzer: 1, schritt: ERSETZE_DATENSATZ });
    const lauf = halt.lauf();
    await warte();
    expect(halt.eigenes.post[0].daten).toEqual({ requestId: 'k-1', path: halt.ziel, read: true });
    halt.bufferRequests.answer(
      { sender: { id: 1 } },
      { requestId: 'k-1', ok: true, text: LIBRARY },
    );
    expect(await lauf).toMatchObject({ ok: false, code: 'dbRecordsByText' });
    const frei = dbWelt({ besitzer: 1, schritt: ERSETZE_FREI });
    const lauf2 = frei.lauf();
    await warte();
    frei.bufferRequests.answer(
      { sender: { id: 1 } },
      { requestId: 'k-1', ok: true, text: LIBRARY },
    );
    expect(await lauf2).toEqual({
      ok: true,
      window: {
        action: 'editOwnBuffer',
        path: frei.ziel,
        edit: { op: 'replace', search: 'Freier Text.', replacement: 'Neu.' },
        expected: LIBRARY,
      },
    });
  });

  it('Aufbau der Tabelle am Puffer: Halt auf beiden Fenster-Wegen, ohne Bearbeitung', async () => {
    const schritt = { keyword: 'remove-property', args: ['Library.md', 'db-table'] };
    for (const besitzer of [1, 7]) {
      const w = dbWelt({ besitzer, schritt });
      const fensterDesStands = besitzer === 1 ? w.eigenes : w.andere;
      const lauf = w.lauf();
      await warte();
      w.bufferRequests.answer(
        { sender: { id: besitzer } },
        { requestId: 'k-1', ok: true, text: LIBRARY },
      );
      expect(await lauf).toMatchObject({
        ok: false,
        code: 'dbStructureByText',
        detail: { table: 'Library', command: 'remove-property' },
      });
      expect(fensterDesStands.post).toHaveLength(1);
      expect(fs.readFileSync(w.ziel, 'utf8')).toBe(LIBRARY);
    }
  });

  it('eine Lese-Antwort ohne Text gilt als nicht gelesen: bufferUnavailable', async () => {
    const w = dbWelt({ besitzer: 7, schritt: ERSETZE_FREI });
    const lauf = w.lauf();
    await warte();
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true });
    expect(await lauf).toMatchObject({ ok: false, code: 'bufferUnavailable' });
    expect(w.andere.post).toHaveLength(1);
  });

  it('Erweiterung «Datenbank» aus: der bisherige Weg ohne Lesen und ohne Erwartung', async () => {
    const w = dbWelt({ besitzer: 7, schritt: ERSETZE_DATENSATZ, datenbankAn: false });
    const lauf = w.lauf();
    await warte();
    expect(w.andere.post).toEqual([
      {
        kanal: 'workflow:bufferEdit',
        daten: {
          requestId: 'k-1',
          path: w.ziel,
          edit: { op: 'replace', search: 'Solaris', replacement: 'Solaris X' },
        },
      },
    ]);
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true });
    expect((await lauf).ok).toBe(true);
  });
});

// 4T-002424 (Story 4S-001135, AK5; Regel P5): `add-tag` und `remove-tag` nehmen
// dieselbe Weiche wie `set-property`; `complete-task` geht über den
// Fenster-Handgriff `completeTask` und die Weiche der Aufgaben-Abfrage
// (geprüft in renderer/workflow-window.test.js).
describe('Weg der Schlagwort-Befehle', () => {
  const tagSchritt = (keyword, tag) => ({
    line: 5,
    keyword,
    args: ['Ziel.md', tag],
    source: null,
    position: null,
  });

  it('kein Besitzer: add-tag schreibt den Dateikopf auf der Platte', async () => {
    const w = welt({ schritt: tagSchritt('add-tag', 'neu') });
    expect((await w.lauf()).effect).toMatchObject({ kind: 'edited', via: 'disk' });
    expect(platte(w)).toBe('---\ntags:\n  - neu\n---\nPlatte\n');
  });

  it('das startende Fenster hält den Stand: add-tag als Auftrag an den eigenen Puffer', async () => {
    const w = welt({ besitzer: 1, schritt: tagSchritt('add-tag', 'neu') });
    expect(await w.lauf()).toEqual({
      ok: true,
      window: { action: 'editOwnBuffer', path: w.ziel, edit: { op: 'addTag', tag: 'neu' } },
    });
    expect(platte(w)).toBe('Platte\n');
  });

  it('ein anderes Fenster hält den Stand: remove-tag als Auftrag, Platte unberührt', async () => {
    const w = welt({ besitzer: 7, schritt: tagSchritt('remove-tag', 'alt') });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    expect(w.andere.post).toEqual([
      {
        kanal: 'workflow:bufferEdit',
        daten: { requestId: 'k-1', path: w.ziel, edit: { op: 'removeTag', tag: 'alt' } },
      },
    ]);
    w.bufferRequests.answer({ sender: { id: 7 } }, { requestId: 'k-1', ok: true, changed: false });
    expect((await lauf).effect).toMatchObject({ kind: 'unchanged', via: 'otherBuffer' });
    expect(platte(w)).toBe('Platte\n');
  });

  it('der Code tagInvalid des anderen Fensters kommt durch', async () => {
    const w = welt({ besitzer: 7, schritt: tagSchritt('add-tag', 'zwei worte') });
    const lauf = w.lauf();
    await new Promise((r) => setTimeout(r, 20));
    w.bufferRequests.answer(
      { sender: { id: 7 } },
      { requestId: 'k-1', ok: false, code: 'tagInvalid' },
    );
    expect((await lauf).code).toBe('tagInvalid');
  });
});
