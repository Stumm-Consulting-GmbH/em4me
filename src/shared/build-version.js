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

// Volle Anzeige-Version: X.Y.Z.N, wenn die Build-Info zur App-Version passt,
// sonst die dreiteilige App-Version (Fallback).
function computeFullVersion(appVersion, buildInfo) {
  if (hasBuildNumberFor(appVersion, buildInfo)) {
    return `${appVersion}.${buildInfo.buildNumber}`;
  }
  return appVersion;
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
};
