// 4T-0447 (Epic 3E-0083): Profil-Katalog — liest die Profil-Dateien des
// konfigurierten Profil-Ordners (flacher Scan, Profile liegen direkt im
// Ordner) und parst ihre Feld-Definitionen aus dem Frontmatter.
//
// Cache pro Profil-Datei mit mtime+size-Revalidierung bei jedem Zugriff:
// Änderungen an Profil-Dateien wirken ohne Neustart (Akzeptanzkriterium
// des Tasks), auch externe Edits ohne Watcher-Kopplung — der stat-Abgleich
// ist die strengere Form der im Task skizzierten Broadcast-Invalidierung
// (Muster des Warmstart-Abgleichs im Bereichs-Index-Cache). Nur veränderte
// Dateien werden erneut gelesen und geparst; verschwundene Dateien werden
// aus dem Cache geräumt.
//
// Electron-frei, Dateizugriff injiziert (Vorbild templates.js/entriesInRange):
// main.js bindet fs/promises, die Tests ein Fake-Dateisystem.
'use strict';

const path = require('node:path');
const { extractFrontmatter } = require('../shared/markdown/frontmatter');
const { parseProfileFields } = require('../shared/property-profiles');

// Eigener Cache pro Aufrufer (main.js hält einen prozessweiten; Tests je
// einen frischen). Map absPath(lowercase) -> { mtimeMs, size, fields, errors }.
function createProfileCatalogCache() {
  return new Map();
}

// Katalog des Profil-Ordners: { missingFolder, profiles }. profiles sind
// alphabetisch sortierte Einträge { name, fileName, fields, errors };
// name = Datei-Titel (Dateiname ohne .md), die Identität der Zuordnung.
// Ein YAML-Fehler im Frontmatter einer Profil-Datei setzt nur dieses
// Profil auf null Definitionen (Hinweis-Code 'yaml'); unlesbare Einzel-
// Dateien entfallen still (Fehler-Isolation pro Datei).
async function loadProfileCatalog({ folderAbs, fsp, cache }) {
  let dirents;
  try {
    dirents = await fsp.readdir(folderAbs, { withFileTypes: true });
  } catch {
    return { missingFolder: true, profiles: [] };
  }
  const profiles = [];
  const alive = new Set();
  for (const entry of dirents) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
    const abs = path.join(folderAbs, entry.name);
    const cacheKey = abs.toLowerCase();
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      continue;
    }
    alive.add(cacheKey);
    let parsed = cache.get(cacheKey);
    if (!parsed || parsed.mtimeMs !== stat.mtimeMs || parsed.size !== stat.size) {
      let raw;
      try {
        raw = await fsp.readFile(abs, 'utf8');
      } catch {
        cache.delete(cacheKey);
        alive.delete(cacheKey);
        continue;
      }
      // BOM strippen wie file:read/templates:read (die Frontmatter-
      // Erkennung erwartet '---' ab Byte 0).
      const fm = extractFrontmatter(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
      const { fields, errors } = parseProfileFields(fm.data);
      if (fm.parseError) errors.unshift({ code: 'yaml', index: -1, name: null });
      parsed = { mtimeMs: stat.mtimeMs, size: stat.size, fields, errors };
      cache.set(cacheKey, parsed);
    }
    profiles.push({
      name: entry.name.replace(/\.md$/i, ''),
      fileName: entry.name,
      fields: parsed.fields,
      errors: parsed.errors,
    });
  }
  // Cache-Einträge verschwundener Dateien räumen (nur die dieses Ordners —
  // der Cache wird prozessweit über Bereiche hinweg geteilt).
  const prefix = folderAbs.toLowerCase() + path.sep;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix) && !alive.has(key)) cache.delete(key);
  }
  profiles.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
  return { missingFolder: false, profiles };
}

module.exports = { createProfileCatalogCache, loadProfileCatalog };
