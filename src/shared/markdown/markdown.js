// 4T-0179 (Epic 3E-0039): aus src/main/preload.js extrahiert.
// Markdown-Pipeline: md (Viewer, html:false) und mdPortable (html:true mit
// P-02-Whitelist-Sanitizer), Plugin-Verkabelung in Original-Reihenfolge,
// perspective-table-Fence-Hook und der Portable-Konverter. Electron-frei: das
// Modul ist ohne Electron/DOM ladbar (der DOMParser im Block-Sanitizer
// wird erst im Aufruf referenziert und faellt in Node auf Escaping zurueck).
//
// 4T-0292 (Epic 3E-0052): Der Instanz-Aufbau ist in buildPipelines(enabled)
// parametrisiert. configureExtensions(disabledIds) baut beide Instanzen mit
// dem aktiven Plugin-Satz neu auf (Erweiterungs-Registry in
// src/shared/extensions.js; Schalt-Zustand kommt wie bei
// configureTaskStates von aussen — Renderer beim App-Start und bei jedem
// extensions:changed-Broadcast). Default ist alles eingeschaltet, damit
// Unit-/Snapshot-Tests deterministisch ohne Store laufen. Die Exporte
// md/mdPortable werden beim Neuaufbau neu zugewiesen; Konsumenten
// (perspective-table.js) greifen lazy per require('./markdown.js').md zu
// und sehen immer die aktuelle Instanz.
'use strict';

const MarkdownIt = require('markdown-it');
const taskLists = require('markdown-it-task-lists');
const markdownItAnchor = require('markdown-it-anchor');
const markdownItKatex = require('@vscode/markdown-it-katex').default;
const markdownItMark = require('markdown-it-mark');
const markdownItFootnote = require('markdown-it-footnote');

const { escapeHtml, githubLikeSlug } = require('./slug.js');
const { extractFrontmatter } = require('./frontmatter.js');
const { effectiveDisabledSet } = require('../extensions.js');
const {
  sourceLineMapperPlugin,
  headingNumbersPlugin,
  listRestartPlugin,
  wikiLinksPlugin,
  wikiEmbedsPlugin,
  tagsPlugin,
  blockAnchorsPlugin,
  calloutsPlugin,
  lineBlocksPlugin,
  customContainersPlugin,
  superscriptPlugin,
  spoilerPlugin,
  criticMarkupPlugin,
  extendedTaskStatesPlugin,
  taskMarkersPlugin,
  stripPercentComments,
  stripHeadingMarkers,
  // 4T-0546 (Epic 3E-0097): Kalender-Wert-Badges @{Kalendername: Wert}.
  calendarValuesPlugin,
  CALENDAR_SPAN_LABEL_KEYS,
} = require('./plugins.js');
const {
  renderPerspectiveTable,
  convertPerspectiveTableBlockToHtml,
} = require('./perspective-table.js');
// 4T-0418 (Epic 3E-0079): Perspective Datatable — Grid-HTML für den Fence-
// Override und statische Tabellen-Konvertierung für den Portable-Export.
const {
  renderPerspectiveDatatableViewer,
  convertPerspectiveDatatableBlockToHtml,
} = require('./perspective-datatable.js');
// 4T-0512 (Epic 3E-0092): Ereignis-Fence — Tabellen-HTML für den Fence-
// Override und statische Tabellen-Konvertierung für den Portable-Export.
const {
  localTodayIso,
  renderPerspectiveEventsViewer,
  convertPerspectiveEventsBlockToHtml,
  PORTABLE_EVENT_LABEL_KEYS,
} = require('./perspective-events.js');

// 4T-0023: highlight.js als Core-Bundle plus kuratierte Sprachliste. Damit
// landet nur das benoetigte Set im Bundle, nicht das gesamte Default-Bundle
// mit ueber 190 Sprachen. Aliase wie js/ts/sh/py/c#/c++ deckt highlight.js
// intern ueber die jeweiligen language-Definitionen ab.
const hljs = require('highlight.js/lib/core');
const HLJS_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'csharp',
  'cpp',
  'go',
  'rust',
  'bash',
  'sql',
  'json',
  'yaml',
  'xml',
  'css',
  'markdown',
  'plaintext',
];
for (const lang of HLJS_LANGUAGES) {
  try {
    const def = require(`highlight.js/lib/languages/${lang}`);
    hljs.registerLanguage(lang, def);
  } catch (err) {
    console.warn(`hljs: Sprache '${lang}' konnte nicht geladen werden:`, err.message);
  }
}
// HTML wird vom xml-Modul mitabgedeckt.

// 4T-0023: Syntax-Highlighting fuer Fenced-Code-Bloecke mit Sprach-Tag.
// Keine Auto-Detection ohne Tag — Fehlerkennungen bei kurzen Snippets
// stiften mehr Verwirrung als Nutzen. Unbekannte Sprache und Tokenizer-
// Fehler fallen still auf den Plain-Block mit hljs-Klasse zurueck. Die
// `language-<tag>`-Klasse wird auch bei unbekannten Tags mitgesetzt, damit
// das Renderer-seitige Post-Processing (z.B. Mermaid in 4T-0021) Bloecke
// zuverlaessig per Klassennamen finden kann. Gemeinsamer Callback beider
// Instanzen (4T-0292: aus den Konstruktor-Optionen extrahiert).
function highlightFence(str, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const value = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      return `<pre><code class="hljs language-${escapeHtml(lang)}">${value}</code></pre>`;
    } catch {
      // Fall durch zum Plain-Fallback
    }
  }
  const classes = lang ? `hljs language-${escapeHtml(lang)}` : 'hljs';
  return `<pre><code class="${classes}">${escapeHtml(str)}</code></pre>`;
}

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

// K-12 (4T-0189): Waehrend der Export-Konvertierung geben die KaTeX-
// Renderer-Rules den Formel-QUELLTEXT zurueck statt KaTeX-HTML. Der
// Schalter liegt bewusst auf globalThis (Zaehler, reentranz-sicher):
// die Zell-Konvertierung laeuft ueber den CJS-Zyklus perspective-table.js <->
// markdown.js, der unter Bundler-/Test-Loadern (vite-node) zu einer
// zweiten Modul-Instanz fuehren kann — ein Modul-lokaler Zustand oder
// md.disable() wuerde dann die falsche Instanz treffen.
const PORTABLE_MATH_OFF_FLAG = '__perspectivePortableMathOff';
function disablePortableMath() {
  globalThis[PORTABLE_MATH_OFF_FLAG] = (globalThis[PORTABLE_MATH_OFF_FLAG] || 0) + 1;
}
function enablePortableMath() {
  globalThis[PORTABLE_MATH_OFF_FLAG] = Math.max(0, (globalThis[PORTABLE_MATH_OFF_FLAG] || 0) - 1);
}

// 4T-0041: Marker am Anfang einer konvertierten Datei. Wird in renderMarkdown
// erkannt und schaltet die Datei auf mdPortable (html:true), damit die
// eingebetteten HTML-Tabellen im Viewer als Tabellen rendern statt als
// escapter Quelltext. Bei rekursiven Konverter-Aufrufen (Zell-Inhalt mit
// innerer perspective-table) wird der Marker NICHT vorangestellt, weil er nur
// einmal an der Datei-Spitze stehen soll.
const PERSPECTIVE_PORTABLE_MARKER = '<!-- perspective-portable -->';

