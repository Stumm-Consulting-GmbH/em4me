// 4T-000464 (Epic 3E-000086): Slot-Modell und Schema-Verwaltung der Farbschemas.
//
// Single Source of Truth für die kuratierte Farb-Slot-Liste und das
// Schema-Datenmodell. Ein Farbschema ist ein benanntes Set von Farbwerten
// über die Slots; jeder Slot speist eine oder mehrere der bestehenden
// Theme-CSS-Variablen (styles.css :root / [data-theme='dark']). Die
// Slot-Liste ist die stabile öffentliche Schnittstelle; die internen
// Variablen bleiben frei umbaubar (PO-Entscheidung 2026-07-08).
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM) — Main (Broadcast), Preload, Renderer (Anwendung, Settings-UI)
// und die Tests laden dasselbe Modul. Die eigentliche Anwendung auf das
// Wurzel-Element (root.style.setProperty) lebt im Renderer-Modul
// modules/color-schemes.js (4T-000465); hier nur die Berechnung, welche
// Variablen zu setzen bzw. zu räumen sind (computeSchemeVars).
//
// Modell A (PO-Freigabe 2026-07-13): Slots bilden auf Bestands-Variablen ab;
// der gerenderte Inhalt folgt automatisch mit (Links = Akzent, Überschriften-
// Text = Haupttext, Zitat-Balken = kräftiger Rahmen). Mitgelieferte Schemas
// sind unveränderlich und dienen als Kopier-Vorlage; eigene Schemas speichern
// nur die vom Basis-Schema abweichenden Slots (robust gegen künftige Slot-
// Ergänzungen). Ein Standard-Schema hat keine Abweichungen: die Anwendung
// räumt dann alle Slot-Variablen und lässt die Stylesheet-Werte gelten —
// garantiert pixel-identisches Bestandsverhalten.
'use strict';

// Basis-Paletten je Modus. Spiegeln exakt die heutigen Werte aus
// src/renderer/styles.css (:root für hell, [data-theme='dark'] für dunkel);
// der Wächter in test/unit/color-schemes.test.js prüft diese Gleichheit gegen
// styles.css und schlägt bei Drift an.
const BASE_DEFAULTS = {
  light: {
    bg: '#ffffff',
    surface: '#f5f5f5',
    muted: '#e8e8e8',
    toolbar: '#fafafa',
    text: '#1f1f1f',
    textMuted: '#6a6a6a',
    accent: '#0a66c2',
    accentFg: '#ffffff',
    border: '#e0e0e0',
    borderStrong: '#c8c8c8',
    tabBar: '#ececec',
    tabActive: '#ffffff',
    codeBg: '#f6f8fa',
    linterWarn: '#c97a00',
    // 4T-001314 (Epic 3E-000235): Die elf Farben, mit denen der Editor den
    // Markdown-Text auszeichnet. Werte unveraendert aus dem Stilblatt;
    // der Drift-Waechter prueft die Gleichheit.
    syntaxHeading: '#0969da',
    syntaxLink: '#0969da',
    syntaxUrl: '#57606a',
    syntaxCode: '#d73a49',
    syntaxMeta: '#57606a',
    syntaxList: '#1a7f37',
    syntaxQuote: '#6a737d',
    syntaxComment: '#6a737d',
    syntaxKeyword: '#cf222e',
    syntaxString: '#0a3069',
    syntaxNumber: '#0550ae',
  },
  dark: {
    bg: '#1e1e1e',
    surface: '#252526',
    muted: '#2d2d2d',
    toolbar: '#2a2a2a',
    text: '#e6e6e6',
    textMuted: '#9d9d9d',
    accent: '#4ea2ff',
    accentFg: '#0b1f33',
    border: '#3a3a3a',
    borderStrong: '#4d4d4d',
    tabBar: '#2d2d2d',
    tabActive: '#1e1e1e',
    codeBg: '#2a2a2a',
    linterWarn: '#e8a544',
    // 4T-001314 (Epic 3E-000235): Die elf Farben, mit denen der Editor den
    // Markdown-Text auszeichnet. Werte unveraendert aus dem Stilblatt;
    // der Drift-Waechter prueft die Gleichheit.
    syntaxHeading: '#79c0ff',
    syntaxLink: '#79c0ff',
    syntaxUrl: '#8b949e',
    syntaxCode: '#ffa657',
    syntaxMeta: '#8b949e',
    syntaxList: '#7ee787',
    syntaxQuote: '#8b949e',
    syntaxComment: '#8b949e',
    syntaxKeyword: '#ff7b72',
    syntaxString: '#a5d6ff',
    syntaxNumber: '#79c0ff',
  },
};

