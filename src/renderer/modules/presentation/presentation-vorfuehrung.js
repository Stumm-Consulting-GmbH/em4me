// 4T-002162 (Epic 3E-000149): Die Vorfuehrung der Praesentation - allein die
// Folie der aktiven Spalte im Vollbild des eigenen Fensters, Blaettern mit den
// Tasten der Flaeche, dem Mausklick und dem Mausrad, Esc beendet (Story
// 4S-001050; Mausrad aus der Abnahme vom 2026-10-10).
//
// **Ablauf.** `starteVorfuehrung` setzt die Klasse `presentation-vorfuehrung`
// am body und `presentation-vorfuehrung-spalte` an der gezeigten Spalte; das
// Stilblatt (presentation.css) blendet damit alle Leisten aus und legt die
// Flaeche schwarz ueber das ganze Fenster, die Folie passt sich ohne Rand ein
// (presentation-folie.js). Das Fenster geht ueber den Kanal
// `window:setFullScreen` des Hauptprozesses ins Vollbild; dessen Antwort ist
// der Vollbild-Zustand davor, und genau auf ihn nimmt `beendeVorfuehrung` das
// Fenster zurueck. Maximiert, Groesse und Lage stellt Electron beim Verlassen
// des Vollbilds selbst wieder her.
//
// **Gestartet wird an der gezeigten Folie** (Entscheidung der Sitzung vom
// 2026-10-07 in 4T-002162): Die Vorfuehrung zeigt den Stand der Flaeche und
// waehlt keine eigene Folie. Nach dem Ende steht die Ansicht auf der zuletzt
// gezeigten Folie, weil beide dieselbe Folie je Dokument lesen.
//
// **Fokus-Modus.** Die Vorfuehrung blendet unabhaengig von ihm aus und
// veraendert seinen Zustand nicht; beide Klassen koennen zugleich am body
// stehen. Esc wird in der Fang-Phase abgefangen und erreicht die
// Escape-Kaskade des Fensters nicht, die sonst den Fokus-Modus mit verliesse.
//
// **Ende auf jedem Weg.** Esc, das Kommando `presentation.stop`, das Verlassen
// des Vollbilds ausserhalb der Anwendung (Meldung des Hauptprozesses), der
// Wechsel in ein anderes Fenster (blur) und der Wechsel des Dokuments, der
// Spalte oder der Ansicht (`pruefeVorfuehrung`, gerufen bei jedem Abgleich der
// Leisten in tabs.js) beenden die Vorfuehrung gleich.
//
// **Zyklusfrei:** importiert nur die Bruecke, die Flaeche und die Folie; den
// Fenster-Zustand kennt es nicht. Die aktive Spalte reicht der Aufrufer herein.
'use strict';

import { api } from '../app/api.js';
import { VORFUEHRUNG_KLASSE } from './presentation-folie.js';
import {
  blaettere,
  fokussierePraesentation,
  gezeigtePraesentation,
  praesentationsContainer,
  registriereVorfuehrungsStart,
  renderPresentation,
  richtungAusRad,
  richtungAusTaste,
} from './presentation-pane.js';

/** Klasse an der Spalte, deren Folie vorgefuehrt wird. */
export const SPALTE_KLASSE = 'presentation-vorfuehrung-spalte';

// Laufende Vorfuehrung oder null: Spalte, Dokument, Spalten-Element und die
// Antwort des Vollbild-Kanals (Zustand davor, als Versprechen).
let lauf = null;
// Die Meldung des Hauptprozesses haengt einmal je Fenster.
let meldungVerdrahtet = false;

/**
 * Setzt das Vollbild des eigenen Fensters.
 *
 * @param {boolean} an
 * @returns {Promise<boolean|null>} Vollbild-Zustand vor dem Aufruf; null ohne
 *   Bruecke oder ohne Fenster.
 */
function setzeVollbild(an) {
  if (typeof api.setWindowFullScreen !== 'function') return Promise.resolve(null);
  return Promise.resolve(api.setWindowFullScreen(an)).then(
    (vorher) => (typeof vorher === 'boolean' ? vorher : null),
    () => null,
  );
}

function verdrahteMeldung() {
  if (meldungVerdrahtet || typeof api.onWindowLeftFullScreen !== 'function') return;
  meldungVerdrahtet = true;
  api.onWindowLeftFullScreen(() => beendeVorfuehrung());
}

// Tasten der Vorfuehrung, in der Fang-Phase des Fensters: Sie erreichen weder
// den Editor noch die Escape-Kaskade noch den Kommando-Dispatcher.
function beiTaste(ereignis) {
  if (!lauf) return;
  if (ereignis.key === 'Escape') {
    ereignis.preventDefault();
    ereignis.stopPropagation();
    beendeVorfuehrung();
    return;
  }
  const richtung = richtungAusTaste(ereignis);
  if (!richtung) return;
  ereignis.preventDefault();
  ereignis.stopPropagation();
  blaettere(lauf.paneIdx, richtung);
}

