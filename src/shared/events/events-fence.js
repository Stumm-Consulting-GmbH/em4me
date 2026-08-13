// 4T-0984 (Epic 3E-0196): Fence-Datenformat der Ereignisse — aus
// `events-core.js` ausgezogen, Funktions-Rümpfe unverändert.
//
// Inhalt: das Datenformat des `perspective-events`-Fence (Format-
// Konkretisierung PO 2026-07-15) mit Direktiven-Zeilen am Fence-Anfang
// (`view:`, `filter:`, `query:`) und Datenzeilen im Pipe-Format mit fester
// Spalten-Folge; dazu die weiche Validierung der Einträge und die Suche
// nach Fences im Dokument-Text. Eine `query:`-Direktive kennzeichnet die
// Aggregations-Art (Art 2); `query:` und Datenzeilen im selben Fence sind
// ein Struktur-Fehler. parse → serialize → parse ist bei fehlerfreier
// Struktur modell-identisch (Grundlage des Rückschreibens, Muster
// perspective-datatable.js).
//
// Fehler-Semantik wie die Datatable: Struktur-Fehler landen in
// model.errors (blockieren später den Editor, nie ein Wurf); Wert-Probleme
// einzelner Einträge sind weiche Hinweise (validateEventEntries) — der
// Eintrag bleibt erhalten und sichtbar.
//
// Import-Richtung: nur der Kern `events-core.js` wird geladen, nie ein
// Schwester-Modul. Prozess-neutral wie der Kern (CJS, kein Electron,
// kein DOM).
'use strict';

const { EVENT_CATEGORIES, daysBetweenParts, parseIsoDate } = require('./events-core.js');

// --- Fence-Datenformat ---------------------------------------------------------------

// Ansichts-Werte des `view:`-Parameters (Workshop-Punkt 7; Gantt als
// sechster Wert aus 4T-0722).
const EVENT_VIEWS = ['table', 'dashboard', 'month', 'week', 'timeline', 'gantt'];

// Spalten-Folge der Datenzeilen (Format-Konkretisierung PO 2026-07-15).
// Kennung/Vorgänger/Nachfolger bleiben leer, bis 4T-0516 die erste
// Verknüpfung schreibt.
const ENTRY_CELL_COUNT = 9;

// Zell-Escapes: `\\` Backslash, `\|` Pipe, `\n` Zeilenumbruch (Notizen sind
// mehrzeilig). Anders als die Datatable escapen wir auch den Backslash
// selbst — sonst wäre ein Zelltext, der literal auf "\" vor "|" endet,
// nicht verlustfrei abbildbar.
function escapeCell(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '\\n');
}

// Pipe-Zeile -> un-escapte Zell-Rohtexte (ein Durchlauf; führende und
// schließende Pipe sind Rahmen, fehlende schließende Pipe liest tolerant —
// Muster splitPipeRow der Datatable).
function splitEventRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') {
      const next = line[i + 1];
      if (next === '\\') {
        cur += '\\';
        i++;
        continue;
      }
      if (next === '|') {
        cur += '|';
        i++;
        continue;
      }
      if (next === 'n') {
        cur += '\n';
        i++;
        continue;
      }
      cur += ch;
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
  cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

