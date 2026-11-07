// @vitest-environment jsdom
// 4T-002514 (Epic 3E-000402, Story 4S-001184): Darstellungsform Kreis einer
// Tabellen-Abfrage (`DISPLAY pie`). Geprüft werden die Datenregel des Kreises
// (src/shared/query/result-chart.js), die Form im Verzeichnis und ihr Bild
// (src/renderer/modules/query/display-forms.js, display-chart.js), der Rückfall
// mit Hinweis, der Schalter `query-chart`, die Tabelle des Gesamt-Werts ohne
// Treffer (Übergabe aus 4T-002511, V9), das Neu-Zeichnen für Druck und PDF und
// ein Kreis aus dem echten Zeichner über die Brücke.
//
// Vorbilder: test/unit/ergebnis-diagramm.test.js (Datenregel) und
// test/unit/renderer/display-chart.test.js (Form, Zeilen, Befüllung). Die
// Ergebnismengen sind von Hand gebaut, in der Gestalt, die die Auswertung
// liefert (Gesamt-Wert: test/unit/perspective-query-aggregate.test.js).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './renderer/api-stub.js';

// Die zweite Funktion der Diagramm-Brücke und der Abfrage-Kanal als Attrappen
// für die Befüllung; der Prüffall des echten Zeichners ruft die Brücke direkt.
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

const {
  QUERY_CHART_TYPES,
  QUERY_CHART_REASONS,
  QUERY_PIE_REASONS,
  queryChartSuitability,
  buildQueryChartInput,
} = await import('../../src/shared/query/result-chart.js');
const { buildQueryListDom, applyFrontmatterQueriesIfPresent, waitForFrontmatterQueriesIdle } =
  await import('../../src/renderer/modules/query/frontmatter-query-view.js');
const { drawDisplayForm, registerDisplayForm } =
  await import('../../src/renderer/modules/query/display-forms.js');
const { pieForm, barForm, pieSkippedLine, QUERY_CHART_EXTENSION_ID } =
  await import('../../src/renderer/modules/query/display-chart.js');
const { zeichneDiagrammeFuerAusgabe } =
  await import('../../src/renderer/modules/charts/chart-view.js');
const { applyExtensionsState, resetExtensionStateForTests } =
  await import('../../src/renderer/modules/extensions/extension-lifecycle.js');
const { buildChartFromInput } = await import('../../src/main/preload-diagramme.js');
const { makeColumn, fileOrigin, makeRow, makeGroup, makeWishes, makeState, makeResultSet } =
  await import('../../src/shared/query/result-set.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const sprache = (code) =>
  JSON.parse(readFileSync(path.join(dir, `../../src/i18n/${code}.json`), 'utf8'));
const de = sprache('de');
const tStub = (key) => de[key] ?? key;
const OHNE = de['query.group.none'];

const spalte = (name) => makeColumn({ name, label: name, source: name });
const zeile = (name, ...werte) => makeRow(werte, fileOrigin(`/raum/${name}.md`, name));
// Gruppe mit den Werten über ihren Zeilen (4T-002078), wie die Auswertung sie liefert.
function gruppe(value, rows, values) {
  const g = makeGroup(value, rows);
  g.values = values;
  return g;
}

// Eine Tabellen-Menge im Zustand «ready» mit Wunsch `DISPLAY <form>`.
function menge({ form = 'pie', type = 'table', columns, rows, groups, wishes = {} }) {
  return makeResultSet({
    scope: 'files',
    type,
    columns,
    rows,
    ...(groups ? { groups } : {}),
    wishes: makeWishes({ ...wishes, ...(form ? { display: { form } } : {}) }),
    state: makeState('ready', { area: { root: '/raum', fileCount: 6 } }),
  });
}

// Sechs Aufgaben, gruppiert nach `status`: `TABLE count() GROUP BY status`.
const STATUS = () => ({
  columns: [spalte('count()')],
  rows: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => zeile(n, null)),
  groups: [gruppe('offen', [0, 1, 2], [3]), gruppe('zu', [3, 4], [2]), gruppe(null, [5], [1])],
});

