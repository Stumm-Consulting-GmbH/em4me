// Electron Main-Prozess: Fenster (Multi-Window), IPC, File-Watching,
// Datei-Assoziation, Settings.
'use strict';

const path = require('node:path');
// 4T-001991 (Epic 3E-000188): Anlegen des temporaeren Ordners im Daten-Ordner.
const fs = require('node:fs');
const {
  app,
  // 4T-001991 (Epic 3E-000188): Fenster-Erkennung der Datei-Dialog-Huelle.
  BaseWindow,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  nativeTheme,
  Notification,
  // 4T-000582 (Epic 3E-000107): Woerterbuch-Pflege der Rechtschreibpruefung.
  session,
} = require('electron');
const backlinks = require('./backlinks');
// 4T-000337 (Epic 3E-000061): Unterseiten-Namens-Logik fuer Embeds und
// Anlage-/Umbenennen-Kommandos.
const subpages = require('../shared/subpages');
// Groessen-Limit fuer Markdown-Embeds (embed:read); Markdown-Text, daher
// deutlich unter dem 20-MB-Limit des Bild-Resolvers.
const MAX_EMBED_BYTES = 5 * 1024 * 1024;
// 4T-000318 (Epic 3E-000057): logische Applikationen — jedes Fenster gehoert zu
// genau einer App; Nummerierung und Titel-Infos kommen aus der Registry.
const { createAppRegistry } = require('./app/app-registry');
// 4T-000331 (Epic 3E-000060): Dokument-Historie — Kern der .mdd-Protokollierung
// (Container-Format, Delta-Pakete, Anker, Hash-Abgleich). Electron- und
// IO-frei; Datei-Zugriff und Fenster-Hinweise bleiben hier in main.js.
const mddStore = require('./documents/mdd-store');
// 4T-000945 (Story 4S-000786): Stand-Pruefung vor dem Ueberschreiben.
const saveGuard = require('./documents/save-guard');
// 4T-000948 (Story 4S-000787): Inhalt einer Wiki-Einbettung, Puffer vor Platte.
const embedInhalt = require('./documents/embed-content');
// 4T-000619 (Epic 3E-000117): Kennzahlen-Erhebung des Bereichs (Index-Anteil
// plus ergaenzender Ordner-Scan).
const { collectAreaStats } = require('./area/area-stats');
// 4T-000615 (Epic 3E-000116): Bereichs-Suchraum — Volltext-Suche ueber alle
// Markdown-Dateien des Bereichs, mit Speicher-Vorrat und Cache im
// Nutzerdaten-Verzeichnis.
const { sucheImBereich, gibBereichsVorratFrei } = require('./area/area-search');
// 4T-000375 (Epic 3E-000070): erweiterte Versionsnummer — volle Anzeige-Version
// (X.Y.Z.N) aus der package.json-Version plus der Build-Info.
const { computeFullVersion, auspraegungsKennzeichnung } = require('../shared/build-version');
// 4T-002222: eingepackte Paket-Angaben, Träger der Kennzeichnung einer zweiten
// Ausprägung (Muster src/main/ipc/windows.js).
const eigenePaketAngaben = require('../../package.json');

// 4T-001000 (Epic 3E-000196): Verdrahtung und Start-Ablauf liegen in eigenen
// Modulen. Beide sind Aufbau-Funktionen ohne Lade-Zeit-Seiteneffekte; die
// Warteschlange der Zweitstart-Dateien gehoert dem Start-Modul und wird der
// Verdrahtung als Getter gereicht.
const { createMainWiring } = require('./app/wiring');
// 4T-000971 (Epic 3E-000207): letzte Auffang-Ebene dieser Prozess-Seite.
const { erstelleAuffangEbene } = require('./app/auffang-ebene');
const { createStartup, gibWartendeZweitstartDateien } = require('./app/startup');
// 4T-001990 (Epic 3E-000188): portabler Betrieb mit Daten-Ordner neben dem
// Programm, und der Katalog-Lader fuer seine Meldung vor dem ready-Ereignis.
const {
  ermittlePortablenBetrieb,
  meldungsSprache,
  temporaerOrdnerPfad,
  umhuelleDateiDialoge,
  startOrdnerDerDialoge,
  MELDUNG_TITEL_SCHLUESSEL,
  MELDUNG_TEXT_SCHLUESSEL,
} = require('./app/portabler-betrieb');
const { tForLocale } = require('./menu/menu-dict');

