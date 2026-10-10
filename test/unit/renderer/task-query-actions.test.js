// @vitest-environment jsdom
// 4T-000504 (Epic 3E-000096): Unit-Test der reinen Verschiebe-Wert-Berechnung
// postponedDateValue aus task-query-actions.js. Das Modul bindet beim Laden
// api aus modules/app/api.js und weitere Renderer-Module; der api-Stub stellt
// window.api und das minimale DOM-Geruest bereit (Muster task-states.test.js),
// bevor das Modul dynamisch importiert wird.
//
// 4T-001978 (Epic 3E-000330): Dazu die Weiche, wohin ein Handgriff am Treffer
// geht — Abhaken (toggleTaskFromQuery) und der gemeinsame Schreibweg von
// Verschieben und Übernahme aus dem Bearbeitungs-Dialog (writeTaskHitLine), je
// in den fünf Lagen: ein anderes Fenster hält den ungespeicherten Stand, ein
// nicht aktives Dokument dieses Fensters hält ihn, das aktive Dokument, niemand,
// und die Übergabe scheitert. Der Hauptprozess ist über die Attrappe ersetzt;
// gezählt werden Übergabe-Anfragen, Platten-Schreibvorgänge, Hinweise der
// Statusleiste und die Meldungen an Reiter-Leiste und Index-Overlay. Wie das in
// zwei echten Fenstern und im nicht aktiven Dokument aussieht, prüfen RB-03 und
// RB-07 bis RB-09 in test/e2e/funktionen/rueckschreib-beobachtung.spec.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import './api-stub.js';

const hinweise = [];
const reiterLeisten = [];
const overlays = [];
const gespeichert = [];
let autoSpeichern = 0;

vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showStatusbarHint: (key, opts) => hinweise.push({ key, text: opts && opts.text }),
  scheduleAutoSave: () => {
    autoSpeichern += 1;
  },
}));
vi.mock('../../../src/renderer/modules/views/tabbar.js', async (importOriginal) => ({
  ...(await importOriginal()),
  renderTabbar: (paneIdx) => reiterLeisten.push(paneIdx),
}));
vi.mock('../../../src/renderer/modules/views/save-export.js', async (importOriginal) => ({
  ...(await importOriginal()),
  saveTab: async (paneIdx, tabIdx) => gespeichert.push({ paneIdx, tabIdx }),
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scheduleIndexOverlay: (tab) => overlays.push({ path: tab.path, content: tab.content }),
  updateWindowTitle: () => {},
}));

