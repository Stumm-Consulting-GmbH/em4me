// 4T-002558 (Epic 3E-000390): Aus-Zustand der Erweiterung «Inhaltsverzeichnis-
// Block» (toc-block). Eigene Datei nach dem Muster von
// extensions-aus-diagramm.test.js, weil extensions-aus.test.js nahe an seinem
// Budget von 800 Code-Zeilen steht. Erst der An-Zustand als
// Nicht-Vakuitäts-Probe, dann der Aus-Zustand: Der Zaun steht als
// gewöhnlicher Code-Block da, der portable Export lässt ihn stehen, und das
// Kommando «Inhaltsverzeichnis» verschwindet über die Menge der abgeschalteten
// Kommandos aus Palette, Dispatcher und Kontextmenü.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledIdsForModeLevel,
} from '../../../src/shared/extensions/extensions-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

afterEach(() => {
  configureExtensions([]);
});

const SRC = '# Eins\n\n## Zwei\n\n```toc\ndepth: 2\n```\n';

describe('Render-Erweiterungen: Aus-Zustand des Inhaltsverzeichnis-Blocks (4T-002558)', () => {
  it('toc-block: Zaun bleibt Code-Block, Dokument unverändert, nach dem Einschalten wieder Verzeichnis', () => {
    const vorher = String(SRC);
    const an = renderMarkdown(SRC, 'de');
    expect(an).toContain('class="toc-block"');
    expect(an).toContain('href="#zwei"');
    configureExtensions(['toc-block']);
    const aus = renderMarkdown(SRC, 'de');
    expect(aus).not.toContain('toc-block');
    expect(aus).toContain('language-toc');
    expect(aus).toContain('depth: 2');
    // Die Überschriften selbst bleiben unberührt.
    expect(aus).toContain('id="zwei"');
    expect(SRC).toBe(vorher);
    configureExtensions([]);
    expect(renderMarkdown(SRC, 'de')).toContain('class="toc-block"');
  });

  it('toc-block: der portable Export ersetzt den Zaun nur bei eingeschalteter Erweiterung', () => {
    const an = convertMarkdownPortable(SRC, true, 'de');
    expect(an).toContain('- [Eins](#eins)\n  - [Zwei](#zwei)');
    expect(an).not.toContain('```toc');
    configureExtensions(['toc-block']);
    const aus = convertMarkdownPortable(SRC, true, 'de');
    expect(aus).toContain('```toc\ndepth: 2\n```');
    expect(aus).not.toContain('- [Eins](#eins)');
  });

  it('toc-block: insert.toc steht genau im Aus-Zustand in der Menge der abgeschalteten Kommandos', () => {
    expect(COMMANDS.some((c) => c.id === 'insert.toc')).toBe(true);
    expect(extensionById('toc-block').commands).toEqual(['insert.toc']);
    expect(disabledCommandIdSet([]).has('insert.toc')).toBe(false);
    expect(disabledCommandIdSet(['toc-block']).has('insert.toc')).toBe(true);
  });

  it('toc-block: Kategorie render und in jedem Arbeitsmodus an (Einsteiger)', () => {
    const ext = extensionById('toc-block');
    expect(ext.category).toBe('render');
    expect(ext.modeLevel).toBe('beginner');
    expect(ext.nameKey).toBe('help.featureName.tocBlock');
    expect(ext.descKey).toBe('help.feature.tocBlock');
    for (const stufe of ['beginner', 'advanced', 'full']) {
      expect(disabledIdsForModeLevel(stufe)).not.toContain('toc-block');
    }
  });
});
