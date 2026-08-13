// 4T-0843 (Epic 3E-0147): Unit-Tests der Datei-Ebene des Buches
// (src/main/books/books.js) gegen echte Temp-Ordner — Erkennung ohne Rückverweis
// (Story S-0752, AK2 und AK5), Zustands-Aufbau für die Preload-API,
// Namens-Prüfung und Neuanlage (AK3). Setup-Muster der benachbarten
// Main-Tests (test/unit/demo-area.test.js: mkdtemp je Fall, Aufräumen im
// afterEach).
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BOOK_SETTINGS_FILENAME,
  applyChapterOp,
  applyTreeOp,
  buildBookState,
  bookFileExists,
  collectMarkdownPaths,
  createBook,
  createChapter,
  detectBookDirFor,
  findBookForFile,
  followChapterFileMove,
  planChapterFileMove,
  readBookSettings,
  reassignChapter,
  sanitizeBookName,
  suggestMissingChapters,
} from '../../src/main/books/books.js';

let tmpDirs = [];

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-books-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Buch mit Buch-Datei, Begleitdatei und Kapitel-Baum anlegen.
function makeBook(root, bookFileName, chapters) {
  write(root, bookFileName, '# Buch\n');
  write(
    root,
    BOOK_SETTINGS_FILENAME,
    JSON.stringify({ schemaVersion: 1, book: { file: bookFileName }, chapters }, null, 2) + '\n',
  );
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('readBookSettings (4T-0843)', () => {
  it('liest die Begleitdatei und liefert ihren Pfad', async () => {
    const dir = makeDir();
    makeBook(dir, 'Reise nach Ithaka.md', []);
    const result = await readBookSettings(dir);
    expect(result.ok).toBe(true);
    expect(result.container.book.file).toBe('Reise nach Ithaka.md');
    expect(result.settingsPath).toBe(path.join(dir, BOOK_SETTINGS_FILENAME));
  });

  it('meldet einen Ordner ohne Begleitdatei als kein Buch', async () => {
    const dir = makeDir();
    write(dir, 'Notiz.md', '# Notiz\n');
    expect(await readBookSettings(dir)).toEqual({ ok: false, error: 'no-book' });
    expect(await readBookSettings(path.join(dir, 'gibt-es-nicht'))).toEqual({
      ok: false,
      error: 'no-book',
    });
    expect(await readBookSettings('')).toEqual({ ok: false, error: 'no-book' });
  });

  it('unterscheidet eine defekte Begleitdatei vom fehlenden Buch', async () => {
    const kaputt = makeDir();
    write(kaputt, BOOK_SETTINGS_FILENAME, '{ kein JSON');
    expect((await readBookSettings(kaputt)).error).toBe('invalid');
    const ohneDatei = makeDir();
    write(ohneDatei, BOOK_SETTINGS_FILENAME, JSON.stringify({ schemaVersion: 1, chapters: [] }));
    expect((await readBookSettings(ohneDatei)).error).toBe('invalid');
  });
});

describe('detectBookDirFor (4T-0843)', () => {
  it('erkennt die benannte Buch-Datei am Ordner-Umfeld', async () => {
    const dir = makeDir();
    makeBook(dir, 'Reise nach Ithaka.md', []);
    expect(await detectBookDirFor(path.join(dir, 'Reise nach Ithaka.md'))).toBe(dir);
  });

  it('erkennt sie unabhängig von der Groß-/Kleinschreibung', async () => {
    const dir = makeDir();
    makeBook(dir, 'Reise nach Ithaka.md', []);
    expect(await detectBookDirFor(path.join(dir, 'reise nach ithaka.MD'))).toBe(dir);
  });

  it('AK5: eine Kapitel-Datei ist keine Buch-Datei', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', [{ path: 'Kapitel 1.md', children: [] }]);
    write(dir, 'Kapitel 1.md', '# Kapitel\n');
    expect(await detectBookDirFor(path.join(dir, 'Kapitel 1.md'))).toBeNull();
  });

  it('liefert null ohne Begleitdatei, bei Nicht-Markdown und bei leerer Eingabe', async () => {
    const dir = makeDir();
    write(dir, 'Notiz.md', '# Notiz\n');
    expect(await detectBookDirFor(path.join(dir, 'Notiz.md'))).toBeNull();
    const buch = makeDir();
    makeBook(buch, 'Buch.md', []);
    write(buch, 'Buch.txt', 'x');
    expect(await detectBookDirFor(path.join(buch, 'Buch.txt'))).toBeNull();
    expect(await detectBookDirFor('')).toBeNull();
    expect(await detectBookDirFor(null)).toBeNull();
  });
});

