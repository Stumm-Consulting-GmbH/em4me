// @vitest-environment jsdom
// 4T-002024 (Epic 3E-000192): Auswahl eines Diagramms im Live-Modus am
// Bedienweg (Entscheidung «Auswählen» des Product Owners vom 2026-09-30, AK29).
//
// **Gemessen an den echten Live-Widgets:** Der Editor trägt das Live-Bündel
// der Anwendung (`livePreviewExtensions`), die Blöcke entstehen über die
// Markdown-Pipeline und den Zeichner der Diagramme, wie sie die Brücke im
// Programm bereitstellt (`renderMarkdown`, `buildChart`). Geklickt wird mit
// einem `mousedown` auf das gezeichnete Diagramm; die Bedienung hört an der
// Spalten-Wurzel (charts/chart-bedienung.js), wie im Programm.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { buildChart } from '../../../src/main/preload-diagramme.js';
import './api-stub.js';

window.api.renderMarkdown = (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen);
window.api.buildChart = buildChart;
// Der Zeichner misst Text ohne Zeichenfläche; jsdom hat keine und meldete das
// sonst bei jedem Diagramm.
window.HTMLCanvasElement.prototype.getContext = () => null;
// Das gemeinsame Kontextmenü der Anwendung aus dem Gerüst des Stubs.
const menueElement = document.getElementById('context-menu');

const { Compartment, EditorState } = await import('@codemirror/state');
const { EditorView } = await import('@codemirror/view');
const { markdown } = await import('@codemirror/lang-markdown');
const { Table: LezerTable } = await import('@lezer/markdown');
const { livePreviewExtensions } =
  await import('../../../src/renderer/modules/live/live-widgets.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state: appState } = await import('../../../src/renderer/modules/app/app-state.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { KLASSE_GEWAEHLT, klickLage, lageErweiterung, lageFuer } =
  await import('../../../src/renderer/modules/charts/chart-lage.js');
const { bindeDiagrammBedienung } =
  await import('../../../src/renderer/modules/charts/chart-bedienung.js');

const Z = '```';
const DIAGRAMM = [
  `${Z}perspective-chart`,
  'table: ^umsatz',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen',
  Z,
];
// Zeile 1 Absatz, 3–8 Datentabelle, 9 Name, 11–16 Diagramm, 18 Absatz.
const DOK = [
  'Absatz',
  '',
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar | 100 | 80 |',
  '| Februar | 90 | 95 |',
  '| März | 120 | 70 |',
  Z,
  '^umsatz',
  '',
  ...DIAGRAMM,
  '',
  'Ende',
].join('\n');

let spalte = null;
const schreibschutz = new Compartment();

function baueSpalte(text = DOK, { editMode = true } = {}) {
  const root = document.createElement('section');
  root.className = 'pane-group';
  root.dataset.pane = '0';
  root.innerHTML =
    '<div class="content view-live"><section class="pane pane-source">' +
    '<div class="pane-source-editor"></div></section><section class="pane pane-rendered">' +
    '<div class="markdown-body"></div></section></div>';
  document.body.appendChild(root);
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown({ extensions: [LezerTable] }),
        livePreviewExtensions,
        lageErweiterung,
        schreibschutz.of(EditorState.readOnly.of(!editMode)),
      ],
    }),
    parent: root.querySelector('.pane-source-editor'),
  });
  // Ein Neben-Editor in derselben Spalten-Wurzel, wie das Notiz-Feld der
  // Seitenleiste (index.html: `.notes-editor` innerhalb der `.pane-group`).
  const notizFeld = document.createElement('div');
  notizFeld.className = 'notes-editor';
  root.appendChild(notizFeld);
  const notiz = new EditorView({ state: EditorState.create({ doc: 'Notiz' }), parent: notizFeld });
  const tab = { path: 'C:/Bereich/Bericht.md', viewMode: 'live', editMode, content: text };
  paneEditors[0] = view;
  appState.panes[0].tabs = [tab];
  appState.panes[0].activeIndex = 0;
  appState.activePaneIndex = 0;
  bindeDiagrammBedienung(root, 0, { istVerfuegbar: () => tab.editMode, meldeMenue: () => {} });
  spalte = { root, view, tab, notiz };
  return spalte;
}

