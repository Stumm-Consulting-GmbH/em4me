// IPC-Kanal-Gruppe Eigenschafts-Profile: Konfigurations-Stand des Bereichs,
// Schreiben der Profil-Sektion, die aufgeloeste Definitions-Liste einer Datei,
// die Profil-Liste des Einstellungs-Bereichs und die Ordner-Auswahl.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: profiles:*.
//
// Eigener Zustand: der mtime-validierte Katalog-Cache des Profil-Ordners. Er
// gehoert genau hierher, weil ihn allein diese beiden Handler verbrauchen.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('../area/area-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const {
  normalizeProfilesConfig,
  resolveProfileFields,
  attachHeritageHints,
  assignedProfileNames,
  DEFAULT_ASSIGN_FIELD,
} = require('../../shared/property-profiles');
const { injectEventProfile } = require('../../shared/events/events-core.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter');
const { createProfileCatalogCache, loadProfileCatalog } = require('../documents/profile-catalog');
const selbstSchreib = require('../documents/self-write');

// 4T-0447: Profil-Katalog des Profil-Ordners mit mtime-validiertem Cache
// pro Profil-Datei (electron-frei, unit-getestet; fs wird hier gebunden).
const profileCatalogCache = createProfileCatalogCache();
// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Profil-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {object} deps.mddStore Container-Kern der Begleitdateien.
 * @param {Function} deps.readAreaProfilesConfig Profil-Sektion der Bereichsdatei lesen.
 */
