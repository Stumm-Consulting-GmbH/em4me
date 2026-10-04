// @vitest-environment jsdom
// 4T-000506 (Epic 3E-000096): Unit-Test des Task-Bearbeitungs-Dialogs
// (showTaskDialog). Der Dialog arbeitet auf einer Round-Trip-Kopie des
// Modells und liefert beim OK den neuen Zeilen-Text bzw. beim Abbruch
// null. Die Datums-Eingabe laeuft ueber den Picker (3E-000091, eigenes
// Testgut); hier wird nur das Formular-zu-Zeile-Verhalten geprueft, nicht
// der Picker selbst.
//
// Aufbau wie die uebrigen Renderer-Unit-Tests: der api-Stub stellt
// window.api und ein minimales DOM-Geruest bereit (Muster
// task-query-actions.test.js), bevor das Modul dynamisch importiert wird;
// das Modal-Geruest aus index.html wird pro Test als HTML-Fixture in
// document.body nachgebaut (nur die von showTaskDialog benoetigten IDs).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';

// 4T-001867 (Epic 3E-000321): Der Datums-Kalender liefert im Prueffall einen
// festen Wert (pickerErgebnis); der Kalender selbst ist eigenes Testgut und
// laeuft im Ablauf-Fall TQ-10 echt. Alle uebrigen Exporte bleiben original,
// weil der Editor-Kern sie beim Laden braucht.
let pickerErgebnis = null;
const pickerAufrufe = [];
vi.mock('../../../src/renderer/modules/calendar/date-picker.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showDateTimePicker: async (opts) => {
    pickerAufrufe.push(opts);
    return pickerErgebnis;
  },
}));

// 4T-000508 (Epic 3E-000096): Die Abhaengigkeits-Suche des Dialogs laeuft ueber
// api.runFrontmatterQuery('LIST TASKS'). Der Basis-Stub (api-stub.js) kennt
// die Methode nicht; hier ein Test-Stub, der standardmaessig eine leere
// Task-Liste liefert (die Bereichs-Suche bleibt damit ohne Kandidaten). NUR im
// Test, nicht produktiv — api.js bindet dieselbe window.api-Objektreferenz, die
// Ergaenzung ist deshalb im Modul sichtbar.
// 4T-002035 (Epic 3E-000260): Die Antwort ist allein die Ergebnismenge; der
// Stub liefert sie in dieser Form, ein Fall setzt Aufgaben-Zeilen ein.
const { makeResultSet, makeRow, makeState, makeTaskInfo, taskOrigin } =
  await import('../../../src/shared/query/result-set.js');
const aufgabenAntwort = (rows = []) => ({
  resultSet: makeResultSet({ scope: 'tasks', type: 'list', rows, state: makeState('ready') }),
});
let stubAntwort = aufgabenAntwort();
window.api.runFrontmatterQuery = async () => stubAntwort;

const { showTaskDialog } = await import('../../../src/renderer/modules/task-dialog.js');
const { applyTasksConfig, todayIsoDate } = await import('../../../src/renderer/modules/tasks.js');
const { parseTaskLine, serializeTaskLine } =
  await import('../../../src/shared/tasks/task-markers.js');

// Nur die von showTaskDialog abgefragten IDs (deckungsgleich mit dem
// Geruest #task-dialog-modal in src/renderer/index.html).
const MODAL_HTML = `
  <div id="task-dialog-modal" class="bookmark-modal" hidden>
    <div class="bookmark-modal-backdrop"></div>
    <div class="bookmark-modal-content">
      <h2 id="task-dialog-title"></h2>
      <label id="task-dialog-description-label" for="task-dialog-description"></label>
      <textarea id="task-dialog-description" rows="2"></textarea>
      <label id="task-dialog-status-label" for="task-dialog-status"></label>
      <select id="task-dialog-status"></select>
      <label id="task-dialog-priority-label" for="task-dialog-priority"></label>
      <select id="task-dialog-priority"></select>
      <label id="task-dialog-recurrence-label" for="task-dialog-recurrence"></label>
      <input id="task-dialog-recurrence" type="text" />
      <p id="task-dialog-recurrence-hint" hidden></p>
      <div id="task-dialog-dates"></div>
      <p id="task-dialog-auto-dates" hidden></p>
      <div id="task-dialog-deps"></div>
      <button id="btn-task-dialog-cancel"></button>
      <button id="btn-task-dialog-ok"></button>
    </div>
  </div>`;

