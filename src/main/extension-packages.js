// 4T-0298 (Epic 3E-0053): Erweiterungs-Pakete im Nutzerprofil — Scan,
// Quelltext-Zugriff und Entfernen.
//
// Bewusst OHNE Electron-Import (nur fs/path plus die geteilte Manifest-
// Validierung): main.js reicht das Wurzel-Verzeichnis
// (<userData>/extensions) herein, die Funktionen sind damit ohne
// Electron unit-testbar (Muster src/shared/**).
//
// Sicherheits-Kontrakt (Entwicklungsrichtlinien §6, Whitelist-Muster wie
// help:getManualPage): der Renderer reicht NIE Pfade herein, nur IDs.
// Jeder Pfad entsteht hier aus dem Wurzel-Verzeichnis, dem validierten
// Verzeichnisnamen (kebab-case) und den validierten schlichten
// Dateinamen aus dem Manifest (ENTRY_FILE_RE ohne Pfad-Trenner). IDs,
// die nicht aus dem letzten Scan stammen, werden abgelehnt.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  validateExternalManifest,
  isApiVersionCompatible,
} = require('../shared/extensions-external.js');

// Obergrenze für manifest.json (Schutz vor versehentlich riesigen
// Dateien; reale Manifeste liegen weit darunter).
const MAX_MANIFEST_BYTES = 64 * 1024;
const DIR_NAME_RE = /^[a-z][a-z0-9-]*$/;

// Letzter Scan-Stand je Wurzel-Verzeichnis: id -> { dir, manifest }.
// Grundlage der ID-Whitelist für Quelltext-Zugriff und Entfernen.
const scanCache = new Map();

// Scannt <root>/<id>/manifest.json aller Unterverzeichnisse. Liefert
// Einträge in stabiler Namens-Reihenfolge:
//   { ok:true, dirName, dir, manifest, entryUrl? }
//   { ok:false, dirName, dir, error }
// Ungültige Manifeste werden gelistet (Fehler-Anzeige im Einstellungs-
// Bereich), aber nie geladen. Das Wurzel-Verzeichnis wird bei Bedarf
// angelegt (Zugang „Ordner öffnen" braucht es).
async function scanExtensionsRoot(root) {
  await fs.mkdir(root, { recursive: true });
  const entries = [];
  const cache = new Map();
  const dirents = (await fs.readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const dirent of dirents) {
    const dirName = dirent.name;
    const dir = path.join(root, dirName);
    if (!DIR_NAME_RE.test(dirName)) {
      entries.push({ ok: false, dirName, dir, error: 'Verzeichnisname ist keine gültige ID' });
      continue;
    }
    let manifest;
    try {
      const manifestPath = path.join(dir, 'manifest.json');
      const stat = await fs.stat(manifestPath);
      if (stat.size > MAX_MANIFEST_BYTES) {
        throw new Error('manifest.json überschreitet die Größen-Obergrenze');
      }
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch (err) {
      entries.push({
        ok: false,
        dirName,
        dir,
        error: `manifest.json fehlt oder ist defekt: ${String((err && err.message) || err)}`,
      });
      continue;
    }
    const errors = validateExternalManifest(manifest, dirName);
    // Einstiegs-Dateien müssen existieren (Tippfehler im Manifest sollen
    // beim Scan auffallen, nicht erst beim Laden).
    if (errors.length === 0) {
      for (const field of ['entry', 'markdownPlugin']) {
        if (manifest[field] === undefined) continue;
        try {
          await fs.access(path.join(dir, manifest[field]));
        } catch {
          errors.push(`${field}-Datei fehlt: ${manifest[field]}`);
        }
      }
    }
    if (errors.length > 0) {
      entries.push({ ok: false, dirName, dir, error: errors.join('; ') });
      continue;
    }
    const clean = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      description: typeof manifest.description === 'string' ? manifest.description : '',
      entry: manifest.entry,
      markdownPlugin: manifest.markdownPlugin,
    };
    cache.set(clean.id, { dir, manifest: clean });
    entries.push({
      ok: true,
      dirName,
      dir,
      manifest: clean,
      apiCompatible: isApiVersionCompatible(clean.apiVersion),
      entryUrl: clean.entry ? pathToFileURL(path.join(dir, clean.entry)).href : null,
    });
  }
  scanCache.set(root, cache);
  return entries;
}

function cachedExtension(root, id) {
  const cache = scanCache.get(root);
  return (cache && cache.get(id)) || null;
}

// Quelltext des markdownPlugin einer gescannten Erweiterung (Preload-
// Loader). ID-Whitelist: nur Einträge des letzten Scans.
async function readMarkdownPluginSource(root, id) {
  const cached = cachedExtension(root, id);
  if (!cached || !cached.manifest.markdownPlugin) {
    return { ok: false, error: 'Unbekannte Erweiterung oder kein markdownPlugin' };
  }
  try {
    const source = await fs.readFile(path.join(cached.dir, cached.manifest.markdownPlugin), 'utf8');
    return { ok: true, source, version: cached.manifest.version };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// Anzeige-Daten für die Dialoge des Mains (Warn-/Entfernen-Bestätigung).
function externalExtensionInfo(root, id) {
  const cached = cachedExtension(root, id);
  return cached ? { name: cached.manifest.name, version: cached.manifest.version } : null;
}

// Entfernt das Verzeichnis einer gescannten Erweiterung endgültig.
// Bestätigungs-Dialog verantwortet der Aufrufer (main.js, lokalisiert).
async function removeExtensionDirectory(root, id) {
  const cached = cachedExtension(root, id);
  if (!cached) return false;
  await fs.rm(cached.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  scanCache.get(root)?.delete(id);
  return true;
}

module.exports = {
  scanExtensionsRoot,
  readMarkdownPluginSource,
  externalExtensionInfo,
  removeExtensionDirectory,
};
