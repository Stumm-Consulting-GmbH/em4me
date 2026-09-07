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
const MIGRATED_USER_DATA = ['drafts', 'extensions', 'config.json'];

// 4T-001336 (Epic 3E-000237): Name des produktiven Profils. Er ist das `name`-Feld
// der package.json, aus dem Electron den userData-Pfad ableitet; ein Waechter
// haelt beide gegeneinander (test/unit/user-data-migration.test.js).
const PRODUKTIV_PROFIL = 'em4me';

// 4T-001336: Uebernahme-Umfang der zweiten Auspraegung. Enger als beim
// Namenswechsel, und die Differenz ist genau ein Eintrag: die Entwuerfe.
//
// Entscheidung des Product Owners vom 2026-09-06 auf Vorlage der Session. Zwei
// Gruende, beide aus dem Zuschnitt des Epics: Das Epic trennt die EINRICHTUNG
// und nicht die INHALTE, und ein Entwurf ist Inhalt. Und die Uebernahme laeuft
// einmalig und einseitig — ein danach in der zweiten Auspraegung weiter
// geschriebener Entwurf kaeme nie zurueck, und es gaebe zwei auseinander
// laufende Fassungen von Text, der sonst nirgends existiert. Einstellungen und
// Bereiche sind aus der produktiven Seite reproduzierbar, ein ungespeicherter
// Entwurf ist es nicht.
//
// Der Bereichs-Suchindex (`bereichs-suche`) fehlt in BEIDEN Listen: Er ist
// Cache und baut sich selbst neu auf (Architektur, Ablage-Regel).
const AUSPRAEGUNG_USER_DATA = ['extensions', 'config.json'];

// 4T-001336: Die Marker-Datei. Ihre Anwesenheit im Ziel bedeutet «bereits
// uebernommen», deshalb wandert sie IMMER zuletzt — siehe reihenfolgeMitMarkerZuletzt.
const MARKER_DATEI = 'config.json';

// 4T-001336: Der Marker geht ans Ende, unabhaengig von der Reihenfolge der
// uebergebenen Liste.
//
// Bis hierher stand config.json an ERSTER Stelle, und genau das war ein Fehler
// mit Datenverlust-Potential: Bricht der erste Start nach dieser einen Datei ab
// — Absturz, Stromausfall, geschlossenes Fenster —, dann ist der Marker da,
// die uebrigen Bestaende fehlen, und jeder weitere Start haelt die Uebernahme
// fuer erledigt. Entwuerfe und Erweiterungen waeren dauerhaft verloren. Der
// Befund stammt aus 4T-001336 und betraf den Umbenennungs-Fall bereits seit
// 4T-000643; behoben ist er hier fuer beide Anlaesse zugleich.
//
// Strukturell statt als Konvention auf der Konstanten: Wer die Liste spaeter
// umsortiert, kann den Schutz nicht versehentlich aufheben.
function reihenfolgeMitMarkerZuletzt(items) {
  return [...items.filter((n) => n !== MARKER_DATEI), ...items.filter((n) => n === MARKER_DATEI)];
}

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
    // Ein vorhandener Marker heisst: dieses Profil ist bereits in Benutzung.
    // Er entsteht als LETZTES (reihenfolgeMitMarkerZuletzt), deshalb bedeutet
    // seine Anwesenheit «vollstaendig uebernommen» und nicht «angefangen».
    if (await exists(path.join(userDataDir, MARKER_DATEI))) return ergebnis;

    for (const prevName of previousNames) {
      const oldRoot = path.join(appDataDir, prevName);
      if (!(await exists(path.join(oldRoot, MARKER_DATEI)))) continue;
      // 4T-001336: Die Uebernahme LIEST die Quelle und schreibt nie in sie. Die
      // Selbst-Uebernahme ist der eine Fall, in dem das kippen koennte, und er
      // wird hier ausgeschlossen statt spaeter bemerkt.
      if (path.resolve(oldRoot) === path.resolve(userDataDir)) {
        logger.warn(`Uebernahme uebersprungen: Quelle und Ziel sind derselbe Ordner (${oldRoot}).`);
        continue;
      }

      await fs.mkdir(userDataDir, { recursive: true });
      for (const name of reihenfolgeMitMarkerZuletzt(items)) {
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

module.exports = {
  migrateUserData,
  PREVIOUS_PRODUCT_NAMES,
  MIGRATED_USER_DATA,
  // 4T-001336: zweite Auspraegung.
  PRODUKTIV_PROFIL,
  AUSPRAEGUNG_USER_DATA,
  MARKER_DATEI,
  reihenfolgeMitMarkerZuletzt,
};
