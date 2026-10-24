// @vitest-environment jsdom
// 4T-002146 (Epic 3E-000261), AK5: Die neuen Zusagen der gestalteten Maske im
// Aus-Zustand der Erweiterung «Datenbank», jede einzeln nachgewiesen. Benannt
// sind sie am 2026-10-09 (Entscheidung F6, Option A) im Abschluss-Task:
//
//   1. Bei ausgeschalteter Datenbank ist die Maske über keinen Weg erreichbar,
//      auch nicht über einen Link aus einer Maske oder ein Verweis-Feld.
//   2. Eine Masken-Datei ist ein gewöhnliches Dokument, in dem Wert-Platzhalter
//      und Marker der Bereiche als Text stehen.
//   3. Die Angabe `form` der Tabellen-Definition bleibt ohne Wirkung.
//
// **Warum eine eigene Datei.** Die Nachbarn messen die Funktionen im
// An-Zustand; jeder Fall hier legt den Schalter um, und ein vergessenes
// Zurückstellen kippte dort fremde Fälle (Begründung wie in
// `test/unit/datensatz-aus-zustand.test.js`). Die drei Zusagen liegen auf drei
// Seiten der Anwendung — Anzeige-Prozess, Markdown-Weg der Dokumente,
// Haupt-Prozess —, gehören aber zu EINER Auflage; sie stehen deshalb in einer
// Datei, wie `renderer/datenbank-uebersicht-seite.test.js` neben der Anzeige
// einen Baustein des Haupt-Prozesses lädt.
//
// **Gemessen wird am Tor, nicht an den Zugängen.** Zusage 1: Das Wurzel-Tor
// steht in `oeffneMaske` (`src/renderer/modules/database/masken-seite.js`,
// `isExtensionActive('database')`); das Dokument-Ereignis `scg:open-form` und
// alle drei Wege der Navigation (`masken-navigation.js`: Link über `abfangen`,
// Verweis-Feld, «Zurück») münden dort. Die Navigation wird deshalb mit dem
// ECHTEN `oeffneMaske` verdrahtet, ersetzt sind allein Katalog, Link-Weg und
// Zeichnen (Muster `db-masken-navigation.test.js`). Zusage 2: der Markdown-Weg
// des Viewers (`renderMarkdown` aus `src/shared/markdown/markdown.js`), der
// keine Masken-Platzhalter kennt. Zusage 3: die beiden Kanäle, die die Angabe
// in eine Wirkung umsetzen, die Standard-Maske im Datensatz-Kanal und der
// Befund der Konsistenz-Prüfung; beide tragen das Tor `datenbankAktiv`
// (`src/main/ipc/database.js`, Muster `db-datensatz-kanal.test.js`).
//
// **Jeder Fall trägt seine Nicht-Vakuitäts-Probe:** Im An-Zustand geschieht
// das Gegenteil (die Maske öffnet, die Körper-Zerlegung erkennt die
// Platzhalter, die Angabe wählt die Maske), sonst bewiese der Aus-Fall nichts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

// Aufgefangen wie in `datensatz-treffer-klick.test.js`: das Öffnen einer Datei
// und das Aktivieren der Spalte, die es in diesem Gerüst nicht gibt.
const geoeffnet = [];
vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (...args) => {
    geoeffnet.push(args[1]);
    return args[0];
  },
  activatePane: () => {},
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

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { maskeOffen, oeffneMaske } =
  await import('../../../src/renderer/modules/database/masken-seite.js');
const { erzeugeNavigation, VERLAUF_MERKEN } =
  await import('../../../src/renderer/modules/database/masken-navigation.js');
const { renderMarkdown, configureExtensions } =
  await import('../../../src/shared/markdown/markdown.js');
const { zerlegeMaskenKoerper } = await import('../../../src/shared/database/form-body.js');
const { registerDatabaseIpc } = await import('../../../src/main/ipc/database.js');
const { KONSISTENZ_BEFUNDE } = await import('../../../src/main/database/konsistenz-pruefung.js');

const LOANS = '/raum/Loans.md';
const LIBRARY = '/raum/Library.md';
const LOANS_FORM = '/raum/Loans Form.md';
const LOANS_KURZ = '/raum/Loans Kurz.md';
const LIBRARY_FORM = '/raum/Library Form.md';

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

// Fehler in Ereignis-Hörern wirft jsdom nicht an den Auslöser zurück, sondern
// meldet sie am Fenster; «wirft nichts» wird deshalb dort abgelesen.
const fensterFehler = [];
const merkeFehler = (ev) => fensterFehler.push(ev.error || ev.message);

let tmpDirs = [];