const { postponedDateValue, toggleTaskFromQuery, writeTaskHitLine } =
  await import('../../../src/renderer/modules/task-query-actions.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const tasks = await import('../../../src/renderer/modules/tasks.js');
const taskStates = await import('../../../src/renderer/modules/task-states.js');
const { buildRecurrenceInstance } = await import('../../../src/shared/tasks/task-recurrence.js');
// Dieselbe Verdrahtung wie beim Programmstart (initTasks): Automatik-Daten und
// Wiederholung hängen am Augmenter der Erweiterung «Aufgaben».
tasks.applyTasksConfig(null);
taskStates.applyTaskStates(taskStates.resolveStoredTaskStates(null));
taskStates.setStatusToggleAugmenter(tasks.taskToggleAugmenter);
tasks.setRecurrenceInstanceBuilder((model) =>
  buildRecurrenceInstance(model, { completionDate: tasks.todayIsoDate(), autoCreated: false }),
);

describe('postponedDateValue (4T-000504)', () => {
  const today = '2026-07-11';

  it('Zukunfts-Termin: day verschiebt um einen Tag', () => {
    expect(postponedDateValue({ date: '2099-01-01', time: null }, 'day', today)).toEqual({
      date: '2099-01-02',
      time: null,
    });
  });

  it('Zukunfts-Termin: week verschiebt um sieben Tage', () => {
    expect(postponedDateValue({ date: '2099-01-01', time: null }, 'week', today)).toEqual({
      date: '2099-01-08',
      time: null,
    });
  });

  it('ueberfaelliger Termin rechnet ab heute (morgen landet nie in der Vergangenheit)', () => {
    expect(postponedDateValue({ date: '2020-01-01', time: null }, 'day', today)).toEqual({
      date: '2026-07-12',
      time: null,
    });
  });

  it('die Uhrzeit bleibt unveraendert erhalten', () => {
    expect(postponedDateValue({ date: '2099-01-01', time: '14:30' }, 'day', today)).toEqual({
      date: '2099-01-02',
      time: '14:30',
    });
  });
});

// --- 4T-001978: Weiche der Handgriffe am Treffer ----------------------------------

const DUE = '\u{1F4C5}';
const DONE = '\u2705';
const PFAD = 'C:/Bereich/Aufgaben.md';
const ALPHA = `- [ ] Alpha ${DUE} 2099-01-01`;
const BETA = `- [ ] Beta ${DUE} 2099-02-02`;
const PLATTE = ['# Aufgaben', '', ALPHA, BETA, ''].join('\n');
const PUFFER = `${PLATTE}Eigener Zusatz`;
const HEUTE = tasks.todayIsoDate();
const ALPHA_ERLEDIGT = `- [x] Alpha ${DUE} 2099-01-01 ${DONE} ${HEUTE}`;
const ALPHA_VERSCHOBEN = `- [ ] Alpha ${DUE} 2099-01-02`;

const treffer = (taskText = ALPHA, line = 3) => ({ path: PFAD, line, taskText });

const uebergaben = [];
const platte = [];
let uebergabe = () => ({ delegiert: false });

function reiter(path, content, originalContent = content) {
  return { path, content, originalContent, dirty: content !== originalContent };
}

// Ein Fenster mit einer Spalte: die Abfrage-Ansicht aktiv, daneben optional der
// Reiter der Aufgaben-Datei (aktiv oder nicht).
function fenster({ aufgaben = null, aktiv = false } = {}) {
  const abfrage = reiter('C:/Bereich/Uebersicht.md', '# Uebersicht');
  const tabs = aufgaben ? [abfrage, aufgaben] : [abfrage];
  state.panes = [{ tabs, activeIndex: aktiv ? 1 : 0 }];
  state.activePaneIndex = 0;
  paneEditors.length = 0;
  if (aktiv) {
    // Schmaler Editor-Vertrag von performStatusToggle und der Transaktion des
    // gemeinsamen Schreibwegs: state.doc und dispatch.
    const view = {
      state: EditorState.create({ doc: aufgaben.content }),
      dispatch(spec) {
        this.state = this.state.update(spec).state;
        aufgaben.content = this.state.doc.toString();
        aufgaben.dirty = aufgaben.content !== aufgaben.originalContent;
      },
    };
    paneEditors[0] = view;
    return view;
  }
  return null;
}

const warte = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  hinweise.length = 0;
  reiterLeisten.length = 0;
  overlays.length = 0;
  gespeichert.length = 0;
  uebergaben.length = 0;
  platte.length = 0;
  autoSpeichern = 0;
  uebergabe = () => ({ delegiert: false });
  window.__taskQueryEdit = (auftrag) => {
    uebergaben.push(auftrag);
    return uebergabe(auftrag);
  };
  window.api.applyTaskLineEdit = async (params) => {
    platte.push(params);
    return { ok: true, line: params.line };
  };
});

