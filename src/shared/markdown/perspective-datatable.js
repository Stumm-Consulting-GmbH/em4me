// 4T-0417 (Epic 3E-0079): Perspective Datatable — Format, Parser und
// Serialisierer der typisierten Datentabelle (Fence `perspective-datatable`).
// Prozess-neutral (kein Electron, kein DOM), Muster perspective-table.js.
//
// 4T-0986 (Epic 3E-0196): Kern der Modul-Familie. Neben Format, Parser,
// Serialisierer und Aggregat-Rechnung hält er die zwei Render-Einstiege
// und reicht die Arbeit an die Schwester-Module weiter:
//   perspective-datatable-computed.js  berechnete Spalten (Validierung,
//                                      Auswertung) samt geteilter Grund-
//                                      Helfer; Blatt der Familie
//   perspective-datatable-view.js      Anzeige-Formatierung, Sortierung,
//                                      Filter, Fence-Suche
//   perspective-datatable-html.js      Grid-HTML und Portable-Tabelle
// Der Import-Graph läuft ausschließlich von hier nach unten (Kern -> html
// -> view -> computed); kein Schwester-Modul lädt den Kern.
//
// Format des Fence-Bodys:
//   columns: Name:text, Datum:date, Start:time, Betrag:number(2),
//            Erledigt:boolean, Gesamt:number = Betrag * 2
//   aggregate: Betrag:sum+avg, Erledigt:count
//   | Anna | 2026-07-08 | 09:30 | 12.50 | x |
//
// Kanonische Speicherformate (PO-Entscheidung D, Epic 3E-0079):
//   number  Punkt-Dezimal (optionales Anzeige-Format `number(n)` = Dezimalstellen)
//   date    JJJJ-MM-TT
//   time    HH:MM
//   boolean x / leer
//   text    frei; `|` im Text als `\|` escaped
//
// Datenmodell (Rückgabe von parsePerspectiveDatatable):
//   {
//     columns:    [{ name, type, decimals|null, expr|null }]   expr = Rohtext
//                 der berechneten Spalte (Auswertung in 4T-0421)
//     aggregates: [[func, …], …]   parallel zu columns (leer = keine Aggregate)
//     rows:       [[cell, …], …]   cell = { text, value, error|null }; text ist
//                 der un-escapte Zell-Rohtext (bleibt bei Fehler-Zellen erhalten,
//                 kein Datenverlust), value der typ-geparste Wert (null = leer
//                 bzw. nicht auswertbar), error ein Fehler-Code für die
//                 lokalisierte Anzeige (datatable.cellError.<code>)
//     errors:     [{ code, line, detail }]   Struktur-Fehler; line 1-basiert im
//                 Fence-Body, detail der beanstandete Rohtext
//   }
//
// Fehler-Semantik: Struktur-Fehler (unbekannter Typ, Spalten-Anzahl-Abweichung,
// …) landen in errors und machen die Tabelle für den Grid-Editor unbearbeitbar
// (4T-0419 blockiert das Rückschreiben, solange errors nicht leer ist — sonst
// könnte der kanonische Serialisierer strukturell defekte Zeilen verändern).
// Zell-Wert-Fehler sind dagegen weich: die Zelle trägt den Fehler-Code, der
// Rohtext bleibt erhalten und wird unverändert re-serialisiert.
'use strict';

const {
  isValidIsoDate,
  normalizeFloat,
  dataIndexByColumn,
  validateComputedColumns,
  computeComputedCells,
  makeCellValueResolver,
} = require('./perspective-datatable-computed.js');
const {
  buildErrorsHtml,
  buildDatatableTableHtml,
  buildPortableDatatableHtml,
} = require('./perspective-datatable-html.js');

const COLUMN_TYPES = new Set(['text', 'number', 'date', 'time', 'boolean']);
const AGGREGATE_FUNCS = new Set(['sum', 'avg', 'min', 'max', 'count']);
// Anzeige-Format v1: nur Dezimalstellen bei number, begrenzt auf 0..10.
const MAX_DECIMALS = 10;

// --- Werte-Parsing pro Typ ----------------------------------------------------