// Kennungs-Listen (Vorgänger/Nachfolger) sind kommagetrennt.
function parseIdList(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// Gespeicherter Filter: `filter: Name := key=value; key=value`. Werte
// escapen `;` als `\;`. Schlüssel: text, categories (kommagetrennt,
// `none` = ohne Kategorie), from, to sowie die Flags notes, recurring,
// timespan (`x` = an). Struktur aus 4T-0490 Punkt 3 / Referenz-Analyse §4.
const FILTER_FLAG_KEYS = new Set(['notes', 'recurring', 'timespan']);
const FILTER_VALUE_KEYS = new Set(['text', 'categories', 'from', 'to']);

function emptyFilterSpec() {
  return {
    text: '',
    categories: [],
    from: '',
    to: '',
    notes: false,
    recurring: false,
    timespan: false,
  };
}

function splitFilterSpec(text) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === ';') {
      cur += ';';
      i++;
      continue;
    }
    if (ch === ';') {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function parseFilterDirective(rest, line, errors) {
  const sepIdx = rest.indexOf(':=');
  if (sepIdx < 0) {
    errors.push({ code: 'badFilter', line, detail: rest });
    return null;
  }
  const name = rest.slice(0, sepIdx).trim();
  if (name === '') {
    errors.push({ code: 'badFilter', line, detail: rest });
    return null;
  }
  const spec = emptyFilterSpec();
  for (const part of splitFilterSpec(rest.slice(sepIdx + 2))) {
    const eqIdx = part.indexOf('=');
    const key = (eqIdx >= 0 ? part.slice(0, eqIdx) : part).trim();
    const value = eqIdx >= 0 ? part.slice(eqIdx + 1).trim() : '';
    if (FILTER_FLAG_KEYS.has(key)) {
      spec[key] = value === '' || value === 'x';
      continue;
    }
    if (!FILTER_VALUE_KEYS.has(key)) {
      errors.push({ code: 'badFilter', line, detail: part });
      return null;
    }
    if (key === 'categories') spec.categories = parseIdList(value);
    else spec[key] = value;
  }
  return { name, spec };
}

function serializeFilterValue(value) {
  return String(value == null ? '' : value).replace(/;/g, '\\;');
}

function serializeFilterDirective(filter) {
  const spec = filter.spec || emptyFilterSpec();
  const parts = [];
  if (spec.text) parts.push(`text=${serializeFilterValue(spec.text)}`);
  if (spec.categories && spec.categories.length > 0) {
    parts.push(`categories=${spec.categories.join(',')}`);
  }
  if (spec.from) parts.push(`from=${serializeFilterValue(spec.from)}`);
  if (spec.to) parts.push(`to=${serializeFilterValue(spec.to)}`);
  if (spec.notes) parts.push('notes=x');
  if (spec.recurring) parts.push('recurring=x');
  if (spec.timespan) parts.push('timespan=x');
  return `filter: ${filter.name} := ${parts.join('; ')}`;
}

// Direktiven-Erkennung (Muster Datatable): `wort: rest` am Zeilenanfang.
const DIRECTIVE_RE = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/;

// Fence-Body -> Datenmodell { view, savedFilters, query, entries, errors }.
// view trägt den Roh-Wert (auch unbekannte Werte bleiben erhalten —
// Verlustfreiheit; effectiveEventsView liefert die wirksame Ansicht),
// query ist null (Art 1) oder der Abfrage-Text (Art 2, auch leer: alle
// Bereichs-Dateien mit Ereignis-Profil). Wirft nie.
function parsePerspectiveEvents(content) {
  const model = { view: null, savedFilters: [], query: null, entries: [], errors: [] };
  const lines = String(content || '').split(/\r?\n/);
  let sawQueryLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;
    if (trimmed === '') continue;
    if (trimmed.startsWith('|')) {
      const cells = splitEventRow(trimmed);
      if (cells.length > ENTRY_CELL_COUNT) {
        model.errors.push({ code: 'tooManyCells', line: lineNo, detail: trimmed });
        continue;
      }
      const get = (idx) => (idx < cells.length ? cells[idx] : '');
      model.entries.push({
        date: get(0),
        end: get(1),
        text: get(2),
        category: get(3),
        notes: get(4),
        recurring: get(5) !== '',
        id: get(6) || null,
        predecessors: parseIdList(get(7)),
        successors: parseIdList(get(8)),
        line: lineNo,
      });
      continue;
    }
    const dm = DIRECTIVE_RE.exec(trimmed);
    if (!dm) {
      model.errors.push({ code: 'badLine', line: lineNo, detail: trimmed });
      continue;
    }
    const directive = dm[1].toLowerCase();
    const rest = dm[2];
    if (directive === 'view') {
      if (model.view !== null) {
        model.errors.push({ code: 'duplicateDirective', line: lineNo, detail: directive });
        continue;
      }
      model.view = rest.trim();
      continue;
    }
    if (directive === 'filter') {
      const parsed = parseFilterDirective(rest, lineNo, model.errors);
      if (parsed) model.savedFilters.push(parsed);
      continue;
    }
    if (directive === 'query') {
      if (model.query !== null) {
        model.errors.push({ code: 'duplicateDirective', line: lineNo, detail: directive });
        continue;
      }
      model.query = rest.trim();
      sawQueryLine = lineNo;
      continue;
    }
    model.errors.push({ code: 'unknownDirective', line: lineNo, detail: directive });
  }
  // Art-Grenze: Abfrage und eingebettete Einträge schließen sich aus
  // (PO-Format-Konkretisierung 2026-07-15).
  if (model.query !== null && model.entries.length > 0) {
    model.errors.push({ code: 'queryWithEntries', line: sawQueryLine, detail: null });
  }
  return model;
}

