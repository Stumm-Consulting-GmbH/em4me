// 4T-000867 (Epic 3E-000162): Datei-Ebene des Bücherregals — Erkennung eines
// Regal-Ordners, Zustands-Aufbau für den Renderer, Neuanlage und Zuordnung.
//
// Der Kern des Regal-Modells (Begleitdatei, Buch-Liste, Abgleich) liegt
// prozess-neutral in src/shared/books/shelf-core.js und bleibt unangetastet; hier
// kommt allein der Datei-Zugriff dazu. Electron-frei (nur node:fs und
// node:path), damit die Wege (Erkennen, Zustand aufbauen, Anlegen, Zuordnen)
// an echten Temp-Ordnern unit-testbar sind (Muster src/main/books/books.js);
// main.js verdrahtet sie mit Dialogen, App-Registry und IPC.
//
// Ob ein Unterordner ein Buch-Ordner ist, entscheidet die Buch-Erkennung aus
// books.js (Begleitdatei benennt eine Buch-Datei) — eine zweite Fassung wäre
// eine zweite Wahrheit über Buch-Ordner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
// 4T-001276 (Epic 3E-000232, Befund B1): Ordner-Identität über die zentrale Auskunft.
const { pathCompareKey } = require('../../shared/platform.js');

const {
  SHELF_SETTINGS_FILENAME,
  emptyShelfContainer,
  parseShelfContainer,
  serializeShelfContainer,
  readShelfFileName,
  readBookList,
  setBookList,
  findShelfSettingsEntry,
  isShelfFileName,
  normalizeBookDirName,
  assignBook,
  unassignBook,
  diffBookDirs,
} = require('../../shared/books/shelf-core.js');
// Buch-Erkennung und Namens-Prüfung aus der Buch-Datei-Ebene: readBookSettings
// beantwortet „ist dieser Ordner ein Buch-Ordner?", sanitizeBookName gilt für
// Regal-Namen unverändert (dieselben Windows-Ordnernamen-Regeln).
const { readBookSettings, sanitizeBookName } = require('./books.js');
// 4T-000868: Bausteine der Regal-Ansicht — Kapitel-Anzahl aus dem Kapitel-Baum
// des Buches, Titel/Autor/Beschreibung/Bild aus dem Frontmatter der
// Buch-Datei (dieselben Parser wie überall, keine zweite Fassung).
const {
  readBookFileName,
  readChapterTree,
  flattenChapters,
} = require('../../shared/books/book-core.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');

// Endungs-Satz der Markdown-Dateien, identisch zu isMarkdownPath in main.js
// (bewusst nachgebildet statt importiert, Begründung in books.js).
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);

function isMarkdownName(name) {
  return MARKDOWN_EXTENSIONS.has(path.extname(String(name)).toLowerCase());
}

function shelfSettingsPathFor(shelfDir) {
  return path.join(shelfDir, SHELF_SETTINGS_FILENAME);
}

// Regal-Namens-Prüfung: identisch zur Buch-Namens-Prüfung.
const sanitizeShelfName = sanitizeBookName;

// --- Lesen der Begleitdatei --------------------------------------------------

// Liest und parst die Begleitdatei eines Ordners. Ergebnis:
//   { ok: true, container, settingsPath }
//   { ok: false, error: 'no-shelf' }  Ordner ohne Begleitdatei
//   { ok: false, error: 'invalid', detail }  Begleitdatei defekt oder ohne
//                                            benannte Regal-Datei
// Die Unterscheidung trägt die Meldung an den Anwender (Muster books.js).
async function readShelfSettings(shelfDir) {
  if (typeof shelfDir !== 'string' || shelfDir === '') return { ok: false, error: 'no-shelf' };
  let entries;
  try {
    entries = await fs.readdir(shelfDir);
  } catch {
    return { ok: false, error: 'no-shelf' };
  }
  const entry = findShelfSettingsEntry(entries);
  if (entry === null) return { ok: false, error: 'no-shelf' };
  const settingsPath = path.join(shelfDir, entry);
  let raw;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch (err) {
    return { ok: false, error: 'invalid', detail: err && err.message ? err.message : String(err) };
  }
  const parsed = parseShelfContainer(raw);
  if (!parsed.ok) return { ok: false, error: 'invalid', detail: parsed.error };
  return { ok: true, container: parsed.container, settingsPath };
}

// --- Erkennung beim Datei-Öffnen ---------------------------------------------

