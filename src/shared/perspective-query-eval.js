'use strict';

// 4T-0402 (Epic 3E-0076): Typ-System, Funktions-Katalog und Auswertung der
// Perspective-Query-Sprache. Gegenstück zum Parser in perspective-query.js
// (der den Fence-Body in den Abfrage-AST zerlegt); eigenes Modul, damit beide
// unter dem 1000-Zeilen-Leitwert bleiben und je EIN Thema tragen: dort die
// Sprache, hier die Werte. Prozess-neutral (kein Electron, kein DOM), kein
// eval — die Auswertung läuft ausschließlich über den AST-Walker.
//
// Werte-Modell (JS-Repräsentation der Abfrage-Werte):
//   null                  fehlend / nicht auswertbar (Fehler sind weich)
//   string / number / boolean  Skalare (Frontmatter liefert je nach Quelle
//                         rohe Strings oder rohe YAML-Skalare — beides gültig)
//   { kind: 'date', ms }  Zeitpunkt (Epoch-Millisekunden, lokale Interpretation)
//   { kind: 'dur',  ms }  Dauer (Millisekunden; Monat/Jahr fixe Näherung, siehe Parser)
//   { kind: 'link', path, name }  Datei-Verweis (absoluter Pfad, logischer Name)
//   Array                 Liste von Werten
//
// Kontext-Struktur (pro Datei vom Aufrufer bereitgestellt, alle Teile optional):
//   ctx = {
//     props,             Frontmatter-Properties (lowercase-Schlüssel -> Skalar/Liste)
//     file: {            implizite Datei-Felder (Namensraum `file.`)
//       name, folder, path, ext,      Strings (folder/path wurzel-relativ, '/');
//       size, ctimeMs, mtimeMs,       Zahlen (Epoch-ms; 0/fehlend -> null),
//       tags, aliases,                String-Listen,
//       inlinks, outlinks,            Listen von { path, name }
//     },
//     now,               Bezugszeitpunkt für date(today)/date(now) (Epoch-ms)
//     resolveLinkTarget, (targetText) -> Set<pfad-lowercase> für FROM-Link-Quellen
//     block,             4T-0409 (Epic 3E-0077): Block-Kontext des BLOCKS-Scopes
//                        { anchor, values, updatedMs } — pro Block-Treffer;
//                        fehlt auf Datei-Ebene (Datei-Scope unverändert)
//     task,              4T-0502 (Epic 3E-0096): Task-Kontext des TASKS-Scopes
//                        { model (Task-Modell aus task-markers.js), line,
//                          heading, statusType, description, tags, urgency
//                          (4T-0505, vorberechneter Score) } — pro
//                        Task-Treffer; fehlt in den anderen Scopes
//   }
//
// Semantik-Grundsätze:
// - Alt-Verhalten bleibt exakt erhalten: `=`/`!=`/IN/NOT IN vergleichen Strings
//   case-insensitiv, Listen als Mitgliedschaft; fehlendes Feld macht `=` falsch
//   und `!=` wahr.
// - Typ-Fehler sind weich: nicht auswertbare Ausdrücke ergeben null, Vergleiche
//   mit null sind falsch (außer der Ungleichheit). Kein Wurf zur Laufzeit.
// - Ordnungs-Vergleiche typ-gerecht: Datum chronologisch (ISO-Strings werden
//   als Datum erkannt), Zahl numerisch (auch Zahl-Strings), String
//   lexikographisch case-insensitiv.

// 4T-0344 (Epic 3E-0062): dieselbe Namens-Normalisierung wie Wiki-Aufloesung
// und Backlinks-Index (NFC + lowercase), damit Link-Vergleiche der Abfrage
// dieselben Treffer sehen wie der Klick-Pfad.
const { normalizeNameKey } = require('./markdown/link-scan.js');
// 4T-0502 (Epic 3E-0096): Prioritaets-Rang des Marker-Kerns fuer das
// Task-Feld priority.rank (Ordnung der sechs Stufen, 0 = dringlichste).
const { priorityRank, TASK_DATE_FIELDS } = require('./task-markers.js');

// --- Werte-Helfer ------------------------------------------------------------

function isDate(v) {
  return !!v && typeof v === 'object' && v.kind === 'date';
}
function isDur(v) {
  return !!v && typeof v === 'object' && v.kind === 'dur';
}
function isLink(v) {
  return !!v && typeof v === 'object' && v.kind === 'link';
}

