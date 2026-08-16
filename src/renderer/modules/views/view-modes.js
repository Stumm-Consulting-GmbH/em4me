// 4T-1054 (Epic 3E-0151): Ansichts-Modi und ihre CSS-Klassen — die eine Quelle.
//
// **Anlass.** Die Liste der zu entfernenden Modus-Klassen stand an fünf
// Stellen: der Modus-Umschaltung, dem System-Seiten- und dem Normal-Pfad des
// Pane-Renderns, zweimal im PDF-Export und beim Wechsel in den
// Bearbeiten-Modus. Der fünfte Modus wurde in 4T-1047 nur an einer davon
// nachgezogen, weshalb die Mindmap über der Einstellungs-Seite stehenblieb.
// Wer einen Modus ergänzt, ergänzt ihn seither hier; ein Wächter hält die
// Liste vollständig und prüft, dass keine Stelle wieder eine eigene führt.
//
// **Bewusst ohne jeden Import.** Das Modul wird von app-state, views,
// pane-render und pdf-export gebraucht; zöge es selbst etwas nach, entstünde
// genau die Lade-Kette, die in 4T-1047 einundzwanzig Testdateien gerissen hat.
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
