// 4T-002039 (Epic 3E-000258): Die Datensatz-Ebene der Abfrage-Sprache —
// `LIST RECORDS` und `TABLE RECORDS` über die Datensätze einer Datenbank-Tabelle.
//
// Geprüft wird über den echten Erzeuger aller Ebenen (`frontmatterQueryFor`) auf
// einem Wegwerf-Bereich, damit Parser, Quellen-Deutung, Tabellen-Bestand,
// Feld-Auflösung, Ordnung und Zeilen-Bau zusammen stehen. Jede erzeugte
// Ergebnismenge läuft durch den Prüfer des Format-Vertrags (`validateResultSet`)
// und muss ohne Befund bleiben.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// `record-table-read.test.js`; die geteilte Tabelle entsteht wie dort über den
// Teiler des Speicherns. Der Aus-Zustand steht in einer eigenen Datei
// (`datensatz-abfrage-aus-zustand.test.js`), weil er den Schalter umlegt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { parseQuery } from '../../src/shared/query/perspective-query.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
// Statisch importiert, damit das Modul samt seinen Importen in der Import-Kette
// dieser Prüfdatei steht (Auswahl des Prüf-Ausschnitts).
import { recordsQueryFor } from '../../src/main/index/query-records.js';
import { resolveRecordField } from '../../src/shared/query/query-record-fields.js';

const require_ = createRequire(import.meta.url);
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { clearCaches, readCount } = require_('../../src/main/index/record-table-read.js');
const { planeZerlegung } = require_('../../src/shared/document-split.js');

// --- Fixtures ---------------------------------------------------------------

function table(fieldLines, tableLines, records) {
  return [
    '---',
    'db-table:',
    '  fields:',
    ...fieldLines,
    ...tableLines,
    '---',
    '',
    '```perspective-records',
    ...records,
    '```',
    '',
  ].join('\n');
}

function row(id, cells) {
  return [`|- id="${id}"`, ...cells.map((c) => `| ${c}`)];
}

// Die Bibliothek: Text, Zahl, Datum und Wahrheitswert, dazu ein Feld `id` und
// ein Feld, das wörtlich `record.id` heißt (ein Punkt im Feld-Namen ist
// zulässig). `title` trägt Beschriftungen in Deutsch und Englisch, `author`
// nur in Französisch und Italienisch, damit die Rückfall-Sprache sichtbar wird.
const LIBRARY_FIELDS = [
  '    - name: title',
  '      label:',
  '        de: Titel',
  '        en: Title',
  '    - name: author',
  '      label:',
  '        fr: Auteur',
  '        it: Autore',
  '    - name: pages',
  '      type: number',
  '    - name: acquired',
  '      type: date',
  '    - name: available',
  '      type: boolean',
  '    - name: id',
  '    - name: record.id',
];
const LIBRARY_ROWS = [
  ...row('r-00001', ['Zauberberg', 'Mann', '1000', '1924-11-20', 'x', 'Z1', 'wörtlich']),
  ...row('r-00002', ['Anna Karenina', 'Tolstoi', '864', '1878-01-01', '', 'A1', '']),
  ...row('r-00003', ['kurz', 'Kafka', '120', '1915-10-01', 'x', 'K1', '']),
  // Typ-Fehler in Zahl, Datum und Wahrheitswert: alle drei «fehlend».
  ...row('r-00004', ['Ohne Seiten', 'Niemand', 'viele', '2026-02-31', 'vielleicht', 'N1', '']),
  // Ohne Anzeige-Form: steht ohne SORT zuletzt.
  ...row('r-00005', ['', 'Anonym', '50', '', '', '', '']),
  // Gleiche Anzeige-Form wie r-00002: entschieden wird nach der Kennung.
  ...row('r-00006', ['Anna Karenina', 'Tolstoi', '900', '', '', 'A2', '']),
];
const LIBRARY = table(LIBRARY_FIELDS, ['  display: title'], LIBRARY_ROWS);

// Die Ausleihen im Unterordner, mit einem Verweis auf die Bibliothek.
const LOANS = table(
  [
    '    - name: book',
    '      type: record',
    '      options:',
    '        table: Library',
    '    - name: borrower',
  ],
  ['  display: borrower'],
  [...row('r-00001', ['r-00001', 'Eva']), ...row('r-00002', ['r-00003', 'Max'])],
);

