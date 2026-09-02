// Bereichs- und Arbeitsbereichs-Vermittlung: Bereichs-Bindung eines Fensters,
// Oeffnen eines Bereichs bzw. eines benannten Arbeitsbereichs, Fokus-Ziele
// einer Applikation, Titelleisten-Farbe und der Verzeichnis-Watcher je
// Bereichs-App.
//
// Auszug aus main.js, 4T-000998 (Epic 3E-000196).
//
// Eigentuemer-Zustand dieses Moduls:
//   workspacesState : In-Memory-Stand des Store-Keys 'workspaces' (Quelle der
//                     Wahrheit zur Laufzeit; in loadStore normalisiert
//                     gelesen und hier ueber setWorkspacesState uebernommen).
//                     persistAllWindows schreibt 'apps' und 'workspaces' in
//                     EINEM store.set-Aufruf (ein Dateischreibvorgang), damit
//                     der Wechsel einer App zwischen beiden Keys (benennen,
//                     degradieren) bei Absturz nie einen doppelten oder
//                     verlorenen Eintrag hinterlaesst.
//   areaWatchers    : Map<appId, { watcher, timer, rootPath }>
'use strict';

const fs = require('node:fs/promises');
const { dialog, nativeTheme } = require('electron');
const chokidar = require('chokidar');
const backlinks = require('../backlinks');
const { isSamePath, areaFromRootPath, updatedRecentAreas } = require('./area-path');
// 4T-000630 (Epic 3E-000102): Titelleisten-Faerbung nach Arbeitsbereichs-Farbe
// (DWM-Fenster-Attribute via koffi; Windows-10-Fallback: stiller No-op).
const { applyCaptionColor } = require('../app/caption-color.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');

// UTC-Zeitstempel sekundengenau (Zeitstempel-Konvention, Muster drafts).
function utcNowSeconds() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Baut die Bereichs- und Arbeitsbereichs-Vermittlung.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.appRegistry App-Registry (Fenster -> logische Applikation).
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {Map} deps.windows Fenster-Registry.
 * @param {Map} deps.lastReportedPanes Zuletzt gemeldete Pane-Struktur je Fenster.
 * @param {Map} deps.appLastFocused Zuletzt fokussiertes Fenster je Applikation.
 * @param {Function} deps.inDenVordergrund Fenster in den Vordergrund holen.
 * @param {Function} deps.createWindow Fenster erzeugen.
 * @param {Function} deps.broadcast Broadcast an alle Fenster.
 * @param {Function} deps.persistAllWindows Sitzungs-Persistenz.
 * @param {Function} deps.applyMenuToAllWindows Menues neu bauen.
 * @param {Function} deps.broadcastDisplayInfo Anzeige-Infos verteilen.
 * @param {Function} deps.tForWindow Lokalisierter Text in Fenster-Sprache.
 * @param {(p: string) => boolean} deps.isMddPath Markdown-Data-Datei erkennen.
 * @param {Function} deps.awaitDraftWrites Laufende Entwurfs-Schreibvorgaenge abwarten.
 * @param {Function} deps.readAllDrafts Entwuerfe lesen.
 * @param {Function} deps.draftsToPayload Entwuerfe in das Renderer-Payload wandeln.
 * @param {Function} deps.removeDraftsByIds Entwuerfe selektiv entfernen.
 * @param {Function} deps.restoreBookForApp Aktives Buch wiederherstellen.
 * @param {Function} deps.restoreShelfForApp Aktives Regal wiederherstellen.
 * @param {(rootPath: string) => Promise<object|null>} deps.resolveAreaStartPage Start-Seite des Bereichs.
 * @returns {object} Bereichs-API samt der Zustands-Behaelter dieses Moduls.
 */
