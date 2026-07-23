// 4T-0638 (Epic 3E-0069): Timer- und Stoppuhr-Modell der Uhr-Erweiterung.
//
// Prueft die prozessneutralen Funktionen aus src/shared/clock-timers.js:
// Normalisierung defekter Staende, Restzeit-Rechnung aus Zeitstempeln
// (inklusive Hintergrund-Sprung), Zustands-Uebergaenge, den naechsten
// Ablauf-Zeitpunkt sowie die Formatierung. Bewusst ohne jsdom.
//
// Zeitstempel sind einfache Millisekunden-Zahlen (kein Kalenderbezug), der
// Nullpunkt der Testfaelle ist willkuerlich gewaehlt.
import { describe, expect, it } from 'vitest';
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  durationFromParts,
  expireDueTimers,
  formatDuration,
  formatStopwatch,
  lapStopwatch,
  nextExpiryAt,
  nextTimerId,
  normalizeStopwatch,
  normalizeTimer,
  normalizeTimers,
  partsFromDuration,
  pauseStopwatch,
  pauseTimer,
  resetStopwatch,
  resetTimer,
  startStopwatch,
  startTimer,
  stopwatchElapsed,
  timerIsDue,
  timerProgress,
  timerRemaining,
} from '../../src/shared/clock-timers.js';

const T0 = 1_000_000_000;
const MIN = 60000;

function timer(over = {}) {
  return {
    id: 't1',
    label: '',
    durationMs: 5 * MIN,
    state: 'idle',
    startedAt: null,
    elapsedMs: 0,
    ...over,
  };
}

describe('normalizeTimer (4T-0638)', () => {
  it('uebernimmt einen gueltigen Timer', () => {
    const raw = { id: 't3', label: 'Tee', durationMs: 3 * MIN, state: 'paused', elapsedMs: 1000 };
    expect(normalizeTimer(raw)).toEqual({
      id: 't3',
      label: 'Tee',
      durationMs: 3 * MIN,
      state: 'paused',
      startedAt: null,
      elapsedMs: 1000,
    });
  });

  it('verwirft Eintraege ohne Kennung oder Dauer', () => {
    expect(normalizeTimer(null)).toBeNull();
    expect(normalizeTimer({ durationMs: 1000 })).toBeNull();
    expect(normalizeTimer({ id: 't1' })).toBeNull();
    expect(normalizeTimer({ id: 't1', durationMs: 'viel' })).toBeNull();
  });

  it('klemmt die Dauer auf die Grenzen', () => {
    expect(normalizeTimer({ id: 't1', durationMs: 0 }).durationMs).toBe(MIN_DURATION_MS);
    expect(normalizeTimer({ id: 't1', durationMs: 999e9 }).durationMs).toBe(MAX_DURATION_MS);
  });

  it('macht aus einem laufenden Timer ohne Startzeitpunkt einen pausierten', () => {
    const t = normalizeTimer({ id: 't1', durationMs: MIN, state: 'running', elapsedMs: 5000 });
    expect(t.state).toBe('paused');
    expect(t.elapsedMs).toBe(5000);
  });

  it('entfernt Duplikate und unbrauchbare Eintraege aus der Liste', () => {
    const list = normalizeTimers([timer({ id: 't1' }), timer({ id: 't1' }), null, 'kaputt']);
    expect(list).toHaveLength(1);
    expect(normalizeTimers('kaputt')).toEqual([]);
  });
});

describe('nextTimerId (4T-0638)', () => {
  it('zaehlt ueber den hoechsten Bestand hinaus', () => {
    expect(nextTimerId([])).toBe('t1');
    expect(nextTimerId([timer({ id: 't2' }), timer({ id: 't9' })])).toBe('t10');
  });
});

