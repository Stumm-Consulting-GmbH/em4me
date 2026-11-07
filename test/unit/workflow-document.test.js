// 4T-002347 (Epic 3E-000184): Erkennung der Workflow-Datei (G1, G7; Story 4S-001100)
// und der Rumpf eines Abschnitts für `from-section`.
//
// Bestands-Lesung: Der Bereichs-Index legt `workflow: true` und
// `workflow: "true"` gleich als `'true'` ab (`extractProperties` in
// `src/main/index/parse.js`) und entfernt ein Byte-Order-Zeichen vor dem
// Dateikopf (Zeile 236); die Erkennung folgt beidem.
import { describe, it, expect } from 'vitest';
import {
  isWorkflowFlag,
  readWorkflowDocument,
  sectionBody,
} from '../../src/shared/workflows/workflow-document.js';

const FENCE = '```';
const datei = (kopf, rumpf) => `---\n${kopf}\n---\n${rumpf}`;
const block = (inhalt) => `${FENCE}workflow\n${inhalt}\n${FENCE}\n`;

describe('Kennzeichen und Dateikopf', () => {
  it('erkennt das Kennzeichen als Wahrheitswert und als Zeichenkette', () => {
    expect(readWorkflowDocument(datei('workflow: true', block('wait 1'))).isWorkflow).toBe(true);
    expect(readWorkflowDocument(datei('workflow: "true"', block('wait 1'))).isWorkflow).toBe(true);
    expect(isWorkflowFlag(true)).toBe(true);
    expect(isWorkflowFlag('true')).toBe(true);
  });

  it('nimmt nichts anderes als Kennzeichen (AK4 der Story)', () => {
    for (const kopf of [
      'workflow: false',
      'workflow: yes',
      'workflow: 1',
      'workflow: [true]',
      'name: x',
    ]) {
      expect(readWorkflowDocument(datei(kopf, block('wait 1'))).isWorkflow, kopf).toBe(false);
    }
    expect(readWorkflowDocument(block('wait 1')).isWorkflow).toBe(false);
    expect(isWorkflowFlag('True')).toBe(false);
  });

  it('erkennt eine Datei mit kaputtem Dateikopf nicht', () => {
    expect(readWorkflowDocument('---\nworkflow: [\n---\n' + block('wait 1')).isWorkflow).toBe(
      false,
    );
  });

  it('nimmt den Namen aus dem Kopf, sonst den Dateinamen ohne Endung (AK2)', () => {
    expect(
      readWorkflowDocument(datei('workflow: true\nname: " Wochenstart "', block('')), {}).meta.name,
    ).toBe('Wochenstart');
    expect(readWorkflowDocument(datei('workflow: true\nname: 2026', block(''))).meta.name).toBe(
      '2026',
    );
    const ohne = readWorkflowDocument(datei('workflow: true', block('')), {
      fileName: 'Ordner/Tag.anlegen.md',
    });
    expect(ohne.meta.name).toBe('Tag.anlegen');
    expect(
      readWorkflowDocument(datei('workflow: true\nname: ""', block('')), {
        fileName: 'C:\\x\\A.md',
      }).meta.name,
    ).toBe('A');
  });

  it('setzt den Auslöser ohne Angabe auf manual (AK3) und liest die Beschreibung', () => {
    const r = readWorkflowDocument(datei('workflow: true\ndescription: Legt an.', block('')));
    expect(r.meta).toMatchObject({ trigger: 'manual', description: 'Legt an.' });
    expect(r.findings).toEqual([]);
  });

  // 4T-002419: `schedule` ist seit der Stufe 2 unterstützt (Story 4S-001130);
  // seine Befunde prüft der Block «Zeitplan im Dateikopf» unten.
  it('meldet jeden anderen Auslöser als noch nicht unterstützt (AK6)', () => {
    for (const [kopf, wert] of [
      ['trigger: Schedule', 'Schedule'],
      ['trigger: on', 'on'],
      ['trigger: Manual', 'Manual'],
      ['trigger: [manual]', '["manual"]'],
    ]) {
      const r = readWorkflowDocument(datei(`workflow: true\n${kopf}`, block('wait 1')));
      expect(r.findings, kopf).toEqual([
        {
          code: 'triggerUnsupported',
          line: null,
          blockLine: null,
          column: null,
          detail: { trigger: wert },
        },
      ]);
      expect(r.block, kopf).not.toBeNull();
    }
  });

  it('entfernt ein Byte-Order-Zeichen wie der Index', () => {
    expect(
      readWorkflowDocument('\uFEFF' + datei('workflow: true', block('wait 1'))).isWorkflow,
    ).toBe(true);
  });

  it('schreibt nichts: der Text bleibt unverändert (AK8)', () => {
    const text = datei('workflow: true\ntrigger: schedule', block('wait 1'));
    const kopie = String(text);
    readWorkflowDocument(text);
    expect(text).toBe(kopie);
  });
});

