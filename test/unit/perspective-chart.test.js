// 4T-002019 (Epic 3E-000192): Format-Kern des Diagramm-Blocks `perspective-chart`
// — Lesen und Zurückschreiben der Angaben, Auflösung des Tabellen-Namens im
// selben Dokument, Bildung der Datenreihen aus der Datentabelle und die Gründe,
// aus denen ein Diagramm nicht zeichenbar ist, in ihrer festen Reihenfolge.
// Prozess-neutral: geprüft wird die reine Kette Text -> Ergebnis.
//
// Die Kriterien-Nummern AK1 bis AK28 sind die des Tasks; die Fälle der
// Festlegungen zu Fällen, die die Stories nicht regeln, tragen die Marke «F-offen».
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHART_REASONS,
  DOCUMENT_MISSING,
  parseChartSpec,
  serializeChartSpec,
  parseTableRef,
  buildChartInput,
  buildChartInputInDocument,
  renderChartContainer,
} from '../../src/shared/markdown/perspective-chart.js';
import { resolveTableInDocument } from '../../src/shared/markdown/perspective-chart-resolve.js';
import { parsePerspectiveDatatable } from '../../src/shared/markdown/perspective-datatable.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Beispiel-Tabelle der Abnahme-Handgriffe: Monat, Einnahmen mit eigener
// Anzeige-Überschrift, Ausgaben, eine berechnete Spalte und eine Summe am Fuß.
const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen "Einnahmen (netto)":number(2), Ausgaben:number, Saldo:number = Einnahmen - Ausgaben',
  'aggregate: Einnahmen:sum, Ausgaben:sum',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | 70 |',
  '```',
  '^umsatz',
].join('\n');

function block(zeilen) {
  return zeilen.join('\n');
}

function dok(...teile) {
  return teile.join('\n\n');
}

function chart(body) {
  return '```perspective-chart\n' + body + '\n```';
}

// Baut Dokument und Block und liefert das Ergebnis des Einstiegs.
function ergebnis(body, tabelle = TABELLE) {
  return buildChartInput(dok(tabelle, chart(body)), body);
}

const SPALTEN_BAR = block([
  'table: ^umsatz',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen, Ausgaben',
]);

describe('perspective-chart — Lesen der Angaben (AK21, AK22)', () => {
  it('liest alle sieben Angaben in das Modell', () => {
    const spec = parseChartSpec(
      block([
        'table: ^umsatz',
        'type: Bar',
        'series: Rows',
        'labels: Monat',
        'values: Einnahmen, Ausgaben',
        'rows: Januar, Februar',
        'title: Umsatz 2026',
      ]),
    );
    expect(spec.table).toBe('^umsatz');
    expect(spec.type).toBe('bar');
    expect(spec.series).toBe('rows');
    expect(spec.labels).toBe('Monat');
    expect(spec.values).toEqual(['Einnahmen', 'Ausgaben']);
    expect(spec.rows).toEqual(['Januar', 'Februar']);
    expect(spec.title).toBe('Umsatz 2026');
  });

  it('fehlende Angaben sind null; ohne Titel-Zeile gibt es keinen Titel', () => {
    const spec = parseChartSpec('table: ^t');
    expect(spec.type).toBeNull();
    expect(spec.series).toBeNull();
    expect(spec.values).toBeNull();
    expect(spec.title).toBeNull();
  });

  it('ein Komma innerhalb eines Zeilen-Eintrags steht als \\,', () => {
    const spec = parseChartSpec('rows: Müller\\, Anna, Meier');
    expect(spec.rows).toEqual(['Müller, Anna', 'Meier']);
    expect(serializeChartSpec({ ...spec, rows: ['A, B', 'C'] })).toBe('rows: A\\, B, C');
  });

  it('erkennt beide Schreibweisen der Tabellen-Angabe', () => {
    expect(parseTableRef('^umsatz')).toEqual({ kind: 'same', name: 'umsatz' });
    expect(parseTableRef('[[Bericht 2026#^kosten]]')).toEqual({
      kind: 'other',
      file: 'Bericht 2026',
      name: 'kosten',
    });
    // 4T-002072: ohne Dach-Zeichen die Form «selbes Dokument».
    expect(parseTableRef('umsatz')).toEqual({ kind: 'same', name: 'umsatz' });
    expect(parseTableRef('^')).toBeNull();
    expect(parseTableRef('[[#^kosten]]')).toBeNull();
    expect(parseTableRef(null)).toBeNull();
  });

  it('bewahrt unbekannte Zeilen samt Reihenfolge und schreibt byte-gleich zurück', () => {
    const body = [
      '# Kommentar',
      'table: ^umsatz',
      '',
      'farbe: blau',
      'type: bar   ',
      'unsinn ohne Doppelpunkt',
      'labels: Monat',
      'values: Einnahmen,Ausgaben',
      '',
    ].join('\r\n');
    const spec = parseChartSpec(body);
    expect(spec.lines.filter((l) => l.key === null).map((l) => l.raw)).toEqual([
      '# Kommentar',
      '',
      'farbe: blau',
      'unsinn ohne Doppelpunkt',
      '',
    ]);
    expect(serializeChartSpec(spec)).toBe(body);
  });

  it('ändert beim Zurückschreiben nur die geänderte Angabe', () => {
    const body = 'x: 1\ntable: ^umsatz\ntype: bar\ny: 2';
    const spec = parseChartSpec(body);
    expect(serializeChartSpec({ ...spec, type: 'pie' })).toBe(
      'x: 1\ntable: ^umsatz\ntype: pie\ny: 2',
    );
    expect(serializeChartSpec({ ...spec, type: null })).toBe('x: 1\ntable: ^umsatz\ny: 2');
    expect(serializeChartSpec({ ...spec, title: 'Neu' })).toBe(
      'x: 1\ntable: ^umsatz\ntype: bar\ny: 2\ntitle: Neu',
    );
    const mitEnde = parseChartSpec('table: ^a\n');
    expect(serializeChartSpec({ ...mitEnde, type: 'line' })).toBe('table: ^a\ntype: line\n');
  });

  // F-offen: Steht eine Angabe mehrfach, gilt die erste; die weiteren bleiben
  // als unbekannte Zeilen erhalten.
  it('F-offen: bei doppelter Angabe gilt die erste, die zweite bleibt als unbekannte Zeile', () => {
    const body = 'table: ^umsatz\ntype: bar\ntype: pie';
    const spec = parseChartSpec(body);
    expect(spec.type).toBe('bar');
    expect(spec.lines[2].key).toBeNull();
    expect(serializeChartSpec(spec)).toBe(body);
    expect(ergebnis(body + '\nlabels: Monat\nvalues: Einnahmen, Ausgaben').type).toBe('bar');
  });
});