describe('Restzeit-Rechnung (4T-0638)', () => {
  it('rechnet die Restzeit aus dem Startzeitpunkt statt herunterzuzaehlen', () => {
    const t = timer({ state: 'running', startedAt: T0, durationMs: 5 * MIN });
    expect(timerRemaining(t, T0)).toBe(5 * MIN);
    expect(timerRemaining(t, T0 + MIN)).toBe(4 * MIN);
    // Sprung um vier Minuten (Fenster war im Hintergrund): die Rechnung
    // bleibt korrekt, ohne dass zwischendurch ein Tick lief.
    expect(timerRemaining(t, T0 + 5 * MIN)).toBe(0);
    expect(timerRemaining(t, T0 + 9 * MIN)).toBe(0);
  });

  it('beruecksichtigt die vor der Pause aufgelaufene Zeit', () => {
    const t = timer({ state: 'running', startedAt: T0, elapsedMs: 2 * MIN, durationMs: 5 * MIN });
    expect(timerRemaining(t, T0 + MIN)).toBe(2 * MIN);
  });

  it('timerIsDue gilt nur fuer laufende Timer', () => {
    const laufend = timer({ state: 'running', startedAt: T0, durationMs: MIN });
    expect(timerIsDue(laufend, T0 + MIN)).toBe(true);
    expect(timerIsDue(laufend, T0 + MIN - 1)).toBe(false);
    expect(timerIsDue({ ...laufend, state: 'paused' }, T0 + 9 * MIN)).toBe(false);
    expect(timerIsDue({ ...laufend, state: 'expired' }, T0 + 9 * MIN)).toBe(false);
  });

  it('der Fortschritt laeuft von 0 bis 1', () => {
    const t = timer({ state: 'running', startedAt: T0, durationMs: 4 * MIN });
    expect(timerProgress(t, T0)).toBe(0);
    expect(timerProgress(t, T0 + 2 * MIN)).toBe(0.5);
    expect(timerProgress(t, T0 + 99 * MIN)).toBe(1);
  });
});

describe('Zustands-Uebergaenge Timer (4T-0638)', () => {
  it('Start setzt den Zeitstempel, Pause friert die aufgelaufene Zeit ein', () => {
    const gestartet = startTimer(timer(), T0);
    expect(gestartet).toMatchObject({ state: 'running', startedAt: T0, elapsedMs: 0 });
    const pausiert = pauseTimer(gestartet, T0 + 90000);
    expect(pausiert).toMatchObject({ state: 'paused', startedAt: null, elapsedMs: 90000 });
    // Fortsetzen zaehlt ab der eingefrorenen Zeit weiter.
    const fortgesetzt = startTimer(pausiert, T0 + 5 * MIN);
    expect(fortgesetzt).toMatchObject({ state: 'running', elapsedMs: 90000 });
    expect(timerRemaining(fortgesetzt, T0 + 5 * MIN)).toBe(5 * MIN - 90000);
  });

  it('ein abgelaufener Timer startet wieder von vorn', () => {
    const abgelaufen = timer({ state: 'expired', elapsedMs: 5 * MIN });
    const neu = startTimer(abgelaufen, T0);
    expect(neu).toMatchObject({ state: 'running', startedAt: T0, elapsedMs: 0 });
    expect(timerRemaining(neu, T0)).toBe(5 * MIN);
  });

  it('Zuruecksetzen loescht Laufzustand und aufgelaufene Zeit', () => {
    const t = resetTimer(timer({ state: 'running', startedAt: T0, elapsedMs: 3000 }));
    expect(t).toMatchObject({ state: 'idle', startedAt: null, elapsedMs: 0 });
    // No-op liefert die Eingabe-Referenz.
    const frisch = timer();
    expect(resetTimer(frisch)).toBe(frisch);
  });

  it('Pause und Start sind No-ops im falschen Zustand', () => {
    const pausiert = timer({ state: 'paused', elapsedMs: 1000 });
    expect(pauseTimer(pausiert, T0)).toBe(pausiert);
    const laufend = timer({ state: 'running', startedAt: T0 });
    expect(startTimer(laufend, T0 + 1000)).toBe(laufend);
  });
});

