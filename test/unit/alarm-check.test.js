// 4T-0637 (Epic 3E-0069): Unit-Tests der Scheduler-Factory
// createAlarmChecker (src/main/alarm-check.js) mit vollstaendig injizierten
// Fake-Abhaengigkeiten (kein Electron): Faelligkeits-Fenster statt
// „Zeitpunkt erreicht", kein Doppel-Feuern, verpasste Zeitpunkte nach
// Standby, Schlummern, Abschalten einmaliger Wecker, Aus-Zustand der
// Erweiterung und die Fehler-Isolation im Takt. Die Uhr (deps.now) ist pro
// Test verstellbar, deps.send zeichnet die Zustellungen auf. Datumswerte in
// 2099 (nie Gegenwart), Muster reminder-check.test.js.
import { describe, it, expect } from 'vitest';
import {
  createAlarmChecker,
  CHECK_INTERVAL_MS,
  MAX_WINDOW_MS,
} from '../../src/main/alarm-check.js';

const START = new Date(2099, 5, 15, 6, 59, 30); // Montag, 06:59:30

function makeHarness(init = {}) {
  const cfg = {
    enabled: init.enabled !== false,
    alarms: init.alarms || [{ id: 'a1', time: '07:00', repeat: 'daily' }],
    now: init.now || START,
    throwAlarms: false,
  };
  const sent = [];
  const firedIds = [];
  const checker = createAlarmChecker({
    alarms: () => {
      if (cfg.throwAlarms) throw new Error('alarms boom');
      return cfg.alarms;
    },
    enabled: () => cfg.enabled,
    send: (payload) => sent.push(payload),
    onFired: (ids) => firedIds.push(ids),
    now: () => cfg.now,
  });
  return {
    checker,
    cfg,
    sent,
    firedIds,
    // Uhr stellen (Minuten ab START-Tag 07:00 sind die Testfaelle).
    at(h, m, s = 0) {
      cfg.now = new Date(2099, 5, 15, h, m, s);
    },
    atDay(day, h, m) {
      cfg.now = new Date(2099, 5, day, h, m, 0);
    },
    items() {
      return sent.flatMap((p) => p.items);
    },
  };
}

describe('Wecker-Pruefer: Faelligkeit (4T-0637)', () => {
  it('meldet den Wecker im Lauf nach seinem Zeitpunkt', () => {
    const h = makeHarness();
    h.checker.start();
    h.at(7, 0, 0);
    h.checker.tick();
    expect(h.items()).toHaveLength(1);
    expect(h.items()[0]).toMatchObject({ id: 'a1', time: '07:00', key: 'a1|2099-06-15' });
  });

  it('feuert denselben Wecker am selben Tag nicht doppelt', () => {
    const h = makeHarness();
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    h.at(7, 0, 30);
    h.checker.tick();
    h.at(7, 1);
    h.checker.tick();
    expect(h.items()).toHaveLength(1);
  });

  it('ein taeglicher Wecker feuert am Folgetag erneut', () => {
    const h = makeHarness();
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    h.atDay(16, 7, 0);
    h.checker.tick();
    expect(h.items().map((i) => i.key)).toEqual(['a1|2099-06-15', 'a1|2099-06-16']);
  });

  it('meldet einen laengst vergangenen Zeitpunkt nicht nach', () => {
    // Erster Lauf um 09:00: der 07:00-Wecker liegt weit vor dem Fenster.
    const h = makeHarness({ now: new Date(2099, 5, 15, 9, 0) });
    h.checker.start();
    h.checker.tick();
    expect(h.items()).toHaveLength(0);
  });

  it('klemmt das Fenster nach einem langen Standby', () => {
    const h = makeHarness({ alarms: [{ id: 'a1', time: '03:00', repeat: 'daily' }] });
    h.checker.start(); // Bezugspunkt 06:59:30
    // Rechner war stundenlang aus: der 03:00-Wecker liegt jenseits der
    // Fenster-Obergrenze und wird nicht nachgemeldet.
    h.at(12, 0);
    h.checker.tick();
    expect(h.items()).toHaveLength(0);
    expect(MAX_WINDOW_MS).toBeLessThan(60 * 60000);
  });

  it('beachtet den Wochentag', () => {
    const h = makeHarness({
      alarms: [{ id: 'a1', time: '07:00', repeat: 'weekdays', days: [1, 2] }],
    });
    h.checker.start();
    h.at(7, 0);
    h.checker.tick(); // Montag: kein Treffer
    expect(h.items()).toHaveLength(0);
    h.atDay(16, 6, 59); // Dienstag, Bezugspunkt setzen
    h.checker.tick();
    h.atDay(16, 7, 0);
    h.checker.tick();
    expect(h.items()).toHaveLength(1);
  });

  it('meldet die ausgeloesten Kennungen fuer das Abschalten einmaliger Wecker', () => {
    const h = makeHarness({ alarms: [{ id: 'a1', time: '07:00', repeat: 'once' }] });
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    expect(h.firedIds).toEqual([['a1']]);
  });
});

