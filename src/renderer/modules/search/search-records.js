// 4T-002332 (Epic 3E-000264): Zeichnung und Sprung der Datensatz-Treffer der
// Bereichs-Suche.
//
// Die Treffer selbst liefert der Bereich mit seiner Antwort (Haupt-Prozess,
// `src/main/area/area-search-records.js`, 4T-002331); ein eigener Lieferant ist
// deshalb nicht nötig. Dieses Modul beantwortet drei Fragen: woran ein
// Datensatz-Treffer und seine Gruppe zu erkennen sind, wie Gruppen-Kopf und
// Treffer-Zeile sich von denen eines Dokuments unterscheiden und wohin ein
// Klick führt.
//
// Entscheidungen des Epics (Freigabe des Product Owners vom 2026-10-20):
// - F1 Option A: Datensatz-Gruppen stehen je Tabelle in derselben Liste hinter
//   den Dokument-Gruppen. Ein Suchlauf, eine Liste, eine Gesamtzahl.
// - E16.3: Ein Klick öffnet den Datensatz in seiner Maske, nicht das
//   Tabellen-Dokument; das ist nach F1 des Datenbank-Epics technische Ablage.
//
// Eigenes Modul statt Zeilen in search-panel.js: Das Panel steht nah an seinem
// Zeilen-Budget, und search-jump.js ist Konfliktfläche mit einem fremden Zweig
// an der Suche. Beide tragen deshalb nur Aufrufe beziehungsweise die
// Registrierung des Sprung-Wegs (in search-jump.js).
//
// Bewusst ohne Import aus dem Such-Ordner: Das Panel importiert dieses Modul,
// und ein Import von search.js oder search-jump.js schlösse den Kreis
// Panel, search-records.js, search-jump.js, search-run.js, Panel. Der
// Ordner-Import-Wächter meldete ihn, und die Registrierung hinge an der
// Lade-Reihenfolge (gemessen am 2026-10-20: «Cannot access 'SPRUNG_WEGE'
// before initialization», sobald search-jump.js zuerst geladen wird). Deshalb
// registriert search-jump.js den Sprung-Weg und räumt dort auch die
// Markierungen ab.
'use strict';

import { t } from '../../i18n.js';
import { openRecordHit } from '../query/record-hit-click.js';

// Suffix der Gruppen-Kennung einer Datensatz-Gruppe, aus dem geteilten Suchkern,
// den auch der Haupt-Prozess liest; so gibt es die Konstante genau einmal, und
// kein Prozess muss den anderen importieren.
import { DATENSATZ_GRUPPEN_SUFFIX } from '../../../shared/search-scope.js';
export { DATENSATZ_GRUPPEN_SUFFIX };

// Die Herkunft eines Datensatz-Treffers im Treffer-Objekt.
const QUELLE = 'record';

/**
 * Ist die Gruppen-Kennung die einer Datensatz-Gruppe?
 *
 * @param {string} gruppe Gruppen-Kennung aus der Antwort des Bereichs.
 * @returns {boolean}
 */
export function istDatensatzGruppe(gruppe) {
  return typeof gruppe === 'string' && gruppe.endsWith(DATENSATZ_GRUPPEN_SUFFIX);
}

/**
 * Ist der Treffer ein Datensatz-Treffer?
 *
 * @param {object} treffer
 * @returns {boolean}
 */
export function istDatensatzTreffer(treffer) {
  return !!treffer && treffer.quelle === QUELLE;
}

/**
 * Ergänzt den Gruppen-Kopf einer Datensatz-Gruppe: eine Klasse und hinter dem
 * Tabellen-Namen die Art der Gruppe. Ohne diesen Zusatz sähe die Gruppe
 * «Library» aus wie ein Dokument dieses Namens, das es zugleich geben kann.
 * Ein Dokument-Kopf bleibt unverändert.
 *
 * @param {HTMLElement} kopf Der fertige Gruppen-Kopf des Panels.
 * @param {{gruppe: string}} gruppe Die Gruppe aus dem Trefferbestand.
 */
export function schmueckeGruppenKopf(kopf, gruppe) {
  if (!kopf || !gruppe || !istDatensatzGruppe(gruppe.gruppe)) return;
  kopf.classList.add('search-results-group-records');
  const art = document.createElement('span');
  art.className = 'search-results-group-kind';
  art.textContent = t('database.search.groupSuffix');
  const titel = kopf.querySelector('.search-results-group-title');
  if (titel) titel.after(art);
  else kopf.appendChild(art);
}

