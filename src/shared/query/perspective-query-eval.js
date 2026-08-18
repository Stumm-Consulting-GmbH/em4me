'use strict';

// 4T-0402 (Epic 3E-0076): Auswertung der Perspective-Query-Sprache.
// Gegenstück zum Parser in perspective-query.js (der den Fence-Body in den
// Abfrage-AST zerlegt); eigenes Modul, damit beide je EIN Thema tragen:
// dort die Sprache, hier die Werte. Prozess-neutral (kein Electron, kein
// DOM), kein eval — die Auswertung läuft ausschließlich über den AST-Walker.
//
// 4T-0987 (Epic 3E-0196): Kern des Ordners `query/`. Er trägt die Feld-
// Auflösung, den Ausdrucks-Walker, die FROM-Quellen und die Ergebnis-
// Pipeline; die übrigen Teile liegen in den Schwester-Modulen:
//   query-format.js       Werte-Modell (Typ-Prüfer, Koerzierung, Gleichheit)
//                         und Anzeige-Form; Blatt des Ordners
//   query-functions.js    Funktions-Katalog, AST-Validierung, Link-Bedarf
//   query-task-fields.js  Feld-Katalog des TASKS-Scopes
//   query-sources.js      Quellen-Ebene (FROM: Ordner, Tag, Link, Selbstbezug)
//                         samt der Ordner-Normalisierung; Blatt (4T-1070)
// Der Import-Graph läuft ausschließlich von hier nach unten; kein
// Schwester-Modul lädt den Kern.
//
// Das Werte-Modell steht im Kopf von query-format.js.
//
// Kontext-Struktur (pro Datei vom Aufrufer bereitgestellt, alle Teile optional):
//   ctx = {
//     root,              4T-1070 (Epic 3E-0211): Wurzel-Pfad des Suchraums —
//                        nötig, weil Link-Werte den absoluten, file.path/
//                        file.folder aber den wurzel-relativen Pfad tragen
//     self,              4T-1070 (Epic 3E-0211): Kontext der TRÄGER-Datei des
//                        Fence (selbst wieder eine Struktur dieser Form, aber
//                        ohne block/task/self). Ziel des `this.`-Präfixes und
//                        der Selbstbezugs-Quelle; fehlt, wenn die Träger-Datei
//                        nicht im Index liegt
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

const {
  isDate,
  isDur,
  parseIsoLocalMs,
  coerceDateMs,
  coerceNumber,
  truthy,
  equalsValue,
  // 4T-1071 (Epic 3E-0211): Anzeige-Form für den Verkettungs-Rückfall.
  formatValue,
  // 4T-1074 (Epic 3E-0211): ausgezeichneter Anzeige-Wert.
  isRich,
  plainValue,
  concatRich,
} = require('./query-format.js');
const { FUNCTIONS } = require('./query-functions.js');
const { resolveTaskField } = require('./query-task-fields.js');
// 4T-1070 (Epic 3E-0211): Quellen-Ebene (FROM) im eigenen Schwester-Modul.
const { matchesSource } = require('./query-sources.js');

// --- Werte-Ordnung ------------------------------------------------------------

// Ordnung zweier Werte: -1/0/1 oder null (nicht vergleichbar). Datum vor Zahl
// prüfen, damit ISO-Strings gegen Datums-Werte chronologisch laufen.
function orderValues(aRaw, bRaw) {
  // 4T-1074 (Epic 3E-0211): Rich-Werte ordnen über ihre Text-Form; SORT über
  // einen ausgezeichneten Ausdruck sortiert wie über den unmarkierten.
  const a = plainValue(aRaw);
  const b = plainValue(bRaw);
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

// 4T-1071 (Epic 3E-0211): Datum aus dem Dateinamen für `file.day`. Erkannt wird
// ausschließlich das ISO-Präfix JJJJ-MM-TT am Namensanfang, nicht ein Datum
// irgendwo im Namen — sonst bekäme eine Notiz «Rückblick auf 2020-01-01» ein
// falsches Datum (Konzept-Entscheid E3). Die Kalender-Gegenprobe fängt Werte
// wie 2026-02-30 ab, die die Zeit-Rechnung sonst still auf den 2. März schöbe.
const DAY_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/;

function dayFromName(name) {
  const m = DAY_PREFIX_RE.exec(String(name || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { kind: 'date', ms: dt.getTime() };
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
  // 4T-1070 (Epic 3E-0211): Selbstbezug. `this.X` löst X gegen den Kontext der
  // TRÄGER-Datei auf (ctx.self), nie gegen die Treffer-Zeile — dieselbe Regel in
  // allen drei Scopes, damit derselbe Satz überall dasselbe bedeutet
  // (Konzept-Entscheid E1). Der Selbst-Kontext trägt seinerseits kein `self`,
  // die Rekursion endet also nach einem Schritt; ohne Träger-Kontext ergibt
  // jeder Zugriff `null` wie bei den übrigen Feldern (weiche Fehler, E9).
  // Nacktes `this` ohne Punkt ist bewusst kein Sonderfall und fällt unten auf
  // die Frontmatter-Auflösung, wo es wie jeder unbekannte Name `null` ergibt.
  if (lower.startsWith('this.')) {
    const self = ctx && ctx.self;
    return self ? resolveField(lower.slice(5), self) : null;
  }
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
      // 4T-1071 (Epic 3E-0211): Quelle ist der LOGISCHE Name (file.name), damit
      // beide Felder nie auseinanderlaufen.
      case 'day':
        return dayFromName(f.name);
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
    // 4T-1074 (Epic 3E-0211): Segment-Verkettung, sobald eine Seite ausgezeichnet
    // ist. VOR allen anderen Zweigen, denn ein Rich-Wert ist ein Anzeige-Wert und
    // darf nie in einen numerischen Weg geraten (Werte-Modell in query-format.js).
    if (isRich(a) || isRich(b)) return concatRich(a, b);
    if (isDate(a) && isDur(b)) return { kind: 'date', ms: a.ms + b.ms };
    if (isDur(a) && isDate(b)) return { kind: 'date', ms: b.ms + a.ms };
    if (isDur(a) && isDur(b)) return { kind: 'dur', ms: a.ms + b.ms };
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    const an = coerceNumber(a);
    const bn = coerceNumber(b);
    if (an !== null && bn !== null) return an + bn;
    // 4T-1071 (Epic 3E-0211): Rückfall auf die Anzeige-Form. Greift NUR, wenn
    // der numerische Weg gescheitert ist und mindestens eine Seite eine
    // Zeichenkette ist — die Änderung ist damit strikt additiv: jeder Fall, den
    // sie berührt, ergab bisher null (Konzept-Entscheid E5). Ein fehlender Wert
    // bleibt fehlend, statt eine halbe Zeichenkette zu erzeugen.
    if (typeof a === 'string' || typeof b === 'string') {
      if (a === null || a === undefined || b === null || b === undefined) return null;
      return formatValue(a) + formatValue(b);
    }
    return null;
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
  applyResultPipeline,
  // 4T-0503 (Epic 3E-0096): Werte-Ordnung fuer die Gruppen-Reihenfolge
  // der Task-Gruppierung (dieselbe Ordnung wie SORT).
  orderForSort,
};
