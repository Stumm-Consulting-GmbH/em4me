// 4T-0417 (Epic 3E-0079): Perspective Datatable — Format, Parser und
// Serialisierer der typisierten Datentabelle (Fence `perspective-datatable`).
// Prozess-neutral (kein Electron, kein DOM), Muster perspective-table.js.
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

const COLUMN_TYPES = new Set(['text', 'number', 'date', 'time', 'boolean']);
const AGGREGATE_FUNCS = new Set(['sum', 'avg', 'min', 'max', 'count']);
// Anzeige-Format v1: nur Dezimalstellen bei number, begrenzt auf 0..10.
const MAX_DECIMALS = 10;

// --- Werte-Parsing pro Typ ----------------------------------------------------

// Echte Kalender-Prüfung über den Date-Roundtrip (2026-02-30 fällt durch).
function isValidIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

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

// --- Berechnete Spalten: Ausdrucks-Validierung (4T-0421) ----------------------------

// Ausdrucks-Parser und -Evaluator der Perspective-Query-Sprache (3E-0076):
// Spalten-Formeln nutzen denselben Funktions-Katalog und dasselbe
// Typ-System wie die Abfrage (Epic-Entscheidung C2).
const { parseExpression } = require('../perspective-query.js');
const { evaluateExpression, validateQuery, formatValue } = require('../perspective-query-eval.js');

// Feld-Verweise eines Ausdrucks-AST einsammeln (lowercase).
function collectFieldRefs(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'field') {
    out.push(String(node.name).toLowerCase());
    return;
  }
  for (const key of ['left', 'right', 'operand']) {
    if (node[key]) collectFieldRefs(node[key], out);
  }
  if (Array.isArray(node.args)) for (const a of node.args) collectFieldRefs(a, out);
  if (Array.isArray(node.values)) for (const v of node.values) collectFieldRefs(v, out);
}

