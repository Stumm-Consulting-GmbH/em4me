// @vitest-environment jsdom
// 4T-002147 (Epic 3E-000262), AK5: Die neuen Zusagen der Listen-Maske und der
// Kopf-Positionen-Erfassung im Aus-Zustand der Erweiterung «Datenbank», jede
// einzeln nachgewiesen. Benannt sind sie am 2026-10-11 nach der Plan-Freigabe
// (F7 A) im Abschluss-Task:
//
//   1. Eine Listen-Maske ist bei ausgeschalteter Datenbank eine gewöhnliche
//      Abfrage-Datei ohne Pflege, deren Datensatz-Abfrage nicht ausgewertet wird.
//   2. Der Platzhalter des Positions-Bereichs steht als Text.
//   3. Werte und Bedingungen mit Verweis-Pfaden erreichen keinen Kanal des
//      Haupt-Prozesses.
//
// **Warum eine eigene Datei.** Die Nachbarn messen die Funktionen im
// An-Zustand; jeder Fall hier legt den Schalter um, und ein vergessenes
// Zurückstellen kippte dort fremde Fälle. Muster und Aufbau (Sprach-Katalog,
// Schalter der Erweiterung, Bestands-Markup der Spalten) übernimmt diese Datei
// von `extensions-aus-gestaltete-maske.test.js`, dem Nachweis der Vorstufe.
//
// **Gemessen wird am Tor, nicht an den Zugängen.** Zusage 1: Das Tor der
// Listen-Maske im Anzeige-Prozess steht in `mitListe`
// (`src/renderer/modules/query/frontmatter-query-view.js`,
// `isExtensionActive('database')`); gemessen wird an der echten Befüllung
// (`applyFrontmatterQueriesIfPresent`), die Kanäle sind Spione auf der Brücke.
// Dass die Datensatz-Abfrage selbst nicht ausgewertet wird, belegt bereits
// `test/unit/datensatz-abfrage-aus-zustand.test.js` (leere Menge mit Hinweis
// `databaseOff`, keine Tabelle gelesen; die Abfrage-Datei als gewöhnliches
// Dokument im Block «Abfrage-Datei im Aus-Zustand»); hier steht allein der
// Anteil der Listen-Maske. Das Tor des Kanals `database:liste` im
// Haupt-Prozess belegt `test/unit/db-liste-kanal.test.js` («liefert im
// Aus-Zustand der Erweiterung und ohne Tor keine Liste»).
//
// Zusage 2: der Markdown-Weg des Viewers (`renderMarkdown`), der keine
// Masken-Platzhalter kennt, und das Öffnen der Maske über das echte
// `oeffneMaske` (`src/renderer/modules/database/masken-seite.js`), dessen
// Positions-Bereich den Kanal `database:positionsliste` ruft.
//
// Zusage 3: Die Pfad-Stellen einer Maske fragt allein die gezeichnete Seite an
// (`masken-koerper.js`, Naht `pfade` aus `masken-pfade.js`). Abgeschaltet ist
// die Maske über keinen Weg erreichbar; das belegt Zusage 1 der Vorstufe in
// `extensions-aus-gestaltete-maske.test.js` für Ereignis, Link, Verweis-Feld
// und «Zurück». Hier steht derselbe Weg mit einer Maske, die Pfad-Stellen und
// einen Positions-Bereich trägt, samt Gegenprobe. Das Tor der Kanäle im
// Haupt-Prozess (`torOffen` in `src/main/ipc/database.js`) belegen
// `test/unit/db-ausdruecke-kanal.test.js` («im Aus-Zustand der Erweiterung
// liefert der Kanal keine Daten») und `test/unit/db-positionsliste-kanal.test.js`
// («weist ungültige Form, Aus-Zustand, fehlenden Bereich und fremde
// Kopf-Tabelle ab»); sie werden hier nicht gedoppelt.
//
// **Jeder Fall trägt seine Nicht-Vakuitäts-Probe:** Im An-Zustand geschieht
// das Gegenteil (das Gitter entsteht, die Körper-Zerlegung erkennt den
// Positions-Bereich, die Kanäle werden gerufen), sonst bewiese der Aus-Fall
// nichts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

// Aufgefangen wie im Vorbild: das Öffnen einer Datei und das Aktivieren der
// Spalte, die es in diesem Gerüst nicht gibt.
vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (...args) => args[0],
  activatePane: () => {},
}));

