// 4T-0359 (Epic 3E-0066): Unit-Test der reinen Notiz-Sync-Entscheidung.
// decideNoteSync steuert, wie ein Panel auf einen note:changed-Broadcast
// reagiert (Eigen-Broadcast ignorieren, fremde Fassung uebernehmen, Konflikt).
import { describe, it, expect } from 'vitest';
import { decideNoteSync } from '../../../src/renderer/modules/panels/notes-sync.js';

describe('decideNoteSync (4T-0359)', () => {
  it('ignoriert einen Broadcast, der der Baseline gleicht (Eigen-Broadcast)', () => {
    // incoming === baseline: der eigene Schreib-Broadcast oder bereits aktuell,
    // unabhaengig davon, ob lokal getippt wurde.
    expect(decideNoteSync('Stand', 'Stand', 'Stand')).toBe('ignore');
    expect(decideNoteSync('Stand', 'Stand', 'lokal weiter getippt')).toBe('ignore');
  });

  it('uebernimmt die fremde Fassung ohne lokalen Bearbeitungsstand', () => {
    // currentValue === baseline: keine ungespeicherte Aenderung -> adopt.
    expect(decideNoteSync('neue Fassung', 'alt', 'alt')).toBe('adopt');
    expect(decideNoteSync('', 'alt', 'alt')).toBe('adopt');
  });

  it('meldet Konflikt bei lokaler ungespeicherter Aenderung', () => {
    // incoming != baseline UND currentValue != baseline -> conflict.
    expect(decideNoteSync('fremd', 'alt', 'lokal')).toBe('conflict');
  });
});
