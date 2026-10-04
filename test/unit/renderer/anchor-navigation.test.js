// @vitest-environment jsdom
// 4T-001986 (Epic 3E-000332): Der Anker-Sprung nach dem Öffnen kennt die
// Datensatz-Kennung als dritte Anker-Herkunft.
//
// Geprüft werden die Suchwege und ihre Reihenfolge, nicht das Rollen selbst:
// In der Lese-Ansicht, welches Element `scrollIntoView` bekommt, im Editor, auf
// welche Zeile die Schreibmarke gesetzt wird. Ob die Zeile danach wirklich im
// Blick steht und der Block der Live-Ansicht aufklappt, braucht die laufende
// Anwendung und steht im Ablauf-Fall DB-03.
//
// Ersetzt sind allein die beiden Nachbarn, die für die Frage einen Zustand
// liefern: die Pane-Elemente (ein DOM-Gerüst der Lese-Ansicht statt des ganzen
// Fensters) und der Schalt-Zustand der Erweiterungen. Der Editor ist eine
// Attrappe mit echtem `EditorState` und aufgefangenem `dispatch`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const paneEls = [];
vi.mock('../../../src/renderer/modules/app/app-state.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getPaneEls: (paneIdx) => paneEls[paneIdx] || null,
}));

const abgeschaltet = new Set();
vi.mock(
  '../../../src/renderer/modules/extensions/extension-lifecycle.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    isExtensionActive: (id) => !abgeschaltet.has(id),
  }),
);

const { navigateToAnchorInPane } =
  await import('../../../src/renderer/modules/views/anchor-navigation.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');

// --- Gerüst -----------------------------------------------------------------

const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Kürzel',
  '---',
  '',
  '# Kunden',
  '',
  'Ein Absatz mit Anker. ^r-00007',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| K-1',
  '|- id="r-00002"',
  '| K-2',
  '|- id="r-00007"',
  '| K-7',
  '```',
  '',
].join('\n');

function zeileVon(text, inhalt) {
  return text.split('\n').indexOf(inhalt) + 1;
}

function setzeReiter(viewMode) {
  state.panes[0].tabs = [{ path: 'C:/Bereich/Kunden.md', viewMode }];
  state.panes[0].activeIndex = 0;
}

// Die Lese-Ansicht als DOM-Gerüst. `scrollIntoView` kennt jsdom nicht; es wird
// je Element festgehalten, welches gerollt wurde.
let gerollt = [];
function leseAnsicht(html) {
  const renderedHtml = document.createElement('div');
  renderedHtml.innerHTML = html;
  for (const el of renderedHtml.querySelectorAll('*')) {
    el.scrollIntoView = () => gerollt.push(el);
  }
  paneEls[0] = { renderedHtml };
}

const ZEILEN_HTML =
  '<table class="prc-table"><tbody>' +
  '<tr class="prc-row" data-rec-id="r-00001"><td>K-1</td></tr>' +
  '<tr class="prc-row" data-rec-id="r-00002"><td>K-2</td></tr>' +
  '</tbody></table>';

// Ein Editor-Doppel: echter Zustand samt Markdown-Syntaxbaum (die
// Überschriften-Suche liest ihn), aufgefangene Aufträge statt einer Anzeige.
let auftraege = [];
function editor(doc) {
  const es = EditorState.create({ doc, extensions: [markdown()] });
  ensureSyntaxTree(es, es.doc.length, 5000);
  paneEditors[0] = { state: es, dispatch: (tr) => auftraege.push(tr) };
}

function schreibmarkenZeile(doc) {
  expect(auftraege).toHaveLength(1);
  const es = EditorState.create({ doc });
  return es.doc.lineAt(auftraege[0].selection.anchor).number;
}

beforeEach(() => {
  gerollt = [];
  auftraege = [];
  abgeschaltet.clear();
  paneEls.length = 0;
  paneEditors.length = 0;
});

// --- Lese-Ansicht -----------------------------------------------------------

