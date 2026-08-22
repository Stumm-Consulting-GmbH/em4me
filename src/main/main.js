// Electron Main-Prozess: Fenster (Multi-Window), IPC, File-Watching,
// Datei-Assoziation, Settings.
'use strict';

const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  nativeTheme,
  Notification,
  // 4T-0582 (Epic 3E-0107): Woerterbuch-Pflege der Rechtschreibpruefung.
  session,
} = require('electron');
const backlinks = require('./backlinks');
// 4T-0337 (Epic 3E-0061): Unterseiten-Namens-Logik fuer Embeds und
// Anlage-/Umbenennen-Kommandos.
const subpages = require('../shared/subpages');
// Groessen-Limit fuer Markdown-Embeds (embed:read); Markdown-Text, daher
// deutlich unter dem 20-MB-Limit des Bild-Resolvers.
const MAX_EMBED_BYTES = 5 * 1024 * 1024;
// 4T-0318 (Epic 3E-0057): logische Applikationen — jedes Fenster gehoert zu
// genau einer App; Nummerierung und Titel-Infos kommen aus der Registry.
const { createAppRegistry } = require('./app/app-registry');
// 4T-0331 (Epic 3E-0060): Dokument-Historie — Kern der .mdd-Protokollierung
// (Container-Format, Delta-Pakete, Anker, Hash-Abgleich). Electron- und
// IO-frei; Datei-Zugriff und Fenster-Hinweise bleiben hier in main.js.
const mddStore = require('./documents/mdd-store');
// 4T-0945 (Story 4S-0786): Stand-Pruefung vor dem Ueberschreiben.
const saveGuard = require('./documents/save-guard');
// 4T-0948 (Story 4S-0787): Inhalt einer Wiki-Einbettung, Puffer vor Platte.
const embedInhalt = require('./documents/embed-content');
// 4T-0619 (Epic 3E-0117): Kennzahlen-Erhebung des Bereichs (Index-Anteil
// plus ergaenzender Ordner-Scan).
const { collectAreaStats } = require('./area/area-stats');
// 4T-0615 (Epic 3E-0116): Bereichs-Suchraum — Volltext-Suche ueber alle
// Markdown-Dateien des Bereichs, mit Speicher-Vorrat und Cache im
// Nutzerdaten-Verzeichnis.
const { sucheImBereich, gibBereichsVorratFrei } = require('./area/area-search');
// 4T-0375 (Epic 3E-0070): erweiterte Versionsnummer — volle Anzeige-Version
// (X.Y.Z.N) aus der package.json-Version plus der Build-Info.
const { computeFullVersion } = require('../shared/build-version');

// 4T-1000 (Epic 3E-0196): Verdrahtung und Start-Ablauf liegen in eigenen
// Modulen. Beide sind Aufbau-Funktionen ohne Lade-Zeit-Seiteneffekte; die
// Warteschlange der Zweitstart-Dateien gehoert dem Start-Modul und wird der
// Verdrahtung als Getter gereicht.
const { createMainWiring } = require('./app/wiring');
// 4T-0971 (Epic 3E-0207): letzte Auffang-Ebene dieser Prozess-Seite.
const { erstelleAuffangEbene } = require('./app/auffang-ebene');
const { createStartup, gibWartendeZweitstartDateien } = require('./app/startup');

// 4T-0999/4T-1000 (Epic 3E-0196): die siebzehn ipc-Module der Kanal-Gruppen.
// Sie sind zur Lade-Zeit electron-frei und tragen keine Seiteneffekte;
// Registrier-Funktion und Bezuege bekommen sie unten in registerIpc.
const { registerWindowsIpc } = require('./ipc/windows');
const { registerSettingsIpc } = require('./ipc/settings');
const { registerFilesIpc } = require('./ipc/files');
const { registerHistoryIpc } = require('./ipc/history');
const { registerDialogsIpc } = require('./ipc/dialogs');
const { registerRenameIpc } = require('./ipc/rename');
const { registerAreasIpc } = require('./ipc/areas');
const { registerAttachmentsIpc } = require('./ipc/attachments');
const { registerBooksIpc } = require('./ipc/books');
const { registerShelvesIpc } = require('./ipc/shelves');
const { registerIndexViewsIpc } = require('./ipc/index-views');
const { registerRemindersIpc } = require('./ipc/reminders');
const { registerTemplatesIpc } = require('./ipc/templates');
const { registerAreaFeaturesIpc } = require('./ipc/area-features');
const { registerProfilesIpc } = require('./ipc/profiles');
const { registerExtensionsIpc } = require('./ipc/extensions');
const { registerHelpIpc } = require('./ipc/help');

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

