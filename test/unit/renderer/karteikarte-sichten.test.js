// @vitest-environment jsdom
// 4T-002407 (Epic 3E-000266, F6 A, S4; Story 4S-001128, AK1 bis AK4): Die
// eingeblendeten Sichten einer Karteikarte in der Lese-Ansicht.
//
// Gemessen wird über den echten Einstieg, die Dateikopf-Zeile der vollen
// Pipeline (`applyFrontmatterLine` mit dem Pfad des Dokuments), und mit der
// echten Befüllung der Abfrage (`applyFrontmatterQueriesIfPresent`) als
// Schritt-Satz: Was sie an den Haupt-Prozess gibt, ist der Bezug, an dem dort
// `this.` hängt. Ersetzt sind allein die Kanäle des Haupt-Prozesses (Überblick,
// Lesen der Abfrage-Datei, Zeichnen des Markdowns, Auswertung der Abfrage) und
// das Öffnen einer Datei. Dazu die Spalte «Sichten» der Übersichts-Seite. Den
// Katalog prüft `db-sichten.test.js`, die laufende Anwendung `DB-KAS-06`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { isRelativeTarget } from '../../../src/shared/subpages.js';
import plattform from '../../../src/shared/platform.js';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

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

const AUTHORS = '/raum/Authors/Authors.md';
const ECO = '/raum/Authors/Umberto Eco.md';
const SICHT = '/raum/Sichten/Books by this author.md';
// 4T-002499: So geht die Abfrage-Datei in den Lese-Kanal, relativ zum Ordner der Karteikarte.
const SICHT_RELATIV = '../Sichten/Books by this author.md';
const ECO_TEXT = '---\ndb-record: r-00003\nname: Umberto Eco\n---\n\n# Umberto Eco\n\nFreitext.\n';
const ABFRAGE = 'TABLE RECORDS title FROM "Library" WHERE author = this.name';

let antwort;
let ueberblickAnfragen = 0;
window.api.databaseOverview = async () => {
  ueberblickAnfragen += 1;
  return antwort;
};
window.api.onBacklinksInvalidated = () => {};
window.api.getAreaDatabaseConfig = async () => ({ hasArea: true, overviewOnOpen: false });
const gelesen = [];
let lesen;
window.api.readEmbedFile = async (basis, ziel, anker) => {
  gelesen.push([basis, ziel, anker]);
  return lesen(ziel, basis);
};
const gezeichnet = [];
window.api.renderMarkdown = (text, pfad, opts) => {
  gezeichnet.push([pfad, opts]);
  return (
    '<p data-source-line="4">Die Bücher dieses Autors.</p>' +
    `<div class="perspective-query" data-fm-query="${ABFRAGE.replace(/"/g, '&quot;')}" data-source-line="6"></div>`
  );
};
const abfragen = [];
window.api.runFrontmatterQuery = async (pfad, query) => {
  abfragen.push([pfad, query]);
  return { status: 'unavailable' };
};
const geschrieben = [];
window.api.saveFile = async (...a) => geschrieben.push(a);
window.api.writeFile = async (...a) => geschrieben.push(a);

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const sichten = await import('../../../src/renderer/modules/database/karteikarte-sichten.js');
const { applyFrontmatterLine } = await import('../../../src/renderer/modules/frontmatter-line.js');
const { applyFrontmatterQueriesIfPresent } =
  await import('../../../src/renderer/modules/query/frontmatter-query-view.js');
const helfer = await import('../../../src/renderer/modules/database/datenbank-bereich.js');
// Die Übersichts-Seite im Modulkopf: Ihr Modul-Graph lädt länger, als ein Prüffall darf.
const seite = await import('../../../src/renderer/modules/database/datenbank-uebersicht-seite.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');

let reiter;
const geoeffnet = [];
const schrittAufrufe = [];
sichten.initKarteikartenSichten({
  schritte: (container, basePath, opts) => {
    schrittAufrufe.push({ container, basePath, opts });
    applyFrontmatterQueriesIfPresent(container, basePath);
  },
  aktivesDokument: (paneIdx) => (paneIdx === 0 ? reiter : null),
  oeffne: (pfad) => geoeffnet.push(pfad),
});

