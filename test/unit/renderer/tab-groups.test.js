// 4T-000459 (Epic 3E-000085): Tab-Gruppen-Modell — Invarianten-Helfer und
// Sitzungs-Persistenz (reines Modul, kein DOM/IPC noetig).
import { describe, it, expect } from 'vitest';
import {
  TAB_GROUP_COLOR_KEYS,
  addTabToGroup,
  addTabsToGroup,
  buildGroupsSnapshot,
  createTabGroup,
  createTabGroupFromTabs,
  dissolveGroup,
  ensurePaneGroups,
  groupById,
  groupIdForInsertion,
  groupRange,
  insertTabNextTo,
  isTabVisible,
  memberIndices,
  moveGroupWithinPane,
  moveTabNextTo,
  nextFreeColor,
  nextGroupId,
  normalizePaneGroups,
  pruneEmptyGroups,
  removeTabFromGroup,
  removeTabsFromGroup,
  restoreGroupsIntoPane,
} from '../../../src/renderer/modules/tabs/tab-groups.js';
// 4T-000461: Registrierung der Erweiterung tab-groups (Aus-Zustand wird in
// TG-08 der E2E-Spec tab-gruppen.spec.js geprueft; hier die Registry-Seite).
import { extensionById, isExtensionId } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';

// Minimale Tab-/Pane-Fabriken (nur die fuer Gruppen relevanten Felder).
function tab(path, groupId = null) {
  return { path, groupId };
}

function pane(tabs, activeIndex = 0) {
  return { tabs, activeIndex, groups: [] };
}

function names(p) {
  return p.tabs.map((t) => t.path);
}

describe('Tab-Gruppen: Basis-Helfer (4T-000459)', () => {
  it('Palette hat genau acht eindeutige Schluessel', () => {
    expect(TAB_GROUP_COLOR_KEYS).toHaveLength(8);
    expect(new Set(TAB_GROUP_COLOR_KEYS).size).toBe(8);
  });

  it('ensurePaneGroups ruestet Panes ohne groups-Feld nach', () => {
    const p = { tabs: [], activeIndex: -1 };
    expect(ensurePaneGroups(p)).toEqual([]);
    expect(p.groups).toEqual([]);
  });

  it('nextGroupId zaehlt hoch, nextFreeColor vergibt erst unbenutzte Farben', () => {
    const p = pane([tab('a'), tab('b')]);
    expect(nextGroupId(p)).toBe('tg1');
    const g1 = createTabGroup(p, 0, { name: 'Erste' });
    expect(g1.id).toBe('tg1');
    expect(g1.color).toBe(TAB_GROUP_COLOR_KEYS[0]);
    const g2 = createTabGroup(p, 1, { name: 'Zweite' });
    expect(g2.id).toBe('tg2');
    expect(g2.color).toBe(TAB_GROUP_COLOR_KEYS[1]);
  });

  it('nextFreeColor faellt bei voller Palette auf die seltenste Farbe zurueck', () => {
    const p = pane(TAB_GROUP_COLOR_KEYS.map((_, i) => tab(`t${i}`)));
    for (let i = 0; i < TAB_GROUP_COLOR_KEYS.length; i++) createTabGroup(p, i, {});
    // Alle acht Farben einmal vergeben -> die erste ist wieder dran.
    expect(nextFreeColor(p)).toBe(TAB_GROUP_COLOR_KEYS[0]);
  });

  it('createTabGroup validiert Farbe und legt collapsed=false an', () => {
    const p = pane([tab('a')]);
    const g = createTabGroup(p, 0, { name: 'X', color: 'neon' });
    expect(TAB_GROUP_COLOR_KEYS).toContain(g.color);
    expect(g.collapsed).toBe(false);
    expect(p.tabs[0].groupId).toBe(g.id);
    expect(groupById(p, g.id)).toBe(g);
  });
});

