// @vitest-environment jsdom
// 4T-002024 (Epic 3E-000192): Die Kommandos «Diagramm zu dieser Tabelle
// einfügen» und «Diagramm bearbeiten» (charts/chart-commands.js) am Bedienweg.
//
// **Gemessen an den echten Live-Widgets und am echten Dialog:** Die Lage
// entsteht über den Klick an der Spalten-Wurzel oder über die Schreibmarke,
// der Dialog wird über seine Knöpfe bestätigt, Rückgängig ist ein Tastendruck
// Strg+Z am Editor. Ersetzt sind allein die Anschlüsse außerhalb des
// Gegenstands: die Statusleiste (Meldung wird mitgeschrieben), der Neu-Aufbau
// der gerenderten Hälfte (Aufruf wird gezählt) und der Lese-Kanal des anderen
// Dokuments.
//
// 4T-002072: Eine Tabelle ohne Namen bekommt beim Einfügen die erste
// Kopf-Zeile `table: tabelle-1`, unter ihr steht keine Zeile; die Lage des
// neuen Diagramms kommt als Stelle im neuen Text aus dem Schreib-Kern.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { buildChart } from '../../../src/main/preload-diagramme.js';
import './api-stub.js';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DE = JSON.parse(readFileSync(path.join(wurzel, 'src/i18n/de.json'), 'utf8'));

const { showStatusbarHint, renderPaneContent, cancelPendingPreviewUpdate } = vi.hoisted(() => ({
  showStatusbarHint: vi.fn(),
  renderPaneContent: vi.fn(),
  cancelPendingPreviewUpdate: vi.fn(),
}));
vi.mock('../../../src/renderer/i18n.js', async (original) => ({
  ...(await original()),
  t: (key) => DE[key] ?? key,
}));
vi.mock('../../../src/renderer/modules/views/views.js', async (original) => ({
  ...(await original()),
  showStatusbarHint,
}));
vi.mock('../../../src/renderer/modules/views/pane-render.js', async (original) => ({
  ...(await original()),
  renderPaneContent,
}));
vi.mock('../../../src/renderer/modules/editor/editor-preview.js', async (original) => ({
  ...(await original()),
  cancelPendingPreviewUpdate,
}));

window.api.renderMarkdown = (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen);
window.api.buildChart = buildChart;
// Der Zeichner misst Text ohne Zeichenfläche; jsdom hat keine.
window.HTMLCanvasElement.prototype.getContext = () => null;

const { Compartment, EditorState } = await import('@codemirror/state');
const { EditorView, keymap } = await import('@codemirror/view');
const { history, historyKeymap, undoDepth } = await import('@codemirror/commands');
const { markdown } = await import('@codemirror/lang-markdown');
const { Table: LezerTable } = await import('@lezer/markdown');
const { livePreviewExtensions } =
  await import('../../../src/renderer/modules/live/live-widgets.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state: appState } = await import('../../../src/renderer/modules/app/app-state.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { KLASSE_GEWAEHLT, lageErweiterung, lageFuer, offenFuer, setzeLage } =
  await import('../../../src/renderer/modules/charts/chart-lage.js');
const { bindeDiagrammBedienung } =
  await import('../../../src/renderer/modules/charts/chart-bedienung.js');
const { runChartEdit, runChartInsert } =
  await import('../../../src/renderer/modules/charts/chart-commands.js');

const Z = '```';
const KOPF = 'columns: Monat:text, Einnahmen:number, Ausgaben:number';
const ZEILEN = ['| Januar | 100 | 80 |', '| Februar | 90 | 95 |'];
const tabelle = (kopf = KOPF, zeilen = ZEILEN) => [`${Z}perspective-datatable`, kopf, ...zeilen, Z];
const diagramm = (tabellenAngabe = '^umsatz', art = 'bar') => [
  `${Z}perspective-chart`,
  `table: ${tabellenAngabe}`,
  `type: ${art}`,
  'labels: Monat',
  'values: Einnahmen',
  Z,
];
const text = (...zeilen) => zeilen.join('\n');

// Zeile 1 Absatz, 3–7 Datentabelle ohne Namen, 9 Ende.
const OHNE_NAME = text('Absatz', '', ...tabelle(), '', 'Ende');
// Zeile 3–7 Datentabelle, 8 Name, 10–15 Diagramm, 17 Ende.
const MIT_DIAGRAMM = text('Absatz', '', ...tabelle(), '^umsatz', '', ...diagramm(), '', 'Ende');

let spalte = null;

function baueSpalte(doc, { viewMode = 'live', editMode = true } = {}) {
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
        history(),
        keymap.of(historyKeymap),
        viewMode === 'live' ? livePreviewExtensions : [],
        lageErweiterung,
        schreibschutz.of(EditorState.readOnly.of(!editMode)),
      ],
    }),
    parent: root.querySelector('.pane-source-editor'),
  });
  if (viewMode === 'split') {
    root.querySelector('.pane-rendered .markdown-body').innerHTML = renderMarkdown(doc, 'de');
  }
  const tab = { path: 'C:/Bereich/Bericht.md', viewMode, editMode, content: doc };
  paneEditors[0] = view;
  appState.panes[0].tabs = [tab];
  appState.panes[0].activeIndex = 0;
  appState.activePaneIndex = 0;
  bindeDiagrammBedienung(root, 0, { istVerfuegbar: () => tab.editMode, meldeMenue: () => {} });
  spalte = { root, view, tab };
  return spalte;
}

