// 4T-002172 (Epic 3E-000337): Diagramm-Form der Ergebnismenge
// (src/shared/query/result-chart.js) — die Datenregel nach F5 und F6 (je
// Option A) und S7, die Grund-Codes der Eignung und die zeichenbare Form im
// Vertrag des gemeinsamen Zeichners. Je Zusage der Regel ein Fall; Eignung und
// Bild müssen dieselbe Antwort geben.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QUERY_CHART_REASONS,
  GROUP_LEVEL_SEPARATOR,
  queryChartSuitability,
  buildQueryChartInput,
} from '../../src/shared/query/result-chart.js';
import {
  makeColumn,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
  validateResultSet,
} from '../../src/shared/query/result-set.js';
import { displayName } from '../../src/shared/query/result-display.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Bestands-Lesung im Modulkopf: der Quelltext des Moduls für den Bündel-Fall.
const QUELLE = fs.readFileSync(
  path.resolve(HERE, '..', '..', 'src', 'shared', 'query', 'result-chart.js'),
  'utf8',
);

const OPT = { type: 'bar', noneLabel: '(ohne Wert)' };

function spalte(label) {
  return makeColumn({ name: label.toLowerCase(), label, alias: label, source: label });
}

function tabelle(columns, rows, extra = {}) {
  return makeResultSet({
    scope: 'files',
    type: 'table',
    columns,
    rows,
    state: makeState('ready'),
    ...extra,
  });
}

function datei(name) {
  return fileOrigin(`/a/${name}.md`, name);
}

// Gruppe mit den Werten über ihren Zeilen (4T-002078), wie die Auswertung sie liefert.
function gruppe(value, rows, values, groups = null) {
  const g = makeGroup(value, rows, groups);
  if (values) g.values = values;
  return g;
}

// Eine ungruppierte Tabelle «Seiten» und «Bewertung» über drei Bücher.
const BUECHER = tabelle(
  [spalte('Seiten'), spalte('Bewertung')],
  [
    makeRow([320, 4], datei('Buch A')),
    makeRow([180, 5], datei('Buch B')),
    makeRow([240, 3], datei('Buch C')),
  ],
);

describe('Ungruppierte Tabelle (F5 A)', () => {
  it('Beschriftung ist der Treffer-Name, jede Zahl-Spalte eine Reihe mit ihrer Überschrift', () => {
    expect(validateResultSet(BUECHER)).toEqual([]);
    expect(buildQueryChartInput(BUECHER, OPT)).toEqual({
      drawable: true,
      type: 'bar',
      title: null,
      categories: ['Buch A', 'Buch B', 'Buch C'],
      series: [
        { name: 'Seiten', values: [320, 180, 240] },
        { name: 'Bewertung', values: [4, 5, 3] },
      ],
      omitted: 0,
      skippedColumns: [],
    });
  });

  it('der Treffer-Name stammt aus derselben Quelle wie der Treffer-Link der Tabelle', () => {
    const herkunft = [
      blockOrigin('/a/Notiz.md', 'Notiz', 'abc'),
      taskOrigin('/a/Plan.md', 'Plan', 3, '- [ ] x'),
      recordOrigin('buecher', 'r-00001'),
    ];
    const rs = tabelle(
      [spalte('Zahl')],
      herkunft.map((o, i) => makeRow([i + 1], o)),
    );
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.categories).toEqual(herkunft.map(displayName));
    expect(erg.categories[0]).toBe('Notiz#^abc');
  });

  it('Art bar und line werden gesetzt, ebenso ein Titel', () => {
    expect(buildQueryChartInput(BUECHER, { ...OPT, type: 'bar' }).type).toBe('bar');
    const linie = buildQueryChartInput(BUECHER, { ...OPT, type: 'line', title: 'Bücher' });
    expect(linie.type).toBe('line');
    expect(linie.title).toBe('Bücher');
  });
});

describe('WITHOUT ID (F5 A)', () => {
  it('die erste genannte Spalte ist die Beschriftung und keine Reihe', () => {
    const rs = tabelle(
      [spalte('Titel'), spalte('Seiten')],
      [makeRow(['Erstes', 320], datei('a')), makeRow(['Zweites', 180], datei('b'))],
      { wishes: makeWishes({ withoutId: true }) },
    );
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.categories).toEqual(['Erstes', 'Zweites']);
    expect(erg.series).toEqual([{ name: 'Seiten', values: [320, 180] }]);
  });

  it('auch eine Zahl-Spalte an erster Stelle ist dann Beschriftung', () => {
    const rs = tabelle(
      [spalte('Jahr'), spalte('Umsatz')],
      [makeRow([2025, 10], datei('a')), makeRow([2026, 12], datei('b'))],
      { wishes: makeWishes({ withoutId: true }) },
    );
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.categories).toEqual(['2025', '2026']);
    expect(erg.series.map((s) => s.name)).toEqual(['Umsatz']);
  });
});

