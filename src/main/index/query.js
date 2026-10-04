// 4T-000977 (Epic 3E-000196): Perspective-Abfrage über den Index, herausgelöst
// aus src/main/backlinks.js. Trägt frontmatterQueryFor (Datei-, Block- und
// Task-Scope samt Gruppierung und Task-Layout).
// 4T-001070 (Epic 3E-000211): Die Abfrage-Helfer des Task-Scopes (globale
// Task-Abfrage, Task-Tags, Status-Ordnung, Bezugstag, Gruppen-Bildung) liegen
// seit dem Datei-Größen-Schnitt in query-task-helfer.js; hier bleibt
// frontmatterQueryFor als die eine Fachlichkeit der Datei.
// 4T-002033 (Epic 3E-000260): Der Zeilen-Bau der Antwort (Ergebnismenge samt
// Gruppen-Bildung) liegt in query-result-set.js; hier bleibt das Auswerten.
// 4T-002039 (Epic 3E-000258): Die Datensatz-Ebene (RECORDS) wertet
// query-records.js aus; hier steht nur ihr Aufruf.

'use strict';

const path = require('node:path');

// 4T-000354 (Epic 3E-000065): Query-Parser der Perspective-Query-Sprache
// (perspective-query-Fence). Prozess-neutral, mit den Unit-Tests geteilt.
// Seit 4T-000401 (Epic 3E-000076) unter dem Namen perspective-query.js
// (Klausel-Sprache, nicht mehr nur Frontmatter).
// 4T-000987 (Epic 3E-000196): im Feature-Ordner src/shared/query/.
const { parseQuery } = require('../../shared/query/perspective-query.js');
// 4T-000402 (Epic 3E-000076): Auswertung (Typ-System, file.*-Felder, Funktions-
// Katalog, FROM-Quellen) aus dem Schwester-Modul; frontmatterQueryFor baut
// den Kontext pro Datei aus dem Index und laesst matchesQuery entscheiden.
const {
  matchesQuery,
  applyResultPipeline,
} = require('../../shared/query/perspective-query-eval.js');
const {
  validateQuery,
  queryUsesLinks,
  isGroupedTable,
} = require('../../shared/query/query-functions.js');
// 4T-002078 (Epic 3E-000259): Prüfung der Aggregat-Stellen einer gruppierten Tabelle.
const { checkGroupedTable } = require('../../shared/query/query-aggregate.js');
// 4T-000502 (Epic 3E-000096): Marker-Kern fuer den TASKS-Scope der Abfrage.
// 4T-000505: Dringlichkeits-Score und Vergleichs-Helfer der Default-Sortierung.
const {
  parseTaskLine,
  modelMatchesGlobalFilter,
  compareDateValue,
  priorityRank,
} = require('../../shared/tasks/task-markers.js');
const { computeUrgency } = require('../../shared/tasks/task-recurrence.js');
// 4T-000508: Blockierungs-/Duplikat-Flags ueber die Task-Menge des Bereichs.
const { computeDependencyFlags } = require('../../shared/tasks/task-dependencies.js');
const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');
const { buildLinkGraph, createTargetResolver, buildQueryContext } = require('./link-graph.js');
// 4T-001070 (Epic 3E-000211): Abfrage-Helfer des Task-Scopes im eigenen Modul.
const {
  statusTypeRank,
  localIsoDateOf,
  parseGlobalTaskQuery,
  taskLineTags,
} = require('./query-task-helfer.js');
// 4T-002033 (Epic 3E-000260): Zeilen-Bau der Antwort im eigenen Modul.
const { stateResponse, resultResponse } = require('./query-result-set.js');
// 4T-002039 (Epic 3E-000258): Auswertung der Datensatz-Ebene (RECORDS).
const { recordsQueryFor } = require('./query-records.js');
// 4T-002042 (Epic 3E-000258): Hüllen-Formen außerhalb der Datensatz-Ebene.
const { hullScopeError } = require('../../shared/query/query-record-sources.js');
// 4T-002082 (Epic 3E-000259): Vorlagen-Ausschluss je Kandidat.
const { createTemplateExclusion } = require('./query-templates.js');