// Dieselbe Gruppierung mit Text-Spalte und zwei Zahlen-Spalten:
// `TABLE first(notiz) AS Notiz, count(), sum(aufwand) GROUP BY status`.
const MEHRSPALTIG = () => ({
  columns: [spalte('Notiz'), spalte('count()'), spalte('sum(aufwand)')],
  rows: ['A', 'B', 'C'].map((n) => zeile(n, null, null, null)),
  groups: [gruppe('offen', [0, 1], ['x', 2, 5]), gruppe('zu', [2], ['y', 1, 8])],
});

// Die Tabelle des Gesamt-Werts (4T-002511, V9): keine Zeile ohne Treffer, eine
// Gruppe ohne Gruppen-Wert; `count()` ist 0, die übrigen Aggregate fehlen.
function gesamt(labels, values, rows = []) {
  return {
    columns: labels.map(spalte),
    rows,
    groups: [
      gruppe(
        null,
        rows.map((_, i) => i),
        values,
      ),
    ],
    wishes: { withoutId: true },
  };
}

const OPT = { type: 'pie', noneLabel: OHNE };

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
  resetExtensionStateForTests();
});

function html(rs, k = kontext, translate = tStub) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet: rs }, translate, k));
  return host;
}
const hinweis = (host) => host.querySelector('.perspective-query-hint');
const bild = (host) => host.querySelector('.perspective-query-chart');
const zeilenUnterDemBild = (host) =>
  [...bild(host).querySelectorAll('.perspective-chart-omitted')].map((z) => z.textContent);

// --- Datenregel (result-chart.js) --------------------------------------------

describe('Datenregel des Kreises: Anteile je Gruppe (AK1)', () => {
  it('gruppierte Tabelle mit count(): je Gruppe ein Anteil, beschriftet mit der Gruppe', () => {
    expect(buildQueryChartInput(menge(STATUS()), OPT)).toEqual({
      drawable: true,
      type: 'pie',
      title: null,
      categories: ['offen', 'zu', OHNE],
      series: [{ name: 'count()', values: [3, 2, 1] }],
      omitted: 0,
      skippedColumns: [],
      pieSkippedColumns: [],
    });
    expect(queryChartSuitability(menge(STATUS()), 'pie')).toEqual({ suitable: true, reason: null });
  });

  it('der Kreis ist eine eingetragene Art; der Donut bleibt draußen', () => {
    expect([...QUERY_CHART_TYPES]).toEqual(['bar', 'line', 'pie']);
    expect(() => buildQueryChartInput(menge(STATUS()), { ...OPT, type: 'donut' })).toThrow(
      TypeError,
    );
  });
});

describe('Datenregel des Kreises: nur die erste Zahlen-Spalte (AK2)', () => {
  it('weitere Zahlen-Spalten werden übergangen und genannt, getrennt von Spalten ohne Zahl', () => {
    const erg = buildQueryChartInput(menge(MEHRSPALTIG()), OPT);
    expect(erg.series).toEqual([{ name: 'count()', values: [2, 1] }]);
    expect(erg.pieSkippedColumns).toEqual(['sum(aufwand)']);
    expect(erg.skippedColumns).toEqual(['Notiz']);
    expect(erg.categories).toEqual(['offen', 'zu']);
  });

  it('Balken und Linie behalten alle Reihen und tragen das Feld des Kreises nicht', () => {
    for (const type of ['bar', 'line']) {
      const erg = buildQueryChartInput(menge(MEHRSPALTIG()), { ...OPT, type });
      expect(
        erg.series.map((s) => s.name),
        type,
      ).toEqual(['count()', 'sum(aufwand)']);
      expect(Object.hasOwn(erg, 'pieSkippedColumns'), type).toBe(false);
    }
  });

  it('Lücken der ersten Zahlen-Spalte zählen; Lücken der übergangenen nicht', () => {
    const rs = menge({
      columns: [spalte('a'), spalte('b')],
      rows: [zeile('A', 4, null), zeile('B', null, null), zeile('C', 2, 'x')],
    });
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.series).toEqual([{ name: 'a', values: [4, null, 2] }]);
    expect(erg.omitted).toBe(1);
    expect(erg.skippedColumns).toEqual(['b']);
    expect(erg.pieSkippedColumns).toEqual([]);
  });
});

