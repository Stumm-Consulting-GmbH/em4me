// 4T-000496 (Epic 3E-000090): Task-Marker-Kern — Parsing und Serialisierung
// der Task-Zeile mit Symbol-Markern im Referenz-Format.
//
// Aufgaben des Moduls: eine Checkbox-Zeile in ein Task-Modell parsen
// (Termine mit optionaler Uhrzeit HH:mm, Prioritaet, Wiederholungs-Regel,
// ID/Abhaengigkeiten, Erinnerung) und verlustfrei zurueck serialisieren;
// dazu die Global-Filter-Logik als reine Funktion (leerer Filter = jede
// Checkbox-Zeile ist Task) und die Vergleichs-Helfer fuer Prioritaets-
// und Termin-Ordnung.
//
// 4T-000983 (Epic 3E-000196): Der Kern liegt im Ordner `src/shared/tasks/`.
// Er liest und schreibt alle Marker-Arten; die Fach-Logik zweier Arten
// liegt daneben und lädt ihn: `task-recurrence.js` (Wiederholungs-Regel,
// Tages-Arithmetik, Dringlichkeits-Score) und `task-dependencies.js`
// (Kennungs-Vergabe, Blockierungs-Flags). Der Kern lädt keines der
// beiden; die Import-Richtung bleibt einseitig und der Ordner zyklenfrei.
// Dass `daysInMonth`, `findLastSegment` und `leadingWs` exportiert sind,
// ist die Folge davon: die Schwester-Module bauen auf diesen Bausteinen
// auf, statt eine zweite Fassung zu führen.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM) — Pipeline (plugins.js), Renderer (Toggle-/Automatik-Pfad)
// und Tests laden dasselbe Modul.
//
// Format-Treue ist das Top-Risiko des Epics (Architekturentscheidung 1,
// 3E-000090): der Datei-Bestand des PO im Referenz-Format muss ohne
// Konvertierung funktionieren. Deshalb arbeitet der Parser Segment-
// basiert vom Zeilenende her: jedes erkannte Marker-Segment behaelt
// seinen exakten Roh-Text (inklusive fuehrendem Weissraum und
// Symbol-Variante); die Serialisierung setzt unveraenderte Segmente
// byte-identisch wieder zusammen. Nur gezielt mutierte Felder werden in
// kanonischer Form neu geschrieben. Unbekannte Marker am Zeilenende, die
// keinem bekannten Symbol entsprechen, bleiben Teil der Beschreibung und
// runden damit trivially verlustfrei.
//
// Marker-Bestand (Referenz-Format, Analyse Obsidian_Tasks.md):
// - Termine: faellig, geplant, Start (manuell); erstellt, erledigt,
//   abgebrochen (Automatik, 4T-000498). Festes Datum YYYY-MM-DD; optionale
//   Uhrzeit "HH:mm" hinter dem Datum ist die eigene Format-Erweiterung
//   (Querschnitt B) — ohne Uhrzeit referenz-identisch.
// - Prioritaet: sechs Stufen, "normal" ohne Marker zwischen niedrig und
//   mittel (Workshop-Punkt 2).
// - Wiederholung und ID/Abhaengigkeiten: hier nur gelesen, geschrieben
//   und erhalten; ihre Fach-Logik liegt in den beiden Schwester-Modulen.
// - Erinnerung (4T-000525, Epic 3E-000095): eigenes Segment-Kind mit
//   Datums-/Zeit-Wert — der Melde-Zeitpunkt des Erinnerungs-Systems
//   (Abgrenzung: Faelligkeits-Marker = Sach-Termin, Erinnerungs-Marker =
//   Melde-Zeitpunkt). Ein nackter Wecker ohne Wert bleibt Toleranz-Segment.
// - Toleranz-Marker (Abschluss-Aktion): als eigene Segmente erhalten,
//   ohne Funktion (Abschluss-Aktionen sind verworfen, Workshop-Punkt 11).
'use strict';

