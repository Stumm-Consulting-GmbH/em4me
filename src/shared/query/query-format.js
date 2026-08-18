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
//   { kind: 'rich', segs }  ausgezeichneter Anzeige-Wert als Segment-Liste
//                         (4T-1074, Epic 3E-0211). Die Werte-Art trägt eine
//                         Auszeichnung durch die VERKETTUNG hindurch: `+` mit
//                         einem Rich-Operanden verbindet Segment-Listen statt
//                         Zeichenketten, sodass ein TEIL eines zusammen-
//                         gesetzten Ausdrucks hervorgehoben bleiben kann. Nach
//                         außen ist sie ein reiner Anzeige-Wert: formatValue
//                         liefert die Text-Form ohne Marker, und Vergleich,
//                         Ordnung und Wahrheitswert arbeiten auf ebendieser
//                         Text-Form. Eine Abfrage verhält sich mit bold()
//                         darum überall gleich wie ohne.
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
// 4T-1074 (Epic 3E-0211): ausgezeichneter Anzeige-Wert (Segment-Liste).
function isRich(v) {
  return !!v && typeof v === 'object' && v.kind === 'rich' && Array.isArray(v.segs);
}

// Text-Form eines Rich-Werts: die Segmente ohne jede Auszeichnung
// aneinandergehängt. Sie ist der Wert, mit dem Vergleich, Ordnung und
// Gruppierung rechnen — daher verhält sich bold(x) dort exakt wie x.
function richText(v) {
  return v.segs
    .map((s) => (s && s.link ? s.link.name || s.link.path || '' : (s && s.text) || ''))
    .join('');
}

