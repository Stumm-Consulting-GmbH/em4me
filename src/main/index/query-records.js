// 4T-002039 (Epic 3E-000258): Auswertung der Datensatz-Ebene der Abfrage
// (`LIST RECORDS`, `TABLE RECORDS`). Das Modul beantwortet eine Frage: welche
// Datensätze einer Abfrage auf dieser Ebene genügen und wie ihre Antwort
// aussieht. Der Erzeuger aller Ebenen (`query.js`) ruft es mit einer Zeile, nachdem
// Syntax, Funktionen und die Grenze der Layout-Klauseln geprüft sind.
// 4T-002076 (Epic 3E-000259): `GROUP BY` wirkt auch hier; die Gruppen bildet
// derselbe Zeilen-Bau wie auf den übrigen Ebenen (`query-result-set.js`), im
// Aus-Zustand über der leeren Zeilen-Liste.
//
// **Die Ebene bestimmt die Deutung von `FROM`** (E6.1): Eine Zeichenkette nennt
// eine Tabelle beim Namen oder als Pfad relativ zur Bereichs-Wurzel, wie
// `options.table` einer Verweis-Spalte. `AND`, `OR`, Klammern und `-` wirken
// wie gewohnt, geprüft je Datensatz gegen seine Tabelle. Kandidaten sind allein
// die Datensätze der Tabellen, die positiv genannt sind; eine Abfrage ohne
// solche Tabelle ist ein Abfrage-Fehler, weil «alle Tabellen» das zu große
// Ergebnis wäre, das E4 ausschließt. Schlagwort, Wiki-Link, `outgoing(…)` und
// Selbstbezug haben hier keinen Sinn und sind ebenfalls ein Abfrage-Fehler.
// Eine unbekannte Tabelle trifft nichts und ergibt die leere Menge (E4).
//
// **Werte nach dem Typ ihrer Spalte** kommen aus dem Tabellen-Bestand für die
// Abfrage (`record-table-read.js`), frisch aus dem Dokument und mit dem
// ungespeicherten Stand vor der Platte. Die Feld-Auflösung eines Datensatzes
// steht in `src/shared/query/query-record-fields.js`; `file.*` meint die
// Tabellen-Datei, `this.` die Datei der Abfrage.
//
// **Aus-Zustand** (E15.4, Entscheidung F4 Option A): Ruht der Datensatz-Bestand,
// wird keine Datei gelesen, und die Antwort ist die leere Menge mit dem
// Hinweis-Code `databaseOff` im Zustand; kein Abfrage-Fehler.
//
// **Beschriftung der Spalten** (E21.4, E21.6): je Lauf aufgelöst in der Sprache
// der Oberfläche mit der Rückfall-Sprache der Datenbank, nie zwischengespeichert.
//
// **Pfad-Navigation** (4T-002041, E6.2): Die Regel steht prozess-neutral in
// `query-record-fields.js`; die Ziel-Tabelle liest allein dieses Modul. Es reicht
// dafür je Lauf einen Navigator herein, der eine Ziel-Tabelle erst liest, wenn
// ein Pfad sie erreicht, und sie für den Rest des Laufs behält. Die gelesenen
// Quell-Tabellen stehen von Anfang an darin. Der Tabellen-Bestand hält
// die Tabellen über Läufe hinweg im Zwischenspeicher.
//
// **Transitive Hülle** (4T-002042, E6.3): `ancestors(…)` und `descendants(…)` sind
// Quellen dieser Ebene. Jede Hülle wird vor der Prüfung der Kandidaten einmal
// gebildet (`record-hull.js`), über denselben Navigator wie die Pfade; danach
// urteilt die Quelle je Datensatz. Eine positiv genannte Hülle liefert ihre
// Datensätze als Kandidaten, auch ohne Tabelle in `FROM`, weil ihre Menge durch
// das Ziel begrenzt ist; mit einer Tabelle über `AND` bleibt sie auf diese
// begrenzt. Ein Kreis in den Verweisen setzt den Hinweis `recordHullCycle`.
//
// **Vorlagen** (4T-002082, Epic 3E-000259, F4 Option A): Ein Datensatz, dessen
// Tabelle mit ihrer Kopf-Datei im Vorlagen-Ordner liegt, ist kein Kandidat, auch
// nicht als Mitglied einer Hülle. Ausgenommen ist eine Tabelle, die die Quelle
// über einen Pfad durch den Vorlagen-Ordner anspricht (`FROM "Vorlagen/Bücher.md"`);
// beim bloßen Namen bleibt sie ausgeschlossen, weil der Name den Ordner nicht
// nennt. Eine Ziel-Tabelle der Pfad-Navigation ist kein Kandidat und bleibt
// erreichbar. Die Regel steht in `query-templates.js`.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { truthy } = require('../../shared/query/query-format.js');
const {
  evaluateExpression,
  applyResultPipeline,
} = require('../../shared/query/perspective-query-eval.js');
const { queryUsesLinks, isGroupedTable } = require('../../shared/query/query-functions.js');
const { loeseBeschriftung } = require('../../shared/database/beschriftung.js');
const {
  parseSteckbrief,
  wirksameRueckfallSprache,
} = require('../../shared/database/database-steckbrief.js');
const { nummerAus } = require('../../shared/database/record-identity.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { findeZielTabelle } = require('../database/datensatz-liste.js');
const { entryWithOverlay, overlaysUnder, bufferTextFor } = require('./overlay.js');
const { buildLinkGraph, buildQueryContext } = require('./link-graph.js');
const { datensatzErfassungAktiv } = require('./index-schalter.js');
const { readRecordTable } = require('./record-table-read.js');
const { stateResponse, resultResponse } = require('./query-result-set.js');
const { buildHull, hullKey } = require('./record-hull.js');
const { createTemplateExclusion } = require('./query-templates.js');

const HINT_DATABASE_OFF = 'databaseOff';
const HINT_REF_AMBIGUOUS = 'recordRefAmbiguous';
const HINT_HULL_CYCLE = 'recordHullCycle';

function queryError(code, message, extra) {
  return { code, message, pos: -1, ...extra };
}

const SOURCE_MISSING = queryError(
  'recordsSourceMissing',
  'Datensatz-Ebene: Tabelle in FROM erwartet',
);

// --- Prüfung der Abfrage auf dieser Ebene ---------------------------------------

// Die Quelle so, wie der Autor sie geschrieben hat, für die Meldung.
function sourceText(node) {
  if (node.type === 'srcTag') return `#${node.value}`;
  const link = node.type === 'srcSelf' ? '[[]]' : `[[${node.target}]]`;
  return node.mode === 'out' ? `outgoing(${link})` : link;
}

// Sammelt die Tabellen-Angaben der Quelle, getrennt nach positiv genannt und
// überhaupt genannt; eine doppelte Verneinung ist wieder positiv. Hüllen kommen
// ebenso in zwei Listen. Liefert den Abfrage-Fehler einer unzulässigen
// Quellen-Art oder null.
function collectTables(node, negated, out) {
  switch (node.type) {
    case 'srcOr':
    case 'srcAnd':
      return collectTables(node.left, negated, out) || collectTables(node.right, negated, out);
    case 'srcNot':
      return collectTables(node.operand, !negated, out);
    case 'srcHull':
      out.hulls.push(node);
      if (!negated) out.positiveHulls.push(node);
      return null;
    case 'srcFolder':
      // Eine leere Zeichenkette nennt keine Tabelle.
      if (node.value.trim() === '') return SOURCE_MISSING;
      out.named.add(node.value);
      if (!negated) out.positive.add(node.value);
      return null;
    default: {
      const name = sourceText(node);
      return queryError('recordsSourceInvalid', `Datensatz-Ebene: Quelle '${name}'`, { name });
    }
  }
}

// Steht irgendwo in einer Spalte eine Hervorhebung? Nur `bold()` erzeugt sie,
// und die Verkettung trägt sie weiter; der Aufruf ist deshalb das Merkmal.
function usesHighlight(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'call' && node.name === 'bold') return true;
  const parts = [node.left, node.right, node.operand, ...(node.args || []), ...(node.values || [])];
  return parts.some(usesHighlight);
}

