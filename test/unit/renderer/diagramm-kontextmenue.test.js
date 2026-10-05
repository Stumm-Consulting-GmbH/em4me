// @vitest-environment jsdom
// 4T-002024 (Epic 3E-000192): Rechtsklick auf Datentabelle und Diagramm am
// Bedienweg — im Live-Modus und in der gerenderten Hälfte der geteilten
// Ansicht, je mit eingeschaltetem Bearbeiten und in der Anzeige (Test-Strategie,
// Kapitel 5.5). Entscheidungen des Product Owners vom 2026-09-30 «Gitter
// bleibt», «Auswählen», «Auch rechts» (AK27, AK29, AK30, AK31) und der Sitzung
// C3, C4, C5.
//
// **Bedienweg:** `mousedown` mit der rechten Taste, dann `contextmenu`, wie der
// Browser sie schickt. Der Hörer des Editor-Kontextmenüs sitzt wie im Programm
// am `view.dom` (editor/editor.js); hier ist er ein Zähler, weil gemessen wird,
// ob er erreicht wird, nicht was er baut.
//
// **Die Wählbarkeit** (`isCommandIdAvailable` der Kommando-Palette, Bedingungen
// aus Paket 2 des Tasks) ist hier ersetzt: Die Prüfung reicht eine Funktion
// herein, die «wählbar» an das Bearbeiten des Dokuments knüpft. Die Bedingungen
// selbst prüft der Wächter der Verfügbarkeit.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { buildChart } from '../../../src/main/preload-diagramme.js';
import './api-stub.js';

window.api.renderMarkdown = (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen);
window.api.buildChart = buildChart;
// Der Zeichner misst Text ohne Zeichenfläche; jsdom hat keine und meldete das
// sonst bei jedem Diagramm.
window.HTMLCanvasElement.prototype.getContext = () => null;
const menueElement = document.getElementById('context-menu');

const { EditorState } = await import('@codemirror/state');
const { EditorView } = await import('@codemirror/view');
const { markdown } = await import('@codemirror/lang-markdown');
const { Table: LezerTable } = await import('@lezer/markdown');
const { livePreviewExtensions } =
  await import('../../../src/renderer/modules/live/live-widgets.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state: appState } = await import('../../../src/renderer/modules/app/app-state.js');
const { hideContextMenu } =
  await import('../../../src/renderer/modules/dialogs/context-menu-utils.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { klickLage, lageErweiterung, lageFuer } =
  await import('../../../src/renderer/modules/charts/chart-lage.js');
const { bindeDiagrammBedienung } =
  await import('../../../src/renderer/modules/charts/chart-bedienung.js');
const { diagrammEintraege } = await import('../../../src/renderer/modules/charts/chart-menu.js');

const Z = '```';
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
  `${Z}perspective-chart`,
  'table: ^umsatz',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen',
  Z,
  '',
  'Ende',
].join('\n');

let spalte = null;

function baueSpalte({ viewMode = 'live', editMode = true, doc = DOK, echteVerfuegbarkeit } = {}) {
  const root = document.createElement('section');
  root.className = 'pane-group';
  root.dataset.pane = '0';
  root.innerHTML =
    `<div class="content view-${viewMode}"><section class="pane pane-source">` +
    '<div class="pane-source-editor"></div></section><section class="pane pane-rendered">' +
    '<div class="markdown-body"></div></section></div>';
  document.body.appendChild(root);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: [LezerTable] }),
        viewMode === 'live' ? livePreviewExtensions : [],
        lageErweiterung,
        EditorState.readOnly.of(!editMode),
      ],
    }),
    parent: root.querySelector('.pane-source-editor'),
  });
  if (viewMode !== 'live') {
    root.querySelector('.pane-rendered .markdown-body').innerHTML = renderMarkdown(doc, 'de');
  }
  // Der Hörer des Editor-Kontextmenüs, am selben Element wie im Programm.
  const editorMenue = { aufrufe: 0 };
  view.dom.addEventListener('contextmenu', () => {
    editorMenue.aufrufe += 1;
  });
  const tab = { path: 'C:/Bereich/Bericht.md', viewMode, editMode, content: doc };
  paneEditors[0] = view;
  appState.panes[0].tabs = [tab];
  appState.panes[0].activeIndex = 0;
  appState.activePaneIndex = 0;
  // Mit `echteVerfuegbarkeit` fragt die Bedienung die Kommando-Palette
  // (`isCommandIdAvailable`, aus der aktiven Spalte), sonst die Ersatz-Regel.
  bindeDiagrammBedienung(
    root,
    0,
    echteVerfuegbarkeit
      ? { meldeMenue: () => {} }
      : { istVerfuegbar: () => tab.editMode, meldeMenue: () => {} },
  );
  spalte = { root, view, tab, editorMenue };
  return spalte;
}

