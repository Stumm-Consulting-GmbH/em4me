// 4T-0179 (Epic 3E-0039): aus src/main/preload.js extrahiert.
// Perspective Table: Parser, Viewer-Renderer und Portable-HTML-Renderer.
// Electron-frei. md/mdPortable werden LAZY aus markdown.js geholt
// (CJS-Zyklus: markdown.js laedt dieses Modul zuerst).
'use strict';

function getMd() {
  return require('./markdown.js').md;
}
function getMdPortable() {
  return require('./markdown.js').mdPortable;
}
function convertMarkdownPortable(text, addMarker) {
  // Lazy: rekursiver Rueckbezug fuer verschachtelte Tabellen-Zellen.
  return require('./markdown.js').convertMarkdownPortable(text, addMarker);
}

// 4T-0591 (Epic 3E-0109): Die reinen Syntax-Helfer (Zell-Attribute,
// Status-Klassen, Header-Attribute) leben im abhängigkeitsfreien Modul
// perspective-table-syntax.js, damit das Bearbeitungs-Modul
// perspective-table-edit.js sie ohne den markdown.js-Bezug dieses Moduls
// nutzen kann. Verhalten unverändert.
const {
  parsePerspectiveTableCellAttrs,
  extractPerspectiveTableStatusClass,
  parsePerspectiveTableHeaderAttrs,
} = require('./perspective-table-syntax.js');

// Inline-Style-Farben fuer den Portable-Export. Light-Theme-Farben mit
// ausreichendem Kontrast (WCAG-AA), funktioniert in jedem externen
// Markdown-Renderer ohne unsere App-CSS.
const PERSPECTIVE_STATUS_INLINE_COLORS = {
  error: { bg: '#ffebee', fg: '#b71c1c' },
  warn: { bg: '#fff8e1', fg: '#8a6d00' },
  ok: { bg: '#e8f5e9', fg: '#1b5e20' },
  info: { bg: '#e3f2fd', fg: '#0d47a1' },
  neutral: { bg: '#f5f5f5', fg: '#424242' },
};

