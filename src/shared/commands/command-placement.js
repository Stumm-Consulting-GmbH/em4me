// 4T-000520 (Epic 3E-000094): Datenmodell der Kommando-Platzierung.
//
// Gemeinsames Eintrag-Modell für nutzerdefinierte Kommando-Zugänge
// (Statusbar-Buttons und Kontextmenü-Sektion teilen dieselbe Form), die
// Hide-Liste der Standard-Statusbar-Elemente und die Makro-Definitionen.
// Persistiert als EIN Store-Objekt unter 'commandPlacement'; die
// Reihenfolge der Einträge ist die Array-Reihenfolge (kein eigenes
// Reihenfolge-Feld — die Einstellungs-Listen sortieren per Hoch/Runter).
// Prozessneutral (CJS, keine DOM-/Electron-Abhängigkeit), Muster
// panel-access.js: defensive Normalisierung nach dem Vorbild
// normalizePanelToggleOrder — defekte oder unbekannte Anteile fallen
// still auf den Default zurück, gültige bleiben erhalten.
'use strict';

const { PANEL_ACCESS } = require('../panel-access.js');
const { COMMAND_ICON_IDS, DEFAULT_COMMAND_ICON } = require('./command-icons.js');

const COMMAND_PLACEMENT_KEY = 'commandPlacement';
const COMMAND_PLACEMENT_EXTENSION_ID = 'command-placement';

// Makro-Konstanten (4T-000522 nutzt Runner und Registrierung): Verzögerung
// pro Schritt 0–10 s (PO-Festlegung), Aufruf-Kette Makro-in-Makro auf
// fünf Ebenen begrenzt (Rekursions-Schutz mit Statusbar-Hinweis), IDs der
// dynamischen Registry-Kommandos im Namensraum 'macro.'.
const MACRO_MAX_DELAY_SECONDS = 10;
const MACRO_MAX_CALL_DEPTH = 5;
const MACRO_COMMAND_PREFIX = 'macro.';

function macroCommandId(macroId) {
  return MACRO_COMMAND_PREFIX + String(macroId || '');
}

// --- Hide-Ziele der Statusbar ----------------------------------------------------
// Alle ausblendbaren Standard-Elemente; nur die Hinweis-Zeile
// (#statusbar-hint) fehlt bewusst — sie ist der einzige Warn-Kanal
// (PO-Festlegung, Workshop-Punkt 2). Panel-Toggles kommen aus dem
// Zugangs-Modell (keine zweite Pflege-Liste); Ansichts-Buttons haben
// keine Element-IDs und werden über data-view selektiert. labelKey nutzt
// vorhandene Menü- bzw. Katalog-Kurznamen-Keys (keine Doppel-Pflege).
const STATUSBAR_HIDE_TARGETS = [
  ...PANEL_ACCESS.map((p) => ({
    key: 'panel:' + p.id,
    elementId: p.buttonId,
    labelKey: p.titleKey,
  })),
  { key: 'toggle:foldGutter', elementId: 'btn-fold-gutter', labelKey: 'menu.view.foldGutter' },
  { key: 'toggle:lineNumbers', elementId: 'btn-numbers', labelKey: 'menu.view.lineNumbers' },
  { key: 'toggle:wordWrap', elementId: 'btn-wrap', labelKey: 'menu.view.wordWrap' },
  {
    key: 'view:live',
    selector: '.view-toggle .view-btn[data-view="live"]',
    labelKey: 'menu.view.live',
  },
  {
    key: 'view:source',
    selector: '.view-toggle .view-btn[data-view="source"]',
    labelKey: 'menu.view.source',
  },
  {
    key: 'view:split',
    selector: '.view-toggle .view-btn[data-view="split"]',
    labelKey: 'menu.view.split',
  },
  {
    key: 'view:rendered',
    selector: '.view-toggle .view-btn[data-view="rendered"]',
    labelKey: 'menu.view.rendered',
  },
  {
    key: 'right:wordCount',
    elementId: 'statusbar-wordcount',
    labelKey: 'help.featureName.wordCount',
  },
  { key: 'right:zoom', elementId: 'zoom-indicator', labelKey: 'help.featureName.zoom' },
  { key: 'right:edit', elementId: 'btn-edit', labelKey: 'menu.view.edit' },
  { key: 'right:scrollSync', elementId: 'btn-scroll-sync', labelKey: 'menu.view.scrollSync' },
  { key: 'right:history', elementId: 'btn-history', labelKey: 'help.featureName.history' },
  { key: 'right:theme', elementId: 'btn-theme', labelKey: 'help.featureName.theme' },
  { key: 'right:language', elementId: 'lang-select', labelKey: 'help.featureName.languages' },
];

