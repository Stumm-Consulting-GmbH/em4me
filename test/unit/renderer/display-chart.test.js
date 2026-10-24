// @vitest-environment jsdom
// 4T-002173 (Epic 3E-000337): Diagramm-Form einer Tabellen-Abfrage
// (`DISPLAY bar`, `DISPLAY line`) im Anzeige-Prozess — Eignung, Bild,
// Hinweis-Zeilen, Rückfall mit Grund, Leer-Fall vor der Form, kein Klick-Ziel,
// und das Neu-Zeichnen bei Farbwechsel, Druck und PDF (Entscheidung S4).
//
// Die Brücke ist eine Attrappe: Gegenstand ist, was die Form der Brücke reicht
// und was sie aus ihrem Ergebnis macht, nicht das Zeichnen selbst
// (test/unit/preload-diagramme.test.js) und nicht die Datenregel
// (test/unit/ergebnis-diagramm.test.js). Dass die Grafik in der realen Anordnung
// erscheint, weisen die Ablauf-Fälle FQ-07 bis FQ-10 in
// test/e2e/funktionen/frontmatter-abfrage.spec.js nach.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

// Die zweite Funktion der Diagramm-Brücke und der Abfrage-Kanal als Attrappen.
const zeichnungen = [];
window.api.buildChartFromInput = (input, optionen) => {
  zeichnungen.push({ input, optionen });
  return {
    status: 'drawn',
    svg: `<svg data-farbe="${optionen.colors.palette[0]}"><desc>${input.type}</desc></svg>`,
    omitted: input.omitted,
    type: input.type,
  };
};
let antwortDesKanals = null;
window.api.runFrontmatterQuery = vi.fn(async () => antwortDesKanals);

const { buildQueryListDom, applyFrontmatterQueriesIfPresent, waitForFrontmatterQueriesIdle } =
  await import('../../../src/renderer/modules/query/frontmatter-query-view.js');
const { barForm, lineForm, skippedLine, omittedLine, QUERY_CHART_EXTENSION_ID } =
  await import('../../../src/renderer/modules/query/display-chart.js');
const { zeichneDiagrammeFuerAusgabe } =
  await import('../../../src/renderer/modules/charts/chart-view.js');
const { makeColumn, fileOrigin, makeRow, makeGroup, makeWishes, makeState, makeResultSet } =
  await import('../../../src/shared/query/result-set.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const sprache = (code) =>
  JSON.parse(readFileSync(path.join(dir, `../../../src/i18n/${code}.json`), 'utf8'));
const de = sprache('de');
const tStub = (key) => de[key] ?? key;

const spalte = (name) => makeColumn({ name, label: name, source: name });
const zeile = (name, ...werte) => makeRow(werte, fileOrigin(`/raum/${name}.md`, name));
// Gruppe mit den Werten über ihren Zeilen (4T-002078), wie die Auswertung sie liefert.
function gruppe(value, rows, values) {
  const g = makeGroup(value, rows);
  g.values = values;
  return g;
}

// Eine Tabellen-Menge im Zustand «ready» mit Wunsch `DISPLAY <form>`.
function menge({ form = 'bar', type = 'table', columns, rows, groups, wishes = {}, hint = null }) {
  return makeResultSet({
    scope: 'files',
    type,
    columns,
    rows,
    ...(groups ? { groups } : {}),
    wishes: makeWishes({ ...wishes, display: { form } }),
    state: makeState('ready', { hint, area: { root: '/raum', fileCount: 3 } }),
  });
}

const BUECHER = () => ({
  columns: [spalte('Seiten'), spalte('Preis')],
  rows: [zeile('Alpha', 120, 9.5), zeile('Beta', 300, 12)],
});

let kontext;
beforeEach(() => {
  zeichnungen.length = 0;
  kontext = {
    drawChart: vi.fn((input) => ({ status: 'drawn', svg: '<svg></svg>', omitted: input.omitted })),
    isExtensionActive: () => true,
  };
});
afterEach(() => {
  vi.restoreAllMocks();
});

function html(rs, k = kontext, translate = tStub) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet: rs }, translate, k));
  return host;
}
const hinweis = (host) => host.querySelector('.perspective-query-hint');
const bild = (host) => host.querySelector('.perspective-query-chart');

