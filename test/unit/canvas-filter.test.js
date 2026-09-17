// 4T-001771 (Epic 3E-000290): Unit-Tests des Filters über der Karten-Liste
// einer Canvas-Fläche (Story 4S-000950, AK1 bis AK4 und AK13 der Story; AK1,
// AK2 und AK12 des Tasks).
//
// **Eigene Datei neben `canvas-core.test.js`**, weil der Filter ein eigenes
// Kern-Modul ist: `canvas-core.js` stand bei 482 von 500 Code-Zeilen, und die
// Prüfdatei daneben bei 757 von 800. Der Schnitt folgt dem der Quelle.
//
// Geprüft wird **prozessneutral** — Eingabe ist die Liste aus `canvasListe`,
// Ausgabe sind Einträge mit Fundstellen. Kein DOM, keine Sprache: Was eine
// Anzeige aus den Bereichen macht, ist ihre Sache und steht in
// `test/unit/renderer/canvas-liste-filter.test.js`.
import { describe, it, expect } from 'vitest';
import { canvasListe, parseCanvasFence } from '../../src/shared/canvas/canvas-core.js';
import {
  canvasListeFiltern,
  fundStellen,
  normalisiereCanvasSuche,
} from '../../src/shared/canvas/canvas-filter.js';

// Eine Fläche mit allen durchsuchten Feldern: Karten-Text, Verweis-Ziel,
// Bild-Name, Form- und Gruppen-Beschriftung sowie eine beschriftete Verbindung.
const RUMPF = [
  '!karte k1 x=0 y=0 b=200 h=100',
  '# Erste Karte',
  '!karte k2 x=0 y=300 b=200 h=100',
  '# Zweite Karte',
  '!linie l1 k1 -> k2',
  'Zusammenhang',
  '!karte k3 x=400 y=0 b=200 h=100 doc="Import.md#Zielbild"',
  '!karte k4 x=400 y=300 b=200 h=100 bild="anlagen/Seeblick.png"',
  '!form f1 x=800 y=0 b=80 h=80 art=oval',
  'Ein Oval',
  '!gruppe g1 x=-20 y=-20 b=900 h=900',
  'Alles zusammen',
].join('\n');

const liste = () => canvasListe(parseCanvasFence(RUMPF));
const treffer = (suche) => canvasListeFiltern(liste(), suche).map((e) => e.id);

describe('canvas-filter: Normalisierung und Fundstellen (AK1)', () => {
  it('trimmt die Eingabe und schreibt sie klein', () => {
    expect(normalisiereCanvasSuche('  KaRtE \n')).toBe('karte');
    expect(normalisiereCanvasSuche('')).toBe('');
    expect(normalisiereCanvasSuche(null)).toBe('');
    expect(normalisiereCanvasSuche(undefined)).toBe('');
  });

  it('liefert jede Fundstelle als Bereich im Original-Wert, ohne Überlappung', () => {
    expect(fundStellen('Karte über Karte', 'karte')).toEqual([
      [0, 5],
      [11, 16],
    ]);
    // Die zweite Fundstelle beginnt hinter der ersten: `aaa` in `aaaa` steht
    // einmal, nicht zweimal.
    expect(fundStellen('aaaa', 'aaa')).toEqual([[0, 3]]);
  });

  it('unterscheidet kein Treffer von Treffer ohne belastbare Stelle', () => {
    expect(fundStellen('Karte', 'form')).toBeNull();
    expect(fundStellen('', 'karte')).toBeNull();
    expect(fundStellen(null, 'karte')).toBeNull();
    expect(fundStellen('Karte', '')).toBeNull();
  });
});

