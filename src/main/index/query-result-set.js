// 4T-002033 (Epic 3E-000260): Zeilen-Bau der Perspective-Abfrage. Das Modul
// beantwortet eine Frage: wie aus den ausgewerteten Treffer-Kontexten einer
// Abfrage die Antwort an die Anzeige entsteht. Es baut die Ergebnismenge nach
// dem Format-Vertrag (`src/shared/query/result-set.js`, 4T-002032) mit rohen
// Werten, Herkunft je Zeile, Gruppen als Struktur über den Zeilen,
// Darstellungs-Wünschen und Zustand.
//
// Die Antwort des Erzeugers ist seit 4T-002035 allein `{ resultSet }`: Der
// Übergangs-Zustand aus 4T-002033 (Festlegung 1 des Epics), in dem daneben die
// bisherigen Felder standen (`files`, `table`, `groups`, `taskLayout`,
// `layoutColumns`, `totalCount`, `hint`, `meta`, `queryType`, `queryScope`,
// `queryError`, `status`), ist beendet. Auch der Zustand steht nur noch in der
// Menge (`resultSet.state`), damit es eine Quelle der Wahrheit gibt. Die
// Anzeige-Regeln (Überschrift, Anzeige-Stücke, Anzeige-Name, gerundete
// Dringlichkeit, Gruppen-Beschriftung) stehen im Darstellungs-Kern
// `src/shared/query/result-display.js`, den die Darstellungen und die
// Hintergrund-Nutzer rufen.
//
// Herausgelöst aus `query.js`, damit dort `frontmatterQueryFor` die eine
// Fachlichkeit «auswerten» behält; die Gruppen-Bildung der Aufgaben-Ausgabe
// zieht aus `query-task-helfer.js` mit hierher, weil Gruppen seither eine
// Struktur über der Zeilen-Liste sind und zum Zeilen-Bau gehören.
//
// Prozess-neutral bis auf die geteilten Abfrage-Bausteine; kein Electron-Zugriff.

'use strict';

const {
  evaluateExpression,
  // Werte-Ordnung der Gruppen-Reihenfolge (4T-000503).
  orderForSort,
} = require('../../shared/query/perspective-query-eval.js');
const {
  formatValue,
  formatExprSource,
  isRecordRef,
} = require('../../shared/query/query-format.js');
const { resolveRecordField } = require('../../shared/query/query-record-fields.js');
// 4T-002078 (Epic 3E-000259): Werte über der Gruppe und Reihenfolge der
// gruppierten Tabelle.
const { isGroupedTable } = require('../../shared/query/query-functions.js');
const {
  containsAggregate,
  aggregateGroups,
  havingGroups,
} = require('../../shared/query/query-aggregate.js');
const {
  uniformValueType,
  makeColumn,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
  makeTaskInfo,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
} = require('../../shared/query/result-set.js');

// --- Ergebnismenge ---------------------------------------------------------------

// Ein ausgewerteter Wert in der Form des Werte-Raums: `undefined` wird zu
// «fehlend» (null), Listen werden kopiert, damit die Menge keine Liste des
// Index teilt (Frontmatter-, Block- und Tag-Listen kommen als Referenz aus dem
// Index). Die Anzeige-Stücke eines fehlenden Werts sind in beiden Fällen leer,
// die abgeleitete alte Form bleibt dadurch gleich.
function toFormatValue(v) {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(toFormatValue);
  return v;
}

// Herkunft je Ebene aus dem Treffer-Kontext (heute toHit): der absolute
// Index-Pfad und der logische Datei-Name, beim Block der Anker, bei der
// Aufgabe Zeilennummer und Roh-Zeile.
//
// 4T-002039 (Epic 3E-000258): Die Datensatz-Herkunft trägt Tabelle und Kennung
// nach dem Vertrag, dazu additiv (E8.5, Festlegung 10 des Epics) den Pfad der
// Kopf-Datei und die Anzeige-Form des Datensatzes (getrimmt, null ohne sie).
function originOf(ctx, scope) {
  if (scope === 'records') {
    const { table, id, path, display } = ctx.record;
    return { ...recordOrigin(table, id), path, display };
  }
  const { absPath, name } = ctx.file;
  if (scope === 'blocks') return blockOrigin(absPath, name, ctx.block.anchor);
  if (scope === 'tasks') return taskOrigin(absPath, name, ctx.task.line, ctx.task.raw);
  return fileOrigin(absPath, name);
}

