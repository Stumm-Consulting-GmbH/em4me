// 4T-0977 (Epic 3E-0196): Perspective-Abfrage über den Index, herausgelöst
// aus src/main/backlinks.js. Trägt frontmatterQueryFor (Datei-, Block- und
// Task-Scope samt Gruppierung und Task-Layout) mit seinen Abfrage-Helfern
// (globale Task-Abfrage, Task-Tags, Status-Ordnung, Gruppen-Bildung).

'use strict';

// 4T-0354 (Epic 3E-0065): Query-Parser der Perspective-Query-Sprache
// (perspective-query-Fence). Prozess-neutral, mit den Unit-Tests geteilt.
// Seit 4T-0401 (Epic 3E-0076) unter dem Namen perspective-query.js
// (Klausel-Sprache, nicht mehr nur Frontmatter).
// 4T-0987 (Epic 3E-0196): im Feature-Ordner src/shared/query/.
const { parseQuery } = require('../../shared/query/perspective-query.js');
// 4T-0402 (Epic 3E-0076): Auswertung (Typ-System, file.*-Felder, Funktions-
// Katalog, FROM-Quellen) aus dem Schwester-Modul; frontmatterQueryFor baut
// den Kontext pro Datei aus dem Index und laesst matchesQuery entscheiden.
const {
  matchesQuery,
  applyResultPipeline,
  evaluateExpression,
  // 4T-0503 (Epic 3E-0096): Werte-Ordnung der Gruppen-Reihenfolge.
  orderForSort,
} = require('../../shared/query/perspective-query-eval.js');
const { validateQuery, queryUsesLinks } = require('../../shared/query/query-functions.js');
// 4T-0503 (Epic 3E-0096): Anzeige-Form der Gruppen-Keys.
const {
  formatValue,
  formatValueSegments,
  formatExprSource,
} = require('../../shared/query/query-format.js');
// 4T-0502 (Epic 3E-0096): Marker-Kern fuer den TASKS-Scope der Abfrage.
// 4T-0505: Dringlichkeits-Score und Vergleichs-Helfer der Default-Sortierung.
const {
  parseTaskLine,
  modelMatchesGlobalFilter,
  compareDateValue,
  priorityRank,
} = require('../../shared/tasks/task-markers.js');
const { computeUrgency } = require('../../shared/tasks/task-recurrence.js');
// 4T-0508: Blockierungs-/Duplikat-Flags ueber die Task-Menge des Bereichs.
const { computeDependencyFlags } = require('../../shared/tasks/task-dependencies.js');
const { maskInlineCode } = require('../../shared/markdown/link-scan.js');
const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');
const { buildLinkGraph, createTargetResolver, buildQueryContext } = require('./link-graph.js');
const { TAG_RE, isValidTag } = require('./parse.js');

// 4T-0505 (Epic 3E-0096): Ordnung der Status-Typen fuer die Task-Default-
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

