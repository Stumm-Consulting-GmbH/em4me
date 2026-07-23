'use strict';

// 4T-0419 (Epic 3E-0079): Grid-Editor der Perspective Datatable — typ-
// validierte Zell-Eingabe, Boolean-Toggle, Zeilen-Aktionen und das
// Rückschreiben in den Fence-Quelltext.
//
// Architektur: Der Quelltext bleibt die eine Datenquelle. Jede Übernahme
// lokalisiert den Fence im AKTUELLEN Editor-Doc neu (findPerspective-
// DatatableFences), parst dessen Body frisch, mutiert das Modell und
// ersetzt den Body über view.dispatch — damit laufen Dirty-Flag, Undo/
// Redo (Editor-Historie) und die Render-Aktualisierung über die normalen
// Wege (Muster toggleTaskFromRendered). Die Zuordnung Grid -> Fence:
// im Render-Pane über den Fence-Index (data-dt-index), im Live-Widget
// über die DOM-Position (posAtDOM); in beiden Fällen bestätigt ein
// Abgleich des gefundenen Bodys mit data-dt-source die Zuordnung —
// bei Abweichung (veraltetes DOM, eingerückter Fence) wird die Änderung
// verworfen und ein Statusbar-Hinweis gezeigt, nie falsch geschrieben.
//
// Geltungsbereich: editierbar sind der Render-Pane der geteilten Ansicht
// (viewMode 'split') und das Live-Block-Widget (viewMode 'live'); Reading
// und Handbuch-Tabs bleiben read-only (Affordanzen per CSS ausgeblendet,
// die Handler prüfen den Modus zusätzlich zur Laufzeit). Tabellen mit
// Struktur-Fehlern sind nicht editierbar (der kanonische Serialisierer
// würde defekte Zeilen verändern); der Fence ist dann nur im Quelltext
// bearbeitbar.
//
// Konflikt-Schutz (Detail-Verhalten laut Task festgelegt): Eine offene
// Zell-Bearbeitung wird durch externe Re-Renders abgebrochen (das Input-
// Element verschwindet mit dem DOM, nichts wird geschrieben); durch den
// data-dt-source-Abgleich kann eine Übernahme nie in einen zwischenzeitlich
// veränderten Fence schreiben.

import { t } from '../i18n.js';
import { state } from './app-state.js';
import { paneEditors, cancelPendingPreviewUpdate } from './editor.js';
import { getDocText } from './api.js';
// Zyklus-Hinweis: views.js -> render-mermaid.js -> dieses Modul -> views.js.
// Unkritisch, weil alle Zugriffe erst zur Laufzeit (im Event-Handler) erfolgen.
import { showStatusbarHint, renderPaneContent } from './views.js';
import {
  parsePerspectiveDatatable,
  serializePerspectiveDatatable,
  parseCellValue,
  findPerspectiveDatatableFences,
  computeAggregates,
  computeComputedCells,
  makeCellValueResolver,
  formatAggregateDisplay,
  sortDatatableRows,
  filterDatatableRows,
} from '../../shared/markdown/perspective-datatable.js';

// --- Bindung -----------------------------------------------------------------

// Delegierte Listener pro Interaktions-Wurzel (Render-Pane-Container bzw.
// Live-Widget-Container); idempotent über WeakSet, weil applyRenderPipeline
// mehrfach über denselben Container läuft.
const boundRoots = new WeakSet();

