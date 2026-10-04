'use strict';

// 4T-002034 (Epic 3E-000260): Darstellung einer Ergebnismenge als Liste und als
// Tabelle. Das Modul beantwortet eine Frage: wie das DOM der Listen- und der
// Tabellen-Ausgabe einer Abfrage aus der Ergebnismenge (`resultSet`, Format-
// Vertrag in src/shared/query/result-set.js) entsteht. Es liest allein die
// Menge und nimmt Überschrift, Anzeige-Stücke und Anzeige-Name aus dem
// Darstellungs-Kern (src/shared/query/result-display.js).
//
// Das gezeichnete Ergebnis ist byte-gleich zu den bisherigen Bau-Funktionen
// `buildQueryListDom` und `buildQueryTableDom` (Entscheidung F3, Festlegung 6
// des Epics): dieselben Elemente, Klassen, `data-fm-*`-Angaben, Texte und
// Reihenfolge. Treffer-Klick, Anker-Sprung (`data-fm-anchor`) und
// Zeilen-Sprung (`data-fm-line`) übernehmen wie bisher die zentralen
// Klick-Handler; die Klassen teilt die Skript-Ausgabe. Nachweis ist der
// Vergleichs-Prüffall test/unit/renderer/ergebnismenge-vorher-nachher.test.js.
//
// 4T-002077 (Epic 3E-000259, Festlegung 10): Seit die Ergebnismenge auf allen
// Ebenen Gruppen trägt, zeichnet das Modul auch die gruppierte Liste der Datei-,
// Block- und Datensatz-Ebene (`buildGroupedListDom`), mit derselben Gruppen-Form
// wie die Aufgaben-Liste (display-tasks.js): je Gruppe `div.perspective-query-group`
// mit `data-level` und Überschrift (`groupWrap`, hier für beide Listen),
// darunter Untergruppen oder die Treffer über `listItem`.
//
// 4T-002078 (Epic 3E-000259, F1 Option A): Die gruppierte Tabelle zeigt eine
// Zeile je Gruppe der untersten Stufe (`buildGroupedTableDom`): vorn je
// Ausdruck von `GROUP BY` eine Spalte mit dem Gruppen-Wert an der Stelle der
// Spalte «Datei» bzw. «Datensatz», dahinter die Werte über der Gruppe.
//
// Zustände, Abfrage-Fehler, Leer-Fall und Hinweis gehören nicht hierher,
// sondern zum Einstieg der Befüllung (frontmatter-query-view.js), weil sie für
// jede Darstellungsform gleich sind. Bewusst nur shared-Importe und das
// injizierte `tFn`, damit der jsdom-Unit-Test ohne Preload-Brücke läuft.

import {
  columnHeader,
  cellSegments,
  displayName,
  groupTitle,
  walkGroups,
} from '../../../shared/query/result-display.js';
import { markRecordHit } from './record-hit-click.js';

// Klickbarer Treffer-Link aus der Herkunft einer Zeile: absoluter Index-Pfad
// als Klick-Ziel, beim Block der Anker mit ^-Präfix, bei der Aufgabe die
// Zeile (4T-000355, 4T-000409, 4T-000502).
// 4T-002040 (Epic 3E-000258): Ein Datensatz-Treffer trägt statt des Pfads die
// Angaben des Datensatz-Klicks (`record-hit-click.js`); sein Klick öffnet die
// Maske und nicht das Tabellen-Dokument.
function hitLink(origin) {
  const a = document.createElement('a');
  a.className = 'perspective-query-item';
  a.href = '#';
  a.textContent = displayName(origin);
  if (origin.kind === 'record') {
    markRecordHit(a, origin);
    return a;
  }
  a.title = origin.path;
  a.dataset.fmPath = origin.path;
  if (origin.kind === 'block' && typeof origin.anchor === 'string' && origin.anchor) {
    a.dataset.fmAnchor = '^' + origin.anchor;
  }
  if (origin.kind === 'task' && typeof origin.line === 'number') {
    a.dataset.fmLine = String(origin.line);
  }
  return a;
}

// 4T-000404 (Epic 3E-000076): Segment-Renderer für Tabellen-Zellen, das
// Listen-Zusatzfeld und die Gruppen-Titel der Aufgaben-Liste. { text } wird
// Text-Knoten, { link } ein Link über den bestehenden data-fm-path-Klick-Pfad.
// Defensive Prüfung, weil die Stücke über die Prozess-Grenze kommen können.
// 4T-001074 (Epic 3E-000211): Ein ausgezeichnetes Stück kommt in ein <strong>;
// die Marke sitzt am Stück und nicht an seiner Art, deshalb gilt sie für Text
// und Verweis gleichermaßen, und der Verweis bleibt klickbar.
// 4T-002040 (Epic 3E-000258): { record } wird ein Link mit den Angaben des
// Datensatz-Klicks, wie der Datensatz-Treffer selbst.
export function appendSegments(el, segments) {
  for (const seg of segments || []) {
    const ziel = seg && seg.bold ? document.createElement('strong') : el;
    if (seg && seg.link && typeof seg.link.path === 'string') {
      const a = document.createElement('a');
      a.className = 'perspective-query-item';
      a.href = '#';
      a.textContent = seg.link.name || seg.link.path;
      a.title = seg.link.path;
      a.dataset.fmPath = seg.link.path;
      ziel.appendChild(a);
    } else if (seg && seg.record && typeof seg.record.id === 'string') {
      const a = document.createElement('a');
      a.className = 'perspective-query-item';
      a.href = '#';
      a.textContent = seg.record.name || seg.record.id;
      markRecordHit(a, seg.record);
      ziel.appendChild(a);
    } else if (seg && typeof seg.text === 'string') {
      ziel.appendChild(document.createTextNode(seg.text));
    }
    if (ziel !== el) el.appendChild(ziel);
  }
}