describe('4T-001978: Abhaken aus der Abfrage — wohin der Handgriff geht', () => {
  it('ein anderes Fenster hält den ungespeicherten Stand: Auftrag dorthin, hier kein Schreiben', async () => {
    fenster();
    uebergabe = () => ({ delegiert: true });
    expect(await toggleTaskFromQuery(treffer())).toBe(true);
    expect(uebergaben).toEqual([{ hit: treffer(), bearbeitung: { art: 'toggle' } }]);
    expect(platte).toEqual([]);
    expect(hinweise).toEqual([]);
  });

  it('nicht aktives, geändertes Dokument dieses Fensters: wirkt im ungespeicherten Stand (AK13, AK6)', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    fenster({ aufgaben });
    expect(await toggleTaskFromQuery(treffer())).toBe(true);
    // Status-Kette samt Automatik-Datum wie der Klick im Dokument.
    expect(aufgaben.content).toBe(PUFFER.replace(ALPHA, ALPHA_ERLEDIGT));
    expect(aufgaben.dirty).toBe(true);
    expect(aufgaben.originalContent).toBe(PLATTE);
    // Kein Hinweis «ungespeicherte Änderungen», kein Schreiben auf die Platte;
    // der neue Stand geht an den Index-Overlay (Trefferliste, andere Fenster).
    expect(hinweise).toEqual([]);
    expect(platte).toEqual([]);
    expect(overlays).toEqual([{ path: PFAD, content: aufgaben.content }]);
    expect(uebergaben).toHaveLength(1);
    // Das Kennzeichen war schon gesetzt; die Leiste muss nicht neu zeichnen.
    expect(reiterLeisten).toEqual([]);
    expect(autoSpeichern).toBe(1);
  });

  it('nicht aktives, geändertes Dokument: Wiederholung legt die Folge-Instanz in den ungespeicherten Stand', async () => {
    const serie = `- [ ] Serie \u{1F501} every day ${DUE} 2099-01-01`;
    const puffer = ['# Aufgaben', '', serie, 'Eigener Zusatz'].join('\n');
    const aufgaben = reiter(PFAD, puffer, '# Aufgaben\n');
    fenster({ aufgaben });
    expect(await toggleTaskFromQuery(treffer(serie, 3))).toBe(true);
    const zeilen = aufgaben.content.split('\n');
    expect(zeilen).toHaveLength(5);
    expect(zeilen).toContain(`- [x] Serie \u{1F501} every day ${DUE} 2099-01-01 ${DONE} ${HEUTE}`);
    expect(zeilen.filter((z) => z.startsWith('- [ ] Serie'))).toEqual([
      `- [ ] Serie \u{1F501} every day ${DUE} 2099-01-02`,
    ]);
    expect(zeilen[4]).toBe('Eigener Zusatz');
    expect(platte).toEqual([]);
  });

  it('nur ungespeichert vorhandene Aufgabe: dieselbe Wirkung im Stand des Reiters (AK5)', async () => {
    const gamma = `- [ ] Gamma ${DUE} 2099-03-03`;
    const aufgaben = reiter(PFAD, `${PLATTE}${gamma}`, PLATTE);
    fenster({ aufgaben });
    expect(await toggleTaskFromQuery(treffer(gamma, 5))).toBe(true);
    expect(aufgaben.content.split('\n')[4]).toBe(`- [x] Gamma ${DUE} 2099-03-03 ${DONE} ${HEUTE}`);
    expect(platte).toEqual([]);
  });

  it('nicht aktives, geändertes Dokument ohne die Zeile: Konflikt-Hinweis, nichts geändert', async () => {
    const aufgaben = reiter(PFAD, '# Aufgaben\n\nEigener Zusatz', PLATTE);
    fenster({ aufgaben });
    expect(await toggleTaskFromQuery(treffer())).toBe(false);
    expect(aufgaben.content).toBe('# Aufgaben\n\nEigener Zusatz');
    expect(hinweise.map((h) => h.text)).toEqual(['taskQuery.conflict']);
    expect(overlays).toEqual([]);
    expect(platte).toEqual([]);
  });

  it('aktives Dokument: Editor-Transaktion wie bisher, ohne Übergabe-Anfrage (AK7)', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    const view = fenster({ aufgaben, aktiv: true });
    expect(await toggleTaskFromQuery(treffer())).toBe(true);
    expect(view.state.doc.line(3).text).toBe(ALPHA_ERLEDIGT);
    expect(uebergaben).toEqual([]);
    expect(platte).toEqual([]);
    // War schon geändert: kein Speichern (dokumentierte Semantik).
    expect(gespeichert).toEqual([]);
  });

  it('niemand hält einen ungespeicherten Stand: Schreiben über den Hauptprozess wie bisher (AK7)', async () => {
    fenster();
    expect(await toggleTaskFromQuery(treffer())).toBe(true);
    expect(uebergaben).toHaveLength(1);
    expect(platte).toEqual([
      { filePath: PFAD, line: 3, expectedText: ALPHA, newText: ALPHA_ERLEDIGT, insert: null },
    ]);
  });

  it('nicht aktives, sauberes Dokument: Schreiben über den Hauptprozess wie bisher (AK7)', async () => {
    const aufgaben = reiter(PFAD, PLATTE);
    fenster({ aufgaben });
    expect(await toggleTaskFromQuery(treffer())).toBe(true);
    expect(platte).toHaveLength(1);
    expect(aufgaben.content).toBe(PLATTE);
  });

  it('die Übergabe scheitert: Schreiben über den Hauptprozess wie bisher (AK8)', async () => {
    fenster();
    uebergabe = () => {
      throw new Error('Fenster antwortet nicht');
    };
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await toggleTaskFromQuery(treffer())).toBe(true);
    } finally {
      warnung.mockRestore();
    }
    expect(uebergaben).toHaveLength(1);
    expect(platte).toHaveLength(1);
  });
});