/**
 * Prüft eine Abfrage der Datensatz-Ebene, ohne eine Datei zu lesen.
 * @returns {{ error: object }|{ tables: { named: Set<string>, positive: Set<string>,
 *   hulls: object[], positiveHulls: object[] } }}
 */
function checkRecordsQuery(ast) {
  if (!ast.source) return { error: SOURCE_MISSING };
  const tables = { named: new Set(), positive: new Set(), hulls: [], positiveHulls: [] };
  const error = collectTables(ast.source, false, tables);
  if (error) return { error };
  // Eine positiv genannte Hülle begrenzt die Menge wie eine Tabelle (E4).
  if (tables.positive.size === 0 && tables.positiveHulls.length === 0) {
    return { error: SOURCE_MISSING };
  }
  // E8.1: Eine Datenbank-Zelle hat einen Wert und keine Auszeichnung.
  // 4T-002078: ebenso ein Gruppen-Ausdruck, weil sein Wert als Überschrift der
  // Liste und als Zelle der gruppierten Tabelle erscheint.
  if ([...ast.fields.map((f) => f.expr), ...ast.groupBy].some(usesHighlight)) {
    return { error: queryError('recordsHighlight', 'Datensatz-Ebene: keine Hervorhebung') };
  }
  return { tables };
}

