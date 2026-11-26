// 4T-002647 (Epic 3E-000416): Die Prüf-Funktion «darf dieses Fenster diesen
// Pfad lesen oder schreiben» (AK2), unter Windows und unter Linux.
//
// Bestands-Lesungen: Das Vorbild ist `resolveAreaPath`
// (src/main/workflows/workflow-area-path.js), die Innerhalb-Prüfung
// `isInsideArea` (src/main/area/area-path.js). Der Verzeichnis-Knoten entsteht
// mit `fs.symlinkSync(…, 'junction')`, unter Windows ohne Verwalter-Rechte
// anlegbar; er steht auch für die gewählte Form einer Wurzel, die anders
// auflöst (zugeordnetes Netz-Laufwerk, Kurzname), weil sich ein zugeordnetes
// Laufwerk im Prüflauf nicht ohne Eingriff in das System anlegen lässt. Den
// Kurznamen liest `cmd.exe` (`%~sI`); ist die Kurznamen-Bildung des Laufwerks
// abgeschaltet, entfällt dieser Fall mit Grund.
//
// Jeder Ausbruch hat eine Positiv-Kontrolle daneben (Test-README, Regel 25):
// Ein Pfad innerhalb derselben Freigabe wird zugelassen. Eine Prüfung, die
// alles abweist, wäre sonst grün.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { AUFRAEUM_ZEITLIMIT, PROZESS_ZEITLIMIT } from '../zeitlimits.js';

// Der Kurzname-Fall startet einen realen Prozess (`cmd /c dir /x`); dafür das
// datei-weite Zeitlimit des Prüfbestands (Zeitlimit-Wächter, Regel Z1).
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const require = createRequire(import.meta.url);
const {
  checkPath,
  checkNameRules,
  checkRoot,
  CHECK_CODES,
} = require('../../src/main/grants/path-check.js');
const { createGrantBook, addonOwner } = require('../../src/main/grants/grant-book.js');
const { createList, resolveList } = require('../../src/main/grants/protected-folders.js');

const isWindows = process.platform === 'win32';
const ALL = ['read', 'write', 'create'];
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

// Ein Bereich mit einer Datei, daneben ein Ordner «Draussen» außerhalb.
function setup(scope = ALL) {
  const base = tempDir('em4me-freigabe-');
  const area = path.join(base, 'Bereich');
  const outside = path.join(base, 'Draussen');
  fs.mkdirSync(area);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(area, 'Notiz.md'), 'x');
  fs.writeFileSync(path.join(outside, 'Geheim.md'), 'x');
  const book = createGrantBook();
  const entry = book.grant(1, { root: area, kind: 'area', scope, origin: 'dialog' });
  return { base, area, outside, book, entry };
}

function check(book, p, scope = 'write', more = {}) {
  return checkPath({ book, windowId: 1, path: p, scope, protectedFolders: NONE, ...more });
}

// Verknüpfung anlegen; gelingt es nicht, entfällt der Fall sichtbar.
function link(ctx, target, at, type, reason) {
  try {
    fs.symlinkSync(target, at, type);
  } catch (err) {
    ctx.skip(`${reason} (${err.code})`);
  }
}

// Zählt die Datei-System-Aufrufe der Prüfung.
function countingFileSystem() {
  const calls = [];
  return {
    calls,
    realpath: (p) => (calls.push(p), fs.promises.realpath(p)),
    lstat: (p) => (calls.push(p), fs.promises.lstat(p)),
  };
}

