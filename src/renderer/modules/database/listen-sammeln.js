// 4T-002253 (Epic 3E-000262, F5 A, S7; Vorab-Festlegung 2): Der sammelnde
// Modus des Zeilen-Moduls (`listen-zeile.js`) im Positions-Bereich einer
// Einzel-Maske.
//
// **Im Positions-Bereich schreibt keine Zeile für sich** (S7). Das «Speichern»
// einer Zeile übergibt ihre Anweisung an die Maske, die sie mit dem Kopf in
// einem Auftrag schreibt; die Zeile ist danach **vorgemerkt**: Ihre Zellen
// zeigen den Entwurf als Lese-Text, sie trägt die Klasse
// `db-list-row-pending` (gelöscht: `db-list-row-deleted`, die Zellen bleiben
// und sind durchgestrichen) und einen Titel, und ihre Sperre bleibt gehalten,
// bis die Maske speichert oder verwirft (`gebeFrei`). Eine vorgemerkte Zeile
// lässt sich erneut bearbeiten oder löschen, ohne die Sperre neu zu nehmen;
// «Abbrechen» kehrt dann zum vorgemerkten Stand zurück und nicht zum
// gespeicherten, weil die Vormerkung bestehen bleibt.
//
// Nachtrag (Sitzungs-Entscheidung zu 4T-002253): Wird eine vorgemerkte Zeile
// auf ihren gelesenen Stand zurückgesetzt, entfällt ihre Vormerkung
// (`vergiss`), die Zellen zeigen wieder den gelesenen Stand, und die Sperre
// bleibt wie bei jeder vorgemerkten Zeile bis zum Ende der Maske gehalten.
// Vor dem Speichern der Maske wird eine offen bearbeitete Zeile vorgemerkt wie
// mit ihrem eigenen «Speichern» (`speichereOffene`).
//
// Eigenes Modul, damit das Zeilen-Modul unter seinem Budget bleibt. Es arbeitet
// auf den Zustands-Objekten der Zeilen und bekommt den Kern des Zeilen-Moduls
// herein; ohne Import des Fenster-Zustands.
'use strict';

import { fokussiere } from './listen-zellen.js';
import { ZWECK_LOESCHEN } from './masken-sperre.js';

/** Klasse einer vorgemerkten Zeile. */
export const ZEILE_VORGEMERKT_KLASSE = 'db-list-row-pending';
/** Klasse einer zum Löschen vorgemerkten Zeile. */
export const ZEILE_GELOESCHT_KLASSE = 'db-list-row-deleted';

const AENDERN = 'aendern';
const LOESCHEN = 'loeschen';

/**
 * Zeigt eine vorgemerkte Zeile: Klasse, Titel und den Entwurf als Lese-Text
 * ihrer bearbeitbaren Zellen; eine gelöschte behält ihre Zellen.
 *
 * @param {object} zustand Das Zustands-Objekt der Zeile.
 * @param {Function} t Übersetzung.
 */
export function zeigeVorgemerkt(zustand, t) {
  const tr = zustand.tr;
  const geloescht = zustand.vorgemerkt === LOESCHEN;
  tr.classList.toggle(ZEILE_VORGEMERKT_KLASSE, !geloescht);
  tr.classList.toggle(ZEILE_GELOESCHT_KLASSE, geloescht);
  tr.title = t(geloescht ? 'database.list.pendingDelete' : 'database.list.pending');
  if (geloescht || !zustand.entwurf) return;
  if (!zustand.gelesen) zustand.gelesen = new Map();
  for (const td of tr.querySelectorAll('td[data-db-list-field]')) {
    const name = td.dataset.dbListField;
    // Der gelesene Stand der Zelle, für das Zurücknehmen der Vormerkung.
    if (!zustand.gelesen.has(td)) zustand.gelesen.set(td, [...td.childNodes]);
    if (Object.prototype.hasOwnProperty.call(zustand.entwurf, name))
      td.textContent = zustand.entwurf[name];
  }
}

/**
 * Ist die Zeile zum Löschen vorgemerkt? Dann bietet sie keinen Handgriff mehr.
 *
 * @param {object} zustand
 * @returns {boolean}
 */
export function istGeloescht(zustand) {
  return zustand.vorgemerkt === LOESCHEN;
}

