// Live-Modus-Decorations fuer Inline- und Zeilen-Markup plus Such-/Frontmatter-StateFields.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { CALLOUT_TYPES } from '../../shared/callouts.js';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { HighlightStyle, syntaxTree } from '@codemirror/language';
import { StateField, StateEffect } from '@codemirror/state';
import { applyTranslations, t } from '../i18n.js';

import { tags } from '@lezer/highlight';

import {
  liveBlockCacheGet,
  liveBlockCacheSet,
  liveRebuildEffect,
  positionInsideCode,
  bindFrontmatterQueryClicks,
} from './live-widgets.js';
import { api, getDocText } from './api.js';
// 4T-0479 (Epic 3E-0089): geteilter Kommentar-Scanner — dieselbe Quelle wie
// das Render-Strippen in markdown.js (CJS-Modul, esbuild loest den Import).
import { findPercentCommentRanges } from '../../shared/markdown/plugins.js';
// 4T-0596 (Epic 3E-0111): geteilter Spannen-Scanner der Inline-Berechnungen —
// dieselbe Quelle wie die Render-Pipeline (Paritaet per Konstruktion; das
// Modul ist bewusst markdown.js-frei und damit Bundle-tauglich).
import { findInlineCalcSpans } from '../../shared/markdown/inline-calc.js';
// 4T-0293 (Epic 3E-0052): Schalt-Zustand der Render-Erweiterungen als Guard
// fuer die konstrukt-spezifischen Marker-Felder (zyklenfrei: importiert nur
// api und die shared Registry). Der Umschalt-Pfad dispatcht den
// liveRebuildEffect, damit die Felder auch ohne Doc-Aenderung neu bauen.
import { isExtensionActive } from './extension-lifecycle.js';
// K-10/R1-15 (4T-0186): Render-Pane-Nachverarbeitung fuer Block-Widgets
// (Laufzeit-Aufrufe in toDOM, kein top-level Wert-Zugriff — zyklenfest).
import { applyCodeCopyButtons, enhancePerspectiveTableSorting } from './render-mermaid.js';
import { applyWikiEmbedsIfPresent } from './render-mermaid.js';
// 4T-0355 (Epic 3E-0065): perspective-query-Befüllung im Live-Block-Widget
// (Laufzeit-Aufruf in _enhance, zyklenfest — importiert nur api und i18n).
import { applyFrontmatterQueriesIfPresent } from './frontmatter-query-view.js';
// 4T-0435 (Epic 3E-0081): Journal-Navigation im Live-Block-Widget
// (Laufzeit-Aufruf in _enhance, zyklenfest — Klick-Ziel per dynamic import).
import { applyJournalNavIfPresent } from './journal-nav-view.js';
// 4T-0412 (Epic 3E-0078): Skript-Blöcke im Live-Modus (Widget-Nachverarbeitung).
import { applyPerspectiveScriptsIfPresent } from './perspective-script-view.js';
// 4T-0418 (Epic 3E-0079): Perspective-Datatable-Lokalisierung im Live-
// Block-Widget (zyklenfest — importiert nur i18n).
import { applyPerspectiveDatatablesIfPresent } from './perspective-datatable-view.js';
// 4T-0512 (Epic 3E-0092): Ereignis-Fence im Live-Widget (Lokalisierung,
// Differenz-Spalte, Editor-Bindung).
import { applyPerspectiveEventsIfPresent } from './events-view.js';
import { bindPerspectiveEventsEditor, applyPerspectiveEventsViewStates } from './events-editor.js';
// 4T-0419 (Epic 3E-0079): Grid-Editor auch im Live-Widget (Laufzeit-
// Zugriffe im Handler, zyklenfest). 4T-0420: plus Ansichts-Zustand.
import {
  bindPerspectiveDatatableEditor,
  applyPerspectiveDatatableViewStates,
} from './perspective-datatable-editor.js';

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

// CodeMirror-Such-Decorations (4T-0007): aktive Such-Treffer im Source-Pane
// werden ueber ein StateField/Decoration-Set gerendert und ueberleben CM-Re-
// Renders. setSearchDecorations setzt das Decoration-Set, clearSearchDecorations
// loescht es. Bei jeder Doc-Aenderung werden alte Decorations verworfen, weil
// die Indizes ohnehin nicht mehr stimmen.
export const setSearchDecorations = StateEffect.define();
export const clearSearchDecorations = StateEffect.define();

export const searchHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSearchDecorations)) {
        const { matches, currentIndex } = effect.value;
        const items = matches.map((m, i) =>
          Decoration.mark({
            class:
              i === currentIndex ? 'cm-search-match cm-search-match-current' : 'cm-search-match',
          }).range(m.from, m.to),
        );
        return Decoration.set(items, true);
      }
      if (effect.is(clearSearchDecorations)) {
        return Decoration.none;
      }
    }
    if (tr.docChanged) return Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0049 (Epic 3E-0010): Frontmatter-Decoration. Wenn der Doc-Anfang ein
