// 4T-001156 (Epic 3E-000219, E11): Unit-Tests der Ziel-Liste eines
// Verweis-Feldes — die Sicht, die `restrictTo`, `display` und `sort` im Main
// anwendet, wo der Index liegt (Leitsatz aus Konzept 6.11).
//
// Setup-/Teardown-Muster wie graph-index.test.js: echter Index über ein
// Temp-Verzeichnis, Soft-Timer per Fake-Timer feuern. Ein Fake-Index wäre
// hier die schwächere Prüfung, weil gerade der Ordner-Bezug und die
// Frontmatter-Auswertung am realen Aufbau hängen.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  releaseRoot,
  rootForActiveFile,
  verweisZiele,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-vz-'));
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

// Ein Bestand mit drei Ordnern und Frontmatter-Titeln für die Anzeige-Option.
async function bestand() {
  const root = makeRoot();
  const a = write(root, 'Start.md', 'Einstieg.');
  write(root, '10 Projekte/Neubau.md', '---\ntitel: Neubau Halle 3\n---\nText.');
  write(root, '10 Projekte/Alt/Umbau.md', '---\ntitel: Umbau Nord\n---\nText.');
  write(root, '20 Kunden/Meier.md', '---\ntitel: Werner Meier\n---\nText.');
  write(root, 'Lose Notiz.md', 'Ohne Frontmatter.');
  await indexFor(a, 'test:verweis-ziele');
  return { root, a };
}

describe('verweisZiele — Ziel-Liste eines Verweis-Feldes', () => {
  it('liefert ohne Optionen alle Dateien mit ihrem wurzel-relativen Ordner', async () => {
    const { a } = await bestand();
    const { status, targets } = verweisZiele(a, null, {});
    expect(status).toBe('ready');
    const namen = targets.map((t) => t.name);
    expect(namen).toContain('Neubau');
    expect(namen).toContain('Umbau');
    expect(namen).toContain('Meier');
    expect(namen).toContain('Lose Notiz');
    const neubau = targets.find((t) => t.name === 'Neubau');
    expect(neubau.folder).toBe('10 Projekte');
    // Eine Datei in der Wurzel trägt den leeren Ordner, nicht '.'.
    expect(targets.find((t) => t.name === 'Lose Notiz').folder).toBe('');
    // Ohne die Option display bleibt der Anzeige-Name leer.
    expect(neubau.display).toBeNull();
  });

  it('AK3: restrictTo grenzt auf einen Ordner ein, Unterordner eingeschlossen', async () => {
    const { a } = await bestand();
    const { targets } = verweisZiele(a, null, { restrictTo: ['10 Projekte'] });
    const namen = targets.map((t) => t.name).sort();
    expect(namen).toEqual(['Neubau', 'Umbau']);
  });

  it('AK3: restrictTo nimmt mehrere Pfade und vergleicht ohne Rücksicht auf Groß-Kleinschreibung', async () => {
    const { a } = await bestand();
    const { targets } = verweisZiele(a, null, { restrictTo: ['10 projekte/alt', '20 KUNDEN'] });
    expect(targets.map((t) => t.name).sort()).toEqual(['Meier', 'Umbau']);
  });

  it('AK3: ein Ordner-Präfix trifft nur ganze Ordner-Namen', async () => {
    const { root, a } = await bestand();
    write(root, '10 Projekte Archiv/Alt.md', 'Text.');
    await indexFor(a, 'test:verweis-ziele');
    const { targets } = verweisZiele(a, null, { restrictTo: ['10 Projekte'] });
    // «10 Projekte Archiv» beginnt mit demselben Text, ist aber ein anderer
    // Ordner — ein reiner Zeichenketten-Präfix würde ihn fälschlich mitnehmen.
    expect(targets.map((t) => t.name)).not.toContain('Alt');
  });

  it('AK3: display liefert den Wert eines Frontmatter-Feldes des Ziels', async () => {
    const { a } = await bestand();
    const { targets } = verweisZiele(a, null, { display: 'titel' });
    expect(targets.find((t) => t.name === 'Neubau').display).toBe('Neubau Halle 3');
    // Ein Ziel ohne dieses Feld behält seinen Datei-Namen (display = null).
    expect(targets.find((t) => t.name === 'Lose Notiz').display).toBeNull();
  });

  it('AK3: ein unbekanntes display-Feld lässt alle Ziele beim Datei-Namen', async () => {
    const { a } = await bestand();
    const { targets } = verweisZiele(a, null, { display: 'gibtsnicht' });
    expect(targets.every((t) => t.display === null)).toBe(true);
  });

  it('AK3: sort ordnet nach Name (Vorgabe) oder nach Pfad', async () => {
    const { a } = await bestand();
    const nachName = verweisZiele(a, null, {}).targets.map((t) => t.name);
    expect(nachName).toEqual([...nachName].sort((x, y) => x.localeCompare(y, 'de')));

    const nachPfad = verweisZiele(a, null, { sort: 'path' }).targets;
    const ordner = nachPfad.map((t) => t.folder);
    expect(ordner).toEqual([...ordner].sort((x, y) => x.localeCompare(y, 'de')));
  });

  it('AK3: nach Anzeige-Namen wird sortiert, wo es einen gibt', async () => {
    const { a } = await bestand();
    const targets = verweisZiele(a, null, { display: 'titel' }).targets;
    const beschriftung = targets.map((t) => t.display || t.name);
    expect(beschriftung).toEqual([...beschriftung].sort((x, y) => x.localeCompare(y, 'de')));
  });

  it('meldet unavailable statt einer leeren Liste, wo keine Aussage möglich ist', () => {
    expect(verweisZiele(null, null, {})).toEqual({ status: 'unavailable', targets: [] });
    const fremd = path.join(os.tmpdir(), 'nie-indexiert', 'x.md');
    expect(verweisZiele(fremd, null, {}).status).toBe('unavailable');
  });

  it('ein leerer restrictTo-Eintrag grenzt nicht ein', async () => {
    const { a } = await bestand();
    const ohne = verweisZiele(a, null, {}).targets.length;
    expect(verweisZiele(a, null, { restrictTo: [] }).targets).toHaveLength(ohne);
    expect(verweisZiele(a, null, { restrictTo: '' }).targets).toHaveLength(ohne);
  });

  it('ein einzelner Pfad als Zeichenkette wirkt wie eine Liste mit einem Eintrag', async () => {
    const { a } = await bestand();
    const alsListe = verweisZiele(a, null, { restrictTo: ['20 Kunden'] }).targets;
    const alsText = verweisZiele(a, null, { restrictTo: '20 Kunden' }).targets;
    expect(alsText).toEqual(alsListe);
  });
});
