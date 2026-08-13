// IPC-Kanal-Gruppe der bereichsgebundenen Funktionen: Journale samt Existenz-
// Pruefung und Eintrags-Anlage, Kalender-Systeme, Sidebar-Varianten und
// Bereichs-Lesezeichen. Alle vier lesen und schreiben ihre Sektion der
// Bereichsdatei nach demselben Muster.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: journals:*,
// calendar:getConfig/setAreaConfig, sidebarVariants:*, bookmarks:*.
//
// Eigener Zustand: keiner; die Bereichs-Leser kommen als Deps, die
// Normalisierung je Sektion aus den prozess-neutralen Kernen.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('../area/area-path');
const { normalizeJournalsConfig } = require('../../shared/journal-core');
const {
  normalizeCalendarConfig,
  configForPersist,
} = require('../../shared/calendar/calendar-config');
const { normalizeSidebarVariantList } = require('../../shared/sidebar-variants');
const { normalizeBookmarksTree, collectBookmarkFilePaths } = require('../../shared/bookmark-tree');
const selbstSchreib = require('../documents/self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
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

  // --- 4T-0431 (Epic 3E-0081): Journal-Konfiguration (journals-Sektion) -------

  // Konfigurations-Stand des Bereichs, normalisiert. Journale existieren nur
  // pro Bereich (Architekturentscheidung 2 des Epics): ohne Bereich liefert
  // der Handler hasArea false und config null; die Aufrufer (Panel, Kommandos,
  // Einstellungen) zeigen den lokalisierten Hinweis.
  handle('journals:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaJournalsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeJournalsConfig(raw),
    };
  });

  // journals-Sektion der Bereichsdatei schreiben (config = Objekt) bzw.
  // entfernen (config = null). Muster templates:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben. Nach dem Schreiben geht
  // 'journals:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Panel und Kommandos nach).
  handle('journals:setAreaConfig', async (event, config) => {
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
      const normalized = normalizeJournalsConfig(config);
      if (normalized) container.settings.journals = normalized;
      else delete container.settings.journals;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('journals:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0433 (Epic 3E-0081): Existenz eines aufgeloesten Eintrags-Pfads
  // (bereichsrelativ). Die Aufloesung selbst macht der Renderer ueber den
  // Perioden-Kern; hier nur Pfad-Sicherung (harte Bereichs-Grenze) und stat.
  handle('journals:statEntry', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      const stat = await fs.stat(abs);
      return { ok: true, path: abs, exists: stat.isFile() };
    } catch {
      return { ok: true, path: abs, exists: false };
    }
  });

  // 4T-0433: Journal-Eintrag anlegen — Ordner-Kette erzeugen und die Datei
  // mit dem fertig gefuellten Inhalt schreiben (Vorlagen-Dialoge laufen im
  // Renderer VOR der Anlage; Abbruch dort erzeugt keine Datei). 'wx' statt
  // Ueberschreiben: existiert die Datei inzwischen (Race), meldet existed
  // und der Renderer oeffnet nur. Dieser Pfad ist bewusst getrennt von
  // area:createFile und triggert keine Ordner-Regel (die Journal-Vorlage
  // hat Vorrang, Task-Vorgabe Vorrang-Regel).
  handle('journals:createEntry', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    const content = typeof (params && params.content) === 'string' ? params.content : '';
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: abs, existed: false };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: true, path: abs, existed: true };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0434 (Epic 3E-0081): Existenz-Batch fuer die Kalender-Punkte — ein
  // Aufruf pro sichtbarem Monat statt einem stat-IPC pro Tag (begrenzter
  // Scan, Epic-Risiko Performance). Pfad-Sicherung pro Eintrag; unsichere
  // Pfade entfallen still. Kappung als Schutz gegen entartete Aufrufer.
  handle('journals:entriesExist', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPaths = Array.isArray(params && params.relPaths) ? params.relPaths : [];
    const exists = {};
    await Promise.all(
      relPaths.slice(0, 500).map(async (relPath) => {
        if (typeof relPath !== 'string' || !relPath) return;
        const abs = path.resolve(area.rootPath, relPath);
        if (!isInsideArea(area.rootPath, abs)) return;
        try {
          exists[relPath] = (await fs.stat(abs)).isFile();
        } catch {
          exists[relPath] = false;
        }
      }),
    );
    return { ok: true, exists };
  });

  // --- 4T-0543 (Epic 3E-0097): Kalender-Systeme (calendarSystems-Sektion) -----

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
      // 4T-0747: Abgeleitete Zeitrechnungen bleiben in ihrer kurzen Form
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

  // --- 4T-0625 (Epic 3E-0119): Bereichs-Varianten (sidebarLayouts-Sektion) ---

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

  // --- 4T-0611 (Epic 3E-0115): Bereichs-Lesezeichen (bookmarks-Sektion) ------

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
