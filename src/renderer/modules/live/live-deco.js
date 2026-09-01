// Decoration-Bausteine des Live-Modus: Syntax-Highlighting des Quelltexts,
// Inline- und Zeilen-Decorations, Klick-Factories und der KaTeX-Block-Scan.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-0982 (Epic 3E-0196): in den Feature-Ordner live/ umgezogen; die
// StateFields liegen jetzt in live-marker-fields.js, die Widget-Klassen in
// live-widget-inline.js und live-widget-render.js.
'use strict';

import { Decoration } from '@codemirror/view';
import { HighlightStyle, syntaxTree } from '@codemirror/language';

import { tags } from '@lezer/highlight';

import { getDocText } from '../app/api.js';
import { positionInsideCode } from './live-shared.js';
import { detectFrontmatterLines } from './live-marker-fields.js';

// Markdown-Syntax-Highlighting mit CSS-Variablen. Farben kommen aus styles.css
// und folgen automatisch dem Light/Dark-Theme (data-theme-Attribut am <html>).
export const mdHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.heading2, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.heading3, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.heading4, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.heading5, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.heading6, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--syntax-link)' },
  { tag: tags.url, color: 'var(--syntax-url)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--syntax-code)' },
  { tag: tags.meta, color: 'var(--syntax-meta)' },
  { tag: tags.processingInstruction, color: 'var(--syntax-meta)' },
  { tag: tags.contentSeparator, color: 'var(--syntax-meta)' },
  { tag: tags.list, color: 'var(--syntax-list)' },
  { tag: tags.quote, color: 'var(--syntax-quote)', fontStyle: 'italic' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--syntax-keyword)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
]);

// 4T-0080/4T-0081/4T-0082 (Epic 3E-0014): Inline-Live-Preview-Decorations.
// 4T-0080 hat das ViewPlugin mit Bold und Italic eingefuehrt; 4T-0081 erweitert
// es auf Strikethrough, Inline-Code, Highlight (`==Text==`) und Tags (`#tag`);
// 4T-0082 ergaenzt Markdown-Links, Wiki-Links und Footnote-Verweise inklusive
// Klick-Handler und Hover-Tooltip fuer Footnote-Definitionen.
//
// In nicht-aktiven Zeilen werden die Marker-Zeichen ausgeblendet (Klasse
// cm-live-marker-hidden, font-size 0); in aktiven Zeilen (Cursor-Zeile bzw.
// alle Zeilen einer Mehrzeilen-Selektion) bleibt die Quelle sichtbar.
//
// Token-Quelle: lezer-markdown-AST ueber syntaxTree(view.state) fuer
// StrongEmphasis, Emphasis, Strikethrough, InlineCode, Link. Highlight,
// Tags, Wiki-Links und Footnote-Verweise haben keinen Standard-Lezer-Knoten
// und werden per Regex-Pass erkannt. Decoration-Aufbau auf den sichtbaren
// Viewport begrenzt (view.visibleRanges) und re-getriggert bei docChanged,
// viewportChanged und selectionSet.
export const liveMarkerHiddenDeco = Decoration.mark({ class: 'cm-live-marker-hidden' });
export const liveBoldDeco = Decoration.mark({ class: 'cm-live-bold' });
export const liveItalicDeco = Decoration.mark({ class: 'cm-live-italic' });
export const liveStrikeDeco = Decoration.mark({ class: 'cm-live-strikethrough' });
export const liveCodeDeco = Decoration.mark({ class: 'cm-live-code' });

// 4T-0083: Block-Markup-Decorations fuer den Live-Modus. Decoration.line
// wird pro Zeile gesetzt, Hide-Ranges (cm-live-marker-hidden) verstecken
// Marker-Zeichen in Nicht-Cursor-Zeilen.
export const liveHeadingLineDecos = [
  Decoration.line({ class: 'cm-live-h1' }),
  Decoration.line({ class: 'cm-live-h2' }),
  Decoration.line({ class: 'cm-live-h3' }),
  Decoration.line({ class: 'cm-live-h4' }),
  Decoration.line({ class: 'cm-live-h5' }),
  Decoration.line({ class: 'cm-live-h6' }),
];
export const liveSetextUnderlineLineDeco = Decoration.line({ class: 'cm-live-setext-underline' });
export const liveBlockquoteLineDeco = Decoration.line({ class: 'cm-live-blockquote' });
export const liveHrLineDeco = Decoration.line({ class: 'cm-live-hr' });
export const liveListBulletLineDeco = Decoration.line({ class: 'cm-live-list-bullet' });
export const liveListNumberLineDeco = Decoration.line({ class: 'cm-live-list-number' });

