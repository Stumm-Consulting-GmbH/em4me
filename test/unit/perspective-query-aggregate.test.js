// 4T-002078 (Epic 3E-000259): Aggregat-Funktionen nach Position und die
// gruppierte Tabelle (Konzept-Entscheidung E6.4, Festlegungen 3 bis 7, 9 und 10,
// F1 Option A, F3a, F5 Option A, Grenze aus F7).
//
// Geprüft wird über den echten Erzeuger aller Ebenen (`frontmatterQueryFor`) auf
// Wegwerf-Bereichen, damit Parser, Funktions-Prüfung, Prüfung der
// Aggregat-Stellen, Gruppen-Bildung, Werte über der Gruppe und Reihenfolge
// zusammen stehen. Jede erzeugte Ergebnismenge läuft durch den Prüfer des
// Format-Vertrags (`validateResultSet`) und muss ohne Befund bleiben.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// `perspective-query-records.test.js`. Der Messlauf läuft nur auf Zuruf, nach
// dem Muster von `record-table-read.test.js`:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/perspective-query-aggregate.test.js`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { parseExpression } from '../../src/shared/query/perspective-query.js';
import { validateQuery } from '../../src/shared/query/query-functions.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
// Statisch importiert, damit das Modul samt seinen Importen in der Import-Kette
// dieser Prüfdatei steht (Auswahl des Prüf-Ausschnitts).
import {
  aggregateGroups,
  checkGroupedTable,
  exprKey,
  havingGroups,
} from '../../src/shared/query/query-aggregate.js';
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';

const require_ = createRequire(import.meta.url);
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { clearCaches } = require_('../../src/main/index/record-table-read.js');

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
  return [`|- id="${id}"`, ...cells.map((c) => `| ${c}`.trimEnd())];
}

// Die Bibliothek: Le Guin mit drei Büchern, Lem mit einem Buch ohne Seiten und
// Datum, Tolstoi zweimal mit demselben Titel, ein Buch ohne Autor.
const LIBRARY = table(
  [
    '    - name: title',
    '    - name: author',
    '      label:',
    '        de: Autor',
    '        en: Author',
    '    - name: pages',
    '      type: number',
    '    - name: acquired',
    '      type: date',
  ],
  ['  display: title'],
  [
    ...row('r-00001', ['A Wizard of Earthsea', 'Le Guin', '200', '1968-01-01']),
    ...row('r-00002', ['The Dispossessed', 'Le Guin', '400', '1974-05-01']),
    ...row('r-00003', ['The Left Hand of Darkness', 'Le Guin', '300', '1969-03-01']),
    ...row('r-00004', ['Solaris', 'Lem', '250', '1961-06-01']),
    ...row('r-00005', ['The Cyberiad', 'Lem', '', '']),
    ...row('r-00006', ['Anna Karenina', 'Tolstoi', '864', '1878-01-01']),
    ...row('r-00007', ['Anna Karenina', 'Tolstoi', '900', '1900-01-01']),
    ...row('r-00008', ['Ohne Autor', '', '50', '']),
  ],
);

// Ausleihen mit Verweis auf die Bibliothek; zwei verschiedene Bücher heißen
// «Anna Karenina».
const LOANS = table(
  [
    '    - name: book',
    '      type: record',
    '      options:',
    '        table: Library',
    '    - name: borrower',
  ],
  ['  display: borrower'],
  [
    ...row('r-00001', ['r-00006', 'Eva']),
    ...row('r-00002', ['r-00007', 'Max']),
    ...row('r-00003', ['r-00006', 'Otto']),
    ...row('r-00004', ['r-00001', 'Zoe']),
  ],
);

// Dateien mit Listen- und Datums-Werten im Frontmatter. Nach Name: A, Abfragen,
// B, C, D; `Abfragen` trägt keine Kategorie und bildet die Gruppe ohne Wert.
const DATEIEN = {
  'A.md': '---\nkategorie: x\nstatus: offen\npunkte: [1, 2]\ndatum: 2026-01-05\n---\n# A\n',
  'B.md': '---\nkategorie: x\nstatus: zu\npunkte: 4\ndatum: 2025-12-31\n---\n# B\n',
  'C.md': '---\nkategorie: y\nstatus: offen\npunkte: [10]\ndatum: 2026-03-01\n---\n# C\n',
  'D.md': '---\nkategorie: y\nstatus: offen\n---\n# D\n',
};

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

