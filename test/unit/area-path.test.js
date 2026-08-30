// 4T-0322 (Epic 3E-0058): Unit-Tests für die Bereichs-Pfad-Logik
// (src/main/area/area-path.js). Die Innerhalb-Prüfung ist die eine Grenze aller
// Bereichs-Pfade; Windows-Fälle (Groß/Klein, gemischte Trenner, `..`,
// Präfix-Nachbarn) sind hier abgesichert.
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  isSamePath,
  isInsideArea,
  areaFromRootPath,
  updatedRecentAreas,
  updatedRecentPaths,
  withoutRecentPath,
  sortedAreaListing,
  sanitizeNewFileName,
} from '../../src/main/area/area-path.js';
import { createRequire } from 'node:module';

// 4T-1203: Die Plattform-Eigenschaft wird ueber DIESELBE Modul-Instanz
// gesetzt, die area-path.js benutzt. Vitest fuehrt fuer 'import' und
// 'require' getrennte Instanzen (Muster area-search.test.js).
const { setPlatformForTests } = createRequire(import.meta.url)('../../src/shared/platform.js');

// 4T-1250 (Epic 3E-0124): Wirts-gerechter Pfad aus der gewachsenen
// Windows-Schreibweise. Die Faelle dieser Datei pruefen Fach-Logik und NICHT
// die Windows-Pfad-Syntax; mit fest verdrahteten Laufwerksbuchstaben liefen
// sie trotzdem nur unter Windows, weil path.resolve 'C:\...' auf anderen
// Plattformen als RELATIVEN Pfad liest und das Arbeitsverzeichnis davorsetzt.
//
// Der Laufwerksbuchstabe wird zum ERSTEN Pfad-Segment und nicht etwa
// weggelassen: Sonst faenden 'C:\Daten' und 'D:\Daten' auf der Zielplattform
// zusammen, und gerade die Faelle, die verschiedene Laufwerke auseinander
// halten sollen, schluegen ins Gegenteil um (belegt am 2026-08-28).
// Klein geschrieben, damit zwei Schreibweisen desselben Laufwerks dasselbe
// Segment ergeben und die Schreibweisen-Faelle weiter greifen.
//
// Unter Windows ist der Umrechner die Identitaet, die Haupt-Plattform prueft
// also unveraendert weiter.
const P = (w) =>
  process.platform === 'win32'
    ? w
    : `/${w[0].toLowerCase()}/${w.slice(3)}`.split('\\').join('/').replace(/\/+/g, '/');

const ROOT = P('C:\\Daten\\Notizen');

// 4T-1250 (Epic 3E-0124): Die Faelle ausserhalb der Paar-Tests pruefen die
// case-INSENSITIVE Pfad-Identitaet — dass abweichende Schreibung und
// gemischte Trenner denselben Ort meinen. Das ist eine Eigenschaft von
// Windows und macOS, nicht von Linux, und sie hing bisher stillschweigend an
// der realen Plattform des Rechners. Ausdruecklich gesetzt laufen sie ueberall
// und pruefen weiterhin genau das, was sie meinen (Vorbild: die Pinnung in
// test/unit/renderer/area.test.js). Die Paar-Tests unten setzen ihre eigene
// Plattform und gewinnen ueber diese Vorbelegung.
beforeEach(() => setPlatformForTests('win32'));

afterEach(() => {
  setPlatformForTests(undefined);
});

// 4T-1203 (Epic 3E-0121): Paar-Tests beider Dateisystem-Verhaltensweisen —
// dieselbe Grenz-Entscheidung, einmal case-insensitiv (Windows/macOS), einmal
// case-sensitiv (Linux). Die uebrigen Faelle dieser Datei laufen auf der
// realen Plattform (Windows) und belegen das unveraenderte Bestands-Verhalten.
describe('Bereichs-Grenze je Dateisystem-Verhalten (4T-1203)', () => {
  it('linux: abweichende Schreibung liegt AUSSERHALB, exakte innerhalb', () => {
    setPlatformForTests('linux');
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\Sub\\a.md'))).toBe(true);
    expect(isInsideArea(ROOT, P('c:\\daten\\NOTIZEN\\a.md'))).toBe(false);
    expect(isSamePath(ROOT, P('c:/daten/notizen/'))).toBe(false);
    expect(isSamePath(ROOT, P('C:/Daten/Notizen/'))).toBe(true);
  });

  it('darwin: abweichende Schreibung liegt innerhalb (wie Windows)', () => {
    setPlatformForTests('darwin');
    expect(isInsideArea(ROOT, P('c:\\daten\\NOTIZEN\\a.md'))).toBe(true);
    expect(isSamePath(ROOT, P('c:/daten/notizen/'))).toBe(true);
  });
});

