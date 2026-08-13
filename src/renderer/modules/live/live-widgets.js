// Aufbau der Live-Modus-Decorations: Kernfunktion als Orchestrator der
// Pass-Module, ViewPlugin und das Extension-Bündel des Live-Compartments.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-0982 (Epic 3E-0196): in den Feature-Ordner live/ umgezogen; Scans,
// Mermaid-Widget, Block-Field und Interaktion liegen in eigenen Modulen.
// 4T-0996 (Epic 3E-0196): die Kernfunktion ist in vier Pass-Module zerlegt
// (Lezer-Baum, zwei Inline-Blöcke, Block-Pässe). Sie ermittelt weiterhin die
// je Build gültigen Werte, füllt damit den gemeinsamen Kontext und ruft die
// Pässe in unveränderter Reihenfolge; die Klick-Factories der Inline-Marks
// liegen jetzt bei den übrigen Decoration-Bausteinen in live-deco.js.
'use strict';

import { ViewPlugin, Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// 4T-0293 (Epic 3E-0052): Schalt-Zustand der Render-Erweiterungen — jeder
// Konstrukt-Pass steht unter der Guard seiner Erweiterung, damit der
// Live-Modus konsistent zum Render-Pane schaltet (zyklenfrei: das
// Lebenszyklus-Modul importiert nur api und die shared Registry).
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { computeMathBlockRanges } from './live-deco.js';
import { activeLineSet, liveRebuildEffect } from './live-shared.js';
import { computeCommentRanges, detectFrontmatterLines } from './live-marker-fields.js';
import { computeCalloutScan } from './live-scans.js';
import { computeLiveHeadingNumbers } from './live-heading-numbers.js';
import { runLezerPass } from './live-pass-lezer.js';
import { runInlinePasses } from './live-pass-inline.js';
import { runCalloutPasses } from './live-pass-callouts.js';
import { runLateInlinePasses } from './live-pass-inline-late.js';
import { liveBlockWidgetsField } from './live-block-field.js';
import {
  liveAbbrHoverTooltip,
  liveFootnoteHoverTooltip,
  livePreviewClickHandler,
} from './live-interaction.js';

// 4T-0084: Helper zum Auflesen des basePath fuer einen EditorView ueber
// den paneEditors-Index. Liefert tab.path des aktuell aktiven Tabs der
// passenden Pane, oder leerer String wenn nicht ermittelbar. Wird im
// Decoration-Build pro Widget-Konstruktor uebergeben (Entscheidung B.1
// aus der Tabelle vom 2026-05-24: Widget enthaelt alles, was es zum
// Rendern braucht; eq() reagiert auf Datei-Wechsel).
export function basePathForView(view) {
  const paneIdx = paneEditors.indexOf(view);
  if (paneIdx < 0) return '';
  const pane = state.panes && state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return '';
  const tab = pane.tabs && pane.tabs[pane.activeIndex];
  return tab && tab.path ? tab.path : '';
}

export function buildLivePreviewDecorations(view) {
  try {
    return buildLivePreviewDecorationsImpl(view);
  } catch (err) {
    console.error('[Live] buildLivePreviewDecorations crashed:', err);
    return Decoration.none;
  }
}

export function buildLivePreviewDecorationsImpl(view) {
  const ranges = [];
  const state = view.state;
  const activeLines = activeLineSet(state);
  // 4T-0084: basePath des aktuellen Tabs fuer Pfad-Aufloesung in Image-,
  // Embed- und sonstigen Widget-Renderings, die ueber api.renderMarkdown
  // laufen. Pro Build einmal ermittelt; Widgets bekommen ihn im Konstruktor
  // (Entscheidung B.1).
  const basePath = basePathForView(view);
  // 4T-0081: Tags im YAML-Frontmatter werden nicht als Live-Decoration
  // gerendert, analog zum markdown-it-Pfad, der den Frontmatter-Block
  // separat verarbeitet.
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;

  // 4T-0083 / 4T-0087: Pre-Pass fuer Callout-Erkennung. Lezer-Markdown
  // splittet einen Callout-Block (`> [!type]` Header + `> Body`-Zeilen)
  // gelegentlich in mehrere Blockquote-Knoten — der Test auf die erste
  // Zeile eines einzelnen Knotens reicht deshalb nicht aus. Wir scannen
  // die Doc einmal zeilenweise:
  // - calloutLines (4T-0083): Set der Zeilen-Nummern, die zu einem
  //   gueltigen Callout gehoeren. Blockquote-Branch ueberspringt diese.
  // - calloutInfos (4T-0087): Array pro Callout-Block mit Type, Fold-
  //   Char, Override-Titel, Header- und letzte Zeile. Wird vom Callout-
  //   Decoration-Pass weiter unten konsumiert.
  // Unbekannte Typen (`> [!quatsch]`) werden NICHT als Callout markiert
  // und fallen damit auf die normale Blockquote-Decoration zurueck.
  // 4T-0293: bei deaktivierter Callout-Erweiterung ist der Scan leer —
  // Callout-Bloecke werden zu normalen Blockquotes (Paritaet zum Render).
  const { calloutLines, calloutInfos } = isExtensionActive('callouts')
    ? computeCalloutScan(state.doc)
    : { calloutLines: new Set(), calloutInfos: [] };
  // 4T-0084: KaTeX-Block-Ranges nur fuer den Konflikt-Check im Inline-
  // Math-Pass. Die eigentliche Block-Decoration kommt aus dem separaten
  // liveMathBlockField (StateField), weil ViewPlugins keine block:true-
  // Decorations liefern duerfen.
  const mathBlockRanges = computeMathBlockRanges(state);
  // 4T-0479 (Epic 3E-0089): %%-Kommentar-Bereiche einmal pro Build aus dem
  // geteilten Scanner (Voll-Doc, pro Doc-Version gecacht) — der Pass unten
  // blendet sie auf inaktiven Zeilen aus.
  const commentRanges = isExtensionActive('comments') ? computeCommentRanges(state.doc) : [];
  // 4T-0471 (Epic 3E-0087): Nummern-Map der Ueberschriften (volle Liste, damit
  // die Zaehlung viewport-unabhaengig stimmt).
  const headingNumberByLine = computeLiveHeadingNumbers(state, frontmatterEndLine);

  // 4T-0996 (Epic 3E-0196): gemeinsamer Kontext der Pass-Module. Er trägt die
  // einmal je Build ermittelten Werte oben und die je Sichtbereich
  // wechselnden Felder darunter, dazu die drei Spannen-Sammlungen, die in
  // der früheren Kernfunktion Closures waren.
  const ctx = {
    state,
    ranges,
    activeLines,
    basePath,
    frontmatterEndLine,
    calloutLines,
    calloutInfos,
    mathBlockRanges,
    commentRanges,
    headingNumberByLine,
    from: 0,
    to: 0,
    text: '',
    wikiSpans: [],
    attrSpans: [],
    criticSpans: [],
  };

  for (const { from, to } of view.visibleRanges) {
    ctx.from = from;
    ctx.to = to;
    // Sichtbereichs-Text und Spannen-Sammlungen sind je Sichtbereich frisch.
    ctx.text = state.doc.sliceString(from, to);
    ctx.wikiSpans = [];
    ctx.attrSpans = [];
    ctx.criticSpans = [];
    // Die Reihenfolge der vier Pässe ist semantiktragend und entspricht
    // exakt der Reihenfolge der früheren Kernfunktion: Lezer-Baum, erster
    // Inline-Block, Block-Pässe, zweiter Inline-Block.
    runLezerPass(ctx);
    runInlinePasses(ctx);
    runCalloutPasses(ctx);
    runLateInlinePasses(ctx);
  }
  // KaTeX-Block-Decorations werden separat ueber liveMathBlockField
  // bereitgestellt. CodeMirror 6 verbietet im ViewPlugin sowohl
  // block:true-Decorations als auch jeden Replace, dessen Range einen
  // Zeilenumbruch ueberspannt ("Decorations that replace line breaks may
  // not be specified via plugins"). Beides geht nur ueber StateField.
  return Decoration.set(ranges, true);
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildLivePreviewDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildLivePreviewDecorations(update.view);
        return;
      }
      // R1-02 (4T-0174): Lezer parst grosse Dateien asynchron nach; der
      // fertige Baum kommt OHNE docChanged/selection an. Tree-Identitaets-
      // vergleich wie beim foldStructureField, sonst fehlen Dekorationen
      // in spaeten Dokument-Teilen bis zur naechsten Eingabe.
      if (syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = buildLivePreviewDecorations(update.view);
        return;
      }
      // 4T-0087: Explizite Re-Build-Trigger (z.B. nach Sprach-Wechsel).
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(liveRebuildEffect)) {
            this.decorations = buildLivePreviewDecorations(update.view);
            return;
          }
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// 4T-0082: Extension-Bundle fuer den Live-Modus. Plugin (Decorations) +
// Klick-Handler + Hover-Tooltip werden im selben Compartment ein-/
// ausgeschaltet.
export const livePreviewExtensions = [
  livePreviewPlugin,
  livePreviewClickHandler,
  liveFootnoteHoverTooltip,
  liveAbbrHoverTooltip,
  liveBlockWidgetsField,
];
