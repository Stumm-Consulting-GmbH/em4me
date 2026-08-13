// 4T-0368 (Epic 3E-0068): Unit-Tests für den Entwurfs-Zwischenspeicher
// (src/main/documents/draft-store.js) — Manifest-Normalisierung, Verwaisten-Erkennung und
// bereichs-treue Zuordnung der Entwürfe zu den beim Start wiederhergestellten
// Applikationen. Reine Logik, ohne Electron und ohne Datei-Zugriff.
// 4T-0539 (Epic 3E-0098): dazu die Arbeitsbereichs-Zuordnung (workspaceId
// im Manifest, Targets statt rootPath-Liste, unassigned-Menge).
import { describe, it, expect } from 'vitest';
import {
  normalizeManifest,
  findOrphans,
  assignDraftsToApps,
} from '../../src/main/documents/draft-store.js';

// Einfacher Pfad-Vergleich für die Tests (case-insensitiv wie unter Windows).
const samePath = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

describe('normalizeManifest (4T-0368)', () => {
  it('übernimmt gültige Einträge und füllt Defaults', () => {
    const raw = [
      {
        id: 'a',
        area: 'C:\\Notizen',
        order: 2,
        tabSettings: { viewMode: 'split' },
        savedAt: '2026-07-08T10:00:00Z',
      },
      { id: 'b' },
    ];
    const result = normalizeManifest(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'a',
      area: 'C:\\Notizen',
      workspaceId: null,
      order: 2,
      tabSettings: { viewMode: 'split' },
      savedAt: '2026-07-08T10:00:00Z',
    });
    // Minimaleintrag: area/workspaceId null, order = Index, tabSettings {},
    // savedAt '' — Bestands-Einträge ohne workspaceId bleiben gültig (4T-0539).
    expect(result[1]).toEqual({
      id: 'b',
      area: null,
      workspaceId: null,
      order: 1,
      tabSettings: {},
      savedAt: '',
    });
  });

  // 4T-0539 (Epic 3E-0098): Arbeitsbereichs-Zuordnung im Manifest.
  it('übernimmt workspaceId als nicht-leeren String, sonst null (4T-0539)', () => {
    const result = normalizeManifest([
      { id: 'a', workspaceId: 'ws-1' },
      { id: 'b', workspaceId: '' },
      { id: 'c', workspaceId: 42 },
    ]);
    expect(result[0].workspaceId).toBe('ws-1');
    expect(result[1].workspaceId).toBeNull();
    expect(result[2].workspaceId).toBeNull();
  });

  it('verwirft Einträge ohne gültige ID und Nicht-Objekte', () => {
    expect(normalizeManifest([{ id: '' }, { area: 'C:\\X' }, null, 'kaputt', 42])).toEqual([]);
  });

  it('normalisiert ungültige area/tabSettings defensiv', () => {
    const result = normalizeManifest([
      { id: 'a', area: '' },
      { id: 'b', area: 42 },
      { id: 'c', tabSettings: 'x' },
    ]);
    expect(result[0].area).toBeNull();
    expect(result[1].area).toBeNull();
    expect(result[2].tabSettings).toEqual({});
  });

  it('liefert leere Liste für Nicht-Arrays', () => {
    expect(normalizeManifest(null)).toEqual([]);
    expect(normalizeManifest({})).toEqual([]);
  });
});

describe('findOrphans (4T-0368)', () => {
  const asManifest = (ids) =>
    ids.map((id) => ({ id, area: null, order: 0, tabSettings: {}, savedAt: '' }));

  it('erkennt Manifest-Einträge ohne Datei und Dateien ohne Eintrag', () => {
    const { missingFiles, orphanFiles } = findOrphans(asManifest(['a', 'b']), ['b', 'c']);
    expect(missingFiles).toEqual(['a']); // im Manifest, aber keine Inhalts-Datei
    expect(orphanFiles).toEqual(['c']); // Inhalts-Datei ohne Manifest-Eintrag
  });

  it('leere Eingaben ergeben keine Verwaisten', () => {
    expect(findOrphans([], [])).toEqual({ missingFiles: [], orphanFiles: [] });
  });
});

