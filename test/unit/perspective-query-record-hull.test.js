// 4T-002042 (Epic 3E-000258, E6.3): Die transitive Hülle als zwei Quellen-Formen
// der Datensatz-Ebene, `ancestors(ziel, feld, …)` und `descendants(ziel, feld, …)`.
//
// Geprüft wird über den echten Erzeuger aller Ebenen (`frontmatterQueryFor`) auf
// einem Wegwerf-Bereich mit drei Tabellen: Personen mit Vater und Mutter
// (Selbstbezug, mehrere Eltern, ein gemeinsamer Vorfahre auf zwei Wegen), Tiere
// mit einem Verweis auf ihren Besitzer (Tabellen-Grenze) und ein Kreis mit einem
// Datensatz, der auf sich selbst zeigt. Jede erzeugte Ergebnismenge läuft durch
// den Prüfer des Format-Vertrags (`validateResultSet`) und muss ohne Befund
// bleiben.
//
// 4T-002044: Am selben Bereich prüft der letzte Block, dass der Zeilen-Bau für
// den Baum (`DISPLAY tree BY <Feld>`) je Zeile den Eltern-Verweis mitgibt.
//
// Setup-Muster aus `perspective-query-record-paths.test.js`; der Aus-Zustand
// einer Hülle steht in `datensatz-abfrage-aus-zustand.test.js`, weil er den
// Schalter umlegt.
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
import { parseQuery } from '../../src/shared/query/perspective-query.js';
// Statisch importiert, damit die Module samt ihren Importen in der Import-Kette
// dieser Prüfdatei stehen (Auswahl des Prüf-Ausschnitts).
import { HINT_HULL_CYCLE, HINT_REF_AMBIGUOUS } from '../../src/main/index/query-records.js';
import { buildHull, hullKey } from '../../src/main/index/record-hull.js';
import { hullTarget, hullScopeError } from '../../src/shared/query/query-record-sources.js';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';

const require_ = createRequire(import.meta.url);
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
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

const id = (n) => `r-${String(n).padStart(5, '0')}`;

// Personen mit dem Namen als Schlüssel. Adam und Eva sind die Wurzeln; Kain und
// Abel haben beide Eltern; Zilla stammt über den Vater von Kain und über die
// Mutter von Abel ab, erreicht Adam und Eva also auf zwei Wegen (kein Kreis).
// Henoch verweist auf seinen Vater über den Schlüssel-Wert.
const PERSONS = table(
  [
    '    - name: name',
    '    - name: born',
    '      type: number',
    ...ref('father', 'Persons'),
    ...ref('mother', 'Persons'),
  ],
  ['  key: name', '  display: name'],
  [
    ...row(id(1), ['Adam', '1850', '', '']),
    ...row(id(2), ['Eva', '1855', '', '']),
    ...row(id(3), ['Kain', '1880', id(1), id(2)]),
    ...row(id(4), ['Abel', '1882', id(1), id(2)]),
    ...row(id(5), ['Henoch', '1905', 'Kain', '']),
    ...row(id(6), ['Irad', '1930', id(5), '']),
    ...row(id(7), ['Lamech', '1960', id(6), '']),
    ...row(id(8), ['Ada', '1908', id(4), '']),
    ...row(id(9), ['Zilla', '1935', id(5), id(8)]),
  ],
);

// Tiere in einem Unterordner, mit Verweis auf den Besitzer über die
// Tabellen-Grenze und auf das Muttertier in derselben Tabelle.
const PETS = table(
  ['    - name: name', ...ref('owner', 'Persons'), ...ref('mother', 'Pets')],
  ['  display: name'],
  [
    ...row(id(1), ['Rex', id(3), '']),
    ...row(id(2), ['Mia', id(7), id(1)]),
    ...row(id(3), ['Tom', id(2), '']),
  ],
);

