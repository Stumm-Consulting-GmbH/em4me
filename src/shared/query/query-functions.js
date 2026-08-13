'use strict';

// 4T-0987 (Epic 3E-0196): Funktions-Katalog der Perspective-Query-Sprache
// samt der Validierung, die auf ihm aufsetzt, herausgelöst aus
// perspective-query-eval.js. Enthalten sind die Katalog-Einträge mit ihren
// reinen Implementierungen, die AST-Prüfung auf Funktions-Namen und
// Stelligkeit sowie die Frage, ob eine Abfrage den Link-Graphen braucht.
// Prozess-neutral (kein Electron, kein DOM), kein eval.

// 4T-0344 (Epic 3E-0062): dieselbe Namens-Normalisierung wie Wiki-Aufloesung
// und Backlinks-Index (NFC + lowercase), damit Link-Vergleiche der Abfrage
// dieselben Treffer sehen wie der Klick-Pfad.
const { normalizeNameKey } = require('../markdown/link-scan.js');
const {
  isLink,
  coerceDateMs,
  coerceNumber,
  truthy,
  equalsValue,
  formatDateMs,
  formatValue,
} = require('./query-format.js');

// --- Funktions-Katalog ---------------------------------------------------------

// Element-Gleichheit für contains/icontains über Listen. caseSensitive steuert
// nur den String-Fall; Links matchen immer über den (inhärent case-insensitiven)
// Namens-Schlüssel, damit `contains(file.inlinks, "Projekt X")` nicht an der
// Groß-/Kleinschreibung scheitert (PO-Anwendungsfall der Referenz-Analyse).
function elementEquals(x, needle, caseSensitive) {
  if (isLink(x) || isLink(needle)) {
    const xn = isLink(x) ? x.name : x;
    const nn = isLink(needle) ? needle.name : needle;
    if (typeof xn !== 'string' || typeof nn !== 'string') return false;
    return normalizeNameKey(xn) === normalizeNameKey(nn);
  }
  if (typeof x === 'string' && typeof needle === 'string') {
    return caseSensitive ? x === needle : x.toLowerCase() === needle.toLowerCase();
  }
  return equalsValue(x, needle);
}

function containsImpl(args, caseSensitive) {
  const [hay, needle] = args;
  if (typeof hay === 'string') {
    if (typeof needle !== 'string') return false;
    return caseSensitive ? hay.includes(needle) : hay.toLowerCase().includes(needle.toLowerCase());
  }
  if (Array.isArray(hay)) return hay.some((x) => elementEquals(x, needle, caseSensitive));
  return null;
}

// Aggregat-Vorbereitung: Liste -> Zahlen (Zahl-Strings koerziert, Rest fällt
// weg). null, wenn kein numerisches Element bleibt.
function numericList(v) {
  if (!Array.isArray(v)) {
    const single = coerceNumber(v);
    return single === null ? null : [single];
  }
  const nums = v.map(coerceNumber).filter((n) => n !== null);
  return nums.length ? nums : null;
}

// Kuratierter Katalog: name -> { arity: [min, max], fn(args, ctx) }. Alle
// Funktionen sind rein (keine Seiteneffekte); Typ-Fehler ergeben null.
const FUNCTIONS = new Map([
  ['contains', { arity: [2, 2], fn: (a) => containsImpl(a, true) }],
  ['icontains', { arity: [2, 2], fn: (a) => containsImpl(a, false) }],
  [
    'length',
    {
      arity: [1, 1],
      fn: ([v]) => (typeof v === 'string' || Array.isArray(v) ? v.length : null),
    },
  ],
  ['lower', { arity: [1, 1], fn: ([v]) => (typeof v === 'string' ? v.toLowerCase() : null) }],
  ['upper', { arity: [1, 1], fn: ([v]) => (typeof v === 'string' ? v.toUpperCase() : null) }],
  [
    'startswith',
    {
      arity: [2, 2],
      fn: ([s, p]) => (typeof s === 'string' && typeof p === 'string' ? s.startsWith(p) : null),
    },
  ],
  [
    'endswith',
    {
      arity: [2, 2],
      fn: ([s, p]) => (typeof s === 'string' && typeof p === 'string' ? s.endsWith(p) : null),
    },
  ],
  ['default', { arity: [2, 2], fn: ([v, d]) => (v === null || v === undefined ? d : v) }],
  ['choice', { arity: [3, 3], fn: ([c, a, b]) => (truthy(c) ? a : b) }],
  ['number', { arity: [1, 1], fn: ([v]) => coerceNumber(v) }],
  ['string', { arity: [1, 1], fn: ([v]) => formatValue(v) }],
  [
    'dateformat',
    {
      arity: [2, 2],
      fn: ([v, fmt]) => {
        const ms = coerceDateMs(v);
        if (ms === null || typeof fmt !== 'string') return null;
        return formatDateMs(ms, fmt);
      },
    },
  ],
  [
    'sum',
    {
      arity: [1, 1],
      fn: ([v]) => {
        const nums = numericList(v);
        return nums ? nums.reduce((s, n) => s + n, 0) : null;
      },
    },
  ],
  [
    'min',
    {
      arity: [1, 1],
      fn: ([v]) => {
        const nums = numericList(v);
        return nums ? Math.min(...nums) : null;
      },
    },
  ],
  [
    'max',
    {
      arity: [1, 1],
      fn: ([v]) => {
        const nums = numericList(v);
        return nums ? Math.max(...nums) : null;
      },
    },
  ],
  [
    'average',
    {
      arity: [1, 1],
      fn: ([v]) => {
        const nums = numericList(v);
        return nums ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
      },
    },
  ],
]);