// --- 3E-0017: Markdown-Erweiterungen (0.27.0) ---------------------------
// Gemeinsamer Erweiterungs-Block des Epics (4T-0197 ff.): alle neuen
// Plugin-Registrierungen laufen fuer md UND mdPortable ueber
// registerMarkdownExtensions, damit die Reihenfolge in beiden Instanzen
// identisch bleibt. Portable-spezifische Render-Rules (inline-Styles)
// folgen direkt nach dem Block in buildPipelines.
const { full: emojiFull } = require('markdown-it-emoji');
const markdownItAbbr = require('markdown-it-abbr');
// 4T-0198: markdown-it-imsize (reines CJS) statt @mdit/plugin-img-size —
// dessen exports-Map loest unter Electrons Node 20 via require() auf den
// ESM-Build auf (ERR_REQUIRE_ESM, Preload-Abbruch; unter System-Node 22
// kaschiert require(esm) das Problem). Verifiziert am 2026-06-12.
const markdownItImsize = require('markdown-it-imsize');
const markdownItImplicitFigures = require('markdown-it-implicit-figures');
const markdownItDeflist = require('markdown-it-deflist');
const markdownItSub = require('markdown-it-sub');
const markdownItIns = require('markdown-it-ins');
const markdownItBracketedSpans = require('markdown-it-bracketed-spans');
const markdownItAttrs = require('markdown-it-attrs');
// 4T-0595 (Epic 3E-0111): Inline-Berechnungen {= Ausdruck =} über die
// Query-Ausdrucks-Engine; 4T-0596: Export-Konverter (Ergebnis-Spans).
const { inlineCalcPlugin, convertInlineCalc } = require('./inline-calc.js');

// 4T-0292/4T-0293: enabled(id) liefert den effektiven Aktiv-Zustand einer
// Erweiterungs-ID (Kern bzw. noch nicht registrierte IDs sind immer
// aktiv). Jede Registrierung steht unter der Guard ihrer Erweiterung;
// deaktivierte Syntax bleibt regulaerer Fliesstext bzw. Standard-Markdown.
function registerMarkdownExtensions(mdInstance, opts = {}) {
  const enabled = opts.enabled || (() => true);
  // 4T-0197: Emoji-Shortcodes `:smile:` -> Unicode-Zeichen (full-Set,
  // GitHub-kompatibel inkl. Aliase wie `:+1:`). shortcuts:{} schaltet die
  // Emoticon-Kurzformen (`:)`, `8-)`) bewusst ab — GitHub wandelt sie
  // nicht um, und im Fliesstext waeren Fehlpositive (z.B. `8-)` am
  // Klammer-Ende) unvermeidbar. Nur echte `:code:`-Shortcodes sind aktiv;
  // unbekannte Codes und Doppelpunkt-Muster (Uhrzeiten, URLs) bleiben
  // unveraendert Text (Plugin-Heuristik).
  if (enabled('emoji')) mdInstance.use(emojiFull, { shortcuts: {} });
  // 4T-0197: Abbreviations `*[HTML]: Langtext` (Pandoc/PHP-Markdown-Extra).
  // Definitionszeile verschwindet aus dem Output; jedes Wort-Vorkommen
  // wird zu <abbr title="Langtext">.
  if (enabled('abbreviations')) mdInstance.use(markdownItAbbr);
  // 4T-0198: Image Size `![alt](url =100x200)` (auch `=100x`/`=x200`);
  // width/height landen als numerische HTML-Attribute (kein style-Pfad),
  // ungueltige Suffixe bleiben Roh-Text. Registrierung VOR implicit-
  // figures, damit das Figure-Wrapping auf dem bereits groessen-
  // annotierten image-Token aufsetzt. 4T-0293: mit implicit-figures als
  // Erweiterung 'figures' gebuendelt (beide veraendern die Bild-
  // Darstellung und greifen am selben Bild ineinander).
  if (enabled('figures')) mdInstance.use(markdownItImsize);
  // 4T-0198: Implicit Figures — ein Bild, das allein in einem Absatz
  // steht, wird zu <figure> mit <figcaption> aus dem alt-Text (Pandoc-
  // Konvention). keepAlt:true behaelt den alt-Text am <img> (Pandoc-
  // Verhalten, Accessibility); Fliesstext-Bilder bleiben unveraendert.
  // Wiki-Embeds `![[...]]` laufen ueber das eigene wikiembed-Token und
  // bleiben aussen vor (per Fixture abgesichert).
  if (enabled('figures')) {
    mdInstance.use(markdownItImplicitFigures, { figcaption: 'alt', keepAlt: true });
  }
  // 4T-0199: Definition Lists `Begriff` + `: Definition` (Pandoc).
  // Marker ':' oder '~' mit 0-2 Spaces Einrueckung und Whitespace danach;
  // ueber Leerzeilen getrennte Term-Gruppen verschmelzen zu EINEM <dl>
  // (Plugin-Verhalten, empirisch verifiziert — der Live-Scan spiegelt es).
  if (enabled('definition-lists')) mdInstance.use(markdownItDeflist);
  // 4T-0199: Pandoc Line Blocks `| Zeile` als eigenes Plugin (kein
  // tragfaehiges Fremd-Plugin; Architekturentscheidung 4 des Epics).
  if (enabled('line-blocks')) mdInstance.use(lineBlocksPlugin);
  // 4T-0200: Custom Containers `::: name` — bekannte Callout-Typen in
  // Callout-Optik (gemeinsame Helper, Architekturentscheidung 2),
  // unbekannte Namen als neutrale custom-container-Box.
  if (enabled('custom-containers')) {
    mdInstance.use(customContainersPlugin, { portable: opts.portable });
  }
  // 4T-0201: Subscript `H~2~O` -> <sub> (Single-Tilde; GFM-Strikethrough
  // `~~Text~~` bleibt unberuehrt, kein Whitespace im Inhalt) und
  // Insertion/Underline `++Text++` -> <ins>. Beide selbsttragend im
  // Portable-Export (Browser-Default-Rendering, keine Inline-Styles).
  // 4T-0293: Sub, Ins und Superscript als Erweiterung 'typography'
  // gebuendelt (drei kleine Inline-Konstrukte derselben Familie).
  if (enabled('typography')) {
    mdInstance.use(markdownItSub);
    mdInstance.use(markdownItIns);
    // 4T-0201: Superscript `x^^2^^` -> <sup> als eigenes Plugin
    // (Architekturentscheidung 1: Doppel-Marker statt Pandoc-Single-Caret,
    // weil `^` durch Footnotes und Block-Anker doppelt belegt ist).
    mdInstance.use(superscriptPlugin);
  }
  // 4T-0202: Bracketed Spans `[Text]{.klasse #id}` und Heading Attributes
  // `# H {#id}`. bracketed-spans VOR attrs (verifizierte Doku-
  // Konvention); allowedAttributes hart auf id/class begrenzt — Style-/
  // Event-Injection aus Markdown-Quellen ausgeschlossen (Architektur-
  // entscheidung 3; das technische Superset an weiteren Elementtypen
  // wird akzeptiert, aber nicht beworben). attrs laeuft als
  // core.ruler.before('linkify') VOR markdown-it-anchor: die explizite
  // `{#id}` gewinnt, anchor respektiert vorhandene IDs (verifiziert).
  // 4T-0293: als Erweiterung 'attributes' gebuendelt (beide Konstrukte
  // haengen am selben attrs-Plugin und sind nicht unabhaengig schaltbar).
  if (enabled('attributes')) {
    mdInstance.use(markdownItBracketedSpans);
    mdInstance.use(markdownItAttrs, { allowedAttributes: ['id', 'class'] });
  }
  // 4T-0203: Spoiler `||Text||` (Hover-Reveal, CSS-only) und Critic
  // Markup ({++/--/~~…~>…~~/==/>>…<<}) als eigene Plugins; Critic
  // registriert sich VOR strikethrough/mark (sonst fraesse `==…==` bzw.
  // `~~…~~` das Innere). Portable-Varianten mit inline-Styles.
  if (enabled('spoiler')) mdInstance.use(spoilerPlugin, { portable: opts.portable });
  if (enabled('critic-markup')) mdInstance.use(criticMarkupPlugin, { portable: opts.portable });
  // 4T-0595 (Epic 3E-0111): Inline-Berechnungen `{= Ausdruck =}` — Ergebnis-
  // Span über die Query-Ausdrucks-Engine (kontext-frei, formatValue), Fehler
  // als dezentes Zeichen mit Tooltip. Anker ist das `=` hinter `{` (Muster
  // critic_markup); `{==` bleibt Critic-Highlight. Deaktiviert bleibt die
  // Syntax regulärer Fließtext.
  if (enabled('inline-calc')) mdInstance.use(inlineCalcPlugin, { portable: opts.portable });
  // 4T-0204: Erweiterte Task-States `[/]`, `[!]`, … als farbige Status-
  // Boxen; aktives Set via configureTaskStates (Settings-gesteuert),
  // `[ ]`/`[x]` bleiben beim task-lists-Plugin (Kern, nicht abschaltbar).
  if (enabled('task-states')) {
    mdInstance.use(extendedTaskStatesPlugin, { portable: opts.portable });
  }
  // 4T-0498 (Epic 3E-0090): Task-Marker der Erweiterung "Aufgaben" —
  // Symbol-Marker (Termine, Prioritaet, Wiederholung, IDs) am Zeilenende
  // von Task-Zeilen als Badges; Global Filter und Labels via
  // configureTaskMarkers (Settings-gesteuert). Deaktiviert bleiben die
  // Marker reiner Text (Querschnitt C des Epics). Der Ruler laeuft als
  // push nach task-lists und extended_task_states, unabhaengig von der
  // Registrierungs-Position.
  if (enabled('tasks')) {
    mdInstance.use(taskMarkersPlugin, { portable: opts.portable });
  }
  // 4T-0470 (Epic 3E-0087): Ueberschriften-Nummerierung. Der Ruler entfernt
  // die Zeilenende-Marker {-}/{+} und stellt die berechneten Nummern voran
  // (Nummern nur bei aktiver Einstellung ueber env.headingNumbering).
  // Deaktiviert bleiben die Marker Literal-Text (Plugin nicht registriert).
  if (enabled('heading-numbering')) {
    mdInstance.use(headingNumbersPlugin, { portable: opts.portable });
  }
  // 4T-0660 (Epic 3E-0112): Leerzeile beginnt eine neue nummerierte Liste
  // (bewusste Abweichung von der Standard-Interpretation, PO-Festlegung vom
  // 2026-07-21). Haengt an derselben Erweiterung wie die Struktur-Kommandos,
  // weil beide dieselbe Listen-Grenze voraussetzen: deaktiviert zaehlt die
  // Anzeige wieder standardkonform ueber die Leerzeile hinweg durch.
  if (enabled('outliner')) {
    mdInstance.use(listRestartPlugin);
  }
}

