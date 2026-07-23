// 4T-0322 (Epic 3E-0058): Unit-Tests für die Bereichs-Pfad-Logik
// (src/main/area-path.js). Die Innerhalb-Prüfung ist die eine Grenze aller
// Bereichs-Pfade; Windows-Fälle (Groß/Klein, gemischte Trenner, `..`,
// Präfix-Nachbarn) sind hier abgesichert.
import { describe, it, expect } from 'vitest';
import {
  isSamePath,
  isInsideArea,
  areaFromRootPath,
  updatedRecentAreas,
  sortedAreaListing,
  sanitizeNewFileName,
} from '../../src/main/area-path.js';

const ROOT = 'C:\\Daten\\Notizen';

describe('isInsideArea (4T-0322)', () => {
  it('Dateien im Bereich und in Unterordnern liegen innerhalb', () => {
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen\\a.md')).toBe(true);
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen\\Sub\\Tiefer\\b.md')).toBe(true);
  });

  it('der Wurzelordner selbst zählt als innerhalb', () => {
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen')).toBe(true);
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen\\')).toBe(true);
  });

  it('Groß-/Kleinschreibung und gemischte Trenner sind egal', () => {
    expect(isInsideArea(ROOT, 'c:\\daten\\NOTIZEN\\a.md')).toBe(true);
    expect(isInsideArea(ROOT, 'C:/Daten/Notizen/Sub/a.md')).toBe(true);
    expect(isInsideArea('C:/daten/notizen', 'C:\\Daten\\Notizen\\a.md')).toBe(true);
  });

  it('Präfix-Nachbarn matchen nicht', () => {
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen2\\a.md')).toBe(false);
    expect(isInsideArea(ROOT, 'C:\\Daten\\NotizenArchiv\\a.md')).toBe(false);
  });

  it('..-Ausbrüche werden aufgelöst und abgewiesen', () => {
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen\\..\\Geheim\\a.md')).toBe(false);
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen\\Sub\\..\\..\\a.md')).toBe(false);
    // Aufgelöst wieder innerhalb: erlaubt.
    expect(isInsideArea(ROOT, 'C:\\Daten\\Notizen\\Sub\\..\\a.md')).toBe(true);
  });

  it('außerhalb, andere Laufwerke und Nicht-Strings liegen außerhalb', () => {
    expect(isInsideArea(ROOT, 'D:\\Daten\\Notizen\\a.md')).toBe(false);
    expect(isInsideArea(ROOT, 'C:\\Woanders\\a.md')).toBe(false);
    expect(isInsideArea(ROOT, '')).toBe(false);
    expect(isInsideArea(ROOT, null)).toBe(false);
    expect(isInsideArea(null, 'C:\\Daten\\Notizen\\a.md')).toBe(false);
  });
});

describe('isSamePath (4T-0322)', () => {
  it('erkennt denselben Ordner über Schreibweisen hinweg', () => {
    expect(isSamePath(ROOT, 'c:/daten/notizen/')).toBe(true);
    expect(isSamePath(ROOT, 'C:\\Daten\\Notizen\\Sub')).toBe(false);
    expect(isSamePath(null, null)).toBe(false);
  });
});

describe('updatedRecentAreas (4T-0325)', () => {
  it('setzt den jüngsten Bereich nach vorn und dedupliziert über Pfad-Gleichheit', () => {
    const list = ['C:\\A', 'C:\\B'];
    expect(updatedRecentAreas(list, 'C:\\C')).toEqual(['C:\\C', 'C:\\A', 'C:\\B']);
    // Erneutes Öffnen (andere Schreibweise) rückt nach vorn statt zu duplizieren.
    expect(updatedRecentAreas(['C:\\A', 'C:\\B'], 'c:/b/')).toEqual(['c:\\b', 'C:\\A']);
  });

  it('kappt auf die Maximal-Länge und toleriert kaputte Eingaben', () => {
    const list = Array.from({ length: 10 }, (_, i) => `C:\\Ordner${i}`);
    const result = updatedRecentAreas(list, 'C:\\Neu');
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('C:\\Neu');
    expect(result).not.toContain('C:\\Ordner9');
    expect(updatedRecentAreas(null, 'C:\\Neu')).toEqual(['C:\\Neu']);
    expect(updatedRecentAreas([42, null, 'C:\\A'], '')).toEqual(['C:\\A']);
  });
});

describe('sortedAreaListing (4T-0327)', () => {
  const isMd = (n) => n.toLowerCase().endsWith('.md');

  it('trennt Ordner und Markdown-Dateien, sortiert locale-bewusst und numerisch', () => {
    const entries = [
      { name: 'zettel.md', isDir: false },
      { name: 'Bild.png', isDir: false },
      { name: 'Ordner10', isDir: true },
      { name: 'ordner2', isDir: true },
      { name: 'Ärger.md', isDir: false },
      { name: 'alpha.md', isDir: false },
    ];
    expect(sortedAreaListing(entries, isMd)).toEqual({
      dirs: ['ordner2', 'Ordner10'],
      files: ['alpha.md', 'Ärger.md', 'zettel.md'],
    });
  });

  it('toleriert kaputte Einträge und leere Eingaben', () => {
    expect(sortedAreaListing(null, isMd)).toEqual({ dirs: [], files: [] });
    expect(sortedAreaListing([null, { name: '' }, { isDir: true }], isMd)).toEqual({
      dirs: [],
      files: [],
    });
  });
});

describe('sanitizeNewFileName (4T-0328)', () => {
  it('ergänzt die Markdown-Endung und trimmt', () => {
    expect(sanitizeNewFileName('Notiz')).toBe('Notiz.md');
    expect(sanitizeNewFileName('  Plan.md  ')).toBe('Plan.md');
    expect(sanitizeNewFileName('lesen.markdown')).toBe('lesen.markdown');
    expect(sanitizeNewFileName('Über Ärger')).toBe('Über Ärger.md');
  });

  it('weist Pfad-Segmente, verbotene Zeichen und Leeres ab', () => {
    expect(sanitizeNewFileName('a/b')).toBeNull();
    expect(sanitizeNewFileName('a\\b')).toBeNull();
    expect(sanitizeNewFileName('..')).toBeNull();
    expect(sanitizeNewFileName('a:b')).toBeNull();
    expect(sanitizeNewFileName('a?b')).toBeNull();
    expect(sanitizeNewFileName('')).toBeNull();
    expect(sanitizeNewFileName('   ')).toBeNull();
    expect(sanitizeNewFileName(null)).toBeNull();
  });
});

describe('areaFromRootPath (4T-0322)', () => {
  it('leitet den Bereichsnamen aus dem Ordnernamen ab', () => {
    expect(areaFromRootPath('C:\\Daten\\Notizen\\')).toEqual({
      rootPath: 'C:\\Daten\\Notizen',
      name: 'Notizen',
    });
    expect(areaFromRootPath('')).toBeNull();
    expect(areaFromRootPath(null)).toBeNull();
  });
});
