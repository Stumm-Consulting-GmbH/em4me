// 4T-002041 (Epic 3E-000258): Pfad-Navigation über Verweis-Felder auf der
// Datensatz-Ebene der Abfrage-Sprache (E6.2, Festlegungen 7 und 8 des Epics).
//
// Geprüft wird über den echten Erzeuger aller Ebenen (`frontmatterQueryFor`) auf
// einem Wegwerf-Bereich mit vier Tabellen: Verlage, Bücher mit Verweis auf den
// Verlag, Ausleihen mit Verweis auf das Buch und Personen mit einem Selbstbezug.
// Jede erzeugte Ergebnismenge läuft durch den Prüfer des Format-Vertrags
// (`validateResultSet`) und muss ohne Befund bleiben.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// `perspective-query-records.test.js`; der Aus-Zustand eines Pfads steht in
// `datensatz-abfrage-aus-zustand.test.js`, weil er den Schalter umlegt.
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
import { validateResultSet } from '../../src/shared/query/result-set.js';
import { formatValueSegments } from '../../src/shared/query/query-format.js';
// Statisch importiert, damit die Module samt ihren Importen in der Import-Kette
// dieser Prüfdatei stehen (Auswahl des Prüf-Ausschnitts).
import { HINT_REF_AMBIGUOUS } from '../../src/main/index/query-records.js';
import { resolveRecordField, recordRefEquals } from '../../src/shared/query/query-record-fields.js';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';

const require_ = createRequire(import.meta.url);
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { clearCaches, readCount } = require_('../../src/main/index/record-table-read.js');

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

function ref(name, target) {
  return [
    `    - name: ${name}`,
    '      type: record',
    '      options:',
    `        table: ${target}`,
  ];
}

// Verlage mit dem Namen als einteiligem Schlüssel; «Fischer» steht zweimal, ein
// Verweis mit diesem Schlüssel-Wert ist deshalb mehrdeutig.
const PUBLISHERS = table(
  ['    - name: name', '    - name: city'],
  ['  key: name', '  display: name'],
  [
    ...row('r-00001', ['Hanser', 'München']),
    ...row('r-00002', ['Fischer', 'Frankfurt']),
    ...row('r-00003', ['Fischer', 'Berlin']),
  ],
);

// Bücher mit dem Titel als Schlüssel. Der Verlag steht als Kennung, als
// Schlüssel-Wert, mehrdeutig und leer; das Feld `publisher.name` heißt wörtlich
// so wie ein Pfad (ein Punkt im Feld-Namen ist zulässig).
const LIBRARY = table(
  [
    '    - name: title',
    '    - name: author',
    '    - name: pages',
    '      type: number',
    ...ref('publisher', 'Publishers'),
    '    - name: publisher.name',
  ],
  ['  key: title', '  display: title'],
  [
    ...row('r-00001', ['Solaris', 'Lem', '204', 'r-00001', 'wörtlich']),
    ...row('r-00002', ['Zauberberg', 'Mann', '1000', 'Fischer', '']),
    ...row('r-00003', ['Kurz', 'Kafka', '120', '', '']),
    ...row('r-00004', ['Anna Karenina', 'Tolstoi', '864', 'Hanser', '']),
  ],
);

// Ausleihen: das Buch als Kennung, als Schlüssel-Wert, in Kurzform, leer, ins
// Leere. Die Anzeige-Form ist der Name; ohne SORT gilt deshalb Eva, Ida, Lea,
// Max, Tom, Uwe.
const LOANS = table(
  [...ref('book', 'Library'), '    - name: borrower'],
  ['  display: borrower'],
  [
    ...row('r-00001', ['r-00001', 'Eva']),
    ...row('r-00002', ['Solaris', 'Max']),
    ...row('r-00003', ['r-4', 'Ida']),
    ...row('r-00004', ['', 'Tom']),
    ...row('r-00005', ['r-00099', 'Uwe']),
    ...row('r-00006', ['Zauberberg', 'Lea']),
  ],
);

// Personen mit Selbstbezug: Alice ist ihre eigene Vorgesetzte. Der Verweis
// `former.boss` trägt einen Punkt im Namen und führt selbst weiter.
const PERSONS = table(
  ['    - name: name', ...ref('boss', 'Persons'), ...ref('former.boss', 'Persons')],
  ['  display: name'],
  [
    ...row('r-00001', ['Alice', 'r-00001', '']),
    ...row('r-00002', ['Bob', 'r-00001', '']),
    ...row('r-00003', ['Carol', 'r-00002', 'r-00001']),
  ],
);

