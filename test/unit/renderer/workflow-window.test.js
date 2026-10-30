// @vitest-environment jsdom
// 4T-002348 (Epic 3E-000184): Die Fenster-Seite der Workflow-Ausführung —
// Bearbeitung des eigenen Puffers (aktives und nicht aktives Dokument), der
// Empfänger für Aufträge des Hauptprozesses samt Antwort, `open` und `close`.
//
// Bestands-Lesungen: Muster und Editor-Vertrag aus
// `task-query-actions.test.js` (schmaler Editor mit `state.doc` und `dispatch`);
// `api-stub.js` stellt window.api vor dem Import bereit. Die Reiter-Wege
// `openInPane` und `closeTab` (src/renderer/modules/tabs/tabs.js) sind ersetzt,
// damit gezählt werden kann, was die Fenster-Handgriffe auslösen; die
// Speicher-Rückfrage selbst ist Bestand von `closeTab` (Entscheidung E6 vom
// 2026-10-23: «Abbrechen» beendet den Lauf mit `closeCanceled`).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import './api-stub.js';

const geoeffnet = [];
const geschlossen = [];
const overlays = [];
let schliessenErlaubt = true;
// 4T-002424: Die Attrappe entfernt den Reiter auf Wunsch, wie closeTab es tut.
let closeTabEntfernt = false;
let auftragsEmpfaenger = null;
const antworten = [];
window.api.onWorkflowBufferEdit = (fn) => {
  auftragsEmpfaenger = fn;
};
window.api.workflowBufferEditDone = async (antwort) => {
  antworten.push(antwort);
  return { ok: true };
};
window.api.setIndexOverlay = async (p, c) => overlays.push({ p, c });

vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openInPane: async (paneIdx, paths) => {
    geoeffnet.push({ paneIdx, paths });
    return paneIdx;
  },
  closeTab: async (paneIdx, tabIdx) => {
    geschlossen.push({ paneIdx, tabIdx });
    if (schliessenErlaubt && closeTabEntfernt) {
      const { state: st } = await import('../../../src/renderer/modules/app/app-state.js');
      st.panes[paneIdx].tabs.splice(tabIdx, 1);
    }
    return schliessenErlaubt;
  },
}));
vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scheduleAutoSave: () => {},
  showStatusbarHint: () => {},
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  updateWindowTitle: () => {},
}));
vi.mock('../../../src/renderer/modules/views/tabbar.js', async (importOriginal) => ({
  ...(await importOriginal()),
  renderTabbar: () => {},
}));