describe('Datenregel des Kreises: eine Gruppe ist ein voller Kreis (AK3)', () => {
  it('eine einzige Gruppe ergibt einen Anteil', () => {
    const rs = menge({ ...STATUS(), groups: [gruppe('offen', [0, 1, 2, 3, 4, 5], [6])] });
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.categories).toEqual(['offen']);
    expect(erg.series).toEqual([{ name: 'count()', values: [6] }]);
  });

  it('der echte Zeichner zeichnet daraus über die Brücke genau ein Stück, das sich schließt', () => {
    const rs = menge({ ...STATUS(), groups: [gruppe('offen', [0, 1, 2, 3, 4, 5], [6])] });
    const erg = buildChartFromInput(buildQueryChartInput(rs, OPT), { idPrefix: 'qc-k1' });
    expect(erg).toMatchObject({ status: 'drawn', type: 'pie', seriesCount: 1, categoryCount: 1 });
    const pfade = [...erg.svg.matchAll(/<path d="([^"]+)"[^>]*fill="#[0-9a-f]{6}"/gi)].map(
      (m) => m[1],
    );
    expect(pfade).toHaveLength(1);
    // Anfangs- und Endpunkt des Stücks fallen zusammen: ein voller Kreis.
    const start = pfade[0].match(/^M([\d.]+) ([\d.]+)/);
    const ende = pfade[0].match(/([\d.]+) ([\d.]+)Z$/);
    expect([ende[1], ende[2]]).toEqual([start[1], start[2]]);
    expect(erg.svg).toContain('>offen<');
  });

  it('der Gesamt-Wert mit Treffern ist eine Gruppe und damit ein voller Kreis', () => {
    // `TABLE WITHOUT ID count(), sum(aufwand)` über vier Treffer; die erste
    // genannte Spalte ist mit WITHOUT ID die Beschriftung, wie beim Balken.
    const rows = ['A', 'B', 'C', 'D'].map((n) => zeile(n, null, null));
    const erg = buildQueryChartInput(
      menge(gesamt(['count()', 'sum(aufwand)'], [4, 17], rows)),
      OPT,
    );
    expect(erg.categories).toEqual(['4']);
    expect(erg.series).toEqual([{ name: 'sum(aufwand)', values: [17] }]);
  });
});

describe('Eignung: Grund-Codes wie beim Balken, dazu die beiden des Kreises (AK4)', () => {
  const faelle = [
    [
      'ungruppierte Liste',
      { type: 'list', columns: [spalte('Seiten')], rows: [zeile('A', 1)] },
      'not-table',
    ],
    ['leere Tabelle', { columns: [spalte('Seiten')], rows: [] }, 'empty'],
    [
      'mit WITHOUT ID nur die Beschriftung',
      { columns: [spalte('Titel')], rows: [zeile('A', 'x')], wishes: { withoutId: true } },
      'single-column',
    ],
    [
      'ungruppierte Tabelle ohne Zahl',
      { columns: [spalte('Titel')], rows: [zeile('A', 'x')] },
      'no-numbers',
    ],
  ];
  for (const [name, bau, grund] of faelle) {
    it(`${name}: ${grund}, wie beim Balken; Eignung und Bild sagen dasselbe`, () => {
      const rs = menge(bau);
      expect(queryChartSuitability(rs, 'pie')).toEqual({ suitable: false, reason: grund });
      expect(queryChartSuitability(rs, 'bar')).toEqual({ suitable: false, reason: grund });
      expect(buildQueryChartInput(rs, OPT)).toEqual({ drawable: false, reason: grund });
    });
  }

  it('negativer Anteil und lauter Nullen tragen keinen Kreis; der Balken zeichnet sie', () => {
    const rs = (werte) =>
      menge({ columns: [spalte('a')], rows: werte.map((w, i) => zeile(`D${i}`, w)) });
    for (const [werte, grund] of [
      [[3, -1], 'negative'],
      [[0, 0], 'zeros'],
      [[0, null], 'zeros'],
    ]) {
      expect(queryChartSuitability(rs(werte), 'pie'), grund).toEqual({
        suitable: false,
        reason: grund,
      });
      expect(buildQueryChartInput(rs(werte), OPT), grund).toEqual({
        drawable: false,
        reason: grund,
      });
      expect(queryChartSuitability(rs(werte)).suitable, grund).toBe(true);
    }
    // Eine Null neben einem positiven Anteil ist ein Anteil ohne Fläche, kein Grund.
    expect(queryChartSuitability(rs([0, 5]), 'pie').suitable).toBe(true);
    // Geprüft wird allein die erste Zahlen-Spalte.
    const zweite = menge({ columns: [spalte('a'), spalte('b')], rows: [zeile('A', 2, -4)] });
    expect(queryChartSuitability(zweite, 'pie').suitable).toBe(true);
    expect([...QUERY_PIE_REASONS]).toEqual(['negative', 'zeros']);
    expect(QUERY_CHART_REASONS.some((r) => QUERY_PIE_REASONS.includes(r))).toBe(false);
  });
});

