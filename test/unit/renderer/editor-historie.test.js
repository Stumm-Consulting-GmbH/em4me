// 4T-001654 (Epic 3E-000287): Prüffälle des programmatischen Zugangs zur
// Historie einer Spalte.
//
// **Warum mit Attrappe.** Der Gegenstand ist nicht, was `undo` tut — das ist
// CodeMirror —, sondern dass der Weg dorthin überhaupt besteht und die
// Reißleine davor greift. Genau dieser Weg fehlte bis zum 2026-09-10: Die
// Historie war ausschließlich über das Tastenkürzel-Verzeichnis der
// EditorView erreichbar, und in der Canvas-Ansicht ist diese versteckt und
// ohne Fokus. Die Attrappe macht den Aufruf zählbar, ohne einen ganzen
// Editor zu bauen.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rufe = { undo: [], redo: [] };
vi.mock('@codemirror/commands', () => ({
  undo: (view) => {
    rufe.undo.push(view);
    return true;
  },
  redo: (view) => {
    rufe.redo.push(view);
    return true;
  },
}));

const { rueckgaengigInSpalte, wiederholenInSpalte } =
  await import('../../../src/renderer/modules/editor/editor-historie.js');

const spalte = (readOnly = false) => ({ state: { readOnly } });

beforeEach(() => {
  rufe.undo.length = 0;
  rufe.redo.length = 0;
});

describe('Historie einer Spalte: Rückgängig und Wiederholen (4T-001654)', () => {
  it('reicht die Spalte an das Rückgängig des Editors weiter', () => {
    const view = spalte();
    expect(rueckgaengigInSpalte(view)).toBe(true);
    expect(rufe.undo).toEqual([view]);
    expect(rufe.redo).toEqual([]);
  });

  it('reicht die Spalte an das Wiederholen des Editors weiter', () => {
    const view = spalte();
    expect(wiederholenInSpalte(view)).toBe(true);
    expect(rufe.redo).toEqual([view]);
    expect(rufe.undo).toEqual([]);
  });

  it('ein schreibgeschütztes Dokument bleibt unberührt', () => {
    // Dieselbe Reißleine wie auf dem Schreibweg der Canvas: Was nicht
    // geschrieben werden darf, wird auch nicht zurückgenommen.
    expect(rueckgaengigInSpalte(spalte(true))).toBe(false);
    expect(wiederholenInSpalte(spalte(true))).toBe(false);
    expect(rufe.undo).toEqual([]);
    expect(rufe.redo).toEqual([]);
  });

  it('eine fehlende Spalte ist kein Fehler, sondern ein Nein', () => {
    // Die Spalte kann leer sein (kein geöffnetes Dokument); ein Wurf wäre hier
    // ein Absturz im Tastendruck-Pfad.
    for (const nichts of [null, undefined, {}]) {
      expect(rueckgaengigInSpalte(nichts)).toBe(false);
      expect(wiederholenInSpalte(nichts)).toBe(false);
    }
    expect(rufe.undo).toEqual([]);
  });
});
