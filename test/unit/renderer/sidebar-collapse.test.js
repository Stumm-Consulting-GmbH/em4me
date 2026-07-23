// @vitest-environment jsdom
// 4T-0697 (Epic 3E-0141): Zustand und Setter-Logik des Sidebar-Spalten-
// Kollaps. Der Kollaps-Zustand liegt getrennt von den Panel-Sichtbarkeiten
// im Renderer-State (app-state.js), Setter/Toggle/Clear rendern die
// betroffene Spalte neu und persistieren global (panels.js). Ohne echtes
// Sidebar-DOM ist renderSidebarForPane ein No-op (getPaneEls findet keine
// Container); geprüft wird die reine Zustands-, Persistenz- und Guard-Logik.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const appState = await import('../../../src/renderer/modules/app-state.js');
const panels = await import('../../../src/renderer/modules/panels.js');

const { state } = appState;

beforeEach(() => {
  // Frischer Zustand pro Fall (der State ist ein Modul-Singleton).
  state.sidebarCollapsed = { left: [false, false], right: [false, false] };
  state.activePaneIndex = 0;
  // reportMenuStateNow (tabs.js) läuft in den Settern mit; im Stub fehlt der
  // Melde-Kanal, deshalb hier neutralisiert. setSetting als Spy.
  window.api.reportMenuState = () => {};
  window.api.setSetting = vi.fn(async () => {});
});

describe('normalizeSidebarCollapsed (4T-0697)', () => {
  it('liefert die feste Form aus einem gültigen Wert', () => {
    expect(
      appState.normalizeSidebarCollapsed({ left: [true, false], right: [false, true] }),
    ).toEqual({ left: [true, false], right: [false, true] });
  });

  it('fehlende, defekte oder zu kurze Werte werden zu Default (alles aus)', () => {
    expect(appState.normalizeSidebarCollapsed(undefined)).toEqual({
      left: [false, false],
      right: [false, false],
    });
    expect(appState.normalizeSidebarCollapsed('quatsch')).toEqual({
      left: [false, false],
      right: [false, false],
    });
    // Zu kurze Arrays und Nicht-Boolean-Werte werden aufgefüllt bzw. gecastet.
    expect(appState.normalizeSidebarCollapsed({ left: [1], right: null })).toEqual({
      left: [true, false],
      right: [false, false],
    });
  });
});

describe('isSidebarCollapsed (4T-0697)', () => {
  it('liest den Zustand je Pane-Group und Seite; Unbekanntes gilt als nicht eingeklappt', () => {
    state.sidebarCollapsed = { left: [true, false], right: [false, true] };
    expect(appState.isSidebarCollapsed(0, 'left')).toBe(true);
    expect(appState.isSidebarCollapsed(1, 'left')).toBe(false);
    expect(appState.isSidebarCollapsed(1, 'right')).toBe(true);
    expect(appState.isSidebarCollapsed(0, 'right')).toBe(false);
    expect(appState.isSidebarCollapsed(9, 'left')).toBe(false);
  });
});

describe('setSidebarCollapsed / toggleSidebarCollapse (4T-0697)', () => {
  it('setzt genau die adressierte Spalte und persistiert global', () => {
    panels.setSidebarCollapsed(0, 'left', true);
    expect(state.sidebarCollapsed.left[0]).toBe(true);
    // Andere Pane-Group und andere Seite bleiben unberührt (Unabhängigkeit).
    expect(state.sidebarCollapsed.left[1]).toBe(false);
    expect(state.sidebarCollapsed.right[0]).toBe(false);
    expect(window.api.setSetting).toHaveBeenCalledWith('sidebarCollapsed', state.sidebarCollapsed);
  });

  it('geteilte Ansicht: Pane-Group 1 schaltet unabhängig von 0', () => {
    panels.setSidebarCollapsed(1, 'right', true);
    expect(state.sidebarCollapsed.right[1]).toBe(true);
    expect(state.sidebarCollapsed.right[0]).toBe(false);
    expect(state.sidebarCollapsed.left[1]).toBe(false);
  });

  it('unveränderter Wert ist ein No-op (kein Store-Write)', () => {
    panels.setSidebarCollapsed(0, 'left', false);
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });

  it('ungültige Seite oder Pane-Index bleiben wirkungslos', () => {
    panels.setSidebarCollapsed(0, 'oben', true);
    panels.setSidebarCollapsed(5, 'left', true);
    expect(state.sidebarCollapsed).toEqual({ left: [false, false], right: [false, false] });
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });

  it('toggle invertiert den Zustand der Spalte', () => {
    panels.toggleSidebarCollapse(0, 'left');
    expect(state.sidebarCollapsed.left[0]).toBe(true);
    panels.toggleSidebarCollapse(0, 'left');
    expect(state.sidebarCollapsed.left[0]).toBe(false);
  });
});

describe('clearSidebarCollapsed (4T-0697, Aus-Zustand der Erweiterung)', () => {
  it('hebt jeden eingeklappten Zustand auf und persistiert einmalig', () => {
    state.sidebarCollapsed = { left: [true, false], right: [false, true] };
    panels.clearSidebarCollapsed();
    expect(state.sidebarCollapsed).toEqual({ left: [false, false], right: [false, false] });
    expect(window.api.setSetting).toHaveBeenCalledTimes(1);
    expect(window.api.setSetting).toHaveBeenCalledWith('sidebarCollapsed', state.sidebarCollapsed);
  });

  it('No-op, wenn ohnehin alles ausgeklappt ist (kein Store-Write)', () => {
    panels.clearSidebarCollapsed();
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });
});
