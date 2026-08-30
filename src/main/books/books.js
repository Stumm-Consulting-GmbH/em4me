// 4T-0843 (Epic 3E-0147): Datei-Ebene des Buches — Erkennung eines
// Buch-Ordners, Zustands-Aufbau für den Renderer und Neuanlage.
//
// Der Kern des Buch-Modells (Begleitdatei, Kapitel-Baum, Lese-Ordnung,
// Abgleich mit dem Datei-Bestand) liegt prozess-neutral in
// src/shared/books/book-core.js und bleibt unangetastet; hier kommt allein der
// Datei-Zugriff dazu. Electron-frei (nur node:fs und node:path), damit die
// drei Wege (Erkennen, Zustand aufbauen, Anlegen) an echten Temp-Ordnern
// unit-testbar sind (Muster src/main/area/demo-area.js); main.js verdrahtet sie
// mit Dialogen, App-Registry und IPC.
//
// Das Lesen und Schreiben der Begleitdatei bleibt damit vollständig im
// Main-Prozess (Entscheidung des Kern-Moduls, Kopf-Kommentar dort).
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const {
  BOOK_SETTINGS_FILENAME,
  emptyBookContainer,
  parseBookContainer,
  serializeBookContainer,
  readBookFileName,
  readChapterTree,
  setChapterTree,
  findBookSettingsEntry,
  isBookFileName,
  chapterPathsInReadingOrder,
  diffChapterFiles,
  normalizeChapterPath,
  hasChapter,
  insertChapter,
  removeChapter,
  moveChapterWithinLevel,
  moveChapter,
  indentChapter,
  outdentChapter,
  renameChapterPath,
} = require('../../shared/books/book-core.js');
// Namens-Prüfung der Kapitel-Datei: dieselbe wie bei „Neue Datei in diesem
// Ordner" im Bereichs-Panel (getrimmt, ohne Pfad-Segmente und unter Windows
// verbotene Zeichen, Endung .md ergänzt). Eine zweite Fassung wäre eine
// zweite Wahrheit über zulässige Dateinamen.
//
// 4T-0847 (Story 4S-0756): `isInsideArea` ist die eine Innerhalb-Prüfung der
// Anwendung (der Ordner selbst zählt als innerhalb) und entscheidet hier über
// die Buch-Ordner-Grenze des Verschiebe-Ziels; `isSamePath` vergleicht zwei
// Pfade case-insensitiv wie das Windows-Dateisystem.
const { sanitizeNewFileName, isInsideArea, isSamePath } = require('../area/area-path.js');
// 4T-1276 (Epic 3E-0232, Befund B1): Pfad- und Dateinamen-Vergleiche dieses
// Moduls entscheiden über Datei-Identität und fragen deshalb die zentrale
// Auskunft. NICHT betroffen sind Vergleiche von Datei-ENDUNGEN (isMarkdownName):
// eine Endung ist konventionell schreibweisen-tolerant, `.MD` ist Markdown.
const { pathCompareKey } = require('../../shared/platform.js');

// Endungs-Satz der Markdown-Dateien, identisch zu isMarkdownPath in main.js.
// Bewusst nachgebildet statt importiert: main.js lädt dieses Modul, die
// Gegenrichtung wäre ein Zyklus.
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);

function isMarkdownName(name) {
  return MARKDOWN_EXTENSIONS.has(path.extname(String(name)).toLowerCase());
}

function bookSettingsPathFor(bookDir) {
  return path.join(bookDir, BOOK_SETTINGS_FILENAME);
}

// --- Lesen der Begleitdatei --------------------------------------------------

