'use strict';

// 4T-002078 (Epic 3E-000259): Auswertung über einer Gruppe. Das Modul
// beantwortet eine Frage: was ein Ausdruck an einer Aggregat-Stelle bedeutet
// und welchen Wert er über den Zeilen einer Gruppe hat (Konzept-Entscheidung
// E6.4, Festlegungen 3 bis 7 des Epics).
//
// **Positions-Regel.** Eine Aggregat-Funktion bekommt ihre Bedeutung aus der
// Stelle, an der sie steht. Aggregat-Stellen sind allein die Spalten und die
// Sortierung einer gruppierten Tabelle (F5 Option A), seit 4T-002079 dazu
// `HAVING` jeder gruppierten Abfrage, also auch der gruppierten Liste, weil es
// dort sonst keine Bedingung über die Gruppe gäbe; jede andere Stelle ist eine
// Zeilen-Stelle mit der Bedeutung des
// Funktions-Katalogs (query-functions.js). Eine Tabelle ohne `GROUP BY` bleibt
// damit in der Zeilen-Bedeutung, eine Gesamtsumme ohne Gruppierung gibt es nicht.
//
// **Erlaubt an einer Aggregat-Stelle** (Festlegung 6): ein Ausdruck gleich einem
// Ausdruck von `GROUP BY` (Vergleich über den normalisierten Quelltext),
// Literale, Aggregate und jede Rechnung oder Funktion über ihnen. Alles andere
// ist ein Abfrage-Fehler, der die Spalte nennt, ein Aggregat im Aggregat ebenso.
//
// **Über der Gruppe** (Festlegung 4): `count()` zählt die Zeilen, `count(x)` die
// Zeilen mit Wert in `x`; `sum`, `average`, `min` und `max` fassen alle Werte
// der Gruppe zusammen, Listen elementweise, und rechnen dafür über dieselbe
// Funktion des Katalogs wie an der Zeilen-Stelle. `min` und `max` nehmen über
// der Gruppe auch Datums-Werte.
//
// Stellung im Ordner: Das Modul steht ÜBER dem Kern der Auswertung
// (perspective-query-eval.js), weil es je Zeile den Kern ruft; der Kern kennt
// es nicht. Prozess-neutral, ohne DOM und ohne Electron.

const { evaluateExpression, orderForSort } = require('./perspective-query-eval.js');
const { formatExprSource, isDate, coerceDateMs, truthy } = require('./query-format.js');
const {
  FUNCTIONS,
  AGGREGATE_FUNCTIONS,
  isGroupedTable,
  presentCount,
} = require('./query-functions.js');

// --- Ausdrücke ------------------------------------------------------------------

const CHILD_KEYS = ['left', 'right', 'operand'];

function childrenOf(node) {
  const out = [];
  for (const key of CHILD_KEYS) if (node[key]) out.push(node[key]);
  if (Array.isArray(node.args)) out.push(...node.args);
  if (Array.isArray(node.values)) out.push(...node.values);
  return out;
}

// Feld-Namen klein, weil die Feld-Auflösung die Schreibung nicht unterscheidet:
// `GROUP BY Author` und die Spalte `author` meinen denselben Ausdruck.
function lowerFields(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'field') return { ...node, name: String(node.name).toLowerCase() };
  const copy = { ...node };
  for (const key of CHILD_KEYS) if (node[key]) copy[key] = lowerFields(node[key]);
  if (Array.isArray(node.args)) copy.args = node.args.map(lowerFields);
  if (Array.isArray(node.values)) copy.values = node.values.map(lowerFields);
  return copy;
}

/**
 * Normalisierter Quelltext eines Ausdrucks, der Vergleichs-Schlüssel zwischen
 * einer Spalte und den Ausdrücken von `GROUP BY` (Festlegung 6).
 * @param {object} node
 * @returns {string}
 */
function exprKey(node) {
  return formatExprSource(lowerFields(node));
}

function isAggregateCall(node) {
  return !!node && node.type === 'call' && AGGREGATE_FUNCTIONS.has(node.name);
}

/**
 * Steht im Ausdruck eine Aggregat-Funktion?
 * @param {object} node
 * @returns {boolean}
 */
function containsAggregate(node) {
  if (!node || typeof node !== 'object') return false;
  return isAggregateCall(node) || childrenOf(node).some(containsAggregate);
}

