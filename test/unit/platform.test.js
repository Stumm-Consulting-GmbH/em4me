// 4T-1203 (Epic 3E-0121): Unit-Tests der zentralen Plattform-Eigenschaften
// (src/shared/platform.js) — die eine Quelle für die Frage, ob das
// Dateisystem die Schreibung unterscheidet.
import { afterEach, describe, expect, it } from 'vitest';
import {
  isFilesystemCaseInsensitive,
  pathCompareKey,
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
