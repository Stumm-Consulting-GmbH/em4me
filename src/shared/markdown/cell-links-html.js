// 4T-002014 (Epic 3E-000332): Enger Zell-Renderer der Datentabelle.
//
// Eine Text-Zelle der Datentabelle trägt Werte und keine Prosa. Sie zeigt
// deshalb nicht die volle Textauszeichnung wie die Zelle einer gewöhnlichen
// Tabelle, sondern allein das, was eine Verbindung stiftet (Entscheidung F1,
// Option b, des Product Owners vom 2026-09-28):
//
//   - Wiki-Verweise `[[Ziel]]`, `[[Ziel|Alias]]`, `[[Ziel#Anker]]`, gebunden an
//     den Schalter der Wiki-Links, in derselben Form wie im Fließtext;
//   - Markdown-Links `[Text](Ziel)`, auch mit Web-Adresse; sie sind Kern wie im
//     Fließtext und an keinen Schalter gebunden;
//   - Schlagworte `#wort`, gebunden an den Schalter der Tags;
//   - Inline-Code als Ausweg für wörtlich gemeinten Text, wie im Fließtext.
//
// Fett, Kursiv, Formeln, Roh-HTML, Auto-Links und Typografie bleiben Text. Eine
// Einbettung `![[…]]` (und ebenso `![Text](Ziel)`) erscheint als Verweis auf ihr
// Ziel, nicht eingebettet: Das Ausrufezeichen fällt weg, der Rest ist der
// gewöhnliche Verweis.
//
// **Schnellweg.** Eine Zelle ohne `[[`, `](` und `#` kann keinen Verweis und
// kein Schlagwort tragen; sie geht unverändert durch `escapeHtml` und bleibt
// damit byte-gleich zur Anzeige vor diesem Vorgang. Das hält auch die Kosten
// klein, weil die große Mehrheit der Zellen so aussieht.
//
// Prozess-neutral (kein Electron, kein DOM). Das Modul wird von der Pipeline
// (`markdown.js`) gebaut und als Funktion an die Datentabellen-Familie
// gereicht; kein Mitglied der Familie lädt es selbst, damit die Import-Regel
// der Familie (kein Laden des Pipeline-Kerns) unberührt bleibt.
'use strict';

const MarkdownIt = require('markdown-it');
const { escapeHtml } = require('./slug.js');
const { wikiLinksPlugin, tagsPlugin } = require('./plugins/wiki.js');

// Zeichenfolgen, ohne die keine der aktivierten Regeln greifen kann. Der
// Inline-Code allein löst den Weg über die Instanz bewusst nicht aus: Eine
// Zelle ohne Verweis-Zeichen bleibt byte-gleich, auch wenn sie Backticks trägt.
function hatVerweisZeichen(text) {
  return text.includes('[[') || text.includes('](') || text.includes('#');
}

// Einbettung als Verweis: Ein `!` unmittelbar vor `[` wird übergangen, wenn an
// der Stelle danach eine der übrigen Regeln einen Verweis erkennt. Erkennt
// keine, bleibt das Ausrufezeichen gewöhnlicher Text.
function einbettungAlsVerweis(state, silent) {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x21 /* ! */) return false;
  if (state.src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;
  state.pos = start + 1;
  for (const regel of state.md.inline.ruler.getRules('')) {
    if (regel !== einbettungAlsVerweis && regel(state, silent)) return true;
  }
  state.pos = start;
  return false;
}

/**
 * Baut den Zell-Renderer für einen Schalter-Stand.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.wikiLinks] Wiki-Verweise wirksam (Schalter `wiki-links`).
 * @param {boolean} [opts.tags] Schlagworte wirksam (Schalter `tags`).
 * @param {boolean} [opts.areaLinks] Kürzel der Bereichs-Verknüpfung abtrennen
 *   (Schalter `area-links`); gilt nur für die Anzeige, der portable Weg folgt
 *   wie im Fließtext der Voreinstellung des Plugins.
 * @param {boolean} [opts.portable] Renderer des portablen Exports.
 * @returns {(text: string) => string} HTML des Zell-Inhalts.
 */
function baueZellRenderer(opts) {
  const o = opts || {};
  const md = new MarkdownIt('zero');
  md.enable(['backticks', 'link']);
  if (o.wikiLinks) {
    // Form des Fließtexts: in der Anzeige mit dem Schalter der
    // Bereichs-Verknüpfung, im portablen Export ohne Angabe.
    md.use(wikiLinksPlugin, o.portable ? undefined : { areaLinks: o.areaLinks !== false });
  }
  if (o.tags) md.use(tagsPlugin);
  md.inline.ruler.before('link', 'zell_einbettung', einbettungAlsVerweis);
  return function zellHtml(text) {
    const s = String(text == null ? '' : text);
    return hatVerweisZeichen(s) ? md.renderInline(s) : escapeHtml(s);
  };
}

module.exports = { baueZellRenderer };
