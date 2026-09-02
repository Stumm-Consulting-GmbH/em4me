// IPC-Kanal-Gruppe Buecherregale: Zustand und Anzeige-Daten des aktiven
// Regals, Oeffnen, Anlegen und Schliessen sowie die Zuordnung von Buechern.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: shelves:*.
//
// Eigener Zustand: keiner; die Regal-Applikationen kommen als Deps.
'use strict';

const shelves = require('../books/shelves');

/**
 * Registriert die Regal-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => number|null} deps.appIdOfWindow Applikation eines Fensters.
 * @param {Map} deps.activeShelves Aktives Regal je Applikation.
 * @param {Function} deps.shelfPayloadFor Zustands-Paket des aktiven Regals.
 * @param {Function} deps.sendShelfState Zustand an alle Fenster der Applikation melden.
 * @param {Function} deps.openShelfApp Regal als eigene Applikation oeffnen.
 * @param {Function} deps.closeActiveShelf Regal-Applikation schliessen.
 * @param {Function} deps.reportNotAShelf Hinweis auf einen Ordner ohne Regal.
 * @param {Function} deps.openShelfDialog "Buecherregal oeffnen…" mit Ordner-Dialog.
 * @param {Function} deps.createShelfDialog "Neues Buecherregal…" mit Ordner- und Namens-Dialog.
 */
function registerShelvesIpc(handle, deps) {
  const {
    senderWindow,
    appIdOfWindow,
    activeShelves,
    shelfPayloadFor,
    sendShelfState,
    openShelfApp,
    closeActiveShelf,
    reportNotAShelf,
    openShelfDialog,
    createShelfDialog,
  } = deps;

  // --- 4T-000867 (Epic 3E-000162): Buecherregale ---------------------------------
  // Namensraum `shelves` in der Preload-API; alle Handler beziehen sich auf
  // das aktive Regal der Applikation des aufrufenden Fensters (Muster des
  // books-Namensraums).

  // Zustand des aktiven Regals (Regal-Ansicht, Story 4S-000761).
  handle('shelves:getState', (event) => shelfPayloadFor(appIdOfWindow(senderWindow(event))));

  // 4T-000868: Anzeige-Daten der Regal-Ansicht (Kachel- und Zeilen-Darstellung):
  // je Buch Titel, Autor, Beschreibung, aufgeloestes Bild und Kapitel-Anzahl.
  // Bei jedem Abruf frisch von der Platte (Muster shelves:getState).
  handle('shelves:getViewData', async (event) => {
    const appId = appIdOfWindow(senderWindow(event));
    const shelfDir = appId != null ? activeShelves.get(appId) : null;
    if (!shelfDir) return { ok: false, error: 'no-shelf' };
    return shelves.buildShelfViewData(shelfDir);
  });

  // "Buecherregal oeffnen…" mit Ordner-Dialog.
  handle('shelves:openDialog', (event) => openShelfDialog(senderWindow(event)));

  // "Neues Buecherregal…": Eltern-Ordner und Name in einem Dialog.
  handle('shelves:createDialog', (event) => createShelfDialog(senderWindow(event)));

  // "Buecherregal schliessen" schliesst die Regal-Applikation (4T-000873).
  handle('shelves:close', (event) => closeActiveShelf(appIdOfWindow(senderWindow(event))));

  // Dialog-freie Pfad-Einstiege (Muster books:openPath/createAt): identische
  // Strecke ab der Ordner-Wahl, damit beide Wege automatisiert pruefbar sind.
  handle('shelves:openPath', async (event, shelfDir) => {
    if (typeof shelfDir !== 'string' || !shelfDir) return { ok: false, error: 'invalid path' };
    const owner = senderWindow(event);
    const opened = await openShelfApp(shelfDir, owner);
    if (!opened.ok && (opened.error === 'no-shelf' || opened.error === 'invalid')) {
      await reportNotAShelf(owner, shelfDir, opened.error);
    }
    return opened;
  });

  handle('shelves:createAt', async (event, params) => {
    const owner = senderWindow(event);
    const parentDir = params && typeof params.parentDir === 'string' ? params.parentDir : '';
    const name = params && typeof params.name === 'string' ? params.name : '';
    if (!parentDir) return { ok: false, error: 'invalid path' };
    const created = await shelves.createShelf(parentDir, name);
    if (!created.ok) return created;
    return openShelfApp(created.shelfDir, owner);
  });

  // Zuordnung (Story 4S-000760, AK4): beide Handler schreiben ausschliesslich die
  // Begleitdatei des aktiven Regals; nach einer erfolgreichen Aenderung meldet
  // sendShelfState den frisch gelesenen Zustand an alle Fenster der App.
  handle('shelves:assignBook', async (event, dirName) => {
    const appId = appIdOfWindow(senderWindow(event));
    const shelfDir = appId != null ? activeShelves.get(appId) : null;
    if (!shelfDir) return { ok: false, error: 'no-shelf' };
    const result = await shelves.assignBookDir(shelfDir, dirName);
    if (!result.ok) return { ok: false, error: result.error };
    await sendShelfState(appId);
    return { ok: true };
  });

  handle('shelves:unassignBook', async (event, dirName) => {
    const appId = appIdOfWindow(senderWindow(event));
    const shelfDir = appId != null ? activeShelves.get(appId) : null;
    if (!shelfDir) return { ok: false, error: 'no-shelf' };
    const result = await shelves.unassignBookDir(shelfDir, dirName);
    if (!result.ok) return { ok: false, error: result.error };
    await sendShelfState(appId);
    return { ok: true };
  });
}

module.exports = { registerShelvesIpc };
