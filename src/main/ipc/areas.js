// IPC-Kanal-Gruppe Bereiche: Oeffnen und Schliessen einer Bereichs-App,
// Ordner-Listing und Datei-Anlage innerhalb der Bereichs-Grenze, dazu die
// Anlage der mitgelieferten Demo-Area.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: area:*,
// demoArea:*.
//
// Eigener Zustand: keiner; Bereichs-Bindung und Applikations-Registry kommen
// als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createDemoAreaAt } = require('../area/demo-area.js');
const { isInsideArea, sortedAreaListing, sanitizeNewFileName } = require('../area/area-path');

/**
 * Registriert die Bereichs- und Demo-Area-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {Function} deps.openAreaPath Bereich unter einem Wurzelpfad oeffnen.
 * @param {(appId: number) => Promise<object>} deps.closeAreaApp Bereichs-App schliessen.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 */
function registerAreasIpc(handle, deps) {
  const {
    dialog,
    senderWindow,
    areaOfWindow,
    tForWindow,
    appRegistry,
    openAreaPath,
    closeAreaApp,
    isMarkdownPath,
  } = deps;

  // --- 4T-0322 (Epic 3E-0058): Bereiche ---------------------------------------
  // "Bereich oeffnen..." mit Ordner-Dialog.
  handle('area:open', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'area.openDialogTitle'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return openAreaPath(result.filePaths[0], owner);
  });

  // --- 4T-0632 (Epic 3E-0102): Demo-Area --------------------------------------
  // "Demo-Area erstellen..." mit Ordner-Dialog: mitgelieferte Demo-Inhalte
  // in einen LEEREN Zielordner kopieren und direkt als Bereich oeffnen.
  // Nicht-leerer Zielordner: lokalisierter Hinweis, es wird niemals
  // ueberschrieben (Epic-Abgrenzung).
  handle('demoArea:create', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'demoArea.dialogTitle'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const targetDir = result.filePaths[0];
    const created = await createDemoAreaAt(targetDir);
    if (!created.ok) {
      if (created.error === 'not-empty') {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'demoArea.notEmptyTitle'),
          message: tForWindow(owner, 'demoArea.notEmptyMessage'),
          detail: targetDir,
          buttons: ['OK'],
        });
      }
      return created;
    }
    return openAreaPath(targetDir, owner);
  });

  // Direkter Pfad-Einstieg ohne Dialog (Tests; Muster area:openPath).
  handle('demoArea:createAt', async (event, targetDir) => {
    if (typeof targetDir !== 'string' || !targetDir) return { ok: false, error: 'invalid path' };
    const created = await createDemoAreaAt(targetDir);
    if (!created.ok) return created;
    return openAreaPath(targetDir, senderWindow(event));
  });

  // Direkter Pfad-Einstieg (Zuletzt-geoeffnete-Bereiche, Tests). Prueft die
  // Existenz des Ordners, sonst identische Regeln wie der Dialog-Weg.
  handle('area:openPath', async (event, rootPath) => {
    if (typeof rootPath !== 'string' || !rootPath) return { ok: false, error: 'invalid path' };
    try {
      const stat = await fs.stat(rootPath);
      if (!stat.isDirectory()) return { ok: false, error: 'not a directory' };
    } catch {
      return { ok: false, error: 'not found' };
    }
    return openAreaPath(rootPath, senderWindow(event));
  });

  // --- 4T-0327 (Epic 3E-0059): Bereichs-Panel ---------------------------------
  // Listet Unterordner und Markdown-Dateien EINES Ordners innerhalb des
  // Bereichs der aufrufenden App (lazy pro aufgeklapptem Ordner). Lese-
  // Fehler einzelner Ordner liefern leere Listen statt eines Abbruchs
  // (Entwicklungsrichtlinien: Fehler pro Knoten tolerieren).
  handle('area:listDir', async (event, dirPath) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const listing = sortedAreaListing(
        entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })),
        isMarkdownPath,
      );
      return { ok: true, dirs: listing.dirs, files: listing.files };
    } catch (err) {
      console.warn('Bereichs-Listing fehlgeschlagen:', dirPath, err && err.message);
      return { ok: true, dirs: [], files: [] };
    }
  });

  // 4T-0328: "Neue Datei in diesem Ordner" — legt eine leere Markdown-Datei
  // im (bereichs-internen) Ordner an. Namens-Validierung ueber
  // sanitizeNewFileName; bestehende Dateien werden nicht ueberschrieben.
  handle('area:createFile', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const dirPath = params && params.dirPath;
    const fileName = sanitizeNewFileName(params && params.name);
    if (!fileName) return { ok: false, error: 'invalid name' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    const target = path.join(dirPath, fileName);
    if (!isInsideArea(area.rootPath, target)) return { ok: false, error: 'outside-area' };
    try {
      // wx: exklusives Anlegen — existierende Datei bleibt unangetastet.
      await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: target };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // "Bereich schliessen": alle Fenster der Bereichs-App des Absenders.
  handle('area:close', async (event) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    if (appId == null || !appRegistry.getArea(appId)) return { ok: false };
    return closeAreaApp(appId);
  });
}

module.exports = { registerAreasIpc };
