// 4T-000977 (Epic 3E-000196): Lese-Sichten auf den Index, herausgelöst aus
// src/main/backlinks.js. Reine Read-only-Views ohne eigenen Scan: Status wird
// durchgereicht, kein ensureIndex. Hier wohnen die Autocomplete-Suggestions
// (Wiki-Link, Anker, Tag), das Tag-System (tagsFor samt Zähl- und
// Filter-Helfern), die Graph-Daten der Graphenansicht (graphFor), die
// Roh-Task-Zeilen des Erinnerungs-Prüfers (areaTaskLines) und der
// Index-Anteil der Bereichs-Statistik (statsFor).

'use strict';

const path = require('node:path');
const {
  toLogicalName,
  expandRelativeTarget,
  isRelativeTarget,
} = require('../../shared/subpages.js');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');
// 4T-001748 (Epic 3E-000289): Der geteilte Satz der Bild-Endungen — dieselbe
// Quelle, aus der die Anlagen-Mechanik, die Einbettung und der Canvas-Kern
// lesen. Eine eigene Liste hier waere die fuenfte Kopie desselben Satzes.
const { istBildDatei } = require('../../shared/bild-endungen.js');
const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');
const { resolveWikiLink, filesByAlias } = require('./resolve.js');
// 4T-000952 (Epic 3E-000198): graphUeberlagert ist der Link-Graph MIT den
// Puffer-Overlays; den Platten-Graphen baut die Bereichs-Statistik in
// views-stats.js mit buildLinkGraph.
const { graphUeberlagert, logicalNameFor } = require('./link-graph.js');
// 4T-001466: statsFor lebt seit dem Rebase auf 1.129.1 in views-stats.js
// (Datei-Groessen-Budget); der Re-Export haelt jeden Aufrufer unveraendert.
const { statsFor } = require('./views-stats.js');

// 4T-000950 (Befund E-03): Tag-Zuordnung aus einer Sicht ableiten, statt die im
// Index gepflegten Umkehr-Abbildungen zu lesen.
//
// Hintergrund: tagMap und tagDisplay bilden Tag -> Dateien ab und werden beim
// Indexieren fortgeschrieben. Die Puffer-Overlay-Schicht kann sie nicht
// mitpatchen, weil sie je Datei arbeitet und ein Overlay einen Tag auch
// ENTFERNEN kann — dafür müsste sie den Beitrag der Datei aus einer geteilten
// Menge herausrechnen. Diese Ableitung baut beide Abbildungen stattdessen aus
// tagsPerFile neu auf, das die Overlay-Sicht führt.
//
// Die Regeln des Index bleiben dabei erhalten: Schlüssel ist die getrimmte
// Kleinschreibung, und als Anzeige gilt das zuerst gesehene Casing.
function tagMapsAusSicht(sicht) {
  const tagMap = new Map();
  const tagDisplay = new Map();
  for (const [filePath, tags] of sicht.tagsPerFile) {
    for (const t of tags || []) {
      const key = String(t || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      let set = tagMap.get(key);
      if (!set) {
        set = new Set();
        tagMap.set(key, set);
      }
      set.add(filePath);
      if (!tagDisplay.has(key)) tagDisplay.set(key, String(t).trim());
    }
  }
  return { tagMap, tagDisplay };
}

// 4T-000056: Liefert alle Tags der Wurzel sortiert nach Haeufigkeit
// (absteigend), bei Gleichstand alphabetisch. Tag-Casing: das erste
// gesehene Casing wird beibehalten (deterministisch durch Iteration der
// tagMap-Schluessel-Reihenfolge).
function getAllTagsWithCounts(entry) {
  if (!entry || !entry.tagMap) return [];
  const out = [];
  for (const [keyLower, set] of entry.tagMap) {
    // B-16 (4T-000181): Display-Casing kommt aus der beim Indexieren
    // gepflegten Map statt aus einer linearen Suche pro Tag.
    const displayTag = entry.tagDisplay.get(keyLower) || keyLower;
    out.push({ tag: displayTag, count: set.size });
  }
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tag.localeCompare(b.tag);
  });
  return out;
}