// Ist diese Markdown-Datei die Regal-Datei ihres Ordners? Liefert den
// Regal-Ordner (absolut) oder null. Erkennung ohne Rückverweis: die
// Begleitdatei des Ordners benennt den Basenamen (Muster der Buch-Erkennung).
async function detectShelfDirFor(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  if (!isMarkdownName(filePath)) return null;
  const absolute = path.resolve(filePath);
  const shelfDir = path.dirname(absolute);
  const settings = await readShelfSettings(shelfDir);
  if (!settings.ok) return null;
  return isShelfFileName(settings.container, path.basename(absolute)) ? shelfDir : null;
}

// --- Ordner-Bestand des Regal-Ordners ----------------------------------------

// Die Ordner-Namen der Buch-Ordner unmittelbar unter dem Regal-Ordner, in
// Datei-Bestands-Reihenfolge. Ein Unterordner zählt genau dann, wenn seine
// eigene Begleitdatei eine Buch-Datei benennt; gewöhnliche Unterordner und
// nicht lesbare Einträge werden übersprungen (Fehler-Isolation pro Knoten).
async function collectBookDirs(shelfDir) {
  let entries;
  try {
    entries = await fs.readdir(shelfDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const settings = await readBookSettings(path.join(shelfDir, entry.name));
    if (settings.ok) out.push(entry.name);
  }
  return out;
}

// 4T-000873 (Story 4S-000760, AK7): Der Buch-Ordner des Regals, in dem diese Datei
// liegt — Grundlage des strikten Routings (Variante R1): Jeder Griff in ein
// Buch verlaesst das Regal-Fenster und landet in der Buch-Applikation.
// Geprueft wird das ERSTE Pfad-Segment unter dem Regal-Ordner, weil die
// Hierarchie beim Regal endet: Ein Buch liegt unmittelbar darunter, tiefer
// liegen seine Kapitel. Dateien unmittelbar im Regal-Ordner (Regal-Datei,
// lose Notizen) liefern null und bleiben im Regal-Fenster.
async function bookDirContaining(shelfDir, filePath) {
  if (typeof shelfDir !== 'string' || typeof filePath !== 'string') return null;
  if (shelfDir === '' || filePath === '') return null;
  const root = path.resolve(shelfDir);
  const rel = path.relative(root, path.resolve(filePath));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const teile = rel.split(path.sep);
  if (teile.length < 2) return null;
  const kandidat = path.join(root, teile[0]);
  const settings = await readBookSettings(kandidat);
  return settings.ok ? kandidat : null;
}

// --- Zustand des aktiven Regals ----------------------------------------------

// Baut den Zustand eines Regal-Ordners für den Renderer auf (Vertrag der
// Preload-API `shelves`): Regal-Ordner, Basename der Regal-Datei, zugeordnete
// Bücher in Listen-Reihenfolge sowie der Abgleich mit dem Ordner-Bestand
// (nicht zugeordnet, fehlend). Fehler-Kennungen wie bei readShelfSettings.
async function buildShelfState(shelfDir) {
  const settings = await readShelfSettings(shelfDir);
  if (!settings.ok) return settings;
  const shelfFileName = readShelfFileName(settings.container);
  const assigned = readBookList(settings.container);
  const bookDirNames = await collectBookDirs(shelfDir);
  const { unassigned, missing } = diffBookDirs(assigned, bookDirNames);
  return {
    ok: true,
    state: {
      shelfDir: path.resolve(shelfDir),
      shelfFileName,
      books: assigned,
      unassigned,
      missing,
    },
  };
}

// Existiert die benannte Regal-Datei tatsächlich? Ein Regal ohne seine
// Regal-Datei bleibt ein Regal (die Zuordnung steht in der Begleitdatei), es
// gibt aber nichts als Reiter zu öffnen (Muster bookFileExists).
async function shelfFileExists(shelfDir, shelfFileName) {
  if (!shelfFileName) return false;
  try {
    const stat = await fs.stat(path.join(shelfDir, shelfFileName));
    return stat.isFile();
  } catch {
    return false;
  }
}

// --- Neuanlage ---------------------------------------------------------------

// Legt ein neues Regal an: Ordner `<Name>` im Eltern-Ordner, darin die leere
// Regal-Datei `<Name>.md` und die Begleitdatei, die sie benennt. Ergebnis:
//   { ok: true, shelfDir, shelfFileName, shelfFilePath }
//   { ok: false, error: 'invalid-name' | 'exists' | 'failed', detail }
// Ein bestehender Ordner wird nie überschrieben ('exists'); die Regal-Datei
// entsteht exklusiv (flag 'wx'), damit eine gleichnamige Bestands-Datei
// unangetastet bleibt (Muster createBook).
async function createShelf(parentDir, rawName) {
  if (typeof parentDir !== 'string' || parentDir === '') {
    return { ok: false, error: 'failed', detail: 'kein Eltern-Ordner' };
  }
  const name = sanitizeShelfName(rawName);
  if (name === null) return { ok: false, error: 'invalid-name' };
  const shelfDir = path.join(path.resolve(parentDir), name);
  const shelfFileName = `${name}.md`;
  const shelfFilePath = path.join(shelfDir, shelfFileName);
  try {
    // mkdir ohne recursive: ein bestehender Ordner meldet EEXIST, statt
    // still übernommen zu werden.
    await fs.mkdir(shelfDir);
  } catch (err) {
    if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
    return { ok: false, error: 'failed', detail: err && err.message ? err.message : String(err) };
  }
  try {
    await fs.writeFile(shelfFilePath, '', { encoding: 'utf8', flag: 'wx' });
    const container = emptyShelfContainer(shelfFileName);
    await fs.writeFile(shelfSettingsPathFor(shelfDir), serializeShelfContainer(container), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (err) {
    return { ok: false, error: 'failed', detail: err && err.message ? err.message : String(err) };
  }
  return { ok: true, shelfDir, shelfFileName, shelfFilePath };
}

// --- Zuordnung (Story 4S-000760, AK4) -------------------------------------------

// Schreibt den Container zurück. Bewusst ohne Zwischendatei (Begründung in
// books.js: eine halb geschriebene Datei fiele beim nächsten Lesen als
// 'invalid' auf, statt still eine falsche Zuordnung zu behaupten).
async function writeShelfSettings(settingsPath, container) {
  await fs.writeFile(settingsPath, serializeShelfContainer(container), 'utf8');
}

// Ordnet einen Buch-Ordner dem Regal zu. Zugeordnet wird nur, was tatsächlich
// ein Buch-Ordner unmittelbar unter dem Regal ist. Ergebnis:
//   { ok: true, books }
//   { ok: false, error: 'no-shelf' | 'invalid' | 'invalid-name' |
//                       'unknown-dir' | 'not-a-book' | 'duplicate-book' |
//                       'write-failed', detail? }
async function assignBookDir(shelfDir, rawDirName) {
  const settings = await readShelfSettings(shelfDir);
  if (!settings.ok) return settings;
  const dirName = normalizeBookDirName(rawDirName);
  if (dirName === null) return { ok: false, error: 'invalid-name' };
  const target = path.join(path.resolve(shelfDir), dirName);
  try {
    if (!(await fs.stat(target)).isDirectory()) return { ok: false, error: 'unknown-dir' };
  } catch {
    return { ok: false, error: 'unknown-dir' };
  }
  const book = await readBookSettings(target);
  if (!book.ok) return { ok: false, error: 'not-a-book' };
  const result = assignBook(readBookList(settings.container), dirName);
  if (!result.ok) return { ok: false, error: result.error };
  setBookList(settings.container, result.books);
  try {
    await writeShelfSettings(settings.settingsPath, settings.container);
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err && err.message ? err.message : String(err),
    };
  }
  return { ok: true, books: result.books };
}

// Löst die Zuordnung eines Buches. Der Buch-Ordner samt Inhalt bleibt
// unberührt; das Buch erscheint anschließend als «nicht zugeordnet». Bewusst
// ohne Ordner-Prüfung: auch die Zuordnung eines fehlenden Ordners (Eintrag
// unter `missing`) lässt sich lösen — das ist der Heilungs-Weg. Ergebnis:
//   { ok: true, books }
//   { ok: false, error: 'no-shelf' | 'invalid' | 'invalid-name' |
//                       'unknown-book' | 'write-failed', detail? }
async function unassignBookDir(shelfDir, rawDirName) {
  const settings = await readShelfSettings(shelfDir);
  if (!settings.ok) return settings;
  const result = unassignBook(readBookList(settings.container), rawDirName);
  if (!result.ok) return { ok: false, error: result.error };
  setBookList(settings.container, result.books);
  try {
    await writeShelfSettings(settings.settingsPath, settings.container);
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err && err.message ? err.message : String(err),
    };
  }
  return { ok: true, books: result.books };
}

// --- Ansichts-Daten (4T-000868, Story 4S-000761) ----------------------------------

// Frontmatter-Auszug einer Markdown-Datei: { title, author, description,
// cover } — fehlende oder nicht lesbare Werte als null. Nicht lesbare Datei
// oder defektes Frontmatter liefert leere Werte statt eines Fehlers
// (Fehler-Isolation: die Ansicht zeigt dann den Ordner-Namen). Der
// Bild-Verweis heißt `cover` — die Bestands-Konvention des mitgelieferten
// Demo-Buches (4T-000850), keine zweite Schlüssel-Wahrheit.
async function readFrontmatterExcerpt(filePath) {
  const leer = { title: null, author: null, description: null, cover: null };
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return leer;
  }
  const data = extractFrontmatter(raw).data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return leer;
  const text = (wert) => (typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : null);
  return {
    title: text(data.title),
    author: text(data.author),
    description: text(data.description),
    cover: text(data.cover),
  };
}

