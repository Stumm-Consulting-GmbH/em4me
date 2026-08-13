// 4T-0499 (Epic 3E-0090): Wiederholungs-Kern — Regel-Parser (alle
// Referenz-Formen plus "when done"), naechstes Vorkommen (Werktags-,
// Wochen-, Monats- und Jahres-Rechnung inklusive Zyklus-Ueberspringen
// bei fehlendem Tag und Schaltjahr) und die Folge-Instanz (Abstands-
// Erhalt mehrerer Datumsfelder, Uhrzeit-Uebernahme, ID-Bereinigung,
// Klon-Garantie).
import { describe, it, expect } from 'vitest';
import {
  parseRecurrenceRule,
  nextOccurrenceDate,
  buildRecurrenceInstance,
} from '../../src/shared/tasks/task-recurrence.js';
import { parseTaskLine, serializeTaskLine } from '../../src/shared/tasks/task-markers.js';

const next = (rule, base) => nextOccurrenceDate(parseRecurrenceRule(rule), base);

describe('parseRecurrenceRule (4T-0499)', () => {
  it('parst alle Referenz-Formen', () => {
    expect(parseRecurrenceRule('every day')).toEqual({ unit: 'day', interval: 1, whenDone: false });
    expect(parseRecurrenceRule('every 3 days when done')).toEqual({
      unit: 'day',
      interval: 3,
      whenDone: true,
    });
    expect(parseRecurrenceRule('every weekday')).toEqual({
      unit: 'weekday',
      interval: 1,
      whenDone: false,
    });
    expect(parseRecurrenceRule('every week')).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: null,
      whenDone: false,
    });
    expect(parseRecurrenceRule('every week on Sunday')).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [6],
      whenDone: false,
    });
    expect(parseRecurrenceRule('every 2 weeks on Monday, Friday')).toEqual({
      unit: 'week',
      interval: 2,
      weekdays: [0, 4],
      whenDone: false,
    });
    expect(parseRecurrenceRule('every week on Tuesday and Thursday')).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [1, 3],
      whenDone: false,
    });
    expect(parseRecurrenceRule('every month')).toEqual({
      unit: 'month',
      interval: 1,
      monthDay: null,
      whenDone: false,
    });
    expect(parseRecurrenceRule('every month on the 15th')).toEqual({
      unit: 'month',
      interval: 1,
      monthDay: 15,
      whenDone: false,
    });
    expect(parseRecurrenceRule('every month on the last')).toEqual({
      unit: 'month',
      interval: 1,
      monthDay: 'last',
      whenDone: false,
    });
    expect(parseRecurrenceRule('every 6 months')).toEqual({
      unit: 'month',
      interval: 6,
      monthDay: null,
      whenDone: false,
    });
    expect(parseRecurrenceRule('every year')).toEqual({
      unit: 'year',
      interval: 1,
      whenDone: false,
    });
  });

  it('liefert null fuer unparsebare Regeln', () => {
    expect(parseRecurrenceRule('irgendwas')).toBeNull();
    expect(parseRecurrenceRule('every week on Funday')).toBeNull();
    expect(parseRecurrenceRule('every 0 days')).toBeNull();
    expect(parseRecurrenceRule('')).toBeNull();
  });
});

describe('nextOccurrenceDate (4T-0499)', () => {
  it('Tages- und Werktags-Rechnung', () => {
    expect(next('every day', '2026-07-10')).toBe('2026-07-11');
    expect(next('every 3 days', '2026-07-10')).toBe('2026-07-13');
    // 2026-07-10 ist ein Freitag: naechster Werktag ist Montag.
    expect(next('every weekday', '2026-07-10')).toBe('2026-07-13');
    expect(next('every weekday', '2026-07-13')).toBe('2026-07-14');
  });

  it('Wochen-Rechnung mit und ohne Wochentags-Liste', () => {
    expect(next('every week', '2026-07-10')).toBe('2026-07-17');
    // Freitag -> Sonntag derselben Woche.
    expect(next('every week on Sunday', '2026-07-10')).toBe('2026-07-12');
    expect(next('every week on Sunday', '2026-07-12')).toBe('2026-07-19');
    // Zwei-Wochen-Zyklus ab der Basis-Woche (Montag-Start).
    expect(next('every 2 weeks on Monday', '2026-07-10')).toBe('2026-07-20');
  });

  it('Monats-Sonderfaelle: 31., Letzter, Zyklus-Ueberspringen', () => {
    expect(next('every month', '2026-07-16')).toBe('2026-08-16');
    // Februar hat keinen 31.: Zyklus wird uebersprungen, nicht geklemmt.
    expect(next('every month', '2026-01-31')).toBe('2026-03-31');
    expect(next('every month on the 15th', '2026-07-10')).toBe('2026-07-15');
    expect(next('every month on the 15th', '2026-07-15')).toBe('2026-08-15');
    expect(next('every month on the last', '2026-02-01')).toBe('2026-02-28');
    expect(next('every month on the last', '2026-02-28')).toBe('2026-03-31');
    expect(next('every month on the 31st', '2026-04-01')).toBe('2026-05-31');
  });

  it('Jahres-Rechnung inklusive Schaltjahr-Sprung', () => {
    expect(next('every year', '2026-07-16')).toBe('2027-07-16');
    expect(next('every year', '2024-02-29')).toBe('2028-02-29');
  });
});

