// 4T-0512 (Epic 3E-0092): HTML-Bausteine des `perspective-events`-Fence —
// interaktive Ereignis-Tabelle (Viewer-Pfad) und statische Portable-Tabelle.
//
// Arbeitsteilung (Muster perspective-datatable.js):
// - Datenmodell, Rechen-Kern und Fence-Format liegen in events-core.js;
//   dieses Modul baut ausschließlich HTML daraus.
// - Der Viewer-Pfad emittiert Struktur plus data-Attribute; alle
//   lokalisierten Texte füllt der Renderer (events-view.js) über data-i18n
//   bzw. die hier exportierten compose*-Helfer mit t(). Die zeitabhängige
//   Differenz-Spalte bleibt deshalb leer und trägt nur ihre Daten-Attribute
//   (data-ev-date/-end/-recurring) — der Stichtag kommt vom Container
//   (data-ev-today, gesetzt im Fence-Override von markdown.js).
// - Der Portable-Pfad schreibt fertige, sprach-aufgelöste Texte mit
//   Inline-Styles (kein Empfänger-CSS, keine Interaktivität); die Labels
//   reicht markdown.js als aufgelöste Map herein (Key-Fallback). Art 2
//   (query-Direktive) und Struktur-Fehler liefern null — der Fence bleibt
//   im Export unverändert (PO-Festlegung 2026-07-15, Präzedenz
//   perspective-query bzw. Datatable-Fehlerfall).
'use strict';

const { escapeHtml } = require('./slug.js');
const {
  parsePerspectiveEvents,
  validateEventEntries,
  effectiveEventsView,
  eventDiff,
  spanDiff,
  eventMilestones,
  nextOccurrence,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_COLORS,
  EVENT_VIEWS,
  parseIsoDate,
  addDaysIso,
  upcomingEventOccurrences,
  upcomingEventMilestones,
  categoryCounts,
  timelineGroups,
  calendarDayMap,
} = require('../events-core.js');
// 4T-0514: Monats-Gitter des Journal-Kalenders (Wochenstart Montag) als
// gemeinsame Kalender-Mathematik.
const { monthGrid } = require('../journal-core.js');

// Ober-Grenze der gerenderten Einträge (Muster MAX_RENDER_ROWS der
// Datatable, dokumentierte Grenze statt virtuellem Scrolling): darüber
// zeigt der Viewer nur Kopf und Hinweis; der Portable-Export schreibt
// weiterhin alle Einträge.
const MAX_EVENT_RENDER_ROWS = 1000;

// Heutiges Datum als lokaler ISO-Tag (Kalendertag des Nutzers, bewusst
// nicht UTC — der Stichtag der Differenz-Rechnung ist der Wandkalender).
function localTodayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// --- Text-Komposition (gemeinsam für Viewer-Lokalisierung und Portable) -------------

// L ist ein Label-Resolver key -> Text (Renderer: t(); Portable: Label-Map
// mit Key-Fallback). Interpolation läuft über {n}-Ersetzung wie bei den
// übrigen platzhalter-tragenden Keys des Projekts.
function unitText(n, base, L) {
  return `${n} ${L(n === 1 ? `events.unit.${base}` : `events.unit.${base}s`)}`;
}

// Staffelungs-Zeilen der Referenz: Tage immer; Wochen-/Monats-/Jahres-
// Staffel nur, wenn ihre Leit-Einheit größer null ist (vermeidet
// "0 Jahre, 0 Monate, …"-Rauschen bei kurzen Differenzen).
function composeDiffLines(diff, L) {
  if (!diff || !diff.valid) return [];
  const t = diff.tiers;
  const lines = [unitText(t.days.days, 'day', L)];
  if (t.weeks.weeks > 0) {
    lines.push(`${unitText(t.weeks.weeks, 'week', L)}, ${unitText(t.weeks.days, 'day', L)}`);
  }
  if (t.months.months > 0) {
    lines.push(
      `${unitText(t.months.months, 'month', L)}, ${unitText(t.months.weeks, 'week', L)}, ` +
        unitText(t.months.days, 'day', L),
    );
  }
  if (t.years.years > 0) {
    lines.push(
      `${unitText(t.years.years, 'year', L)}, ${unitText(t.years.months, 'month', L)}, ` +
        `${unitText(t.years.weeks, 'week', L)}, ${unitText(t.years.days, 'day', L)}`,
    );
  }
  return lines;
}

