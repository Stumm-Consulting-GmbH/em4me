// 4T-000447 (Epic 3E-000083): Unit-Tests des Profil-Katalogs — Ordner-Scan mit
// Fehler-Isolation pro Datei und mtime+size-validiertem Cache (Änderungen
// an Profil-Dateien wirken ohne Neustart). Dateizugriff über ein Fake-
// Dateisystem injiziert.
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  createProfileCatalogCache,
  loadProfileCatalog,
} from '../../src/main/documents/profile-catalog.js';
import { createRequire } from 'node:module';

// 4T-001203: Die Plattform-Eigenschaft wird ueber DIESELBE Modul-Instanz
// gesetzt, die profile-catalog.js benutzt (Muster area-search.test.js).
const { setPlatformForTests } = createRequire(import.meta.url)('../../src/shared/platform.js');
import { resolveProfileFields, fieldDefinitionHint } from '../../src/shared/property-profiles.js';

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

  // 4T-001203 (Epic 3E-000121): Cache-Schlüssel folgen der Dateisystem-Eigenschaft
  // — kleingeschrieben nur, wo die Plattform die Schreibung nicht
  // unterscheidet; auf Linux fielen sonst zwei Pfade auf einen Eintrag.
  it('Cache-Schlüssel folgen der Dateisystem-Eigenschaft (4T-001203)', async () => {
    const files = new Map([['Projekt.md', { mtimeMs: 1, size: 10, content: PROJEKT }]]);
    try {
      setPlatformForTests('linux');
      const cacheLinux = createProfileCatalogCache();
      await loadProfileCatalog({ folderAbs: FOLDER, fsp: fakeFs(files), cache: cacheLinux });
      expect([...cacheLinux.keys()]).toEqual([path.join(FOLDER, 'Projekt.md')]);

      setPlatformForTests('win32');
      const cacheWin = createProfileCatalogCache();
      await loadProfileCatalog({ folderAbs: FOLDER, fsp: fakeFs(files), cache: cacheWin });
      expect([...cacheWin.keys()]).toEqual([path.join(FOLDER, 'Projekt.md').toLowerCase()]);
    } finally {
      setPlatformForTests(undefined);
    }
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

  // 4T-001142 (Epic 3E-000218): Vererbungs-Angaben der Profil-Ebene.
  it('liest extends und exclude aus dem Frontmatter (4T-001142)', async () => {
    const files = new Map([
      [
        'Artikel.md',
        {
          mtimeMs: 1,
          size: 20,
          content: '---\nextends: Projekt\nexclude: [status]\nfields:\n  - name: autor\n---\n',
        },
      ],
      ['Projekt.md', { mtimeMs: 1, size: 10, content: PROJEKT }],
    ]);
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp: fakeFs(files),
      cache: createProfileCatalogCache(),
    });
    const artikel = profiles.find((p) => p.name === 'Artikel');
    expect(artikel.parent).toBe('Projekt');
    expect(artikel.exclude).toEqual(['status']);
    expect(artikel.errors).toEqual([]);
    const projekt = profiles.find((p) => p.name === 'Projekt');
    expect(projekt.parent).toBeNull();
    expect(projekt.exclude).toEqual([]);
  });

  it('AK11 (4T-001142): eine Änderung am Eltern-Profil wirkt ohne Neustart über den Cache', async () => {
    const files = new Map([
      [
        'Kind.md',
        {
          mtimeMs: 1,
          size: 15,
          content: '---\nextends: Basis\nfields:\n  - name: eigen\n---\n',
        },
      ],
      ['Basis.md', { mtimeMs: 1, size: 12, content: '---\nfields:\n  - name: alt\n---\n' }],
    ]);
    const fsp = fakeFs(files);
    const cache = createProfileCatalogCache();
    const first = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    const resolveNames = (catalog) =>
      resolveProfileFields(catalog.profiles, {
        defaultProfile: null,
        assigned: ['Kind'],
      }).fields.map((f) => f.name);
    expect(resolveNames(first)).toEqual(['eigen', 'alt']);
    files.set('Basis.md', {
      mtimeMs: 2,
      size: 12,
      content: '---\nfields:\n  - name: neu\n---\n',
    });
    const second = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(resolveNames(second)).toEqual(['eigen', 'neu']);
    // Nur das geänderte Eltern-Profil wurde erneut gelesen, das Kind kam aus dem Cache.
    const gelesene = fsp.readFile.mock.calls.map(([abs]) => path.basename(abs));
    expect(gelesene.filter((n) => n === 'Basis.md')).toHaveLength(2);
    expect(gelesene.filter((n) => n === 'Kind.md')).toHaveLength(1);
  });
});

