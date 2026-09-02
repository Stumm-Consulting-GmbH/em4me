// 4T-001070 (Epic 3E-000211): Abfrage-Helfer des TASKS-Scopes, herausgelöst aus
// query.js. Der Schnitt wurde vom Datei-Größen-Budget erzwungen und folgt der
// Naht, die der Kopf von query.js schon als Gruppe benannte: Status-Ordnung,
// Bezugstag, globale Task-Abfrage, Task-Tags und Gruppen-Bildung. In query.js
// bleibt frontmatterQueryFor als die eine Fachlichkeit der Datei.
//
// Prozess-neutral bis auf die geteilten Index-Bausteine; kein Electron-Zugriff.

'use strict';

const { parseQuery } = require('../../shared/query/perspective-query.js');
const {
  evaluateExpression,
  // 4T-000503 (Epic 3E-000096): Werte-Ordnung der Gruppen-Reihenfolge.
  orderForSort,
} = require('../../shared/query/perspective-query-eval.js');
const { validateQuery } = require('../../shared/query/query-functions.js');
// 4T-000503 (Epic 3E-000096): Anzeige-Form der Gruppen-Keys.
// 4T-001074 (Epic 3E-000211): dazu die Segment-Form, damit eine Hervorhebung im
// Gruppen-Wert bis in den Titel überlebt.
const { formatValue, formatValueSegments } = require('../../shared/query/query-format.js');
const { maskInlineCode } = require('../../shared/markdown/link-scan.js');
const { TAG_RE, isValidTag } = require('./parse.js');

// 4T-000505 (Epic 3E-000096): Ordnung der Status-Typen fuer die Task-Default-
// Sortierung (Referenz-Muster: Laufendes zuerst, Erledigtes und Verworfenes
// ans Ende); unbekannte Zeichen ohne Typ ordnen sich hinter ON_HOLD ein.
const STATUS_TYPE_ORDER = {
  IN_PROGRESS: 0,
  TODO: 1,
  ON_HOLD: 2,
  DONE: 4,
  CANCELLED: 5,
  NON_TASK: 6,
};

function statusTypeRank(type) {
  const rank = STATUS_TYPE_ORDER[type];
  return rank === undefined ? 3 : rank;
}

// 4T-000505 (Epic 3E-000096): lokales ISO-Datum eines Zeitpunkts (Bezugstag des
// Dringlichkeits-Scores; dieselbe lokale Zeitachse wie date(today)).
function localIsoDateOf(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 4T-000505 (Epic 3E-000096): globale Task-Abfrage aus den Einstellungen —
// zugelassen sind nur FROM- und WHERE-Anteile (auch als Alt-Body bzw. mit
// fuehrendem LIST/LIST TASKS); alles andere (Spalten, SORT, LIMIT,
// Gruppierung, Layout) gehoert in den lokalen Fence und macht die globale
// Vorgabe ungueltig. Rueckgabe { where, source } oder { error: true }.
function parseGlobalTaskQuery(text) {
  const parsed = parseQuery(text);
  if (!parsed.ok) return { error: true };
  const ast = parsed.ast;
  if (
    ast.type !== 'list' ||
    (ast.scope !== 'files' && ast.scope !== 'tasks') ||
    ast.fields.length > 0 ||
    ast.sort.length > 0 ||
    ast.limit !== null ||
    ast.layoutColumns !== null ||
    ast.groupBy.length > 0 ||
    ast.hide.length > 0 ||
    ast.show.length > 0 ||
    ast.short
  ) {
    return { error: true };
  }
  if (validateQuery(ast)) return { error: true };
  return { where: ast.where || null, source: ast.source || null };
}

// 4T-000502 (Epic 3E-000096): Inline-Tags einer Task-Beschreibung fuer das
// tags-Feld des TASKS-Scopes. Dieselben Maskierungen und Gueltigkeits-
// Filter wie der Datei-Tag-Scan in parseContent (Inline-Code, Wiki-Links,
// Attribut-Bloecke), damit beide Ebenen dieselben Tags sehen.
function taskLineTags(description) {
  const masked = maskInlineCode(String(description || ''))
    .replace(/\[\[[^\]\n]*\]\]/g, (m) => ' '.repeat(m.length))
    .replace(/\{[^{}\n]*\}/g, (m) => ' '.repeat(m.length));
  const tags = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(masked)) !== null) {
    if (isValidTag(m[1]) && !tags.includes(m[1])) tags.push(m[1]);
  }
  return tags;
}

// 4T-000503 (Epic 3E-000096): rekursive Gruppen-Bildung der Task-Ausgabe.
// Pro Ebene wird der Gruppen-Key je Treffer ausgewertet; Treffer mit
// gleichem Anzeige-Wert bilden eine Gruppe (Reihenfolge der Treffer
// innerhalb der Gruppe bleibt die der Ergebnis-Pipeline). Gruppen
// sortieren nach der Werte-Ordnung des ersten Roh-Werts (orderForSort,
// Fallback Anzeige-Label); Treffer ohne Wert bilden die letzte Gruppe
// mit label null (die View lokalisiert die Beschriftung).
function buildTaskGroups(rows, keyExprs, level, hitFor) {
  const groups = [];
  const byLabel = new Map();
  for (const ctx of rows) {
    const value = evaluateExpression(keyExprs[level], ctx);
    const label = value === null || value === undefined ? null : formatValue(value);
    const mapKey = label === null ? ' none' : `v:${label}`;
    let group = byLabel.get(mapKey);
    if (!group) {
      group = { value, label, rows: [] };
      byLabel.set(mapKey, group);
      groups.push(group);
    }
    group.rows.push(ctx);
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
  return groups.map((g) => {
    // 4T-001074: labelSegs neben label — der Text bleibt der Schlüssel und die
    // Rückfall-Darstellung, die Segmente tragen die Auszeichnung.
    const segs = g.label === null ? [] : formatValueSegments(g.value);
    if (level + 1 < keyExprs.length) {
      return {
        label: g.label,
        labelSegs: segs,
        groups: buildTaskGroups(g.rows, keyExprs, level + 1, hitFor),
      };
    }
    return { label: g.label, labelSegs: segs, items: g.rows.map(hitFor) };
  });
}

module.exports = {
  statusTypeRank,
  localIsoDateOf,
  parseGlobalTaskQuery,
  taskLineTags,
  buildTaskGroups,
};