// 4T-0037: Baut den HTML-Attribut-String fuer eine Zelle aus dem
// gefilterten attrs-Object plus scope-Setzung fuer Header-Zellen.
// 4T-0044: Optional eine Status-Klasse, die als CSS-Klasse status-<value>
// an die Zelle gehaengt wird.
// 4T-0045: Optional ein Spalten-Default-align (vom Tabellen-Header
// `+cols="..."`), das greift, wenn die Zelle keinen eigenen align hat.
function buildPerspectiveTableCellAttrs(attrs, cellType, isHeaderRow, statusClass, columnDefault) {
  const parts = [];
  if (attrs.colspan) parts.push(`colspan="${attrs.colspan}"`);
  if (attrs.rowspan) parts.push(`rowspan="${attrs.rowspan}"`);
  const classes = [];
  if (statusClass) classes.push(`status-${statusClass}`);
  if (attrs.align) {
    classes.push(`align-${attrs.align}`);
  } else if (columnDefault) {
    classes.push(`align-${columnDefault}`);
  }
  if (attrs.valign) classes.push(`valign-${attrs.valign}`);
  if (classes.length > 0) parts.push(`class="${classes.join(' ')}"`);
  if (cellType === 'th') {
    parts.push(isHeaderRow ? 'scope="col"' : 'scope="row"');
  }
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

// 4T-0040 (Epic 3E-0008, Stufe 3): Rekursionstiefen-Schutz fuer verschachtelte
// perspective-tables. Counter wird beim Eintritt in renderPerspectiveTable inkrementiert und
// beim Verlassen dekrementiert (try/finally). Beim Erreichen des Limits gibt
// die Funktion null zurueck und der Override im fence-Renderer faellt auf
// den Default (Code-Block) zurueck. Damit ist die innerste Tabelle in einer
// Quelltext-Eingabe mit > MAX_DEPTH Ebenen als Code-Block sichtbar, alle
// aeusseren Tabellen rendern weiterhin korrekt.
let perspectiveTableRecursionDepth = 0;
const PERSPECTIVE_TABLE_MAX_DEPTH = 3;

// 4T-0041 (Epic 3E-0008): Parser-Logik aus renderPerspectiveTable ausgelagert, damit
// Viewer-Renderer und HTML-Konverter dieselbe Parser-Logik teilen. Liefert
// { caption, rows } oder null bei beschaedigtem Block (kein '{|'-Anfang).
// Tiefen-Schutz bleibt in den jeweiligen Aufrufern (renderPerspectiveTable,
// convertMarkdownPortable), weil sie unabhaengige Counter benoetigen.
function parsePerspectiveTableBlock(content) {
  const lines = String(content || '').split(/\r?\n/);
  let i = 0;
  // Erste signifikante Zeile muss '{|' sein
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || !lines[i].trimStart().startsWith('{|')) {
    return null;
  }
  // 4T-0045: Tabellen-Header-Attribute auf der {| - Zeile parsen (z.B. +cols).
  const headerAttrs = parsePerspectiveTableHeaderAttrs(lines[i].trimStart());
  i++;

  let caption = null;
  const rows = [];
  let currentRow = null;
  let currentCell = null;
  // 4T-0040: fenceInProgress haelt die oeffnende Fence-Sequenz; siehe Detail-
  // Kommentar in 4T-0040-Implementierung.
  let fenceInProgress = null;

  const commitCell = () => {
    if (currentCell) {
      currentRow.cells.push(currentCell);
      currentCell = null;
    }
  };
  const commitRow = () => {
    commitCell();
    if (currentRow && currentRow.cells.length > 0) {
      rows.push(currentRow);
    }
    currentRow = null;
  };
  // 4T-0044: startRow nimmt eine optionale Status-Klasse fuer die ganze Zeile.
  const startRow = (statusClass) => {
    commitRow();
    currentRow = { cells: [], statusClass: statusClass || null };
  };
  // 4T-0044: startCell nimmt zusaetzlich einen statusClass-Parameter fuer
  // die einzelne Zelle (gewinnt gegen den Zeilen-Status).
  const startCell = (type, initial, attrs, statusClass) => {
    commitCell();
    if (!currentRow) currentRow = { cells: [], statusClass: null };
    currentCell = {
      type,
      content: initial || '',
      attrs: attrs || {},
      statusClass: statusClass || null,
    };
  };

  const maybeOpenFence = (text) => {
    if (fenceInProgress) return;
    const lastLine = String(text || '')
      .split('\n')
      .pop();
    const m = lastLine.trimStart().match(/^([`~]{3,})/);
    if (m) fenceInProgress = m[1];
  };
  const maybeCloseFence = (line) => {
    if (!fenceInProgress) return;
    const m = line.trimStart().match(/^([`~]+)\s*$/);
    if (m && m[1][0] === fenceInProgress[0] && m[1].length >= fenceInProgress.length) {
      fenceInProgress = null;
    }
  };

  for (; i < lines.length; i++) {
    const line = lines[i];

    if (fenceInProgress) {
      if (currentCell) {
        currentCell.content += (currentCell.content ? '\n' : '') + line;
      }
      maybeCloseFence(line);
      continue;
    }

    const trimmed = line.trimStart();
    if (trimmed.startsWith('|}')) {
      commitRow();
      break;
    }
    if (trimmed.startsWith('|-')) {
      // 4T-0044: Optional Status-Klasse direkt nach '|-' (z.B. '|-.error').
      const afterMarker = trimmed.slice(2).trimStart();
      const { status } = extractPerspectiveTableStatusClass(afterMarker);
      startRow(status);
      continue;
    }
    if (trimmed.startsWith('|+')) {
      caption = trimmed.slice(2).trim();
      continue;
    }
    if (trimmed.startsWith('!')) {
      // 4T-0044: Optional Status-Klasse direkt nach '!' (z.B. '!.warn').
      const afterMarker = trimmed.slice(1).trimStart();
      const { status, rest } = extractPerspectiveTableStatusClass(afterMarker);
      const { attrs, content: cellContent } = parsePerspectiveTableCellAttrs(rest);
      startCell('th', cellContent, attrs, status);
      maybeOpenFence(cellContent);
      continue;
    }
    if (trimmed.startsWith('|')) {
      // 4T-0044: Optional Status-Klasse direkt nach '|' (z.B. '|.error').
      const afterMarker = trimmed.slice(1).trimStart();
      const { status, rest } = extractPerspectiveTableStatusClass(afterMarker);
      const { attrs, content: cellContent } = parsePerspectiveTableCellAttrs(rest);
      startCell('td', cellContent, attrs, status);
      maybeOpenFence(cellContent);
      continue;
    }
    if (currentCell) {
      currentCell.content += (currentCell.content ? '\n' : '') + line;
      maybeOpenFence(line);
    }
  }
  commitRow();

  return {
    caption,
    rows,
    columnDefaults: headerAttrs.columnDefaults,
    sortable: headerAttrs.sortable,
  };
}