describe('assignDraftsToApps (4T-0368)', () => {
  const draft = (id, area, workspaceId = null) => ({
    id,
    area,
    workspaceId,
    content: '',
    tabSettings: {},
    order: 0,
  });
  // 4T-0539: Ziel-Apps als Targets { rootPath, workspaceId }.
  const target = (rootPath, workspaceId = null) => ({ rootPath, workspaceId });

  it('ordnet Bereichs-Entwürfe der App mit gleichem rootPath zu', () => {
    const drafts = [draft('a', 'C:\\Notizen'), draft('b', null)];
    const { byApp, leftover } = assignDraftsToApps(
      drafts,
      [target('C:\\Notizen'), target(null)],
      samePath,
    );
    expect(byApp[0].map((d) => d.id)).toEqual(['a']);
    // Bereichslose Entwürfe kommen über leftover, nicht direkt in die App.
    expect(byApp[1]).toEqual([]);
    expect(leftover.map((d) => d.id)).toEqual(['b']);
  });

  it('legt Entwürfe mit fehlendem Bereich in leftover', () => {
    const { byApp, leftover } = assignDraftsToApps(
      [draft('a', 'C:\\Weg')],
      [target('C:\\Notizen'), target(null)],
      samePath,
    );
    expect(byApp[0]).toEqual([]);
    expect(leftover.map((d) => d.id)).toEqual(['a']);
  });

  it('bereichslose Entwürfe kommen immer in leftover', () => {
    const drafts = [draft('a', null), draft('b', null)];
    const { byApp, leftover } = assignDraftsToApps(drafts, [target('C:\\Notizen')], samePath);
    expect(byApp[0]).toEqual([]);
    expect(leftover.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('vergleicht Pfade über die injizierte Funktion (hier case-insensitiv)', () => {
    const { byApp } = assignDraftsToApps(
      [draft('a', 'c:\\notizen')],
      [target('C:\\Notizen')],
      samePath,
    );
    expect(byApp[0].map((d) => d.id)).toEqual(['a']);
  });

  it('leere Eingaben ergeben leere Zuordnung', () => {
    expect(assignDraftsToApps([], [target(null)], samePath)).toEqual({
      byApp: [[]],
      leftover: [],
      unassigned: [],
    });
  });

  // 4T-0539 (Epic 3E-0098): Arbeitsbereichs-Zuordnung.
  it('4T-0539: Arbeitsbereichs-Entwürfe treffen ausschließlich ihren Arbeitsbereich', () => {
    const drafts = [draft('a', null, 'ws-1'), draft('b', 'C:\\Notizen', 'ws-1')];
    const { byApp, leftover, unassigned } = assignDraftsToApps(
      drafts,
      [target(null), target('C:\\Notizen'), target(null, 'ws-1')],
      samePath,
    );
    // Auch der bereichs-tragende Arbeitsbereichs-Entwurf geht an den
    // Arbeitsbereich, nicht an die bereichsgleiche unbenannte App.
    expect(byApp[2].map((d) => d.id)).toEqual(['a', 'b']);
    expect(byApp[0]).toEqual([]);
    expect(byApp[1]).toEqual([]);
    expect(leftover).toEqual([]);
    expect(unassigned).toEqual([]);
  });

  it('4T-0539: Entwürfe geschlossener Arbeitsbereiche bleiben unassigned liegen', () => {
    const { byApp, leftover, unassigned } = assignDraftsToApps(
      [draft('a', null, 'ws-geschlossen')],
      [target(null), target('C:\\Notizen')],
      samePath,
    );
    expect(byApp[0]).toEqual([]);
    expect(byApp[1]).toEqual([]);
    expect(leftover).toEqual([]);
    expect(unassigned.map((d) => d.id)).toEqual(['a']);
  });

  it('4T-0539: globale Entwürfe landen nicht in bereichsgleichen Arbeitsbereichs-Apps', () => {
    const { byApp, leftover } = assignDraftsToApps(
      [draft('a', 'C:\\Notizen')],
      [target('C:\\Notizen', 'ws-1'), target(null)],
      samePath,
    );
    // Der Bereich existiert nur als Arbeitsbereichs-App → leftover
    // (erste bereichslose unbenannte App), kein stilles Einwandern.
    expect(byApp[0]).toEqual([]);
    expect(leftover.map((d) => d.id)).toEqual(['a']);
  });
});
