// 4T-002647 (Epic 3E-000416): Die geschützten Ordner (AK3). Erkannt auch
// innerhalb eines Bereichs, über eine Verknüpfung und in der portablen Fassung
// mit Daten-Ordner neben der Programmdatei; die Liste wird einmal aufgelöst.
//
// Bestands-Lesungen: Die portable Fassung entsteht über die Erkennung des
// Bestands (`ermittlePortablenBetrieb`, src/main/app/portabler-betrieb.js) mit
// dem Start-Rahmen-Ordner `PORTABLE_EXECUTABLE_DIR`, nicht über einen von Hand
// gebauten Pfad, damit der Fall denselben Daten-Ordner misst wie der
// Programmstart.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createList,
  createProgramList,
  resolveList,
  isResolvedList,
  findProtectedPlace,
} = require('../../src/main/grants/protected-folders.js');
const { checkPath, checkRoot } = require('../../src/main/grants/path-check.js');
const { createGrantBook } = require('../../src/main/grants/grant-book.js');
const {
  ermittlePortablenBetrieb,
  DATEN_ORDNER_NAME,
} = require('../../src/main/app/portabler-betrieb.js');

const isWindows = process.platform === 'win32';
const ALL = ['read', 'write', 'create'];
let tmpDirs = [];

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

// Ein Profil-Ordner, der als Bereich geöffnet ist und den Nutzerdaten-Ordner
// des Programms samt Add-ons, Sprachdateien und Einstellungs-Datei enthält.
async function setup() {
  const profile = tempDir('em4me-geschuetzt-');
  const program = path.join(profile, 'Programm');
  const data = path.join(profile, 'AppData', 'EM4me');
  for (const dir of [program, path.join(data, 'extensions', 'a'), path.join(data, 'locales')]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(data, 'config.json'), '{}');
  fs.writeFileSync(path.join(profile, 'Notiz.md'), 'x');
  const list = await resolveList(
    createProgramList({
      programFolder: program,
      userDataFolder: data,
      addonFolder: path.join(data, 'extensions'),
      localeFolder: path.join(data, 'locales'),
      settingsFile: path.join(data, 'config.json'),
    }),
  );
  const book = createGrantBook();
  book.grant(1, { root: profile, kind: 'area', scope: ALL, origin: 'dialog' });
  return { profile, program, data, list, book };
}

function check(book, list, p, scope) {
  return checkPath({ book, windowId: 1, path: p, scope, protectedFolders: list });
}

describe('createProgramList', () => {
  it('führt Programm- und Nutzerdaten-Ordner samt den einzeln genannten Orten', () => {
    const root = path.resolve('/em4me-probe');
    const list = createProgramList({
      programFolder: path.join(root, 'Programm'),
      userDataFolder: path.join(root, 'Daten'),
      settingsFile: path.join(root, 'Daten', 'config.json'),
      localeFolder: null,
    });
    expect(list.map((e) => e.reason)).toEqual(['programFolder', 'userDataFolder', 'settingsFile']);
    for (const e of list) {
      expect(e).toMatchObject({ kind: 'folder', blocks: ['write', 'create'] });
      expect(Object.isFrozen(e)).toBe(true);
    }
  });

  it.each([
    ['ohne Programm-Ordner', { userDataFolder: path.resolve('/d') }],
    ['ohne Nutzerdaten-Ordner', { programFolder: path.resolve('/p') }],
    ['mit relativem Ort', { programFolder: 'p', userDataFolder: path.resolve('/d') }],
    [
      'mit Null-Zeichen',
      { programFolder: path.resolve('/p'), userDataFolder: `${path.resolve('/d')}\0` },
    ],
  ])('bricht laut %s', (_name, places) => {
    expect(() => createProgramList(places)).toThrow(TypeError);
  });

  it('createList prüft Art und gesperrten Umfang', () => {
    const p = path.resolve('/x');
    expect(() => createList([{ path: p, reason: 'g', blocks: [] }])).toThrow(TypeError);
    expect(() => createList([{ path: p, reason: 'g', blocks: ['gibtsnicht'] }])).toThrow(TypeError);
    expect(() => createList([{ path: p, reason: 'g', blocks: ALL, kind: 'gibtsnicht' }])).toThrow(
      TypeError,
    );
    expect(() => createList([{ path: p, blocks: ALL }])).toThrow(TypeError);
  });
});

