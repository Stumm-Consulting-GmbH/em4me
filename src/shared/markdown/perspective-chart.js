// 4T-002019 (Epic 3E-000192): Diagramm zu einer Datentabelle — Format-Kern des
// Blocks (Zaun `perspective-chart`). Prozess-neutral: kein DOM, kein Electron,
// kein Datei-Zugriff.
//
// Kern der Modul-Familie. Er hält das Format (Lesen und Zurückschreiben der
// Angaben), den Einstieg `buildChartInput` und den Container der Zaun-Regel und
// reicht die Arbeit an die Schwester-Module weiter:
//   perspective-chart-resolve.js  Auflösung des Tabellen-Namens in einem
//                                 Dokument-Text; Blatt der Familie
//   perspective-chart-series.js   Bildung der Datenreihen und Ermittlung des
//                                 Grundes; Blatt der Familie
//   perspective-chart-ref.js      Info-Zeichenfolge des Zauns und Erkennung
//                                 der Angabe `table:` samt Spannen (4T-002023);
//                                 Blatt der Familie, geteilt mit Index,
//                                 ausgehenden Verweisen und Nachzügen
// Der Import-Graph läuft ausschließlich von hier nach unten; kein
// Schwester-Modul lädt den Kern.
//
// **Wo aufgelöst und gezeichnet wird**, entscheidet der Task zur Darstellung in
// den Ansichten; dieser Kern liefert den Container und die prozess-neutrale
// Auflösung, die für beide Wege taugt. Die Zaun-Regel in markdown.js setzt
// allein den Container mit dem Block-Inhalt.
//
// Format des Fence-Bodys — eine Angabe je Zeile, Form `schlüssel: wert`, nach
// dem Muster der Kopfzeilen der Datentabelle:
//   table: Umsatz                  Tabelle im selben Dokument; die alte
//                                  Schreibweise ^Umsatz wird weiter gelesen
//                                  (4T-002072)
//   table: [[Bericht#^Umsatz]]     Tabelle in einem anderen Dokument
//   type: bar                      line | bar | pie | donut
//   series: columns                columns | rows; ohne Zeile columns
//   labels: Monat                  Kennung der Beschriftungs-Spalte
//   values: Einnahmen, Ausgaben    Kennungen der Werte-Spalten
//   rows: Januar, Februar          Einträge der Beschriftungs-Spalte (nur bei
//                                  series: rows); ein Komma im Eintrag als `\,`
//   title: Umsatz 2026             freier Text; ohne Zeile kein Titel
// Spalten werden über ihre Kennung genannt, nicht über die Anzeige-Überschrift.
// Jede andere Zeile bleibt unverändert samt Position erhalten; steht eine
// Angabe mehrfach, gilt die erste, und die weiteren bleiben als unbekannte
// Zeilen stehen. Der Block trägt keine Zahlenwerte der Tabelle.
//
// Modell der Angaben (Rückgabe von parseChartSpec):
//   {
//     table, type, series, labels, title   string|null (type und series klein)
//     values, rows                         string[]|null
//     lines: [{ raw, eol, key, parsed }]   jede Zeile des Bodys; key null bei
//                                          einer unbekannten Zeile, parsed der
//                                          gelesene Wert einer bekannten
//   }
// serializeChartSpec schreibt eine Zeile, deren Wert unverändert ist, byte-gleich
// zurück; ist nichts geändert, ist das Ergebnis der Body selbst.
'use strict';

const { escapeHtml } = require('./slug.js');
const { isValidBlockAnchorId } = require('../block-anchors.js');
const { resolveTableInDocument } = require('./perspective-chart-resolve.js');
const {
  CHART_REASONS,
  CHART_TYPES,
  SERIES_MODES,
  notDrawable,
  buildChartSeries,
} = require('./perspective-chart-series.js');
// 4T-002023: Fence-Name und die beiden Muster der Angaben aus ihrer Heimat im
// Blatt, damit Index, Nachzüge und Kern dieselbe Zeile als Angabe lesen.
const {
  CHART_FENCE_INFO,
  ANGABE_ZEILE_RE,
  TABELLEN_VERWEIS_RE,
} = require('./perspective-chart-ref.js');

