// @vitest-environment jsdom
// 4T-001862 und 4T-001977 (Epic 3E-000301): die eigene Eingabetaste in Listen
// (`runListEnter` in src/renderer/modules/editor/editor-list-enter.js).
// 4T-001862: Der neue Punkt entsteht auf der Ebene der folgenden Unterpunkte
// (Fälle 1 bis 7, 10 und 11 der Fall-Tabelle des Tasks). 4T-001977: In einer
// nummerierten Aufgaben-Liste setzt die Eingabetaste das Kästchen fort (G-Fälle
// der Messung) und rückt ein leerer nummerierter Aufgaben-Punkt auf einer
// Unterebene aus (Fall 9). Jeder Fall nennt seine Task-Nummer.
//
// Gemessen an einer echten EditorView mit den Belegungen der Anwendung: der
// Haupt-Editor über `createEditorState`, das Notiz-Feld über
// `createNotesEditorState` (beide aus editor.js). Der Tastendruck läuft über
// `runScopeHandlers`, also über dieselbe Tastenbelegung wie ein echter
// Tastendruck; geprüft werden Dokument-Text und Schreibmarke danach. Muster:
// listen-zeilenumbruch.test.js. Die «Heute»-Werte der Fälle stammen aus der
// Messung am gebauten Programm (Tests/3E-000301/Messung/00-ergebnis.md,
// Gruppen E, F und G); die Ablauf-Fälle LE-01 ff. prüfen dieselben Eingaben in
// Quellcode- und Live-Ansicht (test/e2e/funktionen/listen-eingabetaste.spec.js).
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import './api-stub.js';

const { EditorView, runScopeHandlers } = await import('@codemirror/view');
const { ensureSyntaxTree } = await import('@codemirror/language');
const { undo, insertNewlineAndIndent } = await import('@codemirror/commands');
const { insertNewlineContinueMarkup } = await import('@codemirror/lang-markdown');
const { createEditorState, createNotesEditorState } =
  await import('../../../src/renderer/modules/editor/editor.js');
const { runListEnter } = await import('../../../src/renderer/modules/editor/editor-list-enter.js');
const { handleTableEnter } = await import('../../../src/renderer/modules/editor/editor-keymaps.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

const offen = [];

// Echte View mit Dokument und Schreibmarke; `marke` als [Zeile, Spalte]
// (Zeile 1-basiert, Spalte 0-basiert), ohne Angabe am Dokument-Ende.
function ansicht(doc, { marke, notiz = false, lesen = false } = {}) {
  const state = notiz
    ? createNotesEditorState({ content: doc })
    : createEditorState({ content: doc, readOnly: lesen });
  const view = new EditorView({ state, parent: document.body });
  offen.push(view);
  let pos = doc.length;
  if (Array.isArray(marke)) pos = view.state.doc.line(marke[0]).from + marke[1];
  view.dispatch({ selection: { anchor: pos } });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  return view;
}

function eingabe(view) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  return runScopeHandlers(view, event, 'editor');
}

const text = (view) => view.state.doc.toString();
const marke = (view) => {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return [line.number, head - line.from];
};

async function listenStruktur(an) {
  await lebenszyklus.applyExtensionsState(an ? [] : ['outliner'], { persist: false });
}

beforeEach(async () => {
  lebenszyklus.resetExtensionStateForTests();
  await listenStruktur(true);
});

afterEach(() => {
  while (offen.length) offen.pop().destroy();
});