function createAreaApps(deps) {
  const {
    appRegistry,
    getStore,
    windows,
    lastReportedPanes,
    appLastFocused,
    inDenVordergrund,
    createWindow,
    broadcast,
    persistAllWindows,
    applyMenuToAllWindows,
    broadcastDisplayInfo,
    tForWindow,
    isMddPath,
    awaitDraftWrites,
    readAllDrafts,
    draftsToPayload,
    removeDraftsByIds,
    restoreBookForApp,
    restoreShelfForApp,
    // 4T-001364 (Epic 3E-000171): Start-Seite des Bereichs aufloesen.
    resolveAreaStartPage,
  } = deps;

  const workspacesState = [];

  // 4T-000998: loadStore liefert den normalisierten Stand zurueck, statt eine
  // fremde Modul-Variable zu setzen. Der Behaelter behaelt dabei seine
  // Identitaet, weil main.js und die Nachbar-Module ihn als Wert halten.
  function setWorkspacesState(list) {
    workspacesState.length = 0;
    if (Array.isArray(list)) workspacesState.push(...list);
  }

  const areaWatchers = new Map(); // appId -> { watcher, timer }

  // Bereichs-Bindung der App eines Fensters (null ohne Bereich). 4T-000323:
  // gemeinsamer Zugriff aller Grenz-Pfade (Dialoge, file:read, Recent-Filter).
  function areaOfWindow(win) {
    if (!win || win.isDestroyed()) return null;
    const appId = appRegistry.appOf(win.webContents.id);
    return appId != null ? appRegistry.getArea(appId) : null;
  }

  // Hat die App irgendeine geoeffnete DATEI (Tab mit Pfad)? Unbenannt-Tabs
  // zaehlen nicht als geoeffnete Datei — sie sind (noch) keine Datei; die
  // Pane-Snapshots des Renderers fuehren ohnehin nur Pfad-Tabs.
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
    inDenVordergrund(win);
  }

  // 4T-000537: "erneutes Oeffnen fokussiert" zielt aufs zuletzt aktive Fenster
  // des Arbeitsbereichs (Workshop-Punkt 3); Fallback erstes Fenster der App.
  function focusLastActiveAppWindow(appId) {
    const winIds = appRegistry.windowsOf(appId);
    const lastId = appLastFocused.get(appId);
    const targetId = lastId != null && winIds.includes(lastId) ? lastId : winIds[0];
    const win = targetId != null ? windows.get(targetId) : null;
    inDenVordergrund(win);
  }

  // 4T-000538 (Epic 3E-000098): jede Arbeitsbereichs-Aenderung zieht die
  // Fenster-Menues (Untermenue-Liste, Dimmungen) und die Renderer
  // (Verwaltungs-Dialog) nach.
  function workspacesChanged() {
    applyMenuToAllWindows();
    broadcast('workspaces:changed');
  }

  // 4T-000630 (Epic 3E-000102): Titelleisten-Farbe eines Fensters an den
  // Arbeitsbereichs-Zustand angleichen — Farb-Key aus workspacesState
  // (die App-Registry fuehrt nur {id, name}), Theme-Variante aus
  // nativeTheme. Ohne Arbeitsbereichs-Zuordnung oder bei ausgeschalteter
  // Erweiterung 'workspaces' Standard-Titelleiste (Reset). Das Erweiterungs-
  // Gate sitzt bewusst Main-seitig: der Renderer steuert die native
  // Titelleiste nicht (der Titel-Suffix hat sein Gate im Renderer).
  function updateCaptionColor(win) {
    if (!win || win.isDestroyed()) return;
    const store = getStore();
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

  // Oeffnen-Kern fuer IPC-Handler und Menue-Action (4T-000538 aus dem
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
    // 4T-000843 (Epic 3E-000147): aktives Buch des eingefrorenen Arbeitsbereichs
    // zurueckbringen (Muster der Sitzungs-Wiederherstellung).
    if (entry.app.book?.dir) void restoreBookForApp(appId, entry.app.book.dir);
    // 4T-000867 (Epic 3E-000162): aktives Regal des eingefrorenen Arbeitsbereichs
    // zurueckbringen (Muster der Buch-Wiederherstellung).
    if (entry.app.shelf?.dir) void restoreShelfForApp(appId, entry.app.shelf.dir);
    // 4T-000539 (Epic 3E-000098): liegende Entwuerfe dieses Arbeitsbereichs
    // mitnehmen (erstes Fenster, window:initialState-Weg) und danach selektiv
    // aus dem Speicher raeumen. Vorher die Schreib-Kette abwarten, damit ein
    // gerade abgeschlossenes Schliessen seine Entwuerfe fertig persistiert hat.
    await awaitDraftWrites();
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
  // 4T-001364 (Epic 3E-000171): Start-Seite des Bereichs als Pane-Snapshot fuer ein
  // neu entstehendes Fenster. Liefert [] wenn keine Festlegung besteht oder sie
  // ins Leere zeigt; im zweiten Fall wird der Anwender hingewiesen, ohne dass
  // das Oeffnen scheitert (Entscheidung aus 4T-001363: die Start-Seite ist eine
  // Bequemlichkeit, kein Tor).
  async function startPagePanes(rootPath, senderWin) {
    if (!resolveAreaStartPage) return [];
    let resolved;
    try {
      resolved = await resolveAreaStartPage(rootPath);
    } catch {
      return []; // defekte Bereichsdatei wirkt wie keine Festlegung
    }
    if (!resolved) return [];
    if (resolved.missing) {
      meldeFehlendeStartSeite(resolved.path, senderWin);
      return [];
    }
    return [{ paths: [resolved.path], activeIndex: 0 }];
  }

  // Hinweis auf eine ins Leere zeigende Festlegung. Bewusst nicht-blockierend
  // im Ablauf (kein await): der Bereich ist bereits offen, wenn der Anwender
  // ihn wegklickt.
  function meldeFehlendeStartSeite(zielPfad, senderWin) {
    const win = senderWin && !senderWin.isDestroyed() ? senderWin : null;
    void dialog.showMessageBox({
      type: 'warning',
      title: tForWindow(win, 'area.startPageMissingTitle'),
      message: tForWindow(win, 'area.startPageMissingMessage'),
      detail: zielPfad,
      buttons: ['OK'],
    });
  }

  async function openAreaPath(rootPath, senderWin) {
    const store = getStore();
    const area = areaFromRootPath(rootPath);
    if (!area) return { ok: false, error: 'invalid path' };
    // 4T-000325: jedes Bereich-Oeffnen pflegt die Zuletzt-Liste (auch der
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
      // 4T-001364: Die App war leer und uebernimmt den Bereich — es gibt nichts
      // wiederherzustellen, also greift die Start-Seite. Sie wird in das
      // bereits laufende Fenster gereicht (Muster der Start-Dateien).
      const panes = await startPagePanes(area.rootPath, senderWin);
      if (panes.length > 0 && senderWin && !senderWin.isDestroyed()) {
        senderWin.webContents.send('file:openExternal', panes[0].paths);
      }
      return { ok: true, boundExisting: true };
    }
    // 4T-001364: Neues Bereichs-Fenster — die Start-Seite reist als Pane-Snapshot
    // mit, damit sie wie ein wiederhergestellter Tab entsteht.
    const initialPanes = await startPagePanes(area.rootPath, senderWin);
    const win = createWindow({ area, initialPanes });
    startAreaWatcher(appRegistry.appOf(win.webContents.id));
    return { ok: true, createdNew: true };
  }

  // --- 4T-000328 (Epic 3E-000059): Verzeichnis-Watcher pro Bereichs-App ------------
  // Struktur-Ereignisse (Datei/Ordner angelegt, geloescht, umbenannt) im
  // Bereichs-Baum werden debounced als 'area:changed' an die Fenster der App
  // gemeldet; der Renderer liest die Listings idempotent neu (kein Echo-
  // Schutz noetig). Lebenszyklus: Start mit der Bereichs-Bindung, Stopp mit
  // dem Verschwinden der App (Muster des Datei-Watchers in file-watching.js).
  function startAreaWatcher(appId) {
    if (areaWatchers.has(appId)) return;
    const area = appRegistry.getArea(appId);
    if (!area) return;
    // 4T-000348 (Epic 3E-000062): Bereichs-Index proaktiv aufbauen, sobald ein
    // Bereich gebunden wird. So entsteht der Index "automatisch beim Start" und
    // persistiert sich in Area_Cache.mdda, ohne dass eine Datei offen sein muss.
    // Der Owner haelt den Index ueber die Lebensdauer der Bereichs-App;
    // stopAreaWatcher gibt ihn beim Bereichs-Schliessen frei.
    backlinks.ensureAreaIndex(area.rootPath, `area:${appId}`);
    const watcher = chokidar.watch(area.rootPath, {
      ignoreInitial: true,
      // 4T-000348 (Epic 3E-000062): Markdown-Data-Dateien (.mdd/.mdda/.mddb) sind
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
    // 4T-000348 (Epic 3E-000062): proaktiven Bereichs-Index-Owner freigeben. Ist er
    // der letzte Owner der Wurzel, startet der Soft-Timer und der Teardown flusht
    // den Cache ein letztes Mal.
    if (entry.rootPath) backlinks.releaseRoot(entry.rootPath, `area:${appId}`);
    areaWatchers.delete(appId);
  }

  return {
    workspacesState,
    setWorkspacesState,
    utcNowSeconds,
    areaOfWindow,
    appHasOpenFiles,
    focusFirstAppWindow,
    focusLastActiveAppWindow,
    workspacesChanged,
    updateCaptionColor,
    updateAllCaptionColors,
    openWorkspaceById,
    openAreaPath,
    startAreaWatcher,
    stopAreaWatcher,
  };
}

module.exports = { createAreaApps };
