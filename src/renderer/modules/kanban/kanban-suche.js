// 4T-001907 (Epic 3E-000318): Karten der Tafel suchen und filtern — das
// Filter-Feld im Kopf der Tafel und seine Wirkung auf die gezeichneten Karten
// (Story 4S-000983).
//
// **Der Zugang ist derselbe wie auf der räumlichen Arbeitsfläche** (Entscheidung
// im Epic vom 2026-09-21): Strg+F führt in der Tafel-Ansicht in ein
// Filter-Feld statt in die Suchleiste. Die Weiche steht im Kommando
// `search.open` von `app-commands.js`; `oeffneTafelSuche` antwortet dort
// synchron, ob die Tafel zuständig ist, wie `oeffneCanvasSuche` es tut.
//
// **Das Feld steht im Kopf der Tafel über den Spalten** (Ausführungs-
// Entscheidung der steuernden Sitzung vom 2026-09-23) und nicht in einem
// Seiten-Panel: Die Tafel hat keine Karten-Liste im Panel, und das Feld
// gehört an die Fläche, die es filtert. Es hängt an der Einhänge-Stelle
// `KOPF_KLASSE` der Zeichnung und überlebt deshalb jede Neu-Zeichnung samt
// Tastatur-Fokus und Suchtext; nach jeder Zeichnung wird der Filter auf die
// neuen Karten-Elemente angewandt (AK9).
//
// **Gefiltert wird ausschließlich in der Anzeige.** Nicht passende Karten
// bekommen eine Klasse und werden ausgeblendet, nie entfernt; das Dokument
// bleibt unverändert (AK7), und die Suche geht deshalb auch im nicht
// änderbaren Dokument (AK8). Die Regel selbst liegt prozessneutral in
// `src/shared/kanban/kanban-filter.js`.
//
// **Abhängigkeits-frei wie die Zeichnung** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n`. Übersetzung und die Auskunft, ob in
// einem Bereich die Tafel offen ist, reicht `kanban-pane.js` herein.
'use strict';

import { tafelFiltern } from '../../../shared/kanban/kanban-filter.js';
import { KARTE_KLASSE, KOPF_KLASSE, SPALTE_KLASSE, waehleKarte } from './kanban-tafel.js';

export const FILTER_KLASSE = 'kanban-filter';
export const VERBORGEN_KLASSE = 'kanban-karte-verborgen';
export const LEER_KLASSE = 'kanban-filter-leer';

// Tasten, die mit Strg oder Cmd dem Feld gehören und nicht der Anwendung:
// Rückgängig und Wiederholen des Textes, Alles markieren, Kopieren,
// Ausschneiden, Einfügen. Jedes andere Kürzel (Strg+S, Strg+F, …) reicht das
// Feld an das Fenster weiter; ohne Strg und Cmd erreicht keine Taste die
// Karten (Muster der Karten-Eingabe, `EINGABE_KLASSE`).
const FELD_KUERZEL = new Set(['z', 'y', 'a', 'c', 'x', 'v']);

let lage = null;
let uebersetze = (key) => key;
// Der Zustand je Bereich: Container, Dokument, zuletzt gezeichnetes Modell und
// die Elemente der Leiste. Er lebt so lange wie der Container der Tafel.
const staende = [];

/**
 * Verdrahtet die Suche mit der Einbettung der Tafel.
 *
 * @param {object} zugang
 * @param {Function} zugang.lage (paneIdx) => {tab, container}|null — die Tafel
 *   des Bereichs, oder null, wenn dort gerade keine Tafel-Ansicht offen ist.
 * @param {Function} [zugang.t] Übersetzungs-Funktion.
 */
export function initTafelSuche(zugang) {
  lage = zugang && typeof zugang.lage === 'function' ? zugang.lage : null;
  uebersetze = zugang && typeof zugang.t === 'function' ? zugang.t : (key) => key;
  staende.length = 0;
}

function standFuer(paneIdx, container) {
  const stand = staende[paneIdx];
  if (stand && stand.container === container) return stand;
  staende[paneIdx] = { container, tab: null, model: null, leiste: null, feld: null, leer: null };
  return staende[paneIdx];
}

function istOffen(stand) {
  return !!(stand && stand.leiste && !stand.leiste.hidden && stand.leiste.isConnected);
}