describe('checkNameRules, Windows (auf jeder Plattform)', () => {
  it.each([
    ['leerer Pfad', '', 'emptyPath'],
    ['Null-Zeichen', 'C:\\Bereich\\a\0.md', 'nullChar'],
    ['Langpfad-Vorsilbe', '\\\\?\\C:\\Bereich\\a.md', 'devicePrefix'],
    ['Langpfad-Vorsilbe mit Schrägstrichen', '//?/C:/Bereich/a.md', 'devicePrefix'],
    ['Langpfad-Vorsilbe für Netz-Pfade', '\\\\?\\UNC\\server\\freigabe\\a.md', 'devicePrefix'],
    ['Geräte-Vorsilbe', '\\\\.\\C:\\Bereich\\a.md', 'devicePrefix'],
    ['NT-Vorsilbe', '\\??\\C:\\Bereich\\a.md', 'devicePrefix'],
    ['relativer Pfad', 'Bereich\\a.md', 'notAbsolute'],
    ['Wurzel des aktuellen Laufwerks', '\\Bereich\\a.md', 'notAbsolute'],
    ['Laufwerk ohne Trenner', 'C:Bereich\\a.md', 'notAbsolute'],
    ['alternativer Datenstrom', 'C:\\Bereich\\a.md:geheim', 'dataStream'],
    ['Datenstrom mit Typ-Angabe', 'C:\\Bereich\\a.md::$DATA', 'dataStream'],
    ['Datenstrom an einem Ordner', 'C:\\Bereich:geheim\\a.md', 'dataStream'],
    ['Datenstrom im Netz-Pfad', '\\\\server\\freigabe\\a.md:x', 'dataStream'],
    ['«..»', 'C:\\Bereich\\..\\Draussen\\Geheim.md', 'dotSegment'],
    ['«.»', 'C:\\Bereich\\.\\a.md', 'dotSegment'],
    ['Gerätename', 'C:\\Bereich\\CON', 'deviceName'],
    ['Gerätename mit Endung', 'C:\\Bereich\\nul.txt', 'deviceName'],
    ['Gerätename mit Leerzeichen vor der Endung', 'C:\\Bereich\\AUX .md', 'deviceName'],
    ['Gerätename mit hochgestellter Ziffer', 'C:\\Bereich\\COM\u00b9.md', 'deviceName'],
    ['Gerätename als Ordner', 'C:\\Bereich\\lpt1\\a.md', 'deviceName'],
    ['Konsolen-Gerät', 'C:\\Bereich\\CONIN$', 'deviceName'],
    ['Punkt am Ende', 'C:\\Bereich\\a.md.', 'trailingDotOrSpace'],
    ['Leerzeichen am Ende', 'C:\\Bereich\\a.md ', 'trailingDotOrSpace'],
    ['Punkt am Ende eines Ordners', 'C:\\Bereich\\Ordner.\\a.md', 'trailingDotOrSpace'],
    ['verbotenes Zeichen', 'C:\\Bereich\\a?.md', 'forbiddenChar'],
    ['Steuerzeichen', 'C:\\Bereich\\a\u0001.md', 'forbiddenChar'],
  ])('weist ab: %s', (_name, p, code) => {
    expect(checkNameRules(p, 'win32')).toBe(code);
    expect(CHECK_CODES).toContain(code);
  });

  it.each([
    'C:\\Bereich\\a.md',
    'c:/Bereich/Unterordner/a.md',
    'C:\\Bereich\\',
    '\\\\server\\freigabe\\a.md',
    'C:\\Bereich\\Console.md',
    'C:\\Bereich\\COM10.md',
    'C:\\Bereich\\.versteckt\\a.md',
    'C:\\Bereich\\EINSEH~1\\a.md',
    'C:\\Bereich\\a.b.md',
  ])('lässt zu: %s', (p) => {
    expect(checkNameRules(p, 'win32')).toBeNull();
  });
});

describe('checkNameRules, Linux (auf jeder Plattform)', () => {
  it.each([
    ['leerer Pfad', '', 'emptyPath'],
    ['kein Text', 42, 'emptyPath'],
    ['relativer Pfad', 'Bereich/a.md', 'notAbsolute'],
    ['Windows-Pfad', 'C:\\Bereich\\a.md', 'notAbsolute'],
    ['«..»', '/Bereich/../Draussen/Geheim.md', 'dotSegment'],
    ['«.»', '/Bereich/./a.md', 'dotSegment'],
    ['Null-Zeichen', '/Bereich/a\0.md', 'nullChar'],
  ])('weist ab: %s', (_name, p, code) => {
    expect(checkNameRules(p, 'linux')).toBe(code);
  });

  it.each([
    '/Bereich/a.md',
    '/Bereich/CON',
    '/Bereich/a.md:x',
    '/Bereich/a. ',
    '/Bereich/.ordner/a',
  ])('lässt zu (unter Linux gewöhnliche Namen): %s', (p) => {
    expect(checkNameRules(p, 'linux')).toBeNull();
  });
});

