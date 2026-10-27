// 4T-002364 (Epic 3E-000184): Der Nachzug der Belegungen eines Workflows im
// Hauptprozess (src/main/workflows/workflow-binding-follow.js), AK1 bis AK5 des
// Tasks.
//
// **Echte Module, echte Dateien.** Die Bewegung läuft durch das echte
// `renameSingleFile` aus `createLinkUpdate` mit echter Beobachtung (Muster
// begleit-dateien-mitziehen.test.js), der wirksame Ordner je Fenster kommt aus
// dem echten Dienst des Workflow-Ordners samt Bereichsdatei im Temp-Verzeichnis,
// und der Rundruf aus der echten `createSettingsVerteilung`. Attrappen sind
// allein die Fenster (sie zeichnen die gesendeten Kanäle auf) und der
// Einstellungs-Speicher als kleines Objekt mit `get` und `set` über einen
// echten Wert-Baum; `getStore: () => null` aus begleit-dateien-mitziehen
// taugte dafür nicht, weil hier gerade das Schreiben gemessen wird.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowBindingFollow,
  kennungsPaare,
  ordnerAllerFenster,
} = require('../../src/main/workflows/workflow-binding-follow.js');
const {
  createWorkflowFolderService,
} = require('../../src/main/workflows/workflow-folder-service.js');
const { createSettingsVerteilung } = require('../../src/main/ipc/settings-verteilung.js');
const { createLinkUpdate } = require('../../src/main/documents/link-update.js');
const { createFileWatching } = require('../../src/main/documents/file-watching.js');
const { registerWorkflowsIpc } = require('../../src/main/ipc/workflows.js');
const mddStore = require('../../src/main/documents/mdd-store.js');
const { workflowCommandId } = require('../../src/shared/workflows/workflow-command-id.js');
const { normalizeCommandPlacement } = require('../../src/shared/commands/command-placement.js');

const HALLO = '---\nworkflow: true\nname: Hallo-Test\n---\n\n```workflow\nnotify "Hallo"\n```\n';
const BELEGUNGS_KANAELE = ['hotkeys:changed', 'commandPlacement:changed', 'formatToolbar:changed'];

let tmpDirs = [];
let dienste = [];

afterEach(() => {
  for (const d of dienste) d.dispose();
  dienste = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
  vi.restoreAllMocks();
});

function speicher(werte = {}) {
  return {
    werte,
    geschrieben: [],
    get: (k) => werte[k],
    set(k, v) {
      this.geschrieben.push(k);
      werte[k] = v;
    },
  };
}

function fenster(id, area) {
  const gesendet = [];
  return {
    area,
    gesendet,
    isDestroyed: () => false,
    webContents: { id, send: (kanal, wert) => gesendet.push({ kanal, wert }) },
  };
}

// Ein Bereich mit Workflow-Ordner, ein Fenster darauf, Speicher, Verteilung,
// Nachzug und die echte Umbenenn-Strecke.
async function welt({ werte = {}, weitereFenster = [], ordnerRel = 'Workflows' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-beleg-'));
  tmpDirs.push(root);
  const store = speicher(werte);
  const haupt = fenster(1, { rootPath: root, name: 'Bereich' });
  const alle = [haupt, ...weitereFenster];
  const windows = new Map(alle.map((w) => [w.webContents.id, w]));
  const dienst = createWorkflowFolderService({
    getStore: () => store,
    areaOfWindow: (win) => (win && win.area ? win.area : null),
    windows,
    mddStore,
    watchFolder: () => ({ on: () => {}, close: async () => {} }),
  });
  dienste.push(dienst);
  if (ordnerRel) await dienst.writeAreaWorkflowsConfig(root, { folder: ordnerRel });
  const menues = { n: 0 };
  const verteileEinstellung = createSettingsVerteilung({
    BrowserWindow: { getAllWindows: () => alle },
    getStore: () => store,
    applyMenuToAllWindows: () => {
      menues.n += 1;
    },
    updateAllCaptionColors: () => {},
    timerChecker: { reschedule: () => {} },
  });
  const folge = createWorkflowBindingFollow({
    getStore: () => store,
    verteileEinstellung,
    ordnerJeFenster: ordnerAllerFenster({ windows, resolveForWindow: dienst.resolveForWindow }),
  });
  const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
  const lu = createLinkUpdate({
    moveWatchEntry,
    mddKeyOf: (p) => p.toLowerCase(),
    mddOpenPackets: new Map(),
    mddSuspendedPaths: new Set(),
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    broadcast: () => {},
    books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
    followAreaStartPage: async () => {},
    followWorkflowBindings: (a, b) => folge.nachBewegung(a, b),
  });
  const lege = (rel, inhalt = HALLO) => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, inhalt, 'utf8');
    return abs;
  };
  const pfad = (rel) => path.join(root, ...rel.split('/'));
  const bewege = (von, nach) => {
    fs.mkdirSync(path.dirname(pfad(nach)), { recursive: true });
    return lu.renameSingleFile(pfad(von), pfad(nach));
  };
  const kanaele = (win = haupt) =>
    win.gesendet.filter((g) => BELEGUNGS_KANAELE.includes(g.kanal)).map((g) => g.kanal);
  return { root, store, haupt, dienst, folge, lu, lege, pfad, bewege, kanaele, menues };
}

