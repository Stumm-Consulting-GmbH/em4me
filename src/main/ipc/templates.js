// IPC-Kanal-Gruppe Vorlagen: Liste und Inhalt des aufgeloesten Vorlagen-
// Ordners, die Ordner-Regel einer neu angelegten Datei, die Vorlagen-
// Konfiguration (global und je Bereich), die Ordner-Auswahl und die Anlage
// einer Datei aus einer Vorlage.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: templates:*.
//
// Eigener Zustand: keiner; die Aufloesung des Vorlagen-Ordners kommt als Dep,
// die reine Pfad- und Regel-Logik aus dem Vorlagen-Modul.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea, sanitizeNewFileName } = require('../area/area-path');
const {
  normalizeTemplatesConfig,
  resolveTemplateFile,
  templateEntryFromRelPath,
  sortedTemplateEntries,
  matchFolderRule,
} = require('../documents/templates');
const selbstSchreib = require('../documents/self-write');

// 4T-0947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Vorlagen-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 * @param {object} deps.mddStore Container-Kern der Begleitdateien.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {number} deps.MAX_EMBED_BYTES Groessen-Limit fuer gelesenen Markdown-Text.
 * @param {Function} deps.readAreaTemplatesConfig Vorlagen-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.resolveTemplatesForWindow Vorlagen-Ordner eines Fensters aufloesen.
 */
