// @vitest-environment jsdom
// 4T-000497 (Epic 3E-000090): Migration und Ketten-Toggle im Renderer-Modul
// task-states.js — Aufloesung (resolveStoredTaskStates ergaenzt Typ/Folge-
// Symbol verhaltensneutral, respektiert und normalisiert gespeicherte
// Werte), Persistenz-Form (toStoredTaskStates traegt beide Felder) und der
// Toggle-Uebergang (computeStatusToggle folgt der konfigurierten Kette).
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const taskStates = await import('../../../src/renderer/modules/task-states.js');
// Für den Fall am Dateiende (4T-001896, AK7): die echte Kette samt Augmenter
// der Erweiterung «Aufgaben» und ihrem Wiederholungs-Bauer.
const tasks = await import('../../../src/renderer/modules/tasks.js');
const { buildRecurrenceInstance } = await import('../../../src/shared/tasks/task-recurrence.js');

describe('resolveStoredTaskStates: Typ/Folge-Symbol-Migration (4T-000497)', () => {
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

describe('toStoredTaskStates persistiert Typ/Folge-Symbol (4T-000497)', () => {
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

describe('computeStatusToggle folgt der Kette (4T-000497)', () => {
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

// --- Die Lese-Ansicht bleibt unveraendert (4T-001896, AK7) ------------------------

// Die Tafel legt die Folge-Instanz einer Wiederholung seit 4T-001896 in die
// Quell-Spalte, aus der die Karte gezogen wurde. Das ist ausdruecklich eine
// Aenderung **allein** am Weg ueber die Tafel: Wer im Text auf das Kaestchen
// klickt, bekommt die Instanz weiterhin unmittelbar neben der abgeschlossenen
// Zeile, nach der Einstellung «Instanz oberhalb / unterhalb». Dort gibt es
// keine Spalten, und der Widerspruch, den jene Aenderung aufloest, entsteht gar
// nicht erst.
describe('Wiederholung im Text: die Instanz bleibt neben der Zeile (4T-001896, AK7)', () => {
  function mitKette(wert, lauf) {
    // Die vorangehenden Faelle stellen die Status-Kette um; hier zaehlt die
    // echte, ausgelieferte Kette samt Augmenter der Erweiterung «Aufgaben».
    taskStates.applyTaskStates(taskStates.resolveStoredTaskStates(null));
    taskStates.setStatusToggleAugmenter(tasks.taskToggleAugmenter);
    tasks.setRecurrenceInstanceBuilder((model) =>
      buildRecurrenceInstance(model, { completionDate: tasks.todayIsoDate(), autoCreated: false }),
    );
    tasks.applyTasksConfig({ recurrenceInsert: wert });
    try {
      lauf();
    } finally {
      taskStates.setStatusToggleAugmenter(null);
      tasks.applyTasksConfig(null);
    }
  }

  const TEXT = ['Kopf', '- [ ] Waesche 🔁 every day 📅 2026-01-01', '- [ ] Andere', ''].join('\n');

  it('AK7: oberhalb stellt sie unmittelbar ueber die abgeschlossene Zeile', () => {
    mitKette('above', () => {
      const zeilen = taskStates.statusToggleAufText(TEXT, 2).text.split('\n');
      expect(zeilen[0]).toBe('Kopf');
      expect(zeilen[1]).toMatch(/^- \[ \] Waesche .*📅 2026-01-02/);
      expect(zeilen[2]).toMatch(/^- \[x\] Waesche .*📅 2026-01-01/);
      expect(zeilen[3]).toBe('- [ ] Andere');
    });
  });

  it('AK7: unterhalb stellt sie unmittelbar unter die abgeschlossene Zeile', () => {
    mitKette('below', () => {
      const zeilen = taskStates.statusToggleAufText(TEXT, 2).text.split('\n');
      expect(zeilen[1]).toMatch(/^- \[x\] Waesche .*📅 2026-01-01/);
      expect(zeilen[2]).toMatch(/^- \[ \] Waesche .*📅 2026-01-02/);
      expect(zeilen[3]).toBe('- [ ] Andere');
    });
  });
});