// --- Validierung (Funktions-Namen und Stelligkeit) -----------------------------

// Läuft nach dem Parsen über den kompletten Abfrage-AST und liefert den ersten
// Funktions-Fehler als strukturiertes Fehler-Objekt (Form wie die Parser-
// Fehler; die View bildet den Code auf i18n ab) — oder null. Damit erscheint
// eine unbekannte Funktion bzw. falsche Stelligkeit als lokalisierter Fehler
// am Fence, bevor die Auswertung je Datei läuft.
function validateQuery(queryAst) {
  let err = null;
  function walkExpr(node) {
    if (err || !node || typeof node !== 'object') return;
    switch (node.type) {
      case 'or':
      case 'and':
      case 'cmp':
      case 'arith':
        walkExpr(node.left);
        walkExpr(node.right);
        return;
      case 'not':
      case 'neg':
        walkExpr(node.operand);
        return;
      case 'inlist':
        walkExpr(node.left);
        for (const v of node.values) walkExpr(v);
        return;
      case 'call': {
        const def = FUNCTIONS.get(node.name);
        if (!def) {
          err = {
            code: 'unknownFunction',
            message: `Unbekannte Funktion '${node.name}'`,
            pos: typeof node.pos === 'number' ? node.pos : -1,
            name: node.name,
          };
          return;
        }
        if (node.args.length < def.arity[0] || node.args.length > def.arity[1]) {
          err = {
            code: 'functionArity',
            message: `Falsche Argument-Anzahl für '${node.name}'`,
            pos: typeof node.pos === 'number' ? node.pos : -1,
            name: node.name,
          };
          return;
        }
        for (const a of node.args) walkExpr(a);
        return;
      }
      default:
        return;
    }
  }
  if (queryAst && (queryAst.type === 'list' || queryAst.type === 'table')) {
    for (const f of queryAst.fields || []) walkExpr(f.expr);
    walkExpr(queryAst.where);
    for (const s of queryAst.sort || []) walkExpr(s.key);
    // 4T-0503 (Epic 3E-0096): Gruppierungs-Ausdruecke mit validieren.
    for (const g of queryAst.groupBy || []) walkExpr(g);
  } else {
    walkExpr(queryAst);
  }
  return err;
}

// Meldet, ob die Abfrage den Link-Graphen braucht (file.inlinks/file.outlinks
// oder eine FROM-Link-Quelle). Der Aufrufer baut den Graphen nur dann auf.
function queryUsesLinks(queryAst) {
  let found = false;
  function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (node.type === 'field') {
      const lower = String(node.name).toLowerCase();
      if (lower === 'file.inlinks' || lower === 'file.outlinks') found = true;
      return;
    }
    if (node.type === 'srcLink') {
      found = true;
      return;
    }
    for (const key of ['left', 'right', 'operand', 'expr', 'key', 'where', 'source']) {
      if (node[key]) walk(node[key]);
    }
    if (Array.isArray(node.args)) for (const a of node.args) walk(a);
    if (Array.isArray(node.values)) for (const v of node.values) walk(v);
    if (Array.isArray(node.fields)) for (const f of node.fields) walk(f.expr);
    if (Array.isArray(node.sort)) for (const s of node.sort) walk(s.key);
    // 4T-0503 (Epic 3E-0096): Gruppierungs-Ausdruecke mit durchsuchen.
    if (Array.isArray(node.groupBy)) for (const g of node.groupBy) walk(g);
  }
  walk(queryAst);
  return found;
}

module.exports = {
  FUNCTIONS,
  validateQuery,
  queryUsesLinks,
};
