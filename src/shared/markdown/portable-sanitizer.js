// 4T-000994 (Epic 3E-000196): aus src/shared/markdown/markdown.js geschnitten.
// Whitelist-Sanitizer des Portable-Modus. Er haengt an den Roh-HTML-Render-
// Rules der mdPortable-Instanz (html_block/html_inline) und ist der einzige
// Teil des Moduls, der ohne Beruehrung des Pipeline-Kerns ausziehen konnte
// (Entscheidung E2 der Bestandsaufnahme 4T-000964): keine Beteiligung am
// CJS-Zyklus mit perspective-table, kein Export-Reassignment, keine
// Abhaengigkeit von der Initialisierungs-Reihenfolge.
//
// Electron-frei und ohne DOM zur Ladezeit: Der DOMParser des Block-Zweigs
// wird erst im Aufruf referenziert und faellt in Node auf Escaping zurueck.
'use strict';

const { escapeHtml } = require('./slug.js');

// P-02 (4T-000176): Whitelist-Sanitizer fuer ROHES HTML im Portable-Modus.
// Der Marker schaltet html:true; jede fremde Datei kann ihn tragen. Der
// Zweck des Markers ist allein das Rendern der eigenen exportierten
// HTML-Tabellen — deshalb werden nur deren Tags/Attribute durchgelassen
// (kalibriert am Output von convertMarkdownPortable: table/colgroup/col/
// thead/tbody/tr/th/td/span/div/br/mark/a mit colspan/rowspan/class/style/
// align/href). Gefiltert wird gezielt an den html_block-/html_inline-
// Render-Rules: der regulaere markdown-it-Output (KaTeX, Callouts) bleibt
// unberuehrt. Ausnahme Task-Listen (4T-001918, gemessen): Das Kästchen samt
// `<label>` und der Kasten eines erweiterten Aufgaben-Zustands entstehen
// als Roh-HTML-Stücke und liefen deshalb durch den Inline-Weg; die portable
// Pipeline setzt sie vorher in Zeichen um (kaestchenAlsZeichenPlugin in
// plugins/tasks.js), beim Anzeigen wie beim Zell-Export. Entscheidung GEGEN eine
// Sanitizer-Dependency (DOMPurify): die enge Whitelist ueber DOMParser/
// Tag-Parsing reicht fuer den klar umrissenen Zweck (Begruendung im Task
// 4T-000176).
//
// 4T-001918 (Epic 3E-000340): Die Liste ist um die Elemente gewachsen, die
// nur Text gliedern (Entscheidung des Product Owners vom 2026-09-23, Option
// D) — jedes ohne eigenes Attribut, die Attribut-Liste ist unverändert. Was
// nicht auf ihr steht, wird seither AUSGEPACKT statt samt Inhalt entfernt;
// nur die Elemente der zweiten Liste PORTABLE_HTML_DROP_WITH_CONTENT gehen
// weiterhin samt Inhalt.
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
  // 4T-001471 (Epic 3E-000178): Die eingebrannten Diagramme des portablen
  // Exports sind Bilder mit Data-Adresse. Der Zusatz ist bewusst schmal —
  // ein Tag, zwei Attribute — und `src` traegt eine eigene Schranke unten.
  'img',
  // 4T-001918: Text-Auszeichnung (9) — fett, kursiv, Code-Spanne,
  // durchgestrichen, tief- und hochgestellt, eingefügt, gelöscht, Abkürzung.
  'strong',
  'em',
  'code',
  's',
  'sub',
  'sup',
  'ins',
  'del',
  'abbr',
  // 4T-001918: Gliederung (17) — Absatz, Listen, Überschriften, Zitat,
  // Code-Block, Trennlinie, Definitionsliste und der Fußnoten-Block.
  'p',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'hr',
  'dl',
  'dt',
  'dd',
  'section',
  // Bewusst NICHT aufgenommen: `svg` und `path` (inline Grafik, Begründung
  // aus 4T-001471 — das Symbol im Kopf eines Hinweis-Kastens fehlt deshalb),
  // `label` und `input` (Eingabefelder; der Zell-Export schreibt Aufgaben-
  // Kästchen als Zeichen).
]);