// Rechtsklick wie im Browser: Taste gedrückt, dann das Kontextmenü-Ereignis.
function rechtsklick(ziel) {
  const optionen = { button: 2, bubbles: true, cancelable: true, clientX: 40, clientY: 50 };
  const druck = new window.MouseEvent('mousedown', optionen);
  ziel.dispatchEvent(druck);
  const menue = new window.MouseEvent('contextmenu', optionen);
  ziel.dispatchEvent(menue);
  return { druck, menue };
}

const menueEintraege = () =>
  menueElement.hidden ? [] : [...menueElement.querySelectorAll('.context-menu-item')];

// Ziele im Live-Modus und in der gerenderten Hälfte.
const live = {
  zelle: () => spalte.view.contentDOM.querySelector('.perspective-datatable tbody td'),
  kopf: () => spalte.view.contentDOM.querySelector('.perspective-datatable th'),
  rand: () =>
    spalte.view.contentDOM.querySelector('.perspective-datatable').closest('.cm-live-block'),
  diagramm: () => spalte.view.contentDOM.querySelector('.perspective-chart'),
};
const gerendert = {
  zelle: () => spalte.root.querySelector('.pane-rendered .perspective-datatable tbody td'),
  diagramm: () => spalte.root.querySelector('.pane-rendered .perspective-chart'),
};

beforeEach(async () => {
  lebenszyklus.resetExtensionStateForTests();
  await lebenszyklus.applyExtensionsState([], { persist: false });
  hideContextMenu();
});

afterEach(() => {
  hideContextMenu();
  if (spalte) spalte.view.destroy();
  spalte = null;
  paneEditors.length = 0;
  for (const el of document.querySelectorAll('section.pane-group, .chart-dialog-modal')) {
    el.remove();
  }
});

describe('Live-Modus mit Bearbeiten (AK27, AK29)', () => {
  for (const [name, ziel] of [
    ['Datenzelle', live.zelle],
    ['Kopfzelle', live.kopf],
    ['Rand im Rahmen', live.rand],
  ]) {
    it(`Rechtsklick auf die Datentabelle (${name}): Gitter bleibt, ein Eintrag «einfügen»`, () => {
      const { view, tab, editorMenue } = baueSpalte();
      const marke = view.state.selection.main.head;
      const { druck, menue } = rechtsklick(ziel());
      expect(druck.defaultPrevented).toBe(true);
      expect(menue.defaultPrevented).toBe(true);
      expect(editorMenue.aufrufe).toBe(0);
      expect(view.state.selection.main.head).toBe(marke);
      expect(live.zelle()).not.toBeNull();
      const eintraege = menueEintraege();
      expect(eintraege.map((e) => e.dataset.menuId)).toEqual(['chart-insert']);
      expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, zeile: 3 });
    });
  }

  it('Rechtsklick auf das Diagramm: bleibt gezeichnet, ein Eintrag «bearbeiten»', () => {
    const { view, tab, editorMenue } = baueSpalte();
    const marke = view.state.selection.main.head;
    rechtsklick(live.diagramm());
    expect(editorMenue.aufrufe).toBe(0);
    expect(view.state.selection.main.head).toBe(marke);
    expect(live.diagramm().dataset.chartState).toBe('drawn');
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-edit']);
    expect(lageFuer(view, tab)).toMatchObject({ diagrammGewaehlt: true, zeile: 11 });
  });

  it('der Eintrag öffnet den Dialog des Kommandos', async () => {
    baueSpalte();
    rechtsklick(live.zelle());
    menueEintraege()[0].click();
    expect(menueElement.hidden).toBe(true);
    // Das Kommando wartet einen Takt auf eine offene Zell-Eingabe.
    await new Promise((weiter) => setTimeout(weiter, 5));
    const dialog = document.querySelector('.chart-dialog-modal');
    expect(dialog).not.toBeNull();
    dialog.querySelector('[data-aktion="abbrechen"]').click();
  });
});