// --- Pipeline-Aufbau (4T-0292) -----------------------------------------------------
// Baut beide markdown-it-Instanzen mit dem aktiven Plugin-Satz auf.
// enabled(id) -> bool entscheidet pro Erweiterungs-ID; die Registrierungs-
// Reihenfolge bleibt fuer jede Teilmenge strukturell identisch zur
// Original-Reihenfolge (Kommentare an den einzelnen Registrierungen).
function buildPipelines(enabled) {
  // markdown-it mit GFM-naher Konfiguration.
  const md = new MarkdownIt({
    html: false, // Sicherheit: kein rohes HTML aus Markdown
    linkify: true, // Auto-Links
    typographer: true,
    breaks: false,
    // 4T-0293: ohne Code-Highlighting-Erweiterung rendert markdown-it den
    // Default-Fence (escaped, mit language-Klasse — die Mermaid-Erkennung
    // im Renderer findet ihre Bloecke weiterhin per Klassennamen).
    highlight: enabled('code-highlight') ? highlightFence : undefined,
  });
  // K-11 (4T-0186): enabled bleibt hier false — markdown-it-task-lists haelt
  // seine Optionen als MODUL-GLOBALE Variablen, der spaetere use()-Aufruf
  // fuer mdPortable wuerde ein enabled:true ohnehin wieder ueberschreiben.
  // Der Viewer aktiviert die Checkboxen DOM-seitig in der Render-
  // Nachverarbeitung (enableTaskCheckboxes in applyRenderPipeline) und
  // toggelt den Quelltext ueber das data-source-line-Mapping; der
  // Portable-Export bleibt als statisches Dokument disabled.
  md.use(taskLists, { enabled: false, label: true });

  md.use(markdownItAnchor, {
    slugify: githubLikeSlug,
    tabIndex: false,
    permalink: false,
  });

  // 4T-0022: KaTeX-Mathematik. Inline `$…$` und Block `$$…$$`. Das Plugin
  // erkennt `$` nur dann als Delimiter, wenn die umgebenden Zeichen die
  // Heuristik erfuellen (kein Whitespace direkt neben dem inneren Inhalt) —
  // damit bleiben Dollar-Betraege wie `$5 bis $10` Fliesstext. Syntaxfehler
  // werden rot inline angezeigt statt den Render-Pane abzuschiessen.
  // 4T-0292: als Erweiterung 'katex' schaltbar — deaktiviert bleibt `$…$`
  // regulaerer Fliesstext.
  if (enabled('katex')) {
    md.use(markdownItKatex, {
      throwOnError: false,
      errorColor: '#cc0000',
    });
  }

  // 4T-0062 (Epic 3E-0012): Highlight `==Text==` als <mark>-Element. Inline-
  // Token, Escape `\==` bleibt Klartext. Registrierung NACH KaTeX, damit das
  // `==` in `$...$`-Math-Bloecken nicht als Highlight interpretiert wird.
  if (enabled('highlight')) md.use(markdownItMark);

  // 4T-0063 (Epic 3E-0012): Footnotes. Klassisch `[^id]` mit `[^id]: Def` am
  // Datei-Ende, plus Inline-Variante `^[Direkt hier]`. Library-Default rendert
  // hochgestellte Zahlen mit Anchor-Link plus Backlink im Fussnoten-Block.
  if (enabled('footnotes')) md.use(markdownItFootnote);

  // 4T-0070 (Epic 3E-0012): Source-Line-Mapping fuer die Scroll-Synchronisation
  // in der geteilten Ansicht. Markiert jedes Block-Open-Token mit einem
  // data-source-line-Attribut, das die Start-Zeile der Quelle traegt
  // (1-basiert). Damit kann der Renderer die Zeilen-Position aus dem DOM
  md.use(sourceLineMapperPlugin);
  // 4T-0294: Wiki-Syntax als Vernetzungs-Erweiterungen — Block-Anker
  // gehoeren zur Wiki-Link-Erweiterung (sie existieren als Ziel-Anker der
  // `[[Datei#^id]]`-Form); Embeds haengen deklarativ an wiki-links.
  if (enabled('wiki-links')) {
    md.use(wikiLinksPlugin);
    md.use(blockAnchorsPlugin);
  }
  if (enabled('wiki-embeds')) md.use(wikiEmbedsPlugin);
  if (enabled('tags')) md.use(tagsPlugin);
  if (enabled('callouts')) md.use(calloutsPlugin, { portable: false });
  // 4T-0546 (Epic 3E-0097): Kalender-Wert-Badges; deaktiviert bleibt
  // @{…} regulaerer Fliesstext (Workshop-Punkt 7).
  if (enabled('custom-calendars')) md.use(calendarValuesPlugin, { portable: false });

  const mdPortable = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: enabled('code-highlight') ? highlightFence : undefined,
  });
  mdPortable.use(taskLists, { enabled: false, label: true });
  mdPortable.use(markdownItAnchor, { slugify: githubLikeSlug, tabIndex: false, permalink: false });
  if (enabled('katex')) {
    mdPortable.use(markdownItKatex, { throwOnError: false, errorColor: '#cc0000' });
  }
  // 4T-0062: Highlight `==Text==` auch im portablen Export. Custom Render-Rule
  // mit inline-Style, damit das <mark>-Element auch ohne styles.css beim
  // Empfaenger sichtbar gelb hinterlegt erscheint.
  if (enabled('highlight')) {
    mdPortable.use(markdownItMark);
    mdPortable.renderer.rules.mark_open = () =>
      '<mark style="background:#fff3a3;padding:0 0.15em;border-radius:2px;">';
    mdPortable.renderer.rules.mark_close = () => '</mark>';
  }
  // 4T-0063: Footnotes auch im portablen Export. Inline-Styles fuer Section
  // und Reference, damit der Footnote-Block ohne externe styles.css als
  // dezent abgesetzter Bereich am Datei-Ende erscheint.
  if (enabled('footnotes')) {
    mdPortable.use(markdownItFootnote);
    mdPortable.renderer.rules.footnote_block_open = () =>
      '<section class="footnotes" style="margin-top:2em;padding-top:0.6em;' +
      'border-top:1px solid #ccc;font-size:0.9em;color:#555;">' +
      '<ol style="padding-left:1.5em;">';
    mdPortable.renderer.rules.footnote_block_close = () => '</ol></section>';
    mdPortable.renderer.rules.footnote_anchor = (tokens, idx, options, env, slf) => {
      const id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
      return ` <a href="#fnref${id}" style="text-decoration:none;">↩</a>`;
    };
  }
  if (enabled('wiki-links')) {
    mdPortable.use(wikiLinksPlugin);
    // 4T-0054: Block-Anker auch im portablen Export.
    mdPortable.use(blockAnchorsPlugin);
  }

  // P-02 (4T-0176): Whitelist-Sanitizer an den Roh-HTML-Render-Rules des
  // Portable-Modus (Implementierung oben auf Modul-Ebene).
  mdPortable.renderer.rules.html_block = (tokens, idx) =>
    sanitizePortableHtmlBlock(tokens[idx].content);
  mdPortable.renderer.rules.html_inline = (tokens, idx) =>
    sanitizePortableHtmlInline(tokens[idx].content);
  // 4T-0055: Wiki-Embeds im portablen Export ebenfalls erkennen. Bilder
  // werden direkt als <img> ausgegeben; PDF/MD/Other-Embeds bleiben als
  // Platzhalter (das Renderer-Postprocessing wird im portablen Output
  // nicht ausgefuehrt, daher zeigen sich solche Embeds extern als leere
  // Span-Elemente). Akzeptable Einschraenkung in Stufe 1 — Bilder sind
  // der haeufigste Embed-Typ und funktionieren vollstaendig portable.
  if (enabled('wiki-embeds')) mdPortable.use(wikiEmbedsPlugin);
  // 4T-0056: Tag-Inline-Rule auch im portablen Export — die Anker-href
  // `#tag:<name>` funktioniert im portablen Output zwar nicht als Filter,
  // aber der sichtbare Text `#tag` bleibt erhalten.
  if (enabled('tags')) mdPortable.use(tagsPlugin);
  // 4T-0061: Callouts im Portable-Export. Inline-Styles statt CSS-Klassen,
  // Default-Titel zur Render-Zeit aus env.lang aufgeloest.
  if (enabled('callouts')) mdPortable.use(calloutsPlugin, { portable: true });
  // 4T-0546 (Epic 3E-0097): Kalender-Wert-Badges im Portable-Export
  // (Inline-Styles, damit die Badges ohne styles.css sichtbar bleiben).
  if (enabled('custom-calendars')) mdPortable.use(calendarValuesPlugin, { portable: true });

  registerMarkdownExtensions(md, { portable: false, enabled });
  registerMarkdownExtensions(mdPortable, { portable: true, enabled });

  // 4T-0197: Abbr im Portable-Export mit inline-Style, damit die dotted
  // Underline auch ohne styles.css beim Empfaenger erkennbar ist (Muster:
  // mark_open-Rule oben). title-Attribut traegt der Token bereits.
  if (enabled('abbreviations')) {
    mdPortable.renderer.rules.abbr_open = (tokens, idx) => {
      const title = tokens[idx].attrGet('title') || '';
      return `<abbr title="${escapeHtml(title)}" style="border-bottom:1px dotted;cursor:help;">`;
    };
  }
  // 4T-0198: Figure/Figcaption im Portable-Export mit inline-Styles
  // (zentriert, gedaempfte Caption — Optik der Viewer-CSS-Regeln).
  // figcaption_open/_close liegen als Inline-Token-Children im inline-
  // Token; Renderer-Rules wirken dort ebenso.
  if (enabled('figures')) {
    mdPortable.renderer.rules.figure_open = () =>
      '<figure style="margin:1em auto;text-align:center;">';
    mdPortable.renderer.rules.figcaption_open = () =>
      '<figcaption style="font-size:0.9em;color:#555;margin-top:0.4em;">';
  }
  // 4T-0199: Definition Lists — <dl>-Struktur ist selbsttragend, nur die
  // dd-Einrueckung bekommt einen vereinheitlichten margin (Browser-
  // Defaults schwanken).
  if (enabled('definition-lists')) {
    mdPortable.renderer.rules.dd_open = () => '<dd style="margin:0.25em 0 0.8em 1.5em;">';
  }
  // 4T-0199: Line Blocks mit inline-Styles (margin wie Absatz, pre-wrap
  // erhaelt Einrueckung und exakte Leerzeichen).
  if (enabled('line-blocks')) {
    mdPortable.renderer.rules.line_block_open = () =>
      '<div class="line-block" style="margin:1em 0;">';
    mdPortable.renderer.rules.line_block_line_open = () =>
      '<div class="line-block-line" style="white-space:pre-wrap;">';
  }
  // --- Ende 3E-0017-Erweiterungs-Block ------------------------------------

  // K-12 (4T-0189): Portable-Math-Off-Wrapper um die KaTeX-Render-Rules
  // (nur vorhanden, wenn die KaTeX-Erweiterung registriert wurde).
  for (const ruleName of [
    'math_inline',
    'math_inline_block',
    'math_inline_bare_block',
    'math_block',
  ]) {
    const orig = mdPortable.renderer.rules[ruleName];
    if (typeof orig !== 'function') continue;
    const isBlock = ruleName !== 'math_inline';
    mdPortable.renderer.rules[ruleName] = function (tokens, idx, options, env, slf) {
      if (globalThis[PORTABLE_MATH_OFF_FLAG]) {
        const content = escapeHtml(tokens[idx].content || '');
        return isBlock ? `$$${content}$$` : `$${content}$`;
      }
      return orig.call(this, tokens, idx, options, env, slf);
    };
  }

  // 4T-0034: perspective-table — MediaWiki-aehnliche Tabellen-Syntax als Fenced-Code-
  // Block mit Sprach-Tag 'perspective-table'. Stufe 1 des Epics 3E-0006: Basis-Tabelle
  // mit Caption (|+), Header-Zellen (!), Datenzellen (|), Zeilen-Trenner (|-)
  // und mehrzeiligem Markdown-Inhalt pro Zelle.
  //
  // 4T-0037 (Epic 3E-0007, Stufe 2): Zell-Attribute mit strikter Whitelist
  // (colspan, rowspan, align, valign) und Accessibility-scope auf <th>.
  //
  // Integration: ueberschreibt md.renderer.rules.fence am Ende der md-Setup-
  // Kette. Bei lang === 'perspective-table' uebernimmt renderPerspectiveTable; sonst
  // delegiert der Override an den Default-Renderer, sodass Code-Highlighting via
  // highlight.js (siehe highlight-Callback im Konstruktor) unangetastet bleibt.
  // 4T-0293 / 4T-0354: Fence-Override wird immer installiert, weil perspective-
  // query ein Kern-Konstrukt ohne Erweiterungs-Toggle ist. perspective-table
  // bleibt an seine Erweiterung gebunden; ist sie deaktiviert, fällt der Block
  // auf den Default-Code-Block zurück.
  {
    const defaultFenceRenderer = md.renderer.rules.fence;
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const info = (token.info || '').trim();
      const lang = info.split(/\s+/g)[0];
      // 4T-0354 (Epic 3E-0065): perspective-query rendert als statischer
      // Platzhalter-Container mit dem Query-Text im data-Attribut; die Datei-Liste
      // füllt der Renderer (4T-0355). escapeHtml maskiert auch die " der String-
      // Literale, sodass das data-Attribut nicht bricht.
      if (lang === 'perspective-query') {
        const q = escapeHtml(String(token.content || '').trim());
        return `<div class="perspective-query" data-fm-query="${q}"></div>\n`;
      }
      // 4T-0412 (Epic 3E-0078): perspective-script rendert als statischer
      // Platzhalter-Container mit dem Skript-Quelltext im data-Attribut.
      // Ausfuehrung und Ergebnis-Aufbau uebernimmt ausschliesslich der
      // Renderer (perspective-script-view.js) in einer isolierten Sandbox;
      // die Pipeline selbst fuehrt nie Skripte aus und kennt auch die
      // Einstellung nicht (der Aus-Zustand rendert die View als Quelltext).
      // Kern-Konstrukt wie perspective-query: das Vertrauensmodell ist die
      // Default-aus-Einstellung, kein Erweiterungs-Schalter (Epic-Festlegung).
      if (lang === 'perspective-script') {
        const src = escapeHtml(String(token.content || ''));
        return `<div class="perspective-script" data-script-source="${src}"></div>\n`;
      }
      // 4T-0417 (Epic 3E-0079): perspective-datatable rendert als Container
      // mit Fence-Index (fortlaufend pro Render-Lauf über env) und Token-
      // Zeilenbereich im Gesamt-Dokument (map + sourceLineOffset wie beim
      // sourceLineMapper) — der Grid-Editor (4T-0419) adressiert darüber
      // den Fence-Body im Quelltext. 4T-0418: Grid-HTML (Kopf, typ-
      // gerechte Zellen, Aggregat-Zeile) kommt aus dem Shared-Modul.
      // Schaltbare Erweiterung (PO-Festlegung 2026-07-09): deaktiviert
      // fällt der Block auf den Default-Code-Block zurück.
      if (lang === 'perspective-datatable' && enabled('perspective-datatable')) {
        const dtIndex =
          env && typeof env === 'object'
            ? (env.__perspectiveDatatableCount = (env.__perspectiveDatatableCount || 0) + 1) - 1
            : 0;
        const offset = (env && env.sourceLineOffset) || 0;
        const lineStart = token.map ? token.map[0] + 1 + offset : 0;
        const lineEnd = token.map ? token.map[1] + offset : 0;
        const body = String(token.content || '');
        return (
          `<div class="perspective-datatable" data-dt-index="${dtIndex}" ` +
          `data-dt-line-start="${lineStart}" data-dt-line-end="${lineEnd}" ` +
          `data-source-line="${lineStart}" data-dt-source="${escapeHtml(body)}">` +
          `${renderPerspectiveDatatableViewer(body)}</div>\n`
        );
      }
      // 4T-0512 (Epic 3E-0092): perspective-events rendert als Container
      // mit Fence-Index, Token-Zeilenbereich und Stichtag (data-ev-today,
      // Kalendertag des Render-Laufs — die Differenz-Spalte lokalisiert
      // und rechnet der Renderer in events-view.js). Adressierungs-Muster
      // identisch zur Datatable (data-ev-source für den Rückschreib-
      // Abgleich des Editors). Schaltbare Erweiterung: deaktiviert fällt
      // der Block auf den Default-Code-Block zurück.
      if (lang === 'perspective-events' && enabled('events')) {
        const evIndex =
          env && typeof env === 'object'
            ? (env.__perspectiveEventsCount = (env.__perspectiveEventsCount || 0) + 1) - 1
            : 0;
        const offset = (env && env.sourceLineOffset) || 0;
        const lineStart = token.map ? token.map[0] + 1 + offset : 0;
        const lineEnd = token.map ? token.map[1] + offset : 0;
        const body = String(token.content || '');
        // 4T-0514: Stichtag, Sprache und aufgeloeste Labels fuer die
        // Zusatz-Ansichten (die Tabelle lokalisiert weiter der Renderer
        // ueber data-i18n; der Client baut Ansichten mit t() neu).
        const evToday = localTodayIso();
        const evLang = (env && env.lang) || 'de';
        return (
          `<div class="perspective-events" data-ev-index="${evIndex}" ` +
          `data-ev-line-start="${lineStart}" data-ev-line-end="${lineEnd}" ` +
          `data-source-line="${lineStart}" data-ev-source="${escapeHtml(body)}" ` +
          `data-ev-today="${evToday}">` +
          `${renderPerspectiveEventsViewer(body, {
            todayIso: evToday,
            lang: evLang,
            labels: portableLabels(evLang),
          })}</div>\n`
        );
      }
      // 4T-0435 (Epic 3E-0081): perspective-journal-nav rendert als leerer
      // Platzhalter-Container; Kontext-Ermittlung (Datei-Pfad -> Journal/
      // Periode) und Navigation baut ausschliesslich der Renderer
      // (journal-nav-view.js). An die journals-Erweiterung gebunden:
      // deaktiviert faellt der Block auf den Default-Code-Block zurueck.
      if (lang === 'perspective-journal-nav' && enabled('journals')) {
        return `<div class="perspective-journal-nav"></div>\n`;
      }
      if (lang === 'perspective-table' && enabled('perspective-table')) {
        const html = renderPerspectiveTable(token.content);
        if (html) return html;
        // Fallback: perspective-table-Syntax nicht erkennbar (kein '{|'). Block wird als
        // regulaerer Code-Block gerendert, damit der Inhalt sichtbar bleibt.
      }
      return defaultFenceRenderer
        ? defaultFenceRenderer.call(this, tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    };
  }

  return { md, mdPortable };
}