// Kompakte Spannen-Angabe (Zeitpunkt bis Ende): Jahres-Staffel ohne
// Null-Anteile; ganz ohne Anteile bleibt "0 Tage".
function composeSpanText(span, L) {
  if (!span || !span.valid) return '';
  const t = span.tiers.years;
  const parts = [];
  if (t.years > 0) parts.push(unitText(t.years, 'year', L));
  if (t.months > 0) parts.push(unitText(t.months, 'month', L));
  if (t.weeks > 0) parts.push(unitText(t.weeks, 'week', L));
  if (t.days > 0 || parts.length === 0) parts.push(unitText(t.days, 'day', L));
  return parts.join(', ');
}

function composeMilestoneText(milestone, L) {
  return L(`events.milestone.${milestone.kind}`).replace('{n}', String(milestone.value));
}

// Wiederkehr-Zeile: nächstes Jahres-Vorkommen mit Countdown und Jahres-Nummer.
function composeCountdownText(occ, L) {
  if (!occ) return '';
  const inText =
    occ.inDays === 0
      ? L('events.recurring.today')
      : occ.inDays === 1
        ? L('events.recurring.inDay')
        : L('events.recurring.inDays').replace('{n}', String(occ.inDays));
  const yearText =
    occ.years > 0 ? ` · ${L('events.recurring.year').replace('{n}', String(occ.years))}` : '';
  return `${occ.dateIso} · ${inText}${yearText}`;
}

// --- Viewer-HTML ----------------------------------------------------------------------

// Struktur-Fehler-Liste (Muster buildErrorsHtml der Datatable): Codes und
// Positionen als data-Attribute, lokalisierte Texte füllt events-view.js.
function buildEventsErrorsHtml(errors) {
  const out = [
    '<div class="pev-errors"><div class="pev-errors-title" data-i18n="events.errors.title">events</div>',
  ];
  for (const err of errors) {
    const line = Number.isFinite(err.line) && err.line > 0 ? err.line : '';
    const detail = escapeHtml(String(err.detail == null ? '' : err.detail));
    out.push(
      `<div class="pev-error-item" data-ev-code="${escapeHtml(err.code)}" ` +
        `data-ev-line="${line}" data-ev-detail="${detail}">` +
        `${escapeHtml(err.code)} [${line}]</div>`,
    );
  }
  out.push('</div>');
  return out.join('');
}

// Hinweis-Zellen-Zuordnung der weichen Wert-Hinweise (validateEventEntries).
const HINT_CELL = {
  missingDate: 'date',
  invalidDate: 'date',
  invalidEnd: 'end',
  endBeforeDate: 'end',
  missingText: 'text',
  unknownCategory: 'category',
};

function hintIconsHtml(codes) {
  return codes
    .map((code) => `<span class="pev-hint" data-ev-hint="${escapeHtml(code)}">⚠</span>`)
    .join('');
}

function notesHtml(notes) {
  if (!notes) return '';
  const lines = String(notes).split('\n').map(escapeHtml);
  return `<div class="pev-notes">${lines.join('<br>')}</div>`;
}

// Kategorie-Badge: bekannte Werte lokalisieren über data-i18n
// (events.category.<wert>); unbekannte Werte zeigen den Roh-Text (der
// weiche Hinweis sitzt daneben).
function badgeHtml(category) {
  const cat = String(category || '').trim();
  if (cat === '') return '';
  const known = EVENT_CATEGORIES.includes(cat);
  const i18n = known ? ` data-i18n="events.category.${cat}"` : '';
  return `<span class="pev-badge" data-ev-cat="${escapeHtml(cat)}"${i18n}>${escapeHtml(cat)}</span>`;
}

// Anlage-Formularzeile (statisches Markup; Verhalten bindet der Editor).
// Pflicht ist nur der Ereignis-Text, der Zeitpunkt fällt leer auf heute
// (Referenz-Verhalten); Platzhalter und Titel lokalisiert der Renderer.
function buildAddFormHtml() {
  const dateField = (name) =>
    `<span class="pev-form-date"><input type="text" class="pev-form-input pev-form-${name}" ` +
    `data-i18n-placeholder="events.form.datePlaceholder" autocomplete="off" spellcheck="false">` +
    `<button type="button" class="pev-form-pick" data-ev-pick="${name}" ` +
    `data-i18n-title="events.form.pickDate" tabindex="-1" hidden>📅</button></span>`;
  const options = ['<option value="" data-i18n="events.category.none"></option>'];
  for (const cat of EVENT_CATEGORIES) {
    options.push(`<option value="${cat}" data-i18n="events.category.${cat}">${cat}</option>`);
  }
  return (
    '<div class="pev-add-form">' +
    dateField('date') +
    dateField('end') +
    `<select class="pev-form-input pev-form-category">${options.join('')}</select>` +
    '<input type="text" class="pev-form-input pev-form-text" ' +
    'data-i18n-placeholder="events.form.textPlaceholder" autocomplete="off">' +
    '<input type="text" class="pev-form-input pev-form-notes" ' +
    'data-i18n-placeholder="events.form.notesPlaceholder" autocomplete="off">' +
    '<label class="pev-form-recurring"><input type="checkbox" class="pev-form-recurring-box">' +
    '<span data-i18n="events.form.recurring">recurring</span></label>' +
    '<button type="button" class="pev-add-btn"><span aria-hidden="true">+</span> ' +
    '<span data-i18n="events.form.add">add</span></button>' +
    '</div>'
  );
}