// Zell-Rohtext (un-escaped, getrimmt) -> { value, error }. Leere Zellen sind
// bei allen Typen gültig: text -> '', boolean -> false, sonst null.
function parseCellValue(type, text) {
  if (type === 'text') return { value: text, error: null };
  if (text === '') {
    return type === 'boolean' ? { value: false, error: null } : { value: null, error: null };
  }
  if (type === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { value: null, error: 'invalidNumber' };
    return { value: parseFloat(text), error: null };
  }
  if (type === 'date') {
    if (!isValidIsoDate(text)) return { value: null, error: 'invalidDate' };
    return { value: text, error: null };
  }
  if (type === 'time') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return { value: null, error: 'invalidTime' };
    return { value: text, error: null };
  }
  // boolean: kanonisch 'x'/leer; 'X' wird tolerant gelesen und beim
  // Serialisieren auf 'x' normalisiert.
  if (text === 'x' || text === 'X') return { value: true, error: null };
  return { value: null, error: 'invalidBoolean' };
}

// --- Zeilen-Zerlegung ----------------------------------------------------------

// Kommata auf oberster Ebene trennen Listen-Einträge; Klammern und Quotes
// schützen (berechnete Spalten-Ausdrücke wie `min(Betrag, 10)` bleiben ganz).
function splitTopLevel(text) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

// Pipe-Zeile -> un-escapte, getrimmte Zell-Rohtexte. Führende und (falls
// vorhanden) schließende Pipe werden abgestreift; `\|` ist das Pipe-Escape
// im Zelltext.
function splitPipeRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  // Segment vor der führenden Pipe ist leer (Zeile beginnt mit '|');
  // schließende Pipe erzeugt ein leeres End-Segment — beide sind Rahmen,
  // keine Zellen. Fehlt die schließende Pipe, zählt das letzte Segment
  // als Zelle (tolerantes Lesen).
  cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

function escapePipes(text) {
  return String(text == null ? '' : text).replace(/\|/g, '\\|');
}

// --- Kopf-Direktiven ------------------------------------------------------------

// Spalten-Definition `Name:typ`, `Name:typ(dez)`, `Name:typ = ausdruck`.
// Der Ausdruck wird nur als Rohtext erfasst (Auswertung in 4T-0421).
function parseColumnDef(defText, line, errors) {
  const colonIdx = defText.indexOf(':');
  if (colonIdx <= 0) {
    errors.push({ code: 'badColumnDef', line, detail: defText });
    return null;
  }
  const name = defText.slice(0, colonIdx).trim();
  let rest = defText.slice(colonIdx + 1).trim();
  let expr = null;
  const eqIdx = rest.indexOf('=');
  if (eqIdx >= 0) {
    expr = rest.slice(eqIdx + 1).trim();
    rest = rest.slice(0, eqIdx).trim();
    if (expr === '') {
      errors.push({ code: 'badColumnDef', line, detail: defText });
      return null;
    }
  }
  const m = /^([A-Za-z]+)(?:\s*\((\d{1,2})\))?$/.exec(rest);
  if (!m) {
    errors.push({ code: 'badColumnDef', line, detail: defText });
    return null;
  }
  const type = m[1].toLowerCase();
  if (!COLUMN_TYPES.has(type)) {
    errors.push({ code: 'unknownType', line, detail: m[1] });
    return null;
  }
  let decimals = null;
  if (m[2] != null) {
    if (type !== 'number') {
      errors.push({ code: 'badFormat', line, detail: defText });
      return null;
    }
    decimals = parseInt(m[2], 10);
    if (decimals > MAX_DECIMALS) {
      errors.push({ code: 'badFormat', line, detail: defText });
      return null;
    }
  }
  return { name, type, decimals, expr };
}

// Typ-Gerechtigkeit der Aggregate: sum/avg nur auf number; min/max auf
// number/date/time (chronologisch bzw. numerisch geordnete Typen); count
// zählt nicht-leere Zellen jedes Typs (boolean: nur `x`-Zellen sind
// nicht-leer, count zählt also die wahren).
function aggregateAllowed(func, type) {
  if (func === 'count') return true;
  if (func === 'sum' || func === 'avg') return type === 'number';
  return type === 'number' || type === 'date' || type === 'time';
}