describe('buildRecurrenceInstance (4T-0499)', () => {
  it('erzeugt die Folge-Instanz ab dem Soll-Termin', () => {
    const model = parseTaskLine(
      '- [x] Wochenplanung 🔁 every week on Sunday ⏳ 2026-07-12 ✅ 2026-07-10',
    );
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-10' })).toBe(
      '- [ ] Wochenplanung 🔁 every week on Sunday ⏳ 2026-07-19',
    );
    // Klon-Garantie: das Original-Modell bleibt unangetastet.
    expect(serializeTaskLine(model)).toBe(
      '- [x] Wochenplanung 🔁 every week on Sunday ⏳ 2026-07-12 ✅ 2026-07-10',
    );
  });

  it('erhaelt die relativen Abstaende mehrerer Datumsfelder', () => {
    const model = parseTaskLine(
      '- [x] Alles 🔁 every 10 days 🛫 2026-07-12 ⏳ 2026-07-14 📅 2026-07-16 ✅ 2026-07-10',
    );
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-10' })).toBe(
      '- [ ] Alles 🔁 every 10 days 🛫 2026-07-22 ⏳ 2026-07-24 📅 2026-07-26',
    );
  });

  it('when done rechnet ab dem Abschluss-Tag', () => {
    const model = parseTaskLine('- [x] Müll 🔁 every 3 days when done 📅 2026-07-01 ✅ 2026-07-10');
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-10' })).toBe(
      '- [ ] Müll 🔁 every 3 days when done 📅 2026-07-13',
    );
  });

  it('uebernimmt optionale Uhrzeiten unveraendert (Querschnitt B)', () => {
    const model = parseTaskLine('- [x] Termin 🔁 every week 📅 2026-07-16 14:30 ✅ 2026-07-10');
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-10' })).toBe(
      '- [ ] Termin 🔁 every week 📅 2026-07-23 14:30',
    );
  });

  it('entfernt ID/Abhaengigkeiten und setzt bei Automatik das Erstellt-Datum', () => {
    const model = parseTaskLine(
      '- [x] Kette 🔁 every day 📅 2026-07-16 🆔 abc ⛔ xyz ✅ 2026-07-10',
    );
    expect(
      buildRecurrenceInstance(model, { completionDate: '2026-07-10', autoCreated: true }),
    ).toBe('- [ ] Kette 🔁 every day 📅 2026-07-17 ➕ 2026-07-10');
  });

  it('entfernt ein altes Erstellt-Datum ohne Automatik', () => {
    const model = parseTaskLine('- [x] Alt ➕ 2026-01-01 🔁 every day 📅 2026-07-16 ✅ 2026-07-10');
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-10' })).toBe(
      '- [ ] Alt 🔁 every day 📅 2026-07-17',
    );
  });

  it('liefert null ohne Datumsfeld und bei unparsebarer Regel', () => {
    const ohneDatum = parseTaskLine('- [x] Ohne Datum 🔁 every day ✅ 2026-07-10');
    expect(buildRecurrenceInstance(ohneDatum, { completionDate: '2026-07-10' })).toBeNull();
    const kaputt = parseTaskLine('- [x] Kaputt 🔁 alle drei Tage 📅 2026-07-16 ✅ 2026-07-10');
    expect(buildRecurrenceInstance(kaputt, { completionDate: '2026-07-10' })).toBeNull();
    expect(buildRecurrenceInstance(null, { completionDate: '2026-07-10' })).toBeNull();
  });
});
