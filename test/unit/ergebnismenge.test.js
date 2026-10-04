// 4T-002032 (Epic 3E-000260, E8.1 bis E8.5, E21.6): Format-Vertrag der
// Ergebnismenge — Aufbau-Funktionen, Prüfer, Übertragbarkeit über die
// Prozess-Grenze und die additive Regel der Format-Version.
//
// Die tragende Zusage des Prüfers ist Vollständigkeit in beide Richtungen:
// Jede gültige Menge jeder Ebene bleibt ohne Befund, und jeder Befund-Code
// des Vertrags wird von mindestens einem Fall ausgelöst (letzter Block).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORMAT_VERSION,
  RESULT_SCOPES,
  RESULT_TYPES,
  RESULT_STATUSES,
  VALUE_TYPES,
  ORIGIN_KINDS,
  FINDING_CODES,
  isRecordRef,
  valueTypeOf,
  uniformValueType,
  makeColumn,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
  makeRecordRef,
  makeTaskInfo,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
} from '../../src/shared/query/result-set.js';

const MODUL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/shared/query/result-set.js',
);

const A = 'C:/bereich/Alpha.md';
const B = 'C:/bereich/Beta.md';
const DATUM = { kind: 'date', ms: Date.UTC(2026, 8, 30) };
const DAUER = { kind: 'dur', ms: 3600000 };
const LINK = { kind: 'link', path: B, name: 'Beta' };
const RICH = {
  kind: 'rich',
  segs: [{ text: 'wichtig', bold: true }, { link: { path: B, name: 'Beta' } }],
};

function col(name, valueType = null, alias = null) {
  return makeColumn({ name, label: alias || name, alias, source: name, valueType });
}
const ready = (extra) =>
  makeState('ready', { area: { root: 'C:/bereich', fileCount: 2 }, ...extra });

// --- Gültige Mengen je Ebene ---------------------------------------------------------

function dateiListe() {
  return makeResultSet({
    scope: 'files',
    type: 'list',
    columns: [col('status', 'string')],
    rows: [makeRow(['offen'], fileOrigin(A, 'Alpha')), makeRow([null], fileOrigin(B, 'Beta'))],
    wishes: makeWishes({ layoutColumns: 3 }),
    state: ready(),
  });
}

function blockTabelle() {
  return makeResultSet({
    scope: 'blocks',
    type: 'table',
    columns: [col('menge', 'number', 'Menge'), col('seit', 'date'), col('dauer'), col('quelle')],
    rows: [
      makeRow([3, DATUM, DAUER, LINK], blockOrigin(A, 'Alpha', 'b1')),
      makeRow([4.5, null, true, [LINK, 'frei', [1, 2]]], blockOrigin(B, 'Beta', 'b2')),
    ],
    wishes: makeWishes({ withoutId: true }),
    state: ready({ hint: 'columnsIgnored' }),
  });
}

function aufgabenGruppiert() {
  const info = (u) => makeTaskInfo({ urgency: u, blocked: false, duplicateId: false });
  return makeResultSet({
    scope: 'tasks',
    type: 'list',
    columns: [col('text')],
    rows: [
      makeRow([RICH], taskOrigin(A, 'Alpha', 4, '- [ ] Eins'), info(12.3456)),
      makeRow(['zwei'], taskOrigin(A, 'Alpha', 9, '- [ ] Zwei'), info(0)),
      makeRow([null], taskOrigin(B, 'Beta', 1, '- [x] Drei'), info(-1.5)),
    ],
    // Zwei Ebenen: Datei, darunter Priorität; die Zeilen-Liste bleibt vollständig.
    groups: [
      makeGroup(LINK, [0, 1], [makeGroup('hoch', [0]), makeGroup(null, [1])]),
      makeGroup(null, [2]),
    ],
    wishes: makeWishes({ hide: ['count'], show: ['urgency'], short: true }),
    state: ready(),
  });
}

function datensatzTabelle() {
  return makeResultSet({
    scope: 'records',
    type: 'table',
    columns: [col('Name', 'string'), col('Firma', 'record')],
    rows: [
      makeRow(
        ['Anna', makeRecordRef('Firmen', 'r-00007', 'Muster AG')],
        recordOrigin('Personen', 'r-00041'),
      ),
      makeRow(['Bert', null], recordOrigin('Personen', 'r-00042')),
    ],
    state: ready(),
  });
}

