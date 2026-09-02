// 4T-1364 (Epic 3E-0171): Unit-Tests der Start-Seiten-Festlegung eines
// Bereichs — Ablage in der Bereichsdatei, Aufloesung und Ungueltig-Faelle.
//
// Gearbeitet wird an einem echten Temp-Verzeichnis (Muster area-stats.test.js),
// weil die Modul-Funktionen ihr fs selbst requiren und der Test damit zugleich
// die reale Serialisierung des Containers prueft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-startpage-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content = '# Inhalt\n') {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
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

describe('Start-Seite: Ablage in der Bereichsdatei', () => {
  it('legt die Bereichsdatei erst beim ersten Setzen an', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    expect(fs.existsSync(mddaPath(root))).toBe(false);

    // Entfernen ohne bestehende Datei legt nichts an.
    expect(await cfg.writeAreaStartPage(root, null)).toEqual({ ok: true });
    expect(fs.existsSync(mddaPath(root))).toBe(false);

    expect(await cfg.writeAreaStartPage(root, 'Start.md')).toEqual({ ok: true });
    expect(fs.existsSync(mddaPath(root))).toBe(true);
  });

  it('speichert einen wurzel-relativen Pfad, nicht den absoluten', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const datei = write(root, path.join('Ordner', 'Start.md'));

    const relativ = cfg.startPageRelative(root, datei);
    expect(relativ).toBe('Ordner/Start.md');
    await cfg.writeAreaStartPage(root, relativ);

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.startPage).toBe('Ordner/Start.md');
    expect(roh.settings.startPage).not.toContain(root);
  });

  it('liest die Festlegung zurueck und entfernt sie wieder', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    await cfg.writeAreaStartPage(root, 'Start.md');
    expect(await cfg.readAreaStartPage(root)).toBe('Start.md');

    await cfg.writeAreaStartPage(root, null);
    expect(await cfg.readAreaStartPage(root)).toBeUndefined();
    // Die Datei bleibt bestehen, nur die Sektion ist fort.
    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.startPage).toBeUndefined();
  });

  it('laesst fremde Sektionen der Bereichsdatei unberuehrt', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const container = mddStore.emptySettingsContainer();
    container.settings.history = true;
    fs.writeFileSync(mddaPath(root), mddStore.serializeContainer(container), 'utf8');

    await cfg.writeAreaStartPage(root, 'Start.md');
    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.history).toBe(true);
    expect(roh.settings.startPage).toBe('Start.md');
  });

  it('ueberschreibt eine defekte Bereichsdatei nie', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    fs.writeFileSync(mddaPath(root), '{ kein json', 'utf8');

    const ergebnis = await cfg.writeAreaStartPage(root, 'Start.md');
    expect(ergebnis.ok).toBe(false);
    expect(fs.readFileSync(mddaPath(root), 'utf8')).toBe('{ kein json');
    // Und das Lesen wirkt wie "nicht gesetzt".
    expect(await cfg.readAreaStartPage(root)).toBeUndefined();
  });
});

describe('Start-Seite: Aufloesung', () => {
  it('liefert null ohne Festlegung', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    expect(await cfg.resolveAreaStartPage(root)).toBeNull();
  });

  it('loest eine vorhandene Datei auf', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const datei = write(root, 'Start.md');
    await cfg.writeAreaStartPage(root, 'Start.md');

    const resolved = await cfg.resolveAreaStartPage(root);
    expect(resolved).toEqual({ path: datei, missing: false });
  });

  it('meldet eine geloeschte Ziel-Datei als missing statt zu werfen', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const datei = write(root, 'Start.md');
    await cfg.writeAreaStartPage(root, 'Start.md');
    fs.rmSync(datei);

    const resolved = await cfg.resolveAreaStartPage(root);
    expect(resolved).toEqual({ path: datei, missing: true });
  });

  it('meldet einen Ordner als Ziel ebenfalls als missing', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    fs.mkdirSync(path.join(root, 'Start.md'));
    await cfg.writeAreaStartPage(root, 'Start.md');

    const resolved = await cfg.resolveAreaStartPage(root);
    expect(resolved.missing).toBe(true);
  });

  it('weist ein Ziel ausserhalb der Bereichs-Grenze ab', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    // Festlegung von Hand auf einen Pfad ausserhalb des Bereichs setzen; der
    // Schreib-Weg laesst das nicht zu, eine von Hand bearbeitete oder mit dem
    // Ordner verschobene Bereichsdatei kann es aber enthalten.
    await cfg.writeAreaStartPage(root, '../Fremd.md');

    const resolved = await cfg.resolveAreaStartPage(root);
    expect(resolved.missing).toBe(true);
  });

  it('behandelt einen Nicht-String-Wert wie keine Festlegung', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const container = mddStore.emptySettingsContainer();
    container.settings.startPage = 42;
    fs.writeFileSync(mddaPath(root), mddStore.serializeContainer(container), 'utf8');

    expect(await cfg.readAreaStartPage(root)).toBeUndefined();
    expect(await cfg.resolveAreaStartPage(root)).toBeNull();
  });
});

describe('Start-Seite: Pfad-Umrechnung', () => {
  it('weist einen Pfad ausserhalb des Bereichs ab', () => {
    const root = makeRoot();
    const cfg = makeConfig();
    expect(cfg.startPageRelative(root, path.join(root, '..', 'Fremd.md'))).toBeNull();
  });

  it('nutzt POSIX-Trenner, damit die Festlegung plattformuebergreifend traegt', () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const tief = path.join(root, 'a', 'b', 'Start.md');
    expect(cfg.startPageRelative(root, tief)).toBe('a/b/Start.md');
  });
});