// Der Steckbrief nennt Italienisch als Rückfall-Sprache der Datenbank.
const STECKBRIEF = [
  '---',
  'db-database:',
  '  fallbackLocale: it',
  '---',
  '',
  '# Bibliothek',
  '',
].join('\n');

// Die Datei mit der Abfrage; `minpages` ist Ziel des Selbstbezugs `this.`.
const ABFRAGEN = '---\nminpages: 500\n---\n# Abfragen\n';

// Ohne SORT: Anzeige-Form ohne Rücksicht auf die Schreibung, gleiche
// Anzeige-Form nach der Kennung, ohne Anzeige-Form zuletzt.
const GRUNDORDNUNG = ['r-00002', 'r-00006', 'r-00003', 'r-00004', 'r-00001', 'r-00005'];

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
  }
  expect(result.status).toBe('ready');
  return rootForActiveFile(activeFile);
}

// Ein Bereich mit Bibliothek, Ausleihen, Abfrage-Datei und, wenn gewünscht,
// dem Steckbrief der Datenbank.
async function bereich({ steckbrief = true, library = LIBRARY } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqr-'));
  tmpDirs.push(dir);
  const libraryPath = write(dir, 'Library.md', library);
  const loansPath = write(dir, 'Ausleihe/Loans.md', LOANS);
  if (steckbrief) write(dir, 'Datenbank.md', STECKBRIEF);
  write(dir, 'Notiz.md', '---\npages: 9999\n---\n# Notiz\n');
  const abfragen = write(dir, 'Abfragen.md', ABFRAGEN);
  const root = await indexFor(abfragen);
  return { root, abfragen, libraryPath, loansPath };
}