async function bereich(dateien) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqa-'));
  tmpDirs.push(dir);
  const pfade = {};
  for (const [rel, inhalt] of Object.entries(dateien)) pfade[rel] = write(dir, rel, inhalt);
  const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
  await indexFor(abfragen);
  return { abfragen, pfade };
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

const taskEnv = () => ({
  enabled: true,
  globalFilter: '',
  statusTypeOf: createTaskStatusTypeResolver(null),
});

// Die Antwort des Erzeugers: allein die Ergebnismenge, ohne Befund des Prüfers.
function menge(b, abfrage) {
  const payload = frontmatterQueryFor(b.abfragen, abfrage, undefined, taskEnv(), 'de-DE');
  expect(Object.keys(payload), abfrage).toEqual(['resultSet']);
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  expect(payload.resultSet.state.queryError, abfrage).toBeNull();
  return payload.resultSet;
}

function fehler(b, abfrage) {
  const rs = frontmatterQueryFor(b.abfragen, abfrage, undefined, taskEnv(), 'de-DE').resultSet;
  expect(validateResultSet(rs), abfrage).toEqual([]);
  expect(rs.rows, abfrage).toEqual([]);
  return rs.state.queryError;
}

// Je Gruppe der Gruppen-Wert in Text-Form und die Werte über der Gruppe.
const zeilen = (rs) =>
  rs.groups.map((g) => [g.value && g.value.display ? g.value.display : g.value, ...g.values]);
const datum = (iso) => ({ kind: 'date', ms: new Date(`${iso}T00:00:00`).getTime() });

// --- Positionen: Zeile gegen Gruppe -----------------------------------------

describe('Positions-Regel: Zeile gegen Gruppe (AK2)', () => {
  it('ohne GROUP BY rechnen Aggregate je Zeile, mit GROUP BY über der Gruppe', async () => {
    const b = await bereich(DATEIEN);
    const zeile = menge(b, 'TABLE sum(punkte), count(punkte) WHERE file.name != "Abfragen"');
    expect(zeile.groups).toBeNull();
    expect(zeile.rows.map((r) => r.values)).toEqual([
      [3, 2],
      [4, 1],
      [10, 1],
      [null, 0],
    ]);
    const gruppe = menge(b, 'TABLE sum(punkte), count(punkte) GROUP BY kategorie');
    expect(zeilen(gruppe)).toEqual([
      ['x', 7, 2],
      ['y', 10, 1],
      [null, null, 0],
    ]);
  });

  it('count() zählt die Zeilen, count(x) die Zeilen mit Wert in x', async () => {
    const b = await bereich(DATEIEN);
    const rs = menge(b, 'TABLE count(), count(punkte), count(datum) GROUP BY kategorie');
    expect(zeilen(rs)).toEqual([
      ['x', 2, 2, 2],
      ['y', 2, 1, 1],
      [null, 1, 0, 0],
    ]);
    // count(x) an einer Zeilen-Stelle: Liste ihre Elemente, Einzelwert 1, fehlend 0.
    const z = menge(b, 'LIST count(punkte) WHERE file.name != "Abfragen"');
    expect(z.rows.map((r) => r.values[0])).toEqual([2, 1, 1, 0]);
  });

  it('sum, average, min und max fassen alle Werte zusammen, Listen elementweise', async () => {
    const b = await bereich(DATEIEN);
    const rs = menge(
      b,
      'TABLE sum(punkte), average(punkte), min(punkte), max(punkte) GROUP BY kategorie',
    );
    expect(zeilen(rs)).toEqual([
      ['x', 7, 7 / 3, 1, 4],
      ['y', 10, 10, 10, 10],
      [null, null, null, null, null],
    ]);
  });

  it('min und max nehmen über der Gruppe Datums-Werte, an der Zeilen-Stelle nicht', async () => {
    const b = await bereich(DATEIEN);
    const frontmatter = menge(b, 'TABLE min(datum), max(datum) GROUP BY kategorie');
    expect(zeilen(frontmatter)).toEqual([
      ['x', '2025-12-31', '2026-01-05'],
      ['y', '2026-03-01', '2026-03-01'],
      [null, null, null],
    ]);
    const zeile = menge(b, 'TABLE min(datum) WHERE file.name = "A"');
    expect(zeile.rows[0].values).toEqual([null]);
    const lib = await bereich({ 'Library.md': LIBRARY });
    const rs = menge(
      lib,
      'TABLE RECORDS min(acquired), max(acquired), average(pages) FROM "Library" GROUP BY author',
    );
    // Eine leere Text-Zelle ist der leere Text und gruppiert vor den übrigen.
    expect(zeilen(rs)).toEqual([
      ['', null, null, 50],
      ['Le Guin', datum('1968-01-01'), datum('1974-05-01'), 300],
      ['Lem', datum('1961-06-01'), datum('1961-06-01'), 250],
      ['Tolstoi', datum('1878-01-01'), datum('1900-01-01'), 882],
    ]);
    expect(rs.columns.map((c) => c.valueType)).toEqual(['date', 'date', 'number']);
  });

  it('Rechnen über Aggregaten und Gruppen-Ausdrücken, Literale, Schreibung egal', async () => {
    const b = await bereich(DATEIEN);
    const rs = menge(
      b,
      'TABLE sum(punkte) / count() AS "Schnitt", "Summe " + sum(punkte), KATEGORIE + ": " + count(), ' +
        'sum(punkte) > 5, upper(kategorie), 3 GROUP BY Kategorie',
    );
    expect(zeilen(rs)).toEqual([
      ['x', 3.5, 'Summe 7', 'x: 2', true, 'X', 3],
      ['y', 5, 'Summe 10', 'y: 2', true, 'Y', 3],
      [null, null, null, null, false, null, 3],
    ]);
    expect(rs.columns[0].label).toBe('Schnitt');
  });
});

