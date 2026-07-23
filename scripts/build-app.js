// 4T-0375 (Epic 3E-0070): Build-Wrapper um electron-builder. Liest die
// Build-Nummer aus src/shared/build-info.json und übergibt sie als
// Umgebungsvariable BUILD_NUMBER. electron-builder setzt damit die Windows-
// FileVersion vierstellig (version.BUILD_NUMBER; siehe app-builder-lib
// appInfo.js), während die dreiteilige ProductVersion aus package.json
// unverändert bleibt. Die Nummer wird nur gesetzt, wenn die Build-Info zur
// gebauten Version passt; sonst baut electron-builder die dreiteilige
// Default-Version. Die electron-builder-Argumente (Targets) reicht der
// Wrapper unverändert durch.
'use strict';

const path = require('node:path');
const { execSync } = require('node:child_process');
const { buildNumberEnvValue } = require('../src/shared/build-version');

const ROOT = path.join(__dirname, '..');

function loadBuildInfo() {
  try {
    return require(path.join(ROOT, 'src', 'shared', 'build-info.json'));
  } catch {
    return null;
  }
}

function main() {
  const pkg = require(path.join(ROOT, 'package.json'));
  const value = buildNumberEnvValue(pkg.version, loadBuildInfo());
  const env = { ...process.env };
  if (value) env.BUILD_NUMBER = value;
  const args = process.argv.slice(2).join(' ');
  execSync(`electron-builder ${args}`, { cwd: ROOT, stdio: 'inherit', env });
}

if (require.main === module) {
  main();
}

module.exports = { main };
