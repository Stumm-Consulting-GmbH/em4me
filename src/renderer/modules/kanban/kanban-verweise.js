// 4T-001958 (Epic 3E-000319): Verweise auf der Karte — der Verweis im
// Karten-Text als eigene Geste und das Termin-Abzeichen als Verweis auf die
// Tagesnotiz.
//
// **Warum ein eigenes Modul neben `kanban-bedienung.js`.** Die Karten-Bedienung
// steht nahe an ihrem Zeilen-Budget; hier steht allein, **woran** ein Verweis
// auf der Karte zu erkennen ist und wie das Abzeichen als Verweis gekennzeichnet
// wird. Was ein Klick darauf auslöst, entscheidet weiter die Bedienung, und
// wohin er führt, der hereingereichte Weg der Lese-Ansicht bzw. des Journals.
//
// **Abhängigkeits-frei wie die Zeichnung** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n`. Der Hinweistext kommt als Wert herein.
'use strict';

import { KARTE_KLASSE } from './kanban-tafel.js';
import { tagVerweisAn } from './kanban-tags.js';

// Klasse des Termin-Abzeichens, das auf die Tagesnotiz verweist. Das
// Stilblatt zeichnet es unterstrichen wie einen Verweis (`kanban.css`).
export const DATUM_VERWEIS_KLASSE = 'kanban-datum-verweis';

/**
 * Der Verweis im Karten-Text an einer Zeiger-Stelle, sonst null.
 *
 * **Jeder Verweis, den die Lese-Ansicht öffnet** — Wiki-Verweis, gewöhnlicher
 * Markdown-Verweis, externe Adresse —, denn die Lese-Ansicht behandelt jedes
 * `<a>` mit Ziel auf einem Weg (`handleRenderedClick` in
 * `views/link-navigation.js`). Ein Tag ist ebenfalls ein `<a>`, hat aber seinen
 * eigenen Klick-Weg (4T-001904) und bleibt hier draußen. Die Angaben, die jener
 * Weg aus dem Element liest, liest dieser genauso: das Ziel, ob es ein
 * Wiki-Verweis ist (Klasse `wikilink`, steuert den Rückfall über Alias und
 * Index) und die Basis einer Einbettung.
 *
 * @param {EventTarget|null} ziel
 * @returns {{href: string, wiki: boolean, basis: string|null}|null}
 */
export function kartenVerweisAn(ziel) {
  if (!ziel || typeof ziel.closest !== 'function' || tagVerweisAn(ziel)) return null;
  const a = ziel.closest('a[href]');
  if (!a || !a.closest(`.${KARTE_KLASSE}`)) return null;
  const href = a.getAttribute('href');
  if (!href) return null;
  const einbettung = a.closest('.wiki-embed-md-body');
  return {
    href,
    wiki: a.classList.contains('wikilink'),
    basis: einbettung && einbettung.dataset.embedBase ? einbettung.dataset.embedBase : null,
  };
}

/**
 * Das Termin-Abzeichen, das gerade auf die Tagesnotiz verweist, sonst null.
 *
 * Gilt nur mit der Kennzeichnung durch `markiereDatumsVerweise`: Ohne sie ist
 * das Abzeichen kein Verweis, und der Klick nimmt den Weg von heute.
 *
 * @param {EventTarget|null} ziel
 * @returns {HTMLElement|null}
 */
export function datumsVerweisAn(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const el = ziel.closest(`.${DATUM_VERWEIS_KLASSE}[data-kanban-datum]`);
  return el && el.closest(`.${KARTE_KLASSE}`) ? el : null;
}

/**
 * Kennzeichnet die Termin-Abzeichen der Tafel als Verweis auf die Tagesnotiz
 * oder nimmt die Kennzeichnung zurück.
 *
 * Der Hinweistext wird **angehängt** und nicht an die Stelle des bisherigen
 * gesetzt: Bei relativer Lesart trägt der Hinweistext das absolute Datum, und
 * das soll einen Zeiger entfernt bleiben. Beim Zurücknehmen kehrt der
 * bisherige Text unverändert zurück.
 *
 * @param {HTMLElement} container Container der Tafel.
 * @param {boolean} aktiv Verweist das Datum gerade auf die Tagesnotiz?
 * @param {string} [hinweis] Übersetzter Hinweistext des Verweises.
 */
export function markiereDatumsVerweise(container, aktiv, hinweis = '') {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  for (const el of container.querySelectorAll(`.${KARTE_KLASSE} [data-kanban-datum]`)) {
    const markiert = el.classList.contains(DATUM_VERWEIS_KLASSE);
    if (aktiv && !markiert) {
      el.dataset.kanbanTitel = el.title || '';
      el.title = el.title ? `${el.title}\n${hinweis}` : hinweis;
      el.classList.add(DATUM_VERWEIS_KLASSE);
    } else if (!aktiv && markiert) {
      el.title = el.dataset.kanbanTitel || '';
      delete el.dataset.kanbanTitel;
      el.classList.remove(DATUM_VERWEIS_KLASSE);
    }
  }
}