describe('Live-Modus in der Anzeige (C3)', () => {
  for (const [name, ziel] of [
    ['Datentabelle', live.zelle],
    ['Diagramm', live.diagramm],
  ]) {
    it(`Rechtsklick auf ${name}: abgefangen, kein Menü, Block bleibt gezeichnet`, () => {
      const { view, editorMenue } = baueSpalte({ editMode: false });
      const marke = view.state.selection.main.head;
      const { menue } = rechtsklick(ziel());
      expect(menue.defaultPrevented).toBe(true);
      expect(editorMenue.aufrufe).toBe(0);
      expect(menueEintraege()).toEqual([]);
      expect(view.state.selection.main.head).toBe(marke);
      expect(ziel()).not.toBeNull();
      // F5: ohne Änderbarkeit keine Lage.
      expect(klickLage(view.state)).toBeNull();
    });
  }
});

describe('Wählbarkeit aus der Kommando-Palette (V4a)', () => {
  it('Bearbeiten an, aktive Spalte: der Eintrag erscheint', () => {
    const { view } = baueSpalte({ echteVerfuegbarkeit: true });
    rechtsklick(live.zelle());
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-insert']);
    hideContextMenu();
    rechtsklick(live.diagramm());
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-edit']);
    expect(klickLage(view.state)).not.toBeNull();
  });

  it('gerenderte Hälfte, Bearbeiten an: der Eintrag erscheint', () => {
    baueSpalte({ viewMode: 'split', echteVerfuegbarkeit: true });
    rechtsklick(gerendert.zelle());
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-insert']);
  });

  it('Bearbeiten aus: kein Eintrag', () => {
    baueSpalte({ editMode: false, echteVerfuegbarkeit: true });
    rechtsklick(live.zelle());
    rechtsklick(live.diagramm());
    expect(menueEintraege()).toEqual([]);
  });

  it('eine andere Spalte ist aktiv: kein Eintrag', () => {
    baueSpalte({ echteVerfuegbarkeit: true });
    appState.activePaneIndex = 1;
    try {
      rechtsklick(live.zelle());
      expect(menueEintraege()).toEqual([]);
    } finally {
      appState.activePaneIndex = 0;
    }
  });
});

describe('Eingerückter Block, etwa in einem Listenpunkt (F4)', () => {
  const LISTE = [
    'Absatz',
    '',
    '- Punkt',
    '',
    '  ```perspective-datatable',
    '  columns: Monat:text, Einnahmen:number',
    '  | Januar | 100 |',
    '  | Februar | 90 |',
    '  ```',
    '  ^umsatz',
    '',
    '  ```perspective-chart',
    '  table: ^umsatz',
    '  type: bar',
    '  labels: Monat',
    '  values: Einnahmen',
    '  ```',
    '',
    'Ende',
  ].join('\n');

  it('gerenderte Hälfte: Tabelle und Diagramm bekommen ihren Eintrag', () => {
    const { view, tab } = baueSpalte({ viewMode: 'split', doc: LISTE });
    rechtsklick(gerendert.zelle());
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-insert']);
    expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, zeile: 5 });
    hideContextMenu();
    rechtsklick(gerendert.diagramm());
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-edit']);
    expect(lageFuer(view, tab)).toMatchObject({ diagrammGewaehlt: true, zeile: 12 });
  });
});