beforeEach(async () => {
  await schalteDatenbank(true);
  await raeumeAuf();
  geoeffnet.length = 0;
  anfragen.length = 0;
  fensterFehler.length = 0;
  window.addEventListener('error', merkeFehler);
});

afterEach(async () => {
  window.removeEventListener('error', merkeFehler);
  configureExtensions([]);
  await schalteDatenbank(true);
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// --- Zusage 1: die Maske ist über keinen Weg erreichbar ----------------------------

describe('Zusage 1: Aus-Zustand, die Maske ist über keinen Weg erreichbar', () => {
  function oeffneUeberEreignis(detail) {
    document.dispatchEvent(new CustomEvent('scg:open-form', { detail }));
  }

  it('das Ereignis «scg:open-form» öffnet nichts und wirft nichts, auch mit bestimmter Maske', async () => {
    await schalteDatenbank(false);
    oeffneUeberEreignis({ filePath: LOANS, recordId: 'r-00007' });
    oeffneUeberEreignis({ filePath: LOANS, recordId: 'r-00007', maske: 'Loans Kurz' });
    oeffneUeberEreignis({ filePath: LOANS, recordId: null });
    expect(() => oeffneMaske(LOANS, 'r-00007', { maske: LOANS_KURZ })).not.toThrow();
    await Promise.resolve();
    expect(maskeOffen()).toBe(false);
    expect(anfragen).toEqual([]);
    expect(geoeffnet).toEqual([]);
    expect(fensterFehler).toEqual([]);

    // Nicht-Vakuitäts-Probe: eingeschaltet öffnet dasselbe Ereignis die Maske.
    await schalteDatenbank(true);
    oeffneUeberEreignis({ filePath: LOANS, recordId: 'r-00007', maske: 'Loans Kurz' });
    await Promise.resolve();
    expect(maskeOffen()).toBe(true);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]).toMatchObject({ tabelle: LOANS, kennung: 'r-00007', maske: 'Loans Kurz' });
  });

  describe('Navigation einer Maske, verdrahtet mit dem echten Öffnen der Seite', () => {
    const UEBERBLICK = {
      status: 'ready',
      tabellen: [
        { name: 'Loans', path: LOANS, maske: LOANS_FORM, maskenPfade: [LOANS_FORM, LOANS_KURZ] },
        { name: 'Library', path: LIBRARY, maske: LIBRARY_FORM, maskenPfade: [LIBRARY_FORM] },
      ],
    };

    let nav;
    let letzterLinkWeg;
    let zeichne;

    beforeEach(() => {
      // Das Zustands-Objekt einer Maske, die die Ausleihe r-00007 in ihrer
      // Standard-Maske zeigt; die echte Seite ist dabei nicht offen.
      const seite = {
        tabellenPfad: LOANS,
        kennung: 'r-00007',
        neu: false,
        maske: null,
        daten: { status: 'ready', koerper: { quelle: 'datei', pfad: LOANS_FORM, segmente: [] } },
      };
      zeichne = vi.fn();
      letzterLinkWeg = null;
      nav = erzeugeNavigation({
        seite,
        oeffne: oeffneMaske,
        ladeUeberblick: async () => UEBERBLICK,
        // Der Link-Weg der Anwendung löst «Loans Kurz.md» gegen die Masken-Datei
        // auf und reicht das Markdown-Ziel vor dem Öffnen an `abfangen`.
        aktiviereLink: (href, wiki, basis, optionen) => {
          letzterLinkWeg = optionen.abfangen(basis.replace(/[^/]*$/, '') + href);
          return letzterLinkWeg;
        },
        zeichne,
      });
    });

    async function klickeLink(href) {
      const koerper = document.createElement('div');
      koerper.className = 'db-form-body';
      koerper.innerHTML = `<p><a class="wikilink" href="${href}">Ziel</a></p>`;
      koerper.addEventListener('click', nav.beiLinkKlick);
      document.body.appendChild(koerper);
      koerper
        .querySelector('a')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      koerper.remove();
      expect(letzterLinkWeg).not.toBeNull();
      return letzterLinkWeg;
    }

    function verweisKlick() {
      nav.beiVerweisKlick({
        tabelle: LIBRARY,
        tabellenName: 'Library',
        kennung: 'r-00001',
        wert: 'r-1',
      });
    }

    it('ein Link aus einer Maske auf eine Maske derselben Tabelle öffnet nichts', async () => {
      await schalteDatenbank(false);
      // Die Ziel-Klärung erkennt die Maske und übernimmt den Klick; das Öffnen
      // endet am Tor, und keine Datei wird stattdessen geöffnet.
      expect(await klickeLink('Loans Kurz.md')).toBe(true);
      expect(maskeOffen()).toBe(false);
      expect(anfragen).toEqual([]);
      expect(geoeffnet).toEqual([]);
      expect(fensterFehler).toEqual([]);

      // Nicht-Vakuitäts-Probe: eingeschaltet zeigt derselbe Klick den
      // Datensatz in der kurzen Maske.
      await schalteDatenbank(true);
      expect(await klickeLink('Loans Kurz.md')).toBe(true);
      expect(maskeOffen()).toBe(true);
      expect(anfragen).toHaveLength(1);
      expect(anfragen[0]).toMatchObject({ tabelle: LOANS, kennung: 'r-00007', maske: LOANS_KURZ });
    });

    it('ein Verweis-Feld öffnet nichts', async () => {
      await schalteDatenbank(false);
      expect(() => verweisKlick()).not.toThrow();
      expect(maskeOffen()).toBe(false);
      expect(anfragen).toEqual([]);
      // Kein Ersatzweg: keine Meldung und keine geöffnete Datei.
      expect(zeichne).not.toHaveBeenCalled();
      expect(geoeffnet).toEqual([]);

      // Nicht-Vakuitäts-Probe: eingeschaltet öffnet das Verweis-Feld das Buch.
      await schalteDatenbank(true);
      verweisKlick();
      expect(maskeOffen()).toBe(true);
      expect(anfragen.map((a) => [a.tabelle, a.kennung])).toEqual([[LIBRARY, 'r-00001']]);
    });

    it('«Zurück» öffnet nichts', async () => {
      // Ein Eintrag im Verlauf, wie ihn ein Wechsel über die Navigation hinterlässt.
      nav.beimBinden(VERLAUF_MERKEN, true);
      expect(nav.hatVorigen()).toBe(true);
      await schalteDatenbank(false);
      expect(() => nav.zurueck()).not.toThrow();
      expect(maskeOffen()).toBe(false);
      expect(anfragen).toEqual([]);

      // Nicht-Vakuitäts-Probe: eingeschaltet führt «Zurück» zur Ausleihe.
      await schalteDatenbank(true);
      nav.zurueck();
      expect(maskeOffen()).toBe(true);
      expect(anfragen.map((a) => [a.tabelle, a.kennung])).toEqual([[LOANS, 'r-00007']]);
    });
  });
});

