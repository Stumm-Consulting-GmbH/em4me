// 4T-002922 (Epic 3E-000416): Regressionstest zum Speicherfehler beim ersten
// Start. Belegter Auslöser (Nachstellung in der Prüfmaschine am 2026-11-26):
// Beim allerersten Start ermittelt das Programm die Liste der geschützten
// Ordner, während der Einstellungs-Speicher die Einstellungs-Datei erst anlegt.
// Die Frage nach dem echten Ort der Datei fand sie noch nicht, die folgende
// Frage, ob dort etwas liegt, fand sie schon; das galt als verwaiste
// Verknüpfung, und die ganze Liste blieb für den Programmlauf verworfen, sodass
// jeder schreibende Kanal mit `protectedListUnavailable` abwies.
//
// Geprüft wird an beiden Stellen der Behebung: die Auflösung eines Eintrags,
// der zwischen den beiden Fragen entsteht (AK3), und die Quelle der Liste, die
// eine gescheiterte Ermittlung beim nächsten Aufruf neu versucht, ohne je ein
// Ziel ohne Liste durchzulassen (AK1, AK2), samt Protokoll-Zeile ohne Pfad
// (AK4).
//
// Bestands-Lesungen: keine. Der Wettlauf wird über die Datei-System-Naht
// (`fileSystem`) nachgestellt, die die Module für Prüffälle anbieten; alles
// Übrige läuft an Wegwerf-Ordnern über dieselben Wege wie beim Start.
import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { realLocation } = require('../../src/main/grants/path-check.js');
const { createListSource, isResolvedList } = require('../../src/main/grants/protected-folders.js');
const { resolveProgramList } = require('../../src/main/grants/binding-grants.js');
const { createChannelGuard } = require('../../src/main/ipc/channel-guard.js');

const BASE = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-erststart-')));
const PROGRAM = path.join(BASE, 'Programm');
const DATA = path.join(BASE, 'Daten');
const SETTINGS = path.join(DATA, 'config.json');
const OUTSIDE = path.join(BASE, 'Draussen');
for (const dir of [PROGRAM, DATA, OUTSIDE]) fs.mkdirSync(dir, { recursive: true });

