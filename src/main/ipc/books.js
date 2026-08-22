// IPC-Kanal-Gruppe Buecher: Zustand des aktiven Buches, Oeffnen und Anlegen,
// Kapitel als Reiter, Struktur-Pflege des Kapitel-Baums, das physische
// Verschieben einer Kapitel-Datei und die Reparatur fehlender Kapitel.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: books:*.
//
// Eigener Zustand: keiner; die Buch-Applikationen und die Umbenennen-Kaskade
// kommen als Deps. Die Block-Helfer moveBookChapterFile und
// reassignBookChapter bedienen je zwei Kanaele (Dialog-Weg und Pfad-Weg).
'use strict';

const path = require('node:path');
const books = require('../books/books');
const { isInsideArea } = require('../area/area-path');

/**
 * Registriert die Buch-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {(win: object) => number|null} deps.appIdOfWindow Applikation eines Fensters.
 * @param {Map} deps.activeBooks Aktives Buch je Applikation.
 * @param {Function} deps.bookPayloadFor Zustands-Paket des aktiven Buches.
 * @param {Function} deps.sendBookState Zustand an alle Fenster der Applikation melden.
 * @param {Function} deps.openBookApp Buch als eigene Applikation oeffnen.
 * @param {Function} deps.closeActiveBook Bindung des aktiven Buches loesen.
 * @param {Function} deps.reportNotABook Hinweis auf einen Ordner ohne Buch.
 * @param {Function} deps.openBookDialog "Buch oeffnen…" mit Ordner-Dialog.
 * @param {Function} deps.createBookDialog "Neues Buch…" mit Ordner- und Namens-Dialog.
 * @param {Function} deps.renameSingleFile Physische Umbenennung samt Nachzug.
 * @param {Function} deps.renamesFromPairs Umbenennungs-Paare fuer die Meldung.
 * @param {Function} deps.applyLinkUpdatesForRename Eingehende Links nachfuehren.
 */
