// 4T-001885 (Epic 3E-000189): Worauf sich der bereichsgebundene Block der
// Einstellungs-Seite gerade bezieht — auf ein Buch, ein Bücherregal oder einen
// gewöhnlichen Bereich.
//
// **Warum es diese Frage gibt.** Ein Buch IST technisch ein Bereich: Eine Buch-
// wie eine Regal-Applikation trägt die Bereichs-Bindung auf ihren Ordner
// (`book-apps.js`, `shelf-apps.js`). Der Block erschien deshalb immer schon,
// hieß aber «Aktueller Bereich» — und der Anwender musste selbst erschließen,
// dass sein Buch gemeint ist. Die Auskunft, die dafür fehlte, liegt im
// Anzeige-Prozess längst bereit (`state.bookName`, `state.shelfName`); sie wurde
// nur nicht gelesen.
//
// **Maßgeblich ist die Bindung des Fensters, nicht das sichtbare Dokument**
// (Story 4S-000994, AK13). Beide Namen kommen aus der Applikations-Bindung des
// Hauptprozesses und wechseln nicht mit dem Reiter im Vordergrund; zwei Fenster
// mit verschiedenen Bindungen haben jedes seine eigene Antwort (AK14).
//
// **Bei abgeschalteter Erweiterung «Bücher» bleibt alles beim Alten** (AK der
// Story-Abgrenzung): Dann ist die Antwort «Bereich», und Block-Titel,
// Abschnitts-Überschriften und der erste Abschnitt verhalten sich, als hätte es
// diese Unterscheidung nie gegeben. Dieselbe Prüfung nimmt der Editor beim
// Buch-Namen vor (`editor.js`), damit an beiden Stellen dasselbe gilt.
//
// Das Modul importiert bewusst nichts aus dem Einstellungs-Ordner.
'use strict';

import { state } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

export const KONTEXT_BEREICH = 'area';
export const KONTEXT_BUCH = 'book';
export const KONTEXT_REGAL = 'shelf';

/**
 * Der Bezug des bereichsgebundenen Blocks im aktuellen Fenster.
 *
 * @returns {string} KONTEXT_BUCH, KONTEXT_REGAL oder KONTEXT_BEREICH.
 */
export function einstellungsKontext() {
  if (!state.areaPath) return KONTEXT_BEREICH;
  if (!isExtensionActive('books')) return KONTEXT_BEREICH;
  if (state.bookName) return KONTEXT_BUCH;
  if (state.shelfName) return KONTEXT_REGAL;
  return KONTEXT_BEREICH;
}

/**
 * Wählt aus drei i18n-Schlüsseln den zum Bezug passenden.
 *
 * Der eingesetzte NAME bleibt davon unberührt: Geändert wird die Bezeichnung
 * «Bereich», nicht der Name, den die Beschriftung einsetzt (AK12 der Story).
 *
 * @param {{area: string, book: string, shelf: string}} schluessel Die drei Fassungen.
 * @returns {string} Der Schlüssel des aktuellen Bezugs.
 */
export function kontextSchluessel(schluessel) {
  const kontext = einstellungsKontext();
  if (kontext === KONTEXT_BUCH) return schluessel.book;
  if (kontext === KONTEXT_REGAL) return schluessel.shelf;
  return schluessel.area;
}
