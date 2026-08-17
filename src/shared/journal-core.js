// 4T-0431 (Epic 3E-0081): Journal-Modell — Definitions-Schema der
// journals-Sektion der Bereichsdatei und ihre tolerante Normalisierung.
//
// Ein Journal ist eine definierte Serie periodischer Dokumente EINER
// Granularität (Tag, Woche, Monat, Quartal, Jahr); Regale (shelves)
// gruppieren mehrere Journale. Journale existieren nur pro Bereich
// (Architekturentscheidung 2 des Epics): die Konfiguration lebt als
// Sektion `journals` in Area_Settings.mdda, nach dem bestehenden
// Sektions-Muster mit Fehler-Isolation (Vorbild templates-Sektion).
//
// Sektions-Schema:
//   journals: {
//     shelves: [name, …],
//     journals: [{
//       id            stabile Kennung (eindeutig; Persistenz-Schlüssel)
//       name          Anzeige-Name (Default: id)
//       shelf         Regal-Name oder null (kein Regal)
//       granularity   'day' | 'week' | 'month' | 'quarter' | 'year'
//       folderPattern Ordner-Schema relativ zur Bereichs-Wurzel ('' = Wurzel);
//                     Datums-Platzhalter in der Format-Syntax der Vorlagen-
//                     Engine ({{date::…}}, ausgewertet am Perioden-Start)
//       namePattern   Namens-Schema des Eintrags (ohne .md), gleiche Syntax
//       template      Vorlagen-Pfad relativ zum Vorlagen-Ordner oder null
//       startDate     'yyyy-MM-dd' oder null (keine Untergrenze)
//       endDate       'yyyy-MM-dd' oder null (offen)
//       dateProp      Frontmatter-Feldname des Perioden-Datums (Tages-Journale)
//       startProp     Feldname des Perioden-Starts (mehrtägige Perioden)
//       endProp       Feldname des Perioden-Endes (mehrtägige Perioden)
//     }, …]
//   }
//
// Normalisierung ist tolerant nach dem Fehler-Isolations-Muster der
// Bereichsdatei: defekte Einzel-Einträge entfallen (nie ein Wurf), eine
// defekte oder fehlende Sektion wirkt wie nicht konfiguriert (null) und
// setzt nur die Journal-Funktion aus, nicht den Rest des Bereichs.
//
// Prozess-neutral (kein Electron, kein DOM): Main (Datenpfad, Anlage) und
// Renderer (Panel, Einstellungen) laden dasselbe Modul.
//
// 4T-0432 (Epic 3E-0081): Perioden-Kern — Perioden-Arithmetik für die fünf
// Granularitäten fest nach ISO 8601 (Montag-Start, KW mit Donnerstags-Regel;
// Architekturentscheidung 3), Schema-Auflösung der Eintrags-Pfade über die
// Vorlagen-Engine und Eintrags-Ermittlung mit injizierbarem Existenz-Check.
// Zeitpunkte sind Millisekunden lokaler Mitternacht (konsistent zur lokalen
// Formatierung von formatDateMs und zum nowMs-Bezug der Vorlagen-Engine);
// Tages-Arithmetik läuft über den Date-Konstruktor (DST-fest).
'use strict';

const { analyzeTemplate, fillTemplate } = require('./template-engine');
// 4T-0987 (Epic 3E-0196): Format-Kern der Abfrage-Sprache, seit dem Schnitt
// in src/shared/query/query-format.js.
const { formatDateMs, isoWeekOf } = require('./query/query-format.js');
const { extractFrontmatter, writeFrontmatter } = require('./markdown/frontmatter');

// Granularitäten in fachlicher Reihenfolge fein -> grob; die Reihenfolge
// trägt zugleich die "übergeordnete Perioden"-Semantik des Navigations-
// Blocks (gröbere Granularitäten desselben Regals).
const JOURNAL_GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];

