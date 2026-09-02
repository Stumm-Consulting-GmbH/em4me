// 4T-001357 (Epic 3E-000238): Auswahl-Regel der Schlagwort-Vorschlagsliste.
//
// Sie liegt prozessneutral und ist deshalb ohne Editor prüfbar. Dass ihre
// Reihenfolge die Anzeige auch erreicht, misst die E2E-Ebene — die Lehre aus
// 4T-001339, wo genau diese Trennung den Fehler verdeckt hatte.
import { describe, it, expect } from 'vitest';
import {
  SCHLAGWORT_RENDER_LIMIT,
  waehleSchlagworte,
} from '../../src/shared/schlagwort-vorschlaege.js';

// Vier Schlagworte mit gegenläufiger Alphabet- und Häufigkeits-Folge: Wer nach
// Namen sortiert, bekommt alpha, beta, gamma, delta; wer nach Häufigkeit
// sortiert, bekommt delta, gamma, beta, alpha. Jede Verwechslung der beiden
// Regeln ist damit an der ersten Zeile sichtbar.
const TAGS = [
  { tag: 'alpha', count: 1 },
  { tag: 'beta', count: 2 },
  { tag: 'gamma', count: 3 },
  { tag: 'delta', count: 4 },
];

const namen = (liste) => liste.map((e) => e.tag);

describe('Auswahl-Regel der Schlagwort-Vorschlaege (4T-001357)', () => {
  it('ohne Eingabe fuehrt die Haeufigkeit, das haeufigste zuerst', () => {
    expect(namen(waehleSchlagworte(TAGS, ''))).toEqual(['delta', 'gamma', 'beta', 'alpha']);
  });

  it('mit Eingabe fuehrt die Treffer-Guete, nicht die Haeufigkeit', () => {
    // 'ta' trifft 'tabelle' am Anfang und 'beta' in der Mitte. Der
    // Prefix-Treffer steht oben, obwohl der Teiltreffer haeufiger ist.
    const tags = [
      { tag: 'beta', count: 9 },
      { tag: 'tabelle', count: 1 },
    ];
    expect(namen(waehleSchlagworte(tags, 'ta'))).toEqual(['tabelle', 'beta']);
  });

  it('die Haeufigkeit entscheidet zwischen gleichrangigen Treffern', () => {
    const tags = [
      { tag: 'bau-selten', count: 1 },
      { tag: 'bau-oft', count: 20 },
    ];
    expect(namen(waehleSchlagworte(tags, 'bau'))).toEqual(['bau-oft', 'bau-selten']);
  });

  it('der Name entscheidet zuletzt, damit die Reihenfolge stabil bleibt', () => {
    const tags = [
      { tag: 'zeta', count: 5 },
      { tag: 'alpha', count: 5 },
    ];
    expect(namen(waehleSchlagworte(tags, ''))).toEqual(['alpha', 'zeta']);
  });

  it('filtert ohne Ruecksicht auf Gross- und Kleinschreibung', () => {
    expect(namen(waehleSchlagworte(TAGS, 'ALPH'))).toEqual(['alpha']);
  });

  it('haelt das Render-Limit ein', () => {
    const viele = Array.from({ length: SCHLAGWORT_RENDER_LIMIT + 15 }, (_, i) => ({
      tag: `tag${String(i).padStart(3, '0')}`,
      count: i,
    }));
    expect(waehleSchlagworte(viele, '')).toHaveLength(SCHLAGWORT_RENDER_LIMIT);
    expect(waehleSchlagworte(viele, '', 5)).toHaveLength(5);
  });

  it('vertraegt fehlende Angaben, statt zu werfen', () => {
    expect(waehleSchlagworte(null, '')).toEqual([]);
    expect(namen(waehleSchlagworte([{ tag: 'ohne-zahl' }, { tag: 'mit', count: 3 }], ''))).toEqual([
      'mit',
      'ohne-zahl',
    ]);
  });
});
