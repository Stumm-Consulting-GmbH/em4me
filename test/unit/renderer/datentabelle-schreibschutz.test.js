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
const { renderMarkdown, configureExtensions } =
  await import('../../../src/shared/markdown/markdown.js');
const { applyExtensionsState } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

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

function zustand(nurLesen, quelle = QUELLE) {
  return EditorState.create({
    doc: quelle,
    extensions: nurLesen ? [EditorState.readOnly.of(true)] : [],
  });
}

function reiter(viewMode) {
  state.panes[0].tabs = [{ path: 'C:/Bereich/Kosten.md', viewMode }];
  state.panes[0].activeIndex = 0;
}

// Geteilte Ansicht: die Anzeige-Fläche mit dem Markup der Pipeline, der Editor
// als Doppel mit echtem Zustand; `dispatch` hält jede Schreib-Absicht fest.
function geteilteAnsicht({ nurLesen, quelle = QUELLE }) {
  reiter('split');
  const editor = { state: zustand(nurLesen, quelle), dispatch: vi.fn() };
  paneEditors[0] = editor;
  wurzel = document.createElement('div');
  wurzel.className = 'pane-group';
  wurzel.dataset.pane = '0';
  wurzel.innerHTML = `<div class="markdown-body">${renderMarkdown(quelle, 'de')}</div>`;
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

// 4T-002797 (Epic 3E-000449): Die Anzeige liest die Tabelle ohne private
// Kommentare, das Zurückschreiben roh. Eine Zeile im Rumpf, die nur einen
// Kommentar trägt, zeigt die Anzeige nicht als Fehler; roh ist sie einer, und
// die Serialisierung schriebe sie nicht zurück. Das Raster bleibt deshalb
// gesperrt wie vor der Befreiung der Anzeige. Gegenprobe: Ein Kommentar in
// einer Zelle ist roh kein Fehler, das Raster bleibt bearbeitbar.
describe('Privater Kommentar im Rumpf (4T-002797)', () => {
  const MIT_KOMMENTAR_ZEILE = QUELLE.replace(
    '| Strom | 60 |  |',
    '%% Quelle: Umfrage %%\n| Strom | 60 |  |',
  );

  it('eine Zeile nur mit Kommentar sperrt das Raster, ohne Fehler-Anzeige', () => {
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle: MIT_KOMMENTAR_ZEILE });
    expect(root.querySelector('.pdt-errors')).toBeNull();
    expect(root.textContent).not.toContain('Umfrage');
    klick(zelle(root, 0, 1));
    expect(eingabe(root)).toBeNull();
    klick(zelle(root, 1, 2));
    hinweise.length = 0;
    klick(root.querySelector('.pdt-add-btn'));
    expect(editor.dispatch).not.toHaveBeenCalled();
    // Zweitblick Runde 2 (Z7): Der Hinweis nennt den Kommentar, nicht einen
    // Struktur-Fehler, den die Anzeige nicht zeigt.
    expect(hinweise).toEqual(['datatable.hint.blockedComment']);
  });

  it('ein Kommentar in einer Zelle lässt das Raster bearbeitbar', () => {
    const quelle = QUELLE.replace('| Miete | 800 | x |', '| Miete %% intern %% | 800 | x |');
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle });
    expect(zelle(root, 0, 0).textContent).toBe('Miete');
    klick(zelle(root, 1, 2));
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    // Zurückgeschrieben wird roh: Der Kommentar der anderen Zeile bleibt.
    const { changes } = editor.dispatch.mock.calls[0][0];
    expect(JSON.stringify(changes)).toContain('Miete %% intern %%');
  });
});

