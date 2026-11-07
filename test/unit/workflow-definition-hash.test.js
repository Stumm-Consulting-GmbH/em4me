// 4T-002420 (Epic 3E-000366, Story 4S-001131): Die Prüfsumme der Definition
// eines Workflows (src/main/workflows/workflow-definition-hash.js), Schutz der
// Scharf-Schaltung gegen eine geänderte Definition (Entscheidung 2e).
//
// Bestands-Lesungen: Block und Kennzeichen über `readWorkflowDocument`
// (src/shared/workflows/workflow-document.js), Dateikopf über
// `extractFrontmatter` (src/shared/markdown/frontmatter.js); zur Definition
// gehören nach der Ausführungs-Entscheidung im Epic der Befehls-Block und die
// Zeitplan-Felder `trigger`, `schedule` und `missed`.
//
// 4T-002463 (Epic 3E-000367, Story 4S-001146): dazu die Ereignis-Zeile `event`,
// nur wenn sie im Dateikopf steht (Block am Ende).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFINITION_EREIGNIS_FELD,
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

describe('Ereignis-Zeile (4T-002463)', () => {
  const EREIGNIS_KOPF = (zeile = 'event: file-created in "Eingang"') => [
    'name: Eingang',
    'description: Sortiert neue Dateien',
    'trigger: event',
    zeile,
  ];
  const EREIGNIS = definitionsPruefsumme(datei({ kopf: EREIGNIS_KOPF() }));

  it('ohne Zeile event bleibt die Prüfsumme eines Zeitplan-Workflows unverändert', () => {
    // Die kanonische Form der Stufe 2 hat genau drei Kopf-Felder; ein vor der
    // Stufe 3 scharf geschalteter Workflow bleibt scharf.
    expect(JSON.parse(definitionsKanon(datei())).kopf.map(([feld]) => feld)).toEqual([
      'trigger',
      'schedule',
      'missed',
    ]);
  });

  it('nimmt die Zeile event mit ihrem Wert auf, wenn sie steht', () => {
    expect(DEFINITION_EREIGNIS_FELD).toBe('event');
    expect(JSON.parse(definitionsKanon(datei({ kopf: EREIGNIS_KOPF() }))).kopf).toEqual([
      ['trigger', 'event'],
      ['schedule', null],
      ['missed', null],
      ['event', 'file-created in "Eingang"'],
    ]);
  });

  it.each([
    ['geänderter Ordner', 'event: file-created in "Ablage"'],
    ['geändertes Ereignis', 'event: file-changed in "Eingang"'],
    ['zusätzliches Muster', 'event: file-created in "Eingang" matching "*.md"'],
  ])('anders bei %s (AK2)', (_name, zeile) => {
    expect(definitionsPruefsumme(datei({ kopf: EREIGNIS_KOPF(zeile) }))).not.toBe(EREIGNIS);
  });

  it('anders, wenn die Zeile event wegfällt', () => {
    const ohne = EREIGNIS_KOPF().slice(0, 3);
    expect(definitionsPruefsumme(datei({ kopf: ohne }))).not.toBe(EREIGNIS);
  });

  it('gleich bei geändertem Namen und Leerraum am Rand der Zeile', () => {
    const kopf = EREIGNIS_KOPF('event:   file-created in "Eingang"  ');
    kopf[0] = 'name: Anders';
    expect(definitionsPruefsumme(datei({ kopf }))).toBe(EREIGNIS);
  });
});

