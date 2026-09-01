// 4T-0015: Backlinks-Indexierung pro Wurzel.
// Eine Wurzel ist der Ordner einer aktiven Datei. Suchraum = Wurzel + 2
// zusaetzliche Unterordner-Ebenen (chokidar depth: 2). Pro Wurzel haelt
// dieses Subsystem einen Index aller Markdown-Dateien mit allen darin
// gefundenen Wiki-Links und relativen Markdown-Links plus chokidar-Watcher
// fuer inkrementelle Updates. Reference-Counting plus 60-s-Soft-Timer
// steuert, wann der Watcher abgebaut wird (letzter Tab in der Wurzel ist zu).
//
// 4T-0977 (Epic 3E-0196): Fassade der Index-API (bewusste Subsystem-API,
// Entscheidung E3 der Bestandsaufnahme). Die Implementierung liegt in den
// Untermodulen unter src/main/index/; diese Datei hält die Export-Fläche
// für main.js, area-stats.js, area-search.js und die Unit-Tests stabil.
// Modul-Schnitt: store (Zustand, Wurzel-Bestimmung), scan (Verzeichnis-Scan),
// parse (Datei-Parser), block-data (Block-Daten der .mdd), build (Aufbau,
// Map-Pflege, Watcher), lifecycle (Bedarf, Referenzen, Abbau), cache
// (Area_Cache-Persistenz), overlay (Puffer-Overlay-Schicht), resolve
// (Ziel-Auflösung, Linter-Ziele, Backlinks), link-graph (Graph und
// Abfrage-Kontext), query (Perspective-Abfrage), query-data (Ereignisse,
// Skript-Snapshot), embed (Anker-Snippet-Extraktion), views (Autocomplete,
// Tags, Graph, Statistik, Roh-Task-Zeilen).

'use strict';

const store = require('./index/store.js');
const scan = require('./index/scan.js');
const blockData = require('./index/block-data.js');
const lifecycle = require('./index/lifecycle.js');
const overlay = require('./index/overlay.js');
const resolve = require('./index/resolve.js');
const query = require('./index/query.js');
const queryData = require('./index/query-data.js');
const embed = require('./index/embed.js');
const views = require('./index/views.js');
// 4T-1156 (Epic 3E-0219): Ziel-Sicht der Verweis-Felder, neben den Views.
const verweisZiele = require('./index/profil-verweis-ziele.js');
// 4T-1158 (Epic 3E-0219): Wertevorrat aus einer Abfrage.
const wertevorrat = require('./index/profil-wertevorrat.js');
// 4T-1340 (Epic 3E-0238): die im Bereich vergebenen Werte einer Eigenschaft.
const eigenschaftsWerte = require('./index/eigenschafts-werte.js');
// 4T-1184 (Epic 3E-0221): Treffer eines Lookup-Feldes.
const lookup = require('./index/profil-lookup.js');

