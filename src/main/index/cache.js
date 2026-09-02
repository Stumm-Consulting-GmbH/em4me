// 4T-000977 (Epic 3E-000196): Bereichs-Index-Persistenz, herausgelöst aus
// src/main/backlinks.js.
//
// --- 4T-000348 (Epic 3E-000062): Bereichs-Index-Persistenz (Area_Cache.mdda) ------
// Der In-Memory-Index bleibt die Quelle der Wahrheit; die Cache-Datei ist ein
// regenerierbares Maschinen-Artefakt. Persistiert wird pro Datei { mtimeMs,
// size, hash, parsed }, Schluessel ist der wurzel-relative Pfad (Umzugs-
// Toleranz). Nur Bereichs-Wurzeln (entry.isArea) schreiben; bereichslose
// Wurzeln bleiben rein fluechtig.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
// 4T-000348 (Epic 3E-000062): Cache-Container-Format fuer die Index-Persistenz
// (Area_Cache.mdda). mdd-store bleibt path-frei; die wurzel-relative
// Transformation der md-Link-Ziele passiert hier im Index-Subsystem.
const {
  emptyCacheContainer,
  parseCacheContainer,
  serializeCacheContainer,
} = require('../documents/mdd-store.js');
const { selfWrite } = require('./store.js');

// 4T-000348 (Epic 3E-000062): Wartezeit nach der letzten Aenderung, bevor der
// Bereichs-Index-Cache (Area_Cache.mdda) geschrieben wird (debounced).
const CACHE_DEBOUNCE_MS = 3000;

// Wurzel-relativer, portabler ('/') und NFC-normalisierter Datei-Schluessel.
function cacheRelPath(absPath, wurzel) {
  return path.relative(wurzel, absPath).split(path.sep).join('/').normalize('NFC');
}

// md-Link-Treffer tragen im Speicher ein absolutes `zielAbsolut`; im Cache wird
// es wurzel-relativ (`zielRel`) abgelegt, damit ein Verschieben des Bereichs-
// Ordners die Backlinks nicht bricht. Wiki-Treffer sind namensbasiert und
// bleiben unveraendert.
function hitToCacheForm(h, wurzel) {
  if (h.linkTyp === 'md' && h.zielAbsolut) {
    const { zielAbsolut, ...rest } = h;
    return { ...rest, zielRel: path.relative(wurzel, zielAbsolut).split(path.sep).join('/') };
  }
  return h;
}

function hitFromCacheForm(h, wurzel) {
  if (h && h.linkTyp === 'md' && typeof h.zielRel === 'string') {
    const { zielRel, ...rest } = h;
    return { ...rest, zielAbsolut: path.resolve(wurzel, zielRel) };
  }
  return h;
}

// Rekonstruiert das Datei-Parse-Ergebnis aus den bestehenden Index-Maps (statt
// es doppelt zu halten). Die Reihenfolge der Anker ist fuer die Existenz-
// Pruefungen unerheblich.
function reconstructParsed(entry, absPath) {
  const anchors = entry.anchorsPerFile.get(absPath);
  return {
    hits: entry.files.get(absPath) || [],
    aliases: entry.aliasesPerFile.get(absPath) || [],
    headings: anchors ? [...anchors.headings] : [],
    blockIds: anchors ? [...anchors.blockIds] : [],
    tags: entry.tagsPerFile.get(absPath) || [],
    // 4T-000354 (Epic 3E-000065): Properties für den Cache mit rekonstruieren.
    properties: entry.propertiesPerFile.get(absPath) || {},
    // 4T-000502 (Epic 3E-000096): Task-Zeilen für den Cache mit rekonstruieren.
    tasks: entry.tasksPerFile.get(absPath) || [],
  };
}

