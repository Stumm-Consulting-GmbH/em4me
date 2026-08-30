// 4T-0977 (Epic 3E-0196): Index-Aufbau und -Pflege, herausgelöst aus
// src/main/backlinks.js. Dieses Modul schreibt die Index-Maps eines Eintrags:
// asynchroner Initial-Aufbau samt chokidar-Watcher (buildIndexAsync), das
// Ein- und Austragen einzelner Dateien (applyParsedFile, removeFileFromIndex)
// mit der Pflege der inversen Namens-, Alias- und Tag-Maps sowie der
// Watcher-Pfad (onWatcherChange, markOversized). Mutierende Funktionen auf
// Entry-Objekten bleiben hier bei ihren Schreibern; Lese-Sichten liegen in
// resolve.js, views.js und den Query-Modulen.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const chokidar = require('chokidar');
const { MD_EXT_RE, normalizeNameKey } = require('../../shared/markdown/link-scan.js');
const { MDDA_CACHE_FILENAME } = require('../documents/mdd-store.js');
const { indexes, broadcast, scheduleInvalidate } = require('./store.js');
const {
  SCAN_DEPTH,
  MAX_FILES,
  MAX_BYTES,
  BUILD_BATCH_SIZE,
  isIgnoredDirName,
  collectMarkdownFiles,
} = require('./scan.js');
const { parseFile, parseFileAsync } = require('./parse.js');
const { readBlockDataAsync, readBlockDataSync } = require('./block-data.js');
const { cacheRelPath, loadAreaCache, scheduleCacheWrite } = require('./cache.js');

// B-21 (4T-0187): Wartezeit nach einem Watcher-Fehler, bevor ein neuer
// Bedarf den Index wieder aufbauen darf.
const WATCHER_ERROR_BACKOFF_MS = 30 * 1000;

