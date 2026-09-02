// 4T-001326 (Epic 3E-000236): Plausibilitäts-Prüfung der Journal-Blöcke.
//
// Beide Journal-Blöcke, die Navigation und die Zeitleiste, machen aus einem
// Dateipfad eine Aussage über die Zeit: dieses Dokument ist der Eintrag vom
// 30. August, seine Woche ist die 35., sein Nachbar ist der 29. Solche Aussagen
// sind nicht als falsch erkennbar. Ein Datum sieht wie ein Datum aus, gleich zu
// welchem Dokument es gehört.
//
// Genau das ist am 2026-08-31 eingetreten (Befund des Product Owners an der
// ausgelieferten 1.122.0): Der Navigations-Block eines Eintrags vom 30. August
// zeigte durchgängig den 31. samt Kalenderwoche 36 und der Zeile «Heute», weil
// er mit dem Pfad eines anderen offenen Reiters rechnete. Die Anzeige war in
// sich vollständig stimmig und vollständig falsch; aufgefallen ist sie allein,
// weil der Product Owner das Datum seines Eintrags kannte.
//
// Die Ursache ist mit 4T-001325 behoben. Dieses Modul macht einen künftigen Fall
// derselben Klasse SICHTBAR, gleich woher der falsche Pfad kommt.
//
// **Warum die Übereinstimmung und nicht nur die Existenz.** Eine reine
// Existenz-Prüfung hätte den Befund NICHT gefangen: Der fremde Eintrag
// existierte. Wirksam ist allein der Abgleich gegen eine zweite, unabhängige
// Quelle. Die Existenz-Prüfung fängt den anderen Fall, den nachträglich
// gelöschten oder umbenannten Eintrag.
//
// **Warum die Prüfung nicht überall greift** (Entscheidung des Product Owners
// vom 2026-08-31): Der Block bekommt seinen Pfad vom Aufrufer — das ist eine
// Behauptung, keine Feststellung. Die einzige verfügbare zweite Quelle ist der
// aktive Reiter der Spalte, in der der Block hängt. In Vorschau-Flächen, in der
// Seitenausgabe und im portablen Export gibt es keinen; dort entfällt die
// Übereinstimmungs-Prüfung, statt einen Fehlalarm zu erzeugen. Die
// Existenz-Prüfung braucht keine zweite Quelle und greift überall.
'use strict';

import { api } from '../app/api.js';
import { t } from '../../i18n.js';
import { pathCompareKey } from '../../../shared/platform.js';

// Der Pfad des aktiven Reiters jener Spalte, in der `el` hängt; null, wenn der
// Block außerhalb einer Spalte gerendert wird. Der Weg läuft über das DOM und
// nicht über eine Editor-Referenz, weil er für beide Blöcke gelten muss und die
// Zeitleiste in Ansichten ohne Editor erscheint.
//
// Der Anwendungs-Zustand wird zur LAUFZEIT importiert (dynamic import). Ein
// statischer Bezug von `renderer/modules/calendar` nach `renderer/modules/app`
// zieht diese Datei und mit ihr beide Journal-Blöcke in die große
// Import-Zyklus-Komponente des Renderers; der Ordner-Wächter hat genau das
// gemeldet und verlangt ausdrücklich das Auflösen statt des Einfrierens.
// Dynamische Aufrufe erfasst er bewusst nicht, weil sie erst zur Laufzeit
// binden — dasselbe Muster nutzt journal-nav-view.js für journals.js.
export async function pfadDerSpalte(el) {
  const gruppe =
    el && typeof el.closest === 'function' ? el.closest('.pane-group[data-pane]') : null;
  if (!gruppe) return null;
  const idx = Number(gruppe.getAttribute('data-pane'));
  if (!Number.isInteger(idx) || idx < 0) return null;
  const { state } = await import('../app/app-state.js');
  const pane = state.panes && state.panes[idx];
  if (!pane || pane.activeIndex < 0) return null;
  const tab = pane.tabs && pane.tabs[pane.activeIndex];
  return tab && tab.path ? tab.path : null;
}

/**
 * Prüft, ob der Block über den Eintrag spricht, in dem er steht.
 *
 * @param {Element} el Der Block-Container im DOM.
 * @param {string} basePath Der Pfad, mit dem der Block befüllt werden soll.
 * @param {string} relPath Derselbe Eintrag, bereichsrelativ (für die Existenz).
 * @returns {Promise<{ok: true} | {ok: false, text: string}>} Bei `ok: false`
 *   trägt `text` die fertige, lokalisierte Meldung.
 */
export async function pruefeBlockPfad(el, basePath, relPath) {
  // 1. Übereinstimmung — die wirksame der beiden Prüfungen.
  const erwartet = await pfadDerSpalte(el);
  if (erwartet !== null && pathCompareKey(erwartet) !== pathCompareKey(String(basePath || ''))) {
    return { ok: false, text: t('journalNav.pathMismatch') };
  }
  // 2. Existenz — fängt den gelöschten oder umbenannten Eintrag.
  if (relPath) {
    let stat;
    try {
      stat = await api.journalsStatEntry(relPath);
    } catch {
      stat = null;
    }
    // Nur ein belegtes Fehlen meldet; ein gescheiterter Aufruf ist kein Beleg
    // für Abwesenheit und darf keine Fehlermeldung erzeugen.
    if (stat && stat.ok && stat.exists === false) {
      return { ok: false, text: t('journalNav.entryMissing') };
    }
  }
  return { ok: true };
}

/**
 * Hängt die Fehlermeldung als einzigen Inhalt in den Block-Container.
 *
 * Sie ist bewusst als Fehler erkennbar und nicht als neutraler Hinweis
 * (Entscheidung des Product Owners vom 2026-08-31): Ein neutraler Hinweis
 * reproduzierte genau die Unauffälligkeit, die diesen Fehler bis in eine
 * Auslieferung getragen hat.
 */
export function zeigeBlockFehler(el, text) {
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'journal-block-fehler';
  box.setAttribute('role', 'alert');
  box.textContent = text;
  el.appendChild(box);
}