const HIDE_TARGET_KEYS = new Set(STATUSBAR_HIDE_TARGETS.map((t) => t.key));

function hideTargetByKey(key) {
  return STATUSBAR_HIDE_TARGETS.find((t) => t.key === key) || null;
}

// --- Normalisierung --------------------------------------------------------------

function defaultCommandPlacement() {
  return { statusbar: [], contextMenu: [], macros: [], hiddenButtons: [] };
}

// Ein Platzierungs-Eintrag: { commandId, icon, label }. label null =
// kein eigener Anzeigename (Tooltip/Menü zeigen das Kommando-Label).
function normalizePlacementEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.commandId !== 'string' || raw.commandId === '') return null;
  const icon =
    typeof raw.icon === 'string' && COMMAND_ICON_IDS.includes(raw.icon)
      ? raw.icon
      : DEFAULT_COMMAND_ICON;
  const label = typeof raw.label === 'string' && raw.label.trim() !== '' ? raw.label.trim() : null;
  return { commandId: raw.commandId, icon, label };
}

function normalizeEntryList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePlacementEntry).filter(Boolean);
}

// Makro-Schritte: { type: 'command', commandId } oder { type: 'delay',
// seconds } (0–10 s, auf Zehntel gerundet). Unbekannte Typen entfallen.
function normalizeMacroStep(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.type === 'command') {
    if (typeof raw.commandId !== 'string' || raw.commandId === '') return null;
    return { type: 'command', commandId: raw.commandId };
  }
  if (raw.type === 'delay') {
    const seconds = Number(raw.seconds);
    if (!Number.isFinite(seconds)) return null;
    const clamped = Math.min(MACRO_MAX_DELAY_SECONDS, Math.max(0, seconds));
    return { type: 'delay', seconds: Math.round(clamped * 10) / 10 };
  }
  return null;
}

// Ein Makro: { id, name, icon, steps }. Die ID ist der stabile Teil des
// dynamischen Kommandos macro.<id> und muss dem Registry-ID-Muster
// (alphanumerisch) genügen; Name ist Pflicht (Anzeige in Palette,
// Kürzel-Editor und Einstellungen).
function normalizeMacro(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(raw.id)) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : null;
  if (!name) return null;
  const icon =
    typeof raw.icon === 'string' && COMMAND_ICON_IDS.includes(raw.icon)
      ? raw.icon
      : DEFAULT_COMMAND_ICON;
  const steps = Array.isArray(raw.steps) ? raw.steps.map(normalizeMacroStep).filter(Boolean) : [];
  return { id: raw.id, name, icon, steps };
}

function normalizeMacros(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    const macro = normalizeMacro(m);
    if (!macro || seen.has(macro.id)) continue;
    seen.add(macro.id);
    out.push(macro);
  }
  return out;
}

function normalizeHiddenButtons(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const key of raw) {
    if (typeof key !== 'string' || !HIDE_TARGET_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function normalizeCommandPlacement(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    statusbar: normalizeEntryList(src.statusbar),
    contextMenu: normalizeEntryList(src.contextMenu),
    macros: normalizeMacros(src.macros),
    hiddenButtons: normalizeHiddenButtons(src.hiddenButtons),
  };
}

// 4T-000521: Sichtbarkeits-Kern der Kontextmenü-Sektion (und identisch der
// Statusbar-Buttons): Einträge unbekannter Kommandos (z.B. gelöschtes
// Makro) und Kommandos deaktivierter Erweiterungen erscheinen NICHT
// (Konsistenz zu Menü und Palette; die Konfiguration bleibt erhalten).
// Kontextbedingt nicht ausführbare Einträge bleiben sichtbar und werden
// vom Aufrufer deaktiviert dargestellt.
function visibleContextMenuEntries(entries, disabledCommandIds, knownCommandIds) {
  if (!Array.isArray(entries)) return [];
  const disabled = disabledCommandIds || new Set();
  const known = knownCommandIds || new Set();
  return entries.filter((e) => known.has(e.commandId) && !disabled.has(e.commandId));
}

module.exports = {
  COMMAND_PLACEMENT_KEY,
  COMMAND_PLACEMENT_EXTENSION_ID,
  MACRO_MAX_DELAY_SECONDS,
  MACRO_MAX_CALL_DEPTH,
  MACRO_COMMAND_PREFIX,
  macroCommandId,
  STATUSBAR_HIDE_TARGETS,
  hideTargetByKey,
  defaultCommandPlacement,
  normalizePlacementEntry,
  normalizeMacroStep,
  normalizeMacro,
  normalizeCommandPlacement,
  visibleContextMenuEntries,
};
