// 4T-0375 (Epic 3E-0070): Schreibt die Build-Nummer (vierte Versionsstelle)
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
const { nextBuildNumber } = require('../src/shared/build-version');

const ROOT = path.join(__dirname, '..');
const INFO_PATH = path.join(ROOT, 'src', 'shared', 'build-info.json');

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

module.exports = { main };