describe('collectMarkdownPaths (4T-0843)', () => {
  it('sammelt Markdown-Dateien rekursiv als buch-relative Pfade', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', []);
    write(dir, 'Teil 1/Aufbruch.md', 'a');
    write(dir, 'Teil 1/Unter/Hafen.markdown', 'b');
    write(dir, 'Anhang.txt', 'c');
    const paths = await collectMarkdownPaths(dir);
    expect([...paths].sort()).toEqual([
      'Buch.md',
      'Teil 1/Aufbruch.md',
      'Teil 1/Unter/Hafen.markdown',
    ]);
  });

  it('liefert eine leere Liste für einen fehlenden Ordner', async () => {
    expect(await collectMarkdownPaths(path.join(makeDir(), 'weg'))).toEqual([]);
  });
});

describe('buildBookState (4T-0843)', () => {
  it('liefert Baum, Lese-Ordnung und den Abgleich mit dem Datei-Bestand', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', [
      {
        path: 'Teil 1/Aufbruch.md',
        children: [{ path: 'Teil 1/Hafen.md', children: [] }],
      },
      { path: 'Teil 2/Heimkehr.md', children: [] },
    ]);
    write(dir, 'Teil 1/Aufbruch.md', 'a');
    write(dir, 'Teil 1/Hafen.md', 'b');
    write(dir, 'Lose Notiz.md', 'c');
    const result = await buildBookState(dir);
    expect(result.ok).toBe(true);
    const state = result.state;
    expect(state.bookDir).toBe(dir);
    expect(state.bookFileName).toBe('Buch.md');
    expect(state.tree).toEqual([
      {
        path: 'Teil 1/Aufbruch.md',
        children: [{ path: 'Teil 1/Hafen.md', children: [] }],
      },
      { path: 'Teil 2/Heimkehr.md', children: [] },
    ]);
    expect(state.readingOrder).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Hafen.md',
      'Teil 2/Heimkehr.md',
    ]);
    // Die Buch-Datei selbst zählt nie als nicht eingehängt.
    expect(state.unlinked).toEqual(['Lose Notiz.md']);
    expect(state.missing).toEqual(['Teil 2/Heimkehr.md']);
  });

  it('reicht die Fehler-Kennung eines Nicht-Buches durch', async () => {
    expect(await buildBookState(makeDir())).toEqual({ ok: false, error: 'no-book' });
  });
});

describe('bookFileExists (4T-0843)', () => {
  it('trennt vorhandene Buch-Datei, fehlende Datei und Ordner', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', []);
    fs.mkdirSync(path.join(dir, 'Ordner.md'));
    expect(await bookFileExists(dir, 'Buch.md')).toBe(true);
    expect(await bookFileExists(dir, 'Weg.md')).toBe(false);
    expect(await bookFileExists(dir, 'Ordner.md')).toBe(false);
    expect(await bookFileExists(dir, null)).toBe(false);
  });
});

describe('sanitizeBookName (4T-0843)', () => {
  it('nimmt gewöhnliche Namen und trimmt Rand-Leerraum und -Punkte', () => {
    expect(sanitizeBookName('Reise nach Ithaka')).toBe('Reise nach Ithaka');
    expect(sanitizeBookName('  Reise nach Ithaka  ')).toBe('Reise nach Ithaka');
    expect(sanitizeBookName('Buch.')).toBe('Buch');
  });

  it('lehnt leere Namen, Pfad-Segmente und verbotene Zeichen ab', () => {
    expect(sanitizeBookName('')).toBeNull();
    expect(sanitizeBookName('   ')).toBeNull();
    expect(sanitizeBookName('..')).toBeNull();
    expect(sanitizeBookName('Teil/Buch')).toBeNull();
    expect(sanitizeBookName('Teil\\Buch')).toBeNull();
    expect(sanitizeBookName('Buch?')).toBeNull();
    expect(sanitizeBookName('Buch:1')).toBeNull();
    expect(sanitizeBookName(42)).toBeNull();
  });
});

