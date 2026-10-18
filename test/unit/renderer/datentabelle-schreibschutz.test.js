// @vitest-environment jsdom
// 4T-002053 (Stories 4S-000051 AK1, 4S-000164 AK15): Bei ausgeschaltetem
// Bearbeiten ist das Raster der Datentabelle nur ansehbar. Kriterium ist der
// Schreibschutz des Editors, wie beim Zell-Editor der Pipe-Tabelle
// (`editorKontext` in live-table-zelle.js).
//
// Geprüft am Bedienweg mit dem Markup der echten Pipeline (Muster
// datentabelle-verweis-klick.test.js): Klick, Eingabetaste und F2 öffnen keine
// Zelle, Wahrheitswert, «Zeile hinzufügen» und «Zeile löschen» schreiben nichts,
// eine vor dem Ausschalten geöffnete Zelle schreibt beim Übernehmen nicht, und
// Sortieren bleibt verfügbar. Gegenprobe: Bei änderbarem Editor schreibt das
// Raster wie bisher, und eine offene Eingabe wird beim Ausschalten übernommen.
//
// Ersetzt ist allein der Neuaufbau der Anzeige nach dem Zurückschreiben
// (renderPaneContent): Er braucht eine laufende Spalte und ist nicht Gegenstand.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

vi.mock('../../../src/renderer/modules/views/pane-render.js', async (importOriginal) => ({
  ...(await importOriginal()),
  renderPaneContent: () => {},
}));

// Die Hinweise der Statusleiste werden mitgeschrieben: Im Live-Doppel gelingt
// die Zuordnung zur Fence nicht (das Widget hängt außerhalb des Inhalts), und
// ein bearbeitbares Raster meldet das. Ein schreibgeschütztes kommt gar nicht
// so weit — daran unterscheidet der Live-Fall die beiden Zustände.
const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showStatusbarHint: (key) => hinweise.push(key),
}));

