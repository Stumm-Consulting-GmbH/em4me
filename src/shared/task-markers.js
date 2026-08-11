// 4T-0496 (Epic 3E-0090): Task-Marker-Kern — Parsing und Serialisierung
// der Task-Zeile mit Symbol-Markern im Referenz-Format.
//
// Aufgaben des Moduls:
// - Eine Checkbox-Zeile in ein Task-Modell parsen (Termine mit optionaler
//   Uhrzeit HH:mm, Prioritaet, Wiederholungs-Regel, ID/Abhaengigkeiten)
//   und verlustfrei zurueck serialisieren.
// - Global-Filter-Logik als reine Funktion (leerer Filter = jede
//   Checkbox-Zeile ist Task).
// - Vergleichs-Helfer fuer Prioritaets- und Termin-Ordnung (Darstellung
//   jetzt, Abfragen in Stufe 2 / 3E-0096).
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM) — Pipeline (plugins.js), Renderer (Toggle-/Automatik-Pfad)
// und Tests laden dasselbe Modul.
//
// Format-Treue ist das Top-Risiko des Epics (Architekturentscheidung 1,
// 3E-0090): der Datei-Bestand des PO im Referenz-Format muss ohne
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
//   abgebrochen (Automatik, 4T-0498). Festes Datum YYYY-MM-DD; optionale
//   Uhrzeit "HH:mm" hinter dem Datum ist die eigene Format-Erweiterung
//   (Querschnitt B) — ohne Uhrzeit referenz-identisch.
// - Prioritaet: sechs Stufen, "normal" ohne Marker zwischen niedrig und
//   mittel (Workshop-Punkt 2).
// - Wiederholung: Regel-Text hinter dem Wiederholungs-Symbol; das
//   Regel-Parsing selbst folgt in 4T-0499.
// - ID/Abhaengigkeiten: tolerant gelesen und erhalten, Funktion folgt in
//   Stufe 2 (3E-0096).
// - Erinnerung (4T-0525, Epic 3E-0095): eigenes Segment-Kind mit
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
// faellig vor geplant vor Start dient 4T-0499 als Rechen-Basis).
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
const REMINDER_SYMBOL = '⏰'; // Wecker (Erinnerung, 3E-0095)

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
  // Erinnerungs-Marker (4T-0525, Epic 3E-0095): Datum mit optionaler
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

// --- Wert-Bereiche der Datums-Marker (4T-0937, Befund B-09) -------------------------
// Aus einer Ausnahme wird die Regel: Bis dahin war allein der ⏰-Wert einer
// Aufgaben-Zeile klick-dekoriert, weil nur er Gegenstand von 4T-0528 war; in
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

// Status-Zeichen setzen (Toggle-Pfad 4T-0497).
function setStatusChar(model, ch) {
  model.statusChar = ch;
}

// 4T-0506 (Epic 3E-0096): Wiederholungs-Regel setzen oder entfernen
// (Dialog-Feld). Bestehende Segmente behalten Position und fuehrenden
// Weissraum; neue werden mit kanonischem Symbol angehaengt. text null
// oder leer entfernt das Segment.
function setRecurrence(model, text) {
  const trimmed = String(text == null ? '' : text).trim();
  const idx = findLastSegment(model, (s) => s.kind === 'recurrence');
  if (trimmed === '') {
    if (idx >= 0) model.segments.splice(idx, 1);
    model.recurrence = null;
    return;
  }
  if (idx >= 0) {
    const seg = model.segments[idx];
    seg.raw = `${leadingWs(seg.raw)}${RECURRENCE_SYMBOL} ${trimmed}`;
    seg.text = trimmed;
  } else {
    model.segments.push({
      kind: 'recurrence',
      text: trimmed,
      raw: ` ${RECURRENCE_SYMBOL} ${trimmed}`,
    });
  }
  model.recurrence = { text: trimmed };
}

// 4T-0525 (Epic 3E-0095): Erinnerungs-Marker setzen oder entfernen.
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
// Wiederholung, 4T-0499: IDs gelten pro Vorkommen, die neue Instanz darf
// keine Duplikate erzeugen).
function stripIdAndDependsOn(model) {
  model.segments = model.segments.filter((s) => s.kind !== 'id' && s.kind !== 'dependsOn');
  model.id = null;
  model.dependsOn = [];
}

// --- Abhaengigkeiten (4T-0508, Epic 3E-0096) -----------------------------------------

// Gueltige Task-ID (Referenz-Format: a-z, A-Z, 0-9, '_', '-').
const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;

function isValidTaskId(id) {
  return typeof id === 'string' && TASK_ID_RE.test(id);
}

