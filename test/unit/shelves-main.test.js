// 4T-000867 (Epic 3E-000162): Unit-Tests der Datei-Ebene des Bücherregals
// (src/main/books/shelves.js) gegen echte Temp-Ordner — Erkennung ohne Rückverweis
// (Story 4S-000760, AK2), Zustands-Aufbau für die Preload-API, Neuanlage (AK3)
// und Zuordnung samt «nicht zugeordnet» (AK4). Setup-Muster
// test/unit/books-main.test.js (mkdtemp je Fall, Aufräumen im afterEach).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isFilesystemCaseInsensitive } from '../../src/shared/platform.js';
import {
  SHELF_SETTINGS_FILENAME,
  assignBookDir,
  buildShelfState,
  buildShelfViewData,
  collectBookDirs,
  createShelf,
  detectShelfDirFor,
  readShelfSettings,
  sanitizeShelfName,
  shelfFileExists,
  unassignBookDir,
} from '../../src/main/books/shelves.js';
import {
  BOOK_SETTINGS_FILENAME,
  emptyBookContainer,
  serializeBookContainer,
} from '../../src/shared/books/book-core.js';

let tmpDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-regal-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows-Dateisperren: Rest räumt das Betriebssystem-Temp auf.
    }
  }
  tmpDirs = [];
});

// Regal-Ordner mit Regal-Datei und Begleitdatei anlegen (Fixture-Helfer).
function makeShelf(parent, name) {
  const shelfDir = path.join(parent, name);
  fs.mkdirSync(shelfDir);
  fs.writeFileSync(path.join(shelfDir, `${name}.md`), '# Regal\n', 'utf8');
  fs.writeFileSync(
    path.join(shelfDir, SHELF_SETTINGS_FILENAME),
    JSON.stringify({ schemaVersion: 1, shelf: { file: `${name}.md` }, books: [] }, null, 2),
    'utf8',
  );
  return shelfDir;
}

// Buch-Ordner unterhalb eines Regals anlegen (echte Buch-Begleitdatei, damit
// die Buch-Erkennung aus books.js greift).
function makeBook(shelfDir, name) {
  const bookDir = path.join(shelfDir, name);
  fs.mkdirSync(bookDir);
  fs.writeFileSync(path.join(bookDir, `${name}.md`), '', 'utf8');
  fs.writeFileSync(
    path.join(bookDir, BOOK_SETTINGS_FILENAME),
    serializeBookContainer(emptyBookContainer(`${name}.md`)),
    'utf8',
  );
  return bookDir;
}

describe('shelves: Begleitdatei lesen', () => {
  it('meldet no-shelf ohne Begleitdatei und invalid bei defekter Datei', async () => {
    const parent = makeTempDir();
    expect((await readShelfSettings(parent)).error).toBe('no-shelf');
    expect((await readShelfSettings('')).error).toBe('no-shelf');
    const kaputt = path.join(parent, 'Kaputt');
    fs.mkdirSync(kaputt);
    fs.writeFileSync(path.join(kaputt, SHELF_SETTINGS_FILENAME), 'kein json', 'utf8');
    expect((await readShelfSettings(kaputt)).error).toBe('invalid');
  });

  it('liest ein gültiges Regal samt Schreibweise der Begleitdatei', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    const settings = await readShelfSettings(shelfDir);
    expect(settings.ok).toBe(true);
    expect(path.basename(settings.settingsPath)).toBe(SHELF_SETTINGS_FILENAME);
  });
});

describe('shelves: Erkennung beim Datei-Öffnen (AK2)', () => {
  it('erkennt genau die benannte Regal-Datei, andere Dateien nicht', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    fs.writeFileSync(path.join(shelfDir, 'Notiz.md'), 'x', 'utf8');
    expect(await detectShelfDirFor(path.join(shelfDir, 'Bibliothek.md'))).toBe(shelfDir);
    expect(await detectShelfDirFor(path.join(shelfDir, 'Notiz.md'))).toBe(null);
    expect(await detectShelfDirFor(path.join(shelfDir, SHELF_SETTINGS_FILENAME))).toBe(null);
    expect(await detectShelfDirFor(path.join(parent, 'fehlt.md'))).toBe(null);
  });
});