// 4T-002076 (Epic 3E-000259): Gruppen gibt es seither auf allen vier Ebenen und
// bei beiden Ausgabe-Typen. Ein Listen-Wert ist Gruppen-Wert einer Kombination,
// ein Datensatz-Verweis bleibt als Gruppen-Wert ein Verweis; das Format bleibt.
function dateiListeGruppiert() {
  const rs = dateiListe();
  rs.rows.push(makeRow(['zu'], fileOrigin('C:/bereich/Gamma.md', 'Gamma')));
  rs.groups = [makeGroup(['rot', 'blau'], [0, 2]), makeGroup(null, [1])];
  return rs;
}

function blockTabelleGruppiert() {
  const rs = blockTabelle();
  rs.groups = [
    makeGroup(3, [0], [makeGroup(DATUM, [0])]),
    makeGroup(4.5, [1], [makeGroup(null, [1])]),
  ];
  return rs;
}

function datensatzListeGruppiert() {
  const firma = makeRecordRef('Firmen', 'r-00007', 'Muster AG');
  return makeResultSet({
    scope: 'records',
    type: 'list',
    rows: [
      makeRow([], recordOrigin('Personen', 'r-00041')),
      makeRow([], recordOrigin('Personen', 'r-00042')),
      makeRow([], recordOrigin('Personen', 'r-00043')),
    ],
    groups: [makeGroup(firma, [0, 2]), makeGroup(null, [1])],
    state: ready(),
  });
}

// 4T-002078 (Epic 3E-000259): Die gruppierte Tabelle trägt je Gruppe die Werte
// über der Gruppe (eine Zeile je Gruppe) und je Ausdruck von GROUP BY eine
// Gruppen-Spalte; die Zeilen tragen in der Aggregat-Spalte «fehlend».
function datensatzTabelleAggregiert() {
  const firma = makeRecordRef('Firmen', 'r-00007', 'Muster AG');
  const rs = makeResultSet({
    scope: 'records',
    type: 'table',
    columns: [col('Firma', 'record'), col('count()', 'number')],
    rows: [
      makeRow([firma, null], recordOrigin('Personen', 'r-00041')),
      makeRow([null, null], recordOrigin('Personen', 'r-00042')),
      makeRow([firma, null], recordOrigin('Personen', 'r-00043')),
    ],
    groups: [makeGroup(firma, [0, 2]), makeGroup(null, [1])],
    groupColumns: [col('Firma', 'record')],
    state: ready(),
  });
  rs.groups[0].values = [firma, 2];
  rs.groups[1].values = [null, 1];
  return rs;
}

const GUELTIGE = {
  'Datei-Ebene, Liste mit Zusatzfeld': dateiListe,
  'Block-Ebene, Tabelle mit allen Werte-Arten': blockTabelle,
  'Aufgaben-Ebene mit verschachtelten Gruppen': aufgabenGruppiert,
  'Datensatz-Ebene mit Datensatz-Verweis': datensatzTabelle,
  'Datei-Ebene, gruppierte Liste mit Listen-Wert als Gruppen-Wert': dateiListeGruppiert,
  'Block-Ebene, gruppierte Tabelle mit Untergruppen': blockTabelleGruppiert,
  'Datensatz-Ebene, gruppierte Liste mit Verweis als Gruppen-Wert': datensatzListeGruppiert,
  'Datensatz-Ebene, gruppierte Tabelle mit Werten über der Gruppe': datensatzTabelleAggregiert,
  'Zustand «nicht verfügbar»': () => makeResultSet({ state: makeState('unavailable') }),
  'Zustand «zu groß»': () =>
    makeResultSet({
      state: makeState('oversized', { area: { root: 'C:/b', fileCount: 90000, byteSize: 1e9 } }),
    }),
  'Zustand «Index wird aufgebaut»': () =>
    makeResultSet({ state: makeState('indexing', { area: { root: 'C:/b' } }) }),
  'Zustand «Index-Fehler»': () =>
    makeResultSet({ state: makeState('error', { area: { root: 'C:/b' } }) }),
  'Abfrage-Fehler mit Zusatz-Angaben': () =>
    makeResultSet({
      state: ready({
        queryError: { code: 'clauseTwice', message: 'Klausel doppelt', pos: 12, clause: 'SORT' },
      }),
    }),
  'leeres Ergebnis': () => makeResultSet({ scope: 'files', type: 'list', state: ready() }),
};