// --- Instanz-Zustand und Erweiterungs-Konfiguration (4T-0292) ----------------------
// Start-Zustand: alles eingeschaltet (leere Disabled-Liste) — identisch zum
// Verhalten vor dem Erweiterungs-System; Unit-/Snapshot-Tests laufen damit
// deterministisch ohne Store.
let md;
let mdPortable;
let activeDisabledKey = null;
// Effektiv deaktivierter Satz des aktuellen Aufbaus — fuer Pfade ausserhalb
// der Instanzen (Portable-Konverter).
let activeEffectiveDisabled = new Set();
// 4T-0299 (Epic 3E-0053): aktive externe markdown-it-Plugins
// ([{ id, version, plugin }], vom Preload-Loader vm-evaluiert und nur fuer
// aktivierte, bestaetigte Erweiterungen uebergeben). Sie werden beim
// Instanz-Aufbau NACH allen internen Registrierungen (inklusive Fence-
// Override) auf beide Instanzen angewendet — dokumentierte API-Zusage:
// externe Plugins sehen die fertig konfigurierte Pipeline.
let externalMarkdownPlugins = [];
let activeExternalKey = '';

// Baut beide Instanzen aus dem aktuellen Schalt-Zustand (interner
// Disabled-Satz plus externe Plugins) neu auf. Fehler-Isolation: wirft ein
// externes Plugin bei der Registrierung, wird es entfernt und der Aufbau
// ohne dieses Plugin wiederholt (eine teilweise mutierte Instanz waere
// undefiniert); der Fehler landet im Rueckgabe-Objekt { id: fehlertext }
// fuer die Deaktivierungs-Kette des Hosts.
function rebuildPipelines() {
  const errors = {};
  let built;
  let applying = true;
  while (applying) {
    applying = false;
    built = buildPipelines((id) => !activeEffectiveDisabled.has(id));
    for (const entry of externalMarkdownPlugins) {
      try {
        built.md.use(entry.plugin);
        built.mdPortable.use(entry.plugin);
      } catch (err) {
        errors[entry.id] = String((err && err.message) || err);
        externalMarkdownPlugins = externalMarkdownPlugins.filter((p) => p !== entry);
        applying = true;
        break;
      }
    }
  }
  md = built.md;
  mdPortable = built.mdPortable;
  // Exporte nachfuehren: perspective-table.js greift lazy per
  // require('./markdown.js').md zu und sieht damit die neue Instanz.
  module.exports.md = md;
  module.exports.mdPortable = mdPortable;
  return errors;
}