// Eine Notiz, deren Frontmatter Punkt-Namen trägt: Auf der Datei-Ebene bleibt
// ein Punkt-Name ein Frontmatter-Name.
const NOTIZ = '---\nbook.title: Solaris\nbook: r-00001\n---\n# Notiz\n';

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

async function bereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqrp-'));
  tmpDirs.push(dir);
  const publishersPath = write(dir, 'Verlage/Publishers.md', PUBLISHERS);
  const libraryPath = write(dir, 'Library.md', LIBRARY);
  const loansPath = write(dir, 'Ausleihe/Loans.md', LOANS);
  write(dir, 'Persons.md', PERSONS);
  write(dir, 'Notiz.md', NOTIZ);
  const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
  const root = await indexFor(abfragen);
  return { root, abfragen, publishersPath, libraryPath, loansPath };
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
function menge(b, abfrage) {
  const payload = frontmatterQueryFor(b.abfragen, abfrage, undefined, undefined, 'de-DE');
  expect(Object.keys(payload)).toEqual(['resultSet']);
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  expect(payload.resultSet.state.queryError, abfrage).toBeNull();
  return payload.resultSet;
}

const ids = (rs) => rs.rows.map((r) => r.origin.id);
const werte = (rs) => rs.rows.map((r) => r.values);

// --- Vorwärts: ein und mehrere Stufen ------------------------------------------

describe('Pfad über Verweis-Felder (AK1)', () => {
  it('ein Segment liest Titel und Autor des verwiesenen Buches, gleich über Kennung, Kurzform und Schlüssel', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS book.title, book.author, borrower FROM "Loans"');
    expect(werte(rs)).toEqual([
      ['Solaris', 'Lem', 'Eva'],
      ['Anna Karenina', 'Tolstoi', 'Ida'],
      ['Zauberberg', 'Mann', 'Lea'],
      ['Solaris', 'Lem', 'Max'],
      [null, null, 'Tom'],
      [null, null, 'Uwe'],
    ]);
    // Ein Pfad zeigt seinen Quelltext als Spalten-Beschriftung, ein Feld seine.
    expect(rs.columns.map((c) => c.label)).toEqual(['book.title', 'book.author', 'borrower']);
    expect(rs.state.hint).toBeNull();
  });

  it('zwei Stufen über zwei Tabellen liefern den Wert am Ende der Kette', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS book.publisher.city, book.pages FROM "Loans"');
    expect(werte(rs)).toEqual([
      ['München', 204],
      ['München', 864],
      [null, 1000],
      ['München', 204],
      [null, null],
      [null, null],
    ]);
  });

  it('ein Pfad, der auf einem Verweis endet, liefert den Verweis mit Klick-Ziel', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS book.publisher FROM "Loans" WHERE record.id = "r-00001"');
    const verlag = rs.rows[0].values[0];
    expect(verlag).toEqual({
      kind: 'record',
      table: 'Publishers',
      id: 'r-00001',
      display: 'Hanser',
      path: b.publishersPath,
    });
    expect(formatValueSegments(verlag)).toEqual([
      { record: { path: b.publishersPath, table: 'Publishers', id: 'r-00001', name: 'Hanser' } },
    ]);
    expect(rs.columns[0].valueType).toBe('record');
  });
});

describe('Pfad in Bedingung, Sortierung und Spalte (AK2)', () => {
  it('ein Pfad wirkt in WHERE und SORT wie in der Spalte', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS book.title FROM "Loans" WHERE book.publisher.city = "München" SORT book.title DESC',
    );
    // Gleicher Titel: die Grundordnung bleibt (Eva vor Max).
    expect(ids(rs)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(werte(rs).map((v) => v[0])).toEqual(['Solaris', 'Solaris', 'Anna Karenina']);
    // Eine Zahl hinter dem Verweis vergleicht als Zahl.
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book.pages > 500'))).toEqual([
      'r-00003',
      'r-00006',
    ]);
    // Ein fehlender Wert sortiert unabhängig von der Richtung zuletzt.
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" SORT book.pages'))).toEqual([
      'r-00001',
      'r-00002',
      'r-00003',
      'r-00006',
      'r-00004',
      'r-00005',
    ]);
  });

  it('SORT nach einem Verweis ordnet nach seiner Anzeige-Form, fehlende zuletzt', async () => {
    const b = await bereich();
    // Anna Karenina (Ida), Solaris (Eva, Max), Zauberberg (Lea), ohne Buch (Tom, Uwe).
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" SORT book'))).toEqual([
      'r-00003',
      'r-00001',
      'r-00002',
      'r-00006',
      'r-00004',
      'r-00005',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book < "B"'))).toEqual(['r-00003']);
  });
});

