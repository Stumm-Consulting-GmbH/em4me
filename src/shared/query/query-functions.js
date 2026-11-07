'use strict';

// 4T-000987 (Epic 3E-000196): Funktions-Katalog der Perspective-Query-Sprache
// samt der Validierung, die auf ihm aufsetzt, herausgelöst aus
// perspective-query-eval.js. Enthalten sind die Katalog-Einträge mit ihren
// reinen Implementierungen, die AST-Prüfung auf Funktions-Namen und
// Stelligkeit sowie die Frage, ob eine Abfrage den Link-Graphen braucht.
// Prozess-neutral (kein Electron, kein DOM), kein eval.

// 4T-000344 (Epic 3E-000062): dieselbe Namens-Normalisierung wie Wiki-Aufloesung
// und Backlinks-Index (NFC + lowercase), damit Link-Vergleiche der Abfrage
// dieselben Treffer sehen wie der Klick-Pfad.
const { normalizeNameKey } = require('../markdown/link-scan.js');
const {
  isLink,
  // 4T-001071 (Epic 3E-000211): Typ-Prüfer für days().
  isDur,
  coerceDateMs,
  coerceNumber,
  truthy,
  equalsValue,
  formatDateMs,
  formatValue,
  // 4T-001072 (Epic 3E-000211): Zahlen- und Währungs-Formatierung.
  formatNumberMs,
  formatCurrencyValue,
  // 4T-001074 (Epic 3E-000211): Hervorhebung als Anzeige-Wert.
  boldValue,
  // 4T-002449 (Epic 3E-000378): Meldungs-Wert einer Formel.
  isMessage,
} = require('./query-format.js');
// 4T-001073 (Epic 3E-000211): Die Ordner-Normalisierung der FROM-Quellen-Ebene ist
// der EINE Ordner-Begriff der Sprache; `infolder` benutzt sie, statt einen
// zweiten aufzumachen (Konzept-Entscheid E8). Der Bezug ist gerichtet
// (Katalog -> Quellen-Ebene, die selbst nichts aus dem Ordner lädt) und
// bleibt damit kreisfrei.
const { normFolder } = require('./query-sources.js');
// 4T-002079 (Epic 3E-000259): der Abfrage-Fehler «HAVING ohne GROUP BY». Das
// Modul lädt nichts; der Bezug bleibt kreisfrei.
const { havingError } = require('./query-having.js');
// 4T-002449 (Epic 3E-000378): die Liste der Formel-Bibliothek; sie lädt nichts.
const { FORMULA_LIBRARY_EXTENSION_ID, FORMULA_LIBRARY_GROUPS } = require('./formula-library.js');

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

// 4T-002078 (Epic 3E-000259, Festlegung 5): Zahl der vorhandenen Werte für
// `count(x)` an einer Zeilen-Stelle. Eine Liste zählt ihre nicht fehlenden
// Elemente, ein Einzelwert 1, ein fehlender Wert 0. Über der Gruppe zählt
// `count(x)` die Zeilen, in denen diese Zahl größer als null ist
// (query-aggregate.js); beide Bedeutungen hängen damit an derselben Regel.
// Leerer Text zählt wie ein fehlender Wert, als Einzelwert und als
// Listen-Element; falsch und 0 bleiben Werte (Entscheidung des Product Owners
// vom 2026-10-30, 4T-002128, wie die Aggregat-Zeile der Datentabelle).
// 4T-002456 (Zweitblick-Befund 2): Ein Meldungs-Wert zählt ebenso wie ein
// fehlender Wert, einzeln und als Listen-Element; sonst zählte `count(x)` eine
// Angabe außerhalb des Gültigkeitsbereichs als vorhanden.
const isPresent = (x) => x !== null && x !== undefined && x !== '' && !isMessage(x);
function presentCount(v) {
  if (Array.isArray(v)) return v.filter(isPresent).length;
  return isPresent(v) ? 1 : 0;
}

// 4T-001073 (Epic 3E-000211): Vorbereitung für infolder — Liste -> Link-Werte.
// Ein einzelner Link zählt als einelementige Liste (Muster von numericList),
// jede andere Eingabe ergibt null. Anders als numericList bleibt die LEERE
// Liste hier ein gültiges Ergebnis und wird nicht zu null: `length(...) = 0`
// ist der belegte Anwendungsfall der Funktion, und length(null) wäre null
// statt 0 (Konzept-Entscheid E8).
function linkList(v) {
  if (Array.isArray(v)) return v.filter(isLink);
  return isLink(v) ? [v] : null;
}

