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

// 4T-1318: Die freigegebenen Plattformen und der Artefaktsatz, den eine Version
// von ihnen tragen muss. Die Muster oben sagen, WELCHE Namen ein Artefakt sein
// KANN; diese Menge sagt, welche eine Version HABEN MUSS — die Frage, die von
// 1.121.0 bis 1.121.3 unbeantwortet blieb und ein Release mit halbem
// Artefaktsatz moeglich machte.
//
// Herkunft: test/README.md, Abschnitt «Pruef-Umfang je Plattform» (Festlegung
// des Product Owners vom 2026-08-28). Eine Plattform tritt mit ihrer ERSTEN
// AUSLIEFERUNG ein und mit ihrer Zurueckstellung aus, beides auf seine
// Entscheidung. `seit` traegt deshalb die Version des Eintritts: Aeltere
// Releases bleiben regelkonform, ohne dass die Historie umgeschrieben wird.
// macOS ist zurueckgestellt und steht bewusst NICHT in der Liste.
//
// Die Liste liegt hier und nirgends sonst. Stuende sie zweimal, liefen die
// Fassungen beim naechsten Plattform-Eintritt auseinander, und der Waechter
// pruefte gegen die falsche (Fehlerklasse L5).
const FREIGEGEBENE_PLATTFORMEN = Object.freeze([
  Object.freeze({ kennung: 'windows', seit: '0.0.0', endungen: ['-Setup.exe', '-Portable.exe'] }),
  Object.freeze({ kennung: 'linux', seit: '1.121.0', endungen: ['.AppImage', '.deb'] }),
]);

// Vergleicht zwei SemVer-Fassungen stellenweise; -1, 0 oder 1.
function vergleicheVersion(a, b) {
  const zerlege = (v) => String(v).split('.').map(Number);
  const [x, y] = [zerlege(a), zerlege(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  }
  return 0;
}

// Die Artefakt-Namen, die `version` tragen muss. Ohne Pruefsummen-Datei: Die
// entsteht je Bau und wird von archive-build.js fortgeschrieben, ist also keine
// eigene Bau-Pflicht, sondern deren Ergebnis.
function erwarteteArtefakte(produkt, version) {
  return FREIGEGEBENE_PLATTFORMEN.filter((p) => vergleicheVersion(version, p.seit) >= 0).flatMap(
    (p) => p.endungen.map((e) => `${produkt}-${version}${e}`),
  );
}

// Liefert die fehlenden Artefakt-Namen; leer heisst vollstaendig.
function fehlendeArtefakte(produkt, version, dateien) {
  const vorhanden = new Set(dateien);
  return erwarteteArtefakte(produkt, version).filter((name) => !vorhanden.has(name));
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
  FREIGEGEBENE_PLATTFORMEN,
  vergleicheVersion,
  erwarteteArtefakte,
  fehlendeArtefakte,
};
