// @vitest-environment jsdom
// 4T-001713 (Epic 3E-000300): Der rechnende Kern der Vorschlagsliste in der
// Tabellenzelle der Live-Ansicht — gedachter Quelltext-Stand, Befragung der
// unveränderten Quellen und Rückrechnung einer Übernahme in das Eingabefeld.
//
// Die Liste selbst, ihre Tasten und ihre Lage an der Zelle brauchen die
// laufende Anwendung und stehen in den Ablauf-Fällen TV-01 bis TV-08
// (`test/e2e/funktionen/tabellen-zell-vorschlaege.spec.js`). Hier stehen die
// Entscheidungen, in denen ein Irrtum still falsche Einträge oder falschen
// Text in die Zelle brächte.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import './api-stub.js';

const kern = await import('../../../src/renderer/modules/live/live-table-suggestion-core.js');
const zellKern = await import('../../../src/renderer/modules/live/live-table-zell-kern.js');
const tabelle = await import('../../../src/shared/markdown/table-edit.js');
const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const tasks = await import('../../../src/renderer/modules/tasks.js');
const ach = await import('../../../src/renderer/modules/editor/autocomplete-help.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state: appState } = await import('../../../src/renderer/modules/app/app-state.js');

const TABELLE = ['| A | B | C |', '| --- | --- | --- |', '| a1 | b1 | c1 |'].join('\n');
const DOKUMENT = `Absatz davor.\n\n${TABELLE}\n\nText danach #bau\n`;

// Der Inhalts-Bereich der Zelle b1 im Dokument, gerechnet wie bei der Übernahme.
function bereichB1(doc) {
  const von = doc.indexOf('| A |');
  const block = zellKern.blockAmAnker(EditorState.create({ doc }).doc, von, TABELLE);
  const modell = tabelle.parsePipeTable(block.zeilen);
  const bereich = zellKern.zellBereich(block, modell, { rowKind: 'body', rowIndex: 0, col: 1 });
  return { from: bereich.from, to: bereich.to };
}

function standFuer(raw, caret = raw.length) {
  return kern.imaginedState(EditorState.create({ doc: DOKUMENT }), bereichB1(DOKUMENT), raw, caret);
}

// Die geöffnete Datei der Quellen: Sie finden sie über den Editor der
// Arbeitsfläche. Ein Ersatz-Editor an Stelle 0 genügt dafür.
const ersatzEditor = { id: 'arbeitsflaeche-0' };
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

beforeEach(async () => {
  lifecycle.resetExtensionStateForTests();
  tasks.applyTasksConfig(null);
  paneEditors[0] = ersatzEditor;
  appState.panes[0].tabs = [{ path: 'C:/Bereich/Tabellen.md' }];
  appState.panes[0].activeIndex = 0;
  window.api.autocompleteWikiTargets = async () => ({ status: 'ready', suggestions: ZIELE });
  window.api.autocompleteTags = async () => ({ status: 'ready', suggestions: SCHLAGWORTE });
});

afterEach(() => {
  paneEditors.length = 0;
  vi.restoreAllMocks();
});

describe('Gedachter Quelltext-Stand (4T-001713)', () => {
  it('trägt den Feld-Inhalt in der Zelle, die Stelle ist die Schreibmarke', () => {
    const stand = standFuer('b1 [[Al');
    const zeile = stand.state.doc.lineAt(stand.pos);
    expect(zeile.text).toBe('| a1 | b1 [[Al | c1 |');
    expect(stand.state.sliceDoc(stand.pos - 4, stand.pos)).toBe('[[Al');
  });

  it('maskiert ein Pipe-Zeichen wie die Übernahme und rechnet die Stelle mit', () => {
    const stand = standFuer('x|y [[');
    expect(stand.state.doc.lineAt(stand.pos).text).toBe('| a1 | x\\|y [[ | c1 |');
    expect(stand.state.sliceDoc(stand.pos - 2, stand.pos)).toBe('[[');
  });

  it('eine Schreibmarke mitten im Feld steht an derselben Stelle im Quelltext', () => {
    const stand = standFuer('[[Al rest', 4);
    expect(stand.state.sliceDoc(stand.cellFrom, stand.pos)).toBe('[[Al');
    expect(stand.cellTo - stand.cellFrom).toBe('[[Al rest'.length);
  });

  it('der übrige Quelltext bleibt Zeichen für Zeichen, wie er ist', () => {
    const stand = standFuer('b1');
    expect(stand.state.doc.toString()).toBe(DOKUMENT);
  });
});

describe('Befragung der Quellen (4T-001713)', () => {
  it('reicht Stand, Stelle, Auslöse-Art und Editor an jede Quelle weiter', async () => {
    const gesehen = [];
    const quelle = (ctx) => {
      gesehen.push({
        zeile: ctx.state.doc.lineAt(ctx.pos).text,
        explicit: ctx.explicit,
        view: ctx.view,
      });
      return null;
    };
    const stand = standFuer('[[');
    const ergebnisse = await kern.querySources([quelle, quelle], stand, true, ersatzEditor);
    expect(ergebnisse).toEqual([null, null]);
    expect(gesehen).toEqual([
      { zeile: '| a1 | [[ | c1 |', explicit: true, view: ersatzEditor },
      { zeile: '| a1 | [[ | c1 |', explicit: true, view: ersatzEditor },
    ]);
  });

  it('eine scheiternde Quelle nimmt die übrigen nicht mit', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kaputt = () => {
      throw new Error('kaputt');
    };
    const heil = () => ({ from: 0, options: [{ label: 'x' }] });
    const ergebnisse = await kern.querySources([kaputt, heil], standFuer(''), false, null);
    expect(ergebnisse[0]).toBeNull();
    expect(ergebnisse[1].options[0].label).toBe('x');
    expect(warnung).toHaveBeenCalledTimes(1);
  });

  it('Verweis-Ziele: dieselben Einträge in derselben Reihenfolge wie im Fließtext (AK1, AK4)', async () => {
    const inZelle = standFuer('[[');
    const zelle = kern.collectOptions(
      await kern.querySources(ach.AUTOCOMPLETE_SOURCES, inZelle, false, ersatzEditor),
      inZelle,
    );
    const fliesstext = EditorState.create({ doc: 'Text [[' });
    const imText = { state: fliesstext, pos: fliesstext.doc.length };
    const text = kern.collectOptions(
      await kern.querySources(ach.AUTOCOMPLETE_SOURCES, imText, false, ersatzEditor),
      imText,
    );
    const namen = (liste) => liste.map((o) => o.completion.label);
    expect(namen(zelle)).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);
    expect(namen(zelle)).toEqual(namen(text));
  });

  it('Schlagworte: dieselbe Reihenfolge nach Häufigkeit wie im Fließtext (AK2, AK4)', async () => {
    const inZelle = standFuer('#bau');
    const zelle = kern.collectOptions(
      await kern.querySources(ach.AUTOCOMPLETE_SOURCES, inZelle, false, ersatzEditor),
      inZelle,
    );
    expect(zelle.map((o) => o.completion.label)).toEqual(['bau-zzz', 'bau-aaa']);
    // Die Hervorhebung kommt aus der Quelle (getMatch), nicht aus einer eigenen Regel.
    expect(zelle[0].match).toEqual([0, 3]);
  });

  it('Aufgaben-Marker: auch ausdrücklich keine, weil eine Tabellenzeile keine Aufgabe ist (AK3)', async () => {
    const inZelle = standFuer('p');
    const ergebnisse = await kern.querySources(
      ach.AUTOCOMPLETE_SOURCES,
      inZelle,
      true,
      ersatzEditor,
    );
    expect(kern.collectOptions(ergebnisse, inZelle)).toEqual([]);
    // Gegenprobe: Dieselbe Quelle schlägt auf einer Aufgabenzeile vor.
    const aufgabe = EditorState.create({ doc: '- [ ] Aufgabe p' });
    const aufAufgabe = { state: aufgabe, pos: aufgabe.doc.length };
    const gegen = await kern.querySources(ach.AUTOCOMPLETE_SOURCES, aufAufgabe, true, ersatzEditor);
    expect(kern.collectOptions(gegen, aufAufgabe).length).toBeGreaterThan(0);
  });

  it('Erweiterung «Autovervollständigung» aus: keine Einträge', async () => {
    await lifecycle.applyExtensionsState(['autocomplete'], { persist: false });
    const inZelle = standFuer('[[');
    const ergebnisse = await kern.querySources(
      ach.AUTOCOMPLETE_SOURCES,
      inZelle,
      true,
      ersatzEditor,
    );
    expect(kern.collectOptions(ergebnisse, inZelle)).toEqual([]);
  });

  it('ohne Treffer-Angabe der Quelle wird die Fundstelle der Eingabe hervorgehoben', () => {
    const stand = { state: EditorState.create({ doc: '[[Datei#ab' }), pos: 10 };
    const optionen = kern.collectOptions([{ from: 8, options: [{ label: 'Xab' }] }], stand);
    expect(optionen[0].match).toEqual([1, 3]);
  });
});

