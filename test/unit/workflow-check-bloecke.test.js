// 4T-002464 (Epic 3E-000367): Die Block-Struktur der Bedingungen und der
// Schleife im Prüfer der Workflow-Zeilen (Stories 4S-001147 und 4S-001148).
//
// Geprüft werden die Befunde der Paarung von Bedingung, else und end, die
// Schachtel-Tiefe, die Platzhalter der Schleife und ihr Muster. Abgetrennt aus
// workflow-check.test.js, damit beide Prüfdateien im Zeilen-Budget bleiben.
import { describe, it, expect } from 'vitest';
import {
  blockStructure,
  checkWorkflow,
  hasLoopPlaceholder,
  loopNameMatches,
  parseLoopPattern,
} from '../../src/shared/workflows/workflow-check.js';
import { readWorkflowDocument } from '../../src/shared/workflows/workflow-document.js';

const FENCE = '```';
const dok = (zeilen, kopf = '') =>
  readWorkflowDocument(
    `---\nworkflow: true\n${kopf}---\n${FENCE}workflow\n${zeilen.join('\n')}\n${FENCE}\n`,
  );
const pruefe = (zeilen, optionen) => checkWorkflow(dok(zeilen), optionen);
const codes = (zeilen, optionen) => pruefe(zeilen, optionen).findings.map((f) => f.code);
const eins = (zeile, optionen) => pruefe([zeile], optionen).findings;

