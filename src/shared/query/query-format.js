'use strict';

// 4T-0987 (Epic 3E-0196): Werte-Modell und Anzeige-Form der Perspective-
// Query-Sprache, herausgelöst aus perspective-query-eval.js. Das Modul
// beantwortet zwei zusammengehörige Fragen über einen Abfrage-Wert: was er
// ist (Typ-Prüfer, Koerzierung, Wahrheitswert, Gleichheit) und wie er
// gelesen wird (Datum, Dauer, Anzeige-String, Anzeige-Segmente, kanonischer
// Ausdrucks-Quelltext).
//
// Es ist das Blatt des Ordners `query/`: außer der Namens-Normalisierung
// des Link-Vergleichs lädt es nichts, und Kern, Funktions-Katalog und
// Task-Feld-Katalog laden von hier. Deshalb liegen die geteilten
// Werte-Helfer hier und nicht im Kern; das hält den Import-Graphen des
// Ordners kreisfrei, statt sie zu duplizieren. Die Ordnungs-Relation
// (orderValues) bleibt im Kern, weil sie nur dort gebraucht wird.
//
// Werte-Modell (JS-Repräsentation der Abfrage-Werte):
//   null                  fehlend / nicht auswertbar (Fehler sind weich)
//   string / number / boolean  Skalare (Frontmatter liefert je nach Quelle
//                         rohe Strings oder rohe YAML-Skalare — beides gültig)
//   { kind: 'date', ms }  Zeitpunkt (Epoch-Millisekunden, lokale Interpretation)
//   { kind: 'dur',  ms }  Dauer (Millisekunden; Monat/Jahr fixe Näherung, siehe Parser)
//   { kind: 'link', path, name }  Datei-Verweis (absoluter Pfad, logischer Name)
//   Array                 Liste von Werten

// 4T-0344 (Epic 3E-0062): dieselbe Namens-Normalisierung wie Wiki-Aufloesung
// und Backlinks-Index (NFC + lowercase), damit Link-Vergleiche der Abfrage
// dieselben Treffer sehen wie der Klick-Pfad.
const { normalizeNameKey } = require('../markdown/link-scan.js');

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

module.exports = {
  isDate,
  isDur,
  isLink,
  parseIsoLocalMs,
  coerceDateMs,
  coerceNumber,
  coerceBool,
  truthy,
  equalsValue,
  dateToIsoString,
  isoWeekOf,
  formatDateMs,
  durToString,
  formatValue,
  formatValueSegments,
  formatExprSource,
};
