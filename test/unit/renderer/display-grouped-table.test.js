// @vitest-environment jsdom
// 4T-002078 (Epic 3E-000259, F1 Option A, Festlegung 10): Die gruppierte Tabelle
// der Anzeige, eine Zeile je Gruppe der untersten Stufe. Vorn je Ausdruck von
// `GROUP BY` eine Spalte mit dem Gruppen-Wert an der Stelle der Spalte «Datei»
// bzw. «Datensatz», dahinter die Werte über der Gruppe; `WITHOUT ID` blendet die
// Gruppen-Spalten aus, ein Datensatz-Verweis als Gruppen-Wert ist ein Link in
// die Maske.
//
// Eigene Prüfdatei, weil `frontmatter-query-view.test.js` an ihrem Budget steht.
// Gezeichnet wird über den Einstieg der Befüllung (`buildQueryListDom`), damit
// die Weiche zur gruppierten Tabelle mitgeprüft ist; die Antworten entstehen
// über die Aufbau-Funktionen des Format-Vertrags.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import { buildGroupedTableDom } from '../../../src/renderer/modules/query/display-list-table.js';
import {
  recordHitOf,
  openRecordHit,
} from '../../../src/renderer/modules/query/record-hit-click.js';
import {
  makeColumn,
  fileOrigin,
  recordOrigin,
  makeRecordRef,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
} from '../../../src/shared/query/result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const spalte = (name, label = name, valueType = null) =>
  makeColumn({ name, label, source: name, valueType });
const datei = (name) => fileOrigin(`/raum/${name}.md`, name);
const mitWerten = (group, values) => ({ ...group, values });

function render(rs) {
  expect(validateResultSet(rs)).toEqual([]);
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet: rs }, tStub));
  return host;
}

const koepfe = (host) => [...host.querySelectorAll('thead th')].map((th) => th.textContent);
const zellen = (host) =>
  [...host.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent),
  );

// Dateien nach Kategorie: x mit zwei Dateien, y mit einer, eine ohne Kategorie.
function dateienNachKategorie(wishes = makeWishes()) {
  return makeResultSet({
    scope: 'files',
    type: 'table',
    columns: [
      spalte('count()', 'Anzahl', 'number'),
      spalte('sum(punkte)', 'sum(punkte)', 'number'),
    ],
    rows: ['A', 'B', 'C', 'D'].map((n) => makeRow([null, null], datei(n))),
    groups: [
      mitWerten(makeGroup('x', [0, 1]), [2, 7]),
      mitWerten(makeGroup('y', [2]), [1, 10]),
      mitWerten(makeGroup(null, [3]), [1, null]),
    ],
    groupColumns: [spalte('kategorie', 'kategorie', 'string')],
    wishes,
    state: makeState('ready'),
  });
}

