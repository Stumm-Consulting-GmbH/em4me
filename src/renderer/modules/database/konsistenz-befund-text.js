// 4T-002404 (Epic 3E-000266, F3 A): Der Satz zu einem Befund der
// Konsistenz-Prüfung, aus `konsistenz-abschnitt.js` geschnitten.
//
// **Warum ein eigenes Modul.** Den Satz brauchen zwei Orte: die Befund-Liste der
// Konsistenz-Prüfung und die Anzeige der Befunde einer Karteikarte nach dem
// Speichern (`karteikarte-befunde.js`). Jene erreicht der Speicher-Weg des
// Editors nicht, ohne einen Import-Zyklus über die Masken-Seite zu schließen;
// dieses Modul ist ein Blatt und liest allein die Sprachdatei und die
// Einsetzung aus `auftrag-text.js`. Die Rümpfe stehen zeichengleich wie zuvor.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { setzeTextEin } from '../../../shared/database/auftrag-text.js';

const PRAEFIX = 'database.konsistenz.';

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

/**
 * Der Satz zu einem Befund in der Sprache der Oberfläche.
 *
 * @param {object} befund Ein Befund aus `konsistenz-pruefung.js`.
 * @param {{sprache?: string|null, rueckfallSprache?: string|null}} [umgebung]
 * @returns {string}
 */
export function befundText(befund, umgebung = {}) {
  const b = befund && typeof befund === 'object' ? befund : {};
  // Die zweite Fassung für den Verweis ohne Ziel-Angabe, wie beim Regel-Werk.
  const code =
    b.code === 'konsistenzVerweisTabelleUnbekannt' && b.zieltabelle === null
      ? 'konsistenzVerweisTabelleFehlt'
      : b.code;
  const key = `${PRAEFIX}${code}`;
  if (typeof code !== 'string' || !hatSchluessel(key)) return String(b.code || '');
  return setzeTextEin(t(key), b, { t, hat: hatSchluessel, ...umgebung });
}