describe('Tab-Gruppen: Mitgliedschaft und Zusammenhang (4T-000459)', () => {
  it('addTabToGroup verschiebt einen spaeteren Tab ans Block-Ende', () => {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')], 3);
    const g = createTabGroup(p, 0, {});
    addTabToGroup(p, 2, g.id);
    expect(names(p)).toEqual(['a', 'c', 'b', 'd']);
    expect(memberIndices(p, g.id)).toEqual([0, 1]);
    // aktiver Tab ('d') bleibt ueber Objekt-Identitaet stabil.
    expect(p.tabs[p.activeIndex].path).toBe('d');
  });

  it('addTabToGroup verschiebt einen frueheren Tab korrekt (Post-Splice-Koordinaten)', () => {
    const p = pane([tab('x'), tab('a'), tab('b'), tab('c')], 0);
    const g = createTabGroup(p, 2, {});
    addTabToGroup(p, 3, g.id); // 'c' hinter 'b'
    addTabToGroup(p, 0, g.id); // 'x' von vor dem Block ans Block-Ende
    expect(names(p)).toEqual(['a', 'b', 'c', 'x']);
    expect(memberIndices(p, g.id)).toEqual([1, 2, 3]);
    expect(groupRange(p, g.id)).toEqual({ start: 1, end: 3 });
    expect(p.tabs[p.activeIndex].path).toBe('x');
  });

  it('removeTabFromGroup stellt den Tab hinter den Block', () => {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')], 1);
    const g = createTabGroup(p, 0, {});
    addTabToGroup(p, 1, g.id);
    addTabToGroup(p, 2, g.id);
    // Block: a b c | d — mittleres Mitglied 'b' austreten lassen.
    removeTabFromGroup(p, 1);
    expect(names(p)).toEqual(['a', 'c', 'b', 'd']);
    expect(p.tabs[2].groupId).toBeNull();
    expect(memberIndices(p, g.id)).toEqual([0, 1]);
  });

  it('removeTabFromGroup des letzten Mitglieds entfernt die Gruppe', () => {
    const p = pane([tab('a'), tab('b')]);
    const g = createTabGroup(p, 0, {});
    removeTabFromGroup(p, 0);
    expect(groupById(p, g.id)).toBeNull();
    expect(p.groups).toHaveLength(0);
  });

  it('dissolveGroup laesst Tabs an Ort und Stelle', () => {
    const p = pane([tab('a'), tab('b'), tab('c')]);
    const g = createTabGroup(p, 0, {});
    addTabToGroup(p, 1, g.id);
    dissolveGroup(p, g.id);
    expect(names(p)).toEqual(['a', 'b', 'c']);
    expect(p.tabs.every((t) => t.groupId === null)).toBe(true);
    expect(p.groups).toHaveLength(0);
  });

  it('pruneEmptyGroups entfernt Gruppen ohne Mitglieder', () => {
    const p = pane([tab('a')]);
    const g = createTabGroup(p, 0, {});
    p.tabs.splice(0, 1); // Schliessen-Aequivalent
    pruneEmptyGroups(p);
    expect(groupById(p, g.id)).toBeNull();
  });
});

describe('Tab-Gruppen: Einfuege-Semantik (4T-000459)', () => {
  // Streifen: a [b c] d (Gruppe tgX)
  function stripe() {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')]);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    return { p, g };
  }

  it('strikt im Block-Inneren: Beitritt', () => {
    const { p, g } = stripe();
    expect(groupIdForInsertion(p.tabs, 2)).toBe(g.id);
  });

  it('an den Block-Raendern: kein Beitritt fremder Tabs', () => {
    const { p } = stripe();
    expect(groupIdForInsertion(p.tabs, 1)).toBeNull(); // vor 'b'
    expect(groupIdForInsertion(p.tabs, 3)).toBeNull(); // nach 'c'
    expect(groupIdForInsertion(p.tabs, 0)).toBeNull();
    expect(groupIdForInsertion(p.tabs, 4)).toBeNull();
  });

  it('eigene Gruppe haelt ihren Tab auch am Block-Rand', () => {
    const { p, g } = stripe();
    // 'c' innerhalb der eigenen Gruppe an den Block-Anfang ziehen:
    // Post-Splice-Sicht ohne 'c' ist [a, b, d], Einfuege-Index 1.
    const without = p.tabs.filter((t) => t.path !== 'c');
    expect(groupIdForInsertion(without, 1, g.id)).toBe(g.id);
    expect(groupIdForInsertion(without, 2, g.id)).toBe(g.id);
    // Vollstaendig ausserhalb des Blocks: Austritt.
    expect(groupIdForInsertion(without, 0, g.id)).toBeNull();
    expect(groupIdForInsertion(without, 3, g.id)).toBeNull();
  });
});

