// 4T-002544 (Epic 3E-000368): Schemata und Prüf-Befunde der Datenbank-Befehle
// (src/shared/workflows/workflow-check-db.js, workflow-db-lookup.js, die
// Paare und Schleifen in workflow-check.js, das Füllen in
// workflow-placeholders.js).
//
// Bestands-Lesung: Die Beispiel-Zeilen sind die des Entscheidungs-Pakets der
// Konzept-Runde 4T-002543 (Da, Db, Dc, Dd, Dg); jede muss mit der Attrappe der
// Rückfrage gelten (AK1). Jeder Befund aus Punkt 3 des Lösungsansatzes
// erscheint mit Zeile und Grund und verhindert den Lauf (AK2), ein unbekanntes
// Feld in Paar, `{{record:…}}` und `{{db:…}}` ist «Feld unbekannt» (AK3), und
// bei ausgeschalteter Datenbank trägt jeder Datenbank-Befehl den Befund (AK4).
import { describe, it, expect } from 'vitest';
import { checkWorkflow } from '../../src/shared/workflows/workflow-check.js';
import { readWorkflowDocument } from '../../src/shared/workflows/workflow-document.js';
import { createDbLookup, tableHasField } from '../../src/shared/workflows/workflow-db-lookup.js';
import { prepareRun } from '../../src/shared/workflows/workflow-placeholders.js';
import { analyzeTemplate } from '../../src/shared/template-engine.js';

const FENCE = '```';
// Dateikopf (drei Zeilen) und Zaun: die erste Block-Zeile ist Zeile 5.
const ERSTE_ZEILE = 5;
const dok = (zeilen, kopf = '') =>
  readWorkflowDocument(
    `---\nworkflow: true\n${kopf}---\n${FENCE}workflow\n${zeilen.join('\n')}\n${FENCE}\n`,
  );

// Die Attrappe der Rückfrage: Tabellen mit Feldern, zwei gleichnamige Tabellen
// «Kontakte» und die Abfrage-Dateien des Beispiels.
const AUSKUNFT = {
  tables: [
    { name: 'Rechnungen', path: 'Daten/Rechnungen.md', fields: ['nummer', 'betrag', 'status'] },
    { name: 'Einstellungen', path: 'Einstellungen.md', fields: ['frist'] },
    { name: 'Kontakte', path: 'A/Kontakte.md', fields: ['name'] },
    { name: 'Kontakte', path: 'B/Kontakte.md', fields: ['name'] },
  ],
  queries: [
    { path: 'Abfragen/Offene Posten.md', state: 'ok', records: false, grouped: false, table: null },
    {
      path: 'Abfragen/Überfällige Rechnungen.md',
      state: 'ok',
      records: true,
      grouped: false,
      table: 'Rechnungen',
    },
    { path: 'Abfragen/Gruppiert.md', state: 'ok', records: true, grouped: true, table: null },
    { path: 'Abfragen/Kaputt.md', state: 'invalid' },
    {
      path: 'Listen/Offene Posten.md',
      state: 'ok',
      records: true,
      grouped: false,
      table: 'Rechnungen',
    },
  ],
};
const MIT = { ...createDbLookup(AUSKUNFT), databaseEnabled: true };
const pruefe = (zeilen, optionen = MIT, kopf = '') => checkWorkflow(dok(zeilen, kopf), optionen);
const codes = (zeilen, optionen) => pruefe(zeilen, optionen).findings.map((f) => f.code);
const befunde = (zeilen, optionen) =>
  pruefe(zeilen, optionen).findings.map((f) => [f.code, f.blockLine, f.detail]);