// 4T-002044 (Epic 3E-000258): Der Baum (`DISPLAY tree BY <Feld>`) braucht je
// Datensatz den Eltern-Verweis, auch wenn der Autor das Feld nicht als Spalte
// nennt. Er reist als zusätzliche Angabe `parent` der Zeile (additiv nach E8.5,
// keine Spalte) und nur an Zeilen, deren Tabelle das Feld als Verweis-Feld führt
// (die Auslegung der Verweis-Zellen `refs` kennt genau diese Felder): der
// Datensatz-Verweis oder null. Gelesen wird über die Feld-Auflösung der Ebene,
// ein mehrdeutiger Verweis ist damit «fehlend» und setzt wie in einer Spalte den
// Hinweis `recordRefAmbiguous`. Ohne diese Angabe bleibt die Menge unverändert.
const TREE_FORM = 'tree';

function treeParentField(ast) {
  const wish = ast.scope === 'records' ? ast.display : null;
  return wish && wish.form === TREE_FORM && typeof wish.by === 'string' && wish.by ? wish.by : null;
}

function withParent(row, ctx, field) {
  const { record } = ctx;
  if (!(record.refs instanceof Map) || !record.refs.has(field)) return row;
  const value = resolveRecordField(field, record, ctx.recordNav || null);
  return { ...row, parent: isRecordRef(value) ? value : null };
}

// 4T-000503 (Epic 3E-000096), seit 4T-002033 über Zeilen-Indizes: rekursive
// Gruppen-Bildung, seit 4T-002076 (Epic 3E-000259) für alle vier Ebenen mit
// unveränderter Regel. Je Ebene wird der Gruppen-Schlüssel
// einmal je Zeile ausgewertet; Zeilen mit gleicher Text-Form bilden eine Gruppe,
// deren Wert der erste Roh-Wert ist. Die Reihenfolge der Zeilen in der Gruppe
// bleibt die der Ergebnis-Pipeline. Gruppen ordnen sich nach der Werte-Ordnung
// (orderForSort, Rückfall Text-Form); die Gruppe ohne Wert steht zuletzt.
// Jede Gruppe nennt ALLE ihre Zeilen, auch die ihrer Untergruppen. Aus der
// Regel folgt: Ein Listen-Wert bildet eine Gruppe je Kombination (Text-Form der
// ganzen Liste), aufgeteilt nach Elementen wird nicht; ein Datensatz-Verweis
// bleibt als Gruppen-Wert ein Verweis.
//
// 4T-002078: Datensatz-Verweise gruppieren nach dem Datensatz, den sie meinen,
// nicht nach ihrer Text-Form; zwei Bücher mit gleichem Titel sind zwei Gruppen.
// Das ist die Gleichheit der Sprache für Verweise (Tabelle und Kennung), die
// eine Zeile je Gruppe sonst unterliefe. Jeder andere Wert bleibt bei der
// Text-Form; Beschriftung und Ordnung bleiben die Text-Form.
function groupKey(value) {
  if (isRecordRef(value)) return `r:${value.path || value.table}\n${value.id}`;
  if (Array.isArray(value) && value.some(isRecordRef)) {
    return `l:${value.map((x) => (x === null ? ' none' : groupKey(x))).join('\u0000')}`;
  }
  return `v:${formatValue(value)}`;
}

function buildGroups(finalRows, keyExprs, level, indices) {
  const groups = [];
  const byLabel = new Map();
  for (const i of indices) {
    const value = toFormatValue(evaluateExpression(keyExprs[level], finalRows[i]));
    const label = value === null ? null : formatValue(value);
    const mapKey = label === null ? ' none' : groupKey(value);
    let group = byLabel.get(mapKey);
    if (!group) {
      group = { value, label, rows: [] };
      byLabel.set(mapKey, group);
      groups.push(group);
    }
    group.rows.push(i);
  }
  groups.sort((a, b) => {
    const aNone = a.label === null;
    const bNone = b.label === null;
    if (aNone && bNone) return 0;
    if (aNone) return 1;
    if (bNone) return -1;
    const ord = orderForSort(a.value, b.value);
    if (ord !== null && ord !== 0) return ord;
    return a.label.localeCompare(b.label);
  });
  const deeper = level + 1 < keyExprs.length;
  return groups.map((g) =>
    makeGroup(g.value, g.rows, deeper ? buildGroups(finalRows, keyExprs, level + 1, g.rows) : null),
  );
}