// Ein Kreis A -> C -> B -> A über `parent`, D zeigt auf A, S auf sich selbst.
// Zwei Datensätze teilen den Schlüssel-Wert «Doppel», und E verweist über ihn.
const CIRCLE = table(
  ['    - name: name', ...ref('parent', 'Circle')],
  ['  key: name', '  display: name'],
  [
    ...row(id(1), ['A', id(3)]),
    ...row(id(2), ['B', id(1)]),
    ...row(id(3), ['C', id(2)]),
    ...row(id(4), ['D', id(1)]),
    ...row(id(5), ['S', id(5)]),
    ...row(id(6), ['Doppel', '']),
    ...row(id(7), ['Doppel', '']),
    ...row(id(8), ['E', 'Doppel']),
  ],
);

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqrh-'));
  tmpDirs.push(dir);
  const personsPath = write(dir, 'Persons.md', PERSONS);
  write(dir, 'Tiere/Pets.md', PETS);
  write(dir, 'Circle.md', CIRCLE);
  const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
  const root = await indexFor(abfragen);
  return { root, abfragen, personsPath };
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
function antwort(b, abfrage) {
  const payload = frontmatterQueryFor(b.abfragen, abfrage, undefined, undefined, 'de-DE');
  expect(Object.keys(payload)).toEqual(['resultSet']);
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  return payload.resultSet;
}

function menge(b, abfrage) {
  const rs = antwort(b, abfrage);
  expect(rs.state.queryError, abfrage).toBeNull();
  return rs;
}

// Die Anzeige-Formen der Treffer in der Reihenfolge der Ergebnismenge.
const namen = (rs) => rs.rows.map((r) => r.origin.display);
const sortiert = (rs) => namen(rs).slice().sort();
const fehler = (rs) => rs.state.queryError && rs.state.queryError.code;

// --- Beide Richtungen, eine und mehrere Stufen -------------------------------------