describe('checkPath: innerhalb einer Freigabe', () => {
  it('ein bestehendes Ziel wird zugelassen, zurück kommt der echte Ort samt Eintrag', async () => {
    const { area, book, entry } = setup();
    const res = await check(book, path.join(area, 'Notiz.md'));
    expect(res).toEqual({ ok: true, path: path.join(area, 'Notiz.md'), entry });
  });

  it('ein noch nicht bestehendes Ziel wird zugelassen: echter Vorfahre plus Rest', async () => {
    const { area, book } = setup();
    const res = await check(book, path.join(area, 'Neu', 'Tief', 'Neu.md'), 'create');
    expect(res).toMatchObject({ ok: true, path: path.join(area, 'Neu', 'Tief', 'Neu.md') });
  });

  it('die Wurzel der Freigabe selbst liegt innerhalb', async () => {
    const { area, book } = setup();
    expect((await check(book, area, 'read')).ok).toBe(true);
  });

  it('eine Freigabe eines anderen Fensters zählt nicht', async () => {
    const { area, book } = setup();
    const p = path.join(area, 'Notiz.md');
    const res = await checkPath({
      book,
      windowId: 2,
      path: p,
      scope: 'read',
      protectedFolders: NONE,
    });
    expect(res).toEqual({ ok: false, code: 'noGrant', path: p });
  });
});