// Validiert die Spalten-Formeln nach dem Spalten-Aufbau: Syntax und
// Funktions-Katalog (badExpr), Verweise nur auf existierende Spalten
// (computedBadRef) sowie Kreis-Freiheit der Formel-Bezüge (computedCycle).
// Formeln dürfen auf Daten-Spalten UND andere berechnete Spalten in
// beliebiger Deklarations-Reihenfolge verweisen (PO-Anmerkung aus der
// Test-Iteration vom 2026-07-09); die Auswertung löst die Reihenfolge
// über die Abhängigkeiten auf. Gültige, kreis-freie Ausdrücke erhalten
// ihren AST als col.exprAst (nur in-memory; der Serialisierer nutzt
// col.expr).
function validateComputedColumns(columns, line, errors) {
  const known = new Set(columns.map((c) => c.name.toLowerCase()));
  const computedNames = new Set(
    columns.filter((c) => c.expr !== null).map((c) => c.name.toLowerCase()),
  );
  // Formel-Bezüge auf berechnete Spalten je gültiger Formel (Name -> Set).
  const computedRefs = new Map();
  const astByName = new Map();
  for (const col of columns) {
    if (col.expr === null) continue;
    const parsed = parseExpression(col.expr);
    const fnError = parsed.ok ? validateQuery(parsed.ast) : null;
    if (!parsed.ok || fnError) {
      errors.push({ code: 'badExpr', line, detail: col.name });
      continue;
    }
    const refs = [];
    collectFieldRefs(parsed.ast, refs);
    const bad = refs.find((r) => !known.has(r));
    if (bad !== undefined) {
      errors.push({ code: 'computedBadRef', line, detail: `${col.name}: ${bad}` });
      continue;
    }
    const name = col.name.toLowerCase();
    astByName.set(name, { col, ast: parsed.ast });
    computedRefs.set(name, new Set(refs.filter((r) => computedNames.has(r))));
  }
  // Fixpunkt-Auflösung: eine Formel ist auflösbar, wenn alle ihre Bezüge
  // auf berechnete Spalten bereits auflösbar sind (ungültige Formeln
  // zählen als auflösbar-mit-null, damit sie keinen falschen Kreis-Fehler
  // an ihren Konsumenten erzeugen). Was übrig bleibt, hängt in einem
  // Kreis-Bezug (Selbst-Bezug eingeschlossen).
  const resolved = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, deps] of computedRefs) {
      if (resolved.has(name)) continue;
      let ok = true;
      for (const dep of deps) {
        if (computedRefs.has(dep) && !resolved.has(dep)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        resolved.add(name);
        grew = true;
      }
    }
  }
  for (const [name, entry] of astByName) {
    if (resolved.has(name)) entry.col.exprAst = entry.ast;
    else errors.push({ code: 'computedCycle', line, detail: entry.col.name });
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

// Ober-Grenze der gerenderten Datenzeilen: darüber zeigt das Grid nur Kopf
// und Aggregate mit lokalisiertem Hinweis (bewusste dokumentierte Grenze
// statt virtuellem Scrolling; PO-Vorschlag 1000 aus 4T-0418). Aggregate
// rechnen weiterhin über ALLE Zeilen.
const MAX_RENDER_ROWS = 1000;

// Spalten-Index -> Daten-Zellen-Index (null für berechnete Spalten, deren
// Werte erst 4T-0421 liefert).
function dataIndexByColumn(columns) {
  const map = [];
  let next = 0;
  for (const col of columns) map.push(col.expr === null ? next++ : null);
  return map;
}

// Float-Rauschen normalisieren (0.1 + 0.2 -> 0.3), ohne echte Präzision zu
// verlieren; 12 signifikante Stellen reichen für den Anwendungsfall.
function normalizeFloat(n) {
  return Number.isFinite(n) ? parseFloat(n.toPrecision(12)) : n;
}

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

// --- Berechnete Spalten: Auswertung (4T-0421) ---------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Abfrage-Wert -> Zell-Wert gemäß deklariertem Spalten-Typ. null bleibt
// leer (weiche Fehler der Abfrage-Semantik); Typ-Abweichungen werden
// Fehler-Zellen (computedTypeMismatch).
function toComputedCell(col, v) {
  if (v == null) return { value: null, error: null };
  if (col.type === 'number') {
    if (typeof v === 'number' && Number.isFinite(v))
      return { value: normalizeFloat(v), error: null };
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      return { value: parseFloat(v), error: null };
    }
    return { value: null, error: 'computedTypeMismatch' };
  }
  if (col.type === 'boolean') {
    if (typeof v === 'boolean') return { value: v, error: null };
    return { value: null, error: 'computedTypeMismatch' };
  }
  if (col.type === 'date') {
    if (v && typeof v === 'object' && v.kind === 'date') {
      const d = new Date(v.ms);
      return {
        value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        error: null,
      };
    }
    if (typeof v === 'string' && isValidIsoDate(v.slice(0, 10))) {
      return { value: v.slice(0, 10), error: null };
    }
    return { value: null, error: 'computedTypeMismatch' };
  }
  if (col.type === 'time') {
    if (v && typeof v === 'object' && v.kind === 'date') {
      const d = new Date(v.ms);
      return { value: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, error: null };
    }
    if (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      return { value: v, error: null };
    }
    return { value: null, error: 'computedTypeMismatch' };
  }
  // text: jede Wert-Art über die kanonische Anzeige-Form der Abfrage.
  return { value: formatValue(v), error: null };
}

// Auswertungs-Reihenfolge der gültigen Formeln: eine Formel folgt allen
// berechneten Spalten, auf die sie verweist (Deklarations-Reihenfolge ist
// frei; Kreise hat validateComputedColumns bereits aussortiert — deren
// Spalten tragen kein exprAst).
function computedEvaluationOrder(model) {
  const entries = [];
  model.columns.forEach((col, i) => {
    if (col.expr !== null) entries.push({ col, i });
  });
  const evaluable = entries.filter((e) => e.col.exprAst);
  const byName = new Map(evaluable.map((e) => [e.col.name.toLowerCase(), e]));
  const order = [];
  const placed = new Set();
  let grew = true;
  while (grew && order.length < evaluable.length) {
    grew = false;
    for (const e of evaluable) {
      const name = e.col.name.toLowerCase();
      if (placed.has(name)) continue;
      const refs = [];
      collectFieldRefs(e.col.exprAst, refs);
      if (refs.every((r) => !byName.has(r) || placed.has(r))) {
        order.push(e);
        placed.add(name);
        grew = true;
      }
    }
  }
  return { entries, order };
}

