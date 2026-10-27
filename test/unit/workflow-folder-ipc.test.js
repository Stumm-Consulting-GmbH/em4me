// 4T-002355 (Epic 3E-000184): Die Kanäle des Workflow-Ordners —
// workflow:folderList, workflow:getConfig und workflow:setAreaConfig (Story
// 4S-001109, AK1); seit Teil 2 dazu workflow:setFolder, workflow:create und
// workflow:fileInfo sowie die Weitergabe der Liste an den Menü-Aufbau (Task AK2,
// AK4, AK5, AK6).
//
// Geprüft am echten Dienst mit echter Bereichsdatei im Temp-Verzeichnis; nur der
// Beobachter ist eine Attrappe (Begründung in workflow-folder-service.test.js).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWorkflowFolderIpc } = require('../../src/main/ipc/workflow-folder.js');
const { registerWorkflowsIpc } = require('../../src/main/ipc/workflows.js');
const {
  createWorkflowFolderService,
} = require('../../src/main/workflows/workflow-folder-service.js');
const mddStore = require('../../src/main/documents/mdd-store.js');

let tmpDirs = [];
let dienste = [];

afterEach(() => {
  for (const d of dienste) d.dispose();
  dienste = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

function welt({ mitBereich = true, mitFenster = true, globalFolder = null, extra = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-wf-ordner-kanal-'));
  tmpDirs.push(root);
  const gesendet = [];
  const fenster = {
    isDestroyed: () => false,
    webContents: { id: 7, send: (k) => gesendet.push(k), once: () => {} },
  };
  const werte = { 'workflows.folder': globalFolder };
  const deps = {
    senderWindow: () => (mitFenster ? fenster : null),
    areaOfWindow: () => (mitBereich ? { rootPath: root, name: 'Notizen' } : null),
    getStore: () => ({ get: (k) => werte[k], set: (k, v) => (werte[k] = v) }),
    windows: new Map([[7, fenster]]),
    mddStore,
  };
  const dienst = createWorkflowFolderService({
    ...deps,
    buendelMs: 5,
    watchFolder: () => Object.assign(new EventEmitter(), { close: async () => {} }),
  });
  dienste.push(dienst);
  const kanaele = new Map();
  const zurueck = registerWorkflowFolderIpc((k, fn) => kanaele.set(k, fn), {
    ...deps,
    ...extra,
    workflowFolders: dienst,
  });
  const rufe = (kanal, ...args) => kanaele.get(kanal)({ sender: fenster.webContents }, ...args);
  return { root, rufe, kanaele, zurueck, dienst, gesendet, werte, fenster };
}

describe('workflow:getConfig', () => {
  it('liefert beide Ebenen normalisiert samt Bereichs-Name', async () => {
    const { root, rufe } = welt({ globalFolder: '  C:\\Global ' });
    fs.writeFileSync(
      path.join(root, mddStore.MDDA_FILENAME),
      mddStore.serializeContainer({
        ...mddStore.emptySettingsContainer(),
        settings: { workflows: { folder: 'Abläufe' } },
      }),
    );
    expect(await rufe('workflow:getConfig')).toEqual({
      ok: true,
      hasArea: true,
      areaName: 'Notizen',
      global: { folder: 'C:\\Global' },
      area: { folder: 'Abläufe' },
    });
  });

  it('meldet ohne Bereich und ohne Festlegung beide Ebenen als leer', async () => {
    const { rufe } = welt({ mitBereich: false });
    expect(await rufe('workflow:getConfig')).toEqual({
      ok: true,
      hasArea: false,
      areaName: null,
      global: null,
      area: null,
    });
  });
});

describe('workflow:setAreaConfig', () => {
  it('schreibt die Sektion relativ in die Bereichsdatei und meldet die Fenster', async () => {
    const { root, rufe, gesendet } = welt();
    await rufe('workflow:folderList'); // Fenster angemeldet
    expect(await rufe('workflow:setAreaConfig', { folder: 'Abläufe' })).toEqual({ ok: true });
    const datei = JSON.parse(fs.readFileSync(path.join(root, mddStore.MDDA_FILENAME), 'utf8'));
    expect(datei.settings.workflows).toEqual({ folder: 'Abläufe' });
    expect(gesendet).toEqual(['workflow:folderChanged']);
  });

  it('entfernt die Sektion mit null', async () => {
    const { root, rufe } = welt();
    await rufe('workflow:setAreaConfig', { folder: 'Abläufe' });
    await rufe('workflow:setAreaConfig', null);
    const datei = JSON.parse(fs.readFileSync(path.join(root, mddStore.MDDA_FILENAME), 'utf8'));
    expect(datei.settings.workflows).toBeUndefined();
  });

  it('lehnt ohne Bereich ab', async () => {
    const { rufe } = welt({ mitBereich: false });
    expect(await rufe('workflow:setAreaConfig', { folder: 'Abläufe' })).toEqual({
      ok: false,
      error: 'no area',
    });
  });
});

describe('workflow:folderList', () => {
  it('liefert die Liste des Bereichs-Ordners', async () => {
    const { root, rufe } = welt();
    fs.mkdirSync(path.join(root, 'Abläufe'));
    fs.writeFileSync(
      path.join(root, 'Abläufe', 'Hallo.md'),
      '---\nworkflow: true\nname: Hallo\n---\n\n```workflow\nnotify "Hallo"\n```\n',
    );
    await rufe('workflow:setAreaConfig', { folder: 'Abläufe' });
    const liste = await rufe('workflow:folderList');
    expect(liste).toMatchObject({
      ok: true,
      enabled: true,
      source: 'area',
      folder: path.join(root, 'Abläufe'),
    });
    expect(liste.workflows.map((w) => [w.name, w.relPath])).toEqual([['Hallo', 'Hallo.md']]);
  });

  it('antwortet ohne Fenster mit einem Fehler statt einer Liste', async () => {
    const { rufe } = welt({ mitFenster: false });
    expect(await rufe('workflow:folderList')).toEqual({ ok: false, error: 'no window' });
  });

  it('gibt den Dienst an die Verdrahtung zurück', () => {
    const { zurueck, dienst } = welt();
    expect(zurueck).toBe(dienst);
  });
});

describe('Anmeldung über die Kanal-Gruppe der Workflows', () => {
  it('registerWorkflowsIpc meldet die drei Kanäle des Ordners mit an', () => {
    const kanaele = new Map();
    registerWorkflowsIpc((k, fn) => kanaele.set(k, fn), {
      senderWindow: () => null,
      areaOfWindow: () => null,
      getStore: () => null,
      windows: new Map(),
      mddStore,
      backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
    });
    for (const kanal of ['workflow:folderList', 'workflow:getConfig', 'workflow:setAreaConfig']) {
      expect(kanaele.has(kanal), kanal).toBe(true);
    }
  });
});

// --- Teil 2 -------------------------------------------------------------------

const HALLO = '---\nworkflow: true\nname: Hallo\n---\n\n```workflow\nnotify "Hallo"\n```\n';
const tForWindow = (_win, k) => `«${k}»`;

describe('workflow:setFolder («Neuer Workflow …» ohne Ordner)', () => {
  it('hält einen Ordner im Bereich wurzel-relativ in der Bereichsdatei fest', async () => {
    const { root, rufe, werte } = welt();
    fs.mkdirSync(path.join(root, 'Abläufe'));
    const antwort = await rufe('workflow:setFolder', { folder: path.join(root, 'Abläufe') });
    expect(antwort).toEqual({ ok: true });
    const datei = JSON.parse(fs.readFileSync(path.join(root, mddStore.MDDA_FILENAME), 'utf8'));
    expect(datei.settings.workflows).toEqual({ folder: 'Abläufe' });
    expect(werte['workflows.folder']).toBeNull();
  });

  it('hält einen Ordner außerhalb des Bereichs absolut fest', async () => {
    const { root, rufe } = welt();
    const aussen = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-wf-aussen-'));
    tmpDirs.push(aussen);
    expect(await rufe('workflow:setFolder', { folder: aussen })).toEqual({ ok: true });
    const datei = JSON.parse(fs.readFileSync(path.join(root, mddStore.MDDA_FILENAME), 'utf8'));
    expect(datei.settings.workflows).toEqual({ folder: aussen });
  });

  it('ohne Bereich anwendungsweit', async () => {
    const { rufe, werte, root } = welt({ mitBereich: false });
    expect(await rufe('workflow:setFolder', { folder: root })).toEqual({ ok: true });
    expect(werte['workflows.folder']).toBe(path.resolve(root));
  });

  it('weist eine leere oder relative Angabe ab', async () => {
    const { rufe } = welt();
    for (const folder of ['', 'Abläufe', null, 42]) {
      expect(await rufe('workflow:setFolder', { folder })).toEqual({
        ok: false,
        error: 'invalid folder',
      });
    }
  });
});

describe('workflow:create', () => {
  it('legt die Datei im wirksamen Ordner mit den Texten der Fenster-Sprache an', async () => {
    const { root, rufe } = welt({ extra: { tForWindow } });
    fs.mkdirSync(path.join(root, 'Abläufe'));
    await rufe('workflow:setAreaConfig', { folder: 'Abläufe' });
    const antwort = await rufe('workflow:create', { name: 'Wochenrückblick' });
    expect(antwort).toEqual({ ok: true, path: path.join(root, 'Abläufe', 'Wochenrückblick.md') });
    const text = fs.readFileSync(antwort.path, 'utf8');
    expect(text).toContain('workflow: true');
    expect(text).toContain('description: «workflow.neu.kopfBeschreibung»');
    expect(text).toContain('# «workflow.neu.hilfe1»\n# «workflow.neu.hilfe2»');
  });

  it('meldet ohne festgelegten Ordner noFolder', async () => {
    const { rufe } = welt({ extra: { tForWindow } });
    expect(await rufe('workflow:create', { name: 'W' })).toEqual({ ok: false, code: 'noFolder' });
  });

  it('meldet eine vorhandene Datei und einen leeren Namen', async () => {
    const { root, rufe } = welt({ extra: { tForWindow } });
    fs.mkdirSync(path.join(root, 'Abläufe'));
    fs.writeFileSync(path.join(root, 'Abläufe', 'W.md'), 'x');
    await rufe('workflow:setAreaConfig', { folder: 'Abläufe' });
    expect(await rufe('workflow:create', { name: 'W' })).toEqual({ ok: false, code: 'exists' });
    expect(await rufe('workflow:create', { name: '' })).toEqual({
      ok: false,
      code: 'invalidName',
    });
  });
});

describe('workflow:fileInfo («Starten» im Kontextmenü des Bereichs-Panels)', () => {
  it('erkennt eine Workflow-Datei im Bereich am Kennzeichen', async () => {
    const { root, rufe } = welt();
    fs.writeFileSync(path.join(root, 'Hallo.md'), HALLO);
    fs.writeFileSync(path.join(root, 'Notiz.md'), '# Notiz\n');
    expect(await rufe('workflow:fileInfo', path.join(root, 'Hallo.md'))).toEqual({
      ok: true,
      isWorkflow: true,
    });
    expect(await rufe('workflow:fileInfo', path.join(root, 'Notiz.md'))).toEqual({
      ok: true,
      isWorkflow: false,
    });
  });

  it('liest nichts außerhalb des Bereichs und nichts ohne Bereich', async () => {
    const { root, rufe } = welt();
    const aussen = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-wf-aussen-'));
    tmpDirs.push(aussen);
    fs.writeFileSync(path.join(aussen, 'Hallo.md'), HALLO);
    expect(await rufe('workflow:fileInfo', path.join(aussen, 'Hallo.md'))).toEqual({
      ok: false,
      isWorkflow: false,
    });
    expect(await rufe('workflow:fileInfo', 'Hallo.md')).toEqual({ ok: false, isWorkflow: false });
    const ohne = welt({ mitBereich: false });
    fs.writeFileSync(path.join(root, 'Hallo.md'), HALLO);
    expect(await ohne.rufe('workflow:fileInfo', path.join(root, 'Hallo.md'))).toEqual({
      ok: false,
      isWorkflow: false,
    });
  });
});

describe('Weitergabe an den Menü-Aufbau', () => {
  it('übergibt die Menü-Listen und baut nach einer Abfrage des Fensters das Menü neu', async () => {
    let listen = null;
    const gebaut = [];
    const { root, rufe, fenster } = welt({
      extra: {
        setWorkflowMenuLists: (l) => (listen = l),
        applyMenuToWindow: (win) => gebaut.push(win),
      },
    });
    expect(listen).not.toBeNull();
    fs.mkdirSync(path.join(root, 'Abläufe'));
    fs.writeFileSync(path.join(root, 'Abläufe', 'Hallo.md'), HALLO);
    await rufe('workflow:setAreaConfig', { folder: 'Abläufe' });
    await rufe('workflow:folderList');
    expect(gebaut).toEqual([fenster]);
    expect(listen.listFor(7).workflows.map((w) => w.name)).toEqual(['Hallo']);
  });

  it('ohne Menü-Aufbau (Prüffälle, frühe Verdrahtung) entfällt die Weitergabe', async () => {
    const { rufe } = welt();
    expect((await rufe('workflow:folderList')).ok).toBe(true);
  });
});