// 4T-0784 (Epic 3E-0156): Im E2E-Lauf nehmen die Fenster keinen Fokus.
//
// Ein Lauf oeffnet ueber eine halbe Stunde hinweg laufend Fenster. Jedes davon
// riss unter Windows den Fokus an sich, und zwar mit zwei Folgen: Am Rechner
// liess sich waehrend eines Laufs kaum arbeiten, und — schwerwiegender — die
// Tastatureingaben des Anwenders landeten im Testfenster und verfaelschten den
// Lauf. Ein Testergebnis, das davon abhaengt, ob jemand nebenher tippt, ist als
// Nachweis nur begrenzt brauchbar.
//
// Zwei Wege standen zur Wahl. Das Fenster GAR NICHT zu zeigen, ist am
// Probe-Lauf gescheitert: Ein nie gezeigtes Fenster rendert unter Chromium
// nicht, `requestAnimationFrame` feuert dann nicht oder stark verzoegert, und
// die Warte-Schleifen der Suite haengen genau daran. Der Lauf brauchte nach
// 80 Minuten noch kein Ende und trug zwoelf Fehlschlaege; `backgroundThrottling`
// hilft dagegen nicht, es betrifft Timer und nicht das Compositing.
//
// Umgesetzt ist deshalb der zweite Weg: Das Fenster erscheint, aber ohne
// Fokus (`showInactive`), und keine Stelle holt es spaeter in den Vordergrund.
// Damit rendert es normal, die Suite laeuft wie gewohnt, und weder Fokus noch
// Tastatureingaben wandern in den Testlauf.
//
// Erkannt wird der Testlauf an derselben Variablen, die schon die
// Profil-Isolation steuert; eine zweite Kennung waere eine zweite Wahrheit.
const IM_TESTLAUF = !!process.env.SCG_TEST_USER_DATA;

// Single-Instance-Lock: zweite Instanz reicht ihre Datei an die laufende weiter.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// 4T-0971 (Epic 3E-0207): Letzte Auffang-Ebene des Haupt-Prozesses, registriert
// VOR der Verdrahtung. Ein Fehler waehrend des Aufbaus ist genau der Fall, in
// dem es sonst keine Spur gaebe. `persistAllWindows` entsteht erst weiter unten
// und kommt deshalb als spaet gebundener Aufruf; faellt der Fehler vor seiner
// Entstehung an, greift Zusatz 1 der Freigabe und die Sicherung scheitert
// gekapselt, statt die Behandlung mitzureissen.
erstelleAuffangEbene({
  sichereSitzung: () => persistAllWindows(),
  beende: () => app.quit(),
}).registriere(process);

// 4T-0318: App-Registry — Zuordnung Fenster -> logische Applikation.
const appRegistry = createAppRegistry();

let store = null; // electron-store, asynchron geladen (ESM-only)

