// 4T-000986 (Epic 3E-000196): Perspective Datatable — HTML-Bausteine.
// Aus perspective-datatable.js herausgelöst: Grid-HTML des Viewers
// (Fehler-Liste, Tabelle) und die statische Tabelle des Portable-Exports.
// Prozess-neutral (kein Electron, kein DOM — reine String-Erzeugung).
//
// Arbeitsteilung mit dem Kern: die Bauer bekommen das fertige Datenmodell
// samt berechneten Zellen und Aggregaten gereicht und parsen bzw. rechnen
// selbst nichts. Der Kern (perspective-datatable.js) hält dafür die zwei
// Einstiege renderPerspectiveDatatableViewer und
// convertPerspectiveDatatableBlockToHtml.
'use strict';

// escapeHtml aus slug.js (Muster der Nachbar-Module).
const { escapeHtml } = require('./slug.js');
const { dataIndexByColumn } = require('./perspective-datatable-computed.js');
const { formatCellDisplay, formatAggregateDisplay } = require('./perspective-datatable-view.js');

// Ober-Grenze der gerenderten Datenzeilen: darüber zeigt das Grid nur Kopf
// und Aggregate mit lokalisiertem Hinweis (bewusste dokumentierte Grenze
// statt virtuellem Scrolling; PO-Vorschlag 1000 aus 4T-000418). Aggregate
// rechnen weiterhin über ALLE Zeilen.
const MAX_RENDER_ROWS = 1000;

// --- Viewer-HTML (4T-000418) ----------------------------------------------------------

// Fehler-Liste als Platzhalter-Knoten: der Renderer lokalisiert die Texte
// über data-dt-code/-line/-detail (applyPerspectiveDatatablesIfPresent);
// der eingebettete Fallback-Text bleibt sprachneutral (Code + Zeile).
function buildErrorsHtml(errors) {
  const out = ['<div class="pdt-errors">'];
  out.push(
    '<span class="pdt-errors-title" data-i18n="datatable.errors.title">perspective-datatable</span>',
  );
  for (const err of errors) {
    const line = Number(err.line) || 0;
    const detail = escapeHtml(String(err.detail == null ? '' : err.detail));
    out.push(
      `<div class="pdt-error-item" data-dt-code="${escapeHtml(err.code)}" ` +
        `data-dt-line="${line}" data-dt-detail="${detail}">` +
        `${escapeHtml(err.code)} [${line}]</div>`,
    );
  }
  out.push('</div>');
  return out.join('');
}

// Einzelne Daten-Zelle. Fehler-Zellen zeigen den Rohtext mit lokalisiertem
// Tooltip (data-i18n-title); Boolean als read-only Checkbox (nicht die
// task-list-Klasse, damit enableTaskCheckboxes sie nicht aktiviert).
function buildCellHtml(col, colIdx, cell, editable) {
  const cls = ['pdt-cell', `pdt-type-${col.type}`];
  const attrs = [`data-dt-col="${colIdx}"`];
  // 4T-000419: editierbare Zellen sind fokussierbar (F2/Enter öffnet die
  // Bearbeitung; die Handler prüfen den Modus zur Laufzeit).
  if (editable) attrs.push('tabindex="0"');
  let inner;
  if (cell && cell.error) {
    cls.push('pdt-cell-error');
    attrs.push(`data-i18n-title="datatable.cellError.${escapeHtml(cell.error)}"`);
    inner = escapeHtml(cell.text);
  } else if (col.type === 'boolean') {
    inner = `<input type="checkbox" disabled${cell && cell.value ? ' checked' : ''}>`;
  } else {
    inner = escapeHtml(formatCellDisplay(col, cell ? cell.value : null));
  }
  return `<td class="${cls.join(' ')}" ${attrs.join(' ')}>${inner}</td>`;
}

// Zelle einer berechneten Spalte: read-only (kein tabindex), visuell
// abgesetzt; Typ-Abweichungen als Fehler-Zelle mit Tooltip (4T-000421).
function buildComputedCellHtml(col, colIdx, comp) {
  const cls = ['pdt-cell', 'pdt-computed', `pdt-type-${col.type}`];
  const attrs = [`data-dt-col="${colIdx}"`];
  let inner;
  if (comp && comp.error) {
    cls.push('pdt-cell-error');
    attrs.push(`data-i18n-title="datatable.cellError.${escapeHtml(comp.error)}"`);
    inner = '—';
  } else if (col.type === 'boolean') {
    inner =
      comp && comp.value != null
        ? `<input type="checkbox" disabled${comp.value ? ' checked' : ''}>`
        : '';
  } else {
    inner = escapeHtml(formatCellDisplay(col, comp ? comp.value : null));
  }
  return `<td class="${cls.join(' ')}" ${attrs.join(' ')}>${inner}</td>`;
}

