// 4T-002024 (Epic 3E-000192): Diagramm einfügen und bearbeiten — Formular-Kern
// des Dialogs. Prozess-neutral: kein DOM, kein Editor, kein Electron.
//
// Das Modul sagt, WAS der Dialog anbieten darf, und hält jeden Formular-Stand
// gültig: Fehleingaben sind konstruktiv unmöglich statt abgewiesen
// (Entwicklungsrichtlinien, Kapitel 10). Maßstab ist allein der Format-Kern:
// Jeder Stand, den normalizeChartForm liefert, ergibt einen Block, den
// `buildChartInputInDocument` ohne einen der Gründe «Spalte oder Zeile fehlt»,
// «Spalte ohne Zahlen» oder «mehrere Reihen bei Kreis und Donut» auflöst. Was
// an den Daten selbst hängt (keine einzige Zahl, negative Werte oder lauter
// Nullen bei Kreis und Donut), kann ein Formular nicht verhindern; das zeigt
// das Diagramm als Hinweis.
//
// Angebot (Rückgabe von buildChartOffer):
//   {
//     columns:  [{ name, heading, kind, computed, writable }]
//               kind 'number' | 'text' | 'other' nach dem deklarierten Typ, auch
//               bei berechneten Spalten; writable = die Kennung übersteht die
//               Schreibweise des Blocks unverändert
//     rowCount: Zahl der Zeilen (ohne Aggregat-Zeile)
//     entries:  string[][]  je Spalte der Eintrag jeder Zeile, wie die Tabelle
//               ihn zeigt (makeLabelText aus dem Reihen-Modul)
//     entryWritable: boolean[][]  parallel dazu: der Eintrag übersteht die
//               Schreibweise der Angabe `rows:` unverändert
//   }
//
// Formular-Stand:
//   {
//     type:   'line' | 'bar' | 'pie' | 'donut'
//     series: 'columns' | 'rows'
//     labels: Kennung der Beschriftungs-Spalte, wie die Tabelle sie schreibt
//     values: string[] | null  bei Spalten die Werte-Spalten (nie leer); bei
//             Zeilen null = alle Zahl-Spalten, ohne Auswahl; sonst die aus dem
//             Block übernommene Auswahl, auch wenn sie alle umfasst
//     rows:   string[] | null  bei Zeilen die Einträge der Zeilen (nie leer);
//             bei Spalten null
//     title:  string           '' = kein Titel
//   }
// Listen stehen in der Reihenfolge des Dokuments, wie der Kern sie zeichnet.
'use strict';

const { computeComputedCells } = require('../markdown/perspective-datatable-computed.js');
const {
  CHART_TYPES,
  SERIES_MODES,
  parseChartSpec,
  serializeChartSpec,
} = require('../markdown/perspective-chart.js');
const { makeLabelText } = require('../markdown/perspective-chart-series.js');

// Gründe, aus denen zu einer Tabelle kein Diagramm entstehen kann.
const CHART_FORM_REASONS = Object.freeze([
  'table-invalid', //     die Tabelle trägt einen Fehler im Aufbau
  'no-number-column', //  keine Zahl-Spalte
  'no-series', //         Zahl-Spalten, aber keine wählbare Reihe
]);

const DEFAULT_TYPE = 'bar';
const SINGLE_SERIES_TYPES = Object.freeze(['pie', 'donut']);

function columnKind(col) {
  if (col.type === 'number') return 'number';
  return col.type === 'text' ? 'text' : 'other';
}

function sameName(a, b) {
  return a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();
}

// Übersteht der Wert den Weg durch die Schreibweise des Blocks unverändert?
// Eine Liste wird doppelt geschrieben, damit auch ein Eintrag scheitert, der
// erst vor einem Trenner kippt (etwa ein Eintrag mit `\` am Ende).
function survivesBlock(key, value) {
  const spec = parseChartSpec('');
  spec[key] = Array.isArray(value) ? [value[0], value[0]] : value;
  const back = parseChartSpec(serializeChartSpec(spec))[key];
  return JSON.stringify(back) === JSON.stringify(spec[key]);
}

// --- Angebot --------------------------------------------------------------------

function buildChartOffer(model) {
  const computed = computeComputedCells(model);
  const labelText = makeLabelText(model, computed);
  const entries = model.columns.map((col, ci) => model.rows.map((row) => labelText(row, ci)));
  const checked = new Map();
  const writable = (entry) => {
    if (!checked.has(entry)) checked.set(entry, survivesBlock('rows', [entry]));
    return checked.get(entry);
  };
  return {
    columns: model.columns.map((col) => ({
      name: col.name,
      heading: col.label || col.name,
      kind: columnKind(col),
      computed: col.expr != null,
      writable: survivesBlock('labels', col.name) && survivesBlock('values', [col.name]),
    })),
    rowCount: model.rows.length,
    entries,
    entryWritable: entries.map((list) => list.map(writable)),
  };
}

