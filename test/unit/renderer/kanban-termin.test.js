// @vitest-environment jsdom
// 4T-001903 (Epic 3E-000318): Prüffälle «Termin und Uhrzeit auf der Karte»,
// Bedien-Hälfte — Termin setzen, ändern und entfernen über Kontextmenü und
// Abzeichen, der Kalender-Wähler als Weg, das Umschreiben eines Vorbild-Termins
// beim ersten Bearbeiten in einem Schritt, kein Umschreiben beim Statuswechsel
// und keine Bedien-Wege im nicht änderbaren Dokument.
//
// **Gemessen wird an der Einbettung** (Muster kanban-bedienung.test.js): Die
// Zusage «eine Handlung, ein Rückgängig-Schritt» hängt am Zusammenspiel aus
// Bedienung, Zeichnung und Schreibweg. Der Editor der Spalte ist eine Attrappe,
// die den Zeilen-Bereich wirklich anwendet und eine Historie voller Stände
// führt; der Kalender-Wähler ist nachgestellt, weil er am ganzen Fenster hängt —
// gemessen wird, dass die Tafel **diesen** Wähler ruft und mit welcher Vorgabe.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { parseTaskLine } from '../../../src/shared/tasks/task-markers.js';
import { KARTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';
import { aendereKarteUndSchreibeUm } from '../../../src/renderer/modules/kanban/kanban-termin.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const STUFE2 = readFileSync(path.join(dir, '../../fixtures/kanban/tafel-stufe-2.md'), 'utf8');

const { showDateTimePicker } = vi.hoisted(() => ({ showDateTimePicker: vi.fn() }));
vi.mock('../../../src/renderer/modules/calendar/date-picker.js', () => ({ showDateTimePicker }));

// 4T-001958: Der Journal-Weg läuft **echt** (`calendar/journals.js`: stille
// Abfrage, Auswahl, Öffnen-/Anlage-Pfad samt Perioden-Kern). Nachgestellt sind
// allein die Nachbarn, die am ganzen Fenster hängen: das Öffnen im Reiter, die
// Auswahl-Liste, die Statusleiste und der Fenster-Zustand. Gemessen wird damit,
// welche Datei geöffnet wird, nicht bloß, dass ein Rückruf fiel.
const { openInPane, showTemplateSelectDialog, showStatusbarHint } = vi.hoisted(() => ({
  openInPane: vi.fn(async () => 0),
  showTemplateSelectDialog: vi.fn(),
  showStatusbarHint: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({ openInPane }));
vi.mock('../../../src/renderer/modules/tabs/tab-ersetzen.js', () => ({
  reiterFuerPfad: () => null,
  ersetzeTabDurchDatei: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: vi.fn(),
  jumpToOffsetInActiveTab: vi.fn(),
  showTemplateError: vi.fn(),
  showTemplateSelectDialog,
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({ showStatusbarHint }));
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showNameInputDialog: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
}));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
  // 4T-001958: die Journal-Brücke, je Prüffall belegt.
  journalsGetConfig: vi.fn(),
  journalsStatEntry: vi.fn(async (relPath) => ({
    ok: true,
    exists: true,
    path: `C:/Bereich/${relPath}`,
  })),
};
const { initKanbanPane, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
const { uebernimmKanbanAnzeige } =
  await import('../../../src/renderer/modules/kanban/kanban-anzeige-schalter.js');

const KOPF = '---\nkanban-plugin: board\n---\n';
const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Ohne Termin',
  '- [ ] Mit Termin 📅 2026-10-01 ⏫',
  '- [ ] Vom Vorbild @{2026-10-02} @@{14:00}',
  '- [ ] Unlesbar @{2026-13-40}',
  '',
].join('\n');

function baueSpalte(text, optionen = {}) {
  const tab = { content: text, viewMode: 'kanban', path: 'C:/Notizen/Tafel.md', editMode: true };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], menues: [], status: [] };
  const zurueck = [];
  initKanbanPane({
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    schreibeDokument: (_i, { vonZeile, bisZeile, text: neu }) => {
      protokoll.schreibvorgaenge.push({ vonZeile, bisZeile, text: neu });
      zurueck.push(tab.content);
      const zeilen = tab.content.split('\n');
      tab.content = [
        ...zeilen.slice(0, vonZeile - 1),
        ...neu.split('\n'),
        ...zeilen.slice(bisZeile),
      ].join('\n');
      return true;
    },
    rueckgaengig: () => {
      if (zurueck.length === 0) return false;
      tab.content = zurueck.pop();
      renderKanban(0);
      return true;
    },
    statusUmschalten: (_i, zeilenNummer) => {
      protokoll.status.push(zeilenNummer);
      const zeilen = tab.content.split('\n');
      zeilen[zeilenNummer - 1] = zeilen[zeilenNummer - 1].replace('- [ ]', '- [x]');
      tab.content = zeilen.join('\n');
      return true;
    },
    zeigeKontextmenue: (_i, daten) => protokoll.menues.push(daten),
    schliesseKontextmenue: () => {},
  });
  renderKanban(0);
  return { tab, container, protokoll };
}

