// 4T-002941 (Epic 3E-000452): Prüffälle des Schalters für das erschöpfte
// Zeitbudget des Zerlegers (test/zerlege-budget.js) und der Hilfe, die auf den
// vollständigen Syntax-Baum wartet (test/unit/renderer/syntax-baum-helfer.js).
//
// Der erste Teil ist die Positiv-Kontrolle der Messung (Stabilitätsregel 23):
// Mit eingeschaltetem Schalter ist der Syntax-Baum eines frisch angelegten
// Zustands nachweislich unvollständig. Ohne diesen Beleg sagte ein grüner
// Mess-Lauf nichts.
//
// Die Datei läuft auch in einem Mess-Lauf, in dem der Schalter schon über die
// Umgebung eingeschaltet ist; dann prüft sie den vorgefundenen Zustand und
// schaltet nichts ab.
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import {
  BUDGET_VARIABLE,
  BUDGET_ERSCHOEPFT,
  erschoepfe,
  installiereAusUmgebung,
  istErschoepft,
} from '../zerlege-budget.js';
import { zustandMitVollemBaum } from './renderer/syntax-baum-helfer.js';

// Zwölf Blöcke; der Zerleger nimmt je Schritt einen.
const DOK = Array.from({ length: 12 }, (_, i) => `## Abschnitt ${i + 1}\n\nAbsatz ${i + 1}.`).join(
  '\n\n',
);
const neuerZustand = () => EditorState.create({ doc: DOK, extensions: [markdown()] });
const ueberschriften = (state) => {
  let zahl = 0;
  syntaxTree(state).iterate({
    enter(knoten) {
      if (knoten.name === 'ATXHeading2') zahl++;
    },
  });
  return zahl;
};

const vorgefunden = istErschoepft();
let zurueck = null;
afterEach(() => {
  if (zurueck) zurueck();
  zurueck = null;
});

describe('Schalter: erschöpftes Zeitbudget des Zerlegers', () => {
  it('Positiv-Kontrolle: mit dem Schalter ist der Baum eines frischen Zustands unvollständig', () => {
    zurueck = erschoepfe();
    expect(istErschoepft()).toBe(true);
    const state = neuerZustand();
    expect(syntaxTreeAvailable(state, state.doc.length)).toBe(false);
    expect(syntaxTree(state).length).toBeLessThan(state.doc.length);
    expect(ueberschriften(state)).toBeLessThan(12);
  });

  it('ausdrückliches Warten arbeitet mit der echten Uhr und wird in einem Aufruf fertig', () => {
    zurueck = erschoepfe();
    const state = neuerZustand();
    const baum = ensureSyntaxTree(state, state.doc.length, 5000);
    expect(baum).not.toBeNull();
    expect(baum.length).toBe(state.doc.length);
  });

  it('nach dem Abschalten zerlegt ein frischer Zustand wieder ganz', () => {
    const ab = erschoepfe();
    ab();
    if (vorgefunden) {
      // Mess-Lauf: Der Schalter der Umgebung bleibt, das eigene Einschalten
      // war ohne Wirkung.
      expect(istErschoepft()).toBe(true);
      return;
    }
    expect(istErschoepft()).toBe(false);
    const state = neuerZustand();
    expect(syntaxTreeAvailable(state, state.doc.length)).toBe(true);
    expect(ueberschriften(state)).toBe(12);
  });

  it('ein zweites Einschalten ändert nichts, und sein Abschalten lässt das erste stehen', () => {
    zurueck = erschoepfe();
    const uhr = Date.now;
    const zweites = erschoepfe();
    expect(Date.now).toBe(uhr);
    zweites();
    expect(istErschoepft()).toBe(true);
  });

  it('andere Aufrufer sehen die echte Uhr', () => {
    zurueck = erschoepfe();
    const a = Date.now();
    const b = Date.now();
    expect(b - a).toBeLessThan(500);
  });
});

describe('Schalter aus der Umgebung', () => {
  const ziel = () => ({ Date: { now: () => 0 } });

  it('ohne Angabe und mit leerer Angabe bleibt alles unverändert', () => {
    const z = ziel();
    expect(installiereAusUmgebung({}, z)).toBe(false);
    expect(installiereAusUmgebung({ [BUDGET_VARIABLE]: '' }, z)).toBe(false);
    expect(istErschoepft(z)).toBe(false);
  });

  it('die Angabe «erschoepft» schaltet ein', () => {
    const z = ziel();
    expect(installiereAusUmgebung({ [BUDGET_VARIABLE]: BUDGET_ERSCHOEPFT }, z)).toBe(true);
    expect(istErschoepft(z)).toBe(true);
  });

  it('eine unbekannte Angabe bricht ab, statt still mit vollem Budget zu laufen', () => {
    expect(() => installiereAusUmgebung({ [BUDGET_VARIABLE]: 'ja' }, ziel())).toThrow(
      /keine bekannte Angabe/,
    );
  });
});

describe('Hilfe für einen Zustand ohne Ansicht', () => {
  it('liefert bei erschöpftem Budget einen Zustand, dessen Baum das Programm vollständig liest', () => {
    zurueck = erschoepfe();
    const state = neuerZustand();
    expect(ueberschriften(state)).toBeLessThan(12);
    // Das bisherige Muster: zu Ende zerlegen, den Zustand weiterverwenden.
    // Der Zustand behält dabei den unvollständigen Baum seiner Anlage.
    expect(ensureSyntaxTree(state, state.doc.length, 5000)).not.toBeNull();
    expect(ueberschriften(state)).toBeLessThan(12);
    // Die Hilfe liefert einen neuen Zustand mit dem vollständigen Baum.
    const voll = zustandMitVollemBaum(state);
    expect(voll).not.toBe(state);
    expect(ueberschriften(voll)).toBe(12);
    expect(voll.doc.toString()).toBe(DOK);
  });

  it('ein Zustand ohne Sprache kommt unverändert zurück', () => {
    const state = EditorState.create({ doc: DOK });
    expect(zustandMitVollemBaum(state)).toBe(state);
  });
});