// --- Prüfung «gruppiert oder aggregiert» ---------------------------------------

function positionError(code, name) {
  const message =
    code === 'aggregateNested'
      ? `Aggregat im Aggregat in '${name}'`
      : `'${name}' weder gruppiert noch aggregiert`;
  return { code, message, pos: -1, name };
}

// `name` ist die Spalte; ohne Spalte (bei HAVING) nennt der Fehler den
// Ausdruck, an dem er entsteht.
function checkExpr(node, keys, name) {
  if (!node || typeof node !== 'object' || keys.has(exprKey(node))) return null;
  const at = () => name || formatExprSource(node);
  if (node.type === 'field') return positionError('groupedColumn', at());
  if (isAggregateCall(node)) {
    return node.args.some(containsAggregate) ? positionError('aggregateNested', at()) : null;
  }
  for (const child of childrenOf(node)) {
    const err = checkExpr(child, keys, name);
    if (err) return err;
  }
  return null;
}

// 4T-002079: Die Bedingung über die Gruppe in Liste und Tabelle. Ein Feld ohne
// Gruppen-Bezug hat einen eigenen Code, weil der Text der Spalte («einzelne
// Treffer zeigt LIST») hier nicht passt; der Fehler nennt das Feld.
function checkHaving(ast, keys) {
  if (!ast.having) return null;
  const err = checkExpr(ast.having, keys, null);
  if (!err || err.code !== 'groupedColumn') return err;
  return { ...err, code: 'havingUngrouped', message: `'${err.name}' in HAVING nicht gruppiert` };
}

/**
 * Prüft die Aggregat-Stellen einer gruppierten Abfrage und liefert den ersten
 * Abfrage-Fehler oder null; jede andere Abfrage ist ohne Befund. Der Fehler
 * nennt die Spalte über ihren Alias, sonst ihren Quelltext, bei der Sortierung
 * den Quelltext des Sortier-Ausdrucks, bei `HAVING` (4T-002079, auch in der
 * gruppierten Liste) den Ausdruck, an dem er entsteht.
 * @param {object} ast
 * @returns {{ code: string, message: string, pos: number, name: string }|null}
 */
function checkGroupedTable(ast) {
  if (!ast || !Array.isArray(ast.groupBy) || ast.groupBy.length === 0) return null;
  const keys = new Set(ast.groupBy.map(exprKey));
  const havingErr = checkHaving(ast, keys);
  if (havingErr || !isGroupedTable(ast)) return havingErr;
  for (const f of ast.fields) {
    const err = checkExpr(f.expr, keys, f.alias || formatExprSource(f.expr));
    if (err) return err;
  }
  for (const s of ast.sort) {
    const err = checkExpr(s.key, keys, formatExprSource(s.key));
    if (err) return err;
  }
  return null;
}

// --- Auswertung über der Gruppe ------------------------------------------------

// Ein Wert in der Form der Ergebnismenge: `undefined` ist «fehlend», Listen
// werden kopiert, damit die Menge keine Liste des Index teilt.
function plain(v) {
  if (v === undefined) return null;
  return Array.isArray(v) ? v.map(plain) : v;
}

function isDateLike(v) {
  return isDate(v) || (typeof v === 'string' && coerceDateMs(v) !== null);
}

// `min` und `max` über Datums-Werte: der früheste oder späteste Wert in seiner
// Form (Datums-Wert oder ISO-Text), bei Gleichstand der erste.
function extremeDate(values, name) {
  let best = null;
  let bestMs = null;
  for (const v of values) {
    if (!isDateLike(v)) continue;
    const ms = coerceDateMs(v);
    if (bestMs === null || (name === 'min' ? ms < bestMs : ms > bestMs)) {
      best = v;
      bestMs = ms;
    }
  }
  return best;
}

function aggregate(node, ctxs) {
  const arg = node.args[0];
  if (node.name === 'count') {
    if (!arg) return ctxs.length;
    let n = 0;
    for (const ctx of ctxs) if (presentCount(evaluateExpression(arg, ctx)) > 0) n++;
    return n;
  }
  // Alle Werte der Gruppe, Listen elementweise; dann dieselbe Funktion wie an
  // der Zeilen-Stelle über diese eine Liste.
  const values = [];
  for (const ctx of ctxs) {
    const v = evaluateExpression(arg, ctx);
    if (Array.isArray(v)) for (const x of v) values.push(x);
    else values.push(v);
  }
  if ((node.name === 'min' || node.name === 'max') && values.some(isDateLike)) {
    return extremeDate(values, node.name);
  }
  return FUNCTIONS.get(node.name).fn([values], ctxs[0]);
}

