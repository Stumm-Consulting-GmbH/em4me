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

const { navigateToAnchorInPane, findBlockAnchorLine, scrollRenderedToLine } =
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

// 4T-002057 (Epic 3E-000360): Charakterisierung der Anker-Suche des Editors
// (`findBlockAnchorLine`). Seit 4T-002072 liest sie die Heimat
// (src/shared/block-anchors.js, `lineById`); die Fälle halten den erreichten
// Stand fest, damit eine neue eigene Erkennung an dieser Stelle auffällt.
describe('findBlockAnchorLine: Anker-Erkennung (4T-002057, Charakterisierung)', () => {
  const zeileVon = (text, id) =>
    findBlockAnchorLine({ state: EditorState.create({ doc: text }) }, id);

  it('ein Anker am Zeilenende liefert seine Zeile (1-basiert)', () => {
    expect(zeileVon('Davor.\n\nDer Absatz. ^ziel\n', 'ziel')).toBe(3);
  });

  it('eine Anker-Zeile allein unter einem Code-Block liefert ihre Zeile', () => {
    expect(zeileVon(['```js', 'a = 1;', '```', '^code', ''].join('\n'), 'code')).toBe(4);
  });

  it('ein Anker in einem Code-Beispiel oder im Frontmatter zählt nicht', () => {
    const text = ['---', 'notiz: x ^ziel', '---', '```', 'Beispiel ^ziel', '```', 'Echt. ^ziel'];
    expect(zeileVon(text.join('\n'), 'ziel')).toBe(7);
  });

  it('von zwei gleichen Kennungen zählt das erste Vorkommen', () => {
    expect(zeileVon('Erster. ^d\n\nZweiter. ^d\n', 'd')).toBe(1);
  });

  it('ohne Leerraum vor dem Zeichen, ohne Kennung oder ohne Ansicht: 0', () => {
    expect(zeileVon('Text^ziel\n', 'ziel')).toBe(0);
    expect(zeileVon('Absatz. ^da\n', 'fehlt')).toBe(0);
    expect(findBlockAnchorLine(null, 'x')).toBe(0);
  });
});

