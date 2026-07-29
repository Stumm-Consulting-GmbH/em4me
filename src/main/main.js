// Electron Main-Prozess: Fenster (Multi-Window), IPC, File-Watching,
// Datei-Assoziation, Settings.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  nativeTheme,
  screen,
  Notification,
} = require('electron');
const chokidar = require('chokidar');
const { buildMenu, tForLocale } = require('./menu');
// 4T-0277: Menue-State-Normalisierung (electron-frei, unit-testbar).
const { normalizeMenuState } = require('./menu-state');
const backlinks = require('./backlinks');
// B-02 (4T-0307): Containment-/Whitelist-Pruefung fuer embed:read.
const { resolveContainedEmbedPath } = require('./embed-path');
// 4T-0337 (Epic 3E-0061): Unterseiten-Namens-Logik fuer Embeds und
// Anlage-/Umbenennen-Kommandos.
const subpages = require('../shared/subpages');
// 4T-0345 (Epic 3E-0062): Rewrite-Kern (4T-0344) fuer das automatische Link-
// Update beim Umbenennen — rein string-basiert, EOL-/BOM-erhaltend.
const { computeLinkRewrites } = require('../shared/link-rewrite');
// Groessen-Limit fuer Markdown-Embeds (embed:read); Markdown-Text, daher
// deutlich unter dem 20-MB-Limit des Bild-Resolvers.
const MAX_EMBED_BYTES = 5 * 1024 * 1024;
// 4T-0207 (Epic 3E-0015): Kommando-Registry — Merge der Registry-Defaults
// mit den User-Overrides aus dem Store-Key 'hotkeys' fuer die Menue-
// Accelerators aller Fenster.
const { effectiveMenuAccelerators } = require('../shared/commands');
// 4T-0294 (Epic 3E-0052): Menue-Eintraege deaktivierter Erweiterungen
// verschwinden — die Kommando-Zuordnung kommt aus der Erweiterungs-Registry.
// 4T-0502 (Epic 3E-0096): isExtensionEnabled fuer das Gate des TASKS-Scopes.
const { disabledCommandIdSet, isExtensionEnabled } = require('../shared/extensions');
// 4T-0502 (Epic 3E-0096): Status-Typ-Resolver fuer den TASKS-Scope der
// Abfrage — aufgeloest aus dem taskStates-Store-Stand, prozessneutral.
const { createTaskStatusTypeResolver } = require('../shared/markdown/plugins.js');
// 4T-0504 (Epic 3E-0096): zeilen-genaue Ersetzung fuer das Rueckschreiben
// aus der Abfrage-Ansicht (Konflikt-Erkennung im prozessneutralen Kern).
const { computeLineReplacement } = require('./task-line-edit.js');
// 4T-0630 (Epic 3E-0102): Titelleisten-Faerbung nach Arbeitsbereichs-Farbe
// (DWM-Fenster-Attribute via koffi; Windows-10-Fallback: stiller No-op).
const { applyCaptionColor } = require('./caption-color.js');
// 4T-0632 (Epic 3E-0102): Demo-Area — Leerheits-Pruefung und Kopie der
// mitgelieferten Demo-Inhalte (UI-Verdrahtung in den demoArea:*-Handlern).
const { createDemoAreaAt } = require('./demo-area.js');
// 4T-0643 (Epic 3E-0126): Uebernahme der Nutzerdaten nach einem Rebranding
// (config.json, Entwuerfe, externe Erweiterungen aus dem Vorgaenger-Profil).
const { migrateUserData } = require('./user-data-migration.js');
// 4T-0751 (Epic 3E-0146): Einmal-Entscheidung des Schema-Zustands beim Start,
// damit die Umstellung auf Bernstein nur frische Installationen trifft.
const { COLOR_SCHEMES_KEY, startupSchemeState } = require('../shared/color-schemes.js');

// 4T-0525 (Epic 3E-0095): Erinnerungs-Pruefer (30-Sekunden-Takt auf dem
// Bereichs-Index) und Konfigurations-Normalisierung des Erinnerungs-Kerns.
const { createReminderChecker } = require('./reminder-check.js');
const { normalizeRemindersConfig } = require('../shared/reminders.js');
// 4T-0637 (Epic 3E-0069): Wecker-Pruefer (30-Sekunden-Takt auf der app-weiten
// Wecker-Liste) und das prozessneutrale Wecker-Modell.
const { createAlarmChecker } = require('./alarm-check.js');
const { CLOCK_ALARMS_KEY, disableFiredOnceAlarms } = require('../shared/clock-alarms.js');
// 4T-0638 (Epic 3E-0069): Timer-Pruefer (gezielter Weckruf auf den naechsten
// Ablauf statt Polling) und das prozessneutrale Timer-Modell.
const { createTimerChecker } = require('./timer-check.js');
const { CLOCK_TIMERS_KEY } = require('../shared/clock-timers.js');
// 4T-0213 (Epic 3E-0042): Seiten-Registry des Handbuchs — Whitelist fuer
// den generischen Seiten-Loader help:getManualPage.
const { MANUAL_PAGES, manualPageById } = require('../shared/manual-pages');
// 4T-0303 (Epic 3E-0054): PDF-Export — Abbildung der Export-Einstellungen
// (export.pdf.*) auf printToPDF-Optionen (electron-frei, unit-testbar).
const { printToPdfOptions } = require('../shared/pdf-options');
// 4T-0298 (Epic 3E-0053): externe Erweiterungs-Pakete unter
// <userData>/extensions — Scan, Quelltext-Zugriff (ID-Whitelist) und
// Entfernen; die Dialoge (Warn-/Entfernen-Bestaetigung) laufen hier im
// Main lokalisiert ueber tForWindow.
const {
  scanExtensionsRoot,
  readMarkdownPluginSource,
  externalExtensionInfo,
  removeExtensionDirectory,
} = require('./extension-packages');

// 4T-0318 (Epic 3E-0057): logische Applikationen — jedes Fenster gehoert zu
// genau einer App; Nummerierung und Titel-Infos kommen aus der Registry.
const { createAppRegistry } = require('./app-registry');
// 4T-0320 (Epic 3E-0057): Sitzungs-Schema ueber Apps (Migration des flachen
// Bestands-Formats, defensive Normalisierung beim Restore).
const {
  migrateWindowsToApps,
  normalizeSavedApps,
  normalizeSavedWorkspaces,
} = require('./session-schema');
// 4T-0537 (Epic 3E-0098): Arbeitsbereichs-Farben aus der geteilten
// Acht-Farben-Palette der Tab-Gruppen.
const { TAB_GROUP_COLOR_KEYS } = require('../shared/tab-group-colors');
// 4T-0368 (Epic 3E-0068): Entwurfs-Zwischenspeicher — reine Zuordnungs-/
// Manifest-Logik (Datei-I/O unter <userData>/drafts bleibt hier in main.js).
const { normalizeManifest, findOrphans, assignDraftsToApps } = require('./draft-store');
// 4T-0322 (Epic 3E-0058): Bereichs-Pfad-Logik — die eine Innerhalb-Pruefung
// aller Bereichs-Grenzen plus Bereichs-Objekt aus dem Wurzelpfad.
const {
  isSamePath,
  isInsideArea,
  areaFromRootPath,
  updatedRecentAreas,
  sortedAreaListing,
  sanitizeNewFileName,
} = require('./area-path');
// 4T-0331 (Epic 3E-0060): Dokument-Historie — Kern der .mdd-Protokollierung
// (Container-Format, Delta-Pakete, Anker, Hash-Abgleich). Electron- und
// IO-frei; Datei-Zugriff und Fenster-Hinweise bleiben hier in main.js.
const mddStore = require('./mdd-store');
// 4T-0619 (Epic 3E-0117): Kennzahlen-Erhebung des Bereichs (Index-Anteil
// plus ergaenzender Ordner-Scan).
const { collectAreaStats } = require('./area-stats');
// 4T-0615 (Epic 3E-0116): Bereichs-Suchraum — Volltext-Suche ueber alle
// Markdown-Dateien des Bereichs, mit Speicher-Vorrat und Cache im
// Nutzerdaten-Verzeichnis.
const {
  konfiguriereBereichsSuche,
  sucheImBereich,
  gibBereichsVorratFrei,
} = require('./area-search');
// 4T-0363 (Epic 3E-0067): strenge Anker-ID-Validierung fuer die Block-
// Metadaten-IPC (gemeinsame, prozess-neutrale Quelle).
const { isValidBlockAnchorId } = require('../shared/block-anchors');
// 4T-0352 (Epic 3E-0064): stille Einmal-Migration der Bereichsdatei
// (.mddb -> .mdda) mit injizierten IO-deps, damit die Faelle unit-testbar sind.
const { readAreaSettingsRaw } = require('./area-migration');
// 4T-0424 (Epic 3E-0080): Vorlagen-Quellen — Aufloesung des Vorlagen-Ordners
// (Bereich vor global, vollstaendige Uebersteuerung), Pfad-Sicherung und
// Anzeige-Eintraege der Auswahl-Liste (electron-frei, unit-getestet).
const {
  normalizeTemplatesConfig,
  resolveTemplatesConfig,
  resolveTemplateFile,
  templateEntryFromRelPath,
  sortedTemplateEntries,
  matchFolderRule,
} = require('./templates');
// 4T-0431 (Epic 3E-0081): Journal-Modell — tolerante Normalisierung der
// journals-Sektion der Bereichsdatei (prozess-neutral, unit-getestet).
const { normalizeJournalsConfig } = require('../shared/journal-core');
// 4T-0543 (Epic 3E-0097): Kalender-Systeme — Normalisierung der
// calendarSystems-Sektion liegt vollstaendig im Kalender-Kern.
const { normalizeCalendarConfig, configForPersist } = require('../shared/calendar-core');
// 4T-0446 (Epic 3E-0083): Eigenschafts-Profile — tolerante Normalisierung der
// propertyProfiles-Sektion der Bereichsdatei (prozess-neutral, unit-getestet).
// 4T-0447: Definitions-Auflösung (Konflikt-Regeln) und Zuordnungs-Feld-
// Auswertung für den Disk-Fallback von profiles:resolve.
const {
  normalizeProfilesConfig,
  resolveProfileFields,
  assignedProfileNames,
  DEFAULT_ASSIGN_FIELD,
} = require('../shared/property-profiles');
// 4T-0625 (Epic 3E-0119): Bereichs-Varianten der Sidebar — tolerante
// Normalisierung der sidebarLayouts-Sektion (prozess-neutral, unit-getestet).
const { normalizeSidebarVariantList } = require('../shared/sidebar-variants');
// 4T-0611 (Epic 3E-0115): Bereichs-Lesezeichen — tolerante Sanitisierung des
// Lesezeichen-Baums (wurzel-relative Ziele) und Sammeln der Roh-Ziel-Pfade
// fuer die Grenz-Pruefung (prozess-neutral, unit-getestet; die harte
// Bereichs-Grenze zieht der Handler zusaetzlich ueber isInsideArea).
const { normalizeBookmarksTree, collectBookmarkFilePaths } = require('../shared/bookmark-tree');
// 4T-0515 (Epic 3E-0092): Ereignis-Aggregation — Profil-Name der
// Grundmenge und Frontmatter-Rueckschreiben in nicht geoeffnete Dateien.
const { EVENT_PROFILE_NAME, injectEventProfile } = require('../shared/events-core');
const { writeFrontmatter } = require('../shared/markdown/frontmatter');
// 4T-0447: Profil-Katalog des Profil-Ordners mit mtime-validiertem Cache
// pro Profil-Datei (electron-frei, unit-getestet; fs wird hier gebunden).
const { createProfileCatalogCache, loadProfileCatalog } = require('./profile-catalog');
const profileCatalogCache = createProfileCatalogCache();
// 4T-0332 (Epic 3E-0060): Datei-Ebene der Historisierungs-Schaltung liest
// die YAML-Eigenschaft `history` aus dem Frontmatter des Dokuments.
const { extractFrontmatter } = require('../shared/markdown/frontmatter');
// 4T-0333 (Epic 3E-0060): Umfangs-Angaben (+x/-y Zeilen) der Revisionsliste.
const { countChanges } = require('../shared/line-diff');
// 4T-0375 (Epic 3E-0070): erweiterte Versionsnummer — volle Anzeige-Version
// (X.Y.Z.N) aus der package.json-Version plus der Build-Info.
const { computeFullVersion } = require('../shared/build-version');

// 4T-0375: volle Version aus package.json-Version und Build-Info; fehlende
// oder defekte Build-Info fällt auf die dreiteilige Version zurück.
function fullVersion() {
  let buildInfo = null;
  try {
    buildInfo = require('../shared/build-info.json');
  } catch {
    // Build-Info fehlt oder ist defekt: dreiteilige Version als Fallback.
  }
  return computeFullVersion(app.getVersion(), buildInfo);
}

// 4T-0166: Test-Isolation. E2E-Laeufe setzen SCG_TEST_USER_DATA auf ein
// Temp-Verzeichnis, damit electron-store und Single-Instance-Lock nie das
// echte Nutzer-Profil beruehren. Muss vor requestSingleInstanceLock() und
// vor jedem Store-Zugriff stehen.
if (process.env.SCG_TEST_USER_DATA) {
  app.setPath('userData', process.env.SCG_TEST_USER_DATA);
}

// Single-Instance-Lock: zweite Instanz reicht ihre Datei an die laufende weiter.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Multi-Window-Registry:
//   windows           : Map<webContents.id, BrowserWindow>
//   pendingInitPanes  : Map<webContents.id, panes-Array>
//     Wird beim Erstellen eines Fensters mit Pane-Inhalt gefuellt und beim
//     'did-finish-load' an den Renderer geschickt. Format identisch zum alten
//     'panes'-Settings-Schluessel: [{ paths, activeIndex, tabSettings }].
//   lastFocusedId     : id des zuletzt fokussierten Fensters (fuer second-instance-Routing)
//   isQuitting        : true ab 'before-quit', damit Window-Close-Handler in
//     dieser Phase NICHT die Persistenz veraendern (sonst wuerde das erste
//     schliessende Fenster die anderen aus der Sitzung loeschen).
const windows = new Map();
const pendingInitPanes = new Map();
// 4T-0368: pro Fenster die beim Start zugeteilten Entwuerfe (Unbenannt-Tabs
// mit Inhalt), analog pendingInitPanes; via window:initialState ausgeliefert.
const pendingInitDrafts = new Map();
let lastFocusedId = null;
let isQuitting = false;

// 4T-0318: App-Registry — Zuordnung Fenster -> logische Applikation.
const appRegistry = createAppRegistry();

let store = null; // electron-store, asynchron geladen (ESM-only)

// File-Watcher pro Datei mit Refcounting ueber Fenster-IDs.
//   filePath -> { watcher, owners: Set<webContents.id> }
const watchers = new Map();

// Pfade, die wir gerade selbst schreiben (Save bzw. Auto-Save). Der Watcher
// soll nach dem Eigen-Schreiben keinen Change-Event an den Renderer melden,
// damit kein selbst ausgeloester Reload-Loop entsteht.
// M-15 (4T-0173): Statt einer pauschalen Zeitsperre wird der geschriebene
// Inhalt als Hash gemerkt. Der Watcher unterdrueckt nur Events, deren
// Datei-Stand dem Eigen-Schreiben entspricht; eine echte externe Aenderung
// im Zeitfenster (z.B. direkt nach Blur-Auto-Save) laeuft durch und erreicht
// den Konflikt-Dialog-Pfad.
//   filePath -> { timer, hash }
const selfWritingPaths = new Map();

function hashContent(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function markSelfWriting(filePath, content, durationMs = 1500) {
  const existing = selfWritingPaths.get(filePath);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => selfWritingPaths.delete(filePath), durationMs);
  selfWritingPaths.set(filePath, { timer, hash: hashContent(content) });
}

// Liefert true, wenn der aktuelle Datei-Stand dem zuletzt selbst
// geschriebenen entspricht (Event unterdruecken); false bei abweichendem
// Inhalt oder Lesefehler (Event durchlassen bzw. unlink-Pfad greift).
async function isOwnWriteState(filePath) {
  const entry = selfWritingPaths.get(filePath);
  if (!entry) return false;
  try {
    const current = await fs.readFile(filePath, 'utf8');
    return hashContent(current) === entry.hash;
  } catch {
    return false;
  }
}

// --- 4T-0331 (Epic 3E-0060): Dokument-Historie (.mdd) -------------------------

// Offene Aenderungspakete pro Dokument (In-Memory; Schluessel = normalisierter
// Pfad). Die Zeitfenster-Entscheidung (max. Paket-Dauer, Inaktivitaets-
// Schluss) faellt beim naechsten Speichern in mdd-store.recordSave; es
// laufen keine Timer.
const mddOpenPackets = new Map();
// Dokumente mit defekter .mdd: Protokollierung bis zum App-Neustart
// ausgesetzt, Hinweis an das ausloesende Fenster einmalig. Die defekte
// Datei wird nie ueberschrieben.
const mddSuspendedPaths = new Set();

function isMddPath(p) {
  if (!p) return false;
  const ext = path.extname(p).toLowerCase();
  return ext === '.mdd' || ext === '.mdda' || ext === '.mddb';
}

// Begleitdatei zum Dokument: gleicher Basisname, Endung .mdd (PO-Konzept).
function mddPathFor(mdPath) {
  const parsed = path.parse(mdPath);
  return path.join(parsed.dir, `${parsed.name}.mdd`);
}

function mddKeyOf(p) {
  return path.resolve(p).toLowerCase();
}

// 4T-0332: Bereichs-Default aus der Bereichsdatei Area_Settings.mdda im
// Bereichs-Wurzelordner. undefined = kein Default gesetzt (erben); eine
// defekte Bereichsdatei wirkt wie nicht gesetzt (und wird nie ueberschrieben,
// der Schreib-Pfad in history:setAreaDefault lehnt dann ab). 4T-0352 (Epic
// 3E-0064): das Lesen migriert eine vorhandene Alt-Datei .mddb still auf .mdda.
async function readAreaHistoryDefault(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  const value = parsed.container.settings.history;
  return typeof value === 'boolean' ? value : undefined;
}

// 4T-0424 (Epic 3E-0080): templates-Sektion der Bereichsdatei lesen.
// undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
// nicht konfiguriert; die Normalisierung uebernimmt resolveTemplatesConfig).
// Das Lesen laeuft ueber denselben Migrations-Pfad wie der Historien-Default.
async function readAreaTemplatesConfig(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  return parsed.container.settings.templates;
}

// 4T-0431 (Epic 3E-0081): journals-Sektion der Bereichsdatei lesen.
// undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
// nicht konfiguriert; die Normalisierung uebernimmt normalizeJournalsConfig).
// Gleicher Migrations-Lese-Pfad wie Historien-Default und templates-Sektion;
// eine defekte Bereichsdatei setzt nur die Journal-Funktion aus.
async function readAreaJournalsConfig(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  return parsed.container.settings.journals;
}

// 4T-0446 (Epic 3E-0083): propertyProfiles-Sektion der Bereichsdatei lesen.
// undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
// nicht konfiguriert; die Normalisierung übernimmt normalizeProfilesConfig).
// Gleicher Migrations-Lese-Pfad wie Historien-Default und templates-Sektion;
// eine defekte Bereichsdatei setzt nur die Profil-Funktion aus.
async function readAreaProfilesConfig(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  return parsed.container.settings.propertyProfiles;
}

// 4T-0543 (Epic 3E-0097): calendarSystems-Sektion der Bereichsdatei lesen.
// undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
// nicht konfiguriert; die Normalisierung uebernimmt normalizeCalendarConfig).
// Gleicher Migrations-Lese-Pfad wie Historien-Default und templates-Sektion;
// eine defekte Bereichsdatei setzt nur die Kalender-Funktion aus.
async function readAreaCalendarConfig(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  return parsed.container.settings.calendarSystems;
}

// 4T-0625 (Epic 3E-0119): sidebarLayouts-Sektion der Bereichsdatei lesen
// (Bereichs-Varianten der Sidebar). undefined = keine Sektion oder
// Bereichsdatei fehlt/ist defekt (wirkt wie keine Bereichs-Varianten);
// die Normalisierung übernimmt normalizeSidebarVariantList.
async function readAreaSidebarVariantsConfig(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  return parsed.container.settings.sidebarLayouts;
}

// 4T-0611 (Epic 3E-0115): bookmarks-Sektion der Bereichsdatei lesen
// (Bereichs-Lesezeichen). undefined = keine Sektion oder Bereichsdatei
// fehlt/ist defekt (wirkt wie keine Bereichs-Lesezeichen); die
// Sanitisierung uebernimmt normalizeBookmarksTree. Gleicher Migrations-
// Lese-Pfad wie die uebrigen Sektionen.
async function readAreaBookmarksConfig(rootPath) {
  const raw = await readAreaSettingsRaw({
    mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
    mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    readFile: (p) => fs.readFile(p, 'utf8'),
    rename: (from, to) => fs.rename(from, to),
    markSelfWriting,
  });
  if (raw === undefined) return undefined;
  const parsed = mddStore.parseSettingsContainer(raw);
  if (!parsed.ok) return undefined;
  return parsed.container.settings.bookmarks;
}

// 4T-0424: wirksame Vorlagen-Konfiguration eines Fensters. Bereichs-Sektion
// (falls das Fenster einen Bereich hat) uebersteuert die globalen
// Einstellungs-Werte vollstaendig; Details in src/main/templates.js.
async function resolveTemplatesForWindow(win) {
  const area = areaOfWindow(win);
  const areaConfig = area ? await readAreaTemplatesConfig(area.rootPath) : undefined;
  return resolveTemplatesConfig({
    areaRootPath: area ? area.rootPath : null,
    areaConfig,
    globalConfig: {
      folder: store ? store.get('templates.folder') : null,
      rules: store ? store.get('templates.rules') : null,
    },
  });
}

// Wirksame Historisierung fuer ein Dokument (4T-0332): die eine Aufloesung
// der Drei-Ebenen-Schaltung. Datei-Ebene aus dem YAML des Inhalts, Bereichs-
// Ebene aus der Bereichsdatei (nur wenn das Dokument im Bereich des Fensters
// liegt), App-Ebene aus dem Store. Liefert { effective, source }.
async function resolveHistoryFor(owner, absolute, content) {
  let fileValue;
  const fm = extractFrontmatter(String(content || ''));
  if (fm && fm.data && typeof fm.data.history === 'boolean') fileValue = fm.data.history;
  let areaValue;
  if (fileValue === undefined) {
    const area = areaOfWindow(owner);
    if (area && absolute && isInsideArea(area.rootPath, absolute)) {
      areaValue = await readAreaHistoryDefault(area.rootPath);
    }
  }
  return mddStore.resolveHistoryEnabled({
    fileValue,
    areaValue,
    appValue: !!(store && store.get('historyEnabled')),
  });
}

function historyTimingMs() {
  const maxMin = Number(store && store.get('historyMaxPacketMinutes')) || 5;
  const inactMin = Number(store && store.get('historyInactivityMinutes')) || 2;
  return { maxPacketMs: maxMin * 60_000, inactivityMs: inactMin * 60_000 };
}