export function bindPerspectiveDatatableEditor(root) {
  if (!root || typeof root.addEventListener !== 'function' || boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', onRootKeydown);
  // blur bubbelt nicht — Capture-Phase für den Commit bei Fokus-Verlust.
  root.addEventListener('blur', onRootBlur, true);
  root.addEventListener('mousedown', onRootMousedown);
}

// --- Kontext und Fence-Zuordnung ----------------------------------------------

function resolveContext(el) {
  const container = el && el.closest ? el.closest('.perspective-datatable') : null;
  if (!container) return null;
  // Grids in Markdown-Embeds bleiben passiv: ihre data-dt-Attribute
  // beziehen sich auf die Embed-Datei, nicht auf das aktive Doc.
  if (container.closest('.wiki-embed-md-body')) return null;
  const cmRoot = container.closest('.cm-editor');
  let paneIdx;
  const live = !!cmRoot;
  if (cmRoot) {
    paneIdx = paneEditors.findIndex((v) => v && v.dom === cmRoot);
  } else {
    const group = container.closest('.pane-group');
    paneIdx = group ? parseInt(group.dataset.pane, 10) : -1;
  }
  if (!Number.isFinite(paneIdx) || paneIdx < 0) return null;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const view = paneEditors[paneIdx];
  if (!tab || !view) return null;
  const modeOk = live ? tab.viewMode === 'live' : tab.viewMode === 'split';
  const blocked = !!container.querySelector('.pdt-errors');
  return {
    container,
    paneIdx,
    tab,
    view,
    live,
    blocked,
    editable: modeOk && !tab.manualPage && !blocked,
    dtIndex: parseInt(container.dataset.dtIndex, 10),
  };
}

// Fence-Body-Vergleich tolerant gegen CRLF und das abschließende Newline
// des Fence-Token-Contents.
function normalizeBody(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '');
}

// Lokalisiert den Fence des Containers im aktuellen Doc. null, wenn die
// Zuordnung nicht zweifelsfrei gelingt (dann wird nichts geschrieben).
function locateFence(ctx) {
  const doc = ctx.view.state.doc;
  const fences = findPerspectiveDatatableFences(getDocText(doc));
  const expected = normalizeBody(ctx.container.dataset.dtSource);
  if (ctx.live) {
    let pos;
    try {
      pos = ctx.view.posAtDOM(ctx.container);
    } catch {
      return null;
    }
    if (typeof pos !== 'number' || pos < 0) return null;
    const line = doc.lineAt(Math.min(pos, doc.length)).number;
    const hit = fences.find((f) => line >= f.openLine && line <= f.closeLine);
    return hit && normalizeBody(hit.body) === expected ? hit : null;
  }
  const byIndex = Number.isFinite(ctx.dtIndex) ? fences[ctx.dtIndex] : null;
  if (byIndex && normalizeBody(byIndex.body) === expected) return byIndex;
  // Index-Versatz (z.B. eingerückter Fence, den der Scan nicht zählt):
  // eindeutiger Body-Treffer genügt.
  const matching = fences.filter((f) => normalizeBody(f.body) === expected);
  return matching.length === 1 ? matching[0] : null;
}

// --- Rückschreiben -------------------------------------------------------------

function writeBody(ctx, fence, model) {
  const newBody = serializePerspectiveDatatable(model);
  const doc = ctx.view.state.doc;
  if (fence.bodyStartLine > doc.lines) return false;
  const from = doc.line(fence.bodyStartLine).from;
  const to = doc.line(Math.min(fence.bodyEndLine, doc.lines)).to;
  // userEvent-Annotation: ohne sie verschmilzt die programmatische
  // Transaktion in der Editor-Historie mit dem vorherigen Ereignis
  // (dem initialen Doc-Set) — ein Undo würde dann das ganze Dokument
  // leeren statt nur die Grid-Übernahme zurückzunehmen.
  ctx.view.dispatch({ changes: { from, to, insert: newBody }, userEvent: 'input' });
  // data-dt-source nachziehen, damit Folge-Aktionen im selben (noch nicht
  // neu gerenderten) DOM den Abgleich bestehen.
  ctx.container.dataset.dtSource = newBody + '\n';
  // Split-Vorschau sofort nachziehen (statt auf das Tipp-Debounce zu
  // warten); der Live-Modus baut sein Widget über die Doc-Änderung selbst
  // neu. Muster: Status-Marker-Toggle in toggleTaskFromRendered.
  if (!ctx.live) {
    renderPaneContent(ctx.paneIdx);
    // 4T-0653: Das Tipp-Debounce, auf das hier bewusst nicht gewartet wird,
    // läuft trotzdem an (Dokument-Listener) und würde die Pane kurz darauf
    // ein zweites Mal aufbauen — mitten in die nächste Bedienung hinein.
    cancelPendingPreviewUpdate(ctx.paneIdx);
  }
  return true;
}

