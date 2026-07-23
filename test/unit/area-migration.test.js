// 4T-0352 (Epic 3E-0064): Unit-Tests der stillen Bereichsdatei-Migration
// (.mddb -> .mdda). IO über gemockte deps; prüft die vier Fälle plus den
// Leerfall.
import { describe, it, expect, vi } from 'vitest';
import { readAreaSettingsRaw } from '../../src/main/area-migration.js';

const MDDA = '/area/Area_Settings.mdda';
const MDDB = '/area/Area_Settings.mddb';
const silentLog = { log: () => {}, warn: () => {} };

function makeDeps(overrides = {}) {
  return {
    mddaPath: MDDA,
    mddbPath: MDDB,
    readFile: vi.fn(),
    rename: vi.fn(async () => {}),
    markSelfWriting: vi.fn(),
    log: silentLog,
    ...overrides,
  };
}

describe('readAreaSettingsRaw — Bereichsdatei-Migration', () => {
  it('nutzt vorhandene .mdda ohne Migration', async () => {
    const readFile = vi.fn(async (p) => {
      if (p === MDDA) return 'MDDA';
      throw new Error('ENOENT');
    });
    const deps = makeDeps({ readFile });
    expect(await readAreaSettingsRaw(deps)).toBe('MDDA');
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it('migriert eine vorhandene .mddb auf .mdda (markSelfWriting + rename)', async () => {
    const readFile = vi.fn(async (p) => {
      if (p === MDDA) throw new Error('ENOENT');
      if (p === MDDB) return 'LEGACY';
      throw new Error('unexpected');
    });
    const deps = makeDeps({ readFile });
    expect(await readAreaSettingsRaw(deps)).toBe('LEGACY');
    expect(deps.markSelfWriting).toHaveBeenCalledWith(MDDA, 'LEGACY');
    expect(deps.rename).toHaveBeenCalledWith(MDDB, MDDA);
  });

  it('gewinnt .mdda, wenn beide existieren (keine Migration)', async () => {
    // readFile(.mdda) ist sofort erfolgreich, die .mddb wird nie angefasst.
    const readFile = vi.fn(async (p) => (p === MDDA ? 'MDDA' : 'LEGACY'));
    const deps = makeDeps({ readFile });
    expect(await readAreaSettingsRaw(deps)).toBe('MDDA');
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it('liest bei fehlgeschlagenem rename die .mddb weiter (Fallback)', async () => {
    const readFile = vi.fn(async (p) => {
      if (p === MDDA) throw new Error('ENOENT');
      if (p === MDDB) return 'LEGACY';
      throw new Error('unexpected');
    });
    const rename = vi.fn(async () => {
      throw new Error('EBUSY');
    });
    const deps = makeDeps({ readFile, rename });
    expect(await readAreaSettingsRaw(deps)).toBe('LEGACY');
  });

  it('gibt undefined, wenn weder .mdda noch .mddb existieren', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const deps = makeDeps({ readFile });
    expect(await readAreaSettingsRaw(deps)).toBe(undefined);
    expect(deps.rename).not.toHaveBeenCalled();
  });
});
