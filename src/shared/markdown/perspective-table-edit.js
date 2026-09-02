// 4T-000591 (Epic 3E-000109): Tabellen-Operationen für die Perspective Table
// auf der Fence-Syntax. Bewusst zeilenbasiert (kein Voll-Round-Trip über
// das Parser-Modell): Tabellen-Zeilen entsprechen |- Abschnitten, Zellen
// entsprechen Zell-Blöcken (Marker-Zeile ! bzw. | plus Fortsetzungszeilen).
// Verschieben, Einfügen und Löschen ordnen ganze Zeilen-Bereiche um —
// Roh-Text inklusive Attributen, Status-Klassen und mehrzeiliger
// Zell-Inhalte bleibt byte-genau erhalten.
//
// Span-Regel (Architekturentscheidung 3 des Epics): Zeilen-Operationen
// sind immer erlaubt; Spalten-Operationen, Spalten-Ausrichtung und
// Transponieren werden bei vorhandenen colspan/rowspan-Attributen mit
// { rejected: 'spans' } abgelehnt, weil der Spalten-Index dort mehrdeutig
// ist — der Aufrufer zeigt den erklärenden Statusbar-Hinweis.
//
// Rein und Electron-/DOM-frei (CJS, wie table-edit.js). Bewusst OHNE
// require auf perspective-table.js: dessen lazy markdown.js-Bezug würde
// esbuild statisch ins Renderer-Bundle ziehen (markdown.js ist
// Preload-only, Falle aus 4T-000546). Die geteilte Attribut- und
// Status-Grammatik kommt aus perspective-table-syntax.js.
'use strict';

const {
  parsePerspectiveTableCellAttrs,
  extractPerspectiveTableStatusClass,
  parsePerspectiveTableHeaderAttrs,
} = require('./perspective-table-syntax.js');

// === Zeilen-Scan ============================================================

// Klassifiziert die Fence-Body-Zeilen strukturgleich zum Parser
// (Präfix-Reihenfolge |} vor |- vor |+ vor ! vor |; in Zellen geöffnete
// Code-Fences schützen Marker-Zeichen im eingebetteten Code). Liefert
// null ohne {|-Kopfzeile (beschädigter Block). Ergebnis (alle Angaben
// inklusive Zeilen-Indizes im Body):
//   { headerLine, endLine (Index der |}-Zeile oder null),
//     rows: [ { markerLine, endLine, cells: [ { startLine, endLine } ] } ] }
function scanPerspectiveTable(lines) {
  if (!Array.isArray(lines)) return null;
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || !lines[i].trimStart().startsWith('{|')) return null;
  const headerLine = i;
  const rows = [];
  let endLine = null;
  let currentRow = null;
  let currentCell = null;
  let openFence = null;

  const closeCell = (lastLine) => {
    if (currentCell) {
      currentCell.endLine = lastLine;
      currentCell = null;
    }
  };
  const closeRow = (lastLine) => {
    closeCell(lastLine);
    if (currentRow) {
      currentRow.endLine = lastLine;
      currentRow = null;
    }
  };
  const maybeOpenFence = (text) => {
    const m = text.trimStart().match(/^([`~]{3,})/);
    if (m) openFence = m[1][0];
  };

  for (let n = headerLine + 1; n < lines.length; n++) {
    const line = lines[n];
    const trimmed = line.trimStart();
    if (openFence) {
      const m = trimmed.match(/^([`~]+)\s*$/);
      if (m && m[1][0] === openFence && m[1].length >= 3) openFence = null;
      continue;
    }
    if (trimmed.startsWith('|}')) {
      closeRow(n - 1);
      endLine = n;
      break;
    }
    if (trimmed.startsWith('|-')) {
      closeRow(n - 1);
      currentRow = { markerLine: n, endLine: n, cells: [] };
      rows.push(currentRow);
      continue;
    }
    if (trimmed.startsWith('|+')) continue;
    if (trimmed.startsWith('!') || trimmed.startsWith('|')) {
      closeCell(n - 1);
      if (currentRow) {
        currentCell = { startLine: n, endLine: n };
        currentRow.cells.push(currentCell);
      }
      // Fence-Erkennung parser-treu auf dem Zell-Inhalt nach Status-Klasse
      // und Attribut-Block (wie startCell im Bestands-Parser).
      const { rest } = extractPerspectiveTableStatusClass(trimmed.slice(1).trimStart());
      maybeOpenFence(parsePerspectiveTableCellAttrs(rest).content);
      continue;
    }
    if (currentCell) maybeOpenFence(line);
  }
  if (endLine === null) closeRow(lines.length - 1);
  return { headerLine, endLine, rows };
}

// === Span-Prüfung ===========================================================

