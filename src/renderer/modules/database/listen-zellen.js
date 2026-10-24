// 4T-002251 (Epic 3E-000262, S2, S4): Die Zellen einer Zeile der Listen-Maske,
// ausgezogen aus dem Zeilen-Modul (`listen-zeile.js`, 4T-002250), als es mit
// Anlegen und Löschen über sein Budget gewachsen wäre.
//
// **Bearbeitbar sind allein die Zellen, deren Spalte genau ein Feld nennt**
// (`data-db-list-field`, S2). In der Bearbeitung tragen sie die Feld-Elemente
// der Maske (S4, `masken-felder.js`) samt Wertehilfe eines Verweis-Feldes;
// danach kehrt der gemerkte Text zurück. Dazu die Treffer-Fragen, mit denen die
// Zeile Maus-Druck, Klick und Doppelklick zuordnet.
//
// Reine Funktionen über dem Zustands-Objekt einer Zeile, ohne Import des
// Fenster-Zustands.
'use strict';

import { MODUS_BEARBEITEN, baueFeldElement } from './masken-felder.js';
import { markiereFeld } from './masken-speichern.js';

/**
 * Liegt das Ziel in einem Eingabe-Element?
 *
 * @param {EventTarget|null} ziel
 * @returns {boolean}
 */
export function istEingabe(ziel) {
  return ziel instanceof Element && !!ziel.closest('input, textarea, select, label');
}

/**
 * Maus-Druck und Klick in einem Bereich erreichen die zentralen Klick-Handler
 * nicht. `halten(ziel)` sagt, ob zusätzlich die Auswahl des Browsers
 * ausbleibt: Im Live-Widget setzte sie sonst die Schreibmarke in den Block und
 * klappte ihn zum Quelltext auf (Muster `listen-maske.js`, Blättern). Seit
 * 4T-002325 hier statt im Zeilen-Modul, das an seinem Budget steht.
 *
 * @param {HTMLElement} knoten
 * @param {(ziel: EventTarget|null) => boolean} halten
 */
export function abschirmen(knoten, halten) {
  knoten.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (halten(event.target)) event.preventDefault();
  });
  knoten.addEventListener('click', (event) => event.stopPropagation());
}

/**
 * Ein eigener Treffer in einer Zelle (Datei-Link, Datensatz-Verweis), der dem
 * Klick der Zeile vorgeht (`record-hit-click.js`).
 *
 * @param {HTMLTableRowElement} tr
 * @param {EventTarget|null} ziel
 * @returns {boolean}
 */
export function innererTreffer(tr, ziel) {
  const treffer =
    ziel instanceof Element ? ziel.closest('[data-fm-path], [data-fm-record-id]') : null;
  return !!treffer && treffer !== tr && tr.contains(treffer);
}

/**
 * Die bearbeitbare Zelle dieser Zeile, in der das Ziel liegt, oder null.
 *
 * @param {HTMLTableRowElement} tr
 * @param {EventTarget|null} ziel
 * @returns {HTMLTableCellElement|null}
 */
export function bearbeitbareZelle(tr, ziel) {
  const td = ziel instanceof Element ? ziel.closest('td[data-db-list-field]') : null;
  return td && td.parentElement === tr ? td : null;
}

/**
 * Die Felder der bearbeitbaren Zellen einer Zeile, in der Reihenfolge der
 * Zellen, soweit die Definition sie kennt.
 *
 * @param {HTMLTableRowElement} tr
 * @param {Array<object>} fields Die Felder der Definition.
 * @returns {Array<object>}
 */
export function felderDerZeile(tr, fields) {
  const namen = [];
  for (const td of tr.querySelectorAll('td[data-db-list-field]')) {
    if (!namen.includes(td.dataset.dbListField)) namen.push(td.dataset.dbListField);
  }
  return namen
    .map((name) => (fields || []).find((f) => f && f.name === name))
    .filter((feld) => !!feld);
}

/**
 * Zeichnet die bearbeitbaren Zellen: in der Bearbeitung die Feld-Elemente mit
 * den Befunden, sonst den gemerkten Text.
 *
 * @param {object} zustand Das Zustands-Objekt der Zeile.
 * @param {boolean} bearbeitet Ist die Zeile in Bearbeitung?
 * @param {string|null} sprache Aktive Sprache.
 */
export function zeichneZellen(zustand, bearbeitet, sprache) {
  const felder = new Map(zustand.felder.map((f) => [f.name, f]));
  // 4T-002312: die gesperrten Felder aus dem frischen Stand der Zeile; ihre
  // Zelle zeigt den Wert lesend mit Titel, der Entwurf behält den gelesenen Text.
  const gesperrt = new Set(
    zustand.daten && Array.isArray(zustand.daten.gesperrteFelder)
      ? zustand.daten.gesperrteFelder
      : [],
  );
  for (const td of zustand.tr.querySelectorAll('td[data-db-list-field]')) {
    const feld = felder.get(td.dataset.dbListField);
    if (!bearbeitet || !feld) {
      const vorher = zustand.lesend.get(td);
      if (vorher) td.replaceChildren(...vorher);
      continue;
    }
    if (!zustand.lesend.has(td)) zustand.lesend.set(td, [...td.childNodes]);
    const zelle = zustand.daten.zellen.find((z) => z && z.name === feld.name) || null;
    const element = baueFeldElement({
      feld,
      zelle,
      modus: MODUS_BEARBEITEN,
      text: zustand.entwurf[feld.name],
      sprache,
      ...zustand.verweise.optionen(feld),
      beiAenderung: (name, text) => {
        if (zustand.entwurf) zustand.entwurf[name] = text;
      },
      gesperrt: gesperrt.has(feld.name),
    });
    markiereFeld(element, zustand.befunde);
    td.replaceChildren(element);
  }
  if (!bearbeitet) zustand.lesend.clear();
}

/**
 * Setzt den Fokus in das genannte Feld der Zeile, sonst in das erste.
 *
 * @param {HTMLTableRowElement} tr
 * @param {string|null} name
 */
export function fokussiere(tr, name) {
  const eingaben = [...tr.querySelectorAll('.db-form-field')];
  // 4T-002312: ohne genanntes Feld das erste mit Eingabe, nicht ein gesperrtes.
  const ziel =
    (name && eingaben.find((f) => f.dataset.field === name)) ||
    eingaben.find((f) => f.querySelector('.db-form-input'));
  const eingabe = ziel ? ziel.querySelector('.db-form-input') : null;
  if (eingabe && typeof eingabe.focus === 'function') eingabe.focus();
}
