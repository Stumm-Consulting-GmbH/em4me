// Verdrahtung der Logik- und Fenster-Module des Main-Prozesses.
//
// Die Logik-Cluster und die Fenster-Verwaltung liegen seit 4T-0998 in eigenen
// Modulen; hier entstehen sie und werden untereinander verbunden. Die Namen der
// Destrukturierung sind bewusst die bisherigen, damit die Handler-Rumpfe in den
// ipc-Modulen und im Lifecycle unveraendert bleiben.
//
// Wechselseitige Bezuege (Fenster <-> Bereiche <-> Buecher/Regale <-> Menue)
// loesen Wrapper-Pfeilfunktionen und Getter im Deps-Objekt auf; gegenseitige
// Requires gibt es nicht. Ein Zustands-Behaelter kommt als Wert, wo sein
// Eigentuemer-Modul frueher konstruiert wird, sonst als Getter.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Rolle: Aufbau-Funktion ohne
// Lade-Zeit-Seiteneffekte; alles entsteht erst beim Aufruf.
'use strict';

const { app } = require('electron');
const backlinks = require('../backlinks');
const mddStore = require('../documents/mdd-store');
const attachmentPath = require('../documents/attachment-path');
const selbstSchreib = require('../documents/self-write');
const { resolveTemplatesConfig } = require('../documents/templates');
const books = require('../books/books');
const { createRecentLists } = require('../recent-lists');
const { createCheckers } = require('../checks/checkers');

// 4T-0998 (Epic 3E-0196): die dreizehn Auszuege aus main.js — Logik-Cluster
// hinter den Handlern und die Fenster-Verwaltung. Sie tragen keine Lade-Zeit-
// Seiteneffekte; verdrahtet werden sie unten in createMainWiring.
const { createWindowManager } = require('../window-manager');
const { createWindowPersistence } = require('../window-persistence');
const { createAreaApps } = require('../area/area-apps');
const { createAreaConfig } = require('../area/area-config');
const { createBookApps } = require('../books/book-apps');
const { createShelfApps } = require('../books/shelf-apps');
const { createMenuApply } = require('../menu/menu-apply');
const { createMddHistory } = require('../documents/mdd-history');
const { createDraftCache } = require('../documents/draft-cache');
const { createFileWatching } = require('../documents/file-watching');
const { createLinkUpdate } = require('../documents/link-update');
const { createBlockData } = require('../documents/block-data');

/**
 * Baut die Logik- und Fenster-Module des Main-Prozesses auf und verbindet sie.
 *
 * @param {object} deps Bezuege aus main.js.
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (entsteht erst beim Start).
 * @param {boolean} deps.imTestlauf Kennung des E2E-Laufs (Fenster ohne Fokus).
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {() => string[]} deps.pendingSecondInstanceFiles Warteschlange der Zweitstart-Dateien.
 * @returns {object} API-Buendel aller verdrahteten Module unter den bisherigen Namen.
 */
