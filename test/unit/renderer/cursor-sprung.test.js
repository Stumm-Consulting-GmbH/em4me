// @vitest-environment jsdom
// 4T-001575 (Epic 3E-000282): Prüffälle des Cursor-Sprungs hinter den
// Listen-Marker — AK1, AK2, AK4, AK5 und die Grenzen des Handlers.
//
// 4T-001576 (Epic 3E-000282): dazu die Einstellung — der Vorgabewert «an»
// (AK2 jenes Tasks) und die Wirkung des ausgeschalteten Schalters (AK3). Die
// Oberfläche des Schalters prüft E2E (einstellungen-seite.spec.js, ES-16).
//
// Zwei Ebenen, wie im Bestand der Listen-Werkzeuge: Die Spalten-Rechnung ist
// eine reine Text-Funktion und wird als solche geprüft; der Handler läuft
// gegen einen echten `EditorState` (Muster listen-nummerierung.test.js) mit
// einer Attrappe für `dispatch` (Muster canvas-einfuegen.test.js). Eine echte
// `EditorView` zöge den halben Renderer nach und ist für die Frage, welche
// Transaktion entsteht, nicht nötig.
//
// **Was hier bewusst NICHT geprüft wird:** die Wirkung der Tastendrücke selbst
// (AK3 Pfeil links, AK7 Umschalt+Pfeil rechts). Beide hängen an den
// eingekauften Kommandos `cursorCharLeft`/`selectCharRight`, und die brauchen
// die Geometrie einer echten View. Ihr Nachweis liegt in
// test/e2e/funktionen/bearbeitung-und-ansicht.spec.js (FB-18).
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

// Die reine Spalten-Rechnung liegt in einem eigenen Modul ohne
// Renderer-Importe; Handler und Schalter-Naht in der Tastenbelegung.
const { schreibSpalte } =
  await import('../../../src/renderer/modules/editor/editor-cursor-sprung.js');
const { cursorSprungRechts, istCursorSprungAktiv } =
  await import('../../../src/renderer/modules/editor/editor-keymaps.js');
// 4T-001576: Der Schalter lebt im Fenster-Zustand; die Naht liest ihn dort.
const { state: fensterZustand } = await import('../../../src/renderer/modules/app/app-state.js');

// Zustand mit Markdown-Sprache und vollständig geparstem Baum; der
// Code-Block-Test des Handlers liest ihn.
function stateFor(doc) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [LezerTable] })],
  });
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter */
  }
  return state;
}

// Attrappe der EditorView: der Handler liest `state` und ruft `dispatch`.
function attrappe(doc, cursor) {
  const state = stateFor(doc);
  const transaktionen = [];
  const view = {
    state: state.update({ selection: { anchor: cursor } }).state,
    dispatch: (tr) => transaktionen.push(tr),
  };
  return { view, transaktionen };
}

// Cursor an das Ende der Zeile mit der Nummer `zeile` (1-basiert).
function amZeilenende(doc, zeile) {
  const state = stateFor(doc);
  return attrappe(doc, state.doc.line(zeile).to);
}

// Führt den Handler am Zeilenende von `zeile` aus und liefert die Spalte, an
// der die Marke danach steht — oder null, wenn der Handler abgelehnt hat.
function sprungSpalte(doc, zeile) {
  const { view, transaktionen } = amZeilenende(doc, zeile);
  const genutzt = cursorSprungRechts(view);
  if (!genutzt) return null;
  expect(transaktionen).toHaveLength(1);
  const ziel = transaktionen[0].selection.anchor;
  const naechste = view.state.doc.line(zeile + 1);
  expect(ziel).toBeGreaterThanOrEqual(naechste.from);
  expect(ziel).toBeLessThanOrEqual(naechste.to);
  return ziel - naechste.from;
}

