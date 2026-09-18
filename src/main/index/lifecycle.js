// 4T-000977 (Epic 3E-000196): Lebenszyklus der Index-Einträge, herausgelöst aus
// src/main/backlinks.js. Hier wohnen der Bedarfs-Einstieg (ensureIndex mit
// Owner-Modell, ensureIndexForDemand, ensureAreaIndex), die Freigabe mit
// Soft-Timer (releaseRoot, releaseAllForOwner), der Abbau (teardownIndex mit
// Cache-Flush) und die Block-Daten-Invalidierung nach .mdd-Mutationen
// (updateBlockDataForFile). Den eigentlichen Aufbau übernimmt build.js.

'use strict';

const path = require('node:path');
const { indexes, broadcast, scheduleInvalidate, resolveRootInfo } = require('./store.js');
const { buildIndexAsync } = require('./build.js');
const { writeAreaCache } = require('./cache.js');
const { normalizeBlockEntries } = require('./block-data.js');
// 4T-001761 (Epic 3E-000253): Die abgeleiteten Zuordnungen des Datensatz-
// Zugriffs hängen am Bestand und nicht an der Wurzel; ein Neuaufbau, der den
// Bestand ändert, verwirft sie mit.
const { zwischenspeicherLeeren } = require('./datensatz-zugriff.js');

const SOFT_TIMEOUT_MS = 60 * 1000;

