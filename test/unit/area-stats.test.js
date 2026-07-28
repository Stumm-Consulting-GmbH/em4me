// 4T-0619 (Epic 3E-0117): Unit-Tests der Kennzahlen-Erhebung eines Bereichs
// (statsFor im Index plus ergaenzender Scan in area-stats.js). Alle
// Erwartungswerte sind am angelegten Fixture-Verzeichnis von Hand
// nachgerechnet und stehen als Zahl im Test, nicht als Rechnung.
// Setup-/Teardown-Muster wie graph-index.test.js (Temp-Verzeichnis,
// Soft-Timer per Fake-Timer feuern).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  releaseRoot,
  rootForActiveFile,
  statsFor,
} from '../../src/main/backlinks.js';
import { collectAreaStats } from '../../src/main/area-stats.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, ownerKey, areaRoot) {
  let result = backlinksFor(activeFile, ownerKey, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, areaRoot);
  }
  return result;
}

// Aufloeser der Aufgaben-Zustaende in der Auslieferungs-Belegung: '/' laeuft,
// '-' ist abgebrochen, ' ' und 'x' sind die festen Basis-Zeichen.
function statusTypeOf(ch) {
  if (ch === 'x' || ch === 'X') return 'DONE';
  if (ch === '-') return 'CANCELLED';
  if (ch === '/') return 'IN_PROGRESS';
  if (ch === ' ') return 'TODO';
  return null;
}

// Fixture-Bereich mit bekanntem Bestand:
//   Markdown  4 Dateien (Start, Ziel, Unter/Tief, Verwaist)
//   Ordner    2 (Unter, Anlagen); .git bleibt draussen
//   Bilder    1 (12 Bytes), PDF 1 (5 Bytes), Sonstige 1 (3 Bytes)
//   .mdd      1 zu Start.md (7 Bytes), .mdda 1 (9 Bytes)
//   Aufgaben  4 Zeilen: offen, laufend, erledigt, abgebrochen
//   Verweise  Start -> Ziel (wiki), Ziel -> Unter/Tief (markdown)
function makeFixture() {
  const root = makeRoot();
  const start = write(
    root,
    'Start.md',
    [
      '---',
      'tags: [projekt]',
      'aliases: [Anfang]',
      '---',
      '',
      '#notiz',
      '',
      'Siehe [[Ziel]].',
      '',
    ].join('\n'),
  );
  write(
    root,
    'Ziel.md',
    [
      '---',
      'tags: [projekt, wichtig]',
      'status: aktiv',
      '---',
      '',
      '- [ ] offene Aufgabe',
      '- [/] laufende Aufgabe',
      '- [x] erledigte Aufgabe',
      '- [-] abgebrochene Aufgabe',
      '',
      'Verweis auf [Tief](Unter/Tief.md).',
      '',
    ].join('\n'),
  );
  write(root, 'Unter/Tief.md', '# Tief\n\nInhalt ohne Verweise.\n');
  write(root, 'Verwaist.md', '# Verwaist\n\nNiemand verweist hierher.\n');
  write(root, 'Anlagen/bild.png', 'PNG-Attrappe'); // 12 Bytes
  write(root, 'Anlagen/blatt.pdf', 'PDF-A'); // 5 Bytes
  write(root, 'Anlagen/daten.csv', 'a;b'); // 3 Bytes
  write(root, 'Start.mdd', 'mdd-Rst'); // 7 Bytes
  write(root, 'Area_Settings.mdda', 'mdda-Rest'); // 9 Bytes
  write(root, '.git/config', 'darf nicht gezaehlt werden');
  return { root, start };
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
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

describe('statsFor — Index-Anteil der Bereichs-Statistik (4T-0619)', () => {
  it('zaehlt Tags und Eigenschaften je Datei, absteigend sortiert', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-index', root);

    const stats = statsFor(root, { statusTypeOf });
    expect(stats.status).toBe('ready');
    // projekt in beiden Dateien, notiz und wichtig in je einer.
    expect(stats.tags).toEqual([
      { name: 'projekt', dateien: 2 },
      { name: 'notiz', dateien: 1 },
      { name: 'wichtig', dateien: 1 },
    ]);
    const tagsEintrag = stats.eigenschaften.find((e) => e.name === 'tags');
    expect(tagsEintrag).toEqual({ name: 'tags', dateien: 2 });
    expect(stats.eigenschaften.find((e) => e.name === 'status')).toEqual({
      name: 'status',
      dateien: 1,
    });
    expect(stats.aliase).toBe(1);
  });

  it('teilt die Aufgaben ueberschneidungsfrei in offen, erledigt und abgebrochen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-tasks', root);

    const { aufgaben } = statsFor(root, { statusTypeOf });
    expect(aufgaben).toEqual({ gesamt: 4, offen: 2, erledigt: 1, abgebrochen: 1 });
    expect(aufgaben.offen + aufgaben.erledigt + aufgaben.abgebrochen).toBe(aufgaben.gesamt);
  });

  it('zaehlt Verweise nach Art und die Dateien ohne eingehenden Verweis', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-links', root);

    const { verweise, auffaelligkeiten } = statsFor(root, { statusTypeOf });
    expect(verweise.wiki).toBe(1);
    expect(verweise.markdown).toBe(1);
    // Ziel und Unter/Tief haben je einen eingehenden Verweis; Start und
    // Verwaist haben keinen.
    expect(verweise.ohneEingehende).toBe(2);
    expect(auffaelligkeiten.meistverlinkt.map((e) => e.name).sort()).toEqual(['Tief', 'Ziel']);
    expect(auffaelligkeiten.groesste).toHaveLength(4);
    expect(auffaelligkeiten.groesste[0].bytes).toBeGreaterThanOrEqual(
      auffaelligkeiten.groesste[3].bytes,
    );
  });

  it('reicht den Status durch, statt Teilzahlen zu liefern', () => {
    expect(statsFor(null, { statusTypeOf })).toEqual({ status: 'unavailable' });
    expect(statsFor(path.join(os.tmpdir(), 'em4me-nie-indexiert'), { statusTypeOf })).toEqual({
      status: 'unavailable',
    });
  });
});