describe('Referenzierte Skript-Abschnitte (Nachbesserung 4T-002465)', () => {
  const ZAUN = '```';
  const abschnitt = (titel, zeilen) => [
    `## ${titel}`,
    '',
    `${ZAUN}perspective-script`,
    ...zeilen,
    ZAUN,
    '',
  ];
  const mitSkript = ({
    zeilen = ['script "Zählen" as "offen"', 'notify "Offen: {{script:offen}}"'],
    zaehlen = ['return 2;'],
    pruefen = ['return true;'],
    sonst = ['Freier Text.'],
  } = {}) =>
    [
      datei({ zeilen, text: 'Beschreibung für Menschen.' }),
      ...abschnitt('Zählen', zaehlen),
      ...abschnitt('Prüfen', pruefen),
      '## Notizen',
      '',
      ...sonst,
      '',
    ].join('\n');
  const SKRIPT = definitionsPruefsumme(mitSkript());

  it('Rückwärts-Verträglichkeit: ohne Skript-Schritt dieselbe Prüfsumme wie vor der Nachbesserung', () => {
    // Festgehaltene Werte des Standes vor der Nachbesserung (HEAD 94fdb94ea):
    // scharfe Zeitplan- und Ereignis-Workflows ohne Skript bleiben scharf.
    expect(BASIS).toBe('35ccd64525d4f60e4a1608240073e664fc4d0620b999b9ac3149e2c51a5a5712');
    expect(
      definitionsPruefsumme(
        datei({
          kopf: [
            'name: Eingang',
            'description: Sortiert neue Dateien',
            'trigger: event',
            'event: file-created in "Eingang"',
          ],
        }),
      ),
    ).toBe('081be1c5ae3fb50797c2df97f91144dee16430764e0c7746bdd66e071997d840');
    expect(Object.keys(JSON.parse(definitionsKanon(datei())))).toEqual(['kopf', 'block']);
  });

  it('Skript-Abschnitte ohne referenzierenden Schritt ändern die Prüfsumme nicht', () => {
    const ohneSchritt = ['mkdir "Protokolle"', 'create "Protokolle/Heute.md"'];
    expect(definitionsPruefsumme(mitSkript({ zeilen: ohneSchritt }))).toBe(BASIS);
  });

  it('nimmt je Schritt den Abschnitts-Namen und den Quelltext auf', () => {
    const zeilen = ['script "Zählen" as "offen"', 'if-script "Prüfen"', 'notify "ja"', 'end'];
    expect(JSON.parse(definitionsKanon(mitSkript({ zeilen }))).skripte).toEqual([
      ['Zählen', ['return 2;']],
      ['Prüfen', ['return true;']],
    ]);
  });

  it.each([
    ['script', {}, { zaehlen: ['return 3;'] }],
    ['script, zusätzliche Zeile', {}, { zaehlen: ['// neu', 'return 2;'] }],
    [
      'if-script',
      { zeilen: ['if-script "Prüfen"', 'notify "ja"', 'end'] },
      { pruefen: ['return false;'] },
    ],
  ])('anders bei geändertem referenziertem Abschnitt (%s)', (_name, basis, aenderung) => {
    const vorher = definitionsPruefsumme(mitSkript(basis));
    expect(definitionsPruefsumme(mitSkript({ ...basis, ...aenderung }))).not.toBe(vorher);
  });

  it('gleich bei Änderungen in anderen Abschnitten und bei Leerraum am Zeilenende', () => {
    expect(definitionsPruefsumme(mitSkript({ sonst: ['Ganz anderer Text.'] }))).toBe(SKRIPT);
    // «Prüfen» ist hier nicht referenziert.
    expect(definitionsPruefsumme(mitSkript({ pruefen: ['return false;'] }))).toBe(SKRIPT);
    expect(definitionsPruefsumme(mitSkript({ zaehlen: ['return 2;   '] }))).toBe(SKRIPT);
    expect(definitionsPruefsumme(mitSkript().replace(/\n/g, '\r\n'))).toBe(SKRIPT);
  });

  it('anders, wenn der referenzierte Abschnitt wegfällt oder doppelt steht', () => {
    const ohne = mitSkript().replace(/## Zählen[\s\S]*?## Prüfen/, '## Prüfen');
    expect(JSON.parse(definitionsKanon(ohne)).skripte).toEqual([['Zählen', 'sectionUnknown']]);
    expect(definitionsPruefsumme(ohne)).not.toBe(SKRIPT);
    const doppelt = `${mitSkript()}\n${abschnitt('Zählen', ['return 2;']).join('\n')}`;
    expect(definitionsPruefsumme(doppelt)).not.toBe(SKRIPT);
  });
});