function createMainWiring(deps) {
  const {
    appRegistry,
    getStore,
    imTestlauf,
    isMarkdownPath,
    senderWindow,
    pendingSecondInstanceFiles,
  } = deps;
  // Pfade, die wir gerade selbst schreiben (Save bzw. Auto-Save). Der Watcher
  // soll nach dem Eigen-Schreiben keinen Change-Event an den Renderer melden,
  // damit kein selbst ausgeloester Reload-Loop entsteht.
  // M-15 (4T-0173): Statt einer pauschalen Zeitsperre wird der geschriebene
  // Inhalt als Hash gemerkt. Der Watcher unterdrueckt nur Events, deren
  // Datei-Stand dem Eigen-Schreiben entspricht; eine echte externe Aenderung
  // im Zeitfenster (z.B. direkt nach Blur-Auto-Save) laeuft durch und erreicht
  // den Konflikt-Dialog-Pfad.
  //
  // 4T-0947: Die Mechanik liegt in src/main/documents/self-write.js, weil sie ohne
  // Electron pruefbar sein muss. Dort ist auch der Rest der Zeitsperre gefallen:
  // Ein Eintrag verfaellt nicht mehr nach 1500 ms, sondern erst mit dem naechsten
  // eigenen Schreibvorgang oder dem Ende der Beobachtung.
  const markSelfWriting = selbstSchreib.merke;

  const areaConfig = createAreaConfig({
    getStore,
    areaOfWindow: (win) => areaOfWindow(win),
    markSelfWriting,
    mddStore,
    attachmentPath,
    resolveTemplatesConfig,
  });
  const { readAreaHistoryDefault } = areaConfig;

  const mddHistory = createMddHistory({
    getStore,
    areaOfWindow: (win) => areaOfWindow(win),
    readAreaHistoryDefault: (rootPath) => readAreaHistoryDefault(rootPath),
  });
  const {
    mddOpenPackets,
    mddSuspendedPaths,
    isMddPath,
    mddPathFor,
    mddKeyOf,
    resolveHistoryFor,
    readPreviousTextFor,
    recordMddOnSave,
    notifyMddDefect,
  } = mddHistory;

  const blockData = createBlockData({
    senderWindow: (event) => senderWindow(event),
    mddSuspendedPaths,
    mddPathFor,
    mddKeyOf,
    notifyMddDefect,
    broadcast: (channel, ...args) => broadcast(channel, ...args),
  });

  const linkUpdate = createLinkUpdate({
    areaOfWindow: (win) => areaOfWindow(win),
    isMarkdownPath: (p) => isMarkdownPath(p),
    resolveHistoryFor,
    readPreviousTextFor,
    recordMddOnSave,
    // 4T-0999: Bezuege von renameSingleFile. Die spaeter erzeugten Module
    // kommen als Wrapper, weil diese Fabrik frueher laeuft als sie.
    moveWatchEntry: (oldPath, newPath, performMove) =>
      moveWatchEntry(oldPath, newPath, performMove),
    mddPathFor,
    mddKeyOf,
    mddOpenPackets,
    mddSuspendedPaths,
    getStore,
    applyMenuToAllWindows: () => applyMenuToAllWindows(),
    broadcast: (channel, ...args) => broadcast(channel, ...args),
    books,
  });

  const fileWatching = createFileWatching({
    windows: () => windows,
  });
  const { unwatchAllForOwner, moveWatchEntry } = fileWatching;

  const draftCache = createDraftCache({
    getUserDataDir: () => app.getPath('userData'),
  });
  const { readAllDrafts, removeDraftsByIds, draftsToPayload, awaitDraftWrites } = draftCache;

  const windowPersistence = createWindowPersistence({
    appRegistry,
    getStore,
    windows: () => windows,
    activeBooks: () => activeBooks,
    activeShelves: () => activeShelves,
    workspacesState: () => workspacesState,
  });
  const {
    lastReportedPanes,
    isBoundsVisibleOnAnyDisplay,
    scheduleSaveBoundsAndPersist,
    clearSaveBoundsTimer,
    persistAllWindows,
  } = windowPersistence;

  const windowManager = createWindowManager({
    appRegistry,
    imTestlauf,
    getStore,
    isBoundsVisibleOnAnyDisplay,
    scheduleSaveBoundsAndPersist,
    persistAllWindows,
    clearSaveBoundsTimer,
    lastReportedPanes,
    menuStates: () => menuStates,
    activeBooks: () => activeBooks,
    // 4T-1031: Der closed-Pfad loest auch die Regal-Bindung; wie activeBooks
    // als Getter, weil das Regal-Modul erst weiter unten entsteht.
    activeShelves: () => activeShelves,
    workspacesState: () => workspacesState,
    areaOfWindow: (win) => areaOfWindow(win),
    updateCaptionColor: (win) => updateCaptionColor(win),
    workspacesChanged: () => workspacesChanged(),
    stopAreaWatcher: (appId) => stopAreaWatcher(appId),
    applyMenuToWindow: (win) => applyMenuToWindow(win),
    broadcastDisplayInfo: () => broadcastDisplayInfo(),
    unwatchAllForOwner,
    pendingSecondInstanceFiles,
    // 4T-0525 (Epic 3E-0095): Der Erinnerungs-Pruefer entsteht erst weiter
    // unten; spaet gebunden, weil die TDZ des const sonst zuschluege.
    onBacklinksInvalidated: () => reminderChecker.tick(),
  });
  const {
    windows,
    appLastFocused,
    inDenVordergrund,
    getActiveWindow,
    broadcast,
    createWindow,
    closeAppWindows,
  } = windowManager;

  // 4T-0888 (Epic 3E-0168): Die Recent-Listen bekommen ihren Zustand injiziert
  // (Muster createAlarmChecker). Der Store kommt als Getter, weil er erst mit
  // loadStore entsteht; die Oeffnungs-Pfade sind Modul-Funktionen und stehen
  // zur Aufruf-Zeit bereit.
  const recentLists = createRecentLists({
    getStore,
    applyMenuToAllWindows: () => applyMenuToAllWindows(),
    tForWindow: (win, key) => tForWindow(win, key),
    getActiveWindow: () => getActiveWindow(),
    focusWindow: (win) => inDenVordergrund(win),
    openAreaPath: (rootPath, win) => openAreaPath(rootPath, win),
    openBookApp: (dir, win) => openBookApp(dir, win),
    reportNotABook: (win, dir, error) => reportNotABook(win, dir, error),
    openShelfApp: (dir, win) => openShelfApp(dir, win),
    reportNotAShelf: (win, dir, error) => reportNotAShelf(win, dir, error),
  });

  const areaApps = createAreaApps({
    appRegistry,
    getStore,
    windows,
    lastReportedPanes,
    appLastFocused,
    inDenVordergrund,
    createWindow,
    broadcast,
    persistAllWindows,
    applyMenuToAllWindows: () => applyMenuToAllWindows(),
    broadcastDisplayInfo: () => broadcastDisplayInfo(),
    tForWindow: (win, key) => tForWindow(win, key),
    isMddPath,
    awaitDraftWrites,
    readAllDrafts,
    draftsToPayload,
    removeDraftsByIds,
    restoreBookForApp: (appId, dir) => restoreBookForApp(appId, dir),
    restoreShelfForApp: (appId, dir) => restoreShelfForApp(appId, dir),
  });
  const {
    workspacesState,
    areaOfWindow,
    focusFirstAppWindow,
    workspacesChanged,
    updateCaptionColor,
    openWorkspaceById,
    openAreaPath,
    startAreaWatcher,
    stopAreaWatcher,
  } = areaApps;

  const bookApps = createBookApps({
    appRegistry,
    getStore,
    windows,
    lastReportedPanes,
    activeShelves: () => activeShelves,
    areaOfWindow,
    startAreaWatcher,
    focusFirstAppWindow,
    broadcastDisplayInfo: () => broadcastDisplayInfo(),
    applyMenuToAllWindows: () => applyMenuToAllWindows(),
    tForWindow: (win, key) => tForWindow(win, key),
    persistAllWindows,
    createWindow,
    closeAppWindows,
    recentLists,
  });
  const {
    activeBooks,
    appIdOfWindow,
    appHasOpenFilesOutside,
    sendWhenLoaded,
    openBookApp,
    closeActiveBook,
    reportNotABook,
    restoreBookForApp,
    openBookDialog,
    createBookDialog,
  } = bookApps;

  const shelfApps = createShelfApps({
    appRegistry,
    getStore,
    windows,
    activeBooks,
    appIdOfWindow,
    sendWhenLoaded,
    appHasOpenFilesOutside,
    openBookApp,
    areaOfWindow,
    startAreaWatcher,
    focusFirstAppWindow,
    broadcastDisplayInfo: () => broadcastDisplayInfo(),
    applyMenuToAllWindows: () => applyMenuToAllWindows(),
    tForWindow: (win, key) => tForWindow(win, key),
    persistAllWindows,
    createWindow,
    closeAppWindows,
    recentLists,
  });
  const {
    activeShelves,
    openShelfApp,
    closeActiveShelf,
    reportNotAShelf,
    restoreShelfForApp,
    openShelfDialog,
    createShelfDialog,
  } = shelfApps;

  const menuApply = createMenuApply({
    appRegistry,
    getStore,
    windows,
    activeBooks,
    activeShelves,
    workspacesState,
    recentLists,
    openWorkspaceById,
    openBookDialog,
    createBookDialog,
    closeActiveBook,
    openShelfDialog,
    createShelfDialog,
    closeActiveShelf,
  });
  const { menuStates, broadcastDisplayInfo, applyMenuToWindow, applyMenuToAllWindows, tForWindow } =
    menuApply;

  // 4T-0015: Backlinks-Modul mit dem Broadcast verdrahten, damit watcher-
  // getriebene Aenderungen alle Fenster erreichen.
  backlinks.attachBroadcast(broadcast);
  // 4T-0348 (Epic 3E-0062): markSelfWriting an den Bereichs-Index-Cache reichen,
  // damit das Schreiben von Area_Cache.mdda nicht als Fremd-Aenderung zaehlt.
  backlinks.attachSelfWriter(markSelfWriting);

  // 4T-1000 (Epic 3E-0196): die drei Pruefer liegen in checks/checkers.js;
  // ihre Umgebung kommt von hier. Der Aufbau steht an derselben Stelle des
  // Ablaufs wie zuvor, weil die Fenster-Verwaltung den Erinnerungs-Pruefer
  // spaet gebunden anspricht (onBacklinksInvalidated).
  const { reminderChecker, alarmChecker, timerChecker } = createCheckers({
    appRegistry,
    getStore,
    windows,
    backlinks,
    broadcast,
  });

  return {
    ...areaConfig,
    ...mddHistory,
    ...blockData,
    ...linkUpdate,
    ...fileWatching,
    ...draftCache,
    ...windowPersistence,
    ...windowManager,
    recentLists,
    ...areaApps,
    ...bookApps,
    ...shelfApps,
    ...menuApply,
    reminderChecker,
    alarmChecker,
    timerChecker,
  };
}

module.exports = { createMainWiring };
