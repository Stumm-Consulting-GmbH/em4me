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
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
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
    // 4T-001510 (Epic 3E-000250): Datenbank-Marken für den Cache mit rekonstruieren.
    dbKinds: entry.dbKindsPerFile.get(absPath) || [],
    // 4T-001610 (Epic 3E-000252): Datensatz-Bestand für den Cache mit
    // rekonstruieren, dazu die Signatur der Definition eines Folge-Segments.
    // Ohne sie liesse der Warmstart einen Bestand stehen, der gegen eine
    // inzwischen geänderte Schlüssel-Spalte zugeordnet worden ist.
    records: entry.recordsPerFile.get(absPath) || [],
    recordDefSig: entry.recordDefSigPerFile.get(absPath) ?? null,
    // 4T-002782 (Epic 3E-000392): Verweise auf eigene Anker und in verknüpfte
    // Bereiche für den Cache mit rekonstruieren.
    ...rekonstruierePruefVerweise(entry, absPath),
  };
}

function rekonstruierePruefVerweise(entry, absPath) {
  const v = entry.pruefVerweisePerFile ? entry.pruefVerweisePerFile.get(absPath) : null;
  return {
    eigenAnkerVerweise: v ? v.eigenAnker : [],
    verknuepfungsVerweise: v ? v.verknuepft : [],
    blockVerweise: v ? v.block : [],
  };
}

// Liste aus dem Cache auf ihre Objekt-Einträge beschränken.
function nurObjekte(liste) {
  return Array.isArray(liste)
    ? liste.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x))
    : [];
}

// Laedt die Cache-Datei zu Map<relPath, {mtimeMs,size,hash,parsed(in-memory)}>.
// Fehlend oder defekt -> leere Map (stiller Neuaufbau, nie Absturz).
// 4T-002863 (Epic 3E-000449): `ohneKommentare` ist die Kommentar-Regel des
// aufzubauenden Index; ein Speicher nach der anderen Regel gilt als fehlend,
// sonst übernähme der Warmstart unveränderte Dateien nach der alten Regel.
async function loadAreaCache(cachePath, wurzel, ohneKommentare = true) {
  const map = new Map();
  let raw;
  try {
    raw = await fs.promises.readFile(cachePath, 'utf8');
  } catch {
    return map; // fehlend
  }
  const res = parseCacheContainer(raw);
  if (!res.ok) return map; // defekt/versionsfremd
  if ((res.container.ohneKommentare !== false) !== (ohneKommentare !== false)) return map;
  const files = res.container.linkIndex.files;
  for (const relPath of Object.keys(files)) {
    const rec = files[relPath];
    if (!rec || typeof rec !== 'object' || !rec.parsed) continue;
    const p = rec.parsed;
    map.set(relPath, {
      mtimeMs: rec.mtimeMs,
      size: rec.size,
      hash: typeof rec.hash === 'string' ? rec.hash : '',
      // 4T-002863 (Epic 3E-000449): Stand der Teile eines geteilten Dokuments,
      // nach dem dieser Teil bereinigt wurde (teil-kommentare.js, build.js).
      ...(Array.isArray(rec.teilStand) ? { teilStand: rec.teilStand } : {}),
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
        // 4T-001510 (Epic 3E-000250): Datenbank-Marken aus dem Cache lesen
        // (Schema-Version 4).
        dbKinds: Array.isArray(p.dbKinds) ? p.dbKinds : [],
        // 4T-001610 (Epic 3E-000252): Datensatz-Bestand aus dem Cache lesen
        // (Schema-Version 5).
        records: Array.isArray(p.records) ? p.records : [],
        recordDefSig: typeof p.recordDefSig === 'string' ? p.recordDefSig : null,
        // 4T-002782 (Epic 3E-000392): Prüf-Verweise aus dem Cache lesen
        // (Schema-Version 12).
        // Zweitblick zu 3E-000392, Hinweis A4: nur Objekt-Einträge, damit ein
        // beschädigter Eintrag die Erhebung nicht abbricht.
        eigenAnkerVerweise: nurObjekte(p.eigenAnkerVerweise),
        verknuepfungsVerweise: nurObjekte(p.verknuepfungsVerweise),
        blockVerweise: nurObjekte(p.blockVerweise),
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
  container.ohneKommentare = entry.ohneKommentare !== false;
  for (const absPath of entry.files.keys()) {
    const meta = entry.cacheFiles.get(absPath);
    if (!meta) continue;
    const parsed = reconstructParsed(entry, absPath);
    container.linkIndex.files[cacheRelPath(absPath, wurzel)] = {
      mtimeMs: meta.mtimeMs,
      size: meta.size,
      hash: meta.hash,
      ...(Array.isArray(meta.teilStand) ? { teilStand: meta.teilStand } : {}),
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
        // 4T-001510 (Epic 3E-000250): Datenbank-Marken mit persistieren.
        dbKinds: parsed.dbKinds || [],
        // 4T-001610 (Epic 3E-000252): Datensatz-Bestand mit persistieren.
        records: parsed.records || [],
        recordDefSig: parsed.recordDefSig ?? null,
        // 4T-002782 (Epic 3E-000392): Prüf-Verweise mit persistieren.
        eigenAnkerVerweise: parsed.eigenAnkerVerweise,
        verknuepfungsVerweise: parsed.verknuepfungsVerweise,
        blockVerweise: parsed.blockVerweise,
      },
    };
  }
  const serialized = serializeCacheContainer(container);
  try {
    await ersetzeDateiOderWirf(entry.cachePath, serialized, { markSelfWriting: selfWrite });
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