// 4T-000766 (Epic 3E-000158): Mengen-Fassungen der drei Einzel-Operationen. Die
// Menge tritt am Block-ENDE bei (PO-Entscheidung vom 2026-07-28), verlaesst
// die Gruppe hinter ihrem Block und bildet eine neue Gruppe an der Stelle des
// ersten Ausgewaehlten.
describe('Tab-Gruppen: Mengen-Operationen (4T-000766)', () => {
  it('addTabsToGroup haengt die Menge in Streifen-Reihenfolge ans Block-Ende', () => {
    const p = pane([tab('x'), tab('a'), tab('y'), tab('z')], 0);
    const g = createTabGroup(p, 1, {});
    addTabsToGroup(p, [3, 0], g.id);
    expect(names(p)).toEqual(['a', 'x', 'z', 'y']);
    expect(memberIndices(p, g.id)).toEqual([0, 1, 2]);
    expect(p.tabs[p.activeIndex].path).toBe('x');
  });

  it('addTabsToGroup laesst bereits zugehoerige Reiter an ihrem Platz', () => {
    const p = pane([tab('a'), tab('b'), tab('c')], 0);
    const g = createTabGroup(p, 0, {});
    addTabsToGroup(p, [0, 2], g.id);
    expect(names(p)).toEqual(['a', 'c', 'b']);
    expect(memberIndices(p, g.id)).toEqual([0, 1]);
  });

  it('addTabsToGroup meldet false ohne unbekannte Gruppe und ohne Wirkung', () => {
    const p = pane([tab('a'), tab('b')], 0);
    const g = createTabGroup(p, 0, {});
    expect(addTabsToGroup(p, [1], 'tg-fremd')).toBe(false);
    expect(addTabsToGroup(p, [0], g.id)).toBe(false); // schon Mitglied
  });

  it('removeTabsFromGroup stellt die Menge hinter ihren Block', () => {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')], 3);
    const g = createTabGroup(p, 0, {});
    addTabsToGroup(p, [1, 2], g.id);
    // Block: a b c | d — 'a' und 'b' austreten lassen.
    removeTabsFromGroup(p, [0, 1]);
    expect(names(p)).toEqual(['c', 'a', 'b', 'd']);
    expect(memberIndices(p, g.id)).toEqual([0]);
    expect(p.tabs[p.activeIndex].path).toBe('d');
  });

  it('removeTabsFromGroup bedient mehrere Gruppen je fuer sich', () => {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')], 0);
    const g1 = createTabGroup(p, 0, {});
    addTabsToGroup(p, [1], g1.id);
    const g2 = createTabGroup(p, 2, {});
    addTabsToGroup(p, [3], g2.id);
    removeTabsFromGroup(p, [0, 2]);
    expect(names(p)).toEqual(['b', 'a', 'd', 'c']);
    expect(memberIndices(p, g1.id)).toEqual([0]);
    expect(memberIndices(p, g2.id)).toEqual([2]);
  });

  it('removeTabsFromGroup der letzten Mitglieder entfernt die Gruppe, ohne zu verschieben', () => {
    const p = pane([tab('a'), tab('b'), tab('c')], 0);
    const g = createTabGroup(p, 0, {});
    addTabsToGroup(p, [1], g.id);
    removeTabsFromGroup(p, [0, 1]);
    expect(names(p)).toEqual(['a', 'b', 'c']);
    expect(groupById(p, g.id)).toBeNull();
  });

  it('createTabGroupFromTabs schiebt die Menge an der Stelle des ersten zusammen', () => {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')], 3);
    const g = createTabGroupFromTabs(p, [1, 3], { name: 'Menge' });
    expect(names(p)).toEqual(['a', 'b', 'd', 'c']);
    expect(memberIndices(p, g.id)).toEqual([1, 2]);
    expect(g.name).toBe('Menge');
    expect(p.tabs[p.activeIndex].path).toBe('d');
  });

  it('createTabGroupFromTabs beendet bestehende Mitgliedschaften', () => {
    const p = pane([tab('a'), tab('b'), tab('c')], 0);
    const alt = createTabGroup(p, 0, {});
    addTabsToGroup(p, [1], alt.id);
    const neu = createTabGroupFromTabs(p, [0, 2], {});
    expect(memberIndices(p, neu.id)).toEqual([0, 1]);
    expect(memberIndices(p, alt.id)).toEqual([2]);
  });
});