// Daten-Zellen-Index je Spalten-Index (berechnete Spalten haben keinen).
function dataIndexFor(model, colIdx) {
  let di = 0;
  for (let i = 0; i < model.columns.length; i++) {
    if (i === colIdx) return model.columns[i].expr === null ? di : null;
    if (model.columns[i].expr === null) di++;
  }
  return null;
}

function abortWithHint() {
  showStatusbarHint('datatable.hint.notFound', { error: true, duration: 2500 });
}

// --- Zell-Bearbeitung -----------------------------------------------------------

// Genau eine offene Zell-Bearbeitung app-weit.
let activeEdit = null;

function inputTypeFor(col, cell) {
  // Native Datums-/Zeit-Felder nur für gültige Werte (sie können den
  // Rohtext einer Fehler-Zelle nicht darstellen).
  if (col.type === 'date' && !(cell && cell.error)) return 'date';
  if (col.type === 'time' && !(cell && cell.error)) return 'time';
  return 'text';
}

function rawValueFor(col, cell) {
  if (!cell) return '';
  if (cell.error) return cell.text;
  if (col.type === 'text') return cell.value == null ? '' : String(cell.value);
  return cell.value == null ? '' : String(cell.value);
}

function startCellEdit(ctx, td) {
  if (activeEdit) {
    if (activeEdit.td === td) return;
    if (!commitActiveEdit()) return; // ungültig: offene Zelle behält den Fokus
    // Die Übernahme kann den Pane neu gerendert haben — ein abgehängtes
    // Ziel-td nicht weiterverwenden (erneuter Klick trifft das frische DOM).
    if (!td.isConnected) return;
  }
  const tr = td.closest('tr[data-dt-row]');
  const colIdx = parseInt(td.dataset.dtCol, 10);
  const rowIdx = tr ? parseInt(tr.dataset.dtRow, 10) : NaN;
  if (!Number.isFinite(colIdx) || !Number.isFinite(rowIdx)) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveDatatable(fence.body);
  const col = model.columns[colIdx];
  const di = dataIndexFor(model, colIdx);
  if (!col || di == null || !model.rows[rowIdx]) return;
  const cell = model.rows[rowIdx][di];

  const input = document.createElement('input');
  input.type = inputTypeFor(col, cell);
  input.className = 'pdt-cell-input';
  input.value = rawValueFor(col, cell);
  const originalHtml = td.innerHTML;
  td.textContent = '';
  td.appendChild(input);
  td.classList.add('pdt-editing');
  activeEdit = {
    ctx,
    td,
    input,
    originalHtml,
    colIdx,
    rowIdx,
    colType: col.type,
    committing: false,
    fenceOpenLine: fence.openLine,
  };
  input.addEventListener('keydown', onInputKeydown);
  input.focus();
  if (typeof input.select === 'function' && input.type === 'text') input.select();
}

function cancelActiveEdit(refocus = true) {
  if (!activeEdit) return;
  const { td, originalHtml } = activeEdit;
  activeEdit = null;
  if (td.isConnected) {
    td.classList.remove('pdt-editing');
    td.innerHTML = originalHtml;
    // Nur bei aktivem Abbruch (Esc) den Fokus zurück auf die Zelle;
    // beim Blur-Abbruch bleibt der Fokus, wo der Nutzer hingeklickt hat.
    if (refocus) td.focus();
  }
}