// 4T-002078: Nach `LIMIT` über die Gruppen (seit 4T-002079 ebenso nach `HAVING`,
// in Tabelle und Liste) behält die Menge die Zeilen der
// verbliebenen Gruppen in ihrer Reihenfolge; die Zeilen-Indizes der Gruppen
// zeigen danach auf die neue Liste. Ohne entfallene Zeile bleibt alles, wie es ist.
function keepGroupRows(rows, groups) {
  const kept = [...new Set(groups.flatMap((g) => g.rows))].sort((a, b) => a - b);
  if (kept.length === rows.length) return { rows, groups };
  const at = new Map(kept.map((old, i) => [old, i]));
  const remap = (list) =>
    list.map((g) => ({
      ...g,
      rows: g.rows.map((i) => at.get(i)),
      groups: g.groups ? remap(g.groups) : null,
    }));
  return { rows: kept.map((i) => rows[i]), groups: remap(groups) };
}

// 4T-002078: Die Werte einer Spalte über alle Gruppen jeder Stufe.
function groupValuesOf(groups, j) {
  const out = [];
  for (const g of groups) {
    out.push(g.values[j]);
    if (g.groups) out.push(...groupValuesOf(g.groups, j));
  }
  return out;
}

// 4T-002078: Die Gruppen-Werte der Stufe `level`.
function levelValuesOf(groups, level) {
  if (level === 0) return groups.map((g) => g.value);
  return groups.flatMap((g) => (g.groups ? levelValuesOf(g.groups, level - 1) : []));
}

/**
 * Baut die Ergebnismenge eines ausgewerteten Laufs (Zustand `ready`).
 * @param {object[]} finalRows  Treffer-Kontexte nach Sortierung und Limit; bei
 *   einer gruppierten Tabelle ohne beides, weil sie über den Gruppen laufen
 * @param {object} ast  Abfrage-AST des Blocks (ohne globale Anteile)
 * @param {{ root: string, fileCount?: number|null }} area  Suchraum wie bisher `meta`
 * @param {{ labels?: Array<string|null>|null, groupLabels?: Array<string|null>|null,
 *   hint?: string|null }} [options]
 *   4T-002039: aufgelöste Beschriftung je Spalte (ohne Alias; null heißt
 *   Quelltext) und ein Hinweis-Code der Ebene; die drei bestehenden Ebenen
 *   geben beides nicht an und bleiben dadurch unverändert. 4T-002078: ebenso
 *   je Ausdruck von `GROUP BY` für die Gruppen-Spalten der Tabelle.
 * @returns {import('../../shared/query/result-set.js').ResultSet}
 */