describe('perspective-chart — Auflösung im selben Dokument (AK1, AK23)', () => {
  it('findet die Datentabelle unter ihrem Namen', () => {
    const res = resolveTableInDocument(dok('Text', TABELLE), 'umsatz');
    expect(res.status).toBe('found');
    expect(res.model.columns.map((c) => c.name)).toEqual([
      'Monat',
      'Einnahmen',
      'Ausgaben',
      'Saldo',
    ]);
    expect(res.openLine).toBe(3);
  });

  it('eine Leerzeile zwischen Zaun und Name trennt nicht', () => {
    const tab = TABELLE.replace('```\n^umsatz', '```\n\n^umsatz');
    expect(resolveTableInDocument(tab, 'umsatz').status).toBe('found');
  });

  it('meldet einen Namen, der nicht vorkommt', () => {
    expect(resolveTableInDocument(TABELLE, 'kosten')).toEqual({ status: 'missing' });
    expect(resolveTableInDocument('', 'kosten')).toEqual({ status: 'missing' });
  });

  it('ein Name im Code-Block oder im Frontmatter benennt nichts', () => {
    const imCode = '```text\n^kosten\n```';
    expect(resolveTableInDocument(imCode, 'kosten').status).toBe('missing');
    const imKopf = '---\nnotiz: ^kosten\n---\nText';
    expect(resolveTableInDocument(imKopf, 'kosten').status).toBe('missing');
  });

  it('unterscheidet die gewöhnliche Markdown-Tabelle, gleich wie der Anker sie erfasst', () => {
    const pipe = '| A | B |\n|---|---|\n| 1 | 2 |';
    // Name auf eigener Zeile direkt darunter und nach einer Leerzeile.
    expect(resolveTableInDocument(pipe + '\n^p', 'p')).toEqual({
      status: 'other-kind',
      kind: 'pipe-table',
    });
    expect(resolveTableInDocument(pipe + '\n\n^p', 'p').kind).toBe('pipe-table');
    // Name am Ende der letzten Tabellen-Zeile.
    expect(resolveTableInDocument('| A | B |\n|---|---|\n| 1 | 2 | ^p', 'p').kind).toBe(
      'pipe-table',
    );
  });

  it('unterscheidet die Perspective Table', () => {
    const pt = '```perspective-table\n{| A || B |}\n```\n^pt';
    expect(resolveTableInDocument(pt, 'pt')).toEqual({
      status: 'other-kind',
      kind: 'perspective-table',
    });
  });

  // F-offen: Ein Name auf einem Absatz, einer Liste oder einem anderen
  // Code-Block ist «Tabelle anderer Art».
  it('F-offen: Absatz, Liste und anderer Code-Block sind «Tabelle anderer Art»', () => {
    expect(ergebnis('table: ^a', 'Ein Absatz ^a')).toEqual({
      drawable: false,
      reason: 'table-other-kind',
      detail: 'other',
      missingKey: null,
    });
    expect(ergebnis('table: ^l', '- Punkt\n- Punkt ^l').detail).toBe('other');
    expect(ergebnis('table: ^m', '```mermaid\ngraph TD\n```\n^m')).toEqual({
      drawable: false,
      reason: 'table-other-kind',
      detail: 'code-block',
      missingKey: null,
    });
  });

  it('meldet die fehlerhafte Datentabelle mit dem ersten Fehler', () => {
    const kaputt = '```perspective-datatable\ncolumns: A:zahl\n| 1 |\n```\n^k';
    const res = resolveTableInDocument(kaputt, 'k');
    expect(res.status).toBe('invalid');
    expect(res.errors[0].code).toBe('unknownType');
  });

  it('AK1: das Diagramm darf vor oder nach der Tabelle stehen, zwei Diagramme auf dieselbe Tabelle', () => {
    const a = chart(SPALTEN_BAR);
    const b = chart(block(['table: ^umsatz', 'type: line', 'labels: Monat', 'values: Ausgaben']));
    const text = dok(a, TABELLE, b);
    const vor = buildChartInput(text, SPALTEN_BAR);
    const nach = buildChartInput(
      text,
      block(['table: ^umsatz', 'type: line', 'labels: Monat', 'values: Ausgaben']),
    );
    expect(vor.drawable).toBe(true);
    expect(nach.drawable).toBe(true);
    expect(vor.series[1].values).toEqual(nach.series[0].values);
    expect(nach.series[0].values).toEqual([80, 95, 70]);
  });

  // Durchsicht vom 2026-09-30 (4T-002024, K2): Die Anker-Erkennung schaltete
  // an jeder Zeile mit drei Backticks um; hinter einer solchen Zeile hieß jede
  // Tabelle «Tabelle fehlt».
  it('eine Tabelle hinter einer Zeile mit Backticks im Fließtext oder einem längeren Zaun wird gefunden', () => {
    const vorspaenne = [
      '```inline``` steht am Zeilenanfang',
      // Längerer Zaun um einen inneren Öffner ohne eigenen Schluss.
      '````markdown\n```js\nBeispiel\n````',
    ];
    for (const vorspann of vorspaenne) {
      const text = dok(vorspann, TABELLE, chart(SPALTEN_BAR));
      expect(resolveTableInDocument(text, 'umsatz').status, vorspann).toBe('found');
      expect(buildChartInput(text, SPALTEN_BAR).drawable, vorspann).toBe(true);
    }
  });

  it('Zaun-Erkennung aus ihrer Heimat: kein Bezug auf die geteilte Zaun-Regex von link-scan.js', () => {
    for (const datei of [
      'perspective-chart.js',
      'perspective-chart-resolve.js',
      'perspective-chart-series.js',
    ]) {
      const text = fs.readFileSync(path.join(WURZEL, 'src/shared/markdown', datei), 'utf8');
      expect(text, datei).not.toContain('FENCE_RE');
    }
    const resolve = fs.readFileSync(
      path.join(WURZEL, 'src/shared/markdown/perspective-chart-resolve.js'),
      'utf8',
    );
    expect(resolve).toContain("require('./fence-level.js')");
  });
});

