// 4T-000464 (Epic 3E-000086): Slot-Modell und Schema-Verwaltung.
// Prüft Slot-Integrität, Gleichheit der Basis-Paletten mit styles.css
// (Drift-Wächter), Schema-Auflösung, Variablen-Berechnung und die reinen
// Verwaltungs-Funktionen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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
  schemeById,
} from '../../src/shared/color-schemes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Extrahiert die --var: wert;-Paare des ersten Blocks nach dem Marker. Die
// Theme-Blöcke in styles.css sind flach (keine verschachtelten Klammern),
// daher schließt die erste '}' den Block.
function extractCssBlock(css, startMarker) {
  const start = css.indexOf(startMarker);
  if (start < 0) return {};
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const out = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m = re.exec(body);
  while (m) {
    out[m[1]] = m[2].trim().toLowerCase();
    m = re.exec(body);
  }
  return out;
}

// Bewusst über die literalen IDs: Diese beiden Prüfungen gelten dem
// Standard-Schema als solchem (Gleichheit mit der Basis-Palette) und nicht
// dem jeweils voreingestellten Schema.
const standardLight = BUILTIN_SCHEMES.find((s) => s.id === 'standard-light');
const standardDark = BUILTIN_SCHEMES.find((s) => s.id === 'standard-dark');
const contrastLight = BUILTIN_SCHEMES.find((s) => s.id === 'contrast-light');

describe('color-schemes: Slot-Integrität', () => {
  it('Gruppen und Slots sind konsistent, jede Variable gehört genau einem Slot', () => {
    const groupIds = new Set(SLOT_GROUPS.map((g) => g.id));
    expect(groupIds.size).toBe(SLOT_GROUPS.length);
    const usedGroups = new Set();
    const seenSlot = new Set();
    const seenVar = new Set();
    for (const slot of COLOR_SLOTS) {
      expect(typeof slot.id).toBe('string');
      expect(slot.id).not.toBe('');
      expect(groupIds.has(slot.group)).toBe(true);
      expect(typeof slot.nameKey).toBe('string');
      expect(Array.isArray(slot.vars)).toBe(true);
      expect(slot.vars.length).toBeGreaterThan(0);
      expect(seenSlot.has(slot.id)).toBe(false);
      seenSlot.add(slot.id);
      for (const v of slot.vars) {
        expect(v.startsWith('--')).toBe(true);
        expect(seenVar.has(v)).toBe(false);
        seenVar.add(v);
      }
      usedGroups.add(slot.group);
    }
    for (const g of groupIds) expect(usedGroups.has(g)).toBe(true);
    expect(SLOT_IDS).toEqual(COLOR_SLOTS.map((s) => s.id));
  });

  it('jeder Slot hat einen gültigen Basis-Wert in beiden Modi, keine Fremd-Schlüssel', () => {
    for (const slotId of SLOT_IDS) {
      expect(isValidColor(BASE_DEFAULTS.light[slotId])).toBe(true);
      expect(isValidColor(BASE_DEFAULTS.dark[slotId])).toBe(true);
    }
    expect(Object.keys(BASE_DEFAULTS.light).sort()).toEqual([...SLOT_IDS].sort());
    expect(Object.keys(BASE_DEFAULTS.dark).sort()).toEqual([...SLOT_IDS].sort());
  });
});

