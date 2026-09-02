// 4T-000469 (Epic 3E-000087): Unit-Tests des Nummerierungs-Kerns.
//
// Deckt Marker-Erkennung (parseHeadingMarker) und Zaehl-Logik
// (computeHeadingNumbers) ueber alle Regel-Kombinationen ab: Hierarchie,
// Geschwister-Reset, Start-Ebene H1/H2, uebersprungene Ebenen, Ausnahmen
// (`{-}`) inkl. Weiterzaehlen der Unter-Ueberschriften, Einbeziehen (`{+}`)
// gegen den Dokument-Zustand und Escapes.
import { describe, it, expect } from 'vitest';
import {
  parseHeadingMarker,
  computeHeadingNumbers,
  normalizeStartLevel,
} from '../../src/shared/heading-numbers.js';

// Kurzschreibweise: Liste aus [level, rawTitle]-Paaren.
function headings(pairs) {
  return pairs.map(([level, rawTitle]) => ({ level, rawTitle }));
}
// Nur die Nummern-Spalte fuer kompakte Erwartungen.
function numbers(result) {
  return result.map((r) => r.number);
}

describe('parseHeadingMarker (4T-000469)', () => {
  it('erkennt den Ausnahme-Marker {-} am Zeilenende', () => {
    expect(parseHeadingMarker('Titel {-}')).toEqual({ marker: 'exclude', cleanTitle: 'Titel' });
  });

  it('erkennt den Einbezugs-Marker {+} am Zeilenende', () => {
    expect(parseHeadingMarker('Titel {+}')).toEqual({ marker: 'include', cleanTitle: 'Titel' });
  });

  it('ohne Marker bleibt der Titel unveraendert (nur Trailing-Leerraum weg)', () => {
    expect(parseHeadingMarker('Nur ein Titel  ')).toEqual({
      marker: null,
      cleanTitle: 'Nur ein Titel',
    });
  });

  it('escapt: \\{-} bleibt Literal {-} ohne Marker-Wirkung', () => {
    expect(parseHeadingMarker('Titel \\{-}')).toEqual({ marker: null, cleanTitle: 'Titel {-}' });
  });

  it('escapt: \\{+} bleibt Literal {+} ohne Marker-Wirkung', () => {
    expect(parseHeadingMarker('Titel \\{+}')).toEqual({ marker: null, cleanTitle: 'Titel {+}' });
  });

  it('Marker nur am Zeilenende: Text dahinter macht ihn zu Literal', () => {
    expect(parseHeadingMarker('Titel {-} mehr')).toEqual({
      marker: null,
      cleanTitle: 'Titel {-} mehr',
    });
  });

  it('toleriert Leerraum zwischen Titel und Marker sowie hinter dem Marker', () => {
    expect(parseHeadingMarker('Titel   {-}   ')).toEqual({
      marker: 'exclude',
      cleanTitle: 'Titel',
    });
  });

  it('nur ein Marker ohne Titel liefert leeren cleanTitle', () => {
    expect(parseHeadingMarker('{+}')).toEqual({ marker: 'include', cleanTitle: '' });
  });

  it('fremde geschweifte Inhalte am Ende sind kein Marker', () => {
    expect(parseHeadingMarker('Titel {.klasse}')).toEqual({
      marker: null,
      cleanTitle: 'Titel {.klasse}',
    });
  });
});

describe('computeHeadingNumbers — Grundhierarchie (4T-000469)', () => {
  it('nummeriert H1/H2/H3 hierarchisch ab Start-Ebene 1', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A'],
        [2, 'B'],
        [2, 'C'],
        [3, 'D'],
        [1, 'E'],
      ]),
      { enabled: true, startLevel: 1 },
    );
    expect(numbers(res)).toEqual(['1', '1.1', '1.2', '1.2.1', '2']);
  });

  it('setzt tiefere Zaehler beim Aufstieg zurueck (Geschwister)', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A'],
        [2, 'A1'],
        [3, 'A1a'],
        [2, 'A2'],
      ]),
      { enabled: true, startLevel: 1 },
    );
    expect(numbers(res)).toEqual(['1', '1.1', '1.1.1', '1.2']);
  });

  it('gibt den um den Marker bereinigten Titel zurueck', () => {
    const res = computeHeadingNumbers(headings([[1, 'Kapitel {-}']]), {
      enabled: true,
      startLevel: 1,
    });
    expect(res[0]).toEqual({ number: null, cleanTitle: 'Kapitel', excluded: true });
  });
});

