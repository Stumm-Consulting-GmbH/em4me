// 4T-001598 (Epic 3E-000191, Story 4S-000906): Prüffälle der Gefäß-Erkennung
// für die eingetragene Liste (src/main/memory/memory-detect.js).
//
// Gegen echte Temp-Ordner statt gegen eine Attrappe, weil genau der Griff auf
// die Begleitdatei der Gegenstand ist (Setup-Muster
// test/unit/shelves-main.test.js: mkdtemp je Fall, Aufräumen im afterEach).
//
// AK4 in seiner präzisierten Form (Annahme A1 des Epic-Entwurfs): Der Bestand
// kennt keine Markierung eines Bereichs, jeder erreichbare Ordner ist einer.
// Abgelehnt wird deshalb der nicht erreichbare Pfad, nicht der Ordner ohne
// Merkmal.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectContainerKind } from '../../src/main/memory/memory-detect.js';
import {
  BOOK_SETTINGS_FILENAME,
  emptyBookContainer,
  serializeBookContainer,
} from '../../src/shared/books/book-core.js';
import { SHELF_SETTINGS_FILENAME } from '../../src/shared/books/shelf-core.js';

let tmpDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-memory-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows-Dateisperren: Rest räumt das Betriebssystem-Temp auf.
    }
  }
  tmpDirs = [];
});

// Regal-Ordner mit Regal-Datei und Begleitdatei (Fixture-Muster
// shelves-main.test.js). `frontmatter` setzt den Titel der Regal-Datei.
function makeShelf(parent, name, frontmatter = '') {
  const shelfDir = path.join(parent, name);
  fs.mkdirSync(shelfDir, { recursive: true });
  fs.writeFileSync(path.join(shelfDir, `${name}.md`), `${frontmatter}# Regal\n`, 'utf8');
  fs.writeFileSync(
    path.join(shelfDir, SHELF_SETTINGS_FILENAME),
    JSON.stringify({ schemaVersion: 1, shelf: { file: `${name}.md` }, books: [] }, null, 2),
    'utf8',
  );
  return shelfDir;
}

// Buch-Ordner mit echter Buch-Begleitdatei.
function makeBook(parent, name, frontmatter = '') {
  const bookDir = path.join(parent, name);
  fs.mkdirSync(bookDir, { recursive: true });
  fs.writeFileSync(path.join(bookDir, `${name}.md`), frontmatter, 'utf8');
  fs.writeFileSync(
    path.join(bookDir, BOOK_SETTINGS_FILENAME),
    serializeBookContainer(emptyBookContainer(`${name}.md`)),
    'utf8',
  );
  return bookDir;
}

describe('Gefäß-Erkennung: die drei Arten', () => {
  it('erkennt ein Bücherregal an seiner Begleitdatei', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    expect(await detectContainerKind(shelfDir)).toEqual({
      ok: true,
      kind: 'shelf',
      name: 'Bibliothek',
    });
  });

  it('erkennt ein Buch an seiner Begleitdatei', async () => {
    const parent = makeTempDir();
    const bookDir = makeBook(parent, 'Handbuch');
    expect(await detectContainerKind(bookDir)).toEqual({
      ok: true,
      kind: 'book',
      name: 'Handbuch',
    });
  });

  it('nimmt einen leeren Ordner als Bereich (keine Bereichs-Markierung im Bestand)', async () => {
    const parent = makeTempDir();
    const areaDir = path.join(parent, 'Privat');
    fs.mkdirSync(areaDir);
    expect(await detectContainerKind(areaDir)).toEqual({ ok: true, kind: 'area', name: 'Privat' });
  });

  it('prüft das Regal vor dem Buch, weil ein Regal Buch-Ordner trägt', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    makeBook(shelfDir, 'Handbuch');
    expect((await detectContainerKind(shelfDir)).kind).toBe('shelf');
    expect((await detectContainerKind(path.join(shelfDir, 'Handbuch'))).kind).toBe('book');
  });
});

describe('Gefäß-Erkennung: Anzeige-Name', () => {
  it('nimmt den Frontmatter-Titel des Buches, wenn es einen trägt', async () => {
    const parent = makeTempDir();
    const bookDir = makeBook(parent, 'Handbuch', '---\ntitle: Das große Handbuch\n---\n');
    expect((await detectContainerKind(bookDir)).name).toBe('Das große Handbuch');
  });

  it('nimmt den Frontmatter-Titel des Regals, wenn es einen trägt', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek', '---\ntitle: Meine Bibliothek\n---\n');
    expect((await detectContainerKind(shelfDir)).name).toBe('Meine Bibliothek');
  });
});

describe('Gefäß-Erkennung: nicht erreichbar', () => {
  it('lehnt einen nicht existierenden Pfad ab', async () => {
    const parent = makeTempDir();
    expect(await detectContainerKind(path.join(parent, 'gibt-es-nicht'))).toEqual({
      ok: false,
      error: 'unreachable',
    });
  });

  it('lehnt einen leeren oder fehlenden Pfad ab', async () => {
    expect((await detectContainerKind('')).error).toBe('unreachable');
    expect((await detectContainerKind(null)).error).toBe('unreachable');
  });

  it('lehnt eine Datei als Nicht-Ordner ab', async () => {
    const parent = makeTempDir();
    const datei = path.join(parent, 'Notiz.md');
    fs.writeFileSync(datei, '# Notiz\n', 'utf8');
    expect((await detectContainerKind(datei)).error).toBe('not-a-directory');
  });
});