// 4T-002419 (Epic 3E-000366): `trigger: schedule`, `schedule` und `missed`
// (Story 4S-001130, Entscheidungen 2a und 2d). Die Zeile eines Befunds ist die
// Zeile seines Schlüssels im Dokument; Zeile 1 ist die öffnende `---`.
describe('Zeitplan im Dateikopf', () => {
  const lies = (kopf) => readWorkflowDocument(datei(`workflow: true\n${kopf}`, block('wait 1')));
  const befunde = (kopf) => lies(kopf).findings.map((f) => [f.code, f.line, f.detail]);

  it('liest trigger: schedule mit lesbarem Zeitplan ohne Befund (AK1)', () => {
    const r = lies('trigger: schedule\nschedule: every 2 weeks on monday at 08:00');
    expect(r.findings).toEqual([]);
    expect(r.meta).toMatchObject({
      trigger: 'schedule',
      schedule: { unit: 'week', interval: 2, weekdays: [0], time: '08:00' },
      scheduleText: 'every 2 weeks on monday at 08:00',
      missed: 'run-once',
    });
  });

  it('setzt missed ohne Angabe auf run-once und liest skip (AK4)', () => {
    expect(lies('trigger: schedule\nschedule: every day at 08:00').meta.missed).toBe('run-once');
    const r = lies('trigger: schedule\nschedule: every day at 08:00\nmissed: skip');
    expect(r.meta.missed).toBe('skip');
    expect(r.findings).toEqual([]);
    expect(lies('missed: run-once').findings).toEqual([]);
  });

  it('meldet jede fehlerhafte Zeitplan-Zeile mit Zeile und Grund (AK2)', () => {
    expect(befunde('trigger: schedule\nschedule: every monday')).toEqual([
      ['scheduleAtMissing', 4, { schedule: 'every monday' }],
    ]);
    expect(befunde('trigger: schedule\nschedule: every 30 minutes at 08:00')).toEqual([
      ['scheduleAtNotAllowed', 4, { schedule: 'every 30 minutes at 08:00' }],
    ]);
    expect(befunde('trigger: schedule\nname: X\nschedule: täglich')).toEqual([
      ['scheduleUnreadable', 5, { schedule: 'täglich' }],
    ]);
    expect(befunde('trigger: schedule\nschedule: 42')).toEqual([
      ['scheduleUnreadable', 4, { schedule: '42' }],
    ]);
  });

  it('meldet schedule ohne trigger: schedule an der schedule-Zeile', () => {
    expect(befunde('schedule: every day at 08:00')).toEqual([['scheduleWithoutTrigger', 3, {}]]);
    expect(befunde('trigger: manual\nschedule: every day at 08:00')).toEqual([
      ['scheduleWithoutTrigger', 4, {}],
    ]);
  });

  it('meldet trigger: schedule ohne schedule an der trigger-Zeile', () => {
    expect(befunde('name: X\ntrigger: schedule')).toEqual([['scheduleMissing', 4, {}]]);
  });

  it('meldet einen unbekannten Wert von missed an seiner Zeile', () => {
    expect(befunde('trigger: schedule\nschedule: every day at 08:00\nmissed: later')).toEqual([
      ['missedUnknown', 5, { value: 'later' }],
    ]);
    expect(befunde('missed: true')).toEqual([['missedUnknown', 3, { value: 'true' }]]);
    expect(lies('missed: later').meta.missed).toBe('run-once');
  });

  it('zählt die Zeile auch mit CRLF und Byte-Order-Zeichen', () => {
    const text = '﻿' + datei('workflow: true\ntrigger: schedule\nschedule: every day', '');
    const r = readWorkflowDocument(text.replace(/\n/g, '\r\n'));
    expect(r.findings.find((f) => f.code === 'scheduleAtMissing').line).toBe(4);
  });

  it('nimmt eine Datei mit doppelter schedule-Zeile nicht als Workflow (YAML-Leser)', () => {
    const r = lies('trigger: schedule\nschedule: every day at 08:00\nschedule: every hour');
    expect(r.isWorkflow).toBe(false);
  });
});