// --- Symbol-Tabelle ----------------------------------------------------------------
// Kanonische Schreib-Symbole pro Feld. Beim Lesen sind zusaetzlich
// gaengige Varianten-Symbole und ein angehaengter Variation Selector
// (U+FE0F, von manchen Editoren automatisch ergaenzt) toleriert; die
// Serialisierung erhaelt die gelesene Variante im Segment-Rohtext.
const DATE_MARKER_SYMBOLS = {
  due: '\u{1F4C5}', // Kalender
  scheduled: '⏳', // Sanduhr (laufend)
  start: '\u{1F6EB}', // startendes Flugzeug
  created: '➕', // Plus
  done: '✅', // Haken
  cancelled: '❌', // Kreuz
};

// Lese-Varianten: Kalender-Alternativen fuer faellig, stehende Sanduhr
// fuer geplant (beide in Referenz-Dateien anzutreffen).
const DATE_MARKER_READ_VARIANTS = {
  due: ['\u{1F4C5}', '\u{1F4C6}', '\u{1F5D3}'],
  scheduled: ['⏳', '⌛'],
  start: ['\u{1F6EB}'],
  created: ['➕'],
  done: ['✅'],
  cancelled: ['❌'],
};

// Reihenfolge = fachliche Ordnung der Termin-Felder (Referenz-Rangfolge
// faellig vor geplant vor Start dient 4T-000499 als Rechen-Basis).
const TASK_DATE_FIELDS = ['due', 'scheduled', 'start', 'created', 'done', 'cancelled'];

// Prioritaets-Stufen in Rang-Reihenfolge (dringlichste zuerst). "normal"
// hat kein Symbol und liegt zwischen mittel und niedrig — Rang-Index ist
// zugleich Sortier-Schluessel (comparePriority).
const PRIORITY_ORDER = ['highest', 'high', 'medium', 'normal', 'low', 'lowest'];

const PRIORITY_MARKER_SYMBOLS = {
  highest: '\u{1F53A}', // rotes Dreieck nach oben
  high: '⏫', // Doppelpfeil nach oben
  medium: '\u{1F53C}', // kleines Dreieck nach oben
  low: '\u{1F53D}', // kleines Dreieck nach unten
  lowest: '⏬', // Doppelpfeil nach unten
};

const RECURRENCE_SYMBOL = '\u{1F501}'; // Wiederholungs-Pfeile
const ID_SYMBOL = '\u{1F194}'; // ID-Zeichen
const DEPENDS_SYMBOL = '⛔'; // Zufahrt-verboten (Vorgaenger-Bezug)
const ON_COMPLETION_SYMBOL = '\u{1F3C1}'; // Zielflagge (Abschluss-Aktion)
const REMINDER_SYMBOL = '⏰'; // Wecker (Erinnerung, 3E-000095)

// --- Zeilen-Erkennung --------------------------------------------------------------
// Checkbox-Zeile: Aufzaehlungszeichen (-, *, +, nummeriert) plus
// [<einzelnes Zeichen>]. Bewusst deckungsgleich mit den Toggle-Regexen
// des Bestands (task-states.js: liveTaskMarkerRe/renderedToggleRe) —
// nach `]` folgt Weissraum oder das Zeilenende. Das u-Flag laesst `.`
// einen vollen Codepoint matchen (auch Astral-Zeichen als Status).
const CHECKBOX_LINE_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)\[(.)\](?:([ \t]+)([\s\S]*))?$/u;

// Datums-Wert: festes Format YYYY-MM-DD, optionale Uhrzeit HH:mm als
// eigene Format-Erweiterung (Querschnitt B). Nur die Form wird hier
// geprueft; die Kalender-Gueltigkeit prueft validateDateValue (ungueltige
// Werte werden nicht verworfen, sondern als ungueltig markiert).
const DATE_VALUE_SRC = '(\\d{4}-\\d{2}-\\d{2})(?:[ \\t]+(\\d{2}:\\d{2}))?';

