// Verdrahtung der Logik- und Fenster-Module des Main-Prozesses.
//
// Die Logik-Cluster und die Fenster-Verwaltung liegen seit 4T-000998 in eigenen
// Modulen; hier entstehen sie und werden untereinander verbunden. Die Namen der
// Destrukturierung sind bewusst die bisherigen, damit die Handler-Rumpfe in den
// ipc-Modulen und im Lifecycle unveraendert bleiben.
//
// Wechselseitige Bezuege (Fenster <-> Bereiche <-> Buecher/Regale <-> Menue)
// loesen Wrapper-Pfeilfunktionen und Getter im Deps-Objekt auf; gegenseitige
// Requires gibt es nicht. Ein Zustands-Behaelter kommt als Wert, wo sein
// Eigentuemer-Modul frueher konstruiert wird, sonst als Getter.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Rolle: Aufbau-Funktion ohne
// Lade-Zeit-Seiteneffekte; alles entsteht erst beim Aufruf.
'use strict';

const { app, dialog } = require('electron');
const backlinks = require('../backlinks');
const mddStore = require('../documents/mdd-store');
const attachmentPath = require('../documents/attachment-path');
const selbstSchreib = require('../documents/self-write');
const { resolveTemplatesConfig, normalizeTemplatesConfig } = require('../documents/templates');
const books = require('../books/books');
const { createRecentLists } = require('../recent-lists');
const { createCheckers } = require('../checks/checkers');

