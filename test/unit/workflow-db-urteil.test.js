// 4T-002690 (Epic 3E-000415, Story 4S-001215): Das Urteil der Datenbank für die
// Text-Befehle der Workflows (src/main/workflows/workflow-db-urteil.js) — Aufbau
// und Steckbrief (Aufbau-Regel), Datensatz-Block einer Tabellen-Datei (Ta),
// Feld und Kennung einer Karteikarte (Tb), Aus-Zustand (Befund 7).
//
// Gearbeitet wird am echten Platten-Weg der Inhalts-Befehle in einer
// Wegwerf-Wurzel: Das Urteil wird am ERGEBNIS der Bearbeitung gemessen, und ein
// Halt muss die Datei unverändert lassen. Die Kartei-Tabelle eines Ordners kommt
// über die echte Weiche des Bereichs-Panels (`kartei-weichen.js`); ihre
// Schreib-Schnittstelle ist eine Attrappe, weil das Urteil nie schreibt. Die
// Fenster-Wege prüft `workflow-buffer-route.test.js`.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const { createDbUrteil } = require('../../src/main/workflows/workflow-db-urteil.js');
const { erzeugeKarteiWeichen } = require('../../src/main/database/kartei-weichen.js');
const {
  mddPathFor,
  readStateForSave,
  writeDocumentParts,
} = require('../../src/main/documents/document-parts-io.js');
const { emptyContainer, serializeContainer } = require('../../src/main/documents/mdd-store.js');
const { planeZerlegung } = require('../../src/shared/document-split.js');
const { teilungsOptionen } = require('../../src/main/documents/teilungs-optionen.js');

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
  '  lastId: 2',
  '---',
  '',
  '# Bücher',
  '',
  'Freier Text vor den Datensätzen.',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Solaris',
  '| 224',
  '|- id="r-00002"',
  '| Zauberberg',
  '| 1000',
  '```',
  '',
].join('\n');

const AUTHORS = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '    - name: born',
  '  key: name',
  '  lastId: 1',
  '---',
  '',
  'Autoren, je Autor eine Karteikarte.',
  '',
].join('\n');

const ECO = [
  '---',
  'db-record: r-00001',
  'name: Umberto Eco',
  'born: 1932-01-05',
  'notiz: alt',
  '---',
  '',
  'Notizen zu Eco.',
  '',
].join('\n');

const STECKBRIEF = ['---', 'db-database:', '  name: Probe', '---', '', 'Die Datenbank.', ''].join(
  '\n',
);

