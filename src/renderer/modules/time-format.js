// 4T-001792 (Epic 3E-000255, Bauplan S9): Die lokale Anzeige eines
// gespeicherten Zeitpunkts, an genau einer Stelle.
//
// Der Helfer lag modul-lokal in der Historien-Seite. Seit die Beleg-Ansicht
// denselben Dienst braucht, zieht er hierher: Eine zweite Kopie wäre die
// Stelle, an der die beiden Anzeigen bei der nächsten Änderung auseinander
// liefen, und der Befund der Test-Iteration 0.40.0 müsste ein zweites Mal
// gefunden werden.
//
// **Flach und nicht in einem Feature-Ordner**, nach dem Muster von
// `path-format.js`: Ein Anzeige-Format ist ein Einzelgänger und gehört keiner
// Fachlichkeit mit mehreren Modulen an (Entwicklungsrichtlinien, Kapitel 1).
// Das Modul importiert allein die Sprach-Kennung und kann damit an keinem
// Import-Zyklus teilnehmen.
'use strict';

import { intlLocale } from '../i18n.js';

/**
 * Ein gespeicherter Zeitpunkt in lokaler Anzeige; gespeichert bleibt UTC.
 *
 * Feste Stellenzahl statt Locale-Vorgabe, also Tag, Monat, Stunde, Minute und
 * Sekunde immer zweistellig und das Jahr vierstellig; Reihenfolge und
 * Trennzeichen folgen weiterhin der Sprache der Oberfläche. Ein nicht
 * auslegbarer Wert kommt unverändert zurück, statt zu werfen: Die Anzeige eines
 * Zeitpunkts darf eine ganze Seite nie kosten.
 *
 * @param {string} iso Zeitpunkt in ISO-8601-Form.
 * @returns {string} Der Zeitpunkt in der Sprache der Oberfläche.
 */
export function localTimestamp(iso) {
  try {
    // 4T-001594: BCP-47-Form statt Kennung — `custom:<code>` wirft hier.
    return new Date(iso).toLocaleString(intlLocale() || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
