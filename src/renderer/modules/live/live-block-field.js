// StateField der Block-Widgets des Live-Modus samt Basispfad-Facet und den
// Signaturen, die den teuren Neuaufbau bei reiner Cursor-Bewegung sparen.
// 4T-0982 (Epic 3E-0196): aus live-widgets.js herausgelöst; die Widget-Klassen
// selbst liegen in live-widget-render.js und live-mermaid-widget.js.
'use strict';

import { StateField, Facet } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { getLanguage } from '../../i18n.js';
// 4T-0512 (Epic 3E-0092): Stichtag fuer den Cache-Key der Ereignis-Widgets.
import { localTodayIso } from '../../../shared/markdown/perspective-events.js';
// 4T-0293 (Epic 3E-0052): Schalt-Zustand der Render-Erweiterungen — jeder
// Konstrukt-Pass steht unter der Guard seiner Erweiterung, damit der
// Live-Modus konsistent zum Render-Pane schaltet.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-0283 (Epic 3E-0050): Schalter-Zustand der Frontmatter-Anzeige als
// Guard fuer das Frontmatter-Block-Widget (zyklenfrei: importiert nur api).
import { isFrontmatterDisplayEnabled } from '../frontmatter-display.js';
import { currentMermaidTheme, mermaidHash } from '../render-mermaid.js';
import { activeLineSet, liveRebuildEffect, positionInsideCode } from './live-shared.js';
import { computeCommentRanges, detectFrontmatterLines } from './live-marker-fields.js';
import { blockIsActive, computeMathBlockRanges } from './live-deco.js';
import { computeDeflistLineBlockScan, positionInsideTable } from './live-scans.js';
import { MarkdownBlockWidget, MathBlockWidget } from './live-widget-render.js';
import { FrontmatterBlockWidget, MermaidBlockWidget } from './live-mermaid-widget.js';

// 4T-0084 / 4T-0088: StateField fuer Block-Widget-Decorations im Live-
// Modus. ViewPlugins duerfen keine Replace-Decorations liefern, deren
// Range einen Zeilenumbruch ueberspannt (CM6-Einschraenkung). Wir nutzen
// Inline-Replace OHNE block:true — block:true hat in der 4T-0084-Spike-
// Version die vertikale Cursor-Navigation zerschossen (Pfeil oben/unten
// sprang 20-30 Zeilen weg). Multi-line Inline-Replace zieht den Quell-
// Range visuell zu einer Zeile zusammen, in der das Widget sitzt; CSS
// macht es als Block-Layout sichtbar.
//
// 4T-0088: Field umbenannt von liveMathBlockField; deckt seitdem auch
// Tabellen und Fenced-Code-Bloecke ab. basePath wird via liveBasePathFacet
// aus dem State gelesen (Compartment-Reconfigure bei Tab-Wechsel).

// 4T-0088: Facet fuer den basePath des aktiven Tabs einer Pane. Block-
// Widgets (StateField) brauchen den Pfad fuer relative Image-/Embed-
// Aufloesung in Tabellen, koennen aber keine View-Referenz lesen.
// Pro Pane-View wird das Facet ueber editorCompartments.basePath
// initialisiert und bei Tab-Wechsel via Compartment-Reconfigure
// aktualisiert. combine nimmt den ersten Wert (es gibt genau einen
// pro State).
export const liveBasePathFacet = Facet.define({
  combine: (values) => (values.length ? values[0] : ''),
});

// R1-05 (4T-0180): Signatur der blockrelevanten Aktiv-Zeilen. Nur aktive
// Zeilen, die in einem Widget-Kandidaten-Block liegen, beeinflussen das
// Decoration-Ergebnis — eine Cursor-Bewegung ausserhalb aller Bloecke
// (haeufigster Fall) liefert dieselbe Signatur und kann den teuren
// Rebuild (Tree-Walk + Widget-Konstruktion) ueberspringen.
export function blockActiveSignature(activeLines, spans) {
  if (!spans || spans.length === 0) return '';
  const parts = [];
  for (const l of activeLines) {
    for (const s of spans) {
      if (l >= s.fromLine && l <= s.toLine) {
        parts.push(l);
        break;
      }
    }
  }
  return parts.sort((a, b) => a - b).join(',');
}