// 4T-000999/4T-001000 (Epic 3E-000196): die siebzehn ipc-Module der Kanal-Gruppen.
// Sie sind zur Lade-Zeit electron-frei und tragen keine Seiteneffekte;
// Registrier-Funktion und Bezuege bekommen sie unten in registerIpc.
const { registerWindowsIpc } = require('./ipc/windows');
const { registerSettingsIpc } = require('./ipc/settings');
const { registerFilesIpc } = require('./ipc/files');
const { registerHistoryIpc } = require('./ipc/history');
const { registerDialogsIpc } = require('./ipc/dialogs');
const { registerRenameIpc } = require('./ipc/rename');
const { registerAreasIpc } = require('./ipc/areas');
// 4T-001731 (Epic 3E-000306): Kopieren einer Datei im Bereich.
const { registerAreaCopyIpc } = require('./ipc/area-copy');
const { registerAttachmentsIpc } = require('./ipc/attachments');
const { registerBooksIpc } = require('./ipc/books');
const { registerShelvesIpc } = require('./ipc/shelves');
const { registerIndexViewsIpc } = require('./ipc/index-views');
// 4T-001486 (Epic 3E-000199): Einbettungen als eigene Kanal-Gruppe.
const { registerEmbedsIpc } = require('./ipc/embeds');
const { registerRemindersIpc } = require('./ipc/reminders');
const { registerTemplatesIpc } = require('./ipc/templates');
const { registerAreaFeaturesIpc } = require('./ipc/area-features');
const { registerProfilesIpc } = require('./ipc/profiles');
// 4T-001510 (Epic 3E-000250): Kanaele des Datenbank-Katalogs.
const { registerDatabaseIpc } = require('./ipc/database');
const { registerExtensionsIpc } = require('./ipc/extensions');
const { registerHelpIpc } = require('./ipc/help');
// 4T-001587 (Epic 3E-000160): Ex- und Import der eigenen Einrichtung.
const { registerExchangeIpc } = require('./ipc/exchange');
// 4T-001592 (Epic 3E-000129): Eigene Oberflaechen-Sprachen.
const { registerLocalesIpc } = require('./ipc/locales');
// 4T-001598 (Epic 3E-000191): My Extended Memory — die eingetragene Gefaess-Liste.
const { registerMemoryIpc } = require('./ipc/memory');
// 4T-001806 (Epic 3E-000292): Einlesen einer Datei des offenen Formats JSON Canvas.
const { registerCanvasImportIpc } = require('./ipc/canvas-import');

// 4T-000375: volle Version aus package.json-Version und Build-Info; fehlende
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

// 4T-000166: Test-Isolation. E2E-Laeufe setzen SCG_TEST_USER_DATA auf ein
// Temp-Verzeichnis, damit electron-store und Single-Instance-Lock nie das
// echte Nutzer-Profil beruehren. Muss vor requestSingleInstanceLock() und
// vor jedem Store-Zugriff stehen.
if (process.env.SCG_TEST_USER_DATA) {
  app.setPath('userData', process.env.SCG_TEST_USER_DATA);
}

