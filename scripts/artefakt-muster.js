// 4T-1223 (Epic 3E-0122): Artefakt-Namensmuster der Bau- und Archiv-Strecke,
// aus scripts/archive-build.js herausgeschnitten (Datei-Groessen-Budget). Die
// Muster sind eine eigene Fachlichkeit: Sie definieren, welche Dateinamen als
// Release-Artefakt, Release-Hinweis oder temporaerer Bau gelten, unabhaengig
// davon, wer sie auswertet. Die Regel-Herkunft steht bei den Mustern.
'use strict';

// SemVer-Versions-Pattern: Major.Minor.Patch.
const VERSION_RE = /\d+\.\d+\.\d+/;
const PRODUKT_RE = 'EM4me|Perspective Markdown\\+\\+|SCG Markdown|Markdown Viewer';
const EXE_PATTERN = new RegExp(`^(?:${PRODUKT_RE})-(${VERSION_RE.source})-(Setup|Portable)\\.exe$`);
// 4T-1205 (Epic 3E-0121): weitere Artefakt-Formate, vorbereitet fuer die
// Plattform-Epics — Linux (AppImage) und macOS (DMG) ohne Varianten-Zusatz.
// Das Windows-Muster oben bleibt unveraendert (eigene Varianten Setup|Portable).
// 4T-1223 (Epic 3E-0122): deb als zweites Linux-Format (PO-Entscheidung vom
// 2026-08-26), Namensschema wie AppImage ohne Varianten-Zusatz.
const WEITERE_ARTEFAKT_RE = new RegExp(
  `^(?:${PRODUKT_RE})-(${VERSION_RE.source})\\.(?:AppImage|deb|dmg)$`,
);
// Ein Release-Artefakt gleich welcher Plattform; Fanggruppe 1 ist die Version.
function matchArtefakt(name) {
  return name.match(EXE_PATTERN) || name.match(WEITERE_ARTEFAKT_RE);
}
const NOTES_PATTERN = new RegExp(`^release-notes-(${VERSION_RE.source})\\.md$`);
// 4T-0921: Dateiname eines temporaeren Baus zwischen zwei Releases
// (`EM4me-T-0.105.0-202608071130-Portable.exe`). Er wird bewusst NICHT
// archiviert: `releases/` ist das Versions-Archiv der Releases.
// Fanggruppe 1 ist der zwoelfstellige Zeitstempel.
// 4T-1205/4T-1223: dieselbe Format-Erweiterung wie beim Release-Artefakt —
// die Windows-Varianten tragen ihren Zusatz, weitere Formate laufen ohne ihn.
const TEMP_EXE_PATTERN = new RegExp(
  `^(?:${PRODUKT_RE})-T-${VERSION_RE.source}-(\\d{12})(?:-(?:Setup|Portable))?\\.(?:exe|AppImage|deb|dmg)$`,
);
// Dasselbe samt Blockmap-Beigabe der Setup-Datei: die Aufraeum-Menge umfasst
// alles, was ein temporaerer Bau hinterlaesst, die Melde-Menge nur die
// Programmdateien.
const TEMP_ARTEFAKT_PATTERN = new RegExp(
  `^(?:${PRODUKT_RE})-T-${VERSION_RE.source}-(\\d{12})(?:-(?:Setup|Portable))?\\.(?:exe|AppImage|deb|dmg)(?:\\.blockmap)?$`,
);

// Zeitstempel aus dem Dateinamen eines temporaeren Artefakts; '' bei Nicht-Treffer.
function tempStempel(name) {
  return (String(name).match(TEMP_ARTEFAKT_PATTERN) || [])[1] || '';
}

module.exports = {
  VERSION_RE,
  PRODUKT_RE,
  EXE_PATTERN,
  WEITERE_ARTEFAKT_RE,
  matchArtefakt,
  NOTES_PATTERN,
  TEMP_EXE_PATTERN,
  TEMP_ARTEFAKT_PATTERN,
  tempStempel,
};
