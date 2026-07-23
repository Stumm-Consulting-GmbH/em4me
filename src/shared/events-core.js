// 4T-0511 (Epic 3E-0092): Ereignisse — internes Profil, Rechen-Kern und
// Fence-Datenformat.
//
// Prozess-neutraler Kern der Ereignis-Funktion (kein Electron, kein DOM;
// Main, Preload und Renderer laden dasselbe Modul):
//
// 1. Definition des festen internen Eigenschafts-Profils „Ereignis" im
//    Feld-Format der Profil-Auflösung (property-profiles.js). Die
//    Einspeisung in profiles:resolve/profiles:list liegt in 4T-0517.
// 2. Rechen-Kern: Zeitdifferenz-Staffelung in vier Stufen, Meilenstein-
//    Regeln, nächstes Jahres-Vorkommen, Spannen-Differenz. Alle Funktionen
//    sind rein und nehmen den Stichtag als Parameter (Determinismus,
//    Testbarkeit); Datums-Werte sind ISO-Strings (JJJJ-MM-TT), die
//    Arithmetik läuft über Date.UTC (keine DST-Sprünge).
// 3. Fence-Datenformat des `perspective-events`-Fence (Format-
//    Konkretisierung PO 2026-07-15): Direktiven-Zeilen am Fence-Anfang
//    (`view:`, `filter:`, `query:`), danach Datenzeilen im Pipe-Format
//    mit fester Spalten-Folge. Eine `query:`-Direktive kennzeichnet die
//    Aggregations-Art (Art 2); `query:` und Datenzeilen im selben Fence
//    sind ein Struktur-Fehler. parse → serialize → parse ist bei
//    fehlerfreier Struktur modell-identisch (Grundlage des Rückschreibens,
//    Muster perspective-datatable.js).
//
// Fehler-Semantik wie die Datatable: Struktur-Fehler landen in
// model.errors (blockieren später den Editor, nie ein Wurf); Wert-Probleme
// einzelner Einträge sind weiche Hinweise (validateEventEntries) — der
// Eintrag bleibt erhalten und sichtbar.
'use strict';

// --- Internes Profil ---------------------------------------------------------------

// Profil-Name auf Daten-Ebene (Zuordnungs-Feld im Frontmatter, z. B.
// `class: Ereignis`). Bewusst fest und nicht lokalisiert, damit Dokumente
// sprachunabhängig portabel bleiben (Plan-Konkretisierung PO 2026-07-15).
const EVENT_PROFILE_NAME = 'Ereignis';

// Feldnamen des Profils (Frontmatter-Schlüssel der Art 2 und Spalten der
// Art 1, Workshop-Punkte 1 und 6).
const EVENT_FIELDS = {
  date: 'event-date',
  end: 'event-end',
  text: 'event-text',
  category: 'event-category',
  notes: 'event-notes',
  recurring: 'event-recurring',
  predecessors: 'event-predecessors',
  successors: 'event-successors',
};

// Die acht festen Kategorie-Werte der Referenz (technische Werte deutsch,
// Anzeige-Labels lokalisiert über i18n — PO-Festlegung 2026-07-15).
const EVENT_CATEGORIES = [
  'geburtstag',
  'todestag',
  'jahrestag',
  'jubilaeum',
  'projekt',
  'termin',
  'erinnerung',
  'sonstiges',
];