// Die Kanäle der Brücke als Spione; die Antworten stellt der jeweilige Fall.
let abfrageAntwort = null;
let datensatzAntwort = null;
window.api.runFrontmatterQuery = vi.fn(async () => abfrageAntwort);
window.api.databaseListe = vi.fn(async () => ({ istListe: false }));
window.api.databaseDatensatz = vi.fn(async () => datensatzAntwort);
window.api.databaseAusdruecke = vi.fn(async () => ({ status: 'ready', werte: [] }));
window.api.databasePositionsliste = vi.fn(async () => ({ istListe: false }));
window.api.databaseDatensaetze = vi.fn(async () => ({ status: 'ready', datensaetze: [] }));
window.api.databaseSperre = async () => ({ ok: true });
// Der Text-Lauf einer gezeichneten Maske geht über die Brücke; hier der echte
// Markdown-Weg, gebunden, sobald das Modul geladen ist.
window.api.renderMarkdown = (text) => markdownModul.renderMarkdown(text, 'de');
window.api.onBacklinksInvalidated = () => {};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

// Bestands-Markup, so weit `openSystemPage` es anfasst (wie im Vorbild).
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
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { applyFrontmatterQueriesIfPresent, waitForFrontmatterQueriesIdle } =
  await import('../../../src/renderer/modules/query/frontmatter-query-view.js');
const { maskeOffen, oeffneMaske } =
  await import('../../../src/renderer/modules/database/masken-seite.js');
const markdownModul = await import('../../../src/shared/markdown/markdown.js');
const { renderMarkdown, configureExtensions } = markdownModul;
const { zerlegeMaskenKoerper } = await import('../../../src/shared/database/form-body.js');
const { makeColumn, recordOrigin, makeRow, makeWishes, makeState, makeResultSet } =
  await import('../../../src/shared/query/result-set.js');

const LOANS = '/raum/Loans.md';
const LOANS_LIST = '/raum/Loans List.md';
const LOANS_FORM = '/raum/Loans Form.md';

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

function spioneZuruecksetzen() {
  for (const kanal of [
    'runFrontmatterQuery',
    'databaseListe',
    'databaseDatensatz',
    'databaseAusdruecke',
    'databasePositionsliste',
    'databaseDatensaetze',
  ]) {
    window.api[kanal].mockClear();
  }
}

// Länger als die Verzögerung der gebündelten Pfad-Anfrage (150 ms), damit ein
// Ausbleiben des Aufrufs nicht bloß ein noch laufender Zeitgeber ist.
const warteUeberVerzoegerung = () => new Promise((r) => setTimeout(r, 300));

beforeEach(async () => {
  await schalteDatenbank(true);
  await raeumeAuf();
  spioneZuruecksetzen();
  abfrageAntwort = null;
  datensatzAntwort = null;
});

afterEach(async () => {
  configureExtensions([]);
  await schalteDatenbank(true);
  await raeumeAuf();
  document.querySelectorAll('.markdown-body.listen-probe').forEach((el) => el.remove());
});

// --- Zusage 1: die Listen-Maske ist eine gewöhnliche Abfrage-Datei ---------------

