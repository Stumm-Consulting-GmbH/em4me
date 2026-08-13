// 4T-0984 (Epic 3E-0196): Ansichts-Schicht der Ereignisse — aus
// `events-core.js` ausgezogen, Funktions-Rümpfe unverändert: Sortierung
// und Filter (4T-0513), Aufbereitung für Dashboard, Kalender und Timeline
// (4T-0514), Gantt-Ansicht (4T-0722); durchweg reine Funktionen über der
// gefilterten Index-Menge. Geladen wird allein der Kern `events-core.js`,
// nie ein Schwester-Modul; prozess-neutral wie er (kein Electron, kein DOM).
'use strict';

const {
  EVENT_CATEGORIES,
  JUBILEE_YEARS,
  addDaysIso,
  addMonthsClamped,
  daysBetweenParts,
  daysInMonth,
  eventDiff,
  mondayOfParts,
  nextOccurrence,
  parseIsoDate,
  toIso,
  utcMs,
} = require('./events-core.js');

// --- Sortierung und Filter (4T-0513) --------------------------------------------------
// Reine Ansichts-Funktionen über den geparsten Einträgen; die Oberfläche
// (events-editor.js), die Zusatz-Ansichten (4T-0514) und die Aggregation
// (4T-0515) arbeiten auf derselben Logik.

const EVENT_SORT_KEYS = ['date', 'end', 'text', 'category'];

// Sortierung nach Zeitpunkt, Endzeitpunkt, Text oder Kategorie; leere
// Werte ans Ende, Zweit-Kriterium Zeitpunkt absteigend (Referenz-Default).
// Liefert die Modell-Indizes in Anzeige-Reihenfolge (die Oberfläche
// ordnet die DOM-Zeilen über data-ev-row, der Quelltext bleibt unberührt).
function sortEventIndices(entries, sort) {
  const key = sort && EVENT_SORT_KEYS.includes(sort.key) ? sort.key : 'date';
  const dir = sort && sort.dir === 1 ? 1 : -1;
  const value = (e) => String(e[key] == null ? '' : e[key]).toLowerCase();
  const indices = (entries || []).map((_, i) => i);
  indices.sort((ia, ib) => {
    const a = value(entries[ia]);
    const b = value(entries[ib]);
    // Leere Werte unabhängig von der Richtung ans Ende.
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    if (a !== b) return a < b ? -dir : dir;
    const da = String(entries[ia].date || '');
    const db = String(entries[ib].date || '');
    if (da !== db) return da < db ? 1 : -1;
    return ia - ib;
  });
  return indices;
}

// Datumsbereichs-Presets der Referenz (Wochenstart Montag, konsistent zum
// Journal-Kalender). 'past' endet gestern, 'future' beginnt heute
// (anstehend einschließlich heute); leere Grenze = offen.
const EVENT_DATE_PRESETS = [
  'today',
  'thisWeek',
  'thisMonth',
  'thisYear',
  'last7',
  'last30',
  'next7',
  'next30',
  'past',
  'future',
];

function datePresetRange(preset, todayIso) {
  const today = parseIsoDate(todayIso);
  if (!today) return { from: '', to: '' };
  const iso = toIso(today);
  switch (preset) {
    case 'today':
      return { from: iso, to: iso };
    case 'thisWeek': {
      const weekday = (new Date(utcMs(today)).getUTCDay() + 6) % 7; // 0 = Montag
      const monday = addDaysIso(iso, -weekday);
      return { from: monday, to: addDaysIso(monday, 6) };
    }
    case 'thisMonth':
      return {
        from: toIso({ y: today.y, m: today.m, d: 1 }),
        to: toIso({ y: today.y, m: today.m, d: daysInMonth(today.y, today.m) }),
      };
    case 'thisYear':
      return { from: `${today.y}-01-01`, to: `${today.y}-12-31` };
    case 'last7':
      return { from: addDaysIso(iso, -7), to: iso };
    case 'last30':
      return { from: addDaysIso(iso, -30), to: iso };
    case 'next7':
      return { from: iso, to: addDaysIso(iso, 7) };
    case 'next30':
      return { from: iso, to: addDaysIso(iso, 30) };
    case 'past':
      return { from: '', to: addDaysIso(iso, -1) };
    case 'future':
      return { from: iso, to: '' };
    default:
      return { from: '', to: '' };
  }
}