const schreibschutz = new Compartment();
const doc = () => spalte.view.state.doc.toString();
const zeile = (n) => spalte.view.state.doc.line(n).text;

function maus(ziel, button = 0) {
  ziel.dispatchEvent(
    new window.MouseEvent('mousedown', { button, bubbles: true, cancelable: true }),
  );
}
const liveZelle = () => spalte.view.contentDOM.querySelector('.perspective-datatable tbody td');
const liveDiagramme = () => [...spalte.view.contentDOM.querySelectorAll('.perspective-chart')];

const dialog = () => document.querySelector('.chart-dialog-modal');
async function warteAufDialog() {
  for (let i = 0; i < 50 && !dialog(); i++) await new Promise((weiter) => setTimeout(weiter, 0));
  return dialog();
}
async function bestaetige(lauf, aenderung) {
  const d = await warteAufDialog();
  expect(d).not.toBeNull();
  if (aenderung) aenderung(d);
  d.querySelector('[data-aktion="bestaetigen"]').click();
  await lauf;
}
async function brichAb(lauf) {
  const d = await warteAufDialog();
  d.querySelector('[data-aktion="abbrechen"]').click();
  await lauf;
}
function waehleArt(d, art) {
  const auswahl = d.querySelector('#chart-dialog-type');
  auswahl.value = art;
  auswahl.dispatchEvent(new window.Event('change', { bubbles: true }));
}
function strgZ() {
  spalte.view.contentDOM.dispatchEvent(
    new window.KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}
const gemessen = () =>
  new Promise((weiter) => requestAnimationFrame(() => requestAnimationFrame(weiter)));
const meldung = () => {
  const aufrufe = showStatusbarHint.mock.calls;
  return aufrufe.length ? aufrufe[aufrufe.length - 1][1].text : null;
};
const fuelle = (key, werte) =>
  Object.entries(werte).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), DE[key]);

beforeEach(async () => {
  lebenszyklus.resetExtensionStateForTests();
  await lebenszyklus.applyExtensionsState([], { persist: false });
  showStatusbarHint.mockClear();
  renderPaneContent.mockClear();
  cancelPendingPreviewUpdate.mockClear();
  delete window.api.readChartTableDocument;
});

afterEach(() => {
  if (dialog()) dialog().querySelector('[data-aktion="abbrechen"]').click();
  if (spalte) spalte.view.destroy();
  spalte = null;
  paneEditors.length = 0;
  for (const el of document.querySelectorAll('section.pane-group')) el.remove();
});