// 4T-0283: unberuehrte Initial-Selektion (leerer Cursor auf Position 0).
// Fliesst in die Aktiv-Signatur ein, weil das Frontmatter-Widget in
// diesem Zustand trotz aktiver Zeile 1 maskiert bleibt — der Uebergang
// Position 0 <-> 1 aendert die Zeilen-Menge nicht, muss aber rebuilden.
export function isInitialCursorOnly(state) {
  const main = state.selection.main;
  return state.selection.ranges.length === 1 && main.empty && main.from === 0;
}

export function blockWidgetSignature(state, spans) {
  return (
    blockActiveSignature(activeLineSet(state), spans) + (isInitialCursorOnly(state) ? '|fm0' : '')
  );
}

export function buildBlockWidgetValue(state) {
  const ranges = [];
  // spans: Zeilen-Bereiche ALLER Kandidaten-Bloecke (vor dem Aktiv-Skip),
  // Grundlage fuer die Selektions-Signatur im Field-Update.
  const spans = [];
  const activeLines = activeLineSet(state);
  const basePath = state.facet(liveBasePathFacet);
  // 4T-0479 (Epic 3E-0089): Bloecke, die einen %%-Kommentar schneiden,
  // werden NICHT durch Widgets ersetzt (eine kommentierte Tabelle darf im
  // Live-Modus nicht gerendert erscheinen; der Quelltext bleibt stehen und
  // der Kommentar-Pass blendet ihn auf inaktiven Zeilen aus).
  const commentRanges = isExtensionActive('comments') ? computeCommentRanges(state.doc) : [];
  const intersectsComment = (fromPos, toPos) =>
    commentRanges.some((r) => r.from < toPos && r.to > fromPos);
  // KaTeX-Block (4T-0084); 4T-0293: deaktiviert bleibt `$$…$$` Roh-Text.
  if (isExtensionActive('katex')) {
    for (const block of computeMathBlockRanges(state)) {
      if (intersectsComment(block.from, block.to)) continue;
      spans.push({ fromLine: block.fromLine, toLine: block.toLine });
      if (blockIsActive(activeLines, block.fromLine, block.toLine)) continue;
      ranges.push(
        Decoration.replace({
          widget: new MathBlockWidget(block.source, basePath),
        }).range(block.from, block.to),
      );
    }
  }
  // 4T-0088: Tabellen und Fenced-Code via Lezer-AST. Pre-Pass-Filter:
  // Block muss Zeilen-aligned sein (Voraussetzung fuer sauberen Replace),
  // darf nicht im Frontmatter liegen, Cursor in irgendeiner Block-Zeile
  // klappt zur Quelle auf. Mermaid (lang === 'mermaid') wird hier
  // ausgelassen und in 4T-0089 separat behandelt.
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;
  // 4T-0283 (Epic 3E-0050): Frontmatter-Block-Widget (zusammengeklappte
  // Zeile aus 4T-0282) bei aktivem Schalter. Cursor- oder Selektions-
  // Eintritt demaskiert zum Quelltext mit der bestehenden
  // cm-frontmatter-line-Dekoration (frontmatterField bleibt aktiv).
  // Ausnahme: der unberuehrte Initial-Cursor (leere Selektion auf
  // Position 0, Zustand jedes frisch geoeffneten Tabs) demaskiert NICHT —
  // sonst zeigte jeder Datei-Start im Live-Modus rohes YAML statt der
  // zusammengeklappten Zeile. Tastatur-Eintritt (Pfeiltasten ab Position
  // 0) und der Klick ins aufgeklappte YAML setzen Positionen > 0 und
  // demaskieren regulaer.
  if (frontmatter && isFrontmatterDisplayEnabled()) {
    spans.push({ fromLine: frontmatter.fromLine, toLine: frontmatter.toLine });
    if (
      isInitialCursorOnly(state) ||
      !blockIsActive(activeLines, frontmatter.fromLine, frontmatter.toLine)
    ) {
      const fmFrom = state.doc.line(frontmatter.fromLine).from;
      const fmTo = state.doc.line(frontmatter.toLine).to;
      ranges.push(
        Decoration.replace({
          widget: new FrontmatterBlockWidget(state.doc.sliceString(fmFrom, fmTo), getLanguage()),
        }).range(fmFrom, fmTo),
      );
    }
  }
  // 4T-0199: Definition Lists und Line Blocks als Block-Widgets (Quell-
  // Block wird durch den Pipeline-Render ersetzt; Cursor im Block klappt
  // zur Quelle auf). Guards: Frontmatter, Lezer-Code-Kontext, fuer Line
  // Blocks zusaetzlich Lezer-Table (GFM-Tabellen matchen `| ` ebenfalls).
  {
    const { deflists, lineBlocks } = computeDeflistLineBlockScan(state.doc);
    const pushScanBlock = (block, kind) => {
      if (block.fromLine <= frontmatterEndLine) return;
      const fromPos = state.doc.line(block.fromLine).from;
      const toPos = state.doc.line(block.toLine).to;
      if (positionInsideCode(state, fromPos)) return;
      if (kind === 'lineblock' && positionInsideTable(state, fromPos)) return;
      // 4T-0479: kommentierte Bloecke nicht als Widget rendern.
      if (intersectsComment(fromPos, toPos)) return;
      spans.push({ fromLine: block.fromLine, toLine: block.toLine });
      if (blockIsActive(activeLines, block.fromLine, block.toLine)) return;
      const source = state.doc.sliceString(fromPos, toPos);
      ranges.push(
        Decoration.replace({
          widget: new MarkdownBlockWidget(source, basePath, `${kind}:${mermaidHash(source)}`),
        }).range(fromPos, toPos),
      );
    };
    // 4T-0293: pro Konstrukt nur bei aktiver Erweiterung ersetzen —
    // deaktiviert bleibt der Quelltext stehen (Paritaet zum Render, der
    // die Zeilen dann als Absatz bzw. Roh-Text ausgibt).
    if (isExtensionActive('definition-lists')) {
      for (const block of deflists) pushScanBlock(block, 'deflist');
    }
    if (isExtensionActive('line-blocks')) {
      for (const block of lineBlocks) pushScanBlock(block, 'lineblock');
    }
  }
  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter(node) {
      const name = node.name;
      if (name !== 'Table' && name !== 'FencedCode') return;
      const fromLine = state.doc.lineAt(node.from);
      // toLine pragmatisch: wenn node.to direkt nach einem \n liegt (Lezer
      // schliesst trailing newline manchmal ein), ist lineAt(node.to)
      // bereits die Folge-Zeile — wir korrigieren auf die letzte Block-
      // Zeile mit max(node.to - 1, fromLine.from).
      const toPos = node.to > fromLine.from ? node.to - 1 : node.to;
      const toLine = state.doc.lineAt(Math.max(toPos, fromLine.from));
      if (fromLine.number <= frontmatterEndLine) return;
      // 4T-0479: kommentierte Bloecke nicht als Widget rendern.
      if (intersectsComment(node.from, node.to)) return;
      spans.push({ fromLine: fromLine.number, toLine: toLine.number });
      // Validation gelockert: kein strikter Linien-Match wie bei block:true,
      // weil Inline-Replace robust mit Range-Variationen umgeht.
      if (blockIsActive(activeLines, fromLine.number, toLine.number)) return;
      const source = state.doc.sliceString(node.from, node.to);
      let cacheKey;
      if (name === 'Table') {
        cacheKey = `table:${mermaidHash(source)}`;
      } else {
        // FencedCode: Info-String extrahieren (Sprache oder perspective-table).
        let lang = '';
        let inner = node.node.firstChild;
        while (inner) {
          if (inner.name === 'CodeInfo') {
            lang = state.doc.sliceString(inner.from, inner.to).trim();
            break;
          }
          inner = inner.nextSibling;
        }
        // 4T-0293: bei deaktivierter Mermaid-Erweiterung faellt der Block
        // auf das generische MarkdownBlockWidget durch (Code-Block).
        if (lang === 'mermaid' && isExtensionActive('mermaid')) {
          // 4T-0089: eigene Widget-Klasse mit Async-Render und Theme-Cache.
          // Mermaid bekommt NUR den CodeText-Inhalt (ohne ```-Marker und
          // Info-String), sonst meldet es "Syntax error in text". Im
          // Render-Pane extrahiert markdown-it das automatisch; hier
          // muessen wir es aus dem Lezer-AST holen.
          let mermaidSource = '';
          let codeTextChild = node.node.firstChild;
          while (codeTextChild) {
            if (codeTextChild.name === 'CodeText') {
              mermaidSource = state.doc.sliceString(codeTextChild.from, codeTextChild.to);
              break;
            }
            codeTextChild = codeTextChild.nextSibling;
          }
          if (!mermaidSource) return;
          const theme = currentMermaidTheme();
          ranges.push(
            Decoration.replace({
              widget: new MermaidBlockWidget(mermaidSource, theme),
            }).range(node.from, node.to),
          );
          return;
        }
        if (lang === 'perspective-table') {
          cacheKey = `perspective-table:${mermaidHash(source)}`;
        } else if (lang === 'perspective-events') {
          // 4T-0512 (Epic 3E-0092): Stichtag im Cache-Key — die Differenz-
          // Spalte rechnet gegen "heute"; ohne Datums-Anteil zeigte ein
          // ueber Mitternacht gecachtes Widget veraltete Tages-Zaehler.
          cacheKey = `perspective-events:${localTodayIso()}:${mermaidHash(source)}`;
        } else {
          cacheKey = `fence:${lang}:${mermaidHash(source)}`;
        }
      }
      ranges.push(
        Decoration.replace({
          widget: new MarkdownBlockWidget(source, basePath, cacheKey),
        }).range(node.from, node.to),
      );
    },
  });
  return {
    deco: Decoration.set(ranges, true),
    spans,
    sig: blockWidgetSignature(state, spans),
  };
}

