// @vitest-environment jsdom
// 4T-001759 (Epic 3E-000253, AK1 bis AK3 und AK7): Die Übersichts-Seite der
// Datenbank — was sie aus einer gegebenen Auskunft macht.
//
// Gemessen wird die ANZEIGE und nicht die Erhebung: Steckbrief, Tabellen und
// Fehlerlagen kommen fertig aus dem Katalog-Kanal, und der hat seine eigenen
// Fälle in `db-katalog.test.js`. Hier steht die Frage, ob der Anwender sie
// lesen kann.
//
// **Der deutsche Katalog wird geladen**, anders als bei der Nachbar-Seite My
// Extended Memory, die gegen Schlüssel prüft. Grund ist AK3: Die Fehlerlagen
// sollen im Klartext stehen, und ein Prüffall gegen den Schlüssel-Namen zeigte
// gerade nicht, dass aus einem Hinweis-Code ein ganzer Satz mit eingesetztem
// Ort und eingesetzter Erwartung wird.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import enDict from '../../../src/i18n/en.json';
import frDict from '../../../src/i18n/fr.json';
import esDict from '../../../src/i18n/es.json';
import itDict from '../../../src/i18n/it.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

// Bestands-Markup, so weit die System-Seiten es anfassen (Muster
// memory-page.test.js): je Spalte Reiter-Streifen und die vier Panes.
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