// Default-Feldnamen der automatischen Frontmatter-Datums-Properties
// (belegtes Nutzungs-Muster des PO, Referenz-Analyse Journal.md §5).
const DEFAULT_DATE_PROP = 'journal-date';
const DEFAULT_START_PROP = 'journal-start-date';
const DEFAULT_END_PROP = 'journal-end-date';

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// 'yyyy-MM-dd' mit Kalender-Gültigkeit (kein 2026-02-30); sonst null.
function normalizeIsoDate(v) {
  const s = cleanString(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? s : null;
}

// Einzelnes Journal normalisieren. null = Eintrag ist defekt und entfällt
// (Fehler-Isolation pro Eintrag): ohne id, ohne bekannte Granularität oder
// ohne Namens-Schema ist kein Pfad auflösbar.
function normalizeJournal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanString(value.id);
  if (id === '') return null;
  const granularity = cleanString(value.granularity);
  if (!JOURNAL_GRANULARITIES.includes(granularity)) return null;
  const namePattern = cleanString(value.namePattern);
  if (namePattern === '') return null;
  const name = cleanString(value.name) || id;
  const shelf = cleanString(value.shelf) || null;
  const folderPattern = cleanString(value.folderPattern);
  const template = cleanString(value.template) || null;
  const startDate = normalizeIsoDate(value.startDate);
  const endDate = normalizeIsoDate(value.endDate);
  return {
    id,
    name,
    shelf,
    granularity,
    folderPattern,
    namePattern,
    template,
    startDate,
    endDate,
    dateProp: cleanString(value.dateProp) || DEFAULT_DATE_PROP,
    startProp: cleanString(value.startProp) || DEFAULT_START_PROP,
    endProp: cleanString(value.endProp) || DEFAULT_END_PROP,
  };
}

// Normalisiert die journals-Sektion auf { shelves, journals } oder null
// (keine Konfiguration). Regeln: Regal-Namen sind nicht-leere, eindeutige
// Strings; Journal-Einträge werden einzeln normalisiert (defekte entfallen),
// doppelte ids behalten den ersten Eintrag. Ein von einem Journal
// referenziertes, aber nicht deklariertes Regal wird der Regal-Liste
// angefügt (selbstheilend — Panel-Filter und Einstellungs-Liste zeigen
// damit jedes real genutzte Regal).
function normalizeJournalsConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const shelves = [];
  if (Array.isArray(value.shelves)) {
    for (const raw of value.shelves) {
      const name = cleanString(raw);
      if (name !== '' && !shelves.includes(name)) shelves.push(name);
    }
  }
  const journals = [];
  const seenIds = new Set();
  if (Array.isArray(value.journals)) {
    for (const raw of value.journals) {
      const journal = normalizeJournal(raw);
      if (!journal || seenIds.has(journal.id)) continue;
      seenIds.add(journal.id);
      if (journal.shelf && !shelves.includes(journal.shelf)) shelves.push(journal.shelf);
      journals.push(journal);
    }
  }
  if (shelves.length === 0 && journals.length === 0) return null;
  return { shelves, journals };
}

// --- 4T-0432: Perioden-Rechnung -------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Lokale Mitternacht eines Kalender-Tags als ms (Tages-Arithmetik über den
// Date-Konstruktor: Überläufe von Tag/Monat normalisiert er DST-fest selbst).
function dayMs(year, monthIndex, day) {
  return new Date(year, monthIndex, day).getTime();
}

// 'yyyy-MM-dd' -> ms lokaler Mitternacht; null bei ungültigem Wert.
function isoDateToMs(s) {
  const norm = normalizeIsoDate(s);
  if (norm === null) return null;
  const [y, m, d] = norm.split('-').map(Number);
  return dayMs(y, m - 1, d);
}

// ms -> 'yyyy-MM-dd' (lokal).
function msToIsoDate(ms) {
  return formatDateMs(ms, 'yyyy-MM-dd');
}

