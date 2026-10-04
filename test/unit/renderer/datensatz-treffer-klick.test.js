// @vitest-environment jsdom
// 4T-002040 (Epic 3E-000258, Entscheidung F1 Option A): Der Klick auf einen
// Datensatz im Abfrage-Ergebnis öffnet die Maske des Datensatzes, am Bedienweg
// geprüft (Konzept «Test-Strategie und Qualitätssicherung», Kapitel 5.5).
//
// Gemessen wird der Weg, den der Anwender nimmt: das Markup der echten
// Befüllung (`buildQueryListDom`), der echte Klick-Handler der Lese- und der
// geteilten Ansicht (`handleRenderedClick`) und der echte Klick-Pfad der
// Live-Ansicht (`bindFrontmatterQueryClicks`), dazu die echte Masken-Seite mit
// ihrem Tor für den Aus-Zustand. Ersetzt ist allein das Öffnen einer Datei
// (`openInPane`, aufgefangen statt ausgeführt), damit der Fall sieht, dass
// **keine** Datei geöffnet wird, und der Lese-Kanal der Maske, damit er sieht,
// welcher Datensatz angefragt wird. Ob die Maske am gebauten Programm erscheint,
// steht im Ablauf-Fall DB-ABF-01.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

// Aufgefangen: das Öffnen einer Datei und das Aktivieren der Spalte. Letzteres
// gleicht die Werkzeugleiste an, die es in diesem Gerüst nicht gibt; welche
// Spalte aktiviert wird, hält der Fall fest.
const geoeffnet = [];
const aktiviert = [];
vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (...args) => {
    geoeffnet.push(args[1]);
    return args[0];
  },
  activatePane: (paneIdx) => {
    aktiviert.push(paneIdx);
  },
}));

const anfragen = [];
window.api.databaseDatensatz = async (params) => {
  anfragen.push(params);
  return null;
};
window.api.databaseSperre = async () => ({ ok: true });
window.api.onBacklinksInvalidated = () => {};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