/**
 * Ein Eintrag der Listen-Ausgabe: der klickbare Treffer, bei einem Zusatzfeld
 * dessen Anzeige-Stücke als gedämpfter Anhang. 4T-002044: auch der Knoten der
 * Baum-Darstellung (`display-tree.js`), damit Treffer und Klick dort dieselben sind.
 * @param {import('../../../shared/query/result-set.js').Row} row
 * @param {boolean} withExtra  die erste Spalte ist das Zusatzfeld einer Liste
 * @returns {HTMLLIElement}
 */
export function listItem(row, withExtra) {
  const li = document.createElement('li');
  li.appendChild(hitLink(row.origin));
  const extra = withExtra ? cellSegments(row.values[0]) : [];
  if (extra.length > 0) {
    const span = document.createElement('span');
    span.className = 'perspective-query-extra';
    appendSegments(span, extra);
    li.appendChild(span);
  }
  return li;
}

/**
 * Listen-Ausgabe (`LIST`) der Datei-, Block- und Datensatz-Ebene: je Zeile ein klickbarer
 * Treffer, bei einem Zusatzfeld dessen Anzeige-Stücke als gedämpfter Anhang.
 * Der Wunsch `COLUMNS` (2 bis 8) wird zum Anzeige-Attribut `data-fm-columns`
 * (4T-000405); die Spalten-Regeln liegen in styles.css.
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet
 * @returns {HTMLUListElement}
 */
export function buildListDom(resultSet) {
  return rowList(resultSet, resultSet.rows);
}

// Die Treffer-Liste über den genannten Zeilen, mit dem Wunsch `COLUMNS`; bei der
// gruppierten Liste je Gruppe eine, damit die Spalten innerhalb der Gruppe laufen.
function rowList(resultSet, rows) {
  const list = document.createElement('ul');
  list.className = 'perspective-query-list';
  const layoutColumns = resultSet.wishes && resultSet.wishes.layoutColumns;
  if (typeof layoutColumns === 'number' && layoutColumns >= 2 && layoutColumns <= 8) {
    list.dataset.fmColumns = String(layoutColumns);
  }
  // LIST trägt höchstens ein Zusatzfeld; es ist die erste Spalte der Menge.
  const withExtra = Array.isArray(resultSet.columns) && resultSet.columns.length > 0;
  for (const row of rows) list.appendChild(listItem(row, withExtra));
  return list;
}

/**
 * 4T-002077: Gruppierte Listen-Ausgabe (`LIST … GROUP BY`) der Datei-, Block- und
 * Datensatz-Ebene: je Gruppe eine Überschrift, die Ebene über `data-level`,
 * darunter die Untergruppen oder die Treffer der Gruppe wie in der Liste. Die
 * Gruppen kommen geordnet aus dem Zeilen-Bau, die Gruppe ohne Wert zuletzt.
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet  mit `groups`
 * @param {(key: string) => string} tFn  für die Gruppe ohne Wert
 * @returns {DocumentFragment}
 */
export function buildGroupedListDom(resultSet, tFn) {
  const frag = document.createDocumentFragment();
  walkGroups(
    resultSet,
    (group, level, parent) => {
      const wrap = groupWrap(group, level, tFn);
      if (!Array.isArray(group.groups)) {
        const rows = group.rows.map((i) => resultSet.rows[i]);
        wrap.appendChild(rowList(resultSet, rows));
      }
      parent.appendChild(wrap);
      return wrap;
    },
    frag,
  );
  return frag;
}

/**
 * Hülle einer Gruppe mit ihrer Überschrift, für die gruppierte Liste und die
 * Aufgaben-Liste (4T-000503): `div.perspective-query-group` mit `data-level`;
 * die Optik steht in frontmatter.css.
 * @param {import('../../../shared/query/result-set.js').Group} group
 * @param {number} level  0 für die äußerste Ebene
 * @param {(key: string) => string} tFn
 * @returns {HTMLDivElement}
 */
export function groupWrap(group, level, tFn) {
  const wrap = document.createElement('div');
  wrap.className = 'perspective-query-group';
  wrap.dataset.level = String(level);
  wrap.appendChild(groupTitleNode(group.value, tFn));
  return wrap;
}

