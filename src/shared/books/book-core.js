// 4T-0842 (Epic 3E-0147): Kern-Modell des Buches — Begleitdatei
// (Book_Settings.mdda), Kapitel-Baum und seine Operationen.
//
// Ein Buch lebt in einem eigenen Ordner: darin die Buch-Datei (gewöhnliches
// Markdown mit dem eigenen Text; Eigenschaften und Bild-Verweis im
// Frontmatter) und die Begleitdatei, die ausschließlich Struktur trägt
// (Story 4S-0751). Kapitel sind gewöhnliche Markdown-Dateien im Buch-Ordner
// oder in beliebig tiefen Unterordnern; die Ordner-Lage trägt keine
// Struktur-Aussage, die Gliederung steht allein im deklarierten Kapitel-Baum
// (Epic-Entscheidung 4).
//
// Container-Format der Begleitdatei (JSON, Muster der übrigen .mdda-Dateien
// aus src/main/documents/mdd-store.js: lesbar eingerückt, Sektionen neben der
// schemaVersion):
//
//   {
//     "schemaVersion": 1,
//     "book": { "file": "Reise nach Ithaka.md" },
//     "chapters": [
//       {
//         "path": "Teil 1/Aufbruch.md",
//         "children": [{ "path": "Teil 1/Der Hafen.md", "children": [] }]
//       },
//       { "path": "Teil 2/Heimkehr.md", "children": [] }
//     ]
//   }
//
// - `book.file` ist der BASENAME der Buch-Datei im Buch-Ordner. Er trägt die
//   Erkennung ohne Rückverweis: eine Markdown-Datei ist genau dann Buch-Datei,
//   wenn die Begleitdatei ihres Ordners sie benennt (Epic-Entscheidung 2). Die
//   Markdown-Datei selbst trägt nichts bei und bleibt ohne die Anwendung
//   vollständig lesbar.
// - `chapters` ist der geordnete, beliebig tiefe Kapitel-Baum. Ein Knoten ist
//   { path, children }; `path` liegt RELATIV zum Buch-Ordner mit Vorwärts-
//   Schrägstrichen. Der Pfad ist zugleich die Identität des Kapitels: ein
//   Kapitel hängt höchstens einmal im Baum (Epic-Entscheidung 5), eine eigene
//   Knoten-Kennung wäre eine zweite, mitzupflegende Quelle.
//
// Reine Struktur- und String-Logik ohne DOM-, Datei- und Electron-Zugriff
// (CJS, Muster src/shared/bookmark-tree.js): Main (Datenpfad, IPC) und
// Renderer (Inhaltsverzeichnis-Panel) laden dasselbe Modul. Lesen und
// Schreiben der Datei bleibt dem Main-Prozess vorbehalten.
'use strict';

const { pathCompareKey } = require('../platform.js');

// Pfad-Normalisierung aus dem Lesezeichen-Modul: `normalizeRelPath` ist dort
// generisch für wurzel-relative Ziele geschrieben und nicht lesezeichen-
// spezifisch; eine zweite Fassung wäre eine zweite Wahrheit.
const { normalizeRelPath } = require('../bookmark-tree.js');

// Fester Dateiname der Begleitdatei im Buch-Ordner (PO-Klärung vom
// 2026-08-03, analog zu Area_Settings.mdda). Die eigene Endung .mdda schließt
// Kollisionen mit Markdown-Dateien aus.
const BOOK_SETTINGS_FILENAME = 'Book_Settings.mdda';
const BOOK_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// --- Namen und Pfade ---------------------------------------------------------

// Basename der Buch-Datei säubern: getrimmt, nicht leer, ohne Pfad-Trenner
// (die Buch-Datei liegt immer unmittelbar im Buch-Ordner). null = unzulässig.
function normalizeBookFileName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name === '' || name.includes('/') || name.includes('\\')) return null;
  return name;
}

// Kapitel-Pfad auf die kanonische, buch-relative Form bringen (Backslash ->
// Slash, Redundanz abgeräumt, Ausbrüche und absolute Pfade abgelehnt).
function normalizeChapterPath(value) {
  return normalizeRelPath(value);
}