function columnIndex(offer, name) {
  return offer.columns.findIndex((c) => sameName(c.name, name));
}

// Die wählbaren Werte-Spalten bei gegebener Beschriftungs-Spalte: Zahl-Spalten,
// berechnete eingeschlossen, ohne die Beschriftungs-Spalte.
function valueColumnChoices(offer, labels) {
  return offer.columns
    .filter((c) => c.kind === 'number' && c.writable && !sameName(c.name, labels))
    .map((c) => c.name);
}

// Die wählbaren Zeilen bei gegebener Beschriftungs-Spalte: Zeilen mit nicht
// leerem, eindeutigem Eintrag. `skipped` zählt die übrigen.
function rowChoices(offer, labels) {
  const ci = columnIndex(offer, labels);
  if (ci < 0) return { rows: [], skipped: offer.rowCount };
  const list = offer.entries[ci];
  const count = new Map();
  for (const e of list) count.set(e, (count.get(e) || 0) + 1);
  const rows = [];
  list.forEach((entry, row) => {
    if (entry !== '' && count.get(entry) === 1 && offer.entryWritable[ci][row]) {
      rows.push({ entry, row });
    }
  });
  return { rows, skipped: list.length - rows.length };
}

// Bliebe bei dieser Richtung und Beschriftungs-Spalte keine Datenreihe übrig?
// Bei Zeilen braucht es wählbare Zeilen und mindestens eine Zahl-Spalte für
// die Rubriken.
function modeEmpty(offer, mode, labels) {
  if (valueColumnChoices(offer, labels).length === 0) return true;
  return mode === 'rows' && rowChoices(offer, labels).rows.length === 0;
}

// Die Beschriftungs-Spalten mit Sperre: gesperrt, wenn keine Datenreihe übrig
// bliebe oder die Kennung nicht schreibbar ist.
function labelChoices(offer, series) {
  return offer.columns.map((c) => ({
    name: c.name,
    locked: !c.writable || modeEmpty(offer, series, c.name),
  }));
}

// Die beiden Richtungen mit Sperre: gesperrt, wenn keine Beschriftungs-Spalte
// sie trägt.
function seriesModeChoices(offer) {
  return SERIES_MODES.map((mode) => ({
    mode,
    locked: labelChoices(offer, mode).every((c) => c.locked),
  }));
}

// Kann zu dieser Tabelle überhaupt ein Diagramm entstehen? null oder ein Grund
// aus CHART_FORM_REASONS.
function chartUnavailableReason(model, offer) {
  if (model.errors && model.errors.length > 0) return 'table-invalid';
  if (!model.columns.some((c) => c.type === 'number')) return 'no-number-column';
  const o = offer || buildChartOffer(model);
  return seriesModeChoices(o).every((m) => m.locked) ? 'no-series' : null;
}

// --- Formular-Stand -------------------------------------------------------------

function singleSeries(type) {
  return SINGLE_SERIES_TYPES.includes(type);
}

// Die Beschriftungs-Spalte: die gewünschte, wenn sie nicht gesperrt ist, sonst
// die erste freie Nicht-Zahl-Spalte, sonst die erste freie Spalte.
function pickLabels(offer, series, wanted) {
  const free = labelChoices(offer, series).filter((c) => !c.locked);
  const hit = free.find((c) => sameName(c.name, wanted));
  if (hit) return hit.name;
  const text = free.find((c) => offer.columns[columnIndex(offer, c.name)].kind !== 'number');
  return (text || free[0]).name;
}

// Die gewählten Einträge aus `choices`, in deren Reihenfolge.
function keepChosen(choices, wanted, same) {
  const list = Array.isArray(wanted) ? wanted : [];
  return choices.filter((c) => list.some((w) => same(c, w)));
}