describe('Schreibposition einer Listenzeile (schreibSpalte)', () => {
  it('AK1: hinter Marker und Leerzeichen einer Aufzählung', () => {
    expect(schreibSpalte('- Beta')).toBe(2);
    expect(schreibSpalte('* Beta')).toBe(2);
    expect(schreibSpalte('+ Beta')).toBe(2);
  });

  it('AK1: hinter der Einrückung einer eingerückten Aufzählung', () => {
    expect(schreibSpalte('  - Beta')).toBe(4);
    expect(schreibSpalte('    * Beta')).toBe(6);
  });

  it('AK1: hinter dem Marker einer nummerierten Liste, auch mehrstellig', () => {
    expect(schreibSpalte('1. Delta')).toBe(3);
    expect(schreibSpalte('10. Delta')).toBe(4);
    expect(schreibSpalte('   3. Delta')).toBe(6);
  });

  it('AK2: hinter dem Status-Kästchen einer Aufgaben-Zeile', () => {
    expect(schreibSpalte('- [ ] Aufgabe')).toBe(6);
    expect(schreibSpalte('- [x] Aufgabe')).toBe(6);
    expect(schreibSpalte('1. [ ] Aufgabe')).toBe(7);
    expect(schreibSpalte('  - [ ] Aufgabe')).toBe(8);
  });

  it('AK2: erweiterte Status-Zeichen zählen genauso', () => {
    // 4S-000352: das Zeichen in der Klammer ist offen; die Spalte darf nicht
    // an der Menge der aktivierten Status hängen.
    expect(schreibSpalte('- [/] Aufgabe')).toBe(6);
    expect(schreibSpalte('- [?] Aufgabe')).toBe(6);
    expect(schreibSpalte('- [-] Aufgabe')).toBe(6);
  });

  it('AK2: mehrere Leerzeichen hinter dem Kästchen gehören dazu', () => {
    // Die Schreibposition ist die Stelle vor dem ersten Zeichen des Textes.
    expect(schreibSpalte('- [ ]   Aufgabe')).toBe(8);
  });

  it('AK4: keine Listenzeile liefert null', () => {
    expect(schreibSpalte('Fortsetzung ohne Marker')).toBeNull();
    expect(schreibSpalte('  eingerückte Fortsetzung')).toBeNull();
    expect(schreibSpalte('')).toBeNull();
    expect(schreibSpalte('# Überschrift')).toBeNull();
    // Klammer-Variante `1)` führt der Editor bewusst nicht als Listenzeile
    // (Bestands-Entscheidung aus 4T-000016).
    expect(schreibSpalte('1) Delta')).toBeNull();
    // Marker ohne folgendes Leerzeichen ist keine Listenzeile.
    expect(schreibSpalte('-Beta')).toBeNull();
  });

  it('AK5: bei der leeren Listenzeile ist die Schreibposition das Zeilenende', () => {
    expect(schreibSpalte('- ')).toBe(2);
    expect(schreibSpalte('  - ')).toBe(4);
    expect(schreibSpalte('1. ')).toBe(3);
    // Aufgaben-Zeile ohne Text: hinter dem Kästchen, also am Zeilenende.
    expect(schreibSpalte('- [ ]')).toBe(5);
  });

  it('ein Link-Text in Kästchen-Form ist kein Kästchen', () => {
    // `- [x](ziel)` ist ein Link, kein Status-Kästchen; die Marke bleibt vor
    // der Klammer, damit der Link-Text erreichbar ist.
    expect(schreibSpalte('- [x](ziel)')).toBe(2);
    expect(schreibSpalte('- [[Wiki-Verweis]]')).toBe(2);
  });
});

describe('Cursor-Sprung der Pfeil-rechts-Taste (cursorSprungRechts)', () => {
  it('AK1: springt vom Zeilenende in die Schreibposition der Folgezeile', () => {
    expect(sprungSpalte('- Alpha\n- Beta\n', 1)).toBe(2);
    expect(sprungSpalte('- Alpha\n  - Beta\n', 1)).toBe(4);
    expect(sprungSpalte('Absatz\n1. Delta\n', 1)).toBe(3);
  });

  it('AK2: springt bei einer Aufgaben-Zeile hinter das Kästchen', () => {
    expect(sprungSpalte('- Alpha\n- [ ] Aufgabe\n', 1)).toBe(6);
    expect(sprungSpalte('- Alpha\n- [/] Aufgabe\n', 1)).toBe(6);
  });

  it('AK4: ohne Marker in der Folgezeile bleibt es beim Standard-Verhalten', () => {
    expect(sprungSpalte('- Alpha\nFortsetzung\n', 1)).toBeNull();
    expect(sprungSpalte('- Alpha\n  eingerückt\n', 1)).toBeNull();
    expect(sprungSpalte('- Alpha\n\n- Beta\n', 1)).toBeNull();
  });

  it('AK5: die leere Listenzeile braucht keinen Sonderfall', () => {
    expect(sprungSpalte('- Alpha\n- \n', 1)).toBe(2);
  });

  it('greift nicht mitten in der Zeile', () => {
    const { view, transaktionen } = attrappe('- Alpha\n- Beta\n', 3);
    expect(cursorSprungRechts(view)).toBe(false);
    expect(transaktionen).toHaveLength(0);
  });

  it('AK7: greift nicht bei einer Auswahl', () => {
    // Umschalt+Pfeil rechts erweitert die Auswahl; sobald etwas markiert ist,
    // lehnt der Handler ab und das zeichenweise Verhalten bleibt.
    const state = stateFor('- Alpha\n- Beta\n');
    const transaktionen = [];
    const view = {
      state: state.update({ selection: { anchor: 5, head: 7 } }).state,
      dispatch: (tr) => transaktionen.push(tr),
    };
    expect(cursorSprungRechts(view)).toBe(false);
    expect(transaktionen).toHaveLength(0);
  });

  it('greift nicht in der letzten Zeile des Dokuments', () => {
    const { view, transaktionen } = amZeilenende('- Alpha\n- Beta', 2);
    expect(cursorSprungRechts(view)).toBe(false);
    expect(transaktionen).toHaveLength(0);
  });

  it('greift nicht, wenn die Folgezeile in einem Code-Block liegt', () => {
    const doc = '# Titel\n\n```text\n- Im Code\n```\n';
    expect(sprungSpalte(doc, 3)).toBeNull();
  });

  it('Schalter-Naht: der Vorgabewert ist «an» (E5 des Epics)', () => {
    // 4T-001576, AK2: Die Vorgabe steht im Fenster-Zustand (app-state.js) und
    // gilt damit auch für ein Profil ohne den Store-Schlüssel — der Lade-Weg
    // (editor-eingabe-schalter.js) schaltet nur bei ausdrücklichem false ab.
    expect(fensterZustand.cursorSprung).toBe(true);
    expect(istCursorSprungAktiv()).toBe(true);
  });
});