// --- Rückwärts: Vergleich eines Verweises mit Text ------------------------------------

describe('Gegenrichtung über eine Bedingung auf dem Verweis-Feld (AK3, Festlegung 8)', () => {
  it('Kennung in beiden Schreibweisen und Schlüssel-Wert treffen dieselben Ausleihen', async () => {
    const b = await bereich();
    // Eva verweist über die Kennung, Max über den Schlüssel-Wert auf «Solaris».
    for (const text of ['r-00001', 'r-1', 'Solaris']) {
      const abfrage = `LIST RECORDS FROM "Loans" WHERE book = "${text}"`;
      expect(ids(menge(b, abfrage)), abfrage).toEqual(['r-00001', 'r-00002']);
    }
    // Ida verweist in Kurzform, Lea über den Schlüssel-Wert.
    expect(
      ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book IN ("r-00004", "Zauberberg")')),
    ).toEqual(['r-00003', 'r-00006']);
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book NOT IN ("Solaris")'))).toEqual([
      'r-00003',
      'r-00006',
      'r-00004',
      'r-00005',
    ]);
  });

  it('die Anzeige-Form ist nicht die Vergleichs-Form; der Schlüssel-Wert gilt genau', async () => {
    const b = await bereich();
    // «Solaris» ist hier Schlüssel UND Anzeige-Form; die Verlage zeigen den
    // Unterschied: Der Vergleich trifft über den Schlüssel, nie über die Stadt.
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE publisher = "Hanser"'))).toEqual([
      'r-00004',
      'r-00001',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Library" WHERE publisher = "München"'))).toEqual([]);
    // Wie die Auflösung einer Verweis-Zelle: ungetrimmt und mit Schreibung.
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book = "solaris"'))).toEqual([]);
    // Ein Verweis ins Leere, ein leerer Verweis und leerer Text treffen nichts.
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book = "r-00099"'))).toEqual([]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book = ""'))).toEqual([]);
    // Ungleichheit: ein fehlender Verweis ist ungleich, wie jedes fehlende Feld.
    expect(ids(menge(b, 'LIST RECORDS FROM "Loans" WHERE book != "Solaris"'))).toEqual([
      'r-00003',
      'r-00006',
      'r-00004',
      'r-00005',
    ]);
  });

  it('zwei Verweise sind gleich, wenn sie denselben Datensatz meinen', async () => {
    const b = await bereich();
    // Alice ist ihre eigene Vorgesetzte, Bobs Vorgesetzte ist Alice; bei Carol
    // sind Vorgesetzter (Bob) und dessen Vorgesetzte (Alice) verschieden.
    expect(ids(menge(b, 'LIST RECORDS FROM "Persons" WHERE boss = boss.boss'))).toEqual([
      'r-00001',
      'r-00002',
    ]);
    expect(ids(menge(b, 'LIST RECORDS FROM "Persons" WHERE boss != boss.boss'))).toEqual([
      'r-00003',
    ]);
  });
});

// --- Ränder: fehlend, mehrdeutig, wörtlich, Selbstbezug ----------------------------------

describe('Leer, ins Leere und mehrdeutig (AK4)', () => {
  it('ergeben «fehlend» ohne Fehler; mehrdeutig setzt den Hinweis am Block', async () => {
    const b = await bereich();
    // Zauberberg verweist mit «Fischer» auf zwei Verlage.
    const rs = menge(b, 'TABLE RECORDS book.publisher.city FROM "Loans"');
    expect(werte(rs).map((v) => v[0])).toEqual(['München', 'München', null, 'München', null, null]);
    expect(rs.state.hint).toBe(HINT_REF_AMBIGUOUS);
    // Direkt gelesen ebenso.
    expect(menge(b, 'TABLE RECORDS publisher FROM "Library"').state.hint).toBe(HINT_REF_AMBIGUOUS);
    // Auch eine Bedingung, deren Zeile danach herausfällt, stützt sich auf den
    // mehrdeutigen Verweis und nennt ihn.
    const gefiltert = menge(b, 'LIST RECORDS FROM "Library" WHERE publisher.city = "Berlin"');
    expect(gefiltert.rows).toEqual([]);
    expect(gefiltert.state.hint).toBe(HINT_REF_AMBIGUOUS);
  });

  it('ohne mehrdeutigen Verweis kein Hinweis, auch bei leeren und ins Leere zeigenden', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS book, book.title FROM "Loans"');
    expect(werte(rs)[4]).toEqual([null, null]);
    expect(werte(rs)[5]).toEqual([null, null]);
    expect(rs.state.hint).toBeNull();
    // Ein bereits gesetzter Hinweis bleibt stehen.
    expect(menge(b, 'TABLE RECORDS book.publisher.city FROM "Loans" COLUMNS 2').state.hint).toBe(
      'columnsIgnored',
    );
  });

  it('ein Pfad über ein Feld, das kein Verweis ist, und über ein unbekanntes Feld ist «fehlend»', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE RECORDS borrower.name, book.author.name, book.nichts FROM "Loans"');
    for (const v of werte(rs)) expect(v).toEqual([null, null, null]);
    expect(rs.state.hint).toBeNull();
  });
});

