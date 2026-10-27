// 4T-002347 (Epic 3E-000184): Der Prüfer der Workflow-Zeilen (G6, «Prüfen vor
// Laufen»; Story 4S-001101).
//
// Bestands-Lesung: Die Beispiel-Zeilen sind die des Befehls-Katalogs im
// Entscheidungs-Protokoll der Konzept-Stufe (4T-002330), jede Stufe-1-Zeile
// muss gelten, jede Zeile einer späteren Stufe den Stufen-Befund ergeben. Die
// Existenz von Dateien und Abschnitten prüft der Prüfer nicht (Entscheidung der
// Sitzung vom 2026-10-22, O1); das belegt der letzte Block.
import { describe, it, expect } from 'vitest';
import { checkPlaceholders, checkWorkflow } from '../../src/shared/workflows/workflow-check.js';
import { readWorkflowDocument } from '../../src/shared/workflows/workflow-document.js';

const FENCE = '```';
const dok = (zeilen, kopf = '') =>
  readWorkflowDocument(
    `---\nworkflow: true\n${kopf}---\n${FENCE}workflow\n${zeilen.join('\n')}\n${FENCE}\n`,
  );
const pruefe = (zeilen, optionen) => checkWorkflow(dok(zeilen), optionen);
const codes = (zeilen, optionen) => pruefe(zeilen, optionen).findings.map((f) => f.code);
const eins = (zeile, optionen) => pruefe([zeile], optionen).findings;

const KATALOG_STUFE_1 = [
  'create "Journal/{{date}}.md" from-template "Vorlagen/Tag.md"',
  'rename "Entwurf.md" "Notiz {{date}}.md"',
  'move "{{file}}" "Archiv/2026"',
  'copy "Vorlagen/Checkliste.md" "Projekte/Neu/Checkliste.md"',
  'mkdir "Projekte/{{prompt:Projektname?}}/Notizen"',
  'open "Journal/{{date}}.md"',
  'close "{{file}}"',
  'append "{{file}}" from-section "Offene Punkte"',
  'insert "{{file}}" under "Protokoll" from-section "Eintrag"',
  'replace "{{file}}" "PROJEKT" "{{prompt:Projektname?}}"',
  'set-property "{{file}}" status "erledigt"',
  'remove-property "{{file}}" entwurf',
  'command view.modeSplit',
  'macro "Tagesstart"',
  'workflow "Ordner anlegen"',
  'wait 2',
  'notify "Wochenrückblick angelegt"',
  'stop "Nichts zu tun"',
];

const KATALOG_SPAETER = [
  ['delete "Entwurf.md"', 2],
  ['add-tag "{{file}}" "#abgelegt"', 2],
  ['remove-tag "{{file}}" "#abgelegt"', 2],
  ['complete-task "Wochenplan.md" "Rückblick schreiben"', 2],
  ['confirm "Archiv wirklich aufräumen?"', 2],
  ['if-missing "Journal/{{date}}.md"', 3],
  ['if-exists "Journal/{{date}}.md"', 3],
  ['if-property "{{file}}" status "offen"', 3],
  ['for-each "Eingang/*.md"', 3],
  ['script "Zähle offene Aufgaben"', 3],
  ['db-create "Personen" name="{{prompt:Name?}}" status="aktiv"', 'D'],
  ['db-update "Personen" key="Müller" status="inaktiv"', 'D'],
  ['db-delete "Personen" r-00042', 'D'],
  [
    'db-query "TABLE RECORDS name FROM \\"Personen\\" WHERE status = aktiv" into "{{file}}" under "Aktive"',
    'D',
  ],
  ['db-for-each "TABLE RECORDS name, mail FROM \\"Personen\\""', 'D'],
  ['db-open "Personen" key="Müller"', 'D'],
  ['db-open-list "Listen/Aktive Personen.md"', 'D'],
  ['db-check "Personen"', 'D'],
];

describe('Katalog-Beispiele der Konzept-Stufe', () => {
  it('lässt jede Beispiel-Zeile der Stufe 1 gelten', () => {
    for (const zeile of KATALOG_STUFE_1) expect(eins(zeile), zeile).toEqual([]);
    const r = pruefe(KATALOG_STUFE_1);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.keyword)).toHaveLength(18);
  });

  it('weist jedes Beispiel einer späteren Stufe mit dem Stufen-Befund ab, delete eingeschlossen', () => {
    for (const [zeile, stufe] of KATALOG_SPAETER) {
      const f = eins(zeile);
      expect(
        f.map((x) => [x.code, x.detail.stage]),
        zeile,
      ).toEqual([['laterStage', stufe]]);
    }
  });

  it('nimmt eine spätere Stufe an, wenn der Aufrufer sie freischaltet', () => {
    expect(eins('wait 2', { stages: [] })[0].code).toBe('laterStage');
  });
});

