'use strict';

// 4T-0512 (Epic 3E-0092): Kern des Ereignis-Fence-Editors — Bindung der
// delegierten Wurzel-Listener, Kontext- und Fence-Zuordnung, Rückschreiben
// (writeBody) und das Einfüge-Kommando für einen leeren Block. Formularzeile
// und Inline-Zeilen-Bearbeitung, Filter und Ansichten, Aggregation und
// Verknüpfungen liegen seit 4T-1003 in den Nachbar-Modulen dieses Ordners.
//
// Architektur wie der Datatable-Grid-Editor (perspective-datatable-editor.js):
// Der Quelltext bleibt die eine Datenquelle. Jede Übernahme lokalisiert den
// Fence im AKTUELLEN Editor-Doc neu (findPerspectiveEventsFences), parst den
// Body frisch, mutiert das Modell und ersetzt den Body über view.dispatch
// mit userEvent 'input' — ein eigener, isoliert rückgängig machbarer
// Undo-Schritt pro Aktion. Zuordnung Grid -> Fence im Render-Pane über
// data-ev-index, im Live-Widget über posAtDOM; in beiden Fällen bestätigt
// der data-ev-source-Abgleich die Zuordnung, sonst wird nichts geschrieben.
//
// Geltungsbereich: editierbar sind Render-Pane der geteilten Ansicht und
// das Live-Block-Widget; Reading und Handbuch bleiben read-only (CSS plus
// Laufzeit-Guard). Blöcke mit Struktur-Fehlern, die Aggregations-Art
// (query-Direktive) und die Zeilen-Limit-Anzeige sind nicht editierbar.
//
// Komfort-Logik der Wiederkehr (Referenz-Verhalten, Workshop-Punkt 1):
// Kategorie Geburtstag/Todestag/Jahrestag aktiviert die Wiederkehr
// automatisch; ein gesetztes Ende deaktiviert sie (Checkbox gesperrt).
//
// 4T-1003 (Epic 3E-0196): Kern der Familie im Ordner events/. Anlage und
// Zeilen-Bearbeitung, Filter-Leiste, Ansichts-Zustand, Aggregation und das
// Verknuepfungs-Popup liegen in den Nachbar-Modulen events-row-edit.js,
// events-filter-bar.js, events-view-state.js, events-aggregation.js und
// events-links.js. Hier bleiben Bindung, Kontext- und Fence-Zuordnung, das
// Rueckschreiben, das Einfuege-Kommando und die vier delegierten
// Wurzel-Handler, die als einzige Stelle entscheiden, welcher Auszug eine
// Bedienung uebernimmt.

import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { cancelPendingPreviewUpdate } from '../editor/editor-preview.js';
import { getDocText } from '../app/api.js';
// Zyklus-Hinweis: views/pane-render.js -> render-mermaid.js -> dieses Modul
// -> views/pane-render.js. Unkritisch, weil alle Zugriffe erst zur Laufzeit
// (im Event-Handler) erfolgen.
import { renderPaneContent } from '../views/pane-render.js';
import { showStatusbarHint } from '../views/views.js';
// 4T-0515: Zeilen-Klick der Aggregation öffnet die Quell-Datei.
import { openInPane } from '../tabs/tabs.js';
import {
  serializePerspectiveEvents,
  findPerspectiveEventsFences,
} from '../../../shared/events/events-fence.js';
// 4T-1003: Laufzeit-Zyklen mit den fuenf Auszuegen. Die Wurzel-Handler rufen
// sie ausschliesslich im Funktionskoerper auf; im Gegenzug lesen die Auszuege
// Kontext-Aufloesung, Fence-Zuordnung und Rueckschreiben aus diesem Modul.
import {
  addFromForm,
  applyRecurringComfort,
  cancelRowEdit,
  commitRowEdit,
  deleteRow,
  duplicateRow,
  getActiveRowEdit,
  pickDateInto,
  startRowEdit,
} from './events-row-edit.js';
import { cycleSort, toggleFilterBar } from './events-filter-bar.js';
import { jumpToTableRow, navigateCalendar, switchView } from './events-view-state.js';
import { openLinkPopup } from './events-links.js';