function codes(rs) {
  return validateResultSet(rs).map((f) => f.code);
}

// Jeder in einem Negativ-Fall gesehene Code, für den Vollständigkeits-Abgleich.
const GESEHEN = new Set();
function befund(rs, code, fundort) {
  const findings = validateResultSet(rs);
  for (const f of findings) GESEHEN.add(f.code);
  expect(findings).toContainEqual({ path: fundort, code });
  return findings;
}

describe('Format-Version (E8.5)', () => {
  it('ist 1 und steht in jeder gebauten Menge', () => {
    expect(FORMAT_VERSION).toBe(1);
    expect(dateiListe().formatVersion).toBe(1);
  });

  it('nennt die geschlossenen Wertemengen der Version 1', () => {
    expect(RESULT_SCOPES).toEqual(['files', 'blocks', 'tasks', 'records']);
    expect(RESULT_TYPES).toEqual(['list', 'table']);
    expect(RESULT_STATUSES).toEqual(['unavailable', 'oversized', 'indexing', 'error', 'ready']);
    expect(ORIGIN_KINDS).toEqual(['file', 'block', 'task', 'record']);
    expect(VALUE_TYPES).toContain('record');
  });
});

describe('Aufbau-Funktionen', () => {
  it('makeColumn trennt Name, Beschriftung, Alias und Quelltext (E8.4, E21.6)', () => {
    expect(makeColumn({ name: 'due', label: 'Fällig', alias: 'Fällig', source: 'due' })).toEqual({
      name: 'due',
      label: 'Fällig',
      alias: 'Fällig',
      source: 'due',
      valueType: null,
    });
    expect(
      makeColumn({ name: 'x', label: 'x', source: 'x', valueType: 'number' }).alias,
    ).toBeNull();
  });

  it('die vier Herkunfts-Arten tragen ihre Angaben', () => {
    expect(fileOrigin(A, 'Alpha')).toEqual({ kind: 'file', path: A, name: 'Alpha' });
    expect(blockOrigin(A, 'Alpha', 'b1')).toEqual({
      kind: 'block',
      path: A,
      name: 'Alpha',
      anchor: 'b1',
    });
    expect(taskOrigin(A, 'Alpha', 4, '- [ ] x')).toEqual({
      kind: 'task',
      path: A,
      name: 'Alpha',
      line: 4,
      raw: '- [ ] x',
    });
    expect(recordOrigin('Personen', 'r-00041')).toEqual({
      kind: 'record',
      table: 'Personen',
      id: 'r-00041',
    });
  });

  it('makeRecordRef trägt Tabelle, Kennung und Anzeige-Form (E8.2)', () => {
    const ref = makeRecordRef('Firmen', 'r-00007', 'Muster AG');
    expect(ref).toEqual({ kind: 'record', table: 'Firmen', id: 'r-00007', display: 'Muster AG' });
    expect(isRecordRef(ref)).toBe(true);
    expect(isRecordRef(LINK)).toBe(false);
  });

  it('makeRow kopiert die Werte-Liste; taskInfo fehlt außerhalb der Aufgaben als null', () => {
    const werte = [1];
    const row = makeRow(werte, fileOrigin(A, 'Alpha'));
    werte.push(2);
    expect(row).toEqual({ values: [1], origin: fileOrigin(A, 'Alpha'), taskInfo: null });
    expect(() => makeRow('1', fileOrigin(A, 'Alpha'))).toThrow(TypeError);
  });

  it('makeTaskInfo übernimmt die Dringlichkeit ungerundet', () => {
    expect(makeTaskInfo({ urgency: 12.3456, blocked: true, duplicateId: false })).toEqual({
      urgency: 12.3456,
      blocked: true,
      duplicateId: false,
    });
  });

  it('makeGroup trägt den Gruppen-Wert und Zeilen-Indizes, Untergruppen optional', () => {
    expect(makeGroup(null, [2])).toEqual({ value: null, rows: [2], groups: null });
    expect(makeGroup('a', [0, 1], [makeGroup('b', [0])]).groups).toHaveLength(1);
  });

  it('makeWishes füllt die Vorgaben der fünf Wünsche (E8.3)', () => {
    expect(makeWishes()).toEqual({
      layoutColumns: null,
      withoutId: false,
      hide: [],
      show: [],
      short: false,
    });
  });

  it('makeState übernimmt den Abfrage-Fehler vollständig und füllt den Bereich', () => {
    const fehler = { code: 'unknownFunction', message: 'x', pos: 3, name: 'foo' };
    const s = makeState('ready', { queryError: fehler, area: { root: 'C:/b', fileCount: 5 } });
    expect(s).toEqual({
      status: 'ready',
      queryError: { code: 'unknownFunction', message: 'x', pos: 3, name: 'foo' },
      hint: null,
      area: { root: 'C:/b', fileCount: 5, byteSize: null },
    });
    expect(s.queryError).not.toBe(fehler);
    expect(makeState('unavailable')).toEqual({
      status: 'unavailable',
      queryError: null,
      hint: null,
      area: null,
    });
  });

  it('makeResultSet verlangt einen Zustand und füllt den Rest', () => {
    expect(() => makeResultSet({})).toThrow(TypeError);
    expect(makeResultSet({ state: makeState('indexing') })).toEqual({
      formatVersion: 1,
      scope: null,
      type: null,
      columns: [],
      rows: [],
      groups: null,
      wishes: makeWishes(),
      state: makeState('indexing'),
    });
  });

  it('valueTypeOf und uniformValueType ordnen Werte-Arten zu; fehlend zählt nicht', () => {
    const erwartet = [
      ['a', 'string'],
      [1, 'number'],
      [false, 'boolean'],
      [DATUM, 'date'],
      [DAUER, 'dur'],
      [LINK, 'link'],
      [RICH, 'rich'],
      [makeRecordRef('T', 'r-1', 'x'), 'record'],
      [[1], 'list'],
      [null, null],
      [{ kind: 'neu' }, null],
    ];
    for (const [wert, art] of erwartet) expect(valueTypeOf(wert)).toBe(art);
    expect(uniformValueType([1, null, 2])).toBe('number');
    expect(uniformValueType([1, 'a'])).toBeNull();
    expect(uniformValueType([null, null])).toBeNull();
  });
});