describe('Rechtsklick in ein offenes Eingabefeld (V6)', () => {
  it('Live-Modus: kein Abbruch, kein Menü, nicht an den Editor; die Lage «Tabelle angeklickt» entsteht trotzdem', () => {
    const { view, tab } = baueSpalte();
    const zelle = live.zelle();
    const eingabe = document.createElement('input');
    eingabe.className = 'pdt-cell-input';
    zelle.appendChild(eingabe);
    const { druck, menue } = rechtsklick(eingabe);
    expect(druck.defaultPrevented).toBe(false);
    expect(menue.defaultPrevented).toBe(false);
    expect(menueEintraege()).toEqual([]);
    // Nicht an das Kontextmenü des Editors: Es klappte den Block auf, und die
    // offene Eingabe ginge verloren.
    expect(spalte.editorMenue.aufrufe).toBe(0);
    expect(eingabe.isConnected).toBe(true);
    expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, quelle: 'klick' });
  });

  it('gerenderte Hälfte: ebenso', () => {
    const { view, tab } = baueSpalte({ viewMode: 'split' });
    const eingabe = document.createElement('input');
    gerendert.zelle().appendChild(eingabe);
    const { menue } = rechtsklick(eingabe);
    expect(menue.defaultPrevented).toBe(false);
    expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, quelle: 'klick' });
  });
});

describe('Gerenderte Hälfte der geteilten Ansicht (AK30)', () => {
  it('Rechtsklick auf die Datentabelle: ein Eintrag «einfügen», Quelltext unverändert', () => {
    const { view, tab } = baueSpalte({ viewMode: 'split' });
    const vorher = view.state.doc.toString();
    const marke = view.state.selection.main.head;
    const { menue } = rechtsklick(gerendert.zelle());
    expect(menue.defaultPrevented).toBe(true);
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-insert']);
    expect(view.state.doc.toString()).toBe(vorher);
    expect(view.state.selection.main.head).toBe(marke);
    expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, zeile: 3, quelle: 'klick' });
  });

  it('Rechtsklick auf das Diagramm: ein Eintrag «bearbeiten»', () => {
    const { view, tab } = baueSpalte({ viewMode: 'split' });
    rechtsklick(gerendert.diagramm());
    expect(menueEintraege().map((e) => e.dataset.menuId)).toEqual(['chart-edit']);
    expect(lageFuer(view, tab)).toMatchObject({ diagrammGewaehlt: true, zeile: 11 });
  });

  it('in der Anzeige kein Menü', () => {
    baueSpalte({ viewMode: 'split', editMode: false });
    rechtsklick(gerendert.zelle());
    rechtsklick(gerendert.diagramm());
    expect(menueEintraege()).toEqual([]);
  });

  it('der Fokus auf einer Zelle vermerkt die Tabelle', () => {
    const { view, tab } = baueSpalte({ viewMode: 'split' });
    const zelle = spalte.root.querySelector(
      '.pane-rendered .perspective-datatable td.pdt-cell[tabindex]',
    );
    expect(zelle).not.toBeNull();
    zelle.focus();
    expect(lageFuer(view, tab)).toMatchObject({ inDatentabelle: true, zeile: 3 });
  });

  it('ein Block, dessen Zeile nicht mehr zum Quelltext passt, bleibt unberührt', () => {
    const { view } = baueSpalte({ viewMode: 'split' });
    // Quelltext oben verlängert, die gerenderte Hälfte noch nicht neu gebaut.
    view.dispatch({ changes: { from: 0, insert: 'neu\n' } });
    const { menue } = rechtsklick(gerendert.diagramm());
    expect(menue.defaultPrevented).toBe(false);
    expect(klickLage(view.state)).toBeNull();
  });

  it('ein Block, dessen Inhalt nicht mehr zum Quelltext passt, bleibt unberührt', () => {
    const { view } = baueSpalte({ viewMode: 'split' });
    // Eine Zelle im Quelltext geändert, die gerenderte Hälfte noch nicht neu
    // gebaut: Zeile und Art stimmen, der Inhalt nicht.
    const z = view.state.doc.line(5);
    view.dispatch({ changes: { from: z.from, to: z.to, insert: '| Januar | 1 | 2 |' } });
    const { menue } = rechtsklick(gerendert.zelle());
    expect(menue.defaultPrevented).toBe(false);
    expect(klickLage(view.state)).toBeNull();
  });
});