// Baut beide Instanzen fuer die uebergebene Disabled-Liste (rohe, vom
// Nutzer deaktivierte IDs; abhaengige Erweiterungen deaktivieren sich ueber
// effectiveDisabledSet mit). Unveraenderter effektiver Zustand ist ein
// No-op (false); sonst true. Render-Cache-Invalidierung und Re-Render
// verantwortet der Aufrufer (Renderer-Lebenszyklus).
function configureExtensions(disabledIds) {
  const effective = effectiveDisabledSet(disabledIds);
  const key = [...effective].sort().join(',');
  if (key === activeDisabledKey) return false;
  activeDisabledKey = key;
  activeEffectiveDisabled = effective;
  rebuildPipelines();
  return true;
}

// 4T-0299: aktiven Satz externer markdown-it-Plugins setzen (Preload-
// Loader). Unveraenderter Satz (IDs und Versionen) ist ein No-op; sonst
// werden beide Instanzen neu aufgebaut. Rueckgabe: { id: fehlertext } der
// beim Aufbau gescheiterten Plugins (leer = alles registriert).
function configureExternalMarkdownPlugins(list) {
  const next = Array.isArray(list)
    ? list.filter((p) => p && typeof p.id === 'string' && typeof p.plugin === 'function')
    : [];
  const key = next
    .map((p) => `${p.id}@${String(p.version || '')}`)
    .sort()
    .join(',');
  if (key === activeExternalKey) return {};
  activeExternalKey = key;
  externalMarkdownPlugins = [...next];
  return rebuildPipelines();
}

