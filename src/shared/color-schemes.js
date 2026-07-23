// 4T-0464 (Epic 3E-0086): Slot-Modell und Schema-Verwaltung der Farbschemas.
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
// modules/color-schemes.js (4T-0465); hier nur die Berechnung, welche
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
  },
};

// Slot-Gruppen in Anzeige-Reihenfolge des Einstellungs-Bereichs.
const SLOT_GROUPS = [
  { id: 'surface', nameKey: 'settings.colorSchemes.group.surface' },
  { id: 'text', nameKey: 'settings.colorSchemes.group.text' },
  { id: 'accent', nameKey: 'settings.colorSchemes.group.accent' },
  { id: 'tabs', nameKey: 'settings.colorSchemes.group.tabs' },
  { id: 'content', nameKey: 'settings.colorSchemes.group.content' },
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
];

const SLOT_IDS = COLOR_SLOTS.map((s) => s.id);
const SLOT_ID_SET = new Set(SLOT_IDS);

// Abgeleitete Variable: die transparente Akzent-Variante (Pillen-Hintergrund)
// wird aus dem Akzent-Slot berechnet, damit sie mitzieht. Alpha je Modus wie
// in styles.css (hell 0.12, dunkel 0.18).
const ACCENT_SOFT_VAR = '--accent-soft';
const ACCENT_SOFT_ALPHA = { light: 0.12, dark: 0.18 };

// Mitgelieferte, unveränderliche Schemas (Basis + Abweichungen). Standard
// Hell/Dunkel haben keine Abweichungen (== Basis-Palette). Die Varianten
// setzen bewusst wenige Slots ab (kontrastreich, gedämpft-warm).
const BUILTIN_SCHEMES = [
  { id: 'standard-light', nameKey: 'colorScheme.builtin.standardLight', base: 'light', colors: {} },
  { id: 'standard-dark', nameKey: 'colorScheme.builtin.standardDark', base: 'dark', colors: {} },
  {
    id: 'contrast-light',
    nameKey: 'colorScheme.builtin.contrastLight',
    base: 'light',
    colors: {
      text: '#000000',
      textMuted: '#3a3a3a',
      border: '#9a9a9a',
      borderStrong: '#6a6a6a',
      accent: '#0a4da8',
    },
  },
  {
    id: 'contrast-dark',
    nameKey: 'colorScheme.builtin.contrastDark',
    base: 'dark',
    colors: {
      text: '#ffffff',
      textMuted: '#c8c8c8',
      border: '#6a6a6a',
      borderStrong: '#8a8a8a',
      accent: '#8fc4ff',
    },
  },
  {
    id: 'sepia-light',
    nameKey: 'colorScheme.builtin.sepiaLight',
    base: 'light',
    colors: {
      bg: '#f4ecd8',
      surface: '#efe4c9',
      muted: '#e6d9b8',
      toolbar: '#f0e7d0',
      text: '#43382b',
      textMuted: '#7a6a52',
      accent: '#9a5b2d',
      border: '#d8c9a8',
      borderStrong: '#c2ad82',
      codeBg: '#efe4c9',
    },
  },
  // 4T-0578 (Epic 3E-0106): vier kuratierte Paare als weitere Vorlagen. Jedes
  // Paar traegt denselben Farb-Charakter in hell und dunkel; die Warnfarbe
  // bleibt auf der Basis-Palette, ausser sie liegt zu nah am Akzent (Bernstein).
  {
    id: 'steel-light',
    nameKey: 'colorScheme.builtin.steelLight',
    base: 'light',
    colors: {
      bg: '#f7f9fc',
      surface: '#eef2f8',
      muted: '#e2e8f2',
      toolbar: '#f1f5fa',
      text: '#1c2833',
      textMuted: '#5b6b7c',
      accent: '#2b6cb0',
      border: '#d3dce8',
      borderStrong: '#b3c1d4',
      tabBar: '#e4eaf3',
      tabActive: '#f7f9fc',
      codeBg: '#eef2f8',
    },
  },
  {
    id: 'steel-dark',
    nameKey: 'colorScheme.builtin.steelDark',
    base: 'dark',
    colors: {
      bg: '#161c24',
      surface: '#1c242e',
      muted: '#232d3a',
      toolbar: '#1a222c',
      text: '#dfe7f0',
      textMuted: '#93a3b5',
      accent: '#6cb0f5',
      accentFg: '#0c1620',
      border: '#2e3a48',
      borderStrong: '#435264',
      tabBar: '#202a36',
      tabActive: '#161c24',
      codeBg: '#1c242e',
    },
  },
  {
    id: 'forest-light',
    nameKey: 'colorScheme.builtin.forestLight',
    base: 'light',
    colors: {
      bg: '#f6faf6',
      surface: '#ecf3ec',
      muted: '#e0ebe0',
      toolbar: '#f1f7f1',
      text: '#1f2b21',
      textMuted: '#5c6d5e',
      accent: '#2f7d4f',
      border: '#d4e2d5',
      borderStrong: '#b2c8b4',
      tabBar: '#e3eee4',
      tabActive: '#f6faf6',
      codeBg: '#ecf3ec',
    },
  },
  {
    id: 'forest-dark',
    nameKey: 'colorScheme.builtin.forestDark',
    base: 'dark',
    colors: {
      bg: '#151b16',
      surface: '#1b231d',
      muted: '#222c24',
      toolbar: '#192019',
      text: '#e0e9e1',
      textMuted: '#94a596',
      accent: '#6cc38b',
      accentFg: '#0c1a12',
      border: '#2c382e',
      borderStrong: '#405243',
      tabBar: '#1f2921',
      tabActive: '#151b16',
      codeBg: '#1b231d',
    },
  },
  {
    id: 'amber-light',
    nameKey: 'colorScheme.builtin.amberLight',
    base: 'light',
    colors: {
      bg: '#fffaf3',
      surface: '#fbf1e4',
      muted: '#f5e6d3',
      toolbar: '#fdf6ec',
      text: '#33281c',
      textMuted: '#7b6a55',
      accent: '#9c6316',
      border: '#ecdcc6',
      borderStrong: '#d7c1a3',
      tabBar: '#f7ead8',
      tabActive: '#fffaf3',
      codeBg: '#fbf1e4',
      // Warnfarbe ins Rot geschoben: das Basis-Orange waere vom bernstein-
      // farbenen Akzent kaum zu unterscheiden.
      linterWarn: '#b3261e',
    },
  },
  {
    id: 'amber-dark',
    nameKey: 'colorScheme.builtin.amberDark',
    base: 'dark',
    colors: {
      bg: '#1c1813',
      surface: '#241f18',
      muted: '#2d261d',
      toolbar: '#201b15',
      text: '#ece2d4',
      textMuted: '#a6957f',
      accent: '#e0a256',
      accentFg: '#201509',
      border: '#3a3128',
      borderStrong: '#50442f',
      tabBar: '#29231b',
      tabActive: '#1c1813',
      codeBg: '#241f18',
      linterWarn: '#f07b62',
    },
  },
  {
    id: 'graphite-light',
    nameKey: 'colorScheme.builtin.graphiteLight',
    base: 'light',
    colors: {
      bg: '#fbfbfa',
      surface: '#f2f2f0',
      muted: '#e8e8e5',
      toolbar: '#f6f6f4',
      text: '#23231f',
      textMuted: '#6b6b64',
      accent: '#4a5568',
      border: '#e2e2de',
      borderStrong: '#c4c4bd',
      tabBar: '#ededea',
      tabActive: '#fbfbfa',
      codeBg: '#f2f2f0',
    },
  },
  {
    id: 'graphite-dark',
    nameKey: 'colorScheme.builtin.graphiteDark',
    base: 'dark',
    colors: {
      bg: '#191919',
      surface: '#202020',
      muted: '#282828',
      toolbar: '#1d1d1d',
      text: '#e4e4e2',
      textMuted: '#9a9a95',
      accent: '#a8b4c0',
      accentFg: '#14181c',
      border: '#333333',
      borderStrong: '#474747',
      tabBar: '#242424',
      tabActive: '#191919',
      codeBg: '#202020',
    },
  },
];

