// 4T-002280 (Epic 3E-000348): Die Folien-Übersicht der Präsentations-Ansicht
// (Story 4S-001076) — alle Folien als Raster über der Fläche der Spalte.
//
// **Bedienung:** Das Kommando «Folien-Übersicht» öffnet das Raster und
// schließt es wieder. Jede Kachel trägt ihre Nummer; die Auswahl steht zu
// Beginn auf der gezeigten Folie und folgt den Pfeiltasten (links und rechts
// eine Kachel, hoch und runter eine Zeile, Pos1 und Ende an die Ränder). Ein
// Klick oder Enter (auch die Leertaste) wechselt zu der Folie und schließt die
// Übersicht, Esc schließt sie ohne Wechsel. Die Tasten bleiben im Raster und
// erreichen weder das Blättern der Fläche noch die Escape-Kaskade des
// Fensters; das Mausrad rollt das Raster, statt zu blättern.
//
// **Zeichnung:** Jede Kachel ist eine kleine Bühne mit einer Folie aus
// `baueFolie`, gezeichnet über `zeichneWeitereFolie` der Fläche (dieselbe
// Pipeline, derselbe Kopf, dieselben Teilbaum-Schritte wie die gezeigte
// Folie) und verkleinert über `passeFolieEin` mit `folienSkalierung` ohne
// Rand. Die Übersicht zeigt jede Folie vollständig, also ohne Aufdecken
// (Ausführungs-Entscheidung der Sitzung vom 2026-10-14 in 4T-002276), und
// mit der Verkleinerung übervoller Folien, die `zeichneFolie` selbst setzt.
//
// **Lebensdauer:** Das Raster hängt in der Fläche; baut die Fläche neu auf
// (Wiedereintritt in die Ansicht), ist es fort. Die Vorführung schließt es
// beim Start. Es zeigt den Stand beim Öffnen; ein erneutes Öffnen zeichnet neu.
//
// **Zyklusfrei:** importiert die Folie, die Fläche und die Darstellungs-
// Regeln; den Fenster-Zustand kennt es nicht.
'use strict';

import { t } from '../../i18n.js';
import { folienGeometrie } from '../../../shared/presentation/presentation-darstellung.js';
import { SLIDE_KLASSE, baueFolie, beobachteBuehne, passeFolieEin } from './presentation-folie.js';
import {
  FLAECHE_KLASSE,
  blaettere,
  fokussierePraesentation,
  folienDerSpalte,
  folienStand,
  gezeigtePraesentation,
  praesentationsContainer,
  zeichneWeitereFolie,
} from './presentation-pane.js';

/** Klassen der Übersicht; Maße und Farben stehen in presentation.css. */
export const UEBERSICHT_KLASSE = 'praesentation-uebersicht';
export const UEBERSICHT_ZUSTAND = 'praesentation-flaeche--uebersicht';
export const KACHEL_KLASSE = 'praesentation-uebersicht-kachel';
export const KACHEL_BUEHNE_KLASSE = 'praesentation-uebersicht-buehne';
export const KACHEL_NUMMER_KLASSE = 'praesentation-uebersicht-nummer';
export const GEWAEHLT_KLASSE = 'is-gewaehlt';

function element(tag, klasse) {
  const el = document.createElement(tag);
  el.className = klasse;
  return el;
}

function flaecheDer(paneIdx) {
  const container = praesentationsContainer(paneIdx);
  return container ? container.querySelector(`.${FLAECHE_KLASSE}`) : null;
}

function rasterDer(paneIdx) {
  const flaeche = flaecheDer(paneIdx);
  return flaeche ? flaeche.querySelector(`:scope > .${UEBERSICHT_KLASSE}`) : null;
}

const kachelnVon = (raster) => Array.from(raster.querySelectorAll(`.${KACHEL_KLASSE}`));

/** Ist die Übersicht in der Spalte offen? */
export function istUebersichtOffen(paneIdx) {
  return rasterDer(paneIdx) !== null;
}

/** Index der gewählten Kachel oder -1. */
export function gewaehlteKachel(paneIdx) {
  const raster = rasterDer(paneIdx);
  if (!raster) return -1;
  return kachelnVon(raster).findIndex((k) => k.classList.contains(GEWAEHLT_KLASSE));
}

