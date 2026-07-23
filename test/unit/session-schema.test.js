// 4T-0320 (Epic 3E-0057): Unit-Tests für das App-Sitzungs-Schema
// (src/main/session-schema.js) — Migration des flachen Bestands-Formats und
// defensive Normalisierung des persistierten Stands.
// 4T-0537 (Epic 3E-0098): dazu die Normalisierung der Arbeitsbereichs-Ablage
// (Store-Key 'workspaces').
import { describe, it, expect } from 'vitest';
import {
  migrateWindowsToApps,
  normalizeSavedApps,
  normalizeSavedWorkspaces,
} from '../../src/main/session-schema.js';

const WIN = { bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: false, panes: [] };

describe('migrateWindowsToApps (4T-0320)', () => {
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

describe('normalizeSavedApps (4T-0320)', () => {
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

describe('normalizeSavedWorkspaces (4T-0537)', () => {
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