describe('4T-001978: gemeinsamer Schreibweg von Verschieben und Dialog-Übernahme', () => {
  it('ein anderes Fenster hält den ungespeicherten Stand: Auftrag mit der neuen Zeile (AK11, AK12)', async () => {
    fenster();
    uebergabe = () => ({ delegiert: true });
    expect(await writeTaskHitLine(treffer(), ALPHA_VERSCHOBEN)).toBe(true);
    expect(uebergaben).toEqual([
      { hit: treffer(), bearbeitung: { art: 'zeile', newText: ALPHA_VERSCHOBEN } },
    ]);
    expect(platte).toEqual([]);
  });

  it('Übernahme aus dem Bearbeitungs-Dialog: die geänderte Beschreibung reist als neue Zeile (AK12)', async () => {
    fenster();
    uebergabe = () => ({ delegiert: true });
    const neu = `- [ ] Alpha geändert ${DUE} 2099-01-01`;
    expect(await writeTaskHitLine(treffer(), neu)).toBe(true);
    expect(uebergaben[0].bearbeitung).toEqual({ art: 'zeile', newText: neu });
    expect(platte).toEqual([]);
  });

  it('nicht aktives, geändertes Dokument dieses Fensters: ersetzt die Zeile im ungespeicherten Stand (AK13)', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    fenster({ aufgaben });
    expect(await writeTaskHitLine(treffer(), ALPHA_VERSCHOBEN)).toBe(true);
    expect(aufgaben.content).toBe(PUFFER.replace(ALPHA, ALPHA_VERSCHOBEN));
    expect(aufgaben.dirty).toBe(true);
    expect(hinweise).toEqual([]);
    expect(platte).toEqual([]);
    expect(overlays).toHaveLength(1);
  });

  it('wird der Stand dadurch gleich dem gespeicherten, verliert der Reiter sein Kennzeichen', async () => {
    const aufgaben = reiter(PFAD, PLATTE.replace(ALPHA, ALPHA_VERSCHOBEN), PLATTE);
    fenster({ aufgaben });
    expect(await writeTaskHitLine(treffer(ALPHA_VERSCHOBEN), ALPHA)).toBe(true);
    expect(aufgaben.dirty).toBe(false);
    expect(reiterLeisten).toEqual([0]);
  });

  it('aktives Dokument: Editor-Transaktion wie bisher, ohne Übergabe-Anfrage (AK7)', async () => {
    const aufgaben = reiter(PFAD, PLATTE);
    const view = fenster({ aufgaben, aktiv: true });
    expect(await writeTaskHitLine(treffer(), ALPHA_VERSCHOBEN)).toBe(true);
    expect(view.state.doc.line(3).text).toBe(ALPHA_VERSCHOBEN);
    expect(uebergaben).toEqual([]);
    // War sauber: gespeichert über den regulären Weg.
    expect(gespeichert).toEqual([{ paneIdx: 0, tabIdx: 1 }]);
  });

  it('niemand hält einen ungespeicherten Stand: Schreiben über den Hauptprozess wie bisher (AK7)', async () => {
    fenster();
    expect(await writeTaskHitLine(treffer(), ALPHA_VERSCHOBEN)).toBe(true);
    expect(platte).toEqual([
      { filePath: PFAD, line: 3, expectedText: ALPHA, newText: ALPHA_VERSCHOBEN, insert: null },
    ]);
  });

  it('die Übergabe scheitert: nicht aktives, geändertes Dokument bleibt der Ort (AK8)', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    fenster({ aufgaben });
    uebergabe = () => {
      throw new Error('Fenster antwortet nicht');
    };
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await writeTaskHitLine(treffer(), ALPHA_VERSCHOBEN)).toBe(true);
    } finally {
      warnung.mockRestore();
    }
    expect(aufgaben.content).toBe(PUFFER.replace(ALPHA, ALPHA_VERSCHOBEN));
    expect(platte).toEqual([]);
  });
});

describe('4T-001978: Auftrag aus dem Hauptprozess im Fenster des ungespeicherten Stands', () => {
  it('Abhaken: wirkt hier ohne erneute Übergabe, auch im nicht aktiven Dokument', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    fenster({ aufgaben });
    window.__taskQueryEditHandler({ hit: treffer(), bearbeitung: { art: 'toggle' } });
    await warte();
    await warte();
    expect(uebergaben).toEqual([]);
    expect(aufgaben.content).toBe(PUFFER.replace(ALPHA, ALPHA_ERLEDIGT));
    expect(platte).toEqual([]);
  });

  it('neue Zeile: wirkt im aktiven Dokument als Editor-Transaktion', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    const view = fenster({ aufgaben, aktiv: true });
    window.__taskQueryEditHandler({
      hit: treffer(),
      bearbeitung: { art: 'zeile', newText: ALPHA_VERSCHOBEN },
    });
    await warte();
    await warte();
    expect(view.state.doc.line(3).text).toBe(ALPHA_VERSCHOBEN);
    expect(aufgaben.dirty).toBe(true);
    expect(uebergaben).toEqual([]);
  });

  it('unvollständige oder unbekannte Aufträge bleiben ohne Wirkung', async () => {
    const aufgaben = reiter(PFAD, PUFFER, PLATTE);
    fenster({ aufgaben });
    window.__taskQueryEditHandler(null);
    window.__taskQueryEditHandler({ hit: treffer(), bearbeitung: { art: 'loeschen' } });
    window.__taskQueryEditHandler({ hit: { path: PFAD }, bearbeitung: { art: 'toggle' } });
    window.__taskQueryEditHandler({ hit: treffer(), bearbeitung: { art: 'zeile' } });
    await warte();
    await warte();
    expect(aufgaben.content).toBe(PUFFER);
    expect(platte).toEqual([]);
  });
});