function ueberblick(sichtenListe = [{ name: 'Books by this author', path: SICHT }]) {
  return {
    status: 'ready',
    istDatenbankBereich: true,
    steckbrief: { name: 'Library Database' },
    tabellen: [
      {
        name: 'Authors',
        path: AUTHORS,
        storage: 'cards',
        felder: 2,
        hints: [],
        sichten: sichtenListe,
      },
      { name: 'Library', path: '/raum/Library.md', storage: 'table', felder: 6, hints: [] },
    ],
    hints: [],
  };
}

// Die gezeichnete Ansicht der Karteikarte, wie die Pipeline sie liefert.
function ansicht() {
  const container = document.querySelector('.pane-group[data-pane="0"] article.markdown-body');
  container.innerHTML =
    '<div class="frontmatter-block"><button type="button" class="frontmatter-header">' +
    '<span class="frontmatter-count" data-fm-count="2"></span></button><pre></pre></div>' +
    '<h1>Umberto Eco</h1><p>Freitext.</p>';
  return container;
}

async function ruhe() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
  antwort = ueberblick();
  reiter = { path: ECO, content: ECO_TEXT };
  // Wie Stufe 1 des Haupt-Prozesses: das Ziel gegen den Ordner des Dokuments aufgelöst.
  lesen = (ziel, basis) => ({
    ok: true,
    path: path.posix.resolve(path.posix.dirname(basis), ziel),
    displayPath: 'Books by this author.md',
    content: '# x',
  });
  for (const liste of [gelesen, gezeichnet, abfragen, geschrieben, geoeffnet, schrittAufrufe])
    liste.length = 0;
  ueberblickAnfragen = 0;
});

describe('Sichten einer Karteikarte in der Lese-Ansicht (AK3)', () => {
  it('setzt je Sicht einen Block mit Kopfzeile unter den Dateikopf und vor den Freitext', async () => {
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    const kinder = [...container.children].map((e) => e.className || e.tagName);
    expect(kinder).toEqual(['frontmatter-block', 'db-card-views', 'H1', 'P']);
    const bloecke = container.querySelectorAll('.db-card-views > .db-card-view');
    expect(bloecke).toHaveLength(1);
    const kopf = bloecke[0].querySelector('.db-card-view-header');
    expect(kopf.querySelector('.db-card-view-label').textContent).toBe('Sicht');
    expect(kopf.querySelector('.db-card-view-link').textContent).toBe('Books by this author');
    expect(bloecke[0].querySelector('.db-card-view-body').textContent).toContain(
      'Die Bücher dieses Autors.',
    );
  });

  it('die Abfrage hat die Karteikarte als Bezug, nicht die Abfrage-Datei', async () => {
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    // Gelesen wird die Abfrage-Datei, gezeichnet mit ihrem eigenen Pfad ...
    expect(gelesen).toEqual([[ECO, SICHT_RELATIV, null]]);
    expect(gezeichnet).toEqual([[SICHT, { frontmatterBlock: false }]]);
    // ... befüllt aber mit der Karteikarte als Träger-Datei der Abfrage.
    expect(schrittAufrufe.map((a) => a.basePath)).toEqual([ECO]);
    expect(abfragen).toEqual([[ECO, ABFRAGE]]);
    const platzhalter = container.querySelector('.db-card-view .perspective-query');
    expect(platzhalter.dataset.fmBase).toBe(ECO);
    // Verweise im Körper lösen sich gegen die Abfrage-Datei auf.
    expect(container.querySelector('.db-card-view-body').dataset.embedBase).toBe(SICHT);
  });

  it('meldet eine Sicht ohne Abfrage-Datei an ihrer Stelle mit ihrem Namen (AK5)', async () => {
    antwort = ueberblick([
      { name: 'Fehlt', path: null },
      { name: 'Books by this author', path: SICHT },
      { name: 'Verschwunden', path: '/raum/Verschwunden.md' },
    ]);
    lesen = (ziel) =>
      ziel === SICHT_RELATIV
        ? { ok: true, path: SICHT, content: '# x' }
        : { ok: false, error: 'not found' };
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    const bloecke = [...container.querySelectorAll('.db-card-view')];
    expect(bloecke.map((b) => b.classList.contains('db-card-view-missing'))).toEqual([
      true,
      false,
      true,
    ]);
    expect(bloecke[0].textContent).toBe(
      'Die Sicht «Fehlt» lässt sich nicht einblenden, weil es keine Abfrage-Datei dieses Namens gibt.',
    );
    expect(bloecke[2].textContent).toContain('«Verschwunden»');
  });

  it('der Block ist nicht bearbeitbar, trägt keine Zeilen-Marken und schreibt nichts (AK4)', async () => {
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    expect(schrittAufrufe).toHaveLength(1);
    const koerper = container.querySelector('.db-card-view-body');
    expect(koerper.querySelectorAll('[data-source-line]')).toHaveLength(0);
    expect(container.querySelector('.db-card-views [contenteditable="true"]')).toBeNull();
    expect(reiter.content).toBe(ECO_TEXT);
    expect(geschrieben).toEqual([]);
  });

  it('erneutes Zeichnen ersetzt die Blöcke, statt sie zu verdoppeln', async () => {
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    applyFrontmatterLine(container, ECO);
    await ruhe();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    expect(container.querySelectorAll('.db-card-views')).toHaveLength(1);
    expect(container.querySelectorAll('.db-card-view')).toHaveLength(1);
  });

  it('die Kopfzeile öffnet die Abfrage-Datei', async () => {
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    container.querySelector('.db-card-view-link').click();
    expect(geoeffnet).toEqual([SICHT]);
  });
});