describe('Lese-Ansicht: Datensatz-Zeile als zweiter Suchweg (AK1)', () => {
  it('rollt zur Zeile mit der Kennung als data-rec-id', () => {
    setzeReiter('rendered');
    leseAnsicht(ZEILEN_HTML);
    navigateToAnchorInPane(0, 'r-00002');
    expect(gerollt).toHaveLength(1);
    expect(gerollt[0].getAttribute('data-rec-id')).toBe('r-00002');
  });

  it('ein Element mit gleichlautender id hat Vorrang (AK3)', () => {
    setzeReiter('rendered');
    leseAnsicht(`<p id="r-00002">Absatz mit Block-Anker</p>${ZEILEN_HTML}`);
    navigateToAnchorInPane(0, 'r-00002');
    expect(gerollt).toHaveLength(1);
    expect(gerollt[0].tagName).toBe('P');
  });

  it('ohne Ziel rollt nichts und wirft nichts (AK4)', () => {
    setzeReiter('rendered');
    leseAnsicht(ZEILEN_HTML);
    expect(() => navigateToAnchorInPane(0, 'r-09999')).not.toThrow();
    // Im Aus-Zustand zeigt die Lese-Ansicht einen Code-Block ohne data-rec-id.
    leseAnsicht('<pre><code>|- id="r-00001"</code></pre>');
    expect(() => navigateToAnchorInPane(0, 'r-00001')).not.toThrow();
    expect(gerollt).toHaveLength(0);
  });

  it('Überschriften-Anker springen wie bisher (AK3)', () => {
    setzeReiter('rendered');
    leseAnsicht(`<h1 id="kunden">Kunden</h1>${ZEILEN_HTML}`);
    navigateToAnchorInPane(0, 'kunden');
    expect(gerollt.map((el) => el.tagName)).toEqual(['H1']);
  });
});

// --- Quellcode- und Live-Ansicht --------------------------------------------

describe('Editor: Datensatz-Zeile als dritter Suchweg (AK2)', () => {
  it('setzt die Schreibmarke in der Quellcode-Ansicht auf die Datensatz-Zeile', () => {
    setzeReiter('source');
    editor(TABELLE);
    navigateToAnchorInPane(0, 'r-00002');
    expect(schreibmarkenZeile(TABELLE)).toBe(zeileVon(TABELLE, '|- id="r-00002"'));
  });

  it('gilt ebenso in der Live-Ansicht', () => {
    setzeReiter('live');
    editor(TABELLE);
    navigateToAnchorInPane(0, 'r-00001');
    expect(schreibmarkenZeile(TABELLE)).toBe(zeileVon(TABELLE, '|- id="r-00001"'));
  });

  it('bedient in der geteilten Ansicht beide Seiten', () => {
    setzeReiter('split');
    editor(TABELLE);
    leseAnsicht(ZEILEN_HTML);
    navigateToAnchorInPane(0, 'r-00002');
    expect(gerollt.map((el) => el.getAttribute('data-rec-id'))).toEqual(['r-00002']);
    expect(schreibmarkenZeile(TABELLE)).toBe(zeileVon(TABELLE, '|- id="r-00002"'));
  });

  it('ein Block-Anker gleichen Namens hat Vorrang (AK3)', () => {
    setzeReiter('source');
    editor(TABELLE);
    navigateToAnchorInPane(0, 'r-00007');
    expect(schreibmarkenZeile(TABELLE)).toBe(zeileVon(TABELLE, 'Ein Absatz mit Anker. ^r-00007'));
  });

  it('Überschriften-Anker springen wie bisher (AK3)', () => {
    setzeReiter('source');
    editor(TABELLE);
    navigateToAnchorInPane(0, 'kunden');
    expect(schreibmarkenZeile(TABELLE)).toBe(zeileVon(TABELLE, '# Kunden'));
  });

  it('im Aus-Zustand der Erweiterung database kein Sprung und keine Ausnahme (AK4)', () => {
    abgeschaltet.add('database');
    setzeReiter('source');
    editor(TABELLE);
    expect(() => navigateToAnchorInPane(0, 'r-00002')).not.toThrow();
    expect(auftraege).toHaveLength(0);
    // Der Block-Anker ist keine Datensatz-Kennung und springt weiterhin.
    navigateToAnchorInPane(0, 'r-00007');
    expect(schreibmarkenZeile(TABELLE)).toBe(zeileVon(TABELLE, 'Ein Absatz mit Anker. ^r-00007'));
  });

  it('eine unbekannte Kennung setzt keine Schreibmarke (AK4)', () => {
    setzeReiter('live');
    editor(TABELLE);
    expect(() => navigateToAnchorInPane(0, 'r-09999')).not.toThrow();
    expect(auftraege).toHaveLength(0);
  });
});
