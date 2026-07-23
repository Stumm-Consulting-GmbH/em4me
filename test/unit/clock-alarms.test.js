// 4T-0637 (Epic 3E-0069): Wecker-Modell der Uhr-Erweiterung.
//
// Prueft die prozessneutralen Funktionen aus src/shared/clock-alarms.js:
// Normalisierung defekter Staende, Kennungs-Vergabe, Wochentags-Logik,
// Faelligkeit im Zeitfenster (inklusive Tageswechsel und verpasster
// Zeitpunkte) sowie das Abschalten einmaliger Wecker. Bewusst ohne jsdom —
// das Modul haengt weder am DOM noch an Electron.
import { describe, expect, it } from 'vitest';
import {
  ALARM_REPEATS,
  DEFAULT_SNOOZE_MINUTES,
  alarmAppliesOn,
  alarmFireKey,
  computeDueAlarms,
  disableFiredOnceAlarms,
  isoWeekdayIndex,
  nextAlarmId,
  normalizeAlarm,
  normalizeAlarms,
  normalizeSnoozeMinutes,
  snoozeUntil,
} from '../../src/shared/clock-alarms.js';

// 2099-06-15 ist ein Montag (nie Gegenwart, Muster reminder-check.test.js).
const MONTAG = new Date(2099, 5, 15, 12, 0, 0, 0);

function alarm(over = {}) {
  return { id: 'a1', time: '07:00', label: '', enabled: true, repeat: 'daily', days: [], ...over };
}

describe('normalizeAlarm (4T-0637)', () => {
  it('uebernimmt einen gueltigen Wecker unveraendert', () => {
    const raw = { id: 'a3', time: '06:45', label: 'Aufstehen', enabled: false, repeat: 'once' };
    expect(normalizeAlarm(raw)).toEqual({
      id: 'a3',
      time: '06:45',
      label: 'Aufstehen',
      enabled: false,
      repeat: 'once',
      days: [],
    });
  });

  it('verwirft Eintraege ohne Kennung oder mit unguelter Uhrzeit', () => {
    expect(normalizeAlarm(null)).toBeNull();
    expect(normalizeAlarm({ time: '07:00' })).toBeNull();
    expect(normalizeAlarm({ id: 'a1' })).toBeNull();
    for (const time of ['7:00', '24:00', '07:60', '0700', '07:00:00', 700]) {
      expect(normalizeAlarm({ id: 'a1', time })).toBeNull();
    }
  });

  it('faellt bei defekten Feldern auf die Defaults zurueck', () => {
    const a = normalizeAlarm({ id: 'a1', time: '07:00', repeat: 'irgendwas', enabled: 'ja' });
    expect(a.repeat).toBe(ALARM_REPEATS[0]);
    expect(a.enabled).toBe(true);
    expect(a.label).toBe('');
  });

  it('kuerzt und trimmt die Bezeichnung', () => {
    const a = normalizeAlarm({ id: 'a1', time: '07:00', label: `  ${'x'.repeat(200)}  ` });
    expect(a.label).toHaveLength(80);
  });

  it('bereinigt die Wochentage und ignoriert sie ausserhalb des Musters', () => {
    const a = normalizeAlarm({
      id: 'a1',
      time: '07:00',
      repeat: 'weekdays',
      days: [4, 0, 0, 9, -1],
    });
    expect(a.days).toEqual([0, 4]);
    const b = normalizeAlarm({ id: 'a1', time: '07:00', repeat: 'daily', days: [1, 2] });
    expect(b.days).toEqual([]);
  });
});

describe('normalizeAlarms (4T-0637)', () => {
  it('sortiert nach Uhrzeit und entfernt Duplikat-Kennungen', () => {
    const list = normalizeAlarms([
      alarm({ id: 'a2', time: '21:30' }),
      alarm({ id: 'a1', time: '07:00' }),
      alarm({ id: 'a1', time: '09:00' }),
      null,
      'kaputt',
    ]);
    expect(list.map((a) => [a.id, a.time])).toEqual([
      ['a1', '07:00'],
      ['a2', '21:30'],
    ]);
  });

  it('macht aus einem Wochentags-Wecker ohne Tag einen taeglichen', () => {
    const [a] = normalizeAlarms([alarm({ repeat: 'weekdays', days: [] })]);
    expect(a.repeat).toBe('daily');
  });

  it('liefert fuer fehlende und defekte Staende eine leere Liste', () => {
    for (const raw of [null, undefined, 'kaputt', 42, {}]) {
      expect(normalizeAlarms(raw)).toEqual([]);
    }
  });
});

describe('nextAlarmId (4T-0637)', () => {
  it('zaehlt ueber den hoechsten Bestand hinaus', () => {
    expect(nextAlarmId([])).toBe('a1');
    expect(nextAlarmId([alarm({ id: 'a1' }), alarm({ id: 'a7' })])).toBe('a8');
    // Fremde Kennungs-Formen stoeren die Zaehlung nicht.
    expect(nextAlarmId([{ id: 'x' }, alarm({ id: 'a2' })])).toBe('a3');
  });
});