describe('checkPath: Ausbrüche', () => {
  it('«..» wird am Text abgewiesen, der aufgelöste Außen-Pfad an der Freigabe', async () => {
    const { area, outside, book } = setup();
    const withDots = `${area}${path.sep}..${path.sep}Draussen${path.sep}Geheim.md`;
    expect(await check(book, withDots, 'read')).toEqual({
      ok: false,
      code: 'dotSegment',
      path: null,
    });
    expect((await check(book, path.join(outside, 'Geheim.md'), 'read')).code).toBe('noGrant');
    expect((await check(book, path.join(area, 'Notiz.md'), 'read')).ok).toBe(true);
  });

  it('ein Präfix-Nachbar der Wurzel liegt außerhalb', async () => {
    const { area, book } = setup();
    fs.mkdirSync(`${area}2`);
    expect((await check(book, path.join(`${area}2`, 'a.md'))).code).toBe('noGrant');
  });

  it('ein Verzeichnis-Knoten im Bereich mit Ziel außerhalb wird abgewiesen', async (ctx) => {
    const { area, outside, book } = setup();
    link(ctx, outside, path.join(area, 'Knoten'), 'junction', 'Verzeichnis-Knoten nicht anlegbar');
    expect(await check(book, path.join(area, 'Knoten', 'Geheim.md'), 'read')).toMatchObject({
      ok: false,
      code: 'linkOutside',
    });
    expect((await check(book, path.join(area, 'Knoten', 'Neu', 'Neu.md'))).code).toBe(
      'linkOutside',
    );
    expect((await check(book, path.join(area, 'Notiz.md'))).ok).toBe(true);
  });

  it('eine symbolische Verknüpfung im Bereich mit Ziel außerhalb wird abgewiesen', async (ctx) => {
    const { area, outside, book } = setup();
    link(
      ctx,
      path.join(outside, 'Geheim.md'),
      path.join(area, 'Verweis.md'),
      'file',
      'Symbolische Verknüpfung ohne das Recht dazu nicht anlegbar (Windows ohne Entwickler-Modus)',
    );
    expect((await check(book, path.join(area, 'Verweis.md'), 'read')).code).toBe('linkOutside');
  });

  it('eine Verknüpfung ohne Ziel wird abgewiesen, statt zum Eltern-Ordner aufzusteigen', async (ctx) => {
    const { area, outside, book } = setup();
    link(
      ctx,
      path.join(outside, 'Gibtsnicht'),
      path.join(area, 'Leer'),
      'junction',
      'Verzeichnis-Knoten nicht anlegbar',
    );
    expect((await check(book, path.join(area, 'Leer'))).code).toBe('danglingLink');
    expect((await check(book, path.join(area, 'Leer', 'Neu.md'))).code).toBe('danglingLink');
  });

  it.skipIf(!isWindows)(
    'Kurzname: aufgelöst zum langen Namen, ein geschützter Ordner wird auch so erkannt (nur Windows: Kurznamen gibt es unter Linux nicht)',
    async (ctx) => {
      const { area, book } = setup();
      const long = path.join(area, 'Ein sehr langer Ordnername');
      fs.mkdirSync(long);
      fs.writeFileSync(path.join(long, 'a.md'), 'x');
      const short = execFileSync(
        'cmd.exe',
        ['/d', '/s', '/c', `"for %I in ("${long}") do @echo %~sI"`],
        {
          encoding: 'utf8',
          windowsVerbatimArguments: true,
        },
      ).trim();
      const shortName = path.basename(short);
      if (shortName.toLowerCase() === path.basename(long).toLowerCase()) {
        ctx.skip('Kurznamen-Bildung auf diesem Laufwerk abgeschaltet');
      }
      const viaShort = path.join(area, shortName, 'a.md');
      expect(await check(book, viaShort, 'read')).toMatchObject({
        ok: true,
        path: path.join(long, 'a.md'),
      });
      const protectedFolders = await resolveList(
        createList([{ path: long, reason: 'probe', kind: 'folder', blocks: ['write'] }]),
      );
      expect(await check(book, viaShort, 'write', { protectedFolders })).toMatchObject({
        ok: false,
        code: 'protectedFolder',
      });
    },
  );

  it.skipIf(!isWindows)(
    'alternativer Datenstrom, Gerätename, Punkt und Leerzeichen am Ende, Langpfad- und Geräte-Vorsilbe (nur Windows: unter Linux gewöhnliche Namen, die Regeln selbst prüft der Block darüber)',
    async () => {
      const { area, book } = setup();
      const file = path.join(area, 'Notiz.md');
      const cases = [
        [`${file}:geheim`, 'dataStream'],
        [path.join(area, 'CON'), 'deviceName'],
        [path.join(area, 'nul.md'), 'deviceName'],
        [`${file}.`, 'trailingDotOrSpace'],
        [`${file} `, 'trailingDotOrSpace'],
        [`\\\\?\\${file}`, 'devicePrefix'],
        [`\\\\.\\${file}`, 'devicePrefix'],
      ];
      for (const [p, code] of cases) {
        expect(await check(book, p), p).toEqual({ ok: false, code, path: null });
      }
      expect((await check(book, file)).ok).toBe(true);
    },
  );

  it.skipIf(!isWindows)(
    'Netz-Pfad außerhalb wird abgewiesen, ohne die Platte zu berühren (nur Windows: unter Linux ist eine eingehängte Freigabe ein gewöhnlicher Pfad)',
    async () => {
      const { area, book } = setup();
      const fileSystem = countingFileSystem();
      const drive = area.slice(0, 1);
      const viaShare = `\\\\localhost\\${drive}$${area.slice(2)}\\Notiz.md`;
      for (const p of ['\\\\server\\freigabe\\Geheim.md', viaShare]) {
        expect(await check(book, p, 'read', { fileSystem })).toMatchObject({
          ok: false,
          code: 'noGrant',
        });
      }
      expect(fileSystem.calls).toEqual([]);
      // Positiv-Kontrolle: innerhalb wird die Platte befragt.
      expect((await check(book, path.join(area, 'Notiz.md'), 'read', { fileSystem })).ok).toBe(
        true,
      );
      expect(fileSystem.calls.length).toBeGreaterThan(0);
    },
  );

  it('Groß- und Kleinschreibung: unter Windows dieselbe Datei, unter Linux eine andere', async () => {
    const { area, book } = setup();
    const res = await check(book, path.join(area.toUpperCase(), 'NOTIZ.MD'), 'read');
    if (isWindows) {
      expect(res).toEqual({ ok: true, path: path.join(area, 'Notiz.md'), entry: book.query(1)[0] });
    } else {
      expect(res).toMatchObject({ ok: false, code: 'noGrant' });
    }
  });
});