// Wertet die Spalten-Formeln pro Zeile aus. Rückgabe: Map(row-Objekt ->
// { [colIdx]: { value, error } }); die Map-Schlüssel sind die Zeilen-
// Objekte des Modells, damit auch Teilmengen (gefilterte Ansicht,
// Aggregate) ohne Index-Umrechnung zugreifen können. Feld-Kontext der
// Auswertung sind die Spalten-Werte der Zeile (lowercase-Schlüssel);
// berechnete Spalten werden in Abhängigkeits-Reihenfolge gerechnet
// (computedEvaluationOrder), sodass Formeln unabhängig von der
// Deklarations-Reihenfolge aufeinander verweisen können. Ergebnisse
// werden nie persistiert (der Serialisierer kennt nur Daten-Zellen).
function computeComputedCells(model) {
  const map = new Map();
  const { entries, order } = computedEvaluationOrder(model);
  if (entries.length === 0) return map;
  const dataIdx = dataIndexByColumn(model.columns);
  for (const row of model.rows) {
    const props = {};
    model.columns.forEach((col, i) => {
      const di = dataIdx[i];
      // Berechnete Spalten starten als null (Kreis-/Fehler-Formeln bleiben
      // es), Daten-Spalten mit ihrem Zell-Wert.
      props[col.name.toLowerCase()] =
        di == null ? null : row[di] && !row[di].error ? row[di].value : null;
    });
    const perCol = {};
    for (const e of entries) perCol[e.i] = { value: null, error: null };
    for (const { col, i } of order) {
      const result = toComputedCell(col, evaluateExpression(col.exprAst, { props }));
      perCol[i] = result;
      props[col.name.toLowerCase()] = result.error ? null : result.value;
    }
    map.set(row, perCol);
  }
  return map;
}

// Wert-Resolver über Daten- UND berechnete Spalten (Aggregate, Sortierung,
// Filter der Ansicht).
function makeCellValueResolver(model, computed) {
  const dataIdx = dataIndexByColumn(model.columns);
  return (row, colIdx) => {
    const di = dataIdx[colIdx];
    if (di != null) {
      const cell = row[di];
      return cell && !cell.error ? cell.value : null;
    }
    const perCol = computed ? computed.get(row) : null;
    const comp = perCol ? perCol[colIdx] : null;
    return comp && !comp.error ? comp.value : null;
  };
}

// --- Anzeige-Formatierung (4T-0418) ------------------------------------------------

// Wert -> Anzeige-Text. Bewusst ohne Locale-Umformatung (v1): Zahl in
// Punkt-Dezimal gemäß Spalten-Format, Datum/Uhrzeit kanonisch — Anzeige
// und Speicherform bleiben identisch lesbar (Task-Entscheidung 4T-0418).
function formatCellDisplay(col, value) {
  if (value == null) return '';
  if (col.type === 'number' && typeof value === 'number') {
    return col.decimals != null ? value.toFixed(col.decimals) : String(normalizeFloat(value));
  }
  return String(value);
}

function formatAggregateDisplay(col, entry) {
  if (entry.value == null) return '—';
  if (entry.func === 'count') return String(entry.value);
  return formatCellDisplay(col, entry.value);
}

// --- Viewer-HTML (4T-0418) ----------------------------------------------------------

// escapeHtml lazy aus slug.js (kein Zyklus, aber konsistent zum Muster der
// Nachbar-Module).
const { escapeHtml } = require('./slug.js');

// Fehler-Liste als Platzhalter-Knoten: der Renderer lokalisiert die Texte
// über data-dt-code/-line/-detail (applyPerspectiveDatatablesIfPresent);
// der eingebettete Fallback-Text bleibt sprachneutral (Code + Zeile).
function buildErrorsHtml(errors) {
  const out = ['<div class="pdt-errors">'];
  out.push(
    '<span class="pdt-errors-title" data-i18n="datatable.errors.title">perspective-datatable</span>',
  );
  for (const err of errors) {
    const line = Number(err.line) || 0;
    const detail = escapeHtml(String(err.detail == null ? '' : err.detail));
    out.push(
      `<div class="pdt-error-item" data-dt-code="${escapeHtml(err.code)}" ` +
        `data-dt-line="${line}" data-dt-detail="${detail}">` +
        `${escapeHtml(err.code)} [${line}]</div>`,
    );
  }
  out.push('</div>');
  return out.join('');
}