/**
 * Ergänzt die Zeile eines Datensatz-Treffers: vor dem Ausschnitt die
 * Anzeige-Form des Datensatzes und der Feld-Name, etwa
 * «The Name of the Rose · author: Umberto Eco». Gerufen, bevor das Panel den
 * Ausschnitt anhängt; eine Dokument-Zeile bleibt unverändert.
 *
 * @param {HTMLElement} zeile Die Treffer-Zeile des Panels.
 * @param {object} treffer
 */
export function schmueckeTrefferZeile(zeile, treffer) {
  if (!zeile || !istDatensatzTreffer(treffer)) return;
  zeile.classList.add('search-results-item-record');
  zeile.title = t('database.search.openForm');
  const meta = document.createElement('span');
  meta.className = 'search-results-record-meta';
  const anzeige = treffer.anzeige || (treffer.sprung && treffer.sprung.kennung) || '';
  meta.textContent = treffer.feld ? `${anzeige} · ${treffer.feld}: ` : `${anzeige} · `;
  zeile.appendChild(meta);
}

/**
 * Die Gruppen und Treffer, die die Liste zeichnet.
 *
 * Im Ersetzen-Modus entfallen Datensatz-Gruppen und Datensatz-Treffer: Das
 * Ersetzen im Bereich lässt den Datensatz-Block ausdrücklich aus
 * (`src/main/area/area-replace.js`), und ein ankreuzbarer Datensatz-Treffer
 * täuschte eine Zusage vor, die niemand einlöst. Der Bestand selbst bleibt
 * unverändert; der Zähler über der Liste zählt weiter alle Treffer.
 *
 * @param {{gruppen: Array, treffer: Array}} bestand Trefferbestand des Panels.
 * @param {boolean} ersetzenModus
 * @returns {{gruppen: Array<{gruppe: object, gruppenIndex: number, start: number}>,
 *   treffer: Array}} Die gezeichneten Gruppen mit ihrem Index im Bestand und dem
 *   Index ihres ersten Treffers in `bestand.treffer`, dazu die gezeichneten
 *   Treffer als flache Liste.
 */
export function sichtbareGruppenUndTreffer(bestand, ersetzenModus) {
  const gruppen = [];
  const treffer = [];
  const alle = (bestand && bestand.gruppen) || [];
  const liste = (bestand && bestand.treffer) || [];
  let start = 0;
  for (let g = 0; g < alle.length; g++) {
    const gruppe = alle[g];
    const anzahl = gruppe.anzahl || 0;
    if (!(ersetzenModus && istDatensatzGruppe(gruppe.gruppe))) {
      gruppen.push({ gruppe, gruppenIndex: g, start });
      for (let i = start; i < start + anzahl && i < liste.length; i++) {
        if (!(ersetzenModus && istDatensatzTreffer(liste[i]))) treffer.push(liste[i]);
      }
    }
    start += anzahl;
  }
  return { gruppen, treffer };
}

/**
 * Öffnet den Datensatz eines Treffers in seiner Maske.
 *
 * Über `openRecordHit` und damit über dasselbe Ereignis `scg:open-form` wie der
 * Datensatz-Klick im Abfrage-Ergebnis; das Tor des Aus-Zustands der Erweiterung
 * «Datenbank» liegt an seiner einen Stelle in der Masken-Seite. Diese Funktion
 * löst nur das Ereignis aus. Das Abräumen der Markierungen des zuvor gezeigten
 * Dokuments übernimmt der Sprung-Weg in search-jump.js, der sie ruft; markiert
 * wird danach nichts, weil die Maske kein durchsuchter Text ist.
 *
 * Ein Markier-Weg entfällt: Markier-Wege hängen am Suchraum (search.scope), und
 * der Raum der Datensatz-Treffer ist der Bereich, dessen Weg bereits steht.
 *
 * @param {object} treffer
 * @returns {boolean} true, wenn die Maske angefordert wurde.
 */
export function springeZuDatensatz(treffer) {
  const sprung = treffer && treffer.sprung;
  if (!sprung || !sprung.tabelle || !sprung.kennung) return false;
  return openRecordHit({ path: sprung.tabelle, id: sprung.kennung });
}
