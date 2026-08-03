// @vitest-environment jsdom
// 4T-0287 (Epic 3E-0051): Panel-Registry und Sidebar-Layout-Modell —
// Validierung/Normalisierung (inklusive unbekannter und fehlender
// Panel-IDs), Default-Layout, Verschiebe-/Gruppier-Operationen,
// Persistenz-Anwendung und Breiten-Migration (outline.width).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const layoutMod = await import('../../../src/renderer/modules/sidebar-layout.js');

const {
  DEFAULT_PANEL_ORDER,
  MIN_PANEL_HEIGHT,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  applySidebarLayout,
  clampPanelHeight,
  clampSidebarWidth,
  defaultSidebarLayout,
  dissolveGroup,
  findPanelInLayout,
  getPanelHeight,
  getSidebarLayout,
  getSidebarWidth,
  groupPanelWith,
  initSidebarLayoutFromStore,
  knownPanelIds,
  layoutsEqual,
  loadSidebarPanelHeights,
  movePanelRelativeTo,
  movePanelToNewSlot,
  normalizeSidebarLayout,
  registerSidebarPanel,
  resetSidebarLayout,
  resetSidebarLayoutStateForTests,
  setActivePanel,
  setPanelHeight,
  setSidebarWidth,
  sidebarPanelById,
  sidebarPanels,
} = layoutMod;

const KNOWN = [...DEFAULT_PANEL_ORDER];

// Store-Stub pro Test frisch: getSetting liest aus einer Map, setSetting
// protokolliert Schreibvorgänge (api.js bindet window.api als Referenz,
// Überschreiben der Funktionen wirkt daher auch im Modul).
let storeValues;
let storeWrites;
beforeEach(() => {
  resetSidebarLayoutStateForTests();
  storeValues = new Map();
  storeWrites = [];
  window.api.getSetting = async (key) => storeValues.get(key);
  window.api.setSetting = async (key, value) => {
    storeWrites.push([key, value]);
    storeValues.set(key, value);
  };
});

describe('Default-Layout (4T-0287, 4T-0563)', () => {
  it('expliziter Standard: Gruppen links und rechts (4T-0563)', () => {
    // 4T-0563 (Epic 3E-0102): der neue Standard verteilt die Panels auf beide
    // Seiten und bündelt sie thematisch als Reiter-Gruppen. Die PO-Vorgabe wird
    // hier hart gepinnt (nicht aus DEFAULT_SIDEBAR_STRUCTURE abgeleitet), damit
    // der Test eine unbeabsichtigte Änderung der Standard-Anordnung fängt.
    const layout = defaultSidebarLayout(KNOWN);
    expect(layout).toEqual({
      left: [
        // 4T-0844 (Epic 3E-0147): das Inhaltsverzeichnis des Buches schliesst
        // die Ort-Gruppe ab.
        { panels: ['bookmarks', 'area', 'book'], active: 'bookmarks' },
        // 4T-0759 (Epic 3E-0142): das Suchergebnis-Panel schliesst die
        // Finde-Gruppe ab.
        { panels: ['outline', 'subpages', 'filegraph', 'searchresults'], active: 'outline' },
        // 4T-0372 (Epic 3E-0069): die Uhr schliesst die Zeit-Gruppe ab.
        { panels: ['calendar', 'reminders', 'clock'], active: 'calendar' },
      ],
      right: [
        { panels: ['notes'], active: 'notes' },
        { panels: ['properties', 'tags', 'blockprops'], active: 'properties' },
        { panels: ['outgoing', 'backlinks'], active: 'outgoing' },
      ],
    });
  });
});