describe('canvas-filter: was durchsucht wird (AK1, AK2)', () => {
  it('ohne Eingabe bleibt die ganze Liste, in unveränderter Reihenfolge', () => {
    expect(treffer('')).toEqual(['k1', 'k2', 'k3', 'k4', 'f1', 'g1']);
    expect(treffer('   ')).toEqual(['k1', 'k2', 'k3', 'k4', 'f1', 'g1']);
    // Und jeder Eintrag trägt die leeren Fundstellen-Sätze, damit die Anzeige
    // ungefiltert dieselbe Form bekommt wie gefiltert.
    const alle = canvasListeFiltern(liste(), '');
    expect(alle[0].stellen).toEqual({});
    expect(alle[0].verbindungen[0].stellen).toEqual({});
  });

  it('findet den Karten-Text ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(treffer('zweite')).toEqual(['k2']);
    expect(treffer('ZWEITE')).toEqual(['k2']);
    expect(treffer('Karte')).toEqual(['k1', 'k2']);
  });

  it('findet das Ziel einer Verweis-Karte und den Namen eines Bildes', () => {
    expect(treffer('zielbild')).toEqual(['k3']);
    expect(treffer('seeblick')).toEqual(['k4']);
    // Der Bild-Name steht ohne seinen Ordner in der Liste; gesucht wird, was
    // dort steht (Regel von `kartenVerweisText`).
    expect(treffer('anlagen')).toEqual([]);
  });

  it('findet die Beschriftung einer Form und einer Gruppe', () => {
    expect(treffer('oval')).toEqual(['f1']);
    expect(treffer('alles')).toEqual(['g1']);
  });

  it('hält eine Karte, deren Verbindung trifft — und zeigt nur diese Verbindung', () => {
    const gefunden = canvasListeFiltern(liste(), 'zusammenhang');
    // Beide Enden der Verbindung bleiben stehen: Die Verbindung hat keine Zeile
    // ohne ihre Karte.
    expect(gefunden.map((e) => e.id)).toEqual(['k1', 'k2']);
    expect(gefunden[0].verbindungen.map((v) => v.id)).toEqual(['l1']);
    expect(gefunden[0].verbindungen[0].stellen.text).toEqual([[0, 12]]);
    // Die Karte selbst trägt keine Fundstelle — getroffen hat die Verbindung.
    expect(gefunden[0].stellen).toEqual({});
  });

  it('trifft die Karte selbst, bleiben alle ihre Verbindungen stehen', () => {
    const gefunden = canvasListeFiltern(liste(), 'erste');
    expect(gefunden.map((e) => e.id)).toEqual(['k1']);
    expect(gefunden[0].verbindungen.map((v) => v.id)).toEqual(['l1']);
    expect(gefunden[0].stellen.text).toEqual([[0, 5]]);
  });

  it('die Gegenstelle einer Verbindung ist keine Fundstelle', () => {
    // `k2` ist eine Kennung und keine Beschriftung; wer die Karte sucht, findet
    // ihre eigene Zeile über ihren Text.
    expect(treffer('k2')).toEqual([]);
  });
});

describe('canvas-filter: Randfälle (AK12)', () => {
  it('Sonderzeichen und ein sehr langer Suchtext liefern ein Ergebnis, keinen Fehler', () => {
    expect(treffer('.*[')).toEqual([]);
    expect(treffer('#Zielbild')).toEqual(['k3']);
    expect(treffer('x'.repeat(10000))).toEqual([]);
    // Ein Suchtext, der länger ist als jeder Wert, trifft nichts — und wirft
    // nichts.
    expect(() => canvasListeFiltern(liste(), '\\(){}[]^$')).not.toThrow();
  });

  it('eine fehlende oder leere Liste liefert eine leere Liste', () => {
    expect(canvasListeFiltern(null, 'karte')).toEqual([]);
    expect(canvasListeFiltern(undefined, '')).toEqual([]);
    expect(canvasListeFiltern([], 'karte')).toEqual([]);
  });

  it('lässt die Eingabe unangetastet — der Filter ist eine reine Funktion', () => {
    const eingabe = liste();
    const vorher = JSON.stringify(eingabe);
    canvasListeFiltern(eingabe, 'karte');
    expect(JSON.stringify(eingabe)).toBe(vorher);
  });

  it('ein Element ohne Beschriftung fällt bei jeder Eingabe heraus', () => {
    const ohne = canvasListe(parseCanvasFence('!karte k1 x=0 y=0 b=10 h=10'));
    expect(canvasListeFiltern(ohne, 'karte')).toEqual([]);
    expect(canvasListeFiltern(ohne, '').map((e) => e.id)).toEqual(['k1']);
  });
});
