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
const { applyListIndent } = await import('../../../src/renderer/modules/editor/editor-keymaps.js');
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

function taste(view, key, { shift = false, alt = false } = {}) {
  const event = new KeyboardEvent('keydown', { key, shiftKey: shift, altKey: alt, bubbles: true });
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

  // 4T-002302: Unter «1. » rückt der Punkt seither drei Zeichen ein, die
  // Folgezeile wandert mit der Inhalts-Spalte mit (vorher zwei und fünf).
  it('nummerierter Punkt: die Folgezeile folgt der neuen Inhalts-Spalte', () => {
    const view = ansicht('1. A\n2. B\\\n   Fortsetzung B', { marke: [2, 4] });
    taste(view, 'Tab');
    expect(text(view)).toBe('1. A\n   1. B\\\n      Fortsetzung B');
    taste(view, 'Tab', { shift: true });
    expect(text(view)).toBe('1. A\n2. B\\\n   Fortsetzung B');
  });

  // 4T-002209 (Epic 3E-000334): Die selbsttätige Nummerierung zählt auch ohne
  // Erweiterung nach dem Einrücken durch. 4T-002302 (A9 des Epics, Entscheidung
  // V1 des Product Owners vom 2026-10-17): Seit der Messung vom 2026-10-17
  // (Tests/3E-000334/4T-002209-messung/) rückt Tab um die Breite des
  // übergeordneten Markers ein, unter «1. » also drei Zeichen; damit liest auch
  // die Anzeige den Punkt als Unterpunkt, und Quelltext und Anzeige zeigen
  // dieselben Nummern (Render-Fall in test/unit/render/listen-einrueck-breite.test.js).
  it('nummerierte Liste: Tab rückt um die Marker-Breite ein, Umschalt+Tab nimmt sie zurück (4T-002302)', () => {
    const view = ansicht('1. eins\n2. zwei\n3. drei', { marke: [2, 7] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('1. eins\n   1. zwei\n2. drei');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('1. eins\n2. zwei\n3. drei');
  });

  it('zweistelliger Marker: unter «10. » vier Zeichen hin und zurück (4T-002302)', () => {
    const view = ansicht('10. zehn\n11. elf', { marke: [2, 7] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('10. zehn\n    1. elf');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('10. zehn\n11. elf');
  });

  // Schutz-Fall: Unter einem Aufzählungs-Punkt rückte auch ein nummerierter
  // Punkt schon vorher zwei Zeichen ein; grün vor und nach 4T-002302.
  it('nummerierter Punkt unter einem Aufzählungs-Punkt: zwei Zeichen (4T-002302)', () => {
    const view = ansicht('- oben\n1. eins', { marke: [2, 7] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('- oben\n  1. eins');
  });

  // Schutz-Fall: Unter einem Aufzählungs-Punkt war die Breite schon vorher
  // zwei Zeichen; der Fall bleibt vor und nach 4T-002302 grün.
  it('Aufzählungs-Punkt: unverändert zwei Zeichen hin und zurück (4T-002302)', () => {
    const view = ansicht('- eins\n- zwei', { marke: [2, 6] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('- eins\n  - zwei');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('- eins\n- zwei');
  });

  it('Folgezeile eines nummerierten Punkts unter «10. » wandert um dieselbe Breite (4T-002302)', () => {
    const view = ansicht('10. zehn\n11. elf\\\n    Fortsetzung', { marke: [2, 8] });
    taste(view, 'Tab');
    expect(text(view)).toBe('10. zehn\n    1. elf\\\n       Fortsetzung');
  });

  // Das Kästchen zählt nicht zur Breite: Unter «1. [ ] » rückt der Punkt drei
  // Zeichen ein, an die Spalte, an der die Anzeige den Unterpunkt erkennt.
  it('Aufgaben-Box: allein der Listen-Marker zählt (4T-002302)', () => {
    const view = ansicht('1. [ ] eins\n2. [ ] zwei', { marke: [2, 11] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('1. [ ] eins\n   1. [ ] zwei');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('1. [ ] eins\n2. [ ] zwei');
  });

  it('Ausrücken aus der zweiten Ebene nimmt die Differenz zum Elternteil (4T-002302)', () => {
    const view = ansicht('1. eins\n   1. zwei\n      1. drei', { marke: [3, 13] });
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('1. eins\n   1. zwei\n   2. drei');
  });

  it('mehrzeilige Auswahl rückt als Block um dieselbe Breite ein (4T-002302)', () => {
    const view = ansicht('1. eins\n2. zwei\n3. drei');
    view.dispatch({
      selection: { anchor: view.state.doc.line(2).from, head: view.state.doc.line(3).to },
    });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('1. eins\n   1. zwei\n   2. drei');
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

  // 4T-002302 (AK5): Schutz-Fall, grün vor und nach der Änderung — mit der
  // Erweiterung wandert der nummerierte Punkt samt Teilbaum an die
  // Inhalts-Spalte seines Vorgängers, das zeilenweise Einrücken greift nicht.
  it('nummerierter Punkt samt Unterpunkt rückt als Teilbaum ein (4T-002302)', () => {
    const view = ansicht('1. eins\n2. zwei\n   1. unter\n3. drei', { marke: [2, 7] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('1. eins\n   1. zwei\n      1. unter\n2. drei');
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

// 4T-002306 (Epic 3E-000353): Ändert die selbsttätige Nummerierung die Länge
// eines Markers — aus «1.» wird beim Ausrücken wieder «11.», beim Verschieben
// aus «9.» ein «10.» —, wandern die eingerückten Folgezeilen des Punkts um
// dieselbe Strecke mit (Story-Zusage AK5 in 4S-000058). Vorher blieben sie
// stehen und lagen ein Zeichen neben der Inhalts-Spalte.
const ersteAcht = '1. eins\n2. zwei\n3. drei\n4. vier\n5. fünf\n6. sechs\n7. sieben\n8. acht\n';
const ersteZehn = ersteAcht + '9. neun\n10. zehn\n';

function auswahl(view, von, bis) {
  view.dispatch({
    selection: { anchor: view.state.doc.line(von).from, head: view.state.doc.line(bis).to },
  });
}

function folgezeilenFaelle() {
  it('Tab und Umschalt+Tab auf «11.»: die Folgezeile steht danach wieder bei vier Zeichen', () => {
    const view = ansicht(ersteZehn + '11. elf\n    zweite Zeile von elf', { marke: [11, 7] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe(ersteZehn + '    1. elf\n       zweite Zeile von elf');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe(ersteZehn + '11. elf\n    zweite Zeile von elf');
  });

  it('Punkt ohne Folgezeile: allein der Marker ändert sich (Schutz-Fall)', () => {
    const view = ansicht(ersteZehn + '11. elf\n12. zwölf', { marke: [11, 7] });
    taste(view, 'Tab');
    taste(view, 'Tab', { shift: true });
    expect(text(view)).toBe(ersteZehn + '11. elf\n12. zwölf');
  });

  it('Einfügen eines Punkts schiebt «9.» auf «10.»: die Folgezeile folgt', () => {
    const view = ansicht(ersteAcht + '9. neun\n   Folge neun');
    einfuegen(view, 9, '9. neu\n');
    expect(text(view)).toBe(ersteAcht + '9. neu\n10. neun\n    Folge neun');
  });

  // Die Eingabetaste am Ende eines Punkts ohne Unterpunkt läuft über die
  // übernommene Listen-Fortsetzung des Editor-Pakets, die selbst nummeriert.
  it('Eingabetaste am Ende von «8. acht» schiebt «9.» auf «10.»: die Folgezeile folgt', () => {
    const view = ansicht(ersteAcht + '9. neun\n   Folge neun', { marke: [8, 7] });
    expect(taste(view, 'Enter')).toBe(true);
    expect(text(view)).toBe(ersteAcht + '9. \n10. neun\n    Folge neun');
  });

  // Mit Unterpunkten nimmt die Eingabetaste die eigene Fortsetzung
  // (editor-list-enter.js, renumberSiblings): neuer erster Unterpunkt, die
  // übrigen zählen weiter, auch mit dem Trenner «1)».
  for (const t of ['.', ')']) {
    it(`eigene Fortsetzung, Trenner «${t}»: der neunte Unterpunkt wird zum zehnten, die Folgezeile folgt`, () => {
      const unter = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(
        (b, i) => `   ${i + 1}${t} ${b}`,
      );
      const view = ansicht(['1. eins', ...unter, '      Folge i'].join('\n'), { marke: [1, 7] });
      expect(taste(view, 'Enter')).toBe(true);
      const neu = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(
        (b, i) => `   ${i + 2}${t} ${b}`,
      );
      expect(text(view)).toBe(['1. eins', `   1${t} `, ...neu, '       Folge i'].join('\n'));
    });
  }

  // Schutz-Fall: Die Zaun-Zeile ist eingerückt; am Zeilenanfang erkennt der
  // Syntaxbaum sie noch nicht als Code, die Mitnahme darf sie trotzdem nicht
  // vom Code-Block losreißen.
  it('Zeilen in einem Code-Block bleiben unverändert (Schutz-Fall)', () => {
    const code = '   ```\n   code\n   ```';
    const view = ansicht(ersteAcht + '9. neun\n' + code);
    einfuegen(view, 9, '9. neu\n');
    expect(text(view)).toBe(ersteAcht + '9. neu\n10. neun\n' + code);
  });
}

// Einfügen über die Zwischenablage: dieselbe Transaktions-Art wie ein echtes
// Einfügen, damit die selbsttätige Nummerierung anspringt.
function einfuegen(view, zeile, inhalt) {
  const from = view.state.doc.line(zeile).from;
  view.dispatch({ changes: { from, insert: inhalt }, userEvent: 'input.paste' });
}

describe('Folgezeilen bei Längen-Änderung des Markers ohne «Listen-Struktur» (4T-002306)', () => {
  beforeEach(async () => {
    await lebenszyklus.applyExtensionsState(['outliner'], { persist: false });
  });

  folgezeilenFaelle();

  it('Verschieben von «9.» auf «10.»: die Folgezeile rückt um ein Zeichen nach rechts', () => {
    const view = ansicht(ersteAcht + '9. neun\n   Folge neun\n10. zehn');
    auswahl(view, 9, 10);
    taste(view, 'ArrowDown', { alt: true });
    expect(text(view)).toBe(ersteAcht + '9. zehn\n10. neun\n    Folge neun');
  });

  it('Verschieben von «10.» auf «9.»: die Folgezeile rückt um ein Zeichen nach links', () => {
    const view = ansicht(ersteAcht + '9. neun\n10. zehn\n    Folge zehn');
    auswahl(view, 10, 11);
    taste(view, 'ArrowUp', { alt: true });
    expect(text(view)).toBe(ersteAcht + '9. zehn\n   Folge zehn\n10. neun');
  });
});

describe('Folgezeilen bei Längen-Änderung des Markers mit «Listen-Struktur» (4T-002306)', () => {
  folgezeilenFaelle();

  it('Verschieben von «9.» auf «10.» samt Teilbaum: die Folgezeile folgt', () => {
    const view = ansicht(ersteAcht + '9. neun\n   Folge neun\n10. zehn', { marke: [9, 7] });
    expect(taste(view, 'ArrowDown', { alt: true })).toBe(true);
    expect(text(view)).toBe(ersteAcht + '9. zehn\n10. neun\n    Folge neun');
  });

  it('Verschieben von «10.» auf «9.» samt Teilbaum: die Folgezeile folgt', () => {
    const view = ansicht(ersteAcht + '9. neun\n10. zehn\n    Folge zehn', { marke: [10, 8] });
    expect(taste(view, 'ArrowUp', { alt: true })).toBe(true);
    expect(text(view)).toBe(ersteAcht + '9. zehn\n   Folge zehn\n10. neun');
  });
});

// 4T-002326 (Epic 3E-000353): Ohne «Listen-Struktur» nimmt das zeilenweise
// Ein- und Ausrücken einen eingerückten Code-Block des Punkts vollständig mit:
// öffnende Zaun-Zeile, Inhalt samt Leerzeilen und schließende Zaun-Zeile
// (Story-Zusage AK9 in 4S-001019). Vorher wanderte allein die öffnende
// Zaun-Zeile, weil die Mitnahme an der ersten Code-Zeile endete.
describe('Code-Block eines Listenpunkts beim zeilenweisen Einrücken (4T-002326)', () => {
  beforeEach(async () => {
    await lebenszyklus.applyExtensionsState(['outliner'], { persist: false });
  });

  const block = (einzug, zaun) =>
    [`${zaun}js`, 'eins', '', '- im Code', `${zaun}`].map((z) => (z ? einzug + z : z)).join('\n');

  for (const zaun of ['```', '~~~']) {
    it(`Tab, Zaun «${zaun}»: der Block wandert samt Leerzeile, die Folgezeile danach ebenso`, () => {
      const doc = `- A\n- B\n${block('  ', zaun)}\n  danach\n- C`;
      const view = ansicht(doc, { marke: [2, 3] });
      expect(taste(view, 'Tab')).toBe(true);
      expect(text(view)).toBe(`- A\n  - B\n${block('    ', zaun)}\n    danach\n- C`);
    });

    it(`Umschalt+Tab, Zaun «${zaun}»: der Block wandert samt Leerzeile, die Folgezeile danach ebenso`, () => {
      const doc = `- A\n  - B\n${block('    ', zaun)}\n    danach\n- C`;
      const view = ansicht(doc, { marke: [2, 5] });
      expect(taste(view, 'Tab', { shift: true })).toBe(true);
      expect(text(view)).toBe(`- A\n- B\n${block('  ', zaun)}\n  danach\n- C`);
    });
  }

  // Ohne Leerzeile im Block: Eine Leerzeile trennt für die selbsttätige
  // Nummerierung zwei Listen, auch im Code-Block (Beobachtung im Task); der
  // Fall prüft allein die Mitnahme an der Inhalts-Spalte.
  it('nummerierter Punkt: Tab und Umschalt+Tab, der Block folgt der Inhalts-Spalte hin und zurück', () => {
    const doc = '1. A\n2. B\n   ```\n   eins\n   zwei\n   ```\n3. C';
    const view = ansicht(doc, { marke: [2, 4] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('1. A\n   1. B\n      ```\n      eins\n      zwei\n      ```\n2. C');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe(doc);
  });

  it('die schließende Zaun-Zeile braucht dasselbe Zeichen und mindestens dieselbe Länge', () => {
    const doc = '- A\n- B\n  ````\n  ```\n  ~~~~\n  ````  \n  danach';
    const view = ansicht(doc, { marke: [2, 3] });
    taste(view, 'Tab');
    expect(text(view)).toBe('- A\n  - B\n    ````\n    ```\n    ~~~~\n    ````  \n    danach');
  });

  it('Inhalts-Zeile mit weniger Einzug als der Zaun: höchstens ihr Leerraum wird gekürzt', () => {
    const doc = '- A\n  - B\n    ```\n    tief\n flach\n    ```\n- C';
    const view = ansicht(doc, { marke: [2, 5] });
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe('- A\n- B\n  ```\n  tief\nflach\n  ```\n- C');
  });

  it('Block ohne schließende Zaun-Zeile: die Mitnahme reicht bis zum Dokument-Ende', () => {
    const view = ansicht('- A\n  - B\n    ```\n    eins\n    zwei', { marke: [2, 5] });
    taste(view, 'Tab', { shift: true });
    expect(text(view)).toBe('- A\n- B\n  ```\n  eins\n  zwei');
  });

  it('Block ohne schließende Zaun-Zeile: Leerzeile und nächster Punkt beenden die Mitnahme wie bisher', () => {
    const leer = ansicht('- A\n  - B\n    ```\n    eins\n\n    zwei', { marke: [2, 5] });
    taste(leer, 'Tab', { shift: true });
    expect(text(leer)).toBe('- A\n- B\n  ```\n  eins\n\n    zwei');
    const punkt = ansicht('- A\n  - B\n    ```\n    eins\n  - C\n    zwei', { marke: [2, 5] });
    taste(punkt, 'Tab', { shift: true });
    expect(text(punkt)).toBe('- A\n- B\n  ```\n  eins\n  - C\n    zwei');
  });

  it('die Zaun-Zeile unter dem nächsten Punkt schließt den Block nicht', () => {
    const rest = '  - C\n    ```\n    zwei\n    ```';
    const view = ansicht(`- A\n  - B\n    \`\`\`\n    eins\n${rest}`, { marke: [2, 5] });
    taste(view, 'Tab', { shift: true });
    expect(text(view)).toBe(`- A\n- B\n  \`\`\`\n  eins\n${rest}`);
  });

  // Schutz-Fall, grün vor und nach der Änderung: Liegt der Punkt selbst in
  // einem Code-Block, den ein Zaun oberhalb geöffnet hat, greift das
  // zeilenweise Einrücken nicht, und keine Zeile des Blocks wandert.
  it('Zaun oberhalb des Punkts: die Sperre für Code-Zeilen bleibt (Schutz-Fall)', () => {
    const doc = '```\n  - B\n    zweite\n```';
    const view = ansicht(doc, { marke: [2, 5] });
    expect(applyListIndent(view, +1)).toBe(false);
    expect(applyListIndent(view, -1)).toBe(false);
    expect(text(view)).toBe(doc);
  });
});

// Nicht-Vakuitäts-Probe: Mit der Erweiterung trägt die Teilbaum-Mitnahme des
// Struktur-Kerns, nicht das zeilenweise Einrücken; ihr Ergebnis ist vor und
// nach 4T-002326 dasselbe. Der Fall hält den Bestand dieses Wegs fest, auch
// seine Grenze: Der Struktur-Kern beendet den Teilbaum an der Leerzeile im
// Code-Block, Inhalt danach und schließende Zaun-Zeile bleiben beim Einrücken
// stehen (Beobachtung im Task 4T-002326, nicht Gegenstand der Behebung).
// Ändert eine künftige Behebung diesen Weg, wird der Fall mitgezogen.
describe('Code-Block eines Listenpunkts mit «Listen-Struktur» bleibt wie zuvor (4T-002326)', () => {
  it('der Teilbaum rückt über den Struktur-Kern ein und aus, unverändert zum Bestand', () => {
    const doc = '- A\n- B\n  ```\n  eins\n\n  zwei\n  ```\n- C';
    const view = ansicht(doc, { marke: [2, 3] });
    expect(taste(view, 'Tab')).toBe(true);
    expect(text(view)).toBe('- A\n  - B\n    ```\n    eins\n\n  zwei\n  ```\n- C');
    expect(taste(view, 'Tab', { shift: true })).toBe(true);
    expect(text(view)).toBe(doc);
  });
});
