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
'use strict';

let plattform = process.platform;

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

// Nur fuer Tests: Plattform injizieren bzw. mit undefined zuruecksetzen.
function setPlatformForTests(p) {
  plattform = p === undefined ? process.platform : p;
}

module.exports = { isFilesystemCaseInsensitive, pathCompareKey, setPlatformForTests };
