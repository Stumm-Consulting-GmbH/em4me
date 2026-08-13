// Verknuepfungs-Popup des Ereignis-Fence: Suche ueber die uebrigen Eintraege
// bzw. die aggregierten Quell-Dateien, die beiden Toggle-Knoepfe
// Vorgaenger/Nachfolger, der Sprung zum Ziel und das Loesen verwaister
// Kennungen in beiden Welten.
//
// Auszug aus events-editor.js, 4T-1003 (Epic 3E-0196). linkPopup und sein
// Capture-Listener am Dokument gehoeren zusammen und leben ausschliesslich
// hier.
'use strict';

import { t } from '../../i18n.js';
import { openInPane } from '../tabs/tabs.js';
import { toggleEventLink, eventLinksOf } from '../../../shared/events/events-core.js';
import { parsePerspectiveEvents } from '../../../shared/events/events-fence.js';
// 4T-1003: Laufzeit-Zyklus mit dem Kern. Fence-Zuordnung und Rueckschreiben
// werden ausschliesslich im Funktionskoerper aufgerufen.
import { abortWithHint, locateFence, writeBody } from './events-editor.js';
// 4T-1003: Laufzeit-Zyklus mit der Aggregation (Art 2 schreibt ueber deren
// Schreibweg) und mit dem Ansichts-Zustand (Sprung zur Tabellen-Zeile).
import {
  getAggState,
  refreshVisibleEventsAggregations,
  writeSourceFields,
} from './events-aggregation.js';
import { jumpToTableRow } from './events-view-state.js';

// --- Verknüpfungen (4T-0516) ---------------------------------------------------------
// Ein leichtgewichtiges Popup pro Zeile: Suche über die übrigen Einträge
// (Art 1) bzw. aggregierten Quell-Dateien (Art 2), pro Treffer die beiden
// Toggle-Knöpfe Vorgänger/Nachfolger und der Sprung zum Ziel. Bestehende
// Bezüge stehen oben (inklusive verwaister Kennungen als weicher Hinweis
// mit Löse-Knopf). Verknüpfen nur innerhalb derselben Welt (Workshop-
// Punkt 6): das Popup kennt ausschließlich die Einträge seines Fence
// bzw. seiner Aggregation.

let linkPopup = null; // { el, ctx, rowIdx }

function closeLinkPopup() {
  if (!linkPopup) return;
  linkPopup.el.remove();
  linkPopup = null;
  document.removeEventListener('mousedown', onLinkPopupDocMousedown, true);
}

function onLinkPopupDocMousedown(e) {
  if (linkPopup && !(e.target instanceof Element && linkPopup.el.contains(e.target))) {
    closeLinkPopup();
  }
}

// Aktuelles Einträge-Modell des Popups (Art 1 frisch aus dem Fence-Quelltext,
// Art 2 aus dem Aggregations-Zustand).
function linkEntriesFor(ctx) {
  if (ctx.aggregation) {
    const ag = getAggState(ctx.container);
    return ag && (ag.status === 'ready' || ag.status === 'refreshing') ? ag.entries : null;
  }
  const fence = locateFence(ctx);
  return fence ? parsePerspectiveEvents(fence.body).entries : null;
}

// Bezüge eines Aggregations-Eintrags: Listen tragen logische Datei-Namen.
function aggLinksOf(entries, idx) {
  const entry = entries[idx];
  const out = { predecessors: [], successors: [] };
  if (!entry) return out;
  const resolve = (name) => {
    const target = entries.findIndex(
      (e) => e.source && e.source.name.toLowerCase() === String(name).toLowerCase(),
    );
    return { id: name, index: target, label: String(name), broken: target < 0 };
  };
  out.predecessors = (entry.predecessors || []).map(resolve);
  out.successors = (entry.successors || []).map(resolve);
  return out;
}

// Toggle in der Fence-Welt (Art 1): bidirektional im selben Fence, ein
// Undo-Schritt; Kennungen entstehen bei der ersten Verknüpfung.
function toggleLinkArt1(ctx, rowIdx, otherIdx, kind) {
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  if (!toggleEventLink(model.entries, rowIdx, otherIdx, kind)) return;
  writeBody(ctx, fence, model);
}

