// --- Modus-uebergreifende Ziel-Navigation (4T-0186) -------------------------
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
// K-02/R3-03/R4-09: Anker- und Zeilen-Spruenge muessen in jedem Ansichts-Modus
// wirken. Reading scrollt das Render-Pane (Anker-Element bzw.
// data-source-line-Mapping); Source/Live setzen den Editor-Cursor auf die
// Ziel-Zeile — im Live-Modus klappt das auch Block-Widgets auf. Split
// bedient beide Seiten (Scroll-Sync zieht ohnehin nach).
'use strict';

import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { getDocText } from '../app/api.js';
// K-02 (4T-0186): identische Slugs wie der markdown-it-anchor-Render-Pfad.
import { githubLikeSlug } from '../../../shared/markdown/slug.js';
import { getPaneEls, state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
// 4T-0990 (Epic 3E-0196): panels.js ist in den Feature-Ordner panels/ geteilt.
import { extractHeadingText } from '../panels/panel-outline.js';

import { findRenderElementForLine } from './scroll-sync.js';

// 4T-0054: Nach dem Oeffnen einer Datei (Klick auf [[Datei#Anker]]) zum
// Anker scrollen. Render-Pane braucht einen Repaint, daher Verzoegerung;
// 100 ms reicht typischerweise auch fuer groessere Dokumente.
// R4-09 (4T-0186): modusbewusst (Editor-Sprung in source/live).
export function scrollToAnchorAfterOpen(paneIdx, anchorId) {
  setTimeout(() => navigateToAnchorInPane(paneIdx, anchorId), 100);
}

// 4T-0502 (Epic 3E-0096): Zeilen-Sprung nach dem Oeffnen (Task-Treffer der
// Abfrage) — gleiches Timing wie der Anker-Sprung, modusbewusst wie
// navigateToAnchorInPane (Reading scrollt das Render-Pane ueber das
// data-source-line-Mapping, Source/Live setzen den Editor-Cursor).
export function scrollToLineAfterOpen(paneIdx, lineNumber) {
  setTimeout(() => {
    const pane = state.panes[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    if (!tab) return;
    if (tab.viewMode === 'rendered' || tab.viewMode === 'split') {
      scrollRenderedToLine(paneIdx, lineNumber);
    }
    if (tab.viewMode !== 'rendered') {
      scrollEditorToLine(paneIdx, lineNumber);
    }
  }, 100);
}

export function scrollToAnchorInPane(paneIdx, anchorId) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.renderedHtml || !anchorId) return;
  try {
    const escaped =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(anchorId)
        : anchorId.replace(/(["\\])/g, '\\$1');
    const target = els.renderedHtml.querySelector(`[id="${escaped}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // Ungueltiger Selector — defensive Aufgabe, kein UI-Effekt.
  }
}

// --- Modus-uebergreifende Ziel-Navigation (4T-0186) --------------------------
// K-02/R3-03/R4-09: Anker- und Zeilen-Sprünge muessen in jedem Ansichts-
// Modus wirken. Reading scrollt das Render-Pane (Anker-Element bzw.
// data-source-line-Mapping); Source/Live setzen den Editor-Cursor auf die
// Ziel-Zeile — im Live-Modus klappt das auch Block-Widgets auf. Split
// bedient beide Seiten (Scroll-Sync zieht ohnehin nach).

// R3-06: DOM-ids sind Heading-Slugs bzw. Block-IDs ohne '^'. Rohe Anker
// aus Panels/Quelltext vor der Uebergabe normalisieren.
export function normalizedAnchorId(anchor) {
  const a = String(anchor || '').trim();
  if (!a) return '';
  if (a.startsWith('^')) return a.slice(1).trim();
  return githubLikeSlug(a) || a;
}

export function scrollEditorToLine(paneIdx, lineNumber) {
  const view = paneEditors[paneIdx];
  if (!view) return false;
  const ln = Math.max(1, Math.min(view.state.doc.lines, lineNumber | 0));
  const pos = view.state.doc.line(ln).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  });
  return true;
}

// Heading-Zeile zu einem Slug finden — mit derselben Duplikat-
// Deduplizierung wie markdown-it-anchor (slug, slug-1, slug-2, …).
// Quelle ist der Lezer-Baum (immer aktive markdown()-Extension), NICHT
// das foldStructureField — das existiert nur bei eingeschaltetem
// Fold-Gutter.
export function findHeadingLineForSlug(view, slug) {
  if (!view || !slug) return 0;
  const doc = view.state.doc;
  const seen = new Map();
  let found = 0;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (found) return false;
      if (!/^(?:ATX|Setext)Heading[1-6]$/.test(node.name)) return;
      const fromLine = doc.lineAt(node.from).number;
      const base = githubLikeSlug(extractHeadingText(doc, fromLine));
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      const effective = n === 0 ? base : `${base}-${n}`;
      if (effective === slug) {
        found = fromLine;
        return false;
      }
    },
  });
  return found;
}

// Block-Anker-Zeile (`^id` am Zeilenende) im Doc finden.
export function findBlockAnchorLine(view, id) {
  if (!view || !id) return 0;
  const lines = getDocText(view.state.doc).split('\n');
  const needle = '^' + id;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    if (trimmed.endsWith(needle)) {
      const before = trimmed.slice(0, trimmed.length - needle.length);
      if (before === '' || /\s$/.test(before)) return i + 1;
    }
  }
  return 0;
}

export function navigateToAnchorInPane(paneIdx, anchorId) {
  if (!anchorId) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab) return;
  if (tab.viewMode === 'rendered' || tab.viewMode === 'split') {
    scrollToAnchorInPane(paneIdx, anchorId);
  }
  if (tab.viewMode !== 'rendered') {
    const view = paneEditors[paneIdx];
    if (!view) return;
    let line = findHeadingLineForSlug(view, anchorId);
    if (!line) line = findBlockAnchorLine(view, anchorId);
    if (line) scrollEditorToLine(paneIdx, line);
  }
}

// R3-03: Zeilen-Sprung ins Render-Pane (Reading-Modus). Kleiner Delay,
// damit ein unmittelbar vorausgegangener Tab-Wechsel-Render samt
// Scroll-Restore (Doppel-rAF in renderPaneContent) nicht dazwischenfunkt.
export function scrollRenderedToLine(paneIdx, lineNumber) {
  setTimeout(() => {
    const els = getPaneEls(paneIdx);
    if (!els || !els.renderedEl) return;
    const target = findRenderElementForLine(els.renderedEl, lineNumber);
    if (target && target.isConnected) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}