// 4T-001073 (Epic 3E-000211): Der Pfad-Bruch des Werte-Modells, an genau einer
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

// 4T-001073 (Epic 3E-000211): infolder(liste, "Ordner") — die Teilliste der
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

// --- Mathe-Grundfunktionen und Konstanten (4T-002450, Epic 3E-000378) ---------
//
// Kern-Funktionen ohne Schalter (Story 4S-001124). Gemeinsame Rand-Regel: Eine
// Angabe, die keine Zahl ist (Umwandlung über coerceNumber), und ein Ergebnis,
// das keine endliche Zahl ist (Wurzel einer negativen Zahl, Logarithmus von
// null, Überlauf), ergeben null wie eine Division durch null. «NaN» oder
// «Infinity» erreichen damit keinen Rechen-Ort.

// Endliches Ergebnis oder null; -0 wird zu 0, damit Vergleich und Anzeige
// keine zweite Null kennen.
function finiteOrNull(n) {
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

// Funktion einer Zahl: Angabe umwandeln, rechnen, Rand-Regel anwenden.
function mathUnary(op) {
  return ([v]) => {
    const n = coerceNumber(v);
    return n === null ? null : finiteOrNull(op(n));
  };
}

// Funktion zweier Zahlen nach demselben Muster.
function mathBinary(op) {
  return ([a, b]) => {
    const x = coerceNumber(a);
    const y = coerceNumber(b);
    return x === null || y === null ? null : finiteOrNull(op(x, y));
  };
}

// Verschiebt das Komma einer Zahl um `stellen` Dezimalstellen über die
// Exponent-Schreibweise statt über eine Multiplikation. Die kürzeste
// Dezimal-Form der Zahl bleibt dabei erhalten: 1.005 wird zu 100.5 und nicht
// zu 100.49999999999999, wie es 1.005 * 100 liefert.
function shiftDecimal(n, stellen) {
  const [mantisse, exponent] = String(n).split('e');
  return Number(`${mantisse}e${Number(exponent || 0) + stellen}`);
}

// ROUND nach OpenFormula (ISO/IEC 26300, Abschnitt 6.17.5): auf das nächste
// Vielfache von 10^-Stellen, ein halber Wert rundet von null weg
// (round(2.5) = 3, round(-2.5) = -3). Eine negative Stellen-Zahl rundet links
// vom Komma; eine Stellen-Zahl mit Nachkommateil wird zur Null hin gekürzt.
function roundHalfAwayFromZero(x, digits) {
  const stellen = Math.trunc(digits);
  const betrag = Math.abs(x);
  const verschoben = shiftDecimal(betrag, stellen);
  // Über dem darstellbaren Bereich gibt es bei dieser Genauigkeit nichts zu
  // runden; die Zahl bleibt, wie sie ist.
  if (!Number.isFinite(verschoben)) return x;
  const gerundet = shiftDecimal(Math.round(verschoben), -stellen);
  return x < 0 ? -gerundet : gerundet;
}

// MOD nach OpenFormula (ISO/IEC 26300, Abschnitt 6.16.42): der Rest trägt das
// Vorzeichen des Teilers (mod(-3, 2) = 1); Teiler null ergibt null.
function modWithDivisorSign(a, b) {
  if (b === 0) return NaN;
  const rest = a % b;
  return rest !== 0 && rest < 0 !== b < 0 ? rest + b : rest;
}

const PHI = (1 + Math.sqrt(5)) / 2;

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
  // 4T-001073 (Epic 3E-000211): Mengen-Einschränkung einer Link-Liste auf einen
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
  // 4T-001074 (Epic 3E-000211): Hervorhebung eines Werts oder eines Teils eines
  // zusammengesetzten Ausdrucks. KEINE Markdown-Auswertung in Zellen: Ein
  // Sternchen im Text bleibt wörtlich, die Auszeichnung entsteht ausschließlich
  // über diesen ausdrücklichen Aufruf (Konzept-Entscheid E10 samt Zusatz).
  ['bold', { arity: [1, 1], fn: ([v]) => boldValue(v) }],
  // 4T-001072 (Epic 3E-000211): Die drei Formatierer folgen der Sprache aus dem
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
  // 4T-001071 (Epic 3E-000211): Tages-Zahl einer Dauer, etwa
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
  // 4T-002078 (Epic 3E-000259, F3a): An einer Zeilen-Stelle die Zahl der
  // vorhandenen Werte; `count()` ohne Argument gibt es nur an einer
  // Aggregat-Stelle (Prüfung in validateQuery, Bedeutung in query-aggregate.js).
  ['count', { arity: [0, 1], fn: (args) => (args.length === 0 ? null : presentCount(args[0])) }],
  // 4T-002450 (Epic 3E-000378): Mathe-Grundfunktionen, Kern ohne Schalter.
  ['exp', { arity: [1, 1], fn: mathUnary(Math.exp) }],
  ['ln', { arity: [1, 1], fn: mathUnary(Math.log) }],
  ['log10', { arity: [1, 1], fn: mathUnary(Math.log10) }],
  ['sqrt', { arity: [1, 1], fn: mathUnary(Math.sqrt) }],
  ['abs', { arity: [1, 1], fn: mathUnary(Math.abs) }],
  ['floor', { arity: [1, 1], fn: mathUnary(Math.floor) }],
  ['ceil', { arity: [1, 1], fn: mathUnary(Math.ceil) }],
  ['pow', { arity: [2, 2], fn: mathBinary(Math.pow) }],
  ['mod', { arity: [2, 2], fn: mathBinary(modWithDivisorSign) }],
  [
    'round',
    {
      arity: [1, 2],
      fn: ([v, digits]) =>
        mathBinary(roundHalfAwayFromZero)([v, digits === undefined ? 0 : digits]),
    },
  ],
  // 4T-002450: mathematische Konstanten, aufgerufen wie eine Funktion ohne
  // Angaben; ein Wort ohne Klammern bleibt ein Feld.
  ['pi', { arity: [0, 0], fn: () => Math.PI }],
  ['e', { arity: [0, 0], fn: () => Math.E }],
  ['phi', { arity: [0, 0], fn: () => PHI }],
  ['sqrt2', { arity: [0, 0], fn: () => Math.SQRT2 }],
]);

