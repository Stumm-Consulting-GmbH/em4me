// 4T-001758 (Epic 3E-000253, AK6): Unit-Tests der Anzeige-Einstellung der
// Datenbank — Ablage in der Bereichsdatei, Zurücklesen und die Fehler-Regel.
//
// Gearbeitet wird an einem echten Temp-Verzeichnis (Muster
// area-start-page.test.js), weil die Modul-Funktionen ihr fs selbst requiren
// und der Test damit zugleich die reale Serialisierung des Containers prüft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbconfig-'));
  tmpDirs.push(dir);
  return dir;
}

function makeConfig() {
  return createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: vi.fn(),
    mddStore,
    attachmentPath: {},
    resolveTemplatesConfig: () => ({}),
  });
}

function mddaPath(root) {
  return path.join(root, mddStore.MDDA_FILENAME);
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('Datenbank-Anzeige: Ablage in der Bereichsdatei (AK6)', () => {
  it('legt die Bereichsdatei erst beim ersten Einschalten an', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    expect(fs.existsSync(mddaPath(root))).toBe(false);

    // Der Vorgabewert legt nichts an: Wer die Option nie anfasst, hinterlässt
    // keine Datei im Bereich.
    expect(await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: false })).toEqual({
      ok: true,
    });
    expect(fs.existsSync(mddaPath(root))).toBe(false);

    expect(await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true })).toEqual({ ok: true });
    expect(fs.existsSync(mddaPath(root))).toBe(true);
  });

  it('schreibt und liest die Option zurück', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true });

    expect(await cfg.readAreaDatabaseConfig(root)).toEqual({ overviewOnOpen: true });
    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.database).toEqual({ overviewOnOpen: true });
  });

  it('entfernt die Sektion beim Ausschalten, statt ein leeres Feld zu hinterlassen', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true });
    await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: false });

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.database).toBeUndefined();
    expect(await cfg.readAreaDatabaseConfig(root)).toBeUndefined();
  });

  it('lässt fremde Sektionen der Bereichsdatei unberührt', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const container = mddStore.emptySettingsContainer();
    container.settings.startPage = 'Start.md';
    fs.writeFileSync(mddaPath(root), mddStore.serializeContainer(container), 'utf8');

    await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true });
    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.startPage).toBe('Start.md');
    expect(roh.settings.database.overviewOnOpen).toBe(true);
  });

  it('überschreibt eine defekte Bereichsdatei nie', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    fs.writeFileSync(mddaPath(root), '{ kein json', 'utf8');

    const ergebnis = await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true });
    expect(ergebnis.ok).toBe(false);
    expect(fs.readFileSync(mddaPath(root), 'utf8')).toBe('{ kein json');
    // Und das Lesen wirkt wie «nicht gesetzt».
    expect(await cfg.readAreaDatabaseConfig(root)).toBeUndefined();
  });
});

describe('Datenbank-Anzeige: wirksamer Stand', () => {
  it('behandelt fehlende, leere und unbrauchbare Werte als «aus»', () => {
    const cfg = makeConfig();
    expect(cfg.normalisiereDatenbankKonfig(undefined)).toEqual({ overviewOnOpen: false });
    expect(cfg.normalisiereDatenbankKonfig({})).toEqual({ overviewOnOpen: false });
    expect(cfg.normalisiereDatenbankKonfig([])).toEqual({ overviewOnOpen: false });
    // Nur der echte Wahrheitswert schaltet ein; eine von Hand geschriebene
    // Zeichenkette «true» tut es nicht.
    expect(cfg.normalisiereDatenbankKonfig({ overviewOnOpen: 'true' })).toEqual({
      overviewOnOpen: false,
    });
    expect(cfg.normalisiereDatenbankKonfig({ overviewOnOpen: true })).toEqual({
      overviewOnOpen: true,
    });
  });
});