describe('Wörtliches Feld mit Punkt und Selbstbezug (AK4, Story AK6)', () => {
  it('ein Feld, das wörtlich so heißt, geht dem Pfad vor; der übrige Pfad navigiert', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS publisher.name, publisher.city FROM "Library" WHERE record.id = "r-00001"',
    );
    expect(werte(rs)).toEqual([['wörtlich', 'München']]);
    // record.id meint auch hinter einem Verweis die Kennung des Ziels.
    expect(werte(menge(b, 'TABLE RECORDS book.record.id FROM "Loans" LIMIT 1'))).toEqual([
      ['r-00001'],
    ]);
    // Ein Verweis-Feld mit Punkt im Namen führt weiter: Der längste Anfang, der
    // ein Feld nennt, liefert den Verweis.
    expect(werte(menge(b, 'TABLE RECORDS former.boss.name FROM "Persons"'))).toEqual([
      [null],
      [null],
      ['Alice'],
    ]);
  });

  it('ein Pfad über einen Selbstbezug endet nach der genannten Segment-Zahl', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS boss.name, boss.boss.name, boss.boss.boss.boss.boss.name FROM "Persons"',
    );
    expect(werte(rs)).toEqual([
      ['Alice', 'Alice', 'Alice'],
      ['Alice', 'Alice', 'Alice'],
      ['Bob', 'Alice', 'Alice'],
    ]);
  });
});

// --- Ungespeicherter Stand und Lese-Vorgänge ------------------------------------------

describe('Ungespeicherter Stand und Lese-Vorgänge (AK5, Offene Punkte «Leistung»)', () => {
  it('ein geänderter Titel und ein geänderter Verweis gehen ohne Speichern ein', async () => {
    const b = await bereich();
    setBufferOverlay(b.libraryPath, LIBRARY.replace('| Solaris', '| Solaris (Neu)'));
    const loans = LOANS.replace('|- id="r-00004"\n| \n', '|- id="r-00004"\n| r-00003\n');
    expect(loans).not.toBe(LOANS); // Nicht-Vakuitäts-Probe der Ersetzung
    setBufferOverlay(b.loansPath, loans);
    const rs = menge(b, 'TABLE RECORDS book.title FROM "Loans"');
    // Eva über die Kennung: neuer Titel. Max über den alten Schlüssel-Wert: ins
    // Leere, weil der Titel der Schlüssel ist. Tom: neu auf «Kurz».
    expect(werte(rs).map((v) => v[0])).toEqual([
      'Solaris (Neu)',
      'Anna Karenina',
      'Zauberberg',
      null,
      'Kurz',
      null,
    ]);
    // Die Platte ist unverändert.
    expect(fs.readFileSync(b.libraryPath, 'utf8')).not.toContain('(Neu)');
  });

  it('jede Tabelle wird je Lauf einmal gelesen, beim nächsten Lauf aus dem Zwischenspeicher', async () => {
    const b = await bereich();
    clearCaches();
    menge(b, 'TABLE RECORDS book.publisher.city, book.title FROM "Loans" SORT book.author');
    // Ausleihen, Bücher und Verlage: je einmal, obwohl sechs Zeilen drei Pfade lesen.
    expect(readCount()).toBe(3);
    menge(b, 'LIST RECORDS FROM "Loans" WHERE book.publisher.city = "München"');
    expect(readCount()).toBe(3);
  });
});

// --- Die drei übrigen Ebenen und die Regel ohne Navigator ------------------------------