describe('Einfügen (AK4, AK5, AK27, AK18)', () => {
  it('über den Klick auf das Gitter: Name und Block in einem Schritt, beide gezeichnet, Diagramm ausgewählt', async () => {
    const { view, tab } = baueSpalte(OHNE_NAME);
    const marke = view.state.selection.main.head;
    maus(liveZelle(), 2);
    await bestaetige(runChartInsert(0));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    // 4T-002072: Der Name steht als erste Kopf-Zeile in der Tabelle, sonst
    // bleibt sie unverändert; unter ihr Leerzeile und Block, keine Namens-Zeile.
    const vorher = OHNE_NAME.split('\n');
    expect(doc().split('\n').slice(0, 8)).toEqual([
      ...vorher.slice(0, 3),
      'table: tabelle-1',
      ...vorher.slice(3, 7),
    ]);
    expect(zeile(9)).toBe('');
    expect(zeile(10)).toBe(`${Z}perspective-chart`);
    expect(zeile(11)).toBe('table: tabelle-1');
    expect(doc().endsWith('\n\nEnde')).toBe(true);
    expect(view.state.selection.main.head).toBe(marke);
    expect(undoDepth(view.state)).toBe(1);
    // Gitter und neues Diagramm stehen gezeichnet da; das Diagramm ist
    // ausgewählt (C2).
    expect(liveZelle()).not.toBeNull();
    expect(liveDiagramme()).toHaveLength(1);
    expect(lageFuer(view, tab)).toMatchObject({
      diagrammGewaehlt: true,
      zeile: 10,
      quelle: 'klick',
    });
    await gemessen();
    expect(liveDiagramme()[0].dataset.chartState).toBe('drawn');
    expect(liveDiagramme()[0].classList.contains(KLASSE_GEWAEHLT)).toBe(true);
    expect(offenFuer(view)).toBeNull();
  });

  it('Tabelle mit Kopf-Namen: bleibt unverändert, das Diagramm nennt ihn und ist ausgewählt', async () => {
    const benannt = text('Absatz', '', ...tabelle(`table: Umsatz\n${KOPF}`), '', 'Ende');
    const { view, tab } = baueSpalte(benannt);
    maus(liveZelle(), 2);
    await bestaetige(runChartInsert(0));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(doc().startsWith(benannt.slice(0, benannt.indexOf('\n\nEnde')) + '\n\n')).toBe(true);
    expect(zeile(10)).toBe(`${Z}perspective-chart`);
    expect(zeile(11)).toBe('table: Umsatz');
    expect(lageFuer(view, tab)).toMatchObject({ diagrammGewaehlt: true, zeile: 10 });
  });

  it('über die Schreibmarke im Quelltext-Modus', async () => {
    const { view } = baueSpalte(OHNE_NAME, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });
    await bestaetige(runChartInsert(0));
    expect(zeile(4)).toBe('table: tabelle-1');
    expect(renderPaneContent).not.toHaveBeenCalled();
  });

  it('ein Strg+Z nimmt Kopf-Zeile und Block zusammen zurück', async () => {
    baueSpalte(OHNE_NAME);
    maus(liveZelle(), 2);
    await bestaetige(runChartInsert(0));
    expect(doc()).not.toBe(OHNE_NAME);
    strgZ();
    expect(doc()).toBe(OHNE_NAME);
  });

  it('eine Eingabe unmittelbar danach bleibt ein eigener Rückgängig-Schritt', async () => {
    const { view } = baueSpalte(OHNE_NAME);
    maus(liveZelle(), 2);
    await bestaetige(runChartInsert(0));
    const nachEinfuegen = doc();
    // Getippt direkt hinter dem eingefügten Block: Ohne eigenen Schritt
    // verschmölze die Eingabe mit dem Einfügen, und ein Strg+Z nähme beides.
    const ende = nachEinfuegen.indexOf('\n\nEnde');
    view.dispatch({ changes: { from: ende, insert: 'x' }, userEvent: 'input.type' });
    strgZ();
    expect(doc()).toBe(nachEinfuegen);
    strgZ();
    expect(doc()).toBe(OHNE_NAME);
  });

  it('Abbruch ändert nichts und vergibt keinen Namen (AK11)', async () => {
    const { view } = baueSpalte(OHNE_NAME);
    maus(liveZelle(), 2);
    await brichAb(runChartInsert(0));
    expect(doc()).toBe(OHNE_NAME);
    expect(undoDepth(view.state)).toBe(0);
    expect(offenFuer(view)).toBeNull();
  });

  it('eine offene Zell-Eingabe wird zuerst übernommen, danach eingefügt', async () => {
    const { view } = baueSpalte(OHNE_NAME);
    const zelle = spalte.view.contentDOM.querySelector(
      '.perspective-datatable tbody td[data-dt-col="1"]',
    );
    maus(zelle);
    zelle.click();
    const eingabe = spalte.view.contentDOM.querySelector('.pdt-cell-input');
    expect(eingabe).not.toBeNull();
    expect(document.activeElement).toBe(eingabe);
    eingabe.value = '111';
    await bestaetige(runChartInsert(0));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    // Die Kopf-Zeile schiebt die erste Datenzeile von 5 auf 6.
    expect(zeile(6)).toContain('111');
    expect(zeile(4)).toBe('table: tabelle-1');
    expect(undoDepth(view.state)).toBe(2);
  });

  it('geteilte Ansicht: Rechtsklick in der gerenderten Hälfte, danach baut sie neu auf', async () => {
    const { root } = baueSpalte(OHNE_NAME, { viewMode: 'split' });
    maus(root.querySelector('.pane-rendered .perspective-datatable td'), 2);
    await bestaetige(runChartInsert(0));
    expect(zeile(4)).toBe('table: tabelle-1');
    expect(renderPaneContent).toHaveBeenCalledWith(0);
    expect(cancelPendingPreviewUpdate).toHaveBeenCalledWith(0);
  });

  it('Live-Modus baut die gerenderte Hälfte nicht neu auf', async () => {
    baueSpalte(OHNE_NAME);
    maus(liveZelle(), 2);
    await bestaetige(runChartInsert(0));
    expect(renderPaneContent).not.toHaveBeenCalled();
  });
});

