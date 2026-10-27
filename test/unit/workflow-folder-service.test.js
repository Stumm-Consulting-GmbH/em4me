// 4T-002355 (Epic 3E-000184): Der Dienst des Workflow-Ordners — wirksamer
// Ordner je Fenster, Bereichs-Sektion in der Bereichsdatei, Beobachtung mit
// Meldung an die Fenster und Neubildung nach Änderungen (Story 4S-001109,
// AK1 und AK6).
//
// **Beobachter als Attrappe, Dateien echt.** Ein laufender Beobachter meldete
// seine Entscheidung nur über ein Ereignis, das ausbleiben kann, und ein
// ausbleibendes Ereignis ist von einem langsamen nicht zu unterscheiden (Muster
// db-sperr-ausschluss.test.js). Geprüft wird deshalb, was der Dienst aus einem
// Ereignis macht — Meldung an die Besitzer, Neu-Lesen der echten Dateien —, und
// welche Ordner er wann beobachtet. Bereichsdatei und Workflow-Dateien liegen in
// einem echten Temp-Verzeichnis.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowFolderService,
} = require('../../src/main/workflows/workflow-folder-service.js');
const mddStore = require('../../src/main/documents/mdd-store.js');

let tmpDir;
let dienst;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-wf-dienst-'));
});

afterEach(() => {
  if (dienst) dienst.dispose();
  dienst = null;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Rest bleibt im OS-Temp liegen; unkritisch.
  }
});

function workflowText(name) {
  return `---\nworkflow: true\nname: ${name}\n---\n\n\`\`\`workflow\nnotify "Hallo"\n\`\`\`\n`;
}

function lege(rel, inhalt) {
  const abs = path.join(tmpDir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt, 'utf8');
  return abs;
}

function speicher(werte = {}) {
  const abos = new Map();
  return {
    werte,
    get: (k) => werte[k],
    onDidChange: (k, cb) => abos.set(k, cb),
    aendere(k, wert) {
      werte[k] = wert;
      const cb = abos.get(k.split('.')[0]);
      if (cb) cb();
    },
  };
}

function fenster(id, area) {
  const gesendet = [];
  const schliessHaken = [];
  return {
    area,
    gesendet,
    zerstoert: false,
    isDestroyed() {
      return this.zerstoert;
    },
    webContents: {
      id,
      send: (kanal, ...args) => gesendet.push([kanal, ...args]),
      once: (ereignis, cb) => {
        if (ereignis === 'destroyed') schliessHaken.push(cb);
      },
    },
    schliesse() {
      this.zerstoert = true;
      for (const cb of schliessHaken) cb();
    },
  };
}

function aufbau({ store = speicher(), fensterListe = [], workflowsEnabled } = {}) {
  const windows = new Map(fensterListe.map((w) => [w.webContents.id, w]));
  const beobachtet = [];
  dienst = createWorkflowFolderService({
    getStore: () => store,
    areaOfWindow: (win) => (win && win.area ? win.area : null),
    windows,
    mddStore,
    buendelMs: 5,
    workflowsEnabled,
    watchFolder: (folder) => {
      const watcher = new EventEmitter();
      watcher.folder = folder;
      watcher.geschlossen = false;
      watcher.close = async () => {
        watcher.geschlossen = true;
      };
      beobachtet.push(watcher);
      return watcher;
    },
  });
  return { store, windows, beobachtet };
}

const meldungen = (win) => win.gesendet.filter(([k]) => k === 'workflow:folderChanged').length;

