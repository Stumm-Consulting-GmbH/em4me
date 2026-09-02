// 4T-000985 (Epic 3E-000196): aus src/shared/markdown/plugins.js geschnitten.
// Kalender-Gruppe: die Wert-Syntax @{Kalendername: Wert} als Inline-Regel
// und die Badge-Beschreibung als gemeinsame Quelle von Render-Pane und
// Live-Widget. Electron-frei; die Instanz-Registrierung macht markdown.js
// in der Original-Reihenfolge.
'use strict';

const { escapeHtml } = require('../slug.js');
// 4T-000546 (Epic 3E-000097): Kalender-Kern fuer die Wert-Syntax @{Name: Wert}
// (Erkennung, Aufloesung, Namens-Formatierung der Badge-Darstellung).
// 4T-000995 (Epic 3E-000196): Der Kern liegt seither im Ordner
// src/shared/calendar/; die Bezugs-Aufloesung einer Ableitung und die
// Kennung der eingebauten Zeitrechnung stehen in seinem Konfigurations-Rand.
const calendarCore = require('../../calendar/calendar-core.js');
const { baseCalendarOf, STANDARD_CALENDAR_ID } = require('../../calendar/calendar-config.js');

// 4T-000748 (Epic 3E-000138): Einheiten-Namen der Zeitspanne. Steht eine
// Ableitung auf der eingebauten Standard-Zeitrechnung, kommen Ein- und
// Mehrzahl aus den vorhandenen i18n-Schluesseln (Entscheidung des Product
// Owners vom 2026-07-26, Variante 1c); bei selbst definierten Kalendern
// bleibt der Name der Definition stehen, weil das Modell dort keine
// Mehrzahl kennt.
const CALENDAR_SPAN_UNIT_KEYS = {
  day: ['events.unit.day', 'events.unit.days'],
  week: ['events.unit.week', 'events.unit.weeks'],
  month: ['events.unit.month', 'events.unit.months'],
  year: ['events.unit.year', 'events.unit.years'],
  quarter: ['calendar.span.quarter', 'calendar.span.quarters'],
  'half-year': ['calendar.span.halfYear', 'calendar.span.halfYears'],
};

const CALENDAR_SPAN_LABEL_KEYS = [...new Set(Object.values(CALENDAR_SPAN_UNIT_KEYS).flat())];
// --- 4T-000546 (Epic 3E-000097): Kalender-Wert-Syntax @{Kalendername: Wert} -------------
// Badge-Spec als gemeinsame Quelle fuer Render-Pane (Rule unten) und
// Live-Widget (live-widgets.js) — Paritaets-Muster taskMarkerBadgeSpec.
// Aufloesung gegen die calendarSystems-Konfiguration des Bereichs
// (env.calendarSystems bzw. Modul-Zustand in markdown.js): unbekannter
// Kalender oder ungueltiger Wert wird sichtbar markiert, der Roh-Text
// bleibt unveraendert erhalten (Workshop-Punkt 6, Teilpunkt 5).
function calendarSpanUnitName(cal, unit, count, L) {
  if (typeof L === 'function' && cal.derived && cal.derived.fromId === STANDARD_CALENDAR_ID) {
    const keys = CALENDAR_SPAN_UNIT_KEYS[unit.id];
    if (keys) {
      const text = L(keys[count === 1 ? 0 : 1]);
      if (typeof text === 'string' && text !== '' && !text.startsWith('events.')) return text;
    }
  }
  return unit.name;
}

// Zeitspanne eines Werts in der konfigurierten Gliederungs-Tiefe; Anteile
// der Laenge null entfallen, die Richtung traegt das Kuerzel der Ableitung.
function calendarSpanText(cal, tuple, L) {
  const result = calendarCore.spanTiers(cal, tuple);
  if (!result || result.tiers.length === 0) return null;
  const wish =
    cal.derived && cal.derived.depth != null ? cal.derived.depth : result.tiers.length - 1;
  const items = result.tiers[Math.min(Math.max(wish, 0), result.tiers.length - 1)];
  const shown = items.filter((u) => u.count > 0);
  const text = (shown.length > 0 ? shown : items.slice(-1))
    .map((u) => `${u.count} ${calendarSpanUnitName(cal, u, u.count, L)}`)
    .join(', ');
  if (result.direction !== 'before') return text;
  const label = cal.epochs[0].abbr || cal.epochs[0].name || '';
  return label === '' ? text : `${text} ${label}`;
}

