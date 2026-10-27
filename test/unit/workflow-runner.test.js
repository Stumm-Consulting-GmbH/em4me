// 4T-002349 (Epic 3E-000184): Der Ablauf-Kern eines Workflow-Laufs
// (src/shared/workflows/workflow-runner.js) — Reihenfolge, Abbruch beim ersten
// Fehlschlag (A1), Fenster- und Hauptprozess-Schritte (A3), Aufruf-Tiefe über
// Workflows und Makros (A4), `wait`, `notify` und `stop` (Story 4S-001104).
// Alle Wirkungen sind Attrappen; Muster test/unit/macro-runner.test.js.
import { describe, it, expect } from 'vitest';
import {
  MAX_CALL_DEPTH,
  RUNNER_CODES,
  runWorkflow,
} from '../../src/shared/workflows/workflow-runner.js';
import { MACRO_MAX_CALL_DEPTH } from '../../src/shared/commands/command-placement.js';

const s = (line, keyword, ...args) => ({
  line,
  blockLine: line,
  keyword,
  args,
  source: null,
  position: null,
});
const plan = (name, steps, children = {}) => ({ path: `C:/b/${name}.md`, name, steps, children });

function makeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    flushBuffers: async () => calls.push('flush'),
    step: async (pfad, step) => {
      calls.push(`step:${step.keyword}:${step.args[0]}`);
      return { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } };
    },
    runWindowAction: async (antwort) => {
      calls.push(`window:${antwort.window.action}`);
      return { ok: true, line: antwort.line, keyword: antwort.keyword, effect: { kind: 'opened' } };
    },
    executeCommand: (id) => {
      calls.push(`cmd:${id}`);
      return true;
    },
    runMacro: async (name, ebene) => {
      calls.push(`macro:${name}:${ebene}`);
      return { ok: true };
    },
    sleep: async (ms) => calls.push(`sleep:${ms}`),
    notify: (text) => calls.push(`notify:${text}`),
    finish: (p, e) => calls.push(`finish:${p.name}:${e.status}`),
    ...overrides,
  };
  return { deps, calls };
}

