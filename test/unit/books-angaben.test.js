// 4T-001885 (Epic 3E-000189, Story 4S-000994): Unit-Tests der eigenen Angaben
// von Buch und Bücherregal gegen echte Temp-Ordner — Titel, Autor, Beschreibung
// und Titelbild im Frontmatter der Buch- bzw. Regal-Datei.
//
// **Warum am echten Ordner.** Die Zusicherung des Tasks ist der GLEICHLAUF: Der
// Einstellungs-Abschnitt liest und schreibt dieselbe Stelle, an der die Angaben
// heute gepflegt werden. Ein Fall mit gestelltem Dateisystem misst diese Aussage
// gerade nicht; er misst die Stellung. Setup-Muster der benachbarten
// Main-Tests (test/unit/books-main.test.js).
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leseAngaben, schreibeAngaben } from '../../src/main/books/angaben.js';
import { readBookInfo, writeBookInfo } from '../../src/main/books/books.js';
import { readShelfInfo, writeShelfInfo } from '../../src/main/books/shelves.js';
import { BOOK_SETTINGS_FILENAME } from '../../src/shared/books/book-core.js';
import { SHELF_SETTINGS_FILENAME } from '../../src/shared/books/shelf-core.js';

let tmpDirs = [];

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-angaben-'));
  tmpDirs.push(dir);
  return dir;
}

// Buch-Ordner mit Buch-Datei und Begleitdatei; `inhalt` ist der volle Text der
// Buch-Datei, damit jeder Fall sein Frontmatter selbst stellt.
function makeBook(root, name, inhalt) {
  const bookDir = path.join(root, name);
  fs.mkdirSync(bookDir, { recursive: true });
  fs.writeFileSync(path.join(bookDir, `${name}.md`), inhalt, 'utf8');
  fs.writeFileSync(
    path.join(bookDir, BOOK_SETTINGS_FILENAME),
    `${JSON.stringify({ schemaVersion: 1, book: { file: `${name}.md` }, chapters: [] }, null, 2)}\n`,
    'utf8',
  );
  return bookDir;
}

function makeShelf(root, name, inhalt) {
  const shelfDir = path.join(root, name);
  fs.mkdirSync(shelfDir, { recursive: true });
  fs.writeFileSync(path.join(shelfDir, `${name}.md`), inhalt, 'utf8');
  fs.writeFileSync(
    path.join(shelfDir, SHELF_SETTINGS_FILENAME),
    `${JSON.stringify({ schemaVersion: 1, shelf: { file: `${name}.md` }, books: [] }, null, 2)}\n`,
    'utf8',
  );
  return shelfDir;
}

function liesBuchDatei(bookDir, name) {
  return fs.readFileSync(path.join(bookDir, `${name}.md`), 'utf8');
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  tmpDirs = [];
});

describe('Eigene Angaben lesen (4T-001885)', () => {
  it('liest die vier Angaben aus dem Frontmatter der Buch-Datei', async () => {
    const root = makeDir();
    const bookDir = makeBook(
      root,
      'Reise',
      '---\ntitle: Reise nach Ithaka\nauthor: K. P. Kavafis\ndescription: Eine Heimkehr.\ncover: titel.png\n---\n# Reise\n',
    );
    fs.writeFileSync(path.join(bookDir, 'titel.png'), 'PNG', 'utf8');
    const angaben = await readBookInfo(bookDir);
    expect(angaben).toMatchObject({
      ok: true,
      title: 'Reise nach Ithaka',
      author: 'K. P. Kavafis',
      description: 'Eine Heimkehr.',
      cover: 'titel.png',
      coverGefunden: true,
    });
  });

  it('AK16: fehlende Angaben sind leer, ein ins Leere zeigendes Bild ist kein Fehler', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Leer', '---\ncover: fehlt.png\n---\n');
    const angaben = await readBookInfo(bookDir);
    expect(angaben).toMatchObject({
      ok: true,
      title: '',
      author: '',
      description: '',
      cover: 'fehlt.png',
      // Die Bild-Datei liegt im Dateisystem: ihr Fehlen ist eine Auskunft und
      // kein Fehler der Anwendung.
      coverGefunden: false,
    });
  });

  it('eine Datei ganz ohne Frontmatter liefert leere Angaben statt eines Fehlers', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Ohne', '# Ohne Frontmatter\n');
    const angaben = await readBookInfo(bookDir);
    expect(angaben).toMatchObject({ ok: true, title: '', cover: '', coverGefunden: null });
  });

  it('ein Ordner ohne Begleitdatei meldet sich als kein Buch', async () => {
    const root = makeDir();
    expect(await readBookInfo(root)).toEqual({ ok: false, error: 'no-book' });
  });

  it('das Regal liefert dieselben Angaben plus seinen Ordner', async () => {
    const root = makeDir();
    const shelfDir = makeShelf(
      root,
      'Bibliothek',
      '---\ntitle: Meine Bibliothek\nauthor: Haus\n---\n',
    );
    const angaben = await readShelfInfo(shelfDir);
    expect(angaben).toMatchObject({ ok: true, title: 'Meine Bibliothek', author: 'Haus' });
    expect(angaben.shelfDir).toBe(path.resolve(shelfDir));
  });
});