// --- Zusage 2: die Masken-Datei ist ein gewöhnliches Dokument --------------------

describe('Zusage 2: Aus-Zustand, Platzhalter und Marker stehen im Dokument als Text', () => {
  const KOERPER = [
    '# Buch',
    '',
    '{{field:Title}}',
    '',
    'Menge doppelt: {{value:menge * 2}}',
    '',
    '{{when:onloan}}',
    '',
    'Ausgeliehen an {{field:Borrower}}',
    '',
    '{{end}}',
    '',
  ].join('\n');
  const DATEI = ['---', 'db-form:', '  table: Library', '---', '', KOERPER].join('\n');
  const ZEICHENFOLGEN = [
    '{{field:Title}}',
    '{{value:menge * 2}}',
    '{{when:onloan}}',
    '{{field:Borrower}}',
    '{{end}}',
  ];

  function alsDom(html) {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
  }

  it('der Markdown-Weg des Viewers gibt die Zeichenfolgen wörtlich als Text aus', () => {
    configureExtensions(['database']);
    const aus = alsDom(renderMarkdown(DATEI, 'de'));
    for (const zeichen of ZEICHENFOLGEN) expect(aus.textContent).toContain(zeichen);
    // Kein Element der Maske und kein Eingabe-Element.
    expect(aus.querySelector('[class*="db-form"]')).toBeNull();
    expect(aus.querySelector('input, select, textarea')).toBeNull();
    // Die Absätze tragen die Zeichenfolgen als ganzen Text, nichts ist ersetzt.
    const absaetze = [...aus.querySelectorAll('p')].map((p) => p.textContent);
    expect(absaetze).toEqual(
      expect.arrayContaining([
        '{{field:Title}}',
        'Menge doppelt: {{value:menge * 2}}',
        '{{when:onloan}}',
        '{{end}}',
      ]),
    );
    // Der Schalter verändert den Weg nicht: Eingeschaltet ist die Ausgabe dieselbe.
    configureExtensions([]);
    expect(renderMarkdown(DATEI, 'de')).toBe(aus.innerHTML);
  });

  it('Nicht-Vakuitäts-Probe: derselbe Körper ist für die Maske Feld, Wert und Bereich', () => {
    const fields = [{ name: 'Title' }, { name: 'Borrower' }, { name: 'menge' }, { name: 'onloan' }];
    const { segmente, hints } = zerlegeMaskenKoerper(KOERPER, fields);
    expect(hints).toEqual([]);
    const arten = segmente.map((s) => s.art);
    expect(arten).toContain('feld');
    expect(arten).toContain('wert');
    const bereich = segmente.find((s) => s.art === 'bereich');
    expect(bereich.bedingung).toBe('onloan');
    expect(bereich.kinder).toContainEqual({ art: 'feld', name: 'Borrower' });
  });
});