// Übernimmt die offene Zell-Bearbeitung. true, wenn die Bearbeitung
// beendet ist (übernommen oder wirkungslos); false, wenn der Wert
// ungültig ist und die Zelle im Edit-Modus bleibt.
function commitActiveEdit(move) {
  if (!activeEdit) return true;
  const edit = activeEdit;
  const raw = String(edit.input.value || '').trim();
  const { value, error } = parseCellValue(edit.colType, raw);
  if (error) {
    showStatusbarHint(`datatable.cellError.${error}`, { error: true, duration: 2500 });
    edit.input.classList.add('pdt-input-invalid');
    return false;
  }
  edit.committing = true;
  activeEdit = null;
  const fence = locateFence(edit.ctx);
  const model = fence ? parsePerspectiveDatatable(fence.body) : null;
  const di = model ? dataIndexFor(model, edit.colIdx) : null;
  if (!fence || di == null || !model.rows[edit.rowIdx]) {
    // Zuordnung verloren (externe Änderung): Bearbeitung abbrechen.
    if (edit.td.isConnected) {
      edit.td.classList.remove('pdt-editing');
      edit.td.innerHTML = edit.originalHtml;
    }
    abortWithHint();
    return true;
  }
  const before = model.rows[edit.rowIdx][di];
  const changed =
    !before || before.error != null || String(before.value ?? '') !== String(value ?? '');
  if (!changed) {
    if (edit.td.isConnected) {
      edit.td.classList.remove('pdt-editing');
      edit.td.innerHTML = edit.originalHtml;
    }
  } else {
    model.rows[edit.rowIdx][di] = { text: raw, value, error: null };
    writeBody(edit.ctx, fence, model);
  }
  if (move) focusCellAfterUpdate(edit, move);
  return true;
}

// --- Navigation nach Übernahme ---------------------------------------------------

// Nächste editierbare Daten-Zelle (berechnete Spalten überspringen);
// move = 1 (Tab) oder -1 (Shift+Tab). Läuft nach dem Re-Render über
// requestAnimationFrame und öffnet die Zelle direkt im Edit-Modus.
function focusCellAfterUpdate(edit, move) {
  requestAnimationFrame(() => {
    const container = relocateContainer(edit);
    if (!container) return;
    const cells = Array.from(container.querySelectorAll('tbody td.pdt-cell:not(.pdt-computed)'));
    const idx = cells.findIndex(
      (c) =>
        parseInt(c.closest('tr[data-dt-row]')?.dataset.dtRow, 10) === edit.rowIdx &&
        parseInt(c.dataset.dtCol, 10) === edit.colIdx,
    );
    if (idx < 0) return;
    const target = cells[idx + move];
    if (!target) return;
    const ctx = resolveContext(target);
    if (!ctx || !ctx.editable) return;
    if (target.classList.contains('pdt-type-boolean')) target.focus();
    else startCellEdit(ctx, target);
  });
}

function relocateContainer(edit) {
  const ctx = edit.ctx;
  if (ctx.live) {
    const view = ctx.view;
    for (const el of view.contentDOM.querySelectorAll('.perspective-datatable')) {
      try {
        const line = view.state.doc.lineAt(view.posAtDOM(el)).number;
        if (line === edit.fenceOpenLine) return el;
      } catch {
        // Widget noch nicht messbar — nächster Kandidat.
      }
    }
    return null;
  }
  const pane = document.querySelector(`.pane-group[data-pane="${ctx.paneIdx}"] .pane-rendered`);
  return pane ? pane.querySelector(`.perspective-datatable[data-dt-index="${ctx.dtIndex}"]`) : null;
}

// --- Aktionen ---------------------------------------------------------------------

function toggleBooleanCell(ctx, td) {
  const tr = td.closest('tr[data-dt-row]');
  const colIdx = parseInt(td.dataset.dtCol, 10);
  const rowIdx = tr ? parseInt(tr.dataset.dtRow, 10) : NaN;
  if (!Number.isFinite(colIdx) || !Number.isFinite(rowIdx)) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveDatatable(fence.body);
  const di = dataIndexFor(model, colIdx);
  if (di == null || !model.rows[rowIdx]) return;
  const cell = model.rows[rowIdx][di];
  const next = !(cell && cell.value === true);
  model.rows[rowIdx][di] = { text: next ? 'x' : '', value: next, error: null };
  writeBody(ctx, fence, model);
}

