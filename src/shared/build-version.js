// 4T-0375 (Epic 3E-0070): Reine Logik der erweiterten Versionsnummer.
// Die vierte Stelle (Build-Nummer = Commit-Anzahl beim Release-Commit) lebt
// in src/shared/build-info.json und wird versions-gekoppelt angewandt: die
// volle Nummer gilt nur, wenn build-info.version zur gebauten Version passt.
// Elektron- und Git-frei, damit unit-testbar; Main-Prozess, Build-Wrapper und
// Archiv-Guard reichen die realen Werte hinein.
'use strict';

// Plausibilitätsprüfung der Build-Info: passende Version und eine positive
// ganze Build-Nummer. Fehlende oder defekte Info führt überall zum
// dreiteiligen Fallback, ohne Fehler.
function hasBuildNumberFor(version, buildInfo) {
  return !!(
    buildInfo &&
    buildInfo.version === version &&
    Number.isInteger(buildInfo.buildNumber) &&
    buildInfo.buildNumber > 0
  );
}

// 4T-0921: Technische Form eines temporären Baus. Die Basis-Version steht
// vorne, weil das Bau-Werkzeug daraus das numerische Windows-Vierertupel
// bildet und ein führender Buchstabe den Bau abbricht; am 2026-08-07 an der
// Bibliothek gemessen ("Invalid major number") und am Ressourcen-Werkzeug
// ("Unable to parse version string"). Der Zeitstempel ist zwölfstellig:
// Jahr, Monat, Tag, Stunde, Minute.
const TEMP_MUSTER = /^(\d+\.\d+\.\d+)-T\.(\d{12})$/;

// Anzeige- und Datei-Form derselben Angabe, mit der Marke T an erster Stelle
// (Entscheidung des Product Owners vom 2026-08-07). Liefert null, wenn die
// Versions-Angabe kein temporärer Bau ist.
function temporaereKennzeichnung(version) {
  const treffer = TEMP_MUSTER.exec(String(version ?? ''));
  return treffer ? `T-${treffer[1]}-${treffer[2]}` : null;
}

// Volle Anzeige-Version: die temporäre Kennzeichnung, sonst X.Y.Z.N, wenn die
// Build-Info zur App-Version passt, sonst die dreiteilige App-Version
// (Fallback). Der temporäre Bau geht vor, weil seine Build-Info stets zu einer
// anderen Version gehört und die Nummer dort nichts aussagt.
function computeFullVersion(appVersion, buildInfo) {
  const temporaer = temporaereKennzeichnung(appVersion);
  if (temporaer) return temporaer;
  if (hasBuildNumberFor(appVersion, buildInfo)) {
    return `${appVersion}.${buildInfo.buildNumber}`;
  }
  return appVersion;
}

// Zwölfstelliger Zeitstempel in **lokaler** Zeit (Entscheidung des Product
// Owners vom 2026-08-07, bewusste Abweichung von der UTC-Konvention für
// persistierte Zeitstempel): Die Angabe ist ein Etikett, das neben dem
// lokalen Änderungs-Zeitstempel der Datei gelesen wird, und ein Versatz von
// ein bis zwei Stunden zwischen beiden kostet jedes Mal eine Rückfrage.
function zeitstempelFuerBau(datum) {
  const zwei = (wert) => String(wert).padStart(2, '0');
  return (
    String(datum.getFullYear()) +
    zwei(datum.getMonth() + 1) +
    zwei(datum.getDate()) +
    zwei(datum.getHours()) +
    zwei(datum.getMinutes())
  );
}

/**
 * 4T-0921: Entscheidet, mit welchen Angaben gebaut wird. Reine Funktion ohne
 * Git- und Datei-Zugriff; der Aufrufer reicht die Tatsachen herein.
 *
 * Trägt die Versions-Angabe bereits eine Release-Marke, ist das Release
 * ausgeliefert und die Nummer verbraucht: Der Bau bekommt eine temporäre
 * Kennzeichnung, damit nie wieder eine Programmdatei mit einer bereits
 * veröffentlichten Nummer entsteht. Trägt sie keine, läuft der Bau wie bisher.
 *
 * marken: Liste der vorhandenen Release-Marken (`v0.105.0`), oder null, wenn
 * die Auskunft nicht zu bekommen war. Dann liefert die Funktion einen Befund
 * statt einer Entscheidung (fail closed): Ohne die Marken lässt sich die
 * Zusicherung nicht halten, und ein Bau ist billiger zu wiederholen als eine
 * falsch benannte Programmdatei zurückzuholen.
 */