// Slot-Gruppen in Anzeige-Reihenfolge des Einstellungs-Bereichs.
const SLOT_GROUPS = [
  { id: 'surface', nameKey: 'settings.colorSchemes.group.surface' },
  { id: 'text', nameKey: 'settings.colorSchemes.group.text' },
  { id: 'accent', nameKey: 'settings.colorSchemes.group.accent' },
  { id: 'tabs', nameKey: 'settings.colorSchemes.group.tabs' },
  { id: 'content', nameKey: 'settings.colorSchemes.group.content' },
  // 4T-001314 (Epic 3E-000235): Die Farben der Markdown-Auszeichnung im Editor.
  { id: 'editorText', nameKey: 'settings.colorSchemes.group.editorText' },
];

// Kuratierte Slot-Liste. `vars` ist die Liste der gespeisten CSS-Variablen;
// die erste ist die Leit-Variable (ihr Wert trägt die Basis-Palette und den
// Farbwähler-Vorschauwert). Mehrere Variablen an einem Slot ziehen gemeinsam.
const COLOR_SLOTS = [
  { id: 'bg', group: 'surface', nameKey: 'settings.colorSchemes.slot.bg', vars: ['--bg'] },
  {
    id: 'surface',
    group: 'surface',
    nameKey: 'settings.colorSchemes.slot.surface',
    vars: ['--bg-alt'],
  },
  {
    id: 'muted',
    group: 'surface',
    nameKey: 'settings.colorSchemes.slot.muted',
    vars: ['--bg-muted', '--hover'],
  },
  {
    id: 'toolbar',
    group: 'surface',
    nameKey: 'settings.colorSchemes.slot.toolbar',
    vars: ['--bg-toolbar'],
  },
  { id: 'text', group: 'text', nameKey: 'settings.colorSchemes.slot.text', vars: ['--fg'] },
  {
    id: 'textMuted',
    group: 'text',
    nameKey: 'settings.colorSchemes.slot.textMuted',
    vars: ['--fg-muted'],
  },
  {
    id: 'accent',
    group: 'accent',
    nameKey: 'settings.colorSchemes.slot.accent',
    vars: ['--accent'],
  },
  {
    id: 'accentFg',
    group: 'accent',
    nameKey: 'settings.colorSchemes.slot.accentFg',
    vars: ['--accent-fg'],
  },
  {
    id: 'border',
    group: 'accent',
    nameKey: 'settings.colorSchemes.slot.border',
    vars: ['--border'],
  },
  {
    id: 'borderStrong',
    group: 'accent',
    nameKey: 'settings.colorSchemes.slot.borderStrong',
    vars: ['--border-strong'],
  },
  { id: 'tabBar', group: 'tabs', nameKey: 'settings.colorSchemes.slot.tabBar', vars: ['--tab-bg'] },
  {
    id: 'tabActive',
    group: 'tabs',
    nameKey: 'settings.colorSchemes.slot.tabActive',
    vars: ['--tab-active-bg'],
  },
  {
    id: 'codeBg',
    group: 'content',
    nameKey: 'settings.colorSchemes.slot.codeBg',
    vars: ['--code-bg'],
  },
  {
    id: 'linterWarn',
    group: 'content',
    nameKey: 'settings.colorSchemes.slot.linterWarn',
    vars: ['--linter-warn'],
  },

  // 4T-001314 (Epic 3E-000235): Editor-Textfarben. Sie speisen dieselben
  // Variablen wie bisher das Stilblatt; die Zuordnung zu den Markdown-
  // Rollen liegt unveraendert in der Hervorhebungs-Definition des Editors.
  {
    id: 'syntaxHeading',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxHeading',
    vars: ['--syntax-heading'],
  },
  {
    id: 'syntaxLink',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxLink',
    vars: ['--syntax-link'],
  },
  {
    id: 'syntaxUrl',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxUrl',
    vars: ['--syntax-url'],
  },
  {
    id: 'syntaxCode',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxCode',
    vars: ['--syntax-code'],
  },
  {
    id: 'syntaxMeta',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxMeta',
    vars: ['--syntax-meta'],
  },
  {
    id: 'syntaxList',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxList',
    vars: ['--syntax-list'],
  },
  {
    id: 'syntaxQuote',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxQuote',
    vars: ['--syntax-quote'],
  },
  {
    id: 'syntaxComment',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxComment',
    vars: ['--syntax-comment'],
  },
  {
    id: 'syntaxKeyword',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxKeyword',
    vars: ['--syntax-keyword'],
  },
  {
    id: 'syntaxString',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxString',
    vars: ['--syntax-string'],
  },
  {
    id: 'syntaxNumber',
    group: 'editorText',
    nameKey: 'settings.colorSchemes.slot.syntaxNumber',
    vars: ['--syntax-number'],
  },
];