// Vergleichs-Schlüssel für Datei-Identität. Die Frage, ob das Dateisystem die
// Schreibung unterscheidet, beantwortet die zentrale Auskunft in
// shared/platform.js; die gespeicherte Schreibweise bleibt davon unberührt
// (Muster toRootRelative in bookmark-tree.js).
//
// 4T-1276 (Epic 3E-0232, Befund B1): Vorher stand hier eine feste
// Kleinschreibung mit dem Kommentar «Das Windows-Dateisystem unterscheidet
// Groß-/Kleinschreibung nicht». Unter Linux sind `Aufbruch.md` und
// `aufbruch.md` ZWEI Dateien, und die Anwendung behandelte sie als eine.
function fileKey(value) {
  return typeof value === 'string' ? pathCompareKey(value) : '';
}

// AUSGESPROCHEN plattform-unabhängige Faltung, bewusst abweichend von fileKey:
// Die Begleitdatei wird an ihrem NAMEN erkannt, verglichen gegen eine
// Konstante, die die Anwendung selbst schreibt — nicht gegen einen zweiten
// Pfad. Ein Buch-Ordner, der aus einem fremden System zuwandert und die Datei
// anders geschrieben trägt, soll auch auf einem case-sensitiven Dateisystem
// als Buch erkannt werden. Entscheidung des Product Owners vom 2026-08-29
// (4T-1275); die Absicht steht hier, weil `4S-0841` genau das verlangt: «Wo
// eine strengere als die plattformübliche Regel bewusst überall gilt, ist die
// Absicht dokumentiert.»
function settingsNameKey(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

// --- Begleitdatei ------------------------------------------------------------

// Leere Begleitdatei eines neuen Buches (Buch-Datei benannt, noch kein
// Kapitel). null bei unzulässigem Basename.
function emptyBookContainer(bookFileName) {
  const file = normalizeBookFileName(bookFileName);
  if (file === null) return null;
  return { schemaVersion: BOOK_SCHEMA_VERSION, book: { file }, chapters: [] };
}

// Liefert den Basename der benannten Buch-Datei oder null.
function readBookFileName(container) {
  const section = container && container.book;
  if (!isPlainObject(section)) return null;
  return normalizeBookFileName(section.file);
}

// Setzt den Basename der Buch-Datei (Nachführung beim Umbenennen). Liefert den
// Container; ein unzulässiger Name ändert nichts und liefert null. Übrige
// Felder der Sektion bleiben erhalten (Vorwärts-Kompatibilität).
function setBookFileName(container, name) {
  const clean = normalizeBookFileName(name);
  if (clean === null || !isPlainObject(container)) return null;
  const section = isPlainObject(container.book) ? container.book : {};
  container.book = { ...section, file: clean };
  return container;
}

// Parst und validiert die Begleitdatei. Liefert { ok, container } bzw.
// { ok: false, error }. Streng ist allein die book-Sektion: ohne benannte
// Buch-Datei ist der Ordner kein Buch. Die chapters-Sektion wird BEWUSST nicht
// validiert (Fehler-Isolation, Muster notes/blockData) — ein defekter Baum
// setzt die Gliederung aus, nicht das Buch; die Sanitisierung übernimmt
// normalizeChapterTree.
function parseBookContainer(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    return { ok: false, error: `JSON: ${err && err.message ? err.message : 'Parse-Fehler'}` };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Container ist kein Objekt' };
  }
  if (parsed.schemaVersion !== BOOK_SCHEMA_VERSION) {
    return { ok: false, error: `unbekannte schemaVersion: ${parsed.schemaVersion}` };
  }
  if (readBookFileName(parsed) === null) {
    return { ok: false, error: 'book-Sektion fehlt oder benennt keine Buch-Datei' };
  }
  return { ok: true, container: parsed };
}

// Serialisierung lesbar eingerückt wie die übrigen .mdda-Container: die Datei
// ist bewusst einsehbar, Lesbarkeit schlägt Kompaktheit.
function serializeBookContainer(container) {
  return JSON.stringify(container, null, 2) + '\n';
}

