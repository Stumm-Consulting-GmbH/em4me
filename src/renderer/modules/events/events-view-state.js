// Ansichts-Zustand des Ereignis-Fence je Tab und Fence (Sortierung,
// Filter-Spezifikation, transiente Ansicht, Kalender-Anker) samt seiner
// Anwendung auf die Anzeige, dazu Ansichts-Umschalter, Kalender-Navigation,
// Zeilen-Sprung und die gespeicherten Filter des Fence.
//
// Auszug aus events-editor.js, 4T-1003 (Epic 3E-0196). viewStates ist der
// eine Ansichts-Zustand und lebt ausschliesslich hier; die Filter-Leiste
// arbeitet ueber viewStateFor darauf.
'use strict';

import { t, applyTranslations, getLanguage } from '../../i18n.js';
import { getDocText } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { parseIsoDate, addDaysIso, addMonthsClamped } from '../../../shared/events/events-core.js';
import {
  parsePerspectiveEvents,
  findPerspectiveEventsFences,
  effectiveEventsView,
  EVENT_VIEWS,
  emptyFilterSpec,
} from '../../../shared/events/events-fence.js';
import {
  sortEventIndices,
  filterEventIndices,
  eventFilterActiveCount,
} from '../../../shared/events/events-views.js';
import {
  localTodayIso,
  buildEventsTableHtml,
  buildEventsDashboardHtml,
  buildEventsCalendarHtml,
  buildEventsTimelineHtml,
  buildEventsGanttHtml,
} from '../../../shared/markdown/perspective-events.js';
// 4T-0514: Nachfüll-Pass (Differenz-Spalte, Hinweise) für client-seitig
// neu gebaute Tabellen (kein Zyklus: events-view importiert diesen Editor
// nicht).
import { applyPerspectiveEventsIfPresent } from './events-view.js';
// 4T-1003: Laufzeit-Zyklus mit dem Kern. Kontext-Aufloesung, Fence-Zuordnung
// und Rueckschreiben werden ausschliesslich im Funktionskoerper aufgerufen.
import {
  abortWithHint,
  locateFence,
  normalizeBody,
  resolveContext,
  writeBody,
} from './events-editor.js';
// 4T-1003: Laufzeit-Zyklen mit Filter-Leiste, Aggregation und
// Zeilen-Bearbeitung. Der Einstieg baut die Filter-Leiste und stoesst den
// Aggregations-Abruf an, die Anzeige-Anwendung liest beide Fremd-Zustaende
// ueber ihre Zugriffs-Funktion.
import { ensureFilterUi } from './events-filter-bar.js';
import { ensureAggregation, getAggState, renderAggStatus } from './events-aggregation.js';
import { getActiveRowEdit } from './events-row-edit.js';

// --- Ansichts-Sortierung und Filter (4T-0513) --------------------------------------
// Reiner Ansichts-Zustand pro Tab und Fence (Muster Datatable 4T-0420):
// lebt in einer WeakMap auf dem Tab-Objekt, überlebt Re-Render und
// Tab-Wechsel, stirbt mit dem Tab, wird nie persistiert. Sortieren und
// Filtern ordnen bzw. verstecken nur DOM-Zeilen; der Quelltext bleibt
// byte-identisch. Nur die GESPEICHERTEN Filter (filter:-Direktiven)
// schreiben in den Fence — mit einem eigenen Undo-Schritt.
// Default-Sortierung der Referenz: Zeitpunkt absteigend.

const viewStates = new WeakMap(); // tab -> Map<fenceKey, { sort, filtersOpen, spec }>
export const DEFAULT_SORT = { key: 'date', dir: -1 };

function fenceKeyFor(ctx) {
  if (!ctx.live) return Number.isFinite(ctx.evIndex) ? ctx.evIndex : null;
  const doc = ctx.view.state.doc;
  try {
    const line = doc.lineAt(Math.min(ctx.view.posAtDOM(ctx.container), doc.length)).number;
    const fences = findPerspectiveEventsFences(getDocText(doc));
    const idx = fences.findIndex((f) => line >= f.openLine && line <= f.closeLine);
    return idx >= 0 ? idx : null;
  } catch {
    return null;
  }
}

export function viewStateFor(ctx, create) {
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
    // viewOverride: transiente Ansicht (Ereignis-Klick-Sprung bzw.
    // Umschalten in nicht editierbaren Kontexten); calAnchor: Kalender-
    // Navigation (4T-0514). Beides reiner Ansichts-Zustand.
    st = {
      sort: null,
      filtersOpen: false,
      spec: emptyFilterSpec(),
      viewOverride: null,
      calAnchor: null,
    };
    byFence.set(key, st);
  }
  return st || null;
}