// Bestands-Markup, so weit `openSystemPage` es anfasst (Muster
// `beleg-ansicht-seite.test.js`).
for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
      <section class="pane pane-mindmap"></section>
    </div>
  `;
}
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { handleRenderedClick } =
  await import('../../../src/renderer/modules/views/link-navigation.js');
const { bindFrontmatterQueryClicks } =
  await import('../../../src/renderer/modules/live/live-interaction.js');
const { buildQueryListDom } =
  await import('../../../src/renderer/modules/query/frontmatter-query-view.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { maskeOffen } = await import('../../../src/renderer/modules/database/masken-seite.js');
const rs = await import('../../../src/shared/query/result-set.js');

const LIBRARY = '/raum/Library.md';
const LOANS = '/raum/Loans.md';

// Eine Tabelle über die Ausleihen: erste Spalte der Treffer (die Ausleihe),
// zweite Spalte das Buch als Datensatz-Verweis.
function ausleihen() {
  const rows = [
    rs.makeRow(
      [{ kind: 'record', table: 'Library', id: 'r-00001', display: 'Zauberberg', path: LIBRARY }],
      { ...rs.recordOrigin('Loans', 'r-00007'), path: LOANS, display: 'Clara' },
    ),
  ];
  const resultSet = rs.makeResultSet({
    scope: 'records',
    type: 'table',
    columns: [rs.makeColumn({ name: 'book', label: 'Buch', source: 'book' })],
    rows,
    wishes: rs.makeWishes(),
    state: rs.makeState('ready', { area: { root: '/raum', fileCount: 2 } }),
  });
  return buildQueryListDom({ resultSet }, i18n.t);
}

function dateiListe() {
  const resultSet = rs.makeResultSet({
    scope: 'files',
    type: 'list',
    columns: [],
    rows: [rs.makeRow([], rs.fileOrigin('/raum/Alpha.md', 'Alpha'))],
    wishes: rs.makeWishes(),
    state: rs.makeState('ready', { area: { root: '/raum', fileCount: 1 } }),
  });
  return buildQueryListDom({ resultSet }, i18n.t);
}

// Lese- und geteilte Ansicht: Die Befüllung hängt in der Anzeige-Fläche der
// Spalte, und deren Klick-Zuhörer ruft handleRenderedClick (app-pane-bindings.js).
let flaeche = null;
function leseAnsicht(inhalt) {
  flaeche = document.querySelector('.pane-group[data-pane="0"] .markdown-body');
  flaeche.textContent = '';
  flaeche.appendChild(inhalt);
  flaeche.onclick = (e) => handleRenderedClick(e, 0);
  return flaeche;
}

// Live-Ansicht: ein echter Editor, in dessen Wurzel der Widget-Behälter hängt;
// den Pane-Index findet der Klick-Pfad über EditorView.findFromDOM.
let editorHost = null;
function liveAnsicht(inhalt) {
  editorHost = document.createElement('div');
  document.body.appendChild(editorHost);
  const view = new EditorView({ state: EditorState.create({ doc: '' }), parent: editorHost });
  paneEditors[0] = view;
  const behaelter = document.createElement('div');
  behaelter.className = 'cm-live-block markdown-body';
  behaelter.appendChild(inhalt);
  view.dom.appendChild(behaelter);
  bindFrontmatterQueryClicks(behaelter);
  return behaelter;
}

function klick(el) {
  const ereignis = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ereignis);
  return ereignis;
}

function mausDruck(el) {
  const ereignis = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ereignis);
  return ereignis;
}

function angefragt() {
  return anfragen.map((a) => [a.tabelle, a.kennung]);
}

async function raeumeAuf() {
  for (let p = state.panes.length - 1; p >= 0; p--) {
    for (let i = state.panes[p].tabs.length - 1; i >= 0; i--) {
      await closeTab(p, i, { skipDirtyCheck: true });
    }
  }
}

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  await raeumeAuf();
  geoeffnet.length = 0;
  aktiviert.length = 0;
  anfragen.length = 0;
});

afterEach(() => {
  if (flaeche) flaeche.onclick = null;
  if (editorHost) {
    if (paneEditors[0] && typeof paneEditors[0].destroy === 'function') paneEditors[0].destroy();
    paneEditors.length = 0;
    editorHost.remove();
    editorHost = null;
  }
});

describe('Lese- und geteilte Ansicht (handleRenderedClick)', () => {
  it('der Klick auf den Treffer öffnet die Maske dieses Datensatzes und keine Datei', () => {
    const root = leseAnsicht(ausleihen());
    const ereignis = klick(root.querySelector('tbody tr td:first-child a'));
    expect(ereignis.defaultPrevented).toBe(true);
    expect(maskeOffen()).toBe(true);
    expect(angefragt()).toEqual([[LOANS, 'r-00007']]);
    expect(geoeffnet).toEqual([]);
    // Zuerst die Spalte des Klicks, danach öffnet die Seite ihren Reiter.
    expect(aktiviert[0]).toBe(0);
  });

  it('der Klick auf den Datensatz-Verweis öffnet die Maske seines Ziels', () => {
    const root = leseAnsicht(ausleihen());
    klick(root.querySelector('tbody tr td:last-child a'));
    expect(maskeOffen()).toBe(true);
    expect(angefragt()).toEqual([[LIBRARY, 'r-00001']]);
    expect(geoeffnet).toEqual([]);
  });

  it('der Treffer der Datei-Ebene öffnet unverändert die Datei', () => {
    const root = leseAnsicht(dateiListe());
    klick(root.querySelector('a.perspective-query-item'));
    expect(geoeffnet).toEqual([['/raum/Alpha.md']]);
    expect(maskeOffen()).toBe(false);
  });

  it('ohne Kennung oder Tabelle geschieht nichts, auch keine Neuanlage', () => {
    // Schon das Ereignis an die Masken-Seite bleibt aus; deren eigene Prüfung
    // ist die zweite Sicherung und wird hier nicht vorausgesetzt.
    const ereignisse = [];
    const zaehle = (e) => ereignisse.push(e.detail);
    document.addEventListener('scg:open-form', zaehle);
    const root = leseAnsicht(ausleihen());
    const a = root.querySelector('tbody tr td:first-child a');
    delete a.dataset.fmRecordTable;
    expect(klick(a).defaultPrevented).toBe(true);
    a.dataset.fmRecordTable = LOANS;
    a.dataset.fmRecordId = '';
    klick(a);
    document.removeEventListener('scg:open-form', zaehle);
    expect(ereignisse).toEqual([]);
    expect(maskeOffen()).toBe(false);
    expect(anfragen).toEqual([]);
    expect(geoeffnet).toEqual([]);
  });
});

describe('Live-Ansicht (bindFrontmatterQueryClicks)', () => {
  it('Treffer und Verweis öffnen die Maske; der Block bleibt geschlossen', () => {
    const behaelter = liveAnsicht(ausleihen());
    const treffer = mausDruck(behaelter.querySelector('tbody tr td:first-child a'));
    expect(treffer.defaultPrevented).toBe(true);
    mausDruck(behaelter.querySelector('tbody tr td:last-child a'));
    expect(angefragt()).toEqual([
      [LOANS, 'r-00007'],
      [LIBRARY, 'r-00001'],
    ]);
    expect(maskeOffen()).toBe(true);
    expect(geoeffnet).toEqual([]);
    expect(aktiviert[0]).toBe(0);
  });
});

describe('Aus-Zustand der Erweiterung «Datenbank»', () => {
  it('kein Klick-Weg und kein Fehler: weder Maske noch Datei', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    const root = leseAnsicht(ausleihen());
    expect(klick(root.querySelector('tbody tr td:last-child a')).defaultPrevented).toBe(true);
    const behaelter = liveAnsicht(ausleihen());
    mausDruck(behaelter.querySelector('tbody tr td:first-child a'));
    expect(maskeOffen()).toBe(false);
    expect(anfragen).toEqual([]);
    expect(geoeffnet).toEqual([]);
  });
});
