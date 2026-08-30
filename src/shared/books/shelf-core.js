// 4T-0866 (Epic 3E-0162): Kern-Modell des Bücherregals — Begleitdatei
// (Shelf_Settings.mdda), Buch-Zuordnung und Bestands-Abgleich.
//
// Ein Regal lebt in einem eigenen Ordner: darin die Regal-Datei (gewöhnliches
// Markdown mit dem Beschreibungstext; Eigenschaften und Bild-Verweis im
// Frontmatter) und die Begleitdatei, die die Regal-Datei benennt und die
// zugeordneten Bücher führt (Story 4S-0759). Die Bücher liegen als Buch-Ordner
// unmittelbar unter dem Regal-Ordner; die Hierarchie endet beim Regal
// (Epic-Abgrenzung: keine Regale in Regalen).
//
// Container-Format der Begleitdatei (JSON, Muster src/shared/books/book-core.js):
//
//   {
//     "schemaVersion": 1,
//     "shelf": { "file": "Meine Bibliothek.md" },
//     "books": ["Reise nach Ithaka", "Kochbuch"]
//   }
//
// - `shelf.file` ist der BASENAME der Regal-Datei im Regal-Ordner. Er trägt
//   die Erkennung ohne Rückverweis: eine Markdown-Datei ist genau dann
//   Regal-Datei, wenn die Begleitdatei ihres Ordners sie benennt
//   (Buch-Kern-Entscheidung 2, auf das Regal übertragen).
// - `books` ist die geordnete Liste der zugeordneten Bücher, je Eintrag der
//   ORDNER-NAME des Buch-Ordners relativ zum Regal-Ordner (flach, ohne
//   Pfad-Trenner, weil Buch-Ordner unmittelbar unter dem Regal liegen). Der
//   Name ist zugleich die Identität der Zuordnung: ein Buch hängt höchstens
//   einmal im Regal. Ob ein Ordner tatsächlich ein Buch-Ordner ist, sagt
//   dessen eigene Begleitdatei (book-core); dieses Modul verwaltet allein die
//   Zuordnung.
//
// Reine Struktur- und String-Logik ohne DOM-, Datei- und Electron-Zugriff
// (CJS, Muster src/shared/books/book-core.js): Main (Datenpfad, IPC) und Renderer
// (Regal-Ansicht) laden dasselbe Modul. Lesen und Schreiben der Datei bleibt
// dem Main-Prozess vorbehalten. Regale sind lageunabhängig (lose, in einem
// Bereich oder in einem Arbeitsbereich): das Modul kennt weder Bereiche noch
// Arbeitsbereiche.
'use strict';

const { pathCompareKey } = require('../platform.js');

// Fester Dateiname der Begleitdatei im Regal-Ordner (Muster
// Book_Settings.mdda; die Endung .mdda schließt Kollisionen mit
// Markdown-Dateien aus).
const SHELF_SETTINGS_FILENAME = 'Shelf_Settings.mdda';
const SHELF_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// --- Namen -------------------------------------------------------------------

// Basename der Regal-Datei säubern: getrimmt, nicht leer, ohne Pfad-Trenner
// (die Regal-Datei liegt immer unmittelbar im Regal-Ordner). null = unzulässig.
function normalizeShelfFileName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name === '' || name.includes('/') || name.includes('\\')) return null;
  return name;
}

// Ordner-Name eines Buch-Ordners säubern: dieselben Regeln, weil Buch-Ordner
// unmittelbar unter dem Regal-Ordner liegen und ein Pfad-Trenner einen
// Ausbruch bedeutete.
function normalizeBookDirName(value) {
  return normalizeShelfFileName(value);
}