// Bild-Verweis eines Buches auflösen: relativ zum Buch-Ordner (absolute
// Verweise bleiben absolut). null, wenn kein Verweis gesetzt ist oder die
// Datei nicht existiert — die Ansicht zeigt dann die Platzhalter-Kachel
// (PO-Entscheidung vom 2026-08-04).
async function resolveImagePath(baseDir, imageRef) {
  if (imageRef === null) return null;
  const absolute = path.isAbsolute(imageRef)
    ? path.resolve(imageRef)
    : path.join(path.resolve(baseDir), imageRef);
  try {
    return (await fs.stat(absolute)).isFile() ? absolute : null;
  } catch {
    return null;
  }
}

// Ansichts-Eintrag eines Buch-Ordners: Titel (Frontmatter-Titel der
// Buch-Datei, sonst Ordner-Name), Autor, Beschreibung, aufgelöstes Bild und
// Kapitel-Anzahl aus der Begleitdatei.
async function buildBookEntry(shelfDir, dirName, assigned) {
  const bookDir = path.join(path.resolve(shelfDir), dirName);
  const entry = {
    dirName,
    bookDir,
    assigned,
    missing: false,
    title: dirName,
    author: null,
    description: null,
    imagePath: null,
    chapters: 0,
  };
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return entry;
  entry.chapters = flattenChapters(readChapterTree(settings.container)).length;
  const bookFileName = readBookFileName(settings.container);
  if (bookFileName === null) return entry;
  const excerpt = await readFrontmatterExcerpt(path.join(bookDir, bookFileName));
  if (excerpt.title !== null) entry.title = excerpt.title;
  entry.author = excerpt.author;
  entry.description = excerpt.description;
  entry.imagePath = await resolveImagePath(bookDir, excerpt.cover);
  return entry;
}