// --- Erkennung ---------------------------------------------------------------

// Ist dieser Datei-Name die Begleitdatei eines Buches?
function isBookSettingsFileName(name) {
  return (
    typeof name === 'string' &&
    settingsNameKey(name.trim()) === settingsNameKey(BOOK_SETTINGS_FILENAME)
  );
}

// Trägt der Ordner-Inhalt eine Begleitdatei? `entries` ist die Liste der
// Datei-Namen des Ordners; geliefert wird der Eintrag in seiner tatsächlichen
// Schreibweise (null = kein Buch-Ordner).
function findBookSettingsEntry(entries) {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (isBookSettingsFileName(entry)) return entry;
  }
  return null;
}

// Erkennung ohne Rückverweis: Benennt diese Begleitdatei den Basename als
// Buch-Datei?
function isBookFileName(container, basename) {
  const declared = readBookFileName(container);
  const candidate = normalizeBookFileName(basename);
  if (declared === null || candidate === null) return false;
  return fileKey(declared) === fileKey(candidate);
}

// Derselbe Weg über den ROHEN Datei-Inhalt der Begleitdatei: liefert den
// Basename der Buch-Datei oder null (kein Buch, defekte Datei).
function bookFileNameFromRaw(raw) {
  const parsed = parseBookContainer(raw);
  return parsed.ok ? readBookFileName(parsed.container) : null;
}

// --- Kapitel-Baum: Normalisierung --------------------------------------------

function sanitizeChapterNodes(raw, seen) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const path = normalizeChapterPath(entry.path);
    if (path === null) continue;
    const key = fileKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, children: sanitizeChapterNodes(entry.children, seen) });
  }
  return out;
}

// Säubert den Kapitel-Baum tolerant (Fehler-Isolation pro Knoten, Muster
// normalizeBookmarksTree): ein Knoten ohne auflösbaren buch-relativen Pfad
// entfällt, ebenso ein zweites Vorkommen desselben Pfades — beides samt
// Unterbaum, weil ein Unterkapitel ohne Kapitel keine Position mehr hat. Die
// entfallenen Kapitel-Dateien erscheinen anschließend im Abgleich als „nicht
// eingehängt" und bleiben so bedienbar. Liefert immer ein Array und einen
// frischen Baum (die Eingabe bleibt unberührt).
function normalizeChapterTree(raw) {
  return sanitizeChapterNodes(raw, new Set());
}

// Liest die chapters-Sektion des Containers, normalisiert.
function readChapterTree(container) {
  return normalizeChapterTree(container && container.chapters);
}

// Schreibt den Kapitel-Baum in den Container (normalisiert) und liefert ihn
// zurück; null bei fehlendem Container. Ein leerer Baum bleibt als leere
// Sektion stehen: ein Buch ohne Kapitel ist ein gültiger Zustand, und die
// Begleitdatei existiert genau für diese Struktur-Aussage.
function setChapterTree(container, tree) {
  if (!isPlainObject(container)) return null;
  container.chapters = normalizeChapterTree(tree);
  return container;
}

// --- Kapitel-Baum: Navigation im Baum ----------------------------------------

// Sucht den Knoten mit diesem Vergleichs-Schlüssel und liefert seine Umgebung:
// den Knoten, die Geschwister-Liste, in der er hängt, seinen Index darin und
// den Pfad seines Eltern-Knotens (null auf oberster Ebene). null = nicht im
// Baum.
function locateChapter(nodes, key, parentPath) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (fileKey(node.path) === key) {
      return { node, siblings: nodes, index: i, parentPath: parentPath ?? null };
    }
    const found = locateChapter(node.children, key, node.path);
    if (found) return found;
  }
  return null;
}

// Alle Vergleichs-Schlüssel eines Unterbaums (Zyklus-Prüfung beim Umhängen).
function collectChapterKeys(nodes) {
  const keys = new Set();
  const walk = (list) => {
    for (const node of list) {
      keys.add(fileKey(node.path));
      walk(node.children);
    }
  };
  walk(nodes);
  return keys;
}

