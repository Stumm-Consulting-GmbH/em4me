// 4T-002647 (Epic 3E-000416): Die Bindung eines Bereichs, Buchs oder Regals als
// Freigabe im Buch (AK4) und das unveränderte Verhalten der Bindung (AK5).
//
// Bestands-Lesungen: Buch und Regal binden ihre Applikation zugleich als
// Bereich (`bindBookToApp` in src/main/books/book-apps.js, `bindShelfToApp` in
// src/main/books/shelf-apps.js). Diese Stellen laufen hier am echten Aufruf
// mit einer nachgebildeten App-Registry (Buch: `bindBookToApp`,
// `restoreBookForApp`; Regal: `openShelfApp` in einer freien App, weil
// `bindShelfToApp` nicht exportiert ist, und `restoreShelfForApp`); echte
// Bücher und Regale legen `createBook` (src/main/books/books.js) und
// `createShelf` (src/main/books/shelves.js) an. Der Bereichs-Weg (`openAreaPath`)
// und die Fenster-Verwaltung lassen sich ohne Bereichs-Beobachtung samt Index
// bzw. ohne Electron-Fenster nicht aufrufen; ihre Anschluss-Zeilen sind
// dieselben Aufrufe `bindApp` und `bindWindow`, deren Verhalten die übrigen
// Fälle prüfen.
//
// Die Asynchronität wird mit einer zurückgehaltenen Prüfung der Wurzel gemessen:
// Der Fall entscheidet, wann `checkRoot` fertig wird.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createBindingGrants,
  programPlaces,
  resolveProgramList,
  AREA_SCOPE,
} = require('../../src/main/grants/binding-grants.js');
const { createGrantBook } = require('../../src/main/grants/grant-book.js');
const { checkRoot } = require('../../src/main/grants/path-check.js');
const {
  createList,
  resolveList,
  isResolvedList,
  createListSource,
} = require('../../src/main/grants/protected-folders.js');
const { createBookApps } = require('../../src/main/books/book-apps.js');
const { createShelfApps } = require('../../src/main/books/shelf-apps.js');
const books = require('../../src/main/books/books.js');
const shelves = require('../../src/main/books/shelves.js');

let tmpDirs = [];
let NONE;

beforeAll(async () => {
  NONE = await resolveList([]);
});

function tempDir(prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(dir);
  return dir;
}

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

// Anschluss mit echtem Buch und echter Prüfung; Warnungen werden gesammelt.
function setup(more = {}) {
  const book = createGrantBook();
  const warn = vi.fn();
  const grants = createBindingGrants({ book, protectedFolders: NONE, warn, ...more });
  return { book, warn, grants };
}

// Eine Prüfung der Wurzel, die erst fertig wird, wenn der Fall es sagt.
function heldCheck() {
  const held = [];
  const check = (rootPath, options) =>
    new Promise((resolve) => {
      held.push(() => resolve(checkRoot(rootPath, options)));
    });
  return { check, releaseAll: () => held.splice(0).forEach((go) => go()), held };
}

