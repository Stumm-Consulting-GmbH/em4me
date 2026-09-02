// 4T-001340 (Epic 3E-000238): Die im Bereich vergebenen Werte einer Eigenschaft.
//
// Geprüft wird die Sicht des Hauptprozesses am **echten Index** über ein
// Temp-Verzeichnis (Muster profil-wertevorrat.test.js): Sammeln, Entdoppeln,
// Ordnen, Begrenzen und die Status-Durchreichung. Ein gestellter Index hätte
// die Frage offengelassen, ob die Werte überhaupt in der angenommenen Form
// dort liegen — und genau das ist die Vermutung, die dieser Vorgang prüfen
// sollte.
//
// Dass die Werte an der Oberfläche erscheinen, misst die E2E-Ebene; die
// Trennung ist die Lehre aus 4T-001339, wo eine grüne Prüfung der Funktion eine
// wirkungslose Anzeige deckte.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  eigenschaftsWerteFuerFeld,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { MAX_WERTE } from '../../src/main/index/eigenschafts-werte.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-eigwerte-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, ownerKey) {
  let result = backlinksFor(activeFile, ownerKey, null);
  openRoots.add(rootForActiveFile(activeFile, null));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, null);
  }
  return result;
}

// Ein Bereich aus Frontmatter-Blöcken: je Datei ein Eintrag `feld: <Wert>`.
async function bestandMit(bloecke) {
  const root = makeRoot();
  const start = write(root, 'Start.md', 'Einstieg.');
  bloecke.forEach((fm, i) => write(root, `Datei${i}.md`, `---\n${fm}\n---\nText.`));
  await indexFor(start, 'test:eigenschafts-werte');
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

describe('Werte einer Eigenschaft aus dem Bereich (4T-001340)', () => {
  it('AK1: sammelt über alle Dateien und ordnet alphabetisch', async () => {
    const { start } = await bestandMit(['status: Zeta', 'status: Alpha', 'status: Mitte']);
    const r = eigenschaftsWerteFuerFeld(start, 'status', null);
    expect(r.status).toBe('ready');
    expect(r.values).toEqual(['Alpha', 'Mitte', 'Zeta']);
  });

  it('achtet nicht auf die Schreibweise des Feldnamens', async () => {
    const { start } = await bestandMit(['status: Offen']);
    expect(eigenschaftsWerteFuerFeld(start, 'Status', null).values).toEqual(['Offen']);
    expect(eigenschaftsWerteFuerFeld(start, '  STATUS  ', null).values).toEqual(['Offen']);
  });

  it('nimmt jeden Wert einer Liste einzeln auf', async () => {
    const { start } = await bestandMit(['tags:\n  - Bau\n  - Plan', 'tags:\n  - Abnahme']);
    expect(eigenschaftsWerteFuerFeld(start, 'tags', null).values).toEqual([
      'Abnahme',
      'Bau',
      'Plan',
    ]);
  });

  it('bietet denselben Wert nur einmal an, in seiner ersten Schreibweise', async () => {
    const { start } = await bestandMit(['status: Offen', 'status: offen', 'status: OFFEN']);
    expect(eigenschaftsWerteFuerFeld(start, 'status', null).values).toHaveLength(1);
  });

  it('AK4: liefert eine leere Liste, wenn die Eigenschaft nirgends vorkommt', async () => {
    // An der Oberfläche entsteht daraus KEINE leere Liste, sondern gar keine.
    const { start } = await bestandMit(['status: Offen']);
    const r = eigenschaftsWerteFuerFeld(start, 'gibtesnicht', null);
    expect(r.status).toBe('ready');
    expect(r.values).toEqual([]);
  });

  it('AK6: greift nicht über den Bereich hinaus', async () => {
    const { start } = await bestandMit(['status: Eigen']);
    const fremd = makeRoot();
    write(fremd, 'Fremd.md', '---\nstatus: Fremd\n---\nText.');
    expect(eigenschaftsWerteFuerFeld(start, 'status', null).values).toEqual(['Eigen']);
  });

  it('AK7: begrenzt die Liste und schneidet am Alphabet, nicht an der Datei-Reihenfolge', async () => {
    // Rückwärts angelegt, damit die Datei-Reihenfolge der Alphabet-Ordnung
    // widerspricht: Wer ohne Sortieren kürzte, bekäme die hohen Nummern.
    const bloecke = [];
    for (let i = MAX_WERTE + 20; i >= 1; i--) {
      bloecke.push(`feld: Wert${String(i).padStart(3, '0')}`);
    }
    const { start } = await bestandMit(bloecke);
    const r = eigenschaftsWerteFuerFeld(start, 'feld', null);
    expect(r.values).toHaveLength(MAX_WERTE);
    expect(r.values[0]).toBe('Wert001');
    expect(r.values.at(-1)).toBe(`Wert${String(MAX_WERTE).padStart(3, '0')}`);
  });

  it('achtet eine eigene Grenze', async () => {
    const { start } = await bestandMit(['feld: A', 'feld: B', 'feld: C']);
    expect(eigenschaftsWerteFuerFeld(start, 'feld', null, 2).values).toEqual(['A', 'B']);
  });

  it('meldet ohne Datei und ohne Feldnamen nicht verfügbar', async () => {
    const { start } = await bestandMit(['status: Offen']);
    expect(eigenschaftsWerteFuerFeld(null, 'status', null).status).toBe('unavailable');
    expect(eigenschaftsWerteFuerFeld(start, '   ', null).status).toBe('unavailable');
  });
});