describe('normalizeSidebarLayout (Validierung)', () => {
  it('unbekannte Panel-IDs werden verworfen', () => {
    const layout = normalizeSidebarLayout(
      { left: [{ panels: ['outline', 'fremd'], active: 'fremd' }], right: [] },
      KNOWN,
    );
    expect(findPanelInLayout(layout, 'fremd')).toBeNull();
    expect(layout.left[0]).toEqual({ panels: ['outline'], active: 'outline' });
  });

  it('fehlende Panels werden als Einzel-Slots ans Ende der linken Seite ergänzt', () => {
    const layout = normalizeSidebarLayout(
      { left: [{ panels: ['tags'], active: 'tags' }], right: [] },
      KNOWN,
    );
    const ids = layout.left.map((s) => s.panels[0]);
    expect(ids[0]).toBe('tags');
    // Ergänzung in kanonischer Reihenfolge ohne das bereits vorhandene Panel.
    expect(ids.slice(1)).toEqual(KNOWN.filter((id) => id !== 'tags'));
  });

  it('Duplikate: das erste Vorkommen gewinnt', () => {
    const layout = normalizeSidebarLayout(
      {
        left: [{ panels: ['outline'], active: 'outline' }],
        right: [{ panels: ['outline', 'tags'], active: 'outline' }],
      },
      KNOWN,
    );
    expect(findPanelInLayout(layout, 'outline')).toEqual({
      side: 'left',
      slotIndex: 0,
      panelIndex: 0,
    });
    expect(layout.right[0].panels).toEqual(['tags']);
  });

  it('leere Slots verschwinden, ungültiges active fällt auf das erste Panel', () => {
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: [], active: 'outline' },
          { panels: ['tags', 'properties'], active: 'nicht-da' },
        ],
        right: [],
      },
      KNOWN,
    );
    expect(layout.left[0]).toEqual({ panels: ['tags', 'properties'], active: 'tags' });
  });

  it('defekter/leerer Input ergibt den Fallback (alle Panels links, keine Gruppen) (4T-0563)', () => {
    // 4T-0563 (Epic 3E-0102): Default und Defekt-Fallback sind entkoppelt.
    // normalizeSidebarLayout(null/defekt) liefert weiterhin alle bekannten
    // Panels als Einzel-Slots links (rechts leer), NICHT den expliziten Standard.
    const fallback = { left: KNOWN.map((id) => ({ panels: [id], active: id })), right: [] };
    for (const raw of [null, 'kaputt', 42, { left: 'x', right: [{ panels: 'y' }] }]) {
      expect(normalizeSidebarLayout(raw, KNOWN)).toEqual(fallback);
      // Entkopplungs-Pin: der Fallback ist nicht der explizite Default-Standard.
      expect(layoutsEqual(normalizeSidebarLayout(raw, KNOWN), defaultSidebarLayout(KNOWN))).toBe(
        false,
      );
    }
  });

  it('Reiter-Gruppen und Seiten-Zuordnung bleiben erhalten', () => {
    const raw = {
      left: [{ panels: ['outline', 'tags'], active: 'tags' }],
      right: [{ panels: ['bookmarks'], active: 'bookmarks' }],
    };
    const layout = normalizeSidebarLayout(raw, KNOWN);
    expect(layout.left[0]).toEqual({ panels: ['outline', 'tags'], active: 'tags' });
    expect(layout.right[0]).toEqual({ panels: ['bookmarks'], active: 'bookmarks' });
  });
});

