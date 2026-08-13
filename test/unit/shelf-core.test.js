// 4T-0866 (Epic 3E-0162): Kern-Modell des Bücherregals
// (src/shared/books/shelf-core.js) — Format der Begleitdatei, Erkennung ohne
// Rückverweis, Buch-Zuordnung samt Invariante und Abgleich mit dem
// Ordner-Bestand. Reine Funktionen, direkter Import (Muster
// book-core.test.js); ohne Datei-, Netz- und Ablage-Bezug.
import { describe, expect, it } from 'vitest';
import {
  SHELF_SETTINGS_FILENAME,
  SHELF_SCHEMA_VERSION,
  normalizeShelfFileName,
  normalizeBookDirName,
  emptyShelfContainer,
  parseShelfContainer,
  serializeShelfContainer,
  readShelfFileName,
  setShelfFileName,
  readBookList,
  setBookList,
  isShelfSettingsFileName,
  findShelfSettingsEntry,
  isShelfFileName,
  shelfFileNameFromRaw,
  normalizeBookList,
  hasBook,
  assignBook,
  unassignBook,
  renameBookDir,
  diffBookDirs,
} from '../../src/shared/books/shelf-core.js';

const REGAL = 'Meine Bibliothek.md';

describe('shelf-core: Namen', () => {
  it('säubert Basenamen und lehnt Pfad-Trenner ab', () => {
    expect(normalizeShelfFileName('  Meine Bibliothek.md  ')).toBe('Meine Bibliothek.md');
    expect(normalizeShelfFileName('')).toBe(null);
    expect(normalizeShelfFileName('   ')).toBe(null);
    expect(normalizeShelfFileName('unter/ordner.md')).toBe(null);
    expect(normalizeShelfFileName('unter\\ordner.md')).toBe(null);
    expect(normalizeShelfFileName(42)).toBe(null);
  });

  it('behandelt Buch-Ordner-Namen nach denselben Regeln (flache Lage)', () => {
    expect(normalizeBookDirName(' Reise nach Ithaka ')).toBe('Reise nach Ithaka');
    expect(normalizeBookDirName('a/b')).toBe(null);
  });
});

describe('shelf-core: Begleitdatei', () => {
  it('erzeugt einen leeren Container und liest ihn zurück', () => {
    const container = emptyShelfContainer(REGAL);
    expect(container).toEqual({
      schemaVersion: SHELF_SCHEMA_VERSION,
      shelf: { file: REGAL },
      books: [],
    });
    expect(readShelfFileName(container)).toBe(REGAL);
    expect(emptyShelfContainer('a/b.md')).toBe(null);
  });

  it('parst gültige Container und meldet defekte mit Befund', () => {
    const roh = serializeShelfContainer(emptyShelfContainer(REGAL));
    const parsed = parseShelfContainer(roh);
    expect(parsed.ok).toBe(true);
    expect(readShelfFileName(parsed.container)).toBe(REGAL);
    expect(parseShelfContainer('kein json').ok).toBe(false);
    expect(parseShelfContainer('[]').ok).toBe(false);
    expect(parseShelfContainer('{"schemaVersion":99}').ok).toBe(false);
    const ohneShelf = parseShelfContainer(`{"schemaVersion":${SHELF_SCHEMA_VERSION}}`);
    expect(ohneShelf.ok).toBe(false);
    expect(ohneShelf.error).toContain('shelf-Sektion');
  });

  it('lässt eine defekte books-Sektion das Regal nicht aussetzen (Fehler-Isolation)', () => {
    const roh = `{"schemaVersion":${SHELF_SCHEMA_VERSION},"shelf":{"file":"${REGAL}"},"books":"kaputt"}`;
    const parsed = parseShelfContainer(roh);
    expect(parsed.ok).toBe(true);
    expect(readBookList(parsed.container)).toEqual([]);
  });

  it('führt den Regal-Datei-Namen nach und erhält fremde Sektions-Felder', () => {
    const container = emptyShelfContainer(REGAL);
    container.shelf.zusatz = 'bleibt';
    expect(setShelfFileName(container, 'Neuer Name.md')).toBe(container);
    expect(container.shelf).toEqual({ file: 'Neuer Name.md', zusatz: 'bleibt' });
    expect(setShelfFileName(container, 'a/b.md')).toBe(null);
    expect(container.shelf.file).toBe('Neuer Name.md');
  });

  it('serialisiert lesbar eingerückt mit End-Zeilenumbruch', () => {
    const text = serializeShelfContainer(emptyShelfContainer(REGAL));
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "shelf"');
  });
});

describe('shelf-core: Erkennung ohne Rückverweis', () => {
  it('erkennt die Begleitdatei unabhängig von der Schreibweise', () => {
    expect(isShelfSettingsFileName(SHELF_SETTINGS_FILENAME)).toBe(true);
    expect(isShelfSettingsFileName('shelf_settings.MDDA')).toBe(true);
    expect(isShelfSettingsFileName('Book_Settings.mdda')).toBe(false);
    expect(findShelfSettingsEntry(['a.md', 'SHELF_SETTINGS.mdda'])).toBe('SHELF_SETTINGS.mdda');
    expect(findShelfSettingsEntry(['a.md'])).toBe(null);
    expect(findShelfSettingsEntry(null)).toBe(null);
  });

  it('erkennt die Regal-Datei nur über die Benennung in der Begleitdatei', () => {
    const container = emptyShelfContainer(REGAL);
    expect(isShelfFileName(container, REGAL)).toBe(true);
    expect(isShelfFileName(container, 'meine bibliothek.MD')).toBe(true);
    expect(isShelfFileName(container, 'Andere.md')).toBe(false);
    expect(isShelfFileName(null, REGAL)).toBe(false);
  });

  it('liefert den Regal-Datei-Namen direkt aus dem Roh-Inhalt', () => {
    const roh = serializeShelfContainer(emptyShelfContainer(REGAL));
    expect(shelfFileNameFromRaw(roh)).toBe(REGAL);
    expect(shelfFileNameFromRaw('kein json')).toBe(null);
  });
});