// 4T-000056: Liefert alle Dateien im Index, die den gegebenen Tag fuehren.
// Case-insensitive Lookup. Pfade alphabetisch sortiert fuer deterministische
// Anzeige in der Sidebar.
function filesForTag(entry, tag) {
  if (!tag) return [];
  const set = entry.tagMap.get(String(tag).trim().toLowerCase());
  if (!set) return [];
  return [...set].sort((a, b) => a.localeCompare(b));
}

// 4T-000057 (Epic 3E-000011): Autocomplete-Suggestions fuer Wiki-Link-Trigger
// `[[`. Liefert die Liste aller Datei-Basenames (ohne .md) und Aliases
// im aktiven Suchraum, je mit Hinweis-Detail (Verzeichnis bzw. Ziel-
// Datei). Renderer filtert clientseitig per Prefix und sortiert. Liefert
// alle Kandidaten ohne serverseitiges Limit; bei 2000 Dateien (Backlinks-
// Cap) bleibt die Liste handhabbar.
function wikiLinkAutocompleteSuggestions(activeFile, areaRoot) {
  // 4T-001514 (Epic 3E-000174): Ohne aktive Datei, aber mit geoeffnetem Bereich
  // traegt der Bereich den Namensraum — das schnelle Datei-Oeffnen fragt genau
  // in dieser Lage. Fuer die Vervollstaendigung nach `[[` aendert sich nichts,
  // sie laeuft nur in einem Editor und hat damit immer eine Datei.
  if (!activeFile && !areaRoot) return { status: 'unavailable', suggestions: [] };
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-000309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  // 4T-001307 (Epic 3E-000235): Jeder Vorschlag traegt zusaetzlich die
  // Aenderungszeit seiner Datei, damit der Renderer die zuletzt bearbeiteten
  // Dateien zuerst anbieten kann. Die Zeit liegt im Index ohnehin vor
  // (fileStats, gefuellt beim Scan); eine eigene Datei-Abfrage entsteht nicht.
  // Fehlt der Eintrag, gilt 0 und der Vorschlag sortiert wie der aelteste.
  const mtimeVon = (absPath) => (entry.fileStats.get(absPath) || {}).mtimeMs || 0;

  const suggestions = [];
  const seenFiles = new Set();
  for (const f of entry.files.keys()) {
    // 4T-000337 (Epic 3E-000061): Unterseiten erscheinen in Slash-Schreibweise
    // (U+2215 im Basename -> '/'), so wie sie im Wiki-Link geschrieben werden.
    const base = toLogicalName(path.basename(f).replace(MD_EXT_RE, ''));
    const key = base.toLowerCase();
    if (seenFiles.has(key)) continue;
    seenFiles.add(key);
    suggestions.push({ name: base, kind: 'file', detail: path.dirname(f), mtimeMs: mtimeVon(f) });
  }
  for (const [aliasLower, fileSet] of entry.aliasMap) {
    let displayAlias = aliasLower;
    for (const filePath of fileSet) {
      const fileAliases = entry.aliasesPerFile.get(filePath) || [];
      const found = fileAliases.find((a) => String(a).toLowerCase() === aliasLower);
      if (found) {
        displayAlias = found;
        break;
      }
    }
    const firstFile = [...fileSet][0];
    const detail = firstFile ? toLogicalName(path.basename(firstFile).replace(MD_EXT_RE, '')) : '';
    // 4T-001307: Ein Zweitname erbt die Aenderungszeit der Datei, auf die er
    // zeigt; er hat keine eigene. Bei mehreren Dateien gilt dieselbe Datei,
    // aus der auch das Detail stammt, damit Anzeige und Sortierung zusammen
    // gehoeren.
    suggestions.push({
      name: displayAlias,
      kind: 'alias',
      detail,
      mtimeMs: firstFile ? mtimeVon(firstFile) : 0,
    });
  }
  return { status: 'ready', suggestions };
}