describe('shelves: Ordner-Bestand und Zustand', () => {
  it('zählt nur echte Buch-Ordner zum Bestand', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    makeBook(shelfDir, 'Reise nach Ithaka');
    fs.mkdirSync(path.join(shelfDir, 'Gewöhnlicher Ordner'));
    expect(await collectBookDirs(shelfDir)).toEqual(['Reise nach Ithaka']);
    expect(await collectBookDirs(path.join(parent, 'fehlt'))).toEqual([]);
  });

  it('baut den Zustand mit zugeordnet, nicht zugeordnet und fehlend', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    makeBook(shelfDir, 'Reise nach Ithaka');
    makeBook(shelfDir, 'Kochbuch');
    // Zuordnung: Kochbuch zugeordnet, dazu ein Eintrag ohne Ordner.
    fs.writeFileSync(
      path.join(shelfDir, SHELF_SETTINGS_FILENAME),
      JSON.stringify(
        { schemaVersion: 1, shelf: { file: 'Bibliothek.md' }, books: ['Kochbuch', 'Verschollen'] },
        null,
        2,
      ),
      'utf8',
    );
    const result = await buildShelfState(shelfDir);
    expect(result.ok).toBe(true);
    expect(result.state.shelfFileName).toBe('Bibliothek.md');
    expect(result.state.books).toEqual(['Kochbuch', 'Verschollen']);
    expect(result.state.unassigned).toEqual(['Reise nach Ithaka']);
    expect(result.state.missing).toEqual(['Verschollen']);
    expect(await shelfFileExists(shelfDir, 'Bibliothek.md')).toBe(true);
    expect(await shelfFileExists(shelfDir, 'Fehlt.md')).toBe(false);
  });
});

describe('shelves: Neuanlage (AK3)', () => {
  it('legt Ordner, Regal-Datei und Begleitdatei an; das Regal ist sofort erkennbar', async () => {
    const parent = makeTempDir();
    const created = await createShelf(parent, ' Meine Bibliothek ');
    expect(created.ok).toBe(true);
    expect(created.shelfFileName).toBe('Meine Bibliothek.md');
    expect(fs.existsSync(created.shelfFilePath)).toBe(true);
    expect(fs.existsSync(path.join(created.shelfDir, SHELF_SETTINGS_FILENAME))).toBe(true);
    expect(await detectShelfDirFor(created.shelfFilePath)).toBe(created.shelfDir);
    const state = await buildShelfState(created.shelfDir);
    expect(state.ok).toBe(true);
    expect(state.state.books).toEqual([]);
  });

  it('weist unzulässige Namen ab und lässt bestehende Ordner unangetastet', async () => {
    const parent = makeTempDir();
    expect((await createShelf(parent, '  ')).error).toBe('invalid-name');
    expect((await createShelf(parent, 'a/b')).error).toBe('invalid-name');
    expect(sanitizeShelfName('Regal?')).toBe(null);
    fs.mkdirSync(path.join(parent, 'Belegt'));
    fs.writeFileSync(path.join(parent, 'Belegt', 'inhalt.txt'), 'bleibt', 'utf8');
    expect((await createShelf(parent, 'Belegt')).error).toBe('exists');
    expect(fs.readFileSync(path.join(parent, 'Belegt', 'inhalt.txt'), 'utf8')).toBe('bleibt');
  });
});

