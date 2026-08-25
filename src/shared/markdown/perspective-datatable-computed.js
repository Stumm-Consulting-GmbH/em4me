// 4T-0986 (Epic 3E-0196): Perspective Datatable — berechnete Spalten.
// Aus perspective-datatable.js herausgelöst: Validierung der Spalten-
// Formeln (Syntax, Funktions-Katalog, Verweis- und Kreis-Regel) und deren
// Auswertung je Zeile. Prozess-neutral (kein Electron, kein DOM).
//
// Dieses Modul ist das Blatt der Datatable-Familie: es lädt außer der
// Abfrage-Sprache nichts aus dem eigenen Ordner, und Kern, Ansicht und
// HTML laden von hier. Deshalb liegen hier auch die drei Grund-Helfer, die
// mehrere Module gemeinsam brauchen (isValidIsoDate, normalizeFloat,
// dataIndexByColumn); ihre Verortung im Blatt hält den Import-Graphen der
// Familie kreisfrei, statt sie zu duplizieren.
'use strict';

// Ausdrucks-Parser und -Evaluator der Perspective-Query-Sprache (3E-0076):
// Spalten-Formeln nutzen denselben Funktions-Katalog und dasselbe
// Typ-System wie die Abfrage (Epic-Entscheidung C2).
// 4T-0987 (Epic 3E-0196): Abfrage-Sprache im Feature-Ordner src/shared/query/.
const { parseExpression, collectFieldRefs } = require('../query/perspective-query.js');
const { evaluateExpression } = require('../query/perspective-query-eval.js');
const { validateQuery } = require('../query/query-functions.js');
const { formatValue } = require('../query/query-format.js');

// --- Geteilte Grund-Helfer ------------------------------------------------------

// Echte Kalender-Prüfung über den Date-Roundtrip (2026-02-30 fällt durch).
function isValidIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

// Float-Rauschen normalisieren (0.1 + 0.2 -> 0.3), ohne echte Präzision zu
// verlieren; 12 signifikante Stellen reichen für den Anwendungsfall.
function normalizeFloat(n) {
  return Number.isFinite(n) ? parseFloat(n.toPrecision(12)) : n;
}

// Spalten-Index -> Daten-Zellen-Index (null für berechnete Spalten, die
// keine Daten-Zelle haben).
function dataIndexByColumn(columns) {
  const map = [];
  let next = 0;
  for (const col of columns) map.push(col.expr === null ? next++ : null);
  return map;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// --- Ausdrucks-Validierung (4T-0421) --------------------------------------------

// Feld-Verweise eines Ausdrucks-AST einsammeln (lowercase).
// 4T-1183 (Epic 3E-0221): Der Helfer liegt seit dem zweiten Aufrufer — den
// Formel-Feldern der Eigenschafts-Profile — bei der Abfrage-Sprache, wo der
// AST entsteht (Begründung dort). Hier bleibt der Re-Export, damit die
// Aufrufer dieses Moduls unverändert bleiben.

// Validiert die Spalten-Formeln nach dem Spalten-Aufbau: Syntax und
// Funktions-Katalog (badExpr), Verweise nur auf existierende Spalten
// (computedBadRef) sowie Kreis-Freiheit der Formel-Bezüge (computedCycle).
// Formeln dürfen auf Daten-Spalten UND andere berechnete Spalten in
// beliebiger Deklarations-Reihenfolge verweisen (PO-Anmerkung aus der
// Test-Iteration vom 2026-07-09); die Auswertung löst die Reihenfolge
// über die Abhängigkeiten auf. Gültige, kreis-freie Ausdrücke erhalten
// ihren AST als col.exprAst (nur in-memory; der Serialisierer nutzt
// col.expr).
function validateComputedColumns(columns, line, errors) {
  const known = new Set(columns.map((c) => c.name.toLowerCase()));
  const computedNames = new Set(
    columns.filter((c) => c.expr !== null).map((c) => c.name.toLowerCase()),
  );
  // Formel-Bezüge auf berechnete Spalten je gültiger Formel (Name -> Set).
  const computedRefs = new Map();
  const astByName = new Map();
  for (const col of columns) {
    if (col.expr === null) continue;
    const parsed = parseExpression(col.expr);
    const fnError = parsed.ok ? validateQuery(parsed.ast) : null;
    if (!parsed.ok || fnError) {
      errors.push({ code: 'badExpr', line, detail: col.name });
      continue;
    }
    const refs = [];
    collectFieldRefs(parsed.ast, refs);
    const bad = refs.find((r) => !known.has(r));
    if (bad !== undefined) {
      errors.push({ code: 'computedBadRef', line, detail: `${col.name}: ${bad}` });
      continue;
    }
    const name = col.name.toLowerCase();
    astByName.set(name, { col, ast: parsed.ast });
    computedRefs.set(name, new Set(refs.filter((r) => computedNames.has(r))));
  }
  // Fixpunkt-Auflösung: eine Formel ist auflösbar, wenn alle ihre Bezüge
  // auf berechnete Spalten bereits auflösbar sind (ungültige Formeln
  // zählen als auflösbar-mit-null, damit sie keinen falschen Kreis-Fehler
  // an ihren Konsumenten erzeugen). Was übrig bleibt, hängt in einem
  // Kreis-Bezug (Selbst-Bezug eingeschlossen).
  const resolved = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, deps] of computedRefs) {
      if (resolved.has(name)) continue;
      let ok = true;
      for (const dep of deps) {
        if (computedRefs.has(dep) && !resolved.has(dep)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        resolved.add(name);
        grew = true;
      }
    }
  }
  for (const [name, entry] of astByName) {
    if (resolved.has(name)) entry.col.exprAst = entry.ast;
    else errors.push({ code: 'computedCycle', line, detail: entry.col.name });
  }
}