function addRow(ctx) {
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveDatatable(fence.body);
  const dataColumns = model.columns.filter((c) => c.expr === null);
  const row = dataColumns.map((col) => {
    const { value, error } = parseCellValue(col.type, '');
    return { text: '', value, error };
  });
  model.rows.push(row);
  const edit = {
    ctx,
    rowIdx: model.rows.length - 1,
    colIdx: model.columns.findIndex((c) => c.expr === null),
    fenceOpenLine: fence.openLine,
  };
  if (!writeBody(ctx, fence, model)) return;
  // Erste Daten-Zelle der neuen Zeile direkt zur Eingabe öffnen.
  if (edit.colIdx >= 0) focusCellAfterUpdate(edit, 0);
}

function deleteRow(ctx, btn) {
  const tr = btn.closest('tr[data-dt-row]');
  const rowIdx = tr ? parseInt(tr.dataset.dtRow, 10) : NaN;
  if (!Number.isFinite(rowIdx)) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveDatatable(fence.body);
  if (rowIdx < 0 || rowIdx >= model.rows.length) return;
  model.rows.splice(rowIdx, 1);
  writeBody(ctx, fence, model);
}

// --- Ansichts-Sortierung und Filter (4T-0420) --------------------------------------
// Reiner Ansichts-Zustand pro Tab und Fence: lebt in einer WeakMap auf dem
// Tab-Objekt (überlebt Re-Render und Tab-Wechsel, stirbt mit dem Tab, wird
// nie persistiert oder exportiert). Sortieren und Filtern ordnen bzw.
// verstecken nur die DOM-Zeilen; der Quelltext bleibt byte-identisch.
// Verfügbar in allen Grid-Kontexten (auch Reading — Ansichts-Funktionen
// ändern nichts am Dokument); das Rückschreiben des Grid-Editors trifft
// über die Zeilen-Identität (data-dt-row = Modell-Index) weiter die
// richtigen Quelltext-Zeilen.

const viewStates = new WeakMap(); // tab -> Map<fenceKey, { sort, filtersOpen, filters }>

// Fence-Schlüssel: im Render-Pane der Fence-Index; im Live-Widget der Index
// des umgebenden Fences im Dokument (über die DOM-Position) — damit teilen
// beide Kontexte denselben Zustands-Schlüssel pro Tab.
function fenceKeyFor(ctx) {
  if (!ctx.live) return Number.isFinite(ctx.dtIndex) ? ctx.dtIndex : null;
  const doc = ctx.view.state.doc;
  try {
    const line = doc.lineAt(Math.min(ctx.view.posAtDOM(ctx.container), doc.length)).number;
    const fences = findPerspectiveDatatableFences(getDocText(doc));
    const idx = fences.findIndex((f) => line >= f.openLine && line <= f.closeLine);
    return idx >= 0 ? idx : null;
  } catch {
    return null;
  }
}

function viewStateFor(ctx, create) {
  if (!ctx.tab) return null;
  let byFence = viewStates.get(ctx.tab);
  if (!byFence) {
    if (!create) return null;
    byFence = new Map();
    viewStates.set(ctx.tab, byFence);
  }
  const key = fenceKeyFor(ctx);
  if (key == null) return null;
  let st = byFence.get(key);
  if (!st && create) {
    st = { sort: null, filtersOpen: false, filters: [] };
    byFence.set(key, st);
  }
  return st || null;
}