// --- Quelle je Datensatz -----------------------------------------------------------

// Urteil der Quelle über einen Datensatz: `at` nennt seine Tabelle (`headKey`),
// seinen Schlüssel in einer Hülle (`key`), die Kopf-Dateien der genannten
// Tabellen (`heads`) und die gebildeten Hüllen (`hulls`).
function sourceHit(node, at) {
  switch (node.type) {
    case 'srcOr':
      return sourceHit(node.left, at) || sourceHit(node.right, at);
    case 'srcAnd':
      return sourceHit(node.left, at) && sourceHit(node.right, at);
    case 'srcNot':
      return !sourceHit(node.operand, at);
    case 'srcHull':
      return at.hulls.get(node).members.has(at.key);
    default: {
      const head = at.heads.get(node.value);
      return !!head && pathCompareKey(head) === at.headKey;
    }
  }
}

// Die Kandidaten je Tabelle: alle Datensätze einer positiv genannten Tabelle,
// dazu die Mitglieder der positiv genannten Hüllen, jeder einmal.
function candidatesOf(tables, positiveHulls, hulls) {
  const out = new Map();
  for (const [headKey, table] of tables) out.set(headKey, { table, records: table.records });
  for (const node of positiveHulls) {
    for (const [key, { table, r }] of hulls.get(node).members) {
      const headKey = pathCompareKey(table.path);
      if (!out.has(headKey)) out.set(headKey, { table, records: [], keys: new Set() });
      const candidate = out.get(headKey);
      if (!candidate.keys || candidate.keys.has(key)) continue;
      candidate.keys.add(key);
      candidate.records.push(r);
    }
  }
  return out;
}

// --- Ordnung und Beschriftung --------------------------------------------------------

// Ohne SORT: nach Anzeige-Form ohne Rücksicht auf die Schreibung, eine fehlende
// Anzeige-Form zuletzt, dann nach der Nummer der Kennung, wie die Wertehilfe
// der Verweis-Felder (`datensatz-liste.js`). Tabelle und Kennung als Text
// halten die Reihenfolge über mehrere Tabellen fest.
function compareRecords(a, b) {
  const ad = a.record.display || '';
  const bd = b.record.display || '';
  if ((ad === '') !== (bd === '')) return ad === '' ? 1 : -1;
  const byDisplay = ad.localeCompare(bd, undefined, { sensitivity: 'base' });
  if (byDisplay !== 0) return byDisplay;
  const an = nummerAus(a.record.id);
  const bn = nummerAus(b.record.id);
  if (an !== null && bn !== null && an !== bn) return an - bn;
  return a.record.id.localeCompare(b.record.id) || a.record.table.localeCompare(b.record.table);
}

// Die Rückfall-Sprache der Datenbank aus ihrem Steckbrief, gelesen wie im
// Katalog: das erste Dokument mit Steckbrief nach Pfad, der ungespeicherte
// Stand vor der Platte. Ohne Steckbrief gibt es keine.
function fallbackLocaleOf(sicht) {
  const heads = [];
  for (const [absPath, marks] of sicht.dbKindsPerFile || new Map()) {
    if (Array.isArray(marks) && marks.includes('database')) heads.push(absPath);
  }
  if (heads.length === 0) return null;
  heads.sort();
  let text = bufferTextFor(heads[0]);
  if (text === null) {
    try {
      text = fs.readFileSync(heads[0], 'utf8').replace(/^\uFEFF/, '');
    } catch {
      return null;
    }
  }
  return wirksameRueckfallSprache(parseSteckbrief(extractFrontmatter(text).data));
}

