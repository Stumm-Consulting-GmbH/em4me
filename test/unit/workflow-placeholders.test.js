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
  PROBE_ITEM,
  fillLoopStep,
  loopItemContext,
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

// 4T-002424 (Story 4S-001136): `{{clipboard}}` im Platzhalter-Satz der Workflows.
describe('{{clipboard}} (4S-001136)', () => {
  it('füllt Argumente und eingesetzte Vorlagen mit dem Text der Zwischenablage', () => {
    const kopiert = 'Zeile 1\nÄrger mit "Anführungszeichen" und {{date}}';
    const s = schritte([
      'replace "a.md" "HIER" "{{clipboard}}"',
      'create "{{clipboard}}.md"',
      'create "b.md" from-template "Tag.md"',
    ]);
    const r = prepareRun(
      s,
      { ...KONTEXT, clipboard: kopiert },
      {},
      { 'Tag.md': '# {{clipboard}}' },
    );
    expect(r.findings).toEqual([]);
    expect(r.steps[0].args[2]).toBe(kopiert);
    expect(r.steps[1].args[0]).toBe(`${kopiert}.md`);
    // Der eingesetzte Text wird nicht erneut als Vorlage gelesen.
    expect(r.steps[2].source.text).toBe(`# ${kopiert}`);
  });

  it('eine leere oder fehlende Zwischenablage ergibt leeren Text, keinen Befund', () => {
    const s = schritte(['notify "[{{clipboard}}]"']);
    expect(prepareRun(s, { ...KONTEXT, clipboard: '' }, {}, {}).steps[0].args).toEqual(['[]']);
    expect(prepareRun(s, KONTEXT, {}, {}).steps[0].args).toEqual(['[]']);
  });

  it('from-section und from-file bleiben wörtlich; nur der Name des Abschnitts wird gefüllt', () => {
    const s = schritte([
      'append "a.md" from-section "{{clipboard}}"',
      'append "a.md" from-file "q.md"',
    ]);
    const r = prepareRun(s, { ...KONTEXT, clipboard: 'Teil' }, {}, {});
    expect(r.steps[0].source).toEqual({ kind: 'section', name: 'Teil' });
    expect(r.steps[1].source).toEqual({ kind: 'file', path: 'q.md' });
  });
});

// 4T-002459 (Epic 3E-000367): die Platzhalter eines Ereignis-Laufs (3l). Den
// Kontext mit `file`, `from` und `task` gibt der Ereignis-Lauf mit (4T-002460).
describe('{{from}} und {{task}} (4S-001142)', () => {
  it('füllt alten Pfad und Aufgaben-Text aus dem Kontext, auch in einer Vorlage', () => {
    const s = schritte([
      'notify "{{from}} -> {{file}}"',
      'append "Journal.md" from-template "Eintrag.md"',
    ]);
    const kontext = { ...KONTEXT, file: 'Archiv/A.md', from: 'Eingang/A.md', task: 'Rückblick' };
    const r = prepareRun(s, kontext, {}, { 'Eintrag.md': '- erledigt: {{task}}' });
    expect(r.findings).toEqual([]);
    expect(r.steps[0].args).toEqual(['Eingang/A.md -> Archiv/A.md']);
    expect(r.steps[1].source.text).toBe('- erledigt: Rückblick');
  });

  it('bleibt ohne Wert leer, etwa bei einem Start von Hand', () => {
    const s = schritte(['notify "[{{from}}][{{task}}]"']);
    expect(prepareRun(s, KONTEXT, {}, {}).steps[0].args).toEqual(['[][]']);
  });
});