describe('Prüfer: gültige Mengen bleiben ohne Befund', () => {
  for (const [name, bau] of Object.entries(GUELTIGE)) {
    it(name, () => {
      expect(validateResultSet(bau())).toEqual([]);
    });
  }

  it('Gruppierung lässt die Zeilen-Liste vollständig (Story AK3)', () => {
    const rs = aufgabenGruppiert();
    expect(rs.rows).toHaveLength(3);
    expect(rs.groups.flatMap((g) => g.rows).sort()).toEqual([0, 1, 2]);
  });
});

describe('Übertragbarkeit über die Prozess-Grenze (E8.2)', () => {
  for (const [name, bau] of Object.entries(GUELTIGE)) {
    it(`${name}: strukturierter Klon und JSON-Rundlauf ergeben dasselbe Objekt`, () => {
      const rs = bau();
      expect(structuredClone(rs)).toStrictEqual(rs);
      expect(JSON.parse(JSON.stringify(rs))).toStrictEqual(rs);
    });
  }
});

describe('Additive Regel: unbekannte Zusatz-Angaben sind keine Abweichung (E8.5)', () => {
  it('an Menge, Spalte, Zeile, Herkunft, Wert, Gruppe, Wünschen und Zustand', () => {
    const rs = aufgabenGruppiert();
    rs.kuenftig = { beliebig: [1, 'zwei'] };
    rs.columns[0].format = 'kurz';
    rs.rows[0].markiert = true;
    rs.rows[0].origin.spalte = 7;
    rs.rows[1].values[0] = { kind: 'date', ms: 0, zone: 'Europe/Zurich' };
    rs.rows[0].taskInfo.blocking = true;
    rs.groups[0].zaehler = 2;
    // 4T-002043: `display` ist seither ein bekannter Wunsch; die unbekannte
    // Angabe hier heißt deshalb anders.
    rs.wishes.palette = 'kraeftig';
    rs.state.dauerMs = 12;
    expect(validateResultSet(rs)).toEqual([]);
  });

  // 4T-002043 (Epic 3E-000258): Die gewählte Darstellungsform reist als Wunsch,
  // additiv; ohne Angabe fehlt sie, die Format-Version bleibt 1.
  it('Darstellungsform als Wunsch: nur mit Angabe in der Menge, ohne Befund', () => {
    expect(Object.hasOwn(makeWishes(), 'display')).toBe(false);
    expect(Object.hasOwn(makeWishes({ display: null }), 'display')).toBe(false);
    const baum = makeWishes({ display: { form: 'tree', by: 'parent' } });
    expect(baum.display).toEqual({ form: 'tree', by: 'parent' });
    expect(makeWishes({ display: { form: 'bar' } }).display).toEqual({ form: 'bar', by: null });
    for (const rs of [dateiListe(), datensatzTabelle()]) {
      rs.wishes = makeWishes({ ...rs.wishes, display: { form: 'tree', by: 'parent' } });
      expect(rs.formatVersion).toBe(1);
      expect(validateResultSet(rs)).toEqual([]);
      expect(structuredClone(rs)).toStrictEqual(rs);
      expect(JSON.parse(JSON.stringify(rs))).toStrictEqual(rs);
    }
  });

  // 4T-002039 (Epic 3E-000258, Festlegung 10): Die Datensatz-Ebene liefert an
  // der Herkunft zusätzlich Kopf-Pfad und Anzeige-Form, am Datensatz-Verweis den
  // Pfad; beides additiv, die Format-Version bleibt 1.
  it('Datensatz-Herkunft mit Kopf-Pfad und Anzeige-Form, Verweis mit Pfad', () => {
    const herkunft = (id, display) => ({ ...recordOrigin('Personen', id), path: A, display });
    const verweis = { ...makeRecordRef('Firmen', 'r-00007', 'Muster AG'), path: B };
    const rs = makeResultSet({
      scope: 'records',
      type: 'table',
      columns: [col('name', 'string'), col('firma', 'record')],
      rows: [
        makeRow(['Anna', verweis], herkunft('r-00041', 'Anna')),
        // Ohne Anzeige-Form steht null; der Treffer heißt dann nach der Kennung.
        makeRow([null, null], herkunft('r-00042', null)),
      ],
      state: ready(),
    });
    expect(rs.formatVersion).toBe(1);
    expect(validateResultSet(rs)).toEqual([]);
    expect(structuredClone(rs)).toStrictEqual(rs);
    expect(JSON.parse(JSON.stringify(rs))).toStrictEqual(rs);
  });

  // 4T-002044 (Epic 3E-000258): Der Baum bekommt je Datensatz-Zeile den
  // Eltern-Verweis des Feldes nach BY als Angabe `parent`, additiv und ohne
  // Spalte; er darf fehlen oder null sein. Die Format-Version bleibt 1.
  it('Eltern-Verweis des Baums an Datensatz-Zeilen: fehlend, null oder ein Verweis', () => {
    const rs = datensatzTabelle();
    rs.wishes = makeWishes({ display: { form: 'tree', by: 'chef' } });
    rs.rows[0].parent = { ...makeRecordRef('Personen', 'r-00042', 'Bert'), path: A };
    rs.rows[1].parent = null;
    rs.rows.push(makeRow(['Cora', null], recordOrigin('Firmen', 'r-00001')));
    expect(rs.formatVersion).toBe(1);
    expect(validateResultSet(rs)).toEqual([]);
    expect(structuredClone(rs)).toStrictEqual(rs);
    expect(JSON.parse(JSON.stringify(rs))).toStrictEqual(rs);
  });
});