// --- Form im Verzeichnis und Bild (display-forms.js, display-chart.js) --------

describe('Form pie in der Darstellungs-Wahl', () => {
  it('pie ist eingetragen, in jeder Schreibung, und hängt am Schalter query-chart', () => {
    const probe = { isSuitable: () => true, render: () => document.createElement('div') };
    expect(() => registerDisplayForm('pie', probe)).toThrow(/schon eingetragen/);
    expect(pieForm.extension).toBe(QUERY_CHART_EXTENSION_ID);
    const erg = drawDisplayForm(menge({ ...STATUS(), form: 'PIE' }), {
      ...kontext,
      translate: tStub,
    });
    expect(erg.node).not.toBeNull();
    expect(erg.name).toBe('PIE');
  });

  it('zeichnet über die Zeichen-Funktion des Kontexts ein Bild statt der Tabelle (AK1)', () => {
    const host = html(menge(STATUS()));
    expect(kontext.drawChart).toHaveBeenCalledTimes(1);
    expect(kontext.drawChart.mock.calls[0][0]).toMatchObject({
      type: 'pie',
      categories: ['offen', 'zu', OHNE],
      series: [{ name: 'count()', values: [3, 2, 1] }],
    });
    expect(bild(host).dataset.queryChart).toBe('pie');
    expect(host.querySelector('table, ul')).toBeNull();
    expect(hinweis(host)).toBeNull();
    expect(bild(host).querySelectorAll('.perspective-chart-omitted')).toHaveLength(0);
    // Ein Bild ohne Bedienung, wie Balken und Linie.
    expect(host.querySelector('a, [data-fm-path], [data-record-id]')).toBeNull();
  });

  it('unter dem Bild: Spalte ohne Zahl, übergangene Zahlen-Spalte, Lücken (AK2)', () => {
    const bau = MEHRSPALTIG();
    bau.groups.push(gruppe('neu', [], ['z', null, 3]));
    const host = html(menge(bau));
    expect(zeilenUnterDemBild(host)).toEqual([
      de['query.chart.skipped.one'].replace('{columns}', "'Notiz'"),
      de['query.chart.pieSeriesSkipped'].replace('{columns}', "'sum(aufwand)'"),
      de['query.chart.omitted.one'],
    ]);
    expect(bild(host).firstElementChild.tagName.toLowerCase()).toBe('svg');
  });

  it('die Zeile der übergangenen Zahlen-Spalten: mehrere, keine, Sonderzeichen als Text', () => {
    expect(pieSkippedLine([], tStub)).toBeNull();
    expect(pieSkippedLine(undefined, tStub)).toBeNull();
    expect(pieSkippedLine(['B', 'C'], tStub).textContent).toBe(
      de['query.chart.pieSeriesSkipped'].replace('{columns}', "'B', 'C'"),
    );
    const z = pieSkippedLine(['<b>{n}</b> $&'], tStub);
    expect(z.textContent).toContain("'<b>{n}</b> $&'");
    expect(z.querySelector('b')).toBeNull();
    expect(z.classList.contains('perspective-query-chart-pie-skipped')).toBe(true);
  });

  it('alle fünf Sprachen tragen die Zeile ohne offenen Platzhalter', () => {
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = sprache(code);
      const text = pieSkippedLine(['B'], (key) => texte[key] ?? key).textContent;
      expect(text, code).toContain("'B'");
      expect(text, code).not.toMatch(/\{\w+\}|query\./);
    }
  });
});