const SLOT_IDS = COLOR_SLOTS.map((s) => s.id);
const SLOT_ID_SET = new Set(SLOT_IDS);

// Abgeleitete Variable: die transparente Akzent-Variante (Pillen-Hintergrund)
// wird aus dem Akzent-Slot berechnet, damit sie mitzieht. Alpha je Modus wie
// in styles.css (hell 0.12, dunkel 0.18).
const ACCENT_SOFT_VAR = '--accent-soft';
const ACCENT_SOFT_ALPHA = { light: 0.12, dark: 0.18 };

// 4T-001314 (Epic 3E-000235): Die mitgelieferten Vorlagen liegen seit ihrem
// Wachstum um die Editor-Textfarben in color-schemes-vorlagen.js; dieses
// Modul reicht sie unverändert weiter, damit die Aufrufer unberührt bleiben.
const { BUILTIN_SCHEMES } = require('./color-schemes-vorlagen.js');

// Store-Schlüssel des gesamten Farbschema-Zustands (ein Objekt, ein Broadcast).
const COLOR_SCHEMES_KEY = 'colorSchemes';

// 4T-000751 (Epic 3E-000146): Bernstein ist der Auslieferungszustand. Dasselbe
// Paar dient als Rückfall bei unbekanntem oder Basis-fremdem Verweis
// (Entscheidung des Product Owners vom 2026-07-27: der Rückfall wandert mit,
// Voreinstellung und Reparatur-Zustand bleiben derselbe Wert). Zuvor zeigten
// beide Rollen auf standard-light/standard-dark.
const DEFAULT_LIGHT_ID = 'amber-light';
const DEFAULT_DARK_ID = 'amber-dark';

// Schemas, auf die bestehende Installationen festgeschrieben werden, damit die
// Umstellung sie nicht mitzieht (siehe startupSchemeState).
const PREVIOUS_DEFAULT_LIGHT_ID = 'standard-light';
const PREVIOUS_DEFAULT_DARK_ID = 'standard-dark';

function defaultState() {
  return { custom: [], activeLight: DEFAULT_LIGHT_ID, activeDark: DEFAULT_DARK_ID };
}

// 4T-000751 (Epic 3E-000146): Einmal-Entscheidung beim App-Start, welcher
// Schema-Zustand zu persistieren ist. Hintergrund der Entscheidung des
// Product Owners vom 2026-07-27: Die Umstellung auf Bernstein soll nur
// frische Installationen treffen. Der Store-Key `colorSchemes` steht NICHT
// in den Store-Defaults und entsteht sonst erst, wenn der Schema-Abschnitt
// der Einstellungen wirklich geaendert wird; ohne diesen Schritt wuerde der
// neue Vorgabewert auch bestehende Installationen mitziehen.
//
// Fehlt der Key, wird er DESHALB IN JEDEM FALL geschrieben, nicht nur im
// Bestandsfall: Eine frische Installation ist beim ersten Start spurenlos
// (also richtig auf Bernstein), traegt beim zweiten Start aber bereits eine
// gefuellte recentFiles-Liste und wuerde dann faelschlich als Bestand
// erkannt und auf Standard festgeschrieben. Weil der Key nach dem ersten
// Start immer existiert, laeuft der Zweig genau einmal, und es braucht
// keinen zusaetzlichen Marker im Store.
//
// hasStoredState: der Store traegt bereits einen colorSchemes-Stand.
// hasUsageTraces: der Store traegt Spuren frueherer Nutzung (Dateien,
// Bereiche, Sitzungen). Rueckgabe: der zu schreibende Zustand oder null,
// wenn nichts zu tun ist.
//
// Bewusst in Kauf genommen: Eine bestehende Installation ohne jede Spur gilt
// als frisch und bekommt Bernstein. Ohne Marker im Store ist der Fall nicht
// aufloesbar, und wer nichts benutzt hat, hat auch keine Gewohnheit.
function startupSchemeState({ hasStoredState, hasUsageTraces }) {
  if (hasStoredState) return null;
  if (!hasUsageTraces) return defaultState();
  return {
    custom: [],
    activeLight: PREVIOUS_DEFAULT_LIGHT_ID,
    activeDark: PREVIOUS_DEFAULT_DARK_ID,
  };
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function isValidColor(v) {
  return typeof v === 'string' && HEX_RE.test(v);
}

function baseDefaults(base) {
  return BASE_DEFAULTS[base === 'dark' ? 'dark' : 'light'];
}

function isBuiltinId(id) {
  return BUILTIN_SCHEMES.some((s) => s.id === id);
}

function builtinById(id) {
  return BUILTIN_SCHEMES.find((s) => s.id === id) || null;
}

function defaultIdForMode(mode) {
  return mode === 'dark' ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID;
}

function allSchemes(state) {
  const custom = state && Array.isArray(state.custom) ? state.custom : [];
  return [...BUILTIN_SCHEMES, ...custom];
}

function schemeById(state, id) {
  return allSchemes(state).find((s) => s.id === id) || null;
}

// Nur gültige, bekannte Slot-Abweichungen behalten (unbekannte Slots und
// ungültige Farbwerte fallen weg).
function sanitizeColors(colors) {
  const out = {};
  if (colors && typeof colors === 'object') {
    for (const slotId of SLOT_IDS) {
      const v = colors[slotId];
      if (isValidColor(v)) out[slotId] = v.toLowerCase();
    }
  }
  return out;
}

// Ein rohes Schema-Objekt in die kanonische Form bringen (oder null).
function sanitizeScheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const base = raw.base === 'dark' ? 'dark' : 'light';
  const name = typeof raw.name === 'string' ? raw.name : '';
  return { id, name, base, colors: sanitizeColors(raw.colors) };
}