// 4T-002797, Zweitblick Runde 2 (Z5, Z6): Eine Zelle mit privatem Kommentar in
// einer Spalte mit Typ ist roh eine Fehler-Zelle; die Anzeige zeigt ihren Wert
// ohne Kommentar und ohne Fehler. Das Umschalten eines Wahrheitswerts kippt den
// sichtbaren Wert und behält den Kommentar (vorher löschte es ihn still und
// setzte den Haken). Eine Zahl mit Kommentar lässt sich übernehmen (vorher
// meldete sie einen ungültigen Betrag); geprüft wird der sichtbare Wert,
// geschrieben der Rohtext samt Kommentar. Gegenprobe: Bei ausgeschalteter
// Erweiterung ist die Zelle auch in der Anzeige ein Fehler und schaltet nicht.
describe('Bearbeiten einer Zelle mit privatem Kommentar (4T-002797, Z5 und Z6)', () => {
  const geschrieben = (editor) => editor.dispatch.mock.calls[0][0].changes.insert;

  afterEach(async () => {
    configureExtensions([]);
    await applyExtensionsState([], { persist: false });
  });

  it('der Wahrheitswert kippt und der Kommentar bleibt stehen', () => {
    const quelle = QUELLE.replace('| Miete | 800 | x |', '| Miete | 800 | x %%Notiz%% |');
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle });
    expect(zelle(root, 0, 2).classList.contains('pdt-cell-error')).toBe(false);
    klick(zelle(root, 0, 2));
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(geschrieben(editor)).toMatch(/\| Miete\s*\|\s*800\s*\|\s*%%Notiz%%\s*\|/);
  });

  it('mit der Leertaste wird ein leerer Wahrheitswert mit Kommentar gesetzt', () => {
    const quelle = QUELLE.replace('| Strom | 60 |  |', '| Strom | 60 | %%offen%% |');
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle });
    taste(zelle(root, 1, 2), ' ');
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(geschrieben(editor)).toMatch(/\| Strom\s*\|\s*60\s*\|\s*x %%offen%%\s*\|/);
  });

  it('eine Zahl mit Kommentar wird übernommen, der Kommentar bleibt', () => {
    const quelle = QUELLE.replace('| Miete | 800 | x |', '| Miete | 800 %%netto%% | x |');
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle });
    expect(zelle(root, 0, 1).textContent).toBe('800');
    klick(zelle(root, 0, 1));
    expect(eingabe(root).value).toBe('800 %%netto%%');
    // Unverändert übernommen: nichts geschrieben.
    expect(uebernimmOffeneDatentabellenEingabe()).toBe(true);
    expect(editor.dispatch).not.toHaveBeenCalled();

    klick(zelle(root, 0, 1));
    eingabe(root).value = 'kein Betrag %%netto%%';
    expect(uebernimmOffeneDatentabellenEingabe()).toBe(false);
    expect(editor.dispatch).not.toHaveBeenCalled();

    eingabe(root).value = '900 %%netto%%';
    expect(uebernimmOffeneDatentabellenEingabe()).toBe(true);
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(geschrieben(editor)).toMatch(/\| Miete\s*\|\s*900 %%netto%%\s*\|\s*x\s*\|/);
  });

  it('bei ausgeschalteter Erweiterung schaltet die Zelle nicht und bleibt ein Fehler', async () => {
    configureExtensions(['comments']);
    await applyExtensionsState(['comments'], { persist: false });
    const quelle = QUELLE.replace('| Miete | 800 | x |', '| Miete | 800 | x %%Notiz%% |');
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle });
    expect(zelle(root, 0, 2).classList.contains('pdt-cell-error')).toBe(true);
    klick(zelle(root, 0, 2));
    taste(zelle(root, 0, 2), ' ');
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  // Prüfrunde 3, Befund 5 des Zweitblicks: Zeigt die Anzeige die Zelle noch
  // als gültig (gezeichnet bei eingeschalteter Erweiterung), trägt sie in der
  // Quelle nach dem Ausschalten aber einen Fehler, schaltet sie nicht um und
  // die Statusleiste nennt den Grund, statt still nichts zu tun.
  it('eine in der Quelle fehlerhafte Zelle schaltet nicht und meldet den Grund', async () => {
    const quelle = QUELLE.replace('| Miete | 800 | x |', '| Miete | 800 | x %%Notiz%% |');
    const { root, editor } = geteilteAnsicht({ nurLesen: false, quelle });
    expect(zelle(root, 0, 2).classList.contains('pdt-cell-error')).toBe(false);
    configureExtensions(['comments']);
    await applyExtensionsState(['comments'], { persist: false });
    hinweise.length = 0;
    klick(zelle(root, 0, 2));
    taste(zelle(root, 0, 2), ' ');
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(hinweise).toEqual([
      'datatable.cellError.invalidBoolean',
      'datatable.cellError.invalidBoolean',
    ]);
  });
});