// Kategorien mit automatischer Jahres-Wiederkehr (Referenz-Analyse §2).
export const AUTO_RECURRING = new Set(['geburtstag', 'todestag', 'jahrestag']);

// --- Bindung -----------------------------------------------------------------

const boundRoots = new WeakSet();

export function bindPerspectiveEventsEditor(root) {
  if (!root || typeof root.addEventListener !== 'function' || boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', onRootKeydown);
  // Komfort-Logik reagiert auf Kategorie-Wechsel (change) und End-Eingabe
  // (input) in Formular- und Bearbeitungs-Zeile.
  root.addEventListener('change', onRootChange);
  root.addEventListener('input', onRootInput);
}

// --- Kontext und Fence-Zuordnung ----------------------------------------------

export function resolveContext(el) {
  const container = el && el.closest ? el.closest('.perspective-events') : null;
  if (!container) return null;
  // Fences in Markdown-Embeds bleiben passiv: ihre data-ev-Attribute
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
  // Pflege auch aus der Lese-Ansicht (PO-Entscheidung C1 vom 2026-07-15):
  // Schreiben läuft wie beim Checkbox-Toggle über den Pane-Editor; nur
  // Handbuch-Tabs und Embeds bleiben read-only.
  const modeOk = live
    ? tab.viewMode === 'live'
    : tab.viewMode === 'split' || tab.viewMode === 'rendered';
  const blocked = !!container.querySelector('.pev-errors');
  // 4T-0515: Aggregations-Art (Art 2) — anfangs am Pipeline-Platzhalter
  // erkennbar, nach dem client-seitigen Aufbau am Container-Marker.
  const aggregation =
    container.dataset.evAgg === '1' || !!container.querySelector('.pev-aggregation');
  const truncated = !!container.querySelector('.pev-limit');
  return {
    container,
    paneIdx,
    tab,
    view,
    live,
    blocked,
    aggregation,
    editable: modeOk && !tab.manualPage && !blocked && !truncated,
    evIndex: parseInt(container.dataset.evIndex, 10),
  };
}

export function normalizeBody(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '');
}

export function locateFence(ctx) {
  const doc = ctx.view.state.doc;
  const fences = findPerspectiveEventsFences(getDocText(doc));
  const expected = normalizeBody(ctx.container.dataset.evSource);
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
  const byIndex = Number.isFinite(ctx.evIndex) ? fences[ctx.evIndex] : null;
  if (byIndex && normalizeBody(byIndex.body) === expected) return byIndex;
  const matching = fences.filter((f) => normalizeBody(f.body) === expected);
  return matching.length === 1 ? matching[0] : null;
}

// --- Rückschreiben -------------------------------------------------------------

export function writeBody(ctx, fence, model) {
  const newBody = serializePerspectiveEvents(model);
  const doc = ctx.view.state.doc;
  if (fence.bodyStartLine > doc.lines) return false;
  const from = doc.line(fence.bodyStartLine).from;
  const to = doc.line(Math.min(fence.bodyEndLine, doc.lines)).to;
  // Leerer Fence-Body: bodyStartLine läge hinter bodyEndLine — dann wird
  // vor der Schließ-Zeile eingefügt (neuer Body samt Newline).
  if (fence.bodyEndLine < fence.bodyStartLine) {
    const insertAt = doc.line(Math.min(fence.closeLine, doc.lines)).from;
    ctx.view.dispatch({
      changes: { from: insertAt, to: insertAt, insert: newBody + '\n' },
      userEvent: 'input',
    });
  } else {
    ctx.view.dispatch({ changes: { from, to, insert: newBody }, userEvent: 'input' });
  }
  ctx.container.dataset.evSource = newBody + '\n';
  if (!ctx.live) {
    renderPaneContent(ctx.paneIdx);
    // 4T-0653: Der Dispatch oben hat ueber den Dokument-Listener bereits
    // einen verzoegerten Vorschau-Aufbau geplant. Nach dem synchronen Render
    // hier ist er redundant — und schaedlich, weil er verzoegert in die
    // naechste Bedienung faellt und ihr das DOM entzieht.
    cancelPendingPreviewUpdate(ctx.paneIdx);
  }
  return true;
}