// Ein Marker-Matcher pro Segment-Art, jeweils am Ende des verbleibenden
// Zeilen-Rests verankert. Fuehrender Weissraum gehoert zum Segment
// (Roh-Erhalt); er ist optional, damit auch Zeilen ohne Trenn-Leerzeichen
// tolerant lesen.
function buildMatchers() {
  const matchers = [];
  const symAlt = (symbols) => symbols.map((s) => `(?:${escapeRegExp(s)})`).join('|');
  for (const field of TASK_DATE_FIELDS) {
    matchers.push({
      kind: 'date',
      field,
      re: new RegExp(
        `([ \\t]*)(${symAlt(DATE_MARKER_READ_VARIANTS[field])})(\\uFE0F?)([ \\t]*)${DATE_VALUE_SRC}$`,
        'u',
      ),
    });
  }
  for (const level of Object.keys(PRIORITY_MARKER_SYMBOLS)) {
    matchers.push({
      kind: 'priority',
      level,
      re: new RegExp(`([ \\t]*)(${escapeRegExp(PRIORITY_MARKER_SYMBOLS[level])})(\\uFE0F?)$`, 'u'),
    });
  }
  // Wiederholungs-Regel: freier Regel-Text aus Buchstaben, Ziffern,
  // Leerzeichen, Komma und Ausrufezeichen (Referenz-Regelsprache);
  // endet am Zeilenende, beginnt am Wiederholungs-Symbol.
  matchers.push({
    kind: 'recurrence',
    re: new RegExp(
      `([ \\t]*)(${escapeRegExp(RECURRENCE_SYMBOL)})(\\uFE0F?)([ \\t]*)([A-Za-z0-9!,][A-Za-z0-9 !,]*?)$`,
      'u',
    ),
  });
  matchers.push({
    kind: 'id',
    re: new RegExp(
      `([ \\t]*)(${escapeRegExp(ID_SYMBOL)})(\\uFE0F?)([ \\t]*)([A-Za-z0-9_-]+)$`,
      'u',
    ),
  });
  matchers.push({
    kind: 'dependsOn',
    re: new RegExp(
      `([ \\t]*)(${escapeRegExp(DEPENDS_SYMBOL)})(\\uFE0F?)([ \\t]*)([A-Za-z0-9_-]+(?:[ \\t]*,[ \\t]*[A-Za-z0-9_-]+)*)$`,
      'u',
    ),
  });
  // Erinnerungs-Marker (4T-000525, Epic 3E-000095): Datum mit optionaler
  // Uhrzeit, gleiche Wert-Form wie die Termin-Felder (DATE_VALUE_SRC).
  matchers.push({
    kind: 'reminder',
    re: new RegExp(
      `([ \\t]*)(${escapeRegExp(REMINDER_SYMBOL)})(\\uFE0F?)([ \\t]*)${DATE_VALUE_SRC}$`,
      'u',
    ),
  });
  // Toleranz-Marker: Abschluss-Aktion (Wort-Wert) und nackter Wecker ohne
  // Wert werden als eigene Segmente erhalten, damit sie nicht in der
  // Beschreibung landen; eine Funktion haben sie hier nicht.
  matchers.push({
    kind: 'unknown',
    symbol: ON_COMPLETION_SYMBOL,
    re: new RegExp(
      `([ \\t]*)(${escapeRegExp(ON_COMPLETION_SYMBOL)})(\\uFE0F?)([ \\t]*)([A-Za-z-]*)$`,
      'u',
    ),
  });
  matchers.push({
    kind: 'unknown',
    symbol: REMINDER_SYMBOL,
    re: new RegExp(`([ \\t]*)(${escapeRegExp(REMINDER_SYMBOL)})(\\uFE0F?)$`, 'u'),
  });
  return matchers;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MARKER_MATCHERS = buildMatchers();

// --- Wert-Bereiche der Datums-Marker (4T-000937, Befund B-09) -------------------------
// Aus einer Ausnahme wird die Regel: Bis dahin war allein der ⏰-Wert einer
// Aufgaben-Zeile klick-dekoriert, weil nur er Gegenstand von 4T-000528 war; in
// derselben Zeile blieben sechs weitere Datums-Werte stumm, obwohl sie gleich
// aussehen. Anordnung des Product Owners vom 2026-08-08: jeder Datums-Wert im
// Dokument ist anklickbar, ueberall gleich.
//
// Die Erkennung leitet sich aus DATE_MARKER_READ_VARIANTS ab (samt der beim
// Lesen tolerierten Varianten-Symbole), damit keine zweite Liste entsteht.
// Zwei Alternativen, weil nur die Erinnerung eine Uhrzeit fuehrt: Die
// uebrigen Marker tragen ein reines Datum, und ein nachfolgender Zeit-Anteil
// gehoert nicht zu ihnen. Bewusst hier und nicht im Renderer: reine
// Text-Logik ueber die Tabellen dieses Moduls, ohne Oberflaeche pruefbar.
const TASK_DATE_MARKER_ALT = TASK_DATE_FIELDS.flatMap((f) => DATE_MARKER_READ_VARIANTS[f] || [])
  .map(escapeRegExp)
  .join('|');
const DATE_ONLY_SRC = '\\d{4}-\\d{2}-\\d{2}';
// Waere die Symbol-Liste leer, ergaebe `(?:)` einen leeren Alternativ-Zweig,
// und der Ausdruck erfasste JEDEN Datums-Wert einer Zeile statt nur die
// Marker-Werte — still und ohne Fehler. Aufgefallen bei der Wirksamkeits-
// Probe des Waechters; die Schranke kostet nichts und schliesst den Fall aus.
const MARKER_VALUE_IN_LINE_RE = new RegExp(
  `(?:${escapeRegExp(REMINDER_SYMBOL)})\\uFE0F?[ \\t]*(${DATE_ONLY_SRC}(?:[ \\t]+\\d{2}:\\d{2})?)` +
    (TASK_DATE_MARKER_ALT ? `|(?:${TASK_DATE_MARKER_ALT})\\uFE0F?[ \\t]*(${DATE_ONLY_SRC})` : ''),
  'gu',
);

// Wert-Bereiche aller Datums-Marker einer Zeile (Offsets in der Zeile), in
// Lese-Reihenfolge. `withReminder` bildet die Erweiterungs-Lage ab: Ist
// «Erinnerungen» abgeschaltet, ist der ⏰-Wert kein Marker-Wert und bleibt
// stumm wie zuvor; die uebrigen sechs haengen allein an «Aufgaben».
function markerValueRangesInLine(lineText, options) {
  const withReminder = !options || options.withReminder !== false;
  const ranges = [];
  for (const m of String(lineText || '').matchAll(MARKER_VALUE_IN_LINE_RE)) {
    const istErinnerung = m[1] !== undefined;
    if (istErinnerung && !withReminder) continue;
    const wert = istErinnerung ? m[1] : m[2];
    const valueStart = m.index + m[0].length - wert.length;
    ranges.push({ from: valueStart, to: valueStart + wert.length });
  }
  return ranges;
}

// --- Datums-Gueltigkeit ------------------------------------------------------------
// Kalender-Pruefung ohne Date-Objekt (keine Zeitzonen-Fallen): Monats-
// laengen-Tabelle plus Schaltjahr-Regel.
function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year, month) {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_DAYS[month - 1] || 0;
}

