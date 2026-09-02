// 4T-000590 (Epic 3E-000109): Laufzeit-Backend der Tabellen-Kommandos.
//
// Ein Operationen-Satz, zwei Backends (Architekturentscheidung 1 des Epics):
// getTableContext erkennt am Cursor, ob eine klassische Pipe-Tabelle oder
// ein perspective-table-Fence vorliegt, und die table.*-Kommandos delegieren
// an das passende Backend. Das Pipe-Backend nutzt den reinen Kern aus
// src/shared/markdown/table-edit.js (4T-000589) und schreibt die Tabelle in
// einer Editor-Transaktion zurück (ein Undo-Schritt); das Perspective-
// Backend entsteht in 4T-000591.
//
// Modul-Zyklus editor.js <-> editor-table-tools.js: editor.js hält die
// dünnen Kommando-Wrapper als lokales Objekt und ruft runTableCommand nur
// zur Laufzeit; dieses Modul nutzt die editor.js-Exporte ebenfalls nur in
// Funktionskörpern (dokumentiertes Laufzeit-Zyklus-Muster, siehe
// editor-context-menu.js).
'use strict';

import { syntaxTree } from '@codemirror/language';
import {
  editPipeTable,
  parsePipeTable,
  locatePipeCell,
  pipeOpAvailability,
} from '../../../shared/markdown/table-edit.js';
// 4T-000591 (Epic 3E-000109): Perspective-Backend auf der Fence-Syntax.
import {
  editPerspectiveTable,
  scanPerspectiveTable,
  locatePerspectiveCell,
  perspectiveOpAvailability,
  hasSpanAttributes,
} from '../../../shared/markdown/perspective-table-edit.js';
import { parsePerspectiveTableHeaderAttrs } from '../../../shared/markdown/perspective-table-syntax.js';
// 4T-001002 (Epic 3E-000196): Tabellen- und Code-Block-Kontext liegen seit dem
// Schnitt in editor-keymaps.js (Laufzeit-Zyklus, Zugriffe nur in
// Funktionskoerpern).
import { isTableContextLine, lineInsideCodeBlock } from './editor-keymaps.js';
import { showStatusbarHint } from '../views/views.js';

// Statusbar-Hinweise für abgelehnte Operationen (geschützte Ziele bzw.
// Span-Ablehnung des Perspective-Backends).
const REJECT_HINT_KEYS = {
  header: 'tableTools.headerProtected',
  lastColumn: 'tableTools.lastColumn',
  spans: 'tableTools.spanRejected',
};

