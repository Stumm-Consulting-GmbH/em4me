// 4T-002351 (Epic 3E-000184): Die Kopfzeile über dem `workflow`-Block in der
// gerenderten Ansicht und damit in der Vorschau-Hälfte der geteilten Ansicht.
//
// **Entscheidung des Product Owners vom 2026-10-23** auf die Produkt-Frage P7,
// im Wortlaut «Zu A, das passt. So machen wir das.»: Die Kopfzeile mit
// Prüf-Ergebnis und Knopf «Starten» erscheint zusätzlich zur Live-Ansicht auch
// hier; Druck, Teilbäume (Einbettung) und portabler Export bleiben ohne.
//
// **Ein Baustein für beide Ansichten.** Vorprüfung, Markup und Aktionen kommen
// aus `workflow-kopfzeile.js`, die Aussage aus `kopfAussage`; dieses Modul
// trägt allein den Ort in der gerenderten Spalte. Eine eigene Kopfzeile baut
// es nicht.
//
// **Wann:** nach jedem Neu-Rendern der Spalte. Die gerenderte Ansicht entsteht
// an sechs Stellen mit derselben Folge `innerHTML = renderMarkdown(…)` und
// `applyRenderPipeline(…)` (Wechsel der Ansicht, Vorschau der geteilten
// Ansicht im Takt des Tippens, Speichern der Eigenschaften, Übernahme eines Profils,
// Wiederherstellen aus der Historie). Die gemeinsame Nachbearbeitung
// `wendeSchritteAn` in render-mermaid.js ist eingefroren; deshalb beobachtet
// ein `MutationObserver` die Kind-Knoten des Inhalts-Containers jeder Spalte.
// Er fängt das Ersetzen des Inhalts an allen sechs Stellen an einem Ort und
// sieht Änderungen tiefer im Baum (Einbettungen, Abfragen) nicht. Seine
// Rückmeldung kommt nach dem Rendern und der Nachbearbeitung, als Mikro-Aufgabe;
// die eigenen Änderungen verwirft er mit `takeRecords`.
//
// **Welche Blöcke:** allein Blöcke der obersten Ebene, deren `pre` die
// Zaun-Zeile im Dokument trägt (`data-wf-zeile` aus der Fence-Weiche,
// workflow-block.js) und deren Zeile unter den Zaun-Zeilen des Kerns ist.
// Blöcke in einer Einbettung oder einer Skript-Ausgabe liegen tiefer und
// gehören zu einer anderen Datei; sie bleiben ohne Kopfzeile, wie es die
// Entscheidung für Teilbäume sagt.
//
// **Welcher Stand:** Text und Pfad des aktiven Reiters der Spalte, aus dem auch
// gerendert wird; der Knopf liest ihn beim Klick erneut (`dokument()`).
//
// **Druck und HTML-Export** blenden die Kopfzeile über ihre Liste der
// Bedien-Elemente aus (body.printing in export-historie-und-statistik.css,
// BEDIEN_ELEMENTE in views/html-export.js); der portable Export rendert ohne
// die Fence-Weiche und kennt den Block nur als gewöhnlichen Code-Block.
'use strict';

import { getPaneEls, paneRoots, state } from '../app/app-state.js';
import { activeTabOfPane } from '../views/pane-lookup.js';
import { baueKopfzeile, kopfAnalyse } from './workflow-kopfzeile.js';
import { kopfAussage } from './workflow-pruefung.js';

/** Zusatz-Klasse der Kopfzeile in der gerenderten Ansicht. */
export const KOPF_GERENDERT_KLASSE = 'wf-kopf-gerendert';

// Die `workflow`-Blöcke der obersten Ebene: das Element auf oberster Ebene
// (das `pre` selbst oder die Hülle des Kopier-Knopfs) und die Zaun-Zeile.
function bloeckeDerOberstenEbene(container) {
  const bloecke = [];
  for (const kind of container.children) {
    const pre =
      kind.tagName === 'PRE'
        ? kind
        : kind.classList.contains('code-block-wrapper')
          ? kind.querySelector(':scope > pre')
          : null;
    if (!pre || !pre.hasAttribute('data-wf-zeile')) continue;
    const zeile = parseInt(pre.getAttribute('data-wf-zeile'), 10);
    if (Number.isFinite(zeile)) bloecke.push({ element: kind, zeile });
  }
  return bloecke;
}

/**
 * Setzt die Kopfzeilen über die `workflow`-Blöcke eines gerenderten Inhalts;
 * vorhandene Kopfzeilen werden zuvor entfernt.
 *
 * @param {Element} container Inhalts-Container der gerenderten Spalte.
 * @param {() => {path: string, text: string}} quelle Pfad und Text des
 *   Dokuments, aus dem gerendert ist; auch der Knopf «Starten» liest daraus.
 * @returns {number} Zahl der gesetzten Kopfzeilen.
 */
export function wendeKoepfeAn(container, quelle) {
  if (!container) return 0;
  for (const alt of container.querySelectorAll(`:scope > .${KOPF_GERENDERT_KLASSE}`)) {
    alt.remove();
  }
  const bloecke = bloeckeDerOberstenEbene(container);
  if (bloecke.length === 0) return 0;
  const { path = '', text = '' } = quelle() || {};
  const analyse = kopfAnalyse(String(text).split('\n', 1)[0], () => String(text), path);
  if (!analyse.isWorkflow) return 0;
  const zaunZeilen = new Set(analyse.blockLines);
  let gesetzt = 0;
  for (const { element, zeile } of bloecke) {
    if (!zaunZeilen.has(zeile)) continue;
    const kopf = baueKopfzeile({
      zaunZeile: zeile,
      aussage: kopfAussage(analyse, zeile),
      analyse,
      view: null,
      dokument: quelle,
    });
    kopf.classList.add(KOPF_GERENDERT_KLASSE);
    element.before(kopf);
    gesetzt++;
  }
  return gesetzt;
}

/**
 * Beobachtet einen Inhalts-Container und setzt nach jedem Ersetzen seines
 * Inhalts die Kopfzeilen neu.
 *
 * @param {Element} container Inhalts-Container der gerenderten Spalte.
 * @param {() => {path: string, text: string}} quelle wie bei `wendeKoepfeAn`.
 * @returns {MutationObserver|null}
 */
export function beobachteGerendertenInhalt(container, quelle) {
  if (!container || typeof MutationObserver !== 'function') return null;
  const beobachter = new MutationObserver(() => {
    wendeKoepfeAn(container, quelle);
    // Die eigenen Änderungen (Kopfzeilen entfernt und gesetzt) lösen keinen
    // weiteren Lauf aus.
    beobachter.takeRecords();
  });
  beobachter.observe(container, { childList: true });
  wendeKoepfeAn(container, quelle);
  beobachter.takeRecords();
  return beobachter;
}

let eingerichtet = false;

/** Richtet die Beobachtung für die gerenderte Hälfte jeder Spalte einmal ein. */
export function richteGerenderteKoepfeEin() {
  if (eingerichtet) return;
  eingerichtet = true;
  paneRoots.forEach((_root, idx) => {
    const els = getPaneEls(idx);
    beobachteGerendertenInhalt(els && els.renderedHtml, () => {
      const tab = activeTabOfPane(state.panes, idx);
      return {
        path: (tab && tab.path) || '',
        text: tab && typeof tab.content === 'string' ? tab.content : '',
      };
    });
  });
}