// Prueft "YYYY-MM-DD" (Form bereits gesichert) auf Kalender-Gueltigkeit.
function isValidIsoDate(date) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

// Prueft "HH:mm" (Form bereits gesichert) auf 00:00 bis 23:59.
function isValidTime(time) {
  const h = Number(time.slice(0, 2));
  const min = Number(time.slice(3, 5));
  return h <= 23 && min <= 59;
}

// Datums-Wert eines Termin-Felds: { date, time|null, invalid }. Ungueltig
// (Kalender oder Uhrzeit) wird markiert, nicht verworfen — in Stufe 2
// abfragbar (Referenz-Verhalten "date is invalid").
function makeDateValue(date, time) {
  const t = time || null;
  const invalid = !isValidIsoDate(date) || (t !== null && !isValidTime(t));
  return { date, time: t, invalid };
}

// --- Parsing -----------------------------------------------------------------------
// Zerlegt den Text hinter der Checkbox in Beschreibung und Marker-
// Segmente (vom Ende her, wie die Referenz). Rueckgabe:
// { description, segments } — jedes Segment traegt seinen exakten
// Roh-Text; die Segment-Reihenfolge entspricht der Zeilen-Reihenfolge.
function parseMarkerSegments(text) {
  const segments = [];
  // Zeilen-Ende-Weissraum als eigenes Pseudo-Segment erhalten, damit der
  // Ende-Anker der Matcher greift und der Round-Trip identisch bleibt.
  let tail = text;
  let trailing = '';
  const tm = tail.match(/[ \t]+$/);
  if (tm) {
    trailing = tm[0];
    tail = tail.slice(0, -trailing.length);
  }
  for (;;) {
    let matched = null;
    for (const matcher of MARKER_MATCHERS) {
      const m = tail.match(matcher.re);
      if (!m) continue;
      matched = { matcher, m };
      break;
    }
    if (!matched) break;
    const { matcher, m } = matched;
    const raw = m[0];
    const seg = { kind: matcher.kind, raw };
    if (matcher.kind === 'date') {
      seg.field = matcher.field;
      seg.value = makeDateValue(m[5], m[6]);
    } else if (matcher.kind === 'reminder') {
      seg.value = makeDateValue(m[5], m[6]);
    } else if (matcher.kind === 'priority') {
      seg.level = matcher.level;
    } else if (matcher.kind === 'recurrence') {
      seg.text = m[5].trim();
    } else if (matcher.kind === 'id') {
      seg.id = m[5];
    } else if (matcher.kind === 'dependsOn') {
      seg.ids = m[5].split(',').map((s) => s.trim());
    } else if (matcher.kind === 'unknown') {
      seg.symbol = matcher.symbol;
    }
    segments.unshift(seg);
    tail = tail.slice(0, tail.length - raw.length);
  }
  return { description: tail, segments, trailing };
}

