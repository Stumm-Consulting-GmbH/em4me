// 4T-001850 (Epic 3E-000110): Prüffälle der Zieh-Geometrie.
//
// Das Modul ist von der Tafel unabhängig und rechnet allein mit Punkten und
// Rechtecken; es lässt sich deshalb ohne DOM und ohne gestartete Anwendung
// messen. Genau das ist der Grund für den Schnitt: Was der Bestand bisher in
// jeder Zieh-Stelle neu erfunden hat, steht hier einmal und ist einmal geprüft.
import { describe, it, expect } from 'vitest';
import {
  ZIEH_SCHWELLE,
  einfuegePosition,
  imRechteck,
  markenRechteck,
  randRollSchritt,
  ueberSchwelle,
} from '../../src/shared/zieh-geometrie.js';

// Drei Karten untereinander, je 40 hoch, ohne Lücke: Mitten bei 20, 60, 100.
const SENKRECHT = [
  { left: 10, top: 0, width: 200, height: 40 },
  { left: 10, top: 40, width: 200, height: 40 },
  { left: 10, top: 80, width: 200, height: 40 },
];

// Drei Spalten nebeneinander, je 100 breit: Mitten bei 50, 150, 250.
const WAAGERECHT = [
  { left: 0, top: 0, width: 100, height: 300 },
  { left: 100, top: 0, width: 100, height: 300 },
  { left: 200, top: 0, width: 100, height: 300 },
];

describe('Schwelle zwischen Klick und Zug', () => {
  it('unterhalb und genau auf der Schwelle bleibt es ein Klick', () => {
    // Ohne diese Zusage löste jedes Zittern der Hand beim Auswählen einen
    // Schreibvorgang aus.
    expect(ueberSchwelle(0)).toBe(false);
    expect(ueberSchwelle(ZIEH_SCHWELLE)).toBe(false);
  });

  it('darüber beginnt der Zug', () => {
    expect(ueberSchwelle(ZIEH_SCHWELLE + 1)).toBe(true);
  });

  it('eine eigene Schwelle schlägt die des Bestands', () => {
    expect(ueberSchwelle(5, 10)).toBe(false);
    expect(ueberSchwelle(11, 10)).toBe(true);
  });
});

describe('Einfüge-Position aus Zeiger-Punkt und Rechtecken', () => {
  it('über der Mitte des ersten Elements: ganz nach vorn', () => {
    expect(einfuegePosition({ x: 100, y: 5 }, SENKRECHT)).toBe(0);
    expect(einfuegePosition({ x: 100, y: 20 }, SENKRECHT), 'genau auf der Mitte').toBe(0);
  });

  it('zwischen zwei Mitten: dazwischen', () => {
    expect(einfuegePosition({ x: 100, y: 21 }, SENKRECHT)).toBe(1);
    expect(einfuegePosition({ x: 100, y: 59 }, SENKRECHT)).toBe(1);
    expect(einfuegePosition({ x: 100, y: 61 }, SENKRECHT)).toBe(2);
  });

  it('unter der Mitte des letzten Elements: ganz nach hinten', () => {
    expect(einfuegePosition({ x: 100, y: 101 }, SENKRECHT)).toBe(3);
    expect(einfuegePosition({ x: 100, y: 5000 }, SENKRECHT), 'weit darunter').toBe(3);
  });

  it('eine leere Reihe hat genau eine Position', () => {
    expect(einfuegePosition({ x: 100, y: 50 }, [])).toBe(0);
    expect(einfuegePosition({ x: 100, y: 50 }, null)).toBe(0);
  });

  it('auf der Waagerechten zählt die Waagerechte', () => {
    expect(einfuegePosition({ x: 40, y: 150 }, WAAGERECHT, { achse: 'x' })).toBe(0);
    expect(einfuegePosition({ x: 120, y: 150 }, WAAGERECHT, { achse: 'x' })).toBe(1);
    expect(einfuegePosition({ x: 290, y: 150 }, WAAGERECHT, { achse: 'x' })).toBe(3);
    // Ohne Achsen-Angabe gilt die Senkrechte; dieselbe Reihe antwortet anders,
    // weil alle drei Spalten dieselbe Höhe und damit dieselbe Mitte haben.
    expect(einfuegePosition({ x: 290, y: 150 }, WAAGERECHT)).toBe(0);
  });
});