describe('createBook (4T-0843)', () => {
  it('AK3: legt Buch-Ordner, leere Buch-Datei und Begleitdatei an', async () => {
    const parent = makeDir();
    const created = await createBook(parent, 'Reise nach Ithaka');
    expect(created.ok).toBe(true);
    expect(created.bookDir).toBe(path.join(parent, 'Reise nach Ithaka'));
    expect(created.bookFileName).toBe('Reise nach Ithaka.md');
    expect(fs.readFileSync(created.bookFilePath, 'utf8')).toBe('');
    const settings = JSON.parse(
      fs.readFileSync(path.join(created.bookDir, BOOK_SETTINGS_FILENAME), 'utf8'),
    );
    expect(settings).toEqual({
      schemaVersion: 1,
      book: { file: 'Reise nach Ithaka.md' },
      chapters: [],
    });
    // Das neue Buch ist unmittelbar als Buch erkennbar und öffenbar.
    expect(await detectBookDirFor(created.bookFilePath)).toBe(created.bookDir);
    expect((await buildBookState(created.bookDir)).ok).toBe(true);
  });

  it('lehnt unzulässige Namen ab, ohne etwas anzulegen', async () => {
    const parent = makeDir();
    expect(await createBook(parent, '  ')).toEqual({ ok: false, error: 'invalid-name' });
    expect(await createBook(parent, 'Teil/Buch')).toEqual({ ok: false, error: 'invalid-name' });
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it('lässt einen bestehenden Ordner unangetastet', async () => {
    const parent = makeDir();
    write(parent, 'Reise nach Ithaka/Vorhandene Datei.md', 'unberührt');
    expect(await createBook(parent, 'Reise nach Ithaka')).toEqual({ ok: false, error: 'exists' });
    expect(fs.readdirSync(path.join(parent, 'Reise nach Ithaka'))).toEqual(['Vorhandene Datei.md']);
  });

  it('meldet einen fehlenden Eltern-Ordner als Fehlschlag', async () => {
    const result = await createBook(path.join(makeDir(), 'weg'), 'Buch');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('failed');
    expect(await createBook('', 'Buch')).toMatchObject({ ok: false, error: 'failed' });
  });
});

// --- 4T-0845 (Story S-0754): Struktur-Pflege ---------------------------------

// Kapitel-Baum aus der Begleitdatei eines Buch-Ordners lesen.
function leseBaum(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).chapters;
}

// Zwei Teile, ein Unterkapitel im ersten Teil.
function baumMitZweiTeilen() {
  return [
    { path: 'Teil 1/Aufbruch.md', children: [{ path: 'Teil 1/Hafen.md', children: [] }] },
    { path: 'Teil 2/Heimkehr.md', children: [] },
  ];
}

describe('applyChapterOp (4T-0845)', () => {
  it('bildet alle sechs Op-Formen auf die Kern-Operationen ab', () => {
    const baum = baumMitZweiTeilen();
    expect(
      applyChapterOp(baum, {
        type: 'insert',
        path: 'Anhang.md',
        parentPath: null,
        index: 0,
      }).tree.map((n) => n.path),
    ).toEqual(['Anhang.md', 'Teil 1/Aufbruch.md', 'Teil 2/Heimkehr.md']);
    expect(applyChapterOp(baum, { type: 'remove', path: 'Teil 1/Aufbruch.md' }).tree).toEqual([
      { path: 'Teil 2/Heimkehr.md', children: [] },
    ]);
    expect(
      applyChapterOp(baum, {
        type: 'moveWithinLevel',
        path: 'Teil 2/Heimkehr.md',
        direction: 'up',
      }).tree.map((n) => n.path),
    ).toEqual(['Teil 2/Heimkehr.md', 'Teil 1/Aufbruch.md']);
    expect(
      applyChapterOp(baum, {
        type: 'move',
        path: 'Teil 2/Heimkehr.md',
        parentPath: 'Teil 1/Aufbruch.md',
        index: null,
      }).tree[0].children.map((n) => n.path),
    ).toEqual(['Teil 1/Hafen.md', 'Teil 2/Heimkehr.md']);
    expect(
      applyChapterOp(baum, { type: 'indent', path: 'Teil 2/Heimkehr.md' }).tree[0].children.map(
        (n) => n.path,
      ),
    ).toEqual(['Teil 1/Hafen.md', 'Teil 2/Heimkehr.md']);
    expect(
      applyChapterOp(baum, { type: 'outdent', path: 'Teil 1/Hafen.md' }).tree.map((n) => n.path),
    ).toEqual(['Teil 1/Aufbruch.md', 'Teil 1/Hafen.md', 'Teil 2/Heimkehr.md']);
  });

  it('lässt die Eingabe unberührt und reicht Kern-Fehler durch', () => {
    const baum = baumMitZweiTeilen();
    const kopie = JSON.parse(JSON.stringify(baum));
    expect(applyChapterOp(baum, { type: 'remove', path: 'gibt-es-nicht.md' })).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
    expect(
      applyChapterOp(baum, {
        type: 'move',
        path: 'Teil 1/Aufbruch.md',
        parentPath: 'Teil 1/Hafen.md',
        index: null,
      }),
    ).toEqual({ ok: false, error: 'cycle' });
    expect(applyChapterOp(baum, { type: 'indent', path: 'Teil 1/Aufbruch.md' })).toEqual({
      ok: false,
      error: 'no-previous-sibling',
    });
    expect(applyChapterOp(baum, { type: 'outdent', path: 'Teil 1/Aufbruch.md' })).toEqual({
      ok: false,
      error: 'at-root',
    });
    expect(baum).toEqual(kopie);
  });

  it('weist unbekannte und unvollständige Op-Formen ab', () => {
    const baum = baumMitZweiTeilen();
    expect(applyChapterOp(baum, { type: 'umbenennen', path: 'a.md' })).toEqual({
      ok: false,
      error: 'invalid-op',
    });
    expect(applyChapterOp(baum, null)).toEqual({ ok: false, error: 'invalid-op' });
    expect(
      applyChapterOp(baum, { type: 'moveWithinLevel', path: 'Teil 2/Heimkehr.md', direction: 'x' }),
    ).toEqual({ ok: false, error: 'invalid-op' });
  });
});

describe('applyTreeOp (4T-0845)', () => {
  it('AK1: schreibt die neue Ordnung in die Begleitdatei', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    const result = await applyTreeOp(dir, {
      type: 'moveWithinLevel',
      path: 'Teil 2/Heimkehr.md',
      direction: 'up',
    });
    expect(result).toEqual({ ok: true, changed: true });
    expect(leseBaum(dir).map((n) => n.path)).toEqual(['Teil 2/Heimkehr.md', 'Teil 1/Aufbruch.md']);
  });

  it('AK1: das Verschieben über Ebenen nimmt den Unterbaum mit', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    expect(
      await applyTreeOp(dir, {
        type: 'move',
        path: 'Teil 1/Aufbruch.md',
        parentPath: 'Teil 2/Heimkehr.md',
        index: null,
      }),
    ).toEqual({ ok: true, changed: true });
    expect(leseBaum(dir)).toEqual([
      {
        path: 'Teil 2/Heimkehr.md',
        children: [
          { path: 'Teil 1/Aufbruch.md', children: [{ path: 'Teil 1/Hafen.md', children: [] }] },
        ],
      },
    ]);
  });

  it('AK3: Aushängen und Einhängen wirken nur auf die Deklaration', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    write(dir, 'Teil 2/Heimkehr.md', 'Text');
    expect((await applyTreeOp(dir, { type: 'remove', path: 'Teil 2/Heimkehr.md' })).ok).toBe(true);
    // AK4: die Datei bleibt liegen und erscheint als nicht eingehängt.
    expect(fs.readFileSync(path.join(dir, 'Teil 2', 'Heimkehr.md'), 'utf8')).toBe('Text');
    expect((await buildBookState(dir)).state.unlinked).toEqual(['Teil 2/Heimkehr.md']);
    expect(
      (
        await applyTreeOp(dir, {
          type: 'insert',
          path: 'Teil 2/Heimkehr.md',
          parentPath: null,
          index: null,
        })
      ).ok,
    ).toBe(true);
    expect((await buildBookState(dir)).state.unlinked).toEqual([]);
  });

  it('AK5: eine abgelehnte Operation schreibt nichts', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    const vorher = fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8');
    expect(
      await applyTreeOp(dir, {
        type: 'move',
        path: 'Teil 1/Aufbruch.md',
        parentPath: 'Teil 1/Hafen.md',
        index: null,
      }),
    ).toEqual({ ok: false, error: 'cycle' });
    expect(await applyTreeOp(dir, { type: 'remove', path: 'weg.md' })).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
    expect(await applyTreeOp(dir, { type: 'quatsch' })).toEqual({ ok: false, error: 'invalid-op' });
    expect(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).toBe(vorher);
  });

  it('am Rand einer Ebene bleibt die Datei unberührt', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    const vorher = fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8');
    expect(
      await applyTreeOp(dir, {
        type: 'moveWithinLevel',
        path: 'Teil 1/Aufbruch.md',
        direction: 'up',
      }),
    ).toEqual({ ok: true, changed: false });
    expect(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).toBe(vorher);
  });

  it('reicht die Fehler-Kennung eines Nicht-Buches durch', async () => {
    expect(await applyTreeOp(makeDir(), { type: 'remove', path: 'a.md' })).toEqual({
      ok: false,
      error: 'no-book',
    });
  });
});

