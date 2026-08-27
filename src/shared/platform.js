// 4T-1203 (Epic 3E-0121): Zentrale Plattform-Eigenschaften des Dateisystems.
//
// EINE Quelle statt verstreuter process.platform-Deutungen: Wer wissen will,
// ob das Dateisystem die Schreibung unterscheidet, fragt hier — Windows und
// macOS (APFS-Standard) tun es nicht, Linux tut es. Bewusst der jeweilige
// Plattform-Standard: Exoten-Konfigurationen (case-sensitives APFS-Volume,
// case-sensitive Windows-Ordner) werden nicht erkannt; dieselbe Vereinfachung
// galt bisher implizit fuer Windows.
//
// Electron-frei und rein (unit-testbar); Tests injizieren die Plattform ueber
// setPlatformForTests (Muster setDwmCallForTests in caption-color.js).
//
// 4T-1225 (Epic 3E-0122, Befund F3 des Linux-Nachweises): Das Modul laeuft
// seither auch im Renderer-Bundle, und der sandboxed Renderer hat KEIN
// `process` — der nackte Zugriff brach dort die gesamte Modul-Initialisierung
// des Bundles (Uncaught ReferenceError beim Start, auf allen Plattformen).
// Die Plattform kommt deshalb kontext-abhaengig: im Node-Kontext (Main,
// Werkzeuge, Unit-Tests) aus process.platform, im Renderer aus der vom
// Preload exponierten Auskunft `api.plattform` (4T-1202).
'use strict';

function ermitteltePlattform() {
  if (typeof process !== 'undefined' && process && process.platform) return process.platform;
  const api = typeof globalThis !== 'undefined' ? globalThis.api : undefined;
  return api && api.plattform ? api.plattform : undefined;
}

let plattform = ermitteltePlattform();

// Unterscheidet das Dateisystem der Plattform die Gross-/Kleinschreibung NICHT?
function isFilesystemCaseInsensitive() {
  return plattform === 'win32' || plattform === 'darwin';
}

// Vergleichs-Schluessel eines Pfades: auf case-insensitiven Dateisystemen
// kleingeschrieben, auf case-sensitiven unveraendert. Fuer Gleichheits- und
// Praefix-Vergleiche sowie Pfad-Schluessel von Caches.
function pathCompareKey(p) {
  const s = String(p);
  return isFilesystemCaseInsensitive() ? s.toLowerCase() : s;
}

// 4T-1225 (Epic 3E-0122): Pfad-Trenner der Plattform. Fuer Code ohne Zugriff
// auf node:path (Renderer); ein hart verdrahteter Backslash liess unter Linux
// zusammengesetzte Pfade wie `/bereich\ordner` entstehen, deren readdir still
// scheiterte (Befund F1 des Linux-Lauffaehigkeits-Nachweises).
function pathSeparator() {
  return plattform === 'win32' ? '\\' : '/';
}

// Nur fuer Tests: Plattform injizieren bzw. mit undefined zuruecksetzen.
function setPlatformForTests(p) {
  plattform = p === undefined ? ermitteltePlattform() : p;
}

module.exports = {
  isFilesystemCaseInsensitive,
  pathCompareKey,
  pathSeparator,
  setPlatformForTests,
};