describe('Beide Richtungen über mehrere Stufen (AK1, AK3, Story AK1, AK4)', () => {
  it('descendants liefert alle Nachkommen über jede Tiefe, ohne das Ziel', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00001]], father)');
    expect(sortiert(rs)).toEqual(['Abel', 'Ada', 'Henoch', 'Irad', 'Kain', 'Lamech', 'Zilla']);
    expect(namen(rs)).not.toContain('Adam');
    expect(rs.state.hint).toBeNull();
    // Die Treffer sind Datensätze der Tabelle wie bei einer Tabelle in FROM.
    expect(rs.rows[0].origin).toMatchObject({ kind: 'record', table: 'Persons' });
  });

  it('ancestors liefert alle Vorfahren über jede Tiefe, ohne das Ziel', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00007]], father)');
    expect(sortiert(rs)).toEqual(['Adam', 'Henoch', 'Irad', 'Kain']);
    expect(namen(rs)).not.toContain('Lamech');
  });

  it('mehrere Felder: beiden Eltern zugleich folgen; ein gemeinsamer Vorfahre ist kein Kreis und steht einmal da', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00009]], father, mother)');
    expect(sortiert(rs)).toEqual(['Abel', 'Ada', 'Adam', 'Eva', 'Henoch', 'Kain']);
    expect(new Set(namen(rs)).size).toBe(namen(rs).length);
    expect(rs.state.hint).toBeNull();
    // Nur ein Feld: der Strang dieses Feldes.
    const vater = menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00009]], father)');
    expect(sortiert(vater)).toEqual(['Adam', 'Henoch', 'Kain']);
    // Nachkommen über beide Felder: Eva erreicht Zilla über Abel und Ada.
    const eva = menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00002]], mother, father)');
    expect(sortiert(eva)).toEqual(['Abel', 'Ada', 'Henoch', 'Irad', 'Kain', 'Lamech', 'Zilla']);
  });

  it('über Tabellen-Grenzen: Tiere der Nachkommen, Besitzer und Vorfahren eines Tieres', async () => {
    const b = await bereich();
    const nachkommen = menge(
      b,
      'LIST RECORDS FROM descendants([[Persons#^r-00001]], father, owner, mother)',
    );
    expect(sortiert(nachkommen)).toEqual([
      'Abel',
      'Ada',
      'Henoch',
      'Irad',
      'Kain',
      'Lamech',
      'Mia',
      'Rex',
      'Zilla',
    ]);
    // Tom gehört Eva, die keine Nachfahrin Adams ist.
    expect(namen(nachkommen)).not.toContain('Tom');
    // Vom Tier über den Besitzer zu dessen Vorfahren; das Ziel als Pfad ohne
    // Endung wie in einem Wiki-Link.
    const vorfahren = menge(
      b,
      'LIST RECORDS FROM ancestors([[Tiere/Pets#^r-00002]], owner, father)',
    );
    expect(sortiert(vorfahren)).toEqual(['Adam', 'Henoch', 'Irad', 'Kain', 'Lamech']);
    // Das Muttertier liegt in derselben Tabelle wie das Ziel.
    const mutter = menge(b, 'LIST RECORDS FROM ancestors([[Tiere/Pets.md#^r-00002]], mother)');
    expect(namen(mutter)).toEqual(['Rex']);
  });

  it('das Ziel über Kennung in beiden Schreibweisen, ohne Zirkumflex und über den Schlüssel', async () => {
    const b = await bereich();
    const erwartet = ['Henoch', 'Irad', 'Lamech', 'Zilla'];
    for (const ziel of ['Persons#^r-00003', 'Persons#^r-3', 'Persons#r-00003', 'Persons#Kain']) {
      const rs = menge(b, `LIST RECORDS FROM descendants([[${ziel}]], father)`);
      expect(sortiert(rs), ziel).toEqual(erwartet);
    }
    // Ein Alias hinter dem Strich gehört zur Anzeige und nicht zum Ziel.
    const alias = menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00003|Kain]], father)');
    expect(sortiert(alias)).toEqual(erwartet);
  });

  it('eine lange Kette wird vollständig durchlaufen, ohne Tiefen-Grenze (Story AK8)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqrh-kette-'));
    tmpDirs.push(dir);
    write(dir, 'Chain.md', chainTable(500));
    const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
    await indexFor(abfragen);
    const b = { abfragen };
    expect(menge(b, 'LIST RECORDS FROM descendants([[Chain#^r-00001]], parent)').rows).toHaveLength(
      499,
    );
    expect(menge(b, 'LIST RECORDS FROM ancestors([[Chain#^r-00500]], parent)').rows).toHaveLength(
      499,
    );
  });
});

// --- Filter, Sortierung, Verknüpfung -----------------------------------------------