/**
 * Zahl der Kacheln je Zeile, gemessen an der Lage der Kacheln: so viele, wie
 * auf der Höhe der ersten stehen. Ohne Messung (alle auf einer Höhe) eine
 * Zeile mit allen.
 *
 * @param {Element[]} kacheln
 * @returns {number}
 */
export function spaltenZahl(kacheln) {
  if (!kacheln.length) return 1;
  const oben = kacheln[0].offsetTop;
  let n = 0;
  while (n < kacheln.length && kacheln[n].offsetTop === oben) n += 1;
  return Math.max(1, n);
}

/**
 * Setzt die Auswahl auf eine Kachel, gibt ihr den Fokus und rollt sie in
 * den sichtbaren Bereich.
 *
 * @param {number} paneIdx
 * @param {number} index wird in die Folien-Spanne geklemmt.
 * @returns {number} gewählter Index oder -1 ohne offene Übersicht.
 */
export function waehleKachel(paneIdx, index) {
  const raster = rasterDer(paneIdx);
  if (!raster) return -1;
  const kacheln = kachelnVon(raster);
  if (!kacheln.length) return -1;
  const ziel = Math.min(Math.max(0, index), kacheln.length - 1);
  kacheln.forEach((kachel, i) => {
    const gewaehlt = i === ziel;
    kachel.classList.toggle(GEWAEHLT_KLASSE, gewaehlt);
    kachel.setAttribute('aria-selected', gewaehlt ? 'true' : 'false');
    kachel.tabIndex = gewaehlt ? 0 : -1;
  });
  const kachel = kacheln[ziel];
  if (typeof kachel.focus === 'function') kachel.focus();
  if (typeof kachel.scrollIntoView === 'function') kachel.scrollIntoView({ block: 'nearest' });
  return ziel;
}

/**
 * Was bewirkt dieser Tastendruck im Raster?
 *
 * @param {KeyboardEvent} ereignis
 * @returns {'links'|'rechts'|'hoch'|'runter'|'erste'|'letzte'|'zeigen'|'schliessen'|null}
 */
export function aktionAusTaste(ereignis) {
  if (!ereignis || ereignis.ctrlKey || ereignis.altKey || ereignis.metaKey) return null;
  switch (ereignis.key) {
    case 'ArrowLeft':
      return 'links';
    case 'ArrowRight':
      return 'rechts';
    case 'ArrowUp':
      return 'hoch';
    case 'ArrowDown':
      return 'runter';
    case 'Home':
      return 'erste';
    case 'End':
      return 'letzte';
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return 'zeigen';
    case 'Escape':
      return 'schliessen';
    default:
      return null;
  }
}

function beiTaste(paneIdx, ereignis) {
  const aktion = aktionAusTaste(ereignis);
  if (!aktion) return;
  ereignis.preventDefault();
  ereignis.stopPropagation();
  const raster = rasterDer(paneIdx);
  if (!raster) return;
  const jetzt = gewaehlteKachel(paneIdx);
  if (aktion === 'schliessen') {
    schliesseUebersicht(paneIdx);
    return;
  }
  if (aktion === 'zeigen') {
    zeigeFolieAusUebersicht(paneIdx, jetzt);
    return;
  }
  const kacheln = kachelnVon(raster);
  const spalten = spaltenZahl(kacheln);
  const schritt = { links: -1, rechts: 1, hoch: -spalten, runter: spalten };
  if (aktion === 'erste') waehleKachel(paneIdx, 0);
  else if (aktion === 'letzte') waehleKachel(paneIdx, kacheln.length - 1);
  else waehleKachel(paneIdx, jetzt + schritt[aktion]);
}

function beiKlick(paneIdx, ereignis) {
  const ziel = ereignis.target;
  const kachel =
    ziel && typeof ziel.closest === 'function' ? ziel.closest(`.${KACHEL_KLASSE}`) : null;
  if (!kachel) return;
  ereignis.preventDefault();
  ereignis.stopPropagation();
  zeigeFolieAusUebersicht(paneIdx, Number(kachel.dataset.index));
}

