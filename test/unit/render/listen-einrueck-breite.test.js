// @vitest-environment jsdom
// 4T-002302 (Epic 3E-000334, A9): Ohne Erweiterung «Listen-Struktur» (Arbeitsmodus
// «Einsteiger») rückt Tab einen nummerierten Punkt um die Breite des
// übergeordneten Markers ein. Dieser Fall prüft die Zusage dahinter: Der
// Quelltext, den der Tastendruck erzeugt, wird als verschachtelte Liste
// gerendert, und Quelltext und Anzeige zeigen dieselben Nummern.
//
// Bis zum Task rückte Tab um zwei Zeichen ein; zwei Zeichen unter «1. » bilden
// nach der Markdown-Regel keinen Unterpunkt, die Anzeige zählte flach 1, 2, 3,
// der Quelltext 1, 1, 2 (Messung vom 2026-10-17 unter
// Tests/3E-000334/4T-002209-messung/). Deshalb entsteht der Quelltext hier am
// echten Editor (Muster test/unit/renderer/listen-zeilenumbruch.test.js) und
// nicht als fester Text; Vorbild des Render-Teils ist listen-neustart.test.js.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../renderer/api-stub.js';

const { EditorView, runScopeHandlers } = await import('@codemirror/view');
const { ensureSyntaxTree } = await import('@codemirror/language');
const { createEditorState } = await import('../../../src/renderer/modules/editor/editor.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { renderMarkdown, configureExtensions } =
  await import('../../../src/shared/markdown/markdown.js');

const offen = [];

beforeEach(async () => {
  lebenszyklus.resetExtensionStateForTests();
  await lebenszyklus.applyExtensionsState(['outliner'], { persist: false });
  configureExtensions(['outliner']);
});

afterEach(() => {
  while (offen.length) offen.pop().destroy();
  configureExtensions([]);
});

// Quelltext nach Tab auf der Zeile `zeile` (1-basiert), Schreibmarke am
// Zeilenende; ausgelöst über dieselbe Tastenbelegung wie ein echter Tastendruck.
function nachTab(doc, zeile) {
  // Ohne `readOnly: false` entsteht der Editor im Lese-Zustand.
  const state = createEditorState({ content: doc, readOnly: false });
  const view = new EditorView({ state, parent: document.body });
  offen.push(view);
  view.dispatch({ selection: { anchor: view.state.doc.line(zeile).to } });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
  expect(runScopeHandlers(view, event, 'editor')).toBe(true);
  return view.state.doc.toString();
}

// Nummern und Ebenen des Quelltexts: je nummerierter Zeile [Text, Nummer].
function quellNummern(md) {
  return md
    .split('\n')
    .map((z) => /^\s*(\d+)\.\s+(.*)$/.exec(z))
    .filter(Boolean)
    .map((m) => [m[2], Number(m[1])]);
}

// Angezeigte Nummer und Tiefe je Listenpunkt, in Dokument-Reihenfolge: Die
// Nummer ergibt sich wie im Browser aus `start` der Liste (Vorgabe 1) und der
// Stellung des Punkts, ein `value` am Punkt setzt die Zählung neu.
function anzeigeNummern(html) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const ergebnis = [];
  for (const li of dom.querySelectorAll('ol > li')) {
    let nummer = Number(li.parentElement.getAttribute('start') || 1) - 1;
    for (const geschwister of li.parentElement.children) {
      nummer = geschwister.hasAttribute('value')
        ? Number(geschwister.getAttribute('value'))
        : nummer + 1;
      if (geschwister === li) break;
    }
    let tiefe = 0;
    for (let p = li.parentElement.parentElement; p; p = p.parentElement) {
      if (p.tagName === 'LI') tiefe++;
    }
    const eigenerText = li.firstChild ? li.firstChild.textContent.trim() : '';
    ergebnis.push({ text: eigenerText, nummer, tiefe });
  }
  return ergebnis;
}

describe('Einrück-Breite ohne «Listen-Struktur»: Anzeige wie Quelltext (4T-002302, AK4)', () => {
  it('nach Tab unter «1. » zeigt die Anzeige einen Unterpunkt mit den Nummern des Quelltexts', () => {
    const md = nachTab('1. eins\n2. zwei\n3. drei', 2);
    const anzeige = anzeigeNummern(renderMarkdown(md, 'de'));
    expect(anzeige).toEqual([
      { text: 'eins', nummer: 1, tiefe: 0 },
      { text: 'zwei', nummer: 1, tiefe: 1 },
      { text: 'drei', nummer: 2, tiefe: 0 },
    ]);
    expect(anzeige.map((p) => [p.text, p.nummer])).toEqual(quellNummern(md));
  });

  it('nach Tab unter «10. » ebenso, mit vier Zeichen Einrückung', () => {
    const md = nachTab('9. neun\n10. zehn\n11. elf\n12. zwölf', 3);
    const anzeige = anzeigeNummern(renderMarkdown(md, 'de'));
    expect(anzeige).toEqual([
      { text: 'neun', nummer: 9, tiefe: 0 },
      { text: 'zehn', nummer: 10, tiefe: 0 },
      { text: 'elf', nummer: 1, tiefe: 1 },
      { text: 'zwölf', nummer: 11, tiefe: 0 },
    ]);
    expect(anzeige.map((p) => [p.text, p.nummer])).toEqual(quellNummern(md));
  });
});

// 4T-002306 (Epic 3E-000353): Nimmt die selbsttätige Nummerierung beim
// Ausrücken den längeren Marker «11.» zurück, wandert die Folgezeile wieder an
// seine Inhalts-Spalte. Die Anzeige zeigt danach elf Punkte auf einer Ebene,
// der elfte mit seiner zweiten Zeile; vor dem Task stand die Folgezeile im
// Quelltext ein Zeichen zu weit links (nach der Markdown-Regel weiter Teil des
// Punkts, deshalb prüft der Fall auch die Spalte im Quelltext).
describe('Folgezeile nach dem Rückweg auf «11.»: Anzeige wie Quelltext (4T-002306)', () => {
  it('Tab und Umschalt+Tab: elf Punkte, der elfte mit zweiter Zeile an seiner Inhalts-Spalte', () => {
    const namen = [
      'eins',
      'zwei',
      'drei',
      'vier',
      'fünf',
      'sechs',
      'sieben',
      'acht',
      'neun',
      'zehn',
    ];
    const anfang = namen.map((name, i) => `${i + 1}. ${name}`).join('\n');
    const state = createEditorState({
      content: `${anfang}\n11. elf\n    zweite Zeile von elf`,
      readOnly: false,
    });
    const view = new EditorView({ state, parent: document.body });
    offen.push(view);
    view.dispatch({ selection: { anchor: view.state.doc.line(11).to } });
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true });
      expect(runScopeHandlers(view, event, 'editor')).toBe(true);
    }
    const md = view.state.doc.toString();
    expect(md.split('\n').slice(10)).toEqual(['11. elf', '    zweite Zeile von elf']);
    const anzeige = anzeigeNummern(renderMarkdown(md, 'de'));
    expect(anzeige).toHaveLength(11);
    expect(anzeige.every((p) => p.tiefe === 0)).toBe(true);
    expect(anzeige[10].nummer).toBe(11);
    expect(anzeige[10].text).toMatch(/^elf\s+zweite Zeile von elf$/);
    expect(anzeige.map((p) => [p.text.split(/\s/)[0], p.nummer])).toEqual(quellNummern(md));
  });
});
