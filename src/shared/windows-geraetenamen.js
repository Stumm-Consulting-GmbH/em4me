// Review-Befund Z2 vom 2026-11-22 (Epic 3E-000416): Heimat der Erkennung
// reservierter Gerätenamen von Windows, nach der Regel «Erkennungen haben eine
// Heimat» (Entwicklungsrichtlinien, Kapitel 6). Drei Leser: die Prüf-Funktion
// der Grenze (`src/main/grants/path-check.js`), die Gültigkeits-Regel der
// Sperr-Ordner von Datenbanken (`src/shared/database/lock-folder-name.js`) und
// seit dem 2026-11-25 die Prüfung des Grundnamens geteilter Dokumente
// (`src/shared/document-parts.js`, `isBlankPartBase`).
//
// **Belegt sind die Namen mit wie ohne Endung**, auch mit Leerzeichen vor der
// Endung: `CON`, `CON.txt` und `CON .txt` meinen dasselbe Gerät. Über die
// klassische Liste (`CON`, `PRN`, `AUX`, `NUL`, `COM1` bis `COM9`, `LPT1` bis
// `LPT9`) hinaus nimmt die Regel `COM0` und `LPT0`, die hochgestellten Ziffern
// ¹²³ und die Konsolen-Geräte `CLOCK$`, `CONIN$` und `CONOUT$`, weil eine
// Prüfung an der Grenze im Zweifel abweist (4T-002647).
//
// Electron-frei; eigener Zustand: keiner.
'use strict';

const WINDOWS_DEVICE_NAME_RE =
  /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³]) *(\..*)?$/i;

/**
 * Ist ein Namens-Teil unter Windows ein reservierter Gerätename?
 *
 * @param {string} segment Ein Namens-Teil ohne Trenner.
 * @returns {boolean}
 */
function isWindowsDeviceName(segment) {
  return typeof segment === 'string' && WINDOWS_DEVICE_NAME_RE.test(segment);
}

module.exports = { WINDOWS_DEVICE_NAME_RE, isWindowsDeviceName };
