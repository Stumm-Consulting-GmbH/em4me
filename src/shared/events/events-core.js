// 4T-000511 (Epic 3E-000092): Ereignisse — internes Profil, Rechen-Kern und
// Verknüpfungen.
//
// Prozess-neutraler Kern der Ereignis-Funktion (kein Electron, kein DOM;
// Main, Preload und Renderer laden dasselbe Modul):
//
// 1. Definition des festen internen Eigenschafts-Profils „Ereignis" im
//    Feld-Format der Profil-Auflösung (property-profiles.js). Die
//    Einspeisung in profiles:resolve/profiles:list liegt in 4T-000517.
// 2. Rechen-Kern: Zeitdifferenz-Staffelung in vier Stufen, Meilenstein-
//    Regeln, nächstes Jahres-Vorkommen, Spannen-Differenz. Alle Funktionen
//    sind rein und nehmen den Stichtag als Parameter (Determinismus,
//    Testbarkeit); Datums-Werte sind ISO-Strings (JJJJ-MM-TT), die
//    Arithmetik läuft über Date.UTC (keine DST-Sprünge).
// 3. Verknüpfungen: Vorgänger/Nachfolger-Beziehungen mit bidirektionaler
//    Pflege samt Kennungs-Vergabe.
//
// 4T-000984 (Epic 3E-000196): Ordner `src/shared/events/`. Neben dem Kern
// liegen `events-fence.js` (Fence-Datenformat, weiche Validierung,
// Fence-Suche im Dokument-Text) und `events-views.js` (Sortierung und
// Filter, Ansichts-Aufbereitung, Gantt). Beide laden den Kern, der Kern
// keines von beiden; die Import-Richtung bleibt einseitig und der Ordner
// zyklenfrei. Deshalb sind die Datums-Bausteine `toIso`, `utcMs`,
// `daysInMonth` und `daysBetweenParts` exportiert: die Schwester-Module
// rechnen damit, statt eine zweite Fassung zu führen.
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
// 4T-000511) und deckt beide Themes mit ausreichendem Kontrast ab.
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

// Katalog-förmiger Profil-Eintrag für die Einspeisung (4T-000517). `internal`
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

// 4T-000517: Einspeisung — stellt das interne Profil vor die Katalog-Profile
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

// Datums-Verschiebung in Tagen (ISO -> ISO; ungültige Eingabe -> '').
function addDaysIso(iso, days) {
  const parts = parseIsoDate(iso);
  if (!parts) return '';
  const d = new Date(utcMs(parts) + days * DAY_MS);
  return toIso({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
}

// Montag der Woche, in der parts liegt (Wochenstart wie im Journal- und
// Ereignis-Kalender).
function mondayOfParts(parts) {
  const weekday = (new Date(utcMs(parts)).getUTCDay() + 6) % 7;
  return parseIsoDate(addDaysIso(toIso(parts), -weekday));
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

// --- Verknüpfungen (4T-000516) -----------------------------------------------------------
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
  addDaysIso,
  eventDiff,
  spanDiff,
  JUBILEE_YEARS,
  eventMilestones,
  nextOccurrence,
  // 4T-000984: Datums-Bausteine fuer die Schwester-Module des Ordners
  // (Formatierung, UTC-Zeitpunkt, Monatslaenge, Tages-Differenz, Wochen-
  // Anfang) — bewusst exportiert statt dort neu geschrieben.
  toIso,
  utcMs,
  daysInMonth,
  daysBetweenParts,
  mondayOfParts,
  // Verknüpfungen (4T-000516)
  nextEventId,
  eventIndexById,
  toggleEventLink,
  cleanupEventLinks,
  eventLinksOf,
};
