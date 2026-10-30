// 4T-002419 (Epic 3E-000366): Zeitplan-Grammatik und Fälligkeits-Rechnung der
// Workflows (Story 4S-001130, Entscheidungen 2a und 2b der Konzept-Runde
// 4T-002418).
//
// Bestands-Lesung: Die acht Beispiele sind die aus 2a; Wochentage zählen ab
// Montag = 0 wie `weekdayOfDayNumber` in `src/shared/tasks/task-recurrence.js`.
// Die Zeitumstellung wird mit einer injizierten Zeitzone geprüft (deterministisch
// auf jedem Rechner) und einmal mit der echten Zeitzone Europe/Berlin.
import { describe, it, expect, afterEach } from 'vitest';
import {
  MISSED_DEFAULT,
  MISSED_VALUES,
  SCHEDULE_FINDINGS,
  SCHEDULE_TRIGGER,
  localMinuteExists,
  nextScheduleDue,
  parseSchedule,
} from '../../src/shared/workflows/workflow-schedule.js';

const regel = (text) => {
  const r = parseSchedule(text);
  if (!r.ok) throw new Error(`nicht lesbar: ${text} (${r.code})`);
  return r.rule;
};
const code = (text) => parseSchedule(text).code;
const naechste = (text, ab, optionen) => nextScheduleDue(regel(text), ab, optionen);

// Eine Zeitzone, in der am 2026-03-29 die Minuten 02:00 bis 02:59 ausfallen.
const ohneZweiUhr = { minuteExists: (wall) => !/^2026-03-29T02:/.test(wall) };

describe('Konstanten', () => {
  it('kennt den Auslöser, die Werte von missed und die Befund-Codes', () => {
    expect(SCHEDULE_TRIGGER).toBe('schedule');
    expect(MISSED_VALUES).toEqual(['run-once', 'skip']);
    expect(MISSED_DEFAULT).toBe('run-once');
    expect(SCHEDULE_FINDINGS).toEqual({
      unreadable: 'scheduleUnreadable',
      atMissing: 'scheduleAtMissing',
      atNotAllowed: 'scheduleAtNotAllowed',
    });
  });
});

describe('Grammatik: die acht Beispiele aus 2a (AK1)', () => {
  it.each([
    ['every day at 08:00', { unit: 'day', interval: 1, time: '08:00' }],
    ['every weekday at 07:30', { unit: 'weekday', interval: 1, time: '07:30' }],
    [
      'every monday, thursday at 18:00',
      { unit: 'week', interval: 1, weekdays: [0, 3], time: '18:00' },
    ],
    [
      'every 2 weeks on monday at 08:00',
      { unit: 'week', interval: 2, weekdays: [0], time: '08:00' },
    ],
    ['every month on the 1st at 09:00', { unit: 'month', interval: 1, monthDay: 1, time: '09:00' }],
    [
      'every month on the last at 17:00',
      { unit: 'month', interval: 1, monthDay: 'last', time: '17:00' },
    ],
    ['every 30 minutes', { unit: 'minute', interval: 30, time: null }],
    ['every 2 hours', { unit: 'hour', interval: 2, time: null }],
  ])('%s', (text, erwartet) => {
    expect(parseSchedule(text)).toEqual({ ok: true, rule: erwartet });
  });
});

