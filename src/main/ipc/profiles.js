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
// 4T-1159 (Epic 3E-0219, E13): Schlagwort-Erkennung aus DERSELBEN Quelle wie
// der Bereichs-Index — sonst liefen Index und Zuordnung auseinander.
const { TAG_RE, isValidTag } = require('../index/parse');
const { createProfileCatalogCache, loadProfileCatalog } = require('../documents/profile-catalog');
const selbstSchreib = require('../documents/self-write');

// 4T-0447: Profil-Katalog des Profil-Ordners mit mtime-validiertem Cache
// pro Profil-Datei (electron-frei, unit-getestet; fs wird hier gebunden).
const profileCatalogCache = createProfileCatalogCache();
// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

// 4T-1159 (Epic 3E-0219, E13): Schlagworte eines Dokuments aus seinem Text.
//
// **Frontmatter- UND Inline-Schlagworte** (PO-Entscheidung vom 2026-08-23):
// Der Bereichs-Index führt beide in einem Satz, und für den Anwender ist ein
// Schlagwort ein Schlagwort — eine Trennung im Profil-Modell wäre eine
// Sonderregel, die man erklären müsste.
//
// Gelesen wird aus dem **Live-Inhalt** des Tabs, so wie das Zuordnungs-Feld:
// Das hält die bestehende Zusage, dass auch eine ungespeicherte Änderung
// sofort wirkt. Der Index käme hier zu spät.
function schlagworteAus(text, frontmatterDaten) {
  const treffer = new Set();
  // Frontmatter: der Schlüssel `tags`, Skalar oder Liste.
  if (frontmatterDaten && typeof frontmatterDaten === 'object') {
    for (const key of Object.keys(frontmatterDaten)) {
      if (key.toLowerCase() !== 'tags') continue;
      const wert = frontmatterDaten[key];
      for (const eintrag of Array.isArray(wert) ? wert : [wert]) {
        if (typeof eintrag !== 'string') continue;
        const tag = eintrag.trim().replace(/^#/, '');
        if (tag !== '') treffer.add(tag);
      }
    }
  }
  // Inline: dasselbe Muster und dieselbe Gültigkeits-Prüfung wie im Index.
  if (typeof text === 'string' && text !== '') {
    const body = extractFrontmatter(text).body;
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(body)) !== null) {
      if (isValidTag(m[1])) treffer.add(m[1]);
    }
  }
  return [...treffer];
}

