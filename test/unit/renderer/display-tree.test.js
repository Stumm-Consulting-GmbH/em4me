// @vitest-environment jsdom
// 4T-002044 (Epic 3E-000258, Story 4S-001035): Baum-Darstellung einer
// Datensatz-Abfrage, `DISPLAY tree BY <Verweis-Feld>`. Geprüft wird über den
// Einstieg der Befüllung (`buildQueryListDom`) mit Ergebnismengen aus den
// Aufbau-Funktionen des Format-Vertrags, dazu die Daten-Regel (`treeLayout`)
// unmittelbar und die Kette vom Abfrage-Text über den Zeilen-Bau bis zum Baum.
//
// Die Mengen tragen den Eltern-Verweis als Angabe `parent` der Zeile, so wie der
// Zeilen-Bau sie bei `DISPLAY tree BY <Feld>` liefert (dessen Fälle stehen in
// perspective-query-record-hull.test.js). Der Klick wird an den Funktionen
// geprüft, die beide Klick-Handler rufen (`record-hit-click.js`); dass die
// Handler selbst die Maske öffnen, belegt datensatz-treffer-klick.test.js, und
// dass ein Knoten dieselben Angaben trägt wie ein Listen-Treffer, belegt der
// Vergleich unten.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import { drawDisplayForm } from '../../../src/renderer/modules/query/display-forms.js';
import {
  treeLayout,
  isTreeSuitable,
  TREE_MAX_DEPTH,
} from '../../../src/renderer/modules/query/display-tree.js';
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
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
} from '../../../src/shared/query/result-set.js';
import { parseQuery } from '../../../src/shared/query/perspective-query.js';
import { buildResultSet } from '../../../src/main/index/query-result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const STAFF = '/raum/Staff.md';
const id = (n) => `r-${String(n).padStart(5, '0')}`;
const BAUM = { form: 'tree', by: 'boss' };

// Ein Datensatz der Tabelle «Staff» mit seinem Eltern-Verweis: `boss` ist die
// Nummer des Eltern-Datensatzes, null für «leer», undefined für «Zeile trägt
// keinen Verweis» (Tabelle ohne das Feld).
function person(n, name, boss, { table = 'Staff', file = STAFF, values = [] } = {}) {
  const row = makeRow(values, { ...recordOrigin(table, id(n)), path: file, display: name });
  if (boss === undefined) return row;
  const ref = boss === null ? null : { ...makeRecordRef('Staff', id(boss), ''), path: STAFF };
  return { ...row, parent: ref };
}

function menge(rows, { display = BAUM, type = 'list', columns = [], hint = null, scope } = {}) {
  return makeResultSet({
    scope: scope || 'records',
    type,
    columns,
    rows,
    wishes: makeWishes(display ? { display } : {}),
    state: makeState('ready', { hint, area: { root: '/raum', fileCount: 3 } }),
  });
}

function html(rs) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet: rs }, tStub));
  return host;
}

// Die Gestalt eines gezeichneten Baums: je Knoten eine Zeile, zwei Leerzeichen je Ebene.
function gestalt(host) {
  const out = [];
  const lauf = (ul, tiefe) => {
    for (const li of ul.children) {
      out.push('  '.repeat(tiefe) + li.querySelector(':scope > a').textContent);
      const unter = li.querySelector(':scope > ul.perspective-query-subtree');
      if (unter) lauf(unter, tiefe + 1);
    }
  };
  lauf(host.querySelector('ul.perspective-query-tree'), 0);
  return out;
}

// Die Hierarchie aus DB-ABF-04 in der Ordnung nach Anzeige-Form: Clara leitet,
// Jonas und Lea berichten an sie, Mats an Jonas; Noras Verweis zeigt ins Leere;
// Ole und Pia verweisen aufeinander.
const TEAM = () => [
  person(1, 'Clara', null),
  person(2, 'Jonas', 1),
  person(3, 'Lea', 1),
  person(4, 'Mats', 2),
  person(5, 'Nora', null),
  person(6, 'Ole', 7),
  person(7, 'Pia', 6),
];

const hinweis = (host) => host.querySelector('.perspective-query-hint');