// --- 4T-0282 (Epic 3E-0050): Frontmatter-Zeile im Gerenderten -------------
// Bei aktivem Schalter stellt renderMarkdown dem Body-HTML einen
// Frontmatter-Block voran: zusammengeklappte Kopfzeile (Chevron, Label,
// Feldanzahl) plus <pre> mit dem Klartext-YAML ohne die Marker-Zeilen.
// Alle Render-Aufrufer (beide Panes, Lese-Ansicht, Live-Widget) erben das
// Verhalten aus dieser einen Quelle. Der Schalter kommt wie bei
// configureTaskStates von aussen (Renderer: Setting render.showFrontmatter,
// 4T-0284); das Modul bleibt Electron-frei und startet mit dem
// Product-Owner-Default an — Unit-/Snapshot-Tests laufen deterministisch.
// Lokalisierung: Label ueber data-i18n (applyTranslations), Feldanzahl
// ueber data-fm-count (applyFrontmatterLine im Renderer) — die Pipeline
// selbst gibt keine uebersetzten Strings aus.
let frontmatterDisplayEnabled = true;

function configureFrontmatterDisplay(enabled) {
  frontmatterDisplayEnabled = enabled !== false;
}

// 4T-0546 (Epic 3E-0097): normalisierte calendarSystems-Konfiguration des
// aktiven Bereichs fuer die Wert-Badges (gesetzt vom Renderer beim Start
// und ueber den calendar:changed-Broadcast; Muster configureFrontmatter-
// Display). null = kein Bereich/keine Konfiguration — Badges erscheinen
// dann als "unbekannter Kalender", der Roh-Text bleibt erhalten.
let activeCalendarConfig = null;

function setCalendarConfig(config) {
  activeCalendarConfig = config || null;
}

function getCalendarConfig() {
  return activeCalendarConfig;
}

// 4T-0470 (Epic 3E-0087): Globaler Nummerierungs-Zustand (Einstellung
// "Ueberschriften nummerieren" plus Start-Ebene), gesetzt vom Renderer ueber
// api.configureHeadingNumbering (Muster configureFrontmatterDisplay). Default
// aus (PO-Festlegung 2026-07-08). Der Dokument-Frontmatter-Schalter
// numbered-headings uebersteuert ihn pro Render-Aufruf.
let headingNumberingConfig = { enabled: false, startLevel: 1 };