// 4T-002078 (Epic 3E-000259, Festlegung 4): die Aggregat-Funktionen. An einer
// Zeilen-Stelle rechnen sie über den Wert der einen Zeile (Katalog oben), an
// einer Aggregat-Stelle über alle Zeilen der Gruppe (query-aggregate.js).
const AGGREGATE_FUNCTIONS = new Set(['count', 'sum', 'average', 'min', 'max']);

// 4T-002511 (Epic 3E-000402, V9): Art eines Spalten-Ausdrucks ohne GROUP BY.
// 'aggregat': mindestens ein Aggregat und kein Feld außerhalb eines Aggregats
// (Aggregate, Literale und Rechnung über ihnen); 'zeile': ein Feld außerhalb
// eines Aggregats; 'literal': weder Feld noch Aggregat.
function columnKind(node) {
  if (!node || typeof node !== 'object' || node.type === 'param') return 'literal';
  if (node.type === 'field') return 'zeile';
  if (node.type === 'call' && AGGREGATE_FUNCTIONS.has(node.name)) return 'aggregat';
  let kind = 'literal';
  const children = [node.left, node.right, node.operand, ...(node.args || [])];
  for (const child of [...children, ...(node.values || [])]) {
    const k = columnKind(child);
    if (k === 'zeile') return 'zeile';
    if (k === 'aggregat') kind = 'aggregat';
  }
  return kind;
}

// 4T-002511 (Epic 3E-000402, V9, Entscheidung des Product Owners vom 2026-11-01):
// Eine Tabelle `WITHOUT ID` ohne `GROUP BY`, deren Spalten ausschließlich
// Aggregat-Spalten sind, ist eine Gruppe über alle Treffer (Gesamt-Wert). Die
// Treffer-Spalte einer Tabelle ohne `WITHOUT ID` ist eine Zeilen-Spalte; dort
// bleibt die Zeilen-Bedeutung, und `TABLE sum(werte)` rechnet je Datei.
function isTotalTable(queryAst) {
  return (
    !!queryAst &&
    queryAst.type === 'table' &&
    queryAst.withoutId === true &&
    Array.isArray(queryAst.groupBy) &&
    queryAst.groupBy.length === 0 &&
    Array.isArray(queryAst.fields) &&
    queryAst.fields.length > 0 &&
    queryAst.fields.every((f) => columnKind(f.expr) === 'aggregat')
  );
}