// Aggregat-Eintrag `Name:func+func`; Spalten-Zuordnung case-insensitiv,
// Mehrfach-Einträge derselben Spalte werden zusammengeführt (Duplikate
// dedupliziert).
function parseAggregateEntry(entryText, columns, aggregates, line, errors) {
  const colonIdx = entryText.indexOf(':');
  if (colonIdx <= 0) {
    errors.push({ code: 'badAggregate', line, detail: entryText });
    return;
  }
  const name = entryText.slice(0, colonIdx).trim().toLowerCase();
  const colIdx = columns.findIndex((c) => c.name.toLowerCase() === name);
  if (colIdx < 0) {
    errors.push({ code: 'unknownAggregateColumn', line, detail: entryText.slice(0, colonIdx) });
    return;
  }
  const funcs = entryText
    .slice(colonIdx + 1)
    .split('+')
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f !== '');
  if (funcs.length === 0) {
    errors.push({ code: 'badAggregate', line, detail: entryText });
    return;
  }
  for (const func of funcs) {
    if (!AGGREGATE_FUNCS.has(func)) {
      errors.push({ code: 'unknownAggregate', line, detail: func });
      continue;
    }
    if (!aggregateAllowed(func, columns[colIdx].type)) {
      errors.push({
        code: 'aggregateTypeMismatch',
        line,
        detail: `${columns[colIdx].name}:${func}`,
      });
      continue;
    }
    if (!aggregates[colIdx].includes(func)) aggregates[colIdx].push(func);
  }
}

// --- Parser ---------------------------------------------------------------------

// Fence-Body -> Datenmodell (Struktur siehe Kopf-Kommentar). Wirft nie;
// alle Probleme landen strukturiert in errors bzw. als Fehler-Zellen.
function parsePerspectiveDatatable(content) {
  const lines = String(content || '').split(/\r?\n/);
  const errors = [];
  let columns = null;
  let columnsLine = 0;
  let aggregates = [];
  const pendingAggregateLines = [];
  const rows = [];
  let inRows = false;
  let dataColumns = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;

    if (!inRows && !trimmed.startsWith('|')) {
      // Kopf-Direktive `name: wert`
      const m = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/.exec(trimmed);
      const directive = m ? m[1].toLowerCase() : null;
      if (directive === 'columns') {
        if (columns !== null) {
          errors.push({ code: 'duplicateDirective', line: lineNo, detail: 'columns' });
          continue;
        }
        columnsLine = lineNo;
        columns = [];
        for (const defText of splitTopLevel(m[2])) {
          const col = parseColumnDef(defText, lineNo, errors);
          if (!col) continue;
          if (columns.some((c) => c.name.toLowerCase() === col.name.toLowerCase())) {
            errors.push({ code: 'duplicateColumn', line: lineNo, detail: col.name });
            continue;
          }
          columns.push(col);
        }
        aggregates = columns.map(() => []);
        continue;
      }
      if (directive === 'aggregate') {
        // Aggregate erst nach der columns-Zeile auflösbar; Reihenfolge im
        // Body ist aber frei — Einträge werden gesammelt und am Ende geparst.
        pendingAggregateLines.push({ text: m[2], line: lineNo });
        continue;
      }
      errors.push({ code: 'invalidLine', line: lineNo, detail: trimmed });
      continue;
    }

    // Datenzeilen
    if (!inRows) {
      inRows = true;
      dataColumns = (columns || []).filter((c) => c.expr === null);
    }
    if (!trimmed.startsWith('|')) {
      errors.push({ code: 'invalidLine', line: lineNo, detail: trimmed });
      continue;
    }
    const cellTexts = splitPipeRow(trimmed);
    if (cellTexts.length !== dataColumns.length) {
      errors.push({
        code: 'rowCellCount',
        line: lineNo,
        detail: `${cellTexts.length}/${dataColumns.length}`,
      });
    }
    const row = cellTexts.map((text, j) => {
      // Zellen jenseits der deklarierten Daten-Spalten bleiben als Text-
      // Zellen im Modell erhalten (kein Datenverlust; rowCellCount ist
      // bereits gemeldet und blockiert den Grid-Editor).
      const type = j < dataColumns.length ? dataColumns[j].type : 'text';
      const { value, error } = parseCellValue(type, text);
      return { text, value, error };
    });
    // Zu kurze Zeilen auf Daten-Spalten-Breite auffüllen, damit Rendering
    // und Aggregate eine rechteckige Struktur sehen.
    while (row.length < dataColumns.length) {
      const type = dataColumns[row.length].type;
      const { value, error } = parseCellValue(type, '');
      row.push({ text: '', value, error });
    }
    rows.push(row);
  }

  if (columns === null) {
    errors.unshift({ code: 'noColumns', line: 1, detail: '' });
    columns = [];
    aggregates = [];
  } else if (columns.length === 0) {
    errors.push({ code: 'noColumns', line: columnsLine, detail: '' });
  }
  // 4T-0421: Spalten-Formeln validieren (Syntax, Funktions-Katalog,
  // Verweis-Regel) — Verstöße sind Struktur-Fehler.
  validateComputedColumns(columns, columnsLine || 1, errors);
  for (const pending of pendingAggregateLines) {
    for (const entryText of splitTopLevel(pending.text)) {
      parseAggregateEntry(entryText, columns, aggregates, pending.line, errors);
    }
  }

  return { columns, aggregates, rows, errors };
}