describe('collectAreaStats — Zusammenfuehrung mit dem Ordner-Scan (4T-0619)', () => {
  it('zaehlt Ordner, Nicht-Markdown-Dateien und Begleitdateien am Fixture', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-scan', root);

    const stats = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(stats.status).toBe('ready');
    expect(stats.dateien.markdown).toBe(4);
    expect(stats.dateien.ordner).toBe(2);
    expect(stats.dateien.nichtMarkdown).toEqual({
      bilder: 1,
      pdf: 1,
      sonstige: 1,
      gesamt: 3,
    });
    // Begleitdateien zaehlen NICHT als Nicht-Markdown-Dateien.
    expect(stats.begleit.mdd).toEqual({ anzahl: 1, bytes: 7 });
    expect(stats.begleit.mdda).toEqual({ anzahl: 1, bytes: 9 });
    expect(stats.begleit.mitMdd).toBe(1);
    expect(stats.begleit.vonMarkdown).toBe(4);
  });

  it('setzt die Speicher-Summe genau aus den angezeigten Teilen zusammen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-bytes', root);

    const { speicher } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(speicher.nichtMarkdown).toBe(20); // 12 + 5 + 3
    expect(speicher.begleit).toBe(16); // 7 + 9
    expect(speicher.gesamt).toBe(speicher.markdown + speicher.nichtMarkdown + speicher.begleit);
    expect(speicher.markdown).toBeGreaterThan(0);
  });

  it('laesst Punkt-Ordner in Datei-, Ordner- und Byte-Zahlen gleichermassen draussen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-ignore', root);

    const stats = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    // .git/config waere sonst eine „sonstige" Datei und .git ein Ordner.
    expect(stats.dateien.ordner).toBe(2);
    expect(stats.dateien.nichtMarkdown.sonstige).toBe(1);
    expect(stats.hinweise.uebersprungeneOrdner).toBe(0);
  });

  it('traegt einen sekundengenauen UTC-Zeitstempel und wiederholt sich stabil', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-stand', root);

    const erste = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    const zweite = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(erste.stand).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(zweite.dateien).toEqual(erste.dateien);
    expect(zweite.speicher).toEqual(erste.speicher);
    expect(zweite.inhalte).toEqual(erste.inhalte);
  });

  it('liefert ohne Bereich nur den Status', async () => {
    const stats = await collectAreaStats(null, { statusTypeOf }, { statsFor });
    expect(stats.status).toBe('unavailable');
    expect(stats.dateien).toBeUndefined();
  });
});