describe('Punkt-Namen außerhalb der Datensatz-Ebene (AK6)', () => {
  it('auf der Datei-Ebene bleibt ein Punkt-Name ein Frontmatter-Name', async () => {
    const b = await bereich();
    const rs = menge(b, 'TABLE book.title WHERE book.title = "Solaris"');
    expect(rs.rows.map((r) => r.origin.name)).toEqual(['Notiz']);
    expect(rs.rows[0].values).toEqual(['Solaris']);
    expect(menge(b, 'LIST WHERE book = "Solaris"').rows).toEqual([]);
  });

  it('ohne Navigator liest die Feld-Auflösung einen Punkt-Namen wörtlich', () => {
    const values = new Map([
      ['book', { kind: 'record', table: 'Library', id: 'r-00001', display: 'X', path: '/x.md' }],
      ['a.b', 'wörtlich'],
    ]);
    const record = { table: 'Loans', id: 'r-00001', values };
    expect(resolveRecordField('book.title', record)).toBeNull();
    expect(resolveRecordField('a.b', record)).toBe('wörtlich');
    expect(recordRefEquals(values.get('book'), 'r-00001', null)).toBeUndefined();
    // Zwei Verweise oder kein Verweis: Die Regel greift nicht.
    const nav = { matches: () => true };
    expect(recordRefEquals('a', 'b', nav)).toBeUndefined();
    expect(recordRefEquals(values.get('book'), values.get('book'), nav)).toBeUndefined();
    expect(recordRefEquals(values.get('book'), null, nav)).toBeUndefined();
    expect(recordRefEquals(values.get('book'), 7, nav)).toBe(true);
  });
});

// --- Messlauf auf Zuruf ---------------------------------------------------------------

// `EM4ME_MESSLAUF=1 npx vitest run test/unit/perspective-query-record-paths.test.js`:
// 2000 Ausleihen, deren Pfad über 2000 Bücher auf 50 Verlage führt. Gemessen
// wird die ganze Abfrage ohne Zwischenspeicher (kalt) und mit (warm), Median
// aus fünf Läufen nach einem Aufwärm-Lauf.
function largeBereich(count) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqrp-mess-'));
  tmpDirs.push(dir);
  const verlage = [];
  for (let i = 1; i <= 50; i++) {
    verlage.push(...row(`r-${String(i).padStart(5, '0')}`, [`Verlag ${i}`, `Stadt ${i % 7}`]));
  }
  const buecher = [];
  const ausleihen = [];
  for (let i = 1; i <= count; i++) {
    const id = `r-${String(i).padStart(5, '0')}`;
    buecher.push(
      ...row(id, [
        `Titel ${i}`,
        `Autor ${i % 97}`,
        `${100 + (i % 900)}`,
        `Verlag ${1 + (i % 50)}`,
        '',
      ]),
    );
    ausleihen.push(...row(id, [i % 2 === 0 ? id : `Titel ${count + 1 - i}`, `Person ${i}`]));
  }
  write(
    dir,
    'Publishers.md',
    table(['    - name: name', '    - name: city'], ['  key: name', '  display: name'], verlage),
  );
  write(
    dir,
    'Library.md',
    LIBRARY.split('```perspective-records')[0] +
      ['```perspective-records', ...buecher, '```', ''].join('\n'),
  );
  write(
    dir,
    'Loans.md',
    LOANS.split('```perspective-records')[0] +
      ['```perspective-records', ...ausleihen, '```', ''].join('\n'),
  );
  return write(dir, 'Abfragen.md', '# Abfragen\n');
}

describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Pfad-Navigation (4T-002041)', () => {
  it(
    'misst einen Pfad über zwei Stufen bei 2000 Ausleihen und 2000 Büchern',
    async () => {
      const abfragen = largeBereich(2000);
      await indexFor(abfragen);
      const abfrage =
        'TABLE RECORDS book.title, book.publisher.city FROM "Loans" WHERE book.pages > 300 SORT book.title';
      const lauf = (kalt) => {
        const times = [];
        for (let run = 0; run < 5; run++) {
          if (kalt) clearCaches();
          const start = performance.now();
          const { resultSet } = frontmatterQueryFor(
            abfragen,
            abfrage,
            undefined,
            undefined,
            'de-DE',
          );
          times.push(performance.now() - start);
          expect(resultSet.rows.length).toBeGreaterThan(1000);
        }
        return times.sort((x, y) => x - y);
      };
      lauf(true); // Aufwärm-Lauf
      const lines = [true, false].map((kalt) => {
        const times = lauf(kalt);
        return (
          `${kalt ? 'kalt' : 'warm'}: Median ${times[2].toFixed(1)} ms ` +
          `(Läufe ${times.map((t) => t.toFixed(1)).join(', ')} ms)`
        );
      });
      // Die Zeilen sind das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
      // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
      // eslint-disable-next-line no-console
      console.log(`Messlauf Pfad-Navigation:\n${lines.join('\n')}`);
    },
    PROZESS_ZEITLIMIT,
  );
});