describe('Bearbeiten (AK7, AK8, AK19, AK29)', () => {
  it('über den Klick auf das Diagramm: vorbelegt, geschrieben, sofort neu gezeichnet', async () => {
    const { view, tab } = baueSpalte(MIT_DIAGRAMM);
    maus(liveDiagramme()[0]);
    const vorher = liveDiagramme()[0];
    await bestaetige(runChartEdit(0), (d) => {
      expect(d.querySelector('#chart-dialog-type').value).toBe('bar');
      expect(d.querySelector('#chart-dialog-labels').value).toBe('Monat');
      waehleArt(d, 'line');
    });
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(doc()).toBe(MIT_DIAGRAMM.replace('type: bar', 'type: line'));
    expect(liveDiagramme()).toHaveLength(1);
    expect(liveDiagramme()[0]).not.toBe(vorher);
    expect(liveDiagramme()[0].dataset.chartState).toBe('drawn');
    expect(lageFuer(view, tab)).toMatchObject({ diagrammGewaehlt: true, zeile: 10 });
  });

  it('ein Strg+Z nimmt die Änderung zurück', async () => {
    baueSpalte(MIT_DIAGRAMM);
    maus(liveDiagramme()[0]);
    await bestaetige(runChartEdit(0), (d) => waehleArt(d, 'pie'));
    expect(doc()).not.toBe(MIT_DIAGRAMM);
    strgZ();
    expect(doc()).toBe(MIT_DIAGRAMM);
  });

  it('eine Eingabe unmittelbar danach bleibt ein eigener Rückgängig-Schritt', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(12).from } });
    await bestaetige(runChartEdit(0), (d) => waehleArt(d, 'line'));
    const nachBearbeiten = doc();
    // Getippt am Ende der geschriebenen Zeilen, direkt vor dem Schluss-Zaun.
    view.dispatch({
      changes: { from: view.state.doc.line(15).from, insert: 'x' },
      userEvent: 'input.type',
    });
    strgZ();
    expect(doc()).toBe(nachBearbeiten);
    strgZ();
    expect(doc()).toBe(MIT_DIAGRAMM);
  });

  it('unverändert bestätigt: nichts geschrieben, kein Rückgängig-Schritt', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM);
    maus(liveDiagramme()[0]);
    await bestaetige(runChartEdit(0));
    expect(doc()).toBe(MIT_DIAGRAMM);
    expect(undoDepth(view.state)).toBe(0);
  });

  it('Abbruch ändert nichts (AK12)', async () => {
    baueSpalte(MIT_DIAGRAMM);
    maus(liveDiagramme()[0]);
    await brichAb(runChartEdit(0));
    expect(doc()).toBe(MIT_DIAGRAMM);
  });

  it('Diagramm auf ein anderes Dokument: dessen Spalten im Dialog, nur der Block wird geschrieben (AK9, AK13)', async () => {
    const ANDERES = text(
      'Titel',
      '',
      ...tabelle('columns: Ort:text, Menge:number', ['| Bonn | 3 |', '| Köln | 5 |']),
      '^umsatz',
    );
    const lesungen = [];
    window.api.readChartTableDocument = async (basePath, file) => {
      lesungen.push([basePath, file]);
      return { ok: true, path: 'C:/Bereich/Andere.md', content: ANDERES, quelle: 'platte' };
    };
    // Jeder Aufruf der Brücke wird mitgeschrieben: Ein Weg, der das andere
    // Dokument verändern könnte, wäre ein schreibender Eintrag der Brücke.
    const aufrufe = [];
    const original = {};
    for (const [name, fn] of Object.entries(window.api)) {
      if (typeof fn !== 'function') continue;
      original[name] = fn;
      window.api[name] = (...args) => {
        aufrufe.push(name);
        return fn(...args);
      };
    }
    const eigen = text('Absatz', '', ...diagramm('[[Andere#^umsatz]]'), '', 'Ende');
    baueSpalte(eigen, { viewMode: 'source' });
    spalte.view.dispatch({ selection: { anchor: spalte.view.state.doc.line(4).from } });
    await bestaetige(runChartEdit(0), (d) => {
      // V3: ein Satz mit zwei Platzhaltern, kein zusammengesetzter Text.
      expect(d.querySelector('.chart-dialog-tabelle').textContent).toBe(
        'Tabelle: umsatz im Dokument «Andere»',
      );
      const spalten = [...d.querySelectorAll('#chart-dialog-labels option')].map((o) => o.value);
      expect(spalten).toEqual(['Ort', 'Menge']);
      waehleArt(d, 'line');
    });
    expect(lesungen).toContainEqual(['C:/Bereich/Bericht.md', 'Andere']);
    expect(zeile(4)).toBe('table: [[Andere#^umsatz]]');
    expect(zeile(5)).toBe('type: line');
    expect(zeile(6)).toBe('labels: Ort');
    expect(zeile(7)).toBe('values: Menge');
    Object.assign(window.api, original);
    // Das andere Dokument ist nur gelesen worden.
    expect(aufrufe).toContain('readChartTableDocument');
    expect(aufrufe.filter((n) => /write|save|rename|delete|move|create/i.test(n))).toEqual([]);
  });
});

