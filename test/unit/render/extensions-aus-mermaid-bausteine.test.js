// 4T-002617 (Epic 3E-000391): Aus-Zustand der Erweiterung «Mermaid-Diagramme»
// für ihre Bausteine (V8 des Epics, AK3). Eigene Datei nach dem Muster von
// extensions-aus-toc-block.test.js, weil extensions-aus.test.js nahe an seinem
// Budget von 800 Code-Zeilen steht. Erst der An-Zustand als
// Nicht-Vakuitäts-Probe, dann der Aus-Zustand: Das Kommando
// «Mermaid-Diagramm…» verschwindet über die Menge der abgeschalteten Kommandos
// aus Palette, Dispatcher und Kontextmenü, und die Katalog-Zeile der Bausteine
// trägt die Kennzeichnung der Funktions-Seite.
import { describe, it, expect } from 'vitest';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledIdsForModeLevel,
} from '../../../src/shared/extensions/extensions-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

describe('Erweiterung «Mermaid-Diagramme»: Aus-Zustand der Bausteine (4T-002617)', () => {
  it('mermaid: insert.mermaid steht genau im Aus-Zustand in der Menge der abgeschalteten Kommandos', () => {
    expect(COMMANDS.some((c) => c.id === 'insert.mermaid')).toBe(true);
    expect(extensionById('mermaid').commands).toEqual(['insert.mermaid']);
    expect(disabledCommandIdSet([]).has('insert.mermaid')).toBe(false);
    expect(disabledCommandIdSet(['mermaid']).has('insert.mermaid')).toBe(true);
    // Eine andere abgeschaltete Erweiterung nimmt das Kommando nicht mit.
    expect(disabledCommandIdSet(['katex']).has('insert.mermaid')).toBe(false);
  });

  it('mermaid: die Katalog-Zeile der Bausteine gilt genau im Aus-Zustand als abgeschaltet', () => {
    expect(extensionById('mermaid').featureKeys).toEqual(['help.feature.mermaidBuildingBlocks']);
    expect(disabledFeatureKeySet([]).has('help.feature.mermaidBuildingBlocks')).toBe(false);
    expect(disabledFeatureKeySet(['mermaid']).has('help.feature.mermaidBuildingBlocks')).toBe(true);
  });

  it('mermaid: Kategorie render, an ab dem Arbeitsmodus «Fortgeschritten»', () => {
    const ext = extensionById('mermaid');
    expect(ext.category).toBe('render');
    expect(ext.modeLevel).toBe('advanced');
    expect(disabledIdsForModeLevel('beginner')).toContain('mermaid');
    expect(disabledIdsForModeLevel('advanced')).not.toContain('mermaid');
    expect(disabledIdsForModeLevel('full')).not.toContain('mermaid');
    // Im Arbeitsmodus «Einsteiger» entfällt damit auch das Kommando.
    expect(disabledCommandIdSet(disabledIdsForModeLevel('beginner')).has('insert.mermaid')).toBe(
      true,
    );
  });
});