describe('Einstellung des Cursor-Sprungs (4T-001576)', () => {
  it('AK3: ausgeschaltet lehnt der Handler ab, das Standard-Verhalten bleibt', () => {
    // Derselbe Fall, der eingeschaltet springt (Spalte 2), darf ausgeschaltet
    // keine Transaktion erzeugen: Der Tastendruck fällt an cursorCharRight
    // durch, und die Marke landet wie vor dem Epic am Zeilenanfang. Die
    // Wirkung der Taste selbst prüft E2E (FB-18).
    expect(sprungSpalte('- Alpha\n- Beta\n', 1)).toBe(2);
    fensterZustand.cursorSprung = false;
    try {
      expect(istCursorSprungAktiv()).toBe(false);
      const { view, transaktionen } = amZeilenende('- Alpha\n- Beta\n', 1);
      expect(cursorSprungRechts(view)).toBe(false);
      expect(transaktionen).toHaveLength(0);
    } finally {
      fensterZustand.cursorSprung = true;
    }
    // Wieder eingeschaltet greift derselbe Fall erneut — der Schalter wirkt
    // ohne Neuaufbau der Belegung (kein Compartment, Muster tabIndentKeymap).
    expect(sprungSpalte('- Alpha\n- Beta\n', 1)).toBe(2);
  });

  it('AK2/AK5: der Lade-Weg holt die drei Eingabe-Schalter aus dem Speicher', async () => {
    // 4T-001576: Die Schalter des Eingabe-Verhaltens laden gebündelt in
    // editor-eingabe-schalter.js (zuvor je eine Zeile in init()); das trägt
    // das Überdauern des Neustarts (AK5, am gebauten Programm AK5 manuell).
    // Nur ein ausdrückliches false schaltet ab — deshalb prüft der Fall beide
    // Richtungen und den ungesetzten Schlüssel.
    const { ladeEingabeSchalter } =
      await import('../../../src/renderer/modules/editor/editor-eingabe-schalter.js');
    const echt = window.api.getSetting;
    const vorher = {
      tabIndents: fensterZustand.tabIndents,
      cursorSprung: fensterZustand.cursorSprung,
      pasteUrlAsLink: fensterZustand.pasteUrlAsLink,
    };
    try {
      window.api.getSetting = async () => undefined;
      await ladeEingabeSchalter();
      expect(fensterZustand.cursorSprung).toBe(true);
      expect(fensterZustand.tabIndents).toBe(true);
      expect(fensterZustand.pasteUrlAsLink).toBe(true);

      window.api.getSetting = async (schluessel) =>
        schluessel === 'input.cursorSprung' ? false : true;
      await ladeEingabeSchalter();
      expect(fensterZustand.cursorSprung).toBe(false);
      expect(istCursorSprungAktiv()).toBe(false);
      // Die Nachbar-Schalter bleiben unberührt — der Umzug der beiden
      // Bestands-Zeilen aus init() ändert ihren Wert nicht.
      expect(fensterZustand.tabIndents).toBe(true);
      expect(fensterZustand.pasteUrlAsLink).toBe(true);

      window.api.getSetting = async () => true;
      await ladeEingabeSchalter();
      expect(fensterZustand.cursorSprung).toBe(true);
    } finally {
      window.api.getSetting = echt;
      Object.assign(fensterZustand, vorher);
    }
  });

  it('AK2: ein unbekannter Wert im Zustand bleibt «an»', () => {
    // Nur ein ausdrückliches false schaltet ab (`!== false`); undefined steht
    // für ein Profil, das den Schlüssel nie geschrieben hat.
    fensterZustand.cursorSprung = undefined;
    try {
      expect(istCursorSprungAktiv()).toBe(true);
    } finally {
      fensterZustand.cursorSprung = true;
    }
  });
});
