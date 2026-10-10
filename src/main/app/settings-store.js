// Settings-Store: Konstruktion mit den Vorgabewerten, die beiden Migrationen
// (Rebranding-Nutzerdaten, altes Single-Window-Schema) und die beiden Einmal-
// Entscheidungen beim Start — Farbschema (4T-000751) und Arbeitsmodus neuer
// Installationen (4T-001881).
//
// Auszug aus main.js, 4T-000998 (Epic 3E-000196). Electron-frei: die beiden
// Verzeichnisse kommen als Argumente herein, damit der Lade-Pfad ohne
// Electron pruefbar bleibt (Muster user-data-migration.js).
//
// Eigener Zustand: keiner. Der Store selbst gehoert main.js; loadStore gibt
// ihn samt dem normalisierten Arbeitsbereichs-Stand zurueck, statt eine
// Modul-Variable eines fremden Moduls zu setzen (Entwicklungsrichtlinien §1).
'use strict';

const {
  migrateUserData,
  PRODUKTIV_PROFIL,
  AUSPRAEGUNG_USER_DATA,
} = require('./user-data-migration.js');
const { migrateWindowsToApps, normalizeSavedWorkspaces } = require('./session-schema');
const { COLOR_SCHEMES_KEY, startupSchemeState } = require('../../shared/color-schemes.js');
const { TOUR_SEEN_KEY } = require('../../shared/erststart.js');
const { EXTENSIONS_DISABLED_KEY } = require('../../shared/extensions/extensions.js');
const { startupDisabledIds } = require('../../shared/extensions/extensions-core.js');

// Nutzerdaten-Migration beim Rebranding (4T-000643): Logik prozess-neutral in
// user-data-migration.js, damit die Unit-Tests denselben Pfad pruefen. Hier nur
// die Bindung an die Electron-Pfade des Aufrufers.
async function migrateSettingsFromPreviousName(dirs) {
  // 4T-001990 (Epic 3E-000188): Im portablen Betrieb gibt es keine Uebernahme,
  // in keinem der beiden Zweige (Entscheidung des Product Owners vom
  // 2026-09-28, Weg A der Vorlage 2). Die portable Fassung liest das
  // Benutzerprofil des Rechners nie — sonst truege sie dessen Zuletzt-Listen
  // auf den Stick und verhielte sich auf jedem Rechner anders. Sie beginnt mit
  // den Voreinstellungen; der Weg der eigenen Einrichtung ist die
  // Austausch-Datei der Einstellungen. Der Ausstieg steht deshalb VOR jedem
  // Aufruf von migrateUserData, das die Quelle schon zum Nachsehen liest.
  if (dirs.portabel) return;
  // 4T-001336 (Epic 3E-000237): In der zweiten Auspraegung ist die Quelle die
  // PRODUKTIVE Einrichtung und der Umfang enger — ohne die Entwuerfe. Die
  // Rebrand-Kette der Vorgaengernamen entfaellt hier bewusst: Sie gehoert der
  // produktiven Auspraegung, die sie fuer sich selbst schon durchlaufen hat.
  if (dirs.auspraegung) {
    await migrateUserData({
      appDataDir: dirs.appDataDir,
      userDataDir: dirs.userDataDir,
      previousNames: [PRODUKTIV_PROFIL],
      items: AUSPRAEGUNG_USER_DATA,
    });
    return;
  }
  await migrateUserData({
    appDataDir: dirs.appDataDir,
    userDataDir: dirs.userDataDir,
  });
}

// 4T-000751 (Epic 3E-000146): Steht noch kein Schema-Zustand im Store, wird er
// hier einmalig geschrieben — bestehende Installationen auf die bisherigen
// Standard-Schemas, frische auf die neue Bernstein-Voreinstellung. Die
// Begruendung samt der Falle, die das unbedingte Schreiben abfaengt, steht
// bei startupSchemeState in shared/color-schemes.js.
//
// Laeuft NACH den beiden Migrationen oben: Ein Bestand mit Alt-Schluesseln
// traegt seine Spuren dann bereits im aktuellen Format.
function applyStartupSchemeState(store) {
  if (!store) return;
  const next = startupSchemeState({
    hasStoredState: store.get(COLOR_SCHEMES_KEY) != null,
    hasUsageTraces: hasStoreUsageTraces(store),
  });
  if (next) store.set(COLOR_SCHEMES_KEY, next);
}

