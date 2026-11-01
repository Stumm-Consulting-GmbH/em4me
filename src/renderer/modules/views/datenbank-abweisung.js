// 4T-002405 (Epic 3E-000266, F4 A, F5 A): Der Grund, mit dem die Datenbank das
// Löschen oder Kopieren einer Karteikarte im Bereichs-Panel abgewiesen hat.
//
// Die Kanäle `area:trashFile` und `area:copyFile` geben eine Karteikarte als
// Auftrag an die Schreib-Schnittstelle (`src/main/database/kartei-weichen.js`)
// und reichen deren sprachneutrales Ergebnis bei einer Abweisung unverändert
// als `datenbank` zurück, mit `error: 'database'`. Den Satz dazu bildet dieses
// Modul wie die Maske und «Neue Karteikarte» (`loeseErgebnisAuf`), damit der
// Anwender denselben Grund liest, gleich an welchem Bedienort er löscht.
//
// Eigenes Modul neben `file-trash.js` und `file-copy.js`, weil beide es
// brauchen; ein Blatt ohne eigenen Zustand.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { loeseErgebnisAuf } from '../../../shared/database/auftrag-text.js';

// Fehler-Angabe der beiden Kanäle bei einer Abweisung der Datenbank
// (`KARTEI_FEHLER` in `kartei-weichen.js`).
const DATENBANK_FEHLER = 'database';

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

/**
 * Der Grund einer Abweisung durch die Datenbank als Satz, oder null, wenn das
 * Ergebnis keine solche Abweisung ist.
 *
 * @param {object|null} ergebnis Antwort von `area:trashFile` oder `area:copyFile`.
 * @returns {string|null}
 */
export function grundDerDatenbank(ergebnis) {
  if (!ergebnis || ergebnis.ok || ergebnis.error !== DATENBANK_FEHLER) return null;
  const saetze = loeseErgebnisAuf(ergebnis.datenbank || {}, { t, hat: hatSchluessel }).map(
    (lage) => lage.text,
  );
  return saetze.length > 0 ? saetze.join(' ') : t('database.card.failed');
}
