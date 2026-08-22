// 4T-0945 (Story 4S-0786, Befund B-12): Stand-Pruefung vor dem Ueberschreiben.
//
// Der Vergleich entscheidet ueber Datenverlust in beide Richtungen: Uebersieht
// er eine Abweichung, geht die fremde Aenderung verloren; meldet er eine, wo
// keine ist, wird der Dialog zur Gewohnheit und schuetzt bald nicht mehr.
// Beide Richtungen stehen deshalb hier.
import { describe, it, expect } from 'vitest';
import { istKonflikt, normalizeForCompare } from '../../src/main/documents/save-guard.js';

describe('save-guard: Stand-Pruefung vor dem Ueberschreiben', () => {
  it('meldet keinen Konflikt bei gleichem Stand', () => {
    expect(istKonflikt('# Titel\n\nZeile\n', '# Titel\n\nZeile\n')).toBe(false);
  });

  it('meldet den Konflikt bei fremder Aenderung', () => {
    expect(istKonflikt('# Titel\n\nZeile\nFremd\n', '# Titel\n\nZeile\n')).toBe(true);
  });

  it('meldet den Konflikt auch bei einer geloeschten Zeile', () => {
    expect(istKonflikt('# Titel\n', '# Titel\n\nZeile\n')).toBe(true);
  });

  // Der Fallstrick der Umsetzung: Der Reiter haelt einen von file:read
  // normalisierten Stand. Ohne dieselbe Behandlung des Platten-Texts meldete
  // jede Datei mit Windows-Zeilenenden bei jedem Speichern einen Konflikt.
  it('sieht Windows-Zeilenenden nicht als Aenderung', () => {
    expect(istKonflikt('# Titel\r\n\r\nZeile\r\n', '# Titel\n\nZeile\n')).toBe(false);
  });

  it('sieht eine Byte-Reihenfolge-Marke nicht als Aenderung', () => {
    expect(istKonflikt('\uFEFF# Titel\n', '# Titel\n')).toBe(false);
  });

  it('prueft nicht ohne Erwartung des Aufrufers', () => {
    expect(istKonflikt('irgendwas', undefined)).toBe(false);
    expect(istKonflikt('irgendwas', null)).toBe(false);
  });

  it('behandelt eine fehlende Datei als Neuanlage, nicht als Konflikt', () => {
    expect(istKonflikt(null, '# Titel\n')).toBe(false);
  });

  // Der Vorlagen-Weg gibt die leere Erwartung mit: Eine Ordner-Regel darf
  // keine Datei ueberschreiben, die wider Erwarten schon Inhalt hat.
  it('meldet den Konflikt, wenn eine leer erwartete Datei Inhalt hat', () => {
    expect(istKonflikt('Bereits Inhalt\n', '')).toBe(true);
    expect(istKonflikt('', '')).toBe(false);
  });

  it('normalizeForCompare liefert null fuer Nicht-Text', () => {
    expect(normalizeForCompare(undefined)).toBe(null);
    expect(normalizeForCompare(42)).toBe(null);
  });
});