// Die Beispiele des Entscheidungs-Pakets 4T-002543, je als vollständige Datei.
const BEISPIELE_DA = [
  'db-create "Rechnungen" nummer="R-2026-117" betrag="420.00" status="offen"',
  'db-update "Rechnungen" "R-2026-117" status="bezahlt"',
  'db-delete "Rechnungen" "r-00042"',
  'db-create "Rechnungen" nummer="R-2026-118" as "neu"',
];
const BEISPIELE_DB = [
  'db-query "Abfragen/Offene Posten.md" into "Wochen-Übersicht.md" under "Offene Posten"',
  'db-query "Abfragen/Offene Posten.md" into "Berichte/{{date}}.md"',
];
const BEISPIEL_DC = [
  'db-for-each "Abfragen/Überfällige Rechnungen.md"',
  '  db-update "{{record:table}}" "{{record:id}}" status="gemahnt"',
  '  notify "{{record:nummer}} in {{record:file}}"',
  '  if-property "{{record:file}}" status',
  '  end',
  'end',
];
const BEISPIEL_DD = ['notify "Frist: {{db:Einstellungen:Mahnung:frist}} Tage"'];
const BEISPIELE_DG = [
  'db-open "Rechnungen" "R-2026-117"',
  'db-open "Rechnungen"',
  'db-open-list "Listen/Offene Posten.md"',
  'db-check',
  'db-check "Rechnungen"',
];

describe('Beispiele des Entscheidungs-Pakets (AK1)', () => {
  it('lässt jede Form von Da, Db, Dc, Dd und Dg gelten', () => {
    for (const zeile of [...BEISPIELE_DA, ...BEISPIELE_DB, ...BEISPIEL_DD, ...BEISPIELE_DG]) {
      expect(codes([zeile]), zeile).toEqual([]);
    }
    expect(codes(BEISPIEL_DC)).toEqual([]);
    const alle = pruefe([
      ...BEISPIELE_DA,
      ...BEISPIELE_DB,
      ...BEISPIEL_DC,
      ...BEISPIEL_DD,
      ...BEISPIELE_DG,
    ]);
    expect(alle.ok).toBe(true);
  });

  it('nennt Tabelle als Name oder als Pfad (Ausführungs-Entscheidung 2)', () => {
    expect(codes(['db-delete "Daten/Rechnungen.md" "r-00042"'])).toEqual([]);
    // Beide Trenner gelten auf jeder Plattform.
    expect(codes(['db-delete "Daten\\Rechnungen.md" "r-00042"'])).toEqual([]);
    expect(codes(['db-check "rechnungen"'])).toEqual([]);
  });

  it('vergleicht den Pfad der Tabelle über die Datei-Identitäts-Faltung der Plattform', async () => {
    // Der Name der Tabelle gilt ohne Rücksicht auf die Schreibung; ob sie beim
    // PFAD zählt, entscheidet das Dateisystem, nicht die Anwendung. Der Fall
    // behauptet deshalb kein Windows-Verhalten, sondern prüft die Kopplung an
    // pathCompareKey: Faltet die Plattform beide Schreibweisen zusammen, gilt
    // die Zeile; hält sie sie auseinander (Linux), ist «daten/Rechnungen.md»
    // eine andere Datei und die Tabelle unbekannt. Anlass: Der Linux-Lauf des
    // Epic-Abschluss-Tests vom 2026-11-10 fand die Plattform-Annahme des
    // vorigen Falls.
    const { pathCompareKey } = await import('../../src/shared/platform.js');
    const gefaltet = pathCompareKey('Daten') === pathCompareKey('daten');
    expect(codes(['db-delete "daten\\Rechnungen.md" "r-00042"'])).toEqual(
      gefaltet ? [] : ['tableUnknown'],
    );
  });

  it('liefert Paare, Ziel und Argumente im geprüften Schritt', () => {
    const r = pruefe([BEISPIELE_DA[0], BEISPIELE_DB[0]]);
    expect(r.steps[0]).toMatchObject({
      keyword: 'db-create',
      args: [{ type: 'table', raw: 'Rechnungen', form: 'string' }],
      pairs: [
        { key: 'nummer', raw: 'R-2026-117' },
        { key: 'betrag', raw: '420.00' },
        { key: 'status', raw: 'offen' },
      ],
    });
    expect(r.steps[1]).toMatchObject({
      keyword: 'db-query',
      args: [{ type: 'path', raw: 'Abfragen/Offene Posten.md', form: 'string' }],
      target: { kind: 'into', raw: 'Wochen-Übersicht.md' },
      position: { kind: 'under', raw: 'Offene Posten' },
    });
    expect(r.steps[1].pairs).toBeUndefined();
  });

  it('lässt db-export und db-import spätere Ausbaustufe (Dh)', () => {
    expect(befunde(['db-export "Rechnungen"'])).toEqual([
      ['laterStage', 1, { keyword: 'db-export', stage: 'D' }],
    ]);
    expect(codes(['db-import "Import/Rechnungen.csv"'])).toEqual(['laterStage']);
  });
});