describe('resolveList', () => {
  it('liefert jeden Ort in Text- und aufgelöster Form, eingefroren und gekennzeichnet', async (ctx) => {
    const base = tempDir('em4me-geschuetzt-');
    const data = path.join(base, 'Daten');
    fs.mkdirSync(data);
    const alias = path.join(base, 'Daten-Verweis');
    try {
      fs.symlinkSync(data, alias, 'junction');
    } catch (err) {
      ctx.skip(`Verzeichnis-Knoten nicht anlegbar (${err.code})`);
    }
    const plain = createList([
      { path: alias, reason: 'verweis', blocks: ['write'] },
      { path: path.join(base, 'Neu'), reason: 'neu', blocks: ['write'] },
    ]);
    const resolved = await resolveList(plain);
    expect(resolved.entries.map((e) => [e.reason, e.path])).toEqual([
      ['verweis', alias],
      ['verweis', data],
      ['neu', path.join(base, 'Neu')],
    ]);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.entries)).toBe(true);
    expect(isResolvedList(resolved)).toBe(true);
    expect(isResolvedList(plain)).toBe(false);
    expect(isResolvedList({ entries: resolved.entries })).toBe(false);
  });

  it('eine Liste, die sich nicht auflösen lässt, wird nicht ausgegeben', async () => {
    const denied = Object.assign(new Error('verweigert'), { code: 'EACCES' });
    const fileSystem = {
      realpath: () => Promise.reject(denied),
      lstat: () => Promise.reject(denied),
    };
    const list = createList([{ path: path.resolve('/x'), reason: 'g', blocks: ['write'] }]);
    await expect(resolveList(list, { fileSystem })).rejects.toThrow('verweigert');
  });
});

describe('findProtectedPlace (rein)', () => {
  const root = path.resolve('/em4me-probe');
  const list = createList([
    { path: path.join(root, 'Daten'), reason: 'daten', blocks: ['write'] },
    { path: path.join(root, 'Profil'), reason: 'verborgen', blocks: ALL, kind: 'hiddenSubfolders' },
  ]);

  it('der Ort selbst und alles darunter, nur für den gesperrten Umfang', () => {
    expect(findProtectedPlace([path.join(root, 'Daten')], list, 'write').reason).toBe('daten');
    expect(
      findProtectedPlace([path.join(root, 'Daten', 'a', 'b.json')], list, 'write'),
    ).not.toBeNull();
    expect(findProtectedPlace([path.join(root, 'Daten', 'b.json')], list, 'read')).toBeNull();
  });

  it('ein Präfix-Nachbar ist nicht geschützt', () => {
    expect(findProtectedPlace([path.join(root, 'Daten2', 'a')], list, 'write')).toBeNull();
  });

  it('verborgene Unterordner: nur unter einem direkten Unterordner mit führendem Punkt', () => {
    const profile = path.join(root, 'Profil');
    expect(findProtectedPlace([path.join(profile, '.ssh', 'id')], list, 'read').reason).toBe(
      'verborgen',
    );
    expect(findProtectedPlace([path.join(profile, '.config')], list, 'read')).not.toBeNull();
    expect(findProtectedPlace([profile], list, 'read')).toBeNull();
    expect(
      findProtectedPlace([path.join(profile, 'Dokumente', '.git', 'x')], list, 'read'),
    ).toBeNull();
  });

  it('Schreibung: unter Windows derselbe Ort, unter Linux ein anderer', () => {
    expect(findProtectedPlace([path.join(root, 'DATEN', 'x')], list, 'write') !== null).toBe(
      isWindows,
    );
  });
});