// 4T-1159: Bereichs-relativer Ordner eines Dokuments, mit "/" normalisiert;
// "" für eine Datei direkt in der Bereichs-Wurzel. null, wenn der Pfad
// fehlt oder ausserhalb des Bereichs liegt (harte Grenze wie überall).
function ordnerVon(areaRoot, filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const abs = path.resolve(filePath);
  if (!isInsideArea(areaRoot, abs)) return null;
  const rel = path.relative(areaRoot, path.dirname(abs));
  if (rel === '' || rel === '.') return '';
  return rel.split(path.sep).join('/');
}

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
    // 4T-1156: Index-Sichten für die Ziel-Liste der Verweis-Felder.
    backlinks,
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
    const none = {
      ok: true,
      hasConfig: false,
      assignField: null,
      fields: [],
      missing: [],
      leading: null,
      // 4T-1171 (Epic 3E-0220): Ohne Konfiguration gibt es keine Kette.
      chain: [],
    };
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
          // 4T-1157: Werte-Notizen liegen bereichs-relativ, nicht im Profil-Ordner.
          areaRoot: area.rootPath,
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
    // 4T-1159 (E13): die beiden neuen Eingangsgrössen der Folge. Schlagworte
    // aus dem Live-Text (params.text, vom Renderer), Ordner aus dem Pfad;
    // ohne Bindungen kostet beides nichts, weil gebundeneProfile dann sofort
    // eine leere Liste liefert.
    const bindings = config && Array.isArray(config.bindings) ? config.bindings : [];
    const tags =
      bindings.length > 0
        ? schlagworteAus(params && params.text, params && params.frontmatter)
        : [];
    const folder = bindings.length > 0 ? ordnerVon(area.rootPath, params && params.path) : null;
    const { fields, missing, leading, chain } = resolveProfileFields(
      injectEventProfile(catalog.profiles, eventsOn),
      {
        defaultProfile: config ? config.defaultProfile : null,
        assigned,
        bindings,
        tags,
        folder,
      },
    );
    return {
      ok: true,
      hasConfig: true,
      assignField,
      folderMissing: catalog.missingFolder,
      fields,
      missing,
      // 4T-1161 (E5): das zuerst aufgelöste Profil für das Symbol am Dokument.
      leading,
      // 4T-1171 (Epic 3E-0220): die geordnete Kette der beteiligten Profile.
      // Sie endet sonst an der Prozess-Grenze, und das Feld-Formular der
      // Stufe 3 sitzt auf der anderen Seite.
      chain,
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
      areaRoot: area.rootPath,
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

  // 4T-1156 (Epic 3E-0219): Ziel-Liste eines Verweis-Feldes. Der Renderer
  // reicht die typ-eigenen Angaben des Feldes durch (`restrictTo`, `display`,
  // `sort`); angewandt werden sie im Main, wo der Index liegt — die volle
  // Liste zu übertragen, nur um sie im Renderer zu filtern, widerspräche dem
  // Leitsatz aus Konzept 6.11.
  //
  // Zwei Ausgänge dienen zugleich der Existenz-Prüfung des Bedienelements:
  // Ein Wert, dessen Name nicht in der Liste steht, zeigt auf kein
  // vorhandenes Ziel. `status` unterscheidet dabei «noch nicht indexiert» von
  // «keine Ziele» — ohne ihn meldete ein laufender Index-Aufbau jedes Ziel
  // als fehlend.
  handle('profiles:linkTargets', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: true, status: 'unavailable', targets: [] };
    // Ohne die Erweiterung gibt es keine Profile und damit keine
    // Verweis-Felder (Erweiterungs-Gate, Konzept 6.17).
    if (!isExtensionEnabled('property-profiles', store ? store.get('extensions.disabled') : [])) {
      return { ok: true, status: 'unavailable', targets: [] };
    }
    const filePath = params && typeof params.path === 'string' ? params.path : null;
    if (!filePath) return { ok: true, status: 'unavailable', targets: [] };
    const abs = path.resolve(filePath);
    if (!isInsideArea(area.rootPath, abs)) {
      return { ok: true, status: 'unavailable', targets: [] };
    }
    // Wie bei den übrigen Bedarfs-Sichten: Der Index wird bei Bedarf
    // aufgebaut, die Sicht selbst scannt nicht.
    backlinks.ensureIndexForDemand(abs, `${event.sender.id}:demand`, area.rootPath);
    const optionen = (params && params.options) || {};
    const { status, targets } = backlinks.verweisZiele(abs, area.rootPath, optionen);
    return { ok: true, status, targets };
  });

  // 4T-1158 (Epic 3E-0219, E12): Wertevorrat eines Feldes aus seiner
  // Abfrage-Quelle. Ein eigener Kanal und nicht Teil von `profiles:resolve`,
  // weil genau darin die Zusage «auf Verlangen» steckt: Die Auflösung bleibt
  // so billig wie bisher, und gerechnet wird erst, wenn ein Bedienelement den
  // Vorrat wirklich braucht.
  handle('profiles:fieldValues', async (event, params) => {
    const leer = { ok: true, status: 'unavailable', values: [] };
    const area = areaOfWindow(senderWindow(event));
    if (!area) return leer;
    if (!isExtensionEnabled('property-profiles', store ? store.get('extensions.disabled') : [])) {
      return leer;
    }
    const filePath = params && typeof params.path === 'string' ? params.path : null;
    const query = params && typeof params.query === 'string' ? params.query : null;
    if (!filePath || !query) return leer;
    const abs = path.resolve(filePath);
    if (!isInsideArea(area.rootPath, abs)) return leer;
    backlinks.ensureIndexForDemand(abs, `${event.sender.id}:demand`, area.rootPath);
    const { status, values } = backlinks.werteAusAbfrage(abs, area.rootPath, query);
    return { ok: true, status, values };
  });

  // 4T-1184 (Epic 3E-0221, E1): Treffer eines Lookup-Feldes — die Dokumente,
  // die über ein benanntes Feld auf das eigene verweisen. Eigener Kanal neben
  // `profiles:fieldValues` und aus demselben Grund: Genau darin steckt die
  // Zusage «auf Verlangen». Die Auflösung eines Profils bleibt so billig wie
  // bisher, und gerechnet wird erst, wenn ein Bedienelement den Wert wirklich
  // anzeigt.
  handle('profiles:lookup', async (event, params) => {
    const leer = { ok: true, status: 'unavailable', values: [] };
    const area = areaOfWindow(senderWindow(event));
    if (!area) return leer;
    if (!isExtensionEnabled('property-profiles', store ? store.get('extensions.disabled') : [])) {
      return leer;
    }
    const filePath = params && typeof params.path === 'string' ? params.path : null;
    const optionen = (params && params.options) || {};
    if (!filePath || typeof optionen.relatedField !== 'string') return leer;
    const abs = path.resolve(filePath);
    if (!isInsideArea(area.rootPath, abs)) return leer;
    backlinks.ensureIndexForDemand(abs, `${event.sender.id}:demand`, area.rootPath);
    const { status, values } = backlinks.lookupTreffer(abs, area.rootPath, optionen);
    return { ok: true, status, values };
  });
}

module.exports = { registerProfilesIpc };