describe('isInsideArea (4T-0322)', () => {
  it('Dateien im Bereich und in Unterordnern liegen innerhalb', () => {
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\a.md'))).toBe(true);
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\Sub\\Tiefer\\b.md'))).toBe(true);
  });

  it('der Wurzelordner selbst zählt als innerhalb', () => {
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen'))).toBe(true);
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\'))).toBe(true);
  });

  it('Groß-/Kleinschreibung und gemischte Trenner sind egal', () => {
    expect(isInsideArea(ROOT, P('c:\\daten\\NOTIZEN\\a.md'))).toBe(true);
    expect(isInsideArea(ROOT, P('C:/Daten/Notizen/Sub/a.md'))).toBe(true);
    expect(isInsideArea(P('C:/daten/notizen'), P('C:\\Daten\\Notizen\\a.md'))).toBe(true);
  });

  it('Präfix-Nachbarn matchen nicht', () => {
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen2\\a.md'))).toBe(false);
    expect(isInsideArea(ROOT, P('C:\\Daten\\NotizenArchiv\\a.md'))).toBe(false);
  });

  it('..-Ausbrüche werden aufgelöst und abgewiesen', () => {
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\..\\Geheim\\a.md'))).toBe(false);
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\Sub\\..\\..\\a.md'))).toBe(false);
    // Aufgelöst wieder innerhalb: erlaubt.
    expect(isInsideArea(ROOT, P('C:\\Daten\\Notizen\\Sub\\..\\a.md'))).toBe(true);
  });

  it('außerhalb, andere Laufwerke und Nicht-Strings liegen außerhalb', () => {
    expect(isInsideArea(ROOT, P('D:\\Daten\\Notizen\\a.md'))).toBe(false);
    expect(isInsideArea(ROOT, P('C:\\Woanders\\a.md'))).toBe(false);
    expect(isInsideArea(ROOT, '')).toBe(false);
    expect(isInsideArea(ROOT, null)).toBe(false);
    expect(isInsideArea(null, P('C:\\Daten\\Notizen\\a.md'))).toBe(false);
  });
});

describe('isSamePath (4T-0322)', () => {
  it('erkennt denselben Ordner über Schreibweisen hinweg', () => {
    expect(isSamePath(ROOT, P('c:/daten/notizen/'))).toBe(true);
    expect(isSamePath(ROOT, P('C:\\Daten\\Notizen\\Sub'))).toBe(false);
    expect(isSamePath(null, null)).toBe(false);
  });
});

describe('updatedRecentAreas (4T-0325)', () => {
  it('setzt den jüngsten Bereich nach vorn und dedupliziert über Pfad-Gleichheit', () => {
    const list = [P('C:\\A'), P('C:\\B')];
    expect(updatedRecentAreas(list, P('C:\\C'))).toEqual([P('C:\\C'), P('C:\\A'), P('C:\\B')]);
    // Erneutes Öffnen (andere Schreibweise) rückt nach vorn statt zu duplizieren.
    expect(updatedRecentAreas([P('C:\\A'), P('C:\\B')], P('c:/b/'))).toEqual([
      P('c:\\b'),
      P('C:\\A'),
    ]);
  });

  it('kappt auf die Maximal-Länge und toleriert kaputte Eingaben', () => {
    const list = Array.from({ length: 10 }, (_, i) => `C:\\Ordner${i}`);
    const result = updatedRecentAreas(list, P('C:\\Neu'));
    expect(result).toHaveLength(10);
    expect(result[0]).toBe(P('C:\\Neu'));
    expect(result).not.toContain(P('C:\\Ordner9'));
    expect(updatedRecentAreas(null, P('C:\\Neu'))).toEqual([P('C:\\Neu')]);
    expect(updatedRecentAreas([42, null, P('C:\\A')], '')).toEqual([P('C:\\A')]);
  });
});