// Beschriftung je Spalte: ein einzelnes Feld nach der Rückfall-Kette aus E21.4
// (Sprache der Oberfläche, Rückfall-Sprache der Datenbank, erste Fassung,
// technischer Name); ein Pfad, ein Ausdruck und ein unbekanntes Feld zeigen
// ihren Quelltext (null). Bei mehreren Tabellen gilt die erste, die das Feld führt.
function columnLabels(fields, tables, locale, sicht) {
  const language = typeof locale === 'string' && locale ? locale.split('-')[0] : null;
  let fallback;
  const fallbackLocale = () => {
    if (fallback === undefined) fallback = fallbackLocaleOf(sicht);
    return fallback;
  };
  return fields.map(({ expr }) => {
    if (expr.type !== 'field') return null;
    const lower = expr.name.toLowerCase();
    for (const table of tables) {
      const field = table.definition.fields.find((f) => f.name.toLowerCase() === lower);
      if (!field) continue;
      // Die Rückfall-Sprache wird nur für eine Sprach-Zuordnung gebraucht und
      // nur dann gelesen.
      const mapped = field.label !== null && typeof field.label === 'object';
      return (
        loeseBeschriftung(field.label, language, mapped ? fallbackLocale() : null) || field.name
      );
    }
    return null;
  });
}

// --- Pfad-Navigation ------------------------------------------------------------------

// Der Kontext eines Datensatzes, wie die Feld-Auflösung ihn liest.
function recordContext(table, r) {
  return {
    table: table.table,
    id: r.id,
    path: table.path,
    display: r.display,
    values: r.values,
    refs: r.refs,
  };
}

// Der Navigator eines Laufs (Vertrag in `query-record-fields.js`). Eine
// Ziel-Tabelle wird beim ersten Pfad gelesen, der sie erreicht, und für den
// Lauf behalten; ein Verweis-Wert trägt den Pfad seiner Tabelle, und der
// Tabellen-Bestand nimmt ihn als Angabe. Ein Ziel, das es in diesem Stand nicht
// mehr gibt, ist «fehlend».
function recordNavigator(root, tables) {
  const byPath = new Map();
  for (const table of tables) byPath.set(table.path, table);
  const contexts = new Map();
  let ambiguous = false;
  const tableAt = (p) => {
    if (!byPath.has(p)) byPath.set(p, readRecordTable(root, p));
    return byPath.get(p);
  };
  const recordOf = (ref) => {
    if (typeof ref.path !== 'string' || ref.path === '') return null;
    const table = tableAt(ref.path);
    const r = table ? table.byId.get(ref.id) : null;
    return r ? { table, r } : null;
  };
  return {
    // Die Tabellen des Laufs, auch für die Hüllen (`record-hull.js`).
    tableAt,
    target(ref) {
      const key = `${ref.path}\n${ref.id}`;
      if (!contexts.has(key)) {
        const hit = recordOf(ref);
        contexts.set(key, hit ? recordContext(hit.table, hit.r) : null);
      }
      return contexts.get(key);
    },
    // Festlegung 8: so, als stünde der Text in der Verweis-Zelle (E5.4). Die
    // Kennung gewinnt in beiden Schreibweisen; sonst zählt der Wert des
    // einteiligen Schlüssels, ungetrimmt verglichen wie bei der Auflösung.
    matches(ref, text) {
      const cell = legeVerweisZelleAus(text);
      if (cell.art === VERWEIS_ARTEN.leer) return false;
      if (cell.art === VERWEIS_ARTEN.kennung) return cell.wert === ref.id;
      const hit = recordOf(ref);
      const key = hit ? hit.table.definition.key : null;
      return !!key && key.length === 1 && hit.r.key[0] === cell.wert;
    },
    ambiguous() {
      ambiguous = true;
    },
    sawAmbiguous: () => ambiguous,
  };
}

// --- Auswertung ----------------------------------------------------------------------

/**
 * Wertet eine Abfrage der Datensatz-Ebene aus.
 * @param {{ filePath: string, ast: object, root: string, entry: object, locale?: string,
 *   templatesFolder?: string|null }} p `templatesFolder` ist der wirksame
 *   Vorlagen-Ordner des Laufs (4T-002082), ohne ihn gibt es keinen Ausschluss.
 * @returns {{ resultSet: import('../../shared/query/result-set.js').ResultSet }}
 */
