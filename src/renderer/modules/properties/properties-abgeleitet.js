// 4T-001185 (Epic 3E-000221, E1): Die abgeleiteten Felder eines Dokuments in die
// Feld-Liste eines Panels bauen.
//
// **Warum eine eigene Datei und nicht bei den übrigen neuen Typen.** Die
// Bedienelemente der Stufe 2 liegen in `properties-neue-typen.js`, und dorthin
// gehört auch die Anzeige eines abgeleiteten Wertes — sie steht dort. Was hier
// liegt, ist der Schritt davor: die Frage, WELCHE Felder überhaupt zusätzlich
// entstehen, und ihre Auswertung. Das ist eine eigene Fachlichkeit, und das
// Bedienelement-Modul stünde mit ihr dicht am Datei-Budget.
//
// **Der Zeilen-Bau kommt als Parameter herein.** Beide Panels bauen ihre
// Feld-Zeilen selbst (`buildPropertyFieldDom` bzw. `buildFieldRow`), und ein
// Import dieser Funktionen machte aus diesem Modul einen Teilnehmer der
// Import-Zyklen des Ordners. Dasselbe Mittel wie bei `onOpen` in
// `properties-neue-typen.js`: Die Panels reichen ihren Bau ein, hier bleibt
// die gemeinsame Regel.
'use strict';

import { DERIVED_TYPES, werteAbgeleiteteFelder } from '../../../shared/property-profiles.js';
import {
  MARKE_ABGELEITET,
  setzeAbgeleitetenWert,
  sperreAbgeleitetesFeld,
} from './properties-neue-typen.js';

/**
 * Die abgeleiteten Definitionen einer Auflösung, in Auflösungs-Reihenfolge.
 */
export function abgeleiteteDefinitionen(aufloesung) {
  const felder = (aufloesung && Array.isArray(aufloesung.fields) && aufloesung.fields) || [];
  return felder.filter((def) => def && DERIVED_TYPES.includes(def.type));
}

/**
 * Die abgeleiteten Felder anhängen: rechnen, bauen, sperren.
 *
 * Die Formel-Werte entstehen hier und synchron — sie kosten nur die Felder
 * desselben Dokuments (Konzept 6.11). Ein Lookup-Wert entsteht dagegen erst,
 * wenn seine Zeile im DOM hängt; sein Anzeige-Element holt ihn selbst nach
 * (`attachLookupWerte`). Beide Wege treffen sich in derselben Zeile.
 *
 * @param {HTMLElement} container Feld-Container des Panels.
 * @param {object} opts
 * @param {object} opts.aufloesung Profil-Auflösung der Pane.
 * @param {object} opts.werte Werte des Dokuments bzw. Blocks.
 * @param {Function} opts.baueZeile (def, wert, hinweis) -> Feld-Zeile.
 * @returns {number} Zahl der gebauten Zeilen (Prüf-Zugang).
 */
export function baueAbgeleiteteFelder(container, opts) {
  const { aufloesung = null, werte = {}, baueZeile = null } = opts || {};
  if (!container || typeof baueZeile !== 'function') return 0;
  const definitionen = abgeleiteteDefinitionen(aufloesung);
  if (definitionen.length === 0) return 0;

  // Gerechnet wird über die GANZE Feld-Liste, nicht nur über die abgeleiteten:
  // Ein Ausdruck darf sich auf jedes Feld des Dokuments beziehen, und die
  // Auswertung braucht sie, um «leer» von «gibt es nicht» zu unterscheiden.
  const ergebnis = werteAbgeleiteteFelder(aufloesung.fields, werte);

  let gebaut = 0;
  for (const def of definitionen) {
    const treffer = ergebnis[def.name.toLowerCase()] || { value: null, hint: null };
    // Ein Lookup rechnet nicht lokal; sein Hinweis «keine Rechenvorschrift»
    // aus der lokalen Auswertung gilt für ihn nicht — er holt seinen Wert
    // selbst und meldet selbst, wenn nichts zu holen ist.
    const hinweis = def.type === 'lookup' ? null : treffer.hint;
    const wert = def.type === 'lookup' ? null : treffer.value;
    const zeile = baueZeile(def, wert, hinweis);
    if (!zeile) continue;
    sperreAbgeleitetesFeld(zeile);
    container.appendChild(zeile);
    gebaut += 1;
  }
  return gebaut;
}

/**
 * Die Werte vorhandener abgeleiteter Zeilen neu rechnen und eintragen.
 *
 * **Warum nicht einfach neu bauen.** Das Dokument-Panel rendert seine Felder
 * nach jedem Speichern ohnehin neu, und die abgeleiteten Werte ziehen dabei
 * von selbst mit. Der Block-Weg tut das bewusst NICHT — ein DOM-Neuaufbau
 * während der Eingabe nähme dem laufenden Bedienelement den Fokus (Begründung
 * am Hinweis-Nachzug in `block-props-save.js`). Ohne einen eigenen Nachzug
 * bliebe dort ein gerechneter Wert nach jeder Änderung veraltet stehen, und
 * das widerspräche der Zusage aus E1, nach der ein abgeleiteter Wert immer
 * aktuell ist. Hier werden deshalb nur die Anzeigen ersetzt, nicht die Zeilen.
 *
 * Lookup-Werte bleiben unberührt: Sie hängen am Bereichs-Index und nicht an
 * den Feldern dieses Dokuments; eine Eingabe hier ändert sie nicht.
 *
 * @returns {number} Zahl der aktualisierten Zeilen (Prüf-Zugang).
 */
export function aktualisiereAbgeleiteteFelder(container, opts) {
  const { aufloesung = null, werte = {} } = opts || {};
  if (!container) return 0;
  const definitionen = abgeleiteteDefinitionen(aufloesung);
  if (definitionen.length === 0) return 0;
  const ergebnis = werteAbgeleiteteFelder(aufloesung.fields, werte);

  // Die Zeilen werden eingesammelt und ihr Feldname verglichen, statt je Feld
  // einen Attribut-Selektor zu bauen: Ein Feldname ist freier Anwender-Text
  // und müsste dafür maskiert werden — `CSS.escape` gibt es aber nicht in
  // jedem Umfeld, in dem dieser Code läuft. Ein Vergleich kennt das Problem
  // nicht.
  const zeilen = new Map();
  for (const zeile of container.querySelectorAll(`.${MARKE_ABGELEITET}`)) {
    const name = zeile.dataset.abgeleitetFeld;
    if (name) zeilen.set(name.toLowerCase(), zeile);
  }

  let getroffen = 0;
  for (const def of definitionen) {
    if (def.type === 'lookup') continue;
    const zeile = zeilen.get(String(def.name).toLowerCase());
    const anzeige = zeile && zeile.querySelector('.properties-field-abgeleitet');
    if (!anzeige) continue;
    const treffer = ergebnis[def.name.toLowerCase()] || { value: null, hint: null };
    setzeAbgeleitetenWert(anzeige, treffer.value, treffer.hint);
    getroffen += 1;
  }
  return getroffen;
}
