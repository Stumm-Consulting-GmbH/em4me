// 4T-002163 (Epic 3E-000149): Die Kanaele der beiden Ausgaben des Foliensatzes
// (Stories 4S-001054 und 4S-001057).
//
// **Warum eine eigene Kanal-Gruppe** (Schnitt-Grund wie bei canvas-import.js):
// Die Zustaendigkeit laesst sich in einem Satz sagen — den Foliensatz einer
// Praesentation als PDF drucken und als Ordner mit HTML-Seiten schreiben. Der
// Dokument-Export (dialogs.js) liest die Seiten-Einstellungen aus dem Speicher
// und schreibt genau eine Datei; beides gilt hier nicht.
//
//   presentationPdf:print       printToPDF im Folien-Format (pdf-options.js,
//                               folienPdfOptionen), ohne Rand; der Zielpfad
//                               kommt aus dem vorhandenen pdf:chooseTarget.
//   presentationHtml:chooseFolder  Ordner-Wahl nach dem Muster der Bereichs-
//                               und Demo-Dialoge (openDirectory,
//                               createDirectory).
//   presentationHtml:write      alle Seiten in den Ziel-Ordner, jede Datei ueber
//                               den einen Schreibweg, der ganz oder gar nicht
//                               wirkt (Muster html:write).
//
// **Ziel-Ordner** (Entscheidung der Sitzung vom 2026-10-09): Ist der gewaehlte
// Ordner leer, neu oder traegt er schon einen Foliensatz-Export (index.html und
// folie-001.html), entstehen die Seiten darin; sonst in einem Unterordner
// `<Name>-Folien`, den der Anzeige-Prozess vorschlaegt. So bleibt ein fremder
// Ordnerinhalt unangetastet, und ein erneuter Export in denselben Ordner
// ersetzt den alten.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { folienPdfOptionen } = require('../../shared/pdf-options');

// Nur diese Namen schreibt der Kanal: die Startseite und die Folien-Seiten.
const SEITEN_NAME = /^(index|folie-\d{3,})\.html$/;
// Zeichen, die in einem Ordnernamen unter Windows nicht stehen duerfen.
const VERBOTEN = /[\\/:*?"<>|]/g;

/**
 * Bereinigt den vorgeschlagenen Unterordner-Namen.
 *
 * @param {unknown} name
 * @param {string} ersatz Name, wenn nichts uebrig bleibt.
 * @returns {string}
 */
function sichererOrdnerName(name, ersatz) {
  const roh = typeof name === 'string' ? name : '';
  const sauber = roh
    .replace(VERBOTEN, '_')
    .replace(/[. ]+$/, '')
    .trim();
  return sauber && sauber !== '.' && sauber !== '..' ? sauber : ersatz;
}

/**
 * Der Ordner, in den die Seiten geschrieben werden.
 *
 * @param {string} gewaehlt Der gewaehlte Ordner.
 * @param {string} unterordner Der bereinigte Name fuer den Unterordner.
 * @param {{readdir: Function}} [dateisystem] fuer Tests.
 * @returns {Promise<string>}
 */
async function zielOrdner(gewaehlt, unterordner, dateisystem = fs) {
  let eintraege;
  try {
    eintraege = await dateisystem.readdir(gewaehlt);
  } catch (err) {
    if (err && err.code === 'ENOENT') return gewaehlt;
    throw err;
  }
  if (eintraege.length === 0) return gewaehlt;
  if (eintraege.includes('index.html') && eintraege.includes('folie-001.html')) return gewaehlt;
  return path.join(gewaehlt, unterordner);
}

/**
 * Registriert die Kanaele der Foliensatz-Ausgaben.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.app Electron-App-Objekt.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 */
function registerPresentationExportIpc(handle, deps) {
  const { app, dialog, senderWindow, tForWindow } = deps;

  // Wie pdf:print, aber im Folien-Format und ohne die Seiten-Einstellungen
  // des Dokument-Exports. Der Fenster-Hintergrund wird fuer die Druck-Dauer
  // weiss gestellt, aus demselben Grund wie dort (sonst ein dunkler Grund
  // unter jeder Seite im dunklen Farbschema).
  handle('presentationPdf:print', async (event, targetPath, size) => {
    if (typeof targetPath !== 'string' || !targetPath) {
      return { ok: false, error: 'presentationPdf:print ohne Pfad aufgerufen' };
    }
    const owner = senderWindow(event);
    if (!owner || owner.isDestroyed()) {
      return { ok: false, error: 'Fenster nicht mehr verfuegbar' };
    }
    const savedBackgroundColor = owner.getBackgroundColor();
    try {
      owner.setBackgroundColor('#ffffff');
      const buffer = await owner.webContents.printToPDF(
        folienPdfOptionen(typeof size === 'string' ? size : null),
      );
      const absolute = path.resolve(targetPath);
      await ersetzeDateiOderWirf(absolute, buffer);
      return { ok: true, path: absolute };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      if (!owner.isDestroyed() && savedBackgroundColor) {
        owner.setBackgroundColor(savedBackgroundColor);
      }
    }
  });

  // Ordner-Wahl. Vorgabe ist der Ordner des Dokuments; ein pfadloses Dokument
  // beginnt im Home-Verzeichnis.
  handle('presentationHtml:chooseFolder', async (event, params) => {
    const owner = senderWindow(event);
    const vorgabe =
      params && typeof params.suggestedDir === 'string' && params.suggestedDir
        ? params.suggestedDir
        : app.getPath('home');
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'presentation.export.ordnerDialogTitel'),
      defaultPath: vorgabe,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: path.resolve(result.filePaths[0]) };
  });

  handle('presentationHtml:write', async (event, gewaehlt, unterordner, dateien) => {
    if (typeof gewaehlt !== 'string' || !gewaehlt) {
      return { ok: false, error: 'presentationHtml:write ohne Ordner aufgerufen' };
    }
    if (!Array.isArray(dateien) || dateien.length === 0) {
      return { ok: false, error: 'presentationHtml:write ohne Seiten aufgerufen' };
    }
    for (const datei of dateien) {
      if (
        !datei ||
        typeof datei.name !== 'string' ||
        !SEITEN_NAME.test(datei.name) ||
        typeof datei.text !== 'string'
      ) {
        return { ok: false, error: 'presentationHtml:write mit ungueltiger Seite aufgerufen' };
      }
    }
    try {
      const owner = senderWindow(event);
      const name = sichererOrdnerName(
        unterordner,
        tForWindow(owner, 'presentation.export.ordnerOhneName'),
      );
      const ziel = await zielOrdner(path.resolve(gewaehlt), name);
      await fs.mkdir(ziel, { recursive: true });
      for (const datei of dateien) {
        await ersetzeDateiOderWirf(path.join(ziel, datei.name), datei.text);
      }
      return { ok: true, path: ziel, name: path.basename(ziel) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

module.exports = { registerPresentationExportIpc, zielOrdner, sichererOrdnerName };