// 4T-000578 (Epic 3E-000106): Wächter über die mitgelieferten Vorlagen. Deckt
// Struktur (IDs, Basis, nameKey, bekannte Slots, gültige Hex-Werte) und
// Lesbarkeit (Kontrast-Mindestwerte) ab, damit neue Vorlagen nicht mit
// unbekannten Slots, ungültigen Werten oder unlesbaren Paaren einziehen.
describe('color-schemes: mitgelieferte Vorlagen (4T-000578)', () => {
  const de = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'de.json'), 'utf8'));

  it('IDs sind eindeutig, Basis und nameKey gesetzt, Slots und Werte gültig', () => {
    const seen = new Set();
    for (const scheme of BUILTIN_SCHEMES) {
      expect(typeof scheme.id, `${scheme.id}: ID`).toBe('string');
      expect(seen.has(scheme.id), `${scheme.id}: doppelte ID`).toBe(false);
      seen.add(scheme.id);
      expect(['light', 'dark'], `${scheme.id}: Basis`).toContain(scheme.base);
      expect(scheme.nameKey.startsWith('colorScheme.builtin.'), `${scheme.id}: nameKey`).toBe(true);
      // Der i18n-Wächter (scripts/check-i18n.js) sichert die vier übrigen
      // Sprachen gegen die deutsche Datei ab.
      expect(typeof de[scheme.nameKey], `${scheme.id}: Übersetzung fehlt`).toBe('string');
      for (const [slotId, value] of Object.entries(scheme.colors)) {
        expect(SLOT_IDS, `${scheme.id}: unbekannter Slot ${slotId}`).toContain(slotId);
        expect(isValidColor(value), `${scheme.id}.${slotId}: ${value}`).toBe(true);
      }
    }
  });

  it('jede Vorlage löst auf einen vollständigen Slot-Satz auf', () => {
    for (const scheme of BUILTIN_SCHEMES) {
      const colors = resolveSchemeColors(scheme);
      expect(Object.keys(colors).sort(), scheme.id).toEqual([...SLOT_IDS].sort());
      for (const id of SLOT_IDS) expect(isValidColor(colors[id]), `${scheme.id}.${id}`).toBe(true);
    }
  });

  // Kontrast nach WCAG-Formel. Die Mindestwerte liegen auf dem Niveau der
  // bestehenden Vorlagen (schwächstes Bestands-Paar ist Sepia) und halten
  // Fließtext über der AAA-Schwelle. Die Warnfarbe ist ein grafisches
  // Element (Wellenlinie), deshalb die niedrigere Schwelle.
  const MIN_RATIO = [
    ['text', 'bg', 9],
    ['textMuted', 'bg', 4.4],
    ['accent', 'bg', 4.5],
    ['accentFg', 'accent', 4.5],
    ['text', 'codeBg', 7],
    ['text', 'tabBar', 7],
    ['text', 'tabActive', 7],
    ['linterWarn', 'bg', 2.8],
  ];

  // 4T-001314 (Epic 3E-000235): Die elf Editor-Textfarben tragen Text und müssen
  // deshalb alle über derselben Schwelle liegen. 4,5 ist die Grenze für
  // Fließtext und zugleich der schwächste Wert der Grundpalette (Code auf
  // hellem Grund, 4,57); eine höhere Schwelle würde den ausgelieferten Stand
  // für ungültig erklären.
  const EDITOR_TEXT_SLOTS = [
    'syntaxHeading',
    'syntaxLink',
    'syntaxUrl',
    'syntaxCode',
    'syntaxMeta',
    'syntaxList',
    'syntaxQuote',
    'syntaxComment',
    'syntaxKeyword',
    'syntaxString',
    'syntaxNumber',
  ];
  const MIN_RATIO_EDITOR_TEXT = 4.5;

  function relativeLuminance(hex) {
    const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const linear = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrastRatio(a, b) {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }

  it('alle Vorlagen halten die Kontrast-Mindestwerte', () => {
    for (const scheme of BUILTIN_SCHEMES) {
      const colors = resolveSchemeColors(scheme);
      for (const [fg, bg, min] of MIN_RATIO) {
        const ratio = contrastRatio(colors[fg], colors[bg]);
        expect(ratio, `${scheme.id}: ${fg} auf ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          min,
        );
      }
    }
  });

  // 4T-001314 (Epic 3E-000235): Die Editor-Textfarben entstehen je Vorlage aus
  // einer Ableitungs-Regel (Farbton aus dem Akzent bzw. feste Farbfamilie,
  // Helligkeit auf den Hintergrund gerechnet). Die Regel sichert die
  // Lesbarkeit nicht von selbst — deshalb dieser Wächter über das Ergebnis.
  it('alle Vorlagen halten den Kontrast der elf Editor-Textfarben', () => {
    for (const scheme of BUILTIN_SCHEMES) {
      const colors = resolveSchemeColors(scheme);
      for (const slot of EDITOR_TEXT_SLOTS) {
        const ratio = contrastRatio(colors[slot], colors.bg);
        expect(ratio, `${scheme.id}: ${slot} auf bg = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          MIN_RATIO_EDITOR_TEXT,
        );
      }
    }
  });

  // Jede Vorlage außer den beiden Standard-Schemas trägt eine eigene
  // Editor-Palette; ohne sie zeigte ein warmes oder gedämpftes Schema
  // unverändert die kräftigen Standard-Farben.
  it('jede Nicht-Standard-Vorlage setzt alle elf Editor-Textfarben ab', () => {
    for (const scheme of BUILTIN_SCHEMES) {
      const istStandard = Object.keys(scheme.colors).length === 0;
      for (const slot of EDITOR_TEXT_SLOTS) {
        expect(
          Object.prototype.hasOwnProperty.call(scheme.colors, slot),
          `${scheme.id}: ${slot}`,
        ).toBe(!istStandard);
      }
    }
  });
});