function configureHeadingNumbering(cfg) {
  headingNumberingConfig = {
    enabled: !!(cfg && cfg.enabled),
    startLevel: cfg && cfg.startLevel === 2 ? 2 : 1,
  };
}

// Loest den effektiven Nummerierungs-Zustand eines Dokuments auf: der
// Frontmatter-Schalter numbered-headings (nur echtes true/false) uebersteuert
// die globale Einstellung; die Start-Ebene bleibt global (nur global
// konfigurierbar). Rueckgabe geht als env.headingNumbering in die Pipeline.
function resolveHeadingNumbering(fmData) {
  let enabled = headingNumberingConfig.enabled;
  if (fmData && typeof fmData === 'object') {
    const v = fmData['numbered-headings'];
    if (v === true || v === false) enabled = v;
  }
  return { enabled, startLevel: headingNumberingConfig.startLevel };
}

function renderFrontmatterBlockHtml(fm) {
  // CRLF normalisieren; yamlText traegt kein abschliessendes Newline.
  const yamlRaw = String(fm.yamlText || '').replace(/\r\n/g, '\n');
  // Optik-Konsistenz mit Fenced-Code-Bloecken: hljs-YAML-Highlighting
  // (Text-Inhalt bleibt originalgetreu inkl. Kommentaren); Fallback auf
  // reines Escaping, falls der Tokenizer wirft.
  let yamlHtml;
  try {
    yamlHtml = hljs.highlight(yamlRaw, { language: 'yaml', ignoreIllegals: true }).value;
  } catch {
    yamlHtml = escapeHtml(yamlRaw);
  }
  // Feldanzahl nur bei parsebarem YAML; bei Parse-Fehlern wird der
  // Roh-Text trotzdem gezeigt (das Properties-Panel meldet den Fehler).
  const count = fm.data && !fm.parseError ? Object.keys(fm.data).length : null;
  const countSpan =
    count == null ? '' : `<span class="frontmatter-count" data-fm-count="${count}"></span>`;
  // data-source-line="1": der Block vertritt die Frontmatter-Zeilen im
  // Scroll-Sync-Mapping (Kopf des Dokuments). Kopfzeile als <button>:
  // nativ fokussierbar, Enter/Leertaste loesen den Klick-Pin aus.
  return (
    `<div class="frontmatter-block" data-source-line="1">` +
    `<button type="button" class="frontmatter-header" aria-expanded="false">` +
    `<span class="frontmatter-chevron" aria-hidden="true"></span>` +
    `<span class="frontmatter-label" data-i18n="frontmatter.line.label">Frontmatter</span>` +
    countSpan +
    `</button>` +
    `<pre class="frontmatter-yaml"><code class="hljs language-yaml">${yamlHtml}</code></pre>` +
    `</div>\n`
  );
}

// 4T-0179: Kern-Render ohne Bild-Aufloesung (resolveImagesForBase bleibt
// als fs-naher Schritt im Preload). lang kommt als Parameter, weil dieses
// Modul auch ausserhalb eines DOM-Kontexts laufen koennen muss.
// 4T-0282: opts.frontmatterBlock === false unterdrueckt den Frontmatter-
// Block unabhaengig vom Schalter (Markdown-Embeds zeigen nur den Inhalt).
function renderMarkdown(text, lang, opts) {
  const src = String(text || '');
  const fm = extractFrontmatter(src);
  // K-01 (4T-0189): Portable-Marker tolerant erkennen — in Zeile 1
  // (Alt-Exporte und Exporte ohne Frontmatter) ODER direkt nach dem
  // Frontmatter-Block (Neu-Exporte).
  const markerRe = /^\s*<!--\s*perspective-portable\s*-->/;
  const isPortable =
    markerRe.test(src) || (fm.raw != null && markerRe.test(src.slice(fm.endOffset)));
  const renderer = isPortable ? mdPortable : md;
  // 4T-0282: Zeilen-Offset des abgetrennten Frontmatters an den
  // sourceLineMapper durchreichen (raw endet mit dem Newline der
  // Schliess-Zeile; die Newline-Anzahl ist die Zeilenzahl des Blocks).
  const sourceLineOffset = fm.raw != null ? (fm.raw.match(/\n/g) || []).length : 0;
  // 4T-0479 (Epic 3E-0089): %%-Kommentare vor dem Rendern zeilentreu
  // entfernen — wirkt damit automatisch fuer Viewer, Portable-Anzeige,
  // Reading, PDF und Live-Block-Widgets (alle rendern ueber diesen
  // Chokepoint). Bei deaktivierter Erweiterung bleibt %% Literal.
  const body = activeEffectiveDisabled.has('comments') ? fm.body : stripPercentComments(fm.body);
  // 4T-0470 (Epic 3E-0087): effektiven Nummerierungs-Zustand (global ->
  // Dokument) an die Pipeline durchreichen; der heading_numbers-Ruler liest
  // env.headingNumbering. Bei deaktivierter Erweiterung ist der Ruler nicht
  // registriert (Marker bleiben Literal, keine Nummern).
  const bodyHtml = renderer.render(body, {
    lang: lang || 'de',
    sourceLineOffset,
    headingNumbering: resolveHeadingNumbering(fm.data),
    // 4T-0546 (Epic 3E-0097): Kalender-Konfiguration fuer die Wert-Badges.
    calendarSystems: activeCalendarConfig,
    // 4T-0748: Einheiten-Namen der Zeitspannen-Badges.
    calendarLabels: portableLabels(lang || 'de'),
  });
  const showBlock =
    frontmatterDisplayEnabled && fm.raw != null && !(opts && opts.frontmatterBlock === false);
  return showBlock ? renderFrontmatterBlockHtml(fm) + bodyHtml : bodyHtml;
}

// 4T-0512 (Epic 3E-0092): Label-Aufloesung des Ereignis-Portable-Pfads.
// Dieses Modul laeuft nur in Preload und Node-Tests (nie im Renderer-
// Bundle) — die Sprachdatei wird deshalb lazy von Platte gelesen (asar-
// transparent); jeder Fehlschlag faellt weich auf die Key-Namen zurueck.
const portableLabelCache = new Map();
function portableLabels(lang) {
  const lc = ['de', 'en', 'fr', 'es', 'it'].includes(lang) ? lang : 'de';
  if (portableLabelCache.has(lc)) return portableLabelCache.get(lc);
  let dict = {};
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    dict = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'i18n', `${lc}.json`), 'utf8'),
    );
  } catch {
    // Key-Fallback (Labels bleiben die Key-Namen) — Export funktioniert.
  }
  const labels = {};
  for (const key of [...PORTABLE_EVENT_LABEL_KEYS, ...CALENDAR_SPAN_LABEL_KEYS]) {
    if (typeof dict[key] === 'string') labels[key] = dict[key];
  }
  portableLabelCache.set(lc, labels);
  return labels;
}

