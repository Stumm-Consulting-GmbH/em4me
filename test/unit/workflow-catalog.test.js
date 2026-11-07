// 4T-002347 (Epic 3E-000184): Der Befehls-Katalog der Workflows als Daten.
//
// Bestands-Lesung: Die Befehle und ihre Stufen sind die des Befehls-Katalogs
// im Entscheidungs-Protokoll der Konzept-Stufe (4T-002330, Tabellen «Dateien
// und Ordner», «Inhalte und Dateikopf», «Anwendung», «Ablauf», «Datenbank»),
// entschieden am 2026-10-20 (K1 bis K3). Die Obergrenze der Wartezeit ist die
// der Makros (`MACRO_MAX_DELAY_SECONDS`, `src/shared/commands/command-placement.js`).
// Seit 4T-002464 (Entscheidungen 3f und 3g der Konzept-Runde 4T-002458) dazu
// die Block-Wörter `else` und `end` und die Schemata der Bedingungen und der
// Schleife der Stufe 3.
import { describe, it, expect } from 'vitest';
import {
  BLOCK_KEYWORDS,
  CONDITION_KEYWORDS,
  ENABLED_STAGES,
  LOOP_KEYWORD,
  MAX_BLOCK_DEPTH,
  MAX_LOOP_FILES,
  hasSchema,
  LATER_STAGE_PLACEHOLDERS,
  MAX_WAIT_SECONDS,
  OPTIONS,
  WORKFLOW_COMMANDS,
  laterStagePlaceholder,
  lookupCommand,
  lookupOption,
} from '../../src/shared/workflows/workflow-catalog.js';
import { MACRO_MAX_DELAY_SECONDS } from '../../src/shared/commands/command-placement.js';

const STUFEN = {
  1: [
    'create',
    'rename',
    'move',
    'copy',
    'mkdir',
    'open',
    'close',
    'append',
    'insert',
    'replace',
    'set-property',
    'remove-property',
    'command',
    'macro',
    'workflow',
    'wait',
    'notify',
    'stop',
  ],
  2: ['delete', 'add-tag', 'remove-tag', 'complete-task', 'confirm'],
  3: ['if-exists', 'if-missing', 'if-property', 'if-script', 'for-each', 'else', 'end', 'script'],
  D: [
    'db-create',
    'db-update',
    'db-delete',
    'db-query',
    'db-for-each',
    'db-open',
    'db-open-list',
    'db-check',
    'db-export',
    'db-import',
  ],
};