// --- Auswertung (4T-0421) --------------------------------------------------------

// Abfrage-Wert -> Zell-Wert gemäß deklariertem Spalten-Typ. null bleibt
// leer (weiche Fehler der Abfrage-Semantik); Typ-Abweichungen werden
// Fehler-Zellen (computedTypeMismatch).
function toComputedCell(col, v) {
  if (v == null) return { value: null, error: null };
  if (col.type === 'number') {
    if (typeof v === 'number' && Number.isFinite(v))
      return { value: normalizeFloat(v), error: null };
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      return { value: parseFloat(v), error: null };
    }
    return { value: null, error: 'computedTypeMismatch' };
  }
  if (col.type === 'boolean') {
    if (typeof v === 'boolean') return { value: v, error: null };
    return { value: null, error: 'computedTypeMismatch' };
  }
  if (col.type === 'date') {
    if (v && typeof v === 'object' && v.kind === 'date') {
      const d = new Date(v.ms);
      return {
        value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        error: null,
      };
    }
    if (typeof v === 'string' && isValidIsoDate(v.slice(0, 10))) {
      return { value: v.slice(0, 10), error: null };
    }
    return { value: null, error: 'computedTypeMismatch' };
  }
  if (col.type === 'time') {
    if (v && typeof v === 'object' && v.kind === 'date') {
      const d = new Date(v.ms);
      return { value: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, error: null };
    }
    if (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      return { value: v, error: null };
    }
    return { value: null, error: 'computedTypeMismatch' };
  }
  // text: jede Wert-Art über die kanonische Anzeige-Form der Abfrage.
  return { value: formatValue(v), error: null };
}

// Auswertungs-Reihenfolge der gültigen Formeln: eine Formel folgt allen
// berechneten Spalten, auf die sie verweist (Deklarations-Reihenfolge ist
// frei; Kreise hat validateComputedColumns bereits aussortiert — deren
// Spalten tragen kein exprAst).
function computedEvaluationOrder(model) {
  const entries = [];
  model.columns.forEach((col, i) => {
    if (col.expr !== null) entries.push({ col, i });
  });
  const evaluable = entries.filter((e) => e.col.exprAst);
  const byName = new Map(evaluable.map((e) => [e.col.name.toLowerCase(), e]));
  const order = [];
  const placed = new Set();
  let grew = true;
  while (grew && order.length < evaluable.length) {
    grew = false;
    for (const e of evaluable) {
      const name = e.col.name.toLowerCase();
      if (placed.has(name)) continue;
      const refs = [];
      collectFieldRefs(e.col.exprAst, refs);
      if (refs.every((r) => !byName.has(r) || placed.has(r))) {
        order.push(e);
        placed.add(name);
        grew = true;
      }
    }
  }
  return { entries, order };
}

// Wertet die Spalten-Formeln pro Zeile aus. Rückgabe: Map(row-Objekt ->
// { [colIdx]: { value, error } }); die Map-Schlüssel sind die Zeilen-
// Objekte des Modells, damit auch Teilmengen (gefilterte Ansicht,
// Aggregate) ohne Index-Umrechnung zugreifen können. Feld-Kontext der
// Auswertung sind die Spalten-Werte der Zeile (lowercase-Schlüssel);
// berechnete Spalten werden in Abhängigkeits-Reihenfolge gerechnet
// (computedEvaluationOrder), sodass Formeln unabhängig von der
// Deklarations-Reihenfolge aufeinander verweisen können. Ergebnisse
// werden nie persistiert (der Serialisierer kennt nur Daten-Zellen).
function computeComputedCells(model) {
  const map = new Map();
  const { entries, order } = computedEvaluationOrder(model);
  if (entries.length === 0) return map;
  const dataIdx = dataIndexByColumn(model.columns);
  for (const row of model.rows) {
    const props = {};
    model.columns.forEach((col, i) => {
      const di = dataIdx[i];
      // Berechnete Spalten starten als null (Kreis-/Fehler-Formeln bleiben
      // es), Daten-Spalten mit ihrem Zell-Wert.
      props[col.name.toLowerCase()] =
        di == null ? null : row[di] && !row[di].error ? row[di].value : null;
    });
    const perCol = {};
    for (const e of entries) perCol[e.i] = { value: null, error: null };
    for (const { col, i } of order) {
      const result = toComputedCell(col, evaluateExpression(col.exprAst, { props }));
      perCol[i] = result;
      props[col.name.toLowerCase()] = result.error ? null : result.value;
    }
    map.set(row, perCol);
  }
  return map;
}

// Wert-Resolver über Daten- UND berechnete Spalten (Aggregate, Sortierung,
// Filter der Ansicht).
function makeCellValueResolver(model, computed) {
  const dataIdx = dataIndexByColumn(model.columns);
  return (row, colIdx) => {
    const di = dataIdx[colIdx];
    if (di != null) {
      const cell = row[di];
      return cell && !cell.error ? cell.value : null;
    }
    const perCol = computed ? computed.get(row) : null;
    const comp = perCol ? perCol[colIdx] : null;
    return comp && !comp.error ? comp.value : null;
  };
}

module.exports = {
  isValidIsoDate,
  normalizeFloat,
  dataIndexByColumn,
  collectFieldRefs,
  validateComputedColumns,
  toComputedCell,
  computedEvaluationOrder,
  computeComputedCells,
  makeCellValueResolver,
};