export const liveBlockWidgetsField = StateField.define({
  create(state) {
    try {
      return buildBlockWidgetValue(state);
    } catch (err) {
      console.error('[Live] buildBlockWidgetValue (create) crashed:', err);
      return { deco: Decoration.none, spans: [], sig: '' };
    }
  },
  update(value, tr) {
    // R1-14 (4T-0186): expliziter Rebuild-Trigger (Theme-/Sprachwechsel).
    // Der liveRebuildEffect erreichte zuvor nur das Inline-ViewPlugin;
    // Mermaid-BLOCK-Widgets behielten beim Theme-Wechsel die alte Palette,
    // bis die naechste Eingabe den Field-Rebuild ausloeste.
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) {
        try {
          return buildBlockWidgetValue(tr.state);
        } catch (err) {
          console.error('[Live] buildBlockWidgetValue (rebuild) crashed:', err);
          return value;
        }
      }
    }
    // R1-02 (4T-0174): auch beim asynchronen Lezer-Nachlauf rebuilden
    // (Tree-Identitaetsvergleich, Muster vom foldStructureField) — sonst
    // fehlen Block-Widgets in spaeten Teilen grosser Dateien.
    if (!tr.docChanged && syntaxTree(tr.state) === syntaxTree(tr.startState)) {
      if (!tr.selection) return value;
      // R1-05 (4T-0180): reine Selektionsaenderung — Rebuild nur, wenn
      // sich die blockrelevante Aktiv-Zeilen-Menge tatsaechlich aendert
      // (Cursor betritt oder verlaesst einen Kandidaten-Block; inkl.
      // Initial-Cursor-Flanke des Frontmatter-Widgets, 4T-0283).
      const sig = blockWidgetSignature(tr.state, value.spans);
      if (sig === value.sig) return value;
    }
    try {
      return buildBlockWidgetValue(tr.state);
    } catch (err) {
      console.error('[Live] buildBlockWidgetValue (update) crashed:', err);
      return value;
    }
  },
  provide: (f) => EditorView.decorations.from(f, (value) => value.deco),
});
