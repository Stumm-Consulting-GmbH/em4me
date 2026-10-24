// @vitest-environment jsdom
// 4T-002149 (Epic 3E-000264), AK5: Die neuen Zusagen des Anschlusses der
// Datensätze an Suche, Verweise und Sitzung im Aus-Zustand der Erweiterung
// «Datenbank», jede einzeln nachgewiesen. Anlass ist die stehende Auflage des
// Arbeitspakets 2A-000039 («der Aus-Zustand wächst mit»): Jede Stufe weist ihre
// neuen Zusagen einzeln nach. Dieses Epic ist das sechste Mitglied der Stufe 4;
// benannt sind die Zusagen am 2026-10-20 in der Liste S11 der Plan-Vorlage:
//
//   1. Die Bereichs-Suche liefert keine Datensatz-Treffer.
//   2. Der Klick auf einen Datensatz-Verweis öffnet die Datei ohne Sprung in
//      die Maske.
//   3. Die Vorschlagsliste bietet keine Datensätze an.
//   4. Der Sitzungs-Eintrag eines Masken-Dokuments ruht und geht nicht verloren.
//
// **Warum eine eigene Datei neben den Prüfdateien der Umsetzungs-Tasks.** Jene
// messen die Funktionen im An-Zustand und tragen ihren Aus-Fall nur als
// Randfall (`area-search-records.test.js`, `db-verweisziel-kanal.test.js`,
// `renderer/autocomplete-anker.test.js`, `renderer/sitzungs-maske.test.js`).
// Die Auflage verlangt den gesammelten Einzel-Nachweis je Stufe, wie
// `datensatz-aus-zustand.test.js` und `db-berechtigung-aus-zustand.test.js` ihn
// für ihre Stufen führen; jeder Fall hier legt einen Schalter um, und ein
// vergessenes Zurückstellen kippte dort fremde Fälle. Die Zusagen liegen auf
// beiden Seiten der Anwendung, gehören aber zu EINER Auflage; sie stehen
// deshalb in einer Datei in der Umgebung jsdom, wie
// `renderer/extensions-aus-gestaltete-maske.test.js` neben der Anzeige einen
// Baustein des Haupt-Prozesses lädt.
//
// **Gemessen wird am Tor, nicht an einer Behauptung.** Keine Zusage trägt einen
// eigenen Schalter (F6 A); jede gilt, weil ein Tor davor schließt:
//
//   Zusage 1: der Schalter der Datensatz-Erfassung (`setzeDatensatzErfassung`
//             in `src/main/index/index-schalter.js`), den
//             `datensatzTreffer` in `src/main/area/area-search-records.js`
//             als erstes fragt.
//   Zusage 2: derselbe Schalter in `loeseDatensatzVerweis`
//             (`src/main/index/datensatz-verweis-aufloesung.js`), das Tor
//             `datenbankAktiv` vor dem Kanal `database:verweisZiel`
//             (`src/main/ipc/database.js`) und im Anzeige-Prozess
//             `isExtensionActive('database')` vor der Anfrage im Klick-Weg
//             (`src/renderer/modules/views/link-navigation.js`).
//   Zusage 3: `isExtensionActive('database')` vor der Datensatz-Anfrage der
//             Vorschlagsliste (`src/renderer/modules/editor/autocomplete-anker.js`).
//   Zusage 4: das Wurzel-Tor der ECHTEN Masken-Seite (`oeffneMaske` in
//             `src/renderer/modules/database/masken-seite.js`), die sich beim
//             Laden mit ihrem Öffner beim Register der Sitzung anmeldet
//             (`src/renderer/modules/app/sitzungs-maske.js`).
//
// **Jede Zusage trägt ihre Gegenprobe:** Im An-Zustand geschieht am selben
// Aufbau das Gegenteil, sonst bewiese der Aus-Fall nichts.
//
// Setup-Muster: Temp-Bereich und Index-Warteschleife aus
// `area-search-records.test.js` und `db-verweisziel-kanal.test.js`, die
// Anzeige-Seite (aufgefangenes Öffnen einer Datei, Bestands-Markup, Lese-Kanal
// der Maske) aus `renderer/datensatz-treffer-klick.test.js` und
// `renderer/extensions-aus-gestaltete-maske.test.js`. Die Haupt-Prozess-Module
// stehen statisch in der Import-Kette; ihren Zustand (Schalter, Overlay,
// Zwischenspeicher, Index) nimmt die Datei über `createRequire`, wie die
// Nachbarn.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EditorState } from '@codemirror/state';
import './renderer/api-stub.js';
import de from '../../src/i18n/de.json';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';
import { datensatzTreffer } from '../../src/main/area/area-search-records.js';
import { loeseDatensatzVerweis } from '../../src/main/index/datensatz-verweis-aufloesung.js';
import { registerDatabaseIpc } from '../../src/main/ipc/database.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require_('../../src/main/index/datensatz-zugriff.js');
const { clearCaches } = require_('../../src/main/index/record-table-read.js');
const datensatzSuche = require_('../../src/main/area/area-search-records.js');
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