describe('perspective-chart — Datenreihen aus Spalten (AK2, AK7, AK8, AK12 bis AK17)', () => {
  it('AK8/AK13/AK16: jede Werte-Spalte ist eine Reihe unter ihrer Überschrift, die Summe fehlt', () => {
    const r = ergebnis(SPALTEN_BAR);
    expect(r).toEqual({
      drawable: true,
      type: 'bar',
      title: null,
      categories: ['Januar', 'Februar', 'März'],
      series: [
        { name: 'Einnahmen (netto)', values: [100, 90, 120] },
        { name: 'Ausgaben', values: [80, 95, 70] },
      ],
      omitted: 0,
    });
  });

  it('AK16: die Aggregat-Zeile steht im Modell getrennt von den Zeilen', () => {
    const model = parsePerspectiveDatatable(TABELLE.split('\n').slice(1, 6).join('\n'));
    expect(model.rows).toHaveLength(3);
    expect(model.aggregates[1]).toEqual(['sum']);
  });

  it('AK12: Reihen stehen in der Reihenfolge der Spalten, nicht der Nennung', () => {
    const r = ergebnis(
      block(['table: ^umsatz', 'type: line', 'labels: Monat', 'values: Ausgaben, Einnahmen']),
    );
    expect(r.series.map((s) => s.name)).toEqual(['Einnahmen (netto)', 'Ausgaben']);
  });

  it('AK2/AK14: berechnete Zahl-Spalten gehen mit ihren berechneten Werten ein', () => {
    const r = ergebnis(block(['table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Saldo']));
    expect(r.series).toEqual([{ name: 'Saldo', values: [20, -5, 50] }]);
  });

  it('Spalten werden über ihre Kennung genannt, ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(
      ergebnis(block(['table: ^umsatz', 'type: bar', 'labels: monat', 'values: EINNAHMEN']))
        .drawable,
    ).toBe(true);
    const ueberschrift = ergebnis(
      block(['table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen (netto)']),
    );
    expect(ueberschrift).toMatchObject({ drawable: false, reason: 'selection-invalid' });
  });

  it('AK15: die Beschriftungs-Spalte darf jeden Typ tragen (Datum, Zahl)', () => {
    const tab = block([
      '```perspective-datatable',
      'columns: Tag:date, Nr:number, Wert:number',
      '| 2026-01-01 | 1 | 5 |',
      '| 2026-01-02 | 2 | 6 |',
      '```',
      '^d',
    ]);
    const datum = ergebnis(block(['table: ^d', 'type: line', 'labels: Tag', 'values: Wert']), tab);
    expect(datum.categories).toEqual(['2026-01-01', '2026-01-02']);
    const zahl = ergebnis(block(['table: ^d', 'type: line', 'labels: Nr', 'values: Wert']), tab);
    expect(zahl.categories).toEqual(['1', '2']);
  });

  it('AK17: die Beschriftungs-Spalte wird nicht als Werte gezeichnet', () => {
    const tab = block([
      '```perspective-datatable',
      'columns: Nr:number, Wert:number',
      '| 1 | 5 |',
      '```',
      '^n',
    ]);
    const r = ergebnis(
      block(['table: ^n', 'type: line', 'series: rows', 'labels: Nr', 'rows: 1']),
      tab,
    );
    expect(r.categories).toEqual(['Wert']);
  });

  it('AK18: kommt eine Zeile hinzu oder ändert sich ein Eintrag, folgen Rubriken', () => {
    const mehr = TABELLE.replace(
      '| März    | 120 | 70 |',
      '| März    | 120 | 70 |\n| April | 1 | 2 |',
    );
    expect(ergebnis(SPALTEN_BAR, mehr).categories).toEqual(['Januar', 'Februar', 'März', 'April']);
    const weniger = TABELLE.replace('| Februar | 90  | 95 |\n', '');
    expect(ergebnis(SPALTEN_BAR, weniger).categories).toEqual(['Januar', 'März']);
    const umbenannt = TABELLE.replace('Januar ', 'Jänner ');
    expect(ergebnis(SPALTEN_BAR, umbenannt).categories[0]).toBe('Jänner');
  });

  it('AK20: eine Tabelle mit nur einer Zeile oder nur einer Werte-Spalte', () => {
    const eine = block([
      '```perspective-datatable',
      'columns: M:text, W:number',
      '| a | 3 |',
      '```',
      '^e',
    ]);
    const r = ergebnis(block(['table: ^e', 'type: bar', 'labels: M', 'values: W']), eine);
    expect(r.categories).toEqual(['a']);
    expect(r.series).toEqual([{ name: 'W', values: [3] }]);
  });

  it('AK14 (Ränder): Titel und Beschriftungen mit Sonderzeichen bleiben unverändert Text', () => {
    const tab = block([
      '```perspective-datatable',
      'columns: M:text, W:number',
      '| <a> & "b" | 1 |',
      '```',
      '^s',
    ]);
    const r = ergebnis(
      block(['table: ^s', 'type: bar', 'labels: M', 'values: W', 'title: Ä <x> & "y"']),
      tab,
    );
    expect(r.title).toBe('Ä <x> & "y"');
    expect(r.categories).toEqual(['<a> & "b"']);
  });
});

