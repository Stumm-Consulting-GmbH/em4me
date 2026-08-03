// 4T-0842 (Epic 3E-0147): Kern-Modell des Buches (src/shared/book-core.js) —
// Format der Begleitdatei, Erkennung ohne Rückverweis, Kapitel-Baum samt
// Invariante, Lese-Ordnung, Abgleich mit dem Datei-Bestand und
// Pfad-Nachführung. Reine Funktionen, direkter Import (Muster
// bookmark-tree.test.js); ohne Datei-, Netz- und Ablage-Bezug.
import { describe, expect, it } from 'vitest';
import {
  BOOK_SETTINGS_FILENAME,
  BOOK_SCHEMA_VERSION,
  normalizeBookFileName,
  emptyBookContainer,
  parseBookContainer,
  serializeBookContainer,
  readBookFileName,
  setBookFileName,
  readChapterTree,
  setChapterTree,
  isBookSettingsFileName,
  findBookSettingsEntry,
  isBookFileName,
  bookFileNameFromRaw,
  normalizeChapterTree,
  hasChapter,
  insertChapter,
  removeChapter,
  moveChapterWithinLevel,
  moveChapter,
  indentChapter,
  outdentChapter,
  renameChapterPath,
  flattenChapters,
  chapterPathsInReadingOrder,
  nextChapterPath,
  previousChapterPath,
  diffChapterFiles,
} from '../../src/shared/book-core.js';

const BUCH = 'Reise nach Ithaka.md';

// Beispiel-Buch: zwei Teile, der erste mit zwei Unterkapiteln.
// Lese-Reihenfolge: Aufbruch, Der Hafen, Die Fähre, Heimkehr.
function baum() {
  return [
    {
      path: 'Teil 1/Aufbruch.md',
      children: [
        { path: 'Teil 1/Der Hafen.md', children: [] },
        { path: 'Teil 1/Die Fähre.md', children: [] },
      ],
    },
    { path: 'Teil 2/Heimkehr.md', children: [] },
  ];
}