// Wendet Sortierung/Filter aller Ereignis-Tabellen im Container an
// (Aufruf aus der Render-Nachverarbeitung und dem Live-Widget-Mount);
// baut Toggle-Button und Filter-Leiste auf. Live-Widgets werden vor dem
// Einhängen enhanced; posAtDOM braucht ein angeschlossenes Element —
// deshalb kurze rAF-Wiedervorlage (Muster Datatable).
export function applyPerspectiveEventsViewStates(container, attempts = 3) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  if (!container.isConnected) {
    if (attempts > 0) {
      requestAnimationFrame(() => applyPerspectiveEventsViewStates(container, attempts - 1));
    }
    return;
  }
  const roots =
    container.classList && container.classList.contains('perspective-events')
      ? [container]
      : container.querySelectorAll('.perspective-events');
  for (const el of roots) {
    const ctx = resolveContext(el);
    // Editierbarkeit als Container-Klasse: das CSS zeigt die Pflege-
    // Affordanzen nur hier. Damit bleiben Handbuch-Tabs und Embeds
    // (ctx null bzw. editable false) automatisch ohne inerte Formulare —
    // robuster als Ansichts-Modus-Selektoren (PO-Entscheidung C1:
    // Pflege auch in der Lese-Ansicht).
    el.classList.toggle('pev-editable', !!(ctx && ctx.editable));
    if (!ctx) continue;
    if (el.querySelector('.pev-errors, .pev-limit')) continue;
    // 4T-0515: Aggregations-Fences bauen ihre Anzeige client-seitig auf
    // (Umschalter + Wrapper) und holen die Treffer asynchron.
    if (ctx.aggregation) ensureAggregation(ctx);
    ensureFilterUi(ctx);
    applyEventsViewState(ctx);
  }
}

// Text mit Treffer-Hervorhebung neu aufbauen (mehrzeilig, DOM-Knoten statt
// HTML; bestehende Hinweis-Icons der Zelle bleiben erhalten).
function setHighlightedText(el, text, needle) {
  if (!el) return;
  const hints = [...el.querySelectorAll('.pev-hint')];
  el.textContent = '';
  const lines = String(text == null ? '' : text).split('\n');
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    if (!needle) {
      el.appendChild(document.createTextNode(line));
      return;
    }
    const low = line.toLowerCase();
    let offset = 0;
    let pos;
    while ((pos = low.indexOf(needle, offset)) >= 0) {
      el.appendChild(document.createTextNode(line.slice(offset, pos)));
      const mark = document.createElement('mark');
      mark.textContent = line.slice(pos, pos + needle.length);
      el.appendChild(mark);
      offset = pos + needle.length;
    }
    el.appendChild(document.createTextNode(line.slice(offset)));
  });
  for (const hint of hints) el.appendChild(hint);
}