describe('movePanelToNewSlot', () => {
  it('verschiebt ein Panel als eigenen Slot auf die rechte (leere) Seite', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture statt Default — der neue Standard
    // hat rechts bereits Slots, die frühere Annahme „rechts leer" gilt nicht mehr.
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['outline'], active: 'outline' },
          { panels: ['tags'], active: 'tags' },
        ],
        right: [],
      },
      KNOWN,
    );
    const leftCountBefore = layout.left.length;
    const next = movePanelToNewSlot(layout, 'outline', 'right', 0);
    expect(next.right).toEqual([{ panels: ['outline'], active: 'outline' }]);
    expect(findPanelInLayout(next, 'outline').side).toBe('right');
    expect(next.left.length).toBe(leftCountBefore - 1);
  });

  it('ändert die Reihenfolge innerhalb einer Seite (Index nach Entfernen)', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture statt Default. outline (Slot 2) an
    // Slot-Index 1 (nach Entfernen) einsortieren: ergibt bookmarks, outline,
    // properties als erste drei Panels.
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['bookmarks'], active: 'bookmarks' },
          { panels: ['properties'], active: 'properties' },
          { panels: ['outline'], active: 'outline' },
        ],
        right: [],
      },
      KNOWN,
    );
    const next = movePanelToNewSlot(layout, 'outline', 'left', 1);
    expect(next.left.map((s) => s.panels[0]).slice(0, 3)).toEqual([
      'bookmarks',
      'outline',
      'properties',
    ]);
  });

  it('klemmt den Slot-Index auf gültige Grenzen', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture statt Default (Klemm-Semantik
    // unabhängig von der Standard-Anordnung geprüft).
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['bookmarks'], active: 'bookmarks' },
          { panels: ['outline'], active: 'outline' },
        ],
        right: [],
      },
      KNOWN,
    );
    const next = movePanelToNewSlot(layout, 'outline', 'left', 99);
    expect(next.left[next.left.length - 1].panels).toEqual(['outline']);
    const next2 = movePanelToNewSlot(layout, 'bookmarks', 'left', -5);
    expect(next2.left[0].panels).toEqual(['bookmarks']);
  });

  it('zieht ein Panel aus einer Gruppe heraus und repariert deren active', () => {
    const layout = normalizeSidebarLayout(
      { left: [{ panels: ['outline', 'tags', 'properties'], active: 'tags' }], right: [] },
      KNOWN,
    );
    const next = movePanelToNewSlot(layout, 'tags', 'right', 0);
    expect(next.left[0].panels).toEqual(['outline', 'properties']);
    expect(next.left[0].active).toBe('outline');
    expect(next.right[0]).toEqual({ panels: ['tags'], active: 'tags' });
  });

  it('unbekanntes Panel und ungültige Seite sind No-ops (Eingabe-Referenz)', () => {
    const layout = defaultSidebarLayout(KNOWN);
    expect(movePanelToNewSlot(layout, 'fremd', 'left', 0)).toBe(layout);
    expect(movePanelToNewSlot(layout, 'outline', 'mitte', 0)).toBe(layout);
  });

  it('mutiert die Eingabe nicht', () => {
    const layout = defaultSidebarLayout(KNOWN);
    const snapshot = JSON.stringify(layout);
    movePanelToNewSlot(layout, 'outline', 'right', 0);
    expect(JSON.stringify(layout)).toBe(snapshot);
  });
});

describe('groupPanelWith', () => {
  it('bildet eine Reiter-Gruppe; das verschobene Panel wird aktiver Reiter', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture statt Default.
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['outline'], active: 'outline' },
          { panels: ['tags'], active: 'tags' },
        ],
        right: [],
      },
      KNOWN,
    );
    const leftCountBefore = layout.left.length;
    const next = groupPanelWith(layout, 'tags', 'outline');
    const loc = findPanelInLayout(next, 'outline');
    expect(next[loc.side][loc.slotIndex]).toEqual({ panels: ['outline', 'tags'], active: 'tags' });
    expect(next.left.length).toBe(leftCountBefore - 1);
  });

  it('erweitert eine bestehende Gruppe über Seiten-Grenzen hinweg', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture mit einem Slot rechts, statt den
    // Default umzubauen.
    const layout = normalizeSidebarLayout(
      {
        left: [{ panels: ['outline'], active: 'outline' }],
        right: [{ panels: ['bookmarks'], active: 'bookmarks' }],
      },
      KNOWN,
    );
    const next = groupPanelWith(layout, 'outline', 'bookmarks');
    expect(next.right[0]).toEqual({ panels: ['bookmarks', 'outline'], active: 'outline' });
    expect(findPanelInLayout(next, 'outline').side).toBe('right');
  });

  it('Selbst-Bezug, unbekannte IDs und gleicher Slot sind No-ops', () => {
    const layout = normalizeSidebarLayout(
      { left: [{ panels: ['outline', 'tags'], active: 'outline' }], right: [] },
      KNOWN,
    );
    expect(groupPanelWith(layout, 'outline', 'outline')).toBe(layout);
    expect(groupPanelWith(layout, 'fremd', 'outline')).toBe(layout);
    expect(groupPanelWith(layout, 'outline', 'fremd')).toBe(layout);
    expect(groupPanelWith(layout, 'tags', 'outline')).toBe(layout);
  });
});

