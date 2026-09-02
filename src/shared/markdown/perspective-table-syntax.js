// 4T-000591 (Epic 3E-000109): Reine Syntax-Helfer der Perspective Table, aus
// perspective-table.js hierher verschoben. Grund: das Bearbeitungs-Modul
// perspective-table-edit.js braucht dieselbe Attribut- und Status-Grammatik,
// darf perspective-table.js aber nicht laden — dessen lazy
// require('./markdown.js') würde esbuild statisch ins Renderer-Bundle
// ziehen (markdown.js läuft im Preload-Kontext, dokumentierte Falle aus
// 4T-000546). Dieses Modul ist abhängigkeitsfrei; perspective-table.js
// bezieht die Helfer von hier, das Verhalten bleibt identisch.
'use strict';

function parsePerspectiveTableCellAttrs(rawText) {
  const pipeIdx = rawText.indexOf('|');
  if (pipeIdx < 0) return { attrs: {}, content: rawText };
  const head = rawText.slice(0, pipeIdx).trim();
  if (head === '') return { attrs: {}, content: rawText };
  // Head muss ausschliesslich aus name="value"-Paaren bestehen, ggf. durch
  // Whitespace getrennt. Sonst ist es kein Attribut-Block.
  if (!/^(\w+="[^"]*")(\s+\w+="[^"]*")*$/.test(head)) {
    return { attrs: {}, content: rawText };
  }
  const tail = rawText.slice(pipeIdx + 1).trimStart();
  const attrs = {};
  const tokenRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = tokenRegex.exec(head)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2];
    if (name === 'colspan' || name === 'rowspan') {
      // Nur positive Ganzzahlen ohne fuehrendes/folgendes Whitespace.
      if (/^[1-9]\d*$/.test(value)) attrs[name] = value;
    } else if (name === 'align') {
      if (value === 'left' || value === 'center' || value === 'right') {
        attrs[name] = value;
      }
    } else if (name === 'valign') {
      if (value === 'top' || value === 'middle' || value === 'bottom') {
        attrs[name] = value;
      }
    }
    // Andere Attribut-Namen werden stillschweigend ignoriert (Whitelist).
  }
  return { attrs, content: tail };
}

// 4T-000044 (Epic 3E-000009): Status-Hervorhebung mit semantischen Klassen.
// Whitelist auf fuenf Werte. Punkt-Notation am Zell-/Zeilen-Marker:
// |.error Inhalt, |-.warn etc.
const PERSPECTIVE_STATUS_CLASSES = new Set(['error', 'warn', 'ok', 'info', 'neutral']);

// 4T-000044: Erkennt am Anfang eines Marker-Folge-Texts eine Status-Klasse
// in Punkt-Notation (z.B. '.error '). Whitelist-Filter: nur die fuenf
// definierten Werte. Gibt { status, rest } zurueck; bei keinem Match ist
// status=null und rest=text.
function extractPerspectiveTableStatusClass(text) {
  const m = String(text || '').match(/^\.(\w+)(\s+|$)/);
  if (m && PERSPECTIVE_STATUS_CLASSES.has(m[1])) {
    return { status: m[1], rest: text.slice(m[0].length) };
  }
  return { status: null, rest: text };
}

// 4T-000045/4T-000046 (Epic 3E-000009): Tabellen-Header-Attribute auf der {|-Zeile.
// Aktuell unterstuetzt:
//   +cols="left center right"   -> Spalten-Default-Ausrichtung (4T-000045)
//   +sortable                   -> Tabelle sortierbar (4T-000046)
// Ungueltige Werte werden auf null abgebildet (kein Default fuer diese Spalte).
function parsePerspectiveTableHeaderAttrs(headerLine) {
  const result = { columnDefaults: [], sortable: false };
  const text = String(headerLine || '');
  // \b matcht sowohl nach '+' als auch nach Whitespace, sodass die Header-
  // Zeile in beiden Schreibweisen verarbeitet wird: '{|+cols="..."',
  // '{|+sortable cols="..."', '{|+sortable +cols="..."'.
  const colsMatch = text.match(/\bcols="([^"]*)"/);
  if (colsMatch) {
    result.columnDefaults = colsMatch[1]
      .split(/\s+/)
      .filter(Boolean)
      .map((v) => {
        if (v === 'left' || v === 'center' || v === 'right') return v;
        return null;
      });
  }
  if (/\bsortable\b/.test(text)) {
    result.sortable = true;
  }
  return result;
}

module.exports = {
  parsePerspectiveTableCellAttrs,
  PERSPECTIVE_STATUS_CLASSES,
  extractPerspectiveTableStatusClass,
  parsePerspectiveTableHeaderAttrs,
};