describe('createChapter (4T-0845)', () => {
  it('legt die Datei im Buch-Ordner an und hängt sie unten ein', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    const result = await createChapter(dir, null, 'Nachwort');
    expect(result.ok).toBe(true);
    expect(result.relPath).toBe('Nachwort.md');
    expect(fs.readFileSync(path.join(dir, 'Nachwort.md'), 'utf8')).toBe('');
    expect(leseBaum(dir).map((n) => n.path)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 2/Heimkehr.md',
      'Nachwort.md',
    ]);
  });

  it('legt ein Unterkapitel im Ordner der Eltern-Kapitel-Datei an', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    const result = await createChapter(dir, 'Teil 1/Aufbruch.md', 'Der Wind');
    expect(result.ok).toBe(true);
    expect(result.relPath).toBe('Teil 1/Der Wind.md');
    expect(fs.existsSync(path.join(dir, 'Teil 1', 'Der Wind.md'))).toBe(true);
    expect(leseBaum(dir)[0].children.map((n) => n.path)).toEqual([
      'Teil 1/Hafen.md',
      'Teil 1/Der Wind.md',
    ]);
  });

  it('lehnt eine Namens-Kollision ab und lässt die bestehende Datei stehen', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', []);
    write(dir, 'Vorwort.md', 'unberührt');
    expect(await createChapter(dir, null, 'Vorwort')).toEqual({ ok: false, error: 'exists' });
    expect(fs.readFileSync(path.join(dir, 'Vorwort.md'), 'utf8')).toBe('unberührt');
    expect(leseBaum(dir)).toEqual([]);
  });

  it('lehnt unzulässige Namen und unbekannte Eltern ab, ohne etwas anzulegen', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    expect(await createChapter(dir, null, '   ')).toEqual({ ok: false, error: 'invalid-name' });
    expect(await createChapter(dir, null, 'Teil/Kapitel')).toEqual({
      ok: false,
      error: 'invalid-name',
    });
    expect(await createChapter(dir, 'gibt-es-nicht.md', 'Kapitel')).toEqual({
      ok: false,
      error: 'unknown-parent',
    });
    expect(await collectMarkdownPaths(dir)).toEqual(['Buch.md']);
  });
});