// 4T-000648 (Epic 3E-000130): Ein Reiter, der aus einem anderen heraus entsteht,
// liegt unmittelbar rechts neben diesem Herkunfts-Reiter. Loest die
// Einfuegung am Gruppen-Ende aus 4T-000631 ab. 'h' steht fuer den Folge-Reiter.
describe('Tab-Gruppen: Platzierung neben dem Herkunfts-Reiter (4T-000648)', () => {
  it('insertTabNextTo fuegt hinter dem Herkunfts-Reiter ein', () => {
    const p = pane([tab('a'), tab('b'), tab('c')]);
    const idx = insertTabNextTo(p, tab('h'), 1);
    expect(idx).toBe(2);
    expect(names(p)).toEqual(['a', 'b', 'h', 'c']);
  });

  it('insertTabNextTo rueckt den aktiven Index nur bei Bedarf', () => {
    // aktiv 'c' (Index 2) liegt an der Einfuege-Stelle -> rutscht auf 3.
    const p = pane([tab('a'), tab('b'), tab('c')], 2);
    insertTabNextTo(p, tab('h'), 1);
    expect(p.tabs[p.activeIndex].path).toBe('c');
    // aktiv 'a' (Index 0) liegt davor -> unveraendert.
    const q = pane([tab('a'), tab('b'), tab('c')], 0);
    insertTabNextTo(q, tab('h'), 1);
    expect(q.activeIndex).toBe(0);
  });

  it('insertTabNextTo uebernimmt die Gruppe des Herkunfts-Reiters im Block-Inneren', () => {
    const p = pane([tab('x'), tab('a'), tab('b'), tab('y')]);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    const neu = tab('h');
    // Bezug ist 'a' (Index 1), also strikt im Inneren des Blocks [a b].
    expect(insertTabNextTo(p, neu, 1)).toBe(2);
    expect(neu.groupId).toBe(g.id);
    expect(names(p)).toEqual(['x', 'a', 'h', 'b', 'y']);
    // Zusammenhangs-Invariante: der Block bleibt lueckenlos.
    expect(memberIndices(p, g.id)).toEqual([1, 2, 3]);
  });

  it('insertTabNextTo uebernimmt die Gruppe auch am rechten Block-Rand', () => {
    const p = pane([tab('x'), tab('a'), tab('b'), tab('y')]);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    const neu = tab('h');
    // Bezug ist 'b' (Index 2), das letzte Mitglied.
    expect(insertTabNextTo(p, neu, 2)).toBe(3);
    expect(neu.groupId).toBe(g.id);
    expect(memberIndices(p, g.id)).toEqual([1, 2, 3]);
  });

  it('insertTabNextTo laesst den neuen Reiter bei ungruppierter Herkunft gruppenlos', () => {
    const p = pane([tab('x'), tab('a'), tab('b')]);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    const neu = tab('h');
    // Bezug ist 'x' (Index 0) — vor dem Block, ohne Gruppe.
    expect(insertTabNextTo(p, neu, 0)).toBe(1);
    expect(neu.groupId).toBeNull();
    expect(names(p)).toEqual(['x', 'h', 'a', 'b']);
    expect(memberIndices(p, g.id)).toEqual([2, 3]);
  });

  it('insertTabNextTo liefert -1 ohne gueltigen Bezug und laesst die Pane unveraendert', () => {
    const p = pane([tab('a'), tab('b')]);
    const neu = tab('h');
    expect(insertTabNextTo(p, neu, -1)).toBe(-1);
    expect(insertTabNextTo(p, neu, 5)).toBe(-1);
    expect(insertTabNextTo(p, null, 0)).toBe(-1);
    expect(names(p)).toEqual(['a', 'b']);
  });

  it('moveTabNextTo verschiebt von rechts hinter den Bezug', () => {
    const p = pane([tab('a'), tab('b'), tab('h')]);
    expect(moveTabNextTo(p, 2, 0)).toBe(1);
    expect(names(p)).toEqual(['a', 'h', 'b']);
  });

  it('moveTabNextTo verschiebt von links hinter den Bezug (Index-Korrektur)', () => {
    const p = pane([tab('h'), tab('a'), tab('b')]);
    // 'h' entfaellt vorn, 'b' rutscht auf 1 — Ziel ist der Index des Bezugs.
    expect(moveTabNextTo(p, 0, 2)).toBe(2);
    expect(names(p)).toEqual(['a', 'b', 'h']);
  });

  it('moveTabNextTo laesst einen bereits benachbarten Reiter liegen', () => {
    const p = pane([tab('a'), tab('h'), tab('b')]);
    expect(moveTabNextTo(p, 1, 0)).toBe(1);
    expect(names(p)).toEqual(['a', 'h', 'b']);
  });

  it('moveTabNextTo haelt den aktiven Reiter und wechselt die Gruppe mit', () => {
    const p = pane([tab('x'), tab('a'), tab('b'), tab('h')], 0);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    expect(p.tabs[p.activeIndex].path).toBe('x');
    // Umbinden auf 'a' im Gruppen-Inneren.
    expect(moveTabNextTo(p, 3, 1)).toBe(2);
    expect(names(p)).toEqual(['x', 'a', 'h', 'b']);
    expect(p.tabs[2].groupId).toBe(g.id);
    expect(memberIndices(p, g.id)).toEqual([1, 2, 3]);
    expect(p.tabs[p.activeIndex].path).toBe('x');
  });

  it('moveTabNextTo raeumt eine leer gewordene Herkunfts-Gruppe ab', () => {
    const p = pane([tab('a'), tab('h'), tab('b')]);
    const g = createTabGroup(p, 1, {}); // Gruppe nur mit dem Folge-Reiter
    expect(groupById(p, g.id)).toBeTruthy();
    expect(moveTabNextTo(p, 1, 2)).toBe(2);
    expect(names(p)).toEqual(['a', 'b', 'h']);
    expect(p.tabs[2].groupId).toBeNull();
    expect(groupById(p, g.id)).toBeNull();
  });

  it('moveTabNextTo liefert -1 bei ungueltigen Indizes', () => {
    const p = pane([tab('a'), tab('h')]);
    expect(moveTabNextTo(p, 1, 1)).toBe(-1);
    expect(moveTabNextTo(p, 5, 0)).toBe(-1);
    expect(moveTabNextTo(p, 1, 9)).toBe(-1);
    expect(names(p)).toEqual(['a', 'h']);
  });
});