// 4T-002078 (Festlegung 3, F5 Option A): Aggregat-Stellen sind allein die
// Spalten und die Sortierung einer gruppierten Tabelle, dazu seit 4T-002079
// `HAVING` jeder gruppierten Abfrage (in validateQuery). Jede andere Stelle ist
// eine Zeilen-Stelle. Seit 4T-002511 zählt die Tabelle des Gesamt-Werts als
// gruppierte Tabelle mit einer Gruppe (isTotalTable).
function isGroupedTable(queryAst) {
  return (
    !!queryAst &&
    queryAst.type === 'table' &&
    Array.isArray(queryAst.groupBy) &&
    (queryAst.groupBy.length > 0 || isTotalTable(queryAst))
  );
}

// --- Schaltbare Funktions-Gruppen (4T-002449, Epic 3E-000378) -------------------
//
// Neben der Kern-Liste FUNCTIONS stehen Gruppen von Funktionen, die an einer
// Erweiterung hängen (Story 4S-001124). Eine Gruppe trägt ihren Namensraum,
// die Kennung ihrer Erweiterung und Funktionen in der Form der Kern-Einträge;
// jeder Name lautet `<namensraum>.<name>`. FUNCTIONS bleibt die Quelle der
// Kern-Funktionen und kennt die Gruppen nicht.
//
// **Geprüft wird beim Registrieren, nicht beim Aufruf**, damit eine Kollision
// auffällt, bevor ein Anwender sie sieht: Namensraum und Namen in
// Kleinschreibung (der Leser macht jeden Aufruf-Namen klein, ein
// großgeschriebener Eintrag wäre nie erreichbar), jeder Name im Namensraum der
// Gruppe, kein Name im Kern oder in einer anderen Gruppe vergeben, kein
// Namensraum doppelt. `file` und `this` sind als Namensraum ausgeschlossen,
// weil sie in der Sprache schon Felder ansprechen.
//
// **Der Schalter-Stand ist ein Modul-Zustand, von außen gesetzt** (Muster
// `src/main/index/index-schalter.js`): die Menge der wirksam ausgeschalteten
// Erweiterungen. Ab Werk ist sie leer, also alles an; wer sie nie setzt, etwa
// eine Prüfdatei, sieht das Verhalten von vorher. Der Katalog lebt in drei
// Exemplaren (Haupt-Prozess, Vorlade-Skript, Renderer-Bündel), und jedes
// bekommt den Stand an der Stelle, an der er dort schon ankommt:
// `configureExtensions` der Pipeline (markdown.js), `applyExtensionsState` und
// `initExtensionsFromStore` im Fenster (extension-lifecycle.js), Registrierung
// der Index-Kanäle und Verteilung der Einstellungs-Änderung im Haupt-Prozess.

const NAME_FORM = /^[a-z][a-z0-9_]*$/;
const RESERVED_NAMESPACES = new Set(['file', 'this']);
// Der Prüf-Code einer Funktion aus einer ausgeschalteten Gruppe; die Orte
// vergleichen gegen diese eine Konstante statt gegen ein eigenes Wort.
const FUNCTION_OFF_CODE = 'functionOff';

const GROUPS = new Map(); // namespace -> { namespace, extension, names }
const GROUP_FUNCTIONS = new Map(); // name -> { def, extension }
let disabledExtensions = new Set();

function groupError(text) {
  return new Error(`Funktions-Gruppe: ${text}`);
}

function checkGroupEntry(prefix, name, def, seen) {
  if (typeof name !== 'string' || !name.startsWith(prefix))
    throw groupError(`'${name}' liegt nicht im Namensraum '${prefix.slice(0, -1)}'`);
  if (!NAME_FORM.test(name.slice(prefix.length)))
    throw groupError(
      `'${name}' ist nicht in Kleinschreibung oder hat keine Form <namensraum>.<name>`,
    );
  if (FUNCTIONS.has(name) || GROUP_FUNCTIONS.has(name) || seen.has(name))
    throw groupError(`'${name}' ist schon vergeben`);
  const arity = def && def.arity;
  const arityOk = Array.isArray(arity) && arity.length === 2 && arity[0] <= arity[1];
  if (!arityOk || typeof def.fn !== 'function')
    throw groupError(`'${name}' braucht arity [min, max] und eine Funktion fn`);
}

/**
 * Registriert eine Funktions-Gruppe. Wirft beim ersten Verstoß; eine
 * abgewiesene Gruppe hinterlässt nichts im Katalog.
 *
 * @param {{namespace: string, extension: string,
 *   functions: Object<string, {arity: number[], fn: Function}>|Map}} group
 */
