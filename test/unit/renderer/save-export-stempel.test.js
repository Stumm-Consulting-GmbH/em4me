// @vitest-environment jsdom
// 4T-002121 (Epic 3E-000371): Zeitstempel beim Speichern und das Rückgängig der
// Anwendung.
//
// Befund: Mit eingeschalteter Erweiterung «Zeitstempel im Dateikopf» und
// automatischem Speichern nahm Strg+Z nach einer gespeicherten Eingabe nur den
// Stempel zurück. Das Zurücknehmen löste das automatische Speichern aus, das
// den Stempel zwei Sekunden später erneut als eigenen Rückgängig-Schritt
// setzte; die Eingabe war nur mit schnell aufeinander folgenden Tastendrücken
// zu erreichen (Ablauf-Fall TK-10 in tabellen-kontextmenue.spec.js).
//
// Geprüft wird der ECHTE Stempel-Weg `stampTabTimestamps` (save-export.js) mit
// dem ECHTEN Rückgängig der Anwendung `rueckgaengigInSpalte`
// (editor-historie.js) gegen einen CodeMirror-Zustand mit Historie. Der
// Stempel bleibt ein eigener Schritt; liegt er zuoberst, nimmt ein Rückgängig
// ihn und den Schritt davor zusammen zurück (Stories 4S-000159 AK9,
// 4S-000161 AK10). Fall 1 ersetzt als Nutzer-Eingabe das ganze Dokument: Mit
// einem Stempel außerhalb der Historie (verworfener Weg) verdoppelte sich dabei
// der Dateikopf.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { history, undoDepth } from '@codemirror/commands';
import './api-stub.js';

// Der Mermaid-Render-Weg trägt sich beim Laden mit seinem Teilbaum-Schritt
// hier ein (render-mermaid.js, Modul-Ende); ohne diesen Namen bricht schon der
// Import von save-export.js (Vorbild canvas-austausch-export.test.js).
vi.mock('../../../src/renderer/modules/canvas/canvas-pane.js', () => ({
  aktiveCanvasFlaeche: () => null,
  registriereCanvasTeilbaumSchritte: () => {},
}));

window.api.getFileTimes = async () => ({ birthtimeMs: 0 });

const { stampTabTimestamps } = await import('../../../src/renderer/modules/views/save-export.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { rueckgaengigInSpalte } =
  await import('../../../src/renderer/modules/editor/editor-historie.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const AUSGANG = [
  '---',
  'titel: Rückgängig',
  'updated:',
  '---',
  '',
  '| A | B |',
  '| --- | --- |',
  '| a1 | b1 |',
  '',
].join('\n');
const MIT_SPALTE = AUSGANG.replace('| A | B |', '| A |  | B |');

// Nachbildung der Editor-Ansicht im Umfang, den der Stempel-Weg braucht:
// Zustand lesen und Transaktionen anwenden. `undo` ruft `dispatch` ungebunden
// auf, deshalb über die Variable statt über `this`.
function ansicht(doc) {
  const view = { state: EditorState.create({ doc, extensions: [history()] }) };
  view.dispatch = (spec) => {
    view.state = spec instanceof Transaction ? spec.state : view.state.update(spec).state;
  };
  return view;
}

let gesichert;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 30, 9, 30, 0));
  gesichert = {
    panes: state.panes,
    frontmatterTimestamps: state.frontmatterTimestamps,
    view: paneEditors[0],
  };
  state.frontmatterTimestamps = {
    createdEnabled: false,
    createdField: 'created',
    updatedEnabled: true,
    updatedField: 'updated',
    format: 'datetime',
    autoCreate: false,
  };
});

afterEach(() => {
  vi.useRealTimers();
  state.panes = gesichert.panes;
  state.frontmatterTimestamps = gesichert.frontmatterTimestamps;
  paneEditors[0] = gesichert.view;
});

function aufbauen() {
  const view = ansicht(AUSGANG);
  const tab = { path: 'C:\\Bereich\\rueckgaengig.md', content: AUSGANG };
  state.panes = [{ activeIndex: 0, tabs: [tab] }];
  paneEditors[0] = view;
  return { view, tab };
}

const GESTEMPELT = AUSGANG.replace('updated:', 'updated: 2026-10-30 09:30');

describe('Zeitstempel beim Speichern und Rückgängig (4T-002121)', () => {
  it('ein Rückgängig nimmt Stempel und Ganz-Dokument-Eingabe zusammen zurück', async () => {
    const { view, tab } = aufbauen();
    // Nutzer-Eingabe als Ersetzung des ganzen Dokuments in einer Transaktion.
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: MIT_SPALTE },
      userEvent: 'input',
    });
    tab.content = view.state.doc.toString();

    await stampTabTimestamps(0, 0, tab);
    const gestempelt = view.state.doc.toString();
    expect(gestempelt).toBe(MIT_SPALTE.replace('updated:', 'updated: 2026-10-30 09:30'));
    expect(tab.content).toBe(gestempelt);
    // Der Stempel ist ein eigener Schritt der Historie.
    expect(undoDepth(view.state)).toBe(2);

    expect(rueckgaengigInSpalte(view)).toBe(true);
    // Stand vor der Eingabe, ohne Stempel und ohne doppelten Dateikopf.
    expect(view.state.doc.toString()).toBe(AUSGANG);
    expect(undoDepth(view.state)).toBe(0);
  });

  it('ein Stempel ohne Änderung schreibt nichts in den Editor', async () => {
    const { view, tab } = aufbauen();
    await stampTabTimestamps(0, 0, tab);
    const nachErstem = view.state;
    expect(nachErstem.doc.toString()).toBe(GESTEMPELT);

    // Zweites Speichern in derselben Minute: gleicher Text, keine Transaktion,
    // also auch kein neues Einplanen des automatischen Speicherns.
    await stampTabTimestamps(0, 0, tab);
    expect(view.state).toBe(nachErstem);
  });

  it('nach einer Eingabe hinter dem Stempel nimmt ein Rückgängig nur diese zurück', async () => {
    const { view, tab } = aufbauen();
    await stampTabTimestamps(0, 0, tab);
    expect(view.state.doc.toString()).toBe(GESTEMPELT);

    const stelle = view.state.doc.toString().indexOf('| a1');
    view.dispatch({ changes: { from: stelle, insert: 'neu ' }, userEvent: 'input' });
    expect(view.state.doc.toString()).toContain('neu | a1');

    expect(rueckgaengigInSpalte(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(GESTEMPELT);
    expect(undoDepth(view.state)).toBe(1);
  });
});
