// 4T-002019 (Epic 3E-000192): Diagramm zu einer Datentabelle — Bildung der
// Datenreihen aus der Tabelle und Ermittlung des Grundes, aus dem ein Diagramm
// nicht zeichenbar ist.
//
// Schwester-Modul des Kerns perspective-chart.js und Blatt der Familie: Es lädt
// kein Modul der eigenen Familie und wird in der Familie ausschließlich vom
// Kern geladen (Import-Graph Kern -> hier); von außerhalb liest seit 4T-002024
// allein der Formular-Kern des Dialogs `makeLabelText`. Prozess-neutral: kein
// DOM, kein Electron, kein Datei-Zugriff. Aus der Datentabellen-Familie liest es allein die Werte, die
// die Tabelle selbst zeigt — berechnete Spalten über computeComputedCells, die
// Anzeige-Texte über formatCellDisplay —, damit Diagramm und Tabelle dieselben
// Zahlen und Beschriftungen tragen.
//
// Eingabe ist das Modell der Angaben (parseChartSpec im Kern) und das fehlerfreie
// Modell der Datentabelle (parsePerspectiveDatatable). Die Aggregat-Zeile steht
// dort im Feld `aggregates`, getrennt von `rows`; gelesen werden allein die
// Zeilen, deshalb ist sie weder Reihe noch Rubrik.
//
// Ausgabe ist der Eingabe-Vertrag des gemeinsamen Zeichners; er kennt weder
// Tabelle noch Datenbank:
//   zeichenbar:       { drawable: true, type, title, categories, series, omitted }
//                     series = [{ name, values: (number|null)[] }], null = Lücke
//   nicht zeichenbar: { drawable: false, reason, detail, missingKey }
//                     missingKey = Name einer Angabe des Diagramms, die fehlt
//                     oder deren Wert unbekannt ist (`labels`, `values`, `rows`,
//                     `series`), dann detail = null; sonst missingKey = null und
//                     detail trägt die beanstandete Nennung oder den Anlass.
//                     Getrennte Felder, weil eine Spalte selbst `labels` heißen
//                     kann (4T-002022).
'use strict';

const {
  dataIndexByColumn,
  computeComputedCells,
  makeCellValueResolver,
} = require('./perspective-datatable-computed.js');
const { formatCellDisplay } = require('./perspective-datatable-view.js');

// Die Gründe in der festen Prüf-Reihenfolge der Anforderung: Liegen mehrere
// zugleich vor, gilt der erste. `document-missing` entsteht erst mit der
// Auflösung in einem anderen Dokument und steht hier, damit die Reihenfolge an
// einer Stelle vollständig ist.
const CHART_REASONS = Object.freeze([
  'document-missing',
  'table-missing',
  'table-other-kind',
  'table-invalid',
  'selection-invalid',
  'values-not-numeric',
  'no-numbers',
  'type-unsupported',
]);

const CHART_TYPES = Object.freeze(['line', 'bar', 'pie', 'donut']);
const SERIES_MODES = Object.freeze(['columns', 'rows']);

function notDrawable(reason, detail, missingKey) {
  return {
    drawable: false,
    reason,
    detail: detail == null ? null : String(detail),
    missingKey: missingKey == null ? null : String(missingKey),
  };
}

// Eine Angabe des Diagramms fehlt oder ihr Wert ist unbekannt.
function keyMissing(key) {
  return { error: notDrawable('selection-invalid', null, key) };
}

// Die Überschrift, die die Tabelle in ihrem Spaltenkopf anzeigt: der eigene
// Anzeigetext, sonst die Kennung.
function columnHeading(col) {
  return col.label || col.name;
}

// Spalten werden über ihre Kennung genannt, ohne Rücksicht auf Groß- und
// Kleinschreibung — dieselbe Zuordnung wie in den Aggregaten der Datentabelle.
function findColumnIndex(columns, name) {
  const key = String(name).trim().toLowerCase();
  return columns.findIndex((c) => c.name.toLowerCase() === key);
}

// Liest die Werte-Spalten einer Angabe. Liefert die Spalten-Indizes oder den
// Grund «Spalte fehlt oder ist mehrdeutig» samt der beanstandeten Nennung.
//
// 4T-002026 (Entscheidung der steuernden Sitzung vom 2026-09-30): Ist die als
// Werte genannte Spalte die Beschriftungs-Spalte und keine Zahl-Spalte, wird
// sie hier angenommen; der folgende Grund «keine Zahl-Spalte» nennt dann den
// zutreffenden Grund, statt «fehlt» zu behaupten. Eine Zahl-Spalte als
// Beschriftungs- und Werte-Spalte zugleich bleibt «nicht eindeutig».
function pickValueColumns(columns, names, labelIdx) {
  const picked = [];
  for (const name of names) {
    const idx = findColumnIndex(columns, name);
    const beschriftungAlsZahl = idx === labelIdx && columns[idx].type === 'number';
    if (idx < 0 || beschriftungAlsZahl || picked.includes(idx)) {
      return { error: notDrawable('selection-invalid', name) };
    }
    picked.push(idx);
  }
  return { indices: picked };
}