// ISO-artiger Datums-String (JJJJ-MM-TT, optional Uhrzeit mit T oder
// Leerzeichen). Bewusst lokal interpretiert (kein UTC-Shift wie bei
// new Date('JJJJ-MM-TT')), damit Frontmatter-Daten und Datei-Zeiten in
// derselben Zeitachse liegen.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function parseIsoLocalMs(s) {
  const m = ISO_DATE_RE.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    m[4] ? parseInt(m[4], 10) : 0,
    m[5] ? parseInt(m[5], 10) : 0,
    m[6] ? parseInt(m[6], 10) : 0,
  );
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Datum-Koerzierung: Datums-Wert oder ISO-artiger String -> Epoch-ms.
function coerceDateMs(v) {
  if (isDate(v)) return v.ms;
  if (typeof v === 'string') return parseIsoLocalMs(v);
  return null;
}

// Zahl-Koerzierung: Zahl oder Zahl-String -> Zahl.
function coerceNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

// Boolean-Koerzierung: echte Booleans plus die String-Formen 'true'/'false'
// (Frontmatter-Werte kommen aus dem Index als Strings an).
function coerceBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return null;
}

// Wahrheitswert eines Abfrage-Werts (für AND/OR/NOT, WHERE-Ergebnis, choice).
// String-Sonderfall: 'false' ist falsch, weil boolesche Frontmatter-Werte als
// Strings im Index liegen; jeder andere nicht-leere String ist wahr.
function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const b = coerceBool(v);
    return b === null ? v !== '' : b;
  }
  if (Array.isArray(v)) return v.length > 0;
  if (isDur(v)) return v.ms !== 0;
  return true; // date, link
}