// YAML-Frontmatter-Block ('---' bis '---' bzw. '...') ist, bekommen alle
// Zeilen des Blocks (inklusive der beiden Marker-Zeilen) eine Line-
// Decoration mit dezenter Hintergrundfarbe. Erkennung anhand des Doc-Texts;
// kein YAML-Parsing noetig, da nur die Zeilen-Grenzen relevant sind. Die
// Aufloesungs-Heuristik muss identisch zu extractFrontmatter (src/shared/markdown/frontmatter.js)
// bleiben, damit Source-Decoration und Render-Ausschluss synchron sind.
export function detectFrontmatterLines(doc) {
  const totalLines = doc.lines;
  if (totalLines < 2) return null;
  const firstLine = doc.line(1);
  if (firstLine.text.trimEnd() !== '---') return null;
  for (let lineNo = 2; lineNo <= totalLines; lineNo++) {
    const text = doc.line(lineNo).text.trimEnd();
    if (text === '---' || text === '...') {
      return { fromLine: 1, toLine: lineNo };
    }
  }
  return null;
}

export const frontmatterLineDecoration = Decoration.line({ class: 'cm-frontmatter-line' });

export function buildFrontmatterDecorations(doc) {
  const range = detectFrontmatterLines(doc);
  if (!range) return Decoration.none;
  const ranges = [];
  for (let lineNo = range.fromLine; lineNo <= range.toLine; lineNo++) {
    const line = doc.line(lineNo);
    ranges.push(frontmatterLineDecoration.range(line.from));
  }
  return Decoration.set(ranges);
}