// 4T-001748 (Epic 3E-000289): Vorschlaege fuer das Bild-Feld der Canvas-Karte —
// die Namen der BILD-Dateien im aktiven Suchraum.
//
// **Warum eine eigene Sicht neben wikiLinkAutocompleteSuggestions.** Jene baut
// ihre Liste aus entry.files (Markdown) und entry.aliasMap (Zweitnamen); Bilder
// stehen in keinem von beiden. Sie liegen in entry.assetNameMap, der schlanken
// Namens-Zuordnung der Nicht-Markdown-Dateien (4T-001494) — und genau die wird
// hier gelesen. Eine Erweiterung der Wiki-Sicht kam nicht in Frage: Sie speist
// die Vervollstaendigung nach '[[', und dort waere ein Bild-Name ein Vorschlag
// auf ein Ziel, das die Wiki-Aufloesung bewusst erst an zweiter Stelle kennt.
//
// **Gelesen werden die PFADE, nicht die Schluessel.** Die Schluessel der
// Zuordnung sind normalisiert und kleingeschrieben, und je Datei stehen zwei
// davon darin (mit und ohne Endung). Der Vorschlag soll aber der Dateiname sein,
// wie er geschrieben ist und wie die Bild-Angabe ihn braucht — mit Endung, in
// seiner eigenen Schreibweise.
//
// **Ohne serverseitigen Praefix-Filter und ohne Aenderungszeit**, beides wie
// nebenan begruendet: Die Anzeige filtert selbst (bei der Canvas-Leiste die
// datalist des Browsers), und entry.fileStats fuehrt allein Markdown-Dateien —
// ein Feld mtimeMs waere hier fuer jeden Vorschlag 0 und damit eine Angabe, die
// nichts sagt.
//
// Status-Semantik, Suchraum und Bereichs-Grenze sind woertlich die der
// Wiki-Sicht; ein zweites Regelwerk dafuer waere ein zweiter Ort, an dem sie
// auseinanderlaufen.
function bildAutocompleteSuggestions(activeFile, areaRoot) {
  if (!activeFile && !areaRoot) return { status: 'unavailable', suggestions: [] };
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  const suggestions = [];
  const gesehen = new Set();
  for (const set of entry.assetNameMap ? entry.assetNameMap.values() : []) {
    for (const f of set) {
      if (gesehen.has(f)) continue;
      gesehen.add(f);
      const name = path.basename(f);
      // Die Endungs-Regel ist die der Anlagen-Mechanik (BILD_ENDUNGEN); die
      // Zuordnung selbst fuehrt JEDE Nicht-Markdown-Datei, auch PDF und
      // Tabellen, und die gehoeren nicht in ein Bild-Feld.
      if (!istBildDatei(name)) continue;
      suggestions.push({ name, kind: 'image', detail: path.dirname(f) });
    }
  }
  return { status: 'ready', suggestions };
}

// 4T-000057: Heading-/Block-Anker-Suggestions fuer Wiki-Link-Anker-Trigger
// `[[Datei#` bzw. `[[Datei#^`. Loest den Basename ueber Datei-Namen und
// Aliases auf und sammelt die Union aller Anker der gefundenen Datei(en).
function anchorAutocompleteSuggestions(activeFile, basename, anchorType, areaRoot) {
  if (!activeFile || !basename) return { status: 'unavailable', suggestions: [] };
  if (anchorType !== 'heading' && anchorType !== 'block') {
    return { status: 'unavailable', suggestions: [] };
  }
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-000309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  // 4T-000337 (Epic 3E-000061): relative Unterseiten-Formen ('[[/Name#',
  // '[[..#') gegen die aktive Datei expandieren, damit auch dort Anker
  // vorgeschlagen werden.
  let lookupName = basename;
  if (isRelativeTarget(basename)) {
    const ownBase = path.basename(path.resolve(activeFile)).replace(MD_EXT_RE, '');
    const expanded = expandRelativeTarget(ownBase, basename);
    if (!expanded) return { status: 'ready', suggestions: [] };
    lookupName = expanded;
  }

  let candidates = resolveWikiLink(entry, lookupName);
  if (candidates.length === 0) {
    candidates = filesByAlias(entry, lookupName);
  }
  if (candidates.length === 0) return { status: 'ready', suggestions: [] };

  // 4T-000952 (Epic 3E-000198, Befund E-08): Puffer-Overlay freigeschaltet. Die
  // KANDIDATEN sucht weiter der Eintrag (welche Datei heisst so — daran aendert
  // ein ungespeicherter Puffer nichts, und die Aufloesung haengt an Caches des
  // Eintrags); die ANKER kommen aus der Sicht, denn eine soeben getippte
  // Ueberschrift steht nur dort.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const seen = new Set();
  for (const candPath of candidates) {
    const meta = sicht.anchorsPerFile.get(candPath);
    if (!meta) continue;
    const collection = anchorType === 'block' ? meta.blockIds : meta.headings;
    for (const a of collection) seen.add(a);
  }
  return { status: 'ready', suggestions: [...seen].sort((a, b) => a.localeCompare(b)) };
}

