// 4T-000977 (Epic 3E-000196): Daten-Views auf dem Abfrage-Kontext, herausgelöst
// aus src/main/backlinks.js. Zwei Verbraucher der gerenderten Ansicht, die
// den Abfrage-Kontext (link-graph.js) nutzen, aber keine Perspective-Abfrage
// im engeren Sinn sind: die Ereignis-Aggregation über das Frontmatter
// (eventsForQuery) und der Daten-Snapshot der Skript-Blöcke (scriptDataFor).

'use strict';

const path = require('node:path');
// 4T-000987 (Epic 3E-000196): im Feature-Ordner src/shared/query/.
const { parseQuery } = require('../../shared/query/perspective-query.js');
const { matchesQuery } = require('../../shared/query/perspective-query-eval.js');
const { validateQuery, queryUsesLinks } = require('../../shared/query/query-functions.js');
// 4T-000515 (Epic 3E-000092): Zuordnungs-Feld-Auswertung der Ereignis-
// Aggregation (Grundmenge = Dateien, deren Zuordnungs-Feld das interne
// Ereignis-Profil nennt).
const { assignedProfileNames } = require('../../shared/property-profiles.js');
const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');
// 4T-002126 (Epic 3E-000345): Vorlagen-Ausschluss mit derselben Regel wie die
// Abfrage (Konzept-Entscheidung E6.7).
const { createTemplateExclusion } = require('./query-templates.js');
const { isInsideArea } = require('../area/area-path.js');
const {
  buildLinkGraph,
  createTargetResolver,
  buildQueryContext,
  logicalNameFor,
} = require('./link-graph.js');

// 4T-000515 (Epic 3E-000092): Ereignis-Aggregation. Grundmenge sind alle
// Index-Dateien, deren Zuordnungs-Feld (assignField der Profil-
// Konfiguration) das interne Ereignis-Profil nennt; eine optionale
// FROM/WHERE-Abfrage verfeinert die Menge ueber denselben Evaluator wie
// die Perspective-Abfrage. Liefert pro Treffer die event-*-Frontmatter-
// Felder (roh, Abbildung uebernimmt der Renderer), den logischen Namen
// (Titel-Fallback) und mtimeMs (Konflikt-Erkennung des Rueckschreibens).
// Status-Semantik identisch zu frontmatterQueryFor.
// 4T-002126 (Epic 3E-000345): opts.templatesFolder ist der wirksame
// Vorlagen-Ordner (absolut, oder nichts im Aus-Zustand der Erweiterung
// «Vorlagen» und ohne gewählten Ordner), vom Kanal einmal je Lauf aufgelöst.
// Was darin liegt, wird nicht eingesammelt, außer das FROM der Abfrage nennt
// den Ordner ausdrücklich (Regel in query-templates.js).
function eventsForQuery(filePath, queryText, areaRoot, opts) {
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

  let ast = null;
  const trimmed = String(queryText || '').trim();
  if (trimmed !== '') {
    const parsed = parseQuery(trimmed);
    if (!parsed.ok) {
      return { status: 'ready', meta: { wurzel: root }, queryError: parsed.error, events: [] };
    }
    const fnError = validateQuery(parsed.ast);
    if (fnError) {
      return { status: 'ready', meta: { wurzel: root }, queryError: fnError, events: [] };
    }
    // Die Aggregation arbeitet auf Datei-Ebene; BLOCKS/TASKS-Scopes sind
    // hier nicht sinnvoll (klarer Hinweis statt stiller Leer-Liste).
    if (parsed.ast.scope !== 'files') {
      return {
        status: 'ready',
        meta: { wurzel: root },
        queryError: { code: 'eventsFilesOnly', message: 'nur Datei-Scope', pos: -1 },
        events: [],
      };
    }
    ast = parsed.ast;
  }
  const now = Date.now();
  const resolveLinkTarget = createTargetResolver(entry);
  const linkGraph = ast && queryUsesLinks(ast) ? entry.linkGraph : null;
  const profileName = String((opts && opts.profileName) || '').toLowerCase();
  const events = [];
  // 4T-002126: einmal je Lauf über die Quelle der Abfrage gebildet; ohne
  // Abfrage gibt es keine Quelle und damit keine ausdrückliche Nennung.
  const templates = createTemplateExclusion({
    root,
    templatesFolder: opts && opts.templatesFolder,
    source: ast ? ast.source : null,
  });
  // 4T-000935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten Ansicht).
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  for (const [absPath, props] of sicht.propertiesPerFile) {
    // 4T-002126: Eine Vorlage ist kein Kandidat, vor dem Zuordnungs-Feld geprüft.
    if (templates !== null && templates.excludes(absPath)) continue;
    const assigned = assignedProfileNames(props, opts && opts.assignField);
    if (!assigned.some((n) => n.toLowerCase() === profileName)) continue;
    if (ast) {
      const ctx = buildQueryContext(sicht, root, absPath, linkGraph, now, resolveLinkTarget);
      if (!matchesQuery(ast, ctx)) continue;
    }
    const stats = entry.fileStats.get(absPath) || {};
    events.push({
      path: absPath,
      name: logicalNameFor(absPath),
      mtimeMs: stats.mtimeMs || 0,
      fields: {
        date: props['event-date'],
        end: props['event-end'],
        text: props['event-text'],
        category: props['event-category'],
        notes: props['event-notes'],
        recurring: props['event-recurring'],
        predecessors: props['event-predecessors'],
        successors: props['event-successors'],
      },
    });
  }
  return { status: 'ready', meta: { wurzel: root }, events };
}

