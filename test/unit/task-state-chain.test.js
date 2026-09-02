// 4T-000497 (Epic 3E-000090): Ketten-Toggle-Kern der Task-States im Shared-
// Modul plugins.js — Normalisierung (configureTaskStates), Typ-Aufloesung
// (taskStatusType), Folge-Symbol-Kette (taskToggleTarget) und die
// verhaltensneutralen Defaults (TASK_STATE_DEFAULTS). Elektronfrei, damit
// der Kern deterministisch ohne Store getestet wird.
import { describe, it, expect, afterEach } from 'vitest';
import {
  TASK_STATE_DEFAULTS,
  configureTaskStates,
  taskStatusType,
  taskToggleTarget,
} from '../../src/shared/markdown/plugins.js';

// Die Snapshot-Suite haengt am Default-Zustand des aktiven Sets; nach
// jedem Test das Default-Set wiederherstellen.
afterEach(() => {
  configureTaskStates(TASK_STATE_DEFAULTS);
});

describe('configureTaskStates normalisiert Typ und Folge-Symbol (4T-000497)', () => {
  it('unbekannter Typ faellt auf TODO, gueltiger bleibt', () => {
    configureTaskStates([
      { char: '/', enabled: true, type: 'BOGUS', next: 'x' },
      { char: '-', enabled: true, type: 'CANCELLED', next: 'x' },
    ]);
    expect(taskStatusType('/')).toBe('TODO');
    expect(taskStatusType('-')).toBe('CANCELLED');
  });

  it('leeres, mehrzeichiges oder verbotenes Folge-Symbol faellt auf x', () => {
    configureTaskStates([
      { char: '/', enabled: true, type: 'IN_PROGRESS', next: '' },
      { char: '-', enabled: true, type: 'CANCELLED', next: 'ab' },
      { char: '>', enabled: true, type: 'TODO', next: '[' },
      { char: '?', enabled: true, type: 'TODO', next: '\\' },
      { char: '!', enabled: true, type: 'TODO', next: '-' },
    ]);
    expect(taskToggleTarget('/')).toBe('x');
    expect(taskToggleTarget('-')).toBe('x');
    expect(taskToggleTarget('>')).toBe('x');
    expect(taskToggleTarget('?')).toBe('x');
    // Gueltiges Einzel-Folge-Symbol bleibt erhalten.
    expect(taskToggleTarget('!')).toBe('-');
  });
});

describe('taskStatusType (4T-000497)', () => {
  it('Basis-Zustaende fest, konfigurierte liefern ihren Typ, unbekannte null', () => {
    configureTaskStates([{ char: '/', enabled: true, type: 'IN_PROGRESS', next: 'x' }]);
    expect(taskStatusType(' ')).toBe('TODO');
    expect(taskStatusType('x')).toBe('DONE');
    expect(taskStatusType('X')).toBe('DONE');
    expect(taskStatusType('/')).toBe('IN_PROGRESS');
    expect(taskStatusType('#')).toBeNull();
  });
});

describe('taskToggleTarget (4T-000497)', () => {
  it('Basis toggelt fest, konfiguriertes Folge-Symbol wird gefolgt, unbekannt null', () => {
    configureTaskStates([
      { char: '/', enabled: true, type: 'IN_PROGRESS', next: '-' },
      { char: '-', enabled: true, type: 'CANCELLED', next: 'x' },
    ]);
    expect(taskToggleTarget(' ')).toBe('x');
    expect(taskToggleTarget('x')).toBe(' ');
    expect(taskToggleTarget('X')).toBe(' ');
    // Kette: '/' -> '-' (anderes Status-Zeichen) -> 'x'.
    expect(taskToggleTarget('/')).toBe('-');
    expect(taskToggleTarget('-')).toBe('x');
    expect(taskToggleTarget('#')).toBeNull();
  });
});

describe('TASK_STATE_DEFAULTS sind verhaltensneutral (4T-000497)', () => {
  it('alle Folge-Symbole x, Typen wie spezifiziert', () => {
    expect(TASK_STATE_DEFAULTS.every((s) => s.next === 'x')).toBe(true);
    const byChar = new Map(TASK_STATE_DEFAULTS.map((s) => [s.char, s]));
    expect(byChar.get('/').type).toBe('IN_PROGRESS');
    expect(byChar.get('-').type).toBe('CANCELLED');
    for (const ch of ['>', '?', '!', '*']) {
      expect(byChar.get(ch).type).toBe('TODO');
    }
  });
});