// 4T-000057: Tag-Autocomplete-Suggestions fuer den `#`-Trigger ausserhalb
// von Wiki-Link-Kontexten. Nutzt direkt getAllTagsWithCounts; sortiert
// also nach Haeufigkeit (absteigend) und alphabetisch.
function tagAutocompleteSuggestions(activeFile, areaRoot) {
  if (!activeFile) return { status: 'unavailable', suggestions: [] };
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-000309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };
  // 4T-000952 (Epic 3E-000198, Befund E-08): Puffer-Overlay freigeschaltet —
  // derselbe Weg wie beim Tag-Panel (tagsFor), damit ein soeben getippter Tag
  // sich auch vorschlagen laesst und nicht nur in der Seitenleiste steht. Ohne
  // Overlays bleibt es bei den im Index gepflegten Abbildungen.
  const overlays = overlaysUnder(root);
  const maps = overlays ? tagMapsAusSicht(entryWithOverlay(entry, overlays)) : entry;
  return { status: 'ready', suggestions: getAllTagsWithCounts(maps) };
}

// 4T-000056: High-level-API fuer Renderer. Liefert Tag-Liste mit Counts
// und ggf. Datei-Liste fuer einen ausgewaehlten Filter-Tag. Pattern
// analog zu backlinksFor: kein ensureIndex-Aufruf, nutzt nur vorhandenen
// Index.
function tagsFor(filePath, filterTag, areaRoot) {
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
  if (entry.status === 'indexing') {
    return { status: 'indexing', meta: { wurzel: root } };
  }
  // B-21 (4T-000187): Fehler-Status durchreichen.
  if (entry.status === 'error') {
    return { status: 'error', meta: { wurzel: root } };
  }
  // 4T-000950 (Befund E-03): Puffer-Overlay freigeschaltet. Ein gerade
  // getippter Tag erscheint damit in der Liste, ein gerade gelöschter
  // verschwindet, ohne dass gespeichert werden muss.
  const overlays = overlaysUnder(root);
  // Ohne Overlay bleibt es bei den im Index gepflegten Abbildungen; das ist
  // der häufige Fall und spart den Neuaufbau. (overlaysUnder liefert null,
  // wenn es nichts zu überlagern gibt.)
  const maps = overlays ? tagMapsAusSicht(entryWithOverlay(entry, overlays)) : entry;
  const tags = getAllTagsWithCounts(maps);
  const result = {
    status: 'ready',
    meta: { wurzel: root, fileCount: entry.fileCount, skippedDirs: entry.skippedDirs || 0 },
    tags,
  };
  if (filterTag) {
    result.filterTag = filterTag;
    result.files = filesForTag(maps, filterTag);
  }
  return result;
}

