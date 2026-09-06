// 4T-001494 (Epic 3E-000199): Der Bereichs-Index fuehrt auch die NAMEN der
// Nicht-Markdown-Dateien.
//
// **Anlass.** Der Index kannte ausschliesslich Markdown-Dateien. Die dritte
// Stufe der Einbettungs-Aufloesung — die Suche ueber den bloszen Namen — lief
// damit fuer Bilder, PDF und Anlagen ins Leere, gemessen am laufenden
// Programm: 'nachbar' lieferte einen Treffer, 'bild.png' bei Status ready
// keinen. Ohne diese Zuordnung ist das Ziel des Epics nicht erreichbar,
// gleich wie die Einbettung angeschlossen wird.
//
// Geprueft wird ueber die oeffentliche API mit Temp-Verzeichnissen (Muster
// backlinks.test.js), weil die Zuordnung erst im zusammengebauten Index
// entsteht.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  releaseRoot,
  resolveWikiTargetInIndex,
  rootForActiveFile,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-asset-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Der Bereich wird ausdruecklich mitgegeben: Ohne ihn waere die Index-Wurzel
// der ORDNER der aktiven Datei, und ein Nachbar-Ordner laege ausserhalb — der
// Fall, um den es hier gerade geht, kaeme gar nicht vor.
async function indexFor(activeFile, areaRoot) {
  let result = backlinksFor(activeFile, 'test', areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, 'test', areaRoot);
  }
  return result;
}

// Kurzform: Treffer-Pfade einer Namens-Abfrage.
function treffer(aktiv, name, areaRoot) {
  const r = resolveWikiTargetInIndex(aktiv, name, areaRoot);
  expect(r.status).toBe('ready');
  return r.candidates;
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

describe('Namens-Zuordnung der Nicht-Markdown-Dateien (4T-001494)', () => {
  it('findet Bild, PDF und Anlage ueber ihren Namen (AK1)', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const bild = write(root, 'anlagen/bild.png', 'PNG');
    const pdf = write(root, 'anlagen/unterlage.pdf', '%PDF-1.4');
    const zip = write(root, 'anlagen/archiv.zip', 'ZIP');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'bild.png', root)).toEqual([bild]);
    expect(treffer(aktiv, 'unterlage.pdf', root)).toEqual([pdf]);
    expect(treffer(aktiv, 'archiv.zip', root)).toEqual([zip]);
  });

  it('findet dieselbe Datei auch ohne ihre Endung (AK1)', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const bild = write(root, 'anlagen/bild.png', 'PNG');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'bild', root)).toEqual([bild]);
  });

  it('liefert denselben Datensatz wie fuer Markdown-Ziele (AK2)', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    write(root, 'anlagen/bild.png', 'PNG');
    await indexFor(aktiv, root);

    const r = resolveWikiTargetInIndex(aktiv, 'bild.png', root);
    expect(Object.keys(r).sort()).toEqual(['candidates', 'status']);
    expect(Array.isArray(r.candidates)).toBe(true);
  });

  it('bei Namensgleichheit gewinnt die Markdown-Datei (AK3)', async () => {
    // Die aeltere Zusicherung behaelt den Vortritt: '[[bild]]' neben einer
    // 'bild.md' meint weiterhin das Dokument.
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const doku = write(root, 'anlagen/bild.md', '# Bild\n');
    const png = write(root, 'anlagen/bild.png', 'PNG');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'bild', root)).toEqual([doku]);
    // Mit Endung ist die Sache eindeutig — dort gibt es keine Konkurrenz.
    expect(treffer(aktiv, 'bild.png', root)).toEqual([png]);
  });

  it('haelt ausgeblendete Ordner draussen (AK4)', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    write(root, 'node_modules/paket/bild.png', 'PNG');
    write(root, '.versteckt/geheim.png', 'PNG');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'bild.png', root)).toEqual([]);
    expect(treffer(aktiv, 'geheim.png', root)).toEqual([]);
  });

  it('findet ein Ziel auch in der Pfad-Form', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const bild = write(root, 'anlagen/bild.png', 'PNG');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'anlagen/bild.png', root)).toEqual([bild]);
    expect(treffer(aktiv, 'anlagen/bild', root)).toEqual([bild]);
  });

  it('unterscheidet gleichnamige Dateien in verschiedenen Ordnern', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const eins = write(root, 'eins/bild.png', 'PNG');
    const zwei = write(root, 'zwei/bild.png', 'PNG');
    await indexFor(aktiv, root);

    // Ueber den blossen Namen sind beide Kandidaten; der Aufrufer waehlt.
    expect(treffer(aktiv, 'bild.png', root).sort()).toEqual([eins, zwei].sort());
    // Ueber die Pfad-Form ist die Sache eindeutig.
    expect(treffer(aktiv, 'eins/bild.png', root)).toEqual([eins]);
    expect(treffer(aktiv, 'zwei/bild.png', root)).toEqual([zwei]);
  });

  it('speist keine Rueckverweise (AK6)', async () => {
    // Die neue Zuordnung traegt allein die Namens-Suche. Ein Verweis auf ein
    // Bild darf nicht als Rueckverweis einer Markdown-Datei auftauchen.
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n\n![[bild.png]]\n');
    write(root, 'anlagen/bild.png', 'PNG');
    const ergebnis = await indexFor(aktiv, root);
    expect(ergebnis.status).toBe('ready');
    // Die aktive Datei selbst hat keine eingehenden Verweise.
    expect(ergebnis.backlinks || []).toEqual([]);
  });

  it('ein Bild ohne Endung liefert genau einen Schluessel', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const ohne = write(root, 'anlagen/LIESMICH', 'Text');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'LIESMICH', root)).toEqual([ohne]);
  });

  it('vergleicht Namen ohne Ruecksicht auf Gross- und Kleinschreibung', async () => {
    const root = makeRoot();
    const aktiv = write(root, 'quelle/aktiv.md', '# Aktiv\n');
    const bild = write(root, 'anlagen/Bild.PNG', 'PNG');
    await indexFor(aktiv, root);

    expect(treffer(aktiv, 'bild.png', root)).toEqual([bild]);
    expect(treffer(aktiv, 'BILD', root)).toEqual([bild]);
  });
});