// Ermittelt die Auswahl aus Beschriftungs-Spalte, Werte-Spalten und — bei Reihen
// aus Zeilen — den genannten Zeilen. Prüft alles, was zum Grund «Spalte oder
// Zeile fehlt oder ist mehrdeutig» gehört, vollständig vor dem nächsten Grund.
function resolveSelection(spec, model, labelText) {
  const { columns, rows } = model;
  if (!spec.labels) return keyMissing('labels');
  const labelIdx = findColumnIndex(columns, spec.labels);
  if (labelIdx < 0) return { error: notDrawable('selection-invalid', spec.labels) };
  const mode = spec.series == null ? 'columns' : spec.series;
  if (!SERIES_MODES.includes(mode)) return keyMissing('series');

  let valueIdx;
  if (spec.values && spec.values.length > 0) {
    const r = pickValueColumns(columns, spec.values, labelIdx);
    if (r.error) return r;
    valueIdx = r.indices;
  } else if (mode === 'rows') {
    // Ohne Nennung sind es bei Reihen aus Zeilen alle Zahl-Spalten der Tabelle
    // außer der Beschriftungs-Spalte, die nie als Werte gezeichnet wird.
    valueIdx = [];
    columns.forEach((c, i) => {
      if (c.type === 'number' && i !== labelIdx) valueIdx.push(i);
    });
  } else {
    return keyMissing('values');
  }

  let rowIdx = null;
  if (mode === 'rows') {
    if (!spec.rows || spec.rows.length === 0) {
      return keyMissing('rows');
    }
    rowIdx = [];
    for (const entry of spec.rows) {
      const hits = [];
      rows.forEach((row, i) => {
        if (labelText(row, labelIdx) === entry) hits.push(i);
      });
      if (hits.length !== 1 || rowIdx.includes(hits[0])) {
        return { error: notDrawable('selection-invalid', entry) };
      }
      rowIdx.push(hits[0]);
    }
  }

  // Reihenfolge des Dokuments: Spalten in der Reihenfolge der Tabelle, Zeilen
  // in der Reihenfolge der Zeilen — unabhängig von der Reihenfolge der Nennung.
  valueIdx.sort((a, b) => a - b);
  if (rowIdx) rowIdx.sort((a, b) => a - b);
  return { mode, labelIdx, valueIdx, rowIdx };
}

// Grund 8: Kreis und Donut tragen genau eine Reihe aus nicht-negativen Werten,
// von denen nicht alle null sind.
function typeProblem(type, series) {
  if (type == null) return 'missing-type';
  if (!CHART_TYPES.includes(type)) return 'unknown-type';
  if (type !== 'pie' && type !== 'donut') return null;
  if (series.length > 1) return 'multiple-series';
  const numbers = series[0].values.filter((v) => v !== null);
  if (numbers.some((v) => v < 0)) return 'negative';
  if (numbers.every((v) => v === 0)) return 'zeros';
  return null;
}

// Der Eintrag einer Zelle, wie die Tabelle ihn zeigt: bei einer Fehler-Zelle
// der geschriebene Rohtext, sonst der Anzeige-Text ihres Wertes. Über diesen
// Eintrag nennt der Block eine Zeile; `computed` stammt aus
// computeComputedCells(model).
//
// 4T-002024: als Fabrik exportiert, weil sie über Modell und berechnete Werte
// schließt. Der Formular-Kern (src/shared/charts/chart-form.js) bietet die
// Zeilen über denselben Eintrag an, über den sie hier gefunden werden.
function makeLabelText(model, computed) {
  const dataIdx = dataIndexByColumn(model.columns);
  return (row, colIdx) => {
    const col = model.columns[colIdx];
    const di = dataIdx[colIdx];
    if (di != null) {
      const cell = row[di];
      if (!cell) return '';
      return cell.error ? cell.text : formatCellDisplay(col, cell.value);
    }
    const perCol = computed.get(row);
    const comp = perCol ? perCol[colIdx] : null;
    return comp && !comp.error ? formatCellDisplay(col, comp.value) : '';
  };
}

// Bildet aus Angaben und fehlerfreiem Tabellen-Modell das Ergebnis für den
// Zeichner oder den Grund, aus dem das Diagramm nicht zeichenbar ist. Die
// Gründe vor `selection-invalid` (Tabelle fehlt, anderer Art, fehlerhaft)
// prüft der Kern bei der Auflösung; hier beginnt die Reihenfolge danach.
function buildChartSeries(spec, model) {
  const computed = computeComputedCells(model);
  const valueOf = makeCellValueResolver(model, computed);
  const labelText = makeLabelText(model, computed);
  // Leere Zellen und Fehler-Zellen sind Lücken der Reihe.
  const numberAt = (row, colIdx) => {
    const v = valueOf(row, colIdx);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const sel = resolveSelection(spec, model, labelText);
  if (sel.error) return sel.error;

  const nonNumeric = sel.valueIdx.find((i) => model.columns[i].type !== 'number');
  if (nonNumeric !== undefined) {
    return notDrawable('values-not-numeric', model.columns[nonNumeric].name);
  }

  let categories;
  let series;
  if (sel.mode === 'columns') {
    categories = model.rows.map((row) => labelText(row, sel.labelIdx));
    series = sel.valueIdx.map((ci) => ({
      name: columnHeading(model.columns[ci]),
      values: model.rows.map((row) => numberAt(row, ci)),
    }));
  } else {
    categories = sel.valueIdx.map((ci) => columnHeading(model.columns[ci]));
    series = sel.rowIdx.map((ri) => ({
      name: labelText(model.rows[ri], sel.labelIdx),
      values: sel.valueIdx.map((ci) => numberAt(model.rows[ri], ci)),
    }));
  }

  const all = series.flatMap((s) => s.values);
  if (!all.some((v) => v !== null)) return notDrawable('no-numbers', null);

  const problem = typeProblem(spec.type, series);
  if (problem) return notDrawable('type-unsupported', problem);

  return {
    drawable: true,
    type: spec.type,
    title: spec.title || null,
    categories,
    series,
    omitted: all.filter((v) => v === null).length,
  };
}

module.exports = {
  CHART_REASONS,
  CHART_TYPES,
  SERIES_MODES,
  notDrawable,
  makeLabelText,
  buildChartSeries,
};
