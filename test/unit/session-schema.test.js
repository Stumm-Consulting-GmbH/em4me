// 4T-000320 (Epic 3E-000057): Unit-Tests für das App-Sitzungs-Schema
// (src/main/app/session-schema.js) — Migration des flachen Bestands-Formats und
// defensive Normalisierung des persistierten Stands.
// 4T-000537 (Epic 3E-000098): dazu die Normalisierung der Arbeitsbereichs-Ablage
// (Store-Key 'workspaces').
import { describe, it, expect } from 'vitest';
// 4T-001364 (Epic 3E-000171): dazu die Vorrang-Regel der Start-Seite.
import {
  migrateWindowsToApps,
  normalizeSavedApps,
  normalizeSavedWorkspaces,
  sitzungHatPanes,
} from '../../src/main/app/session-schema.js';

const WIN = { bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: false, panes: [] };

describe('migrateWindowsToApps (4T-000320)', () => {
  it('wickelt eine Bestands-Sitzung als eine App ohne Bereich ein', () => {
    const result = migrateWindowsToApps([], [WIN, WIN]);
    expect(result).toEqual([{ area: null, windows: [WIN, WIN] }]);
  });

  it('migriert nicht, wenn das App-Schema bereits gefüllt ist', () => {
    expect(migrateWindowsToApps([{ area: null, windows: [WIN] }], [WIN])).toBeNull();
  });

  it('migriert nicht ohne Bestands-Fenster', () => {
    expect(migrateWindowsToApps([], [])).toBeNull();
    expect(migrateWindowsToApps([], null)).toBeNull();
    expect(migrateWindowsToApps(null, undefined)).toBeNull();
  });
});