// 4T-0183 (Knip-Zusatzfund): LIVE_CALLOUT_HEADER_TEST entfernt — 4T-0083-
// Altlast ohne Aufrufer; die Callout-Erkennung laeuft seit 4T-0087 ueber
// den zeilenweisen Pre-Pass (computeCalloutScan in live-scans.js).

// 4T-0084: Inline-Math. Negative Lookbehind verhindert Treffer nach
// Backslash, Word-Char oder Dollar (also keine $-Betraege wie `100$x`).
// Positive Lookahead direkt nach oeffnendem `$` verlangt Non-Whitespace
// (markdown-it-katex-Heuristik aus 4T-0022 spiegelt). Genauso schliessend.
// Negative Lookahead `(?![\w$])` verhindert `$x$5`-Treffer.
export const LIVE_MATH_INLINE_RE = /(?<![\\\w$])\$(?=\S)([^\n$]+?)(?<=\S)\$(?![\w$])/g;

// 4T-0084: KaTeX-Block. Multi-Line-Inhalt via [\s\S].
// R1-12 (4T-0186): Die Regex verlangte ein \n direkt nach dem oeffnenden
// und vor dem schliessenden `$$` — einzeiliges `$$x^2$$` und Formen wie
// `$$\nx$$` rendeten im Render-Pane (markdown-it-katex), blieben im
// Live-Modus aber Roh-Text. Die Zeilen-Grenzen sichert weiterhin die
// Zusatzvalidierung im Decoration-Loop (Match muss auf Zeilen-Start
// beginnen und auf Zeilen-Ende enden); non-greedy stoppt am ersten `$$`.
export const LIVE_MATH_BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;

// 4T-0084: Wiki-Embed. Wie LIVE_WIKILINK_RE (live-scans.js), aber mit
// fuehrendem `!`. Inhalt darf keine Klammern und keinen Zeilenumbruch
// enthalten.
export const LIVE_WIKI_EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;

// 4T-0084: Helfer fuer Block-Widget-Cursor-Erkennung. Liefert true,
// wenn der Cursor in einer der Zeilen [fromLine, toLine] sitzt. Bei
// Block-Widgets (KaTeX-Block, spaeter Tabellen/Code/Mermaid) klappt der
// ganze Block zur Quelle auf, sobald irgendeine der Block-Zeilen aktiv
// ist (Entscheidung E.1 vom 2026-05-24).
export function blockIsActive(activeLines, fromLine, toLine) {
  for (let l = fromLine; l <= toLine; l++) {
    if (activeLines.has(l)) return true;
  }
  return false;
}

// 4T-0084: KaTeX-Block-Ranges aus einem State berechnen. Reine Funktion,
// damit sowohl der Inline-Plugin (Konflikt-Check) als auch der separate
// Block-StateField sie nutzen koennen. Block-Decorations duerfen in
// CodeMirror 6 NICHT aus einem ViewPlugin kommen ("Block decorations may
// not be specified via plugins") — daher der zweite Provider.
// R1-05 (4T-0180): Ergebnis pro Doc-Version cachen. Die Funktion laeuft
// pro Update mehrfach (Inline-Plugin-Konflikt-Check UND Block-Field) und
// zusaetzlich bei jeder Cursor-Bewegung. Neben der Doc-Identitaet muss
// auch der Syntaxbaum unveraendert sein: positionInsideCode haengt am
// Lezer-Tree, der bei grossen Dateien asynchron nachreift (R1-02-Muster).
const mathBlockRangesCache = new WeakMap();

