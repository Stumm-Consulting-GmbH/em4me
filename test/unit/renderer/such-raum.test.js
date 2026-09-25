// @vitest-environment jsdom
// 4T-001560 (Epic 3E-000280): Die Bestimmung des Suchraums.
//
// Geprüft wird die Rangfolge als Ganzes und nicht nur der neue Fall: Der
// Eingriff dieses Tasks ergänzt den Zustand OHNE Reiter, und die Zusicherung
// lautet, dass alles darunter unberührt bleibt. Ein Prüffall, der nur den
// neuen Fall misst, könnte eine Verschiebung der übrigen Rangfolge nicht von
// einem Erfolg unterscheiden.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const { determineSearchScope } = await import('../../../src/renderer/modules/search/search.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const BEREICH = 'C:/Bereich';

function setzeReiter(tab) {
  state.panes[0].tabs = tab ? [tab] : [];
  state.panes[0].activeIndex = tab ? 0 : -1;
  state.activePaneIndex = 0;
}

function dokument(zusatz = {}) {
  return { path: `${BEREICH}/a.md`, content: 'Inhalt', viewMode: 'rendered', ...zusatz };
}

beforeEach(() => {
  state.areaPath = null;
  setzeReiter(null);
});

describe('Suchraum ohne offenen Reiter (AK1, AK5)', () => {
  it('nimmt den gebundenen Bereich, wenn kein Reiter offen ist', () => {
    // Der Fall des Tasks: Bereich gebunden, alle Dateien geschlossen.
    state.areaPath = BEREICH;
    expect(determineSearchScope()).toBe('area');
  });

  it('bleibt ohne Bereich und ohne Reiter beim bisherigen Verhalten', () => {
    expect(determineSearchScope()).toBe('rendered');
  });
});

describe('Rangfolge mit offenem Reiter bleibt unberuehrt (AK4)', () => {
  it('nimmt weiterhin den Bereich fuer eine Datei darin', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument());
    expect(determineSearchScope()).toBe('area');
  });

  it('laesst die Einstellungs-Seite vor dem Bereich stehen', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument({ systemPage: 'settings' }));
    expect(determineSearchScope()).toBe('settings');
  });

  it('laesst die Handbuch-Seite in der Lese-Ansicht vor dem Bereich stehen', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument({ manualPage: 'overview', viewMode: 'rendered' }));
    expect(determineSearchScope()).toBe('manual');
  });

  it('sucht in einer losen Datei weiterhin in ihr selbst', () => {
    setzeReiter(dokument({ viewMode: 'source' }));
    expect(determineSearchScope()).toBe('source');
  });

  it('nimmt fuer eine Datei AUSSERHALB des Bereichs nicht den Bereich', () => {
    // Die Grenz-Pruefung des Bestands bleibt maßgeblich: Ein loser Reiter
    // neben einem gebundenen Bereich sucht in sich selbst.
    state.areaPath = BEREICH;
    setzeReiter(dokument({ path: 'C:/woanders/b.md', viewMode: 'source' }));
    expect(determineSearchScope()).toBe('source');
  });
});

// 4T-001893 (Epic 3E-000324): Die Mindmap-Ansicht ist ein eigener Suchraum, in
// beiden Lagen des Dokuments (Entscheidung des Product Owners vom 2026-09-23,
// Weg A). Vorher fiel der Modus auf 'rendered' und zählte Treffer der dort
// ausgeblendeten Lese-Ansicht — der bestätigte Befund.
describe('Suchraum der Mindmap-Ansicht (4T-001893)', () => {
  it('eine lose Datei in der Mindmap-Ansicht sucht in der Karte', () => {
    setzeReiter(dokument({ path: 'C:/woanders/b.md', viewMode: 'mindmap' }));
    expect(determineSearchScope()).toBe('mindmap');
  });

  it('eine Datei im geöffneten Bereich sucht in der Mindmap-Ansicht ebenfalls in der Karte', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument({ viewMode: 'mindmap' }));
    expect(determineSearchScope()).toBe('mindmap');
  });

  it('die Einstellungs-Seite bleibt vor der Mindmap-Regel', () => {
    setzeReiter(dokument({ systemPage: 'settings', viewMode: 'mindmap' }));
    expect(determineSearchScope()).toBe('settings');
  });

  it('AK6: die übrigen Ansichts-Modi behalten ihren Suchraum, ohne und mit Bereich', () => {
    const lose = { path: 'C:/woanders/b.md' };
    const erwartet = {
      source: 'source',
      split: 'source',
      live: 'source',
      rendered: 'rendered',
      canvas: 'rendered',
      kanban: 'rendered',
    };
    for (const [modus, raum] of Object.entries(erwartet)) {
      state.areaPath = null;
      setzeReiter(dokument({ ...lose, viewMode: modus }));
      expect(determineSearchScope(), modus).toBe(raum);
      state.areaPath = BEREICH;
      setzeReiter(dokument({ viewMode: modus }));
      expect(determineSearchScope(), `${modus} im Bereich`).toBe('area');
    }
  });
});
