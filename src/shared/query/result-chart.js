'use strict';

// 4T-002172 (Epic 3E-000337): Diagramm-Form der Ergebnismenge. Das Modul
// beantwortet eine Frage: ob eine Tabellen-Abfrage ein Diagramm trägt und wie
// aus ihrer Ergebnismenge (Vertrag in result-set.js) die zeichenbare Form des
// gemeinsamen Zeichners wird. Eignung und Bild nutzen dieselbe Regel, damit sie
// nie auseinanderlaufen (Entscheidung S1 des Epics).
//
// **Die Datenregel** (Entscheidungen F5 und F6, jeweils Option A, und S7): Das
// Diagramm zeigt, was die angezeigte Tabelle zeigt
// (src/renderer/modules/query/display-list-table.js).
//   - Beschriftung einer Rubrik ist die erste Spalte der Tabelle: der Name des
//     Treffers aus derselben Quelle wie der Treffer-Link (`displayName`), mit
//     `WITHOUT ID` der Wert der ersten genannten Spalte, die dann keine Reihe
//     ist. In einer gruppierten Tabelle ist jede Gruppe der untersten Stufe eine
//     Rubrik, beschriftet mit ihrem Gruppen-Wert; bei mehreren Stufen sind die
//     Werte der Stufen mit « › » verbunden (Vorbild: der Pfad einer
//     Kind-Definition in settings-profiles.js). Die Gruppe ohne Wert trägt den
//     Text, den der Aufrufer nennt, wie die Tabelle `query.group.none`.
//   - Jede weitere Spalte mit mindestens einer Zahl ist eine Reihe mit der
//     Spalten-Überschrift als Name. Zahl ist ein Wert der Art `number` mit
//     endlichem Wert oder ein Text, den die Abfrage selbst als Zahl liest
//     (`coerceNumber` in query-format.js: nur Ziffern, wahlweise mit Minus und
//     Dezimalpunkt). 4T-002173: Kopf-Eigenschaften kommen aus dem Index als Text
//     an («seiten: 80» ist der Text «80»); Vergleich, Sortierung und Summe lesen
//     sie als Zahl, und das Diagramm liest sie ebenso. Datum, Dauer,
//     Wahrheitswert, Verweis, Hervorhebung, Liste und jeder andere Text sind
//     keine Zahl. Jeder andere Wert in einer Reihe, auch ein fehlender, ist eine
//     Lücke (`null`) und wird gezählt.
//   - Eine Spalte ohne jede Zahl ist keine Reihe; sie wird übergangen und mit
//     ihrer Überschrift genannt.
//
// **Grund-Codes der Eignung**, in fester Prüf-Reihenfolge, der erste gilt:
//   `not-table`     die Abfrage ist eine Liste und keine Tabelle
//   `empty`         die Tabelle hat keine Zeile
//   `single-column` die Tabelle hat neben der Beschriftung keine Spalte
//   `no-numbers`    keine Spalte neben der Beschriftung trägt eine Zahl
//
// Prozess-neutral und ohne Zeichen-Bibliothek: Der Anzeige-Prozess lädt das
// Modul für die Eignungs-Prüfung, und ein Bezug auf den Zeichner zöge die
// Bibliothek in sein Bündel (Wächter in test/unit/renderer/diagramm-ansicht.test.js).
// Gezeichnet wird die fertige Form über die Brücke (src/main/preload-diagramme.js).
// Die Vorlese-Beschreibung setzt die Brücke aus den vorhandenen Texten zusammen
// (Entscheidung S9); hier entsteht kein Text außer den Beschriftungen.

const { valueTypeOf } = require('./result-set.js');
const { columnHeader, displayName, walkGroups } = require('./result-display.js');
const { coerceNumber, formatValue } = require('./query-format.js');

// Balken und Linie; Kreis und Donut bleiben in der ersten Fassung draußen
// (F1 Option A im Plan von 3E-000260).
const QUERY_CHART_TYPES = Object.freeze(['bar', 'line']);

const QUERY_CHART_REASONS = Object.freeze(['not-table', 'empty', 'single-column', 'no-numbers']);

const GROUP_LEVEL_SEPARATOR = ' › ';

// Die Zahl eines Wertes nach der Lesart der Abfrage, sonst null. Ein
// Wahrheitswert liest `coerceNumber` als 1 oder 0; er bleibt hier ausgenommen.
function numberOf(v) {
  const art = valueTypeOf(v);
  if (art === 'number') return Number.isFinite(v) ? v : null;
  return art === 'string' ? coerceNumber(v) : null;
}

function isNumber(v) {
  return numberOf(v) !== null;
}

// Die Rubriken der Tabelle mit ihren Werten je Spalte: ungruppiert je Zeile,
// gruppiert je Gruppe der untersten Stufe samt der Gruppen-Werte aller Stufen
// (Durchlauf wie in `buildGroupedTableDom`).
function entriesOf(rs) {
  if (!Array.isArray(rs.groups)) {
    return rs.rows.map((row) => ({ origin: row.origin, chain: null, values: row.values }));
  }
  const entries = [];
  walkGroups(
    rs,
    (group, _level, path) => {
      const chain = [...path, group.value];
      if (!Array.isArray(group.groups)) {
        entries.push({
          origin: null,
          chain,
          values: Array.isArray(group.values) ? group.values : [],
        });
      }
      return chain;
    },
    [],
  );
  return entries;
}

