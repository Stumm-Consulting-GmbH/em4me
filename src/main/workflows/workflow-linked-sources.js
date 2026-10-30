// 4T-002426 (Epic 3E-000366, Story 4S-001138, Entscheidung 2h): Die Workflows
// der verknüpften Bereiche — welche Quellen zählen, was sie enthalten und ob ein
// Pfad die Definition eines zugestimmten fremden Workflows ist.
//
// **Vorbild sind die Vorlagen verknüpfter Bereiche** (`verknuepfteVorlagenQuellen`
// in `area/area-config.js`, `templates:list` in `ipc/templates.js`):
//   - Eine Quelle ist ein Verknüpfungs-Eintrag mit der Zustimmung `workflows`
//     (streng boolesch, Vorgabe aus; `area-links.js`). Ohne Zustimmung wird der
//     fremde Bereich nicht einmal gelesen.
//   - Der Workflow-Ordner einer Quelle steht in DEREN Bereichsdatei (Sektion
//     `workflows`), nicht in unserer und nicht im anwendungsweiten Wert: Der
//     verknüpfte Bereich bestimmt selbst, wo seine Workflows liegen. Ein
//     Bereich ohne eigene Sektion steuert nichts bei.
//   - Eine nicht lesbare Quelle (getrenntes Laufwerk, defekte Bereichsdatei,
//     fehlender Ordner) entfällt still, weil sie kein Fehler des eigenen
//     Bereichs ist.
//   - Bei ausgeschalteter Erweiterung «Bereichs-Verknüpfungen» gibt es keine
//     Quelle (Lese-Grenze seit 1.149.1, 4T-002069): abgeschaltet wird die
//     Wirkung, nicht die Angabe.
//
// **Was eine Quelle hergibt, ist allein die Definition.** `sourceFor` sagt, ob
// ein Pfad im Workflow-Ordner einer zugestimmten Quelle liegt; der Schritt-Kanal
// darf damit die Workflow-Datei als Definition annehmen. Die Ziele der Schritte
// prüft er davon unberührt gegen die eigene Bereichs-Wurzel (`workflow-area-path.js`),
// und einen Lauf-Stand bekommt ein fremder Workflow nie (Entscheidung 1f).
//
// Gelesen wird je Aufruf frisch (Muster der Vorlagen-Liste); kein eigener Zustand.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const selbstSchreib = require('../documents/self-write');
const { readAreaSettingsRaw } = require('../area/area-migration');
const { isInsideArea } = require('../area/area-path');
const { normalizeAreaLinks } = require('../area/area-links');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { normalizeWorkflowsConfig, readWorkflowFolder } = require('./workflow-folder.js');

const AREA_LINKS_EXTENSION_ID = 'area-links';

/**
 * Baut den Zugang zu den Workflows verknüpfter Bereiche.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (Erweiterungs-Schalter).
 * @param {object} deps.mddStore Container-Format der Bereichsdatei.
 * @param {(p: string) => boolean} [deps.isMarkdownPath] Markdown-Erkennung am Namen.
 * @param {number} [deps.MAX_EMBED_BYTES] Größen-Grenze einer gelesenen Datei.
 * @param {(disabled: *) => boolean} [deps.areaLinksEnabled] Schalter-Abfrage (Prüffälle).
 * @returns {{sources: Function, list: Function, sourceFor: Function, readSettings: Function}}
 */
