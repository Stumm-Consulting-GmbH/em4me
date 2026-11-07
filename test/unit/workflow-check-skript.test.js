// 4T-002465 (Epic 3E-000367): Der Skript-Schritt im Prüfen vor Laufen, im
// Füllen vor dem Lauf und im Platzhalter-Satz (Story 4S-001149, Entscheidungen
// 3h und 3n).
//
// Geprüft werden die Einstellung «Skript-Blöcke ausführen» als Eingabe des
// Prüfers (fail-closed), die Suche des Skript-Blocks unter der Überschrift der
// Workflow-Datei, der Name des Ergebnisses, `{{script:name}}` vor dem
// liefernden Schritt und an Stellen, die vor dem ersten Schritt feststehen,
// `if-script` in der Block-Form und das Zurückstellen der Schritte mit einem
// Skript-Ergebnis in `prepareRun`.
import { describe, it, expect } from 'vitest';
import { blockStructure, checkWorkflow } from '../../src/shared/workflows/workflow-check.js';
import { readWorkflowDocument, scriptBlock } from '../../src/shared/workflows/workflow-document.js';
import { fillLoopStep, prepareRun } from '../../src/shared/workflows/workflow-placeholders.js';
import { analyzeTemplate, renderTemplate } from '../../src/shared/template-engine.js';

const FENCE = '```';
const SKRIPT = ['## Zählen', '', `${FENCE}perspective-script`, 'return 2;', FENCE, ''];
// Kopf aus drei Zeilen, Zaun in Zeile 4: die erste Befehls-Zeile ist Zeile 5.
const dok = (zeilen, { kopf = '', abschnitte = SKRIPT } = {}) =>
  readWorkflowDocument(
    `---\nworkflow: true\n${kopf}---\n${FENCE}workflow\n${zeilen.join('\n')}\n${FENCE}\n\n${abschnitte.join('\n')}\n`,
  );
const AN = { scriptsEnabled: true };
const pruefe = (zeilen, optionen = AN, extra) => checkWorkflow(dok(zeilen, extra), optionen);
const befunde = (zeilen, optionen = AN, extra) =>
  pruefe(zeilen, optionen, extra).findings.map((f) => [f.code, f.line]);

describe('Einstellung «Skript-Blöcke ausführen» (3n, AK4)', () => {
  it('meldet den Befund an jeder Skript-Zeile, wenn die Einstellung fehlt (fail-closed)', () => {
    const r = pruefe(
      ['notify "vorher"', 'script "Zählen" as "offen"', 'if-script "Zählen"', 'end'],
      {},
    );
    expect(r.findings.map((f) => [f.code, f.line])).toEqual([
      ['scriptsDisabled', 6],
      ['scriptsDisabled', 7],
    ]);
    expect(r.ok).toBe(false);
    expect(r.findings.every((f) => f.armOnly !== true)).toBe(true);
  });

  it('weist bei ausgeschalteter Einstellung Lauf und Scharf-Schaltung ab', () => {
    const kopf = 'trigger: schedule\nschedule: every monday at 08:00\n';
    const aus = pruefe(['script "Zählen" as "offen"'], { scriptsEnabled: false }, { kopf });
    expect(aus.findings.map((f) => f.code)).toEqual(['scriptsDisabled']);
    expect(aus.ok).toBe(false);
    expect(aus.armable).toBe(false);
    const an = pruefe(['script "Zählen" as "offen"'], AN, { kopf });
    expect(an.findings).toEqual([]);
    expect(an.armable).toBe(true);
  });

  it('nur ein ausdrückliches true gibt frei', () => {
    for (const wert of [undefined, null, 'true', 1, false]) {
      const f = befunde(['script "Zählen" as "offen"'], { scriptsEnabled: wert });
      expect(f, String(wert)).toEqual([['scriptsDisabled', 5]]);
    }
  });

  it('ein Workflow ohne Skript bleibt von der Einstellung unberührt', () => {
    expect(befunde(['notify "Hallo"'], {})).toEqual([]);
  });
});

describe('Abschnitt und Skript-Block (AK5)', () => {
  it('trägt den geprüften Quelltext und den Namen des Ergebnisses in den Schritt', () => {
    const r = pruefe(['script "Zählen" as "Offen"']);
    expect(r.findings).toEqual([]);
    expect(r.steps[0]).toMatchObject({
      keyword: 'script',
      args: [{ type: 'text', raw: 'Zählen', form: 'string' }],
      script: 'return 2;',
      result: 'offen',
    });
  });

  it('meldet einen fehlenden, einen mehrdeutigen Abschnitt und einen ohne Skript-Block', () => {
    expect(befunde(['script "Fehlt" as "x"'])).toEqual([['scriptSectionUnknown', 5]]);
    const doppelt = [...SKRIPT, ...SKRIPT];
    expect(befunde(['if-script "Zählen"', 'end'], AN, { abschnitte: doppelt })).toEqual([
      ['scriptSectionAmbiguous', 5],
    ]);
    const ohne = ['## Zählen', '', 'Nur Text.', `${FENCE}js`, 'return 1;', FENCE];
    expect(befunde(['script "Zählen" as "x"'], AN, { abschnitte: ohne })).toEqual([
      ['scriptSectionNoScript', 5],
    ]);
  });

  it('liest den ersten Skript-Block der obersten Ebene, nicht einen Beispiel-Block', () => {
    const text = [
      '## Zählen',
      '````md',
      `${FENCE}perspective-script`,
      'return "Beispiel";',
      FENCE,
      '````',
      `${FENCE}perspective-script`,
      'return "echt";',
      FENCE,
      '## Danach',
    ].join('\n');
    expect(scriptBlock(text, 'Zählen')).toEqual({ ok: true, source: 'return "echt";', line: 7 });
    expect(scriptBlock(text, 'Danach')).toEqual({ ok: false, code: 'noScript' });
  });
});

