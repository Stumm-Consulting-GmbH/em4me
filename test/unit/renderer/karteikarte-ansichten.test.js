// @vitest-environment jsdom
// 4T-002406 (Epic 3E-000266, Entscheidung F7 Option A): Dokument und Einzel-Maske
// einer Karteikarte, am Bedienweg geprüft.
//
// Gemessen werden die drei Klick-Wege eines Datensatzes über ihre echten
// Einstiege — der Sprung eines Datensatz-Treffers der Suche
// (`springeZuDatensatz`), der Klick auf einen Datensatz im Abfrage-Ergebnis
// (`recordHitOf` und `openRecordHit` an einem Element der echten Darstellung)
// und der Verweis `[[Tabelle#^…]]` im Fließtext (`activateLink`) — mit der echten
// Weiche aus `karteikarte-ansichten.js`. Ersetzt sind allein das Öffnen einer
// Datei (aufgefangen statt ausgeführt), die Statuszeile und die Kanäle des
// Haupt-Prozesses. Dazu der Handgriff «In der Maske öffnen» am Dokument, seine
// Verfügbarkeit und der Aus-Zustand. Den Handgriff «Karteikarte öffnen» der
// Maske prüft `masken-fehlt.test.js`; am gebauten Programm prüft beides der
// Ablauf-Fall DB-KAS-05.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const geoeffnet = [];
vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (spalte, pfade) => {
    geoeffnet.push([spalte, pfade]);
    return spalte;
  },
  activatePane: () => {},
}));
const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showStatusbarHint: (key) => hinweise.push(key),
}));

const AUTHORS = '/raum/Authors/Authors.md';
const ECO = '/raum/Authors/Umberto Eco.md';
const LIBRARY = '/raum/Library.md';
const READINGS = '/raum/Readings.md';

// Die Kanäle des Haupt-Prozesses: die Karteikarte eines Datensatzes, der
// Überblick der Datenbank und das Ziel eines Verweises.
let karteikarten;
const kartenAnfragen = [];
window.api.databaseKarteikarte = async (params) => {
  kartenAnfragen.push(params);
  return karteikarten(params);
};
window.api.databaseOverview = async () => ({
  status: 'ready',
  istDatenbankBereich: true,
  tabellen: [
    { path: AUTHORS, storage: 'cards' },
    { path: LIBRARY, storage: 'table' },
  ],
});
let verweisZiel = () => null;
window.api.databaseVerweisZiel = async (params) => verweisZiel(params);
window.api.resolveLink = async (basis, ziel) => basis.replace(/[^/]*$/, '') + ziel;
window.api.fileExists = async () => true;
window.api.isMarkdownPath = async (pfad) => /\.md$/.test(pfad);
window.api.onBacklinksInvalidated = () => {};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