// Wendet den Ansichts-Zustand aller Grids im Container an (Aufruf aus der
// Render-Nachverarbeitung und dem Live-Widget-Mount) — No-op für Grids
// ohne Zustand. Live-Widgets werden in toDOM() vor dem Einhängen
// enhanced; Kontext-Auflösung und posAtDOM brauchen aber ein
// angeschlossenes Element — deshalb kurze rAF-Wiedervorlage.
export function applyPerspectiveDatatableViewStates(container, attempts = 3) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  if (!container.isConnected) {
    if (attempts > 0) {
      requestAnimationFrame(() => applyPerspectiveDatatableViewStates(container, attempts - 1));
    }
    return;
  }
  for (const el of container.querySelectorAll('.perspective-datatable')) {
    const ctx = resolveContext(el);
    if (!ctx) continue;
    ensureViewUi(ctx);
    applyViewState(ctx);
  }
}

// Baut Filter-Umschalter (immer, sofern ein Grid mit Datenzeilen da ist)
// und Filter-Zeile (wenn eingeblendet). Idempotent pro DOM-Generation.
function ensureViewUi(ctx) {
  const table = ctx.container.querySelector('table.pdt-grid');
  const headRow = table && table.tHead ? table.tHead.rows[0] : null;
  if (!table || !headRow || !table.tBodies[0]) return;
  const st = viewStateFor(ctx, false);

  if (!ctx.container.querySelector('.pdt-filter-toggle')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdt-filter-toggle';
    btn.title = t('datatable.filter.show');
    btn.setAttribute('aria-label', t('datatable.filter.show'));
    btn.textContent = '▽';
    ctx.container.insertBefore(btn, ctx.container.firstChild);
  }
  ctx.container
    .querySelector('.pdt-filter-toggle')
    .classList.toggle('active', !!(st && st.filtersOpen));

  const existing = table.tHead.querySelector('.pdt-filter-row');
  if (!st || !st.filtersOpen) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;

  const model = parsePerspectiveDatatable(normalizeBody(ctx.container.dataset.dtSource));
  const row = document.createElement('tr');
  row.className = 'pdt-filter-row';
  if (headRow.querySelector('.pdt-row-del')) {
    row.appendChild(document.createElement('td')).className = 'pdt-row-del';
  }
  model.columns.forEach((col, colIdx) => {
    const cell = document.createElement('td');
    cell.dataset.dtCol = String(colIdx);
    // 4T-0421: auch berechnete Spalten sind filterbar (über ihre
    // gerechneten Anzeige-Werte).
    if (col.type === 'boolean') {
      // Dreifach-Umschalter alle -> ja -> nein.
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pdt-filter-bool';
      const current = st.filters[colIdx];
      renderBoolFilterLabel(
        btn,
        current && typeof current.bool === 'boolean' ? current.bool : null,
      );
      btn.addEventListener('click', () => {
        const prev = st.filters[colIdx];
        const prevVal = prev && typeof prev.bool === 'boolean' ? prev.bool : null;
        const next = prevVal === null ? true : prevVal === true ? false : null;
        st.filters[colIdx] = next === null ? null : { bool: next };
        renderBoolFilterLabel(btn, next);
        applyViewState(ctx);
      });
      cell.appendChild(btn);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pdt-filter-input';
      input.placeholder = t('datatable.filter.placeholder');
      input.value = (st.filters[colIdx] && st.filters[colIdx].text) || '';
      let timer = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          st.filters[colIdx] = input.value.trim() === '' ? null : { text: input.value };
          applyViewState(ctx);
        }, 150);
      });
      cell.appendChild(input);
    }
    row.appendChild(cell);
  });
  headRow.insertAdjacentElement('afterend', row);
}

function renderBoolFilterLabel(btn, val) {
  btn.textContent =
    val === null
      ? t('datatable.filter.all')
      : val
        ? t('datatable.filter.yes')
        : t('datatable.filter.no');
  btn.classList.toggle('active', val !== null);
}