// Fall-Tabelle von 4T-001862: [Kennung, Ausgangs-Dokument, Marke, Soll, Marke danach].
const FALL_TABELLE = [
  [
    '4T-001862 Fall 1: nummerierte Aufgabe über nummerierter Aufgabe',
    '1. [ ] a\n   1. [ ] b',
    [1, 8],
    '1. [ ] a\n   1. [ ] \n   2. [ ] b',
    [2, 10],
  ],
  [
    '4T-001862 Fall 2: Unterpunkte ohne Kästchen — der neue auch ohne',
    '1. [ ] a\n   1. b',
    [1, 8],
    '1. [ ] a\n   1. \n   2. b',
    [2, 6],
  ],
  [
    '4T-001862 Fall 3: Unterpunkte mit Kästchen — der neue mit leerem Kästchen',
    '1. a\n   1. [ ] b',
    [1, 4],
    '1. a\n   1. [ ] \n   2. [ ] b',
    [2, 10],
  ],
  [
    '4T-001862 Fall 4: Aufzählungs-Unterpunkte unter nummerierter Aufgabe',
    '1. [ ] a\n   - b',
    [1, 8],
    '1. [ ] a\n   - \n   - b',
    [2, 5],
  ],
  [
    '4T-001862 Fall 5: nummerierte Unterpunkte unter Aufzählungs-Aufgabe',
    '- [ ] a\n  1. b',
    [1, 7],
    '- [ ] a\n  1. \n  2. b',
    [2, 5],
  ],
  [
    '4T-001862 Fall 6: erledigtes Kästchen wird nie übernommen',
    '1. [x] a\n   1. [x] b',
    [1, 8],
    '1. [x] a\n   1. [ ] \n   2. [x] b',
    [2, 10],
  ],
  [
    '4T-001862 Fall 7: mitten im Text — der Rest wird der erste Unterpunkt',
    '1. [ ] ab\n   1. [ ] c',
    [1, 8],
    '1. [ ] a\n   1. [ ] b\n   2. [ ] c',
    [2, 10],
  ],
  [
    '4T-001862 Fall 10: Ende einer Folgezeile mit folgendem Unterpunkt',
    '- Anschrift\\\n  Hauptstraße 1\n  - Klingel defekt',
    [2, 15],
    '- Anschrift\\\n  Hauptstraße 1\n  - \n  - Klingel defekt',
    [3, 4],
  ],
  [
    '4T-001862 Fall 10: Ende einer Folgezeile ohne Unterpunkt — Ebene des Punkts',
    '- Anschrift\\\n  Hauptstraße 1',
    [2, 15],
    '- Anschrift\\\n  Hauptstraße 1\n- ',
    [3, 2],
  ],
  [
    '4T-001862 Fall 11: Ende der ersten Zeile mit Folgezeile — wie heute',
    '- Anschrift\n  Hauptstraße 1\n- Telefon',
    [1, 11],
    '- Anschrift\n- \n  Hauptstraße 1\n- Telefon',
    [2, 2],
  ],
  [
    '4T-001862 Fall 11, Zusatz: der Rückstrich am Ende der ersten Zeile fällt weg',
    '- Anschrift\\\n  Hauptstraße 1\n- Telefon',
    [1, 12],
    '- Anschrift\n- \n  Hauptstraße 1\n- Telefon',
    [2, 2],
  ],
];