describe('Filter, Sortierung und Verknüpfung mit einer Tabelle (AK2, Story AK3)', () => {
  it('WHERE filtert die Menge, SORT, LIMIT und Spalten wirken wie bei jeder Quelle', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'TABLE RECORDS born, father.name FROM descendants([[Persons#^r-00001]], father) WHERE born > 1900 SORT born DESC LIMIT 3',
    );
    expect(namen(rs)).toEqual(['Lamech', 'Zilla', 'Irad']);
    expect(rs.rows.map((r) => r.values)).toEqual([
      [1960, 'Irad'],
      [1935, 'Henoch'],
      [1930, 'Henoch'],
    ]);
    // Die Spalte trägt die Beschriftung der Tabelle, obwohl keine Tabelle in FROM steht.
    expect(rs.columns.map((c) => c.label)).toEqual(['born', 'father.name']);
    // Ohne SORT gilt die Grundordnung der Ebene: nach Anzeige-Form.
    const grund = menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00009]], father, mother)');
    expect(namen(grund)).toEqual(['Abel', 'Ada', 'Adam', 'Eva', 'Henoch', 'Kain']);
  });

  it('mit einer Tabelle über AND bleibt die Menge auf diese Tabelle begrenzt', async () => {
    const b = await bereich();
    const tiere = menge(
      b,
      'LIST RECORDS FROM descendants([[Persons#^r-00001]], father, owner) AND "Pets"',
    );
    expect(sortiert(tiere)).toEqual(['Mia', 'Rex']);
    const personen = menge(
      b,
      'LIST RECORDS FROM "Persons" AND descendants([[Persons#^r-00001]], father, owner)',
    );
    expect(namen(personen)).not.toContain('Rex');
    expect(personen.rows).toHaveLength(7);
  });

  it('verneint, mit OR und zweimal genannt: jeder Datensatz einmal', async () => {
    const b = await bereich();
    const ohne = menge(
      b,
      'LIST RECORDS FROM "Persons" AND -descendants([[Persons#^r-00001]], father)',
    );
    expect(sortiert(ohne)).toEqual(['Adam', 'Eva']);
    const beide = menge(
      b,
      'LIST RECORDS FROM ancestors([[Persons#^r-00007]], father) OR ancestors([[Persons#^r-00009]], father, mother)',
    );
    expect(sortiert(beide)).toEqual(['Abel', 'Ada', 'Adam', 'Eva', 'Henoch', 'Irad', 'Kain']);
    // Eine nur verneinte Hülle hieße «alle Datensätze außer …», das zu große
    // Ergebnis aus E4.
    const zuGross = antwort(b, 'LIST RECORDS FROM -descendants([[Persons#^r-00001]], father)');
    expect(fehler(zuGross)).toBe('recordsSourceMissing');
  });
});

// --- Leere Mengen ------------------------------------------------------------------

describe('Nicht auflösbares Ziel und leere Hülle (AK5, Story AK7)', () => {
  it('unbekannte Kennung, unbekannte Tabelle, unbekannter Schlüssel: leere Menge ohne Fehler', async () => {
    const b = await bereich();
    for (const ziel of [
      'Persons#^r-00099',
      'Niemand#^r-00001',
      'Persons#Niemand',
      'Abfragen#^r-1',
    ]) {
      const rs = menge(b, `LIST RECORDS FROM descendants([[${ziel}]], father)`);
      expect(rs.rows, ziel).toEqual([]);
      expect(rs.state.hint, ziel).toBeNull();
    }
  });

  it('ein mehrdeutiger Schlüssel als Ziel: leere Menge mit dem Hinweis «mehrdeutig»', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM descendants([[Circle#Doppel]], parent)');
    expect(rs.rows).toEqual([]);
    expect(rs.state.hint).toBe(HINT_REF_AMBIGUOUS);
    // Ein mehrdeutiger Eltern-Verweis unterwegs beendet den Strang, mit demselben Hinweis.
    const unterwegs = menge(b, 'LIST RECORDS FROM ancestors([[Circle#^r-00008]], parent)');
    expect(unterwegs.rows).toEqual([]);
    expect(unterwegs.state.hint).toBe(HINT_REF_AMBIGUOUS);
  });

  it('ein Ziel ohne Nachkommen und eines ohne Vorfahren: keine Treffer', async () => {
    const b = await bereich();
    expect(menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00007]], father)').rows).toEqual(
      [],
    );
    expect(menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00001]], father)').rows).toEqual([]);
    // Ein Feld, das kein Verweis ist oder das es nicht gibt, führt nirgends hin.
    expect(menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00007]], born)').rows).toEqual([]);
    expect(menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00001]], nichts)').rows).toEqual(
      [],
    );
  });
});

// --- Zyklus ------------------------------------------------------------------------

