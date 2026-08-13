// DOM-Aufbau der Filter-Leiste des Ereignis-Fence: Umschalter mit
// Treffer-Abzeichen, Volltextsuche, Kategorie-Chips, Datumsbereich samt
// Presets, Zusatzfilter, gespeicherte Filter und die aktiven Kriterien als
// entfernbare Chips.
//
// Auszug aus events-editor.js, 4T-1003 (Epic 3E-0196). Die Leiste baut nur
// DOM; der Zustand, auf dem sie arbeitet, gehoert events-view-state.js.
'use strict';

import { t } from '../../i18n.js';
import { showStatusbarHint } from '../views/views.js';
import { parseIsoDate, EVENT_CATEGORIES } from '../../../shared/events/events-core.js';
import { parsePerspectiveEvents, emptyFilterSpec } from '../../../shared/events/events-fence.js';
import {
  EVENT_DATE_PRESETS,
  eventFilterActiveCount,
  datePresetRange,
} from '../../../shared/events/events-views.js';
import { localTodayIso } from '../../../shared/markdown/perspective-events.js';
// 4T-1003: Laufzeit-Zyklus mit dem Kern. normalizeBody wird erst im
// Funktionskoerper gelesen.
import { normalizeBody } from './events-editor.js';
// 4T-1003: Laufzeit-Zyklus mit dem Ansichts-Zustand. Die Leiste liest und
// setzt ihn und stoesst die Anzeige an, alles in Funktionskoerpern.
import {
  DEFAULT_SORT,
  applyEventsViewState,
  deleteSavedFilter,
  saveCurrentFilter,
  viewStateFor,
} from './events-view-state.js';

export function toggleFilterBar(ctx) {
  const st = viewStateFor(ctx, true);
  if (!st) return;
  st.filtersOpen = !st.filtersOpen;
  // Zuklappen setzt die Ansichts-Filter zurück (Muster Datatable); die
  // gespeicherten Filter im Fence bleiben unberührt.
  if (!st.filtersOpen) st.spec = emptyFilterSpec();
  ensureFilterUi(ctx);
  applyEventsViewState(ctx);
}

export function cycleSort(ctx, th) {
  const key = th.dataset.evSort;
  if (!key) return;
  const st = viewStateFor(ctx, true);
  if (!st) return;
  const current = st.sort || DEFAULT_SORT;
  st.sort = current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 };
  applyEventsViewState(ctx);
}

// Filter-Umschalter (immer, sofern ein Anzeige-Wrapper da ist) plus
// Filter-Leiste (wenn eingeblendet). Idempotent pro DOM-Generation.
export function ensureFilterUi(ctx) {
  const display = ctx.container.querySelector('.pev-display');
  if (!display) return;
  const st = viewStateFor(ctx, false);
  if (!ctx.container.querySelector('.pev-filter-toggle')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pev-filter-toggle';
    btn.title = t('events.filter.show');
    btn.setAttribute('aria-label', t('events.filter.show'));
    btn.textContent = '▽';
    ctx.container.insertBefore(btn, ctx.container.firstChild);
  }
  const toggle = ctx.container.querySelector('.pev-filter-toggle');
  toggle.classList.toggle('active', !!(st && st.filtersOpen));
  const count = st ? eventFilterActiveCount(st.spec) : 0;
  let badge = toggle.querySelector('.pev-filter-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'pev-filter-badge';
      toggle.appendChild(badge);
    }
    badge.textContent = String(count);
  } else if (badge) {
    badge.remove();
  }
  const existing = ctx.container.querySelector('.pev-filter-bar');
  if (!st || !st.filtersOpen) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    renderActiveChips(ctx, st);
    return;
  }
  buildFilterBar(ctx, st);
}

function rebuildFilterBar(ctx) {
  const existing = ctx.container.querySelector('.pev-filter-bar');
  if (existing) existing.remove();
  ensureFilterUi(ctx);
  applyEventsViewState(ctx);
}