// B-14 (4T-0181): asynchroner Initial-Aufbau mit Batch-Yielding. Bricht
// still ab, wenn der Eintrag zwischenzeitlich abgebaut wurde (Teardown
// waehrend des Aufbaus).
async function buildIndexAsync(rootPath, entry) {
  const stillCurrent = () => indexes.get(rootPath) === entry;

  const scan = await collectMarkdownFiles(rootPath, entry.isArea);
  if (!stillCurrent()) return;
  entry.fileCount = scan.fileCount;
  entry.byteSize = scan.byteSize;
  // B-22 (4T-0187): Anzahl unlesbarer Ordner fuer den Panel-Hinweis.
  entry.skippedDirs = scan.skippedDirs || 0;
  if (scan.oversized) {
    entry.status = 'oversized';
    broadcast('backlinks:invalidated', { wurzel: rootPath });
    return;
  }

  // 4T-0348 (Epic 3E-0062): Warmstart-Abgleich fuer Bereichs-Wurzeln. Die
  // Cache-Datei liefert das Parse-Ergebnis unveraenderter Dateien (mtime+size
  // stimmen ueberein); nur geaenderte oder neue Dateien werden gelesen/geparst.
  let cache = null;
  if (entry.isArea) {
    entry.cachePath = path.join(rootPath, MDDA_CACHE_FILENAME);
    cache = await loadAreaCache(entry.cachePath, rootPath);
    if (!stillCurrent()) return;
  }

  // Initial-Parse aller Dateien (Batch-Yield alle BUILD_BATCH_SIZE).
  let sinceYield = 0;
  for (const f of scan.files) {
    const size = scan.sizes.get(f) || 0;
    const mtimeMs = scan.mtimes.get(f) || 0;
    let parsed = null;
    let hash = '';
    if (cache) {
      const cached = cache.get(cacheRelPath(f, rootPath));
      if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
        parsed = cached.parsed;
        hash = cached.hash;
      }
    }
    if (!parsed) {
      const res = await parseFileAsync(f);
      if (!stillCurrent()) return;
      if (res) {
        parsed = res;
        hash = res.hash || '';
      }
    }
    entry.fileSizes.set(f, size);
    // 4T-0402 (Epic 3E-0076): Datei-Zeiten fuer file.ctime/file.mtime.
    entry.fileStats.set(f, { ctimeMs: scan.ctimes.get(f) || 0, mtimeMs });
    if (parsed) applyParsedFile(entry, f, parsed);
    if (entry.isArea) entry.cacheFiles.set(f, { mtimeMs, size, hash });
    // 4T-0408 (Epic 3E-0077): Block-Daten der .mdd mitlesen — auch bei Cache-
    // Treffern, denn die blockData-Sektion ist bewusst nicht Teil des Caches
    // (Begruendung am Block-Daten-Abschnitt in parse.js).
    const blocks = await readBlockDataAsync(f);
    if (!stillCurrent()) return;
    if (blocks) entry.blockDataPerFile.set(f, blocks);
    if (++sinceYield >= BUILD_BATCH_SIZE) {
      sinceYield = 0;
      await new Promise((resolve) => setImmediate(resolve));
      if (!stillCurrent()) return;
    }
  }
  entry.status = 'ready';

  // Watcher starten. ignoreInitial: true, weil wir gerade selbst geparst
  // haben. Markdown-Filter via ignored-Funktion.
  entry.watcher = chokidar.watch(rootPath, {
    // 4T-0347 (Epic 3E-0062): Bereichs-Wurzeln ohne Tiefen-Grenze (chokidar
    // depth: undefined = unbegrenzt).
    depth: entry.isArea ? undefined : SCAN_DEPTH,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    // B-12 (4T-0175): Symlink-/Junction-Verzeichnissen nicht folgen — der
    // Initial-Scan (readdir mit Dirents) folgt ihnen auch nicht.
    followSymlinks: false,
    ignored: (p) => {
      // B-03 (4T-0175): gleiche Ignore-Regel wie der Initial-Scan
      // (node_modules und alle Punkt-Ordner, nicht nur .git*).
      const base = path.basename(p);
      try {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) return isIgnoredDirName(base);
      } catch {
        return false;
      }
      if (isIgnoredDirName(base)) return true;
      return !MD_EXT_RE.test(base);
    },
  });
  entry.watcher.on('add', (p) => onWatcherChange(entry, p, 'add'));
  entry.watcher.on('change', (p) => onWatcherChange(entry, p, 'change'));
  entry.watcher.on('unlink', (p) => onWatcherChange(entry, p, 'unlink'));
  entry.watcher.on('error', (err) => {
    // B-21 (4T-0187): Fehler-Status mit Backoff statt Force-Teardown mit
    // Sofort-Rebuild — ein dauerhaft kaputter Watcher (z.B. geloeschtes
    // Netzlaufwerk) loeste sonst eine Scan-Schleife aus. Die Panels
    // zeigen den 'error'-Status; nach Ablauf des Backoffs baut der
    // naechste Bedarf neu auf (ensureIndex).
    console.warn('Backlinks-Watcher-Fehler:', rootPath, err && err.message);
    try {
      if (entry.watcher) entry.watcher.close();
    } catch {
      /* ignore */
    }
    entry.watcher = null;
    entry.status = 'error';
    entry.errorUntil = Date.now() + WATCHER_ERROR_BACKOFF_MS;
    broadcast('backlinks:invalidated', { wurzel: rootPath });
  });

  // 4T-0348 (Epic 3E-0062): den nach dem Warmstart aktualisierten Stand (neue,
  // geaenderte oder entfernte Dateien) persistieren. Debounced, damit schnelle
  // Re-Opens nicht mehrfach schreiben.
  if (entry.isArea) scheduleCacheWrite(entry);

  // Fertig-Meldung: Konsumenten (Panel, Tags, Autocomplete, Linter) fragen
  // daraufhin neu an und sehen den 'ready'-Stand.
  broadcast('backlinks:invalidated', { wurzel: rootPath });
}

// Gemeinsames Eintragen eines Parse-Ergebnisses in alle Index-Maps
// (Initial-Aufbau und Watcher-Add/-Change nutzen denselben Pfad).
function applyParsedFile(entry, filePath, parsed) {
  entry.files.set(filePath, parsed.hits);
  addToNameMap(entry, filePath);
  if (parsed.aliases.length > 0) {
    entry.aliasesPerFile.set(filePath, parsed.aliases);
    addToAliasMap(entry, filePath, parsed.aliases);
  }
  // 4T-0054: Headings und Block-IDs pro Datei speichern.
  if (parsed.headings.length > 0 || parsed.blockIds.length > 0) {
    entry.anchorsPerFile.set(filePath, {
      headings: new Set(parsed.headings),
      blockIds: new Set(parsed.blockIds),
    });
  }
  // 4T-0056: Tags pro Datei speichern und in die inverse Map eintragen.
  if (parsed.tags && parsed.tags.length > 0) {
    entry.tagsPerFile.set(filePath, parsed.tags);
    addToTagMap(entry, filePath, parsed.tags);
  }
  // 4T-0354 (Epic 3E-0065): abfragbare Frontmatter-Properties pro Datei ablegen.
  if (parsed.properties && Object.keys(parsed.properties).length > 0) {
    entry.propertiesPerFile.set(filePath, parsed.properties);
  }
  // 4T-0502 (Epic 3E-0096): Task-Zeilen pro Datei ablegen.
  if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
    entry.tasksPerFile.set(filePath, parsed.tasks);
  }
  // 4T-0402 (Epic 3E-0076): geaenderte Links machen den Link-Graphen ungueltig.
  entry.linkGraph = null;
}