describe('Prüfer: je Regel eine Abweichung mit Fundort', () => {
  it('kein Objekt', () => {
    befund(null, 'notObject', '');
    befund([], 'notObject', '');
  });

  it('Regel 1: Format-Version ist eine ganze Zahl ab 1', () => {
    for (const falsch of [0, 1.5, '1', null]) {
      const rs = dateiListe();
      rs.formatVersion = falsch;
      befund(rs, 'formatVersionInvalid', 'formatVersion');
    }
  });

  it('Ebene und Ausgabe-Typ: bekannte Werte, null nur ohne ausgewertetes Ergebnis', () => {
    const rs = dateiListe();
    rs.scope = 'kalender';
    rs.type = 'baum';
    befund(rs, 'scopeUnknown', 'scope');
    befund(rs, 'typeUnknown', 'type');
    const leer = makeResultSet({ state: ready() });
    befund(leer, 'scopeUnknown', 'scope');
    befund(leer, 'typeUnknown', 'type');
  });

  it('Regel 2: Spalten sind eine Liste mit Name, Beschriftung und Quelltext', () => {
    const rs = dateiListe();
    rs.columns = {};
    befund(rs, 'columnsInvalid', 'columns');
    for (const [feld, falsch] of [
      ['name', null],
      ['label', 3],
      ['source', undefined],
      ['alias', 1],
      ['valueType', 'zahl'],
    ]) {
      const r = dateiListe();
      r.columns[0][feld] = falsch;
      befund(r, 'columnInvalid', 'columns[0]');
    }
  });

  it('Regel 3: jede Zeile hat so viele Werte wie Spalten', () => {
    const rs = blockTabelle();
    rs.rows[1].values.pop();
    befund(rs, 'rowLengthMismatch', 'rows[1].values');
    const liste = dateiListe();
    liste.rows[0].values.push('zu viel');
    befund(liste, 'rowLengthMismatch', 'rows[0].values');
  });

  it('Zeilen: Liste aus Objekten mit Werte-Liste', () => {
    const rs = dateiListe();
    rs.rows = 'x';
    befund(rs, 'rowsInvalid', 'rows');
    const r = dateiListe();
    r.rows[0] = 'x';
    befund(r, 'rowInvalid', 'rows[0]');
    const w = dateiListe();
    w.rows[0].values = 'offen';
    befund(w, 'rowInvalid', 'rows[0]');
  });

  it('Regel 4: jeder Wert liegt im Werte-Raum', () => {
    const rs = blockTabelle();
    rs.rows[0].values[0] = { kind: 'waehrung', betrag: 3 };
    befund(rs, 'valueKindUnknown', 'rows[0].values[0]');
    const falsch = [
      { kind: 'date', ms: '2026' },
      { kind: 'dur' },
      { kind: 'link', path: '', name: 'x' },
      { kind: 'rich', segs: 'fett' },
      { kind: 'rich', segs: [{ bold: true }] },
      { kind: 'record', table: 'Firmen', id: 'r-00007' },
      { kind: 'record', table: '', id: 'r-00007', display: 'x' },
      { ohneArt: 1 },
    ];
    for (const wert of falsch) {
      const r = blockTabelle();
      r.rows[1].values[3] = [wert];
      befund(r, 'valueInvalid', 'rows[1].values[3][0]');
    }
  });

  it('Spalten-Wert-Art: ein Wert anderer Art in einer typisierten Spalte', () => {
    const rs = blockTabelle();
    rs.rows[0].values[0] = 'drei';
    befund(rs, 'valueTypeMismatch', 'rows[0].values[0]');
  });

  it('Regel 5: jede Herkunft hat eine der vier Arten mit ihren Pflicht-Angaben', () => {
    const falsch = [
      null,
      { kind: 'ordner', path: A },
      { kind: 'file', name: 'Alpha' },
      { kind: 'block', path: A, name: 'Alpha' },
      { kind: 'task', path: A, name: 'Alpha', line: 0, raw: '- [ ] x' },
      { kind: 'task', path: A, name: 'Alpha', line: 3 },
      { kind: 'record', table: 'Personen' },
    ];
    for (const herkunft of falsch) {
      const rs = dateiListe();
      rs.rows[0].origin = herkunft;
      befund(rs, 'originInvalid', 'rows[0].origin');
    }
  });

  it('Herkunft passt zur Ebene', () => {
    const rs = dateiListe();
    rs.rows[1].origin = blockOrigin(B, 'Beta', 'b1');
    befund(rs, 'originScopeMismatch', 'rows[1].origin');
  });

  it('Aufgaben-Zusatzangaben: Form und nur an Aufgaben-Zeilen', () => {
    const rs = aufgabenGruppiert();
    rs.rows[0].taskInfo = { urgency: '12', blocked: false, duplicateId: false };
    befund(rs, 'taskInfoInvalid', 'rows[0].taskInfo');
    const ohne = aufgabenGruppiert();
    ohne.rows[2].taskInfo = null;
    befund(ohne, 'taskInfoInvalid', 'rows[2].taskInfo');
    const f = dateiListe();
    f.rows[0].taskInfo = makeTaskInfo({ urgency: 1, blocked: false, duplicateId: false });
    befund(f, 'taskInfoWithoutTask', 'rows[0].taskInfo');
  });

  it('Regel 6: jeder Gruppen-Verweis zeigt auf eine vorhandene Zeile', () => {
    const rs = aufgabenGruppiert();
    rs.groups[1].rows.push(3);
    befund(rs, 'groupRowUnknown', 'groups[1].rows[1]');
    const u = aufgabenGruppiert();
    u.groups[0].groups[1].rows = [2];
    befund(u, 'groupRowOutsideParent', 'groups[0].groups[1].rows[0]');
    const g = aufgabenGruppiert();
    g.groups = {};
    befund(g, 'groupsInvalid', 'groups');
    const e = aufgabenGruppiert();
    e.groups[0] = { value: 'x' };
    befund(e, 'groupInvalid', 'groups[0]');
  });

  it('Regel 7: ein hervorgehobener Wert in einer Datensatz-Zeile (E8.1)', () => {
    const rs = datensatzTabelle();
    rs.columns[0].valueType = null;
    rs.rows[1].values[0] = { kind: 'rich', segs: [{ text: 'Bert', bold: true }] };
    befund(rs, 'richInRecordRow', 'rows[1].values[0]');
    const inListe = datensatzTabelle();
    inListe.columns[0].valueType = null;
    inListe.rows[0].values[0] = ['Anna', RICH];
    befund(inListe, 'richInRecordRow', 'rows[0].values[0][1]');
  });

  it('Regel 8: nur einfache Objekte, Listen und Grundwerte', () => {
    const faelle = [
      [(rs) => (rs.rows[0].values[0] = new Date(0)), 'notPlainObject', 'rows[0].values[0]'],
      [(rs) => (rs.state.area = new Map()), 'notPlainObject', 'state.area'],
      [(rs) => (rs.rows[0].origin = Object.create(null)), 'notPlainObject', 'rows[0].origin'],
      [(rs) => (rs.rows[0].values[0] = () => 'offen'), 'functionValue', 'rows[0].values[0]'],
      [(rs) => (rs.kuenftig = [undefined]), 'undefinedValue', 'kuenftig[0]'],
      [(rs) => (rs.rows[0].origin.name = undefined), 'undefinedValue', 'rows[0].origin.name'],
      [(rs) => (rs.rows[0].values[0] = Number.NaN), 'nonFiniteNumber', 'rows[0].values[0]'],
      [(rs) => (rs.rows[0].values[0] = 1n), 'unsupportedPrimitive', 'rows[0].values[0]'],
      [(rs) => (rs.rows[0].values = new Array(1)), 'sparseArray', 'rows[0].values[0]'],
      [(rs) => (rs.kuenftig = rs), 'cycle', 'kuenftig'],
    ];
    for (const [aendern, code, fundort] of faelle) {
      const rs = dateiListe();
      rs.columns[0].valueType = null;
      aendern(rs);
      befund(rs, code, fundort);
    }
  });

  it('Zustand: bekannter Status, Fehler-Form, Hinweis, Bereich', () => {
    const faelle = [
      [(s) => (s.status = 'loading'), 'statusUnknown', 'state.status'],
      [
        (s) => (s.queryError = { code: 'syntax', message: 'x' }),
        'queryErrorInvalid',
        'state.queryError',
      ],
      [(s) => (s.hint = 7), 'hintInvalid', 'state.hint'],
      [
        (s) => (s.area = { root: 'C:/b', fileCount: '2', byteSize: null }),
        'areaInvalid',
        'state.area',
      ],
    ];
    for (const [aendern, code, fundort] of faelle) {
      const rs = makeResultSet({ state: makeState('unavailable') });
      aendern(rs.state);
      befund(rs, code, fundort);
    }
    const ohne = dateiListe();
    ohne.state = 'bereit';
    befund(ohne, 'stateInvalid', 'state');
  });

  it('Zustand: ohne ausgewertetes Ergebnis ist die Zeilen-Liste leer (E8.5)', () => {
    const rs = dateiListe();
    rs.state = makeState('indexing');
    befund(rs, 'rowsWithoutResult', 'rows');
    const fehler = dateiListe();
    fehler.state = ready({ queryError: { code: 'syntax', message: 'x', pos: -1 } });
    befund(fehler, 'rowsWithoutResult', 'rows');
  });

  it('Darstellungs-Wünsche: Form der fünf Wünsche', () => {
    const rs = dateiListe();
    rs.wishes = { layoutColumns: '3', withoutId: 1, hide: 'count', show: [1], short: null };
    for (const feld of ['layoutColumns', 'withoutId', 'hide', 'show', 'short']) {
      befund(rs, 'wishesInvalid', `wishes.${feld}`);
    }
    const ohne = dateiListe();
    ohne.wishes = null;
    befund(ohne, 'wishesInvalid', 'wishes');
    // 4T-002043: Die Darstellungsform trägt einen Namen und ein Feld oder null.
    for (const falsch of ['bar', { form: '' }, { form: 'tree', by: 3 }, { by: 'parent' }]) {
      const rs = dateiListe();
      rs.wishes.display = falsch;
      befund(rs, 'wishesInvalid', 'wishes.display');
    }
  });

  // 4T-002044: Der Eltern-Verweis ist ein vollständiger Datensatz-Verweis und
  // steht nur an einer Datensatz-Zeile.
  it('Eltern-Verweis des Baums: Form und Herkunft der Zeile', () => {
    const falsch = ['r-00042', { kind: 'record', table: 'Personen', id: '' }, { kind: 'link' }];
    for (const parent of falsch) {
      const rs = datensatzTabelle();
      rs.rows[0].parent = parent;
      befund(rs, 'parentInvalid', 'rows[0].parent');
    }
    const datei = dateiListe();
    datei.rows[0].parent = makeRecordRef('Personen', 'r-00042', 'Bert');
    befund(datei, 'parentInvalid', 'rows[0].parent');
  });

  // 4T-002078: Die Werte über einer Gruppe sind eine Liste mit einem Wert je
  // Spalte nach den Regeln einer Zeile; die Gruppen-Spalten prüft der Prüfer
  // wie Spalten. Ohne gruppierte Tabelle fehlen beide Angaben.
  it('Werte über der Gruppe: Liste, Länge, Werte-Raum, Werte-Art; Gruppen-Spalten', () => {
    expect('groupColumns' in datensatzTabelle()).toBe(false);
    expect(datensatzTabelleAggregiert().groupColumns).toHaveLength(1);
    const keineListe = datensatzTabelleAggregiert();
    keineListe.groups[0].values = 'zwei';
    befund(keineListe, 'groupValuesInvalid', 'groups[0].values');
    const zuKurz = datensatzTabelleAggregiert();
    zuKurz.groups[1].values = [null];
    befund(zuKurz, 'groupValuesLengthMismatch', 'groups[1].values');
    const falscheArt = datensatzTabelleAggregiert();
    falscheArt.groups[0].values[1] = 'zwei';
    befund(falscheArt, 'valueTypeMismatch', 'groups[0].values[1]');
    const hervorgehoben = datensatzTabelleAggregiert();
    hervorgehoben.columns[1].valueType = null;
    hervorgehoben.groups[0].values[1] = RICH;
    befund(hervorgehoben, 'richInRecordRow', 'groups[0].values[1]');
    const spalten = datensatzTabelleAggregiert();
    spalten.groupColumns = [{ name: 'Firma' }];
    befund(spalten, 'columnInvalid', 'groupColumns[0]');
    const keineSpalten = datensatzTabelleAggregiert();
    keineSpalten.groupColumns = 'Firma';
    befund(keineSpalten, 'columnsInvalid', 'groupColumns');
  });

  it('jeder Befund-Code des Vertrags wird von einem Fall ausgelöst', () => {
    expect([...GESEHEN].sort()).toEqual([...FINDING_CODES].sort());
  });
});

describe('Blatt-Stellung (AK5)', () => {
  it('das Modul lädt allein query-format.js', () => {
    const quelle = fs.readFileSync(MODUL, 'utf8');
    const bezuege = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(bezuege).toEqual(['./query-format.js']);
    expect(quelle).not.toMatch(/\bimport\s*\(/);
  });

  it('die Aufgaben-Zusatzangaben kommen im Prüfer nicht gerundet an', () => {
    expect(codes(aufgabenGruppiert())).toEqual([]);
    expect(aufgabenGruppiert().rows[0].taskInfo.urgency).toBe(12.3456);
  });
});