describe('Begleitdatei', () => {
  it('legt einen Container mit Schema, Buch-Datei und leerer Kapitel-Sektion an', () => {
    expect(emptyBookContainer(BUCH)).toEqual({
      schemaVersion: BOOK_SCHEMA_VERSION,
      book: { file: BUCH },
      chapters: [],
    });
  });

  it('lehnt unzulässige Basenamen der Buch-Datei ab', () => {
    expect(normalizeBookFileName('  Buch.md  ')).toBe('Buch.md');
    expect(normalizeBookFileName('')).toBeNull();
    expect(normalizeBookFileName('   ')).toBeNull();
    expect(normalizeBookFileName('Unterordner/Buch.md')).toBeNull();
    expect(normalizeBookFileName('Unterordner\\Buch.md')).toBeNull();
    expect(normalizeBookFileName(null)).toBeNull();
    expect(emptyBookContainer('')).toBeNull();
    expect(emptyBookContainer(42)).toBeNull();
  });

  it('ergibt beim Schreiben und Wiederlesen denselben Kapitel-Baum', () => {
    const container = setChapterTree(emptyBookContainer(BUCH), baum());
    const wieder = parseBookContainer(serializeBookContainer(container));
    expect(wieder.ok).toBe(true);
    expect(readBookFileName(wieder.container)).toBe(BUCH);
    expect(readChapterTree(wieder.container)).toEqual(baum());
  });

  it('serialisiert lesbar eingerückt mit abschließendem Zeilenumbruch', () => {
    const text = serializeBookContainer(emptyBookContainer(BUCH));
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "book": {');
  });

  it('lehnt defektes JSON, fremde schemaVersion und fehlende Buch-Datei ab', () => {
    expect(parseBookContainer('kein JSON').ok).toBe(false);
    expect(parseBookContainer('[]').ok).toBe(false);
    expect(parseBookContainer('null').ok).toBe(false);
    expect(parseBookContainer(JSON.stringify({ schemaVersion: 99, book: { file: BUCH } })).ok).toBe(
      false,
    );
    expect(parseBookContainer(JSON.stringify({ schemaVersion: 1 })).ok).toBe(false);
    expect(parseBookContainer(JSON.stringify({ schemaVersion: 1, book: { file: '' } })).ok).toBe(
      false,
    );
    expect(
      parseBookContainer(JSON.stringify({ schemaVersion: 1, book: { file: 'a/b.md' } })).ok,
    ).toBe(false);
  });

  it('setzt eine defekte Kapitel-Sektion aus, statt das Buch abzulehnen', () => {
    const parsed = parseBookContainer(
      JSON.stringify({ schemaVersion: 1, book: { file: BUCH }, chapters: 'kaputt' }),
    );
    expect(parsed.ok).toBe(true);
    expect(readChapterTree(parsed.container)).toEqual([]);
  });

  it('führt den Basename der Buch-Datei nach und erhält übrige Felder der Sektion', () => {
    const container = emptyBookContainer(BUCH);
    container.book.unbekannt = 'bleibt';
    expect(setBookFileName(container, 'Ithaka.md')).toBe(container);
    expect(container.book).toEqual({ file: 'Ithaka.md', unbekannt: 'bleibt' });
    expect(setBookFileName(container, 'a/b.md')).toBeNull();
    expect(readBookFileName(container)).toBe('Ithaka.md');
    expect(readBookFileName({})).toBeNull();
    expect(readBookFileName(null)).toBeNull();
  });
});

describe('Erkennung ohne Rückverweis', () => {
  it('erkennt die Begleitdatei am Namen, unabhängig von der Schreibweise', () => {
    expect(BOOK_SETTINGS_FILENAME).toBe('Book_Settings.mdda');
    expect(isBookSettingsFileName('Book_Settings.mdda')).toBe(true);
    expect(isBookSettingsFileName('book_settings.MDDA')).toBe(true);
    expect(isBookSettingsFileName('Area_Settings.mdda')).toBe(false);
    expect(isBookSettingsFileName(null)).toBe(false);
  });

  it('findet die Begleitdatei im Ordner-Inhalt in ihrer tatsächlichen Schreibweise', () => {
    expect(findBookSettingsEntry([BUCH, 'book_settings.mdda', 'Kapitel.md'])).toBe(
      'book_settings.mdda',
    );
    expect(findBookSettingsEntry([BUCH, 'Kapitel.md'])).toBeNull();
    expect(findBookSettingsEntry(null)).toBeNull();
  });

  it('erklärt genau die benannte Markdown-Datei zur Buch-Datei', () => {
    const container = emptyBookContainer(BUCH);
    expect(isBookFileName(container, BUCH)).toBe(true);
    expect(isBookFileName(container, 'reise nach ithaka.md')).toBe(true);
    expect(isBookFileName(container, 'Teil 1/Aufbruch.md')).toBe(false);
    expect(isBookFileName(container, 'Anderes Buch.md')).toBe(false);
    expect(isBookFileName(null, BUCH)).toBe(false);
  });

  it('erkennt die Buch-Datei auch aus dem rohen Inhalt der Begleitdatei', () => {
    const raw = serializeBookContainer(emptyBookContainer(BUCH));
    expect(bookFileNameFromRaw(raw)).toBe(BUCH);
    expect(bookFileNameFromRaw('kein JSON')).toBeNull();
    expect(bookFileNameFromRaw(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
  });
});

describe('Kapitel-Baum: Normalisierung', () => {
  it('bringt Pfade auf die buch-relative Form und ergänzt fehlende Kind-Listen', () => {
    expect(normalizeChapterTree([{ path: 'Teil 1\\Aufbruch.md' }])).toEqual([
      { path: 'Teil 1/Aufbruch.md', children: [] },
    ]);
    expect(normalizeChapterTree('kaputt')).toEqual([]);
    expect(normalizeChapterTree(undefined)).toEqual([]);
  });

  it('verwirft Knoten ohne auflösbaren Pfad samt Unterbaum', () => {
    const roh = [
      { path: '../Ausbruch.md', children: [{ path: 'Verwaist.md', children: [] }] },
      { path: 'C:/Absolut.md', children: [] },
      { path: '', children: [] },
      'kein Knoten',
      { path: 'Kapitel.md', children: [] },
    ];
    expect(normalizeChapterTree(roh)).toEqual([{ path: 'Kapitel.md', children: [] }]);
  });

  it('hält die Invariante: derselbe Pfad hängt höchstens einmal im Baum', () => {
    const roh = [
      { path: 'Kapitel.md', children: [] },
      { path: 'KAPITEL.md', children: [{ path: 'Unterkapitel.md', children: [] }] },
      { path: 'Weiteres.md', children: [{ path: 'Kapitel.md', children: [] }] },
    ];
    expect(normalizeChapterTree(roh)).toEqual([
      { path: 'Kapitel.md', children: [] },
      { path: 'Weiteres.md', children: [] },
    ]);
  });

  it('lässt die Eingabe unberührt', () => {
    const eingabe = baum();
    const kopie = JSON.parse(JSON.stringify(eingabe));
    const normalisiert = normalizeChapterTree(eingabe);
    normalisiert[0].children.pop();
    expect(eingabe).toEqual(kopie);
  });

  it('beantwortet, ob ein Pfad im Baum hängt', () => {
    expect(hasChapter(baum(), 'Teil 1/Die Fähre.md')).toBe(true);
    expect(hasChapter(baum(), 'Teil 1\\die fähre.md')).toBe(true);
    expect(hasChapter(baum(), 'Teil 3/Nachwort.md')).toBe(false);
    expect(hasChapter(baum(), '../Ausbruch.md')).toBe(false);
  });
});

describe('Einhängen', () => {
  it('hängt auf oberster Ebene an und an gewünschter Position ein', () => {
    const angehaengt = insertChapter(baum(), 'Nachwort.md');
    expect(angehaengt.ok).toBe(true);
    expect(chapterPathsInReadingOrder(angehaengt.tree).at(-1)).toBe('Nachwort.md');

    const vorne = insertChapter(baum(), 'Vorwort.md', null, 0);
    expect(chapterPathsInReadingOrder(vorne.tree)[0]).toBe('Vorwort.md');
  });

  it('hängt unter einem Eltern-Kapitel an gewünschter Position ein', () => {
    const ergebnis = insertChapter(baum(), 'Teil 1/Das Schiff.md', 'Teil 1/Aufbruch.md', 1);
    expect(ergebnis.ok).toBe(true);
    expect(chapterPathsInReadingOrder(ergebnis.tree)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Der Hafen.md',
      'Teil 1/Das Schiff.md',
      'Teil 1/Die Fähre.md',
      'Teil 2/Heimkehr.md',
    ]);
  });

  it('hängt bei Position außerhalb des Bereichs hinten an', () => {
    const ergebnis = insertChapter(baum(), 'Teil 1/Das Schiff.md', 'Teil 1/Aufbruch.md', 99);
    expect(chapterPathsInReadingOrder(ergebnis.tree)[3]).toBe('Teil 1/Das Schiff.md');
  });

  it('lehnt doppelte Kapitel, unbekannte Eltern und unzulässige Pfade ab', () => {
    expect(insertChapter(baum(), 'Teil 1/DER HAFEN.md')).toEqual({
      ok: false,
      error: 'duplicate-path',
    });
    expect(insertChapter(baum(), 'Neu.md', 'Teil 9/Fehlt.md')).toEqual({
      ok: false,
      error: 'unknown-parent',
    });
    expect(insertChapter(baum(), '../Ausbruch.md')).toEqual({ ok: false, error: 'invalid-path' });
  });

  it('lässt den übergebenen Baum unverändert', () => {
    const eingabe = baum();
    insertChapter(eingabe, 'Nachwort.md');
    expect(eingabe).toEqual(baum());
  });
});

describe('Aushängen', () => {
  it('entfernt das Kapitel samt Unterbaum und gibt den Knoten zurück', () => {
    const ergebnis = removeChapter(baum(), 'Teil 1/Aufbruch.md');
    expect(ergebnis.ok).toBe(true);
    expect(chapterPathsInReadingOrder(ergebnis.tree)).toEqual(['Teil 2/Heimkehr.md']);
    expect(ergebnis.node).toEqual(baum()[0]);
  });

  it('entfernt auch ein Unterkapitel und lehnt Unbekanntes ab', () => {
    const ergebnis = removeChapter(baum(), 'Teil 1/Der Hafen.md');
    expect(chapterPathsInReadingOrder(ergebnis.tree)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Die Fähre.md',
      'Teil 2/Heimkehr.md',
    ]);
    expect(removeChapter(baum(), 'Teil 9/Fehlt.md')).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
    expect(removeChapter(baum(), '')).toEqual({ ok: false, error: 'invalid-path' });
  });
});

describe('Verschieben innerhalb der Ebene', () => {
  it('verschiebt hoch und runter, ohne die Ebene zu wechseln', () => {
    const runter = moveChapterWithinLevel(baum(), 'Teil 1/Der Hafen.md', 1);
    expect(runter).toMatchObject({ ok: true, moved: true });
    expect(chapterPathsInReadingOrder(runter.tree)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Die Fähre.md',
      'Teil 1/Der Hafen.md',
      'Teil 2/Heimkehr.md',
    ]);

    const hoch = moveChapterWithinLevel(baum(), 'Teil 2/Heimkehr.md', -1);
    expect(chapterPathsInReadingOrder(hoch.tree)).toEqual([
      'Teil 2/Heimkehr.md',
      'Teil 1/Aufbruch.md',
      'Teil 1/Der Hafen.md',
      'Teil 1/Die Fähre.md',
    ]);
  });

  it('bleibt am Rand der Ebene ohne Änderung und meldet moved false', () => {
    const oben = moveChapterWithinLevel(baum(), 'Teil 1/Der Hafen.md', -1);
    expect(oben).toMatchObject({ ok: true, moved: false });
    expect(oben.tree).toEqual(baum());
    expect(moveChapterWithinLevel(baum(), 'Teil 2/Heimkehr.md', 1).moved).toBe(false);
    expect(moveChapterWithinLevel(baum(), 'Teil 2/Heimkehr.md', 0).moved).toBe(false);
  });

  it('lehnt unbekannte Kapitel ab', () => {
    expect(moveChapterWithinLevel(baum(), 'Teil 9/Fehlt.md', 1)).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
  });
});