// Laedt die Cache-Datei zu Map<relPath, {mtimeMs,size,hash,parsed(in-memory)}>.
// Fehlend oder defekt -> leere Map (stiller Neuaufbau, nie Absturz).
async function loadAreaCache(cachePath, wurzel) {
  const map = new Map();
  let raw;
  try {
    raw = await fs.promises.readFile(cachePath, 'utf8');
  } catch {
    return map; // fehlend
  }
  const res = parseCacheContainer(raw);
  if (!res.ok) return map; // defekt/versionsfremd
  const files = res.container.linkIndex.files;
  for (const relPath of Object.keys(files)) {
    const rec = files[relPath];
    if (!rec || typeof rec !== 'object' || !rec.parsed) continue;
    const p = rec.parsed;
    map.set(relPath, {
      mtimeMs: rec.mtimeMs,
      size: rec.size,
      hash: typeof rec.hash === 'string' ? rec.hash : '',
      parsed: {
        hits: (Array.isArray(p.hits) ? p.hits : []).map((h) => hitFromCacheForm(h, wurzel)),
        aliases: Array.isArray(p.aliases) ? p.aliases : [],
        headings: Array.isArray(p.headings) ? p.headings : [],
        blockIds: Array.isArray(p.blockIds) ? p.blockIds : [],
        tags: Array.isArray(p.tags) ? p.tags : [],
        // 4T-000354 (Epic 3E-000065): Properties-Map (Objekt) aus dem Cache lesen.
        properties:
          p.properties && typeof p.properties === 'object' && !Array.isArray(p.properties)
            ? p.properties
            : {},
        // 4T-000502 (Epic 3E-000096): Task-Zeilen aus dem Cache lesen (Schema-
        // Version 3; Alt-Caches verwirft parseCacheContainer ueber die Version).
        tasks: Array.isArray(p.tasks) ? p.tasks : [],
      },
    });
  }
  return map;
}

// Serialisiert die aktuelle Index-Struktur in die Cache-Datei. Der Container-
// Aufbau laeuft synchron (liest die Maps), das Schreiben asynchron ueber
// markSelfWriting. Fehler werden geloggt, nicht geworfen (Cache ist optional).
async function writeAreaCache(entry) {
  if (!entry.isArea || !entry.cachePath) return;
  const wurzel = entry.wurzel;
  const container = emptyCacheContainer();
  for (const absPath of entry.files.keys()) {
    const meta = entry.cacheFiles.get(absPath);
    if (!meta) continue;
    const parsed = reconstructParsed(entry, absPath);
    container.linkIndex.files[cacheRelPath(absPath, wurzel)] = {
      mtimeMs: meta.mtimeMs,
      size: meta.size,
      hash: meta.hash,
      parsed: {
        hits: parsed.hits.map((h) => hitToCacheForm(h, wurzel)),
        aliases: parsed.aliases,
        headings: parsed.headings,
        blockIds: parsed.blockIds,
        tags: parsed.tags,
        // 4T-000354 (Epic 3E-000065): Properties-Map mit persistieren.
        properties: parsed.properties || {},
        // 4T-000502 (Epic 3E-000096): Task-Zeilen mit persistieren.
        tasks: parsed.tasks || [],
      },
    };
  }
  const serialized = serializeCacheContainer(container);
  try {
    selfWrite(entry.cachePath, serialized);
    await fs.promises.writeFile(entry.cachePath, serialized, 'utf8');
  } catch (err) {
    console.warn('Area_Cache schreiben fehlgeschlagen:', entry.cachePath, err && err.message);
  }
}

// Debounced-Schreiben nach der letzten Aenderung; nur Bereichs-Wurzeln.
function scheduleCacheWrite(entry) {
  if (!entry.isArea || !entry.cachePath) return;
  if (entry.cacheWriteTimer) return;
  entry.cacheWriteTimer = setTimeout(() => {
    entry.cacheWriteTimer = null;
    writeAreaCache(entry).catch(() => {});
  }, CACHE_DEBOUNCE_MS);
}

module.exports = {
  cacheRelPath,
  loadAreaCache,
  writeAreaCache,
  scheduleCacheWrite,
};