// ID-Segment setzen oder entfernen (Dialog- und Autocomplete-Weg).
function setTaskId(model, id) {
  const idx = findLastSegment(model, (s) => s.kind === 'id');
  if (id == null || id === '') {
    if (idx >= 0) model.segments.splice(idx, 1);
    model.id = null;
    return;
  }
  if (!isValidTaskId(id)) throw new Error(`Ungueltige Task-ID: ${id}`);
  if (idx >= 0) {
    const seg = model.segments[idx];
    seg.raw = `${leadingWs(seg.raw)}${ID_SYMBOL} ${id}`;
    seg.id = id;
  } else {
    model.segments.push({ kind: 'id', id, raw: ` ${ID_SYMBOL} ${id}` });
  }
  model.id = id;
}

// Vorgaenger-Liste setzen oder entfernen (Dialog-Weg). ids: Array gueltiger
// IDs (dedupliziert in Eingabe-Reihenfolge); leer entfernt das Segment.
function setDependsOn(model, ids) {
  const clean = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw == null ? '' : raw).trim();
    if (!isValidTaskId(id) || clean.includes(id)) continue;
    clean.push(id);
  }
  const idx = findLastSegment(model, (s) => s.kind === 'dependsOn');
  if (clean.length === 0) {
    if (idx >= 0) model.segments.splice(idx, 1);
    model.dependsOn = [];
    return;
  }
  const value = clean.join(', ');
  if (idx >= 0) {
    const seg = model.segments[idx];
    seg.raw = `${leadingWs(seg.raw)}${DEPENDS_SYMBOL} ${value}`;
    seg.ids = clean;
  } else {
    model.segments.push({ kind: 'dependsOn', ids: clean, raw: ` ${DEPENDS_SYMBOL} ${value}` });
  }
  model.dependsOn = clean;
}

// Neue, im Bereich eindeutige Task-ID (Eindeutigkeits-Pruefung ist die
// bewusste Abweichung von der Referenz, Workshop-Punkt 9). Sechs Zeichen
// aus [a-z0-9]; der Zufalls-Generator ist injizierbar (Tests), der
// Sicherheits-Deckel verhindert theoretische Endlos-Schleifen.
function generateTaskId(existingIds, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += alphabet[Math.min(alphabet.length - 1, Math.floor(random() * alphabet.length))];
    }
    if (!existing.has(id)) return id;
  }
  // Deckel erreicht (praktisch unerreichbar): laengere ID aus Zaehler.
  let n = existing.size;
  let fallback = `id${n}`;
  while (existing.has(fallback)) fallback = `id${++n}`;
  return fallback;
}

// Offene Status-Typen im Sinne der Blockierung (Workshop-Punkt 9:
// Blockierung nur zwischen offenen Status-Typen; unbekannte Zeichen ohne
// Typ zaehlen nicht als offen).
const OPEN_STATUS_TYPES = new Set(['TODO', 'IN_PROGRESS', 'ON_HOLD']);