// Kind-Liste, in die unter `parentPath` eingehängt wird; null/leer meint die
// oberste Ebene. null = Eltern-Knoten unbekannt.
function resolveChildList(tree, parentPath) {
  if (parentPath === null || parentPath === undefined || parentPath === '') return tree;
  const parent = normalizeChapterPath(parentPath);
  if (parent === null) return null;
  const found = locateChapter(tree, fileKey(parent), null);
  return found ? found.node.children : null;
}

// Position in der Ziel-Liste: alles, was keine ganze Zahl innerhalb
// [0, Länge] ist, hängt hinten an (Anfüge-Default der Bedienung).
function clampIndex(index, length) {
  if (!Number.isInteger(index) || index < 0 || index > length) return length;
  return index;
}

// Hängt dieser Pfad im Baum?
function hasChapter(tree, chapterPath) {
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return false;
  return locateChapter(normalizeChapterTree(tree), fileKey(path), null) !== null;
}

// --- Kapitel-Baum: Operationen -----------------------------------------------
//
// Alle Operationen sind rein: sie arbeiten auf dem normalisierten Baum (die
// Eingabe bleibt unberührt) und liefern { ok: true, tree, … } oder
// { ok: false, error }. Fehler-Kennungen sind maschinenlesbar und werden erst
// in der Oberfläche übersetzt: 'invalid-path', 'duplicate-path',
// 'unknown-chapter', 'unknown-parent', 'cycle', 'no-previous-sibling',
// 'at-root'. Weil die Eingabe normalisiert wird, hält jede Operation die
// Invariante „ein Kapitel-Pfad hängt höchstens einmal im Baum" ein.

// Hängt ein Kapitel ein: unter `parentPath` (null = oberste Ebene) an Position
// `index` (außerhalb des Bereichs oder weggelassen = hinten anfügen).
function insertChapter(tree, chapterPath, parentPath = null, index = -1) {
  const work = normalizeChapterTree(tree);
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return { ok: false, error: 'invalid-path' };
  if (locateChapter(work, fileKey(path), null)) return { ok: false, error: 'duplicate-path' };
  const list = resolveChildList(work, parentPath);
  if (list === null) return { ok: false, error: 'unknown-parent' };
  list.splice(clampIndex(index, list.length), 0, { path, children: [] });
  return { ok: true, tree: work };
}

// Hängt ein Kapitel samt Unterbaum aus und gibt den entfernten Knoten mit
// zurück (Wieder-Einhängen an anderer Stelle, Rückgängig-Machen).
function removeChapter(tree, chapterPath) {
  const work = normalizeChapterTree(tree);
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return { ok: false, error: 'invalid-path' };
  const found = locateChapter(work, fileKey(path), null);
  if (!found) return { ok: false, error: 'unknown-chapter' };
  const [node] = found.siblings.splice(found.index, 1);
  return { ok: true, tree: work, node };
}

// Verschiebt ein Kapitel innerhalb seiner Ebene um `delta` Positionen (-1 =
// hoch, +1 = runter). Am Rand der Ebene bleibt der Baum unverändert und
// `moved` ist false — eine gehaltene Taste erzeugt so keinen Fehler und keinen
// überflüssigen Schreibvorgang.
function moveChapterWithinLevel(tree, chapterPath, delta) {
  const work = normalizeChapterTree(tree);
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return { ok: false, error: 'invalid-path' };
  const found = locateChapter(work, fileKey(path), null);
  if (!found) return { ok: false, error: 'unknown-chapter' };
  const step = Number.isInteger(delta) ? delta : 0;
  const target = found.index + step;
  if (step === 0 || target < 0 || target >= found.siblings.length) {
    return { ok: true, tree: work, moved: false };
  }
  const [node] = found.siblings.splice(found.index, 1);
  found.siblings.splice(target, 0, node);
  return { ok: true, tree: work, moved: true };
}

