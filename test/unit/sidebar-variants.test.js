// 4T-0624 (Epic 3E-0119): Datenmodell der benannten Sidebar-Varianten
// (src/shared/sidebar-variants.js) — Struktur-Sanitisierung von Layout,
// Sichtbarkeit und Varianten-Liste. Reine Funktionen, direkter Import
// (Muster mdd-store.test.js).
import { describe, expect, it } from 'vitest';
import {
  normalizeSidebarVariantList,
  sanitizeSidebarVariant,
  sanitizeVariantLayout,
  sanitizeVariantVisibility,
} from '../../src/shared/sidebar-variants.js';

describe('sanitizeVariantLayout', () => {
  it('behält gültige Slots samt active und räumt Duplikate, leere Slots und Nicht-Strings ab', () => {
    const raw = {
      left: [
        { panels: ['outline', 'outline', 42, ''], active: 'outline' },
        { panels: [] },
        { panels: ['bookmarks', 'area'], active: 'nicht-drin' },
      ],
      right: [{ panels: ['notes'], active: 'notes' }],
    };
    expect(sanitizeVariantLayout(raw)).toEqual({
      left: [
        { panels: ['outline'], active: 'outline' },
        { panels: ['bookmarks', 'area'], active: 'bookmarks' },
      ],
      right: [{ panels: ['notes'], active: 'notes' }],
    });
  });

  it('reduziert seitenübergreifende Duplikate auf das erste Vorkommen', () => {
    const raw = {
      left: [{ panels: ['outline'], active: 'outline' }],
      right: [{ panels: ['outline', 'notes'], active: 'outline' }],
    };
    expect(sanitizeVariantLayout(raw)).toEqual({
      left: [{ panels: ['outline'], active: 'outline' }],
      right: [{ panels: ['notes'], active: 'notes' }],
    });
  });

  it('erhält unbekannte Panel-IDs (die Panel-Menge kennt erst der Renderer beim Anwenden)', () => {
    const raw = { left: [{ panels: ['zukunfts-panel'], active: 'zukunfts-panel' }], right: [] };
    expect(sanitizeVariantLayout(raw).left).toEqual([
      { panels: ['zukunfts-panel'], active: 'zukunfts-panel' },
    ]);
  });

  it('liefert bei defektem Input immer die leere Zwei-Seiten-Form', () => {
    for (const raw of [null, 'x', 42, [], { left: 'kaputt' }]) {
      expect(sanitizeVariantLayout(raw)).toEqual({ left: [], right: [] });
    }
  });
});

describe('sanitizeVariantVisibility', () => {
  it('übernimmt je Panel maximal zwei Spalten-Werte und erzwingt boolean', () => {
    const raw = {
      outline: [true, 0],
      notes: [1, true, false],
      kaputt: 'ja',
      '': [true],
    };
    expect(sanitizeVariantVisibility(raw)).toEqual({
      outline: [true, false],
      notes: [true, true],
    });
  });

  it('liefert bei defektem Input ein leeres Objekt', () => {
    for (const raw of [null, [], 'x', 42]) {
      expect(sanitizeVariantVisibility(raw)).toEqual({});
    }
  });
});

describe('sanitizeSidebarVariant', () => {
  it('trimmt id und name und säubert layout und visibility', () => {
    const variant = sanitizeSidebarVariant({
      id: ' v1 ',
      name: '  Konzeptarbeit ',
      layout: { left: [{ panels: ['outline'], active: 'outline' }], right: [] },
      visibility: { outline: [true, false] },
    });
    expect(variant).toEqual({
      id: 'v1',
      name: 'Konzeptarbeit',
      layout: { left: [{ panels: ['outline'], active: 'outline' }], right: [] },
      visibility: { outline: [true, false] },
    });
  });

  it('lehnt fehlende oder leere id/name ab', () => {
    expect(sanitizeSidebarVariant(null)).toBeNull();
    expect(sanitizeSidebarVariant({ name: 'x' })).toBeNull();
    expect(sanitizeSidebarVariant({ id: 'v1', name: '   ' })).toBeNull();
    expect(sanitizeSidebarVariant({ id: '', name: 'x' })).toBeNull();
  });

  it('ergänzt fehlendes layout und visibility als leere Formen', () => {
    expect(sanitizeSidebarVariant({ id: 'v1', name: 'X' })).toEqual({
      id: 'v1',
      name: 'X',
      layout: { left: [], right: [] },
      visibility: {},
    });
  });
});

describe('normalizeSidebarVariantList', () => {
  it('verwirft ungültige Einträge und doppelte IDs (erstes Vorkommen gewinnt)', () => {
    const list = normalizeSidebarVariantList([
      { id: 'v1', name: 'Erste' },
      { id: 'v1', name: 'Duplikat' },
      { name: 'ohne id' },
      null,
      { id: 'v2', name: 'Zweite' },
    ]);
    expect(list.map((v) => [v.id, v.name])).toEqual([
      ['v1', 'Erste'],
      ['v2', 'Zweite'],
    ]);
  });

  it('liefert bei Nicht-Arrays eine leere Liste', () => {
    for (const raw of [null, undefined, 'x', {}, 42]) {
      expect(normalizeSidebarVariantList(raw)).toEqual([]);
    }
  });
});
