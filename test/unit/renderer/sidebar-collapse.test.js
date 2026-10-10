// @vitest-environment jsdom
// 4T-000697 (Epic 3E-000141): Zustand und Setter-Logik des Sidebar-Spalten-
// Kollaps. Der Kollaps-Zustand liegt getrennt von den Panel-Sichtbarkeiten
// im Renderer-State (app-state.js), Setter/Toggle/Clear rendern die
// betroffene Spalte neu und persistieren global (panels/sidebar-collapse.js). Ohne echtes
// Sidebar-DOM ist renderSidebarForPane ein No-op (getPaneEls findet keine
// Container); geprüft wird die reine Zustands-, Persistenz- und Guard-Logik.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const appState = await import('../../../src/renderer/modules/app/app-state.js');
const collapse = await import('../../../src/renderer/modules/panels/sidebar-collapse.js');

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

describe('normalizeSidebarCollapsed (4T-000697)', () => {
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

describe('isSidebarCollapsed (4T-000697)', () => {
  it('liest den Zustand je Pane-Group und Seite; Unbekanntes gilt als nicht eingeklappt', () => {
    state.sidebarCollapsed = { left: [true, false], right: [false, true] };
    expect(appState.isSidebarCollapsed(0, 'left')).toBe(true);
    expect(appState.isSidebarCollapsed(1, 'left')).toBe(false);
    expect(appState.isSidebarCollapsed(1, 'right')).toBe(true);
    expect(appState.isSidebarCollapsed(0, 'right')).toBe(false);
    expect(appState.isSidebarCollapsed(9, 'left')).toBe(false);
  });
});

describe('setSidebarCollapsed / toggleSidebarCollapse (4T-000697)', () => {
  it('setzt genau die adressierte Spalte und persistiert global', () => {
    collapse.setSidebarCollapsed(0, 'left', true);
    expect(state.sidebarCollapsed.left[0]).toBe(true);
    // Andere Pane-Group und andere Seite bleiben unberührt (Unabhängigkeit).
    expect(state.sidebarCollapsed.left[1]).toBe(false);
    expect(state.sidebarCollapsed.right[0]).toBe(false);
    expect(window.api.setSetting).toHaveBeenCalledWith('sidebarCollapsed', state.sidebarCollapsed);
  });

  it('geteilte Ansicht: Pane-Group 1 schaltet unabhängig von 0', () => {
    collapse.setSidebarCollapsed(1, 'right', true);
    expect(state.sidebarCollapsed.right[1]).toBe(true);
    expect(state.sidebarCollapsed.right[0]).toBe(false);
    expect(state.sidebarCollapsed.left[1]).toBe(false);
  });

  it('unveränderter Wert ist ein No-op (kein Store-Write)', () => {
    collapse.setSidebarCollapsed(0, 'left', false);
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });

  it('ungültige Seite oder Pane-Index bleiben wirkungslos', () => {
    collapse.setSidebarCollapsed(0, 'oben', true);
    collapse.setSidebarCollapsed(5, 'left', true);
    expect(state.sidebarCollapsed).toEqual({ left: [false, false], right: [false, false] });
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });

  it('toggle invertiert den Zustand der Spalte', () => {
    collapse.toggleSidebarCollapse(0, 'left');
    expect(state.sidebarCollapsed.left[0]).toBe(true);
    collapse.toggleSidebarCollapse(0, 'left');
    expect(state.sidebarCollapsed.left[0]).toBe(false);
  });
});

describe('clearSidebarCollapsed (4T-000697, Aus-Zustand der Erweiterung)', () => {
  it('hebt jeden eingeklappten Zustand auf und persistiert einmalig', () => {
    state.sidebarCollapsed = { left: [true, false], right: [false, true] };
    collapse.clearSidebarCollapsed();
    expect(state.sidebarCollapsed).toEqual({ left: [false, false], right: [false, false] });
    expect(window.api.setSetting).toHaveBeenCalledTimes(1);
    expect(window.api.setSetting).toHaveBeenCalledWith('sidebarCollapsed', state.sidebarCollapsed);
  });

  it('No-op, wenn ohnehin alles ausgeklappt ist (kein Store-Write)', () => {
    collapse.clearSidebarCollapsed();
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });
});

// 4T-002129: Die beiden Helfer der Panels für den Sprachwechsel. Ein Text mit
// Platzhalter oder festem Bestandteil kann kein i18n-Merkmal tragen; er wird
// beim Ereignis des Sprachwechsels aus Schlüssel und gemerkten Werten neu
// gebaut. Die Roll-Lage überdauert einen asynchronen Neuaufbau desselben Inhalts.
describe('4T-002129: zusammengesetzte Panel-Texte und Roll-Lage beim Sprachwechsel', () => {
  it('4T-002129: setzeSprachSatz füllt den Platzhalter und baut den Text beim Sprachwechsel in der neuen Sprache neu', async () => {
    const i18n = await import('../../../src/renderer/i18n.js');
    const { setzeSprachSatz } =
      await import('../../../src/renderer/modules/panels/panel-sprache.js');
    const de = (await import('../../../src/i18n/de.json')).default;
    const en = (await import('../../../src/i18n/en.json')).default;
    // Die Kataloge kommen im Programm per fetch aus dem Bündel (Muster
    // eigenschaften-neue-typen.test.js); hier aus den erzeugten Sprachdateien.
    const fetchVorher = global.fetch;
    global.fetch = vi.fn(async (url) => ({
      ok: true,
      json: async () => (String(url).endsWith('/en.json') ? en : de),
    }));
    await i18n.loadTranslations('de');
    const auswahl = document.createElement('select');
    const kopf = document.createElement('div');
    document.body.append(auswahl, kopf);
    setzeSprachSatz(auswahl, 'title', 'properties.profileTypeLocked', {
      werte: { profile: 'Projekt' },
    });
    setzeSprachSatz(kopf, 'text', 'reminders.group.today', { nach: ' (3)' });
    const gesperrt = (k) => k['properties.profileTypeLocked'].replace('{profile}', 'Projekt');
    expect(auswahl.title).toBe(gesperrt(de));
    expect(auswahl.title).not.toContain('{profile}');
    expect(kopf.textContent).toBe(`${de['reminders.group.today']} (3)`);
    try {
      await i18n.loadTranslations('en');
      document.dispatchEvent(new CustomEvent('i18n-language-changed'));
      expect(auswahl.title).toBe(gesperrt(en));
      expect(kopf.textContent).toBe(`${en['reminders.group.today']} (3)`);
    } finally {
      await i18n.loadTranslations('de');
      global.fetch = fetchVorher;
      auswahl.remove();
      kopf.remove();
    }
  });

  it('4T-002129: halteRollLage stellt die Lage nach dem Neuaufbau desselben Inhalts wieder her, auch über zwei Aufrufe hinweg', async () => {
    const { halteRollLage } =
      await import('../../../src/renderer/modules/panels/panel-rolllage.js');
    const sektion = document.createElement('section');
    const koerper = document.createElement('div');
    koerper.className = 'sidebar-section-body';
    sektion.appendChild(koerper);
    // Erster Aufbau: Es gibt noch keine Lage, die zurückkehren könnte.
    halteRollLage(sektion, 'a.md|')();
    koerper.scrollTop = 300;
    // Neuaufbau: Leeren setzt die Lage auf null, ein zweiter Aufruf sieht schon
    // die geleerte Fläche und teilt sich die zuerst gemerkte Lage.
    halteRollLage(sektion, 'a.md|');
    koerper.scrollTop = 0;
    const zurueck = halteRollLage(sektion, 'a.md|');
    zurueck();
    expect(koerper.scrollTop).toBe(300);
    // Ein anderes Dokument beginnt oben.
    koerper.scrollTop = 120;
    const anders = halteRollLage(sektion, 'b.md|');
    koerper.scrollTop = 0;
    anders();
    expect(koerper.scrollTop).toBe(0);
  });
});
