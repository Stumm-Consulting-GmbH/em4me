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

// 4T-002249 (Epic 3E-000262, F1 A, AK4): Die Zeile einer Listen-Maske ist der
// Treffer; nennt die Abfrage-Datei mit `form` eine Maske, reist ihr Pfad im
// Ereignis mit, und die Seite fragt den Datensatz in dieser Maske an. Ohne
// Angabe bleibt das Ereignis das bisherige. Der Verweis in einer Zelle bleibt
// sein eigener Treffer und öffnet die Standard-Maske seines Ziels.
describe('Listen-Maske: Klick auf die Zeile (4T-002249)', () => {
  const LOANS_KURZ = '/raum/Loans Short Form.md';

  function liste(maske) {
    const resultSet = rs.makeResultSet({
      scope: 'records',
      type: 'table',
      columns: [rs.makeColumn({ name: 'book', label: 'Buch', source: 'book' })],
      rows: [
        rs.makeRow(
          [
            {
              kind: 'record',
              table: 'Library',
              id: 'r-00001',
              display: 'Zauberberg',
              path: LIBRARY,
            },
          ],
          { ...rs.recordOrigin('Loans', 'r-00007'), path: LOANS, display: 'Clara' },
        ),
      ],
      wishes: rs.makeWishes(),
      state: rs.makeState('ready', { area: { root: '/raum', fileCount: 2 } }),
    });
    const auskunft = {
      istListe: true,
      angaben: { editable: true, form: maske ? 'Loans Short Form' : null, allow: ['update'] },
      tabelle: { path: LOANS, name: 'Loans' },
      maske,
      spalten: [{ index: 0, feld: 'book' }],
      hinweise: [],
    };
    return buildQueryListDom({ resultSet, liste: auskunft }, i18n.t);
  }

  function mitEreignissen(fn) {
    const details = [];
    const merke = (e) => details.push(e.detail);
    document.addEventListener('scg:open-form', merke);
    try {
      fn();
    } finally {
      document.removeEventListener('scg:open-form', merke);
    }
    return details;
  }

  it('Lese-Ansicht: die Zeile öffnet die benannte Maske', () => {
    const root = leseAnsicht(liste(LOANS_KURZ));
    const details = mitEreignissen(() => {
      expect(klick(root.querySelector('tr.db-list-row td:first-child')).defaultPrevented).toBe(
        true,
      );
    });
    expect(details).toEqual([{ filePath: LOANS, recordId: 'r-00007', maske: LOANS_KURZ }]);
    expect(maskeOffen()).toBe(true);
    expect(anfragen[0]).toMatchObject({ tabelle: LOANS, kennung: 'r-00007', maske: LOANS_KURZ });
    expect(geoeffnet).toEqual([]);
  });

  it('Live-Ansicht: derselbe Weg über den Maus-Druck, der Block bleibt geschlossen', () => {
    const behaelter = liveAnsicht(liste(LOANS_KURZ));
    const details = mitEreignissen(() => {
      const druck = mausDruck(behaelter.querySelector('tr.db-list-row td:first-child'));
      expect(druck.defaultPrevented).toBe(true);
    });
    expect(details).toEqual([{ filePath: LOANS, recordId: 'r-00007', maske: LOANS_KURZ }]);
    expect(anfragen[0]).toMatchObject({ maske: LOANS_KURZ });
  });

  it('ohne Maske bleibt das Ereignis das bisherige, der Verweis öffnet sein Ziel', () => {
    // Je Klick frisch gezeichnet: Das Öffnen der Maske ersetzt die Anzeige-Fläche.
    const details = mitEreignissen(() => {
      klick(leseAnsicht(liste(null)).querySelector('tr.db-list-row td:first-child'));
      klick(leseAnsicht(liste(null)).querySelector('tr.db-list-row td:last-child a'));
    });
    expect(details).toEqual([
      { filePath: LOANS, recordId: 'r-00007' },
      { filePath: LIBRARY, recordId: 'r-00001' },
    ]);
    expect(Object.keys(anfragen[0]).sort()).toEqual(['kennung', 'sprache', 'tabelle']);
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

// 4T-002184 (Epic 3E-000261, AK4): Die Verdrahtungs-Schnittstelle nimmt auf
// Wunsch eine bestimmte Masken-Datei mit; die Seite fragt sie am Lese-Kanal an
// und bindet sie neben Tabelle und Kennung. Ohne Angabe bleibt die Anfrage
// Zeichen für Zeichen die bisherige, also die Standard-Maske.
describe('Verdrahtungs-Schnittstelle: bestimmte Maske (4T-002184)', () => {
  function oeffne(detail) {
    document.dispatchEvent(new CustomEvent('scg:open-form', { detail }));
  }

  it('fragt ohne Angabe ohne maske an und mit Angabe mit ihr', async () => {
    oeffne({ filePath: LOANS, recordId: 'r-00007' });
    await Promise.resolve();
    expect(Object.keys(anfragen[0]).sort()).toEqual(['kennung', 'sprache', 'tabelle']);

    oeffne({ filePath: LOANS, recordId: 'r-00007', maske: 'Loans Kurz' });
    await Promise.resolve();
    expect(anfragen).toHaveLength(2);
    expect(anfragen[1]).toMatchObject({ tabelle: LOANS, kennung: 'r-00007', maske: 'Loans Kurz' });
  });
});

// 4T-002185 (Epic 3E-000261, F4 A): Die Navigation zwischen Masken an der echten
// Seite — echter Klick-Hörer am Körper, echter Link-Weg der Anwendung
// (`activateLink`), echte Rückfrage bei ungespeicherter Bearbeitung. Ersetzt
// sind wie oben das Öffnen einer Datei und die Kanäle: Datensatz-Abruf,
// Katalog, Ziel-Liste des Verweis-Feldes, Auflösung des Link-Ziels und Sperre.
describe('Navigation zwischen Masken (4T-002185)', () => {
  const LOANS_FORM = '/raum/Loans Form.md';
  const LOANS_KURZ = '/raum/Loans Kurz.md';
  const LIBRARY_FORM = '/raum/Library Form.md';
  // Der Körper einer Ausleih-Maske: vier Links und das Verweis-Feld zum Buch.
  // Der Stub der Darstellung reicht den Text als HTML durch.
  const LINKS =
    '<p><a class="wikilink" href="Loans Kurz.md">Kurz</a> ' +
    '<a class="wikilink" href="Loans Form.md">Lang</a> ' +
    '<a class="wikilink" href="Library Form.md">Buch-Maske</a> ' +
    '<a class="wikilink" href="Notiz.md">Notiz</a></p>';
  const UEBERBLICK = {
    status: 'ready',
    tabellen: [
      { name: 'Loans', path: LOANS, maske: LOANS_FORM, maskenPfade: [LOANS_FORM, LOANS_KURZ] },
      { name: 'Library', path: LIBRARY, maske: LIBRARY_FORM, maskenPfade: [LIBRARY_FORM] },
    ],
  };

  function antwortFuer(params) {
    if (params.tabelle === LIBRARY) {
      return {
        status: 'ready',
        anzeige: 'Zauberberg',
        fields: [{ name: 'Title', type: 'string' }],
        zellen: [{ name: 'Title', text: 'Zauberberg', value: 'Zauberberg', error: null }],
        koerper: {
          quelle: 'datei',
          pfad: LIBRARY_FORM,
          segmente: [{ art: 'feld', name: 'Title' }],
        },
      };
    }
    return {
      status: 'ready',
      anzeige: 'Clara',
      fields: [{ name: 'Book', type: 'record', options: { table: 'Library' } }],
      zellen: [{ name: 'Book', text: 'r-1', value: 'r-1', error: null }],
      koerper: {
        quelle: 'datei',
        pfad: params.maske || LOANS_FORM,
        segmente: [
          { art: 'markdown', text: LINKS },
          { art: 'feld', name: 'Book' },
        ],
      },
    };
  }

  const ersetzt = {
    databaseDatensatz: async (params) => {
      anfragen.push(params);
      return antwortFuer(params);
    },
    databaseOverview: async () => UEBERBLICK,
    databaseDatensaetze: async () => ({
      status: 'ready',
      tabelle: 'Library',
      pfad: LIBRARY,
      keyEinteilig: false,
      datensaetze: [{ kennung: 'r-00001', anzeige: 'Zauberberg', schluessel: null }],
    }),
    renderMarkdown: (text) => text,
    resolveLink: async (basis, ziel) => basis.replace(/[^/]*$/, '') + ziel,
    fileExists: async () => true,
    isMarkdownPath: async (pfad) => /\.md$/.test(pfad),
    databaseSperre: async (p) =>
      p.aktion === 'nehmen' ? { status: 'ready', gehalten: true, stand: 's1' } : { ok: true },
  };
  const vorher = {};

  beforeEach(() => {
    for (const [name, fn] of Object.entries(ersetzt)) {
      vorher[name] = window.api[name];
      window.api[name] = fn;
    }
  });
  afterEach(() => {
    for (const name of Object.keys(ersetzt)) window.api[name] = vorher[name];
  });

  const maske = () =>
    document.querySelector('.pane-group[data-pane="0"] .pane-system .db-form-page');
  const link = (href) => maske().querySelector(`.db-form-body a[href="${href}"]`);
  const zuletzt = () => anfragen[anfragen.length - 1];

  async function oeffneAusleihe() {
    document.dispatchEvent(
      new CustomEvent('scg:open-form', { detail: { filePath: LOANS, recordId: 'r-00007' } }),
    );
    await vi.waitFor(() => expect(maske().querySelector('.db-form-ref-link')).not.toBe(null));
  }

  it('drei Ziele, Rückweg über «Zurück», jeder andere Link öffnet sein Dokument', async () => {
    await oeffneAusleihe();
    // Ohne vorigen Datensatz kein «Zurück» (Story AK6).
    expect(maske().querySelector('.db-form-back')).toBe(null);

    // Ziel 1: dieselbe Ausleihe in der kurzen Maske, keine Datei geöffnet.
    klick(link('Loans Kurz.md'));
    await vi.waitFor(() => expect(zuletzt().maske).toBe(LOANS_KURZ));
    expect(zuletzt()).toMatchObject({ tabelle: LOANS, kennung: 'r-00007' });
    await vi.waitFor(() => expect(maske().querySelector('.db-form-back')).not.toBe(null));

    // Ziel 2: Maske einer anderen Tabelle meldet, ohne Abruf und ohne Neuanlage.
    const bisher = anfragen.length;
    klick(link('Library Form.md'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-nav-note')).not.toBe(null));
    expect(maske().querySelector('.db-form-nav-note').textContent).toContain('«Library»');
    expect(anfragen).toHaveLength(bisher);

    // Jeder andere Link öffnet sein Dokument.
    klick(link('Notiz.md'));
    await vi.waitFor(() => expect(geoeffnet).toEqual([['/raum/Notiz.md']]));
    expect(anfragen).toHaveLength(bisher);

    // Ziel 3: das Verweis-Feld öffnet das Buch in der Standard-Maske seiner Tabelle.
    klick(maske().querySelector('.db-form-ref-link'));
    await vi.waitFor(() => expect(zuletzt().tabelle).toBe(LIBRARY));
    expect(zuletzt()).not.toHaveProperty('maske');
    expect(zuletzt().kennung).toBe('r-00001');

    // «Zurück» führt zur Ausleihe in der kurzen Maske.
    await vi.waitFor(() => expect(maske().querySelector('.db-form-back')).not.toBe(null));
    klick(maske().querySelector('.db-form-back'));
    await vi.waitFor(() => expect(zuletzt().tabelle).toBe(LOANS));
    expect(zuletzt()).toMatchObject({ kennung: 'r-00007', maske: LOANS_KURZ });
    // Ein Eintrag bleibt: die Ausleihe in der Standard-Maske.
    await vi.waitFor(() => expect(maske().querySelector('.db-form-back')).not.toBe(null));
    expect(geoeffnet).toEqual([['/raum/Notiz.md']]);
  });

  it('bei ungespeicherter Bearbeitung fragt die Maske vor Link und «Zurück» nach', async () => {
    await oeffneAusleihe();
    klick(link('Loans Kurz.md'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-back')).not.toBe(null));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-edit')).not.toBe(null));
    klick(maske().querySelector('.db-form-edit'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-input')).not.toBe(null));
    // Im Bearbeiten ist das Verweis-Feld die Eingabe, keine Schaltfläche.
    expect(maske().querySelector('.db-form-ref-link')).toBe(null);
    const eingabe = maske().querySelector('.db-form-input');
    eingabe.value = 'r-2';
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));
    const bisher = anfragen.length;

    // Link: Rückfrage; «Weiter bearbeiten» bleibt in der Bearbeitung. Der Satz
    // nennt beide Fälle, Datensatz und Maske, und der Knopf heißt nicht wie
    // «Zurück» im Kopf (Entscheidung vom 2026-10-09).
    klick(link('Loans Form.md'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    expect(anfragen).toHaveLength(bisher);
    expect(maske().querySelector('.db-form-confirm-text').textContent).toContain('Maske');
    expect(maske().querySelector('.db-form-confirm-back').textContent).toBe('Weiter bearbeiten');
    klick(maske().querySelector('.db-form-confirm-back'));
    expect(maske().querySelector('.db-form-confirm')).toBe(null);
    expect(maske().querySelector('.db-form-input').value).toBe('r-2');

    // «Zurück» der Maske: ebenso Rückfrage, ebenso bleibt die Bearbeitung.
    klick(maske().querySelector('.db-form-back'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    expect(anfragen).toHaveLength(bisher);
    klick(maske().querySelector('.db-form-confirm-back'));
    expect(maske().querySelector('.db-form-input').value).toBe('r-2');

    // Verwerfen in der Rückfrage eines Links wechselt und merkt den Wechsel im
    // Verlauf, wie ohne Rückfrage.
    klick(link('Loans Form.md'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-confirm')).not.toBe(null));
    klick(maske().querySelector('.db-form-confirm-discard'));
    await vi.waitFor(() => expect(anfragen.length).toBe(bisher + 1));
    expect(zuletzt()).toMatchObject({ tabelle: LOANS, kennung: 'r-00007', maske: LOANS_FORM });
    await vi.waitFor(() => expect(maske().querySelector('.db-form-ref-link')).not.toBe(null));

    // Zwei Einträge: zuerst die kurze Maske, danach die Standard-Maske; dann
    // ist der Verlauf abgebaut.
    klick(maske().querySelector('.db-form-back'));
    await vi.waitFor(() => expect(zuletzt().maske).toBe(LOANS_KURZ));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-back')).not.toBe(null));
    klick(maske().querySelector('.db-form-back'));
    await vi.waitFor(() => expect(anfragen.length).toBe(bisher + 3));
    expect(Object.keys(zuletzt()).sort()).toEqual(['kennung', 'sprache', 'tabelle']);
    await vi.waitFor(() => expect(maske().querySelector('.db-form-ref-link')).not.toBe(null));
    expect(maske().querySelector('.db-form-back')).toBe(null);
  });

  it('ein Öffnen von außen beginnt einen neuen Verlauf', async () => {
    await oeffneAusleihe();
    klick(maske().querySelector('.db-form-ref-link'));
    await vi.waitFor(() => expect(maske().querySelector('.db-form-back')).not.toBe(null));
    await oeffneAusleihe();
    expect(maske().querySelector('.db-form-back')).toBe(null);
  });
});

// 4T-002333 (Epic 3E-000264, F2 A, T3): Ein Wiki-Verweis mit Anker auf einen
// Datensatz öffnet die Maske statt der Tabellen-Datei. Ob das Ziel ein
// Datensatz ist, sagt der Haupt-Prozess (`databaseVerweisZiel`, hier ersetzt);
// ohne Antwort bleibt es beim bisherigen Weg, Datei öffnen und springen. Am
// gebauten Programm prüfen das die Ablauf-Fälle DB-VER-01 und DB-VER-02.
describe('Wiki-Verweis auf einen Datensatz (activateLink, 4T-002333)', () => {
  let activateLink;
  let ziele;
  let verweisZiel;
  const vorher = {};
  const ersetzt = {
    resolveLink: async (basis, ziel) => basis.replace(/[^/]*$/, '') + ziel,
    fileExists: async () => true,
    isMarkdownPath: async (pfad) => /\.md$/.test(pfad),
    databaseVerweisZiel: async (params) => {
      ziele.push(params);
      return verweisZiel(params);
    },
  };

  beforeEach(async () => {
    ({ activateLink } = await import('../../../src/renderer/modules/views/link-navigation.js'));
    ziele = [];
    verweisZiel = () => null;
    for (const [name, fn] of Object.entries(ersetzt)) {
      vorher[name] = window.api[name];
      window.api[name] = fn;
    }
    state.panes[0].tabs = [{ path: '/raum/Notiz.md', viewMode: 'rendered' }];
    state.panes[0].activeIndex = 0;
  });
  afterEach(() => {
    for (const name of Object.keys(ersetzt)) window.api[name] = vorher[name];
    state.panes[0].tabs = [];
    state.panes[0].activeIndex = -1;
  });

  function mitEreignissen(fn) {
    const details = [];
    const merke = (e) => details.push(e.detail);
    document.addEventListener('scg:open-form', merke);
    return Promise.resolve(fn())
      .then(() => details)
      .finally(() => document.removeEventListener('scg:open-form', merke));
  }

  it('Antwort mit Tabelle und Kennung: die Maske öffnet, keine Datei', async () => {
    verweisZiel = () => ({ tabelle: LIBRARY, kennung: 'r-00001' });
    const details = await mitEreignissen(() => activateLink(0, 'Library.md#r-1', true));
    expect(ziele).toEqual([{ zielPfad: LIBRARY, anker: 'r-1' }]);
    expect(details).toEqual([{ filePath: LIBRARY, recordId: 'r-00001' }]);
    expect(geoeffnet).toEqual([]);
  });

  it('die Anzeige-Form mit Leerzeichen geht unverändert an den Haupt-Prozess', async () => {
    verweisZiel = () => ({ tabelle: LIBRARY, kennung: 'r-00003' });
    await mitEreignissen(() => activateLink(0, 'Library.md#Max Müller', true));
    expect(ziele).toEqual([{ zielPfad: LIBRARY, anker: 'Max Müller' }]);
  });

  it('Antwort null: der bisherige Weg, die Datei öffnet', async () => {
    const details = await mitEreignissen(() => activateLink(0, 'Library.md#r-00001', true));
    expect(ziele).toHaveLength(1);
    expect(details).toEqual([]);
    expect(geoeffnet).toEqual([[LIBRARY]]);
  });

  it('der Kanal wirft: der bisherige Weg, die Datei öffnet', async () => {
    verweisZiel = () => {
      throw new Error('Kanal weg');
    };
    const details = await mitEreignissen(() => activateLink(0, 'Library.md#r-00001', true));
    expect(details).toEqual([]);
    expect(geoeffnet).toEqual([[LIBRARY]]);
  });

  it('ohne Anker oder ohne Wiki-Verweis keine Anfrage', async () => {
    await activateLink(0, 'Library.md', true);
    await activateLink(0, 'Library.md#r-00001', false);
    expect(ziele).toEqual([]);
    expect(geoeffnet).toEqual([[LIBRARY], [LIBRARY]]);
  });

  it('Aus-Zustand der Erweiterung «Datenbank»: keine Anfrage, die Datei öffnet', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    verweisZiel = () => ({ tabelle: LIBRARY, kennung: 'r-00001' });
    const details = await mitEreignissen(() => activateLink(0, 'Library.md#r-00001', true));
    expect(ziele).toEqual([]);
    expect(details).toEqual([]);
    expect(geoeffnet).toEqual([[LIBRARY]]);
  });
});