// Feste Farbzuordnung der Kategorie-Badges (hell/dunkel). Die Referenz-
// Analyse verlangt eine feste Zuordnung, nennt aber keine konkreten Werte —
// die Palette ist eine Design-Entscheidung dieses Epics (dokumentiert in
// 4T-0511) und deckt beide Themes mit ausreichendem Kontrast ab.
const EVENT_CATEGORY_COLORS = {
  geburtstag: { light: { bg: '#e8f5e9', fg: '#1b5e20' }, dark: { bg: '#1e3a22', fg: '#a5d6a7' } },
  todestag: { light: { bg: '#eceff1', fg: '#37474f' }, dark: { bg: '#2e3438', fg: '#b0bec5' } },
  jahrestag: { light: { bg: '#e3f2fd', fg: '#0d47a1' }, dark: { bg: '#1a2c42', fg: '#90caf9' } },
  jubilaeum: { light: { bg: '#f3e5f5', fg: '#6a1b9a' }, dark: { bg: '#332038', fg: '#ce93d8' } },
  projekt: { light: { bg: '#fff3e0', fg: '#e65100' }, dark: { bg: '#3d2c17', fg: '#ffcc80' } },
  termin: { light: { bg: '#e0f2f1', fg: '#00695c' }, dark: { bg: '#15332f', fg: '#80cbc4' } },
  erinnerung: { light: { bg: '#fffde7', fg: '#8d6e0a' }, dark: { bg: '#3a3413', fg: '#fff59d' } },
  sonstiges: { light: { bg: '#f5f5f5', fg: '#616161' }, dark: { bg: '#303030', fg: '#bdbdbd' } },
};

// Feld-Definitionen im Format der Profil-Auflösung ({ name, type, values,
// multiple, default }, property-profiles.js). Pflicht-Semantik (event-date,
// event-text in Art 1) ist UI-Verhalten der Ereignis-Oberfläche, kein
// Profil-Mechanismus — die Profil-Maschinerie kennt keine Pflichtfelder.
function eventProfileFields() {
  return [
    { name: EVENT_FIELDS.date, type: 'date', values: null, multiple: false, default: null },
    { name: EVENT_FIELDS.end, type: 'date', values: null, multiple: false, default: null },
    { name: EVENT_FIELDS.text, type: 'string', values: null, multiple: false, default: null },
    {
      name: EVENT_FIELDS.category,
      type: 'string',
      values: [...EVENT_CATEGORIES],
      multiple: false,
      default: null,
    },
    { name: EVENT_FIELDS.notes, type: 'multiline', values: null, multiple: false, default: null },
    {
      name: EVENT_FIELDS.recurring,
      type: 'boolean',
      values: null,
      multiple: false,
      default: null,
    },
    {
      name: EVENT_FIELDS.predecessors,
      type: 'multistring',
      values: null,
      multiple: false,
      default: null,
    },
    {
      name: EVENT_FIELDS.successors,
      type: 'multistring',
      values: null,
      multiple: false,
      default: null,
    },
  ];
}

// Katalog-förmiger Profil-Eintrag für die Einspeisung (4T-0517). `internal`
// kennzeichnet das Profil als nicht änderbar/nicht löschbar; `fileName`
// bleibt null (keine Datei dahinter).
function eventProfile() {
  return {
    name: EVENT_PROFILE_NAME,
    fileName: null,
    internal: true,
    fields: eventProfileFields(),
    errors: [],
  };
}

// 4T-0517: Einspeisung — stellt das interne Profil vor die Katalog-Profile
// (Vorrang bei Namens-Kollision über die Konflikt-Regeln der Auflösung).
// Das Gating (Erweiterung `events` aktiv?) liefert der Aufrufer, damit der
// Baustein als reine Funktion testbar bleibt.
function injectEventProfile(profiles, eventsEnabled) {
  const list = Array.isArray(profiles) ? profiles : [];
  return eventsEnabled ? [eventProfile(), ...list] : list;
}

