// Aggregation ueber Frontmatter (Art 2 des Ereignis-Fence): Abruf aus dem
// Bereichs-Index, Abbildung der Treffer auf das Modell der Art 1 und das
// Rueckschreiben in die Quell-Datei.
//
// Auszug aus events-editor.js, 4T-1003 (Epic 3E-0196). aggStates ist der eine
// Aggregations-Zustand und lebt ausschliesslich hier; die Fremd-Leser kommen
// ueber getAggState(). writeSourceFields ist zugleich der Schreibweg des
// Verknuepfungs-Popups.
'use strict';

import { applyTranslations } from '../../i18n.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { api, getDocText } from '../app/api.js';
import { saveTab } from '../views/save-export.js';
import { showStatusbarHint } from '../views/views.js';
import {
  parsePerspectiveEvents,
  effectiveEventsView,
} from '../../../shared/events/events-fence.js';
import { buildEventsViewBarHtml } from '../../../shared/markdown/perspective-events.js';
// 4T-1003: Laufzeit-Zyklus mit dem Kern. Kontext-Aufloesung und
// Body-Normalisierung werden ausschliesslich im Funktionskoerper aufgerufen.
import { normalizeBody, resolveContext } from './events-editor.js';
// 4T-1003: Laufzeit-Zyklus mit dem Ansichts-Zustand. Der Abruf zeichnet nach
// seiner Antwort die Anzeige neu, aufgerufen erst im Funktionskoerper.
import { applyEventsViewState } from './events-view-state.js';

// --- Aggregation über Frontmatter (4T-0515) -----------------------------------------
// Art 2: Einträge kommen asynchron aus dem Bereichs-Index (IPC
// events:query); die Anzeige (Tabelle, Filter, Zusatz-Ansichten) läuft
// über dieselben Wege wie Art 1 auf den gemappten Einträgen. Inline-
// Bearbeitung schreibt in die Quell-Datei zurück (Workshop-Punkt 5);
// Neuanlage, Duplizieren und Löschen gibt es hier nicht.

const aggStates = new WeakMap(); // container -> { key, stamp, status, error, entries }
let aggStampCounter = 0;

// 4T-1003: Zugriff der Fremd-Leser (Zeilen-Bearbeitung, Ansichts-Zustand,
// Verknuepfungs-Popup). Geschrieben wird aggStates ausschliesslich in diesem
// Modul.
export function getAggState(container) {
  return aggStates.get(container);
}

function aggScalar(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : '';
  return String(v);
}

function aggList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s !== '');
  const s = aggScalar(v).trim();
  return s === '' ? [] : [s];
}

// Treffer-Datei -> Eintrag im Modell-Format der Art 1; event-text fällt
// auf den logischen Datei-Namen zurück (Workshop-Punkt 1).
function mapAggregatedEvent(hit) {
  const text = aggScalar(hit.fields.text).trim();
  const recurringRaw = hit.fields.recurring;
  return {
    date: aggScalar(hit.fields.date).trim(),
    end: aggScalar(hit.fields.end).trim(),
    text: text !== '' ? text : hit.name,
    textFallback: text === '',
    category: aggScalar(hit.fields.category).trim(),
    notes: aggScalar(hit.fields.notes),
    recurring: recurringRaw === true || recurringRaw === 'true',
    id: null,
    predecessors: aggList(hit.fields.predecessors),
    successors: aggList(hit.fields.successors),
    line: 0,
    source: { path: hit.path, name: hit.name, mtimeMs: hit.mtimeMs || 0 },
  };
}

export function renderAggStatus(display, text) {
  display.textContent = '';
  const status = document.createElement('div');
  status.className = 'pev-agg-status';
  status.textContent = text;
  display.appendChild(status);
  display.dataset.evDisplay = 'status';
  display.dataset.evStamp = '';
}

// Baut die Anzeige-Hülle (Umschalter + Wrapper) beim ersten Kontakt und
// stößt den Abruf an; erneute Aufrufe mit unverändertem Query-Schlüssel
// sind No-ops (der Live-Refresh invalidiert den Schlüssel gezielt).
export function ensureAggregation(ctx) {
  const container = ctx.container;
  container.dataset.evAgg = '1';
  const model = parsePerspectiveEvents(normalizeBody(container.dataset.evSource));
  if (!container.querySelector('.pev-display')) {
    container.innerHTML =
      buildEventsViewBarHtml(effectiveEventsView(model)) +
      '<div class="pev-display" data-ev-display="none"></div>';
    applyTranslations(container);
  }
  const key = model.query == null ? '' : model.query;
  let st = aggStates.get(container);
  if (!st || st.key !== key) {
    st = { key, stamp: ++aggStampCounter, status: 'pending', error: null, entries: [] };
    aggStates.set(container, st);
    void fetchAggregation(ctx, key);
    return;
  }
  if (st.status === 'stale') {
    // Refresh: bestehende Daten bleiben sichtbar ('refreshing' zählt wie
    // 'ready'); der Stamp bewegt sich nur bei tatsächlich neuen Daten,
    // damit Hintergrund-Refreshes die Anzeige nicht grundlos neu bauen.
    st.status = st.entries.length > 0 ? 'refreshing' : 'pending';
    void fetchAggregation(ctx, key);
  }
}