describe('Nicht abgefangen', () => {
  it('Lese-Ansicht: kein Menü, keine Lage (AK31)', () => {
    const { view } = baueSpalte({ viewMode: 'rendered', editMode: false });
    for (const ziel of [gerendert.zelle(), gerendert.diagramm()]) {
      const { druck, menue } = rechtsklick(ziel);
      expect(druck.defaultPrevented).toBe(false);
      expect(menue.defaultPrevented).toBe(false);
    }
    expect(menueEintraege()).toEqual([]);
    expect(klickLage(view.state)).toBeNull();
  });

  it('Erweiterung «Diagramm zu einer Datentabelle» aus: alles wie vorher (C4)', async () => {
    await lebenszyklus.applyExtensionsState(['perspective-chart'], { persist: false });
    const { view, editorMenue } = baueSpalte();
    const { druck, menue } = rechtsklick(live.zelle());
    expect(druck.defaultPrevented).toBe(false);
    expect(menue.defaultPrevented).toBe(false);
    expect(editorMenue.aufrufe).toBe(1);
    expect(menueEintraege()).toEqual([]);
    expect(klickLage(view.state)).toBeNull();
  });

  it('passiver Ort: eine Tabelle in einer Einbettung', () => {
    const { view, editorMenue } = baueSpalte();
    const echt = live.zelle().closest('.perspective-datatable');
    const einbettung = document.createElement('div');
    einbettung.className = 'wiki-embed-md-body markdown-body';
    const kopie = echt.cloneNode(true);
    einbettung.appendChild(kopie);
    echt.parentElement.appendChild(einbettung);
    const { menue } = rechtsklick(kopie.querySelector('td'));
    expect(menue.defaultPrevented).toBe(false);
    expect(editorMenue.aufrufe).toBe(1);
    expect(klickLage(view.state)).toBeNull();
  });
});

describe('Einträge des Menüs (chart-menu.js)', () => {
  const ausfuehren = () => {};
  it('genau ein passender Eintrag je Lage, keiner ohne Lage', () => {
    const t = (key) => `«${key}»`;
    expect(diagrammEintraege({ lage: null, ausfuehren })).toEqual([]);
    expect(
      diagrammEintraege({ lage: { inDatentabelle: false, diagrammGewaehlt: false }, ausfuehren }),
    ).toEqual([]);
    const [einfuegen] = diagrammEintraege({
      lage: { inDatentabelle: true, diagrammGewaehlt: false },
      t,
      ausfuehren,
    });
    expect(einfuegen).toMatchObject({
      key: 'command.chart.insert',
      label: '«command.chart.insert»',
      dataId: 'chart-insert',
      commandId: 'chart.insert',
    });
    const liste = diagrammEintraege({
      lage: { inDatentabelle: false, diagrammGewaehlt: true },
      ausfuehren,
    });
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ dataId: 'chart-edit', commandId: 'chart.edit' });
    expect(liste[0].label).toBeUndefined();
  });

  it('die Aktion reicht die Kennung an den Ausführer', () => {
    const gerufen = [];
    const [eintrag] = diagrammEintraege({
      lage: { inDatentabelle: true, diagrammGewaehlt: false },
      ausfuehren: (id) => gerufen.push(id),
    });
    eintrag.action();
    expect(gerufen).toEqual(['chart.insert']);
  });
});