const { applyBufferEdit, runWindowAction, flushPendingBuffers, schliesseVorDemLoeschen } =
  await import('../../../src/renderer/modules/workflows/workflow-window.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { paneEditors, scheduleIndexOverlay } =
  await import('../../../src/renderer/modules/editor/editor.js');

const PFAD = 'C:/Bereich/Ziel.md';
const PLATTE = '# Ziel\n## Protokoll\nalt\n';

function reiter(path, content, originalContent = content) {
  return { path, content, originalContent, dirty: content !== originalContent };
}

// Ein Fenster mit einer Spalte; der Reiter der Ziel-Datei aktiv oder nicht.
function fenster({ aktiv, content }) {
  const ziel = reiter(PFAD, content, PLATTE);
  const anderer = reiter('C:/Bereich/Anderes.md', 'x');
  state.panes = [{ tabs: [anderer, ziel], activeIndex: aktiv ? 1 : 0 }];
  state.activePaneIndex = 0;
  paneEditors.length = 0;
  const transaktionen = [];
  if (aktiv) {
    paneEditors[0] = {
      state: EditorState.create({ doc: content }),
      dispatch(spec) {
        transaktionen.push(spec);
        this.state = this.state.update(spec).state;
        ziel.content = this.state.doc.toString();
        ziel.dirty = ziel.content !== ziel.originalContent;
      },
    };
  }
  return { ziel, transaktionen };
}

const EINFUEGEN = {
  op: 'insert',
  position: { kind: 'under', heading: 'Protokoll' },
  text: '- neu',
};

beforeEach(() => {
  geoeffnet.length = 0;
  geschlossen.length = 0;
  antworten.length = 0;
  overlays.length = 0;
  schliessenErlaubt = true;
  closeTabEntfernt = false;
});

describe('Bearbeitung des eigenen Puffers', () => {
  it('aktives Dokument: eine Transaktion über den geänderten Bereich, ungespeichert erhalten', () => {
    const { ziel, transaktionen } = fenster({ aktiv: true, content: `${PLATTE}Eigener Zusatz\n` });
    expect(applyBufferEdit(PFAD, EINFUEGEN)).toEqual({ ok: true, changed: true });
    expect(transaktionen).toHaveLength(1);
    expect(transaktionen[0].changes).toEqual({ from: 20, to: 20, insert: '- neu\n' });
    expect(ziel.content).toBe('# Ziel\n## Protokoll\n- neu\nalt\nEigener Zusatz\n');
    expect(ziel.dirty).toBe(true);
  });

  it('nicht aktives Dokument: der ungespeicherte Stand des Reiters (AK5 der Story 4S-001103)', () => {
    const { ziel } = fenster({ aktiv: false, content: `${PLATTE}Eigener Zusatz\n` });
    expect(applyBufferEdit(PFAD, EINFUEGEN).ok).toBe(true);
    expect(ziel.content).toBe('# Ziel\n## Protokoll\n- neu\nalt\nEigener Zusatz\n');
    expect(ziel.dirty).toBe(true);
  });

  it('ein Fehlschlag der Bearbeitung ändert nichts und nennt den Code', () => {
    const { ziel } = fenster({ aktiv: false, content: PLATTE });
    expect(applyBufferEdit(PFAD, { op: 'replace', search: 'fehlt', replacement: 'x' })).toEqual({
      ok: false,
      code: 'textNotFound',
    });
    expect(ziel.content).toBe(PLATTE);
  });

  it('kein geöffnetes Dokument: bufferUnavailable', () => {
    fenster({ aktiv: false, content: PLATTE });
    expect(applyBufferEdit('C:/Bereich/Fremd.md', EINFUEGEN).code).toBe('bufferUnavailable');
  });

  it('runWindowAction bildet das Ergebnis des Schritts', async () => {
    fenster({ aktiv: true, content: PLATTE });
    const res = await runWindowAction({
      ok: true,
      line: 4,
      keyword: 'insert',
      window: { action: 'editOwnBuffer', path: PFAD, edit: EINFUEGEN },
    });
    expect(res).toEqual({
      ok: true,
      line: 4,
      keyword: 'insert',
      effect: { kind: 'edited', paths: [PFAD], via: 'ownBuffer' },
    });
  });
});

describe('Empfänger für Aufträge des Hauptprozesses', () => {
  it('antwortet mit der Kennung, Erfolg und Fehlschlag', async () => {
    // Ein Besitzer-Fenster hält immer einen geänderten Stand.
    fenster({
      aktiv: false,
      content: `${PLATTE}ungespeichert\n`,
    });
    expect(typeof auftragsEmpfaenger).toBe('function');
    auftragsEmpfaenger({ requestId: 'k-1', path: PFAD, edit: EINFUEGEN });
    auftragsEmpfaenger({
      requestId: 'k-2',
      path: PFAD,
      edit: { op: 'replace', search: 'fehlt', replacement: 'x' },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(antworten).toEqual([
      { requestId: 'k-1', ok: true, code: null, changed: true },
      { requestId: 'k-2', ok: false, code: 'textNotFound', changed: null },
    ]);
  });

  it('ein Auftrag ohne Kennung bleibt ohne Antwort', async () => {
    auftragsEmpfaenger({ path: PFAD, edit: EINFUEGEN });
    auftragsEmpfaenger(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(antworten).toEqual([]);
  });
});

describe('open und close', () => {
  it('open über den gewöhnlichen Öffnen-Weg in der aktiven Spalte', async () => {
    fenster({ aktiv: false, content: PLATTE });
    const res = await runWindowAction({
      ok: true,
      line: 2,
      keyword: 'open',
      window: { action: 'open', path: PFAD },
    });
    expect(geoeffnet).toEqual([{ paneIdx: 0, paths: [PFAD] }]);
    expect(res.effect.kind).toBe('opened');
  });

  it('close schließt das Dokument; ein nicht geöffnetes gelingt ohne Änderung (E3)', async () => {
    fenster({ aktiv: false, content: PLATTE });
    const zu = await runWindowAction({
      ok: true,
      line: 2,
      keyword: 'close',
      window: { action: 'close', path: PFAD },
    });
    expect(geschlossen).toEqual([{ paneIdx: 0, tabIdx: 1 }]);
    expect(zu.effect.kind).toBe('closed');
    const nie = await runWindowAction({
      ok: true,
      line: 3,
      keyword: 'close',
      window: { action: 'close', path: 'C:/Bereich/Nie.md' },
    });
    expect(nie.effect.kind).toBe('unchanged');
  });

  it('«Abbrechen» in der Speicher-Rückfrage beendet den Lauf mit closeCanceled (E6)', async () => {
    fenster({ aktiv: false, content: `${PLATTE}ungespeichert` });
    schliessenErlaubt = false;
    const res = await runWindowAction({
      ok: true,
      line: 7,
      keyword: 'close',
      window: { action: 'close', path: PFAD },
    });
    expect(res).toEqual({
      ok: false,
      line: 7,
      keyword: 'close',
      code: 'closeCanceled',
      detail: { path: PFAD },
    });
  });
});

describe('flushPendingBuffers', () => {
  it('meldet einen anstehenden Puffer-Stand sofort statt nach dem Zeitgeber', async () => {
    const { ziel } = fenster({ aktiv: false, content: `${PLATTE}neu` });
    scheduleIndexOverlay(ziel);
    expect(overlays).toEqual([]);
    await flushPendingBuffers();
    expect(overlays).toEqual([{ p: PFAD, c: `${PLATTE}neu` }]);
  });
});

// 4T-002424 (Story 4S-001135, Regeln P1, P3, P5): Abhaken über den Weg der
// Aufgaben-Abfrage (`toggleTaskFromQuery`, echt) und das Schließen der Reiter
// vor `delete`.
describe('completeTask über den Weg der Aufgaben-Abfrage', () => {
  const AUFGABE = '- [ ] Rückblick schreiben';
  const handgriff = (taskText = AUFGABE, line = 4) => ({
    ok: true,
    line: 9,
    keyword: 'complete-task',
    window: { action: 'completeTask', path: PFAD, line, taskText },
  });

  it('nicht aktives, ungespeichertes Dokument: abgehakt im Puffer, Platte unberührt (AK5)', async () => {
    const { ziel } = fenster({ aktiv: false, content: `${PLATTE}${AUFGABE}\n` });
    window.api.applyTaskLineEdit = vi.fn(async () => ({ ok: true }));
    const res = await runWindowAction(handgriff());
    expect(res).toEqual({
      ok: true,
      line: 9,
      keyword: 'complete-task',
      effect: { kind: 'edited', paths: [PFAD], via: 'taskToggle' },
    });
    expect(ziel.content).toBe(`${PLATTE}- [x] Rückblick schreiben\n`);
    expect(ziel.dirty).toBe(true);
    expect(window.api.applyTaskLineEdit).not.toHaveBeenCalled();
  });

  it('aktives, ungespeichertes Dokument: eine Editor-Transaktion, die getippte Zeile bleibt', async () => {
    const { ziel, transaktionen } = fenster({
      aktiv: true,
      content: `${PLATTE}${AUFGABE}\ngetippt`,
    });
    expect((await runWindowAction(handgriff())).ok).toBe(true);
    expect(transaktionen).toHaveLength(1);
    expect(ziel.content).toBe(`${PLATTE}- [x] Rückblick schreiben\ngetippt`);
  });

  it('geschlossene Datei: geschrieben über den Zeilen-Weg des Hauptprozesses', async () => {
    state.panes = [{ tabs: [], activeIndex: -1 }];
    window.api.applyTaskLineEdit = vi.fn(async () => ({ ok: true }));
    expect((await runWindowAction(handgriff())).ok).toBe(true);
    expect(window.api.applyTaskLineEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: PFAD,
        line: 4,
        expectedText: AUFGABE,
        // Erledigt-Datum nach der Regel der Aufgaben-Abfrage (Augmenter der
        // Erweiterung «Aufgaben», hier eingeschaltet).
        newText: expect.stringMatching(/^- \[x\] Rückblick schreiben ✅ \d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('die Zeile ist nicht mehr da: taskConflict', async () => {
    fenster({ aktiv: false, content: `${PLATTE}geändert\n` });
    const res = await runWindowAction(handgriff());
    expect(res).toMatchObject({ ok: false, code: 'taskConflict', detail: { path: PFAD } });
  });
});

describe('schliesseVorDemLoeschen', () => {
  beforeEach(() => {
    state.areaPath = 'C:/Bereich';
    window.api.relative = (von, nach) =>
      nach.startsWith(`${von}/`) ? nach.slice(von.length + 1) : nach;
  });

  it('schließt die Reiter auf das Ziel und auf Dateien darunter, sonst keinen', async () => {
    const tabs = [
      reiter('C:/Bereich/Alt/a.md', 'a'),
      reiter('C:/Bereich/Altbau.md', 'b'),
      reiter('C:/Bereich/alt/Unter/c.md', 'c'),
    ];
    state.panes = [{ tabs, activeIndex: 0 }];
    closeTabEntfernt = true;
    expect(await schliesseVorDemLoeschen('Alt')).toBe(true);
    expect(state.panes[0].tabs.map((t) => t.path)).toEqual(['C:/Bereich/Altbau.md']);
  });

  it('«Abbrechen» der Speicher-Rückfrage: false, nichts weiter geschlossen', async () => {
    state.panes = [{ tabs: [reiter('C:/Bereich/x.md', 'x', 'alt')], activeIndex: 0 }];
    schliessenErlaubt = false;
    expect(await schliesseVorDemLoeschen('x.md')).toBe(false);
    expect(geschlossen).toEqual([{ paneIdx: 0, tabIdx: 0 }]);
  });
});