// Stellt sicher, dass fuer eine Wurzel ein Index existiert. Beim ersten
// Aufruf wird er asynchron aufgebaut und der Watcher gestartet. Folgeaufrufe
// liefern den existierenden Eintrag.
// B-01/R3-01 (4T-000175): Owner-Modell statt blindem Refcount. Referenzen
// werden pro Owner-Key (webContents-ID + Pane) als Set gefuehrt; wiederholte
// Requests desselben Owners fuer dieselbe Wurzel zaehlen nicht erneut.
// Vorher liefen request/release asymmetrisch (Request bei jedem Editor-Sync
// und jedem Invalidate, Release nur beim Datei-Wechsel) — der Zaehler wuchs
// unbegrenzt und das Teardown lief nie.
function ensureIndex(rootPath, ownerKey, isArea) {
  let entry = indexes.get(rootPath);
  if (entry) {
    if (ownerKey) entry.ownerKeys.add(ownerKey);
    if (entry.softTimer) {
      clearTimeout(entry.softTimer);
      entry.softTimer = null;
    }
    // 4T-000347 (Epic 3E-000062): Upgrade bereichslos -> Bereich. Wird eine
    // bestehende Wurzel als Bereichs-Wurzel angefragt (dieselbe Datei zugleich
    // in einer Bereichs-App und einer bereichslosen App, Datei direkt im
    // Wurzelordner), muss der Index auf den vollen Bereichs-Baum umgestellt
    // werden — sonst saehe die Bereichs-App einen tiefenbegrenzten Index.
    // Rebuild wie beim Watcher-Fehler (Owner uebernehmen). Der umgekehrte Fall
    // (bestehende Bereichs-Wurzel, bereichslose Anfrage) bleibt: mehr Suchraum
    // ist harmlos, kein Downgrade.
    if (isArea && !entry.isArea) {
      const owners = new Set(entry.ownerKeys);
      teardownIndex(rootPath, { force: true });
      let fresh = null;
      for (const key of owners) {
        fresh = ensureIndex(rootPath, key, true);
      }
      return fresh || ensureIndex(rootPath, ownerKey, true);
    }
    // B-21 (4T-000187): Nach einem Watcher-Fehler bleibt der Eintrag im
    // 'error'-Status liegen (kein Sofort-Rebuild, kein Schleifen-Risiko);
    // erst nach Ablauf des Backoffs stoesst der naechste Bedarf einen
    // frischen Aufbau an.
    if (entry.status === 'error' && Date.now() >= (entry.errorUntil || 0)) {
      const owners = new Set(entry.ownerKeys);
      teardownIndex(rootPath, { force: true });
      let fresh = null;
      for (const key of owners) {
        fresh = ensureIndex(rootPath, key, isArea);
      }
      return fresh || ensureIndex(rootPath, ownerKey, isArea);
    }
    return entry;
  }
  entry = {
    wurzel: rootPath,
    // 4T-000347 (Epic 3E-000062): true = Bereichs-Wurzel (voller Baum, keine
    // Tiefen-Grenze, keine Caps); false = Ordner-Wurzel mit SCAN_DEPTH und Caps.
    isArea: !!isArea,
    status: 'indexing',
    files: new Map(),
    // 4T-000050: Aliases pro Datei (Original-Casing aus dem YAML) plus inverse
    // Map alias-lowercase -> Set von Datei-Pfaden. Inverse Map fuer schnelles
    // Lookup beim Wiki-Link-Klick und im Linter.
    aliasesPerFile: new Map(),
    aliasMap: new Map(),
    // 4T-000054: Heading-Slugs und Block-IDs pro Datei fuer Anker-Pruefung
    // im Linter. Sets fuer O(1)-Lookup.
    //   anchorsPerFile: Map<absPath, { headings: Set<slug>, blockIds: Set<id> }>
    anchorsPerFile: new Map(),
    // 4T-000056: Tags pro Datei (Inline + Frontmatter) plus inverse Map fuer
    // O(1)-Lookup beim Filtern. tagsPerFile speichert Original-Casing,
    // tagMap-Schluessel ist Lowercase fuer case-insensitive Filter.
    //   tagsPerFile: Map<absPath, string[]>
    //   tagMap:      Map<tagLower, Set<absPath>>
    tagsPerFile: new Map(),
    tagMap: new Map(),
    // B-16 (4T-000181): Display-Casing pro Tag-Key (erstes gesehenes Casing).
    tagDisplay: new Map(),
    // 4T-000354 (Epic 3E-000065): Frontmatter-Properties pro Datei für die Abfrage-
    // Auswertung. Objekt mit lowercase-Schlüsseln -> String bzw. String-Liste
    // (Nicht-Skalare und leere Werte weggelassen). Vorwärts-Map; der Evaluator
    // läuft pro Datei gegen diese Map (bewusst keine inverse Wert-Map).
    //   propertiesPerFile: Map<absPath, { [keyLower]: string | string[] }>
    propertiesPerFile: new Map(),
    // 4T-001510 (Epic 3E-000250): Marken der Datenbank-Behälter pro Datei (nur
    // Dateien mit Marke). Die Auskunft «welche Dateien sind Tabellen bzw. der
    // Steckbrief», aus der der Katalog seinen Bestand bildet; die Definition
    // selbst steht in der Datei und nicht hier.
    //   dbKindsPerFile: Map<absPath, Array<'table'|'database'>>
    dbKindsPerFile: new Map(),
    // 4T-001610 (Epic 3E-000252): Datensätze pro Datei einer Datenbank-Tabelle
    // (nur Dateien mit Datensätzen). Je Datensatz die interne Kennung, die Werte
    // des fachlichen Schlüssels, die Anzeige-Form und die Zeile in der Datei —
    // **nie die Zellwerte** (Entscheidung A1 vom 2026-09-08; sie hielten die
    // ganze Datenbank im Speicher). Vorwärts-Map wie die Nachbarn; der Zugriff
    // über Kennung und Schlüssel folgt in 4T-001611.
    //   recordsPerFile: Map<absPath, Array<{ id, key, display, zeile }>>
    recordsPerFile: new Map(),
    // 4T-001610: Zu einem Folge-Segment die Signatur der Definition, gegen die
    // seine Datensätze zugeordnet wurden. Trägt die Gültigkeit im
    // Platten-Zwischenspeicher: Ändert sich die Schlüssel-Spalte in der
    // Kopf-Datei, ändert sich die Segment-Datei nicht, und ohne den Vergleich
    // zeigte der Bestand dauerhaft veraltete Schlüsselwerte.
    //   recordDefSigPerFile: Map<absPath, string>
    recordDefSigPerFile: new Map(),
    // 4T-000408 (Epic 3E-000077): Block-Daten pro Datei aus der blockData-Sektion
    // der .mdd-Begleitdatei (nur Dateien mit Eintraegen). Grundlage des
    // BLOCKS-Scopes der Abfrage; Pflege ueber Index-Aufbau, Watcher-Pfad und
    // updateBlockDataForFile (blockData:changed-Mutationen aus main.js).
    //   blockDataPerFile: Map<absPath, Array<{ anchor, values, updatedMs }>>
    blockDataPerFile: new Map(),
    // 4T-000502 (Epic 3E-000096): Task-Zeilen pro Datei fuer den TASKS-Scope
    // (nur Dateien mit Eintraegen). Roh-Zeilen; Modell-Parsing im Query-Zweig.
    //   tasksPerFile: Map<absPath, Array<{ zeile, text, heading }>>
    tasksPerFile: new Map(),
    // B-15 (4T-000181): inverse Namens-Map basenameKeyLower -> Set<Pfad>
    // fuer O(1)-Wiki-Aufloesung (traegt die B-04-Normalisierung strukturell).
    nameMap: new Map(),
    // 4T-001494 (Epic 3E-000199): zweite, schlanke Namens-Zuordnung fuer
    // NICHT-Markdown-Dateien (Bilder, PDF, Anlagen): Name -> Set<Pfad>, ohne
    // Link-Parsing, ohne Inhalt, ohne Rueckverweise. Getrennt von nameMap
    // gehalten, weil beide verschiedene Zusicherungen tragen: nameMap speist
    // Rueckverweise, Tag-Listen und Abfragen, diese hier ausschliesslich die
    // Namens-Suche der Einbettung und des Klick-Pfads. Je Datei stehen zwei
    // Schluessel darin, mit und ohne Endung — 'bild.png' wird so geschrieben,
    // 'bild' so gemeint.
    assetNameMap: new Map(),
    // 4T-001288: Suffix-Map der Pfad-Form (normalisierter Segment-Suffix ->
    // Set<Pfad>), lazy beim ersten Pfad-Resolve gebaut (resolve.js). Sie
    // haengt allein an der PFAD-Menge des Index; jede Aenderung der Menge
    // setzt sie auf null (Invalidierung in build.js), der naechste
    // Pfad-Resolve baut sie neu. Vorher lief die Pfad-Form linear ueber alle
    // Dateien mit normalizeNameKey je Datei und je Aufruf — im migrierten
    // Obsidian-Bestand (879 Pfad-Links, 6483 Dateien) blockierte das den
    // UI-Thread des Hauptprozesses je Backlinks-Anfrage sekundenlang.
    pathSuffixMap: null,
    // B-19 (4T-000181): Groesse pro Datei fuer die inkrementelle Cap-Pruefung.
    fileSizes: new Map(),
    // 4T-000402 (Epic 3E-000076): Datei-Zeiten pro Datei fuer die impliziten
    // Abfrage-Felder file.ctime/file.mtime (Epoch-ms aus dem ohnehin
    // erhobenen stat; ctime = birthtime mit ctime-Fallback).
    //   fileStats: Map<absPath, { ctimeMs, mtimeMs }>
    fileStats: new Map(),
    // 4T-000402 (Epic 3E-000076): Link-Graph-Cache fuer file.inlinks/file.outlinks
    // und FROM-Link-Quellen: { outMap, inMap } (Map<absPath, absPath[]>),
    // lazy beim ersten Bedarf gebaut, bei jeder Index-Aenderung invalidiert.
    linkGraph: null,
    // 4T-000952 (Epic 3E-000198): Zwischenspeicher des Link-Graphen MIT den
    // Puffer-Overlays, den allein die Graphenansicht liest:
    // { overlayStand, graph }. Er wird an denselben Stellen genullt wie
    // linkGraph; die Begruendung des zweiten Graphen steht in link-graph.js.
    linkGraphUeberlagert: null,
    // 4T-000348 (Epic 3E-000062): Cache-Metadaten pro Datei (mtimeMs, size, hash)
    // fuer den Warmstart-Abgleich; nur bei Bereichs-Wurzeln gefuellt. Das
    // Parse-Ergebnis selbst wird beim Schreiben aus den Index-Maps rekonstruiert
    // (keine doppelte Haltung). cachePath/cacheWriteTimer steuern das debouncede
    // Schreiben von Area_Cache.mdda.
    cacheFiles: new Map(),
    cachePath: null,
    cacheWriteTimer: null,
    fileCount: 0,
    byteSize: 0,
    watcher: null,
    // B-01 (4T-000175): Owner-Keys statt Zaehler (Set dedupliziert).
    ownerKeys: new Set(ownerKey ? [ownerKey] : []),
    softTimer: null,
    invalidateTimer: null,
  };
  indexes.set(rootPath, entry);

  // B-14 (4T-000181): Aufbau asynchron starten, NICHT awaiten. Der IPC-
  // Handler liefert sofort 'indexing'; das fertige Ergebnis meldet sich
  // ueber den bestehenden 'backlinks:invalidated'-Broadcast.
  buildIndexAsync(rootPath, entry).catch((err) => {
    console.warn('Backlinks-Index-Aufbau fehlgeschlagen:', err);
    if (indexes.get(rootPath) === entry) teardownIndex(rootPath, { force: true });
    // W-08 (4T-000309): wartende Panels aus dem 'indexing'-Stand loesen. Ohne
    // Broadcast blieben sie bis zum naechsten eigenen Request haengen
    // (Muster wie beim Watcher-Fehler oben).
    broadcast('backlinks:invalidated', { wurzel: rootPath });
  });
  return entry;
}

