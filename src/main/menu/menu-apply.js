// Menue-Anwendung je Fenster: der vom Renderer gemeldete Menue-Zustand, sein
// Zusammenbau zum Menue-State, das Setzen des Menues samt Aktionen und die
// Verteilung der Anzeige-Infos (Fenster-Nummer, Bereichs-, Buch- und
// Regal-Name) an die Fenster.
//
// Auszug aus main.js, 4T-000998 (Epic 3E-000196). Die Menue-Factory selbst liegt
// unveraendert in menu.js, die Normalisierung in menu-state.js.
//
// Eigentuemer-Zustand dieses Moduls:
//   menuStates : Map<ownerId, { locale, viewMode, lineNumbers, wordWrap,
//                togglesEnabled, ... }> — der Renderer meldet den menue-
//                relevanten Stand, das Menue dieses Fensters wird daraus pro
//                Aenderung neu gebaut und gesetzt, damit Haekchen synchron
//                bleiben.
'use strict';

const path = require('node:path');
const { buildMenu, tForLocale } = require('./menu');
// 4T-000277: Menue-State-Normalisierung (electron-frei, unit-testbar).
const { normalizeMenuState } = require('./menu-state');
const { isInsideArea } = require('../area/area-path');
// 4T-000207 (Epic 3E-000015): Kommando-Registry — Merge der Registry-Defaults
// mit den User-Overrides aus dem Store-Key 'hotkeys' fuer die Menue-
// Accelerators aller Fenster.
const { effectiveMenuAccelerators } = require('../../shared/commands/commands');
// 4T-000294 (Epic 3E-000052): Menue-Eintraege deaktivierter Erweiterungen
// verschwinden — die Kommando-Zuordnung kommt aus der Erweiterungs-Registry.
const { disabledCommandIdSet } = require('../../shared/extensions/extensions-core');

/**
 * Baut die Menue-Anwendung.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.appRegistry App-Registry (Fenster -> logische Applikation).
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {Map} deps.windows Fenster-Registry.
 * @param {Map} deps.activeBooks Aktives Buch je Applikation.
 * @param {Map} deps.activeShelves Aktives Regal je Applikation.
 * @param {Array} deps.workspacesState Arbeitsbereichs-Ablage.
 * @param {object} deps.recentLists Die vier "Zuletzt geoeffnet"-Listen.
 * @param {Function} deps.openWorkspaceById Arbeitsbereich oeffnen bzw. fokussieren.
 * @param {Function} deps.openBookDialog "Buch oeffnen…" mit Ordner-Wahl.
 * @param {Function} deps.createBookDialog "Neues Buch…".
 * @param {Function} deps.closeActiveBook "Buch schliessen".
 * @param {Function} deps.openShelfDialog "Buecherregal oeffnen…".
 * @param {Function} deps.createShelfDialog "Neues Buecherregal…".
 * @param {Function} deps.closeActiveShelf "Buecherregal schliessen".
 * @returns {object} Menue-API samt der Zustands-Map dieses Moduls.
 */
