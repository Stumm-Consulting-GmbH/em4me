// 4T-0985 (Epic 3E-0196): aus src/shared/markdown/plugins.js geschnitten.
// Struktur-Gruppe des Dokuments: Zuordnung der Quellzeilen an die Tokens,
// Ueberschriften-Nummerierung samt Marker-Strip und der Listen-Neustart
// nach einer Leerzeile. Electron-frei; die Instanz-Registrierung macht
// markdown.js in der Original-Reihenfolge.
'use strict';

const { escapeHtml } = require('../slug.js');
// 4T-0470 (Epic 3E-0087): Nummerierungs-Kern der Gliederungs-Nummerierung.
const { computeHeadingNumbers, parseHeadingMarker } = require('../../heading-numbers.js');

function sourceLineMapperPlugin(mdInstance) {
  mdInstance.core.ruler.push('source_line_mapper', (state) => {
    // 4T-0282 (Epic 3E-0050): renderMarkdown rendert nur den Body NACH dem
    // Frontmatter-Block; env.sourceLineOffset traegt die Zeilenzahl des
    // abgetrennten Frontmatters, damit data-source-line die Zeile im
    // GESAMT-Dokument angibt (Scroll-Sync und Checkbox-Toggle adressieren
    // Editor-Zeilen des vollen Dokuments).
    const offset = (state.env && state.env.sourceLineOffset) || 0;
    for (const token of state.tokens) {
      if (token.map && token.nesting === 1 && token.tag) {
        token.attrSet('data-source-line', String(token.map[0] + 1 + offset));
      }
    }
  });
}
// 4T-0470 (Epic 3E-0087): Zeilenende-Marker {-}/{+} code-bewusst aus einem
// Markdown-Text nehmen — fuer den Portable-Export (der Text bleibt Standard-
// Markdown, nur der echte Steuer-Marker verschwindet; escapte Marker und
// Marker in Fenced-Code bleiben Literal). Gleiche Marker-Erkennung wie der
// Kern (nicht escapter {-}/{+} am ATX-Ueberschriften-Zeilenende).
function stripHeadingMarkers(text) {
  const lines = String(text == null ? '' : text).split('\n');
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fm) {
      const ch = fm[1][0];
      const len = fm[1].length;
      if (fenceChar === null) {
        fenceChar = ch;
        fenceLen = len;
      } else if (ch === fenceChar && len >= fenceLen && line.trim() === fm[1]) {
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }
    if (fenceChar !== null) continue; // innerhalb eines Fenced-Code-Blocks
    if (!/^ {0,3}#{1,6}(?:\s|$)/.test(line)) continue; // nur ATX-Ueberschriften
    const m = line.match(/(\\?)\{([-+])\}[ \t]*$/);
    if (m && m[1] !== '\\') lines[i] = line.slice(0, m.index).replace(/[ \t]+$/, '');
  }
  return lines.join('\n');
}