describe('Rechteck der Einfüge-Marke', () => {
  it('vor einem Element liegt sie an dessen Oberkante', () => {
    const r = markenRechteck(SENKRECHT, 1, { dicke: 4 });
    expect(r).toEqual({ x: 10, y: 38, breite: 200, hoehe: 4 });
  });

  it('hinter dem letzten liegt sie an dessen Unterkante', () => {
    const r = markenRechteck(SENKRECHT, 3, { dicke: 4 });
    expect(r).toEqual({ x: 10, y: 118, breite: 200, hoehe: 4 });
  });

  it('auf der Waagerechten ist sie ein senkrechter Strich', () => {
    const r = markenRechteck(WAAGERECHT, 1, { achse: 'x', dicke: 4 });
    expect(r).toEqual({ x: 98, y: 0, breite: 4, hoehe: 300 });
  });

  it('in einer leeren Reihe steht sie am Anfang der Ersatz-Fläche', () => {
    const leer = { left: 5, top: 7, width: 180, height: 90 };
    expect(markenRechteck([], 0, { dicke: 3, leerRechteck: leer })).toEqual({
      x: 5,
      y: 7,
      breite: 180,
      hoehe: 3,
    });
  });

  it('ohne Reihe und ohne Ersatz-Fläche gibt es nichts zu zeigen', () => {
    // Kein erfundenes Rechteck: Eine Marke im Nirgendwo wäre eine Aussage, die
    // die Geometrie nicht treffen kann.
    expect(markenRechteck([], 0)).toBeNull();
  });

  it('eine Position ausserhalb der Reihe wird eingefangen', () => {
    expect(markenRechteck(SENKRECHT, 99, { dicke: 2 }).y).toBe(119);
    expect(markenRechteck(SENKRECHT, -5, { dicke: 2 }).y).toBe(-1);
  });
});

describe('Rand-Roll-Takt', () => {
  const flaeche = { left: 0, top: 0, width: 400, height: 300 };

  it('in der Mitte wird nicht gerollt', () => {
    expect(randRollSchritt({ x: 200, y: 150 }, flaeche)).toEqual({ dx: 0, dy: 0 });
  });

  it('am linken und am oberen Rand geht es zurück', () => {
    const s = randRollSchritt({ x: 0, y: 0 }, flaeche);
    expect(s.dx).toBeLessThan(0);
    expect(s.dy).toBeLessThan(0);
  });

  it('am rechten und am unteren Rand geht es vorwärts', () => {
    const s = randRollSchritt({ x: 400, y: 300 }, flaeche);
    expect(s.dx).toBeGreaterThan(0);
    expect(s.dy).toBeGreaterThan(0);
  });

  it('näher am Rand wird schneller gerollt', () => {
    // Kein Sprung von null auf voll: Der Anteil wächst linear in den Streifen
    // hinein, sonst wäre das Rollen nicht zu dosieren.
    const aussen = randRollSchritt({ x: 30, y: 150 }, flaeche, { rand: 40, tempo: 20 });
    const innen = randRollSchritt({ x: 5, y: 150 }, flaeche, { rand: 40, tempo: 20 });
    expect(Math.abs(aussen.dx)).toBeGreaterThan(0);
    expect(Math.abs(innen.dx)).toBeGreaterThan(Math.abs(aussen.dx));
  });

  it('ausserhalb der Fläche gilt die volle Schrittweite', () => {
    expect(randRollSchritt({ x: -100, y: 150 }, flaeche, { tempo: 12 }).dx).toBe(-12);
  });

  it('eine Achsen-Angabe schliesst die andere aus', () => {
    // Der Spalten-Streifen rollt nur waagerecht, die Karten-Liste nur
    // senkrecht; ohne die Begrenzung rollten beide in beide Richtungen.
    expect(randRollSchritt({ x: 0, y: 0 }, flaeche, { achse: 'x' }).dy).toBe(0);
    expect(randRollSchritt({ x: 0, y: 0 }, flaeche, { achse: 'y' }).dx).toBe(0);
  });
});

describe('Punkt im Rechteck', () => {
  const r = { left: 10, top: 20, width: 100, height: 50 };

  it('innen und auf dem Rand gilt als drin', () => {
    expect(imRechteck({ x: 50, y: 40 }, r)).toBe(true);
    expect(imRechteck({ x: 10, y: 20 }, r)).toBe(true);
    expect(imRechteck({ x: 110, y: 70 }, r)).toBe(true);
  });

  it('daneben gilt als draussen, und Fehlendes ebenso', () => {
    expect(imRechteck({ x: 9, y: 40 }, r)).toBe(false);
    expect(imRechteck({ x: 50, y: 71 }, r)).toBe(false);
    expect(imRechteck(null, r)).toBe(false);
    expect(imRechteck({ x: 0, y: 0 }, null)).toBe(false);
  });

  it('eine Achsen-Angabe fragt nur diese Achse', () => {
    // Eine Spalte füllt ihren Streifen der Höhe nach: Ein Zeiger unter der
    // letzten Karte meint erkennbar weiterhin diese Spalte.
    expect(imRechteck({ x: 50, y: 5000 }, r, { achse: 'x' })).toBe(true);
    expect(imRechteck({ x: 5000, y: 40 }, r, { achse: 'x' })).toBe(false);
    expect(imRechteck({ x: 5000, y: 40 }, r, { achse: 'y' })).toBe(true);
  });
});