// Interaktive Ereignis-Tabelle: Struktur mit data-Attributen; die
// Differenz-Spalte bleibt leer (events-view.js rechnet und lokalisiert
// über den Container-Stichtag). Editier-Affordanzen sind immer im Markup
// und werden per CSS nur in editierbaren Kontexten sichtbar (Muster pdt).
// opts.aggregation (4T-0515): Art-2-Variante — keine Formularzeile, nur
// der Bearbeiten-Knopf, Zeilen tragen die Quell-Datei (data-ev-source,
// Herkunfts-Zeile, Titel-Fallback kursiv); Anlage/Duplizieren/Löschen
// gibt es in der Aggregations-Sicht nicht (Workshop-Punkt 5).
function buildEventsTableHtml(model, opts = {}) {
  const aggregation = !!opts.aggregation;
  const entries = model.entries || [];
  const truncated = entries.length > MAX_EVENT_RENDER_ROWS;
  // Titel-Fallback-Einträge (event-text leer, logischer Name greift)
  // erzeugen keinen missingText-Hinweis — der Fallback ist definiert.
  const hints = validateEventEntries(entries).filter(
    (h) => !(aggregation && h.code === 'missingText'),
  );
  const hintsByLine = new Map();
  for (const h of hints) {
    if (!hintsByLine.has(h.line)) hintsByLine.set(h.line, []);
    hintsByLine.get(h.line).push(h.code);
  }
  const out = ['<table class="pev-table">'];
  out.push('<thead><tr>');
  // data-ev-sort: Klick-Sortierung der Ansicht (4T-0513, events-editor.js);
  // Differenz- und Aktions-Spalte sind nicht sortierbar.
  out.push('<th class="pev-col-date" data-ev-sort="date" data-i18n="events.column.date">date</th>');
  out.push('<th class="pev-col-end" data-ev-sort="end" data-i18n="events.column.end">end</th>');
  out.push(
    '<th class="pev-col-category" data-ev-sort="category" data-i18n="events.column.category">category</th>',
  );
  out.push('<th class="pev-col-text" data-ev-sort="text" data-i18n="events.column.text">text</th>');
  out.push('<th class="pev-col-diff" data-i18n="events.column.diff">diff</th>');
  // Aktions-Spalte mit eigenem Kopf (PO-Befund C1: kopflose Spalte wirkte
  // wie ein Versehen); sichtbar nur in editierbaren Kontexten (CSS).
  if (!truncated) {
    out.push('<th class="pev-col-actions" data-i18n="events.column.actions">actions</th>');
  }
  out.push('</tr></thead>');

  if (!truncated && entries.length > 0) {
    out.push('<tbody>');
    entries.forEach((e, i) => {
      const codes = hintsByLine.get(e.line) || [];
      const cellHints = (cell) => hintIconsHtml(codes.filter((c) => HINT_CELL[c] === cell));
      const rowCls = aggregation ? 'pev-row pev-agg-row' : 'pev-row';
      const sourceAttr =
        aggregation && e.source
          ? ` data-ev-source="${escapeHtml(e.source.path)}" data-ev-mtime="${e.source.mtimeMs || 0}"`
          : '';
      out.push(`<tr class="${rowCls}" data-ev-row="${i}"${sourceAttr}>`);
      // 4T-0516: Verknüpfungs-Indikator in der Zeitpunkt-Spalte (Referenz-
      // Platzierung); die Aufklapp-Liste baut der Editor.
      const linkCount = (e.predecessors || []).length + (e.successors || []).length;
      const linkInd =
        linkCount > 0
          ? `<button type="button" class="pev-link-ind" data-i18n-title="events.link.indicator" tabindex="-1">⛓${linkCount}</button>`
          : '';
      out.push(
        `<td class="pev-cell pev-date">${escapeHtml(e.date)}${linkInd}${cellHints('date')}</td>`,
      );
      out.push(`<td class="pev-cell pev-end">${escapeHtml(e.end)}${cellHints('end')}</td>`);
      out.push(
        `<td class="pev-cell pev-category">${badgeHtml(e.category)}${cellHints('category')}</td>`,
      );
      const textCls = e.textFallback ? 'pev-text-main pev-text-fallback' : 'pev-text-main';
      const sourceLine =
        aggregation && e.source
          ? `<div class="pev-source" data-i18n-title="events.agg.openSource">${escapeHtml(e.source.name)}</div>`
          : '';
      out.push(
        `<td class="pev-cell pev-text"><div class="${textCls}">${escapeHtml(e.text)}` +
          `${cellHints('text')}</div>${notesHtml(e.notes)}${sourceLine}</td>`,
      );
      out.push(
        `<td class="pev-cell pev-diff" data-ev-date="${escapeHtml(e.date)}" ` +
          `data-ev-end="${escapeHtml(e.end)}"${e.recurring ? ' data-ev-recurring="x"' : ''}></td>`,
      );
      const linkBtn =
        '<button type="button" class="pev-link-btn" data-i18n-title="events.link.action" tabindex="-1">🔗</button>';
      if (aggregation) {
        out.push(
          '<td class="pev-cell pev-actions">' +
            '<button type="button" class="pev-edit-btn" data-i18n-title="events.action.edit" tabindex="-1">✎</button>' +
            linkBtn +
            '</td>',
        );
      } else {
        out.push(
          '<td class="pev-cell pev-actions">' +
            '<button type="button" class="pev-edit-btn" data-i18n-title="events.action.edit" tabindex="-1">✎</button>' +
            linkBtn +
            '<button type="button" class="pev-dup-btn" data-i18n-title="events.action.duplicate" tabindex="-1">⧉</button>' +
            '<button type="button" class="pev-del-btn" data-i18n-title="events.action.delete" tabindex="-1">×</button>' +
            '</td>',
        );
      }
      out.push('</tr>');
    });
    out.push('</tbody>');
  }
  out.push('</table>');

  if (truncated) {
    // Sprachneutraler Fallback; lokalisiert der Renderer über data-ev-total.
    out.push(
      `<div class="pev-limit" data-ev-total="${entries.length}">` +
        `${entries.length} &gt; ${MAX_EVENT_RENDER_ROWS}</div>`,
    );
  } else if (!aggregation) {
    out.push(buildAddFormHtml());
  }
  return out.join('');
}