describe('Bindung als Freigabe (AK4)', () => {
  it('die Bindung trägt eine Freigabe des Bereichs ein: beide Wurzel-Formen, lesen, schreiben, anlegen', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants, warn } = setup();
    await grants.bindWindow(1, area);
    expect(book.query(1)).toEqual([
      expect.objectContaining({
        root: area,
        chosenRoot: area,
        kind: 'area',
        scope: ['read', 'write', 'create'],
        origin: 'binding',
        end: 'binding',
        owner: 'program',
      }),
    ]);
    expect(AREA_SCOPE).toEqual(['read', 'write', 'create']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('dieselbe Wurzel noch einmal ändert nichts, kein zweiter Eintrag', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants } = setup();
    await grants.bindWindow(1, area);
    const [first] = book.query(1);
    await grants.bindWindow(1, area);
    expect(book.query(1)).toEqual([first]);
  });

  it('Lösen trägt aus, Einträge anderer Art bleiben', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants } = setup();
    await grants.bindWindow(1, area);
    const file = book.grant(1, {
      root: path.join(area, 'x.md'),
      kind: 'file',
      scope: ['read'],
      origin: 'dialog',
    });
    grants.unbindWindow(1);
    expect(book.query(1)).toEqual([file]);
  });

  it('mit dem Fenster-Ende enden alle Einträge des Fensters, die des anderen bleiben', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants } = setup();
    await grants.bindApp([1, 2], area);
    book.grant(1, {
      root: path.join(area, 'x.md'),
      kind: 'file',
      scope: ['read'],
      origin: 'dialog',
    });
    grants.windowClosed(1);
    expect(book.query(1)).toEqual([]);
    expect(book.query(2)).toHaveLength(1);
  });

  it('zwei Fenster einer App bekommen je einen Eintrag', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants } = setup();
    await grants.bindApp([1, 2], area);
    expect(book.query(1).map((e) => e.root)).toEqual([area]);
    expect(book.query(2).map((e) => e.root)).toEqual([area]);
  });

  it('ein später geöffnetes Fenster der App bekommt den Eintrag ebenso', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants } = setup();
    await grants.bindApp([1], area);
    expect(book.query(3)).toEqual([]);
    await grants.bindWindow(3, area);
    expect(book.query(3).map((e) => e.root)).toEqual([area]);
  });

  it('die gewählte Form bleibt neben der aufgelösten stehen', async (ctx) => {
    const area = tempDir('em4me-bindung-');
    const alias = path.join(tempDir('em4me-alias-'), 'Verweis');
    try {
      fs.symlinkSync(area, alias, 'junction');
    } catch (err) {
      ctx.skip(`Verzeichnis-Knoten nicht anlegbar (${err.code})`);
    }
    const { book, grants } = setup();
    await grants.bindWindow(1, alias);
    expect(book.query(1)[0]).toMatchObject({ root: area, chosenRoot: alias });
  });
});

