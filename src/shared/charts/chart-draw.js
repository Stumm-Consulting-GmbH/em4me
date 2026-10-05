// 4T-002020 (Epic 3E-000192): der gemeinsame Zeichner — ein Baustein für jedes
// Diagramm des Produkts.
//
// Er nimmt allein Beschriftungen und Zahlenreihen entgegen und kennt weder
// Tabelle noch Datenbank; wer ein Diagramm zeigen will, bringt seine Daten in
// die zeichenbare Form und ruft `drawChart`. Das Ergebnis ist die fertige
// Vektor-Grafik als SVG-Text, synchron und ohne DOM, damit sie in den
// synchronen, DOM-freien Weg der Zaun-Blöcke passt (Pipeline im Preload) und
// in Druck, PDF und Export ebenso entsteht wie in der Ansicht.
//
// EINGABE-VERTRAG (Zusicherung, siehe Architektur, «Der gemeinsame Zeichner»):
//   drawChart(input, options) -> string (SVG)
//   input   = { type: 'line'|'bar'|'pie'|'donut', title: string|null,
//               categories: string[], series: [{ name: string,
//               values: (number|null)[] }] }
//             Das ist die zeichenbare Form des Format-Kerns; weitere Felder
//             (etwa `drawable`, `omitted`) werden ignoriert. Ob die Art die
//             Daten verträgt, prüft der Aufrufer — der Zeichner prüft nur die
//             Form und wirft bei einer unbrauchbaren einen TypeError, weil das
//             ein Programmier-Fehler ist und kein Anwender-Fall.
//   options = { colors: { text, muted, background, palette[] },
//               fontFamily, width, height, description, idPrefix }
//             Alle Angaben je Aufruf; fehlende Farben und Schrift fallen auf die
//             exportierten Vorgaben, nie auf die der Bibliothek.
//
// Warum Farbwerte je Aufruf und kein Zustand: Der Zeichner bleibt eine reine
// Funktion. Ansicht, Druck, PDF und Export zeichnen mit verschiedenen Werten
// neu, ohne einen geteilten Zustand umzuschalten und wieder zurückzustellen.
//
// Warum die Bibliothek erst beim ersten Aufruf geladen wird: Fußabdruck. Der
// erzeugte Stand (scripts/build-echarts.js) ist rund ein halbes Megabyte groß;
// ein Dokument ohne Diagramm soll ihn nie laden.
//
// Vorlese-Angaben und Text-Regel: Die Grafik trägt `role="img"`, ein
// `<title>` und bei gesetzter Beschreibung ein `<desc>`, verknüpft über
// `aria-labelledby`/`aria-describedby`. Kein Text des Anwenders steht in einem
// Attribut-Wert — der Serialisierer der Bibliothek maskiert Attribut-Werte
// nicht, Text-Inhalte dagegen schon. Titel, Beschriftungen und Reihen-Namen
// erscheinen deshalb ausschließlich als Text-Inhalt; die Angaben des Aufrufers,
// die in Attribute gehen (Farben, Schrift, Kennungs-Präfix), werden auf eine
// unbedenkliche Form geprüft.
'use strict';

const { escapeHtml } = require('../markdown/slug.js');
const { buildChartOption } = require('./chart-draw-options.js');
// 4T-002021: Die Paletten liegen in einem Modul ohne Bibliothek, weil der
// Anzeige-Prozess sie braucht und diesen Zeichner nie laden darf.
const { LIGHT_CHART_PALETTE } = require('./chart-call-options.js');

const CHART_DRAW_TYPES = Object.freeze(['line', 'bar', 'pie', 'donut']);

// Helle Vorgabe: Text- und Achsen-Farbe aus dem hellen Standard-Farbschema
// (src/shared/color-schemes.js, `text` und `textMuted`), durchsichtiger
// Hintergrund, damit die Grafik auf jeder Fläche steht, und die helle
// Reihen-Palette aus zehn gut unterscheidbaren Farben.
const LIGHT_CHART_COLORS = Object.freeze({
  text: '#1f1f1f',
  muted: '#6a6a6a',
  background: 'transparent',
  palette: LIGHT_CHART_PALETTE,
});