// Ordnet und filtert die Anzeige gemäß Zustand: Tabelle über DOM-Zeilen
// (Sortier-Indikatoren, Treffer-Hervorhebung), Zusatz-Ansichten über den
// client-seitigen Neubau des Anzeige-Wrappers (4T-0514); dazu Umschalter-
// Zustand und Treffer-Zähler.
export function applyEventsViewState(ctx) {
  const display = ctx.container.querySelector('.pev-display');
  if (!display) return;
  const st = viewStateFor(ctx, false);
  const parsed = parsePerspectiveEvents(normalizeBody(ctx.container.dataset.evSource));
  let model = parsed;
  if (ctx.aggregation) {
    // 4T-0515: Einträge kommen aus dem Aggregations-Zustand; solange die
    // Daten fehlen, zeigt der Wrapper den Status statt einer Tabelle.
    const ag = getAggState(ctx.container);
    const effectiveNow = (st && st.viewOverride) || effectiveEventsView(parsed);
    syncSwitcherButtons(ctx, effectiveNow);
    if (!ag || ag.status === 'pending') {
      renderAggStatus(display, t('events.aggregationPending'));
      return;
    }
    if (ag.status === 'queryError') {
      const msg = (ag.error && (ag.error.message || ag.error.code)) || '';
      renderAggStatus(display, t('events.agg.queryError').replace('{msg}', msg));
      return;
    }
    if (ag.status !== 'ready' && ag.status !== 'refreshing') {
      renderAggStatus(display, t(`events.agg.${ag.status}`));
      return;
    }
    model = { ...parsed, entries: ag.entries };
  }
  const spec = st ? st.spec : null;
  const hasFilter = eventFilterActiveCount(spec) > 0;
  const visible = hasFilter
    ? new Set(
        filterEventIndices(model.entries, spec, {
          categoryLabel: (c) => (c ? t(`events.category.${c}`) : t('events.category.none')),
        }),
      )
    : null;
  const effective = (st && st.viewOverride) || effectiveEventsView(model);
  syncSwitcherButtons(ctx, effective);

  if (effective !== 'table') {
    renderClientView(ctx, display, model, visible, effective, st);
  } else {
    ensureTableDisplay(ctx, display, model);
    const table = display.querySelector('table.pev-table');
    const tbody = table ? table.tBodies[0] : null;
    const order = sortEventIndices(model.entries, (st && st.sort) || DEFAULT_SORT);
    const needle = hasFilter
      ? String(spec.text || '')
          .trim()
          .toLowerCase()
      : '';
    if (tbody) {
      const trByRow = new Map();
      for (const tr of tbody.querySelectorAll('tr[data-ev-row]')) {
        trByRow.set(parseInt(tr.dataset.evRow, 10), tr);
      }
      for (const rowIdx of order) {
        const tr = trByRow.get(rowIdx);
        if (!tr) continue;
        tbody.appendChild(tr);
        tr.classList.toggle('pev-row-hidden', !!visible && !visible.has(rowIdx));
        const entry = model.entries[rowIdx];
        if (entry) {
          setHighlightedText(tr.querySelector('.pev-text-main'), entry.text, needle || null);
          const notesEl = tr.querySelector('.pev-notes');
          if (notesEl) setHighlightedText(notesEl, entry.notes, needle || null);
        }
      }
    }
    // Sortier-Indikator am Kopf (Default-Sortierung zeigt ihren Pfeil mit).
    if (table && table.tHead) {
      const sort = (st && st.sort) || DEFAULT_SORT;
      for (const th of table.tHead.querySelectorAll('th[data-ev-sort]')) {
        const active = th.dataset.evSort === sort.key;
        th.classList.toggle('pev-sort-asc', active && sort.dir === 1);
        th.classList.toggle('pev-sort-desc', active && sort.dir === -1);
      }
    }
  }

  // „n von m Einträgen"-Zusatz nur bei aktivem Filter (alle Ansichten).
  let count = ctx.container.querySelector('.pev-filter-count');
  if (hasFilter) {
    if (!count) {
      count = document.createElement('div');
      count.className = 'pev-filter-count';
      display.insertAdjacentElement('afterend', count);
    }
    count.textContent = t('events.filter.count')
      .replace('{shown}', String(visible.size))
      .replace('{total}', String(model.entries.length));
  } else if (count) {
    count.remove();
  }
}

function syncSwitcherButtons(ctx, effective) {
  for (const btn of ctx.container.querySelectorAll('.pev-viewbtn')) {
    btn.classList.toggle('active', btn.dataset.evViewbtn === effective);
  }
}

// Tabelle client-seitig herstellen, wenn der Wrapper gerade eine
// Zusatz-Ansicht zeigt (transienter Rück-Wechsel ohne Dokument-Write)
// oder der Aggregations-Datenstand gewechselt hat (evStamp).
function ensureTableDisplay(ctx, display, model) {
  // Eine offene Zeilen-Bearbeitung wird von Hintergrund-Refreshes nicht
  // zerstört; der nächste Apply nach dem Abschluss baut frisch.
  const openEdit = getActiveRowEdit();
  if (openEdit && openEdit.ctx.container === ctx.container && openEdit.tr.isConnected) {
    return;
  }
  const ag = ctx.aggregation ? getAggState(ctx.container) : null;
  const stamp = ag ? String(ag.stamp) : '';
  if (display.dataset.evDisplay === 'table' && (display.dataset.evStamp || '') === stamp) return;
  display.innerHTML = buildEventsTableHtml(model, { aggregation: ctx.aggregation });
  display.dataset.evDisplay = 'table';
  display.dataset.evStamp = stamp;
  applyTranslations(display);
  applyPerspectiveEventsIfPresent(ctx.container);
}