// --- 4T-0847 (Story S-0756): Verschieben und Umbenennen mit Nachführung ------

// Buch mit vorhandenen Kapitel-Dateien (der Verschiebe-Weg fasst echte
// Dateien an, nicht nur die Deklaration).
function makeBookMitDateien(root, bookFileName, chapters) {
  makeBook(root, bookFileName, chapters);
  write(root, 'Teil 1/Aufbruch.md', '# Aufbruch\n');
  write(root, 'Teil 1/Hafen.md', '# Hafen\n');
  write(root, 'Teil 2/Heimkehr.md', '# Heimkehr\n');
}

describe('findBookForFile (4T-0847)', () => {
  it('findet das Buch einer Kapitel-Datei über die Aufwärts-Suche', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    const found = await findBookForFile(path.join(dir, 'Teil 1', 'Hafen.md'));
    expect(found).not.toBeNull();
    expect(found.bookDir).toBe(dir);
    expect(found.relPath).toBe('Teil 1/Hafen.md');
    expect(found.settingsPath).toBe(path.join(dir, BOOK_SETTINGS_FILENAME));
  });

  it('steigt über einen Buch-Ordner hinweg, der die Datei nicht führt', async () => {
    // Aussen ein Buch, das die tief liegende Datei führt; dazwischen ein
    // zweites Buch, dessen Baum sie NICHT nennt. Der nähere Fund darf die
    // Suche nicht kappen.
    const aussen = makeDir();
    makeBook(aussen, 'Aussen.md', [{ path: 'Innen/Teil/Kapitel.md', children: [] }]);
    write(aussen, 'Innen/Teil/Kapitel.md', '# Kapitel\n');
    makeBook(path.join(aussen, 'Innen'), 'Innen.md', [{ path: 'Anderes.md', children: [] }]);
    const found = await findBookForFile(path.join(aussen, 'Innen', 'Teil', 'Kapitel.md'));
    expect(found).not.toBeNull();
    expect(found.bookDir).toBe(aussen);
    expect(found.relPath).toBe('Innen/Teil/Kapitel.md');
  });

  it('liefert null für nicht eingehängte Dateien, Nicht-Bücher und leere Eingabe', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    write(dir, 'Lose Notiz.md', 'x');
    expect(await findBookForFile(path.join(dir, 'Lose Notiz.md'))).toBeNull();
    expect(await findBookForFile(path.join(makeDir(), 'Notiz.md'))).toBeNull();
    expect(await findBookForFile('')).toBeNull();
    expect(await findBookForFile(null)).toBeNull();
  });
});

