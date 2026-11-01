// 4T-001922 (Epic 3E-000371): Wert-Syntax der Kalender im Dokument
// (src/shared/calendar/calendar-value-syntax.js) — die Erkennung an einer
// festen Stelle, die die Inline-Regel der Lese-Ansicht und der portablen
// Ansicht nutzt, gegen den Scanner findCalendarValues (Live-Ansicht,
// Epochen-Sicherung, Dialoge).
//
// Rot-Probe: Vor der Behebung prüfte die Inline-Regel allein `@` und `{` an
// ihrer Position und las in `@@{14:00}`, der Uhrzeit einer Kanban-Karte, das
// innere `@{14:00}` als Wert «00» eines Kalenders «14»; eine Erkennung an
// einer Stelle gab es im Modul nicht.
import { describe, it, expect } from 'vitest';
import {
  findCalendarValues,
  matchCalendarValueAt,
  parseCalendarValueRaw,
} from '../../src/shared/calendar/calendar-value-syntax.js';

// Alle Stellen, an denen die Erkennung an einer festen Stelle einen Wert meldet.
function treffer(text) {
  const out = [];
  for (let pos = 0; pos < text.length; pos++) {
    const m = matchCalendarValueAt(text, pos);
    if (m) out.push(m);
  }
  return out;
}

describe('matchCalendarValueAt: Erkennung an einer festen Stelle', () => {
  it('meldet einen Wert in der Form von findCalendarValues', () => {
    const text = 'Termin @{Termine: 2026-10-01} heute';
    expect(matchCalendarValueAt(text, 7)).toEqual({
      from: 7,
      to: 29,
      raw: '@{Termine: 2026-10-01}',
      name: 'Termine',
      value: '2026-10-01',
    });
  });

  it('meldet nichts neben der Stelle', () => {
    const text = 'Termin @{Termine: 2026-10-01}';
    expect(matchCalendarValueAt(text, 6)).toBeNull();
    expect(matchCalendarValueAt(text, 8)).toBeNull();
  });

  it('liest in @@{14:00} keinen Kalender-Wert (Sperre des gemeinsamen Ausdrucks)', () => {
    const text = 'Karte @@{14:00}';
    expect(matchCalendarValueAt(text, 6)).toBeNull();
    expect(matchCalendarValueAt(text, 7)).toBeNull();
    expect(treffer(text)).toEqual([]);
  });

  it('liest einen Kalender-Wert neben einer Karten-Uhrzeit unverändert', () => {
    const text = 'Termin @{Termine: 2026-10-01} @@{14:00}';
    const gefunden = treffer(text);
    expect(gefunden).toHaveLength(1);
    expect(gefunden[0]).toMatchObject({ from: 7, name: 'Termine', value: '2026-10-01' });
  });

  it('meldet nichts, wenn die Form nicht passt', () => {
    for (const text of ['@{ohne Doppelpunkt}', '@{}', '@{Name: }', '@{: Wert}', '@{a: {b}}']) {
      expect(matchCalendarValueAt(text, 0)).toBeNull();
    }
    expect(matchCalendarValueAt('@{Name: 1\n2}', 0)).toBeNull();
    expect(matchCalendarValueAt('@{Name: 1', 0)).toBeNull();
    expect(matchCalendarValueAt('', 0)).toBeNull();
    expect(matchCalendarValueAt(null, 0)).toBeNull();
  });

  it('hängt nicht vom Zustand eines vorangehenden Laufs ab', () => {
    const text = 'a @{X: 1} b @{Y: 2}';
    expect(findCalendarValues(text)).toHaveLength(2);
    expect(matchCalendarValueAt(text, 12)).toMatchObject({ name: 'Y', value: '2' });
    expect(matchCalendarValueAt(text, 2)).toMatchObject({ name: 'X', value: '1' });
    expect(findCalendarValues(text)).toHaveLength(2);
  });
});

describe('Lese-Ansicht und Scanner tragen dieselbe Regel', () => {
  const texte = [
    'Karte @@{14:00}',
    'Termin @{Termine: 2026-10-01} @@{14:00}',
    '@{A: 1}@{B: 2}',
    'x@@@{C: 3} y @{D: 4}',
    'Kaputt @{2026-13-40}',
    'Zwei @{E: 5} und @{F: 6}.',
  ];
  for (const text of texte) {
    it(`gleiche Treffer für ${JSON.stringify(text)}`, () => {
      expect(treffer(text)).toEqual(findCalendarValues(text));
    });
  }

  it('zerlegt mit derselben Funktion wie der Scanner', () => {
    const m = matchCalendarValueAt('@{ Dreimond :  1-2-13 }', 0);
    expect(m).toMatchObject(parseCalendarValueRaw('@{ Dreimond :  1-2-13 }'));
  });
});