// Grid-Tabelle des Viewers. computed (aus computeComputedCells) und aggs
// (aus computeAggregates über den Wert-Resolver) rechnet der Kern vorab
// und reicht sie herein.
function buildDatatableTableHtml(model, computed, aggs) {
  const columns = model.columns;
  const dataIdx = dataIndexByColumn(columns);
  const hasAgg = (model.aggregates || []).some((a) => a && a.length > 0);
  const truncated = model.rows.length > MAX_RENDER_ROWS;
  // 4T-000419: Editier-Affordanzen (Lösch-Spalte, Zeile-hinzufügen-Knopf,
  // fokussierbare Zellen) nur bei struktur-fehlerfreier Tabelle — der
  // Grid-Editor blockiert das Rückschreiben sonst ohnehin. Sichtbar werden
  // die Affordanzen nur in editierbaren Kontexten (CSS über die View-
  // Modus-Klassen bzw. das Live-Widget); Reading und Handbuch bleiben ohne.
  const editable = (model.errors || []).length === 0;
  const out = ['<table class="pdt-grid">'];

  out.push('<thead><tr>');
  if (editable && !truncated) out.push('<th class="pdt-row-del" aria-hidden="true"></th>');
  // 4T-001313 (Epic 3E-000235): Ohne `types`-Zeile im Block gilt die Anzeige.
  const zeigeTypen = model.showTypes !== false;
  columns.forEach((col, i) => {
    const cls = ['pdt-col', `pdt-type-${col.type}`];
    if (col.expr != null) cls.push('pdt-computed');
    // Ausdruck als Tooltip am Kopf der berechneten Spalte (Syntax, kein
    // übersetzbarer Text).
    // 4T-001313: Trägt die Spalte einen Anzeigetext, nennt der Merkzettel
    // zusätzlich ihre Kennung — beim Schreiben eines Ausdrucks oder einer
    // Aggregat-Angabe wird sie gebraucht und stünde sonst nirgends.
    const merkzettelTeile = [];
    if (col.label) merkzettelTeile.push(col.name);
    if (col.expr != null) merkzettelTeile.push(`= ${col.expr}`);
    const title = merkzettelTeile.length
      ? ` title="${escapeHtml(merkzettelTeile.join('\n'))}"`
      : '';
    out.push(
      `<th class="${cls.join(' ')}" data-dt-col="${i}" scope="col"${title}>` +
        `<span class="pdt-name">${escapeHtml(col.label || col.name)}</span>` +
        (zeigeTypen ? `<span class="pdt-type">${escapeHtml(col.type)}</span>` : '') +
        `</th>`,
    );
  });
  out.push('</tr></thead>');

  if (!truncated && model.rows.length > 0) {
    out.push('<tbody>');
    model.rows.forEach((row, r) => {
      out.push(`<tr data-dt-row="${r}">`);
      if (editable) {
        out.push(
          '<td class="pdt-row-del"><button type="button" class="pdt-del-btn" ' +
            'data-i18n-title="datatable.deleteRow" tabindex="-1">×</button></td>',
        );
      }
      columns.forEach((col, i) => {
        const di = dataIdx[i];
        if (di == null) {
          const perCol = computed.get(row);
          out.push(buildComputedCellHtml(col, i, perCol ? perCol[i] : null));
          return;
        }
        out.push(buildCellHtml(col, i, row[di], editable));
      });
      out.push('</tr>');
    });
    out.push('</tbody>');
  }

  if (hasAgg) {
    out.push('<tfoot><tr class="pdt-agg-row">');
    if (editable && !truncated) out.push('<td class="pdt-row-del"></td>');
    columns.forEach((col, i) => {
      const inner = aggs[i]
        .map(
          (entry) =>
            `<span class="pdt-agg">` +
            `<span class="pdt-agg-label" data-i18n="datatable.aggregate.${entry.func}">${entry.func}</span>` +
            `<span class="pdt-agg-value">${escapeHtml(formatAggregateDisplay(col, entry))}</span></span>`,
        )
        .join('');
      // data-dt-col: die Ansichts-Funktionen (4T-000420) aktualisieren die
      // Aggregat-Werte bei gefilterter Ansicht zellgenau im DOM.
      out.push(`<td class="pdt-cell pdt-type-${col.type}" data-dt-col="${i}">${inner}</td>`);
    });
    out.push('</tr></tfoot>');
  }
  out.push('</table>');

  if (editable && !truncated) {
    out.push(
      '<div class="pdt-add-row"><button type="button" class="pdt-add-btn">' +
        '<span aria-hidden="true">+</span> ' +
        '<span data-i18n="datatable.addRow">addRow</span></button></div>',
    );
  }

  if (truncated) {
    // Sprachneutraler Fallback-Text; lokalisiert der Renderer über
    // data-dt-total (applyPerspectiveDatatablesIfPresent).
    out.push(
      `<div class="pdt-limit" data-dt-total="${model.rows.length}">` +
        `${model.rows.length} &gt; ${MAX_RENDER_ROWS}</div>`,
    );
  }
  return out.join('');
}