describe('followChapterFileMove (4T-0847)', () => {
  it('AK3: führt den Baum-Eintrag nach und lässt die Baum-Position unberührt', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    // Das Unterkapitel wandert physisch in einen anderen Ordner.
    const result = await followChapterFileMove(
      path.join(dir, 'Teil 1', 'Hafen.md'),
      path.join(dir, 'Teil 2', 'Hafen.md'),
    );
    expect(result).toEqual({
      ok: true,
      changed: true,
      bookDir: dir,
      oldRelPath: 'Teil 1/Hafen.md',
      newRelPath: 'Teil 2/Hafen.md',
    });
    // Position und Verschachtelung bleiben: weiterhin Unterkapitel von Teil 1.
    expect(leseBaum(dir)).toEqual([
      { path: 'Teil 1/Aufbruch.md', children: [{ path: 'Teil 2/Hafen.md', children: [] }] },
      { path: 'Teil 2/Heimkehr.md', children: [] },
    ]);
  });

  it('führt auch das reine Umbenennen im selben Ordner nach', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    const result = await followChapterFileMove(
      path.join(dir, 'Teil 1', 'Aufbruch.md'),
      path.join(dir, 'Teil 1', 'Der Aufbruch.md'),
    );
    expect(result.changed).toBe(true);
    expect(leseBaum(dir)[0]).toEqual({
      path: 'Teil 1/Der Aufbruch.md',
      children: [{ path: 'Teil 1/Hafen.md', children: [] }],
    });
  });

  it('lässt nicht eingehängte Dateien unangetastet', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    write(dir, 'Lose Notiz.md', 'x');
    const vorher = fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8');
    expect(
      await followChapterFileMove(
        path.join(dir, 'Lose Notiz.md'),
        path.join(dir, 'Teil 1', 'Lose Notiz.md'),
      ),
    ).toEqual({ ok: true, changed: false });
    expect(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).toBe(vorher);
  });

  it('weist ein Ziel außerhalb des Buch-Ordners ab, ohne zu schreiben', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    const vorher = fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8');
    expect(
      await followChapterFileMove(
        path.join(dir, 'Teil 1', 'Hafen.md'),
        path.join(makeDir(), 'Hafen.md'),
      ),
    ).toEqual({ ok: false, error: 'outside-book' });
    expect(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).toBe(vorher);
  });

  it('lehnt ein bereits belegtes Ziel im Baum ab (Invariante)', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    expect(
      await followChapterFileMove(
        path.join(dir, 'Teil 1', 'Hafen.md'),
        path.join(dir, 'Teil 2', 'Heimkehr.md'),
      ),
    ).toEqual({ ok: false, error: 'duplicate-path' });
  });
});

describe('planChapterFileMove (4T-0847)', () => {
  it('AK1: plant die Bewegung in einen anderen Ordner des Buch-Ordners', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    const plan = await planChapterFileMove(dir, 'Teil 1/Hafen.md', path.join(dir, 'Teil 2'));
    expect(plan).toEqual({
      ok: true,
      sourcePath: path.join(dir, 'Teil 1', 'Hafen.md'),
      targetPath: path.join(dir, 'Teil 2', 'Hafen.md'),
      newRelPath: 'Teil 2/Hafen.md',
    });
    // Geplant heißt nicht bewegt: die Datei liegt unverändert am alten Ort.
    expect(fs.existsSync(plan.sourcePath)).toBe(true);
    expect(fs.existsSync(plan.targetPath)).toBe(false);
  });

  it('AK1: der Buch-Ordner selbst ist ein zulässiges Ziel (Herausziehen)', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', dir)).toMatchObject({
      ok: true,
      newRelPath: 'Hafen.md',
    });
  });

  it('AK4: Ziele außerhalb des Buch-Ordners werden abgewiesen', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', makeDir())).toEqual({
      ok: false,
      error: 'outside-book',
    });
    // Präfix-Nachbar ist kein Unterordner.
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', `${dir} Anhang`)).toEqual({
      ok: false,
      error: 'outside-book',
    });
    // Ausbruch über '..' im Ziel.
    expect(
      await planChapterFileMove(dir, 'Teil 1/Hafen.md', path.join(dir, 'Teil 1', '..', '..')),
    ).toEqual({ ok: false, error: 'outside-book' });
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', '')).toEqual({
      ok: false,
      error: 'outside-book',
    });
  });

  it('meldet Namens-Kollision, unveränderte Lage und fehlendes Ziel', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    write(dir, 'Teil 2/Hafen.md', 'belegt');
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', path.join(dir, 'Teil 2'))).toEqual({
      ok: false,
      error: 'exists',
    });
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', path.join(dir, 'Teil 1'))).toEqual({
      ok: false,
      error: 'unchanged',
    });
    expect(await planChapterFileMove(dir, 'Teil 1/Hafen.md', path.join(dir, 'Teil 3'))).toEqual({
      ok: false,
      error: 'unknown-target',
    });
  });

  it('schützt die Buch-Datei und lehnt fehlende Quellen und Nicht-Bücher ab', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    expect(await planChapterFileMove(dir, 'Buch.md', path.join(dir, 'Teil 1'))).toEqual({
      ok: false,
      error: 'book-file',
    });
    expect(await planChapterFileMove(dir, 'Weg.md', path.join(dir, 'Teil 1'))).toEqual({
      ok: false,
      error: 'unknown-file',
    });
    // Ein Ordner ist keine Kapitel-Datei.
    expect(await planChapterFileMove(dir, 'Teil 1', path.join(dir, 'Teil 2'))).toEqual({
      ok: false,
      error: 'unknown-file',
    });
    expect(await planChapterFileMove(dir, '../Fremde Datei.md', dir)).toEqual({
      ok: false,
      error: 'invalid-path',
    });
    expect(await planChapterFileMove(makeDir(), 'a.md', '.')).toEqual({
      ok: false,
      error: 'no-book',
    });
  });

  it('plant auch für eine nicht eingehängte Datei (sie bleibt nicht eingehängt)', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', baumMitZweiTeilen());
    write(dir, 'Lose Notiz.md', 'x');
    const plan = await planChapterFileMove(dir, 'Lose Notiz.md', path.join(dir, 'Teil 1'));
    expect(plan).toMatchObject({ ok: true, newRelPath: 'Teil 1/Lose Notiz.md' });
    // Die Deklaration bleibt unberührt — ein Baum-Eintrag entsteht nicht.
    expect(leseBaum(dir)).toEqual(baumMitZweiTeilen());
  });
});