// 4T-001918: Die zweite Liste — Elemente, deren Inhalt nie Anzeige-Text ist
// oder vom Parser anders gelesen wird. Sie werden im Block-Weg samt Inhalt
// entfernt statt ausgepackt. Ursprung ist die Voreinstellung FORBID_CONTENTS
// von DOMPurify 3.4.5 (node_modules/dompurify, kommt mit der Diagramm-
// Bibliothek) ohne `colgroup` und `thead`, die hier erlaubte Elemente sind;
// `annotation-xml`, `mi`, `mn`, `mo`, `ms` und `mtext` sind dort die
// Unter-Elemente von `math`. Vorsorglich ergänzt: `object`, `embed`,
// `textarea`, `select`.
const PORTABLE_HTML_DROP_WITH_CONTENT = new Set([
  'annotation-xml',
  'audio',
  'desc',
  'foreignobject',
  'head',
  'iframe',
  'math',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'script',
  'style',
  'svg',
  'template',
  'title',
  'video',
  'xmp',
  'object',
  'embed',
  'textarea',
  'select',
]);
const PORTABLE_HTML_ALLOWED_ATTRS = new Set([
  'colspan',
  'rowspan',
  'class',
  'style',
  'align',
  'href',
  'title',
  'src',
  'alt',
  // 4T-001556 (Epic 3E-000298): Die Kopfzellen des Exports tragen `scope` —
  // die Angabe, ob eine Kopfzelle fuer ihre Spalte oder ihre Zeile gilt.
  // Ohne sie muss ein Vorleseprogramm raten. Das Attribut ist rein
  // beschreibend, traegt keine Adresse und keinen ausfuehrbaren Inhalt; es
  // traegt trotzdem eine eigene Schranke unten, weil die Positivliste eine
  // Sicherheits-Grenze ist und so wenig durchlaesst wie noetig.
  'scope',
]);

// 4T-001556 (Epic 3E-000298): Schranke fuer `scope`. Erlaubt sind genau die
// vier Werte des HTML-Standards; jeder andere Wert laesst das Attribut
// entfallen, waehrend das Element bleibt. Bauform wie die `src`-Schranke
// darunter — dieselbe Stelle, derselbe Stil.
const PORTABLE_SCOPE_WERTE = new Set(['col', 'row', 'colgroup', 'rowgroup']);

function erlaubterScopeWert(wert) {
  return PORTABLE_SCOPE_WERTE.has(String(wert).trim().toLowerCase());
}

// 4T-001471 (Epic 3E-000178): Schranke fuer `src`. Erlaubt ist ausschliesslich
// eine eingebettete Bild-Adresse. Eine freie Adresse waere ein Rueckkanal:
// Eine fremde Datei mit dem Portable-Marker koennte ueber ein Bild mit
// http-Adresse beim blossen Oeffnen die Adresse des Lesers melden. Bewusst
// enger als die Zulassung des Tags selbst.
function erlaubteBildAdresse(wert) {
  return String(wert).trim().toLowerCase().startsWith('data:image/');
}

// 4T-001918 (Epic 3E-000340): Schranke für eine Bild-Adresse RELATIV ZUM
// DOKUMENT (Entscheidung des Product Owners vom 2026-09-23, Option B). Gilt
// zusätzlich zu `erlaubteBildAdresse`, aber nur am `src` eines `img` — nie im
// Stil-Wert, dessen Schranke oben allein die eingebettete Adresse kennt.
// Zulässig ist eine Adresse, die nach Trimmen und Entschlüsseln der
// `%`-Kodierung kein Schema trägt (kein Doppelpunkt vor dem ersten `/`, `?`
// oder `#`, damit auch kein Laufwerk `C:`), nicht mit `/` oder `\` beginnt
// (weder absoluter Pfad noch Freigabe `//rechner` oder `\\rechner`) und kein
// Steuerzeichen enthält. Eine nicht entschlüsselbare Adresse gilt als
// abgelehnt. Die weitere Behandlung — nur aus dem Ordner des Dokuments bzw.
// dem gebundenen Bereich, nur Bild-Endungen, Größen-Grenze — übernimmt die
// Bild-Umwandlung der Anwendung (src/main/preload-images.js).
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f]/;