export function computeMathBlockRanges(state) {
  const tree = syntaxTree(state);
  const cached = mathBlockRangesCache.get(state.doc);
  if (cached && cached.tree === tree) return cached.ranges;
  const ranges = [];
  const docText = getDocText(state.doc);
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;
  for (const m of docText.matchAll(LIVE_MATH_BLOCK_RE)) {
    const matchFrom = m.index;
    const matchTo = matchFrom + m[0].length;
    if (positionInsideCode(state, matchFrom)) continue;
    const fromLine = state.doc.lineAt(matchFrom);
    const toLine = state.doc.lineAt(matchTo);
    if (matchFrom !== fromLine.from) continue;
    if (matchTo !== toLine.to) continue;
    if (fromLine.number <= frontmatterEndLine) continue;
    ranges.push({
      from: matchFrom,
      to: matchTo,
      source: m[0],
      fromLine: fromLine.number,
      toLine: toLine.number,
    });
  }
  mathBlockRangesCache.set(state.doc, { tree, ranges });
  return ranges;
}

// 4T-0083: HR-Pattern. Drei oder mehr gleiche Marker (-/*/_) mit optionalem
// Whitespace dazwischen, wie in CommonMark spezifiziert. Pattern wird als
// alleiniger Erkennungspfad eingesetzt, weil lezer-markdown den
// HorizontalRule-Knoten in der aktuellen lang-markdown-Konfiguration nicht
// zuverlaessig liefert (im Test 4T-0083 weder fuer `---` noch fuer `***`
// gerendert worden).
export const LIVE_HR_LINE_RE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

// 4T-0083: Factory fuer Task-Marker-Decorations mit data-Attribut, damit
// der mousedown-Handler die genaue Marker-Position im Doc kennt und den
// Toggle per view.dispatch ausloesen kann.
// 4T-0204: erweitert um die State-Variante (opts.state = { char, color,
// label }): das Kaestchen zeigt den Marker-Glyph in der Status-Farbe
// (CSS ::before mit attr(data-live-task-state)); Klick setzt auf `[x]`.
export function liveTaskMarkerDecoAt(from, checked, opts) {
  const state = opts && opts.state;
  if (state) {
    return Decoration.mark({
      class: 'cm-live-task-marker cm-live-task-state',
      attributes: {
        'data-live-task-from': String(from),
        'data-live-task-state': state.char,
        title: state.label || '',
        style: `--task-state-color:${state.color}`,
      },
    });
  }
  return Decoration.mark({
    class: checked ? 'cm-live-task-marker cm-live-task-checked' : 'cm-live-task-marker',
    attributes: {
      'data-live-task-from': String(from),
      'data-live-task-checked': checked ? 'true' : 'false',
    },
  });
}

// 4T-0487 (Epic 3E-0091): Factory fuer klickbare Datums-/Uhrzeit-Werte.
// data-Attribute tragen den exakten Doc-Bereich (Muster liveTaskMarkerDecoAt/
// liveLinkMarkDeco); der gemeinsame mousedown-Handler des dateValuePlugin
// oeffnet daraus den vorbelegten Picker (date-picker.js). Der Quelltext
// bleibt sichtbar der reine Text-Wert — nur dezente Unterstreichung via
// cm-live-date-value (styles.css).
// 4T-0943 (Epic 3E-0197): `modifierOnly` markiert die Zeile mit dem Cursor.
// Dort bleibt der Wert dekoriert und damit erreichbar, oeffnet aber erst
// auf den Strg-/Cmd-Klick; die Zusatz-Klasse steuert die Optik.
export function liveDateValueMarkDeco(from, to, modifierOnly) {
  const attributes = {
    'data-live-date-from': String(from),
    'data-live-date-to': String(to),
  };
  if (modifierOnly) attributes['data-live-date-mod'] = '1';
  return Decoration.mark({
    class: modifierOnly ? 'cm-live-date-value cm-live-date-value-mod' : 'cm-live-date-value',
    attributes,
  });
}

// 4T-0996 (Epic 3E-0196): die vier Klick-Factories der Inline-Marks lagen
// bis zur Pass-Zerlegung in live-widgets.js; sie stehen hier bei den
// übrigen Decoration-Bausteinen, damit die Pass-Module zyklenfrei bleiben.
// 4T-0082: Factory fuer Link-Decorations. Pro Match wird eine neue
// Decoration mit URL/Wiki-Target im data-Attribut erzeugt, weil
// Decoration.mark immutable an die attributes gebunden ist.
export function liveLinkMarkDeco(href, isWikilink) {
  return Decoration.mark({
    class: isWikilink ? 'cm-live-wikilink' : 'cm-live-link',
    attributes: {
      'data-live-link-href': href,
      'data-live-link-wikilink': isWikilink ? 'true' : 'false',
    },
  });
}

