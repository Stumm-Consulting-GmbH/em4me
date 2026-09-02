// @vitest-environment jsdom
// 4T-000498 (Epic 3E-000090): Renderer-Verwaltung der Erweiterung "Aufgaben" —
// Normalisierung der Konfiguration, der Ketten-Augmenter (Automatik-Daten
// beim Statuswechsel, Global Filter, Aus-Zustand der Erweiterung) und die
// Erstellt-Automatik. Der Aktiv-/Inaktiv-Zustand der Erweiterung wird ueber
// den Renderer-Lebenszyklus geschaltet (Muster mermaid-aus.test.js);
// heutiges Datum kommt aus derselben Ableitung wie der Produktivpfad
// (todayIsoDate), nicht hart kodiert.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const tasks = await import('../../../src/renderer/modules/tasks.js');

const today = tasks.todayIsoDate();

beforeEach(() => {
  // Default: alle Erweiterungen aktiv; Konfiguration auf Defaults.
  lifecycle.resetExtensionStateForTests();
  tasks.applyTasksConfig(null);
});

describe('normalizeTasksConfig (4T-000498)', () => {
  it('liefert die Defaults bei null/undefined', () => {
    const expected = {
      globalFilter: '',
      hideGlobalFilter: false,
      autoCreated: false,
      autoDone: true,
      autoCancelled: true,
      recurrenceInsert: 'above',
      // 4T-000505 (Epic 3E-000096): globale Task-Abfrage (Default leer).
      globalQuery: '',
      // 4T-000507 (Epic 3E-000096): Task-Zeilen-Vervollstaendigung — Mindest-
      // Tipplaenge (Default 2) und maximale Vorschlagszahl (Default 6).
      autocompleteMinLength: 2,
      autocompleteMaxSuggestions: 6,
    };
    expect(tasks.normalizeTasksConfig(null)).toEqual(expected);
    expect(tasks.normalizeTasksConfig(undefined)).toEqual(expected);
  });

  it('klemmt autocompleteMinLength auf 1..5, rundet und faellt bei Nicht-Zahl auf 2 (4T-000507)', () => {
    // Untere/obere Grenze, Rundung, Fallback (clampInt: Number->round->clamp,
    // Fallback bei NaN).
    expect(tasks.normalizeTasksConfig({ autocompleteMinLength: 0 }).autocompleteMinLength).toBe(1);
    expect(tasks.normalizeTasksConfig({ autocompleteMinLength: 99 }).autocompleteMinLength).toBe(5);
    expect(tasks.normalizeTasksConfig({ autocompleteMinLength: 'abc' }).autocompleteMinLength).toBe(
      2,
    );
    expect(tasks.normalizeTasksConfig({ autocompleteMinLength: 3.7 }).autocompleteMinLength).toBe(
      4,
    );
  });

  it('klemmt autocompleteMaxSuggestions auf 3..12, rundet und faellt bei Nicht-Zahl auf 6 (4T-000507)', () => {
    expect(
      tasks.normalizeTasksConfig({ autocompleteMaxSuggestions: 0 }).autocompleteMaxSuggestions,
    ).toBe(3);
    expect(
      tasks.normalizeTasksConfig({ autocompleteMaxSuggestions: 99 }).autocompleteMaxSuggestions,
    ).toBe(12);
    expect(
      tasks.normalizeTasksConfig({ autocompleteMaxSuggestions: 'abc' }).autocompleteMaxSuggestions,
    ).toBe(6);
    expect(
      tasks.normalizeTasksConfig({ autocompleteMaxSuggestions: 3.7 }).autocompleteMaxSuggestions,
    ).toBe(4);
  });

  it('trimmt den Global Filter und akzeptiert below', () => {
    const cfg = tasks.normalizeTasksConfig({
      globalFilter: '  #task  ',
      recurrenceInsert: 'below',
    });
    expect(cfg.globalFilter).toBe('#task');
    expect(cfg.recurrenceInsert).toBe('below');
  });

  it('trimmt die globale Abfrage; Nicht-Strings fallen auf leer zurueck (4T-000505)', () => {
    expect(
      tasks.normalizeTasksConfig({ globalQuery: '  WHERE status.type = "TODO"  ' }).globalQuery,
    ).toBe('WHERE status.type = "TODO"');
    expect(tasks.normalizeTasksConfig({ globalQuery: 42 }).globalQuery).toBe('');
  });

  it('faellt bei unbekannter Einfuege-Position auf above zurueck', () => {
    expect(tasks.normalizeTasksConfig({ recurrenceInsert: 'nirgends' }).recurrenceInsert).toBe(
      'above',
    );
  });
});