// 4T-002464 (Stories 4S-001147 und 4S-001148, Entscheidungen 3f und 3g):
// Bedingungen und Schleife als Block mit `else` und `end`.
describe('Block-Form der Bedingungen und der Schleife (4T-002464)', () => {
  const zeilenCodes = (zeilen) => pruefe(zeilen).findings.map((f) => [f.code, f.line]);
  // Erste Inhalts-Zeile des Blocks im Dokument (Kopf aus drei Zeilen, Zaun).
  const Z = 5;

  it('nimmt Bedingung, else und end an, eingerückt mit Leerzeichen, Tabulator oder gar nicht', () => {
    const block = (ein) => [
      'if-exists "a.md"',
      `${ein}notify "da"`,
      'else',
      `${ein}notify "fehlt"`,
      'end',
    ];
    for (const ein of ['', '  ', '\t']) {
      const r = pruefe(block(ein));
      expect(r.findings).toEqual([]);
      expect(r.steps.map((x) => x.keyword)).toEqual([
        'if-exists',
        'notify',
        'else',
        'notify',
        'end',
      ]);
    }
  });

  it('meldet ein fehlendes end an der öffnenden Zeile (AK2)', () => {
    expect(zeilenCodes(['notify "a"', 'if-missing "a.md"', 'notify "b"'])).toEqual([
      ['blockEndMissing', Z + 1],
    ]);
    const r = pruefe(['for-each "E/*.md"', 'notify "{{item}}"']);
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({
      code: 'blockEndMissing',
      line: Z,
      blockLine: 1,
      column: 1,
      detail: { keyword: 'for-each' },
    });
  });

  it('meldet ein überzähliges end, ein else ohne Bedingung und ein zweites else', () => {
    expect(zeilenCodes(['notify "a"', 'end'])).toEqual([['blockEndExtra', Z + 1]]);
    expect(zeilenCodes(['else'])).toEqual([['elseWithoutCondition', Z]]);
    expect(zeilenCodes(['for-each "E/*.md"', 'else', 'end'])).toEqual([
      ['elseWithoutCondition', Z + 1],
    ]);
    expect(zeilenCodes(['if-exists "a"', 'else', 'else', 'end'])).toEqual([
      ['elseDuplicate', Z + 2],
    ]);
  });

  it('lässt Tiefe 3 zu und meldet Tiefe 4, die Schleife mitgezählt', () => {
    const tief = (n, oeffner = 'if-exists "a"') => [
      ...Array.from({ length: n }, () => oeffner),
      'notify "x"',
      ...Array.from({ length: n }, () => 'end'),
    ];
    expect(zeilenCodes(tief(3))).toEqual([]);
    expect(zeilenCodes(tief(4))).toEqual([['blockTooDeep', Z + 3]]);
    expect(pruefe(tief(4)).findings[0].detail).toEqual({ keyword: 'if-exists', max: 3 });
    const mitSchleife = ['for-each "E/*.md"', ...tief(3).slice(0, -1), 'end', 'end'];
    expect(zeilenCodes(mitSchleife).map((x) => x[0])).toEqual(['blockTooDeep']);
  });

  it('meldet eine Schleife in einer Schleife, eine Bedingung darin ist erlaubt', () => {
    expect(
      zeilenCodes(['for-each "A/*.md"', 'for-each "B/*.md"', 'notify "x"', 'end', 'end']),
    ).toEqual([['loopNested', Z + 1]]);
    expect(
      zeilenCodes([
        'for-each "A/*.md"',
        '  if-property "{{item}}" typ "Rechnung"',
        '    add-tag "{{item}}" "rechnung"',
        '  end',
        'end',
      ]),
    ).toEqual([]);
  });

  it('meldet {{item}} und {{item:name}} außerhalb einer Schleife, auch auf der Zeile for-each', () => {
    const r = pruefe([
      'notify "{{item}}"',
      'create "{{item:name}}.md"',
      'for-each "{{item}}/*"',
      'end',
    ]);
    expect(r.findings.map((f) => [f.code, f.line, f.detail.placeholder])).toEqual([
      ['itemOutsideLoop', Z, 'item'],
      ['itemOutsideLoop', Z + 1, 'item:name'],
      ['itemOutsideLoop', Z + 2, 'item'],
    ]);
    expect(r.ok).toBe(false);
    // Nach dem end der Schleife gilt {{item}} nicht mehr.
    expect(
      zeilenCodes(['for-each "A/*.md"', 'notify "{{item}}"', 'end', 'notify "{{item:name}}"']),
    ).toEqual([['itemOutsideLoop', Z + 3]]);
  });

  it('meldet {{item}} dort, wo der Wert vor dem ersten Schritt feststehen muss', () => {
    const r = pruefe([
      'for-each "A/*.md"',
      'workflow "{{item:name}}"',
      'macro "{{item:name}}"',
      'delete "{{item}}"',
      'create "Neu/{{item:name}}.md" from-template "Vorlagen/{{item:name}}.md"',
      'move "{{item}}" "Archiv"',
      'end',
    ]);
    expect(r.findings.map((f) => [f.code, f.line, f.detail])).toEqual([
      ['itemNotAllowed', Z + 1, { keyword: 'workflow' }],
      ['itemNotAllowed', Z + 2, { keyword: 'macro' }],
      ['itemNotAllowed', Z + 3, { keyword: 'delete' }],
      ['itemNotAllowed', Z + 4, { option: 'from-template' }],
    ]);
  });

  it('prüft das Muster der Schleife und die Bereichs-Grenze ihres Ordners', () => {
    for (const gut of ['E/*.md', 'P/**/*.md', 'P/**', '*.md', 'E/Notiz-?.md', '{{folder}}/*.md']) {
      expect(codes([`for-each "${gut}"`, 'end']), gut).toEqual([]);
    }
    expect(eins('for-each "a*/b.md"').map((f) => f.code)).toContain('loopPatternInvalid');
    expect(eins('for-each "P/**/x/*.md"').map((f) => f.code)).toContain('loopPatternInvalid');
    expect(pruefe(['for-each "../E/*.md"', 'end']).findings[0]).toMatchObject({
      code: 'pathOutsideArea',
      detail: { kind: 'parent' },
    });
    expect(pruefe(['for-each "C:/E/*.md"', 'end']).findings[0]).toMatchObject({
      code: 'pathOutsideArea',
      detail: { kind: 'absolute' },
    });
    expect(codes(['for-each E', 'end'])).toEqual(['argumentType']);
  });

  it('verlangt bei if-property Pfad und Namen, der Wert ist optional', () => {
    expect(codes(['if-property "a.md"', 'end'])).toEqual(['missingArgument']);
    expect(codes(['if-property "a.md" typ "x" "y"', 'end'])).toEqual(['extraArgument']);
    expect(codes(['if-exists', 'end'])).toEqual(['missingArgument']);
    expect(codes(['else "x"', 'if-exists "a"', 'end x'])).toEqual([
      'elseWithoutCondition',
      'extraArgument',
      'extraArgument',
    ]);
  });

  it('verhindert mit jedem Block-Befund auch die Scharf-Schaltung', () => {
    const r = checkWorkflow(
      dok(['if-exists "a"', 'notify "x"'], 'trigger: schedule\nschedule: every monday at 08:00\n'),
    );
    expect(r.findings.map((f) => f.code)).toEqual(['blockEndMissing']);
    expect(r.ok).toBe(false);
    expect(r.armable).toBe(false);
  });

  it('liest die Paarung über blockStructure für den Ablauf-Kern', () => {
    const kw = (k, line) => ({ keyword: k, line });
    const r = blockStructure([
      kw('for-each', 1),
      kw('if-exists', 2),
      kw('notify', 3),
      kw('else', 4),
      kw('notify', 5),
      kw('end', 6),
      kw('end', 7),
      kw('notify', 8),
    ]);
    expect(r.findings).toEqual([]);
    expect(r.blocks).toEqual({
      0: { else: null, end: 6, loop: true },
      1: { else: 3, end: 5, loop: false },
    });
    expect(r.inLoop).toEqual([false, true, true, true, true, true, false, false]);
  });
});