describe('Ebene wechseln', () => {
  it('rückt ein Kapitel unter seinen Vorgänger ein, samt Unterbaum', () => {
    const mitUnterbaum = insertChapter(baum(), 'Teil 2/Der Weg.md', 'Teil 2/Heimkehr.md').tree;
    const ergebnis = indentChapter(mitUnterbaum, 'Teil 2/Heimkehr.md');
    expect(ergebnis.ok).toBe(true);
    expect(flattenChapters(ergebnis.tree).map((e) => [e.path, e.depth])).toEqual([
      ['Teil 1/Aufbruch.md', 0],
      ['Teil 1/Der Hafen.md', 1],
      ['Teil 1/Die Fähre.md', 1],
      ['Teil 2/Heimkehr.md', 1],
      ['Teil 2/Der Weg.md', 2],
    ]);
    expect(indentChapter(baum(), 'Teil 1/Aufbruch.md')).toEqual({
      ok: false,
      error: 'no-previous-sibling',
    });
    expect(indentChapter(baum(), 'Teil 1/Der Hafen.md')).toEqual({
      ok: false,
      error: 'no-previous-sibling',
    });
  });

  it('rückt ein Kapitel hinter sein Eltern-Kapitel aus', () => {
    const ergebnis = outdentChapter(baum(), 'Teil 1/Der Hafen.md');
    expect(ergebnis.ok).toBe(true);
    expect(flattenChapters(ergebnis.tree).map((e) => [e.path, e.depth])).toEqual([
      ['Teil 1/Aufbruch.md', 0],
      ['Teil 1/Die Fähre.md', 1],
      ['Teil 1/Der Hafen.md', 0],
      ['Teil 2/Heimkehr.md', 0],
    ]);
    expect(outdentChapter(baum(), 'Teil 2/Heimkehr.md')).toEqual({ ok: false, error: 'at-root' });
  });

  it('hängt ein Kapitel samt Unterbaum an eine beliebige Stelle um', () => {
    const ergebnis = moveChapter(baum(), 'Teil 1/Aufbruch.md', 'Teil 2/Heimkehr.md', 0);
    expect(ergebnis.ok).toBe(true);
    expect(flattenChapters(ergebnis.tree).map((e) => [e.path, e.depth, e.parentPath])).toEqual([
      ['Teil 2/Heimkehr.md', 0, null],
      ['Teil 1/Aufbruch.md', 1, 'Teil 2/Heimkehr.md'],
      ['Teil 1/Der Hafen.md', 2, 'Teil 1/Aufbruch.md'],
      ['Teil 1/Die Fähre.md', 2, 'Teil 1/Aufbruch.md'],
    ]);
  });

  it('zählt den Index in der Ziel-Liste nach dem Aushängen', () => {
    const ergebnis = moveChapter(baum(), 'Teil 1/Der Hafen.md', 'Teil 1/Aufbruch.md', 1);
    expect(chapterPathsInReadingOrder(ergebnis.tree)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Die Fähre.md',
      'Teil 1/Der Hafen.md',
      'Teil 2/Heimkehr.md',
    ]);
  });

  it('hebt ein Unterkapitel auf die oberste Ebene', () => {
    const ergebnis = moveChapter(baum(), 'Teil 1/Die Fähre.md', null, 0);
    expect(chapterPathsInReadingOrder(ergebnis.tree)).toEqual([
      'Teil 1/Die Fähre.md',
      'Teil 1/Aufbruch.md',
      'Teil 1/Der Hafen.md',
      'Teil 2/Heimkehr.md',
    ]);
  });

  it('lehnt das Umhängen in den eigenen Unterbaum und unbekannte Ziele ab', () => {
    expect(moveChapter(baum(), 'Teil 1/Aufbruch.md', 'Teil 1/Der Hafen.md')).toEqual({
      ok: false,
      error: 'cycle',
    });
    expect(moveChapter(baum(), 'Teil 1/Aufbruch.md', 'Teil 1/Aufbruch.md')).toEqual({
      ok: false,
      error: 'cycle',
    });
    expect(moveChapter(baum(), 'Teil 1/Aufbruch.md', 'Teil 9/Fehlt.md')).toEqual({
      ok: false,
      error: 'unknown-parent',
    });
    expect(moveChapter(baum(), 'Teil 9/Fehlt.md', null)).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
  });
});

