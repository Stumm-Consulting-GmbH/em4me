// IPC-Kanal-Gruppe externe Erweiterungen: Scan des Erweiterungs-Verzeichnisses,
// Quelltext-Zugriff ueber die ID-Whitelist, die beiden Bestaetigungs-Dialoge
// (Vertrauen und Entfernen) und der Zugang zum Verzeichnis im Datei-Explorer.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: extensions:*.
//
// 4T-002650 (Epic 3E-000416): Die Erlaubnisse der Add-ons schreibt allein diese
// Gruppe. `extensions:confirmTrust` speichert die Bestätigung nach «Ja» selbst,
// `extensions:setEnabled` schaltet ein und aus und prüft dabei die
// Bestätigung, `extensions:reportError` hält den letzten Fehler mit begrenztem
// Text fest, `extensions:removeExternal` räumt die Einträge mit dem Ordner ab.
// Jede Änderung geht über die Verteilung der Einstellungen an alle Fenster
// (`extensionsExternal:changed`). Code und Einstiegs-Adresse liefert die
// Gruppe nur für Pakete, die eingeschaltet und bestätigt oder mitgeliefert
// sind. Die Prüfungen selbst stehen in `extensions/extension-trust.js`.
//
// Eigener Zustand: keiner; der Helfer extensionsRoot bildet den Wurzelpfad
// unter <userData> und ist der einzige Ort, an dem er entsteht.
'use strict';

const path = require('node:path');
const {
  scanExtensionsRoot,
  readMarkdownPluginSource,
  externalExtensionInfo,
  scannedPackage,
  removeExtensionDirectory,
} = require('../extensions/extension-packages');
const trust = require('../extensions/extension-trust');
const { EXTERNAL_ENABLED_KEY } = require('../../shared/extensions/extensions-external');
const { createSettingsVerteilung } = require('./settings-verteilung');

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
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (Erlaubnisse).
 * @param {object} [options] Nur für Prüfdateien.
 * @param {(pkg: object) => boolean} [options.isBundled] Erkennung mitgelieferter Pakete.
 */
function registerExtensionsIpc(handle, deps, options = {}) {
  const { app, dialog, shell, senderWindow, tForWindow, getStore } = deps;
  const isBundled = options.isBundled || trust.isBundledPackage;
  // 4T-002650: dieselbe Verteilung wie settings:set; der Zweig des Schlüssels
  // extensionsExternal.enabled meldet `extensionsExternal:changed` an alle
  // Fenster, auch an das auslösende.
  const verteileEinstellung = createSettingsVerteilung(deps);

  // --- 4T-000298 (Epic 3E-000053): externe Erweiterungen ---------------------------
  // Sicherheits-Kontrakt: der Renderer reicht nur IDs herein; alle Pfade
  // entstehen main-seitig aus <userData>/extensions plus validierten
  // Scan-Eintraegen (Whitelist-Muster wie help:getManualPage).
  const extensionsRoot = () => path.join(app.getPath('userData'), 'extensions');

  // Paket des letzten Scans zu einer Kennung aus dem Fenster, sonst null.
  const packageOf = (id) => (trust.isExtensionId(id) ? scannedPackage(extensionsRoot(), id) : null);

  // Erlaubnisse geändert: an alle Fenster verteilen.
  const announce = (enabled) => verteileEinstellung(EXTERNAL_ENABLED_KEY, enabled, null);

  handle('extensions:scanExternal', async () => {
    try {
      const entries = await scanExtensionsRoot(extensionsRoot());
      return trust.entriesForWindow(entries, trust.readPermissions(getStore()), isBundled);
    } catch (err) {
      console.warn('Erweiterungs-Scan fehlgeschlagen:', err);
      return [];
    }
  });

  handle('extensions:getMarkdownPluginSource', async (_event, id) => {
    if (typeof id !== 'string') return { ok: false, error: 'Ungueltige ID' };
    // 4T-002650: Quelltext nur für ein eingeschaltetes und bestätigtes oder
    // mitgeliefertes Paket. Review-Befund Z3 vom 2026-11-22: Ein Paket, das der
    // letzte Scan nicht kennt, bekommt ebenso keinen Quelltext (im Zweifel
    // abweisend), statt die Entscheidung dem Lese-Weg zu überlassen.
    const pkg = packageOf(id);
    if (!pkg || !trust.mayDeliver(trust.readPermissions(getStore()), pkg, isBundled(pkg))) {
      return { ok: false, error: 'extensions:notPermitted' };
    }
    return readMarkdownPluginSource(extensionsRoot(), id);
  });

  // Warn-Dialog des Vertrauensmodells (Product-Owner-Entscheidung: keine
  // Sandbox, explizite Nutzerbestaetigung). Der Text benennt das Risiko
  // unmissverstaendlich; Abbrechen ist Default und Escape-Ziel.
  handle('extensions:confirmTrust', async (event, id) => {
    if (typeof id !== 'string') return false;
    const info = externalExtensionInfo(extensionsRoot(), id);
    const pkg = packageOf(id);
    if (!info || !pkg) return false;
    // 4T-002650: Ein mitgeliefertes Paket braucht keine Bestätigung.
    if (isBundled(pkg)) return true;
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
    if (result.response !== 0) return false;
    // 4T-002650: gespeichert vom Hauptprozess, gebunden an die Version.
    trust.recordTrust(getStore(), pkg);
    announce(trust.readPermissions(getStore()).enabled);
    return true;
  });

  // 4T-002650: Ein- und Ausschalten. Einschalten verlangt ein Paket des
  // letzten Scans, dessen Bestätigung gilt oder das mitgeliefert ist;
  // Ausschalten geht immer. Antwort `{ ok: true, enabled }` mit der Liste der
  // eingeschalteten Kennungen oder `{ ok: false, error }`.
  handle('extensions:setEnabled', async (_event, id, on) => {
    if (!trust.isExtensionId(id) || typeof on !== 'boolean') {
      return { ok: false, error: 'extensions:invalidArgument' };
    }
    if (on) {
      const pkg = packageOf(id);
      if (!pkg) return { ok: false, error: 'extensions:unknown' };
      const trusted = trust.readPermissions(getStore()).trusted;
      if (!isBundled(pkg) && !trust.trustHolds(trusted, pkg)) {
        return { ok: false, error: 'extensions:notTrusted' };
      }
    }
    const enabled = trust.setEnabled(getStore(), id, on);
    announce(enabled);
    return { ok: true, enabled };
  });

  // 4T-002650: Letzter Lade- oder Aufbau-Fehler eines Add-ons, gemeldet vom
  // Fenster. Der Text wird auf `MAX_ERROR_TEXT` Zeichen gekürzt, das Add-on
  // ausgeschaltet. Nur für Pakete des letzten Scans.
  handle('extensions:reportError', async (_event, id, text) => {
    if (typeof text !== 'string' || text === '') {
      return { ok: false, error: 'extensions:invalidArgument' };
    }
    if (!packageOf(id)) return { ok: false, error: 'extensions:unknown' };
    const enabled = trust.recordError(getStore(), id, text);
    announce(enabled);
    return { ok: true, enabled };
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
    let removed;
    try {
      removed = await removeExtensionDirectory(extensionsRoot(), id);
    } catch (err) {
      console.warn('Erweiterung entfernen fehlgeschlagen:', id, err);
      return { removed: false, error: String((err && err.message) || err) };
    }
    // 4T-002650: Bestätigung, Schalter und Fehler des entfernten Pakets
    // räumt der Hauptprozess selbst ab.
    if (removed) announce(trust.forgetPackage(getStore(), id));
    return { removed };
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