// Einzelne Daten-Zelle. Fehler-Zellen zeigen den Rohtext mit lokalisiertem
// Tooltip (data-i18n-title); Boolean als read-only Checkbox (nicht die
// task-list-Klasse, damit enableTaskCheckboxes sie nicht aktiviert).
function buildCellHtml(col, colIdx, cell, editable) {
  const cls = ['pdt-cell', `pdt-type-${col.type}`];
  const attrs = [`data-dt-col="${colIdx}"`];
  // 4T-0419: editierbare Zellen sind fokussierbar (F2/Enter öffnet die
  // Bearbeitung; die Handler prüfen den Modus zur Laufzeit).
  if (editable) attrs.push('tabindex="0"');
  let inner;
  if (cell && cell.error) {
    cls.push('pdt-cell-error');
    attrs.push(`data-i18n-title="datatable.cellError.${escapeHtml(cell.error)}"`);
    inner = escapeHtml(cell.text);
  } else if (col.type === 'boolean') {
    inner = `<input type="checkbox" disabled${cell && cell.value ? ' checked' : ''}>`;
  } else {
    inner = escapeHtml(formatCellDisplay(col, cell ? cell.value : null));
  }
  return `<td class="${cls.join(' ')}" ${attrs.join(' ')}>${inner}</td>`;
}

// Zelle einer berechneten Spalte: read-only (kein tabindex), visuell
// abgesetzt; Typ-Abweichungen als Fehler-Zelle mit Tooltip (4T-0421).
function buildComputedCellHtml(col, colIdx, comp) {
  const cls = ['pdt-cell', 'pdt-computed', `pdt-type-${col.type}`];
  const attrs = [`data-dt-col="${colIdx}"`];
  let inner;
  if (comp && comp.error) {
    cls.push('pdt-cell-error');
    attrs.push(`data-i18n-title="datatable.cellError.${escapeHtml(comp.error)}"`);
    inner = '—';
  } else if (col.type === 'boolean') {
    inner =
      comp && comp.value != null
        ? `<input type="checkbox" disabled${comp.value ? ' checked' : ''}>`
        : '';
  } else {
    inner = escapeHtml(formatCellDisplay(col, comp ? comp.value : null));
  }
  return `<td class="${cls.join(' ')}" ${attrs.join(' ')}>${inner}</td>`;
}

