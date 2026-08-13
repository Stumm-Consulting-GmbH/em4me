// IPC-Kanal-Gruppe Fenster, Applikationen und Arbeitsbereiche: Schliess-
// Quittung des Renderers, Meldungen ueber Panes, Menue-Stand und Reiter-Meta,
// die Fenster-Liste des Reiter-Kontextmenues, der Lebenszyklus der
// Arbeitsbereiche sowie der Entwurfs-Zwischenspeicher.
//
// Auszug aus main.js, 4T-0999 (Epic 3E-0196). Kanal-Gruppe: window:*,
// tab:appendToWindow, app:*, workspace:*, drafts:save.
//
// Eigener Zustand: keiner; Fenster-Registry, App-Registry und der
// Arbeitsbereichs-Stand gehoeren ihren Modulen und kommen als Deps.
'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { isInsideArea } = require('../area/area-path');
const { TAB_GROUP_COLOR_KEYS } = require('../../shared/tab-group-colors');

/**
 * Registriert die Fenster-, Applikations- und Arbeitsbereichs-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.app Electron-App-Objekt.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {object} deps.appRegistry Zuordnung Fenster -> logische Applikation.
 * @param {Map} deps.windows Fenster-Registry.
 * @param {Map} deps.windowMeta Reiter-Meta je Fenster.
 * @param {Set} deps.confirmedClosings Fenster mit erteilter Schliess-Quittung.
 * @param {Map} deps.lastReportedPanes Zuletzt gemeldete Pane-Struktur je Fenster.
 * @param {Map} deps.menuStates Menue-relevanter Stand je Fenster.
 * @param {Map} deps.activeBooks Aktives Buch je Applikation.
 * @param {Map} deps.activeShelves Aktives Regal je Applikation.
 * @param {Array} deps.workspacesState Abgelegte Arbeitsbereiche.
 * @param {Function} deps.createWindow Neues Fenster anlegen.
 * @param {Function} deps.closeAppWindows Alle Fenster einer Applikation schliessen.
 * @param {Function} deps.inDenVordergrund Fenster in den Vordergrund holen.
 * @param {(quitting: boolean) => void} deps.setQuitting Beenden-Merker setzen.
 * @param {() => void} deps.cancelCascade Laufende Schliess-Kaskade abbrechen.
 * @param {Function} deps.applyMenuToWindow Menue eines Fensters neu bauen.
 * @param {Function} deps.scheduleSaveBoundsAndPersist Bounds-Sicherung anstossen.
 * @param {Function} deps.persistAllWindows Sitzungs-Stand schreiben.
 * @param {Function} deps.liveAppSnapshot Live-Abbild einer Applikation.
 * @param {() => number} deps.utcNowSeconds Zeitstempel in Sekunden (UTC).
 * @param {() => void} deps.broadcastDisplayInfo Anzeige-Infos an alle Fenster.
 * @param {() => void} deps.workspacesChanged Arbeitsbereichs-Aenderung melden.
 * @param {() => void} deps.updateAllCaptionColors Titelleisten aller Fenster umfaerben.
 * @param {Function} deps.openWorkspaceById Arbeitsbereich oeffnen bzw. fokussieren.
 * @param {Function} deps.enqueueDraftWrite Schreib-Kette des Entwurfs-Speichers.
 * @param {Function} deps.appendDrafts Entwuerfe additiv schreiben.
 * @param {Function} deps.retagDraftsToGlobal Entwuerfe in den globalen Topf umhaengen.
 * @param {() => string} deps.fullVersion Volle Anzeige-Version.
 */