afterEach(() => {
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// Die Antwort des Erzeugers: allein die Ergebnismenge, ohne Befund des Prüfers.
function menge(b, abfrage, locale = 'de-DE') {
  const payload = frontmatterQueryFor(b.abfragen, abfrage, undefined, undefined, locale);
  expect(Object.keys(payload)).toEqual(['resultSet']);
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  return payload.resultSet;
}

const ids = (rs) => rs.rows.map((r) => r.origin.id);
const fehler = (rs) => rs.state.queryError && rs.state.queryError.code;

// --- Parser -----------------------------------------------------------------

describe('Parser: das Ebenen-Wort RECORDS (AK1)', () => {
  it('steht nach LIST und nach TABLE, auch vor WITHOUT ID', () => {
    const list = parseQuery('LIST RECORDS FROM "Library"').ast;
    expect(list.type).toBe('list');
    expect(list.scope).toBe('records');
    expect(list.source).toEqual({ type: 'srcFolder', value: 'Library' });
    const tab = parseQuery('TABLE records WITHOUT ID title AS "T", pages FROM "Library"').ast;
    expect(tab.type).toBe('table');
    expect(tab.scope).toBe('records');
    expect(tab.withoutId).toBe(true);
    expect(tab.fields.map((f) => f.alias)).toEqual(['T', null]);
  });

  it('nimmt genau ein Wort; die bestehenden Ebenen-Wörter bleiben', () => {
    // Ein Zusatzfeld namens `records` hinter dem Ebenen-Wort bleibt ein Feld.
    const ast = parseQuery('LIST RECORDS records FROM "Library"').ast;
    expect(ast.scope).toBe('records');
    expect(ast.fields).toEqual([{ expr: { type: 'field', name: 'records' }, alias: null }]);
    expect(parseQuery('LIST BLOCKS').ast.scope).toBe('blocks');
    expect(parseQuery('TABLE TASKS WITHOUT ID description').ast.scope).toBe('tasks');
    expect(parseQuery('LIST').ast.scope).toBe('files');
    // Kontext-Regel: Das nackte Wort in Ebenen-Position ist das Ebenen-Wort.
    expect(parseQuery('TABLE RECORDS').ast.fields).toEqual([]);
  });
});

// --- Quelle -----------------------------------------------------------------

describe('Quelle: Tabellen beim Namen und als Pfad (AK2)', () => {
  it('beim Namen, ohne Rücksicht auf die Schreibung, je Datensatz ein Treffer', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM "Library"');
    expect(rs.scope).toBe('records');
    expect(ids(rs)).toEqual(GRUNDORDNUNG);
    expect(ids(menge(b, 'LIST RECORDS FROM "library"'))).toEqual(GRUNDORDNUNG);
    // Eine gewöhnliche Datei mit einem gleichnamigen Frontmatter-Feld trifft nie.
    expect(rs.rows.every((r) => r.origin.table === 'Library')).toBe(true);
  });

  it('als Pfad relativ zur Bereichs-Wurzel, wie options.table einer Verweis-Spalte', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM "Ausleihe/Loans.md"');
    expect(rs.rows.map((r) => [r.origin.table, r.origin.id, r.origin.path])).toEqual([
      ['Loans', 'r-00001', b.loansPath],
      ['Loans', 'r-00002', b.loansPath],
    ]);
  });

  it('mehrere Tabellen über OR; AND, Klammern und - wirken je Tabelle', async () => {
    const b = await bereich();
    const beide = menge(b, 'LIST RECORDS FROM "Library" OR "Loans"');
    expect(beide.rows).toHaveLength(8);
    expect(new Set(beide.rows.map((r) => r.origin.table))).toEqual(new Set(['Library', 'Loans']));
    // Ein Datensatz liegt in genau einer Tabelle.
    expect(menge(b, 'LIST RECORDS FROM "Library" AND "Loans"').rows).toEqual([]);
    const ohne = menge(b, 'LIST RECORDS FROM ("Library" OR "Loans") AND -"Loans"');
    expect(ids(ohne)).toEqual(GRUNDORDNUNG);
    // Doppelte Verneinung ist wieder eine genannte Tabelle.
    expect(ids(menge(b, 'LIST RECORDS FROM -(-"Library")'))).toEqual(GRUNDORDNUNG);
    // Dieselbe Tabelle beim Namen und als Pfad zählt einmal.
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" OR "Library.md"'))).toEqual(GRUNDORDNUNG);
  });

  it('eine unbekannte Tabelle ergibt die leere Menge, keinen Fehler (E4)', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM "Gibtsnicht"');
    expect(rs.rows).toEqual([]);
    expect(rs.state.queryError).toBeNull();
    expect(rs.state.status).toBe('ready');
    // Ein Dokument ohne Tabellen-Definition ist ebenso keine Tabelle.
    expect(menge(b, 'LIST RECORDS FROM "Notiz"').rows).toEqual([]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Gibtsnicht" OR "Library"'))).toEqual(GRUNDORDNUNG);
  });

  it('ohne Tabelle und mit den vier sinnlosen Quellen-Arten ein Abfrage-Fehler (AK2, AK6)', async () => {
    const b = await bereich();
    // Ohne genannte Tabelle nie das Ergebnis über alle Tabellen.
    for (const abfrage of [
      'LIST RECORDS',
      'TABLE RECORDS title',
      'LIST RECORDS FROM -"Library"',
      'LIST RECORDS FROM ""',
    ]) {
      const rs = menge(b, abfrage);
      expect(fehler(rs), abfrage).toBe('recordsSourceMissing');
      expect(rs.rows).toEqual([]);
    }
    const unzulaessig = [
      ['LIST RECORDS FROM #buch', '#buch'],
      ['LIST RECORDS FROM [[Library]]', '[[Library]]'],
      ['LIST RECORDS FROM outgoing([[Library]])', 'outgoing([[Library]])'],
      ['LIST RECORDS FROM [[]]', '[[]]'],
      ['LIST RECORDS FROM outgoing([[]])', 'outgoing([[]])'],
      ['LIST RECORDS FROM "Library" AND -#buch', '#buch'],
    ];
    for (const [abfrage, name] of unzulaessig) {
      const rs = menge(b, abfrage);
      expect(fehler(rs), abfrage).toBe('recordsSourceInvalid');
      expect(rs.state.queryError.name, abfrage).toBe(name);
    }
  });
});

// --- Werte, Bedingung, Sortierung, Begrenzung ---------------------------------