const ID = (rel) => workflowCommandId(rel);
const platz = (id) =>
  normalizeCommandPlacement({
    statusbar: [{ commandId: id, icon: 'zap', label: null }],
    macros: [{ id: 'm1', name: 'Kette', steps: [{ type: 'command', commandId: id }] }],
  });

describe('Umbenennen im Workflow-Ordner (AK1, AK2)', () => {
  it('schreibt Kürzel und Plätze und verteilt beide genau einmal', async () => {
    const w = await welt({
      werte: {
        hotkeys: { [ID('Hallo.md')]: 'Ctrl+Alt+Shift+H' },
        commandPlacement: platz(ID('Hallo.md')),
      },
    });
    w.lege('Workflows/Hallo.md');
    const res = await w.bewege('Workflows/Hallo.md', 'Workflows/Hallo umbenannt.md');
    expect(res.ok).toBe(true);
    const neu = ID('Hallo umbenannt.md');
    expect(w.store.werte.hotkeys).toEqual({ [neu]: 'Ctrl+Alt+Shift+H' });
    expect(w.store.werte.commandPlacement).toEqual(platz(neu));
    expect(w.store.geschrieben.sort()).toEqual(['commandPlacement', 'hotkeys']);
    expect(w.kanaele().sort()).toEqual(['commandPlacement:changed', 'hotkeys:changed']);
    // Der Rundruf trägt den neuen Stand, und die Menüs bekommen ihre Kürzel neu.
    const hk = w.haupt.gesendet.find((g) => g.kanal === 'hotkeys:changed');
    expect(hk.wert).toEqual({ [neu]: 'Ctrl+Alt+Shift+H' });
    expect(w.menues.n).toBe(1);
  });

  it('auch die Format-Toolbar zieht mit', async () => {
    const formatToolbar = {
      entries: [{ type: 'command', commandId: ID('Hallo.md'), icon: 'zap', label: 'WF' }],
    };
    const w = await welt({ werte: { formatToolbar } });
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Workflows/Neu.md');
    expect(w.store.werte.formatToolbar.entries[0]).toEqual({
      type: 'command',
      commandId: ID('Neu.md'),
      icon: 'zap',
      label: 'WF',
    });
    expect(w.kanaele()).toEqual(['formatToolbar:changed']);
  });
});

describe('Bewegung ohne Belegung (AK5)', () => {
  it('schreibt nichts und verteilt nichts', async () => {
    const w = await welt({ werte: { hotkeys: { 'file.save': 'Ctrl+S' } } });
    w.lege('Workflows/Hallo.md');
    expect((await w.bewege('Workflows/Hallo.md', 'Workflows/B.md')).ok).toBe(true);
    expect(w.store.geschrieben).toEqual([]);
    expect(w.kanaele()).toEqual([]);
  });

  it('eine Datei außerhalb des Workflow-Ordners berührt nichts', async () => {
    const w = await welt({ werte: { hotkeys: { [ID('Notiz.md')]: 'Ctrl+K' } } });
    w.lege('Notiz.md', '# Notiz\n');
    await w.bewege('Notiz.md', 'Notiz 2.md');
    expect(w.store.geschrieben).toEqual([]);
    expect(w.store.werte.hotkeys).toEqual({ [ID('Notiz.md')]: 'Ctrl+K' });
  });
});

