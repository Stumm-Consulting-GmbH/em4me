// 4T-000945 (Story 4S-000786, Befund B-12): Stand-Pruefung vor dem Ueberschreiben.
//
// Der Vergleich entscheidet ueber Datenverlust in beide Richtungen: Uebersieht
// er eine Abweichung, geht die fremde Aenderung verloren; meldet er eine, wo
// keine ist, wird der Dialog zur Gewohnheit und schuetzt bald nicht mehr.
// Beide Richtungen stehen deshalb hier.
import { describe, it, expect } from 'vitest';
import {
  istKonflikt,
  istFeldKonflikt,
  feldVergleichsForm,
  normalizeForCompare,
} from '../../src/main/documents/save-guard.js';

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

// 4T-001261 (Epic 3E-000272): Derselbe Schutz fuer den feldweisen Schreibweg.
//
// Die Ereignis-Aggregation schrieb in eine nicht geoeffnete fremde Datei und
// erkannte eine Fremd-Aenderung am ZEITSTEMPEL — mit genau dem Merkmal, das
// dieses Modul verworfen hat. Beide Richtungen stehen auch hier, aus demselben
// Grund: Ein uebersehener Konflikt kostet die fremde Aenderung, ein gemeldeter
// ohne Anlass kostet den Schutz selbst, weil die Meldung zur Gewohnheit wird.
describe('save-guard: feldweise Stand-Pruefung (4T-001261)', () => {
  it('meldet keinen Konflikt, wenn die gelesenen Felder unveraendert sind', () => {
    const jetzt = { 'event-date': '2026-09-05', 'event-text': 'Termin', andere: 'egal' };
    const gelesen = { 'event-date': '2026-09-05', 'event-text': 'Termin' };
    expect(istFeldKonflikt(jetzt, gelesen)).toBe(false);
  });

  it('meldet einen Konflikt, wenn ein gelesenes Feld sich geaendert hat', () => {
    const jetzt = { 'event-date': '2026-09-06', 'event-text': 'Termin' };
    const gelesen = { 'event-date': '2026-09-05', 'event-text': 'Termin' };
    expect(istFeldKonflikt(jetzt, gelesen)).toBe(true);
  });

  it('meldet einen Konflikt, wenn ein gelesenes Feld verschwunden ist', () => {
    expect(istFeldKonflikt({}, { 'event-text': 'Termin' })).toBe(true);
  });

  it('meldet keinen Konflikt fuer ein Feld, das seither hinzugekommen ist', () => {
    // Der Schnappschuss hat es nicht gelesen, und die Operation fasst es nicht
    // an — ein Konflikt waere hier der Fehlalarm, der den Schutz entwertet.
    const jetzt = { 'event-text': 'Termin', 'event-category': 'neu' };
    expect(istFeldKonflikt(jetzt, { 'event-text': 'Termin' })).toBe(false);
  });

  it('prueft nicht, wenn kein Schnappschuss vorliegt', () => {
    // Dieselbe Zusage wie bei istKonflikt: Aufrufer ohne Schnappschuss bleiben
    // entkoppelt, statt an einer Pflicht zu scheitern, die sie nicht kennen.
    expect(istFeldKonflikt({ a: 1 }, null)).toBe(false);
    expect(istFeldKonflikt({ a: 1 }, undefined)).toBe(false);
  });

  it('sieht Datum-Objekt und Datums-Zeichenkette als denselben Wert', () => {
    // Der Schnappschuss reist als JSON ueber die Prozess-Grenze, das frisch
    // geparste Frontmatter traegt ein Date. Ohne gemeinsame Form melde te jede
    // Datei mit Datums-Feld einen Dauer-Konflikt.
    const alsDatum = new Date('2026-09-05T00:00:00.000Z');
    expect(
      istFeldKonflikt({ 'event-date': alsDatum }, { 'event-date': alsDatum.toISOString() }),
    ).toBe(false);
  });

  it('unterscheidet Listen nach ihrer Reihenfolge', () => {
    // Die Reihenfolge ist bedeutungstragend (Vorgaenger und Nachfolger eines
    // Ereignisses), also ist ihre Aenderung eine Aenderung.
    const jetzt = { 'event-predecessors': ['b', 'a'] };
    expect(istFeldKonflikt(jetzt, { 'event-predecessors': ['a', 'b'] })).toBe(true);
    expect(istFeldKonflikt(jetzt, { 'event-predecessors': ['b', 'a'] })).toBe(false);
  });

  it('behandelt fehlend und leer gleich', () => {
    // Ein geraeumtes Feld verschwindet aus dem Frontmatter; der Schnappschuss
    // kann es als null oder gar nicht gefuehrt haben.
    expect(istFeldKonflikt({}, { 'event-notes': null })).toBe(false);
    expect(istFeldKonflikt({ 'event-notes': null }, { 'event-notes': undefined })).toBe(false);
  });

  it('feldVergleichsForm macht aus Nicht-Text eine vergleichbare Form', () => {
    expect(feldVergleichsForm(null)).toBe('');
    expect(feldVergleichsForm(undefined)).toBe('');
    expect(feldVergleichsForm(42)).toBe('42');
    expect(feldVergleichsForm(true)).toBe('true');
  });
});