// Parst eine komplette Zeile. Rueckgabe null, wenn die Zeile keine
// Checkbox-Zeile ist. Das Modell traegt alle Roh-Bestandteile fuer die
// verlustfreie Serialisierung; Feld-Werte (due, priority, ...) sind
// abgeleitete Sichten auf die Segmente — bei Duplikaten gewinnt das
// rechteste Segment (Parse-Richtung der Referenz).
function parseTaskLine(line) {
  const m = String(line == null ? '' : line).match(CHECKBOX_LINE_RE);
  if (!m) return null;
  const statusGap = m[5] || '';
  const rest = m[6] || '';
  const { description, segments, trailing } = parseMarkerSegments(rest);
  const model = {
    indent: m[1],
    bullet: m[2],
    bulletGap: m[3],
    statusChar: m[4],
    statusGap,
    description,
    segments,
    trailing,
    due: null,
    scheduled: null,
    start: null,
    created: null,
    done: null,
    cancelled: null,
    priority: 'normal',
    recurrence: null,
    id: null,
    dependsOn: [],
    reminder: null,
  };
  for (const seg of segments) {
    if (seg.kind === 'date') model[seg.field] = seg.value;
    else if (seg.kind === 'reminder') model.reminder = seg.value;
    else if (seg.kind === 'priority') model.priority = seg.level;
    else if (seg.kind === 'recurrence') model.recurrence = { text: seg.text };
    else if (seg.kind === 'id') model.id = seg.id;
    else if (seg.kind === 'dependsOn') model.dependsOn = seg.ids;
  }
  return model;
}

// --- Serialisierung ----------------------------------------------------------------
// Unveraenderte Segmente byte-identisch, mutierte in kanonischer Form
// (die Mutatoren schreiben den Segment-Rohtext direkt um).
function serializeTaskLine(model) {
  const head = `${model.indent}${model.bullet}${model.bulletGap}[${model.statusChar}]`;
  const rest = model.description + model.segments.map((s) => s.raw).join('') + model.trailing;
  if (rest === '' && model.statusGap === '') return head;
  return head + model.statusGap + rest;
}

function formatDateValue(value) {
  return value.time ? `${value.date} ${value.time}` : value.date;
}

// Rechtestes Segment einer Art (bei Duplikaten traegt es den wirksamen
// Wert und ist das Ziel der Mutation).
function findLastSegment(model, predicate) {
  for (let i = model.segments.length - 1; i >= 0; i--) {
    if (predicate(model.segments[i])) return i;
  }
  return -1;
}

// Fuehrenden Weissraum eines bestehenden Segment-Rohtexts erhalten,
// Standard ist ein einzelnes Leerzeichen.
function leadingWs(raw) {
  const m = raw.match(/^[ \t]*/);
  return m && m[0] !== '' ? m[0] : ' ';
}

