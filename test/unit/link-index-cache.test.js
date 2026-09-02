// 4T-000348 (Epic 3E-000062): Bereichs-Index-Persistenz (Area_Cache.mdda).
//
// Zwei Ebenen: (1) reine Container-Funktionen aus mdd-store (Roundtrip, defekte
// bzw. versions-fremde Datei); (2) der Warmstart-Abgleich in backlinks.js ueber
// die oeffentliche API. Der Nachweis, dass unveraenderte Dateien NICHT neu
// geparst werden, laeuft deterministisch: ein manuell geschriebener Cache mit
// bewusst vom Disk-Stand abweichendem Parse-Ergebnis. Stimmen mtime+size, muss
// der Index den Cache-Stand zeigen (kein Neu-Parsen); bei mtime-Mismatch den
// Disk-Stand (Neu-Parsen).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emptyCacheContainer,
  parseCacheContainer,
  serializeCacheContainer,
  MDDA_CACHE_FILENAME,
  MDDA_CACHE_SCHEMA_VERSION,
  MDD_SCHEMA_VERSION,
} from '../../src/main/documents/mdd-store.js';
import { backlinksFor, rootForActiveFile, releaseRoot } from '../../src/main/backlinks.js';

// --- Teil 1: Container (rein) -----------------------------------------------

describe('mdd-store — Area_Cache-Container', () => {
  it('emptyCacheContainer hat die erwartete Struktur', () => {
    expect(emptyCacheContainer()).toEqual({
      schemaVersion: MDDA_CACHE_SCHEMA_VERSION,
      linkIndex: { files: {} },
    });
  });

  it('Serialisierung ist kompakt (ohne Einrueckung) und roundtrip-fest', () => {
    const c = emptyCacheContainer();
    c.linkIndex.files['sub/A.md'] = {
      mtimeMs: 123,
      size: 45,
      hash: 'abc',
      // 4T-000354: Properties-Map im parsed-Objekt muss den Roundtrip überstehen.
      parsed: {
        hits: [],
        aliases: ['X'],
        headings: ['h'],
        blockIds: [],
        tags: ['t'],
        properties: { bereich: 'privat', tags: ['rot', 'rund'] },
      },
    };
    const serialized = serializeCacheContainer(c);
    // Kompakt: keine zwei-Leerzeichen-Einrueckung wie bei .mdd/Settings.
    expect(serialized).not.toContain('\n  ');
    const parsed = parseCacheContainer(serialized);
    expect(parsed.ok).toBe(true);
    expect(parsed.container).toEqual(c);
  });

  it('defektes JSON, versions-fremde und strukturell defekte Container werden abgelehnt', () => {
    expect(parseCacheContainer('{ kaputt').ok).toBe(false);
    // 4T-000354: die Vorgänger-Version 1 ist nach dem Bump auf 2 versions-fremd.
    expect(
      parseCacheContainer(JSON.stringify({ schemaVersion: 1, linkIndex: { files: {} } })).ok,
    ).toBe(false);
    // Aktuelle Version, aber linkIndex fehlt bzw. ist strukturell defekt.
    expect(
      parseCacheContainer(JSON.stringify({ schemaVersion: MDDA_CACHE_SCHEMA_VERSION })).ok,
    ).toBe(false);
    expect(
      parseCacheContainer(
        JSON.stringify({ schemaVersion: MDDA_CACHE_SCHEMA_VERSION, linkIndex: { files: [] } }),
      ).ok,
    ).toBe(false);
  });

  // 4T-000354 (Epic 3E-000065): der Cache trägt eine eigene schemaVersion, damit ihr
  // Bump die History-.mdd- und Settings-Container (MDD_SCHEMA_VERSION) nicht
  // invalidiert.
  it('Cache-schemaVersion ist von der History-/Settings-Version entkoppelt', () => {
    expect(MDDA_CACHE_SCHEMA_VERSION).not.toBe(MDD_SCHEMA_VERSION);
    // Ein Container mit der History-/Settings-Version wird vom Cache-Parser als
    // fremd verworfen; die Cache-Version steht damit unabhängig für sich.
    expect(
      parseCacheContainer(
        JSON.stringify({ schemaVersion: MDD_SCHEMA_VERSION, linkIndex: { files: {} } }),
      ).ok,
    ).toBe(false);
  });
});