function cleanTitle(title) {
  return String(title == null ? '' : title)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

// Macht aus einem beliebigen Stand einen gültigen. `emptyAs` sagt, was eine
// leer gewordene Reihen-Auswahl füllt: 'all' alle wählbaren Reihen, 'first' die
// erste; bei Kreis und Donut ist es immer genau eine. null, wenn zur Tabelle
// kein Diagramm entstehen kann (chartUnavailableReason).
function normalizeChartForm(offer, form, emptyAs = 'all') {
  const f = form || {};
  const type = CHART_TYPES.includes(f.type) ? f.type : DEFAULT_TYPE;
  const modes = seriesModeChoices(offer).filter((m) => !m.locked);
  if (modes.length === 0) return null;
  const series = (modes.find((m) => m.mode === f.series) || modes[0]).mode;
  const labels = pickLabels(offer, series, f.labels);
  const title = cleanTitle(f.title);
  const fill = (choices, chosen) => {
    const list = chosen.length > 0 ? chosen : emptyAs === 'first' ? [] : choices;
    const out = list.length > 0 ? list : choices.slice(0, 1);
    return singleSeries(type) ? out.slice(0, 1) : out.slice();
  };
  const valueChoices = valueColumnChoices(offer, labels);
  const values = keepChosen(valueChoices, f.values, sameName);
  if (series === 'columns') {
    return { type, series, labels, values: fill(valueChoices, values), rows: null, title };
  }
  const entries = rowChoices(offer, labels).rows.map((r) => r.entry);
  const rows = fill(
    entries,
    keepChosen(entries, f.rows, (a, b) => a === b),
  );
  // Bei Zeilen heißt null «alle Zahl-Spalten» und entsteht nur ohne Auswahl.
  // Eine genannte Liste bleibt eine Liste, auch wenn sie alle umfasst: Sonst
  // verlöre ein unverändert bestätigter Block seine Zeile `values:`, und eine
  // später ergänzte Zahl-Spalte erschiene ungefragt im Diagramm (Durchsicht
  // vom 2026-09-30).
  return { type, series, labels, values: values.length === 0 ? null : values, rows, title };
}

// Stand nach einer Änderung im Dialog. Ein Wechsel der Richtung verwirft die
// Reihen-Auswahl der alten: Spalten -> Zeilen entfernt `values`, zurück
// entfernt `rows`.
function updateChartForm(offer, form, patch) {
  const next = { ...form, ...patch };
  if (patch && patch.series !== undefined && patch.series !== form.series) {
    next.values = null;
    next.rows = null;
  }
  return normalizeChartForm(offer, next);
}

// Vorbelegung beim Einfügen: Balken, Reihen aus Spalten, erste Nicht-Zahl-Spalte
// als Beschriftung (fehlt sie, die erste Spalte), alle wählbaren Zahl-Spalten.
function insertFormDefaults(offer) {
  return normalizeChartForm(offer, {
    type: DEFAULT_TYPE,
    series: 'columns',
    labels: null,
    values: null,
    rows: null,
    title: '',
  });
}

// Vorbelegung beim Bearbeiten aus dem Modell des Blocks (parseChartSpec).
// Ungültige Nennungen fallen weg; bleibt keine gültige Reihe, ist es die erste
// mögliche.
function editFormFromSpec(offer, spec) {
  return normalizeChartForm(
    offer,
    {
      type: spec.type,
      series: spec.series === 'rows' ? 'rows' : 'columns',
      labels: spec.labels,
      values: spec.values,
      rows: spec.rows,
      title: spec.title || '',
    },
    'first',
  );
}

// Gleiche Liste ohne Rücksicht auf die Reihenfolge?
function sameList(a, b, same) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const rest = [...b];
  return a.every((x) => {
    const i = rest.findIndex((y) => same(x, y));
    if (i < 0) return false;
    rest.splice(i, 1);
    return true;
  });
}

// Modell für serializeChartSpec aus dem Formular-Stand. `spec` ist das Modell
// des Blocks beim Bearbeiten, beim Einfügen fehlt es. Was der Stand nicht
// ändert, bleibt im Wortlaut des Blocks (andere Schreibweise einer Kennung,
// andere Reihenfolge einer Liste); `series: columns` entsteht nur, wenn die
// Zeile im Block schon stand; ein leerer Titel entfernt die Zeile.
function chartSpecFromForm(form, spec) {
  const base = spec || parseChartSpec('');
  const hadSeries = (base.lines || []).some((l) => l.key === 'series');
  const exact = (a, b) => a === b;
  const list = (now, before, same) => {
    if (now == null) return null;
    return sameList(before, now, same) ? before : now.slice();
  };
  return {
    ...base,
    type: form.type,
    series: form.series === 'rows' ? 'rows' : hadSeries ? 'columns' : null,
    labels: sameName(base.labels, form.labels) ? base.labels : form.labels,
    values: list(form.values, base.values, sameName),
    rows: form.series === 'rows' ? list(form.rows, base.rows, exact) : null,
    title: form.title === '' ? null : form.title,
  };
}

module.exports = {
  CHART_FORM_REASONS,
  buildChartOffer,
  valueColumnChoices,
  rowChoices,
  labelChoices,
  seriesModeChoices,
  chartUnavailableReason,
  // Für den Dialog: Kreis und Donut zeigen Radio-Knöpfe statt Kästchen, ohne
  // die Regel dort ein zweites Mal zu führen.
  singleSeries,
  normalizeChartForm,
  updateChartForm,
  insertFormDefaults,
  editFormFromSpec,
  chartSpecFromForm,
};