export function abortWithHint() {
  showStatusbarHint('events.hint.notFound', { error: true, duration: 2500 });
}

// --- Einfüge-Kommando --------------------------------------------------------------------

// Kommando „Ereignis-Block einfügen": leerer perspective-events-Fence an
// der Cursor-Position des Haupt-Editors (Guard-Muster edit.insertTemplate;
// eine Transaktion, Undo in einem Schritt).
export function insertEventsBlock() {
  const pane = state.panes[state.activePaneIndex];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const view = paneEditors[state.activePaneIndex];
  if (!tab || !tab.editMode || tab.viewMode === 'rendered' || !view || view.state.readOnly) {
    showStatusbarHint('events.hint.noEditor', { error: true, duration: 3000 });
    return false;
  }
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const prefix = line.length > 0 && range.from > line.from ? '\n' : '';
  const block = `${prefix}\`\`\`perspective-events\n\`\`\`\n`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: block },
    selection: { anchor: range.from + block.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}

// --- Event-Handler -------------------------------------------------------------------------

function onRootClick(e) {
  if (!(e.target instanceof Element)) return;
  const editBtn = e.target.closest('.pev-edit-btn');
  const dupBtn = e.target.closest('.pev-dup-btn');
  const delBtn = e.target.closest('.pev-del-btn');
  const addBtn = e.target.closest('.pev-add-btn');
  const saveBtn = e.target.closest('.pev-save-btn');
  const cancelBtn = e.target.closest('.pev-cancel-btn');
  const pickBtn = e.target.closest('.pev-form-pick');
  const sortTh = e.target.closest('th[data-ev-sort]');
  const filterToggle = e.target.closest('.pev-filter-toggle');
  const viewBtn = e.target.closest('.pev-viewbtn');
  const calNav = e.target.closest('.pev-cal-prev, .pev-cal-next, .pev-cal-today-btn');
  const jumpChip = e.target.closest('.pev-event-chip[data-ev-jump]');
  const aggRow = e.target.closest('tr.pev-agg-row[data-ev-source]');
  const linkBtn = e.target.closest('.pev-link-btn, .pev-link-ind');
  if (
    !editBtn &&
    !dupBtn &&
    !delBtn &&
    !addBtn &&
    !saveBtn &&
    !cancelBtn &&
    !pickBtn &&
    !sortTh &&
    !filterToggle &&
    !viewBtn &&
    !calNav &&
    !jumpChip &&
    !aggRow &&
    !linkBtn
  ) {
    return;
  }
  const ctx = resolveContext(e.target);
  if (!ctx) return;
  // 4T-0513/4T-0514: Ansichts-Funktionen (Sortieren, Filter, Umschalter,
  // Kalender-Navigation, Ereignis-Sprung) wirken in allen Kontexten —
  // nur der Umschalter persistiert im editierbaren Kontext die Direktive.
  if (filterToggle) {
    e.preventDefault();
    toggleFilterBar(ctx);
    return;
  }
  if (sortTh) {
    cycleSort(ctx, sortTh);
    return;
  }
  if (viewBtn) {
    e.preventDefault();
    switchView(ctx, viewBtn.dataset.evViewbtn);
    return;
  }
  if (calNav) {
    e.preventDefault();
    navigateCalendar(ctx, calNav);
    return;
  }
  if (jumpChip) {
    e.preventDefault();
    jumpToTableRow(ctx, parseInt(jumpChip.dataset.evJump, 10));
    return;
  }
  // 4T-0516: Verknüpfungs-Popup (Indikator und 🔗) — Anzeige in allen
  // Kontexten, die Toggle-Knöpfe erscheinen nur im editierbaren.
  if (linkBtn) {
    e.preventDefault();
    const linkTr = linkBtn.closest('tr[data-ev-row]');
    if (linkTr && !getActiveRowEdit()) openLinkPopup(ctx, linkTr, linkBtn);
    return;
  }
  // 4T-0515: Zeilen-Klick der Aggregation öffnet die Quell-Datei
  // (Workshop-Punkt 5); Klicks auf Bedien-Elemente und während einer
  // offenen Bearbeitung bleiben davon unberührt.
  if (
    aggRow &&
    !editBtn &&
    !saveBtn &&
    !cancelBtn &&
    !pickBtn &&
    !getActiveRowEdit() &&
    !e.target.closest('button, input, select, textarea')
  ) {
    e.preventDefault();
    // 4T-0631 (Epic 3E-0102): Zeilen-Klick im Ereignis-Widget des Dokuments
    // erbt die Gruppe.
    void openInPane(ctx.paneIdx, [aggRow.dataset.evSource], { inheritGroup: true });
    return;
  }
  e.preventDefault();
  if (pickBtn) {
    const scope = pickBtn.closest('.pev-add-form, tr');
    const cls = pickBtn.dataset.evPickEdit
      ? `.${pickBtn.dataset.evPickEdit}`
      : `.pev-form-${pickBtn.dataset.evPick}`;
    // Gezielt das Eingabefeld treffen: der Wrapper-Span des Formular-
    // Zeitpunkts trägt dieselbe Klasse pev-form-date wie sein Input
    // (PO-Befund C1: Kalender-Auswahl schrieb ins Span statt ins Feld).
    const input = scope ? scope.querySelector(`input${cls}`) : null;
    if (input) void pickDateInto(input, pickBtn);
    return;
  }
  if (saveBtn) {
    commitRowEdit();
    return;
  }
  if (cancelBtn) {
    cancelRowEdit();
    return;
  }
  if (!ctx.editable) {
    if (ctx.blocked && (editBtn || dupBtn || delBtn || addBtn)) {
      showStatusbarHint('events.hint.blocked', { error: true, duration: 2500 });
    }
    return;
  }
  if (addBtn) {
    if (getActiveRowEdit() && !commitRowEdit()) return;
    const form = addBtn.closest('.pev-add-form');
    if (form) addFromForm(ctx, form);
    return;
  }
  const tr = e.target.closest('tr[data-ev-row]');
  if (!tr) return;
  // Während einer offenen Bearbeitung sind Aktionen anderer Zeilen gesperrt.
  const openEdit = getActiveRowEdit();
  if (openEdit && openEdit.tr !== tr) return;
  if (editBtn) startRowEdit(ctx, tr);
  else if (dupBtn) duplicateRow(ctx, tr);
  else if (delBtn) void deleteRow(ctx, tr);
}

