// @vitest-environment jsdom
// 4T-001987 (Epic 3E-000332): Die Vorschlagsliste im Zell-Editor der
// Datentabelle — Anschluss an die Liste der Tabellenzelle über eine gedachte
// Tabellenzeile.
//
// Die Liste selbst, ihre Lage an der Zelle und das Zusammenspiel mit der
// Zell-Bedienung in beiden Ansichten brauchen die laufende Anwendung und stehen
// in den Ablauf-Fällen DT-14 und DT-15 (`test/e2e/funktionen/datentabelle.spec.js`).
// Hier stehen die Entscheidungen, in denen ein Irrtum still falsche Einträge,
// eine Liste in der falschen Spalte oder falschen Text in der Zelle brächte.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import './api-stub.js';

const anschluss =
  await import('../../../src/renderer/modules/query/perspective-datatable-suggestions.js');
const kern = await import('../../../src/renderer/modules/live/live-table-suggestion-core.js');
const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const tasks = await import('../../../src/renderer/modules/tasks.js');
const ach = await import('../../../src/renderer/modules/editor/autocomplete-help.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state: appState } = await import('../../../src/renderer/modules/app/app-state.js');
const datentabelle = await import('../../../src/shared/markdown/perspective-datatable.js');

// Der Editor der Arbeitsfläche: Über ihn finden die Quellen die geöffnete
// Datei, und an ihm hängt die Liste. Ein Ersatz mit eigenem Wurzel-Element
// genügt dafür.
let ersatzEditor;
const ZIELE = [
  { name: 'Alpha', kind: 'file', mtimeMs: 1 },
  { name: 'Beta', kind: 'file', mtimeMs: 2 },
  { name: 'Gamma', kind: 'file', mtimeMs: 3 },
  { name: 'Delta', kind: 'file', mtimeMs: 4 },
];
const SCHLAGWORTE = [
  { tag: 'bau-aaa', count: 1 },
  { tag: 'bau-zzz', count: 4 },
];

// Der gedachte Stand zum Feld-Inhalt, wie ihn der Rückruf des Anschlusses
// für die Liste ansetzt.
function standFuer(raw, caret = raw.length) {
  return kern.imaginedState(
    EditorState.create({ doc: anschluss.IMAGINED_ROW }),
    anschluss.IMAGINED_CELL,
    raw,
    caret,
  );
}

async function optionenAm(stand, explicit = false) {
  const ergebnisse = await kern.querySources(
    ach.AUTOCOMPLETE_SOURCES,
    stand,
    explicit,
    ersatzEditor,
  );
  return kern.collectOptions(ergebnisse, stand);
}

// Eine Zelle mit Eingabefeld, wie `startCellEdit` sie aufbaut.
function baueZelle(typ = 'text') {
  const td = document.createElement('td');
  td.className = 'pdt-cell pdt-editing';
  const input = document.createElement('input');
  input.type = typ;
  input.className = 'pdt-cell-input';
  td.appendChild(input);
  document.body.appendChild(td);
  return { td, input };
}

function tippe(input, text) {
  input.value += text;
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
}

// Tastendruck im Feld über denselben Weg wie `onInputKeydown`.
function taste(input, key) {
  let verbraucht = null;
  const hoerer = (event) => {
    verbraucht = anschluss.handleKey(event);
  };
  input.addEventListener('keydown', hoerer);
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  input.removeEventListener('keydown', hoerer);
  return verbraucht;
}

const liste = () => ersatzEditor.dom.querySelector('.cm-live-tabelle-vorschlaege');
const beschriftungen = () =>
  Array.from(ersatzEditor.dom.querySelectorAll('.cm-completionLabel')).map((el) => el.textContent);

async function warteAufAntwort(input) {
  await vi.waitFor(() => expect(input.hasAttribute('aria-busy')).toBe(false));
  // Ein Takt für die Anzeige nach der letzten Quellen-Antwort.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  lifecycle.resetExtensionStateForTests();
  tasks.applyTasksConfig(null);
  ersatzEditor = { id: 'arbeitsflaeche-0', dom: document.createElement('div') };
  document.body.appendChild(ersatzEditor.dom);
  paneEditors[0] = ersatzEditor;
  appState.panes[0].tabs = [{ path: 'C:/Bereich/Tabellen.md' }];
  appState.panes[0].activeIndex = 0;
  window.api.autocompleteWikiTargets = async () => ({ status: 'ready', suggestions: ZIELE });
  window.api.autocompleteTags = async () => ({ status: 'ready', suggestions: SCHLAGWORTE });
});