// Datei-Stand vor dem Ueberschreiben (Basis des Deltas und Eingang des
// Hash-Abgleichs), BOM-/LF-normalisiert symmetrisch zu file:read.
// null = Datei existiert noch nicht (neues Dokument).
async function readPreviousTextFor(absolute) {
  try {
    const raw = await fs.readFile(absolute, 'utf8');
    return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

// 4T-0345 (Epic 3E-0062): Suchraum fuer das Link-Update beim Umbenennen. In
// einer Bereichs-App der gesamte Bereichs-Baum (ohne Tiefen-Grenze), sonst der
// Ordner der Ankerdatei plus zwei Unterordner-Ebenen wie der Backlinks-Scan.
// Ignore-Regeln (node_modules, Punkt-Ordner) identisch. Der Index-Vorfilter als
// Beschleunigung folgt mit dem bereichsweiten Index (4T-0347); hier deckt der
// Voll-Scan den Suchraum verlaesslich ab.
async function collectMarkdownFilesInScope(owner, anchorAbsolute) {
  const area = areaOfWindow(owner);
  let rootDir;
  let maxDepth;
  if (area && area.rootPath && isInsideArea(area.rootPath, anchorAbsolute)) {
    rootDir = area.rootPath;
    maxDepth = Infinity;
  } else {
    rootDir = path.dirname(anchorAbsolute);
    maxDepth = 2;
  }
  const out = [];
  const queue = [{ dir: rootDir, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        if (depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && isMarkdownPath(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

// 4T-0345 (Epic 3E-0062): Rename-Paare (from/to absolut) in die renames-Form des
// Rewrite-Kerns bringen (logischer Basename ohne Endung plus absolute Pfade).
function renamesFromPairs(pairs) {
  return pairs.map((p) => ({
    oldBase: path.parse(p.from).name,
    newBase: path.parse(p.to).name,
    oldAbs: p.from,
    newAbs: p.to,
  }));
}

// 4T-0345 (Epic 3E-0062): eingehende Links auf alle umbenannten Dateien (pairs)
// im Suchraum anpassen. Pro Kandidat frisch geparst; EOL/BOM des Original-Stands
// bleiben erhalten (kein stilles Normalisieren fremder Dateien). Historisierung
// wie beim regulaeren Speichern (Aufloesung Datei > Bereich > App), previousText
// und newText LF-normalisiert symmetrisch zu file:read. Ein Fehler pro Datei
// stoppt den Lauf nicht (Best-Effort, der Linter bleibt das Netz). `anchorNew`
// ist der neue Pfad der Hauptdatei (Suchraum-Anker). Liefert
// { updated:[{path,count}], failed:[{path,error}] }.
async function applyLinkUpdatesForRename(owner, pairs, anchorNew) {
  const renames = renamesFromPairs(pairs);
  const candidates = await collectMarkdownFilesInScope(owner, anchorNew);
  const updated = [];
  const failed = [];
  for (const filePath of candidates) {
    let result;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      result = computeLinkRewrites(raw, { renames, contextPath: filePath });
    } catch (err) {
      failed.push({ path: filePath, error: err && err.message ? err.message : String(err) });
      continue;
    }
    if (!result.changed) continue;
    try {
      const recordHistory = (await resolveHistoryFor(owner, filePath, result.newContent)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
      markSelfWriting(filePath, result.newContent);
      await fs.writeFile(filePath, result.newContent, { encoding: 'utf8' });
      if (recordHistory) {
        const newTextNorm = result.newContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      updated.push({ path: filePath, count: result.hits.length });
    } catch (err) {
      failed.push({ path: filePath, error: err && err.message ? err.message : String(err) });
    }
  }
  return { updated, failed };
}

// 4T-0345 (Epic 3E-0062): Dry-Run fuer die Vorschau (4T-0346). Ermittelt pro
// Kandidat die Trefferzahl ohne zu schreiben. `pairs` sind die geplanten
// Umbenennungen; die alten Dateien existieren zum Vorschau-Zeitpunkt noch,
// deshalb ist der Suchraum-Anker der alte Pfad.
async function computeLinkUpdatePreview(owner, pairs, anchorAbsolute) {
  const renames = renamesFromPairs(pairs);
  const candidates = await collectMarkdownFilesInScope(owner, anchorAbsolute);
  const items = [];
  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const result = computeLinkRewrites(raw, { renames, contextPath: filePath });
      if (result.changed) items.push({ path: filePath, count: result.hits.length });
    } catch {
      /* Lesefehler ueberspringen; die Vorschau ist Best-Effort */
    }
  }
  return items;
}

// Protokolliert eine Speicherung in der .mdd. Schreib-Reihenfolge der
// Epic-Entscheidung: erst .md (Aufrufer), dann .mdd (hier). Fehler der
// Historie lassen das Speichern selbst nie scheitern; eine defekte .mdd
// setzt die Protokollierung fuer das Dokument aus statt sie zu
// ueberschreiben.
async function recordMddOnSave(owner, absolute, previousText, newText) {
  const key = mddKeyOf(absolute);
  if (mddSuspendedPaths.has(key)) return;
  const mddPath = mddPathFor(absolute);
  try {
    let container = mddStore.emptyContainer();
    let raw = null;
    try {
      raw = await fs.readFile(mddPath, 'utf8');
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err;
    }
    if (raw !== null) {
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) {
        mddSuspendedPaths.add(key);
        notifyMddDefect(owner, absolute, parsed.error);
        return;
      }
      container = parsed.container;
    }
    const result = mddStore.recordSave(container, {
      previousText,
      newText,
      nowMs: Date.now(),
      openPacket: mddOpenPackets.get(key) || null,
      ...historyTimingMs(),
    });
    if (result.openPacket) mddOpenPackets.set(key, result.openPacket);
    else mddOpenPackets.delete(key);
    if (result.changed) {
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddPath, serialized);
      await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
    }
  } catch (err) {
    // Unerwarteter Fehler (IO, defekte Delta-Kette): aussetzen statt bei
    // jedem Speichern erneut fehlzuschlagen. Das Dokument selbst ist zu
    // diesem Zeitpunkt bereits gespeichert.
    mddSuspendedPaths.add(key);
    notifyMddDefect(owner, absolute, err && err.message ? err.message : String(err));
  }
}

function notifyMddDefect(owner, absolute, detail) {
  console.error('[mdd] Protokollierung ausgesetzt fuer', absolute, '—', detail);
  if (owner && !owner.isDestroyed()) {
    owner.webContents.send('mdd:defect', { path: absolute });
  }
}

// Hash-Abgleich beim Oeffnen: eine Fremd-Aenderung seit der letzten
// Protokollierung wird sofort als external-Paket festgehalten, nicht erst
// beim naechsten Speichern. Idempotent bei passendem Stand; ohne .mdd gibt
// es nichts abzugleichen.
async function recordMddExternalOnOpen(owner, absolute, currentText) {
  const key = mddKeyOf(absolute);
  if (mddSuspendedPaths.has(key)) return;
  const mddPath = mddPathFor(absolute);
  try {
    let raw;
    try {
      raw = await fs.readFile(mddPath, 'utf8');
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err;
      return;
    }
    const parsed = mddStore.parseContainer(raw);
    if (!parsed.ok) {
      mddSuspendedPaths.add(key);
      notifyMddDefect(owner, absolute, parsed.error);
      return;
    }
    if (mddStore.recordExternalIfNeeded(parsed.container, currentText, Date.now())) {
      mddOpenPackets.delete(key);
      const serialized = mddStore.serializeContainer(parsed.container);
      markSelfWriting(mddPath, serialized);
      await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
    }
  } catch (err) {
    mddSuspendedPaths.add(key);
    notifyMddDefect(owner, absolute, err && err.message ? err.message : String(err));
  }
}

// --- 4T-0363 (Epic 3E-0067): Block-Metadaten (blockData-Sektion der .mdd) -----
// Muster des Notiz-Datenpfads (note:read/note:write): Lesen ist idempotent und
// setzt bei defekter .mdd nichts aus; Schreiben legt die .mdd bei Bedarf an,
// respektiert mddSuspendedPaths und broadcastet 'blockData:changed' fuer die
// Mehrfenster-Synchronisation. Der Anker-Abgleich (aktiv vs. verwaist) passiert
// im Renderer gegen den Live-Editor-Text; Main liefert die rohe Anker->Daten-Map.

// Saeubert das ueber IPC eingehende values-Objekt: nur string/number/boolean und
// String-Arrays (multistring). Verschachtelte Objekte und nicht-stringbare
// Array-Elemente werden verworfen — konsistent zur Abfragbarkeit der Frontmatter-
// Properties (extractProperties in backlinks.js). Werte bleiben typ-erhaltend,
// damit die Renderer-Inferenz den Typ ableitet (keine Typ-Persistenz).
function sanitizeBlockValues(values) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) return {};
  const out = {};
  for (const key of Object.keys(values)) {
    const v = values[key];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    } else if (Array.isArray(v)) {
      out[key] = v.filter((x) => typeof x === 'string');
    }
  }
  return out;
}

// Gemeinsamer Schreib-Pfad fuer blockData:write/rename: .mdd lesen bzw. leer
// anlegen, Mutation anwenden, serialisieren, selbst-markiert schreiben,
// 'blockData:changed' broadcasten. Fehler-Prinzip exakt wie note:write: eine
// defekte .mdd setzt die Funktion aus (mddSuspendedPaths) und wird nie
// ueberschrieben; ein transienter Schreibfehler meldet nur den Fehler.
async function writeBlockDataMutation(event, filePath, mutate) {
  const owner = senderWindow(event);
  const absolute = path.resolve(filePath);
  const key = mddKeyOf(absolute);
  if (mddSuspendedPaths.has(key)) return { ok: false, error: 'suspended' };
  const mddPath = mddPathFor(absolute);
  try {
    let container = mddStore.emptyContainer();
    let raw = null;
    try {
      raw = await fs.readFile(mddPath, 'utf8');
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err;
    }
    if (raw !== null) {
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) {
        mddSuspendedPaths.add(key);
        notifyMddDefect(owner, absolute, parsed.error);
        return { ok: false, error: parsed.error };
      }
      container = parsed.container;
    }
    mutate(container);
    const serialized = mddStore.serializeContainer(container);
    markSelfWriting(mddPath, serialized);
    await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
    const blockData = mddStore.getAllBlockData(container);
    // 4T-0408 (Epic 3E-0077): Block-Ebene des Abfrage-Index nachziehen — die
    // .mdd liegt ausserhalb des Markdown-Watchers, dieser Schreibpfad ist ihr
    // Invalidierungs-Weg (loest den backlinks:invalidated-Broadcast aus, der
    // sichtbare Abfrage-Container neu befuellt).
    backlinks.updateBlockDataForFile(absolute, blockData);
    broadcast('blockData:changed', { path: absolute, blockData });
    return { ok: true, blockData };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Fenster, die der Nutzer im Renderer schon abgenickt hat ("Speichern" /
// "Verwerfen" bei dirtigen Tabs). Verhindert, dass der on('close')-Hook den
// Dialog ein zweites Mal aufruft beim folgenden win.close().
const confirmedClosings = new Set();

// --- Arbeitsbereiche (4T-0537, Epic 3E-0098) ---------------------------------
// In-Memory-Stand des Store-Keys 'workspaces' (Quelle der Wahrheit zur
// Laufzeit; in loadStore normalisiert geladen). persistAllWindows schreibt
// 'apps' und 'workspaces' in EINEM store.set-Aufruf (ein Dateischreibvorgang),
// damit der Wechsel einer App zwischen beiden Keys (benennen, degradieren)
// bei Absturz nie einen doppelten oder verlorenen Eintrag hinterlaesst.
let workspacesState = [];

// Zuletzt fokussiertes Fenster pro App — Ziel fuer "erneutes Oeffnen
// fokussiert" (Workshop-Punkt 3: Fokus aufs zuletzt aktive Fenster).
const appLastFocused = new Map(); // appId -> windowId

// UTC-Zeitstempel sekundengenau (Zeitstempel-Konvention, Muster drafts).
function utcNowSeconds() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// --- Settings ----------------------------------------------------------------

// Nutzerdaten-Migration beim Rebranding (4T-0643): Logik prozess-neutral in
// user-data-migration.js, damit die Unit-Tests denselben Pfad pruefen. Hier nur
// die Bindung an die Electron-Pfade.
async function migrateSettingsFromPreviousName() {
  await migrateUserData({
    appDataDir: app.getPath('appData'),
    userDataDir: app.getPath('userData'),
  });
}

async function loadStore() {
  await migrateSettingsFromPreviousName();
  // electron-store v10 ist ESM-only, daher dynamic import.
  const { default: Store } = await import('electron-store');
  store = new Store({
    defaults: {
      restoreSession: true,
      apps: [], // Sitzung ueber logische Applikationen (4T-0320)
      workspaces: [], // benannte Arbeitsbereiche (4T-0537, Epic 3E-0098)
      windows: [], // Legacy: flache Multi-Window-Sitzung (Lese-Fallback)
      recentFiles: [],
      recentAreas: [], // zuletzt geoeffnete Bereiche (4T-0325)
      // 4T-0751 (Epic 3E-0146): Englisch ist der Auslieferungszustand.
      // conf materialisiert die Defaults schon bei der Store-Konstruktion,
      // deshalb wirkt dieser Wert ausschliesslich fuer frische Staende;
      // bestehende Installationen tragen ihr persistiertes null weiter und
      // leiten unveraendert aus der Windows-Locale ab (Entscheidung des
      // Product Owners vom 2026-07-27: nur frische Installationen).
      language: 'en',
      // 4T-0030: Theme-Vorzug. 'system' folgt der OS-Einstellung
      // (bisheriges Verhalten), 'light'/'dark' erzwingt das jeweilige Theme.
      themePref: 'system',
      // 4T-0207: User-Overrides der Tastenkuerzel als flaches Objekt
      // { commandId: acceleratorString }; leer = ueberall Registry-Defaults.
      hotkeys: {},
      // 4T-0331 (Epic 3E-0060): Dokument-Historie. App-weiter Default ist
      // bewusst aus (PO-Entscheidung vom 2026-07-03); die Zeitparameter der
      // Paket-Bildung in Minuten (max. Paket-Dauer, Inaktivitaets-Schluss).
      historyEnabled: false,
      historyMaxPacketMinutes: 5,
      historyInactivityMinutes: 2,
      // 4T-0346 (Epic 3E-0062): Link-Update beim Umbenennen. Beide Standard-
      // Werte aktiv (PO-Anforderung), per Einstellung im Bereich Verhalten
      // umstellbar.
      renameUpdateLinks: true,
      renameLinkPreview: true,
      // 4T-0369 (Epic 3E-0068): Entwurfs-Zwischenspeicher — nie gespeicherte
      // Unbenannt-Tabs ueberleben das App-Ende. Default an.
      keepUnsavedDrafts: true,
      // Legacy-Defaults bleiben fuer Migration verwertbar:
      openTabs: [],
      panes: null,
      windowBounds: null,
      windowMaximized: false,
    },
  });
  migrateLegacySettings();
  // 4T-0320: flaches 'windows'-Format einmalig in das App-Schema ueberfuehren
  // (alle Bestands-Fenster als EINE Applikation); der alte Key bleibt
  // defensiv erhalten, wird aber nicht mehr geschrieben.
  const migratedApps = migrateWindowsToApps(store.get('apps'), store.get('windows'));
  if (migratedApps) store.set('apps', migratedApps);
  // 4T-0537: Arbeitsbereichs-Ablage normalisiert in den In-Memory-Stand laden.
  workspacesState = normalizeSavedWorkspaces(store.get('workspaces'));
  applyStartupSchemeState();
}

// 4T-0751 (Epic 3E-0146): Steht noch kein Schema-Zustand im Store, wird er
// hier einmalig geschrieben — bestehende Installationen auf die bisherigen
// Standard-Schemas, frische auf die neue Bernstein-Voreinstellung. Die
// Begruendung samt der Falle, die das unbedingte Schreiben abfaengt, steht
// bei startupSchemeState in shared/color-schemes.js.
//
// Laeuft NACH den beiden Migrationen oben: Ein Bestand mit Alt-Schluesseln
// traegt seine Spuren dann bereits im aktuellen Format.
function applyStartupSchemeState() {
  if (!store) return;
  const next = startupSchemeState({
    hasStoredState: store.get(COLOR_SCHEMES_KEY) != null,
    hasUsageTraces: hasStoreUsageTraces(),
  });
  if (next) store.set(COLOR_SCHEMES_KEY, next);
}

// Spuren frueherer Nutzung im Store: geoeffnete Dateien, Bereiche, Sitzungen
// und benannte Arbeitsbereiche. Eine frische Installation hat beim ersten
// Start keine davon.
function hasStoreUsageTraces() {
  return ['recentFiles', 'recentAreas', 'apps', 'workspaces', 'windows'].some((key) => {
    const value = store.get(key);
    return Array.isArray(value) && value.length > 0;
  });
}

// Migration alter Single-Window-Settings auf die neue Multi-Window-Struktur.
// Wirkt nur, wenn 'windows' noch leer ist und alte Schluessel vorhanden sind.
function migrateLegacySettings() {
  if (!store) return;
  const existing = store.get('windows');
  if (Array.isArray(existing) && existing.length > 0) return;

  const legacyPanes = store.get('panes');
  const legacyOpenTabs = store.get('openTabs');
  const legacyBounds = store.get('windowBounds');
  const legacyMaximized = !!store.get('windowMaximized');

  let panes = null;
  if (Array.isArray(legacyPanes) && legacyPanes.length > 0) {
    panes = legacyPanes;
  } else if (Array.isArray(legacyOpenTabs) && legacyOpenTabs.length > 0) {
    panes = [{ paths: legacyOpenTabs, activeIndex: 0, tabSettings: [] }];
  }

  // Wenn weder Bounds noch Panes vorhanden, gibt es nichts zu migrieren.
  if (!panes && !legacyBounds) return;

  store.set('windows', [
    {
      bounds: legacyBounds || null,
      maximized: legacyMaximized,
      panes: panes || [],
    },
  ]);
}

// --- Hilfsfunktionen ---------------------------------------------------------

function isMarkdownPath(p) {
  if (!p) return false;
  const ext = path.extname(p).toLowerCase();
  return ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd';
}

// Extrahiert Datei-Argumente aus process.argv (Windows: "Öffnen mit").
// M-03 (4T-0173): optionale Resolve-Basis. second-instance liefert das
// Arbeitsverzeichnis der ZWEITEN Instanz mit; ohne Basis wuerden relative
// CLI-Pfade gegen das CWD der ersten Instanz aufgeloest (falsche Datei).
function extractFileArgs(argv, baseDir) {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('--') && !a.startsWith('-'))
    .map((a) => (baseDir ? path.resolve(baseDir, a) : path.resolve(a)))
    .filter(isMarkdownPath);
}

function pushRecent(filePath) {
  if (!store) return;
  const recent = store.get('recentFiles', []);
  const filtered = recent.filter((p) => p !== filePath);
  filtered.unshift(filePath);
  store.set('recentFiles', filtered.slice(0, 10));
  applyMenuToAllWindows();
}

// Liefert das aktuell „relevante" Fenster (zuletzt fokussiert, fallback: irgendeins).
function getActiveWindow() {
  if (lastFocusedId && windows.has(lastFocusedId)) return windows.get(lastFocusedId);
  const first = windows.values().next();
  return first.done ? null : first.value;
}

// 4T-0323 (Epic 3E-0058): Datei-Argumente aus Explorer/CLI landen immer in
// einer Applikation OHNE Bereich (Bereiche sind fix und werden nur innerhalb
// der Applikation bedient): bevorzugt das zuletzt fokussierte bereichslose
// Fenster, sonst irgendein bereichsloses; null, wenn nur Bereichs-Apps laufen.
function getActiveNonAreaWindow() {
  const last = lastFocusedId != null ? windows.get(lastFocusedId) : null;
  if (last && !last.isDestroyed() && !areaOfWindow(last)) return last;
  for (const win of windows.values()) {
    if (!win.isDestroyed() && !areaOfWindow(win)) return win;
  }
  return null;
}

// Broadcast an alle aktiven Fenster.
function broadcast(channel, ...args) {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  }
  // 4T-0525 (Epic 3E-0095): eine Index-Invalidierung stoesst zusaetzlich
  // einen Erinnerungs-Pruef-Lauf an — der Nachhol-Dialog erscheint damit
  // direkt nach dem Index-Aufbau statt erst mit dem naechsten 30-Sekunden-
  // Takt (der Lauf ist durch die ⏰-Vorpruefung billig und im Index-Fluss
  // bereits 200 ms debounced).
  if (channel === 'backlinks:invalidated' && reminderChecker) reminderChecker.tick();
}

// 4T-0015: Backlinks-Modul mit dem Broadcast verdrahten, damit watcher-
// getriebene Aenderungen alle Fenster erreichen.
backlinks.attachBroadcast(broadcast);
// 4T-0348 (Epic 3E-0062): markSelfWriting an den Bereichs-Index-Cache reichen,
// damit das Schreiben von Area_Cache.mdda nicht als Fremd-Aenderung zaehlt.
backlinks.attachSelfWriter(markSelfWriting);

// 4T-0525 (Epic 3E-0095): Erinnerungs-Pruefer. Die Umgebung wird pro Lauf
// frisch aus dem Store gebaut (Muster frontmatterQuery:run) — Einstellungs-
// und Erweiterungs-Aenderungen wirken ohne eigenen Listener sofort.
// Doppel-Gate tasks UND reminders: robust unabhaengig davon, ob die
// Erweiterungs-Registrierung (4T-0528) schon ausgeliefert ist.
const reminderChecker = createReminderChecker({
  areas() {
    const roots = new Set();
    for (const appId of appRegistry.appIds()) {
      const area = appRegistry.getArea(appId);
      if (area && area.rootPath) roots.add(area.rootPath);
    }
    return [...roots].map((root) => ({ root }));
  },
  taskLines: (root) => backlinks.areaTaskLines(root),
  buildEnv() {
    const disabled = store ? store.get('extensions.disabled') : [];
    const tasksConfig = store ? store.get('tasksConfig') : null;
    const remindersConfig = normalizeRemindersConfig(store ? store.get('remindersConfig') : null);
    return {
      enabled: isExtensionEnabled('tasks', disabled) && isExtensionEnabled('reminders', disabled),
      globalFilter:
        tasksConfig && typeof tasksConfig.globalFilter === 'string'
          ? tasksConfig.globalFilter.trim()
          : '',
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
      defaultTime: remindersConfig.defaultTime,
    };
  },
  // Zustellung an das Ziel-Fenster der Bereichs-App: das fokussierte,
  // sonst das erste lebende Fenster (Dialog-Anzeige gehoert in genau ein
  // Fenster; Muster second-instance).
  send(root, channel, payload) {
    const appId = appRegistry.findAppByArea((area) => area.rootPath === root);
    if (appId == null) return;
    let target = null;
    for (const windowId of appRegistry.windowsOf(appId)) {
      const win = windows.get(windowId);
      if (!win || win.isDestroyed()) continue;
      if (!target) target = win;
      if (win.isFocused()) target = win;
    }
    if (target) target.webContents.send(channel, payload);
  },
  now: () => new Date(),
});

// 4T-0637 (Epic 3E-0069): Wecker-Pruefer. Anders als die Erinnerungen sind
// Wecker app-weit (kein Bereich, keine Datei), deshalb entfaellt hier die
// Bereichs-Aufzaehlung und die Meldung geht an genau EIN Fenster — sonst
// erschiene derselbe Wecker in jedem offenen Fenster.
const alarmChecker = createAlarmChecker({
  alarms: () => (store ? store.get(CLOCK_ALARMS_KEY) : []),
  enabled: () => isExtensionEnabled('clock', store ? store.get('extensions.disabled') : []),
  // Ziel-Fenster: das fokussierte, sonst das erste lebende (Muster des
  // Erinnerungs-Pruefers, nur ohne Bereichs-Bindung).
  send(payload) {
    let target = null;
    for (const win of windows.values()) {
      if (!win || win.isDestroyed()) continue;
      if (!target) target = win;
      if (win.isFocused()) target = win;
    }
    if (target) target.webContents.send('alarm:due', payload);
  },
  // Ein einmaliger Wecker schaltet sich nach dem Ausloesen selbst ab. Der
  // Store-Schreibvorgang laeuft ueber denselben Broadcast-Weg wie eine
  // Aenderung aus der Oberflaeche, damit offene Fenster die Liste nachziehen.
  onFired(ids) {
    if (!store) return;
    const current = store.get(CLOCK_ALARMS_KEY);
    const next = disableFiredOnceAlarms(current, new Set(ids));
    if (next === current) return;
    store.set(CLOCK_ALARMS_KEY, next);
    broadcast('clockAlarms:changed', next);
  },
  now: () => new Date(),
});

// 4T-0638 (Epic 3E-0069): Timer-Pruefer. Kein Polling: der naechste Ablauf
// bekommt einen gezielten Weckruf, der bei jeder Listen-Aenderung neu
// gerechnet wird. Das Ziel-Fenster bestimmt derselbe Weg wie beim Wecker.
const timerChecker = createTimerChecker({
  timers: () => (store ? store.get(CLOCK_TIMERS_KEY) : []),
  setTimers(list) {
    if (!store) return;
    store.set(CLOCK_TIMERS_KEY, list);
    broadcast('clockTimers:changed', list);
  },
  enabled: () => isExtensionEnabled('clock', store ? store.get('extensions.disabled') : []),
  send(payload) {
    let target = null;
    for (const win of windows.values()) {
      if (!win || win.isDestroyed()) continue;
      if (!target) target = win;
      if (win.isFocused()) target = win;
    }
    if (target) target.webContents.send('timer:due', payload);
  },
  now: () => Date.now(),
  schedule(fn, delayMs) {
    const t = setTimeout(fn, delayMs);
    // Der Weckruf darf ein Beenden der App nicht aufhalten.
    if (typeof t.unref === 'function') t.unref();
    return t;
  },
  cancel: (handle) => clearTimeout(handle),
});

// --- File-Watching mit Refcounting -------------------------------------------

function watchFile(filePath, ownerId) {
  let entry = watchers.get(filePath);
  if (!entry) {
    const watcher = chokidar.watch(filePath, {
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
      ignoreInitial: true,
    });
    entry = { watcher, owners: new Set() };
    watchers.set(filePath, entry);

    watcher.on('change', async () => {
      // Eigene Schreibvorgaenge nicht als externer Change melden; eine
      // abweichende (echte externe) Aenderung im Self-Writing-Fenster
      // wird durchgelassen (M-15, 4T-0173).
      if (await isOwnWriteState(filePath)) return;
      for (const id of entry.owners) {
        const win = windows.get(id);
        if (win && !win.isDestroyed()) win.webContents.send('file:changed', filePath);
      }
    });
    watcher.on('unlink', () => {
      for (const id of entry.owners) {
        const win = windows.get(id);
        if (win && !win.isDestroyed()) win.webContents.send('file:removed', filePath);
      }
    });
    // W-04 (4T-0309): Watcher-Fehler behandeln (z.B. wegfallendes Netz-
    // laufwerk). Ohne Handler wuerde chokidars EventEmitter ein unbehandeltes
    // 'error'-Event werfen und koennte den Main-Prozess abbrechen; backlinks.js
    // behandelt denselben Fall bereits (B-21).
    watcher.on('error', (err) => {
      console.warn('Datei-Watcher-Fehler:', filePath, err && err.message);
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
      watchers.delete(filePath);
    });
  }
  entry.owners.add(ownerId);
}

async function unwatchFile(filePath, ownerId) {
  const entry = watchers.get(filePath);
  if (!entry) return;
  entry.owners.delete(ownerId);
  if (entry.owners.size === 0) {
    await entry.watcher.close();
    watchers.delete(filePath);
  }
}

async function unwatchAllForOwner(ownerId) {
  const toClose = [];
  for (const [p, entry] of watchers.entries()) {
    if (entry.owners.has(ownerId)) {
      entry.owners.delete(ownerId);
      if (entry.owners.size === 0) toClose.push(p);
    }
  }
  for (const p of toClose) {
    const entry = watchers.get(p);
    if (entry) {
      await entry.watcher.close();
      watchers.delete(p);
    }
  }
}

async function unwatchAll() {
  for (const entry of watchers.values()) {
    await entry.watcher.close();
  }
  watchers.clear();
}

// --- Fenster -----------------------------------------------------------------

// Prueft, ob Bounds noch auf einem aktiven Display sichtbar sind (mind. 100x100
// Pixel Ueberlappung mit irgendeinem Display).
function isBoundsVisibleOnAnyDisplay(bounds) {
  if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return false;
  if (typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return false;
  const displays = screen.getAllDisplays();
  for (const d of displays) {
    const a = d.bounds;
    const x1 = Math.max(bounds.x, a.x);
    const y1 = Math.max(bounds.y, a.y);
    const x2 = Math.min(bounds.x + bounds.width, a.x + a.width);
    const y2 = Math.min(bounds.y + bounds.height, a.y + a.height);
    if (x2 - x1 > 100 && y2 - y1 > 100) return true;
  }
  return false;
}

const saveBoundsTimers = new Map(); // ownerId -> Timer

function saveBoundsForWindow(win) {
  if (!win || win.isDestroyed()) return null;
  // M-07 (4T-0173): minimiert liefert getNormalBounds die Restore-Bounds.
  // Vorher returnte der Pfad null und persistAllWindows ueberschrieb die
  // gespeicherten Bounds mit null (naechster Start mit Default-Groesse).
  // Nur Fullscreen bleibt ausgeschlossen (in dieser App ohne UI-Pfad).
  if (win.isFullScreen()) return null;
  const isMax = win.isMaximized();
  const bounds = isMax || win.isMinimized() ? win.getNormalBounds() : win.getBounds();
  return { bounds, maximized: isMax };
}

function scheduleSaveBoundsAndPersist(win) {
  if (!win || win.isDestroyed()) return;
  const id = win.webContents.id;
  const existing = saveBoundsTimers.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    saveBoundsTimers.delete(id);
    persistAllWindows();
  }, 500);
  saveBoundsTimers.set(id, timer);
}

// Live-Snapshot einer App im Persistenz-Format (Bounds und letzte vom
// Renderer gemeldete Pane-Struktur pro Fenster). null ohne lebende Fenster.
// 4T-0537: aus persistAllWindows extrahiert, weil workspace:saveAs denselben
// Snapshot als Erst-Stand des neuen Arbeitsbereichs braucht.
function liveAppSnapshot(appId) {
  const winEntries = [];
  for (const windowId of appRegistry.windowsOf(appId)) {
    const win = windows.get(windowId);
    if (!win || win.isDestroyed()) continue;
    const bm = saveBoundsForWindow(win);
    winEntries.push({
      bounds: bm ? bm.bounds : null,
      maximized: bm ? bm.maximized : false,
      panes: lastReportedPanes.get(windowId) || [],
    });
  }
  if (winEntries.length === 0) return null;
  const area = appRegistry.getArea(appId);
  return {
    area: area && area.rootPath ? { rootPath: area.rootPath } : null,
    windows: winEntries,
  };
}

// Persistiert den aktuellen Stand ALLER Fenster (Bounds und letzte vom Renderer
// gemeldete Pane-Struktur) in den Store. Wird bei Bounds-Aenderungen, beim
// Wechsel des Maximiert-Status und beim App-Quit aufgerufen.
// 4T-0320: Schema ueber logische Applikationen (Store-Key 'apps'): pro App
// Bereichs-Bindung plus Fenster-Liste. Der Bereichsname wird nicht
// persistiert (beim Restore aus rootPath abgeleitet).
// 4T-0537: Apps mit Arbeitsbereichs-Zuordnung landen im app-Feld ihres
// 'workspaces'-Eintrags statt in 'apps'; eingefrorene (geschlossene)
// Arbeitsbereiche bleiben unangetastet. Beide Keys gehen in EINEM
// store.set-Aufruf raus (ein Dateischreibvorgang, kein Zwischenzustand).
function persistAllWindows() {
  if (!store) return;
  const appsList = [];
  for (const appId of appRegistry.appIds()) {
    const snapshot = liveAppSnapshot(appId);
    if (!snapshot) continue;
    const ws = appRegistry.getWorkspace(appId);
    const entry = ws ? workspacesState.find((w) => w.id === ws.id) : null;
    if (entry) entry.app = snapshot;
    else appsList.push(snapshot);
  }
  store.set({ apps: appsList, workspaces: workspacesState });
}

