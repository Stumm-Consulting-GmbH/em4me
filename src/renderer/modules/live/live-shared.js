// Zyklenfreies Leaf-Modul des Live-Modus: Rebuild-Effekt, Block-Render-Cache
// und Code-Kontext-Helfer.
// 4T-000982 (Epic 3E-000196): aus live-widgets.js herausgelöst, damit der bewusste
// Import-Zyklus zwischen live-deco.js und live-widgets.js entfällt. Das Modul
// importiert ausschließlich CodeMirror-Pakete und hängt an keinem anderen
// Modul des Renderers; jedes Live-Untermodul darf es deshalb laden.
'use strict';

import { StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

// 4T-000087: StateEffect, der einen Plugin-Re-Compute erzwingt — wird vom
// Sprach-Refresh-Hook nach Sprach-Wechsel dispatched, damit Callout-
// Default-Titel-Widgets neu gebaut werden (eq()-Mismatch zwischen alter
// und neuer Sprache).
export const liveRebuildEffect = StateEffect.define();

// 4T-000088: Widget-Render-Cache (Map mit Insertion-Order, aelteste raus
// bei Ueberlauf). Schluessel-Format `<type>:<hash>` bzw. `fence:<lang>:
// <hash>` verhindert Typ-Kollisionen. mermaidHash (FNV-1a 32-bit, in
// render-mermaid.js) wird als generischer String-Hash wiederverwendet.
export const LIVE_BLOCK_CACHE_MAX_SIZE = 200;
export const liveBlockRenderCache = new Map();
export function liveBlockCacheGet(key) {
  return liveBlockRenderCache.get(key) || null;
}
export function liveBlockCacheSet(key, dom) {
  if (liveBlockRenderCache.size >= LIVE_BLOCK_CACHE_MAX_SIZE) {
    const oldest = liveBlockRenderCache.keys().next().value;
    if (oldest !== undefined) liveBlockRenderCache.delete(oldest);
  }
  liveBlockRenderCache.set(key, dom);
}

// 4T-000293: beim Erweiterungs-Umschalten sind gecachte Block-Renderings
// ungueltig (sie entstanden mit dem alten Plugin-Satz der Pipeline) —
// der Umschalt-Pfad in app-init.js leert den Cache vor dem Neuaufbau.
export function clearLiveBlockRenderCache() {
  liveBlockRenderCache.clear();
}

// 4T-000081: Code-Kontext-Erkennung. Markdown-Marker innerhalb von Code
// (Inline-Code, Fenced-Code, Code-Block) duerfen nicht als Markup
// interpretiert werden, sonst zerlegt der Live-Modus Code-Beispiele wie
// `**nicht fett**`. Zwei Varianten: nodeInsideCode prueft per Lezer-Eltern-
// kette (fuer Knoten aus syntaxTree.iterate); positionInsideCode prueft per
// resolveInner(pos) (fuer Regex-Treffer ohne Knoten-Referenz).
export const LIVE_CODE_PARENT_NAMES = new Set(['InlineCode', 'FencedCode', 'CodeBlock']);

export function nodeInsideCode(node) {
  let n = node.node.parent;
  while (n) {
    if (LIVE_CODE_PARENT_NAMES.has(n.name)) return true;
    n = n.parent;
  }
  return false;
}

export function positionInsideCode(state, pos) {
  let n = syntaxTree(state).resolveInner(pos, 1);
  while (n) {
    if (LIVE_CODE_PARENT_NAMES.has(n.name)) return true;
    n = n.parent;
  }
  return false;
}

export function activeLineSet(state) {
  const set = new Set();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) set.add(n);
  }
  return set;
}