// 4T-001990 (Epic 3E-000188): Portabler Betrieb. Liegt neben der gepackten
// Programmdatei der Daten-Ordner, wandert das gesamte Nutzerdaten-Verzeichnis
// dorthin — aus demselben Grund und an derselben Stelle wie die
// Test-Umlenkung darueber: vor requestSingleInstanceLock(), dessen Datei
// `lockfile` sonst als erste im Benutzerprofil entstuende, und vor jedem
// Store-Zugriff. Die Test-Umlenkung hat Vorrang (die Erkennung meldet dann
// «nicht portabel»). Die Chromium-Bestaende (Pfad sessionData) folgen userData
// von selbst: Mit einer gleichwertigen Umlenkung lagen sie am 2026-09-28
// vollstaendig im umgelenkten Ordner (4T-001844, Zusatz Z1 bis Z3). Die Pfade
// logs und crashDumps legt die Anwendung nicht an (kein setAppLogsPath, kein
// crashReporter); beide braeuchten zum Umlenken zudem einen schon
// vorhandenen Ordner. Das Ergebnis wird hier EINMAL ermittelt und
// weitergereicht (Start-Ablauf, IPC-Bezuege).
const portablerBetrieb = ermittlePortablenBetrieb({
  programmPfad: process.execPath,
  gepackt: app.isPackaged,
  testUmlenkung: process.env.SCG_TEST_USER_DATA,
  // 4T-002222: Ordner der portablen EXE, gesetzt von ihrem Start-Rahmen. Die
  // zweite Ausprägung für den Prüfstand zählt nicht als portabel.
  portableExeOrdner: process.env.PORTABLE_EXECUTABLE_DIR,
  zweiteAuspraegung: auspraegungsKennzeichnung(eigenePaketAngaben) !== null,
});
if (portablerBetrieb.portabel && portablerBetrieb.beschreibbar) {
  app.setPath('userData', portablerBetrieb.datenOrdner);
  legeTemporaerOrdnerInDenDatenOrdner(portablerBetrieb.datenOrdner);
  // 4T-001991 (Epic 3E-000188): Kein Datei-Dialog des Programms traegt die
  // gewaehlte Datei in die Listen zuletzt benutzter Dateien von Windows ein
  // (Eigenschaft dontAddToRecent). Ersetzt werden die vier Funktionen am
  // dialog-Objekt der Laufzeit-Umgebung, und zwar HIER statt an den rund
  // zwanzig Aufruf-Stellen: Eine neue Aufruf-Stelle erbte den Schutz sonst
  // nicht. Das traegt, weil jedes Modul dasselbe Objekt haelt und die Funktion
  // erst beim Aufruf von ihm liest; das sichert der Waechter
  // test/unit/spuren-außerhalb-des-daten-ordners.test.js. Dieselbe Huelle
  // oeffnet jeden Dialog im zuletzt besuchten Ordner, gemerkt nur im
  // Arbeitsspeicher, anfangs in «Dokumente» — nie in dem Ordner, den Windows
  // sich gemerkt hat.
  Object.assign(
    dialog,
    umhuelleDateiDialoge(dialog, (x) => x instanceof BaseWindow, {
      startOrdner: startOrdnerDerDialoge(
        () => app.getPath('documents'),
        path.dirname(process.execPath),
      ),
    }),
  );
}

// 4T-001991 (Epic 3E-000188): Im portablen, beschreibbaren Betrieb liegt auch
// der temporaere Ordner des Prozesses im Daten-Ordner. Der Anzeige-Prozess
// jedes Fensters legt dort eine leere Datei <GUID>.tmp an und haelt sie bis
// zum Schliessen (Messung am gebauten Programm vom 2026-09-28, Halter-Abfrage);
// ohne diese Umlenkung entsteht sie im Temp-Ordner des Benutzerprofils. Gesetzt
// werden die Umgebungsvariablen TEMP und TMP, die Windows fuer den
// temporaeren Ordner liest und die jeder spaeter gestartete Kind-Prozess
// erbt, dazu der Electron-Pfad `temp`. Das geschieht vor dem
// Einzel-Instanz-Schutz und vor jedem Fenster, also bevor ein Kind-Prozess
// startet. Installierte Fassung und Testlauf bleiben unberuehrt; am nicht
// beschreibbaren Ort wird nichts angelegt. Scheitert das Anlegen, bleibt es
// nach einer Warnung beim bisherigen temporaeren Ordner: Das Programm laeuft
// dann wie vor dieser Umlenkung, statt am Start zu scheitern.
function legeTemporaerOrdnerInDenDatenOrdner(datenOrdner) {
  const tempOrdner = temporaerOrdnerPfad(datenOrdner);
  try {
    fs.mkdirSync(tempOrdner, { recursive: true });
  } catch (err) {
    console.warn(`Temporaerer Ordner ${tempOrdner} nicht angelegt:`, err);
    return;
  }
  process.env.TEMP = tempOrdner;
  process.env.TMP = tempOrdner;
  app.setPath('temp', tempOrdner);
}

// 4T-001990: Ist der Daten-Ordner nicht beschreibbar, zeigt das Programm eine
// Meldung und beendet sich, ohne irgendwo etwas abzulegen (Entscheidung des
// Product Owners vom 2026-09-28, Weg A der Vorlage 1). Kein
// Einzel-Instanz-Schutz, kein Einstellungs-Speicher, kein Fenster.
const START_ABGEBROCHEN = portablerBetrieb.portabel && !portablerBetrieb.beschreibbar;