// Einzel-Eintrag gegen einen Filter-Zustand (Struktur = gespeicherte
// Filter-Spec). opts.categoryLabel liefert das lokalisierte Kategorie-
// Label für die Volltextsuche (Referenz: Suche über Text, Notizen, Datum
// und Kategorie-Label); ohne Resolver zählt der technische Wert.
function matchesEventFilter(entry, spec, opts = {}) {
  if (!spec) return true;
  const category = String(entry.category || '').trim();
  if (Array.isArray(spec.categories) && spec.categories.length > 0) {
    const noneWanted = spec.categories.includes('none');
    const hit = spec.categories.includes(category) || (noneWanted && category === '');
    if (!hit) return false;
  }
  if (spec.from || spec.to) {
    const date = String(entry.date || '').trim();
    if (!parseIsoDate(date)) return false;
    if (spec.from && date < spec.from) return false;
    if (spec.to && date > spec.to) return false;
  }
  if (spec.notes && String(entry.notes || '').trim() === '') return false;
  if (spec.recurring && !entry.recurring) return false;
  if (spec.timespan && String(entry.end || '').trim() === '') return false;
  const needle = String(spec.text || '')
    .trim()
    .toLowerCase();
  if (needle !== '') {
    const label =
      typeof opts.categoryLabel === 'function' ? opts.categoryLabel(category) : category;
    const haystack = [entry.text, entry.notes, entry.date, entry.end, category, label]
      .map((v) => String(v == null ? '' : v).toLowerCase())
      .join('\n');
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

// Modell-Indizes aller Filter-Treffer (Reihenfolge = Modell-Reihenfolge).
function filterEventIndices(entries, spec, opts) {
  const out = [];
  (entries || []).forEach((e, i) => {
    if (matchesEventFilter(e, spec, opts)) out.push(i);
  });
  return out;
}

// Anzahl aktiver Filter-Kriterien (Zähler-Badge am Filter-Umschalter;
// Chips: Volltext, Kategorie-Auswahl, Datumsbereich, je Zusatzfilter).
function eventFilterActiveCount(spec) {
  if (!spec) return 0;
  let n = 0;
  if (String(spec.text || '').trim() !== '') n++;
  if (Array.isArray(spec.categories) && spec.categories.length > 0) n++;
  if (spec.from || spec.to) n++;
  if (spec.notes) n++;
  if (spec.recurring) n++;
  if (spec.timespan) n++;
  return n;
}

// --- Ansichts-Datenaufbereitung (4T-0514) ----------------------------------------------
// Reine Funktionen für Dashboard, Kalender und Timeline; arbeiten auf der
// gefilterten Index-Menge aus 4T-0513 (Filter wirken in allen Ansichten).

// Anstehende Ereignisse: zukünftige Zeitpunkte direkt, zurückliegende
// wiederkehrende über ihr nächstes Jahres-Vorkommen. Sortiert nach
// Countdown, dann Modell-Reihenfolge; limit begrenzt die Liste.
function upcomingEventOccurrences(entries, indices, todayIso, limit = 10) {
  const today = parseIsoDate(todayIso);
  if (!today) return [];
  const out = [];
  for (const index of indices || []) {
    const e = entries[index];
    if (!e) continue;
    const date = parseIsoDate(e.date);
    if (!date) continue;
    const signed = daysBetweenParts(today, date);
    if (signed >= 0) {
      out.push({ index, dateIso: toIso(date), inDays: signed, occurrence: false });
    } else if (e.recurring) {
      const occ = nextOccurrence(e.date, todayIso);
      if (occ) out.push({ index, dateIso: occ.dateIso, inDays: occ.inDays, occurrence: true });
    }
  }
  out.sort((a, b) => a.inDays - b.inDays || a.index - b.index);
  return out.slice(0, limit);
}

// Nächster Meilenstein einer Art in Tagen ab heute (geschlossene Form je
// Regel statt Tages-Scan). Liefert Einträge mit inDays 0 (heute erreicht)
// bis horizonDays (nahend), sortiert nach inDays.
function upcomingEventMilestones(entries, indices, todayIso, horizonDays = 30) {
  const today = parseIsoDate(todayIso);
  if (!today) return [];
  const out = [];
  for (const index of indices || []) {
    const e = entries[index];
    const from = e ? parseIsoDate(e.date) : null;
    if (!from) continue;
    const diff = eventDiff(e.date, todayIso);
    if (!diff.valid || diff.direction === 'future') continue;
    const push = (kind, value, inDays) => {
      if (inDays >= 0 && inDays <= horizonDays) out.push({ index, kind, value, inDays });
    };
    // Tage-/Wochen-Vielfache: Rest bis zum nächsten runden Wert.
    const dayRem = diff.totalDays % 1000;
    push(
      'days',
      diff.totalDays + (dayRem === 0 ? 0 : 1000 - dayRem),
      dayRem === 0 ? 0 : 1000 - dayRem,
    );
    const weekRem = diff.totalDays % 700;
    const weekIn = weekRem === 0 ? 0 : 700 - weekRem;
    push('weeks', (diff.totalDays + weekIn) / 7, weekIn);
    // Monats-/Jahres-Grenzen kalender-genau über die geklemmte Addition.
    const boundaryIn = (targetMonths) =>
      daysBetweenParts(today, addMonthsClamped(from, targetMonths));
    const onBoundary = diff.restDays === 0;
    const monthRem = diff.totalMonths % 100;
    const monthTarget =
      monthRem === 0 && onBoundary && diff.totalMonths > 0
        ? diff.totalMonths
        : diff.totalMonths + (100 - monthRem);
    if (monthTarget > 0) push('months', monthTarget, boundaryIn(monthTarget));
    const yearRem = diff.totalMonths % 12;
    const yearTarget =
      yearRem === 0 && onBoundary && diff.totalMonths > 0
        ? diff.totalMonths
        : diff.totalMonths + (12 - yearRem);
    if (yearTarget > 0) push('years', yearTarget / 12, boundaryIn(yearTarget));
    const years = Math.floor(diff.totalMonths / 12);
    const reachedJubilee = JUBILEE_YEARS.includes(years) && yearRem === 0 && onBoundary;
    const nextJubilee = reachedJubilee ? years : JUBILEE_YEARS.find((j) => j > years);
    if (nextJubilee !== undefined) {
      push('jubilee', nextJubilee, reachedJubilee ? 0 : boundaryIn(nextJubilee * 12));
    }
  }
  out.sort((a, b) => a.inDays - b.inDays || a.index - b.index);
  return out;
}

// Kategorie-Statistik in fester Kategorien-Reihenfolge; '' zählt die
// Einträge ohne Kategorie (ans Ende), nur belegte Kategorien erscheinen.
function categoryCounts(entries, indices) {
  const counts = new Map();
  for (const index of indices || []) {
    const e = entries[index];
    if (!e) continue;
    const cat = String(e.category || '').trim();
    const key = EVENT_CATEGORIES.includes(cat) ? cat : cat === '' ? '' : cat;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out = [];
  for (const cat of EVENT_CATEGORIES) {
    if (counts.has(cat)) out.push({ category: cat, count: counts.get(cat) });
  }
  for (const [key, count] of counts) {
    if (!EVENT_CATEGORIES.includes(key) && key !== '') out.push({ category: key, count });
  }
  if (counts.has('')) out.push({ category: '', count: counts.get('') });
  return out;
}

// Timeline-Gruppen: chronologisch aufsteigend, Jahr -> Monat -> Einträge.
// Einträge ohne gültigen Zeitpunkt entfallen (sie leben in der Tabelle).
function timelineGroups(entries, indices) {
  const dated = [];
  for (const index of indices || []) {
    const e = entries[index];
    const date = e ? parseIsoDate(e.date) : null;
    if (date) dated.push({ index, date });
  }
  dated.sort((a, b) => utcMs(a.date) - utcMs(b.date) || a.index - b.index);
  const out = [];
  for (const { index, date } of dated) {
    let yearGroup = out[out.length - 1];
    if (!yearGroup || yearGroup.year !== date.y) {
      yearGroup = { year: date.y, months: [] };
      out.push(yearGroup);
    }
    let monthGroup = yearGroup.months[yearGroup.months.length - 1];
    if (!monthGroup || monthGroup.monthIndex !== date.m - 1) {
      monthGroup = { monthIndex: date.m - 1, items: [] };
      yearGroup.months.push(monthGroup);
    }
    monthGroup.items.push({ index, dateIso: toIso(date) });
  }
  return out;
}

// Kalender-Belegung eines Tages-Bereichs (beide Grenzen einschließlich):
// Map ISO-Tag -> [{ index, kind }] mit kind 'single' | 'start' | 'mid' |
// 'end' (Zeitspannen als Balken über die Tage, Referenz-Verhalten).
function calendarDayMap(entries, indices, fromIso, toIso_) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso_);
  const map = new Map();
  if (!from || !to) return map;
  const rangeDays = daysBetweenParts(from, to);
  if (rangeDays < 0) return map;
  for (const index of indices || []) {
    const e = entries[index];
    const date = e ? parseIsoDate(e.date) : null;
    if (!date) continue;
    const end = e.end ? parseIsoDate(e.end) : null;
    const startIso = toIso(date);
    const endIso = end && daysBetweenParts(date, end) >= 0 ? toIso(end) : startIso;
    for (let k = 0; k <= rangeDays; k++) {
      const dayIso = addDaysIso(fromIso, k);
      if (dayIso < startIso || dayIso > endIso) continue;
      const kind =
        startIso === endIso
          ? 'single'
          : dayIso === startIso
            ? 'start'
            : dayIso === endIso
              ? 'end'
              : 'mid';
      if (!map.has(dayIso)) map.set(dayIso, []);
      map.get(dayIso).push({ index, kind });
    }
  }
  return map;
}

// --- Gantt-Ansicht (4T-0722) -----------------------------------------------------------
// Die Darstellung (perspective-events.js) rechnet selbst nichts, sie setzt
// nur die hier gelieferten Prozent-Werte; damit bleibt die Mathematik ohne
// DOM testbar (die Pipeline läuft im Preload-Kontext und kann nichts messen).

// Gliederungs-Schwellen der Zeitachse in Tagen (PO-Entscheidung
// 2026-07-27: automatische Wahl aus der Spanne, keine Zoom-Bedienung).
const GANTT_DAY_LIMIT = 62;
const GANTT_WEEK_LIMIT = 730;

// Ober-Grenze der Gitter-Marken: längere Achsen werden ausgedünnt, statt
// eine Marke je Einheit zu setzen (sonst trüge eine Jahrzehnt-Spanne
// hunderte Beschriftungen). Die Zahl ist an der Beschriftung bemessen und
// nicht am Gitter: bei mehr Marken schrumpft die Spalte unter die Breite
// eines Datums wie «Okt. 23», und die Achse zeigt nur noch Bruchstücke.
// Die Balken-Rechnung hängt nicht am Gitter.
const GANTT_MAX_TICKS = 16;

// Zeilen der Gantt-Ansicht in Achsen-Reihenfolge (Start aufsteigend, dann
// Modell-Index). Einträge ohne gültigen Zeitpunkt entfallen wie in der
// Timeline — sie leben in der Tabelle.
//
// kind 'bar' bei gültigem Endzeitpunkt ab dem Start, sonst 'point'
// (Raute): ein Ein-Tages-Balken wäre bei Wochen- und Monats-Gliederung
// unsichtbar (PO-Entscheidung 2026-07-27). Ein wiederkehrender Eintrag mit
// zurückliegendem Zeitpunkt wandert auf sein nächstes Vorkommen
// (Dashboard-Semantik, PO-Entscheidung 2026-07-27); ein vorhandener
// Endzeitpunkt wandert um dieselbe Jahres-Zahl mit, damit die Dauer
// erhalten bleibt. shifted meldet die Verschiebung für die Markierung.
function ganttRows(entries, indices, todayIso) {
  const today = parseIsoDate(todayIso);
  const rows = [];
  for (const index of indices || []) {
    const e = entries[index];
    const date = e ? parseIsoDate(e.date) : null;
    if (!date) continue;
    let start = date;
    let end = e.end ? parseIsoDate(e.end) : null;
    // Ende vor Beginn ist ein weicher Wert-Hinweis der Tabelle; hier wird
    // der Eintrag zum Punkt, statt einen Balken rückwärts zu zeichnen.
    if (end && daysBetweenParts(start, end) < 0) end = null;
    let shifted = false;
    let years = 0;
    if (e.recurring && today && daysBetweenParts(start, today) > 0) {
      const occ = nextOccurrence(e.date, todayIso);
      const occParts = occ ? parseIsoDate(occ.dateIso) : null;
      if (occParts) {
        years = occ.years;
        start = occParts;
        if (end && years > 0) end = addMonthsClamped(end, years * 12);
        shifted = years > 0;
      }
    }
    rows.push({
      index,
      startIso: toIso(start),
      endIso: end ? toIso(end) : null,
      kind: end ? 'bar' : 'point',
      shifted,
      years,
    });
  }
  rows.sort((a, b) => {
    if (a.startIso !== b.startIso) return a.startIso < b.startIso ? -1 : 1;
    return a.index - b.index;
  });
  return rows;
}

// Gitter-Marken der Achse: lückenlose Abschnitte von fromParts bis
// toParts, ausgedünnt auf höchstens GANTT_MAX_TICKS Stück. Jede Marke
// trägt ihren ersten und letzten Tag, die Beschriftung setzt die
// Darstellung (Intl).
function ganttTicks(unit, fromParts, toParts) {
  const starts = [];
  let cur = fromParts;
  let guard = 0;
  while (cur && utcMs(cur) <= utcMs(toParts) && guard++ < 5000) {
    starts.push(cur);
    cur =
      unit === 'month'
        ? addMonthsClamped(cur, 1)
        : parseIsoDate(addDaysIso(toIso(cur), unit === 'week' ? 7 : 1));
  }
  const step = starts.length <= GANTT_MAX_TICKS ? 1 : Math.ceil(starts.length / GANTT_MAX_TICKS);
  const out = [];
  for (let i = 0; i < starts.length; i += step) {
    const next = i + step;
    const end = next < starts.length ? parseIsoDate(addDaysIso(toIso(starts[next]), -1)) : toParts;
    out.push({ iso: toIso(starts[i]), endIso: toIso(end || toParts) });
  }
  return out;
}

// Zeitachse über die Zeilen: Spanne vom frühesten Start bis zum spätesten
// Ende (Endtag eingeschlossen), Einheit aus der Spannen-Länge, Grenzen auf
// Wochen- bzw. Monats-Raster gerundet. Leere Zeilen-Menge -> null.
function ganttAxis(rows) {
  let min = null;
  let max = null;
  for (const row of rows || []) {
    const start = parseIsoDate(row.startIso);
    if (!start) continue;
    const end = row.endIso ? parseIsoDate(row.endIso) : start;
    if (!min || utcMs(start) < utcMs(min)) min = start;
    const last = end && utcMs(end) > utcMs(start) ? end : start;
    if (!max || utcMs(last) > utcMs(max)) max = last;
  }
  if (!min || !max) return null;
  const rawDays = daysBetweenParts(min, max) + 1;
  const unit = rawDays <= GANTT_DAY_LIMIT ? 'day' : rawDays <= GANTT_WEEK_LIMIT ? 'week' : 'month';
  let from = min;
  let to = max;
  if (unit === 'week') {
    from = mondayOfParts(min) || min;
    const monday = mondayOfParts(max) || max;
    to = parseIsoDate(addDaysIso(toIso(monday), 6)) || max;
  } else if (unit === 'month') {
    from = { y: min.y, m: min.m, d: 1 };
    to = { y: max.y, m: max.m, d: daysInMonth(max.y, max.m) };
  }
  return {
    unit,
    fromIso: toIso(from),
    toIso: toIso(to),
    totalDays: daysBetweenParts(from, to) + 1,
    ticks: ganttTicks(unit, from, to),
  };
}

// Prozent-Position und -Breite eines Abschnitts auf der Achse; der Endtag
// zählt mit (Kalender-Semantik: ein Ereignis belegt seinen Endtag ganz).
// Ohne Endzeitpunkt ist der Abschnitt der Starttag selbst. Werte auf vier
// Nachkommastellen gerundet, damit das erzeugte HTML stabil bleibt.
function ganttOffsets(axis, startIso, endIso) {
  const from = axis ? parseIsoDate(axis.fromIso) : null;
  const start = parseIsoDate(startIso);
  if (!from || !start || !axis || !(axis.totalDays > 0)) return null;
  const end = endIso ? parseIsoDate(endIso) : start;
  const total = axis.totalDays;
  const rawStart = daysBetweenParts(from, start);
  const rawEnd = daysBetweenParts(from, end && utcMs(end) >= utcMs(start) ? end : start) + 1;
  const left = Math.max(0, Math.min(total, rawStart));
  const right = Math.max(left, Math.min(total, rawEnd));
  const round = (v) => Math.round(v * 10000) / 10000;
  return { leftPct: round((left / total) * 100), widthPct: round(((right - left) / total) * 100) };
}

module.exports = {
  // Sortierung und Filter (4T-0513)
  EVENT_SORT_KEYS,
  EVENT_DATE_PRESETS,
  sortEventIndices,
  datePresetRange,
  matchesEventFilter,
  filterEventIndices,
  eventFilterActiveCount,
  // Ansichts-Datenaufbereitung (4T-0514)
  upcomingEventOccurrences,
  upcomingEventMilestones,
  categoryCounts,
  timelineGroups,
  calendarDayMap,
  // Gantt-Ansicht (4T-0722)
  GANTT_DAY_LIMIT,
  GANTT_WEEK_LIMIT,
  GANTT_MAX_TICKS,
  ganttRows,
  ganttAxis,
  ganttOffsets,
};