describe('perspective-chart — Datenreihen aus Zeilen (AK7, AK9 bis AK11, AK19)', () => {
  const ZEILEN = block([
    'table: ^umsatz',
    'type: bar',
    'series: rows',
    'labels: Monat',
    'rows: März, Januar',
  ]);

  it('AK9/AK11: jede genannte Zeile ist eine Reihe; ohne Werte-Angabe alle Zahl-Spalten', () => {
    const r = ergebnis(ZEILEN);
    expect(r.categories).toEqual(['Einnahmen (netto)', 'Ausgaben', 'Saldo']);
    // AK12: Reihen in der Reihenfolge der Zeilen, nicht der Nennung.
    expect(r.series).toEqual([
      { name: 'Januar', values: [100, 80, 20] },
      { name: 'März', values: [120, 70, 50] },
    ]);
  });

  it('AK11/AK14: mit Werte-Angabe genau die genannten, berechnete eingeschlossen', () => {
    const r = ergebnis(ZEILEN + '\nvalues: Saldo, Ausgaben');
    expect(r.categories).toEqual(['Ausgaben', 'Saldo']);
    expect(r.series[0]).toEqual({ name: 'Januar', values: [80, 20] });
  });

  it('AK10: eine verschobene Zeile bleibt dieselbe Reihe', () => {
    const verschoben = TABELLE.replace(
      '| Januar  | 100 | 80 |\n| Februar | 90  | 95 |',
      '| Februar | 90  | 95 |\n| Januar  | 100 | 80 |',
    );
    const r = ergebnis(
      block(['table: ^umsatz', 'type: bar', 'series: rows', 'labels: Monat', 'rows: Januar']),
      verschoben,
    );
    expect(r.series).toEqual([{ name: 'Januar', values: [100, 80, 20] }]);
  });

  it('AK19: die Umstellung der Richtung ergibt die Reihen der neuen Angabe', () => {
    const spalten = ergebnis(
      block(['table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen']),
    );
    const zeilen = ergebnis(
      block([
        'table: ^umsatz',
        'type: bar',
        'series: rows',
        'labels: Monat',
        'values: Einnahmen',
        'rows: Januar, Februar, März',
      ]),
    );
    expect(spalten.series).toHaveLength(1);
    expect(zeilen.series).toHaveLength(3);
    expect(zeilen.categories).toEqual(['Einnahmen (netto)']);
  });

  it('ein Eintrag mit Komma wird über \\, genannt', () => {
    const tab = block([
      '```perspective-datatable',
      'columns: N:text, W:number',
      '| Müller, Anna | 4 |',
      '```',
      '^k',
    ]);
    const r = ergebnis(
      block(['table: ^k', 'type: bar', 'series: rows', 'labels: N', 'rows: Müller\\, Anna']),
      tab,
    );
    expect(r.series).toEqual([{ name: 'Müller, Anna', values: [4] }]);
  });
});