module.exports = {
  attachBroadcast: store.attachBroadcast,
  // 4T-0348 (Epic 3E-0062): markSelfWriting-Injection fuer das Cache-Schreiben.
  attachSelfWriter: store.attachSelfWriter,
  backlinksFor: resolve.backlinksFor,
  releaseRoot: lifecycle.releaseRoot,
  // B-02 (4T-0175): Fenster-Schliessen gibt alle Roots des webContents frei.
  releaseAllForOwner: lifecycle.releaseAllForOwner,
  // B-13 (4T-0175): Index-Fallback fuer den Klick-Pfad.
  resolveWikiTargetInIndex: resolve.resolveWikiTargetInIndex,
  rootForActiveFile: store.rootForActiveFile,
  // B-18 (4T-0187): Bedarfs-Aufbau fuer Tag-Sidebar/Autocomplete/Linter.
  ensureIndexForDemand: lifecycle.ensureIndexForDemand,
  // 4T-0348 (Epic 3E-0062): proaktiver Bereichs-Index beim Bereichs-Oeffnen.
  ensureAreaIndex: lifecycle.ensureAreaIndex,
  // 4T-0020: Linter-Lookup fuer broken-wiki-link.
  existingWikiTargets: resolve.existingWikiTargets,
  // 4T-0050: Aliases-Aufloesung fuer Wiki-Link-Klick.
  resolveWikiTargetByAlias: resolve.resolveWikiTargetByAlias,
  // 4T-0055: Anker-Snippet-Extraktion fuer Wiki-Embeds.
  extractEmbedSnippet: embed.extractEmbedSnippet,
  // 4T-0056: Tag-System.
  tagsFor: views.tagsFor,
  // 4T-0354 (Epic 3E-0065): Frontmatter-Abfrage.
  frontmatterQueryFor: query.frontmatterQueryFor,
  // 4T-0935 (Befund B-08): Puffer-Overlay der gerenderten Ansicht.
  setBufferOverlay: overlay.setBufferOverlay,
  clearBufferOverlay: overlay.clearBufferOverlay,
  clearAllBufferOverlays: overlay.clearAllBufferOverlays,
  // 4T-0948 (Befund E-01): Roh-Text der Schicht fuer die Wiki-Einbettung.
  bufferTextFor: overlay.bufferTextFor,
  // 4T-0515 (Epic 3E-0092): Ereignis-Aggregation ueber das Frontmatter.
  eventsForQuery: queryData.eventsForQuery,
  // 4T-0525 (Epic 3E-0095): Roh-Task-Zeilen fuer den Erinnerungs-Pruefer.
  areaTaskLines: views.areaTaskLines,
  // 4T-0413 (Epic 3E-0078): Daten-Snapshot der Skript-Bloecke.
  scriptDataFor: queryData.scriptDataFor,
  // 4T-0453 (Epic 3E-0084): Graph-Daten der Graphenansicht.
  graphFor: views.graphFor,
  // 4T-0619 (Epic 3E-0117): Index-Anteil der Bereichs-Statistik; die
  // Ignorier-Regel teilt sich der ergaenzende Scan in area-stats.js mit
  // Initial-Scan und Watcher (eine Regel, keine Kopie).
  statsFor: views.statsFor,
  isIgnoredDirName: scan.isIgnoredDirName,
  // 4T-0408 (Epic 3E-0077): Invalidierung der Block-Ebene nach blockData-
  // Mutationen (blockData:changed-Datenpfad in main.js); extractBlockEntries
  // (rein, raw -> Eintraege) zusaetzlich fuer den Unit-Test des Lese-Pfads.
  updateBlockDataForFile: lifecycle.updateBlockDataForFile,
  extractBlockEntries: blockData.extractBlockEntries,
  // 4T-0057: Autocomplete-Suggestions.
  wikiLinkAutocompleteSuggestions: views.wikiLinkAutocompleteSuggestions,
  anchorAutocompleteSuggestions: views.anchorAutocompleteSuggestions,
  tagAutocompleteSuggestions: views.tagAutocompleteSuggestions,
  // 4T-1156 (Epic 3E-0219): Ziel-Liste eines Verweis-Feldes der
  // Eigenschafts-Profile (eigene Sicht, siehe profil-verweis-ziele.js).
  verweisZiele: verweisZiele.verweisZiele,
  // 4T-1158 (Epic 3E-0219): Wertevorrat aus einer Abfrage, auf Verlangen
  // ausgewertet und gegen den Index-Stand zwischengespeichert.
  werteAusAbfrage: wertevorrat.werteAusAbfrage,
  // 4T-1340 (Epic 3E-0238): Werte-Vorschlaege aus dem vorhandenen Bestand.
  eigenschaftsWerteFuerFeld: eigenschaftsWerte.eigenschaftsWerteFuerFeld,
  auswertungsZaehler: wertevorrat.auswertungsZaehler,
  zwischenspeicherLeeren: wertevorrat.zwischenspeicherLeeren,
  // 4T-1184 (Epic 3E-0221): Treffer eines Lookup-Feldes, auf Verlangen
  // ausgewertet und gegen den Index-Stand zwischengespeichert. Eigene Zaehler
  // und eigener Zwischenspeicher, weil die Begrenzung je Sicht nachgewiesen
  // wird und ein gemeinsamer Zaehler beide Nachweise verwaschen wuerde.
  lookupTreffer: lookup.lookupTreffer,
  lookupAuswertungsZaehler: lookup.auswertungsZaehler,
  lookupZwischenspeicherLeeren: lookup.zwischenspeicherLeeren,
  // 4T-1158: Änderungs-Stand einer Wurzel — die Bezugsgröße, gegen die
  // Zwischenspeicher gültig bleiben. Hier durchgereicht, damit Verbraucher
  // und Prüfungen dieselbe Modul-Instanz sehen wie die Sichten selbst.
  indexStand: store.indexStand,
};