// Gleichheit zweier Werte. Listen gegen Skalar = Mitgliedschaft (Alt-Semantik
// des Listen-Felds); Strings case-insensitiv; Zahl gegen Zahl-String numerisch;
// Links über den logischen Namen (normalizeNameKey, wie die Wiki-Aufloesung).
function equalsValue(a, b) {
  const aList = Array.isArray(a);
  const bList = Array.isArray(b);
  if (aList && !bList) return a.some((x) => equalsValue(x, b));
  if (bList && !aList) return b.some((x) => equalsValue(x, a));
  if (aList && bList) return a.length === b.length && a.every((x, i) => equalsValue(x, b[i]));
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (isLink(a) || isLink(b)) {
    const an = isLink(a) ? a.name : a;
    const bn = isLink(b) ? b.name : b;
    if (typeof an !== 'string' || typeof bn !== 'string') return false;
    return normalizeNameKey(an) === normalizeNameKey(bn);
  }
  if (isDate(a) || isDate(b)) {
    const am = coerceDateMs(a);
    const bm = coerceDateMs(b);
    return am !== null && bm !== null && am === bm;
  }
  if (isDur(a) || isDur(b)) {
    return isDur(a) && isDur(b) && a.ms === b.ms;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ab = coerceBool(a);
    const bb = coerceBool(b);
    return ab !== null && bb !== null && ab === bb;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    return an !== null && bn !== null && an === bn;
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

// Ordnung zweier Werte: -1/0/1 oder null (nicht vergleichbar). Datum vor Zahl
// prüfen, damit ISO-Strings gegen Datums-Werte chronologisch laufen.
function orderValues(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (Array.isArray(a) || Array.isArray(b)) return null;
  if (isDate(a) || isDate(b)) {
    const am = coerceDateMs(a);
    const bm = coerceDateMs(b);
    if (am === null || bm === null) return null;
    return am < bm ? -1 : am > bm ? 1 : 0;
  }
  if (isDur(a) || isDur(b)) {
    if (!isDur(a) || !isDur(b)) return null;
    return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    if (an === null || bn === null) return null;
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    // Beide ISO-Daten -> chronologisch (deckt Frontmatter-Datum gegen
    // Frontmatter-Datum ab, ohne dass eine Seite ein Datums-Wert ist).
    const am = parseIsoLocalMs(a);
    const bm = parseIsoLocalMs(b);
    if (am !== null && bm !== null) return am < bm ? -1 : am > bm ? 1 : 0;
    // Beide Zahl-Strings -> numerisch ('10' liegt ueber '5', nicht davor);
    // Frontmatter-Zahlen kommen aus dem Index als Strings an.
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    if (an !== null && bn !== null) return an < bn ? -1 : an > bn ? 1 : 0;
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  }
  return null;
}

// --- Anzeige-Formatierung -----------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Datum -> ISO-String (lokal); Uhrzeit nur, wenn sie nicht 00:00:00 ist.
function dateToIsoString(ms) {
  const d = new Date(ms);
  const datePart = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return datePart;
  return `${datePart} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// 4T-0432 (Epic 3E-0081): ISO-8601-Kalenderwoche eines Zeitpunkts (lokal):
// Montag-Start, KW-Zählung mit Donnerstags-Regel. Das KW-Jahr kann vom
// Kalenderjahr abweichen (Jahreswechsel-Wochen). Liefert { week, year }.
function isoWeekOf(ms) {
  const d = new Date(ms);
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = Montag
  // Donnerstag der Woche des Datums bestimmt KW-Jahr und KW-Nummer.
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4); // liegt immer in KW 1
  const firstThursday = new Date(
    jan4.getFullYear(),
    0,
    jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3,
  );
  // Math.round fängt DST-bedingte ±1h-Abweichungen der lokalen Differenz ab.
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 86400000));
  return { week, year: thursday.getFullYear() };
}

// Kuratierte Format-Token (yyyy, MM, dd, HH, mm, ss, ww, kkkk, q) auf einen
// Zeitpunkt anwenden; längste zuerst, ein Pass. 4T-0425 (Epic 3E-0080): aus
// der dateformat-Funktion extrahiert und exportiert — dieselbe Format-Sprache
// gilt für die Datums-Platzhalter der Vorlagen (Architekturentscheidung 5).
// 4T-0432/4T-0438 (Epic 3E-0081): ww (ISO-Kalenderwoche, zweistellig), kkkk
// (ISO-KW-Jahr) und q (Quartals-Nummer 1–4) für die Journal-Schemata — z.B.
// 'kkkk-KWww' -> '2026-KW28', 'yyyy-Qq' -> '2026-Q3' (Großbuchstaben wie
// 'KW'/'Q' sind keine Token und bleiben Literal).
function formatDateMs(ms, fmt) {
  const d = new Date(ms);
  return String(fmt).replace(/kkkk|yyyy|MM|dd|HH|mm|ss|ww|q/g, (tok) => {
    switch (tok) {
      case 'kkkk':
        return String(isoWeekOf(ms).year);
      case 'yyyy':
        return String(d.getFullYear());
      case 'MM':
        return pad2(d.getMonth() + 1);
      case 'dd':
        return pad2(d.getDate());
      case 'HH':
        return pad2(d.getHours());
      case 'mm':
        return pad2(d.getMinutes());
      case 'ss':
        return pad2(d.getSeconds());
      case 'ww':
        return pad2(isoWeekOf(ms).week);
      case 'q':
        return String(Math.floor(d.getMonth() / 3) + 1);
      default:
        return tok;
    }
  });
}

// Dauer -> kompakte Einheiten-Kette ('7d', '1d 2h', '90s').
function durToString(ms) {
  let rest = Math.abs(Math.round(ms / 1000));
  const sign = ms < 0 ? '-' : '';
  const parts = [];
  const units = [
    ['d', 24 * 60 * 60],
    ['h', 60 * 60],
    ['min', 60],
    ['s', 1],
  ];
  for (const [label, secs] of units) {
    const n = Math.floor(rest / secs);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rest -= n * secs;
    }
  }
  return sign + (parts.length ? parts.join(' ') : '0s');
}

// Wert -> Anzeige-String (string()-Funktion; 4T-0404 nutzt dieselbe Form für
// Tabellen-Zellen). null -> leerer String.
function formatValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(', ');
  if (isDate(v)) return dateToIsoString(v.ms);
  if (isDur(v)) return durToString(v.ms);
  if (isLink(v)) return v.name || '';
  return String(v);
}

// --- Anzeige-Segmente und Ausdrucks-Quelltext (4T-0404) -------------------------

// Zerlegt einen Abfrage-Wert in Anzeige-Segmente für Tabellen-Zellen und das
// LIST-Zusatzfeld: reiner Text ({ text }) und klickbare Datei-Verweise
// ({ link: { path, name } }); Listen kommagetrennt. Die View baut daraus
// Text-Knoten bzw. Links mit dem bestehenden data-fm-path-Klick-Pfad.
function formatValueSegments(v) {
  if (v === null || v === undefined) return [];
  if (isLink(v)) return [{ link: { path: v.path, name: v.name } }];
  if (Array.isArray(v)) {
    const segs = [];
    v.forEach((x, i) => {
      if (i > 0) segs.push({ text: ', ' });
      for (const s of formatValueSegments(x)) segs.push(s);
    });
    return segs;
  }
  const s = formatValue(v);
  return s === '' ? [] : [{ text: s }];
}

const ARITH_SYMBOL = { add: '+', sub: '-', mul: '*', div: '/' };
const CMP_SYMBOL = { eq: '=', neq: '!=', lt: '<', le: '<=', gt: '>', ge: '>=' };

// Kanonischer Quelltext eines Ausdrucks-Knotens — Fallback für Tabellen-
// Kopfzeilen ohne AS-Alias (Feld-Name, Funktions-Aufruf, Arithmetik).
// Klammern des Originals gehen verloren (Präzedenz-neutral formatiert);
// für die Kopfzeile ist die kompakte Form gewollt.
function formatExprSource(node) {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'field':
      return node.name;
    case 'str':
      return `"${node.value}"`;
    case 'num':
      return String(node.value);
    case 'date':
      return `date(${node.value})`;
    case 'dur':
      return `dur(${durToString(node.ms)})`;
    case 'call':
      return `${node.name}(${node.args.map(formatExprSource).join(', ')})`;
    case 'neg':
      return `-${formatExprSource(node.operand)}`;
    case 'arith':
      return `${formatExprSource(node.left)} ${ARITH_SYMBOL[node.op]} ${formatExprSource(node.right)}`;
    case 'cmp':
      return `${formatExprSource(node.left)} ${CMP_SYMBOL[node.op]} ${formatExprSource(node.right)}`;
    case 'inlist':
      return `${formatExprSource(node.left)} ${node.op === 'in' ? 'IN' : 'NOT IN'} (${node.values
        .map(formatExprSource)
        .join(', ')})`;
    case 'and':
      return `${formatExprSource(node.left)} AND ${formatExprSource(node.right)}`;
    case 'or':
      return `${formatExprSource(node.left)} OR ${formatExprSource(node.right)}`;
    case 'not':
      return `NOT ${formatExprSource(node.operand)}`;
    default:
      return '';
  }
}

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

// --- Feld-Auflösung -------------------------------------------------------------

function lookupProp(propsMap, field) {
  const key = String(field).toLowerCase();
  if (propsMap instanceof Map) return propsMap.get(key);
  if (propsMap && typeof propsMap === 'object') return propsMap[key];
  return undefined;
}

function toLinkValue(l) {
  return { kind: 'link', path: l.path, name: l.name };
}

// 4T-0502 (Epic 3E-0096): Termin-Feld des Task-Modells -> Abfrage-Datum.
// Fehlende und ungueltige Werte sind null (nicht rechenbar); die Existenz-
// und Gueltigkeits-Fragen tragen die Zusatz-Felder <feld>.set/<feld>.invalid.
function taskDateToQueryValue(v) {
  if (!v || v.invalid) return null;
  const ms = parseIsoLocalMs(v.time ? `${v.date} ${v.time}` : v.date);
  return ms === null ? null : { kind: 'date', ms };
}

// Task-Feld-Katalog des TASKS-Scopes. undefined = kein Task-Feld (der
// Aufrufer faellt auf die Frontmatter der Traeger-Datei zurueck); null =
// Task-Feld ohne Wert. Die festen Feld-Namen verdecken gleichnamige
// Frontmatter-Properties (Referenz-Verhalten des Scopes, dokumentiert).
function resolveTaskField(lower, task) {
  const model = task.model || {};
  if (TASK_DATE_FIELDS.includes(lower)) return taskDateToQueryValue(model[lower]);
  const dotIdx = lower.indexOf('.');
  if (dotIdx > 0) {
    const base = lower.slice(0, dotIdx);
    const sub = lower.slice(dotIdx + 1);
    if (TASK_DATE_FIELDS.includes(base)) {
      if (sub === 'set') return model[base] != null;
      if (sub === 'invalid') return model[base] ? !!model[base].invalid : false;
      return undefined;
    }
    if (base === 'priority' && sub === 'rank') return priorityRank(model.priority);
    if (base === 'status' && sub === 'type') return task.statusType || null;
    // 4T-0508: ID-Zusatz-Felder ("hat ID" und Duplikat-Filter der
    // Eindeutigkeits-Pruefung; Flags kommen vorberechnet vom Aufrufer).
    if (base === 'id' && sub === 'set') return !!model.id;
    if (base === 'id' && sub === 'duplicate') return task.duplicateId === true;
    return undefined;
  }
  switch (lower) {
    case 'happens': {
      // Fruehestes gueltiges aus faellig/geplant/Start (Referenz-Semantik).
      let min = null;
      for (const f of ['due', 'scheduled', 'start']) {
        const v = taskDateToQueryValue(model[f]);
        if (v && (min === null || v.ms < min.ms)) min = v;
      }
      return min;
    }
    case 'priority':
      return model.priority || 'normal';
    case 'status':
      return model.statusChar != null ? model.statusChar : null;
    case 'description':
      return typeof task.description === 'string' ? task.description : null;
    case 'heading':
      return task.heading || null;
    case 'tags':
      return Array.isArray(task.tags) ? task.tags : [];
    case 'recurrence':
      return model.recurrence ? model.recurrence.text : null;
    case 'id':
      return model.id || null;
    case 'dependson':
      return Array.isArray(model.dependsOn) ? model.dependsOn : [];
    case 'line':
      return typeof task.line === 'number' ? task.line : null;
    case 'urgency':
      // 4T-0505: Dringlichkeits-Score — vorberechnet vom Aufrufer
      // (computeUrgency mit injiziertem Bezugstag, siehe backlinks.js).
      return typeof task.urgency === 'number' ? task.urgency : null;
    case 'blocked':
      // 4T-0508: Blockierungs-Flags (offene Vorgaenger / blockiert andere),
      // vorberechnet ueber die Task-Menge des Bereichs (computeDependencyFlags).
      return task.blocked === true;
    case 'blocking':
      return task.blocking === true;
    default:
      return undefined;
  }
}

// Löst einen Feld-Pfad gegen den Kontext auf. `file.*` gegen die Datei-Felder,
// alles andere wie bisher als nackter Frontmatter-Name.
//
// 4T-0409 (Epic 3E-0077): Im Block-Scope (ctx.block gesetzt) lösen nackte
// Feldnamen zuerst gegen die Block-Eigenschaften auf und fallen sonst auf die
// Frontmatter-Properties der Träger-Datei zurück (der Block „erbt" seinen
// Datei-Kontext); `updated` steht als Block-Meta-Feld (Datums-Wert) bereit,
// sofern der Block keine eigene Eigenschaft dieses Namens trägt (eigene Daten
// werden nie verdeckt). `file.*` bleibt unverändert die Träger-Datei.
function resolveField(name, ctx) {
  const lower = String(name).toLowerCase();
  if (lower.startsWith('file.')) {
    const f = ctx && ctx.file;
    if (!f) return null;
    switch (lower.slice(5)) {
      case 'name':
        return typeof f.name === 'string' ? f.name : null;
      case 'folder':
        return typeof f.folder === 'string' ? f.folder : null;
      case 'path':
        return typeof f.path === 'string' ? f.path : null;
      case 'ext':
        return typeof f.ext === 'string' ? f.ext : null;
      case 'size':
        return typeof f.size === 'number' ? f.size : null;
      case 'ctime':
        return typeof f.ctimeMs === 'number' && f.ctimeMs > 0
          ? { kind: 'date', ms: f.ctimeMs }
          : null;
      case 'mtime':
        return typeof f.mtimeMs === 'number' && f.mtimeMs > 0
          ? { kind: 'date', ms: f.mtimeMs }
          : null;
      case 'link':
        // path des Link-Werts ist der absolute Index-Pfad (Klick-/Vergleichs-
        // Schlüssel), name der logische Anzeige-Name.
        return typeof f.absPath === 'string'
          ? { kind: 'link', path: f.absPath, name: f.name }
          : null;
      case 'tags':
        return Array.isArray(f.tags) ? f.tags : [];
      case 'aliases':
        return Array.isArray(f.aliases) ? f.aliases : [];
      case 'inlinks':
        return Array.isArray(f.inlinks) ? f.inlinks.map(toLinkValue) : [];
      case 'outlinks':
        return Array.isArray(f.outlinks) ? f.outlinks.map(toLinkValue) : [];
      default:
        return null;
    }
  }
  // 4T-0502 (Epic 3E-0096): Im Task-Scope (ctx.task gesetzt) loesen die
  // festen Task-Feld-Namen zuerst auf; unbekannte Namen fallen wie im
  // Block-Scope auf die Frontmatter-Properties der Traeger-Datei zurueck.
  const task = ctx && ctx.task;
  if (task) {
    const tv = resolveTaskField(lower, task);
    if (tv !== undefined) return tv;
  }
  const block = ctx && ctx.block;
  if (block) {
    const bv = block.values ? block.values[lower] : undefined;
    if (bv !== undefined) return bv;
    if (lower === 'updated') {
      return typeof block.updatedMs === 'number' ? { kind: 'date', ms: block.updatedMs } : null;
    }
  }
  const raw = lookupProp(ctx && ctx.props, lower);
  return raw === undefined ? null : raw;
}

// --- Ausdrucks-Auswertung --------------------------------------------------------

// 4T-0502 (Epic 3E-0096): relative Datums-Woerter der date(...)-Literale.
// Kalender-Arithmetik ueber den Date-Konstruktor (lokal, DST-sicher durch
// Tag-Ueberlauf-Normalisierung). Start-Woerter liefern 00:00, End-Woerter
// das Tages-Ende (23:59:59.999), damit `<= date(eow)` den letzten Tag der
// Periode vollstaendig einschliesst. Woche ab Montag (ISO, wie isoWeekOf).
function relativeDateMs(word, nowMs) {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const startOf = (yy, mm, dd) => new Date(yy, mm, dd).getTime();
  const endOf = (yy, mm, dd) => new Date(yy, mm, dd, 23, 59, 59, 999).getTime();
  switch (word) {
    case 'today':
      return startOf(y, m, day);
    case 'now':
      return nowMs;
    case 'tomorrow':
      return startOf(y, m, day + 1);
    case 'yesterday':
      return startOf(y, m, day - 1);
    case 'sow': {
      const mondayOffset = (d.getDay() + 6) % 7; // 0 = Montag
      return startOf(y, m, day - mondayOffset);
    }
    case 'eow': {
      const mondayOffset = (d.getDay() + 6) % 7;
      return endOf(y, m, day - mondayOffset + 6);
    }
    case 'som':
      return startOf(y, m, 1);
    case 'eom':
      return endOf(y, m + 1, 0); // Tag 0 des Folgemonats = Monatsletzter
    case 'soy':
      return startOf(y, 0, 1);
    case 'eoy':
      return endOf(y, 11, 31);
    default:
      return null;
  }
}

// Wertet einen Ausdrucks-Knoten zum Wert aus (Werte-Modell oben). Boolesche
// Knoten liefern JS-Booleans; nicht auswertbare Kombinationen null.
function evaluateExpression(node, ctx) {
  if (!node || typeof node !== 'object') return null;
  switch (node.type) {
    case 'str':
      return node.value;
    case 'num':
      return node.value;
    case 'date': {
      const now = ctx && typeof ctx.now === 'number' ? ctx.now : Date.now();
      // 4T-0502 (Epic 3E-0096): relative Woerter (today, now, tomorrow,
      // yesterday, sow/eow/som/eom/soy/eoy) rechnen relativ zu ctx.now.
      const rel = /^[a-z]+$/.test(node.value) ? relativeDateMs(node.value, now) : null;
      if (rel !== null) return { kind: 'date', ms: rel };
      const ms = parseIsoLocalMs(node.value);
      return ms === null ? null : { kind: 'date', ms };
    }
    case 'dur':
      return { kind: 'dur', ms: node.ms };
    case 'field':
      return resolveField(node.name, ctx);
    case 'call': {
      const def = FUNCTIONS.get(node.name);
      if (!def) return null;
      const args = node.args.map((a) => evaluateExpression(a, ctx));
      return def.fn(args, ctx);
    }
    case 'neg': {
      const v = evaluateExpression(node.operand, ctx);
      const n = coerceNumber(v);
      if (n !== null && !isDur(v)) return -n;
      if (isDur(v)) return { kind: 'dur', ms: -v.ms };
      return null;
    }
    case 'arith': {
      const a = evaluateExpression(node.left, ctx);
      const b = evaluateExpression(node.right, ctx);
      return evaluateArith(node.op, a, b);
    }
    case 'or':
      return (
        truthy(evaluateExpression(node.left, ctx)) || truthy(evaluateExpression(node.right, ctx))
      );
    case 'and':
      return (
        truthy(evaluateExpression(node.left, ctx)) && truthy(evaluateExpression(node.right, ctx))
      );
    case 'not':
      return !truthy(evaluateExpression(node.operand, ctx));
    case 'cmp': {
      const a = evaluateExpression(node.left, ctx);
      const b = evaluateExpression(node.right, ctx);
      if (node.op === 'eq') return equalsValue(a, b);
      if (node.op === 'neq') return !equalsValue(a, b);
      const ord = orderValues(a, b);
      if (ord === null) return false;
      if (node.op === 'lt') return ord < 0;
      if (node.op === 'le') return ord <= 0;
      if (node.op === 'gt') return ord > 0;
      if (node.op === 'ge') return ord >= 0;
      return false;
    }
    case 'inlist': {
      const left = evaluateExpression(node.left, ctx);
      const hit = node.values.some((v) => equalsValue(left, evaluateExpression(v, ctx)));
      return node.op === 'in' ? hit : !hit;
    }
    default:
      return null;
  }
}

function evaluateArith(op, a, b) {
  if (op === 'add') {
    if (isDate(a) && isDur(b)) return { kind: 'date', ms: a.ms + b.ms };
    if (isDur(a) && isDate(b)) return { kind: 'date', ms: b.ms + a.ms };
    if (isDur(a) && isDur(b)) return { kind: 'dur', ms: a.ms + b.ms };
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    return an !== null && bn !== null ? an + bn : null;
  }
  if (op === 'sub') {
    if (isDate(a) && isDur(b)) return { kind: 'date', ms: a.ms - b.ms };
    if (isDate(a) && isDate(b)) return { kind: 'dur', ms: a.ms - b.ms };
    if (isDur(a) && isDur(b)) return { kind: 'dur', ms: a.ms - b.ms };
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    return an !== null && bn !== null ? an - bn : null;
  }
  const an = coerceNumber(a);
  const bn = coerceNumber(b);
  if (an === null || bn === null) return null;
  if (op === 'mul') return an * bn;
  if (op === 'div') return bn === 0 ? null : an / bn;
  return null;
}

// --- Quellen-Auswertung (FROM) ----------------------------------------------------

// Normalisiert eine Ordner-Angabe der Quelle: Backslashes zu '/', führende und
// schließende Slashes weg, lowercase (Windows-Dateisystem ist case-insensitiv).
function normFolder(s) {
  return String(s || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function matchesSource(node, ctx) {
  if (!node) return true;
  const f = ctx && ctx.file;
  switch (node.type) {
    case 'srcOr':
      return matchesSource(node.left, ctx) || matchesSource(node.right, ctx);
    case 'srcAnd':
      return matchesSource(node.left, ctx) && matchesSource(node.right, ctx);
    case 'srcNot':
      return !matchesSource(node.operand, ctx);
    case 'srcFolder': {
      if (!f || typeof f.folder !== 'string') return false;
      const wanted = normFolder(node.value);
      if (!wanted) return true; // leerer Ordner-String = Wurzel = alles
      const folder = normFolder(f.folder);
      return folder === wanted || folder.startsWith(wanted + '/');
    }
    case 'srcTag': {
      if (!f || !Array.isArray(f.tags)) return false;
      const wanted = String(node.value).toLowerCase();
      // Hierarchisch: #projekt trifft auch projekt/unterprojekt.
      return f.tags.some((t) => {
        const tl = String(t).toLowerCase();
        return tl === wanted || tl.startsWith(wanted + '/');
      });
    }
    case 'srcLink': {
      if (!f || !ctx || typeof ctx.resolveLinkTarget !== 'function') return false;
      const targetPaths = ctx.resolveLinkTarget(node.target);
      if (!targetPaths || targetPaths.size === 0) return false;
      // mode 'in':  Dateien, die auf X verlinken  -> eigene outlinks treffen X.
      // mode 'out': Dateien, auf die X verlinkt   -> eigene inlinks kommen von X.
      const links = node.mode === 'in' ? f.outlinks : f.inlinks;
      if (!Array.isArray(links)) return false;
      return links.some((l) => targetPaths.has(String(l.path).toLowerCase()));
    }
    default:
      return false;
  }
}

// --- Abfrage-Auswertung ------------------------------------------------------------

// Prüft eine Datei (über ihren Kontext) gegen den Abfrage-AST: FROM-Quelle und
// WHERE-Bedingung müssen beide zutreffen. Sortierung, Limit und Spalten-
// Auswertung sind Sache der Ergebnis-Pipeline (4T-0403/4T-0404).
function matchesQuery(queryAst, ctx) {
  if (!queryAst) return false;
  if (queryAst.type !== 'list' && queryAst.type !== 'table') {
    return truthy(evaluateExpression(queryAst, ctx));
  }
  if (queryAst.source && !matchesSource(queryAst.source, ctx)) return false;
  if (queryAst.where && !truthy(evaluateExpression(queryAst.where, ctx))) return false;
  return true;
}

// --- Ergebnis-Pipeline (4T-0403): Sortierung und Limit -------------------------

// Sortier-Ordnung zweier Werte. Wie orderValues, aber Strings locale-bewusst
// über localeCompare (case-insensitiv via Lowercase), damit Umlaute und
// Akzente natürlich einsortieren; nicht Vergleichbares meldet null und lässt
// die Ausgangs-Reihenfolge (stabile Sortierung) bestehen.
function orderForSort(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    const am = parseIsoLocalMs(a);
    const bm = parseIsoLocalMs(b);
    if (am !== null && bm !== null) return am < bm ? -1 : am > bm ? 1 : 0;
    // Zahl-Strings numerisch, wie orderValues (konsistente Ordnung in
    // WHERE-Vergleich und SORT).
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    if (an !== null && bn !== null) return an < bn ? -1 : an > bn ? 1 : 0;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  }
  return orderValues(a, b);
}

// Wendet SORT und LIMIT des Abfrage-ASTs auf die gefilterten Kontexte an.
// rows ist die Treffer-Liste in Basis-Ordnung (alphabetisch, vom Aufrufer);
// ohne SORT bleibt sie unverändert (Alt-Verhalten). Mehrfach-Schlüssel werden
// pro Zeile einmal ausgewertet (Schwartzian-Muster, keine Mehrfach-Auswertung
// im Komparator); fehlende Werte (null) sortieren unabhängig von der Richtung
// ans Ende; letzter Tiebreaker ist der Datei-Pfad (Determinismus, kein
// Flackern bei Live-Updates). LIMIT schneidet nach der Sortierung.
function applyResultPipeline(rows, queryAst) {
  let out = rows;
  const sortSpec = (queryAst && queryAst.sort) || [];
  if (sortSpec.length > 0) {
    const decorated = rows.map((ctx, idx) => ({
      ctx,
      idx,
      keys: sortSpec.map((s) => evaluateExpression(s.key, ctx)),
    }));
    decorated.sort((a, b) => {
      for (let i = 0; i < sortSpec.length; i++) {
        const av = a.keys[i];
        const bv = b.keys[i];
        const aNull = av === null || av === undefined;
        const bNull = bv === null || bv === undefined;
        if (aNull && bNull) continue;
        if (aNull) return 1; // fehlende Werte immer ans Ende
        if (bNull) return -1;
        const ord = orderForSort(av, bv);
        if (ord === null || ord === 0) continue;
        return sortSpec[i].dir === 'desc' ? -ord : ord;
      }
      const ap = (a.ctx.file && a.ctx.file.path) || '';
      const bp = (b.ctx.file && b.ctx.file.path) || '';
      const tie = ap.localeCompare(bp);
      // Bei identischem Pfad (theoretisch) die Eingangs-Ordnung halten.
      return tie !== 0 ? tie : a.idx - b.idx;
    });
    out = decorated.map((d) => d.ctx);
  }
  if (queryAst && typeof queryAst.limit === 'number') {
    out = out.slice(0, queryAst.limit);
  }
  return out;
}

// Rückwärts-kompatible Kurzform (Alt-API aus frontmatter-query.js, von den
// Bestands-Tests und einfachen Aufrufern genutzt): wertet nur die WHERE-
// Bedingung gegen eine reine Properties-Map aus; file.*-Felder sind ohne
// Datei-Kontext null, eine FROM-Quelle wird hier bewusst ignoriert.
function evaluateQuery(ast, propsMap) {
  if (!ast) return false;
  const ctx = { props: propsMap || {}, file: null, now: Date.now() };
  if (ast.type === 'list' || ast.type === 'table') {
    return ast.where ? truthy(evaluateExpression(ast.where, ctx)) : true;
  }
  return truthy(evaluateExpression(ast, ctx));
}

module.exports = {
  evaluateQuery,
  matchesQuery,
  evaluateExpression,
  validateQuery,
  queryUsesLinks,
  applyResultPipeline,
  // 4T-0503 (Epic 3E-0096): Werte-Ordnung fuer die Gruppen-Reihenfolge
  // der Task-Gruppierung (dieselbe Ordnung wie SORT).
  orderForSort,
  formatValue,
  formatValueSegments,
  formatExprSource,
  truthy,
  // 4T-0425 (Epic 3E-0080): Format-Kern der Datums-Platzhalter.
  formatDateMs,
  // 4T-0432 (Epic 3E-0081): ISO-KW-Rechnung des Perioden-Kerns.
  isoWeekOf,
};