describe('Grammatik: jede Form der Tabelle', () => {
  it('liest Einzahl und Mehrzahl jeder Einheit, mit und ohne Zahl', () => {
    expect(regel('every minute')).toEqual({ unit: 'minute', interval: 1, time: null });
    expect(regel('every hour')).toEqual({ unit: 'hour', interval: 1, time: null });
    expect(regel('every 3 days at 06:15')).toMatchObject({ unit: 'day', interval: 3 });
    expect(regel('every weekdays at 07:00')).toMatchObject({ unit: 'weekday' });
    expect(regel('every week on sunday at 20:00')).toMatchObject({ unit: 'week', weekdays: [6] });
    expect(regel('every 3 months on the 15th at 10:00')).toMatchObject({
      unit: 'month',
      interval: 3,
      monthDay: 15,
    });
    expect(regel('every 2 months on the last at 23:59')).toMatchObject({ monthDay: 'last' });
  });

  it('liest Wochentag-Listen mit Komma und and, sortiert und ohne Doppel', () => {
    expect(regel('every week on friday and monday at 09:00').weekdays).toEqual([0, 4]);
    expect(regel('every monday, monday, sunday at 09:00').weekdays).toEqual([0, 6]);
    expect(regel('every saturday at 10:00').weekdays).toEqual([5]);
  });

  it('liest die Tageszahl mit jeder Ordinal-Endung und ohne', () => {
    for (const [tag, wert] of [
      ['1st', 1],
      ['2nd', 2],
      ['3rd', 3],
      ['31st', 31],
      ['4th', 4],
      ['12', 12],
    ]) {
      expect(regel(`every month on the ${tag} at 09:00`).monthDay, tag).toBe(wert);
    }
  });

  it('nimmt Groß- und Kleinschreibung und Leerraum wie die Aufgaben-Wiederholung', () => {
    expect(regel('  Every  Monday,Thursday   AT 18:00 ')).toEqual(
      regel('every monday, thursday at 18:00'),
    );
  });
});

describe('Grammatik: Befunde (AK2)', () => {
  it('meldet eine Zeile, die keiner Form folgt, als nicht lesbar', () => {
    for (const text of [
      '',
      'daily',
      'every',
      'every 0 minutes',
      'every fortnight at 08:00',
      'every day at 8:00',
      'every day at 24:00',
      'every day at 08:60',
      'every day at',
      'every week at 08:00',
      'every 2 weeks at 08:00',
      'every week on funday at 08:00',
      'every month at 09:00',
      'every month on the 32nd at 09:00',
      'every month on the 0th at 09:00',
      'every month on the first at 09:00',
      'every 2 weekdays at 08:00',
      'every 2 monday at 08:00',
      'every day at 08:00 at 09:00',
      'every day extra at 08:00',
      '0 8 * * 1',
    ]) {
      expect(code(text), text).toBe('scheduleUnreadable');
    }
    expect(code(42)).toBe('scheduleUnreadable');
    expect(code(null)).toBe('scheduleUnreadable');
  });

  it('meldet fehlendes at bei Tag, Woche und Monat', () => {
    for (const text of [
      'every day',
      'every weekday',
      'every monday',
      'every 2 weeks on monday',
      'every month on the last',
    ]) {
      expect(code(text), text).toBe('scheduleAtMissing');
    }
  });

  it('meldet at bei Minuten und Stunden', () => {
    expect(code('every 30 minutes at 08:00')).toBe('scheduleAtNotAllowed');
    expect(code('every hour at 08:00')).toBe('scheduleAtNotAllowed');
  });
});