// 4T-002459 (Epic 3E-000367): `trigger: event` und `event` (Story 4S-001142,
// Entscheidung 3b). Die Zeile eines Befunds ist die Zeile seines Schlüssels im
// Dokument; Zeile 1 ist die öffnende `---`.
describe('Ereignis im Dateikopf', () => {
  const lies = (kopf) => readWorkflowDocument(datei(`workflow: true\n${kopf}`, block('wait 1')));
  const befunde = (kopf) => lies(kopf).findings.map((f) => [f.code, f.line, f.detail]);

  it('liest trigger: event mit lesbarer Ereignis-Zeile ohne Befund (AK1)', () => {
    const r = lies('trigger: event\nevent: file-changed in "Projekte" matching "*.md"');
    expect(r.findings).toEqual([]);
    expect(r.meta).toMatchObject({
      trigger: 'event',
      event: { event: 'file-changed', in: 'Projekte', matching: '*.md' },
      eventText: 'file-changed in "Projekte" matching "*.md"',
      schedule: null,
    });
    expect(lies('trigger: event\nevent: area-opened').meta.event).toEqual({
      event: 'area-opened',
      in: null,
      matching: null,
    });
  });

  it('liest die Zeile auch ganz in Anführungszeichen', () => {
    const r = lies(`trigger: event\nevent: 'file-created in "Eingang"'`);
    expect(r.meta.event).toEqual({ event: 'file-created', in: 'Eingang', matching: null });
  });

  it('meldet jede fehlerhafte Ereignis-Zeile mit Zeile und Grund (AK2)', () => {
    expect(befunde('trigger: event\nevent: file-deleted in "Eingang"')).toEqual([
      ['eventUnknown', 4, { event: 'file-deleted' }],
    ]);
    expect(befunde('trigger: event\nname: X\nevent: file-created in "../Fremd"')).toEqual([
      ['eventOutsideArea', 5, { path: '../Fremd', kind: 'parent' }],
    ]);
    expect(befunde('trigger: event\nevent: file-created in Eingang')).toEqual([
      ['eventUnreadable', 4, { event: 'file-created in Eingang' }],
    ]);
    expect(befunde('trigger: event\nevent: 42')).toEqual([['eventUnreadable', 4, { event: '42' }]]);
    expect(befunde('trigger: event\nevent: file-changed matching "A/*.md"')).toEqual([
      ['eventPatternInvalid', 4, { pattern: 'A/*.md' }],
    ]);
    expect(befunde('trigger: event\nevent: area-opened in "Eingang"')).toEqual([
      ['eventFilterNotAllowed', 4, { event: 'area-opened' }],
    ]);
    expect(lies('trigger: event\nevent: file-deleted').meta.event).toBeNull();
  });

  it('meldet event ohne trigger: event an der event-Zeile', () => {
    expect(befunde('event: file-created')).toEqual([['eventWithoutTrigger', 3, {}]]);
    expect(befunde('trigger: schedule\nschedule: every day at 08:00\nevent: area-opened')).toEqual([
      ['eventWithoutTrigger', 5, {}],
    ]);
    expect(lies('event: file-created').meta.event).toBeNull();
  });

  it('meldet trigger: event ohne event an der trigger-Zeile', () => {
    expect(befunde('name: X\ntrigger: event')).toEqual([['eventMissing', 4, {}]]);
  });

  it('meldet eine zweite event-Zeile an ihrer Zeile, statt die Datei zu verwerfen', () => {
    const r = lies('trigger: event\nevent: file-created\nname: X\nevent: file-changed');
    expect(r.isWorkflow).toBe(true);
    expect(r.meta).toMatchObject({ name: 'X', trigger: 'event', event: null });
    expect(r.findings.map((f) => [f.code, f.line])).toEqual([['eventDuplicate', 6]]);
    expect(r.block).not.toBeNull();
  });

  it('meldet eine Liste von Ereignissen als mehr als eine event-Zeile', () => {
    expect(befunde('trigger: event\nevent: [file-created, file-changed]')).toEqual([
      ['eventDuplicate', 4, {}],
    ]);
    expect(befunde('trigger: event\nevent:\n  - file-created\n  - file-changed')).toEqual([
      ['eventDuplicate', 4, {}],
    ]);
  });

  it('bleibt bei jedem anderen kaputten Dateikopf ohne Workflow', () => {
    expect(lies('trigger: event\nevent: a\nevent: b\nname: X\nname: Y').isWorkflow).toBe(false);
    expect(lies('event: a\nevent: b\nworkflow: false').isWorkflow).toBe(false);
  });

  it('zählt die Zeile auch mit CRLF und Byte-Order-Zeichen', () => {
    const text = '﻿' + datei('workflow: true\ntrigger: event\nevent: a\nevent: b', '');
    const r = readWorkflowDocument(text.replace(/\n/g, '\r\n'));
    expect(r.findings.find((f) => f.code === 'eventDuplicate').line).toBe(5);
  });
});