// 4T-000413 (Epic 3E-000078): Daten-Snapshot fuer Skript-Bloecke
// (perspective-script). Liefert einmalig pro Lauf den kompletten Suchraum
// als serialisierbare Struktur: pro Datei der Abfrage-Kontext (Frontmatter-
// props plus implizite file.*-Felder inkl. inlinks/outlinks — identisches
// Feld-Modell wie frontmatterQueryFor) und die aktiven Block-Metadaten
// (Anker-Identitaet wie im BLOCKS-Scope: verwaiste Eintraege zaehlen nicht).
// Der Link-Graph wird immer aufgebaut (Skripte fragen ihn typischerweise ab,
// der Referenz-Fall des PO ist ein rekursiver outlinks-Baum). Kein Live-
// Kanal: die Sandbox erhaelt den Snapshot mit dem Run-Auftrag; Aktualitaet
// sichert die Index-Invalidierung ueber den Neustart des Blocks.
// 4T-002126 (Epic 3E-000345): templatesFolder ist der wirksame Vorlagen-Ordner
// (absolut oder nichts). Die Vorlagen bleiben im Abzug, weil die Quelle eines
// Skripts erst in der Ausführungs-Umgebung bekannt ist und die Ausnahme über
// eine ausdrückliche Ordner-Quelle nur dort entschieden werden kann; der Abzug
// trägt den Ordner deshalb mit (templatesFolderOf), und pq.pages und pq.blocks
// wenden die Regel an (src/renderer/script-sandbox.html).
function scriptDataFor(filePath, areaRoot, templatesFolder) {
  if (!filePath) return { status: 'unavailable' };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'oversized') {
    return { status: 'oversized', meta: { wurzel: root, fileCount: entry.fileCount } };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta: { wurzel: root } };
  if (entry.status === 'error') return { status: 'error', meta: { wurzel: root } };

  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const linkGraph = entry.linkGraph;
  const now = Date.now();
  const pages = [];
  const blocks = [];
  // 4T-000935: Puffer-Overlay freigeschaltet (Verbraucher der gerenderten
  // Ansicht). Die Sicht wird nach dem Link-Graph-Aufbau gebildet, damit der
  // Cache am Original-Eintrag landet und nicht an der Sicht.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  for (const absPath of sicht.files.keys()) {
    const ctx = buildQueryContext(sicht, root, absPath, linkGraph, now, null);
    pages.push({ props: ctx.props, file: ctx.file });
    const blockEntries = entry.blockDataPerFile.get(absPath);
    if (!blockEntries || blockEntries.length === 0) continue;
    const anchorsMeta = sicht.anchorsPerFile.get(absPath);
    if (!anchorsMeta || anchorsMeta.blockIds.size === 0) continue;
    for (const block of blockEntries) {
      if (!anchorsMeta.blockIds.has(block.anchor)) continue;
      blocks.push({
        file: { path: ctx.file.path, absPath: ctx.file.absPath, name: ctx.file.name },
        anchor: block.anchor,
        values: block.values,
        updatedMs: block.updatedMs,
      });
    }
  }
  return {
    status: 'ready',
    current: filePath,
    pages,
    blocks,
    templatesFolder: templatesFolderOf(root, templatesFolder),
  };
}

// 4T-002126 (Epic 3E-000345): der Vorlagen-Ordner in der Schreibweise von
// file.folder, also wurzel-relativ mit '/' und ohne Trenner am Rand (die
// Wurzel selbst ist ''). Ohne Ordner und für einen Ordner außerhalb des
// Suchraums null: Eine Seite des Abzugs kann dort nicht liegen, es gibt also
// nichts auszuschließen. Die Lage prüft isInsideArea mit demselben
// Pfad-Vergleich wie der Ausschluss der Abfrage (normalizeForCompare).
function templatesFolderOf(root, templatesFolder) {
  if (typeof templatesFolder !== 'string' || templatesFolder === '') return null;
  if (!isInsideArea(root, templatesFolder)) return null;
  return path.relative(root, path.resolve(templatesFolder)).split(path.sep).join('/');
}

module.exports = {
  eventsForQuery,
  scriptDataFor,
};