describe('Wo keine Sicht erscheint (AK4, Ränder)', () => {
  it('ohne Pfad, wie im Block-Widget der Live-Ansicht, nie', async () => {
    const container = ansicht();
    applyFrontmatterLine(container);
    await ruhe();
    expect(container.querySelector('.db-card-views')).toBeNull();
    expect(ueberblickAnfragen).toBe(0);
  });

  it('an einem Dokument ohne Kennung fragt sie die Datenbank gar nicht', async () => {
    reiter = { path: '/raum/Authors/Notiz.md', content: '# Notiz\n' };
    const container = ansicht();
    applyFrontmatterLine(container, reiter.path);
    await ruhe();
    expect(container.querySelector('.db-card-views')).toBeNull();
    expect(ueberblickAnfragen).toBe(0);
  });

  it('an einem Dokument außerhalb des Kartei-Ordners nicht, auch mit Kennung', async () => {
    reiter = { path: '/raum/Anderes/Eco.md', content: ECO_TEXT };
    const container = ansicht();
    applyFrontmatterLine(container, reiter.path);
    await ruhe();
    expect(container.querySelector('.db-card-views')).toBeNull();
  });

  it('ohne Angabe views an der Tabelle nicht', async () => {
    antwort = ueberblick(undefined);
    delete antwort.tabellen[0].sichten;
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    expect(container.querySelector('.db-card-views')).toBeNull();
  });

  it('wenn die Spalte ein anderes Dokument zeigt als gezeichnet wird, nicht', async () => {
    reiter = { path: '/raum/Library.md', content: ECO_TEXT };
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    expect(container.querySelector('.db-card-views')).toBeNull();
  });

  it('im Aus-Zustand der Erweiterung «Datenbank» nicht', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    const container = ansicht();
    applyFrontmatterLine(container, ECO);
    await ruhe();
    expect(container.querySelector('.db-card-views')).toBeNull();
    expect(ueberblickAnfragen).toBe(0);
  });
});

