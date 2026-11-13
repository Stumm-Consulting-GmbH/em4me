// @vitest-environment jsdom
// 4T-002548 (Epic 3E-000368, Story 4S-001201, AK5; Nachzug nach der
// Entscheidung des Product Owners vom 2026-11-12, Empfehlung pauschal
// übernommen): Der Workflow-Schritt `db-open` wartet an einer Maske mit
// ungespeicherter Bearbeitung auf die Antwort der Rückfrage.
//
// Gemessen an der echten Masken-Seite und am echten Fenster-Handgriff
// (`runWindowAction`): echte Rückfrage, echte Knöpfe, echtes Schließen des
// Reiters. Ersetzt sind allein die Kanäle des Hauptprozesses (Datensatz-Abruf,
// Sperre) und das Öffnen einer Datei; Gerüst nach `datensatz-treffer-klick.test.js`.
// Dazu die Warte-Stelle selbst (`masken-warten.js`) ohne Seite.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (paneIdx) => paneIdx,
  activatePane: () => {},
}));

const anfragen = [];
window.api.databaseDatensatz = async (params) => {
  anfragen.push(params);
  return {
    status: 'ready',
    anzeige: params.kennung,
    fields: [{ name: 'Title', type: 'string' }],
    zellen: [{ name: 'Title', text: 'Alt', value: 'Alt', error: null }],
    koerper: { quelle: 'erzeugt', segmente: [{ art: 'feld', name: 'Title' }] },
  };
};
window.api.databaseSperre = async (p) =>
  p.aktion === 'nehmen' ? { status: 'ready', gehalten: true, stand: 's1' } : { ok: true };
window.api.databaseOverview = async () => ({ status: 'ready', tabellen: [] });
window.api.renderMarkdown = (text) => text;
window.api.onBacklinksInvalidated = () => {};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

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
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');
const { findSystemTabAcrossPanes } =
  await import('../../../src/renderer/modules/app/system-pages.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { MASKEN_PAGE_ID, oeffneMaske } =
  await import('../../../src/renderer/modules/database/masken-seite.js');
const { runWindowAction } =
  await import('../../../src/renderer/modules/workflows/workflow-window.js');
const { erzeugeWarteStelle } =
  await import('../../../src/renderer/modules/database/masken-warten.js');

const TABELLE = '/raum/Library.md';

const maske = () => document.querySelector('.pane-group[data-pane="0"] .pane-system .db-form-page');
const klick = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

async function raeumeAuf() {
  for (let p = state.panes.length - 1; p >= 0; p--) {
    for (let i = state.panes[p].tabs.length - 1; i >= 0; i--) {
      await closeTab(p, i, { skipDirtyCheck: true });
    }
  }
}

// Die Maske von r-00001 in ungespeicherter Bearbeitung: Titel «Neu» getippt.
async function inBearbeitung() {
  oeffneMaske(TABELLE, 'r-00001');
  await vi.waitFor(() => expect(maske().querySelector('.db-form-edit')).not.toBe(null));
  klick(maske().querySelector('.db-form-edit'));
  await vi.waitFor(() => expect(maske().querySelector('.db-form-input')).not.toBe(null));
  const eingabe = maske().querySelector('.db-form-input');
  eingabe.value = 'Neu';
  eingabe.dispatchEvent(new Event('input', { bubbles: true }));
}

// Der Schritt `db-open "Library" "r-00002"`, wie ihn der Hauptprozess auflöst.
function dbOpen() {
  return runWindowAction({
    ok: true,
    line: 3,
    keyword: 'db-open',
    window: { action: 'dbOpen', path: TABELLE, record: 'r-00002', neu: false },
  });
}

// Wartet der Schritt noch? Ein Ergebnis nach einer Runde Mikro-Aufgaben heißt nein.
async function nochOffen(versprechen) {
  const marke = Symbol('offen');
  const erster = await Promise.race([versprechen, new Promise((r) => setTimeout(() => r(marke)))]);
  return erster === marke;
}

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  await raeumeAuf();
  anfragen.length = 0;
});

describe('db-open wartet auf die Rückfrage der Maske (4T-002548)', () => {
  it('ohne ungespeicherte Bearbeitung öffnet der Schritt sofort, unverändert', async () => {
    const res = await dbOpen();
    expect(res).toMatchObject({ ok: true, effect: { kind: 'opened', via: 'window' } });
    await vi.waitFor(() => expect(anfragen.at(-1)).toMatchObject({ kennung: 'r-00002' }));
  });

  it('«Verwerfen»: der Schritt wartet, dann zeigt die Maske das Ziel und der Lauf geht weiter', async () => {
    await inBearbeitung();
    const schritt = dbOpen();
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    expect(await nochOffen(schritt)).toBe(true);
    klick(maske().querySelector('.db-form-confirm-discard'));
    expect(await schritt).toMatchObject({ ok: true, keyword: 'db-open' });
    await vi.waitFor(() => expect(anfragen.at(-1)).toMatchObject({ kennung: 'r-00002' }));
  });

  it('«Weiter bearbeiten»: der Schritt endet mit eigenem Grund, die Bearbeitung bleibt', async () => {
    await inBearbeitung();
    const bisher = anfragen.length;
    const schritt = dbOpen();
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    klick(maske().querySelector('.db-form-confirm-back'));
    expect(await schritt).toEqual({
      ok: false,
      line: 3,
      keyword: 'db-open',
      code: 'dbOpenEditContinued',
      detail: { path: TABELLE },
    });
    expect(maske().querySelector('.db-form-confirm')).toBe(null);
    expect(maske().querySelector('.db-form-input').value).toBe('Neu');
    expect(anfragen).toHaveLength(bisher);
    expect(i18n.t('workflow.fehlschlag.dbOpenEditContinued')).toBe(
      'Die Maske wurde nicht geöffnet, weil die ungespeicherte Bearbeitung fortgesetzt wird',
    );
  });

  it('der Reiter der Maske schließt während des Wartens: der Schritt endet mit Grund', async () => {
    await inBearbeitung();
    const schritt = dbOpen();
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    const ort = findSystemTabAcrossPanes(MASKEN_PAGE_ID);
    await closeTab(ort.paneIdx, ort.tabIdx, { skipDirtyCheck: true });
    expect(await schritt).toMatchObject({ ok: false, code: 'dbOpenFormClosed' });
  });

  it('ein anderes Öffnen ersetzt das Ziel während des Wartens: der Schritt endet mit Grund', async () => {
    await inBearbeitung();
    const schritt = dbOpen();
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    oeffneMaske(TABELLE, 'r-00003');
    expect(await schritt).toMatchObject({ ok: false, code: 'dbOpenFormClosed' });
    // Die Rückfrage steht jetzt für das neue Ziel; die Bearbeitung bleibt.
    expect(maske().querySelector('.db-form-confirm')).not.toBe(null);
    expect(maske().querySelector('.db-form-input').value).toBe('Neu');
  });
});

describe('Warte-Stelle (masken-warten.js)', () => {
  it('gibt die Antwort genau einmal; ein neues Warten beendet das alte als verschwunden', async () => {
    const stelle = erzeugeWarteStelle();
    expect(stelle.wartet()).toBe(false);
    const erstes = stelle.warte();
    expect(stelle.wartet()).toBe(true);
    const zweites = stelle.warte();
    expect(await erstes).toBe('verschwunden');
    stelle.beende('zurueck');
    stelle.beende('geoeffnet');
    expect(await zweites).toBe('zurueck');
    expect(stelle.wartet()).toBe(false);
  });
});