// Aufgefangen wie in `renderer/datensatz-treffer-klick.test.js`: das Öffnen
// einer Datei und das Aktivieren der Spalte, die es in diesem Gerüst nicht gibt.
const geoeffnet = [];
vi.mock('../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (...args) => {
    geoeffnet.push(args[1]);
    return args[0];
  },
  activatePane: () => {},
}));

// Der Lese-Kanal der Maske: Er zeigt, ob und welchen Datensatz die Maske holt.
const maskenAnfragen = [];
window.api.databaseDatensatz = async (params) => {
  maskenAnfragen.push(params);
  return null;
};
window.api.databaseSperre = async () => ({ ok: true });
window.api.onBacklinksInvalidated = () => {};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

// Bestands-Markup, so weit `openSystemPage` es anfasst.
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

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
// Der Link-Weg zuerst, wie in `renderer/datensatz-treffer-klick.test.js`: Er
// bindet das aufgefangene Öffnen nur, wenn er vor dem Fenster-Zustand geladen
// wird; in umgekehrter Reihenfolge rief der Klick das echte Öffnen (gemessen
// am 2026-10-22).
const { activateLink } = await import('../../src/renderer/modules/views/link-navigation.js');
const { state } = await import('../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../src/renderer/modules/tabs/tabs.js');
const lebenszyklus = await import('../../src/renderer/modules/extensions/extension-lifecycle.js');
const { ankerVorschlaege } =
  await import('../../src/renderer/modules/editor/autocomplete-anker.js');
const { MASKEN_PAGE_ID, maskeOffen } =
  await import('../../src/renderer/modules/database/masken-seite.js');
const { systemTabsFuer, stelleMaskenWieder } =
  await import('../../src/renderer/modules/app/sitzungs-maske.js');

// --- Fixtures ----------------------------------------------------------------------------

// Eine Tabelle «Library» mit Kennung, Schlüssel und Anzeige-Form (Muster
// `db-verweisziel-kanal.test.js`).
const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Kürzel',
  '    - name: Titel',
  '    - name: Autor',
  '  key: Kürzel',
  '  display: Titel',
  '---',
  '',
  'Die Bücher der Bibliothek.',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| B-1',
  '| Solaris',
  '| Stanisław Lem',
  '|- id="r-00002"',
  '| B-2',
  '| Der Zauberberg',
  '| Thomas Mann',
  '```',
  '',
].join('\n');

// Die Anzeige-Seite arbeitet mit festen Pfaden; ihr Bereich ist eine Attrappe.
const LIBRARY = '/raum/Library.md';

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

// --- Setup/Teardown ----------------------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

async function schalteDatenbank(an) {
  await lebenszyklus.applyExtensionsState(an ? [] : ['database'], { persist: false });
  expect(lebenszyklus.isExtensionActive('database')).toBe(an);
}

