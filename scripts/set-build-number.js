// 4T-000375 (Epic 3E-000070): Schreibt die Build-Nummer (vierte Versionsstelle)
// nach src/shared/build-info.json. Aufruf als expliziter Schritt vor dem
// Release-Commit (Prozess im Konzept "Release-Strecke"); der Release-Commit
// trägt damit seine eigene Nummer. Die Nummer ist die Anzahl der
// Vorgänger-Commits plus 1
// (git rev-list --count HEAD + 1). Idempotent: mehrfacher Lauf vor demselben
// Commit schreibt dieselbe Nummer.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { hasBuildNumberFor, nextBuildNumber } = require('../src/shared/build-version');

const ROOT = path.join(__dirname, '..');
const INFO_PATH = path.join(ROOT, 'src', 'shared', 'build-info.json');

// 4T-001232: Setz-Kriterium der Build-Nummer. Die Soll-Nummer gehoert dem
// Werkzeug, das sie schreibt; die Setz-Entscheidung der Release-Vorbereitung
// fragt deshalb hier nach, statt sich eine zweite Meinung zu bilden. Vorher
// entschied dort der Bau-Guard, und zwei Mechanismen beantworteten dieselbe
// Frage ohne gemeinsame Quelle (Register-Klasse L5).
//
// Die Soll-Nummer ist immer nextBuildNumber(commitAnzahl): Der Lauf faellt
// stets VOR dem Release-Commit, weil die Release-Strecke ihn erst nach der
// Vorbereitung von Hand setzt. Genau diese Annahme trifft main() unten schon
// beim Schreiben.
//
// Bewusst strenger als buildNumberGuardError: Der Bau-Guard deckt beide
// Bau-Zeitpunkte ab (vor und nach dem Release-Commit) und laesst deshalb auch
// die Commit-Anzahl selbst durch. Diese Toleranz gehoert zu seiner Aufgabe,
// nicht zu dieser Entscheidung. Belegter Vorfall vom 2026-08-26 in der Strecke
// zu 1.119.0: Nach Rebase und soft-reset des Release-Commits entsprach die
// Nummer aus dem ersten Bau (1849) genau der Commit-Anzahl, der Guard schwieg,
// und Schritt 2 wurde uebersprungen — ohne Gegenprobe waere 1.119.0.1849 auf
// einem Stand mit 1850 Commits ausgeliefert worden.
function buildNummerNeuSetzen(buildInfo, version, commitAnzahl) {
  return (
    !hasBuildNumberFor(version, buildInfo) ||
    buildInfo.buildNumber !== nextBuildNumber(commitAnzahl)
  );
}

function main() {
  const pkg = require(path.join(ROOT, 'package.json'));
  let count;
  try {
    const out = execSync('git rev-list --count HEAD', { cwd: ROOT, encoding: 'utf8' });
    count = parseInt(out.trim(), 10);
  } catch (err) {
    console.error(`set-build-number: git rev-list fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }
  if (!Number.isInteger(count)) {
    console.error('set-build-number: Commit-Anzahl nicht ermittelbar.');
    process.exit(1);
  }
  const info = { version: pkg.version, buildNumber: nextBuildNumber(count) };
  fs.writeFileSync(INFO_PATH, JSON.stringify(info, null, 2) + '\n', 'utf8');
  console.log(
    `set-build-number: ${info.version}.${info.buildNumber} -> ${path.relative(ROOT, INFO_PATH)}`,
  );
}

if (require.main === module) {
  main();
}

module.exports = { main, buildNummerNeuSetzen };