// --- Zusatz-Ansichten (4T-0514) --------------------------------------------------------
// Dashboard, Monats-/Wochen-Kalender und Timeline als reine HTML-Builder
// über der gefilterten Index-Menge. L ist der Label-Resolver (Pipeline:
// aufgeloeste Sprachdatei-Map aus markdown.js; Client: t()); lang steuert
// die Intl-Monats-/Wochentags-Namen (Muster Kalender-Panel). Die Ansichten
// sind reine Darstellung ohne Schreib-Logik; Ereignis-Chips tragen
// data-ev-jump für den Sprung zur Tabellen-Zeile.

function intlMonthLabel(lang, y, monthIndex) {
  try {
    return new Intl.DateTimeFormat(lang || 'de', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, monthIndex, 15)));
  } catch {
    return `${y}-${String(monthIndex + 1).padStart(2, '0')}`;
  }
}

function intlWeekdayLabel(lang, iso) {
  const parts = parseIsoDate(iso);
  if (!parts) return '';
  try {
    return new Intl.DateTimeFormat(lang || 'de', { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(parts.y, parts.m - 1, parts.d)),
    );
  } catch {
    return iso;
  }
}

// Ansichts-Umschalter (statisch, lokalisiert über data-i18n).
function buildEventsViewBarHtml(effective) {
  const out = ['<div class="pev-switcher" role="group">'];
  for (const v of EVENT_VIEWS) {
    out.push(
      `<button type="button" class="pev-viewbtn${v === effective ? ' active' : ''}" ` +
        `data-ev-viewbtn="${v}" data-i18n="events.view.${v}">${v}</button>`,
    );
  }
  out.push('</div>');
  return out.join('');
}