// --- Teil 2: Warmstart-Abgleich (backlinks-API) ------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-cache-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Schreibt eine Area_Cache.mdda mit einem einzelnen Datei-Eintrag. mtimeMs/size
// werden per Default aus der realen Datei uebernommen (Abgleich stimmt), koennen
// aber ueberschrieben werden (Mismatch-Test).
function writeCacheFor(root, relPath, hits, overrides = {}) {
  const abs = path.join(root, relPath);
  const st = fs.statSync(abs);
  const container = emptyCacheContainer();
  container.linkIndex.files[relPath] = {
    mtimeMs: overrides.mtimeMs !== undefined ? overrides.mtimeMs : st.mtimeMs,
    size: overrides.size !== undefined ? overrides.size : st.size,
    hash: 'testhash',
    parsed: { hits, aliases: [], headings: [], blockIds: [], tags: [] },
  };
  fs.writeFileSync(
    path.join(root, MDDA_CACHE_FILENAME),
    serializeCacheContainer(container),
    'utf8',
  );
}

async function indexForArea(activeFile, areaRoot) {
  let result = backlinksFor(activeFile, undefined, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, undefined, areaRoot);
  }
  return result;
}

function sourceBasenames(result) {
  return (result.results || []).map((r) => path.basename(r.quelldatei));
}

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows-Handle ggf. noch gesperrt: Temp-Rest ist unkritisch. */
    }
  }
  tmpDirs = [];
});

describe('backlinks.js — Warmstart aus Area_Cache (4T-000348)', () => {
  it('uebernimmt bei passendem mtime+size das Cache-Parse-Ergebnis (kein Neu-Parsen)', async () => {
    const root = makeRoot();
    // Auf Disk verweist die Quelle auf [[Disk]]; der Cache behauptet [[Cache]].
    write(root, 'Quelle.md', 'Verweis auf [[Disk]]\n');
    write(root, 'Cache.md', '# Cache\n');
    write(root, 'Disk.md', '# Disk\n');
    writeCacheFor(root, 'Quelle.md', [
      {
        zeile: 1,
        linkTyp: 'wiki',
        zielBasename: 'Cache',
        zielAbsolut: null,
        anker: null,
        snippet: '[[Cache]]',
      },
    ]);

    // Cache-Stand gewinnt: Backlink auf Cache.md existiert, auf Disk.md nicht.
    const cacheHit = await indexForArea(path.join(root, 'Cache.md'), root);
    expect(cacheHit.status).toBe('ready');
    expect(sourceBasenames(cacheHit)).toContain('Quelle.md');

    const diskHit = await indexForArea(path.join(root, 'Disk.md'), root);
    expect(sourceBasenames(diskHit)).not.toContain('Quelle.md');
  });

  it('parst bei mtime-Mismatch neu (Cache verworfen)', async () => {
    const root = makeRoot();
    write(root, 'Quelle.md', 'Verweis auf [[Disk]]\n');
    write(root, 'Cache.md', '# Cache\n');
    write(root, 'Disk.md', '# Disk\n');
    // Cache traegt [[Cache]], aber mit veraltetem mtime -> Abgleich schlaegt fehl.
    writeCacheFor(
      root,
      'Quelle.md',
      [
        {
          zeile: 1,
          linkTyp: 'wiki',
          zielBasename: 'Cache',
          zielAbsolut: null,
          anker: null,
          snippet: '[[Cache]]',
        },
      ],
      { mtimeMs: 1 },
    );

    // Disk-Stand gewinnt: Backlink auf Disk.md, nicht auf Cache.md.
    const diskHit = await indexForArea(path.join(root, 'Disk.md'), root);
    expect(diskHit.status).toBe('ready');
    expect(sourceBasenames(diskHit)).toContain('Quelle.md');

    const cacheHit = await indexForArea(path.join(root, 'Cache.md'), root);
    expect(sourceBasenames(cacheHit)).not.toContain('Quelle.md');
  });

  it('loest wurzel-relative md-Link-Ziele aus dem Cache korrekt auf (Umzugs-Toleranz)', async () => {
    const root = makeRoot();
    write(root, 'Quelle.md', '# Quelle ohne Link auf Disk\n');
    write(root, 'Ziel.md', '# Ziel\n');
    // Cache traegt einen md-Link als wurzel-relatives zielRel; beim Laden muss
    // er gegen die aktuelle Wurzel zu einem absoluten Ziel aufgeloest werden.
    writeCacheFor(root, 'Quelle.md', [
      {
        zeile: 1,
        linkTyp: 'md',
        zielBasename: null,
        zielRel: 'Ziel.md',
        anker: null,
        snippet: '[Z](Ziel.md)',
      },
    ]);

    const res = await indexForArea(path.join(root, 'Ziel.md'), root);
    expect(res.status).toBe('ready');
    expect(sourceBasenames(res)).toContain('Quelle.md');
  });
});
