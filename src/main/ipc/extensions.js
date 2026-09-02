// IPC-Kanal-Gruppe externe Erweiterungen: Scan des Erweiterungs-Verzeichnisses,
// Quelltext-Zugriff ueber die ID-Whitelist, die beiden Bestaetigungs-Dialoge
// (Vertrauen und Entfernen) und der Zugang zum Verzeichnis im Datei-Explorer.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: extensions:*.
//
// Eigener Zustand: keiner; der Helfer extensionsRoot bildet den Wurzelpfad
// unter <userData> und ist der einzige Ort, an dem er entsteht.
'use strict';

const path = require('node:path');
const {
  scanExtensionsRoot,
  readMarkdownPluginSource,
  externalExtensionInfo,
  removeExtensionDirectory,
} = require('../extensions/extension-packages');

/**
 * Registriert die Kanaele der externen Erweiterungen.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.app Electron-App-Objekt (Nutzerdaten-Verzeichnis).
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {object} deps.shell Electron-Shell-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 */
function registerExtensionsIpc(handle, deps) {
  const { app, dialog, shell, senderWindow, tForWindow } = deps;

  // --- 4T-000298 (Epic 3E-000053): externe Erweiterungen ---------------------------
  // Sicherheits-Kontrakt: der Renderer reicht nur IDs herein; alle Pfade
  // entstehen main-seitig aus <userData>/extensions plus validierten
  // Scan-Eintraegen (Whitelist-Muster wie help:getManualPage).
  const extensionsRoot = () => path.join(app.getPath('userData'), 'extensions');

  handle('extensions:scanExternal', async () => {
    try {
      return await scanExtensionsRoot(extensionsRoot());
    } catch (err) {
      console.warn('Erweiterungs-Scan fehlgeschlagen:', err);
      return [];
    }
  });

  handle('extensions:getMarkdownPluginSource', async (_event, id) => {
    if (typeof id !== 'string') return { ok: false, error: 'Ungueltige ID' };
    return readMarkdownPluginSource(extensionsRoot(), id);
  });

  // Warn-Dialog des Vertrauensmodells (Product-Owner-Entscheidung: keine
  // Sandbox, explizite Nutzerbestaetigung). Der Text benennt das Risiko
  // unmissverstaendlich; Abbrechen ist Default und Escape-Ziel.
  handle('extensions:confirmTrust', async (event, id) => {
    if (typeof id !== 'string') return false;
    const info = externalExtensionInfo(extensionsRoot(), id);
    if (!info) return false;
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('extensions.external.trustTitle'),
      message: t('extensions.external.trustMessage')
        .replace('{name}', info.name)
        .replace('{version}', info.version),
      detail: t('extensions.external.trustDetail'),
      buttons: [t('extensions.external.trustConfirm'), t('extensions.external.trustCancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // Entfernen mit eigener Bestaetigung (destruktiv: loescht das
  // Erweiterungs-Verzeichnis endgueltig).
  handle('extensions:removeExternal', async (event, id) => {
    if (typeof id !== 'string') return { removed: false };
    const info = externalExtensionInfo(extensionsRoot(), id);
    if (!info) return { removed: false };
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('extensions.external.removeTitle'),
      message: t('extensions.external.removeMessage').replace('{name}', info.name),
      buttons: [t('extensions.external.removeConfirm'), t('extensions.external.removeCancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) return { removed: false, canceled: true };
    try {
      return { removed: await removeExtensionDirectory(extensionsRoot(), id) };
    } catch (err) {
      console.warn('Erweiterung entfernen fehlgeschlagen:', id, err);
      return { removed: false, error: String((err && err.message) || err) };
    }
  });

  // Zugang zum Erweiterungs-Verzeichnis im Datei-Explorer (legt es bei
  // Bedarf an — der Scan erledigt das mit).
  handle('extensions:openDir', async () => {
    try {
      await scanExtensionsRoot(extensionsRoot());
      await shell.openPath(extensionsRoot());
      return true;
    } catch (err) {
      console.warn('Erweiterungs-Verzeichnis oeffnen fehlgeschlagen:', err);
      return false;
    }
  });
}

module.exports = { registerExtensionsIpc };