describe('Form der Zeile', () => {
  it('verlangt Paare bei db-create und db-update', () => {
    expect(befunde(['db-create "Rechnungen"'])).toEqual([['pairsMissing', 1, {}]]);
    expect(codes(['db-update "Rechnungen" "R-1"'])).toEqual(['pairsMissing']);
  });

  it('meldet ein Feld doppelt, ohne Rücksicht auf die Schreibung', () => {
    expect(befunde(['db-update "Rechnungen" "R-1" status="a" Status="b"'])).toEqual([
      ['fieldDuplicate', 1, { field: 'Status' }],
    ]);
  });

  it('weist Paare bei Befehlen ohne Paare ab', () => {
    expect(codes(['db-delete "Rechnungen" "R-1" status="x"'])).toEqual(['extraArgument']);
    expect(codes(['db-check "Rechnungen" status="x"'])).toEqual(['extraArgument']);
  });

  it('verlangt den Datensatz vor den Paaren bei db-update', () => {
    expect(codes(['db-update "Rechnungen" status="x"'])).toEqual(['missingArgument']);
  });

  it('kennt bei db-query allein into und under, into ist Pflicht', () => {
    expect(codes(['db-query "Abfragen/Offene Posten.md" into "a.md" at-start'])).toEqual([
      'unknownOption',
    ]);
    expect(befunde(['db-query "Abfragen/Offene Posten.md"'])).toEqual([
      ['missingOption', 1, { group: 'target' }],
    ]);
    expect(codes(['db-query "Abfragen/Offene Posten.md" into "../aus.md"'])).toEqual([
      'pathOutsideArea',
    ]);
  });

  it('erlaubt as allein bei db-create', () => {
    expect(codes(['db-update "Rechnungen" "R-1" status="x" as "n"'])).toEqual(['unknownOption']);
  });

  it('verlangt nicht leere Tabelle und Datensatz', () => {
    expect(codes(['db-delete "" "R-1"'])).toEqual(['textEmpty']);
    expect(codes(['db-delete "Rechnungen" " "'])).toEqual(['textEmpty']);
  });
});

describe('Tabellen und Felder (AK2, AK3)', () => {
  it('meldet eine unbekannte und eine uneindeutige Tabelle mit Zeile', () => {
    expect(befunde(['notify "x"', 'db-delete "Personen" "R-1"'])).toEqual([
      ['tableUnknown', 2, { table: 'Personen' }],
    ]);
    expect(befunde(['db-check "Kontakte"'])).toEqual([
      ['tableAmbiguous', 1, { table: 'Kontakte' }],
    ]);
    // Der Pfad macht sie eindeutig.
    expect(codes(['db-check "B/Kontakte.md"'])).toEqual([]);
  });

  it('meldet ein unbekanntes Feld eines Paares (Dm)', () => {
    const r = pruefe(['db-update "Rechnungen" "R-1" stand="bezahlt"']);
    expect(r.findings).toEqual([
      {
        code: 'fieldUnknown',
        line: ERSTE_ZEILE,
        blockLine: 1,
        column: 11,
        detail: { field: 'stand', table: 'Rechnungen' },
      },
    ]);
    expect(r.ok).toBe(false);
    expect(codes(['db-create "Rechnungen" NUMMER="1"'])).toEqual([]);
  });

  it('meldet ein unbekanntes Feld in {{record:…}} gegen die Tabelle der Schleife', () => {
    expect(
      befunde([
        'db-for-each "Abfragen/Überfällige Rechnungen.md"',
        'notify "{{record:datum}}"',
        'end',
      ]),
    ).toEqual([['fieldUnknown', 2, { field: 'datum', table: 'Rechnungen' }]]);
  });

  it('meldet ein unbekanntes Feld und eine unbekannte Tabelle in {{db:…}}', () => {
    expect(befunde(['notify "{{db:Einstellungen:Mahnung:tage}}"'])).toEqual([
      ['fieldUnknown', 1, { field: 'tage', table: 'Einstellungen' }],
    ]);
    expect(befunde(['notify "{{db:Optionen:Mahnung:frist}}"'])).toEqual([
      ['tableUnknown', 1, { table: 'Optionen' }],
    ]);
    expect(codes(['db-create "Rechnungen" status="{{db:Kontakte:X:name}}"'])).toEqual([
      'tableAmbiguous',
    ]);
  });

  it('meldet {{db:…}} ohne drei Angaben', () => {
    expect(befunde(['notify "{{db:Einstellungen:frist}}"'])).toEqual([
      ['dbPlaceholderInvalid', 1, { placeholder: 'db' }],
    ]);
    expect(codes(['notify "{{db:A:B:C:D}}"'])).toEqual(['dbPlaceholderInvalid']);
    expect(codes(['notify "{{db:A: :C}}"'])).toEqual(['dbPlaceholderInvalid']);
  });

  it('prüft Felder einer Schleife ohne eine Tabelle nicht', () => {
    const auskunft = {
      tables: AUSKUNFT.tables,
      queries: [{ path: 'Q.md', state: 'ok', records: true, grouped: false, table: null }],
    };
    const optionen = { ...createDbLookup(auskunft) };
    expect(codes(['db-for-each "Q.md"', 'notify "{{record:irgendwas}}"', 'end'], optionen)).toEqual(
      [],
    );
  });
});