// --- Zusage 3: die Angabe form bleibt ohne Wirkung -------------------------------

describe('Zusage 3: Aus-Zustand, die Angabe «form» bleibt ohne Wirkung', () => {
  const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

  function lege(wurzel, name, text) {
    const pfad = path.join(wurzel, name);
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  }

  function maskenDatei(tabelle, titel) {
    return ['---', 'db-form:', `  table: ${tabelle}`, '---', '', `# ${titel}`, ''].join('\n');
  }

  // Eine Tabelle mit zwei Masken-Dateien; die Angabe `form` nennt die zweite
  // nach Pfad, damit ihre Wirkung von der Regel «ohne Angabe» unterscheidbar ist.
  function bestand(angabe) {
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-aus-maske-'));
    tmpDirs.push(wurzel);
    const kopf = lege(
      wurzel,
      'Kunden.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: name',
        `  form: ${angabe}`,
        '  lastId: 1',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Anna',
        '```',
        '',
      ].join('\n'),
    );
    const lang = lege(wurzel, 'Kunden Form.md', maskenDatei('Kunden', 'Lang'));
    const kurz = lege(wurzel, 'Kunden Kurz.md', maskenDatei('Kunden', 'Kurz'));
    const sicht = {
      dbKindsPerFile: new Map([
        [kopf, ['table']],
        [lang, ['form']],
        [kurz, ['form']],
      ]),
    };
    return { wurzel, sicht, lang, kurz };
  }

  // Der echte Handler über die echte Registrier-Funktion, das Tor einstellbar.
  function kanaele(sicht, datenbankAktiv) {
    const liste = new Map();
    registerDatabaseIpc((kanal, fn) => liste.set(kanal, fn), {
      areaRootForEvent: (event) => (event && event.wurzel) || null,
      backlinks: {
        ensureIndexForDemand: () => {},
        datenbankSicht: () => ({ status: 'ready', meta: null, sicht }),
        bufferTextFor: () => null,
      },
      isMarkdownPath,
      schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
      datenbankAktiv,
    });
    return liste;
  }

  const ereignis = (wurzel) => ({ wurzel, sender: { id: 1 } });

  it('Datensatz-Kanal: keine Standard-Maske aus der Angabe, der Kanal antwortet ohne Zugriff', async () => {
    const { wurzel, sicht, lang, kurz } = bestand('Kunden Kurz');
    let aktiv = false;
    const liste = kanaele(sicht, () => aktiv);
    // Die Gestalt der Abweisung ohne Zugriff, abgelesen am Vorbild-Kanal.
    const ohneZugriff = await liste.get('database:changeLog')({}, undefined);
    expect(ohneZugriff.status).toBe('unavailable');
    const lesen = liste.get('database:datensatz');
    const basis = { tabelle: 'Kunden.md', kennung: 'r-00001', sprache: 'de' };
    for (const params of [basis, { ...basis, kennung: null }, { ...basis, maske: 'Kunden Kurz' }]) {
      expect(await lesen(ereignis(wurzel), params), JSON.stringify(params)).toEqual(ohneZugriff);
    }

    // Nicht-Vakuitäts-Probe: eingeschaltet wählt die Angabe die Maske, und
    // zwar die zweite nach Pfad, nicht die erste der Regel «ohne Angabe».
    aktiv = true;
    const antwort = await lesen(ereignis(wurzel), basis);
    expect(antwort.status).toBe('ready');
    expect(antwort.koerper.pfad).toBe(kurz);
    expect(antwort.koerper.pfad).not.toBe(lang);
  });

  it('Konsistenz-Prüfung: kein Befund zur Angabe, der Kanal antwortet ohne Zugriff', async () => {
    const { wurzel, sicht } = bestand('Gibt Es Nicht');
    let aktiv = false;
    const liste = kanaele(sicht, () => aktiv);
    const ohneZugriff = await liste.get('database:changeLog')({}, undefined);
    const pruefen = liste.get('database:konsistenz');
    expect(await pruefen(ereignis(wurzel), { tabelle: null })).toEqual(ohneZugriff);

    // Nicht-Vakuitäts-Probe: eingeschaltet meldet die Prüfung die Angabe, die
    // keine Masken-Datei der Tabelle trifft.
    aktiv = true;
    const antwort = await pruefen(ereignis(wurzel), { tabelle: null });
    expect(antwort.status).toBe('ready');
    expect(antwort.befunde).toContainEqual(
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.maskeAngabeUnbekannt,
        wert: 'Gibt Es Nicht',
      }),
    );
  });
});