// Bestands-Markup, so weit das Aktivieren einer Spalte es anfasst (Muster
// `datensatz-treffer-klick.test.js`).
for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
    </div>
  `;
}
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { datenbankAuskunft, verwirfDatenbankAuskunft } =
  await import('../../../src/renderer/modules/database/datenbank-bereich.js');
const { openRecordHit, recordHitOf, markRecordHit } =
  await import('../../../src/renderer/modules/query/record-hit-click.js');
const { springeZuDatensatz } =
  await import('../../../src/renderer/modules/search/search-records.js');
const { activateLink } = await import('../../../src/renderer/modules/views/link-navigation.js');
const { aktiveKarteikarteInMaske } =
  await import('../../../src/renderer/modules/database/karteikarte-ansichten.js');
const { karteikarteImReiterSofort, karteikarteAus } =
  await import('../../../src/renderer/modules/database/karteikarte-erkennung.js');
const { availabilityContext, isAvailable } =
  await import('../../../src/shared/commands/command-availability.js');
const { COMMANDS } = await import('../../../src/shared/commands/commands.js');

const ECO_TEXT = '---\ndb-record: r-00003\nname: Umberto Eco\n---\n\n# Umberto Eco\n';

let masken;
const merke = (e) => masken.push(e.detail);

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  geoeffnet.length = 0;
  hinweise.length = 0;
  kartenAnfragen.length = 0;
  karteikarten = () => null;
  verweisZiel = () => null;
  masken = [];
  document.addEventListener('scg:open-form', merke);
  // Der Überblick ist bereit; damit kennt die Weiche die Tabellen-Form.
  verwirfDatenbankAuskunft({ bereichsWechsel: true });
  await datenbankAuskunft();
  state.panes[0].tabs = [{ path: '/raum/Notiz.md', viewMode: 'rendered', content: '' }];
  state.panes[0].activeIndex = 0;
  state.activePaneIndex = 0;
});

afterEach(() => {
  document.removeEventListener('scg:open-form', merke);
  state.panes[0].tabs = [];
  state.panes[0].activeIndex = -1;
});

// Ein Datensatz-Treffer des Abfrage-Ergebnisses, gezeichnet wie dort.
function abfrageTreffer(tabelle, kennung) {
  const a = document.createElement('a');
  markRecordHit(a, { path: tabelle, table: 'T', id: kennung });
  return a;
}

describe('Klick-Ziel einer Karteikarte (F7 A, AK2)', () => {
  it('der Datensatz-Treffer der Suche öffnet das Dokument der Karteikarte, keine Maske', async () => {
    karteikarten = () => ({ datei: ECO });
    expect(springeZuDatensatz({ sprung: { tabelle: AUTHORS, kennung: 'r-00003' } })).toBe(true);
    await vi.waitFor(() => expect(geoeffnet).toHaveLength(1));
    expect(kartenAnfragen).toEqual([{ tabelle: AUTHORS, kennung: 'r-00003' }]);
    expect(geoeffnet).toEqual([[0, [ECO]]]);
    expect(masken).toEqual([]);
  });

  it('der Datensatz-Verweis im Abfrage-Ergebnis öffnet das Dokument der Karteikarte', async () => {
    karteikarten = () => ({ datei: ECO });
    expect(openRecordHit(recordHitOf(abfrageTreffer(AUTHORS, 'r-00003')))).toBe(true);
    await vi.waitFor(() => expect(geoeffnet).toEqual([[0, [ECO]]]));
    expect(masken).toEqual([]);
  });

  it('der Verweis im Fließtext öffnet das Dokument der Karteikarte', async () => {
    verweisZiel = () => ({ tabelle: AUTHORS, kennung: 'r-00003' });
    karteikarten = () => ({ datei: ECO });
    await activateLink(0, 'Authors/Authors.md#r-3', true);
    await vi.waitFor(() => expect(geoeffnet).toEqual([[0, [ECO]]]));
    expect(masken).toEqual([]);
  });

  it('bei einer Tabelle in Tabellen-Form bleibt die Maske das Ziel, ohne Frage', async () => {
    expect(springeZuDatensatz({ sprung: { tabelle: LIBRARY, kennung: 'r-00001' } })).toBe(true);
    // Synchron wie vor 4T-002406: kein Umweg über den Kanal.
    expect(masken).toEqual([{ filePath: LIBRARY, recordId: 'r-00001' }]);
    expect(kartenAnfragen).toEqual([]);
    expect(geoeffnet).toEqual([]);
  });

  it('ohne Karteikarte im Bestand oder bei einem Fehler des Kanals öffnet die Maske', async () => {
    openRecordHit({ path: AUTHORS, id: 'r-00099' });
    await vi.waitFor(() => expect(masken).toEqual([{ filePath: AUTHORS, recordId: 'r-00099' }]));
    karteikarten = () => {
      throw new Error('Kanal gestört');
    };
    openRecordHit({ path: AUTHORS, id: 'r-00003' });
    await vi.waitFor(() => expect(masken).toHaveLength(2));
    expect(masken[1]).toEqual({ filePath: AUTHORS, recordId: 'r-00003' });
    expect(geoeffnet).toEqual([]);
  });

  it('die Zeile einer Listen-Maske öffnet weiter ihre Einzel-Maske', () => {
    karteikarten = () => ({ datei: ECO });
    const zeile = document.createElement('tr');
    markRecordHit(zeile, { path: AUTHORS, table: 'Authors', id: 'r-00003' });
    zeile.dataset.fmRecordZiel = 'maske';
    zeile.appendChild(document.createElement('td'));
    expect(openRecordHit(recordHitOf(zeile.firstChild))).toBe(true);
    expect(masken).toEqual([{ filePath: AUTHORS, recordId: 'r-00003' }]);
    expect(kartenAnfragen).toEqual([]);
  });

  it('im Aus-Zustand der Erweiterung übernimmt die Weiche nicht', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    karteikarten = () => ({ datei: ECO });
    openRecordHit({ path: AUTHORS, id: 'r-00003' });
    // Das Ereignis geht wie bisher an die Masken-Seite, deren Tor nichts öffnet.
    expect(masken).toEqual([{ filePath: AUTHORS, recordId: 'r-00003' }]);
    expect(kartenAnfragen).toEqual([]);
    expect(geoeffnet).toEqual([]);
  });
});

describe('«In der Maske öffnen» am Dokument (F7 A, AK3)', () => {
  function aktiv(path, content) {
    state.panes[0].tabs = [{ path, content, viewMode: 'rendered' }];
    state.panes[0].activeIndex = 0;
  }
  const kommando = COMMANDS.find((c) => c.id === 'database.openInForm');
  const verfuegbar = () =>
    isAvailable(
      kommando.availability,
      availabilityContext({ karteikarteTab: karteikarteImReiterSofort(state.panes[0].tabs[0]) }),
    );

  it('öffnet an einer Karteikarte die Einzel-Maske ihres Datensatzes', async () => {
    aktiv(ECO, ECO_TEXT);
    expect(verfuegbar()).toBe(true);
    expect(await aktiveKarteikarteInMaske()).toBe(true);
    expect(masken).toEqual([{ filePath: AUTHORS, recordId: 'r-00003' }]);
    expect(hinweise).toEqual([]);
  });

  it('ist an einem Dokument, das keine Karteikarte ist, nicht verfügbar', async () => {
    aktiv(READINGS, '---\ntitle: Readings\n---\n\n# Readings\n');
    expect(verfuegbar()).toBe(false);
    expect(await aktiveKarteikarteInMaske()).toBe(false);
    expect(masken).toEqual([]);
    expect(hinweise).toEqual(['database.card.noCardActive']);
  });

  it('erkennt weder die Tabellen-Datei noch ein Dokument ohne Kennung als Karteikarte', () => {
    const tabellen = [{ path: AUTHORS, storage: 'cards' }];
    expect(karteikarteAus(ECO, ECO_TEXT, tabellen)).toEqual({
      tabelle: AUTHORS,
      kennung: 'r-00003',
    });
    expect(karteikarteAus(AUTHORS, '---\ndb-table:\n  storage: cards\n---\n', tabellen)).toBe(null);
    expect(karteikarteAus('/raum/Authors/Neu.md', '---\nname: Neu\n---\n', tabellen)).toBe(null);
    // Zwei Kartei-Tabellen im Ordner: keine ist zuständig.
    const zwei = [...tabellen, { path: '/raum/Authors/Andere.md', storage: 'cards' }];
    expect(karteikarteAus(ECO, ECO_TEXT, zwei)).toBe(null);
    expect(karteikarteAus(ECO, ECO_TEXT, null)).toBe(null);
  });

  it('ist im Aus-Zustand der Erweiterung nicht verfügbar und tut nichts', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    aktiv(ECO, ECO_TEXT);
    expect(verfuegbar()).toBe(false);
    expect(await aktiveKarteikarteInMaske()).toBe(false);
    expect(masken).toEqual([]);
  });
});