// Vergleichs-Schlüssel für Datei- und Ordner-Identität. Die Frage, ob das
// Dateisystem die Schreibung unterscheidet, beantwortet die zentrale Auskunft
// in shared/platform.js; die gespeicherte Schreibweise bleibt unberührt
// (Muster book-core.js).
//
// 4T-1276 (Epic 3E-0232, Befund B1): Dies ist die BELEGTE Stelle des Befunds.
// Vorher stand hier eine feste Kleinschreibung; unter Linux liess sich ein
// zweiter Buch-Ordner, der sich nur in der Schreibweise unterschied, nicht
// zuordnen («duplicate-book») und verschwand zusätzlich kommentarlos aus der
// Liste der nicht zugeordneten Bücher — die zweite Wirkung entstand in
// diffBookDirs(), das jeden Ordner überspringt, dessen Schlüssel schon gesehen
// wurde.
function fileKey(value) {
  return typeof value === 'string' ? pathCompareKey(value) : '';
}

// AUSGESPROCHEN plattform-unabhängige Faltung für die Erkennung der
// Begleitdatei am NAMEN, verglichen gegen eine Konstante, die die Anwendung
// selbst schreibt — nicht gegen einen zweiten Pfad. Ein Regal-Ordner, der aus
// einem fremden System zuwandert und die Datei anders geschrieben trägt, soll
// auch auf einem case-sensitiven Dateisystem als Regal erkannt werden.
//
// 4T-1276: Die Entscheidung des Product Owners vom 2026-08-29 (4T-1275) galt
// wörtlich der Buch-Begleitdatei in book-core.js. Sie ist hier SINNGEMÄSS
// übertragen, weil der Fall identisch ist — dieselbe Erkennung, dieselbe
// Konstante-gegen-Name-Konstruktion, dasselbe Zuwanderungs-Argument. Die
// Übertragung ist als solche gekennzeichnet und im Task vermerkt, damit sie
// nicht als eigene Entscheidung durchgeht.
function settingsNameKey(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

// --- Begleitdatei ------------------------------------------------------------

// Leere Begleitdatei eines neuen Regals (Regal-Datei benannt, noch kein Buch).
// null bei unzulässigem Basename.
function emptyShelfContainer(shelfFileName) {
  const file = normalizeShelfFileName(shelfFileName);
  if (file === null) return null;
  return { schemaVersion: SHELF_SCHEMA_VERSION, shelf: { file }, books: [] };
}

// Liefert den Basename der benannten Regal-Datei oder null.
function readShelfFileName(container) {
  const section = container && container.shelf;
  if (!isPlainObject(section)) return null;
  return normalizeShelfFileName(section.file);
}

// Setzt den Basename der Regal-Datei (Nachführung beim Umbenennen). Liefert
// den Container; ein unzulässiger Name ändert nichts und liefert null. Übrige
// Felder der Sektion bleiben erhalten (Vorwärts-Kompatibilität).
function setShelfFileName(container, name) {
  const clean = normalizeShelfFileName(name);
  if (clean === null || !isPlainObject(container)) return null;
  const section = isPlainObject(container.shelf) ? container.shelf : {};
  container.shelf = { ...section, file: clean };
  return container;
}

// Parst und validiert die Begleitdatei. Liefert { ok, container } bzw.
// { ok: false, error }. Streng ist allein die shelf-Sektion: ohne benannte
// Regal-Datei ist der Ordner kein Regal. Die books-Sektion wird BEWUSST nicht
// validiert (Fehler-Isolation, Muster book-core: chapters) — ein defekter
// Eintrag entfällt bei der Normalisierung, statt das Regal auszusetzen.
function parseShelfContainer(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    return { ok: false, error: `JSON: ${err && err.message ? err.message : 'Parse-Fehler'}` };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Container ist kein Objekt' };
  }
  if (parsed.schemaVersion !== SHELF_SCHEMA_VERSION) {
    return { ok: false, error: `unbekannte schemaVersion: ${parsed.schemaVersion}` };
  }
  if (readShelfFileName(parsed) === null) {
    return { ok: false, error: 'shelf-Sektion fehlt oder benennt keine Regal-Datei' };
  }
  return { ok: true, container: parsed };
}

// Serialisierung lesbar eingerückt wie die übrigen .mdda-Container.
function serializeShelfContainer(container) {
  return JSON.stringify(container, null, 2) + '\n';
}