function calendarValueBadgeSpec(name, value, config, L) {
  const raw = `@{${name}: ${value}}`;
  const found = config ? calendarCore.findCalendarByName(config, name) : null;
  if (!found) {
    return { cls: 'calendar-value calendar-value-unknown', title: name, text: raw, ok: false };
  }
  const parsed = calendarCore.parseCanonical(found.calendar, value);
  if (!parsed.ok) {
    return {
      cls: 'calendar-value calendar-value-invalid',
      title: found.calendar.name,
      text: raw,
      ok: false,
    };
  }
  const canonical = calendarCore.formatTuple(found.calendar, parsed.tuple) || value;
  // Ableitung: der Badge zeigt die Zeitspanne, der Kurzhinweis den
  // kanonischen Wert und den Zeitpunkt der Bezugs-Zeitrechnung.
  if (found.calendar.derived) {
    let title = `${found.calendar.name}: ${canonical}`;
    const base = baseCalendarOf(found.block, found.calendar);
    if (base) {
      const back = calendarCore.convertBetween(found.calendar, parsed.tuple, base);
      if (back.ok) title += `\n${base.name}: ${calendarCore.formatTuple(base, back.tuple) || ''}`;
    }
    return {
      cls: 'calendar-value',
      title,
      text: calendarSpanText(found.calendar, parsed.tuple, L) || canonical,
      ok: true,
    };
  }
  const named = calendarCore.formatTuple(found.calendar, parsed.tuple, { named: true }) || value;
  return {
    cls: 'calendar-value',
    title: `${found.calendar.name}: ${canonical}`,
    text: named,
    ok: true,
  };
}

// Inline-Styles des Portable-Exports (ohne styles.css beim Empfaenger).
const CALENDAR_BADGE_PORTABLE_STYLE =
  'display:inline-block;border:1px solid #c8ccd4;border-radius:4px;' +
  'padding:0 0.35em;background:#f6f8fa;font-size:0.92em;color:#24292f;';
const CALENDAR_BADGE_PORTABLE_STYLE_BAD =
  'display:inline-block;border:1px dashed #c0392b;border-radius:4px;' +
  'padding:0 0.35em;background:#fdf3f2;font-size:0.92em;color:#c0392b;';

// Inline-Rule: `@{` oeffnet, `}` in derselben Zeile schliesst; der erste
// Doppelpunkt trennt Name und Wert (Zerlegung im Kalender-Kern — eine
// Erkennungs-Quelle). Kollisionsfrei gegen die Syntax-Landschaft: Code-
// Spans/-Bloecke laufen vor den Text-Rules, Critic Markup beginnt mit `{`
// ohne `@`, Templates mit `{{`, das attrs-Plugin bindet nur eigene
// Schluessel-Formen und sieht das konsumierte Token nicht mehr.
function calendarValuesPlugin(mdInstance, opts) {
  const isPortable = !!(opts && opts.portable);
  function tokenize(state, silent) {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x40 /* @ */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x7b /* { */) return false;
    const end = state.src.indexOf('}', start + 2);
    if (end < 0) return false;
    const raw = state.src.slice(start, end + 1);
    const parsed = calendarCore.parseCalendarValueRaw(raw);
    if (!parsed) return false;
    if (!silent) {
      const token = state.push('calendar_value', '', 0);
      token.meta = parsed;
      token.markup = raw;
    }
    state.pos = end + 1;
    return true;
  }
  mdInstance.inline.ruler.before('link', 'calendar_value', tokenize);
  mdInstance.renderer.rules.calendar_value = (tokens, idx, _opts, env) => {
    const meta = tokens[idx].meta;
    const labels = (env && env.calendarLabels) || null;
    const L = labels ? (key) => labels[key] : null;
    const spec = calendarValueBadgeSpec(meta.name, meta.value, env && env.calendarSystems, L);
    if (isPortable) {
      const style = spec.ok ? CALENDAR_BADGE_PORTABLE_STYLE : CALENDAR_BADGE_PORTABLE_STYLE_BAD;
      return `<span style="${style}" title="${escapeHtml(spec.title)}">${escapeHtml(spec.text)}</span>`;
    }
    return (
      `<span class="${spec.cls}" title="${escapeHtml(spec.title)}"` +
      ` data-calendar-name="${escapeHtml(meta.name)}" data-calendar-value="${escapeHtml(meta.value)}">` +
      `${escapeHtml(spec.text)}</span>`
    );
  };
}

module.exports = {
  calendarValueBadgeSpec,
  calendarSpanText,
  CALENDAR_SPAN_LABEL_KEYS,
  calendarValuesPlugin,
};