function valueAt(entry, j) {
  const v = entry.values[j];
  return v === undefined ? null : v;
}

// Die gemeinsame Regel für Eignung und Bild: Grund oder die geordneten Rubriken
// samt den Spalten-Indizes der Reihen und der übergangenen Spalten.
function analyse(rs) {
  if (!rs || typeof rs !== 'object' || !Array.isArray(rs.rows) || !Array.isArray(rs.columns)) {
    throw new TypeError('result-chart: keine Ergebnismenge mit rows und columns');
  }
  if (rs.type !== 'table') return { reason: 'not-table' };
  const withoutId = !!(rs.wishes && rs.wishes.withoutId);
  // Leer heißt: keine Rubrik; ohne Zeile hat auch eine gruppierte Menge keine Gruppe.
  const entries = entriesOf(rs);
  if (entries.length === 0) return { reason: 'empty' };
  // Mit WITHOUT ID ist die erste genannte Spalte die Beschriftung und keine Reihe.
  const candidates = rs.columns.map((_, j) => j).slice(withoutId ? 1 : 0);
  if (candidates.length === 0) return { reason: 'single-column' };
  const seriesIdx = [];
  const skippedIdx = [];
  for (const j of candidates) {
    (entries.some((e) => isNumber(valueAt(e, j))) ? seriesIdx : skippedIdx).push(j);
  }
  if (seriesIdx.length === 0) return { reason: 'no-numbers' };
  return { reason: null, withoutId, entries, seriesIdx, skippedIdx };
}

/**
 * Trägt die Ergebnismenge ein Diagramm? Dieselbe Regel wie `buildQueryChartInput`.
 * @param {import('./result-set.js').ResultSet} resultSet
 * @returns {{ suitable: boolean, reason: string|null }}  `reason` einer der
 *   Grund-Codes aus `QUERY_CHART_REASONS`, bei Eignung null
 * @throws {TypeError} wenn die Menge keine Zeilen- und Spalten-Liste trägt
 */
function queryChartSuitability(resultSet) {
  const { reason } = analyse(resultSet);
  return { suitable: reason === null, reason };
}

/**
 * Bildet aus der Ergebnismenge die zeichenbare Form des gemeinsamen Zeichners.
 * @param {import('./result-set.js').ResultSet} resultSet
 * @param {{ type: 'bar'|'line', title?: string|null, noneLabel: string }} options
 *   `noneLabel` ist der Text der Gruppe ohne Wert (in der Anzeige
 *   `query.group.none`), damit Tabelle und Diagramm dieselbe Beschriftung zeigen.
 * @returns {{ drawable: true, type: string, title: string|null, categories: string[],
 *     series: Array<{ name: string, values: Array<number|null> }>, omitted: number,
 *     skippedColumns: string[] }
 *   | { drawable: false, reason: string }}
 *   `omitted` zählt die Lücken aller Reihen, `skippedColumns` nennt die
 *   übergangenen Spalten mit ihrer Überschrift in Spalten-Reihenfolge.
 * @throws {TypeError} bei fehlenden Angaben, unbekannter Art, unbrauchbarem
 *   Titel oder fehlendem `noneLabel` — Programmier-Fehler des Aufrufers, kein
 *   Anwender-Fall
 */
function buildQueryChartInput(resultSet, options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('result-chart: options ist kein Objekt');
  }
  const opts = options;
  if (!QUERY_CHART_TYPES.includes(opts.type)) {
    throw new TypeError(`result-chart: unbekannte Art ${JSON.stringify(opts.type)}`);
  }
  const title = opts.title === undefined ? null : opts.title;
  if (title !== null && typeof title !== 'string') {
    throw new TypeError('result-chart: title ist weder Text noch null');
  }
  if (typeof opts.noneLabel !== 'string') {
    throw new TypeError('result-chart: noneLabel fehlt');
  }
  const a = analyse(resultSet);
  if (a.reason !== null) return { drawable: false, reason: a.reason };

  const label = (entry) => {
    if (a.withoutId) {
      const v = valueAt(entry, 0);
      return v === null ? '' : formatValue(v);
    }
    if (entry.chain === null) return displayName(entry.origin);
    return entry.chain
      .map((v) => (v === null || v === undefined ? opts.noneLabel : formatValue(v)))
      .join(GROUP_LEVEL_SEPARATOR);
  };
  const series = a.seriesIdx.map((j) => ({
    name: columnHeader(resultSet.columns[j]),
    values: a.entries.map((e) => {
      return numberOf(valueAt(e, j));
    }),
  }));
  return {
    drawable: true,
    type: opts.type,
    title,
    categories: a.entries.map(label),
    series,
    omitted: series.reduce((n, s) => n + s.values.filter((v) => v === null).length, 0),
    skippedColumns: a.skippedIdx.map((j) => columnHeader(resultSet.columns[j])),
  };
}

module.exports = {
  QUERY_CHART_TYPES,
  QUERY_CHART_REASONS,
  GROUP_LEVEL_SEPARATOR,
  queryChartSuitability,
  buildQueryChartInput,
};
