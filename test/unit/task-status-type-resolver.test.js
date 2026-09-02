// 4T-000502 (Epic 3E-000096): Unit-Tests fuer createTaskStatusTypeResolver aus
// plugins.js — der Status-Typ-Resolver des TASKS-Scopes, der (anders als die
// Pipeline-Instanz activeTaskStates) direkt aus der Persistenz-Form des
// taskStates-Stores baut. Prueft Basis-Zeichen, das Default-Set, den builtin-
// Merge ueber `name`, Custom-Status und unbekannte/deaktivierte Zeichen.
// Elektronfrei, deterministisch ohne Store.
import { describe, it, expect } from 'vitest';
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';

describe('createTaskStatusTypeResolver (4T-000502)', () => {
  it('Basis-Zeichen sind fest (Space TODO, x/X DONE)', () => {
    const resolve = createTaskStatusTypeResolver(null);
    expect(resolve(' ')).toBe('TODO');
    expect(resolve('x')).toBe('DONE');
    expect(resolve('X')).toBe('DONE');
  });

  it('Default-Set (stored null): alle Builtins mit ihrem Default-Typ', () => {
    const resolve = createTaskStatusTypeResolver(null);
    expect(resolve('/')).toBe('IN_PROGRESS');
    expect(resolve('-')).toBe('CANCELLED');
    expect(resolve('>')).toBe('TODO');
    expect(resolve('?')).toBe('TODO');
    expect(resolve('!')).toBe('TODO');
    expect(resolve('*')).toBe('TODO');
  });

  it('builtin-Merge ueber name: Typ-Override bei gueltigem Typ', () => {
    const resolve = createTaskStatusTypeResolver([
      { builtin: true, name: 'inProgress', type: 'ON_HOLD', enabled: true },
    ]);
    // Zeichen kommt aus dem Default (/), Typ aus dem Store-Override.
    expect(resolve('/')).toBe('ON_HOLD');
    // Unveraenderte Builtins behalten ihren Default-Typ.
    expect(resolve('-')).toBe('CANCELLED');
  });

  it('builtin-Merge: ungueltiger Typ faellt auf den Default-Typ zurueck', () => {
    const resolve = createTaskStatusTypeResolver([
      { builtin: true, name: 'inProgress', type: 'BOGUS', enabled: true },
    ]);
    expect(resolve('/')).toBe('IN_PROGRESS');
  });

  it('builtin enabled false: Zeichen liefert null', () => {
    const resolve = createTaskStatusTypeResolver([
      { builtin: true, name: 'cancelled', enabled: false },
    ]);
    expect(resolve('-')).toBeNull();
    // Andere Builtins bleiben.
    expect(resolve('/')).toBe('IN_PROGRESS');
  });

  it('Custom-Status wird uebernommen (validiert)', () => {
    const resolve = createTaskStatusTypeResolver([
      { builtin: false, char: '~', type: 'ON_HOLD', enabled: true },
    ]);
    expect(resolve('~')).toBe('ON_HOLD');
    // Custom mit unbekanntem Typ normalisiert auf TODO.
    const resolve2 = createTaskStatusTypeResolver([
      { builtin: false, char: '~', type: 'BOGUS', enabled: true },
    ]);
    expect(resolve2('~')).toBe('TODO');
  });

  it('Custom deaktiviert oder mit verbotenem Zeichen: null', () => {
    const disabled = createTaskStatusTypeResolver([
      { builtin: false, char: '~', type: 'ON_HOLD', enabled: false },
    ]);
    expect(disabled('~')).toBeNull();
    // Verbotenes Zeichen (Space) wird uebersprungen; bleibt der Basis-TODO.
    const forbidden = createTaskStatusTypeResolver([
      { builtin: false, char: ' ', type: 'DONE', enabled: true },
    ]);
    expect(forbidden(' ')).toBe('TODO');
  });

  it('unbekanntes Zeichen liefert null', () => {
    const resolve = createTaskStatusTypeResolver(null);
    expect(resolve('§')).toBeNull();
    expect(resolve('q')).toBeNull();
  });
});
