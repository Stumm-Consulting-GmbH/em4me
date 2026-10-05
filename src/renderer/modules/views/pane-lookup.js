// 4T-002021 (Epic 3E-000192): Der Weg von einem Element der gerenderten
// Ansicht zu seiner Spalte und zum geöffneten Dokument darin.
//
// Herausgelöst aus der Kontext-Auflösung des Grid-Editors der Datentabelle
// (perspective-datatable-editor.js, resolveContext), weil der Schritt der
// Diagramme denselben Weg braucht: Er liest den Editor-Puffer des geöffneten
// Dokuments, zu dem ein gerendertes Diagramm gehört. Eine zweite Fassung des
// Weges wäre eine zweite Stelle, an der über dieselbe Frage entschieden wird.
//
// Bewusst ohne Import: Der Zustand der Spalten kommt als Parameter. Das Modul
// gehört damit zu keinem Import-Zyklus des Anzeige-Prozesses, und beide
// Verbraucher können es laden, ohne ihre Ordner enger zu koppeln.
'use strict';

/**
 * Nummer der Spalte, in deren gerenderter Ansicht das Element steht.
 *
 * @param {Element} el Element innerhalb einer `.pane-group`
 * @returns {number} Spalten-Nummer, -1 außerhalb jeder Spalte
 */
export function renderedPaneIndex(el) {
  const group = el && el.closest ? el.closest('.pane-group') : null;
  const idx = group ? parseInt(group.dataset.pane, 10) : -1;
  return Number.isFinite(idx) && idx >= 0 ? idx : -1;
}

/**
 * Das geöffnete Dokument einer Spalte.
 *
 * @param {Array} panes Spalten-Zustand (`state.panes`)
 * @param {number} paneIdx Spalten-Nummer
 * @returns {object|null} Zustand des geöffneten Dokuments der Spalte
 */
export function activeTabOfPane(panes, paneIdx) {
  const pane = Array.isArray(panes) && paneIdx >= 0 ? panes[paneIdx] : null;
  return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] || null : null;
}