// B-15 (4T-0181): Pflege der inversen Namens-Map.
function nameKeyForFile(filePath) {
  return normalizeNameKey(path.basename(filePath).replace(MD_EXT_RE, ''));
}

function addToNameMap(entry, filePath) {
  // 4T-1288: Die Pfad-Menge aendert sich — die lazy gebaute Suffix-Map der
  // Pfad-Form (resolve.js) ist damit ungueltig und wird beim naechsten
  // Pfad-Resolve neu gebaut. Invalidieren statt mitpflegen, weil ein
  // Rebuild einmal O(Dateien) kostet und die Aenderungs-Momente (Anlegen,
  // Loeschen, Umbenennen) selten gegen die Resolve-Momente sind.
  entry.pathSuffixMap = null;
  const key = nameKeyForFile(filePath);
  if (!key) return;
  let set = entry.nameMap.get(key);
  if (!set) {
    set = new Set();
    entry.nameMap.set(key, set);
  }
  set.add(filePath);
}

function removeFromNameMap(entry, filePath) {
  // 4T-1288: siehe addToNameMap.
  entry.pathSuffixMap = null;
  const key = nameKeyForFile(filePath);
  const set = entry.nameMap.get(key);
  if (!set) return;
  set.delete(filePath);
  if (set.size === 0) entry.nameMap.delete(key);
}

// Entfernt eine Datei vollstaendig aus allen Index-Maps.
function removeFileFromIndex(entry, filePath) {
  entry.files.delete(filePath);
  removeFromNameMap(entry, filePath);
  const prevAliases = entry.aliasesPerFile.get(filePath);
  if (prevAliases) {
    removeFromAliasMap(entry, filePath, prevAliases);
    entry.aliasesPerFile.delete(filePath);
  }
  entry.anchorsPerFile.delete(filePath);
  const prevTags = entry.tagsPerFile.get(filePath);
  if (prevTags) {
    removeFromTagMap(entry, filePath, prevTags);
    entry.tagsPerFile.delete(filePath);
  }
  // 4T-0354 (Epic 3E-0065): Properties-Eintrag der Datei mit entfernen.
  entry.propertiesPerFile.delete(filePath);
  // 4T-0408 (Epic 3E-0077): Block-Daten der Datei mit entfernen.
  entry.blockDataPerFile.delete(filePath);
  // 4T-0502 (Epic 3E-0096): Task-Zeilen der Datei mit entfernen.
  entry.tasksPerFile.delete(filePath);
  entry.byteSize -= entry.fileSizes.get(filePath) || 0;
  entry.fileSizes.delete(filePath);
  // 4T-0402 (Epic 3E-0076): Datei-Zeiten und Link-Graph mit austragen.
  entry.fileStats.delete(filePath);
  entry.linkGraph = null;
  entry.fileCount = entry.files.size;
}

function onWatcherChange(entry, filePath, kind) {
  if (!MD_EXT_RE.test(filePath)) return;
  if (kind === 'unlink') {
    if (entry.files.has(filePath)) {
      removeFileFromIndex(entry, filePath);
      // 4T-0348 (Epic 3E-0062): Cache-Eintrag mit entfernen.
      if (entry.isArea) {
        entry.cacheFiles.delete(filePath);
        scheduleCacheWrite(entry);
      }
      scheduleInvalidate(entry);
    }
    return;
  }
  // add oder change
  // B-19 (4T-0181): Caps gelten auch fuer nachtraegliches Wachstum. Bei
  // Ueberschreiten wird die Wurzel oversized (Daten geleert, Watcher zu,
  // Broadcast); nach Teardown ueber das Owner-Modell ist ein frischer
  // Re-Scan moeglich.
  let size = 0;
  let mtimeMs = 0;
  let ctimeMs = 0;
  try {
    const st = fs.statSync(filePath);
    size = st.size;
    mtimeMs = st.mtimeMs;
    // 4T-0402 (Epic 3E-0076): birthtime = Anlage-Zeit, ctime-Fallback.
    ctimeMs = st.birthtimeMs || st.ctimeMs;
  } catch {
    /* unlink folgt */
  }
  const prevSize = entry.fileSizes.get(filePath) || 0;
  const newCount = entry.files.has(filePath) ? entry.fileCount : entry.fileCount + 1;
  const newBytes = entry.byteSize - prevSize + size;
  // 4T-0347 (Epic 3E-0062): nachtraeglicher Cap-Check nur fuer bereichslose
  // Wurzeln; Bereichs-Wurzeln kennen keinen oversized-Status.
  if (!entry.isArea && (newCount > MAX_FILES || newBytes > MAX_BYTES)) {
    markOversized(entry);
    return;
  }
  const parsed = parseFile(filePath);
  // B-11 (4T-0175): Lesefehler (Datei kurz gesperrt/gerade geloescht)
  // ueberschreibt die bestehenden Index-Daten nicht mit einem Leer-
  // Ergebnis; der naechste Event bzw. unlink raeumt regulaer auf.
  if (!parsed) return;
  // Alte Eintraege der Datei austragen, dann den neuen Stand eintragen
  // (gemeinsamer applyParsedFile-Pfad mit dem Initial-Aufbau).
  if (entry.files.has(filePath)) removeFileFromIndex(entry, filePath);
  entry.fileSizes.set(filePath, size);
  // 4T-0402 (Epic 3E-0076): Datei-Zeiten fuer file.ctime/file.mtime nachziehen.
  entry.fileStats.set(filePath, { ctimeMs, mtimeMs });
  entry.byteSize += size;
  applyParsedFile(entry, filePath, parsed);
  // 4T-0408 (Epic 3E-0077): Block-Daten der .mdd nachziehen (removeFileFromIndex
  // hat den alten Stand mit ausgetragen); sync wie parseFile in diesem Pfad.
  const blocks = readBlockDataSync(filePath);
  if (blocks) entry.blockDataPerFile.set(filePath, blocks);
  entry.fileCount = entry.files.size;
  // 4T-0348 (Epic 3E-0062): Cache-Metadaten mitpflegen und Schreiben planen.
  if (entry.isArea) {
    entry.cacheFiles.set(filePath, { mtimeMs, size, hash: parsed.hash || '' });
    scheduleCacheWrite(entry);
  }
  scheduleInvalidate(entry);
}

