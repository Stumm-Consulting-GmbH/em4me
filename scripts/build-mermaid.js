// 4T-0021: bundlet src/renderer/mermaid-entry.js zu src/renderer/mermaid.bundle.js.
// Wird vor dem Renderer-Bundle aufgerufen, ist aber bewusst vom Haupt-Bundle
// getrennt — der Renderer laedt diesen Bundle erst per dynamischem import(),
// wenn ein Dokument mindestens einen mermaid-Code-Block enthaelt.
'use strict';

const esbuild = require('esbuild');
const path = require('node:path');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'src', 'renderer', 'mermaid-entry.js');
const outfile = path.join(root, 'src', 'renderer', 'mermaid.bundle.js');

function buildMermaid() {
  return esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    format: 'esm',
    target: ['chrome120'],
    sourcemap: false,
    legalComments: 'none',
    minify: true, // Mermaid ist gross — minify halbiert den Bundle.
    logLevel: 'info',
  });
}

module.exports = { buildMermaid };

if (require.main === module) {
  buildMermaid().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
