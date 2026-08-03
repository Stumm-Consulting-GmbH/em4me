// 4T-0632 (Epic 3E-0102): Unit-Tests für das Demo-Area-Erstell-Modul
// (src/main/demo-area.js). Geprüft werden ein Manifest-Wächter über die
// mitgelieferten Demo-Inhalte (src/demo — beide Richtungen), die reine
// Leer-Prüfung isEmptyDirListing und createDemoAreaAt gegen echte Temp-
// Ordner (Erfolg inklusive Binär-Inhalt, Ablehnung nicht-leerer bzw.
// fehlender Ziele). Stil-Muster benachbarter Main-Tests
// (test/unit/caption-color.test.js).
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_SOURCE_DIR, isEmptyDirListing, createDemoAreaAt } from '../../src/main/demo-area.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');

// Hart kodierte Soll-Liste der mitgelieferten Demo-Dateien (relative Pfade
// unter src/demo, Forward-Slashes). Ein Zuwachs oder Wegfall im Bestand muss
// diese Liste bewusst nachziehen.
const EXPECTED_FILES = [
  '00 Welcome.md',
  '01 Markdown Basics.md',
  '02 Extended Syntax.md',
  '03 Tables.md',
  '04 Links and Structure.md',
  '05 Properties and Profiles.md',
  '06 Tasks and Reminders.md',
  '07 Events and Journals.md',
  '08 Queries.md',
  '09 Diagrams and Formulas.md',
  '10 Attachments.md',
  '11 Templates.md',
  // 4T-0850 (Epic 3E-0147): das Demo-Buch (Buch-Ordner mit Begleitdatei,
  // Buch-Datei, vier Kapiteln über zwei Ordner und einer bewusst nicht
  // eingehängten Datei). Bewusst OHNE eigene Seite im Wurzelverzeichnis: die
  // E2E-Demo-Spec zählt dort die Markdown-Seiten und die #demo-Treffer der
  // ersten Abfrage; der Einstieg steht deshalb als Absatz in „00 Welcome".
  'Demo Book/01 Setting Out.md',
  'Demo Book/04 Homecoming.md',
  'Demo Book/Book_Settings.mdda',
  'Demo Book/Demo Book.md',
  'Demo Book/Notes to Self.md',
  'Demo Book/Parts/02 The Harbour.md',
  'Demo Book/Parts/03 Storms and Detours.md',
  'Templates/Meeting Note.md',
  'attachments/demo-document.pdf',
  'attachments/demo-image.png',
];

// Rekursiver Scan eines Verzeichnisses: relative POSIX-Pfade aller Dateien.
function listFilesRecursive(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

describe('Demo-Area: Manifest-Wächter über src/demo (4T-0632)', () => {
  it('src/demo trägt exakt die zweiundzwanzig erwarteten Dateien (beide Richtungen)', () => {
    const actual = listFilesRecursive(DEMO_DIR);
    const expected = [...EXPECTED_FILES].sort();
    const fehlend = expected.filter((f) => !actual.includes(f));
    const ueberzaehlig = actual.filter((f) => !expected.includes(f));
    expect(fehlend, `Fehlende Demo-Dateien: ${fehlend.join(', ')}`).toEqual([]);
    expect(ueberzaehlig, `Überzählige Demo-Dateien: ${ueberzaehlig.join(', ')}`).toEqual([]);
  });

  it('DEMO_SOURCE_DIR zeigt auf src/demo', () => {
    expect(path.resolve(DEMO_SOURCE_DIR)).toBe(DEMO_DIR);
  });
});

describe('isEmptyDirListing (4T-0632)', () => {
  it('leeres Array ist leer', () => {
    expect(isEmptyDirListing([])).toBe(true);
  });

  it('nicht-leeres Array und Nicht-Arrays sind nicht leer', () => {
    expect(isEmptyDirListing(['x'])).toBe(false);
    expect(isEmptyDirListing(['a', 'b'])).toBe(false);
    expect(isEmptyDirListing(null)).toBe(false);
    expect(isEmptyDirListing(undefined)).toBe(false);
    expect(isEmptyDirListing('nicht-array')).toBe(false);
  });
});

describe('createDemoAreaAt gegen echte Temp-Ordner (4T-0632)', () => {
  const temps = [];
  const mkTemp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-unit-'));
    temps.push(dir);
    return dir;
  };

  afterEach(async () => {
    while (temps.length) {
      const dir = temps.pop();
      await fsp
        .rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        .catch(() => {});
    }
  });

  // Kleine, injizierbare Test-Quelle: eine Datei im Wurzelverzeichnis, eine in
  // einem Unterordner und eine Binär-Datei mit Nicht-UTF8-Bytes (Buffer). So
  // sind rekursives Kopieren und Binär-Sicherheit unabhängig vom echten Demo-
  // Bestand prüfbar.
  async function makeTestSource() {
    const src = mkTemp();
    await fsp.writeFile(path.join(src, 'root.md'), '# Wurzel\n', 'utf8');
    await fsp.mkdir(path.join(src, 'sub'));
    await fsp.writeFile(path.join(src, 'sub', 'nested.md'), '# Verschachtelt\n', 'utf8');
    const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await fsp.writeFile(path.join(src, 'sub', 'blob.bin'), binary);
    return { src, binary };
  }

  it('Erfolg: kopiert rekursiv inklusive Binär-Inhalt in ein leeres Ziel', async () => {
    const { src, binary } = await makeTestSource();
    const dest = mkTemp();
    const result = await createDemoAreaAt(dest, src);
    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(dest, 'root.md'), 'utf8')).toBe('# Wurzel\n');
    expect(fs.readFileSync(path.join(dest, 'sub', 'nested.md'), 'utf8')).toBe('# Verschachtelt\n');
    // Binär-Datei bit-genau kopiert (Buffer-Vergleich).
    const copiedBin = fs.readFileSync(path.join(dest, 'sub', 'blob.bin'));
    expect(Buffer.compare(copiedBin, binary)).toBe(0);
  });

  it('nicht-leeres Ziel: not-empty, das Ziel bleibt unverändert', async () => {
    const { src } = await makeTestSource();
    const dest = mkTemp();
    await fsp.writeFile(path.join(dest, 'vorhanden.txt'), 'bereits da\n', 'utf8');
    const result = await createDemoAreaAt(dest, src);
    expect(result).toEqual({ ok: false, error: 'not-empty' });
    // Der vorhandene Eintrag ist danach exakt noch da; nichts hinzukopiert.
    expect(fs.readdirSync(dest)).toEqual(['vorhanden.txt']);
    expect(fs.readFileSync(path.join(dest, 'vorhanden.txt'), 'utf8')).toBe('bereits da\n');
  });

  it('nicht existierendes Ziel: not-found', async () => {
    const { src } = await makeTestSource();
    const dest = path.join(mkTemp(), 'gibt-es-nicht');
    const result = await createDemoAreaAt(dest, src);
    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});