// Kompakter Ereignis-Chip (Sprung-Ziel data-ev-jump = Modell-Index).
function eventChipHtml(model, index, opts = {}) {
  const e = model.entries[index];
  if (!e) return '';
  const cat = String(e.category || '').trim();
  const catAttr = EVENT_CATEGORIES.includes(cat) ? ` data-ev-cat="${cat}"` : '';
  const kindCls = opts.kind ? ` pev-chip-${opts.kind}` : '';
  const label = opts.label != null ? opts.label : e.text || e.date;
  return (
    `<button type="button" class="pev-event-chip${kindCls}"${catAttr} ` +
    `data-ev-jump="${index}" title="${escapeHtml(e.text || e.date)}">${escapeHtml(label)}</button>`
  );
}

function countdownLabel(inDays, L) {
  if (inDays === 0) return L('events.recurring.today');
  if (inDays === 1) return L('events.recurring.inDay');
  return L('events.recurring.inDays').replace('{n}', String(inDays));
}

// Dashboard: anstehende Ereignisse, erreichte und nahende Meilensteine,
// Kategorie-Statistik (Referenz-Umfang, Workshop-Punkt 7).
const DASHBOARD_MILESTONE_HORIZON = 30;

function buildEventsDashboardHtml(model, indices, { todayIso, L }) {
  const today = todayIso || localTodayIso();
  const upcoming = upcomingEventOccurrences(model.entries, indices, today, 10);
  const milestones = upcomingEventMilestones(
    model.entries,
    indices,
    today,
    DASHBOARD_MILESTONE_HORIZON,
  );
  const cats = categoryCounts(model.entries, indices);
  const out = ['<div class="pev-dashboard">'];

  out.push('<div class="pev-dash-section">');
  out.push(`<div class="pev-dash-title">${escapeHtml(L('events.dashboard.upcoming'))}</div>`);
  if (upcoming.length === 0) {
    out.push(`<div class="pev-dash-empty">${escapeHtml(L('events.dashboard.empty'))}</div>`);
  }
  for (const u of upcoming) {
    out.push(
      '<div class="pev-dash-item">' +
        `<span class="pev-dash-date">${escapeHtml(u.dateIso)}</span>` +
        eventChipHtml(model, u.index) +
        `<span class="pev-dash-in">${escapeHtml(countdownLabel(u.inDays, L))}</span></div>`,
    );
  }
  out.push('</div>');

  out.push('<div class="pev-dash-section">');
  out.push(`<div class="pev-dash-title">${escapeHtml(L('events.dashboard.milestones'))}</div>`);
  if (milestones.length === 0) {
    out.push(
      `<div class="pev-dash-empty">${escapeHtml(
        L('events.dashboard.noMilestones').replace('{n}', String(DASHBOARD_MILESTONE_HORIZON)),
      )}</div>`,
    );
  }
  for (const m of milestones) {
    const when = m.inDays === 0 ? L('events.dashboard.reached') : countdownLabel(m.inDays, L);
    out.push(
      '<div class="pev-dash-item">' +
        `<span class="pev-milestone-badge">★ ${escapeHtml(composeMilestoneText(m, L))}</span>` +
        eventChipHtml(model, m.index) +
        `<span class="pev-dash-in">${escapeHtml(when)}</span></div>`,
    );
  }
  out.push('</div>');

  out.push('<div class="pev-dash-section">');
  out.push(`<div class="pev-dash-title">${escapeHtml(L('events.dashboard.categories'))}</div>`);
  out.push('<div class="pev-dash-cats">');
  for (const c of cats) {
    const label =
      c.category === '' ? L('events.category.none') : L(`events.category.${c.category}`);
    const catAttr = EVENT_CATEGORIES.includes(c.category) ? ` data-ev-cat="${c.category}"` : '';
    out.push(
      `<span class="pev-dash-cat"><span class="pev-badge"${catAttr}>${escapeHtml(label)}</span>` +
        `<span class="pev-dash-count">${c.count}</span></span>`,
    );
  }
  out.push('</div></div>');

  out.push('</div>');
  return out.join('');
}

// Monats-/Wochen-Kalender: Raster mit Navigation und Heute-Zugriff;
// Zeitspannen als durchlaufende Balken (kind start/mid/end).
const CALENDAR_MAX_CHIPS = { month: 3, week: 8 };