// --- 4T-001157 (Epic 3E-000219, E12): Wertevorrat aus einer Notiz -------------
// Der zweite Eingang am Änderungs-Abgleich: eine Werte-Notiz ist eine
// zweite Datei, die denselben mtime- und Größen-Vergleich durchläuft wie
// eine Profil-Datei.
describe('Wertevorrat aus einer Notiz (4T-001157)', () => {
  const AREA = path.resolve('C:/Bereich');

  // Eigener Fake über VOLLE Pfade (nicht über Basenames wie oben): Werte-
  // Notizen liegen außerhalb des Profil-Ordners, und die Bereichs-Grenze
  // lässt sich nur am ganzen Pfad prüfen.
  function fsMitNotizen(profile, notizen) {
    const alle = new Map();
    for (const [name, eintrag] of profile) {
      alle.set(path.resolve(FOLDER, name).toLowerCase(), eintrag);
    }
    for (const [rel, eintrag] of notizen) {
      alle.set(path.resolve(AREA, rel).toLowerCase(), eintrag);
    }
    const readFile = vi.fn(async (abs) => {
      const e = alle.get(path.resolve(abs).toLowerCase());
      if (!e) throw new Error('ENOENT');
      return e.content;
    });
    const stat = vi.fn(async (abs) => {
      const e = alle.get(path.resolve(abs).toLowerCase());
      if (!e) throw new Error('ENOENT');
      return { mtimeMs: e.mtimeMs, size: e.size };
    });
    return {
      readdir: async (dir) => {
        if (path.resolve(dir).toLowerCase() !== FOLDER.toLowerCase()) throw new Error('ENOENT');
        return [...profile.keys()].map((name) => ({ name, isFile: () => true }));
      },
      stat,
      readFile,
      _readFile: readFile,
      _alle: alle,
    };
  }

  const MIT_NOTIZ = `---
fields:
  - name: ort
    valuesFrom:
      note: Werte/Orte.md
---
`;

  function lauf(profilInhalt, notizen, cache) {
    const profile = new Map([['Sitzung.md', { mtimeMs: 1, size: 10, content: profilInhalt }]]);
    const fsp = fsMitNotizen(profile, notizen);
    return { fsp, cache: cache || createProfileCatalogCache() };
  }

  it('AK1/AK2: liest einen Wert je Zeile in den Wertevorrat', async () => {
    const { fsp, cache } = lauf(
      MIT_NOTIZ,
      new Map([['Werte/Orte.md', { mtimeMs: 1, size: 20, content: 'Berlin\nHamburg\nKöln\n' }]]),
    );
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache,
      areaRoot: AREA,
    });
    expect(profiles[0].fields[0].values).toEqual(['Berlin', 'Hamburg', 'Köln']);
    // Die Quelle bleibt am Feld stehen — der Unterschied zur festen Liste
    // geht nicht verloren.
    expect(profiles[0].fields[0].valuesFrom).toEqual({ note: 'Werte/Orte.md', query: null });
  });

  it('AK3: Leerzeilen, Randleerraum, Doppelte und ein Metadaten-Block entfallen', async () => {
    const { fsp, cache } = lauf(
      MIT_NOTIZ,
      new Map([
        [
          'Werte/Orte.md',
          {
            mtimeMs: 1,
            size: 40,
            content: '---\ntitel: Orte\n---\n  Berlin  \n\nHamburg\nBerlin\n\n',
          },
        ],
      ]),
    );
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache,
      areaRoot: AREA,
    });
    expect(profiles[0].fields[0].values).toEqual(['Berlin', 'Hamburg']);
  });

  it('AK2: eine Änderung an der Notiz wirkt ohne Neustart, unveränderte Dateien werden nicht neu gelesen', async () => {
    const cache = createProfileCatalogCache();
    const notizen = new Map([['Werte/Orte.md', { mtimeMs: 1, size: 20, content: 'Berlin\n' }]]);
    const profile = new Map([['Sitzung.md', { mtimeMs: 1, size: 10, content: MIT_NOTIZ }]]);
    const fsp = fsMitNotizen(profile, notizen);

    const erst = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache, areaRoot: AREA });
    expect(erst.profiles[0].fields[0].values).toEqual(['Berlin']);
    const nachErstlauf = fsp._readFile.mock.calls.length;

    // Zweiter Lauf ohne Änderung: kein erneutes Lesen (der Abgleich greift
    // für die Notiz genauso wie für die Profil-Datei).
    await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache, areaRoot: AREA });
    expect(fsp._readFile.mock.calls.length).toBe(nachErstlauf);

    // Änderung von außen: mtime und Größe wandern, der Vorrat zieht nach.
    const eintrag = fsp._alle.get(path.resolve(AREA, 'Werte/Orte.md').toLowerCase());
    eintrag.mtimeMs = 2;
    eintrag.size = 30;
    eintrag.content = 'Berlin\nHamburg\n';
    const dritt = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache, areaRoot: AREA });
    expect(dritt.profiles[0].fields[0].values).toEqual(['Berlin', 'Hamburg']);
  });

  it('AK4: eine fehlende Notiz lässt das Feld bedienbar, der Vorrat bleibt leer', async () => {
    const { fsp, cache } = lauf(MIT_NOTIZ, new Map());
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache,
      areaRoot: AREA,
    });
    // Das Feld bleibt, nur ohne Vorrat — keine Blockade, kein Wurf.
    expect(profiles[0].fields).toHaveLength(1);
    expect(profiles[0].fields[0].name).toBe('ort');
    expect(profiles[0].fields[0].values).toBeNull();
    expect(profiles[0].fields[0].valuesFrom.note).toBe('Werte/Orte.md');
  });

  it('AK4: eine leere Notiz ist derselbe Fall wie eine fehlende', async () => {
    const { fsp, cache } = lauf(
      MIT_NOTIZ,
      new Map([['Werte/Orte.md', { mtimeMs: 1, size: 0, content: '\n\n  \n' }]]),
    );
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache,
      areaRoot: AREA,
    });
    expect(profiles[0].fields[0].values).toBeNull();
  });

  it('AK5: eine Quelle außerhalb des Bereichs wird nicht gelesen', async () => {
    const profilInhalt = `---
fields:
  - name: ort
    valuesFrom:
      note: ../Fremd/Orte.md
---
`;
    const profile = new Map([['Sitzung.md', { mtimeMs: 1, size: 10, content: profilInhalt }]]);
    const fsp = fsMitNotizen(profile, new Map());
    // Die fremde Datei existiert, liegt aber außerhalb des Bereichs.
    fsp._alle.set(path.resolve(AREA, '../Fremd/Orte.md').toLowerCase(), {
      mtimeMs: 1,
      size: 10,
      content: 'Geheim\n',
    });
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache: createProfileCatalogCache(),
      areaRoot: AREA,
    });
    expect(profiles[0].fields[0].values).toBeNull();
    // Nachweis über den Lese-Zähler: die Datei wurde gar nicht erst geöffnet.
    const gelesen = fsp._readFile.mock.calls.map((c) => String(c[0]).toLowerCase());
    expect(gelesen.some((p) => p.includes('fremd'))).toBe(false);
  });

  it('AK7: ohne valuesFrom.note kostet der Schritt keinen zusätzlichen Zugriff', async () => {
    const ohneQuelle = `---
fields:
  - name: status
    values: [offen, fertig]
---
`;
    const profile = new Map([['P.md', { mtimeMs: 1, size: 10, content: ohneQuelle }]]);
    const fsp = fsMitNotizen(profile, new Map());
    await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache: createProfileCatalogCache(),
      areaRoot: AREA,
    });
    // Genau eine gelesene Datei: die Profil-Datei selbst.
    expect(fsp._readFile.mock.calls).toHaveLength(1);
  });

  it('AK7: ohne areaRoot bleibt der Katalog beim Verhalten vor der Erweiterung', async () => {
    const { fsp, cache } = lauf(
      MIT_NOTIZ,
      new Map([['Werte/Orte.md', { mtimeMs: 1, size: 20, content: 'Berlin\n' }]]),
    );
    const { profiles } = await loadProfileCatalog({ folderAbs: FOLDER, fsp, cache });
    expect(profiles[0].fields[0].values).toBeNull();
    expect(fsp._readFile.mock.calls).toHaveLength(1);
  });

  it('eine Kind-Definition bezieht ihren Vorrat aus derselben Quelle', async () => {
    const verschachtelt = `---
fields:
  - name: teilnehmer
    fields:
      - name: rolle
        valuesFrom:
          note: Werte/Rollen.md
---
`;
    const profile = new Map([['S.md', { mtimeMs: 1, size: 10, content: verschachtelt }]]);
    const fsp = fsMitNotizen(
      profile,
      new Map([['Werte/Rollen.md', { mtimeMs: 1, size: 20, content: 'Leitung\nGast\n' }]]),
    );
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache: createProfileCatalogCache(),
      areaRoot: AREA,
    });
    expect(profiles[0].fields[0].fields[0].values).toEqual(['Leitung', 'Gast']);
  });

  it('zwei Felder auf derselben Notiz lesen sie einmal', async () => {
    const zweiFelder = `---
fields:
  - name: ort
    valuesFrom:
      note: Werte/Orte.md
  - name: heimat
    valuesFrom:
      note: Werte/Orte.md
---
`;
    const profile = new Map([['S.md', { mtimeMs: 1, size: 10, content: zweiFelder }]]);
    const fsp = fsMitNotizen(
      profile,
      new Map([['Werte/Orte.md', { mtimeMs: 1, size: 20, content: 'Berlin\n' }]]),
    );
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache: createProfileCatalogCache(),
      areaRoot: AREA,
    });
    expect(profiles[0].fields[0].values).toEqual(['Berlin']);
    expect(profiles[0].fields[1].values).toEqual(['Berlin']);
    // Profil-Datei plus Notiz: zwei Lese-Zugriffe, nicht drei.
    expect(fsp._readFile.mock.calls).toHaveLength(2);
  });

  it('AK6: der Vorrat aus einer Notiz wirkt wie eine feste Liste im weichen Hinweis', async () => {
    const { fsp, cache } = lauf(
      MIT_NOTIZ,
      new Map([['Werte/Orte.md', { mtimeMs: 1, size: 20, content: 'Berlin\n' }]]),
    );
    const { profiles } = await loadProfileCatalog({
      folderAbs: FOLDER,
      fsp,
      cache,
      areaRoot: AREA,
    });
    const def = profiles[0].fields[0];
    expect(fieldDefinitionHint(def, 'Berlin')).toBeNull();
    // Ein eigener Wert bleibt möglich und erzeugt höchstens den Hinweis.
    expect(fieldDefinitionHint(def, 'Kiel')).toBe('outsideValues');
  });
});