// 4T-000868 (Story 4S-000761): Anzeige-Daten der Regal-Ansicht.
describe('shelves: Ansichts-Daten (4T-000868)', () => {
  it('liefert Titel, Autor, Beschreibung, Bild und Kapitel-Anzahl je Buch', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    // Regal-Datei mit Frontmatter-Titel.
    fs.writeFileSync(
      path.join(shelfDir, 'Bibliothek.md'),
      '---\ntitle: Meine Bibliothek\n---\n# Regal\n',
      'utf8',
    );
    // Buch mit Frontmatter (Titel, Autor, Beschreibung, existierendes Bild)
    // und zwei Kapiteln.
    const buchDir = makeBook(shelfDir, 'Reise nach Ithaka');
    fs.writeFileSync(path.join(buchDir, 'cover.png'), 'png', 'utf8');
    fs.writeFileSync(
      path.join(buchDir, 'Reise nach Ithaka.md'),
      '---\ntitle: Reise nach Ithaka\nauthor: K. P. Kavafis\ndescription: Eine Heimkehr.\ncover: cover.png\n---\n',
      'utf8',
    );
    fs.writeFileSync(path.join(buchDir, 'Kapitel 1.md'), '', 'utf8');
    fs.writeFileSync(path.join(buchDir, 'Kapitel 2.md'), '', 'utf8');
    fs.writeFileSync(
      path.join(buchDir, BOOK_SETTINGS_FILENAME),
      JSON.stringify(
        {
          schemaVersion: 1,
          book: { file: 'Reise nach Ithaka.md' },
          chapters: [{ path: 'Kapitel 1.md', children: [{ path: 'Kapitel 2.md', children: [] }] }],
        },
        null,
        2,
      ),
      'utf8',
    );
    // Buch ohne Frontmatter und mit totem Bild-Verweis.
    const schlicht = makeBook(shelfDir, 'Kochbuch');
    fs.writeFileSync(path.join(schlicht, 'Kochbuch.md'), '---\ncover: fehlt.png\n---\n', 'utf8');
    fs.writeFileSync(
      path.join(shelfDir, SHELF_SETTINGS_FILENAME),
      JSON.stringify(
        {
          schemaVersion: 1,
          shelf: { file: 'Bibliothek.md' },
          books: ['Reise nach Ithaka', 'Verschollen'],
        },
        null,
        2,
      ),
      'utf8',
    );
    const result = await buildShelfViewData(shelfDir);
    expect(result.ok).toBe(true);
    expect(result.view.shelfTitle).toBe('Meine Bibliothek');
    expect(result.view.books.map((e) => e.dirName)).toEqual(['Reise nach Ithaka', 'Verschollen']);
    const [reise, verschollen] = result.view.books;
    expect(reise.title).toBe('Reise nach Ithaka');
    expect(reise.author).toBe('K. P. Kavafis');
    expect(reise.description).toBe('Eine Heimkehr.');
    // 4T-002068: Das Titelbild kommt als Daten-Adresse, nie als Pfad.
    expect(reise.imageData).toBe(`data:image/png;base64,${Buffer.from('png').toString('base64')}`);
    expect(reise).not.toHaveProperty('imagePath');
    expect(reise.chapters).toBe(2);
    expect(reise.missing).toBe(false);
    expect(verschollen.missing).toBe(true);
    // Nicht zugeordnet: Ordner-Name als Titel-Rückfall, toter Bild-Verweis
    // wird zu null (Platzhalter-Kachel).
    expect(result.view.unassigned.map((e) => e.dirName)).toEqual(['Kochbuch']);
    expect(result.view.unassigned[0].title).toBe('Kochbuch');
    expect(result.view.unassigned[0].imageData).toBe(null);
    expect(result.view.unassigned[0].assigned).toBe(false);
  });

  it('fällt beim Regal-Titel auf den Datei-Namen ohne Endung zurück', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    const result = await buildShelfViewData(shelfDir);
    expect(result.ok).toBe(true);
    expect(result.view.shelfTitle).toBe('Bibliothek');
    expect((await buildShelfViewData(path.join(parent, 'fehlt'))).error).toBe('no-shelf');
  });
});