describe('Werte nach dem Typ ihrer Spalte (AK3)', () => {
  it('Zahl, Datum und Wahrheitswert typ-gerecht; ein Typ-Fehler ist «fehlend»', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS title, pages, acquired, available FROM "Library" SORT record.id',
    );
    const zeile = (id) => rs.rows.find((r) => r.origin.id === id).values;
    expect(zeile('r-00001')).toEqual([
      'Zauberberg',
      1000,
      { kind: 'date', ms: new Date(1924, 10, 20).getTime() },
      true,
    ]);
    expect(zeile('r-00002')[3]).toBe(false);
    expect(zeile('r-00004').slice(1)).toEqual([null, null, null]);
    expect(rs.columns.map((c) => c.valueType)).toEqual(['string', 'number', 'date', 'boolean']);
  });

  it('WHERE vergleicht Zahlen als Zahlen, Daten als Daten, Wahrheitswerte als solche', async () => {
    const b = await bereich();
    // Als Text läge «1000» vor «500» und fiele heraus; «viele» ist fehlend.
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE pages > 500'))).toEqual([
      'r-00002',
      'r-00006',
      'r-00001',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE acquired < date(1900-01-01)'))).toEqual([
      'r-00002',
    ]);
    // Der Wahrheitswert gilt als solcher; der Vergleich mit dem Text «true» ist
    // die Schreibweise der Sprache, weil ein nacktes Feld in der Bedingung
    // einen Vergleich trägt. Ein Typ-Fehler («vielleicht») trifft nie.
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE available = "true"'))).toEqual([
      'r-00003',
      'r-00001',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE available = "false"'))).toEqual([
      'r-00002',
      'r-00006',
      'r-00005',
    ]);
    // Selbstbezug: `this.` meint unverändert die Datei der Abfrage.
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE pages > this.minpages'))).toEqual([
      'r-00002',
      'r-00006',
      'r-00001',
    ]);
  });

  it('SORT ordnet typ-gerecht, fehlende Werte zuletzt; LIMIT schneidet danach', async () => {
    const b = await bereich();
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" SORT pages DESC'))).toEqual([
      'r-00001',
      'r-00006',
      'r-00002',
      'r-00003',
      'r-00005',
      'r-00004',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" SORT pages DESC LIMIT 2'))).toEqual([
      'r-00001',
      'r-00006',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" SORT acquired LIMIT 1'))).toEqual(['r-00002']);
  });

  it('ohne SORT nach Anzeige-Form, dann nach Kennung (AK3)', async () => {
    const b = await bereich();
    expect(ids(menge(b, 'TABLE RECORDS title FROM "Library"'))).toEqual(GRUNDORDNUNG);
  });

  it('ein Datensatz-Verweis ist ein Verweis-Wert mit Tabelle, Kennung, Anzeige-Form und Pfad', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS book, borrower FROM "Loans"');
    expect(rs.rows[0].values).toEqual([
      {
        kind: 'record',
        table: 'Library',
        id: 'r-00001',
        display: 'Zauberberg',
        path: b.libraryPath,
      },
      'Eva',
    ]);
    expect(rs.columns[0].valueType).toBe('record');
  });
});

// --- Eigene Angaben des Datensatzes ------------------------------------------

