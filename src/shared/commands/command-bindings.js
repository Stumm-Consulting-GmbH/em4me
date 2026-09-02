// 4T-000993 (Epic 3E-000196): Binding-Schicht der Kommando-Registry.
//
// Funktions-Auszug aus src/shared/commands/commands.js: Normalisierung von
// Accelerator-Strings und keydown-Ereignissen auf ein kanonisches
// Match-Format, Anzeige- und CodeMirror-Konvertierung, die fixen
// Nicht-Registry-Bindings samt Capture-Regel sowie das Zeitstempel-Format
// des Kommandos edit.insertTimestamp (es gehört zur Kommando-Schicht, nicht
// zu den deklarativen Registry-Daten). Die Registry selbst (COMMANDS,
// COMMAND_CATEGORIES) bleibt in commands.js als begründete Ausnahme des
// Datei-Größen-Budgets (Entscheidung E2 der Bestandsaufnahme 4T-000964).
//
// Bewusst ohne jeden Import: Das Modul kennt die Kommando-Liste nicht und
// arbeitet ausschließlich auf übergebenen Zeichenketten und Ereignissen.
// Die Import-Richtung ist damit einseitig commands.js -> command-bindings.js
// und zyklenfrei; die live mutierte COMMANDS-Referenz bleibt mit ihren
// Mutations-Funktionen in der Registry-Datei. Prozessneutral (CJS, ohne DOM
// und ohne Electron), damit Main (Menü-Accelerators), Preload und Renderer
// (Dispatcher, Tastenkürzel-Editor, Handbuch-Erzeugung) dasselbe Modul lesen.
//
// Verbraucher importieren direkt aus dieser Datei; commands.js exportiert die
// hier liegenden Namen NICHT erneut (Entscheidung E3: Fassaden nur als
// bewusste Subsystem-APIs).
//
// Die übernommenen Kommentare stehen unverändert im Wortlaut ihrer Herkunft.
'use strict';

// --- Binding-Normalisierung ---------------------------------------------------
// Kanonisches Match-Format: 'Ctrl+Alt+Shift+KEY' (Modifier in fixer
// Reihenfolge, Buchstaben gross, benannte Tasten in kanonischer Schreibung).
// Sowohl Accelerator-Strings aus der Registry/dem Store als auch keydown-
// Events werden auf dieses Format abgebildet; der Dispatcher vergleicht
// per O(1)-Map-Lookup.