// Zusatz-Ansicht in den Wrapper bauen (lokalisiert über t(); Stichtag vom
// Container, Kalender-Anker aus dem Ansichts-Zustand).
function renderClientView(ctx, display, model, visibleSet, effective, st) {
  const indices = [];
  model.entries.forEach((_, i) => {
    if (!visibleSet || visibleSet.has(i)) indices.push(i);
  });
  const todayIso = ctx.container.dataset.evToday || localTodayIso();
  const opts = { todayIso, L: t, lang: getLanguage() };
  let html;
  if (effective === 'dashboard') {
    html = buildEventsDashboardHtml(model, indices, opts);
  } else if (effective === 'month' || effective === 'week') {
    html = buildEventsCalendarHtml(model, indices, {
      ...opts,
      mode: effective,
      anchorIso: (st && st.calAnchor) || todayIso,
    });
  } else if (effective === 'gantt') {
    html = buildEventsGanttHtml(model, indices, opts);
  } else {
    html = buildEventsTimelineHtml(model, indices, opts);
  }
  display.innerHTML = html;
  display.dataset.evDisplay = effective;
}

// --- Ansichts-Umschalter, Kalender-Navigation und Ereignis-Sprung (4T-0514) ---------

// Umschalter: im editierbaren Kontext wird die view:-Direktive persistiert
// (ein Undo-Schritt, Workshop-Punkt 7); in read-only Kontexten (Handbuch)
// wechselt die Ansicht transient über den Ansichts-Zustand.
export function switchView(ctx, view) {
  if (!EVENT_VIEWS.includes(view)) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  if (ctx.editable) {
    const fence = locateFence(ctx);
    if (!fence) {
      abortWithHint();
      return;
    }
    const model = parsePerspectiveEvents(fence.body);
    st.viewOverride = null;
    st.calAnchor = null;
    if (model.view === view) {
      applyEventsViewState(ctx);
      return;
    }
    model.view = view;
    writeBody(ctx, fence, model);
  } else {
    st.viewOverride = view;
    st.calAnchor = null;
    applyEventsViewState(ctx);
  }
}

export function navigateCalendar(ctx, btn) {
  const st = viewStateFor(ctx, true);
  if (!st) return;
  const model = parsePerspectiveEvents(normalizeBody(ctx.container.dataset.evSource));
  const effective = st.viewOverride || effectiveEventsView(model);
  if (effective !== 'month' && effective !== 'week') return;
  const todayIso = ctx.container.dataset.evToday || localTodayIso();
  const current = st.calAnchor || todayIso;
  if (btn.classList.contains('pev-cal-today-btn')) {
    st.calAnchor = todayIso;
  } else {
    const dir = btn.classList.contains('pev-cal-next') ? 1 : -1;
    if (effective === 'week') {
      st.calAnchor = addDaysIso(current, dir * 7) || todayIso;
    } else {
      // Monats-Anker auf die Monatsmitte legen (keine Klemm-Drift).
      const parts = parseIsoDate(current) || parseIsoDate(todayIso);
      const next = addMonthsClamped({ ...parts, d: 15 }, dir);
      st.calAnchor = `${next.y}-${String(next.m).padStart(2, '0')}-15`;
    }
  }
  applyEventsViewState(ctx);
}

// Ereignis-Klick in einer Zusatz-Ansicht: transient zur Tabelle wechseln
// und die Zeile anspringen (kein Dokument-Write für reine Navigation).
export function jumpToTableRow(ctx, rowIdx) {
  if (!Number.isFinite(rowIdx)) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  st.viewOverride = 'table';
  applyEventsViewState(ctx);
  requestAnimationFrame(() => {
    const tr = ctx.container.querySelector(`tr[data-ev-row="${rowIdx}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center' });
    tr.classList.add('pev-jump-flash');
    setTimeout(() => tr.classList.remove('pev-jump-flash'), 1600);
  });
}

// --- Gespeicherte Filter (filter:-Direktiven im Fence) -----------------------------

export function saveCurrentFilter(ctx, st, rawName) {
  const name = String(rawName || '').trim();
  if (name === '') {
    showStatusbarHint('events.filter.nameRequired', { error: true, duration: 2500 });
    return;
  }
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const spec = { ...st.spec, categories: [...st.spec.categories] };
  const existing = model.savedFilters.findIndex((f) => f.name === name);
  if (existing >= 0) model.savedFilters[existing] = { name, spec };
  else model.savedFilters.push({ name, spec });
  writeBody(ctx, fence, model);
}

export function deleteSavedFilter(ctx, name) {
  if (!name) return;
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const before = model.savedFilters.length;
  model.savedFilters = model.savedFilters.filter((f) => f.name !== name);
  if (model.savedFilters.length === before) return;
  writeBody(ctx, fence, model);
}