// 4T-002068 (Epic 3E-000344, Verdacht 2 aus 4T-001963): Grenze des Titelbilds
// in der Regal-Ansicht.
//
// **Was zugesichert wird.** Das Titelbild eines Buches kommt als Daten-Adresse,
// gelesen innerhalb des Regal-Ordners, mit Bild-Endung und höchstens 20 MB;
// sonst bleibt `imageData` null und die Ansicht zeigt die Platzhalter-Kachel.
// Grenze ist in jedem Fall der Regal-Ordner (Entscheidung des Product Owners
// vom 2026-10-04, «Weg A»): Ein umgebender Bereich weitet sie nicht. Die
// Ansichts-Daten bekommen deshalb gar keinen Bereich herein; «Regal im Bereich»
// prüft dieselbe Grenze wie «Regal ohne Bereich», mit einem Titelbild, das im
// umgebenden Ordner liegt.
//
// **Warum die Datei-Zugriffe gezählt werden** (Muster
// test/unit/preload-images.test.js): Schon der Größen-Zugriff auf eine
// Freigabe-Adresse wäre die Verbindung zum fremden Rechner. Jeder Fall prüft
// deshalb, dass kein Zugriff außerhalb des Regal-Ordners stattfand. Die
// Freigabe-Adressen nennen einen Rechner unter `.invalid`, der nie aufgelöst
// wird.
describe('shelves: Grenze des Titelbilds (4T-002068)', () => {
  const BILD = Buffer.from('PNG-Probe');
  const DATEN = `data:image/png;base64,${BILD.toString('base64')}`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Ein Regal in einem umgebenden Ordner mit einem nicht zugeordneten Buch,
  // dessen Titelbild-Verweis der Fall setzt. Der Verweis steht in
  // Anführungszeichen, damit Rückstriche und Doppelpunkte als Text gelten.
  function regalMitTitelbild(cover) {
    const umgebung = makeTempDir();
    const shelfDir = makeShelf(umgebung, 'Bibliothek');
    const buchDir = makeBook(shelfDir, 'Reise');
    fs.writeFileSync(
      path.join(buchDir, 'Reise.md'),
      `---\ncover: ${JSON.stringify(cover)}\n---\n`,
      'utf8',
    );
    return { umgebung, shelfDir, buchDir };
  }

  function schreibeBild(datei, inhalt = BILD) {
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, inhalt);
    return datei;
  }

  // Zählt die Datei-Zugriffe (Größe und Inhalt) ab jetzt mit.
  function zugriffeMitzaehlen() {
    const zugriffe = [];
    const statOriginal = fsp.stat;
    const readOriginal = fsp.readFile;
    vi.spyOn(fsp, 'stat').mockImplementation((p, ...rest) => {
      zugriffe.push(String(p));
      return statOriginal.call(fsp, p, ...rest);
    });
    vi.spyOn(fsp, 'readFile').mockImplementation((p, ...rest) => {
      zugriffe.push(String(p));
      return readOriginal.call(fsp, p, ...rest);
    });
    return zugriffe;
  }

  function ausserhalb(zugriffe, shelfDir) {
    return zugriffe.filter((p) => {
      const rel = path.relative(shelfDir, path.resolve(p));
      return rel.startsWith('..') || path.isAbsolute(rel);
    });
  }

  async function titelbildVon(shelfDir) {
    const result = await buildShelfViewData(shelfDir);
    expect(result.ok).toBe(true);
    expect(result.view.unassigned.map((e) => e.dirName)).toEqual(['Reise']);
    return result.view.unassigned[0].imageData;
  }

  it('`../` aus dem Regal-Ordner hinaus: Platzhalter, kein Zugriff auf das Ziel', async () => {
    const { umgebung, shelfDir } = regalMitTitelbild('../../aussen.png');
    schreibeBild(path.join(umgebung, 'aussen.png'));
    const zugriffe = zugriffeMitzaehlen();
    expect(await titelbildVon(shelfDir)).toBeNull();
    expect(ausserhalb(zugriffe, shelfDir)).toEqual([]);
  });

  it('absoluter Pfad außerhalb des Regal-Ordners: Platzhalter, kein Zugriff', async () => {
    const fremd = schreibeBild(path.join(makeTempDir(), 'fremd.png'));
    const { shelfDir } = regalMitTitelbild(fremd);
    const zugriffe = zugriffeMitzaehlen();
    expect(await titelbildVon(shelfDir)).toBeNull();
    expect(ausserhalb(zugriffe, shelfDir)).toEqual([]);
  });

  it('Netz-Pfad in jeder Schreibweise: Platzhalter, kein Zugriff auf die Freigabe', async () => {
    for (const cover of [
      '\\\\rechner.invalid\\freigabe\\bild.png',
      '//rechner.invalid/freigabe/bild.png',
    ]) {
      const { shelfDir } = regalMitTitelbild(cover);
      const zugriffe = zugriffeMitzaehlen();
      expect(await titelbildVon(shelfDir), cover).toBeNull();
      expect(ausserhalb(zugriffe, shelfDir), cover).toEqual([]);
      // Die Schreibweise mit Rückstrichen ist allein unter Windows eine
      // Freigabe-Adresse (4T-001920). Unter Linux ist sie ein Dateiname im
      // Buch-Ordner; ein Lese-Versuch dort erreicht keine Freigabe, und dass er
      // innerhalb des Regal-Ordners bleibt, prüft die Zeile darüber (4T-002158).
      if (process.platform === 'win32' || !cover.includes('\\')) {
        expect(
          zugriffe.filter((p) => p.toLowerCase().includes('rechner.invalid')),
          cover,
        ).toEqual([]);
      }
      vi.restoreAllMocks();
    }
  });

  it('Datei ohne Bild-Endung im Buch-Ordner: Platzhalter, die Datei wird nicht gelesen', async () => {
    const { shelfDir, buchDir } = regalMitTitelbild('titel.txt');
    const text = schreibeBild(path.join(buchDir, 'titel.txt'), 'kein Bild');
    const zugriffe = zugriffeMitzaehlen();
    expect(await titelbildVon(shelfDir)).toBeNull();
    expect(zugriffe).not.toContain(text);
  });

  it('Bilddatei über 20 MB: Platzhalter, der Inhalt wird nicht gelesen', async () => {
    const { shelfDir, buchDir } = regalMitTitelbild('gross.png');
    const gross = path.join(buchDir, 'gross.png');
    const fd = fs.openSync(gross, 'w');
    fs.ftruncateSync(fd, 20 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    zugriffeMitzaehlen();
    expect(await titelbildVon(shelfDir)).toBeNull();
    expect(fsp.readFile).not.toHaveBeenCalledWith(gross);
  });

  it('Regal ohne Bereich: Grenze ist der Regal-Ordner, nicht der Buch-Ordner', async () => {
    // Relativ über den Buch-Ordner hinaus, aber im Regal-Ordner.
    const relativ = regalMitTitelbild('../gemeinsam/titel.png');
    schreibeBild(path.join(relativ.shelfDir, 'gemeinsam', 'titel.png'));
    let zugriffe = zugriffeMitzaehlen();
    expect(await titelbildVon(relativ.shelfDir)).toBe(DATEN);
    expect(ausserhalb(zugriffe, relativ.shelfDir)).toEqual([]);
    vi.restoreAllMocks();
    // Absolut geschrieben, Ziel im Regal-Ordner: zählt wie relativ.
    const absolut = makeTempDir();
    const shelfDir = makeShelf(absolut, 'Bibliothek');
    const buchDir = makeBook(shelfDir, 'Reise');
    const ziel = schreibeBild(path.join(buchDir, 'bilder', 'titel.png'));
    fs.writeFileSync(
      path.join(buchDir, 'Reise.md'),
      `---\ncover: ${JSON.stringify(ziel)}\n---\n`,
      'utf8',
    );
    zugriffe = zugriffeMitzaehlen();
    expect(await titelbildVon(shelfDir)).toBe(DATEN);
    expect(ausserhalb(zugriffe, shelfDir)).toEqual([]);
  });

  it('Regal im Bereich: dieselbe Grenze — ein Titelbild im Bereich außerhalb des Regals erscheint nicht', async () => {
    // Der umgebende Ordner steht für den Bereich; das Bild liegt darin, aber
    // außerhalb des Regal-Ordners.
    const { umgebung, shelfDir } = regalMitTitelbild('../../anlagen/titel.png');
    schreibeBild(path.join(umgebung, 'anlagen', 'titel.png'));
    const zugriffe = zugriffeMitzaehlen();
    expect(await titelbildVon(shelfDir)).toBeNull();
    expect(ausserhalb(zugriffe, shelfDir)).toEqual([]);
  });
});

