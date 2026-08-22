// @vitest-environment jsdom
// 4T-1047 (Epic 3E-0151): Verfuegbarkeit des Mindmap-Modus — geprueft wird
// der Rückfall des gespeicherten Ansichts-Modus bei ausgeschalteter
// Erweiterung (Story 4S-0804, AK7). Ohne ihn trüge ein wiederhergestellter
// Reiter einen Modus, den es nicht mehr gibt, und seine Pane bliebe leer.
//
// Die Nachbar-Module sind gemockt, weil die Pane-Einbettung sonst den halben
// Renderer-Zustand hochzöge; geprüft wird genau die Rückfall-Regel, nicht die
// Verdrahtung (die deckt der E2E-Anteil des Epic-Abschlusses).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const istAktiv = vi.fn();

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));
vi.mock('../../../src/renderer/i18n.js', () => ({ t: (key) => key }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({ api: {}, $: () => null }));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  getPaneEls: () => null,
  state: { panes: [] },
  tabDisplayName: () => 'Datei',
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [] }));
vi.mock('@codemirror/view', () => ({ EditorView: { scrollIntoView: () => ({}) } }));

const { resolveViewModeForTab, isMindmapModeAvailable, MINDMAP_EXTENSION_ID } =
  await import('../../../src/renderer/modules/mindmap/mindmap-modus.js');

beforeEach(() => {
  istAktiv.mockReset();
});

describe('Mindmap-Pane: Rückfall des Ansichts-Modus (4T-1047)', () => {
  it('AK7: bei ausgeschalteter Erweiterung fällt «mindmap» auf die Lese-Ansicht', () => {
    istAktiv.mockReturnValue(false);
    expect(resolveViewModeForTab('mindmap')).toBe('rendered');
  });

  it('bei eingeschalteter Erweiterung bleibt «mindmap» erhalten', () => {
    istAktiv.mockReturnValue(true);
    expect(resolveViewModeForTab('mindmap')).toBe('mindmap');
  });

  it('alle anderen Modi bleiben in beiden Zuständen unangetastet', () => {
    for (const zustand of [true, false]) {
      istAktiv.mockReturnValue(zustand);
      for (const modus of ['source', 'split', 'rendered', 'live']) {
        expect(resolveViewModeForTab(modus)).toBe(modus);
      }
    }
  });

  it('fragt genau die eigene Erweiterungs-Kennung ab', () => {
    istAktiv.mockReturnValue(true);
    resolveViewModeForTab('mindmap');
    expect(istAktiv).toHaveBeenCalledWith('mindmap');
    expect(MINDMAP_EXTENSION_ID).toBe('mindmap');
  });

  it('die Verfügbarkeits-Auskunft folgt dem Schalt-Zustand', () => {
    istAktiv.mockReturnValue(false);
    expect(isMindmapModeAvailable()).toBe(false);
    istAktiv.mockReturnValue(true);
    expect(isMindmapModeAvailable()).toBe(true);
  });
});