describe('movePanelRelativeTo (4T-0289)', () => {
  it('verschiebt vor bzw. hinter den Slot des Ziel-Panels (Index-stabil)', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture statt Default.
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['bookmarks'], active: 'bookmarks' },
          { panels: ['properties'], active: 'properties' },
          { panels: ['outline'], active: 'outline' },
        ],
        right: [],
      },
      KNOWN,
    );
    // outline hinter bookmarks.
    const next = movePanelRelativeTo(layout, 'outline', 'bookmarks', 'after');
    const bookmarksIdx = next.left.findIndex((s) => s.panels.includes('bookmarks'));
    expect(next.left[bookmarksIdx + 1].panels).toEqual(['outline']);
    // outline (hinten) vor properties — Entfernen von outline verschiebt
    // properties nicht, Ziel wird über die Panel-ID re-identifiziert.
    const next2 = movePanelRelativeTo(layout, 'outline', 'properties', 'before');
    expect(next2.left.map((s) => s.panels[0]).slice(0, 3)).toEqual([
      'bookmarks',
      'outline',
      'properties',
    ]);
  });

  it('zieht ein Panel vor/hinter eine Gruppe als eigenen Slot', () => {
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['outline', 'tags'], active: 'outline' },
          { panels: ['bookmarks'], active: 'bookmarks' },
        ],
        right: [],
      },
      KNOWN,
    );
    const next = movePanelRelativeTo(layout, 'bookmarks', 'tags', 'before');
    expect(next.left[0].panels).toEqual(['bookmarks']);
    expect(next.left[1].panels).toEqual(['outline', 'tags']);
    // Gruppen-Mitglied hinter die eigene Gruppe ziehen (herauslösen).
    const next2 = movePanelRelativeTo(layout, 'tags', 'outline', 'after');
    expect(next2.left[0].panels).toEqual(['outline']);
    expect(next2.left[1].panels).toEqual(['tags']);
  });

  it('No-ops: Selbst-Bezug, unbekannte IDs, ungültige Position', () => {
    // 4T-0563 (Epic 3E-0102): Hand-Fixture — bookmarks liegt hier direkt vor
    // properties, damit der letzte Assert eine echte No-op-Position prüft.
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['bookmarks'], active: 'bookmarks' },
          { panels: ['properties'], active: 'properties' },
          { panels: ['outline', 'tags'], active: 'outline' },
        ],
        right: [],
      },
      KNOWN,
    );
    expect(movePanelRelativeTo(layout, 'outline', 'outline', 'before')).toBe(layout);
    expect(movePanelRelativeTo(layout, 'fremd', 'outline', 'before')).toBe(layout);
    expect(movePanelRelativeTo(layout, 'outline', 'fremd', 'after')).toBe(layout);
    expect(movePanelRelativeTo(layout, 'outline', 'tags', 'mitte')).toBe(layout);
    // Position unverändert (bookmarks direkt vor properties): No-op.
    expect(movePanelRelativeTo(layout, 'bookmarks', 'properties', 'before')).toBe(layout);
  });
});

describe('setActivePanel und dissolveGroup', () => {
  it('setActivePanel aktiviert den Reiter; bereits aktiv ist No-op', () => {
    const layout = normalizeSidebarLayout(
      { left: [{ panels: ['outline', 'tags'], active: 'outline' }], right: [] },
      KNOWN,
    );
    const next = setActivePanel(layout, 'tags');
    expect(next.left[0].active).toBe('tags');
    expect(setActivePanel(next, 'tags')).toBe(next);
    expect(setActivePanel(layout, 'fremd')).toBe(layout);
  });

  it('dissolveGroup ersetzt die Gruppe an Ort und Stelle durch Einzel-Slots', () => {
    const layout = normalizeSidebarLayout(
      {
        left: [
          { panels: ['properties'], active: 'properties' },
          { panels: ['outline', 'tags'], active: 'tags' },
          { panels: ['bookmarks'], active: 'bookmarks' },
        ],
        right: [],
      },
      KNOWN,
    );
    const next = dissolveGroup(layout, 'outline');
    expect(next.left.map((s) => s.panels[0]).slice(0, 4)).toEqual([
      'properties',
      'outline',
      'tags',
      'bookmarks',
    ]);
    // Einzel-Slot: No-op.
    expect(dissolveGroup(next, 'outline')).toBe(next);
  });
});