describe('Wochentags-Logik (4T-0637)', () => {
  it('zaehlt Montag als 0', () => {
    expect(isoWeekdayIndex(MONTAG)).toBe(0);
    expect(isoWeekdayIndex(new Date(2099, 5, 21))).toBe(6); // Sonntag
  });

  it('alarmAppliesOn beachtet Muster und Aktiv-Schalter', () => {
    expect(alarmAppliesOn(alarm({ repeat: 'daily' }), MONTAG)).toBe(true);
    expect(alarmAppliesOn(alarm({ repeat: 'once' }), MONTAG)).toBe(true);
    expect(alarmAppliesOn(alarm({ enabled: false }), MONTAG)).toBe(false);
    expect(alarmAppliesOn(alarm({ repeat: 'weekdays', days: [0, 1] }), MONTAG)).toBe(true);
    expect(alarmAppliesOn(alarm({ repeat: 'weekdays', days: [1, 2] }), MONTAG)).toBe(false);
  });

  it('der Melde-Schluessel enthaelt den Kalendertag', () => {
    expect(alarmFireKey(alarm(), MONTAG)).toBe('a1|2099-06-15');
  });
});

describe('computeDueAlarms (4T-0637)', () => {
  const fenster = (vonH, vonM, bisH, bisM) => ({
    from: new Date(2099, 5, 15, vonH, vonM, 0, 0),
    to: new Date(2099, 5, 15, bisH, bisM, 0, 0),
  });

  it('meldet einen Wecker, dessen Zeitpunkt ins Fenster faellt', () => {
    const due = computeDueAlarms([alarm({ time: '07:00' })], fenster(6, 59, 7, 0));
    expect(due).toHaveLength(1);
    expect(due[0].key).toBe('a1|2099-06-15');
  });

  it('meldet nichts ausserhalb des Fensters', () => {
    // Zeitpunkt liegt vor dem Fenster (App-Start nach dem Weckzeitpunkt).
    expect(computeDueAlarms([alarm({ time: '07:00' })], fenster(9, 0, 9, 1))).toEqual([]);
    // Zeitpunkt liegt hinter dem Fenster.
    expect(computeDueAlarms([alarm({ time: '07:00' })], fenster(6, 0, 6, 30))).toEqual([]);
  });

  it('meldet einen bereits gemeldeten Schluessel nicht erneut', () => {
    const opts = { ...fenster(6, 59, 7, 0), firedKeys: new Set(['a1|2099-06-15']) };
    expect(computeDueAlarms([alarm({ time: '07:00' })], opts)).toEqual([]);
  });

  it('ueberspringt abgeschaltete Wecker und nicht passende Wochentage', () => {
    expect(
      computeDueAlarms([alarm({ time: '07:00', enabled: false })], fenster(6, 59, 7, 0)),
    ).toEqual([]);
    const nurDienstag = alarm({ time: '07:00', repeat: 'weekdays', days: [1] });
    expect(computeDueAlarms([nurDienstag], fenster(6, 59, 7, 0))).toEqual([]);
  });

  it('deckt den Tageswechsel ab', () => {
    const due = computeDueAlarms([alarm({ time: '00:01' })], {
      from: new Date(2099, 5, 15, 23, 59, 30),
      to: new Date(2099, 5, 16, 0, 1, 0),
    });
    expect(due).toHaveLength(1);
    // Der Schluessel traegt den Tag des Ausloesens, nicht den des Fenster-Starts.
    expect(due[0].key).toBe('a1|2099-06-16');
  });

  it('verlangt ein gueltiges, vorwaerts laufendes Fenster', () => {
    const gleich = new Date(2099, 5, 15, 7, 0);
    expect(computeDueAlarms([alarm()], { from: gleich, to: gleich })).toEqual([]);
    expect(computeDueAlarms([alarm()], { from: null, to: gleich })).toEqual([]);
    expect(computeDueAlarms([alarm()], {})).toEqual([]);
  });
});

describe('Schlummern und einmalige Wecker (4T-0637)', () => {
  it('normalizeSnoozeMinutes klemmt und faellt zurueck', () => {
    expect(normalizeSnoozeMinutes(undefined)).toBe(DEFAULT_SNOOZE_MINUTES);
    expect(normalizeSnoozeMinutes('kaputt')).toBe(DEFAULT_SNOOZE_MINUTES);
    expect(normalizeSnoozeMinutes(0)).toBe(1);
    expect(normalizeSnoozeMinutes(999)).toBe(120);
    expect(normalizeSnoozeMinutes(9.4)).toBe(9);
  });

  it('snoozeUntil verschiebt um die geklemmte Dauer', () => {
    const ziel = snoozeUntil(new Date(2099, 5, 15, 7, 0), 10);
    expect(ziel.getTime()).toBe(new Date(2099, 5, 15, 7, 10).getTime());
  });

  it('disableFiredOnceAlarms schaltet nur ausgeloeste Einmal-Wecker ab', () => {
    const list = [
      alarm({ id: 'a1', repeat: 'once' }),
      alarm({ id: 'a2', repeat: 'daily' }),
      alarm({ id: 'a3', repeat: 'once' }),
    ];
    const next = disableFiredOnceAlarms(list, new Set(['a1', 'a2']));
    expect(next.map((a) => a.enabled)).toEqual([false, true, true]);
    // Ohne Treffer bleibt die Eingabe-Referenz erhalten (No-op).
    expect(disableFiredOnceAlarms(list, new Set(['a9']))).toBe(list);
  });
});