describe('Die Stelle wird mitgeführt (Auflage K4 des Schreib-Kerns)', () => {
  // Zwei gleiche Diagramme; gewählt ist das zweite.
  const ZWEI = text(...tabelle(), '^umsatz', '', ...diagramm(), '', ...diagramm(), '', 'Ende');

  it('Dialog offen, oberhalb eingefügt: geändert wird der richtige Block, der gleiche an der alten Zeile bleibt', async () => {
    const { view } = baueSpalte(ZWEI, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(16).from } });
    const lauf = runChartEdit(0);
    await warteAufDialog();
    // Sieben Zeilen oben: Das erste Diagramm (Zeile 8) steht danach an der
    // alten Zeile 15 des zweiten.
    view.dispatch({ changes: { from: 0, insert: '1\n2\n3\n4\n5\n6\n7\n' } });
    expect(zeile(15)).toBe(`${Z}perspective-chart`);
    await bestaetige(lauf, (d) => waehleArt(d, 'line'));
    expect(zeile(17)).toBe('type: bar');
    expect(zeile(24)).toBe('type: line');
  });

  it('Block gelöscht, während der Dialog offen ist: nichts geschrieben, Meldung', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(12).from } });
    const lauf = runChartEdit(0);
    await warteAufDialog();
    view.dispatch({
      changes: { from: view.state.doc.line(10).from, to: view.state.doc.line(16).from },
    });
    const vorher = doc();
    await bestaetige(lauf, (d) => waehleArt(d, 'line'));
    expect(doc()).toBe(vorher);
    expect(meldung()).toBe(DE['chart.command.changedMeanwhile']);
  });

  it('Tabelle geändert, während der Dialog offen ist: nichts geschrieben, Meldung', async () => {
    const { view } = baueSpalte(OHNE_NAME);
    maus(liveZelle(), 2);
    const lauf = runChartInsert(0);
    await warteAufDialog();
    const z = view.state.doc.line(5);
    view.dispatch({ changes: { from: z.from, to: z.to, insert: '| Januar | 1 | 2 |' } });
    const vorher = doc();
    await bestaetige(lauf);
    expect(doc()).toBe(vorher);
    expect(meldung()).toBe(DE['chart.command.changedMeanwhile']);
  });
});

