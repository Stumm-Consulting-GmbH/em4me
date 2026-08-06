// 4T-0322 (Epic 3E-0058): Pfad-Logik der Bereiche (Ordner inklusive
// Unterordner als Arbeitsraum einer logischen Applikation).
//
// Electron-frei und rein (unit-testbar); alle Bereichs-Grenzen der App
// (Oeffnen-Dialog, Zuletzt-geoeffnet-Filter, Speichern unter, Drag & Drop,
// interne Open-Pfade) laufen ueber DIESE eine Innerhalb-Pruefung, damit die
// harte Grenze ueberall identisch entscheidet.
//
// Windows-Besonderheiten: Pfad-Vergleiche case-insensitiv, Trenner gemischt
// (\ und /), Laufwerksbuchstaben, keine `..`-Ausbrueche (path.resolve
// normalisiert sie weg, bevor verglichen wird).
'use strict';

const path = require('node:path');

// Normalisiert einen Pfad fuer Vergleiche: absolut aufgeloest, ohne
// Trailing-Separatoren, case-insensitiv (Windows-Dateisystem).
function normalizeForCompare(p) {
  if (typeof p !== 'string' || p === '') return null;
  const resolved = path.resolve(p);
  const trimmed = resolved.replace(/[\\/]+$/, '');
  return (trimmed === '' ? resolved : trimmed).toLowerCase();
}

// Zwei Pfade bezeichnen denselben Ort (fuer "derselbe Bereich laeuft schon").
function isSamePath(a, b) {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  return na !== null && na === nb;
}

// Liegt filePath innerhalb des Bereichs rootPath (inklusive Unterordner)?
// Der Wurzelordner selbst zaehlt als innerhalb. Praefix-Nachbarn
// (C:\Notizen2 vs. C:\Notizen) matchen NICHT.
function isInsideArea(rootPath, filePath) {
  const root = normalizeForCompare(rootPath);
  const p = normalizeForCompare(filePath);
  if (root === null || p === null) return false;
  if (p === root) return true;
  return p.startsWith(root + path.sep);
}

// Bereichs-Objekt der App-Registry aus dem Wurzelpfad (Name = Ordnername).
function areaFromRootPath(rootPath) {
  if (typeof rootPath !== 'string' || rootPath === '') return null;
  const resolved = path.resolve(rootPath);
  return { rootPath: resolved, name: path.basename(resolved) };
}

// 4T-0888 (Epic 3E-0168): Pflege einer "Zuletzt geoeffnet"-Liste von
// Ordner-Pfaden (juengste zuerst, dedupliziert ueber Pfad-Gleichheit, auf max
// gekappt). Kern der Bereichs-Liste aus 4T-0325 und seit 4T-0888 zugleich der
// Buch- und der Regal-Liste: die drei Listen unterscheiden sich allein im
// Store-Schluessel, deshalb EIN Aufbau statt dreier gleichlautender.
function updatedRecentPaths(list, dirPath, max = 10) {
  const base = Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p) : [];
  if (typeof dirPath !== 'string' || dirPath === '') return base;
  const resolved = path.resolve(dirPath);
  const filtered = base.filter((p) => !isSamePath(p, resolved));
  filtered.unshift(resolved);
  return filtered.slice(0, max);
}

// 4T-0888: Einzelnen Eintrag austragen — der Weg fuer ein Ziel, das es nicht
// mehr gibt (Klick auf einen Eintrag, dessen Ordner verschwunden ist).
function withoutRecentPath(list, dirPath) {
  const base = Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p) : [];
  if (typeof dirPath !== 'string' || dirPath === '') return base;
  return base.filter((p) => !isSamePath(p, dirPath));
}

// 4T-0325: Liste "Zuletzt geoeffnete Bereiche"; main.js persistiert das
// Ergebnis im Store-Key 'recentAreas'. Seit 4T-0888 nur noch die
// bereichs-benannte Sicht auf updatedRecentPaths (Verhalten unveraendert).
function updatedRecentAreas(list, rootPath, max = 10) {
  return updatedRecentPaths(list, rootPath, max);
}

// 4T-0327: sortiert ein Verzeichnis-Listing fuer das Bereichs-Panel —
// Unterordner und Markdown-Dateien getrennt, locale-bewusst und numerisch
// sortiert. entries: [{ name, isDir }]; isMarkdownName: Praedikat des
// Aufrufers (main.js liefert isMarkdownPath).
function sortedAreaListing(entries, isMarkdownName) {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const dirs = [];
  const files = [];
  for (const e of entries || []) {
    if (!e || typeof e.name !== 'string' || e.name === '') continue;
    if (e.isDir) dirs.push(e.name);
    else if (isMarkdownName(e.name)) files.push(e.name);
  }
  dirs.sort(collator.compare);
  files.sort(collator.compare);
  return { dirs, files };
}

// 4T-0328: validiert und normalisiert den Namen fuer "Neue Datei in diesem
// Ordner": nur ein nackter Dateiname (keine Pfad-Segmente), keine unter
// Windows verbotenen Zeichen; ohne Markdown-Endung wird ".md" ergaenzt.
// Liefert den bereinigten Namen oder null.
function sanitizeNewFileName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return null;
  if (/[\\/<>:"|?*]/.test(trimmed)) return null;
  if (/^\.+$/.test(trimmed)) return null;
  return /\.(md|markdown|mdown|mkd)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

module.exports = {
  normalizeForCompare,
  isSamePath,
  isInsideArea,
  areaFromRootPath,
  updatedRecentPaths,
  withoutRecentPath,
  updatedRecentAreas,
  sortedAreaListing,
  sanitizeNewFileName,
};
