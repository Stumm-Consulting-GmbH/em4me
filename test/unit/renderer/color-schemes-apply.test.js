// @vitest-environment jsdom
// 4T-0465 (Epic 3E-0086): Renderer-Anwendung der Farbschemas — DOM-Wirkung
// (Setzen/Räumen der Slot-Variablen je Modus) und die PDF-Override-Ableitung
// aus dem aktiven Hell-Schema (Export-Option 2). Die Assertions laufen gegen
// ein Fake-Wurzel-Element mit eigener Property-Ablage, unabhängig davon, ob
// jsdom CSS-Custom-Properties round-trippt.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applySchemeToRoot,
  applyActiveColorScheme,
  setColorSchemeState,
  pdfColorOverrides,
} from '../../../src/renderer/modules/color-schemes.js';
import { BUILTIN_SCHEMES, BASE_DEFAULTS, defaultState } from '../../../src/shared/color-schemes.js';

const byId = (id) => BUILTIN_SCHEMES.find((s) => s.id === id);

// Fake-Wurzel mit eigener Property-Ablage (jsdom-unabhängig).
function fakeRoot() {
  const props = {};
  return {
    props,
    style: {
      setProperty: (k, v) => {
        props[k] = v;
      },
      removeProperty: (k) => {
        delete props[k];
      },
      getPropertyValue: (k) => props[k] || '',
    },
    get: (k) => props[k] || '',
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  setColorSchemeState(defaultState());
});

describe('color-schemes (Renderer): applySchemeToRoot', () => {
  it('Standard-Schema räumt alle Slot-Variablen (Stylesheet gilt)', () => {
    const root = fakeRoot();
    root.style.setProperty('--bg', '#123456');
    applySchemeToRoot(root, byId('standard-light'));
    expect(root.get('--bg')).toBe('');
    expect(root.get('--accent')).toBe('');
    expect(root.get('--accent-soft')).toBe('');
  });

  it('abweichendes Schema setzt nur die abweichenden Variablen inline', () => {
    const root = fakeRoot();
    applySchemeToRoot(root, byId('contrast-light'));
    expect(root.get('--fg')).toBe('#000000');
    expect(root.get('--accent')).toBe('#0a4da8');
    expect(root.get('--accent-soft')).toBe('rgba(10, 77, 168, 0.12)');
    // nicht abweichender Slot bleibt ungesetzt
    expect(root.get('--bg')).toBe('');
  });
});

describe('color-schemes (Renderer): applyActiveColorScheme folgt data-theme', () => {
  it('wendet das aktive Schema des aktuellen Modus an und wechselt mit', () => {
    setColorSchemeState({
      custom: [{ id: 'd1', name: 'D', base: 'dark', colors: { accent: '#ff0000' } }],
      activeLight: 'standard-light',
      activeDark: 'd1',
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = fakeRoot();
    applyActiveColorScheme(dark);
    expect(dark.get('--accent')).toBe('#ff0000');

    // Wechsel auf hell: aktives Hell = Standard räumt die Inline-Variable
    document.documentElement.setAttribute('data-theme', 'light');
    const light = fakeRoot();
    light.style.setProperty('--accent', '#ff0000');
    applyActiveColorScheme(light);
    expect(light.get('--accent')).toBe('');
  });
});

describe('color-schemes (Renderer): pdfColorOverrides (Export-Option 2)', () => {
  it('Standard-Hell aktiv: Overrides entsprechen der Basis-Hell-Palette', () => {
    setColorSchemeState(defaultState());
    const ov = pdfColorOverrides();
    expect(ov['--bg']).toBe(BASE_DEFAULTS.light.bg);
    expect(ov['--fg']).toBe(BASE_DEFAULTS.light.text);
    expect(ov['--accent']).toBe(BASE_DEFAULTS.light.accent);
    expect(ov['--shadow']).toBe('0 2px 8px rgba(0, 0, 0, 0.08)');
  });

  it('folgt dem aktiven HELL-Schema, auch wenn der aktuelle Modus dunkel ist', () => {
    setColorSchemeState({
      custom: [{ id: 'l1', name: 'L', base: 'light', colors: { bg: '#fff8e0' } }],
      activeLight: 'l1',
      activeDark: 'standard-dark',
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    const ov = pdfColorOverrides();
    expect(ov['--bg']).toBe('#fff8e0');
  });
});
