// @vitest-environment jsdom
// 4T-002548 (Epic 3E-000368, Story 4S-001201, Nachzug aus der Gegenlese-Runde):
// Wird der Reiter der Maske mit ungespeicherter Bearbeitung geschlossen, zeigt
// ein späteres Öffnen das angefragte Ziel, von Hand wie im Lauf eines
// Workflow-Schritts `db-open`, und der Lauf meldet «geöffnet» nur, weil die
// Maske das Ziel tatsächlich zeigt.
//
// Gemessen an der echten Masken-Seite; Gerüst nach
// `workflow-db-open-warten.test.js`. Ersetzt sind allein die Kanäle des
// Hauptprozesses (Datensatz-Abruf, Sperre) und das Öffnen einer Datei.
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
const sperren = [];
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
window.api.databaseSperre = async (p) => {
  sperren.push(p);
  return p.aktion === 'nehmen' ? { status: 'ready', gehalten: true, stand: 's1' } : { ok: true };
};
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
const { MASKEN_PAGE_ID, oeffneMaske, oeffneMaskeImLauf } =
  await import('../../../src/renderer/modules/database/masken-seite.js');

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

async function schliesseMaske() {
  const ort = findSystemTabAcrossPanes(MASKEN_PAGE_ID);
  await closeTab(ort.paneIdx, ort.tabIdx, { skipDirtyCheck: true });
  expect(findSystemTabAcrossPanes(MASKEN_PAGE_ID)).toBe(null);
}

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  await raeumeAuf();
  anfragen.length = 0;
  sperren.length = 0;
});

describe('Maske nach dem Schließen mit ungespeicherter Bearbeitung', () => {
  it('der Lauf öffnet danach das angefragte Ziel und meldet erst dann «geöffnet»', async () => {
    await inBearbeitung();
    await schliesseMaske();
    const ergebnis = await oeffneMaskeImLauf(TABELLE, 'r-00002');
    expect(ergebnis).toBe('geoeffnet');
    await vi.waitFor(() => expect(anfragen.at(-1)).toMatchObject({ kennung: 'r-00002' }));
    await vi.waitFor(() =>
      expect(maske().querySelector('.db-form-record').textContent).toContain('r-00002'),
    );
    expect(maske().querySelector('.db-form-confirm')).toBe(null);
    expect(maske().dataset.formMode).not.toBe('edit');
  });

  it('von Hand zeigt ein späteres Öffnen das angefragte Ziel ohne Rückfrage', async () => {
    await inBearbeitung();
    await schliesseMaske();
    oeffneMaske(TABELLE, 'r-00003');
    await vi.waitFor(() => expect(anfragen.at(-1)).toMatchObject({ kennung: 'r-00003' }));
    await vi.waitFor(() =>
      expect(maske().querySelector('.db-form-record').textContent).toContain('r-00003'),
    );
    expect(maske().querySelector('.db-form-confirm')).toBe(null);
  });

  it('das Schließen gibt die Sperre der Bearbeitung frei', async () => {
    await inBearbeitung();
    await vi.waitFor(() => expect(sperren.some((s) => s.aktion === 'nehmen')).toBe(true));
    await schliesseMaske();
    await vi.waitFor(() => expect(sperren.some((s) => s.aktion === 'freigeben')).toBe(true));
  });
});