describe('Zyklus: terminiert, jeder einmal, Hinweis statt Fehler (AK5, Story AK6)', () => {
  it('ein Kreis durch das Ziel: beide Richtungen enden, ohne das Ziel und ohne Doppel', async () => {
    const b = await bereich();
    const nach = menge(b, 'LIST RECORDS FROM descendants([[Circle#^r-00001]], parent)');
    expect(sortiert(nach)).toEqual(['B', 'C', 'D']);
    expect(nach.state.hint).toBe(HINT_HULL_CYCLE);
    expect(nach.state.queryError).toBeNull();
    const vor = menge(b, 'LIST RECORDS FROM ancestors([[Circle#^r-00001]], parent)');
    expect(sortiert(vor)).toEqual(['B', 'C']);
    expect(vor.state.hint).toBe(HINT_HULL_CYCLE);
  });

  it('ein Kreis hinter dem Ziel und ein Datensatz, der auf sich selbst zeigt', async () => {
    const b = await bereich();
    const hinter = menge(b, 'LIST RECORDS FROM ancestors([[Circle#^r-00004]], parent)');
    expect(sortiert(hinter)).toEqual(['A', 'B', 'C']);
    expect(hinter.state.hint).toBe(HINT_HULL_CYCLE);
    const selbst = menge(b, 'LIST RECORDS FROM ancestors([[Circle#^r-00005]], parent)');
    expect(selbst.rows).toEqual([]);
    expect(selbst.state.hint).toBe(HINT_HULL_CYCLE);
    // Ohne Kreis kein Hinweis: D hat keine Nachkommen.
    expect(
      menge(b, 'LIST RECORDS FROM descendants([[Circle#^r-00004]], parent)').state.hint,
    ).toBeNull();
  });

  it('Rangfolge: der Kreis geht dem Hinweis zu COLUMNS vor, ohne Kreis bleibt jener stehen', async () => {
    const b = await bereich();
    const kreis = menge(
      b,
      'TABLE RECORDS name FROM descendants([[Circle#^r-00001]], parent) COLUMNS 2',
    );
    expect(kreis.state.hint).toBe(HINT_HULL_CYCLE);
    const ohne = menge(
      b,
      'TABLE RECORDS name FROM descendants([[Persons#^r-00001]], father) COLUMNS 2',
    );
    expect(ohne.state.hint).toBe('columnsIgnored');
  });

  it('die Menge der Hülle selbst: Schlüssel aus Kopf-Datei und Kennung, Kreis erkannt', () => {
    // Ohne Index: Die Hülle arbeitet allein über den hereingereichten Zugriff.
    const recs = [
      { id: 'r-00001', target: 'r-00002' },
      { id: 'r-00002', target: 'r-00001' },
    ].map(({ id: rid, target }) => ({
      id: rid,
      key: null,
      values: new Map([
        ['p', { kind: 'record', table: 'T', id: target, display: '', path: '/t.md' }],
      ]),
      refs: new Map(),
    }));
    const t = {
      path: '/t.md',
      definition: { fields: [], key: null },
      records: recs,
      byId: new Map(recs.map((r) => [r.id, r])),
    };
    const tableAt = (p) => (p === 'T' || p === '/t.md' ? t : null);
    const node = { kind: 'ancestors', table: 'T', start: 'r-00001', fields: ['p'] };
    const hull = buildHull(node, tableAt, { dbKindsPerFile: new Map() });
    expect([...hull.members.keys()]).toEqual([hullKey('/t.md', 'r-00002')]);
    expect(hull.cycle).toBe(true);
  });
});

// --- Andere Ebenen und Schreibweise ------------------------------------------------------

