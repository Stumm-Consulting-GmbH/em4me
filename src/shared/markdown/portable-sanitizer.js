// 4T-0994 (Epic 3E-0196): aus src/shared/markdown/markdown.js geschnitten.
// Whitelist-Sanitizer des Portable-Modus. Er haengt an den Roh-HTML-Render-
// Rules der mdPortable-Instanz (html_block/html_inline) und ist der einzige
// Teil des Moduls, der ohne Beruehrung des Pipeline-Kerns ausziehen konnte
// (Entscheidung E2 der Bestandsaufnahme 4T-0964): keine Beteiligung am
// CJS-Zyklus mit perspective-table, kein Export-Reassignment, keine
// Abhaengigkeit von der Initialisierungs-Reihenfolge.
//
// Electron-frei und ohne DOM zur Ladezeit: Der DOMParser des Block-Zweigs
// wird erst im Aufruf referenziert und faellt in Node auf Escaping zurueck.
'use strict';

const { escapeHtml } = require('./slug.js');

// P-02 (4T-0176): Whitelist-Sanitizer fuer ROHES HTML im Portable-Modus.
// Der Marker schaltet html:true; jede fremde Datei kann ihn tragen. Der
// Zweck des Markers ist allein das Rendern der eigenen exportierten
// HTML-Tabellen — deshalb werden nur deren Tags/Attribute durchgelassen
// (kalibriert am Output von convertMarkdownPortable: table/colgroup/col/
// thead/tbody/tr/th/td/span/div/br/mark/a mit colspan/rowspan/class/style/
// align/href). Gefiltert wird gezielt an den html_block-/html_inline-
// Render-Rules: der regulaere markdown-it-Output (KaTeX, Callouts,
// Task-Listen) bleibt unberuehrt. Entscheidung GEGEN eine Sanitizer-
// Dependency (DOMPurify): die enge Whitelist ueber DOMParser/Tag-Parsing
// reicht fuer den klar umrissenen Zweck (Begruendung im Task 4T-0176).
const PORTABLE_HTML_ALLOWED_TAGS = new Set([
  'table',
  'colgroup',
  'col',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'span',
  'div',
  'br',
  'mark',
  'a',
]);
const PORTABLE_HTML_ALLOWED_ATTRS = new Set([
  'colspan',
  'rowspan',
  'class',
  'style',
  'align',
  'href',
  'title',
]);

// Block-HTML (in sich geschlossene Fragmente): per DOMParser filtern.
// Nicht erlaubte Elemente werden samt Inhalt entfernt (deckt <style>,
// <form>, <script>, <iframe> ab); nicht erlaubte Attribute und
// javascript:-hrefs werden gestrippt.
function sanitizePortableHtmlBlock(rawHtml) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(`<body>${rawHtml}</body>`, 'text/html');
  } catch {
    return escapeHtml(rawHtml);
  }
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (!PORTABLE_HTML_ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!PORTABLE_HTML_ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' && /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return doc.body.innerHTML;
}

// Inline-HTML kommt tokenweise (oeffnender und schliessender Tag getrennt);
// pro Token wird der Tag-Name geprueft und neu aufgebaut. Nicht erlaubte
// Tags erscheinen escaped als sichtbarer Text statt zu rendern.
function sanitizePortableHtmlInline(src) {
  const m = String(src).match(/^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/)?>$/);
  if (!m) return escapeHtml(src);
  const closing = !!m[1];
  const tag = m[2].toLowerCase();
  if (!PORTABLE_HTML_ALLOWED_TAGS.has(tag)) return escapeHtml(src);
  if (closing) return `</${tag}>`;
  const attrs = [];
  const attrRe = /([a-zA-Z-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let am;
  while ((am = attrRe.exec(m[3])) !== null) {
    const name = am[1].toLowerCase();
    if (!PORTABLE_HTML_ALLOWED_ATTRS.has(name)) continue;
    const value = am[2] || '""';
    // B-01 (4T-0307): Roh-Wert bestimmen (mit oder ohne umschliessende
    // Quotes) und IMMER neu escapen, bevor er in ein doppelt-gequotetes
    // Attribut zurueckgebaut wird. Ohne Re-Escape brach ein einfach-
    // gequoteter Wert mit eingebettetem " aus (`title='x" onX="…'` wurde
    // zu zwei Attributen) und schleuste einen Event-Handler ein.
    const bare = /^["']/.test(value) ? value.slice(1, -1) : value;
    if (name === 'href' && /^\s*(javascript|data|vbscript):/i.test(bare)) continue;
    attrs.push(`${name}="${escapeHtml(bare)}"`);
  }
  return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${m[4] ? ' /' : ''}>`;
}

module.exports = {
  PORTABLE_HTML_ALLOWED_TAGS,
  PORTABLE_HTML_ALLOWED_ATTRS,
  sanitizePortableHtmlBlock,
  sanitizePortableHtmlInline,
};