describe('color-schemes: Basis-Paletten == styles.css (Drift-Wächter)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');
  const light = extractCssBlock(css, ':root {');
  const dark = extractCssBlock(css, "[data-theme='dark'] {");

  it('die Leit-Variable jedes Slots entspricht dem styles.css-Wert', () => {
    for (const slot of COLOR_SLOTS) {
      const cssName = slot.vars[0].slice(2);
      expect(light[cssName]).toBe(BASE_DEFAULTS.light[slot.id]);
      expect(dark[cssName]).toBe(BASE_DEFAULTS.dark[slot.id]);
    }
  });
});

describe('color-schemes: Auflösung und Variablen-Berechnung', () => {
  it('Standard-Schemas lösen exakt zur Basis-Palette auf', () => {
    expect(resolveSchemeColors(standardLight)).toEqual(BASE_DEFAULTS.light);
    expect(resolveSchemeColors(standardDark)).toEqual(BASE_DEFAULTS.dark);
  });

  it('Standard-Schema setzt keine Variable und räumt alle (pixel-identisch)', () => {
    const { set, clear } = computeSchemeVars(standardLight);
    expect(Object.keys(set)).toHaveLength(0);
    const managed = COLOR_SLOTS.flatMap((s) => s.vars).concat(ACCENT_SOFT_VAR);
    expect(new Set(clear)).toEqual(new Set(managed));
  });

  it('abweichendes Schema setzt nur die abweichenden Variablen und leitet --accent-soft ab', () => {
    const { set } = computeSchemeVars(contrastLight);
    expect(set['--fg']).toBe('#000000');
    expect(set['--accent']).toBe('#0a4da8');
    expect(set[ACCENT_SOFT_VAR]).toBe(hexToRgba('#0a4da8', 0.12));
    expect(set['--bg']).toBeUndefined();
  });

  it('schemeDeviations liefert genau die Abweichungen', () => {
    expect(schemeDeviations(contrastLight)).toEqual({
      text: '#000000',
      textMuted: '#3a3a3a',
      border: '#9a9a9a',
      borderStrong: '#6a6a6a',
      accent: '#0a4da8',
      // 4T-001314 (Epic 3E-000235): die elf Editor-Textfarben der Vorlage.
      syntaxHeading: '#0a4da8',
      syntaxLink: '#0a4da8',
      syntaxUrl: '#3a3a3a',
      syntaxCode: '#a40e1a',
      syntaxMeta: '#3a3a3a',
      syntaxList: '#138641',
      syntaxQuote: '#494949',
      syntaxComment: '#494949',
      syntaxKeyword: '#9c161f',
      syntaxString: '#163f9c',
      syntaxNumber: '#0a4aa8',
    });
    expect(schemeDeviations(standardLight)).toEqual({});
  });

  it('hexToRgba', () => {
    expect(hexToRgba('#0a66c2', 0.12)).toBe('rgba(10, 102, 194, 0.12)');
    expect(hexToRgba('nope', 0.1)).toBeNull();
  });
});

