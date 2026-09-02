// 4T-001223 (Epic 3E-000122): Artefakt-Namensmuster der Bau- und Archiv-Strecke,
// aus scripts/archive-build.js herausgeschnitten (Datei-Groessen-Budget). Die
// Muster sind eine eigene Fachlichkeit: Sie definieren, welche Dateinamen als
// Release-Artefakt, Release-Hinweis oder temporaerer Bau gelten, unabhaengig
// davon, wer sie auswertet. Die Regel-Herkunft steht bei den Mustern.
'use strict';

// SemVer-Versions-Pattern: Major.Minor.Patch.
const VERSION_RE = /\d+\.\d+\.\d+/;
const PRODUKT_RE = 'EM4me|Perspective Markdown\\+\\+|SCG Markdown|Markdown Viewer';
const EXE_PATTERN = new RegExp(`^(?:${PRODUKT_RE})-(${VERSION_RE.source})-(Setup|Portable)\\.exe$`);
// 4T-001205 (Epic 3E-000121): weitere Artefakt-Formate, vorbereitet fuer die
// Plattform-Epics — Linux (AppImage) und macOS (DMG) ohne Varianten-Zusatz.
// Das Windows-Muster oben bleibt unveraendert (eigene Varianten Setup|Portable).
// 4T-001223 (Epic 3E-000122): deb als zweites Linux-Format (PO-Entscheidung vom
// 2026-08-26), Namensschema wie AppImage ohne Varianten-Zusatz.
const WEITERE_ARTEFAKT_RE = new RegExp(
  `^(?:${PRODUKT_RE})-(${VERSION_RE.source})\\.(?:AppImage|deb|dmg)$`,
);
// Ein Release-Artefakt gleich welcher Plattform; Fanggruppe 1 ist die Version.
function matchArtefakt(name) {
  return name.match(EXE_PATTERN) || name.match(WEITERE_ARTEFAKT_RE);
}
const NOTES_PATTERN = new RegExp(`^release-notes-(${VERSION_RE.source})\\.md$`);
// 4T-000921: Dateiname eines temporaeren Baus zwischen zwei Releases
// (`EM4me-T-0.105.0-202608071130-Portable.exe`). Er wird bewusst NICHT
// archiviert: `releases/` ist das Versions-Archiv der Releases.
// Fanggruppe 1 ist der zwoelfstellige Zeitstempel.
// 4T-001205/4T-001223: dieselbe Format-Erweiterung wie beim Release-Artefakt —
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

// 4T-001318: Die freigegebenen Plattformen und der Artefaktsatz, den eine Version
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

// 4T-001323 (Befund 3): Der Artefaktsatz-Waechter aus 4T-001318 beantwortet, ob
// alle Artefakte einer Version DA sind. Er beantwortet nicht, ob sie aus
// DEMSELBEN Bau stammen — und am 2026-08-30 fielen beide Fragen auseinander:
// Beim Neubau von 1.122.0 mit der Nummer 2106 lagen die beiden Windows-Ziele
// frisch im Archiv, die beiden Linux-Artefakte unveraendert vom Bau 2104, gut
// siebzig Minuten aelter. Gemeldet wurde «Artefaktsatz vollstaendig».
//
// **Der Mechanismus, gegenstaendlich am Code:** Die Frische-Pruefung des
// Bau-Schritts (`bau-stand.js`, `pruefeFrische`) laeuft ueber `exePfade`, und
// die Strecke fuellt diese Liste aus `exeNamen()` — den beiden WINDOWS-Namen.
// Der Vollstaendigkeits-Waechter laeuft dagegen ueber `erwarteteArtefakte()`,
// also ueber alle freigegebenen Plattformen. Seit dem Eintritt von Linux mit
// 1.121.0 fragen die beiden Pruefungen verschiedene Mengen ab; genau in dieser
// Luecke sass der Befund.
//
// **Das Kriterium ist das bereits entschiedene, nur auf die volle Menge
// angewandt:** Ein Artefakt des gueltigen Baus ist nicht aelter als
// `src/shared/build-info.json`. Diese Datei wird von `set-build-number.js` in
// Schritt 2 geschrieben, also VOR dem Bau, und genau dann neu, wenn sich die
// Nummer aendert — was der Wiederhol-Bau nach geaenderter Commit-Basis tut.
// `pruefeFrische` benutzt denselben Vergleich seit 4T-000883 als notwendige
// Bedingung neben dem Fingerabdruck.
//
// **Was der Vergleich nicht leistet, und das gehoert dazu:** Er ist notwendig
// und nicht hinreichend (Begruendung in `bau-stand.js`, Anlass 0.104.0). Bleibt
// die Build-Nummer stehen, bleibt auch die Datei-Zeit stehen — dann hat aber
// auch kein zweiter Bau stattgefunden, und der gemischte Satz kann nicht
// entstehen. Nicht erkannt wird der umgekehrte Fall: ein einzelnes Artefakt,
// das NACH dem gueltigen Bau nachgereicht wird. Es traegt dann dieselbe Nummer,
// und der Fall ist ein anderer als der belegte.
//
// Rein: Zeiten kommen herein, statt hier gelesen zu werden.
function veralteteArtefakte(produkt, version, zeitVon, bauInfoZeit) {
  const befunde = [];
  for (const name of erwarteteArtefakte(produkt, version)) {
    const zeit = zeitVon(name);
    if (zeit === null || zeit === undefined) continue; // Fehlen deckt fehlendeArtefakte ab
    if (zeit < bauInfoZeit)
      befunde.push({
        name,
        zeit,
        alter: Math.round((bauInfoZeit - zeit) / 60000),
      });
  }
  return befunde;
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
  veralteteArtefakte,
};