// Attribut-Kopf einer Zell-Marker-Zeile parser-treu lesen: Marker (!/|)
// abschneiden, Status-Klasse überspringen, dann der Attribut-Block der
// Zell-Grammatik (Attribute stehen ausschließlich auf der Marker-Zeile).
function cellAttrsOfLine(lineText) {
  const trimmed = String(lineText || '').trimStart();
  if (!trimmed.startsWith('!') && !trimmed.startsWith('|')) return {};
  const afterMarker = trimmed.slice(1).trimStart();
  const { rest } = extractPerspectiveTableStatusClass(afterMarker);
  return parsePerspectiveTableCellAttrs(rest).attrs;
}

function hasSpanAttributes(lines, scan) {
  const s = scan || scanPerspectiveTable(lines);
  if (!s) return false;
  return s.rows.some((row) =>
    row.cells.some((cell) => {
      const attrs = cellAttrsOfLine(lines[cell.startLine]);
      return !!(attrs.colspan || attrs.rowspan);
    }),
  );
}

// === Cursor-Lokalisierung ===================================================

// Ordnet einen Zeilen-Index dem Kopf-Bereich ('head': {|-Zeile, Caption,
// Zeilen vor dem ersten Abschnitt) oder einem Abschnitt zu ('row', mit
// rowIndex und col = Zell-Block-Index; auf der |- Marker-Zeile col 0).
// Zeilen hinter dem letzten Abschnitt (|}-Zeile) zählen zum letzten
// Abschnitt, damit Operationen am Tabellen-Ende natürlich wirken.
function locatePerspectiveCell(scan, lineIndex) {
  if (scan.rows.length === 0 || lineIndex < scan.rows[0].markerLine) {
    return { area: 'head', rowIndex: 0, col: 0 };
  }
  for (let r = 0; r < scan.rows.length; r++) {
    const row = scan.rows[r];
    if (lineIndex >= row.markerLine && lineIndex <= row.endLine) {
      let col = 0;
      for (let c = 0; c < row.cells.length; c++) {
        if (lineIndex >= row.cells[c].startLine && lineIndex <= row.cells[c].endLine) {
          col = c;
          break;
        }
      }
      return { area: 'row', rowIndex: r, col };
    }
  }
  return { area: 'row', rowIndex: scan.rows.length - 1, col: 0 };
}

// === Verfügbarkeit ==========================================================

// Verfügbarkeits-Matrix für die Menü-Dimmung. Geometrische Grenzen (Ränder,
// letzte Spalte) dimmen nur ohne Spans — mit Spans bleiben die Spalten-
// Operationen anklickbar, damit die Ausführung den erklärenden
// Span-Hinweis zeigen kann (statt kommentarlos gedimmt zu sein).
function perspectiveOpAvailability(scan, pos, spans) {
  const inRow = pos.area === 'row' && scan.rows.length > 0;
  const colCount = inRow ? scan.rows[pos.rowIndex].cells.length : 0;
  const geo = (v) => (spans ? true : v);
  return {
    alignLeft: true,
    alignCenter: true,
    alignRight: true,
    rowUp: inRow && pos.rowIndex > 0,
    rowDown: inRow && pos.rowIndex < scan.rows.length - 1,
    rowInsert: true,
    rowDelete: inRow,
    colLeft: geo(inRow && pos.col > 0),
    colRight: geo(inRow && pos.col < colCount - 1),
    colInsert: geo(inRow),
    colDelete: geo(inRow && colCount > 1),
    transpose: true,
  };
}

// === Hilfen =================================================================

const SPAN_OPS = new Set([
  'alignLeft',
  'alignCenter',
  'alignRight',
  'colLeft',
  'colRight',
  'colInsert',
  'colDelete',
  'transpose',
]);

function rowRange(scan, r) {
  const row = scan.rows[r];
  return [row.markerLine, row.endLine];
}

// Zell-Blöcke eines Abschnitts als Zeilen-Arrays; markerSegment umfasst die
// |- Zeile plus etwaige Zeilen vor dem ersten Zell-Block (z.B. Leerzeilen).
function rowSegments(lines, row) {
  const firstCellLine = row.cells.length > 0 ? row.cells[0].startLine : row.endLine + 1;
  return {
    markerSegment: lines.slice(row.markerLine, firstCellLine),
    cellBlocks: row.cells.map((c) => lines.slice(c.startLine, c.endLine + 1)),
  };
}

// Baut den Body neu auf: Kopf-Segment, pro Abschnitt Marker-Segment plus
// (transformierte) Zell-Blöcke, Schluss-Segment ab hinter dem letzten
// Abschnitt (inkl. |}). transform(cellBlocks, rowIndex) liefert die neue
// Block-Liste des Abschnitts.
function rebuildWithCells(lines, scan, transform) {
  const first = scan.rows[0].markerLine;
  const last = scan.rows[scan.rows.length - 1].endLine;
  const out = lines.slice(0, first);
  scan.rows.forEach((row, r) => {
    const { markerSegment, cellBlocks } = rowSegments(lines, row);
    out.push(...markerSegment);
    for (const block of transform(cellBlocks, r)) out.push(...block);
  });
  out.push(...lines.slice(last + 1));
  return out;
}