const karten = (c) => [...c.querySelectorAll(`.${KARTE_KLASSE}`)];
const zeile = (text, anfang) => text.split('\n').find((z) => z.startsWith(anfang));

function menue(container, protokoll, nr) {
  karten(container)[nr].dispatchEvent(
    new window.MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }),
  );
  return protokoll.menues[protokoll.menues.length - 1].eintraege;
}

function eintrag(eintraege, dataId) {
  return eintraege.find((e) => e.dataId === dataId);
}

function klick(el, art = 'click') {
  el.dispatchEvent(new window.MouseEvent(art, { bubbles: true, cancelable: true, button: 0 }));
}

function rueckgaengig(container) {
  container.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  showDateTimePicker.mockReset();
  openInPane.mockClear();
  showTemplateSelectDialog.mockReset();
  showStatusbarHint.mockClear();
  window.api.journalsGetConfig.mockReset();
  window.api.journalsStatEntry.mockClear();
  uebernimmKanbanAnzeige('kanban.datumTagesnotiz', false);
});

// --- Kontextmenü ------------------------------------------------------------------

describe('Kontextmenü der Karte (4T-001903, AK2/AK9)', () => {
  it('«Termin setzen…» steht an jeder Karte, «Termin entfernen» nur, wo es einen gibt', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    const ids = (nr) => menue(container, protokoll, nr).map((e) => e.dataId);
    // 4T-001906: «Karte archivieren» steht zwischen den Termin-Einträgen und
    // «Karte löschen».
    expect(ids(0)).toEqual([
      'kanban-card-edit',
      // 4T-001956: «Notiz aus Karte erzeugen…» vor den Termin-Einträgen.
      'kanban-card-note',
      'kanban-card-set-date',
      'kanban-card-archive',
      'kanban-card-delete',
    ]);
    expect(ids(1)).toEqual([
      'kanban-card-edit',
      // 4T-001956: «Notiz aus Karte erzeugen…» vor den Termin-Einträgen.
      'kanban-card-note',
      'kanban-card-set-date',
      'kanban-card-remove-date',
      'kanban-card-archive',
      'kanban-card-delete',
    ]);
    // Ein lesbarer Vorbild-Termin ist der Termin der Karte; ein unlesbarer
    // lässt sich nicht deuten und wird nicht angeboten.
    expect(ids(2)).toContain('kanban-card-remove-date');
    expect(ids(3)).not.toContain('kanban-card-remove-date');
  });

  it('AK9: im nicht änderbaren Dokument erscheint kein Menü', () => {
    const { container, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    karten(container)[1].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    expect(protokoll.menues).toHaveLength(0);
  });
});