// --- Fehler-Fälle -------------------------------------------------------------

describe('Abfrage-Fehler der Aggregat-Stellen (AK4)', () => {
  it('eine Spalte oder Sortierung ohne Gruppen-Bezug nennt die Spalte', async () => {
    const b = await bereich(DATEIEN);
    const faelle = [
      ['TABLE file.name GROUP BY kategorie', 'file.name'],
      ['TABLE file.name AS "Name" GROUP BY kategorie', 'Name'],
      ['TABLE count() + file.size GROUP BY kategorie', 'count() + file.size'],
      ['TABLE count() GROUP BY kategorie SORT file.name', 'file.name'],
      ['TABLE RECORDS title, count() FROM "Library" GROUP BY author', 'title'],
    ];
    for (const [abfrage, name] of faelle) {
      expect(fehler(b, abfrage), abfrage).toMatchObject({ code: 'groupedColumn', name });
    }
  });

  it('ein Aggregat im Aggregat ist ein Abfrage-Fehler mit der Spalte', async () => {
    const b = await bereich(DATEIEN);
    for (const abfrage of [
      'TABLE sum(count(punkte)) GROUP BY kategorie',
      'TABLE count() GROUP BY kategorie SORT max(sum(punkte))',
    ]) {
      expect(fehler(b, abfrage).code, abfrage).toBe('aggregateNested');
    }
    expect(fehler(b, 'TABLE sum(count()) AS "S" GROUP BY kategorie').name).toBe('S');
  });

  it('count() ohne Feld an einer Zeilen-Stelle ist ein Abfrage-Fehler', async () => {
    const b = await bereich(DATEIEN);
    for (const abfrage of [
      'LIST WHERE count() > 1',
      'TABLE count()',
      'LIST count()',
      'TABLE count() GROUP BY count()',
      'LIST GROUP BY kategorie SORT count()',
      'TABLE count() GROUP BY kategorie WHERE count() > 0',
    ]) {
      expect(fehler(b, abfrage).code, abfrage).toBe('countWithoutField');
    }
    // Ausdrücke außerhalb einer Abfrage (Spalten-Formeln, Rechnungen) sind Zeilen-Stellen.
    expect(validateQuery(parseExpression('count()').ast).code).toBe('countWithoutField');
    expect(validateQuery(parseExpression('count(tags)').ast)).toBeNull();
  });

  it('Gruppen-Ausdrücke vergleichen über den Quelltext ohne Rücksicht auf die Schreibung', () => {
    expect(exprKey(parseExpression('Kategorie + 1').ast)).toBe(
      exprKey(parseExpression('kategorie+1').ast),
    );
    const ast = (q) => ({
      type: 'table',
      fields: [{ expr: parseExpression(q).ast, alias: null }],
      sort: [],
      groupBy: [parseExpression('Kategorie').ast],
    });
    expect(checkGroupedTable(ast('lower(KATEGORIE)'))).toBeNull();
    expect(checkGroupedTable(ast('lower(status)')).code).toBe('groupedColumn');
    expect(checkGroupedTable({ ...ast('status'), groupBy: [] })).toBeNull();
  });
});

