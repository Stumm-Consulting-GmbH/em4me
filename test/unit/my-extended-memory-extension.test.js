// 4T-001603 (Epic 3E-000191): Wirkung des Aus-Zustands der Erweiterung
// my-extended-memory. Geprueft wird die deklarative Quelle, aus der sich
// Dispatcher, Ansichtsmenue, Kommando-Palette und die Handbuch-Generatoren
// speisen (Muster area-stats-extension.test.js); die Sichtbarkeit an der
// Oberflaeche misst die E2E-Spec der Seite und die Test-Iteration an der EXE.
import { describe, it, expect } from 'vitest';
import {
  isExtensionId,
  extensionById,
  internalExtensions,
} from '../../src/shared/extensions/extensions.js';
import {
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
  effectiveDisabledSet,
  isExtensionEnabled,
} from '../../src/shared/extensions/extensions-core.js';
import { COMMANDS } from '../../src/shared/commands/commands.js';

const ID = 'my-extended-memory';

describe('Erweiterung my-extended-memory: Registry und Aus-Zustand (4T-001603)', () => {
  it('ist als Werkzeug-Erweiterung mit den Katalog-Keys registriert (AK1)', () => {
    expect(isExtensionId(ID)).toBe(true);
    const manifest = extensionById(ID);
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    // Katalog-Keys der Funktion statt eigener extension.*-Keys: die Seite hat
    // einen eigenen Eintrag im Funktions-Katalog (F-287).
    expect(manifest.nameKey).toBe('help.featureName.myExtendedMemory');
    expect(manifest.descKey).toBe('help.feature.myExtendedMemory');
    expect(manifest.featureKeys).toBeUndefined();
    // Keine Abhaengigkeit und kein eigener Einstellungs-Bereich.
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.settingsSections).toBeUndefined();
    // Ab Werk eingeschaltet (der Default der Disabled-Liste ist leer) und im
    // Einstellungs-Bereich „Erweiterungen“ schaltbar.
    expect(isExtensionEnabled(ID, [])).toBe(true);
    expect(internalExtensions().some((m) => m.id === ID)).toBe(true);
  });

  it('filtert im Aus-Zustand genau das Kommando der Seite (AK2, AK3, AK7)', () => {
    const manifest = extensionById(ID);
    expect(manifest.commands).toEqual(['memory.openPage']);
    const aus = disabledCommandIdSet([ID]);
    expect(aus.has('memory.openPage')).toBe(true);
    // Gegenprobe: eingeschaltet bleibt das Kommando bedienbar.
    expect(disabledCommandIdSet([]).has('memory.openPage')).toBe(false);
    // Die Nachbarn desselben Menue-Blocks und derselben Kategorie bleiben
    // unberuehrt: Bereichs-Statistik und Ex-/Import sind eigene Erweiterungen.
    expect(aus.has('stats.openArea')).toBe(false);
    expect(aus.has('file.exportSetup')).toBe(false);
    expect(aus.has('file.importSetup')).toBe(false);
    // Vollstaendigkeit gegen den Bestand: ein kuenftiges memory.*-Kommando ohne
    // Eintrag in der Liste bliebe im Aus-Zustand bedienbar, waehrend Menue-
    // Eintrag und Palette-Eintrag der Seite verschwaenden.
    for (const id of COMMANDS.map((c) => c.id).filter((i) => i.startsWith('memory.'))) {
      expect(
        manifest.commands.includes(id),
        `Kommando ${id} fehlt in der commands-Liste der Erweiterung ${ID}`,
      ).toBe(true);
    }
  });

  it('registriert das Kommando ohne Standard-Kuerzel im Ansichts-Bereich', () => {
    const cmd = COMMANDS.find((c) => c.id === 'memory.openPage');
    expect(cmd).toBeTruthy();
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(true);
    expect(cmd.editorScoped).toBe(false);
    expect(cmd.categoryKey).toBe('help.group.view');
  });

  it('schaltet ohne Kaskade und ohne Wirkung auf gespeicherte Daten (AK5, AK7)', () => {
    // Soweit auf dieser Ebene pruefbar: Die Registry-Funktionen sind rein und
    // fassen keine Datei an. Das Manifest zieht keine andere Erweiterung mit
    // und wird von keiner gezogen, und Aus-und-wieder-An liefert exakt die
    // Ausgangs-Menge.
    expect([...effectiveDisabledSet([ID])]).toEqual([ID]);
    for (const m of internalExtensions()) {
      expect((m.dependencies || []).includes(ID), `${m.id} haengt an ${ID}`).toBe(false);
    }
    const vorher = [...disabledCommandIdSet([])].sort();
    disabledCommandIdSet([ID]);
    expect([...disabledCommandIdSet([])].sort()).toEqual(vorher);
    // Der Aus-Zustand nimmt allein den Zugang: kein Einstellungs-Bereich
    // verschwindet, und der einzige mit-entfallende Katalog-Schluessel ist der
    // der Seite selbst. An der Erweiterung haengt damit nichts, was die
    // eingetragene Gefaess-Liste (Store-Schluessel memoryEntries) oder die
    // gespeicherten Kennzahlen anruehren koennte.
    expect([...disabledSettingsSectionIdSet([ID])]).toEqual([]);
    expect([...disabledFeatureKeySet([ID])]).toEqual(['help.feature.myExtendedMemory']);
  });
});