// 4T-0470 (Epic 3E-0087): Ueberschriften-Nummerierung als Anzeige-Praefix.
// Core-Ruler VOR 'inline': entfernt an jeder Ueberschrift einen echten
// (nicht escapten) Zeilenende-Marker {-}/{+} aus dem Roh-Inline-Content,
// BEVOR der Inline-Parser laeuft — damit weder der Slug (markdown-it-anchor)
// noch die Attribut-Erkennung (markdown-it-attrs, beide laufen nach 'inline')
// den Marker sieht. Ein escapter Marker (\{-}) bleibt unangetastet, damit
// markdown-it den Escape selbst aufloest. Die berechnete Nummer haengt als
// token.meta an heading_open und wird von der heading_open-Render-Rule als
// eigenes <span> vorangestellt (nie Teil des Slugs, per CSS und Kopier-
// Verhalten steuerbar). enabled/startLevel kommen ueber
// state.env.headingNumbering (renderMarkdown loest global -> Dokument auf).
// Der Marker-Strip laeuft immer, wenn das Plugin aktiv ist (Marker sind in
// keiner Ansicht sichtbar, auch bei inaktiver Nummerierung); ist die
// Erweiterung 'heading-numbering' deaktiviert, wird das Plugin gar nicht
// registriert und der Marker bleibt Literal-Text.
function headingNumbersPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);
  mdInstance.core.ruler.before('inline', 'heading_numbers', (state) => {
    const tokens = state.tokens;
    const items = [];
    for (let i = 0; i + 1 < tokens.length; i++) {
      if (tokens[i].type === 'heading_open' && tokens[i + 1].type === 'inline') {
        const level = parseInt(String(tokens[i].tag).slice(1), 10) || 1;
        items.push({ open: tokens[i], inline: tokens[i + 1], level });
      }
    }
    if (items.length === 0) return;
    const cfg = state.env && state.env.headingNumbering;
    const enabled = !!(cfg && cfg.enabled);
    const startLevel = cfg && cfg.startLevel === 2 ? 2 : 1;
    const results = computeHeadingNumbers(
      items.map((it) => ({ level: it.level, rawTitle: it.inline.content })),
      { enabled, startLevel },
    );
    for (let k = 0; k < items.length; k++) {
      const parsed = parseHeadingMarker(items[k].inline.content);
      // Echten Marker aus dem Roh-Content nehmen; der folgende inline-Ruler
      // baut die children frisch aus dem bereinigten content.
      if (parsed.marker !== null) items[k].inline.content = parsed.cleanTitle;
      const number = results[k].number;
      if (number) {
        items[k].open.meta = Object.assign({}, items[k].open.meta, { headingNumber: number });
      }
    }
  });

  const renderHeadingOpen =
    mdInstance.renderer.rules.heading_open ||
    ((tokens, idx, renderOpts, env, self) => self.renderToken(tokens, idx, renderOpts));
  mdInstance.renderer.rules.heading_open = (tokens, idx, renderOpts, env, self) => {
    const rendered = renderHeadingOpen(tokens, idx, renderOpts, env, self);
    const number = tokens[idx].meta && tokens[idx].meta.headingNumber;
    if (!number) return rendered;
    // Portable traegt ein dezentes Inline-Style (kein styles.css beim
    // Empfaenger); der Viewer stylt ueber die Klasse. Trennung zum Titel
    // ueber ein echtes Leerzeichen (kopiert als "1.1 Titel").
    const style = isPortable ? ' style="color:#666;font-variant-numeric:tabular-nums;"' : '';
    return `${rendered}<span class="heading-number"${style}>${escapeHtml(number)}</span> `;
  };
}

// 4T-0660 (Epic 3E-0112): Leerzeile beginnt eine neue nummerierte Liste.
//
// Bewusste Abweichung von der Standard-Interpretation (Festlegung des Product
// Owners vom 2026-07-21): Dort setzt eine Leerzeile eine Liste nur weitläufig
// fort, die Anzeige zählt über sie hinweg durch. Hier soll sie trennen, damit
// Quelltext und Anzeige dieselbe Nummer zeigen — der Editor behandelt die
// Leerzeile beim Verschieben und Nummerieren ebenfalls als Listen-Grenze.
//
// Umgesetzt über das HTML-Attribut `value` am ersten Punkt nach einer
// Leerzeile: Die Liste bleibt ein einziges `ol`, die Zählung beginnt dort
// aber neu und läuft danach normal weiter. Das ist der kleinstmögliche
// Eingriff; ein echtes Auftrennen der Token-Struktur würde Verschachtelung,
// Aufgaben-Listen und die Zeilen-Zuordnung der Vorschau berühren.
function listRestartPlugin(mdInstance) {
  mdInstance.core.ruler.after('block', 'list_restart', (state) => {
    const lines = String(state.src == null ? '' : state.src).split('\n');
    // Ein Eintrag je offener Liste; prevEnd ist die Zeile hinter dem zuletzt
    // gesehenen Punkt derselben Liste (aus dessen map).
    const stack = [];
    for (const token of state.tokens) {
      if (token.type === 'ordered_list_open' || token.type === 'bullet_list_open') {
        stack.push({ ordered: token.type === 'ordered_list_open', prevEnd: null });
        continue;
      }
      if (token.type === 'ordered_list_close' || token.type === 'bullet_list_close') {
        stack.pop();
        continue;
      }
      if (token.type !== 'list_item_open') continue;
      const list = stack[stack.length - 1];
      if (!list) continue;
      if (list.ordered && list.prevEnd !== null) {
        // Die letzte Zeile des Vorgängers ist leer, wenn ihn eine Leerzeile
        // von diesem Punkt trennt.
        const gap = lines[list.prevEnd - 1];
        if (typeof gap === 'string' && gap.trim() === '') {
          const number = parseInt(token.info, 10);
          if (Number.isFinite(number)) token.attrSet('value', String(number));
        }
      }
      list.prevEnd = token.map ? token.map[1] : null;
    }
  });
}

module.exports = {
  sourceLineMapperPlugin,
  headingNumbersPlugin,
  listRestartPlugin,
  stripHeadingMarkers,
};