function mkChipButton(className, text, active) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = text;
  if (active) btn.classList.add('active');
  return btn;
}

function buildFilterBar(ctx, st) {
  const display = ctx.container.querySelector('.pev-display');
  const bar = document.createElement('div');
  bar.className = 'pev-filter-bar';

  // Volltextsuche (debounct; Hervorhebung übernimmt applyEventsViewState).
  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'pev-filter-text';
  text.placeholder = t('events.filter.textPlaceholder');
  text.value = st.spec.text || '';
  let timer = null;
  text.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      st.spec.text = text.value;
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    }, 150);
  });
  bar.appendChild(text);

  // Kategorie-Mehrfachauswahl als Badge-Chips inklusive „Ohne Kategorie".
  const cats = document.createElement('div');
  cats.className = 'pev-filter-cats';
  const catChip = (value, label) => {
    const chip = mkChipButton('pev-filter-cat', label, st.spec.categories.includes(value));
    chip.dataset.cat = value;
    chip.addEventListener('click', () => {
      const idx = st.spec.categories.indexOf(value);
      if (idx >= 0) st.spec.categories.splice(idx, 1);
      else st.spec.categories.push(value);
      chip.classList.toggle('active', idx < 0);
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    });
    cats.appendChild(chip);
  };
  for (const cat of EVENT_CATEGORIES) catChip(cat, t(`events.category.${cat}`));
  catChip('none', t('events.category.none'));
  bar.appendChild(cats);

  // Datumsbereich von/bis plus Presets.
  const range = document.createElement('div');
  range.className = 'pev-filter-range';
  const mkDate = (cls, value) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `pev-filter-input ${cls}`;
    input.placeholder = t('events.form.datePlaceholder');
    input.value = value || '';
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      if (raw !== '' && !parseIsoDate(raw)) {
        showStatusbarHint('events.hint.badDateInput', { error: true, duration: 2500 });
        return;
      }
      if (cls === 'pev-filter-from') st.spec.from = raw;
      else st.spec.to = raw;
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    });
    return input;
  };
  const fromInput = mkDate('pev-filter-from', st.spec.from);
  const toInput = mkDate('pev-filter-to', st.spec.to);
  range.appendChild(fromInput);
  range.appendChild(document.createTextNode(' – '));
  range.appendChild(toInput);
  const presets = document.createElement('select');
  presets.className = 'pev-filter-preset';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('events.filter.preset');
  presets.appendChild(none);
  for (const preset of EVENT_DATE_PRESETS) {
    const opt = document.createElement('option');
    opt.value = preset;
    opt.textContent = t(`events.filter.preset.${preset}`);
    presets.appendChild(opt);
  }
  presets.addEventListener('change', () => {
    if (presets.value === '') return;
    const r = datePresetRange(presets.value, localTodayIso());
    st.spec.from = r.from;
    st.spec.to = r.to;
    fromInput.value = r.from;
    toInput.value = r.to;
    ensureFilterUi(ctx);
    applyEventsViewState(ctx);
  });
  range.appendChild(presets);
  bar.appendChild(range);

  // Zusatzfilter (nur mit Notizen / nur wiederkehrend / nur mit Zeitspanne).
  const flags = document.createElement('div');
  flags.className = 'pev-filter-flags';
  const mkFlag = (key, labelKey) => {
    const label = document.createElement('label');
    label.className = 'pev-filter-flag';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!st.spec[key];
    box.addEventListener('change', () => {
      st.spec[key] = box.checked;
      ensureFilterUi(ctx);
      applyEventsViewState(ctx);
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode(` ${t(labelKey)}`));
    flags.appendChild(label);
  };
  mkFlag('notes', 'events.filter.onlyNotes');
  mkFlag('recurring', 'events.filter.onlyRecurring');
  mkFlag('timespan', 'events.filter.onlyTimespan');
  bar.appendChild(flags);

  // Gespeicherte benannte Filter (Anwenden überall; Speichern/Löschen
  // schreibt filter:-Direktiven und braucht den editierbaren Kontext).
  const saved = document.createElement('div');
  saved.className = 'pev-filter-saved-area';
  const model = parsePerspectiveEvents(normalizeBody(ctx.container.dataset.evSource));
  const select = document.createElement('select');
  select.className = 'pev-filter-saved';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('events.filter.savedPlaceholder');
  select.appendChild(placeholder);
  for (const f of model.savedFilters) {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    const hit = model.savedFilters.find((f) => f.name === select.value);
    if (!hit) return;
    st.spec = { ...hit.spec, categories: [...hit.spec.categories] };
    // Leiste mit den übernommenen Werten neu aufbauen, die Dropdown-
    // Auswahl aber erhalten — sonst könnte „Löschen" den gerade
    // angewendeten Filter nicht mehr adressieren.
    const keep = select.value;
    rebuildFilterBar(ctx);
    const fresh = ctx.container.querySelector('.pev-filter-saved');
    if (fresh) fresh.value = keep;
  });
  saved.appendChild(select);
  if (ctx.editable) {
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'pev-filter-input pev-filter-name';
    name.placeholder = t('events.filter.namePlaceholder');
    saved.appendChild(name);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'pev-add-btn pev-filter-save';
    saveBtn.textContent = t('events.filter.save');
    saveBtn.addEventListener('click', () => saveCurrentFilter(ctx, st, name.value));
    saved.appendChild(saveBtn);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'pev-add-btn pev-filter-delete';
    delBtn.textContent = t('events.filter.delete');
    delBtn.addEventListener('click', () => deleteSavedFilter(ctx, select.value));
    saved.appendChild(delBtn);
  }
  bar.appendChild(saved);

  // Aktive Filter als entfernbare Chips.
  const chips = document.createElement('div');
  chips.className = 'pev-filter-chips';
  bar.appendChild(chips);

  ctx.container.insertBefore(bar, display);
  renderActiveChips(ctx, st);
}

