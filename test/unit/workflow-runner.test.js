// 4T-002349 (Epic 3E-000184): Der Ablauf-Kern eines Workflow-Laufs
// (src/shared/workflows/workflow-runner.js) — Reihenfolge, Abbruch beim ersten
// Fehlschlag (A1), Fenster- und Hauptprozess-Schritte (A3), Aufruf-Tiefe über
// Workflows und Makros (A4), `wait`, `notify` und `stop` (Story 4S-001104).
// Alle Wirkungen sind Attrappen; Muster test/unit/macro-runner.test.js.
// Seit 4T-002464 (Stories 4S-001147 und 4S-001148) dazu Bedingungen und
// Schleife als Block: Die Schritte kommen dort wie im Lauf aus Prüfer und
// `prepareRun`, damit die zurückgestellten Schritte echt gefüllt werden.
import { describe, it, expect } from 'vitest';
import {
  MAX_CALL_DEPTH,
  RUNNER_CODES,
  compareLoopPaths,
  deleteTargets,
  runWorkflow,
} from '../../src/shared/workflows/workflow-runner.js';
import { checkWorkflow } from '../../src/shared/workflows/workflow-check.js';
import { readWorkflowDocument } from '../../src/shared/workflows/workflow-document.js';
import { prepareRun } from '../../src/shared/workflows/workflow-placeholders.js';
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

// 4T-002424 (Story 4S-001135, Regel P4): `confirm` im Fenster und die Ziele der
// einen Bestätigung vor `delete` (P1).
describe('confirm und Lösch-Ziele (4T-002424)', () => {
  it('confirm mit «Ja» läuft weiter', async () => {
    const fragen = [];
    const { deps, calls } = makeDeps({
      confirm: async (frage) => {
        fragen.push(frage);
        return true;
      },
    });
    const r = await runWorkflow(
      plan('A', [s(5, 'confirm', 'Weiter?'), s(6, 'notify', 'danach')]),
      deps,
    );
    expect(r).toEqual({ status: 'ok' });
    expect(fragen).toEqual(['Weiter?']);
    expect(calls).toEqual(['notify:danach', 'finish:A:ok']);
  });

  it('confirm mit «Nein» beendet den Lauf ohne Fehlschlag wie stop', async () => {
    const { deps, calls } = makeDeps({ confirm: async () => false });
    const r = await runWorkflow(
      plan('A', [s(5, 'confirm', 'Weiter?'), s(6, 'notify', 'nie')]),
      deps,
    );
    expect(r).toEqual({
      status: 'stopped',
      workflow: 'A',
      path: 'C:/b/A.md',
      line: 5,
      text: 'Weiter?',
      declined: true,
    });
    expect(calls).toEqual(['finish:A:stopped']);
  });

  it('nur ein wahres «Ja» setzt fort; jede andere Antwort beendet', async () => {
    const { deps } = makeDeps({ confirm: async () => 'ja' });
    expect((await runWorkflow(plan('A', [s(5, 'confirm', 'X')]), deps)).status).toBe('stopped');
  });

  it('confirm mit «Nein» in einem inneren Workflow beendet den ganzen Lauf', async () => {
    const { deps } = makeDeps({ confirm: async () => false });
    const b = plan('B', [s(8, 'confirm', 'Innen?')]);
    const r = await runWorkflow(
      plan('A', [s(5, 'workflow', 'B'), s(6, 'notify', 'nie')], { 5: b }),
      deps,
    );
    expect(r).toMatchObject({ status: 'stopped', workflow: 'A', line: 5, declined: true });
    expect(r.inner).toMatchObject({ workflow: 'B', line: 8, text: 'Innen?' });
  });

  it('deleteTargets sammelt die Ziele über den Aufruf-Baum, ohne Doppel', () => {
    const b = plan('B', [s(8, 'delete', 'b.md'), s(9, 'delete', 'a.md')]);
    const a = plan('A', [s(5, 'delete', 'a.md'), s(6, 'workflow', 'B'), s(7, 'notify', 'x')], {
      6: b,
    });
    expect(deleteTargets(a)).toEqual(['a.md', 'b.md']);
    expect(deleteTargets(plan('C', [s(5, 'notify', 'x')]))).toEqual([]);
    expect(deleteTargets(null)).toEqual([]);
  });
});