// --- Setzen und Ändern ------------------------------------------------------------

describe('Termin setzen und ändern über den Kalender-Wähler (4T-001903, AK2/AK3)', () => {
  it('AK2/AK3: setzt den Termin samt Uhrzeit in der Aufgaben-Schreibweise, ein Schritt', async () => {
    showDateTimePicker.mockResolvedValue({ date: '2026-10-05', time: '09:30' });
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    await eintrag(menue(container, protokoll, 0), 'kanban-card-set-date').action();
    expect(showDateTimePicker).toHaveBeenCalledWith({
      x: 40,
      y: 50,
      date: undefined,
      time: undefined,
      dateEnabled: true,
      timeEnabled: false,
    });
    expect(zeile(tab.content, '- [ ] Ohne')).toBe('- [ ] Ohne Termin 📅 2026-10-05 09:30');
    expect(parseTaskLine(zeile(tab.content, '- [ ] Ohne')).due).toEqual({
      date: '2026-10-05',
      time: '09:30',
      invalid: false,
    });
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    rueckgaengig(container);
    expect(tab.content).toBe(TAFEL);
  });

  it('ändert einen vorhandenen Termin an Ort und Stelle; der Wähler öffnet mit ihm', async () => {
    showDateTimePicker.mockResolvedValue({ date: '2026-11-11', time: null });
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    await eintrag(menue(container, protokoll, 1), 'kanban-card-set-date').action();
    expect(showDateTimePicker.mock.calls[0][0]).toMatchObject({
      date: '2026-10-01',
      timeEnabled: false,
    });
    expect(zeile(tab.content, '- [ ] Mit')).toBe('- [ ] Mit Termin 📅 2026-11-11 ⏫');
  });

  it('der Klick auf das Termin-Abzeichen öffnet den Wähler und schreibt einen Schritt', async () => {
    showDateTimePicker.mockResolvedValue({ date: '2026-10-09', time: '18:00' });
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    klick(karten(container)[1].querySelector('[data-kanban-termin="due"]'));
    await vi.waitFor(() => expect(protokoll.schreibvorgaenge).toHaveLength(1));
    expect(zeile(tab.content, '- [ ] Mit')).toBe('- [ ] Mit Termin 📅 2026-10-09 18:00 ⏫');
    expect(container.querySelector('.kanban-karte-eingabe')).toBeNull();
  });

  it('ein Doppelklick auf das Abzeichen öffnet keine Bearbeitung der Karte', () => {
    showDateTimePicker.mockResolvedValue(null);
    const { container } = baueSpalte(TAFEL);
    klick(karten(container)[1].querySelector('[data-kanban-termin="due"]'), 'dblclick');
    expect(container.querySelector('.kanban-karte-eingabe')).toBeNull();
  });

  it('ein abgebrochener Wähler schreibt nichts', async () => {
    showDateTimePicker.mockResolvedValue(null);
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    const ok = await eintrag(menue(container, protokoll, 0), 'kanban-card-set-date').action();
    expect(ok).toBe(false);
    expect(tab.content).toBe(TAFEL);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });

  it('ändert sich das Dokument, während der Wähler offen ist, wird verworfen', async () => {
    let antworte;
    showDateTimePicker.mockReturnValue(new Promise((r) => (antworte = r)));
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    const lauf = eintrag(menue(container, protokoll, 0), 'kanban-card-set-date').action();
    await vi.waitFor(() => expect(showDateTimePicker).toHaveBeenCalled());
    tab.content = TAFEL.replace('Ohne Termin', 'Anderer Text');
    renderKanban(0);
    antworte({ date: '2026-10-05', time: null });
    expect(await lauf).toBe(false);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });
});

// --- Entfernen ----------------------------------------------------------------------