// Aktive Filter-Kriterien als entfernbare Chips (Referenz-Verhalten).
function renderActiveChips(ctx, st) {
  const chips = ctx.container.querySelector('.pev-filter-chips');
  if (!chips) return;
  chips.textContent = '';
  const addChip = (label, clear) => {
    const chip = document.createElement('span');
    chip.className = 'pev-filter-chip';
    chip.appendChild(document.createTextNode(label));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'pev-filter-chip-remove';
    x.title = t('events.filter.chipRemove');
    x.textContent = '×';
    x.addEventListener('click', () => {
      clear();
      rebuildFilterBar(ctx);
    });
    chip.appendChild(x);
    chips.appendChild(chip);
  };
  const spec = st.spec;
  if (String(spec.text || '').trim() !== '') {
    addChip(t('events.filter.chip.text').replace('{v}', spec.text), () => {
      spec.text = '';
    });
  }
  if (spec.categories.length > 0) {
    const labels = spec.categories
      .map((c) => (c === 'none' ? t('events.category.none') : t(`events.category.${c}`)))
      .join(', ');
    addChip(t('events.filter.chip.categories').replace('{v}', labels), () => {
      spec.categories = [];
    });
  }
  if (spec.from || spec.to) {
    addChip(
      t('events.filter.chip.range').replace('{v}', `${spec.from || '…'} – ${spec.to || '…'}`),
      () => {
        spec.from = '';
        spec.to = '';
      },
    );
  }
  if (spec.notes) {
    addChip(t('events.filter.onlyNotes'), () => {
      spec.notes = false;
    });
  }
  if (spec.recurring) {
    addChip(t('events.filter.onlyRecurring'), () => {
      spec.recurring = false;
    });
  }
  if (spec.timespan) {
    addChip(t('events.filter.onlyTimespan'), () => {
      spec.timespan = false;
    });
  }
}