// Blockierungs-Flags ueber die Task-Menge eines Bereichs (Datei-Grenzen
// egal, die Menge kommt vom Aufrufer). tasks: Array { id, dependsOn,
// statusType }. Rueckgabe pro Index { blocked, blocking, duplicateId }:
// - blocked: offene Task mit mindestens einem offenen Vorgaenger.
// - blocking: offene Task mit ID, auf die mindestens eine andere offene
//   Task per Vorgaenger-Bezug verweist.
// - duplicateId: die ID der Task ist im Bereich mehrfach vergeben (weicher
//   Hinweis plus Abfrage-Filter; Definition nicht-rekursiv, Zyklen sind
//   damit tolerant).
function computeDependencyFlags(tasks) {
  const idCounts = new Map();
  const openById = new Map(); // id -> hat mindestens eine OFFENE Task mit dieser ID
  for (const task of tasks) {
    if (!task.id) continue;
    idCounts.set(task.id, (idCounts.get(task.id) || 0) + 1);
    if (OPEN_STATUS_TYPES.has(task.statusType)) {
      openById.set(task.id, true);
    } else if (!openById.has(task.id)) {
      openById.set(task.id, false);
    }
  }
  const referencedOpen = new Set(); // IDs, auf die eine offene Task verweist
  for (const task of tasks) {
    if (!OPEN_STATUS_TYPES.has(task.statusType)) continue;
    for (const dep of task.dependsOn || []) referencedOpen.add(dep);
  }
  return tasks.map((task) => {
    const open = OPEN_STATUS_TYPES.has(task.statusType);
    const blocked = open && (task.dependsOn || []).some((dep) => openById.get(dep) === true);
    const blocking = open && !!task.id && referencedOpen.has(task.id);
    const duplicateId = !!task.id && (idCounts.get(task.id) || 0) > 1;
    return { blocked, blocking, duplicateId };
  });
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
// (Ausblende-Option, 4T-0498): erstes Vorkommen samt einem angrenzenden
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

// --- Dringlichkeits-Score (4T-0505, Epic 3E-0096) -----------------------------------
// Referenz-Formel des Konzept-Workshops (Punkt 10): Faelligkeit dominant,
// Prioritaet, Geplant-Bonus, Start-Abwertung. Rein funktional; der
// Bezugstag kommt injiziert (opts.todayIso), nie aus der System-Uhr —
// Tests und Abfrage-Laeufe rechnen damit deterministisch.
//
// Zeitanteil-Regel (Querschnitt B, hier festgezurrt): der Score rechnet
// auf Tages-Basis (Tages-Nummern-Differenz); eine optionale Uhrzeit hat
// keinen Score-Einfluss. Ungueltige Datums-Werte zaehlen wie fehlende.

// Prioritaets-Komponente der sechs Stufen (dringlichste zuerst).
const URGENCY_PRIORITY_SCORE = {
  highest: 9.0,
  high: 6.0,
  medium: 3.9,
  normal: 1.95,
  low: 0.0,
  lowest: -1.8,
};

function computeUrgency(model, opts) {
  const todayIso = opts && opts.todayIso;
  if (!model || !todayIso) return 0;
  let score = URGENCY_PRIORITY_SCORE[model.priority];
  if (score === undefined) score = URGENCY_PRIORITY_SCORE.normal;
  const todayNum = isoToDayNumber(todayIso);
  // Faelligkeit: 12,0 ab sieben Tagen Ueberfaelligkeit, linear fallend
  // bis 2,4 bei vierzehn oder mehr Tagen in der Zukunft (faellig heute
  // ergibt 8,8); ohne (gueltigen) Termin 0.
  if (model.due && !model.due.invalid) {
    const t = isoToDayNumber(model.due.date) - todayNum;
    if (t <= -7) score += 12.0;
    else if (t >= 14) score += 2.4;
    else score += 12.0 - ((t + 7) * 9.6) / 21;
  }
  // Geplant heute oder frueher: Bonus.
  if (model.scheduled && !model.scheduled.invalid) {
    if (isoToDayNumber(model.scheduled.date) <= todayNum) score += 5.0;
  }
  // Start morgen oder spaeter: Abwertung (noch nicht faellig anzugehen).
  if (model.start && !model.start.invalid) {
    if (isoToDayNumber(model.start.date) > todayNum) score += -3.0;
  }
  return score;
}

// --- Wiederholung (4T-0499) ---------------------------------------------------------
// Regel-Parser und Instanz-Erzeugung im vollen Referenz-Umfang: alle n
// Tage, jeden Werktag, jede Woche (mit Wochentags-Liste), jeden Monat
// (am Tag N / am Letzten), jaehrlich; Zusatz "when done" rechnet ab dem
// tatsaechlichen Abschluss statt ab dem Soll-Termin. Grenzen wie die
// Referenz: kein Enddatum, keine Vorkommens-Begrenzung. Monats-/Jahres-
// Zyklen ohne den Ziel-Tag (31., 29.02.) werden uebersprungen, nicht
// geklemmt (Referenz-Semantik).

// Datums-Arithmetik zeitzonenfrei auf fortlaufenden Tages-Nummern
// (Civil-from-days-Algorithmus) — keine Date-Objekte, keine DST-Fallen.
function dayNumberFromDate(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function dateFromDayNumber(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

function isoToDayNumber(date) {
  return dayNumberFromDate(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  );
}

function dayNumberToIso(n) {
  const p = dateFromDayNumber(n);
  const pad = (v) => String(v).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

// Wochentag 0=Montag .. 6=Sonntag (Tag 0 = 1970-01-01 war ein Donnerstag).
function weekdayOfDayNumber(n) {
  return (((n + 3) % 7) + 7) % 7;
}

// 4T-0504 (Epic 3E-0096): ISO-Datum um ganze Tage verschieben — zeitzonen-
// frei ueber die Tages-Nummern-Arithmetik (Verschiebe-Knopf der Abfrage-
// Treffer; Uhrzeit-Anteile bleiben Sache des Aufrufers unveraendert).
function shiftIsoDateByDays(date, deltaDays) {
  return dayNumberToIso(isoToDayNumber(date) + deltaDays);
}

// 4T-0504 (Epic 3E-0096): massgebliches Termin-Feld eines Task-Modells in
// der Referenz-Rangfolge faellig vor geplant vor Start (nur gueltige
// Werte) — gemeinsame Feld-Wahl der Wiederholungs-Basis (4T-0499) und des
// Verschiebe-Knopfs; null ohne verwertbares Termin-Feld.
function primaryDateField(model) {
  for (const f of ['due', 'scheduled', 'start']) {
    if (model && model[f] && !model[f].invalid) return f;
  }
  return null;
}

const WEEKDAY_NAMES = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

// Parst den Regel-Text hinter dem Wiederholungs-Symbol. Rueckgabe null
// fuer unparsebare Regeln (der Abschluss verhaelt sich dann wie ohne
// Wiederholung — kein Raten, keine halbe Instanz).
function parseRecurrenceRule(text) {
  let s = String(text == null ? '' : text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (s === '') return null;
  let whenDone = false;
  if (/\bwhen done$/.test(s)) {
    whenDone = true;
    s = s.replace(/\s*when done$/, '');
  }
  const m = s.match(/^every\b\s*(.*)$/);
  if (!m) return null;
  let rest = m[1].trim();
  let interval = 1;
  const num = rest.match(/^(\d+)\s+(.*)$/);
  if (num) {
    interval = Number(num[1]);
    rest = num[2].trim();
    if (interval < 1) return null;
  }
  if (rest === 'day' || rest === 'days') return { unit: 'day', interval, whenDone };
  if (rest === 'weekday' || rest === 'weekdays') {
    // Die Werktags-Regel kennt kein Intervall (Referenz-Form).
    return interval === 1 ? { unit: 'weekday', interval: 1, whenDone } : null;
  }
  let fm = rest.match(/^(?:week|weeks)(?:\s+on\s+(.+))?$/);
  if (fm) {
    let weekdays = null;
    if (fm[1]) {
      weekdays = [];
      for (const part of fm[1].split(/\s*,\s*|\s+and\s+/)) {
        const name = part.trim().replace(/s$/, '');
        if (!(name in WEEKDAY_NAMES)) return null;
        const idx = WEEKDAY_NAMES[name];
        if (!weekdays.includes(idx)) weekdays.push(idx);
      }
      weekdays.sort((a, b) => a - b);
      if (weekdays.length === 0) weekdays = null;
    }
    return { unit: 'week', interval, weekdays, whenDone };
  }
  fm = rest.match(/^(?:month|months)(?:\s+on\s+the\s+(.+))?$/);
  if (fm) {
    let monthDay = null;
    if (fm[1]) {
      const spec = fm[1].trim();
      if (spec === 'last') monthDay = 'last';
      else {
        const dm = spec.match(/^(\d+)(?:st|nd|rd|th)?$/);
        if (!dm) return null;
        monthDay = Number(dm[1]);
        if (monthDay < 1 || monthDay > 31) return null;
      }
    }
    return { unit: 'month', interval, monthDay, whenDone };
  }
  if (rest === 'year' || rest === 'years') return { unit: 'year', interval, whenDone };
  return null;
}

// Naechstes Vorkommen strikt NACH base (ISO-Datum). Sicherheits-Deckel
// gegen theoretische Endlos-Suchen (Regel ohne erreichbaren Tag).
function nextOccurrenceDate(rule, base) {
  const baseNum = isoToDayNumber(base);
  if (rule.unit === 'day') return dayNumberToIso(baseNum + rule.interval);
  if (rule.unit === 'weekday') {
    let n = baseNum + 1;
    while (weekdayOfDayNumber(n) > 4) n++;
    return dayNumberToIso(n);
  }
  if (rule.unit === 'week') {
    if (!rule.weekdays) return dayNumberToIso(baseNum + rule.interval * 7);
    // Wochen ab Montag; Vorkommen in Basis-Woche plus k Zyklen.
    const baseWeekStart = baseNum - weekdayOfDayNumber(baseNum);
    for (let k = 0; k <= 520; k++) {
      const weekStart = baseWeekStart + k * rule.interval * 7;
      for (const wd of rule.weekdays) {
        const cand = weekStart + wd;
        if (cand > baseNum) return dayNumberToIso(cand);
      }
    }
    return null;
  }
  if (rule.unit === 'month') {
    const by = Number(base.slice(0, 4));
    const bm = Number(base.slice(5, 7));
    const bd = Number(base.slice(8, 10));
    const anchorDay = rule.monthDay == null ? bd : rule.monthDay;
    // k startet bei interval (gleicher Tag, naechster Zyklus) bzw. 0
    // (ein fester Monatstag kann noch im Basis-Monat liegen).
    for (let k = rule.monthDay == null ? rule.interval : 0; k <= 1200; k += rule.interval) {
      const total = bm - 1 + k;
      const y = by + Math.floor(total / 12);
      const mth = (total % 12) + 1;
      const dim = daysInMonth(y, mth);
      const day = anchorDay === 'last' ? dim : anchorDay;
      if (day > dim) continue; // Zyklus ohne diesen Tag ueberspringen
      const cand = dayNumberFromDate(y, mth, day);
      if (cand > baseNum) return dayNumberToIso(cand);
    }
    return null;
  }
  if (rule.unit === 'year') {
    const by = Number(base.slice(0, 4));
    const bm = Number(base.slice(5, 7));
    const bd = Number(base.slice(8, 10));
    for (let k = rule.interval; k <= 400; k += rule.interval) {
      const y = by + k;
      if (bd > daysInMonth(y, bm)) continue; // 29.02. nur in Schaltjahren
      const cand = dayNumberFromDate(y, bm, bd);
      if (cand > baseNum) return dayNumberToIso(cand);
    }
    return null;
  }
  return null;
}

// Folge-Instanz beim Abschluss einer wiederkehrenden Task. Rechen-Basis
// ist das Referenz-Feld (faellig vor geplant vor Start, nur gueltige
// Werte) bzw. bei "when done" der Abschluss-Tag; die relativen Abstaende
// aller Datumsfelder bleiben erhalten, optionale Uhrzeiten werden
// unveraendert uebernommen (Querschnitt B). Die neue Zeile traegt das
// Kern-Offen-Zeichen, keine Erledigt-/Abgebrochen-Daten und keine ID-/
// Abhaengigkeits-Marker (Referenz-Verhalten); das Erstellt-Datum wird
// bei aktiver Automatik frisch gesetzt, sonst entfernt. Rueckgabe null,
// wenn keine Instanz zu erzeugen ist (Regel unparsebar oder kein
// Datumsfeld) — das Original-Modell bleibt unangetastet (Klon ueber den
// Round-Trip).
function buildRecurrenceInstance(model, opts) {
  const completionDate = opts && opts.completionDate;
  const autoCreated = !!(opts && opts.autoCreated);
  if (!model || !model.recurrence) return null;
  const rule = parseRecurrenceRule(model.recurrence.text);
  if (!rule) return null;
  const refField = primaryDateField(model);
  if (!refField) return null;
  const oldRef = model[refField].date;
  const base = rule.whenDone && completionDate ? completionDate : oldRef;
  const newRef = nextOccurrenceDate(rule, base);
  if (!newRef) return null;
  const delta = isoToDayNumber(newRef) - isoToDayNumber(oldRef);
  const clone = parseTaskLine(serializeTaskLine(model));
  for (const f of ['due', 'scheduled', 'start']) {
    const v = clone[f];
    if (!v || v.invalid) continue;
    setDateField(clone, f, {
      date: dayNumberToIso(isoToDayNumber(v.date) + delta),
      time: v.time,
    });
  }
  // 4T-0525 (Epic 3E-0095): der Erinnerungs-Marker wandert um dasselbe
  // Delta mit (Workshop-Punkt 4, Abstands-Erhalt; Uhrzeit unveraendert).
  if (clone.reminder && !clone.reminder.invalid) {
    setReminder(clone, {
      date: dayNumberToIso(isoToDayNumber(clone.reminder.date) + delta),
      time: clone.reminder.time,
    });
  }
  setDateField(clone, 'done', null);
  setDateField(clone, 'cancelled', null);
  setDateField(clone, 'created', autoCreated && completionDate ? { date: completionDate } : null);
  setStatusChar(clone, ' ');
  stripIdAndDependsOn(clone);
  return serializeTaskLine(clone);
}

module.exports = {
  TASK_DATE_FIELDS,
  DATE_MARKER_SYMBOLS,
  // 4T-0937 (Befund B-09): Die Klick-Dekoration der Datums-Werte leitet ihre
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
  setRecurrence,
  setReminder,
  setTaskId,
  setDependsOn,
  isValidTaskId,
  generateTaskId,
  computeDependencyFlags,
  stripIdAndDependsOn,
  isTaskLine,
  modelMatchesGlobalFilter,
  stripGlobalFilter,
  priorityRank,
  comparePriority,
  compareDateValue,
  isValidIsoDate,
  isValidTime,
  shiftIsoDateByDays,
  primaryDateField,
  computeUrgency,
  parseRecurrenceRule,
  nextOccurrenceDate,
  buildRecurrenceInstance,
};
