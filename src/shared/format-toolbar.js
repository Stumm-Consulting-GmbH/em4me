// 4T-0607 (Epic 3E-0114): Datenmodell der Format-Toolbar.
//
// Belegung der Leiste oberhalb des Editors als Eintrags-Liste. Drei
// Eintrags-Typen: Kommando-Einträge im Eintrag-Modell der Kommando-
// Platzierung ({ commandId, icon, label } — Nachnutzung von
// normalizePlacementEntry, keine zweite Normalisierung), Trenner
// ({ type: 'separator' }) als optisches Gruppierungs-Element und das
// Überschrift-Menü ({ type: 'headings' }) als gebündelter Zugang zu den
// paragraph.heading*-Kommandos. Die Array-Reihenfolge ist die Anzeige-
// Reihenfolge (kein eigenes Reihenfolge-Feld, Muster command-placement).
// Persistiert als EIN Store-Objekt unter 'formatToolbar'. Prozessneutral
// (CJS, keine DOM-/Electron-Abhängigkeit), defensive Normalisierung nach
// dem Muster normalizeCommandPlacement: defekte oder unbekannte Anteile
// entfallen still, eine insgesamt defekte Konfiguration fällt auf die
// kuratierte Standard-Belegung zurück.
'use strict';

const { normalizePlacementEntry } = require('./commands/command-placement.js');

const FORMAT_TOOLBAR_KEY = 'formatToolbar';
const FORMAT_TOOLBAR_EXTENSION_ID = 'toolbar';

// Kuratierte Standard-Belegung (PO-Freigabe der Liste aus
// Architekturentscheidung 3 des Epics; Gruppierung per Trenner:
// Zeichen-Formate | Überschrift-Menü | Listen | Zitat | Links | Tabelle).
function defaultFormatToolbarEntries() {
  return [
    { type: 'command', commandId: 'format.bold', icon: 'bold', label: null },
    { type: 'command', commandId: 'format.italic', icon: 'italic', label: null },
    { type: 'command', commandId: 'format.strikethrough', icon: 'strikethrough', label: null },
    { type: 'command', commandId: 'format.highlight', icon: 'highlighter', label: null },
    { type: 'command', commandId: 'format.code', icon: 'code', label: null },
    { type: 'separator' },
    { type: 'headings' },
    { type: 'separator' },
    { type: 'command', commandId: 'paragraph.bulletList', icon: 'list', label: null },
    { type: 'command', commandId: 'paragraph.orderedList', icon: 'list-ordered', label: null },
    { type: 'command', commandId: 'paragraph.taskList', icon: 'list-todo', label: null },
    { type: 'separator' },
    { type: 'command', commandId: 'paragraph.quote', icon: 'quote', label: null },
    { type: 'separator' },
    { type: 'command', commandId: 'link.insertWiki', icon: 'brackets', label: null },
    { type: 'command', commandId: 'link.insertExternal', icon: 'external-link', label: null },
    { type: 'separator' },
    { type: 'command', commandId: 'insert.table', icon: 'table', label: null },
    // 4T-1309 (Epic 3E-0235): unmittelbar neben der einfachen Tabelle, weil
    // beide dieselbe Frage beantworten und die Wahl zwischen ihnen am Ort
    // der Entscheidung stehen soll.
    {
      type: 'command',
      commandId: 'insert.perspectiveTable',
      icon: 'table-merged',
      label: null,
    },
  ];
}

function defaultFormatToolbar() {
  return { entries: defaultFormatToolbarEntries() };
}

// Ein Eintrag: Trenner und Überschrift-Menü tragen nur ihren Typ;
// Kommando-Einträge (type 'command' oder typloses Alt-Format mit
// commandId) laufen durch normalizePlacementEntry. Unbekanntes entfällt.
function normalizeFormatToolbarEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.type === 'separator') return { type: 'separator' };
  if (raw.type === 'headings') return { type: 'headings' };
  if (raw.type === 'command' || raw.type === undefined) {
    const entry = normalizePlacementEntry(raw);
    return entry ? { type: 'command', ...entry } : null;
  }
  return null;
}

// Gesamt-Normalisierung. Eine bewusst leere Liste bleibt leer; nur eine
// strukturell defekte Konfiguration (kein Objekt, entries kein Array)
// fällt auf die Standard-Belegung zurück.
function normalizeFormatToolbar(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.entries)) {
    return defaultFormatToolbar();
  }
  return { entries: raw.entries.map(normalizeFormatToolbarEntry).filter(Boolean) };
}

// Trenner-Bereinigung für die Anzeige: keine führenden/abschließenden
// Trenner, keine Doppel-Trenner (entstehen, wenn Kommando-Einträge einer
// Gruppe herausgefiltert wurden).
function collapseToolbarSeparators(entries) {
  const out = [];
  for (const entry of entries) {
    if (entry.type === 'separator') {
      if (out.length === 0 || out[out.length - 1].type === 'separator') continue;
      out.push(entry);
    } else {
      out.push(entry);
    }
  }
  while (out.length > 0 && out[out.length - 1].type === 'separator') out.pop();
  return out;
}

// Sichtbarkeits-Kern (Muster visibleContextMenuEntries): Kommando-
// Einträge unbekannter Kommandos und Kommandos deaktivierter
// Erweiterungen erscheinen nicht (Konsistenz zu Menü und Palette; die
// Konfiguration bleibt erhalten). Trenner und Überschrift-Menü bleiben,
// überzählige Trenner werden bereinigt.
function visibleFormatToolbarEntries(entries, disabledCommandIds, knownCommandIds) {
  if (!Array.isArray(entries)) return [];
  const disabled = disabledCommandIds || new Set();
  const known = knownCommandIds || new Set();
  const filtered = entries.filter(
    (e) => e.type !== 'command' || (known.has(e.commandId) && !disabled.has(e.commandId)),
  );
  return collapseToolbarSeparators(filtered);
}

module.exports = {
  FORMAT_TOOLBAR_KEY,
  FORMAT_TOOLBAR_EXTENSION_ID,
  defaultFormatToolbarEntries,
  defaultFormatToolbar,
  normalizeFormatToolbarEntry,
  normalizeFormatToolbar,
  collapseToolbarSeparators,
  visibleFormatToolbarEntries,
};