describe('Meldung statt Dialog (AK15)', () => {
  async function ohneDialog(lauf) {
    await lauf;
    expect(dialog()).toBeNull();
  }
  const einfuegenGrund = (key) => fuelle('chart.command.cannotInsert', { reason: DE[key] });
  const bearbeitenGrund = (satz) => fuelle('chart.command.cannotEdit', { reason: satz });

  it('Tabelle ohne Zahl-Spalte', async () => {
    const doc0 = text(...tabelle('columns: A:text, B:text', ['| x | y |']));
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartInsert(0));
    expect(meldung()).toBe(einfuegenGrund('chart.command.reason.noNumberColumn'));
    expect(doc()).toBe(doc0);
  });

  it('Tabelle mit Fehler im Aufbau', async () => {
    const doc0 = text(...tabelle('columns: A:text, B:zahl', ['| x | 1 |']));
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartInsert(0));
    expect(meldung()).toBe(einfuegenGrund('chart.command.reason.tableInvalid'));
  });

  it('Tabelle mit offenem Zaun', async () => {
    const doc0 = text(`${Z}perspective-datatable`, KOPF, ...ZEILEN);
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartInsert(0));
    expect(meldung()).toBe(einfuegenGrund('chart.command.reason.tableUnclosed'));
  });

  it('Diagramm, dessen Tabelle fehlt', async () => {
    const doc0 = text(...diagramm('^fehlt'));
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(
      bearbeitenGrund(fuelle('chart.hint.reason.tableMissing', { name: 'fehlt' })),
    );
  });

  it('Diagramm, dessen Name zu einer anderen Art gehört', async () => {
    const doc0 = text('| a | b |', '| - | - |', '| 1 | 2 |', '^umsatz', '', ...diagramm());
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(7).from } });
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(
      bearbeitenGrund(fuelle('chart.hint.reason.tableOtherKind', { name: 'umsatz' })),
    );
  });

  it('anderes Dokument nicht gefunden', async () => {
    window.api.readChartTableDocument = async () => ({ ok: false, error: 'not found' });
    const doc0 = text(...diagramm('[[Andere#^umsatz]]'));
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(
      bearbeitenGrund(fuelle('chart.hint.reason.documentMissing', { file: 'Andere' })),
    );
    expect(offenFuer(view)).toBeNull();
  });

  // 4T-002023 (Wortlaut): Fehlt die Tabelle im anderen Dokument, nennt der
  // Satz dieses Dokument statt «in diesem Dokument».
  it('anderes Dokument gefunden, Tabelle fehlt darin: der Satz nennt das andere Dokument', async () => {
    window.api.readChartTableDocument = async () => ({
      ok: true,
      path: 'C:/Bereich/Andere.md',
      content: text('Titel', '', 'Keine Tabelle.'),
      quelle: 'platte',
    });
    const doc0 = text(...diagramm('[[Andere#^umsatz]]'));
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(
      bearbeitenGrund(
        fuelle('chart.hint.reason.tableMissingInFile', { name: 'umsatz', file: 'Andere' }),
      ),
    );
    expect(meldung()).toContain('im Dokument «Andere» nicht vor');
    expect(doc()).toBe(doc0);
  });

  it('anderes Dokument, solange das Verzeichnis noch nicht bereit ist', async () => {
    window.api.readChartTableDocument = async () => ({
      ok: false,
      error: 'not found',
      indexBereit: false,
    });
    const doc0 = text(...diagramm('[[Andere#^umsatz]]'));
    const { view } = baueSpalte(doc0, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(
      bearbeitenGrund(fuelle('chart.command.reason.indexNotReady', { file: 'Andere' })),
    );
  });

  it('keine Tabelle und kein Diagramm gewählt', async () => {
    baueSpalte(OHNE_NAME, { viewMode: 'source' });
    await ohneDialog(runChartInsert(0));
    expect(meldung()).toBe(DE['chart.command.noTable']);
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(DE['chart.command.noChart']);
  });

  it('Dokument nicht änderbar (AK17)', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM, { editMode: false });
    view.dispatch({
      effects: setzeLage.of({ art: 'diagramm', pos: view.state.doc.line(10).from }),
    });
    await ohneDialog(runChartEdit(0));
    expect(meldung()).toBe(DE['chart.command.notEditable']);
    expect(doc()).toBe(MIT_DIAGRAMM);
  });
});

