// @vitest-environment jsdom
// 4T-000507 (Epic 3E-000096): Unit-Tests der dritten Autocomplete-Quelle
// taskMarkerCompletionSource (autocomplete-help.js) — Trigger-Logik und
// Options-Aufbau auf Task-Zeilen. Der api-Stub (Muster
// task-query-actions.test.js) stellt window.api und das minimale DOM-Geruest
// bereit, bevor die Renderer-Module dynamisch importiert werden. Der Fake-
// Context wird ueber EditorState.create aus '@codemirror/state' gebaut: die
// Quelle liest fuer die Trigger-Entscheidung nur context.state/pos/explicit
// (die apply-Funktionen brauchen eine EditorView und werden hier NICHT
// durchgespielt — siehe Befund im Task).
//
// Wichtig: In der Unit-Umgebung ist das i18n-Dictionary leer (loadTranslations
// laeuft ueber fetch, das hier nicht greift). t() liefert deshalb den Key
// selbst zurueck; die Options-Labels sind die i18n-Keys ('taskMarker.due…',
// 'taskDialog.priority: taskDialog.priority.highest', …). Die Assertions
// pruefen daher gegen Key-Praefixe bzw. das 'prio'-Teilwort (das im Produktiv-
// pfad ebenso in 'Priorität' steckt).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';

const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const tasks = await import('../../../src/renderer/modules/tasks.js');
const ach = await import('../../../src/renderer/modules/editor/autocomplete-help.js');

const DUE = '\u{1F4C5}'; // Kalender-Symbol (faelliger Termin)

// Synthetischer Completion-Context: Zustand aus dem Dokument, Cursor-Position
// (Default = Dokument-Ende) und explicit-Flag (Strg+Leertaste).
function ctx(doc, { pos, explicit = false } = {}) {
  const state = EditorState.create({ doc });
  return { state, pos: pos == null ? doc.length : pos, explicit };
}

beforeEach(() => {
  // Alle Erweiterungen aktiv (autocomplete UND tasks), Konfiguration auf Defaults.
  lifecycle.resetExtensionStateForTests();
  tasks.applyTasksConfig(null);
});

describe('taskMarkerCompletionSource: Trigger-Logik (4T-000507)', () => {
  it('(a) liefert null auf einer Nicht-Task-Zeile', () => {
    expect(ach.taskMarkerCompletionSource(ctx('Alpha prio'))).toBeNull();
  });

  it('(b) ohne explicit erst ab der Mindest-Tipplaenge; explicit umgeht die Klemme', () => {
    tasks.applyTasksConfig({ autocompleteMinLength: 2 });
    // Wort 'p' (Laenge 1) < MinLength 2 -> kein Popup ohne explicit.
    expect(ach.taskMarkerCompletionSource(ctx('- [ ] Task p'))).toBeNull();
    // explicit (Strg+Leertaste) umgeht die Mindestlaenge; leeres Wort =>
    // ungefilterte Optionen.
    const res = ach.taskMarkerCompletionSource(ctx('- [ ] Task ', { explicit: true }));
    expect(res).not.toBeNull();
    expect(res.options.length).toBeGreaterThan(0);
  });

  it('(c) Termin-Eintraege nur fuer fehlende Felder (Faellig gesetzt -> Geplant/Start bleiben)', () => {
    // Hoher Schnitt, damit die Abwesenheit von 'Faellig' aussagekraeftig ist
    // (nicht bloss abgeschnitten).
    tasks.applyTasksConfig({ autocompleteMaxSuggestions: 12 });
    const res = ach.taskMarkerCompletionSource(
      ctx(`- [ ] Alpha ${DUE} 2099-01-01 `, { explicit: true }),
    );
    expect(res).not.toBeNull();
    const labels = res.options.map((o) => o.label);
    // Faelliger Termin ist gesetzt -> kein 'Faellig…'-Eintrag.
    expect(labels.some((l) => l.startsWith('taskMarker.due'))).toBe(false);
    // Geplant und Start fehlen noch -> beide als Termin-Eintrag vorhanden.
    expect(labels.some((l) => l.startsWith('taskMarker.scheduled'))).toBe(true);
    expect(labels.some((l) => l.startsWith('taskMarker.start'))).toBe(true);
  });

  it("(d) Wort-Filter: 'prio' matcht die Prioritaets-Eintraege, Termine fallen heraus", () => {
    const res = ach.taskMarkerCompletionSource(ctx('- [ ] Alpha prio'));
    expect(res).not.toBeNull();
    const labels = res.options.map((o) => o.label);
    expect(labels.length).toBeGreaterThan(0);
    // Jede verbleibende Option enthaelt 'prio' (Key traegt 'priority').
    expect(labels.every((l) => l.toLowerCase().includes('prio'))).toBe(true);
    // Es sind Prioritaets-Eintraege, keine Termin-/Wiederholungs-Eintraege.
    expect(labels.some((l) => l.startsWith('taskDialog.priority'))).toBe(true);
    expect(labels.some((l) => l.startsWith('taskMarker.'))).toBe(false);
  });

  it('(e) schneidet die Optionen auf autocompleteMaxSuggestions', () => {
    tasks.applyTasksConfig({ autocompleteMaxSuggestions: 3 });
    const res = ach.taskMarkerCompletionSource(ctx('- [ ] Alpha ', { explicit: true }));
    expect(res).not.toBeNull();
    expect(res.options).toHaveLength(3);
  });

  it('(f) liefert null im #tag-Kontext auf einer Task-Zeile', () => {
    expect(ach.taskMarkerCompletionSource(ctx('- [ ] Alpha #ta'))).toBeNull();
  });

  it('liefert null, wenn der Cursor noch in der Status-Box steht (hinter der Box gefordert)', () => {
    // offsetInLine 3 liegt innerhalb '- [ ' (<= headLen der Zeile).
    expect(ach.taskMarkerCompletionSource(ctx('- [ ] Alpha', { pos: 3 }))).toBeNull();
  });

  it('liefert null bei inaktiver Erweiterung tasks', async () => {
    await lifecycle.applyExtensionsState(['tasks'], { persist: false });
    expect(ach.taskMarkerCompletionSource(ctx('- [ ] Alpha prio'))).toBeNull();
  });

  it('liefert null bei inaktiver Erweiterung autocomplete', async () => {
    await lifecycle.applyExtensionsState(['autocomplete'], { persist: false });
    expect(ach.taskMarkerCompletionSource(ctx('- [ ] Alpha prio'))).toBeNull();
  });

  it('liefert null bei Global-Filter-Nichttreffer', () => {
    // Global Filter #task: die Zeile ohne #task-Tag passt nicht.
    tasks.applyTasksConfig({ globalFilter: '#task' });
    expect(ach.taskMarkerCompletionSource(ctx('- [ ] Alpha prio'))).toBeNull();
  });
});