function welt({ datenbankAn = true, dateien = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-urteil-'));
  tmpDirs.push(root);
  const abs = (rel) => path.join(root, ...rel.split('/'));
  const lege = (rel, text) => {
    fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
    fs.writeFileSync(abs(rel), text, 'utf8');
  };
  const bestand = {
    'Daten/Library.md': LIBRARY,
    'Authors/Authors.md': AUTHORS,
    'Authors/Umberto Eco.md': ECO,
    'Authors/Ohne Kennung.md': '---\nname: Niemand\n---\nText.\n',
    'Notizen/Gewoehnlich.md': '# Notiz\n\nText.\n',
    'Daten/Datenbank.md': STECKBRIEF,
    ...dateien,
  };
  for (const [rel, text] of Object.entries(bestand)) lege(rel, text);
  const karteiWeichen = erzeugeKarteiWeichen({
    schreibSchnittstelle: { fuehreAuftragAus: async () => ({ ok: false }) },
    erweiterungAktiv: () => datenbankAn,
    fsp,
  });
  const schritte = createWorkflowContentSteps({
    windows: new Map(),
    backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
    resolveHistoryFor: async () => ({ effective: false }),
    recordMddOnSave: async () => {},
    bufferRequests: { request: async () => ({ ok: false, code: 'bufferUnavailable' }) },
    datenbankAktiv: () => datenbankAn,
    karteiWeichen,
  });
  const ctx = { root, owner: {}, event: { sender: { id: 1 } }, workflowAbs: abs('Ablauf.md') };
  const lauf = (keyword, args, extra = {}) =>
    schritte.runContentStep(ctx, {
      line: 3,
      keyword,
      args,
      source: null,
      position: null,
      ...extra,
    });
  return {
    root,
    abs,
    lege,
    lies: (rel) => fs.readFileSync(abs(rel), 'utf8'),
    lauf,
    edit: (rel, e) => schritte.runContentEdit({ ...ctx, befehl: 'db-query' }, rel, e),
  };
}

const VORLAGE = (text) => ({ source: { kind: 'template', text } });

// Läuft den Schritt und prüft: Halt mit Code und Angaben, Datei unverändert.
async function haelt(w, rel, keyword, args, erwartet, extra = {}) {
  const vorher = w.lies(rel);
  const res = await w.lauf(keyword, args, extra);
  expect(res).toMatchObject({ ok: false, ...erwartet });
  expect(w.lies(rel)).toBe(vorher);
  return res;
}

describe('Datensatz-Block einer Tabellen-Datei (Ta, AK2)', () => {
  it('replace einer Datensatz-Zeile hält mit Tabelle und Befehl', async () => {
    const w = welt();
    const res = await haelt(
      w,
      'Daten/Library.md',
      'replace',
      ['Daten/Library.md', 'Solaris', 'X'],
      {
        code: 'dbRecordsByText',
      },
    );
    expect(res.detail).toEqual({ table: 'Library', command: 'replace', path: 'Daten/Library.md' });
  });

  it('replace im freien Text der Tabellen-Datei läuft durch', async () => {
    const w = welt();
    const res = await w.lauf('replace', ['Daten/Library.md', 'Freier Text', 'Neuer Text']);
    expect(res.ok).toBe(true);
    expect(w.lies('Daten/Library.md')).toContain('Neuer Text vor den Datensätzen.');
  });

  it('insert am Anfang und unter einer Überschrift vor dem Block läuft durch', async () => {
    const w = welt();
    expect(
      (
        await w.lauf('insert', ['Daten/Library.md'], {
          ...VORLAGE('Oben.'),
          position: { kind: 'atStart' },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await w.lauf('insert', ['Daten/Library.md'], {
          ...VORLAGE('- Eintrag'),
          position: { kind: 'under', heading: 'Bücher' },
        })
      ).ok,
    ).toBe(true);
    expect(w.lies('Daten/Library.md')).toContain('```perspective-records\n|- id="r-00001"');
  });

  // Zweitblick, Runde 1, Befund 3, und Runde 2: `insert` erreicht den
  // bestehenden Datensatz-Block nicht, weil eine Überschrift in einem Code-Block
  // für `insert` keine Überschrift ist (`headingUnknown`, nichts geändert). Ein
  // eingefügter zweiter, eigener Datensatz-Block vor dem bestehenden ändert
  // dagegen den gelesenen Block-Rumpf (es zählt der erste Block) und hält an.
  it('insert eines eigenen Datensatz-Blocks vor den bestehenden hält; eine Überschrift im Block wird nicht gefunden', async () => {
    const w = welt();
    const zeilen = '```perspective-records\n|- id="r-00009"\n| Eingeschoben\n| 1\n```';
    await haelt(
      w,
      'Daten/Library.md',
      'insert',
      ['Daten/Library.md'],
      { code: 'dbRecordsByText', detail: { table: 'Library', command: 'insert' } },
      { ...VORLAGE(zeilen), position: { kind: 'atStart' } },
    );
    const imBlock = LIBRARY.replace('| Solaris\n', '| Solaris\n# Im Block\n');
    const v = welt({ dateien: { 'Daten/Library.md': imBlock } });
    await haelt(
      v,
      'Daten/Library.md',
      'insert',
      ['Daten/Library.md'],
      { code: 'headingUnknown' },
      { ...VORLAGE('| Neu'), position: { kind: 'under', heading: 'Im Block' } },
    );
  });

  it('append hinter dem geschlossenen Block am Datei-Ende läuft durch; der Text steht dahinter', async () => {
    const w = welt();
    expect((await w.lauf('append', ['Daten/Library.md'], VORLAGE('Nachsatz'))).ok).toBe(true);
    expect(w.lies('Daten/Library.md').endsWith('| 1000\n```\nNachsatz\n')).toBe(true);
  });

  it('append an einen nicht geschlossenen Block am Datei-Ende hält: gemessen am Ergebnis', async () => {
    const offen = LIBRARY.replace(/```\n$/, '');
    const w = welt({ dateien: { 'Daten/Library.md': offen } });
    await haelt(
      w,
      'Daten/Library.md',
      'append',
      ['Daten/Library.md'],
      { code: 'dbRecordsByText' },
      VORLAGE('|- id="r-00003"'),
    );
  });

  it('db-query … into mit under: ein Abschnitt, der den Block trägt, hält mit dem Befehl db-query', async () => {
    const w = welt();
    const vorher = w.lies('Daten/Library.md');
    const res = await w.edit('Daten/Library.md', {
      op: 'replaceSection',
      heading: 'Bücher',
      text: '| Ergebnis |',
    });
    expect(res).toMatchObject({
      ok: false,
      code: 'dbRecordsByText',
      detail: { command: 'db-query' },
    });
    expect(w.lies('Daten/Library.md')).toBe(vorher);
  });

  it('eine Eigenschaft außerhalb des Behälters und eine Änderung allein an lastId laufen durch', async () => {
    const w = welt();
    expect((await w.lauf('set-property', ['Daten/Library.md', 'notiz', 'ja'])).ok).toBe(true);
    expect((await w.lauf('replace', ['Daten/Library.md', 'lastId: 2', 'lastId: 7'])).ok).toBe(true);
    expect(w.lies('Daten/Library.md')).toContain('lastId: 7');
  });
});

describe('Aufbau einer Tabelle und Steckbrief (Aufbau-Regel, AK4)', () => {
  it('remove-property und set-property am Behälter db-table halten mit dem Namen der Tabelle', async () => {
    const w = welt();
    const res = await haelt(
      w,
      'Authors/Authors.md',
      'remove-property',
      ['Authors/Authors.md', 'db-table'],
      {
        code: 'dbStructureByText',
      },
    );
    expect(res.detail).toMatchObject({ table: 'Authors', command: 'remove-property' });
    await haelt(w, 'Daten/Library.md', 'set-property', ['Daten/Library.md', 'db-table', 'x'], {
      code: 'dbStructureByText',
    });
    await haelt(
      w,
      'Daten/Library.md',
      'replace',
      ['Daten/Library.md', 'name: pages', 'name: seiten'],
      {
        code: 'dbStructureByText',
      },
    );
  });

  it('der Steckbrief hält mit eigenem Code', async () => {
    const w = welt();
    const res = await haelt(
      w,
      'Daten/Datenbank.md',
      'remove-property',
      ['Daten/Datenbank.md', 'db-database'],
      {
        code: 'dbProfileByText',
      },
    );
    expect(res.detail).toEqual({ command: 'remove-property', path: 'Daten/Datenbank.md' });
    expect((await w.lauf('append', ['Daten/Datenbank.md'], VORLAGE('Mehr Text.'))).ok).toBe(true);
  });

  it('eine gewöhnliche Datei, die zur Tabelle würde, hält als Aufbau', async () => {
    const w = welt();
    await haelt(
      w,
      'Notizen/Gewoehnlich.md',
      'set-property',
      ['Notizen/Gewoehnlich.md', 'db-table', ''],
      {
        code: 'dbStructureByText',
        detail: { table: 'Gewoehnlich' },
      },
    );
  });
});

describe('Feld und Kennung einer Karteikarte (Tb, AK3)', () => {
  const KARTE = 'Authors/Umberto Eco.md';

  it('set-property und remove-property auf ein Feld halten mit Feld und Tabelle', async () => {
    const w = welt();
    const res = await haelt(w, KARTE, 'set-property', [KARTE, 'born', '1932-01-06'], {
      code: 'dbFieldByText',
    });
    expect(res.detail).toEqual({
      field: 'born',
      table: 'Authors',
      command: 'set-property',
      path: KARTE,
    });
    await haelt(w, KARTE, 'remove-property', [KARTE, 'born'], {
      code: 'dbFieldByText',
      detail: { field: 'born' },
    });
  });

  it('ein Feld wird ohne Rücksicht auf die Schreibung erkannt', async () => {
    const w = welt();
    await haelt(w, KARTE, 'set-property', [KARTE, 'BORN', '1900-01-01'], {
      code: 'dbFieldByText',
      detail: { field: 'born' },
    });
  });

  it('die Kennung db-record ändern oder entfernen hält', async () => {
    const w = welt();
    await haelt(w, KARTE, 'set-property', [KARTE, 'db-record', 'r-00009'], {
      code: 'dbRecordIdByText',
      detail: { table: 'Authors' },
    });
    await haelt(w, KARTE, 'remove-property', [KARTE, 'db-record'], { code: 'dbRecordIdByText' });
  });

  it('freier Text, Schlagwort und eine Eigenschaft, die kein Feld ist, laufen durch', async () => {
    const w = welt();
    expect((await w.lauf('append', [KARTE], VORLAGE('Probe-Notiz'))).ok).toBe(true);
    expect((await w.lauf('add-tag', [KARTE, 'autor'])).ok).toBe(true);
    expect((await w.lauf('set-property', [KARTE, 'notiz', 'neu'])).ok).toBe(true);
    expect((await w.lauf('remove-tag', [KARTE, 'autor'])).ok).toBe(true);
    const text = w.lies(KARTE);
    expect(text).toContain('Probe-Notiz');
    expect(text).toContain('born: 1932-01-05');
  });

  it('add-tag hält, wenn die Tabelle ein Feld tags hat', async () => {
    const mitTags = AUTHORS.replace('    - name: born', '    - name: born\n    - name: tags');
    const w = welt({ dateien: { 'Authors/Authors.md': mitTags } });
    await haelt(w, KARTE, 'add-tag', [KARTE, 'autor'], {
      code: 'dbFieldByText',
      detail: { field: 'tags' },
    });
  });

  it('eine Datei im Kartei-Ordner, die erst durch db-record zur Karteikarte würde, hält', async () => {
    const w = welt();
    await haelt(
      w,
      'Authors/Ohne Kennung.md',
      'set-property',
      ['Authors/Ohne Kennung.md', 'db-record', 'r-00002'],
      {
        code: 'dbRecordIdByText',
      },
    );
    // Außerhalb eines Kartei-Ordners ist db-record eine gewöhnliche Eigenschaft.
    expect(
      (await w.lauf('set-property', ['Notizen/Gewoehnlich.md', 'db-record', 'r-00002'])).ok,
    ).toBe(true);
  });
});

describe('Aus-Zustand und Urteil ohne Tor (Befund 7)', () => {
  it('Erweiterung «Datenbank» aus: Datensatz, Feld und Aufbau ändern sich wie bisher', async () => {
    const w = welt({ datenbankAn: false });
    expect((await w.lauf('replace', ['Daten/Library.md', 'Solaris', 'X'])).ok).toBe(true);
    expect((await w.lauf('set-property', ['Authors/Umberto Eco.md', 'born', '1900'])).ok).toBe(
      true,
    );
    expect((await w.lauf('remove-property', ['Authors/Authors.md', 'db-table'])).ok).toBe(true);
  });

  it('ohne Tor gilt «aus», und das Urteil liest nichts', async () => {
    const urteil = createDbUrteil({
      karteiWeichen: {
        karteiTabelleIn: () => {
          throw new Error('nicht gefragt');
        },
      },
    });
    expect(urteil.aktiv()).toBe(false);
    expect(
      await urteil.urteile({ abs: '/x/Eco.md', alterText: ECO, neuerText: '', befehl: 'replace' }),
    ).toEqual({ ok: true });
  });
});

describe('Geteilte Tabellen-Datei (AK2)', () => {
  // Eine Tabellen-Datei mit `anzahl` Datensätzen zu rund 1 KB, zerlegt wie beim
  // Speichern von Hand (Muster `workflow-geteilte-dokumente.test.js`).
  async function geteilteTabelle(root, anzahl) {
    const zeilen = ['---', 'db-table:', '  fields:', '    - name: name', '    - name: text', '---'];
    zeilen.push('', 'Vorwort.', '', '```perspective-records');
    for (let i = 1; i <= anzahl; i++) {
      zeilen.push(
        `|- id="r-${String(i).padStart(5, '0')}"`,
        `| Name ${i}`,
        `| ${'x'.repeat(1000)}`,
      );
    }
    zeilen.push('```', '');
    const text = zeilen.join('\n');
    const kopf = path.join(root, 'Daten.md');
    fs.writeFileSync(mddPathFor(kopf), serializeContainer(emptyContainer()));
    const teilung = teilungsOptionen(text);
    const plan = planeZerlegung({ text, base: 'Daten', schwelle: teilung.schwelle, ...teilung });
    expect(plan.geteilt).toBe(true);
    expect((await writeDocumentParts(kopf, plan.teile)).ok).toBe(true);
    return kopf;
  }

  it('eine Datensatz-Zeile im zweiten Teil hält, alle Teile unverändert; freier Text läuft', async () => {
    const w = welt();
    const kopf = await geteilteTabelle(w.root, 800);
    const teile = () =>
      fs
        .readdirSync(w.root)
        .filter((n) => n.startsWith('Daten') && fs.statSync(path.join(w.root, n)).isFile())
        .sort()
        .map((n) => [n, fs.readFileSync(path.join(w.root, n), 'utf8')]);
    const vorher = teile();
    expect(vorher.length).toBeGreaterThan(2);
    const res = await w.lauf('replace', ['Daten.md', '| Name 790\n', '| Neu 790\n']);
    expect(res).toMatchObject({ ok: false, code: 'dbRecordsByText', detail: { table: 'Daten' } });
    expect(teile()).toEqual(vorher);
    expect((await w.lauf('replace', ['Daten.md', 'Vorwort.', 'Vorrede.'])).ok).toBe(true);
    expect((await readStateForSave(kopf)).text).toContain('Vorrede.');
  });
});