describe('Nach dem Dialog wird erneut geprüft (F1)', () => {
  it('Bearbeiten ausgeschaltet, während der Dialog offen ist: nichts geschrieben, Meldung', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(12).from } });
    const lauf = runChartEdit(0);
    await warteAufDialog();
    // Wie Strg+E: Bearbeiten aus, der Editor wird schreibgeschützt.
    spalte.tab.editMode = false;
    view.dispatch({ effects: schreibschutz.reconfigure(EditorState.readOnly.of(true)) });
    await bestaetige(lauf, (d) => waehleArt(d, 'line'));
    expect(doc()).toBe(MIT_DIAGRAMM);
    expect(meldung()).toBe(DE['chart.command.notEditable']);
    expect(offenFuer(view)).toBeNull();
  });

  it('anderes Dokument mit gleichem Inhalt aktiv geworden: nichts geschrieben, Meldung', async () => {
    const { view, tab } = baueSpalte(OHNE_NAME, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });
    const lauf = runChartInsert(0);
    await warteAufDialog();
    // Wechsel zu einem Reiter mit identischem Inhalt: Alle Reiter einer Spalte
    // teilen den Editor, dessen Text bleibt, wie er ist.
    const anderer = { ...tab, path: 'C:/Bereich/Kopie.md' };
    appState.panes[0].tabs = [tab, anderer];
    appState.panes[0].activeIndex = 1;
    await bestaetige(lauf);
    expect(doc()).toBe(OHNE_NAME);
    expect(meldung()).toBe(DE['chart.command.changedMeanwhile']);
  });
});

describe('Zweiter Aufruf bei offenem Dialog (DE-17)', () => {
  it('holt den offenen Dialog nach vorn: Fokus auf seinem ersten Feld, kein zweiter Dialog, keine Meldung', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(12).from } });
    const lauf = runChartEdit(0);
    const d = await warteAufDialog();
    // Der Fokus wandert weg, etwa in die Kommando-Palette.
    view.focus();
    expect(document.activeElement).not.toBe(d.querySelector('#chart-dialog-type'));
    await runChartEdit(0);
    await runChartInsert(0);
    expect(document.querySelectorAll('.chart-dialog-modal')).toHaveLength(1);
    expect(document.activeElement).toBe(d.querySelector('#chart-dialog-type'));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    await brichAb(lauf);
    expect(doc()).toBe(MIT_DIAGRAMM);
  });
});