describe('gruppierte Tabelle: eine Zeile je Gruppe (4T-002078, AK1)', () => {
  it('führende Gruppen-Spalte mit Kopf, dahinter die Werte über der Gruppe', () => {
    const host = render(dateienNachKategorie());
    expect(host.querySelectorAll('table.perspective-query-table')).toHaveLength(1);
    expect(koepfe(host)).toEqual(['kategorie', 'Anzahl', 'sum(punkte)']);
    expect(zellen(host)).toEqual([
      ['x', '2', '7'],
      ['y', '1', '10'],
      [de['query.group.none'], '1', ''],
    ]);
    // Keine Hülle der gruppierten Liste und keine Treffer-Links der Zeilen.
    expect(host.querySelector('.perspective-query-group')).toBeNull();
    expect(host.querySelector('a.perspective-query-item')).toBeNull();
  });

  it('WITHOUT ID blendet die Gruppen-Spalten aus (AK5)', () => {
    const host = render(dateienNachKategorie(makeWishes({ withoutId: true })));
    expect(koepfe(host)).toEqual(['Anzahl', 'sum(punkte)']);
    expect(zellen(host)).toEqual([
      ['2', '7'],
      ['1', '10'],
      ['1', ''],
    ]);
  });

  it('mehrstufig: je Stufe eine führende Spalte, eine Zeile je unterster Gruppe', () => {
    const rs = makeResultSet({
      scope: 'files',
      type: 'table',
      columns: [spalte('count()')],
      rows: ['A', 'B', 'C'].map((n) => makeRow([null], datei(n))),
      groups: [
        mitWerten(
          makeGroup(
            'x',
            [0, 1],
            [mitWerten(makeGroup('offen', [0]), [1]), mitWerten(makeGroup(null, [1]), [1])],
          ),
          [2],
        ),
        mitWerten(makeGroup('y', [2], [mitWerten(makeGroup('zu', [2]), [1])]), [1]),
      ],
      groupColumns: [spalte('kategorie'), spalte('status')],
      state: makeState('ready'),
    });
    const host = render(rs);
    expect(koepfe(host)).toEqual(['kategorie', 'status', 'count()']);
    expect(zellen(host)).toEqual([
      ['x', 'offen', '1'],
      ['x', de['query.group.none'], '1'],
      ['y', 'zu', '1'],
    ]);
  });

  it('Kopf nach der Beschriftung der Gruppen-Spalte; ohne ihre Beschreibung ein leerer Kopf', () => {
    const rs = dateienNachKategorie();
    rs.groupColumns = [spalte('author', 'Autor')];
    expect(koepfe(render(rs))[0]).toBe('Autor');
    // Fehlt die Beschreibung (etwa in einer älteren Menge), bleibt die Spalte stehen.
    const ohne = dateienNachKategorie();
    delete ohne.groupColumns;
    const host = render(ohne);
    expect(koepfe(host)).toEqual(['', 'Anzahl', 'sum(punkte)']);
    expect(zellen(host)[0]).toEqual(['x', '2', '7']);
  });
});

describe('Datensatz-Verweis als Gruppen-Wert (4T-002078, AK5)', () => {
  const buch = (id, titel) => ({
    ...makeRecordRef('Library', id, titel),
    path: '/raum/Library.md',
  });

  function ausleihenJeBuch() {
    return makeResultSet({
      scope: 'records',
      type: 'table',
      columns: [spalte('count()', 'Ausleihen', 'number')],
      rows: ['r-1', 'r-2', 'r-3'].map((id) => makeRow([null], recordOrigin('Loans', id))),
      groups: [
        mitWerten(makeGroup(buch('r-00006', 'Anna Karenina'), [0, 2]), [2]),
        mitWerten(makeGroup(buch('r-00007', 'Anna Karenina'), [1]), [1]),
      ],
      groupColumns: [spalte('book', 'Buch', 'record')],
      state: makeState('ready'),
    });
  }

  it('zeigt die Anzeige-Form als Link mit den Angaben des Datensatz-Klicks', () => {
    const host = render(ausleihenJeBuch());
    expect(koepfe(host)).toEqual(['Buch', 'Ausleihen']);
    expect(zellen(host)).toEqual([
      ['Anna Karenina', '2'],
      ['Anna Karenina', '1'],
    ]);
    const links = [...host.querySelectorAll('tbody td:first-child a.perspective-query-item')];
    expect(links.map((a) => a.dataset.fmRecordId)).toEqual(['r-00006', 'r-00007']);
    expect(links[0].dataset.fmRecordTable).toBe('/raum/Library.md');
    expect(links[0].hasAttribute('data-fm-path')).toBe(false);
  });

  it('der Klick auf den Gruppen-Wert fordert die Maske genau dieses Datensatzes an', () => {
    const host = render(ausleihenJeBuch());
    const geoeffnet = [];
    const merke = (e) => geoeffnet.push(e.detail);
    document.addEventListener('scg:open-form', merke);
    try {
      const link = host.querySelectorAll('tbody td:first-child a')[1];
      expect(openRecordHit(recordHitOf(link))).toBe(true);
    } finally {
      document.removeEventListener('scg:open-form', merke);
    }
    expect(geoeffnet).toEqual([{ filePath: '/raum/Library.md', recordId: 'r-00007' }]);
  });

  it('ohne Gruppen-Werte über der Gruppe bleiben die Zellen leer, die Gruppen-Spalte steht', () => {
    const rs = ausleihenJeBuch();
    for (const g of rs.groups) delete g.values;
    const tabelle = buildGroupedTableDom(rs, tStub);
    const host = document.createElement('div');
    host.appendChild(tabelle);
    expect(zellen(host)).toEqual([
      ['Anna Karenina', ''],
      ['Anna Karenina', ''],
    ]);
  });
});
