// 4T-0375 (Epic 3E-0070): Build-Wrapper um electron-builder. Liest die
// Build-Nummer aus src/shared/build-info.json und übergibt sie als
// Umgebungsvariable BUILD_NUMBER. electron-builder setzt damit die Windows-
// FileVersion vierstellig (version.BUILD_NUMBER; siehe app-builder-lib
// appInfo.js), während die dreiteilige ProductVersion aus package.json
// unverändert bleibt. Die Nummer wird nur gesetzt, wenn die Build-Info zur
// gebauten Version passt; sonst baut electron-builder die dreiteilige
// Default-Version. Die electron-builder-Argumente (Targets) reicht der
// Wrapper unverändert durch.
//
// 4T-1205 (Epic 3E-0121): Der Wrapper ist ziel-neutral — die Plattform kommt
// als durchgereichtes Argument (npm-Skripte geben heute `--win` vor; weitere
// Targets ergänzen die Plattform-Epics als eigene Skript-Einträge). Die
// Build-Nummer ist je Release GEMEINSAM für alle Artefakt-Sätze
// (PO-Entscheidung vom 2026-08-25): Sie ist die Commit-Anzahl des
// Release-Commits und damit plattformunabhängig; die vierstellige FileVersion
// ist lediglich ihre Windows-Ausprägung. Die artifactName-Zusätze des
// temporären Baus unten betreffen die Windows-Targets; Kennzeichnungen
// weiterer Formate ergänzen die Plattform-Epics an derselben Stelle.
'use strict';

const path = require('node:path');
const { execSync } = require('node:child_process');
const { buildNumberEnvValue, bauAngaben } = require('../src/shared/build-version');

const ROOT = path.join(__dirname, '..');

function loadBuildInfo() {
  try {
    return require(path.join(ROOT, 'src', 'shared', 'build-info.json'));
  } catch {
    return null;
  }
}

// 4T-0921: Vorhandene Release-Marken. null heisst „nicht zu ermitteln"; der
// Aufrufer bricht dann ab (fail closed), weil ohne die Marken nicht
// entscheidbar ist, ob die Versions-Angabe bereits veroeffentlicht ist. Eine
// leere Liste ist dagegen eine gueltige Auskunft (Erst-Release).
function releaseMarken() {
  try {
    return execSync('git tag --list "v*"', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((zeile) => zeile.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const pkg = require(path.join(ROOT, 'package.json'));
  const angaben = bauAngaben(pkg.version, releaseMarken(), new Date());
  if (angaben.befund) {
    console.error(`build-app: ABBRUCH — ${angaben.befund}`);
    process.exit(1);
  }

  const env = { ...process.env };
  const zusatz = [];
  if (angaben.temporaer) {
    // 4T-0921: Die Marke T steht in Dateiname und Anzeige an erster Stelle,
    // in der technischen Versions-Angabe dagegen hinter der Basis-Version,
    // weil beide Windows-Versions-Felder vorne eine Ziffer verlangen.
    // Bewusst OHNE Build-Nummer: die vierte numerische Stelle bleibt damit 0,
    // und weil jedes Release dort seine Stand-Nummer traegt, ist die Null ein
    // zweites, unabhaengiges Erkennungsmerkmal eines temporaeren Baus.
    delete env.BUILD_NUMBER;
    const kern = angaben.kennzeichnung;
    zusatz.push(`"-c.extraMetadata.version=${angaben.version}"`);
    zusatz.push(`"-c.portable.artifactName=\${productName}-${kern}-Portable.\${ext}"`);
    zusatz.push(`"-c.nsis.artifactName=\${productName}-${kern}-Setup.\${ext}"`);
    console.log(
      `build-app: temporaerer Bau ${kern} — Basis ${angaben.basis} ist bereits ausgeliefert, ` +
        `die Nummer wird nicht erneut vergeben.`,
    );
  } else {
    const value = buildNumberEnvValue(pkg.version, loadBuildInfo());
    if (value) env.BUILD_NUMBER = value;
  }

  const args = [...process.argv.slice(2), ...zusatz].join(' ');
  execSync(`electron-builder ${args}`, { cwd: ROOT, stdio: 'inherit', env });
}

if (require.main === module) {
  main();
}

module.exports = { main };