// Persistenz-Zustand normalisieren: eigene Schemas säubern, ID-Kollisionen
// (mit Builtins oder untereinander) verwerfen, hängende Aktiv-Verweise auf das
// Standard-Schema des jeweiligen Modus zurücksetzen.
function normalizeState(raw) {
  const state = defaultState();
  const seen = new Set(BUILTIN_SCHEMES.map((s) => s.id));
  if (raw && Array.isArray(raw.custom)) {
    for (const entry of raw.custom) {
      const scheme = sanitizeScheme(entry);
      if (!scheme) continue;
      if (seen.has(scheme.id)) continue;
      seen.add(scheme.id);
      state.custom.push(scheme);
    }
  }
  const known = new Map(allSchemes(state).map((s) => [s.id, s]));
  const al = raw && typeof raw.activeLight === 'string' ? raw.activeLight : '';
  const ad = raw && typeof raw.activeDark === 'string' ? raw.activeDark : '';
  state.activeLight = known.has(al) && known.get(al).base === 'light' ? al : DEFAULT_LIGHT_ID;
  state.activeDark = known.has(ad) && known.get(ad).base === 'dark' ? ad : DEFAULT_DARK_ID;
  return state;
}

// Vollständige Slot→Farbe-Abbildung eines Schemas (Basis + Abweichungen).
function resolveSchemeColors(scheme) {
  const out = { ...baseDefaults(scheme && scheme.base) };
  const colors = scheme && scheme.colors;
  if (colors) {
    for (const slotId of SLOT_IDS) {
      if (isValidColor(colors[slotId])) out[slotId] = colors[slotId].toLowerCase();
    }
  }
  return out;
}

// Abweichungen eines Schemas gegenüber seiner Basis (Slot→Farbe).
function schemeDeviations(scheme) {
  const base = baseDefaults(scheme && scheme.base);
  const full = resolveSchemeColors(scheme);
  const out = {};
  for (const slotId of SLOT_IDS) {
    if (full[slotId].toLowerCase() !== base[slotId].toLowerCase()) out[slotId] = full[slotId];
  }
  return out;
}

function hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
  if (!m) return null;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Berechnet, welche CSS-Variablen für ein Schema am Wurzel-Element gesetzt
// bzw. geräumt werden. Nur abweichende Slots werden gesetzt; nicht abweichende
// werden geräumt, damit die Stylesheet-Werte (inkl. Modus-Umschaltung) gelten.
// Die abgeleitete --accent-soft zieht am Akzent-Slot mit.
function computeSchemeVars(scheme) {
  const base = baseDefaults(scheme && scheme.base);
  const full = resolveSchemeColors(scheme);
  const set = {};
  const clear = [];
  for (const slot of COLOR_SLOTS) {
    const deviates = full[slot.id].toLowerCase() !== base[slot.id].toLowerCase();
    for (const v of slot.vars) {
      if (deviates) set[v] = full[slot.id];
      else clear.push(v);
    }
    if (slot.id === 'accent') {
      const rgba = deviates
        ? hexToRgba(
            full.accent,
            ACCENT_SOFT_ALPHA[scheme && scheme.base === 'dark' ? 'dark' : 'light'],
          )
        : null;
      if (rgba) set[ACCENT_SOFT_VAR] = rgba;
      else clear.push(ACCENT_SOFT_VAR);
    }
  }
  return { set, clear };
}