// --- Erkennung ---------------------------------------------------------------

// Ist dieser Datei-Name die Begleitdatei eines Regals?
function isShelfSettingsFileName(name) {
  return (
    typeof name === 'string' &&
    settingsNameKey(name.trim()) === settingsNameKey(SHELF_SETTINGS_FILENAME)
  );
}

// Trägt der Ordner-Inhalt eine Regal-Begleitdatei? `entries` ist die Liste der
// Datei-Namen des Ordners; geliefert wird der Eintrag in seiner tatsächlichen
// Schreibweise (null = kein Regal-Ordner).
function findShelfSettingsEntry(entries) {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (isShelfSettingsFileName(entry)) return entry;
  }
  return null;
}

// Erkennung ohne Rückverweis: Benennt diese Begleitdatei den Basename als
// Regal-Datei?
function isShelfFileName(container, basename) {
  const declared = readShelfFileName(container);
  const candidate = normalizeShelfFileName(basename);
  if (declared === null || candidate === null) return false;
  return fileKey(declared) === fileKey(candidate);
}

// Derselbe Weg über den ROHEN Datei-Inhalt der Begleitdatei: liefert den
// Basename der Regal-Datei oder null (kein Regal, defekte Datei).
function shelfFileNameFromRaw(raw) {
  const parsed = parseShelfContainer(raw);
  return parsed.ok ? readShelfFileName(parsed.container) : null;
}

// --- Buch-Liste --------------------------------------------------------------

// Säubert die Buch-Liste tolerant (Fehler-Isolation pro Eintrag): ein Eintrag
// ohne zulässigen Ordner-Namen entfällt, ebenso ein zweites Vorkommen
// desselben Namens — die Reihenfolge der übrigen bleibt erhalten. Liefert
// immer ein frisches Array (die Eingabe bleibt unberührt).
function normalizeBookList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const name = normalizeBookDirName(entry);
    if (name === null) continue;
    const key = fileKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Liest die books-Sektion des Containers, normalisiert.
function readBookList(container) {
  return normalizeBookList(container && container.books);
}

// Schreibt die Buch-Liste in den Container (normalisiert) und liefert ihn
// zurück; null bei fehlendem Container. Eine leere Liste bleibt als leere
// Sektion stehen: ein Regal ohne Buch ist ein gültiger Zustand.
function setBookList(container, list) {
  if (!isPlainObject(container)) return null;
  container.books = normalizeBookList(list);
  return container;
}

// Ist dieses Buch dem Regal zugeordnet?
function hasBook(list, dirName) {
  const name = normalizeBookDirName(dirName);
  if (name === null) return false;
  const key = fileKey(name);
  return normalizeBookList(list).some((entry) => fileKey(entry) === key);
}

// Position in der Ziel-Liste: alles, was keine ganze Zahl innerhalb
// [0, Länge] ist, hängt hinten an (Anfüge-Default, Muster book-core).
function clampIndex(index, length) {
  if (!Number.isInteger(index) || index < 0 || index > length) return length;
  return index;
}

// --- Zuordnungs-Operationen --------------------------------------------------
//
// Alle Operationen sind rein: sie arbeiten auf der normalisierten Liste (die
// Eingabe bleibt unberührt) und liefern { ok: true, books, … } oder
// { ok: false, error }. Fehler-Kennungen sind maschinenlesbar und werden erst
// in der Oberfläche übersetzt: 'invalid-name', 'duplicate-book',
// 'unknown-book'. Weil die Eingabe normalisiert wird, hält jede Operation die
// Invariante „ein Buch hängt höchstens einmal im Regal" ein.

// Ordnet ein Buch zu, an Position `index` (außerhalb des Bereichs oder
// weggelassen = hinten anfügen).
function assignBook(list, dirName, index = -1) {
  const work = normalizeBookList(list);
  const name = normalizeBookDirName(dirName);
  if (name === null) return { ok: false, error: 'invalid-name' };
  if (work.some((entry) => fileKey(entry) === fileKey(name))) {
    return { ok: false, error: 'duplicate-book' };
  }
  work.splice(clampIndex(index, work.length), 0, name);
  return { ok: true, books: work };
}