describe('record.id, record.table und file.* (AK4)', () => {
  it('record.id und record.table in Spalte, Bedingung und Sortierung, auch neben einem Feld id', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS record.id, record.table, id FROM "Library" WHERE record.id != "r-00001" SORT record.id DESC LIMIT 2',
    );
    expect(rs.rows.map((r) => r.values)).toEqual([
      ['r-00006', 'Library', 'A2'],
      ['r-00005', 'Library', ''],
    ]);
    // Ein leeres Text-Feld ist der leere Text, kein Typ-Fehler.
    expect(
      menge(b, 'TABLE RECORDS id FROM "Library" WHERE record.id = "r-00005"').rows[0].values,
    ).toEqual(['']);
  });

  it('record.id geht einem Feld vor, das wörtlich so heißt (Rangfolge)', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS record.id FROM "Library" WHERE record.id = "r-00001"');
    expect(rs.rows.map((r) => r.values)).toEqual([['r-00001']]);
    // Unmittelbar am Katalog: Die eigene Angabe gewinnt, jeder andere Name
    // liest die Zuordnung der Werte, ein fehlender ist «fehlend».
    const values = new Map([
      ['record.id', 'wörtlich'],
      ['record', 'Feld record'],
      ['id', 'Z1'],
    ]);
    const record = { table: 'Library', id: 'r-00001', values };
    expect(resolveRecordField('record.id', record)).toBe('r-00001');
    expect(resolveRecordField('record.table', record)).toBe('Library');
    expect(resolveRecordField('record', record)).toBe('Feld record');
    expect(resolveRecordField('id', record)).toBe('Z1');
    expect(resolveRecordField('gibtsnicht', record)).toBeNull();
  });

  it('file.* meint die Tabellen-Datei', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS file.name, file.folder, file.path FROM "Library" OR "Ausleihe/Loans.md" WHERE record.id = "r-00001" SORT file.name',
    );
    expect(rs.rows.map((r) => r.values)).toEqual([
      ['Library', '', 'Library.md'],
      ['Loans', 'Ausleihe', 'Ausleihe/Loans.md'],
    ]);
  });

  it('ein Name, den die Tabelle nicht führt, fällt nicht auf das Frontmatter der Tabellen-Datei zurück', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS db-table, gibtsnicht FROM "Library" LIMIT 1');
    expect(rs.rows[0].values).toEqual([null, null]);
  });
});

// --- Spalten ------------------------------------------------------------------

describe('Spalten: Alias, Beschriftung, Quelltext (AK5)', () => {
  it('Alias gewinnt, ein Feld zeigt seine Beschriftung, Ausdruck und Pfad ihren Quelltext', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS title, author AS "Wer", pages, pages * 2, record.id, gibtsnicht FROM "Library"',
    );
    expect(rs.columns.map((c) => [c.name, c.label, c.alias])).toEqual([
      ['title', 'Titel', null],
      ['author', 'Wer', 'Wer'],
      // Ohne Beschriftung der technische Name des Feldes (letzte Stufe von E21.4).
      ['pages', 'pages', null],
      ['pages * 2', 'pages * 2', null],
      ['record.id', 'record.id', null],
      ['gibtsnicht', 'gibtsnicht', null],
    ]);
  });

  it('Sprachwechsel zeigt die neue Beschriftung; ohne sie die Rückfall-Sprache der Datenbank', async () => {
    const b = await bereich();
    const de = menge(b, 'TABLE RECORDS title, author FROM "Library"', 'de-DE');
    const en = menge(b, 'TABLE RECORDS title, author FROM "Library"', 'en-US');
    const fr = menge(b, 'TABLE RECORDS title, author FROM "Library"', 'fr-FR');
    expect(de.columns.map((c) => c.label)).toEqual(['Titel', 'Autore']);
    expect(en.columns.map((c) => c.label)).toEqual(['Title', 'Autore']);
    expect(fr.columns.map((c) => c.label)).toEqual(['Titel', 'Auteur']);
  });

  it('ohne Steckbrief greift die erste geschriebene Fassung', async () => {
    const b = await bereich({ steckbrief: false });
    const rs = menge(b, 'TABLE RECORDS author FROM "Library"', 'de-DE');
    expect(rs.columns[0].label).toBe('Auteur');
  });

  it('die Spalten-Beschriftung ist sprachabhängig, der Name nicht', async () => {
    const b = await bereich();
    const de = menge(b, 'TABLE RECORDS title FROM "Library"', 'de-DE').columns[0];
    const en = menge(b, 'TABLE RECORDS title FROM "Library"', 'en-US').columns[0];
    expect([de.name, en.name]).toEqual(['title', 'title']);
    expect([de.label, en.label]).toEqual(['Titel', 'Title']);
  });
});

// --- Ausgeschlossen auf dieser Ebene -------------------------------------------