// Schreibt das cols-Attribut der {|-Kopfzeile: bestehende Werte bleiben,
// die Ziel-Spalte wird gesetzt; Spalten ohne Vorgabe erhalten den
// Platzhalter '-' (der Parser liest ihn als „kein Default"), Platzhalter
// am Ende entfallen.
function writeColsAttribute(headerText, colDefaults) {
  const vals = colDefaults.map((v) => v || '-');
  while (vals.length > 0 && vals[vals.length - 1] === '-') vals.pop();
  const attr = `cols="${vals.join(' ')}"`;
  if (/\bcols="[^"]*"/.test(headerText)) {
    if (vals.length === 0) {
      return headerText
        .replace(/\s*\+?cols="[^"]*"/, '')
        .replace(/^\{\|\s*$/, '{|')
        .trimEnd();
    }
    return headerText.replace(/\bcols="[^"]*"/, attr);
  }
  if (vals.length === 0) return headerText;
  if (headerText.trim() === '{|') return headerText.replace('{|', `{|+${attr}`);
  return `${headerText} ${attr}`;
}

// === High-Level-Einstieg ====================================================

// Führt eine Operation auf dem Fence-Body aus. bodyLines sind die Zeilen
// innerhalb des Fence, cursor { line, ch } relativ zum Body. Rückgabe:
//   { lines, cursor: { line, ch } } bei Erfolg,
//   { rejected: 'spans' } bei Span-Ablehnung, null als No-op.
// Cursor-Semantik: Verschieben führt den Cursor mit seiner Zeile mit;
// Einfügen setzt ihn in die erste neue Zelle; Löschen auf den nächsten
// verbleibenden Abschnitt; Spalten-Operationen auf die erste Zeile des
// bewegten bzw. neuen Zell-Blocks; Transponieren auf die {|-Zeile.
function editPerspectiveTable(bodyLines, cursor, op) {
  const scan = scanPerspectiveTable(bodyLines);
  if (!scan) return null;
  const pos = locatePerspectiveCell(scan, cursor.line);
  if (SPAN_OPS.has(op) && hasSpanAttributes(bodyLines, scan)) return { rejected: 'spans' };
  const lines = bodyLines.slice();
  const clampCh = (text, ch) => Math.max(0, Math.min(ch, String(text || '').length));
  const inRow = pos.area === 'row' && scan.rows.length > 0;

  switch (op) {
    case 'alignLeft':
    case 'alignCenter':
    case 'alignRight': {
      if (!inRow && scan.rows.length === 0) return null;
      const value = op === 'alignLeft' ? 'left' : op === 'alignCenter' ? 'center' : 'right';
      const existing = parsePerspectiveTableHeaderAttrs(
        bodyLines[scan.headerLine].trimStart(),
      ).columnDefaults;
      const colCount = Math.max(
        pos.col + 1,
        existing.length,
        ...scan.rows.map((r) => r.cells.length),
      );
      const defaults = [];
      for (let c = 0; c < colCount; c++) defaults.push(existing[c] || null);
      defaults[pos.col] = value;
      lines[scan.headerLine] = writeColsAttribute(lines[scan.headerLine], defaults);
      return { lines, cursor: { line: cursor.line, ch: cursor.ch } };
    }
    case 'rowUp': {
      if (!inRow || pos.rowIndex === 0) return null;
      const [aStart, aEnd] = rowRange(scan, pos.rowIndex - 1);
      const [bStart, bEnd] = rowRange(scan, pos.rowIndex);
      const next = [
        ...lines.slice(0, aStart),
        ...lines.slice(bStart, bEnd + 1),
        ...lines.slice(aStart, aEnd + 1),
        ...lines.slice(bEnd + 1),
      ];
      return { lines: next, cursor: { line: cursor.line - (aEnd - aStart + 1), ch: cursor.ch } };
    }
    case 'rowDown': {
      if (!inRow || pos.rowIndex >= scan.rows.length - 1) return null;
      const [aStart, aEnd] = rowRange(scan, pos.rowIndex);
      const [bStart, bEnd] = rowRange(scan, pos.rowIndex + 1);
      const next = [
        ...lines.slice(0, aStart),
        ...lines.slice(bStart, bEnd + 1),
        ...lines.slice(aStart, aEnd + 1),
        ...lines.slice(bEnd + 1),
      ];
      return { lines: next, cursor: { line: cursor.line + (bEnd - bStart + 1), ch: cursor.ch } };
    }
    case 'rowInsert': {
      const colCount = inRow
        ? Math.max(1, scan.rows[pos.rowIndex].cells.length)
        : scan.rows.length > 0
          ? Math.max(1, scan.rows[0].cells.length)
          : 1;
      const insertAt = inRow
        ? scan.rows[pos.rowIndex].endLine + 1
        : scan.rows.length > 0
          ? scan.rows[0].markerLine
          : scan.endLine !== null
            ? scan.endLine
            : lines.length;
      const fresh = ['|-'];
      for (let c = 0; c < colCount; c++) fresh.push('| ');
      lines.splice(insertAt, 0, ...fresh);
      return { lines, cursor: { line: insertAt + 1, ch: 2 } };
    }
    case 'rowDelete': {
      if (!inRow) return null;
      const [start, end] = rowRange(scan, pos.rowIndex);
      lines.splice(start, end - start + 1);
      const target = Math.min(start, lines.length - 1);
      return { lines, cursor: { line: Math.max(0, target), ch: 0 } };
    }
    case 'colLeft':
    case 'colRight': {
      if (!inRow) return null;
      const from = op === 'colLeft' ? pos.col : pos.col + 1;
      const colCount = scan.rows[pos.rowIndex].cells.length;
      if (op === 'colLeft' && pos.col === 0) return null;
      if (op === 'colRight' && pos.col >= colCount - 1) return null;
      const next = rebuildWithCells(lines, scan, (blocks) => {
        if (blocks.length <= from) return blocks;
        const copy = blocks.slice();
        const t = copy[from - 1];
        copy[from - 1] = copy[from];
        copy[from] = t;
        return copy;
      });
      const rescanned = scanPerspectiveTable(next);
      const targetCol = op === 'colLeft' ? pos.col - 1 : pos.col + 1;
      const cell = rescanned.rows[pos.rowIndex].cells[targetCol];
      return {
        lines: next,
        cursor: { line: cell.startLine, ch: clampCh(next[cell.startLine], cursor.ch) },
      };
    }
    case 'colInsert': {
      if (!inRow) return null;
      const next = rebuildWithCells(lines, scan, (blocks) => {
        const copy = blocks.slice();
        copy.splice(Math.min(pos.col + 1, copy.length), 0, ['| ']);
        return copy;
      });
      const rescanned = scanPerspectiveTable(next);
      const cell = rescanned.rows[pos.rowIndex].cells[pos.col + 1];
      return { lines: next, cursor: { line: cell.startLine, ch: 2 } };
    }
    case 'colDelete': {
      if (!inRow) return null;
      const colCount = scan.rows[pos.rowIndex].cells.length;
      if (colCount <= 1) return null;
      const next = rebuildWithCells(lines, scan, (blocks) => {
        if (blocks.length <= pos.col) return blocks;
        const copy = blocks.slice();
        copy.splice(pos.col, 1);
        return copy;
      });
      const rescanned = scanPerspectiveTable(next);
      const row = rescanned.rows[pos.rowIndex];
      const cell = row.cells[Math.min(pos.col, row.cells.length - 1)] || null;
      return {
        lines: next,
        cursor: {
          line: cell ? cell.startLine : row.markerLine,
          ch: 0,
        },
      };
    }
    case 'transpose': {
      if (scan.rows.length === 0) return null;
      // Block-Matrix spiegeln: Zell-Blöcke wandern samt Marker und
      // Attributen; fehlende Zellen werden als leere |-Zellen ergänzt.
      // Die |- Marker-Zeilen entstehen neutral neu (ein Zeilen-Status ist
      // nach dem Spiegeln nicht übertragbar).
      const maxCols = Math.max(...scan.rows.map((r) => r.cells.length), 1);
      const blocks = scan.rows.map((row) => rowSegments(lines, row).cellBlocks);
      const head = lines.slice(0, scan.rows[0].markerLine);
      const tail = lines.slice(scan.rows[scan.rows.length - 1].endLine + 1);
      const out = [...head];
      for (let c = 0; c < maxCols; c++) {
        out.push('|-');
        for (let r = 0; r < scan.rows.length; r++) {
          const block = blocks[r][c];
          if (block) out.push(...block);
          else out.push('| ');
        }
      }
      out.push(...tail);
      // Eine gesetzte Spalten-Ausrichtung verliert beim Spiegeln ihren
      // Bezug — cols-Attribut zurücksetzen (wie beim Pipe-Backend).
      const rescopedHeader = writeColsAttribute(out[scan.headerLine], []);
      out[scan.headerLine] = rescopedHeader;
      return { lines: out, cursor: { line: scan.headerLine, ch: 0 } };
    }
    default:
      return null;
  }
}

module.exports = {
  scanPerspectiveTable,
  hasSpanAttributes,
  locatePerspectiveCell,
  perspectiveOpAvailability,
  writeColsAttribute,
  editPerspectiveTable,
};
