// 4T-000977 (Epic 3E-000196): Link-Graph und Abfrage-Kontext, herausgelöst aus
// src/main/backlinks.js. Der Graph (ausgehende und eingehende Links je Datei)
// ist die gemeinsame Grundlage der Abfrage-Felder file.inlinks/file.outlinks,
// der FROM-Link-Quellen, der Graphenansicht und der Bereichs-Statistik;
// buildQueryContext baut daraus zusammen mit den Index-Maps den Kontext einer
// Datei für den Abfrage-Evaluator.

'use strict';

const path = require('node:path');
const { toLogicalName } = require('../../shared/subpages.js');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');
const { resolveWikiLink, filesByAlias } = require('./resolve.js');
// 4T-000952 (Epic 3E-000198): Puffer-Overlays fuer den ueberlagerten Graphen
// der Graphenansicht.
const { overlaysUnder, entryWithOverlay, overlayStand } = require('./overlay.js');
// 4T-001276 (Epic 3E-000232, Befund B1): Ziel-Pfade sind Datei-Identität.
// Diese Datei stand NICHT in der Altbestands-Liste des Wächters — sie ist beim
// Umstellen von query-sources.js aufgefallen, weil beide Seiten desselben
// Mengen-Vergleichs gleich normalisieren müssen.
const { pathCompareKey } = require('../../shared/platform.js');

// 4T-000402 (Epic 3E-000076): Link-Graph der Wurzel (ausgehende und eingehende
// Links pro Datei, als absolute Pfade). Wiki-Ziele werden wie im Backlinks-
// Pfad aufgeloest (Namens-Map, Pfad-/Unterseiten-Form, Alias-Fallback);
// Markdown-Links zaehlen nur, wenn das Ziel im Index liegt (Best-Effort-
// Grenze des Suchraums, wie dokumentiert). Lazy gebaut und via
// entry.linkGraph gecacht; jede Index-Aenderung invalidiert (applyParsedFile/
// removeFileFromIndex), damit kein O(n)-Aufbau pro Abfrage-Lauf noetig ist.
//
// 4T-000952 (Epic 3E-000198): `sicht` trennt die beiden Rollen, die `entry`
// bis dahin in einer Hand hatte. Aus der SICHT kommen die Link-QUELLEN
// (welche Datei welche Links traegt) — dort wirkt ein Puffer-Overlay. Aus dem
// EINTRAG kommt die Ziel-AUFLOESUNG (welche Datei es unter welchem Namen
// gibt) — dort wirkt es nicht, denn ein ungespeicherter Puffer legt keine
// Datei an und benennt keine um. Der Unterschied ist nicht nur fachlich:
// resolveWikiLink haengt seine Suffix-Map lazy an das uebergebene Objekt
// (ensurePathSuffixMap), und eine Sicht ist eine kurzlebige Kopie. Liefe die
// Aufloesung ueber sie, entstuende die Map bei JEDEM Aufruf neu — genau der
// Laufzeit-Einbruch, den 4T-001288 auf dem Bestand des Product Owners
// beseitigt hat (879 Pfad-Links auf 6483 Dateien).
function buildLinkGraph(entry, sicht = entry) {
  const outMap = new Map(); // absPath -> absPath[] (dedupliziert)
  const inMap = new Map(); // absPath -> absPath[] (dedupliziert)
  for (const [src, hits] of sicht.files) {
    const targets = new Map(); // lowercase -> Original-Pfad
    for (const h of hits) {
      let resolved = [];
      if (h.linkTyp === 'wiki' && h.zielBasename) {
        resolved = resolveWikiLink(entry, h.zielBasename);
        if (resolved.length === 0) resolved = filesByAlias(entry, h.zielBasename);
      } else if (h.linkTyp === 'md' && h.zielAbsolut && sicht.files.has(h.zielAbsolut)) {
        resolved = [h.zielAbsolut];
      }
      for (const t of resolved) {
        if (t !== src) targets.set(pathCompareKey(t), t);
      }
    }
    outMap.set(src, [...targets.values()]);
  }
  for (const [src, outs] of outMap) {
    for (const t of outs) {
      let arr = inMap.get(t);
      if (!arr) {
        arr = [];
        inMap.set(t, arr);
      }
      arr.push(src);
    }
  }
  return { outMap, inMap };
}

// 4T-000402 (Epic 3E-000076): Aufloesung eines FROM-Link-Ziels ([[X]] bzw.
// outgoing([[X]])) zu einer Menge absoluter Pfade (Vergleichs-
// Schluessel). Alias- und Anker-/Label-Teile werden wie beim Klick-Pfad
// abgeschnitten; pro Abfrage-Lauf memoisiert.
function createTargetResolver(entry) {
  const cache = new Map();
  return (targetText) => {
    const raw = String(targetText || '');
    if (cache.has(raw)) return cache.get(raw);
    let cleaned = raw.split('|')[0].split('#')[0].trim();
    cleaned = cleaned.replace(MD_EXT_RE, '');
    let resolved = cleaned ? resolveWikiLink(entry, cleaned) : [];
    if (resolved.length === 0 && cleaned) resolved = filesByAlias(entry, cleaned);
    const set = new Set(resolved.map((p) => pathCompareKey(p)));
    cache.set(raw, set);
    return set;
  };
}