// 4T-000354 (Epic 3E-000065): Perspective-Abfrage. Prueft jede Index-Datei ueber
// ihren Kontext (Frontmatter-Properties plus implizite file.*-Felder) gegen
// den Abfrage-AST (FROM-Quelle und WHERE-Bedingung, 4T-000402) und liefert die
// passenden Dateien (logischer Name plus Pfad), alphabetisch nach Anzeigename
// (SORT/LIMIT uebernimmt die Ergebnis-Pipeline in 4T-000403). Read-only-View wie
// tagsFor: Status wird durchgereicht, kein eigener Scan. Ein Query-Syntax-
// oder Funktions-Fehler wird als queryError im Zustand 'ready' mit leerer
// Zeilen-Liste durchgereicht; die nutzer-sichtbare Anzeige uebernimmt die View.
// 4T-000409 (Epic 3E-000077): im BLOCKS-Scope (Scope-Zusatz am Ausgabe-Typ) sind
// die Treffer Bloecke statt Dateien — pro aktivem blockData-Eintrag ein
// Kontext, Anzeige-Name 'Datei#^anker', anchor als Sprung-Information.
// 4T-000502 (Epic 3E-000096): im TASKS-Scope sind die Treffer Task-Zeilen —
// pro indexierter Checkbox-Zeile ein Kontext (Datei-Kontext plus ctx.task),
// Treffer tragen Zeilennummer und Roh-Zeile fuer Anzeige und Zeilen-Sprung.
// taskEnv liefert der IPC-Handler aus dem Store: { enabled (Erweiterung
// "Aufgaben" aktiv), globalFilter, statusTypeOf (char -> Typ | null) };
// im Aus-Zustand meldet der TASKS-Scope einen lokalisierbaren queryError.
// 4T-001072 (Epic 3E-000211): locale ist die eingestellte Programmsprache, der die
// Formatierer der Sprache folgen (dateformat, numberformat, currencyformat).
// Sie kommt vom Renderer durch, weil nur er sie kennt (Muster von
// convertMarkdownPortable); ohne Angabe gilt weiterhin die Laufzeit-Locale.
// 4T-002033 (Epic 3E-000260): Jede Antwort trägt die Ergebnismenge im Feld
// resultSet (Format-Vertrag src/shared/query/result-set.js); seit 4T-002035
// ist sie das einzige Feld der Antwort, auch der Zustand steht allein in ihr.
// 4T-002082 (Epic 3E-000259): templatesFolder ist der wirksame Vorlagen-Ordner
// des Fensters (absolut, oder nichts im Aus-Zustand der Erweiterung «Vorlagen»
// und ohne gewählten Ordner). Er kommt wie taskEnv vom Aufrufer, einmal je Lauf
// aufgelöst; was darin liegt, ist auf keiner Ebene ein Kandidat, außer die
// Quelle nennt den Ordner ausdrücklich (query-templates.js).
function frontmatterQueryFor(filePath, query, areaRoot, taskEnv, locale, templatesFolder) {
  if (!filePath) return stateResponse('unavailable');
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return stateResponse('unavailable');
  const entry = indexes.get(root);
  if (!entry) return stateResponse('unavailable');
  if (entry.status === 'oversized') {
    return stateResponse('oversized', {
      area: { root, fileCount: entry.fileCount, byteSize: entry.byteSize },
    });
  }
  if (entry.status === 'indexing') return stateResponse('indexing', { area: { root } });
  if (entry.status === 'error') return stateResponse('error', { area: { root } });
  // Abfrage-Fehler: Zustand «bereit» mit leerer Zeilen-Liste.
  const queryFailed = (queryError) => stateResponse('ready', { area: { root }, queryError });

  const parsedQuery = parseQuery(query);
  if (!parsedQuery.ok) return queryFailed(parsedQuery.error);
  // 4T-000402 (Epic 3E-000076): unbekannte Funktionen und falsche Stelligkeit
  // laufen ueber denselben queryError-Pfad wie Syntaxfehler.
  const fnError = validateQuery(parsedQuery.ast);
  if (fnError) return queryFailed(fnError);
  // 4T-002078 (Epic 3E-000259): An einer Aggregat-Stelle steht nur, was
  // gruppiert oder aggregiert ist; auf allen vier Ebenen und vor jedem Lesen.
  const groupedError = checkGroupedTable(parsedQuery.ast);
  if (groupedError) return queryFailed(groupedError);
  // 4T-002042: ancestors(…) und descendants(…) gibt es nur auf der Datensatz-Ebene.
  const hullError = hullScopeError(parsedQuery.ast);
  if (hullError) return queryFailed(hullError);
  // 4T-000503 (Epic 3E-000096): Aktivierungs-Grenze der Layout-Klauseln,
  // generisch geparst und nur für LIST TASKS ausgewertet.
  // 4T-002076 (Epic 3E-000259): Die Grenze der Gruppierung (Abfrage-Fehler
  // `groupByTasksOnly`) ist entfallen; GROUP BY wirkt auf allen vier Ebenen,
  // die Gruppen bildet der Zeilen-Bau (query-result-set.js).
  const isTaskList = parsedQuery.ast.scope === 'tasks' && parsedQuery.ast.type === 'list';
  if (
    (parsedQuery.ast.hide.length > 0 || parsedQuery.ast.show.length > 0 || parsedQuery.ast.short) &&
    !isTaskList
  ) {
    return queryFailed({
      code: 'layoutTasksOnly',
      message: 'HIDE/SHOW/SHORT nur bei LIST TASKS',
      pos: -1,
    });
  }
  // 4T-002039 (Epic 3E-000258): Datensatz-Ebene im eigenen Modul.
  if (parsedQuery.ast.scope === 'records') {
    return recordsQueryFor({
      filePath,
      ast: parsedQuery.ast,
      root,
      entry,
      locale,
      templatesFolder,
    });
  }
  const now = Date.now();
  const resolveLinkTarget = createTargetResolver(entry);
  const blockScope = parsedQuery.ast.scope === 'blocks';
  const taskScope = parsedQuery.ast.scope === 'tasks';
  // 4T-000502 (Epic 3E-000096): TASKS-Scope nur bei aktiver Erweiterung
  // "Aufgaben" (Querschnitt C des Konzept-Workshops: im Aus-Zustand
  // entfaellt der Scope; klarer Hinweis statt stiller Leer-Liste).
  if (taskScope && !(taskEnv && taskEnv.enabled)) {
    return queryFailed({
      code: 'tasksScopeDisabled',
      message: 'TASKS-Scope deaktiviert',
      pos: -1,
    });
  }
  const globalFilter = (taskEnv && taskEnv.globalFilter) || '';
  const statusTypeOf =
    taskEnv && typeof taskEnv.statusTypeOf === 'function' ? taskEnv.statusTypeOf : () => null;
  // 4T-000505: Bezugstag des Dringlichkeits-Scores (lokales Datum zu now).
  const todayIso = localIsoDateOf(now);
  // 4T-000505: globale Abfrage (Einstellungs-Vorgabe) — einmal pro Lauf
  // geparst und als zusaetzliche FROM-/WHERE-Anteile vorangestellt; ein
  // Fehler der globalen Abfrage meldet sich mit eigenem Code, damit die
  // Anzeige global von lokal unterscheidet.
  let evalAst = parsedQuery.ast;
  if (taskScope && taskEnv && typeof taskEnv.globalQuery === 'string' && taskEnv.globalQuery) {
    const globalParsed = parseGlobalTaskQuery(taskEnv.globalQuery);
    if (globalParsed.error) {
      return queryFailed({
        code: 'globalQueryInvalid',
        message: 'Globale Abfrage ungültig',
        pos: -1,
      });
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
  // 4T-002082: Vorlagen-Ausschluss über die wirksame Quelle samt globaler
  // Anteile, weil sie es ist, die den Treffer-Raum begrenzt.
  const templates = createTemplateExclusion({ root, templatesFolder, source: evalAst.source });
  const excludedAsTemplate = (absPath) => templates !== null && templates.excludes(absPath);
  // Link-Graph nur aufbauen, wenn die (effektive, inklusive globaler
  // Anteile) Abfrage ihn braucht (file.inlinks/file.outlinks oder
  // FROM-Link-Quelle).
  let linkGraph = null;
  if (queryUsesLinks(evalAst)) {
    if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
    linkGraph = entry.linkGraph;
  }
  // 4T-000935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten
  // Ansicht). Erst hier, nach dem Link-Graph-Aufbau oben, damit dessen Cache
  // am Original-Eintrag landet.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  // 4T-001070 (Epic 3E-000211): Kontext der Träger-Datei — Ziel des
  // `this.`-Präfixes und der Selbstbezugs-Quelle. EINMAL je Lauf gebaut und an
  // jeden Treffer-Kontext gehängt, nicht je Treffer neu: Er ist für alle
  // Treffer derselbe, und der Aufbau kostet Link-Graph-Zugriffe. Liegt die
  // Träger-Datei nicht im Index (ungespeicherter oder bereichsfremder Tab),
  // bleibt er null und alle Selbstbezüge degradieren weich (Konzept-E9).
  const selfAbs = path.resolve(filePath);
  const selfCtx = sicht.files.has(selfAbs)
    ? buildQueryContext(sicht, root, selfAbs, linkGraph, now, resolveLinkTarget)
    : null;
  const rows = [];
  // 4T-000502/4T-000508: TASKS-Scope in zwei Phasen — erst ALLE Task-Zeilen des
  // Bereichs zum Modell parsen (Global Filter angewandt), dann die
  // Blockierungs-/Duplikat-Flags ueber die Gesamt-Menge berechnen
  // (computeDependencyFlags braucht die Datei-uebergreifende Sicht), erst
  // danach der Filter-Pass mit vollstaendigem Task-Kontext.
  if (taskScope) {
    const candidates = [];
    for (const absPath of sicht.files.keys()) {
      // 4T-002082: Eine Aufgabe einer Vorlage ist kein Kandidat, auch nicht für
      // die Blockierungs- und Duplikat-Flags der übrigen.
      if (excludedAsTemplate(absPath)) continue;
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
        // 4T-001070: Selbst-Kontext an jeden Treffer (konstant je Lauf).
        fileCtx = {
          ...buildQueryContext(sicht, root, c.absPath, linkGraph, now, resolveLinkTarget),
          self: selfCtx,
          locale,
        };
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
          // 4T-000505: Dringlichkeits-Score mit injiziertem Bezugstag.
          urgency: computeUrgency(c.model, { todayIso }),
          // 4T-000508: Blockierungs- und Duplikat-Flags.
          blocked: flags[i].blocked,
          blocking: flags[i].blocking,
          duplicateId: flags[i].duplicateId,
        },
      };
      if (matchesQuery(evalAst, ctx)) rows.push(ctx);
    }
  }
  for (const absPath of taskScope ? [] : sicht.files.keys()) {
    // 4T-002082: Datei und Block einer Vorlage, vor Quelle und Bedingung.
    if (excludedAsTemplate(absPath)) continue;
    if (blockScope) {
      // 4T-000409 (Epic 3E-000077): BLOCKS-Scope — pro Block-Daten-Eintrag ein
      // Kontext aus Datei-Kontext plus Block ({ anchor, values, updatedMs },
      // 4T-000408). Nur aktive Anker zaehlen: verwaiste Eintraege (Anker steht
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
          // 4T-001070: Selbst-Kontext an jeden Treffer (konstant je Lauf).
          fileCtx = {
            ...buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget),
            self: selfCtx,
            locale,
          };
        }
        const ctx = { ...fileCtx, block };
        if (matchesQuery(evalAst, ctx)) rows.push(ctx);
      }
      continue;
    }
    const ctx = {
      ...buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget),
      self: selfCtx,
      locale,
    };
    if (matchesQuery(evalAst, ctx)) rows.push(ctx);
  }
  // Basis-Ordnung: Datei- und Block-Scope alphabetisch (Name, Pfad, Anker)
  // wie bisher; der Task-Scope folgt seit 4T-000505 der Referenz-Default-
  // Sortierung Status-Typ -> Dringlichkeit (absteigend) -> Faelligkeit ->
  // Prioritaet -> Pfad (Zeile als letzter Determinismus-Anker). SORT
  // ueberschreibt sie in der Ergebnis-Pipeline, LIMIT schneidet nach der
  // Sortierung (4T-000403).
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
  // 4T-002078 (Epic 3E-000259): Bei der gruppierten Tabelle laufen SORT und
  // LIMIT über die Gruppen im Zeilen-Bau, nicht hier über die Zeilen.
  const finalRows = isGroupedTable(evalAst) ? rows : applyResultPipeline(rows, evalAst);
  // 4T-002033 (Epic 3E-000260): Ergebnismenge aus dem AST des Blocks (ohne globale Anteile, wie bisher). Die Gruppierung
  // läuft dort NACH der Ergebnis-Pipeline: SORT bestimmt die Reihenfolge
  // innerhalb der Gruppen, LIMIT schneidet vor der Gruppen-Bildung. Seit
  // 4T-002076 gilt das für jede Ebene bei der Liste, seit 4T-002078 nicht mehr
  // für die Tabelle.
  return resultResponse(finalRows, parsedQuery.ast, { root, fileCount: entry.fileCount });
}

module.exports = {
  frontmatterQueryFor,
};