describe('Übersichts-Seite: Spalte «Sichten» (AK2)', () => {
  it('nennt die Sichten je Tabelle, eine ohne Abfrage-Datei gekennzeichnet', async () => {
    antwort = ueberblick([
      { name: 'Books by this author', path: SICHT },
      { name: 'Fehlt', path: null },
    ]);
    const def = systemPages.systemPageById(seite.DATENBANK_UEBERSICHT_PAGE_ID);
    def.onOpen();
    const container = document.createElement('div');
    document.body.appendChild(container);
    def.mount(container);
    await ruhe();
    const zellen = [...container.querySelectorAll('.db-overview-table-views')];
    expect(zellen.map((z) => z.textContent)).toEqual(['Books by this author.md, Fehlt', '']);
    expect(zellen[0].querySelector('.db-overview-view-missing').textContent).toBe('Fehlt');
  });
});

// 4T-002499: Unter Linux zeigte die Lese-Ansicht keine Sicht, weil der absolute
// Pfad der Abfrage-Datei mit «/» beginnt und der Lese-Kanal der Einbettungen
// ein solches Ziel als Unterseite des Dokuments deutet (DB-KAS-06 im
// Linux-Ablauf-Lauf der Release-Strecke vom 2026-11-01).
describe('Ziel der Abfrage-Datei im Lese-Kanal (4T-002499)', () => {
  it('ist unter Linux und macOS kein Unterseiten-Verweis und führt zur Abfrage-Datei', () => {
    for (const [karte, sicht, erwartet] of [
      [ECO, SICHT, SICHT_RELATIV],
      [ECO, '/raum/Authors/Books by this author.md', 'Books by this author.md'],
      [ECO, '/raum/Authors/Abfragen/Books.md', 'Abfragen/Books.md'],
      // Ein Bereich direkt in der Wurzel «/»: gemeinsam ist allein die Wurzel.
      ['/Authors/Umberto Eco.md', '/Sichten/Books.md', '../Sichten/Books.md'],
    ]) {
      // Die alte Form, der absolute Pfad, wäre als Unterseite gedeutet worden.
      expect(isRelativeTarget(sicht)).toBe(true);
      const ziel = sichten.zielZurKarte(karte, sicht);
      expect(ziel).toBe(erwartet);
      expect(isRelativeTarget(ziel)).toBe(false);
      expect(path.posix.resolve(path.posix.dirname(karte), ziel)).toBe(sicht);
    }
  });

  it('führt unter Windows zur Abfrage-Datei und lässt ein anderes Laufwerk unverändert', () => {
    const karte = 'C:\\raum\\Authors\\Umberto Eco.md';
    const sicht = 'C:\\raum\\Sichten\\Books by this author.md';
    const ziel = sichten.zielZurKarte(karte, sicht);
    expect(ziel).toBe(SICHT_RELATIV);
    expect(path.win32.resolve(path.win32.dirname(karte), ziel)).toBe(sicht);
    expect(sichten.zielZurKarte(karte, 'D:\\anders\\Books.md')).toBe('D:\\anders\\Books.md');
  });

  it('vergleicht unter Windows ohne Rücksicht auf die Schreibung', () => {
    plattform.setPlatformForTests('win32');
    try {
      const ziel = sichten.zielZurKarte(
        'C:\\Raum\\Authors\\Umberto Eco.md',
        'c:\\raum\\Sichten\\Books.md',
      );
      expect(ziel).toBe('../Sichten/Books.md');
    } finally {
      plattform.setPlatformForTests(undefined);
    }
  });

  it('lässt einen Netzwerk-Pfad auf einem anderen Server oder einer anderen Freigabe unverändert', () => {
    const anders = '\\\\srvB\\share\\Books.md';
    expect(sichten.zielZurKarte('\\\\srvA\\share\\Authors\\Karte.md', anders)).toBe(anders);
    const andereFreigabe = '\\\\srvA\\b\\Books.md';
    expect(sichten.zielZurKarte('\\\\srvA\\a\\X\\Karte.md', andereFreigabe)).toBe(andereFreigabe);
    expect(
      sichten.zielZurKarte('\\\\srvA\\share\\Authors\\Karte.md', '\\\\srvA\\share\\Q\\Books.md'),
    ).toBe('../Q/Books.md');
  });
});