describe('Balken und Linie zeichnen (AK1)', () => {
  it('bar: Rubriken sind die Treffer-Namen, je Zahl-Spalte eine Reihe, statt der Tabelle', () => {
    const host = html(menge(BUECHER()));
    expect(kontext.drawChart).toHaveBeenCalledTimes(1);
    const input = kontext.drawChart.mock.calls[0][0];
    expect(input).toMatchObject({
      drawable: true,
      type: 'bar',
      categories: ['Alpha', 'Beta'],
      series: [
        { name: 'Seiten', values: [120, 300] },
        { name: 'Preis', values: [9.5, 12] },
      ],
      omitted: 0,
      skippedColumns: [],
    });
    expect(bild(host).dataset.queryChart).toBe('bar');
    expect(bild(host).querySelector('svg')).not.toBeNull();
    expect(host.querySelector('table, ul')).toBeNull();
    expect(hinweis(host)).toBeNull();
    // Ohne übergangene Spalte und ohne Lücke keine Zeile unter dem Bild.
    expect(bild(host).querySelectorAll('.perspective-chart-omitted')).toHaveLength(0);
  });

  it('line: dieselbe Regel mit der Art Linie, in jeder Schreibung der Angabe', () => {
    const host = html(menge({ ...BUECHER(), form: 'LINE' }));
    expect(kontext.drawChart.mock.calls[0][0].type).toBe('line');
    expect(bild(host).dataset.queryChart).toBe('line');
  });

  it('kein Klick-Ziel: weder Treffer-Link noch Pfad-Angabe im Bild (F3)', () => {
    const host = html(menge(BUECHER()));
    expect(host.querySelector('a, [data-fm-path], [data-record-id]')).toBeNull();
  });

  it('ein Hinweis des Zustands steht über dem Bild', () => {
    const host = html(menge({ ...BUECHER(), hint: 'columnsIgnored' }));
    expect(host.firstElementChild).toBe(hinweis(host));
    expect(hinweis(host).textContent).toBe(de['query.hint.columnsIgnored']);
    expect(host.lastElementChild).toBe(bild(host));
  });
});

describe('Gruppierte Tabelle: je Gruppe eine Rubrik (AK2)', () => {
  it('Beschriftung ist der Gruppen-Wert, die Gruppe ohne Wert trägt den Text der Tabelle', () => {
    const rows = [zeile('Alpha', 120), zeile('Beta', 300), zeile('Gamma', 80)];
    const groups = [gruppe('Ada', [0, 1], [420]), gruppe(null, [2], [80])];
    html(menge({ columns: [spalte('Seiten')], rows, groups }));
    const input = kontext.drawChart.mock.calls[0][0];
    expect(input.categories).toEqual(['Ada', de['query.group.none']]);
    expect(input.series).toEqual([{ name: 'Seiten', values: [420, 80] }]);
  });
});

