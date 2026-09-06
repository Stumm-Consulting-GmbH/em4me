// B-02 (4T-000307, Epic 3E-000048): Containment- und Whitelist-Prüfung für den
// IPC-Handler embed:read. Fremder Markdown-Inhalt gilt als nicht
// vertrauenswürdig (Entwicklungsrichtlinien §6); ohne diese Prüfung konnte
// ein `![[…]]`-Embed per `../`-Kette oder absolutem Pfad beliebige lokale
// Dateien ins Render-DOM einbetten.
//
// Bewusst Electron-frei (nur node:path), damit unit-testbar. Die Größen-
// Grenze bleibt im Handler (fs-Zugriff).
//
// 4T-001485 (Epic 3E-000199): Die Grenze ist seither die BEREICHS-WURZEL,
// nicht mehr der Ordner der einbettenden Datei (Entscheidung E2 des Epics).
// Sie wird übergeben und nicht hier errechnet — die Frage «welcher Bereich
// gilt», kann nur der Aufrufer beantworten, und die Funktion bleibt so für
// sich prüfbar.
'use strict';

const path = require('node:path');
const { isInsideArea } = require('../area/area-path.js');

// Nur die vom Wiki-Embed-Plugin für kind='md' erzeugten Endungen; ohne
// Endung hängt der Plugin bereits '.md' an.
const EMBED_EXT_WHITELIST = new Set(['md', 'markdown', 'mdown', 'mkd']);

// 4T-001486 (Epic 3E-000199, Entscheidung E3): Zulässige Endungen je
// Einbettungs-Art. Sie unterscheiden sich, weil sich unterscheidet, was mit
// dem Ziel geschieht: Ein Bild und ein PDF wandern in das Render-DOM, eine
// sonstige Datei bekommt nur einen Klick-Link — dort beschränkt allein die
// Grenze, nicht die Endung. `null` heisst «keine Endungs-Beschränkung».
//
// Der Bild-Satz ist der des bisherigen synchronen Wegs (P-03, 4T-000176);
// er wandert mit, damit der neue Weg nicht schwächer ist als der alte.
const EMBED_EXT_WHITELISTS = {
  md: EMBED_EXT_WHITELIST,
  image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']),
  pdf: new Set(['pdf']),
  other: null,
};

/**
 * Ermittelt die Containment-Wurzel einer Einbettung.
 *
 * Die Bereichs-Wurzel gilt nur, wenn sie den Ordner der einbettenden Datei
 * TATSAECHLICH enthaelt; ein fensterlokal stehengebliebener Fremd-Bereich
 * weitet die Grenze sonst fuer ein Dokument, das gar nicht in ihm liegt
 * (Schutz aus 4T-000788, hier uebernommen). Ohne Bereich bleibt es beim
 * Ordner der Datei — die engere Grenze von vor 4T-001485.
 *
 * @param {string} dir Ordner der einbettenden Datei.
 * @param {string|null|undefined} areaRoot Wurzel des gebundenen Bereichs.
 * @returns {string} die geltende Grenze.
 */
function containmentWurzel(dir, areaRoot) {
  if (typeof areaRoot === 'string' && areaRoot && isInsideArea(areaRoot, dir)) {
    return path.resolve(areaRoot);
  }
  return dir;
}

// Liefert { ok: true, abs } für einen erlaubten Embed-Pfad, sonst
// { ok: false, error }. Containment-Grenze ist der Teilbaum der
// Bereichs-Wurzel, ersatzweise der des Dokument-Ordners (siehe
// containmentWurzel) — das deckt sich mit der abwärts-gerichteten
// Suchraum-Semantik der Wiki-Auflösung und sperrt `../`-Ausbrüche nach oben.
function resolveContainedEmbedPath(basePath, embedPath, areaRoot, kind = 'md') {
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
  // Aufgeloest wird weiterhin gegen den Ordner der Datei — ein relativer
  // Embed-Pfad meint den Ort neben dem Dokument, nicht den Bereichs-Anfang.
  // Allein die GRENZE ist weiter geworden.
  const abs = path.resolve(dir, rel);
  const wurzel = containmentWurzel(dir, areaRoot);
  if (!isInsideArea(wurzel, abs)) {
    return { ok: false, error: 'outside area root' };
  }
  // 4T-001486: Die Endungs-Pruefung haengt an der Art. Eine unbekannte Art
  // wird wie 'md' behandelt — der engste Satz ist der sichere Rueckfall.
  const whitelist = Object.prototype.hasOwnProperty.call(EMBED_EXT_WHITELISTS, kind)
    ? EMBED_EXT_WHITELISTS[kind]
    : EMBED_EXT_WHITELIST;
  if (whitelist) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (!whitelist.has(ext)) {
      return { ok: false, error: 'extension not allowed' };
    }
  }
  return { ok: true, abs };
}

module.exports = {
  resolveContainedEmbedPath,
  containmentWurzel,
  EMBED_EXT_WHITELIST,
  EMBED_EXT_WHITELISTS,
};
