// 4T-000986 (Epic 3E-000196): Perspective Datatable — Ansicht.
// Aus perspective-datatable.js herausgelöst: Anzeige-Formatierung der
// Zell- und Aggregat-Werte, typ-gerechter Vergleich, Ansichts-Sortierung
// und Zeilen-Filter sowie die Fence-Suche im Markdown-Quelltext.
// Prozess-neutral (kein Electron, kein DOM); die HTML-Bauer der Familie
// beziehen ihre Anzeige-Texte von hier.
'use strict';

const {
  normalizeFloat,
  dataIndexByColumn,
  makeCellValueResolver,
} = require('./perspective-datatable-computed.js');

// --- Anzeige-Formatierung (4T-000418) ------------------------------------------------

// Wert -> Anzeige-Text. Bewusst ohne Locale-Umformatung (v1): Zahl in
// Punkt-Dezimal gemäß Spalten-Format, Datum/Uhrzeit kanonisch — Anzeige
// und Speicherform bleiben identisch lesbar (Task-Entscheidung 4T-000418).
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

// --- Ansichts-Sortierung und Filter (4T-000420) ---------------------------------------

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
// berechneter Spalten (4T-000421).
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
// berechneter Spalten (4T-000421). Liefert die Indizes der sichtbaren Zeilen.
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

// --- Fence-Suche im Quelltext (4T-000419) ---------------------------------------------

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
  formatCellDisplay,
  formatAggregateDisplay,
  compareCellValues,
  sortDatatableRows,
  filterDatatableRows,
  findPerspectiveDatatableFences,
};