describe('Name und Platzhalter des Ergebnisses (AK5)', () => {
  it('verlangt as "name" und einen zulässigen, eindeutigen Namen', () => {
    expect(befunde(['script "Zählen"']).map(([c]) => c)).toEqual(['missingOption']);
    expect(befunde(['script "Zählen" as "a b"'])).toEqual([['scriptNameInvalid', 5]]);
    expect(befunde(['script "Zählen" as "{{file}}"'])).toEqual([['scriptNameInvalid', 5]]);
    expect(befunde(['script "Zählen" as "x"', 'script "Zählen" as "X"'])).toEqual([
      ['scriptNameDuplicate', 6],
    ]);
  });

  it('as gilt nur beim Skript-Schritt', () => {
    expect(befunde(['notify "Hallo" as "x"']).map(([c]) => c)).toEqual(['unknownOption']);
  });

  it('meldet {{script:name}} vor dem liefernden Schritt und ohne ihn', () => {
    expect(
      befunde(['notify "{{script:offen}}"', 'script "Zählen" as "offen"', 'notify "{{script:x}}"']),
    ).toEqual([
      ['scriptResultBeforeStep', 5],
      ['scriptResultBeforeStep', 7],
    ]);
    expect(befunde(['script "Zählen" as "offen"', 'notify "Noch {{script:OFFEN}}"'])).toEqual([]);
  });

  it('meldet {{script:name}} dort, wo der Wert vor dem ersten Schritt feststehen muss', () => {
    const vorne = 'script "Zählen" as "n"';
    expect(befunde([vorne, 'delete "{{script:n}}.md"'])).toEqual([['scriptResultNotAllowed', 6]]);
    expect(befunde([vorne, 'workflow "{{script:n}}"'])).toEqual([['scriptResultNotAllowed', 6]]);
    expect(befunde([vorne, 'create "a.md" from-template "{{script:n}}.md"'])).toEqual([
      ['scriptResultNotAllowed', 6],
    ]);
  });

  it('der Platzhalter-Satz kennt {{script:name}}, in einer Vorlage ist er leer', () => {
    const a = analyzeTemplate('Noch {{script:Offen}}');
    expect(a.ok).toBe(true);
    expect(a.segments[1]).toMatchObject({ type: 'context', name: 'script:offen' });
    expect(renderTemplate('{{script:offen}}', {}).text).toBe('');
    expect(analyzeTemplate('{{script}}').error.code).toBe('invalidParams');
    expect(analyzeTemplate('{{script:a b}}').error.code).toBe('invalidParams');
  });
});

describe('if-script in der Block-Form (AK2)', () => {
  it('öffnet einen Block mit else und end', () => {
    const r = pruefe(['if-script "Zählen"', 'notify "ja"', 'else', 'notify "nein"', 'end']);
    expect(r.findings).toEqual([]);
    expect(blockStructure(r.steps).blocks[0]).toEqual({ else: 2, end: 4, loop: false });
    expect(r.steps[0].script).toBe('return 2;');
    expect(befunde(['if-script "Zählen"', 'notify "ja"'])).toEqual([['blockEndMissing', 5]]);
  });
});

describe('Füllen vor dem Lauf mit Skript-Ergebnis (AK1)', () => {
  const kontext = { file: 'a.md', area: 'B', nowMs: 0 };

  it('stellt einen Schritt mit {{script:name}} zurück und füllt ihn mit dem Ergebnis', () => {
    const r = pruefe(['script "Zählen" as "offen"', 'create "Bericht {{script:offen}}.md"']);
    const lauf = prepareRun(r.steps, kontext, {}, {});
    expect(lauf.ok).toBe(true);
    expect(lauf.steps[0]).toMatchObject({
      keyword: 'script',
      script: 'return 2;',
      result: 'offen',
    });
    expect(lauf.steps[1].deferred.item).toBe(false);
    const fertig = fillLoopStep(lauf.steps[1], null, { offen: '2' });
    expect(fertig.ok).toBe(true);
    expect(fertig.step.args).toEqual(['Bericht 2.md']);
  });

  it('die Probe-Füllung meldet einen leeren Pfad aus einem Skript-Ergebnis nicht schon vorab', () => {
    const r = pruefe(['script "Zählen" as "ziel"', 'create "{{script:ziel}}"']);
    expect(prepareRun(r.steps, kontext, {}, {}).ok).toBe(true);
  });
});