// --- Portable-HTML (4T-000418) --------------------------------------------------------

// Statische HTML-Tabelle mit Inline-Styles für den Portable-Export.
// Sprachneutral (Aggregat-Beschriftung = Funktions-Schlüsselwort, wie die
// Fence-Syntax selbst); alle Zeilen werden exportiert (die Render-Ober-
// Grenze schützt nur die Live-Pipeline). Struktur-Fehler fängt der Kern
// bereits ab (Muster perspective-table).
function buildPortableDatatableHtml(model, computed, aggs) {
  const columns = model.columns;
  const dataIdx = dataIndexByColumn(columns);
  const hasAgg = (model.aggregates || []).some((a) => a && a.length > 0);
  const alignStyle = (col) => {
    if (col.type === 'number') return 'text-align: right;';
    if (col.type === 'boolean') return 'text-align: center;';
    return '';
  };
  const out = ['<table>'];
  out.push('<thead><tr>');
  for (const col of columns) {
    const style = alignStyle(col);
    // 4T-001313 (Epic 3E-000235): Auch die weitergegebene Fassung trägt den
    // Anzeigetext. Der Empfänger hat die Kennung sonst vor sich, während der
    // Absender die Beschriftung sieht.
    out.push(
      `<th scope="col"${style ? ` style="${style}"` : ''}>${escapeHtml(col.label || col.name)}</th>`,
    );
  }
  out.push('</tr></thead>');
  if (model.rows.length > 0) {
    out.push('<tbody>');
    for (const row of model.rows) {
      out.push('<tr>');
      columns.forEach((col, i) => {
        const di = dataIdx[i];
        // 4T-000421: berechnete Spalten liefern ihren gerechneten Wert
        // (Zellen-Sicht identisch zu Daten-Zellen; error/value/text).
        let cell = di == null ? null : row[di];
        if (di == null) {
          const perCol = computed.get(row);
          cell = perCol ? perCol[i] : null;
        }
        const styles = [];
        const align = alignStyle(col);
        if (align) styles.push(align);
        let inner = '';
        if (cell && cell.error) {
          // Fehler-Zelle: Rohtext mit dezenter Markierung (Farben wie die
          // error-Statusklasse der Perspective Table); berechnete Fehler-
          // Zellen tragen keinen Rohtext (Gedankenstrich).
          styles.push('background-color: #ffebee; color: #b71c1c;');
          inner = escapeHtml(cell.text != null ? cell.text : '—');
        } else if (cell) {
          inner =
            col.type === 'boolean'
              ? cell.value
                ? 'x'
                : ''
              : escapeHtml(formatCellDisplay(col, cell.value));
        }
        out.push(`<td${styles.length ? ` style="${styles.join(' ')}"` : ''}>${inner}</td>`);
      });
      out.push('</tr>');
    }
    out.push('</tbody>');
  }
  if (hasAgg) {
    out.push('<tfoot><tr>');
    columns.forEach((col, i) => {
      const inner = aggs[i]
        .map(
          (entry) =>
            `<span style="opacity: 0.7;">${entry.func}</span> ` +
            escapeHtml(formatAggregateDisplay(col, entry)),
        )
        .join('<br>');
      const align = alignStyle(col);
      const style = `font-style: italic;${align ? ' ' + align : ''}`;
      out.push(`<td style="${style}">${inner}</td>`);
    });
    out.push('</tr></tfoot>');
  }
  out.push('</table>');
  return out.join('');
}

module.exports = {
  MAX_RENDER_ROWS,
  buildErrorsHtml,
  buildDatatableTableHtml,
  buildPortableDatatableHtml,
};