const CHART_FENCE = CHART_FENCE_INFO;
const CHART_EXTENSION_ID = 'perspective-chart';
const DOCUMENT_MISSING = 'document-missing';

// Die bekannten Angaben in der Reihenfolge, in der eine fehlende Angabe beim
// Zurückschreiben angehängt wird.
const CHART_KEYS = Object.freeze(['table', 'type', 'series', 'labels', 'values', 'rows', 'title']);

// --- Listen-Werte -----------------------------------------------------------

function splitValues(text) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// Einträge der Beschriftungs-Spalte können selbst ein Komma tragen; es steht im
// Block als `\,`.
function splitRows(text) {
  const out = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === ',') {
      cur += ',';
      i++;
    } else if (text[i] === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += text[i];
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

function readValue(key, text) {
  const v = text.trim();
  if (key === 'values' || key === 'rows') {
    const list = key === 'values' ? splitValues(v) : splitRows(v);
    return list.length > 0 ? list : null;
  }
  if (v === '') return null;
  return key === 'type' || key === 'series' ? v.toLowerCase() : v;
}

function formatValue(key, value) {
  if (value == null) return null;
  if (key === 'values') return value.join(', ');
  if (key === 'rows') return value.map((e) => String(e).replace(/,/g, '\\,')).join(', ');
  return String(value);
}

// --- Lesen und Zurückschreiben ---------------------------------------------

// Body -> Modell der Angaben. Wirft nie.
function parseChartSpec(body) {
  const text = String(body == null ? '' : body);
  const parts = text.split(/(\r\n|\n)/);
  const spec = { lines: [] };
  for (const key of CHART_KEYS) spec[key] = null;
  const seen = new Set();
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i];
    const line = { raw, eol: parts[i + 1] || '', key: null, parsed: null };
    const m = ANGABE_ZEILE_RE.exec(raw.trim());
    const key = m ? m[1].toLowerCase() : null;
    if (key && CHART_KEYS.includes(key) && !seen.has(key)) {
      seen.add(key);
      line.key = key;
      line.parsed = readValue(key, m[2]);
      spec[key] = line.parsed;
    }
    spec.lines.push(line);
  }
  return spec;
}

// Modell -> Body. Unbekannte Zeilen und Angaben mit unverändertem Wert bleiben
// byte-gleich; eine geänderte Angabe wird als `schlüssel: wert` geschrieben,
// eine auf null gesetzte entfällt, eine neue kommt ans Ende.
function serializeChartSpec(spec) {
  const out = [];
  const written = new Set();
  for (const line of spec.lines || []) {
    if (!line.key) {
      out.push({ text: line.raw, eol: line.eol });
      continue;
    }
    written.add(line.key);
    const now = formatValue(line.key, spec[line.key]);
    if (now === formatValue(line.key, line.parsed)) {
      out.push({ text: line.raw, eol: line.eol });
    } else if (now !== null) {
      out.push({ text: `${line.key}: ${now}`, eol: line.eol });
    } else if (out.length > 0 && line.eol === '') {
      // Die entfallende Zeile war die letzte: Ihr Vorgänger wird es jetzt.
      out[out.length - 1].eol = '';
    }
  }
  // Neue Zeilen übernehmen das Zeilenende, das der Body schon führt.
  const eol = (spec.lines || []).map((l) => l.eol).find((e) => e !== '') || '\n';
  for (const key of CHART_KEYS) {
    const now = formatValue(key, spec[key]);
    if (written.has(key) || now === null) continue;
    const neu = { text: `${key}: ${now}`, eol: '' };
    const last = out[out.length - 1];
    if (!last) {
      out.push(neu);
    } else if (last.text === '' && last.eol === '') {
      // Die leere Schluss-Zeile (Body endet mit Zeilenende) bleibt die letzte.
      neu.eol = eol;
      out.splice(out.length - 1, 0, neu);
    } else {
      if (last.eol === '') last.eol = eol;
      out.push(neu);
    }
  }
  return out.map((l) => l.text + l.eol).join('');
}

