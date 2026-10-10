// @vitest-environment jsdom
// 4T-001716 (Epic 3E-000301): Zeilenumbruch innerhalb eines Listenpunkts —
// Kommando `list.lineBreak` (Vorgabe Umschalt+Eingabe), Aufräumen der leer
// gebliebenen Folgezeile und das Einrücken ohne «Listen-Struktur».
//
// Gemessen an einer echten EditorView mit den Belegungen der Anwendung: der
// Haupt-Editor über `createEditorState`, das Notiz-Feld über
// `createNotesEditorState` (beide aus editor.js). Ausgelöst wird der
// Tastendruck über `runScopeHandlers`, also über dieselbe Tastenbelegung, die
// ein echter Tastendruck im Editor durchläuft; geprüft wird der Dokument-Text
// danach. Muster der Bauart: listen-nummerierung.test.js (Zustand mit
// Markdown-Sprache, voll geparster Baum). Die Lage im Bild prüfen die
// Ablauf-Fälle ZU-02 ff. in test/e2e/funktionen/zeilenumbruch.spec.js.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import './api-stub.js';

const { EditorView, runScopeHandlers } = await import('@codemirror/view');
const { ensureSyntaxTree } = await import('@codemirror/language');
const { createEditorState, createNotesEditorState } =
  await import('../../../src/renderer/modules/editor/editor.js');
const { runListLineBreak, runListBreakEnterCleanup } =
  await import('../../../src/renderer/modules/editor/editor-list-enter.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { haengenderEinzug } = await import('../../../src/shared/haengender-einzug.js');

const offen = [];

// Echte View mit Dokument und Schreibmarke; `marke` ist eine Zeichen-Position
// oder, als Zahl-Paar [Zeile, Spalte], 1-basierte Zeile und 0-basierte Spalte.
// Ohne Angabe steht die Marke am Dokument-Ende.
function ansicht(doc, { marke, notiz = false, lesen = false } = {}) {
  const state = notiz
    ? createNotesEditorState({ content: doc })
    : createEditorState({ content: doc, readOnly: lesen });
  const view = new EditorView({ state, parent: document.body });
  offen.push(view);
  let pos = doc.length;
  if (Array.isArray(marke)) pos = view.state.doc.line(marke[0]).from + marke[1];
  else if (typeof marke === 'number') pos = marke;
  view.dispatch({ selection: { anchor: pos } });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  return view;
}

function taste(view, key, { shift = false } = {}) {
  const event = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true });
  return runScopeHandlers(view, event, 'editor');
}

const umbruch = (view) => taste(view, 'Enter', { shift: true });
const text = (view) => view.state.doc.toString();
const marke = (view) => {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return [line.number, head - line.from];
};

beforeEach(async () => {
  lebenszyklus.resetExtensionStateForTests();
  await lebenszyklus.applyExtensionsState([], { persist: false });
});

afterEach(() => {
  while (offen.length) offen.pop().destroy();
});

describe('Zeilenumbruch im Listenpunkt: jede Listen-Art (AK1, AK2, AK5)', () => {
  const faelle = [
    ['Aufzählung mit Strich', '- Text', '  '],
    ['Aufzählung mit Stern', '* Text', '  '],
    ['Aufzählung mit Plus', '+ Text', '  '],
    ['nummerierte Liste mit Punkt', '1. Text', '   '],
    ['nummerierte Liste mit Klammer', '1) Text', '   '],
    ['Aufgabe mit Kästchen', '- [ ] Text', '      '],
    ['erledigte Aufgabe', '- [x] Text', '      '],
    ['nummerierte Aufgabe', '1. [ ] Text', '       '],
    ['nummerierte Aufgabe mit Klammer', '1) [ ] Text', '       '],
  ];
  for (const [name, zeile, einzug] of faelle) {
    it(`${name}: Rückstrich, Zeilenwechsel, Einrückung bis zum Text`, () => {
      const view = ansicht(zeile);
      expect(umbruch(view)).toBe(true);
      expect(text(view)).toBe(`${zeile}\\\n${einzug}`);
      expect(marke(view)).toEqual([2, einzug.length]);
    });
  }

  it('legt keinen neuen Listenpunkt an', () => {
    const view = ansicht('- Text\n- zweiter', { marke: [1, 6] });
    umbruch(view);
    expect(text(view)).toBe('- Text\\\n  \n- zweiter');
  });
});