function baueLeiste(stand, paneIdx) {
  const leiste = document.createElement('div');
  leiste.className = KOPF_KLASSE;
  leiste.hidden = true;
  const feld = document.createElement('input');
  feld.type = 'search';
  feld.className = FILTER_KLASSE;
  feld.spellcheck = false;
  feld.addEventListener('input', () => wendeAn(paneIdx));
  feld.addEventListener('keydown', (ereignis) => beiTaste(ereignis, paneIdx));
  const leer = document.createElement('p');
  leer.className = LEER_KLASSE;
  leer.hidden = true;
  leer.setAttribute('role', 'status');
  leiste.append(feld, leer);
  stand.container.insertBefore(leiste, stand.container.firstChild);
  Object.assign(stand, { leiste, feld, leer });
}

// Die Texte der Leiste werden bei jedem Anwenden gesetzt und nicht nur beim
// Bau: Die Leiste überlebt die Zeichnung und damit auch einen Sprachwechsel.
function beschrifte(stand) {
  stand.feld.placeholder = uebersetze('kanban.filterPlatzhalter');
  stand.feld.title = uebersetze('kanban.filterTitel');
  stand.feld.setAttribute('aria-label', stand.feld.title);
  stand.leer.textContent = uebersetze('kanban.filterKeinTreffer');
}

/**
 * Der Zähler einer Spalte bei aktivem Filter: «Treffer/Gesamt».
 *
 * **Die Hervorhebung einer überschrittenen Obergrenze bleibt stehen** (4T-001905):
 * Sie hängt an der Klasse der Spalte, die die Zeichnung aus **allen** Karten
 * setzt, und der Filter fasst sie nicht an — eine Spalte ist nicht weniger
 * voll, weil gerade nur ein Teil ihrer Karten zu sehen ist. Die Obergrenze
 * selbst verlässt die Anzeige für die Dauer des Filters und bleibt im
 * Hinweistext stehen.
 */
function passeZaehlerAn(spalteEl, eintrag) {
  const zaehler = spalteEl.querySelector('.kanban-spalte-zaehler');
  if (!zaehler) return;
  if (zaehler.dataset.ohneFilter === undefined) {
    zaehler.dataset.ohneFilter = zaehler.textContent;
    zaehler.dataset.titelOhneFilter = zaehler.title;
  }
  if (!eintrag) {
    zaehler.textContent = zaehler.dataset.ohneFilter;
    zaehler.title = zaehler.dataset.titelOhneFilter;
  } else {
    const setze = (text) =>
      text
        .replace('{treffer}', String(eintrag.treffer))
        .replace('{anzahl}', String(eintrag.gesamt));
    zaehler.textContent = setze(uebersetze('kanban.kartenZahlGefiltert'));
    const titel = setze(uebersetze('kanban.kartenZahlGefiltertTitel'));
    zaehler.title =
      spalteEl.dataset.limit === undefined ? titel : `${titel}\n${zaehler.dataset.titelOhneFilter}`;
  }
  zaehler.setAttribute('aria-label', zaehler.title);
}

/**
 * Wendet den Filter des Bereichs auf die gezeichneten Karten an.
 *
 * Bei geschlossener Leiste oder leerem Suchtext ist das der Rückweg: alle
 * Karten sichtbar, Zähler wie ohne Filter, kein Hinweis.
 *
 * **Eine ausgeblendete Karte bleibt nicht gewählt.** Die Tasten der Tafel
 * wirken auf die gewählte Karte; `Entf` löschte sonst eine Karte, die der
 * Anwender gerade nicht sieht. Hatte sie den Fokus, geht er an die Tafel.
 *
 * @returns {object|null} das Ergebnis des Filter-Kerns.
 */
function wendeAn(paneIdx) {
  const stand = staende[paneIdx];
  if (!stand || !stand.container) return null;
  const { container } = stand;
  const ergebnis = tafelFiltern(stand.model, istOffen(stand) ? stand.feld.value : '');
  for (const spalteEl of container.querySelectorAll(`.${SPALTE_KLASSE}`)) {
    const eintrag = ergebnis.aktiv ? ergebnis.spalten[Number(spalteEl.dataset.spalte)] : null;
    for (const karteEl of spalteEl.querySelectorAll(`.${KARTE_KLASSE}`)) {
      const sichtbar = !eintrag || eintrag.kartenZeilen.has(Number(karteEl.dataset.zeile));
      karteEl.classList.toggle(VERBORGEN_KLASSE, !sichtbar);
      if (sichtbar || karteEl.getAttribute('aria-selected') !== 'true') continue;
      const hatteFokus = document.activeElement === karteEl;
      waehleKarte(container, null);
      if (hatteFokus && typeof container.focus === 'function') container.focus();
    }
    passeZaehlerAn(spalteEl, eintrag);
  }
  if (stand.leer) {
    beschrifte(stand);
    stand.leer.hidden = !(ergebnis.aktiv && ergebnis.treffer === 0);
  }
  return ergebnis;
}