// Wert der Angabe `table:` -> { kind: 'same', name } oder
// { kind: 'other', file, name }; null, wenn die Angabe fehlt oder keiner der
// Schreibweisen folgt. 4T-002072: Der Name ohne Dach-Zeichen nennt die Tabelle
// im selben Dokument, wie die Kopf-Angabe `table:` der Datentabelle ihn trägt.
function parseTableRef(text) {
  const v = String(text == null ? '' : text).trim();
  if (v.startsWith('^')) {
    const name = v.slice(1);
    return isValidBlockAnchorId(name) ? { kind: 'same', name } : null;
  }
  const m = TABELLEN_VERWEIS_RE.exec(v);
  if (m) {
    if (m[1].trim() === '' || !isValidBlockAnchorId(m[2])) return null;
    return { kind: 'other', file: m[1].trim(), name: m[2] };
  }
  return isValidBlockAnchorId(v) ? { kind: 'same', name: v } : null;
}

// --- Einstiege ----------------------------------------------------------------

const RESOLVE_REASON = {
  missing: 'table-missing',
  'other-kind': 'table-other-kind',
  invalid: 'table-invalid',
};

// Löst den Namen im Text des Dokuments auf, das die Tabelle trägt, und bildet
// daraus das Ergebnis für den Zeichner. Einstieg auch für die Auflösung in
// einem anderen Dokument, sobald dessen Text vorliegt.
function buildChartInputInDocument(spec, tableDocumentText, name) {
  const res = resolveTableInDocument(tableDocumentText, name);
  if (res.status !== 'found') {
    const detail =
      res.status === 'other-kind' ? res.kind : res.status === 'invalid' ? res.errors[0].code : name;
    return notDrawable(RESOLVE_REASON[res.status], detail);
  }
  return buildChartSeries(spec, res.model);
}

// Dokument-Text und Body des Diagramm-Blocks -> Eingabe des Zeichners oder
// Grund. Nennt der Block eine Tabelle in einem anderen Dokument, entsteht ein
// Zwischen-Ergebnis mit `pending: 'other-document'` und dem Ziel; der Aufrufer
// beschafft dessen Text und ruft buildChartInputInDocument.
function buildChartInput(documentText, chartBody) {
  const spec = parseChartSpec(chartBody);
  const ref = parseTableRef(spec.table);
  if (!ref) return notDrawable('table-missing', spec.table);
  if (ref.kind === 'other') {
    return {
      drawable: false,
      reason: null,
      detail: null,
      missingKey: null,
      pending: 'other-document',
      target: { file: ref.file, name: ref.name },
    };
  }
  return buildChartInputInDocument(spec, documentText, ref.name);
}

// Container der Zaun-Regel nach dem Muster der Datentabelle: Index je
// Render-Lauf, Zeilenbereich im Gesamt-Dokument und der Body im Attribut.
function renderChartContainer(body, opts = {}) {
  const index = opts.index || 0;
  const lineStart = opts.lineStart || 0;
  const lineEnd = opts.lineEnd || 0;
  return (
    `<div class="perspective-chart" data-chart-index="${index}" ` +
    `data-chart-line-start="${lineStart}" data-chart-line-end="${lineEnd}" ` +
    `data-source-line="${lineStart}" data-chart-source="${escapeHtml(String(body || ''))}"></div>\n`
  );
}

module.exports = {
  CHART_FENCE,
  CHART_EXTENSION_ID,
  CHART_KEYS,
  CHART_REASONS,
  CHART_TYPES,
  SERIES_MODES,
  DOCUMENT_MISSING,
  parseChartSpec,
  serializeChartSpec,
  parseTableRef,
  buildChartInput,
  buildChartInputInDocument,
  renderChartContainer,
};