function registerBooksIpc(handle, deps) {
  const {
    dialog,
    senderWindow,
    tForWindow,
    broadcast,
    appIdOfWindow,
    activeBooks,
    bookPayloadFor,
    sendBookState,
    openBookApp,
    closeActiveBook,
    reportNotABook,
    openBookDialog,
    createBookDialog,
    renameSingleFile,
    renamesFromPairs,
    applyLinkUpdatesForRename,
  } = deps;

  // --- 4T-0843 (Epic 3E-0147): Buecher ----------------------------------------
  // Ein Namensraum `books` in der Preload-API; alle Handler beziehen sich auf
  // das aktive Buch der APPLIKATION des aufrufenden Fensters.

  // Zustand des aktiven Buches (Inhaltsverzeichnis-Panel, Lesefuehrung).
  handle('books:getState', (event) => bookPayloadFor(appIdOfWindow(senderWindow(event))));

  // "Buch oeffnen…" mit Ordner-Dialog (identische Strecke wie der
  // Menue-Eintrag; der Menue-Klick ruft dieselbe Funktion).
  handle('books:openDialog', (event) => openBookDialog(senderWindow(event)));

  // "Neues Buch…": Eltern-Ordner und Name in einem Dialog, danach Anlage und
  // Oeffnen.
  handle('books:createDialog', (event) => createBookDialog(senderWindow(event)));

  // "Buch schliessen": loest die Bindung, die Reiter bleiben offen.
  handle('books:close', (event) => closeActiveBook(appIdOfWindow(senderWindow(event))));

  // Direkter Pfad-Einstieg ohne Dialog (Muster area:openPath und
  // demoArea:createAt): identische Strecke ab der Ordner-Wahl, damit beide
  // Wege ohne den nativen Dialog automatisiert pruefbar sind.
  handle('books:openPath', async (event, bookDir) => {
    if (typeof bookDir !== 'string' || !bookDir) return { ok: false, error: 'invalid path' };
    const owner = senderWindow(event);
    const opened = await openBookApp(bookDir, owner);
    if (!opened.ok && (opened.error === 'no-book' || opened.error === 'invalid')) {
      await reportNotABook(owner, bookDir, opened.error);
    }
    return opened;
  });

  handle('books:createAt', async (event, params) => {
    const owner = senderWindow(event);
    const parentDir = params && typeof params.parentDir === 'string' ? params.parentDir : '';
    const name = params && typeof params.name === 'string' ? params.name : '';
    if (!parentDir) return { ok: false, error: 'invalid path' };
    const created = await books.createBook(parentDir, name);
    if (!created.ok) return created;
    return openBookApp(created.bookDir, owner);
  });

  // Kapitel als Reiter oeffnen (Klick im Inhaltsverzeichnis). Der Pfad ist
  // buch-relativ; die Aufloesung bleibt im Main, damit der Renderer den
  // Buch-Ordner nicht selbst zusammensetzt und kein Pfad-Ausbruch entsteht.
  handle('books:openChapter', async (event, relPath) => {
    const owner = senderWindow(event);
    const appId = appIdOfWindow(owner);
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    if (typeof relPath !== 'string' || relPath === '') return { ok: false, error: 'invalid-path' };
    const target = path.resolve(bookDir, relPath);
    // Zweite Linie gegen Ausbrueche ('../'): die Kapitel-Datei liegt immer
    // im Buch-Ordner. isInsideArea ist die eine Innerhalb-Pruefung der App
    // und entscheidet hier ueber denselben Vergleich.
    if (!isInsideArea(bookDir, target)) return { ok: false, error: 'outside-book' };
    if (!owner || owner.isDestroyed()) return { ok: false, error: 'no-window' };
    // Derselbe Kanal wie Explorer-Doppelklick: der Renderer oeffnet in der
    // aktiven Pane und zieht seine Bereichs-Grenze wie bei jeder Datei.
    owner.webContents.send('file:openExternal', [target]);
    return { ok: true, path: target };
  });

  // --- 4T-0845 (Story 4S-0754): Struktur-Pflege des Kapitel-Baums -------------
  // Beide Handler aendern ausschliesslich die Deklaration in der Begleitdatei;
  // keine Kapitel-Datei wird bewegt oder umbenannt. Nach einer erfolgreichen
  // Aenderung meldet sendBookState den frisch von der Platte gelesenen Zustand
  // an alle Fenster der Applikation — der Renderer haelt keinen eigenen Baum.

  // EINE Baum-Operation je Aufruf (Drag-and-Drop-Ablage, Tastatur-Geste,
  // Ein- und Aushaengen). Eine abgelehnte Operation schreibt nichts und
  // liefert die Fehler-Kennung des Kern-Moduls zur Uebersetzung im Renderer.
  handle('books:applyTreeOp', async (event, op) => {
    const appId = appIdOfWindow(senderWindow(event));
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    const result = await books.applyTreeOp(bookDir, op);
    if (!result.ok) return { ok: false, error: result.error };
    await sendBookState(appId);
    return { ok: true };
  });

  // --- 4T-0847 (Story 4S-0756): Kapitel-Datei physisch verschieben -----------
  //
  // Die Bewegung läuft über DIESELBE Strecke wie das Umbenennen: für die
  // bestehende Kaskade ist ein Verschieben ein Pfadwechsel. renameSingleFile
  // bewegt die Datei samt Watcher, Begleit-.mdd, offenen Historien-Paketen und
  // Zuletzt-Liste und führt dabei den Kapitel-Baum-Eintrag nach;
  // applyLinkUpdatesForRename schreibt anschließend die eingehenden Links um
  // (4T-0345). Ein zweiter Rewrite-Weg entsteht dadurch nicht.
  //
  // Ergebnis { ok: true, relPath, path, linkUpdate } bzw.
  // { ok: false, error } mit den Kennungen aus books.planChapterFileMove plus
  // 'no-book', 'canceled' und 'failed'; übersetzt wird erst im Renderer.
  async function moveBookChapterFile(event, relPath, targetDir) {
    const owner = senderWindow(event);
    const appId = appIdOfWindow(owner);
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    const plan = await books.planChapterFileMove(bookDir, relPath, targetDir);
    if (!plan.ok) return { ok: false, error: plan.error };
    const moved = await renameSingleFile(plan.sourcePath, plan.targetPath);
    if (!moved.ok) return { ok: false, error: 'failed', detail: moved.error };
    // Eingehende Links nachführen (Best-Effort wie beim Umbenennen: ein
    // Fehler hier lässt die vollzogene Bewegung nicht scheitern).
    const pairs = [{ from: plan.sourcePath, to: plan.targetPath }];
    let linkUpdate = null;
    try {
      linkUpdate = await applyLinkUpdatesForRename(owner, pairs, plan.targetPath);
      broadcast('linkUpdate:applied', {
        renames: renamesFromPairs(pairs),
        updated: linkUpdate.updated,
        failed: linkUpdate.failed,
      });
    } catch (err) {
      console.error('[link-update] fehlgeschlagen:', err && err.message ? err.message : err);
    }
    // Der Baum-Nachzug hängt an renameSingleFile; eine nicht eingehängte
    // Datei bleibt nicht eingehängt und meldet dort keinen Buch-Ordner. Der
    // Zustand geht trotzdem raus, weil sich ihr Pfad im Abschnitt „nicht
    // eingehängt" geändert hat.
    await sendBookState(appId);
    return { ok: true, relPath: plan.newRelPath, path: plan.targetPath, linkUpdate };
  }

  // Ziel-Ordner über den nativen Ordner-Dialog wählen. Der Dialog startet im
  // Buch-Ordner; ein Ziel außerhalb weist planChapterFileMove ab (AK4).
  handle('books:moveChapterFile', async (event, relPath) => {
    const owner = senderWindow(event);
    const appId = appIdOfWindow(owner);
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'book.moveDialogTitle'),
      defaultPath: bookDir,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return moveBookChapterFile(event, relPath, result.filePaths[0]);
  });

  // Dialogfreier Pfad-Einstieg (Muster books:openPath und demoArea:createAt):
  // identische Strecke ab der Ordner-Wahl, damit das Verschieben ohne den
  // nativen Dialog automatisiert prüfbar ist.
  handle('books:moveChapterFileTo', (event, params) =>
    moveBookChapterFile(
      event,
      params && typeof params.relPath === 'string' ? params.relPath : '',
      params && typeof params.targetDir === 'string' ? params.targetDir : '',
    ),
  );

  // --- 4T-0848 (Story 4S-0757): Reparatur fehlender Kapitel -------------------
  //
  // Beide Handler aendern hoechstens die Deklaration; keine Datei wird bewegt,
  // angelegt oder geloescht. Der Suchraum und die Grenze des Ziels sind der
  // Buch-Ordner (wie beim Verschiebe-Weg), und ein Vorschlag wird nie von
  // selbst ausgefuehrt: books.suggestMissingChapters liefert nur Funde, die
  // Zuordnung ist ein eigener Aufruf aus dem Panel (Epic-Entscheidung 6).

  // Namensgleiche Dateien an anderer Stelle des Buch-Ordners (Vorschlags-Liste
  // des Panels). Rein lesend, deshalb ohne Zustands-Meldung.
  handle('books:suggestMissing', async (event, missingPath) => {
    const appId = appIdOfWindow(senderWindow(event));
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    return books.suggestMissingChapters(bookDir, missingPath);
  });

  // Eine Zuordnung; `newPath` kommt buch-relativ (angenommener Vorschlag) oder
  // absolut (Datei-Dialog). Nach Erfolg meldet sendBookState den frisch
  // gelesenen Zustand, womit die Zeile ihre Fehl-Markierung verliert.
  async function reassignBookChapter(event, missingPath, newPath) {
    const appId = appIdOfWindow(senderWindow(event));
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    const result = await books.reassignChapter(bookDir, missingPath, newPath);
    if (!result.ok) return { ok: false, error: result.error };
    await sendBookState(appId);
    return { ok: true, relPath: result.relPath };
  }

  handle('books:reassignChapter', (event, params) =>
    reassignBookChapter(
      event,
      params && typeof params.missingPath === 'string' ? params.missingPath : '',
      params && typeof params.newPath === 'string' ? params.newPath : '',
    ),
  );

  // Datei-Wahl ueber den nativen Dialog, wenn es keinen namensgleichen Fund
  // gibt. Der Dialog startet im Buch-Ordner und filtert auf Markdown; die
  // Grenze zieht books.reassignChapter unabhaengig davon nach (der Dialog
  // liesse ein Ziel ausserhalb zu).
  handle('books:reassignChapterDialog', async (event, missingPath) => {
    const owner = senderWindow(event);
    const appId = appIdOfWindow(owner);
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'book.reassignDialogTitle'),
      defaultPath: bookDir,
      properties: ['openFile'],
      filters: [
        {
          name: tForWindow(owner, 'dialog.filterMarkdown'),
          extensions: ['md', 'markdown', 'mdown', 'mkd'],
        },
      ],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return reassignBookChapter(event, missingPath, result.filePaths[0]);
  });

  // "Neues Kapitel": legt die leere Markdown-Datei an und haengt sie ein.
  // `parentPath` ist buch-relativ (null = oberste Ebene) und bestimmt zugleich
  // den Ordner der neuen Datei.
  handle('books:createChapter', async (event, params) => {
    const appId = appIdOfWindow(senderWindow(event));
    const bookDir = appId != null ? activeBooks.get(appId) : null;
    if (!bookDir) return { ok: false, error: 'no-book' };
    const parentPath = params && typeof params.parentPath === 'string' ? params.parentPath : null;
    const name = params && typeof params.name === 'string' ? params.name : '';
    const result = await books.createChapter(bookDir, parentPath, name);
    if (!result.ok) return { ok: false, error: result.error };
    await sendBookState(appId);
    return { ok: true, relPath: result.relPath, path: result.path };
  });
}

module.exports = { registerBooksIpc };