describe('Tab-Gruppen: Klapp-Zustand (4T-000459)', () => {
  it('isTabVisible respektiert collapsed', () => {
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')]);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    g.collapsed = true;
    expect(isTabVisible(p, 0)).toBe(true);
    expect(isTabVisible(p, 1)).toBe(false);
    expect(isTabVisible(p, 2)).toBe(false);
    expect(isTabVisible(p, 3)).toBe(true);
  });

  // 4T-000767 (Epic 3E-000158): Die Sichtbarkeits-Garantie des aktiven Reiters ist
  // entfallen; eine zugeklappte Gruppe darf ihn enthalten. Die frueheren
  // Faelle zu expandGroupOfTab, nextVisibleTabIndex und ensureActiveTabVisible
  // (4T-000460) sind mit diesen Helfern entfallen.
  it('ein verborgener Reiter darf der aktive sein', () => {
    const p = pane([tab('a'), tab('b')], 0);
    const g = createTabGroup(p, 0, {});
    g.collapsed = true;
    expect(isTabVisible(p, p.activeIndex)).toBe(false);
    expect(p.activeIndex).toBe(0);
    expect(g.collapsed).toBe(true);
  });
});

describe('Tab-Gruppen: Block-Verschiebung (4T-000460)', () => {
  it('moveGroupWithinPane verschiebt den Block und haelt den aktiven Tab', () => {
    // Streifen: [a b] c d, aktiv 'c'; Gruppe ans Ende ziehen.
    const p = pane([tab('a'), tab('b'), tab('c'), tab('d')], 2);
    const g = createTabGroup(p, 0, {});
    addTabToGroup(p, 1, g.id);
    moveGroupWithinPane(p, g.id, 4);
    expect(names(p)).toEqual(['c', 'd', 'a', 'b']);
    expect(memberIndices(p, g.id)).toEqual([2, 3]);
    expect(p.tabs[p.activeIndex].path).toBe('c');
  });

  it('moveGroupWithinPane spaltet fremde Bloecke nicht (Schnappen dahinter)', () => {
    // Streifen: [a b] x [c d] — Gruppe 1 mitten in Gruppe 2 fallen lassen.
    const p = pane([tab('a'), tab('b'), tab('x'), tab('c'), tab('d')], 2);
    const g1 = createTabGroup(p, 0, {});
    addTabToGroup(p, 1, g1.id);
    const g2 = createTabGroup(p, 3, {});
    addTabToGroup(p, 4, g2.id);
    moveGroupWithinPane(p, g1.id, 4); // Zielpunkt zwischen 'c' und 'd'
    expect(names(p)).toEqual(['x', 'c', 'd', 'a', 'b']);
    expect(memberIndices(p, g2.id)).toEqual([1, 2]);
    expect(memberIndices(p, g1.id)).toEqual([3, 4]);
  });

  it('moveGroupWithinPane rechnet Einfuege-Indizes hinter dem eigenen Block um', () => {
    // Streifen: x [a b] y — Gruppe an den Anfang ziehen.
    const p = pane([tab('x'), tab('a'), tab('b'), tab('y')], 0);
    const g = createTabGroup(p, 1, {});
    addTabToGroup(p, 2, g.id);
    moveGroupWithinPane(p, g.id, 0);
    expect(names(p)).toEqual(['a', 'b', 'x', 'y']);
    expect(p.tabs[p.activeIndex].path).toBe('x');
  });
});