describe('Rückfall auf die Tabelle mit Hinweis (AK4)', () => {
  it('Liste und Tabelle ohne Zahl: die gewohnte Ausgabe mit dem Hinweis des Grundes', () => {
    const faelle = [
      [
        { type: 'list', columns: [spalte('Seiten')], rows: [zeile('Alpha', 1)] },
        'query.hint.displayFormChartNotTable',
        'ul.perspective-query-list',
      ],
      [
        { columns: [spalte('Titel')], rows: [zeile('Alpha', 'A')] },
        'query.hint.displayFormChartNoNumbers',
        'table.perspective-query-table',
      ],
    ];
    for (const [bau, key, ausgabe] of faelle) {
      const host = html(menge(bau));
      expect(hinweis(host).textContent, key).toBe(de[key].replace('{name}', 'pie'));
      expect(host.querySelector(ausgabe), key).not.toBeNull();
      expect(bild(host), key).toBeNull();
    }
    expect(kontext.drawChart).not.toHaveBeenCalled();
  });

  it('ein negativer Anteil zeigt den eigenen Hinweis des Kreises und die Tabelle (seit D7 mit eigenem Schlüssel)', () => {
    const host = html(menge({ columns: [spalte('a')], rows: [zeile('A', 3), zeile('B', -2)] }));
    expect(hinweis(host).textContent).toBe(
      de['query.hint.displayFormChartNegative'].replace('{name}', 'pie'),
    );
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
    expect(
      pieForm.unsuitableReason(menge({ columns: [spalte('a')], rows: [zeile('A', -1)] })),
    ).toBe('negative');
    expect(
      barForm.unsuitableReason(menge({ columns: [spalte('a')], rows: [zeile('A', -1)] })),
    ).toBe(null);
    expect(kontext.drawChart).not.toHaveBeenCalled();
  });
});

describe('Schalter query-chart aus (AK5)', () => {
  it('über den Kontext: Hinweis displayFormOff und die Tabelle, keine Zeichnung', () => {
    const host = html(menge(STATUS()), { ...kontext, isExtensionActive: () => false });
    expect(bild(host)).toBeNull();
    expect(hinweis(host).textContent).toBe(
      de['query.hint.displayFormOff'].replace('{name}', 'pie'),
    );
    expect(host.querySelector('table')).not.toBeNull();
    expect(kontext.drawChart).not.toHaveBeenCalled();
  });

  it('über den Schalt-Zustand des Fensters: aus die Tabelle, wieder an der Kreis', async () => {
    const ohneSchalter = { drawChart: kontext.drawChart };
    await applyExtensionsState([QUERY_CHART_EXTENSION_ID], { persist: false });
    const aus = html(menge(STATUS()), ohneSchalter);
    expect(bild(aus)).toBeNull();
    expect(hinweis(aus).textContent).toBe(de['query.hint.displayFormOff'].replace('{name}', 'pie'));
    // Die Ausgabe darunter ist genau die ohne Angabe.
    hinweis(aus).remove();
    expect(aus.innerHTML).toBe(html(menge({ ...STATUS(), form: null }), ohneSchalter).innerHTML);
    await applyExtensionsState([], { persist: false });
    expect(bild(html(menge(STATUS()), ohneSchalter))).not.toBeNull();
  });
});

// --- Übergabe aus 4T-002511: Gesamt-Wert ohne Treffer --------------------------