// 4T-002783 (Epic 3E-000392, Befund der Abnahme 3E-000392/001): Die Titelzeile
// klebt am oberen Rand der Lese-Fläche. Ein Sprung legte das Ziel genau unter
// sie, sichtbar war die Folge-Zeile. Geprüft wird hier, dass vor dem Rollen
// die Höhe der sichtbaren Titelzeile als oberer Bildlauf-Innenabstand der
// Fläche gilt; dass der Browser das Ziel damit sichtbar unter die Titelzeile
// legt, belegt der Ablauf-Fall in der Bereichs-Statistik an der laufenden
// Anwendung.
describe('Lese-Ansicht: Sprungziel nicht unter der Titelzeile (4T-002783)', () => {
  // Lese-Fläche wie im Fenster: Titelzeile als direktes Kind, darunter der
  // Inhalt. jsdom misst keine Höhen; die Titelzeile meldet eine feste.
  function leseFlaeche(html, { titelHoehe = 52.4, titelVerborgen = false } = {}) {
    const renderedEl = document.createElement('section');
    renderedEl.className = 'pane pane-rendered';
    const kopf = document.createElement('div');
    kopf.className = 'title-line';
    kopf.hidden = titelVerborgen;
    kopf.getBoundingClientRect = () => ({ height: titelVerborgen ? 0 : titelHoehe });
    const renderedHtml = document.createElement('article');
    renderedHtml.className = 'markdown-body';
    renderedHtml.innerHTML = html;
    renderedEl.append(kopf, renderedHtml);
    document.body.append(renderedEl);
    for (const el of renderedHtml.querySelectorAll('*')) {
      el.scrollIntoView = () => gerollt.push({ el, abstand: renderedEl.style.scrollPaddingTop });
    }
    paneEls[0] = { renderedEl, renderedHtml };
    return renderedEl;
  }

  // Gliederung und Titelzeile werden über app-state selbst geladen (Ring über
  // Editor und Reiter), bevor der Ersatz von getPaneEls greift; sie sehen die
  // echten Pane-Elemente. Für ihre Fälle wird die Lese-Fläche deshalb in das
  // echte Objekt eingesetzt und danach zurückgestellt.
  // jsdom kennt CSS.escape nicht; Vorbild workspaces-page.test.js.
  if (!globalThis.CSS) globalThis.CSS = {};
  if (typeof globalThis.CSS.escape !== 'function') {
    globalThis.CSS.escape = (wert) => String(wert).replace(/["\\]/g, '\\$&');
  }

  async function mitEchtenPaneEls(fall) {
    const echt = (
      await vi.importActual('../../../src/renderer/modules/app/app-state.js')
    ).getPaneEls(0);
    const schluessel = Object.keys(paneEls[0]);
    const alt = Object.fromEntries(schluessel.map((k) => [k, echt[k]]));
    Object.assign(echt, paneEls[0]);
    try {
      await fall();
    } finally {
      Object.assign(echt, alt);
    }
  }

  const ZEILEN =
    '<p data-source-line="1">Eins</p>' +
    '<p data-source-line="3">Drei</p>' +
    '<p data-source-line="5" id="fuenf">Fünf</p>';

  it('Zeilen-Sprung: Abstand der Titelzeile steht vor dem Rollen', () => {
    vi.useFakeTimers();
    try {
      setzeReiter('rendered');
      leseFlaeche(ZEILEN);
      scrollRenderedToLine(0, 3);
      vi.advanceTimersByTime(150);
    } finally {
      vi.useRealTimers();
    }
    expect(gerollt).toHaveLength(1);
    expect(gerollt[0].el.textContent).toBe('Drei');
    expect(gerollt[0].abstand).toBe('53px');
  });

  it('Anker-Sprung: ebenso', () => {
    setzeReiter('rendered');
    leseFlaeche(ZEILEN, { titelHoehe: 40 });
    navigateToAnchorInPane(0, 'fuenf');
    expect(gerollt.map((g) => [g.el.id, g.abstand])).toEqual([['fuenf', '40px']]);
  });

  it('ausgeblendete Titelzeile: kein Abstand, auch nicht vom Sprung davor', () => {
    setzeReiter('rendered');
    const flaeche = leseFlaeche(ZEILEN, { titelVerborgen: true });
    flaeche.style.scrollPaddingTop = '53px';
    navigateToAnchorInPane(0, 'fuenf');
    expect(gerollt.map((g) => g.abstand)).toEqual(['']);
  });

  it('Gliederungs-Klick: ebenso, sofort gerollt', async () => {
    const { jumpToHeading } = await import('../../../src/renderer/modules/panels/panel-outline.js');
    setzeReiter('rendered');
    leseFlaeche('<h1 id="eins">Eins</h1><p>Text</p><h2 id="zwei">Zwei</h2>', {
      titelHoehe: 33.2,
    });
    const doc = '# Eins\n\nText\n\n## Zwei\n';
    editor(doc);
    paneEditors[0].focus = () => {};
    await mitEchtenPaneEls(() => jumpToHeading(0, 5));
    expect(gerollt.map((g) => [g.el.id, g.abstand])).toEqual([['zwei', '34px']]);
  });

  it('Titelzeile beim Ansichtswechsel ausgeblendet: Abstand zurückgesetzt', async () => {
    const { updateTitleLineForPane } =
      await import('../../../src/renderer/modules/views/title-line.js');
    setzeReiter('split');
    const flaeche = leseFlaeche(ZEILEN);
    const kopf = flaeche.querySelector(':scope > .title-line');
    kopf.dataset.host = 'rendered';
    paneEls[0].titleLines = [kopf];
    flaeche.style.scrollPaddingTop = '53px';
    await mitEchtenPaneEls(() => updateTitleLineForPane(0));
    expect(kopf.hidden).toBe(true);
    expect(flaeche.style.scrollPaddingTop).toBe('');
  });
});