// Hängt ein Kapitel samt Unterbaum an eine beliebige Stelle um: unter
// `parentPath` (null = oberste Ebene) an Position `index`. Der Index zählt in
// der Ziel-Liste NACH dem Aushängen, weil das Umhängen aus Aushängen und
// Einhängen besteht. Ein Ziel innerhalb des eigenen Unterbaums hinge den
// Knoten unter sich selbst und wird abgelehnt ('cycle').
function moveChapter(tree, chapterPath, parentPath = null, index = -1) {
  const work = normalizeChapterTree(tree);
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return { ok: false, error: 'invalid-path' };
  const found = locateChapter(work, fileKey(path), null);
  if (!found) return { ok: false, error: 'unknown-chapter' };
  const toRoot = parentPath === null || parentPath === undefined || parentPath === '';
  if (!toRoot) {
    const parent = normalizeChapterPath(parentPath);
    if (parent === null) return { ok: false, error: 'unknown-parent' };
    if (collectChapterKeys([found.node]).has(fileKey(parent))) {
      return { ok: false, error: 'cycle' };
    }
  }
  const list = resolveChildList(work, parentPath);
  if (list === null) return { ok: false, error: 'unknown-parent' };
  const [node] = found.siblings.splice(found.index, 1);
  list.splice(clampIndex(index, list.length), 0, node);
  return { ok: true, tree: work };
}

// Rückt ein Kapitel ein: es wird letztes Unterkapitel seines unmittelbaren
// Vorgängers auf derselben Ebene. Ohne Vorgänger gibt es keine Ebene, in die
// eingerückt werden könnte.
function indentChapter(tree, chapterPath) {
  const work = normalizeChapterTree(tree);
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return { ok: false, error: 'invalid-path' };
  const found = locateChapter(work, fileKey(path), null);
  if (!found) return { ok: false, error: 'unknown-chapter' };
  if (found.index === 0) return { ok: false, error: 'no-previous-sibling' };
  const previous = found.siblings[found.index - 1];
  const [node] = found.siblings.splice(found.index, 1);
  previous.children.push(node);
  return { ok: true, tree: work };
}

// Rückt ein Kapitel aus: es wird zum unmittelbaren Nachfolger seines
// Eltern-Kapitels, eine Ebene höher. Auf oberster Ebene gibt es kein Ausrücken.
function outdentChapter(tree, chapterPath) {
  const work = normalizeChapterTree(tree);
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return { ok: false, error: 'invalid-path' };
  const found = locateChapter(work, fileKey(path), null);
  if (!found) return { ok: false, error: 'unknown-chapter' };
  if (found.parentPath === null) return { ok: false, error: 'at-root' };
  const parent = locateChapter(work, fileKey(found.parentPath), null);
  const [node] = found.siblings.splice(found.index, 1);
  parent.siblings.splice(parent.index + 1, 0, node);
  return { ok: true, tree: work };
}

// Führt einen Kapitel-Pfad nach (Umbenennen oder physisches Verschieben der
// Datei) unter Erhalt der Baum-Position und des Unterbaums. Eine reine
// Schreibweisen-Änderung ist zulässig, ein bereits anderswo hängender Ziel-Pfad
// nicht (Invariante).
function renameChapterPath(tree, oldPath, newPath) {
  const work = normalizeChapterTree(tree);
  const from = normalizeChapterPath(oldPath);
  const to = normalizeChapterPath(newPath);
  if (from === null || to === null) return { ok: false, error: 'invalid-path' };
  const found = locateChapter(work, fileKey(from), null);
  if (!found) return { ok: false, error: 'unknown-chapter' };
  const clash = locateChapter(work, fileKey(to), null);
  if (clash && clash.node !== found.node) return { ok: false, error: 'duplicate-path' };
  found.node.path = to;
  return { ok: true, tree: work };
}

// --- Lese-Ordnung ------------------------------------------------------------