function buildEventsCalendarHtml(model, indices, { todayIso, anchorIso, mode, L, lang }) {
  const today = todayIso || localTodayIso();
  const anchor = parseIsoDate(anchorIso || today) ? anchorIso || today : today;
  const anchorParts = parseIsoDate(anchor);
  const isWeek = mode === 'week';
  let dayRows;
  let title;
  if (isWeek) {
    const weekday =
      (new Date(Date.UTC(anchorParts.y, anchorParts.m - 1, anchorParts.d)).getUTCDay() + 6) % 7;
    const monday = addDaysIso(anchor, -weekday);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDaysIso(monday, i);
      days.push({ iso, day: Number(iso.slice(8, 10)), inMonth: true });
    }
    dayRows = [days];
    title = `${monday} – ${addDaysIso(monday, 6)}`;
  } else {
    dayRows = monthGrid(anchorParts.y, anchorParts.m - 1).map((row) => row.days);
    title = intlMonthLabel(lang, anchorParts.y, anchorParts.m - 1);
  }
  const first = dayRows[0][0].iso;
  const last = dayRows[dayRows.length - 1][6].iso;
  const byDay = calendarDayMap(model.entries, indices, first, last);
  const maxChips = CALENDAR_MAX_CHIPS[isWeek ? 'week' : 'month'];

  const prevTitle = L(isWeek ? 'events.cal.prevWeek' : 'calendar.prevMonth');
  const nextTitle = L(isWeek ? 'events.cal.nextWeek' : 'calendar.nextMonth');
  const out = [
    `<div class="pev-calendar pev-cal-${isWeek ? 'week' : 'month'}" data-ev-cal-anchor="${escapeHtml(anchor)}">`,
    '<div class="pev-cal-head">',
    `<button type="button" class="pev-cal-nav pev-cal-prev" title="${escapeHtml(prevTitle)}">‹</button>`,
    `<span class="pev-cal-title">${escapeHtml(title)}</span>`,
    `<button type="button" class="pev-cal-nav pev-cal-next" title="${escapeHtml(nextTitle)}">›</button>`,
    `<button type="button" class="pev-cal-nav pev-cal-today-btn">${escapeHtml(L('calendar.today'))}</button>`,
    '</div>',
    '<div class="pev-cal-grid">',
  ];
  for (const day of dayRows[0]) {
    out.push(`<div class="pev-cal-weekday">${escapeHtml(intlWeekdayLabel(lang, day.iso))}</div>`);
  }
  for (const row of dayRows) {
    for (const day of row) {
      const cls = ['pev-cal-day'];
      if (!day.inMonth) cls.push('pev-cal-out');
      if (day.iso === today) cls.push('pev-cal-today');
      out.push(`<div class="${cls.join(' ')}" data-ev-day="${day.iso}">`);
      out.push(`<div class="pev-cal-num">${day.day}</div>`);
      const hits = byDay.get(day.iso) || [];
      hits.slice(0, maxChips).forEach((hit) => {
        const showText = hit.kind === 'single' || hit.kind === 'start';
        out.push(
          eventChipHtml(model, hit.index, {
            kind: hit.kind,
            label: showText ? undefined : ' ',
          }),
        );
      });
      if (hits.length > maxChips) {
        out.push(
          `<div class="pev-cal-more">${escapeHtml(
            L('events.cal.more').replace('{n}', String(hits.length - maxChips)),
          )}</div>`,
        );
      }
      out.push('</div>');
    }
  }
  out.push('</div></div>');
  return out.join('');
}

// Timeline: chronologische Band-Darstellung mit Jahres-/Monats-Gruppierung.
function buildEventsTimelineHtml(model, indices, { L, lang }) {
  const groups = timelineGroups(model.entries, indices);
  const out = ['<div class="pev-timeline">'];
  if (groups.length === 0) {
    out.push(`<div class="pev-dash-empty">${escapeHtml(L('events.view.empty'))}</div>`);
  }
  for (const yearGroup of groups) {
    out.push(`<div class="pev-tl-year">${yearGroup.year}</div>`);
    for (const monthGroup of yearGroup.months) {
      out.push(
        `<div class="pev-tl-month">${escapeHtml(
          intlMonthLabel(lang, yearGroup.year, monthGroup.monthIndex),
        )}</div>`,
      );
      for (const item of monthGroup.items) {
        out.push(
          '<div class="pev-tl-item">' +
            `<span class="pev-tl-date">${escapeHtml(item.dateIso)}</span>` +
            eventChipHtml(model, item.index) +
            '</div>',
        );
      }
    }
  }
  out.push('</div>');
  return out.join('');
}