// Löst die Zuordnung eines Buches; das Buch selbst (Ordner samt Inhalt) bleibt
// unberührt, es wird anschließend als «nicht zugeordnet» geführt.
function unassignBook(list, dirName) {
  const work = normalizeBookList(list);
  const name = normalizeBookDirName(dirName);
  if (name === null) return { ok: false, error: 'invalid-name' };
  const at = work.findIndex((entry) => fileKey(entry) === fileKey(name));
  if (at === -1) return { ok: false, error: 'unknown-book' };
  const [removed] = work.splice(at, 1);
  return { ok: true, books: work, removed };
}

// Führt einen Buch-Ordner-Namen nach (Umbenennen des Ordners) unter Erhalt der
// Listen-Position. Eine reine Schreibweisen-Änderung ist zulässig, ein bereits
// anderswo zugeordneter Ziel-Name nicht (Invariante).
function renameBookDir(list, oldName, newName) {
  const work = normalizeBookList(list);
  const from = normalizeBookDirName(oldName);
  const to = normalizeBookDirName(newName);
  if (from === null || to === null) return { ok: false, error: 'invalid-name' };
  const at = work.findIndex((entry) => fileKey(entry) === fileKey(from));
  if (at === -1) return { ok: false, error: 'unknown-book' };
  const clash = work.findIndex((entry) => fileKey(entry) === fileKey(to));
  if (clash !== -1 && clash !== at) return { ok: false, error: 'duplicate-book' };
  work[at] = to;
  return { ok: true, books: work };
}

// --- Abgleich mit dem Ordner-Bestand -----------------------------------------

// Gleicht die Zuordnung gegen den Ordner-Bestand des Regal-Ordners ab.
// `bookDirNames` sind die Ordner-Namen der BUCH-Ordner unmittelbar unter dem
// Regal-Ordner (welcher Ordner ein Buch-Ordner ist, entscheidet der Aufrufer
// über die Buch-Erkennung aus book-core; gewöhnliche Unterordner gehören
// nicht hinein). Liefert { unassigned, missing }: im Ordner-Bestand, aber
// nicht zugeordnet (Abschnitt «nicht zugeordnet», in Eingabe-Reihenfolge) und
// zugeordnet, aber ohne Ordner (in Listen-Reihenfolge; Kandidaten für eine
// spätere Reparatur, Muster der fehlenden Kapitel des Buches).
function diffBookDirs(list, bookDirNames) {
  const assigned = normalizeBookList(list);
  const assignedKeys = new Set(assigned.map(fileKey));
  const presentKeys = new Set();
  const unassigned = [];
  for (const raw of Array.isArray(bookDirNames) ? bookDirNames : []) {
    const name = normalizeBookDirName(raw);
    if (name === null) continue;
    const key = fileKey(name);
    if (presentKeys.has(key)) continue;
    presentKeys.add(key);
    if (!assignedKeys.has(key)) unassigned.push(name);
  }
  const missing = assigned.filter((name) => !presentKeys.has(fileKey(name)));
  return { unassigned, missing };
}

module.exports = {
  SHELF_SETTINGS_FILENAME,
  SHELF_SCHEMA_VERSION,
  // Namen.
  normalizeShelfFileName,
  normalizeBookDirName,
  // Begleitdatei.
  emptyShelfContainer,
  parseShelfContainer,
  serializeShelfContainer,
  readShelfFileName,
  setShelfFileName,
  readBookList,
  setBookList,
  // Erkennung ohne Rückverweis.
  isShelfSettingsFileName,
  findShelfSettingsEntry,
  isShelfFileName,
  shelfFileNameFromRaw,
  // Buch-Liste und Zuordnung.
  normalizeBookList,
  hasBook,
  assignBook,
  unassignBook,
  renameBookDir,
  // Abgleich mit dem Ordner-Bestand.
  diffBookDirs,
};
