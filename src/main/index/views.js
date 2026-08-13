// 4T-0977 (Epic 3E-0196): Lese-Sichten auf den Index, herausgelöst aus
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
const { parseTaskLine } = require('../../shared/tasks/task-markers.js');
const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');
const { resolveWikiLink, filesByAlias } = require('./resolve.js');
const { buildLinkGraph, logicalNameFor } = require('./link-graph.js');

// 4T-0950 (Befund E-03): Tag-Zuordnung aus einer Sicht ableiten, statt die im
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

// 4T-0056: Liefert alle Tags der Wurzel sortiert nach Haeufigkeit
// (absteigend), bei Gleichstand alphabetisch. Tag-Casing: das erste
// gesehene Casing wird beibehalten (deterministisch durch Iteration der
// tagMap-Schluessel-Reihenfolge).
function getAllTagsWithCounts(entry) {
  if (!entry || !entry.tagMap) return [];
  const out = [];
  for (const [keyLower, set] of entry.tagMap) {
    // B-16 (4T-0181): Display-Casing kommt aus der beim Indexieren
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

// 4T-0056: Liefert alle Dateien im Index, die den gegebenen Tag fuehren.
// Case-insensitive Lookup. Pfade alphabetisch sortiert fuer deterministische
// Anzeige in der Sidebar.
function filesForTag(entry, tag) {
  if (!tag) return [];
  const set = entry.tagMap.get(String(tag).trim().toLowerCase());
  if (!set) return [];
  return [...set].sort((a, b) => a.localeCompare(b));
}

// 4T-0057 (Epic 3E-0011): Autocomplete-Suggestions fuer Wiki-Link-Trigger
// `[[`. Liefert die Liste aller Datei-Basenames (ohne .md) und Aliases
// im aktiven Suchraum, je mit Hinweis-Detail (Verzeichnis bzw. Ziel-
// Datei). Renderer filtert clientseitig per Prefix und sortiert. Liefert
// alle Kandidaten ohne serverseitiges Limit; bei 2000 Dateien (Backlinks-
// Cap) bleibt die Liste handhabbar.
function wikiLinkAutocompleteSuggestions(activeFile, areaRoot) {
  if (!activeFile) return { status: 'unavailable', suggestions: [] };
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return { status: 'unavailable', suggestions: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'oversized') return { status: 'unavailable', suggestions: [] };
  if (entry.status === 'indexing') return { status: 'indexing', suggestions: [] };
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  const suggestions = [];
  const seenFiles = new Set();
  for (const f of entry.files.keys()) {
    // 4T-0337 (Epic 3E-0061): Unterseiten erscheinen in Slash-Schreibweise
    // (U+2215 im Basename -> '/'), so wie sie im Wiki-Link geschrieben werden.
    const base = toLogicalName(path.basename(f).replace(MD_EXT_RE, ''));
    const key = base.toLowerCase();
    if (seenFiles.has(key)) continue;
    seenFiles.add(key);
    suggestions.push({ name: base, kind: 'file', detail: path.dirname(f) });
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
    suggestions.push({ name: displayAlias, kind: 'alias', detail });
  }
  return { status: 'ready', suggestions };
}

// 4T-0057: Heading-/Block-Anker-Suggestions fuer Wiki-Link-Anker-Trigger
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
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };

  // 4T-0337 (Epic 3E-0061): relative Unterseiten-Formen ('[[/Name#',
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

  const seen = new Set();
  for (const candPath of candidates) {
    const meta = entry.anchorsPerFile.get(candPath);
    if (!meta) continue;
    const collection = anchorType === 'block' ? meta.blockIds : meta.headings;
    for (const a of collection) seen.add(a);
  }
  return { status: 'ready', suggestions: [...seen].sort((a, b) => a.localeCompare(b)) };
}

// 4T-0057: Tag-Autocomplete-Suggestions fuer den `#`-Trigger ausserhalb
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
  // W-07 (4T-0309): Fehler-Status wie unavailable behandeln — nicht den
  // eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'error') return { status: 'unavailable', suggestions: [] };
  return { status: 'ready', suggestions: getAllTagsWithCounts(entry) };
}

// 4T-0056: High-level-API fuer Renderer. Liefert Tag-Liste mit Counts
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
  // B-21 (4T-0187): Fehler-Status durchreichen.
  if (entry.status === 'error') {
    return { status: 'error', meta: { wurzel: root } };
  }
  // 4T-0950 (Befund E-03): Puffer-Overlay freigeschaltet. Ein gerade
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