describe('Aufbau: Wurzeln, Einrückung, Reihenfolge (AK1, AK5)', () => {
  it('Datensätze ohne Eltern in der Menge stehen als Wurzeln oben, die übrigen eingerückt', () => {
    const rs = menge(TEAM());
    expect(validateResultSet(rs)).toEqual([]);
    const host = html(rs);
    expect(gestalt(host)).toEqual([
      'Clara',
      '  Jonas',
      '    Mats',
      '  Lea',
      'Nora',
      'Ole',
      '  Pia',
    ]);
    // Statt der Liste der Baum, ohne Hinweis und ohne Fehler.
    expect(host.children.length).toBe(1);
    expect(host.firstElementChild.className).toBe('perspective-query-list perspective-query-tree');
    expect(hinweis(host)).toBeNull();
  });

  it('ein Datensatz, dessen Eltern herausgefiltert sind, ist eine Wurzel', () => {
    // descendants(Clara): Clara selbst fehlt, Jonas und Lea werden Wurzeln, an
    // ihrem Platz in der Reihenfolge zwischen den übrigen Wurzeln.
    const rs = menge([
      person(2, 'Jonas', 1),
      person(9, 'Bert', null),
      person(3, 'Lea', 1),
      person(4, 'Mats', 2),
    ]);
    expect(gestalt(html(rs))).toEqual(['Jonas', '  Mats', 'Bert', 'Lea']);
  });

  it('Wurzeln und Geschwister folgen der Reihenfolge des Ergebnisses, nicht dem Namen', () => {
    const rs = menge([
      person(3, 'Lea', 1),
      person(1, 'Clara', null),
      person(4, 'Mats', 1),
      person(2, 'Jonas', 1),
      person(9, 'Bert', null),
    ]);
    expect(gestalt(html(rs))).toEqual(['Clara', '  Lea', '  Mats', '  Jonas', 'Bert']);
  });

  it('gleiche Kennungen verschiedener Tabellen fallen nicht zusammen', () => {
    // Die Kennung r-00001 gibt es in zwei Tabellen; der Verweis zeigt auf Staff.
    const rs = menge([
      person(1, 'Fremd', null, { table: 'Other', file: '/raum/Other.md' }),
      person(1, 'Clara', null),
      person(2, 'Jonas', 1),
    ]);
    expect(gestalt(html(rs))).toEqual(['Fremd', 'Clara', '  Jonas']);
  });
});

describe('Vollständig: Kreis ohne Verlust und ohne Doppel (AK5)', () => {
  const kennungen = (host) =>
    [...host.querySelectorAll('a.perspective-query-item')].map((a) => a.dataset.fmRecordId);

  it('Kreis, Kreis mit Anhang und Selbstbezug: jeder Datensatz genau einmal', () => {
    // A -> C -> B -> A ist ein Kreis, D hängt an A, S zeigt auf sich selbst.
    const rows = [
      person(1, 'A', 3),
      person(2, 'B', 1),
      person(3, 'C', 2),
      person(4, 'D', 1),
      person(5, 'S', 5),
      person(6, 'W', null),
    ];
    const host = html(menge(rows));
    expect(kennungen(host).sort()).toEqual(rows.map((r) => r.origin.id).sort());
    // Die Wurzel W zuerst, danach der erste nicht gezeichnete Datensatz in
    // Ergebnis-Reihenfolge als zusätzliche Wurzel, bis keiner übrig ist.
    expect(gestalt(host)).toEqual(['W', 'A', '  B', '    C', '  D', 'S']);
  });

  it('die Daten-Regel liefert jede Zeile genau einmal, auch bei vielen Kreisen', () => {
    const rows = [];
    for (let n = 1; n <= 60; n++) rows.push(person(n, `K${n}`, n % 3 === 0 ? n - 2 : n + 1));
    const reihe = treeLayout(rows).map((e) => e.index);
    expect(reihe.slice().sort((a, b) => a - b)).toEqual(rows.map((_, i) => i));
  });
});

