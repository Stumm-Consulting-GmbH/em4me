// 4T-001885 (Epic 3E-000189, Story 4S-000994): Unit-Tests der eigenen Angaben
// von Buch und Bücherregal gegen echte Temp-Ordner — Titel, Autor, Beschreibung
// und Titelbild im Frontmatter der Buch- bzw. Regal-Datei.
//
// **Warum am echten Ordner.** Die Zusicherung des Tasks ist der GLEICHLAUF: Der
// Einstellungs-Abschnitt liest und schreibt dieselbe Stelle, an der die Angaben
// heute gepflegt werden. Ein Fall mit gestelltem Dateisystem misst diese Aussage
// gerade nicht; er misst die Stellung. Setup-Muster der benachbarten
// Main-Tests (test/unit/books-main.test.js).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { leseAngaben, schreibeAngaben } from '../../src/main/books/angaben.js';
import { readBookInfo, writeBookInfo } from '../../src/main/books/books.js';
import { readShelfInfo, shelfDirOfBook, writeShelfInfo } from '../../src/main/books/shelves.js';
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

// 4T-002068 (Epic 3E-000344, Verdacht 2 aus 4T-001963): Grenze des Titelbilds
// in der Auskunft des Einstellungs-Abschnitts.
//
// **Was zugesichert wird.** «Gefunden» heißt dasselbe wie «die Regal-Ansicht
// zeigt es»: innerhalb der Grenze, mit Bild-Endung, höchstens 20 MB. Grenze ist
// in jedem Fall der Regal-Ordner, bei einem Buch ohne Regal der Buch-Ordner
// (Entscheidung des Product Owners vom 2026-10-04, «Weg A»): beim Regal und
// beim Buch im Regal der Regal-Ordner, beim Buch ohne Regal der Buch-Ordner.
// Ein umgebender Bereich weitet sie nicht; «Regal im Bereich»
// prüft deshalb dieselbe Grenze wie «Regal ohne Bereich». Jeder Fall außerhalb
// prüft zusätzlich, dass kein Datei-Zugriff außerhalb der Grenze stattfand
// (Muster test/unit/preload-images.test.js); der Freigabe-Rechner liegt unter
// `.invalid` und wird nie aufgelöst.
describe('Grenze des Titelbilds in der Auskunft (4T-002068)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Der Verweis steht in Anführungszeichen, damit Rückstriche und Doppelpunkte
  // als Text gelten.
  function mitTitelbild(cover) {
    return `---\ncover: ${JSON.stringify(cover)}\n---\n`;
  }

  function schreibeBild(datei, inhalt = 'PNG') {
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, inhalt);
    return datei;
  }

  function zugriffeMitzaehlen() {
    const zugriffe = [];
    const statOriginal = fsp.stat;
    const readOriginal = fsp.readFile;
    vi.spyOn(fsp, 'stat').mockImplementation((p, ...rest) => {
      zugriffe.push(String(p));
      return statOriginal.call(fsp, p, ...rest);
    });
    vi.spyOn(fsp, 'readFile').mockImplementation((p, ...rest) => {
      zugriffe.push(String(p));
      return readOriginal.call(fsp, p, ...rest);
    });
    return zugriffe;
  }

  function ausserhalb(zugriffe, grenze) {
    return zugriffe.filter((p) => {
      const rel = path.relative(grenze, path.resolve(p));
      return rel.startsWith('..') || path.isAbsolute(rel);
    });
  }

  it('Buch: `../` aus dem Buch-Ordner hinaus gilt als nicht gefunden, ohne Zugriff', async () => {
    const root = makeDir();
    schreibeBild(path.join(root, 'aussen.png'));
    const bookDir = makeBook(root, 'Reise', mitTitelbild('../aussen.png'));
    const zugriffe = zugriffeMitzaehlen();
    expect(await readBookInfo(bookDir)).toMatchObject({
      cover: '../aussen.png',
      coverGefunden: false,
    });
    expect(ausserhalb(zugriffe, bookDir)).toEqual([]);
  });

  it('Buch: absoluter Pfad außerhalb gilt als nicht gefunden, ohne Zugriff', async () => {
    const fremd = schreibeBild(path.join(makeDir(), 'fremd.png'));
    const bookDir = makeBook(makeDir(), 'Reise', mitTitelbild(fremd));
    const zugriffe = zugriffeMitzaehlen();
    expect((await readBookInfo(bookDir)).coverGefunden).toBe(false);
    expect(ausserhalb(zugriffe, bookDir)).toEqual([]);
  });

  it('Buch: Netz-Pfad in jeder Schreibweise gilt als nicht gefunden, ohne Zugriff', async () => {
    for (const cover of [
      '\\\\rechner.invalid\\freigabe\\bild.png',
      '//rechner.invalid/freigabe/bild.png',
    ]) {
      const bookDir = makeBook(makeDir(), 'Reise', mitTitelbild(cover));
      const zugriffe = zugriffeMitzaehlen();
      expect((await readBookInfo(bookDir)).coverGefunden, cover).toBe(false);
      expect(ausserhalb(zugriffe, bookDir), cover).toEqual([]);
      vi.restoreAllMocks();
    }
  });

  it('Buch: Datei ohne Bild-Endung gilt als nicht gefunden', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', mitTitelbild('titel.txt'));
    const text = schreibeBild(path.join(bookDir, 'titel.txt'), 'kein Bild');
    const zugriffe = zugriffeMitzaehlen();
    expect((await readBookInfo(bookDir)).coverGefunden).toBe(false);
    expect(zugriffe).not.toContain(text);
  });

  it('Buch: Bilddatei über 20 MB gilt als nicht gefunden, ihr Inhalt wird nicht gelesen', async () => {
    const root = makeDir();
    const bookDir = makeBook(root, 'Reise', mitTitelbild('gross.png'));
    const gross = path.join(bookDir, 'gross.png');
    const fd = fs.openSync(gross, 'w');
    fs.ftruncateSync(fd, 20 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    zugriffeMitzaehlen();
    expect((await readBookInfo(bookDir)).coverGefunden).toBe(false);
    expect(fsp.readFile).not.toHaveBeenCalledWith(gross);
  });

  it('Buch im Regal: Grenze ist der Regal-Ordner, wie in der Regal-Ansicht', async () => {
    const root = makeDir();
    schreibeBild(path.join(root, 'aussen.png'));
    const shelfDir = makeShelf(root, 'Bibliothek', '---\ntitle: Regal\n---\n');
    schreibeBild(path.join(shelfDir, 'gemeinsam.png'));
    const innen = makeBook(shelfDir, 'Reise', mitTitelbild('../gemeinsam.png'));
    expect(await shelfDirOfBook(innen)).toBe(path.resolve(shelfDir));
    expect((await readBookInfo(innen, shelfDir)).coverGefunden).toBe(true);
    // Über den Regal-Ordner hinaus: nicht gefunden, ohne Zugriff.
    const hinaus = makeBook(shelfDir, 'Fahrt', mitTitelbild('../../aussen.png'));
    const zugriffe = zugriffeMitzaehlen();
    expect((await readBookInfo(hinaus, shelfDir)).coverGefunden).toBe(false);
    expect(ausserhalb(zugriffe, shelfDir)).toEqual([]);
  });

  it('Buch ohne Regal: Grenze ist der Buch-Ordner', async () => {
    const root = makeDir();
    schreibeBild(path.join(root, 'daneben.png'));
    const bookDir = makeBook(root, 'Reise', mitTitelbild('../daneben.png'));
    expect(await shelfDirOfBook(bookDir)).toBeNull();
    const zugriffe = zugriffeMitzaehlen();
    expect((await readBookInfo(bookDir)).coverGefunden).toBe(false);
    expect(ausserhalb(zugriffe, bookDir)).toEqual([]);
  });

  it('Regal ohne Bereich: Grenze ist der Regal-Ordner', async () => {
    const innen = makeShelf(makeDir(), 'Bibliothek', mitTitelbild('bilder/titel.png'));
    schreibeBild(path.join(innen, 'bilder', 'titel.png'));
    expect((await readShelfInfo(innen)).coverGefunden).toBe(true);

    const root = makeDir();
    schreibeBild(path.join(root, 'aussen.png'));
    const aussen = makeShelf(root, 'Bibliothek', mitTitelbild('../aussen.png'));
    const zugriffe = zugriffeMitzaehlen();
    expect((await readShelfInfo(aussen)).coverGefunden).toBe(false);
    expect(ausserhalb(zugriffe, aussen)).toEqual([]);
  });

  it('Regal im Bereich: dieselbe Grenze — ein Titelbild im Bereich außerhalb des Regals gilt als nicht gefunden', async () => {
    // Der Ordner `bereich` steht für den umgebenden Bereich; das Bild liegt
    // darin, aber außerhalb des Regal-Ordners.
    const bereich = path.join(makeDir(), 'bereich');
    schreibeBild(path.join(bereich, 'anlagen', 'titel.png'));
    const shelfDir = makeShelf(bereich, 'Bibliothek', mitTitelbild('../anlagen/titel.png'));
    const zugriffe = zugriffeMitzaehlen();
    expect((await readShelfInfo(shelfDir)).coverGefunden).toBe(false);
    expect(ausserhalb(zugriffe, shelfDir)).toEqual([]);
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
