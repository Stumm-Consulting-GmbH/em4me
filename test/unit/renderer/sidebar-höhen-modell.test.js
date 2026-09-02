// @vitest-environment jsdom
// 4T-000855 (Epic 3E-000164): Höhen-Modell der Sidebar-Blöcke.
//
// Geprüft werden der Modus-Zustand samt Vorgabe, Persistenz und Robustheit
// gegen defekte Stände, der Gruppen-Schlüssel und vor allem die **Trennung
// beider Höhen-Speicher**: Ein Wechsel des Modells darf keine Höhen des
// jeweils anderen überschreiben, sonst verlöre das Zurückschalten die zuvor
// eingestellten Panel-Höhen (Akzeptanzkriterium der Anforderung).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const layoutMod = await import('../../../src/renderer/modules/sidebar-layout.js');

const {
  HEIGHT_MODE_GROUP,
  HEIGHT_MODE_PANEL,
  MIN_PANEL_HEIGHT,
  getGroupHeight,
  getPanelHeight,
  getPanelHeightMode,
  groupHeightKey,
  initSidebarLayoutFromStore,
  loadSidebarGroupHeights,
  loadSidebarPanelHeights,
  resetSidebarLayoutStateForTests,
  setGroupHeight,
  setPanelHeight,
  setPanelHeightMode,
} = layoutMod;

// Store-Stub pro Test frisch (Muster sidebar-layout.test.js).
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

describe('Höhen-Modell: Zustand und Persistenz', () => {
  it('die Vorgabe ist die Höhe je Panel', () => {
    expect(getPanelHeightMode()).toBe(HEIGHT_MODE_PANEL);
  });

  it('Umschalten setzt den Wert, feuert das Ereignis und persistiert', async () => {
    let ereignisse = 0;
    document.addEventListener('scg:sidebar-height-mode-changed', () => (ereignisse += 1));
    await setPanelHeightMode(HEIGHT_MODE_GROUP);
    expect(getPanelHeightMode()).toBe(HEIGHT_MODE_GROUP);
    expect(ereignisse).toBe(1);
    expect(storeWrites).toContainEqual(['sidebar.heightMode', HEIGHT_MODE_GROUP]);
  });

  it('ein unveränderter Wert ist ein No-op', async () => {
    await setPanelHeightMode(HEIGHT_MODE_PANEL);
    expect(storeWrites).toHaveLength(0);
  });

  it('persist:false schreibt nicht (Empfangspfad des Fenster-Broadcasts)', async () => {
    await setPanelHeightMode(HEIGHT_MODE_GROUP, { persist: false });
    expect(getPanelHeightMode()).toBe(HEIGHT_MODE_GROUP);
    expect(storeWrites).toHaveLength(0);
  });

  it('ein unbekannter Wert fällt auf die Vorgabe zurück', async () => {
    await setPanelHeightMode(HEIGHT_MODE_GROUP);
    await setPanelHeightMode('unfug');
    expect(getPanelHeightMode()).toBe(HEIGHT_MODE_PANEL);
  });

  it('der gespeicherte Modus gilt beim Start, ein defekter Stand nicht', async () => {
    storeValues.set('sidebar.heightMode', HEIGHT_MODE_GROUP);
    await initSidebarLayoutFromStore();
    expect(getPanelHeightMode()).toBe(HEIGHT_MODE_GROUP);

    resetSidebarLayoutStateForTests();
    storeValues.set('sidebar.heightMode', { kaputt: true });
    await initSidebarLayoutFromStore();
    expect(getPanelHeightMode()).toBe(HEIGHT_MODE_PANEL);
  });
});

