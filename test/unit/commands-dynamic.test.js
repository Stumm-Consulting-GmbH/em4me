// 4T-0299 (Epic 3E-0053): dynamische Kommandos externer Erweiterungen in
// der Kommando-Registry — Registrierung, Namensraum-Zwang, Binding-
// Validierung, mergeBindings-Anschluss und Abmeldung.
import { describe, it, expect, afterEach } from 'vitest';
import {
  COMMANDS,
  mergeBindings,
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../src/shared/commands.js';

const CMD_ID = 'ext.beispiel.zaehlen';

afterEach(() => {
  unregisterDynamicCommand(CMD_ID);
});

describe('dynamische Kommandos (4T-0299)', () => {
  it('registriert im ext.-Namensraum mit festen Konventionen', () => {
    expect(
      registerDynamicCommand({
        id: CMD_ID,
        labelKey: 'ext.beispiel.command.title',
        defaultBindings: ['CmdOrCtrl+Alt+9'],
      }),
    ).toBe(true);
    const cmd = COMMANDS.find((c) => c.id === CMD_ID);
    expect(cmd).toBeTruthy();
    expect(cmd.menu).toBe(false);
    expect(cmd.descKey).toBeNull();
    expect(cmd.categoryKey).toBe('help.group.general');
    expect(cmd.dynamic).toBe(true);
    expect(cmd.defaultBindings).toEqual(['CmdOrCtrl+Alt+9']);
  });

  it('verweigert Kommandos außerhalb der dynamischen Namensräume', () => {
    expect(registerDynamicCommand({ id: 'file.boese', labelKey: 'x' })).toBe(false);
    expect(COMMANDS.some((c) => c.id === 'file.boese')).toBe(false);
  });

  // 4T-0522 (Epic 3E-0094): Makros registrieren sich im macro.-Namensraum
  // mit denselben Konventionen wie ext.-Kommandos.
  it('akzeptiert den macro.-Namensraum der Kommando-Platzierung', () => {
    expect(registerDynamicCommand({ id: 'macro.m1', labelKey: 'x' })).toBe(true);
    const cmd = COMMANDS.find((c) => c.id === 'macro.m1');
    expect(cmd.dynamic).toBe(true);
    expect(cmd.categoryKey).toBe('help.group.general');
    expect(unregisterDynamicCommand('macro.m1')).toBe(true);
  });

  it('verwirft unbrauchbare Default-Bindings statt sie zu übernehmen', () => {
    // Nur-Modifier-Bindings sind kein gültiges Kürzel (normalizeBinding
    // liefert null); Nicht-Strings fallen ebenfalls heraus.
    registerDynamicCommand({ id: CMD_ID, labelKey: 'x', defaultBindings: ['Ctrl+Shift', 7] });
    const cmd = COMMANDS.find((c) => c.id === CMD_ID);
    expect(cmd.defaultBindings).toEqual([]);
  });

  it('mergeBindings liefert Defaults und respektiert Overrides', () => {
    registerDynamicCommand({
      id: CMD_ID,
      labelKey: 'x',
      defaultBindings: ['CmdOrCtrl+Alt+9'],
    });
    expect(mergeBindings({})[CMD_ID]).toEqual(['CmdOrCtrl+Alt+9']);
    expect(mergeBindings({ [CMD_ID]: 'CmdOrCtrl+Alt+8' })[CMD_ID]).toEqual(['CmdOrCtrl+Alt+8']);
    expect(mergeBindings({ [CMD_ID]: '' })[CMD_ID]).toEqual([]);
  });

  it('Re-Registrierung ersetzt, Abmeldung entfernt nur dynamische Einträge', () => {
    registerDynamicCommand({ id: CMD_ID, labelKey: 'alt' });
    registerDynamicCommand({ id: CMD_ID, labelKey: 'neu' });
    expect(COMMANDS.filter((c) => c.id === CMD_ID)).toHaveLength(1);
    expect(COMMANDS.find((c) => c.id === CMD_ID).labelKey).toBe('neu');
    expect(unregisterDynamicCommand(CMD_ID)).toBe(true);
    expect(COMMANDS.some((c) => c.id === CMD_ID)).toBe(false);
    // Eingebaute Kommandos sind nicht abmeldbar.
    expect(unregisterDynamicCommand('file.save')).toBe(false);
    expect(COMMANDS.some((c) => c.id === 'file.save')).toBe(true);
  });
});
