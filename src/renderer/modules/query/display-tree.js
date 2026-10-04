'use strict';

// 4T-002044 (Epic 3E-000258, Entscheidungen F1 Option A, F2 Option A und F3b):
// Baum-Darstellung einer Datensatz-Abfrage, `DISPLAY tree BY <Verweis-Feld>`.
// Das Modul beantwortet eine Frage: wie aus der Ergebnismenge ein eingerückter
// Baum entlang eines Verweis-Feldes wird. Es ist eine Form des Verzeichnisses
// `display-forms.js`, das sie unter dem Namen `tree` einträgt; dieses Modul
// kennt das Verzeichnis nicht.
//
// **Woher der Eltern-Verweis kommt.** Der Zeilen-Bau des Haupt-Prozesses
// (`src/main/index/query-result-set.js`) legt bei `DISPLAY tree BY <Feld>` an
// jede Datensatz-Zeile, deren Tabelle das Feld als Verweis-Feld führt, die
// Angabe `parent`: den Datensatz-Verweis des Feldes oder null (leer, ins Leere,
// mehrdeutig). Der Autor muss das Feld deshalb nicht als Spalte nennen. Trägt
// keine Zeile die Angabe, ist das Feld kein Verweis-Feld, und der Baum passt
// nicht.
//
// **Daten-Regel** (Story 4S-001035):
//   - Der Schlüssel eines Knotens ist Kopf-Datei der Tabelle und Kennung, wie bei
//     der transitiven Hülle (`hullKey` in src/main/index/record-hull.js), weil
//     die Kennung nur je Tabelle eindeutig ist.
//   - Ein Datensatz hängt unter dem Datensatz, auf den sein Eltern-Verweis
//     zeigt, wenn dieser in der Menge ist; sonst ist er eine Wurzel.
//   - Wurzeln und Geschwister stehen in der Reihenfolge des Ergebnisses.
//   - Jeder Datensatz erscheint genau einmal. Die Mitglieder eines Kreises haben
//     ihre Eltern alle in der Menge und damit keine Wurzel; nach dem Durchlauf
//     wird deshalb der erste noch nicht gezeichnete Datensatz in
//     Ergebnis-Reihenfolge zur zusätzlichen Wurzel, bis keiner übrig ist.
//     Gezeichnet wird ohne Rekursion und mit einer Merkliste, der Aufbau läuft
//     also nie im Kreis.
//
// **Knoten** sind die Einträge der Liste (`listItem` aus display-list-table.js):
// Anzeige-Form, Angaben des Datensatz-Klicks, Klick in die Maske; bei `LIST`
// mit Zusatzfeld hängt es gedämpft dahinter wie in der Liste.
//
// **Kein Knoten-Budget.** Der Baum zeichnet je Zeile genau einen Knoten wie die
// Liste, seine Größe begrenzt `LIMIT` wie dort. Begrenzt ist allein die
// Verschachtelung (`TREE_MAX_DEPTH`, der Wert der Tiefen-Grenze der
// Skript-Ausgabe): Tiefere Knoten stehen in der tiefsten Ebene, in
// Baum-Reihenfolge und ohne Verlust, damit eine lange Kette die Ansicht nicht
// über den Rand schiebt.
//
// Bewusst ohne Preload-Bezug, damit der jsdom-Unit-Test ohne Preload-Brücke läuft.

import { pathCompareKey } from '../../../shared/platform.js';
import { listItem } from './display-list-table.js';

/** Tiefste gezeichnete Ebene (die Wurzeln sind Ebene 0). */
export const TREE_MAX_DEPTH = 32;

function nodeKey(path, id) {
  return `${pathCompareKey(typeof path === 'string' ? path : '')}\n${id}`;
}

// Der Eltern-Verweis einer Zeile, sofern er auf einen Datensatz mit Tabelle und
// Kennung zeigt; sonst null.
function parentRefOf(row) {
  const ref = row.parent;
  if (!ref || typeof ref !== 'object' || ref.kind !== 'record') return null;
  return typeof ref.path === 'string' && ref.path && typeof ref.id === 'string' && ref.id
    ? ref
    : null;
}