// --- Entwurfs-Zwischenspeicher (4T-0368, Epic 3E-0068) -----------------------
// Nie gespeicherte Unbenannt-Tabs mit Inhalt ueberleben das App-Ende: der
// Renderer sammelt sie beim Schliessen ein (drafts:save), hier landen sie als
// Inhalts-Dateien <id>.md plus manifest.json unter <userData>/drafts. Beim
// Start werden sie den wiederhergestellten Fenstern zugeteilt (draft-store.js)
// und ueber window:initialState als Unbenannt-Tabs wiederhergestellt; der
// Ordner wird danach geleert. Kein periodisches Sichern (PO: kein
// Absturz-Schutz).
function draftsDir() {
  return path.join(app.getPath('userData'), 'drafts');
}

function draftManifestPath() {
  return path.join(draftsDir(), 'manifest.json');
}

async function readDraftManifest() {
  try {
    return normalizeManifest(JSON.parse(await fs.readFile(draftManifestPath(), 'utf8')));
  } catch {
    return [];
  }
}

// Liest Manifest und Inhalte; raeumt verwaiste Inhalts-Dateien (ohne
// Manifest-Eintrag) und uebergeht Manifest-Eintraege ohne Datei. Ergebnis:
// geordnete Entwuerfe [{ id, area, content, tabSettings, order }].
async function readAllDrafts() {
  const manifest = await readDraftManifest();
  let fileIds;
  try {
    const names = await fs.readdir(draftsDir());
    fileIds = names.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3));
  } catch {
    // Ordner existiert nicht → keine Entwuerfe.
    return [];
  }

  const { orphanFiles } = findOrphans(manifest, fileIds);
  for (const id of orphanFiles) {
    try {
      await fs.unlink(path.join(draftsDir(), `${id}.md`));
    } catch {
      /* ignorieren */
    }
  }

  const fileIdSet = new Set(fileIds);
  const drafts = [];
  for (const e of manifest) {
    if (!fileIdSet.has(e.id)) continue; // Manifest-Eintrag ohne Datei
    try {
      const content = await fs.readFile(path.join(draftsDir(), `${e.id}.md`), 'utf8');
      drafts.push({
        id: e.id,
        area: e.area,
        // 4T-0539 (Epic 3E-0098): Arbeitsbereichs-Zuordnung des Entwurfs.
        workspaceId: e.workspaceId,
        content,
        tabSettings: e.tabSettings,
        order: e.order,
      });
    } catch {
      /* nicht lesbar → ueberspringen */
    }
  }
  drafts.sort((a, b) => a.order - b.order);
  return drafts;
}

// Haengt die Entwuerfe eines Fensters additiv an. `entries` vom Renderer:
// [{ content, tabSettings, order }]. `areaRootPath` ist der Bereich der
// sendenden App (autoritativ aus der App-Registry) oder null. Additiv, weil
// beim Multi-Fenster-Quit jedes Fenster einzeln schreibt.
// 4T-0539 (Epic 3E-0098): `workspaceId` ist die Arbeitsbereichs-Zuordnung
// der sendenden App (ebenfalls autoritativ aus der Registry) oder null.
async function appendDrafts(entries, areaRootPath, workspaceId) {
  const list = Array.isArray(entries)
    ? entries.filter((e) => e && typeof e.content === 'string' && e.content.trim() !== '')
    : [];
  if (list.length === 0) return;
  await fs.mkdir(draftsDir(), { recursive: true });

  const manifest = await readDraftManifest();
  const base = manifest.length;
  const savedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const id = crypto.randomUUID();
    await fs.writeFile(path.join(draftsDir(), `${id}.md`), entry.content, 'utf8');
    manifest.push({
      id,
      area: areaRootPath || null,
      workspaceId: workspaceId || null,
      order: base + (Number.isFinite(entry.order) ? entry.order : i),
      tabSettings:
        entry.tabSettings && typeof entry.tabSettings === 'object' ? entry.tabSettings : {},
      savedAt,
    });
  }
  await fs.writeFile(draftManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

// Leert den Speicher vollstaendig (nach der Uebergabe an die Fenster beim
// Start). Die neue Sitzung fuellt ihn beim naechsten App-Ende frisch, sodass
// der neue Stand den alten ersetzt, ohne dass additive Multi-Fenster-Schreib-
// vorgaenge innerhalb einer Quit-Runde kollidieren.
async function clearDrafts() {
  try {
    await fs.rm(draftsDir(), { recursive: true, force: true });
  } catch {
    /* ignorieren */
  }
}

// 4T-0539 (Epic 3E-0098): selektiver Entferner — nur die uebergebenen
// Entwuerfe verschwinden (Manifest-Rewrite plus Inhalts-Dateien); liegende
// Arbeitsbereichs-Entwuerfe geschlossener Arbeitsbereiche ueberleben den
// Start. Ein leer gewordenes Manifest raeumt den Ordner komplett.
async function removeDraftsByIds(ids) {
  const idSet = new Set(ids);
  if (idSet.size === 0) return;
  const manifest = await readDraftManifest();
  const remaining = manifest.filter((e) => !idSet.has(e.id));
  if (remaining.length === 0) {
    await clearDrafts();
    return;
  }
  for (const id of idSet) {
    try {
      await fs.rm(path.join(draftsDir(), `${id}.md`), { force: true });
    } catch {
      /* ignorieren */
    }
  }
  await fs.writeFile(draftManifestPath(), JSON.stringify(remaining, null, 2), 'utf8');
}

// 4T-0539: Entwuerfe eines geloeschten Arbeitsbereichs wandern in den
// globalen Topf (workspaceId loesen, nichts geht verloren; Degradierungs-
// Logik aus Workshop-Punkt 4).
async function retagDraftsToGlobal(workspaceId) {
  if (!workspaceId) return;
  const manifest = await readDraftManifest();
  let changed = false;
  for (const e of manifest) {
    if (e.workspaceId === workspaceId) {
      e.workspaceId = null;
      changed = true;
    }
  }
  if (!changed) return;
  await fs.mkdir(draftsDir(), { recursive: true });
  await fs.writeFile(draftManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

// Wandelt interne Entwuerfe in das Renderer-Payload (Inhalt + tabSettings, nach
// order sortiert). Der Renderer oeffnet sie als Unbenannt-Tabs.
function draftsToPayload(drafts) {
  return [...drafts]
    .sort((a, b) => a.order - b.order)
    .map((d) => ({ content: d.content, tabSettings: d.tabSettings || {} }));
}

// Serialisierung der Schreibvorgaenge: beim Multi-Fenster-Quit koennen mehrere
// Renderer ihr drafts:save quasi-gleichzeitig schicken. Die Kette verhindert
// eine Read-modify-write-Race auf dem Manifest.
let draftWriteChain = Promise.resolve();

// Der Renderer meldet seine Pane-Struktur per IPC. Wir speichern hier den
// letzten gemeldeten Stand pro Fenster, damit ein Bounds-Save auch immer die
// passenden Tabs persistiert.
const lastReportedPanes = new Map(); // ownerId -> panes-Array

// Der Renderer meldet ausserdem den menue-relevanten Stand (Sprache, View-Modus,
// Zeilennummern, Umbruch). Das Menue dieses Fensters wird daraus pro Aenderung
// neu gebaut und gesetzt, damit Haekchen synchron bleiben.
const menuStates = new Map(); // ownerId -> { locale, viewMode, lineNumbers, wordWrap, togglesEnabled }

// Pro Fenster vom Renderer gemeldete Anzeige-Infos fuer die Fenster-Liste
// und das Titel-Suffix (4T-0012): aktiver Dateiname und Tab-Anzahl. Wird in
// window:list ausgeliefert, damit das Tab-Kontextmenue eines anderen Fensters
// Tooltips ohne Renderer-Round-Trip aufbauen kann.
const windowMeta = new Map(); // ownerId -> { activeTabName, tabCount }

// Verteilt an jedes registrierte Fenster seine aktuellen Anzeige-Infos. Wird
// nach jedem Open- und Close-Event aufgerufen. Beim Open landet der Aufruf im
// did-finish-load-Handler, damit auch das neu erzeugte Fenster den Push erhaelt.
// 4T-0318: Nummerierung kommt aus der App-Registry — displayNumber/totalCount
// sind seither APP-lokal (Fenster-Nummer innerhalb der eigenen Applikation);
// dazu kommen App-Nummer, Zahl der nummerierten Apps und Bereichs-Daten.
function broadcastDisplayInfo() {
  const infos = appRegistry.displayInfos();
  for (const [id, win] of windows) {
    if (win.isDestroyed()) continue;
    const info = infos.get(id) || {};
    win.webContents.send('window:displayInfo', {
      windowId: id,
      displayNumber: info.windowNumber || 1,
      totalCount: info.appWindowCount || 1,
      appNumber: info.appNumber || 1,
      numberedAppCount: info.numberedAppCount || 1,
      appCount: info.appCount || 1,
      areaName: info.areaName || null,
      areaPath: info.areaPath || null,
      // 4T-0537: Arbeitsbereichs-Name der App (Fenster-Titel-Grundlage,
      // Anzeige-Logik folgt in 4T-0538).
      workspaceName: info.workspaceName || null,
    });
  }
}

// 4T-0277: Normalisierung nach src/main/menu-state.js ausgelagert
// (electron-frei, unit-testbar). Behebt zugleich den Durchreich-Fehler
// aus 4T-0213: manualTab kam vom Renderer, fehlte aber im Menue-State.
function getMenuState(id) {
  // 4T-0322/4T-0323 (Epic 3E-0058): Bereichs-Bindung der App dieses Fensters —
  // aktiviert "Bereich schliessen" und filtert die Zuletzt-geoeffnet-Liste
  // auf Dateien innerhalb des Bereichs (die globale Liste bleibt ungefiltert
  // im Store).
  const menuAppId = appRegistry.appOf(id);
  const area = appRegistry.getArea(menuAppId);
  const recentFiles = ((store && store.get('recentFiles')) || []).filter(
    (p) => !area || isInsideArea(area.rootPath, p),
  );
  return normalizeMenuState(menuStates.get(id), {
    hasArea: !!area,
    // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Zuordnung der Fenster-App
    // plus Untermenue-Liste (open = Laufzeit-Zustand aus der Registry).
    hasWorkspace: menuAppId != null && !!appRegistry.getWorkspace(menuAppId),
    workspaces: workspacesState.map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      open: appRegistry.findAppByWorkspaceId(w.id) != null,
    })),
    restoreSession: !!(store && store.get('restoreSession')),
    autoSave: !!(store && store.get('autoSave')),
    recentFiles,
    // 4T-0325: zuletzt geoeffnete Bereiche (unabhaengig vom Bereichs-Filter
    // der Datei-Liste — der Wechsel in einen anderen Bereich ist erlaubt
    // und erzeugt ggf. eine neue Applikation).
    recentAreas: (store && store.get('recentAreas')) || [],
    themePref: store && store.get('themePref'),
    // 4T-0207: effektive Menue-Accelerators (Registry-Defaults plus
    // User-Overrides aus dem Store).
    hotkeys: effectiveMenuAccelerators(store ? store.get('hotkeys') : null),
    // 4T-0294: Kommandos effektiv deaktivierter Erweiterungen — die
    // Menue-Factory laesst deren Eintraege weg.
    disabledCommands: [...disabledCommandIdSet(store ? store.get('extensions.disabled') : [])],
  });
}

function applyMenuToWindow(win) {
  if (!win || win.isDestroyed()) return;
  const state = getMenuState(win.webContents.id);
  const actions = {
    openRecent: (p) => openRecentFile(p, win),
    clearRecent: () => clearRecentList(win),
    // 4T-0325: Zuletzt geoeffnete Bereiche.
    openRecentArea: (p) => openRecentArea(p, win),
    clearRecentAreas: () => clearRecentAreasList(win),
    // 4T-0538 (Epic 3E-0098): Klick auf einen Untermenue-Eintrag oeffnet
    // den Arbeitsbereich bzw. fokussiert ihn (Main fuehrt direkt aus).
    openWorkspace: (wsId) => {
      void openWorkspaceById(wsId, win);
    },
    save: () => {
      if (!win.isDestroyed()) win.webContents.send('menu:save');
    },
    saveAs: () => {
      if (!win.isDestroyed()) win.webContents.send('menu:saveAs');
    },
    toggleAutoSave: () => {
      if (!win.isDestroyed()) win.webContents.send('menu:toggleAutoSave');
    },
    newTab: () => {
      if (!win.isDestroyed()) win.webContents.send('menu:new');
    },
  };
  const menu = buildMenu(win, state, actions);
  win.setMenu(menu);
}

function applyMenuToAllWindows() {
  for (const win of windows.values()) applyMenuToWindow(win);
}

// Lokalisierter String mit der Sprache des angegebenen Fensters. Faellt auf
// Englisch zurueck, wenn das Fenster keine Sprache gemeldet hat.
function tForWindow(win, key) {
  const state = win && !win.isDestroyed() ? menuStates.get(win.webContents.id) : null;
  return tForLocale(state?.locale || 'en', key);
}

// --- Bereiche (4T-0322, Epic 3E-0058) -----------------------------------------

// Hat die App irgendeine geoeffnete DATEI (Tab mit Pfad)? Unbenannt-Tabs
// zaehlen nicht als geoeffnete Datei — sie sind (noch) keine Datei; die
// Pane-Snapshots des Renderers fuehren ohnehin nur Pfad-Tabs.
// Bereichs-Bindung der App eines Fensters (null ohne Bereich). 4T-0323:
// gemeinsamer Zugriff aller Grenz-Pfade (Dialoge, file:read, Recent-Filter).
function areaOfWindow(win) {
  if (!win || win.isDestroyed()) return null;
  const appId = appRegistry.appOf(win.webContents.id);
  return appId != null ? appRegistry.getArea(appId) : null;
}

function appHasOpenFiles(appId) {
  for (const windowId of appRegistry.windowsOf(appId)) {
    const panes = lastReportedPanes.get(windowId) || [];
    for (const pane of panes) {
      if (pane && Array.isArray(pane.paths) && pane.paths.length > 0) return true;
    }
  }
  return false;
}

function focusFirstAppWindow(appId) {
  const [firstId] = appRegistry.windowsOf(appId);
  const win = firstId != null ? windows.get(firstId) : null;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

// 4T-0537: "erneutes Oeffnen fokussiert" zielt aufs zuletzt aktive Fenster
// des Arbeitsbereichs (Workshop-Punkt 3); Fallback erstes Fenster der App.
function focusLastActiveAppWindow(appId) {
  const winIds = appRegistry.windowsOf(appId);
  const lastId = appLastFocused.get(appId);
  const targetId = lastId != null && winIds.includes(lastId) ? lastId : winIds[0];
  const win = targetId != null ? windows.get(targetId) : null;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

// 4T-0538 (Epic 3E-0098): jede Arbeitsbereichs-Aenderung zieht die
// Fenster-Menues (Untermenue-Liste, Dimmungen) und die Renderer
// (Verwaltungs-Dialog) nach.
function workspacesChanged() {
  applyMenuToAllWindows();
  broadcast('workspaces:changed');
}

// 4T-0630 (Epic 3E-0102): Titelleisten-Farbe eines Fensters an den
// Arbeitsbereichs-Zustand angleichen — Farb-Key aus workspacesState
// (die App-Registry fuehrt nur {id, name}), Theme-Variante aus
// nativeTheme. Ohne Arbeitsbereichs-Zuordnung oder bei ausgeschalteter
// Erweiterung 'workspaces' Standard-Titelleiste (Reset). Das Erweiterungs-
// Gate sitzt bewusst Main-seitig: der Renderer steuert die native
// Titelleiste nicht (der Titel-Suffix hat sein Gate im Renderer).
function updateCaptionColor(win) {
  if (!win || win.isDestroyed()) return;
  let colorKey = null;
  if (isExtensionEnabled('workspaces', store ? store.get('extensions.disabled') : [])) {
    const appId = appRegistry.appOf(win.webContents.id);
    const ws = appId != null ? appRegistry.getWorkspace(appId) : null;
    const entry = ws ? workspacesState.find((w) => w.id === ws.id) : null;
    colorKey = entry ? entry.color : null;
  }
  applyCaptionColor(win.getNativeWindowHandle(), colorKey, nativeTheme.shouldUseDarkColors);
}

// Alle Fenster angleichen (Farbwechsel, Loeschen/Degradieren, Theme-
// Wechsel, Erweiterungs-Schalter) — Muster applyMenuToAllWindows.
function updateAllCaptionColors() {
  for (const win of windows.values()) updateCaptionColor(win);
}

// Oeffnen-Kern fuer IPC-Handler und Menue-Action (4T-0538 aus dem
// workspace:open-Handler extrahiert): laeuft der Arbeitsbereich schon,
// wird nur fokussiert (Workshop-Punkt 3); sonst Fenster-Schleife nach dem
// Restore-Muster aus whenReady. Fehlender Bereichs-Ordner: bestehende
// Warn-Mechanik, das Oeffnen unterbleibt, die Ablage bleibt unveraendert.
async function openWorkspaceById(id, ownerWin) {
  const entry = workspacesState.find((w) => w.id === id);
  if (!entry) return { ok: false, error: 'unknown workspace' };
  const runningAppId = appRegistry.findAppByWorkspaceId(id);
  if (runningAppId != null) {
    focusLastActiveAppWindow(runningAppId);
    return { ok: true, focusedExisting: true };
  }
  let area = null;
  if (entry.app.area && entry.app.area.rootPath) {
    area = areaFromRootPath(entry.app.area.rootPath);
    let missing = !area;
    if (area) {
      try {
        const stat = await fs.stat(area.rootPath);
        if (!stat.isDirectory()) throw new Error('kein Ordner');
      } catch {
        missing = true;
      }
    }
    if (missing) {
      const owner = ownerWin && !ownerWin.isDestroyed() ? ownerWin : null;
      await dialog.showMessageBox(owner || undefined, {
        type: 'warning',
        title: tForWindow(owner, 'area.missingTitle'),
        message: tForWindow(owner, 'area.missingMessage'),
        detail: entry.app.area.rootPath,
        buttons: ['OK'],
      });
      return { ok: false, error: 'missing area' };
    }
  }
  const appId = appRegistry.createApp(area);
  appRegistry.setWorkspace(appId, { id: entry.id, name: entry.name });
  if (area) startAreaWatcher(appId);
  // 4T-0539 (Epic 3E-0098): liegende Entwuerfe dieses Arbeitsbereichs
  // mitnehmen (erstes Fenster, window:initialState-Weg) und danach selektiv
  // aus dem Speicher raeumen. Vorher die Schreib-Kette abwarten, damit ein
  // gerade abgeschlossenes Schliessen seine Entwuerfe fertig persistiert hat.
  await draftWriteChain;
  const wsDrafts = (await readAllDrafts()).filter((d) => d.workspaceId === entry.id);
  const wsDraftPayload = draftsToPayload(wsDrafts);
  const winList =
    entry.app.windows.length > 0
      ? entry.app.windows
      : [{ bounds: null, maximized: false, panes: [] }];
  for (let wi = 0; wi < winList.length; wi++) {
    const w = winList[wi];
    createWindow({
      bounds: w?.bounds || null,
      maximized: !!w?.maximized,
      initialPanes: Array.isArray(w?.panes) ? w.panes : [],
      initialDrafts: wi === 0 ? wsDraftPayload : [],
      appId,
    });
  }
  if (wsDrafts.length > 0) await removeDraftsByIds(wsDrafts.map((d) => d.id));
  entry.open = true;
  entry.lastOpenedAt = utcNowSeconds();
  persistAllWindows();
  workspacesChanged();
  return { ok: true };
}

// Kern von "Bereich oeffnen" (Dialog-, Pfad- und Zuletzt-Einstieg):
// - Bereich laeuft schon -> Sprung in ein Fenster der Bereichs-App (nie doppelt).
// - ausloesende App ist bereichslos und ohne geoeffnete Datei -> Bindung.
// - sonst -> neue Applikation mit Bereich (PO-Regel: unabhaengig davon, wo
//   die geoeffneten Dateien liegen).
function openAreaPath(rootPath, senderWin) {
  const area = areaFromRootPath(rootPath);
  if (!area) return { ok: false, error: 'invalid path' };
  // 4T-0325: jedes Bereich-Oeffnen pflegt die Zuletzt-Liste (auch der
  // Sprung in eine laufende Bereichs-App zaehlt als Oeffnen).
  if (store) {
    store.set('recentAreas', updatedRecentAreas(store.get('recentAreas'), area.rootPath));
    applyMenuToAllWindows();
  }
  const running = appRegistry.findAppByArea((a) => isSamePath(a.rootPath, area.rootPath));
  if (running != null) {
    focusFirstAppWindow(running);
    return { ok: true, focusedExisting: true };
  }
  const senderAppId =
    senderWin && !senderWin.isDestroyed() ? appRegistry.appOf(senderWin.webContents.id) : null;
  if (senderAppId != null && !appRegistry.getArea(senderAppId) && !appHasOpenFiles(senderAppId)) {
    appRegistry.setArea(senderAppId, area);
    startAreaWatcher(senderAppId);
    broadcastDisplayInfo();
    applyMenuToAllWindows();
    persistAllWindows();
    return { ok: true, boundExisting: true };
  }
  const win = createWindow({ area });
  startAreaWatcher(appRegistry.appOf(win.webContents.id));
  return { ok: true, createdNew: true };
}

// --- 4T-0328 (Epic 3E-0059): Verzeichnis-Watcher pro Bereichs-App ------------
// Struktur-Ereignisse (Datei/Ordner angelegt, geloescht, umbenannt) im
// Bereichs-Baum werden debounced als 'area:changed' an die Fenster der App
// gemeldet; der Renderer liest die Listings idempotent neu (kein Echo-
// Schutz noetig). Lebenszyklus: Start mit der Bereichs-Bindung, Stopp mit
// dem Verschwinden der App (Muster des Datei-Watchers oben).
const areaWatchers = new Map(); // appId -> { watcher, timer }

function startAreaWatcher(appId) {
  if (areaWatchers.has(appId)) return;
  const area = appRegistry.getArea(appId);
  if (!area) return;
  // 4T-0348 (Epic 3E-0062): Bereichs-Index proaktiv aufbauen, sobald ein
  // Bereich gebunden wird. So entsteht der Index "automatisch beim Start" und
  // persistiert sich in Area_Cache.mdda, ohne dass eine Datei offen sein muss.
  // Der Owner haelt den Index ueber die Lebensdauer der Bereichs-App;
  // stopAreaWatcher gibt ihn beim Bereichs-Schliessen frei.
  backlinks.ensureAreaIndex(area.rootPath, `area:${appId}`);
  const watcher = chokidar.watch(area.rootPath, {
    ignoreInitial: true,
    // 4T-0348 (Epic 3E-0062): Markdown-Data-Dateien (.mdd/.mdda/.mddb) sind
    // Bereichs-Infrastruktur (Historie, Einstellungen, Index-Cache), keine
    // Nutzer-Struktur; ihr Anlegen/Schreiben soll kein Panel-Refresh ausloesen.
    // Sie erscheinen ohnehin nicht in der Datei-Liste (kein Markdown-Name).
    ignored: (p) => isMddPath(p),
  });
  const entry = { watcher, timer: null, rootPath: area.rootPath };
  const notify = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      for (const windowId of appRegistry.windowsOf(appId)) {
        const win = windows.get(windowId);
        if (win && !win.isDestroyed()) win.webContents.send('area:changed');
      }
    }, 300);
  };
  // Nur Struktur-Ereignisse; Inhalts-Aenderungen ('change') sind fuer das
  // Panel irrelevant und wuerden bei jedem Speichern feuern.
  for (const eventName of ['add', 'addDir', 'unlink', 'unlinkDir']) {
    watcher.on(eventName, notify);
  }
  watcher.on('error', (err) => {
    console.warn('Bereichs-Watcher-Fehler:', area.rootPath, err && err.message);
  });
  areaWatchers.set(appId, entry);
}

function stopAreaWatcher(appId) {
  const entry = areaWatchers.get(appId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  try {
    entry.watcher.close();
  } catch {
    /* ignore */
  }
  // 4T-0348 (Epic 3E-0062): proaktiven Bereichs-Index-Owner freigeben. Ist er
  // der letzte Owner der Wurzel, startet der Soft-Timer und der Teardown flusht
  // den Cache ein letztes Mal.
  if (entry.rootPath) backlinks.releaseRoot(entry.rootPath, `area:${appId}`);
  areaWatchers.delete(appId);
}

// "Bereich schliessen" schliesst alle Fenster der Bereichs-App ueber den
// regulaeren Close-Pfad (Speichern-Nachfragen pro Dokument). Sequenziell,
// damit ein Nutzer-Abbruch (Speichern-Dialog -> Abbrechen) die Kaskade
// stoppt; window:cancelClose meldet den Abbruch hierher.
let cascadeCancel = null;

function closeWindowAndWait(win) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cascadeCancel = null;
      resolve(result);
    };
    cascadeCancel = () => finish(false);
    win.once('closed', () => finish(true));
    win.close();
  });
}

// Gemeinsamer Kaskaden-Kern fuer "Bereich schliessen" und "Arbeitsbereich
// schliessen" (4T-0537): alle Fenster der App sequenziell ueber den
// regulaeren Close-Pfad, Nutzer-Abbruch stoppt die Kaskade.
async function closeAppWindows(appId) {
  for (const windowId of [...appRegistry.windowsOf(appId)]) {
    const win = windows.get(windowId);
    if (!win || win.isDestroyed()) continue;
    const closed = await closeWindowAndWait(win);
    if (!closed) return { ok: false, canceled: true };
  }
  return { ok: true };
}

async function closeAreaApp(appId) {
  if (!appRegistry.getArea(appId)) return { ok: false };
  return closeAppWindows(appId);
}

// Klick auf einen Recent-Eintrag im Datei-Menue. Prueft zunaechst, ob die
// Datei noch existiert; wenn nicht, raus aus der Liste und Fehlerdialog.
// Sonst: Datei als neuer Tab im sourceWindow oeffnen (analog zu "Oeffnen mit"
// im Explorer). Der Renderer aktualisiert die Recent-Liste selbst ueber
// recent:push, wenn er die Datei in openInPane verarbeitet.
async function openRecentFile(filePath, sourceWindow) {
  try {
    await fs.access(filePath);
  } catch {
    const recent = (store && store.get('recentFiles')) || [];
    const filtered = recent.filter((p) => p !== filePath);
    if (store) store.set('recentFiles', filtered);
    applyMenuToAllWindows();
    await dialog.showMessageBox(sourceWindow || undefined, {
      type: 'warning',
      title: tForWindow(sourceWindow, 'recent.missingFileTitle'),
      message: tForWindow(sourceWindow, 'recent.missingFile'),
      detail: filePath,
      buttons: ['OK'],
    });
    return;
  }
  const target = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : getActiveWindow();
  if (target && !target.isDestroyed()) {
    target.focus();
    target.webContents.send('file:openExternal', [filePath]);
  }
}

// 4T-0325 (Epic 3E-0058): Klick auf einen Eintrag im Submenue "Zuletzt
// geoeffnete Bereiche". Fehlt der Ordner, wird der Eintrag ausgetragen und
// gemeldet; sonst identische Regeln wie "Bereich oeffnen..." (openAreaPath).
async function openRecentArea(rootPath, sourceWindow) {
  try {
    const stat = await fs.stat(rootPath);
    if (!stat.isDirectory()) throw new Error('kein Ordner');
  } catch {
    if (store) {
      const recent = store.get('recentAreas', []);
      store.set(
        'recentAreas',
        recent.filter((p) => !isSamePath(p, rootPath)),
      );
      applyMenuToAllWindows();
    }
    await dialog.showMessageBox(sourceWindow || undefined, {
      type: 'warning',
      title: tForWindow(sourceWindow, 'area.missingTitle'),
      message: tForWindow(sourceWindow, 'area.recentMissingMessage'),
      detail: rootPath,
      buttons: ['OK'],
    });
    return;
  }
  openAreaPath(rootPath, sourceWindow);
}