describe('Registry (registerSidebarPanel)', () => {
  it('registrierte Panels sind abrufbar; Re-Registrierung ersetzt', () => {
    registerSidebarPanel({ id: 'outline', titleKey: 'outline.title', sectionClass: 'a' });
    registerSidebarPanel({ id: 'outline', titleKey: 'outline.title', sectionClass: 'b' });
    expect(sidebarPanelById('outline').sectionClass).toBe('b');
    expect(sidebarPanelById('unbekannt')).toBeNull();
  });

  it('ohne Definitionsdaten wird nicht registriert', () => {
    registerSidebarPanel(null);
    registerSidebarPanel({ id: '' });
    registerSidebarPanel({ id: 'x' });
    expect(sidebarPanels()).toEqual([]);
  });

  it('knownPanelIds: eingebaute Reihenfolge zuerst, Erweiterungs-IDs hinten', () => {
    // Ohne Registrierung gilt die eingebaute Liste.
    expect(knownPanelIds()).toEqual(KNOWN);
    registerSidebarPanel({ id: 'extra', titleKey: 'x', sectionClass: 'sidebar-extra' });
    registerSidebarPanel({ id: 'tags', titleKey: 'tags.title', sectionClass: 'sidebar-tags' });
    registerSidebarPanel({
      id: 'outline',
      titleKey: 'outline.title',
      sectionClass: 'sidebar-outline',
    });
    // 4T-0475 (Epic 3E-0088): Default-Reihenfolge = tags vor outline.
    expect(knownPanelIds()).toEqual(['tags', 'outline', 'extra']);
  });
});

