// B-02 (4T-000307, Epic 3E-000048): Containment- und Whitelist-Prüfung für den
// IPC-Handler embed:read. Fremder Markdown-Inhalt gilt als nicht
// vertrauenswürdig (Entwicklungsrichtlinien §6); ohne diese Prüfung konnte
// ein `![[…]]`-Embed per `../`-Kette oder absolutem Pfad beliebige lokale
// Dateien ins Render-DOM einbetten.
//
// Bewusst Electron-frei (nur node:path), damit unit-testbar. Die Größen-
// Grenze bleibt im Handler (fs-Zugriff).
'use strict';

const path = require('node:path');

// Nur die vom Wiki-Embed-Plugin für kind='md' erzeugten Endungen; ohne
// Endung hängt der Plugin bereits '.md' an.
const EMBED_EXT_WHITELIST = new Set(['md', 'markdown', 'mdown', 'mkd']);

// Liefert { ok: true, abs } für einen erlaubten Embed-Pfad, sonst
// { ok: false, error }. Containment-Grenze ist der Ordner-Teilbaum der
// aktiven Datei (Ordner der Datei plus beliebige Unterordner) — das deckt
// sich mit der abwärts-gerichteten Suchraum-Semantik der Wiki-Auflösung und
// sperrt `../`-Ausbrüche nach oben.
function resolveContainedEmbedPath(basePath, embedPath) {
  if (typeof basePath !== 'string' || typeof embedPath !== 'string' || !basePath || !embedPath) {
    return { ok: false, error: 'missing params' };
  }
  const dir = path.dirname(basePath);
  let rel;
  try {
    rel = decodeURI(embedPath);
  } catch {
    return { ok: false, error: 'invalid path' };
  }
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) {
    return { ok: false, error: 'outside document folder' };
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  if (!EMBED_EXT_WHITELIST.has(ext)) {
    return { ok: false, error: 'extension not allowed' };
  }
  return { ok: true, abs };
}

module.exports = { resolveContainedEmbedPath, EMBED_EXT_WHITELIST };