// Ordnet und filtert die DOM-Zeilen gemäß Zustand, aktualisiert Sortier-
// Indikatoren, Aggregat-Werte (über die sichtbaren Zeilen) und den
// „n von m Zeilen"-Zusatz.
function applyViewState(ctx) {
  const table = ctx.container.querySelector('table.pdt-grid');
  const tbody = table ? table.tBodies[0] : null;
  if (!table || !tbody) return;
  const st = viewStateFor(ctx, false);
  const model = parsePerspectiveDatatable(normalizeBody(ctx.container.dataset.dtSource));
  // 4T-0421: berechnete Werte fließen in Sortierung, Filter und Aggregate ein.
  const computed = computeComputedCells(model);

  const hasFilter = !!(st && st.filters.some((f) => f));
  const visible = hasFilter ? filterDatatableRows(model, st.filters, computed) : null;
  const visibleSet = visible ? new Set(visible) : null;
  const order =
    st && st.sort
      ? sortDatatableRows(model, st.sort.col, st.sort.dir, computed)
      : model.rows.map((_, i) => i);

  const trByRow = new Map();
  for (const tr of tbody.querySelectorAll('tr[data-dt-row]')) {
    trByRow.set(parseInt(tr.dataset.dtRow, 10), tr);
  }
  for (const rowIdx of order) {
    const tr = trByRow.get(rowIdx);
    if (!tr) continue;
    tbody.appendChild(tr);
    tr.classList.toggle('pdt-row-hidden', !!visibleSet && !visibleSet.has(rowIdx));
  }

  // Sortier-Indikator am Kopf.
  for (const th of table.tHead.querySelectorAll('th.pdt-col')) {
    const colIdx = parseInt(th.dataset.dtCol, 10);
    const active = st && st.sort && st.sort.col === colIdx;
    th.classList.toggle('pdt-sort-asc', !!active && st.sort.dir === 1);
    th.classList.toggle('pdt-sort-desc', !!active && st.sort.dir === -1);
  }

  // Aggregate über die sichtbaren Zeilen.
  const tfootRow = table.tFoot ? table.tFoot.querySelector('.pdt-agg-row') : null;
  if (tfootRow) {
    const rows = visible ? visible.map((i) => model.rows[i]) : model.rows;
    const aggs = computeAggregates(model, rows, makeCellValueResolver(model, computed));
    for (const cell of tfootRow.querySelectorAll('td[data-dt-col]')) {
      const colIdx = parseInt(cell.dataset.dtCol, 10);
      const entries = aggs[colIdx] || [];
      const valueEls = cell.querySelectorAll('.pdt-agg-value');
      entries.forEach((entry, j) => {
        if (valueEls[j]) {
          valueEls[j].textContent = formatAggregateDisplay(model.columns[colIdx], entry);
        }
      });
    }
  }

  // „n von m Zeilen"-Zusatz nur bei aktivem Filter.
  let count = ctx.container.querySelector('.pdt-filter-count');
  if (hasFilter) {
    if (!count) {
      count = document.createElement('div');
      count.className = 'pdt-filter-count';
      table.insertAdjacentElement('afterend', count);
    }
    count.textContent = t('datatable.filterCount')
      .replace('{shown}', String(visible.length))
      .replace('{total}', String(model.rows.length));
  } else if (count) {
    count.remove();
  }
}

// Spaltenkopf-Klick: aufsteigend -> absteigend -> aufgehoben.
function cycleSort(ctx, th) {
  const colIdx = parseInt(th.dataset.dtCol, 10);
  if (!Number.isFinite(colIdx)) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  if (!st.sort || st.sort.col !== colIdx) st.sort = { col: colIdx, dir: 1 };
  else if (st.sort.dir === 1) st.sort = { col: colIdx, dir: -1 };
  else st.sort = null;
  applyViewState(ctx);
}

function toggleFilterRow(ctx) {
  const st = viewStateFor(ctx, true);
  if (!st) return;
  st.filtersOpen = !st.filtersOpen;
  if (!st.filtersOpen) st.filters = [];
  ensureViewUi(ctx);
  applyViewState(ctx);
}

// --- Event-Handler ----------------------------------------------------------------