describe('Gruppen-Schlüssel', () => {
  it('ist die ID des ersten Panels der Gruppe', () => {
    expect(groupHeightKey({ panels: ['outline', 'bookmarks'], active: 'bookmarks' })).toBe(
      'outline',
    );
  });

  it('bleibt stabil, wenn ein Panel hinten dazukommt', () => {
    const vorher = groupHeightKey({ panels: ['outline', 'bookmarks'], active: 'outline' });
    const nachher = groupHeightKey({
      panels: ['outline', 'bookmarks', 'tags'],
      active: 'tags',
    });
    expect(nachher).toBe(vorher);
  });

  it('ist unabhängig vom aktiven Reiter', () => {
    const a = groupHeightKey({ panels: ['outline', 'bookmarks'], active: 'outline' });
    const b = groupHeightKey({ panels: ['outline', 'bookmarks'], active: 'bookmarks' });
    expect(a).toBe(b);
  });

  it('liefert null für einen leeren oder ungültigen Slot', () => {
    expect(groupHeightKey({ panels: [], active: null })).toBeNull();
    expect(groupHeightKey(null)).toBeNull();
  });
});

describe('Gruppen-Höhen: Ablage', () => {
  it('setzen, lesen und löschen', async () => {
    expect(getGroupHeight('outline')).toBeNull();
    await setGroupHeight('outline', 300);
    expect(getGroupHeight('outline')).toBe(300);
    await setGroupHeight('outline', null);
    expect(getGroupHeight('outline')).toBeNull();
  });

  it('klemmt auf dieselben Grenzen wie die Panel-Höhen', async () => {
    await setGroupHeight('outline', 5);
    expect(getGroupHeight('outline')).toBe(MIN_PANEL_HEIGHT);
  });

  it('persistiert das ganze Objekt unter eigenem Schlüssel', async () => {
    await setGroupHeight('outline', 300);
    expect(storeWrites).toContainEqual(['sidebar.groupHeights', { outline: 300 }]);
  });

  it('lädt robust und verwirft defekte Einträge', async () => {
    storeValues.set('sidebar.groupHeights', { outline: 300, kaputt: 'viel', leer: null });
    await loadSidebarGroupHeights();
    expect(getGroupHeight('outline')).toBe(300);
    expect(getGroupHeight('kaputt')).toBeNull();
    expect(getGroupHeight('leer')).toBeNull();
  });
});

describe('Trennung beider Höhen-Speicher', () => {
  it('dieselbe ID trägt in beiden Modellen unabhängige Höhen', async () => {
    await setPanelHeight('outline', 200);
    await setGroupHeight('outline', 400);
    expect(getPanelHeight('outline')).toBe(200);
    expect(getGroupHeight('outline')).toBe(400);
  });

  it('das Löschen der Gruppen-Höhe lässt die Panel-Höhe unberührt', async () => {
    await setPanelHeight('outline', 200);
    await setGroupHeight('outline', 400);
    await setGroupHeight('outline', null);
    expect(getGroupHeight('outline')).toBeNull();
    expect(getPanelHeight('outline')).toBe(200);
  });

  it('ein Moduswechsel hin und zurück verliert keine Höhe', async () => {
    // Der eigentliche Regressions-Schutz: Wären beide Modelle auf denselben
    // Speicher gelegt, überschriebe die Gruppen-Höhe die Panel-Höhe, und das
    // Zurückschalten fände den alten Wert nicht mehr vor.
    await setPanelHeight('outline', 200);
    await setPanelHeightMode(HEIGHT_MODE_GROUP);
    await setGroupHeight('outline', 400);
    await setPanelHeightMode(HEIGHT_MODE_PANEL);
    expect(getPanelHeight('outline')).toBe(200);
    await setPanelHeightMode(HEIGHT_MODE_GROUP);
    expect(getGroupHeight('outline')).toBe(400);
  });

  it('beide Ablagen werden getrennt geladen', async () => {
    storeValues.set('sidebar.panelHeights', { outline: 200 });
    storeValues.set('sidebar.groupHeights', { outline: 400 });
    await loadSidebarPanelHeights();
    await loadSidebarGroupHeights();
    expect(getPanelHeight('outline')).toBe(200);
    expect(getGroupHeight('outline')).toBe(400);
  });
});