// 4T-001761 (Epic 3E-000253): Alle offenen Indizes verwerfen und mit denselben
// Besitzern neu aufbauen.
//
// **Wofür.** Der Umfang des Bestands hängt seit diesem Vorgang am Schalter der
// Erweiterung «Datenbank» (index-schalter.js). Wird er umgelegt, ist jeder
// stehende Index nach der alten Regel gebaut: Beim Abschalten hielte er
// Datensätze, die niemand mehr sehen darf, beim Einschalten fehlten sie. Der
// Neuaufbau ist der einzige Weg, weil die Erfassung beim Parsen der Datei
// geschieht und der Bestand danach nicht nachträglich entsteht.
//
// **Das Muster ist der Rebuild aus `ensureIndex`** (Upgrade bereichslos ->
// Bereich und Watcher-Fehler): Besitzer sichern, mit `force` abbauen, je
// Besitzer neu anfragen. Der Aufbau läuft asynchron wie sonst auch, und die
// wartenden Ansichten holt der `backlinks:invalidated`-Broadcast ab.
//
// Der Arbeitsbaum des Anwenders wird dabei **nicht** angefasst: Es wird
// gelesen, nicht geschrieben. Die eine Ausnahme ist der Zwischenspeicher einer
// Bereichs-Wurzel, den der Abbau ohnehin seit jeher sichert.
function alleIndizesNeuAufbauen() {
  const wurzeln = [];
  for (const [rootPath, entry] of indexes) {
    wurzeln.push({ rootPath, owners: new Set(entry.ownerKeys), isArea: entry.isArea });
  }
  // Die abgeleiteten Zuordnungen des Datensatz-Zugriffs zeigen auf den alten
  // Bestand. Sie verfallen zwar ohnehin mit dem nächsten Index-Stand; sie hier
  // zu leeren macht die Zusage unabhängig davon, ob ein Aufbau seinen Stand
  // schon gemeldet hat.
  zwischenspeicherLeeren();
  for (const { rootPath, owners, isArea } of wurzeln) {
    teardownIndex(rootPath, { force: true });
    // Eine Wurzel OHNE Besitzer steht in ihrem Soft-Fenster und verschwindet
    // ohnehin binnen einer Minute; sie wird abgebaut und nicht neu gebaut. Ein
    // Neuaufbau ohne Besitzer bekäme weder Soft-Timer noch Freigabe und bliebe
    // für die Lebensdauer der Anwendung liegen. Der nächste Bedarf baut sie
    // nach der neuen Regel wieder auf.
    for (const key of owners) ensureIndex(rootPath, key, isArea);
  }
}