// 4T-0325: "Liste loeschen" im Bereichs-Submenue (Muster clearRecentList).
async function clearRecentAreasList(sourceWindow) {
  const t = (key) => tForWindow(sourceWindow, key);
  const result = await dialog.showMessageBox(sourceWindow || undefined, {
    type: 'question',
    title: t('menu.file.recentClear'),
    message: t('menu.file.recentAreasClearConfirm'),
    buttons: [t('menu.file.recentClearBtnYes'), t('menu.file.recentClearBtnNo')],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response === 0) {
    if (store) store.set('recentAreas', []);
    applyMenuToAllWindows();
  }
}

// Klick auf "Liste loeschen" im Recent-Submenue. Bestaetigungsdialog mit
// "Loeschen" / "Abbrechen"; bei Loeschen wird die Liste geleert und alle
// Fenster-Menues aktualisiert.
async function clearRecentList(sourceWindow) {
  const t = (key) => tForWindow(sourceWindow, key);
  const result = await dialog.showMessageBox(sourceWindow || undefined, {
    type: 'question',
    title: t('menu.file.recentClear'),
    message: t('menu.file.recentClearConfirm'),
    buttons: [t('menu.file.recentClearBtnYes'), t('menu.file.recentClearBtnNo')],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response === 0) {
    if (store) store.set('recentFiles', []);
    applyMenuToAllWindows();
  }
}

// Erstellt ein neues Fenster. opts:
//   bounds, maximized   - Startposition/-groesse, optional
//   initialPanes        - Pane-Snapshots ([{paths, activeIndex, tabSettings}, ...]),
//                         die der Renderer beim Start uebernimmt. Bei Restore aus
//                         der Sitzung gefuellt; bei "Tab in neues Fenster" mit
//                         genau einer Pane und einem Tab; sonst leer.
//   appId               - logische Applikation, zu der das Fenster gehoert
//                         (4T-0318). Ohne gueltige appId wird eine neue App
//                         angelegt (Kaltstart, "Neue Applikation").
//   area                - Bereichs-Bindung { rootPath, name } fuer die NEU
//                         angelegte App (4T-0322); ignoriert, wenn appId
//                         eine bestehende App adressiert.
function createWindow(opts = {}) {
  const useStored = isBoundsVisibleOnAnyDisplay(opts.bounds);

  const options = {
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
  // Workaround fuer Electron-Multi-Monitor-DPI-Bug (electron/electron Issues
  // #10862, #16444, #31999): bei Setups mit unterschiedlicher Per-Monitor-DPI
  // werden width/height beim BrowserWindow-Konstruktor sowie beim ersten
  // setBounds-Aufruf um den Skalierungsfaktor verzerrt, weil Electron sie in
  // DIPs des Quell- oder Primaermonitors interpretiert. Loesung: Fenster mit
  // Default-Optionen erzeugen (landet auf Primary), dann setBounds zweimal
  // hintereinander aufrufen. Der erste Aufruf verschiebt das Fenster auf den
  // Zielmonitor und triggert die DPI-Erkennung; der zweite Aufruf setzt die
  // Bounds mit der dann aktiven korrekten Ziel-DPI (4T-0025).
  const win = new BrowserWindow(options);
  const id = win.webContents.id;
  windows.set(id, win);
  lastFocusedId = id;
  const appId =
    opts.appId != null && appRegistry.hasApp(opts.appId)
      ? opts.appId
      : appRegistry.createApp(opts.area || null);
  appRegistry.assignWindow(id, appId);
  // 4T-0630 (Epic 3E-0102): Arbeitsbereichs-Farbe der Titelleiste sofort
  // nach der App-Zuordnung setzen — vor dem ready-to-show-Anzeigen, damit
  // der Sitzungs-Restore und workspace:create/open ohne Nachflackern
  // gefaerbt erscheinen ('Tab in neues Fenster' erbt ueber dieselbe Stelle).
  updateCaptionColor(win);

  if (useStored) {
    const targetBounds = {
      x: opts.bounds.x,
      y: opts.bounds.y,
      width: Math.max(opts.bounds.width, options.minWidth),
      height: Math.max(opts.bounds.height, options.minHeight),
    };
    win.setBounds(targetBounds);
    win.setBounds(targetBounds);
    if (opts.maximized) win.maximize();
  }

  applyMenuToWindow(win);

  const initPanes = Array.isArray(opts.initialPanes) ? opts.initialPanes : [];
  pendingInitPanes.set(id, initPanes);
  // Damit der Renderer den ersten 'reportPanes'-Push nicht versehentlich auf
  // einen veralteten Stand setzt, merken wir uns die initiale Pane-Struktur
  // sofort auch als "letzten gemeldeten Stand" dieses Fensters.
  lastReportedPanes.set(id, initPanes);
  // 4T-0368: beim Start zugeteilte Entwuerfe dieses Fensters (nur das erste
  // Fenster einer App bekommt welche; sonst leer).
  pendingInitDrafts.set(id, Array.isArray(opts.initialDrafts) ? opts.initialDrafts : []);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());

  // Initialen Zustand IMMER schicken — auch leer. So kann der Renderer
  // deterministisch darauf warten und entscheidet nicht selbst per Timeout,
  // wann er mit dem Rendern starten darf.
  // M-13 (4T-0173): 'on' statt 'once' — nach einem Renderer-Reload
  // (DevTools, Strg+R) blockierte der frisch geladene Renderer sonst
  // dauerhaft auf initialStatePromise (leeres Fenster). Beim erneuten Load
  // wird der zuletzt gemeldete Pane-Stand dieses Fensters gesendet.
  win.webContents.on('did-finish-load', () => {
    const pending = pendingInitPanes.get(id);
    const panes = pending !== undefined ? pending : lastReportedPanes.get(id) || [];
    // 4T-0368: Entwuerfe nur beim ERSTEN Load ausliefern (delete vor dem
    // naechsten did-finish-load nach einem Renderer-Reload), sonst wuerden sie
    // doppelt geoeffnet.
    const drafts = pendingInitDrafts.get(id) || [];
    pendingInitDrafts.delete(id);
    win.webContents.send('window:initialState', { panes, drafts });
    pendingInitPanes.delete(id);
    // M-02 (4T-0173): waehrend der Ladephase eingegangene second-instance-
    // Dateien jetzt nachreichen (Muster des Kaltstart-Pfads in whenReady).
    // 4T-0323: nur bereichslose Fenster leeren die Queue — sonst koennte
    // beim Restore ein frueher ladendes Bereichs-Fenster Explorer-Dateien
    // an sich ziehen.
    if (pendingSecondInstanceFiles.length > 0 && !areaOfWindow(win)) {
      const files = pendingSecondInstanceFiles.splice(0);
      win.webContents.send('file:openExternal', files);
    }
    // Erst NACH initialState die Display-Infos verteilen, damit das brandneue
    // Fenster bereits den Renderer-State (panes, Titel) aufbauen konnte und
    // direkt im Anschluss seine Nummer kennt. Alle anderen Fenster bekommen
    // die aktualisierte totalCount.
    broadcastDisplayInfo();
  });

  // Fokus tracken (fuer second-instance-Routing; seit 4T-0537 auch pro App
  // fuer das "erneutes Oeffnen fokussiert" der Arbeitsbereiche).
  win.on('focus', () => {
    lastFocusedId = id;
    const focusedAppId = appRegistry.appOf(id);
    if (focusedAppId != null) appLastFocused.set(focusedAppId, id);
  });

  // Bounds-Aenderungen debounced persistieren.
  win.on('move', () => scheduleSaveBoundsAndPersist(win));
  win.on('resize', () => scheduleSaveBoundsAndPersist(win));
  win.on('maximize', () => persistAllWindows());
  win.on('unmaximize', () => persistAllWindows());

  win.on('close', (e) => {
    // Dirty-Check: wenn der Renderer noch nicht bestaetigt hat, dass das
    // Schliessen OK ist, Frage an ihn weiterreichen. Beim App-Quit greift
    // dieselbe Logik pro Fenster.
    if (!confirmedClosings.has(win)) {
      e.preventDefault();
      if (!win.isDestroyed()) win.webContents.send('window:requestClose');
      return;
    }
    confirmedClosings.delete(win);
    const timer = saveBoundsTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      saveBoundsTimers.delete(id);
    }
    // Stand persistieren, solange dieses Fenster noch in der `windows`-Map
    // steht und nicht destroyed ist. Sonst geht beim Schliessen des letzten
    // Fensters die Position verloren, weil der nachgelagerte 'closed'-Handler
    // nur noch eine leere Map sehen wuerde (4T-0025).
    if (!isQuitting) persistAllWindows();
  });

  win.on('closed', async () => {
    windows.delete(id);
    // 4T-0537: Arbeitsbereichs-Zuordnung VOR removeWindow lesen — mit dem
    // letzten Fenster verschwindet die App samt Zuordnung aus der Registry.
    const appIdBefore = appRegistry.appOf(id);
    const wsBefore = appIdBefore != null ? appRegistry.getWorkspace(appIdBefore) : null;
    const removedAppId = appRegistry.removeWindow(id);
    // 4T-0328: verschwindet die App komplett, endet ihr Bereichs-Watcher.
    if (removedAppId != null && !appRegistry.hasApp(removedAppId)) {
      stopAreaWatcher(removedAppId);
      appLastFocused.delete(removedAppId);
      // 4T-0537: letztes Fenster eines Arbeitsbereichs ausserhalb des Quits
      // friert den Stand ein (Offen-Merker false; der 'close'-Handler hat den
      // Endstand bereits persistiert). Beim Quit bleibt der Merker true —
      // genau das oeffnet den Arbeitsbereich bei der Sitzungs-
      // Wiederherstellung wieder. Nur der 'workspaces'-Key wird geschrieben;
      // die apps/Bounds-Schutzlogik (4T-0025) bleibt unberuehrt.
      if (wsBefore && !isQuitting) {
        const wsEntry = workspacesState.find((w) => w.id === wsBefore.id);
        if (wsEntry) {
          wsEntry.open = false;
          if (store) store.set('workspaces', workspacesState);
          workspacesChanged();
        }
      }
    }
    lastReportedPanes.delete(id);
    pendingInitPanes.delete(id);
    menuStates.delete(id);
    windowMeta.delete(id);
    if (lastFocusedId === id) {
      lastFocusedId = null;
      const first = windows.keys().next();
      if (!first.done) lastFocusedId = first.value;
    }
    await unwatchAllForOwner(id);
    // B-02 (4T-0175): Backlinks-Roots dieses Fensters freigeben, sonst
    // bleiben Indexe samt Watcher fuer die Prozess-Lebensdauer bestehen.
    backlinks.releaseAllForOwner(id);
    // Nur persistieren, wenn nach dem `windows.delete(id)` noch andere Fenster
    // uebrig sind. Sonst wuerde eine leere Liste die zuletzt gemerkten Bounds
    // des soeben geschlossenen letzten Fensters ueberschreiben (4T-0025; das
    // 'close'-Event hat den Stand inkl. dieses Fensters bereits persistiert).
    if (!isQuitting && windows.size > 0) {
      persistAllWindows();
      // Display-Nummern der verbliebenen Fenster ruecken nach; sinkt die Zahl
      // auf 1, wird der `(Fenster N)`-Suffix beim verbleibenden ausgeblendet.
      broadcastDisplayInfo();
    }
  });

  // Externe Links im Standardbrowser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // M-17 (4T-0176): Defense-in-Depth — keine In-Place-Navigation des
  // Renderers (setWindowOpenHandler deckt nur window.open ab). Der eigene
  // Erst-Load laeuft ueber loadFile, ein Renderer-Reload (Strg+R/DevTools)
  // loest kein will-navigate aus; pauschales preventDefault ist daher safe.
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  return win;
}

// Theme-Aenderungen an alle Fenster broadcasten. Greift sowohl bei System-
// Wechseln (wenn themeSource === 'system') als auch nach einem manuellen
// theme:setPref-Aufruf (Electron feuert 'updated' nach themeSource-Aenderung).
nativeTheme.on('updated', () => {
  broadcast('theme:changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  // 4T-0630 (Epic 3E-0102): Titelleisten der Arbeitsbereichs-Fenster auf die
  // Theme-Variante der Palette umfaerben (deckt theme:setPref und System-
  // Wechsel ab — beide feuern 'updated').
  updateAllCaptionColors();
});

// --- IPC-Handler -------------------------------------------------------------

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

// 4T-0347 (Epic 3E-0062): Bereichs-Wurzel des anfragenden Fensters fuer die
// Backlinks-Index-Einstiege. In einer Bereichs-App ist das der Bereichs-
// Wurzelordner (bereichsweiter Index ueber den ganzen Baum), sonst null
// (backlinks.js faellt dann auf die Ordner-Wurzel der Datei zurueck).
function areaRootForEvent(event) {
  const area = areaOfWindow(senderWindow(event));
  return area ? area.rootPath : null;
}

function registerIpc() {
  ipcMain.handle('file:openDialog', async (event) => {
    const owner = senderWindow(event);
    // 4T-0323 (Epic 3E-0058): in Bereichs-Apps startet der Dialog im Bereich;
    // die Vorbelegung allein ist keine Grenze — nach der Auswahl wird geprueft
    // und ausserhalb liegende Auswahl mit Meldung abgewiesen.
    const area = areaOfWindow(owner);
    // M-09 (4T-0185): Titel und Filter-Namen lokalisiert (vorher
    // hartkodiert deutsch in allen Sprachen).
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'open.dialogTitle'),
      defaultPath: area ? area.rootPath : undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: tForWindow(owner, 'dialog.filterMarkdown'),
          extensions: ['md', 'markdown', 'mdown', 'mkd'],
        },
        { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];
    if (area) {
      const rejected = result.filePaths.filter((p) => !isInsideArea(area.rootPath, p));
      if (rejected.length > 0) {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'area.outsideTitle'),
          message: tForWindow(owner, 'area.outsideOpenMessage'),
          detail: rejected.join('\n'),
          buttons: ['OK'],
        });
      }
      return result.filePaths.filter((p) => isInsideArea(area.rootPath, p));
    }
    return result.filePaths;
  });

  ipcMain.handle('file:read', async (event, filePath) => {
    // W-01 (4T-0309): defensiver Typ-Guard und {ok,error}-Rueckgabe statt
    // Exception ueber die IPC-Grenze (Entwicklungsrichtlinien §3).
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    // 4T-0331 (Epic 3E-0060): Markdown-Data-Dateien (.mdd/.mdda/.mddb) sind keine
    // Dokumente — Direkt-Oeffnen wird abgelehnt. Autoritative zweite Linie
    // hinter dem Renderer-Hinweis in openInPane.
    if (isMddPath(filePath)) {
      return { ok: false, error: 'mdd-file' };
    }
    // 4T-0323 (Epic 3E-0058): harte Bereichs-Grenze als zweite Linie hinter
    // den UI-Pfaden — Bereichs-Apps lesen keine Dateien ausserhalb des
    // Bereichs, egal ueber welchen Weg der Pfad hereinkommt.
    const ownerArea = areaOfWindow(senderWindow(event));
    if (ownerArea && !isInsideArea(ownerArea.rootPath, filePath)) {
      return { ok: false, error: 'outside-area' };
    }
    try {
      const absolute = path.resolve(filePath);
      const raw = await fs.readFile(absolute, 'utf8');
      // M-04 (4T-0173): UTF-8-BOM entfernen. markdown-it normalisiert kein
      // BOM — ein '# Heading' in Zeile 1 wuerde nicht als Heading erkannt,
      // und die Frontmatter-Erkennung ('---' an Zeilenanfang) schluege fehl.
      // 4T-0069 (Epic 3E-0012): Zeilenenden auf LF normalisieren, damit der
      // Lese-Pfad symmetrisch zu file:save ist (das ebenfalls CRLF zu LF
      // konvertiert). Hintergrund: CodeMirror normalisiert beim
      // EditorState.create() intern auf LF, und der dirty-Flag-Vergleich
      // gegen tab.originalContent schlug bei CRLF-Dateien sonst sofort an —
      // selbst ohne User-Aenderung wurde der Tab als geaendert markiert.
      const content = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      // Kein pushRecent hier — file:read deckt auch passive Pfade ab
      // (Sitzungs-Restore, Auto-Reload). Aktives Oeffnen meldet sich separat
      // ueber recent:push aus dem Renderer.
      watchFile(absolute, event.sender.id);
      // 4T-0331 (Epic 3E-0060): Hash-Abgleich beim Oeffnen — Fremd-
      // Aenderungen landen sofort als external-Paket in der .mdd.
      // Fire-and-forget: das Oeffnen wartet nicht auf die Historie.
      const readOwner = senderWindow(event);
      void (async () => {
        const resolved = await resolveHistoryFor(readOwner, absolute, content);
        if (resolved.effective) await recordMddExternalOnOpen(readOwner, absolute, content);
      })();
      return { ok: true, path: absolute, content };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  ipcMain.handle('file:resolveLink', async (_event, basePath, target) => {
    // M-05 (4T-0173): defensive Behandlung. decodeURI wirft bei '%' im
    // Link (URIError), path.dirname(null) bei pfadlosem Tab (TypeError);
    // beides liess den Klick mit unhandled rejection verpuffen. Muster
    // analog zum Schwester-Handler embed:read: validieren, try/catch,
    // bei Fehler null.
    if (!basePath || typeof basePath !== 'string') return null;
    if (!target || typeof target !== 'string') return null;
    if (/^[a-z]+:\/\//i.test(target)) return null;
    try {
      const decoded = decodeURI(target.split('#')[0]);
      if (!decoded) return null;
      return path.resolve(path.dirname(basePath), decoded);
    } catch {
      return null;
    }
  });

  ipcMain.handle('file:isMarkdown', (_event, p) => isMarkdownPath(p));

  ipcMain.handle('file:exists', async (_event, p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  });

  // 4T-0604 (Epic 3E-0113): Dateisystem-Zeitstempel für die Automatik der
  // created/updated-Frontmatter-Felder. fs.stat gibt es nur im Main, der
  // Speicher-Hook läuft im Renderer. birthtimeMs ist auf manchen Dateisystemen
  // 0 oder fehlt; dann dient ctimeMs als Näherung, und der Aufrufer fällt
  // notfalls auf den Speicherzeitpunkt zurück.
  ipcMain.handle('file:getTimes', async (_event, p) => {
    try {
      const st = await fs.stat(p);
      return { birthtimeMs: st.birthtimeMs || st.ctimeMs || 0, mtimeMs: st.mtimeMs || 0 };
    } catch {
      return null;
    }
  });

  ipcMain.handle('file:unwatch', async (event, p) => {
    await unwatchFile(p, event.sender.id);
  });

  // --- 4T-0332 (Epic 3E-0060): Historisierungs-Schaltung ---------------------

  // Zustand fuer die Statusbar: wirksame Einstellung samt Herkunft, dazu ob
  // eine .mdd existiert (aktiv/pausiert/inaktiv) und ob die Protokollierung
  // wegen defekter .mdd ausgesetzt ist.
  ipcMain.handle('history:getState', async (event, filePath, content) => {
    const owner = senderWindow(event);
    if (typeof filePath !== 'string' || !filePath) {
      const resolved = await resolveHistoryFor(owner, null, content);
      return { ...resolved, mddExists: false, suspended: false };
    }
    const absolute = path.resolve(filePath);
    const resolved = await resolveHistoryFor(owner, absolute, content);
    let mddExists = false;
    try {
      await fs.access(mddPathFor(absolute));
      mddExists = true;
    } catch {
      /* keine .mdd vorhanden */
    }
    return { ...resolved, mddExists, suspended: mddSuspendedPaths.has(mddKeyOf(absolute)) };
  });

  // Bereichs-Default lesen (null = nicht gesetzt, erben).
  ipcMain.handle('history:getAreaDefault', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { hasArea: false, value: null };
    const value = await readAreaHistoryDefault(area.rootPath);
    return { hasArea: true, value: value === undefined ? null : value };
  });

  // Bereichs-Default setzen (true/false) oder entfernen (null = erben).
  // Die Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen
  // (Epic-Entscheidung: nur bei Bedarf anlegen); eine defekte Bereichsdatei
  // wird nie ueberschrieben.
  ipcMain.handle('history:setAreaDefault', async (event, value) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      if (value === true || value === false) container.settings.history = value;
      else delete container.settings.history;
      if (raw === null && value !== true && value !== false) {
        return { ok: true }; // erben ohne bestehende Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0333 (Epic 3E-0060): Historien-Ansicht ------------------------------

  // Revisionsliste eines Dokuments: Ausgangsstand (erster Anker) plus alle
  // Pakete mit Zeitstempeln, Ausloeser und Umfangs-Angabe. Ohne .mdd eine
  // leere Liste (die Ansicht zeigt dann den Leer-Zustand).
  ipcMain.handle('history:list', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const history = parsed.container.history;
      const initial = history.anchors.length > 0 ? { ts: history.anchors[0].ts } : null;
      const revisions = history.packets.map((p, i) => {
        const { added, removed } = countChanges(p.ops);
        return { seq: i, ts: p.ts, tsEnd: p.tsEnd, trigger: p.trigger, added, removed };
      });
      return { ok: true, initial, revisions };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true, initial: null, revisions: [] };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // Rekonstruierter Stand einer Revision. seq: -1 = Ausgangsstand,
  // 0..n-1 = Stand nach Paket seq, 'current' = realer Datei-Inhalt
  // (BOM-/LF-normalisiert, fuer den Vergleich gegen den Ist-Stand).
  ipcMain.handle('history:getRevision', async (_event, filePath, seq) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      if (seq === 'current') {
        const text = await readPreviousTextFor(absolute);
        if (text === null) return { ok: false, error: 'file not readable' };
        return { ok: true, text };
      }
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const n = Number(seq);
      if (!Number.isInteger(n) || n < -1 || n >= parsed.container.history.packets.length) {
        return { ok: false, error: 'invalid revision' };
      }
      return { ok: true, text: mddStore.reconstructRevision(parsed.container.history, n) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0358 (Epic 3E-0066): Dokument-Notiz ---------------------------------

  // Notiz eines Dokuments aus der `notes`-Sektion der .mdd lesen. Ohne .mdd
  // eine leere Notiz (null). Eine defekte .mdd meldet den Fehler, setzt die
  // Notiz aber NICHT aus — Lesen ist idempotent (wie history:list); der
  // Schreib-Pfad kümmert sich um das Aussetzen.
  ipcMain.handle('note:read', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, note: mddStore.getNote(parsed.container) };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true, note: null };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // Notiz ersatzlos schreiben (keine Historie). Ohne .mdd wird sie mit einem
  // leeren Container angelegt; leerer Text entfernt die Sektion. Eine defekte
  // .mdd setzt die Notiz-Funktion aus (mddSuspendedPaths) und wird nie
  // überschrieben (Fehler-Prinzip der Historie). Ein transienter Schreibfehler
  // meldet nur den Fehler, ohne dauerhaftes Aussetzen (explizite Nutzer-Aktion,
  // erneut versuchbar). Nach dem Schreiben Broadcast 'note:changed' an alle
  // Fenster, damit Panels derselben Datei nachziehen (Datengrundlage 4T-0359).
  ipcMain.handle('note:write', async (event, filePath, text) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const owner = senderWindow(event);
    const absolute = path.resolve(filePath);
    const key = mddKeyOf(absolute);
    if (mddSuspendedPaths.has(key)) return { ok: false, error: 'suspended' };
    const mddPath = mddPathFor(absolute);
    try {
      let container = mddStore.emptyContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseContainer(raw);
        if (!parsed.ok) {
          mddSuspendedPaths.add(key);
          notifyMddDefect(owner, absolute, parsed.error);
          return { ok: false, error: parsed.error };
        }
        container = parsed.container;
      }
      mddStore.setNote(container, text, Date.now());
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddPath, serialized);
      await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
      const note = mddStore.getNote(container);
      broadcast('note:changed', { path: absolute, note });
      return { ok: true, note };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0363 (Epic 3E-0067): Block-Metadaten lesen/schreiben/umbenennen ------
  // blockData:read liefert die rohe Anker->{values,updated}-Map (idempotent, ohne
  // Aussetzen); write setzt die values eines Ankers (leeres Objekt entfernt den
  // Eintrag); rename verschiebt einen Anker-Schluessel (Umbenennen/Zuordnen). Die
  // Anker-ID-Syntax wird streng gegen die gemeinsame Quelle geprueft.
  ipcMain.handle('blockData:read', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    const absolute = path.resolve(filePath);
    try {
      const raw = await fs.readFile(mddPathFor(absolute), 'utf8');
      const parsed = mddStore.parseContainer(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, blockData: mddStore.getAllBlockData(parsed.container) };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true, blockData: {} };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  ipcMain.handle('blockData:write', async (event, filePath, anchorId, values) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    if (!isValidBlockAnchorId(anchorId)) return { ok: false, error: 'invalid anchor id' };
    return writeBlockDataMutation(event, filePath, (container) => {
      mddStore.setBlockData(container, anchorId, sanitizeBlockValues(values), Date.now());
    });
  });

  ipcMain.handle('blockData:rename', async (event, filePath, fromId, toId) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    if (!isValidBlockAnchorId(fromId) || !isValidBlockAnchorId(toId)) {
      return { ok: false, error: 'invalid anchor id' };
    }
    return writeBlockDataMutation(event, filePath, (container) => {
      mddStore.renameBlockAnchor(container, fromId, toId, Date.now());
    });
  });

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    // W-21 (4T-0309): defensiver Typ-Guard — ein Nicht-String wuerde bei
    // startsWith einen TypeError ueber die IPC-Grenze werfen.
    if (typeof url !== 'string') return;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('settings:get', (_event, key) => store?.get(key));
  ipcMain.handle('settings:set', (event, key, value) => {
    store?.set(key, value);
    // Menue-relevante Settings spiegeln sich in den Haekchen wider. Bei einem
    // Wechsel in einem Fenster muessen alle Fenster-Menues angepasst werden.
    if (key === 'restoreSession' || key === 'autoSave') applyMenuToAllWindows();
    // M-08 (4T-0185): Sprachwechsel an alle anderen offenen Fenster
    // verteilen — vorher wirkte er nur im ausloesenden Fenster, die
    // uebrigen blieben bis zum Neustart in der alten Sprache. Das
    // ausloesende Fenster hat lokal bereits umgeschaltet.
    if (key === 'language') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('language:changed', value);
        }
      }
    }
    // 4T-0204: Task-Status-Set an alle Fenster broadcasten (auch an den
    // Sender — der Empfangspfad konfiguriert idempotent Pipeline und
    // Live-Modus und rendert offene Tabs neu).
    if (key === 'taskStates') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('taskStates:changed', value);
      }
    }
    // 4T-0612 (Epic 3E-0115, PO-Testbefund EXE 0.91.0.919): Der globale
    // (allgemeine) Lesezeichen-Baum liegt im Store und erreichte andere Fenster
    // bisher nicht — nur die BEREICHS-Lesezeichen synchronisierten ueber
    // 'bookmarks:changed'. Den Wechsel jetzt an die uebrigen Fenster verteilen
    // (Muster 'language:changed', ohne das ausloesende Fenster — das hat seinen
    // Baum bereits im Speicher aktualisiert und gerendert). Der Empfangspfad
    // uebernimmt den Baum und rendert den allgemeinen Abschnitt neu.
    if (key === 'bookmarksTree') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('bookmarksTree:changed', value);
        }
      }
    }
    // 4T-0498 (Epic 3E-0090): Aufgaben-Konfiguration (Global Filter,
    // Automatiken, Einfuege-Position) an alle Fenster broadcasten (auch an
    // den Sender — Muster taskStates).
    if (key === 'tasksConfig') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('tasksConfig:changed', value);
      }
    }
    // 4T-0528 (Epic 3E-0095): Erinnerungs-Konfiguration (Default-Uhrzeit,
    // Snooze-Optionen, System-Notification) an alle Fenster; der Main-
    // Pruefer liest pro Lauf ohnehin frisch aus dem Store.
    if (key === 'remindersConfig') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('remindersConfig:changed', value);
      }
    }
    // 4T-0284 (Epic 3E-0050): Frontmatter-Anzeige an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad konfiguriert
    // idempotent die Pipeline, invalidiert den Render-Cache und rendert
    // offene Tabs neu).
    if (key === 'render.showFrontmatter') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('frontmatterDisplay:changed', value);
      }
    }
    // 4T-0471 (Epic 3E-0087): Ueberschriften-Nummerierung (Objekt { enabled,
    // startLevel }) an alle Fenster broadcasten (auch an den Sender — der
    // Empfangspfad konfiguriert idempotent die Pipeline, invalidiert den
    // Render-Cache und rendert offene Tabs neu; Live und Outline ziehen mit).
    if (key === 'render.headingNumbering') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('headingNumbering:changed', value);
      }
    }
    // 4T-0312 (Epic 3E-0055): dauerhaft ausgeklappte Frontmatter-Darstellung
    // an alle Fenster broadcasten (auch an den Sender — der Empfangspfad
    // toggelt idempotent eine Root-Klasse).
    if (key === 'render.frontmatterExpanded') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('frontmatterExpanded:changed', value);
      }
    }
    // 4T-0414 (Epic 3E-0078): Skript-Block-Schalter an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad wendet idempotent
    // an, ein unveraenderter Zustand ist dort ein No-op).
    if (key === 'scripts.run') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('perspectiveScripts:changed', value);
      }
    }
    // 4T-0292 (Epic 3E-0052): Erweiterungs-Schalt-Zustand an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad wendet mit
    // persist:false an, ein unveraenderter Zustand ist dort ein No-op).
    // Menues neu bauen, damit Eintraege deaktivierter Erweiterungen
    // verschwinden (Filterung ueber die Kommando-Registry).
    if (key === 'extensions.disabled') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('extensions:changed', value);
      }
      applyMenuToAllWindows();
      // 4T-0630 (Epic 3E-0102): Erweiterung 'workspaces' aus -> Standard-
      // Titelleiste; ein -> Arbeitsbereichs-Farbe wieder anwenden.
      updateAllCaptionColors();
    }
    // 4T-0298 (Epic 3E-0053): Schalt-Zustand der EXTERNEN Erweiterungen an
    // alle Fenster broadcasten (auch an den Sender — der Empfangspfad laedt
    // Store-Stand und Scan neu und gleicht idempotent an). Die Enabled-Liste
    // wird vom Host immer als LETZTER Schluessel persistiert (nach trusted/
    // lastError), damit der Broadcast den fertigen Zustand sieht.
    if (key === 'extensionsExternal.enabled') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('extensionsExternal:changed', value);
      }
    }
    // 4T-0289 (Epic 3E-0051): Sidebar-Layout an alle Fenster broadcasten
    // (auch an den Sender — der Empfangspfad wendet mit persist:false an,
    // ein unveraendertes Layout ist dort ein No-op).
    if (key === 'sidebar.layout') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('sidebarLayout:changed', value);
      }
    }
    // 4T-0624 (Epic 3E-0119): globale Sidebar-Varianten an alle Fenster
    // broadcasten (Muster sidebar.layout: auch an den Sender, der
    // Empfangspfad normalisiert und persistiert nicht erneut).
    if (key === 'sidebar.layoutVariants') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('sidebarLayoutVariants:changed', value);
      }
    }
    // 4T-0569 (Epic 3E-0104): Panel-Toggle-Reihenfolge an alle Fenster
    // broadcasten (Muster sidebar.layout: auch an den Sender, Empfang mit
    // persist:false; die Statusbar-Anordnung und das Panel-Untermenue der
    // anderen Fenster ziehen sofort nach).
    if (key === 'panelToggle.order') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('panelToggleOrder:changed', value);
      }
    }
    // 4T-0520 (Epic 3E-0094): Kommando-Platzierung (eigene Statusbar-
    // Buttons, Kontextmenue-Sektion, Makros, Hide-Liste) an alle Fenster
    // broadcasten (Muster panelToggle.order: auch an den Sender, Empfang
    // mit persist:false; ein unveraenderter Stand ist dort ein No-op).
    if (key === 'commandPlacement') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('commandPlacement:changed', value);
      }
    }
    // 4T-0607 (Epic 3E-0114): Format-Toolbar-Belegung an alle Fenster
    // broadcasten (Muster commandPlacement).
    if (key === 'formatToolbar') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('formatToolbar:changed', value);
      }
    }
    // 4T-0372 (Epic 3E-0069): Uhr-Anzeige-Optionen an alle Fenster
    // broadcasten (Muster formatToolbar).
    if (key === 'clock.options') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clock:changed', value);
      }
    }
    // 4T-0637 (Epic 3E-0069): Wecker-Liste an alle Fenster broadcasten
    // (Muster clock.options). Der Pruefer liest pro Lauf ohnehin frisch aus
    // dem Store und braucht kein eigenes Signal.
    if (key === CLOCK_ALARMS_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockAlarms:changed', value);
      }
    }
    // 4T-0638 (Epic 3E-0069): Timer-Liste broadcasten und den Weckruf des
    // Pruefers nachziehen — ein neu gestarteter oder pausierter Timer
    // verschiebt den naechsten Ablauf.
    if (key === CLOCK_TIMERS_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockTimers:changed', value);
      }
      timerChecker.reschedule();
    }
    // Die Stoppuhr hat keine Faelligkeit und braucht deshalb nur den
    // Broadcast.
    if (key === 'clock.stopwatch') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockStopwatch:changed', value);
      }
    }
    // 4T-0639 (Epic 3E-0069): Panel-Ueberschriften als Icon — an alle
    // Fenster ausser dem Ausloeser (der hat lokal bereits umgeschaltet).
    if (key === 'sidebar.iconHeadings') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== event.sender) {
          w.webContents.send('sidebarIconHeadings:changed', value);
        }
      }
    }
    // 4T-0208: Hotkey-Overrides an alle Fenster broadcasten (auch an den
    // Sender — Empfang baut Dispatcher-Map und Editor-Keymap idempotent
    // neu) und die Menue-Accelerators aller Fenster aktualisieren.
    if (key === 'hotkeys') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('hotkeys:changed', value);
      }
      applyMenuToAllWindows();
    }
    // 4T-0018: appearance.*-Aenderung an alle Fenster broadcasten, damit
    // Schriftart und -groesse sofort ueberall greifen.
    if (typeof key === 'string' && key.startsWith('appearance.')) {
      const payload = {
        editorFont: store?.get('appearance.editorFont') || undefined,
        editorSize: store?.get('appearance.editorSize') || undefined,
        renderFont: store?.get('appearance.renderFont') || undefined,
        renderSize: store?.get('appearance.renderSize') || undefined,
        // 4T-0383 (Epic 3E-0072): Inhalts-Breite in Prozent; ungesetzt
        // (Alt-Profile) faellt der Empfaenger auf den Default zurueck.
        contentWidth: store?.get('appearance.contentWidth') || undefined,
        // 4T-0575 (Epic 3E-0106): Ecken-Form der Reiter. Bewusst als echter
        // Boolean statt nach dem ||-undefined-Muster darueber: der
        // Snapshot-Merge des Empfaengers (mergeAppearanceSnapshot) filtert
        // undefined heraus, ein Abschalten wuerde dort sonst nicht ankommen
        // und ein offener Einstellungs-Entwurf die Rundung zurueckdrehen.
        roundedTabs: store?.get('appearance.roundedTabs') === true,
        // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile, ebenfalls
        // als echter Boolean (Default an, nur explizites false schaltet ab).
        highlightActiveLine: store?.get('appearance.highlightActiveLine') !== false,
      };
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('appearance:changed', payload);
      }
    }
    // 4T-0465 (Epic 3E-0086): Farbschema-Zustand (Objekt { custom, activeLight,
    // activeDark }) an alle Fenster broadcasten (auch an den Sender — der
    // Empfangspfad normalisiert und wendet idempotent an).
    if (key === 'colorSchemes') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('colorScheme:changed', value);
      }
    }
  });

  // Renderer meldet ein aktives Datei-Oeffnen, damit der Pfad in die Recent-
  // Liste rutscht. Wird in openInPane aufgerufen, nicht beim Restore/Reload.
  ipcMain.handle('recent:push', (_event, filePath) => {
    // W-21 (4T-0309): Typ-Guard — path.resolve(nichtString) wirft TypeError.
    if (typeof filePath !== 'string' || !filePath) return;
    pushRecent(path.resolve(filePath));
  });

  // Datei speichern (Inhalt nach UTF-8/LF, kein BOM). Markiert den Pfad als
  // Eigen-Schreibvorgang, damit der Watcher nicht meldet.
  ipcMain.handle('file:save', async (event, filePath, content) => {
    // W-02 (4T-0309): Typ-Guard und {ok,error}-Rueckgabe statt throw ueber die
    // IPC-Grenze (Entwicklungsrichtlinien §3).
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'file:save ohne Pfad aufgerufen' };
    }
    try {
      const absolute = path.resolve(filePath);
      const normalized = String(content || '').replace(/\r\n/g, '\n');
      // 4T-0331 (Epic 3E-0060): Basis fuer das Aenderungsprotokoll VOR dem
      // Ueberschreiben lesen (nur bei aktiver Historisierung; Aufloesung
      // Datei > Bereich > App aus 4T-0332).
      const owner = senderWindow(event);
      const recordHistory = (await resolveHistoryFor(owner, absolute, normalized)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(absolute) : null;
      markSelfWriting(absolute, normalized);
      await fs.writeFile(absolute, normalized, { encoding: 'utf8' });
      if (recordHistory) {
        await recordMddOnSave(owner, absolute, previousText, normalized);
      }
      return { ok: true, path: absolute };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // Speichern unter: OS-Dialog, dann schreiben. Returnt den gewaehlten Pfad
  // oder null, wenn der Nutzer abgebrochen hat.
  ipcMain.handle('file:saveAs', async (event, suggestedPath, content) => {
    const owner = senderWindow(event);
    // 4T-0323 (Epic 3E-0058): in Bereichs-Apps liegt die Vorbelegung im
    // Bereich; ein Ziel ausserhalb wird gemeldet und der Dialog erneut
    // geoeffnet (harte Grenze auch beim Speichern).
    const area = areaOfWindow(owner);
    // Wenn der Tab keinen Pfad hat, lokalisierten "Unbenannt"-Stamm plus .md
    // als Default vorschlagen (z.B. "Unbenannt.md" auf Deutsch).
    let defaultPath = suggestedPath || `${tForWindow(owner, 'save.untitled')}.md`;
    if (area) {
      if (!suggestedPath) {
        defaultPath = path.join(area.rootPath, `${tForWindow(owner, 'save.untitled')}.md`);
      } else if (!isInsideArea(area.rootPath, suggestedPath)) {
        defaultPath = path.join(area.rootPath, path.basename(suggestedPath));
      }
    }
    for (;;) {
      const dlgResult = await dialog.showSaveDialog(owner || undefined, {
        title: tForWindow(owner, 'save.saveAsTitle'),
        defaultPath,
        // M-09 (4T-0185): Filter-Namen lokalisiert.
        filters: [
          {
            name: tForWindow(owner, 'dialog.filterMarkdown'),
            extensions: ['md', 'markdown', 'mdown', 'mkd'],
          },
          { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
        ],
      });
      // W-03 (4T-0309): Abbruch als {ok:false, canceled} statt null; Schreib-
      // fehler als {ok:false, error} statt throw (Entwicklungsrichtlinien §3).
      if (dlgResult.canceled || !dlgResult.filePath) return { ok: false, canceled: true };
      const absolute = path.resolve(dlgResult.filePath);
      if (area && !isInsideArea(area.rootPath, absolute)) {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'area.outsideTitle'),
          message: tForWindow(owner, 'area.outsideSaveMessage'),
          detail: absolute,
          buttons: ['OK'],
        });
        defaultPath = path.join(area.rootPath, path.basename(absolute));
        continue;
      }
      try {
        const normalized = String(content || '').replace(/\r\n/g, '\n');
        // 4T-0331 (Epic 3E-0060): Protokoll-Basis vor dem Ueberschreiben.
        const recordHistory = (await resolveHistoryFor(owner, absolute, normalized)).effective;
        const previousText = recordHistory ? await readPreviousTextFor(absolute) : null;
        markSelfWriting(absolute, normalized);
        await fs.writeFile(absolute, normalized, { encoding: 'utf8' });
        if (recordHistory) {
          await recordMddOnSave(owner, absolute, previousText, normalized);
        }
        pushRecent(absolute);
        return { ok: true, path: absolute };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }
  });

  // --- 4T-0339/4T-0340 (Epic 3E-0061): Datei umbenennen ------------------------
  // Benennt eine Markdown-Datei im selben Ordner um und kaskadiert ueber
  // ihren Unterseiten-Baum (4T-0340: Praefix-Ersetzung im Basename aller
  // Nachfahren, jede Datei in ihrem eigenen Ordner). Pro Datei ziehen die
  // Main-seitigen Konsumenten nach: Datei-Watcher (Owner-Transfer ohne
  // unlink-Rauschen), .mdd-Begleitdatei (3E-0060), offene Historien-
  // Pakete, Recent-Files-Liste. Der Broadcast 'file:renamed' erreicht alle
  // Fenster; der Renderer zieht Tabs, Lesezeichen, Per-Datei-Settings und
  // Sitzung nach. Kollisions-Pruefung ueber ALLE Ziele vor der ersten
  // Umbenennung (reine Case-Aenderung auf NTFS bleibt erlaubt); ein
  // Teilfehler stoppt die Kaskade und wird als 'partial' gemeldet.
  async function renameSingleFile(absolute, newPath) {
    // Watcher der alten Datei VOR dem Rename schliessen, damit kein
    // unlink-Event ('file:removed') die Tabs als fehlend markiert; die
    // Owner werden nach dem Rename auf den neuen Pfad umgemeldet.
    const watchEntry = watchers.get(absolute);
    const watchOwners = watchEntry ? [...watchEntry.owners] : [];
    if (watchEntry) {
      try {
        await watchEntry.watcher.close();
      } catch {
        /* ignore */
      }
      watchers.delete(absolute);
    }
    try {
      await fs.rename(absolute, newPath);
    } catch (err) {
      // Rueckbau: alte Watcher wiederherstellen, Zustand bleibt konsistent.
      for (const id of watchOwners) watchFile(absolute, id);
      const msg = err && err.message ? String(err.message) : String(err);
      return { ok: false, error: msg };
    }
    for (const id of watchOwners) watchFile(newPath, id);
    // .mdd-Begleitdatei mitziehen (3E-0060); Fehler sind nicht fatal —
    // der Hash-Abgleich der Historie faengt eine verwaiste .mdd ab.
    try {
      const oldMdd = mddPathFor(absolute);
      await fs.access(oldMdd);
      await fs.rename(oldMdd, mddPathFor(newPath));
    } catch {
      /* keine .mdd oder nicht verschiebbar */
    }
    // Offene Historien-Pakete und Suspend-Markierung auf den neuen Pfad.
    const oldKey = mddKeyOf(absolute);
    const newKey = mddKeyOf(newPath);
    if (mddOpenPackets.has(oldKey)) {
      mddOpenPackets.set(newKey, mddOpenPackets.get(oldKey));
      mddOpenPackets.delete(oldKey);
    }
    if (mddSuspendedPaths.has(oldKey)) {
      mddSuspendedPaths.delete(oldKey);
      mddSuspendedPaths.add(newKey);
    }
    // Recent-Files-Eintrag ersetzen (Position bleibt erhalten).
    if (store) {
      const recent = store.get('recentFiles', []);
      if (recent.includes(absolute)) {
        store.set(
          'recentFiles',
          recent.map((p) => (p === absolute ? newPath : p)),
        );
        applyMenuToAllWindows();
      }
    }
    broadcast('file:renamed', { oldPath: absolute, newPath });
    return { ok: true };
  }

  // 4T-0340: Nachfahren einer Seite im Suchraum finden — alle Markdown-
  // Dateien, deren Basename mit '<Name>∕' beginnt. Suchraum und Ignore-
  // Regeln wie der Backlinks-Index (Ordner der Datei plus zwei Unterordner-
  // Ebenen; node_modules und Punkt-Ordner bleiben draussen); Vergleich
  // NFC-normalisiert und case-insensitiv wie die Wiki-Aufloesung.
  async function scanSubpageDescendants(absolute) {
    const rootDir = path.dirname(absolute);
    const prefixKey = subpages
      .childPrefix(path.parse(absolute).name)
      .normalize('NFC')
      .toLowerCase();
    const out = [];
    const queue = [{ dir: rootDir, depth: 0 }];
    while (queue.length > 0) {
      const { dir, depth } = queue.shift();
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          if (depth < 2) queue.push({ dir: full, depth: depth + 1 });
        } else if (entry.isFile() && isMarkdownPath(entry.name)) {
          const nameKey = path.parse(entry.name).name.normalize('NFC').toLowerCase();
          if (nameKey.startsWith(prefixKey)) out.push(full);
        }
      }
    }
    return out;
  }

  // 4T-0340: Nachfahren-Liste fuer den Dialog-Hinweis des Renderers.
  ipcMain.handle('subpage:descendants', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, files: [] };
    try {
      const files = await scanSubpageDescendants(path.resolve(filePath));
      return { ok: true, files };
    } catch {
      return { ok: false, files: [] };
    }
  });

  ipcMain.handle('file:rename', async (event, params) => {
    const oldPath = params && params.oldPath;
    const newBasename =
      typeof (params && params.newBasename) === 'string' ? params.newBasename.trim() : '';
    if (typeof oldPath !== 'string' || !oldPath) return { ok: false, error: 'invalid path' };
    const vErr = subpages.basenameValidationError(newBasename);
    if (vErr) return { ok: false, error: 'invalid name', code: vErr };
    const absolute = path.resolve(oldPath);
    const parsed = path.parse(absolute);
    const ext = parsed.ext || '.md';
    const newPath = path.join(parsed.dir, newBasename + ext);
    if (newPath === absolute) return { ok: true, path: absolute, unchanged: true };
    // 4T-0340: Unterseiten-Baum ermitteln und Ziel-Paare bilden
    // (Praefix-Ersetzung des geaenderten Namens-Anteils).
    const oldBase = parsed.name;
    const pairs = [{ from: absolute, to: newPath }];
    for (const d of await scanSubpageDescendants(absolute)) {
      const dParsed = path.parse(d);
      const rest = dParsed.name.slice(oldBase.length); // beginnt mit U+2215
      pairs.push({ from: d, to: path.join(dParsed.dir, newBasename + rest + dParsed.ext) });
    }
    // Kollisions-Pruefung ueber alle Ziele VOR der ersten Umbenennung.
    for (const pair of pairs) {
      if (pair.to.toLowerCase() === pair.from.toLowerCase()) continue;
      try {
        await fs.access(pair.to);
        return { ok: false, error: 'exists', code: 'exists', conflictPath: pair.to };
      } catch {
        /* Ziel frei */
      }
    }
    let renamedCount = 0;
    for (const pair of pairs) {
      const res = await renameSingleFile(pair.from, pair.to);
      if (!res.ok) {
        // Teilfehler: Kaskade stoppt; bereits umbenannte Dateien sind per
        // Broadcast konsistent nachgezogen, der Renderer meldet den Stand.
        return {
          ok: false,
          error: res.error,
          code: 'partial',
          renamedCount,
          totalCount: pairs.length,
          failedPath: pair.from,
        };
      }
      renamedCount++;
    }
    // 4T-0345 (Epic 3E-0062): eingehende Links auf die umbenannten Dateien
    // anpassen (Standard aktiv; der Dialog aus 4T-0346 schaltet updateLinks um).
    // Best-Effort nach vollzogener Umbenennung: ein Fehler hier laesst das
    // Rename-Ergebnis nicht scheitern.
    const updateLinks = !(params && params.updateLinks === false);
    let linkUpdate = null;
    if (updateLinks) {
      try {
        const owner = senderWindow(event);
        linkUpdate = await applyLinkUpdatesForRename(owner, pairs, newPath);
        broadcast('linkUpdate:applied', {
          renames: renamesFromPairs(pairs),
          updated: linkUpdate.updated,
          failed: linkUpdate.failed,
        });
      } catch (err) {
        console.error('[link-update] fehlgeschlagen:', err && err.message ? err.message : err);
      }
    }
    // 4T-0346 (Epic 3E-0062): linkUpdate im Ergebnis, damit der ausloesende
    // Renderer den Bericht ohne den (an alle Fenster gehenden) Broadcast bauen
    // kann; { updated:[{path,count}], failed:[{path,error}] } oder null. `renamed`
    // traegt alle neuen Pfade (Hauptdatei plus Kaskaden-Nachfahren).
    return {
      ok: true,
      path: newPath,
      renamedCount,
      renamed: pairs.map((p) => p.to),
      linkUpdate,
    };
  });

  // 4T-0345 (Epic 3E-0062): Vorschau-Datenpfad fuer den Umbenennen-Dialog
  // (4T-0346). Dry-Run vor der Umbenennung: liefert die betroffenen Dateien mit
  // Trefferzahl, ohne zu schreiben. Die alten Dateien existieren noch, deshalb
  // ist der Suchraum-Anker der alte Pfad. Die Dirty-Kennzeichnung ergaenzt der
  // Renderer aus seinen offenen Tabs (der Main fuehrt keinen Dirty-Status).
  ipcMain.handle('rename:linkUpdatePreview', async (event, params) => {
    const oldPath = params && params.oldPath;
    const newBasename =
      typeof (params && params.newBasename) === 'string' ? params.newBasename.trim() : '';
    if (typeof oldPath !== 'string' || !oldPath) return { ok: false, error: 'invalid path' };
    if (subpages.basenameValidationError(newBasename)) return { ok: false, error: 'invalid name' };
    const absolute = path.resolve(oldPath);
    const parsed = path.parse(absolute);
    const ext = parsed.ext || '.md';
    const newPath = path.join(parsed.dir, newBasename + ext);
    const oldBase = parsed.name;
    const pairs = [{ from: absolute, to: newPath }];
    for (const d of await scanSubpageDescendants(absolute)) {
      const dParsed = path.parse(d);
      const rest = dParsed.name.slice(oldBase.length);
      pairs.push({ from: d, to: path.join(dParsed.dir, newBasename + rest + dParsed.ext) });
    }
    const owner = senderWindow(event);
    const items = await computeLinkUpdatePreview(owner, pairs, absolute);
    return { ok: true, items };
  });

  // --- 4T-0303 (Epic 3E-0054): PDF-Export ------------------------------------
  // Zwei getrennte Endpunkte: pdf:chooseTarget zeigt den Save-Dialog,
  // pdf:print druckt und schreibt. Getrennt, damit der Renderer den
  // Print-Zustand (Light-Override, printing-Klassen) erst NACH dem Dialog
  // aufbaut — sonst stuende der native Dialog sichtbar ueber einem Fenster
  // im Print-Layout.
  ipcMain.handle('pdf:chooseTarget', async (event, params) => {
    const owner = senderWindow(event);
    const suggestedPath =
      params && typeof params.suggestedPath === 'string' && params.suggestedPath
        ? params.suggestedPath
        : null;
    const suggestedName =
      params && typeof params.suggestedName === 'string' && params.suggestedName
        ? params.suggestedName
        : null;
    // Tab mit Pfad: <basename>.pdf im selben Ordner (kommt fertig aus dem
    // Renderer). Pfadloser Tab (Unbenannt, Handbuch): Name im Home-Verzeichnis.
    const defaultPath =
      suggestedPath ||
      path.join(
        app.getPath('home'),
        suggestedName || `${tForWindow(owner, 'pdf.defaultUntitled')}.pdf`,
      );
    const dlgResult = await dialog.showSaveDialog(owner || undefined, {
      title: tForWindow(owner, 'pdf.saveDialogTitle'),
      defaultPath,
      filters: [{ name: tForWindow(owner, 'dialog.filterPdf'), extensions: ['pdf'] }],
    });
    if (dlgResult.canceled || !dlgResult.filePath) return { ok: false, canceled: true };
    return { ok: true, path: path.resolve(dlgResult.filePath) };
  });

  ipcMain.handle('pdf:print', async (event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath) {
      return { ok: false, error: 'pdf:print ohne Pfad aufgerufen' };
    }
    const owner = senderWindow(event);
    if (!owner || owner.isDestroyed()) {
      return { ok: false, error: 'Fenster nicht mehr verfuegbar' };
    }
    // Chromium malt die Fenster-Hintergrundfarbe als Seiten-Grund unter
    // die Druck-Raender. Im Dark-Theme ist das #1e1e1e (createWindow) und
    // ergaebe einen dunklen Rahmen um jede Seite — fuer die Druck-Dauer
    // auf Weiss stellen und danach zuruecksetzen (Spike-Befund 4T-0303,
    // Rest des Fehlerbilds 1 aus 4T-0024).
    const savedBackgroundColor = owner.getBackgroundColor();
    try {
      owner.setBackgroundColor('#ffffff');
      // Format, Ausrichtung und Raender aus den Export-Einstellungen
      // (4T-0304); fehlende oder ungueltige Werte fallen im Mapping auf
      // die Defaults A4/Hochformat/normal zurueck.
      const options = printToPdfOptions({
        pageSize: store?.get('export.pdf.pageSize'),
        landscape: store?.get('export.pdf.landscape'),
        margins: store?.get('export.pdf.margins'),
      });
      const buffer = await owner.webContents.printToPDF(options);
      const absolute = path.resolve(targetPath);
      await fs.writeFile(absolute, buffer);
      return { ok: true, path: absolute };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      if (!owner.isDestroyed() && savedBackgroundColor) {
        owner.setBackgroundColor(savedBackgroundColor);
      }
    }
  });

  // Dirty-Tab-Schliessen-Dialog. Returnt 'save' | 'discard' | 'cancel'.
  ipcMain.handle('dialog:confirmCloseDirty', async (event, opts) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('save.unsavedTitle'),
      message: t('save.unsavedMessage'),
      detail: opts && opts.detail ? opts.detail : '',
      buttons: [t('save.btnSave'), t('save.btnDiscard'), t('save.btnCancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (result.response === 0) return 'save';
    if (result.response === 1) return 'discard';
    return 'cancel';
  });

  // Externer-Change-Konflikt-Dialog. Returnt 'reload' | 'keepOurs'.
  ipcMain.handle('dialog:confirmConflict', async (event, opts) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('save.conflictTitle'),
      message: t('save.conflictMessage'),
      detail: opts && opts.detail ? opts.detail : '',
      buttons: [t('save.conflictReload'), t('save.conflictKeepOurs')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) return 'reload';
    return 'keepOurs';
  });

  // 4T-0512 (Epic 3E-0092): Lösch-Bestätigung eines Ereignis-Eintrags
  // (Referenz-Verhalten: Löschen nur mit Bestätigung; Abbrechen ist
  // Default und Escape-Ziel).
  ipcMain.handle('events:confirmDelete', async (event, entryText) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('events.confirmDelete.title'),
      message: t('events.confirmDelete.message').replace(
        '{text}',
        typeof entryText === 'string' ? entryText : '',
      ),
      buttons: [t('events.confirmDelete.confirm'), t('events.confirmDelete.cancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // 4T-0747 (Epic 3E-0138): Schutz der abgeleiteten Zeitrechnungen. Eine
  // wirksame Änderung an einer Bezugs-Zeitrechnung verschiebt auch deren
  // Werte, deshalb Bestätigung vor dem Anwenden; das Löschen einer
  // Zeitrechnung mit Abhängigen ist gesperrt und meldet nur (Muster
  // events:confirmDelete).
  ipcMain.handle('calendar:confirmDependents', async (event, names) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const list = Array.isArray(names) ? names.join(', ') : '';
    const count = Array.isArray(names) ? names.length : 0;
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('settings.calendar.derivedConfirm.title'),
      message: t('settings.calendar.derivedConfirm.message')
        .replace('{count}', String(count))
        .replace('{names}', list),
      buttons: [
        t('settings.calendar.derivedConfirm.apply'),
        t('settings.calendar.derivedConfirm.cancel'),
      ],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  ipcMain.handle('calendar:blockedDelete', async (event, names) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    await dialog.showMessageBox(owner || undefined, {
      type: 'info',
      title: t('settings.calendar.derivedBlocked.title'),
      message: t('settings.calendar.derivedBlocked.message')
        .replace('{count}', String(Array.isArray(names) ? names.length : 0))
        .replace('{names}', Array.isArray(names) ? names.join(', ') : ''),
      buttons: [t('settings.calendar.derivedBlocked.ok')],
      noLink: true,
    });
    return true;
  });

  // Schreibfehler-Dialog (Datei nicht schreibbar etc.).
  ipcMain.handle('dialog:showSaveError', async (event, detail) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    await dialog.showMessageBox(owner || undefined, {
      type: 'error',
      title: t('save.errorTitle'),
      message: t('save.errorMessage'),
      detail: detail || '',
      buttons: ['OK'],
    });
  });

  // Renderer signalisiert, dass das Fenster nun tatsaechlich geschlossen
  // werden darf (alle dirtigen Tabs wurden gespeichert oder verworfen).
  ipcMain.handle('window:confirmClose', (event) => {
    const w = senderWindow(event);
    if (w && !w.isDestroyed()) {
      confirmedClosings.add(w);
      w.close();
    }
  });

  // M-01 (4T-0173): Renderer signalisiert, dass der Nutzer das Schliessen
  // bzw. Beenden ABGEBROCHEN hat. Ohne diesen Reset bliebe isQuitting nach
  // einem abgebrochenen Quit dauerhaft true und die Session-Persistenz der
  // close-Handler fiele fuer den Rest der Laufzeit aus. Nebenwirkung
  // (dokumentiert im Task): nicht-dirty Fenster, die sich beim abgebrochenen
  // Quit bereits geschlossen haben, bleiben geschlossen; der Reset stellt
  // nur die Persistenz wieder her.
  ipcMain.handle('window:cancelClose', () => {
    isQuitting = false;
    // 4T-0322: laufende Bereich-Schliessen-Kaskade abbrechen.
    if (cascadeCancel) cascadeCancel();
  });

  // --- Arbeitsbereiche: Lebenszyklus (4T-0537, Epic 3E-0098) -----------------
  // Benannte, mehrfach abgelegte logische Applikationen (Workshop-Protokoll
  // in 4T-0536). Nach jeder Ablage-Aenderung geht 'workspaces:changed' an
  // alle Fenster (Muster journals:changed); die UI (4T-0538) zieht Untermenue
  // und Verwaltungs-Dialog darueber nach.

  // Metadaten-Liste ohne App-Snapshot. 'open' ist der LAUFZEIT-Zustand aus
  // der Registry (fuer die Offen-Markierung der UI); der persistierte
  // open-Merker der Ablage steuert dagegen die Sitzungs-Wiederherstellung.
  ipcMain.handle('workspace:list', () => {
    return workspacesState.map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      open: appRegistry.findAppByWorkspaceId(w.id) != null,
      lastOpenedAt: w.lastOpenedAt,
    }));
  });

  // Weg a (Workshop-Punkt 4): die laufende App des Senders samt aller
  // Fenster als Arbeitsbereich benennen. Der Live-Snapshot wird Erst-Stand
  // der Ablage; danach haelt persistAllWindows den Eintrag laufend aktuell.
  ipcMain.handle('workspace:saveAs', (event, params) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    if (appId == null) return { ok: false, error: 'no app' };
    if (appRegistry.getWorkspace(appId)) return { ok: false, error: 'already workspace' };
    const name = typeof params?.name === 'string' ? params.name.trim() : '';
    if (!name) return { ok: false, error: 'empty name' };
    const snapshot = liveAppSnapshot(appId);
    if (!snapshot) return { ok: false, error: 'no windows' };
    const entry = {
      id: crypto.randomUUID(),
      name,
      color: TAB_GROUP_COLOR_KEYS.includes(params?.color) ? params.color : TAB_GROUP_COLOR_KEYS[0],
      open: true,
      lastOpenedAt: utcNowSeconds(),
      app: snapshot,
    };
    workspacesState.push(entry);
    appRegistry.setWorkspace(appId, { id: entry.id, name: entry.name });
    persistAllWindows();
    broadcastDisplayInfo();
    workspacesChanged();
    // 4T-0630 (Epic 3E-0102): Bestands-Fenster der benannten App faerben.
    updateAllCaptionColors();
    return { ok: true, id: entry.id };
  });

  // Weg b (Workshop-Punkt 4): leerer Arbeitsbereich; oeffnet sofort ein
  // neues leeres Fenster als dessen Applikation.
  ipcMain.handle('workspace:create', (event, params) => {
    const name = typeof params?.name === 'string' ? params.name.trim() : '';
    if (!name) return { ok: false, error: 'empty name' };
    const entry = {
      id: crypto.randomUUID(),
      name,
      color: TAB_GROUP_COLOR_KEYS.includes(params?.color) ? params.color : TAB_GROUP_COLOR_KEYS[0],
      open: true,
      lastOpenedAt: utcNowSeconds(),
      app: { area: null, windows: [{ bounds: null, maximized: false, panes: [] }] },
    };
    workspacesState.push(entry);
    const appId = appRegistry.createApp(null);
    appRegistry.setWorkspace(appId, { id: entry.id, name: entry.name });
    createWindow({ appId });
    persistAllWindows();
    workspacesChanged();
    return { ok: true, id: entry.id };
  });

  // Oeffnen bzw. Fokussieren — Kern in openWorkspaceById (4T-0538: auch
  // Menue-Action der Untermenue-Liste).
  ipcMain.handle('workspace:open', (event, id) => openWorkspaceById(id, senderWindow(event)));

  // 4T-0538: Loesch-Bestaetigung als nativer Dialog (Muster
  // events:confirmDelete); der Verwaltungs-Dialog fragt vor workspace:delete.
  ipcMain.handle('workspace:confirmDelete', async (event, name) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'question',
      title: t('workspace.confirmDelete.title'),
      message: t('workspace.confirmDelete.message').replace('{name}', String(name || '')),
      buttons: [t('workspace.confirmDelete.btnYes'), t('workspace.confirmDelete.btnNo')],
      defaultId: 1,
      cancelId: 1,
    });
    return { confirmed: result.response === 0 };
  });

  // Schliessen friert den Stand ein: Kaskade ueber den bestehenden
  // Dirty-Pfad (Abbruch stoppt, Offen-Merker bleibt); den Merker selbst
  // setzt der closed-Pfad des letzten Fensters.
  ipcMain.handle('workspace:close', async (event) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    if (appId == null || !appRegistry.getWorkspace(appId)) {
      return { ok: false, error: 'not a workspace' };
    }
    return closeAppWindows(appId);
  });

  ipcMain.handle('workspace:rename', (event, params) => {
    const entry = workspacesState.find((w) => w.id === params?.id);
    if (!entry) return { ok: false, error: 'unknown workspace' };
    const name = typeof params?.name === 'string' ? params.name.trim() : '';
    if (!name) return { ok: false, error: 'empty name' };
    entry.name = name;
    const appId = appRegistry.findAppByWorkspaceId(entry.id);
    if (appId != null) {
      appRegistry.setWorkspace(appId, { id: entry.id, name });
      broadcastDisplayInfo();
    }
    persistAllWindows();
    workspacesChanged();
    return { ok: true };
  });

  ipcMain.handle('workspace:setColor', (event, params) => {
    const entry = workspacesState.find((w) => w.id === params?.id);
    if (!entry) return { ok: false, error: 'unknown workspace' };
    if (!TAB_GROUP_COLOR_KEYS.includes(params?.color)) {
      return { ok: false, error: 'invalid color' };
    }
    entry.color = params.color;
    persistAllWindows();
    workspacesChanged();
    // 4T-0630 (Epic 3E-0102): offener Arbeitsbereich — alle seine Fenster
    // sofort umfaerben (einziger workspace-Handler ohne Fenster-Refresh).
    updateAllCaptionColors();
    return { ok: true };
  });

  // Loeschen entfernt nur die Ablage, nie Dateien; ein offener
  // Arbeitsbereich wird zur unbenannten App degradiert (Zuordnung loesen,
  // Fenster bleiben offen) und wandert im selben atomaren persist-Lauf
  // zurueck in den 'apps'-Key (Workshop-Punkt 4).
  ipcMain.handle('workspace:delete', (event, id) => {
    const idx = workspacesState.findIndex((w) => w.id === id);
    if (idx < 0) return { ok: false, error: 'unknown workspace' };
    workspacesState.splice(idx, 1);
    const appId = appRegistry.findAppByWorkspaceId(id);
    if (appId != null) {
      appRegistry.setWorkspace(appId, null);
      broadcastDisplayInfo();
    }
    // 4T-0539 (Epic 3E-0098): liegende Entwuerfe des geloeschten
    // Arbeitsbereichs wandern in den globalen Topf (ueber die Schreib-Kette
    // serialisiert gegen parallele drafts:save-Laeufe).
    draftWriteChain = draftWriteChain.then(() => retagDraftsToGlobal(id)).catch(() => {});
    persistAllWindows();
    workspacesChanged();
    // 4T-0630 (Epic 3E-0102): Degradierung zur unbenannten App -> Fenster
    // zurueck auf die Standard-Titelleiste.
    updateAllCaptionColors();
    return { ok: true };
  });

  // 4T-0368 (Epic 3E-0068): Renderer meldet beim Schliessen die Unbenannt-Tabs
  // mit Inhalt. Sie werden mit dem Bereich der sendenden App angereichert und
  // additiv in den Entwurfs-Speicher geschrieben. Die Kette serialisiert gegen
  // die Read-modify-write-Race, wenn beim Multi-Fenster-Quit mehrere Renderer
  // quasi-gleichzeitig schreiben. Der Renderer awaitet das Ergebnis vor
  // confirmClose, damit das Fenster nicht vor dem Persistieren schliesst.
  ipcMain.handle('drafts:save', (event, drafts) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    const area = appId != null ? appRegistry.getArea(appId) : null;
    const areaRootPath = area && area.rootPath ? area.rootPath : null;
    // 4T-0539 (Epic 3E-0098): Arbeitsbereichs-Zuordnung der Sender-App —
    // Entwuerfe eines Arbeitsbereichs-Fensters gehoeren zu dessen Zustand.
    const ws = appId != null ? appRegistry.getWorkspace(appId) : null;
    draftWriteChain = draftWriteChain
      .then(() => appendDrafts(drafts, areaRootPath, ws ? ws.id : null))
      .catch(() => {});
    return draftWriteChain;
  });

  ipcMain.handle('app:locale', () => app.getLocale());
  ipcMain.handle('app:version', () => fullVersion());

  // 4T-0319 (Epic 3E-0057): "Neue Applikation" — neue logische App mit
  // leerem Fenster, ohne die EXE zu bemuehen (Menuepunkt bzw. Kommando).
  ipcMain.handle('app:newApplication', () => {
    createWindow({});
  });

  // --- 4T-0322 (Epic 3E-0058): Bereiche ---------------------------------------
  // "Bereich oeffnen..." mit Ordner-Dialog.
  ipcMain.handle('area:open', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'area.openDialogTitle'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return openAreaPath(result.filePaths[0], owner);
  });

  // --- 4T-0632 (Epic 3E-0102): Demo-Area --------------------------------------
  // "Demo-Area erstellen..." mit Ordner-Dialog: mitgelieferte Demo-Inhalte
  // in einen LEEREN Zielordner kopieren und direkt als Bereich oeffnen.
  // Nicht-leerer Zielordner: lokalisierter Hinweis, es wird niemals
  // ueberschrieben (Epic-Abgrenzung).
  ipcMain.handle('demoArea:create', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'demoArea.dialogTitle'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const targetDir = result.filePaths[0];
    const created = await createDemoAreaAt(targetDir);
    if (!created.ok) {
      if (created.error === 'not-empty') {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'demoArea.notEmptyTitle'),
          message: tForWindow(owner, 'demoArea.notEmptyMessage'),
          detail: targetDir,
          buttons: ['OK'],
        });
      }
      return created;
    }
    return openAreaPath(targetDir, owner);
  });

  // Direkter Pfad-Einstieg ohne Dialog (Tests; Muster area:openPath).
  ipcMain.handle('demoArea:createAt', async (event, targetDir) => {
    if (typeof targetDir !== 'string' || !targetDir) return { ok: false, error: 'invalid path' };
    const created = await createDemoAreaAt(targetDir);
    if (!created.ok) return created;
    return openAreaPath(targetDir, senderWindow(event));
  });

  // Direkter Pfad-Einstieg (Zuletzt-geoeffnete-Bereiche, Tests). Prueft die
  // Existenz des Ordners, sonst identische Regeln wie der Dialog-Weg.
  ipcMain.handle('area:openPath', async (event, rootPath) => {
    if (typeof rootPath !== 'string' || !rootPath) return { ok: false, error: 'invalid path' };
    try {
      const stat = await fs.stat(rootPath);
      if (!stat.isDirectory()) return { ok: false, error: 'not a directory' };
    } catch {
      return { ok: false, error: 'not found' };
    }
    return openAreaPath(rootPath, senderWindow(event));
  });

  // --- 4T-0327 (Epic 3E-0059): Bereichs-Panel ---------------------------------
  // Listet Unterordner und Markdown-Dateien EINES Ordners innerhalb des
  // Bereichs der aufrufenden App (lazy pro aufgeklapptem Ordner). Lese-
  // Fehler einzelner Ordner liefern leere Listen statt eines Abbruchs
  // (Entwicklungsrichtlinien: Fehler pro Knoten tolerieren).
  ipcMain.handle('area:listDir', async (event, dirPath) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const listing = sortedAreaListing(
        entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })),
        isMarkdownPath,
      );
      return { ok: true, dirs: listing.dirs, files: listing.files };
    } catch (err) {
      console.warn('Bereichs-Listing fehlgeschlagen:', dirPath, err && err.message);
      return { ok: true, dirs: [], files: [] };
    }
  });

  // 4T-0328: "Neue Datei in diesem Ordner" — legt eine leere Markdown-Datei
  // im (bereichs-internen) Ordner an. Namens-Validierung ueber
  // sanitizeNewFileName; bestehende Dateien werden nicht ueberschrieben.
  ipcMain.handle('area:createFile', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const dirPath = params && params.dirPath;
    const fileName = sanitizeNewFileName(params && params.name);
    if (!fileName) return { ok: false, error: 'invalid name' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    const target = path.join(dirPath, fileName);
    if (!isInsideArea(area.rootPath, target)) return { ok: false, error: 'outside-area' };
    try {
      // wx: exklusives Anlegen — existierende Datei bleibt unangetastet.
      await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: target };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // "Bereich schliessen": alle Fenster der Bereichs-App des Absenders.
  ipcMain.handle('area:close', async (event) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    if (appId == null || !appRegistry.getArea(appId)) return { ok: false };
    return closeAreaApp(appId);
  });

  ipcMain.handle('theme:current', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));

  // 4T-0030: Theme-Vorzug auslesen/setzen. 'system' folgt dem OS, 'light'/'dark'
  // erzwingt das jeweilige Theme app-weit. Bei Aenderung wird nativeTheme.
  // themeSource gesetzt (loest implizit 'updated' aus, broadcast 'theme:changed'),
  // der Pref wird persistiert und an alle Fenster gebrodcastet, damit Menu-
  // Radios und Statusbar-Icon synchron bleiben.
  ipcMain.handle('theme:getPref', () => {
    const value = store?.get('themePref');
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  });
  ipcMain.handle('theme:setPref', (_event, value) => {
    const normalized =
      value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    if (store) store.set('themePref', normalized);
    nativeTheme.themeSource = normalized;
    broadcast('theme:prefChanged', normalized);
    applyMenuToAllWindows();
  });

  // 4T-0213 (Epic 3E-0042): Generischer Handbuch-Seiten-Loader. Liefert
  // die gebuendelte Seite src/i18n/help/<pageId>.<locale>.md — pageId
  // strikt gegen die Seiten-Registry geprueft (Whitelist statt Pfad aus
  // Renderer-Input), Locale-Sanitizing und Fallback Englisch. Mit 4T-0216
  // ist der fruehere Spezial-Loader fuer die Tabellen-Hilfeseite (4T-0036)
  // hierin aufgegangen.
  // X-05 (4T-0182): Das fs-Lesen hier funktioniert auch IN der asar
  // (Electron patcht fs transparent). Der asarUnpack-Eintrag fuer
  // src/i18n/**/* in package.json existiert fuer den RENDERER, der seine
  // Sprachdateien per fetch('../i18n/<lang>.json') laedt (i18n.js) —
  // fetch kann nicht in die asar greifen.
  // 4T-0758 (Epic 3E-0142): Die Datei-Aufloesung liegt in einem Helfer,
  // weil sie seither zwei Aufrufer hat (Einzel-Seite und Sammel-Abruf der
  // Suche). Zwei Fassungen wuerden beim naechsten Eingriff auseinander
  // laufen, etwa beim Fallback-Verhalten.
  const ladeGebuendelteSeite = async (page, locale) => {
    if (!page || page.source !== 'bundled') return '';
    const safe = typeof locale === 'string' ? locale.toLowerCase().replace(/[^a-z-]/g, '') : '';
    const candidates = [];
    if (safe) candidates.push(safe);
    if (!candidates.includes('en')) candidates.push('en');
    for (const code of candidates) {
      try {
        const file = path.join(__dirname, '..', 'i18n', 'help', `${page.id}.${code}.md`);
        return await fs.readFile(file, 'utf8');
      } catch (_err) {
        // weiter zum naechsten Kandidaten
      }
    }
    return '';
  };

  ipcMain.handle('help:getManualPage', async (_event, pageId, locale) =>
    ladeGebuendelteSeite(manualPageById(pageId), locale),
  );

  // 4T-0758 (Epic 3E-0142): Alle gebuendelten Seiten einer Sprache in einem
  // Zug, fuer die Suche ueber das ganze Handbuch. Die generierten Seiten
  // entstehen im Renderer und sind hier bewusst nicht enthalten; der
  // Sicherheits-Kontrakt bleibt unveraendert, weil ueber die Registry
  // iteriert wird und kein Renderer-Input in einen Pfad geht.
  ipcMain.handle('help:getAllManualPages', async (_event, locale) => {
    const gebuendelt = MANUAL_PAGES.filter((p) => p.source === 'bundled');
    const inhalte = await Promise.all(gebuendelt.map((p) => ladeGebuendelteSeite(p, locale)));
    return gebuendelt.map((p, i) => ({ id: p.id, text: inhalte[i] }));
  });

  // --- 4T-0298 (Epic 3E-0053): externe Erweiterungen ---------------------------
  // Sicherheits-Kontrakt: der Renderer reicht nur IDs herein; alle Pfade
  // entstehen main-seitig aus <userData>/extensions plus validierten
  // Scan-Eintraegen (Whitelist-Muster wie help:getManualPage).
  const extensionsRoot = () => path.join(app.getPath('userData'), 'extensions');

  ipcMain.handle('extensions:scanExternal', async () => {
    try {
      return await scanExtensionsRoot(extensionsRoot());
    } catch (err) {
      console.warn('Erweiterungs-Scan fehlgeschlagen:', err);
      return [];
    }
  });

  ipcMain.handle('extensions:getMarkdownPluginSource', async (_event, id) => {
    if (typeof id !== 'string') return { ok: false, error: 'Ungueltige ID' };
    return readMarkdownPluginSource(extensionsRoot(), id);
  });

  // Warn-Dialog des Vertrauensmodells (Product-Owner-Entscheidung: keine
  // Sandbox, explizite Nutzerbestaetigung). Der Text benennt das Risiko
  // unmissverstaendlich; Abbrechen ist Default und Escape-Ziel.
  ipcMain.handle('extensions:confirmTrust', async (event, id) => {
    if (typeof id !== 'string') return false;
    const info = externalExtensionInfo(extensionsRoot(), id);
    if (!info) return false;
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('extensions.external.trustTitle'),
      message: t('extensions.external.trustMessage')
        .replace('{name}', info.name)
        .replace('{version}', info.version),
      detail: t('extensions.external.trustDetail'),
      buttons: [t('extensions.external.trustConfirm'), t('extensions.external.trustCancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // Entfernen mit eigener Bestaetigung (destruktiv: loescht das
  // Erweiterungs-Verzeichnis endgueltig).
  ipcMain.handle('extensions:removeExternal', async (event, id) => {
    if (typeof id !== 'string') return { removed: false };
    const info = externalExtensionInfo(extensionsRoot(), id);
    if (!info) return { removed: false };
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('extensions.external.removeTitle'),
      message: t('extensions.external.removeMessage').replace('{name}', info.name),
      buttons: [t('extensions.external.removeConfirm'), t('extensions.external.removeCancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) return { removed: false, canceled: true };
    try {
      return { removed: await removeExtensionDirectory(extensionsRoot(), id) };
    } catch (err) {
      console.warn('Erweiterung entfernen fehlgeschlagen:', id, err);
      return { removed: false, error: String((err && err.message) || err) };
    }
  });

  // Zugang zum Erweiterungs-Verzeichnis im Datei-Explorer (legt es bei
  // Bedarf an — der Scan erledigt das mit).
  ipcMain.handle('extensions:openDir', async () => {
    try {
      await scanExtensionsRoot(extensionsRoot());
      await shell.openPath(extensionsRoot());
      return true;
    } catch (err) {
      console.warn('Erweiterungs-Verzeichnis oeffnen fehlgeschlagen:', err);
      return false;
    }
  });

  // Renderer meldet seine aktuelle Pane-Struktur, damit Bounds-Saves auch immer
  // die passenden Tabs persistieren koennen.
  // M-16 (4T-0173): zusaetzlich debounced in den Store flushen (bestehender
  // 500-ms-Mechanismus). Vorher erreichten Tab-/Pane-Aenderungen den Store
  // nur ueber Bounds-Events oder beim Schliessen; nach Crash/Task-Kill
  // stellte der naechste Start einen veralteten Stand wieder her.
  ipcMain.handle('window:reportPanes', (event, panes) => {
    lastReportedPanes.set(event.sender.id, Array.isArray(panes) ? panes : []);
    const win = windows.get(event.sender.id);
    if (win) scheduleSaveBoundsAndPersist(win);
  });

  // Renderer meldet den menue-relevanten Stand (Sprache, View-Modus, Toggles).
  // Wir bauen das Menue dieses Fensters daraufhin neu, damit Haekchen und
  // Disabled-States synchron sind.
  ipcMain.handle('window:reportMenuState', (event, state) => {
    const id = event.sender.id;
    menuStates.set(id, state || {});
    const win = windows.get(id);
    if (win) applyMenuToWindow(win);
  });

  // Renderer meldet aktiven Tab-Namen und Tab-Anzahl seines Fensters, damit
  // andere Fenster diese Infos im Tab-Kontextmenue als Tooltip anzeigen koennen
  // (4T-0012). Wird vom Renderer bei jedem updateWindowTitle gesendet.
  ipcMain.handle('window:metaChanged', (event, payload) => {
    const data = payload || {};
    windowMeta.set(event.sender.id, {
      activeTabName: typeof data.activeTabName === 'string' ? data.activeTabName : '',
      tabCount: typeof data.tabCount === 'number' ? data.tabCount : 0,
    });
  });

  // Liefert die Liste ALLER offenen Fenster (inkl. Aufrufer; der Renderer
  // filtert sich selbst per windowId heraus). Reihenfolge = Map-Insertion-
  // Order = Erzeugungsreihenfolge. Wird vom Tab-Kontextmenue beim Aufklappen
  // synchron abgefragt (4T-0012). 4T-0318: displayNumber ist app-lokal;
  // App-Kontext (appNumber/areaName) kommt fuer die Ziel-Labels mit.
  ipcMain.handle('window:list', () => {
    const infos = appRegistry.displayInfos();
    const list = [];
    for (const [id] of windows) {
      const meta = windowMeta.get(id) || {};
      const info = infos.get(id) || {};
      list.push({
        id,
        displayNumber: info.windowNumber || 1,
        totalCount: info.appWindowCount || 1,
        appId: info.appId || null,
        appNumber: info.appNumber || 1,
        appCount: info.appCount || 1,
        areaName: info.areaName || null,
        areaPath: info.areaPath || null,
        // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Name fuer eindeutige
        // Ziel-Labels im Tab-Kontextmenue.
        workspaceName: info.workspaceName || null,
        activeTabName: meta.activeTabName || '',
        tabCount: meta.tabCount || 0,
      });
    }
    return list;
  });

  // Fuegt einen vom Quell-Fenster uebergebenen Tab im Ziel-Fenster als neuen
  // Tab in der aktiven Pane hinzu (4T-0012). payload = { path, content, dirty,
  // settings: { viewMode, wrapLines, showLineNumbers }, untitledIndex }.
  // Returnt { ok: true } bei Erfolg, sonst { ok: false, reason }.
  ipcMain.handle('tab:appendToWindow', (_event, params) => {
    const targetId = params && params.targetWindowId;
    const payload = params && params.payload;
    const target = typeof targetId === 'number' ? windows.get(targetId) : null;
    if (!target || target.isDestroyed()) {
      return { ok: false, reason: 'window-gone' };
    }
    // 4T-0323 (Epic 3E-0058): kein Tab mit Datei ausserhalb des Bereichs in
    // eine Bereichs-App verschieben/kopieren (Unbenannt-Tabs ohne Pfad sind
    // erlaubt — sie werden beim Speichern in den Bereich gefuehrt).
    const targetArea = areaOfWindow(target);
    const tabPath = payload && typeof payload.path === 'string' ? payload.path : null;
    if (targetArea && tabPath && !isInsideArea(targetArea.rootPath, tabPath)) {
      return { ok: false, reason: 'outside-area' };
    }
    target.webContents.send('tab:appendFromOtherWindow', payload || {});
    if (target.isMinimized()) target.restore();
    target.focus();
    return { ok: true };
  });

  // 4T-0015: Backlinks-Anfrage einer Pane. Registriert den Owner
  // (webContents + Pane) auf der Wurzel der angefragten Datei und liefert
  // das aktuelle Status-Payload. Der Renderer macht beim Tab-Wechsel
  // passend zu einem 'request' immer auch ein 'release' fuer die vorher
  // angefragte Datei.
  // B-01 (4T-0175): Owner-Key statt blindem Refcount — Mehrfach-Requests
  // desselben Owners (Editor-Sync, Invalidate-Refresh) leaken nicht mehr.
  ipcMain.handle('backlinks:request', (event, params) => {
    const filePath = params && params.filePath;
    const paneIdx = params && Number.isInteger(params.paneIdx) ? params.paneIdx : 0;
    return backlinks.backlinksFor(
      filePath,
      `${event.sender.id}:${paneIdx}`,
      areaRootForEvent(event),
    );
  });
  ipcMain.handle('backlinks:release', (event, params) => {
    const filePath = params && params.filePath;
    const paneIdx = params && Number.isInteger(params.paneIdx) ? params.paneIdx : 0;
    // 4T-0347 (Epic 3E-0062): dieselbe bereichsbewusste Wurzel wie beim Request,
    // sonst gibt release in Bereichs-Apps den falschen Owner frei (Leak).
    const root = backlinks.rootForActiveFile(filePath, areaRootForEvent(event));
    if (root) backlinks.releaseRoot(root, `${event.sender.id}:${paneIdx}`);
    return { ok: true };
  });

  // B-13 (4T-0175): Klick-Fallback ueber den Index, wenn das dokument-
  // relative Ziel nicht existiert (analog zum Alias-Fallback).
  ipcMain.handle('wikiLink:resolveInIndex', (event, params) => {
    const filePath = params && params.filePath;
    const basename = params && params.basename;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.resolveWikiTargetInIndex(filePath, basename, areaRoot);
  });

  // 4T-0056 (Epic 3E-0011): Tag-System. Liefert die Tag-Liste der Wurzel
  // (mit Counts) und optional die Datei-Liste fuer einen Filter-Tag.
  // Aehnlich backlinks:request, aber ohne Refcount/Soft-Timer-Mechanik:
  // Tags sind ein Read-only-View und triggern keinen Index-Aufbau.
  ipcMain.handle('tags:request', (event, params) => {
    const filePath = params && params.filePath;
    const filterTag = params && params.filterTag;
    // B-18 (4T-0187): Tag-Sidebar stoesst den Index-Aufbau selbst an —
    // vorher entstand der Index nur ueber das Backlinks-Panel, ohne das
    // die Tag-Sektion dauerhaft 'unavailable' meldete.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.tagsFor(filePath, filterTag, areaRoot);
  });

  // 4T-0354 (Epic 3E-0065): Frontmatter-Abfrage (perspective-query). Read-only-
  // View wie tags:request: stoesst den Index bei Bedarf an, wertet die Query im
  // Main gegen die Properties-Maps aus und liefert die Datei-Liste plus Status.
  ipcMain.handle('frontmatterQuery:run', (event, params) => {
    const filePath = params && params.filePath;
    const query = params && typeof params.query === 'string' ? params.query : '';
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    // 4T-0502 (Epic 3E-0096): Task-Umgebung fuer den TASKS-Scope aus dem
    // Store — Erweiterungs-Gate, Global Filter und Status-Typ-Aufloesung
    // (pro Lauf frisch gelesen; Settings-Aenderungen wirken damit sofort).
    const tasksConfig = store ? store.get('tasksConfig') : null;
    const taskEnv = {
      enabled: isExtensionEnabled('tasks', store ? store.get('extensions.disabled') : []),
      globalFilter:
        tasksConfig && typeof tasksConfig.globalFilter === 'string'
          ? tasksConfig.globalFilter.trim()
          : '',
      // 4T-0505 (Epic 3E-0096): globale Abfrage (implizite FROM-/WHERE-
      // Vorgabe aus den Einstellungen) fuer alle TASKS-Blöcke.
      globalQuery:
        tasksConfig && typeof tasksConfig.globalQuery === 'string'
          ? tasksConfig.globalQuery.trim()
          : '',
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
    };
    return backlinks.frontmatterQueryFor(filePath, query, areaRoot, taskEnv);
  });

  // 4T-0504 (Epic 3E-0096): Rueckschreiben aus der Abfrage-Ansicht in NICHT
  // im aufrufenden Fenster geoeffnete Quelldateien (offene Tabs aktualisiert
  // der Renderer ueber den Editor-Zustand, nicht ueber die Platte). Muster
  // des Link-Updates (3E-0062): Roh-Stand lesen (EOL/BOM bleiben erhalten),
  // zeilen-genau ersetzen, Historie wie beim regulaeren Speichern. BEWUSST
  // ohne markSelfWriting: in anderen Fenstern offene Tabs sollen den
  // definierten file:changed-Weg gehen (nicht-dirty -> stiller Reload,
  // dirty -> Konflikt-Dialog). Konflikt auf Zeilen-Ebene (Zeile veraendert
  // oder verschwunden) meldet { ok:false, reason } statt blind zu schreiben.
  ipcMain.handle('task:applyLineEdit', async (event, params) => {
    // BOM-Strip wie file:read (Escape-Form, kein unsichtbares Literal, M-04).
    const BOM_RE = new RegExp('^\\uFEFF');
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : '';
    if (!filePath) return { ok: false, error: 'no path' };
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const result = computeLineReplacement(raw, {
      line: params && params.line,
      expectedText: params && params.expectedText,
      newText: params ? params.newText : null,
      insert: params ? params.insert : null,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    try {
      const owner = senderWindow(event);
      const recordHistory = (await resolveHistoryFor(owner, filePath, result.newContent)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
      await fs.writeFile(filePath, result.newContent, { encoding: 'utf8' });
      if (recordHistory) {
        const newTextNorm = result.newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      return { ok: true, line: result.line };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0515 (Epic 3E-0092): Ereignis-Aggregation — Treffer-Dateien mit
  // event-*-Feldern aus dem Bereichs-Index (Grundmenge = Zuordnungs-Feld
  // nennt das interne Ereignis-Profil; optionale FROM/WHERE-Verfeinerung).
  // Gate auf die Erweiterung "events" (transitiv ueber property-profiles).
  ipcMain.handle('events:query', async (event, query) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { status: 'unavailable' };
    if (!isExtensionEnabled('events', store ? store.get('extensions.disabled') : [])) {
      return { status: 'disabled' };
    }
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(area.rootPath));
    const assignField = (config && config.assignField) || DEFAULT_ASSIGN_FIELD;
    return backlinks.eventsForQuery(area.rootPath, query, area.rootPath, {
      assignField,
      profileName: EVENT_PROFILE_NAME,
    });
  });

  // 4T-0515 (Epic 3E-0092): Inline-Rueckschreiben der Aggregation in NICHT
  // im aufrufenden Fenster geoeffnete Quell-Dateien (offene Tabs schreibt
  // der Renderer ueber den Editor-Zustand). Muster task:applyLineEdit:
  // Roh-Stand lesen (EOL/BOM bleiben erhalten), Mehrfeld-Update ueber
  // writeFrontmatter, Historie wie beim regulaeren Speichern, BEWUSST ohne
  // markSelfWriting (offene Tabs anderer Fenster gehen den file:changed-
  // Weg). Konflikt-Erkennung ueber mtimeMs des Aggregations-Snapshots:
  // hat sich die Datei seither veraendert, wird nicht blind geschrieben.
  ipcMain.handle('events:applyFrontmatterEdit', async (event, params) => {
    const BOM_RE = new RegExp('^\\uFEFF');
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : '';
    if (!filePath) return { ok: false, error: 'no path' };
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const expectedMtime = params && Number(params.expectedMtimeMs);
    if (Number.isFinite(expectedMtime) && expectedMtime > 0 && stat.mtimeMs !== expectedMtime) {
      return { ok: false, reason: 'conflict' };
    }
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const hadBom = BOM_RE.test(raw);
    const text = hadBom ? raw.replace(BOM_RE, '') : raw;
    const fm = extractFrontmatter(text);
    if (fm.parseError) return { ok: false, reason: 'yaml' };
    const newData = { ...(fm.data || {}) };
    const updates =
      params && params.updates && typeof params.updates === 'object' ? params.updates : {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof key !== 'string' || key === '') continue;
      // Leere Werte raeumen den Schluessel (sauberes Frontmatter statt
      // leerer Reste); alles andere wird typgerecht gesetzt.
      if (value === null || value === undefined || value === '') delete newData[key];
      else newData[key] = value;
    }
    const written = writeFrontmatter(text, newData);
    if (!written.ok) return { ok: false, error: written.error };
    const newContent = (hadBom ? '\uFEFF' : '') + written.text;
    try {
      const owner = senderWindow(event);
      const recordHistory = (await resolveHistoryFor(owner, filePath, newContent)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
      await fs.writeFile(filePath, newContent, { encoding: 'utf8' });
      if (recordHistory) {
        const newTextNorm = newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0525 (Epic 3E-0095): Erinnerungs-IPC — Panel-Daten, Muting und
  // Wiederauslosung gegen den Session-Zustand des Pruefers; der Bereich
  // kommt aus dem aufrufenden Fenster (bereichslos gibt es keinen
  // Erinnerungs-Suchraum, siehe Epic-Abgrenzung).
  ipcMain.handle('reminders:list', (event) => {
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) return { ready: false, nowLocal: null, items: [] };
    return reminderChecker.list(areaRoot);
  });
  ipcMain.handle('reminders:mute', (event, keys) => {
    const areaRoot = areaRootForEvent(event);
    if (areaRoot) reminderChecker.mute(areaRoot, keys);
  });
  ipcMain.handle('reminders:retrigger', (event, keys) => {
    const areaRoot = areaRootForEvent(event);
    if (areaRoot) reminderChecker.retrigger(areaRoot, keys);
  });
  // 4T-0526 (Epic 3E-0095): zuschaltbare System-Notification — erste
  // Nutzung nativer Benachrichtigungen. Titel und Body kommen lokalisiert
  // aus dem Renderer; der Klick holt das aufrufende Fenster in den
  // Vordergrund (Muster second-instance), der In-App-Dialog ist dort
  // bereits offen. Das Schliessen der Notification hat bewusst keine
  // Muting-Wirkung (einheitliche Muting-Quelle ist der In-App-Dialog).
  // 4T-0637 (Epic 3E-0069): Die Anzeige-Logik ist inhaltlich generisch
  // (Titel und Text kommen lokalisiert aus dem Renderer) und wird seit dem
  // Wecker von zwei Kanaelen genutzt. Der Erinnerungs-Kanal bleibt
  // unveraendert bestehen, der neutrale kommt daneben.
  const showSystemNotification = (event, payload) => {
    if (!Notification.isSupported()) return false;
    const owner = senderWindow(event);
    const notification = new Notification({
      title: payload && typeof payload.title === 'string' ? payload.title : '',
      body: payload && typeof payload.body === 'string' ? payload.body : '',
    });
    notification.on('click', () => {
      if (owner && !owner.isDestroyed()) {
        if (owner.isMinimized()) owner.restore();
        owner.focus();
      }
    });
    notification.show();
    return true;
  };
  ipcMain.handle('reminders:systemNotify', showSystemNotification);
  ipcMain.handle('notify:system', showSystemNotification);

  // 4T-0637 (Epic 3E-0069): Wecker — Bestaetigen und Schlummern gegen den
  // Session-Zustand des Pruefers. Der gespeicherte Wecker bleibt dabei
  // unveraendert; geschlummert wird nur die Meldung.
  ipcMain.handle('alarm:snooze', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    const minutes = payload ? payload.minutes : undefined;
    return alarmChecker.snooze(key, minutes);
  });
  ipcMain.handle('alarm:confirm', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    alarmChecker.confirm(key);
  });

  // 4T-0453 (Epic 3E-0084): Graph-Daten fuer Bereichs-Graph-Tab und Datei-
  // Graph-Panel (Knoten plus gerichtete Link-Kanten des Suchraums). Read-only-
  // View wie tags:request; der Bereichs-Fall kommt ohne aktive Datei aus (den
  // Bereichs-Index haelt der area:<appId>-Owner seit dem Bereichs-Oeffnen).
  ipcMain.handle('graph:edges', (event, params) => {
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : null;
    const areaRoot = areaRootForEvent(event);
    if (filePath) {
      backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    }
    return backlinks.graphFor(filePath, areaRoot);
  });

  // 4T-0619 (Epic 3E-0117): Kennzahlen des geoeffneten Bereichs fuer die
  // Statistik-Seite. Read-only-View wie graph:edges, aber mit ergaenzendem
  // Ordner-Scan; ohne Bereich gibt es keinen abgegrenzten Datei-Raum und
  // damit den Status 'unavailable'. Der Status-Typ-Aufloeser wird pro Lauf
  // frisch gebaut (Muster frontmatterQuery:run), damit geaenderte
  // Aufgaben-Zustaende sofort wirken.
  ipcMain.handle('areaStats:collect', async (event) => {
    const areaRoot = areaRootForEvent(event);
    return collectAreaStats(areaRoot, {
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
    });
  });

  // 4T-0615 (Epic 3E-0116): Bereichs-Suchlauf. Der Renderer schickt den
  // fertigen Regex-Quelltext samt Flags (eine Auslegung von Gross-/
  // Kleinschreibung und Regex-Modus, nicht zwei) und den wurzel-relativen
  // Pfad der aktiven Datei, deren Treffer er selbst aus dem Editor-Stand
  // beisteuert. Ohne geoeffneten Bereich liefert der Kanal ein leeres
  // Ergebnis, statt auf einen Ordner-Scan auszuweichen.
  ipcMain.handle('areaSearch:run', async (event, params) => {
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) {
      return {
        treffer: [],
        gruppen: [],
        abgeschnitten: false,
        generation: (params && params.generation) || 0,
        vorratModus: 'leer',
      };
    }
    return sucheImBereich(areaRoot, {
      muster: params && params.muster,
      flags: params && params.flags,
      aktiv: params && params.aktiv,
      anker: params && params.anker,
      generation: params && params.generation,
    });
  });

  // Gibt den Speicher-Vorrat frei (Suchleiste geschlossen, Bereich
  // gewechselt). Der Cache bleibt bestehen; er ist der Zweck des naechsten
  // Starts.
  ipcMain.handle('areaSearch:release', (event) => {
    const areaRoot = areaRootForEvent(event);
    gibBereichsVorratFrei(areaRoot || null);
    return true;
  });

  // 4T-0413 (Epic 3E-0078): Daten-Snapshot fuer Skript-Bloecke
  // (perspective-script). Read-only-View wie frontmatterQuery:run; die
  // Auswertung uebernimmt das Skript in der Renderer-Sandbox, der Main
  // liefert nur den Suchraum (pages/blocks) als Snapshot.
  ipcMain.handle('perspectiveScript:data', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.scriptDataFor(filePath, areaRoot);
  });

  // 4T-0057 (Epic 3E-0011): Autocomplete-Suggestions fuer drei Quellen:
  // Wiki-Link-Ziele ([[), Heading-/Block-Anker ([[Datei#, [[Datei#^),
  // Tags (#). Pro Trigger ein IPC, weil die Quellen unterschiedliche
  // Eingabe-Parameter brauchen.
  ipcMain.handle('autocomplete:wikiTargets', (event, params) => {
    const filePath = params && params.filePath;
    // B-18 (4T-0187): Autocomplete-Bedarf baut den Index bei Bedarf auf.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.wikiLinkAutocompleteSuggestions(filePath, areaRoot);
  });
  ipcMain.handle('autocomplete:anchors', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    const basename = params && params.basename;
    const anchorType = params && params.anchorType;
    return backlinks.anchorAutocompleteSuggestions(filePath, basename, anchorType, areaRoot);
  });
  ipcMain.handle('autocomplete:tags', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.tagAutocompleteSuggestions(filePath, areaRoot);
  });

  // 4T-0020: Linter-Lookup fuer broken-wiki-link. Batch-Endpunkt: pro Lint-
  // Lauf ein Roundtrip mit allen Basenames des Dokuments. Antwort siehe
  // existingWikiTargets in backlinks.js (status + Liste der gefundenen).
  // Triggert keinen Index-Aufbau; falls kein Index vorliegt, wird 'unavailable'
  // zurueckgegeben und der Linter unterdrueckt die Regel.
  ipcMain.handle('linter:resolveWikiTargets', (event, params) => {
    const filePath = params && params.filePath;
    const basenames = params && Array.isArray(params.basenames) ? params.basenames : [];
    // B-18 (4T-0187): Linter-Bedarf baut den Index bei Bedarf auf; bis er
    // ready ist, unterdrueckt der 'indexing'-Status die Regel wie bisher.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.existingWikiTargets(filePath, basenames, areaRoot);
  });

  // 4T-0050 (Epic 3E-0010): Wiki-Link-Klick mit Alias-Fallback. Wird vom
  // Renderer aufgerufen, wenn die direkte Datei (Basename.md relativ zum
  // aktiven Dokument) nicht existiert. Liefert die Liste der Dateien, die
  // den Basename als Alias im Frontmatter fuehren. Bei eindeutigem Treffer
  // oeffnet der Renderer direkt, bei mehrdeutigem zeigt er einen Auswahl-
  // Dialog.
  ipcMain.handle('wikiLink:resolveByAlias', (event, params) => {
    const filePath = params && params.filePath;
    const basename = params && params.basename;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.resolveWikiTargetByAlias(filePath, basename, areaRoot);
  });

  // 4T-0055 (Epic 3E-0011): Wiki-Embed-Datei lesen. Liest die Ziel-Datei
  // und extrahiert ggf. Heading-Snippet oder Block-Element gemaess Anker.
  // Wird vom Renderer fuer Markdown-Embeds aufgerufen (![[Datei]] /
  // ![[Datei#Heading]] / ![[Datei#^id]]).
  ipcMain.handle('embed:read', async (event, params) => {
    const basePath = params && params.basePath;
    let embedPath = params && params.embedPath;
    const anchor = params && params.anchor;
    // 4T-0337 (Epic 3E-0061): relative Unterseiten-Embeds ('![[/Name]]',
    // '![[..]]') gegen den Basename der Basis-Datei expandieren; Ergebnis
    // ist die U+2215-Form im selben Ordner.
    if (typeof embedPath === 'string' && subpages.isRelativeTarget(embedPath)) {
      const extMatch = embedPath.match(/\.[a-z0-9]{1,8}$/i);
      const ext = extMatch ? extMatch[0] : '';
      const noExt = ext ? embedPath.slice(0, -ext.length) : embedPath;
      const ownBase = path
        .basename(String(basePath || ''))
        .replace(/\.(md|markdown|mdown|mkd)$/i, '');
      const expanded = subpages.expandRelativeTarget(ownBase, noExt);
      if (!expanded) return { ok: false, error: 'not found' };
      embedPath = expanded + (ext || '.md');
    }
    // B-02 (4T-0307): Containment auf den Dokument-Ordner-Teilbaum plus
    // Markdown-Extension-Whitelist, bevor gelesen wird — fremder Embed-Pfad
    // gilt als nicht vertrauenswuerdig (Entwicklungsrichtlinien §6).
    const guard = resolveContainedEmbedPath(basePath, embedPath);
    if (!guard.ok) {
      return { ok: false, error: guard.error };
    }
    let abs = guard.abs;
    // 4T-0337: Unterseiten-/Suchraum-Fallback wie im Klick-Pfad (B-13),
    // wenn die dokument-relative Datei fehlt. Kandidaten muessen im
    // Dokument-Ordner-Teilbaum liegen (B-02-Containment bleibt gewahrt).
    try {
      await fs.access(abs);
    } catch {
      // Deterministischer Versuch ohne Index: Unterseiten liegen
      // konventionell im Ordner des Dokuments — '/' -> U+2215 uebersetzen.
      let found = false;
      if (/[/\\]/.test(String(embedPath))) {
        const translated = subpages.toFileBasename(String(embedPath).replace(/\\/g, '/'));
        const g2 = resolveContainedEmbedPath(basePath, translated);
        if (g2.ok) {
          try {
            await fs.access(g2.abs);
            abs = g2.abs;
            found = true;
          } catch {
            /* weiter zum Index-Fallback */
          }
        }
      }
      if (!found) {
        const areaRoot = areaRootForEvent(event);
        backlinks.ensureIndexForDemand(basePath, `${event.sender.id}:demand`, areaRoot);
        const logical = String(embedPath)
          .replace(/\.(md|markdown|mdown|mkd)$/i, '')
          .replace(/\\/g, '/')
          .replace(/^(\.\.?\/)+/, '');
        const idx = backlinks.resolveWikiTargetInIndex(basePath, logical, areaRoot);
        if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
          const dir = path.dirname(path.resolve(basePath));
          const contained = idx.candidates.find((c) => c.startsWith(dir + path.sep));
          if (contained) abs = contained;
        }
      }
    }
    try {
      // Groessen-Limit VOR dem Lesen (Memory-Schutz, Muster Bild-Resolver).
      const stat = await fs.stat(abs);
      if (stat.size > MAX_EMBED_BYTES) {
        return { ok: false, error: 'file too large' };
      }
      const content = await fs.readFile(abs, 'utf8');
      let snippet = content;
      if (anchor) {
        snippet = backlinks.extractEmbedSnippet(content, anchor);
        if (snippet == null) {
          return { ok: false, error: 'anchor not found', path: abs };
        }
      }
      return {
        ok: true,
        path: abs,
        displayPath: path.basename(abs),
        content: snippet,
      };
    } catch (err) {
      const msg = err && err.message ? String(err.message) : String(err);
      return { ok: false, error: msg };
    }
  });

  // 4T-0338 (Epic 3E-0061): Unterseite anlegen — baut den U+2215-Dateinamen
  // aus aktiver Datei und Segment und legt die Datei an, ohne Bestehendes
  // zu ueberschreiben ('wx'-Flag). Existiert das Ziel, meldet der Handler
  // das als existed=true (der Renderer oeffnet dann die vorhandene Datei).
  ipcMain.handle('subpage:create', async (_event, params) => {
    const basePath = params && params.basePath;
    const segment = typeof (params && params.segment) === 'string' ? params.segment.trim() : '';
    if (typeof basePath !== 'string' || !basePath) return { ok: false, error: 'invalid base' };
    const vErr = subpages.segmentValidationError(segment);
    if (vErr) return { ok: false, error: 'invalid segment', code: vErr };
    const dir = path.dirname(basePath);
    const ownBase = path.basename(basePath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const target = path.join(dir, subpages.childPrefix(ownBase) + segment + '.md');
    try {
      await fs.writeFile(target, '', { flag: 'wx' });
      return { ok: true, path: target, existed: false };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: true, path: target, existed: true };
      const msg = err && err.message ? String(err.message) : String(err);
      return { ok: false, error: msg };
    }
  });

  // --- 4T-0424 (Epic 3E-0080): Vorlagen-Quellen und Datenpfad -----------------

  // Vorlagen-Liste des aufgeloesten Ordners (Bereich vor global), inklusive
  // Unterordnern. Kein Watcher und kein Cache (Epic-Entscheidung): die Liste
  // wird bei jedem Oeffnen des Auswahl-Popups frisch gelesen. source 'none'
  // bzw. folder null melden dem Renderer den unkonfigurierten Zustand
  // (lokalisierter Hinweis statt leerer Liste); missing = Ordner konfiguriert,
  // aber nicht lesbar. Lese-Fehler einzelner Unterordner werden toleriert
  // (Entwicklungsrichtlinien: Fehler pro Knoten).
  ipcMain.handle('templates:list', async (event) => {
    const resolved = await resolveTemplatesForWindow(senderWindow(event));
    if (!resolved.folder) {
      return { ok: true, source: resolved.source, folder: null, missing: false, templates: [] };
    }
    const entries = [];
    let missing = false;
    const queue = [resolved.folder];
    while (queue.length > 0) {
      const dir = queue.shift();
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        if (dir === resolved.folder) missing = true;
        continue;
      }
      for (const entry of dirents) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          queue.push(full);
        } else if (entry.isFile() && isMarkdownPath(entry.name)) {
          entries.push(templateEntryFromRelPath(path.relative(resolved.folder, full)));
        }
      }
    }
    return {
      ok: true,
      source: resolved.source,
      folder: resolved.folder,
      missing,
      templates: sortedTemplateEntries(entries),
    };
  });

  // Vorlagen-Inhalt lesen. relPath ist der Listen-Eintrag relativ zum
  // Vorlagen-Ordner; die Aufloesung laeuft frisch pro Aufruf und bleibt ueber
  // resolveTemplateFile innerhalb des konfigurierten Ordners (Pfad-
  // Normalisierung gegen '..'-Ausbrueche). BOM-/LF-Normalisierung symmetrisch
  // zu file:read; Groessen-Limit wie embed:read (Vorlagen sind Markdown-Text).
  ipcMain.handle('templates:read', async (event, params) => {
    const resolved = await resolveTemplatesForWindow(senderWindow(event));
    if (!resolved.folder) return { ok: false, error: 'no-folder' };
    const abs = resolveTemplateFile(resolved.folder, params && params.relPath);
    if (!abs) return { ok: false, error: 'outside-folder' };
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_EMBED_BYTES) return { ok: false, error: 'too-large' };
      const raw = await fs.readFile(abs, 'utf8');
      return { ok: true, path: abs, content: raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n') };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0427 (Epic 3E-0080): Ordner-Regel für eine neu angelegte Datei
  // auflösen (tiefster Treffer gewinnt, Vorlagen-Ordner ausgenommen; Kern in
  // src/main/templates.js). Der Renderer ruft das nach jeder Datei-Anlage
  // über die App auf und wendet die gemeldete Vorlage an; extern angelegte
  // Dateien durchlaufen den Trigger nicht (dokumentierte Grenze des Epics).
  ipcMain.handle('templates:ruleFor', async (event, params) => {
    const filePath = params && params.filePath;
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' };
    const resolved = await resolveTemplatesForWindow(senderWindow(event));
    const template = matchFolderRule({
      filePath,
      rules: resolved.rules,
      baseDir: resolved.baseDir,
      templatesFolder: resolved.folder,
    });
    return { ok: true, template };
  });

  // 4T-0428 (Epic 3E-0080): Konfigurations-Stand fuer den Einstellungs-
  // Bereich "Vorlagen": globale Werte (Store) und Bereichs-Sektion
  // (Bereichsdatei), beide normalisiert; hasArea/areaName steuern die
  // Bereichs-Gruppe der UI.
  ipcMain.handle('templates:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const areaConfig = area ? await readAreaTemplatesConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      global: normalizeTemplatesConfig({
        folder: store ? store.get('templates.folder') : null,
        rules: store ? store.get('templates.rules') : null,
      }),
      area: normalizeTemplatesConfig(areaConfig),
    };
  });

  // 4T-0428: templates-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null). Muster history:setAreaDefault: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben.
  ipcMain.handle('templates:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeTemplatesConfig(config);
      if (normalized) container.settings.templates = normalized;
      else delete container.settings.templates;
      if (raw === null && !normalized) {
        return { ok: true }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0428: Ordner-Auswahl fuer den Einstellungs-Bereich (globaler bzw.
  // Bereichs-Vorlagen-Ordner). 4T-0426 (Befund der Release-Test-Iteration):
  // purpose 'target' nutzt denselben Dialog als Zielordner-Fallback von
  // "Neue Datei aus Vorlage" im Fenster ohne Datei-/Bereichs-Kontext.
  ipcMain.handle('templates:chooseFolder', async (event, params) => {
    const owner = senderWindow(event);
    const titleKey =
      params && params.purpose === 'target'
        ? 'templates.newFile.chooseTargetTitle'
        : 'settings.templates.chooseFolderTitle';
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, titleKey),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  // 4T-0426 (Epic 3E-0080): "Neue Datei aus Vorlage" — legt die Datei mit
  // dem bereits gefuellten Vorlagen-Inhalt an (Platzhalter-Dialoge laufen im
  // Renderer VOR der Anlage; Abbruch dort erzeugt keine Datei). Bewusst
  // getrennt von area:createFile: dieser Pfad triggert keine Ordner-Regel
  // (expliziter Vorlagen-Weg hat Vorrang, 4T-0427) und funktioniert auch in
  // Fenstern ohne Bereich (Zielordner = Ordner der aktiven Datei). Mit
  // Bereich gilt die harte Bereichs-Grenze. Namens-Validierung ueber
  // sanitizeNewFileName (die Unterseiten-Form U+2215 passiert sie);
  // bestehende Dateien werden nicht ueberschrieben ('wx').
  ipcMain.handle('templates:createFile', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    const dirPath = params && params.dirPath;
    const fileName = sanitizeNewFileName(params && params.name);
    const content = typeof (params && params.content) === 'string' ? params.content : '';
    if (!fileName) return { ok: false, error: 'invalid name' };
    if (typeof dirPath !== 'string' || !dirPath) return { ok: false, error: 'invalid dir' };
    if (area && !isInsideArea(area.rootPath, dirPath)) return { ok: false, error: 'outside-area' };
    const target = path.join(dirPath, fileName);
    if (area && !isInsideArea(area.rootPath, target)) return { ok: false, error: 'outside-area' };
    try {
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: target };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0431 (Epic 3E-0081): Journal-Konfiguration (journals-Sektion) -------

  // Konfigurations-Stand des Bereichs, normalisiert. Journale existieren nur
  // pro Bereich (Architekturentscheidung 2 des Epics): ohne Bereich liefert
  // der Handler hasArea false und config null; die Aufrufer (Panel, Kommandos,
  // Einstellungen) zeigen den lokalisierten Hinweis.
  ipcMain.handle('journals:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaJournalsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeJournalsConfig(raw),
    };
  });

  // journals-Sektion der Bereichsdatei schreiben (config = Objekt) bzw.
  // entfernen (config = null). Muster templates:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben. Nach dem Schreiben geht
  // 'journals:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Panel und Kommandos nach).
  ipcMain.handle('journals:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeJournalsConfig(config);
      if (normalized) container.settings.journals = normalized;
      else delete container.settings.journals;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('journals:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0433 (Epic 3E-0081): Existenz eines aufgeloesten Eintrags-Pfads
  // (bereichsrelativ). Die Aufloesung selbst macht der Renderer ueber den
  // Perioden-Kern; hier nur Pfad-Sicherung (harte Bereichs-Grenze) und stat.
  ipcMain.handle('journals:statEntry', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      const stat = await fs.stat(abs);
      return { ok: true, path: abs, exists: stat.isFile() };
    } catch {
      return { ok: true, path: abs, exists: false };
    }
  });

  // 4T-0433: Journal-Eintrag anlegen — Ordner-Kette erzeugen und die Datei
  // mit dem fertig gefuellten Inhalt schreiben (Vorlagen-Dialoge laufen im
  // Renderer VOR der Anlage; Abbruch dort erzeugt keine Datei). 'wx' statt
  // Ueberschreiben: existiert die Datei inzwischen (Race), meldet existed
  // und der Renderer oeffnet nur. Dieser Pfad ist bewusst getrennt von
  // area:createFile und triggert keine Ordner-Regel (die Journal-Vorlage
  // hat Vorrang, Task-Vorgabe Vorrang-Regel).
  ipcMain.handle('journals:createEntry', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    const content = typeof (params && params.content) === 'string' ? params.content : '';
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: abs, existed: false };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: true, path: abs, existed: true };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0434 (Epic 3E-0081): Existenz-Batch fuer die Kalender-Punkte — ein
  // Aufruf pro sichtbarem Monat statt einem stat-IPC pro Tag (begrenzter
  // Scan, Epic-Risiko Performance). Pfad-Sicherung pro Eintrag; unsichere
  // Pfade entfallen still. Kappung als Schutz gegen entartete Aufrufer.
  ipcMain.handle('journals:entriesExist', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPaths = Array.isArray(params && params.relPaths) ? params.relPaths : [];
    const exists = {};
    await Promise.all(
      relPaths.slice(0, 500).map(async (relPath) => {
        if (typeof relPath !== 'string' || !relPath) return;
        const abs = path.resolve(area.rootPath, relPath);
        if (!isInsideArea(area.rootPath, abs)) return;
        try {
          exists[relPath] = (await fs.stat(abs)).isFile();
        } catch {
          exists[relPath] = false;
        }
      }),
    );
    return { ok: true, exists };
  });

  // --- 4T-0543 (Epic 3E-0097): Kalender-Systeme (calendarSystems-Sektion) -----

  // Konfigurations-Stand des Bereichs, normalisiert. Kalender-Systeme gelten
  // nur pro Bereich (Architekturentscheidung 4 des Epics, Journal-Muster):
  // ohne Bereich liefert der Handler hasArea false und config null; die
  // Aufrufer (Einstellungen, Picker, Wert-Syntax) deaktivieren sich dann.
  ipcMain.handle('calendar:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaCalendarConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeCalendarConfig(raw),
    };
  });

  // calendarSystems-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null). Muster journals:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben. Nach dem Schreiben geht
  // 'calendar:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Einstellungs-Sektion und Dokument-Werte nach).
  ipcMain.handle('calendar:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeCalendarConfig(config);
      // 4T-0747: Abgeleitete Zeitrechnungen bleiben in ihrer kurzen Form
      // erhalten; die aufgeloeste Abschrift wuerde die Verbindung zum Bezug
      // kappen. Eigenstaendige Kalender werden weiter normalisiert abgelegt.
      const persistable = configForPersist(config, normalized);
      if (persistable) container.settings.calendarSystems = persistable;
      else delete container.settings.calendarSystems;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('calendar:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0446 (Epic 3E-0083): Profil-Konfiguration (propertyProfiles-Sektion) --

  // Konfigurations-Stand des Bereichs, normalisiert. Eigenschafts-Profile
  // existieren nur pro Bereich (Profil-Ordner und Standard-Profil leben in
  // der Bereichsdatei): ohne Bereich liefert der Handler hasArea false und
  // config null; die Aufrufer (Editoren, Einstellungen) fallen dann auf das
  // Verhalten ohne Profile zurück.
  ipcMain.handle('profiles:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaProfilesConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeProfilesConfig(raw),
    };
  });

  // propertyProfiles-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null). Muster journals:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsächlichen Setzen, eine
  // defekte Bereichsdatei wird nie überschrieben. Nach dem Schreiben geht
  // 'profiles:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Editoren und Einstellungs-Bereich nach).
  ipcMain.handle('profiles:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeProfilesConfig(config);
      if (normalized) container.settings.propertyProfiles = normalized;
      else delete container.settings.propertyProfiles;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('profiles:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0625 (Epic 3E-0119): Bereichs-Varianten (sidebarLayouts-Sektion) ---

  // Varianten-Liste des Bereichs, normalisiert. Ohne Bereich liefert der
  // Handler hasArea false und eine leere Liste; die Bereichs-Gruppe der
  // Verwaltung und des Menüs entfällt dann.
  ipcMain.handle('sidebarVariants:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaSidebarVariantsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeSidebarVariantList(raw),
    };
  });

  // sidebarLayouts-Sektion der Bereichsdatei schreiben (config = Liste)
  // bzw. bei leerer Liste entfernen. Muster profiles:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsächlichen Setzen, eine
  // defekte Bereichsdatei wird nie überschrieben, fremde Sektionen bleiben
  // erhalten. Nach dem Schreiben geht 'sidebarVariants:changed' an alle
  // Fenster (Payload rootPath; die Renderer desselben Bereichs ziehen
  // Verwaltung und Menü nach).
  ipcMain.handle('sidebarVariants:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeSidebarVariantList(config);
      if (normalized.length > 0) container.settings.sidebarLayouts = normalized;
      else delete container.settings.sidebarLayouts;
      if (raw === null && normalized.length === 0) {
        return { ok: true, config: [] }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('sidebarVariants:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-0611 (Epic 3E-0115): Bereichs-Lesezeichen (bookmarks-Sektion) ------

  // Lesezeichen-Baum des Bereichs, sanitisiert. Ohne Bereich liefert der
  // Handler hasArea false und eine leere Liste; das Panel zeigt dann nur die
  // globalen Lesezeichen (Sichtbarkeits-Regel des Epics). Datei-Ziele sind
  // wurzel-relativ und werden beim Oeffnen gegen die aktuelle Wurzel aufgeloest.
  ipcMain.handle('bookmarks:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaBookmarksConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeBookmarksTree(raw),
    };
  });

  // bookmarks-Sektion der Bereichsdatei schreiben (config = Knoten-Liste) bzw.
  // bei leerer Liste entfernen. Muster sidebarVariants:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine defekte
  // Bereichsdatei wird nie ueberschrieben, fremde Sektionen bleiben erhalten.
  // Grenz-Regel (harte Bereichs-Grenze): jeder Datei-Knoten muss innerhalb der
  // Bereichs-Wurzel liegen. Die Roh-Ziele werden gegen die Wurzel aufgeloest
  // und ueber isInsideArea geprueft; ein Ziel ausserhalb (auch ein
  // ausbrechendes '../x') bricht die Relativitaet des Bereichs-Baums und lehnt
  // den GANZEN Schreibvorgang ab (Fehler-Kennung 'outside-area', kein stilles
  // Verwerfen einzelner Knoten). Nach dem Schreiben geht 'bookmarks:changed' an
  // alle Fenster (Payload rootPath; die Renderer desselben Bereichs ziehen das
  // Panel nach).
  ipcMain.handle('bookmarks:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    for (const rel of collectBookmarkFilePaths(config)) {
      const abs = path.resolve(area.rootPath, rel);
      if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    }
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeBookmarksTree(config);
      if (normalized.length > 0) container.settings.bookmarks = normalized;
      else delete container.settings.bookmarks;
      if (raw === null && normalized.length === 0) {
        return { ok: true, config: [] }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('bookmarks:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0447 (Epic 3E-0083): aufgelöste Definitions-Liste für eine Datei —
  // Standard-Profil des Bereichs plus die über das Zuordnungs-Feld
  // zugeordneten Profile (Konflikt-Regeln in resolveProfileFields; Blöcke
  // der Datei erben dieselbe Auflösung). Die Zuordnungs-Werte liefert der
  // Renderer aus dem LIVE-Frontmatter des Tabs (params.assigned — auch
  // ungespeicherte Änderungen am Zuordnungs-Feld wirken sofort); ohne
  // assigned liest der Handler das Frontmatter der Datei von Platte
  // (params.path, harte Bereichs-Grenze). Profil-Änderungen wirken über den
  // mtime-validierten Katalog-Cache ohne Neustart.
  ipcMain.handle('profiles:resolve', async (event, params) => {
    const none = { ok: true, hasConfig: false, assignField: null, fields: [], missing: [] };
    const area = areaOfWindow(senderWindow(event));
    if (!area) return none;
    // 4T-0517: bei aktiver Ereignis-Erweiterung läuft die Auflösung auch
    // ohne konfigurierten Profil-Ordner weiter — das interne Profil
    // „Ereignis" wirkt dann allein, mit dem Default-Zuordnungs-Feld.
    const eventsOn = isExtensionEnabled('events', store ? store.get('extensions.disabled') : []);
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(area.rootPath));
    const folderAbs = config && config.folder ? path.resolve(area.rootPath, config.folder) : null;
    const folderOk = folderAbs !== null && isInsideArea(area.rootPath, folderAbs);
    if (!folderOk && !eventsOn) return none;
    const catalog = folderOk
      ? await loadProfileCatalog({
          folderAbs,
          fsp: fs,
          cache: profileCatalogCache,
        })
      : { profiles: [], missingFolder: false };
    const assignField = config ? config.assignField : DEFAULT_ASSIGN_FIELD;
    let assigned = Array.isArray(params && params.assigned)
      ? params.assigned.filter((s) => typeof s === 'string')
      : null;
    // 4T-0448: die Editoren übergeben das Live-Frontmatter des Tabs; die
    // Auswertung des Zuordnungs-Felds (Feldname aus der Konfiguration)
    // bleibt damit auf einer Seite (Main kennt assignField).
    if (
      assigned === null &&
      params &&
      params.frontmatter &&
      typeof params.frontmatter === 'object'
    ) {
      assigned = assignedProfileNames(params.frontmatter, assignField);
    }
    if (assigned === null) {
      assigned = [];
      const filePath = params && params.path;
      if (typeof filePath === 'string' && filePath) {
        const abs = path.resolve(filePath);
        if (isInsideArea(area.rootPath, abs)) {
          try {
            const raw = await fs.readFile(abs, 'utf8');
            const fm = extractFrontmatter(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
            assigned = assignedProfileNames(fm.data, assignField);
          } catch {
            assigned = [];
          }
        }
      }
    }
    const { fields, missing } = resolveProfileFields(
      injectEventProfile(catalog.profiles, eventsOn),
      {
        defaultProfile: config ? config.defaultProfile : null,
        assigned,
      },
    );
    return {
      ok: true,
      hasConfig: true,
      assignField,
      folderMissing: catalog.missingFolder,
      fields,
      missing,
    };
  });

  // 4T-0450 (Epic 3E-0083): Profil-Liste für den Einstellungs-Bereich —
  // erkannte Profil-Dateien des konfigurierten Ordners mit Definitions-
  // Anzahl und Validierungs-Hinweisen (aus dem Katalog, mtime-frisch).
  // 4T-0517: bei aktiver Ereignis-Erweiterung steht das interne Profil
  // „Ereignis" (datei-los, nicht änderbar) vor den Katalog-Profilen —
  // auch ohne konfigurierten oder bei fehlendem Profil-Ordner.
  ipcMain.handle('profiles:list', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const base = {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      config: null,
      folderMissing: false,
      profiles: [],
    };
    if (!area) return base;
    const eventsOn = isExtensionEnabled('events', store ? store.get('extensions.disabled') : []);
    const rows = (profiles, folderAbs) =>
      injectEventProfile(profiles, eventsOn).map((p) => ({
        name: p.name,
        fileName: p.fileName,
        path: p.internal ? null : path.join(folderAbs, p.fileName),
        internal: !!p.internal,
        fieldCount: p.fields.length,
        errors: p.errors,
      }));
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(area.rootPath));
    base.config = config;
    if (!config || !config.folder) return { ...base, profiles: rows([], null) };
    const folderAbs = path.resolve(area.rootPath, config.folder);
    if (!isInsideArea(area.rootPath, folderAbs)) {
      return { ...base, folderMissing: true, profiles: rows([], null) };
    }
    const catalog = await loadProfileCatalog({
      folderAbs,
      fsp: fs,
      cache: profileCatalogCache,
    });
    return {
      ...base,
      folderMissing: catalog.missingFolder,
      profiles: rows(catalog.profiles, folderAbs),
    };
  });

  // 4T-0450: Ordner-Auswahl für den Profil-Ordner (der Renderer speichert
  // Auswahlen innerhalb des Bereichs wurzel-relativ, Muster templates).
  ipcMain.handle('profiles:chooseFolder', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'settings.profiles.chooseFolderTitle'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  // Renderer fordert ein neues Fenster mit initialen Panes/Tabs an.
  // Format von initialPanes: [{ paths, activeIndex, tabSettings }, ...]
  // R4-03 (4T-0170): optionaler initialTabPayload (Format wie
  // tab:appendToWindow) wird nach did-finish-load an das neue Fenster
  // gereicht — traegt content/dirty, damit "In neues Fenster verschieben"
  // ungespeicherte Inhalte und Unbenannt-Tabs verlustfrei transferiert.
  ipcMain.handle('window:openNew', (event, initialPanes, initialTabPayload) => {
    const sender = senderWindow(event);
    let bounds = null;
    if (sender && !sender.isDestroyed()) {
      const isMax = sender.isMaximized();
      const senderBounds = isMax ? sender.getNormalBounds() : sender.getBounds();
      bounds = {
        x: (senderBounds.x || 0) + 30,
        y: (senderBounds.y || 0) + 30,
        width: senderBounds.width,
        height: senderBounds.height,
      };
    }
    // 4T-0318: "Neues Fenster" bleibt in der Applikation des Absenders.
    const senderAppId =
      sender && !sender.isDestroyed() ? appRegistry.appOf(sender.webContents.id) : null;
    const win = createWindow({
      bounds,
      maximized: false,
      initialPanes: Array.isArray(initialPanes) ? initialPanes : [],
      appId: senderAppId,
    });
    if (initialTabPayload && typeof initialTabPayload === 'object') {
      // Nach dem initialState senden (der did-finish-load-Listener aus
      // createWindow ist zuerst registriert); der Renderer puffert den
      // Append bis initDone und verarbeitet ihn dann verlustfrei.
      win.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed())
          win.webContents.send('tab:appendFromOtherWindow', initialTabPayload);
      });
    }
  });
}

