// 4T-002545 (Epic 3E-000368, Story 4S-001196): Der Index auf dem Stand der
// eigenen Schreibvorgänge der Datenbank-Schritte.
//
// **Anlass.** Der Index des Bereichs erfährt eine geschriebene Datei sonst allein
// über den Datei-Beobachter, mindestens 200 Millisekunden nach dem Schreiben
// (`awaitWriteFinish` in `src/main/index/build.js`). Ein Schritt, der einen
// Datensatz über seine Anzeige-Form sucht, fände einen eben angelegten oder in
// seiner Anzeige-Form geänderten Datensatz je nach Zeitabstand oder nicht. Das
// gilt ebenso für jede spätere Index-Frage eines Laufs (`db-query`,
// `db-for-each`, `{{db:…}}`).
//
// **Die Lösung an der Ursache.** Ein Datenbank-Schritt merkt nach seinem
// Auftrag die Dateien, die er geschrieben oder entfernt hat
// (`merkeGeschrieben`). Vor jeder index-gestützten Auflösung bringt
// `indexAufEigenenStand` den Index auf den Stand genau dieser Dateien: über
// `backlinks.trageDateienNach`, denselben Weg wie eine Meldung des Beobachters,
// synchron und ohne Warten auf Zeit. Die spätere Meldung des Beobachters trägt
// denselben Stand erneut ein und ändert nichts. Eine zweite Auflösung neben
// `loeseDatensatzVerweis` entsteht nicht.
//
// **Wiederverwendung.** Der Kanal der Workflows baut genau eine Instanz und
// reicht sie jedem Schritt-Modul herein; `db-query`, `db-for-each` und
// `{{db:…}}` rufen vor ihrer Index-Frage `indexAufEigenenStand(wurzel)`.
//
// Eigener Zustand: je Bereichs-Wurzel die geschriebenen, im Index noch nicht
// nachgetragenen Pfade.
'use strict';

const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');

/**
 * Baut den Schreib-Stand der Datenbank-Schritte eines Prozesses.
 *
 * @param {{backlinks?: {trageDateienNach?: Function}}} deps
 * @returns {{merkeGeschrieben: (wurzel: string, pfade: string[]) => void,
 *   indexAufEigenenStand: (wurzel: string) => boolean, offen: (wurzel: string) => string[]}}
 */
function createDbSchreibStand(deps = {}) {
  // Wurzel-Schlüssel -> { wurzel, pfade: Map(Pfad-Schlüssel -> Pfad) }
  const offenJeWurzel = new Map();

  /**
   * Merkt Dateien, die ein Schritt geschrieben oder entfernt hat, als «im Index
   * noch nicht bestätigt».
   *
   * @param {string} wurzel Bereichs-Wurzel.
   * @param {string[]} pfade Absolute Pfade.
   */
  function merkeGeschrieben(wurzel, pfade) {
    if (typeof wurzel !== 'string' || wurzel === '' || !Array.isArray(pfade)) return;
    const schluessel = pathCompareKey(path.resolve(wurzel));
    const eintrag = offenJeWurzel.get(schluessel) || { wurzel, pfade: new Map() };
    for (const pfad of pfade) {
      if (typeof pfad !== 'string' || pfad === '') continue;
      const abs = path.resolve(pfad);
      eintrag.pfade.set(pathCompareKey(abs), abs);
    }
    if (eintrag.pfade.size > 0) offenJeWurzel.set(schluessel, eintrag);
  }

  /**
   * Bringt den Index einer Wurzel auf den Stand der eigenen Schreibvorgänge.
   * Bei der Rückkehr mit `true` kennt der Index jede gemerkte Datei so, wie sie
   * auf der Platte liegt; ohne gemerkte Datei ist nichts zu tun.
   *
   * @param {string} wurzel Bereichs-Wurzel.
   * @returns {boolean} false, wenn der Index nicht bereit ist; die Pfade bleiben
   *   dann gemerkt und werden beim nächsten Aufruf nachgetragen.
   */
  function indexAufEigenenStand(wurzel) {
    if (typeof wurzel !== 'string' || wurzel === '') return false;
    const schluessel = pathCompareKey(path.resolve(wurzel));
    const eintrag = offenJeWurzel.get(schluessel);
    if (!eintrag) return true;
    const backlinks = deps.backlinks;
    if (!backlinks || typeof backlinks.trageDateienNach !== 'function') return false;
    if (backlinks.trageDateienNach(eintrag.wurzel, [...eintrag.pfade.values()]) !== true) {
      return false;
    }
    offenJeWurzel.delete(schluessel);
    return true;
  }

  /** @returns {string[]} die gemerkten, noch nicht nachgetragenen Pfade (Prüffälle). */
  function offen(wurzel) {
    const eintrag = offenJeWurzel.get(pathCompareKey(path.resolve(wurzel)));
    return eintrag ? [...eintrag.pfade.values()] : [];
  }

  return { merkeGeschrieben, indexAufEigenenStand, offen };
}

module.exports = { createDbSchreibStand };