describe('Andere Ebenen und Schreibweise (AK4, Story AK5)', () => {
  it('auf Datei-, Block- und Aufgaben-Ebene sind beide Formen ein Abfrage-Fehler', async () => {
    const b = await bereich();
    for (const ebene of ['LIST', 'LIST BLOCKS', 'LIST TASKS', 'TABLE']) {
      for (const form of ['ancestors', 'descendants']) {
        const abfrage = `${ebene} FROM ${form}([[Persons#^r-00001]], father)`;
        const rs = antwort(b, abfrage);
        expect(fehler(rs), abfrage).toBe('recordHullScope');
        expect(rs.rows, abfrage).toEqual([]);
      }
    }
    // Auch verschachtelt in der Quelle.
    expect(fehler(antwort(b, 'LIST FROM "x" OR -(#a AND ancestors([[P#^r-1]], f))'))).toBe(
      'recordHullScope',
    );
    expect(hullScopeError({ scope: 'records', source: { type: 'srcHull' } })).toBeNull();
    expect(hullScopeError({ scope: 'files', source: null })).toBeNull();
  });

  it('Parse-Fehler: fehlende Klammer, fehlendes oder falsches Ziel, fehlendes Feld', () => {
    const code = (q) => parseQuery(q).error.code;
    expect(code('LIST RECORDS FROM ancestors [[P#^r-1]]')).toBe('expectedParen');
    expect(code('LIST RECORDS FROM ancestors([[P#^r-1]], a')).toBe('expectedParen');
    expect(code('LIST RECORDS FROM ancestors(a, b)')).toBe('hullTarget');
    expect(code('LIST RECORDS FROM ancestors([[P]], a)')).toBe('hullTarget');
    expect(code('LIST RECORDS FROM ancestors([[#^r-1]], a)')).toBe('hullTarget');
    expect(code('LIST RECORDS FROM descendants([[P#^]], a)')).toBe('hullTarget');
    expect(code('LIST RECORDS FROM descendants()')).toBe('hullTarget');
    expect(code('LIST RECORDS FROM ancestors([[P#^r-1]])')).toBe('hullField');
    expect(code('LIST RECORDS FROM ancestors([[P#^r-1]], )')).toBe('hullField');
    expect(code('LIST RECORDS FROM ancestors([[P#^r-1]], "")')).toBe('hullField');
  });

  it('Schreibweise: Wort in jeder Schreibung, Feld als Wort oder Zeichenkette, klein geschrieben', () => {
    const ast = parseQuery('LIST RECORDS FROM Ancestors([[P#^r-1]], Vater, "Zweite Mutter")').ast;
    expect(ast.source).toEqual({
      type: 'srcHull',
      kind: 'ancestors',
      target: 'P#^r-1',
      table: 'P',
      start: 'r-1',
      fields: ['vater', 'zweite mutter'],
    });
    expect(hullTarget('Ordner/P#Anna|A')).toEqual({ table: 'Ordner/P', start: 'Anna' });
    // Ein Feld namens «ancestors» bleibt außerhalb von FROM ein Feld.
    expect(parseQuery('LIST RECORDS FROM "P" WHERE ancestors = 1').ok).toBe(true);
  });
});

// --- Ungespeicherter Stand ----------------------------------------------------------------

describe('Ungespeicherter Stand (AK6, Story AK9)', () => {
  it('ein geänderter Eltern-Verweis geht ohne Speichern in die Hülle ein', async () => {
    const b = await bereich();
    const vorher = menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00004]], father)');
    expect(namen(vorher)).toEqual(['Ada']);
    // Lamech bekommt Abel statt Irad als Vater.
    const geaendert = PERSONS.replace('| Lamech\n| 1960\n| r-00006', '| Lamech\n| 1960\n| r-00004');
    expect(geaendert).not.toBe(PERSONS); // Nicht-Vakuitäts-Probe der Ersetzung
    setBufferOverlay(b.personsPath, geaendert);
    const nachher = menge(b, 'LIST RECORDS FROM descendants([[Persons#^r-00004]], father)');
    expect(sortiert(nachher)).toEqual(['Ada', 'Lamech']);
    const irad = menge(b, 'LIST RECORDS FROM ancestors([[Persons#^r-00007]], father)');
    expect(sortiert(irad)).toEqual(['Abel', 'Adam']);
    expect(fs.readFileSync(b.personsPath, 'utf8')).toBe(PERSONS);
  });
});

// --- Eltern-Verweis je Zeile für den Baum (4T-002044) -------------------------------------

// Der Baum (`DISPLAY tree BY <Feld>`) braucht je Datensatz den Verweis des Feldes,
// ohne dass der Autor es als Spalte nennt. Der Zeilen-Bau legt ihn als Angabe
// `parent` an die Zeilen, deren Tabelle das Feld als Verweis-Feld führt.
const traegtEltern = (r) => Object.hasOwn(r, 'parent');
const zeileVon = (rs, name) => rs.rows.find((r) => r.origin.display === name);