// --- App-Lifecycle -----------------------------------------------------------

// M-02 (4T-0173): second-instance-Dateien, die ankommen, bevor das erste
// Fenster ladefertig ist. Electron-IPC puffert nicht; ohne Queue verpufft
// der Send waehrend der Startphase der ersten Instanz.
const pendingSecondInstanceFiles = [];

app.on('second-instance', (_event, argv, workingDirectory) => {
  // M-03 (4T-0173): relative Pfade gegen das CWD der zweiten Instanz aufloesen.
  const files = extractFileArgs(argv, workingDirectory || undefined);

  // 4T-0319 (Epic 3E-0057): EXE-Zweitstart OHNE Datei-Argument ist der
  // "Mehrfachstart" aus Nutzersicht — er legt eine neue logische Applikation
  // mit leerem Fenster an (statt wie vorher nur das bestehende zu fokussieren).
  if (files.length === 0) {
    if (windows.size > 0) {
      createWindow({});
    }
    return;
  }

  // Zweitstart MIT Datei-Argument (Explorer-Doppelklick, CLI): Datei in der
  // zuletzt fokussierten Applikation OHNE Bereich oeffnen (4T-0323 — Bereiche
  // sind fix, Explorer-Dateien gehen nie in eine Bereichs-App). Laufen nur
  // Bereichs-Apps, wird eine neue bereichslose Applikation angelegt.
  const target = getActiveNonAreaWindow();
  if (target) {
    if (target.isMinimized()) target.restore();
    target.focus();
    if (target.webContents.isLoading()) {
      pendingSecondInstanceFiles.push(...files);
    } else {
      target.webContents.send('file:openExternal', files);
    }
  } else if (windows.size > 0) {
    // Nur Bereichs-Apps offen: neue bereichslose App; die Dateien werden
    // nach did-finish-load aus der Pending-Queue nachgereicht.
    pendingSecondInstanceFiles.push(...files);
    createWindow({});
  } else {
    // Noch kein Fenster registriert (frueher App-Start): nachreichen,
    // sobald das erste Fenster fertig geladen ist.
    pendingSecondInstanceFiles.push(...files);
  }
});