// Liest und parst die Begleitdatei eines Ordners. Ergebnis:
//   { ok: true, container, settingsPath }
//   { ok: false, error: 'no-book' }   Ordner ohne Begleitdatei
//   { ok: false, error: 'invalid', detail }  Begleitdatei defekt oder ohne
//                                            benannte Buch-Datei
// Die Unterscheidung trägt die Meldung an den Anwender: „kein Buch" ist eine
// gewöhnliche Ordner-Wahl, „defekt" ein Hinweis auf eine beschädigte Datei.
async function readBookSettings(bookDir) {
  if (typeof bookDir !== 'string' || bookDir === '') return { ok: false, error: 'no-book' };
  let entries;
  try {
    entries = await fs.readdir(bookDir);
  } catch {
    return { ok: false, error: 'no-book' };
  }
  // Erkennung über das Kern-Modul, damit die Schreibweise des Eintrags aus
  // dem Dateisystem stammt (Windows unterscheidet sie nicht).
  const entry = findBookSettingsEntry(entries);
  if (entry === null) return { ok: false, error: 'no-book' };
  const settingsPath = path.join(bookDir, entry);
  let raw;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch (err) {
    return { ok: false, error: 'invalid', detail: err && err.message ? err.message : String(err) };
  }
  const parsed = parseBookContainer(raw);
  if (!parsed.ok) return { ok: false, error: 'invalid', detail: parsed.error };
  return { ok: true, container: parsed.container, settingsPath };
}

// --- Erkennung beim Datei-Öffnen ---------------------------------------------

// Ist diese Markdown-Datei die Buch-Datei ihres Ordners? Liefert den
// Buch-Ordner (absolut) oder null. Erkennung ohne Rückverweis: die
// Begleitdatei des Ordners benennt den Basenamen (Epic-Entscheidung 2).
// Kapitel-Dateien liefern null und öffnen damit gewöhnlich (Entscheidung 9).
async function detectBookDirFor(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  if (!isMarkdownName(filePath)) return null;
  const absolute = path.resolve(filePath);
  const bookDir = path.dirname(absolute);
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return null;
  return isBookFileName(settings.container, path.basename(absolute)) ? bookDir : null;
}

// --- Datei-Bestand des Buch-Ordners ------------------------------------------

// Alle Markdown-Dateien des Buch-Ordners rekursiv, als buch-relative Pfade
// mit Vorwärts-Schrägstrichen (Form der Kapitel-Pfade im Kern-Modul).
// Nicht lesbare Unterordner werden übersprungen statt den ganzen Scan
// abzubrechen (Fehler-Isolation pro Knoten, Entwicklungsrichtlinien).
async function collectMarkdownPaths(bookDir) {
  const out = [];
  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (isMarkdownName(entry.name)) out.push(rel);
    }
  };
  await walk(bookDir, '');
  return out;
}

// --- Zustand des aktiven Buches ----------------------------------------------

// Baut den Zustand eines Buch-Ordners für den Renderer auf (Vertrag der
// Preload-API `books`): Buch-Ordner, Basename der Buch-Datei, Kapitel-Baum,
// Lese-Ordnung sowie der Abgleich mit dem Datei-Bestand (nicht eingehängt,
// fehlend). Fehler-Kennungen wie bei readBookSettings.
//
// 4T-0848 (Story 4S-0757): Dazu kommt `missingSuggestions` — je fehlendem
// Kapitel die namensgleichen Dateien an anderer Stelle des Buch-Ordners.
// Bewusst hier und nicht als eigener Abruf je Zeile: der Datei-Bestand ist
// für den Abgleich ohnehin schon eingelesen, ein zweiter Gang über die
// Platte je Anzeige wäre reine Wiederholung. Kapitel ohne Fund fehlen in der
// Abbildung, damit das Paket nicht mit leeren Listen wächst.
async function buildBookState(bookDir) {
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return settings;
  const bookFileName = readBookFileName(settings.container);
  const tree = readChapterTree(settings.container);
  const markdownPaths = await collectMarkdownPaths(bookDir);
  const { unlinked, missing } = diffChapterFiles(tree, markdownPaths, bookFileName);
  const missingSuggestions = {};
  for (const relPath of missing) {
    const found = namesakeSuggestions(markdownPaths, relPath, tree, bookFileName);
    if (found.length > 0) missingSuggestions[relPath] = found;
  }
  return {
    ok: true,
    state: {
      bookDir: path.resolve(bookDir),
      bookFileName,
      tree,
      readingOrder: chapterPathsInReadingOrder(tree),
      unlinked,
      missing,
      missingSuggestions,
    },
  };
}