function buildDatatableTableHtml(model) {
  const columns = model.columns;
  const dataIdx = dataIndexByColumn(columns);
  // 4T-0421: berechnete Zellen einmal pro Render auswerten; Aggregate
  // rechnen über Daten- und berechnete Werte.
  const computed = computeComputedCells(model);
  const aggs = computeAggregates(model, model.rows, makeCellValueResolver(model, computed));
  const hasAgg = (model.aggregates || []).some((a) => a && a.length > 0);
  const truncated = model.rows.length > MAX_RENDER_ROWS;
  // 4T-0419: Editier-Affordanzen (Lösch-Spalte, Zeile-hinzufügen-Knopf,
  // fokussierbare Zellen) nur bei struktur-fehlerfreier Tabelle — der
  // Grid-Editor blockiert das Rückschreiben sonst ohnehin. Sichtbar werden
  // die Affordanzen nur in editierbaren Kontexten (CSS über die View-
  // Modus-Klassen bzw. das Live-Widget); Reading und Handbuch bleiben ohne.
  const editable = (model.errors || []).length === 0;
  const out = ['<table class="pdt-grid">'];

  out.push('<thead><tr>');
  if (editable && !truncated) out.push('<th class="pdt-row-del" aria-hidden="true"></th>');
  columns.forEach((col, i) => {
    const cls = ['pdt-col', `pdt-type-${col.type}`];
    if (col.expr != null) cls.push('pdt-computed');
    // Ausdruck als Tooltip am Kopf der berechneten Spalte (Syntax, kein
    // übersetzbarer Text).
    const title = col.expr != null ? ` title="= ${escapeHtml(col.expr)}"` : '';
    out.push(
      `<th class="${cls.join(' ')}" data-dt-col="${i}" scope="col"${title}>` +
        `<span class="pdt-name">${escapeHtml(col.name)}</span>` +
        `<span class="pdt-type">${escapeHtml(col.type)}</span></th>`,
    );
  });
  out.push('</tr></thead>');

  if (!truncated && model.rows.length > 0) {
    out.push('<tbody>');
    model.rows.forEach((row, r) => {
      out.push(`<tr data-dt-row="${r}">`);
      if (editable) {
        out.push(
          '<td class="pdt-row-del"><button type="button" class="pdt-del-btn" ' +
            'data-i18n-title="datatable.deleteRow" tabindex="-1">×</button></td>',
        );
      }
      columns.forEach((col, i) => {
        const di = dataIdx[i];
        if (di == null) {
          const perCol = computed.get(row);
          out.push(buildComputedCellHtml(col, i, perCol ? perCol[i] : null));
          return;
        }
        out.push(buildCellHtml(col, i, row[di], editable));
      });
      out.push('</tr>');
    });
    out.push('</tbody>');
  }

  if (hasAgg) {
    out.push('<tfoot><tr class="pdt-agg-row">');
    if (editable && !truncated) out.push('<td class="pdt-row-del"></td>');
    columns.forEach((col, i) => {
      const inner = aggs[i]
        .map(
          (entry) =>
            `<span class="pdt-agg">` +
            `<span class="pdt-agg-label" data-i18n="datatable.aggregate.${entry.func}">${entry.func}</span>` +
            `<span class="pdt-agg-value">${escapeHtml(formatAggregateDisplay(col, entry))}</span></span>`,
        )
        .join('');
      // data-dt-col: die Ansichts-Funktionen (4T-0420) aktualisieren die
      // Aggregat-Werte bei gefilterter Ansicht zellgenau im DOM.
      out.push(`<td class="pdt-cell pdt-type-${col.type}" data-dt-col="${i}">${inner}</td>`);
    });
    out.push('</tr></tfoot>');
  }
  out.push('</table>');

  if (editable && !truncated) {
    out.push(
      '<div class="pdt-add-row"><button type="button" class="pdt-add-btn">' +
        '<span aria-hidden="true">+</span> ' +
        '<span data-i18n="datatable.addRow">addRow</span></button></div>',
    );
  }

  if (truncated) {
    // Sprachneutraler Fallback-Text; lokalisiert der Renderer über
    // data-dt-total (applyPerspectiveDatatablesIfPresent).
    out.push(
      `<div class="pdt-limit" data-dt-total="${model.rows.length}">` +
        `${model.rows.length} &gt; ${MAX_RENDER_ROWS}</div>`,
    );
  }
  return out.join('');
}

// Innen-HTML des Platzhalter-Containers (der Container selbst mit den
// data-dt-Attributen entsteht im Fence-Override von markdown.js).
function renderPerspectiveDatatableViewer(content) {
  const model = parsePerspectiveDatatable(content);
  const out = [];
  if (model.errors.length > 0) out.push(buildErrorsHtml(model.errors));
  if (model.columns.length > 0) out.push(buildDatatableTableHtml(model));
  return out.join('');
}

// --- Portable-HTML (4T-0418) --------------------------------------------------------