function bauAngaben(pkgVersion, marken, datum) {
  if (!Array.isArray(marken)) {
    return {
      befund:
        'Die vorhandenen Release-Marken sind nicht zu ermitteln. Ohne sie ist nicht ' +
        'entscheidbar, ob die Versions-Angabe bereits veroeffentlicht ist; der Bau bricht ' +
        'deshalb ab, statt moeglicherweise eine bereits vergebene Nummer erneut zu vergeben. ' +
        'Git-Auskunft wiederherstellen und erneut bauen.',
    };
  }
  const veroeffentlicht = marken.includes(`v${pkgVersion}`);
  if (!veroeffentlicht) return { temporaer: false, version: pkgVersion };

  const version = `${pkgVersion}-T.${zeitstempelFuerBau(datum)}`;
  const kennzeichnung = temporaereKennzeichnung(version);
  if (!kennzeichnung || version === pkgVersion) {
    return {
      befund:
        `Die temporaere Kennzeichnung fuer ${pkgVersion} ist nicht bildbar (Ergebnis: ` +
        `"${version}"). Der Bau bricht ab, statt die bereits veroeffentlichte Nummer erneut zu vergeben.`,
    };
  }
  return { temporaer: true, version, kennzeichnung, basis: pkgVersion };
}

// Build-Nummer aus der Commit-Anzahl: der Release-Commit trägt seine eigene
// Nummer, deshalb die Anzahl der Vorgänger-Commits plus 1.
function nextBuildNumber(gitCount) {
  return gitCount + 1;
}

// Wert für die electron-builder-Umgebungsvariable BUILD_NUMBER. Nur setzen,
// wenn die Build-Info zur gebauten Version passt; sonst null, dann baut
// electron-builder die dreiteilige Default-FileVersion.
function buildNumberEnvValue(pkgVersion, buildInfo) {
  return hasBuildNumberFor(pkgVersion, buildInfo) ? String(buildInfo.buildNumber) : null;
}

// Guard: beim Release-Build muss die geschriebene Build-Nummer zur realen
// Commit-Anzahl des HEAD passen. Greift nur, wenn die Build-Info zur gebauten
// Version gehört (Release-Fenster nach set-build-number); in der laufenden
// Entwicklung (Versions-Mismatch) oder im Fallback-Zustand bleibt er still.
// Liefert null (in Ordnung) oder eine ASCII-Fehlermeldung für das Terminal.
function buildNumberGuardError(buildInfo, pkgVersion, gitCount) {
  if (!buildInfo || buildInfo.version !== pkgVersion) return null;
  if (!Number.isInteger(buildInfo.buildNumber)) return null;
  // 4T-0396 (Hotfix 0.42.1): Die Nummer ist die Commit-Anzahl des Release-
  // Commits (Vorgaenger-Commits + 1). Vor dem Release-Commit ist das
  // gitCount + 1 (die Nummer nimmt den kommenden Commit vorweg), nach dem
  // Commit gitCount. Beide sind gueltig, damit die EXE schon vor dem Commit
  // mit der richtigen Nummer baubar und testbar ist. Erst ein groesserer
  // Abstand ist ein Nachzuegler/Amend.
  if (buildInfo.buildNumber === gitCount || buildInfo.buildNumber === gitCount + 1) return null;
  return (
    `Build-Nummer-Abweichung: build-info.json nennt ${buildInfo.buildNumber} fuer Version ` +
    `${pkgVersion}, erwartet werden ${gitCount} oder ${gitCount + 1} (aktueller HEAD bzw. ` +
    `der antizipierte Release-Commit). Vermutlich kamen nach 'set-build-number' weitere ` +
    `Commits dazu (Amend/Nachzuegler). Nummer neu setzen (node scripts/set-build-number.js) ` +
    `und den Release-Commit erneuern.`
  );
}

module.exports = {
  hasBuildNumberFor,
  computeFullVersion,
  nextBuildNumber,
  buildNumberEnvValue,
  buildNumberGuardError,
  // 4T-0921: temporäre Kennzeichnung eines Baus zwischen zwei Releases.
  temporaereKennzeichnung,
  zeitstempelFuerBau,
  bauAngaben,
};