// Innen-HTML des Platzhalter-Containers (der Container selbst mit den
// data-ev-Attributen entsteht im Fence-Override von markdown.js).
// opts: todayIso (Stichtag), lang (Intl-Namen), labels (aufgeloeste
// Sprachdatei-Map fuer die Zusatz-Ansichten; Fallback Key-Name). Die
// wirksame Ansicht kommt aus der view:-Direktive; der Client baut die
// Zusatz-Ansichten bei Filter-/Navigations-Aenderungen mit t() neu
// (events-editor.js), die Pipeline liefert den initialen Stand.
function renderPerspectiveEventsViewer(content, opts = {}) {
  const model = parsePerspectiveEvents(content);
  if (model.errors.length > 0) return buildEventsErrorsHtml(model.errors);
  if (model.query !== null) {
    // Art 2 (Aggregation): Platzhalter, den der Aggregations-Renderer
    // (4T-0515) über das data-Attribut befüllt.
    return (
      `<div class="pev-aggregation" data-ev-query="${escapeHtml(model.query)}">` +
      '<span class="pev-agg-pending" data-i18n="events.aggregationPending">events</span></div>'
    );
  }
  const labels = opts.labels || {};
  const L = (key) => (typeof labels[key] === 'string' ? labels[key] : key);
  const effective = effectiveEventsView(model);
  const todayIso = opts.todayIso || localTodayIso();
  const allIndices = model.entries.map((_, i) => i);
  const viewOpts = { todayIso, L, lang: opts.lang || 'de' };
  const out = [buildEventsViewBarHtml(effective)];
  out.push(`<div class="pev-display" data-ev-display="${effective}">`);
  if (effective === 'dashboard') {
    out.push(buildEventsDashboardHtml(model, allIndices, viewOpts));
  } else if (effective === 'month' || effective === 'week') {
    out.push(buildEventsCalendarHtml(model, allIndices, { ...viewOpts, mode: effective }));
  } else if (effective === 'timeline') {
    out.push(buildEventsTimelineHtml(model, allIndices, viewOpts));
  } else {
    out.push(buildEventsTableHtml(model));
  }
  out.push('</div>');
  return out.join('');
}

// --- Portable-HTML -----------------------------------------------------------------

// Statische Ereignis-Tabelle mit Inline-Styles für den Portable-Export
// (PO-Festlegung 2026-07-15: Art 1 mit Staffelung zum Export-Stichtag;
// Art 2 und Struktur-Fehler bleiben unverändert -> null). labels ist die
// von markdown.js aufgelöste Key->Text-Map (Fallback ist der Key).
function convertPerspectiveEventsBlockToHtml(content, opts = {}) {
  const model = parsePerspectiveEvents(content);
  if (model.errors.length > 0 || model.query !== null) return null;
  const todayIso = opts.todayIso || localTodayIso();
  const labels = opts.labels || {};
  const L = (key) => (typeof labels[key] === 'string' ? labels[key] : key);
  const th = (key) => `<th scope="col" style="text-align: left;">${escapeHtml(L(key))}</th>`;
  const out = ['<table>'];
  out.push('<thead><tr>');
  out.push(th('events.column.date'));
  out.push(th('events.column.end'));
  out.push(th('events.column.category'));
  out.push(th('events.column.text'));
  out.push(th('events.column.diff'));
  out.push('</tr></thead>');
  if ((model.entries || []).length > 0) {
    out.push('<tbody>');
    for (const e of model.entries) {
      out.push('<tr>');
      out.push(`<td>${escapeHtml(e.date)}</td>`);
      // Ende-Zelle mit kompakter Dauer-Angabe (wie die interaktive Sicht).
      let endInner = escapeHtml(e.end);
      const span = e.date && e.end ? spanDiff(e.date, e.end) : null;
      if (span && span.valid && !span.invalidOrder) {
        endInner +=
          `<br><span style="opacity: 0.7; font-size: 0.85em;">` +
          `${escapeHtml(L('events.span.label'))}: ${escapeHtml(composeSpanText(span, L))}</span>`;
      }
      out.push(`<td>${endInner}</td>`);
      // Kategorie-Badge mit fester Hell-Farbzuordnung (Inline-Styles; das
      // Export-Dokument hat kein Theme — Hell ist die neutrale Lesefarbe).
      const cat = String(e.category || '').trim();
      if (cat !== '' && EVENT_CATEGORY_COLORS[cat]) {
        const c = EVENT_CATEGORY_COLORS[cat].light;
        out.push(
          `<td><span style="background-color: ${c.bg}; color: ${c.fg}; ` +
            'border-radius: 0.7em; padding: 0.1em 0.6em; font-size: 0.85em; white-space: nowrap;">' +
            `${escapeHtml(L(`events.category.${cat}`))}</span></td>`,
        );
      } else {
        out.push(`<td>${escapeHtml(cat)}</td>`);
      }
      let textInner = escapeHtml(e.text);
      if (e.notes) {
        textInner += `<br><span style="opacity: 0.7; font-size: 0.85em;">${escapeHtml(
          e.notes,
        ).replace(/\n/g, '<br>')}</span>`;
      }
      out.push(`<td>${textInner}</td>`);
      out.push(`<td>${portableDiffCellHtml(e, todayIso, L)}</td>`);
      out.push('</tr>');
    }
    out.push('</tbody>');
  }
  out.push('</table>');
  return out.join('');
}