describe('Hinweis-Zeilen unter dem Bild (AK3, S5)', () => {
  it('übergangene Spalte und ausgelassene Werte, je eine Zeile in dieser Reihenfolge', () => {
    const rows = [zeile('Alpha', 120, 'x'), zeile('Beta', 'viele', 'y'), zeile('Gamma', null, 'z')];
    const host = html(menge({ columns: [spalte('Seiten'), spalte('Notiz')], rows }));
    const zeilen = [...bild(host).querySelectorAll('.perspective-chart-omitted')];
    expect(zeilen.map((z) => z.textContent)).toEqual([
      de['query.chart.skipped.one'].replace('{columns}', "'Notiz'"),
      de['query.chart.omitted.other'].replace('{n}', '2'),
    ]);
    // Unter der Grafik: das Bild steht zuerst.
    expect(bild(host).firstElementChild.tagName.toLowerCase()).toBe('svg');
    expect(bild(host).dataset.chartOmitted).toBe('2');
  });

  it('Einzahl und Mehrzahl; ohne Anlass keine Zeile', () => {
    expect(skippedLine([], tStub)).toBeNull();
    expect(omittedLine(0, tStub)).toBeNull();
    expect(omittedLine(1, tStub).textContent).toBe(de['query.chart.omitted.one']);
    expect(skippedLine(['A', 'B'], tStub).textContent).toBe(
      de['query.chart.skipped.other'].replace('{columns}', "'A', 'B'"),
    );
  });

  it('ein Spalten-Name mit Platzhalter-Zeichen wird nicht ausgewertet und nie als HTML gesetzt', () => {
    const z = skippedLine(['<b>{n}</b> $&'], tStub);
    expect(z.textContent).toContain("'<b>{n}</b> $&'");
    expect(z.querySelector('b')).toBeNull();
  });

  it('alle fünf Sprachen tragen beide Zeilen ohne offenen Platzhalter', () => {
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = sprache(code);
      const tr = (key) => texte[key] ?? key;
      for (const z of [skippedLine(['A'], tr), skippedLine(['A', 'B'], tr), omittedLine(1, tr)]) {
        expect(z.textContent, code).not.toMatch(/\{\w+\}|query\./);
      }
      expect(omittedLine(3, tr).textContent, code).toContain('3');
    }
  });
});

describe('Rückfall mit Grund und Leer-Fall (AK4)', () => {
  it('Liste, eine Spalte und keine Zahl: die gewohnte Ausgabe mit dem Hinweis des Grundes', () => {
    const faelle = [
      [
        { type: 'list', columns: [spalte('Seiten')], rows: [zeile('Alpha', 1)] },
        'query.hint.displayFormChartNotTable',
        'ul.perspective-query-list',
      ],
      [
        {
          columns: [spalte('Titel')],
          rows: [zeile('Alpha', 'A')],
          wishes: { withoutId: true },
        },
        'query.hint.displayFormChartSingleColumn',
        'table.perspective-query-table',
      ],
      [
        { columns: [spalte('Titel')], rows: [zeile('Alpha', 'A')] },
        'query.hint.displayFormChartNoNumbers',
        'table.perspective-query-table',
      ],
    ];
    for (const [bau, key, ausgabe] of faelle) {
      const host = html(menge(bau));
      expect(hinweis(host).textContent, key).toBe(de[key].replace('{name}', 'bar'));
      expect(host.querySelector(ausgabe), key).not.toBeNull();
      expect(bild(host), key).toBeNull();
    }
    expect(kontext.drawChart).not.toHaveBeenCalled();
  });

  it('ein leeres Ergebnis zeigt den Leer-Text vor jeder Form, ohne Zeichnung', () => {
    const host = html(menge({ columns: [spalte('Seiten')], rows: [] }));
    expect(host.textContent).toBe(de['query.empty']);
    expect(kontext.drawChart).not.toHaveBeenCalled();
  });

  it('zeichnet die Brücke nicht oder fehlt sie, fällt die Form mit Warnung zurück', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const k of [
      { ...kontext, drawChart: () => ({ status: 'undrawable', reason: 'x' }) },
      { ...kontext, drawChart: () => null },
    ]) {
      const host = html(menge(BUECHER()), k);
      expect(hinweis(host).textContent).toBe(
        de['query.hint.displayFormUnsuitable'].replace('{name}', 'bar'),
      );
      expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(2);
    // Die Form selbst verlangt die Zeichen-Funktion im Kontext.
    expect(() => barForm.render(menge(BUECHER()), { translate: tStub })).toThrow(TypeError);
    // Ohne eigene Zeichen-Funktion gilt in der Befüllung die der Brücke.
    const host = html(menge(BUECHER()), { isExtensionActive: () => true });
    expect(bild(host)).not.toBeNull();
    expect(zeichnungen).toHaveLength(1);
  });

  it('Eignung und Bild nutzen dieselbe Regel', () => {
    for (const form of [barForm, lineForm]) {
      expect(form.extension).toBe(QUERY_CHART_EXTENSION_ID);
      expect(form.isSuitable(menge(BUECHER()))).toBe(true);
      const liste = menge({ ...BUECHER(), type: 'list' });
      expect(form.isSuitable(liste)).toBe(false);
      expect(form.unsuitableReason(liste)).toBe('not-table');
      expect(form.unsuitableReason(menge(BUECHER()))).toBeNull();
    }
  });
});