function createLinkedWorkflowSources(deps) {
  const { getStore, mddStore } = deps;
  const verknuepfungenAn =
    deps.areaLinksEnabled || ((disabled) => isExtensionEnabled(AREA_LINKS_EXTENSION_ID, disabled));

  // Die Sektionen der Bereichsdatei eines Bereichs; undefined bei fehlender oder
  // defekter Datei (Fehler-Regel der übrigen Leser in area-config.js).
  async function readSettings(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fsp.readFile(p, 'utf8'),
      rename: (from, to) => fsp.rename(from, to),
      markSelfWriting: selbstSchreib.merke,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    return parsed.ok ? parsed.container.settings : undefined;
  }

  function erweiterungAn() {
    const store = typeof getStore === 'function' ? getStore() : null;
    return verknuepfungenAn(store ? store.get('extensions.disabled') : null);
  }

  /**
   * Die zugestimmten Quellen eines Bereichs in der Reihenfolge ihrer Einträge.
   *
   * @param {string|null} rootPath Wurzel des eigenen Bereichs.
   * @returns {Promise<{key: string, name: string, folder: string}[]>} `key` ist
   *   das Kürzel der Verknüpfung, `name` der Ordnername des verknüpften Bereichs.
   */
  async function sources(rootPath) {
    if (typeof rootPath !== 'string' || rootPath === '' || !erweiterungAn()) return [];
    let links;
    try {
      const eigene = await readSettings(rootPath);
      links = normalizeAreaLinks(eigene ? eigene.areaLinks : undefined, { selfRoot: rootPath });
    } catch {
      return [];
    }
    const quellen = [];
    for (const link of links) {
      if (!link.workflows) continue;
      let fremde;
      try {
        fremde = await readSettings(link.path);
      } catch {
        continue; // nicht erreichbarer oder defekter Bereich: still übergehen
      }
      const konfig = normalizeWorkflowsConfig(fremde ? fremde.workflows : undefined);
      if (!konfig) continue;
      quellen.push({
        key: link.prefix,
        name: path.basename(link.path),
        folder: path.resolve(link.path, konfig.folder),
      });
    }
    return quellen;
  }

  // Jeder Eintrag des Baums trägt den Schlüssel seiner Quelle (Muster der
  // Vorlagen-Liste): Das Paar aus Quelle und Pfad spricht einen Workflow eindeutig an.
  function markiere(items, quelle) {
    return items.map((item) =>
      item.kind === 'group'
        ? { ...item, items: markiere(item.items || [], quelle) }
        : { ...item, sourceKey: quelle.key, sourceName: quelle.name },
    );
  }

  /**
   * Die Workflows aller zugestimmten Quellen; eine nicht lesbare entfällt still.
   *
   * @param {string|null} rootPath Wurzel des eigenen Bereichs.
   * @returns {Promise<{key: string, name: string, folder: string, items: object[],
   *   workflows: object[]}[]>} je Quelle Baum und flache Liste wie beim eigenen Ordner.
   */
  async function list(rootPath) {
    const ergebnis = [];
    for (const quelle of await sources(rootPath)) {
      let gelesen;
      try {
        gelesen = await readWorkflowFolder(quelle.folder, {
          isMarkdownPath: deps.isMarkdownPath,
          maxBytes: deps.MAX_EMBED_BYTES,
        });
      } catch {
        continue;
      }
      if (gelesen.missing || gelesen.workflows.length === 0) continue;
      ergebnis.push({
        ...quelle,
        items: markiere(gelesen.items, quelle),
        workflows: gelesen.workflows.map((w) => ({
          ...w,
          sourceKey: quelle.key,
          sourceName: quelle.name,
        })),
      });
    }
    return ergebnis;
  }

  /**
   * Die zugestimmte Quelle, in deren Workflow-Ordner ein Pfad liegt.
   *
   * Ein Pfad innerhalb der eigenen Wurzel ist nie fremd, auch wenn ein
   * verknüpfter Bereich darunter läge: Die eigene Grenze geht vor.
   *
   * @param {string|null} rootPath Wurzel des eigenen Bereichs.
   * @param {string} absPath absoluter Pfad einer Workflow-Datei.
   * @returns {Promise<{key: string, name: string, folder: string}|null>}
   */
  async function sourceFor(rootPath, absPath) {
    if (typeof absPath !== 'string' || !path.isAbsolute(absPath)) return null;
    if (typeof rootPath === 'string' && rootPath !== '' && isInsideArea(rootPath, absPath)) {
      return null;
    }
    const ziel = path.resolve(absPath);
    for (const quelle of await sources(rootPath)) {
      // Der Ordner selbst ist keine Workflow-Datei; gefragt ist ein Ort darin.
      if (isInsideArea(quelle.folder, ziel) && !isInsideArea(ziel, quelle.folder)) return quelle;
    }
    return null;
  }

  return { sources, list, sourceFor, readSettings };
}

module.exports = { AREA_LINKS_EXTENSION_ID, createLinkedWorkflowSources };
