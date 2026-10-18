'use strict';

// 4T-000418 (Epic 3E-000079): Renderer-seitige Lokalisierung der Perspective
// Datatable. Das Grid-HTML kommt vollständig aus der Pipeline
// (perspective-datatable.js); dieses Modul füllt nur die Texte, die
// Platzhalter brauchen (Struktur-Fehler mit {line}/{detail}, Zeilen-
// Limit-Hinweis mit {total}) — die placeholder-freien Texte (Aggregat-
// Beschriftung, Fehler-Zellen-Tooltips) laufen über data-i18n bzw.
// data-i18n-title und applyTranslations. Modus-agnostisch: derselbe
// Aufruf läuft in Render-Pane, Reading und im Live-Block-Widget.
// 4T-002072 (Epic 3E-000192): ERROR_KEYS vervollständigt; ein Wächter in
// test/unit/perspective-datatable.test.js hält sie mit dem Parser gleich.

import { applyTranslations, t } from '../../i18n.js';
import { api } from '../app/api.js';

// Struktur-Fehler-Codes des Parsers (src/shared/markdown/perspective-
// datatable.js) auf i18n-Keys abgebildet; unbekannte Codes behalten den
// sprachneutralen Fallback-Text aus der Pipeline (Code + Zeile).
const ERROR_KEYS = {
  noColumns: 'datatable.error.noColumns',
  duplicateDirective: 'datatable.error.duplicateDirective',
  badColumnDef: 'datatable.error.badColumnDef',
  unknownType: 'datatable.error.unknownType',
  badFormat: 'datatable.error.badFormat',
  duplicateColumn: 'datatable.error.duplicateColumn',
  badAggregate: 'datatable.error.badAggregate',
  unknownAggregate: 'datatable.error.unknownAggregate',
  unknownAggregateColumn: 'datatable.error.unknownAggregateColumn',
  aggregateTypeMismatch: 'datatable.error.aggregateTypeMismatch',
  rowCellCount: 'datatable.error.rowCellCount',
  invalidLine: 'datatable.error.invalidLine',
  // 4T-000421: Spalten-Formeln.
  badExpr: 'datatable.error.badExpr',
  computedBadRef: 'datatable.error.computedBadRef',
  computedCycle: 'datatable.error.computedCycle',
  // 4T-002072 (Epic 3E-000192): Kennungen, deren Texte es in allen fünf
  // Sprachen gab, die hier aber fehlten — der Fehlerkasten zeigte den Code.
  // Ein Wächter in test/unit/perspective-datatable.test.js verlangt seither
  // für jede Kennung des Parsers einen Eintrag.
  badColumnLabel: 'datatable.error.badColumnLabel',
  unknownTypesValue: 'datatable.error.unknownTypesValue',
  emptyTableName: 'datatable.error.emptyTableName',
  invalidTableName: 'datatable.error.invalidTableName',
};

export function applyPerspectiveDatatablesIfPresent(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const errorItems = container.querySelectorAll(
    '.perspective-datatable .pdt-error-item[data-dt-code]',
  );
  for (const el of errorItems) {
    const key = ERROR_KEYS[el.dataset.dtCode];
    if (!key) continue;
    el.textContent = t(key)
      .replace('{line}', el.dataset.dtLine || '')
      .replace('{detail}', el.dataset.dtDetail || '');
  }
  const limits = container.querySelectorAll('.perspective-datatable .pdt-limit[data-dt-total]');
  for (const el of limits) {
    el.textContent = t('datatable.rowLimit').replace('{total}', el.dataset.dtTotal || '');
  }
}

// 4T-002054: Druck und PDF geben alle Zeilen aus; die Zeilen-Grenze gilt allein
// dem Gitter in der Anwendung (Entscheidung des Product Owners vom 2026-09-30).
// Jede gekürzte Datentabelle unter `wurzel` (erkennbar am Hinweis `.pdt-limit`)
// wird aus ihrem `data-dt-source` über dieselbe Pipeline mit allen Zeilen neu
// gezeichnet; der Behälter samt seinen Angaben bleibt stehen, getauscht wird
// allein sein Inhalt. Die alten Knoten werden aufbewahrt, nicht neu gebaut, damit
// das Zurückstellen Bindungen und Zustand des Gitters unverändert zurückbringt.
// Liefert die Rücknahme; sie ist auch ohne gekürzte Tabelle aufrufbar.
export function zeichneGekuerzteDatentabellenVoll(wurzel, basePath) {
  const ruecknahmen = [];
  if (!wurzel || typeof wurzel.querySelectorAll !== 'function') return () => {};
  for (const behaelter of wurzel.querySelectorAll('.perspective-datatable')) {
    if (!behaelter.querySelector(':scope > .pdt-limit')) continue;
    const quelle = behaelter.dataset.dtSource || '';
    // Zaun länger als jeder Backtick-Lauf im Inhalt, damit er den Block nicht beendet.
    const laeufe = quelle.match(/`+/g) || [];
    const zaun = '`'.repeat(Math.max(3, ...laeufe.map((l) => l.length + 1)));
    const text = `${zaun}perspective-datatable\n${quelle.replace(/\n?$/, '\n')}${zaun}\n`;
    const huelle = document.createElement('div');
    huelle.innerHTML = api.renderMarkdown(text, basePath || '', {
      frontmatterBlock: false,
      datatableAlleZeilen: true,
    });
    const neu = huelle.querySelector('.perspective-datatable');
    if (!neu || neu.querySelector('.pdt-limit')) continue;
    const alt = document.createDocumentFragment();
    while (behaelter.firstChild) alt.appendChild(behaelter.firstChild);
    while (neu.firstChild) behaelter.appendChild(neu.firstChild);
    applyTranslations(behaelter);
    applyPerspectiveDatatablesIfPresent(behaelter);
    ruecknahmen.push(() => behaelter.replaceChildren(alt));
  }
  return () => {
    for (const zurueck of ruecknahmen) zurueck();
  };
}