describe('Gruppierte Tabelle (F6 A, S7)', () => {
  it('einstufig: je Gruppe eine Rubrik mit dem Gruppen-Wert, Werte aus der Gruppe', () => {
    const rs = tabelle(
      [spalte('Bücher')],
      [
        makeRow([null], datei('a')),
        makeRow([null], datei('b')),
        makeRow([null], datei('c')),
        makeRow([null], datei('d')),
      ],
      {
        groups: [
          gruppe('Autorin A', [0, 1], [2]),
          gruppe('Autor B', [2], [1]),
          gruppe(null, [3], [1]),
        ],
        groupColumns: [spalte('autor')],
      },
    );
    expect(validateResultSet(rs)).toEqual([]);
    const erg = buildQueryChartInput(rs, OPT);
    // Die Werte der Zeilen (hier fehlend) zählen nicht; die Summen liegen an den Gruppen.
    expect(erg.categories).toEqual(['Autorin A', 'Autor B', '(ohne Wert)']);
    expect(erg.series).toEqual([{ name: 'Bücher', values: [2, 1, 1] }]);
    expect(erg.omitted).toBe(0);
  });

  it(`zweistufig: die Werte der Stufen verbunden mit «${GROUP_LEVEL_SEPARATOR.trim()}»`, () => {
    const rs = tabelle(
      [spalte('Summe')],
      [makeRow([1], datei('a')), makeRow([2], datei('b')), makeRow([3], datei('c'))],
      {
        groups: [
          gruppe('offen', [0, 1], [3], [gruppe('hoch', [0], [1]), gruppe(null, [1], [2])]),
          gruppe('erledigt', [2], [3], [gruppe('niedrig', [2], [3])]),
        ],
        groupColumns: [spalte('status'), spalte('prio')],
      },
    );
    expect(validateResultSet(rs)).toEqual([]);
    expect(GROUP_LEVEL_SEPARATOR).toBe(' › ');
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.categories).toEqual(['offen › hoch', 'offen › (ohne Wert)', 'erledigt › niedrig']);
    expect(erg.series).toEqual([{ name: 'Summe', values: [1, 2, 3] }]);
  });

  it('mit WITHOUT ID ist die erste genannte Spalte die Beschriftung, wie die Tabelle sie zeigt', () => {
    const rs = tabelle(
      [spalte('Name'), spalte('Bücher')],
      [makeRow(['x', null], datei('a')), makeRow(['y', null], datei('b'))],
      {
        groups: [gruppe('A', [0], ['Anna', 1]), gruppe('B', [1], ['Bert', 1])],
        groupColumns: [spalte('autor')],
        wishes: makeWishes({ withoutId: true }),
      },
    );
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.categories).toEqual(['Anna', 'Bert']);
    expect(erg.series).toEqual([{ name: 'Bücher', values: [1, 1] }]);
  });
});