// Logischer Anzeige-Name einer Index-Datei (Unterseiten-Notation inklusive).
function logicalNameFor(absPath) {
  return toLogicalName(path.basename(absPath).replace(MD_EXT_RE, ''));
}

// Wurzel-relativer, portabler Pfad ('/', wie die Cache-Schluessel).
function relPortable(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

// 4T-000402 (Epic 3E-000076): Kontext-Struktur einer Datei fuer den Evaluator
// (Werte-Vertrag siehe perspective-query-eval.js). linkGraph darf null sein
// (Abfrage ohne Link-Bezug); inlinks/outlinks sind dann leere Listen.
// 4T-001070 (Epic 3E-000211): `root` kommt mit in den Kontext. Grund ist der
// Pfad-Bruch des Werte-Modells: Link-Werte tragen den ABSOLUTEN Index-Pfad,
// file.path/file.folder dagegen den wurzel-relativen. Wer beide Seiten
// vergleicht (infolder, 4T-001073), braucht die Wurzel zum Relativieren;
// ohne sie liefert eine solche Funktion still die leere Liste.
function buildQueryContext(entry, root, absPath, linkGraph, now, resolveLinkTarget) {
  const stats = entry.fileStats.get(absPath) || {};
  const relPath = relPortable(root, absPath);
  const lastSlash = relPath.lastIndexOf('/');
  const toLinkRef = (p) => ({ path: p, name: logicalNameFor(p) });
  return {
    root,
    props: entry.propertiesPerFile.get(absPath) || {},
    file: {
      name: logicalNameFor(absPath),
      folder: lastSlash >= 0 ? relPath.slice(0, lastSlash) : '',
      path: relPath,
      ext: path.extname(absPath).replace(/^\./, '').toLowerCase(),
      absPath,
      size: entry.fileSizes.get(absPath) || 0,
      ctimeMs: stats.ctimeMs || 0,
      mtimeMs: stats.mtimeMs || 0,
      tags: entry.tagsPerFile.get(absPath) || [],
      aliases: entry.aliasesPerFile.get(absPath) || [],
      inlinks: linkGraph ? (linkGraph.inMap.get(absPath) || []).map(toLinkRef) : [],
      outlinks: linkGraph ? (linkGraph.outMap.get(absPath) || []).map(toLinkRef) : [],
    },
    now,
    resolveLinkTarget,
  };
}

// 4T-000952 (Epic 3E-000198, Befund E-05): Link-Graph EINSCHLIESSLICH der
// Puffer-Overlays einer Wurzel — die Grundlage der Graphenansicht, seit sie
// frisch gesetzte und entfernte Verbindungen zeigen soll.
//
// Warum ein zweiter Graph statt entry.linkGraph: Der Eintrags-Graph gehoert
// der Platte und wird von den Abfrage-Verbrauchern gelesen, die den Puffer
// bewusst NICHT im Link-Bezug sehen (siehe overlay.js). Ihn zu ueberlagern
// hiesse, deren dokumentierte Zusage still zu aendern.
//
// Warum ein Zwischenspeicher: Die Ansicht zeichnet bei jeder Overlay-Meldung
// neu, also beim Tippen alle 300 ms, und der Aufbau laeuft ueber alle Dateien
// der Wurzel.
//
// Er liegt am Index-Eintrag und nicht in einer eigenen Modul-Map, aus zwei
// Gruenden. Erstens die Invalidierung: Er wird an genau denselben drei
// Stellen genullt wie entry.linkGraph (build.js), also SYNCHRON mit der
// Index-Aenderung. Der Aenderungs-Stand aus store.js taugte dafuer nicht, weil
// er an der um 200 ms verzoegerten Invalidierungs-Meldung haengt und der Graph
// in diesem Fenster veraltet waere. Zweitens die Lebensdauer: Mit der Wurzel
// faellt der Eintrag und mit ihm der Zwischenspeicher; eine Modul-Map muesste
// der Abbau-Pfad eigens raeumen, und lifecycle.js duerfte dieses Modul dafuer
// nicht einmal laden (Zyklus ueber resolve.js).
//
// Der Overlay-Stand bleibt als zweite Haelfte des Schluessels noetig: Beim
// Tippen aendert sich die Platte gerade NICHT, der Eintrag meldet also nichts.
// Ohne Overlays gibt es nichts zu ueberlagern; dann gilt unveraendert der
// Eintrags-Graph, und der zweite entsteht gar nicht.
function graphUeberlagert(entry, root) {
  const overlays = overlaysUnder(root);
  if (!overlays) {
    if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
    return entry.linkGraph;
  }
  const stand = overlayStand();
  if (entry.linkGraphUeberlagert && entry.linkGraphUeberlagert.overlayStand === stand) {
    return entry.linkGraphUeberlagert.graph;
  }
  const graph = buildLinkGraph(entry, entryWithOverlay(entry, overlays));
  entry.linkGraphUeberlagert = { overlayStand: stand, graph };
  return graph;
}

module.exports = {
  buildLinkGraph,
  // 4T-000952: Graph mit Puffer-Overlays fuer die Graphenansicht.
  graphUeberlagert,
  createTargetResolver,
  logicalNameFor,
  buildQueryContext,
};