// 4T-000453 (Epic 3E-000084): Graph-Daten der Graphenansicht — alle Markdown-
// Knoten des Suchraums plus gerichtete Link-Kanten aus dem Link-Graph-Cache
// (buildLinkGraph, 4T-000402). Read-only-View wie tagsFor: Status wird
// durchgereicht, kein eigener Scan. Der Bereichs-Graph-Tab fragt ohne aktive
// Datei an (filePath null, areaRoot gesetzt); das Datei-Graph-Panel liefert
// die aktive Datei mit. Außerhalb eines Bereichs arbeitet die Ansicht über
// den Best-Effort-Suchraum der Ordner-Wurzel (Epic-Architekturentscheidung 4);
// meta.isArea kennzeichnet das Ergebnis für den Hinweis der Ansicht.
function graphFor(filePath, areaRoot) {
  let root;
  if (areaRoot && !filePath) {
    // Bereichs-Fall ohne aktive Datei: die Bereichs-Wurzel ist der Suchraum.
    try {
      root = path.resolve(areaRoot);
    } catch {
      root = null;
    }
  } else {
    root = resolveRootInfo(filePath, areaRoot).root;
  }
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
  // 4T-000952 (Epic 3E-000198, Befund E-05): Puffer-Overlay freigeschaltet.
  // Frisch gesetzte und entfernte Verbindungen erscheinen damit im Graphen,
  // ohne dass gespeichert werden muss. Anders als bei den uebrigen Sichten
  // genuegt hier die Overlay-Sicht auf die Index-Maps NICHT: Der Graph ist
  // eine eigene, gecachte Ableitung ueber alle Dateien, und die Kanten sind
  // genau das, was die Ansicht zeigt. graphUeberlagert baut ihn dafuer ueber
  // der Sicht auf, mit eigenem Zwischenspeicher; entry.linkGraph bleibt der
  // Graph der Platte fuer die Abfrage-Verbraucher (Begruendung link-graph.js).
  const linkGraph = graphUeberlagert(entry, root);
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const nodes = [];
  for (const absPath of sicht.files.keys()) {
    nodes.push({ path: absPath, name: logicalNameFor(absPath) });
  }
  const edges = [];
  for (const [src, outs] of linkGraph.outMap) {
    for (const target of outs) edges.push({ from: src, to: target });
  }
  return {
    status: 'ready',
    meta: {
      wurzel: root,
      isArea: !!entry.isArea,
      fileCount: entry.fileCount,
      skippedDirs: entry.skippedDirs || 0,
    },
    nodes,
    edges,
  };
}

// 4T-000525 (Epic 3E-000095): Roh-Task-Zeilen eines Bereichs fuer den
// Erinnerungs-Pruefer — schlanker Lese-Pfad auf tasksPerFile ohne
// Query-Auswertung (die Anker stecken in den Roh-Zeilen, es gibt keine
// zusaetzlichen Index-Felder und damit keinen Cache-Schema-Bump).
// Rueckgabe null, solange der Index fehlt oder nicht bereit ist — der
// Aufrufer unterscheidet "noch nicht bereit" von "keine Treffer".
function areaTaskLines(rootPath) {
  if (!rootPath) return null;
  const root = path.resolve(rootPath);
  const entry = indexes.get(root);
  if (!entry || entry.status !== 'ready') return null;
  // 4T-000951 (Befund E-06): Puffer-Overlay freigeschaltet. Eine gerade
  // getippte Erinnerung wird damit fällig, eine gerade gelöschte meldet sich
  // nicht mehr — ohne dass gespeichert werden muss. Das wiegt schwerer als
  // seine Häufigkeit, weil eine ausbleibende Erinnerung nicht auffällt.
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const out = [];
  for (const [absPath, taskLines] of sicht.tasksPerFile) {
    for (const tl of taskLines) {
      out.push({ path: absPath, zeile: tl.zeile, text: tl.text });
    }
  }
  return out;
}

module.exports = {
  wikiLinkAutocompleteSuggestions,
  bildAutocompleteSuggestions,
  anchorAutocompleteSuggestions,
  tagAutocompleteSuggestions,
  tagsFor,
  graphFor,
  areaTaskLines,
  statsFor,
};
