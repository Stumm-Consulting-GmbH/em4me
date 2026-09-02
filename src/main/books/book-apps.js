// Buecher-Vermittlung: Bindung eines Buches an eine logische Applikation,
// die drei Oeffnungs-Wege (Dialog, Pfad, Erkennung einer Buch-Datei), die
// Zustands-Meldung an die Fenster, Schliessen und Wiederherstellung.
//
// Auszug aus main.js, 4T-000998 (Epic 3E-000196). Die Datei-Ebene (Erkennung,
// Zustands-Aufbau, Anlage) liegt unveraendert in books.js, der Struktur-Kern
// in shared/books/book-core.js.
//
// Ein geoeffnetes Buch ist ein eigener Kontext auf derselben Ebene wie
// Bereich und Arbeitsbereich (Epic-Entscheidung 11 zu 3E-000147): Das aktive
// Buch haengt an der logischen APPLIKATION, nicht am Fenster, und alle
// Fenster derselben App teilen es (Muster der Bereichs-Bindung in der
// App-Registry). Die Bindung liegt bewusst hier statt in der Registry, weil
// sie nichts mit Fenster-Nummerierung und Titel zu tun hat und die Registry
// electron-frei und schmal bleiben soll.
//
// Eigentuemer-Zustand dieses Moduls:
//   activeBooks : Map<appId, bookDir (absolut)>
'use strict';

const path = require('node:path');
const { dialog } = require('electron');
const books = require('./books');
const { isSamePath, isInsideArea, areaFromRootPath } = require('../area/area-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');

/**
 * Baut die Buecher-Vermittlung.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.appRegistry App-Registry (Fenster -> logische Applikation).
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {Map} deps.windows Fenster-Registry.
 * @param {Map} deps.lastReportedPanes Zuletzt gemeldete Pane-Struktur je Fenster.
 * @param {() => Map} deps.activeShelves Aktives Regal je Applikation (Regal-Modul).
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
 * @returns {object} Buecher-API samt der Zustands-Map dieses Moduls.
 */