function portableDiffCellHtml(entry, todayIso, L) {
  const diff = eventDiff(entry.date, todayIso);
  if (!diff.valid) return '';
  const parts = [];
  const dirKey =
    diff.direction === 'past'
      ? 'events.diff.past'
      : diff.direction === 'future'
        ? 'events.diff.future'
        : 'events.diff.today';
  parts.push(`<span style="opacity: 0.7;">${escapeHtml(L(dirKey))}</span>`);
  if (diff.direction !== 'today') {
    for (const line of composeDiffLines(diff, L)) parts.push(escapeHtml(line));
  }
  for (const m of eventMilestones(entry.date, todayIso)) {
    parts.push(
      '<span style="background-color: #fff3cd; color: #7a5c00; border-radius: 0.7em; ' +
        `padding: 0 0.5em;">★ ${escapeHtml(composeMilestoneText(m, L))}</span>`,
    );
  }
  if (entry.recurring) {
    const occ = nextOccurrence(entry.date, todayIso);
    if (occ) {
      parts.push(
        `<span style="opacity: 0.7;">${escapeHtml(L('events.recurring.label'))}: ` +
          `${escapeHtml(composeCountdownText(occ, L))}</span>`,
      );
    }
  }
  return `<span style="font-size: 0.85em; white-space: nowrap;">${parts.join('<br>')}</span>`;
}

// Label-Keys, die der Portable-Pfad braucht (markdown.js löst sie gegen
// die i18n-Sprachdatei auf; Reihenfolge ohne Bedeutung).
const PORTABLE_EVENT_LABEL_KEYS = [
  'events.column.date',
  'events.column.end',
  'events.column.category',
  'events.column.text',
  'events.column.diff',
  'events.span.label',
  'events.diff.past',
  'events.diff.future',
  'events.diff.today',
  'events.unit.day',
  'events.unit.days',
  'events.unit.week',
  'events.unit.weeks',
  'events.unit.month',
  'events.unit.months',
  'events.unit.year',
  'events.unit.years',
  'events.milestone.days',
  'events.milestone.weeks',
  'events.milestone.months',
  'events.milestone.years',
  'events.milestone.jubilee',
  'events.recurring.label',
  'events.recurring.today',
  'events.recurring.inDay',
  'events.recurring.inDays',
  'events.recurring.year',
  ...EVENT_CATEGORIES.map((c) => `events.category.${c}`),
  // 4T-0514: Zusatz-Ansichten (Pipeline-seitige Lokalisierung; der Client
  // baut mit t() neu). calendar.* sind die bestehenden Kalender-Keys.
  'events.category.none',
  'events.view.empty',
  'events.dashboard.upcoming',
  'events.dashboard.milestones',
  'events.dashboard.reached',
  'events.dashboard.categories',
  'events.dashboard.empty',
  'events.dashboard.noMilestones',
  'events.cal.prevWeek',
  'events.cal.nextWeek',
  'events.cal.more',
  'calendar.today',
  'calendar.prevMonth',
  'calendar.nextMonth',
];

module.exports = {
  MAX_EVENT_RENDER_ROWS,
  localTodayIso,
  renderPerspectiveEventsViewer,
  convertPerspectiveEventsBlockToHtml,
  PORTABLE_EVENT_LABEL_KEYS,
  composeDiffLines,
  composeSpanText,
  composeMilestoneText,
  composeCountdownText,
  // 4T-0514: Zusatz-Ansichten (Client-Neubau in events-editor.js).
  buildEventsTableHtml,
  buildEventsViewBarHtml,
  buildEventsDashboardHtml,
  buildEventsCalendarHtml,
  buildEventsTimelineHtml,
  DASHBOARD_MILESTONE_HORIZON,
};