describe('Geprüfte Schritte', () => {
  it('liefert Schlüsselwort, Argumente, Quelle und Ort mit Zeilen', () => {
    const r = pruefe(['# Kopf', 'insert "{{file}}" from-section "Eintrag" under "Protokoll"']);
    expect(r.steps).toEqual([
      {
        line: 6,
        blockLine: 2,
        keyword: 'insert',
        args: [{ type: 'path', raw: '{{file}}', form: 'string' }],
        source: { kind: 'section', raw: 'Eintrag' },
        position: { kind: 'under', raw: 'Protokoll' },
      },
    ]);
  });

  it('nimmt at-start als einzelnes Wort und Werte als Zahl', () => {
    const r = pruefe(['insert "a.md" at-start from-file "b.md"', 'set-property "a.md" seiten 12']);
    expect(r.findings).toEqual([]);
    expect(r.steps[0].position).toEqual({ kind: 'atStart' });
    expect(r.steps[1].args[2]).toEqual({ type: 'value', raw: '12', form: 'word' });
  });

  it('nimmt einen Eigenschafts-Namen auch in Anführungszeichen', () => {
    expect(eins('remove-property "a.md" "Mein Feld"')).toEqual([]);
  });
});

describe('Befunde je Code mit Zeile und Spalte', () => {
  it('unbekannter Befehl, auch Groß geschrieben und geerbte Namen', () => {
    expect(eins('foo "x"')).toEqual([
      { code: 'unknownCommand', line: 5, blockLine: 1, column: 1, detail: { keyword: 'foo' } },
    ]);
    expect(codes(['Create "x.md"', 'constructor', 'toString "a"'])).toEqual([
      'unknownCommand',
      'unknownCommand',
      'unknownCommand',
    ]);
  });

  it('fehlende und überzählige Argumente', () => {
    expect(eins('create')).toMatchObject([
      { code: 'missingArgument', detail: { position: 1, expected: 'path' } },
    ]);
    expect(eins('move "a.md"')[0]).toMatchObject({
      code: 'missingArgument',
      detail: { position: 2 },
    });
    expect(eins('mkdir "a" "b"')).toMatchObject([{ code: 'extraArgument', column: 11 }]);
    expect(eins('create from-template "x.md"')[0]).toMatchObject({
      code: 'missingArgument',
      column: 8,
    });
  });

  it('falsche Art eines Arguments', () => {
    expect(eins('create Journal.md')[0]).toMatchObject({
      code: 'argumentType',
      detail: { expected: 'path' },
    });
    expect(eins('macro Tagesstart')[0].code).toBe('argumentType');
    expect(eins('set-property "a.md" status erledigt')[0].code).toBe('argumentType');
    expect(eins('notify text="x"')[0].code).toBe('argumentType');
  });

  it('Optionen: unbekannt für den Befehl, doppelt, fehlend, ohne Wert', () => {
    expect(codes(['mkdir "a" from-file "b.md"'])).toEqual(['unknownOption']);
    expect(codes(['create "a.md" from-file "b.md" from-template "c.md"'])).toEqual([
      'duplicateOption',
    ]);
    expect(codes(['append "a.md"'])).toEqual(['missingOption']);
    expect(codes(['insert "a.md" from-file "b.md"'])).toEqual(['missingOption']);
    expect(codes(['insert "a.md" under "X"'])).toEqual(['missingOption']);
    expect(codes(['create "a.md" from-template'])).toEqual(['missingArgument']);
    expect(codes(['insert "a.md" under at-start from-file "b.md"'])).toEqual(['missingArgument']);
  });

  it('Wartezeit: Zahl, Grenzen und Schreibweise', () => {
    expect(eins('wait 0')).toEqual([]);
    expect(eins('wait 10')).toEqual([]);
    expect(eins('wait 1.5')).toEqual([]);
    expect(eins('wait 10.5')[0]).toMatchObject({ code: 'valueOutOfRange', detail: { max: 10 } });
    for (const z of ['wait 2,5', 'wait -1', 'wait "2"', 'wait zwei'])
      expect(eins(z)[0].code, z).toBe('invalidNumber');
  });

  it('leerer Text, wo einer nötig ist', () => {
    expect(
      codes(['replace "a.md" "" "x"', 'notify ""', 'stop " "', 'set-property "a.md" "" "x"']),
    ).toEqual(['textEmpty', 'textEmpty', 'textEmpty', 'textEmpty']);
    expect(eins('replace "a.md" "x" ""')).toEqual([]);
  });

  it('Kommando-Kennung: Form, reservierte Namensräume, Rückfrage', () => {
    expect(eins('command "view.modeSplit"')[0].code).toBe('commandIdInvalid');
    expect(eins('command modeSplit')[0].code).toBe('commandIdInvalid');
    expect(eins('command macro.abc')[0].code).toBe('commandReserved');
    expect(eins('command workflow.abc')[0].code).toBe('commandReserved');
    const bekannt = { isKnownCommand: (id) => id === 'view.modeSplit' };
    expect(eins('command view.modeSplit', bekannt)).toEqual([]);
    expect(eins('command view.gibtsNicht', bekannt)[0]).toMatchObject({
      code: 'commandUnknown',
      detail: { command: 'view.gibtsNicht' },
    });
  });

  it('Makro und Workflow: Rückfragen und Selbstaufruf', () => {
    const optionen = {
      ownName: 'Ich',
      isKnownMacro: (n) => n === 'Tagesstart',
      isKnownWorkflow: (n) => n === 'Anderer',
    };
    expect(codes(['macro "Tagesstart"', 'workflow "Anderer"'], optionen)).toEqual([]);
    expect(codes(['macro "Fehlt"', 'workflow "Fehlt"', 'workflow " Ich "'], optionen)).toEqual([
      'macroUnknown',
      'workflowUnknown',
      'selfCall',
    ]);
    // Mit Platzhalter prüft erst prepareRun nach dem Füllen.
    expect(codes(['workflow "{{prompt:Welcher?}}"'], optionen)).toEqual([]);
  });

  // 4T-002349, E1: Eine Rückfrage darf die Zahl der Treffer liefern; zwei
  // gleichnamige Makros oder Workflows sind mehrdeutig.
  it('Makro und Workflow: Zahl der Treffer, mehrdeutig bei zwei', () => {
    const zahl = { A: 1, B: 2 };
    const optionen = {
      isKnownMacro: (n) => zahl[n] || 0,
      isKnownWorkflow: (n) => zahl[n] || 0,
    };
    expect(codes(['macro "A"', 'workflow "A"'], optionen)).toEqual([]);
    expect(codes(['macro "B"', 'workflow "B"', 'macro "C"', 'workflow "C"'], optionen)).toEqual([
      'macroAmbiguous',
      'workflowAmbiguous',
      'macroUnknown',
      'workflowUnknown',
    ]);
    expect(eins('workflow "B"', optionen)[0].detail).toEqual({ name: 'B' });
  });

  it('Vorlagen ausgeschaltet', () => {
    expect(codes(['create "a.md" from-template "T.md"'], { templatesEnabled: false })).toEqual([
      'templatesDisabled',
    ]);
    expect(codes(['create "a.md" from-file "T.md"'], { templatesEnabled: false })).toEqual([]);
  });

  it('Fehler des Zeilen-Lesers erscheinen mit ihrer Zeile', () => {
    expect(pruefe(['wait 1', 'notify "offen']).findings).toEqual([
      { code: 'unclosedQuote', line: 6, blockLine: 2, column: 8, detail: {} },
    ]);
  });

  it('ein Befund in der letzten Zeile macht die ganze Datei ungültig (AK5)', () => {
    const r = pruefe(['wait 1', 'notify "a"', 'foo']);
    expect(r.ok).toBe(false);
    expect(r.steps).toHaveLength(2);
  });

  it('ordnet die Befunde nach Zeile und Spalte', () => {
    const f = pruefe(['foo', 'mkdir "a" "b" "c"']).findings;
    expect(f.map((x) => [x.line, x.column])).toEqual([
      [5, 1],
      [6, 11],
      [6, 15],
    ]);
  });
});