describe('Abfrage-Dateien (AK2)', () => {
  it.each(['db-query "X.md" into "a.md"', 'db-for-each "X.md"', 'db-open-list "X.md"'])(
    'meldet «keine Abfrage-Datei» bei %s',
    (zeile) => {
      const zeilen = zeile.startsWith('db-for-each') ? [zeile, 'end'] : [zeile];
      expect(befunde(zeilen)).toEqual([['queryFileMissing', 1, { path: 'X.md' }]]);
    },
  );

  it.each([
    'db-query "Abfragen/Kaputt.md" into "a.md"',
    'db-for-each "Abfragen/Kaputt.md"',
    'db-open-list "Abfragen/Kaputt.md"',
  ])('meldet «Abfrage fehlerhaft» bei %s', (zeile) => {
    const zeilen = zeile.startsWith('db-for-each') ? [zeile, 'end'] : [zeile];
    expect(codes(zeilen)).toEqual(['queryInvalid']);
  });

  it('meldet bei db-for-each eine Abfrage ohne TABLE RECORDS und eine gruppierte', () => {
    expect(befunde(['db-for-each "Abfragen/Offene Posten.md"', 'end'])).toEqual([
      ['queryNoRecords', 1, { path: 'Abfragen/Offene Posten.md' }],
    ]);
    expect(codes(['db-for-each "Abfragen/Gruppiert.md"', 'end'])).toEqual(['queryNoRecords']);
    // db-query und db-open-list nehmen jede auswertbare Abfrage.
    expect(codes(['db-open-list "Abfragen/Gruppiert.md"'])).toEqual([]);
  });
});

describe('Schleife über Datensätze (Dc)', () => {
  it('paart db-for-each mit end', () => {
    expect(codes(['db-for-each "Abfragen/Überfällige Rechnungen.md"'])).toEqual([
      'blockEndMissing',
    ]);
    expect(codes(['db-for-each "Abfragen/Überfällige Rechnungen.md"', 'else', 'end'])).toEqual([
      'elseWithoutCondition',
    ]);
  });

  it('meldet jede Verschachtelung von Schleifen, gleich welcher Art', () => {
    const q = 'db-for-each "Abfragen/Überfällige Rechnungen.md"';
    expect(befunde([q, '  for-each "E/*.md"', '  end', 'end'])).toEqual([['loopNested', 2, {}]]);
    expect(codes(['for-each "E/*.md"', `  ${q}`, '  end', 'end'])).toEqual(['loopNested']);
    expect(codes([q, `  ${q}`, '  end', 'end'])).toEqual(['loopNested']);
  });

  it('meldet {{record:…}} außerhalb einer Schleife db-for-each', () => {
    expect(befunde(['notify "{{record:id}}"'])).toEqual([
      ['recordOutsideLoop', 1, { name: 'record:id' }],
    ]);
    expect(codes(['for-each "E/*.md"', '  notify "{{record:id}}"', 'end'])).toEqual([
      'recordOutsideLoop',
    ]);
  });

  it('lässt {{item}} in db-for-each nicht gelten', () => {
    expect(
      codes(['db-for-each "Abfragen/Überfällige Rechnungen.md"', 'notify "{{item}}"', 'end']),
    ).toEqual(['itemOutsideLoop']);
  });
});