afterEach(() => {
  anschluss.close();
  paneEditors.length = 0;
  document.body.textContent = '';
  vi.restoreAllMocks();
});

describe('Gedachte Tabellenzeile (4T-001987)', () => {
  it('die Zelle steht allein zwischen zwei Rändern, die Stelle ist die Schreibmarke', () => {
    const stand = standFuer('x [[Al');
    expect(stand.state.doc.toString()).toBe('| x [[Al |');
    expect(stand.state.sliceDoc(stand.pos - 4, stand.pos)).toBe('[[Al');
  });

  it('eine leere Zelle ergibt dieselbe Zeile mit leerem Inhalt (AK13 der Story)', () => {
    const stand = standFuer('[[');
    expect(stand.state.doc.toString()).toBe('| [[ |');
  });

  it('ein Pipe-Zeichen im Feld wird im gedachten Stand maskiert, die Stelle rechnet mit', () => {
    const stand = standFuer('a|b [[');
    expect(stand.state.doc.toString()).toBe('| a\\|b [[ |');
    expect(stand.state.sliceDoc(stand.pos - 2, stand.pos)).toBe('[[');
  });
});

describe('Quellen an der gedachten Zeile (4T-001987)', () => {
  it('Verweis-Ziele: dieselben Einträge in derselben Reihenfolge wie im Fließtext (AK1)', async () => {
    const zelle = await optionenAm(standFuer('x [['));
    const fliesstext = EditorState.create({ doc: 'Text [[' });
    const text = await optionenAm({ state: fliesstext, pos: fliesstext.doc.length });
    const namen = (optionen) => optionen.map((o) => o.completion.label);
    expect(namen(zelle)).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);
    expect(namen(zelle)).toEqual(namen(text));
  });

  it('Schlagworte: dieselbe Reihenfolge nach Häufigkeit wie im Fließtext (AK1)', async () => {
    const zelle = await optionenAm(standFuer('#bau'));
    const fliesstext = EditorState.create({ doc: 'Text #bau' });
    const text = await optionenAm({ state: fliesstext, pos: fliesstext.doc.length });
    expect(zelle.map((o) => o.completion.label)).toEqual(['bau-zzz', 'bau-aaa']);
    expect(zelle.map((o) => o.completion.label)).toEqual(text.map((o) => o.completion.label));
  });

  it('Aufgaben-Marker: auch ausdrücklich keine (AK1, AK5 der Story)', async () => {
    expect(await optionenAm(standFuer('p'), true)).toEqual([]);
  });

  it('Erweiterung «Autovervollständigung» aus: keine Einträge (AK14 der Story)', async () => {
    await lifecycle.applyExtensionsState(['autocomplete'], { persist: false });
    expect(await optionenAm(standFuer('[['), true)).toEqual([]);
  });
});

describe('Übernahme in das Feld und in den Quelltext (4T-001987)', () => {
  async function verweisOption(stand, name) {
    return (await optionenAm(stand)).find((o) => o.completion.label === name);
  }

  it('ein Verweis-Ziel ergibt denselben Text wie im Fließtext, Klammern geschlossen (AK2)', async () => {
    const raw = 'x [[Al';
    const stand = standFuer(raw);
    const neu = kern.applySuggestion(stand, raw, await verweisOption(stand, 'Alpha'));
    expect(neu).toEqual({ value: 'x [[Alpha]]', caret: 'x [[Alpha]]'.length });
  });

  it('ein Pipe-Zeichen im Feld: roh übernommen, Schreibmarke dahinter (AK2)', async () => {
    const raw = 'a|b [[Al';
    const stand = standFuer(raw);
    const neu = kern.applySuggestion(stand, raw, await verweisOption(stand, 'Alpha'));
    expect(neu).toEqual({ value: 'a|b [[Alpha]]', caret: 'a|b [[Alpha]]'.length });
  });

  it('ein Vorschlag mit Trennzeichen lässt die Datentabelle heil (AK2, AK7 der Story)', () => {
    const raw = '#';
    const stand = standFuer(raw);
    const neu = kern.applySuggestion(stand, raw, { completion: { label: 'A|B' }, from: stand.pos });
    expect(neu.value).toBe('#A|B');
    // Der Weg in den Quelltext ist die Übernahme der Zelle mit dem
    // Serialisierer der Datentabelle; der Wert kommt unverändert zurück.
    const modell = datentabelle.parsePerspectiveDatatable(
      'columns: Name:text, Betrag:number(2)\n| alt | 12.5 |',
    );
    modell.rows[0][0] = { text: neu.value, value: neu.value, error: null };
    const zurueck = datentabelle.parsePerspectiveDatatable(
      datentabelle.serializePerspectiveDatatable(modell),
    );
    expect(zurueck.errors).toEqual([]);
    expect(zurueck.rows).toHaveLength(1);
    expect(zurueck.rows[0]).toHaveLength(2);
    expect(zurueck.rows[0][0].value).toBe('#A|B');
    expect(zurueck.rows[0][1].value).toBe(12.5);
  });
});