describe('Pfade an der Bereichs-Grenze (G6)', () => {
  it('weist Ausbruch und absolute Pfade ab', () => {
    const faelle = [
      ['create "../x.md"', 'parent'],
      ['create "a/../../x.md"', 'parent'],
      ['create "a/.. /x.md"', 'parent'],
      ['create "a\\..\\x.md"', 'parent'],
      ['create "/x.md"', 'absolute'],
      ['create "C:/x.md"', 'absolute'],
      ['create "C:\\x.md"', 'absolute'],
      ['create "\\\\server\\x.md"', 'absolute'],
      ['move "a.md" "../Archiv"', 'parent'],
      ['append "a.md" from-file "../geheim.md"', 'parent'],
      ['create "{{file}}/../../x.md"', 'parent'],
      ['create "/{{date}}.md"', 'absolute'],
    ];
    for (const [zeile, art] of faelle) {
      expect(
        eins(zeile).map((f) => [f.code, f.detail.kind]),
        zeile,
      ).toEqual([['pathOutsideArea', art]]);
    }
  });

  it('lässt Punkte im Namen und einen einzelnen Punkt gelten', () => {
    for (const z of [
      'create "a/./b.md"',
      'create "a..b.md"',
      'create "...md"',
      'create "{{folder}}/Neu.md"',
    ]) {
      expect(eins(z), z).toEqual([]);
    }
  });

  it('meldet einen leeren Pfad und einen ungültigen neuen Namen', () => {
    expect(eins('create ""')[0].code).toBe('pathEmpty');
    expect(eins('open "  "')[0].code).toBe('pathEmpty');
    for (const z of [
      'rename "a.md" "b/c.md"',
      'rename "a.md" "b\\c.md"',
      'rename "a.md" ".."',
      'rename "a.md" ""',
    ]) {
      expect(eins(z)[0].code, z).toBe('nameInvalid');
    }
  });
});