describe('Hervorhebung, Gruppierung und Layout-Klauseln (AK6)', () => {
  it('eine Hervorhebung in einer Spalte ist ein Abfrage-Fehler mit eigener Meldung', async () => {
    const b = await bereich();
    for (const abfrage of [
      'TABLE RECORDS bold(title) FROM "Library"',
      'TABLE RECORDS "Titel: " + bold(title) FROM "Library"',
      'LIST RECORDS bold(author) FROM "Library"',
    ]) {
      expect(fehler(menge(b, abfrage)), abfrage).toBe('recordsHighlight');
    }
    // In der Bedingung erreicht sie die Menge nicht und bleibt erlaubt.
    expect(menge(b, 'LIST RECORDS FROM "Library" WHERE bold(author) = "Mann"').rows).toHaveLength(
      1,
    );
  });

  // 4T-002076 (Epic 3E-000259): Die Gruppierung ist freigeschaltet (Fälle im
  // Block «Gruppen auf allen vier Ebenen» unten); die Layout-Klauseln bleiben
  // der Aufgaben-Liste vorbehalten.
  it('Layout-Klauseln ergeben die vorhandene Meldung, Gruppierung keinen Fehler', async () => {
    const b = await bereich();
    expect(fehler(menge(b, 'LIST RECORDS FROM "Library" GROUP BY author'))).toBeNull();
    for (const klausel of ['SHORT', 'HIDE due', 'SHOW urgency']) {
      expect(fehler(menge(b, `LIST RECORDS FROM "Library" ${klausel}`)), klausel).toBe(
        'layoutTasksOnly',
      );
    }
  });
});

// --- Ergebnismenge --------------------------------------------------------------

describe('Ergebnismenge der Datensatz-Ebene (AK8)', () => {
  it('Herkunft mit Tabelle, Kennung, Kopf-Pfad und Anzeige-Form; Format-Version 1', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM "Library"');
    expect(rs.formatVersion).toBe(1);
    expect(rs.type).toBe('list');
    expect(rs.rows[0].origin).toEqual({
      kind: 'record',
      table: 'Library',
      id: 'r-00002',
      path: b.libraryPath,
      display: 'Anna Karenina',
    });
    expect(rs.rows.at(-1).origin.display).toBeNull();
    expect(rs.rows.every((r) => r.taskInfo === null)).toBe(true);
    expect(rs.groups).toBeNull();
    expect(rs.state.hint).toBeNull();
    // Über die Prozess-Grenze unverändert.
    expect(structuredClone(rs)).toStrictEqual(rs);
  });

  it('Wünsche reisen mit, COLUMNS bei TABLE ergibt wie überall den Hinweis', async () => {
    const b = await bereich();
    expect(menge(b, 'LIST RECORDS FROM "Library" COLUMNS 3').wishes.layoutColumns).toBe(3);
    expect(menge(b, 'TABLE RECORDS WITHOUT ID title FROM "Library"').wishes.withoutId).toBe(true);
    expect(menge(b, 'TABLE RECORDS title FROM "Library" COLUMNS 2').state.hint).toBe(
      'columnsIgnored',
    );
  });

  it('mehrere Abfragen über dieselbe Tabelle lesen sie einmal (Story AK11)', async () => {
    const b = await bereich();
    menge(b, 'LIST RECORDS FROM "Library"');
    const gelesen = readCount();
    menge(b, 'TABLE RECORDS title, pages FROM "Library" WHERE pages > 500');
    menge(b, 'LIST RECORDS FROM "Library" SORT pages DESC LIMIT 1', 'en-US');
    expect(readCount()).toBe(gelesen);
  });

  it('die Prüfung der Abfrage liest keine Datei', () => {
    const ast = parseQuery('LIST RECORDS FROM #buch').ast;
    const antwort = recordsQueryFor({
      filePath: '/gibt/es/nicht.md',
      ast,
      root: '/gibt/es',
      entry: { fileCount: 0 },
      locale: 'de-DE',
    });
    expect(antwort.resultSet.state.queryError.code).toBe('recordsSourceInvalid');
  });
});

// --- Ungespeicherter Stand und Folge-Dateien ------------------------------------

// --- Gruppierung -------------------------------------------------------------------