// Baum als flache Liste in Lese-Reihenfolge: ein Kapitel steht vor seinen
// Unterkapiteln, danach folgen seine Geschwister. Einträge sind
// { path, depth, parentPath }; `depth` beginnt bei 0.
function flattenChapters(tree) {
  const out = [];
  const walk = (nodes, depth, parentPath) => {
    for (const node of nodes) {
      out.push({ path: node.path, depth, parentPath });
      walk(node.children, depth + 1, node.path);
    }
  };
  walk(normalizeChapterTree(tree), 0, null);
  return out;
}

// Nur die Pfade in Lese-Reihenfolge.
function chapterPathsInReadingOrder(tree) {
  return flattenChapters(tree).map((entry) => entry.path);
}

// Schrittweite in der Lese-Ordnung; null an den Enden und bei einem Pfad, der
// nicht im Baum hängt.
function stepChapterPath(tree, chapterPath, step) {
  const path = normalizeChapterPath(chapterPath);
  if (path === null) return null;
  const paths = chapterPathsInReadingOrder(tree);
  const key = fileKey(path);
  const at = paths.findIndex((candidate) => fileKey(candidate) === key);
  if (at === -1) return null;
  const target = at + step;
  return target >= 0 && target < paths.length ? paths[target] : null;
}

// Nächstes Kapitel in Lese-Reihenfolge (Leseführung über Kapitel-Grenzen).
function nextChapterPath(tree, chapterPath) {
  return stepChapterPath(tree, chapterPath, 1);
}

// Vorheriges Kapitel in Lese-Reihenfolge.
function previousChapterPath(tree, chapterPath) {
  return stepChapterPath(tree, chapterPath, -1);
}

// --- Abgleich mit dem Datei-Bestand ------------------------------------------

// Gleicht die Deklaration gegen den Datei-Bestand des Buch-Ordners ab.
// `markdownPaths` sind die buch-relativen Pfade aller Markdown-Dateien des
// Ordners, `bookFileName` der Basename der Buch-Datei. Liefert
// { unlinked, missing }: im Ordner, aber nicht im Baum (in Eingabe-Reihenfolge)
// und im Baum, aber nicht im Ordner (in Lese-Reihenfolge). Die Buch-Datei
// selbst ist kein Kapitel und erscheint nie als nicht eingehängt; als
// vorhanden zählt sie sehr wohl.
function diffChapterFiles(tree, markdownPaths, bookFileName) {
  const declared = chapterPathsInReadingOrder(tree);
  const declaredKeys = new Set(declared.map(fileKey));
  const bookKey = fileKey(normalizeBookFileName(bookFileName) ?? '');
  const presentKeys = new Set();
  const unlinked = [];
  for (const raw of Array.isArray(markdownPaths) ? markdownPaths : []) {
    const path = normalizeChapterPath(raw);
    if (path === null) continue;
    const key = fileKey(path);
    if (presentKeys.has(key)) continue;
    presentKeys.add(key);
    if (key === bookKey) continue;
    if (!declaredKeys.has(key)) unlinked.push(path);
  }
  const missing = declared.filter((path) => !presentKeys.has(fileKey(path)));
  return { unlinked, missing };
}

module.exports = {
  BOOK_SETTINGS_FILENAME,
  BOOK_SCHEMA_VERSION,
  // Namen und Pfade.
  normalizeBookFileName,
  normalizeChapterPath,
  // Begleitdatei.
  emptyBookContainer,
  parseBookContainer,
  serializeBookContainer,
  readBookFileName,
  setBookFileName,
  readChapterTree,
  setChapterTree,
  // Erkennung ohne Rückverweis.
  isBookSettingsFileName,
  findBookSettingsEntry,
  isBookFileName,
  bookFileNameFromRaw,
  // Kapitel-Baum.
  normalizeChapterTree,
  hasChapter,
  insertChapter,
  removeChapter,
  moveChapterWithinLevel,
  moveChapter,
  indentChapter,
  outdentChapter,
  renameChapterPath,
  // Lese-Ordnung.
  flattenChapters,
  chapterPathsInReadingOrder,
  nextChapterPath,
  previousChapterPath,
  // Abgleich mit dem Datei-Bestand.
  diffChapterFiles,
};