describe('computeHeadingNumbers — Start-Ebene (4T-000469)', () => {
  it('ignoriert H1 bei Start-Ebene 2 (kein Zaehler-Einfluss, H2 laeuft durch)', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'Dokument-Titel'],
        [2, 'A'],
        [3, 'B'],
        [2, 'C'],
        [1, 'Zweiter H1'],
        [2, 'D'],
      ]),
      { enabled: true, startLevel: 2 },
    );
    expect(numbers(res)).toEqual([null, '1', '1.1', '2', null, '3']);
  });
});

describe('computeHeadingNumbers — uebersprungene Ebenen (4T-000469)', () => {
  it('zaehlt uebersprungene Zwischenebenen als 1 (H1 -> H3)', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A'],
        [3, 'B'],
        [3, 'C'],
        [2, 'D'],
      ]),
      { enabled: true, startLevel: 1 },
    );
    expect(numbers(res)).toEqual(['1', '1.1.1', '1.1.2', '1.2']);
  });
});

describe('computeHeadingNumbers — Ausnahmen {-} (4T-000469)', () => {
  it('ausgenommene Ueberschrift zaehlt nicht mit; Nachbar zaehlt weiter', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A'],
        [2, 'B'],
        [2, 'C {-}'],
        [2, 'D'],
      ]),
      { enabled: true, startLevel: 1 },
    );
    expect(numbers(res)).toEqual(['1', '1.1', null, '1.2']);
  });

  it('Unter-Ueberschrift einer ausgenommenen zaehlt unter dem letzten nummerierten Vorfahren weiter', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A'],
        [2, 'B'],
        [3, 'B1'],
        [2, 'C {-}'],
        [3, 'C1'],
      ]),
      { enabled: true, startLevel: 1 },
    );
    expect(numbers(res)).toEqual(['1', '1.1', '1.1.1', null, '1.1.2']);
  });
});

describe('computeHeadingNumbers — Dokument-Zustand und {+} (4T-000469)', () => {
  it('bei enabled=false bleibt alles ohne Nummer', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A'],
        [2, 'B'],
      ]),
      { enabled: false, startLevel: 1 },
    );
    expect(numbers(res)).toEqual([null, null]);
  });

  it('{+} bezieht einzelne Ueberschriften trotz enabled=false ein', () => {
    const res = computeHeadingNumbers(
      headings([
        [1, 'A {+}'],
        [1, 'B'],
        [1, 'C {+}'],
      ]),
      { enabled: false, startLevel: 1 },
    );
    expect(numbers(res)).toEqual(['1', null, '2']);
  });

  it('escapter Marker folgt dem Dokument-Zustand und bleibt Literal im Titel', () => {
    const res = computeHeadingNumbers(headings([[1, 'A \\{-}']]), { enabled: true, startLevel: 1 });
    expect(res[0]).toEqual({ number: '1', cleanTitle: 'A {-}', excluded: false });
  });
});

describe('computeHeadingNumbers — Robustheit (4T-000469)', () => {
  it('leere Liste liefert leeres Ergebnis', () => {
    expect(computeHeadingNumbers([], { enabled: true, startLevel: 1 })).toEqual([]);
  });

  it('fehlender Kontext wird als deaktiviert, Start-Ebene 1 behandelt', () => {
    const res = computeHeadingNumbers(headings([[1, 'A']]));
    expect(res[0].number).toBeNull();
  });

  it('normalizeStartLevel klemmt auf 1 oder 2', () => {
    expect(normalizeStartLevel(1)).toBe(1);
    expect(normalizeStartLevel(2)).toBe(2);
    expect(normalizeStartLevel(3)).toBe(1);
    expect(normalizeStartLevel(undefined)).toBe(1);
  });
});