describe('color-schemes: Verwaltungs-Funktionen', () => {
  it('addCustomScheme kopiert Basis und Abweichungen der Vorlage', () => {
    const fromStd = addCustomScheme(defaultState(), {
      id: 'c1',
      name: 'Mein',
      templateId: 'standard-dark',
    });
    expect(schemeById(fromStd, 'c1')).toMatchObject({
      id: 'c1',
      name: 'Mein',
      base: 'dark',
      colors: {},
    });
    const fromVar = addCustomScheme(defaultState(), {
      id: 'c1',
      name: 'K',
      templateId: 'contrast-light',
    });
    expect(schemeById(fromVar, 'c1').colors.text).toBe('#000000');
  });

  it('ID-Kollision (Custom oder Builtin) wird ignoriert', () => {
    let s = addCustomScheme(defaultState(), { id: 'c1', name: 'A', templateId: 'standard-light' });
    s = addCustomScheme(s, { id: 'c1', name: 'B', templateId: 'standard-light' });
    expect(s.custom).toHaveLength(1);
    s = addCustomScheme(s, { id: 'standard-light', name: 'X', templateId: 'standard-light' });
    expect(s.custom).toHaveLength(1);
  });

  it('rename und delete nur für Custom; delete räumt Aktiv-Verweis auf Standard', () => {
    let s = addCustomScheme(defaultState(), { id: 'c1', name: 'A', templateId: 'standard-light' });
    s = renameCustomScheme(s, 'c1', 'Neu');
    expect(schemeById(s, 'c1').name).toBe('Neu');
    const beforeBuiltin = JSON.stringify(s);
    s = renameCustomScheme(s, 'standard-light', 'X');
    expect(JSON.stringify(s)).toBe(beforeBuiltin);
    s = setActiveScheme(s, 'light', 'c1');
    expect(s.activeLight).toBe('c1');
    s = deleteCustomScheme(s, 'c1');
    expect(s.custom).toHaveLength(0);
    expect(s.activeLight).toBe(DEFAULT_LIGHT_ID);
  });

  it('duplicate erzeugt eine unabhängige Custom-Kopie', () => {
    let s = addCustomScheme(defaultState(), { id: 'c1', name: 'A', templateId: 'contrast-light' });
    s = duplicateScheme(s, 'c1', 'c2', 'A Kopie');
    expect(s.custom).toHaveLength(2);
    expect(schemeById(s, 'c2').colors.text).toBe('#000000');
  });

  it('setSlotColor/resetSlotColor nur für Custom und gültige Slots/Farben', () => {
    let s = addCustomScheme(defaultState(), { id: 'c1', name: 'A', templateId: 'standard-light' });
    s = setSlotColor(s, 'c1', 'accent', '#ABCDEF');
    expect(schemeById(s, 'c1').colors.accent).toBe('#abcdef');
    s = setSlotColor(s, 'c1', 'accent', 'bad');
    expect(schemeById(s, 'c1').colors.accent).toBe('#abcdef');
    s = setSlotColor(s, 'c1', 'unbekannt', '#000000');
    expect(schemeById(s, 'c1').colors.unbekannt).toBeUndefined();
    expect(isBuiltinId('standard-light')).toBe(true);
    s = resetSlotColor(s, 'c1', 'accent');
    expect(schemeById(s, 'c1').colors.accent).toBeUndefined();
  });

  it('setActiveScheme prüft den Basis-Modus', () => {
    let s = addCustomScheme(defaultState(), { id: 'cd', name: 'D', templateId: 'standard-dark' });
    s = setActiveScheme(s, 'light', 'cd');
    expect(s.activeLight).toBe(DEFAULT_LIGHT_ID);
    s = setActiveScheme(s, 'dark', 'cd');
    expect(s.activeDark).toBe('cd');
  });

  it('getActiveScheme mit Fallback auf die Voreinstellung', () => {
    const s = defaultState();
    expect(getActiveScheme(s, 'light').id).toBe(DEFAULT_LIGHT_ID);
    expect(getActiveScheme(s, 'dark').id).toBe(DEFAULT_DARK_ID);
    const broken = { custom: [], activeLight: 'ghost', activeDark: 'ghost' };
    expect(getActiveScheme(broken, 'light').id).toBe(DEFAULT_LIGHT_ID);
  });
});