// --- 4T-0848 (Story S-0757): Reparatur fehlender Kapitel ---------------------

// Buch, dessen Kapitel „Teil 1/Hafen.md" deklariert, aber nicht vorhanden ist;
// die namensgleiche Datei liegt an anderer Stelle des Buch-Ordners (der Fall
// nach einer Verschiebung am Dateisystem vorbei).
function makeBuchMitFehlendemKapitel(root) {
  makeBook(root, 'Buch.md', baumMitZweiTeilen());
  write(root, 'Teil 1/Aufbruch.md', '# Aufbruch\n');
  write(root, 'Teil 2/Heimkehr.md', '# Heimkehr\n');
  write(root, 'Archiv/Hafen.md', '# Hafen\n');
}

describe('suggestMissingChapters (4T-0848)', () => {
  it('AK3: findet die namensgleiche Datei an anderer Stelle des Buch-Ordners', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    expect(await suggestMissingChapters(dir, 'Teil 1/Hafen.md')).toEqual({
      ok: true,
      suggestions: ['Archiv/Hafen.md'],
    });
  });

  it('vergleicht den Basenamen ohne Rücksicht auf die Schreibweise', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', [{ path: 'Teil 1/Hafen.md', children: [] }]);
    write(dir, 'Archiv/HAFEN.MD', '# Hafen\n');
    expect((await suggestMissingChapters(dir, 'teil 1/hafen.md')).suggestions).toEqual([
      'Archiv/HAFEN.MD',
    ]);
  });

  it('liefert alle Funde, wenn es mehrere gibt', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    write(dir, 'Entwürfe/Hafen.md', '# Hafen\n');
    const result = await suggestMissingChapters(dir, 'Teil 1/Hafen.md');
    expect([...result.suggestions].sort()).toEqual(['Archiv/Hafen.md', 'Entwürfe/Hafen.md']);
  });

  it('liefert eine leere Liste ohne namensgleiche Datei', async () => {
    const dir = makeDir();
    makeBookMitDateien(dir, 'Buch.md', [
      ...baumMitZweiTeilen(),
      { path: 'Anhang.md', children: [] },
    ]);
    expect(await suggestMissingChapters(dir, 'Anhang.md')).toEqual({ ok: true, suggestions: [] });
  });

  it('schlägt weder die Buch-Datei noch ein bereits eingehängtes Kapitel vor', async () => {
    const dir = makeDir();
    // Der fehlende Eintrag heißt wie die Buch-Datei und wie ein anderes,
    // vorhandenes Kapitel; beide wären als Zuordnung unbrauchbar.
    makeBook(dir, 'Heimkehr.md', [
      ...baumMitZweiTeilen(),
      { path: 'Archiv/Heimkehr.md', children: [] },
    ]);
    write(dir, 'Heimkehr.md', '# Buch\n');
    write(dir, 'Teil 2/Heimkehr.md', '# Heimkehr\n');
    write(dir, 'Archiv/Heimkehr.md', '# Archiv\n');
    write(dir, 'Lose/Heimkehr.md', '# Lose\n');
    expect((await suggestMissingChapters(dir, 'Weg/Heimkehr.md')).suggestions).toEqual([
      'Lose/Heimkehr.md',
    ]);
  });

  it('reicht Nicht-Buch und unzulässigen Pfad durch, ohne etwas zu ändern', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    const vorher = fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8');
    expect(await suggestMissingChapters(makeDir(), 'a.md')).toEqual({
      ok: false,
      error: 'no-book',
    });
    expect(await suggestMissingChapters(dir, '../Fremd.md')).toEqual({
      ok: false,
      error: 'invalid-path',
    });
    expect(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).toBe(vorher);
  });
});

