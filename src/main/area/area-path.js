// 4T-000322 (Epic 3E-000058): Pfad-Logik der Bereiche (Ordner inklusive
// Unterordner als Arbeitsraum einer logischen Applikation).
//
// Electron-frei und rein (unit-testbar); alle Bereichs-Grenzen der App
// (Oeffnen-Dialog, Zuletzt-geoeffnet-Filter, Speichern unter, Drag & Drop,
// interne Open-Pfade) laufen ueber DIESE eine Innerhalb-Pruefung, damit die
// harte Grenze ueberall identisch entscheidet.
//
// Plattform-Besonderheiten: Trenner gemischt (\ und /), Laufwerksbuchstaben,
// keine `..`-Ausbrueche (path.resolve normalisiert sie weg, bevor verglichen
// wird). Ob Vergleiche die Schreibung ignorieren, entscheidet seit 4T-001203
// (Epic 3E-000121) die zentrale Plattform-Eigenschaft in shared/platform.js:
// case-insensitiv auf Windows und macOS, case-sensitiv auf Linux.
'use strict';

const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
// 4T-001731 (Epic 3E-000306): Namens-Pruefung des Kopier-Kandidaten. Dieselbe
// Quelle wie der Umbenennen-Dialog, damit Kopie und Umbenennung denselben
// Massstab an einen Dateinamen legen.
const { basenameValidationError } = require('../../shared/subpages.js');

// Normalisiert einen Pfad fuer Vergleiche: absolut aufgeloest, ohne
// Trailing-Separatoren, Schreibung nach Dateisystem-Eigenschaft (s. Kopf).
function normalizeForCompare(p) {
  if (typeof p !== 'string' || p === '') return null;
  const resolved = path.resolve(p);
  const trimmed = resolved.replace(/[\\/]+$/, '');
  return pathCompareKey(trimmed === '' ? resolved : trimmed);
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

// 4T-000888 (Epic 3E-000168): Pflege einer "Zuletzt geoeffnet"-Liste von
// Ordner-Pfaden (juengste zuerst, dedupliziert ueber Pfad-Gleichheit, auf max
// gekappt). Kern der Bereichs-Liste aus 4T-000325 und seit 4T-000888 zugleich der
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

// 4T-000888: Einzelnen Eintrag austragen — der Weg fuer ein Ziel, das es nicht
// mehr gibt (Klick auf einen Eintrag, dessen Ordner verschwunden ist).
function withoutRecentPath(list, dirPath) {
  const base = Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p) : [];
  if (typeof dirPath !== 'string' || dirPath === '') return base;
  return base.filter((p) => !isSamePath(p, dirPath));
}

// 4T-000325: Liste "Zuletzt geoeffnete Bereiche"; main.js persistiert das
// Ergebnis im Store-Key 'recentAreas'. Seit 4T-000888 nur noch die
// bereichs-benannte Sicht auf updatedRecentPaths (Verhalten unveraendert).
function updatedRecentAreas(list, rootPath, max = 10) {
  return updatedRecentPaths(list, rootPath, max);
}

// 4T-000327: sortiert ein Verzeichnis-Listing fuer das Bereichs-Panel —
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

// 4T-000328: validiert und normalisiert den Namen fuer "Neue Datei in diesem
// Ordner": nur ein nackter Dateiname (keine Pfad-Segmente), keine unter
// Windows verbotenen Zeichen; ohne Markdown-Endung wird ".md" ergaenzt.
// Liefert den bereinigten Namen oder null.
// 4T-001203: Die strenge Windows-Menge gilt bewusst auf ALLEN Plattformen —
// eine unter Linux erlaubte Datei mit ':' waere unter Windows unlesbar, und
// Bereiche sollen plattformuebergreifend austauschbar bleiben.
function sanitizeNewFileName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return null;
  if (/[\\/<>:"|?*]/.test(trimmed)) return null;
  if (/^\.+$/.test(trimmed)) return null;
  return /\.(md|markdown|mdown|mkd)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

// 4T-001349 (Epic 3E-000170): validiert den Namen fuer "Neuer Unterordner in
// diesem Ordner". Dieselben Regeln wie sanitizeNewFileName, ohne die
// Endungs-Ergaenzung — ein Ordner traegt keine Markdown-Endung. Der Aufbau
// folgt bewusst dem Datei-Weg statt einer eigenen Zeichen-Menge, damit Datei
// und Ordner desselben Bereichs nicht nach verschiedenen Massstaeben beurteilt
// werden; die strenge Windows-Menge gilt aus demselben Grund wie oben auf
// ALLEN Plattformen. Liefert den bereinigten Namen oder null.
function sanitizeNewFolderName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return null;
  if (/[\\/<>:"|?*]/.test(trimmed)) return null;
  if (/^\.+$/.test(trimmed)) return null;
  return trimmed;
}

// 4T-001731 (Epic 3E-000306): Namens-Kandidat einer Datei-Kopie —
// "Name.md" + 1 => "Name-1.md". Die Nummer tritt VOR die Endung, weil die
// Endung die Dateiart traegt und eine Kopie dieselbe Art hat.
//
// Die Bildung ist bewusst reines Anhaengen an den GANZEN Stamm und kein
// Hochzaehlen einer schon vorhandenen Endziffer (Entscheidung E1 des Epics,
// offener Punkt "Namensfindung bei bereits nummerierten Vorlagen"): Aus
// "Konzept-1.md" wird "Konzept-1-1.md" und nicht "Konzept-2.md". Andernfalls
// entstuende der falsche Eindruck, die Kopie gehoere zu "Konzept.md" — sie
// gehoert aber zu "Konzept-1.md".
//
// Das Unterseiten-Trennzeichen bleibt unberuehrt: Aus "Prozess∕Konzept.md"
// wird "Prozess∕Konzept-1.md", die Kopie bleibt also Unterseite derselben
// Elternseite. Genau deshalb prueft der Kandidat gegen
// basenameValidationError (Basename-Ebene, Trennzeichen erlaubt) und nicht
// gegen die Segment-Regeln.
//
// Liefert den Dateinamen des Kandidaten oder null, wenn Vorlage oder Kandidat
// als Dateiname nicht brauchbar sind (der Aufrufer meldet das als
// 'invalid name', wie die Anlage-Wege).
function kopierNameKandidat(fileName, nummer) {
  if (typeof fileName !== 'string' || fileName.trim() === '') return null;
  if (!Number.isInteger(nummer) || nummer < 1) return null;
  const parsed = path.parse(fileName);
  if (parsed.dir !== '' || parsed.name === '') return null;
  const stamm = `${parsed.name}-${nummer}`;
  if (basenameValidationError(stamm)) return null;
  return `${stamm}${parsed.ext}`;
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
  sanitizeNewFolderName,
  kopierNameKandidat,
};