describe('Zeilenumbruch im Listenpunkt: Ebenen und Folgezeilen (AK6)', () => {
  it('zweite Ebene: Einrückung folgt dem Unterpunkt', () => {
    const view = ansicht('- A\n  - B');
    umbruch(view);
    expect(text(view)).toBe('- A\n  - B\\\n    ');
  });

  it('zweite Ebene einer nummerierten Liste', () => {
    const view = ansicht('1. A\n   1. B');
    umbruch(view);
    expect(text(view)).toBe('1. A\n   1. B\\\n      ');
  });

  it('auf einer Folgezeile gilt die Spalte ihres Punkts', () => {
    const view = ansicht('- [ ] A\\\n      zweite');
    umbruch(view);
    expect(text(view)).toBe('- [ ] A\\\n      zweite\\\n      ');
  });

  it('die Folgezeile eines Unterpunkts gehört zum Unterpunkt, nicht zum Elternpunkt', () => {
    const view = ansicht('- A\n  - B\\\n    zweite B');
    umbruch(view);
    expect(text(view)).toBe('- A\n  - B\\\n    zweite B\\\n    ');
  });
});

describe('Zeilenumbruch im Listenpunkt: Einzug der Folgezeile (AK2, AK14)', () => {
  for (const zeile of ['- [ ] Text', '1. [ ] Text', '1) [x] Text', '  1. Text', '- Text']) {
    it(`die Folgezeile beginnt dort, wo der Einzug den Text sieht: ${zeile}`, () => {
      const view = ansicht(zeile);
      umbruch(view);
      const folge = view.state.doc.line(2).text;
      expect(folge.trim()).toBe('');
      expect(folge.length).toBe(haengenderEinzug(zeile));
    });
  }
});

describe('Zeilenumbruch: Schreibmarke und Leerraum (AK20)', () => {
  it('kürzt Leerraum vor der Schreibmarke', () => {
    const view = ansicht('- Text   ');
    umbruch(view);
    expect(text(view)).toBe('- Text\\\n  ');
  });

  it('teilt die Zeile mitten im Text; der Rest wandert eingerückt in die Folgezeile', () => {
    const view = ansicht('- Hallo Welt', { marke: [1, 8] });
    umbruch(view);
    expect(text(view)).toBe('- Hallo\\\n  Welt');
    expect(marke(view)).toEqual([2, 2]);
  });

  it('mitten im Text einer Aufgabe', () => {
    const view = ansicht('1. [ ] Brot kaufen', { marke: [1, 12] });
    umbruch(view);
    expect(text(view)).toBe('1. [ ] Brot\\\n       kaufen');
  });

  it('ohne Text vor der Schreibmarke bleibt der Punkt unverändert', () => {
    const view = ansicht('- ');
    expect(umbruch(view)).toBe(true);
    expect(text(view)).toBe('- ');
  });
});

describe('Zeilenumbruch außerhalb von Listen (AK10)', () => {
  it('Fließtext: Rückstrich und Zeilenwechsel ohne Einrückung', () => {
    const view = ansicht('Ein Absatz');
    umbruch(view);
    expect(text(view)).toBe('Ein Absatz\\\n');
  });

  it('Fließtext mitten im Text', () => {
    const view = ansicht('Ein Absatz', { marke: [1, 4] });
    umbruch(view);
    expect(text(view)).toBe('Ein\\\nAbsatz');
  });

  it('Code-Zeile: das Kommando greift nicht, die Taste fällt durch', () => {
    const view = ansicht('```\n- kein Punkt\n```', { marke: [2, 12] });
    expect(runListLineBreak(view)).toBe(false);
    umbruch(view);
    expect(text(view)).not.toContain('\\');
  });

  it('Tabellen-Zeile: das Kommando greift nicht', () => {
    const view = ansicht('| a | b |\n|---|---|\n| x | y |', { marke: [3, 4] });
    expect(runListLineBreak(view)).toBe(false);
  });

  it('Schreibschutz: keine Wirkung', () => {
    const view = ansicht('- Text', { lesen: true });
    expect(runListLineBreak(view)).toBe(false);
    umbruch(view);
    expect(text(view)).toBe('- Text');
  });

  it('mit Auswahl greift das Kommando nicht', () => {
    const view = ansicht('- Text');
    view.dispatch({ selection: { anchor: 2, head: 6 } });
    expect(runListLineBreak(view)).toBe(false);
  });
});