// Existiert die benannte Buch-Datei tatsächlich? Ein Buch ohne seine
// Buch-Datei bleibt ein Buch (die Struktur steht in der Begleitdatei), es
// gibt aber nichts als Reiter zu öffnen.
async function bookFileExists(bookDir, bookFileName) {
  if (!bookFileName) return false;
  try {
    const stat = await fs.stat(path.join(bookDir, bookFileName));
    return stat.isFile();
  } catch {
    return false;
  }
}

// --- Neuanlage ---------------------------------------------------------------

// Validiert den Buchnamen: getrimmt, nicht leer, ohne Pfad-Segmente und ohne
// unter Windows verbotene Zeichen, keine reine Punkt-Folge (Muster
// sanitizeNewFileName in area-path.js). Ein abschließender Punkt oder
// Leerraum ist unter Windows im Ordnernamen unzulässig und wird abgeschnitten.
// Liefert den bereinigten Namen oder null.
function sanitizeBookName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/[.\s]+$/, '');
  if (trimmed === '') return null;
  if (/[\\/<>:"|?*]/.test(trimmed)) return null;
  // Steuerzeichen sind in Windows-Namen unzulässig; als Zeichen-Vergleich
  // statt als Regex-Bereich geschrieben, weil letzterer nur mit einer
  // ESLint-Ausnahme zulässig wäre (no-control-regex).
  if ([...trimmed].some((ch) => ch.codePointAt(0) < 32)) return null;
  if (/^\.+$/.test(trimmed)) return null;
  return trimmed;
}

// Legt ein neues Buch an: Ordner `<Name>` im Eltern-Ordner, darin die leere
// Buch-Datei `<Name>.md` und die Begleitdatei, die sie benennt. Ergebnis:
//   { ok: true, bookDir, bookFileName, bookFilePath }
//   { ok: false, error: 'invalid-name' | 'exists' | 'failed', detail }
// Ein bestehender Ordner wird nie überschrieben ('exists'); die Buch-Datei
// entsteht exklusiv (flag 'wx'), damit eine gleichnamige Bestands-Datei
// unangetastet bleibt.
async function createBook(parentDir, rawName) {
  if (typeof parentDir !== 'string' || parentDir === '') {
    return { ok: false, error: 'failed', detail: 'kein Eltern-Ordner' };
  }
  const name = sanitizeBookName(rawName);
  if (name === null) return { ok: false, error: 'invalid-name' };
  const bookDir = path.join(path.resolve(parentDir), name);
  const bookFileName = `${name}.md`;
  const bookFilePath = path.join(bookDir, bookFileName);
  try {
    // mkdir ohne recursive: ein bestehender Ordner meldet EEXIST, statt
    // still übernommen zu werden.
    await fs.mkdir(bookDir);
  } catch (err) {
    if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
    return { ok: false, error: 'failed', detail: err && err.message ? err.message : String(err) };
  }
  try {
    await fs.writeFile(bookFilePath, '', { encoding: 'utf8', flag: 'wx' });
    const container = emptyBookContainer(bookFileName);
    await fs.writeFile(bookSettingsPathFor(bookDir), serializeBookContainer(container), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (err) {
    return { ok: false, error: 'failed', detail: err && err.message ? err.message : String(err) };
  }
  return { ok: true, bookDir, bookFileName, bookFilePath };
}

// --- Struktur-Pflege (4T-0845, Story 4S-0754) ---------------------------------
//
// Alle Struktur-Änderungen schreiben ausschließlich die Deklaration in der
// Begleitdatei; keine Kapitel-Datei wird bewegt oder umbenannt (AK4, Epic-
// Entscheidung 4). Die einzige Ausnahme ist createChapter, das genau eine
// neue, leere Datei anlegt — das physische Verschieben und Umbenennen trägt
// ein eigenes Kommando (Story 4S-0756).

// Schreibt den Container zurück. Bewusst ohne Zwischendatei: die Begleitdatei
// ist klein, und ein halb geschriebener Container fiele beim nächsten Lesen
// als 'invalid' auf, statt still eine falsche Struktur zu behaupten.
async function writeBookSettings(settingsPath, container) {
  await fs.writeFile(settingsPath, serializeBookContainer(container), 'utf8');
}

// Wendet EINE Baum-Operation auf einen Kapitel-Baum an. Rein (die Eingabe
// bleibt unberührt), reicht die Fehler-Kennungen des Kern-Moduls unverändert
// durch und fügt allein 'invalid-op' für eine unbekannte oder unvollständige
// Op-Form hinzu. Die Op-Formen sind der Vertrag der Preload-API `books`:
//   { type: 'insert', path, parentPath: string|null, index: number|null }
//   { type: 'remove', path }
//   { type: 'moveWithinLevel', path, direction: 'up'|'down' }
//   { type: 'move', path, parentPath: string|null, index: number|null }
//   { type: 'indent', path }
//   { type: 'outdent', path }
// `parentPath: null` meint die oberste Ebene, `index: null` das Anfügen ans
// Ende der Ziel-Ebene (das Kern-Modul nimmt dafür einen Index außerhalb des
// Bereichs).
function applyChapterOp(tree, op) {
  if (op === null || typeof op !== 'object') return { ok: false, error: 'invalid-op' };
  const chapterPath = typeof op.path === 'string' ? op.path : '';
  const parentPath =
    typeof op.parentPath === 'string' && op.parentPath !== '' ? op.parentPath : null;
  const index = Number.isInteger(op.index) ? op.index : -1;
  switch (op.type) {
    case 'insert':
      return insertChapter(tree, chapterPath, parentPath, index);
    case 'remove':
      return removeChapter(tree, chapterPath);
    case 'moveWithinLevel':
      if (op.direction !== 'up' && op.direction !== 'down')
        return { ok: false, error: 'invalid-op' };
      return moveChapterWithinLevel(tree, chapterPath, op.direction === 'up' ? -1 : 1);
    case 'move':
      return moveChapter(tree, chapterPath, parentPath, index);
    case 'indent':
      return indentChapter(tree, chapterPath);
    case 'outdent':
      return outdentChapter(tree, chapterPath);
    default:
      return { ok: false, error: 'invalid-op' };
  }
}

// Wendet eine Baum-Operation auf das Buch an und schreibt die Begleitdatei.
// Ergebnis: { ok: true, changed } bzw. { ok: false, error, detail? }. Eine
// abgelehnte Operation schreibt NICHTS — die Datei bleibt exakt so stehen,
// wie sie war. `changed: false` meldet den Rand einer Ebene (eine gehaltene
// Taste am oberen oder unteren Ende); auch dann bleibt die Datei unberührt,
// weil ein Schreibvorgang ohne Änderung nur Zeitstempel bewegt.
async function applyTreeOp(bookDir, op) {
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return settings;
  const result = applyChapterOp(readChapterTree(settings.container), op);
  if (!result.ok) return { ok: false, error: result.error };
  if (result.moved === false) return { ok: true, changed: false };
  setChapterTree(settings.container, result.tree);
  try {
    await writeBookSettings(settings.settingsPath, settings.container);
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err && err.message ? err.message : String(err),
    };
  }
  return { ok: true, changed: true };
}

// Legt eine neue Kapitel-Datei an und hängt sie unmittelbar ein.
// `parentPath` (buch-relativ, null = oberste Ebene) bestimmt BEIDES: den
// Ordner der neuen Datei — den Ordner der Eltern-Kapitel-Datei, auf oberster
// Ebene den Buch-Ordner — und die Einhänge-Stelle als letztes Unterkapitel
// des Elterns bzw. am Ende der obersten Ebene. Ergebnis:
//   { ok: true, relPath, path }
//   { ok: false, error: 'invalid-name' | 'invalid-path' | 'unknown-parent' |
//                       'duplicate-path' | 'exists' | 'failed' | 'write-failed' }
// Eine Namens-Kollision im Dateisystem meldet 'exists' und lässt die
// bestehende Datei unangetastet ('wx'); ein bereits deklarierter Pfad meldet
// 'duplicate-path', bevor überhaupt etwas angelegt wird (Invariante: ein
// Kapitel hängt genau einmal im Baum).
async function createChapter(bookDir, parentPath, rawName) {
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return settings;
  const fileName = sanitizeNewFileName(rawName);
  if (fileName === null) return { ok: false, error: 'invalid-name' };
  const tree = readChapterTree(settings.container);
  let parent = null;
  if (typeof parentPath === 'string' && parentPath !== '') {
    parent = normalizeChapterPath(parentPath);
    if (parent === null) return { ok: false, error: 'invalid-path' };
    if (!hasChapter(tree, parent)) return { ok: false, error: 'unknown-parent' };
  }
  // Der Ordner der Eltern-Kapitel-Datei; auf oberster Ebene der Buch-Ordner.
  const folder = parent === null ? '' : parent.split('/').slice(0, -1).join('/');
  const relPath = folder === '' ? fileName : `${folder}/${fileName}`;
  if (hasChapter(tree, relPath)) return { ok: false, error: 'duplicate-path' };
  const target = path.join(path.resolve(bookDir), ...relPath.split('/'));
  try {
    // Der Ordner der Eltern-Kapitel-Datei existiert im Regelfall bereits; er
    // fehlt nur, wenn das Eltern-Kapitel deklariert ist, seine Datei aber
    // nicht (mehr) vorhanden ist. Dann entsteht er hier mit — er liegt per
    // Konstruktion im Buch-Ordner (Muster journals:createEntry).
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
    return { ok: false, error: 'failed', detail: err && err.message ? err.message : String(err) };
  }
  // Ab hier existiert die Datei. Scheitert das Einhängen dennoch, bleibt sie
  // als gewöhnliche Markdown-Datei liegen und erscheint im Abschnitt „nicht
  // eingehängt" — sichtbar und bedienbar statt still verloren.
  const inserted = insertChapter(tree, relPath, parent, -1);
  if (!inserted.ok) return { ok: false, error: inserted.error };
  setChapterTree(settings.container, inserted.tree);
  try {
    await writeBookSettings(settings.settingsPath, settings.container);
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err && err.message ? err.message : String(err),
    };
  }
  return { ok: true, relPath, path: target };
}

// --- Physisches Verschieben und Umbenennen (4T-0847, Story 4S-0756) -----------
//
// Bewegt wird die Datei NICHT hier: das übernimmt in main.js dieselbe Strecke
// wie beim Umbenennen (Watcher-Umzug, Begleit-.mdd, offene Historien-Pakete,
// Zuletzt-Liste, Broadcast). Dieses Modul plant die Bewegung (Grenzen,
// Kollision) und führt die Deklaration nach; so bleiben beide Teile ohne
// Electron unit-testbar.

// Buch-relativer Pfad einer absoluten Datei; null, wenn sie außerhalb des
// Buch-Ordners liegt (normalizeChapterPath lehnt Ausbrüche mit '..' ab).
function toBookRelative(bookDir, absolute) {
  return normalizeChapterPath(path.relative(path.resolve(bookDir), path.resolve(absolute)));
}

// Aufwärts-Suche nach dem Buch einer Datei: vom Verzeichnis der Datei aufwärts
// bis zum Laufwerks-Anker die nächstgelegene Begleitdatei, die die Datei
// (relativ zu ihrem Buch-Ordner) im Kapitel-Baum führt. Liefert
// { bookDir, settingsPath, container, relPath } oder null. Unabhängig davon,
// ob das Buch gerade geöffnet ist — die Nachführung hängt an der Datei, nicht
// am Sitzungs-Zustand.
//
// Ein Buch-Ordner, dessen Baum die Datei NICHT führt, beendet die Suche
// bewusst nicht: die Datei kann Kapitel eines Buches weiter oben sein, und ein
// Ordner-Fund allein ist noch keine Zugehörigkeit. Die Suche endet, sobald
// `dirname` sich nicht mehr ändert (Laufwerks-Wurzel bzw. UNC-Freigabe).
async function findBookForFile(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const absolute = path.resolve(filePath);
  let dir = path.dirname(absolute);
  for (;;) {
    const settings = await readBookSettings(dir);
    if (settings.ok) {
      const relPath = toBookRelative(dir, absolute);
      if (relPath !== null && hasChapter(readChapterTree(settings.container), relPath)) {
        return {
          bookDir: dir,
          settingsPath: settings.settingsPath,
          container: settings.container,
          relPath,
        };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Führt den Kapitel-Baum-Eintrag einer bewegten Datei nach — beim Umbenennen
// wie beim physischen Verschieben, weil beides für die Deklaration derselbe
// Pfadwechsel ist. Die Baum-Position und der Unterbaum bleiben unverändert
// (renameChapterPath). Ergebnis:
//   { ok: true, changed: false }   keine Kapitel-Datei eines Buches
//   { ok: true, changed: true, bookDir, oldRelPath, newRelPath }
//   { ok: false, error: 'outside-book' | 'duplicate-path' | 'unknown-chapter' |
//                       'invalid-path' | 'write-failed', detail? }
// 'outside-book' meint ein Ziel außerhalb des Buch-Ordners: der Eintrag zeigte
// danach ins Leere, deshalb bleibt die Begleitdatei unberührt. Der reguläre
// Verschiebe-Weg lässt es gar nicht so weit kommen (planChapterFileMove weist
// solche Ziele vorher ab).
async function followChapterFileMove(oldPath, newPath) {
  if (typeof newPath !== 'string' || newPath === '') return { ok: false, error: 'invalid-path' };
  const book = await findBookForFile(oldPath);
  if (book === null) return { ok: true, changed: false };
  const newRelPath = toBookRelative(book.bookDir, newPath);
  if (newRelPath === null) return { ok: false, error: 'outside-book' };
  if (newRelPath === book.relPath) return { ok: true, changed: false };
  const result = renameChapterPath(readChapterTree(book.container), book.relPath, newRelPath);
  if (!result.ok) return { ok: false, error: result.error };
  setChapterTree(book.container, result.tree);
  try {
    await writeBookSettings(book.settingsPath, book.container);
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err && err.message ? err.message : String(err),
    };
  }
  return {
    ok: true,
    changed: true,
    bookDir: book.bookDir,
    oldRelPath: book.relPath,
    newRelPath,
  };
}

// Plant das physische Verschieben einer Kapitel-Datei in einen Ordner des
// Buch-Ordners: prüft Buch, Quelle, Buch-Datei-Schutz, Ziel-Grenze (AK4) und
// Namens-Kollision, bewegt aber nichts. Ergebnis:
//   { ok: true, sourcePath, targetPath, newRelPath }
//   { ok: false, error: 'no-book' | 'invalid' | 'invalid-path' | 'book-file' |
//                       'unknown-file' | 'outside-book' | 'unknown-target' |
//                       'unchanged' | 'exists' }
// Die Buch-Datei selbst ist kein Kapitel: ihr Basename trägt die Erkennung des
// Ordners (Epic-Entscheidung 2) und wäre nach einem Verschieben gegenstandslos.
async function planChapterFileMove(bookDir, relPath, targetDir) {
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return settings;
  const rel = normalizeChapterPath(relPath);
  if (rel === null) return { ok: false, error: 'invalid-path' };
  const root = path.resolve(bookDir);
  const sourcePath = path.join(root, ...rel.split('/'));
  const bookFileName = readBookFileName(settings.container);
  if (bookFileName !== null && pathCompareKey(rel) === pathCompareKey(bookFileName)) {
    return { ok: false, error: 'book-file' };
  }
  try {
    if (!(await fs.stat(sourcePath)).isFile()) return { ok: false, error: 'unknown-file' };
  } catch {
    return { ok: false, error: 'unknown-file' };
  }
  if (typeof targetDir !== 'string' || targetDir === '') {
    return { ok: false, error: 'outside-book' };
  }
  const target = path.resolve(targetDir);
  // AK4: Das Ziel muss im Buch-Ordner liegen; der Buch-Ordner selbst zählt
  // dazu (Herausziehen aus einem Unterordner).
  if (!isInsideArea(root, target)) return { ok: false, error: 'outside-book' };
  try {
    if (!(await fs.stat(target)).isDirectory()) return { ok: false, error: 'unknown-target' };
  } catch {
    return { ok: false, error: 'unknown-target' };
  }
  const targetPath = path.join(target, path.basename(sourcePath));
  if (isSamePath(targetPath, sourcePath)) return { ok: false, error: 'unchanged' };
  try {
    await fs.access(targetPath);
    return { ok: false, error: 'exists' };
  } catch {
    /* Ziel frei */
  }
  const newRelPath = toBookRelative(root, targetPath);
  if (newRelPath === null) return { ok: false, error: 'outside-book' };
  return { ok: true, sourcePath, targetPath, newRelPath };
}

// --- Reparatur fehlender Kapitel (4T-0848, Story 4S-0757) ---------------------
//
// Ein Baum-Eintrag ohne Datei ist der Normalfall nach einer Änderung am
// Dateisystem vorbei. Repariert wird ausschließlich die Deklaration: die
// Zuordnung zeigt auf eine andere, bereits vorhandene Datei; bewegt oder
// angelegt wird nichts. Der Suchraum bleibt der Buch-Ordner (Grenze wie beim
// Verschiebe-Weg), und ein Vorschlag wird nie von selbst ausgeführt (AK3,
// Epic-Entscheidung 6) — dieses Modul liefert Funde, die Entscheidung fällt
// im Panel.

// Vergleichs-Schlüssel des Basenamens eines buch-relativen Pfades. Das
// Windows-Dateisystem unterscheidet Groß- und Kleinschreibung nicht (Muster
// fileKey im Kern-Modul).
function chapterBaseNameKey(relPath) {
  return pathCompareKey(
    String(relPath || '')
      .replace(/\\/g, '/')
      .split('/')
      .pop(),
  );
}

// Namensgleiche Markdown-Dateien an ANDERER Stelle des Buch-Ordners, als
// buch-relative Pfade in der Reihenfolge des Datei-Bestands. `markdownPaths`
// ist das Ergebnis von collectMarkdownPaths (rekursiv, Vorwärts-Schrägstriche).
//
// Ausgenommen sind der gesuchte Pfad selbst, die Buch-Datei und jede Datei,
// die bereits im Baum hängt: eine Zuordnung dorthin wiese reassignChapter
// ohnehin ab (Invariante — ein Kapitel hängt genau einmal), und ein Vorschlag,
// der abgelehnt werden müsste, ist keiner.
function namesakeSuggestions(markdownPaths, missingPath, tree, bookFileName) {
  const wanted = chapterBaseNameKey(missingPath);
  if (wanted === '') return [];
  const missingKey = pathCompareKey(String(missingPath).replace(/\\/g, '/'));
  const bookKey = typeof bookFileName === 'string' ? pathCompareKey(bookFileName) : null;
  return (Array.isArray(markdownPaths) ? markdownPaths : []).filter((rel) => {
    const key = pathCompareKey(String(rel));
    if (key === missingKey || key === bookKey) return false;
    if (chapterBaseNameKey(rel) !== wanted) return false;
    return !hasChapter(tree, rel);
  });
}

// Wiederfinde-Vorschläge für einen fehlenden Kapitel-Pfad. Ergebnis:
//   { ok: true, suggestions: [buch-relative Pfade] }
//   { ok: false, error: 'no-book' | 'invalid' | 'invalid-path', detail? }
// Rein lesend: der Aufruf ändert nichts und ist deshalb auch dann unbedenklich,
// wenn der übergebene Pfad gar kein deklariertes Kapitel ist.
async function suggestMissingChapters(bookDir, missingPath) {
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return settings;
  const rel = normalizeChapterPath(missingPath);
  if (rel === null) return { ok: false, error: 'invalid-path' };
  const tree = readChapterTree(settings.container);
  const markdownPaths = await collectMarkdownPaths(bookDir);
  return {
    ok: true,
    suggestions: namesakeSuggestions(
      markdownPaths,
      rel,
      tree,
      readBookFileName(settings.container),
    ),
  };
}

// Ordnet einem deklarierten Kapitel eine andere Datei zu. `newPath` kommt
// buch-relativ (angenommener Vorschlag) oder absolut (Datei-Dialog); beide
// Formen müssen im Buch-Ordner landen. Die Baum-Position samt Unterbaum bleibt
// unverändert (renameChapterPath) — repariert wird der Zeiger, nicht die
// Gliederung. Ergebnis:
//   { ok: true, relPath }
//   { ok: false, error: 'no-book' | 'invalid' | 'invalid-path' |
//                       'unknown-chapter' | 'outside-book' | 'book-file' |
//                       'unknown-file' | 'unchanged' | 'duplicate-path' |
//                       'write-failed', detail? }
// Ob die alte Datei wirklich fehlt, wird NICHT geprüft: die Zuordnung bleibt
// auch dann eine gültige Aussage, wenn sie zwischenzeitlich wieder aufgetaucht
// ist, und ein Fehler an dieser Stelle wäre für den Anwender nicht erklärbar.
async function reassignChapter(bookDir, missingPath, newPath) {
  const settings = await readBookSettings(bookDir);
  if (!settings.ok) return settings;
  const rel = normalizeChapterPath(missingPath);
  if (rel === null) return { ok: false, error: 'invalid-path' };
  const tree = readChapterTree(settings.container);
  if (!hasChapter(tree, rel)) return { ok: false, error: 'unknown-chapter' };
  if (typeof newPath !== 'string' || newPath === '') return { ok: false, error: 'invalid-path' };
  const root = path.resolve(bookDir);
  let target;
  if (path.isAbsolute(newPath)) {
    target = path.resolve(newPath);
  } else {
    const relTarget = normalizeChapterPath(newPath);
    if (relTarget === null) return { ok: false, error: 'invalid-path' };
    target = path.join(root, ...relTarget.split('/'));
  }
  // Dateisystem-authoritative Grenze wie beim Verschiebe-Weg: der Buch-Ordner
  // selbst zählt dazu, ein Ausbruch über '..' nicht.
  if (!isInsideArea(root, target)) return { ok: false, error: 'outside-book' };
  const newRel = toBookRelative(root, target);
  if (newRel === null) return { ok: false, error: 'outside-book' };
  // Ein Kapitel ist eine Markdown-Datei; der Datei-Dialog filtert bereits, ein
  // von Hand eingetippter Name kann den Filter aber umgehen.
  if (!isMarkdownName(newRel)) return { ok: false, error: 'invalid-path' };
  const bookFileName = readBookFileName(settings.container);
  if (bookFileName !== null && pathCompareKey(newRel) === pathCompareKey(bookFileName)) {
    return { ok: false, error: 'book-file' };
  }
  try {
    if (!(await fs.stat(target)).isFile()) return { ok: false, error: 'unknown-file' };
  } catch {
    return { ok: false, error: 'unknown-file' };
  }
  // Vor der Belegt-Prüfung: der eigene Eintrag hängt selbst im Baum und wäre
  // sonst seine eigene Kollision.
  if (pathCompareKey(newRel) === pathCompareKey(rel)) return { ok: false, error: 'unchanged' };
  if (hasChapter(tree, newRel)) return { ok: false, error: 'duplicate-path' };
  const result = renameChapterPath(tree, rel, newRel);
  if (!result.ok) return { ok: false, error: result.error };
  setChapterTree(settings.container, result.tree);
  try {
    await writeBookSettings(settings.settingsPath, settings.container);
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err && err.message ? err.message : String(err),
    };
  }
  return { ok: true, relPath: newRel };
}

module.exports = {
  BOOK_SETTINGS_FILENAME,
  bookSettingsPathFor,
  readBookSettings,
  detectBookDirFor,
  collectMarkdownPaths,
  buildBookState,
  bookFileExists,
  sanitizeBookName,
  createBook,
  // Struktur-Pflege (4T-0845).
  writeBookSettings,
  applyChapterOp,
  applyTreeOp,
  createChapter,
  // Physisches Verschieben und Umbenennen (4T-0847).
  findBookForFile,
  followChapterFileMove,
  planChapterFileMove,
  // Reparatur fehlender Kapitel (4T-0848).
  namesakeSuggestions,
  suggestMissingChapters,
  reassignChapter,
};
