// 4T-002347 (Epic 3E-000184): Platzhalter der Workflows (G5, S-a, S-b) und die
// Lauf-Vorbereitung.
//
// Geprüft werden die zweistufige Erhebung der Eingaben (Zeilen, danach die
// eingesetzten Vorlagen), die Bedeutung von `{{title}}` und `{{folder}}` je
// Ort (S-b), die erneute Grenz-Prüfung nach dem Füllen, die wörtlichen
// Quellen (Entscheidung der Sitzung vom 2026-10-22, O2) und die
// Übertragbarkeit des Ergebnisses an den Hauptprozess.
import { describe, it, expect } from 'vitest';
import { checkWorkflow } from '../../src/shared/workflows/workflow-check.js';
import { readWorkflowDocument } from '../../src/shared/workflows/workflow-document.js';
import {
  prepareRun,
  templateInputs,
  templateRefs,
  workflowInputs,
} from '../../src/shared/workflows/workflow-placeholders.js';

const FENCE = '```';
const NOW = new Date(2026, 9, 22, 23, 59, 30).getTime();
const KONTEXT = {
  file: 'Notizen/Aktiv.md',
  title: 'Aktiv',
  folder: 'Notizen',
  area: 'Mein Bereich',
  nowMs: NOW,
};

function schritte(zeilen) {
  const doc = readWorkflowDocument(
    `---\nworkflow: true\n---\n${FENCE}workflow\n${zeilen.join('\n')}\n${FENCE}\n`,
  );
  const r = checkWorkflow(doc);
  expect(r.findings).toEqual([]);
  return r.steps;
}

const P = (frage, vorgabe = '') => `prompt:${frage}:${vorgabe}`;

describe('workflowInputs — Eingaben der Zeilen', () => {
  it('sammelt in Reihenfolge, entdoppelt und mit Vorgabe', () => {
    const s = schritte([
      'mkdir "Projekte/{{prompt:Projekt?}}"',
      'replace "{{file}}" "X" "{{prompt:Projekt?}}"',
      'notify "{{prompt:Gruß?:Hallo}} {{select:Farbe:rot,grün}}"',
      'insert "a.md" under "{{prompt:Ort?}}" from-template "Vorlagen/{{prompt:Art?}}.md"',
    ]);
    expect(workflowInputs(s).map((i) => [i.key, i.kind, i.defaultValue])).toEqual([
      [P('Projekt?'), 'prompt', ''],
      [P('Gruß?', 'Hallo'), 'prompt', 'Hallo'],
      ['select:Farbe:rot,grün', 'select', undefined],
      [P('Art?'), 'prompt', ''],
      [P('Ort?'), 'prompt', ''],
    ]);
  });

  it('liefert ohne Eingaben eine leere Liste', () => {
    expect(workflowInputs(schritte(['wait 1', 'command view.modeSplit']))).toEqual([]);
    expect(workflowInputs([])).toEqual([]);
  });
});

describe('S-a — Vorlagen-Pfade und Eingaben der Vorlagen', () => {
  const s = schritte([
    'create "Projekte/{{prompt:Projekt?}}.md" from-template "Vorlagen/{{prompt:Art?}}.md"',
    'append "{{file}}" from-template "Vorlagen/Fuß.md"',
  ]);
  const antworten = { [P('Projekt?')]: 'Alpha', [P('Art?')]: 'Projekt' };

  it('füllt die Pfade erst mit den Antworten', () => {
    expect(templateRefs(s, KONTEXT, antworten)).toEqual({
      refs: [
        { line: 5, blockLine: 1, path: 'Vorlagen/Projekt.md' },
        { line: 6, blockLine: 2, path: 'Vorlagen/Fuß.md' },
      ],
      findings: [],
    });
  });

  it('fragt in der zweiten Stufe nur nach, was noch offen ist', () => {
    const { refs } = templateRefs(s, KONTEXT, antworten);
    const r = templateInputs(
      refs,
      {
        'Vorlagen/Projekt.md': '# {{prompt:Projekt?}}\n{{prompt:Leitung?}}',
        'Vorlagen/Fuß.md': '{{prompt:Leitung?}}',
      },
      antworten,
    );
    expect(r).toEqual({
      inputs: [{ key: P('Leitung?'), kind: 'prompt', question: 'Leitung?', defaultValue: '' }],
      findings: [],
    });
  });

  it('meldet eine nicht lesbare und eine fehlerhafte Vorlage an der Zeile', () => {
    const { refs } = templateRefs(s, KONTEXT, antworten);
    const r = templateInputs(
      refs,
      { 'Vorlagen/Projekt.md': null, 'Vorlagen/Fuß.md': '{{kaputt}}' },
      antworten,
    );
    expect(r.findings.map((f) => [f.code, f.line, f.detail.path])).toEqual([
      ['templateUnreadable', 5, 'Vorlagen/Projekt.md'],
      ['templateInvalid', 6, 'Vorlagen/Fuß.md'],
    ]);
    expect(templateInputs(refs, { constructor: 'x' }, {}).findings).toHaveLength(2);
  });

  it('weist einen Vorlagen-Pfad ab, der erst durch eine Antwort ausbricht', () => {
    const r = templateRefs(s, KONTEXT, { ...antworten, [P('Art?')]: '../../geheim' });
    expect(r.findings.map((f) => [f.code, f.detail.kind])).toEqual([['pathOutsideArea', 'parent']]);
    expect(r.refs).toHaveLength(1);
  });
});