function renderPerspectiveTable(content) {
  if (perspectiveTableRecursionDepth >= PERSPECTIVE_TABLE_MAX_DEPTH) {
    return null;
  }
  perspectiveTableRecursionDepth++;
  try {
    const parsed = parsePerspectiveTableBlock(content);
    if (!parsed) return null;
    return buildPerspectiveTableHtml(
      parsed.caption,
      parsed.rows,
      parsed.columnDefaults,
      parsed.sortable,
    );
  } finally {
    perspectiveTableRecursionDepth--;
  }
}

function buildPerspectiveTableHtml(caption, rows, columnDefaults, sortable) {
  // thead, wenn die erste Zeile ausschliesslich Header-Zellen enthaelt.
  let theadRow = null;
  let bodyRows = rows;
  if (rows.length > 0 && rows[0].cells.every((c) => c.type === 'th')) {
    theadRow = rows[0];
    bodyRows = rows.slice(1);
  }
  // 4T-0046: Sortierung deaktivieren, wenn irgendeine Zelle colspan oder
  // rowspan hat. Layout-Risiko zu hoch, daher sicherer Default.
  let hasSpans = false;
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.attrs && (cell.attrs.colspan || cell.attrs.rowspan)) {
        hasSpans = true;
        break;
      }
    }
    if (hasSpans) break;
  }
  const tableClass =
    sortable && !hasSpans && theadRow ? 'perspective-table sortable' : 'perspective-table';
  const out = [`<table class="${tableClass}">`];
  if (caption !== null && caption !== '') {
    out.push(`<caption>${getMd().renderInline(caption)}</caption>`);
  }
  if (theadRow) {
    out.push('<thead>');
    // 4T-0037: isHeaderRow=true -> th bekommt scope="col".
    out.push(renderPerspectiveTableRow(theadRow, true, columnDefaults));
    out.push('</thead>');
  }
  if (bodyRows.length > 0) {
    out.push('<tbody>');
    for (const row of bodyRows) {
      // 4T-0037: isHeaderRow=false -> th bekommt scope="row".
      out.push(renderPerspectiveTableRow(row, false, columnDefaults));
    }
    out.push('</tbody>');
  }
  out.push('</table>');
  return out.join('');
}

