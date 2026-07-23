// @vitest-environment jsdom
// 4T-0497 (Epic 3E-0090): Migration und Ketten-Toggle im Renderer-Modul
// task-states.js — Aufloesung (resolveStoredTaskStates ergaenzt Typ/Folge-
// Symbol verhaltensneutral, respektiert und normalisiert gespeicherte
// Werte), Persistenz-Form (toStoredTaskStates traegt beide Felder) und der
// Toggle-Uebergang (computeStatusToggle folgt der konfigurierten Kette).
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const taskStates = await import('../../../src/renderer/modules/task-states.js');

describe('resolveStoredTaskStates: Typ/Folge-Symbol-Migration (4T-0497)', () => {
  it('ergaenzt fehlende Felder verhaltensneutral (builtin aus Default, alle next x)', () => {
    const list = taskStates.resolveStoredTaskStates(null);
    const slash = list.find((s) => s.char === '/');
    expect(slash.type).toBe('IN_PROGRESS');
    expect(slash.next).toBe('x');
    expect(list.every((s) => s.next === 'x')).toBe(true);
  });

  it('custom-Eintrag ohne Typ/Folge-Symbol bekommt TODO und x', () => {
    const list = taskStates.resolveStoredTaskStates([
      { char: '+', builtin: false, enabled: true, label: 'Geplant' },
    ]);
    const plus = list.find((s) => s.char === '+');
    expect(plus.type).toBe('TODO');
    expect(plus.next).toBe('x');
  });

  it('respektiert gespeicherte Werte (builtin und custom)', () => {
    const list = taskStates.resolveStoredTaskStates([
      { char: '/', name: 'inProgress', builtin: true, enabled: true, type: 'DONE', next: '/' },
      { char: '+', builtin: false, enabled: true, label: 'Geplant', type: 'ON_HOLD', next: 'z' },
    ]);
    const slash = list.find((s) => s.char === '/');
    expect(slash.type).toBe('DONE');
    expect(slash.next).toBe('/');
    const plus = list.find((s) => s.char === '+');
    expect(plus.type).toBe('ON_HOLD');
    expect(plus.next).toBe('z');
  });

  it('normalisiert ungueltige Werte (Typ -> Fallback TODO, Folge-Symbol -> x)', () => {
    const list = taskStates.resolveStoredTaskStates([
      { char: '+', builtin: false, enabled: true, label: 'X', type: 'NOPE', next: '[[' },
    ]);
    const plus = list.find((s) => s.char === '+');
    expect(plus.type).toBe('TODO');
    expect(plus.next).toBe('x');
  });
});

describe('toStoredTaskStates persistiert Typ/Folge-Symbol (4T-0497)', () => {
  it('builtin und custom tragen type und next', () => {
    const resolved = taskStates.resolveStoredTaskStates([
      { char: '+', builtin: false, enabled: true, label: 'Geplant', type: 'ON_HOLD', next: 'z' },
    ]);
    const stored = taskStates.toStoredTaskStates(resolved);
    const builtinSlash = stored.find((s) => s.char === '/');
    expect(builtinSlash.type).toBe('IN_PROGRESS');
    expect(builtinSlash.next).toBe('x');
    const plus = stored.find((s) => s.char === '+');
    expect(plus.type).toBe('ON_HOLD');
    expect(plus.next).toBe('z');
    expect(plus.label).toBe('Geplant');
  });
});

describe('computeStatusToggle folgt der Kette (4T-0497)', () => {
  it('konfiguriertes Folge-Symbol steuert Uebergang und Typen', () => {
    // '/' (IN_PROGRESS) hat Folge-Symbol '-' (CANCELLED) statt hart 'x'.
    const resolved = taskStates.resolveStoredTaskStates([
      {
        char: '/',
        name: 'inProgress',
        builtin: true,
        enabled: true,
        type: 'IN_PROGRESS',
        next: '-',
      },
    ]);
    taskStates.applyTaskStates(resolved);
    const toggle = taskStates.computeStatusToggle('- [/] in Arbeit');
    expect(toggle).not.toBeNull();
    expect(toggle.fromChar).toBe('/');
    expect(toggle.toChar).toBe('-');
    expect(toggle.fromType).toBe('IN_PROGRESS');
    expect(toggle.toType).toBe('CANCELLED');
  });

  it('liefert null fuer Nicht-Task-Zeilen', () => {
    expect(taskStates.computeStatusToggle('nur Text ohne Checkbox')).toBeNull();
  });
});