// --- Serialisierer ---------------------------------------------------------------

function serializeColumnDef(col) {
  const fmt = col.decimals != null ? `(${col.decimals})` : '';
  const expr = col.expr != null ? ` = ${col.expr}` : '';
  return `${col.name}:${col.type}${fmt}${expr}`;
}

// Zelle -> kanonischer Zelltext. Fehler-Zellen behalten ihren Rohtext
// (kein Datenverlust); gültige Werte werden kanonisch geschrieben.
function serializeCell(cell, type) {
  if (!cell) return '';
  if (cell.error) return escapePipes(cell.text);
  if (type === 'text') return escapePipes(cell.value == null ? '' : cell.value);
  if (cell.value == null) return '';
  if (type === 'boolean') return cell.value ? 'x' : '';
  return String(cell.value);
}

// Datenmodell -> kanonischer Fence-Body (stabile Spalten-Ausrichtung über
// Leerzeichen-Padding; parse -> serialize -> parse ist bei fehlerfreier
// Struktur modell-identisch). Grundlage des Grid-Editor-Rückschreibens.
function serializePerspectiveDatatable(model) {
  const columns = model.columns || [];
  const aggregates = model.aggregates || [];
  const rows = model.rows || [];
  const lines = [];
  lines.push('columns: ' + columns.map(serializeColumnDef).join(', '));
  const aggParts = [];
  columns.forEach((col, i) => {
    const funcs = aggregates[i] || [];
    if (funcs.length > 0) aggParts.push(`${col.name}:${funcs.join('+')}`);
  });
  if (aggParts.length > 0) lines.push('aggregate: ' + aggParts.join(', '));

  const dataColumns = columns.filter((c) => c.expr === null);
  // Zelltexte vorab serialisieren, dann spaltenweise auf die Maximal-
  // Breite auffüllen (stabile Ausrichtung; Zellen jenseits der Daten-
  // Spalten werden als Text mitgeschrieben — Verlustfreiheit vor Form).
  const rowTexts = rows.map((row) =>
    row.map((cell, j) =>
      serializeCell(cell, j < dataColumns.length ? dataColumns[j].type : 'text'),
    ),
  );
  const colCount = rowTexts.reduce((max, r) => Math.max(max, r.length), dataColumns.length);
  const widths = [];
  for (let j = 0; j < colCount; j++) {
    let w = 1;
    for (const r of rowTexts) {
      if (r[j] != null && r[j].length > w) w = r[j].length;
    }
    widths.push(w);
  }
  for (const r of rowTexts) {
    const padded = [];
    for (let j = 0; j < r.length; j++) padded.push(r[j].padEnd(widths[j]));
    lines.push(`| ${padded.join(' | ')} |`);
  }
  return lines.join('\n');
}

// --- Aggregat-Rechnung (4T-0418) --------------------------------------------------

// Leer-Definition pro Typ (count zählt nicht-leere Zellen): text '' und
// boolean false sind die kanonischen Leer-Werte, sonst null.
function isEmptyValue(type, value) {
  if (value == null) return true;
  if (type === 'text') return value === '';
  if (type === 'boolean') return value === false;
  return false;
}