// Periode einer Granularität um einen Zeitpunkt: { granularity, startMs,
// endMs, key }. startMs/endMs sind lokale Mitternacht des ersten bzw.
// LETZTEN Tags der Periode (inklusives Ende — die Aufrufer arbeiten
// tagesbasiert). key ist der kanonische Perioden-Schlüssel für Identität
// und Anzeige: '2026-07-09' (Tag), '2026-W28' (ISO-KW), '2026-07' (Monat),
// '2026-Q3' (Quartal), '2026' (Jahr).
function periodOf(ms, granularity) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (granularity) {
    case 'day': {
      const start = dayMs(y, m, d.getDate());
      return { granularity, startMs: start, endMs: start, key: msToIsoDate(start) };
    }
    case 'week': {
      const mondayOffset = (d.getDay() + 6) % 7; // 0 = Montag
      const start = dayMs(y, m, d.getDate() - mondayOffset);
      const end = dayMs(y, m, d.getDate() - mondayOffset + 6);
      const { week, year } = isoWeekOf(start);
      return { granularity, startMs: start, endMs: end, key: `${year}-W${pad2(week)}` };
    }
    case 'month':
      return {
        granularity,
        startMs: dayMs(y, m, 1),
        endMs: dayMs(y, m + 1, 0),
        key: `${y}-${pad2(m + 1)}`,
      };
    case 'quarter': {
      const qStart = m - (m % 3);
      return {
        granularity,
        startMs: dayMs(y, qStart, 1),
        endMs: dayMs(y, qStart + 3, 0),
        key: `${y}-Q${qStart / 3 + 1}`,
      };
    }
    case 'year':
      return {
        granularity,
        startMs: dayMs(y, 0, 1),
        endMs: dayMs(y, 11, 31),
        key: String(y),
      };
    default:
      return null;
  }
}

// Periode um n Schritte verschieben (n auch negativ); ohne Grenz-Prüfung.
function addPeriods(period, n) {
  const d = new Date(period.startMs);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (period.granularity) {
    case 'day':
      return periodOf(dayMs(y, m, d.getDate() + n), 'day');
    case 'week':
      return periodOf(dayMs(y, m, d.getDate() + 7 * n), 'week');
    case 'month':
      return periodOf(dayMs(y, m + n, 1), 'month');
    case 'quarter':
      return periodOf(dayMs(y, m + 3 * n, 1), 'quarter');
    case 'year':
      return periodOf(dayMs(y + n, 0, 1), 'year');
    default:
      return null;
  }
}

// Datums-Grenzen eines Journals als ms (null = keine Grenze).
function journalBoundsMs(journal) {
  return {
    minMs: journal && journal.startDate ? isoDateToMs(journal.startDate) : null,
    maxMs: journal && journal.endDate ? isoDateToMs(journal.endDate) : null,
  };
}

// Liegt die Periode (teilweise) im erlaubten Bereich des Journals?
// startDate = "davor keine Einträge", endDate = "danach keine" (Referenz-
// Semantik); eine Periode zählt, sobald sie den erlaubten Bereich berührt.
function periodAllowed(journal, period) {
  const { minMs, maxMs } = journalBoundsMs(journal);
  if (minMs !== null && period.endMs < minMs) return false;
  if (maxMs !== null && period.startMs > maxMs) return false;
  return true;
}

// Nächste/vorige Periode innerhalb der Journal-Grenzen; null am Rand
// (kappt Navigation und Anlage, Task-Vorgabe "Grenzen").
function nextPeriod(journal, period) {
  const next = addPeriods(period, 1);
  return next && periodAllowed(journal, next) ? next : null;
}

function prevPeriod(journal, period) {
  const prev = addPeriods(period, -1);
  return prev && periodAllowed(journal, prev) ? prev : null;
}

// Übergeordnete Perioden: alle gröberen Granularitäten, bestimmt über den
// PERIODEN-START (deterministisch auch für Jahreswechsel-Wochen: die Woche
// 2026-W01 mit Start 2025-12-29 gehört zu Monat 2025-12). Reihenfolge fein
// nach grob; der Navigations-Block (4T-0435) filtert auf die im Regal
// vorhandenen Journale (Lücken werden ausgelassen).
function parentPeriods(period) {
  const idx = JOURNAL_GRANULARITIES.indexOf(period.granularity);
  if (idx < 0) return [];
  return JOURNAL_GRANULARITIES.slice(idx + 1).map((g) => periodOf(period.startMs, g));
}

// --- 4T-0432: Schema-Auflösung ---------------------------------------------------

// Windows-verbotene Zeichen in Datei-/Ordnernamen (plus Steuerzeichen);
// '/' ist im Ordner-Schema als Trenner erlaubt und wird getrennt geprüft.
// eslint-disable-next-line no-control-regex
const INVALID_SEGMENT_CHARS = new RegExp('[<>:"\\\\|?*\\u0000-\\u001f]');