function erlaubteRelativeBildAdresse(wert) {
  const roh = String(wert).trim();
  if (roh === '' || STEUERZEICHEN.test(roh)) return false;
  let klar;
  try {
    klar = decodeURIComponent(roh);
  } catch {
    return false;
  }
  if (STEUERZEICHEN.test(klar)) return false;
  if (/^\s*[/\\]/.test(klar)) return false;
  return !/^[^/?#]*:/.test(klar);
}

function erlaubteImgQuelle(wert) {
  return erlaubteBildAdresse(wert) || erlaubteRelativeBildAdresse(wert);
}

// 4T-002068 (Epic 3E-000344): Schranke für `style`. Ein Stil-Wert lädt über
// `url(…)` ein Bild an der `src`-Schranke vorbei — als Datei-, Freigabe- oder
// Netz-Adresse beim bloßen Öffnen. Zulässig ist eine Adresse im Stil-Wert
// deshalb nur, wenn sie die `src`-Schranke besteht; geprüft wird jede
// `url(`-Stelle, gleich in welcher Schreibung und mit welchem Leerraum. Was
// sich nicht sicher beurteilen lässt, gilt als unzulässig: ein Backslash
// (CSS-Escape, etwa `\75rl(`), ein Kommentar, ein `@` und die Funktionen,
// deren Zeichenketten selbst Adressen sind (`image-set`, `image`, `src`).
// Bauform wie bei `src`: Das Attribut entfällt, das Element bleibt.
const STIL_UNBEURTEILBAR = /\\|\/\*|@|(?:image-set|\bimage|\bsrc)\s*\(/i;

function erlaubterStilWert(wert) {
  const text = String(wert);
  if (STIL_UNBEURTEILBAR.test(text)) return false;
  for (const treffer of text.matchAll(/url\s*\(/gi)) {
    const rest = text.slice(treffer.index + treffer[0].length);
    const argument = rest.match(/^\s*(?:"([^"]*)"|'([^']*)'|([^\s"'()]*))\s*\)/);
    if (!argument) return false;
    if (!erlaubteBildAdresse(argument[1] || argument[2] || argument[3] || '')) return false;
  }
  return true;
}

// Block-HTML (in sich geschlossene Fragmente): per DOMParser filtern.
// 4T-001918: Ein nicht erlaubtes Element wird AUSGEPACKT — es entfällt, sein
// Inhalt bleibt an seiner Stelle und wird, weil er in der vorab gezogenen
// Element-Liste steht, seinerseits geprüft. Die Elemente der zweiten Liste
// (Skript, Stil, eingebettete Seite, Formular-Felder, Grafik- und Formel-
// Inseln, Ton und Film) gehen weiterhin samt Inhalt. Nicht erlaubte
// Attribute und javascript:-hrefs werden gestrippt.
function sanitizePortableHtmlBlock(rawHtml) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(`<body>${rawHtml}</body>`, 'text/html');
  } catch {
    return escapeHtml(rawHtml);
  }
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (PORTABLE_HTML_DROP_WITH_CONTENT.has(tag)) {
      el.remove();
      continue;
    }
    if (!PORTABLE_HTML_ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!PORTABLE_HTML_ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' && /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      } else if (
        name === 'src' &&
        !(tag === 'img' ? erlaubteImgQuelle(attr.value) : erlaubteBildAdresse(attr.value))
      ) {
        el.removeAttribute(attr.name);
      } else if (name === 'style' && !erlaubterStilWert(attr.value)) {
        el.removeAttribute(attr.name);
      } else if (name === 'scope' && !erlaubterScopeWert(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return doc.body.innerHTML;
}

// Inline-HTML kommt tokenweise (oeffnender und schliessender Tag getrennt);
// pro Token wird der Tag-Name geprueft und neu aufgebaut. 4T-001918: Ein
// nicht erlaubtes Tag ENTFÄLLT, statt escaped als sichtbarer Text zu
// erscheinen; der Text zwischen zwei Tags ist ohnehin ein eigenes Stück und
// bleibt gewöhnlicher Text. Ein Stück, das kein einzelnes Tag ist
// (Kommentar, Deklaration), erscheint weiterhin escaped.
function sanitizePortableHtmlInline(src) {
  const m = String(src).match(/^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/)?>$/);
  if (!m) return escapeHtml(src);
  const closing = !!m[1];
  const tag = m[2].toLowerCase();
  if (!PORTABLE_HTML_ALLOWED_TAGS.has(tag)) return '';
  if (closing) return `</${tag}>`;
  const attrs = [];
  const attrRe = /([a-zA-Z-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let am;
  while ((am = attrRe.exec(m[3])) !== null) {
    const name = am[1].toLowerCase();
    if (!PORTABLE_HTML_ALLOWED_ATTRS.has(name)) continue;
    const value = am[2] || '""';
    // B-01 (4T-000307): Roh-Wert bestimmen (mit oder ohne umschliessende
    // Quotes) und IMMER neu escapen, bevor er in ein doppelt-gequotetes
    // Attribut zurueckgebaut wird. Ohne Re-Escape brach ein einfach-
    // gequoteter Wert mit eingebettetem " aus (`title='x" onX="…'` wurde
    // zu zwei Attributen) und schleuste einen Event-Handler ein.
    const bare = /^["']/.test(value) ? value.slice(1, -1) : value;
    if (name === 'href' && /^\s*(javascript|data|vbscript):/i.test(bare)) continue;
    if (name === 'src' && !(tag === 'img' ? erlaubteImgQuelle(bare) : erlaubteBildAdresse(bare)))
      continue;
    if (name === 'style' && !erlaubterStilWert(bare)) continue;
    if (name === 'scope' && !erlaubterScopeWert(bare)) continue;
    attrs.push(`${name}="${escapeHtml(bare)}"`);
  }
  return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${m[4] ? ' /' : ''}>`;
}

module.exports = {
  PORTABLE_HTML_ALLOWED_TAGS,
  PORTABLE_HTML_ALLOWED_ATTRS,
  PORTABLE_HTML_DROP_WITH_CONTENT,
  sanitizePortableHtmlBlock,
  sanitizePortableHtmlInline,
};