// Übersetzt einen Ausdruck einer Aggregat-Stelle einmal je Abfrage in eine
// Funktion `(ctxs, level) => Wert` über den Zeilen einer Gruppe der Stufe
// `level`. Ein Gruppen-Ausdruck gilt ab seiner Stufe und ist darüber nicht
// bestimmt, also «fehlend»; ein Aggregat rechnet über alle Zeilen; jede
// Rechnung darüber läuft über den Kern mit den Teil-Werten als vorab
// berechneten Werten (`const`), damit es keine zweite Rechen-Regel gibt.
function compile(node, keyLevel) {
  const level = keyLevel.get(exprKey(node));
  if (level !== undefined) {
    return (ctxs, at) => (level <= at ? plain(evaluateExpression(node, ctxs[0])) : null);
  }
  if (isAggregateCall(node)) return (ctxs) => plain(aggregate(node, ctxs));
  const slots = CHILD_KEYS.filter((key) => node[key]).map((key) => [
    key,
    compile(node[key], keyLevel),
  ]);
  const args = Array.isArray(node.args) ? node.args.map((a) => compile(a, keyLevel)) : null;
  const values = Array.isArray(node.values) ? node.values.map((v) => compile(v, keyLevel)) : null;
  return (ctxs, at) => {
    const filled = { ...node };
    const fix = (fn) => ({ type: 'const', value: fn(ctxs, at) });
    for (const [key, fn] of slots) filled[key] = fix(fn);
    if (args) filled.args = args.map(fix);
    if (values) filled.values = values.map(fix);
    return plain(evaluateExpression(filled, ctxs[0]));
  };
}

function attachValues(groups, ctxs, columns, sortKeys, level) {
  return groups.map((g) => {
    const rows = g.rows.map((i) => ctxs[i]);
    return {
      value: g.value,
      rows: g.rows,
      groups: g.groups ? attachValues(g.groups, ctxs, columns, sortKeys, level + 1) : null,
      values: columns.map((fn) => fn(rows, level)),
      sortValues: sortKeys.map((s) => s.fn(rows, level)),
    };
  });
}

// --- Reihenfolge der gruppierten Tabelle (Festlegung 7) --------------------------

// Stufe je Ausdruck von GROUP BY über dem normalisierten Quelltext; ein
// doppelter Ausdruck gilt ab seiner ersten Stufe.
function keyLevelsOf(ast) {
  const keyLevel = new Map();
  ast.groupBy.forEach((g, i) => {
    const key = exprKey(g);
    if (!keyLevel.has(key)) keyLevel.set(key, i);
  });
  return keyLevel;
}

/**
 * 4T-002079 (Festlegungen 7 und 8): Bedingung über die Gruppe, `HAVING`. Sie
 * prüft die innersten Gruppen, über deren Zeilen die Aggregate rechnen; eine
 * Gruppe bleibt, wenn die Bedingung wahr ist. Eine Eltern-Gruppe besteht danach
 * aus ihren verbliebenen Untergruppen: Sie behält allein deren Zeilen und
 * entfällt ohne sie. So bleibt kein Treffer einer verworfenen Gruppe in der
 * Menge. Ohne `HAVING` bleibt alles, wie es ist. Gilt für die gruppierte Tabelle
 * (über `aggregateGroups`, vor den Werten, `SORT` und `LIMIT`) und die
 * gruppierte Liste (aus dem Zeilen-Bau, nach `SORT` und `LIMIT` über die Zeilen).
 * @param {Array<{ value: unknown, rows: number[], groups: Array|null }>} groups
 * @param {object[]} ctxs  Treffer-Kontexte, auf die die Zeilen-Indizes zeigen
 * @param {object} ast  Abfrage-AST mit `GROUP BY`
 * @returns {Array<{ value: unknown, rows: number[], groups: Array|null }>}
 */