describe('Ablauf und Weckruf-Planung (4T-0638)', () => {
  it('expireDueTimers setzt nur faellige Timer auf abgelaufen', () => {
    const list = [
      timer({ id: 't1', state: 'running', startedAt: T0, durationMs: MIN }),
      timer({ id: 't2', state: 'running', startedAt: T0, durationMs: 10 * MIN }),
      timer({ id: 't3', state: 'paused' }),
    ];
    const next = expireDueTimers(list, T0 + MIN);
    expect(next.map((t) => t.state)).toEqual(['expired', 'running', 'paused']);
    expect(next[0].elapsedMs).toBe(MIN);
    // Ohne Faelligkeit bleibt die Eingabe-Referenz erhalten.
    expect(expireDueTimers(list, T0)).toBe(list);
  });

  it('nextExpiryAt liefert den fruehesten Ablauf laufender Timer', () => {
    const list = [
      timer({ id: 't1', state: 'running', startedAt: T0, durationMs: 10 * MIN }),
      timer({ id: 't2', state: 'running', startedAt: T0, durationMs: 3 * MIN }),
      timer({ id: 't3', state: 'paused', durationMs: MIN }),
    ];
    expect(nextExpiryAt(list, T0)).toBe(T0 + 3 * MIN);
    // Ohne laufenden Timer gibt es keinen Weckruf.
    expect(nextExpiryAt([timer({ state: 'paused' })], T0)).toBeNull();
    expect(nextExpiryAt([], T0)).toBeNull();
  });
});

describe('Stoppuhr (4T-0638)', () => {
  it('normalisiert defekte Staende', () => {
    expect(normalizeStopwatch(null)).toEqual({
      state: 'idle',
      startedAt: null,
      elapsedMs: 0,
      laps: [],
    });
    const sw = normalizeStopwatch({ state: 'running', elapsedMs: 500, laps: [1, 'x', -3, 2] });
    // 'running' ohne Startzeitpunkt wird zu 'paused'.
    expect(sw.state).toBe('paused');
    expect(sw.laps).toEqual([1, 2]);
  });

  it('zaehlt hoch, pausiert und setzt zurueck', () => {
    const gestartet = startStopwatch(resetStopwatch(), T0);
    expect(stopwatchElapsed(gestartet, T0 + 1234)).toBe(1234);
    const pausiert = pauseStopwatch(gestartet, T0 + 2000);
    expect(pausiert.elapsedMs).toBe(2000);
    // Pausiert steht die Zeit still.
    expect(stopwatchElapsed(pausiert, T0 + 9999)).toBe(2000);
    const wieder = startStopwatch(pausiert, T0 + 10000);
    expect(stopwatchElapsed(wieder, T0 + 11000)).toBe(3000);
    expect(resetStopwatch()).toMatchObject({ state: 'idle', elapsedMs: 0, laps: [] });
  });

  it('Runden landen mit der juengsten zuerst in der Liste', () => {
    let sw = startStopwatch(resetStopwatch(), T0);
    sw = lapStopwatch(sw, T0 + 1000);
    sw = lapStopwatch(sw, T0 + 2500);
    expect(sw.laps).toEqual([2500, 1000]);
    // Nur eine laufende Stoppuhr nimmt Runden.
    const pausiert = pauseStopwatch(sw, T0 + 3000);
    expect(lapStopwatch(pausiert, T0 + 4000)).toBe(pausiert);
  });
});

describe('Formatierung und Dauer-Umrechnung (4T-0638)', () => {
  it('formatDuration rundet auf und blendet Stunden nur bei Bedarf ein', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(4200)).toBe('00:05');
    expect(formatDuration(65000)).toBe('01:05');
    expect(formatDuration(3 * 3600000 + 4 * MIN + 5000)).toBe('3:04:05');
    expect(formatDuration(-500)).toBe('00:00');
  });

  it('formatStopwatch trennt Hauptteil und Hundertstel', () => {
    expect(formatStopwatch(83470)).toEqual({ main: '01:23', hundredths: '47' });
    expect(formatStopwatch(0)).toEqual({ main: '00:00', hundredths: '00' });
  });

  it('Dauer und Segment-Teile lassen sich verlustfrei umrechnen', () => {
    expect(durationFromParts(1, 2, 3)).toBe(3600000 + 2 * MIN + 3000);
    expect(partsFromDuration(3600000 + 2 * MIN + 3000)).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 3,
    });
    // Unter der Mindest-Dauer wird geklemmt.
    expect(durationFromParts(0, 0, 0)).toBe(MIN_DURATION_MS);
  });
});