/**
 * Daten-Regel des Baums: die Zeilen in Zeichen-Reihenfolge (vorwärts, Eltern vor
 * ihren Kindern) mit ihrer Tiefe. Jede Zeile kommt genau einmal vor.
 * @param {import('../../../shared/query/result-set.js').Row[]} rows
 * @returns {Array<{ index: number, depth: number }>}
 */
export function treeLayout(rows) {
  const indexOf = new Map();
  rows.forEach((row, i) => {
    const key = nodeKey(row.origin.path, row.origin.id);
    if (!indexOf.has(key)) indexOf.set(key, i);
  });
  const children = rows.map(() => []);
  const roots = [];
  rows.forEach((row, i) => {
    const ref = parentRefOf(row);
    const parent = ref ? indexOf.get(nodeKey(ref.path, ref.id)) : undefined;
    if (parent === undefined) roots.push(i);
    else children[parent].push(i);
  });
  const placed = new Array(rows.length).fill(false);
  const out = [];
  const walk = (start) => {
    const stack = [{ index: start, depth: 0 }];
    while (stack.length > 0) {
      const { index, depth } = stack.pop();
      if (placed[index]) continue;
      placed[index] = true;
      out.push({ index, depth });
      // Rückwärts auf den Stapel, damit die Geschwister vorwärts herauskommen.
      const kids = children[index];
      for (let k = kids.length - 1; k >= 0; k--) stack.push({ index: kids[k], depth: depth + 1 });
    }
  };
  for (const root of roots) walk(root);
  // Kreise: Wer nach dem Durchlauf nicht gezeichnet ist, hat keine Wurzel.
  for (let i = 0; i < rows.length; i++) if (!placed[i]) walk(i);
  return out;
}

/**
 * Eignung: Datensatz-Ebene, Feld nach `BY` genannt und als Verweis-Feld
 * erkennbar, weil mindestens eine Zeile den Eltern-Verweis trägt.
 * 4T-002077 (Epic 3E-000259, Festlegung 11): Eine gruppierte Menge passt nie,
 * weil Gruppen und Baum zwei Gliederungen derselben Zeilen wären; der Verteiler
 * fällt dann mit dem Hinweis «passt nicht» auf die gruppierte Ausgabe zurück.
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet
 * @returns {boolean}
 */
export function isTreeSuitable(resultSet) {
  const wish = resultSet.wishes && resultSet.wishes.display;
  const by = wish ? wish.by : null;
  return (
    resultSet.scope === 'records' &&
    !Array.isArray(resultSet.groups) &&
    typeof by === 'string' &&
    by !== '' &&
    resultSet.rows.some((row) => row.parent !== undefined)
  );
}

/**
 * Zeichnet den Baum als verschachtelte Liste. Die Wurzel-Ebene ist die
 * Abfrage-Liste, jede tiefere Ebene eine eingerückte Unter-Liste im Eintrag
 * ihres Eltern-Knotens.
 * @param {import('../../../shared/query/result-set.js').ResultSet} resultSet
 * @returns {HTMLUListElement}
 */
export function renderTree(resultSet) {
  const root = document.createElement('ul');
  root.className = 'perspective-query-list perspective-query-tree';
  // Nur die Liste hat ein Zusatzfeld; die Spalten einer Tabelle zeigt der Baum nicht.
  const withExtra = resultSet.type === 'list' && resultSet.columns.length > 0;
  // Der zuletzt gezeichnete Eintrag je Ebene: In Zeichen-Reihenfolge ist der
  // jüngste Eintrag der Ebene darüber der Eltern-Knoten.
  const lastItem = [];
  for (const { index, depth } of treeLayout(resultSet.rows)) {
    const level = Math.min(depth, TREE_MAX_DEPTH);
    let list = root;
    if (level > 0) {
      const parentItem = lastItem[level - 1];
      list = parentItem.lastElementChild;
      if (!list || list.tagName !== 'UL') {
        list = document.createElement('ul');
        list.className = 'perspective-query-subtree';
        parentItem.appendChild(list);
      }
    }
    const li = listItem(resultSet.rows[index], withExtra);
    list.appendChild(li);
    lastItem[level] = li;
  }
  return root;
}

/** Die Form für das Verzeichnis der Darstellungsformen (`display-forms.js`). */
export const treeForm = { isSuitable: isTreeSuitable, render: renderTree };