describe('Befehls-Katalog der Workflows', () => {
  it('führt genau die Befehle des Konzept-Katalogs mit ihrer Stufe', () => {
    const erwartet = Object.entries(STUFEN).flatMap(([stufe, befehle]) =>
      befehle.map((b) => [b, stufe === 'D' ? 'D' : Number(stufe)]),
    );
    const ist = Object.entries(WORKFLOW_COMMANDS).map(([b, e]) => [b, e.stage]);
    expect(ist.sort()).toEqual(erwartet.sort());
    expect(ist.length).toBe(41);
  });

  it('gibt den Befehlen der Stufen 1 bis 3 ein Schema, denen der Stufe D nur die Stufe (O6)', () => {
    for (const [befehl, eintrag] of Object.entries(WORKFLOW_COMMANDS)) {
      if (eintrag.stage === 1 || eintrag.stage === 2 || befehl === 'script') {
        expect(Array.isArray(eintrag.args), befehl).toBe(true);
        expect(eintrag.args.length, befehl).toBeGreaterThan(0);
        expect(hasSchema(eintrag), befehl).toBe(true);
      } else if (BLOCK_KEYWORDS.includes(befehl)) {
        expect(eintrag.stage, befehl).toBe(3);
        expect(hasSchema(eintrag), befehl).toBe(true);
      } else {
        expect(hasSchema(eintrag), befehl).toBe(false);
        expect(eintrag.args, befehl).toBeNull();
        expect(eintrag.groups, befehl).toBeNull();
      }
    }
  });

  it('schaltet die Stufen 1 bis 3 frei, nicht D (4T-002464)', () => {
    expect(ENABLED_STAGES).toEqual([1, 2, 3]);
  });

  // 4T-002464: Bedingungen und Schleife in Block-Form (3f, 3g).
  it.each([
    ['if-exists', ['path'], []],
    ['if-missing', ['path'], []],
    ['if-property', ['path', 'key', 'value'], [2]],
    ['for-each', ['pattern'], []],
    ['else', [], []],
    ['end', [], []],
  ])('gibt %s das Schema der Block-Form', (befehl, arten, optional) => {
    const eintrag = lookupCommand(befehl);
    expect(eintrag.stage).toBe(3);
    expect(eintrag.args.map((a) => a.type)).toEqual(arten);
    expect(eintrag.groups).toEqual({});
    expect(eintrag.args.map((a, i) => (a.optional ? i : null)).filter((i) => i !== null)).toEqual(
      optional,
    );
  });

  it('nennt die Block-Wörter und die Grenzen der Block-Form', () => {
    expect(CONDITION_KEYWORDS).toEqual(['if-exists', 'if-missing', 'if-property', 'if-script']);
    expect(LOOP_KEYWORD).toBe('for-each');
    expect(BLOCK_KEYWORDS).toEqual([
      'if-exists',
      'if-missing',
      'if-property',
      'if-script',
      'for-each',
      'else',
      'end',
    ]);
    expect(MAX_BLOCK_DEPTH).toBe(3);
    expect(MAX_LOOP_FILES).toBe(500);
    // Ein Name aus dem Eigenschafts-Namen verlangt einen nicht leeren Text.
    expect(lookupCommand('if-property').args[1].nonEmpty).toBe(true);
  });

  it('gibt dem Skript-Schritt sein Schema mit der Pflicht-Option as (4T-002465)', () => {
    const eintrag = lookupCommand('script');
    expect(eintrag.stage).toBe(3);
    expect(eintrag.args.map((a) => [a.type, a.nonEmpty])).toEqual([['text', true]]);
    expect(eintrag.groups).toEqual({ result: 'required' });
    expect(lookupCommand('if-script').args.map((a) => a.type)).toEqual(['text']);
    expect(lookupCommand('if-script').groups).toEqual({});
    expect(lookupOption('as')).toEqual({ group: 'result', kind: 'result', value: 'text' });
    expect(hasSchema(eintrag)).toBe(true);
    expect(hasSchema(null)).toBe(false);
  });

  // 4T-002424: die Argument-Schemata der fünf Pflege-Befehle (Regeln P1 bis P5).
  it.each([
    ['delete', ['path']],
    ['add-tag', ['path', 'text']],
    ['remove-tag', ['path', 'text']],
    ['complete-task', ['path', 'text']],
    ['confirm', ['text']],
  ])('gibt %s das Schema der Regeln P1 bis P5', (befehl, arten) => {
    const eintrag = lookupCommand(befehl);
    expect(eintrag.stage).toBe(2);
    expect(eintrag.args.map((a) => a.type)).toEqual(arten);
    expect(eintrag.groups).toEqual({});
    // Schlagwort, Suchtext und Frage dürfen nicht leer sein.
    for (const a of eintrag.args.filter((x) => x.type === 'text')) expect(a.nonEmpty).toBe(true);
  });

  it('führt allein die fünf Pflege-Befehle in der Stufe 2', () => {
    const zwei = Object.entries(WORKFLOW_COMMANDS)
      .filter(([, e]) => e.stage === 2)
      .map(([b]) => b)
      .sort();
    expect(zwei).toEqual(['add-tag', 'complete-task', 'confirm', 'delete', 'remove-tag']);
  });

  it('kennt geerbte Namen nicht als Befehl oder Option', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(lookupCommand(name), name).toBeNull();
      expect(lookupOption(name), name).toBeNull();
      expect(laterStagePlaceholder(name), name).toBeNull();
    }
    expect(lookupCommand(undefined)).toBeNull();
    expect(lookupCommand('Create')).toBeNull();
  });

  it('ist eingefroren', () => {
    expect(Object.isFrozen(WORKFLOW_COMMANDS)).toBe(true);
    expect(Object.isFrozen(WORKFLOW_COMMANDS.create)).toBe(true);
    expect(Object.isFrozen(WORKFLOW_COMMANDS.create.args)).toBe(true);
    expect(Object.isFrozen(OPTIONS)).toBe(true);
  });

  it('nimmt die Obergrenze der Wartezeit von den Makros', () => {
    expect(MAX_WAIT_SECONDS).toBe(MACRO_MAX_DELAY_SECONDS);
    expect(MAX_WAIT_SECONDS).toBe(10);
  });

  it('ordnet die Optionen ihren Gruppen zu', () => {
    expect(lookupOption('from-template')).toMatchObject({
      group: 'source',
      kind: 'template',
      value: 'path',
    });
    expect(lookupOption('from-file')).toMatchObject({
      group: 'source',
      kind: 'file',
      value: 'path',
    });
    expect(lookupOption('from-section')).toMatchObject({
      group: 'source',
      kind: 'section',
      value: 'text',
    });
    expect(lookupOption('under')).toMatchObject({
      group: 'position',
      kind: 'under',
      value: 'text',
    });
    expect(lookupOption('at-start')).toMatchObject({
      group: 'position',
      kind: 'atStart',
      value: null,
    });
  });

  it('nennt die Zwischenablage als Platzhalter der Stufe 2 und gibt sie mit ihr frei (O8, 4T-002424)', () => {
    expect(LATER_STAGE_PLACEHOLDERS).toEqual({ clipboard: 2 });
    expect(laterStagePlaceholder('clipboard')).toBeNull();
    expect(laterStagePlaceholder('clipboard', [1])).toBe(2);
    expect(laterStagePlaceholder('date')).toBeNull();
  });
});