describe('Eltern-Verweis je Zeile für den Baum (4T-002044)', () => {
  it('jede Zeile trägt den Verweis des Feldes nach BY oder null, ohne Spalte', async () => {
    const b = await bereich();
    const rs = menge(b, 'LIST RECORDS FROM "Persons" DISPLAY tree BY father');
    expect(rs.columns).toEqual([]);
    expect(rs.rows.every(traegtEltern)).toBe(true);
    expect(zeileVon(rs, 'Adam').parent).toBeNull();
    expect(zeileVon(rs, 'Kain').parent).toMatchObject({
      kind: 'record',
      table: 'Persons',
      id: id(1),
      display: 'Adam',
    });
    // Henoch verweist über den Schlüssel-Wert; der Verweis trägt die Kennung.
    expect(zeileVon(rs, 'Henoch').parent).toMatchObject({ id: id(3), display: 'Kain' });
    expect(zeileVon(rs, 'Kain').parent.path).toBe(zeileVon(rs, 'Adam').origin.path);
    // Das Feld steht in jeder Schreibung, der Parser gibt es klein weiter.
    const gross = menge(b, 'LIST RECORDS FROM "Persons" DISPLAY TREE BY Father');
    expect(zeileVon(gross, 'Kain').parent).toMatchObject({ id: id(1) });
  });

  it('ohne Baum, ohne BY oder mit einem Feld, das kein Verweis ist, bleibt die Zeile ohne', async () => {
    const b = await bereich();
    for (const abfrage of [
      'LIST RECORDS FROM "Persons"',
      'LIST RECORDS FROM "Persons" DISPLAY tree',
      'LIST RECORDS FROM "Persons" DISPLAY tree BY name',
      'LIST RECORDS FROM "Persons" DISPLAY tree BY unbekannt',
      'LIST RECORDS FROM "Persons" DISPLAY bar BY father',
      'LIST DISPLAY tree BY father',
    ]) {
      const rs = antwort(b, abfrage);
      expect(rs.rows.length, abfrage).toBeGreaterThan(0);
      expect(rs.rows.some(traegtEltern), abfrage).toBe(false);
    }
  });

  it('über Tabellen-Grenzen trägt nur die Zeile den Verweis, deren Tabelle das Feld führt', async () => {
    const b = await bereich();
    const rs = menge(
      b,
      'LIST RECORDS FROM descendants([[Persons#^r-00001]], father, owner) DISPLAY tree BY owner',
    );
    expect(zeileVon(rs, 'Rex').parent).toMatchObject({ table: 'Persons', id: id(3) });
    expect(zeileVon(rs, 'Mia').parent).toMatchObject({ table: 'Persons', id: id(7) });
    expect(traegtEltern(zeileVon(rs, 'Kain'))).toBe(false);
  });

  it('Kreis, Selbstbezug und mehrdeutiger Verweis: Verweis wie gelesen, mehrdeutig mit Hinweis', async () => {
    const b = await bereich();
    const ohne = menge(b, 'LIST RECORDS FROM "Circle"');
    expect(ohne.state.hint).toBeNull();
    const rs = menge(b, 'LIST RECORDS FROM "Circle" DISPLAY tree BY parent');
    expect(zeileVon(rs, 'A').parent).toMatchObject({ id: id(3) });
    expect(zeileVon(rs, 'S').parent).toMatchObject({ id: id(5) });
    // E verweist über den Schlüssel-Wert «Doppel», den zwei Datensätze tragen.
    expect(zeileVon(rs, 'E').parent).toBeNull();
    expect(rs.state.hint).toBe(HINT_REF_AMBIGUOUS);
  });

  it('ein ungespeicherter Eltern-Verweis wirkt sofort', async () => {
    const b = await bereich();
    const vorher = menge(b, 'LIST RECORDS FROM "Persons" DISPLAY tree BY father');
    expect(zeileVon(vorher, 'Lamech').parent).toMatchObject({ id: id(6) });
    const geaendert = PERSONS.replace('| Lamech\n| 1960\n| r-00006', '| Lamech\n| 1960\n| r-00003');
    expect(geaendert).not.toBe(PERSONS); // Nicht-Vakuitäts-Probe der Ersetzung
    setBufferOverlay(b.personsPath, geaendert);
    const nachher = menge(b, 'LIST RECORDS FROM "Persons" DISPLAY tree BY father');
    expect(zeileVon(nachher, 'Lamech').parent).toMatchObject({ id: id(3), display: 'Kain' });
    expect(fs.readFileSync(b.personsPath, 'utf8')).toBe(PERSONS);
  });
});