describe('Termin entfernen (4T-001903, AK2)', () => {
  it('entfernt den Termin, die übrigen Angaben bleiben; ein Schritt', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    eintrag(menue(container, protokoll, 1), 'kanban-card-remove-date').action();
    expect(zeile(tab.content, '- [ ] Mit')).toBe('- [ ] Mit Termin ⏫');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    rueckgaengig(container);
    expect(tab.content).toBe(TAFEL);
  });

  it('entfernt einen lesbaren Vorbild-Termin samt einem Termin davor', () => {
    const { tab, container, protokoll } = baueSpalte(STUFE2);
    // Spalte «In Arbeit», erste Karte: «Laufende Aufgabe 📅 2026-09-30 @{2026-10-06}».
    const karte = container.querySelectorAll('.kanban-spalte')[1].querySelector(`.${KARTE_KLASSE}`);
    karte.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    const eintraege = protokoll.menues[protokoll.menues.length - 1].eintraege;
    eintrag(eintraege, 'kanban-card-remove-date').action();
    expect(zeile(tab.content, '- [/]')).toBe('- [/] Laufende Aufgabe');
  });
});

// --- Umschreiben beim ersten Bearbeiten -----------------------------------------------

describe('Vorbild-Termin beim ersten Bearbeiten umschreiben (4T-001903, AK5)', () => {
  function bearbeite(container, nr, wert) {
    klick(karten(container)[nr], 'dblclick');
    const feld = container.querySelector('.kanban-karte-eingabe');
    feld.value = wert;
    feld.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  it('die Eingabe zeigt den Rohtext samt Vorbild-Termin', () => {
    const { container } = baueSpalte(TAFEL);
    klick(karten(container)[2], 'dblclick');
    expect(container.querySelector('.kanban-karte-eingabe').value).toBe(
      'Vom Vorbild @{2026-10-02} @@{14:00}',
    );
  });

  it('AK5: Text ändern schreibt den Termin im selben Schritt um; Rückgängig stellt beides her', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    bearbeite(container, 2, 'Vom Vorbild geändert @{2026-10-02} @@{14:00}');
    expect(zeile(tab.content, '- [ ] Vom')).toBe('- [ ] Vom Vorbild geändert 📅 2026-10-02 14:00');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    rueckgaengig(container);
    expect(tab.content).toBe(TAFEL);
  });

  it('löscht der Anwender den Termin beim Bearbeiten, gibt es nichts umzuschreiben', () => {
    const { tab, container } = baueSpalte(TAFEL);
    bearbeite(container, 2, 'Vom Vorbild ohne Termin');
    expect(zeile(tab.content, '- [ ] Vom')).toBe('- [ ] Vom Vorbild ohne Termin');
  });

  it('ein unveränderter Text schreibt nichts und schreibt nicht um', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    bearbeite(container, 2, 'Vom Vorbild @{2026-10-02} @@{14:00}');
    expect(tab.content).toBe(TAFEL);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });

  it('AK8: ein unlesbarer Vorbild-Termin bleibt beim Bearbeiten stehen', () => {
    const { tab, container } = baueSpalte(TAFEL);
    bearbeite(container, 3, 'Unlesbar neu @{2026-13-40}');
    expect(zeile(tab.content, '- [ ] Unlesbar')).toBe('- [ ] Unlesbar neu @{2026-13-40}');
  });

  it('AK5: Termin setzen ersetzt den Vorbild-Termin im selben Schritt', async () => {
    showDateTimePicker.mockResolvedValue({ date: '2026-10-20', time: null });
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    klick(karten(container)[2].querySelector('[data-kanban-termin="vorbild"]'));
    await vi.waitFor(() => expect(protokoll.schreibvorgaenge).toHaveLength(1));
    expect(showDateTimePicker.mock.calls[0][0]).toMatchObject({
      date: '2026-10-02',
      time: '14:00',
      timeEnabled: true,
    });
    expect(zeile(tab.content, '- [ ] Vom')).toBe('- [ ] Vom Vorbild 📅 2026-10-20');
  });

  it('AK5: der Statuswechsel lässt den Vorbild-Termin stehen', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    klick(karten(container)[2].querySelector('.kanban-karte-kasten'));
    expect(protokoll.status).toEqual([9]);
    expect(zeile(tab.content, '- [x] Vom')).toBe('- [x] Vom Vorbild @{2026-10-02} @@{14:00}');
  });

  it('die Rechnung allein: Text und Umschreiben in einem Ergebnis, unberührte Karten gleich', () => {
    const r = aendereKarteUndSchreibeUm(STUFE2, { spalte: 0, karte: 0, kartenText: 'Neu' });
    // Der Text ersetzt die Beschreibung samt Vorbild-Termin; es bleibt nichts umzuschreiben.
    expect(zeile(r.text, '- [ ] Neu')).toBe('- [ ] Neu');
    const r2 = aendereKarteUndSchreibeUm(STUFE2, {
      spalte: 0,
      karte: 1,
      kartenText: 'Nur ein Tag, neu @{2026-10-02}',
    });
    expect(zeile(r2.text, '- [ ] Nur')).toBe('- [ ] Nur ein Tag, neu 📅 2026-10-02');
    const vorher = STUFE2.split('\n');
    const nachher = r2.text.split('\n');
    expect(nachher.filter((z, i) => z !== vorher[i])).toHaveLength(1);
  });
});