// Statische HTML-Tabelle mit Inline-Styles für den Portable-Export.
// Sprachneutral (Aggregat-Beschriftung = Funktions-Schlüsselwort, wie die
// Fence-Syntax selbst); alle Zeilen werden exportiert (die Render-Ober-
// Grenze schützt nur die Live-Pipeline). Bei Struktur-Fehlern null —
// der Fence bleibt dann unverändert im Export (Muster perspective-table).
function convertPerspectiveDatatableBlockToHtml(content) {
  const model = parsePerspectiveDatatable(content);
  if (model.errors.length > 0 || model.columns.length === 0) return null;
  const columns = model.columns;
  const dataIdx = dataIndexByColumn(columns);
  // 4T-0421: berechnete Werte werden zur Export-Zeit gerechnet (nie
  // persistiert) und statisch mitgeschrieben.
  const computed = computeComputedCells(model);
  const aggs = computeAggregates(model, model.rows, makeCellValueResolver(model, computed));
  const hasAgg = (model.aggregates || []).some((a) => a && a.length > 0);
  const alignStyle = (col) => {
    if (col.type === 'number') return 'text-align: right;';
    if (col.type === 'boolean') return 'text-align: center;';
    return '';
  };
  const out = ['<table>'];
  out.push('<thead><tr>');
  for (const col of columns) {
    const style = alignStyle(col);
    out.push(`<th scope="col"${style ? ` style="${style}"` : ''}>${escapeHtml(col.name)}</th>`);
  }
  out.push('</tr></thead>');
  if (model.rows.length > 0) {
    out.push('<tbody>');
    for (const row of model.rows) {
      out.push('<tr>');
      columns.forEach((col, i) => {
        const di = dataIdx[i];
        // 4T-0421: berechnete Spalten liefern ihren gerechneten Wert
        // (Zellen-Sicht identisch zu Daten-Zellen; error/value/text).
        let cell = di == null ? null : row[di];
        if (di == null) {
          const perCol = computed.get(row);
          cell = perCol ? perCol[i] : null;
        }
        const styles = [];
        const align = alignStyle(col);
        if (align) styles.push(align);
        let inner = '';
        if (cell && cell.error) {
          // Fehler-Zelle: Rohtext mit dezenter Markierung (Farben wie die
          // error-Statusklasse der Perspective Table); berechnete Fehler-
          // Zellen tragen keinen Rohtext (Gedankenstrich).
          styles.push('background-color: #ffebee; color: #b71c1c;');
          inner = escapeHtml(cell.text != null ? cell.text : '—');
        } else if (cell) {
          inner =
            col.type === 'boolean'
              ? cell.value
                ? 'x'
                : ''
              : escapeHtml(formatCellDisplay(col, cell.value));
        }
        out.push(`<td${styles.length ? ` style="${styles.join(' ')}"` : ''}>${inner}</td>`);
      });
      out.push('</tr>');
    }
    out.push('</tbody>');
  }
  if (hasAgg) {
    out.push('<tfoot><tr>');
    columns.forEach((col, i) => {
      const inner = aggs[i]
        .map(
          (entry) =>
            `<span style="opacity: 0.7;">${entry.func}</span> ` +
            escapeHtml(formatAggregateDisplay(col, entry)),
        )
        .join('<br>');
      const align = alignStyle(col);
      const style = `font-style: italic;${align ? ' ' + align : ''}`;
      out.push(`<td style="${style}">${inner}</td>`);
    });
    out.push('</tr></tfoot>');
  }
  out.push('</table>');
  return out.join('');
}

// --- Ansichts-Sortierung und Filter (4T-0420) ---------------------------------------

