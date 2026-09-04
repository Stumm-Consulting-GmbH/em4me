// IPC-Kanal-Gruppe der bereichsgebundenen Funktionen: Journale samt Existenz-
// Pruefung und Eintrags-Anlage, Kalender-Systeme, Sidebar-Varianten und
// Bereichs-Lesezeichen. Alle vier lesen und schreiben ihre Sektion der
// Bereichsdatei nach demselben Muster.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: journals:*,
// calendar:getConfig/setAreaConfig, sidebarVariants:*, bookmarks:*.
//
// Eigener Zustand: keiner; die Bereichs-Leser kommen als Deps, die
// Normalisierung je Sektion aus den prozess-neutralen Kernen.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('../area/area-path');
// 4T-001407 (Epic 3E-000244): die Journal-Kanaele liegen seit dem Schnitt hier.
const { registerJournalIpc } = require('./area-journals');
const {
  normalizeCalendarConfig,
  configForPersist,
} = require('../../shared/calendar/calendar-config');
const { normalizeSidebarVariantList } = require('../../shared/sidebar-variants');
const { normalizeBookmarksTree, collectBookmarkFilePaths } = require('../../shared/bookmark-tree');
const selbstSchreib = require('../documents/self-write');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Kanaele der bereichsgebundenen Funktionen.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {object} deps.mddStore Container-Kern der Begleitdateien.
 * @param {Function} deps.readAreaJournalsConfig Journal-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.readAreaCalendarConfig Kalender-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.readAreaSidebarVariantsConfig Varianten-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.readAreaBookmarksConfig Lesezeichen-Sektion der Bereichsdatei lesen.
 */
function registerAreaFeaturesIpc(handle, deps) {
  const {
    senderWindow,
    areaOfWindow,
    broadcast,
    mddStore,
    readAreaJournalsConfig,
    readAreaCalendarConfig,
    readAreaSidebarVariantsConfig,
    readAreaBookmarksConfig,
  } = deps;

  // 4T-001407 (Epic 3E-000244): Journal-Kanaele aus dem Nachbar-Modul; die
  // Abhaengigkeiten gehen unveraendert weiter.
  registerJournalIpc(handle, {
    senderWindow,
    areaOfWindow,
    broadcast,
    mddStore,
    readAreaJournalsConfig,
  });

  // --- 4T-000543 (Epic 3E-000097): Kalender-Systeme (calendarSystems-Sektion) -----

  // Konfigurations-Stand des Bereichs, normalisiert. Kalender-Systeme gelten
  // nur pro Bereich (Architekturentscheidung 4 des Epics, Journal-Muster):
  // ohne Bereich liefert der Handler hasArea false und config null; die
  // Aufrufer (Einstellungen, Picker, Wert-Syntax) deaktivieren sich dann.
  handle('calendar:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaCalendarConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeCalendarConfig(raw),
    };
  });

  // calendarSystems-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null). Muster journals:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben. Nach dem Schreiben geht
  // 'calendar:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Einstellungs-Sektion und Dokument-Werte nach).
  handle('calendar:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeCalendarConfig(config);
      // 4T-000747: Abgeleitete Zeitrechnungen bleiben in ihrer kurzen Form
      // erhalten; die aufgeloeste Abschrift wuerde die Verbindung zum Bezug
      // kappen. Eigenstaendige Kalender werden weiter normalisiert abgelegt.
      const persistable = configForPersist(config, normalized);
      if (persistable) container.settings.calendarSystems = persistable;
      else delete container.settings.calendarSystems;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('calendar:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-000625 (Epic 3E-000119): Bereichs-Varianten (sidebarLayouts-Sektion) ---

  // Varianten-Liste des Bereichs, normalisiert. Ohne Bereich liefert der
  // Handler hasArea false und eine leere Liste; die Bereichs-Gruppe der
  // Verwaltung und des Menüs entfällt dann.
  handle('sidebarVariants:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaSidebarVariantsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeSidebarVariantList(raw),
    };
  });

  // sidebarLayouts-Sektion der Bereichsdatei schreiben (config = Liste)
  // bzw. bei leerer Liste entfernen. Muster profiles:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsächlichen Setzen, eine
  // defekte Bereichsdatei wird nie überschrieben, fremde Sektionen bleiben
  // erhalten. Nach dem Schreiben geht 'sidebarVariants:changed' an alle
  // Fenster (Payload rootPath; die Renderer desselben Bereichs ziehen
  // Verwaltung und Menü nach).
  handle('sidebarVariants:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeSidebarVariantList(config);
      if (normalized.length > 0) container.settings.sidebarLayouts = normalized;
      else delete container.settings.sidebarLayouts;
      if (raw === null && normalized.length === 0) {
        return { ok: true, config: [] }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('sidebarVariants:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-000611 (Epic 3E-000115): Bereichs-Lesezeichen (bookmarks-Sektion) ------

  // Lesezeichen-Baum des Bereichs, sanitisiert. Ohne Bereich liefert der
  // Handler hasArea false und eine leere Liste; das Panel zeigt dann nur die
  // globalen Lesezeichen (Sichtbarkeits-Regel des Epics). Datei-Ziele sind
  // wurzel-relativ und werden beim Oeffnen gegen die aktuelle Wurzel aufgeloest.
  handle('bookmarks:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaBookmarksConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeBookmarksTree(raw),
    };
  });

  // bookmarks-Sektion der Bereichsdatei schreiben (config = Knoten-Liste) bzw.
  // bei leerer Liste entfernen. Muster sidebarVariants:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine defekte
  // Bereichsdatei wird nie ueberschrieben, fremde Sektionen bleiben erhalten.
  // Grenz-Regel (harte Bereichs-Grenze): jeder Datei-Knoten muss innerhalb der
  // Bereichs-Wurzel liegen. Die Roh-Ziele werden gegen die Wurzel aufgeloest
  // und ueber isInsideArea geprueft; ein Ziel ausserhalb (auch ein
  // ausbrechendes '../x') bricht die Relativitaet des Bereichs-Baums und lehnt
  // den GANZEN Schreibvorgang ab (Fehler-Kennung 'outside-area', kein stilles
  // Verwerfen einzelner Knoten). Nach dem Schreiben geht 'bookmarks:changed' an
  // alle Fenster (Payload rootPath; die Renderer desselben Bereichs ziehen das
  // Panel nach).
  handle('bookmarks:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    for (const rel of collectBookmarkFilePaths(config)) {
      const abs = path.resolve(area.rootPath, rel);
      if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    }
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeBookmarksTree(config);
      if (normalized.length > 0) container.settings.bookmarks = normalized;
      else delete container.settings.bookmarks;
      if (raw === null && normalized.length === 0) {
        return { ok: true, config: [] }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('bookmarks:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

module.exports = { registerAreaFeaturesIpc };