// 4T-002464: Bedingungen und Schleife (3f, 3g).
describe('Block-Form im Ablauf-Kern (4T-002464)', () => {
  const ZAUN = '```';
  // Prüfen und Füllen wie im Lauf; der Kontext nennt das aktive Dokument.
  function vorbereitet(zeilen, kontext = { file: 'Aktiv.md', area: 'B', nowMs: 0 }) {
    const doc = readWorkflowDocument(
      `---\nworkflow: true\n---\n${ZAUN}workflow\n${zeilen.join('\n')}\n${ZAUN}\n`,
    );
    const geprueft = checkWorkflow(doc);
    expect(geprueft.findings).toEqual([]);
    const gefuellt = prepareRun(geprueft.steps, kontext, {}, {});
    expect(gefuellt.findings).toEqual([]);
    return plan('W', gefuellt.steps);
  }

  // Der Hauptprozess als Attrappe: vorhandene Dateien, Eigenschaften, Listen.
  function bereich({ da = [], eigenschaften = {}, listen = {}, fehlschlag = null } = {}) {
    const vorhanden = new Set(da);
    const ergebnis = makeDeps();
    ergebnis.deps.step = async (pfad, step) => {
      ergebnis.calls.push(`step:${step.keyword}:${step.args[0]}`);
      const [ziel, name, wert] = step.args;
      const kopf = { line: step.line, keyword: step.keyword };
      if (fehlschlag && fehlschlag(step)) return { ok: false, ...kopf, code: 'fileMissing' };
      if (step.keyword === 'if-exists') return { ok: true, ...kopf, value: vorhanden.has(ziel) };
      if (step.keyword === 'if-missing') return { ok: true, ...kopf, value: !vorhanden.has(ziel) };
      if (step.keyword === 'if-property') {
        const ist = (eigenschaften[ziel] || {})[name];
        const value = wert === undefined ? !!ist : ist === wert;
        return { ok: true, ...kopf, value };
      }
      if (step.keyword === 'for-each') return { ok: true, ...kopf, files: listen[ziel] || [] };
      if (step.keyword === 'create') vorhanden.add(ziel);
      return { ok: true, ...kopf, effect: { kind: 'edited' } };
    };
    return ergebnis;
  }
  const schritte = (calls) => calls.filter((c) => c.startsWith('step:') || c.startsWith('notify:'));

  it('führt den Block nur im zutreffenden Fall aus, else im anderen (4S-001147, AK1)', async () => {
    const zeilen = [
      'if-exists "a.md"',
      '  notify "da"',
      'else',
      '  notify "fehlt"',
      'end',
      'notify "danach"',
    ];
    const mit = bereich({ da: ['a.md'] });
    expect(await runWorkflow(vorbereitet(zeilen), mit.deps)).toEqual({ status: 'ok' });
    expect(schritte(mit.calls)).toEqual(['step:if-exists:a.md', 'notify:da', 'notify:danach']);
    const ohne = bereich();
    await runWorkflow(vorbereitet(zeilen), ohne.deps);
    expect(schritte(ohne.calls)).toEqual(['step:if-exists:a.md', 'notify:fehlt', 'notify:danach']);
  });

  it('überspringt ohne else alle Schritte bis end und läuft danach weiter (AK2)', async () => {
    const { deps, calls } = bereich({ da: ['Journal/x.md'] });
    const p = vorbereitet([
      'if-missing "Journal/x.md"',
      'create "Journal/x.md"',
      'notify "angelegt"',
      'end',
      'notify "weiter"',
    ]);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(schritte(calls)).toEqual(['step:if-missing:Journal/x.md', 'notify:weiter']);
  });

  it('prüft if-property mit Wert auf Gleichheit, ohne Wert auf «gesetzt»', async () => {
    const eigenschaften = { 'a.md': { typ: 'Rechnung' }, 'b.md': { typ: 'Brief' } };
    const zeilen = (ziel, rest) => [`if-property "${ziel}" ${rest}`, 'notify "ja"', 'end'];
    const lauf = async (z) => {
      const { deps, calls } = bereich({ eigenschaften });
      await runWorkflow(vorbereitet(z), deps);
      return calls.includes('notify:ja');
    };
    expect(await lauf(zeilen('a.md', 'typ "Rechnung"'))).toBe(true);
    expect(await lauf(zeilen('b.md', 'typ "Rechnung"'))).toBe(false);
    expect(await lauf(zeilen('b.md', 'typ'))).toBe(true);
    expect(await lauf(zeilen('c.md', 'typ'))).toBe(false);
  });

  it('läuft eine Verschachtelung der Tiefe 3 (AK4)', async () => {
    const { deps, calls } = bereich({ da: ['a', 'b'] });
    const p = vorbereitet([
      'if-exists "a"',
      'if-exists "b"',
      'if-missing "c"',
      'notify "innen"',
      'else',
      'notify "nie"',
      'end',
      'end',
      'end',
    ]);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(calls.filter((c) => c.startsWith('notify:'))).toEqual(['notify:innen']);
  });

  it('wiederholt den Block je Datei alphabetisch mit {{item}} und {{item:name}} (4S-001148, AK1)', async () => {
    const { deps, calls } = bereich({
      listen: { 'Eingang/*.md': ['Eingang/c.md', 'Eingang/A.md', 'Eingang/b.md'] },
    });
    const p = vorbereitet([
      'for-each "Eingang/*.md"',
      '  add-tag "{{item}}" "gesichtet"',
      '  notify "{{item:name}} in {{file}}"',
      'end',
    ]);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(schritte(calls)).toEqual([
      'step:for-each:Eingang/*.md',
      'step:add-tag:Eingang/A.md',
      'notify:A in Aktiv.md',
      'step:add-tag:Eingang/b.md',
      'notify:b in Aktiv.md',
      'step:add-tag:Eingang/c.md',
      'notify:c in Aktiv.md',
    ]);
  });

  it('wirkt eine Bedingung in der Schleife je Datei (AK2, AK7 des Tasks)', async () => {
    const { deps, calls } = bereich({
      listen: { 'Sichten/*.md': ['Sichten/A.md', 'Sichten/B.md', 'Sichten/C.md'] },
      eigenschaften: { 'Sichten/A.md': { typ: 'Rechnung' }, 'Sichten/B.md': { typ: 'Brief' } },
    });
    const p = vorbereitet([
      'for-each "Sichten/*.md"',
      '  if-property "{{item}}" typ "Rechnung"',
      '    add-tag "{{item}}" "rechnung"',
      '  end',
      'end',
    ]);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(calls.filter((c) => c.startsWith('step:add-tag'))).toEqual([
      'step:add-tag:Sichten/A.md',
    ]);
  });

  it('nimmt eine im Lauf angelegte Datei nicht in die Liste auf (AK5)', async () => {
    const listen = { 'E/*.md': ['E/a.md'] };
    const { deps, calls } = bereich({ listen });
    const p = vorbereitet(['for-each "E/*.md"', 'create "E/{{item:name}}-Kopie.md"', 'end']);
    // Die Attrappe änderte die Liste nach der ersten Frage; der Kern fragt nur einmal.
    const frage = deps.step;
    deps.step = async (pfad, step) => {
      const antwort = await frage(pfad, step);
      if (step.keyword === 'create') listen['E/*.md'].push(step.args[0]);
      return antwort;
    };
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(calls.filter((c) => c.startsWith('step:'))).toEqual([
      'step:for-each:E/*.md',
      'step:create:E/a-Kopie.md',
    ]);
  });

  it('läuft bei einer leeren Liste keine Wiederholung und ohne Fehlschlag (AK4)', async () => {
    const { deps, calls } = bereich();
    const p = vorbereitet(['for-each "E/*.md"', 'notify "{{item}}"', 'end', 'notify "fertig"']);
    expect(await runWorkflow(p, deps)).toEqual({ status: 'ok' });
    expect(schritte(calls)).toEqual(['step:for-each:E/*.md', 'notify:fertig']);
  });

  it('schlägt bei mehr als 500 Dateien vor der ersten Wiederholung fehl, bei 500 nicht (AK4)', async () => {
    const liste = (n) => Array.from({ length: n }, (_, i) => `E/${i}.md`);
    const zeilen = ['for-each "E/*.md"', 'add-tag "{{item}}" "x"', 'end'];
    const zuViel = bereich({ listen: { 'E/*.md': liste(501) } });
    expect(await runWorkflow(vorbereitet(zeilen), zuViel.deps)).toEqual({
      status: 'failed',
      workflow: 'W',
      path: 'C:/b/W.md',
      line: 5,
      code: 'tooManyFiles',
      detail: { max: 500, count: 501 },
    });
    expect(zuViel.calls.filter((c) => c.startsWith('step:add-tag'))).toEqual([]);
    const genau = bereich({ listen: { 'E/*.md': liste(500) } });
    expect(await runWorkflow(vorbereitet(zeilen), genau.deps)).toEqual({ status: 'ok' });
    expect(genau.calls.filter((c) => c.startsWith('step:add-tag'))).toHaveLength(500);
  });

  it('beendet den Lauf beim Fehlschlag in der dritten Datei, die ersten bleiben bearbeitet (AK6)', async () => {
    const { deps, calls } = bereich({
      listen: { 'E/*.md': ['E/1.md', 'E/2.md', 'E/3.md', 'E/4.md'] },
      fehlschlag: (step) => step.keyword === 'add-tag' && step.args[0] === 'E/3.md',
    });
    const p = vorbereitet(['for-each "E/*.md"', 'add-tag "{{item}}" "x"', 'end', 'notify "nie"']);
    expect(await runWorkflow(p, deps)).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'fileMissing',
    });
    expect(calls.filter((c) => c.startsWith('step:add-tag'))).toEqual([
      'step:add-tag:E/1.md',
      'step:add-tag:E/2.md',
      'step:add-tag:E/3.md',
    ]);
    expect(calls).not.toContain('notify:nie');
    expect(calls[calls.length - 1]).toBe('finish:W:failed');
  });

  it('prüft den je Datei gefüllten Schritt erneut und meldet einen Befund mit seinem Text', async () => {
    const { deps, calls } = bereich({ listen: { 'E/*.md': ['../fremd.md'] } });
    const p = vorbereitet(['for-each "E/*.md"', 'move "{{item}}" "Archiv"', 'end']);
    expect(await runWorkflow(p, deps)).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'pathOutsideArea',
      detail: { kind: 'parent' },
      befund: true,
    });
    expect(calls.filter((c) => c.startsWith('step:move'))).toEqual([]);
  });

  it('macht einen Fehlschlag der Bedingung zum Fehlschlag des Laufs (A1)', async () => {
    const { deps } = bereich({ fehlschlag: (step) => step.keyword === 'if-property' });
    const p = vorbereitet(['if-property "a.md" typ', 'notify "x"', 'end']);
    expect(await runWorkflow(p, deps)).toMatchObject({
      status: 'failed',
      line: 5,
      code: 'fileMissing',
    });
  });

  it('beendet den Lauf mit stop auch aus einem Block heraus', async () => {
    const { deps, calls } = bereich({ listen: { 'E/*.md': ['E/a.md', 'E/b.md'] } });
    const p = vorbereitet(['for-each "E/*.md"', 'stop "genug"', 'end', 'notify "nie"']);
    expect(await runWorkflow(p, deps)).toMatchObject({ status: 'stopped', line: 6, text: 'genug' });
    expect(calls).not.toContain('notify:nie');
  });

  it('gleicht vor jeder Frage an den Hauptprozess die Puffer ab', async () => {
    const { deps, calls } = bereich({ da: ['a.md'] });
    await runWorkflow(vorbereitet(['if-exists "a.md"', 'end']), deps);
    expect(calls.slice(0, 2)).toEqual(['flush', 'step:if-exists:a.md']);
  });

  it('ordnet die Liste alphabetisch, Ziffern als Zahl, Umlaut beim Grundbuchstaben', () => {
    const liste = ['E/b.md', 'E/10.md', 'E/Ä.md', 'E/a.md', 'E/2.md', 'E/A.md'];
    expect([...liste].sort(compareLoopPaths)).toEqual([
      'E/2.md',
      'E/10.md',
      'E/A.md',
      'E/a.md',
      'E/Ä.md',
      'E/b.md',
    ]);
  });

  it('nennt den Fehlschlag tooManyFiles unter den Codes des Kerns', () => {
    expect(RUNNER_CODES).toContain('tooManyFiles');
  });
});