let mounted;
beforeEach(() => {
  // Voriges Modal entfernen und ein frisches Geruest einhaengen.
  document.querySelectorAll('#task-dialog-modal').forEach((n) => n.remove());
  mounted = document.createElement('div');
  mounted.innerHTML = MODAL_HTML;
  document.body.appendChild(mounted);
  // Automatik-Schalter auf den bekannten Stand bringen (autoDone/autoCancelled an).
  applyTasksConfig({ autoDone: true, autoCancelled: true });
});

// Kurzhelfer auf die Dialog-Felder.
const el = (id) => document.getElementById(id);
const descInput = () => el('task-dialog-description');
const statusSelect = () => el('task-dialog-status');
const prioSelect = () => el('task-dialog-priority');
const recInput = () => el('task-dialog-recurrence');
const btnOk = () => el('btn-task-dialog-ok');
const btnCancel = () => el('btn-task-dialog-cancel');

describe('showTaskDialog (4T-000506)', () => {
  it('(a) Formular zu Zeile: Beschreibung, Prioritaet, Wiederholung — Round-Trip erhaelt den Termin', async () => {
    const model = parseTaskLine('- [ ] Alt 📅 2099-01-01');
    const p = showTaskDialog(model, 'edit');

    // Umbruch in der Beschreibung wird zu einem Leerzeichen, Rand getrimmt.
    descInput().value = '  Neu zwei\nZeilen  ';
    prioSelect().value = 'high';
    recInput().value = 'every week';
    btnOk().click();

    const line = await p;
    expect(line).toContain('Neu zwei Zeilen');
    expect(line).toContain('⏫'); // Prioritaet hoch
    expect(line).toContain('🔁 every week');
    expect(line).toContain('📅 2099-01-01'); // Termin unveraendert erhalten
  });

  it('(b) Abbruch liefert null und laesst das uebergebene Modell unveraendert', async () => {
    const original = '- [ ] Alt 📅 2099-01-01';
    const model = parseTaskLine(original);
    const p = showTaskDialog(model, 'edit');

    // Im Formular etwas aendern, dann abbrechen.
    descInput().value = 'darf nicht durchschlagen';
    prioSelect().value = 'high';
    btnCancel().click();

    const result = await p;
    expect(result).toBeNull();
    // Der Dialog arbeitet auf einer Kopie: das Original bleibt unangetastet.
    expect(serializeTaskLine(model)).toBe(original);
  });

  it('(c) Status-Wechsel setzt bei autoDone das Erledigt-Datum, der Rueckweg entfernt es', async () => {
    const today = todayIsoDate();

    // Vorwaerts: offen -> erledigt haengt das Erledigt-Datum an.
    const open = parseTaskLine('- [ ] Task');
    const pForward = showTaskDialog(open, 'edit');
    statusSelect().value = 'x';
    btnOk().click();
    const doneLine = await pForward;
    expect(doneLine).toBe(`- [x] Task ✅ ${today}`);

    // Rueckweg: erledigt -> offen entfernt das Erledigt-Datum wieder.
    const done = parseTaskLine(`- [x] Task ✅ ${today}`);
    const pBack = showTaskDialog(done, 'edit');
    statusSelect().value = ' ';
    btnOk().click();
    const backLine = await pBack;
    expect(backLine).toBe('- [ ] Task');
  });

  it('(d) unparsebare Wiederholungs-Regel zeigt den Hinweis, blockiert aber nicht', async () => {
    const model = parseTaskLine('- [ ] Task');
    const p = showTaskDialog(model, 'edit');

    recInput().value = 'kaputte regel';
    recInput().dispatchEvent(new Event('input'));
    // Der Hinweis ist sichtbar (nicht hidden).
    expect(el('task-dialog-recurrence-hint').hidden).toBe(false);

    btnOk().click();
    const line = await p;
    // Der Regel-Text bleibt erhalten (kein Blockieren des Abschlusses).
    expect(line).toBe('- [ ] Task 🔁 kaputte regel');
  });

  it('(e) Entfernen-Knopf eines Termins entfernt den Marker', async () => {
    const model = parseTaskLine('- [ ] Task 📅 2099-01-01');
    const p = showTaskDialog(model, 'edit');

    const rows = el('task-dialog-dates').querySelectorAll('.task-dialog-date-row');
    // Erste Zeile ist der Faellig-Termin (MANUAL_DATE_FIELDS: due, scheduled, start).
    const dueRow = rows[0];
    const buttons = dueRow.querySelectorAll('button');
    // Beide Knoepfe existieren: Waehlen (Picker) und Entfernen.
    expect(buttons.length).toBe(2);
    const clearBtn = buttons[1];
    clearBtn.click();

    btnOk().click();
    const line = await p;
    expect(line).toBe('- [ ] Task');
    expect(line).not.toContain('📅');
  });

  it('(e2) jeder Termin-Zeile ist ein Waehlen-Knopf zugeordnet (Picker-Zugang vorhanden)', async () => {
    const model = parseTaskLine('- [ ] Task');
    const p = showTaskDialog(model, 'edit');
    const rows = el('task-dialog-dates').querySelectorAll('.task-dialog-date-row');
    // Drei manuelle Termin-Felder (due, scheduled, start) plus die
    // Erinnerungs-Zeile (4T-000528, Epic 3E-000095).
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.querySelector('button.task-dialog-date-btn')).not.toBeNull();
    }
    btnCancel().click();
    await p;
  });
});

