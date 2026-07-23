// 4T-0166: Erster Unit-Test (Beispiel- und Smoke-Basis) gegen das
// Electron-freie Shared-Modul src/shared/callouts.js.
// Inhaltliche Vertiefung der Main-Prozess-Tests: 4T-0168.
//
// ESM-Syntax (Vitest 4 ist ESM-only); das CJS-Modul callouts.js wird
// ueber den Vite-Interop mit Named-Exports importiert.
import { describe, it, expect } from 'vitest';
import { CALLOUT_TYPES, calloutIcon } from '../../src/shared/callouts.js';

describe('callouts.js — CALLOUT_TYPES', () => {
  const EXPECTED_TYPES = [
    'note',
    'info',
    'tip',
    'success',
    'question',
    'warning',
    'failure',
    'danger',
    'example',
    'quote',
  ];

  it('enthaelt genau die zehn definierten Callout-Typen', () => {
    expect(Object.keys(CALLOUT_TYPES).sort()).toEqual([...EXPECTED_TYPES].sort());
  });

  it('jeder Typ traegt titleKey nach Muster callout.<typ>.title', () => {
    for (const [type, def] of Object.entries(CALLOUT_TYPES)) {
      expect(def.titleKey).toBe(`callout.${type}.title`);
    }
  });

  it('jeder Typ traegt ein Lucide-SVG-Icon (aria-hidden, 16x16)', () => {
    for (const def of Object.values(CALLOUT_TYPES)) {
      expect(def.iconSvg).toMatch(/^<svg /);
      expect(def.iconSvg).toContain('aria-hidden="true"');
      expect(def.iconSvg).toContain('width="16"');
      expect(def.iconSvg).toMatch(/<\/svg>$/);
    }
  });
});

describe('callouts.js — calloutIcon()', () => {
  it('wrappt den Inhalt in den SVG-Rahmen', () => {
    const svg = calloutIcon('<path d="M0 0"/>');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('<path d="M0 0"/>');
    expect(svg).toMatch(/<\/svg>$/);
  });
});
