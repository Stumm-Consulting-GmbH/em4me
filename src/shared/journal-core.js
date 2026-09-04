// 4T-000432 (Epic 3E-000081): Perioden-Kern der Journale — Perioden-Arithmetik
// für die fünf Granularitäten fest nach ISO 8601 (Montag-Start, KW mit
// Donnerstags-Regel; Architekturentscheidung 3), Schema-Auflösung der
// Eintrags-Pfade über die Vorlagen-Engine, Eintrags-Ermittlung mit
// injizierbarem Existenz-Check, Monats-Gitter und die Frontmatter-Properties
// des Anlage-Wegs. Zeitpunkte sind Millisekunden lokaler Mitternacht
// (konsistent zur lokalen Formatierung von formatDateMs und zum nowMs-Bezug
// der Vorlagen-Engine); Tages-Arithmetik läuft über den Date-Konstruktor
// (DST-fest).
//
// 4T-001413 (Epic 3E-000244): Das Definitions-Modell (Schema, Normalisierung,
// Konstanten) liegt seit dem Schnitt in src/shared/journal-model.js und wird
// hier unverändert re-exportiert, damit die bestehenden Aufrufer beider Seiten
// nichts zu ändern hatten. Die Abhängigkeit ist einseitig.
//
// Prozess-neutral (kein Electron, kein DOM): Main (Datenpfad, Anlage) und
// Renderer (Panel, Einstellungen) laden dasselbe Modul.
'use strict';

const { analyzeTemplate, fillTemplate } = require('./template-engine');
// 4T-000987 (Epic 3E-000196): Format-Kern der Abfrage-Sprache, seit dem Schnitt
// in src/shared/query/query-format.js.
const { formatDateMs, isoWeekOf } = require('./query/query-format.js');
// 4T-001276 (Epic 3E-000232, Befund B1): Pfad-Identität über die zentrale Auskunft.
const { pathCompareKey } = require('./platform.js');
const { extractFrontmatter, writeFrontmatter } = require('./markdown/frontmatter');
// 4T-001413 (Epic 3E-000244): Definitions-Modell aus dem geschnittenen Modul.
const {
  JOURNAL_GRANULARITIES,
  DEFAULT_NAME_PROP,
  DEFAULT_DATE_PROP,
  DEFAULT_START_PROP,
  DEFAULT_END_PROP,
  normalizeIsoDate,
  normalizeJournalsConfig,
} = require('./journal-model.js');

// --- 4T-000432: Perioden-Rechnung -------------------------------------------------

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
// nach grob; der Navigations-Block (4T-000435) filtert auf die im Regal
// vorhandenen Journale (Lücken werden ausgelassen).
function parentPeriods(period) {
  const idx = JOURNAL_GRANULARITIES.indexOf(period.granularity);
  if (idx < 0) return [];
  return JOURNAL_GRANULARITIES.slice(idx + 1).map((g) => periodOf(period.startMs, g));
}

// --- 4T-000432: Schema-Auflösung ---------------------------------------------------

// Windows-verbotene Zeichen in Datei-/Ordnernamen (plus Steuerzeichen);
// '/' ist im Ordner-Schema als Trenner erlaubt und wird getrennt geprüft.
// 4T-001203 (Epic 3E-000121): Die strenge Windows-Menge gilt bewusst auf ALLEN
// Plattformen — eine unter Linux erlaubte Datei mit ':' wäre unter Windows
// unlesbar, und Bereiche sollen plattformübergreifend austauschbar bleiben.
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

// --- 4T-000435: Kontext-Ermittlung des Navigations-Blocks ----------------------------

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
  const target = pathCompareKey(String(relPath == null ? '' : relPath).replace(/\\/g, '/'));
  if (!journal || target === '') return null;
  const span = FIND_SPAN[journal.granularity];
  if (!span) return null;
  const aroundMs = opts && typeof opts.aroundMs === 'number' ? opts.aroundMs : Date.now();
  const center = periodOf(aroundMs, journal.granularity);
  const [back, fwd] = span;
  const matches = (period) => {
    if (!period || !periodAllowed(journal, period)) return false;
    const resolved = resolveEntryPath(journal, period);
    return resolved.ok && pathCompareKey(resolved.relPath) === target;
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

// --- 4T-000434: Monats-Gitter der Kalender-Ansicht -----------------------------------

// 4T-001063 (Epic 3E-000212): EINE Wochen-Zeile (Montag-Start) um einen
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

// --- 4T-000433: Frontmatter-Datums-Properties ---------------------------------------

// Automatische Journal-Properties eines Eintrags (Feldnamen aus der
// Journal-Definition, Datums-Werte als 'yyyy-MM-dd'): vollständig in JEDER
// Granularität, Perioden-Datum gleich Perioden-Start (bei Tages-Einträgen
// stimmen die drei Daten überein). 4T-001404 und 4T-001405 (Epic 3E-000244):
// Zuvor schrieb eine Weiche entweder das Datum oder die Grenzen, und der
// Journal-Name fehlte ganz; Belege in den Tasks. Der Name ist der ANZEIGE-Name,
// nicht die Kennung — er steht im Eintrag für Leser und Abfragen.
function journalProperties(journal, period) {
  return {
    [journal.nameProp || DEFAULT_NAME_PROP]: journal.name || journal.id || '',
    [journal.dateProp || DEFAULT_DATE_PROP]: msToIsoDate(period.startMs),
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
  DEFAULT_NAME_PROP,
  DEFAULT_DATE_PROP,
  DEFAULT_START_PROP,
  DEFAULT_END_PROP,
  normalizeJournalsConfig,
  // 4T-000432: Perioden-Kern.
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
  // 4T-000433: Frontmatter-Datums-Properties des Anlage-Pfads.
  journalProperties,
  applyJournalProperties,
  // 4T-000434: Monats-Gitter der Kalender-Ansicht.
  monthGrid,
  // 4T-001063 (Epic 3E-000212): einzelne Wochen-Zeile, Basis von monthGrid.
  weekRow,
  // 4T-000435: Kontext-Ermittlung des Navigations-Blocks (Pfad -> Periode)
  // und Fence-Ersetzung des Portable-Exports.
  findPeriodForPath,
  replaceJournalNavFences,
};
