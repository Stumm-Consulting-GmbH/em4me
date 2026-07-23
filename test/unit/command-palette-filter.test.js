// 4T-0480 (Epic 3E-0089): Unit-Matrix fuer das DOM-freie Filter-Modul der
// Kommando-Palette (src/shared/command-palette-filter.js). Deckt die
// Normalisierung der Roh-Eingabe (Trim, Lowercase, null/undefined) und den
// Teilstring-Filter (leere Query, Case-Insensitivitaet inkl. Umlaute,
// Treffer mitten im Wort, stabile Reihenfolge, kein Treffer, robuste
// Behandlung von Nicht-Arrays und Eintraegen ohne label) ab.
import { describe, it, expect } from 'vitest';
import {
  normalizeFilterQuery,
  filterCommandEntries,
} from '../../src/shared/command-palette-filter.js';

describe('normalizeFilterQuery', () => {
  it('trimmt fuehrende und nachfolgende Leerzeichen', () => {
    expect(normalizeFilterQuery('  Speichern  ')).toBe('speichern');
  });
  it('setzt auf Kleinschreibung (locale)', () => {
    expect(normalizeFilterQuery('LESEZEICHEN')).toBe('lesezeichen');
  });
  it('null und undefined ergeben den leeren String', () => {
    expect(normalizeFilterQuery(null)).toBe('');
    expect(normalizeFilterQuery(undefined)).toBe('');
  });
  it('reine Whitespace-Eingabe ergibt den leeren String', () => {
    expect(normalizeFilterQuery('   ')).toBe('');
  });
});

// Beispiel-Eintraege im Format der Palette (nur das label-Feld ist fuer den
// Filter relevant; die uebrigen Felder bleiben absichtlich weg).
const ENTRIES = [
  { label: 'Speichern' },
  { label: 'Speichern unter' },
  { label: 'Lesezeichen anlegen' },
  { label: 'Inhaltsverzeichnis' },
];

describe('filterCommandEntries', () => {
  it('leere Query liefert alle Eintraege als NEUE Array-Instanz', () => {
    const result = filterCommandEntries(ENTRIES, '');
    expect(result).toHaveLength(ENTRIES.length);
    expect(result).toEqual(ENTRIES);
    // Neue Instanz, nicht das Eingangs-Array selbst (kein Aliasing).
    expect(result).not.toBe(ENTRIES);
  });

  it('Whitespace-Query wirkt wie eine leere Query', () => {
    const result = filterCommandEntries(ENTRIES, '   ');
    expect(result).toHaveLength(ENTRIES.length);
    expect(result).not.toBe(ENTRIES);
  });

  it('Teilstring-Match ist case-insensitiv (Grossschreibung, Umlaute)', () => {
    // Query in Grossschreibung trifft das klein geschriebene label.
    const result = filterCommandEntries(ENTRIES, 'LESEZEICHEN');
    expect(result.map((e) => e.label)).toEqual(['Lesezeichen anlegen']);
  });

  it('Umlaut-Query trifft den Umlaut im label', () => {
    const entries = [{ label: 'Bereichs-Graph öffnen' }, { label: 'Speichern' }];
    const result = filterCommandEntries(entries, 'ÖFFNEN');
    expect(result.map((e) => e.label)).toEqual(['Bereichs-Graph öffnen']);
  });

  it('matcht auch mitten im Wort', () => {
    // 'verzeichnis' steht mitten in 'Inhaltsverzeichnis'.
    const result = filterCommandEntries(ENTRIES, 'verzeichnis');
    expect(result.map((e) => e.label)).toEqual(['Inhaltsverzeichnis']);
  });

  it('haelt die Eingangs-Reihenfolge der Treffer stabil', () => {
    // 'speichern' trifft beide Speichern-Eintraege in Ursprungs-Reihenfolge.
    const result = filterCommandEntries(ENTRIES, 'speichern');
    expect(result.map((e) => e.label)).toEqual(['Speichern', 'Speichern unter']);
  });

  it('kein Treffer ergibt ein leeres Array', () => {
    const result = filterCommandEntries(ENTRIES, 'xyz-nichts');
    expect(result).toEqual([]);
  });

  it('Nicht-Array-Eingabe ergibt ein leeres Array', () => {
    expect(filterCommandEntries(null, 'a')).toEqual([]);
    expect(filterCommandEntries(undefined, '')).toEqual([]);
    expect(filterCommandEntries('kein Array', 'a')).toEqual([]);
    expect(filterCommandEntries({ label: 'x' }, 'x')).toEqual([]);
  });

  it('Eintraege ohne label werden bei nicht-leerer Query nicht gematcht', () => {
    const entries = [{ label: 'Speichern' }, {}, { label: null }, { other: 'Speichern' }];
    const result = filterCommandEntries(entries, 'speichern');
    expect(result.map((e) => e.label)).toEqual(['Speichern']);
  });

  it('Eintraege ohne label bleiben bei leerer Query erhalten', () => {
    const entries = [{ label: 'Speichern' }, {}, { label: null }];
    const result = filterCommandEntries(entries, '');
    expect(result).toHaveLength(3);
  });
});