const diagramm = () => spalte.view.contentDOM.querySelector('.cm-live-block > .perspective-chart');

function maus(ziel, button = 0) {
  const ereignis = new window.MouseEvent('mousedown', { button, bubbles: true, cancelable: true });
  ziel.dispatchEvent(ereignis);
  return ereignis;
}

function taste(ziel, key) {
  const ereignis = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  ziel.dispatchEvent(ereignis);
  return ereignis;
}

// Die Hervorhebung wird im Mess-Schritt des Editors gesetzt.
const gemessen = () =>
  new Promise((weiter) => requestAnimationFrame(() => requestAnimationFrame(weiter)));

beforeEach(async () => {
  lebenszyklus.resetExtensionStateForTests();
  await lebenszyklus.applyExtensionsState([], { persist: false });
});

afterEach(() => {
  if (spalte) {
    spalte.view.destroy();
    spalte.notiz.destroy();
  }
  spalte = null;
  paneEditors.length = 0;
  for (const el of document.querySelectorAll('section.pane-group')) el.remove();
});

describe('Klick auf ein Diagramm im Live-Modus (AK29)', () => {
  it('wählt es aus: Lage gesetzt, Schreibmarke unverändert, Diagramm gezeichnet und hervorgehoben', async () => {
    const { view, tab } = baueSpalte();
    const markeVorher = view.state.selection.main.head;
    const ereignis = maus(diagramm());
    expect(ereignis.defaultPrevented).toBe(true);
    expect(lageFuer(view, tab)).toMatchObject({
      diagrammGewaehlt: true,
      inDatentabelle: false,
      zeile: 11,
      quelle: 'klick',
    });
    expect(view.state.selection.main.head).toBe(markeVorher);
    expect(document.activeElement).toBe(view.contentDOM);
    await gemessen();
    expect(diagramm()).not.toBeNull();
    expect(diagramm().dataset.chartState).toBe('drawn');
    expect(diagramm().classList.contains(KLASSE_GEWAEHLT)).toBe(true);
    // Der Quelltext des Blocks steht nicht als Zeile im Editor.
    const zeilen = [...view.contentDOM.querySelectorAll('.cm-line')].map((z) => z.textContent);
    expect(zeilen).not.toContain(`${Z}perspective-chart`);
  });

  it('bei ausgeschaltetem Bearbeiten wählt der Klick nicht aus (F5)', async () => {
    const { view, tab } = baueSpalte(DOK, { editMode: false });
    const ereignis = maus(diagramm());
    // Die Schreibmarke bleibt trotzdem stehen, der Block gezeichnet.
    expect(ereignis.defaultPrevented).toBe(true);
    expect(klickLage(view.state)).toBeNull();
    expect(lageFuer(view, tab).diagrammGewaehlt).toBe(false);
    maus(spalte.view.contentDOM.querySelector('.perspective-datatable td'));
    expect(klickLage(view.state)).toBeNull();
    await gemessen();
    expect(diagramm().classList.contains(KLASSE_GEWAEHLT)).toBe(false);
  });

  it('Bearbeiten ausgeschaltet, während das Diagramm gewählt ist: die Hervorhebung verschwindet (F5)', async () => {
    const { view, tab } = baueSpalte();
    maus(diagramm());
    await gemessen();
    expect(diagramm().classList.contains(KLASSE_GEWAEHLT)).toBe(true);
    view.dispatch({ effects: schreibschutz.reconfigure(EditorState.readOnly.of(true)) });
    await gemessen();
    expect(diagramm().classList.contains(KLASSE_GEWAEHLT)).toBe(false);
    expect(klickLage(view.state)).toBeNull();
    // Wieder an: Die alte Auswahl kehrt nicht zurück.
    view.dispatch({ effects: schreibschutz.reconfigure(EditorState.readOnly.of(false)) });
    expect(lageFuer(view, tab).diagrammGewaehlt).toBe(false);
  });

  it('Escape mit dem Fokus auf der Seite hebt die Auswahl der aktiven Spalte auf (F6)', async () => {
    const { view } = baueSpalte();
    maus(diagramm());
    document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);
    taste(document.body, 'Escape');
    expect(klickLage(view.state)).toBeNull();
  });

  it('Escape auf der Seite bei offener Palette bleibt ihr (F6)', () => {
    const { view } = baueSpalte();
    maus(diagramm());
    const palette = document.createElement('div');
    palette.id = 'command-palette-modal';
    palette.className = 'bookmark-modal';
    document.body.appendChild(palette);
    try {
      taste(document.body, 'Escape');
      expect(klickLage(view.state)).not.toBeNull();
    } finally {
      palette.remove();
    }
  });

  it('ein Klick in den Neben-Editor der Spalte (Notiz-Feld) lässt die Auswahl stehen (V5)', () => {
    const { view, notiz } = baueSpalte();
    maus(diagramm());
    maus(notiz.contentDOM.querySelector('.cm-line'));
    expect(klickLage(view.state)).not.toBeNull();
  });

  it('Escape hebt die Auswahl auf, die Hervorhebung verschwindet', async () => {
    const { view, tab } = baueSpalte();
    maus(diagramm());
    await gemessen();
    taste(view.contentDOM, 'Escape');
    expect(klickLage(view.state)).toBeNull();
    expect(lageFuer(view, tab).diagrammGewaehlt).toBe(false);
    await gemessen();
    expect(diagramm().classList.contains(KLASSE_GEWAEHLT)).toBe(false);
  });

  it('Escape bei offenem Kontextmenü gehört dem Menü', () => {
    const { view } = baueSpalte();
    maus(diagramm());
    menueElement.hidden = false;
    try {
      taste(view.contentDOM, 'Escape');
      expect(klickLage(view.state)).not.toBeNull();
    } finally {
      menueElement.hidden = true;
    }
  });

  it('ein Klick in den Text daneben hebt die Auswahl auf', () => {
    const { view } = baueSpalte();
    maus(diagramm());
    maus(view.contentDOM.querySelector('.cm-line'));
    expect(klickLage(view.state)).toBeNull();
  });

  it('nach dem Neu-Aufbau des Widgets trägt das neue Diagramm die Hervorhebung', async () => {
    const { view } = baueSpalte();
    maus(diagramm());
    await gemessen();
    const vorher = diagramm();
    // Änderung im Block ohne Auswahl, wie beim Schreiben aus dem Dialog.
    const typ = view.state.doc.line(13);
    view.dispatch({ changes: { from: typ.from, to: typ.to, insert: 'type: line' } });
    await gemessen();
    expect(diagramm()).not.toBe(vorher);
    expect(diagramm().classList.contains(KLASSE_GEWAEHLT)).toBe(true);
  });

  it('ein Klick auf das Gitter vermerkt die Tabelle und lässt den Zell-Editor arbeiten', () => {
    const { view, tab } = baueSpalte();
    const zelle = view.contentDOM.querySelector('.perspective-datatable td');
    const ereignis = maus(zelle);
    expect(ereignis.defaultPrevented).toBe(false);
    expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, zeile: 3, quelle: 'klick' });
  });
});

describe('Passive Orte bleiben unberührt', () => {
  // Ein Diagramm mit gleichem Inhalt in einer Hülle, die ein anderes Dokument
  // zeigt, innerhalb des Widgets des echten Blocks: Stelle und Inhalt stimmen,
  // allein die Regel «aktiver Ort» hält es heraus.
  for (const huelle of ['wiki-embed-md-body', 'perspective-script-md']) {
    it(`ein Diagramm in .${huelle} wird nicht ausgewählt`, () => {
      const { view } = baueSpalte();
      const echt = diagramm();
      const aussen = document.createElement('div');
      aussen.className = `${huelle} markdown-body`;
      const kopie = echt.cloneNode(true);
      aussen.appendChild(kopie);
      echt.parentElement.appendChild(aussen);
      const ereignis = maus(kopie);
      expect(ereignis.defaultPrevented).toBe(false);
      expect(klickLage(view.state)).toBeNull();
    });
  }
});
