// 4T-001349 (Epic 3E-000170): Die Anlage-Wege des Bereichs-Panels am ECHTEN
// Handler, nicht an der reinen Namens-Pruefung.
//
// Die Namens-Regeln selbst prueft area-path.test.js. Hier geht es um das, was
// nur der Handler entscheidet: die Bereichs-Grenze (AK10) und das Verhalten am
// bestehenden Ziel (AK5). Beide haengen an der Reihenfolge der Pruefungen und
// an den Flags des Dateisystem-Aufrufs — ein Test gegen die Namens-Funktion
// allein saehe davon nichts.
//
// Der Deps-Zuschnitt folgt dem, den main.js zusammenstellt (Muster
// demo-workspace-eintrag.test.js).
import { afterEach, describe, expect, it } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');

const tempOrdner = [];

afterEach(async () => {
  while (tempOrdner.length) {
    const dir = tempOrdner.pop();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function bereich() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'em4me-anlage-'));
  tempOrdner.push(dir);
  // Der Bereich ist das gemeldete Wurzelverzeichnis; daneben liegt ein
  // Nachbar-Ordner AUSSERHALB, an dem die Grenz-Pruefung messbar wird.
  const wurzel = path.join(dir, 'bereich');
  await fsp.mkdir(wurzel);
  await fsp.mkdir(path.join(dir, 'daneben'));
  return { dir, wurzel };
}

function registriere(rootPath) {
  const handler = new Map();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: {},
    senderWindow: () => ({}),
    areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
    tForWindow: (_w, key) => key,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
  });
  return handler;
}

describe('area:createFolder (4T-001349)', () => {
  it('legt den Unterordner im angegebenen Ordner an', async () => {
    const { wurzel } = await bereich();
    const handler = registriere(wurzel);

    const ergebnis = await handler.get('area:createFolder')(
      {},
      {
        dirPath: wurzel,
        name: 'Projekte',
      },
    );

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.path).toBe(path.join(wurzel, 'Projekte'));
    const stat = await fsp.stat(path.join(wurzel, 'Projekte'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('meldet einen bereits vergebenen Namen, ohne etwas zu ersetzen', async () => {
    const { wurzel } = await bereich();
    await fsp.mkdir(path.join(wurzel, 'Projekte'));
    await fsp.writeFile(path.join(wurzel, 'Projekte', 'alt.md'), '# alt\n', 'utf8');
    const handler = registriere(wurzel);

    const ergebnis = await handler.get('area:createFolder')(
      {},
      {
        dirPath: wurzel,
        name: 'Projekte',
      },
    );

    expect(ergebnis).toEqual({ ok: false, error: 'exists' });
    // Der Bestand des vorhandenen Ordners ist unangetastet.
    expect(await fsp.readdir(path.join(wurzel, 'Projekte'))).toEqual(['alt.md']);
  });

  it('weist einen unzulaessigen Namen ab, bevor etwas angelegt wird', async () => {
    const { wurzel } = await bereich();
    const handler = registriere(wurzel);

    for (const name of ['', '   ', '..', 'a:b', 'a?b']) {
      const ergebnis = await handler.get('area:createFolder')({}, { dirPath: wurzel, name });
      expect(ergebnis).toEqual({ ok: false, error: 'invalid name' });
    }
    expect(await fsp.readdir(wurzel)).toEqual([]);
  });

  it('weist einen Ziel-Ordner ausserhalb des Bereichs ab', async () => {
    const { dir, wurzel } = await bereich();
    const handler = registriere(wurzel);

    const ergebnis = await handler.get('area:createFolder')(
      {},
      {
        dirPath: path.join(dir, 'daneben'),
        name: 'Projekte',
      },
    );

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(await fsp.readdir(path.join(dir, 'daneben'))).toEqual([]);
  });

  it('weist einen Namen ab, der den Bereich ueber Trenner-Zeichen verliesse', async () => {
    const { dir, wurzel } = await bereich();
    const handler = registriere(wurzel);

    // Der Name traegt Pfad-Segmente; die Namens-Pruefung faengt ihn ab, bevor
    // das gebildete Ziel ueberhaupt entsteht.
    const ergebnis = await handler.get('area:createFolder')(
      {},
      {
        dirPath: wurzel,
        name: path.join('..', 'daneben', 'Untergeschoben'),
      },
    );

    expect(ergebnis.ok).toBe(false);
    expect(await fsp.readdir(path.join(dir, 'daneben'))).toEqual([]);
  });

  it('legt ohne Bereich nichts an', async () => {
    const { wurzel } = await bereich();
    const handler = registriere(null);

    const ergebnis = await handler.get('area:createFolder')(
      {},
      {
        dirPath: wurzel,
        name: 'Projekte',
      },
    );

    expect(ergebnis).toEqual({ ok: false, error: 'no area' });
    expect(await fsp.readdir(wurzel)).toEqual([]);
  });
});

// Der Datei-Weg besteht seit 4T-000328; hier steht nur die Grenz-Pruefung, weil
// das Kontextmenue ihn jetzt mit einem Ordner aus dem Baum aufruft statt allein
// mit dem ausgewaehlten (AK10).
describe('area:createFile an der Bereichs-Grenze (4T-001349)', () => {
  it('weist einen Ziel-Ordner ausserhalb des Bereichs ab', async () => {
    const { dir, wurzel } = await bereich();
    const handler = registriere(wurzel);

    const ergebnis = await handler.get('area:createFile')(
      {},
      {
        dirPath: path.join(dir, 'daneben'),
        name: 'Notiz',
      },
    );

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(await fsp.readdir(path.join(dir, 'daneben'))).toEqual([]);
  });

  it('ergaenzt die Markdown-Endung im angegebenen Ordner', async () => {
    const { wurzel } = await bereich();
    await fsp.mkdir(path.join(wurzel, 'Unterordner'));
    const handler = registriere(wurzel);

    const ergebnis = await handler.get('area:createFile')(
      {},
      {
        dirPath: path.join(wurzel, 'Unterordner'),
        name: 'Notiz',
      },
    );

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.path).toBe(path.join(wurzel, 'Unterordner', 'Notiz.md'));
  });
});
