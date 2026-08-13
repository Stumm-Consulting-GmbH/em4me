// 4T-0447 (Epic 3E-0083): Unit-Tests des Profil-Katalogs — Ordner-Scan mit
// Fehler-Isolation pro Datei und mtime+size-validiertem Cache (Änderungen
// an Profil-Dateien wirken ohne Neustart). Dateizugriff über ein Fake-
// Dateisystem injiziert.
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  createProfileCatalogCache,
  loadProfileCatalog,
} from '../../src/main/documents/profile-catalog.js';

const FOLDER = path.resolve('C:/Bereich/Profile');

// Fake-Dateisystem: Map fileName -> { mtimeMs, size, content } plus
// Aufruf-Zähler für die Cache-Prüfung.
function fakeFs(files) {
  const readFile = vi.fn(async (abs) => {
    const entry = files.get(path.basename(abs));
    if (!entry) throw new Error('ENOENT');
    return entry.content;
  });
  return {
    readdir: async (dir) => {
      if (dir !== FOLDER) throw new Error('ENOENT');
      return [...files.keys()].map((name) => ({ name, isFile: () => true }));
    },
    stat: async (abs) => {
      const entry = files.get(path.basename(abs));
      if (!entry) throw new Error('ENOENT');
      return { mtimeMs: entry.mtimeMs, size: entry.size };
    },
    readFile,
  };
}

const PROJEKT = `---
fields:
  - name: status
    values: [offen, erledigt]
  - name: budget
    type: number
---
Beschreibung des Profils.
`;

describe('loadProfileCatalog', () => {
  it('liest Profile mit Feld-Definitionen; Name = Dateiname ohne .md', async () => {
    const files = new Map([
      ['Projekt.md', { mtimeMs: 1, size: 10, content: PROJEKT }],
      ['notiz.txt', { mtimeMs: 1, size: 5, content: 'kein Markdown' }],
    ]);
    const { missingFolder, profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp: fakeFs(files),
      cache: createProfileCatalogCache(),
    });
    expect(missingFolder).toBe(false);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Projekt');
    expect(profiles[0].fields.map((f) => f.name)).toEqual(['status', 'budget']);
    expect(profiles[0].errors).toEqual([]);
  });

  it('fehlender Ordner ergibt missingFolder ohne Wurf', async () => {
    const result = await loadProfileCatalog({
      folderAbs: path.resolve('C:/Bereich/Fehlt'),
      fsp: fakeFs(new Map()),
      cache: createProfileCatalogCache(),
    });
    expect(result).toEqual({ missingFolder: true, profiles: [] });
  });

  it('YAML-Fehler einer Profil-Datei setzt nur dieses Profil aus (Hinweis yaml)', async () => {
    const files = new Map([
      ['Defekt.md', { mtimeMs: 1, size: 9, content: '---\nfields: [broken\n---\nx\n' }],
      ['Projekt.md', { mtimeMs: 1, size: 10, content: PROJEKT }],
    ]);
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp: fakeFs(files),
      cache: createProfileCatalogCache(),
    });
    expect(profiles.map((p) => p.name)).toEqual(['Defekt', 'Projekt']);
    expect(profiles[0].fields).toEqual([]);
    expect(profiles[0].errors[0].code).toBe('yaml');
    expect(profiles[1].fields).toHaveLength(2);
  });

  it('Cache: unveränderte Dateien werden nicht erneut gelesen', async () => {
    const files = new Map([['Projekt.md', { mtimeMs: 1, size: 10, content: PROJEKT }]]);
    const fsp = fakeFs(files);
    const cache = createProfileCatalogCache();
    await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(fsp.readFile).toHaveBeenCalledTimes(1);
  });

  it('Cache: mtime-Änderung liest neu und liefert den frischen Stand', async () => {
    const files = new Map([['Projekt.md', { mtimeMs: 1, size: 10, content: PROJEKT }]]);
    const fsp = fakeFs(files);
    const cache = createProfileCatalogCache();
    const first = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(first.profiles[0].fields).toHaveLength(2);
    files.set('Projekt.md', {
      mtimeMs: 2,
      size: 10,
      content: '---\nfields:\n  - name: neu\n---\n',
    });
    const second = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(fsp.readFile).toHaveBeenCalledTimes(2);
    expect(second.profiles[0].fields.map((f) => f.name)).toEqual(['neu']);
  });

  it('Cache: verschwundene Dateien werden geräumt', async () => {
    const files = new Map([
      ['A.md', { mtimeMs: 1, size: 3, content: '---\nfields:\n  - name: a\n---\n' }],
      ['B.md', { mtimeMs: 1, size: 3, content: '---\nfields:\n  - name: b\n---\n' }],
    ]);
    const fsp = fakeFs(files);
    const cache = createProfileCatalogCache();
    await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(cache.size).toBe(2);
    files.delete('B.md');
    const result = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(result.profiles.map((p) => p.name)).toEqual(['A']);
    expect(cache.size).toBe(1);
  });

  it('Profile sind alphabetisch sortiert (deterministische Auflösung)', async () => {
    const files = new Map([
      ['zettel.md', { mtimeMs: 1, size: 3, content: '' }],
      ['All.md', { mtimeMs: 1, size: 3, content: '' }],
      ['projekt.md', { mtimeMs: 1, size: 3, content: '' }],
    ]);
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp: fakeFs(files),
      cache: createProfileCatalogCache(),
    });
    expect(profiles.map((p) => p.name)).toEqual(['All', 'projekt', 'zettel']);
  });
});