describe('Der Block (G1)', () => {
  it('findet genau einen Block mit Lage im Dokument, auch mit CRLF', () => {
    const text = datei('workflow: true', '# Titel\n\n' + block('wait 1\nnotify "x"')).replace(
      /\n/g,
      '\r\n',
    );
    const r = readWorkflowDocument(text);
    expect(r.block).toEqual({
      line: 6,
      contentLine: 7,
      endLine: 9,
      lines: ['wait 1', 'notify "x"'],
    });
    expect(r.blockLines).toEqual([6]);
  });

  it('meldet zwei Blöcke an jedem Block und gibt keinen frei (AK5)', () => {
    const r = readWorkflowDocument(
      datei('workflow: true', block('wait 1') + '\n' + block('wait 2')),
    );
    expect(r.block).toBeNull();
    expect(r.findings.map((f) => [f.code, f.line, f.detail.count])).toEqual([
      ['multipleBlocks', 4, 2],
      ['multipleBlocks', 8, 2],
    ]);
  });

  it('meldet eine gekennzeichnete Datei ohne Block', () => {
    const r = readWorkflowDocument(datei('workflow: true', 'Nur Text.\n'));
    expect(r.findings.map((f) => f.code)).toEqual(['noBlock']);
  });

  it('zählt einen Beispiel-Block in einem äußeren Zaun nicht', () => {
    const beispiel = '````markdown\n' + block('wait 9') + '````\n';
    const r = readWorkflowDocument(datei('workflow: true', beispiel + block('wait 1')));
    expect(r.blockLines).toEqual([9]);
    expect(r.block.lines).toEqual(['wait 1']);
  });

  it('nimmt Tilden-Zäune und lässt einen offenen Block bis zum Ende reichen', () => {
    const tilde = readWorkflowDocument(datei('workflow: true', '~~~workflow\nwait 1\n~~~\n'));
    expect(tilde.block.lines).toEqual(['wait 1']);
    const offen = readWorkflowDocument(datei('workflow: true', `${FENCE}workflow\nwait 1\nwait 2`));
    expect(offen.block).toMatchObject({ line: 4, lines: ['wait 1', 'wait 2'], endLine: 6 });
  });

  it('nimmt nur die Sprache workflow in Kleinschreibung, mit Info-Zusatz', () => {
    expect(
      readWorkflowDocument(datei('workflow: true', `${FENCE}Workflow\nwait 1\n${FENCE}\n`)).block,
    ).toBeNull();
    expect(
      readWorkflowDocument(datei('workflow: true', `${FENCE}workflow extra\nwait 1\n${FENCE}\n`))
        .block,
    ).not.toBeNull();
  });

  it('nimmt einen Block nur aus Kommentaren als gültig', () => {
    const r = readWorkflowDocument(datei('workflow: true', block('# Schritt 1\n# Schritt 2')));
    expect(r.findings).toEqual([]);
    expect(r.block.lines).toHaveLength(2);
  });
});

describe('sectionBody — from-section zur Laufzeit (O1 bis O3)', () => {
  const doc = datei(
    'workflow: true',
    [
      block('append "x.md" from-section "Eintrag"'),
      '## Eintrag',
      '',
      '- {{date}} bleibt wörtlich',
      '### Unterpunkt',
      'gehört dazu',
      '',
      '## Nächster',
      'nicht dabei',
      '```',
      '## Eintrag im Code',
      '```',
    ].join('\n'),
  );

  it('liefert den Rumpf ohne Überschrift und ohne Rand-Leerzeilen, wörtlich', () => {
    expect(sectionBody(doc, 'Eintrag')).toEqual({
      ok: true,
      text: '- {{date}} bleibt wörtlich\n### Unterpunkt\ngehört dazu',
    });
  });

  it('findet über die Kennung wie bei [[Datei#Überschrift]]', () => {
    expect(sectionBody(doc, 'eintrag').ok).toBe(true);
    expect(sectionBody(doc, 'Nächster')).toEqual({
      ok: true,
      text: 'nicht dabei\n```\n## Eintrag im Code\n```',
    });
  });

  it('meldet einen fehlenden und einen doppelten Abschnitt', () => {
    expect(sectionBody(doc, 'Gibt es nicht')).toEqual({ ok: false, code: 'sectionUnknown' });
    expect(sectionBody(doc, 'Eintrag im Code')).toEqual({ ok: false, code: 'sectionUnknown' });
    expect(sectionBody('## A\n1\n## A\n2', 'A')).toEqual({ ok: false, code: 'sectionAmbiguous' });
  });

  it('übergeht den Dateikopf und liefert einen leeren Rumpf', () => {
    expect(sectionBody('---\n# kein: abschnitt\n---\n## Leer\n\n## B', 'Leer')).toEqual({
      ok: true,
      text: '',
    });
    expect(sectionBody('---\n# kein: abschnitt\n---\n', 'kein: abschnitt').code).toBe(
      'sectionUnknown',
    );
  });
});