function schliesse(paneIdx, { fokus }) {
  const stand = staende[paneIdx];
  if (!istOffen(stand)) return false;
  stand.feld.value = '';
  stand.leiste.hidden = true;
  wendeAn(paneIdx);
  if (fokus) {
    const { container } = stand;
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    const ziel = gewaehlt || container;
    if (typeof ziel.focus === 'function') ziel.focus();
  }
  return true;
}

function beiTaste(ereignis, paneIdx) {
  if (ereignis.key === 'Escape') {
    // Nicht weiterreichen: Die Tafel höbe sonst zusätzlich die Auswahl auf,
    // und die Escape-Kaskade des Fensters schlösse etwas, das der Anwender
    // nicht gemeint hat.
    ereignis.preventDefault();
    ereignis.stopPropagation();
    schliesse(paneIdx, { fokus: true });
    return;
  }
  const kuerzel =
    (ereignis.ctrlKey || ereignis.metaKey) && !FELD_KUERZEL.has(String(ereignis.key).toLowerCase());
  if (!kuerzel) ereignis.stopPropagation();
}

/**
 * Strg+F in der Tafel-Ansicht: das Filter-Feld zeigen und den Fokus hineinsetzen.
 *
 * @param {number} paneIdx Bereich, in dem Strg+F gedrückt wurde.
 * @returns {boolean} `true`, wenn die Tafel die Suche übernimmt; `false` in
 *   jeder anderen Ansicht — dort öffnet der Aufrufer die Suchleiste wie bisher.
 */
export function oeffneTafelSuche(paneIdx) {
  const tafel = lage ? lage(paneIdx) : null;
  if (!tafel || !tafel.container) return false;
  const stand = standFuer(paneIdx, tafel.container);
  if (stand.tab !== tafel.tab) {
    schliesse(paneIdx, { fokus: false });
    stand.tab = tafel.tab;
  }
  if (!stand.leiste || !stand.leiste.isConnected) baueLeiste(stand, paneIdx);
  stand.leiste.hidden = false;
  wendeAn(paneIdx);
  stand.feld.focus();
  stand.feld.select();
  return true;
}

/**
 * Nach jeder Zeichnung der Tafel: Modell merken und einen offenen Filter auf
 * die neuen Karten-Elemente anwenden (AK9).
 *
 * @param {number} paneIdx
 * @param {{tab: object, container: Element, model: object}} gezeichnet
 */
export function nachTafelZeichnung(paneIdx, { tab, container, model }) {
  const stand = standFuer(paneIdx, container);
  pruefeTafelSuche(paneIdx, tab);
  stand.tab = tab;
  stand.model = model;
  if (istOffen(stand)) wendeAn(paneIdx);
}

/**
 * Beendet den Filter, wenn der Bereich inzwischen ein anderes Dokument oder
 * eine andere Ansicht zeigt. Gerufen vor jeder Zeichnung — auch vor einer, die
 * dann gar nicht stattfindet, weil das Dokument keine Tafel-Ansicht hat.
 *
 * @param {number} paneIdx
 * @param {object|null} tab Das jetzt aktive Dokument des Bereichs.
 */
export function pruefeTafelSuche(paneIdx, tab) {
  const stand = staende[paneIdx];
  if (!istOffen(stand)) return;
  if (!tab || tab !== stand.tab || tab.viewMode !== 'kanban') schliesse(paneIdx, { fokus: false });
}

/**
 * Beendet den Filter des Bereichs ohne Fokus-Wechsel — der Weg beim Wechsel der
 * Ansicht (`setViewMode`).
 *
 * @param {number} paneIdx
 * @returns {boolean} `true`, wenn ein offener Filter beendet wurde.
 */
export function beendeTafelSuche(paneIdx) {
  return schliesse(paneIdx, { fokus: false });
}

/** Liegt das Element in der Filter-Leiste? Die Tafel wählt dort keine Karte ab. */
export function inFilterLeiste(el) {
  return !!(el && typeof el.closest === 'function' && el.closest(`.${KOPF_KLASSE}`));
}