// Entpackt einen Rich-Wert für alles, was nicht Anzeige ist. Jede Stelle, die
// einen Wert VERGLEICHT statt ihn darzustellen, läuft darüber.
function plainValue(v) {
  return isRich(v) ? richText(v) : v;
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
function truthy(vRaw) {
  // 4T-1074: Ein Rich-Wert ist ein Anzeige-Wert; sein Wahrheitswert ist der
  // seiner Text-Form, damit bold(x) in einer Bedingung wie x wirkt.
  const v = plainValue(vRaw);
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
function equalsValue(aRaw, bRaw) {
  // 4T-1074: Rich-Werte vergleichen über ihre Text-Form (siehe plainValue).
  const a = plainValue(aRaw);
  const b = plainValue(bRaw);
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
// 4T-1057 (Epic 3E-0210): sprachabhängiger Namens-Teil über die Standard-
// Schnittstelle der Laufzeit (Muster der Uhr: expliziter Sprach-Tag mit
// Rückfall auf die Laufzeit-Locale). Bewusst keine zweite Datums-Bibliothek
// und keine neuen Übersetzungs-Schlüssel.
function localeDatePart(locale, options, d) {
  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(d);
  }
}

// 4T-1057 (Epic 3E-0210): Token-Erkennung, längste zuerst — ein Monatsname
// (MMMM) darf nie in Monatszahlen (MM) zerfallen, mm (Minuten) bleibt von M
// (Monat ohne führende Null) durch die Groß-Kleinschreibung getrennt.
const DATE_TOKEN_RE = /kkkk|yyyy|MMMM|MMM|MM|EEEE|EEE|dd|HH|mm|ss|ww|M|d|q/g;

function formatDateTokens(ms, teil, locale) {
  const d = new Date(ms);
  return teil.replace(DATE_TOKEN_RE, (tok) => {
    switch (tok) {
      case 'kkkk':
        return String(isoWeekOf(ms).year);
      case 'yyyy':
        return String(d.getFullYear());
      case 'MMMM':
        return localeDatePart(locale, { month: 'long' }, d);
      case 'MMM':
        return localeDatePart(locale, { month: 'short' }, d);
      case 'MM':
        return pad2(d.getMonth() + 1);
      case 'M':
        return String(d.getMonth() + 1);
      case 'EEEE':
        return localeDatePart(locale, { weekday: 'long' }, d);
      case 'EEE':
        return localeDatePart(locale, { weekday: 'short' }, d);
      case 'dd':
        return pad2(d.getDate());
      case 'd':
        return String(d.getDate());
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

// 4T-1057 (Epic 3E-0210): Literal-Schutz per eckiger Klammer — `[der]`
// bleibt wörtlich «der», ohne dass `d` als Tag ersetzt wird. Der Schutz ist
// mit den einstelligen Token `d`/`M` zwingend, weil sonst jedes einzelne
// Vorkommen im Fließtext einer Format-Angabe ersetzt würde. Ein unpaariges
// `[` bleibt Literal, seine Folge-Zeichen durchlaufen die Token-Erkennung.
function formatDateMs(ms, fmt, locale) {
  return String(fmt)
    .split(/(\[[^\]]*\])/)
    .map((teil) =>
      teil.startsWith('[') && teil.endsWith(']') && teil.length >= 2
        ? teil.slice(1, -1)
        : formatDateTokens(ms, teil, locale),
    )
    .join('');
}

// 4T-1072 (Epic 3E-0211): Zahlen- und Währungs-Formatierung über dieselbe
// Standard-Schnittstelle der Laufzeit, die 4T-1057 für die Monats- und
// Wochentagsnamen gewählt hat (expliziter Sprach-Tag mit Rückfall auf die
// Laufzeit-Locale, keine zweite Bibliothek und keine neuen Übersetzungs-
// Schlüssel). Ein unbekannter Sprach-Tag oder Währungs-Code darf die Zelle
// nicht leeren: Beide Stufen fallen nach unten durch, zuletzt auf die
// unformatierte Zahl.
function formatNumberValue(n, locale, options) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(locale || undefined, options).format(n);
  } catch {
    try {
      return new Intl.NumberFormat(undefined, options).format(n);
    } catch {
      return String(n);
    }
  }
}

// Zahl mit optionaler fester Nachkommastellen-Zahl; ohne Angabe gilt die
// Vorgabe der Locale (Tausender-Trennung, bis zu drei Nachkommastellen).
function formatNumberMs(n, locale, digits) {
  const options = {};
  if (typeof digits === 'number' && Number.isFinite(digits)) {
    const d = Math.max(0, Math.min(20, Math.trunc(digits)));
    options.minimumFractionDigits = d;
    options.maximumFractionDigits = d;
  }
  return formatNumberValue(n, locale, options);
}

// Währungsbetrag; ohne Angabe EUR. Ein unbekannter Code fällt auf die
// unformatierte Zahl zurück, statt eine leere Zelle zu erzeugen.
function formatCurrencyValue(n, locale, currency) {
  const code = typeof currency === 'string' && currency.trim() ? currency.trim() : 'EUR';
  const out = formatNumberValue(n, locale, { style: 'currency', currency: code });
  return out === null ? null : out;
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
  // 4T-1074: Text-Form ohne Marker — string(bold(x)) ist string(x).
  if (isRich(v)) return richText(v);
  return String(v);
}

// --- Anzeige-Segmente und Ausdrucks-Quelltext (4T-0404) -------------------------

// Zerlegt einen Abfrage-Wert in Anzeige-Segmente für Tabellen-Zellen und das
// LIST-Zusatzfeld: reiner Text ({ text }) und klickbare Datei-Verweise
// ({ link: { path, name } }); Listen kommagetrennt. Die View baut daraus
// Text-Knoten bzw. Links mit dem bestehenden data-fm-path-Klick-Pfad.
function formatValueSegments(v) {
  if (v === null || v === undefined) return [];
  // 4T-1074: Rich-Werte tragen ihre Segmente bereits; sie werden flach kopiert,
  // damit kein Aufrufer die Segmente eines Werts nachträglich verändert.
  if (isRich(v)) return v.segs.map((s) => ({ ...s }));
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

// 4T-1074 (Epic 3E-0211): bold(wert) — jedes Anzeige-Segment des Werts bekommt
// die Auszeichnung. Ein fehlender Wert bleibt fehlend, statt eine leere
// Hervorhebung zu erzeugen; Link-Segmente bleiben Link-Segmente und werden
// mit-ausgezeichnet. bold(bold(x)) ist wirkungsgleich mit bold(x), weil die
// Marke ein Schalter am Segment ist und keine Verschachtelung.
function boldValue(v) {
  if (v === null || v === undefined) return null;
  return { kind: 'rich', segs: formatValueSegments(v).map((s) => ({ ...s, bold: true })) };
}

// 4T-1074: Verkettung, sobald eine Seite ausgezeichnet ist. Sie verbindet
// Segment-Listen statt Zeichenketten — genau der Grund für die eigene
// Werte-Art: Die unmarkierte Seite wird zu Segmenten ohne Marke, die markierte
// behält ihre. Ein fehlender Operand macht die ganze Verkettung leer, wie im
// Zeichenketten-Rückfall aus 4T-1071.
function concatRich(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return { kind: 'rich', segs: [...formatValueSegments(a), ...formatValueSegments(b)] };
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
  // 4T-1074 (Epic 3E-0211): ausgezeichneter Anzeige-Wert (Segment-Liste).
  isRich,
  plainValue,
  boldValue,
  concatRich,
  parseIsoLocalMs,
  coerceDateMs,
  coerceNumber,
  coerceBool,
  truthy,
  equalsValue,
  dateToIsoString,
  isoWeekOf,
  formatDateMs,
  // 4T-1072 (Epic 3E-0211): Zahlen- und Währungs-Formatierung.
  formatNumberMs,
  formatCurrencyValue,
  durToString,
  formatValue,
  formatValueSegments,
  formatExprSource,
};