// 4T-002076 (Epic 3E-000259, Story 4S-001038): GROUP BY bildet auf allen vier
// Ebenen und in Liste wie Tabelle Gruppen über denselben Zeilen-Bau, mit der
// Regel der Aufgaben-Liste: Schlüssel ist die Text-Form, Wert der erste
// Roh-Wert, Ordnung nach der Werte-Ordnung, die Gruppe ohne Wert zuletzt,
// mehrstufig. Datei- und Block-Ebene stehen hier als Gegenprobe desselben
// Zeilen-Baus; die Aufgaben-Ebene prüft `perspective-query-tasks.test.js`.
// Jede Menge läuft über `menge` durch den Prüfer des Format-Vertrags.
describe('Gruppen auf allen vier Ebenen (4T-002076)', () => {
  const struktur = (gruppen) =>
    gruppen && gruppen.map((g) => ({ value: g.value, rows: g.rows, groups: struktur(g.groups) }));

  it('Datensatz-Ebene: Gruppen in Liste und Tabelle, mehrstufig, Zeilen vollständig', async () => {
    const b = await bereich();
    const liste = menge(b, 'LIST RECORDS FROM "Library" GROUP BY author');
    expect(ids(liste)).toEqual(GRUNDORDNUNG);
    expect(struktur(liste.groups)).toEqual([
      { value: 'Anonym', rows: [5], groups: null },
      { value: 'Kafka', rows: [2], groups: null },
      { value: 'Mann', rows: [4], groups: null },
      { value: 'Niemand', rows: [3], groups: null },
      { value: 'Tolstoi', rows: [0, 1], groups: null },
    ]);
    // 4T-002078: In der gruppierten Tabelle steht nur Gruppiertes oder Aggregiertes.
    const tabelle = menge(b, 'TABLE RECORDS count() FROM "Library" GROUP BY author, record.id');
    expect(tabelle.type).toBe('table');
    expect(tabelle.groups.map((g) => g.value)).toEqual(liste.groups.map((g) => g.value));
    expect(struktur(tabelle.groups.at(-1).groups)).toEqual([
      { value: 'r-00002', rows: [0], groups: null },
      { value: 'r-00006', rows: [1], groups: null },
    ]);
  });

  it('SORT und LIMIT laufen vor der Gruppen-Bildung', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM "Library" GROUP BY author SORT pages DESC LIMIT 3');
    expect(ids(rs)).toEqual(['r-00001', 'r-00006', 'r-00002']);
    expect(struktur(rs.groups)).toEqual([
      { value: 'Mann', rows: [0], groups: null },
      { value: 'Tolstoi', rows: [1, 2], groups: null },
    ]);
  });

  it('ein Datensatz-Verweis bleibt als Gruppen-Wert ein Verweis; ohne Verweis zuletzt', async () => {
    const b = await bereich();
    const mehr = [...row('r-00003', ['r-00001', 'Otto']), ...row('r-00004', ['', 'Zoe'])];
    const loans = LOANS.replace('```\n', [...mehr, '```', ''].join('\n'));
    // Nicht-Vakuitäts-Probe der Ersetzung.
    expect(loans).toContain('Zoe');
    setBufferOverlay(b.loansPath, loans);
    const rs = menge(b, 'TABLE RECORDS book, count() FROM "Loans" GROUP BY book');
    expect(rs.rows.map((r) => r.origin.display)).toEqual(['Eva', 'Max', 'Otto', 'Zoe']);
    const verweis = (id, display) => ({
      kind: 'record',
      table: 'Library',
      id,
      display,
      path: b.libraryPath,
    });
    expect(struktur(rs.groups)).toEqual([
      { value: verweis('r-00003', 'kurz'), rows: [1], groups: null },
      { value: verweis('r-00001', 'Zauberberg'), rows: [0, 2], groups: null },
      { value: null, rows: [3], groups: null },
    ]);
  });

  it('Datei- und Block-Ebene: ein Listen-Wert bildet eine Gruppe je Kombination', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqg-'));
    tmpDirs.push(dir);
    const mdd = (blocks) =>
      JSON.stringify({
        schemaVersion: 1,
        history: { anchors: [], packets: [] },
        blockData: blocks,
      });
    const block = (status) => ({ values: { status }, updated: '2026-10-03T10:00:00Z' });
    write(dir, 'A.md', '---\nfarben: [rot, blau]\n---\n# A\n\nEins. ^a1\n\nZwei. ^a2\n');
    write(dir, 'A.mdd', mdd({ a1: block('offen'), a2: block('zu') }));
    write(dir, 'B.md', '---\nfarben: [blau, rot]\n---\n# B\n\nDrei. ^b1\n');
    write(dir, 'B.mdd', mdd({ b1: block('offen') }));
    write(dir, 'C.md', '---\nfarben: [rot, blau]\n---\n# C\n');
    const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
    const b = { root: await indexFor(abfragen), abfragen };
    // Dateien nach Name: A, Abfragen, B, C. Aufgeteilt nach Elementen wird nicht.
    for (const abfrage of ['LIST GROUP BY farben', 'TABLE count() GROUP BY farben']) {
      expect(struktur(menge(b, abfrage).groups), abfrage).toEqual([
        { value: ['blau', 'rot'], rows: [2], groups: null },
        { value: ['rot', 'blau'], rows: [0, 3], groups: null },
        { value: null, rows: [1], groups: null },
      ]);
    }
    // Blöcke nach Datei und Anker: A#^a1, A#^a2, B#^b1.
    for (const abfrage of ['LIST BLOCKS GROUP BY status', 'TABLE BLOCKS status GROUP BY status']) {
      const rs = menge(b, abfrage);
      expect(rs.scope, abfrage).toBe('blocks');
      expect(struktur(rs.groups), abfrage).toEqual([
        { value: 'offen', rows: [0, 2], groups: null },
        { value: 'zu', rows: [1], groups: null },
      ]);
    }
  });
});