function convertMarkdownPortable(markdownText, addMarker = true, lang = 'de') {
  const fenceRegex = /^( {0,3}`{3,})perspective-table[^\n]*\n([\s\S]*?)\n\1\s*$/gm;
  // 4T-0418 (Epic 3E-0079): perspective-datatable wird beim Export zur
  // statischen HTML-Tabelle (alle Zeilen, mit Aggregat-Zeile); bei
  // Struktur-Fehlern bleibt der Fence unveraendert (Konverter liefert
  // null). Wie perspective-table an die eigene Erweiterung gebunden
  // (PO-Festlegung 2026-07-09): deaktiviert wird nicht konvertiert.
  const datatableFenceRegex = /^( {0,3}`{3,})perspective-datatable[^\n]*\n([\s\S]*?)\n\1\s*$/gm;
  // 4T-0512 (Epic 3E-0092): perspective-events (Art 1) wird zur statischen
  // Tabelle mit Staffelung zum Export-Stichtag; Art 2 (query-Direktive)
  // und Struktur-Fehler bleiben unveraendert (Konverter liefert null,
  // PO-Festlegung 2026-07-15).
  const eventsFenceRegex = /^( {0,3}`{3,})perspective-events[^\n]*\n([\s\S]*?)\n\1\s*$/gm;
  const source = String(markdownText || '');
  // 4T-0293: pro Erweiterung konvertiert der Export nur bei aktivem
  // Schalter; die Marker-ERKENNUNG in renderMarkdown bleibt Kern, damit
  // frueher exportierte Dateien ihre eingebetteten Tabellen weiter
  // anzeigen.
  const tableEnabled = !activeEffectiveDisabled.has('perspective-table');
  const datatableEnabled = !activeEffectiveDisabled.has('perspective-datatable');
  const eventsEnabled = !activeEffectiveDisabled.has('events');
  // K-01 (4T-0189): YAML-Frontmatter intakt am Datei-Anfang lassen — der
  // Marker davor brach die '---'-in-Zeile-1-Erkennung sowohl der eigenen
  // App (Properties-Sidebar leer, Block als Fliesstext) als auch fremder
  // Renderer (GitHub/Obsidian zeigten das YAML als Text). Der Marker
  // steht jetzt direkt NACH dem Frontmatter-Block.
  const fm = extractFrontmatter(source);
  const head = fm.raw != null ? source.slice(0, fm.endOffset) : '';
  const restSource = fm.raw != null ? source.slice(fm.endOffset) : source;
  // 4T-0479 (Epic 3E-0089): %%-Kommentare gehoeren nie in den exportierten
  // Datei-Text (Kommentare sind privat; keine Export-Option). Der Strip
  // laeuft code-bewusst VOR der Fence-Konvertierung; bei deaktivierter
  // Erweiterung bleibt der Text unveraendert.
  const rest = activeEffectiveDisabled.has('comments')
    ? restSource
    : stripPercentComments(restSource);
  const commentsStripped = rest !== restSource;
  // 4T-0470 (Epic 3E-0087): Zeilenende-Marker {-}/{+} auch aus dem
  // exportierten Text nehmen (Marker in keinem Export sichtbar). PO-
  // Entscheidung 2026-07-12: KEINE Nummern einbrennen — der Portable-Text
  // bleibt Standard-Markdown, die Nummern sind reine Anzeige. Nur bei
  // aktiver Erweiterung; code-bewusst (Fenced-Code bleibt unberuehrt).
  const restForExport = activeEffectiveDisabled.has('heading-numbering')
    ? rest
    : stripHeadingMarkers(rest);
  const headingMarkersStripped = restForExport !== rest;
  // 4T-0596 (Epic 3E-0111): Inline-Berechnungen als selbsttragende Ergebnis-
  // Spans in den Export einbrennen (der exportierte Text zeigt das Ergebnis
  // auch in anderen Markdown-Programmen). Code-bewusst VOR der Fence-
  // Konvertierung; fehlerhafte Ausdrücke bleiben roh (Quelltext-Erhalt).
  // Konvertierte Spans sind Roh-HTML und brauchen die mdPortable-Ansicht —
  // inlineCalcConverted erzwingt deshalb unten den Marker-Pfad.
  const restAfterCalc = activeEffectiveDisabled.has('inline-calc')
    ? restForExport
    : convertInlineCalc(restForExport);
  const inlineCalcConverted = restAfterCalc !== restForExport;
  // K-12 (4T-0189): KaTeX fuer die Dauer der Export-Konvertierung
  // deaktivieren — `$…$` in Tabellen-Zellen bleibt Quelltext (Graceful
  // Degradation wie im Fliesstext des Exports, den die Konvertierung
  // ohnehin nicht anfasst); eingefrorenes KaTeX-HTML saehe ohne das
  // KaTeX-Stylesheet beim Empfaenger defekt aus. Die Viewer-Anzeige von
  // Portable-Dateien behaelt gerenderte Fliesstext-Formeln. Reentranz-
  // Zaehler, weil die Zell-Konvertierung (perspective-table.js) fuer Block-
  // Inhalte rekursiv hierher zurueckruft — ein einfaches try/finally
  // wuerde KaTeX sonst schon nach der ersten inneren Zelle reaktivieren.
  disablePortableMath();
  let converted;
  let datatableConverted = false;
  let eventsConverted = false;
  try {
    converted = restAfterCalc;
    if (tableEnabled) {
      converted = converted.replace(fenceRegex, (match, fence, content) => {
        const html = convertPerspectiveTableBlockToHtml(content);
        return html !== null ? html : match;
      });
    }
    if (datatableEnabled) {
      converted = converted.replace(datatableFenceRegex, (match, fence, content) => {
        const html = convertPerspectiveDatatableBlockToHtml(content);
        if (html === null) return match;
        datatableConverted = true;
        return html;
      });
    }
    if (eventsEnabled) {
      converted = converted.replace(eventsFenceRegex, (match, fence, content) => {
        const html = convertPerspectiveEventsBlockToHtml(content, {
          labels: portableLabels(lang),
        });
        if (html === null) return match;
        eventsConverted = true;
        return html;
      });
    }
  } finally {
    enablePortableMath();
  }
  if (!addMarker) return head + converted;
  // Alt-Verhalten bei deaktivierter Perspective-Table-Erweiterung: ohne
  // konvertierte Datatable bleibt der Text komplett unveraendert (kein
  // Marker — er dient allein den eingebetteten HTML-Tabellen). 4T-0479:
  // gestrippte Kommentare erzwingen den zusammengesetzten Rueckgabe-Pfad,
  // brauchen aber selbst keinen Marker.
  if (!tableEnabled && !datatableConverted && !eventsConverted && !inlineCalcConverted) {
    return commentsStripped || headingMarkersStripped ? head + converted : source;
  }
  const sep = converted.startsWith('\n') ? '\n' : '\n\n';
  return `${head}${PERSPECTIVE_PORTABLE_MARKER}${sep}${converted}`;
}

module.exports = {
  md,
  mdPortable,
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
  configureExternalMarkdownPlugins,
  configureFrontmatterDisplay,
  configureHeadingNumbering,
  // 4T-0546 (Epic 3E-0097): Kalender-Konfiguration der Wert-Badges.
  setCalendarConfig,
  getCalendarConfig,
  PERSPECTIVE_PORTABLE_MARKER,
};

// Initial-Aufbau NACH dem module.exports-Setup: configureExtensions weist
// module.exports.md/mdPortable neu zu und braucht das fertige Objekt.
configureExtensions([]);