describe('Lücken und übergangene Spalten (F5 A)', () => {
  it('Nicht-Zahlen in einer Reihe sind Lücken und werden gezählt', () => {
    const rs = tabelle(
      [spalte('Seiten'), spalte('Preis')],
      [
        makeRow([320, 'teuer'], datei('a')),
        makeRow([null, 12.5], datei('b')),
        makeRow([240, true], datei('c')),
      ],
    );
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.series).toEqual([
      { name: 'Seiten', values: [320, null, 240] },
      { name: 'Preis', values: [null, 12.5, null] },
    ]);
    expect(erg.omitted).toBe(3);
  });

  it('eine Spalte ohne jede Zahl ist keine Reihe und wird mit ihrer Überschrift genannt', () => {
    const rs = tabelle(
      [spalte('Status'), spalte('Seiten'), spalte('Notiz')],
      [makeRow(['offen', 10, null], datei('a')), makeRow(['zu', 20, 'x'], datei('b'))],
    );
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.series.map((s) => s.name)).toEqual(['Seiten']);
    expect(erg.skippedColumns).toEqual(['Status', 'Notiz']);
    // Werte übergangener Spalten sind keine Lücken.
    expect(erg.omitted).toBe(0);
  });

  it('Datum, Dauer, Wahrheitswert und Text zählen nicht als Zahl', () => {
    const rs = tabelle(
      [spalte('Datum'), spalte('Dauer'), spalte('Fertig'), spalte('Text'), spalte('Seiten')],
      [
        makeRow(
          [{ kind: 'date', ms: 0 }, { kind: 'dur', ms: 60000 }, true, '12 Stück', 100],
          datei('a'),
        ),
        makeRow(
          [{ kind: 'date', ms: 86400000 }, { kind: 'dur', ms: 1 }, false, 'sieben', 200],
          datei('b'),
        ),
      ],
    );
    expect(validateResultSet(rs)).toEqual([]);
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.series.map((s) => s.name)).toEqual(['Seiten']);
    expect(erg.skippedColumns).toEqual(['Datum', 'Dauer', 'Fertig', 'Text']);
  });

  // 4T-002173: Kopf-Eigenschaften kommen aus dem Index als Text an («seiten: 80»
  // ist der Text «80»); die Abfrage liest sie beim Vergleichen, Sortieren und
  // Summieren als Zahl (coerceNumber), das Diagramm ebenso. Belegt im ersten
  // Ablauf-Lauf der Fälle FQ-07 bis FQ-10: ohne diese Lesart fiel jede Abfrage
  // über Kopf-Eigenschaften mit «keine Zahl» zurück.
  it('Zahl-Text aus dem Kopf einer Datei zählt als Zahl, wie die Abfrage ihn liest', () => {
    const rs = tabelle(
      [spalte('Seiten'), spalte('Preis'), spalte('Datum'), spalte('Flag')],
      [
        makeRow(['80', '-3.5', '2026-10-07', 'true'], datei('a')),
        makeRow(['120', '12 Euro', '2026-10-08', 'false'], datei('b')),
        makeRow([' 300 ', null, '2026-10-09', 'true'], datei('c')),
      ],
    );
    expect(validateResultSet(rs)).toEqual([]);
    const erg = buildQueryChartInput(rs, OPT);
    expect(erg.series).toEqual([
      { name: 'Seiten', values: [80, 120, 300] },
      { name: 'Preis', values: [-3.5, null, null] },
    ]);
    expect(erg.omitted).toBe(2);
    expect(erg.skippedColumns).toEqual(['Datum', 'Flag']);
    expect(queryChartSuitability(rs)).toEqual({ suitable: true, reason: null });
  });
});

describe('Eignung: Grund-Codes in fester Reihenfolge', () => {
  const faelle = [
    [
      'Liste statt Tabelle',
      makeResultSet({
        scope: 'files',
        type: 'list',
        columns: [spalte('Seiten')],
        rows: [makeRow([1], datei('a'))],
        state: makeState('ready'),
      }),
      'not-table',
    ],
    ['leer', tabelle([spalte('Seiten')], []), 'empty'],
    ['nur die Treffer-Spalte', tabelle([], [makeRow([], datei('a'))]), 'single-column'],
    [
      'mit WITHOUT ID nur die Beschriftung',
      tabelle([spalte('Titel')], [makeRow(['x'], datei('a'))], {
        wishes: makeWishes({ withoutId: true }),
      }),
      'single-column',
    ],
    [
      'keine Zahl-Spalte',
      tabelle(
        [spalte('Status'), spalte('Datum')],
        [makeRow(['x', { kind: 'date', ms: 0 }], datei('a'))],
      ),
      'no-numbers',
    ],
  ];

  for (const [name, rs, grund] of faelle) {
    it(`${name}: ${grund}, Eignung und Bild sagen dasselbe`, () => {
      expect(queryChartSuitability(rs)).toEqual({ suitable: false, reason: grund });
      expect(buildQueryChartInput(rs, OPT)).toEqual({ drawable: false, reason: grund });
    });
  }

  it('jeder Grund-Code ist belegt, und eine passende Menge ist geeignet', () => {
    expect([...new Set(faelle.map((f) => f[2]))].sort()).toEqual([...QUERY_CHART_REASONS].sort());
    expect(queryChartSuitability(BUECHER)).toEqual({ suitable: true, reason: null });
  });
});

describe('Vertrag gegenüber dem Aufrufer', () => {
  it('unbekannte Art, fehlender Text der Gruppe ohne Wert oder fehlende Menge werfen', () => {
    expect(() => buildQueryChartInput(BUECHER, { ...OPT, type: 'pie' })).toThrow(TypeError);
    expect(() => buildQueryChartInput(BUECHER, { type: 'bar' })).toThrow(TypeError);
    expect(() => buildQueryChartInput(BUECHER)).toThrow(TypeError);
    expect(() => buildQueryChartInput(BUECHER, { ...OPT, title: 3 })).toThrow(TypeError);
    expect(() => queryChartSuitability(null)).toThrow(TypeError);
  });

  it('das Modul lädt weder den Zeichner noch die Zeichen-Bibliothek (S1)', () => {
    const requires = [...QUELLE.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    expect(requires.length).toBeGreaterThan(0);
    expect(requires.filter((r) => /chart|echarts/.test(r))).toEqual([]);
  });
});