describe('Fälligkeit: Grundformen (AK5)', () => {
  it('liefert den Termin im Format JJJJ-MM-TTTHH:MM streng nach dem Bezugszeitpunkt', () => {
    expect(naechste('every day at 08:00', '2026-10-28T07:59')).toBe('2026-10-28T08:00');
    expect(naechste('every day at 08:00', '2026-10-28T08:00')).toBe('2026-10-29T08:00');
    expect(naechste('every 3 days at 08:00', '2026-10-28T08:00')).toBe('2026-10-31T08:00');
    expect(naechste('every 3 days at 08:00', '2026-10-28T07:00')).toBe('2026-10-28T08:00');
  });

  it('zählt Minuten und Stunden ab dem Bezugszeitpunkt, über Mitternacht', () => {
    expect(naechste('every 30 minutes', '2026-10-28T23:45')).toBe('2026-10-29T00:15');
    expect(naechste('every 2 hours', '2026-12-31T23:10')).toBe('2027-01-01T01:10');
  });

  it('beginnt die Woche am Montag', () => {
    // 2026-10-28 ist ein Mittwoch.
    expect(naechste('every weekday at 07:30', '2026-10-30T08:00')).toBe('2026-11-02T07:30');
    expect(naechste('every monday, thursday at 18:00', '2026-10-28T12:00')).toBe(
      '2026-10-29T18:00',
    );
    expect(naechste('every monday, thursday at 18:00', '2026-10-29T18:00')).toBe(
      '2026-11-02T18:00',
    );
    // Die Folge jeder zweiten Woche beginnt mit der Woche des Bezugszeitpunkts
    // (Montag 2026-10-26); der Montag dieser Woche ist vorbei.
    expect(naechste('every 2 weeks on monday at 08:00', '2026-10-28T12:00')).toBe(
      '2026-11-09T08:00',
    );
    expect(naechste('every 2 weeks on monday, sunday at 08:00', '2026-10-28T12:00')).toBe(
      '2026-11-01T08:00',
    );
  });

  it('liest last als letzten Tag des Monats, auch im Februar und im Schaltjahr', () => {
    expect(naechste('every month on the last at 17:00', '2026-02-01T00:00')).toBe(
      '2026-02-28T17:00',
    );
    expect(naechste('every month on the last at 17:00', '2028-02-01T00:00')).toBe(
      '2028-02-29T17:00',
    );
    expect(naechste('every month on the last at 17:00', '2026-01-31T17:00')).toBe(
      '2026-02-28T17:00',
    );
  });

  it('überspringt einen Zieltag, den der Monat nicht hat (31st im April)', () => {
    expect(naechste('every month on the 31st at 09:00', '2026-03-31T09:00')).toBe(
      '2026-05-31T09:00',
    );
    expect(naechste('every month on the 30th at 09:00', '2026-01-30T09:00')).toBe(
      '2026-03-30T09:00',
    );
  });

  it('rechnet über das Monats- und Jahresende', () => {
    expect(naechste('every month on the 1st at 09:00', '2026-12-15T10:00')).toBe(
      '2027-01-01T09:00',
    );
    expect(naechste('every 3 months on the 1st at 09:00', '2026-11-01T09:00')).toBe(
      '2027-02-01T09:00',
    );
  });

  it('liefert null, wenn die Regel in hundert Jahren keinen Termin hat', () => {
    expect(naechste('every 12 months on the 30th at 09:00', '2026-02-01T00:00')).toBeNull();
  });

  it('bricht laut bei einem Bezugszeitpunkt ohne gültige Form', () => {
    expect(() => naechste('every day at 08:00', '2026-10-28 08:00')).toThrow(TypeError);
    expect(() => naechste('every day at 08:00', '2026-02-30T08:00')).toThrow(TypeError);
    expect(() => nextScheduleDue(null, '2026-10-28T08:00')).toThrow(TypeError);
  });
});

describe('Fälligkeit: Zeitumstellung (AK5)', () => {
  it('rückt eine beim Vorstellen der Uhr ausfallende Minute auf die nächste existierende', () => {
    expect(naechste('every day at 02:30', '2026-03-28T02:30', ohneZweiUhr)).toBe(
      '2026-03-29T03:00',
    );
    expect(naechste('every day at 02:30', '2026-03-29T03:00', ohneZweiUhr)).toBe(
      '2026-03-30T02:30',
    );
    expect(naechste('every 30 minutes', '2026-03-29T01:45', ohneZweiUhr)).toBe('2026-03-29T03:00');
  });

  it('hält die Wanduhr-Zeit über beide Zeitumstellungen', () => {
    expect(naechste('every day at 08:00', '2026-03-28T08:00', ohneZweiUhr)).toBe(
      '2026-03-29T08:00',
    );
    expect(naechste('every day at 08:00', '2026-10-24T08:00')).toBe('2026-10-25T08:00');
    expect(naechste('every day at 08:00', '2026-10-25T08:00')).toBe('2026-10-26T08:00');
  });

  describe('mit der echten Zeitzone Europe/Berlin', () => {
    const vorher = process.env.TZ;
    afterEach(() => {
      if (vorher === undefined) delete process.env.TZ;
      else process.env.TZ = vorher;
    });

    it('kennt die ausfallende Stunde im März und die doppelte im Oktober', () => {
      process.env.TZ = 'Europe/Berlin';
      expect(localMinuteExists('2026-03-29T02:30')).toBe(false);
      expect(localMinuteExists('2026-03-29T03:00')).toBe(true);
      expect(localMinuteExists('2026-10-25T02:30')).toBe(true);
      expect(naechste('every day at 02:30', '2026-03-28T02:30')).toBe('2026-03-29T03:00');
      expect(naechste('every day at 02:30', '2026-10-24T02:30')).toBe('2026-10-25T02:30');
    });
  });
});