describe('Verschieben (AK3, AK4)', () => {
  it('in einen Unterordner des Workflow-Ordners', async () => {
    const w = await welt({ werte: { hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } } });
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Workflows/Täglich/Hallo.md');
    expect(w.store.werte.hotkeys).toEqual({ [ID('Täglich/Hallo.md')]: 'Ctrl+H' });
  });

  it('aus dem Ordner hinaus: die Belegungen bleiben gespeichert (O1) und wirken bei Rückkehr', async () => {
    const id = ID('Hallo.md');
    const w = await welt({ werte: { hotkeys: { [id]: 'Ctrl+H' }, commandPlacement: platz(id) } });
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Archiv/Hallo.md');
    expect(w.store.geschrieben).toEqual([]);
    expect(w.kanaele()).toEqual([]);
    expect(w.store.werte.hotkeys).toEqual({ [id]: 'Ctrl+H' });
    // Zurück an denselben Ort: Die gespeicherte Kennung ist wieder die des Workflows.
    await w.bewege('Archiv/Hallo.md', 'Workflows/Hallo.md');
    expect(w.store.geschrieben).toEqual([]);
    expect(w.store.werte.commandPlacement).toEqual(platz(id));
  });

  it('von außen in den Ordner hinein: keine alte Kennung, nichts zu tun', async () => {
    const w = await welt({ werte: { hotkeys: { 'workflow.Fremd.md': 'Ctrl+H' } } });
    w.lege('Archiv/Hallo.md');
    await w.bewege('Archiv/Hallo.md', 'Workflows/Hallo.md');
    expect(w.store.geschrieben).toEqual([]);
  });
});

describe('Ordner je Fenster', () => {
  it('zwei Fenster mit verschiedenen Ordnern: nur der passende wirkt', async () => {
    const zweit = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-beleg-b-'));
    tmpDirs.push(zweit);
    const anderes = fenster(2, null);
    const w = await welt({
      werte: {
        'workflows.folder': zweit,
        hotkeys: { [ID('Hallo.md')]: 'Ctrl+H', [ID('Workflows/Hallo.md')]: 'Ctrl+W' },
      },
      weitereFenster: [anderes],
    });
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Workflows/Neu.md');
    // Das zweite Fenster (ohne Bereich, globaler Ordner außerhalb) bildet keine
    // Kennung; die Kennung relativ zur Bereichs-Wurzel gehört zu keinem Ordner.
    expect(w.store.werte.hotkeys).toEqual({
      [ID('Neu.md')]: 'Ctrl+H',
      [ID('Workflows/Hallo.md')]: 'Ctrl+W',
    });
    // Verteilt wird an alle Fenster, auch an das ohne passenden Ordner.
    expect(w.kanaele(anderes)).toEqual(['hotkeys:changed']);
  });

  it('zwei Bereiche mit demselben relativen Pfad teilen die anwendungsweite Belegung', async () => {
    const zweiteWurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-beleg-c-'));
    tmpDirs.push(zweiteWurzel);
    const anderes = fenster(2, { rootPath: zweiteWurzel, name: 'Zwei' });
    const w = await welt({
      werte: { hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } },
      weitereFenster: [anderes],
    });
    await w.dienst.writeAreaWorkflowsConfig(zweiteWurzel, { folder: 'Workflows' });
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Workflows/Neu.md');
    expect(w.store.werte.hotkeys).toEqual({ [ID('Neu.md')]: 'Ctrl+H' });
  });

  it('zwei Fenster auf demselben Bereich zählen den Ordner einmal', async () => {
    const w0 = await welt({ werte: { hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } } });
    const ordner = path.join(w0.root, 'Workflows');
    const paare = kennungsPaare(
      [ordner, ordner.toUpperCase(), ordner],
      path.join(ordner, 'Hallo.md'),
      path.join(ordner, 'Neu.md'),
    );
    // kennungsPaare selbst führt jeden Ordner; doppelt wird erst im Nachzug entfernt.
    expect(paare[0]).toEqual([ID('Hallo.md'), ID('Neu.md')]);
    const ordnerJeFenster = async () => [ordner, ordner, ordner];
    const store = speicher({ hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } });
    const verteilt = [];
    const folge = createWorkflowBindingFollow({
      getStore: () => store,
      verteileEinstellung: (k) => verteilt.push(k),
      ordnerJeFenster,
    });
    await folge.nachBewegung(path.join(ordner, 'Hallo.md'), path.join(ordner, 'Neu.md'));
    expect(verteilt).toEqual(['hotkeys']);
  });

  it('abgeschaltete Erweiterung zieht trotzdem nach', async () => {
    const w = await welt({
      werte: { 'extensions.disabled': ['workflows'], hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } },
    });
    expect((await w.dienst.resolveForWindow(w.haupt)).enabled).toBe(false);
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Workflows/Neu.md');
    expect(w.store.werte.hotkeys).toEqual({ [ID('Neu.md')]: 'Ctrl+H' });
  });

  it('ohne festgelegten Ordner geschieht nichts', async () => {
    const w = await welt({ werte: { hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } }, ordnerRel: null });
    w.lege('Workflows/Hallo.md');
    await w.bewege('Workflows/Hallo.md', 'Workflows/Neu.md');
    expect(w.store.geschrieben).toEqual([]);
  });
});

