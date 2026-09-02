// Die "Zuletzt geoeffnet"-Listen des Datei-Menues: Dateien, Bereiche, Buecher
// und Buecherregale.
//
// 4T-000888 (Epic 3E-000168): aus main.js herausgeloest, als die Buch- und die
// Regal-Liste dazukamen. Die vier Listen sind EINE Fachlichkeit — sie teilen
// Speicher-Form (Pfad-Liste im Store), Menue-Aufbau, Bestaetigungs-Dialog und
// den Umgang mit einem verschwundenen Ziel; sie unterscheiden sich nur im
// Store-Schluessel, im Text und im Oeffnungs-Pfad. In main.js lagen sie
// verstreut zwischen Bereichs-, Buch- und Regal-Code (Muster der Ausloesung
// von menu-icons.js aus menu.js im selben Epic).
//
// Electron-Bindung: `dialog` kommt direkt (wie in menu-icons.js), alles
// Uebrige injiziert, weil es Zustand von main.js ist:
//   getStore()                      -> Settings-Store (erst nach loadStore da,
//                                      deshalb Getter statt Wert)
//   applyMenuToAllWindows()         -> Menues nach Listen-Aenderung neu bauen
//   tForWindow(win, key)            -> lokalisierter Text in Fenster-Sprache
//   getActiveWindow()               -> Rueckfall-Ziel ohne Quell-Fenster
//   focusWindow(win)                -> Fenster in den Vordergrund
//   openAreaPath(root, win)         -> regulaerer Bereichs-Oeffnungs-Pfad
//   openBookApp(dir, win)           -> regulaerer Buch-Oeffnungs-Pfad
//   reportNotABook(win, dir, error) -> bestehende lokalisierte Buch-Meldung
//   openShelfApp(dir, win)          -> regulaerer Regal-Oeffnungs-Pfad
//   reportNotAShelf(win, dir, err)  -> bestehende lokalisierte Regal-Meldung
'use strict';

const fs = require('node:fs/promises');
const { dialog } = require('electron');
const { isSamePath, updatedRecentPaths, withoutRecentPath } = require('./area/area-path');

