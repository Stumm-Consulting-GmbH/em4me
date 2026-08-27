// 4T-1203 (Epic 3E-0121): Unit-Tests der zentralen Plattform-Eigenschaften
// (src/shared/platform.js) — die eine Quelle für die Frage, ob das
// Dateisystem die Schreibung unterscheidet.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isFilesystemCaseInsensitive,
  pathCompareKey,
  pathSeparator,
  setPlatformForTests,
} from '../../src/shared/platform.js';

afterEach(() => {
  setPlatformForTests(undefined);
});

describe('isFilesystemCaseInsensitive (4T-1203)', () => {
  it('Windows und macOS unterscheiden die Schreibung nicht', () => {
    setPlatformForTests('win32');
    expect(isFilesystemCaseInsensitive()).toBe(true);
    setPlatformForTests('darwin');
    expect(isFilesystemCaseInsensitive()).toBe(true);
  });

  it('Linux unterscheidet die Schreibung', () => {
    setPlatformForTests('linux');
    expect(isFilesystemCaseInsensitive()).toBe(false);
  });

  it('setPlatformForTests(undefined) stellt die reale Plattform wieder her', () => {
    setPlatformForTests('linux');
    setPlatformForTests(undefined);
    expect(isFilesystemCaseInsensitive()).toBe(process.platform === 'win32');
  });
});

describe('pathCompareKey (4T-1203)', () => {
  it('kleingeschrieben nur auf case-insensitiven Dateisystemen', () => {
    setPlatformForTests('win32');
    expect(pathCompareKey('C:\\Daten\\Notizen')).toBe('c:\\daten\\notizen');
    setPlatformForTests('darwin');
    expect(pathCompareKey('/Users/Wer/Notizen')).toBe('/users/wer/notizen');
    setPlatformForTests('linux');
    expect(pathCompareKey('/home/Wer/Notizen')).toBe('/home/Wer/Notizen');
  });
});

// 4T-1225 (Epic 3E-0122, Befund F1): Der Pfad-Trenner kommt aus der einen
// Quelle; ein hart verdrahteter Backslash liess unter Linux Pfade wie
// `/bereich\ordner` entstehen, deren Listing still leer blieb.
describe('pathSeparator (4T-1225)', () => {
  it('Backslash nur auf Windows, sonst Schraegstrich', () => {
    setPlatformForTests('win32');
    expect(pathSeparator()).toBe('\\');
    setPlatformForTests('darwin');
    expect(pathSeparator()).toBe('/');
    setPlatformForTests('linux');
    expect(pathSeparator()).toBe('/');
  });
});

// 4T-1225 (Befund F3): Im sandboxed Renderer existiert kein `process`; der
// nackte Zugriff bei der Modul-Initialisierung brach den gesamten
// Renderer-Bundle-Start (auf allen Plattformen). Das Modul faellt dort auf
// die vom Preload exponierte Auskunft `api.plattform` (4T-1202) zurueck.
describe('Plattform-Ermittlung ohne process (4T-1225)', () => {
  it('faellt auf die Preload-Auskunft zurueck und wirft nicht', async () => {
    vi.resetModules();
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('api', { plattform: 'win32' });
    try {
      const frisch = await import('../../src/shared/platform.js');
      expect(frisch.pathSeparator()).toBe('\\');
      expect(frisch.isFilesystemCaseInsensitive()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