// Invalidierungs-Pfad der Block-Ebene: main.js ruft dies nach jeder blockData-
// Mutation auf (derselbe Schreibvorgang, der 'blockData:changed' broadcastet).
// rawBlockData ist die frische Anker-Map aus getAllBlockData; alle Wurzeln, die
// die Datei indexieren, ziehen nach und melden sich ueber den regulaeren
// 'backlinks:invalidated'-Broadcast (debounced), worauf die sichtbaren
// Abfrage-Container neu befuellen.
function updateBlockDataForFile(filePath, rawBlockData) {
  if (!filePath) return;
  let absolute;
  try {
    absolute = path.resolve(filePath);
  } catch {
    return;
  }
  const entries = normalizeBlockEntries(rawBlockData);
  for (const entry of indexes.values()) {
    if (!entry.files.has(absolute)) continue;
    if (entries.length > 0) entry.blockDataPerFile.set(absolute, entries);
    else entry.blockDataPerFile.delete(absolute);
    scheduleInvalidate(entry);
  }
}

// Ein Owner gibt die Wurzel frei. Wenn kein Owner mehr registriert ist,
// startet der Soft-Timer. Wird in dieser Zeit erneut ensureIndex aufgerufen,
// wird der Timer abgebrochen.
// B-01 (4T-000175): Owner-Key-Modell; ohne ownerKey (Alt-Aufrufer) wird nur
// der Leer-Check ausgefuehrt.
function releaseRoot(rootPath, ownerKey) {
  const entry = indexes.get(rootPath);
  if (!entry) return;
  if (ownerKey) entry.ownerKeys.delete(ownerKey);
  if (entry.ownerKeys.size > 0) return;
  if (entry.softTimer) return;
  entry.softTimer = setTimeout(() => {
    teardownIndex(rootPath);
  }, SOFT_TIMEOUT_MS);
}