// --- Datums-Arithmetik -------------------------------------------------------------

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ISO-String -> { y, m, d } oder null; prüft echte Kalender-Gültigkeit
// (2026-02-30 ist ungültig, Schaltjahres-Regel inklusive).
function parseIsoDate(s) {
  const m = ISO_DATE_RE.exec(String(s == null ? '' : s).trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toIso(parts) {
  const mm = String(parts.m).padStart(2, '0');
  const dd = String(parts.d).padStart(2, '0');
  return `${parts.y}-${mm}-${dd}`;
}

function utcMs(parts) {
  return Date.UTC(parts.y, parts.m - 1, parts.d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Tages-Differenz b - a (ganzzahlig; beide Argumente { y, m, d }).
function daysBetweenParts(a, b) {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

// Monats-Addition mit Monatsende-Klemmung: 2026-01-31 + 1 Monat ->
// 2026-02-28 (bzw. -02-29 im Schaltjahr). Grundlage der kalender-genauen
// Monats-/Jahres-Staffelung und der Jahres-Wiederkehr.
function addMonthsClamped(parts, months) {
  const total = parts.y * 12 + (parts.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(parts.d, daysInMonth(y, m));
  return { y, m, d };
}

// --- Staffelung und Meilensteine ----------------------------------------------------

// Zerlegung der Differenz from -> to (from <= to) in die vier Staffelungen
// der Referenz. Monate/Jahre kalender-genau: totalMonths ist die größte
// Monats-Anzahl, deren geklemmte Addition to nicht überschreitet; der Rest
// wird in Wochen + Tage zerlegt.
function breakdownParts(from, to) {
  const totalDays = daysBetweenParts(from, to);
  let totalMonths = (to.y - from.y) * 12 + (to.m - from.m);
  if (totalMonths > 0 && daysBetweenParts(addMonthsClamped(from, totalMonths), to) < 0) {
    totalMonths -= 1;
  }
  if (totalMonths < 0) totalMonths = 0;
  const restDays = daysBetweenParts(addMonthsClamped(from, totalMonths), to);
  return {
    totalDays,
    totalMonths,
    restDays,
    tiers: {
      days: { days: totalDays },
      weeks: { weeks: Math.floor(totalDays / 7), days: totalDays % 7 },
      months: {
        months: totalMonths,
        weeks: Math.floor(restDays / 7),
        days: restDays % 7,
      },
      years: {
        years: Math.floor(totalMonths / 12),
        months: totalMonths % 12,
        weeks: Math.floor(restDays / 7),
        days: restDays % 7,
      },
    },
  };
}

// Zeitdifferenz eines Ereignis-Zeitpunkts zum Stichtag. direction 'past'
// (Zeitpunkt liegt zurück), 'future' (steht bevor) oder 'today'; die
// Staffelungen sind Absolut-Werte, signedDays trägt das Vorzeichen
// (negativ = zukünftig).
function eventDiff(dateIso, todayIso) {
  const date = parseIsoDate(dateIso);
  const today = parseIsoDate(todayIso);
  if (!date || !today) return { valid: false };
  const signedDays = daysBetweenParts(date, today);
  const direction = signedDays > 0 ? 'past' : signedDays < 0 ? 'future' : 'today';
  const ordered = signedDays >= 0 ? breakdownParts(date, today) : breakdownParts(today, date);
  return { valid: true, direction, signedDays, ...ordered };
}

// Spannen-Differenz zwischen Zeitpunkt und Endzeitpunkt (Absolut-Zerlegung;
// invalidOrder meldet Ende vor Beginn als weichen Hinweis-Grund).
function spanDiff(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return { valid: false };
  const signedDays = daysBetweenParts(start, end);
  const ordered = signedDays >= 0 ? breakdownParts(start, end) : breakdownParts(end, start);
  return { valid: true, invalidOrder: signedDays < 0, signedDays, ...ordered };
}

// Jubiläums-Jahre der Referenz (exakte Liste, keine Fortschreibung >100).
const JUBILEE_YEARS = [10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100];

// Meilenstein-Erkennung auf der aktuellen Differenz (richtungs-neutral,
// die Darstellung entscheidet über die Formulierung): Tage-Vielfache von
// 1000, exakte Wochen-Vielfache von 100 (= 700 Tage), Monats-Vielfache von
// 100 auf Monats-Grenze, volle Jahre auf Jahres-Grenze, Jubiläums-Jahre.
function eventMilestones(dateIso, todayIso) {
  const diff = eventDiff(dateIso, todayIso);
  if (!diff.valid || diff.totalDays <= 0) return [];
  const out = [];
  if (diff.totalDays % 1000 === 0) out.push({ kind: 'days', value: diff.totalDays });
  if (diff.totalDays % 700 === 0) out.push({ kind: 'weeks', value: diff.totalDays / 7 });
  const onMonthBoundary = diff.restDays === 0 && diff.totalMonths > 0;
  if (onMonthBoundary && diff.totalMonths % 100 === 0) {
    out.push({ kind: 'months', value: diff.totalMonths });
  }
  if (onMonthBoundary && diff.totalMonths % 12 === 0) {
    const years = diff.totalMonths / 12;
    out.push({ kind: 'years', value: years });
    if (JUBILEE_YEARS.includes(years)) out.push({ kind: 'jubilee', value: years });
  }
  return out;
}

// Nächstes jährliches Vorkommen eines wiederkehrenden Ereignisses ab dem
// Stichtag (einschließlich; am Jahrestag selbst ist inDays 0). Der 29.
// Februar fällt in Nicht-Schaltjahren auf den 28. (Klemmung). Liegt der
// Zeitpunkt in der Zukunft, ist er selbst das nächste Vorkommen. years =
// Jahres-Zahl des Vorkommens seit dem Ursprung (Countdown-Beschriftung).
function nextOccurrence(dateIso, todayIso) {
  const date = parseIsoDate(dateIso);
  const today = parseIsoDate(todayIso);
  if (!date || !today) return null;
  if (daysBetweenParts(date, today) <= 0) {
    return { dateIso: toIso(date), inDays: daysBetweenParts(today, date), years: 0 };
  }
  let years = today.y - date.y;
  let occ = addMonthsClamped(date, years * 12);
  if (daysBetweenParts(today, occ) < 0) {
    years += 1;
    occ = addMonthsClamped(date, years * 12);
  }
  return { dateIso: toIso(occ), inDays: daysBetweenParts(today, occ), years };
}

// --- Sortierung und Filter (4T-0513) --------------------------------------------------
// Reine Ansichts-Funktionen über den geparsten Einträgen; die Oberfläche
// (events-editor.js), die Zusatz-Ansichten (4T-0514) und die Aggregation
// (4T-0515) arbeiten auf derselben Logik.

const EVENT_SORT_KEYS = ['date', 'end', 'text', 'category'];

// Datums-Verschiebung in Tagen (ISO -> ISO; ungültige Eingabe -> '').
function addDaysIso(iso, days) {
  const parts = parseIsoDate(iso);
  if (!parts) return '';
  const d = new Date(utcMs(parts) + days * DAY_MS);
  return toIso({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
}

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

// --- Verknüpfungen (4T-0516) -----------------------------------------------------------
// Vorgänger/Nachfolger-Beziehungen mit bidirektionaler Pflege (Workshop-
// Punkt 6). Art 1 verknüpft über kurze technische Kennungen im Fence
// (vergeben erst bei der ersten Verknüpfung — Kennungs-Kompromiss); Art 2
// nutzt dieselbe Logik über logische Datei-Namen. Reine Funktionen über
// { id, predecessors, successors }-tragenden Einträgen.

// Nächste freie Kennung (e1, e2, …) — deterministisch aus dem Bestand.
function nextEventId(entries) {
  const taken = new Set((entries || []).map((e) => e.id).filter(Boolean));
  let n = 1;
  while (taken.has(`e${n}`)) n++;
  return `e${n}`;
}

function eventIndexById(entries, id) {
  if (!id) return -1;
  return (entries || []).findIndex((e) => e.id === id);
}

function addToList(list, value) {
  if (!list.includes(value)) list.push(value);
}

function removeFromList(list, value) {
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
}

// Verknüpfung setzen bzw. lösen (Toggle): kind 'predecessor' macht other
// zum Vorgänger von entry (und entry zum Nachfolger von other), kind
// 'successor' umgekehrt. Beide Seiten werden im selben Aufruf gepflegt;
// fehlende Kennungen entstehen hier (Art 1). Liefert true bei Änderung.
function toggleEventLink(entries, idx, otherIdx, kind) {
  const entry = entries[idx];
  const other = entries[otherIdx];
  if (!entry || !other || idx === otherIdx) return false;
  if (!entry.id) entry.id = nextEventId(entries);
  if (!other.id) other.id = nextEventId(entries);
  const mine = kind === 'predecessor' ? entry.predecessors : entry.successors;
  const theirs = kind === 'predecessor' ? other.successors : other.predecessors;
  if (mine.includes(other.id)) {
    removeFromList(mine, other.id);
    removeFromList(theirs, entry.id);
  } else {
    addToList(mine, other.id);
    addToList(theirs, entry.id);
  }
  return true;
}

// Bereinigung beim Löschen: alle Bezüge auf die entfernte Kennung
// verschwinden aus beiden Listen der übrigen Einträge (Workshop-Punkt 6).
function cleanupEventLinks(entries, removedId) {
  if (!removedId) return;
  for (const e of entries || []) {
    removeFromList(e.predecessors, removedId);
    removeFromList(e.successors, removedId);
  }
}

// Verknüpfungs-Sicht eines Eintrags für die Anzeige: aufgelöste Bezüge
// (label = Ereignis-Text bzw. Kennung) plus verwaiste Kennungen (weicher
// Hinweis, z. B. nach Hand-Edits im Quelltext).
function eventLinksOf(entries, idx) {
  const entry = entries[idx];
  const out = { predecessors: [], successors: [] };
  if (!entry) return out;
  const resolve = (id) => {
    const target = eventIndexById(entries, id);
    return {
      id,
      index: target,
      label: target >= 0 ? entries[target].text || entries[target].date || id : id,
      broken: target < 0,
    };
  };
  out.predecessors = (entry.predecessors || []).map(resolve);
  out.successors = (entry.successors || []).map(resolve);
  return out;
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

// --- Fence-Datenformat ---------------------------------------------------------------

// Ansichts-Werte des `view:`-Parameters (Workshop-Punkt 7).
const EVENT_VIEWS = ['table', 'dashboard', 'month', 'week', 'timeline'];

// Spalten-Folge der Datenzeilen (Format-Konkretisierung PO 2026-07-15).
// Kennung/Vorgänger/Nachfolger bleiben leer, bis 4T-0516 die erste
// Verknüpfung schreibt.
const ENTRY_CELL_COUNT = 9;

// Zell-Escapes: `\\` Backslash, `\|` Pipe, `\n` Zeilenumbruch (Notizen sind
// mehrzeilig). Anders als die Datatable escapen wir auch den Backslash
// selbst — sonst wäre ein Zelltext, der literal auf "\" vor "|" endet,
// nicht verlustfrei abbildbar.
function escapeCell(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '\\n');
}

// Pipe-Zeile -> un-escapte Zell-Rohtexte (ein Durchlauf; führende und
// schließende Pipe sind Rahmen, fehlende schließende Pipe liest tolerant —
// Muster splitPipeRow der Datatable).
function splitEventRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') {
      const next = line[i + 1];
      if (next === '\\') {
        cur += '\\';
        i++;
        continue;
      }
      if (next === '|') {
        cur += '|';
        i++;
        continue;
      }
      if (next === 'n') {
        cur += '\n';
        i++;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

// Kennungs-Listen (Vorgänger/Nachfolger) sind kommagetrennt.
function parseIdList(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// Gespeicherter Filter: `filter: Name := key=value; key=value`. Werte
// escapen `;` als `\;`. Schlüssel: text, categories (kommagetrennt,
// `none` = ohne Kategorie), from, to sowie die Flags notes, recurring,
// timespan (`x` = an). Struktur aus 4T-0490 Punkt 3 / Referenz-Analyse §4.
const FILTER_FLAG_KEYS = new Set(['notes', 'recurring', 'timespan']);
const FILTER_VALUE_KEYS = new Set(['text', 'categories', 'from', 'to']);

function emptyFilterSpec() {
  return {
    text: '',
    categories: [],
    from: '',
    to: '',
    notes: false,
    recurring: false,
    timespan: false,
  };
}

function splitFilterSpec(text) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === ';') {
      cur += ';';
      i++;
      continue;
    }
    if (ch === ';') {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function parseFilterDirective(rest, line, errors) {
  const sepIdx = rest.indexOf(':=');
  if (sepIdx < 0) {
    errors.push({ code: 'badFilter', line, detail: rest });
    return null;
  }
  const name = rest.slice(0, sepIdx).trim();
  if (name === '') {
    errors.push({ code: 'badFilter', line, detail: rest });
    return null;
  }
  const spec = emptyFilterSpec();
  for (const part of splitFilterSpec(rest.slice(sepIdx + 2))) {
    const eqIdx = part.indexOf('=');
    const key = (eqIdx >= 0 ? part.slice(0, eqIdx) : part).trim();
    const value = eqIdx >= 0 ? part.slice(eqIdx + 1).trim() : '';
    if (FILTER_FLAG_KEYS.has(key)) {
      spec[key] = value === '' || value === 'x';
      continue;
    }
    if (!FILTER_VALUE_KEYS.has(key)) {
      errors.push({ code: 'badFilter', line, detail: part });
      return null;
    }
    if (key === 'categories') spec.categories = parseIdList(value);
    else spec[key] = value;
  }
  return { name, spec };
}

function serializeFilterValue(value) {
  return String(value == null ? '' : value).replace(/;/g, '\\;');
}

function serializeFilterDirective(filter) {
  const spec = filter.spec || emptyFilterSpec();
  const parts = [];
  if (spec.text) parts.push(`text=${serializeFilterValue(spec.text)}`);
  if (spec.categories && spec.categories.length > 0) {
    parts.push(`categories=${spec.categories.join(',')}`);
  }
  if (spec.from) parts.push(`from=${serializeFilterValue(spec.from)}`);
  if (spec.to) parts.push(`to=${serializeFilterValue(spec.to)}`);
  if (spec.notes) parts.push('notes=x');
  if (spec.recurring) parts.push('recurring=x');
  if (spec.timespan) parts.push('timespan=x');
  return `filter: ${filter.name} := ${parts.join('; ')}`;
}

// Direktiven-Erkennung (Muster Datatable): `wort: rest` am Zeilenanfang.
const DIRECTIVE_RE = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/;

// Fence-Body -> Datenmodell { view, savedFilters, query, entries, errors }.
// view trägt den Roh-Wert (auch unbekannte Werte bleiben erhalten —
// Verlustfreiheit; effectiveEventsView liefert die wirksame Ansicht),
// query ist null (Art 1) oder der Abfrage-Text (Art 2, auch leer: alle
// Bereichs-Dateien mit Ereignis-Profil). Wirft nie.
function parsePerspectiveEvents(content) {
  const model = { view: null, savedFilters: [], query: null, entries: [], errors: [] };
  const lines = String(content || '').split(/\r?\n/);
  let sawQueryLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;
    if (trimmed === '') continue;
    if (trimmed.startsWith('|')) {
      const cells = splitEventRow(trimmed);
      if (cells.length > ENTRY_CELL_COUNT) {
        model.errors.push({ code: 'tooManyCells', line: lineNo, detail: trimmed });
        continue;
      }
      const get = (idx) => (idx < cells.length ? cells[idx] : '');
      model.entries.push({
        date: get(0),
        end: get(1),
        text: get(2),
        category: get(3),
        notes: get(4),
        recurring: get(5) !== '',
        id: get(6) || null,
        predecessors: parseIdList(get(7)),
        successors: parseIdList(get(8)),
        line: lineNo,
      });
      continue;
    }
    const dm = DIRECTIVE_RE.exec(trimmed);
    if (!dm) {
      model.errors.push({ code: 'badLine', line: lineNo, detail: trimmed });
      continue;
    }
    const directive = dm[1].toLowerCase();
    const rest = dm[2];
    if (directive === 'view') {
      if (model.view !== null) {
        model.errors.push({ code: 'duplicateDirective', line: lineNo, detail: directive });
        continue;
      }
      model.view = rest.trim();
      continue;
    }
    if (directive === 'filter') {
      const parsed = parseFilterDirective(rest, lineNo, model.errors);
      if (parsed) model.savedFilters.push(parsed);
      continue;
    }
    if (directive === 'query') {
      if (model.query !== null) {
        model.errors.push({ code: 'duplicateDirective', line: lineNo, detail: directive });
        continue;
      }
      model.query = rest.trim();
      sawQueryLine = lineNo;
      continue;
    }
    model.errors.push({ code: 'unknownDirective', line: lineNo, detail: directive });
  }
  // Art-Grenze: Abfrage und eingebettete Einträge schließen sich aus
  // (PO-Format-Konkretisierung 2026-07-15).
  if (model.query !== null && model.entries.length > 0) {
    model.errors.push({ code: 'queryWithEntries', line: sawQueryLine, detail: null });
  }
  return model;
}

// Wirksame Ansicht: bekannter view-Wert oder 'table' (unbekannte Werte
// bleiben im Modell erhalten, wirken aber nicht).
function effectiveEventsView(model) {
  const v = model && typeof model.view === 'string' ? model.view.toLowerCase() : '';
  return EVENT_VIEWS.includes(v) ? v : 'table';
}

// Datenmodell -> kanonischer Fence-Body. Direktiven zuerst (view nur wenn
// gesetzt), dann Datenzeilen mit stabiler Spalten-Ausrichtung (Leerzeichen-
// Padding, Muster Datatable). Grundlage jedes Rückschreibens.
function serializePerspectiveEvents(model) {
  const lines = [];
  if (model.view != null && String(model.view).trim() !== '') {
    lines.push(`view: ${String(model.view).trim()}`);
  }
  for (const filter of model.savedFilters || []) {
    lines.push(serializeFilterDirective(filter));
  }
  if (model.query !== null && model.query !== undefined) {
    lines.push(model.query === '' ? 'query:' : `query: ${model.query}`);
  }
  const rowTexts = (model.entries || []).map((e) => [
    escapeCell(e.date),
    escapeCell(e.end),
    escapeCell(e.text),
    escapeCell(e.category),
    escapeCell(e.notes),
    e.recurring ? 'x' : '',
    escapeCell(e.id == null ? '' : e.id),
    (e.predecessors || []).join(','),
    (e.successors || []).join(','),
  ]);
  const widths = [];
  for (let j = 0; j < ENTRY_CELL_COUNT; j++) {
    let w = 1;
    for (const r of rowTexts) {
      if (r[j].length > w) w = r[j].length;
    }
    widths.push(w);
  }
  for (const r of rowTexts) {
    lines.push(`| ${r.map((c, j) => c.padEnd(widths[j])).join(' | ')} |`);
  }
  return lines.join('\n');
}

// --- Weiche Validierung --------------------------------------------------------------

// Wert-Hinweise pro Eintrag (nie blockierend; Codes für lokalisierte
// Tooltips der Oberfläche): missingDate/invalidDate, invalidEnd,
// endBeforeDate, unknownCategory, missingText.
function validateEventEntries(entries) {
  const hints = [];
  for (const e of entries || []) {
    const date = parseIsoDate(e.date);
    if (String(e.date || '').trim() === '') {
      hints.push({ code: 'missingDate', line: e.line });
    } else if (!date) {
      hints.push({ code: 'invalidDate', line: e.line });
    }
    if (String(e.end || '').trim() !== '') {
      const end = parseIsoDate(e.end);
      if (!end) {
        hints.push({ code: 'invalidEnd', line: e.line });
      } else if (date && daysBetweenParts(date, end) < 0) {
        hints.push({ code: 'endBeforeDate', line: e.line });
      }
    }
    if (String(e.text || '').trim() === '') {
      hints.push({ code: 'missingText', line: e.line });
    }
    const cat = String(e.category || '').trim();
    if (cat !== '' && !EVENT_CATEGORIES.includes(cat)) {
      hints.push({ code: 'unknownCategory', line: e.line });
    }
  }
  return hints;
}

// --- Fence-Suche im Dokument-Text ------------------------------------------------------

// Alle `perspective-events`-Fences eines Dokument-Texts (Zeilennummern
// 1-basiert, body ohne abschließendes Newline) — Grundlage des Editor-
// Rückschreibens. Identische Semantik wie findPerspectiveDatatableFences
// (eingerückte Fences in Listen/Blockquotes bewusst nicht erfasst;
// ungeschlossener Fence läuft bis zum Datei-Ende).
function findPerspectiveEventsFences(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!m) continue;
    const marker = m[1][0];
    const len = m[1].length;
    const info = m[2].trim();
    if (open) {
      if (marker === open.marker && len >= open.len && info === '') {
        if (open.lang === 'perspective-events') {
          result.push({
            openLine: open.openLine,
            closeLine: i + 1,
            bodyStartLine: open.openLine + 1,
            bodyEndLine: i,
            body: lines.slice(open.openLine, i).join('\n'),
          });
        }
        open = null;
      }
      continue;
    }
    if (marker === '`' && info.includes('`')) continue;
    open = { marker, len, lang: info.split(/\s+/)[0], openLine: i + 1 };
  }
  if (open && open.lang === 'perspective-events') {
    result.push({
      openLine: open.openLine,
      closeLine: lines.length + 1,
      bodyStartLine: open.openLine + 1,
      bodyEndLine: lines.length,
      body: lines.slice(open.openLine).join('\n'),
    });
  }
  return result;
}

module.exports = {
  // Profil
  EVENT_PROFILE_NAME,
  EVENT_FIELDS,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_COLORS,
  eventProfileFields,
  eventProfile,
  injectEventProfile,
  // Rechen-Kern
  parseIsoDate,
  addMonthsClamped,
  eventDiff,
  spanDiff,
  JUBILEE_YEARS,
  eventMilestones,
  nextOccurrence,
  // Sortierung und Filter (4T-0513)
  EVENT_SORT_KEYS,
  EVENT_DATE_PRESETS,
  addDaysIso,
  sortEventIndices,
  datePresetRange,
  matchesEventFilter,
  filterEventIndices,
  eventFilterActiveCount,
  emptyFilterSpec,
  // Ansichts-Datenaufbereitung (4T-0514)
  upcomingEventOccurrences,
  upcomingEventMilestones,
  categoryCounts,
  timelineGroups,
  calendarDayMap,
  // Verknüpfungen (4T-0516)
  nextEventId,
  eventIndexById,
  toggleEventLink,
  cleanupEventLinks,
  eventLinksOf,
  // Fence-Datenformat
  EVENT_VIEWS,
  ENTRY_CELL_COUNT,
  parsePerspectiveEvents,
  serializePerspectiveEvents,
  effectiveEventsView,
  validateEventEntries,
  findPerspectiveEventsFences,
};