function brecheStartAb(datenOrdner) {
  // userData trotzdem auf den Daten-Ordner, damit bis zum Beenden kein
  // Bestandteil der Laufzeit ins Benutzerprofil ausweicht. setPath wirft, wenn
  // der Ordner nicht als Verzeichnis erreichbar ist (Fall «unbekannt» der
  // Erkennung); dann bleibt es beim Beenden, das ohnehin unmittelbar folgt.
  try {
    app.setPath('userData', datenOrdner);
  } catch (err) {
    console.warn(`Nutzerdaten-Verzeichnis nicht auf ${datenOrdner} gesetzt:`, err);
  }
  // Vor ready zulaessig: getPreferredSystemLanguages (ohne ready-Vorbehalt in
  // der API) und showErrorBox (ausdruecklich vor ready freigegeben). Die
  // Spracheinstellung des Programms steht im Einstellungs-Speicher und wird
  // hier bewusst nicht gelesen.
  const sprache = meldungsSprache(app.getPreferredSystemLanguages());
  dialog.showErrorBox(
    tForLocale(sprache, MELDUNG_TITEL_SCHLUESSEL),
    tForLocale(sprache, MELDUNG_TEXT_SCHLUESSEL),
  );
  app.exit(1);
}

if (START_ABGEBROCHEN) brecheStartAb(portablerBetrieb.datenOrdner);

// 4T-000784 (Epic 3E-000156): Im E2E-Lauf nehmen die Fenster keinen Fokus.
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
// 4T-001990: nach abgebrochenem Start nicht — seine Datei `lockfile` waere das
// Erste, was im Daten-Ordner entstuende. Dieser und der Waechter am
// ready-Ereignis unten greifen nur, falls app.exit vor ready nicht sofort
// beendet.
const gotLock = !START_ABGEBROCHEN && app.requestSingleInstanceLock();
if (!gotLock && !START_ABGEBROCHEN) {
  app.quit();
}

// 4T-000971 (Epic 3E-000207): Letzte Auffang-Ebene des Haupt-Prozesses, registriert
// VOR der Verdrahtung. Ein Fehler waehrend des Aufbaus ist genau der Fall, in
// dem es sonst keine Spur gaebe. `persistAllWindows` entsteht erst weiter unten
// und kommt deshalb als spaet gebundener Aufruf; faellt der Fehler vor seiner
// Entstehung an, greift Zusatz 1 der Freigabe und die Sicherung scheitert
// gekapselt, statt die Behandlung mitzureissen.
erstelleAuffangEbene({
  sichereSitzung: () => persistAllWindows(),
  beende: () => app.quit(),
}).registriere(process);

// 4T-000318: App-Registry — Zuordnung Fenster -> logische Applikation.
const appRegistry = createAppRegistry();

let store = null; // electron-store, asynchron geladen (ESM-only)

// --- 4T-001000 (Epic 3E-000196): Verdrahtung -------------------------------------
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
  schliessRueckfall,
  anzeigeAusfall,
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
  // 4T-000630 (Epic 3E-000102): Titelleisten der Arbeitsbereichs-Fenster auf die
  // Theme-Variante der Palette umfaerben (deckt theme:setPref und System-
  // Wechsel ab — beide feuern 'updated').
  updateAllCaptionColors();
});

// --- IPC-Handler -------------------------------------------------------------

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

// 4T-000347 (Epic 3E-000062): Bereichs-Wurzel des anfragenden Fensters fuer die
// Backlinks-Index-Einstiege. In einer Bereichs-App ist das der Bereichs-
// Wurzelordner (bereichsweiter Index ueber den ganzen Baum), sonst null
// (backlinks.js faellt dann auf die Ordner-Wurzel der Datei zurueck).
function areaRootForEvent(event) {
  const area = areaOfWindow(senderWindow(event));
  return area ? area.rootPath : null;
}