// Wertet ein Schema (folderPattern/namePattern) am Perioden-Start aus.
// Erlaubt sind Literale und Datums-Platzhalter ({{date…}}/{{time…}});
// interaktive Platzhalter, Kontext- und Cursor-Marker sind in Schemata
// sinnlos und werden als Fehler gemeldet (kein stilles Weglassen).
// Liefert { ok: true, text } oder { ok: false, error: { code, … } }.
function evaluatePattern(pattern, period) {
  const analysis = analyzeTemplate(String(pattern == null ? '' : pattern));
  if (!analysis.ok) return analysis;
  for (const seg of analysis.segments) {
    if (seg.type !== 'lit' && seg.type !== 'datetime') {
      return { ok: false, error: { code: 'patternPlaceholder', pos: -1 } };
    }
  }
  return fillTemplate(analysis, { nowMs: period.startMs });
}

// Prüft einen ausgewerteten Pfad-Teil: keine leeren Segmente, keine
// '.'/'..'-Segmente (Bereichs-Grenze!), keine verbotenen Zeichen, kein
// Backslash. Liefert true bei sauberem Teil.
function isSafePathText(text, { allowSlash }) {
  const value = String(text);
  if (value.includes('\\') || INVALID_SEGMENT_CHARS.test(value)) return false;
  if (!allowSlash) return value.trim() !== '' && !value.includes('/');
  const segments = value.split('/');
  return segments.every((s) => {
    const seg = s.trim();
    return seg !== '' && seg !== '.' && seg !== '..';
  });
}

// Bereichsrelativer Eintrags-Pfad eines Journals für eine Periode:
// folderPattern und namePattern am Perioden-Start auswerten, Segmente
// säubern, '.md' anfügen. Die Rück-Richtung (Pfad -> Periode) läuft bewusst
// nur über den Abgleich mit frisch aufgelösten Pfaden (Architektur-
// entscheidung 5: Identität über das Schema, keine Pfad-Heuristik).
// Liefert { ok: true, relPath } oder { ok: false, error: { code, … } }.
function resolveEntryPath(journal, period) {
  const folder = evaluatePattern(journal.folderPattern, period);
  if (!folder.ok) return folder;
  const name = evaluatePattern(journal.namePattern, period);
  if (!name.ok) return name;
  const folderText = folder.text.trim().replace(/^\/+|\/+$/g, '');
  const nameText = name.text.trim();
  if (folderText !== '' && !isSafePathText(folderText, { allowSlash: true })) {
    return { ok: false, error: { code: 'invalidFolder' } };
  }
  if (!isSafePathText(nameText, { allowSlash: false })) {
    return { ok: false, error: { code: 'invalidName' } };
  }
  const relPath = (folderText === '' ? '' : `${folderText}/`) + `${nameText}.md`;
  return { ok: true, relPath };
}

// --- 4T-0435: Kontext-Ermittlung des Navigations-Blocks ----------------------------

// Such-Fenster der Rück-Richtung pro Granularität: [Perioden zurück,
// Perioden voraus] um den Bezugs-Zeitpunkt (ca. drei Jahre zurück, gut ein
// Jahr voraus — Journal-Grenzen kappen zusätzlich).
const FIND_SPAN = {
  day: [1130, 400],
  week: [165, 60],
  month: [39, 14],
  quarter: [14, 6],
  year: [4, 2],
};

// Findet die Periode eines Journals, deren aufgelöster Eintrags-Pfad dem
// gegebenen bereichsrelativen Pfad entspricht ('/'-normalisiert,
// case-insensitiv wie das Windows-Dateisystem). KEIN Pfad-Parsing
// (Architekturentscheidung 5): der Abgleich läuft ausschließlich über
// frisch aufgelöste Kandidaten-Perioden, spiralförmig vom Bezugs-Zeitpunkt
// (opts.aroundMs, Default jetzt) nach außen — der typische Fall (aktueller
// Eintrag) terminiert damit sofort. null = kein Treffer im Fenster.
function findPeriodForPath(journal, relPath, opts) {
  const target = String(relPath == null ? '' : relPath)
    .replace(/\\/g, '/')
    .toLowerCase();
  if (!journal || target === '') return null;
  const span = FIND_SPAN[journal.granularity];
  if (!span) return null;
  const aroundMs = opts && typeof opts.aroundMs === 'number' ? opts.aroundMs : Date.now();
  const center = periodOf(aroundMs, journal.granularity);
  const [back, fwd] = span;
  const matches = (period) => {
    if (!period || !periodAllowed(journal, period)) return false;
    const resolved = resolveEntryPath(journal, period);
    return resolved.ok && resolved.relPath.toLowerCase() === target;
  };
  if (matches(center)) return center;
  for (let i = 1; i <= Math.max(back, fwd); i++) {
    if (i <= fwd) {
      const next = addPeriods(center, i);
      if (matches(next)) return next;
    }
    if (i <= back) {
      const prev = addPeriods(center, -i);
      if (matches(prev)) return prev;
    }
  }
  return null;
}