describe('taskToggleAugmenter (4T-000498)', () => {
  it('TODO->DONE haengt das Erledigt-Datum an und setzt [x]', () => {
    const res = tasks.taskToggleAugmenter('- [ ] Task 📅 2099-01-01', {
      fromChar: ' ',
      toChar: 'x',
      fromType: 'TODO',
      toType: 'DONE',
    });
    expect(res).not.toBeNull();
    expect(res.lineText).toContain('[x]');
    expect(res.lineText).toContain(`✅ ${today}`);
  });

  it('DONE->TODO entfernt das Erledigt-Segment wieder', () => {
    const res = tasks.taskToggleAugmenter('- [x] Task ✅ 2026-07-01', {
      fromChar: 'x',
      toChar: ' ',
      fromType: 'DONE',
      toType: 'TODO',
    });
    expect(res).not.toBeNull();
    expect(res.lineText).toContain('[ ]');
    expect(res.lineText).not.toContain('✅');
  });

  it('Uebergang auf CANCELLED schreibt das Abgebrochen-Datum', () => {
    const res = tasks.taskToggleAugmenter('- [ ] Task', {
      fromChar: ' ',
      toChar: '-',
      fromType: 'TODO',
      toType: 'CANCELLED',
    });
    expect(res).not.toBeNull();
    expect(res.lineText).toContain('[-]');
    expect(res.lineText).toContain(`❌ ${today}`);
  });

  it('CANCELLED->TODO entfernt das Abgebrochen-Datum', () => {
    const res = tasks.taskToggleAugmenter('- [-] Task ❌ 2026-07-01', {
      fromChar: '-',
      toChar: ' ',
      fromType: 'CANCELLED',
      toType: 'TODO',
    });
    expect(res).not.toBeNull();
    expect(res.lineText).toContain('[ ]');
    expect(res.lineText).not.toContain('❌');
  });

  it('bei abgeschalteten Automatiken liefert der DONE-Uebergang null', () => {
    tasks.applyTasksConfig({ autoDone: false, autoCancelled: false });
    const res = tasks.taskToggleAugmenter('- [ ] Task 📅 2099-01-01', {
      fromChar: ' ',
      toChar: 'x',
      fromType: 'TODO',
      toType: 'DONE',
    });
    expect(res).toBeNull();
  });

  it('bei Global Filter zaehlt nur die passende Zeile', () => {
    tasks.applyTasksConfig({ globalFilter: '#task' });
    const res = tasks.taskToggleAugmenter('- [ ] Task 📅 2099-01-01', {
      fromChar: ' ',
      toChar: 'x',
      fromType: 'TODO',
      toType: 'DONE',
    });
    expect(res).toBeNull();
  });

  it('liefert null bei inaktiver Erweiterung', async () => {
    await lifecycle.applyExtensionsState(['tasks'], { persist: false });
    const res = tasks.taskToggleAugmenter('- [ ] Task 📅 2099-01-01', {
      fromChar: ' ',
      toChar: 'x',
      fromType: 'TODO',
      toType: 'DONE',
    });
    expect(res).toBeNull();
  });

  it('liefert null bei NON_TASK-Uebergaengen', () => {
    const res = tasks.taskToggleAugmenter('- [ ] Task 📅 2099-01-01', {
      fromChar: ' ',
      toChar: '-',
      fromType: 'TODO',
      toType: 'NON_TASK',
    });
    expect(res).toBeNull();
  });
});

describe('withCreatedDate (4T-000498)', () => {
  it('haengt bei aktivem Schalter das Erstellt-Datum an', () => {
    tasks.applyTasksConfig({ autoCreated: true });
    const out = tasks.withCreatedDate('- [ ] Neue Aufgabe');
    expect(out).toContain(`➕ ${today}`);
  });

  it('bleibt ohne Schalter unveraendert', () => {
    const src = '- [ ] Neue Aufgabe';
    expect(tasks.withCreatedDate(src)).toBe(src);
  });

  it('laesst ein bestehendes Erstellt-Datum unveraendert', () => {
    tasks.applyTasksConfig({ autoCreated: true });
    const src = '- [ ] Aufgabe ➕ 2020-01-01';
    expect(tasks.withCreatedDate(src)).toBe(src);
  });
});
