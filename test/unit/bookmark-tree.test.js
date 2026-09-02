// 4T-000611 (Epic 3E-000115): Datenmodell der Bereichs-Lesezeichen
// (src/shared/bookmark-tree.js) — wurzel-relative Pfad-Normalisierung,
// Relativ<->Absolut-Umrechnung, Roh-Pfad-Sammlung und tolerante
// Baum-Sanitisierung. Reine Funktionen, direkter Import (Muster
// sidebar-variants.test.js / mdd-store.test.js).
import { describe, expect, it } from 'vitest';
import {
  normalizeRelPath,
  isSafeRelPath,
  toAbsolute,
  toRootRelative,
  collectBookmarkFilePaths,
  normalizeBookmarksTree,
  mapBookmarkFilePaths,
} from '../../src/shared/bookmark-tree.js';

describe('normalizeRelPath', () => {
  it('bringt gültige Ziele auf Vorwärts-Schrägstriche und räumt Redundanz ab', () => {
    expect(normalizeRelPath('a/b.md')).toBe('a/b.md');
    expect(normalizeRelPath('a\\b.md')).toBe('a/b.md');
    expect(normalizeRelPath('a//b.md')).toBe('a/b.md');
    expect(normalizeRelPath('./a/b.md')).toBe('a/b.md');
    expect(normalizeRelPath('a/./b.md')).toBe('a/b.md');
    expect(normalizeRelPath('a/b/')).toBe('a/b');
  });

  it('hebt innenliegende ..-Segmente auf, lehnt Ausbrüche über die Wurzel ab', () => {
    expect(normalizeRelPath('a/../b.md')).toBe('b.md');
    expect(normalizeRelPath('a/b/../c.md')).toBe('a/c.md');
    expect(normalizeRelPath('..')).toBeNull();
    expect(normalizeRelPath('../x')).toBeNull();
    expect(normalizeRelPath('a/../../b')).toBeNull();
  });

  it('lehnt absolute Pfade ab (führender Slash, Laufwerk, UNC)', () => {
    expect(normalizeRelPath('/a/b')).toBeNull();
    expect(normalizeRelPath('C:/a')).toBeNull();
    expect(normalizeRelPath('c:\\a\\b')).toBeNull();
    expect(normalizeRelPath('//server/share')).toBeNull();
  });

  it('lehnt Leeres und Nicht-Strings ab', () => {
    expect(normalizeRelPath('')).toBeNull();
    expect(normalizeRelPath('   ')).toBeNull();
    expect(normalizeRelPath('.')).toBeNull();
    expect(normalizeRelPath(null)).toBeNull();
    expect(normalizeRelPath(42)).toBeNull();
    expect(normalizeRelPath(undefined)).toBeNull();
  });

  it('erhält Umlaute und Groß-/Kleinschreibung im Pfad', () => {
    expect(normalizeRelPath('Ordner/Über mich.md')).toBe('Ordner/Über mich.md');
    expect(normalizeRelPath('A\\ß/Größe.md')).toBe('A/ß/Größe.md');
  });
});

describe('isSafeRelPath', () => {
  it('spiegelt normalizeRelPath als Prädikat', () => {
    expect(isSafeRelPath('a/b.md')).toBe(true);
    expect(isSafeRelPath('a/../b.md')).toBe(true);
    expect(isSafeRelPath('../x')).toBe(false);
    expect(isSafeRelPath('/x')).toBe(false);
    expect(isSafeRelPath('C:/x')).toBe(false);
    expect(isSafeRelPath('')).toBe(false);
  });
});

describe('toAbsolute', () => {
  it('fügt Wurzel und wurzel-relatives Ziel zusammen (Vorwärts-Schrägstriche)', () => {
    expect(toAbsolute('C:\\Notizen', 'a/b.md')).toBe('C:/Notizen/a/b.md');
    expect(toAbsolute('C:/Notizen/', 'a.md')).toBe('C:/Notizen/a.md');
    expect(toAbsolute('C:\\Notizen', 'sub\\c.md')).toBe('C:/Notizen/sub/c.md');
  });

  it('liefert null bei ungültigem Ziel oder fehlender Wurzel', () => {
    expect(toAbsolute('C:/Notizen', '../x')).toBeNull();
    expect(toAbsolute('C:/Notizen', '/x')).toBeNull();
    expect(toAbsolute('', 'a.md')).toBeNull();
    expect(toAbsolute(null, 'a.md')).toBeNull();
  });
});