function renderPerspectiveTableRow(row, isHeaderRow, columnDefaults) {
  const out = ['<tr>'];
  let colIdx = 0;
  for (const cell of row.cells) {
    const tag = cell.type === 'th' ? 'th' : 'td';
    // 4T-0044: Zell-Status gewinnt gegen Zeilen-Status. Beide werden als
    // CSS-Klasse status-<value> via buildPerspectiveTableCellAttrs gesetzt.
    const effectiveStatus = cell.statusClass || row.statusClass || null;
    // 4T-0045: Spalten-Default-Ausrichtung greift, wenn die Zelle keinen
    // eigenen align hat. Bei colspan > 1 wird kein Default angewendet
    // (Zelle ueberspannt mehrere Spalten mit ggf. unterschiedlichen
    // Defaults; eindeutige Wahl nicht moeglich).
    const span = parseInt((cell.attrs && cell.attrs.colspan) || '1', 10) || 1;
    const colDefault = span > 1 ? null : (columnDefaults && columnDefaults[colIdx]) || null;
    const attrsHtml = buildPerspectiveTableCellAttrs(
      cell.attrs || {},
      cell.type,
      isHeaderRow,
      effectiveStatus,
      colDefault,
    );
    colIdx += span;
    const trimmed = cell.content.trim();
    if (trimmed === '') {
      out.push(`<${tag}${attrsHtml}></${tag}>`);
    } else if (!/\n/.test(trimmed)) {
      // Einzeiliger Inhalt: Inline-Render ohne <p>-Wrapper.
      out.push(`<${tag}${attrsHtml}>${getMd().renderInline(trimmed)}</${tag}>`);
    } else {
      // Mehrzeiliger Inhalt: Block-Render fuer Listen, Codebloecke, Absaetze.
      out.push(`<${tag}${attrsHtml}>${getMd().render(trimmed)}</${tag}>`);
    }
  }
  out.push('</tr>');
  return out.join('');
}

// 4T-0041 (Epic 3E-0008): Konverter perspective-table → inline HTML-Tabelle fuer
// Export-Datei. Findet im Markdown-Text alle perspective-table-Codeblocks und ersetzt
// sie durch HTML-Tabellen mit Inline-Styles. Innere perspective-table-Bloecke in
// Zellinhalten werden rekursiv mitkonvertiert (eigener Tiefen-Counter
// perspectiveTablePortableDepth, identische PERSPECTIVE_TABLE_MAX_DEPTH wie Viewer-Renderer).
// Beschaedigte perspective-table-Bloecke (kein '{|') bleiben unveraendert (semantisch

// Rekursions-Guard fuer den Portable-Konverter (Zellinhalt mit innerer
// perspective-table); beschaedigte Bloecke (kein '{|') bleiben unveraendert.
let perspectiveTablePortableDepth = 0;

function convertPerspectiveTableBlockToHtml(content) {
  if (perspectiveTablePortableDepth >= PERSPECTIVE_TABLE_MAX_DEPTH) {
    return null;
  }
  perspectiveTablePortableDepth++;
  try {
    const parsed = parsePerspectiveTableBlock(content);
    if (!parsed) return null;
    return buildPerspectiveTablePortableHtml(parsed.caption, parsed.rows, parsed.columnDefaults);
  } finally {
    perspectiveTablePortableDepth--;
  }
}

function buildPerspectiveTablePortableHtml(caption, rows, columnDefaults) {
  let theadRow = null;
  let bodyRows = rows;
  if (rows.length > 0 && rows[0].cells.every((c) => c.type === 'th')) {
    theadRow = rows[0];
    bodyRows = rows.slice(1);
  }
  const out = ['<table>'];
  if (caption !== null && caption !== '') {
    out.push(`<caption>${getMdPortable().renderInline(caption)}</caption>`);
  }
  if (theadRow) {
    out.push('<thead>');
    out.push(renderPerspectiveTablePortableRow(theadRow, true, columnDefaults));
    out.push('</thead>');
  }
  if (bodyRows.length > 0) {
    out.push('<tbody>');
    for (const row of bodyRows) {
      out.push(renderPerspectiveTablePortableRow(row, false, columnDefaults));
    }
    out.push('</tbody>');
  }
  out.push('</table>');
  return out.join('');
}