describe('normalizeSavedApps (4T-000320)', () => {
  it('übernimmt gültige Apps mit und ohne Bereich', () => {
    const saved = [
      { area: null, windows: [WIN] },
      { area: { rootPath: 'C:\\Notizen' }, windows: [WIN, WIN] },
    ];
    const result = normalizeSavedApps(saved);
    expect(result).toHaveLength(2);
    expect(result[0].area).toBeNull();
    expect(result[1].area).toEqual({ rootPath: 'C:\\Notizen' });
    expect(result[1].windows).toHaveLength(2);
  });

  it('verwirft Apps ohne Fenster und Nicht-Objekte', () => {
    const result = normalizeSavedApps([
      { area: null, windows: [] },
      null,
      'kaputt',
      { area: null, windows: [WIN, null, 'x'] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].windows).toEqual([WIN]);
  });

  it('verwirft ungültige area-Felder statt zu crashen', () => {
    const result = normalizeSavedApps([
      { area: { rootPath: '' }, windows: [WIN] },
      { area: { rootPath: 42 }, windows: [WIN] },
      { area: 'C:\\X', windows: [WIN] },
    ]);
    expect(result).toHaveLength(3);
    for (const entry of result) expect(entry.area).toBeNull();
  });

  it('liefert leere Liste für Nicht-Arrays', () => {
    expect(normalizeSavedApps(null)).toEqual([]);
    expect(normalizeSavedApps({})).toEqual([]);
  });
});

describe('normalizeSavedWorkspaces (4T-000537)', () => {
  const VALID = {
    id: 'ws-1',
    name: 'Projekt Alpha',
    color: 'green',
    open: true,
    lastOpenedAt: '2026-07-15T12:00:00Z',
    app: { area: { rootPath: 'C:\\Notizen' }, windows: [WIN] },
  };

  it('übernimmt gültige Einträge vollständig', () => {
    const result = normalizeSavedWorkspaces([VALID]);
    expect(result).toEqual([VALID]);
  });

  it('liefert leere Liste für Nicht-Arrays', () => {
    expect(normalizeSavedWorkspaces(null)).toEqual([]);
    expect(normalizeSavedWorkspaces({})).toEqual([]);
  });

  it('verwirft Einträge ohne id oder Namen und Nicht-Objekte', () => {
    const result = normalizeSavedWorkspaces([
      null,
      'kaputt',
      { ...VALID, id: '' },
      { ...VALID, id: 42 },
      { ...VALID, name: '   ' },
      { ...VALID, name: undefined },
    ]);
    expect(result).toEqual([]);
  });

  it('trimmt den Namen und lässt bei doppelter id den ersten Eintrag gewinnen', () => {
    const result = normalizeSavedWorkspaces([
      { ...VALID, name: '  Projekt Alpha  ' },
      { ...VALID, name: 'Doppelgänger' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Projekt Alpha');
  });

  it('fällt bei unbekannter Farbe auf die erste Paletten-Farbe zurück', () => {
    const result = normalizeSavedWorkspaces([
      { ...VALID, color: 'neon' },
      { ...VALID, id: 'ws-2', color: undefined },
      { ...VALID, id: 'ws-3', color: 'pink' },
    ]);
    expect(result[0].color).toBe('blue');
    expect(result[1].color).toBe('blue');
    expect(result[2].color).toBe('pink');
  });

  it('normalisiert open strikt boolean und lastOpenedAt nur als String', () => {
    const result = normalizeSavedWorkspaces([
      { ...VALID, open: 'ja', lastOpenedAt: 12345 },
      { ...VALID, id: 'ws-2', open: false, lastOpenedAt: null },
    ]);
    expect(result[0].open).toBe(false);
    expect(result[0].lastOpenedAt).toBeNull();
    expect(result[1].open).toBe(false);
  });

  it('normalisiert defekte app-Felder auf leeren Snapshot statt zu crashen', () => {
    const result = normalizeSavedWorkspaces([
      { ...VALID, app: null },
      { ...VALID, id: 'ws-2', app: 'kaputt' },
      { ...VALID, id: 'ws-3', app: { area: { rootPath: '' }, windows: [WIN, null, 'x'] } },
    ]);
    expect(result[0].app).toEqual({ area: null, windows: [] });
    expect(result[1].app).toEqual({ area: null, windows: [] });
    expect(result[2].app).toEqual({ area: null, windows: [WIN] });
  });
});

// 4T-001364 (Epic 3E-000171): Die Vorrang-Regel der Start-Seite. Sie greift nur,
// wo NICHTS wiederherzustellen ist (Entscheidung aus 4T-001363); dieser Test
// haelt genau diese Bedingung fest.
describe('sitzungHatPanes — Vorrang der Sitzung vor der Start-Seite', () => {
  it('meldet true, sobald ein Fenster gespeicherte Panes traegt', () => {
    expect(sitzungHatPanes([{ panes: [{ paths: ['/a.md'], activeIndex: 0 }] }])).toBe(true);
  });

  it('meldet true auch, wenn erst ein spaeteres Fenster Panes traegt', () => {
    expect(sitzungHatPanes([{ panes: [] }, { panes: [{ paths: ['/a.md'] }] }])).toBe(true);
  });

  it('meldet false bei durchweg leeren Pane-Listen', () => {
    expect(sitzungHatPanes([{ panes: [] }, { panes: [] }])).toBe(false);
  });

  it('meldet false ohne Fenster', () => {
    expect(sitzungHatPanes([])).toBe(false);
  });

  it('meldet false bei fehlendem oder defektem Eingabewert', () => {
    expect(sitzungHatPanes(undefined)).toBe(false);
    expect(sitzungHatPanes(null)).toBe(false);
    expect(sitzungHatPanes([{ panes: 'kaputt' }, null])).toBe(false);
  });
});

// 4T-001742 (Epic 3E-000309): Zwei Applikationen auf demselben Ordner werden
// als zwei Einträge abgelegt; die Normalisierung führt gleiche Wurzeln nicht
// zusammen, und die Wiederherstellung erzeugt je Eintrag eine Applikation.
describe('4T-001742: zwei Applikationen desselben Ordners in der Ablage', () => {
  it('normalizeSavedApps behält beide Einträge mit gleicher Wurzel', () => {
    const result = normalizeSavedApps([
      { area: { rootPath: 'C:\\Notizen' }, windows: [WIN] },
      { area: { rootPath: 'C:\\Notizen' }, windows: [WIN, WIN] },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.area.rootPath)).toEqual(['C:\\Notizen', 'C:\\Notizen']);
    expect(result.map((a) => a.windows.length)).toEqual([1, 2]);
  });

  it('ein Arbeitsbereich und eine gewöhnliche Applikation auf demselben Ordner bleiben getrennt', () => {
    const apps = normalizeSavedApps([{ area: { rootPath: 'C:\\Notizen' }, windows: [WIN] }]);
    const ws = normalizeSavedWorkspaces([
      {
        id: 'ws-1',
        name: 'Alpha',
        color: 'green',
        open: true,
        app: { area: { rootPath: 'C:\\Notizen' }, windows: [WIN] },
      },
    ]);
    expect(apps).toHaveLength(1);
    expect(ws).toHaveLength(1);
    expect(ws[0].app.area).toEqual(apps[0].area);
  });
});

// 4T-001743 (Epic 3E-000309, T3): Die Kennung der App reist mit der Sitzung;
// ein Bestands-Eintrag ohne Kennung bleibt gültig.
describe('4T-001743: Kennung der App in der Sitzungs-Ablage', () => {
  it('behält appKey als nicht-leeren String und lässt das Feld sonst weg', () => {
    const result = normalizeSavedApps([
      { appKey: 'app-1', area: { rootPath: 'C:\\Notizen' }, windows: [WIN] },
      { appKey: '', area: { rootPath: 'C:\\Notizen' }, windows: [WIN] },
      { area: null, windows: [WIN] },
    ]);
    expect(result[0].appKey).toBe('app-1');
    expect('appKey' in result[1]).toBe(false);
    expect('appKey' in result[2]).toBe(false);
  });
});
