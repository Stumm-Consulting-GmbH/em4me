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

  it('sagt es, wenn die Datenbank noch keine Tabelle führt (AK2)', async () => {
    antwort = auskunft({ tabellen: [] });
    const container = await baue();
    expect(container.textContent).toContain('Diese Datenbank führt noch keine Tabelle.');
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
