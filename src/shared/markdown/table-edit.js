// 4T-0589 (Epic 3E-0109): Tabellen-Bearbeitungs-Kern für klassische
// Pipe-Tabellen. Enthält die aus editor.js hierher verschobenen reinen
// Text-Helfer (findUnescapedPipes, isTableLine, parseTableCells,
// buildEmptyTableRow, findCellAt; editor.js re-exportiert sie für die
// Bestands-Konsumenten) sowie den Voll-Parser mit Ausrichtungs-Zeile,
// die Tabellen-Operationen und den formatierten Serialisierer für das
// Tabellen-Kontextmenü.
//
// Rein und Electron-/DOM-frei (CJS, wie src/shared/markdown-format.js),
// damit Renderer (import via Bundler) und Unit-Tests dasselbe Modul nutzen.
//
// Modell einer Pipe-Tabelle:
//   { header: string[], align: ('left'|'center'|'right'|null)[],
//     rows: string[][], columnCount: number, hasSeparator: boolean }
// Zell-Texte sind die getrimmten Roh-Inhalte zwischen den Pipes; escapte
// Pipes (\|) bleiben darin unverändert erhalten. Der Serialisierer schreibt
// immer die Rand-Pipe-Form mit Leerzeichen-ausgerichteten Spalten — randlose
// Tabellen werden dadurch bewusst normalisiert (dokumentierte Entscheidung
// des Epics 3E-0109); eine fehlende Trenn-Zeile wird ergänzt.
'use strict';

function findUnescapedPipes(text) {
  const positions = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '|') continue;
    // Prüfen, ob das Pipe escaped ist (ungerade Anzahl Backslashes davor).
    let backslashes = 0;
    let j = i - 1;
    while (j >= 0 && text[j] === '\\') {
      backslashes++;
      j--;
    }
    if (backslashes % 2 === 0) positions.push(i);
  }
  return positions;
}

function isTableLine(text) {
  const pipes = findUnescapedPipes(text);
  if (pipes.length < 2) return false;
  const trimmed = text.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

function parseTableCells(text) {
  const pipes = findUnescapedPipes(text);
  if (pipes.length === 0) return null;
  // R2-19 (4T-0186): virtuelle Randzellen — beginnt die Zeile nicht mit
  // einer Pipe bzw. endet sie nicht mit einer, zählen Zeilenanfang/-ende
  // als Zellgrenzen (randlose GFM-Form). Bei klassischen Rand-Pipe-Zeilen
  // bleiben die Grenzen unverändert (identisches Verhalten wie zuvor).
  const boundaries = pipes.slice();
  if (text.slice(0, pipes[0]).trim() !== '') boundaries.unshift(-1);
  if (text.slice(pipes[pipes.length - 1] + 1).trim() !== '') boundaries.push(text.length);
  if (boundaries.length < 2) return null;
  const cells = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i] + 1;
    const end = boundaries[i + 1];
    let contentStart = start;
    while (contentStart < end && /\s/.test(text[contentStart])) contentStart++;
    let contentEnd = end;
    while (contentEnd > start && /\s/.test(text[contentEnd - 1])) contentEnd--;
    cells.push({ start, end, contentStart, contentEnd });
  }
  return cells;
}

function buildEmptyTableRow(columnCount) {
  // Format wie bei klassischen Pipe-Tabellen: "| | | |" (mit Whitespace
  // zwischen Pipes, damit der Zellsprung beim ersten Treffer in eine
  // leere Zelle direkt im Padding landet).
  return '|' + ' |'.repeat(columnCount);
}

function findCellAt(cells, col) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (col >= c.start && col <= c.end) return i;
  }
  return -1;
}

// === Voll-Parser mit Ausrichtungs-Zeile =====================================

// Trenn-Zellen-Muster: optionale Doppelpunkte um mindestens einen Strich.
const SEPARATOR_CELL_RE = /^:?-+:?$/;

function cellTexts(lineText) {
  const cells = parseTableCells(lineText);
  if (!cells) return [];
  return cells.map((c) => lineText.slice(c.contentStart, c.contentEnd));
}

function isSeparatorLine(text) {
  const texts = cellTexts(text);
  if (texts.length === 0) return false;
  return texts.every((t) => SEPARATOR_CELL_RE.test(t));
}