// 4T-000998 (Epic 3E-000196): die dreizehn Auszuege aus main.js — Logik-Cluster
// hinter den Handlern und die Fenster-Verwaltung. Sie tragen keine Lade-Zeit-
// Seiteneffekte; verdrahtet werden sie unten in createMainWiring.
const { erstelleSchliessRueckfall, erstelleErzwungenenSchluss } = require('./schliess-rueckfall');
const { erstelleAnzeigeAusfall } = require('./anzeige-ausfall');
const { createWindowManager } = require('../window-manager');
const { createWindowPersistence } = require('../window-persistence');
const { createAreaApps } = require('../area/area-apps');
const { createAreaConfig } = require('../area/area-config');
// 4T-001795 (Epic 3E-000255, E9): Sperr-Verwaltung der Datensatz-Sperren.
const { erzeugeSperrVerwaltung } = require('../database/lock-lifecycle');
// 4T-001821 (Epic 3E-000254, E12.6, E15.2): Schreib-Schnittstelle der Datenbank.
const { erzeugeSchreibSchnittstelle } = require('../database/record-auftrag');
// 4T-001823 (Epic 3E-000254, E11.3): die Klammer des Absichts-Protokolls.
const { erzeugeAbsichtsProtokoll } = require('../database/intent-log');
// 4T-001824 (Epic 3E-000254, E11.3): der Wiederanlauf liegengebliebener Aufträge.
const { erzeugeWiederanlauf } = require('../database/intent-recovery');
// 4T-001926 (Epic 3E-000256, E12.6): die Prüf-Naht des Regel-Werks.
const { erzeugePruefNaht } = require('../database/record-regeln');
// 4T-001928 (Epic 3E-000256, E5.4): die Verweis-Regel, erstes Modul des Regel-Werks.
const { verweisRegel } = require('../database/record-regel-verweis');
const { schluesselRegel } = require('../database/record-regel-schluessel');
const { loeschschutzRegel } = require('../database/record-regel-loeschschutz');
const { pruefregelnRegel } = require('../database/record-regel-pruefregeln');
const { bearbeitbarRegel } = require('../database/record-regel-bearbeitbar');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
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
  // M-15 (4T-000173): Statt einer pauschalen Zeitsperre wird der geschriebene
  // Inhalt als Hash gemerkt. Der Watcher unterdrueckt nur Events, deren
  // Datei-Stand dem Eigen-Schreiben entspricht; eine echte externe Aenderung
  // im Zeitfenster (z.B. direkt nach Blur-Auto-Save) laeuft durch und erreicht
  // den Konflikt-Dialog-Pfad.
  //
  // 4T-000947: Die Mechanik liegt in src/main/documents/self-write.js, weil sie ohne
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
    // 4T-001456 (Epic 3E-000190): Normalisierung der Vorlagen-Sektion eines
    // verknuepften Bereichs beim Bauen der Quellen-Kette.
    normalizeTemplatesConfig,
  });
  const { readAreaHistoryDefault } = areaConfig;

  // 4T-001795 (Epic 3E-000255, Bauplan N1): **Eine** Sperr-Verwaltung je
  // Prozess. Ihr Eigen-Register — welche Sperren DIESER Prozess haelt — traegt
  // die drei Zusagen des Lebenszyklus nur, solange es genau eines gibt: Eine
  // zweite Instanz hielte ein eigenes, leeres Register und beurteilte damit die
  // eigenen Sperren der ersten als fremde. Deshalb entsteht sie hier, an der
  // Verdrahtungs-Stelle, und nicht dort, wo sie gebraucht wird; die
  // Schreib-Schnittstelle bekommt spaeter dieselbe Instanz.
  //
  // Der Leser der Bereichs-Konfiguration ist ihre Pflicht-Naht: Aus ihm loest
  // der Sperr-Speicher bei JEDEM Zugriff den wirksamen Ordnernamen frisch auf,
  // ohne Zwischenspeicher.
  const sperrVerwaltung = erzeugeSperrVerwaltung({
    leseKonfig: (rootPath) => areaConfig.readAreaDatabaseConfig(rootPath),
  });

  // 4T-001821 (Epic 3E-000254): Die Schreib-Schnittstelle der Datenbank entsteht
  // genau EINMAL und bekommt DIESELBE Sperr-Verwaltung; das ist die Zusage aus
  // dem Kommentar darueber, hier eingeloest. Sie ist der erste produktive
  // Aufrufer von Sperre, Aenderungsbeleg, Verdichtung und Vorgangs-Zaehler und
  // traegt deshalb deren Tor (E15.2).
  //
  // Das Tor wird als FUNKTION gereicht und nicht als Wert: Der Anwender darf die
  // Erweiterung im laufenden Programm ausschalten, und ein beim Start
  // eingefrorener Zustand schriebe danach weiter.
  //
  // In diesem Vorgang ruft sie niemand; Kanal und Bruecke entstehen in einem
  // eigenen Vorgang.
  //
  // 4T-001823 (Epic 3E-000254): Die Klammer des Absichts-Protokolls entsteht
  // ebenfalls genau einmal, mit DERSELBEN Sperr-Verwaltung und demselben Leser
  // der Bereichs-Konfiguration; durch sie schreibt die Schnittstelle jeden
  // Auftrag. Ein zweiter Sperr-Speicher entsteht damit nicht.
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({
    sperrVerwaltung,
    leseKonfig: (rootPath) => areaConfig.readAreaDatabaseConfig(rootPath),
  });
  // 4T-001824 (Epic 3E-000254): Das Tor der Erweiterung als EINE Funktion, weil
  // es zwei Verbraucher hat: die Schnittstelle und den Wiederanlauf, der beim
  // Öffnen eines Bereichs ohne Schnittstelle davor gerufen wird.
  const datenbankAktiv = () => {
    const store = getStore();
    return isExtensionEnabled('database', store ? store.get('extensions.disabled') : []);
  };
  // 4T-001824 (Epic 3E-000254): Der Wiederanlauf entsteht genau einmal, mit
  // DERSELBEN Sperr-Verwaltung und demselben Leser der Bereichs-Konfiguration wie
  // die Klammer. Er hat zwei Aufrufer und keinen dritten: die Schnittstelle vor
  // jedem Auftrag und das Öffnen eines Bereichs (`areaApps` weiter unten).
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    leseKonfig: (rootPath) => areaConfig.readAreaDatabaseConfig(rootPath),
    erweiterungAktiv: datenbankAktiv,
    // 4T-001824 (Nachschärfung, Befund 2): Welche Vorgänge die Klammer dieses
    // Prozesses gerade fährt; die Sperren eines anderen eigenen Protokolls sind
    // die Hinterlassenschaft eines gescheiterten Laufs.
    laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
  });
  // 4T-001926 (Epic 3E-000256, E12.6): Die Prüf-Naht des Regel-Werks entsteht
  // genau EINMAL und wird der Schnittstelle hereingereicht; durch sie läuft
  // jeder Auftrag nach Typ- und Pflicht-Prüfung. Die Tabellen-Sicht ist
  // dieselbe, aus der der Datenbank-Kanal den Katalog bildet (die Index-Sicht
  // nach Bereichs-Wurzel), damit Regeln und Katalog dieselben Tabellen sehen.
  // Die Regel-Module laufen in der Reihenfolge der Liste; ein Modul sieht die
  // Ersetzungen der vor ihm laufenden.
  const pruefNaht = erzeugePruefNaht({
    // 4T-001928: Die Verweis-Regel läuft als Erste, weil sie Schlüssel-Werte durch
    // Kennungen ersetzt und die folgenden Regeln (Schlüssel, Lösch-Schutz) auf
    // dem ersetzten Wert arbeiten sollen.
    regeln: [verweisRegel, schluesselRegel, loeschschutzRegel, pruefregelnRegel, bearbeitbarRegel],
    tabellenSicht: (bereichsWurzel) => backlinks.datenbankSicht(null, bereichsWurzel),
  });
  const schreibSchnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf,
    erweiterungAktiv: datenbankAktiv,
    pruefNaht,
  });

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
    // 4T-000999: Bezuege von renameSingleFile. Die spaeter erzeugten Module
    // kommen als Wrapper, weil diese Fabrik frueher laeuft als sie.
    moveWatchEntry: (oldPath, newPath, performMove) =>
      moveWatchEntry(oldPath, newPath, performMove),
    // 4T-001789 (Epic 3E-000255): mddPathFor faellt hier weg. Die Pfade der
    // Begleit-Dateien bildet seither companion-files.js aus der Liste der
    // Begleit-Datei-Arten; ein Bezug allein auf die .mdd passte nicht mehr.
    mddKeyOf,
    mddOpenPackets,
    mddSuspendedPaths,
    getStore,
    applyMenuToAllWindows: () => applyMenuToAllWindows(),
    broadcast: (channel, ...args) => broadcast(channel, ...args),
    books,
    // 4T-001364 (Epic 3E-000171): Ist die bewegte Datei die Start-Seite eines
    // Bereichs, faehrt die Festlegung mit. Der Bereich wird ueber die laufenden
    // Bereichs-Apps bestimmt statt durch Hochlaufen des Verzeichnisbaums: Eine
    // Umbenennung geschieht immer in einer laufenden Anwendung, und ein
    // stat-Lauf je Ebene bei jeder Umbenennung waere teuer fuer einen Fall,
    // der selten eintritt.
    followAreaStartPage: async (oldPath, newPath) => {
      const wurzeln = new Set();
      for (const appId of appRegistry.appIds()) {
        const area = appRegistry.getArea(appId);
        if (area && area.rootPath) wurzeln.add(area.rootPath);
      }
      for (const rootPath of wurzeln) {
        const relativeAlt = areaConfig.startPageRelative(rootPath, oldPath);
        if (relativeAlt === null) continue;
        const gesetzt = await areaConfig.readAreaStartPage(rootPath);
        if (gesetzt !== relativeAlt) continue;
        // Wandert die Datei aus dem Bereich hinaus, wird die Festlegung
        // entfernt statt auf einen unerreichbaren Pfad zu zeigen.
        const relativeNeu = areaConfig.startPageRelative(rootPath, newPath);
        await areaConfig.writeAreaStartPage(rootPath, relativeNeu);
      }
    },
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

  // 4T-001213 (Epic 3E-000225): Rueckfall im Schliess-Weg. Die Wache entsteht VOR
  // der Fenster-Verwaltung, weil diese sie im close-Handler startet; ihre
  // Handlung nach Ablauf greift umgekehrt auf die Fenster-Verwaltung zu und
  // ist deshalb spaet gebunden (Muster activeShelves weiter unten).
  const schliessRueckfall = erstelleSchliessRueckfall({
    beiAblauf: (fensterId, befund) => erzwungenerSchluss(fensterId, befund),
  });
  const erzwungenerSchluss = erstelleErzwungenenSchluss({
    wache: schliessRueckfall,
    fensterVon: (fensterId) => windowManager.windows.get(fensterId) || null,
    quittiere: (win) => windowManager.confirmedClosings.add(win),
    // Der Hinweis kommt aus dem Haupt-Prozess: Der Anzeige-Prozess ist genau
    // der, der nicht mehr antwortet, also kann die Meldung nicht aus ihm
    // kommen. Vorbelegt ist das Schliessen, weil der Anwender es angefordert
    // hat; die Abbruch-Taste faellt auf Weiterwarten zurueck.
    frage: async (win, sekunden) => {
      const t = (k) => tForWindow(win, k);
      const ergebnis = await dialog.showMessageBox(win, {
        type: 'warning',
        title: t('window.unresponsiveTitle'),
        message: t('window.unresponsiveMessage').replace('{n}', String(sekunden)),
        detail: t('window.unresponsiveDetail'),
        buttons: [t('window.unresponsiveClose'), t('window.unresponsiveWait')],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return ergebnis.response === 0;
    },
  });

  const windowManager = createWindowManager({
    appRegistry,
    schliessRueckfall,
    imTestlauf,
    getStore,
    isBoundsVisibleOnAnyDisplay,
    scheduleSaveBoundsAndPersist,
    persistAllWindows,
    clearSaveBoundsTimer,
    lastReportedPanes,
    menuStates: () => menuStates,
    activeBooks: () => activeBooks,
    // 4T-001031: Der closed-Pfad loest auch die Regal-Bindung; wie activeBooks
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
    // 4T-000525 (Epic 3E-000095): Der Erinnerungs-Pruefer entsteht erst weiter
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

  // 4T-001214 (Epic 3E-000225): Ausfall-Erkennung des Anzeige-Prozesses. Weg N2
  // (Entscheidung des Product Owners vom 2026-08-26): melden und den Anwender
  // waehlen lassen, Neuladen als Vorgabe. Beim zweiten Ausfall desselben
  // Fensters entfaellt das Neuladen — sonst baut ein Dokument, das die Anzeige
  // zuverlaessig umbringt, eine Endlosschleife.
  const anzeigeAusfall = erstelleAnzeigeAusfall({
    schliessenLaeuft: (fensterId) => schliessRueckfall.istAktiv(fensterId),
    ladeNeu: (win) => win.webContents.reload(),
    schliesse: (win) => {
      // Ueber den regulaeren Quittungs-Weg: Der Anzeige-Prozess kann die
      // Schliess-Quittung nicht mehr erteilen, und der close-Handler schreibt
      // im quittierten Zweig den Sitzungs-Stand (Muster aus 4T-001213).
      windowManager.confirmedClosings.add(win);
      win.close();
    },
    frage: async (win, lage) => {
      const t = (k) => tForWindow(win, k);
      const knoepfe = lage.wiederholung
        ? [t('window.crashClose')]
        : [t('window.crashReload'), t('window.crashClose')];
      const ergebnis = await dialog.showMessageBox(win, {
        type: 'error',
        title: t('window.crashTitle'),
        message: t('window.crashMessage'),
        detail: lage.wiederholung ? t('window.crashRepeatDetail') : t('window.crashDetail'),
        buttons: knoepfe,
        defaultId: 0,
        cancelId: knoepfe.length - 1,
        noLink: true,
      });
      return !lage.wiederholung && ergebnis.response === 0 ? 'neuLaden' : 'schliessen';
    },
  });

  // 4T-000888 (Epic 3E-000168): Die Recent-Listen bekommen ihren Zustand injiziert
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
    // 4T-001364 (Epic 3E-000171): Start-Seite des Bereichs; areaConfig entsteht
    // weiter oben und ist hier bereits gebunden.
    resolveAreaStartPage: (rootPath) => areaConfig.resolveAreaStartPage(rootPath),
    // 4T-001453 (Epic 3E-000190): Verknuepfungen des Bereichs fuer die Pruefung
    // beim Oeffnen.
    readAreaLinks: (rootPath) => areaConfig.readAreaLinks(rootPath),
    // 4T-001787 (Epic 3E-000255, E9): Bereichs-Konfiguration der Datenbank; aus
    // ihr bezieht der Bereichs-Watcher den wirksamen Namen des Sperr-Ordners.
    readAreaDatabaseConfig: (rootPath) => areaConfig.readAreaDatabaseConfig(rootPath),
    normalisiereDatenbankKonfig: (roh) => areaConfig.normalisiereDatenbankKonfig(roh),
    // 4T-001824 (Epic 3E-000254): der zweite Auslöser des Wiederanlaufs.
    wiederanlauf,
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

  // 4T-000015: Backlinks-Modul mit dem Broadcast verdrahten, damit watcher-
  // getriebene Aenderungen alle Fenster erreichen.
  backlinks.attachBroadcast(broadcast);
  // 4T-000348 (Epic 3E-000062): markSelfWriting an den Bereichs-Index-Cache reichen,
  // damit das Schreiben von Area_Cache.mdda nicht als Fremd-Aenderung zaehlt.
  backlinks.attachSelfWriter(markSelfWriting);

  // 4T-001000 (Epic 3E-000196): die drei Pruefer liegen in checks/checkers.js;
  // ihre Umgebung kommt von hier. Der Aufbau steht an derselben Stelle des
  // Ablaufs wie zuvor, weil die Fenster-Verwaltung den Erinnerungs-Pruefer
  // spaet gebunden anspricht (onBacklinksInvalidated).
  const {
    reminderChecker,
    alarmChecker,
    timerChecker,
    reminderDelivery,
    alarmDelivery,
    timerDelivery,
  } = createCheckers({
    appRegistry,
    getStore,
    backlinks,
    broadcast,
  });

  return {
    sperrVerwaltung,
    schreibSchnittstelle,
    // 4T-001938 (Epic 3E-000257): Das Tor als dritter Verbraucher für den
    // lesenden Datensatz-Kanal; EINE Funktion, damit kein Kanal es nachbaut.
    datenbankAktiv,
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
    reminderDelivery,
    alarmDelivery,
    timerDelivery,
    schliessRueckfall,
    anzeigeAusfall,
  };
}

module.exports = { createMainWiring };