// 4T-000508 (Epic 3E-000096): Abhaengigkeits-Bereich des Dialogs (#task-dialog-deps)
// — ID-Zeile (bestehende ID anzeigen, ID erzeugen) und Vorgaenger-Chips.
describe('showTaskDialog — Abhaengigkeiten (4T-000508)', () => {
  const depsEl = () => el('task-dialog-deps');
  // Nach einem Klick, dessen Handler ueber api.runFrontmatterQuery laeuft
  // (async), die Mikro-/Makro-Task-Warteschlange leeren.
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('ID-Zeile zeigt die bestehende ID an', async () => {
    const model = parseTaskLine('- [ ] Task 🆔 abc123');
    const p = showTaskDialog(model, 'edit');
    // Erste Zeile im Deps-Bereich ist die ID-Zeile; ihr Wert-Span traegt die ID.
    const idValue = depsEl().querySelector('.task-dialog-date-value');
    expect(idValue.textContent).toBe('abc123');
    btnCancel().click();
    await p;
  });

  it("'ID erzeugen'-Knopf setzt eine 6-stellige ID in die Rueckgabe-Zeile", async () => {
    const model = parseTaskLine('- [ ] Task');
    const p = showTaskDialog(model, 'edit', { contextPath: '/raum/Aufgaben.md' });

    // Ohne bestehende ID traegt die ID-Zeile den Erzeugen-Knopf.
    const idRow = depsEl().querySelector('.task-dialog-date-row');
    const genBtn = idRow.querySelector('button');
    expect(genBtn).not.toBeNull();
    genBtn.click();
    // Der Handler laedt die Bereichs-Tasks (leere Liste ueber den Stub) und
    // setzt danach die ID — auf das Ende der async-Kette warten.
    await flush();

    // Der Wert-Span zeigt nun eine sechsstellige ID aus [a-z0-9].
    const idValue = depsEl().querySelector('.task-dialog-date-value');
    expect(idValue.textContent).toMatch(/^[a-z0-9]{6}$/);

    btnOk().click();
    const line = await p;
    expect(line).toMatch(/🆔 [a-z0-9]{6}$/);
  });

  it('Vorgaenger-Suche liest die Aufgaben-Treffer der Ergebnismenge (4T-002035)', async () => {
    // Drei Bereichs-Aufgaben: eine mit Kennung, eine ohne (nicht referenzierbar)
    // und die eigene Zeile (wird ueber Pfad und Zeile ausgefiltert).
    const zeile = (line, raw) =>
      makeRow(
        [],
        taskOrigin('/raum/Aufgaben.md', 'Aufgaben', line, raw),
        makeTaskInfo({ urgency: 1.95, blocked: false, duplicateId: false }),
      );
    stubAntwort = aufgabenAntwort([
      zeile(3, '- [ ] Dach decken 🆔 dach01'),
      zeile(4, '- [ ] Ohne Kennung'),
      zeile(5, '- [ ] Selbst 🆔 selbst1'),
    ]);
    try {
      const model = parseTaskLine('- [ ] Selbst 🆔 selbst1');
      const p = showTaskDialog(model, 'edit', {
        contextPath: '/raum/Aufgaben.md',
        selfRef: { path: '/raum/Aufgaben.md', line: 5 },
      });
      // Erstes Suchfeld ist das der Vorgaenger.
      const suche = depsEl().querySelector('.task-dialog-dep-search');
      suche.dispatchEvent(new Event('focus'));
      await flush();
      const eintraege = [...depsEl().querySelectorAll('.task-dialog-suggest-entry')];
      expect(eintraege.map((e) => e.textContent)).toEqual(['Dach decken [dach01]']);
      eintraege[0].click();
      btnOk().click();
      expect(await p).toBe('- [ ] Selbst 🆔 selbst1 ⛔ dach01');
    } finally {
      stubAntwort = aufgabenAntwort();
    }
  });

  it('Vorgaenger-Chip entfernen loescht den Marker aus der Rueckgabe-Zeile', async () => {
    const model = parseTaskLine('- [ ] Task ⛔ abc123');
    const p = showTaskDialog(model, 'edit');

    // Der einzige Chip-Entfernen-Knopf gehoert zum Vorgaenger 'abc123'.
    const chipRemove = depsEl().querySelector('.task-dialog-chip-remove');
    expect(chipRemove).not.toBeNull();
    chipRemove.click();

    btnOk().click();
    const line = await p;
    expect(line).toBe('- [ ] Task');
    expect(line).not.toContain('⛔');
  });
});