describe('Tabelle des Gesamt-Werts ohne Treffer (Übergabe aus 4T-002511, V9)', () => {
  const faelle = [
    // `TABLE WITHOUT ID count(), count(tags)`: lauter Nullen.
    ['count(), count(tags)', gesamt(['count()', 'count(tags)'], [0, 0]), 'zeros'],
    // `TABLE WITHOUT ID count(), sum(aufwand), average(aufwand)`: keine Zahl.
    [
      'count(), sum, average',
      gesamt(['count()', 'sum(aufwand)', 'average(aufwand)'], [0, null, null]),
      'no-numbers',
    ],
    // `TABLE WITHOUT ID count()`: nur die Beschriftung.
    ['count() allein', gesamt(['count()'], [0]), 'single-column'],
  ];

  for (const [name, bau, grund] of faelle) {
    it(`${name}: kein Bild, kein Abbruch, die Tabelle mit ihrer einen Zeile (${grund})`, () => {
      const warn = vi.spyOn(console, 'warn');
      const rs = menge(bau);
      expect(rs.rows).toEqual([]);
      expect(queryChartSuitability(rs, 'pie')).toEqual({ suitable: false, reason: grund });
      const erg = drawDisplayForm(rs, { ...kontext, translate: tStub });
      expect(erg).toMatchObject({ node: null, hint: 'displayFormUnsuitable', reason: grund });
      const host = html(rs);
      expect(bild(host)).toBeNull();
      expect(hinweis(host)).not.toBeNull();
      expect(host.querySelectorAll('table tbody tr')).toHaveLength(1);
      expect(kontext.drawChart).not.toHaveBeenCalled();
      // Der Rückfall kommt aus der Regel, nicht aus einem gefangenen Fehler.
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it('jede eingetragene Form verträgt die Menge: Bild oder Rückfall, nie ein Wurf', () => {
    const bau = gesamt(['count()', 'count(tags)'], [0, 0]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const form of ['pie', 'bar', 'line', 'tree']) {
      expect(() => html(menge({ ...bau, form })), form).not.toThrow();
    }
  });
});

// --- Befüllung, Druck und PDF -------------------------------------------------

describe('Befüllung über die Brücke; Druck und PDF zeichnen den Kreis neu', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.querySelectorAll('.markdown-body').forEach((el) => el.remove());
  });

  async function befuelle(rs) {
    antwortDesKanals = { resultSet: rs };
    const wurzel = document.createElement('div');
    wurzel.className = 'markdown-body';
    const el = document.createElement('div');
    el.className = 'perspective-query';
    el.dataset.fmQuery = 'TABLE count() GROUP BY status DISPLAY pie';
    wurzel.appendChild(el);
    document.body.appendChild(wurzel);
    applyFrontmatterQueriesIfPresent(wurzel, '/raum');
    await waitForFrontmatterQueriesIdle();
    return { wurzel, el };
  }

  it('die Befüllung zeichnet den Kreis über die Brücke; Druck zeichnet ihn mit den gesetzten Farben neu', async () => {
    document.documentElement.style.setProperty('--chart-1', '#010203');
    const { wurzel, el } = await befuelle(menge(STATUS()));
    expect(zeichnungen).toHaveLength(1);
    expect(zeichnungen[0].input.type).toBe('pie');
    expect(el.querySelector('.perspective-query-chart svg').dataset.farbe).toBe('#010203');
    const abfragen = window.api.runFrontmatterQuery.mock.calls.length;
    document.documentElement.style.setProperty('--chart-1', '#fefefe');
    await zeichneDiagrammeFuerAusgabe(wurzel);
    expect(zeichnungen).toHaveLength(2);
    expect(zeichnungen[1].input.type).toBe('pie');
    expect(el.querySelector('.perspective-query-chart svg').dataset.farbe).toBe('#fefefe');
    // Neu gezeichnet aus derselben Antwort, ohne neue Abfrage.
    expect(window.api.runFrontmatterQuery.mock.calls.length).toBe(abfragen);
  });
});
