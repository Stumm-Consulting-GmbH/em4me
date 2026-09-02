// 4T-001054 (Epic 3E-000151): Ansichts-Modi und ihre CSS-Klassen — die eine Quelle.
//
// **Anlass.** Die Liste der zu entfernenden Modus-Klassen stand an fünf
// Stellen: der Modus-Umschaltung, dem System-Seiten- und dem Normal-Pfad des
// Pane-Renderns, zweimal im PDF-Export und beim Wechsel in den
// Bearbeiten-Modus. Der fünfte Modus wurde in 4T-001047 nur an einer davon
// nachgezogen, weshalb die Mindmap über der Einstellungs-Seite stehenblieb.
// Wer einen Modus ergänzt, ergänzt ihn seither hier; ein Wächter hält die
// Liste vollständig und prüft, dass keine Stelle wieder eine eigene führt.
//
// **Bewusst ohne jeden Import.** Das Modul wird von app-state, views,
// pane-render und pdf-export gebraucht; zöge es selbst etwas nach, entstünde
// genau die Lade-Kette, die in 4T-001047 einundzwanzig Testdateien gerissen hat.
'use strict';

/** Alle Ansichts-Modi eines Reiters, in der Reihenfolge ihrer Tastenkürzel. */
export const VIEW_MODES = ['source', 'split', 'rendered', 'live', 'mindmap'];

/** Klasse der System-Seiten. Kein Modus, aber von denselben Stellen gesetzt. */
export const SYSTEM_VIEW_CLASS = 'view-system';

/** Die CSS-Klassen der Modi, abgeleitet statt zweitgeführt. */
export const VIEW_MODE_CLASSES = VIEW_MODES.map((modus) => `view-${modus}`);

/** Ist der Wert ein bekannter Ansichts-Modus? */
export function isViewMode(wert) {
  return VIEW_MODES.includes(wert);
}

/**
 * 4T-001341 (Epic 3E-000238): Die Ansichten, in denen bearbeitet wird — und damit
 * die wählbaren Ziele des Wechsels in den Bearbeiten-Modus.
 *
 * Die Lese-Ansicht fehlt, weil sie der Ausgangspunkt des Wechsels ist und kein
 * Ziel; die Mindmap fehlt, weil sie kein Editor-Modus ist. Die Liste steht hier
 * und nicht im Zustand, weil dieses Modul die eine Quelle der Modus-Listen ist.
 */
export const EDIT_VIEW_MODES = ['split', 'source', 'live'];

/**
 * Voreinstellung des Wechsels. Bis 4T-001341 war „geteilt" fest verdrahtet; der
 * Wert bleibt die Voreinstellung, damit ein Bestandsprofil ohne die Einstellung
 * sich unverändert verhält.
 */
export const DEFAULT_EDIT_VIEW_MODE = 'split';

/**
 * In welche Ansicht der Wechsel in den Bearbeiten-Modus führt.
 *
 * Prozessneutral und ohne DOM, damit die Entscheidung ohne Editor prüfbar ist;
 * der Renderer hält nur die Verdrahtung. Ein unbekannter, fehlender oder nicht
 * bearbeitbarer Wert fällt auf die Voreinstellung zurück, statt eine Ansicht zu
 * setzen, die es nicht gibt.
 *
 * @param {unknown} einstellung der gespeicherte Wert.
 * @returns {string} einer aus `EDIT_VIEW_MODES`.
 */
export function zielAnsichtDesAenderungsmodus(einstellung) {
  return EDIT_VIEW_MODES.includes(einstellung) ? einstellung : DEFAULT_EDIT_VIEW_MODE;
}

/**
 * Setzt die Ansichts-Klasse eines Inhalts-Elements und entfernt dabei jede
 * andere, einschließlich der System-Klasse.
 *
 * @param {Element} contentEl das `.content`-Element der Spalte.
 * @param {string} klasse `view-<modus>` oder die System-Klasse; leer entfernt nur.
 */
export function applyContentViewClass(contentEl, klasse) {
  if (!contentEl) return;
  contentEl.classList.remove(...VIEW_MODE_CLASSES, SYSTEM_VIEW_CLASS);
  if (klasse) contentEl.classList.add(klasse);
}
