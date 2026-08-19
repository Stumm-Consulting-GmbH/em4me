// 4T-0644: kopiert das Overlay- und Popover-Stilblatt von driver.js aus
// node_modules nach src/renderer/driverjs/, damit der Renderer es per <link>
// laden kann. Muster der KaTeX-Assets: das Vendor-CSS wird bewusst nicht über
// esbuild gebündelt, weil es kein Modul-Import des Renderers ist, sondern eine
// eigenständige Stilblatt-Datei bleibt. Die Theme-Anpassung an die Farb-Token
// der App liegt daneben in der versionierten src/renderer/styles/tour.css und
// wird in index.html nach diesem Vendor-CSS verlinkt.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const cssSrc = path.join(root, 'node_modules', 'driver.js', 'dist', 'driver.css');
const outDir = path.join(root, 'src', 'renderer', 'driverjs');
const cssOut = path.join(outDir, 'driver.css');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function buildTourAssets() {
  // Eingangs-Validierung nach dem Muster der KaTeX-Assets (X-09, 4T-0182):
  // fehlt die Quelle oder trägt sie die erwartete Popover-Klasse nicht mehr,
  // hat sich das Vendor-Format geändert. Dann laut scheitern, statt still ein
  // Stilblatt auszuliefern, auf das die Theme-Anpassung nicht mehr greift.
  if (!fs.existsSync(cssSrc)) {
    console.error(
      `build-tour-assets: Quelldatei fehlt — ${path.relative(root, cssSrc)} (driver.js nicht installiert?)`,
    );
    process.exit(1);
  }
  const css = fs.readFileSync(cssSrc, 'utf8');
  if (!css.includes('.driver-popover')) {
    console.error(
      'build-tour-assets: Validierung fehlgeschlagen — Klasse .driver-popover fehlt im Vendor-CSS (Format geändert?)',
    );
    process.exit(1);
  }

  ensureDir(outDir);
  // Unveränderte Kopie: die Anpassung an die App-Token passiert ausschließlich
  // in tour.css, damit ein Versionssprung von driver.js hier nichts nachzieht.
  fs.copyFileSync(cssSrc, cssOut);
  console.log(`build-tour-assets: driver.css -> ${path.relative(root, cssOut)}`);
}

module.exports = { buildTourAssets };

if (require.main === module) {
  buildTourAssets();
}