// 4T-000591: Perspective-Table-Fence am Cursor erkennen. Lezer liefert den
// FencedCode-Knoten samt CodeInfo (Sprach-Tag, Muster live-widgets.js);
// der Kontext umfasst die Body-Zeilen zwischen den Fence-Zeilen. Cursor
// auf den ```-Zeilen selbst sowie Fences ohne {|-Kopf liefern null.
function getPerspectiveContext(state, line, pos) {
  let node = syntaxTree(state).resolveInner(Math.min(line.from + 1, line.to), 1);
  let fence = null;
  while (node) {
    if (node.name === 'FencedCode') {
      fence = node;
      break;
    }
    node = node.parent;
  }
  if (!fence) return null;
  let lang = null;
  let child = fence.firstChild;
  while (child) {
    if (child.name === 'CodeInfo') {
      lang = state.doc.sliceString(child.from, child.to).trim();
      break;
    }
    child = child.nextSibling;
  }
  if (lang !== 'perspective-table') return null;
  const openLine = state.doc.lineAt(fence.from).number;
  const closeLineNo = state.doc.lineAt(fence.to).number;
  // Unvollständige Fences (ohne Schluss-Zeile) enden am Dokument-Ende —
  // dann gehört auch die letzte Zeile zum Body.
  const closeText = state.doc.line(closeLineNo).text.trimStart();
  const hasClose = closeLineNo > openLine && /^([`~]{3,})\s*$/.test(closeText);
  const firstLine = openLine + 1;
  const lastLine = hasClose ? closeLineNo - 1 : closeLineNo;
  if (line.number < firstLine || line.number > lastLine) return null;
  const blockLines = [];
  for (let n = firstLine; n <= lastLine; n++) blockLines.push(state.doc.line(n).text);
  if (!scanPerspectiveTable(blockLines)) return null;
  return {
    kind: 'perspective',
    firstLine,
    lastLine,
    blockLines,
    cursor: { line: line.number - firstLine, ch: pos - line.from },
  };
}

// Bestimmt den Tabellen-Kontext am Cursor: zuerst der
// perspective-table-Fence (4T-000591), sonst bei einer Pipe-Tabelle der
// zusammenhängende Zeilen-Bereich (auf- und abwärts über
// isTableContextLine, Code-Blöcke ausgenommen — dort greift die
// Pipe-Syntax nicht). Liefert null außerhalb von Tabellen sowie bei
// Mehrfach-Selektion (Tabellen-Operationen wären dort mehrdeutig).
export function getTableContext(view) {
  if (!view) return null;
  const state = view.state;
  if (state.selection.ranges.length !== 1) return null;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const perspective = getPerspectiveContext(state, line, pos);
  if (perspective) return perspective;
  if (lineInsideCodeBlock(state, line)) return null;
  if (!isTableContextLine(state, line)) return null;
  let first = line.number;
  while (first > 1) {
    const prev = state.doc.line(first - 1);
    if (lineInsideCodeBlock(state, prev) || !isTableContextLine(state, prev)) break;
    first--;
  }
  let last = line.number;
  while (last < state.doc.lines) {
    const next = state.doc.line(last + 1);
    if (lineInsideCodeBlock(state, next) || !isTableContextLine(state, next)) break;
    last++;
  }
  const blockLines = [];
  for (let n = first; n <= last; n++) blockLines.push(state.doc.line(n).text);
  return {
    kind: 'pipe',
    firstLine: first,
    lastLine: last,
    blockLines,
    cursor: { line: line.number - first, ch: pos - line.from },
  };
}

// Schneller Kontext-Test für die Paletten-Verfügbarkeit (Dimmung außerhalb
// von Tabellen).
export function hasTableContext(view) {
  return getTableContext(view) !== null;
}

// Menü-Zustand für den Sektions-Builder des Kontextmenüs: Verfügbarkeit
// der Operationen (Dimmung geschützter Ziele und der Ränder) plus die
// Ist-Ausrichtung der Cursor-Spalte (Häkchen der Ausrichtungs-Einträge).
// Beim Perspective-Backend mit Spans bleiben die Spalten-Operationen
// anklickbar — die Ausführung zeigt den erklärenden Span-Hinweis.
export function getTableMenuState(view) {
  if (!view || view.state.readOnly) return null;
  const ctx = getTableContext(view);
  if (!ctx) return null;
  if (ctx.kind === 'pipe') {
    const model = parsePipeTable(ctx.blockLines);
    if (!model) return null;
    const pos = locatePipeCell(ctx.blockLines, model, ctx.cursor.line, ctx.cursor.ch);
    return {
      kind: 'pipe',
      availability: pipeOpAvailability(model, pos),
      align: model.align[pos.col] || null,
    };
  }
  const scan = scanPerspectiveTable(ctx.blockLines);
  if (!scan) return null;
  const pos = locatePerspectiveCell(scan, ctx.cursor.line);
  const spans = hasSpanAttributes(ctx.blockLines, scan);
  const defaults = parsePerspectiveTableHeaderAttrs(
    ctx.blockLines[scan.headerLine].trimStart(),
  ).columnDefaults;
  return {
    kind: 'perspective',
    availability: perspectiveOpAvailability(scan, pos, spans),
    align: !spans && pos.area === 'row' ? defaults[pos.col] || null : null,
  };
}

// Führt eine Tabellen-Operation auf der View aus. Rückgabe false, wenn der
// Cursor nicht in einer Tabelle steht (ein belegtes Kürzel fällt dann an
// die normale Tastenverarbeitung durch); true, sobald der Kontext passt —
// auch bei Ablehnung (Statusbar-Hinweis) oder No-op am Rand. Der Block
// wird in einer Transaktion ersetzt (ein Undo-Schritt), der Cursor folgt
// der Ziel-Zelle.
export function runTableCommand(view, op) {
  if (!view || view.state.readOnly) return false;
  const ctx = getTableContext(view);
  if (!ctx) return false;
  const result =
    ctx.kind === 'pipe'
      ? editPipeTable(ctx.blockLines, ctx.cursor, op)
      : editPerspectiveTable(ctx.blockLines, ctx.cursor, op);
  if (!result) return true;
  if (result.rejected) {
    showStatusbarHint(REJECT_HINT_KEYS[result.rejected] || 'tableTools.headerProtected', {
      duration: 2500,
    });
    return true;
  }
  const from = view.state.doc.line(ctx.firstLine).from;
  const to = view.state.doc.line(ctx.lastLine).to;
  let anchor = from + result.cursor.ch;
  for (let i = 0; i < result.cursor.line; i++) anchor += result.lines[i].length + 1;
  view.dispatch({
    changes: { from, to, insert: result.lines.join('\n') },
    selection: { anchor },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}
