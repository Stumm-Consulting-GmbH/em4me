// 4T-001955 (Epic 3E-000319): Die Auflösungs-Kette der Tafel-Einstellungen —
// je Einstellung der Wert der Tafel, sonst die globale Vorgabe.
//
// **Die eine Stelle, an der «Tafel vor Vorgabe» steht.** Zeichnung, Archiv,
// Dialog und die übrigen Funktionen der Stufe 3 fragen hier, statt die Regel je
// für sich zu wiederholen; eine zweite Stelle liefe bei der nächsten
// Einstellung auseinander.
//
// **Die Herkunft gehört zur Antwort** (Story 4S-000987, AK4): Der Dialog zeigt,
// ob ein Wert als Vorgabe gilt oder für diese Tafel gesetzt ist. Die Kette
// liefert deshalb je Einstellung `{ wert, herkunft }` und nicht nur den Wert.
//
// **Drei Einstellungen haben keine globale Vorgabe** — Zielordner, Vorlage,
// Feldwahl gibt es nur je Tafel. Ihre «Vorgabe» ist `null` und heißt: Ordner
// der Tafel, Auswahl beim Erzeugen, keine Angaben auf der Karte (Entscheidung
// C2 des Product Owners vom 2026-09-25).
//
// Prozessneutral (CJS, reine Daten), Muster der Nachbarn.
'use strict';

const { TAFEL_EINSTELLUNGEN } = require('./kanban-einstellungen.js');
const { KANBAN_VORGABEN, kanbanVorgabeWert } = require('../kanban-anzeige.js');

/**
 * Die wirksamen Einstellungen einer Tafel.
 *
 * @param {object|null} tafelWerte `werte` aus `leseTafelEinstellungen` bzw.
 *   `einstellungenAusModell`: nur die gesetzten Einstellungen, unter ihrem
 *   hiesigen Namen.
 * @param {object|null} globaleWerte der Stand der globalen Vorgaben,
 *   `{ 'kanban.tagsAmFuss': true, … }`; fehlende Werte fallen auf die Vorgabe
 *   der Liste.
 * @returns {Object<string, {wert: *, herkunft: 'tafel'|'vorgabe'}>}
 */
function wirksameEinstellungen(tafelWerte, globaleWerte) {
  const tafel = tafelWerte && typeof tafelWerte === 'object' ? tafelWerte : {};
  const global = globaleWerte && typeof globaleWerte === 'object' ? globaleWerte : {};
  const ergebnis = {};
  for (const eintrag of TAFEL_EINSTELLUNGEN) {
    if (Object.prototype.hasOwnProperty.call(tafel, eintrag.name) && tafel[eintrag.name] != null) {
      ergebnis[eintrag.name] = { wert: tafel[eintrag.name], herkunft: 'tafel' };
      continue;
    }
    const vorgabe = KANBAN_VORGABEN.find((v) => v.tafel === eintrag.name);
    ergebnis[eintrag.name] = {
      wert: vorgabe ? kanbanVorgabeWert(vorgabe, global[vorgabe.schluessel]) : null,
      herkunft: 'vorgabe',
    };
  }
  return ergebnis;
}

/**
 * Die Obergrenze des Archivs als Zahl der Karten, oder `null` für
 * «unbegrenzt». Ein Wert von 0 oder darunter ist unbegrenzt — beim Vorbild
 * heißt `-1` so, und `0` schneidet dort ebenfalls nichts ab.
 *
 * @param {*} wert
 * @returns {number|null}
 */
function archivObergrenzeAus(wert) {
  return Number.isSafeInteger(wert) && wert > 0 ? wert : null;
}

module.exports = {
  wirksameEinstellungen,
  archivObergrenzeAus,
};