describe('Fehler (AK5)', () => {
  it('ein Fehler im Speicher lässt die Bewegung gelingen', async () => {
    const w = await welt({ werte: { hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } } });
    w.store.set = () => {
      throw new Error('Speicher gesperrt');
    };
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    w.lege('Workflows/Hallo.md');
    const res = await w.bewege('Workflows/Hallo.md', 'Workflows/Neu.md');
    expect(res).toEqual({ ok: true, bookDir: null });
    expect(fs.existsSync(w.pfad('Workflows/Neu.md'))).toBe(true);
    expect(fehler).toHaveBeenCalledWith(
      '[workflow-belegung] Nachtrag der Belegungen fehlgeschlagen:',
      'Speicher gesperrt',
    );
  });

  it('ohne Speicher meldet der Nachzug keine Änderung', async () => {
    const folge = createWorkflowBindingFollow({
      getStore: () => null,
      verteileEinstellung: () => {
        throw new Error('nicht erwartet');
      },
      ordnerJeFenster: async () => ['C:/x'],
    });
    expect(await folge.nachBewegung('C:/x/a.md', 'C:/x/b.md')).toEqual({ geaendert: [] });
  });
});

describe('Verdrahtung über die Kanal-Gruppe der Workflows', () => {
  it('registerWorkflowsIpc gibt den Nachzug an den Setzer', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-beleg-ipc-'));
    tmpDirs.push(root);
    const store = speicher({ 'workflows.folder': root, hotkeys: { [ID('A.md')]: 'Ctrl+H' } });
    const win = fenster(7, null);
    let gesetzt = null;
    registerWorkflowsIpc(() => {}, {
      senderWindow: () => null,
      areaOfWindow: () => null,
      getStore: () => store,
      windows: new Map([[7, win]]),
      mddStore,
      backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
      BrowserWindow: { getAllWindows: () => [win] },
      applyMenuToAllWindows: () => {},
      updateAllCaptionColors: () => {},
      timerChecker: { reschedule: () => {} },
      setFollowWorkflowBindings: (fn) => {
        gesetzt = fn;
      },
    });
    expect(typeof gesetzt).toBe('function');
    await gesetzt(path.join(root, 'A.md'), path.join(root, 'B.md'));
    expect(store.werte.hotkeys).toEqual({ [ID('B.md')]: 'Ctrl+H' });
    expect(win.gesendet.map((g) => g.kanal)).toEqual(['hotkeys:changed']);
  });

  it('ohne Setzer bleibt die Anmeldung wie bisher', () => {
    expect(() =>
      registerWorkflowsIpc(() => {}, {
        senderWindow: () => null,
        areaOfWindow: () => null,
        getStore: () => null,
        windows: new Map(),
        mddStore,
        backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
      }),
    ).not.toThrow();
  });
});