describe('Eigene Angaben schreiben (4T-001885)', () => {
  it('AK6 und AK18: geschrieben wird an dieselbe Stelle, aus der gelesen wird', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntitle: Alt\n---\n# Reise\n');
    expect(await writeBookInfo(bookDir, { title: 'Neu', author: 'Wer', cover: '' })).toEqual({
      ok: true,
    });
    // Erstens am Datei-Inhalt: Das Frontmatter der Buch-Datei trägt den Wert.
    expect(liesBuchDatei(bookDir, 'Reise')).toContain('title: Neu');
    // Zweitens über den Lese-Weg: derselbe Wert kommt zurück.
    expect(await readBookInfo(bookDir)).toMatchObject({ title: 'Neu', author: 'Wer' });
  });

  it('AK17: Sonderzeichen und Zeilenumbrüche überstehen Schreiben und erneutes Lesen', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntitle: Alt\n---\n');
    const titel = 'Ithaka: »Reise«, & mehr — 100 %';
    const beschreibung = 'Erste Zeile\nZweite Zeile\nDritte Zeile';
    expect(await writeBookInfo(bookDir, { title: titel, description: beschreibung })).toEqual({
      ok: true,
    });
    const gelesen = await readBookInfo(bookDir);
    expect(gelesen.title).toBe(titel);
    expect(gelesen.description).toBe(beschreibung);
  });

  it('ein leerer Wert entfernt sein Feld, statt eine leere Zeichenkette abzulegen', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntitle: Alt\nauthor: Wer\n---\n');
    expect(await writeBookInfo(bookDir, { author: '' })).toEqual({ ok: true });
    expect(liesBuchDatei(bookDir, 'Reise')).not.toContain('author');
    expect(await readBookInfo(bookDir)).toMatchObject({ title: 'Alt', author: '' });
  });

  it('fremde Frontmatter-Felder bleiben unangetastet', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntags:\n  - reise\ncreated: 2026-09-22\n---\n');
    expect(await writeBookInfo(bookDir, { title: 'Neu' })).toEqual({ ok: true });
    const inhalt = liesBuchDatei(bookDir, 'Reise');
    expect(inhalt).toContain('- reise');
    expect(inhalt).toContain('created: 2026-09-22');
    expect(inhalt).toContain('title: Neu');
  });

  it('der Rumpf der Datei bleibt erhalten', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntitle: Alt\n---\n\n# Reise\n\nEin Absatz.\n');
    expect(await writeBookInfo(bookDir, { title: 'Neu' })).toEqual({ ok: true });
    const inhalt = liesBuchDatei(bookDir, 'Reise');
    expect(inhalt).toContain('# Reise');
    expect(inhalt).toContain('Ein Absatz.');
  });

  it('ein defektes Frontmatter wird nie überschrieben', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Kaputt', '---\ntitle: [unvollstaendig\n---\n# Kaputt\n');
    const vorher = liesBuchDatei(bookDir, 'Kaputt');
    const ergebnis = await schreibeAngaben(bookDir, 'Kaputt.md', { title: 'Neu' });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toBe('invalid-frontmatter');
    expect(liesBuchDatei(bookDir, 'Kaputt')).toBe(vorher);
  });

  it('eine fehlende Datei meldet sich, statt eine neue anzulegen', async () => {
    const root = makeDir();
    const ergebnis = await schreibeAngaben(root, 'gibt-es-nicht.md', { title: 'Neu' });
    expect(ergebnis).toMatchObject({ ok: false, error: 'read-failed' });
    expect(fs.existsSync(path.join(root, 'gibt-es-nicht.md'))).toBe(false);
  });

  it('das Regal schreibt strukturgleich in seine eigene Datei', async () => {
    const root = makeDir();
    const shelfDir = makeShelf(root, 'Bibliothek', '---\ntitle: Alt\n---\n');
    expect(await writeShelfInfo(shelfDir, { title: 'Meine Bibliothek' })).toEqual({ ok: true });
    expect(await readShelfInfo(shelfDir)).toMatchObject({ title: 'Meine Bibliothek' });
    expect(fs.readFileSync(path.join(shelfDir, 'Bibliothek.md'), 'utf8')).toContain(
      'title: Meine Bibliothek',
    );
  });

  it('nur die vier bekannten Felder zählen; alles Übrige wird nicht geschrieben', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntitle: Alt\n---\n');
    expect(await schreibeAngaben(bookDir, 'Reise.md', { title: 'Neu', fremd: 'weg' })).toEqual({
      ok: true,
    });
    expect(liesBuchDatei(bookDir, 'Reise')).not.toContain('fremd');
  });

  it('der gemeinsame Lese-Weg ist derselbe für Buch und Regal', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', '---\ntitle: Direkt gelesen\n---\n');
    expect(await leseAngaben(bookDir, 'Reise.md')).toMatchObject({
      ok: true,
      title: 'Direkt gelesen',
    });
  });
});
