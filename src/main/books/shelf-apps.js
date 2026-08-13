// Buecherregal-Vermittlung, strukturgleich zur Buecher-Vermittlung: Bindung
// eines Regals an eine logische Applikation, Oeffnungs-Wege, Zustands-Meldung,
// striktes Routing in die Buch-Applikation, Schliessen und Wiederherstellung.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196). Die Datei-Ebene liegt
// unveraendert in shelves.js, der Kern in shared/books/shelf-core.js.
//
// Ein Regal je Applikation, dieselbe Bindungs-Mechanik wie beim aktiven Buch
// (Registry-frei, Map hier). Regal und Buch sind unabhaengige Kontexte: ein
// Buch aus dem Regal darf gleichzeitig aktiv sein. Die gemeinsamen Helfer
// (appIdOfWindow, sendWhenLoaded, appHasOpenFilesOutside) kommen aus
// book-apps.js; die beiden Module brauchen einander wechselseitig und
// verweisen deshalb nie per Require aufeinander, sondern ueber das
// Deps-Objekt aus main.js.
//
// Eigentuemer-Zustand dieses Moduls:
//   activeShelves : Map<appId, shelfDir (absolut)>
'use strict';

const path = require('node:path');
const { dialog } = require('electron');
const shelves = require('./shelves');
const { isSamePath, areaFromRootPath } = require('../area/area-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');

/**
 * Baut die Buecherregal-Vermittlung.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.appRegistry App-Registry (Fenster -> logische Applikation).
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {Map} deps.windows Fenster-Registry.
 * @param {Map} deps.activeBooks Aktives Buch je Applikation (Buch-Modul).
 * @param {Function} deps.appIdOfWindow Applikation eines Fensters.
 * @param {Function} deps.sendWhenLoaded Meldung an ein moeglicherweise ladendes Fenster.
 * @param {Function} deps.appHasOpenFilesOutside Reiter ausserhalb eines Ordners?
 * @param {Function} deps.openBookApp Regulaerer Buch-Oeffnungs-Pfad.
 * @param {Function} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {Function} deps.startAreaWatcher Bereichs-Watcher starten.
 * @param {Function} deps.focusFirstAppWindow Erstes Fenster einer App fokussieren.
 * @param {Function} deps.broadcastDisplayInfo Anzeige-Infos verteilen.
 * @param {Function} deps.applyMenuToAllWindows Menues neu bauen.
 * @param {Function} deps.tForWindow Lokalisierter Text in Fenster-Sprache.
 * @param {Function} deps.persistAllWindows Sitzungs-Persistenz.
 * @param {Function} deps.createWindow Fenster erzeugen.
 * @param {Function} deps.closeAppWindows Schliess-Kaskade einer Applikation.
 * @param {object} deps.recentLists Die vier "Zuletzt geoeffnet"-Listen.
 * @returns {object} Regal-API samt der Zustands-Map dieses Moduls.
 */