function onRootKeydown(e) {
  if (!(e.target instanceof Element)) return;
  // Formularzeile: Strg+Enter legt an (Referenz-Kürzel).
  if (e.target.closest('.pev-add-form')) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const ctx = resolveContext(e.target);
      if (!ctx || !ctx.editable) return;
      e.preventDefault();
      const form = e.target.closest('.pev-add-form');
      addFromForm(ctx, form);
    }
    return;
  }
  // Bearbeitungs-Zeile: Enter übernimmt (außer im Notizen-Textarea),
  // Escape bricht ab.
  const openEdit = getActiveRowEdit();
  if (openEdit && e.target.closest('tr') === openEdit.tr) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelRowEdit();
      return;
    }
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      e.stopPropagation();
      commitRowEdit();
    }
  }
}

function onRootChange(e) {
  if (!(e.target instanceof Element)) return;
  if (e.target.matches('.pev-form-category, .pev-edit-category')) {
    const scope = e.target.closest('.pev-add-form, tr.pev-editing');
    if (scope) applyRecurringComfort(scope);
  }
}

function onRootInput(e) {
  if (!(e.target instanceof Element)) return;
  if (e.target.matches('.pev-form-end, .pev-edit-end')) {
    const scope = e.target.closest('.pev-add-form, tr.pev-editing');
    if (scope) applyRecurringComfort(scope);
  }
}