// 4T-001881 (Epic 3E-000185): Start-Modus «Einsteiger» fuer neue
// Installationen (Entscheidung E11 des Product Owners vom 2026-09-22). Steht
// weder ein Schalter-Stand noch der Erststart-Merker der gefuehrten Tour im
// Store, wird der Schalter-Satz des Einsteiger-Modus hier EINMALIG
// geschrieben; jede bestehende Einrichtung bleibt unberuehrt, ihr
// Funktionsumfang aendert sich durch ein Update nicht.
//
// Die Entscheidung selbst liegt als reine Funktion im geteilten Kern
// (startupDisabledIds), hier steht allein die Bindung an den Store — Muster
// applyStartupSchemeState darueber, das dieselbe Bauform fuer das
// Start-Farbschema traegt.
//
// Laeuft NACH den beiden Migrationen: Ein Bestand mit Alt-Schluesseln traegt
// seine Spuren dann bereits im aktuellen Format.
function applyStartupModeState(store) {
  if (!store) return;
  const next = startupDisabledIds({
    hasStoredState: store.get(EXTENSIONS_DISABLED_KEY) != null,
    hasSeenTour: store.get(TOUR_SEEN_KEY) != null,
  });
  if (next) store.set(EXTENSIONS_DISABLED_KEY, next);
}

// Spuren frueherer Nutzung im Store: geoeffnete Dateien, Bereiche, Sitzungen
// und benannte Arbeitsbereiche. Eine frische Installation hat beim ersten
// Start keine davon.
function hasStoreUsageTraces(store) {
  return ['recentFiles', 'recentAreas', 'apps', 'workspaces', 'windows'].some((key) => {
    const value = store.get(key);
    return Array.isArray(value) && value.length > 0;
  });
}

// Migration alter Single-Window-Settings auf die neue Multi-Window-Struktur.
// Wirkt nur, wenn 'windows' noch leer ist und alte Schluessel vorhanden sind.
function migrateLegacySettings(store) {
  if (!store) return;
  const existing = store.get('windows');
  if (Array.isArray(existing) && existing.length > 0) return;

  const legacyPanes = store.get('panes');
  const legacyOpenTabs = store.get('openTabs');
  const legacyBounds = store.get('windowBounds');
  const legacyMaximized = !!store.get('windowMaximized');

  let panes = null;
  if (Array.isArray(legacyPanes) && legacyPanes.length > 0) {
    panes = legacyPanes;
  } else if (Array.isArray(legacyOpenTabs) && legacyOpenTabs.length > 0) {
    panes = [{ paths: legacyOpenTabs, activeIndex: 0, tabSettings: [] }];
  }

  // Wenn weder Bounds noch Panes vorhanden, gibt es nichts zu migrieren.
  if (!panes && !legacyBounds) return;

  store.set('windows', [
    {
      bounds: legacyBounds || null,
      maximized: legacyMaximized,
      panes: panes || [],
    },
  ]);
}

/**
 * Laedt den Settings-Store und fuehrt die faelligen Migrationen aus.
 *
 * @param {object} dirs Verzeichnisse der App.
 * @param {string} dirs.appDataDir Uebergeordnetes Anwendungsdaten-Verzeichnis.
 * @param {string} dirs.userDataDir Nutzerdaten-Verzeichnis dieser App.
 * @param {string|null} [dirs.auspraegung] 4T-001336: Kennzeichnung der zweiten
 *   Auspraegung; gesetzt schaltet sie die Uebernahme auf die produktive
 *   Einrichtung als Quelle um, null bzw. fehlend laesst die Rebrand-Kette laufen.
 * @param {boolean} [dirs.portabel] 4T-001990: true im portablen Betrieb; dann
 *   entfaellt jede Uebernahme aus einem Vorgaenger- oder produktiven Profil.
 * @returns {Promise<{store: object, workspaces: Array}>} Store und der
 *   normalisierte Arbeitsbereichs-Stand; der Aufrufer haelt beide.
 */