// K-09 (4T-0186): Factory fuer klickbare Tag-Decorations. Haengt den
// '#tag:'-href als data-Attribut an, damit der gemeinsame Live-Klick-
// Handler (data-live-link-href) den Tag in der Sidebar filtert —
// identisches Verhalten wie der Tag-Link im Render-Pane.
export function liveTagMarkDeco(tagName) {
  return Decoration.mark({
    class: 'cm-live-tag',
    attributes: { 'data-live-link-href': '#tag:' + encodeURIComponent(tagName) },
  });
}

// 4T-0082: Factory fuer Footnote-Ref-Decorations. Hochgestelltes Display
// kommt aus dem CSS (cm-live-footnote-ref); data-Attribut traegt die id
// fuer Klick-Scroll und Hover-Tooltip.
export function liveFootnoteRefMarkDeco(id) {
  return Decoration.mark({
    class: 'cm-live-footnote-ref',
    attributes: { 'data-live-footnote-id': id },
  });
}

// 4T-0197: Factory fuer Abbr-Vorkommen-Decorations. Langtext als data-
// Attribut fuer den Hover-Tooltip (Mechanik wie liveFootnoteHoverTooltip).
export function liveAbbrMarkDeco(title) {
  return Decoration.mark({
    class: 'cm-live-abbr',
    attributes: { 'data-live-abbr-title': title },
  });
}

// 4T-0087 (Epic 3E-0014): Callout-Block-Line-Decorations. Pro Typ und Rolle
// (Box-Container, Header-Zeile) gibt es eine Klasse, die in styles.css den
// Box-Look festlegt (Akzent-Balken, Hintergrund, Border-Radius). Caching
// als WeakMap-aehnliche Map, damit pro Typ nur eine Decoration-Instanz
// entsteht.
export const liveCalloutLineDecos = new Map();
export function liveCalloutLineDeco(type) {
  if (!liveCalloutLineDecos.has(type)) {
    liveCalloutLineDecos.set(
      type,
      Decoration.line({
        class: `cm-live-callout cm-live-callout-${type}`,
      }),
    );
  }
  return liveCalloutLineDecos.get(type);
}
export const liveCalloutHeaderLineDeco = Decoration.line({ class: 'cm-live-callout-header' });

// 4T-0200 (Epic 3E-0017): neutrale Line-Decoration fuer Custom Containers
// mit unbekanntem Namen (bekannte Callout-Typen nutzen die Callout-
// Bausteine oben).
export const liveContainerLineDeco = Decoration.line({ class: 'cm-live-container' });

// 4T-0201 (Epic 3E-0017): Inhalt-Marks fuer Subscript (`~x~`),
// Superscript (`^^x^^`) und Insertion (`++x++`); die Marker-Paare
// versteckt der jeweilige Regex-Pass per liveMarkerHiddenDeco.
export const liveSubDeco = Decoration.mark({ class: 'cm-live-sub' });
export const liveSupDeco = Decoration.mark({ class: 'cm-live-sup' });
export const liveInsDeco = Decoration.mark({ class: 'cm-live-ins' });

// 4T-0203 (Epic 3E-0017): Spoiler-Inhalt (verdeckt, Hover deckt auf —
// gleiche CSS-Mechanik wie im Render-Pane) und die vier Critic-Formen.
export const liveSpoilerDeco = Decoration.mark({ class: 'cm-live-spoiler' });
export const liveCriticInsDeco = Decoration.mark({ class: 'cm-live-critic-ins' });
export const liveCriticDelDeco = Decoration.mark({ class: 'cm-live-critic-del' });
export const liveCriticMarkDeco = Decoration.mark({ class: 'cm-live-critic-mark' });
export const liveCriticCommentDeco = Decoration.mark({ class: 'cm-live-critic-comment' });