// 4T-001867 (Epic 3E-000321): Das Erledigt-Datum ist bei einem Status vom Typ
// «erledigt» im Dialog waehlbar und entfernbar; die Automatik liefert die
// Vorgabe. Die Kriterien-Nummern beziehen sich auf den Task.
describe('showTaskDialog — waehlbares Erledigt-Datum (4T-001867)', () => {
  const doneRow = () => el('task-dialog-dates').querySelector('[data-field="done"]');
  const rowValue = (row) => row.querySelector('.task-dialog-date-value').textContent;
  const rowButtons = (row) => row.querySelectorAll('button');
  const autoEl = () => el('task-dialog-auto-dates');
  // Status im offenen Dialog wechseln, wie es der Auswahlkasten tut.
  const waehleStatus = (ch) => {
    statusSelect().value = ch;
    statusSelect().dispatchEvent(new Event('change'));
  };
  // Waehlen-Knopf druecken und die asynchrone Rueckgabe des Kalenders abwarten.
  const waehleDatum = async (row, date) => {
    pickerErgebnis = { date, time: null };
    rowButtons(row)[0].click();
    await new Promise((r) => setTimeout(r, 0));
  };
  const oeffne = (line) => showTaskDialog(parseTaskLine(line), 'edit');

  beforeEach(() => {
    pickerErgebnis = null;
    pickerAufrufe.length = 0;
  });
  afterEach(() => {
    applyTasksConfig({ autoDone: true, autoCancelled: true });
  });

  it('AK1: erledigte Aufgabe zeigt die Zeile mit gespeichertem Wert, Waehlen- und Entfernen-Knopf', async () => {
    const p = oeffne('- [x] Task ✅ 2026-09-20');
    const row = doneRow();
    expect(row).not.toBeNull();
    expect(row.querySelector('.task-dialog-date-label').textContent).not.toBe('');
    expect(rowValue(row)).toBe('2026-09-20');
    const buttons = rowButtons(row);
    expect(buttons.length).toBe(2);
    expect(buttons[1].hidden).toBe(false);
    // Das Erledigt-Datum steht nicht mehr zusaetzlich in der Anzeige-Zeile.
    expect(autoEl().hidden).toBe(true);
    btnCancel().click();
    await p;
  });

  it('AK2: offene Aufgabe ohne Zeile; der Wechsel blendet sie sofort ein und wieder aus', async () => {
    const p = oeffne('- [ ] Task');
    expect(doneRow()).toBeNull();
    waehleStatus('x');
    expect(doneRow()).not.toBeNull();
    waehleStatus(' ');
    expect(doneRow()).toBeNull();
    btnCancel().click();
    await p;
  });

  it('AK5: der Wechsel auf erledigt belegt die Zeile sofort mit dem heutigen Tag vor', async () => {
    const today = todayIsoDate();
    const p = oeffne('- [ ] Task');
    waehleStatus('x');
    expect(rowValue(doneRow())).toBe(today);
    btnOk().click();
    expect(await p).toBe(`- [x] Task ✅ ${today}`);
  });

  it('AK3, AK4, AK6: gewaehlter Wert erscheint, wird zurueckgeschrieben und beim erneuten Oeffnen vorbelegt', async () => {
    const p = oeffne('- [x] Task ✅ 2026-09-20');
    await waehleDatum(doneRow(), '2026-09-18');
    // Der Kalender startet auf dem gespeicherten Tag.
    expect(pickerAufrufe[0].date).toBe('2026-09-20');
    expect(rowValue(doneRow())).toBe('2026-09-18');
    btnOk().click();
    const line = await p;
    expect(line).toBe('- [x] Task ✅ 2026-09-18');

    // Erneut oeffnen: der gewaehlte Tag ist vorbelegt, die Automatik greift
    // ohne Status-Wechsel nicht ein.
    const p2 = oeffne(line);
    expect(rowValue(doneRow())).toBe('2026-09-18');
    btnOk().click();
    expect(await p2).toBe('- [x] Task ✅ 2026-09-18');
  });

  it('AK6: eine Wahl nach dem Wechsel auf erledigt wird bei der Uebernahme nicht ersetzt', async () => {
    const p = oeffne('- [ ] Task');
    waehleStatus('x');
    await waehleDatum(doneRow(), '2026-09-01');
    btnOk().click();
    expect(await p).toBe('- [x] Task ✅ 2026-09-01');
  });

  it('AK4, AK13: Entfernen loescht das Datum; es bleibt bei der Uebernahme entfernt', async () => {
    const p = oeffne('- [x] Task ✅ 2026-09-20');
    rowButtons(doneRow())[1].click();
    expect(rowValue(doneRow())).toBe('—');
    expect(rowButtons(doneRow())[1].hidden).toBe(true);
    btnOk().click();
    expect(await p).toBe('- [x] Task');
  });

  it('AK13: nach dem Wechsel auf erledigt entfernt bleibt entfernt; das naechste Erledigen setzt wieder heute', async () => {
    const today = todayIsoDate();
    const p = oeffne('- [ ] Task');
    waehleStatus('x');
    rowButtons(doneRow())[1].click();
    btnOk().click();
    const ohneDatum = await p;
    expect(ohneDatum).toBe('- [x] Task');

    // Rueckweg auf offen, danach erneut erledigen: die Automatik greift wieder.
    const p2 = oeffne(ohneDatum);
    waehleStatus(' ');
    btnOk().click();
    const offen = await p2;
    expect(offen).toBe('- [ ] Task');
    const p3 = oeffne(offen);
    waehleStatus('x');
    btnOk().click();
    expect(await p3).toBe(`- [x] Task ✅ ${today}`);
  });

  it('AK14: ein Tag in der Zukunft wird ohne Hinweis uebernommen', async () => {
    const p = oeffne('- [x] Task ✅ 2026-09-20');
    await waehleDatum(doneRow(), '2099-12-31');
    expect(el('task-dialog-recurrence-hint').hidden).toBe(true);
    btnOk().click();
    expect(await p).toBe('- [x] Task ✅ 2099-12-31');
  });

  it('AK7: der Rueckweg entfernt bei eingeschalteter Automatik auch ein gewaehltes Datum', async () => {
    const p = oeffne('- [x] Task ✅ 2026-09-20');
    await waehleDatum(doneRow(), '2026-09-10');
    waehleStatus(' ');
    expect(doneRow()).toBeNull();
    btnOk().click();
    expect(await p).toBe('- [ ] Task');
  });

  it('AK7, AK15: bei abgeschalteter Automatik bleibt das Datum auf dem Rueckweg stehen und erscheint in der Anzeige', async () => {
    applyTasksConfig({ autoDone: false, autoCancelled: true });
    const p = oeffne('- [x] Task ✅ 2026-09-20');
    waehleStatus(' ');
    expect(doneRow()).toBeNull();
    // Sofort in der Anzeige der Automatik-Daten sichtbar.
    expect(autoEl().hidden).toBe(false);
    expect(autoEl().textContent).toContain('2026-09-20');
    btnOk().click();
    const line = await p;
    expect(line).toBe('- [ ] Task ✅ 2026-09-20');

    // Beim erneuten Oeffnen weiterhin in der Anzeige, ohne eigene Zeile.
    const p2 = oeffne(line);
    expect(doneRow()).toBeNull();
    expect(autoEl().textContent).toContain('2026-09-20');
    btnCancel().click();
    await p2;
  });

  it('AK15: bei abgeschalteter Automatik ist die Zeile leer und waehlbar, das Erledigen schreibt kein Datum', async () => {
    applyTasksConfig({ autoDone: false, autoCancelled: true });
    const p = oeffne('- [ ] Task');
    waehleStatus('x');
    const row = doneRow();
    expect(row).not.toBeNull();
    expect(rowValue(row)).toBe('—');
    expect(rowButtons(row)[1].hidden).toBe(true);
    btnOk().click();
    expect(await p).toBe('- [x] Task');

    const p2 = oeffne('- [ ] Task');
    waehleStatus('x');
    await waehleDatum(doneRow(), '2026-09-15');
    btnOk().click();
    expect(await p2).toBe('- [x] Task ✅ 2026-09-15');
  });

  it('AK8: Erstellt- und Abgebrochen-Datum bleiben reine Anzeige; ohne Werte entfaellt der Absatz', async () => {
    const p = oeffne('- [x] Task ➕ 2026-09-01 ❌ 2026-09-02 ✅ 2026-09-03');
    expect(el('task-dialog-dates').querySelector('[data-field="created"]')).toBeNull();
    expect(el('task-dialog-dates').querySelector('[data-field="cancelled"]')).toBeNull();
    expect(autoEl().hidden).toBe(false);
    expect(autoEl().textContent).toContain('2026-09-01');
    expect(autoEl().textContent).toContain('2026-09-02');
    // Das Erledigt-Datum steht in seiner Zeile, nicht in der Anzeige.
    expect(autoEl().textContent).not.toContain('2026-09-03');
    expect(rowValue(doneRow())).toBe('2026-09-03');
    btnCancel().click();
    await p;

    const p2 = oeffne('- [ ] Task');
    expect(autoEl().hidden).toBe(true);
    btnCancel().click();
    await p2;
  });

  it('AK10: bei abgeschalteter Erweiterung tasks oeffnet das Kommando den Dialog nicht', async () => {
    const { applyExtensionsState, resetExtensionStateForTests } =
      await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
    const { runTaskEditDialogCommand } =
      await import('../../../src/renderer/modules/task-dialog.js');
    await applyExtensionsState(['tasks'], { persist: false });
    try {
      expect(await runTaskEditDialogCommand()).toBe(false);
      expect(el('task-dialog-modal').hidden).toBe(true);
    } finally {
      resetExtensionStateForTests();
    }
  });
});

describe('doneDatePreset (4T-001867)', () => {
  it('liefert heute beim Erledigen, leert auf dem Rueckweg und behaelt sonst den Wert der Zeile', async () => {
    const { doneDatePreset } = await import('../../../src/renderer/modules/task-dialog-dates.js');
    expect(doneDatePreset(' ', 'x', true)).toBe('today');
    expect(doneDatePreset('x', ' ', true)).toBe('clear');
    expect(doneDatePreset('x', 'x', true)).toBe('keep');
    expect(doneDatePreset(' ', ' ', true)).toBe('keep');
    // Abgeschaltete Automatik: nie ein Eingriff.
    expect(doneDatePreset(' ', 'x', false)).toBe('keep');
    expect(doneDatePreset('x', ' ', false)).toBe('keep');
  });
});