// perspective-journal-nav-Fences (auch mit leerem Body) für den Portable-
// Export: ersetzt jeden Fence durch den Ersatz-Text (statische Perioden-
// Beschriftung ohne Anlage-Links; den Text liefert der Aufrufer, weil die
// Beschriftung lokalisiert ist). Rein und unit-testbar.
// Body zeilenweise über einen tempered-greedy-Ausdruck (jede Zeile, die
// nicht die Schließ-Zeile ist) — ein lazy [\s\S]*? würde bei einem leeren
// Body bis zur Schließ-Zeile des NÄCHSTEN Fences überspannen.
const NAV_FENCE_RE =
  /^ {0,3}(`{3,})perspective-journal-nav[^\n]*\n(?:(?! {0,3}\1[ \t]*$)[^\n]*\n)* {0,3}\1[ \t]*$/gm;

function replaceJournalNavFences(text, replacement) {
  const source = String(text == null ? '' : text);
  NAV_FENCE_RE.lastIndex = 0;
  return source.replace(NAV_FENCE_RE, () => String(replacement == null ? '' : replacement));
}

// --- 4T-0434: Monats-Gitter der Kalender-Ansicht -----------------------------------

// 4T-1063 (Epic 3E-0212): EINE Wochen-Zeile (Montag-Start) um einen
// Zeitpunkt, im selben Format, das monthGrid je Zeile liefert:
// { week: { key, week, year, startMs }, days: [{ ms, iso, day, inMonth } × 7] }.
// Der Wochen-Modus des Journal-Timeline-Blocks braucht genau eine solche
// Zeile ohne Monats-Rahmen; monthGrid ist darauf zurueckgefuehrt, damit es
// nur EINE Stelle gibt, die eine Wochen-Zeile baut.
//
// opts.monthIndex/opts.year setzen den Monats-Bezug fuer das inMonth-Flag
// (so kennzeichnet monthGrid die Randtage der Nachbar-Monate). Ohne Bezug
// ist inMonth durchgaengig true: Eine freistehende Wochen-Zeile hat keinen
// Fremdmonat, und der Aufrufer entscheidet ueber jede Kennzeichnung selbst.
function weekRow(ms, opts) {
  const week = periodOf(ms, 'week');
  const start = new Date(week.startMs);
  const hasMonthRef =
    !!opts && typeof opts.monthIndex === 'number' && typeof opts.year === 'number';
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dMs = dayMs(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const d = new Date(dMs);
    days.push({
      ms: dMs,
      iso: msToIsoDate(dMs),
      day: d.getDate(),
      inMonth: hasMonthRef
        ? d.getMonth() === opts.monthIndex && d.getFullYear() === opts.year
        : true,
    });
  }
  const iso = isoWeekOf(week.startMs);
  return {
    week: { key: week.key, week: iso.week, year: iso.year, startMs: week.startMs },
    days,
  };
}

// Wochen-Zeilen (Montag-Start), die einen Monat vollständig überdecken —
// inklusive der Randtage der Nachbar-Monate. Pro Zeile die ISO-KW der
// Zeile (KW-Spalte, Klick-Ziel des Wochen-Journals) und sieben Tage.
// Liefert [{ week: { key, week, year, startMs }, days: [{ ms, iso, day,
// inMonth } × 7] }]. Rein und unit-testbar; das Panel baut daraus das DOM.
function monthGrid(year, monthIndex) {
  const lastOfMonth = dayMs(year, monthIndex + 1, 0);
  let week = periodOf(dayMs(year, monthIndex, 1), 'week');
  const rows = [];
  while (week && week.startMs <= lastOfMonth) {
    rows.push(weekRow(week.startMs, { year, monthIndex }));
    week = addPeriods(week, 1);
  }
  return rows;
}

// --- 4T-0433: Frontmatter-Datums-Properties ---------------------------------------

// Automatische Datums-Properties eines Eintrags (Feldnamen aus der
// Journal-Definition): Tages-Journale tragen nur das Datum, mehrtägige
// Perioden Start und Ende (PO-Beleg-Muster; Werte als 'yyyy-MM-dd').
function journalProperties(journal, period) {
  if (period.granularity === 'day') {
    return { [journal.dateProp || DEFAULT_DATE_PROP]: msToIsoDate(period.startMs) };
  }
  return {
    [journal.startProp || DEFAULT_START_PROP]: msToIsoDate(period.startMs),
    [journal.endProp || DEFAULT_END_PROP]: msToIsoDate(period.endMs),
  };
}

// Setzt bzw. ergänzt die Datums-Properties im Frontmatter eines Eintrags-
// Texts (typisch: der gefüllte Vorlagen-Inhalt). Bestehende fremde Felder
// bleiben erhalten; die Journal-Properties übersteuern gleichnamige Felder
// (sie sind die verlässliche Quelle der Periode). Bei einem YAML-Fehler
// bleibt der Text unverändert (der Eintrag entsteht trotzdem).
function applyJournalProperties(text, journal, period) {
  const source = String(text == null ? '' : text);
  const fm = extractFrontmatter(source);
  const base =
    fm && fm.data && typeof fm.data === 'object' && !Array.isArray(fm.data) ? fm.data : {};
  const result = writeFrontmatter(source, { ...base, ...journalProperties(journal, period) });
  return result.ok ? result.text : source;
}

// Sicherheits-Grenze der Eintrags-Ermittlung: mehr Perioden fragt kein
// legitimer Aufrufer ab (Kalender lädt monatsweise).
const MAX_RANGE_PERIODS = 400;

// Einträge eines Journals im Datums-Bereich [fromMs, toMs]: alle Perioden,
// die den Bereich berühren und in den Journal-Grenzen liegen, mit
// aufgelöstem Pfad und Existenz-Ergebnis. `exists(relPath)` ist injiziert
// (async oder sync; Main bindet fs, Tests ein Set) — Grundlage der
// Kalender-Punkte. Perioden mit defektem Schema entfallen still (das
// Schema-Problem meldet der Anlage-Pfad bzw. das Einstellungs-Formular).
async function entriesInRange(journal, fromMs, toMs, exists) {
  const out = [];
  if (!journal || typeof exists !== 'function' || !(fromMs <= toMs)) return out;
  let period = periodOf(fromMs, journal.granularity);
  const jobs = [];
  let steps = 0;
  while (period && period.startMs <= toMs && steps < MAX_RANGE_PERIODS) {
    steps++;
    if (periodAllowed(journal, period)) {
      const resolved = resolveEntryPath(journal, period);
      if (resolved.ok) {
        const p = period;
        jobs.push(
          Promise.resolve(exists(resolved.relPath)).then((found) => ({
            period: p,
            relPath: resolved.relPath,
            exists: !!found,
          })),
        );
      }
    }
    period = addPeriods(period, 1);
  }
  for (const entry of await Promise.all(jobs)) out.push(entry);
  return out;
}

module.exports = {
  JOURNAL_GRANULARITIES,
  DEFAULT_DATE_PROP,
  DEFAULT_START_PROP,
  DEFAULT_END_PROP,
  normalizeJournalsConfig,
  // 4T-0432: Perioden-Kern.
  isoDateToMs,
  msToIsoDate,
  periodOf,
  addPeriods,
  periodAllowed,
  nextPeriod,
  prevPeriod,
  parentPeriods,
  resolveEntryPath,
  entriesInRange,
  // 4T-0433: Frontmatter-Datums-Properties des Anlage-Pfads.
  journalProperties,
  applyJournalProperties,
  // 4T-0434: Monats-Gitter der Kalender-Ansicht.
  monthGrid,
  // 4T-1063 (Epic 3E-0212): einzelne Wochen-Zeile, Basis von monthGrid.
  weekRow,
  // 4T-0435: Kontext-Ermittlung des Navigations-Blocks (Pfad -> Periode)
  // und Fence-Ersetzung des Portable-Exports.
  findPeriodForPath,
  replaceJournalNavFences,
};