function createShelfApps(deps) {
  const {
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
    broadcastDisplayInfo,
    applyMenuToAllWindows,
    tForWindow,
    persistAllWindows,
    createWindow,
    closeAppWindows,
    recentLists,
  } = deps;

  const activeShelves = new Map(); // appId -> shelfDir (absolut)

  // Zustands-Paket fuer den Renderer: { active: null | { shelfDir,
  // shelfFileName, books, unassigned, missing } }. Bei jedem Abruf frisch von
  // der Platte (Begleitdatei und Buch-Ordner koennen jederzeit von aussen
  // wandern); ein voruebergehender Lesefehler meldet active: null, ohne die
  // Bindung zu loesen (Muster bookPayloadFor).
  async function shelfPayloadFor(appId) {
    const shelfDir = appId != null ? activeShelves.get(appId) : null;
    if (!shelfDir) return { active: null };
    const result = await shelves.buildShelfState(shelfDir);
    return result.ok ? { active: result.state } : { active: null };
  }

  // Meldet den Regal-Zustand an alle Fenster der Applikation.
  async function sendShelfState(appId) {
    if (appId == null) return;
    const payload = await shelfPayloadFor(appId);
    for (const windowId of appRegistry.windowsOf(appId)) {
      const win = windows.get(windowId);
      if (win && !win.isDestroyed()) win.webContents.send('shelves:stateChanged', payload);
    }
  }

  // --- 4T-0873 (Epic 3E-0162): Regal als Bereich -------------------------------
  // Fortsetzung der Grundsatz-Entscheidung aus 4T-0871 fuer die Regal-Ebene
  // (PO-Entscheidung vom 2026-08-04, Variante R1): Eine Regal-Applikation ist
  // eine Bereichs-Applikation mit dem Regal-Ordner als Wurzel; ihr Inhalt ist
  // die Regal-Ansicht. Das Regal-Fenster haelt ausschliesslich die
  // Regal-Ebene — jeder Griff in ein Buch fuehrt in die Buch-Applikation.

  // Die Applikation, die dieses Regal traegt (Pfad-Gleichheit wie beim Bereich).
  function findAppByShelf(shelfDir) {
    for (const [appId, dir] of activeShelves) {
      if (isSamePath(dir, shelfDir)) return appId;
    }
    return null;
  }

  // Bindet eine Applikation an ein Regal: Bereichs-Bindung auf den Regal-Ordner
  // (sofern die App noch keinen Bereich traegt) plus Regal-Bindung.
  async function bindShelfToApp(appId, shelfDir) {
    if (!appRegistry.getArea(appId)) {
      appRegistry.setArea(appId, areaFromRootPath(shelfDir));
      startAreaWatcher(appId);
    }
    activeShelves.set(appId, shelfDir);
    // Nach dem Setzen der Bindung, damit der Fenstertitel den Regal-Namen
    // traegt (shelfName kommt aus activeShelves).
    broadcastDisplayInfo();
    applyMenuToAllWindows();
    persistAllWindows();
    await sendShelfState(appId);
  }

  // Kern von "Buecherregal oeffnen" (Dialog-, Pfad- und Erkennungs-Einstieg)
  // nach demselben Drei-Stufen-Muster wie openBookApp:
  // - Regal laeuft schon -> Sprung in ein Fenster seiner Applikation.
  // - ausloesende App ist frei -> Bindung.
  // - sonst -> neue Applikation mit dem Regal-Ordner als Bereich.
  //
  // Die Regal-Ansicht oeffnet in beiden Faellen als eigene Seite im
  // Reiter-System (Story S-0761, AK1); die Regal-Datei selbst bleibt eine
  // gewoehnliche Markdown-Datei und oeffnet nur auf ausdruecklichen Wunsch.
  async function openShelfApp(shelfDir, senderWin) {
    const state = await shelves.buildShelfState(shelfDir);
    if (!state.ok) return state;
    const dir = state.state.shelfDir;
    // 4T-0888 (Epic 3E-0168): Zuletzt-Liste der Regale (Muster openBookApp).
    recentLists.pushRecentEntry('recentShelves', dir);
    const running = findAppByShelf(dir);
    if (running != null) {
      focusFirstAppWindow(running);
      await sendShelfState(running);
      const [firstId] = appRegistry.windowsOf(running);
      const win = firstId != null ? windows.get(firstId) : null;
      if (win && !win.isDestroyed()) sendWhenLoaded(win, 'shelves:openPage');
      return { ok: true, focusedExisting: true };
    }
    const senderAppId = appIdOfWindow(senderWin);
    const frei =
      senderAppId != null &&
      !appRegistry.getArea(senderAppId) &&
      !activeBooks.has(senderAppId) &&
      !activeShelves.has(senderAppId) &&
      !appHasOpenFilesOutside(senderAppId, dir);
    if (frei) {
      await bindShelfToApp(senderAppId, dir);
      sendWhenLoaded(senderWin, 'shelves:openPage');
      return { ok: true, boundExisting: true };
    }
    const win = createWindow({ area: areaFromRootPath(dir) });
    const newAppId = appRegistry.appOf(win.webContents.id);
    startAreaWatcher(newAppId);
    activeShelves.set(newAppId, dir);
    applyMenuToAllWindows();
    persistAllWindows();
    sendWhenLoaded(win, 'shelves:openPage');
    return { ok: true, createdNew: true };
  }

  // "Buecherregal schliessen" schliesst die Regal-Applikation samt Fenstern
  // ueber den regulaeren Close-Pfad (4T-0873, Regal = Bereich; Muster
  // closeActiveBook).
  async function closeActiveShelf(appId) {
    if (appId == null || !activeShelves.has(appId)) return { ok: false, error: 'no-shelf' };
    return closeAppWindows(appId);
  }

  // Meldung zu einem abgewiesenen Ordner (kein Regal bzw. defekte Begleitdatei).
  async function reportNotAShelf(ownerWin, shelfDir, error) {
    await dialog.showMessageBox(ownerWin || undefined, {
      type: 'warning',
      title: tForWindow(ownerWin, 'shelf.notAShelfTitle'),
      message: tForWindow(
        ownerWin,
        error === 'invalid' ? 'shelf.invalidSettingsMessage' : 'shelf.notAShelfMessage',
      ),
      detail: shelfDir,
      buttons: ['OK'],
    });
  }

  // (Die frühere Ordner-Grenzprüfung der Buch- und Regal-Wege ist mit 4T-0871
  // und 4T-0873 entfallen: Buch und Regal öffnen als eigene Applikation mit
  // eigener Bereichs-Bindung und sind vom Bereich des Aufrufers unabhängig.)

  // Weg 2 des Oeffnens (Story S-0760, AK2): Ist die aktiv geoeffnete Datei die
  // Regal-Datei ihres Ordners, IST das Oeffnen ein "Buecherregal oeffnen"
  // (4T-0873, Regal = Bereich, Muster bindBookIfBookFile): Eine freie App wird
  // gebunden, sonst wandert der frisch geoeffnete Reiter in die
  // Regal-Applikation. Der Reiter der Regal-Datei bleibt dort neben der
  // Regal-Seite bestehen, damit ihr Beschreibungstext editierbar bleibt.
  async function bindShelfIfShelfFile(win, filePath) {
    const store = getStore();
    const appId = appIdOfWindow(win);
    if (appId == null) return;
    if (!isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) return;
    const shelfDir = await shelves.detectShelfDirFor(filePath);
    if (!shelfDir) return;
    const bound = activeShelves.get(appId);
    if (bound && isSamePath(bound, shelfDir)) {
      if (win && !win.isDestroyed()) win.webContents.send('shelves:openPage');
      return;
    }
    const frei =
      !appRegistry.getArea(appId) &&
      !activeBooks.has(appId) &&
      !activeShelves.has(appId) &&
      !appHasOpenFilesOutside(appId, shelfDir);
    if (frei) {
      // 4T-0888: direkte Bindung ohne openShelfApp (Muster bindBookIfBookFile).
      recentLists.pushRecentEntry('recentShelves', shelfDir);
      await bindShelfToApp(appId, shelfDir);
      if (win && !win.isDestroyed()) win.webContents.send('shelves:openPage');
      return;
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('file:closeExternal', [path.resolve(filePath)]);
    }
    const geoeffnet = await openShelfApp(shelfDir, win);
    if (!geoeffnet.ok) return;
    // Die Regal-Datei selbst reist mit: Sie war der Anlass des Oeffnens.
    const zielApp = findAppByShelf(shelfDir);
    const [firstId] = zielApp != null ? appRegistry.windowsOf(zielApp) : [];
    const ziel = firstId != null ? windows.get(firstId) : null;
    if (ziel && !ziel.isDestroyed()) {
      sendWhenLoaded(ziel, 'file:openExternal', [path.resolve(filePath)]);
    }
  }

  // 4T-0873 (Story S-0760, AK7): Striktes Routing der Regal-Applikation
  // (Variante R1). Eine im Regal-Fenster geoeffnete Datei, die in einem seiner
  // Buch-Ordner liegt — Buch-Datei wie Kapitel-Datei —, gehoert nicht ins
  // Regal-Fenster: Der frisch entstandene Reiter wird zurueckgezogen, die
  // Buch-Applikation oeffnet bzw. wird fokussiert und oeffnet die Datei.
  // Dateien unmittelbar im Regal-Ordner (Regal-Datei, lose Notizen) bleiben.
  // Rueckgabe: true, wenn die Datei umgeleitet wurde.
  async function routeShelfFileToBookApp(win, filePath) {
    const store = getStore();
    const appId = appIdOfWindow(win);
    if (appId == null) return false;
    if (!isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) return false;
    const shelfDir = activeShelves.get(appId);
    if (!shelfDir) return false;
    const bookDir = await shelves.bookDirContaining(shelfDir, filePath);
    if (!bookDir) return false;
    if (win && !win.isDestroyed()) {
      win.webContents.send('file:closeExternal', [path.resolve(filePath)]);
    }
    await openBookApp(bookDir, win, { alsoOpen: path.resolve(filePath) });
    return true;
  }

  // Sitzungs-Wiederherstellung des aktiven Regals (Story S-0760, AK5). Ein
  // entfernter oder beschaedigter Regal-Ordner wird still uebergangen; der
  // Sitzungs-Eintrag bleibt bei abgeschalteter Erweiterung erhalten.
  // 4T-0873 (Regal = Bereich): Alt-Sitzungen ohne Bereichs-Bindung erhalten sie
  // hier nach; eine App mit FREMDEM Bereich behaelt ihn und verliert die
  // Regal-Bindung (Muster restoreBookForApp).
  async function restoreShelfForApp(appId, shelfDir) {
    const store = getStore();
    if (appId == null || typeof shelfDir !== 'string' || shelfDir === '') return;
    if (!isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) return;
    const state = await shelves.buildShelfState(shelfDir);
    if (!state.ok) return;
    const area = appRegistry.getArea(appId);
    if (area && !isSamePath(area.rootPath, state.state.shelfDir)) return;
    if (!area) {
      appRegistry.setArea(appId, areaFromRootPath(state.state.shelfDir));
      startAreaWatcher(appId);
    }
    activeShelves.set(appId, state.state.shelfDir);
    broadcastDisplayInfo();
    applyMenuToAllWindows();
    await sendShelfState(appId);
    // 4T-0882 (Befund c der Test-Iteration 0.104.0): Die Wiederherstellung
    // stellte nur die Bindung her; ohne 'shelves:openPage' blieb das
    // Regal-Fenster leer. Die Seite oeffnet wie beim regulaeren Oeffnen
    // (openShelfApp, sendWhenLoaded-Muster) im Fenster der App.
    for (const windowId of appRegistry.windowsOf(appId)) {
      const win = windows.get(windowId);
      if (win && !win.isDestroyed()) {
        sendWhenLoaded(win, 'shelves:openPage');
        break;
      }
    }
  }

  // Weg 1 des Oeffnens (Story S-0760, AK1): "Buecherregal oeffnen…" mit
  // Ordner-Wahl. Ein Ordner ohne Begleitdatei, die eine Regal-Datei benennt,
  // wird mit Meldung abgewiesen.
  async function openShelfDialog(ownerWin) {
    const owner = ownerWin && !ownerWin.isDestroyed() ? ownerWin : null;
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'shelf.openDialogTitle'),
      defaultPath: areaOfWindow(owner)?.rootPath,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const shelfDir = result.filePaths[0];
    const opened = await openShelfApp(shelfDir, owner);
    if (!opened.ok && (opened.error === 'no-shelf' || opened.error === 'invalid')) {
      await reportNotAShelf(owner, shelfDir, opened.error);
    }
    return opened;
  }

  // Story S-0760, AK3: "Neues Buecherregal…" legt Regal-Ordner, Regal-Datei und
  // Begleitdatei an und oeffnet das Regal (Dialog-Muster createBookDialog).
  async function createShelfDialog(ownerWin) {
    const owner = ownerWin && !ownerWin.isDestroyed() ? ownerWin : null;
    const result = await dialog.showSaveDialog(owner || undefined, {
      title: tForWindow(owner, 'shelf.createDialogTitle'),
      buttonLabel: tForWindow(owner, 'shelf.createDialogButton'),
      defaultPath: areaOfWindow(owner)?.rootPath,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const parentDir = path.dirname(result.filePath);
    const name = path.basename(result.filePath);
    const created = await shelves.createShelf(parentDir, name);
    if (!created.ok) {
      const messageKey =
        created.error === 'invalid-name'
          ? 'shelf.createInvalidNameMessage'
          : created.error === 'exists'
            ? 'shelf.createExistsMessage'
            : 'shelf.createFailedMessage';
      await dialog.showMessageBox(owner || undefined, {
        type: 'warning',
        title: tForWindow(owner, 'shelf.createFailedTitle'),
        message: tForWindow(owner, messageKey),
        detail: created.detail || path.join(parentDir, name),
        buttons: ['OK'],
      });
      return created;
    }
    return openShelfApp(created.shelfDir, owner);
  }

  return {
    activeShelves,
    shelfPayloadFor,
    sendShelfState,
    openShelfApp,
    closeActiveShelf,
    reportNotAShelf,
    bindShelfIfShelfFile,
    routeShelfFileToBookApp,
    restoreShelfForApp,
    openShelfDialog,
    createShelfDialog,
  };
}

module.exports = { createShelfApps };