describe('Ein Feld und der Weg vom Abfrage-Text (AK1, AK6)', () => {
  // Kontexte, wie der Erzeuger der Datensatz-Ebene sie dem Zeilen-Bau gibt:
  // zwei Verweis-Felder, Vater und Mutter, auf dieselbe Tabelle.
  const P = '/raum/Persons.md';
  const verweis = (n, name) => ({ ...makeRecordRef('Persons', id(n), name), path: P });
  function kontext(n, name, vater, mutter) {
    const values = new Map([
      ['name', name],
      ['father', vater],
      ['mother', mutter],
    ]);
    const refs = new Map([
      ['father', { status: vater ? 'ok' : 'empty' }],
      ['mother', { status: mutter ? 'ok' : 'empty' }],
    ]);
    return { record: { table: 'Persons', id: id(n), path: P, display: name, values, refs } };
  }
  const familie = () => [
    kontext(1, 'Adam', null, null),
    kontext(2, 'Eva', null, null),
    kontext(3, 'Kain', verweis(1, 'Adam'), verweis(2, 'Eva')),
    kontext(4, 'Henoch', verweis(3, 'Kain'), null),
  ];
  const baum = (text) =>
    buildResultSet(familie(), parseQuery(text).ast, { root: '/raum', fileCount: 1 });

  it('bei zwei Eltern-Feldern folgt der Baum allein dem genannten', () => {
    const vater = baum('LIST RECORDS FROM "Persons" DISPLAY tree BY father');
    expect(validateResultSet(vater)).toEqual([]);
    expect(gestalt(html(vater))).toEqual(['Adam', '  Kain', '    Henoch', 'Eva']);
    const mutter = baum('LIST RECORDS FROM "Persons" DISPLAY tree BY mother');
    expect(gestalt(html(mutter))).toEqual(['Adam', 'Eva', '  Kain', 'Henoch']);
  });

  // 4T-002077 (Epic 3E-000259, Festlegung 11): Eine gruppierte Abfrage passt zu
  // keinem Baum, auch wenn ihre Zeilen den Eltern-Verweis tragen; sie zeigt die
  // gruppierte Liste mit dem Hinweis «passt nicht», ohne Fehler.
  it('eine gruppierte Abfrage zeigt statt des Baums die gruppierte Liste mit Hinweis', () => {
    const rs = baum('LIST RECORDS FROM "Persons" GROUP BY father DISPLAY tree BY father');
    expect(validateResultSet(rs)).toEqual([]);
    expect(Array.isArray(rs.groups) && rs.rows.some((r) => r.parent !== undefined)).toBe(true);
    expect(isTreeSuitable(rs)).toBe(false);
    const host = html(rs);
    const unpassend = de['query.hint.displayFormUnsuitable'].replace('{name}', 'tree');
    expect(hinweis(host).textContent).toBe(unpassend);
    expect(host.querySelector('.perspective-query-tree, .perspective-query-error')).toBeNull();
    const titel = [...host.querySelectorAll('.perspective-query-group-title')];
    expect(titel.map((n) => n.textContent)).toEqual(['Adam', 'Kain', de['query.group.none']]);
    // Darunter genau die gruppierte Liste ohne Angabe.
    hinweis(host).remove();
    expect(host.innerHTML).toBe(html({ ...rs, wishes: makeWishes() }).innerHTML);
  });

  it('die Menge übersteht die Prozess-Grenze und zeichnet danach denselben Baum', () => {
    const rs = baum('LIST RECORDS FROM "Persons" DISPLAY tree BY father');
    const geklont = structuredClone(rs);
    expect(html(geklont).innerHTML).toBe(html(rs).innerHTML);
  });
});

describe('Knoten: Anzeige-Form und Klick in die Maske (AK2)', () => {
  let abhoeren = null;
  afterEach(() => {
    if (abhoeren) document.removeEventListener('scg:open-form', abhoeren);
    abhoeren = null;
  });

  it('ein Knoten ist derselbe Treffer wie in der Liste', () => {
    const rows = TEAM();
    const baum = html(menge(rows));
    const liste = html(menge(rows, { display: null }));
    const knoten = [...baum.querySelectorAll('a.perspective-query-item')];
    const treffer = [...liste.querySelectorAll('a.perspective-query-item')];
    const nachKennung = (as) => new Map(as.map((a) => [a.dataset.fmRecordId, a.outerHTML]));
    expect(nachKennung(knoten)).toEqual(nachKennung(treffer));
    const mats = knoten.find((a) => a.textContent === 'Mats');
    expect(mats.dataset.fmRecordTable).toBe(STAFF);
    expect(mats.dataset.fmRecordId).toBe('r-00004');
    expect(mats.dataset.fmPath).toBeUndefined();
    expect(mats.title).toBe('Staff#^r-00004');
  });

  it('ein Klick auf einen Knoten fordert die Maske mit Tabellen-Pfad und Kennung an', () => {
    const host = html(menge(TEAM()));
    document.body.appendChild(host);
    const angefordert = [];
    abhoeren = (e) => angefordert.push(e.detail);
    document.addEventListener('scg:open-form', abhoeren);
    // So wie beide Klick-Handler: erst erkennen, dann öffnen.
    host.addEventListener('click', (e) => openRecordHit(recordHitOf(e.target)));
    const pia = [...host.querySelectorAll('a')].find((a) => a.textContent === 'Pia');
    pia.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(angefordert).toEqual([{ filePath: STAFF, recordId: 'r-00007' }]);
    host.remove();
  });

  it('bei LIST mit Zusatzfeld hängt es wie in der Liste; die Spalten einer Tabelle zeigt der Baum nicht', () => {
    const spalte = makeColumn({ name: 'since', label: 'since', source: 'since' });
    const rows = [
      person(1, 'Clara', null, { values: [2005] }),
      person(2, 'Jonas', 1, { values: [2012] }),
    ];
    const liste = html(menge(rows, { columns: [spalte] }));
    expect(
      [...liste.querySelectorAll('.perspective-query-extra')].map((s) => s.textContent),
    ).toEqual(['2005', '2012']);
    const tabelle = html(menge(rows, { type: 'table', columns: [spalte] }));
    expect(gestalt(tabelle)).toEqual(['Clara', '  Jonas']);
    expect(tabelle.querySelector('table, .perspective-query-extra')).toBeNull();
  });
});