function alignFromSeparatorCell(text) {
  const left = text.startsWith(':');
  const right = text.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function separatorCellFor(align, width) {
  const w = Math.max(3, width);
  if (align === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
  if (align === 'right') return '-'.repeat(w - 1) + ':';
  if (align === 'left') return ':' + '-'.repeat(w - 1);
  return '-'.repeat(w);
}

function padTo(arr, length, fill) {
  while (arr.length < length) arr.push(fill);
  return arr;
}

// Liest den kompletten Tabellen-Block (Array der Roh-Zeilen) in das Modell.
// Zeile 0 ist die Kopfzeile; Zeile 1 wird als Ausrichtungs-Zeile gelesen,
// wenn sie dem Trenn-Muster entspricht (fehlt sie — Tabelle im Aufbau —,
// gelten alle Ausrichtungen als null und der Serialisierer ergänzt sie).
// Unterschiedliche Zellen-Anzahlen werden auf die maximale Spaltenzahl mit
// leeren Zellen aufgefüllt. Liefert null, wenn keine Tabelle erkennbar ist.
function parsePipeTable(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const header = cellTexts(lines[0]);
  if (header.length === 0) return null;
  let align = [];
  let hasSeparator = false;
  let bodyStart = 1;
  if (lines.length > 1 && isSeparatorLine(lines[1])) {
    hasSeparator = true;
    align = cellTexts(lines[1]).map(alignFromSeparatorCell);
    bodyStart = 2;
  }
  const rows = [];
  for (let i = bodyStart; i < lines.length; i++) {
    rows.push(cellTexts(lines[i]));
  }
  let columnCount = Math.max(header.length, align.length);
  for (const r of rows) columnCount = Math.max(columnCount, r.length);
  padTo(header, columnCount, '');
  padTo(align, columnCount, null);
  rows.forEach((r) => padTo(r, columnCount, ''));
  return { header, align, rows, columnCount, hasSeparator };
}

// Schreibt das Modell als formatierte Rand-Pipe-Tabelle zurück: Spalten mit
// Leerzeichen auf die längste Zelle aufgefüllt (linksbündiges Text-Padding,
// die Leserichtung der Quelle; die Ausrichtung wirkt im Rendering), Trenn-
// Zeile in voller Spaltenbreite mit Doppelpunkt-Markern.
function serializePipeTable(model) {
  const { header, align, rows, columnCount } = model;
  const widths = [];
  for (let c = 0; c < columnCount; c++) {
    let w = Math.max(3, String(header[c] || '').length);
    for (const r of rows) w = Math.max(w, String(r[c] || '').length);
    widths.push(w);
  }
  const fmtRow = (cells) =>
    '| ' + widths.map((w, c) => String(cells[c] || '').padEnd(w)).join(' | ') + ' |';
  const sep = '| ' + widths.map((w, c) => separatorCellFor(align[c], w)).join(' | ') + ' |';
  return [fmtRow(header), sep, ...rows.map(fmtRow)];
}

// === Cursor-Lokalisierung ===================================================

// Ordnet eine Cursor-Position (Zeilen-Offset im Block, Spalten-Offset in der
// Zeile) einer logischen Zelle zu: rowKind 'header' | 'separator' | 'body'
// (rowIndex nur bei 'body' belegt), col als Spalten-Index.
function locatePipeCell(lines, model, lineOffset, ch) {
  const bodyStart = model.hasSeparator ? 2 : 1;
  let rowKind = 'body';
  let rowIndex = 0;
  if (lineOffset <= 0 || model.rows.length === 0) {
    rowKind = 'header';
  } else if (model.hasSeparator && lineOffset === 1) {
    rowKind = 'separator';
  } else {
    rowIndex = Math.max(0, Math.min(lineOffset - bodyStart, model.rows.length - 1));
  }
  const lineText = lines[Math.max(0, Math.min(lineOffset, lines.length - 1))] || '';
  const cells = parseTableCells(lineText);
  let col = 0;
  if (cells && cells.length > 0) {
    const idx = findCellAt(cells, ch);
    if (idx >= 0) col = idx;
    else col = ch <= cells[0].start ? 0 : cells.length - 1;
  }
  col = Math.max(0, Math.min(col, model.columnCount - 1));
  return { rowKind, rowIndex, col };
}

// === Operationen ============================================================

// Verfügbarkeit der Operationen für eine Cursor-Position (Menü-Dimmung):
// Kopf- und Trenn-Zeile sind gegen Verschieben und Löschen geschützt,
// Ränder deaktivieren die jeweilige Richtung, die letzte Spalte ist gegen
// Löschen geschützt.
function pipeOpAvailability(model, pos) {
  const isBody = pos.rowKind === 'body' && model.rows.length > 0;
  return {
    alignLeft: true,
    alignCenter: true,
    alignRight: true,
    rowUp: isBody && pos.rowIndex > 0,
    rowDown: isBody && pos.rowIndex < model.rows.length - 1,
    rowInsert: true,
    rowDelete: isBody,
    colLeft: pos.col > 0,
    colRight: pos.col < model.columnCount - 1,
    colInsert: true,
    colDelete: model.columnCount > 1,
    transpose: true,
  };
}

function cloneModel(model) {
  return {
    header: model.header.slice(),
    align: model.align.slice(),
    rows: model.rows.map((r) => r.slice()),
    columnCount: model.columnCount,
    hasSeparator: model.hasSeparator,
  };
}

function swapColumns(m, a, b) {
  const swap = (arr) => {
    const t = arr[a];
    arr[a] = arr[b];
    arr[b] = t;
  };
  swap(m.header);
  swap(m.align);
  m.rows.forEach(swap);
}

// Wendet eine Operation auf das Modell an (rein, das Eingabe-Modell bleibt
// unverändert). Rückgabe:
//   { model, cursor: { rowKind, rowIndex, col } } bei Erfolg,
//   { rejected: 'header' | 'lastColumn' } bei geschützten Zielen,
//   null als No-op (Rand erreicht) — der Aufrufer lässt das Dokument
//   dann unangetastet.
// Cursor-Semantik (Sonderfall-Entscheidungen des Epics 3E-0109):
//   Verschieben führt den Cursor mit Zeile/Spalte mit; Einfügen setzt ihn in
//   die erste Zelle der neuen Zeile bzw. in die neue Spalte; Löschen klemmt
//   ihn auf den nächsten verbleibenden Index; Transponieren setzt ihn in die
//   erste Kopf-Zelle und setzt alle Ausrichtungen zurück (Spalten- wird
//   Zeilen-Identität, eine Ausrichtungs-Übertragung wäre willkürlich).
function applyPipeOp(model, op, pos) {
  const m = cloneModel(model);
  const isBody = pos.rowKind === 'body' && m.rows.length > 0;
  const cursor = { rowKind: pos.rowKind, rowIndex: pos.rowIndex, col: pos.col };

  switch (op) {
    case 'alignLeft':
    case 'alignCenter':
    case 'alignRight': {
      const value = op === 'alignLeft' ? 'left' : op === 'alignCenter' ? 'center' : 'right';
      m.align[pos.col] = value;
      return { model: m, cursor };
    }
    case 'rowUp': {
      if (!isBody) return { rejected: 'header' };
      if (pos.rowIndex === 0) return null;
      const t = m.rows[pos.rowIndex - 1];
      m.rows[pos.rowIndex - 1] = m.rows[pos.rowIndex];
      m.rows[pos.rowIndex] = t;
      cursor.rowIndex = pos.rowIndex - 1;
      return { model: m, cursor };
    }
    case 'rowDown': {
      if (!isBody) return { rejected: 'header' };
      if (pos.rowIndex >= m.rows.length - 1) return null;
      const t = m.rows[pos.rowIndex + 1];
      m.rows[pos.rowIndex + 1] = m.rows[pos.rowIndex];
      m.rows[pos.rowIndex] = t;
      cursor.rowIndex = pos.rowIndex + 1;
      return { model: m, cursor };
    }
    case 'rowInsert': {
      // Neue Leerzeile nach der Cursor-Zeile; aus Kopf-/Trenn-Zeile heraus
      // als erste Datenzeile.
      const at = isBody ? pos.rowIndex + 1 : 0;
      m.rows.splice(at, 0, padTo([], m.columnCount, ''));
      return { model: m, cursor: { rowKind: 'body', rowIndex: at, col: 0 } };
    }
    case 'rowDelete': {
      if (!isBody) return { rejected: 'header' };
      m.rows.splice(pos.rowIndex, 1);
      if (m.rows.length === 0) {
        return { model: m, cursor: { rowKind: 'header', rowIndex: 0, col: pos.col } };
      }
      cursor.rowIndex = Math.min(pos.rowIndex, m.rows.length - 1);
      return { model: m, cursor };
    }
    case 'colLeft': {
      if (pos.col === 0) return null;
      swapColumns(m, pos.col - 1, pos.col);
      cursor.col = pos.col - 1;
      return { model: m, cursor };
    }
    case 'colRight': {
      if (pos.col >= m.columnCount - 1) return null;
      swapColumns(m, pos.col, pos.col + 1);
      cursor.col = pos.col + 1;
      return { model: m, cursor };
    }
    case 'colInsert': {
      const at = pos.col + 1;
      m.header.splice(at, 0, '');
      m.align.splice(at, 0, null);
      m.rows.forEach((r) => r.splice(at, 0, ''));
      m.columnCount += 1;
      cursor.col = at;
      return { model: m, cursor };
    }
    case 'colDelete': {
      if (m.columnCount <= 1) return { rejected: 'lastColumn' };
      m.header.splice(pos.col, 1);
      m.align.splice(pos.col, 1);
      m.rows.forEach((r) => r.splice(pos.col, 1));
      m.columnCount -= 1;
      cursor.col = Math.min(pos.col, m.columnCount - 1);
      return { model: m, cursor };
    }
    case 'transpose': {
      // Gesamt-Matrix (Kopf als Zeile 0) spiegeln: die Kopfzeile wird erste
      // Spalte, die erste Spalte wird Kopfzeile.
      const matrix = [m.header, ...m.rows];
      const transposed = [];
      for (let c = 0; c < m.columnCount; c++) {
        transposed.push(matrix.map((r) => r[c] || ''));
      }
      m.header = transposed[0];
      m.rows = transposed.slice(1);
      m.columnCount = matrix.length;
      m.align = padTo([], m.columnCount, null);
      m.hasSeparator = true;
      return { model: m, cursor: { rowKind: 'header', rowIndex: 0, col: 0 } };
    }
    default:
      return null;
  }
}

// === High-Level-Einstieg ====================================================

// Führt eine Operation auf dem Tabellen-Block aus. blockLines sind die
// Roh-Zeilen der Tabelle, cursor { line, ch } ist die Cursor-Position
// relativ zum Block (line = Zeilen-Offset). Rückgabe:
//   { lines, cursor: { line, ch } } bei Erfolg (lines = neue Block-Zeilen),
//   { rejected: '…' } bei geschützten Zielen, null als No-op.
function editPipeTable(blockLines, cursor, op) {
  const model = parsePipeTable(blockLines);
  if (!model) return null;
  const pos = locatePipeCell(blockLines, model, cursor.line, cursor.ch);
  const result = applyPipeOp(model, op, pos);
  if (!result) return null;
  if (result.rejected) return result;
  const lines = serializePipeTable(result.model);
  const c = result.cursor;
  const lineOffset = c.rowKind === 'header' ? 0 : c.rowKind === 'separator' ? 1 : 2 + c.rowIndex;
  const lineText = lines[Math.min(lineOffset, lines.length - 1)] || '';
  const cells = parseTableCells(lineText) || [];
  const cell = cells[Math.max(0, Math.min(c.col, cells.length - 1))] || null;
  // Cursor an den Inhalts-Anfang der Ziel-Zelle (Formel des Bestands-
  // Zellsprungs aus 4T-0074; bei leerer Zelle das Zell-Ende im Padding).
  const ch = cell ? Math.max(cell.contentStart, cell.start) : 0;
  return { lines, cursor: { line: lineOffset, ch } };
}

module.exports = {
  findUnescapedPipes,
  isTableLine,
  parseTableCells,
  buildEmptyTableRow,
  findCellAt,
  isSeparatorLine,
  parsePipeTable,
  serializePipeTable,
  locatePipeCell,
  pipeOpAvailability,
  applyPipeOp,
  editPipeTable,
};