function registerFunctionGroup(group) {
  const { namespace, extension, functions } = group || {};
  if (typeof namespace !== 'string' || !NAME_FORM.test(namespace))
    throw groupError(
      `Namensraum '${namespace}' ist leer, nicht klein geschrieben oder enthält einen Punkt`,
    );
  if (RESERVED_NAMESPACES.has(namespace) || GROUPS.has(namespace))
    throw groupError(`Namensraum '${namespace}' ist schon vergeben`);
  if (typeof extension !== 'string' || extension === '')
    throw groupError(`Namensraum '${namespace}' nennt keine Erweiterung`);
  const entries = functions instanceof Map ? [...functions] : Object.entries(functions || {});
  if (entries.length === 0) throw groupError(`Namensraum '${namespace}' trägt keine Funktion`);
  const seen = new Map();
  for (const [name, def] of entries) {
    checkGroupEntry(`${namespace}.`, name, def, seen);
    seen.set(name, def);
  }
  GROUPS.set(namespace, { namespace, extension, names: [...seen.keys()] });
  for (const [name, def] of seen) GROUP_FUNCTIONS.set(name, { def, extension });
}

/**
 * Schlägt einen Funktions-Namen nach. `lage` ist `kern` (Kern-Liste), `an`
 * oder `aus` (Gruppe mit ein- oder ausgeschalteter Erweiterung) oder
 * `unbekannt`; `def` fehlt nur bei `unbekannt`.
 */
function lookupFunction(name) {
  const core = FUNCTIONS.get(name);
  if (core) return { def: core, lage: 'kern' };
  const entry = GROUP_FUNCTIONS.get(name);
  if (!entry) return { def: null, lage: 'unbekannt' };
  const lage = disabledExtensions.has(entry.extension) ? 'aus' : 'an';
  return { def: entry.def, lage, extension: entry.extension };
}

/**
 * Setzt die Menge der wirksam ausgeschalteten Erweiterungen (bereits um die
 * Abhängigkeiten erweitert, wie sie `effectiveDisabledSet` liefert).
 *
 * @param {Iterable<string>} ids
 * @returns {boolean} true, wenn sich die Menge geändert hat.
 */
function setDisabledFunctionExtensions(ids) {
  const next = new Set([...(ids || [])].filter((id) => typeof id === 'string'));
  const changed =
    next.size !== disabledExtensions.size || [...next].some((id) => !disabledExtensions.has(id));
  disabledExtensions = next;
  return changed;
}

/** Die registrierten Gruppen, je `{ namespace, extension, names }` als Kopie. */
function functionGroups() {
  return [...GROUPS.values()].map((g) => ({ ...g, names: [...g.names] }));
}

// Die Gruppen der Formel-Bibliothek, beim Laden des Katalogs registriert.
for (const group of FORMULA_LIBRARY_GROUPS) {
  registerFunctionGroup({ ...group, extension: FORMULA_LIBRARY_EXTENSION_ID });
}
const LIBRARY_NAMESPACES = new Set(GROUPS.keys());

// Nur für Prüfdateien: entfernt jede nach dem Laden registrierte Gruppe und
// schaltet alles wieder ein; die Gruppen der Bibliothek bleiben.
function resetFunctionGroupsForTests() {
  for (const [namespace, group] of [...GROUPS]) {
    if (LIBRARY_NAMESPACES.has(namespace)) continue;
    for (const name of group.names) GROUP_FUNCTIONS.delete(name);
    GROUPS.delete(namespace);
  }
  disabledExtensions = new Set();
}

// --- Validierung (Funktions-Namen und Stelligkeit) -----------------------------