// 4T-0453 (Epic 3E-0084): Graph-Daten der Graphenansicht — alle Markdown-
// Knoten des Suchraums plus gerichtete Link-Kanten aus dem Link-Graph-Cache
// (buildLinkGraph, 4T-0402). Read-only-View wie tagsFor: Status wird
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
  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const nodes = [];
  for (const absPath of entry.files.keys()) {
    nodes.push({ path: absPath, name: logicalNameFor(absPath) });
  }
  const edges = [];
  for (const [src, outs] of entry.linkGraph.outMap) {
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

// 4T-0525 (Epic 3E-0095): Roh-Task-Zeilen eines Bereichs fuer den
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
  // 4T-0951 (Befund E-06): Puffer-Overlay freigeschaltet. Eine gerade
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

// 4T-0619 (Epic 3E-0117): Index-Anteil der Bereichs-Statistik — alle
// Kennzahlen, die der Index ohnehin fuehrt. Read-only-View wie graphFor:
// Status wird durchgereicht, kein eigener Scan, kein ensureIndex. Den
// Index-fremden Anteil (Nicht-Markdown, Ordner, Begleitdateien) erhebt
// src/main/area/area-stats.js und fuehrt beide Anteile zusammen.
//
// env.statusTypeOf ist der Status-Typ-Aufloeser der Aufgaben-Zustaende
// (createTaskStatusTypeResolver in main.js); ohne ihn gelten allein die
// festen Basis-Zeichen ' ' = offen und 'x'/'X' = erledigt.
function statsFor(areaRoot, env) {
  let root;
  try {
    root = areaRoot ? path.resolve(areaRoot) : null;
  } catch {
    root = null;
  }
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'indexing') return { status: 'indexing', wurzel: root };
  if (entry.status === 'oversized') return { status: 'oversized', wurzel: root };
  if (entry.status === 'error') return { status: 'error', wurzel: root };

  // Haeufigkeiten: je Tag bzw. je Eigenschafts-Schluessel die Anzahl DATEIEN.
  // Fundstellen zaehlt der Index nicht (er fuehrt Zuordnungen, keine Treffer-
  // Listen); die Seite spricht deshalb durchgehend von Dateien.
  const tags = [];
  for (const [tag, dateien] of entry.tagMap) tags.push({ name: tag, dateien: dateien.size });
  const eigenschaftsZaehler = new Map();
  for (const props of entry.propertiesPerFile.values()) {
    for (const schluessel of Object.keys(props || {})) {
      eigenschaftsZaehler.set(schluessel, (eigenschaftsZaehler.get(schluessel) || 0) + 1);
    }
  }
  const eigenschaften = [...eigenschaftsZaehler].map(([name, dateien]) => ({ name, dateien }));
  sortiereHaeufigkeit(tags);
  sortiereHaeufigkeit(eigenschaften);

  // Aufgaben nach Zustand. Die drei Kategorien sind vollstaendig und
  // ueberschneidungsfrei: NON_TASK zaehlt gar nicht, DONE und CANCELLED
  // haben ihre eigene Kategorie, alles Uebrige gilt als offen — auch ein
  // Zeichen ohne Status-Semantik, das ist eine Checkbox ohne Haken.
  const statusTypeOf =
    env && typeof env.statusTypeOf === 'function' ? env.statusTypeOf : () => null;
  const aufgaben = { gesamt: 0, offen: 0, erledigt: 0, abgebrochen: 0 };
  for (const taskLines of entry.tasksPerFile.values()) {
    for (const tl of taskLines) {
      const model = parseTaskLine(tl.text);
      if (!model) continue;
      const typ = statusTypeOf(model.statusChar);
      if (typ === 'NON_TASK') continue;
      aufgaben.gesamt += 1;
      if (typ === 'DONE') aufgaben.erledigt += 1;
      else if (typ === 'CANCELLED') aufgaben.abgebrochen += 1;
      else aufgaben.offen += 1;
    }
  }

  // Roh-Zahlen der ausgehenden Verweise, getrennt nach Link-Art.
  let wikiVerweise = 0;
  let mdVerweise = 0;
  for (const treffer of entry.files.values()) {
    for (const h of treffer) {
      if (h.linkTyp === 'wiki') wikiVerweise += 1;
      else if (h.linkTyp === 'md') mdVerweise += 1;
    }
  }

  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const { inMap } = entry.linkGraph;
  let ohneEingehende = 0;
  const eingehendJeDatei = [];
  for (const absPath of entry.files.keys()) {
    const anzahl = (inMap.get(absPath) || []).length;
    if (anzahl === 0) ohneEingehende += 1;
    eingehendJeDatei.push({ ...dateiKopf(absPath), eingehend: anzahl });
  }

  const groesste = [];
  const juengste = [];
  for (const absPath of entry.files.keys()) {
    groesste.push({ ...dateiKopf(absPath), bytes: entry.fileSizes.get(absPath) || 0 });
    const stat = entry.fileStats.get(absPath);
    juengste.push({ ...dateiKopf(absPath), mtimeMs: (stat && stat.mtimeMs) || 0 });
  }
  groesste.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  juengste.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  eingehendJeDatei.sort((a, b) => b.eingehend - a.eingehend || a.name.localeCompare(b.name));

  return {
    status: 'ready',
    wurzel: root,
    markdown: { anzahl: entry.fileCount, bytes: entry.byteSize },
    dateiPfade: [...entry.files.keys()],
    tags,
    eigenschaften,
    aliase: entry.aliasMap.size,
    aufgaben,
    verweise: { wiki: wikiVerweise, markdown: mdVerweise, ohneEingehende },
    auffaelligkeiten: {
      groesste: groesste.slice(0, TOP_N),
      juengste: juengste.slice(0, TOP_N),
      meistverlinkt: eingehendJeDatei.filter((e) => e.eingehend > 0).slice(0, TOP_N),
    },
    uebersprungeneOrdner: entry.skippedDirs || 0,
  };
}

// 4T-0619: Laenge der Top-Listen der Auffaelligkeiten.
const TOP_N = 10;

// Absteigend nach Anzahl, bei Gleichstand alphabetisch — deterministische
// Ordnung, damit wiederholte Aufrufe dieselbe Liste liefern.
function sortiereHaeufigkeit(liste) {
  liste.sort((a, b) => b.dateien - a.dateien || a.name.localeCompare(b.name));
}

// Anzeige-Kopf einer Datei fuer die Top-Listen: voller Pfad (Klick-Ziel und
// Tooltip) plus logischer Name (Anzeige, U+2215-Form der Unterseiten).
function dateiKopf(absPath) {
  return { pfad: absPath, name: logicalNameFor(absPath) };
}

module.exports = {
  wikiLinkAutocompleteSuggestions,
  anchorAutocompleteSuggestions,
  tagAutocompleteSuggestions,
  tagsFor,
  graphFor,
  areaTaskLines,
  statsFor,
};
