// 4T-002387 (Epic 3E-000265, Schritt 4, Entscheidung F5 A): Die Profil-Felder
// eines Dokuments im Haupt-Prozess, ohne Fenster und ohne Live-Inhalt eines
// Tabs.
//
// **Wozu.** Die Konsistenz-Prüfung meldet eine Karteikarte, an der ein
// Eigenschafts-Profil ein Feld gleichen Namens mit einem anderen Typ als die
// Tabelle führt. Dafür braucht sie die Profil-Felder, die für das Dokument
// gelten, und zwar auf demselben Weg wie der Kanal `profiles:resolve`
// (`src/main/ipc/profiles.js`): Profil-Konfiguration des Bereichs, Katalog des
// Profil-Ordners, internes Profil «Ereignis» bei eingeschalteter Erweiterung,
// Zuordnungs-Feld, Bindungen über Schlagworte und Ordner, und zuletzt
// `resolveProfileFields`. Der Unterschied liegt allein in der Quelle des
// Dokuments: Der Kanal liest den Live-Inhalt des Tabs, die Prüfung die Datei.
//
// **Die beiden Helfer** `schlagworteAus` und `ordnerVon` standen bis Schnitt C
// in `profiles.js` und sind unverändert hierher gezogen; der Kanal lädt sie von
// hier, damit beide Wege dieselbe Schlagwort- und Ordner-Regel haben.
//
// Electron-frei; gelesen wird über den hereingereichten Dateizugriff.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('../area/area-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const {
  normalizeProfilesConfig,
  resolveProfileFields,
  assignedProfileNames,
  DEFAULT_ASSIGN_FIELD,
} = require('../../shared/property-profiles');
const { injectEventProfile } = require('../../shared/events/events-core.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter');
// 4T-001159 (Epic 3E-000219, E13): Schlagwort-Erkennung aus DERSELBEN Quelle wie
// der Bereichs-Index — sonst liefen Index und Zuordnung auseinander.
const { TAG_RE, isValidTag } = require('../index/parse');
const { createProfileCatalogCache, loadProfileCatalog } = require('./profile-catalog');

// 4T-001159 (Epic 3E-000219, E13): Schlagworte eines Dokuments aus seinem Text.
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

// 4T-001159: Bereichs-relativer Ordner eines Dokuments, mit "/" normalisiert;
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
 * Erzeugt den Zugang zu den Profil-Feldern der Dokumente eines Bereichs.
 *
 * @param {object} p Parameter.
 * @param {(rootPath: string) => Promise<object|null>} p.readAreaProfilesConfig
 *   Profil-Sektion der Bereichsdatei lesen (aus der Verdrahtung).
 * @param {() => object|null} [p.getStore] Einstellungs-Speicher, für den
 *   Schalter der Erweiterung «Ereignisse».
 * @param {object} [p.fsp] Dateizugriff für den Katalog (`readdir`, `stat`, `readFile`).
 * @param {object} [p.cache] Katalog-Zwischenspeicher (`createProfileCatalogCache`).
 * @returns {(bereichsWurzel: string) => Promise<((pfad: string, frontmatter: object|null,
 *   text: string|null) => Array<object>)|null>} Je Prüflauf einmal aufgerufen;
 *   liefert null, wenn im Bereich keine Profile wirken, sonst eine Funktion,
 *   die je Dokument die Felder aus `resolveProfileFields` liefert.
 */
function erzeugeProfilFelderZugang({
  readAreaProfilesConfig,
  getStore = null,
  fsp = fs,
  cache = createProfileCatalogCache(),
}) {
  return async function profilFelderFuer(bereichsWurzel) {
    if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') return null;
    const store = typeof getStore === 'function' ? getStore() : null;
    const eventsOn = isExtensionEnabled('events', store ? store.get('extensions.disabled') : []);
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(bereichsWurzel));
    const folderAbs = config && config.folder ? path.resolve(bereichsWurzel, config.folder) : null;
    const folderOk = folderAbs !== null && isInsideArea(bereichsWurzel, folderAbs);
    if (!folderOk && !eventsOn) return null;
    const catalog = folderOk
      ? await loadProfileCatalog({ folderAbs, fsp, cache, areaRoot: bereichsWurzel })
      : { profiles: [] };
    const profiles = injectEventProfile(catalog.profiles, eventsOn);
    const assignField = config ? config.assignField : DEFAULT_ASSIGN_FIELD;
    const defaultProfile = config ? config.defaultProfile : null;
    const bindings = config && Array.isArray(config.bindings) ? config.bindings : [];
    return (pfad, frontmatter, text) =>
      resolveProfileFields(profiles, {
        defaultProfile,
        assigned: assignedProfileNames(frontmatter, assignField),
        bindings,
        tags: bindings.length > 0 ? schlagworteAus(text, frontmatter) : [],
        folder: bindings.length > 0 ? ordnerVon(bereichsWurzel, pfad) : null,
      }).fields;
  };
}

module.exports = { schlagworteAus, ordnerVon, erzeugeProfilFelderZugang };
