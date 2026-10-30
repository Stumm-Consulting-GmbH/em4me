// 4T-002420 (Epic 3E-000366, Story 4S-001131): Die Prüfsumme der Definition
// eines Workflows (src/main/workflows/workflow-definition-hash.js), Schutz der
// Scharf-Schaltung gegen eine geänderte Definition (Entscheidung 2e).
//
// Bestands-Lesungen: Block und Kennzeichen über `readWorkflowDocument`
// (src/shared/workflows/workflow-document.js), Dateikopf über
// `extractFrontmatter` (src/shared/markdown/frontmatter.js); zur Definition
// gehören nach der Ausführungs-Entscheidung im Epic der Befehls-Block und die
// Zeitplan-Felder `trigger`, `schedule` und `missed`.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFINITION_KOPF_FELDER,
  definitionsKanon,
  definitionsPruefsumme,
} = require('../../src/main/workflows/workflow-definition-hash.js');

const datei = ({
  kopf = [
    'name: Täglich',
    'description: Legt das Protokoll an',
    'trigger: schedule',
    'schedule: every day at 08:00',
  ],
  text = 'Beschreibung für Menschen.',
  zeilen = ['mkdir "Protokolle"', 'create "Protokolle/Heute.md"'],
} = {}) =>
  ['---', 'workflow: true', ...kopf, '---', '', text, '', '```workflow', ...zeilen, '```', ''].join(
    '\n',
  );

const BASIS = definitionsPruefsumme(datei());

describe('definitionsPruefsumme', () => {
  it('ist ein SHA-256 hexadezimal und stabil', () => {
    expect(BASIS).toMatch(/^[0-9a-f]{64}$/);
    expect(definitionsPruefsumme(datei())).toBe(BASIS);
  });

  it.each([
    [
      'Name',
      {
        kopf: [
          'name: Morgens',
          'description: Legt das Protokoll an',
          'trigger: schedule',
          'schedule: every day at 08:00',
        ],
      },
    ],
    [
      'Beschreibung',
      {
        kopf: [
          'name: Täglich',
          'description: Ganz anders',
          'trigger: schedule',
          'schedule: every day at 08:00',
        ],
      },
    ],
    ['Beschreibungs-Text', { text: 'Ein anderer Absatz.\n\n## Abschnitt\n\nMehr Text.' }],
  ])('gleich bei geändertem %s', (_name, aenderung) => {
    expect(definitionsPruefsumme(datei(aenderung))).toBe(BASIS);
  });

  it('gleich bei Windows-Zeilenenden, Leerraum am Zeilenende und Byte-Order-Zeichen', () => {
    expect(definitionsPruefsumme(datei().replace(/\n/g, '\r\n'))).toBe(BASIS);
    expect(
      definitionsPruefsumme(
        datei({ zeilen: ['mkdir "Protokolle"  ', 'create "Protokolle/Heute.md"\t'] }),
      ),
    ).toBe(BASIS);
    expect(definitionsPruefsumme(`\uFEFF${datei()}`)).toBe(BASIS);
  });

  it.each([
    ['eine Befehls-Zeile', { zeilen: ['mkdir "Protokolle"', 'create "Protokolle/Morgen.md"'] }],
    [
      'eine zusätzliche Kommentar-Zeile',
      { zeilen: ['# neu', 'mkdir "Protokolle"', 'create "Protokolle/Heute.md"'] },
    ],
    [
      'die Reihenfolge der Zeilen',
      { zeilen: ['create "Protokolle/Heute.md"', 'mkdir "Protokolle"'] },
    ],
    [
      'schedule',
      {
        kopf: [
          'name: Täglich',
          'description: Legt das Protokoll an',
          'trigger: schedule',
          'schedule: every day at 09:00',
        ],
      },
    ],
    [
      'trigger',
      {
        kopf: [
          'name: Täglich',
          'description: Legt das Protokoll an',
          'trigger: manual',
          'schedule: every day at 08:00',
        ],
      },
    ],
    [
      'missed',
      {
        kopf: [
          'name: Täglich',
          'description: Legt das Protokoll an',
          'trigger: schedule',
          'schedule: every day at 08:00',
          'missed: skip',
        ],
      },
    ],
  ])('anders bei geänderter Definition: %s', (_name, aenderung) => {
    expect(definitionsPruefsumme(datei(aenderung))).not.toBe(BASIS);
  });

  it('null ohne Kennzeichen, ohne Block und bei zwei Blöcken', () => {
    expect(definitionsPruefsumme(datei().replace('workflow: true', 'workflow: false'))).toBe(null);
    expect(definitionsPruefsumme(datei().replace(/```workflow[\s\S]*```\n/, ''))).toBe(null);
    expect(definitionsPruefsumme(`${datei()}\n\`\`\`workflow\nmkdir "B"\n\`\`\`\n`)).toBe(null);
    expect(definitionsPruefsumme('')).toBe(null);
    expect(definitionsPruefsumme(null)).toBe(null);
  });
});

describe('definitionsKanon', () => {
  it('nimmt genau die Zeitplan-Felder des Dateikopfs und die Block-Zeilen', () => {
    expect(DEFINITION_KOPF_FELDER).toEqual(['trigger', 'schedule', 'missed']);
    expect(JSON.parse(definitionsKanon(datei()))).toEqual({
      kopf: [
        ['trigger', 'schedule'],
        ['schedule', 'every day at 08:00'],
        ['missed', null],
      ],
      block: ['mkdir "Protokolle"', 'create "Protokolle/Heute.md"'],
    });
  });
});