describe('wirksamer Ordner und Liste je Fenster (AK1)', () => {
  it('liest den globalen Ordner, wenn der Bereich keinen festlegt', async () => {
    lege('Global/Hallo.md', workflowText('Hallo'));
    const win = fenster(1, { rootPath: path.join(tmpDir, 'Bereich'), name: 'Bereich' });
    aufbau({
      store: speicher({ 'workflows.folder': path.join(tmpDir, 'Global') }),
      fensterListe: [win],
    });
    const liste = await dienst.folderListFor(win);
    expect(liste).toMatchObject({ ok: true, enabled: true, source: 'global', missing: false });
    expect(liste.workflows.map((w) => w.name)).toEqual(['Hallo']);
  });

  it('ersetzt den globalen Ordner vollständig durch den des Bereichs', async () => {
    lege('Global/Global.md', workflowText('Global'));
    lege('Bereich/Abläufe/Eigen.md', workflowText('Eigen'));
    const wurzel = path.join(tmpDir, 'Bereich');
    const win = fenster(1, { rootPath: wurzel, name: 'Bereich' });
    aufbau({
      store: speicher({ 'workflows.folder': path.join(tmpDir, 'Global') }),
      fensterListe: [win],
    });
    expect(await dienst.writeAreaWorkflowsConfig(wurzel, { folder: 'Abläufe' })).toEqual({
      ok: true,
    });
    const liste = await dienst.folderListFor(win);
    expect(liste.source).toBe('area');
    expect(liste.folder).toBe(path.join(wurzel, 'Abläufe'));
    expect(liste.workflows.map((w) => w.name)).toEqual(['Eigen']);
  });

  it('liefert ohne Festlegung eine leere Liste ohne Beobachter', async () => {
    const win = fenster(1, null);
    const { beobachtet } = aufbau({ fensterListe: [win] });
    expect(await dienst.folderListFor(win)).toMatchObject({
      source: 'none',
      folder: null,
      workflows: [],
    });
    expect(beobachtet).toHaveLength(0);
  });

  it('liefert bei abgeschalteter Erweiterung «Workflows» nichts und beobachtet nichts', async () => {
    // Den Registry-Eintrag `workflows` legt 4T-002352 an; bis dahin wird die
    // Schalter-Abfrage hier eingesetzt. Sie bekommt die Deaktivierungs-Liste.
    lege('Global/Hallo.md', workflowText('Hallo'));
    const win = fenster(1, null);
    const gefragt = [];
    const { beobachtet } = aufbau({
      store: speicher({
        'workflows.folder': path.join(tmpDir, 'Global'),
        'extensions.disabled': ['workflows'],
      }),
      fensterListe: [win],
      workflowsEnabled: (disabled) => {
        gefragt.push(disabled);
        return !disabled.includes('workflows');
      },
    });
    expect(await dienst.folderListFor(win)).toMatchObject({
      enabled: false,
      workflows: [],
      items: [],
    });
    expect(gefragt).toEqual([['workflows']]);
    expect(beobachtet).toHaveLength(0);
  });
});

describe('Bereichs-Sektion in der Bereichsdatei (AK1)', () => {
  const lies = (wurzel) =>
    JSON.parse(fs.readFileSync(path.join(wurzel, mddStore.MDDA_FILENAME), 'utf8'));

  it('legt die Bereichsdatei beim ersten Setzen an und speichert den Ordner relativ', async () => {
    aufbau();
    expect(await dienst.writeAreaWorkflowsConfig(tmpDir, { folder: ' Abläufe/Tag ' })).toEqual({
      ok: true,
    });
    expect(lies(tmpDir).settings.workflows).toEqual({ folder: 'Abläufe/Tag' });
    expect(await dienst.readAreaWorkflowsConfig(tmpDir)).toEqual({ folder: 'Abläufe/Tag' });
  });

  it('lässt die übrigen Sektionen stehen und entfernt die eigene mit null', async () => {
    fs.writeFileSync(
      path.join(tmpDir, mddStore.MDDA_FILENAME),
      mddStore.serializeContainer({
        ...mddStore.emptySettingsContainer(),
        settings: { templates: { folder: 'V' } },
      }),
    );
    aufbau();
    await dienst.writeAreaWorkflowsConfig(tmpDir, { folder: 'Abläufe' });
    expect(lies(tmpDir).settings).toEqual({
      templates: { folder: 'V' },
      workflows: { folder: 'Abläufe' },
    });
    await dienst.writeAreaWorkflowsConfig(tmpDir, null);
    expect(lies(tmpDir).settings).toEqual({ templates: { folder: 'V' } });
  });

  it('legt ohne Festlegung keine Bereichsdatei an', async () => {
    aufbau();
    expect(await dienst.writeAreaWorkflowsConfig(tmpDir, null)).toEqual({ ok: true });
    expect(fs.existsSync(path.join(tmpDir, mddStore.MDDA_FILENAME))).toBe(false);
  });

  it('überschreibt eine defekte Bereichsdatei nie', async () => {
    const datei = path.join(tmpDir, mddStore.MDDA_FILENAME);
    fs.writeFileSync(datei, '{ kaputt');
    aufbau();
    const ergebnis = await dienst.writeAreaWorkflowsConfig(tmpDir, { folder: 'Abläufe' });
    expect(ergebnis.ok).toBe(false);
    expect(fs.readFileSync(datei, 'utf8')).toBe('{ kaputt');
    expect(await dienst.readAreaWorkflowsConfig(tmpDir)).toBeUndefined();
  });
});