describe('Anschluss am Zell-Feld (4T-001987)', () => {
  it('nur Text-Spalten bekommen die Liste (AK1, AK6 der Story)', () => {
    const offen = () => true;
    for (const colType of ['number', 'date', 'time', 'boolean']) {
      const { td, input } = baueZelle(colType === 'date' || colType === 'time' ? colType : 'text');
      expect(anschluss.attach(input, { view: ersatzEditor, td, colType, isOpen: offen })).toBe(
        false,
      );
      expect(input.hasAttribute('aria-autocomplete')).toBe(false);
    }
    const { td, input } = baueZelle();
    expect(
      anschluss.attach(input, { view: ersatzEditor, td, colType: 'text', isOpen: offen }),
    ).toBe(true);
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
  });

  it('Liste erscheint am Editor, Pfeil und Eingabetaste schreiben in das Feld (AK1, AK2, AK3)', async () => {
    const { td, input } = baueZelle();
    anschluss.attach(input, { view: ersatzEditor, td, colType: 'text', isOpen: () => true });
    input.value = 'x';
    tippe(input, ' [[');
    await warteAufAntwort(input);
    expect(liste()).not.toBeNull();
    expect(beschriftungen()).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);
    expect(taste(input, 'ArrowDown')).toBe(true);
    expect(taste(input, 'Enter')).toBe(true);
    expect(input.value).toBe('x [[Gamma]]');
    expect(liste()).toBeNull();
    // Bei geschlossener Liste gehört die Eingabetaste wieder der Zelle.
    expect(taste(input, 'Enter')).toBe(false);
  });

  it('Escape schließt nur die Liste, der Tabulator schließt sie und gehört der Zelle (AK3)', async () => {
    const { td, input } = baueZelle();
    anschluss.attach(input, { view: ersatzEditor, td, colType: 'text', isOpen: () => true });
    tippe(input, '#b');
    await warteAufAntwort(input);
    expect(beschriftungen()).toEqual(['bau-zzz', 'bau-aaa']);
    expect(taste(input, 'Escape')).toBe(true);
    expect(liste()).toBeNull();
    expect(input.value).toBe('#b');
    expect(taste(input, 'Escape')).toBe(false);

    tippe(input, 'a');
    await warteAufAntwort(input);
    expect(liste()).not.toBeNull();
    expect(taste(input, 'Tab')).toBe(false);
    expect(liste()).toBeNull();
    expect(input.value).toBe('#ba');
  });

  it('ohne offene Bearbeitung liefert der Rückruf nichts, und es erscheint keine Liste', async () => {
    const { td, input } = baueZelle();
    let offen = true;
    anschluss.attach(input, { view: ersatzEditor, td, colType: 'text', isOpen: () => offen });
    offen = false;
    tippe(input, '[[');
    await warteAufAntwort(input);
    expect(liste()).toBeNull();
  });

  it('close schließt eine offene Liste, wie beim Übernehmen und Abbrechen der Zelle', async () => {
    const { td, input } = baueZelle();
    anschluss.attach(input, { view: ersatzEditor, td, colType: 'text', isOpen: () => true });
    tippe(input, '[[');
    await warteAufAntwort(input);
    expect(liste()).not.toBeNull();
    anschluss.close();
    expect(liste()).toBeNull();
    expect(input.hasAttribute('aria-expanded')).toBe(false);
  });
});