describe('Übernahme in das Eingabefeld (4T-001713)', () => {
  async function verweisOption(stand, name) {
    const ergebnisse = await kern.querySources(
      ach.AUTOCOMPLETE_SOURCES,
      stand,
      false,
      ersatzEditor,
    );
    const optionen = kern.collectOptions(ergebnisse, stand);
    return optionen.find((o) => o.completion.label === name);
  }

  it('ein Verweis-Ziel ergibt denselben Text wie im Fließtext, Klammern geschlossen (AK5)', async () => {
    const raw = 'b1 [[Al';
    const stand = standFuer(raw);
    const neu = kern.applySuggestion(stand, raw, await verweisOption(stand, 'Alpha'));
    expect(neu).toEqual({ value: 'b1 [[Alpha]]', caret: 'b1 [[Alpha]]'.length });
  });

  it('stehen die Klammern schon da, werden sie nicht verdoppelt', async () => {
    const raw = '[[Al]] rest';
    const stand = standFuer(raw, 4);
    const neu = kern.applySuggestion(stand, raw, await verweisOption(stand, 'Alpha'));
    expect(neu).toEqual({ value: '[[Alpha]] rest', caret: '[[Alpha]]'.length });
  });

  it('ein Pipe-Zeichen vor der Stelle verschiebt nichts im Feld', async () => {
    const raw = 'x|y [[Al';
    const stand = standFuer(raw);
    const neu = kern.applySuggestion(stand, raw, await verweisOption(stand, 'Alpha'));
    expect(neu).toEqual({ value: 'x|y [[Alpha]]', caret: 'x|y [[Alpha]]'.length });
  });

  it('ein Schlagwort ersetzt die Eingabe hinter der Raute', () => {
    const raw = 'Notiz #ba';
    const stand = standFuer(raw);
    const option = { completion: { label: 'bau-zzz' }, from: stand.pos - 2 };
    expect(kern.applySuggestion(stand, raw, option)).toEqual({
      value: 'Notiz #bau-zzz',
      caret: 'Notiz #bau-zzz'.length,
    });
  });

  it('ein Vorschlag mit Trennzeichen zerstört die Tabelle nicht (AK6)', () => {
    const raw = '#';
    const stand = standFuer(raw);
    const neu = kern.applySuggestion(stand, raw, { completion: { label: 'A|B' }, from: stand.pos });
    expect(neu.value).toBe('#A|B');
    // Der Weg in den Quelltext ist die Übernahme der Zelle mit ihrer Maskierung.
    const zeile = `| a1 | ${zellKern.maskiereZellText(neu.value)} | c1 |`;
    const modell = tabelle.parsePipeTable(['| A | B | C |', '| --- | --- | --- |', zeile]);
    expect(modell.columnCount).toBe(3);
    expect(modell.rows[0]).toHaveLength(3);
    expect(modell.rows[0][1]).toBe('#A\\|B');
  });

  it('eine Übernahme, die außerhalb der Zelle schriebe, lässt das Feld unverändert', () => {
    const raw = '[[';
    const stand = standFuer(raw);
    const fremd = {
      completion: {
        label: 'x',
        apply: (view) => view.dispatch({ changes: { from: 0, to: 1, insert: 'Z' } }),
      },
      from: stand.pos,
    };
    expect(kern.applySuggestion(stand, raw, fremd)).toBeNull();
  });
});