let antwort = null;
window.api.databaseOverview = async () => antwort;
window.api.onBacklinksInvalidated = () => {};
window.api.getAreaDatabaseConfig = async () => ({ hasArea: true, overviewOnOpen: false });

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const seite = await import('../../../src/renderer/modules/database/datenbank-uebersicht-seite.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const helfer = await import('../../../src/renderer/modules/database/datenbank-bereich.js');
const { HINWEIS_META } = await import('../../../src/shared/database/table-hinweise.js');

// Seiten-Lebenszyklus wie beim echten Öffnen: onOpen setzt den frischen
// Zustand, mount baut das DOM; danach ein paar Mikrotask-Runden, weil mount()
// das Holen nur anstößt.
async function baue() {
  const def = systemPages.systemPageById(seite.DATENBANK_UEBERSICHT_PAGE_ID);
  def.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  def.mount(container);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return container;
}

function auskunft(ueberschreibungen = {}) {
  return {
    status: 'ready',
    istDatenbankBereich: true,
    steckbrief: { name: 'Mini-CRM', description: 'Kontakte und Firmen' },
    tabellen: [
      { name: 'Personen', felder: 4, hints: [] },
      { name: 'Firmen', felder: 2, hints: [] },
    ],
    hints: [],
    ...ueberschreibungen,
  };
}

beforeEach(() => {
  helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
  antwort = auskunft();
});

describe('Übersichts-Seite der Datenbank: Steckbrief und Tabellen (4T-001759)', () => {
  it('zeigt Name und Beschreibung aus dem Steckbrief (AK1)', async () => {
    const container = await baue();
    const werte = [...container.querySelectorAll('.db-overview-row-value')].map(
      (e) => e.textContent,
    );
    expect(werte).toContain('Mini-CRM');
    expect(werte).toContain('Kontakte und Firmen');
  });

  it('nennt den Ersatz-Text, wo der Steckbrief nichts sagt (AK1)', async () => {
    antwort = auskunft({ steckbrief: { schemaVersion: '1' } });
    const container = await baue();
    const werte = [...container.querySelectorAll('.db-overview-row-value')].map(
      (e) => e.textContent,
    );
    expect(werte).toEqual(['ohne Namen', 'ohne Beschreibung']);
  });

  it('löst eine Beschriftung in der Sprache des Anwenders auf (AK1)', async () => {
    antwort = auskunft({
      steckbrief: { name: { en: 'Contacts', de: 'Kontakte' }, description: 'fest' },
    });
    const container = await baue();
    const werte = [...container.querySelectorAll('.db-overview-row-value')].map(
      (e) => e.textContent,
    );
    expect(werte[0]).toBe('Kontakte');
  });

  it('listet die Tabellen mit der Zahl ihrer Felder (AK2)', async () => {
    const container = await baue();
    const namen = [...container.querySelectorAll('.db-overview-table-name')].map(
      (e) => e.textContent,
    );
    const felder = [...container.querySelectorAll('.db-overview-table-fields')].map(
      (e) => e.textContent,
    );
    expect(namen).toEqual(['Personen', 'Firmen']);
    expect(felder).toEqual(['4', '2']);
  });

  // 4T-001943 (Epic 3E-000257, B2): die geltende Masken-Datei je Tabelle und
  // die Befunde an Masken-Dateien, benannt nach der Datei.
  it('nennt je Tabelle ihre Masken-Datei und meldet Befunde an Masken (4T-001943)', async () => {
    antwort = auskunft({
      tabellen: [
        { name: 'Personen', felder: 4, hints: [], maske: '/db/Personen Form.md' },
        { name: 'Firmen', felder: 2, hints: [], maske: null },
      ],
      masken: [
        { path: '/db/Personen Form.md', table: 'Personen', hints: [] },
        {
          path: '/db/Kunden Form.md',
          table: 'Kunden',
          hints: [{ code: 'formTabelleUnbekannt', index: -1, name: 'Kunden' }],
        },
      ],
    });
    const container = await baue();
    const masken = [...container.querySelectorAll('.db-overview-table-form')].map(
      (e) => e.textContent,
    );
    expect(masken).toEqual(['Personen Form.md', '']);
    const punkt = container.querySelector('.db-overview-issue');
    expect(punkt.querySelector('.db-overview-issue-source').textContent).toBe('Kunden Form.md');
    expect(punkt.querySelector('.db-overview-issue-text').textContent).toContain('«Kunden»');
  });

  // 4T-002184 (Epic 3E-000261, Story-AK4): die Standard-Maske und die Zahl der
  // weiteren Masken-Dateien; der Befund einer Angabe `form` steht als Satz unter
  // den Fehlerlagen, benannt nach der Tabelle.
  it('nennt je Tabelle Standard-Maske und Zahl der weiteren Masken (4T-002184)', async () => {
    antwort = auskunft({
      tabellen: [
        {
          name: 'Personen',
          felder: 4,
          hints: [],
          maske: '/db/Personen Kurz.md',
          maskenPfade: ['/db/Personen Form.md', '/db/Personen Kurz.md', '/db/Personen Voll.md'],
        },
        {
          name: 'Firmen',
          felder: 2,
          hints: [
            { code: 'formDateiFremd', index: -1, name: 'Personen Kurz', expected: 'Personen' },
          ],
          maske: '/db/Firmen Form.md',
          maskenPfade: ['/db/Firmen Form.md'],
        },
        { name: 'Orte', felder: 1, hints: [], maske: null, maskenPfade: [] },
      ],
      masken: [],
    });
    const container = await baue();
    const zellen = [...container.querySelectorAll('.db-overview-table-form')];
    expect(zellen.map((e) => e.textContent)).toEqual([
      'Personen Kurz.md+2 weitere',
      'Firmen Form.md',
      '',
    ]);
    expect(zellen[0].querySelector('.db-overview-form-more').textContent).toBe('+2 weitere');
    expect(zellen[1].querySelector('.db-overview-form-more')).toBeNull();
    const punkt = container.querySelector('.db-overview-issue');
    expect(punkt.querySelector('.db-overview-issue-source').textContent).toBe('Firmen');
    expect(punkt.querySelector('.db-overview-issue-text').textContent).toBe(
      'form nennt die Masken-Datei «Personen Kurz», die zur Tabelle «Personen» gehört. ' +
        'Es gilt die erste Masken-Datei dieser Tabelle nach Pfad, sonst die erzeugte Maske.',
    );
  });

  it('sagt es, wenn die Datenbank noch keine Tabelle führt (AK2)', async () => {
    antwort = auskunft({ tabellen: [] });
    const container = await baue();
    expect(container.textContent).toContain('Diese Datenbank führt noch keine Tabelle.');
  });
});

// 4T-002307 (Epic 3E-000263, Story-AK1, AK3): Die Rollen des Steckbriefs, eine
// Zeile je Rolle unter Name und Beschreibung; ohne Rollen kein Abschnitt; eine
// Rolle mit Hinweis steht nicht dort, sondern unter den Fehlerlagen.
describe('Übersichts-Seite der Datenbank: Rollen im Steckbrief (4T-002307)', () => {
  function rollenZeilen(container) {
    const titel = [...container.querySelectorAll('.db-overview-section-title')].find(
      (e) => e.textContent === 'Rollen',
    );
    if (!titel) return null;
    return [...titel.parentElement.querySelectorAll('.db-overview-row')].map((z) => [
      z.querySelector('.db-overview-row-label').textContent,
      z.querySelector('.db-overview-row-value').textContent,
    ]);
  }

  it('zeigt je Rolle ihre Erlaubnisse je Tabelle im Steckbrief-Block (AK1)', async () => {
    antwort = auskunft({
      steckbrief: {
        name: 'Mini-CRM',
        rollen: {
          librarian: { alle: true, operationen: {}, alleTabellen: null },
          assistant: {
            alle: false,
            operationen: { Library: ['update'], Loans: ['create', 'update', 'delete'] },
            alleTabellen: null,
          },
          pfleger: { alle: false, operationen: { Loans: ['define'] }, alleTabellen: ['update'] },
          gast: { alle: false, operationen: {}, alleTabellen: null },
        },
      },
    });
    const container = await baue();
    expect(rollenZeilen(container)).toEqual([
      ['librarian', 'alles'],
      ['assistant', 'Library: ändern; Loans: anlegen, ändern, löschen'],
      ['pfleger', 'alle Tabellen: ändern; Loans: Definition ändern'],
      ['gast', 'keine Erlaubnis'],
    ]);
    // Der Abschnitt steht im Steckbrief-Block, unter Name und Beschreibung.
    const steckbrief = container.querySelector('.db-overview-section');
    expect(steckbrief.querySelector('.db-overview-section .db-overview-section')).not.toBeNull();
  });

  it('zeigt ohne Rollen keinen Abschnitt (AK1)', async () => {
    for (const steckbrief of [{ name: 'Mini-CRM' }, { name: 'Mini-CRM', rollen: {} }]) {
      helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
      antwort = auskunft({ steckbrief });
      const container = await baue();
      expect(rollenZeilen(container)).toBeNull();
    }
  });

  it('führt die Hinweise einer Rolle unter den Fehlerlagen im Klartext (AK2)', async () => {
    antwort = auskunft({
      steckbrief: { name: 'Mini-CRM', rollen: {} },
      hints: [
        {
          code: 'roleOperation',
          index: -1,
          name: 'assistant',
          key: 'Loans',
          wert: 'archive',
          expected: ['create', 'update', 'delete', 'define'],
        },
        { code: 'roleTable', index: -1, name: 'assistant', key: 'Shelves', expected: ['Loans'] },
      ],
    });
    const container = await baue();
    const zeilen = [...container.querySelectorAll('.db-overview-issue-text')].map(
      (e) => e.textContent,
    );
    expect(zeilen).toEqual([
      'Die Rolle «assistant» nennt an der Tabelle «Loans» die unbekannte Operation «archive»; ' +
        'vorgesehen sind create, update, delete, define oder all. Die Rolle gilt als nicht gesetzt.',
      'Die Rolle «assistant» nennt die Tabelle «Shelves», die es in dieser Datenbank nicht gibt. ' +
        'Die Rolle gilt als nicht gesetzt.',
    ]);
  });
});

describe('Übersichts-Seite der Datenbank: Fehlerlagen im Klartext (AK3)', () => {
  it('macht aus einem Hinweis am Steckbrief einen ganzen Satz', async () => {
    antwort = auskunft({
      hints: [{ code: 'databaseName', index: -1, name: null, key: 'name', expected: null }],
    });
    const container = await baue();
    const zeilen = [...container.querySelectorAll('.db-overview-issue-text')].map(
      (e) => e.textContent,
    );
    expect(zeilen).toEqual([
      'Der Name der Datenbank ist keine gültige Beschriftung; erwartet wird Text oder eine Zuordnung von Sprache zu Text.',
    ]);
  });

  it('setzt Ort und Erwartung in den Satz ein und nennt die Tabelle davor', async () => {
    antwort = auskunft({
      tabellen: [
        {
          name: 'Personen',
          felder: 1,
          hints: [
            {
              code: 'type',
              index: 2,
              name: 'geburtstag',
              key: 'type',
              expected: ['string', 'date'],
            },
          ],
        },
      ],
    });
    const container = await baue();
    const punkt = container.querySelector('.db-overview-issue');
    expect(punkt.querySelector('.db-overview-issue-source').textContent).toBe('Personen');
    expect(punkt.querySelector('.db-overview-issue-text').textContent).toBe(
      'Feld 3 (geburtstag): unbekannter Spalten-Typ; erwartet wird einer von string, date.',
    );
  });

  it('lässt einen Code ohne eigenen Satz nicht leer stehen', async () => {
    // Ein erfundener Code steht hier für den künftigen, der ohne Satz in den
    // Katalog käme. Bis 4T-001584 stand an dieser Stelle ein Befund des
    // Datensatz-Blocks; seit der seinen eigenen Satz trägt, prüfte er den
    // Rückfall nicht mehr.
    antwort = auskunft({
      hints: [{ code: 'nochNichtBeschrieben', index: -1, name: null, key: null, expected: null }],
    });
    const container = await baue();
    expect(container.querySelector('.db-overview-issue-text').textContent).toBe(
      'Nicht näher beschriebene Fehlerlage (nochNichtBeschrieben).',
    );
  });

  it('meldet den fehlerfreien Fall ausdrücklich', async () => {
    const container = await baue();
    expect(container.textContent).toContain('Keine Fehlerlagen.');
    expect(container.querySelectorAll('.db-overview-issue')).toHaveLength(0);
  });
});

describe('Übersichts-Seite der Datenbank: leere Lagen', () => {
  it('zeigt statt der Abschnitte einen Satz, wenn der Bereich keine Datenbank führt', async () => {
    antwort = auskunft({ istDatenbankBereich: false, steckbrief: null, tabellen: [] });
    const container = await baue();
    expect(container.querySelector('.db-overview-empty').textContent).toContain(
      'Dieser Bereich führt keine Datenbank.',
    );
    expect(container.querySelectorAll('.db-overview-section')).toHaveLength(0);
  });

  it('unterscheidet den noch nicht gelesenen Bestand von der fehlenden Datenbank', async () => {
    // Zwei Lagen, zwei Sätze: «noch nicht nachgesehen» ist keine Auskunft über
    // den Bestand, und sie als «keine Datenbank» zu zeigen, wäre eine falsche.
    antwort = {
      status: 'indexing',
      istDatenbankBereich: false,
      steckbrief: null,
      tabellen: [],
      hints: [],
    };
    const container = await baue();
    expect(container.querySelector('.db-overview-empty').textContent).toContain(
      'Der Bereichs-Index wird aufgebaut …',
    );
  });
});

describe('Übersetzung der Hinweis-Codes (AK7)', () => {
  // Der Vorrat wird abgeleitet, nicht abgeschrieben: Jeder Code des Katalogs
  // braucht einen Satz — und zwar in allen fünf Sprachfassungen. Ein künftiger
  // Code fällt damit hier auf und nicht erst beim Anwender.
  //
  // **Ohne Ausnahme seit 4T-001584.** Bis dahin blieben die Befunde am
  // Datensatz-Block draußen, weil sie nirgends als Satz vorlagen; seit ihre
  // Anzeige dieselben Schlüssel benutzt, ist die Menge der ganze Katalog. Die
  // Ausnahme fortzuschreiben hieße, genau die Codes ungeprüft zu lassen, die
  // der Anwender neuerdings als Satz liest.
  const SPRACHEN = { de, en: enDict, fr: frDict, es: esDict, it: itDict };

  it('führt jeden Code des Katalogs in allen fünf Sprachfassungen', () => {
    const codes = Object.keys(HINWEIS_META);
    expect(codes.length).toBeGreaterThan(0);
    const fehlend = [];
    for (const [sprache, dict] of Object.entries(SPRACHEN)) {
      for (const code of codes) {
        const key = `database.hint.${code}`;
        if (!dict[key]) fehlend.push(`${sprache}: ${key}`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  it('führt auch die Befunde am Datensatz-Block, seit ihre Anzeige sie zeigt', () => {
    const record = Object.keys(HINWEIS_META).filter((code) => code.startsWith('record'));
    expect(record.length).toBeGreaterThan(0);
    for (const code of record) expect(de[`database.hint.${code}`]).toBeTruthy();
  });
});

// 4T-001944 (Epic 3E-000257, Bauplan B4; AK4): Der Abschnitt der
// Konsistenz-Prüfung — Aktion, Zähler, Liste und Satz, «keine Befunde» und die
// Grenze der Liste. Der Kanal ist ein Stub; seine Fälle stehen in
// `db-konsistenz-kanal.test.js`.
const { KONSISTENZ_BEFUNDE } = await import('../../../src/main/database/konsistenz-pruefung.js');
const { MAX_BEFUNDE } =
  await import('../../../src/renderer/modules/database/konsistenz-abschnitt.js');

describe('Übersichts-Seite der Datenbank: Konsistenz-Prüfung (4T-001944)', () => {
  let pruefung = null;
  const anfragen = [];
  window.api.databaseKonsistenz = async (params) => {
    anfragen.push(params);
    return pruefung;
  };

  function befund(angaben) {
    return {
      code: KONSISTENZ_BEFUNDE.verweisZielFehlt,
      tabelle: 'Bestellung',
      pfad: '/db/Bestellung.md',
      datei: '/db/Bestellung.md',
      zeile: 12,
      id: 'r-00001',
      anzeige: null,
      feld: 'kunde',
      felder: null,
      wert: 'r-00009',
      zieltabelle: 'Kunden',
      grund: null,
      kennungen: null,
      regel: null,
      meldung: null,
      anzahl: null,
      ...angaben,
    };
  }

  async function pruefeUeber(container, selektor) {
    container.querySelector(selektor).click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it('zeigt die Aktion im Kopf und je Tabelle und das Ergebnis mit Zählern und Sätzen', async () => {
    antwort = auskunft({
      tabellen: [{ name: 'Kunden', path: '/db/Kunden.md', felder: 2, hints: [] }],
    });
    pruefung = {
      status: 'ready',
      dauerMs: 7,
      tabellen: [{ name: 'Kunden', pfad: '/db/Kunden.md', datensaetze: 2, befunde: 2 }],
      befunde: [
        befund({
          code: KONSISTENZ_BEFUNDE.schluesselDoppelt,
          tabelle: 'Kunden',
          pfad: '/db/Kunden.md',
          anzeige: 'Anna',
          feld: null,
          felder: ['kuerzel'],
          wert: 'ANN',
          zieltabelle: null,
          kennungen: ['r-00001', 'r-00002'],
        }),
        befund({ id: null, pfad: null }),
      ],
    };
    anfragen.length = 0;
    const container = await baue();
    expect(container.querySelectorAll('.db-overview-check')).toHaveLength(1);
    expect(container.querySelectorAll('.db-overview-check-table')).toHaveLength(1);
    expect(container.querySelector('.db-consistency')).toBeNull();

    await pruefeUeber(container, '.db-overview-check-table');
    expect(anfragen).toEqual([{ tabelle: '/db/Kunden.md' }]);
    await pruefeUeber(container, '.db-overview-check');
    expect(anfragen[1]).toEqual({ tabelle: null });

    const abschnitt = container.querySelector('.db-consistency');
    expect(abschnitt.querySelector('.db-consistency-summary').textContent).toBe(
      'Geprüft in 7 ms: 1 Tabellen mit 2 Datensätzen, 2 Befunde.',
    );
    expect(abschnitt.querySelector('.db-consistency-count').textContent).toBe('2');
    const zeilen = [...abschnitt.querySelectorAll('.db-consistency-finding')];
    expect(zeilen).toHaveLength(2);
    // Mit Kennung und Pfad ein Knopf in die Maske, «Anzeige-Form (Kennung)».
    expect(zeilen[0].querySelector('.db-consistency-open').textContent).toBe('Anna (r-00001)');
    expect(zeilen[0].querySelector('.db-consistency-text').textContent).toBe(
      'Der Schlüssel «ANN» in «kuerzel» ist mehrfach vergeben, an die Datensätze r-00001 und r-00002.',
    );
    // Ohne Pfad kein Knopf.
    expect(zeilen[1].querySelector('.db-consistency-open')).toBeNull();
    expect(zeilen[1].querySelector('.db-consistency-text').textContent).toBe(
      'Der Wert «r-00009» im Feld «kunde» verweist auf keinen vorhandenen Datensatz der Tabelle «Kunden».',
    );
  });

  it('sagt «Keine Befunde» und kürzt eine lange Liste mit Hinweis', async () => {
    pruefung = { status: 'ready', dauerMs: 1, tabellen: [], befunde: [] };
    const container = await baue();
    await pruefeUeber(container, '.db-overview-check');
    expect(container.querySelector('.db-consistency-none').textContent).toBe('Keine Befunde.');

    pruefung = {
      status: 'ready',
      dauerMs: 1,
      tabellen: [],
      befunde: Array.from({ length: MAX_BEFUNDE + 3 }, () => befund({})),
    };
    await pruefeUeber(container, '.db-overview-check');
    expect(container.querySelectorAll('.db-consistency-finding')).toHaveLength(MAX_BEFUNDE);
    expect(container.querySelector('.db-consistency-limit').textContent).toBe(
      `Gezeigt werden die ersten ${MAX_BEFUNDE} von ${MAX_BEFUNDE + 3} Befunden.`,
    );
  });

  it('führt jeden Code des Befund-Katalogs in allen fünf Sprachfassungen', () => {
    const SPRACHEN = { de, en: enDict, fr: frDict, es: esDict, it: itDict };
    const codes = [...Object.values(KONSISTENZ_BEFUNDE), 'konsistenzVerweisTabelleFehlt'];
    const fehlend = [];
    for (const [sprache, dict] of Object.entries(SPRACHEN))
      for (const code of codes)
        if (!dict[`database.konsistenz.${code}`]) fehlend.push(`${sprache}: ${code}`);
    expect(fehlend).toEqual([]);
  });
});

// 4T-002081 (Epic 3E-000259, Story 4S-001040 AK3, AK4 und AK6): Der Abschnitt
// «Abfragen» — Name, Ort und «Öffnen» je Abfrage-Datei, ihre Befunde unter den
// Fehlerlagen benannt nach der Datei, und der Aus-Zustand, in dem Seite und
// Abschnitt entfallen. Die Erhebung steht in `db-katalog.test.js`.
const pfad = await import('node:path');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

describe('Übersichts-Seite der Datenbank: Abfragen (4T-002081)', () => {
  const WURZEL = '/bereich';
  const gelesen = [];
  window.api.relative = (von, nach) => pfad.posix.relative(von, nach);
  window.api.dirname = (p) => pfad.posix.dirname(p);
  window.api.reportMenuState = () => {};
  window.api.reportPanes = () => {};
  // Das Schließen eines Reiters gleicht die Werkzeugleiste ab (Muster
  // datenbank-uebersicht-beim-binden.test.js).
  if (!document.getElementById('btn-wrap'))
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
    );

  function mitAbfragen(abfragen) {
    return auskunft({ meta: { wurzel: WURZEL }, abfragen });
  }

  const EINE = {
    name: 'Bücher je Autor',
    path: `${WURZEL}/Abfragen/Bücher je Autor.md`,
    bloecke: 1,
    hints: [],
  };
  const OBEN = { name: 'Offen', path: `${WURZEL}/Offen.md`, bloecke: 1, hints: [] };
  const LEER = {
    name: 'Leer',
    path: `${WURZEL}/Leer.md`,
    bloecke: 0,
    hints: [{ code: 'queryOhneFence', index: -1, name: null, key: null, expected: null }],
  };
  const ZWEI = {
    name: 'Zwei',
    path: `${WURZEL}/Zwei.md`,
    bloecke: 2,
    hints: [{ code: 'queryMehrereFences', index: -1, name: '2', key: null, expected: null }],
  };

  function abschnittTitel(container) {
    return [...container.querySelectorAll('.db-overview-section-title')].map((e) => e.textContent);
  }

  it('nennt jede Abfrage-Datei mit Name und Ort, vor den Fehlerlagen (AK3)', async () => {
    antwort = mitAbfragen([EINE, OBEN]);
    const container = await baue();
    const titel = abschnittTitel(container);
    expect(titel).toContain('Abfragen');
    expect(titel.indexOf('Abfragen')).toBeLessThan(titel.indexOf('Fehlerlagen'));
    const namen = [...container.querySelectorAll('.db-overview-query-name')].map(
      (e) => e.textContent,
    );
    const orte = [...container.querySelectorAll('.db-overview-query-location')].map(
      (e) => e.textContent,
    );
    expect(namen).toEqual(['Bücher je Autor', 'Offen']);
    // Der Ordner relativ zur Wurzel; eine Datei in der Wurzel trägt deren Namen.
    expect(orte).toEqual(['Abfragen', 'Wurzel des Bereichs']);
    const knoepfe = [...container.querySelectorAll('.db-overview-query-open')];
    expect(knoepfe.map((k) => k.textContent)).toEqual(['Öffnen', 'Öffnen']);
    expect(container.textContent).toContain('Keine Fehlerlagen.');
  });

  it('öffnet die Datei über «Öffnen» wie jedes Dokument (AK3)', async () => {
    gelesen.length = 0;
    window.api.readFile = async (p) => {
      gelesen.push(p);
      return { ok: false, error: 'Prüffall' };
    };
    state.areaPath = WURZEL;
    antwort = mitAbfragen([EINE]);
    const container = await baue();
    container.querySelector('.db-overview-query-open').click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(gelesen).toEqual([EINE.path]);
  });

  it('meldet keinen und mehrere Abfrage-Blöcke im Klartext, benannt nach der Datei (AK4)', async () => {
    antwort = mitAbfragen([LEER, ZWEI]);
    const container = await baue();
    // Beide bleiben in der Liste: Eine Fehlerlage ist kein Ausschluss.
    const namen = [...container.querySelectorAll('.db-overview-query-name')].map(
      (e) => e.textContent,
    );
    expect(namen).toEqual(['Leer', 'Zwei']);
    const punkte = [...container.querySelectorAll('.db-overview-issue')].map((p) => [
      p.querySelector('.db-overview-issue-source').textContent,
      p.querySelector('.db-overview-issue-text').textContent,
    ]);
    expect(punkte).toEqual([
      [
        'Leer.md',
        'Die Abfrage-Datei enthält keinen Abfrage-Block; erwartet wird genau einer. Die Datei bleibt ein gewöhnliches Dokument.',
      ],
      [
        'Zwei.md',
        'Die Abfrage-Datei enthält 2 Abfrage-Blöcke; erwartet wird genau einer. Die Datei bleibt ein gewöhnliches Dokument, und jeder Block wird ausgewertet.',
      ],
    ]);
  });

  it('sagt es, wenn der Bereich keine Abfrage-Datei führt', async () => {
    antwort = mitAbfragen([]);
    const container = await baue();
    expect(container.textContent).toContain('Dieser Bereich führt keine Abfrage-Datei.');
    expect(container.querySelectorAll('.db-overview-queries')).toHaveLength(0);
  });

  it('entfällt samt Abschnitt im Aus-Zustand und kehrt nach dem Wiedereinschalten zurück (AK6, Z2)', async () => {
    state.areaPath = WURZEL;
    antwort = mitAbfragen([EINE]);
    const systemFlaeche = document.querySelector('.pane-group[data-pane="0"] .pane-system');
    try {
      await lebenszyklus.applyExtensionsState(['database'], { persist: false });
      seite.oeffneDatenbankUebersicht();
      expect(seite.datenbankUebersichtOffen()).toBe(false);
      expect(systemFlaeche.querySelector('.db-overview-query-name')).toBeNull();

      // Gegenprobe: eingeschaltet steht die Datei wieder im Abschnitt.
      await lebenszyklus.applyExtensionsState([], { persist: false });
      seite.oeffneDatenbankUebersicht();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(seite.datenbankUebersichtOffen()).toBe(true);
      await expect
        .poll(() => systemFlaeche.querySelector('.db-overview-query-name')?.textContent)
        .toBe('Bücher je Autor');
    } finally {
      for (let p = state.panes.length - 1; p >= 0; p--)
        for (let i = state.panes[p].tabs.length - 1; i >= 0; i--)
          await closeTab(p, i, { skipDirtyCheck: true });
      lebenszyklus.resetExtensionStateForTests();
    }
  });
});

// 4T-002248 (Epic 3E-000262, F1 A; AK2, AK3): Die Spalte «Art» im Abschnitt
// «Abfragen» kennzeichnet eine Listen-Maske mit ihren erlaubten Handgriffen;
// die Hinweise ihrer Angaben stehen unter den Fehlerlagen, benannt nach der
// Datei, und ein Befund der Konsistenz-Prüfung an ihr nennt die Datei als Quelle.
describe('Übersichts-Seite der Datenbank: Listen-Maske (4T-002248)', () => {
  const WURZEL = '/bereich';
  window.api.relative = (von, nach) => pfad.posix.relative(von, nach);
  window.api.dirname = (p) => pfad.posix.dirname(p);

  function eintrag(name, angaben, hints = []) {
    return {
      name,
      path: `${WURZEL}/${name}.md`,
      bloecke: 1,
      editable: false,
      form: null,
      allow: [],
      hints,
      ...angaben,
    };
  }

  function arten(container) {
    return [...container.querySelectorAll('.db-overview-query-kind')].map((e) => e.textContent);
  }

  it('nennt in der Spalte «Art» Listen-Maske mit Handgriffen und gewöhnliche Abfrage', async () => {
    antwort = auskunft({
      meta: { wurzel: WURZEL },
      abfragen: [
        eintrag('Ausleihen', { editable: true, allow: ['create', 'update', 'delete'] }),
        eintrag('Nur ändern', { editable: true, allow: ['update'] }),
        eintrag('Nur lesen', { editable: true, allow: [] }),
        eintrag('Lange Bücher', {}),
      ],
    });
    const container = await baue();
    const kopf = [...container.querySelectorAll('.db-overview-queries th')].map(
      (e) => e.textContent,
    );
    expect(kopf.slice(0, 3)).toEqual(['Abfrage', 'Art', 'Ort']);
    expect(arten(container)).toEqual([
      'Listen-Maske: anlegen, ändern, löschen',
      'Listen-Maske: ändern',
      'Listen-Maske, nur lesen',
      'Abfrage',
    ]);
  });

  it('nennt eine Abfrage-Datei aus einem älteren Stand ohne Angaben als Abfrage', async () => {
    antwort = auskunft({
      meta: { wurzel: WURZEL },
      abfragen: [{ name: 'Alt', path: `${WURZEL}/Alt.md`, bloecke: 1, hints: [] }],
    });
    const container = await baue();
    expect(arten(container)).toEqual(['Abfrage']);
  });

  it('meldet unbekannten Handgriff und unbekannte Maske im Klartext, benannt nach der Datei', async () => {
    antwort = auskunft({
      meta: { wurzel: WURZEL },
      abfragen: [
        eintrag('Ausleihen', { editable: true, allow: ['update'], form: 'Fehlt' }, [
          {
            code: 'listAllowUnbekannt',
            index: -1,
            name: 'archive',
            key: 'allow',
            expected: ['create', 'update', 'delete'],
          },
          { code: 'listFormDateiUnbekannt', index: -1, name: 'Fehlt', key: 'form', expected: null },
        ]),
      ],
    });
    const container = await baue();
    const punkte = [...container.querySelectorAll('.db-overview-issue')].map((p) => [
      p.querySelector('.db-overview-issue-source').textContent,
      p.querySelector('.db-overview-issue-text').textContent,
    ]);
    expect(punkte).toEqual([
      [
        'Ausleihen.md',
        'allow nennt den unbekannten Handgriff «archive»; vorgesehen sind create, update, delete. Der Eintrag entfällt, die übrigen gelten.',
      ],
      [
        'Ausleihen.md',
        'form nennt die Masken-Datei «Fehlt», die es in dieser Datenbank nicht gibt. Ein Klick auf eine Zeile öffnet die Standard-Maske der Tabelle.',
      ],
    ]);
  });

  it('nennt bei einem Befund der Konsistenz-Prüfung ohne Tabelle die Abfrage-Datei als Quelle', async () => {
    const leer = {
      tabelle: null,
      pfad: null,
      zeile: null,
      id: null,
      anzeige: null,
      feld: null,
      felder: null,
      zieltabelle: null,
      grund: null,
      kennungen: null,
      regel: null,
      meldung: null,
      anzahl: null,
    };
    window.api.databaseKonsistenz = async () => ({
      status: 'ready',
      dauerMs: 1,
      tabellen: [],
      befunde: [
        {
          ...leer,
          code: KONSISTENZ_BEFUNDE.listeHandgriffUnbekannt,
          datei: `${WURZEL}/Ausleihen.md`,
          wert: 'archive',
        },
        {
          ...leer,
          code: KONSISTENZ_BEFUNDE.listeMaskeUnbekannt,
          datei: `${WURZEL}/Ausleihen.md`,
          wert: 'Fehlt',
        },
      ],
    });
    antwort = auskunft({ meta: { wurzel: WURZEL }, abfragen: [] });
    const container = await baue();
    container.querySelector('.db-overview-check').click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const zeilen = [...container.querySelectorAll('.db-consistency-finding')].map((z) => [
      z.querySelector('.db-consistency-source').textContent,
      z.querySelector('.db-consistency-text').textContent,
    ]);
    expect(zeilen).toEqual([
      [
        'Ausleihen.md',
        'Die Abfrage-Datei nennt in allow den unbekannten Handgriff «archive»; er entfällt, die übrigen gelten.',
      ],
      [
        'Ausleihen.md',
        'Die Abfrage-Datei nennt mit form die Masken-Datei «Fehlt», die es in dieser Datenbank nicht gibt; ein Klick auf eine Zeile öffnet die Standard-Maske der Tabelle.',
      ],
    ]);
  });
});

// 4T-002308 (Epic 3E-000263, Story-AK1; AK3): Die eigene Rolle samt
// Anmeldenamen, wörtlich, unmittelbar vor den Rollen, in den drei Lagen
// Zuordnung, Vorgabe-Rolle und «alles erlaubt».
describe('Übersichts-Seite der Datenbank: eigene Rolle (4T-002308)', () => {
  async function eigeneRolleZeile(eigeneRolle) {
    helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
    antwort = auskunft({ eigeneRolle });
    const container = await baue();
    const zeile = [...container.querySelectorAll('.db-overview-row')].find(
      (z) => z.querySelector('.db-overview-row-label').textContent === 'Eigene Rolle',
    );
    return zeile ? zeile.querySelector('.db-overview-row-value').textContent : null;
  }

  it('zeigt die zugeordnete Rolle mit dem Anmeldenamen wörtlich (4T-002308)', async () => {
    const eigene = { rolle: 'librarian', anmeldename: 'MStumm$&', quelle: 'zuordnung' };
    expect(await eigeneRolleZeile(eigene)).toBe('librarian (Anmeldename MStumm$&)');
  });

  it('kennzeichnet die Vorgabe-Rolle (4T-002308)', async () => {
    const eigene = { rolle: 'assistant', anmeldename: 'gast', quelle: 'vorgabe' };
    expect(await eigeneRolleZeile(eigene)).toBe('assistant, Vorgabe-Rolle (Anmeldename gast)');
  });

  it('sagt ohne Zuordnung «alles erlaubt», ohne Auskunft keine Zeile (4T-002308)', async () => {
    const eigene = { rolle: null, anmeldename: 'gast', quelle: 'alles' };
    expect(await eigeneRolleZeile(eigene)).toBe(
      'alles erlaubt (keine Zuordnung), Anmeldename gast',
    );
    expect(await eigeneRolleZeile({ rolle: null, anmeldename: null, quelle: 'alles' })).toBe(
      'alles erlaubt (keine Zuordnung), Anmeldename —',
    );
    expect(await eigeneRolleZeile(undefined)).toBeNull();
  });
});

// 4T-002311 (Epic 3E-000263, E12.4): Je Tabelle die Erlaubnisse der eigenen
// Rolle, nur bei einer Datenbank mit Rollen; ohne `create` kein «Neuer
// Datensatz». Ohne Erlaubnis-Menge keine Zeile und der Knopf wie bisher.
describe('Übersichts-Seite der Datenbank: Erlaubnisse je Tabelle (4T-002311)', () => {
  const R = (create, update, del, define) => ({ create, update, delete: del, define });
  const ROLLEN = { assistant: { alle: false, operationen: {}, alleTabellen: null } };
  const tabelle = (name, rechte) => ({
    name,
    path: `/db/${name}.md`,
    felder: 1,
    hints: [],
    rechte,
  });
  async function zeilen(rollen, tabellen) {
    antwort = auskunft({ steckbrief: { name: 'Mini-CRM', rollen }, tabellen });
    const container = await baue();
    return [...container.querySelectorAll('.db-overview-table tbody tr')].map((tr) => [
      tr.querySelector('.db-overview-table-name').firstChild.textContent,
      (tr.querySelector('.db-overview-table-rights') || {}).textContent || null,
      !!tr.querySelector('.db-overview-new-record'),
    ]);
  }

  it('nennt je Tabelle die erlaubten Operationen und blendet ohne create die Neuanlage aus', async () => {
    const tabellen = [
      tabelle('Library', R(true, true, false, false)),
      tabelle('Loans', R(false, true, false, false)),
      tabelle('Staff', R(true, true, true, true)),
      tabelle('Archiv', R(false, false, false, false)),
      tabelle('Ohne', null),
    ];
    expect(await zeilen(ROLLEN, tabellen)).toEqual([
      ['Library', 'Erlaubnisse: anlegen, ändern', true],
      ['Loans', 'Erlaubnisse: ändern', false],
      ['Staff', 'Erlaubnisse: alles', true],
      ['Archiv', 'Erlaubnisse: keine Erlaubnis', false],
      ['Ohne', null, true],
    ]);
  });

  it('zeigt ohne Rollen keine Erlaubnis-Zeile (4T-002311)', async () => {
    const tabellen = [tabelle('Library', R(true, true, true, true))];
    expect(await zeilen({}, tabellen)).toEqual([['Library', null, true]]);
  });
});