// --- 4T-1000 (Epic 3E-0196): Verdrahtung -------------------------------------
//
// Die Logik-Cluster, die Fenster-Verwaltung und die drei Pruefer entstehen in
// app/wiring.js. Der Aufruf steht an derselben Stelle des Modul-Ablaufs wie
// die fruehere Verdrahtungs-Sektion: nach Umleitung, Lock und Konstanten und
// vor allem Uebrigen. Hier destrukturiert wird nur, was main.js selbst noch
// braucht; das ganze Buendel reicht registerIpc an die ipc-Module weiter.
const wiring = createMainWiring({
  appRegistry,
  getStore: () => store,
  imTestlauf: IM_TESTLAUF,
  isMarkdownPath,
  senderWindow,
  pendingSecondInstanceFiles: gibWartendeZweitstartDateien,
});
const {
  windows,
  broadcast,
  createWindow,
  persistAllWindows,
  setQuitting,
  unwatchAll,
  areaOfWindow,
  applyMenuToAllWindows,
  updateAllCaptionColors,
} = wiring;

// --- Hilfsfunktionen ---------------------------------------------------------

function isMarkdownPath(p) {
  if (!p) return false;
  const ext = path.extname(p).toLowerCase();
  return ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd';
}

function pushRecent(filePath) {
  if (!store) return;
  const recent = store.get('recentFiles', []);
  const filtered = recent.filter((p) => p !== filePath);
  filtered.unshift(filePath);
  store.set('recentFiles', filtered.slice(0, 10));
  applyMenuToAllWindows();
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
  // 4T-0999/4T-1000 (Epic 3E-0196): Alle Kanal-Gruppen liegen in eigenen
  // Modulen unter ipc/ und registrieren ihre Handler selbst ueber die hier
  // uebergebene Registrier-Funktion (Entscheidung E1, Variante B). Das
  // gemeinsame Deps-Objekt reicht ihnen die Electron-Werte, die Modul-APIs
  // und die Fenster-nahen Helfer unter genau den Namen, die die Handler-
  // Rumpfe schon bisher benutzt haben; jedes Modul nimmt daraus die Bezuege,
  // die seine eigenen Handler brauchen.
  //
  // Der Einstellungs-Speicher kommt als Getter. Die Registrierung laeuft
  // zwar vollstaendig nach loadStore, der Getter haelt die Module aber von
  // der Reihenfolge des Programmstarts unabhaengig.
  const ipcDeps = {
    // Verdrahtung: Fenster, Bereiche, Buecher, Regale, Menue, Dokumente und
    // die drei Pruefer unter ihren bisherigen Namen.
    ...wiring,
    // Electron
    app,
    dialog,
    shell,
    session,
    nativeTheme,
    BrowserWindow,
    Notification,
    // Fenster-Kontext einer Anfrage
    senderWindow,
    areaRootForEvent,
    getStore: () => store,
    // Registry, Konstanten und Modul-APIs, die main.js haelt
    appRegistry,
    isMarkdownPath,
    pushRecent,
    fullVersion,
    MAX_EMBED_BYTES,
    saveGuard,
    mddStore,
    subpages,
    backlinks,
    embedInhalt,
    collectAreaStats,
    sucheImBereich,
    gibBereichsVorratFrei,
  };
  registerWindowsIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerSettingsIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerFilesIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerHistoryIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerDialogsIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerRenameIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerAreasIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerAttachmentsIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerBooksIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerShelvesIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerIndexViewsIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerRemindersIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerTemplatesIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerAreaFeaturesIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerProfilesIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerExtensionsIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
  registerHelpIpc((kanal, fn) => ipcMain.handle(kanal, fn), ipcDeps);
}

// --- App-Lifecycle -----------------------------------------------------------

// 4T-1000 (Epic 3E-0196): Der Start-Ablauf liegt in app/startup.js; hier
// bleiben allein die Registrierungen der App-Ereignisse als duenne
// Weiterleitungen dorthin. Der Speicher bleibt Zustand von main.js und
// wandert nur hinter Funktionen (getStore/setStore).
const { starteApp, zweitInstanz } = createStartup({
  ...wiring,
  getStore: () => store,
  setStore: (geladen) => {
    store = geladen;
  },
  registerIpc,
  isMarkdownPath,
  appRegistry,
});

app.on('second-instance', (_event, argv, workingDirectory) => {
  zweitInstanz(argv, workingDirectory);
});

app.whenReady().then(starteApp);

app.on('before-quit', () => {
  setQuitting(true);
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