// Aggregate über die (ggf. gefilterten) Zeilen. rows default = alle Zeilen
// des Modells; getValue erlaubt 4T-0421, berechnete Spalten-Werte zu
// liefern (Default: berechnete Spalten -> null, Fehler-Zellen -> null).
// Rückgabe parallel zu columns: je Spalte [{ func, value }] in der
// deklarierten Reihenfolge; value null, wenn keine gültige Zelle einfließt.
function computeAggregates(model, rows, getValue) {
  const columns = model.columns || [];
  const aggregates = model.aggregates || [];
  const dataIdx = dataIndexByColumn(columns);
  const rowList = rows || model.rows || [];
  const valueOf =
    getValue ||
    ((row, colIdx) => {
      const di = dataIdx[colIdx];
      if (di == null) return null;
      const cell = row[di];
      if (!cell || cell.error) return null;
      return cell.value;
    });
  return columns.map((col, colIdx) => {
    const funcs = aggregates[colIdx] || [];
    if (funcs.length === 0) return [];
    const values = [];
    let nonEmpty = 0;
    for (const row of rowList) {
      const v = valueOf(row, colIdx);
      if (!isEmptyValue(col.type, v)) nonEmpty++;
      if (v != null && !(col.type === 'text' && v === '')) values.push(v);
    }
    return funcs.map((func) => {
      if (func === 'count') return { func, value: nonEmpty };
      if (col.type === 'number') {
        const nums = values.filter((v) => typeof v === 'number');
        if (nums.length === 0) return { func, value: null };
        if (func === 'min') return { func, value: Math.min(...nums) };
        if (func === 'max') return { func, value: Math.max(...nums) };
        const sum = normalizeFloat(nums.reduce((a, b) => a + b, 0));
        if (func === 'sum') return { func, value: sum };
        // avg rundet auf das Spalten-Format (Dezimalstellen), sonst
        // Float-normalisiert.
        const avg = sum / nums.length;
        return {
          func,
          value: col.decimals != null ? parseFloat(avg.toFixed(col.decimals)) : normalizeFloat(avg),
        };
      }
      // min/max auf date/time: ISO- bzw. HH:MM-Strings sind lexikographisch
      // chronologisch geordnet.
      const strs = values.filter((v) => typeof v === 'string' && v !== '');
      if (strs.length === 0) return { func, value: null };
      if (func === 'min') return { func, value: strs.reduce((a, b) => (b < a ? b : a)) };
      if (func === 'max') return { func, value: strs.reduce((a, b) => (b > a ? b : a)) };
      return { func, value: null };
    });
  });
}

// --- Render-Einstiege (4T-0418) -----------------------------------------------------

// Berechnete Zellen und Aggregate einmal pro Render auswerten; die
// HTML-Bauer bekommen beides gereicht (Arbeitsteilung 4T-0986).
function computeRenderData(model) {
  const computed = computeComputedCells(model);
  const aggs = computeAggregates(model, model.rows, makeCellValueResolver(model, computed));
  return { computed, aggs };
}

// Innen-HTML des Platzhalter-Containers (der Container selbst mit den
// data-dt-Attributen entsteht im Fence-Override von markdown.js).
function renderPerspectiveDatatableViewer(content) {
  const model = parsePerspectiveDatatable(content);
  const out = [];
  if (model.errors.length > 0) out.push(buildErrorsHtml(model.errors));
  if (model.columns.length > 0) {
    const { computed, aggs } = computeRenderData(model);
    out.push(buildDatatableTableHtml(model, computed, aggs));
  }
  return out.join('');
}

// Statische Tabelle für den Portable-Export. Bei Struktur-Fehlern null —
// der Fence bleibt dann unverändert im Export (Muster perspective-table).
function convertPerspectiveDatatableBlockToHtml(content) {
  const model = parsePerspectiveDatatable(content);
  if (model.errors.length > 0 || model.columns.length === 0) return null;
  const { computed, aggs } = computeRenderData(model);
  return buildPortableDatatableHtml(model, computed, aggs);
}

module.exports = {
  parsePerspectiveDatatable,
  serializePerspectiveDatatable,
  parseCellValue,
  computeAggregates,
  renderPerspectiveDatatableViewer,
  convertPerspectiveDatatableBlockToHtml,
  COLUMN_TYPES,
  AGGREGATE_FUNCS,
};
