// 4T-0765 (Epic 3E-0158): Mehrfach-Auswahl der Reiterleiste — reines Modul
// ohne DOM/IPC. Geprueft werden die Auswahl-Gesten (Setzen, Aufnehmen und
// Herausnehmen, Spanne), die beiden Invarianten (nur Reiter der Leiste, der
// aktive Reiter bleibt Mitglied) und das Verschieben einer Menge als Block.
import { describe, it, expect } from 'vitest';
import {
  clearSelection,
  ensurePaneSelection,
  extendSelection,
  hasMultiSelection,
  isTabSelected,
  moveTabsWithinPane,
  pruneSelection,
  selectedIndices,
  setSelection,
  toggleSelection,
} from '../../../src/renderer/modules/tab-selection.js';
import { createTabGroup } from '../../../src/renderer/modules/tab-groups.js';

function tab(path, groupId = null) {
  return { path, groupId };
}

function pane(paths, activeIndex = 0) {
  return { tabs: paths.map((p) => tab(p)), activeIndex, groups: [], selection: [] };
}

function names(p) {
  return p.tabs.map((t) => t.path);
}

describe('Auswahl-Modell: Gesten (4T-0765)', () => {
  it('ensurePaneSelection ruestet Panes ohne selection-Feld nach', () => {
    const p = { tabs: [], activeIndex: -1, groups: [] };
    expect(ensurePaneSelection(p)).toEqual([]);
    expect(p.selection).toEqual([]);
  });

  it('setSelection setzt die Auswahl auf genau einen Reiter', () => {
    const p = pane(['a', 'b', 'c']);
    setSelection(p, 2);
    expect(selectedIndices(p)).toEqual([2]);
    expect(isTabSelected(p, 2)).toBe(true);
    expect(isTabSelected(p, 0)).toBe(false);
    expect(hasMultiSelection(p)).toBe(false);
  });

  it('toggleSelection nimmt auf und wieder heraus', () => {
    const p = pane(['a', 'b', 'c'], 0);
    setSelection(p, 0);
    expect(toggleSelection(p, 2)).toBe(true); // neu aufgenommen -> aktivieren
    expect(selectedIndices(p)).toEqual([0, 2]);
    expect(hasMultiSelection(p)).toBe(true);
    expect(toggleSelection(p, 2)).toBe(false);
    expect(selectedIndices(p)).toEqual([0]);
  });

  it('toggleSelection nimmt den aktiven Reiter nie heraus (Invariante 2)', () => {
    const p = pane(['a', 'b', 'c'], 1);
    setSelection(p, 1);
    toggleSelection(p, 2);
    expect(toggleSelection(p, 1)).toBe(false);
    expect(selectedIndices(p)).toEqual([1, 2]);
  });

  it('toggleSelection ohne bestehende Auswahl nimmt den aktiven Reiter mit auf', () => {
    const p = pane(['a', 'b', 'c'], 0);
    clearSelection(p);
    expect(toggleSelection(p, 2)).toBe(true);
    expect(selectedIndices(p)).toEqual([0, 2]);
  });

  it('extendSelection bildet die Spanne ab dem aktiven Reiter, in beide Richtungen', () => {
    const p = pane(['a', 'b', 'c', 'd'], 2);
    extendSelection(p, 0);
    expect(selectedIndices(p)).toEqual([0, 1, 2]);
    extendSelection(p, 3);
    expect(selectedIndices(p)).toEqual([2, 3]);
  });

  it('extendSelection ueberspringt verborgene Mitglieder zugeklappter Gruppen', () => {
    const p = pane(['a', 'b', 'c', 'd'], 0);
    const g = createTabGroup(p, 1);
    p.tabs[2].groupId = g.id;
    g.collapsed = true;
    extendSelection(p, 3);
    expect(selectedIndices(p)).toEqual([0, 3]);
    // Bei abgeschalteter Erweiterung zeigt die Leiste alle Reiter; dann zaehlt
    // auch die Spanne alle.
    extendSelection(p, 3, false);
    expect(selectedIndices(p)).toEqual([0, 1, 2, 3]);
  });

  it('extendSelection haelt den aktiven Reiter auch dann, wenn er verborgen ist', () => {
    const p = pane(['a', 'b', 'c'], 0);
    const g = createTabGroup(p, 0);
    g.collapsed = true;
    extendSelection(p, 2);
    expect(selectedIndices(p)).toEqual([0, 1, 2]);
  });

  it('pruneSelection entfernt Reiter, die die Leiste verlassen haben (Invariante 1)', () => {
    const p = pane(['a', 'b', 'c'], 0);
    setSelection(p, 0);
    toggleSelection(p, 2);
    p.tabs.splice(2, 1);
    pruneSelection(p);
    expect(selectedIndices(p)).toEqual([0]);
  });
});

describe('Auswahl-Modell: Menge verschieben (4T-0765)', () => {
  it('verschiebt die Menge als Block und haelt ihre Reihenfolge', () => {
    const p = pane(['a', 'b', 'c', 'd'], 0);
    expect(moveTabsWithinPane(p, [0, 2], 4)).toBe(true);
    expect(names(p)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('haelt den aktiven Reiter ueber die Objekt-Identitaet stabil', () => {
    const p = pane(['a', 'b', 'c', 'd'], 3);
    moveTabsWithinPane(p, [0, 1], 4);
    expect(p.tabs[p.activeIndex].path).toBe('d');
  });

  it('nimmt die Gruppe der Einfuege-Stelle an (Zusammenhangs-Invariante)', () => {
    const p = pane(['a', 'b', 'c', 'd'], 0);
    const g = createTabGroup(p, 1);
    p.tabs[2].groupId = g.id;
    // Zwischen die beiden Mitglieder fallen: beide Reiter treten der Gruppe bei.
    moveTabsWithinPane(p, [0, 3], 2);
    expect(names(p)).toEqual(['b', 'a', 'd', 'c']);
    expect(p.tabs.map((t) => t.groupId)).toEqual([g.id, g.id, g.id, g.id]);
  });

  it('laesst eine Menge aus einer Gruppe beim Verschieben ins Freie austreten', () => {
    const p = pane(['a', 'b', 'c'], 0);
    const g = createTabGroup(p, 0);
    p.tabs[1].groupId = g.id;
    moveTabsWithinPane(p, [0, 1], 3);
    expect(names(p)).toEqual(['c', 'a', 'b']);
    expect(p.tabs.map((t) => t.groupId)).toEqual([null, null, null]);
  });

  it('meldet false bei leerer oder unbrauchbarer Index-Liste', () => {
    const p = pane(['a', 'b'], 0);
    expect(moveTabsWithinPane(p, [], 0)).toBe(false);
    expect(moveTabsWithinPane(p, [7], 0)).toBe(false);
  });
});