function createRecentLists(deps) {
  const store = () => deps.getStore();

  // 4T-000888: Pflege einer Liste im Store samt Menue-Nachzug. Buecher und
  // Regale haengen an mehreren Oeffnungs-Pfaden und rufen das von dort;
  // die Bereichs-Liste pflegt openAreaPath unmittelbar.
  function pushRecentEntry(key, dirPath) {
    const s = store();
    if (!s) return;
    s.set(key, updatedRecentPaths(s.get(key), dirPath));
    deps.applyMenuToAllWindows();
  }

  // Einzelnen Eintrag austragen (Ziel existiert nicht mehr).
  function dropRecentEntry(key, dirPath) {
    const s = store();
    if (!s) return;
    s.set(key, withoutRecentPath(s.get(key), dirPath));
    deps.applyMenuToAllWindows();
  }

  // Klick auf "Liste loeschen" in einem der vier Recent-Submenues.
  // Bestaetigungsdialog mit "Loeschen" / "Abbrechen"; bei Loeschen wird die
  // Liste geleert und alle Fenster-Menues aktualisiert.
  async function confirmClear(storeKey, confirmKey, sourceWindow) {
    const t = (key) => deps.tForWindow(sourceWindow, key);
    const result = await dialog.showMessageBox(sourceWindow || undefined, {
      type: 'question',
      title: t('menu.file.recentClear'),
      message: t(confirmKey),
      buttons: [t('menu.file.recentClearBtnYes'), t('menu.file.recentClearBtnNo')],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      const s = store();
      if (s) s.set(storeKey, []);
      deps.applyMenuToAllWindows();
    }
  }

  // Klick auf einen Recent-Eintrag im Datei-Menue. Prueft zunaechst, ob die
  // Datei noch existiert; wenn nicht, raus aus der Liste und Fehlerdialog.
  // Sonst: Datei als neuer Tab im sourceWindow oeffnen (analog zu "Oeffnen mit"
  // im Explorer). Der Renderer aktualisiert die Recent-Liste selbst ueber
  // recent:push, wenn er die Datei in openInPane verarbeitet.
  async function openRecentFile(filePath, sourceWindow) {
    try {
      await fs.access(filePath);
    } catch {
      const s = store();
      if (s)
        s.set(
          'recentFiles',
          (s.get('recentFiles') || []).filter((p) => p !== filePath),
        );
      deps.applyMenuToAllWindows();
      await dialog.showMessageBox(sourceWindow || undefined, {
        type: 'warning',
        title: deps.tForWindow(sourceWindow, 'recent.missingFileTitle'),
        message: deps.tForWindow(sourceWindow, 'recent.missingFile'),
        detail: filePath,
        buttons: ['OK'],
      });
      return;
    }
    const target =
      sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : deps.getActiveWindow();
    if (target && !target.isDestroyed()) {
      deps.focusWindow(target);
      target.webContents.send('file:openExternal', [filePath]);
    }
  }

  // 4T-000325 (Epic 3E-000058): Klick auf einen Eintrag im Submenue "Zuletzt
  // geoeffnete Bereiche". Fehlt der Ordner, wird der Eintrag ausgetragen und
  // gemeldet; sonst identische Regeln wie "Bereich oeffnen..." (openAreaPath).
  async function openRecentArea(rootPath, sourceWindow) {
    try {
      const stat = await fs.stat(rootPath);
      if (!stat.isDirectory()) throw new Error('kein Ordner');
    } catch {
      const s = store();
      if (s) {
        s.set(
          'recentAreas',
          (s.get('recentAreas') || []).filter((p) => !isSamePath(p, rootPath)),
        );
        deps.applyMenuToAllWindows();
      }
      await dialog.showMessageBox(sourceWindow || undefined, {
        type: 'warning',
        title: deps.tForWindow(sourceWindow, 'area.missingTitle'),
        message: deps.tForWindow(sourceWindow, 'area.recentMissingMessage'),
        detail: rootPath,
        buttons: ['OK'],
      });
      return;
    }
    // 4T-001364 (Epic 3E-000171): openAreaPath ist asynchron geworden (die
    // Start-Seite wird aus der Bereichsdatei gelesen). Der Menue-Klick wartet
    // nicht auf das Ergebnis; Muster der uebrigen Nachzuegler.
    void deps.openAreaPath(rootPath, sourceWindow);
  }

  // 4T-000888: Klick auf einen Eintrag im Submenue "Zuletzt geoeffnete Buecher".
  // Bewusst OHNE eigene Vorab-Pruefung des Ordners: das Oeffnen selbst prueft
  // ihn (buildBookState) und meldet ueber den bestehenden lokalisierten Weg des
  // Dialog-Oeffnens (reportNotABook). 'no-book' heisst Ordner weg oder kein Buch
  // mehr — der Eintrag ist als Buch-Eintrag verbraucht und wird ausgetragen
  // (Muster openRecentArea); 'invalid' heisst defekte Begleitdatei bei
  // bestehendem Buch — der Eintrag bleibt, weil der Ordner nach einer Reparatur
  // wieder oeffnet.
  async function openRecentBook(bookDir, sourceWindow) {
    const owner = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : null;
    const opened = await deps.openBookApp(bookDir, owner);
    if (!opened.ok && (opened.error === 'no-book' || opened.error === 'invalid')) {
      if (opened.error === 'no-book') dropRecentEntry('recentBooks', bookDir);
      await deps.reportNotABook(owner, bookDir, opened.error);
    }
    return opened;
  }

  // 4T-000888: dasselbe fuer die Regale (inklusive der Unterscheidung
  // 'no-shelf' -> austragen, 'invalid' -> stehen lassen).
  async function openRecentShelf(shelfDir, sourceWindow) {
    const owner = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : null;
    const opened = await deps.openShelfApp(shelfDir, owner);
    if (!opened.ok && (opened.error === 'no-shelf' || opened.error === 'invalid')) {
      if (opened.error === 'no-shelf') dropRecentEntry('recentShelves', shelfDir);
      await deps.reportNotAShelf(owner, shelfDir, opened.error);
    }
    return opened;
  }

  return {
    pushRecentEntry,
    dropRecentEntry,
    openRecentFile,
    openRecentArea,
    openRecentBook,
    openRecentShelf,
    clearRecentFiles: (win) => confirmClear('recentFiles', 'menu.file.recentClearConfirm', win),
    clearRecentAreas: (win) =>
      confirmClear('recentAreas', 'menu.file.recentAreasClearConfirm', win),
    clearRecentBooks: (win) =>
      confirmClear('recentBooks', 'menu.file.recentBooksClearConfirm', win),
    clearRecentShelves: (win) =>
      confirmClear('recentShelves', 'menu.file.recentShelvesClearConfirm', win),
  };
}

module.exports = { createRecentLists };