describe('Kein veralteter Eintrag durch die Asynchronität', () => {
  it('binden und sofort lösen, bevor die Prüfung fertig ist: kein Eintrag', async () => {
    const area = tempDir('em4me-bindung-');
    const held = heldCheck();
    const { book, grants } = setup({ checkRoot: held.check });
    const done = grants.bindWindow(1, area);
    grants.unbindWindow(1);
    await vi.waitFor(() => expect(held.held).toHaveLength(1));
    held.releaseAll();
    await done;
    expect(book.query(1)).toEqual([]);
  });

  it('binden, dann anders binden: Nur die zweite Bindung steht, auch wenn die erste zuletzt fertig wird', async () => {
    const first = tempDir('em4me-bindung-');
    const second = tempDir('em4me-bindung-');
    const held = heldCheck();
    const { book, grants } = setup({ checkRoot: held.check });
    const a = grants.bindWindow(1, first);
    const b = grants.bindWindow(1, second);
    await vi.waitFor(() => expect(held.held).toHaveLength(2));
    const [goFirst, goSecond] = held.held.splice(0);
    goSecond();
    await b;
    goFirst();
    await a;
    expect(book.query(1).map((e) => e.root)).toEqual([second]);
  });

  it('binden, dann das Fenster schließen: kein Eintrag, auch kein späterer', async () => {
    const area = tempDir('em4me-bindung-');
    const held = heldCheck();
    const { book, grants } = setup({ checkRoot: held.check });
    const done = grants.bindWindow(1, area);
    grants.windowClosed(1);
    await vi.waitFor(() => expect(held.held).toHaveLength(1));
    held.releaseAll();
    await done;
    expect(book.query(1)).toEqual([]);
    await grants.bindWindow(1, area);
    expect(held.held).toHaveLength(0);
    expect(book.query(1)).toEqual([]);
  });

  it('nach dem Lösen bindet dieselbe Wurzel wieder', async () => {
    const area = tempDir('em4me-bindung-');
    const { book, grants } = setup();
    await grants.bindWindow(1, area);
    grants.unbindWindow(1);
    await grants.bindWindow(1, area);
    expect(book.query(1)).toHaveLength(1);
  });

  it('die Liste der geschützten Ordner darf später fertig werden als die Bindung', async () => {
    const area = tempDir('em4me-bindung-');
    let ready;
    const later = new Promise((resolve) => {
      ready = resolve;
    });
    const { book, grants } = setup({ protectedFolders: later });
    const done = grants.bindWindow(1, area);
    expect(book.query(1)).toEqual([]);
    ready(NONE);
    await done;
    expect(book.query(1)).toHaveLength(1);
  });

  it('eine gescheiterte Liste wird bei der nächsten Bindung neu ermittelt (4T-002922)', async () => {
    const first = tempDir('em4me-bindung-');
    const second = tempDir('em4me-bindung-');
    let n = 0;
    const resolve = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error('danglingLink');
      return NONE;
    });
    const { book, grants, warn } = setup({
      protectedFolders: createListSource(resolve, { warn: vi.fn() }),
    });
    await grants.bindWindow(1, first);
    expect(book.query(1)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    await grants.bindWindow(2, second);
    expect(book.query(2)).toHaveLength(1);
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});

describe('Das Verhalten der Bindung bleibt unverändert (AK5)', () => {
  it('ein geschützter Ordner als Bereich: kein Eintrag, eine Warnung, kein Fehler nach außen', async () => {
    const data = tempDir('em4me-daten-');
    const list = await resolveList(
      createList([{ path: data, reason: 'userDataFolder', blocks: ['write'] }]),
    );
    const { book, grants, warn } = setup({ protectedFolders: list });
    await expect(grants.bindWindow(1, data)).resolves.toBeUndefined();
    expect(book.query(1)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toContain('protectedFolder');
  });

  it('ein Fehler der Prüfung oder der Liste wird protokolliert und nie weitergereicht', async () => {
    const area = tempDir('em4me-bindung-');
    const kaputt = setup({ checkRoot: () => Promise.reject(new Error('kaputt')) });
    await expect(kaputt.grants.bindWindow(1, area)).resolves.toBeUndefined();
    expect(kaputt.warn).toHaveBeenCalledTimes(1);
    const ohneListe = setup({ protectedFolders: Promise.reject(new Error('keine Liste')) });
    await expect(ohneListe.grants.bindApp([1, 2], area)).resolves.toBeUndefined();
    expect(ohneListe.warn).toHaveBeenCalledTimes(2);
    expect(ohneListe.book.query(1)).toEqual([]);
  });

  it('auch eine unbrauchbare Angabe wirft nicht in den Bindungs-Ablauf', async () => {
    const { grants, warn } = setup();
    await expect(grants.bindWindow(0, '/x')).resolves.toBeUndefined();
    await expect(grants.bindWindow(1, null)).resolves.toBeUndefined();
    expect(() => grants.unbindWindow('eins')).not.toThrow();
    expect(() => grants.windowClosed(undefined)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('ohne Buch oder ohne Liste bricht der Aufbau laut', () => {
    expect(() => createBindingGrants({ protectedFolders: NONE })).toThrow(TypeError);
    expect(() => createBindingGrants({ book: createGrantBook() })).toThrow(TypeError);
  });
});

describe('Orte der geschützten Ordner beim Start', () => {
  const exe = path.resolve('/em4me-probe/Programm/EM4me.exe');
  const userData = path.resolve('/em4me-probe/Daten');

  it('installierte Fassung: Programm-Ordner, Nutzerdaten samt Add-ons, Sprachdateien und Einstellungs-Datei', () => {
    expect(
      programPlaces({
        execPath: exe,
        userDataFolder: userData,
        portableMode: { portabel: false, datenOrdner: null },
        portableProgramFile: path.resolve('/x/fremd.exe'),
      }),
    ).toEqual({
      programFolder: path.dirname(exe),
      userDataFolder: userData,
      addonFolder: path.join(userData, 'extensions'),
      localeFolder: path.join(userData, 'locales'),
      settingsFile: path.join(userData, 'config.json'),
      portableDataFolder: null,
      portableProgramFile: null,
    });
  });

  it('portable Fassung: dazu der Daten-Ordner und die Programmdatei, diese nur als absoluter Pfad', () => {
    const data = path.resolve('/em4me-probe/USB/Data');
    const file = path.resolve('/em4me-probe/USB/EM4me.exe');
    const mode = { portabel: true, datenOrdner: data };
    expect(
      programPlaces({
        execPath: exe,
        userDataFolder: data,
        portableMode: mode,
        portableProgramFile: file,
      }),
    ).toMatchObject({
      portableDataFolder: data,
      portableProgramFile: file,
    });
    expect(
      programPlaces({
        execPath: exe,
        userDataFolder: data,
        portableMode: mode,
        portableProgramFile: 'EM4me.exe',
      }).portableProgramFile,
    ).toBeNull();
  });

  it('die Liste entsteht aufgelöst; eine unbrauchbare Angabe wird zur Ablehnung, nicht zum Wurf', async () => {
    const base = tempDir('em4me-start-');
    const list = await resolveProgramList({
      execPath: path.join(base, 'Programm', 'EM4me.exe'),
      userDataFolder: path.join(base, 'Daten'),
      portableMode: { portabel: false, datenOrdner: null },
    });
    expect(isResolvedList(list)).toBe(true);
    const failing = resolveProgramList({
      execPath: exe,
      userDataFolder: 'relativ',
      portableMode: null,
    });
    await expect(failing).rejects.toThrow(TypeError);
  });
});

// Nachbildung der App-Registry für eine App mit zwei Fenstern.
function registryWithTwoWindows() {
  let area = null;
  return {
    getArea: () => area,
    setArea: (_id, a) => {
      area = a;
    },
    windowsOf: () => [1, 2],
    appOf: () => 7,
  };
}

function appDeps(appRegistry, bindingGrants) {
  const none = () => {};
  return {
    appRegistry,
    getStore: () => null,
    windows: new Map(),
    lastReportedPanes: new Map(),
    activeShelves: () => new Map(),
    activeBooks: new Map(),
    areaOfWindow: () => null,
    startAreaWatcher: vi.fn(),
    focusFirstAppWindow: none,
    broadcastDisplayInfo: none,
    applyMenuToAllWindows: none,
    tForWindow: () => '',
    persistAllWindows: none,
    createWindow: none,
    closeAppWindows: none,
    recentLists: { pushRecentEntry: none },
    // Nur das Regal-Modul: Helfer aus dem Buch-Modul.
    appIdOfWindow: () => 7,
    sendWhenLoaded: none,
    appHasOpenFilesOutside: () => false,
    openBookApp: none,
    bindingGrants,
  };
}

describe('Anschluss am echten Aufruf (AK4)', () => {
  it('ein Buch binden trägt die Freigabe für jedes Fenster seiner App ein', async () => {
    const parent = tempDir('em4me-buch-');
    const created = await books.createBook(parent, 'Roman');
    expect(created.ok).toBe(true);
    const { book, grants } = setup();
    const deps = appDeps(registryWithTwoWindows(), grants);
    const bookApps = createBookApps(deps);
    await bookApps.bindBookToApp(7, created.bookDir);
    await grants.settled();
    for (const id of [1, 2]) expect(book.query(id).map((e) => e.root)).toEqual([created.bookDir]);
    expect(deps.startAreaWatcher).toHaveBeenCalledWith(7);
  });

  it('ein Buch wiederherstellen trägt die Freigabe ebenso ein', async () => {
    const parent = tempDir('em4me-buch-');
    const created = await books.createBook(parent, 'Roman');
    const { book, grants } = setup();
    const bookApps = createBookApps(appDeps(registryWithTwoWindows(), grants));
    await bookApps.restoreBookForApp(7, created.bookDir);
    await grants.settled();
    expect(book.query(2).map((e) => e.root)).toEqual([created.bookDir]);
  });

  it('ein Regal in der freien App öffnen trägt die Freigabe für jedes Fenster seiner App ein', async () => {
    const created = await shelves.createShelf(tempDir('em4me-regal-'), 'Regal');
    expect(created.ok).toBe(true);
    const { book, grants } = setup();
    const shelfApps = createShelfApps(appDeps(registryWithTwoWindows(), grants));
    const sender = { isDestroyed: () => false, webContents: { id: 1 } };
    expect(await shelfApps.openShelfApp(created.shelfDir, sender)).toEqual({
      ok: true,
      boundExisting: true,
    });
    await grants.settled();
    for (const id of [1, 2]) expect(book.query(id).map((e) => e.root)).toEqual([created.shelfDir]);
  });

  it('ein Regal wiederherstellen trägt die Freigabe ebenso ein', async () => {
    const created = await shelves.createShelf(tempDir('em4me-regal-'), 'Regal');
    const { book, grants } = setup();
    const shelfApps = createShelfApps(appDeps(registryWithTwoWindows(), grants));
    await shelfApps.restoreShelfForApp(7, created.shelfDir);
    await grants.settled();
    expect(book.query(1).map((e) => e.root)).toEqual([created.shelfDir]);
  });

  it('eine App, die schon einen Bereich trägt, bindet das Buch ohne neuen Eintrag', async () => {
    const parent = tempDir('em4me-buch-');
    const created = await books.createBook(parent, 'Roman');
    const registry = registryWithTwoWindows();
    registry.setArea(7, { rootPath: created.bookDir, name: 'Roman' });
    const { book, grants } = setup();
    const bookApps = createBookApps(appDeps(registry, grants));
    await bookApps.bindBookToApp(7, created.bookDir);
    expect(book.query(1)).toEqual([]);
  });
});
