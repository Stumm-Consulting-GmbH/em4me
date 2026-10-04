// @vitest-environment jsdom
// 4T-002014 (Epic 3E-000332): der Klick auf einen Verweis in einer Zelle der
// Datentabelle, am Bedienweg geprüft (Konzept «Test-Strategie und
// Qualitätssicherung», Kapitel 5.5).
//
// Zwei Stücke, beide mit dem Markup der echten Pipeline:
//
// - **Editor-Vorrang** (Entscheidung F2 a des Product Owners vom 2026-09-28):
//   Ein Klick auf einen Verweis in einer bearbeitbaren Zelle öffnet keine
//   Bearbeitung, ein Klick daneben öffnet sie; Eingabetaste und F2 auf der Zelle
//   öffnen sie auch, wenn die Zelle einen Verweis trägt. Geprüft in der geteilten
//   Ansicht, weil dort die Zuordnung zur Fence ohne laufende Anzeige gelingt; der
//   Vorrang ist für beide Ansichten dieselbe Zeile.
// - **Klick-Pfad der Live-Ansicht** (bindDatentabellenVerweisKlicks): Er ruft
//   activateLink mit Ziel und Art und verhindert die Voreinstellung; ein Klick
//   außerhalb eines Verweises ruft nichts.
//
// Ersetzt ist allein activateLink (aufgefangen statt ausgeführt). Ob der Klick
// am gebauten Programm das Ziel öffnet, steht im Ablauf-Fall DV-01.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const aufrufe = [];
vi.mock('../../../src/renderer/modules/views/link-navigation.js', async (importOriginal) => ({
  ...(await importOriginal()),
  activateLink: (...args) => {
    aufrufe.push(args);
  },
}));

const { bindPerspectiveDatatableEditor } =
  await import('../../../src/renderer/modules/query/perspective-datatable-editor.js');
const { bindDatentabellenVerweisKlicks } =
  await import('../../../src/renderer/modules/live/live-interaction.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { renderMarkdown } = await import('../../../src/shared/markdown/markdown.js');

const QUELLE = [
  '# Kunden',
  '',
  '```perspective-datatable',
  'columns: Name:text, Betrag:number(2)',
  '| [[Ziel\\|Alias]] mit Text | 12.5 |',
  '| #projekt | 3 |',
  '```',
  '',
].join('\n');

let wurzel;

// jsdom folgt einem nicht verhinderten Verweis-Klick mit einer Navigation, die
// es nicht kann. Am Dokument steht deshalb ein letzter Zuhörer, der das in allen
// Fällen verhindert, so wie es in der Anwendung die Anzeige (handleRenderedClick)
// und der Hauptprozess tun. Er hält vorher fest, ob der Klick bereits verhindert
// war; nur daran lässt sich die Wirkung des Klick-Pfads ablesen.
const schonVerhindert = [];
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('a[href]')) return;
  schonVerhindert.push(e.defaultPrevented);
  e.preventDefault();
});

function reiter(viewMode) {
  state.panes[0].tabs = [{ path: 'C:/Bereich/Kunden.md', viewMode }];
  state.panes[0].activeIndex = 0;
}

// Geteilte Ansicht: die Anzeige-Fläche als Gerüst mit dem Markup der Pipeline,
// der Editor als Doppel mit echtem Zustand (der Zell-Editor liest daraus die
// Fence und schreibt erst bei Übernahme).
function geteilteAnsicht() {
  reiter('split');
  paneEditors[0] = { state: EditorState.create({ doc: QUELLE }), dispatch: vi.fn() };
  wurzel = document.createElement('div');
  wurzel.className = 'pane-group';
  wurzel.dataset.pane = '0';
  wurzel.innerHTML = `<div class="markdown-body">${renderMarkdown(QUELLE, 'de')}</div>`;
  document.body.appendChild(wurzel);
  bindPerspectiveDatatableEditor(wurzel);
  return wurzel;
}

// Live-Ansicht: ein echter Editor, in dessen Wurzel der Widget-Behälter hängt;
// den Pane-Index findet der Klick-Pfad über EditorView.findFromDOM.
function liveAnsicht() {
  reiter('live');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({ state: EditorState.create({ doc: QUELLE }), parent: host });
  paneEditors[0] = view;
  const behaelter = document.createElement('div');
  behaelter.className = 'cm-live-block markdown-body';
  behaelter.innerHTML = renderMarkdown(QUELLE, 'de');
  view.dom.appendChild(behaelter);
  bindPerspectiveDatatableEditor(behaelter);
  bindDatentabellenVerweisKlicks(behaelter);
  wurzel = host;
  return { behaelter, view };
}

function zelle(root, row, col) {
  return root.querySelector(`tr[data-dt-row="${row}"] td[data-dt-col="${col}"]`);
}

function klick(el) {
  const ereignis = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ereignis);
  return ereignis;
}

function taste(el, key) {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(ereignis);
  return ereignis;
}

// Schließt eine offene Zell-Bearbeitung wieder, damit der Zustand des Moduls
// (genau eine offene Bearbeitung app-weit) den nächsten Fall nicht berührt.
function bearbeitungSchliessen(root) {
  const eingabe = root.querySelector('input.pdt-cell-input');
  if (eingabe) taste(eingabe, 'Escape');
}

beforeEach(() => {
  aufrufe.length = 0;
  schonVerhindert.length = 0;
  paneEditors.length = 0;
});

afterEach(() => {
  if (wurzel) {
    bearbeitungSchliessen(wurzel);
    if (paneEditors[0] && typeof paneEditors[0].destroy === 'function') paneEditors[0].destroy();
    wurzel.remove();
    wurzel = null;
  }
});