// Generische Schrift-Familien: Ohne Angabe des Aufrufers folgt die Grafik der
// Oberflächen-Schrift des Systems, nie der Vorgabe der Bibliothek.
const DEFAULT_CHART_FONT = 'system-ui, sans-serif';

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 400;

// Farbwerte: Hex, Farb-Funktionen, Namen und `transparent`. Alles andere
// könnte den unmaskierten Attribut-Wert verlassen.
const COLOR_RE = /^[#\w(),.%\s-]+$/;
// Schrift: jede Familien-Liste, aber nichts, was einen Stil-Wert oder ein
// Attribut beendet.
// eslint-disable-next-line no-control-regex
const FONT_FORBIDDEN_RE = /["<>&;{}\\\u0000-\u001f]/;
const ID_PREFIX_RE = /^[A-Za-z][\w-]*$/;

let echarts = null;

// Lädt den erzeugten Stand beim ersten Diagramm und danach nie wieder.
function library() {
  if (!echarts) echarts = require('./echarts.bundle.js');
  return echarts;
}

function fail(message) {
  throw new TypeError(`drawChart: ${message}`);
}

function checkInput(input) {
  if (!input || typeof input !== 'object') fail('input ist kein Objekt');
  if (!CHART_DRAW_TYPES.includes(input.type)) fail(`unbekannte Art ${JSON.stringify(input.type)}`);
  if (input.title !== null && input.title !== undefined && typeof input.title !== 'string')
    fail('title ist weder Text noch null');
  if (!Array.isArray(input.categories)) fail('categories ist keine Liste');
  if (!Array.isArray(input.series)) fail('series ist keine Liste');
  for (const serie of input.series) {
    if (!serie || typeof serie !== 'object') fail('eine Reihe ist kein Objekt');
    if (!Array.isArray(serie.values)) fail('values einer Reihe ist keine Liste');
    for (const v of serie.values) {
      if (v !== null && !(typeof v === 'number' && Number.isFinite(v)))
        fail('ein Wert ist weder Zahl noch null');
    }
  }
}

function checkColor(value, name) {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) fail(`Farbwert ${name} ist unbrauchbar`);
  return value;
}

// Farben ganz oder gar nicht: Eine halbe Angabe ist ein Fehler des Aufrufers
// und fällt nicht still auf die Vorgabe zurück.
function resolveColors(colors) {
  if (colors === undefined || colors === null) return LIGHT_CHART_COLORS;
  if (typeof colors !== 'object') fail('colors ist kein Objekt');
  if (!Array.isArray(colors.palette) || colors.palette.length === 0)
    fail('colors.palette ist keine nicht-leere Liste');
  return {
    text: checkColor(colors.text, 'text'),
    muted: checkColor(colors.muted, 'muted'),
    background: checkColor(colors.background, 'background'),
    palette: colors.palette.map((c, i) => checkColor(c, `palette[${i}]`)),
  };
}

function resolveOptions(options = {}) {
  if (!options || typeof options !== 'object') fail('options ist kein Objekt');
  const fontFamily = options.fontFamily === undefined ? DEFAULT_CHART_FONT : options.fontFamily;
  if (typeof fontFamily !== 'string' || !fontFamily.trim() || FONT_FORBIDDEN_RE.test(fontFamily))
    fail('fontFamily ist unbrauchbar');
  const size = (value, fallback, name) => {
    const v = value === undefined ? fallback : value;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(`${name} ist keine Zahl > 0`);
    return v;
  };
  const description = options.description === undefined ? null : options.description;
  if (description !== null && typeof description !== 'string')
    fail('description ist weder Text noch null');
  const idPrefix = options.idPrefix === undefined ? 'chart' : options.idPrefix;
  if (typeof idPrefix !== 'string' || !ID_PREFIX_RE.test(idPrefix))
    fail('idPrefix ist unbrauchbar');
  return {
    colors: resolveColors(options.colors),
    fontFamily,
    width: size(options.width, DEFAULT_WIDTH, 'width'),
    height: size(options.height, DEFAULT_HEIGHT, 'height'),
    description: description === '' ? null : description,
    idPrefix,
  };
}

// Nacharbeit der Grafik, allein an Tags und am Stil-Block, nie an einem
// Text-Inhalt:
//   - Die Kennungen der Bibliothek (`zr<n>-…`, `<n>` ist ein fortlaufender
//     Zähler der Bibliothek) bekommen das Präfix des Aufrufers, damit mehrere
//     Grafiken in einem Dokument sich nicht in die Quere kommen und dieselbe
//     Eingabe dieselbe Grafik ergibt.
//   - Der Stil-Block der Bibliothek und ihre Klassen entfallen. Sie tragen
//     allein Zustände unter dem Mauszeiger, die eine Grafik ohne Bedienung
//     nicht braucht; ein Stil-Block in einer eingebetteten Grafik gälte
//     zudem für das ganze Dokument, und die Klassen-Nummern zählen über alle
//     Aufrufe hinweg weiter.
//   - Die Hilfs-Attribute für ein nachträgliches Beleben im Browser
//     (`ecmeta_…`) entfallen.
function rewriteTags(svg, idPrefix) {
  const libraryPrefix = /\bzr\d+-/g;
  const parts = svg.split(/(<[^>]*>)/);
  let inStyle = false;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    // Der ganze Stil-Block samt seinem CDATA-Abschnitt, der beim Zerlegen
    // selbst wie ein Tag aussieht, fällt weg.
    if (/^<style[\s>]/.test(part)) inStyle = true;
    if (inStyle) {
      if (part.startsWith('</style')) inStyle = false;
      parts[i] = '';
    } else if (part.startsWith('<')) {
      parts[i] = part
        .replace(/\secmeta_\w+="[^"]*"/g, '')
        .replace(/\sclass="zr\d+-cls-\d+"/g, '')
        .replace(libraryPrefix, `${idPrefix}-`);
    }
  }
  return parts.join('');
}

