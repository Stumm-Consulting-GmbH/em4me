// 4T-0277 (Epic 3E-0049): Unit-Tests für die Menü-State-Normalisierung
// (src/main/menu-state.js). Kern ist der Regressionstest zum
// Durchreich-Fehler aus 4T-0213: der Renderer meldete manualTab, das
// frühere getMenuState (main.js) reichte das Feld aber nicht an die
// Menü-Factory durch — Speichern/Speichern unter/Bearbeiten blieben bei
// Handbuch-Tabs fälschlich aktiv. Gleicher Vertrag gilt für das neue
// systemTab der Einstellungs-Seite.
import { describe, it, expect } from 'vitest';
import { normalizeMenuState } from '../../src/main/menu-state.js';

describe('normalizeMenuState (4T-0277)', () => {
  it('Regression 4T-0277: manualTab und systemTab werden durchgereicht', () => {
    const state = normalizeMenuState({ hasActiveTab: true, manualTab: true, systemTab: true }, {});
    expect(state.manualTab).toBe(true);
    expect(state.systemTab).toBe(true);
  });

  it('fehlende Read-only-Kennungen normalisieren auf false', () => {
    const state = normalizeMenuState({ hasActiveTab: true }, {});
    expect(state.manualTab).toBe(false);
    expect(state.systemTab).toBe(false);
  });

  it('liefert Defaults ohne Renderer-Report (frisches Fenster)', () => {
    const state = normalizeMenuState(null, null);
    expect(state.locale).toBe('en');
    expect(state.viewMode).toBe('rendered');
    expect(state.lineNumbers).toBe(true);
    expect(state.foldGutter).toBe(true);
    expect(state.hasActiveTab).toBe(false);
    expect(state.recentFiles).toEqual([]);
    expect(state.themePref).toBe('system');
    // 4T-0538 (Epic 3E-0098): ohne Store-Werte keine Arbeitsbereichs-Daten.
    expect(state.hasWorkspace).toBe(false);
    expect(state.workspaces).toEqual([]);
  });

  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Zuordnung und Untermenue-Liste
  // werden fuer Menue-Dimmung und Untermenue-Aufbau durchgereicht.
  it('4T-0538: hasWorkspace und workspaces werden durchgereicht', () => {
    const list = [{ id: 'ws-1', name: 'Projekt Alpha', color: 'green', open: true }];
    const state = normalizeMenuState({}, { hasWorkspace: true, workspaces: list });
    expect(state.hasWorkspace).toBe(true);
    expect(state.workspaces).toEqual(list);
    expect(normalizeMenuState({}, { workspaces: 'kaputt' }).workspaces).toEqual([]);
  });

  it('übernimmt Renderer- und Store-Werte unverändert', () => {
    const state = normalizeMenuState(
      { locale: 'de', viewMode: 'split', lineNumbers: false, foldGutter: false, editMode: true },
      { restoreSession: true, recentFiles: ['a.md'], themePref: 'dark', hotkeys: { x: 'Ctrl+X' } },
    );
    expect(state.locale).toBe('de');
    expect(state.viewMode).toBe('split');
    expect(state.lineNumbers).toBe(false);
    expect(state.foldGutter).toBe(false);
    expect(state.editMode).toBe(true);
    expect(state.restoreSession).toBe(true);
    expect(state.recentFiles).toEqual(['a.md']);
    expect(state.themePref).toBe('dark');
    expect(state.hotkeys).toEqual({ x: 'Ctrl+X' });
  });

  // 4T-0888 (Epic 3E-0168): Die Listen „Zuletzt geöffnete Bücher/Bücherregale"
  // brauchen denselben Durchreich-Weg wie die Bereichs-Liste — fehlt er, baut
  // die Menü-Factory die beiden Untermenüs dauerhaft leer auf (Regressions-
  // Muster 4T-0277).
  it('4T-0888: reicht recentBooks und recentShelves durch', () => {
    const state = normalizeMenuState(
      {},
      { recentBooks: ['C:\\Buch1'], recentShelves: ['C:\\Regal1', 'C:\\Regal2'] },
    );
    expect(state.recentBooks).toEqual(['C:\\Buch1']);
    expect(state.recentShelves).toEqual(['C:\\Regal1', 'C:\\Regal2']);
  });

  it('4T-0888: normalisiert fehlende und ungültige Buch-/Regal-Listen auf leer', () => {
    const state = normalizeMenuState({}, { recentBooks: 'kein-array', recentShelves: 42 });
    expect(state.recentBooks).toEqual([]);
    expect(state.recentShelves).toEqual([]);
    expect(normalizeMenuState(null, null).recentBooks).toEqual([]);
    expect(normalizeMenuState(null, null).recentShelves).toEqual([]);
  });

  it('verwirft ungültige themePref- und recentFiles-Werte', () => {
    const state = normalizeMenuState({}, { themePref: 'neon', recentFiles: 'kein-array' });
    expect(state.themePref).toBe('system');
    expect(state.recentFiles).toEqual([]);
  });

  // 4T-0294 (Epic 3E-0052): Kommandos deaktivierter Erweiterungen werden
  // an die Menü-Factory durchgereicht (deren Einträge entfallen dort).
  it('reicht disabledCommands durch und normalisiert Nicht-Arrays', () => {
    const state = normalizeMenuState({}, { disabledCommands: ['view.toggleTags'] });
    expect(state.disabledCommands).toEqual(['view.toggleTags']);
    expect(normalizeMenuState({}, { disabledCommands: 'x' }).disabledCommands).toEqual([]);
    expect(normalizeMenuState(null, null).disabledCommands).toEqual([]);
  });

  // 4T-0568 (Epic 3E-0104): geordnete Panel-Liste für das Panel-Untermenü —
  // ersetzt die früheren xxxVisible-Einzel-Flags (vier davon wurden nie
  // durchgereicht, deren Menü-Häkchen blieben dauerhaft leer).
  it('4T-0568: reicht die Panel-Liste geordnet durch und erzwingt boolesche Sichtbarkeit', () => {
    const state = normalizeMenuState(
      {
        panels: [
          { id: 'bookmarks', visible: true },
          { id: 'area', visible: 0 },
          { id: 'outline', visible: 'ja' },
        ],
      },
      {},
    );
    expect(state.panels).toEqual([
      { id: 'bookmarks', visible: true },
      { id: 'area', visible: false },
      { id: 'outline', visible: true },
    ]);
  });

  it('4T-0568: verwirft ungültige Panel-Einträge und Nicht-Arrays', () => {
    const state = normalizeMenuState(
      { panels: [null, { visible: true }, { id: '' }, { id: 'notes' }, 'kaputt'] },
      {},
    );
    expect(state.panels).toEqual([{ id: 'notes', visible: false }]);
    expect(normalizeMenuState({ panels: 'kein-array' }, {}).panels).toEqual([]);
    expect(normalizeMenuState(null, null).panels).toEqual([]);
  });

  // 4T-0626 (Epic 3E-0119): Sidebar-Varianten-Listen für das Untermenü
  // „Sidebar-Anordnungen" — Gruppen global/area plus Bereichs-Name.
  it('4T-0626: reicht die Varianten-Listen durch und verwirft ungültige Einträge', () => {
    const state = normalizeMenuState(
      {
        sidebarVariants: {
          global: [
            { id: 'v1', name: 'Konzeptarbeit' },
            { id: '', name: 'ohne id' },
            { id: 'v2', name: '' },
            null,
          ],
          area: [{ id: 'a1', name: 'Bereichsblick', extra: true }],
          areaName: 'Projekte',
        },
      },
      {},
    );
    expect(state.sidebarVariants).toEqual({
      global: [{ id: 'v1', name: 'Konzeptarbeit' }],
      area: [{ id: 'a1', name: 'Bereichsblick' }],
      areaName: 'Projekte',
    });
  });

  // 4T-0881 (Epic 3E-0162): Regression zur Regal-Bindung — hasShelf wurde
  // nicht durchgereicht, «Bücherregal schließen» blieb dadurch immer
  // deaktiviert. Gleicher Vertrag wie hasArea/hasBook (Muster 4T-0277).
  it('4T-0881: hasBook und hasShelf werden durchgereicht und normalisieren auf false', () => {
    const state = normalizeMenuState({}, { hasArea: true, hasBook: true, hasShelf: true });
    expect(state.hasArea).toBe(true);
    expect(state.hasBook).toBe(true);
    expect(state.hasShelf).toBe(true);
    const leer = normalizeMenuState(null, null);
    expect(leer.hasArea).toBe(false);
    expect(leer.hasBook).toBe(false);
    expect(leer.hasShelf).toBe(false);
  });

  it('4T-0626: liefert ohne Meldung die leere Varianten-Form', () => {
    expect(normalizeMenuState(null, null).sidebarVariants).toEqual({
      global: [],
      area: [],
      areaName: null,
    });
    expect(normalizeMenuState({ sidebarVariants: 'kaputt' }, {}).sidebarVariants).toEqual({
      global: [],
      area: [],
      areaName: null,
    });
  });
});