describe('perspective-chart — Lücken und ausgelassene Werte (AK24)', () => {
  it('leere Zellen und Fehler-Zellen sind Lücken und werden gezählt', () => {
    const tab = block([
      '```perspective-datatable',
      'columns: M:text, W:number',
      '| a | 1 |',
      '| b |   |',
      '| c | x |',
      '```',
      '^l',
    ]);
    const r = ergebnis(block(['table: ^l', 'type: line', 'labels: M', 'values: W']), tab);
    expect(r.drawable).toBe(true);
    expect(r.series[0].values).toEqual([1, null, null]);
    expect(r.omitted).toBe(2);
  });
});

describe('perspective-chart — Gründe in fester Reihenfolge (AK24)', () => {
  const grund = (body, tab) => {
    const r = ergebnis(body, tab);
    expect(r.drawable).toBe(false);
    return r.reason;
  };

  it('die Reihenfolge der acht Gründe ist die der Anforderung', () => {
    expect(CHART_REASONS).toEqual([
      'document-missing',
      'table-missing',
      'table-other-kind',
      'table-invalid',
      'selection-invalid',
      'values-not-numeric',
      'no-numbers',
      'type-unsupported',
    ]);
    expect(DOCUMENT_MISSING).toBe(CHART_REASONS[0]);
  });

  it('table-missing: der Name kommt nicht vor', () => {
    expect(grund(SPALTEN_BAR.replace('^umsatz', '^kosten'))).toBe('table-missing');
  });

  // F-offen: fehlende oder unlesbare Angabe `table:` -> «Tabelle fehlt».
  it('F-offen: fehlende oder unlesbare Tabellen-Angabe ergibt table-missing', () => {
    expect(grund('type: bar\nlabels: Monat\nvalues: Einnahmen')).toBe('table-missing');
    expect(ergebnis('table: Umsatz 2026\ntype: bar')).toEqual({
      drawable: false,
      reason: 'table-missing',
      detail: 'Umsatz 2026',
      missingKey: null,
    });
  });

  it('table-invalid: jeder Eintrag im Feld errors, auch wenn die Tabelle Werte zeigt', () => {
    // Zeile mit falscher Zellen-Zahl: die Tabelle zeigt ihre Werte weiter.
    const tab = TABELLE.replace('| März    | 120 | 70 |', '| März    | 120 | 70 | 1 |');
    const model = parsePerspectiveDatatable(tab.split('\n').slice(1, 6).join('\n'));
    expect(model.columns.length).toBeGreaterThan(0);
    expect(model.errors.map((e) => e.code)).toEqual(['rowCellCount']);
    expect(ergebnis(SPALTEN_BAR, tab)).toEqual({
      drawable: false,
      reason: 'table-invalid',
      detail: 'rowCellCount',
      missingKey: null,
    });
  });

  it('selection-invalid: Spalte fehlt, Zeile fehlt oder ist mehrdeutig', () => {
    expect(grund(SPALTEN_BAR.replace('labels: Monat', 'labels: Jahr'))).toBe('selection-invalid');
    expect(grund(SPALTEN_BAR.replace('Ausgaben', 'Steuern'))).toBe('selection-invalid');
    const zeilen = block(['table: ^umsatz', 'type: bar', 'series: rows', 'labels: Monat']);
    expect(ergebnis(zeilen + '\nrows: Mai')).toMatchObject({
      reason: 'selection-invalid',
      detail: 'Mai',
    });
    const doppelt = TABELLE.replace('| März ', '| Januar ');
    expect(ergebnis(zeilen + '\nrows: Januar', doppelt)).toMatchObject({
      reason: 'selection-invalid',
      detail: 'Januar',
    });
  });

  // F-offen: die fünf Fälle, die die Stories nicht regeln, ergeben «Spalte oder
  // Zeile fehlt oder ist mehrdeutig».
  it('F-offen: Werte fehlen bei Spalten, Zeilen fehlen bei Zeilen, unbekannte Richtung', () => {
    expect(ergebnis('table: ^umsatz\ntype: bar\nlabels: Monat')).toMatchObject({
      reason: 'selection-invalid',
      detail: null,
      missingKey: 'values',
    });
    expect(ergebnis('table: ^umsatz\ntype: bar\nseries: rows\nlabels: Monat')).toMatchObject({
      reason: 'selection-invalid',
      detail: null,
      missingKey: 'rows',
    });
    expect(ergebnis(SPALTEN_BAR + '\nseries: diagonal')).toMatchObject({
      reason: 'selection-invalid',
      detail: null,
      missingKey: 'series',
    });
    expect(ergebnis('table: ^umsatz\ntype: bar\nvalues: Einnahmen')).toMatchObject({
      reason: 'selection-invalid',
      detail: null,
      missingKey: 'labels',
    });
  });

  // 4T-002022: Eine fehlende Spalte, die selbst `labels` heißt, ist eine
  // beanstandete Nennung und keine fehlende Angabe; die Felder sind getrennt.
  it('eine fehlende Spalte namens labels steht in detail, nicht in missingKey', () => {
    expect(ergebnis(SPALTEN_BAR.replace('labels: Monat', 'labels: labels'))).toEqual({
      drawable: false,
      reason: 'selection-invalid',
      detail: 'labels',
      missingKey: null,
    });
    expect(ergebnis(SPALTEN_BAR.replace('Ausgaben', 'values'))).toMatchObject({
      reason: 'selection-invalid',
      detail: 'values',
      missingKey: null,
    });
  });

  it('F-offen: Beschriftungs-Spalte als Werte-Spalte und doppelte Nennung', () => {
    // 4T-002026 (Entscheidung vom 2026-09-30): Eine Text-Spalte als
    // Beschriftung und Werte zugleich ergibt den zutreffenden Grund «keine
    // Zahl-Spalte», nicht «fehlt oder ist nicht eindeutig».
    expect(
      ergebnis(SPALTEN_BAR.replace('values: Einnahmen, Ausgaben', 'values: Einnahmen, Monat')),
    ).toEqual({
      drawable: false,
      reason: 'values-not-numeric',
      detail: 'Monat',
      missingKey: null,
    });
    expect(ergebnis(SPALTEN_BAR.replace('Ausgaben', 'einnahmen'))).toMatchObject({
      reason: 'selection-invalid',
    });
    const zeilen = block([
      'table: ^umsatz',
      'type: bar',
      'series: rows',
      'labels: Monat',
      'rows: Januar, Januar',
    ]);
    expect(ergebnis(zeilen)).toMatchObject({ reason: 'selection-invalid', detail: 'Januar' });
  });

  it('4T-002026: Beschriftungs-Spalte als Werte — Text «keine Zahl-Spalte», Zahl wie bisher', () => {
    // Nur die Beschriftung als Werte, bei Reihen aus Spalten und aus Zeilen.
    const nurMonat = SPALTEN_BAR.replace('values: Einnahmen, Ausgaben', 'values: Monat');
    expect(ergebnis(nurMonat)).toMatchObject({ reason: 'values-not-numeric', detail: 'Monat' });
    const zeilenMonat = block([
      'table: ^umsatz',
      'type: bar',
      'series: rows',
      'labels: Monat',
      'values: Monat',
      'rows: Januar',
    ]);
    expect(ergebnis(zeilenMonat)).toMatchObject({
      reason: 'values-not-numeric',
      detail: 'Monat',
    });
    // Eine Zahl-Spalte als Beschriftung und Werte zugleich bleibt «nicht eindeutig».
    const zahlTab = block([
      '```perspective-datatable',
      'columns: Nr:number, Wert:number',
      '| 1 | 5 |',
      '```',
      '^n',
    ]);
    expect(
      ergebnis(block(['table: ^n', 'type: bar', 'labels: Nr', 'values: Nr, Wert']), zahlTab),
    ).toMatchObject({ reason: 'selection-invalid', detail: 'Nr' });
    // Die feste Reihenfolge bleibt: Eine fehlende Spalte oder Zeile geht vor.
    expect(
      ergebnis(SPALTEN_BAR.replace('values: Einnahmen, Ausgaben', 'values: Monat, Fehlt')),
    ).toMatchObject({ reason: 'selection-invalid', detail: 'Fehlt' });
    expect(ergebnis(zeilenMonat.replace('rows: Januar', 'rows: Mai'))).toMatchObject({
      reason: 'selection-invalid',
      detail: 'Mai',
    });
    // Und «keine Zahl-Spalte» geht vor den Gründen danach (Kreis mit zwei Reihen).
    expect(
      ergebnis(
        SPALTEN_BAR.replace('type: bar', 'type: pie').replace(
          'values: Einnahmen, Ausgaben',
          'values: Einnahmen, Monat',
        ),
      ),
    ).toMatchObject({ reason: 'values-not-numeric', detail: 'Monat' });
  });

  it('values-not-numeric: eine genannte Werte-Spalte ist keine Zahl-Spalte', () => {
    const tab = block([
      '```perspective-datatable',
      'columns: M:text, T:text, W:number',
      '| a | x | 1 |',
      '```',
      '^v',
    ]);
    expect(ergebnis(block(['table: ^v', 'type: bar', 'labels: M', 'values: W, T']), tab)).toEqual({
      drawable: false,
      reason: 'values-not-numeric',
      detail: 'T',
      missingKey: null,
    });
  });

  it('no-numbers: die gewählten Reihen tragen keine einzige Zahl', () => {
    const leer = block([
      '```perspective-datatable',
      'columns: M:text, W:number',
      '| a |  |',
      '| b | x |',
      '```',
      '^n',
    ]);
    expect(grund(block(['table: ^n', 'type: line', 'labels: M', 'values: W']), leer)).toBe(
      'no-numbers',
    );
    const ohneZeilen = block([
      '```perspective-datatable',
      'columns: M:text, W:number',
      '```',
      '^o',
    ]);
    expect(grund(block(['table: ^o', 'type: bar', 'labels: M', 'values: W']), ohneZeilen)).toBe(
      'no-numbers',
    );
  });

  it('type-unsupported: Kreis und Donut mit negativen Werten, lauter Nullen oder mehreren Reihen', () => {
    const kreis = (values, typ = 'pie') =>
      ergebnis(block(['table: ^umsatz', `type: ${typ}`, 'labels: Monat', `values: ${values}`]));
    expect(kreis('Saldo')).toMatchObject({ reason: 'type-unsupported', detail: 'negative' });
    expect(kreis('Einnahmen, Ausgaben', 'donut')).toMatchObject({
      reason: 'type-unsupported',
      detail: 'multiple-series',
    });
    const nullen = block([
      '```perspective-datatable',
      'columns: M:text, W:number',
      '| a | 0 |',
      '| b | 0 |',
      '```',
      '^z',
    ]);
    expect(
      ergebnis(block(['table: ^z', 'type: pie', 'labels: M', 'values: W']), nullen),
    ).toMatchObject({
      reason: 'type-unsupported',
      detail: 'zeros',
    });
    // Linie und Balken zeichnen negative Werte und lauter Nullen.
    expect(kreis('Saldo', 'bar').drawable).toBe(true);
    expect(
      ergebnis(block(['table: ^z', 'type: bar', 'labels: M', 'values: W']), nullen).drawable,
    ).toBe(true);
    // Ein Kreis aus einer Reihe mit positiven Werten ist zeichenbar.
    expect(kreis('Einnahmen')).toMatchObject({
      drawable: true,
      categories: ['Januar', 'Februar', 'März'],
    });
  });

  // F-offen: fehlende oder unbekannte Angabe `type:` -> «Art verträgt die Daten
  // nicht», mit dem Anlass im Feld detail.
  it('F-offen: fehlende oder unbekannte Art ergibt type-unsupported mit detail', () => {
    expect(ergebnis(SPALTEN_BAR.replace('type: bar\n', ''))).toMatchObject({
      reason: 'type-unsupported',
      detail: 'missing-type',
    });
    expect(ergebnis(SPALTEN_BAR.replace('type: bar', 'type: area'))).toMatchObject({
      reason: 'type-unsupported',
      detail: 'unknown-type',
    });
  });

  it('bei mehreren Gründen zugleich gilt der erste der Reihenfolge', () => {
    // Tabelle fehlt und Art unbekannt: Tabelle fehlt.
    expect(grund('table: ^kosten\ntype: area\nlabels: X')).toBe('table-missing');
    // Spalte fehlt und Werte-Spalte ohne Zahlen: Spalte fehlt.
    expect(
      grund(SPALTEN_BAR.replace('values: Einnahmen, Ausgaben', 'values: Steuern, Monat')),
    ).toBe('selection-invalid');
    // Werte-Spalte ohne Zahlen und Kreis mit zwei Reihen: Spalte ohne Zahlen.
    const tab = block([
      '```perspective-datatable',
      'columns: M:text, T:text, W:number',
      '| a | x | 1 |',
      '```',
      '^v',
    ]);
    expect(grund(block(['table: ^v', 'type: pie', 'labels: M', 'values: W, T']), tab)).toBe(
      'values-not-numeric',
    );
    // Fehlerhafte Tabelle und fehlende Spalte: Tabelle fehlerhaft.
    const kaputt = TABELLE.replace('aggregate: Einnahmen:sum', 'aggregate: Gibtsnicht:sum');
    expect(grund(SPALTEN_BAR.replace('Ausgaben', 'Steuern'), kaputt)).toBe('table-invalid');
  });
});