describe('Wecker-Pruefer: Schlummern (4T-0637)', () => {
  it('meldet nach der Schlummer-Dauer erneut', () => {
    const h = makeHarness();
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    expect(h.checker.snooze('a1|2099-06-15', 5)).toBe(true);
    h.at(7, 3);
    h.checker.tick();
    expect(h.items()).toHaveLength(1); // noch nicht faellig
    h.at(7, 5);
    h.checker.tick();
    expect(h.items()).toHaveLength(2);
    // Danach ist der Schlummer-Termin verbraucht.
    h.at(7, 10);
    h.checker.tick();
    expect(h.items()).toHaveLength(2);
  });

  it('Bestaetigen raeumt einen laufenden Schlummer-Termin ab', () => {
    const h = makeHarness();
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    h.checker.snooze('a1|2099-06-15', 5);
    h.checker.confirm('a1|2099-06-15');
    h.at(7, 6);
    h.checker.tick();
    expect(h.items()).toHaveLength(1);
  });

  it('ein zwischenzeitlich geloeschter Wecker schlummert nicht weiter', () => {
    const h = makeHarness();
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    h.checker.snooze('a1|2099-06-15', 5);
    h.cfg.alarms = [];
    h.at(7, 6);
    h.checker.tick();
    expect(h.items()).toHaveLength(1);
  });

  it('Schlummern eines unbekannten Schluessels ist wirkungslos', () => {
    const h = makeHarness();
    h.checker.start();
    expect(h.checker.snooze('gibtsnicht|2099-06-15', 5)).toBe(false);
    expect(h.checker.snooze('', 5)).toBe(false);
  });
});

describe('Wecker-Pruefer: Gates und Robustheit (4T-0637)', () => {
  it('meldet nichts, solange die Erweiterung aus ist', () => {
    const h = makeHarness({ enabled: false });
    h.checker.start();
    h.at(7, 0);
    h.checker.tick();
    expect(h.items()).toHaveLength(0);
    // Nach dem Einschalten faellt der verpasste Zeitpunkt nicht nach.
    h.cfg.enabled = true;
    h.at(7, 1);
    h.checker.tick();
    expect(h.items()).toHaveLength(0);
  });

  it('ein Fehler in der Wecker-Quelle bricht den Takt nicht', () => {
    const h = makeHarness();
    h.checker.start();
    h.cfg.throwAlarms = true;
    h.at(7, 0);
    expect(() => h.checker.tick()).not.toThrow();
    h.cfg.throwAlarms = false;
    h.at(7, 1);
    h.checker.tick();
    expect(h.items()).toHaveLength(1);
  });

  it('start und stop sind idempotent und der Takt ist der erwartete', () => {
    const h = makeHarness();
    h.checker.start();
    h.checker.start();
    h.checker.stop();
    h.checker.stop();
    expect(CHECK_INTERVAL_MS).toBe(30000);
  });
});