// Aktives Schema für einen Modus ('light'|'dark'); fällt bei fehlendem oder
// Basis-fremdem Verweis auf das Vorgabe-Schema des Modus zurück.
function getActiveScheme(state, mode) {
  const m = mode === 'dark' ? 'dark' : 'light';
  const id = m === 'dark' ? state && state.activeDark : state && state.activeLight;
  const scheme = schemeById(state, id);
  if (scheme && scheme.base === m) return scheme;
  return builtinById(defaultIdForMode(m));
}

// --- Verwaltungs-Funktionen (rein: Zustand rein, neuer Zustand raus) --------

// Neues eigenes Schema aus einer Vorlage (Basis und Abweichungen kopiert).
function addCustomScheme(state, { id, name, templateId }) {
  const src = schemeById(state, templateId) || builtinById(DEFAULT_LIGHT_ID);
  const scheme = sanitizeScheme({ id, name, base: src.base, colors: schemeDeviations(src) });
  if (!scheme) return state;
  if (schemeById(state, scheme.id)) return state;
  return { ...state, custom: [...state.custom, scheme] };
}

function renameCustomScheme(state, id, name) {
  if (isBuiltinId(id)) return state;
  const nm = typeof name === 'string' ? name.trim() : '';
  return {
    ...state,
    custom: state.custom.map((s) => (s.id === id ? { ...s, name: nm || s.name } : s)),
  };
}

function duplicateScheme(state, sourceId, newId, newName) {
  const src = schemeById(state, sourceId);
  if (!src) return state;
  return addCustomScheme(state, { id: newId, name: newName, templateId: sourceId });
}

function deleteCustomScheme(state, id) {
  if (isBuiltinId(id)) return state;
  const custom = state.custom.filter((s) => s.id !== id);
  const activeLight = state.activeLight === id ? DEFAULT_LIGHT_ID : state.activeLight;
  const activeDark = state.activeDark === id ? DEFAULT_DARK_ID : state.activeDark;
  return { ...state, custom, activeLight, activeDark };
}

function setSlotColor(state, schemeId, slotId, color) {
  if (isBuiltinId(schemeId) || !SLOT_ID_SET.has(slotId) || !isValidColor(color)) return state;
  return {
    ...state,
    custom: state.custom.map((s) =>
      s.id === schemeId ? { ...s, colors: { ...s.colors, [slotId]: color.toLowerCase() } } : s,
    ),
  };
}

function resetSlotColor(state, schemeId, slotId) {
  if (isBuiltinId(schemeId) || !SLOT_ID_SET.has(slotId)) return state;
  return {
    ...state,
    custom: state.custom.map((s) => {
      if (s.id !== schemeId) return s;
      const colors = { ...s.colors };
      delete colors[slotId];
      return { ...s, colors };
    }),
  };
}

function setActiveScheme(state, mode, id) {
  const m = mode === 'dark' ? 'dark' : 'light';
  const scheme = schemeById(state, id);
  if (!scheme || scheme.base !== m) return state;
  return m === 'dark' ? { ...state, activeDark: id } : { ...state, activeLight: id };
}

module.exports = {
  COLOR_SCHEMES_KEY,
  BASE_DEFAULTS,
  SLOT_GROUPS,
  COLOR_SLOTS,
  SLOT_IDS,
  BUILTIN_SCHEMES,
  DEFAULT_LIGHT_ID,
  DEFAULT_DARK_ID,
  PREVIOUS_DEFAULT_LIGHT_ID,
  PREVIOUS_DEFAULT_DARK_ID,
  ACCENT_SOFT_VAR,
  defaultState,
  startupSchemeState,
  normalizeState,
  isValidColor,
  isBuiltinId,
  builtinById,
  allSchemes,
  schemeById,
  resolveSchemeColors,
  schemeDeviations,
  computeSchemeVars,
  hexToRgba,
  getActiveScheme,
  addCustomScheme,
  renameCustomScheme,
  duplicateScheme,
  deleteCustomScheme,
  setSlotColor,
  resetSlotColor,
  setActiveScheme,
};