// Store-Schlüssel des gesamten Farbschema-Zustands (ein Objekt, ein Broadcast).
const COLOR_SCHEMES_KEY = 'colorSchemes';
const STANDARD_LIGHT_ID = 'standard-light';
const STANDARD_DARK_ID = 'standard-dark';

function defaultState() {
  return { custom: [], activeLight: STANDARD_LIGHT_ID, activeDark: STANDARD_DARK_ID };
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

function standardIdForMode(mode) {
  return mode === 'dark' ? STANDARD_DARK_ID : STANDARD_LIGHT_ID;
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
  state.activeLight = known.has(al) && known.get(al).base === 'light' ? al : STANDARD_LIGHT_ID;
  state.activeDark = known.has(ad) && known.get(ad).base === 'dark' ? ad : STANDARD_DARK_ID;
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
// Basis-fremdem Verweis auf das Standard-Schema des Modus zurück.
function getActiveScheme(state, mode) {
  const m = mode === 'dark' ? 'dark' : 'light';
  const id = m === 'dark' ? state && state.activeDark : state && state.activeLight;
  const scheme = schemeById(state, id);
  if (scheme && scheme.base === m) return scheme;
  return builtinById(standardIdForMode(m));
}

// --- Verwaltungs-Funktionen (rein: Zustand rein, neuer Zustand raus) --------

// Neues eigenes Schema aus einer Vorlage (Basis und Abweichungen kopiert).
function addCustomScheme(state, { id, name, templateId }) {
  const src = schemeById(state, templateId) || builtinById(STANDARD_LIGHT_ID);
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
  const activeLight = state.activeLight === id ? STANDARD_LIGHT_ID : state.activeLight;
  const activeDark = state.activeDark === id ? STANDARD_DARK_ID : state.activeDark;
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
  STANDARD_LIGHT_ID,
  STANDARD_DARK_ID,
  ACCENT_SOFT_VAR,
  defaultState,
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