describe('Editor-Vorrang in der bearbeitbaren Datentabelle (F2 a)', () => {
  it('die Pipeline zeigt Verweis und Schlagwort als anklickbare Verweise', () => {
    const root = geteilteAnsicht();
    expect(zelle(root, 0, 0).querySelector('a.wikilink').getAttribute('href')).toBe('Ziel.md');
    expect(zelle(root, 1, 0).querySelector('a.tag-link').getAttribute('href')).toBe('#tag:projekt');
  });

  it('ein Klick auf den Verweis öffnet keine Bearbeitung', () => {
    const root = geteilteAnsicht();
    klick(zelle(root, 0, 0).querySelector('a.wikilink'));
    expect(root.querySelector('input.pdt-cell-input')).toBeNull();
    klick(zelle(root, 1, 0).querySelector('a.tag-link'));
    expect(root.querySelector('input.pdt-cell-input')).toBeNull();
  });

  it('ein Klick daneben öffnet die Bearbeitung mit dem geschriebenen Text', () => {
    const root = geteilteAnsicht();
    klick(zelle(root, 0, 0));
    const eingabe = root.querySelector('input.pdt-cell-input');
    expect(eingabe).not.toBeNull();
    expect(eingabe.value).toBe('[[Ziel|Alias]] mit Text');
    expect(zelle(root, 0, 0).classList.contains('pdt-editing')).toBe(true);
  });

  it('Escape stellt die Zelle samt Verweis wieder her', () => {
    const root = geteilteAnsicht();
    klick(zelle(root, 0, 0));
    taste(root.querySelector('input.pdt-cell-input'), 'Escape');
    expect(zelle(root, 0, 0).querySelector('a.wikilink')).not.toBeNull();
  });

  it('Eingabetaste und F2 auf der Zelle öffnen die Bearbeitung trotz Verweis', () => {
    const root = geteilteAnsicht();
    taste(zelle(root, 0, 0), 'Enter');
    expect(root.querySelector('input.pdt-cell-input').value).toBe('[[Ziel|Alias]] mit Text');
    bearbeitungSchliessen(root);
    taste(zelle(root, 1, 0), 'F2');
    expect(root.querySelector('input.pdt-cell-input').value).toBe('#projekt');
  });

  it('auf einem fokussierten Verweis folgt die Eingabetaste ihm, F2 bearbeitet', () => {
    const root = geteilteAnsicht();
    const ereignis = taste(zelle(root, 0, 0).querySelector('a.wikilink'), 'Enter');
    // Nicht verhindert: Der Browser macht aus der Eingabetaste den Klick auf den
    // Verweis, und den trägt der Verweis-Weg.
    expect(ereignis.defaultPrevented).toBe(false);
    expect(root.querySelector('input.pdt-cell-input')).toBeNull();
    taste(zelle(root, 0, 0).querySelector('a.wikilink'), 'F2');
    expect(root.querySelector('input.pdt-cell-input')).not.toBeNull();
  });
});

describe('Klick-Pfad der Live-Ansicht (bindDatentabellenVerweisKlicks)', () => {
  it('der Klick auf einen Wiki-Verweis ruft activateLink mit Ziel und Art', () => {
    const { behaelter } = liveAnsicht();
    klick(zelle(behaelter, 0, 0).querySelector('a.wikilink'));
    expect(aufrufe).toEqual([[0, 'Ziel.md', true]]);
    expect(schonVerhindert).toEqual([true]);
  });

  it('der Klick auf ein Schlagwort ruft activateLink mit dem Schlagwort-Ziel', () => {
    const { behaelter } = liveAnsicht();
    klick(zelle(behaelter, 1, 0).querySelector('a.tag-link'));
    expect(aufrufe).toEqual([[0, '#tag:projekt', false]]);
  });

  it('mousedown auf dem Verweis hält die Auswahl auf, daneben nicht', () => {
    const { behaelter } = liveAnsicht();
    const auf = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    zelle(behaelter, 0, 0).querySelector('a.wikilink').dispatchEvent(auf);
    expect(auf.defaultPrevented).toBe(true);
    const daneben = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    zelle(behaelter, 0, 1).dispatchEvent(daneben);
    expect(daneben.defaultPrevented).toBe(false);
  });

  it('ein Klick außerhalb eines Verweises und die rechte Maustaste rufen nichts', () => {
    const { behaelter } = liveAnsicht();
    klick(zelle(behaelter, 0, 1));
    const rechts = new MouseEvent('click', { bubbles: true, cancelable: true, button: 2 });
    zelle(behaelter, 0, 0).querySelector('a.wikilink').dispatchEvent(rechts);
    expect(aufrufe).toEqual([]);
  });

  it('ein Verweis in einer Einbettung bleibt außen vor', () => {
    const { behaelter } = liveAnsicht();
    const einbettung = document.createElement('div');
    einbettung.className = 'wiki-embed-md-body';
    einbettung.appendChild(behaelter.querySelector('.perspective-datatable'));
    behaelter.appendChild(einbettung);
    klick(einbettung.querySelector('a.wikilink'));
    expect(aufrufe).toEqual([]);
    expect(schonVerhindert).toEqual([false]);
  });

  it('ohne zugehörigen Editor ruft der Klick nichts', () => {
    const { behaelter } = liveAnsicht();
    paneEditors.length = 0;
    klick(zelle(behaelter, 0, 0).querySelector('a.wikilink'));
    expect(aufrufe).toEqual([]);
  });
});