describe('toRootRelative', () => {
  it('rechnet ein absolutes Ziel innerhalb der Wurzel auf die relative Form um', () => {
    expect(toRootRelative('C:\\Notizen', 'C:\\Notizen\\a\\b.md')).toBe('a/b.md');
    expect(toRootRelative('C:/Notizen', 'C:/Notizen/a/b.md')).toBe('a/b.md');
  });

  it('vergleicht den Wurzel-Präfix case-insensitiv, behält aber die Ziel-Schreibweise', () => {
    expect(toRootRelative('C:\\Notizen', 'c:\\notizen\\Sub\\Datei.md')).toBe('Sub/Datei.md');
  });

  it('erhält Umlaute im relativen Ziel', () => {
    expect(toRootRelative('C:\\Bereich', 'C:\\Bereich\\Über\\Ü.md')).toBe('Über/Ü.md');
  });

  it('lehnt Ziele außerhalb der Wurzel, Präfix-Nachbarn und die Wurzel selbst ab', () => {
    expect(toRootRelative('C:\\Notizen', 'C:\\Andere\\x.md')).toBeNull();
    expect(toRootRelative('C:\\Notizen', 'C:\\Notizen2\\x.md')).toBeNull();
    expect(toRootRelative('C:\\Notizen', 'C:\\Notizen')).toBeNull();
    expect(toRootRelative('', 'C:\\Notizen\\x.md')).toBeNull();
    expect(toRootRelative('C:\\Notizen', 42)).toBeNull();
  });
});

describe('collectBookmarkFilePaths', () => {
  it('sammelt die ROH-filePath-Strings aller Datei-Knoten in Baum-Reihenfolge', () => {
    const tree = [
      { type: 'file', id: 'a', filePath: 'eins.md' },
      {
        type: 'folder',
        id: 'f',
        name: 'Ordner',
        children: [
          { type: 'file', id: 'b', filePath: 'sub/zwei.md' },
          { type: 'file', id: 'c', filePath: '../aussen.md' },
        ],
      },
    ];
    expect(collectBookmarkFilePaths(tree)).toEqual(['eins.md', 'sub/zwei.md', '../aussen.md']);
  });

  it('ist tolerant: Nicht-String-Pfade und defekte Knoten entfallen', () => {
    const tree = [
      { type: 'file', id: 'a', filePath: 42 },
      null,
      { type: 'file', id: 'b', filePath: 'gut.md' },
      'kaputt',
    ];
    expect(collectBookmarkFilePaths(tree)).toEqual(['gut.md']);
    for (const raw of [null, undefined, 'x', {}, 42]) {
      expect(collectBookmarkFilePaths(raw)).toEqual([]);
    }
  });
});

describe('normalizeBookmarksTree', () => {
  it('erhält gültige Datei- und Ordner-Knoten und normalisiert die Datei-Ziele', () => {
    const raw = [
      {
        type: 'file',
        id: 'a',
        filePath: 'sub\\eins.md',
        displayName: 'Eins',
        addedAt: '2026-07-15T10:00:00Z',
      },
      {
        type: 'folder',
        id: 'f',
        name: 'Ordner',
        expanded: false,
        children: [{ type: 'file', id: 'b', filePath: 'a/../zwei.md' }],
      },
    ];
    expect(normalizeBookmarksTree(raw)).toEqual([
      {
        type: 'file',
        id: 'a',
        filePath: 'sub/eins.md',
        displayName: 'Eins',
        addedAt: '2026-07-15T10:00:00Z',
      },
      {
        type: 'folder',
        id: 'f',
        name: 'Ordner',
        expanded: false,
        children: [{ type: 'file', id: 'b', filePath: 'zwei.md' }],
      },
    ]);
  });

  it('setzt expanded standardmäßig auf true und name auf leer, wenn nicht gesetzt', () => {
    expect(normalizeBookmarksTree([{ type: 'folder', id: 'f' }])).toEqual([
      { type: 'folder', id: 'f', name: '', expanded: true, children: [] },
    ]);
  });

  it('lässt optionale Datei-Felder weg, wenn sie fehlen oder kein String sind', () => {
    expect(
      normalizeBookmarksTree([{ type: 'file', id: 'a', filePath: 'x.md', displayName: 5 }]),
    ).toEqual([{ type: 'file', id: 'a', filePath: 'x.md' }]);
  });

  it('verwirft defekte Knoten: ohne id, unbekannter Typ, unauflösbares oder ausbrechendes Ziel', () => {
    const raw = [
      { type: 'file', filePath: 'ohne-id.md' },
      { type: 'file', id: '   ', filePath: 'leere-id.md' },
      { type: 'file', id: 'a', filePath: '../aussen.md' },
      { type: 'file', id: 'b', filePath: '/absolut.md' },
      { type: 'file', id: 'c', filePath: 42 },
      { type: 'unbekannt', id: 'd' },
      null,
      { type: 'file', id: 'gut', filePath: 'behalten.md' },
    ];
    expect(normalizeBookmarksTree(raw)).toEqual([
      { type: 'file', id: 'gut', filePath: 'behalten.md' },
    ]);
  });

  it('liefert bei Nicht-Arrays eine leere Liste', () => {
    for (const raw of [null, undefined, 'x', {}, 42]) {
      expect(normalizeBookmarksTree(raw)).toEqual([]);
    }
  });
});