function registerTemplatesIpc(handle, deps) {
  const {
    dialog,
    senderWindow,
    areaOfWindow,
    tForWindow,
    getStore,
    mddStore,
    isMarkdownPath,
    MAX_EMBED_BYTES,
    readAreaTemplatesConfig,
    resolveTemplatesForWindow,
  } = deps;
  // 4T-0999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  // --- 4T-0424 (Epic 3E-0080): Vorlagen-Quellen und Datenpfad -----------------

  // Vorlagen-Liste des aufgeloesten Ordners (Bereich vor global), inklusive
  // Unterordnern. Kein Watcher und kein Cache (Epic-Entscheidung): die Liste
  // wird bei jedem Oeffnen des Auswahl-Popups frisch gelesen. source 'none'
  // bzw. folder null melden dem Renderer den unkonfigurierten Zustand
  // (lokalisierter Hinweis statt leerer Liste); missing = Ordner konfiguriert,
  // aber nicht lesbar. Lese-Fehler einzelner Unterordner werden toleriert
  // (Entwicklungsrichtlinien: Fehler pro Knoten).
  handle('templates:list', async (event) => {
    const resolved = await resolveTemplatesForWindow(senderWindow(event));
    if (!resolved.folder) {
      return { ok: true, source: resolved.source, folder: null, missing: false, templates: [] };
    }
    const entries = [];
    let missing = false;
    const queue = [resolved.folder];
    while (queue.length > 0) {
      const dir = queue.shift();
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        if (dir === resolved.folder) missing = true;
        continue;
      }
      for (const entry of dirents) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          queue.push(full);
        } else if (entry.isFile() && isMarkdownPath(entry.name)) {
          entries.push(templateEntryFromRelPath(path.relative(resolved.folder, full)));
        }
      }
    }
    return {
      ok: true,
      source: resolved.source,
      folder: resolved.folder,
      missing,
      templates: sortedTemplateEntries(entries),
    };
  });

  // Vorlagen-Inhalt lesen. relPath ist der Listen-Eintrag relativ zum
  // Vorlagen-Ordner; die Aufloesung laeuft frisch pro Aufruf und bleibt ueber
  // resolveTemplateFile innerhalb des konfigurierten Ordners (Pfad-
  // Normalisierung gegen '..'-Ausbrueche). BOM-/LF-Normalisierung symmetrisch
  // zu file:read; Groessen-Limit wie embed:read (Vorlagen sind Markdown-Text).
  handle('templates:read', async (event, params) => {
    const resolved = await resolveTemplatesForWindow(senderWindow(event));
    if (!resolved.folder) return { ok: false, error: 'no-folder' };
    const abs = resolveTemplateFile(resolved.folder, params && params.relPath);
    if (!abs) return { ok: false, error: 'outside-folder' };
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_EMBED_BYTES) return { ok: false, error: 'too-large' };
      const raw = await fs.readFile(abs, 'utf8');
      return { ok: true, path: abs, content: raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n') };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0427 (Epic 3E-0080): Ordner-Regel für eine neu angelegte Datei
  // auflösen (tiefster Treffer gewinnt, Vorlagen-Ordner ausgenommen; Kern in
  // src/main/documents/templates.js). Der Renderer ruft das nach jeder Datei-Anlage
  // über die App auf und wendet die gemeldete Vorlage an; extern angelegte
  // Dateien durchlaufen den Trigger nicht (dokumentierte Grenze des Epics).
  handle('templates:ruleFor', async (event, params) => {
    const filePath = params && params.filePath;
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' };
    const resolved = await resolveTemplatesForWindow(senderWindow(event));
    const template = matchFolderRule({
      filePath,
      rules: resolved.rules,
      baseDir: resolved.baseDir,
      templatesFolder: resolved.folder,
    });
    return { ok: true, template };
  });

  // 4T-0428 (Epic 3E-0080): Konfigurations-Stand fuer den Einstellungs-
  // Bereich "Vorlagen": globale Werte (Store) und Bereichs-Sektion
  // (Bereichsdatei), beide normalisiert; hasArea/areaName steuern die
  // Bereichs-Gruppe der UI.
  handle('templates:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const areaConfig = area ? await readAreaTemplatesConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      global: normalizeTemplatesConfig({
        folder: store ? store.get('templates.folder') : null,
        rules: store ? store.get('templates.rules') : null,
      }),
      area: normalizeTemplatesConfig(areaConfig),
    };
  });

  // 4T-0428: templates-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null). Muster history:setAreaDefault: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben.
  handle('templates:setAreaConfig', async (event, config) => {
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
      const normalized = normalizeTemplatesConfig(config);
      if (normalized) container.settings.templates = normalized;
      else delete container.settings.templates;
      if (raw === null && !normalized) {
        return { ok: true }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0428: Ordner-Auswahl fuer den Einstellungs-Bereich (globaler bzw.
  // Bereichs-Vorlagen-Ordner). 4T-0426 (Befund der Release-Test-Iteration):
  // purpose 'target' nutzt denselben Dialog als Zielordner-Fallback von
  // "Neue Datei aus Vorlage" im Fenster ohne Datei-/Bereichs-Kontext.
  handle('templates:chooseFolder', async (event, params) => {
    const owner = senderWindow(event);
    const titleKey =
      params && params.purpose === 'target'
        ? 'templates.newFile.chooseTargetTitle'
        : 'settings.templates.chooseFolderTitle';
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, titleKey),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  // 4T-0426 (Epic 3E-0080): "Neue Datei aus Vorlage" — legt die Datei mit
  // dem bereits gefuellten Vorlagen-Inhalt an (Platzhalter-Dialoge laufen im
  // Renderer VOR der Anlage; Abbruch dort erzeugt keine Datei). Bewusst
  // getrennt von area:createFile: dieser Pfad triggert keine Ordner-Regel
  // (expliziter Vorlagen-Weg hat Vorrang, 4T-0427) und funktioniert auch in
  // Fenstern ohne Bereich (Zielordner = Ordner der aktiven Datei). Mit
  // Bereich gilt die harte Bereichs-Grenze. Namens-Validierung ueber
  // sanitizeNewFileName (die Unterseiten-Form U+2215 passiert sie);
  // bestehende Dateien werden nicht ueberschrieben ('wx').
  handle('templates:createFile', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    const dirPath = params && params.dirPath;
    const fileName = sanitizeNewFileName(params && params.name);
    const content = typeof (params && params.content) === 'string' ? params.content : '';
    if (!fileName) return { ok: false, error: 'invalid name' };
    if (typeof dirPath !== 'string' || !dirPath) return { ok: false, error: 'invalid dir' };
    if (area && !isInsideArea(area.rootPath, dirPath)) return { ok: false, error: 'outside-area' };
    const target = path.join(dirPath, fileName);
    if (area && !isInsideArea(area.rootPath, target)) return { ok: false, error: 'outside-area' };
    try {
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: target };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

module.exports = { registerTemplatesIpc };