function registerProfilesIpc(handle, deps) {
  const {
    dialog,
    senderWindow,
    areaOfWindow,
    tForWindow,
    getStore,
    broadcast,
    mddStore,
    readAreaProfilesConfig,
  } = deps;
  // 4T-0999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  // --- 4T-0446 (Epic 3E-0083): Profil-Konfiguration (propertyProfiles-Sektion) --

  // Konfigurations-Stand des Bereichs, normalisiert. Eigenschafts-Profile
  // existieren nur pro Bereich (Profil-Ordner und Standard-Profil leben in
  // der Bereichsdatei): ohne Bereich liefert der Handler hasArea false und
  // config null; die Aufrufer (Editoren, Einstellungen) fallen dann auf das
  // Verhalten ohne Profile zurück.
  handle('profiles:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaProfilesConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeProfilesConfig(raw),
    };
  });

  // propertyProfiles-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null). Muster journals:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsächlichen Setzen, eine
  // defekte Bereichsdatei wird nie überschrieben. Nach dem Schreiben geht
  // 'profiles:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Editoren und Einstellungs-Bereich nach).
  handle('profiles:setAreaConfig', async (event, config) => {
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
      const normalized = normalizeProfilesConfig(config);
      if (normalized) container.settings.propertyProfiles = normalized;
      else delete container.settings.propertyProfiles;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('profiles:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0447 (Epic 3E-0083): aufgelöste Definitions-Liste für eine Datei —
  // Standard-Profil des Bereichs plus die über das Zuordnungs-Feld
  // zugeordneten Profile (Konflikt-Regeln in resolveProfileFields; Blöcke
  // der Datei erben dieselbe Auflösung). Die Zuordnungs-Werte liefert der
  // Renderer aus dem LIVE-Frontmatter des Tabs (params.assigned — auch
  // ungespeicherte Änderungen am Zuordnungs-Feld wirken sofort); ohne
  // assigned liest der Handler das Frontmatter der Datei von Platte
  // (params.path, harte Bereichs-Grenze). Profil-Änderungen wirken über den
  // mtime-validierten Katalog-Cache ohne Neustart.
  handle('profiles:resolve', async (event, params) => {
    const none = { ok: true, hasConfig: false, assignField: null, fields: [], missing: [] };
    const area = areaOfWindow(senderWindow(event));
    if (!area) return none;
    // 4T-0517: bei aktiver Ereignis-Erweiterung läuft die Auflösung auch
    // ohne konfigurierten Profil-Ordner weiter — das interne Profil
    // „Ereignis" wirkt dann allein, mit dem Default-Zuordnungs-Feld.
    const eventsOn = isExtensionEnabled('events', store ? store.get('extensions.disabled') : []);
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(area.rootPath));
    const folderAbs = config && config.folder ? path.resolve(area.rootPath, config.folder) : null;
    const folderOk = folderAbs !== null && isInsideArea(area.rootPath, folderAbs);
    if (!folderOk && !eventsOn) return none;
    const catalog = folderOk
      ? await loadProfileCatalog({
          folderAbs,
          fsp: fs,
          cache: profileCatalogCache,
        })
      : { profiles: [], missingFolder: false };
    const assignField = config ? config.assignField : DEFAULT_ASSIGN_FIELD;
    let assigned = Array.isArray(params && params.assigned)
      ? params.assigned.filter((s) => typeof s === 'string')
      : null;
    // 4T-0448: die Editoren übergeben das Live-Frontmatter des Tabs; die
    // Auswertung des Zuordnungs-Felds (Feldname aus der Konfiguration)
    // bleibt damit auf einer Seite (Main kennt assignField).
    if (
      assigned === null &&
      params &&
      params.frontmatter &&
      typeof params.frontmatter === 'object'
    ) {
      assigned = assignedProfileNames(params.frontmatter, assignField);
    }
    if (assigned === null) {
      assigned = [];
      const filePath = params && params.path;
      if (typeof filePath === 'string' && filePath) {
        const abs = path.resolve(filePath);
        if (isInsideArea(area.rootPath, abs)) {
          try {
            const raw = await fs.readFile(abs, 'utf8');
            const fm = extractFrontmatter(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
            assigned = assignedProfileNames(fm.data, assignField);
          } catch {
            assigned = [];
          }
        }
      }
    }
    const { fields, missing } = resolveProfileFields(
      injectEventProfile(catalog.profiles, eventsOn),
      {
        defaultProfile: config ? config.defaultProfile : null,
        assigned,
      },
    );
    return {
      ok: true,
      hasConfig: true,
      assignField,
      folderMissing: catalog.missingFolder,
      fields,
      missing,
    };
  });

  // 4T-0450 (Epic 3E-0083): Profil-Liste für den Einstellungs-Bereich —
  // erkannte Profil-Dateien des konfigurierten Ordners mit Definitions-
  // Anzahl und Validierungs-Hinweisen (aus dem Katalog, mtime-frisch).
  // 4T-0517: bei aktiver Ereignis-Erweiterung steht das interne Profil
  // „Ereignis" (datei-los, nicht änderbar) vor den Katalog-Profilen —
  // auch ohne konfigurierten oder bei fehlendem Profil-Ordner.
  handle('profiles:list', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const base = {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      config: null,
      folderMissing: false,
      profiles: [],
    };
    if (!area) return base;
    const eventsOn = isExtensionEnabled('events', store ? store.get('extensions.disabled') : []);
    // 4T-1142: Zyklus- und Fehlt-Hinweise der Vererbung hängen am Profil und
    // entstehen ordnerweit (attachHeritageHints, geteiltes Modul); hier wird
    // nur durchgereicht.
    const rows = (profiles, folderAbs) =>
      attachHeritageHints(injectEventProfile(profiles, eventsOn)).map((p) => ({
        name: p.name,
        fileName: p.fileName,
        path: p.internal ? null : path.join(folderAbs, p.fileName),
        internal: !!p.internal,
        fieldCount: p.fields.length,
        errors: p.errors,
      }));
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(area.rootPath));
    base.config = config;
    if (!config || !config.folder) return { ...base, profiles: rows([], null) };
    const folderAbs = path.resolve(area.rootPath, config.folder);
    if (!isInsideArea(area.rootPath, folderAbs)) {
      return { ...base, folderMissing: true, profiles: rows([], null) };
    }
    const catalog = await loadProfileCatalog({
      folderAbs,
      fsp: fs,
      cache: profileCatalogCache,
    });
    return {
      ...base,
      folderMissing: catalog.missingFolder,
      profiles: rows(catalog.profiles, folderAbs),
    };
  });

  // 4T-0450: Ordner-Auswahl für den Profil-Ordner (der Renderer speichert
  // Auswahlen innerhalb des Bereichs wurzel-relativ, Muster templates).
  handle('profiles:chooseFolder', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'settings.profiles.chooseFolderTitle'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });
}

module.exports = { registerProfilesIpc };