describe('Lese-Ordnung', () => {
  it('führt das Kapitel vor seine Unterkapitel und danach zu den Geschwistern', () => {
    expect(flattenChapters(baum())).toEqual([
      { path: 'Teil 1/Aufbruch.md', depth: 0, parentPath: null },
      { path: 'Teil 1/Der Hafen.md', depth: 1, parentPath: 'Teil 1/Aufbruch.md' },
      { path: 'Teil 1/Die Fähre.md', depth: 1, parentPath: 'Teil 1/Aufbruch.md' },
      { path: 'Teil 2/Heimkehr.md', depth: 0, parentPath: null },
    ]);
  });

  it('liefert das nächste und das vorherige Kapitel über Kapitel-Grenzen hinweg', () => {
    expect(nextChapterPath(baum(), 'Teil 1/Aufbruch.md')).toBe('Teil 1/Der Hafen.md');
    expect(nextChapterPath(baum(), 'Teil 1/Die Fähre.md')).toBe('Teil 2/Heimkehr.md');
    expect(previousChapterPath(baum(), 'Teil 2/Heimkehr.md')).toBe('Teil 1/Die Fähre.md');
    expect(previousChapterPath(baum(), 'Teil 1/Der Hafen.md')).toBe('Teil 1/Aufbruch.md');
    expect(nextChapterPath(baum(), 'teil 1\\der hafen.md')).toBe('Teil 1/Die Fähre.md');
  });

  it('liefert an den Enden und bei unbekanntem Kapitel null', () => {
    expect(nextChapterPath(baum(), 'Teil 2/Heimkehr.md')).toBeNull();
    expect(previousChapterPath(baum(), 'Teil 1/Aufbruch.md')).toBeNull();
    expect(nextChapterPath(baum(), 'Teil 9/Fehlt.md')).toBeNull();
    expect(previousChapterPath(baum(), '../Ausbruch.md')).toBeNull();
    expect(nextChapterPath([], 'Kapitel.md')).toBeNull();
  });
});