async function raeumeAuf() {
  for (let p = state.panes.length - 1; p >= 0; p--) {
    for (let i = state.panes[p].tabs.length - 1; i >= 0; i--) {
      await closeTab(p, i, { skipDirtyCheck: true });
    }
  }
}

// Ein Bereich mit der Tabelle «Library» und einer Notiz, Index bereit.
async function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-anschluss-aus-'));
  tmpDirs.push(wurzel);
  const kopf = path.join(wurzel, 'Library.md');
  fs.writeFileSync(kopf, TABELLE, 'utf8');
  const notiz = path.join(wurzel, 'Notiz.md');
  fs.writeFileSync(notiz, 'Siehe [[Library#^r-1]].', 'utf8');
  let r = backlinksFor(notiz);
  openRoots.add(rootForActiveFile(notiz));
  for (let i = 0; i < 500 && r.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    r = backlinksFor(notiz);
  }
  expect(r.status).toBe('ready');
  const indexWurzel = rootForActiveFile(notiz);
  return { wurzel, indexWurzel, kopf, sicht: indexes.get(indexWurzel) };
}

beforeEach(async () => {
  await schalteDatenbank(true);
  await raeumeAuf();
  geoeffnet.length = 0;
  maskenAnfragen.length = 0;
});

afterEach(async () => {
  // Beide Schalter sind Modul-Zustand und überleben den Fall; ohne diese Zeilen
  // liefen die Nachbar-Dateien im Aus-Zustand.
  setzeDatensatzErfassung(true);
  await schalteDatenbank(true);
  await raeumeAuf();
  clearAllBufferOverlays();
  datensatzSuche.gibDatensatzVorratFrei();
  vergissAlleDefinitionen();
  zwischenspeicherLeeren();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// --- Zusage 1: keine Datensatz-Treffer der Bereichs-Suche --------------------------------

describe('Zusage 1: Aus-Zustand, die Bereichs-Suche liefert keine Datensatz-Treffer', () => {
  it(
    'ohne Datensatz-Erfassung keine Treffer, keine Gruppen und kein Vorrat; eingeschaltet trifft derselbe Aufruf',
    async () => {
      const { indexWurzel: wurzel } = await bereich();
      const aufbautenVorher = datensatzSuche._nurFuerTests.aufbauten();

      setzeDatensatzErfassung(false);
      expect(datensatzTreffer(wurzel, 'Lem', 'gm')).toEqual({
        treffer: [],
        gruppen: [],
        abgeschnitten: false,
        bytes: 0,
      });
      // Kein Vorrat: Es wurde keine Liste aufgebaut.
      expect(datensatzSuche._nurFuerTests.aufbauten()).toBe(aufbautenVorher);

      // Gegenprobe: eingeschaltet liefert derselbe Aufruf den Datensatz-Treffer.
      setzeDatensatzErfassung(true);
      const an = datensatzTreffer(wurzel, 'Lem', 'gm');
      expect(an.treffer.map((t) => [t.quelle, t.anzeige, t.feld, t.sprung.kennung])).toEqual([
        ['record', 'Solaris', 'Autor', 'r-00001'],
      ]);
      expect(an.gruppen).toHaveLength(1);
      expect(an.bytes).toBeGreaterThan(0);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- Zusage 2: der Klick öffnet die Datei ohne Sprung in die Maske -----------------------

describe('Zusage 2: Aus-Zustand, ein Datensatz-Verweis führt nicht in die Maske', () => {
  function registriereKanal({ sicht, datenbankAktiv }) {
    const kanaele = new Map();
    const backlinks = {
      ensureIndexForDemand: vi.fn(),
      datenbankSicht: vi.fn(() => ({ status: 'ready', meta: null, sicht })),
      bufferTextFor: () => null,
    };
    registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), {
      areaRootForEvent: (event) => (event && event.wurzel) || null,
      backlinks,
      isMarkdownPath,
      schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
      datenbankAktiv,
    });
    return { kanal: kanaele.get('database:verweisZiel'), backlinks };
  }

  it(
    'Haupt-Prozess: die Auflösung antwortet «keiner» und der Kanal ohne Tabelle und Kennung',
    async () => {
      const { wurzel, kopf, sicht } = await bereich();
      const ereignis = { wurzel, sender: { id: 1 } };

      // Gegenprobe zuerst: eingeschaltet löst die Kurzform zur Kennung auf, und
      // der Kanal nennt Kopf-Datei und Kennung.
      expect(loeseDatensatzVerweis(sicht, kopf, 'r-1')).toEqual({
        status: 'kennung',
        kennung: 'r-00001',
        treffers: ['r-00001'],
      });
      const offen = registriereKanal({ sicht, datenbankAktiv: () => true });
      expect(await offen.kanal(ereignis, { zielPfad: kopf, anker: 'r-1' })).toEqual({
        tabelle: kopf,
        kennung: 'r-00001',
      });

      // Aus-Zustand: derselbe Eintrag, dieselben Anker.
      setzeDatensatzErfassung(false);
      for (const anker of ['r-1', 'r-00001', 'Solaris']) {
        expect(loeseDatensatzVerweis(sicht, kopf, anker), anker).toEqual({
          status: 'keiner',
          kennung: null,
          treffers: [],
        });
      }
      const zu = registriereKanal({ sicht, datenbankAktiv: () => false });
      expect(await zu.kanal(ereignis, { zielPfad: kopf, anker: 'r-1' })).toBeNull();
      expect(zu.backlinks.datenbankSicht).not.toHaveBeenCalled();
      expect(zu.backlinks.ensureIndexForDemand).not.toHaveBeenCalled();
    },
    PROZESS_ZEITLIMIT,
  );

  it('Anzeige-Prozess: der Klick fragt nicht nach dem Ziel und öffnet die Tabellen-Datei', async () => {
    const ziele = [];
    const ersetzt = {
      resolveLink: async (basis, ziel) => basis.replace(/[^/]*$/, '') + ziel,
      fileExists: async () => true,
      isMarkdownPath: async (pfad) => /\.md$/.test(pfad),
      databaseVerweisZiel: async (params) => {
        ziele.push(params);
        return { tabelle: LIBRARY, kennung: 'r-00001' };
      },
    };
    const vorher = {};
    for (const [name, fn] of Object.entries(ersetzt)) {
      vorher[name] = window.api[name];
      window.api[name] = fn;
    }
    const masken = [];
    const merke = (e) => masken.push(e.detail);
    document.addEventListener('scg:open-form', merke);
    try {
      state.panes[0].tabs = [{ path: '/raum/Notiz.md', viewMode: 'rendered' }];
      state.panes[0].activeIndex = 0;

      await schalteDatenbank(false);
      await activateLink(0, 'Library.md#r-00001', true);
      expect(ziele).toEqual([]);
      expect(masken).toEqual([]);
      expect(geoeffnet).toEqual([[LIBRARY]]);

      // Gegenprobe: eingeschaltet fragt derselbe Klick und öffnet die Maske.
      await schalteDatenbank(true);
      geoeffnet.length = 0;
      await activateLink(0, 'Library.md#r-00001', true);
      expect(ziele).toEqual([{ zielPfad: LIBRARY, anker: 'r-00001' }]);
      expect(masken).toEqual([{ filePath: LIBRARY, recordId: 'r-00001' }]);
      expect(geoeffnet).toEqual([]);
    } finally {
      document.removeEventListener('scg:open-form', merke);
      for (const name of Object.keys(ersetzt)) window.api[name] = vorher[name];
      state.panes[0].tabs = [];
      state.panes[0].activeIndex = -1;
    }
  });
});

// --- Zusage 3: die Vorschlagsliste bietet keine Datensätze an ----------------------------

describe('Zusage 3: Aus-Zustand, die Vorschlagsliste bietet keine Datensätze an', () => {
  it('nach [[Library#^ allein die Block-Anker, ohne Anfrage nach Datensätzen', async () => {
    const datensatzAnfragen = [];
    const vorher = {
      autocompleteAnchors: window.api.autocompleteAnchors,
      databaseDatensaetze: window.api.databaseDatensaetze,
    };
    window.api.autocompleteAnchors = async () => ({ status: 'ready', suggestions: ['notiz-1'] });
    window.api.databaseDatensaetze = async (params) => {
      datensatzAnfragen.push(params);
      return {
        status: 'ready',
        tabelle: 'Library',
        datensaetze: [{ kennung: 'r-00001', anzeige: 'Solaris', schluessel: 'B-1' }],
      };
    };
    const vorschlaege = async () => {
      const inner = 'Library#^';
      const doc = '[[' + inner;
      const context = { pos: doc.length, state: EditorState.create({ doc }) };
      const ergebnis = await ankerVorschlaege(context, '/raum/Notiz.md', inner, inner.indexOf('#'));
      return ergebnis.options.map((o) => o.label);
    };
    try {
      await schalteDatenbank(false);
      // Der Tabellen-Name steht da, die Anfrage nach den Datensätzen unterbleibt.
      expect(await vorschlaege()).toEqual(['^notiz-1']);
      expect(datensatzAnfragen).toEqual([]);

      // Gegenprobe: eingeschaltet folgt der Datensatz hinter dem Block-Anker.
      await schalteDatenbank(true);
      expect(await vorschlaege()).toEqual(['^notiz-1', '^Solaris']);
      expect(datensatzAnfragen).toEqual([{ tabelle: 'Library' }]);
    } finally {
      Object.assign(window.api, vorher);
    }
  });
});

// --- Zusage 4: der Sitzungs-Eintrag ruht und geht nicht verloren -------------------------

describe('Zusage 4: Aus-Zustand, der Sitzungs-Eintrag des Masken-Dokuments ruht', () => {
  it('ruht über weitere Schnappschüsse und kehrt nach dem Einschalten mit der echten Maske zurück', async () => {
    const pane = state.panes[0];
    const eintrag = {
      page: MASKEN_PAGE_ID,
      position: 0,
      aktiv: true,
      tabelle: LIBRARY,
      kennung: 'r-00002',
      maske: null,
    };

    // Start bei abgeschalteter Datenbank: Das Wurzel-Tor der Masken-Seite lässt
    // nichts öffnen, und der Eintrag wird zum ruhenden Eintrag der Spalte.
    await schalteDatenbank(false);
    await stelleMaskenWieder(0, [eintrag], state);
    await Promise.resolve();
    expect(maskeOffen()).toBe(false);
    expect(maskenAnfragen).toEqual([]);
    expect(pane.tabs).toEqual([]);
    // Er fließt in jeden folgenden Schnappschuss, nie als aktiver Reiter.
    const ruhend = { ...eintrag, aktiv: false };
    expect(systemTabsFuer(pane)).toEqual([ruhend]);
    expect(systemTabsFuer(pane)).toEqual([ruhend]);

    // Nächster Start mit eingeschalteter Datenbank: Derselbe Schnappschuss
    // bringt die Maske mit ihrem Datensatz zurück.
    await schalteDatenbank(true);
    await stelleMaskenWieder(0, systemTabsFuer(pane), state);
    await Promise.resolve();
    expect(maskeOffen()).toBe(true);
    expect(pane.tabs.map((t) => t.systemPage)).toEqual([MASKEN_PAGE_ID]);
    expect(maskenAnfragen).toHaveLength(1);
    expect(maskenAnfragen[0]).toMatchObject({ tabelle: LIBRARY, kennung: 'r-00002' });
    // Der Eintrag kommt jetzt aus dem offenen Reiter; der ruhende ist entfallen.
    expect(systemTabsFuer(pane)).toEqual([{ ...eintrag, aktiv: true }]);
  });
});