// Vorlese-Angaben: Attribute am Wurzel-Element tragen allein Kennungen; die
// Texte stehen maskiert als Inhalt von <title> und <desc>.
function addAccessibility(svg, title, description, idPrefix) {
  const titleText = title || description;
  const attrs = [' role="img"'];
  let inner = '';
  if (titleText) {
    attrs.push(` aria-labelledby="${idPrefix}-title"`);
    inner += `<title id="${idPrefix}-title">${escapeHtml(titleText)}</title>`;
  }
  if (description) {
    attrs.push(` aria-describedby="${idPrefix}-desc"`);
    inner += `<desc id="${idPrefix}-desc">${escapeHtml(description)}</desc>`;
  }
  return svg.replace(/^<svg\b([^>]*)>/, (_m, rest) => `<svg${rest}${attrs.join('')}>${inner}`);
}

/**
 * Zeichnet ein Diagramm als Vektor-Grafik.
 *
 * @param {{type: ('line'|'bar'|'pie'|'donut'), title: (string|null),
 *   categories: string[], series: Array<{name: string,
 *   values: Array<(number|null)>}>}} input zeichenbare Form
 * @param {{colors?: {text: string, muted: string, background: string,
 *   palette: string[]}, fontFamily?: string, width?: number, height?: number,
 *   description?: (string|null), idPrefix?: string}} [options]
 * @returns {string} SVG-Text mit `viewBox`, ohne Animation
 * @throws {TypeError} bei formal unbrauchbarer Eingabe oder Angabe
 */
function drawChart(input, options) {
  checkInput(input);
  const opts = resolveOptions(options);
  const option = buildChartOption(input, {
    ...opts.colors,
    fontFamily: opts.fontFamily,
  });
  const chart = library().init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: opts.width,
    height: opts.height,
  });
  let svg;
  try {
    chart.setOption(option);
    svg = chart.renderToSVGString({ useViewBox: true });
    svg = rewriteTags(svg, opts.idPrefix);
  } finally {
    chart.dispose();
  }
  const title = typeof input.title === 'string' && input.title !== '' ? input.title : null;
  return addAccessibility(svg, title, opts.description, opts.idPrefix);
}

module.exports = {
  drawChart,
  CHART_DRAW_TYPES,
  LIGHT_CHART_COLORS,
  DEFAULT_CHART_FONT,
};