describe('shelves: Zuordnung (AK4)', () => {
  it('ordnet echte Buch-Ordner zu und hält die Invariante', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    makeBook(shelfDir, 'Reise nach Ithaka');
    const eins = await assignBookDir(shelfDir, 'Reise nach Ithaka');
    expect(eins.ok).toBe(true);
    expect(eins.books).toEqual(['Reise nach Ithaka']);
    // 4T-001250 (Epic 3E-000124): Auf einem Dateisystem, das die Schreibung
    // unterscheidet, ist der klein geschriebene Ordner ein ANDERER Ordner, und
    // die Zuordnung meldet folgerichtig «unknown-dir». Dass die Anwendung ihn
    // dennoch als Doppel abweisen wuerde, sobald er existiert, ist ein
    // Produkt-Befund: Der Vergleichs-Schluessel in shelf-core.js faltet die
    // Schreibung fest, statt die zentrale Plattform-Auskunft zu fragen. Er ist
    // hier NICHT festgeschrieben, sondern als eigener Vorgang verortet — der
    // Fall prueft deshalb je Dateisystem die Aussage, die dort zutrifft.
    expect((await assignBookDir(shelfDir, 'reise nach ithaka')).error).toBe(
      isFilesystemCaseInsensitive() ? 'duplicate-book' : 'unknown-dir',
    );
    // Persistiert: der Zustand liest die Zuordnung frisch von der Platte.
    const state = await buildShelfState(shelfDir);
    expect(state.state.books).toEqual(['Reise nach Ithaka']);
    expect(state.state.unassigned).toEqual([]);
  });

  it('weist fehlende Ordner und Nicht-Buch-Ordner ab', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    fs.mkdirSync(path.join(shelfDir, 'Kein Buch'));
    expect((await assignBookDir(shelfDir, 'Fehlt')).error).toBe('unknown-dir');
    expect((await assignBookDir(shelfDir, 'Kein Buch')).error).toBe('not-a-book');
    expect((await assignBookDir(shelfDir, 'a/b')).error).toBe('invalid-name');
  });

  it('löst die Zuordnung, auch für Einträge ohne Ordner (Heilungs-Weg)', async () => {
    const parent = makeTempDir();
    const shelfDir = makeShelf(parent, 'Bibliothek');
    makeBook(shelfDir, 'Kochbuch');
    await assignBookDir(shelfDir, 'Kochbuch');
    fs.writeFileSync(
      path.join(shelfDir, SHELF_SETTINGS_FILENAME),
      JSON.stringify(
        { schemaVersion: 1, shelf: { file: 'Bibliothek.md' }, books: ['Kochbuch', 'Verschollen'] },
        null,
        2,
      ),
      'utf8',
    );
    const geloest = await unassignBookDir(shelfDir, 'Verschollen');
    expect(geloest.ok).toBe(true);
    expect(geloest.books).toEqual(['Kochbuch']);
    expect((await unassignBookDir(shelfDir, 'Fehlt')).error).toBe('unknown-book');
    const state = await buildShelfState(shelfDir);
    expect(state.state.books).toEqual(['Kochbuch']);
    expect(state.state.missing).toEqual([]);
  });
});
