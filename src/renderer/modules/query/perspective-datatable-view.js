'use strict';

// 4T-0418 (Epic 3E-0079): Renderer-seitige Lokalisierung der Perspective
// Datatable. Das Grid-HTML kommt vollständig aus der Pipeline
// (perspective-datatable.js); dieses Modul füllt nur die Texte, die
// Platzhalter brauchen (Struktur-Fehler mit {line}/{detail}, Zeilen-
// Limit-Hinweis mit {total}) — die placeholder-freien Texte (Aggregat-
// Beschriftung, Fehler-Zellen-Tooltips) laufen über data-i18n bzw.
// data-i18n-title und applyTranslations. Modus-agnostisch: derselbe
// Aufruf läuft in Render-Pane, Reading und im Live-Block-Widget.

import { t } from '../../i18n.js';

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
  // 4T-0421: Spalten-Formeln.
  badExpr: 'datatable.error.badExpr',
  computedBadRef: 'datatable.error.computedBadRef',
  computedCycle: 'datatable.error.computedCycle',
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