describe('Datenbank ausgeschaltet (AK4)', () => {
  it('meldet jeden Datenbank-Befehl mit «Datenbank ist ausgeschaltet»', () => {
    const zeilen = [...BEISPIELE_DA, ...BEISPIELE_DB, ...BEISPIEL_DC, ...BEISPIELE_DG];
    const r = pruefe(zeilen, { ...MIT, databaseEnabled: false });
    const aus = r.findings.filter((f) => f.code === 'databaseDisabled');
    const dbZeilen = zeilen.filter((z) => /^\s*db-/.test(z)).length;
    expect(aus).toHaveLength(dbZeilen);
    expect(r.ok).toBe(false);
    expect(codes(['notify "x"'], { databaseEnabled: false })).toEqual([]);
  });

  it('meldet ohne Angabe nichts (Muster der Vorlagen)', () => {
    expect(codes(['db-check'], {})).toEqual([]);
  });
});

describe('Befunde verhindern Lauf und Scharf-Schaltung (AK2)', () => {
  it('lässt keinen Befund der Datenbank als armOnly durch', () => {
    const kopf = 'trigger: schedule\nschedule: daily\nat: "08:00"\n';
    const r = pruefe(['db-update "Rechnungen" "R-1" stand="x"'], MIT, kopf);
    expect(r.findings.map((f) => f.code)).toContain('fieldUnknown');
    expect(r.ok).toBe(false);
    expect(r.armable).toBe(false);
  });
});

describe('Ohne Rückfrage entfällt die Prüfung', () => {
  it('prüft Tabellen, Felder und Abfragen nicht ohne Rückfrage oder ohne Stand', () => {
    const zeilen = ['db-update "Personen" "R-1" egal="x"', 'db-open-list "X.md"'];
    expect(codes(zeilen, {})).toEqual([]);
    expect(codes(zeilen, { dbTable: () => null, dbQuery: () => null })).toEqual([]);
  });

  it('prüft eine Tabelle mit Platzhalter erst nach dem Füllen', () => {
    const zeile = 'db-update "{{prompt:Tabelle?}}" "R-1" status="x"';
    const r = pruefe([zeile]);
    expect(r.findings).toEqual([]);
    const kontext = { file: 'a.md', title: 'a', folder: '', area: 'B', nowMs: 0, locale: 'de' };
    const nach = (antwort) =>
      prepareRun(r.steps, kontext, { 'prompt:Tabelle?:': antwort }, {}, MIT);
    expect(nach('Personen').findings.map((f) => [f.code, f.detail])).toEqual([
      ['tableUnknown', { table: 'Personen' }],
    ]);
    const gefuellt = nach('Rechnungen');
    expect(gefuellt.ok).toBe(true);
    expect(gefuellt.steps[0]).toMatchObject({
      args: ['Rechnungen', 'R-1'],
      pairs: [{ key: 'status', value: 'x' }],
    });
  });

  it('prüft Felder und Abfrage-Datei nach dem Füllen', () => {
    const kontext = { file: 'a.md', title: 'a', folder: '', area: 'B', nowMs: 0, locale: 'de' };
    const r = pruefe(['db-create "{{title}}" status="x"', 'db-open-list "{{title}}.md"']);
    expect(r.ok).toBe(true);
    const gefuellt = prepareRun(r.steps, { ...kontext, title: 'Einstellungen' }, {}, {}, MIT);
    expect(gefuellt.findings.map((f) => [f.code, f.blockLine])).toEqual([
      ['fieldUnknown', 1],
      ['queryFileMissing', 2],
    ]);
  });

  it('füllt Ziel und Paare eines Schritts', () => {
    const kontext = { file: 'a.md', title: 'T', folder: '', area: 'B', nowMs: 0, locale: 'de' };
    const r = pruefe(['db-query "Abfragen/Offene Posten.md" into "Berichte/{{title}}.md"']);
    const gefuellt = prepareRun(r.steps, kontext, {}, {}, MIT);
    expect(gefuellt.steps[0].target).toBe('Berichte/T.md');
  });
});