describe('shelf-core: Buch-Liste und Zuordnung', () => {
  it('normalisiert die Liste tolerant: defekte und doppelte Einträge entfallen', () => {
    const roh = ['Reise nach Ithaka', ' Kochbuch ', 'reise nach ithaka', 'a/b', '', 42, null];
    expect(normalizeBookList(roh)).toEqual(['Reise nach Ithaka', 'Kochbuch']);
    expect(normalizeBookList('kein array')).toEqual([]);
    // Frisches Array, Eingabe unberührt.
    const eingabe = ['Eins'];
    expect(normalizeBookList(eingabe)).not.toBe(eingabe);
  });

  it('schreibt die Liste normalisiert in den Container', () => {
    const container = emptyShelfContainer(REGAL);
    expect(setBookList(container, ['B', 'b', 'A'])).toBe(container);
    expect(readBookList(container)).toEqual(['B', 'A']);
    expect(setBookList(null, ['B'])).toBe(null);
  });

  it('ordnet zu, hält die Invariante und fügt an der Ziel-Position ein', () => {
    const eins = assignBook([], 'Reise nach Ithaka');
    expect(eins).toEqual({ ok: true, books: ['Reise nach Ithaka'] });
    const zwei = assignBook(eins.books, 'Kochbuch', 0);
    expect(zwei.books).toEqual(['Kochbuch', 'Reise nach Ithaka']);
    expect(assignBook(zwei.books, 'reise nach ITHAKA')).toEqual({
      ok: false,
      error: 'duplicate-book',
    });
    expect(assignBook(zwei.books, 'a/b')).toEqual({ ok: false, error: 'invalid-name' });
    // Index außerhalb des Bereichs hängt hinten an.
    expect(assignBook(zwei.books, 'Drittes', 99).books).toEqual([
      'Kochbuch',
      'Reise nach Ithaka',
      'Drittes',
    ]);
  });

  it('löst die Zuordnung schreibweisen-tolerant und meldet Unbekanntes', () => {
    const liste = ['Kochbuch', 'Reise nach Ithaka'];
    const geloest = unassignBook(liste, 'reise nach ithaka');
    expect(geloest.ok).toBe(true);
    expect(geloest.books).toEqual(['Kochbuch']);
    expect(geloest.removed).toBe('Reise nach Ithaka');
    expect(liste).toEqual(['Kochbuch', 'Reise nach Ithaka']);
    expect(unassignBook(liste, 'Fehlt')).toEqual({ ok: false, error: 'unknown-book' });
    expect(unassignBook(liste, null)).toEqual({ ok: false, error: 'invalid-name' });
  });

  it('führt einen umbenannten Buch-Ordner unter Erhalt der Position nach', () => {
    const liste = ['Kochbuch', 'Reise nach Ithaka', 'Atlas'];
    const umbenannt = renameBookDir(liste, 'reise nach ithaka', 'Odyssee');
    expect(umbenannt.ok).toBe(true);
    expect(umbenannt.books).toEqual(['Kochbuch', 'Odyssee', 'Atlas']);
    // Reine Schreibweisen-Änderung ist zulässig.
    expect(renameBookDir(liste, 'Atlas', 'ATLAS').books).toEqual([
      'Kochbuch',
      'Reise nach Ithaka',
      'ATLAS',
    ]);
    expect(renameBookDir(liste, 'Atlas', 'Kochbuch')).toEqual({
      ok: false,
      error: 'duplicate-book',
    });
    expect(renameBookDir(liste, 'Fehlt', 'Egal')).toEqual({ ok: false, error: 'unknown-book' });
    expect(renameBookDir(liste, 'Atlas', 'a/b')).toEqual({ ok: false, error: 'invalid-name' });
  });

  it('beantwortet die Zugehörigkeits-Frage schreibweisen-tolerant', () => {
    expect(hasBook(['Kochbuch'], 'kochbuch')).toBe(true);
    expect(hasBook(['Kochbuch'], 'Fehlt')).toBe(false);
    expect(hasBook(['Kochbuch'], null)).toBe(false);
  });
});

describe('shelf-core: Abgleich mit dem Ordner-Bestand', () => {
  it('trennt nicht zugeordnete Buch-Ordner von fehlenden Zuordnungen', () => {
    const liste = ['Kochbuch', 'Verschollen'];
    const { unassigned, missing } = diffBookDirs(liste, [
      'Reise nach Ithaka',
      'kochbuch',
      'Neuzugang',
    ]);
    // In Eingabe-Reihenfolge; das zugeordnete Kochbuch erscheint nicht.
    expect(unassigned).toEqual(['Reise nach Ithaka', 'Neuzugang']);
    // In Listen-Reihenfolge; der Ordner fehlt im Bestand.
    expect(missing).toEqual(['Verschollen']);
  });

  it('bleibt bei leeren und defekten Eingaben stabil', () => {
    expect(diffBookDirs([], [])).toEqual({ unassigned: [], missing: [] });
    expect(diffBookDirs(null, null)).toEqual({ unassigned: [], missing: [] });
    expect(diffBookDirs(['A'], ['a', 'A', 'x/y'])).toEqual({ unassigned: [], missing: [] });
  });
});