export const frontmatterField = StateField.define({
  create(state) {
    return buildFrontmatterDecorations(state.doc);
  },
  update(deco, tr) {
    if (!tr.docChanged) return deco;
    return buildFrontmatterDecorations(tr.state.doc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0061 (Epic 3E-0012): Editor-Highlighting fuer den `[!type][+-]?`-Marker
// in der ersten Zeile eines Callout-Blockquotes. Decoration.mark mit der
// Klasse cm-callout-marker (theme-konforme Akzentfarbe in styles.css). Keine
// Code-/Frontmatter-Kontext-Pruefung — kosmetische Markierung, im seltenen
// Code-Kontext durch Syntax-Highlight ohnehin ueberlagert.
export const calloutMarkerDecoration = Decoration.mark({ class: 'cm-callout-marker' });
export const EDITOR_CALLOUT_HEADER_RE = /^>\s+(\[!([a-z]+)\][+-]?)/gm;

export function buildCalloutMarkerDecorations(doc) {
  // 4T-0293: bei deaktivierter Callout-Erweiterung bleibt der Header roh.
  if (!isExtensionActive('callouts')) return Decoration.none;
  // R1-06 (4T-0180): geteilte Serialisierung statt eigener Voll-Doc-Kopie.
  const text = getDocText(doc);
  const ranges = [];
  for (const m of text.matchAll(EDITOR_CALLOUT_HEADER_RE)) {
    const markerStart = m.index + m[0].indexOf(m[1]);
    const markerEnd = markerStart + m[1].length;
    ranges.push(calloutMarkerDecoration.range(markerStart, markerEnd));
  }
  return Decoration.set(ranges, true);
}

export const calloutMarkerField = StateField.define({
  create(state) {
    return buildCalloutMarkerDecorations(state.doc);
  },
  update(deco, tr) {
    // 4T-0293: Erweiterungs-Umschalten rebuildet ohne Doc-Aenderung.
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) return buildCalloutMarkerDecorations(tr.state.doc);
    }
    if (!tr.docChanged) return deco;
    return buildCalloutMarkerDecorations(tr.state.doc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0062 (Epic 3E-0012): Editor-Highlighting fuer `==Text==` im Source-Pane.
// Decoration wird nur auf den Inhalt zwischen den `==`-Delimitern gesetzt;
// die Delimiter selbst bleiben unmarkiert. Escape `\==` wird uebersprungen,
// kein Match ueber Zeilenumbruch hinaus. Klasse cm-mark-marker (gelbes
// Hinterlegen, theme-konform in styles.css definiert).
export const markMarkerDecoration = Decoration.mark({ class: 'cm-mark-marker' });
export const EDITOR_MARK_RE = /(?<!\\)==([^=\n][^\n]*?)(?<!\\)==/g;

export function buildMarkMarkerDecorations(doc) {
  // 4T-0293: bei deaktivierter Highlight-Erweiterung bleibt `==…==` roh.
  if (!isExtensionActive('highlight')) return Decoration.none;
  // R1-06 (4T-0180): geteilte Serialisierung statt eigener Voll-Doc-Kopie.
  const text = getDocText(doc);
  const ranges = [];
  for (const m of text.matchAll(EDITOR_MARK_RE)) {
    const innerStart = m.index + 2;
    const innerEnd = m.index + m[0].length - 2;
    if (innerEnd > innerStart) {
      ranges.push(markMarkerDecoration.range(innerStart, innerEnd));
    }
  }
  return Decoration.set(ranges, true);
}

export const markMarkerField = StateField.define({
  create(state) {
    return buildMarkMarkerDecorations(state.doc);
  },
  update(deco, tr) {
    // 4T-0293: Erweiterungs-Umschalten rebuildet ohne Doc-Aenderung.
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) return buildMarkMarkerDecorations(tr.state.doc);
    }
    if (!tr.docChanged) return deco;
    return buildMarkMarkerDecorations(tr.state.doc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0479 (Epic 3E-0089): %%-Kommentar-Bereiche im Quelltext- und Live-Modus
// dezent einfaerben. Die Bereiche kommen aus findPercentCommentRanges
// (shared/markdown/plugins.js) — demselben Scanner, der das Render-Strippen
// speist; Editor-Faerbung und Render-Entfernung sind damit per Konstruktion
// paritaetisch (code-bewusst, Escape, unpaarig bis Dokument-Ende). Das
// Frontmatter wird ausgeklammert: der Render-Pfad sieht nur den Body, ein
// %% in YAML-Werten darf im Editor keinen Kommentar starten.
const commentRangeCache = new WeakMap();

export function computeCommentRanges(doc) {
  const cached = commentRangeCache.get(doc);
  if (cached) return cached;
  const text = getDocText(doc);
  const fm = detectFrontmatterLines(doc);
  const startOffset = fm ? Math.min(doc.line(fm.toLine).to + 1, text.length) : 0;
  const ranges = findPercentCommentRanges(text.slice(startOffset)).map((r) => ({
    from: r.from + startOffset,
    to: r.to + startOffset,
    // 4T-0533: unpaarige Marker fuer den Linter-Hinweis durchreichen.
    closed: r.closed,
  }));
  commentRangeCache.set(doc, ranges);
  return ranges;
}

export const commentMarkerDecoration = Decoration.mark({ class: 'cm-comment-marker' });

export function buildCommentMarkerDecorations(doc) {
  // Bei deaktivierter Kommentar-Erweiterung bleibt %% roh (kein Styling).
  if (!isExtensionActive('comments')) return Decoration.none;
  const ranges = [];
  for (const r of computeCommentRanges(doc)) {
    if (r.to > r.from) ranges.push(commentMarkerDecoration.range(r.from, r.to));
  }
  return Decoration.set(ranges, true);
}

export const commentMarkerField = StateField.define({
  create(state) {
    return buildCommentMarkerDecorations(state.doc);
  },
  update(deco, tr) {
    // Erweiterungs-Umschalten rebuildet ohne Doc-Aenderung (Muster 4T-0293).
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) return buildCommentMarkerDecorations(tr.state.doc);
    }
    if (!tr.docChanged) return deco;
    return buildCommentMarkerDecorations(tr.state.doc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0063 (Epic 3E-0012): Editor-Highlighting fuer Footnotes. Markiert sowohl
// `[^id]`-Referenzen und `[^id]:`-Definitionen (klassische Footnotes) als auch
// `^[Inline-Text]` (Inline-Footnotes) mit der Klasse cm-footnote-marker.
export const footnoteMarkerDecoration = Decoration.mark({ class: 'cm-footnote-marker' });
export const EDITOR_FOOTNOTE_RE = /\[\^[\w-]+\]:?|\^\[[^\]\n]+\]/g;

export function buildFootnoteMarkerDecorations(doc) {
  // 4T-0293: bei deaktivierter Fussnoten-Erweiterung bleiben `[^id]` roh.
  if (!isExtensionActive('footnotes')) return Decoration.none;
  // R1-06 (4T-0180): geteilte Serialisierung statt eigener Voll-Doc-Kopie.
  const text = getDocText(doc);
  const ranges = [];
  for (const m of text.matchAll(EDITOR_FOOTNOTE_RE)) {
    ranges.push(footnoteMarkerDecoration.range(m.index, m.index + m[0].length));
  }
  return Decoration.set(ranges, true);
}

export const footnoteMarkerField = StateField.define({
  create(state) {
    return buildFootnoteMarkerDecorations(state.doc);
  },
  update(deco, tr) {
    // 4T-0293: Erweiterungs-Umschalten rebuildet ohne Doc-Aenderung.
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) return buildFootnoteMarkerDecorations(tr.state.doc);
    }
    if (!tr.docChanged) return deco;
    return buildFootnoteMarkerDecorations(tr.state.doc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0596 (Epic 3E-0111): Inline-Berechnungen im Quelltext- und Live-Modus
// dezent einfaerben (ganzes Konstrukt inklusive Marker, Klasse
// cm-inline-calc-marker). Die Spannen kommen aus findInlineCalcSpans —
// demselben Scanner wie Render-Pipeline und Live-Widget (Paritaet per
// Konstruktion, inklusive Backslash-Escape und Quote-Regeln). Wie die
// Highlight-Einfaerbung bewusst nicht code-bewusst (Muster markMarkerField).
export const inlineCalcMarkerDecoration = Decoration.mark({ class: 'cm-inline-calc-marker' });

export function buildInlineCalcMarkerDecorations(doc) {
  // Bei deaktivierter Erweiterung bleibt {= … =} roh (kein Styling).
  if (!isExtensionActive('inline-calc')) return Decoration.none;
  // R1-06 (4T-0180): geteilte Serialisierung statt eigener Voll-Doc-Kopie.
  const text = getDocText(doc);
  const ranges = [];
  for (const s of findInlineCalcSpans(text)) {
    ranges.push(inlineCalcMarkerDecoration.range(s.from, s.to));
  }
  return Decoration.set(ranges, true);
}

export const inlineCalcMarkerField = StateField.define({
  create(state) {
    return buildInlineCalcMarkerDecorations(state.doc);
  },
  update(deco, tr) {
    // Erweiterungs-Umschalten rebuildet ohne Doc-Aenderung (Muster 4T-0293).
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) return buildInlineCalcMarkerDecorations(tr.state.doc);
    }
    if (!tr.docChanged) return deco;
    return buildInlineCalcMarkerDecorations(tr.state.doc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

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
// den zeilenweisen Pre-Pass (computeCalloutScan in live-widgets.js).

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

// 4T-0084: Wiki-Embed. Wie LIVE_WIKILINK_RE (live-widgets.js), aber mit
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
// liveLinkMarkDeco); der gemeinsame mousedown-Handler in live-widgets.js
// oeffnet daraus den vorbelegten Picker (date-picker.js). Der Quelltext
// bleibt sichtbar der reine Text-Wert — nur dezente Unterstreichung via
// cm-live-date-value (styles.css).
export function liveDateValueMarkDeco(from, to) {
  return Decoration.mark({
    class: 'cm-live-date-value',
    attributes: {
      'data-live-date-from': String(from),
      'data-live-date-to': String(to),
    },
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

// 4T-0087: Inline-WidgetType fuer das Callout-Icon. Setzt das SVG aus
// CALLOUT_TYPES[type].iconSvg als HTML in einen Wrapper-Span. eq()
// vergleicht nur den Typ — Icon ist statisch pro Typ, kein Cache noetig.
// ignoreEvent verhindert, dass Klicks auf das Icon den CodeMirror-Cursor
// ins Widget setzen (Widgets haben keine Cursor-Positionen).
export class CalloutIconWidget extends WidgetType {
  constructor(type) {
    super();
    this.type = type;
  }
  eq(other) {
    return other instanceof CalloutIconWidget && other.type === this.type;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-callout-icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = CALLOUT_TYPES[this.type].iconSvg;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0087: Inline-WidgetType fuer den lokalisierten Default-Titel. Wird
// nur eingesetzt, wenn der Callout-Header keinen Override-Titel traegt.
// eq() vergleicht zusaetzlich die aktuelle Sprache — das Widget wird bei
// Sprach-Wechsel neu gebaut, sobald der i18n-Refresh-Hook den Plugin-
// Re-Compute triggert (currentLanguage aus i18n.getLanguage).
export class CalloutDefaultTitleWidget extends WidgetType {
  constructor(type, language) {
    super();
    this.type = type;
    this.language = language;
  }
  eq(other) {
    return (
      other instanceof CalloutDefaultTitleWidget &&
      other.type === this.type &&
      other.language === this.language
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-callout-title';
    const key = CALLOUT_TYPES[this.type].titleKey;
    span.setAttribute('data-i18n', key);
    span.textContent = t(key);
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0498 (Epic 3E-0090): Task-Marker-Badge. Inline-Replace eines
// Marker-Segments (Termin, Prioritaet, Wiederholung, ID) durch die
// Badge-Darstellung — Klassen und Inhalt kommen aus taskMarkerBadgeSpec
// (plugins.js), derselben Quelle wie der Render-Pane (Paritaet). Cursor
// auf der Zeile zeigt den Roh-Text (activeLines-Guard beim Aufbau).
//
// 4T-0528 (Epic 3E-0095): optionaler clickRange { from, to } (Doc-Bereich
// des ⏰-Werts) macht das Badge klickbar: die data-live-date-Attribute
// sprechen den bestehenden mousedown-Handler des dateValuePlugin an
// (date-picker.js), der den vorbelegten Picker fuer exakt diesen Bereich
// oeffnet — kein zweiter Klick-Pfad.
export class TaskMarkerBadgeWidget extends WidgetType {
  constructor(cls, title, text, clickRange = null) {
    super();
    this.cls = cls;
    this.title = title;
    this.text = text;
    this.clickRange = clickRange;
  }
  eq(other) {
    return (
      other instanceof TaskMarkerBadgeWidget &&
      other.cls === this.cls &&
      other.title === this.title &&
      other.text === this.text &&
      (other.clickRange ? other.clickRange.from : -1) ===
        (this.clickRange ? this.clickRange.from : -1) &&
      (other.clickRange ? other.clickRange.to : -1) === (this.clickRange ? this.clickRange.to : -1)
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-live-task-marker-badge ${this.cls}`;
    if (this.title) span.title = this.title;
    span.textContent = this.text;
    if (this.clickRange) {
      span.classList.add('task-marker-click');
      span.setAttribute('data-live-date-from', String(this.clickRange.from));
      span.setAttribute('data-live-date-to', String(this.clickRange.to));
    }
    return span;
  }
  ignoreEvent(event) {
    // 4T-0528: mousedown auf einem klickbaren Badge gehoert dem Editor
    // (der dateValuePlugin-Handler verbraucht ihn); alles andere bleibt
    // widget-intern ignoriert.
    if (this.clickRange && event && event.type === 'mousedown') return false;
    return true;
  }
}

// 4T-0546 (Epic 3E-0097): Kalender-Wert-Badge. Inline-Replace eines
// @{Kalendername: Wert}-Vorkommens durch die Badge-Darstellung — Klassen
// und Inhalt kommen aus calendarValueBadgeSpec (plugins.js), derselben
// Quelle wie der Render-Pane (Paritaet). Cursor auf der Zeile zeigt den
// Roh-Text (activeLines-Guard beim Aufbau). clickRange traegt den
// Doc-Bereich des Vorkommens: die data-live-calvalue-Attribute sprechen
// den mousedown-Handler des calendarValuePlugin an (calendar-picker.js),
// der den vorbelegten Picker fuer exakt diesen Bereich oeffnet.
export class CalendarValueBadgeWidget extends WidgetType {
  constructor(cls, title, text, clickRange = null) {
    super();
    this.cls = cls;
    this.title = title;
    this.text = text;
    this.clickRange = clickRange;
  }
  eq(other) {
    return (
      other instanceof CalendarValueBadgeWidget &&
      other.cls === this.cls &&
      other.title === this.title &&
      other.text === this.text &&
      (other.clickRange ? other.clickRange.from : -1) ===
        (this.clickRange ? this.clickRange.from : -1) &&
      (other.clickRange ? other.clickRange.to : -1) === (this.clickRange ? this.clickRange.to : -1)
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-live-calendar-badge ${this.cls}`;
    if (this.title) span.title = this.title;
    span.textContent = this.text;
    if (this.clickRange) {
      span.setAttribute('data-live-calvalue-from', String(this.clickRange.from));
      span.setAttribute('data-live-calvalue-to', String(this.clickRange.to));
    }
    return span;
  }
  ignoreEvent(event) {
    // mousedown gehoert dem Editor (der calendarValuePlugin-Handler
    // verbraucht ihn); alles andere bleibt widget-intern ignoriert.
    if (this.clickRange && event && event.type === 'mousedown') return false;
    return true;
  }
}

// 4T-0596 (Epic 3E-0111): Inline-Berechnungs-Widget. Inline-Replace des
// {= … =}-Konstrukts durch das Ergebnis bzw. das Fehler-Zeichen mit Tooltip —
// Spec-Quelle wie der Render-Pane (Paritaet). Cursor auf der Zeile zeigt den
// Roh-Ausdruck (activeLines-Guard beim Aufbau); ein Klick setzt den Cursor
// IN das Konstrukt (posAtDOM + 2, hinter `{=`) und deckt die Zeile damit
// auf — eigener mousedown-Handler nach dem Muster des FrontmatterBlockWidget;
// ignoreEvent haelt die zentralen CM-Handler fern, weil das Widget selbst
// bindet.
export class InlineCalcWidget extends WidgetType {
  constructor(cls, title, text) {
    super();
    this.cls = cls;
    this.title = title;
    this.text = text;
  }
  eq(other) {
    return (
      other instanceof InlineCalcWidget &&
      other.cls === this.cls &&
      other.title === this.title &&
      other.text === this.text
    );
  }
  toDOM(view) {
    const span = document.createElement('span');
    span.className = this.cls;
    if (this.title) span.title = this.title;
    span.textContent = this.text;
    span.addEventListener('mousedown', (event) => {
      event.preventDefault();
      try {
        const base = view.posAtDOM(span);
        view.dispatch({ selection: { anchor: base + 2 }, scrollIntoView: true });
        view.focus();
      } catch {
        // Widget bereits abgeloest — kein Cursor-Sprung moeglich.
      }
    });
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0197 (Epic 3E-0017): Emoji-Widget. Inline-Replace eines `:code:`-
// Shortcode-Ranges durch das Unicode-Zeichen. Kein Markdown-Render-
// Roundtrip noetig — das Zeichen kommt direkt aus der Lookup-Map des
// markdown-it-emoji-Pakets (Single Source of Truth, Import in
// live-widgets.js).
export class EmojiWidget extends WidgetType {
  constructor(char) {
    super();
    this.char = char;
  }
  eq(other) {
    return other instanceof EmojiWidget && other.char === this.char;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-emoji';
    span.textContent = this.char;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084 (Epic 3E-0014): Bilder-Widget. Inline-Replace eines
// `![alt](url)`-Ranges durch ein `<img>`-Element. Pfad-Aufloesung
// laeuft ueber api.renderMarkdown (das resolveImagesForBase im preload
// aufruft) — konsistent mit der Render-Pane, keine doppelte Pfad-Logik
// im Renderer. eq() vergleicht alt, url und basePath.
//
// 4T-0198 (Epic 3E-0017): erweitert um opts {sourceText, standalone}.
// sourceText rendert den Original-Quelltext (noetig fuer das `=WxH`-
// Groessen-Suffix, das Lezer nicht als Image-Bestandteil parst);
// standalone steuert die Figure-Uebernahme: nur wenn das Bild im Doc
// allein im Absatz steht, wird das <figure> (inkl. <figcaption>) aus dem
// Render-Output uebernommen — der isoliert gerenderte Markdown-String
// stuende sonst IMMER allein und implicit-figures wuerde Fliesstext-
// Bilder im Live-Modus faelschlich zur Figure machen.
export class ImageWidget extends WidgetType {
  constructor(alt, url, basePath, opts) {
    super();
    this.alt = alt || '';
    this.url = url || '';
    this.basePath = basePath || '';
    this.sourceText = (opts && opts.sourceText) || '';
    this.standalone = !!(opts && opts.standalone);
  }
  eq(other) {
    return (
      other instanceof ImageWidget &&
      other.alt === this.alt &&
      other.url === this.url &&
      other.basePath === this.basePath &&
      other.sourceText === this.sourceText &&
      other.standalone === this.standalone
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-image';
    // Bracket-Escape im Alt-Text waere bei direkter Wiedereinsetzung als
    // Markdown gefaehrlich. Da wir nur die Visualisierung brauchen,
    // strippen wir potentiell brechende Zeichen statt zu escapen.
    const safeAlt = this.alt.replace(/[\]\\]/g, '');
    const md = this.sourceText || `![${safeAlt}](${this.url})`;
    try {
      const html = api.renderMarkdown(md, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      if (this.standalone) {
        const fig = tmp.querySelector('figure');
        if (fig) {
          span.appendChild(fig);
          return span;
        }
      }
      const img = tmp.querySelector('img');
      if (img) {
        span.appendChild(img);
        return span;
      }
    } catch (err) {
      console.warn('ImageWidget Render-Fehler:', err);
    }
    span.textContent = md;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: Inline-Math-Widget. Ein `$x$`-Range wird inline durch das
// KaTeX-gerenderte `<span class="katex">`-Element ersetzt. Rendering
// laeuft ueber api.renderMarkdown — markdown-it-katex hat seine eigene
// Dollar-Heuristik (4T-0022) und die Heuristik im Pre-Pass-Pattern hier
// ist die schnelle Vorab-Filterung. Wenn markdown-it-katex den Treffer
// am Ende nicht akzeptiert (kein .katex-Knoten im Output), faellt
// toDOM auf die Quelle zurueck — der Live-Modus sieht in diesem Edge-
// Fall optisch genauso aus wie der Source-Modus.
export class MathInlineWidget extends WidgetType {
  constructor(source, basePath) {
    super();
    this.source = source;
    this.basePath = basePath || '';
  }
  eq(other) {
    return (
      other instanceof MathInlineWidget &&
      other.source === this.source &&
      other.basePath === this.basePath
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-math-inline';
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const katex = tmp.querySelector('.katex');
      if (katex) {
        span.appendChild(katex);
        return span;
      }
    } catch (err) {
      console.warn('MathInlineWidget Render-Fehler:', err);
    }
    span.textContent = this.source;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: KaTeX-Block-Widget. Mehrzeiliger `$$…$$`-Block wird durch ein
// `<div class="katex-display">` ersetzt. block: true im Decoration.replace
// macht das Widget zu einem eigenen Block-Element, das mehrere Zeilen
// ersetzt. Cursor in irgendeiner Block-Zeile klappt die Quelle auf
// (siehe blockIsActive-Logik in buildLivePreviewDecorations).
//
// lineBreaks/estimatedHeight bewusst NICHT ueberschrieben — CM6 misst
// die echte Hoehe nach Mount, der Default lineBreaks=0 entspricht der
// visuellen Hoehe eines einzelnen KaTeX-Display-Elements.
export class MathBlockWidget extends WidgetType {
  constructor(source, basePath) {
    super();
    this.source = source;
    this.basePath = basePath || '';
  }
  eq(other) {
    return (
      other instanceof MathBlockWidget &&
      other.source === this.source &&
      other.basePath === this.basePath
    );
  }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-live-math-block';
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const display = tmp.querySelector('.katex-display') || tmp.querySelector('.katex');
      if (display) {
        div.appendChild(display);
        return div;
      }
    } catch (err) {
      console.warn('MathBlockWidget Render-Fehler:', err);
    }
    div.textContent = this.source;
    return div;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: Wiki-Embed-Widget. toDOM() schickt den `![[...]]`-Quelltext
// durch api.renderMarkdown — der Output enthaelt entweder ein direktes
// `<img class="wiki-embed">` (Bilder) oder ein Platzhalter-`<span
// class="wiki-embed" data-...>`, das vom bestaehenden Async-Resolver
// applyWikiEmbedsIfPresent zu einem konkreten Embed-Inhalt aufgeloest
// wird (Markdown-Inline, PDF, Other). Konsistent zur Render-Pane.
export class WikiEmbedWidget extends WidgetType {
  constructor(source, basePath) {
    super();
    this.source = source;
    this.basePath = basePath || '';
  }
  eq(other) {
    return (
      other instanceof WikiEmbedWidget &&
      other.source === this.source &&
      other.basePath === this.basePath
    );
  }
  toDOM() {
    const container = document.createElement('span');
    container.className = 'cm-live-embed';
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      container.innerHTML = html;
      // Falls markdown-it einen Wrapping-Paragraph eingesetzt hat, dessen
      // Inhalt nach oben heben (sauberere Inline-Darstellung).
      const onlyChild = container.children.length === 1 ? container.children[0] : null;
      if (onlyChild && onlyChild.tagName === 'P') {
        const inner = onlyChild.innerHTML;
        container.innerHTML = inner;
      }
      // Async-Resolver fuer Platzhalter-Spans (Markdown-/PDF-/Other-Embeds).
      // applyWikiEmbedsIfPresent traversiert .wiki-embed-Spans im Container
      // und ersetzt sie durch konkrete Embed-Inhalte.
      if (this.basePath && typeof applyWikiEmbedsIfPresent === 'function') {
        applyWikiEmbedsIfPresent(container, this.basePath).catch((err) => {
          console.warn('WikiEmbedWidget Async-Resolver-Fehler:', err);
        });
      }
    } catch (err) {
      console.warn('WikiEmbedWidget Render-Fehler:', err);
      container.textContent = this.source;
    }
    return container;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0088 (Epic 3E-0014): Generisches Block-Widget fuer Markdown-Inhalt,
// der durch die preload-Pipeline gerendert wird. Deckt Pipe-Tabellen,
// Perspective-Tabellen (via Fenced-Code mit Info-Tag) und Fenced-Code mit Syntax-
// Highlighting ab. KaTeX-Block hat eine eigene Klasse (MathBlockWidget),
// weil dort spezifisch der .katex-display-Knoten aus dem HTML-Output
// extrahiert wird.
//
// Cache-Integration: pro Widget-Instanz wird der vom Pre-Pass berechnete
// cacheKey im toDOM() geprueft. Cache-Hit → DOM clonen und zurueckgeben;
// Cache-Miss → api.renderMarkdown aufrufen, Output speichern und klonen.
// Bei reinem Tippen ausserhalb des Blocks aendert sich der Quelltext
// nicht, eq() bleibt gleich, Widget-Re-Build entfaellt; bei Block-
// Aenderungen springt der cacheKey, neuer Cache-Eintrag.
export class MarkdownBlockWidget extends WidgetType {
  constructor(source, basePath, cacheKey) {
    super();
    this.source = source;
    this.basePath = basePath || '';
    this.cacheKey = cacheKey;
  }
  eq(other) {
    return (
      other instanceof MarkdownBlockWidget &&
      other.source === this.source &&
      other.basePath === this.basePath &&
      other.cacheKey === this.cacheKey
    );
  }
  toDOM() {
    const container = document.createElement('div');
    // 'markdown-body' bringt Tabellen-, Code- und allgemeine Render-Pane-
    // Styles in den Editor-Kontext, damit Tabellen und Fenced-Code im
    // Live-Modus optisch identisch zur Render-Pane wirken.
    container.className = 'cm-live-block markdown-body';
    const cached = liveBlockCacheGet(this.cacheKey);
    if (cached) {
      container.appendChild(cached.cloneNode(true));
      this._enhance(container);
      return container;
    }
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // markdown-it wickelt Inhalte ggf. in <p>. Bei Tabellen liegt das
      // <table> direkt im Output (kein <p>); bei Fenced-Code direkt
      // <pre><code>. Wir nehmen den ersten relevanten Knoten und cachen
      // dessen Clone.
      // 4T-0418: .perspective-datatable VOR table — der Wrapper (mit den
      // data-dt-Attributen fuer den Grid-Editor) liegt in Dokument-
      // Reihenfolge vor seiner inneren Tabelle und gewinnt damit.
      // 4T-0512 (Epic 3E-0092): .perspective-events ebenso VOR table —
      // ohne den Wrapper verlöre das Live-Widget data-ev-Attribute
      // (Fence-Zuordnung, Stichtag), Formularzeile und Differenz-Spalte
      // (PO-Befund C1 vom 2026-07-15).
      const child =
        tmp.querySelector(
          '.perspective-events, .perspective-datatable, table, pre, .katex-display, .katex',
        ) || tmp.firstElementChild;
      if (child) {
        liveBlockCacheSet(this.cacheKey, child);
        container.appendChild(child.cloneNode(true));
        this._enhance(container);
        return container;
      }
    } catch (err) {
      console.warn('MarkdownBlockWidget Render-Fehler:', err);
    }
    container.textContent = this.source;
    return container;
  }
  // K-10/R1-15 (4T-0186): Nachverarbeitung wie im Render-Pane (Copy-
  // Buttons, Callout-Default-Titel-Uebersetzung, Tabellen-Sortierung). Laeuft
  // nach JEDEM Einhaengen — auch beim Cache-Klon, weil cloneNode die
  // Event-Listener verliert; der Cache selbst bleibt unbehandelt.
  _enhance(container) {
    try {
      applyCodeCopyButtons(container);
      applyTranslations(container);
      enhancePerspectiveTableSorting(container);
      // 4T-0355: perspective-query-Platzhalter im Live-Modus befüllen. Läuft
      // bei jedem Einhängen (auch Cache-Klon), sodass die Liste aktuell ist;
      // No-op bei anderen Block-Widgets. basePath aus dem Widget.
      applyFrontmatterQueriesIfPresent(container, this.basePath);
      // 4T-0435 (Epic 3E-0081): Journal-Navigation im Live-Widget befüllen
      // (Listener pro Mount frisch; ignoreEvent hält die CM-Handler fern).
      applyJournalNavIfPresent(container, this.basePath);
      // 4T-0412 (Epic 3E-0078): Skript-Blöcke im Live-Widget ausführen bzw.
      // als Quelltext zeigen (No-op bei anderen Block-Widgets).
      applyPerspectiveScriptsIfPresent(container, this.basePath);
      // 4T-0409 (Epic 3E-0077): Klick-Pfad der Treffer direkt am Container —
      // ignoreEvent() dieses Widgets hält die zentralen CM-Handler fern.
      bindFrontmatterQueryClicks(container);
      // 4T-0418: Datatable-Fehler-/Limit-Texte lokalisieren (No-op sonst).
      applyPerspectiveDatatablesIfPresent(container);
      // 4T-0419: Grid-Editor im Live-Widget (Container ist pro Mount neu).
      bindPerspectiveDatatableEditor(container);
      // 4T-0420: Ansichts-Zustand nach jedem Widget-Mount wiederanwenden.
      applyPerspectiveDatatableViewStates(container);
      // 4T-0512 (Epic 3E-0092): Ereignis-Fence im Live-Widget lokalisieren
      // und Editor binden (No-op bei anderen Block-Widgets).
      applyPerspectiveEventsIfPresent(container);
      bindPerspectiveEventsEditor(container);
      // 4T-0513: Ansichts-Zustand nach jedem Widget-Mount wiederanwenden.
      applyPerspectiveEventsViewStates(container);
    } catch (err) {
      console.warn('MarkdownBlockWidget Nachverarbeitung fehlgeschlagen:', err);
    }
  }
  ignoreEvent() {
    return true;
  }
}
