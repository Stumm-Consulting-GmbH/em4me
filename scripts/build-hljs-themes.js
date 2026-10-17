// 4T-000023: erzeugt src/renderer/hljs-themes.css aus den GitHub-Themes von
// highlight.js. Beide Themes werden in eine Datei zusammengefuehrt; jede
// Regel wird mit dem passenden data-theme-Wrapper geprefixt, sodass beide
// Themes parallel geladen werden koennen und der Wechsel zur Laufzeit allein
// ueber das data-theme-Attribut am <html> laeuft. Layout-Properties (display,
// overflow, padding) aus den .hljs-Blocks der Themes werden ausgefiltert,
// weil der Render-Pane-Container bereits eigene Werte setzt.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const lightSrc = path.join(root, 'node_modules', 'highlight.js', 'styles', 'github.css');
const darkSrc = path.join(root, 'node_modules', 'highlight.js', 'styles', 'github-dark.css');
const outFile = path.join(root, 'src', 'renderer', 'hljs-themes.css');

function transform(css, wrapper) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const rawSelectors = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (rawSelectors.length === 0) continue;
    // Reine Layout-Regeln (pre code.hljs, code.hljs) ueberspringen — unser
    // Container kuemmert sich um padding und overflow.
    const allLayout = rawSelectors.every((s) => /^(pre\s+code\.hljs|code\.hljs)$/.test(s));
    if (allLayout) continue;

    let props = m[2]
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);

    // Beim Top-Level .hljs-Selektor background/padding ausfiltern.
    if (rawSelectors.includes('.hljs')) {
      props = props.filter((p) => {
        const name = p.split(':')[0].trim().toLowerCase();
        return !name.startsWith('background') && name !== 'padding';
      });
    }
    if (props.length === 0) continue;

    const prefixed = rawSelectors.map((s) => `${wrapper} ${s}`).join(',\n');
    out.push(`${prefixed} {\n  ${props.join(';\n  ')};\n}`);
  }
  return out.join('\n');
}

function buildHljsThemes() {
  const header = `/* Auto-generiert von scripts/build-hljs-themes.js. Nicht direkt editieren. */
/* Quelle: highlight.js (github.css + github-dark.css), umgeschrieben auf */
/* data-theme-Wrapper, damit beide Themes parallel geladen werden koennen. */
`;
  const light = transform(fs.readFileSync(lightSrc, 'utf8'), ':root:not([data-theme="dark"])');
  const dark = transform(fs.readFileSync(darkSrc, 'utf8'), '[data-theme="dark"]');
  // X-09 (4T-000182): Output-Validierung — der Regex-Transform haengt am
  // Vendor-CSS-Format. Wenn ein highlight.js-Update das Format aendert,
  // soll der Build laut scheitern statt leere/defekte Themes zu liefern.
  for (const [label, css] of [
    ['light', light],
    ['dark', dark],
  ]) {
    if (!css.includes('.hljs-keyword') || !css.includes('color')) {
      console.error(
        `build-hljs-themes: Validierung fehlgeschlagen (${label}): erwartete Selektoren fehlen — Vendor-CSS-Format geaendert?`,
      );
      process.exit(1);
    }
  }
  fs.writeFileSync(
    outFile,
    `${header}\n/* === Light theme === */\n${light}\n\n/* === Dark theme === */\n${dark}\n`,
    'utf8',
  );
  console.log('build-hljs-themes: geschrieben ->', path.relative(root, outFile));
}

/**
 * Setup-Einsprung für Vitest (`globalSetup` ruft den Standard-Export, sonst den
 * benannten Export `setup`), Muster scripts/build-i18n.js. 4T-002266: Prüffälle
 * der Präsentation lesen die Themes als Daten, und `npm test` fährt den
 * Renderer-Bau nicht; ohne Vorlauf fehlt die Datei in einem frischen Checkout.
 * Der benannte Export `buildHljsThemes` bleibt für scripts/build-renderer.js
 * und scripts/build-web-handbuch-stil.js.
 */
function setup() {
  buildHljsThemes();
}

module.exports = setup;
module.exports.setup = setup;
module.exports.buildHljsThemes = buildHljsThemes;

if (require.main === module) {
  buildHljsThemes();
}