// Typ-gerechter Vergleich zweier Zell-Werte: Zahl numerisch, Datum/Uhrzeit
// chronologisch (kanonische Strings sind lexikographisch chronologisch),
// Text locale-bewusst, Boolean false vor true; fehlende bzw. nicht
// auswertbare Werte (null, Fehler-Zellen) sortieren ans Ende.
function compareCellValues(type, a, b) {
  const aMissing = a == null || (type === 'text' && a === '');
  const bMissing = b == null || (type === 'text' && b === '');
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (type === 'number') return a - b;
  if (type === 'boolean') return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  if (type === 'text') return String(a).localeCompare(String(b), undefined, { numeric: true });
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// Stabile Sortier-Reihenfolge der Zeilen-Indizes nach einer Spalte.
// dir = 1 (aufsteigend) oder -1 (absteigend); fehlende Werte immer am
// Ende. computed (optional, aus computeComputedCells) liefert die Werte
// berechneter Spalten (4T-0421).
function sortDatatableRows(model, colIdx, dir, computed) {
  const col = model.columns[colIdx];
  if (!col) return model.rows.map((row, i) => i);
  const valueOf = makeCellValueResolver(model, computed);
  return model.rows
    .map((row, i) => ({ i, v: valueOf(row, colIdx) }))
    .sort((a, b) => {
      const cmp = compareCellValues(col.type, a.v, b.v);
      // Fehlende Werte bleiben auch absteigend am Ende (cmp-Vorzeichen
      // nur für echte Wert-Paare drehen).
      if (a.v == null || b.v == null) return cmp !== 0 ? cmp : a.i - b.i;
      return cmp !== 0 ? cmp * dir : a.i - b.i;
    })
    .map((e) => e.i);
}

// Zeilen-Filter der Ansicht: filters ist ein Array parallel zu columns,
// je Eintrag null (kein Filter), { text } (Enthaltensuche, case-insensitiv,
// auf dem Anzeige-Text bzw. dem Rohtext von Fehler-Zellen) oder { bool }
// (Dreifach-Umschalter: true/false). computed (optional) liefert die Werte
// berechneter Spalten (4T-0421). Liefert die Indizes der sichtbaren Zeilen.
function filterDatatableRows(model, filters, computed) {
  const dataIdx = dataIndexByColumn(model.columns);
  const active = [];
  (filters || []).forEach((f, colIdx) => {
    if (!f) return;
    if (typeof f.text === 'string' && f.text.trim() !== '') {
      active.push({ colIdx, text: f.text.trim().toLowerCase() });
    } else if (typeof f.bool === 'boolean') {
      active.push({ colIdx, bool: f.bool });
    }
  });
  const indices = [];
  model.rows.forEach((row, i) => {
    for (const f of active) {
      const col = model.columns[f.colIdx];
      const di = dataIdx[f.colIdx];
      // Zellen-Sicht vereinheitlichen: Daten-Zelle oder berechneter Wert.
      let cell = di == null ? null : row[di];
      if (di == null && computed) {
        const perCol = computed.get(row);
        cell = perCol ? perCol[f.colIdx] : null;
      }
      if (typeof f.bool === 'boolean') {
        const v = cell && !cell.error && typeof cell.value === 'boolean' ? cell.value : null;
        if (v !== f.bool) return;
        continue;
      }
      const display =
        cell && cell.error
          ? cell.text || ''
          : col
            ? formatCellDisplay(col, cell ? cell.value : null)
            : '';
      if (!String(display).toLowerCase().includes(f.text)) return;
    }
    indices.push(i);
  });
  return indices;
}

// --- Fence-Suche im Quelltext (4T-0419) ---------------------------------------------

// Findet alle perspective-datatable-Fences auf oberster Ebene eines
// Markdown-Texts (Zeilen-Scan mit Fence-Zustand: innerhalb eines fremden
// Fences zählt eine `perspective-datatable`-Zeile nicht). Grundlage des
// Grid-Editor-Rückschreibens: Zeilennummern 1-basiert; body ohne
// abschließendes Newline. Eingerückte Fences in Listen/Blockquotes werden
// bewusst nicht erfasst (dokumentierte Editor-Grenze; der data-dt-source-
// Abgleich des Editors verhindert Fehl-Zuordnungen).
function findPerspectiveDatatableFences(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = [];
  let open = null; // { marker, len, lang, openLine } (openLine 1-basiert)
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!m) continue;
    const marker = m[1][0];
    const len = m[1].length;
    const info = m[2].trim();
    if (open) {
      // Schließt nur derselbe Marker mit mindestens gleicher Länge ohne Info.
      if (marker === open.marker && len >= open.len && info === '') {
        if (open.lang === 'perspective-datatable') {
          result.push({
            openLine: open.openLine,
            closeLine: i + 1,
            bodyStartLine: open.openLine + 1,
            bodyEndLine: i, // 1-basiert inklusiv (Zeile vor der Schließ-Zeile)
            body: lines.slice(open.openLine, i).join('\n'),
          });
        }
        open = null;
      }
      continue;
    }
    // Backtick-Fences dürfen kein ` im Info-String tragen (Fence-Regel).
    if (marker === '`' && info.includes('`')) continue;
    open = { marker, len, lang: info.split(/\s+/)[0], openLine: i + 1 };
  }
  // Ungeschlossener Fence läuft bis zum Datei-Ende (Fence-Semantik).
  if (open && open.lang === 'perspective-datatable') {
    result.push({
      openLine: open.openLine,
      closeLine: lines.length + 1,
      bodyStartLine: open.openLine + 1,
      bodyEndLine: lines.length,
      body: lines.slice(open.openLine).join('\n'),
    });
  }
  return result;
}

module.exports = {
  parsePerspectiveDatatable,
  serializePerspectiveDatatable,
  parseCellValue,
  computeAggregates,
  computeComputedCells,
  makeCellValueResolver,
  formatCellDisplay,
  formatAggregateDisplay,
  compareCellValues,
  sortDatatableRows,
  filterDatatableRows,
  renderPerspectiveDatatableViewer,
  convertPerspectiveDatatableBlockToHtml,
  findPerspectiveDatatableFences,
  COLUMN_TYPES,
  AGGREGATE_FUNCS,
  MAX_RENDER_ROWS,
};