describe('Abgleich mit dem Datei-Bestand', () => {
  it('trennt nicht eingehängte von fehlenden Kapiteln', () => {
    const bestand = [
      BUCH,
      'Teil 1/Aufbruch.md',
      'Teil 1/Der Hafen.md',
      'Teil 3/Nachwort.md',
      'Anhang.md',
    ];
    expect(diffChapterFiles(baum(), bestand, BUCH)).toEqual({
      unlinked: ['Teil 3/Nachwort.md', 'Anhang.md'],
      missing: ['Teil 1/Die Fähre.md', 'Teil 2/Heimkehr.md'],
    });
  });

  it('zählt die Buch-Datei nie als Kapitel, auch nicht als fehlendes', () => {
    const nurBuch = diffChapterFiles([], [BUCH], BUCH);
    expect(nurBuch).toEqual({ unlinked: [], missing: [] });
    const eingehaengt = diffChapterFiles([{ path: BUCH, children: [] }], [BUCH], BUCH);
    expect(eingehaengt).toEqual({ unlinked: [], missing: [] });
  });

  it('vergleicht ohne Rücksicht auf Schreibweise und Pfad-Trenner', () => {
    const bestand = ['Teil 1\\AUFBRUCH.md', 'Teil 1/Der Hafen.md', 'Teil 1/Die Fähre.md'];
    expect(diffChapterFiles(baum(), bestand, BUCH)).toEqual({
      unlinked: [],
      missing: ['Teil 2/Heimkehr.md'],
    });
  });

  it('übergeht unzulässige und doppelt genannte Einträge des Bestands', () => {
    const bestand = ['../Fremd.md', '', 'Anhang.md', 'Anhang.md', null];
    expect(diffChapterFiles([], bestand, BUCH).unlinked).toEqual(['Anhang.md']);
    expect(diffChapterFiles(baum(), null, BUCH).missing).toEqual(
      chapterPathsInReadingOrder(baum()),
    );
  });
});