describe('Zusage 1: Aus-Zustand, die Listen-Maske ist eine gewöhnliche Abfrage-Datei', () => {
  const QUERY = 'TABLE RECORDS borrower FROM "Loans"';

  // Eine Menge der Datensatz-Ebene mit zwei Ausleihen, wie die Abfrage einer
  // Listen-Maske sie liefert.
  function menge() {
    return makeResultSet({
      scope: 'records',
      type: 'table',
      columns: [makeColumn({ name: 'borrower', label: 'Name', source: 'borrower' })],
      rows: ['Anna', 'Bert'].map((wer, i) =>
        makeRow([wer], { ...recordOrigin('Loans', `r-0000${i + 1}`), path: LOANS, display: wer }),
      ),
      wishes: makeWishes(),
      state: makeState('ready', { area: { root: '/raum', fileCount: 3 } }),
    });
  }

  // Die Auskunft einer Listen-Maske mit allen drei Handgriffen, damit Aktions-
  // Spalte und «Neue Zeile» in der Gegenprobe sicher entstehen.
  const LISTE = {
    istListe: true,
    angaben: { editable: true, form: null, allow: ['create', 'update', 'delete'] },
    tabelle: { path: LOANS, name: 'Loans' },
    maske: null,
    spalten: [{ index: 0, feld: 'borrower' }],
    nichtAenderbar: [],
    hinweise: [],
  };

  async function befuelle() {
    const wurzel = document.createElement('article');
    wurzel.className = 'markdown-body listen-probe';
    const el = document.createElement('div');
    el.className = 'perspective-query';
    el.dataset.fmQuery = QUERY;
    wurzel.appendChild(el);
    document.body.appendChild(wurzel);
    applyFrontmatterQueriesIfPresent(wurzel, LOANS_LIST);
    await waitForFrontmatterQueriesIdle();
    return el;
  }

  it('die Befüllung fragt keine Listen-Auskunft und zeichnet die Ergebnis-Tabelle', async () => {
    abfrageAntwort = { resultSet: menge() };
    window.api.databaseListe.mockImplementation(async () => LISTE);
    await schalteDatenbank(false);
    const el = await befuelle();
    expect(window.api.runFrontmatterQuery).toHaveBeenCalledTimes(1);
    expect(window.api.databaseListe).not.toHaveBeenCalled();
    // Kein Gitter, keine Aktions-Spalte, keine «Neue Zeile».
    expect(el.querySelector('div.db-list')).toBeNull();
    expect(el.querySelector('.db-list-col-actions')).toBeNull();
    expect(el.querySelector('.db-list-new')).toBeNull();
    // Stattdessen die gewöhnliche Ergebnis-Tabelle der Abfrage.
    expect(el.querySelector('table.perspective-query-table')).not.toBeNull();

    // Nicht-Vakuitäts-Probe: eingeschaltet tritt mit derselben Antwort das
    // Gitter samt Pflege an die Stelle der Tabelle.
    await schalteDatenbank(true);
    const an = await befuelle();
    expect(window.api.databaseListe).toHaveBeenCalledTimes(1);
    expect(window.api.databaseListe.mock.calls[0][0]).toMatchObject({
      pfad: LOANS_LIST,
      query: QUERY,
      spalten: ['borrower'],
    });
    expect(an.querySelector('div.db-list')).not.toBeNull();
    expect(an.querySelector('thead th.db-list-col-actions')).not.toBeNull();
    expect(an.querySelector('button.db-list-new').textContent).toBe(de['database.list.new']);
    expect(an.querySelector('table.perspective-query-table')).toBeNull();
  });

  it('mit der Antwort des Aus-Zustands bleibt es beim Hinweis und der leeren Menge', async () => {
    // Die Antwort, die die Auswertung bei ausgeschalteter Datenbank tatsächlich
    // gibt (belegt in datensatz-abfrage-aus-zustand.test.js).
    const leer = makeResultSet({
      scope: 'records',
      type: 'table',
      columns: [makeColumn({ name: 'borrower', label: 'Name', source: 'borrower' })],
      rows: [],
      wishes: makeWishes(),
      state: makeState('ready', { hint: 'databaseOff' }),
    });
    abfrageAntwort = { resultSet: leer };
    window.api.databaseListe.mockImplementation(async () => LISTE);
    await schalteDatenbank(false);
    const el = await befuelle();
    expect(window.api.databaseListe).not.toHaveBeenCalled();
    expect(el.querySelector('div.db-list')).toBeNull();
    expect(el.querySelector('.perspective-query-hint').textContent).toBe(
      de['query.hint.databaseOff'],
    );
    expect(el.querySelector('.perspective-query-status').textContent).toBe(
      de['query.emptyRecords'],
    );
  });
});

// --- Zusage 2 und 3: Positions-Bereich und Pfad-Stellen ---------------------------

const FELDER = [
  { name: 'book', type: 'record', options: { table: 'Library' } },
  { name: 'borrower', type: 'string' },
];

const KOERPER = [
  '# Ausleihe',
  '',
  '{{field:borrower}}',
  '',
  'Titel: {{value:book.title}}',
  '',
  '{{when:book.onloan}}',
  '',
  'Das Buch ist ausgeliehen.',
  '',
  '{{end}}',
  '',
  '{{list:Loans List}}',
  '',
].join('\n');

const DATEI = ['---', 'db-form:', '  table: Loans', '---', '', KOERPER].join('\n');