describe('Muster und Platzhalter der Schleife (4T-002464)', () => {
  it('liest Ordner, Unterordner und Namens-Muster', () => {
    expect(parseLoopPattern('Eingang/*.md')).toEqual({
      ok: true,
      folder: 'Eingang',
      recursive: false,
      name: '*.md',
    });
    expect(parseLoopPattern('Projekte\\**\\*.md')).toEqual({
      ok: true,
      folder: 'Projekte',
      recursive: true,
      name: '*.md',
    });
    expect(parseLoopPattern('P/**')).toMatchObject({
      ok: true,
      folder: 'P',
      recursive: true,
      name: '*',
    });
    expect(parseLoopPattern('./*.md')).toMatchObject({ ok: true, folder: '', recursive: false });
    for (const schlecht of ['', '/', 'a*/b.md', 'a/**/b/*.md', 'a/b**.md', '**/**/x.md']) {
      expect(parseLoopPattern(schlecht).ok, schlecht).toBe(false);
    }
  });

  it('vergleicht Namen mit * und ? ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(loopNameMatches('*.md', 'Notiz.MD')).toBe(true);
    expect(loopNameMatches('*.md', 'Notiz.mdx')).toBe(false);
    expect(loopNameMatches('Tag-?.md', 'Tag-1.md')).toBe(true);
    expect(loopNameMatches('Tag-?.md', 'Tag-12.md')).toBe(false);
    expect(loopNameMatches('(a)+[b].md', '(a)+[b].md')).toBe(true);
  });

  it('erkennt die Schleifen-Platzhalter, nicht ihre Escape-Form', () => {
    expect(hasLoopPlaceholder('{{item}}')).toBe(true);
    expect(hasLoopPlaceholder('x/{{item:name}}.md')).toBe(true);
    expect(hasLoopPlaceholder('\\{{item}}')).toBe(false);
    expect(hasLoopPlaceholder('{{file}}')).toBe(false);
    expect(eins('notify "{{item:pfad}}"').map((f) => f.code)).toEqual(['placeholderInvalid']);
  });
});