function registerWindowsIpc(handle, deps) {
  const {
    app,
    dialog,
    senderWindow,
    areaOfWindow,
    tForWindow,
    appRegistry,
    windows,
    windowMeta,
    confirmedClosings,
    lastReportedPanes,
    menuStates,
    activeBooks,
    activeShelves,
    workspacesState,
    createWindow,
    closeAppWindows,
    inDenVordergrund,
    setQuitting,
    cancelCascade,
    applyMenuToWindow,
    scheduleSaveBoundsAndPersist,
    persistAllWindows,
    liveAppSnapshot,
    utcNowSeconds,
    broadcastDisplayInfo,
    workspacesChanged,
    updateAllCaptionColors,
    openWorkspaceById,
    enqueueDraftWrite,
    appendDrafts,
    retagDraftsToGlobal,
    fullVersion,
  } = deps;

  // Renderer signalisiert, dass das Fenster nun tatsaechlich geschlossen
  // werden darf (alle dirtigen Tabs wurden gespeichert oder verworfen).
  handle('window:confirmClose', (event) => {
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
  handle('window:cancelClose', () => {
    setQuitting(false);
    // 4T-0322: laufende Bereich-Schliessen-Kaskade abbrechen.
    cancelCascade();
  });

  // --- Arbeitsbereiche: Lebenszyklus (4T-0537, Epic 3E-0098) -----------------
  // Benannte, mehrfach abgelegte logische Applikationen (Workshop-Protokoll
  // in 4T-0536). Nach jeder Ablage-Aenderung geht 'workspaces:changed' an
  // alle Fenster (Muster journals:changed); die UI (4T-0538) zieht Untermenue
  // und Verwaltungs-Dialog darueber nach.

  // Metadaten-Liste ohne App-Snapshot. 'open' ist der LAUFZEIT-Zustand aus
  // der Registry (fuer die Offen-Markierung der UI); der persistierte
  // open-Merker der Ablage steuert dagegen die Sitzungs-Wiederherstellung.
  handle('workspace:list', () => {
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
  handle('workspace:saveAs', (event, params) => {
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
  handle('workspace:create', (event, params) => {
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
  handle('workspace:open', (event, id) => openWorkspaceById(id, senderWindow(event)));

  // 4T-0538: Loesch-Bestaetigung als nativer Dialog (Muster
  // events:confirmDelete); der Verwaltungs-Dialog fragt vor workspace:delete.
  handle('workspace:confirmDelete', async (event, name) => {
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
  handle('workspace:close', async (event) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    if (appId == null || !appRegistry.getWorkspace(appId)) {
      return { ok: false, error: 'not a workspace' };
    }
    return closeAppWindows(appId);
  });

  handle('workspace:rename', (event, params) => {
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

  handle('workspace:setColor', (event, params) => {
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
  handle('workspace:delete', (event, id) => {
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
    enqueueDraftWrite(() => retagDraftsToGlobal(id));
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
  handle('drafts:save', (event, drafts) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    const area = appId != null ? appRegistry.getArea(appId) : null;
    const areaRootPath = area && area.rootPath ? area.rootPath : null;
    // 4T-0539 (Epic 3E-0098): Arbeitsbereichs-Zuordnung der Sender-App —
    // Entwuerfe eines Arbeitsbereichs-Fensters gehoeren zu dessen Zustand.
    const ws = appId != null ? appRegistry.getWorkspace(appId) : null;
    return enqueueDraftWrite(() => appendDrafts(drafts, areaRootPath, ws ? ws.id : null));
  });

  handle('app:locale', () => app.getLocale());
  handle('app:version', () => fullVersion());

  // 4T-0319 (Epic 3E-0057): "Neue Applikation" — neue logische App mit
  // leerem Fenster, ohne die EXE zu bemuehen (Menuepunkt bzw. Kommando).
  handle('app:newApplication', () => {
    createWindow({});
  });

  // 4T-0927: Entwickler-Werkzeuge umschalten — seit dem Entfall des
  // Menueeintrags samt F12 nur noch aus dem Einstellungs-Bereich heraus.
  // `event.sender` trifft genau das Fenster, aus dem der Aufruf kam.
  handle('window:toggleDevTools', (event) => {
    try {
      event.sender.toggleDevTools();
      return true;
    } catch (err) {
      console.warn('Entwickler-Werkzeuge umschalten fehlgeschlagen:', err);
      return false;
    }
  });

  // Renderer meldet seine aktuelle Pane-Struktur, damit Bounds-Saves auch immer
  // die passenden Tabs persistieren koennen.
  // M-16 (4T-0173): zusaetzlich debounced in den Store flushen (bestehender
  // 500-ms-Mechanismus). Vorher erreichten Tab-/Pane-Aenderungen den Store
  // nur ueber Bounds-Events oder beim Schliessen; nach Crash/Task-Kill
  // stellte der naechste Start einen veralteten Stand wieder her.
  handle('window:reportPanes', (event, panes) => {
    lastReportedPanes.set(event.sender.id, Array.isArray(panes) ? panes : []);
    const win = windows.get(event.sender.id);
    if (win) scheduleSaveBoundsAndPersist(win);
  });

  // Renderer meldet den menue-relevanten Stand (Sprache, View-Modus, Toggles).
  // Wir bauen das Menue dieses Fensters daraufhin neu, damit Haekchen und
  // Disabled-States synchron sind.
  handle('window:reportMenuState', (event, state) => {
    const id = event.sender.id;
    menuStates.set(id, state || {});
    const win = windows.get(id);
    if (win) applyMenuToWindow(win);
  });

  // Renderer meldet aktiven Tab-Namen und Tab-Anzahl seines Fensters, damit
  // andere Fenster diese Infos im Tab-Kontextmenue als Tooltip anzeigen koennen
  // (4T-0012). Wird vom Renderer bei jedem updateWindowTitle gesendet.
  handle('window:metaChanged', (event, payload) => {
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
  handle('window:list', () => {
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
        // 4T-0871/4T-0873: Buch- bzw. Regal-Name fuer die Ziel-Labels.
        bookName:
          info.appId != null && activeBooks.has(info.appId)
            ? path.basename(activeBooks.get(info.appId))
            : null,
        shelfName:
          info.appId != null && activeShelves.has(info.appId)
            ? path.basename(activeShelves.get(info.appId))
            : null,
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
  handle('tab:appendToWindow', (_event, params) => {
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
    inDenVordergrund(target);
    return { ok: true };
  });

  // Renderer fordert ein neues Fenster mit initialen Panes/Tabs an.
  // Format von initialPanes: [{ paths, activeIndex, tabSettings }, ...]
  // R4-03 (4T-0170): optionaler initialTabPayload (Format wie
  // tab:appendToWindow) wird nach did-finish-load an das neue Fenster
  // gereicht — traegt content/dirty, damit "In neues Fenster verschieben"
  // ungespeicherte Inhalte und Unbenannt-Tabs verlustfrei transferiert.
  handle('window:openNew', (event, initialPanes, initialTabPayload) => {
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

module.exports = { registerWindowsIpc };