function buildResultSet(finalRows, ast, area, options = {}) {
  const labels = options.labels || [];
  const scope = ast.scope;
  // LIST trägt höchstens ein Zusatzfeld, TABLE die Spalten-Liste; beides sind
  // Spalten der Menge.
  const fields = ast.fields;
  const parentField = treeParentField(ast);
  // 4T-002078 (Festlegung 9): In einer gruppierten Tabelle trägt eine Zeile in
  // einer Spalte mit Aggregat «fehlend», in jeder anderen ihren eigenen Wert.
  const groupedTable = isGroupedTable(ast);
  const aggregated = fields.map((f) => groupedTable && containsAggregate(f.expr));
  const rows = finalRows.map((ctx) => {
    const row = makeRow(
      fields.map((f, j) => (aggregated[j] ? null : toFormatValue(evaluateExpression(f.expr, ctx)))),
      originOf(ctx, scope),
      scope === 'tasks'
        ? makeTaskInfo({
            // Ungerundet (Festlegung 4 des Epics); gerundet wird in der Darstellung.
            urgency: ctx.task.urgency,
            blocked: ctx.task.blocked,
            duplicateId: ctx.task.duplicateId,
          })
        : null,
    );
    return parentField ? withParent(row, ctx, parentField) : row;
  });
  // 4T-002076 (Epic 3E-000259): Gruppen entstehen auf jeder Ebene und bei
  // beiden Ausgabe-Typen, sobald GROUP BY steht (bis dahin nur bei LIST TASKS).
  // Bei der Liste sind SORT und LIMIT im Erzeuger schon über die Zeilen
  // gelaufen. 4T-002078 (Festlegung 7): Die gruppierte Tabelle bildet ihre
  // Gruppen über allen Treffern, dann folgen die Werte über der Gruppe, die
  // Bedingung über die Gruppe, SORT und LIMIT über die Gruppen.
  const grouped = ast.groupBy.length > 0;
  let groups = grouped
    ? buildGroups(
        finalRows,
        ast.groupBy,
        0,
        finalRows.map((_, i) => i),
      )
    : null;
  let outRows = rows;
  if (groupedTable) {
    ({ rows: outRows, groups } = keepGroupRows(rows, aggregateGroups(groups, finalRows, ast)));
  } else if (grouped && ast.having) {
    // 4T-002079 (Festlegung 7): In der gruppierten Liste wirkt HAVING nach der
    // Gruppen-Bildung auf die innersten Gruppen; die Treffer verworfener
    // Gruppen verlassen die Menge.
    ({ rows: outRows, groups } = keepGroupRows(rows, havingGroups(groups, finalRows, ast)));
  }
  // Die Werte-Art einer Spalte; bei einer gruppierten Tabelle aus den Werten
  // über den Gruppen, zusammen mit den Zeilen-Werten, die nicht fehlen.
  const columns = fields.map((f, j) => {
    const source = formatExprSource(f.expr);
    const values = outRows.map((r) => r.values[j]);
    return makeColumn({
      name: source,
      label: f.alias || labels[j] || source,
      alias: f.alias || null,
      source,
      valueType: uniformValueType(groupedTable ? [...values, ...groupValuesOf(groups, j)] : values),
    });
  });
  // 4T-002078 (Festlegung 10): je Ausdruck von GROUP BY eine Spalte für die
  // Gruppen-Werte der Tabelle; Beschriftung wie eine Spalte ohne Alias.
  const groupLabels = options.groupLabels || [];
  const groupColumns = groupedTable
    ? ast.groupBy.map((expr, k) => {
        const source = formatExprSource(expr);
        return makeColumn({
          name: source,
          label: groupLabels[k] || source,
          source,
          valueType: uniformValueType(levelValuesOf(groups, k)),
        });
      })
    : null;
  return makeResultSet({
    scope,
    type: ast.type,
    columns,
    rows: outRows,
    groups,
    groupColumns,
    // Der Wunsch COLUMNS reist auch bei TABLE mit; der Hinweis, dass die
    // Tabelle ihn übergeht, steht wie bisher im Zustand.
    wishes: makeWishes({
      layoutColumns: ast.layoutColumns || null,
      withoutId: !!ast.withoutId,
      hide: ast.hide,
      show: ast.show,
      short: !!ast.short,
      // 4T-002043: die Angabe DISPLAY; ohne sie fehlt der Wunsch in der Menge.
      display: ast.display || null,
    }),
    state: makeState('ready', {
      hint: options.hint || (ast.layoutColumns && ast.type !== 'list' ? 'columnsIgnored' : null),
      area,
    }),
  });
}

// --- Antworten des Erzeugers -----------------------------------------------------

/**
 * Antwort eines Zustands ohne ausgewertetes Ergebnis (nicht verfügbar, zu groß,
 * Index im Aufbau, Index-Fehler, Abfrage-Fehler): eine Menge, die allein den
 * Zustand trägt.
 * @param {'unavailable'|'oversized'|'indexing'|'error'|'ready'} status
 * @param {{ area?: { root: string, fileCount?: number|null, byteSize?: number|null }|null, queryError?: object|null }} [extra]
 * @returns {{ resultSet: import('../../shared/query/result-set.js').ResultSet }}
 */
function stateResponse(status, { area = null, queryError = null } = {}) {
  return { resultSet: makeResultSet({ state: makeState(status, { area, queryError }) }) };
}

/**
 * Antwort eines ausgewerteten Laufs: die Ergebnismenge.
 * @param {object[]} finalRows
 * @param {object} ast
 * @param {{ root: string, fileCount?: number|null }} area
 * @param {{ labels?: Array<string|null>|null, hint?: string|null }} [options]  wie bei buildResultSet
 * @returns {{ resultSet: import('../../shared/query/result-set.js').ResultSet }}
 */
function resultResponse(finalRows, ast, area, options) {
  return { resultSet: buildResultSet(finalRows, ast, area, options) };
}

module.exports = {
  buildResultSet,
  stateResponse,
  resultResponse,
};