app.whenReady().then(async () => {
  await loadStore();

  // 4T-0030: Persistierten Theme-Pref VOR dem Erzeugen des ersten Fensters
  // anwenden, damit der Background-Color-Init in createWindow direkt korrekt
  // ist und kein Theme-Flash am Start sichtbar wird.
  const savedThemePref = store?.get('themePref');
  if (savedThemePref === 'light' || savedThemePref === 'dark' || savedThemePref === 'system') {
    nativeTheme.themeSource = savedThemePref;
  }

  registerIpc();

  // 4T-0615 (Epic 3E-0116): Ablage-Ort des Bereichs-Suchraum-Caches. Bewusst
  // im Nutzerdaten-Verzeichnis und nicht im Bereich des Anwenders (Muster
  // drafts/, extensions/): Der Cache verdoppelte dort dessen Text-Bestand und
  // liefe durch jede Ordner-Synchronisierung mit.
  konfiguriereBereichsSuche({
    cacheVerzeichnis: path.join(app.getPath('userData'), 'bereichs-suche'),
  });

  // 4T-0525 (Epic 3E-0095): Erinnerungs-Takt starten (Gates pro Lauf:
  // Erweiterungs-Zustand, Index-Bereitschaft; zusaetzlicher Anstoss ueber
  // den backlinks:invalidated-Broadcast).
  reminderChecker.start();
  // 4T-0637 (Epic 3E-0069): Wecker-Takt starten. Gate pro Lauf ist der
  // Erweiterungs-Zustand; der Bezugspunkt des Faelligkeits-Fensters wird
  // hier gesetzt, damit vergangene Weckzeiten nicht nachtraeglich feuern.
  alarmChecker.start();
  // 4T-0638 (Epic 3E-0069): Weckruf fuer den naechsten Timer-Ablauf setzen.
  // Ein beim Beenden laufender Timer wird damit direkt nach dem Start wieder
  // ueberwacht (die Restzeit rechnet sich aus dem gespeicherten Zeitstempel).
  timerChecker.start();

  // Sitzungs-Wiederherstellung ueber logische Applikationen (4T-0320).
  const restore = !!store.get('restoreSession');
  const savedApps = normalizeSavedApps(store.get('apps'));

  // 4T-0368: Entwuerfe frueh lesen (raeumt zugleich verwaiste Dateien) und den
  // tatsaechlich entstehenden Applikationen bereichs-treu zuordnen. Dazu wird
  // die Ziel-App-Liste vor der Fenster-Erzeugung bestimmt (inkl. Bereichs-
  // Existenz-Filter), damit die Zuordnung nicht auf uebersprungene Apps zielt.
  const allDrafts = await readAllDrafts();
  const targetApps = []; // [{ area: areaObj|null, windows: [...] }]
  const missingAreas = [];
  if (savedApps.length > 0 && restore) {
    // 4T-0322: Bereichs-Apps nur wiederherstellen, wenn der Bereichs-Ordner
    // noch existiert; fehlende Bereiche werden gesammelt gemeldet.
    for (const appEntry of savedApps) {
      const area = appEntry.area ? areaFromRootPath(appEntry.area.rootPath) : null;
      if (area) {
        try {
          const stat = await fs.stat(area.rootPath);
          if (!stat.isDirectory()) throw new Error('kein Ordner');
        } catch {
          missingAreas.push(area.rootPath);
          continue;
        }
      }
      targetApps.push({ area, windows: appEntry.windows });
    }
  } else if (savedApps.length > 0 && !restore) {
    // restoreSession aus: nur EIN Fenster, Bounds des ersten persistierten
    // Fensters uebernehmen (UX-Kontinuitaet), aber ohne Tabs und Apps.
    const first = savedApps[0].windows[0];
    targetApps.push({
      area: null,
      windows: [{ bounds: first?.bounds || null, maximized: !!first?.maximized, panes: [] }],
    });
  }
  // 4T-0537 (Epic 3E-0098): bei aktiver Sitzungs-Wiederherstellung kommen
  // zusaetzlich die beim Beenden offenen Arbeitsbereiche zurueck (Workshop-
  // Punkt 6); fehlende Bereichs-Ordner laufen in dieselbe Sammel-Warnung,
  // der Ablage-Eintrag bleibt erhalten. Bei deaktivierter Wiederherstellung
  // bleibt es beim leeren Fenster, die Ablagen sind unberuehrt.
  if (restore) {
    for (const w of workspacesState) {
      if (!w.open) continue;
      const area = w.app.area ? areaFromRootPath(w.app.area.rootPath) : null;
      if (w.app.area && !area) continue;
      if (area) {
        try {
          const stat = await fs.stat(area.rootPath);
          if (!stat.isDirectory()) throw new Error('kein Ordner');
        } catch {
          missingAreas.push(area.rootPath);
          continue;
        }
      }
      const winList =
        w.app.windows.length > 0 ? w.app.windows : [{ bounds: null, maximized: false, panes: [] }];
      w.lastOpenedAt = utcNowSeconds();
      targetApps.push({ area, windows: winList, workspace: { id: w.id, name: w.name } });
    }
  }
  // Kaltstart oder alle Bereichs-Apps uebersprungen: ein leeres bereichsloses
  // Fenster als Ziel (nimmt auch die Entwuerfe auf).
  if (targetApps.length === 0) {
    targetApps.push({ area: null, windows: [{ bounds: null, maximized: false, panes: [] }] });
  }

  // Entwuerfe zuordnen: byApp[i] trifft App i exakt (Arbeitsbereichs-
  // Entwuerfe nur ihren Arbeitsbereich, uebrige bereichs-treu auf
  // Nicht-Arbeitsbereichs-Apps, 4T-0539); leftover (bereichslos oder
  // Bereich nicht wiederhergestellt) kommt in die erste bereichslose
  // unbenannte App (verlustfrei, ggf. eine neue; PO-Entscheidung
  // 2026-07-08). unassigned (Arbeitsbereich geschlossen) bleibt liegen.
  const appTargets = targetApps.map((t) => ({
    rootPath: t.area ? t.area.rootPath : null,
    workspaceId: t.workspace ? t.workspace.id : null,
  }));
  const { byApp, leftover, unassigned } = assignDraftsToApps(allDrafts, appTargets, isSamePath);
  if (leftover.length > 0) {
    let idx = appTargets.findIndex((t) => !t.rootPath && !t.workspaceId);
    if (idx < 0) {
      targetApps.push({ area: null, windows: [{ bounds: null, maximized: false, panes: [] }] });
      byApp.push([]);
      idx = targetApps.length - 1;
    }
    byApp[idx].push(...leftover);
  }

  // Fenster erzeugen; das jeweils erste Fenster einer App bekommt ihre
  // Entwuerfe als initialDrafts (ueber window:initialState wiederhergestellt).
  for (let ai = 0; ai < targetApps.length; ai++) {
    const t = targetApps[ai];
    const appId = appRegistry.createApp(t.area || null);
    // 4T-0537: wiederhergestellte Arbeitsbereiche behalten ihre Zuordnung.
    if (t.workspace) appRegistry.setWorkspace(appId, t.workspace);
    if (t.area) startAreaWatcher(appId);
    const draftPayload = draftsToPayload(byApp[ai] || []);
    for (let wi = 0; wi < t.windows.length; wi++) {
      const entry = t.windows[wi];
      createWindow({
        bounds: entry?.bounds || null,
        maximized: !!entry?.maximized,
        initialPanes: Array.isArray(entry?.panes) ? entry.panes : [],
        initialDrafts: wi === 0 ? draftPayload : [],
        appId,
      });
    }
  }
  if (windows.size === 0) createWindow();
  // 4T-0537: normalisierten Arbeitsbereichs-Stand samt aktualisierter
  // lastOpenedAt-Werte zurueckschreiben (Bounds/Panes folgen laufend ueber
  // persistAllWindows).
  store.set('workspaces', workspacesState);
  if (missingAreas.length > 0) {
    const locale = store.get('language') || (app.getLocale() || 'en').split('-')[0];
    dialog.showMessageBox({
      type: 'warning',
      title: tForLocale(locale, 'area.missingTitle'),
      message: tForLocale(locale, 'area.missingMessage'),
      detail: missingAreas.join('\n'),
      buttons: ['OK'],
    });
  }

  // 4T-0368: uebergebene Entwuerfe aus dem Speicher raeumen, damit die neue
  // Sitzung ihn beim naechsten App-Ende frisch fuellt. 4T-0539: selektiv —
  // Entwuerfe geschlossener Arbeitsbereiche (unassigned) bleiben liegen und
  // kommen erst mit dem Oeffnen ihres Arbeitsbereichs zurueck.
  if (allDrafts.length > unassigned.length) {
    const unassignedIds = new Set(unassigned.map((d) => d.id));
    await removeDraftsByIds(allDrafts.filter((d) => !unassignedIds.has(d.id)).map((d) => d.id));
  }

  // Beim Start uebergebene Dateien (Datei-Assoziation, "Öffnen mit") in das
  // erste Fenster OHNE Bereich reichen (4T-0323); stammen alle
  // wiederhergestellten Apps aus Bereichen, uebernimmt eine neue bereichslose
  // App die Dateien ueber die Pending-Queue.
  const initialFiles = extractFileArgs(process.argv);
  if (initialFiles.length > 0) {
    const target = getActiveNonAreaWindow();
    if (target) {
      target.webContents.once('did-finish-load', () => {
        target.webContents.send('file:openExternal', initialFiles);
      });
    } else {
      pendingSecondInstanceFiles.push(...initialFiles);
      createWindow({});
    }
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  // Letzte Persistenz, bevor die Fenster schliessen. Nur wenn beim Quit noch
  // Fenster offen sind. Wenn die Map bereits leer ist (z.B. weil der Nutzer
  // das letzte Fenster ueber X geschlossen hat und 'window-all-closed' den
  // Quit ausloest), darf nicht mit leerer Liste ueberschrieben werden, sonst
  // gingen die zuletzt im 'close'-Handler gemerkten Bounds verloren (4T-0025).
  if (windows.size > 0) persistAllWindows();
});

app.on('window-all-closed', async () => {
  await unwatchAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
