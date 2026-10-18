// @vitest-environment jsdom
// 4T-001047 (Epic 3E-000151): Verfuegbarkeit des Mindmap-Modus — geprueft wird
// der Rückfall des gespeicherten Ansichts-Modus bei ausgeschalteter
// Erweiterung (Story 4S-000804, AK7). Ohne ihn trüge ein wiederhergestellter
// Reiter einen Modus, den es nicht mehr gibt, und seine Pane bliebe leer.
//
// Die Nachbar-Module sind gemockt, weil die Pane-Einbettung sonst den halben
// Renderer-Zustand hochzöge; geprüft wird genau die Rückfall-Regel, nicht die
// Verdrahtung (die deckt der E2E-Anteil des Epic-Abschlusses).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('Mindmap-Pane: Rückfall des Ansichts-Modus (4T-001047)', () => {
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

describe('Mindmap-Erweiterung: Abschalten bei offener Mindmap (4T-001688)', () => {
  // Der Rückfall oben greift beim ÖFFNEN eines Dokuments. Wird die Erweiterung
  // abgeschaltet, während ein Dokument in der Mindmap-Ansicht steht, braucht
  // es den Laufzeit-Hook, sonst bleibt die Ansicht ohne Schalter und ohne
  // Menü-Eintrag stehen (Muster der Canvas, 4T-001656, und der Tafel,
  // 4T-001847). Geprüft wird die Verdrahtung am Quelltext wie dort: Der
  // Lebenszyklus bräuchte Store und Preload-Brücke.
  const lies = (rel) =>
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..', rel), 'utf8');

  it('AK1: eine offene Mindmap fällt beim Abschalten auf die Lese-Ansicht', () => {
    const quelle = lies('src/renderer/modules/app/app-extension-runtime.js');
    expect(quelle).toContain('attachExtensionRuntime(MINDMAP_EXTENSION_ID, {');
    expect(quelle).toMatch(/if \(tab\.viewMode === 'mindmap'\) tab\.viewMode = 'rendered';/);
  });

  it('AK3: der Hook schreibt nichts, er setzt allein den Modus des geöffneten Dokuments', () => {
    const quelle = lies('src/renderer/modules/app/app-extension-runtime.js');
    const start = quelle.indexOf('attachExtensionRuntime(MINDMAP_EXTENSION_ID, {');
    const rumpf = quelle.slice(start, quelle.indexOf('});', start));
    expect(rumpf).not.toMatch(/save|write|dirty|markModified/i);
  });
});