describe('Platzhalter (G5, O8)', () => {
  it('gilt in jedem Text-Argument und meldet Fehler der Engine', () => {
    expect(eins('notify "{{gibtsnicht}}"')[0]).toMatchObject({
      code: 'placeholderInvalid',
      detail: { engine: 'unknownPlaceholder' },
    });
    expect(eins('notify "{{date"')[0].detail.engine).toBe('unclosed');
    expect(eins('notify "{{prompt:}}"')[0].detail.engine).toBe('invalidParams');
    expect(eins('notify "{{file:x}}"')[0].detail.engine).toBe('invalidParams');
  });

  it('erlaubt den Satz der Engine samt Auswahl und den neuen Platzhaltern', () => {
    expect(
      eins(
        'notify "{{date}} {{time:+1h}} {{title}} {{folder}} {{file}} {{area}} {{prompt:A:b}} {{select:F:a,b}}"',
      ),
    ).toEqual([]);
    expect(eins('notify "Wörtlich \\{{date}}"')).toEqual([]);
  });

  it('weist die Schreibmarke ab und die Zwischenablage als Stufe 2', () => {
    expect(eins('notify "{{cursor}}"')[0]).toMatchObject({
      code: 'placeholderNotAllowed',
      detail: { placeholder: 'cursor' },
    });
    expect(eins('notify "{{clipboard}}"')[0]).toMatchObject({
      code: 'laterStage',
      detail: { placeholder: 'clipboard', stage: 2 },
    });
    expect(checkPlaceholders('{{clipboard}} {{cursor}}').problems.map((p) => p.code)).toEqual([
      'laterStage',
      'placeholderNotAllowed',
    ]);
  });
});

describe('Datei-Ebene und Laufzeit-Fragen (O1)', () => {
  it('prüft keine Zeile ohne einen eindeutigen Block', () => {
    const zwei = readWorkflowDocument(
      `---\nworkflow: true\n---\n${FENCE}workflow\nfoo\n${FENCE}\n${FENCE}workflow\nbar\n${FENCE}\n`,
    );
    expect(checkWorkflow(zwei).findings.map((f) => f.code)).toEqual([
      'multipleBlocks',
      'multipleBlocks',
    ]);
  });

  it('prüft die Zeilen auch bei einem nicht unterstützten Auslöser', () => {
    const r = checkWorkflow(dok(['foo'], 'trigger: schedule\n'));
    expect(r.findings.map((f) => f.code)).toEqual(['triggerUnsupported', 'unknownCommand']);
  });

  it('liefert für ein gewöhnliches Dokument nichts', () => {
    expect(checkWorkflow(readWorkflowDocument('# Text'))).toEqual({
      ok: false,
      steps: [],
      findings: [],
    });
  });

  it('prüft die Existenz von Abschnitt, Datei und Überschrift nicht vorab', () => {
    expect(
      codes([
        'append "Neu.md" from-section "Gibt es nicht"',
        'insert "Fehlt.md" under "Fehlt" from-file "Fehlt.md"',
      ]),
    ).toEqual([]);
  });
});