function createMenuApply(deps) {
  const {
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
  } = deps;

  const menuStates = new Map();

  // Verteilt an jedes registrierte Fenster seine aktuellen Anzeige-Infos. Wird
  // nach jedem Open- und Close-Event aufgerufen. Beim Open landet der Aufruf im
  // did-finish-load-Handler, damit auch das neu erzeugte Fenster den Push erhaelt.
  // 4T-000318: Nummerierung kommt aus der App-Registry — displayNumber/totalCount
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
        // 4T-000537: Arbeitsbereichs-Name der App (Fenster-Titel-Grundlage,
        // Anzeige-Logik folgt in 4T-000538).
        workspaceName: info.workspaceName || null,
        // 4T-000871 (Buch = Bereich): Buch-Apps tragen den Buchnamen an der
        // Stelle des Bereichsnamens im Fenstertitel; 4T-000873 ebenso die
        // Regal-Apps mit dem Regal-Namen.
        bookName:
          info.appId != null && activeBooks.has(info.appId)
            ? path.basename(activeBooks.get(info.appId))
            : null,
        shelfName:
          info.appId != null && activeShelves.has(info.appId)
            ? path.basename(activeShelves.get(info.appId))
            : null,
      });
    }
  }

  // 4T-000277: Normalisierung nach src/main/menu/menu-state.js ausgelagert
  // (electron-frei, unit-testbar). Behebt zugleich den Durchreich-Fehler
  // aus 4T-000213: manualTab kam vom Renderer, fehlte aber im Menue-State.
  function getMenuState(id) {
    const store = getStore();
    // 4T-000322/4T-000323 (Epic 3E-000058): Bereichs-Bindung der App dieses Fensters —
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
      // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Zuordnung der Fenster-App
      // plus Untermenue-Liste (open = Laufzeit-Zustand aus der Registry).
      hasWorkspace: menuAppId != null && !!appRegistry.getWorkspace(menuAppId),
      // 4T-000843 (Epic 3E-000147): aktives Buch der App dieses Fensters
      // (aktiviert "Buch schliessen").
      hasBook: menuAppId != null && activeBooks.has(menuAppId),
      // 4T-000867 (Epic 3E-000162): aktives Regal (aktiviert "Bücherregal schließen").
      hasShelf: menuAppId != null && activeShelves.has(menuAppId),
      workspaces: workspacesState.map((w) => ({
        id: w.id,
        name: w.name,
        color: w.color,
        open: appRegistry.findAppByWorkspaceId(w.id) != null,
      })),
      restoreSession: !!(store && store.get('restoreSession')),
      autoSave: !!(store && store.get('autoSave')),
      recentFiles,
      // 4T-000325: zuletzt geoeffnete Bereiche (unabhaengig vom Bereichs-Filter
      // der Datei-Liste — der Wechsel in einen anderen Bereich ist erlaubt
      // und erzeugt ggf. eine neue Applikation).
      recentAreas: (store && store.get('recentAreas')) || [],
      // 4T-000888 (Epic 3E-000168): zuletzt geoeffnete Buecher und Regale — wie die
      // Bereichs-Liste ungefiltert, weil ein Buch bzw. Regal als eigene
      // Applikation oeffnet und vom Bereich des Fensters unabhaengig ist.
      recentBooks: (store && store.get('recentBooks')) || [],
      recentShelves: (store && store.get('recentShelves')) || [],
      themePref: store && store.get('themePref'),
      // 4T-000207: effektive Menue-Accelerators (Registry-Defaults plus
      // User-Overrides aus dem Store).
      hotkeys: effectiveMenuAccelerators(store ? store.get('hotkeys') : null),
      // 4T-000294: Kommandos effektiv deaktivierter Erweiterungen — die
      // Menue-Factory laesst deren Eintraege weg.
      disabledCommands: [...disabledCommandIdSet(store ? store.get('extensions.disabled') : [])],
    });
  }

  function applyMenuToWindow(win) {
    if (!win || win.isDestroyed()) return;
    const state = getMenuState(win.webContents.id);
    const actions = {
      // 4T-000888: die vier Recent-Listen liegen in recent-lists.js.
      openRecent: (p) => recentLists.openRecentFile(p, win),
      clearRecent: () => recentLists.clearRecentFiles(win),
      // 4T-000325: Zuletzt geoeffnete Bereiche.
      openRecentArea: (p) => recentLists.openRecentArea(p, win),
      clearRecentAreas: () => recentLists.clearRecentAreas(win),
      // 4T-000538 (Epic 3E-000098): Klick auf einen Untermenue-Eintrag oeffnet
      // den Arbeitsbereich bzw. fokussiert ihn (Main fuehrt direkt aus).
      openWorkspace: (wsId) => {
        void openWorkspaceById(wsId, win);
      },
      // 4T-000843 (Epic 3E-000147): Buch oeffnen, anlegen und schliessen fuehrt der
      // Main direkt aus (Ordner-Dialog bzw. Bindung); im Fenster ist nichts zu
      // entscheiden, deshalb kein Renderer-Umweg wie beim Bereich.
      openBook: () => {
        void openBookDialog(win);
      },
      // 4T-000888 (Epic 3E-000168): Zuletzt geoeffnete Buecher (Muster der
      // Bereichs-Liste); der Klick nimmt den regulaeren Oeffnungs-Pfad.
      openRecentBook: (p) => {
        void recentLists.openRecentBook(p, win);
      },
      clearRecentBooks: () => {
        void recentLists.clearRecentBooks(win);
      },
      createBook: () => {
        void createBookDialog(win);
      },
      closeBook: () => {
        void closeActiveBook(appRegistry.appOf(win.webContents.id));
      },
      // 4T-000867 (Epic 3E-000162): Bücherregal öffnen, anlegen und schließen —
      // dieselbe Aufteilung wie bei den Büchern, der Main führt direkt aus.
      openShelf: () => {
        void openShelfDialog(win);
      },
      // 4T-000888: Zuletzt geoeffnete Buecherregale (Muster der Buch-Liste).
      openRecentShelf: (p) => {
        void recentLists.openRecentShelf(p, win);
      },
      clearRecentShelves: () => {
        void recentLists.clearRecentShelves(win);
      },
      createShelf: () => {
        void createShelfDialog(win);
      },
      closeShelf: () => {
        void closeActiveShelf(appRegistry.appOf(win.webContents.id));
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

  return {
    menuStates,
    broadcastDisplayInfo,
    getMenuState,
    applyMenuToWindow,
    applyMenuToAllWindows,
    tForWindow,
  };
}

module.exports = { createMenuApply };
