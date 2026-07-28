// 4T-0620 (Epic 3E-0117): Wirkung des Aus-Zustands der Erweiterung
// area-stats — das Kommando verschwindet aus Dispatcher, Menue und den
// Handbuch-Generatoren (Muster graph-core.test.js). Die Sichtbarkeit des
// Kontextmenue-Eintrags im Bereichs-Panel deckt der isExtensionActive-Guard
// des Panels ab, den die E2E-Stichprobe BS-06 prueft.
import { describe, it, expect } from 'vitest';
import {
  disabledCommandIdSet,
  isExtensionId,
  internalExtensions,
} from '../../src/shared/extensions.js';
import { COMMANDS } from '../../src/shared/commands.js';

describe('Erweiterung area-stats — Kommando-Filterung im Aus-Zustand', () => {
  it('ist registriert und filtert das Statistik-Kommando', () => {
    expect(isExtensionId('area-stats')).toBe(true);
    const disabled = disabledCommandIdSet(['area-stats']);
    expect(disabled.has('stats.openArea')).toBe(true);
    expect(disabledCommandIdSet([]).has('stats.openArea')).toBe(false);
  });

  it('nutzt die Katalog-Keys der Funktion statt eigener extension.*-Keys', () => {
    const eintrag = internalExtensions().find((e) => e.id === 'area-stats');
    expect(eintrag.category).toBe('tools');
    expect(eintrag.nameKey).toBe('help.featureName.areaStats');
    expect(eintrag.descKey).toBe('help.feature.areaStats');
  });

  it('registriert das Kommando ohne Standard-Kuerzel im Ansichts-Bereich', () => {
    const cmd = COMMANDS.find((c) => c.id === 'stats.openArea');
    expect(cmd).toBeTruthy();
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(true);
    expect(cmd.editorScoped).toBe(false);
    expect(cmd.categoryKey).toBe('help.group.view');
  });
});