async function loadStore(dirs) {
  await migrateSettingsFromPreviousName(dirs);
  // electron-store v10 ist ESM-only, daher dynamic import.
  const { default: Store } = await import('electron-store');
  const store = new Store({
    defaults: {
      restoreSession: true,
      apps: [], // Sitzung ueber logische Applikationen (4T-000320)
      workspaces: [], // benannte Arbeitsbereiche (4T-000537, Epic 3E-000098)
      windows: [], // Legacy: flache Multi-Window-Sitzung (Lese-Fallback)
      recentFiles: [],
      recentAreas: [], // zuletzt geoeffnete Bereiche (4T-000325)
      // 4T-000888 (Epic 3E-000168): zuletzt geoeffnete Buecher und Buecherregale,
      // nach demselben Muster wie die Bereichs-Liste (juengste zuerst,
      // dedupliziert, gekappt auf zehn).
      recentBooks: [],
      recentShelves: [],
      // 4T-001598 (Epic 3E-000191): von Hand gepflegte Liste der eingetragenen
      // Gefaesse (My Extended Memory). Bewusst NEBEN den vier recent-Listen und
      // nicht aus ihnen abgeleitet: jene sind gekappte Verlaeufe, diese ist der
      // Bestand, den der Anwender selbst bestimmt.
      memoryEntries: [],
      // 4T-000751 (Epic 3E-000146): Englisch ist der Auslieferungszustand.
      // conf materialisiert die Defaults schon bei der Store-Konstruktion,
      // deshalb wirkt dieser Wert ausschliesslich fuer frische Staende;
      // bestehende Installationen tragen ihr persistiertes null weiter und
      // leiten unveraendert aus der Windows-Locale ab (Entscheidung des
      // Product Owners vom 2026-07-27: nur frische Installationen).
      language: 'en',
      // 4T-000030: Theme-Vorzug. 'system' folgt der OS-Einstellung
      // (bisheriges Verhalten), 'light'/'dark' erzwingt das jeweilige Theme.
      themePref: 'system',
      // 4T-000207: User-Overrides der Tastenkuerzel als flaches Objekt
      // { commandId: acceleratorString }; leer = ueberall Registry-Defaults.
      hotkeys: {},
      // 4T-000331 (Epic 3E-000060): Dokument-Historie. App-weiter Default ist
      // bewusst aus (PO-Entscheidung vom 2026-07-03); die Zeitparameter der
      // Paket-Bildung in Minuten (max. Paket-Dauer, Inaktivitaets-Schluss).
      historyEnabled: false,
      historyMaxPacketMinutes: 5,
      historyInactivityMinutes: 2,
      // 4T-000346 (Epic 3E-000062): Link-Update beim Umbenennen. Beide Standard-
      // Werte aktiv (PO-Anforderung), per Einstellung im Bereich Verhalten
      // umstellbar.
      renameUpdateLinks: true,
      renameLinkPreview: true,
      // 4T-000369 (Epic 3E-000068): Entwurfs-Zwischenspeicher — nie gespeicherte
      // Unbenannt-Tabs ueberleben das App-Ende. Default an.
      keepUnsavedDrafts: true,
      // Legacy-Defaults bleiben fuer Migration verwertbar:
      openTabs: [],
      panes: null,
      windowBounds: null,
      windowMaximized: false,
    },
  });
  migrateLegacySettings(store);
  // 4T-000320: flaches 'windows'-Format einmalig in das App-Schema ueberfuehren
  // (alle Bestands-Fenster als EINE Applikation); der alte Key bleibt
  // defensiv erhalten, wird aber nicht mehr geschrieben.
  const migratedApps = migrateWindowsToApps(store.get('apps'), store.get('windows'));
  if (migratedApps) store.set('apps', migratedApps);
  // 4T-000537: Arbeitsbereichs-Ablage normalisiert in den In-Memory-Stand laden.
  const workspaces = normalizeSavedWorkspaces(store.get('workspaces'));
  applyStartupSchemeState(store);
  // 4T-001881: Start-Modus neuer Installationen, vor dem ersten Renderer-Start
  // — der Renderer liest den Schalter-Stand beim Aufbau seiner Pipeline.
  applyStartupModeState(store);
  return { store, workspaces };
}

// 4T-001990: migrateSettingsFromPreviousName ist fuer die Unit-Pruefung der
// abgeschalteten Uebernahme mit exportiert; loadStore selbst laedt
// electron-store, das seinerseits Electron importiert.
module.exports = { loadStore, migrateSettingsFromPreviousName };