// Läuft nach dem Parsen über den kompletten Abfrage-AST und liefert den ersten
// Funktions-Fehler als strukturiertes Fehler-Objekt (Form wie die Parser-
// Fehler; die View bildet den Code auf i18n ab) — oder null. Damit erscheint
// eine unbekannte Funktion bzw. falsche Stelligkeit als lokalisierter Fehler
// am Fence, bevor die Auswertung je Datei läuft.
//
// 4T-002078 (Epic 3E-000259): `count()` ohne Argument ist an einer
// Zeilen-Stelle ein Abfrage-Fehler, weil es dort nichts zu zählen gibt. Die
// Stelle reicht `aggregate` durch: An einer Aggregat-Stelle bleibt der ganze
// Ausdruck darunter frei; ein Aggregat im Aggregat meldet query-aggregate.js.
function validateQuery(queryAst) {
  let err = null;
  function walkExpr(node, aggregate = false) {
    if (err || !node || typeof node !== 'object') return;
    switch (node.type) {
      case 'or':
      case 'and':
      case 'cmp':
      case 'arith':
        walkExpr(node.left, aggregate);
        walkExpr(node.right, aggregate);
        return;
      case 'not':
      case 'neg':
        walkExpr(node.operand, aggregate);
        return;
      case 'inlist':
        walkExpr(node.left, aggregate);
        for (const v of node.values) walkExpr(v, aggregate);
        return;
      case 'call': {
        const { def, lage, extension } = lookupFunction(node.name);
        if (!def) {
          err = {
            code: 'unknownFunction',
            message: `Unbekannte Funktion '${node.name}'`,
            pos: typeof node.pos === 'number' ? node.pos : -1,
            name: node.name,
          };
          return;
        }
        // 4T-002449: Eine Funktion einer ausgeschalteten Gruppe hat einen
        // eigenen Code, VOR der Stelligkeit, damit ein solcher Aufruf mit
        // falscher Angabe-Zahl nicht als Tippfehler erscheint.
        if (lage === 'aus') {
          err = {
            code: FUNCTION_OFF_CODE,
            message: `Funktion '${node.name}' gehört zur ausgeschalteten Erweiterung '${extension}'`,
            pos: typeof node.pos === 'number' ? node.pos : -1,
            name: node.name,
            extension,
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
        if (node.name === 'count' && node.args.length === 0 && !aggregate) {
          err = {
            code: 'countWithoutField',
            message: 'count() ohne Feld nur an einer Aggregat-Stelle',
            pos: typeof node.pos === 'number' ? node.pos : -1,
            name: node.name,
          };
          return;
        }
        for (const a of node.args) walkExpr(a, aggregate);
        return;
      }
      default:
        return;
    }
  }
  if (queryAst && (queryAst.type === 'list' || queryAst.type === 'table')) {
    // 4T-002079 (Epic 3E-000259): HAVING braucht GROUP BY und ist dann in Liste
    // und Tabelle eine Aggregat-Stelle, damit `count()` dort steht.
    const missing = havingError(queryAst);
    if (missing) return missing;
    walkExpr(queryAst.having, true);
    const aggregate = isGroupedTable(queryAst);
    for (const f of queryAst.fields || []) walkExpr(f.expr, aggregate);
    walkExpr(queryAst.where);
    for (const s of queryAst.sort || []) walkExpr(s.key, aggregate);
    // 4T-000503 (Epic 3E-000096): Gruppierungs-Ausdruecke mit validieren.
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
      // 4T-001070 (Epic 3E-000211): auch der Selbstbezug auf die Link-Listen zählt
      // (`this.file.inlinks`), sonst bliebe der Graph ungebaut und das Feld
      // still leer.
      const lower = String(node.name)
        .toLowerCase()
        .replace(/^this\./, '');
      if (lower === 'file.inlinks' || lower === 'file.outlinks') found = true;
      return;
    }
    // 4T-001070: srcSelf braucht den Graphen ebenso wie srcLink.
    if (node.type === 'srcLink' || node.type === 'srcSelf') {
      found = true;
      return;
    }
    // 4T-002079: `having` wie `where`.
    for (const key of ['left', 'right', 'operand', 'expr', 'key', 'where', 'having', 'source']) {
      if (node[key]) walk(node[key]);
    }
    if (Array.isArray(node.args)) for (const a of node.args) walk(a);
    if (Array.isArray(node.values)) for (const v of node.values) walk(v);
    if (Array.isArray(node.fields)) for (const f of node.fields) walk(f.expr);
    if (Array.isArray(node.sort)) for (const s of node.sort) walk(s.key);
    // 4T-000503 (Epic 3E-000096): Gruppierungs-Ausdruecke mit durchsuchen.
    if (Array.isArray(node.groupBy)) for (const g of node.groupBy) walk(g);
  }
  walk(queryAst);
  return found;
}

module.exports = {
  FUNCTIONS,
  // 4T-002078 (Epic 3E-000259): Aggregat-Funktionen und Aggregat-Stellen.
  AGGREGATE_FUNCTIONS,
  isGroupedTable,
  // 4T-002511 (Epic 3E-000402, V9): die Tabelle des Gesamt-Werts.
  isTotalTable,
  presentCount,
  validateQuery,
  queryUsesLinks,
  // 4T-002449 (Epic 3E-000378): schaltbare Funktions-Gruppen.
  FUNCTION_OFF_CODE,
  registerFunctionGroup,
  lookupFunction,
  setDisabledFunctionExtensions,
  functionGroups,
  resetFunctionGroupsForTests,
};