// Verwaiste Kennung lösen (Art 1).
function removeBrokenLinkArt1(ctx, rowIdx, kind, id) {
  const fence = locateFence(ctx);
  if (!fence) {
    abortWithHint();
    return;
  }
  const model = parsePerspectiveEvents(fence.body);
  const entry = model.entries[rowIdx];
  if (!entry) return;
  const list = kind === 'predecessor' ? entry.predecessors : entry.successors;
  const idx = list.indexOf(id);
  if (idx < 0) return;
  list.splice(idx, 1);
  writeBody(ctx, fence, model);
}

// Toggle in der Datei-Welt (Art 2): beide Frontmatter-Seiten über den
// definierten Schreibpfad (writeSourceFields).
async function toggleLinkArt2(ctx, rowIdx, otherIdx, kind) {
  const entries = linkEntriesFor(ctx);
  const a = entries && entries[rowIdx];
  const b = entries && entries[otherIdx];
  if (!a || !b || !a.source || !b.source) return;
  const mineKey = kind === 'predecessor' ? 'predecessors' : 'successors';
  const theirsKey = kind === 'predecessor' ? 'successors' : 'predecessors';
  const mine = [...a[mineKey]];
  const theirs = [...b[theirsKey]];
  const has = mine.some((n) => n.toLowerCase() === b.source.name.toLowerCase());
  if (has) {
    const mi = mine.findIndex((n) => n.toLowerCase() === b.source.name.toLowerCase());
    mine.splice(mi, 1);
    const ti = theirs.findIndex((n) => n.toLowerCase() === a.source.name.toLowerCase());
    if (ti >= 0) theirs.splice(ti, 1);
  } else {
    mine.push(b.source.name);
    if (!theirs.some((n) => n.toLowerCase() === a.source.name.toLowerCase())) {
      theirs.push(a.source.name);
    }
  }
  const okA = await writeSourceFields(a.source, {
    [`event-${mineKey}`]: mine.length > 0 ? mine : null,
  });
  if (okA) {
    await writeSourceFields(b.source, {
      [`event-${theirsKey}`]: theirs.length > 0 ? theirs : null,
    });
  }
  refreshVisibleEventsAggregations();
}

// Verwaisten Datei-Verweis lösen (Art 2, nur die eigene Seite).
async function removeBrokenLinkArt2(ctx, rowIdx, kind, name) {
  const entries = linkEntriesFor(ctx);
  const entry = entries && entries[rowIdx];
  if (!entry || !entry.source) return;
  const key = kind === 'predecessor' ? 'predecessors' : 'successors';
  const list = entry[key].filter((n) => n !== name);
  if (list.length === entry[key].length) return;
  await writeSourceFields(entry.source, { [`event-${key}`]: list.length > 0 ? list : null });
  refreshVisibleEventsAggregations();
}

function mkLinkKindButton(labelKey, active, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pev-link-kind';
  btn.textContent = t(labelKey);
  if (active) btn.classList.add('active');
  btn.addEventListener('click', onClick);
  return btn;
}