// 4T-002464 (Story 4S-001148, Entscheidung 3g): die Platzhalter der Schleife.
describe('{{item}} und {{item:name}} in der Schleife (4S-001148)', () => {
  it('belegt Pfad und Namen ohne Endung', () => {
    expect(loopItemContext('Eingang/Rechnung 12.md')).toEqual({
      item: 'Eingang/Rechnung 12.md',
      'item:name': 'Rechnung 12',
    });
    expect(loopItemContext('a\\b\\c.tar.gz')).toEqual({
      item: 'a/b/c.tar.gz',
      'item:name': 'c.tar',
    });
    expect(loopItemContext('Ordner/.hidden')['item:name']).toBe('.hidden');
  });

  it('füllt Schritte ohne {{item}} vorab, die mit {{item}} je Datei', () => {
    const s = schritte([
      'for-each "{{folder}}/*.md"',
      '  notify "{{date}}"',
      '  move "{{item}}" "Archiv/{{item:name}}"',
      'end',
    ]);
    const r = prepareRun(s, KONTEXT, {}, {});
    expect(r.findings).toEqual([]);
    expect(r.steps.map((x) => x.keyword)).toEqual(['for-each', 'notify', 'move', 'end']);
    expect(r.steps[0].args).toEqual(['Notizen/*.md']);
    expect(r.steps[1].args).toEqual(['2026-10-22']);
    expect(r.steps[1].deferred).toBeUndefined();
    expect(r.steps[2]).toMatchObject({ keyword: 'move', args: [], line: 7 });
    expect(r.steps[2].deferred.step.keyword).toBe('move');
    // Übertragbar wie alles, was an den Hauptprozess geht.
    expect(JSON.parse(JSON.stringify(r.steps))).toEqual(r.steps);
    const gefuellt = fillLoopStep(r.steps[2], 'Notizen/Rechnung.md');
    expect(gefuellt).toEqual({
      ok: true,
      findings: [],
      step: {
        line: 7,
        blockLine: 3,
        keyword: 'move',
        args: ['Notizen/Rechnung.md', 'Archiv/Rechnung'],
        source: null,
        position: null,
      },
    });
  });

  it('erhebt eine Eingabe in der Schleife einmal und nutzt sie je Datei', () => {
    const s = schritte(['for-each "E/*.md"', 'add-tag "{{item}}" "{{prompt:Schlagwort?}}"', 'end']);
    expect(workflowInputs(s).map((i) => i.key)).toEqual([P('Schlagwort?')]);
    const r = prepareRun(s, KONTEXT, { [P('Schlagwort?')]: 'neu' }, {});
    expect(fillLoopStep(r.steps[1], 'E/a.md').step.args).toEqual(['E/a.md', 'neu']);
    expect(fillLoopStep(r.steps[1], 'E/b.md').step.args).toEqual(['E/b.md', 'neu']);
  });

  it('füllt eine Vorlage je Datei mit {{item}} und dem Ziel der Datei', () => {
    const s = schritte([
      'for-each "E/*.md"',
      'create "Notiz/{{item:name}}.md" from-template "V.md"',
      'end',
    ]);
    const r = prepareRun(s, KONTEXT, {}, { 'V.md': 'Quelle {{item}}, Titel {{title}}' });
    expect(r.findings).toEqual([]);
    expect(r.steps[1].deferred.templates).toEqual({ 'V.md': 'Quelle {{item}}, Titel {{title}}' });
    expect(fillLoopStep(r.steps[1], 'E/Brief.md').step.source).toEqual({
      kind: 'template',
      path: 'V.md',
      text: 'Quelle E/Brief.md, Titel Brief',
    });
  });

  it('prüft die übrigen Teile eines Schritts in der Schleife vorab mit einem Ersatz-Pfad', () => {
    expect(PROBE_ITEM).toBe('x.md');
    const s = schritte(['for-each "E/*.md"', 'rename "{{item}}" "{{prompt:Name?}}"', 'end']);
    const r = prepareRun(s, KONTEXT, { [P('Name?')]: 'a/b' }, {});
    expect(r.ok).toBe(false);
    expect(r.findings.map((x) => [x.code, x.line])).toEqual([['nameInvalid', 6]]);
  });

  it('prüft das Muster der Schleife nach dem Füllen erneut', () => {
    const s = schritte(['for-each "{{prompt:Ordner?}}/*.md"', 'end']);
    const r = prepareRun(s, KONTEXT, { [P('Ordner?')]: 'a*' }, {});
    expect(r.findings.map((x) => x.code)).toEqual(['loopPatternInvalid']);
    const draussen = prepareRun(s, KONTEXT, { [P('Ordner?')]: '..' }, {});
    expect(draussen.findings.map((x) => x.code)).toEqual(['pathOutsideArea']);
  });

  it('meldet einen Schritt ohne zurückgestellten Inhalt als unerwartet', () => {
    expect(fillLoopStep({ line: 3, blockLine: 1 }, 'a.md')).toMatchObject({
      ok: false,
      step: null,
      findings: [{ code: 'unexpected', line: 3 }],
    });
  });
});