function havingGroups(groups, ctxs, ast) {
  if (!ast.having) return groups;
  const condition = compile(ast.having, keyLevelsOf(ast));
  const holds = (g, level) => {
    const rows = g.rows.map((i) => ctxs[i]);
    return truthy(condition(rows, level));
  };
  const keep = (list, level) => {
    const out = [];
    for (const g of list) {
      if (g.groups) {
        const kids = keep(g.groups, level + 1);
        if (kids.length === 0) continue;
        const rows = new Set(kids.flatMap((k) => k.rows));
        out.push({ ...g, rows: g.rows.filter((i) => rows.has(i)), groups: kids });
      } else if (holds(g, level)) {
        out.push(g);
      }
    }
    return out;
  };
  return keep(groups, 0);
}

// SORT über die Gruppen, je Stufe unter Geschwistern, mit der Ordnung der
// Zeilen-Sortierung: fehlende Werte zuletzt, gleich ob auf- oder absteigend.
// Ohne SORT bleibt die Ordnung nach dem Gruppen-Wert aus dem Zeilen-Bau.
function sortGroups(groups, sortKeys) {
  if (sortKeys.length === 0) return groups;
  const sorted = groups
    .map((g, idx) => ({ g, idx }))
    .sort((a, b) => {
      for (let i = 0; i < sortKeys.length; i++) {
        const av = a.g.sortValues[i];
        const bv = b.g.sortValues[i];
        const aNull = av === null || av === undefined;
        const bNull = bv === null || bv === undefined;
        if (aNull && bNull) continue;
        if (aNull) return 1;
        if (bNull) return -1;
        const ord = orderForSort(av, bv);
        if (ord === null || ord === 0) continue;
        return sortKeys[i].dir === 'desc' ? -ord : ord;
      }
      return a.idx - b.idx;
    })
    .map(({ g }) => g);
  return sorted.map((g) => (g.groups ? { ...g, groups: sortGroups(g.groups, sortKeys) } : g));
}

// LIMIT über die Gruppen der untersten Stufe, also über die Zeilen der Tabelle
// in ihrer Reihenfolge; eine Eltern-Gruppe ohne verbleibende Untergruppe
// entfällt, eine verbleibende behält alle ihre Zeilen und Werte.
function limitGroups(groups, limit) {
  if (typeof limit !== 'number') return groups;
  let left = limit;
  const cut = (list) => {
    const out = [];
    for (const g of list) {
      if (left <= 0) break;
      if (g.groups) {
        const kids = cut(g.groups);
        if (kids.length > 0) out.push({ ...g, groups: kids });
      } else {
        out.push(g);
        left--;
      }
    }
    return out;
  };
  return cut(groups);
}

function strip(groups) {
  return groups.map((g) => ({
    value: g.value,
    rows: g.rows,
    groups: g.groups ? strip(g.groups) : null,
    values: g.values,
  }));
}

/**
 * Werte über den Gruppen einer gruppierten Tabelle und deren Reihenfolge:
 * Bedingung über die Gruppe (`HAVING`, 4T-002079), `SORT` und `LIMIT` über die
 * Gruppen. Jede Gruppe trägt danach `values`, je Spalte den Wert über ihren
 * Zeilen (Festlegung 9); eine Eltern-Gruppe rechnet dabei über die Zeilen, die
 * ihr nach `HAVING` bleiben.
 * @param {Array<{ value: unknown, rows: number[], groups: Array|null }>} groups
 *   Gruppen aus dem Zeilen-Bau, geordnet nach dem Gruppen-Wert
 * @param {object[]} ctxs  Treffer-Kontexte, auf die die Zeilen-Indizes zeigen
 * @param {object} ast  Abfrage-AST einer gruppierten Tabelle
 * @returns {Array<{ value: unknown, rows: number[], groups: Array|null, values: unknown[] }>}
 */
function aggregateGroups(groups, ctxs, ast) {
  const keyLevel = keyLevelsOf(ast);
  const columns = ast.fields.map((f) => compile(f.expr, keyLevel));
  const sortKeys = ast.sort.map((s) => ({ fn: compile(s.key, keyLevel), dir: s.dir }));
  const valued = attachValues(havingGroups(groups, ctxs, ast), ctxs, columns, sortKeys, 0);
  return strip(limitGroups(sortGroups(valued, sortKeys), ast.limit));
}

module.exports = {
  exprKey,
  containsAggregate,
  checkGroupedTable,
  havingGroups,
  aggregateGroups,
};