function onRootMousedown(e) {
  // Fokus-Erhalt: mousedown auf Aktions-Knöpfen darf die offene Zell-
  // Eingabe nicht über blur committen, bevor der Klick verarbeitet ist
  // (der Klick-Handler committet selbst in definierter Reihenfolge).
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('.pdt-del-btn, .pdt-add-btn')) e.preventDefault();
}

function onRootClick(e) {
  if (!(e.target instanceof Element)) return;
  const delBtn = e.target.closest('.pdt-del-btn');
  const addBtn = e.target.closest('.pdt-add-btn');
  const sortTh = e.target.closest('th.pdt-col[data-dt-col]');
  const filterToggle = e.target.closest('.pdt-filter-toggle');
  const td = e.target.closest('td.pdt-cell');
  if (!delBtn && !addBtn && !td && !sortTh && !filterToggle) return;
  const ctx = resolveContext(e.target);
  if (!ctx) return;
  // 4T-0420: Ansichts-Funktionen (Sortieren, Filter-Umschalter) wirken in
  // allen Kontexten — sie ändern den Quelltext nicht.
  if (filterToggle) {
    e.preventDefault();
    toggleFilterRow(ctx);
    return;
  }
  if (sortTh) {
    cycleSort(ctx, sortTh);
    return;
  }
  if (!ctx.editable) {
    // Read-only-Kontexte (Reading, Handbuch) bleiben stumm; blockierte
    // Tabellen melden den Grund auf expliziten Aktions-Klick.
    if (ctx.blocked && (delBtn || addBtn)) {
      showStatusbarHint('datatable.hint.blocked', { error: true, duration: 2500 });
    }
    return;
  }
  if (delBtn || addBtn) {
    e.preventDefault();
    // Offene Zell-Bearbeitung zuerst abschließen (definierte Reihenfolge).
    if (activeEdit && !commitActiveEdit()) return;
    if (delBtn) deleteRow(ctx, delBtn);
    else addRow(ctx);
    return;
  }
  if (td.classList.contains('pdt-computed')) return;
  if (td.classList.contains('pdt-type-boolean') && !td.classList.contains('pdt-cell-error')) {
    if (activeEdit && !commitActiveEdit()) return;
    toggleBooleanCell(ctx, td);
    return;
  }
  startCellEdit(ctx, td);
}

function onRootKeydown(e) {
  if (!(e.target instanceof Element)) return;
  if (e.target.classList.contains('pdt-cell-input')) return; // eigener Handler
  const td = e.target.closest('td.pdt-cell[tabindex]');
  if (!td || td.classList.contains('pdt-computed')) return;
  if (
    e.key !== 'Enter' &&
    e.key !== 'F2' &&
    !(e.key === ' ' && td.classList.contains('pdt-type-boolean'))
  ) {
    return;
  }
  const ctx = resolveContext(td);
  if (!ctx || !ctx.editable) return;
  e.preventDefault();
  if (td.classList.contains('pdt-type-boolean') && !td.classList.contains('pdt-cell-error')) {
    toggleBooleanCell(ctx, td);
    return;
  }
  startCellEdit(ctx, td);
}

function onInputKeydown(e) {
  if (!activeEdit || e.target !== activeEdit.input) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelActiveEdit();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    commitActiveEdit();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    commitActiveEdit(e.shiftKey ? -1 : 1);
  }
}

function onRootBlur(e) {
  if (!activeEdit || e.target !== activeEdit.input || activeEdit.committing) return;
  // Fokus-Verlust übernimmt; ist der Wert ungültig, wird verworfen —
  // eine fokuslose Zelle darf nicht im Edit-Modus verharren (Task-
  // Detail-Verhalten; den lokalisierten Hinweis zeigt commitActiveEdit).
  const edit = activeEdit;
  setTimeout(() => {
    if (activeEdit !== edit) return;
    if (!commitActiveEdit()) cancelActiveEdit(false);
  }, 0);
}