describe('color-schemes: normalizeState', () => {
  it('füllt Defaults, säubert Farben und verwirft Ungültiges', () => {
    const s = normalizeState({
      custom: [
        {
          id: 'ok',
          name: 'OK',
          base: 'dark',
          colors: { accent: '#123456', bogus: '#000000', bad: 'x' },
        },
        { id: '', name: 'leer' },
        { id: 'ok', name: 'dup' },
        null,
      ],
      activeLight: 'ok',
      activeDark: 'ok',
    });
    expect(s.custom).toHaveLength(1);
    expect(s.custom[0].colors).toEqual({ accent: '#123456' });
    expect(s.activeLight).toBe(DEFAULT_LIGHT_ID);
    expect(s.activeDark).toBe('ok');
  });

  it('leerer oder kaputter Input ergibt den Default-Zustand', () => {
    expect(normalizeState(undefined)).toEqual(defaultState());
    expect(normalizeState({})).toEqual(defaultState());
  });
});

// 4T-000751 (Epic 3E-000146): Auslieferungs-Voreinstellung und der Einmal-Schritt
// beim Start. Die IDs stehen hier bewusst als Literale und nicht nur über die
// Konstanten: Sonst prüfte der Test die Konstante gegen sich selbst und ein
// stiller Wert-Drift bliebe unbemerkt.
describe('color-schemes: Auslieferungs-Voreinstellung (4T-000751)', () => {
  it('Voreinstellung und Rückfall zeigen auf Bernstein', () => {
    expect(DEFAULT_LIGHT_ID).toBe('amber-light');
    expect(DEFAULT_DARK_ID).toBe('amber-dark');
    expect(defaultState()).toEqual({
      custom: [],
      activeLight: 'amber-light',
      activeDark: 'amber-dark',
    });
    // Der Rückfall bei unbekanntem Verweis wandert mit (Entscheidung des
    // Product Owners vom 2026-07-27).
    const broken = { custom: [], activeLight: 'ghost', activeDark: 'ghost' };
    expect(getActiveScheme(broken, 'light').id).toBe('amber-light');
    expect(getActiveScheme(broken, 'dark').id).toBe('amber-dark');
    expect(normalizeState({ activeLight: 'ghost', activeDark: 'ghost' })).toEqual(defaultState());
  });

  it('die abgelösten Standard-Schemas bleiben als Vorlagen erhalten', () => {
    expect(PREVIOUS_DEFAULT_LIGHT_ID).toBe('standard-light');
    expect(PREVIOUS_DEFAULT_DARK_ID).toBe('standard-dark');
    expect(BUILTIN_SCHEMES.some((s) => s.id === 'standard-light')).toBe(true);
    expect(BUILTIN_SCHEMES.some((s) => s.id === 'standard-dark')).toBe(true);
  });

  it('startupSchemeState: bestehende Installation wird auf Standard festgeschrieben', () => {
    expect(startupSchemeState({ hasStoredState: false, hasUsageTraces: true })).toEqual({
      custom: [],
      activeLight: 'standard-light',
      activeDark: 'standard-dark',
    });
  });

  it('startupSchemeState: frische Installation bekommt Bernstein', () => {
    expect(startupSchemeState({ hasStoredState: false, hasUsageTraces: false })).toEqual(
      defaultState(),
    );
  });

  // Der Kern der Falle: Weil auch die frische Installation schreibt, existiert
  // der Key ab dem ersten Start. Ein zweiter Start mit inzwischen gefüllter
  // Datei-Liste darf die frische Installation nicht nachträglich auf Standard
  // festschreiben.
  it('startupSchemeState: vorhandener Stand wird nie überschrieben', () => {
    expect(startupSchemeState({ hasStoredState: true, hasUsageTraces: true })).toBeNull();
    expect(startupSchemeState({ hasStoredState: true, hasUsageTraces: false })).toBeNull();
  });
});