// B-02 (4T-000175): Beim Schliessen eines Fensters alle Owner-Keys dieses
// webContents freigeben (Keys haben die Form '<webContentsId>:<paneIdx>').
function releaseAllForOwner(webContentsId) {
  const prefix = `${webContentsId}:`;
  for (const [rootPath, entry] of indexes) {
    let removed = false;
    for (const key of [...entry.ownerKeys]) {
      if (key.startsWith(prefix)) {
        entry.ownerKeys.delete(key);
        removed = true;
      }
    }
    if (removed && entry.ownerKeys.size === 0 && !entry.softTimer) {
      entry.softTimer = setTimeout(() => {
        teardownIndex(rootPath);
      }, SOFT_TIMEOUT_MS);
    }
  }
}

function teardownIndex(rootPath, opts = {}) {
  const entry = indexes.get(rootPath);
  if (!entry) return;
  if (!opts.force && entry.ownerKeys.size > 0) return;
  if (entry.softTimer) clearTimeout(entry.softTimer);
  if (entry.invalidateTimer) clearTimeout(entry.invalidateTimer);
  // 4T-000348 (Epic 3E-000062): letzten Cache-Stand sichern, bevor die Wurzel
  // abgebaut wird. Container-Aufbau synchron (liest die noch intakten Index-
  // Maps), Schreiben asynchron (fire-and-forget). Ein verpasster Flush ist
  // unkritisch, weil geaenderte Dateien beim naechsten Oeffnen per mtime-
  // Mismatch neu geparst werden.
  if (entry.cacheWriteTimer) {
    clearTimeout(entry.cacheWriteTimer);
    entry.cacheWriteTimer = null;
  }
  if (entry.isArea) writeAreaCache(entry).catch(() => {});
  if (entry.watcher) {
    try {
      entry.watcher.close();
    } catch {
      /* ignore */
    }
  }
  indexes.delete(rootPath);
}

// B-18 (4T-000187): Index-Lebenszyklus von der Panel-Sichtbarkeit entkoppelt.
// Bedarfs-Pfade (Tag-Sidebar, Autocomplete, Linter, Alias-/Index-Klick)
// stossen den asynchronen Aufbau selbst an. Der Owner-Key folgt dem
// B-01-Modell ('<webContentsId>:…'); releaseAllForOwner raeumt ihn beim
// Fenster-Schliessen mit ab, Mehrfach-Aufrufe desselben Owners sind durch
// das Set idempotent (kein Rueckfall in das B-01-Leak).
function ensureIndexForDemand(filePath, ownerKey, areaRoot) {
  // 4T-001514 (Epic 3E-000174): Ein Bedarf ohne offene Datei ist seit dem
  // schnellen Datei-Oeffnen moeglich; mit geoeffnetem Bereich traegt dieser die
  // Wurzel. Im Regelfall steht der Bereichs-Index dann ohnehin schon
  // (ensureAreaIndex beim Oeffnen des Bereichs, 4T-000348) — der Weg hier ist
  // die zweite Linie, falls nicht.
  if ((!filePath && !areaRoot) || !ownerKey) return;
  const { root, isArea } = resolveRootInfo(filePath, areaRoot);
  if (!root) return;
  ensureIndex(root, ownerKey, isArea);
}

// 4T-000348 (Epic 3E-000062): proaktiver Aufbau des Bereichs-Index beim Bereichs-
// Oeffnen, unabhaengig von einer offenen Datei. So entsteht der Index (und
// damit Area_Cache.mdda) "automatisch beim Start" statt erst beim ersten
// Panel-/Linter-Bedarf. Der ownerKey ('area:<appId>') haelt den Index ueber
// die Lebensdauer der Bereichs-App; main.js gibt ihn beim Bereichs-Schliessen
// frei (releaseRoot -> Soft-Timer -> Teardown mit Cache-Flush).
function ensureAreaIndex(areaRoot, ownerKey) {
  if (!areaRoot || !ownerKey) return;
  let root;
  try {
    root = path.resolve(areaRoot);
  } catch {
    return;
  }
  ensureIndex(root, ownerKey, true);
}

module.exports = {
  ensureIndex,
  // 4T-001761 (Epic 3E-000253): Neuaufbau aller Indizes nach dem Umlegen des
  // Erweiterungs-Schalters.
  alleIndizesNeuAufbauen,
  releaseRoot,
  releaseAllForOwner,
  ensureIndexForDemand,
  ensureAreaIndex,
  updateBlockDataForFile,
};