const MODIFIER_ALIASES = new Map([
  ['cmdorctrl', 'ctrl'],
  ['commandorcontrol', 'ctrl'],
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  // Windows-only-App: Cmd/Super/Meta werden pragmatisch wie Ctrl behandelt,
  // damit fremd geschriebene Accelerators nicht stillschweigend zerfallen.
  ['cmd', 'ctrl'],
  ['command', 'ctrl'],
  ['super', 'ctrl'],
  ['meta', 'ctrl'],
  ['alt', 'alt'],
  ['altgr', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
]);

// Kanonische Schreibweise benannter Tasten (Match-Format). Einzelzeichen
// laufen separat (Grossschreibung).
const KEY_ALIASES = new Map([
  ['plus', 'Plus'],
  ['space', 'Space'],
  ['esc', 'Escape'],
  ['escape', 'Escape'],
  ['return', 'Enter'],
  ['enter', 'Enter'],
  ['tab', 'Tab'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['del', 'Delete'],
  ['insert', 'Insert'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['arrowup', 'Up'],
  ['arrowdown', 'Down'],
  ['arrowleft', 'Left'],
  ['arrowright', 'Right'],
]);

// Zerlegt einen Binding-String an '+', wobei ein literales '+' als Taste
// erhalten bleibt ('Ctrl++' -> ['Ctrl', '+']).
function splitBindingTokens(binding) {
  const raw = String(binding == null ? '' : binding);
  const tokens = [];
  let cur = '';
  for (const ch of raw) {
    if (ch === '+') {
      if (cur === '') {
        tokens.push('+');
      } else {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur !== '') tokens.push(cur);
  return tokens;
}

function canonicalKeyName(token) {
  const lower = token.toLowerCase();
  if (KEY_ALIASES.has(lower)) return KEY_ALIASES.get(lower);
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();
  if (token.length === 1) {
    if (token === '+') return 'Plus';
    return token.toUpperCase();
  }
  return token;
}

// Accelerator-/Binding-String -> kanonisches Match-Format oder null bei
// leerem/unbrauchbarem Eintrag (z.B. nur Modifier).
function normalizeBinding(binding) {
  const tokens = splitBindingTokens(binding);
  if (tokens.length === 0) return null;
  let ctrl = false;
  let alt = false;
  let shift = false;
  let key = null;
  for (const token of tokens) {
    const mod = MODIFIER_ALIASES.get(token.toLowerCase());
    if (mod === 'ctrl') ctrl = true;
    else if (mod === 'alt') alt = true;
    else if (mod === 'shift') shift = true;
    else key = canonicalKeyName(token);
  }
  if (!key) return null;
  return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '') + key;
}

// Tasten, die fuer sich genommen reine Modifier sind: keydown-Events dazu
// ergeben kein Binding.
const MODIFIER_EVENT_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'AltGraph',
  'OS',
  'Hyper',
  'Super',
]);

// keydown-Event -> kanonisches Match-Format (identisch zum Ergebnis von
// normalizeBinding) oder null bei reinem Modifier-Druck.
function eventToBinding(e) {
  if (!e || typeof e.key !== 'string' || e.key === '') return null;
  if (MODIFIER_EVENT_KEYS.has(e.key)) return null;
  let key = e.key;
  if (key === ' ') key = 'Space';
  else key = canonicalKeyName(key);
  const ctrl = !!(e.ctrlKey || e.metaKey);
  const alt = !!e.altKey;
  const shift = !!e.shiftKey;
  return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '') + key;
}

// Symbol-Tasten brauchen je nach Layout Shift (z.B. '+' auf englischer
// Tastatur als Shift+'='). Fuer solche Events versucht der Dispatcher
// zusaetzlich einen Lookup ohne Shift-Modifier — das erhaelt das bisherige
// Verhalten der Zoom-Hotkeys (4T-000017) layoutunabhaengig.
function isShiftSymbolEvent(e) {
  return (
    !!e &&
    !!e.shiftKey &&
    typeof e.key === 'string' &&
    e.key.length === 1 &&
    !/^[a-zA-Z0-9]$/.test(e.key)
  );
}

function stripShiftFromBinding(normalized) {
  return String(normalized || '').replace('Shift+', '');
}

// --- Anzeige-Konvertierung -------------------------------------------------------
// Binding -> deutscher Anzeige-String fuer die bestehende Hilfe-Pipeline
// (splitShortcutKeys + localizeKey in autocomplete-help.js uebersetzen die
// deutschen Tokens in die aktive Sprache). 'Ctrl+Shift+I' -> 'Strg+Umschalt+I',
// 'Ctrl+Plus' -> 'Strg++', 'Ctrl+Alt+Right' -> 'Strg+Alt+→'.
const DISPLAY_KEY_MAP = new Map([
  ['Plus', '+'],
  ['Right', '→'],
  ['Left', '←'],
  ['Up', '↑'],
  ['Down', '↓'],
  ['Escape', 'Esc'],
  // 4T-000850 (Epic 3E-000147): Bild-Tasten der Buch-Leseführung. Ohne Eintrag
  // erschienen sie in der Tastenkürzel-Seite als 'PageUp'/'PageDown' und
  // ließen sich nicht übersetzen (KEY_LABEL_KEY in manual-generated.js
  // schlüsselt über genau diese deutschen Anzeige-Tokens).
  ['PageUp', 'Bild auf'],
  ['PageDown', 'Bild ab'],
]);

function bindingToDisplayString(binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return '';
  const parts = [];
  let rest = normalized;
  if (rest.startsWith('Ctrl+')) {
    parts.push('Strg');
    rest = rest.slice(5);
  }
  if (rest.startsWith('Alt+')) {
    parts.push('Alt');
    rest = rest.slice(4);
  }
  if (rest.startsWith('Shift+')) {
    parts.push('Umschalt');
    rest = rest.slice(6);
  }
  parts.push(DISPLAY_KEY_MAP.has(rest) ? DISPLAY_KEY_MAP.get(rest) : rest);
  return parts.join('+');
}

// Binding -> CodeMirror-Keymap-Spezifikation ('Ctrl-Shift-[') fuer die
// editorScoped-Kommandos. Buchstaben klein (CM-Konvention), benannte
// Tasten in CM-Schreibweise (ArrowRight etc.).
const CM_KEY_MAP = new Map([
  ['Plus', '+'],
  ['Right', 'ArrowRight'],
  ['Left', 'ArrowLeft'],
  ['Up', 'ArrowUp'],
  ['Down', 'ArrowDown'],
]);

function acceleratorToCmKey(binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return null;
  const parts = [];
  let rest = normalized;
  if (rest.startsWith('Ctrl+')) {
    parts.push('Ctrl');
    rest = rest.slice(5);
  }
  if (rest.startsWith('Alt+')) {
    parts.push('Alt');
    rest = rest.slice(4);
  }
  if (rest.startsWith('Shift+')) {
    parts.push('Shift');
    rest = rest.slice(6);
  }
  let key = rest;
  if (CM_KEY_MAP.has(key)) key = CM_KEY_MAP.get(key);
  else if (/^[A-Z]$/.test(key)) key = key.toLowerCase();
  parts.push(key);
  return parts.join('-');
}

// --- Capture-Regeln (4T-000208) -----------------------------------------------------
// Die Konflikt-Erkennung, die diese Liste gegen die Registry hält, läuft über
// die COMMANDS-Liste und liegt deshalb in commands.js.
//
// Fixe Nicht-Registry-Bindings: kontextgebundene App-Semantik (Esc-Kaskade,
// Listen-/Tabellen-Indent, Such-Enter). Beim Capture gelten sie als Konflikt
// und sind nur abbrechbar, nicht ueberschreibbar. Alt allein und Maus-
// Bindings koennen gar nicht erfasst werden (reiner Modifier bzw. kein
// Tastatur-Event) und brauchen keinen Eintrag.
const FIXED_BINDINGS = [
  { binding: 'Tab', descKey: 'help.shortcut.tabIndent' },
  { binding: 'Shift+Tab', descKey: 'help.shortcut.tabIndent' },
  { binding: 'Enter', descKey: 'help.shortcut.searchNavEnter' },
  { binding: 'Shift+Enter', descKey: 'help.shortcut.searchNavEnter' },
  { binding: 'Alt+Enter', descKey: 'help.shortcut.replaceAll' },
  { binding: 'Escape', descKey: 'help.shortcut.escape' },
];

// Sperr-Regel fuer das Capture (4T-000208, Entscheidungspunkt 3 als Regel
// statt erschoepfender Liste): ohne Strg- oder Alt-Modifier sind nur
// F-Tasten zulaessig. Modifierlose Zeichen-Tasten (auch mit Umschalt)
// wuerden das normale Tippen kapern; nacktes Tab/Esc/Enter faellt damit
// ebenfalls weg.
function isBindingCapturable(binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return false;
  let rest = normalized;
  let hasStrongModifier = false;
  if (rest.startsWith('Ctrl+')) {
    hasStrongModifier = true;
    rest = rest.slice(5);
  }
  if (rest.startsWith('Alt+')) {
    hasStrongModifier = true;
    rest = rest.slice(4);
  }
  if (rest.startsWith('Shift+')) rest = rest.slice(6);
  if (hasStrongModifier) return true;
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(rest);
}

// --- Timestamp-Format -------------------------------------------------------------
// Lokalzeit-Timestamp 'yyyy-mm-dd hh:mm' fuer das Kommando
// edit.insertTimestamp. Bewusst Lokalzeit statt UTC: Notiz-Text in der
// Zeitrealitaet des Nutzers, keine persistierten Daten (Epic-Entscheidung;
// die UTC-Konvention der project-standards gilt hier nicht).
function formatTimestamp(date) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  FIXED_BINDINGS,
  normalizeBinding,
  eventToBinding,
  isShiftSymbolEvent,
  stripShiftFromBinding,
  bindingToDisplayString,
  acceleratorToCmKey,
  isBindingCapturable,
  formatTimestamp,
};