function createBookApps(deps) {
  const {
    appRegistry,
    getStore,
    windows,
    lastReportedPanes,
    activeShelves,
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

  const activeBooks = new Map(); // appId -> bookDir (absolut)

  function appIdOfWindow(win) {
    if (!win || win.isDestroyed()) return null;
    return appRegistry.appOf(win.webContents.id);
  }

  // Zustands-Paket fuer den Renderer: { active: null | { bookDir,
  // bookFileName, tree, readingOrder, unlinked, missing, missingSuggestions } }.
  // `missingSuggestions` nennt je fehlendem Kapitel die namensgleichen Funde des
  // Buch-Ordners (4T-000848, nur Eintraege mit Fund). Der Zustand wird
  // bei jedem Abruf frisch von der Platte gelesen, weil Kapitel-Dateien und
  // Begleitdatei jederzeit von aussen wandern koennen (offene Flanke jeder
  // deklarierten Struktur, Epic-Risiko). Ist die Begleitdatei gerade nicht
  // lesbar, meldet das Paket `active: null`, ohne die Bindung zu loesen: ein
  // voruebergehender Lesefehler soll das Buch nicht schliessen.
  async function bookPayloadFor(appId) {
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { active: null };
    const result = await books.buildBookState(bookDir);
    return result.ok ? { active: result.state } : { active: null };
  }

  // Meldet den Buch-Zustand an alle Fenster der Applikation (Oeffnen,
  // Schliessen, Anlegen, Wiederherstellung).
  async function sendBookState(appId) {
    if (appId == null) return;
    const payload = await bookPayloadFor(appId);
    for (const windowId of appRegistry.windowsOf(appId)) {
      const win = windows.get(windowId);
      if (win && !win.isDestroyed()) win.webContents.send('books:stateChanged', payload);
    }
  }

  // 4T-000847 (Story 4S-000756): Nach einer physischen Bewegung von Kapitel-Dateien
  // den Buch-Zustand aller Applikationen nachziehen, die eines der betroffenen
  // Bücher aktiv haben. Eine Bewegung kann jedes Buch treffen, auch eines, das
  // gerade in keinem Fenster offen ist — dann gibt es schlicht nichts zu melden.
  async function sendBookStateForDirs(bookDirs) {
    const dirs = (Array.isArray(bookDirs) ? bookDirs : []).filter(
      (dir) => typeof dir === 'string' && dir !== '',
    );
    if (dirs.length === 0) return;
    for (const [appId, active] of activeBooks) {
      if (dirs.some((dir) => isSamePath(dir, active))) await sendBookState(appId);
    }
  }

  // --- 4T-000871 (Epic 3E-000162): Buch als Bereich --------------------------------
  // Grundsatz-Entscheidung des Product Owners vom 2026-08-04: Ein Buch wird
  // vollstaendig wie ein Bereich behandelt (Epic-Entscheidung 11 konsequent zu
  // Ende gefuehrt). Eine Buch-Applikation traegt die Bereichs-Bindung auf den
  // Buch-Ordner (harte Grenze, Fenstertitel, Sitzung ueber die bestehende
  // Bereichs-Mechanik) PLUS die Buch-Bindung fuer Panel und Lesefuehrung.
  // Zwei Buecher sind nie in derselben Applikation.

  // Die Applikation, die dieses Buch traegt (Pfad-Gleichheit wie beim Bereich).
  function findAppByBook(bookDir) {
    for (const [appId, dir] of activeBooks) {
      if (isSamePath(dir, bookDir)) return appId;
    }
    return null;
  }

  // Hat die App eine geoeffnete Datei AUSSERHALB des Ordners dir? Grundlage
  // der Frei-Pruefung beim Binden: Reiter innerhalb des Buch-Ordners vertragen
  // die kommende Bereichs-Grenze, fremde nicht. Bewusst weicher als die
  // Bereichs-Regel "keine geoeffnete Datei", weil Kapitel desselben Buches als
  // gewoehnliche Reiter offen sein duerfen, ohne die Bindung zu verhindern.
  function appHasOpenFilesOutside(appId, dir) {
    for (const windowId of appRegistry.windowsOf(appId)) {
      const panes = lastReportedPanes.get(windowId) || [];
      for (const pane of panes) {
        const paths = pane && Array.isArray(pane.paths) ? pane.paths : [];
        for (const p of paths) {
          if (!isInsideArea(dir, p)) return true;
        }
      }
    }
    return false;
  }

  // Bindet eine Applikation an ein Buch: Bereichs-Bindung auf den Buch-Ordner
  // (sofern die App noch keinen Bereich traegt) plus Buch-Bindung. Der
  // Aufrufer stellt sicher, dass die App dafuer frei ist (openBookApp) bzw.
  // der Alt-Zustand es erlaubt (restoreBookForApp).
  async function bindBookToApp(appId, bookDir) {
    if (!appRegistry.getArea(appId)) {
      appRegistry.setArea(appId, areaFromRootPath(bookDir));
      startAreaWatcher(appId);
    }
    activeBooks.set(appId, bookDir);
    // Nach dem Setzen der Buch-Bindung, damit der Fenstertitel den Buchnamen
    // traegt (bookName kommt aus activeBooks).
    broadcastDisplayInfo();
    applyMenuToAllWindows();
    persistAllWindows();
    await sendBookState(appId);
  }

  // 4T-000871: Meldung an ein moeglicherweise noch ladendes Fenster. Electron-IPC
  // puffert nicht; ein frisch erzeugtes Fenster bekommt sie deshalb erst nach
  // did-finish-load (Muster der Start-Dateien).
  function sendWhenLoaded(targetWin, channel, ...args) {
    const target = targetWin && !targetWin.isDestroyed() ? targetWin : null;
    if (!target) return;
    if (target.webContents.isLoading()) {
      target.webContents.once('did-finish-load', () => {
        if (!target.isDestroyed()) target.webContents.send(channel, ...args);
      });
    } else {
      target.webContents.send(channel, ...args);
    }
  }

  // Buch-Datei als Reiter im Ziel-Fenster oeffnen (Weg "Buch oeffnen").
  // `alsoOpen` kommt vom Regal-Routing (4T-000873): die dort angeklickte Datei
  // (etwa ein Kapitel) oeffnet in der Buch-Applikation gleich mit.
  async function openBookFileTab(bookDir, bookFileName, targetWin, alsoOpen = null) {
    const target = targetWin && !targetWin.isDestroyed() ? targetWin : null;
    if (!target) return;
    const dateien = [];
    const exists = await books.bookFileExists(bookDir, bookFileName);
    if (exists) dateien.push(path.join(bookDir, bookFileName));
    else {
      await dialog.showMessageBox(target, {
        type: 'warning',
        title: tForWindow(target, 'book.fileMissingTitle'),
        message: tForWindow(target, 'book.fileMissingMessage'),
        detail: bookFileName || bookDir,
        buttons: ['OK'],
      });
    }
    if (alsoOpen && !dateien.some((f) => isSamePath(f, alsoOpen)))
      dateien.push(path.resolve(alsoOpen));
    if (dateien.length > 0) sendWhenLoaded(target, 'file:openExternal', dateien);
  }

  // Kern von "Buch oeffnen" (Dialog-, Pfad-, Erkennungs- und Regal-Einstieg)
  // nach dem Drei-Stufen-Muster des Bereichs-Oeffnens (openAreaPath):
  // - Buch laeuft schon -> Sprung in ein Fenster seiner Applikation.
  // - ausloesende App ist frei (kein Bereich, kein Buch, kein Regal, keine
  //   Datei ausserhalb des Buch-Ordners) -> Bindung samt Buch-Datei-Reiter.
  // - sonst -> neue Applikation mit dem Buch-Ordner als Bereich.
  async function openBookApp(bookDir, senderWin, { alsoOpen = null } = {}) {
    const state = await books.buildBookState(bookDir);
    if (!state.ok) return state;
    const dir = state.state.bookDir;
    // 4T-000888 (Epic 3E-000168): jedes Buch-Oeffnen pflegt die Zuletzt-Liste — vor
    // der Fallunterscheidung, weil auch der Sprung in eine laufende
    // Buch-Applikation als Oeffnen zaehlt (Muster openAreaPath). Der Weg der
    // Neuanlage laeuft ueber dieselbe Stelle (createBookDialog ruft hierher).
    recentLists.pushRecentEntry('recentBooks', dir);
    const running = findAppByBook(dir);
    if (running != null) {
      focusFirstAppWindow(running);
      // Erneutes Oeffnen liest den Zustand frisch von der Platte: ein von
      // aussen geaenderter Buch-Ordner (umbenannte Kapitel-Datei) kommt so im
      // Panel an, wie es der Wechsel-Weg vor 4T-000871 tat.
      await sendBookState(running);
      // 4T-000873: Ein aus dem Regal angeklicktes Kapitel oeffnet auch dann in
      // der laufenden Buch-Applikation, wenn sie schon offen ist.
      if (alsoOpen) {
        const [firstId] = appRegistry.windowsOf(running);
        const win = firstId != null ? windows.get(firstId) : null;
        if (win && !win.isDestroyed()) sendWhenLoaded(win, 'file:openExternal', [alsoOpen]);
      }
      return { ok: true, focusedExisting: true };
    }
    const senderAppId = appIdOfWindow(senderWin);
    const frei =
      senderAppId != null &&
      !appRegistry.getArea(senderAppId) &&
      !activeBooks.has(senderAppId) &&
      !activeShelves().has(senderAppId) &&
      !appHasOpenFilesOutside(senderAppId, dir);
    if (frei) {
      await bindBookToApp(senderAppId, dir);
      await openBookFileTab(dir, state.state.bookFileName, senderWin, alsoOpen);
      return { ok: true, boundExisting: true };
    }
    const win = createWindow({ area: areaFromRootPath(dir) });
    const newAppId = appRegistry.appOf(win.webContents.id);
    startAreaWatcher(newAppId);
    activeBooks.set(newAppId, dir);
    applyMenuToAllWindows();
    persistAllWindows();
    // Kein sendBookState noetig: das frische Fenster zieht den Zustand beim
    // Init selbst ueber books:getState.
    await openBookFileTab(dir, state.state.bookFileName, win, alsoOpen);
    return { ok: true, createdNew: true };
  }

  // "Buch schliessen" schliesst die Buch-Applikation samt Fenstern ueber den
  // regulaeren Close-Pfad (4T-000871, Buch = Bereich; vorher loeste es allein
  // die Bindung). Nutzer-Abbruch stoppt die Kaskade, App und Bindung bleiben
  // dann bestehen; die Bindung raeumt der closed-Pfad des letzten Fensters.
  async function closeActiveBook(appId) {
    if (appId == null || !activeBooks.has(appId)) return { ok: false, error: 'no-book' };
    return closeAppWindows(appId);
  }

  // Meldung zu einem abgewiesenen Ordner (kein Buch bzw. defekte Begleitdatei).
  async function reportNotABook(ownerWin, bookDir, error) {
    await dialog.showMessageBox(ownerWin || undefined, {
      type: 'warning',
      title: tForWindow(ownerWin, 'book.notABookTitle'),
      message: tForWindow(
        ownerWin,
        error === 'invalid' ? 'book.invalidSettingsMessage' : 'book.notABookMessage',
      ),
      detail: bookDir,
      buttons: ['OK'],
    });
  }

  // Weg 2 des Oeffnens (Story 4S-000752, AK2): Der Renderer meldet ein aktives
  // Datei-Oeffnen (recent:push, sowohl Datei-Dialog als auch Doppelklick und
  // Zuletzt-Liste). Ist die Datei die Buch-Datei ihres Ordners, IST das
  // Oeffnen ein "Buch oeffnen" (4T-000871, Buch = Bereich): Eine freie App wird
  // gebunden (ihr Reiter ist schon da); sonst wandert der frisch geoeffnete
  // Reiter — hier schliessen, Buch-Applikation oeffnen bzw. fokussieren, die
  // die Buch-Datei selbst oeffnet. Kapitel-Dateien treffen die Erkennung
  // nicht und oeffnen unveraendert (Epic-Entscheidung 9).
  async function bindBookIfBookFile(win, filePath) {
    const store = getStore();
    const appId = appIdOfWindow(win);
    if (appId == null) return;
    // 4T-000849 (Story 4S-000758): Im Aus-Zustand der Buecher-Erweiterung entfaellt
    // die Erkennung — eine Buch-Datei oeffnet wie jede andere Markdown-Datei.
    if (!isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) return;
    const bookDir = await books.detectBookDirFor(filePath);
    if (!bookDir) return;
    const bound = activeBooks.get(appId);
    if (bound && isSamePath(bound, bookDir)) return; // richtige Applikation
    const frei =
      !appRegistry.getArea(appId) &&
      !activeBooks.has(appId) &&
      !activeShelves().has(appId) &&
      !appHasOpenFilesOutside(appId, bookDir);
    if (frei) {
      // 4T-000888: Weg 2 des Oeffnens bindet direkt, ohne openBookApp — die
      // Zuletzt-Liste wird deshalb hier gepflegt (der Zweig darunter erledigt
      // sie ueber openBookApp).
      recentLists.pushRecentEntry('recentBooks', bookDir);
      await bindBookToApp(appId, bookDir);
      return;
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('file:closeExternal', [path.resolve(filePath)]);
    }
    await openBookApp(bookDir, win);
  }

  // Sitzungs-Wiederherstellung des aktiven Buches. Ein inzwischen entfernter
  // oder beschaedigter Buch-Ordner wird still uebergangen (Muster der
  // Bereichs-Wiederherstellung, dort mit Sammel-Meldung; hier genuegt das
  // stille Auslassen, weil ohne Buch nur ein Panel leer bleibt).
  // 4T-000871 (Buch = Bereich): Alt-Sitzungen ohne Bereichs-Bindung erhalten sie
  // hier nach; eine App mit FREMDEM Bereich (Alt-Zustand "Buch im Bereich")
  // behaelt den Bereich und verliert die Buch-Bindung, weil beides zusammen
  // dem Applikations-Modell widerspricht.
  async function restoreBookForApp(appId, bookDir) {
    const store = getStore();
    if (appId == null || typeof bookDir !== 'string' || bookDir === '') return;
    // 4T-000849 (Story 4S-000758): keine Buch-Wiederherstellung bei abgeschalteter
    // Erweiterung; der Sitzungs-Eintrag bleibt fuer das Wiedereinschalten
    // erhalten (die Bereichs-Bindung einer Buch-App aus dem Snapshot bleibt —
    // die App restauriert dann als gewoehnliche Bereichs-App).
    if (!isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) return;
    const state = await books.buildBookState(bookDir);
    if (!state.ok) return;
    const area = appRegistry.getArea(appId);
    if (area && !isSamePath(area.rootPath, state.state.bookDir)) return;
    if (!area) {
      appRegistry.setArea(appId, areaFromRootPath(state.state.bookDir));
      startAreaWatcher(appId);
    }
    activeBooks.set(appId, state.state.bookDir);
    broadcastDisplayInfo();
    applyMenuToAllWindows();
    await sendBookState(appId);
  }

  // Weg 1 des Oeffnens (Story 4S-000752, AK1): "Buch oeffnen…" mit Ordner-Wahl
  // (Muster area:open). Ein Ordner ohne Begleitdatei, die eine Buch-Datei
  // benennt, wird mit Meldung abgewiesen; sonst Drei-Stufen-Muster
  // (openBookApp). Eine Bereichs-Grenzpruefung entfaellt seit 4T-000871: Das
  // Buch oeffnet als eigene Applikation und ist vom Bereich des Aufrufers
  // unabhaengig (Anforderungs-Briefing: Buecher sind bereichs-unabhaengig).
  async function openBookDialog(ownerWin) {
    const owner = ownerWin && !ownerWin.isDestroyed() ? ownerWin : null;
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'book.openDialogTitle'),
      defaultPath: areaOfWindow(owner)?.rootPath,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const bookDir = result.filePaths[0];
    const opened = await openBookApp(bookDir, owner);
    if (!opened.ok && (opened.error === 'no-book' || opened.error === 'invalid')) {
      await reportNotABook(owner, bookDir, opened.error);
    }
    return opened;
  }

  // Story 4S-000752, AK3: "Neues Buch…" legt Buch-Ordner, Buch-Datei und
  // Begleitdatei an und oeffnet das Buch. Eltern-Ordner und Name kommen aus
  // EINEM nativen Dialog: der Speichern-Dialog liefert beides in einem Schritt
  // und laesst den Anwender zugleich einen neuen Eltern-Ordner anlegen. Ein
  // Text-Eingabe-Dialog gibt es im Main-Prozess nicht, und ein Renderer-Dialog
  // haette den Ablauf ohne Gewinn ueber zwei Prozesse gezogen.
  async function createBookDialog(ownerWin) {
    const owner = ownerWin && !ownerWin.isDestroyed() ? ownerWin : null;
    const result = await dialog.showSaveDialog(owner || undefined, {
      title: tForWindow(owner, 'book.createDialogTitle'),
      buttonLabel: tForWindow(owner, 'book.createDialogButton'),
      defaultPath: areaOfWindow(owner)?.rootPath,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const parentDir = path.dirname(result.filePath);
    const name = path.basename(result.filePath);
    const created = await books.createBook(parentDir, name);
    if (!created.ok) {
      const messageKey =
        created.error === 'invalid-name'
          ? 'book.createInvalidNameMessage'
          : created.error === 'exists'
            ? 'book.createExistsMessage'
            : 'book.createFailedMessage';
      await dialog.showMessageBox(owner || undefined, {
        type: 'warning',
        title: tForWindow(owner, 'book.createFailedTitle'),
        message: tForWindow(owner, messageKey),
        detail: created.detail || path.join(parentDir, name),
        buttons: ['OK'],
      });
      return created;
    }
    return openBookApp(created.bookDir, owner);
  }

  return {
    activeBooks,
    appIdOfWindow,
    bookPayloadFor,
    sendBookState,
    sendBookStateForDirs,
    findAppByBook,
    appHasOpenFilesOutside,
    bindBookToApp,
    sendWhenLoaded,
    openBookApp,
    closeActiveBook,
    reportNotABook,
    bindBookIfBookFile,
    restoreBookForApp,
    openBookDialog,
    createBookDialog,
  };
}

module.exports = { createBookApps };