// Baut die Daten der Regal-Ansicht (Vertrag der Preload-API
// `shelves.getViewData`): Regal-Kopf (Titel aus dem Frontmatter der
// Regal-Datei, sonst deren Basename ohne Endung) plus je Buch die
// Anzeige-Angaben der beiden Darstellungen. Zugeordnete Bücher in
// Listen-Reihenfolge, nicht zugeordnete in Bestands-Reihenfolge, fehlende
// Zuordnungen als eigene Marker-Einträge. Fehler-Kennungen wie bei
// readShelfSettings.
async function buildShelfViewData(shelfDir) {
  const state = await buildShelfState(shelfDir);
  if (!state.ok) return state;
  const { shelfFileName, books, unassigned, missing } = state.state;
  const root = state.state.shelfDir;
  const missingKeys = new Set(missing.map((name) => pathCompareKey(name)));
  const shelfExcerpt =
    shelfFileName === null
      ? { title: null }
      : await readFrontmatterExcerpt(path.join(root, shelfFileName));
  const shelfTitle =
    shelfExcerpt.title !== null
      ? shelfExcerpt.title
      : shelfFileName !== null
        ? shelfFileName.replace(/\.[^.]+$/, '')
        : path.basename(root);
  const assignedEntries = [];
  for (const dirName of books) {
    if (missingKeys.has(pathCompareKey(dirName))) {
      assignedEntries.push({
        dirName,
        bookDir: path.join(root, dirName),
        assigned: true,
        missing: true,
        title: dirName,
        author: null,
        description: null,
        imagePath: null,
        chapters: 0,
      });
    } else {
      assignedEntries.push(await buildBookEntry(root, dirName, true));
    }
  }
  const unassignedEntries = [];
  for (const dirName of unassigned) {
    unassignedEntries.push(await buildBookEntry(root, dirName, false));
  }
  return {
    ok: true,
    view: {
      shelfDir: root,
      shelfFileName,
      shelfTitle,
      books: assignedEntries,
      unassigned: unassignedEntries,
    },
  };
}

module.exports = {
  SHELF_SETTINGS_FILENAME,
  shelfSettingsPathFor,
  sanitizeShelfName,
  readShelfSettings,
  detectShelfDirFor,
  collectBookDirs,
  bookDirContaining,
  buildShelfState,
  buildShelfViewData,
  shelfFileExists,
  createShelf,
  writeShelfSettings,
  assignBookDir,
  unassignBookDir,
};