describe('4T-001862: Fall-Tabelle (AK1 bis AK3, AK11 bis AK14)', () => {
  for (const [name, doc, vorher, soll, nachher] of FALL_TABELLE) {
    it(name, () => {
      const view = ansicht(doc, { marke: vorher });
      expect(eingabe(view)).toBe(true);
      expect(text(view)).toBe(soll);
      expect(marke(view)).toEqual(nachher);
    });
  }

  it('4T-001862 Fall 8: leerer Punkt — Listen-Ausstieg unverändert (mit «Listen-Struktur»)', () => {
    const view = ansicht('1. [ ] \n   1. b', { marke: [1, 7] });
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('\n   1. b');
  });

  it('4T-001862 Fall 8: leerer Punkt — ohne «Listen-Struktur» wie heute', async () => {
    await listenStruktur(false);
    const view = ansicht('1. [ ] \n   1. b', { marke: [1, 7] });
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('1. [ ]\n2. \n   1. b');
  });

  it('4T-001862: Unterpunkte mit Folgezeile dazwischen zählen weiter (AK3)', () => {
    const view = ansicht('1. a\n   1. b\\\n      mehr b\n   2. c\n2. d', { marke: [1, 4] });
    eingabe(view);
    expect(text(view)).toBe('1. a\n   1. \n   2. b\\\n      mehr b\n   3. c\n2. d');
  });

  it('4T-001862: Unterpunkte mit Trenner `)` zählen weiter', () => {
    const view = ansicht('- a\n  1) b\n  2) c', { marke: [1, 3] });
    eingabe(view);
    expect(text(view)).toBe('- a\n  1) \n  2) b\n  3) c');
  });

  it('4T-001862: zweite Verschachtelungs-Ebene (AK2)', () => {
    const view = ansicht('- a\n  - b\n    - c', { marke: [2, 5] });
    eingabe(view);
    expect(text(view)).toBe('- a\n  - b\n    - \n    - c');
  });

  it('4T-001862: Schreibmarke am Anfang des Texts — der ganze Text wird Unterpunkt', () => {
    const view = ansicht('1. [ ] ab\n   1. [ ] c', { marke: [1, 7] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ]\n   1. [ ] ab\n   2. [ ] c');
  });

  it('4T-001862 Fall 10: nummerierter Punkt ohne Unterpunkt — nächste Nummer, leeres Kästchen', () => {
    const view = ansicht('1. [x] a\\\n   b\n2. c', { marke: [2, 4] });
    eingabe(view);
    expect(text(view)).toBe('1. [x] a\\\n   b\n2. [ ] \n3. c');
  });

  it('4T-001862 Fall 10: ein Rückstrich am Ende der Folgezeile fällt weg', () => {
    const view = ansicht('- a\\\n  b\\\n  c', { marke: [2, 4] });
    eingabe(view);
    expect(text(view)).toBe('- a\\\n  b\n- \n  c');
  });

  it('4T-001862 Fall 10: mitten in der Folgezeile wie heute', () => {
    const view = ansicht('- a\\\n  bc', { marke: [2, 3] });
    expect(runListEnter(view)).toBe(false);
  });

  it('4T-001862 Fall 11, Zusatz: ein Rückgängig-Schritt stellt den Rückstrich wieder her', () => {
    const doc = '- Anschrift\\\n  Hauptstraße 1\n- Telefon';
    const view = ansicht(doc, { marke: [1, 12] });
    eingabe(view);
    undo(view);
    expect(text(view)).toBe(doc);
  });

  // Zusammentreffen von Fall 11 und Fall 1, von der Fall-Tabelle nicht
  // entschieden: E20 gilt als engere Regel (Festlegung im Modul-Kopf, im
  // Bericht als offene Frage gemeldet).
  it('4T-001862: erste Zeile mit Folgezeile und Unterpunkten — wie heute (E20)', () => {
    const view = ansicht('- a\n  Folge\n  - b', { marke: [1, 3] });
    expect(runListEnter(view)).toBe(false);
  });

  it('4T-001862: folgen keine Unterpunkte, bleibt es bei der Fortsetzung (AK4)', () => {
    const view = ansicht('1. a\n2. b', { marke: [1, 4] });
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('1. a\n2. \n3. b');
  });

  it('4T-001862: ein Rückgängig-Schritt nimmt Punkt und Nummern-Nachzug zurück', () => {
    const doc = '1. [ ] a\n   1. [ ] b\n   2. [ ] c';
    const view = ansicht(doc, { marke: [1, 8] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n   1. [ ] \n   2. [ ] b\n   3. [ ] c');
    undo(view);
    expect(text(view)).toBe(doc);
  });
});

describe('4T-001977: nummerierte Aufgaben-Liste (AK2 bis AK8)', () => {
  const G_FAELLE = [
    ['G1: offenes Kästchen (AK2)', '1. [ ] a', '1. [ ] a\n2. [ ] ', [2, 7]],
    ['G2: erledigtes Kästchen wird offen (AK3)', '1. [x] a', '1. [x] a\n2. [ ] ', [2, 7]],
    ['G2: erledigtes Kästchen mit großem X (AK3)', '1. [X] a', '1. [X] a\n2. [ ] ', [2, 7]],
    ['G3: Trenner `)` (AK6)', '1) [ ] a', '1) [ ] a\n2) [ ] ', [2, 7]],
    ['G4: ohne Kästchen bleibt ohne (AK4)', '1. a', '1. a\n2. ', [2, 3]],
    [
      'G5: eingerückte Ebene (AK7)',
      '1. [ ] a\n   1. [ ] b',
      '1. [ ] a\n   1. [ ] b\n   2. [ ] ',
      [3, 10],
    ],
  ];
  for (const [name, doc, soll, nachher] of G_FAELLE) {
    it(`4T-001977 ${name}`, () => {
      const view = ansicht(doc);
      expect(eingabe(view)).toBe(true);
      expect(text(view)).toBe(soll);
      expect(marke(view)).toEqual(nachher);
    });
  }

  it('4T-001977: Folge-Nummern und ein Rückgängig-Schritt (AK8)', () => {
    const doc = '1. [ ] a\n2. [ ] b';
    const view = ansicht(doc, { marke: [1, 8] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n2. [ ] \n3. [ ] b');
    undo(view);
    expect(text(view)).toBe(doc);
  });

  // Lockere Liste (Leerzeile zwischen den Punkten): Leerzeile und Nummer sind
  // Sache der eingekauften Fortsetzung und des Nummerierungs-Filters (E12);
  // das Kästchen kommt dazu. Beobachtet im Ablauf-Fall LE-02 vom 2026-10-07.
  it('4T-001977: lockere Liste — Kästchen dazu, alles Übrige wie die Fortsetzung', () => {
    const mitKaestchen = ansicht('1. [ ] a\n\n1. [ ] b');
    eingabe(mitKaestchen);
    const ohneKaestchen = ansicht('1. [ ] a\n\n1. b');
    eingabe(ohneKaestchen);
    const erwartet = text(ohneKaestchen).replace('1. b', '1. [ ] b') + '[ ] ';
    expect(text(mitKaestchen)).toBe(erwartet);
  });

  it('4T-001977: mitten im Text wie heute, ohne Kästchen', () => {
    const view = ansicht('1. [ ] ab', { marke: [1, 8] });
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n2. b');
  });

  it('4T-001977 mit 4T-001862 Fall 11: Kästchen und Rückstrich in einer Transaktion', () => {
    const doc = '1. [ ] a\\\n   b';
    const view = ansicht(doc, { marke: [1, 9] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n2. [ ] \n   b');
    undo(view);
    expect(text(view)).toBe(doc);
  });

  it('4T-001977 mit 4T-001862 Fall 1: es gilt der erste Unterpunkt', () => {
    const view = ansicht('1. [ ] a\n   1. b', { marke: [1, 8] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n   1. \n   2. b');
  });

  it('4T-001977: Aufzählungs-Aufgabe bleibt bei der eingekauften Fortsetzung (AK9)', () => {
    const view = ansicht('- [x] a');
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('- [x] a\n- [ ] ');
  });
});

describe('4T-001977 Fall 9: leerer nummerierter Aufgaben-Punkt auf einer Unterebene (AK5)', () => {
  it('rückt aus und setzt die Nummer der Eltern-Ebene fort', () => {
    const view = ansicht('1. [ ] Umzug\n   1. [ ] ');
    expect(eingabe(view)).toBe(true);
    expect(text(view)).toBe('1. [ ] Umzug\n2. [ ] ');
    expect(marke(view)).toEqual([2, 7]);
  });

  it('Geschwister dahinter beginnen bei 1, die Eltern-Ebene zählt weiter', () => {
    const view = ansicht('1. [ ] Umzug\n   1. [ ] \n   2. [ ] c\n2. [ ] Packen', {
      marke: [2, 10],
    });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] Umzug\n2. [ ] \n   1. [ ] c\n3. [ ] Packen');
  });

  it('Eltern-Ebene mit Trenner `)`', () => {
    const view = ansicht('1) [ ] Umzug\n   1. [ ] ');
    eingabe(view);
    expect(text(view)).toBe('1) [ ] Umzug\n2) [ ] ');
  });

  it('Eltern-Ebene ohne Aufgaben: ohne Kästchen', () => {
    const view = ansicht('1. Umzug\n   1. [ ] ');
    eingabe(view);
    expect(text(view)).toBe('1. Umzug\n2. ');
  });

  it('Eltern-Ebene als Aufzählungs-Aufgabe', () => {
    const view = ansicht('- [ ] Umzug\n  1) [x] ');
    eingabe(view);
    expect(text(view)).toBe('- [ ] Umzug\n- [ ] ');
  });

  it('auch ohne Leerzeichen hinter dem Kästchen', () => {
    const view = ansicht('1. [ ] Umzug\n   1. [ ]');
    eingabe(view);
    expect(text(view)).toBe('1. [ ] Umzug\n2. [ ] ');
  });

  it('ein Rückgängig-Schritt', () => {
    const doc = '1. [ ] Umzug\n   1. [ ] ';
    const view = ansicht(doc);
    eingabe(view);
    undo(view);
    expect(text(view)).toBe(doc);
  });

  it('oberste Ebene mit «Listen-Struktur»: Listen-Ausstieg', () => {
    const view = ansicht('1. [ ] a\n2. [ ] ');
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n');
  });

  it('oberste Ebene ohne «Listen-Struktur»: wie heute', async () => {
    await listenStruktur(false);
    const view = ansicht('1. [ ] ');
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('1. [ ]\n2. ');
  });
});

describe('4T-001862 und 4T-001977: wo die eigene Eingabetaste nicht greift (AK6, AK9)', () => {
  it('Tabellen-Zeile: dieselbe Wirkung wie die Tabellen-Belegung allein', () => {
    const doc = '| a | b |\n|---|---|\n| x | y |';
    const view = ansicht(doc);
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    const vergleich = ansicht(doc);
    handleTableEnter(vergleich);
    expect(text(view)).toBe(text(vergleich));
  });

  it('Tabellen-Zeile in einem Listenpunkt: die eigene Behandlung lehnt ab', () => {
    const view = ansicht('- a\n\n  | x | y |\n  |---|---|\n  | 1 | 2 |', { marke: [5, 11] });
    expect(runListEnter(view)).toBe(false);
  });

  it('Code-Zeile: die eigene Behandlung lehnt ab, das Dokument bleibt', () => {
    const doc = '```\n- a\n  - b\n```';
    const view = ansicht(doc, { marke: [2, 3] });
    expect(runListEnter(view)).toBe(false);
    expect(text(view)).toBe(doc);
  });

  it('Fließtext: die eigene Behandlung lehnt ab', () => {
    const view = ansicht('Ein Absatz\n  eingerückt');
    expect(runListEnter(view)).toBe(false);
  });

  it('Schreibschutz: keine Wirkung', () => {
    const doc = '1. [ ] a\n   1. [ ] b';
    const view = ansicht(doc, { marke: [1, 8], lesen: true });
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe(doc);
  });

  it('Auswahl: keine Wirkung', () => {
    const view = ansicht('1. [ ] a\n   1. [ ] b');
    view.dispatch({ selection: { anchor: 7, head: 8 } });
    expect(runListEnter(view)).toBe(false);
  });

  it('leerer Punkt der obersten Ebene mit «Listen-Struktur»: Listen-Ausstieg', () => {
    const view = ansicht('- a\n- ');
    eingabe(view);
    expect(text(view)).toBe('- a\n');
  });

  it('leerer Punkt der obersten Ebene ohne «Listen-Struktur»: wie heute', async () => {
    await listenStruktur(false);
    const view = ansicht('- a\n- ');
    expect(runListEnter(view)).toBe(false);
    eingabe(view);
    expect(text(view)).toBe('- a\n\n- ');
  });

  it('Eingabetaste in einer Code-Zeile läuft wie die eingekaufte Belegung', () => {
    const doc = '```\n- a\n```';
    const view = ansicht(doc, { marke: [2, 3] });
    const vergleich = ansicht(doc, { marke: [2, 3] });
    eingabe(view);
    if (!insertNewlineContinueMarkup(vergleich)) insertNewlineAndIndent(vergleich);
    expect(text(view)).toBe(text(vergleich));
  });
});

describe('4T-001862 und 4T-001977: ohne «Listen-Struktur» (AK15 bzw. AK11)', () => {
  beforeEach(async () => {
    await listenStruktur(false);
  });

  it('4T-001862 Fall 1: Unterpunkt und Nummern-Nachzug ohne den Nummerierungs-Filter', () => {
    const view = ansicht('1. [ ] a\n   1. [ ] b\n   2. [ ] c', { marke: [1, 8] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n   1. [ ] \n   2. [ ] b\n   3. [ ] c');
  });

  it('4T-001977 G1: Kästchen und Folge-Nummer', () => {
    const view = ansicht('1. [ ] a\n2. [ ] b', { marke: [1, 8] });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n2. [ ] \n3. [ ] b');
  });
});

describe('4T-001862 und 4T-001977: Notiz-Feld (AK16 bzw. AK11)', () => {
  it('4T-001862 Fall 1 wie im Haupt-Editor', () => {
    const view = ansicht('1. [ ] a\n   1. [ ] b', { marke: [1, 8], notiz: true });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n   1. [ ] \n   2. [ ] b');
  });

  it('4T-001977 G1 wie im Haupt-Editor', () => {
    const view = ansicht('1. [ ] a', { notiz: true });
    eingabe(view);
    expect(text(view)).toBe('1. [ ] a\n2. [ ] ');
  });

  it('4T-001862: Listen-Ausstieg ist eingehängt (E24)', () => {
    const view = ansicht('- a\n- ', { notiz: true });
    eingabe(view);
    expect(text(view)).toBe('- a\n');
  });
});