describe('prepareRun — gefüllte Schritte', () => {
  it('füllt Pfade, Texte und Zahlen und übernimmt Kennungen', () => {
    const s = schritte([
      'create "Journal/{{date}}.md"',
      'rename "Entwurf.md" "Notiz {{date}}.md"',
      'set-property "{{file}}" seiten 12',
      'set-property "{{file}}" status "{{prompt:Status?}}"',
      'command view.modeSplit',
      'wait 1.5',
    ]);
    const r = prepareRun(s, KONTEXT, { [P('Status?')]: 'offen' }, {});
    expect(r.findings).toEqual([]);
    expect(r.steps.map((x) => x.args)).toEqual([
      ['Journal/2026-10-22.md'],
      ['Entwurf.md', 'Notiz 2026-10-22.md'],
      ['Notizen/Aktiv.md', 'seiten', 12],
      ['Notizen/Aktiv.md', 'status', 'offen'],
      ['view.modeSplit'],
      [1.5],
    ]);
  });

  it('S-b: title und folder meinen in der Zeile das aktive Dokument, in der Vorlage die Ziel-Datei', () => {
    const s = schritte([
      'create "Projekte/Neu∕Unter.md" from-template "T.md"',
      'notify "{{title}} in {{folder}}"',
    ]);
    const vorlage = '{{title}}|{{folder}}|{{file}}|{{area}}';
    const r = prepareRun(s, KONTEXT, {}, { 'T.md': vorlage });
    expect(r.steps[0].source).toEqual({
      kind: 'template',
      path: 'T.md',
      text: 'Neu/Unter|Projekte|Notizen/Aktiv.md|Mein Bereich',
    });
    expect(r.steps[1].args).toEqual(['Aktiv in Notizen']);
  });

  it('nimmt einen Zeitpunkt für den ganzen Lauf', () => {
    const s = schritte(['notify "{{time::HH:mm:ss}}"', 'wait 2', 'notify "{{time::HH:mm:ss}}"']);
    const r = prepareRun(s, KONTEXT, {}, {});
    expect(r.steps[0].args).toEqual(r.steps[2].args);
    expect(r.steps[0].args).toEqual(['23:59:30']);
  });

  it('lässt keinen führenden Trenner hinter einem leeren Platzhalter stehen', () => {
    const s = schritte(['create "{{folder}}/Neu.md"', 'create "{{folder}}\\Neu.md"']);
    const r = prepareRun(s, { ...KONTEXT, folder: '' }, {}, {});
    expect(r.steps.map((x) => x.args[0])).toEqual(['Neu.md', 'Neu.md']);
    expect(prepareRun(s, KONTEXT, {}, {}).steps[0].args[0]).toBe('Notizen/Neu.md');
  });

  it('prüft nach dem Füllen erneut: Antwort mit Ausbruch, Datei außerhalb, ohne Dokument', () => {
    const s = schritte([
      'mkdir "{{prompt:Ordner?}}"',
      'move "{{file}}" "Archiv"',
      'rename "a.md" "{{prompt:Name?}}"',
    ]);
    const ausbruch = prepareRun(s, KONTEXT, { [P('Ordner?')]: '../x', [P('Name?')]: 'a/b.md' }, {});
    expect(ausbruch.ok).toBe(false);
    expect(ausbruch.steps).toEqual([]);
    expect(ausbruch.findings.map((f) => [f.line, f.code])).toEqual([
      [5, 'pathOutsideArea'],
      [7, 'nameInvalid'],
    ]);
    const aussen = prepareRun(
      s,
      { ...KONTEXT, file: '../Anderswo/A.md' },
      { [P('Ordner?')]: 'x', [P('Name?')]: 'b.md' },
      {},
    );
    expect(aussen.findings.map((f) => f.code)).toEqual(['pathOutsideArea']);
    const ohne = prepareRun(
      s,
      { ...KONTEXT, file: '' },
      { [P('Ordner?')]: 'x', [P('Name?')]: 'b.md' },
      {},
    );
    expect(ohne.findings.map((f) => f.code)).toEqual(['pathEmpty']);
  });

  it('meldet eine fehlende Antwort statt still zu füllen', () => {
    const r = prepareRun(schritte(['notify "{{prompt:A?}}"']), KONTEXT, {}, {});
    expect(r.findings.map((f) => [f.code, f.detail.engine])).toEqual([
      ['placeholderInvalid', 'missingAnswer'],
    ]);
  });

  it('übernimmt Abschnitt und Datei wörtlich und liest sie erst beim Schritt (O1, O2)', () => {
    const s = schritte([
      'append "a.md" from-section "Eintrag {{prompt:N?}}"',
      'insert "a.md" at-start from-file "{{date}}.md"',
    ]);
    const r = prepareRun(s, KONTEXT, { [P('N?')]: '1' }, {});
    expect(r.steps[0].source).toEqual({ kind: 'section', name: 'Eintrag 1' });
    expect(r.steps[1].source).toEqual({ kind: 'file', path: '2026-10-22.md' });
    expect(r.steps[1].position).toEqual({ kind: 'atStart' });
  });

  it('füllt die Überschrift hinter under', () => {
    const s = schritte(['insert "a.md" under "Protokoll {{date}}" from-file "b.md"']);
    expect(prepareRun(s, KONTEXT, {}, {}).steps[0].position).toEqual({
      kind: 'under',
      heading: 'Protokoll 2026-10-22',
    });
  });

  it('meldet eine Vorlage, die zum Lauf fehlt', () => {
    const r = prepareRun(schritte(['create "a.md" from-template "T.md"']), KONTEXT, {}, {});
    expect(r.findings.map((f) => f.code)).toEqual(['templateUnreadable']);
  });

  it('prüft Workflow und Makro nach dem Füllen, Selbstaufruf eingeschlossen', () => {
    const s = schritte(['workflow "{{prompt:W?}}"', 'macro "{{prompt:M?}}"']);
    const optionen = { ownName: 'Ich', isKnownWorkflow: () => true, isKnownMacro: () => false };
    const r = prepareRun(s, KONTEXT, { [P('W?')]: 'Ich', [P('M?')]: 'Fehlt' }, {}, optionen);
    expect(r.findings.map((f) => f.code)).toEqual(['selfCall', 'macroUnknown']);
  });

  it('meldet einen nach dem Füllen mehrdeutigen Namen (4T-002349, E1)', () => {
    const s = schritte(['workflow "{{prompt:W?}}"', 'macro "{{prompt:M?}}"']);
    const optionen = { isKnownWorkflow: () => 2, isKnownMacro: () => 3 };
    const r = prepareRun(s, KONTEXT, { [P('W?')]: 'X', [P('M?')]: 'Y' }, {}, optionen);
    expect(r.findings.map((f) => f.code)).toEqual(['workflowAmbiguous', 'macroAmbiguous']);
  });

  it('liefert ein Ergebnis, das JSON verlustfrei übersteht', () => {
    const s = schritte([
      'create "a.md" from-template "T.md"',
      'insert "a.md" under "X" from-section "Y"',
      'wait 2',
    ]);
    const r = prepareRun(s, KONTEXT, {}, { 'T.md': 'Text' });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