describe('Unpassend: Rückfall mit Hinweis (AK4)', () => {
  const unpassend = de['query.hint.displayFormUnsuitable'].replace('{name}', 'tree');

  it('andere Ebene, ohne BY, Feld ohne Verweis: Ausgabe ohne Angabe mit Hinweis', () => {
    const datei = makeRow([], fileOrigin('/raum/Alpha.md', 'Alpha'));
    const faelle = {
      'Datei-Ebene': menge([{ ...datei, parent: null }], { scope: 'files' }),
      'ohne BY': menge(TEAM(), { display: { form: 'tree', by: null } }),
      'kein Verweis-Feld': menge([person(1, 'Clara'), person(2, 'Jonas')]),
    };
    for (const [fall, rs] of Object.entries(faelle)) {
      expect(isTreeSuitable(rs), fall).toBe(false);
      const host = html(rs);
      expect(hinweis(host).textContent, fall).toBe(unpassend);
      expect(host.querySelector('.perspective-query-tree'), fall).toBeNull();
      expect(host.querySelector('.perspective-query-error'), fall).toBeNull();
      // Darunter genau die Ausgabe ohne Angabe.
      hinweis(host).remove();
      const ohne = html({ ...rs, wishes: makeWishes() });
      expect(host.innerHTML, fall).toBe(ohne.innerHTML);
    }
  });

  it('ein leeres Ergebnis zeigt «keine Treffer» der Datensatz-Ebene, keinen Baum', () => {
    const host = html(menge([]));
    expect(host.textContent).toBe(de['query.emptyRecords']);
    expect(host.querySelector('ul')).toBeNull();
  });

  it('im Aus-Zustand der Datenbank die leere Liste mit dem Hinweis der Ebene, kein Baum (AK6)', () => {
    // So liefert der Erzeuger die Ebene bei ausgeschalteter Datenbank: keine
    // Zeile, der Hinweis `databaseOff`; der Wunsch reist trotzdem mit.
    const host = html(menge([], { hint: 'databaseOff' }));
    expect(hinweis(host).textContent).toBe(de['query.hint.databaseOff']);
    expect(host.lastElementChild.textContent).toBe(de['query.emptyRecords']);
    expect(host.querySelector('ul, .perspective-query-error')).toBeNull();
  });

  it('der Hinweis des Zustands steht über dem Baum', () => {
    const host = html(menge(TEAM(), { hint: 'recordHullCycle' }));
    expect(hinweis(host).textContent).toBe(de['query.hint.recordHullCycle']);
    expect(host.lastElementChild.classList.contains('perspective-query-tree')).toBe(true);
  });
});

describe('Verzeichnis und Grenzen', () => {
  it('der Baum ist als Form «tree» eingetragen, ohne Rücksicht auf die Schreibung', () => {
    for (const form of ['tree', 'Tree', 'TREE']) {
      const rs = menge(TEAM(), { display: { form, by: 'boss' } });
      const { node, hint } = drawDisplayForm(rs, { translate: tStub });
      expect(hint, form).toBeNull();
      expect(node.classList.contains('perspective-query-tree'), form).toBe(true);
    }
  });

  it('eine lange Kette verschachtelt bis zur tiefsten Ebene, tiefere Knoten stehen dort ohne Verlust', () => {
    const anzahl = TREE_MAX_DEPTH + 8;
    const rows = [];
    for (let n = 1; n <= anzahl; n++) rows.push(person(n, `K${n}`, n === 1 ? null : n - 1));
    const host = html(menge(rows));
    const zeilen = gestalt(host);
    expect(zeilen.map((z) => z.trim())).toEqual(rows.map((r) => r.origin.display));
    const tiefe = (z) => (z.length - z.trimStart().length) / 2;
    expect(Math.max(...zeilen.map(tiefe))).toBe(TREE_MAX_DEPTH);
    expect(zeilen.slice(TREE_MAX_DEPTH).every((z) => tiefe(z) === TREE_MAX_DEPTH)).toBe(true);
  });
});