describe('perspective-chart — anderes Dokument, Ergebnis-Form und Prozess-Neutralität (AK3, AK24, AK25)', () => {
  it('eine Tabelle in einem anderen Dokument ergibt das Zwischen-Ergebnis mit Ziel', () => {
    const body = block([
      'table: [[Bericht#^kosten]]',
      'type: pie',
      'labels: Posten',
      'values: Betrag',
    ]);
    expect(buildChartInput('', body)).toEqual({
      drawable: false,
      reason: null,
      detail: null,
      missingKey: null,
      pending: 'other-document',
      target: { file: 'Bericht', name: 'kosten' },
    });
    // Mit dem Text des anderen Dokuments führt derselbe Kern zu Ende.
    const anderes = block([
      '```perspective-datatable',
      'columns: Posten:text, Betrag:number',
      '| Miete | 900 |',
      '```',
      '^kosten',
    ]);
    const r = buildChartInputInDocument(parseChartSpec(body), anderes, 'kosten');
    expect(r).toMatchObject({ drawable: true, type: 'pie', categories: ['Miete'] });
  });

  it('das Ergebnis kennt weder Tabelle noch Datenbank', () => {
    const r = ergebnis(SPALTEN_BAR);
    expect(Object.keys(r).sort()).toEqual([
      'categories',
      'drawable',
      'omitted',
      'series',
      'title',
      'type',
    ]);
    for (const s of r.series) expect(Object.keys(s).sort()).toEqual(['name', 'values']);
    expect(JSON.stringify(r)).not.toMatch(/columns|rows|aggregates|errors|record|database/);
  });

  it('AK3: der Block trägt keine Zahlen, die Auflösung ändert den Dokument-Text nicht', () => {
    const text = dok(chart(SPALTEN_BAR), TABELLE);
    const vorher = String(text);
    buildChartInput(text, SPALTEN_BAR);
    buildChartInput(text, SPALTEN_BAR);
    expect(text).toBe(vorher);
    expect(SPALTEN_BAR).not.toMatch(/\d/);
  });

  it('AK25: die drei Module laden weder DOM noch Electron noch Datei-Zugriff', () => {
    for (const datei of [
      'perspective-chart.js',
      'perspective-chart-resolve.js',
      'perspective-chart-series.js',
      // 4T-002023: das Blatt mit der Erkennung der Angabe `table:`.
      'perspective-chart-ref.js',
    ]) {
      const text = fs.readFileSync(path.join(WURZEL, 'src/shared/markdown', datei), 'utf8');
      const importe = [...text.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
      for (const imp of importe) {
        expect(imp, `${datei}: ${imp}`).toMatch(/^\.\.?\//);
        expect(imp, `${datei}: ${imp}`).not.toMatch(/electron|renderer|main\//);
      }
      expect(text, datei).not.toMatch(/\b(document|window)\.|require\('(node:)?(fs|path)'\)/);
    }
  });

  it('Import-Graph: nur vom Kern nach unten, kein Schwester-Modul lädt den Kern', () => {
    for (const datei of [
      'perspective-chart-resolve.js',
      'perspective-chart-series.js',
      'perspective-chart-ref.js',
    ]) {
      const text = fs.readFileSync(path.join(WURZEL, 'src/shared/markdown', datei), 'utf8');
      expect(text, datei).not.toMatch(
        /require\('\.\/perspective-chart(-resolve|-series|-ref)?\.js'\)/,
      );
    }
    // 4T-002023: Das Blatt der Angabe lädt gar nichts — auch block-anchors.js
    // nicht, das seinerseits aus dem Blatt liest.
    const ref = fs.readFileSync(
      path.join(WURZEL, 'src/shared/markdown', 'perspective-chart-ref.js'),
      'utf8',
    );
    expect(ref).not.toMatch(/require\(/);
  });
});

describe('perspective-chart — Container der Zaun-Regel (AK4)', () => {
  it('trägt Index, Zeilenbereich und den maskierten Block', () => {
    const html = renderChartContainer('title: <b> & "x"', { index: 2, lineStart: 5, lineEnd: 8 });
    expect(html).toBe(
      '<div class="perspective-chart" data-chart-index="2" data-chart-line-start="5" ' +
        'data-chart-line-end="8" data-source-line="5" ' +
        'data-chart-source="title: &lt;b&gt; &amp; &quot;x&quot;"></div>\n',
    );
  });
});
