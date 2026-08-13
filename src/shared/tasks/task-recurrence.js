// 4T-0983 (Epic 3E-0196): Wiederholungs-Schicht des Task-Marker-Kerns —
// aus `task-markers.js` ausgezogen, Funktions-Rümpfe unverändert.
//
// Inhalt:
// - Tages-Arithmetik auf fortlaufenden Tages-Nummern (zeitzonenfrei,
//   ohne Date-Objekte); sie trägt sowohl die Wiederholung als auch den
//   Verschiebe-Knopf der Abfrage-Treffer.
// - Wiederholungs-Regel: Mutator des Regel-Segments, Regel-Parser und
//   Erzeugung der Folge-Instanz beim Abschluss.
// - Dringlichkeits-Score: rechnet auf Tages-Basis und liegt deshalb hier
//   bei der Tages-Arithmetik, nicht beim Parser.
//
// Import-Richtung: nur der Kern `task-markers.js` wird geladen, nie ein
// Schwester-Modul — der Import-Graph des Ordners bleibt azyklisch.
// Prozessneutral wie der Kern (CJS, kein Electron, kein DOM).
'use strict';

const {
  RECURRENCE_SYMBOL,
  daysInMonth,
  findLastSegment,
  leadingWs,
  parseTaskLine,
  serializeTaskLine,
  setDateField,
  setReminder,
  setStatusChar,
  stripIdAndDependsOn,
} = require('./task-markers.js');

// --- Tages-Arithmetik ----------------------------------------------------------------
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

// --- Mutator des Regel-Segments -------------------------------------------------------

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
  shiftIsoDateByDays,
  primaryDateField,
  setRecurrence,
  computeUrgency,
  parseRecurrenceRule,
  nextOccurrenceDate,
  buildRecurrenceInstance,
};