// 4T-001074 (Epic 3E-000211): Trägt der Gruppen-Wert Anzeige-Stücke, werden sie
// gebaut (nur so überlebt eine Hervorhebung bis in den Titel); ohne Stücke
// bleibt es beim reinen Text. Die Gruppe ohne Wert zeigt den lokalisierten
// Text. 4T-002077: aus display-tasks.js hierher, damit beide Listen dieselbe
// Überschrift bauen; ein Datensatz-Verweis als Gruppen-Wert wird ein Link mit
// den Angaben des Datensatz-Klicks (`appendSegments`).
function groupTitleNode(value, tFn) {
  const title = document.createElement('div');
  title.className = 'perspective-query-group-title';
  appendGroupValue(title, value, tFn);
  return title;
}

// Der Gruppen-Wert in einem Element, für Überschrift und Gruppen-Spalte gleich.
function appendGroupValue(el, value, tFn) {
  const { label, segments } = groupTitle(value);
  if (label !== null && segments.length > 0) appendSegments(el, segments);
  else el.textContent = label === null ? tFn('query.group.none') : label;
}

/**
 * Tabellen-Ausgabe (`TABLE`) aller Ebenen: erste Spalte der klickbare
 * Treffer (entfällt beim Wunsch `WITHOUT ID`), danach je Spalte eine Zelle aus
 * Anzeige-Stücken; die Kopfzeile aus der Spalten-Überschrift. Die Optik erbt
 * von `.markdown-body table`, die Zusatz-Klasse trägt nur Abstände. Die erste
 * Spalte heißt «Datei», auf der Datensatz-Ebene «Datensatz» (4T-002040).
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet
 * @param {(key: string) => string} tFn
 * @returns {HTMLTableElement}
 */
export function buildTableDom(resultSet, tFn) {
  const withoutId = !!(resultSet.wishes && resultSet.wishes.withoutId);
  const el = document.createElement('table');
  el.className = 'perspective-query-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  if (!withoutId) {
    const th = document.createElement('th');
    th.textContent = tFn(
      resultSet.scope === 'records' ? 'query.table.recordColumn' : 'query.table.fileColumn',
    );
    headRow.appendChild(th);
  }
  for (const column of resultSet.columns) {
    const th = document.createElement('th');
    th.textContent = columnHeader(column);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  el.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of resultSet.rows) {
    const tr = document.createElement('tr');
    if (!withoutId) {
      const td = document.createElement('td');
      td.appendChild(hitLink(row.origin));
      tr.appendChild(td);
    }
    for (const value of row.values) {
      const td = document.createElement('td');
      appendSegments(td, cellSegments(value));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  el.appendChild(tbody);
  return el;
}

/**
 * 4T-002078 (Epic 3E-000259, F1 Option A): Gruppierte Tabellen-Ausgabe
 * (`TABLE … GROUP BY`) aller Ebenen, eine Zeile je Gruppe der untersten Stufe in
 * der Reihenfolge der Gruppen. Vorn je Ausdruck von `GROUP BY` eine Spalte mit
 * dem Gruppen-Wert ihrer Stufe (die Gruppe ohne Wert mit dem lokalisierten
 * Text, ein Datensatz-Verweis als Link in die Maske), Kopf aus der
 * Gruppen-Spalte der Menge; der Wunsch `WITHOUT ID` blendet sie aus wie die
 * Spalte «Datei». Dahinter je Spalte der Wert über der Gruppe (`values`).
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet  mit `groups`
 * @param {(key: string) => string} tFn
 * @returns {HTMLTableElement}
 */
export function buildGroupedTableDom(resultSet, tFn) {
  const withoutId = !!(resultSet.wishes && resultSet.wishes.withoutId);
  const groupColumns = Array.isArray(resultSet.groupColumns) ? resultSet.groupColumns : [];
  const el = document.createElement('table');
  el.className = 'perspective-query-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  // Je Stufe eine führende Spalte, auch wenn die Menge ihre Beschreibung nicht trägt.
  let depth = 0;
  for (let list = resultSet.groups; Array.isArray(list) && list.length > 0; depth++) {
    list = list[0].groups;
  }
  const leading = withoutId ? [] : Array.from({ length: depth }, (_, k) => groupColumns[k]);
  for (const column of [...leading, ...resultSet.columns]) {
    const th = document.createElement('th');
    th.textContent = columnHeader(column);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  el.appendChild(thead);
  const tbody = document.createElement('tbody');
  walkGroups(
    resultSet,
    (group, level, path) => {
      const chain = [...path, group.value];
      if (Array.isArray(group.groups)) return chain;
      const tr = document.createElement('tr');
      for (const value of withoutId ? [] : chain) {
        const td = document.createElement('td');
        appendGroupValue(td, value, tFn);
        tr.appendChild(td);
      }
      const values = Array.isArray(group.values) ? group.values : [];
      resultSet.columns.forEach((_, j) => {
        const td = document.createElement('td');
        appendSegments(td, cellSegments(values[j] === undefined ? null : values[j]));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
      return chain;
    },
    [],
  );
  el.appendChild(tbody);
  return el;
}