describe('Tab-Gruppen: Normalisierung (4T-000459)', () => {
  it('repariert Nicht-Zusammenhang durch stabile Umordnung', () => {
    const p = pane([tab('a', 'tg1'), tab('x'), tab('b', 'tg1'), tab('y')], 1);
    p.groups = [{ id: 'tg1', name: 'G', color: 'blue', collapsed: false }];
    normalizePaneGroups(p);
    expect(names(p)).toEqual(['a', 'b', 'x', 'y']);
    expect(memberIndices(p, 'tg1')).toEqual([0, 1]);
    // aktiver Tab ('x') folgt der Umordnung.
    expect(p.tabs[p.activeIndex].path).toBe('x');
  });

  it('kappt unbekannte groupIds und bereinigt Farben/Namen/Flags', () => {
    const p = pane([tab('a', 'kaputt'), tab('b', 'tg1')]);
    p.groups = [{ id: 'tg1', name: null, color: 'neon', collapsed: 1 }];
    normalizePaneGroups(p);
    expect(p.tabs[0].groupId).toBeNull();
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].name).toBe('');
    expect(p.groups[0].color).toBe(TAB_GROUP_COLOR_KEYS[0]);
    expect(p.groups[0].collapsed).toBe(true);
  });

  it('entfernt leere Gruppen', () => {
    const p = pane([tab('a')]);
    p.groups = [{ id: 'tg1', name: 'leer', color: 'blue', collapsed: false }];
    normalizePaneGroups(p);
    expect(p.groups).toHaveLength(0);
  });
});