// --- Befüllung, Farbwechsel, Druck und PDF (S4) -----------------------------

function platzhalter(abfrage) {
  const wurzel = document.createElement('div');
  wurzel.className = 'markdown-body';
  const el = document.createElement('div');
  el.className = 'perspective-query';
  el.dataset.fmQuery = abfrage;
  wurzel.appendChild(el);
  document.body.appendChild(wurzel);
  return { wurzel, el };
}

async function befuelle(rs) {
  antwortDesKanals = { resultSet: rs };
  const p = platzhalter('TABLE Seiten DISPLAY bar');
  applyFrontmatterQueriesIfPresent(p.wurzel, '/raum');
  await waitForFrontmatterQueriesIdle();
  return p;
}

const warte = () => new Promise((r) => setTimeout(r, 120));

describe('Befüllung über die Brücke und Neu-Zeichnen (S2, S4)', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('.markdown-body').forEach((el) => el.remove());
  });

  it('die Befüllung zeichnet über die Brücke mit den Farben der Ansicht', async () => {
    document.documentElement.style.setProperty('--chart-1', '#010203');
    const { el } = await befuelle(menge(BUECHER()));
    expect(zeichnungen).toHaveLength(1);
    expect(zeichnungen[0].optionen.colors.palette[0]).toBe('#010203');
    expect(zeichnungen[0].optionen.idPrefix).toMatch(/^qc-\d+$/);
    expect(typeof zeichnungen[0].optionen.descriptionTexts).toBe('object');
    expect(el.querySelector('.perspective-query-chart svg').dataset.farbe).toBe('#010203');
  });

  it('ein Wechsel des Farbschemas zeichnet aus derselben Antwort neu, ohne neue Abfrage', async () => {
    const { el } = await befuelle(menge(BUECHER()));
    const abfragen = window.api.runFrontmatterQuery.mock.calls.length;
    document.documentElement.style.setProperty('--chart-1', '#aa0000');
    await warte();
    expect(window.api.runFrontmatterQuery.mock.calls.length).toBe(abfragen);
    expect(el.querySelector('.perspective-query-chart svg').dataset.farbe).toBe('#aa0000');
  });

  it('Druck und PDF zeichnen sofort mit den gesetzten hellen Farben, auch im Live-Widget', async () => {
    const { wurzel, el } = await befuelle(menge(BUECHER()));
    // Ein Abfrage-Diagramm in einem Live-Widget wird an Ort und Stelle neu
    // gezeichnet, wie jede Befüllung einer Abfrage dort.
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    wurzel.appendChild(editor);
    const live = await befuelle(menge(BUECHER()));
    editor.appendChild(live.wurzel);
    const vorher = zeichnungen.length;
    document.documentElement.style.setProperty('--chart-1', '#fefefe');
    await zeichneDiagrammeFuerAusgabe(wurzel);
    expect(zeichnungen.length).toBe(vorher + 2);
    expect(el.querySelector('svg').dataset.farbe).toBe('#fefefe');
    expect(live.el.querySelector('svg').dataset.farbe).toBe('#fefefe');
    // Das entprellte Neu-Zeichnen des Beobachters ist verworfen.
    await warte();
    expect(zeichnungen.length).toBe(vorher + 2);
  });

  it('ein Container ohne Diagramm wird nicht neu gezeichnet', async () => {
    await befuelle(menge({ ...BUECHER(), type: 'list' }));
    const vorher = window.api.runFrontmatterQuery.mock.calls.length;
    await zeichneDiagrammeFuerAusgabe(document);
    expect(zeichnungen).toHaveLength(0);
    expect(window.api.runFrontmatterQuery.mock.calls.length).toBe(vorher);
  });
});