/**
 * Erzeugt den Sammler einer Liste.
 *
 * @param {object} k Der Kern des Zeilen-Moduls.
 * @param {Set<object>} k.offen Die Zustände mit gehaltener Sperre des Fensters.
 * @param {() => object|null} k.aktiv Die Zeile in Bearbeitung.
 * @param {(zustand: object) => void} k.uebernimm Zur Zeile in Bearbeitung machen.
 * @param {(zustand: object) => void} k.loese Ist sie die Zeile in Bearbeitung,
 *   ist es danach keine mehr.
 * @param {(zustand: object) => void} k.zeichne Die Zeile neu zeichnen.
 * @param {() => void} k.frei Blättern und Handgriffe freigeben.
 * @param {{LESEND: string, BEARBEITEN: string, FRAGE: string}} k.phasen
 * @param {() => Promise<void>|void} k.speichern «Speichern» der Zeile in Bearbeitung.
 * @returns {{vorgemerkt: Map, hat: Function, merke: Function, wieder: Function,
 *   zurueck: Function, vergiss: Function, speichereOffene: Function, gebeFrei: Function}}
 */
export function erzeugeSammler(k) {
  const vorgemerkt = new Map();
  return {
    vorgemerkt,
    /** Ist die Zeile vorgemerkt oder war sie es (Sperre im Sammler)? */
    hat: (zustand) => vorgemerkt.has(zustand.tr),
    /** Nach dem übergebenen Auftrag: die Zeile vormerken, Sperre behalten. */
    merke(zustand, geloescht) {
      zustand.vorgemerkt = geloescht ? LOESCHEN : AENDERN;
      zustand.vorher = null;
      zustand.befunde = null;
      zustand.auftrag = null;
      zustand.phase = k.phasen.LESEND;
      vorgemerkt.set(zustand.tr, zustand);
      k.offen.add(zustand);
      k.loese(zustand);
      k.zeichne(zustand);
      k.frei();
    },
    /** Eine vorgemerkte Zeile erneut bearbeiten oder löschen; gelöscht nie. */
    wieder(zustand, zweck) {
      if (istGeloescht(zustand)) return;
      k.uebernimm(zustand);
      if (zweck === ZWECK_LOESCHEN) {
        zustand.phase = k.phasen.FRAGE;
      } else {
        zustand.vorher = { ...zustand.entwurf };
        zustand.phase = k.phasen.BEARBEITEN;
      }
      k.zeichne(zustand);
      if (zustand.phase === k.phasen.BEARBEITEN) fokussiere(zustand.tr, null);
    },
    /** «Abbrechen» einer vorgemerkten Zeile: zurück zum vorgemerkten Stand. */
    zurueck(zustand) {
      if (zustand.vorher) zustand.entwurf = zustand.vorher;
      zustand.vorher = null;
      zustand.befunde = null;
      zustand.phase = k.phasen.LESEND;
      k.loese(zustand);
      k.zeichne(zustand);
      k.frei();
    },
    /**
     * Die Zeile ist auf ihren gelesenen Stand zurückgesetzt: Vormerkung weg,
     * gelesene Zellen zurück, die Sperre bleibt (im Sammler, bis `gebeFrei`).
     * `zuruecknehmen` ist die Naht der Liste, die die Anweisung austrägt.
     */
    vergiss(zustand, zuruecknehmen) {
      zustand.vorgemerkt = null;
      zustand.vorher = null;
      zustand.befunde = null;
      zustand.phase = k.phasen.LESEND;
      if (typeof zuruecknehmen === 'function')
        zuruecknehmen({ tabelle: zustand.tabellenPfad, id: zustand.kennung });
      k.loese(zustand);
      k.zeichne(zustand);
      for (const [td, knoten] of zustand.gelesen || []) td.replaceChildren(...knoten);
      zustand.gelesen = null;
      zustand.tr.classList.remove(ZEILE_VORGEMERKT_KLASSE);
      zustand.tr.removeAttribute('title');
      k.frei();
    },
    /**
     * Vor dem Speichern der Maske: eine offen bearbeitete Zeile vormerken wie
     * mit ihrem «Speichern». Liefert false, wenn sie danach weiter in
     * Bearbeitung steht, weil sie abgewiesen wurde.
     *
     * @returns {Promise<boolean>}
     */
    async speichereOffene() {
      const offen = k.aktiv();
      if (!offen || offen.phase !== k.phasen.BEARBEITEN) return true;
      await k.speichern();
      return k.aktiv() !== offen;
    },
    /** Alle Sperren der Liste freigeben, nach Speichern oder Verwerfen der Maske. */
    gebeFrei() {
      const alle = [...vorgemerkt.values()];
      const aktiv = k.aktiv();
      if (aktiv && !alle.includes(aktiv)) alle.push(aktiv);
      vorgemerkt.clear();
      for (const zustand of alle) {
        zustand.gueltig = false;
        k.loese(zustand);
        k.offen.delete(zustand);
        void zustand.sperrAblauf.freigeben();
      }
      if (aktiv) k.frei();
    },
  };
}