describe('Rückfragen aus der Auskunft (workflow-db-lookup.js)', () => {
  const { dbTable, dbQuery } = createDbLookup(AUSKUNFT);

  it('löst Pfad vor Name auf, ohne Rücksicht auf die Schreibung', () => {
    expect(dbTable('Rechnungen')).toEqual({
      state: 'known',
      name: 'Rechnungen',
      path: 'Daten/Rechnungen.md',
      fields: ['nummer', 'betrag', 'status'],
    });
    expect(dbTable('./Daten/Rechnungen.md').state).toBe('known');
    expect(dbTable('Kontakte')).toEqual({ state: 'ambiguous' });
    expect(dbTable('A/Kontakte.md').state).toBe('known');
    expect(dbTable('Daten/Rechnungen')).toEqual({ state: 'unknown' });
    expect(dbTable('')).toEqual({ state: 'unknown' });
  });

  it('liefert die Angaben einer Abfrage-Datei oder «missing»', () => {
    expect(dbQuery('Abfragen/Überfällige Rechnungen.md')).toEqual({
      state: 'ok',
      records: true,
      grouped: false,
      table: 'Rechnungen',
    });
    expect(dbQuery('Abfragen/Kaputt.md').state).toBe('invalid');
    expect(dbQuery('Nicht.md')).toEqual({ state: 'missing' });
  });

  it('vergleicht Felder ohne Rücksicht auf die Schreibung', () => {
    const t = dbTable('Rechnungen');
    expect(tableHasField(t, 'Betrag')).toBe(true);
    expect(tableHasField(t, 'betrag ')).toBe(false);
  });

  it('übersteht eine leere oder fehlende Auskunft', () => {
    expect(createDbLookup(null).dbTable('X')).toEqual({ state: 'unknown' });
    expect(createDbLookup({}).dbQuery('X.md')).toEqual({ state: 'missing' });
  });
});

describe('Platzhalter der Vorlagen-Engine (4T-002544)', () => {
  it('liest {{record:feld}} und {{db:Tabelle:Datensatz:Feld}} als Knoten', () => {
    const r = analyzeTemplate('{{record:Betrag}} {{db: Einstellungen :Mahnung:frist}}');
    expect(r.ok).toBe(true);
    expect(r.segments[0]).toMatchObject({ type: 'context', name: 'record:Betrag' });
    expect(r.segments[2]).toMatchObject({
      type: 'context',
      name: 'db:Einstellungen:Mahnung:frist',
      db: { table: 'Einstellungen', record: 'Mahnung', field: 'frist' },
    });
    expect(analyzeTemplate('{{record}}').ok).toBe(false);
    expect(analyzeTemplate('{{db:A:B}}').error).toMatchObject({
      code: 'invalidParams',
      name: 'db',
    });
  });
});

// 4T-002545 (D3, De, AK6): `db-delete` und `db-open` brauchen einen Zuschauer;
// `db-create` und `db-update` laufen auch nach Zeitplan und bei Ereignissen.
describe('Nur von Hand: db-delete und db-open (4T-002545, AK6)', () => {
  const ZEITPLAN = 'trigger: schedule\nschedule: every monday at 08:00\n';
  const EREIGNIS = 'trigger: event\nevent: file-created in "Eingang"\n';
  const nurVonHand = (r) =>
    r.findings.filter((f) => f.code === 'manualOnly').map((f) => [f.line, f.detail, f.armOnly]);
  const ZEILEN = [
    'db-create "Rechnungen" nummer="R-1"',
    'db-update "Rechnungen" "R-1" status="bezahlt"',
    'db-delete "Rechnungen" "R-1"',
    'db-open "Rechnungen" "R-1"',
  ];

  it.each([
    ['Zeitplan', ZEITPLAN],
    ['Ereignis', EREIGNIS],
  ])('meldet bei %s db-delete und db-open, nicht db-create und db-update', (_name, kopf) => {
    const r = pruefe(ZEILEN, MIT, kopf);
    // Die Zeile ist die des Schritts, gleich wie viele Zeilen der Dateikopf trägt.
    const zeileVon = (wort) => r.steps.find((s) => s.keyword === wort).line;
    expect(nurVonHand(r)).toEqual([
      [zeileVon('db-delete'), { keyword: 'db-delete' }, true],
      [zeileVon('db-open'), { keyword: 'db-open' }, true],
    ]);
    expect(r.ok).toBe(true);
    expect(r.armable).toBe(false);
    expect(pruefe(ZEILEN.slice(0, 2), MIT, kopf)).toMatchObject({ ok: true, armable: true });
  });

  it('meldet von Hand nichts', () => {
    expect(nurVonHand(pruefe(ZEILEN))).toEqual([]);
  });

  // 4T-002548 (De, AK2): db-open-list und db-check laufen auch ohne Zuschauer.
  it.each([
    ['Zeitplan', ZEITPLAN],
    ['Ereignis', EREIGNIS],
  ])('db-open-list und db-check sind bei %s erlaubt', (_name, kopf) => {
    const zeilen = ['db-open-list "Listen/Offene Posten.md"', 'db-check', 'db-check "Rechnungen"'];
    const r = pruefe(zeilen, MIT, kopf);
    expect(r.findings).toEqual([]);
    expect(r).toMatchObject({ ok: true, armable: true });
  });
});