// Ein Mausklick blaettert vorwaerts (Story 4S-001050, AK3).
function beiKlick(ereignis) {
  if (!lauf) return;
  ereignis.preventDefault();
  ereignis.stopPropagation();
  blaettere(lauf.paneIdx, 'weiter');
}

// Das Mausrad blaettert eine Folie je Rad-Bewegung, in der Fang-Phase des
// Fensters wie die Tasten; die Sperre gehoert dem laufenden Lauf.
function beiRad(ereignis) {
  if (!lauf) return;
  const richtung = richtungAusRad(ereignis, lauf.radSperre);
  if (!richtung) return;
  ereignis.preventDefault();
  ereignis.stopPropagation();
  if (richtung !== 'gesperrt') blaettere(lauf.paneIdx, richtung);
}

function beiFensterWechsel() {
  beendeVorfuehrung();
}

/** Laeuft gerade eine Vorfuehrung? */
export function istVorfuehrungAktiv() {
  return lauf !== null;
}

/**
 * Startet die Vorfuehrung der Spalte an der gerade gezeigten Folie.
 *
 * @param {number} paneIdx
 * @returns {boolean} true, wenn sie gestartet ist; false, wenn bereits eine
 *   laeuft oder die Spalte keine Praesentation zeigt.
 */
export function starteVorfuehrung(paneIdx) {
  if (lauf) return false;
  const tab = gezeigtePraesentation(paneIdx);
  const container = praesentationsContainer(paneIdx);
  if (!tab || !container) return false;
  verdrahteMeldung();
  const spalte = container.closest('.pane-group') || container;
  const eigener = { paneIdx, tab, spalte, vollbildVorher: null, radSperre: { bis: 0 } };
  lauf = eigener;
  document.body.classList.add(VORFUEHRUNG_KLASSE);
  spalte.classList.add(SPALTE_KLASSE);
  window.addEventListener('keydown', beiTaste, true);
  window.addEventListener('click', beiKlick, true);
  window.addEventListener('wheel', beiRad, { capture: true, passive: false });
  window.addEventListener('blur', beiFensterWechsel);
  // Ohne Wahl an der Schreibmarke: Die gezeigte Folie bleibt, eingepasst
  // ohne Rand.
  renderPresentation(paneIdx);
  fokussierePraesentation(paneIdx);
  eigener.vollbildVorher = setzeVollbild(true);
  return true;
}

// Die Schaltflaeche «Vorfuehrung starten» der Leiste ruft diesen Start.
registriereVorfuehrungsStart(starteVorfuehrung);

/**
 * Beendet die laufende Vorfuehrung: Klassen und Zuhoerer fort, das Fenster
 * auf den Vollbild-Zustand von vorher, die Ansicht auf der zuletzt gezeigten
 * Folie.
 *
 * @returns {boolean} true, wenn eine Vorfuehrung lief.
 */
export function beendeVorfuehrung() {
  const eigener = lauf;
  if (!eigener) return false;
  lauf = null;
  window.removeEventListener('keydown', beiTaste, true);
  window.removeEventListener('click', beiKlick, true);
  window.removeEventListener('wheel', beiRad, true);
  window.removeEventListener('blur', beiFensterWechsel);
  document.body.classList.remove(VORFUEHRUNG_KLASSE);
  eigener.spalte.classList.remove(SPALTE_KLASSE);
  // Zurueck auf den Zustand davor, sobald er bekannt ist; war das Fenster
  // schon vorher im Vollbild, bleibt es dort.
  Promise.resolve(eigener.vollbildVorher).then((vorher) => {
    if (vorher === false) setzeVollbild(false);
  });
  renderPresentation(eigener.paneIdx);
  fokussierePraesentation(eigener.paneIdx);
  return true;
}

/**
 * Beendet die Vorfuehrung, wenn ihre Lage nicht mehr besteht: eine andere
 * Spalte ist aktiv, oder die Spalte zeigt ein anderes Dokument oder keine
 * Praesentation mehr.
 *
 * @param {number} aktiveSpalte Index der aktiven Spalte.
 * @returns {boolean} true, wenn beendet wurde.
 */
export function pruefeVorfuehrung(aktiveSpalte) {
  if (!lauf) return false;
  if (aktiveSpalte === lauf.paneIdx && gezeigtePraesentation(lauf.paneIdx) === lauf.tab) {
    return false;
  }
  return beendeVorfuehrung();
}
