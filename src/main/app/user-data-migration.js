// 4T-000643 (Epic 3E-000126): Uebernahme der Nutzerdaten nach einem Rebranding.
//
// Der userData-Pfad haengt am productName: %APPDATA%/<productName>/. Bei jeder
// Umbenennung — „Markdown Viewer" → „SCG Markdown" (4T-000011), „SCG Markdown" →
// „Perspective Markdown++" (4T-000247), „Perspective Markdown++" → „EM4me"
// (4T-000643) — startet die App auf einem leeren Profil. Fehlt unter dem
// aktuellen Pfad noch eine Config, existiert aber eine unter einem
// Vorgaengernamen, wird der Bestand einmalig uebernommen (neuester Vorgaenger
// zuerst). Es wird nur kopiert; die alten Pfade bleiben defensiv liegen.
//
// Bis 4T-000247 wanderte allein config.json mit. Inzwischen liegen im selben
// Ordner zwei weitere Nutzdaten-Bestaende, die eine Umbenennung sonst
// verschluckt: Entwuerfe nie gespeicherter Tabs (4T-000369) und externe
// Erweiterungen (4T-000298). Die Liste ist bewusst explizit statt „Ordner
// komplett kopieren": userData enthaelt auch Chromium-Caches und Logs, die im
// neuen Profil nichts zu suchen haben.
//
// Prozess-neutral gehalten (Pfade als Parameter, kein Electron-Zugriff), damit
// die Unit-Tests dieselbe Funktion pruefen wie der Produktiv-Pfad.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// Neuester Vorgaenger zuerst — die erste gefundene Quelle gewinnt.
const PREVIOUS_PRODUCT_NAMES = ['Perspective Markdown++', 'SCG Markdown', 'Markdown Viewer'];

// Bestaende, die eine Umbenennung ueberleben muessen.
const MIGRATED_USER_DATA = ['config.json', 'drafts', 'extensions'];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Uebernimmt die Nutzerdaten des juengsten vorhandenen Vorgaengers.
// Gibt zurueck, was passiert ist: { migriert: boolean, quelle: string|null,
// uebernommen: string[] } — der Rueckgabewert ist die Test-Oberflaeche.
async function migrateUserData({
  appDataDir,
  userDataDir,
  previousNames = PREVIOUS_PRODUCT_NAMES,
  items = MIGRATED_USER_DATA,
  logger = console,
} = {}) {
  const ergebnis = { migriert: false, quelle: null, uebernommen: [] };
  try {
    // Eine vorhandene Config heisst: dieses Profil ist bereits in Benutzung.
    if (await exists(path.join(userDataDir, 'config.json'))) return ergebnis;

    for (const prevName of previousNames) {
      const oldRoot = path.join(appDataDir, prevName);
      if (!(await exists(path.join(oldRoot, 'config.json')))) continue;

      await fs.mkdir(userDataDir, { recursive: true });
      for (const name of items) {
        const quelle = path.join(oldRoot, name);
        if (!(await exists(quelle))) continue;
        try {
          // recursive deckt Datei und Verzeichnis ab; errorOnExist:false, damit
          // ein halb angelegtes Zielprofil die Uebernahme nicht abbricht.
          await fs.cp(quelle, path.join(userDataDir, name), {
            recursive: true,
            errorOnExist: false,
          });
          ergebnis.uebernommen.push(name);
        } catch (err) {
          // Ein einzelner Bestand darf die uebrigen nicht mitreissen.
          logger.warn(`Migration von ${quelle} fehlgeschlagen:`, err);
        }
      }
      ergebnis.migriert = true;
      ergebnis.quelle = prevName;
      logger.info(
        `Nutzerdaten aus Vorgaengerinstallation uebernommen (${prevName}): ` +
          `${ergebnis.uebernommen.join(', ') || 'nichts'}`,
      );
      return ergebnis;
    }
  } catch (err) {
    logger.warn('Nutzerdaten-Migration fehlgeschlagen, frische Defaults werden geladen:', err);
  }
  return ergebnis;
}

module.exports = { migrateUserData, PREVIOUS_PRODUCT_NAMES, MIGRATED_USER_DATA };