function registerIpc() {
  // 4T-000999/4T-001000 (Epic 3E-000196): Alle Kanal-Gruppen liegen in eigenen
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
    // 4T-001990 (Epic 3E-000188): Ergebnis der Erkennung des portablen
    // Betriebs, eingefroren; bereit fuer eine spaetere Abfrage ueber IPC.
    portablerBetrieb,
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
  // 4T-001213 (Epic 3E-000225): Jeder IPC-Aufruf ist das Lebenszeichen seines
  // Anzeige-Prozesses, denn er setzt dort einen laufenden Ereignis-Zyklus
  // voraus. Diese Registrier-Funktion ist die eine Stelle, durch die alle
  // Kanaele laufen; die Stille-Wache des Schliess-Wegs haengt deshalb hier
  // und nicht in siebzehn Handler-Modulen. Solange ein Aufruf in Bearbeitung
  // ist, ruht die Frist: Ein laufender Aufruf belegt, dass der Haupt-Prozess
  // fuer dieses Fenster arbeitet — das deckt jeden Dialog ab, auch die
  // Nachfrage nach ungespeicherten Inhalten, vor der ein Anwender beliebig
  // lange sitzen darf.
  const registriere = (kanal, fn) =>
    ipcMain.handle(kanal, async (event, ...args) => {
      const fensterId = event && event.sender ? event.sender.id : null;
      if (fensterId != null) schliessRueckfall.aufrufBegonnen(fensterId);
      try {
        return await fn(event, ...args);
      } finally {
        if (fensterId != null) schliessRueckfall.aufrufBeendet(fensterId);
      }
    });
  registerWindowsIpc(registriere, ipcDeps);
  registerSettingsIpc(registriere, ipcDeps);
  registerFilesIpc(registriere, ipcDeps);
  registerHistoryIpc(registriere, ipcDeps);
  registerDialogsIpc(registriere, ipcDeps);
  registerRenameIpc(registriere, ipcDeps);
  registerAreasIpc(registriere, ipcDeps);
  registerAreaCopyIpc(registriere, ipcDeps);
  registerAttachmentsIpc(registriere, ipcDeps);
  registerBooksIpc(registriere, ipcDeps);
  registerShelvesIpc(registriere, ipcDeps);
  registerIndexViewsIpc(registriere, ipcDeps);
  registerEmbedsIpc(registriere, ipcDeps);
  registerRemindersIpc(registriere, ipcDeps);
  registerTemplatesIpc(registriere, ipcDeps);
  registerAreaFeaturesIpc(registriere, ipcDeps);
  registerProfilesIpc(registriere, ipcDeps);
  registerDatabaseIpc(registriere, ipcDeps);
  registerExtensionsIpc(registriere, ipcDeps);
  registerHelpIpc(registriere, ipcDeps);
  registerExchangeIpc(registriere, ipcDeps);
  registerLocalesIpc(registriere, ipcDeps);
  registerMemoryIpc(registriere, ipcDeps);
  registerCanvasImportIpc(registriere, ipcDeps);
}

// --- App-Lifecycle -----------------------------------------------------------

// 4T-001000 (Epic 3E-000196): Der Start-Ablauf liegt in app/startup.js; hier
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
  portablerBetrieb,
});

app.on('second-instance', (_event, argv, workingDirectory) => {
  zweitInstanz(argv, workingDirectory);
});

// 4T-001990: Nach abgebrochenem Start laedt nichts den Einstellungs-Speicher.
if (!START_ABGEBROCHEN) app.whenReady().then(starteApp);

// 4T-001214 (Epic 3E-000225): Ausfall des Anzeige-Prozesses. Zwei getrennte
// Faelle: `render-process-gone` meldet den verschwundenen Prozess samt Grund,
// `unresponsive` den noch lebenden, der nicht mehr antwortet — der zweite
// wird erst nach einer Frist behandelt und verfaellt bei `responsive`.
//
// Verdrahtet ueber `browser-window-created`, damit jedes Fenster erfasst ist,
// ohne window-manager.js anzufassen: Die Datei steht an ihrem Groessen-Budget,
// ihr Schnitt ist als 3E-000228 verortet.
app.on('render-process-gone', (_event, contents, details) => {
  const win = BrowserWindow.fromWebContents(contents);
  if (win) void anzeigeAusfall.prozessFort(win, contents.id, details);
});

app.on('browser-window-created', (_event, win) => {
  const fensterId = win.webContents.id;
  win.on('unresponsive', () => anzeigeAusfall.antwortetNicht(win, fensterId));
  win.on('responsive', () => anzeigeAusfall.antwortetWieder(fensterId));
  win.once('closed', () => anzeigeAusfall.vergiss(fensterId));
});

app.on('before-quit', () => {
  setQuitting(true);
  // Letzte Persistenz, bevor die Fenster schliessen. Nur wenn beim Quit noch
  // Fenster offen sind. Wenn die Map bereits leer ist (z.B. weil der Nutzer
  // das letzte Fenster ueber X geschlossen hat und 'window-all-closed' den
  // Quit ausloest), darf nicht mit leerer Liste ueberschrieben werden, sonst
  // gingen die zuletzt im 'close'-Handler gemerkten Bounds verloren (4T-000025).
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