const { bindPerspectiveDatatableEditor, uebernimmOffeneDatentabellenEingabe } =
  await import('../../../src/renderer/modules/query/perspective-datatable-editor.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { renderMarkdown } = await import('../../../src/shared/markdown/markdown.js');

// Das Prüf-Dokument der manuellen Zeile im Aufgaben-Objekt.
const QUELLE = [
  '```perspective-datatable',
  'columns: Posten:text, Betrag:number, Erledigt:boolean',
  'aggregate: Betrag:sum',
  '| Miete | 800 | x |',
  '| Strom | 60 |  |',
  '```',
  '',
].join('\n');

let wurzel;

function zustand(nurLesen) {
  return EditorState.create({
    doc: QUELLE,
    extensions: nurLesen ? [EditorState.readOnly.of(true)] : [],
  });
}

function reiter(viewMode) {
  state.panes[0].tabs = [{ path: 'C:/Bereich/Kosten.md', viewMode }];
  state.panes[0].activeIndex = 0;
}

// Geteilte Ansicht: die Anzeige-Fläche mit dem Markup der Pipeline, der Editor
// als Doppel mit echtem Zustand; `dispatch` hält jede Schreib-Absicht fest.
function geteilteAnsicht({ nurLesen }) {
  reiter('split');
  const editor = { state: zustand(nurLesen), dispatch: vi.fn() };
  paneEditors[0] = editor;
  wurzel = document.createElement('div');
  wurzel.className = 'pane-group';
  wurzel.dataset.pane = '0';
  wurzel.innerHTML = `<div class="markdown-body">${renderMarkdown(QUELLE, 'de')}</div>`;
  document.body.appendChild(wurzel);
  bindPerspectiveDatatableEditor(wurzel);
  return { root: wurzel, editor };
}

function zelle(root, row, col) {
  return root.querySelector(`tr[data-dt-row="${row}"] td[data-dt-col="${col}"]`);
}

function klick(el) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

function taste(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function eingabe(root) {
  return root.querySelector('input.pdt-cell-input');
}

beforeEach(() => {
  paneEditors.length = 0;
});

afterEach(() => {
  if (wurzel) {
    const offen = eingabe(wurzel);
    if (offen) taste(offen, 'Escape');
    if (paneEditors[0] && typeof paneEditors[0].destroy === 'function') paneEditors[0].destroy();
    wurzel.remove();
    wurzel = null;
  }
});

describe('Raster bei ausgeschaltetem Bearbeiten (4T-002053)', () => {
  it('Klick, Eingabetaste und F2 öffnen keine Zelle (geteilte Ansicht)', () => {
    const { root } = geteilteAnsicht({ nurLesen: true });
    klick(zelle(root, 0, 1));
    expect(eingabe(root)).toBeNull();
    taste(zelle(root, 0, 1), 'Enter');
    expect(eingabe(root)).toBeNull();
    taste(zelle(root, 1, 0), 'F2');
    expect(eingabe(root)).toBeNull();
  });

  it('Wahrheitswert, «Zeile hinzufügen» und «Zeile löschen» schreiben nichts', () => {
    const { root, editor } = geteilteAnsicht({ nurLesen: true });
    klick(zelle(root, 0, 2));
    taste(zelle(root, 1, 2), ' ');
    klick(root.querySelector('.pdt-add-btn'));
    klick(root.querySelector('tr[data-dt-row="0"] .pdt-del-btn'));
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(eingabe(root)).toBeNull();
  });

  it('im Live-Modus setzt ein Klick keinen Schreibweg in Gang', () => {
    const liveKlick = (nurLesen) => {
      reiter('live');
      const host = document.createElement('div');
      document.body.appendChild(host);
      const view = new EditorView({ state: zustand(nurLesen), parent: host });
      paneEditors[0] = view;
      const behaelter = document.createElement('div');
      behaelter.className = 'cm-live-block markdown-body';
      behaelter.innerHTML = renderMarkdown(QUELLE, 'de');
      view.dom.appendChild(behaelter);
      bindPerspectiveDatatableEditor(behaelter);
      hinweise.length = 0;
      klick(zelle(behaelter, 0, 1));
      taste(zelle(behaelter, 1, 1), 'Enter');
      const ergebnis = {
        offen: !!eingabe(behaelter),
        hinweise: [...hinweise],
        text: view.state.doc.toString(),
      };
      view.destroy();
      host.remove();
      return ergebnis;
    };
    // Gegenprobe: Das bearbeitbare Raster versucht die Zelle zu öffnen und
    // meldet die im Doppel verlorene Zuordnung.
    expect(liveKlick(false).hinweise.length).toBeGreaterThan(0);
    expect(liveKlick(true)).toEqual({ offen: false, hinweise: [], text: QUELLE });
  });

  it('Sortieren bleibt verfügbar und schreibt nichts', () => {
    const { root, editor } = geteilteAnsicht({ nurLesen: true });
    const reihenfolge = () =>
      Array.from(root.querySelectorAll('tbody tr[data-dt-row]')).map((tr) => tr.dataset.dtRow);
    expect(reihenfolge()).toEqual(['0', '1']);
    klick(root.querySelector('th.pdt-col[data-dt-col="1"]'));
    expect(reihenfolge()).toEqual(['1', '0']);
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('eine vor dem Ausschalten geöffnete Zelle schreibt beim Übernehmen nicht', () => {
    const { root, editor } = geteilteAnsicht({ nurLesen: false });
    klick(zelle(root, 0, 1));
    const feld = eingabe(root);
    expect(feld).not.toBeNull();
    feld.value = '900';
    // Bearbeiten wird ausgeschaltet, während die Zelle offen ist.
    editor.state = zustand(true);
    taste(feld, 'Enter');
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(eingabe(root)).toBeNull();
    expect(zelle(root, 0, 1).classList.contains('pdt-editing')).toBe(false);
    expect(zelle(root, 0, 1).textContent).toBe('800');
  });
});

describe('Gegenprobe bei eingeschaltetem Bearbeiten (4T-002053)', () => {
  it('Klick öffnet die Zelle, der Wahrheitswert schreibt', () => {
    const { root, editor } = geteilteAnsicht({ nurLesen: false });
    klick(zelle(root, 0, 1));
    expect(eingabe(root)).not.toBeNull();
    taste(eingabe(root), 'Escape');
    klick(zelle(root, 1, 2));
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
  });

  it('beim Ausschalten wird eine offene Eingabe übernommen, ein ungültiger Wert hält ab', () => {
    const { root, editor } = geteilteAnsicht({ nurLesen: false });
    klick(zelle(root, 0, 1));
    eingabe(root).value = 'kein Betrag';
    expect(uebernimmOffeneDatentabellenEingabe()).toBe(false);
    expect(eingabe(root)).not.toBeNull();
    expect(editor.dispatch).not.toHaveBeenCalled();

    eingabe(root).value = '900';
    expect(uebernimmOffeneDatentabellenEingabe()).toBe(true);
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(editor.dispatch.mock.calls[0][0].changes.insert).toContain('| Miete | 900 | x |');
    // Ohne offene Eingabe ist nichts zu übernehmen.
    expect(uebernimmOffeneDatentabellenEingabe()).toBe(true);
  });
});
