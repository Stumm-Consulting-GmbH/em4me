// Bundlet src/renderer/renderer.js samt allen Imports (eigene ES-Module wie
// i18n.js und externe Pakete wie CodeMirror) zu src/renderer/renderer.bundle.js.
// Wird vor jedem Electron-Start (npm start/dev) und vor jedem electron-builder-
// Lauf (npm run build) automatisch ausgefuehrt.
'use strict';

const esbuild = require('esbuild');
const path = require('node:path');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'src', 'renderer', 'renderer.js');
const outfile = path.join(root, 'src', 'renderer', 'renderer.bundle.js');

// 4T-0023: highlight.js-Themes vor dem Bundle bauen. Erzeugt
// src/renderer/hljs-themes.css aus den GitHub-Light/Dark-Themes.
const { buildHljsThemes } = require('./build-hljs-themes.js');
buildHljsThemes();

// 4T-0022: KaTeX-Assets (CSS + woff2-Fonts) nach src/renderer/katex/ kopieren.
const { buildKatexAssets } = require('./build-katex-assets.js');
buildKatexAssets();

// 4T-0021: separater Mermaid-Bundle, der vom Renderer lazy geladen wird.
// Wird hier synchron gebaut, damit das Ergebnis bereits liegt, bevor das
// Haupt-Renderer-Bundle gebaut wird.
const { buildMermaid } = require('./build-mermaid.js');

const args = process.argv.slice(2);
const watch = args.includes('--watch');

const buildOptions = {
  entryPoints: [entry],
  bundle: true,
  outfile,
  format: 'esm',
  target: ['chrome120'],
  sourcemap: false,
  legalComments: 'none',
  // X-06 (4T-0182): minifizieren wie der Mermaid-Bundle; Debug laeuft im
  // Dev-Modus ueber die Quelle, nicht ueber den Bundle.
  minify: true,
  logLevel: 'info',
};

async function main() {
  // 4T-0021: Mermaid-Bundle vor dem Haupt-Renderer-Bundle bauen.
  await buildMermaid();
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('build-renderer: watching for changes…');
  } else {
    await esbuild.build(buildOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