describe('checkPath: gewählte und aufgelöste Form der Wurzel', () => {
  // Der Anwender öffnet den Bereich über einen Verzeichnis-Knoten «Verweis»;
  // so wirkt auch ein zugeordnetes Netz-Laufwerk oder ein Kurzname.
  async function viaAlias(ctx) {
    const { area, outside, base } = setup();
    const alias = path.join(tempDir('em4me-alias-'), 'Verweis');
    link(ctx, area, alias, 'junction', 'Verzeichnis-Knoten nicht anlegbar');
    const root = await checkRoot(alias, { scope: ALL, protectedFolders: NONE });
    const book = createGrantBook();
    book.grant(1, {
      root: root.root,
      chosenRoot: root.chosenRoot,
      kind: 'area',
      scope: ALL,
      origin: 'dialog',
    });
    return { area, outside, base, alias, root, book };
  }

  it('checkRoot liefert beide Formen', async (ctx) => {
    const { area, alias, root } = await viaAlias(ctx);
    expect(root).toEqual({ ok: true, root: area, chosenRoot: alias });
  });

  it('ein Pfad in der gewählten Form wird angenommen, zurück kommt der echte Ort', async (ctx) => {
    const { area, alias, book } = await viaAlias(ctx);
    expect(await check(book, path.join(alias, 'Notiz.md'), 'read')).toMatchObject({
      ok: true,
      path: path.join(area, 'Notiz.md'),
    });
    expect(await check(book, path.join(alias, 'Neu', 'Neu.md'), 'create')).toMatchObject({
      ok: true,
      path: path.join(area, 'Neu', 'Neu.md'),
    });
  });

  it('ein Pfad in der aufgelösten Form wird weiter angenommen', async (ctx) => {
    const { area, book } = await viaAlias(ctx);
    expect((await check(book, path.join(area, 'Notiz.md'))).ok).toBe(true);
  });

  it('aus der gewählten Form heraus bleiben «..» und eine Verknüpfung nach außen abgewiesen', async (ctx) => {
    const { area, outside, alias, book } = await viaAlias(ctx);
    const withDots = `${alias}${path.sep}..${path.sep}Draussen${path.sep}Geheim.md`;
    expect((await check(book, withDots, 'read')).code).toBe('dotSegment');
    link(ctx, outside, path.join(area, 'Knoten'), 'junction', 'Verzeichnis-Knoten nicht anlegbar');
    expect((await check(book, path.join(alias, 'Knoten', 'Geheim.md'), 'read')).code).toBe(
      'linkOutside',
    );
    expect((await check(book, path.join(path.dirname(alias), 'Fremd.md'), 'read')).code).toBe(
      'noGrant',
    );
  });

  it('ein geschützter Ordner wird in der gewählten Form am Text und über den echten Ort erkannt', async (ctx) => {
    const { area, alias, book } = await viaAlias(ctx);
    fs.mkdirSync(path.join(area, 'Daten'));
    const inChosen = await resolveList(
      createList([{ path: path.join(alias, 'Daten'), reason: 'probe', blocks: ['write'] }]),
    );
    const inReal = await resolveList(
      createList([{ path: path.join(area, 'Daten'), reason: 'probe', blocks: ['write'] }]),
    );
    const target = path.join(alias, 'Daten', 'config.json');
    for (const protectedFolders of [inChosen, inReal]) {
      expect((await check(book, target, 'write', { protectedFolders })).code).toBe(
        'protectedFolder',
      );
      expect(
        (await check(book, path.join(alias, 'Notiz.md'), 'write', { protectedFolders })).ok,
      ).toBe(true);
    }
  });

  it.skipIf(!isWindows)(
    'ein Netz-Pfad außerhalb beider Formen wird weiter ohne Platten-Zugriff abgewiesen (nur Windows: unter Linux ist eine eingehängte Freigabe ein gewöhnlicher Pfad)',
    async (ctx) => {
      const { alias, book } = await viaAlias(ctx);
      const fileSystem = countingFileSystem();
      expect(
        (await check(book, '\\\\server\\freigabe\\Geheim.md', 'read', { fileSystem })).code,
      ).toBe('noGrant');
      expect(fileSystem.calls).toEqual([]);
      expect((await check(book, path.join(alias, 'Notiz.md'), 'read', { fileSystem })).ok).toBe(
        true,
      );
      expect(fileSystem.calls.length).toBeGreaterThan(0);
    },
  );

  it('eine Wurzel, die durch einen Verzeichnis-Knoten nach außen ersetzt wurde, deckt nichts mehr', async (ctx) => {
    const { area, outside, book } = setup();
    fs.rmSync(area, { recursive: true, force: true });
    link(ctx, outside, area, 'junction', 'Verzeichnis-Knoten nicht anlegbar');
    // Die gewählte Form passt am Text; gezählt wird aber nur die Wurzel, die
    // beim Eintragen aufgelöst wurde.
    expect((await check(book, path.join(area, 'Geheim.md'), 'read')).code).toBe('linkOutside');
  });

  it('wird der Ort der gewählten Form gegen einen echten Ordner getauscht, deckt sie nichts mehr', async (ctx) => {
    const { alias, book } = await viaAlias(ctx);
    fs.rmSync(alias, { recursive: true, force: true });
    fs.mkdirSync(alias);
    fs.writeFileSync(path.join(alias, 'Fremd.md'), 'x');
    // Am Text liegt der Pfad in der gewählten Form; der echte Ort liegt aber
    // nicht mehr in der aufgelösten Wurzel, und nur die zählt hier.
    expect((await check(book, path.join(alias, 'Fremd.md'), 'read')).code).toBe('linkOutside');
  });

  it('eine nicht aufgelöst als «root» eingetragene Wurzel deckt nichts', async (ctx) => {
    const { area, alias } = await viaAlias(ctx);
    const book = createGrantBook();
    book.grant(1, { root: alias, kind: 'area', scope: ALL, origin: 'dialog' });
    expect((await check(book, path.join(alias, 'Notiz.md'), 'read')).code).toBe('linkOutside');
    expect((await check(book, path.join(area, 'Notiz.md'), 'read')).code).toBe('noGrant');
  });
});