describe('Ungespeicherter Stand und geteilte Tabelle (Story AK8, AK10)', () => {
  it('ein geänderter, neuer und gelöschter Datensatz erscheint ohne Speichern', async () => {
    const b = await bereich();
    const geaendert = LIBRARY.replace('| 120', '| 777')
      .replace(/\|- id="r-00006"[^`]*?(?=```)/, '')
      .replace(
        '```\n',
        ['|- id="r-00007"', '| Neu', '| Autorin', '| 640', '|', '|', '|', '|', '```', ''].join(
          '\n',
        ),
      );
    // Nicht-Vakuitäts-Probe der Ersetzungen.
    expect(geaendert).toContain('| 777');
    expect(geaendert).not.toContain('r-00006');
    expect(geaendert).toContain('r-00007');
    setBufferOverlay(b.libraryPath, geaendert);
    const rs = menge(b, 'TABLE RECORDS pages FROM "Library" WHERE pages > 500 SORT pages');
    expect(rs.rows.map((r) => [r.origin.id, r.values[0]])).toEqual([
      ['r-00007', 640],
      ['r-00003', 777],
      ['r-00002', 864],
      ['r-00001', 1000],
    ]);
    // Die Platte ist unverändert; ohne Puffer gilt wieder sie.
    clearAllBufferOverlays();
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE pages > 500'))).toEqual([
      'r-00002',
      'r-00006',
      'r-00001',
    ]);
  });

  it('eine auf Folge-Dateien verteilte Tabelle liefert die Datensätze aller Dateien', async () => {
    const zeilen = [];
    for (let i = 1; i <= 40; i++) {
      zeilen.push(
        ...row(`r-${String(i).padStart(5, '0')}`, [`K-${i}`, `Titel ${i} ${'x'.repeat(60)}`]),
      );
    }
    const books = table(
      ['    - name: code', '    - name: title'],
      ['  key: code', '  display: code'],
      zeilen,
    );
    const plan = planeZerlegung({
      text: books,
      base: 'Books',
      schwelle: 1500,
      segmentFelder: ['code', 'title'],
    });
    expect(plan.teile.length).toBeGreaterThanOrEqual(3);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqr-'));
    tmpDirs.push(dir);
    for (const teil of plan.teile) write(dir, `${teil.basename}.md`, teil.text);
    const abfragen = write(dir, 'Abfragen.md', ABFRAGEN);
    const b = { root: await indexFor(abfragen), abfragen };
    const rs = menge(b, 'LIST RECORDS FROM "Books" WHERE record.id >= "r-00039" OR code = "K-1"');
    expect(ids(rs)).toEqual(['r-00001', 'r-00039', 'r-00040']);
    expect(menge(b, 'LIST RECORDS FROM "Books"').rows).toHaveLength(40);
  });
});
