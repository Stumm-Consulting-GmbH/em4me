// 4T-0946 (Story S-0005, Befund B-12): Erkennung von Pfaden auf Netz-Freigaben.
//
// Beide Zugangswege gehoeren geprueft: Der UNC-Pfad verraet sich am Praefix,
// das gemappte Laufwerk nur ueber seine Laufwerksart. Eine Erkennung, die
// allein den Pfad ansieht, deckte den halben Fall ab — und genau diese Haelfte
// ist die, die im Alltag benutzt wird.
import { describe, it, expect, afterEach } from 'vitest';
import {
  istUncPfad,
  laufwerkVon,
  istNetzPfad,
  watchOptionenFuer,
  NETZ_ABFRAGE_MS,
  _setNetzLaufwerkeFuerTest,
} from '../../src/main/documents/network-paths.js';

afterEach(() => _setNetzLaufwerkeFuerTest(null));

describe('netz-pfade: UNC-Erkennung', () => {
  it('erkennt beide Schreibweisen des UNC-Praefixes', () => {
    expect(istUncPfad('\\\\DATEISERVER\\Firma\\Datei.md')).toBe(true);
    expect(istUncPfad('//DATEISERVER/Firma/Datei.md')).toBe(true);
  });

  it('haelt lokale Pfade auseinander', () => {
    expect(istUncPfad('C:\\Users\\test\\Datei.md')).toBe(false);
    expect(istUncPfad('')).toBe(false);
    expect(istUncPfad(null)).toBe(false);
  });

  it('erkennt den UNC-Pfad ohne jede Laufwerks-Liste', () => {
    _setNetzLaufwerkeFuerTest(null);
    expect(istNetzPfad('\\\\DATEISERVER\\Firma\\Datei.md')).toBe(true);
  });
});

describe('netz-pfade: Laufwerksbuchstabe', () => {
  it('liest den Buchstaben und normalisiert ihn', () => {
    expect(laufwerkVon('c:\\Users\\Datei.md')).toBe('C');
    expect(laufwerkVon('V:/Freigabe/Datei.md')).toBe('V');
  });

  it('liefert null, wo es keinen gibt', () => {
    expect(laufwerkVon('\\\\Server\\Freigabe\\Datei.md')).toBe(null);
    expect(laufwerkVon('')).toBe(null);
  });

  it('erkennt ein gemapptes Netzlaufwerk als Netz-Pfad', () => {
    _setNetzLaufwerkeFuerTest(['V', 'H']);
    expect(istNetzPfad('V:\\Freigabe\\Datei.md')).toBe(true);
    expect(istNetzPfad('h:/Freigabe/Datei.md')).toBe(true);
    expect(istNetzPfad('C:\\Users\\Datei.md')).toBe(false);
  });

  // Fail-safe zugunsten des heutigen Verhaltens: Solange die Liste fehlt,
  // laeuft die Beobachtung wie bisher; nachgezogen wird, sobald sie vorliegt.
  it('gilt ohne Laufwerks-Liste als nicht-Netz', () => {
    _setNetzLaufwerkeFuerTest(null);
    expect(istNetzPfad('V:\\Freigabe\\Datei.md')).toBe(false);
  });
});

describe('netz-pfade: Beobachtungs-Optionen', () => {
  it('schaltet den Abfrage-Betrieb nur auf Netz-Pfaden ein', () => {
    _setNetzLaufwerkeFuerTest(['V']);
    expect(watchOptionenFuer('C:\\Users\\Datei.md')).toEqual({});
    expect(watchOptionenFuer('V:\\Freigabe\\Datei.md')).toEqual({
      usePolling: true,
      interval: NETZ_ABFRAGE_MS,
      binaryInterval: NETZ_ABFRAGE_MS,
    });
    expect(watchOptionenFuer('\\\\Server\\Freigabe\\Datei.md').usePolling).toBe(true);
  });

  it('haelt den Abfrage-Abstand in der gemessenen Groessenordnung', () => {
    // Begruendung im Modul-Kopf: lokale Reaktionszeit rund 280 ms, gemessene
    // Reaktion auf der Freigabe 270 bis 700 ms, Last 0,4 Prozent bei 20 Dateien.
    expect(NETZ_ABFRAGE_MS).toBeGreaterThanOrEqual(500);
    expect(NETZ_ABFRAGE_MS).toBeLessThanOrEqual(2000);
  });
});