// --- Nicht änderbar -------------------------------------------------------------------

describe('Nicht änderbares Dokument (4T-001903, AK9)', () => {
  it('der Termin ist sichtbar, der Klick darauf bleibt ohne Wirkung', () => {
    const { tab, container } = baueSpalte(TAFEL, { aenderbar: false });
    const abzeichen = karten(container)[1].querySelector('.task-marker-due');
    expect(abzeichen.textContent).toBe('📅 2026-10-01');
    expect(container.querySelector('[data-kanban-termin]')).toBeNull();
    klick(abzeichen);
    klick(karten(container)[2].querySelector('.kanban-marker-fremd'));
    expect(showDateTimePicker).not.toHaveBeenCalled();
    expect(tab.content).toBe(TAFEL);
  });
});

// --- Datum als Verweis auf die Tagesnotiz (4T-001958) --------------------------------

describe('Das Datum öffnet die Tagesnotiz (4T-001958, Story 4S-000986)', () => {
  // Zwei Tages-Journale und ein Wochen-Journal; das zweite Tages-Journal legt
  // seine Einträge anders ab, damit die Auswahl an der Datei messbar ist.
  const journal = (id, granularity, ordner) => ({
    id,
    name: id,
    shelf: null,
    granularity,
    folderPattern: `${ordner}/{{date::yyyy}}`,
    namePattern: granularity === 'day' ? '{{date::yyyy-MM-dd}}' : '{{date::kkkk}}-KW{{date::ww}}',
    template: null,
    startDate: null,
    endDate: null,
  });
  const TAG = journal('Tagebuch', 'day', 'Journal');
  const ARBEIT = journal('Arbeit', 'day', 'Arbeit');
  const WOCHE = journal('Woche', 'week', 'Wochen');
  const konfig = (journals, hasArea = true) => ({ ok: true, hasArea, config: { journals } });
  const EIN = '\n%% kanban:settings\n```\n{"link-date-to-daily-note":true}\n```\n%%\n';
  const AUS = '\n%% kanban:settings\n```\n{"link-date-to-daily-note":false}\n```\n%%\n';
  const abzeichen = (c, nr) => karten(c)[nr].querySelector('[data-kanban-datum]');
  const verweise = (c) => c.querySelectorAll('.kanban-datum-verweis');
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('AK3: an und ein Tages-Journal — Verweis-Stil, Hinweistext, der Klick öffnet den Tag', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG, WOCHE]));
    const { tab, container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    const due = abzeichen(container, 1);
    expect(due.classList.contains('kanban-datum-verweis')).toBe(true);
    expect(due.title.endsWith('kanban.termin.tagesnotiz')).toBe(true);
    klick(due);
    await vi.waitFor(() => expect(openInPane).toHaveBeenCalledTimes(1));
    expect(window.api.journalsStatEntry).toHaveBeenCalledWith('Journal/2026/2026-10-01.md');
    expect(openInPane).toHaveBeenCalledWith(0, ['C:/Bereich/Journal/2026/2026-10-01.md'], {
      inheritGroup: false,
    });
    // AK5, AK7: kein Wähler, keine Eingabe, kein Hinweis, das Dokument bleibt.
    expect(showDateTimePicker).not.toHaveBeenCalled();
    expect(showTemplateSelectDialog).not.toHaveBeenCalled();
    expect(container.querySelector('.kanban-karte-eingabe')).toBeNull();
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(tab.content).toBe(TAFEL + EIN);
  });

  it('der lesbare Vorbild-Termin ist ebenso ein Datum; die Uhrzeit spielt keine Rolle', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    klick(abzeichen(container, 2));
    await vi.waitFor(() => expect(openInPane).toHaveBeenCalledTimes(1));
    expect(openInPane.mock.calls[0][1]).toEqual(['C:/Bereich/Journal/2026/2026-10-02.md']);
  });

  it('AK7: eine Karte ohne Datum und ein unlesbarer Termin bieten den Klick nicht an', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    expect(karten(container)[0].querySelector('.kanban-datum-verweis')).toBeNull();
    expect(karten(container)[3].querySelector('[data-kanban-datum]')).toBeNull();
  });

  it('AK3: bei mehreren Tages-Journalen die vorhandene Auswahl', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG, WOCHE, ARBEIT]));
    showTemplateSelectDialog.mockResolvedValue('Arbeit');
    const { container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    klick(abzeichen(container, 1));
    await vi.waitFor(() => expect(openInPane).toHaveBeenCalledTimes(1));
    expect(showTemplateSelectDialog).toHaveBeenCalledWith('journal.pick.title', [
      'Tagebuch',
      'Arbeit',
    ]);
    expect(openInPane.mock.calls[0][1]).toEqual(['C:/Bereich/Arbeit/2026/2026-10-01.md']);
  });

  it('AK4: ist die Einstellung an, bleibt «Termin setzen…» im Kontextmenü', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { container, protokoll } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    const ids = menue(container, protokoll, 1).map((e) => e.dataId);
    expect(ids).toContain('kanban-card-set-date');
  });

  it('AK5: ist die Einstellung aus, öffnet der Klick den Wähler, das Journal wird nicht gefragt', async () => {
    showDateTimePicker.mockResolvedValue(null);
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { container } = baueSpalte(TAFEL + AUS);
    await tick();
    expect(verweise(container)).toHaveLength(0);
    klick(abzeichen(container, 1));
    await vi.waitFor(() => expect(showDateTimePicker).toHaveBeenCalledTimes(1));
    expect(window.api.journalsGetConfig).not.toHaveBeenCalled();
    expect(openInPane).not.toHaveBeenCalled();
  });

  it('AK6: ohne Bereich kein Verweis-Stil, kein Hinweis, der Klick öffnet den Wähler', async () => {
    showDateTimePicker.mockResolvedValue(null);
    window.api.journalsGetConfig.mockResolvedValue(konfig([], false));
    const { container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(window.api.journalsGetConfig).toHaveBeenCalled());
    await tick();
    expect(verweise(container)).toHaveLength(0);
    klick(abzeichen(container, 1));
    await vi.waitFor(() => expect(showDateTimePicker).toHaveBeenCalledTimes(1));
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(openInPane).not.toHaveBeenCalled();
  });

  it('AK6: ohne Tages-Journal (nur ein Wochen-Journal) ebenso, auch bei einem Lesefehler', async () => {
    showDateTimePicker.mockResolvedValue(null);
    window.api.journalsGetConfig.mockResolvedValueOnce(konfig([WOCHE]));
    const { container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(window.api.journalsGetConfig).toHaveBeenCalled());
    await tick();
    expect(verweise(container)).toHaveLength(0);
    window.api.journalsGetConfig.mockRejectedValueOnce(new Error('kaputt'));
    renderKanban(0);
    await tick();
    expect(verweise(container)).toHaveLength(0);
    klick(abzeichen(container, 1));
    await vi.waitFor(() => expect(showDateTimePicker).toHaveBeenCalledTimes(1));
    expect(showStatusbarHint).not.toHaveBeenCalled();
  });

  it('AK7: im nicht änderbaren Dokument öffnet der Klick die Tagesnotiz, ohne Wähler', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { tab, container } = baueSpalte(TAFEL + EIN, { aenderbar: false });
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    expect(container.querySelector('[data-kanban-termin]')).toBeNull();
    klick(abzeichen(container, 1));
    await vi.waitFor(() => expect(openInPane).toHaveBeenCalledTimes(1));
    expect(showDateTimePicker).not.toHaveBeenCalled();
    expect(tab.content).toBe(TAFEL + EIN);
  });

  it('der Doppelklick auf das verweisende Abzeichen öffnet keine Bearbeitung', async () => {
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { container } = baueSpalte(TAFEL + EIN);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    klick(abzeichen(container, 1), 'dblclick');
    expect(container.querySelector('.kanban-karte-eingabe')).toBeNull();
  });

  it('Nachzug: die globale Vorgabe und die Einstellung der Tafel wirken ohne Neu-Öffnen', async () => {
    showDateTimePicker.mockResolvedValue(null);
    window.api.journalsGetConfig.mockResolvedValue(konfig([TAG]));
    const { tab, container } = baueSpalte(TAFEL);
    await tick();
    expect(verweise(container)).toHaveLength(0);
    // Die globale Vorgabe an: derselbe Weg wie Einstellungs-Seite und Menü.
    uebernimmKanbanAnzeige('kanban.datumTagesnotiz', true);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    const titel = abzeichen(container, 1).title.replace(/\nkanban\.termin\.tagesnotiz$/, '');
    // Die Tafel übersteuert mit «aus»: Stil und Hinweistext fallen weg, der
    // Klick öffnet wieder den Wähler. Das Neu-Zeichnen ist das, was der Editor
    // nach dem Rückschreiben des Dialogs anstößt.
    tab.content = TAFEL + AUS;
    renderKanban(0);
    expect(verweise(container)).toHaveLength(0);
    expect(abzeichen(container, 1).title).toBe(titel);
    klick(abzeichen(container, 1));
    await vi.waitFor(() => expect(showDateTimePicker).toHaveBeenCalledTimes(1));
    // Zurück auf die Vorgabe: wieder ein Verweis.
    tab.content = TAFEL;
    renderKanban(0);
    await vi.waitFor(() => expect(verweise(container)).toHaveLength(2));
    // Und die Vorgabe aus: der Stil geht ohne Neu-Öffnen.
    uebernimmKanbanAnzeige('kanban.datumTagesnotiz', false);
    expect(verweise(container)).toHaveLength(0);
  });

  it('die stille Abfrage lässt den Hinweis-Weg der Journal-Kommandos unberührt', () => {
    const quelle = readFileSync(
      path.join(dir, '../../../src/renderer/modules/calendar/journals.js'),
      'utf8',
    );
    const still = quelle.slice(
      quelle.indexOf('export async function tagesJournaleStill'),
      quelle.indexOf('export async function oeffneTagesnotiz'),
    );
    expect(still).not.toContain('showStatusbarHint');
    expect(quelle).toContain("showStatusbarHint('journal.noArea'");
    expect(quelle).toContain("showStatusbarHint('journal.noJournals'");
  });
});