// 4T-0505 (Epic 3E-0096): lokales ISO-Datum eines Zeitpunkts (Bezugstag des
// Dringlichkeits-Scores; dieselbe lokale Zeitachse wie date(today)).
function localIsoDateOf(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 4T-0505 (Epic 3E-0096): globale Task-Abfrage aus den Einstellungen —
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

// 4T-0502 (Epic 3E-0096): Inline-Tags einer Task-Beschreibung fuer das
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

// 4T-0354 (Epic 3E-0065): Perspective-Abfrage. Prueft jede Index-Datei ueber
// ihren Kontext (Frontmatter-Properties plus implizite file.*-Felder) gegen
// den Abfrage-AST (FROM-Quelle und WHERE-Bedingung, 4T-0402) und liefert die
// passenden Dateien (logischer Name plus Pfad), alphabetisch nach Anzeigename
// (SORT/LIMIT uebernimmt die Ergebnis-Pipeline in 4T-0403). Read-only-View wie
// tagsFor: Status wird durchgereicht, kein eigener Scan. Ein Query-Syntax-
// oder Funktions-Fehler wird als queryError-Info bei status 'ready' mit leerer
// Liste durchgereicht; die nutzer-sichtbare Anzeige uebernimmt die View.
// 4T-0409 (Epic 3E-0077): im BLOCKS-Scope (Scope-Zusatz am Ausgabe-Typ) sind
// die Treffer Bloecke statt Dateien — pro aktivem blockData-Eintrag ein
// Kontext, Anzeige-Name 'Datei#^anker', anchor als Sprung-Information.
// 4T-0502 (Epic 3E-0096): im TASKS-Scope sind die Treffer Task-Zeilen —
// pro indexierter Checkbox-Zeile ein Kontext (Datei-Kontext plus ctx.task),
// Treffer tragen Zeilennummer und Roh-Zeile fuer Anzeige und Zeilen-Sprung.
// taskEnv liefert der IPC-Handler aus dem Store: { enabled (Erweiterung
// "Aufgaben" aktiv), globalFilter, statusTypeOf (char -> Typ | null) };
// im Aus-Zustand meldet der TASKS-Scope einen lokalisierbaren queryError.
function frontmatterQueryFor(filePath, query, areaRoot, taskEnv) {
  if (!filePath) return { status: 'unavailable' };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { wurzel: root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta: { wurzel: root } };
  if (entry.status === 'error') return { status: 'error', meta: { wurzel: root } };

  const parsedQuery = parseQuery(query);
  if (!parsedQuery.ok) {
    return { status: 'ready', meta: { wurzel: root }, queryError: parsedQuery.error, files: [] };
  }
  // 4T-0402 (Epic 3E-0076): unbekannte Funktionen und falsche Stelligkeit
  // laufen ueber denselben queryError-Pfad wie Syntaxfehler.
  const fnError = validateQuery(parsedQuery.ast);
  if (fnError) {
    return { status: 'ready', meta: { wurzel: root }, queryError: fnError, files: [] };
  }
  // 4T-0503 (Epic 3E-0096): Aktivierungs-Grenze der Gruppierung und der
  // Layout-Klauseln — generisch geparst, in dieser Stufe aber nur fuer
  // LIST TASKS ausgewertet (Epic-Risiko-Punkt: die Klauseln sollen spaeter
  // auch Datei- und Block-Scope tragen koennen, ohne sie dort zu aktivieren).
  const isTaskList = parsedQuery.ast.scope === 'tasks' && parsedQuery.ast.type === 'list';
  if (parsedQuery.ast.groupBy.length > 0 && !isTaskList) {
    return {
      status: 'ready',
      meta: { wurzel: root },
      queryError: { code: 'groupByTasksOnly', message: 'GROUP BY nur bei LIST TASKS', pos: -1 },
      files: [],
    };
  }
  if (
    (parsedQuery.ast.hide.length > 0 || parsedQuery.ast.show.length > 0 || parsedQuery.ast.short) &&
    !isTaskList
  ) {
    return {
      status: 'ready',
      meta: { wurzel: root },
      queryError: {
        code: 'layoutTasksOnly',
        message: 'HIDE/SHOW/SHORT nur bei LIST TASKS',
        pos: -1,
      },
      files: [],
    };
  }
  const now = Date.now();
  const resolveLinkTarget = createTargetResolver(entry);
  const blockScope = parsedQuery.ast.scope === 'blocks';
  const taskScope = parsedQuery.ast.scope === 'tasks';
  // 4T-0502 (Epic 3E-0096): TASKS-Scope nur bei aktiver Erweiterung
  // "Aufgaben" (Querschnitt C des Konzept-Workshops: im Aus-Zustand
  // entfaellt der Scope; klarer Hinweis statt stiller Leer-Liste).
  if (taskScope && !(taskEnv && taskEnv.enabled)) {
    return {
      status: 'ready',
      meta: { wurzel: root },
      queryError: { code: 'tasksScopeDisabled', message: 'TASKS-Scope deaktiviert', pos: -1 },
      files: [],
    };
  }
  const globalFilter = (taskEnv && taskEnv.globalFilter) || '';
  const statusTypeOf =
    taskEnv && typeof taskEnv.statusTypeOf === 'function' ? taskEnv.statusTypeOf : () => null;
  // 4T-0505: Bezugstag des Dringlichkeits-Scores (lokales Datum zu now).
  const todayIso = localIsoDateOf(now);
  // 4T-0505: globale Abfrage (Einstellungs-Vorgabe) — einmal pro Lauf
  // geparst und als zusaetzliche FROM-/WHERE-Anteile vorangestellt; ein
  // Fehler der globalen Abfrage meldet sich mit eigenem Code, damit die
  // Anzeige global von lokal unterscheidet.
  let evalAst = parsedQuery.ast;
  if (taskScope && taskEnv && typeof taskEnv.globalQuery === 'string' && taskEnv.globalQuery) {
    const globalParsed = parseGlobalTaskQuery(taskEnv.globalQuery);
    if (globalParsed.error) {
      return {
        status: 'ready',
        meta: { wurzel: root },
        queryError: { code: 'globalQueryInvalid', message: 'Globale Abfrage ungültig', pos: -1 },
        files: [],
      };
    }
    evalAst = { ...parsedQuery.ast };
    if (globalParsed.where) {
      evalAst.where = evalAst.where
        ? { type: 'and', left: globalParsed.where, right: evalAst.where }
        : globalParsed.where;
    }
    if (globalParsed.source) {
      evalAst.source = evalAst.source
        ? { type: 'srcAnd', left: globalParsed.source, right: evalAst.source }
        : globalParsed.source;
    }
  }
  // Link-Graph nur aufbauen, wenn die (effektive, inklusive globaler
  // Anteile) Abfrage ihn braucht (file.inlinks/file.outlinks oder
  // FROM-Link-Quelle).
  let linkGraph = null;
  if (queryUsesLinks(evalAst)) {
    if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
    linkGraph = entry.linkGraph;
  }
  // 4T-0935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten
  // Ansicht). Erst hier, nach dem Link-Graph-Aufbau oben, damit dessen Cache
  // am Original-Eintrag landet.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const rows = [];
  // 4T-0502/4T-0508: TASKS-Scope in zwei Phasen — erst ALLE Task-Zeilen des
  // Bereichs zum Modell parsen (Global Filter angewandt), dann die
  // Blockierungs-/Duplikat-Flags ueber die Gesamt-Menge berechnen
  // (computeDependencyFlags braucht die Datei-uebergreifende Sicht), erst
  // danach der Filter-Pass mit vollstaendigem Task-Kontext.
  if (taskScope) {
    const candidates = [];
    for (const absPath of sicht.files.keys()) {
      const taskLines = sicht.tasksPerFile.get(absPath);
      if (!taskLines || taskLines.length === 0) continue;
      for (const tl of taskLines) {
        const model = parseTaskLine(tl.text);
        if (!model) continue;
        if (!modelMatchesGlobalFilter(model, globalFilter)) continue;
        candidates.push({
          absPath,
          tl,
          model,
          statusType: statusTypeOf(model.statusChar),
        });
      }
    }
    const flags = computeDependencyFlags(
      candidates.map((c) => ({
        id: c.model.id,
        dependsOn: c.model.dependsOn,
        statusType: c.statusType,
      })),
    );
    const fileCtxCache = new Map();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let fileCtx = fileCtxCache.get(c.absPath);
      if (!fileCtx) {
        fileCtx = buildQueryContext(sicht, root, c.absPath, linkGraph, now, resolveLinkTarget);
        fileCtxCache.set(c.absPath, fileCtx);
      }
      const ctx = {
        ...fileCtx,
        task: {
          model: c.model,
          line: c.tl.zeile,
          heading: c.tl.heading || null,
          statusType: c.statusType,
          description: c.model.description.trim(),
          tags: taskLineTags(c.model.description),
          raw: c.tl.text,
          // 4T-0505: Dringlichkeits-Score mit injiziertem Bezugstag.
          urgency: computeUrgency(c.model, { todayIso }),
          // 4T-0508: Blockierungs- und Duplikat-Flags.
          blocked: flags[i].blocked,
          blocking: flags[i].blocking,
          duplicateId: flags[i].duplicateId,
        },
      };
      if (matchesQuery(evalAst, ctx)) rows.push(ctx);
    }
  }
  for (const absPath of taskScope ? [] : sicht.files.keys()) {
    if (blockScope) {
      // 4T-0409 (Epic 3E-0077): BLOCKS-Scope — pro Block-Daten-Eintrag ein
      // Kontext aus Datei-Kontext plus Block ({ anchor, values, updatedMs },
      // 4T-0408). Nur aktive Anker zaehlen: verwaiste Eintraege (Anker steht
      // nicht mehr im Dokument) sind kein Block-Treffer, denn Treffer sind
      // klickbare Datei#^anker-Ziele (Anker als Identitaet, Epic-Entscheidung);
      // das Panel fuehrt verwaiste Daten separat. Dateien ohne Block-Daten
      // liefern schlicht keine Treffer (kein Fehler-Zustand).
      const blocks = entry.blockDataPerFile.get(absPath);
      if (!blocks || blocks.length === 0) continue;
      const anchorsMeta = sicht.anchorsPerFile.get(absPath);
      if (!anchorsMeta || anchorsMeta.blockIds.size === 0) continue;
      let fileCtx = null;
      for (const block of blocks) {
        if (!anchorsMeta.blockIds.has(block.anchor)) continue;
        if (!fileCtx) {
          fileCtx = buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget);
        }
        const ctx = { ...fileCtx, block };
        if (matchesQuery(evalAst, ctx)) rows.push(ctx);
      }
      continue;
    }
    const ctx = buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget);
    if (matchesQuery(evalAst, ctx)) rows.push(ctx);
  }
  // Basis-Ordnung: Datei- und Block-Scope alphabetisch (Name, Pfad, Anker)
  // wie bisher; der Task-Scope folgt seit 4T-0505 der Referenz-Default-
  // Sortierung Status-Typ -> Dringlichkeit (absteigend) -> Faelligkeit ->
  // Prioritaet -> Pfad (Zeile als letzter Determinismus-Anker). SORT
  // ueberschreibt sie in der Ergebnis-Pipeline, LIMIT schneidet nach der
  // Sortierung (4T-0403).
  if (taskScope) {
    rows.sort(
      (a, b) =>
        statusTypeRank(a.task.statusType) - statusTypeRank(b.task.statusType) ||
        b.task.urgency - a.task.urgency ||
        compareDateValue(a.task.model.due, b.task.model.due) ||
        priorityRank(a.task.model.priority) - priorityRank(b.task.model.priority) ||
        a.file.path.localeCompare(b.file.path) ||
        a.task.line - b.task.line,
    );
  } else {
    rows.sort(
      (a, b) =>
        a.file.name.localeCompare(b.file.name) ||
        a.file.path.localeCompare(b.file.path) ||
        (blockScope ? a.block.anchor.localeCompare(b.block.anchor) : 0),
    );
  }
  const finalRows = applyResultPipeline(rows, evalAst);
  const ast = parsedQuery.ast;
  // 4T-0409: Treffer-Identitaet der View. Im Block-Scope ist der Anzeige-Name
  // 'Datei#^anker' und `anchor` traegt die Sprung-Information fuer den Klick
  // (bestehende Wiki-Link-Sprung-Mechanik); path bleibt der absolute Index-Pfad.
  // 4T-0502: im Task-Scope tragen Treffer Zeilennummer (Zeilen-Sprung) und
  // Roh-Zeile (die View parst sie mit dem Marker-Kern und baut die Task-Optik).
  const toHit = (ctx) => {
    if (blockScope) {
      return {
        name: `${ctx.file.name}#^${ctx.block.anchor}`,
        path: ctx.file.absPath,
        anchor: ctx.block.anchor,
      };
    }
    if (taskScope) {
      return {
        name: ctx.file.name,
        path: ctx.file.absPath,
        line: ctx.task.line,
        taskText: ctx.task.raw,
        // 4T-0505: einblendbarer Score (SHOW urgency), auf zwei
        // Nachkommastellen gerundet (Anzeige-Form der Referenz-Formel).
        urgency: Math.round(ctx.task.urgency * 100) / 100,
        // 4T-0508: dezente Kennzeichnungen der Treffer-Darstellung.
        blocked: ctx.task.blocked,
        duplicateId: ctx.task.duplicateId,
      };
    }
    return { name: ctx.file.name, path: ctx.file.absPath };
  };
  const result = {
    status: 'ready',
    meta: { wurzel: root, fileCount: entry.fileCount },
    // 4T-0404 (Epic 3E-0076): Ausgabe-Typ fuer die View ('list' | 'table').
    queryType: ast.type,
    // 4T-0502 (Epic 3E-0096): Auswertungs-Ebene fuer die View
    // ('files' | 'blocks' | 'tasks') — steuert die Task-Listen-Optik.
    queryScope: ast.scope,
    files: finalRows.map(toHit),
  };
  // 4T-0405 (Epic 3E-0076): COLUMNS ist reines Listen-Layout; bei TABLE wird
  // es ignoriert und als lokalisierter Hinweis am Fence gemeldet (kein Fehler).
  if (ast.layoutColumns) {
    if (ast.type === 'list') result.layoutColumns = ast.layoutColumns;
    else result.hint = 'columnsIgnored';
  }
  if (ast.type === 'table') {
    // Tabellen-Daten: Kopfzeile aus AS-Alias bzw. Ausdrucks-Quelltext, Zellen
    // als Anzeige-Segmente (Text plus klickbare Link-Verweise). Die files-
    // Liste bleibt parallel gefuellt (gemeinsamer Leer-/Alt-Pfad der View).
    result.table = {
      withoutId: !!ast.withoutId,
      headers: ast.fields.map((f) => f.alias || formatExprSource(f.expr)),
      rows: finalRows.map((ctx) => ({
        ...toHit(ctx),
        cells: ast.fields.map((f) => formatValueSegments(evaluateExpression(f.expr, ctx))),
      })),
    };
  } else if (ast.fields.length > 0) {
    // LIST-Zusatzfeld: ausgewerteter Ausdruck als Segmente je Treffer.
    result.files = finalRows.map((ctx) => ({
      ...toHit(ctx),
      extra: formatValueSegments(evaluateExpression(ast.fields[0].expr, ctx)),
    }));
  }
  // 4T-0503 (Epic 3E-0096): Task-Layout und Gruppierung (nur LIST TASKS,
  // Aktivierungs-Grenze oben). Die Gruppierung laeuft NACH der Ergebnis-
  // Pipeline: SORT bestimmt die Reihenfolge innerhalb der Gruppen, LIMIT
  // schneidet vor der Gruppen-Bildung; die Gruppen-Reihenfolge folgt der
  // Werte-Ordnung der Gruppen-Keys (orderForSort), Treffer ohne Wert bilden
  // die letzte Gruppe (label null, lokalisiert von der View). Das LIST-
  // Zusatzfeld geht ueber hitFor in die Gruppen-Eintraege mit ein.
  if (taskScope && ast.type === 'list') {
    result.totalCount = finalRows.length;
    result.taskLayout = { hide: ast.hide, show: ast.show, short: ast.short };
    if (ast.groupBy.length > 0) {
      const hitFor = (ctx) => {
        const hit = toHit(ctx);
        if (ast.fields.length > 0) {
          hit.extra = formatValueSegments(evaluateExpression(ast.fields[0].expr, ctx));
        }
        return hit;
      };
      result.groups = buildTaskGroups(finalRows, ast.groupBy, 0, hitFor);
      result.files = [];
    }
  }
  return result;
}

// 4T-0503 (Epic 3E-0096): rekursive Gruppen-Bildung der Task-Ausgabe.
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
    if (level + 1 < keyExprs.length) {
      return { label: g.label, groups: buildTaskGroups(g.rows, keyExprs, level + 1, hitFor) };
    }
    return { label: g.label, items: g.rows.map(hitFor) };
  });
}

module.exports = {
  frontmatterQueryFor,
};