function renderLinkPopupList(filterText) {
  if (!linkPopup) return;
  const { ctx, rowIdx } = linkPopup;
  const listEl = linkPopup.el.querySelector('.pev-link-list');
  listEl.textContent = '';
  const entries = linkEntriesFor(ctx);
  if (!entries || !entries[rowIdx]) {
    closeLinkPopup();
    return;
  }
  const links = ctx.aggregation ? aggLinksOf(entries, rowIdx) : eventLinksOf(entries, rowIdx);
  const linkedPred = new Set(links.predecessors.filter((l) => !l.broken).map((l) => l.index));
  const linkedSucc = new Set(links.successors.filter((l) => !l.broken).map((l) => l.index));

  // Verwaiste Bezüge zuerst (weicher Hinweis mit Löse-Knopf).
  for (const kind of ['predecessor', 'successor']) {
    const broken = (kind === 'predecessor' ? links.predecessors : links.successors).filter(
      (l) => l.broken,
    );
    for (const l of broken) {
      const row = document.createElement('div');
      row.className = 'pev-link-item pev-link-broken';
      row.appendChild(
        Object.assign(document.createElement('span'), {
          className: 'pev-link-label',
          textContent: `⚠ ${t('events.link.broken').replace('{v}', l.label)}`,
        }),
      );
      if (ctx.editable) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pev-link-kind active';
        remove.textContent = '×';
        remove.title = t('events.link.remove');
        remove.addEventListener('click', () => {
          if (ctx.aggregation) void removeBrokenLinkArt2(ctx, rowIdx, kind, l.id);
          else removeBrokenLinkArt1(ctx, rowIdx, kind, l.id);
          setTimeout(() => renderLinkPopupList(filterText), 50);
        });
        row.appendChild(remove);
      }
      listEl.appendChild(row);
    }
  }

  const needle = String(filterText || '')
    .trim()
    .toLowerCase();
  let shown = 0;
  entries.forEach((e, i) => {
    if (i === rowIdx) return;
    const label = e.text || e.date || (e.source && e.source.name) || '';
    const hay = `${label}\n${e.date}\n${e.source ? e.source.name : ''}`.toLowerCase();
    if (needle && !hay.includes(needle)) return;
    shown++;
    const row = document.createElement('div');
    row.className = 'pev-link-item';
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'pev-link-label pev-link-jump';
    jump.title = t(ctx.aggregation ? 'events.agg.openSource' : 'events.link.jump');
    jump.textContent = `${e.date ? `${e.date} · ` : ''}${label}`;
    jump.addEventListener('click', () => {
      closeLinkPopup();
      // 4T-0631 (Epic 3E-0102): Springen aus dem Verknüpfungs-Popup des
      // Ereignis-Widgets ist ein Dokument-Klick — Gruppe erben.
      if (ctx.aggregation) void openInPane(ctx.paneIdx, [e.source.path], { inheritGroup: true });
      else jumpToTableRow(ctx, i);
    });
    row.appendChild(jump);
    if (ctx.editable) {
      const rerender = () => setTimeout(() => renderLinkPopupList(filterText), 50);
      row.appendChild(
        mkLinkKindButton('events.link.predecessor', linkedPred.has(i), () => {
          if (ctx.aggregation) void toggleLinkArt2(ctx, rowIdx, i, 'predecessor');
          else toggleLinkArt1(ctx, rowIdx, i, 'predecessor');
          rerender();
        }),
      );
      row.appendChild(
        mkLinkKindButton('events.link.successor', linkedSucc.has(i), () => {
          if (ctx.aggregation) void toggleLinkArt2(ctx, rowIdx, i, 'successor');
          else toggleLinkArt1(ctx, rowIdx, i, 'successor');
          rerender();
        }),
      );
    }
    listEl.appendChild(row);
  });
  if (shown === 0) {
    const empty = document.createElement('div');
    empty.className = 'pev-link-empty';
    empty.textContent = t('events.link.empty');
    listEl.appendChild(empty);
  }
}

export function openLinkPopup(ctx, tr, anchor) {
  closeLinkPopup();
  const rowIdx = parseInt(tr.dataset.evRow, 10);
  if (!Number.isFinite(rowIdx)) return;
  const el = document.createElement('div');
  el.className = 'pev-link-popup';
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'pev-filter-input pev-link-search';
  search.placeholder = t('events.link.searchPlaceholder');
  search.addEventListener('input', () => renderLinkPopupList(search.value));
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeLinkPopup();
    }
  });
  el.appendChild(search);
  const list = document.createElement('div');
  list.className = 'pev-link-list';
  el.appendChild(list);
  document.body.appendChild(el);
  const rect = anchor.getBoundingClientRect();
  el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 12)}px`;
  el.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - el.offsetHeight - 12)}px`;
  linkPopup = { el, ctx, rowIdx };
  document.addEventListener('mousedown', onLinkPopupDocMousedown, true);
  renderLinkPopupList('');
  search.focus();
}