// 4T-0888 (Epic 3E-0168): Derselbe Listen-Aufbau trägt seit dem
// Konsistenz-Auftrag auch die Listen „Zuletzt geöffnete Bücher" und „Zuletzt
// geöffnete Bücherregale" (Store-Schlüssel 'recentBooks'/'recentShelves').
describe('updatedRecentPaths (4T-0888)', () => {
  it('setzt den jüngsten Ordner nach vorn und dedupliziert über Pfad-Gleichheit', () => {
    // 4T-0888
    expect(updatedRecentPaths([P('C:\\Buch1'), P('C:\\Buch2')], P('C:\\Buch3'))).toEqual([
      P('C:\\Buch3'),
      P('C:\\Buch1'),
      P('C:\\Buch2'),
    ]);
    // Erneutes Öffnen desselben Buches (andere Schreibweise, Trenner, Schluss-
    // Trenner) rückt nach vorn statt eine Dublette anzulegen.
    expect(updatedRecentPaths([P('C:\\Buch1'), P('C:\\Buch2')], P('c:/buch2/'))).toEqual([
      P('c:\\buch2'),
      P('C:\\Buch1'),
    ]);
  });

  it('kappt auf die Maximal-Länge und toleriert kaputte Eingaben', () => {
    // 4T-0888
    const list = Array.from({ length: 10 }, (_, i) => P(`C:\\Regal${i}`));
    const result = updatedRecentPaths(list, P('C:\\Neu'));
    expect(result).toHaveLength(10);
    expect(result[0]).toBe(P('C:\\Neu'));
    expect(result).not.toContain(P('C:\\Regal9'));
    // Eigene Kappungs-Grenze und defekte Eingaben.
    expect(updatedRecentPaths(list, P('C:\\Neu'), 3)).toEqual([
      P('C:\\Neu'),
      P('C:\\Regal0'),
      P('C:\\Regal1'),
    ]);
    expect(updatedRecentPaths(null, P('C:\\Neu'))).toEqual([P('C:\\Neu')]);
    expect(updatedRecentPaths([42, null, P('C:\\A')], '')).toEqual([P('C:\\A')]);
  });
});

describe('withoutRecentPath (4T-0888)', () => {
  it('trägt genau den angegebenen Eintrag aus (Ziel existiert nicht mehr)', () => {
    // 4T-0888
    const list = [P('C:\\Buch1'), P('C:\\Buch2'), P('C:\\Buch3')];
    expect(withoutRecentPath(list, P('C:\\Buch2'))).toEqual([P('C:\\Buch1'), P('C:\\Buch3')]);
    // Pfad-Gleichheit statt String-Gleichheit (Schreibweise, Trenner).
    expect(withoutRecentPath(list, P('c:/BUCH1/'))).toEqual([P('C:\\Buch2'), P('C:\\Buch3')]);
    // Unbekanntes Ziel und defekte Eingaben lassen die Liste unverändert.
    expect(withoutRecentPath(list, P('C:\\Fremd'))).toEqual(list);
    expect(withoutRecentPath(list, '')).toEqual(list);
    expect(withoutRecentPath(null, P('C:\\Buch1'))).toEqual([]);
    expect(withoutRecentPath([42, null, P('C:\\A')], P('C:\\B'))).toEqual([P('C:\\A')]);
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
    expect(areaFromRootPath(P('C:\\Daten\\Notizen\\'))).toEqual({
      rootPath: P('C:\\Daten\\Notizen'),
      name: 'Notizen',
    });
    expect(areaFromRootPath('')).toBeNull();
    expect(areaFromRootPath(null)).toBeNull();
  });
});
