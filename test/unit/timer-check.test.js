// 4T-0638 (Epic 3E-0069): Unit-Tests der Scheduler-Factory
// createTimerChecker (src/main/timer-check.js) mit vollstaendig injizierten
// Fake-Abhaengigkeiten (kein Electron): gezielter Weckruf statt Polling,
// Etappen-Planung bei langen Wartezeiten, Meldung aller faelligen Timer,
// Zurueckschreiben des Zustands, Aus-Zustand der Erweiterung und die
// Fehler-Isolation.
//
// Die Uhr (deps.now) und der Weckruf (deps.schedule/cancel) sind Fakes: der
// Test steuert selbst, wann ein Weckruf feuert.
import { describe, it, expect } from 'vitest';
import { createTimerChecker, MAX_SLEEP_MS, MIN_SLEEP_MS } from '../../src/main/timer-check.js';

const T0 = 1_000_000_000;
const MIN = 60000;

function makeHarness(init = {}) {
  const cfg = {
    enabled: init.enabled !== false,
    timers: init.timers || [],
    now: init.now || T0,
    throwTimers: false,
  };
  const sent = [];
  const written = [];
  // Fake-Weckruf: haelt genau einen ausstehenden Eintrag fest.
  let pending = null;
  let nextHandle = 1;
  const checker = createTimerChecker({
    timers: () => {
      if (cfg.throwTimers) throw new Error('timers boom');
      return cfg.timers;
    },
    setTimers: (list) => {
      cfg.timers = list;
      written.push(list);
    },
    enabled: () => cfg.enabled,
    send: (payload) => sent.push(payload),
    now: () => cfg.now,
    schedule: (fn, delay) => {
      pending = { fn, delay, handle: nextHandle++ };
      return pending.handle;
    },
    cancel: (handle) => {
      if (pending && pending.handle === handle) pending = null;
    },
  });
  return {
    checker,
    cfg,
    sent,
    written,
    delay: () => (pending ? pending.delay : null),
    // Uhr vorstellen und den ausstehenden Weckruf feuern lassen.
    fireAt(ms) {
      cfg.now = ms;
      const p = pending;
      pending = null;
      if (p) p.fn();
    },
    items: () => sent.flatMap((p) => p.items),
  };
}

function running(id, durationMs, startedAt = T0) {
  return { id, label: id, durationMs, state: 'running', startedAt, elapsedMs: 0 };
}

describe('Timer-Pruefer: Weckruf-Planung (4T-0638)', () => {
  it('plant den Weckruf auf den naechsten Ablauf', () => {
    const h = makeHarness({ timers: [running('t1', 3 * MIN), running('t2', 90000)] });
    h.checker.start();
    expect(h.delay()).toBe(90000);
  });

  it('ohne laufenden Timer steht kein Weckruf', () => {
    const h = makeHarness({ timers: [{ id: 't1', durationMs: MIN, state: 'paused' }] });
    h.checker.start();
    expect(h.checker.isScheduled()).toBe(false);
  });

  it('teilt lange Wartezeiten in Etappen', () => {
    const h = makeHarness({ timers: [running('t1', 8 * 3600000)] });
    h.checker.start();
    expect(h.delay()).toBe(MAX_SLEEP_MS);
    // Etappen-Weckruf meldet nichts und plant weiter.
    h.fireAt(T0 + MAX_SLEEP_MS);
    expect(h.items()).toHaveLength(0);
    expect(h.checker.isScheduled()).toBe(true);
  });

  it('haelt einen Mindest-Vorlauf ein', () => {
    const h = makeHarness({ timers: [running('t1', 1000)] });
    h.cfg.now = T0 + 5000; // Ablauf liegt bereits in der Vergangenheit
    h.checker.start();
    expect(h.delay()).toBe(MIN_SLEEP_MS);
  });

  it('reschedule zieht eine geaenderte Liste nach', () => {
    // 10 Minuten liegen jenseits der Etappen-Obergrenze, deshalb zunaechst
    // MAX_SLEEP_MS; der neue, naehere Timer zieht den Weckruf dann vor.
    const h = makeHarness({ timers: [running('t1', 10 * MIN)] });
    h.checker.start();
    expect(h.delay()).toBe(MAX_SLEEP_MS);
    h.cfg.timers = [running('t1', 10 * MIN), running('t2', 2 * MIN)];
    h.checker.reschedule();
    expect(h.delay()).toBe(2 * MIN);
  });
});

describe('Timer-Pruefer: Meldung (4T-0638)', () => {
  it('meldet den abgelaufenen Timer und schreibt den Zustand zurueck', () => {
    const h = makeHarness({ timers: [running('t1', MIN)] });
    h.checker.start();
    h.fireAt(T0 + MIN);
    expect(h.items()).toHaveLength(1);
    expect(h.items()[0]).toMatchObject({ id: 't1', durationMs: MIN });
    expect(h.written).toHaveLength(1);
    expect(h.cfg.timers[0].state).toBe('expired');
  });

  it('meldet mehrere gleichzeitig faellige Timer zusammen', () => {
    const h = makeHarness({ timers: [running('t1', MIN), running('t2', MIN)] });
    h.checker.start();
    h.fireAt(T0 + MIN);
    expect(h.items().map((i) => i.id)).toEqual(['t1', 't2']);
    expect(h.sent).toHaveLength(1);
  });

  it('meldet nach einem verschlafenen Weckruf alles Faellige', () => {
    const h = makeHarness({ timers: [running('t1', MIN), running('t2', 3 * MIN)] });
    h.checker.start();
    // Standby: der Weckruf feuert erst nach einer Stunde.
    h.fireAt(T0 + 3600000);
    expect(h.items().map((i) => i.id)).toEqual(['t1', 't2']);
  });

  it('meldet denselben Timer nicht zweimal', () => {
    const h = makeHarness({ timers: [running('t1', MIN)] });
    h.checker.start();
    h.fireAt(T0 + MIN);
    h.checker.reschedule();
    h.checker.fire();
    expect(h.items()).toHaveLength(1);
  });

  it('ein pausierter Timer laeuft nicht ab', () => {
    const h = makeHarness({
      timers: [{ id: 't1', durationMs: MIN, state: 'paused', startedAt: null, elapsedMs: 0 }],
    });
    h.checker.start();
    h.checker.fire();
    expect(h.items()).toHaveLength(0);
  });
});

describe('Timer-Pruefer: Gates und Robustheit (4T-0638)', () => {
  it('plant und meldet nichts, solange die Erweiterung aus ist', () => {
    const h = makeHarness({ enabled: false, timers: [running('t1', MIN)] });
    h.checker.start();
    expect(h.checker.isScheduled()).toBe(false);
    h.checker.fire();
    expect(h.items()).toHaveLength(0);
  });

  it('ein Fehler in der Timer-Quelle bricht die Kette nicht', () => {
    const h = makeHarness({ timers: [running('t1', MIN)] });
    h.checker.start();
    h.cfg.throwTimers = true;
    expect(() => h.checker.fire()).not.toThrow();
    h.cfg.throwTimers = false;
    h.checker.reschedule();
    h.fireAt(T0 + MIN);
    expect(h.items()).toHaveLength(1);
  });

  it('stop raeumt den Weckruf ab', () => {
    const h = makeHarness({ timers: [running('t1', MIN)] });
    h.checker.start();
    expect(h.checker.isScheduled()).toBe(true);
    h.checker.stop();
    expect(h.checker.isScheduled()).toBe(false);
  });
});
