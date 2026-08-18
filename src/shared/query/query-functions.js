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
  // 4T-1071 (Epic 3E-0211): Typ-Prüfer für days().
  isDur,
  coerceDateMs,
  coerceNumber,
  truthy,
  equalsValue,
  formatDateMs,
  formatValue,
  // 4T-1072 (Epic 3E-0211): Zahlen- und Währungs-Formatierung.
  formatNumberMs,
  formatCurrencyValue,
  // 4T-1074 (Epic 3E-0211): Hervorhebung als Anzeige-Wert.
  boldValue,
} = require('./query-format.js');
// 4T-1073 (Epic 3E-0211): Die Ordner-Normalisierung der FROM-Quellen-Ebene ist
// der EINE Ordner-Begriff der Sprache; `infolder` benutzt sie, statt einen
// zweiten aufzumachen (Konzept-Entscheid E8). Der Bezug ist gerichtet
// (Katalog -> Quellen-Ebene, die selbst nichts aus dem Ordner lädt) und
// bleibt damit kreisfrei.
const { normFolder } = require('./query-sources.js');

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

// 4T-1073 (Epic 3E-0211): Vorbereitung für infolder — Liste -> Link-Werte.
// Ein einzelner Link zählt als einelementige Liste (Muster von numericList),
// jede andere Eingabe ergibt null. Anders als numericList bleibt die LEERE
// Liste hier ein gültiges Ergebnis und wird nicht zu null: `length(...) = 0`
// ist der belegte Anwendungsfall der Funktion, und length(null) wäre null
// statt 0 (Konzept-Entscheid E8).
function linkList(v) {
  if (Array.isArray(v)) return v.filter(isLink);
  return isLink(v) ? [v] : null;
}

// 4T-1073 (Epic 3E-0211): Der Pfad-Bruch des Werte-Modells, an genau einer
// Stelle überbrückt. Link-Werte tragen den ABSOLUTEN Index-Pfad, die
// Ordner-Angabe einer Abfrage ist WURZEL-RELATIV wie file.folder. Liefert den
// wurzel-relativen Ordner eines Link-Ziels oder null, wenn das Ziel gar nicht
// unter der Wurzel liegt. rootN ist bereits normalisiert.
function folderOfLink(absPath, rootN) {
  if (typeof absPath !== 'string' || !absPath) return null;
  const p = normFolder(absPath);
  if (p !== rootN && !p.startsWith(rootN + '/')) return null;
  const rel = p.slice(rootN.length + 1);
  const cut = rel.lastIndexOf('/');
  return cut >= 0 ? rel.slice(0, cut) : '';
}

// 4T-1073 (Epic 3E-0211): infolder(liste, "Ordner") — die Teilliste der
// Link-Werte, deren Ziel im Ordner oder darunter liegt. Ordner-Vergleich wie
// die FROM-Ordner-Quelle (normFolder plus Präfix-Treffer auf Ordner-Grenze),
// leerer Ordner-String heißt Wurzel und damit alles.
//
// OHNE Wurzel im Kontext ergibt die Funktion null und NICHT die leere Liste:
// An den kontextlosen Orten der Sprache (berechnete Datatable-Spalten,
// Inline-Rechnung) ist eine Ordner-Aussage nicht möglich, und `length(…) = 0`
// träfe mit einer leeren Liste jede Datei — ein zu großes Ergebnis aus einem
// unvollständigen Kontext, genau das, was schon der Selbstbezugs-Quelle
// verboten ist (Konzept-Entscheid E9).
function inFolderImpl([liste, ordner], ctx) {
  if (typeof ordner !== 'string') return null;
  const links = linkList(liste);
  if (!links) return null;
  const root = ctx && typeof ctx.root === 'string' ? normFolder(ctx.root) : '';
  if (!root) return null;
  const wanted = normFolder(ordner);
  return links.filter((l) => {
    const folder = folderOfLink(l.path, root);
    if (folder === null) return false;
    if (!wanted) return true;
    return folder === wanted || folder.startsWith(wanted + '/');
  });
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
  // 4T-1073 (Epic 3E-0211): Mengen-Einschränkung einer Link-Liste auf einen
  // Ordner, zusammen mit length() der belegte Endknoten-Fall des Bestands:
  // `length(infolder(file.inlinks, "12 Getting Things Done (GTD)")) = 0`.
  // Genau zwei Argumente, ein Ordner: eine spätere Erweiterung auf mehrere
  // bliebe abwärtskompatibel, der umgekehrte Weg nicht (Entscheid E8).
  ['infolder', { arity: [2, 2], fn: inFolderImpl }],
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
  // 4T-1074 (Epic 3E-0211): Hervorhebung eines Werts oder eines Teils eines
  // zusammengesetzten Ausdrucks. KEINE Markdown-Auswertung in Zellen: Ein
  // Sternchen im Text bleibt wörtlich, die Auszeichnung entsteht ausschließlich
  // über diesen ausdrücklichen Aufruf (Konzept-Entscheid E10 samt Zusatz).
  ['bold', { arity: [1, 1], fn: ([v]) => boldValue(v) }],
  // 4T-1072 (Epic 3E-0211): Die drei Formatierer folgen der Sprache aus dem
  // Kontext (ctx.locale, gesetzt aus der Fenster-Sprache); fehlt sie, gilt
  // weiterhin die Laufzeit-Locale. Vorher war der Aufruf sprachfrei, was bei
  // Datums-Namen kaum und bei Währungen sofort auffiel (Konzept-Entscheid E7).
  [
    'dateformat',
    {
      arity: [2, 2],
      fn: ([v, fmt], ctx) => {
        const ms = coerceDateMs(v);
        if (ms === null || typeof fmt !== 'string') return null;
        return formatDateMs(ms, fmt, ctx && ctx.locale);
      },
    },
  ],
  [
    'numberformat',
    {
      arity: [1, 2],
      fn: ([v, digits], ctx) => formatNumberMs(coerceNumber(v), ctx && ctx.locale, digits),
    },
  ],
  [
    'currencyformat',
    {
      arity: [1, 2],
      fn: ([v, currency], ctx) => formatCurrencyValue(coerceNumber(v), ctx && ctx.locale, currency),
    },
  ],
  // 4T-1071 (Epic 3E-0211): Tages-Zahl einer Dauer, etwa
  // `days(date(today) - file.day)`. GERUNDET, nicht abgeschnitten: Eine Spanne
  // über eine Zeitumstellung hinweg ist um eine Stunde kürzer oder länger als
  // ein Vielfaches von 24 Stunden, ein Abschneiden lieferte dann 47 statt 48.
  // Dieselbe Begründung trägt die ausdrückliche Rundung in isoWeekOf
  // (query-format.js). Nicht-Dauern ergeben null (weiche Fehler, Entscheid E4).
  [
    'days',
    { arity: [1, 1], fn: ([v]) => (isDur(v) ? Math.round(v.ms / (24 * 60 * 60 * 1000)) : null) },
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
      // 4T-1070 (Epic 3E-0211): auch der Selbstbezug auf die Link-Listen zählt
      // (`this.file.inlinks`), sonst bliebe der Graph ungebaut und das Feld
      // still leer.
      const lower = String(node.name)
        .toLowerCase()
        .replace(/^this\./, '');
      if (lower === 'file.inlinks' || lower === 'file.outlinks') found = true;
      return;
    }
    // 4T-1070: srcSelf braucht den Graphen ebenso wie srcLink.
    if (node.type === 'srcLink' || node.type === 'srcSelf') {
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
