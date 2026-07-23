// @vitest-environment jsdom
// 4T-0506 (Epic 3E-0096): Unit-Test des Task-Bearbeitungs-Dialogs
// (showTaskDialog). Der Dialog arbeitet auf einer Round-Trip-Kopie des
// Modells und liefert beim OK den neuen Zeilen-Text bzw. beim Abbruch
// null. Die Datums-Eingabe laeuft ueber den Picker (3E-0091, eigenes
// Testgut); hier wird nur das Formular-zu-Zeile-Verhalten geprueft, nicht
// der Picker selbst.
//
// Aufbau wie die uebrigen Renderer-Unit-Tests: der api-Stub stellt
// window.api und ein minimales DOM-Geruest bereit (Muster
// task-query-actions.test.js), bevor das Modul dynamisch importiert wird;
// das Modal-Geruest aus index.html wird pro Test als HTML-Fixture in
// document.body nachgebaut (nur die von showTaskDialog benoetigten IDs).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// 4T-0508 (Epic 3E-0096): Die Abhaengigkeits-Suche des Dialogs laeuft ueber
// api.runFrontmatterQuery('LIST TASKS'). Der Basis-Stub (api-stub.js) kennt
// die Methode nicht; hier ein Test-Stub, der eine leere Task-Liste liefert
// (die Bereichs-Suche bleibt damit ohne Kandidaten). NUR im Test, nicht
// produktiv — api.js bindet dieselbe window.api-Objektreferenz, die Ergaenzung
// ist deshalb im Modul sichtbar.
window.api.runFrontmatterQuery = async () => ({ status: 'ready', files: [] });

const { showTaskDialog } = await import('../../../src/renderer/modules/task-dialog.js');
const { applyTasksConfig, todayIsoDate } = await import('../../../src/renderer/modules/tasks.js');
const { parseTaskLine, serializeTaskLine } = await import('../../../src/shared/task-markers.js');

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

describe('showTaskDialog (4T-0506)', () => {
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
    // Erinnerungs-Zeile (4T-0528, Epic 3E-0095).
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.querySelector('button.task-dialog-date-btn')).not.toBeNull();
    }
    btnCancel().click();
    await p;
  });
});

// 4T-0508 (Epic 3E-0096): Abhaengigkeits-Bereich des Dialogs (#task-dialog-deps)
// — ID-Zeile (bestehende ID anzeigen, ID erzeugen) und Vorgaenger-Chips.
describe('showTaskDialog — Abhaengigkeiten (4T-0508)', () => {
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
