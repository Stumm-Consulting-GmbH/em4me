// 4T-002351 (Epic 3E-000184): Die Hervorhebung im `workflow`-Block des Editors.
//
// Schlüsselwort, Text in Anführungszeichen und Platzhalter bekommen je eine
// Marke (`cm-wf-keyword`, `cm-wf-string`, `cm-wf-placeholder`); die Lage liefert
// `workflowHighlightRanges` aus dem Kern, derselbe Erkenner wie in der
// Darstellung (`src/shared/markdown/workflow-block.js`). Es wirkt in Quelltext-
// und Live-Ansicht, im Live-Modus im aufgeklappten Block; der zugeklappte Block
// ist ein Widget und wird über die Pipeline gefärbt.
//
// **Warum ein ViewPlugin über die sichtbaren Bereiche** statt eines StateField
// über das ganze Dokument (Muster der Marker-Felder in live-marker-fields.js):
// Das ist der Standard-Weg von CodeMirror für Hervorhebungen und erfüllt die
// Leitplanke «Keine Voll-Dokument-Arbeit pro Tastendruck» (Entwicklungs-
// richtlinien, Kapitel 5). Mark-Dekorationen dürfen aus einem ViewPlugin
// kommen; die Einschränkung von CodeMirror betrifft ersetzende Dekorationen
// über Zeilengrenzen.
//
// **Erkennung des Blocks** über den Syntax-Baum (`FencedCode` mit `CodeInfo`),
// wie das Block-Feld der Live-Ansicht den Info-Text liest; ein eigener
// Zaun-Durchlauf entsteht nicht. Wie die Erkennung im Kern (G1) zählt nur ein
// Block der obersten Ebene. Gefärbt wird jeder `workflow`-Block, auch ohne
// Kennzeichen im Dateikopf (Entscheidung der Sitzung vom 2026-10-23, E4).
//
// **Aus-Zustand:** ohne die Erweiterung `workflows` keine Marke; der
// Umschalt-Pfad sendet `liveRebuildEffect`, und das Plugin baut neu.
'use strict';

import { Decoration, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { workflowHighlightRanges } from '../../../shared/workflows/workflow-highlight.js';
import {
  WORKFLOWS_EXTENSION_ID,
  WORKFLOW_FENCE_LANG,
} from '../../../shared/workflows/workflow-konstanten.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { liveRebuildEffect } from '../live/live-shared.js';

const MARKE = {
  keyword: Decoration.mark({ class: 'cm-wf-keyword' }),
  string: Decoration.mark({ class: 'cm-wf-string' }),
  placeholder: Decoration.mark({ class: 'cm-wf-placeholder' }),
};

function kindKnoten(knoten, name) {
  for (let k = knoten.firstChild; k; k = k.nextSibling) if (k.name === name) return k;
  return null;
}

// Marken eines Blocks: jede Zeile des Inhalts für sich, wie der Zeilen-Leser liest.
function blockMarken(doc, code, marken) {
  const letzte = doc.lineAt(code.to).number;
  for (let nr = doc.lineAt(code.from).number; nr <= letzte; nr++) {
    const zeile = doc.line(nr);
    for (const s of workflowHighlightRanges(zeile.text)) {
      if (s.to > s.from) marken.push(MARKE[s.kind].range(zeile.from + s.from, zeile.from + s.to));
    }
  }
}

/**
 * Die Marken der `workflow`-Blöcke in den sichtbaren Bereichen.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/view').DecorationSet}
 */
export function baueWorkflowMarken(view) {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return Decoration.none;
  const { state } = view;
  const marken = [];
  const gesehen = new Set();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(knoten) {
        if (knoten.name !== 'FencedCode') return;
        if (gesehen.has(knoten.from)) return false;
        gesehen.add(knoten.from);
        // Nur Blöcke der obersten Ebene; in Zitat oder Liste trüge jede Zeile
        // ein Präfix, das der Zeilen-Leser als Schlüsselwort läse.
        if (knoten.node.parent && knoten.node.parent.name !== 'Document') return false;
        const info = kindKnoten(knoten.node, 'CodeInfo');
        const code = kindKnoten(knoten.node, 'CodeText');
        if (!info || !code) return false;
        if (state.doc.sliceString(info.from, info.to).trim() !== WORKFLOW_FENCE_LANG) return false;
        blockMarken(state.doc, code, marken);
        return false;
      },
    });
  }
  return Decoration.set(marken, true);
}

export const workflowHervorhebung = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = baueWorkflowMarken(view);
    }
    update(update) {
      const neu =
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState) ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(liveRebuildEffect)));
      if (neu) this.decorations = baueWorkflowMarken(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