describe('Erweiterung tab-groups (4T-000461)', () => {
  it('ist als Werkzeug-Erweiterung registriert und traegt keine Kommandos', () => {
    expect(isExtensionId('tab-groups')).toBe(true);
    const manifest = extensionById('tab-groups');
    expect(manifest.category).toBe('tools');
    expect(manifest.nameKey).toBe('help.featureName.tabGroups');
    expect(manifest.commands).toBeUndefined();
    // Abschalten filtert keine Kommandos (Verwaltung laeuft ausschliesslich
    // ueber die Kontextmenues, die der Renderer selbst ausblendet).
    expect(disabledCommandIdSet(['tab-groups']).size).toBe(0);
  });
});

describe('Tab-Gruppen: Sitzungs-Persistenz (4T-000459)', () => {
  it('buildGroupsSnapshot arbeitet auf den gefilterten Indizes', () => {
    // Streifen: a [b (System) c] d — der pfadlose System-Tab faellt aus
    // der Sitzung, die Gruppe bleibt mit 'c' erhalten.
    const p = pane([tab('a'), tab(null), tab('c'), tab('d')]);
    const g = createTabGroup(p, 1, { name: 'Recherche', color: 'green' });
    addTabToGroup(p, 2, g.id);
    g.collapsed = true;
    const kept = [];
    p.tabs.forEach((t, i) => {
      if (t.path) kept.push(i);
    });
    const { groups, groupOf } = buildGroupsSnapshot(p, kept);
    expect(groups).toEqual([{ name: 'Recherche', color: 'green', collapsed: true }]);
    expect(groupOf).toEqual([-1, 0, -1]);
  });

  it('Gruppen nur aus pfadlosen Tabs entfallen im Snapshot', () => {
    const p = pane([tab(null), tab('b')]);
    createTabGroup(p, 0, {});
    const { groups, groupOf } = buildGroupsSnapshot(p, [1]);
    expect(groups).toEqual([]);
    expect(groupOf).toEqual([-1]);
  });

  it('Roundtrip: Snapshot -> Wiederherstellung erhaelt Name, Farbe, Klapp-Zustand und Mitglieder', () => {
    const src = pane([tab('a'), tab('b'), tab('c'), tab('d')]);
    const g1 = createTabGroup(src, 0, { name: 'Eins', color: 'red' });
    addTabToGroup(src, 1, g1.id);
    const g2 = createTabGroup(src, 3, { name: 'Zwei', color: 'cyan' });
    g2.collapsed = true;
    const kept = [0, 1, 2, 3];
    const { groups, groupOf } = buildGroupsSnapshot(src, kept);

    const dst = pane([tab('a'), tab('b'), tab('c'), tab('d')]);
    restoreGroupsIntoPane(dst, groups, groupOf);
    expect(dst.groups).toHaveLength(2);
    expect(dst.groups[0]).toMatchObject({ name: 'Eins', color: 'red', collapsed: false });
    expect(dst.groups[1]).toMatchObject({ name: 'Zwei', color: 'cyan', collapsed: true });
    expect(memberIndices(dst, dst.groups[0].id)).toEqual([0, 1]);
    expect(memberIndices(dst, dst.groups[1].id)).toEqual([3]);
    expect(dst.tabs[2].groupId).toBeNull();
  });

  it('Alt-Snapshot ohne Gruppen laedt unveraendert (Abwaertskompatibilitaet)', () => {
    const p = pane([tab('a'), tab('b')], 1);
    restoreGroupsIntoPane(p, undefined, undefined);
    expect(p.groups).toEqual([]);
    expect(p.tabs.every((t) => t.groupId === null)).toBe(true);
    expect(p.activeIndex).toBe(1);
  });

  it('defekte Persistenz-Werte werden verworfen statt zu crashen', () => {
    const p = pane([tab('a'), tab('b')]);
    restoreGroupsIntoPane(p, [{ name: 42, color: 'neon', collapsed: 'ja' }, null], [0, 7]);
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].name).toBe('');
    expect(p.groups[0].color).toBe(TAB_GROUP_COLOR_KEYS[0]);
    expect(p.groups[0].collapsed).toBe(true);
    expect(p.tabs[0].groupId).toBe(p.groups[0].id);
    expect(p.tabs[1].groupId).toBeNull();
  });
});
