// 4T-0522 (Epic 3E-0094): Ausführungs-Kern der Makros
// (src/shared/macro-runner.js) — Sequenz-Reihenfolge, Verzögerungs-
// Schritte, Abbruch bei fehlgeschlagenem Schritt, Sub-Makro-Auflösung
// und Tiefen-Limit (Rekursions-Schutz). Alle Wirkungen laufen über
// injizierte deps (kein DOM, kein Dispatcher).
import { describe, expect, it } from 'vitest';
import { runMacroSequence } from '../../src/shared/macro-runner.js';
import { MACRO_MAX_CALL_DEPTH } from '../../src/shared/command-placement.js';

function makeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    executeCommand: (id) => {
      calls.push(`cmd:${id}`);
      return true;
    },
    sleep: (ms) => {
      calls.push(`sleep:${ms}`);
      return Promise.resolve();
    },
    resolveMacro: () => null,
    ...overrides,
  };
  return { deps, calls };
}

describe('runMacroSequence (4T-0522)', () => {
  it('führt Kommando- und Verzögerungs-Schritte strikt in Reihenfolge aus', async () => {
    const { deps, calls } = makeDeps();
    const macro = {
      id: 'm1',
      name: 'Ablauf',
      steps: [
        { type: 'command', commandId: 'file.save' },
        { type: 'delay', seconds: 1.5 },
        { type: 'command', commandId: 'view.toggleEdit' },
      ],
    };
    const result = await runMacroSequence(macro, deps);
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['cmd:file.save', 'sleep:1500', 'cmd:view.toggleEdit']);
  });

  it('bricht bei einem fehlgeschlagenen Schritt ab und benennt ihn', async () => {
    const { deps, calls } = makeDeps({
      executeCommand: (id) => {
        calls.push(`cmd:${id}`);
        return id !== 'journal.openToday';
      },
    });
    const macro = {
      id: 'm1',
      name: 'Ablauf',
      steps: [
        { type: 'command', commandId: 'file.save' },
        { type: 'command', commandId: 'journal.openToday' },
        { type: 'command', commandId: 'view.toggleEdit' },
      ],
    };
    const result = await runMacroSequence(macro, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('command');
    expect(result.stepIndex).toBe(1);
    expect(result.macro.id).toBe('m1');
    // Der dritte Schritt läuft nicht mehr.
    expect(calls).toEqual(['cmd:file.save', 'cmd:journal.openToday']);
  });

  it('löst Sub-Makro-Schritte über resolveMacro auf', async () => {
    const child = { id: 'm2', name: 'Kind', steps: [{ type: 'command', commandId: 'file.save' }] };
    const { deps, calls } = makeDeps({ resolveMacro: (id) => (id === 'm2' ? child : null) });
    const macro = {
      id: 'm1',
      name: 'Eltern',
      steps: [
        { type: 'command', commandId: 'macro.m2' },
        { type: 'command', commandId: 'view.toggleEdit' },
      ],
    };
    const result = await runMacroSequence(macro, deps);
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['cmd:file.save', 'cmd:view.toggleEdit']);
  });

  it('unbekanntes Sub-Makro bricht als Kommando-Fehler ab', async () => {
    const { deps } = makeDeps();
    const macro = {
      id: 'm1',
      name: 'Eltern',
      steps: [{ type: 'command', commandId: 'macro.fehlt' }],
    };
    const result = await runMacroSequence(macro, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('command');
    expect(result.stepIndex).toBe(0);
  });

  it('begrenzt die Aufruf-Kette (Selbst-Rekursion) mit dem Tiefen-Limit', async () => {
    const macro = {
      id: 'm1',
      name: 'Schleife',
      steps: [
        { type: 'command', commandId: 'file.save' },
        { type: 'command', commandId: 'macro.m1' },
      ],
    };
    const { deps, calls } = makeDeps({ resolveMacro: (id) => (id === 'm1' ? macro : null) });
    const result = await runMacroSequence(macro, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('depth');
    expect(result.macro.id).toBe('m1');
    expect(result.stepIndex).toBe(1);
    // Pro erlaubter Ebene lief der Kommando-Schritt genau einmal.
    expect(calls.filter((c) => c === 'cmd:file.save')).toHaveLength(MACRO_MAX_CALL_DEPTH);
  });

  it('defekte Makro-Objekte brechen kontrolliert ab', async () => {
    const { deps } = makeDeps();
    expect((await runMacroSequence(null, deps)).ok).toBe(false);
    expect((await runMacroSequence({ id: 'x', name: 'x' }, deps)).ok).toBe(false);
  });
});