describe('Persistenz, Migration und Breiten', () => {
  it('ohne gespeicherten Wert entsteht das Default-Layout', async () => {
    await initSidebarLayoutFromStore();
    expect(layoutsEqual(getSidebarLayout(), defaultSidebarLayout(KNOWN))).toBe(true);
  });

  it('gespeicherter defekter Stand ergibt den Fallback, nicht den Default (4T-0563)', async () => {
    // 4T-0563 (Epic 3E-0102): Migration bleibt Nutzer-Layout-schonend. Ein
    // vorhandener (auch defekter) Speicher-Stand läuft durch
    // normalizeSidebarLayout und ergibt den Fallback (alle Panels links, flach),
    // NICHT den neuen expliziten Standard (der greift nur bei fehlendem Layout).
    storeValues.set('sidebar.layout', { left: 'quatsch' });
    await initSidebarLayoutFromStore();
    const layout = getSidebarLayout();
    expect(layout).toEqual({
      left: KNOWN.map((id) => ({ panels: [id], active: id })),
      right: [],
    });
    expect(layoutsEqual(layout, defaultSidebarLayout(KNOWN))).toBe(false);
  });

  it('gespeichertes Layout wird geladen und normalisiert', async () => {
    storeValues.set('sidebar.layout', {
      left: [{ panels: ['tags', 'fremd'], active: 'tags' }],
      right: [{ panels: ['outline'], active: 'outline' }],
    });
    await initSidebarLayoutFromStore();
    const layout = getSidebarLayout();
    expect(layout.right[0].panels).toEqual(['outline']);
    expect(findPanelInLayout(layout, 'fremd')).toBeNull();
    // Fehlende Panels ergänzt (alle bekannten IDs kommen vor).
    expect(KNOWN.every((id) => findPanelInLayout(layout, id))).toBe(true);
  });

  it('outline.width wird als Startbreite der linken Seite migriert', async () => {
    storeValues.set('outline.width', 333);
    await initSidebarLayoutFromStore();
    expect(getSidebarWidth('left')).toBe(333);
    expect(getSidebarWidth('right')).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('sidebar.widthLeft gewinnt gegenüber dem Legacy-Key', async () => {
    storeValues.set('outline.width', 333);
    storeValues.set('sidebar.widthLeft', 420);
    storeValues.set('sidebar.widthRight', 200);
    await initSidebarLayoutFromStore();
    expect(getSidebarWidth('left')).toBe(420);
    expect(getSidebarWidth('right')).toBe(200);
  });

  it('Breiten werden geklemmt und ungültige Werte auf den Default gesetzt', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth('abc')).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(null)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('setSidebarWidth persistiert seitengetrennt', async () => {
    await setSidebarWidth('left', 300);
    await setSidebarWidth('right', 999);
    expect(getSidebarWidth('left')).toBe(300);
    expect(getSidebarWidth('right')).toBe(SIDEBAR_MAX_WIDTH);
    expect(storeWrites).toEqual([
      ['sidebar.widthLeft', 300],
      ['sidebar.widthRight', SIDEBAR_MAX_WIDTH],
    ]);
  });

  it('applySidebarLayout feuert das Änderungs-Event und persistiert', async () => {
    await initSidebarLayoutFromStore();
    let fired = 0;
    const listener = () => {
      fired += 1;
    };
    document.addEventListener('scg:sidebar-layout-changed', listener);
    try {
      const next = movePanelToNewSlot(getSidebarLayout(), 'outline', 'right', 0);
      expect(await applySidebarLayout(next)).toBe(true);
      expect(fired).toBe(1);
      expect(storeWrites.some(([key]) => key === 'sidebar.layout')).toBe(true);
      expect(findPanelInLayout(getSidebarLayout(), 'outline').side).toBe('right');
      // Unverändertes Layout: No-op ohne Event und ohne Persist.
      const writesBefore = storeWrites.length;
      expect(await applySidebarLayout(next)).toBe(false);
      expect(fired).toBe(1);
      expect(storeWrites.length).toBe(writesBefore);
    } finally {
      document.removeEventListener('scg:sidebar-layout-changed', listener);
    }
  });

  it('applySidebarLayout mit persist:false schreibt nicht in den Store', async () => {
    await initSidebarLayoutFromStore();
    const next = movePanelToNewSlot(getSidebarLayout(), 'tags', 'right', 0);
    expect(await applySidebarLayout(next, { persist: false })).toBe(true);
    expect(storeWrites.length).toBe(0);
  });

  it('resetSidebarLayout stellt das Default-Layout wieder her', async () => {
    await initSidebarLayoutFromStore();
    await applySidebarLayout(movePanelToNewSlot(getSidebarLayout(), 'outline', 'right', 0));
    expect(await resetSidebarLayout()).toBe(true);
    expect(layoutsEqual(getSidebarLayout(), defaultSidebarLayout(KNOWN))).toBe(true);
  });
});

// 4T-0475 (Epic 3E-0088): getauschte Default-Reihenfolge (Lesezeichen vor
// Inhaltsverzeichnis). 4T-0563 (Epic 3E-0102): zusätzlich 'subpages' in der
// kanonischen Reihenfolge und Notizen rechts im neuen Standard-Layout.
describe('Default-Reihenfolge nach Panel-Tausch (4T-0475, 4T-0563)', () => {
  it("DEFAULT_PANEL_ORDER beginnt mit 'bookmarks'; 'outline' an alter bookmarks-Position", () => {
    expect(DEFAULT_PANEL_ORDER[0]).toBe('bookmarks');
    // Die alte bookmarks-Position lag unmittelbar hinter 'notes'.
    const notesIdx = DEFAULT_PANEL_ORDER.indexOf('notes');
    expect(DEFAULT_PANEL_ORDER[notesIdx + 1]).toBe('outline');
    // Der Tausch erzeugt kein doppeltes/fehlendes Panel.
    expect(DEFAULT_PANEL_ORDER.filter((id) => id === 'outline')).toHaveLength(1);
    expect(DEFAULT_PANEL_ORDER.filter((id) => id === 'bookmarks')).toHaveLength(1);
    // 4T-0563 (Epic 3E-0102): 'subpages' in die kanonische Reihenfolge
    // aufgenommen, unmittelbar hinter 'outline'.
    expect(DEFAULT_PANEL_ORDER).toContain('subpages');
    const outlineIdx = DEFAULT_PANEL_ORDER.indexOf('outline');
    expect(DEFAULT_PANEL_ORDER[outlineIdx + 1]).toBe('subpages');
    expect(DEFAULT_PANEL_ORDER.filter((id) => id === 'subpages')).toHaveLength(1);
  });

  it('Default-Layout: Lesezeichen vorn links, Notizen als erster Slot rechts (4T-0563)', () => {
    const layout = defaultSidebarLayout(KNOWN);
    // 4T-0475 (Epic 3E-0088): Lesezeichen bleiben das vorderste Panel links.
    expect(layout.left[0].panels[0]).toBe('bookmarks');
    // 4T-0563 (Epic 3E-0102): Notizen liegen im neuen Standard rechts als
    // erster Slot.
    expect(layout.right[0].panels[0]).toBe('notes');
  });
});

// 4T-0475 (Epic 3E-0088): manuell einstellbare Panel-Höhen (Modell,
// Persistenz-Key sidebar.panelHeights, Lade-Logik).
describe('Panel-Höhen (4T-0475)', () => {
  it('clampPanelHeight: numerische Sanity, min/max, ungültig → null', () => {
    expect(clampPanelHeight(10)).toBe(MIN_PANEL_HEIGHT);
    expect(clampPanelHeight(9999)).toBe(2000);
    expect(clampPanelHeight(250)).toBe(250);
    expect(clampPanelHeight(250.6)).toBe(251);
    expect(clampPanelHeight('abc')).toBeNull();
    expect(clampPanelHeight(null)).toBeNull();
    expect(clampPanelHeight(undefined)).toBeNull();
  });

  it('set/get: gesetzte Höhe wird geklemmt zurückgeliefert', async () => {
    expect(getPanelHeight('outline')).toBeNull();
    await setPanelHeight('outline', 300);
    expect(getPanelHeight('outline')).toBe(300);
    await setPanelHeight('outline', 10); // unter Minimum → geklemmt
    expect(getPanelHeight('outline')).toBe(MIN_PANEL_HEIGHT);
  });

  it('null löscht den Eintrag (zurück auf Automatik)', async () => {
    await setPanelHeight('tags', 200);
    expect(getPanelHeight('tags')).toBe(200);
    await setPanelHeight('tags', null);
    expect(getPanelHeight('tags')).toBeNull();
  });

  it('persistFn erhält den Key sidebar.panelHeights als Objekt', async () => {
    await setPanelHeight('outline', 300);
    await setPanelHeight('tags', 150);
    const heightWrites = storeWrites.filter(([key]) => key === 'sidebar.panelHeights');
    expect(heightWrites).toHaveLength(2);
    expect(heightWrites.at(-1)[1]).toEqual({ outline: 300, tags: 150 });
    // Löschen persistiert das reduzierte Objekt.
    await setPanelHeight('outline', null);
    expect(storeWrites.at(-1)).toEqual(['sidebar.panelHeights', { tags: 150 }]);
  });

  it('persist:false schreibt nicht in den Store', async () => {
    await setPanelHeight('outline', 300, { persist: false });
    expect(getPanelHeight('outline')).toBe(300);
    expect(storeWrites.filter(([key]) => key === 'sidebar.panelHeights')).toHaveLength(0);
  });

  it('loadSidebarPanelHeights übernimmt gültige Werte und verwirft ungültige', async () => {
    storeValues.set('sidebar.panelHeights', { outline: 300, tags: 5, bookmarks: 'x' });
    await loadSidebarPanelHeights();
    expect(getPanelHeight('outline')).toBe(300);
    // Zu kleiner Wert wird geklemmt (gültig, daher übernommen).
    expect(getPanelHeight('tags')).toBe(MIN_PANEL_HEIGHT);
    // Nicht-numerisch → verworfen.
    expect(getPanelHeight('bookmarks')).toBeNull();
  });
});