// --- Mutatoren ---------------------------------------------------------------------
// Termin-Feld setzen oder entfernen. value: { date, time? } oder null.
// Bestehende Segmente behalten Position, Symbol-Variante und fuehrenden
// Weissraum; neue Segmente werden mit kanonischem Symbol angehaengt.
function setDateField(model, field, value) {
  if (!TASK_DATE_FIELDS.includes(field)) throw new Error(`Unbekanntes Termin-Feld: ${field}`);
  const idx = findLastSegment(model, (s) => s.kind === 'date' && s.field === field);
  if (value == null) {
    if (idx >= 0) model.segments.splice(idx, 1);
    model[field] = null;
    return;
  }
  const next = makeDateValue(value.date, value.time || null);
  if (idx >= 0) {
    const seg = model.segments[idx];
    const symMatch = seg.raw.match(
      new RegExp(
        `^([ \\t]*)((?:${DATE_MARKER_READ_VARIANTS[field].map(escapeRegExp).join('|')})\\uFE0F?)`,
        'u',
      ),
    );
    const ws = symMatch ? symMatch[1] || ' ' : ' ';
    const sym = symMatch ? symMatch[2] : DATE_MARKER_SYMBOLS[field];
    seg.raw = `${ws === '' ? ' ' : ws}${sym} ${formatDateValue(next)}`;
    seg.value = next;
  } else {
    model.segments.push({
      kind: 'date',
      field,
      value: next,
      raw: ` ${DATE_MARKER_SYMBOLS[field]} ${formatDateValue(next)}`,
    });
  }
  model[field] = next;
}

// Prioritaet setzen ('normal' entfernt das Marker-Segment).
function setPriority(model, level) {
  if (!PRIORITY_ORDER.includes(level)) throw new Error(`Unbekannte Prioritaet: ${level}`);
  const idx = findLastSegment(model, (s) => s.kind === 'priority');
  if (level === 'normal') {
    if (idx >= 0) model.segments.splice(idx, 1);
  } else if (idx >= 0) {
    const seg = model.segments[idx];
    seg.raw = `${leadingWs(seg.raw)}${PRIORITY_MARKER_SYMBOLS[level]}`;
    seg.level = level;
  } else {
    model.segments.push({
      kind: 'priority',
      level,
      raw: ` ${PRIORITY_MARKER_SYMBOLS[level]}`,
    });
  }
  model.priority = level;
}

// Status-Zeichen setzen (Toggle-Pfad 4T-000497).
function setStatusChar(model, ch) {
  model.statusChar = ch;
}

// 4T-000525 (Epic 3E-000095): Erinnerungs-Marker setzen oder entfernen.
// value: { date, time? } oder null. Bestehende Segmente behalten Position,
// Symbol-Variante (inklusive Variation Selector) und fuehrenden Weissraum
// (Muster setDateField); neue Segmente werden kanonisch angehaengt.
function setReminder(model, value) {
  const idx = findLastSegment(model, (s) => s.kind === 'reminder');
  if (value == null) {
    if (idx >= 0) model.segments.splice(idx, 1);
    model.reminder = null;
    return;
  }
  const next = makeDateValue(value.date, value.time || null);
  if (idx >= 0) {
    const seg = model.segments[idx];
    const symMatch = seg.raw.match(
      new RegExp(`^([ \\t]*)(${escapeRegExp(REMINDER_SYMBOL)}\\uFE0F?)`, 'u'),
    );
    const ws = symMatch && symMatch[1] !== '' ? symMatch[1] : ' ';
    const sym = symMatch ? symMatch[2] : REMINDER_SYMBOL;
    seg.raw = `${ws}${sym} ${formatDateValue(next)}`;
    seg.value = next;
  } else {
    model.segments.push({
      kind: 'reminder',
      value: next,
      raw: ` ${REMINDER_SYMBOL} ${formatDateValue(next)}`,
    });
  }
  model.reminder = next;
}

// ID- und Abhaengigkeits-Segmente entfernen (Folge-Instanz der
// Wiederholung, 4T-000499: IDs gelten pro Vorkommen, die neue Instanz darf
// keine Duplikate erzeugen). Bleibt im Kern, weil es ein reiner
// Segment-Filter ohne Kennungs-Logik ist und die Wiederholungs-Schicht
// ihn braucht (4T-000983: sonst Zyklus zwischen den Schwester-Modulen).
function stripIdAndDependsOn(model) {
  model.segments = model.segments.filter((s) => s.kind !== 'id' && s.kind !== 'dependsOn');
  model.id = null;
  model.dependsOn = [];
}