// Baut eine Kachel, hängt sie an das Raster und zeichnet ihre Folie; erst im
// Dokument misst die Verkleinerung der Folie.
function baueKachel(paneIdx, raster, index) {
  const kachel = element('div', KACHEL_KLASSE);
  kachel.dataset.index = String(index);
  kachel.setAttribute('role', 'option');
  kachel.setAttribute(
    'aria-label',
    t('presentation.uebersicht.kachel').replace('{nummer}', String(index + 1)),
  );
  kachel.tabIndex = -1;
  const buehne = element('div', KACHEL_BUEHNE_KLASSE);
  buehne.dataset.folienRand = '0';
  const huelle = baueFolie();
  buehne.append(huelle);
  const nummer = element('span', KACHEL_NUMMER_KLASSE);
  nummer.textContent = String(index + 1);
  nummer.setAttribute('aria-hidden', 'true');
  kachel.append(buehne, nummer);
  raster.append(kachel);
  zeichneWeitereFolie(paneIdx, huelle, index);
  const slide = huelle.querySelector(`.${SLIDE_KLASSE}`);
  const geometrie = folienGeometrie(slide ? slide.dataset.size : undefined);
  buehne.style.aspectRatio = `${geometrie.breite} / ${geometrie.hoehe}`;
  passeFolieEin(buehne);
  beobachteBuehne(buehne);
}

/**
 * Öffnet die Folien-Übersicht der Spalte.
 *
 * @param {number} paneIdx
 * @returns {boolean} true, wenn sie geöffnet wurde; false ohne gezeigte
 *   Präsentation, ohne Folien oder wenn sie schon offen ist.
 */
export function oeffneUebersicht(paneIdx) {
  if (!gezeigtePraesentation(paneIdx) || istUebersichtOffen(paneIdx)) return false;
  const flaeche = flaecheDer(paneIdx);
  const folien = folienDerSpalte(paneIdx);
  if (!flaeche || folien.length === 0) return false;
  const raster = element('div', UEBERSICHT_KLASSE);
  raster.setAttribute('role', 'listbox');
  raster.setAttribute('aria-label', t('presentation.uebersicht.flaeche'));
  raster.addEventListener('keydown', (ereignis) => beiTaste(paneIdx, ereignis));
  raster.addEventListener('click', (ereignis) => beiKlick(paneIdx, ereignis));
  // Das Rad rollt das Raster und blättert nicht in der Fläche dahinter.
  raster.addEventListener('wheel', (ereignis) => ereignis.stopPropagation());
  flaeche.classList.add(UEBERSICHT_ZUSTAND);
  flaeche.append(raster);
  folien.forEach((_folie, index) => baueKachel(paneIdx, raster, index));
  const stand = folienStand(paneIdx);
  waehleKachel(paneIdx, stand ? stand.index : 0);
  return true;
}

/**
 * Schließt die Übersicht der Spalte, ohne die Folie zu wechseln.
 *
 * @param {number} paneIdx
 * @param {{fokus?: boolean}} [optionen] fokus: der Fläche den Fokus geben.
 * @returns {boolean} true, wenn sie offen war.
 */
export function schliesseUebersicht(paneIdx, { fokus = true } = {}) {
  const raster = rasterDer(paneIdx);
  if (!raster) return false;
  const flaeche = raster.parentElement;
  raster.remove();
  if (flaeche) flaeche.classList.remove(UEBERSICHT_ZUSTAND);
  if (fokus) fokussierePraesentation(paneIdx);
  return true;
}

/**
 * Wechselt zu einer Folie und schließt die Übersicht.
 *
 * @param {number} paneIdx
 * @param {number} index
 * @returns {boolean} false ohne offene Übersicht.
 */
export function zeigeFolieAusUebersicht(paneIdx, index) {
  if (!istUebersichtOffen(paneIdx) || !Number.isInteger(index) || index < 0) return false;
  schliesseUebersicht(paneIdx, { fokus: false });
  blaettere(paneIdx, index);
  fokussierePraesentation(paneIdx);
  return true;
}

/**
 * Einstieg des Kommandos «Folien-Übersicht»: öffnet die Übersicht oder
 * schließt eine offene ohne Wechsel.
 *
 * @param {number} paneIdx
 * @returns {boolean} ist die Übersicht danach offen?
 */
export function schalteUebersicht(paneIdx) {
  if (istUebersichtOffen(paneIdx)) {
    schliesseUebersicht(paneIdx);
    return false;
  }
  return oeffneUebersicht(paneIdx);
}
