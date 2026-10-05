// 4T-002020 (Epic 3E-000192): baut die Teil-Einbindung von Apache ECharts zu
// src/shared/charts/echarts.bundle.js und legt die Lizenz-Texte der
// eingebundenen Pakete daneben (src/shared/charts/echarts.LICENSES.txt).
//
// Warum ein eigener Bau-Schritt: Die Teil-Einbindung liegt beim Hersteller nur
// als ES-Modul vor, der gemeinsame Zeichner (src/shared/charts/chart-draw.js)
// lädt sie im Preload aber per `require`. Der Schritt erzeugt deshalb einen
// CommonJS-Stand. Muster ist scripts/build-mermaid.js (esbuild, eigene
// Ausgabe-Datei, Bibliothek als Bau-Abhängigkeit), mit drei Abweichungen:
//   - Format CommonJS statt ESM, Ziel ist Node im Preload und in der Unit-Suite.
//   - Der Einstieg ist kein Modul unter src/, sondern der Text unten
//     (esbuild `stdin`): Er nennt genau die Bestandteile der Teil-Einbindung
//     und sonst nichts, und kein Quell-Modul muss dafür aus dem gepackten
//     Programm herausgehalten werden.
//   - Lizenz-Kommentare bleiben erhalten (`legalComments: 'eof'` samt Kopf-
//     Vermerk), und die Lizenz- und NOTICE-Texte werden mitgeliefert. Apache-2.0
//     verlangt, Lizenz und NOTICE mit dem ausgelieferten Werk weiterzugeben;
//     der Mermaid-Bau entfernt seine Lizenz-Kommentare und ist dafür kein
//     Vorbild.
//
// Aufgerufen wird der Schritt im Renderer-Bau (scripts/build-renderer.js),
// damit jeder Programm-Bau ihn erreicht, und als Vorlauf der Unit-Suite
// (`globalSetup` in vitest.config.mjs), weil die Prüffälle des Zeichners den
// erzeugten Stand laden. Beide Erzeugnisse sind nicht versioniert (.gitignore)
// und gelangen über `src/**/*` in das gepackte Programm.
'use strict';

const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src', 'shared', 'charts');
const outfile = path.join(outDir, 'echarts.bundle.js');
const licensesFile = path.join(outDir, 'echarts.LICENSES.txt');

// Die Teil-Einbindung: Linie, Balken, Kreis, Gitter, Legende, Titel, der
// Vektor-Zeichner und die Beschriftungs-Anordnung — nichts darüber hinaus (keine
// Tooltips, keine Werkzeugleiste, keine Animations- oder Interaktions-Bausteine).
// 4T-002026 (Entscheidung der steuernden Sitzung vom 2026-09-30): Die
// Beschriftungs-Anordnung (`LabelLayout` aus `echarts/features`) trägt die
// Einstellung `labelLayout.hideOverlap`; ohne sie zeichnet ein Kreis mit
// Tausenden Stücken jede Beschriftung übereinander. Sie wirkt auch im Zeichnen
// ohne Browser (`renderToSVGString`), gemessen an 5 bis 5000 Stücken.
const ENTRY = `
import { init, use } from 'echarts/core';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TitleComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  SVGRenderer,
  LabelLayout,
]);
export { init };
`;

// Die Texte, die mit dem Programm weitergegeben werden. ECharts bettet laut
// seiner LICENSE Teile von d3 ein (unter anderem src/util/number.ts, das jede
// Zahlen-Achse benutzt), deshalb gehört dessen Lizenz dazu; zrender trägt
// keine NOTICE-Datei, tslib (0BSD) wird der Vollständigkeit halber genannt.
const LICENSE_SOURCES = [
  { title: 'Apache ECharts — LICENSE', file: ['echarts', 'LICENSE'] },
  { title: 'Apache ECharts — NOTICE', file: ['echarts', 'NOTICE'] },
  { title: 'Apache ECharts — licenses/LICENSE-d3', file: ['echarts', 'licenses', 'LICENSE-d3'] },
  { title: 'ZRender — LICENSE', file: ['zrender', 'LICENSE'] },
  { title: 'tslib — LICENSE.txt', file: ['echarts', 'node_modules', 'tslib', 'LICENSE.txt'] },
];

// Der Paket-Ordner von echarts wird aufgelöst statt zusammengesetzt: Fehlt das
// Paket, bricht der Bau hier laut ab, und die Abhängigkeits-Prüfung (knip)
// sieht die Nutzung, die im Einstiegs-Text oben nur als Zeichenkette steht.
// zrender ist eine Abhängigkeit von echarts, nicht des Projekts, und wird im
// Paket-Ordner daneben gelesen.
const ECHARTS_DIR = path.dirname(require.resolve('echarts/core'));
const PACKAGE_DIRS = { echarts: ECHARTS_DIR, zrender: path.join(ECHARTS_DIR, '..', 'zrender') };

function packageVersion(name) {
  const pkg = path.join(PACKAGE_DIRS[name], 'package.json');
  return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
}

// Laut scheitern statt still einen Stand ohne Lizenz-Text auszuliefern.
function buildLicenseText() {
  const parts = [
    'Lizenz-Texte der im gemeinsamen Zeichner eingebundenen Fremd-Bibliotheken',
    `(Apache ECharts ${packageVersion('echarts')}, ZRender ${packageVersion('zrender')}).`,
  ];
  for (const source of LICENSE_SOURCES) {
    const [pkg, ...rest] = source.file;
    const file = path.join(PACKAGE_DIRS[pkg], ...rest);
    if (!fs.existsSync(file)) {
      throw new Error(
        `build-echarts: Lizenz-Text fehlt — ${path.relative(root, file)} (echarts nicht installiert?)`,
      );
    }
    parts.push('', '='.repeat(72), source.title, '='.repeat(72), '');
    parts.push(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd());
  }
  return `${parts.join('\n')}\n`;
}

// Synchron, damit der Vorlauf der Unit-Suite und der Renderer-Bau ihn wie den
// Bau der Sprachdateien ohne Warten aufrufen können.
function buildEcharts() {
  const licenseText = buildLicenseText();
  fs.mkdirSync(outDir, { recursive: true });
  esbuild.buildSync({
    stdin: { contents: ENTRY, resolveDir: root, sourcefile: 'echarts-teil-einbindung.js' },
    bundle: true,
    outfile,
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    minify: true,
    // Entfernt die Entwickler-Prüfungen der Bibliothek; sie läuft wie eine
    // Auslieferung, in der Unit-Suite ebenso wie im Programm.
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: {
      js:
        `/*! Apache ECharts ${packageVersion('echarts')} (Teil-Einbindung) and ZRender ` +
        `${packageVersion('zrender')} — Apache License 2.0 / BSD-3-Clause; ` +
        'license and NOTICE texts: echarts.LICENSES.txt */',
    },
    legalComments: 'eof',
    logLevel: 'warning',
  });
  fs.writeFileSync(licensesFile, licenseText, 'utf8');
  return { outfile, licensesFile, bytes: fs.statSync(outfile).size };
}

/**
 * Setup-Einsprung für Vitest (`globalSetup` ruft den benannten Export
 * `setup`), Muster scripts/build-i18n.js.
 */
function setup() {
  buildEcharts();
}

module.exports = setup;
module.exports.setup = setup;
module.exports.buildEcharts = buildEcharts;

if (require.main === module) {
  try {
    const { bytes } = buildEcharts();
    console.log(
      `build-echarts: ${path.relative(root, outfile)} — ${bytes} Bytes, ` +
        `Lizenz-Texte in ${path.relative(root, licensesFile)}`,
    );
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