// --- Reihenfolge und Begrenzung ------------------------------------------------

describe('Reihenfolge der gruppierten Tabelle (AK3)', () => {
  it('ohne SORT nach dem Gruppen-Wert; SORT ordnet die Gruppen, fehlend zuletzt', async () => {
    const b = await bereich(DATEIEN);
    expect(zeilen(menge(b, 'TABLE count() GROUP BY kategorie'))).toEqual([
      ['x', 2],
      ['y', 2],
      [null, 1],
    ]);
    for (const richtung of ['ASC', 'DESC']) {
      const rs = menge(b, `TABLE sum(punkte) GROUP BY kategorie SORT sum(punkte) ${richtung}`);
      const erwartet = richtung === 'ASC' ? ['x', 'y', null] : ['y', 'x', null];
      expect(
        rs.groups.map((g) => g.value),
        richtung,
      ).toEqual(erwartet);
    }
  });

  it('LIMIT schneidet die Gruppen; die Zeilen bleiben die der verbliebenen Gruppen', async () => {
    const b = await bereich(DATEIEN);
    const rs = menge(
      b,
      'TABLE count() GROUP BY kategorie SORT count() DESC, kategorie DESC LIMIT 2',
    );
    expect(zeilen(rs)).toEqual([
      ['y', 2],
      ['x', 2],
    ]);
    expect(rs.rows.map((r) => r.origin.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(rs.groups.map((g) => g.rows)).toEqual([
      [2, 3],
      [0, 1],
    ]);
    const eins = menge(b, 'TABLE count() GROUP BY kategorie LIMIT 1');
    expect(eins.rows.map((r) => r.origin.name)).toEqual(['A', 'B']);
    expect(menge(b, 'TABLE count() GROUP BY kategorie LIMIT 0').rows).toEqual([]);
  });

  it('mehrstufig: Werte je Stufe, tieferer Gruppen-Ausdruck darüber fehlend, LIMIT über die unterste', async () => {
    const b = await bereich(DATEIEN);
    const rs = menge(b, 'TABLE kategorie, status, count() GROUP BY kategorie, status');
    expect(rs.groups.map((g) => g.values)).toEqual([
      ['x', null, 2],
      ['y', null, 2],
      [null, null, 1],
    ]);
    expect(rs.groups[0].groups.map((g) => g.values)).toEqual([
      ['x', 'offen', 1],
      ['x', 'zu', 1],
    ]);
    const zwei = menge(b, 'TABLE count() GROUP BY kategorie, status LIMIT 2');
    expect(zwei.groups.map((g) => g.value)).toEqual(['x']);
    expect(zwei.groups[0].groups.map((g) => g.value)).toEqual(['offen', 'zu']);
    const drei = menge(b, 'TABLE count() GROUP BY kategorie, status SORT count() DESC LIMIT 3');
    expect(drei.groups.map((g) => g.value)).toEqual(['x', 'y']);
    expect(drei.groups[1].groups.map((g) => [g.value, g.values[0]])).toEqual([['offen', 2]]);
  });
});

// --- Ergebnismenge ----------------------------------------------------------------

describe('Ergebnismenge der gruppierten Tabelle (AK1, AK5, AK6)', () => {
  it('Zeilen vollständig: Aggregat-Spalten fehlend, andere Spalten mit dem Wert der Zeile', async () => {
    const b = await bereich(DATEIEN);
    const abfrage = 'TABLE kategorie, upper(kategorie), count(), sum(punkte) GROUP BY kategorie';
    const rs = menge(b, abfrage);
    expect(rs.formatVersion).toBe(1);
    // sum(punkte) hätte je Zeile einen Wert; in der Aggregat-Spalte ist er fehlend.
    expect(rs.rows.map((r) => [r.origin.name, ...r.values])).toEqual([
      ['A', 'x', 'X', null, null],
      ['Abfragen', null, null, null, null],
      ['B', 'x', 'X', null, null],
      ['C', 'y', 'Y', null, null],
      ['D', 'y', 'Y', null, null],
    ]);
    expect(rs.columns.map((c) => c.valueType)).toEqual(['string', 'string', 'number', 'number']);
    expect(rs.groupColumns.map(({ name, label, valueType }) => [name, label, valueType])).toEqual([
      ['kategorie', 'kategorie', 'string'],
    ]);
    // Eine Liste und eine ungruppierte Tabelle tragen weder Werte noch Gruppen-Spalten.
    const liste = menge(b, 'LIST GROUP BY kategorie');
    expect(liste.groups[0]).not.toHaveProperty('values');
    expect(liste).not.toHaveProperty('groupColumns');
    expect(menge(b, 'TABLE kategorie')).not.toHaveProperty('groupColumns');
  });

  it('Datensatz-Ebene: Gruppen-Spalte mit Beschriftung, Verweis als Gruppen-Wert je Datensatz', async () => {
    const b = await bereich({ 'Library.md': LIBRARY, 'Loans.md': LOANS });
    const rs = menge(b, 'TABLE RECORDS count(), sum(pages) FROM "Library" GROUP BY author');
    expect(rs.groupColumns.map((c) => c.label)).toEqual(['Autor']);
    expect(zeilen(rs)).toEqual([
      ['', 1, 50],
      ['Le Guin', 3, 900],
      ['Lem', 2, 250],
      ['Tolstoi', 2, 1764],
    ]);
    // Zwei Bücher mit demselben Titel sind zwei Gruppen, je eine Zeile.
    const leihe = menge(b, 'TABLE RECORDS count() AS "Ausleihen" FROM "Loans" GROUP BY book');
    expect(leihe.groups.map((g) => [g.value.id, g.value.display, ...g.values])).toEqual([
      ['r-00001', 'A Wizard of Earthsea', 1],
      ['r-00006', 'Anna Karenina', 2],
      ['r-00007', 'Anna Karenina', 1],
    ]);
    expect(leihe.groups[1].value.path).toBe(b.pfade['Library.md']);
    expect(leihe.groupColumns[0].valueType).toBe('record');
    // Eine Hervorhebung als Gruppen-Ausdruck ist auf dieser Ebene ein Fehler (E8.1).
    expect(fehler(b, 'TABLE RECORDS count() FROM "Library" GROUP BY bold(author)').code).toBe(
      'recordsHighlight',
    );
  });

  it('aggregateGroups lässt eine Liste ohne Spalten und Sortierung unverändert geordnet', () => {
    const ast = { type: 'table', fields: [], sort: [], groupBy: [{ type: 'field', name: 'k' }] };
    const groups = [
      { value: 'a', rows: [0], groups: null },
      { value: 'b', rows: [1], groups: null },
    ];
    expect(aggregateGroups(groups, [{}, {}], ast)).toEqual([
      { value: 'a', rows: [0], groups: null, values: [] },
      { value: 'b', rows: [1], groups: null, values: [] },
    ]);
  });
});

// --- Unverändert: Liste und Aufgaben ------------------------------------------------

describe('Zeilen-Bedeutung bleibt, wo es keine Aggregat-Stelle gibt (F5 Option A)', () => {
  it('die gruppierte Aufgaben-Liste mit sum in SORT ordnet wie bisher die Treffer', async () => {
    const DUE = '\u{1F4C5}';
    const b = await bereich({
      'Aufgaben.md': [
        '## Alpha',
        '',
        `- [ ] A-eins ${DUE} 2099-03-01`,
        `- [ ] A-zwei ${DUE} 2000-01-01`,
        '',
        '## Beta',
        '',
        '- [ ] B-eins',
        '',
      ].join('\n'),
    });
    const mitSumme = menge(b, 'LIST TASKS GROUP BY heading SORT sum(urgency) DESC');
    const ohne = menge(b, 'LIST TASKS GROUP BY heading SORT urgency DESC');
    expect(mitSumme.rows).toEqual(ohne.rows);
    expect(mitSumme.groups).toEqual(ohne.groups);
    expect(mitSumme.rows.map((r) => r.origin.raw)[0]).toContain('A-zwei');
    expect(mitSumme.groups[0]).not.toHaveProperty('values');
  });

  it('die Tabelle ohne GROUP BY und die gruppierte Liste behalten die Zeilen-Bedeutung', async () => {
    const b = await bereich({ 'Library.md': LIBRARY });
    const rs = menge(
      b,
      'TABLE RECORDS sum(pages), count(title) FROM "Library" WHERE author = "Lem"',
    );
    expect(rs.rows.map((r) => r.values)).toEqual([
      [250, 1],
      [null, 1],
    ]);
    const liste = menge(
      b,
      'LIST RECORDS sum(pages) FROM "Library" GROUP BY author SORT sum(pages) DESC LIMIT 2',
    );
    expect(liste.rows.map((r) => r.values[0])).toEqual([900, 864]);
    expect(liste.groups.map((g) => g.value)).toEqual(['Tolstoi']);
  });
});

// --- Bedingung über die Gruppe (4T-002079) --------------------------------------------

// Je Gruppe der Wert und ihre Untergruppen als verschachtelte Liste.
const baum = (groups) => groups.map((g) => (g.groups ? [g.value, baum(g.groups)] : g.value));

describe('HAVING: Bedingung über die Gruppe (4T-002079, AK1 bis AK3)', () => {
  it('die gruppierte Tabelle behält nur die Gruppen, für die die Bedingung gilt', async () => {
    const b = await bereich(DATEIEN);
    expect(
      zeilen(menge(b, 'TABLE count(), sum(punkte) GROUP BY kategorie HAVING count() > 1')),
    ).toEqual([
      ['x', 2, 7],
      ['y', 2, 10],
    ]);
    const summe = menge(b, 'TABLE count(), sum(punkte) GROUP BY kategorie HAVING sum(punkte) > 8');
    expect(zeilen(summe)).toEqual([['y', 2, 10]]);
    // Die Treffer verworfener Gruppen verlassen die Menge.
    expect(summe.rows.map((r) => r.origin.name)).toEqual(['C', 'D']);
    expect(summe.groups[0].rows).toEqual([0, 1]);
    // Gruppen-Ausdruck, Verknüpfung und Rechnen über Aggregaten in der Bedingung.
    const q =
      'TABLE count() GROUP BY kategorie HAVING Kategorie = "x" OR sum(punkte) / count() > 4';
    expect(zeilen(menge(b, q))).toEqual([
      ['x', 2],
      ['y', 2],
    ]);
    expect(menge(b, 'TABLE count() GROUP BY kategorie HAVING count() > 5').rows).toEqual([]);
  });

  it('HAVING wirkt vor SORT und LIMIT über die Gruppen', async () => {
    const b = await bereich(DATEIEN);
    // Nach SORT und LIMIT zuerst bliebe x, das die Bedingung nicht erfüllt.
    const rs = menge(
      b,
      'TABLE count() GROUP BY kategorie HAVING count() < 2 SORT count() DESC LIMIT 1',
    );
    expect(zeilen(rs)).toEqual([[null, 1]]);
    expect(rs.rows.map((r) => r.origin.name)).toEqual(['Abfragen']);
    const zwei = menge(
      b,
      'TABLE count() GROUP BY kategorie HAVING count() > 1 SORT kategorie DESC LIMIT 1',
    );
    expect(zeilen(zwei)).toEqual([['y', 2]]);
  });

  it('mehrstufig: innerste Gruppen, leere Eltern-Gruppe entfällt, Werte über den verbliebenen Zeilen', async () => {
    const b = await bereich(DATEIEN);
    const rs = menge(b, 'TABLE count() GROUP BY kategorie, status HAVING status = "offen"');
    expect(baum(rs.groups)).toEqual([
      ['x', ['offen']],
      ['y', ['offen']],
    ]);
    // Die Eltern-Gruppe x zählt allein ihre verbliebene Zeile.
    expect(rs.groups.map((g) => g.values[0])).toEqual([1, 2]);
    expect(rs.rows.map((r) => r.origin.name)).toEqual(['A', 'C', 'D']);
    const zwei = menge(b, 'TABLE count() GROUP BY kategorie, status HAVING count() > 1');
    expect(baum(zwei.groups)).toEqual([['y', ['offen']]]);
  });

  it('die gruppierte Liste: innerste Gruppen, Wegfall leerer Eltern-Gruppen, SORT und LIMIT auf den Treffern', async () => {
    const b = await bereich(DATEIEN);
    const liste = menge(b, 'LIST GROUP BY kategorie HAVING count() > 1');
    expect(baum(liste.groups)).toEqual(['x', 'y']);
    expect(liste.rows.map((r) => r.origin.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(liste.groups[0]).not.toHaveProperty('values');
    const stufen = menge(b, 'LIST GROUP BY kategorie, status HAVING count() > 1');
    expect(baum(stufen.groups)).toEqual([['y', ['offen']]]);
    expect(stufen.rows.map((r) => r.origin.name)).toEqual(['C', 'D']);
    expect(stufen.groups[0].rows).toEqual([0, 1]);
    // SORT und LIMIT laufen vorher über die Treffer: Von A, Abfragen, B bleibt x.
    const begrenzt = menge(b, 'LIST GROUP BY kategorie HAVING count() > 1 SORT file.name LIMIT 3');
    expect(baum(begrenzt.groups)).toEqual(['x']);
    expect(begrenzt.rows.map((r) => r.origin.name)).toEqual(['A', 'B']);
  });

  it('Datensatz- und Aufgaben-Ebene: Autoren mit mehr als einem Buch, Datums-Aggregat, Aufgaben je Abschnitt', async () => {
    const b = await bereich({
      'Library.md': LIBRARY,
      'Aufgaben.md': '## Alpha\n\n- [ ] A-eins\n- [ ] A-zwei\n\n## Beta\n\n- [ ] B-eins\n',
    });
    const mehr = menge(
      b,
      'TABLE RECORDS count() FROM "Library" GROUP BY author HAVING count() > 1',
    );
    expect(zeilen(mehr)).toEqual([
      ['Le Guin', 3],
      ['Lem', 2],
      ['Tolstoi', 2],
    ]);
    const neu =
      'LIST RECORDS FROM "Library" GROUP BY author HAVING max(acquired) > date(1970-01-01)';
    expect(baum(menge(b, neu).groups)).toEqual(['Le Guin']);
    const aufgaben = menge(b, 'LIST TASKS GROUP BY heading HAVING count() > 1');
    expect(baum(aufgaben.groups)).toEqual(['Alpha']);
    expect(aufgaben.rows).toHaveLength(2);
  });

  it('Abfrage-Fehler: ohne GROUP BY, Feld ohne Gruppen-Bezug, Aggregat im Aggregat, unbekannte Funktion', async () => {
    const b = await bereich(DATEIEN);
    for (const abfrage of ['LIST HAVING count() > 1', 'TABLE count() HAVING count() > 1']) {
      expect(fehler(b, abfrage).code, abfrage).toBe('havingWithoutGroupBy');
    }
    for (const abfrage of [
      'LIST GROUP BY kategorie HAVING file.name = "A"',
      'TABLE count() GROUP BY kategorie HAVING count() > 1 AND file.name = "A"',
    ]) {
      expect(fehler(b, abfrage), abfrage).toMatchObject({
        code: 'havingUngrouped',
        name: 'file.name',
      });
    }
    expect(fehler(b, 'LIST GROUP BY kategorie HAVING sum(count()) > 1')).toMatchObject({
      code: 'aggregateNested',
      name: 'sum(count())',
    });
    expect(fehler(b, 'TABLE count() GROUP BY kategorie HAVING zaehle(punkte) > 1')).toMatchObject({
      code: 'unknownFunction',
      name: 'zaehle',
    });
    // count() ist in HAVING erlaubt, in Liste und Tabelle.
    expect(menge(b, 'LIST GROUP BY kategorie HAVING count() > 0').groups).toHaveLength(3);
    expect(checkGroupedTable({ groupBy: [], having: { type: 'field', name: 'x' } })).toBeNull();
  });

  it('havingGroups lässt die Gruppen ohne HAVING unverändert', () => {
    const groups = [{ value: 'a', rows: [0], groups: null }];
    const ast = { groupBy: [{ type: 'field', name: 'k' }] };
    expect(havingGroups(groups, [{}], ast)).toBe(groups);
  });
});

// --- Messlauf auf Zuruf (AK7) ---------------------------------------------------------

function grosseTabelle(anzahl) {
  const zeilen = [];
  for (let i = 1; i <= anzahl; i++) {
    const id = `r-${String(i).padStart(5, '0')}`;
    const tag = String((i % 28) + 1).padStart(2, '0');
    zeilen.push(
      ...row(id, [`Buch ${i}`, `Autor ${i % 100}`, String(100 + (i % 700)), `2020-01-${tag}`]),
    );
  }
  return table(
    [
      '    - name: title',
      '    - name: author',
      '    - name: pages',
      '      type: number',
      '    - name: acquired',
      '      type: date',
    ],
    ['  display: title'],
    zeilen,
  );
}

function median(datei, abfrage, kalt) {
  const zeiten = [];
  for (let lauf = 0; lauf < 5; lauf++) {
    if (kalt) clearCaches();
    const start = performance.now();
    const rs = frontmatterQueryFor(datei, abfrage, undefined, taskEnv(), 'de-DE').resultSet;
    zeiten.push(performance.now() - start);
    expect(rs.state.queryError).toBeNull();
    expect(rs.groups === null || rs.groups.length === 100).toBe(true);
  }
  zeiten.sort((a, b) => a - b);
  return zeiten;
}

describe.skipIf(!process.env.EM4ME_MESSLAUF)(
  'Messlauf gruppierte Tabelle (4T-002078, AK7; 4T-002079)',
  () => {
    it(
      'misst eine gruppierte Tabelle mit zwei Aggregaten bei 2000 und 10 000 Datensätzen',
      async () => {
        // 4T-002079 (Festlegung 23): dieselbe Tabelle mit HAVING über beide
        // Aggregate; die Bedingung hält alle 100 Gruppen, damit sie ganz läuft.
        const abfragen = {
          'gruppiert mit HAVING':
            'TABLE RECORDS count() AS "Anzahl", sum(pages) AS "Seiten" FROM "Big" GROUP BY author ' +
            'HAVING count() > 1 AND sum(pages) > 0',
          gruppiert:
            'TABLE RECORDS count() AS "Anzahl", sum(pages) AS "Seiten" FROM "Big" GROUP BY author',
          ungruppiert: 'TABLE RECORDS author, pages FROM "Big"',
        };
        const zeilenAusgabe = [];
        for (const anzahl of [2000, 10000]) {
          const b = await bereich({ 'Big.md': grosseTabelle(anzahl) });
          for (const [name, abfrage] of Object.entries(abfragen)) {
            for (const kalt of [true, false]) {
              median(b.abfragen, abfrage, kalt); // Aufwärm-Lauf
              const zeiten = median(b.abfragen, abfrage, kalt);
              zeilenAusgabe.push(
                `${anzahl} Datensätze, ${name}, ${kalt ? 'Lesen eingeschlossen' : 'Bestand warm'}: ` +
                  `Median ${zeiten[2].toFixed(1)} ms (Läufe ${zeiten.map((t) => t.toFixed(1)).join(', ')} ms)`,
              );
            }
          }
        }
        // Die Zeilen sind das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
        // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
        // eslint-disable-next-line no-console
        console.log(`Messlauf gruppierte Tabelle:\n${zeilenAusgabe.join('\n')}`);
      },
      PROZESS_ZEITLIMIT,
    );
  },
);