describe('runWorkflow (4T-002349)', () => {
  it('führt die Schritte strikt nacheinander aus, Datei-Schritte nach dem Puffer-Abgleich', async () => {
    const { deps, calls } = makeDeps();
    const p = plan('A', [
      s(5, 'create', 'a.md'),
      s(6, 'command', 'view.modeSplit'),
      s(7, 'wait', 2),
      s(8, 'notify', 'Fertig'),
    ]);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(calls).toEqual([
      'flush',
      'step:create:a.md',
      'cmd:view.modeSplit',
      'sleep:2000',
      'notify:Fertig',
      'finish:A:ok',
    ]);
  });

  it('wartet null Sekunden ohne Fehler', async () => {
    const { deps, calls } = makeDeps();
    await runWorkflow(plan('A', [s(5, 'wait', 0)]), deps);
    expect(calls).toContain('sleep:0');
  });

  it('übergibt einen Fenster-Handgriff an runWindowAction', async () => {
    const { deps, calls } = makeDeps({
      step: async (pfad, step) => ({
        ok: true,
        line: step.line,
        keyword: step.keyword,
        window: { action: 'open', path: 'a.md' },
      }),
    });
    expect(await runWorkflow(plan('A', [s(5, 'open', 'a.md')]), deps)).toEqual({ status: 'ok' });
    expect(calls).toEqual(['flush', 'window:open', 'finish:A:ok']);
  });

  it('beendet den Lauf beim ersten Fehlschlag des Hauptprozesses (A1)', async () => {
    const { deps, calls } = makeDeps({
      step: async (pfad, step) => ({
        ok: false,
        line: step.line,
        keyword: step.keyword,
        code: 'targetExists',
        detail: { path: 'a.md' },
      }),
    });
    const r = await runWorkflow(plan('A', [s(5, 'create', 'a.md'), s(6, 'notify', 'nie')]), deps);
    expect(r).toEqual({
      status: 'failed',
      workflow: 'A',
      path: 'C:/b/A.md',
      line: 5,
      code: 'targetExists',
      detail: { path: 'a.md' },
    });
    expect(calls).not.toContain('notify:nie');
    expect(calls.at(-1)).toBe('finish:A:failed');
  });

  it('ein Fenster-Handgriff, der scheitert, beendet den Lauf mit seinem Code', async () => {
    const { deps } = makeDeps({
      step: async (pfad, step) => ({
        ok: true,
        line: step.line,
        keyword: step.keyword,
        window: { action: 'close' },
      }),
      runWindowAction: async (a) => ({
        ok: false,
        line: a.line,
        keyword: a.keyword,
        code: 'closeCanceled',
        detail: {},
      }),
    });
    const r = await runWorkflow(plan('A', [s(5, 'close', 'a.md')]), deps);
    expect(r).toMatchObject({ status: 'failed', line: 5, code: 'closeCanceled' });
  });

  it('command mit false wird commandFailed (AK6 der Story 4S-001104)', async () => {
    const { deps, calls } = makeDeps({ executeCommand: () => false });
    const r = await runWorkflow(plan('A', [s(5, 'command', 'x.y'), s(6, 'notify', 'nie')]), deps);
    expect(r).toMatchObject({
      status: 'failed',
      line: 5,
      code: 'commandFailed',
      detail: { command: 'x.y' },
    });
    expect(calls).not.toContain('notify:nie');
  });

  it('ruft ein Makro mit der nächsten Ebene und bildet seine Abbruch-Gründe ab', async () => {
    const { deps, calls } = makeDeps();
    await runWorkflow(plan('A', [s(5, 'macro', 'Tagesstart')]), deps, 2);
    expect(calls).toContain('macro:Tagesstart:3');
    for (const [reason, code] of [
      ['depth', 'depthExceeded'],
      ['unknown', 'macroUnknown'],
      ['command', 'macroFailed'],
      ['ambiguous', 'macroFailed'],
    ]) {
      const { deps: d } = makeDeps({ runMacro: async () => ({ ok: false, reason }) });
      expect(await runWorkflow(plan('A', [s(5, 'macro', 'M')]), d)).toMatchObject({
        code,
        line: 5,
      });
    }
  });

  it('läuft einen verschachtelten Workflow und kehrt zur nächsten Zeile zurück (AK3)', async () => {
    const { deps, calls } = makeDeps();
    const b = plan('B', [s(5, 'notify', 'in B')]);
    const a = plan('A', [s(5, 'workflow', 'B'), s(6, 'notify', 'zurück in A')], { 5: b });
    expect(await runWorkflow(a, deps)).toEqual({ status: 'ok' });
    expect(calls).toEqual(['notify:in B', 'finish:B:ok', 'notify:zurück in A', 'finish:A:ok']);
  });

  it('ein Fehlschlag im inneren Workflow beendet den äußeren an der aufrufenden Zeile (AK7)', async () => {
    const { deps, calls } = makeDeps({ executeCommand: () => false });
    const b = plan('B', [s(7, 'command', 'x.y')]);
    const a = plan('A', [s(5, 'workflow', 'B'), s(6, 'notify', 'nie')], { 5: b });
    const r = await runWorkflow(a, deps);
    expect(r).toMatchObject({ status: 'failed', workflow: 'A', line: 5, code: 'workflowFailed' });
    expect(r.detail.name).toBe('B');
    expect(r.detail.inner).toMatchObject({ workflow: 'B', line: 7, code: 'commandFailed' });
    expect(calls).toEqual(['finish:B:failed', 'finish:A:failed']);
  });

  it('weist einen fehlenden Unter-Plan als workflowUnknown ab', async () => {
    const { deps } = makeDeps();
    const r = await runWorkflow(plan('A', [s(5, 'workflow', 'B')]), deps);
    expect(r).toMatchObject({ code: 'workflowUnknown', detail: { name: 'B' } });
  });

  it('Aufruf-Tiefe: Ebene 4 läuft, Ebene 5 wird abgewiesen (A4, AK5)', async () => {
    expect(MAX_CALL_DEPTH).toBe(MACRO_MAX_CALL_DEPTH);
    expect(MAX_CALL_DEPTH).toBe(5);
    const { deps } = makeDeps();
    const b = plan('B', [s(5, 'notify', 'x')]);
    const tief = plan('A', [s(5, 'workflow', 'B')], { 5: b });
    expect(await runWorkflow(tief, deps, 3)).toEqual({ status: 'ok' });
    expect(await runWorkflow(tief, deps, 4)).toMatchObject({ code: 'depthExceeded' });
    const { deps: d2, calls } = makeDeps();
    expect(await runWorkflow(plan('A', [s(5, 'macro', 'M')]), d2, 4)).toMatchObject({
      code: 'depthExceeded',
    });
    expect(calls.some((c) => c.startsWith('macro:'))).toBe(false);
  });

  it('stop beendet den Lauf mit Text und Zeile, keine folgende Zeile läuft', async () => {
    const { deps, calls } = makeDeps();
    const r = await runWorkflow(
      plan('A', [s(5, 'stop', 'Nichts zu tun'), s(6, 'notify', 'nie')]),
      deps,
    );
    expect(r).toEqual({
      status: 'stopped',
      workflow: 'A',
      path: 'C:/b/A.md',
      line: 5,
      text: 'Nichts zu tun',
    });
    expect(calls).toEqual(['finish:A:stopped']);
  });

  it('stop in einem inneren Workflow beendet den ganzen Lauf', async () => {
    const { deps, calls } = makeDeps();
    const b = plan('B', [s(8, 'stop', 'Ende')]);
    const a = plan('A', [s(5, 'workflow', 'B'), s(6, 'notify', 'nie')], { 5: b });
    const r = await runWorkflow(a, deps);
    expect(r).toMatchObject({ status: 'stopped', workflow: 'A', line: 5, text: 'Ende' });
    expect(r.inner).toMatchObject({ workflow: 'B', line: 8 });
    expect(calls).not.toContain('notify:nie');
  });

  it('eine Ausnahme einer Abhängigkeit wird unexpected, nie verschluckt', async () => {
    const { deps } = makeDeps({
      step: async () => {
        throw new Error('weg');
      },
    });
    const r = await runWorkflow(plan('A', [s(5, 'create', 'a.md')]), deps);
    expect(r).toMatchObject({
      status: 'failed',
      line: 5,
      code: 'unexpected',
      detail: { message: 'weg' },
    });
  });

  it('eine Antwort ohne Code wird unexpected', async () => {
    const { deps } = makeDeps({ step: async () => null });
    expect(await runWorkflow(plan('A', [s(5, 'create', 'a.md')]), deps)).toMatchObject({
      code: 'unexpected',
    });
  });

  it('läuft ohne finish und liefert ein JSON-übertragbares Ergebnis', async () => {
    const { deps } = makeDeps({ finish: undefined, executeCommand: () => false });
    const r = await runWorkflow(plan('A', [s(5, 'command', 'x.y')]), deps);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('führt seine Codes als Liste', () => {
    expect(RUNNER_CODES).toEqual(
      expect.arrayContaining([
        'commandFailed',
        'macroFailed',
        'workflowFailed',
        'depthExceeded',
        'unexpected',
      ]),
    );
  });
});