function renderPerspectiveTablePortableRow(row, isHeaderRow, columnDefaults) {
  const out = ['<tr>'];
  let colIdx = 0;
  for (const cell of row.cells) {
    const tag = cell.type === 'th' ? 'th' : 'td';
    // 4T-0044: Zell-Status gewinnt gegen Zeilen-Status; im Portable als
    // Inline-Style mit Light-Theme-Farben (PERSPECTIVE_STATUS_INLINE_COLORS).
    const effectiveStatus = cell.statusClass || row.statusClass || null;
    // 4T-0045: Spalten-Default-Ausrichtung greift, wenn die Zelle keinen
    // eigenen align hat und kein colspan ueber mehrere Spalten reicht.
    const span = parseInt((cell.attrs && cell.attrs.colspan) || '1', 10) || 1;
    const colDefault = span > 1 ? null : (columnDefaults && columnDefaults[colIdx]) || null;
    const attrsHtml = buildPerspectiveTablePortableCellAttrs(
      cell.attrs || {},
      cell.type,
      isHeaderRow,
      effectiveStatus,
      colDefault,
    );
    colIdx += span;
    const cellHtml = renderPerspectiveTableCellForPortable(cell.content);
    out.push(`<${tag}${attrsHtml}>${cellHtml}</${tag}>`);
  }
  out.push('</tr>');
  return out.join('');
}

function buildPerspectiveTablePortableCellAttrs(
  attrs,
  cellType,
  isHeaderRow,
  statusClass,
  columnDefault,
) {
  const parts = [];
  if (attrs.colspan) parts.push(`colspan="${attrs.colspan}"`);
  if (attrs.rowspan) parts.push(`rowspan="${attrs.rowspan}"`);
  // 4T-0041: Ausrichtung als Inline-Style (HTML5-konform), nicht als CSS-
  // Klasse. Damit funktioniert die Ausrichtung auch in fremden Renderern,
  // die unsere App-CSS nicht kennen.
  // 4T-0045: Wenn die Zelle keine eigene align hat, greift der Spalten-
  // Default; bei colspan > 1 wurde colDefault im Renderer auf null gesetzt.
  const styles = [];
  const effectiveAlign = attrs.align || columnDefault || null;
  if (effectiveAlign) styles.push(`text-align: ${effectiveAlign}`);
  if (attrs.valign) styles.push(`vertical-align: ${attrs.valign}`);
  // 4T-0044: Status-Hintergrund/Vordergrund als Inline-Style aus der
  // Farb-Map. Externe Renderer kennen unsere status-*-CSS-Klassen nicht.
  if (statusClass && PERSPECTIVE_STATUS_INLINE_COLORS[statusClass]) {
    const c = PERSPECTIVE_STATUS_INLINE_COLORS[statusClass];
    styles.push(`background-color: ${c.bg}`);
    styles.push(`color: ${c.fg}`);
  }
  if (styles.length > 0) parts.push(`style="${styles.join('; ')}"`);
  if (cellType === 'th') {
    parts.push(isHeaderRow ? 'scope="col"' : 'scope="row"');
  }
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

function renderPerspectiveTableCellForPortable(content) {
  const trimmed = String(content || '').trim();
  if (trimmed === '') return '';
  // 4T-0041: Zweistufige Konvertierung.
  // 1. Innere perspective-table-Codeblocks rekursiv durch HTML-Tabellen ersetzen.
  //    addMarker=false: der Marker steht nur einmal am Datei-Anfang, nicht
  //    in jeder Zelle.
  const withInnerHtml = convertMarkdownPortable(trimmed, false);
  // 2. Den Rest (Markdown + eingebettete HTML-Strings) durch mdPortable
  //    rendern. mdPortable hat html=true, daher werden die eingebetteten
  //    HTML-Tags nicht escaped. Einzeiliger Inhalt ohne Block-Strukturen
  //    kommt durch renderInline (kein <p>-Wrapper), sonst durch render.
  if (!/\n/.test(withInnerHtml.trim())) {
    return getMdPortable().renderInline(withInnerHtml);
  }
  return getMdPortable().render(withInnerHtml);
}

module.exports = {
  renderPerspectiveTable,
  convertPerspectiveTableBlockToHtml,
  parsePerspectiveTableBlock,
};