afterAll(() => {
  try {
    fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
});

// Erster Start: Daten-Ordner leer, die Einstellungs-Datei entsteht erst.
const START = {
  execPath: path.join(PROGRAM, 'EM4me.exe'),
  userDataFolder: DATA,
  portableMode: { portabel: false, datenOrdner: null },
};

function enoent(p) {
  const err = new Error(`ENOENT: no such file or directory, realpath '${p}'`);
  err.code = 'ENOENT';
  return err;
}

// Datei-System, das den Ablauf des ersten Starts nachstellt: Die erste Frage
// nach dem echten Ort von `target` findet nichts; danach entsteht die Datei,
// bevor die zweite Frage kommt.
function racingFileSystem(target) {
  let first = true;
  return {
    realpath: async (p) => {
      if (first && p === target) {
        first = false;
        fs.writeFileSync(target, '{}');
        throw enoent(p);
      }
      return fsPromises.realpath(p);
    },
    lstat: (p) => fsPromises.lstat(p),
  };
}

describe('Ein Eintrag, der zwischen den beiden Fragen entsteht (AK3)', () => {
  it('lässt die Liste beim ersten Start nicht scheitern', async () => {
    fs.rmSync(SETTINGS, { force: true });
    const list = await resolveProgramList(START, { fileSystem: racingFileSystem(SETTINGS) });
    expect(isResolvedList(list)).toBe(true);
    expect(list.entries.some((e) => e.reason === 'settingsFile')).toBe(true);
  });

  it('wird zu seinem echten Ort aufgelöst', async () => {
    const target = path.join(DATA, 'Neu.json');
    fs.rmSync(target, { force: true });
    expect(await realLocation(target, racingFileSystem(target))).toBe(
      fs.realpathSync.native(target),
    );
  });

  it('eine echte Verknüpfung ohne Ziel bleibt abgewiesen', async () => {
    const leer = path.join(DATA, 'Leer');
    const fileSystem = {
      realpath: async (p) => {
        if (p === leer) throw enoent(p);
        return fsPromises.realpath(p);
      },
      lstat: async (p) => {
        if (p === leer) return { isFile: () => false, isDirectory: () => false };
        return fsPromises.lstat(p);
      },
    };
    await expect(realLocation(leer, fileSystem)).rejects.toMatchObject({
      checkCode: 'danglingLink',
    });
  });
});

// Eine Quelle, deren Ermittlungen nach der Reihe scheitern oder gelingen.
function sequence(outcomes) {
  let n = 0;
  const resolve = vi.fn(async () => {
    const outcome = outcomes[Math.min(n, outcomes.length - 1)];
    n += 1;
    if (outcome === 'fail') {
      const err = new Error('danglingLink');
      err.checkCode = 'danglingLink';
      throw err;
    }
    return resolveProgramList(START);
  });
  return resolve;
}

function guardWith(resolve) {
  const warn = vi.fn();
  const source = createListSource(resolve, { warn });
  const guard = createChannelGuard({
    protectedFolders: source,
    areaRootOf: (event) => event.areaRoot,
    warn: vi.fn(),
  });
  return { guard, source, warn };
}

async function save(guard, dir) {
  const handler = vi.fn(async () => ({ ok: true }));
  const result = await guard.wrap('file:save', handler)(
    { sender: { id: 1 }, areaRoot: dir },
    path.join(dir, 'a.md'),
    'x',
    {},
  );
  return { result, handler };
}

// Genau eine Protokoll-Zeile, und kein Argument enthält den Wegwerf-Ordner.
// Gesucht wird in den Argumenten selbst, nicht in ihrer JSON-Form, die unter
// Windows jeden Backslash verdoppelt und die Suche so leer liefe.
function expectNoPath(warn) {
  expect(warn).toHaveBeenCalledTimes(1);
  for (const arg of warn.mock.calls.flat()) expect(String(arg)).not.toContain(BASE);
}

describe('Die Quelle der Liste nach einer gescheiterten Ermittlung', () => {
  it('ermittelt beim nächsten Aufruf neu und prüft gegen die neue Liste (AK2)', async () => {
    const resolve = sequence(['fail', 'ok']);
    const { guard, source } = guardWith(resolve);
    await expect(source()).rejects.toThrow('danglingLink');
    const outside = await save(guard, OUTSIDE);
    expect(outside.result).toEqual({ ok: true });
    expect(outside.handler).toHaveBeenCalledTimes(1);
    const program = await save(guard, PROGRAM);
    expect(program.result).toEqual({ ok: false, error: 'guard:protectedFolder' });
    expect(program.handler).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('weist jeden Aufruf ab, solange die Ermittlung scheitert, und versucht sie je Aufruf neu (AK1)', async () => {
    const resolve = sequence(['fail']);
    const { guard, source } = guardWith(resolve);
    await expect(source()).rejects.toThrow('danglingLink');
    for (let i = 0; i < 3; i += 1) {
      const { result, handler } = await save(guard, OUTSIDE);
      expect(result).toEqual({ ok: false, error: 'guard:protectedListUnavailable' });
      expect(handler).not.toHaveBeenCalled();
    }
    expect(resolve).toHaveBeenCalledTimes(4);
  });

  it('hält eine gelungene Liste fest und teilt eine laufende Ermittlung', async () => {
    const resolve = sequence(['ok']);
    const { source } = guardWith(resolve);
    const [a, b] = await Promise.all([source(), source()]);
    expect(a).toBe(b);
    expect(await source()).toBe(a);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('ermittelt auch nach einem sofortigen Wurf beim nächsten Aufruf neu', async () => {
    let n = 0;
    const resolve = vi.fn(() => {
      n += 1;
      if (n === 1) throw new Error('sofort');
      return resolveProgramList(START);
    });
    const { source } = guardWith(resolve);
    await expect(source()).rejects.toThrow('sofort');
    expect(isResolvedList(await source())).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('schreibt den Grund ohne Pfad ins Protokoll (AK4)', async () => {
    const resolve = vi.fn(async () => {
      throw enoent(path.join(DATA, 'geheim'));
    });
    const { source, warn } = guardWith(resolve);
    await expect(source()).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith('Liste der geschützten Ordner nicht ermittelbar:', 'ENOENT');
    expectNoPath(warn);
  });

  it('nennt den betroffenen Eintrag der Liste, nicht seinen Pfad (AK4)', async () => {
    fs.writeFileSync(SETTINGS, '{}');
    const fileSystem = {
      realpath: async (p) => {
        if (p === SETTINGS) throw enoent(p);
        return fsPromises.realpath(p);
      },
      lstat: (p) => fsPromises.lstat(p),
    };
    const { source, warn } = guardWith(() => resolveProgramList(START, { fileSystem }));
    await expect(source()).rejects.toMatchObject({ checkCode: 'danglingLink' });
    expect(warn).toHaveBeenCalledWith(
      'Liste der geschützten Ordner nicht ermittelbar:',
      'danglingLink (settingsFile)',
    );
    expectNoPath(warn);
  });
});