describe('mapBookmarkFilePaths', () => {
  const toRel = (rootAbs) => (abs) => toRootRelative(rootAbs, abs);
  const toAbs = (rootAbs) => (rel) => toAbsolute(rootAbs, rel);

  it('rechnet einen Datei-Knoten von absolut auf wurzel-relativ um und erhält die übrigen Felder', () => {
    const node = {
      type: 'file',
      id: 'a',
      filePath: 'C:\\Bereich\\sub\\eins.md',
      displayName: 'Eins',
      addedAt: '2026-07-15T10:00:00Z',
    };
    expect(mapBookmarkFilePaths(node, toRel('C:\\Bereich'))).toEqual({
      type: 'file',
      id: 'a',
      filePath: 'sub/eins.md',
      displayName: 'Eins',
      addedAt: '2026-07-15T10:00:00Z',
    });
  });

  it('bildet einen Ordner-Unterbaum rekursiv ab und erhält Struktur, Reihenfolge und Ordner-Felder', () => {
    const node = {
      type: 'folder',
      id: 'f',
      name: 'Ordner',
      expanded: false,
      children: [
        { type: 'file', id: 'a', filePath: 'C:\\Bereich\\eins.md' },
        {
          type: 'folder',
          id: 'g',
          name: 'Unter',
          expanded: true,
          children: [{ type: 'file', id: 'b', filePath: 'C:\\Bereich\\tief\\zwei.md' }],
        },
      ],
    };
    expect(mapBookmarkFilePaths(node, toRel('C:\\Bereich'))).toEqual({
      type: 'folder',
      id: 'f',
      name: 'Ordner',
      expanded: false,
      children: [
        { type: 'file', id: 'a', filePath: 'eins.md' },
        {
          type: 'folder',
          id: 'g',
          name: 'Unter',
          expanded: true,
          children: [{ type: 'file', id: 'b', filePath: 'tief/zwei.md' }],
        },
      ],
    });
  });

  it('rechnet in die Gegenrichtung (wurzel-relativ auf absolut)', () => {
    const node = { type: 'file', id: 'a', filePath: 'sub/eins.md' };
    expect(mapBookmarkFilePaths(node, toAbs('C:\\Bereich'))).toEqual({
      type: 'file',
      id: 'a',
      filePath: 'C:/Bereich/sub/eins.md',
    });
  });

  it('lehnt den GANZEN Unterbaum ab, sobald ein Datei-Ziel außerhalb der Wurzel liegt', () => {
    const node = {
      type: 'folder',
      id: 'f',
      name: 'Ordner',
      children: [
        { type: 'file', id: 'a', filePath: 'C:\\Bereich\\innen.md' },
        { type: 'file', id: 'b', filePath: 'C:\\Andere\\aussen.md' },
      ],
    };
    expect(mapBookmarkFilePaths(node, toRel('C:\\Bereich'))).toBeNull();
  });

  it('liefert null für defekte Knoten (fehlender/unbekannter Typ, Nicht-Objekt)', () => {
    expect(mapBookmarkFilePaths(null, toRel('C:\\Bereich'))).toBeNull();
    expect(mapBookmarkFilePaths({ id: 'x' }, toRel('C:\\Bereich'))).toBeNull();
    expect(mapBookmarkFilePaths({ type: 'unbekannt', id: 'x' }, toRel('C:\\Bereich'))).toBeNull();
  });

  it('behandelt einen leeren Ordner als gültig (leere Kinderliste)', () => {
    const node = { type: 'folder', id: 'f', name: 'Leer', expanded: true, children: [] };
    expect(mapBookmarkFilePaths(node, toRel('C:\\Bereich'))).toEqual({
      type: 'folder',
      id: 'f',
      name: 'Leer',
      expanded: true,
      children: [],
    });
  });
});