describe('Geschützte Ordner innerhalb eines Bereichs', () => {
  it('Schreiben in Nutzerdaten, Add-ons, Sprachdateien, Einstellungs-Datei und Programm-Ordner wird abgewiesen', async () => {
    const { profile, program, data, list, book } = await setup();
    const targets = [
      path.join(data, 'config.json'),
      path.join(data, 'extensions', 'a', 'main.js'),
      path.join(data, 'extensions', 'neu', 'main.js'),
      path.join(data, 'locales', 'de.json'),
      path.join(program, 'resources', 'app.asar'),
    ];
    for (const target of targets) {
      for (const scope of ['write', 'create']) {
        expect(await check(book, list, target, scope), `${scope} ${target}`).toMatchObject({
          ok: false,
          code: 'protectedFolder',
        });
      }
    }
    // Positiv-Kontrolle: im übrigen Bereich wird geschrieben, dort gelesen.
    expect((await check(book, list, path.join(profile, 'Notiz.md'), 'write')).ok).toBe(true);
    expect((await check(book, list, path.join(data, 'config.json'), 'read')).ok).toBe(true);
  });

  it('auch über einen Verzeichnis-Knoten im Bereich, der in den Nutzerdaten-Ordner zeigt', async (ctx) => {
    const { profile, data, list, book } = await setup();
    try {
      fs.symlinkSync(data, path.join(profile, 'Abkuerzung'), 'junction');
    } catch (err) {
      ctx.skip(`Verzeichnis-Knoten nicht anlegbar (${err.code})`);
    }
    expect(
      await check(book, list, path.join(profile, 'Abkuerzung', 'config.json'), 'write'),
    ).toEqual({
      ok: false,
      code: 'protectedFolder',
      path: path.join(data, 'config.json'),
    });
  });

  it('auch wenn die Liste den Ordner über einen Verzeichnis-Knoten nennt und das Ziel den echten Ort', async (ctx) => {
    const { profile, data, book } = await setup();
    const alias = path.join(tempDir('em4me-alias-'), 'Daten-Verweis');
    try {
      fs.symlinkSync(data, alias, 'junction');
    } catch (err) {
      ctx.skip(`Verzeichnis-Knoten nicht anlegbar (${err.code})`);
    }
    const list = await resolveList(
      createProgramList({ programFolder: path.join(profile, 'Programm'), userDataFolder: alias }),
    );
    expect((await check(book, list, path.join(data, 'config.json'), 'write')).code).toBe(
      'protectedFolder',
    );
    expect((await check(book, list, path.join(profile, 'Notiz.md'), 'write')).ok).toBe(true);
  });

  it('ein geschützter Ordner lässt sich nicht als Bereich binden, ein Ordner, der ihn enthält, schon', async () => {
    const { profile, data, list } = await setup();
    const options = { scope: ALL, protectedFolders: list };
    expect((await checkRoot(data, options)).code).toBe('protectedFolder');
    expect((await checkRoot(path.join(data, 'extensions'), options)).code).toBe('protectedFolder');
    expect(await checkRoot(profile, options)).toEqual({
      ok: true,
      root: profile,
      chosenRoot: profile,
    });
    // Nur lesen darf ein Dialog auch dort freigeben (V5: Lesen bleibt möglich).
    expect(
      (await checkRoot(path.join(data, 'config.json'), { scope: ['read'], protectedFolders: list }))
        .ok,
    ).toBe(true);
  });
});

describe('Geschützte Ordner in der portablen Fassung', () => {
  it('der Daten-Ordner neben der Programmdatei und die Programmdatei sind geschützt, der Rest des Ordners nicht', async () => {
    const exeDir = tempDir('em4me-portabel-');
    const exe = path.join(exeDir, 'EM4me-portable.exe');
    fs.writeFileSync(exe, 'MZ');
    const unpacked = tempDir('em4me-entpackt-');
    const mode = ermittlePortablenBetrieb({
      programmPfad: path.join(unpacked, 'EM4me.exe'),
      gepackt: true,
      testUmlenkung: undefined,
      portableExeOrdner: exeDir,
    });
    expect(mode).toMatchObject({ portabel: true, beschreibbar: true });
    expect(mode.datenOrdner).toBe(path.join(exeDir, DATEN_ORDNER_NAME));
    fs.writeFileSync(path.join(mode.datenOrdner, 'config.json'), '{}');

    const list = await resolveList(
      createProgramList({
        programFolder: unpacked,
        userDataFolder: mode.datenOrdner,
        portableDataFolder: mode.datenOrdner,
        portableProgramFile: exe,
      }),
    );
    // Der Anwender öffnet den Ordner, in dem die portable Programmdatei liegt.
    const book = createGrantBook();
    book.grant(1, { root: exeDir, kind: 'area', scope: ALL, origin: 'dialog' });

    const config = path.join(mode.datenOrdner, 'config.json');
    expect((await check(book, list, config, 'write')).code).toBe('protectedFolder');
    expect(
      (await check(book, list, path.join(mode.datenOrdner, 'extensions', 'x.js'), 'create')).code,
    ).toBe('protectedFolder');
    expect((await check(book, list, exe, 'write')).code).toBe('protectedFolder');
    expect((await check(book, list, path.join(exeDir, 'Notiz.md'), 'create')).ok).toBe(true);
    expect((await check(book, list, config, 'read')).ok).toBe(true);
    expect((await checkRoot(exeDir, { scope: ALL, protectedFolders: list })).ok).toBe(true);
    expect((await checkRoot(mode.datenOrdner, { scope: ALL, protectedFolders: list })).code).toBe(
      'protectedFolder',
    );
  });
});