describe('Beobachtung und Neubildung (AK6 der Story)', () => {
  function einFensterMitOrdner() {
    const ordner = path.join(tmpDir, 'Workflows');
    fs.mkdirSync(ordner);
    const win = fenster(1, null);
    const umgebung = aufbau({
      store: speicher({ 'workflows.folder': ordner }),
      fensterListe: [win],
    });
    return { ordner, win, ...umgebung };
  }

  it('meldet eine Änderung im Ordner gebündelt an das Fenster', async () => {
    const { win, beobachtet } = einFensterMitOrdner();
    await dienst.folderListFor(win);
    expect(beobachtet).toHaveLength(1);
    beobachtet[0].emit('all', 'add', 'x');
    beobachtet[0].emit('all', 'change', 'x');
    beobachtet[0].emit('all', 'unlink', 'x');
    await vi.waitFor(() => expect(meldungen(win)).toBe(1));
  });

  it('bildet die Liste nach Anlegen, Umbenennen und Entfernen einer Workflow-Datei neu', async () => {
    const { ordner, win, beobachtet } = einFensterMitOrdner();
    const namen = async () => (await dienst.folderListFor(win)).workflows.map((w) => w.name);
    expect(await namen()).toEqual([]);

    const datei = path.join(ordner, 'Neu.md');
    fs.writeFileSync(datei, workflowText('Neu'));
    beobachtet[0].emit('all', 'add', datei);
    await vi.waitFor(() => expect(meldungen(win)).toBe(1));
    expect(await namen()).toEqual(['Neu']);

    fs.writeFileSync(datei, workflowText('Umbenannt'));
    beobachtet[0].emit('all', 'change', datei);
    await vi.waitFor(() => expect(meldungen(win)).toBe(2));
    expect(await namen()).toEqual(['Umbenannt']);

    fs.rmSync(datei);
    beobachtet[0].emit('all', 'unlink', datei);
    await vi.waitFor(() => expect(meldungen(win)).toBe(3));
    expect(await namen()).toEqual([]);
    // Wiederholte Abfragen desselben Fensters legen keinen zweiten Beobachter an.
    expect(beobachtet).toHaveLength(1);
  });

  it('teilt einen Beobachter zwischen Fenstern und schließt ihn mit dem letzten', async () => {
    const ordner = path.join(tmpDir, 'Workflows');
    fs.mkdirSync(ordner);
    const eins = fenster(1, null);
    const zwei = fenster(2, null);
    const { beobachtet } = aufbau({
      store: speicher({ 'workflows.folder': ordner }),
      fensterListe: [eins, zwei],
    });
    await dienst.folderListFor(eins);
    await dienst.folderListFor(zwei);
    expect(beobachtet).toHaveLength(1);
    beobachtet[0].emit('all', 'add', 'x');
    await vi.waitFor(() => expect([meldungen(eins), meldungen(zwei)]).toEqual([1, 1]));
    eins.schliesse();
    expect(beobachtet[0].geschlossen).toBe(false);
    zwei.schliesse();
    expect(beobachtet[0].geschlossen).toBe(true);
  });

  it('wechselt nach einer neuen Bereichs-Festlegung den beobachteten Ordner und meldet alle Fenster', async () => {
    const wurzel = path.join(tmpDir, 'Bereich');
    fs.mkdirSync(path.join(wurzel, 'Abläufe'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'Global'));
    const imBereich = fenster(1, { rootPath: wurzel, name: 'Bereich' });
    const ohneBereich = fenster(2, null);
    const { beobachtet } = aufbau({
      store: speicher({ 'workflows.folder': path.join(tmpDir, 'Global') }),
      fensterListe: [imBereich, ohneBereich],
    });
    await dienst.folderListFor(imBereich);
    await dienst.folderListFor(ohneBereich);
    expect(beobachtet.map((w) => w.folder)).toEqual([path.join(tmpDir, 'Global')]);
    await dienst.writeAreaWorkflowsConfig(wurzel, { folder: 'Abläufe' });
    await dienst.refreshAll();
    expect(beobachtet.map((w) => w.folder)).toEqual([
      path.join(tmpDir, 'Global'),
      path.join(wurzel, 'Abläufe'),
    ]);
    expect(beobachtet[0].geschlossen).toBe(false); // das zweite Fenster bleibt beim globalen
    expect([meldungen(imBereich), meldungen(ohneBereich)]).toEqual([1, 1]);
  });

  it('folgt der anwendungsweiten Einstellung über den Speicher', async () => {
    const { win, store, beobachtet } = einFensterMitOrdner();
    await dienst.folderListFor(win);
    const anderer = path.join(tmpDir, 'Anderer');
    fs.mkdirSync(anderer);
    store.aendere('workflows.folder', anderer);
    await vi.waitFor(() => expect(meldungen(win)).toBe(1));
    expect(beobachtet[0].geschlossen).toBe(true);
    expect(beobachtet[1].folder).toBe(anderer);
  });

  it('meldet auch Zuhörern im Hauptprozess die betroffenen Fenster', async () => {
    const { win, beobachtet } = einFensterMitOrdner();
    const gehoert = [];
    const ab = dienst.onChange((ids) => gehoert.push(ids));
    await dienst.folderListFor(win);
    beobachtet[0].emit('all', 'add', 'x');
    await vi.waitFor(() => expect(gehoert).toEqual([[1]]));
    ab();
    beobachtet[0].emit('all', 'add', 'y');
    await vi.waitFor(() => expect(meldungen(win)).toBe(2));
    expect(gehoert).toEqual([[1]]);
  });
});