describe('Zusage 2: Aus-Zustand, der Platzhalter des Positions-Bereichs steht als Text', () => {
  function alsDom(html) {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
  }

  it('der Markdown-Weg des Viewers gibt den Platzhalter wörtlich aus und ruft keinen Kanal', () => {
    configureExtensions(['database']);
    const aus = alsDom(renderMarkdown(DATEI, 'de'));
    const absaetze = [...aus.querySelectorAll('p')].map((p) => p.textContent);
    expect(absaetze).toContain('{{list:Loans List}}');
    // Kein Element der Maske und kein Gitter einer Liste.
    expect(aus.querySelector('[class*="db-form"]')).toBeNull();
    expect(aus.querySelector('[class*="db-list"]')).toBeNull();
    expect(window.api.databasePositionsliste).not.toHaveBeenCalled();
    expect(window.api.databaseListe).not.toHaveBeenCalled();
    // Der Schalter verändert den Weg nicht: Eingeschaltet ist die Ausgabe dieselbe.
    configureExtensions([]);
    expect(renderMarkdown(DATEI, 'de')).toBe(aus.innerHTML);
  });

  it('Nicht-Vakuitäts-Probe: derselbe Körper trägt für die Maske das Segment «liste»', () => {
    const { segmente, hints } = zerlegeMaskenKoerper(KOERPER, FELDER);
    expect(hints).toEqual([]);
    expect(segmente).toContainEqual(
      expect.objectContaining({ art: 'liste', datei: 'Loans List', by: null }),
    );
  });
});

describe('Zusage 3: Aus-Zustand, Pfad-Stellen und Positions-Bereich erreichen keinen Kanal', () => {
  // Der bereite Stand einer Ausleihe in der Gestalt des Kanals
  // `database:datensatz`, mit dem Körper aus der echten Zerlegung.
  function bereiterStand() {
    const { segmente } = zerlegeMaskenKoerper(KOERPER, FELDER);
    return {
      status: 'ready',
      kennung: 'r-00001',
      fields: FELDER,
      editable: null,
      zellen: [
        { name: 'book', text: 'r-00001', value: null, error: null },
        { name: 'borrower', text: 'Anna', value: 'Anna', error: null },
      ],
      erwartet: { book: 'r-00001', borrower: 'Anna' },
      koerper: { quelle: 'datei', pfad: LOANS_FORM, segmente },
    };
  }

  it('die Zerlegung kennzeichnet Wert und Bedingung als Pfad-Stellen', () => {
    const { segmente } = zerlegeMaskenKoerper(KOERPER, FELDER);
    const wert = segmente.find((s) => s.art === 'wert');
    const bereich = segmente.find((s) => s.art === 'bereich');
    expect(wert).toMatchObject({ ausdruck: 'book.title', pfad: true });
    expect(bereich).toMatchObject({ bedingung: 'book.onloan', pfad: true });
  });

  it('die Maske öffnet nicht, und weder Ausdrücke noch Positionen werden angefragt', async () => {
    datensatzAntwort = bereiterStand();
    await schalteDatenbank(false);
    expect(() => oeffneMaske(LOANS, 'r-00001')).not.toThrow();
    document.dispatchEvent(
      new CustomEvent('scg:open-form', { detail: { filePath: LOANS, recordId: 'r-00001' } }),
    );
    await warteUeberVerzoegerung();
    expect(maskeOffen()).toBe(false);
    expect(window.api.databaseDatensatz).not.toHaveBeenCalled();
    expect(window.api.databaseAusdruecke).not.toHaveBeenCalled();
    expect(window.api.databasePositionsliste).not.toHaveBeenCalled();

    // Nicht-Vakuitäts-Probe: eingeschaltet zeichnet die Seite denselben Stand
    // und fragt die beiden Pfad-Stellen gebündelt und den Positions-Bereich an.
    await schalteDatenbank(true);
    oeffneMaske(LOANS, 'r-00001');
    await vi.waitFor(
      () => {
        expect(window.api.databaseAusdruecke).toHaveBeenCalledTimes(1);
        expect(window.api.databasePositionsliste).toHaveBeenCalledTimes(1);
      },
      // Die Vorgabe von vi.waitFor (1000 ms) liegt weit über der Verzögerung der
      // gebündelten Anfrage (150 ms); keine eigene Zeitgrenze (Wächter Z2).
    );
    expect(maskeOffen()).toBe(true);
    expect(window.api.databaseAusdruecke.mock.calls[0][0]).toMatchObject({
      tabelle: LOANS,
      kennung: 'r-00001',
      ausdruecke: [
        { id: '0', quelle: 'book.title' },
        { id: '1', quelle: 'book.onloan' },
      ],
    });
    expect(window.api.databasePositionsliste.mock.calls[0][0]).toMatchObject({
      datei: 'Loans List',
      by: null,
      kopf: { tabelle: LOANS, kennung: 'r-00001' },
    });
  });
});