describe('Leer gebliebene Folgezeile (AK16)', () => {
  it('Rücktaste löscht Folgezeile und Rückstrich, die Marke steht am Ende des Texts', () => {
    const view = ansicht('- Text');
    umbruch(view);
    expect(taste(view, 'Backspace')).toBe(true);
    expect(text(view)).toBe('- Text');
    expect(marke(view)).toEqual([1, 6]);
  });

  it('Rücktaste nimmt den Leerraum vor dem Rückstrich mit', () => {
    const view = ansicht('- [ ] Text \\\n      ');
    taste(view, 'Backspace');
    expect(text(view)).toBe('- [ ] Text');
  });

  it('Eingabetaste räumt den Rückstrich weg und gibt die Taste weiter', () => {
    const view = ansicht('- Text\\\n  \n- weiter', { marke: [2, 2] });
    expect(runListBreakEnterCleanup(view)).toBe(false);
    expect(text(view)).toBe('- Text\n\n- weiter');
    expect(marke(view)).toEqual([2, 0]);
  });

  it('Eingabetaste über die Belegung hinterlässt keinen Rückstrich', () => {
    const view = ansicht('- Text');
    umbruch(view);
    taste(view, 'Enter');
    expect(text(view)).not.toContain('\\');
  });

  it('eine Folgezeile mit Text bleibt unberührt', () => {
    const view = ansicht('- Text\\\n  zweite');
    expect(runListBreakEnterCleanup(view)).toBe(false);
    taste(view, 'Backspace');
    expect(text(view)).toBe('- Text\\\n  zweit');
  });

  it('ein maskierter Rückstrich ist kein Umbruch und bleibt stehen', () => {
    const view = ansicht('- Pfad C:\\\\\n  ');
    taste(view, 'Backspace');
    // Die Standard-Rücktaste nimmt die Einrückung, der Rückstrich bleibt.
    expect(view.state.doc.line(1).text).toBe('- Pfad C:\\\\');
    expect(view.state.doc.lines).toBe(2);
  });
});

describe('Einrücken ohne «Listen-Struktur» (AK17, AK21)', () => {
  beforeEach(async () => {
    await lebenszyklus.applyExtensionsState(['outliner'], { persist: false });
  });

  it('Einrücken nimmt die Folgezeile mit', () => {
    const view = ansicht('- A\n- B\\\n  Fortsetzung B\n- C', { marke: [2, 3] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('- A\n  - B\\\n    Fortsetzung B\n- C');
  });

  it('Ausrücken nimmt die Folgezeile mit', () => {
    const view = ansicht('- A\n  - B\\\n    Fortsetzung B\n- C', { marke: [2, 5] });
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('- A\n- B\\\n  Fortsetzung B\n- C');
  });

  it('nummerierter Punkt: die Folgezeile folgt der neuen Inhalts-Spalte', () => {
    const view = ansicht('1. A\n2. B\\\n   Fortsetzung B', { marke: [2, 4] });
    taste(view, 'Tab');
    expect(text(view)).toBe('1. A\n  1. B\\\n     Fortsetzung B');
  });

  it('das Kürzel wirkt auch ohne die Erweiterung', () => {
    const view = ansicht('- Text');
    umbruch(view);
    expect(text(view)).toBe('- Text\\\n  ');
  });
});

describe('Einrücken mit «Listen-Struktur» bleibt wie zuvor', () => {
  it('der Teilbaum samt Folgezeile rückt ein', () => {
    const view = ansicht('- A\n- B\\\n  Fortsetzung B', { marke: [2, 3] });
    taste(view, 'Tab');
    expect(text(view)).toBe('- A\n  - B\\\n    Fortsetzung B');
  });
});

describe('Notiz-Feld (AK22)', () => {
  it('das Kürzel wirkt im Notiz-Feld wie im Haupt-Editor', () => {
    const view = ansicht('- Punkt', { notiz: true });
    expect(umbruch(view)).toBe(true);
    expect(text(view)).toBe('- Punkt\\\n  ');
  });

  it('die Rücktaste räumt die leere Folgezeile auch im Notiz-Feld weg', () => {
    const view = ansicht('- Punkt', { notiz: true });
    umbruch(view);
    taste(view, 'Backspace');
    expect(text(view)).toBe('- Punkt');
  });
});
