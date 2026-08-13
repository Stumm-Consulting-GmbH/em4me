// StateFields der Quelltext-Einfaerbung: Such-Treffer, Frontmatter-Zeilen und
// die konstrukt-spezifischen Marker-Felder (Callout, Highlight, Kommentar,
// Fussnote, Inline-Berechnung).
// 4T-0982 (Epic 3E-0196): aus live-deco.js herausgelöst; die Felder wirken in
// Quelltext- UND Live-Modus und hängen nur an api, der Erweiterungs-Schaltung
// und den geteilten Scannern.
'use strict';

import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

import { getDocText } from '../app/api.js';
// 4T-0479 (Epic 3E-0089): geteilter Kommentar-Scanner — dieselbe Quelle wie
// das Render-Strippen in markdown.js (CJS-Modul, esbuild loest den Import).
import { findPercentCommentRanges } from '../../../shared/markdown/plugins.js';
// 4T-0596 (Epic 3E-0111): geteilter Spannen-Scanner der Inline-Berechnungen —
// dieselbe Quelle wie die Render-Pipeline (Paritaet per Konstruktion; das
// Modul ist bewusst markdown.js-frei und damit Bundle-tauglich).
import { findInlineCalcSpans } from '../../../shared/markdown/inline-calc.js';
// 4T-0293 (Epic 3E-0052): Schalt-Zustand der Render-Erweiterungen als Guard
// fuer die konstrukt-spezifischen Marker-Felder (zyklenfrei: importiert nur
// api und die shared Registry). Der Umschalt-Pfad dispatcht den
// liveRebuildEffect, damit die Felder auch ohne Doc-Aenderung neu bauen.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { liveRebuildEffect } from './live-shared.js';

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
