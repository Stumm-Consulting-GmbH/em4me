// 4T-001222 (Epic 3E-000122): Linux-Bau im Docker-Container.
//
// PO-Entscheidung vom 2026-08-26: Linux-Targets entstehen von Windows aus im
// Referenz-Image von electron-builder (electronuserland/builder), nicht in
// einer selbst gepflegten Umgebung. Dieser Wrapper kapselt den
// docker-run-Aufruf: das Repositorium als /project, node_modules als
// benanntes Volume je Clone (die Linux-Binaries dürfen die
// Windows-Installation nicht überschreiben), die Electron-Caches als
// gemeinsame Volumes je Rechner. Im Container laufen npm install, der
// Renderer-Bau und der ziel-neutrale Build-Wrapper (scripts/build-app.js);
// node_modules/.bin gehört dort ausdrücklich in den PATH, weil der
// Direkt-Aufruf — anders als ein npm-Skript — ihn nicht mitbringt.
// Argumente werden unverändert an build-app.js durchgereicht; ohne Argumente
// entstehen die konfigurierten Linux-Ziele (--linux, seit 4T-001223 AppImage
// und deb), das entpackte Probe-Ziel bleibt über `--linux dir` erreichbar.
'use strict';

const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
// Node-Parität zum Bestand (22.x); ein Major-Wechsel folgt dem Node-Entscheid
// aller Rechner gemeinsam (Konzept «Verteiltes Arbeitsmodell», Kapitel 5).
const IMAGE = 'electronuserland/builder:22';

function main() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    console.error(
      'build-linux-docker: ABBRUCH — Docker ist nicht verfügbar. Der Linux-Bau läuft im ' +
        'Container (Konzept «Verteiltes Arbeitsmodell», Kapitel 5, Voraussetzungen je Rechner).',
    );
    process.exit(1);
  }

  const slot = path.basename(ROOT).replace(/[^A-Za-z0-9_.-]/g, '-');
  const ziele = process.argv.slice(2).join(' ') || '--linux';
  const kommandos = [
    'git config --global --add safe.directory /project',
    'cd /project',
    'export PATH=/project/node_modules/.bin:$PATH',
    'npm install --no-audit --no-fund',
    'npm run build:renderer',
    `node scripts/build-app.js ${ziele}`,
  ].join(' && ');
  const aufruf = [
    'docker run --rm',
    `-v "${ROOT}:/project"`,
    `-v em4me-node-modules-${slot}:/project/node_modules`,
    '-v em4me-electron-cache:/root/.cache/electron',
    '-v em4me-electron-builder-cache:/root/.cache/electron-builder',
    IMAGE,
    `/bin/bash -c "${kommandos}"`,
  ].join(' ');
  execSync(aufruf, { cwd: ROOT, stdio: 'inherit' });
}

if (require.main === module) {
  main();
}

module.exports = { main };
