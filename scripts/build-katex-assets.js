// 4T-0022: kopiert die KaTeX-Assets aus node_modules nach src/renderer/katex/,
// damit der Renderer die CSS per <link> und die Fonts per url(fonts/*) laden
// kann. Nur woff2 wird kopiert; die CSS wird im selben Lauf so umgeschrieben,
// dass sie nur noch woff2 referenziert (Chromium unterstuetzt woff2 nativ —
// woff und ttf wuerden den Bundle nur unnoetig vergroessern).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const cssSrc = path.join(root, 'node_modules', 'katex', 'dist', 'katex.min.css');
const fontsSrcDir = path.join(root, 'node_modules', 'katex', 'dist', 'fonts');
const outDir = path.join(root, 'src', 'renderer', 'katex');
const cssOut = path.join(outDir, 'katex.css');
const fontsOutDir = path.join(outDir, 'fonts');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripNonWoff2Sources(css) {
  // KaTeX-CSS listet pro @font-face mehrere src-URLs als kommaseparierte Werte.
  // Wir entfernen die ttf- und woff-Eintraege; woff2 bleibt. Reihenfolge in
  // der Original-CSS: woff2, woff, ttf. Daher konservativer Pattern-Treffer
  // pro einzelnem Eintrag, der das fuehrende Komma mit-konsumiert.
  return css.replace(/,\s*url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, '');
}

function buildKatexAssets() {
  ensureDir(outDir);
  ensureDir(fontsOutDir);

  // CSS: nur woff2 referenzieren.
  const css = fs.readFileSync(cssSrc, 'utf8');
  const stripped = stripNonWoff2Sources(css);
  // X-09 (4T-0182): Output-Validierung — nach dem Strip duerfen keine
  // woff-/ttf-Referenzen uebrig sein und die woff2-Quellen muessen noch da
  // sein; sonst hat sich das KaTeX-CSS-Format geaendert (laut scheitern).
  if (/\.(woff|ttf)\)/.test(stripped) || !stripped.includes('.woff2')) {
    console.error(
      'build-katex-assets: Validierung fehlgeschlagen — Font-Referenz-Reste oder fehlende woff2-Quellen (Vendor-CSS-Format geaendert?)',
    );
    process.exit(1);
  }
  fs.writeFileSync(cssOut, stripped, 'utf8');

  // Fonts: nur woff2 kopieren.
  const entries = fs.readdirSync(fontsSrcDir);
  let copied = 0;
  for (const name of entries) {
    if (!name.endsWith('.woff2')) continue;
    fs.copyFileSync(path.join(fontsSrcDir, name), path.join(fontsOutDir, name));
    copied += 1;
  }
  console.log(`build-katex-assets: CSS + ${copied} woff2-Fonts -> ${path.relative(root, outDir)}`);
}

module.exports = { buildKatexAssets };

if (require.main === module) {
  buildKatexAssets();
}