describe('Kein stiller Fehlschlag (V2)', () => {
  it('ein Fehler beim Schreiben wird gemeldet und protokolliert; danach geht es weiter', async () => {
    const { view } = baueSpalte(OHNE_NAME, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    const echt = view.dispatch.bind(view);
    let einmal = true;
    view.dispatch = (...args) => {
      if (einmal && args[0] && args[0].changes) {
        einmal = false;
        throw new Error('Probe');
      }
      return echt(...args);
    };
    try {
      await bestaetige(runChartInsert(0));
      expect(meldung()).toBe(DE['chart.command.failedInsert']);
      expect(protokoll).toHaveBeenCalled();
      expect(offenFuer(view)).toBeNull();
      expect(doc()).toBe(OHNE_NAME);
      // Die Sperre ist frei: Das nächste Kommando öffnet den Dialog wieder.
      await bestaetige(runChartInsert(0));
      expect(zeile(4)).toBe('table: tabelle-1');
    } finally {
      protokoll.mockRestore();
    }
  });

  it('beim Bearbeiten lautet die Meldung «nicht geändert»', async () => {
    const { view } = baueSpalte(MIT_DIAGRAMM, { viewMode: 'source' });
    view.dispatch({ selection: { anchor: view.state.doc.line(12).from } });
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.api.readChartTableDocument = () => {
      throw new Error('nie gerufen');
    };
    const echt = view.dispatch.bind(view);
    view.dispatch = (...args) => {
      if (args[0] && args[0].changes) throw new Error('Probe');
      return echt(...args);
    };
    try {
      await bestaetige(runChartEdit(0), (d) => waehleArt(d, 'line'));
      expect(meldung()).toBe(DE['chart.command.failedEdit']);
      expect(offenFuer(view)).toBeNull();
    } finally {
      protokoll.mockRestore();
    }
  });
});

describe('Eingerückter Block in einem Listenpunkt (F4)', () => {
  const LISTE = text(
    'Absatz',
    '',
    '- Punkt',
    '',
    '  ```perspective-datatable',
    '  columns: Monat:text, Einnahmen:number',
    '  | Januar | 100 |',
    '  | Februar | 90 |',
    '  ```',
    '',
    'Ende',
  );

  it('Einfügen aus der gerenderten Hälfte schreibt eingerückt in und unter die Tabelle', async () => {
    const { root } = baueSpalte(LISTE, { viewMode: 'split' });
    maus(root.querySelector('.pane-rendered .perspective-datatable td'), 2);
    await bestaetige(runChartInsert(0));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(doc()).toBe(
      text(
        'Absatz',
        '',
        '- Punkt',
        '',
        '  ```perspective-datatable',
        '  table: tabelle-1',
        '  columns: Monat:text, Einnahmen:number',
        '  | Januar | 100 |',
        '  | Februar | 90 |',
        '  ```',
        '',
        '  ```perspective-chart',
        '  table: tabelle-1',
        '  type: bar',
        '  labels: Monat',
        '  values: Einnahmen',
        '  ```',
        '',
        'Ende',
      ),
    );
  });

  it('Bearbeiten des eingerückten Diagramms schreibt eingerückt', async () => {
    const mitDiagramm = text(
      '- Punkt',
      '',
      '  ```perspective-datatable',
      '  columns: Monat:text, Einnahmen:number',
      '  | Januar | 100 |',
      '  ```',
      '  ^umsatz',
      '',
      '  ```perspective-chart',
      '  table: ^umsatz',
      '  type: bar',
      '  labels: Monat',
      '  values: Einnahmen',
      '  ```',
    );
    const { root } = baueSpalte(mitDiagramm, { viewMode: 'split' });
    maus(root.querySelector('.pane-rendered .perspective-chart'), 2);
    await bestaetige(runChartEdit(0), (d) => waehleArt(d, 'line'));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(doc()).toBe(mitDiagramm.replace('  type: bar', '  type: line'));
  });
});