// --- Global Filter -----------------------------------------------------------------
// Leerer Filter: jede Checkbox-Zeile ist Task. Nicht-leerer Filter: der
// Filter-String muss im Text hinter der Checkbox vorkommen (Beschreibung
// oder Marker-Bereich; die Referenz prueft die ganze Task-Zeile).
function isTaskLine(line, globalFilter) {
  const model = parseTaskLine(line);
  if (!model) return false;
  return modelMatchesGlobalFilter(model, globalFilter);
}

function modelMatchesGlobalFilter(model, globalFilter) {
  const filter = String(globalFilter == null ? '' : globalFilter).trim();
  if (filter === '') return true;
  const rest = model.description + model.segments.map((s) => s.raw).join('');
  return rest.includes(filter);
}

// Filter-String fuer Anzeigen aus der Beschreibung entfernen
// (Ausblende-Option, 4T-000498): erstes Vorkommen samt einem angrenzenden
// Leerzeichen; uebriger Text bleibt unveraendert.
function stripGlobalFilter(description, globalFilter) {
  const filter = String(globalFilter == null ? '' : globalFilter).trim();
  if (filter === '') return description;
  const idx = description.indexOf(filter);
  if (idx < 0) return description;
  let start = idx;
  let end = idx + filter.length;
  if (description[end] === ' ') end++;
  else if (start > 0 && description[start - 1] === ' ') start--;
  return description.slice(0, start) + description.slice(end);
}

// --- Vergleichs-Helfer -------------------------------------------------------------
// Prioritaets-Rang: Index in PRIORITY_ORDER (0 = dringlichste). Unbekannte
// Werte ordnen sich wie 'normal' ein.
function priorityRank(level) {
  const idx = PRIORITY_ORDER.indexOf(level);
  return idx >= 0 ? idx : PRIORITY_ORDER.indexOf('normal');
}

function comparePriority(a, b) {
  return priorityRank(a) - priorityRank(b);
}

// Termin-Ordnung: frueher vor spaeter. Regel fuer Werte ohne Uhrzeit
// (Querschnitt B, hier festgezurrt): ein Datum ohne Uhrzeit zaehlt fuer
// die Ordnung als 00:00 und sortiert damit vor allen Uhrzeiten desselben
// Tages. Fehlende Werte (null) sortieren ganz nach hinten, ungueltige
// direkt davor (vorhanden, aber nicht rechenbar).
function dateValueSortKey(value) {
  if (value == null) return '9999-12-31T99:99~2';
  if (value.invalid) return '9999-12-31T99:99~1';
  return `${value.date}T${value.time || '00:00'}~0`;
}

function compareDateValue(a, b) {
  const ka = dateValueSortKey(a);
  const kb = dateValueSortKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

module.exports = {
  TASK_DATE_FIELDS,
  DATE_MARKER_SYMBOLS,
  // 4T-000937 (Befund B-09): Die Klick-Dekoration der Datums-Werte leitet ihre
  // Marker-Erkennung aus dieser Tabelle ab, statt eine zweite zu fuehren.
  DATE_MARKER_READ_VARIANTS,
  PRIORITY_ORDER,
  PRIORITY_MARKER_SYMBOLS,
  RECURRENCE_SYMBOL,
  ID_SYMBOL,
  DEPENDS_SYMBOL,
  REMINDER_SYMBOL,
  markerValueRangesInLine,
  parseMarkerSegments,
  parseTaskLine,
  serializeTaskLine,
  setDateField,
  setPriority,
  setStatusChar,
  setReminder,
  stripIdAndDependsOn,
  isTaskLine,
  modelMatchesGlobalFilter,
  stripGlobalFilter,
  priorityRank,
  comparePriority,
  compareDateValue,
  isValidIsoDate,
  isValidTime,
  // 4T-000983: Bausteine fuer die Schwester-Module des Ordners (Monatslaenge
  // fuer die Wiederholungs-Zyklen, Segment-Suche und Weissraum-Erhalt fuer
  // deren Mutatoren) — bewusst exportiert statt dort neu geschrieben.
  daysInMonth,
  findLastSegment,
  leadingWs,
};