// 4T-002547 (Da, Dc, Dd): Datenbank-Werte stehen erst im Lauf fest. Ein Schritt,
// der sie trägt, wird zur Probe gefüllt und zurückgestellt; der Ablauf-Kern füllt
// ihn mit den gelesenen Werten (`fillLoopStep`, vierter Parameter).
describe('Datenbank-Werte im Platzhalter-Satz (4T-002547, AK4, AK5)', () => {
  // Eine Rückfrage, die jede Tabelle als unbekannt meldet: Die Probe darf sie
  // für einen Wert aus dem Lauf nicht fragen.
  const STRENG = { dbTable: () => ({ state: 'unknown' }), dbQuery: () => ({ state: 'missing' }) };

  it('stellt Schritte mit {{created:…}}, {{db:…}} und {{record:…}} zurück und füllt sie mit den Werten', () => {
    const s = schritte([
      'db-create "T" a="1" as "neu"',
      'notify "{{created:neu}} {{db:T:Solaris:pages}}"',
      'db-for-each "Q.md"',
      '  db-update "{{record:table}}" "{{record:id}}" a="{{record:A}}"',
      'end',
    ]);
    const r = prepareRun(s, KONTEXT, {}, {}, STRENG);
    expect(r.findings).toEqual([]);
    expect(r.steps.map((x) => !!x.deferred)).toEqual([false, true, false, true, false]);
    const notify = fillLoopStep(
      r.steps[1],
      null,
      {},
      {
        'created:neu': 'r-00004',
        'db:T:Solaris:pages': '224',
      },
    );
    expect(notify.step.args).toEqual(['r-00004 224']);
    const update = fillLoopStep(
      r.steps[3],
      null,
      {},
      {
        'record:table': 'Library',
        'record:id': 'r-00002',
        'record:A': '7',
      },
    );
    expect(update.step).toMatchObject({
      args: ['Library', 'r-00002'],
      pairs: [{ key: 'a', value: '7' }],
    });
  });

  it('ohne gelieferten Wert bleibt der Platzhalter als Text stehen, nie leer', () => {
    const s = schritte(['db-create "T" a="1" as "neu"', 'notify "{{created:neu}}"']);
    const r = prepareRun(s, KONTEXT, {}, {});
    expect(fillLoopStep(r.steps[1], null, {}).step.args).toEqual(['{{created:neu}}']);
  });

  // Review-Runde 1 zu 3E-000368: Eine Vorlage liest nie Datenbank-Inhalte, auch
  // wenn derselbe Platzhalter in der Befehls-Zeile einen Wert des Laufs trägt.
  it('eine Vorlage hinter from-template bekommt keinen Wert von record, db und created', () => {
    const vorlage =
      'Titel {{record:title}}, Kennung {{created:neu}}, Seiten {{db:T:Solaris:pages}}';
    const s = schritte([
      'db-create "T" a="1" as "neu"',
      'db-for-each "Q.md"',
      '  create "Notizen/{{record:title}}.md" from-template "Vorlage.md"',
      'end',
      'create "Neu/{{created:neu}}-{{db:T:Solaris:pages}}.md" from-template "Vorlage.md"',
    ]);
    const r = prepareRun(s, KONTEXT, {}, { 'Vorlage.md': vorlage });
    expect(r.findings).toEqual([]);
    const werte = {
      'record:title': 'Solaris',
      'created:neu': 'r-00004',
      'db:T:Solaris:pages': '224',
    };
    const inSchleife = fillLoopStep(r.steps[2], null, {}, werte);
    expect(inSchleife.step.args).toEqual(['Notizen/Solaris.md']);
    expect(inSchleife.step.source).toEqual({ kind: 'template', path: 'Vorlage.md', text: vorlage });
    const danach = fillLoopStep(r.steps[4], null, {}, werte);
    expect(danach.step.args).toEqual(['Neu/r-00004-224.md']);
    expect(danach.step.source.text).toBe(vorlage);
  });
});