// Wirksame Ansicht: bekannter view-Wert oder 'table' (unbekannte Werte
// bleiben im Modell erhalten, wirken aber nicht).
function effectiveEventsView(model) {
  const v = model && typeof model.view === 'string' ? model.view.toLowerCase() : '';
  return EVENT_VIEWS.includes(v) ? v : 'table';
}

// Datenmodell -> kanonischer Fence-Body. Direktiven zuerst (view nur wenn
// gesetzt), dann Datenzeilen mit stabiler Spalten-Ausrichtung (Leerzeichen-
// Padding, Muster Datatable). Grundlage jedes Rückschreibens.
function serializePerspectiveEvents(model) {
  const lines = [];
  if (model.view != null && String(model.view).trim() !== '') {
    lines.push(`view: ${String(model.view).trim()}`);
  }
  for (const filter of model.savedFilters || []) {
    lines.push(serializeFilterDirective(filter));
  }
  if (model.query !== null && model.query !== undefined) {
    lines.push(model.query === '' ? 'query:' : `query: ${model.query}`);
  }
  const rowTexts = (model.entries || []).map((e) => [
    escapeCell(e.date),
    escapeCell(e.end),
    escapeCell(e.text),
    escapeCell(e.category),
    escapeCell(e.notes),
    e.recurring ? 'x' : '',
    escapeCell(e.id == null ? '' : e.id),
    (e.predecessors || []).join(','),
    (e.successors || []).join(','),
  ]);
  const widths = [];
  for (let j = 0; j < ENTRY_CELL_COUNT; j++) {
    let w = 1;
    for (const r of rowTexts) {
      if (r[j].length > w) w = r[j].length;
    }
    widths.push(w);
  }
  for (const r of rowTexts) {
    lines.push(`| ${r.map((c, j) => c.padEnd(widths[j])).join(' | ')} |`);
  }
  return lines.join('\n');
}

// --- Weiche Validierung --------------------------------------------------------------

// Wert-Hinweise pro Eintrag (nie blockierend; Codes für lokalisierte
// Tooltips der Oberfläche): missingDate/invalidDate, invalidEnd,
// endBeforeDate, unknownCategory, missingText.
function validateEventEntries(entries) {
  const hints = [];
  for (const e of entries || []) {
    const date = parseIsoDate(e.date);
    if (String(e.date || '').trim() === '') {
      hints.push({ code: 'missingDate', line: e.line });
    } else if (!date) {
      hints.push({ code: 'invalidDate', line: e.line });
    }
    if (String(e.end || '').trim() !== '') {
      const end = parseIsoDate(e.end);
      if (!end) {
        hints.push({ code: 'invalidEnd', line: e.line });
      } else if (date && daysBetweenParts(date, end) < 0) {
        hints.push({ code: 'endBeforeDate', line: e.line });
      }
    }
    if (String(e.text || '').trim() === '') {
      hints.push({ code: 'missingText', line: e.line });
    }
    const cat = String(e.category || '').trim();
    if (cat !== '' && !EVENT_CATEGORIES.includes(cat)) {
      hints.push({ code: 'unknownCategory', line: e.line });
    }
  }
  return hints;
}

// --- Fence-Suche im Dokument-Text ------------------------------------------------------

// Alle `perspective-events`-Fences eines Dokument-Texts (Zeilennummern
// 1-basiert, body ohne abschließendes Newline) — Grundlage des Editor-
// Rückschreibens. Identische Semantik wie findPerspectiveDatatableFences
// (eingerückte Fences in Listen/Blockquotes bewusst nicht erfasst;
// ungeschlossener Fence läuft bis zum Datei-Ende).
function findPerspectiveEventsFences(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!m) continue;
    const marker = m[1][0];
    const len = m[1].length;
    const info = m[2].trim();
    if (open) {
      if (marker === open.marker && len >= open.len && info === '') {
        if (open.lang === 'perspective-events') {
          result.push({
            openLine: open.openLine,
            closeLine: i + 1,
            bodyStartLine: open.openLine + 1,
            bodyEndLine: i,
            body: lines.slice(open.openLine, i).join('\n'),
          });
        }
        open = null;
      }
      continue;
    }
    if (marker === '`' && info.includes('`')) continue;
    open = { marker, len, lang: info.split(/\s+/)[0], openLine: i + 1 };
  }
  if (open && open.lang === 'perspective-events') {
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
  EVENT_VIEWS,
  ENTRY_CELL_COUNT,
  emptyFilterSpec,
  parsePerspectiveEvents,
  serializePerspectiveEvents,
  effectiveEventsView,
  validateEventEntries,
  findPerspectiveEventsFences,
};
