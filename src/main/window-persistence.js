// Sitzungs-Persistenz der Fenster: Bounds-Sicherung mit Debounce, Live-
// Schnappschuss einer Applikation und das Schreiben der Store-Schluessel
// 'apps' und 'workspaces'.
//
// Auszug aus main.js, 4T-000998 (Epic 3E-000196). Bewusst neben der
// Fenster-Verwaltung und nicht in ihr: Erzeugung und Lebenszyklus eines
// Fensters einerseits, sein persistierter Abdruck andererseits sind zwei
// Verantwortlichkeiten, und zusammen rissen sie das Datei-Budget.
//
// Eigentuemer-Zustand dieses Moduls:
//   saveBoundsTimers   : Map<ownerId, Timer> der laufenden Debounce-Timer
//   lastReportedPanes  : Map<ownerId, panes-Array>, zuletzt vom Renderer
//                        gemeldete Pane-Struktur je Fenster
//
// Fremder Zustand kommt als Getter im Deps-Objekt (Begruendung im Kopf von
// window-manager.js).
'use strict';

const { screen } = require('electron');

/**
 * Baut die Sitzungs-Persistenz der Fenster.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.appRegistry App-Registry (Fenster -> logische Applikation).
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {() => Map} deps.windows Fenster-Registry.
 * @param {() => Map} deps.activeBooks Aktives Buch je Applikation.
 * @param {() => Map} deps.activeShelves Aktives Regal je Applikation.
 * @param {() => Array} deps.workspacesState Arbeitsbereichs-Ablage.
 * @returns {object} Persistenz-API samt der Zustands-Behaelter dieses Moduls.
 */
function createWindowPersistence(deps) {
  const { appRegistry, getStore, windows, activeBooks, activeShelves, workspacesState } = deps;

  const saveBoundsTimers = new Map(); // ownerId -> Timer

  // Der Renderer meldet seine Pane-Struktur per IPC. Wir speichern hier den
  // letzten gemeldeten Stand pro Fenster, damit ein Bounds-Save auch immer die
  // passenden Tabs persistiert.
  const lastReportedPanes = new Map(); // ownerId -> panes-Array

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

  function saveBoundsForWindow(win) {
    if (!win || win.isDestroyed()) return null;
    // M-07 (4T-000173): minimiert liefert getNormalBounds die Restore-Bounds.
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

  // Offenen Debounce-Timer eines Fensters verwerfen (Close-Pfad der
  // Fenster-Verwaltung). Ohne diesen Zugang griffe der Close-Handler in die
  // Timer-Map eines fremden Moduls.
  function clearSaveBoundsTimer(id) {
    const timer = saveBoundsTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      saveBoundsTimers.delete(id);
    }
  }

  // Live-Snapshot einer App im Persistenz-Format (Bounds und letzte vom
  // Renderer gemeldete Pane-Struktur pro Fenster). null ohne lebende Fenster.
  // 4T-000537: aus persistAllWindows extrahiert, weil workspace:saveAs denselben
  // Snapshot als Erst-Stand des neuen Arbeitsbereichs braucht.
  function liveAppSnapshot(appId) {
    const winEntries = [];
    for (const windowId of appRegistry.windowsOf(appId)) {
      const win = windows().get(windowId);
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
    // 4T-000843 (Epic 3E-000147): aktives Buch der App mitfuehren, damit die
    // Sitzungs-Wiederherstellung es zurueckbringt (Story 4S-000752, AK4). Das
    // Feld entsteht nur bei geoeffnetem Buch (Schema-Kommentar in
    // session-schema.js).
    const bookDir = activeBooks().get(appId);
    // 4T-000867 (Epic 3E-000162): aktives Regal ebenso mitfuehren (Story 4S-000760,
    // AK5); das Feld entsteht nur bei geoeffnetem Regal.
    const shelfDir = activeShelves().get(appId);
    return {
      area: area && area.rootPath ? { rootPath: area.rootPath } : null,
      ...(bookDir ? { book: { dir: bookDir } } : {}),
      ...(shelfDir ? { shelf: { dir: shelfDir } } : {}),
      windows: winEntries,
    };
  }

  // Persistiert den aktuellen Stand ALLER Fenster (Bounds und letzte vom Renderer
  // gemeldete Pane-Struktur) in den Store. Wird bei Bounds-Aenderungen, beim
  // Wechsel des Maximiert-Status und beim App-Quit aufgerufen.
  // 4T-000320: Schema ueber logische Applikationen (Store-Key 'apps'): pro App
  // Bereichs-Bindung plus Fenster-Liste. Der Bereichsname wird nicht
  // persistiert (beim Restore aus rootPath abgeleitet).
  // 4T-000537: Apps mit Arbeitsbereichs-Zuordnung landen im app-Feld ihres
  // 'workspaces'-Eintrags statt in 'apps'; eingefrorene (geschlossene)
  // Arbeitsbereiche bleiben unangetastet. Beide Keys gehen in EINEM
  // store.set-Aufruf raus (ein Dateischreibvorgang, kein Zwischenzustand).
  function persistAllWindows() {
    const store = getStore();
    if (!store) return;
    const appsList = [];
    for (const appId of appRegistry.appIds()) {
      const snapshot = liveAppSnapshot(appId);
      if (!snapshot) continue;
      const ws = appRegistry.getWorkspace(appId);
      const entry = ws ? workspacesState().find((w) => w.id === ws.id) : null;
      if (entry) entry.app = snapshot;
      else appsList.push(snapshot);
    }
    store.set({ apps: appsList, workspaces: workspacesState() });
  }

  return {
    lastReportedPanes,
    isBoundsVisibleOnAnyDisplay,
    scheduleSaveBoundsAndPersist,
    clearSaveBoundsTimer,
    liveAppSnapshot,
    persistAllWindows,
  };
}

module.exports = { createWindowPersistence };