// 4T-002545 (Da): Der Name hinter `as` reist mit dem Schritt von `db-create`.
describe('Name der neuen Kennung im Schritt (4T-002545, AK5)', () => {
  it('trägt den Namen hinter as als result, gefüllt wie geprüft', () => {
    const r = pruefe([
      'db-create "Rechnungen" nummer="R-1" as "neu"',
      'db-create "Rechnungen" nummer="R-2"',
    ]);
    expect(r.steps.map((s) => s.result)).toEqual(['neu', undefined]);
    const kontext = { file: 'a.md', title: 'T', folder: '', area: 'B', nowMs: 0, locale: 'de' };
    expect(prepareRun(r.steps, kontext, {}, {}, MIT).steps[0].result).toBe('neu');
  });
});

// 4T-002547 (Da): Name und Platzhalter der neuen Kennung, Datenbank-Werte dort,
// wo der Wert vor dem ersten Schritt feststehen muss.
describe('Neue Kennung und Werte eines Laufs (4T-002547)', () => {
  const befunde = (zeilen) => pruefe(zeilen).findings.map((f) => [f.code, f.detail]);

  it('{{created:…}} vor oder ohne db-create … as ist ein Befund, danach nicht', () => {
    expect(
      befunde([
        'notify "{{created:neu}}"',
        'db-create "Rechnungen" nummer="1" as "Neu"',
        'notify "{{created:neu}}"',
      ]),
    ).toEqual([['createdBeforeStep', { name: 'neu' }]]);
  });

  it('meldet einen ungültigen und einen doppelten Namen hinter as', () => {
    expect(
      befunde([
        'db-create "Rechnungen" nummer="1" as "x y"',
        'db-create "Rechnungen" nummer="2" as "neu"',
        'db-create "Rechnungen" nummer="3" as "NEU"',
      ]),
    ).toEqual([
      ['createdNameInvalid', { name: 'x y' }],
      ['createdNameDuplicate', { name: 'NEU' }],
    ]);
    const r = pruefe(['db-create "Rechnungen" nummer="1" as "Neu"']);
    expect(r.steps[0].result).toBe('neu');
  });

  it('ein Datenbank-Wert im Namen eines Workflows, im Ziel von delete und im Pfad einer Vorlage ist ein Befund', () => {
    expect(
      pruefe([
        'workflow "{{db:Rechnungen:R-1:nummer}}"',
        'db-create "Rechnungen" nummer="1" as "neu"',
        'delete "{{created:neu}}"',
        'create "a.md" from-template "{{db:Rechnungen:R-1:nummer}}"',
      ]).findings.map((f) => [f.code, f.detail]),
    ).toEqual([
      ['dbValueNotAllowed', { name: 'db:Rechnungen:R-1:nummer', keyword: 'workflow' }],
      ['dbValueNotAllowed', { name: 'created:neu', keyword: 'delete' }],
      ['dbValueNotAllowed', { name: 'db:Rechnungen:R-1:nummer', option: 'from-template' }],
    ]);
  });
});
