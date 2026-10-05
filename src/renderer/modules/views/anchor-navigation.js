// --- Modus-uebergreifende Ziel-Navigation (4T-000186) -------------------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
// K-02/R3-03/R4-09: Anker- und Zeilen-Spruenge muessen in jedem Ansichts-Modus
// wirken. Reading scrollt das Render-Pane (Anker-Element bzw.
// data-source-line-Mapping); Source/Live setzen den Editor-Cursor auf die
// Ziel-Zeile — im Live-Modus klappt das auch Block-Widgets auf. Split
// bedient beide Seiten (Scroll-Sync zieht ohnehin nach).
// 4T-002072 (Epic 3E-000192): Die Zeile einer Block-Kennung kommt aus der
// Heimat src/shared/block-anchors.js (findBlockAnchorLine).
'use strict';

import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { getDocText } from '../app/api.js';
// K-02 (4T-000186): identische Slugs wie der markdown-it-anchor-Render-Pfad.
import { githubLikeSlug } from '../../../shared/markdown/slug.js';
// 4T-001986 (Epic 3E-000332): die Datensatz-Zeile als dritte Anker-Herkunft,
// gelesen mit der Grammatik des Datensatz-Blocks statt einer eigenen Kopie.
import { findeDatensatzZeile } from '../../../shared/database/record-anchor.js';
// 4T-002072: Block-Kennungen aus ihrer Heimat (Anker-Zeile und Kopf-Name).
import { extractBlockAnchors } from '../../../shared/block-anchors.js';
import { getPaneEls, state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-000990 (Epic 3E-000196): panels.js ist in den Feature-Ordner panels/ geteilt.
import { extractHeadingText } from '../panels/panel-outline.js';

import { findRenderElementForLine } from './scroll-sync.js';

// 4T-000054: Nach dem Oeffnen einer Datei (Klick auf [[Datei#Anker]]) zum
// Anker scrollen. Render-Pane braucht einen Repaint, daher Verzoegerung;
// 100 ms reicht typischerweise auch fuer groessere Dokumente.
// R4-09 (4T-000186): modusbewusst (Editor-Sprung in source/live).
export function scrollToAnchorAfterOpen(paneIdx, anchorId) {
  setTimeout(() => navigateToAnchorInPane(paneIdx, anchorId), 100);
}

// 4T-000502 (Epic 3E-000096): Zeilen-Sprung nach dem Oeffnen (Task-Treffer der
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
    // 4T-001986 (Epic 3E-000332): Der zweite Suchweg ist die Zeile der
    // Datensatz-Anzeige, die ihre Kennung als `data-rec-id` trägt. Bewusst kein
    // `id` an der Zeile: Eine zweimal eingebettete Tabelle ergäbe sonst doppelte
    // Kennungen im Dokument. Der `id`-Weg bleibt vorn, damit Überschrift und
    // Block-Anker vor der Datensatz-Kennung kommen, wie bei der Gültigkeit. Im
    // Aus-Zustand der Erweiterung `database` fehlt das Attribut, und es bleibt
    // beim Öffnen der Datei.
    const target =
      els.renderedHtml.querySelector(`[id="${escaped}"]`) ||
      els.renderedHtml.querySelector(`[data-rec-id="${escaped}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // Ungueltiger Selector — defensive Aufgabe, kein UI-Effekt.
  }
}

// --- Modus-uebergreifende Ziel-Navigation (4T-000186) --------------------------
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

// Zeile einer Block-Kennung im Doc finden: die Zeile des ersten Vorkommens nach
// der Heimat der Kennungen. 4T-002072 (Epic 3E-000192): vorher eine eigene
// Suche nach `^id` am Zeilenende, die auch Code-Beispiele und Frontmatter traf
// und den Namen in der Kopf-Angabe `table:` einer Datentabelle nicht kannte.
// Für einen solchen Namen ist die Zeile die der Angabe; im Live-Modus klappt
// der Block dort auf.
export function findBlockAnchorLine(view, id) {
  if (!view || !id) return 0;
  return extractBlockAnchors(getDocText(view.state.doc)).lineById.get(id) || 0;
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
    // 4T-001986 (Epic 3E-000332): dritter Suchweg, die Datensatz-Zeile
    // `|- id="…"` im Datensatz-Block einer Tabellen-Datei. Gebunden an die
    // eingeschaltete Erweiterung `database`; sonst spränge die Quellcode-Ansicht
    // im Aus-Zustand weiterhin in den Zaun, während die Lese-Ansicht nichts
    // findet. In der Live-Ansicht klappt der Block mit der Schreibmarke auf.
    if (!line && isExtensionActive('database')) {
      line = findeDatensatzZeile(getDocText(view.state.doc), anchorId);
    }
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