describe('buildBookState mit Vorschlägen (4T-0848)', () => {
  it('legt dem Zustand die Funde je fehlendem Kapitel bei', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    const state = (await buildBookState(dir)).state;
    expect(state.missing).toEqual(['Teil 1/Hafen.md']);
    expect(state.missingSuggestions).toEqual({ 'Teil 1/Hafen.md': ['Archiv/Hafen.md'] });
  });

  it('lässt Kapitel ohne Fund aus der Abbildung heraus', async () => {
    const dir = makeDir();
    makeBook(dir, 'Buch.md', baumMitZweiTeilen());
    const state = (await buildBookState(dir)).state;
    expect(state.missing.length).toBe(3);
    expect(state.missingSuggestions).toEqual({});
  });
});

describe('reassignChapter (4T-0848)', () => {
  it('AK2/AK4: ordnet die Datei zu und lässt die Baum-Position unberührt', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', 'Archiv/Hafen.md')).toEqual({
      ok: true,
      relPath: 'Archiv/Hafen.md',
    });
    // Weiterhin Unterkapitel von „Teil 1/Aufbruch.md", nur der Zeiger ist neu.
    expect(leseBaum(dir)).toEqual([
      { path: 'Teil 1/Aufbruch.md', children: [{ path: 'Archiv/Hafen.md', children: [] }] },
      { path: 'Teil 2/Heimkehr.md', children: [] },
    ]);
    // AK4: der Eintrag gilt nicht mehr als fehlend.
    expect((await buildBookState(dir)).state.missing).toEqual([]);
  });

  it('nimmt das Ziel auch als absoluten Pfad an (Weg über den Datei-Dialog)', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    expect(
      await reassignChapter(dir, 'Teil 1/Hafen.md', path.join(dir, 'Archiv', 'Hafen.md')),
    ).toEqual({ ok: true, relPath: 'Archiv/Hafen.md' });
  });

  it('weist ein fehlendes Ziel ab, ohne zu schreiben', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    const vorher = fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8');
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', 'Archiv/Gibt-es-nicht.md')).toEqual({
      ok: false,
      error: 'unknown-file',
    });
    // Ein Ordner ist keine Kapitel-Datei.
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', 'Archiv')).toEqual({
      ok: false,
      error: 'invalid-path',
    });
    expect(fs.readFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), 'utf8')).toBe(vorher);
  });

  it('weist ein Ziel außerhalb des Buch-Ordners ab', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    const fremd = makeDir();
    write(fremd, 'Hafen.md', '# Fremd\n');
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', path.join(fremd, 'Hafen.md'))).toEqual({
      ok: false,
      error: 'outside-book',
    });
    // Präfix-Nachbar ist kein Unterordner, '..' bricht nicht aus.
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', `${dir} Anhang/Hafen.md`)).toEqual({
      ok: false,
      error: 'outside-book',
    });
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', '../Hafen.md')).toEqual({
      ok: false,
      error: 'invalid-path',
    });
    expect(leseBaum(dir)).toEqual(baumMitZweiTeilen());
  });

  it('weist eine bereits eingehängte Datei und die Buch-Datei ab', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', 'Teil 2/Heimkehr.md')).toEqual({
      ok: false,
      error: 'duplicate-path',
    });
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', 'Buch.md')).toEqual({
      ok: false,
      error: 'book-file',
    });
    expect(leseBaum(dir)).toEqual(baumMitZweiTeilen());
  });

  it('meldet die Wahl derselben Datei als folgenlos', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    write(dir, 'Teil 1/Hafen.md', '# Wieder da\n');
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', 'Teil 1/Hafen.md')).toEqual({
      ok: false,
      error: 'unchanged',
    });
  });

  it('lehnt unbekannte Kapitel, Nicht-Bücher und leere Ziele ab', async () => {
    const dir = makeDir();
    makeBuchMitFehlendemKapitel(dir);
    expect(await reassignChapter(dir, 'Gibt-es-nicht.md', 'Archiv/Hafen.md')).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
    expect(await reassignChapter(dir, '../Fremd.md', 'Archiv/Hafen.md')).toEqual({
      ok: false,
      error: 'invalid-path',
    });
    expect(await reassignChapter(dir, 'Teil 1/Hafen.md', '')).toEqual({
      ok: false,
      error: 'invalid-path',
    });
    expect(await reassignChapter(makeDir(), 'a.md', 'b.md')).toEqual({
      ok: false,
      error: 'no-book',
    });
  });
});