// B-19 (4T-0181): Wurzel nachtraeglich als oversized markieren.
function markOversized(entry) {
  entry.status = 'oversized';
  entry.files.clear();
  entry.nameMap.clear();
  // 4T-1288: Suffix-Map der Pfad-Form haengt an der (jetzt leeren) Pfad-Menge.
  entry.pathSuffixMap = null;
  entry.aliasesPerFile.clear();
  entry.aliasMap.clear();
  entry.anchorsPerFile.clear();
  entry.tagsPerFile.clear();
  entry.tagMap.clear();
  entry.tagDisplay.clear();
  entry.propertiesPerFile.clear();
  entry.blockDataPerFile.clear();
  entry.tasksPerFile.clear();
  entry.fileSizes.clear();
  // 4T-0402 (Epic 3E-0076): Datei-Zeiten und Link-Graph mit leeren.
  entry.fileStats.clear();
  entry.linkGraph = null;
  if (entry.watcher) {
    try {
      entry.watcher.close();
    } catch {
      /* ignore */
    }
    entry.watcher = null;
  }
  broadcast('backlinks:invalidated', { wurzel: entry.wurzel });
}

// 4T-0050: Helfer fuer die inverse Alias-Map. Schluessel ist Alias-Lowercase
// (case-insensitive Lookup), Werte sind Sets von Datei-Pfaden (mehrere
// Dateien koennen denselben Alias fuehren). Leere Sets werden geloescht,
// damit aliasMap.has() ein verlaesslicher Existenz-Check bleibt.
function addToAliasMap(entry, filePath, aliases) {
  for (const a of aliases) {
    const key = a.trim().toLowerCase();
    if (!key) continue;
    let set = entry.aliasMap.get(key);
    if (!set) {
      set = new Set();
      entry.aliasMap.set(key, set);
    }
    set.add(filePath);
  }
}

function removeFromAliasMap(entry, filePath, aliases) {
  for (const a of aliases) {
    const key = a.trim().toLowerCase();
    if (!key) continue;
    const set = entry.aliasMap.get(key);
    if (!set) continue;
    set.delete(filePath);
    if (set.size === 0) entry.aliasMap.delete(key);
  }
}

// 4T-0056: Helfer fuer die inverse Tag-Map. Schluessel ist Tag-Lowercase
// (case-insensitive Lookup), Werte sind Sets von Datei-Pfaden. Identisches
// Pattern zur Alias-Map.
function addToTagMap(entry, filePath, tags) {
  for (const t of tags) {
    const key = String(t || '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    let set = entry.tagMap.get(key);
    if (!set) {
      set = new Set();
      entry.tagMap.set(key, set);
    }
    set.add(filePath);
    // B-16 (4T-0181): Display-Casing beim ersten Vorkommen merken, statt
    // es spaeter pro Listen-Aufbau linear zu suchen.
    if (!entry.tagDisplay.has(key)) entry.tagDisplay.set(key, String(t).trim());
  }
}

function removeFromTagMap(entry, filePath, tags) {
  for (const t of tags) {
    const key = String(t || '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const set = entry.tagMap.get(key);
    if (!set) continue;
    set.delete(filePath);
    if (set.size === 0) {
      entry.tagMap.delete(key);
      entry.tagDisplay.delete(key);
    }
  }
}

module.exports = {
  buildIndexAsync,
};