describe('Pfad-Nachführung', () => {
  it('behält Position und Unterbaum beim Umbenennen', () => {
    const ergebnis = renameChapterPath(baum(), 'Teil 1/Aufbruch.md', 'Teil 1/Der Aufbruch.md');
    expect(ergebnis.ok).toBe(true);
    expect(flattenChapters(ergebnis.tree).map((e) => [e.path, e.depth])).toEqual([
      ['Teil 1/Der Aufbruch.md', 0],
      ['Teil 1/Der Hafen.md', 1],
      ['Teil 1/Die Fähre.md', 1],
      ['Teil 2/Heimkehr.md', 0],
    ]);
  });

  it('führt auch ein physisches Verschieben in einen anderen Ordner nach', () => {
    const ergebnis = renameChapterPath(baum(), 'Teil 1/Die Fähre.md', 'Anhang\\Die Fähre.md');
    expect(chapterPathsInReadingOrder(ergebnis.tree)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Der Hafen.md',
      'Anhang/Die Fähre.md',
      'Teil 2/Heimkehr.md',
    ]);
  });

  it('lässt die reine Änderung der Schreibweise zu', () => {
    const ergebnis = renameChapterPath(baum(), 'Teil 1/Der Hafen.md', 'Teil 1/Der HAFEN.md');
    expect(ergebnis.ok).toBe(true);
    expect(chapterPathsInReadingOrder(ergebnis.tree)[1]).toBe('Teil 1/Der HAFEN.md');
  });

  it('lehnt einen anderswo hängenden Ziel-Pfad und Unbekanntes ab', () => {
    expect(renameChapterPath(baum(), 'Teil 1/Der Hafen.md', 'Teil 2/Heimkehr.md')).toEqual({
      ok: false,
      error: 'duplicate-path',
    });
    expect(renameChapterPath(baum(), 'Teil 9/Fehlt.md', 'Neu.md')).toEqual({
      ok: false,
      error: 'unknown-chapter',
    });
    expect(renameChapterPath(baum(), 'Teil 1/Der Hafen.md', '../Ausbruch.md')).toEqual({
      ok: false,
      error: 'invalid-path',
    });
  });
});