async function fetchAggregation(ctx, key) {
  let res;
  try {
    res = await api.eventsQuery(key);
  } catch {
    res = null;
  }
  const st = aggStates.get(ctx.container);
  if (!st || st.key !== key) return; // Antwort ist veraltet
  if (!res || res.status === 'disabled') {
    st.status = 'unavailable';
    st.entries = [];
  } else if (res.status === 'indexing') {
    // Index baut noch: gebremst nachfassen (der invalidated-Broadcast
    // beim Fertigwerden greift zusätzlich; doppelte Abrufe sind über den
    // key-Abgleich harmlos).
    st.status = 'indexing';
    st.entries = [];
    setTimeout(() => {
      const cur = aggStates.get(ctx.container);
      if (cur === st && st.status === 'indexing') {
        st.status = 'stale';
        ensureAggregation(ctx);
      }
    }, 1000);
  } else if (res.status !== 'ready') {
    st.status = res.status;
    st.entries = [];
  } else if (res.queryError) {
    st.status = 'queryError';
    st.error = res.queryError;
    st.entries = [];
  } else {
    const mapped = (res.events || []).map(mapAggregatedEvent);
    const unchanged =
      (st.status === 'ready' || st.status === 'refreshing') &&
      JSON.stringify(mapped) === JSON.stringify(st.entries);
    st.status = 'ready';
    if (!unchanged) {
      st.stamp = ++aggStampCounter;
      st.entries = mapped;
    }
  }
  applyEventsViewState(ctx);
}

// Sichtbare Aggregationen bei Index-Updates neu befüllen (debounced;
// Aufruf aus dem backlinks:invalidated-Pfad in app-init, Muster
// refreshVisibleFrontmatterQueries).
let aggRefreshTimer = null;
export function refreshVisibleEventsAggregations() {
  if (aggRefreshTimer) clearTimeout(aggRefreshTimer);
  aggRefreshTimer = setTimeout(() => {
    aggRefreshTimer = null;
    for (const el of document.querySelectorAll('.perspective-events[data-ev-agg="1"]')) {
      const ctx = resolveContext(el);
      if (!ctx) continue;
      const st = aggStates.get(el);
      if (st) st.status = 'stale';
      ensureAggregation(ctx);
    }
  }, 250);
}

// Inline-Rückschreiben eines Aggregations-Eintrags: aktiver Tab über den
// Editor-Puffer (Frontmatter-Roundtrip, ein Undo-Schritt, Save nur wenn
// vorher sauber), geöffneter dirty Tab nur Hinweis, sonst Main-Schreibweg
// mit mtime-Konflikt-Erkennung (Muster writeTaskHitLine).
function findOpenTabByPath(path) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((tab) => tab.path === path);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx, tab: state.panes[p].tabs[idx] };
  }
  return null;
}

// Mehrfeld-Update in eine Quell-Datei schreiben (gemeinsamer Schreibweg
// der Inline-Bearbeitung und der Verknüpfungs-Pflege, 4T-0516): aktiver
// Tab über den Editor-Puffer, geöffneter dirty Tab nur Hinweis, sonst
// Main-Schreibweg mit mtime-Konflikt-Erkennung.
export async function writeSourceFields(source, updates) {
  if (!source || !source.path) return false;
  const open = findOpenTabByPath(source.path);
  if (open && state.panes[open.paneIdx].activeIndex === open.tabIdx) {
    const view = paneEditors[open.paneIdx];
    if (!view) return false;
    const docText = getDocText(view.state.doc);
    const fm = api.getFrontmatter(docText);
    if (fm.parseError) {
      showStatusbarHint('events.agg.writeFailed', { error: true, duration: 3000 });
      return false;
    }
    const newData = { ...(fm.data || {}) };
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) delete newData[key];
      else newData[key] = value;
    }
    const written = api.writeFrontmatter(docText, newData);
    if (!written.ok) {
      showStatusbarHint('events.agg.writeFailed', { error: true, duration: 3000 });
      return false;
    }
    const wasDirty = !!open.tab.dirty;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: written.text },
      userEvent: 'input',
    });
    if (!wasDirty) await saveTab(open.paneIdx, open.tabIdx);
    return true;
  }
  if (open && open.tab.dirty) {
    showStatusbarHint('events.agg.dirtyOpen', { error: true, duration: 3000 });
    return false;
  }
  let res;
  try {
    res = await api.eventsApplyFrontmatterEdit({
      filePath: source.path,
      expectedMtimeMs: source.mtimeMs,
      updates,
    });
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    if (res && res.reason === 'conflict') {
      showStatusbarHint('events.agg.conflict', { error: true, duration: 3000 });
    } else {
      showStatusbarHint('events.agg.writeFailed', { error: true, duration: 3000 });
    }
    return false;
  }
  return true;
}

export async function commitAggRowEdit(edit, values) {
  const updates = {
    'event-date': values.date || null,
    'event-end': values.end || null,
    'event-text': values.text || null,
    'event-category': values.category || null,
    'event-notes': values.notes.trim() === '' ? null : values.notes,
    'event-recurring': values.recurring ? true : null,
  };
  await writeSourceFields(edit.entry.source, updates);
  refreshVisibleEventsAggregations();
  return true;
}