function recordsQueryFor({ filePath, ast, root, entry, locale, templatesFolder }) {
  const area = { root, fileCount: entry.fileCount };
  const checked = checkRecordsQuery(ast);
  if (checked.error) return stateResponse('ready', { area, queryError: checked.error });
  // Aus-Zustand am Schalter, bevor irgendeine Datei gelesen wird.
  if (!datensatzErfassungAktiv()) return resultResponse([], ast, area, { hint: HINT_DATABASE_OFF });

  const now = Date.now();
  let linkGraph = null;
  if (queryUsesLinks(ast)) {
    if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
    linkGraph = entry.linkGraph;
  }
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const contextOf = (absPath) => buildQueryContext(sicht, root, absPath, linkGraph, now, null);
  const selfAbs = path.resolve(filePath);
  const self = sicht.files.has(selfAbs) ? contextOf(selfAbs) : null;

  // Jede genannte Angabe auf ihre Kopf-Datei; gelesen werden nur die positiv
  // genannten Tabellen, jede einmal.
  const heads = new Map();
  for (const ref of checked.tables.named) {
    heads.set(ref, findeZielTabelle({ wurzel: root, sicht, tabelle: ref }));
  }
  // 4T-002082: Eine Tabelle mit ihrer Kopf-Datei im Vorlagen-Ordner fällt heraus.
  const templates = createTemplateExclusion({ root, templatesFolder, source: ast.source });
  const isTemplate = (headPath) => templates !== null && templates.excludes(headPath);
  const tables = new Map();
  for (const ref of checked.tables.positive) {
    const head = heads.get(ref);
    // 4T-002082: Eine ausgeschlossene Tabelle wird gar nicht erst gelesen.
    if (!head || tables.has(pathCompareKey(head)) || isTemplate(head)) continue;
    const table = readRecordTable(root, head);
    if (table) tables.set(pathCompareKey(head), table);
  }

  // Jede Hülle einmal, vor der Prüfung der Kandidaten (4T-002042).
  const recordNav = recordNavigator(root, tables.values());
  const hulls = new Map();
  for (const node of checked.tables.hulls) {
    hulls.set(node, buildHull(node, recordNav.tableAt, sicht));
  }
  const candidates = candidatesOf(tables, checked.tables.positiveHulls, hulls);
  const rows = [];
  for (const [headKey, { table, records }] of candidates) {
    // 4T-002082: Mitglieder einer Hülle aus einer Vorlagen-Tabelle fallen hier.
    if (isTemplate(table.path)) continue;
    const fileCtx = { ...contextOf(table.path), self, locale, recordNav };
    for (const r of records) {
      const at = { headKey, heads, hulls, key: hullKey(table.path, r.id) };
      if (!sourceHit(ast.source, at)) continue;
      const ctx = { ...fileCtx, record: recordContext(table, r) };
      if (ast.where && !truthy(evaluateExpression(ast.where, ctx))) continue;
      rows.push(ctx);
    }
  }
  rows.sort(compareRecords);
  const labelTables = [...candidates.values()]
    .map((c) => c.table)
    .filter((t) => !isTemplate(t.path));
  // 4T-002078: die Ausdrücke von GROUP BY in derselben Auflösung wie die Spalten,
  // für die Gruppen-Spalten der gruppierten Tabelle.
  const groupFields = ast.groupBy.map((expr) => ({ expr }));
  const allLabels = columnLabels([...ast.fields, ...groupFields], labelTables, locale, sicht);
  const labels = allLabels.slice(0, ast.fields.length);
  const groupLabels = allLabels.slice(ast.fields.length);
  // 4T-002078: Bei der gruppierten Tabelle laufen SORT und LIMIT über die Gruppen.
  const finalRows = isGroupedTable(ast) ? rows : applyResultPipeline(rows, ast);
  const response = resultResponse(finalRows, ast, area, { labels, groupLabels });
  // Rangfolge der Hinweise, weil der Zustand einen trägt: Ein Kreis in einer
  // Hülle geht jedem anderen vor, denn er ist sonst nirgends zu sehen. Ein
  // mehrdeutiger Verweis zeigt sich erst beim Auswerten, die Spalten
  // eingeschlossen, und kommt nur dazu, wenn noch kein Hinweis steht.
  const state = response.resultSet.state;
  const hullList = [...hulls.values()];
  if (hullList.some((h) => h.cycle)) state.hint = HINT_HULL_CYCLE;
  else if (state.hint === null && (recordNav.sawAmbiguous() || hullList.some((h) => h.ambiguous)))
    state.hint = HINT_REF_AMBIGUOUS;
  return response;
}

module.exports = {
  recordsQueryFor,
  checkRecordsQuery,
  HINT_DATABASE_OFF,
  HINT_REF_AMBIGUOUS,
  HINT_HULL_CYCLE,
};