// --- Messlauf auf Zuruf -------------------------------------------------------------------

// Eine Kette: r-00001 ist die Wurzel, jeder weitere zeigt über `parent` auf den
// vorigen.
function chainTable(count) {
  const records = [];
  for (let i = 1; i <= count; i++)
    records.push(...row(id(i), [`K ${i}`, i === 1 ? '' : id(i - 1)]));
  return table(['    - name: name', ...ref('parent', 'Chain')], ['  display: name'], records);
}

// Ein breiter Baum: r-00001 ist die Wurzel, alle übrigen zeigen auf sie.
function broadTable(count) {
  const records = [];
  for (let i = 1; i <= count; i++) records.push(...row(id(i), [`B ${i}`, i === 1 ? '' : id(1)]));
  return table(['    - name: name', ...ref('parent', 'Broad')], ['  display: name'], records);
}

// `EM4ME_MESSLAUF=1 npx vitest run test/unit/perspective-query-record-hull.test.js`:
// eine Kette über 2000 Stufen und ein Baum mit 2000 Kindern, je in beiden
// Richtungen. Gemessen wird die ganze Abfrage ohne Zwischenspeicher (kalt) und mit
// (warm), Median aus fünf Läufen nach einem Aufwärm-Lauf; die Schwelle ist 100 ms.
describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf transitive Hülle (4T-002042)', () => {
  it(
    'misst eine Kette über 2000 Stufen und einen Baum mit 2000 Kindern',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-pqrh-mess-'));
      tmpDirs.push(dir);
      write(dir, 'Chain.md', chainTable(2001));
      write(dir, 'Broad.md', broadTable(2001));
      const abfragen = write(dir, 'Abfragen.md', '# Abfragen\n');
      await indexFor(abfragen);
      const faelle = [
        ['Kette descendants', 'LIST RECORDS FROM descendants([[Chain#^r-00001]], parent)'],
        ['Kette ancestors', 'LIST RECORDS FROM ancestors([[Chain#^r-02001]], parent)'],
        ['Baum descendants', 'LIST RECORDS FROM descendants([[Broad#^r-00001]], parent)'],
      ];
      const lines = [];
      for (const [name, abfrage] of faelle) {
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
              'de',
            );
            times.push(performance.now() - start);
            expect(resultSet.rows).toHaveLength(2000);
          }
          return times.sort((x, y) => x - y);
        };
        lauf(true); // Aufwärm-Lauf
        for (const kalt of [true, false]) {
          const times = lauf(kalt);
          lines.push(
            `${name} ${kalt ? 'kalt' : 'warm'}: Median ${times[2].toFixed(1)} ms ` +
              `(Läufe ${times.map((t) => t.toFixed(1)).join(', ')} ms)`,
          );
          expect(times[2], `${name} ${kalt ? 'kalt' : 'warm'}`).toBeLessThan(100);
        }
      }
      // Die Zeilen sind das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
      // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
      // eslint-disable-next-line no-console
      console.log(`Messlauf transitive Hülle:\n${lines.join('\n')}`);
    },
    PROZESS_ZEITLIMIT,
  );
});