describe('checkPath: Umfang, Inhaber, Art, Liste und Fehler', () => {
  it('Umfang «nur lesen» gegen Schreib-Wunsch wird abgewiesen, Lesen zugelassen', async () => {
    const { area, book } = setup(['read']);
    const file = path.join(area, 'Notiz.md');
    expect(await check(book, file, 'write')).toEqual({
      ok: false,
      code: 'scopeNotCovered',
      path: file,
    });
    expect((await check(book, file, 'create')).code).toBe('scopeNotCovered');
    expect((await check(book, file, 'read')).ok).toBe(true);
  });

  it('eine Freigabe eines Add-ons deckt nicht die Funktionen des Programms und umgekehrt', async () => {
    const base = tempDir('em4me-freigabe-');
    const book = createGrantBook();
    const owner = addonOwner('import-werkzeug');
    const handle = book.grant(1, {
      root: base,
      kind: 'folder',
      scope: ['read'],
      origin: 'dialog',
      owner,
    });
    const target = path.join(base, 'a.md');
    expect((await check(book, target, 'read')).code).toBe('noGrant');
    expect((await check(book, target, 'read', { owner })).ok).toBe(true);
    expect((await check(book, target, 'read', { owner, id: handle.id })).ok).toBe(true);
    expect((await check(book, target, 'read', { owner, id: 'gibtsnicht' })).code).toBe('noGrant');
  });

  it('eine Freigabe einer einzelnen Datei deckt genau diese Datei', async () => {
    const base = tempDir('em4me-freigabe-');
    const file = path.join(base, 'Gewählt.md');
    fs.writeFileSync(file, 'x');
    const book = createGrantBook();
    book.grant(1, { root: file, kind: 'file', scope: ALL, origin: 'dialog' });
    expect((await check(book, file)).ok).toBe(true);
    expect((await check(book, path.join(base, 'Nachbar.md'))).code).toBe('noGrant');
  });

  it('die aufgelöste Liste kostet je Prüfung keinen Datei-System-Aufruf', async () => {
    const { base, area, book } = setup();
    const list = await resolveList(
      createList([
        { path: path.join(base, 'Programm'), reason: 'a', blocks: ['write'] },
        { path: path.join(base, 'Daten'), reason: 'b', blocks: ['write'] },
        { path: path.join(area, 'Unter', 'Daten'), reason: 'c', blocks: ['write'] },
      ]),
    );
    const without = countingFileSystem();
    const withList = countingFileSystem();
    const target = path.join(area, 'Notiz.md');
    expect((await check(book, target, 'write', { fileSystem: without })).ok).toBe(true);
    expect(
      (await check(book, target, 'write', { fileSystem: withList, protectedFolders: list })).ok,
    ).toBe(true);
    expect(withList.calls).toEqual(without.calls);
    expect(withList.calls).toEqual([target]);
  });

  it('eine nicht aufgelöste Liste bricht laut, statt still nicht zu schützen', async () => {
    const { area, book } = setup();
    const target = path.join(area, 'Notiz.md');
    const plain = createList([{ path: area, reason: 'a', blocks: ['write'] }]);
    for (const protectedFolders of [plain, [], { entries: [] }, undefined]) {
      await expect(check(book, target, 'write', { protectedFolders })).rejects.toThrow(TypeError);
      await expect(checkRoot(area, { scope: ALL, protectedFolders })).rejects.toThrow(TypeError);
    }
  });

  it('Fehler beim Auflösen weist ab, statt durchzulassen', async () => {
    const { area, book } = setup();
    const denied = Object.assign(new Error('verweigert'), { code: 'EACCES' });
    const fileSystem = {
      realpath: () => Promise.reject(denied),
      lstat: () => Promise.reject(denied),
    };
    const file = path.join(area, 'Notiz.md');
    expect(await check(book, file, 'read', { fileSystem })).toEqual({
      ok: false,
      code: 'resolveFailed',
      path: file,
    });
  });

  it('eine Wurzel, die es nicht mehr gibt, deckt weiter nur ihren eigenen Pfad', async () => {
    const { area, outside, book } = setup();
    fs.rmSync(area, { recursive: true, force: true });
    expect(await check(book, path.join(area, 'Neu.md'), 'create')).toMatchObject({
      ok: true,
      path: path.join(area, 'Neu.md'),
    });
    expect((await check(book, path.join(outside, 'Geheim.md'))).code).toBe('noGrant');
  });

  it('eine Anfrage außerhalb des Vertrags bricht laut', async () => {
    const { area, book } = setup();
    await expect(check(book, path.join(area, 'Notiz.md'), 'gibtsnicht')).rejects.toThrow(TypeError);
    await expect(checkPath()).rejects.toThrow(TypeError);
  });
});

describe('checkRoot', () => {
  it('liefert den echten Ort, auch für eine noch nicht bestehende Datei', async () => {
    const base = tempDir('em4me-freigabe-');
    const file = path.join(base, 'Neu.md');
    expect(await checkRoot(file, { scope: ALL, protectedFolders: NONE })).toEqual({
      ok: true,
      root: file,
      chosenRoot: file,
    });
  });

  it('weist einen unzulässigen Namen und eine Verknüpfung ohne Ziel ab', async (ctx) => {
    const base = tempDir('em4me-freigabe-');
    expect((await checkRoot('relativ', { scope: ALL, protectedFolders: NONE })).code).toBe(
      'notAbsolute',
    );
    link(
      ctx,
      path.join(base, 'Fehlt'),
      path.join(base, 'Leer'),
      'junction',
      'Verzeichnis-Knoten nicht anlegbar',
    );
    expect(
      (await checkRoot(path.join(base, 'Leer'), { scope: ALL, protectedFolders: NONE })).code,
    ).toBe('danglingLink');
  });
});
