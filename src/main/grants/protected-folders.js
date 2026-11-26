// 4T-002647 (Epic 3E-000416): Die geschützten Ordner.
//
// Zwei Orte tragen, was das Programm steuert: der Ordner des Programms und der
// Nutzerdaten-Ordner mit Einstellungs-Datei, Add-ons und eigenen Sprachdateien;
// bei der portablen Fassung liegt der Nutzerdaten-Ordner als Daten-Ordner neben
// der Programmdatei (`src/main/app/portabler-betrieb.js`). Kann Code im Fenster
// dort schreiben, hilft keine Prüfung der Erlaubnisse, denn er ändert die
// Ablage direkt. Nach der Entscheidung zu V5 der Konzept-Stufe 4T-002645
// (Option a) sind diese Orte für die Dokument-Funktionen schreibgeschützt:
// Schreiben und Anlegen weisen ein Ziel dort ab, Lesen bleibt möglich, und als
// Bereich öffnen lässt sich ein solcher Ordner nicht, ein Ordner, der ihn
// enthält, schon (Lösungsansatz T14). Stand nach Stufe 1 (Review-Befund Z1 vom
// 2026-11-22): Abgewiesen wird ein Ziel an den Kanälen mit Pfad-Erklärung
// (`src/main/ipc/channel-guard.js`), also beim Speichern, bei Ausgaben,
// Anlagen, Umbenennen und beim Anlegen von Unterseiten, Büchern, Regalen und
// Vorlagen. Die Bindung eines solchen Ordners als Bereich trägt
// `binding-grants.js` nur nicht als Freigabe ein und warnt; abgewiesen wird sie
// erst mit Stufe 2, und bis dahin legen die noch nicht erklärten Kanäle des
// Bereichs-Panels darin an.
//
// **Die Liste ist ein Parameter.** Die Datei-Schnittstelle der Add-ons prüft
// mit derselben Funktion ihre längere Liste (Konzept 4T-001062, T5), in der
// auch das Lesen gesperrt ist. Deshalb trägt jeder Eintrag, welche Umfänge er
// sperrt (`blocks`), und neben gewöhnlichen Ordnern gibt es die Art
// `hiddenSubfolders` für «die verborgenen Ordner direkt im Benutzerprofil»
// (Linux: Ordner mit führendem Punkt), die sich nicht als feste Pfad-Liste
// schreiben lassen.
//
// **Einmal auflösen, nicht je Prüfung.** `resolveList` löst die Orte einer
// Liste einmal auf (Verknüpfungen, Kurznamen, zugeordnete Netz-Laufwerke) und
// liefert sie in Text- und aufgelöster Form, eingefroren und als aufgelöst
// gekennzeichnet. Die Prüf-Funktionen in `path-check.js` verlangen eine so
// aufgelöste Liste; an jedem Endpunkt-Aufruf je Eintrag erneut aufzulösen,
// kostete mehrere Datei-System-Aufrufe. Die Kennzeichnung ist eine Menge im
// Modul (WeakSet), damit sie sich nicht durch ein nachgebautes Objekt
// vortäuschen lässt. Wird ein Ort später verlegt oder neu angelegt, löst der
// Aufrufer die Liste neu auf.
//
// Electron-frei: Die Orte kommen als Parameter herein (Ergebnisse von
// `app.getPath` und der Erkennung des portablen Betriebs). Verglichen wird mit
// der einen Innerhalb-Prüfung der Anwendung (`isInsideArea`, Schreibung nach
// `pathCompareKey`), damit geschützte Ordner und Freigaben nach demselben
// Maßstab entschieden werden.
'use strict';

const path = require('node:path');
const fsPromises = require('node:fs/promises');
const { isInsideArea, isSamePath } = require('../area/area-path');
const { SCOPES } = require('./grant-book');

const PROTECTED_KINDS = Object.freeze(['folder', 'hiddenSubfolders']);
// Was die Dokument-Funktionen in den Ordnern des Programms nicht dürfen (V5 a).
const PROGRAM_BLOCKS = Object.freeze(['write', 'create']);
const resolvedLists = new WeakSet();

function absolutePath(value, field) {
  if (typeof value !== 'string' || value.includes('\0') || !path.isAbsolute(value)) {
    throw new TypeError(`Protected folders: ${field} must be an absolute path.`);
  }
  return path.resolve(value);
}

/**
 * Prüft und friert eine Liste geschützter Orte ein.
 *
 * @param {Array<{path: string, reason: string, blocks: string[], kind?: string}>} entries
 *   `blocks` ist eine nicht leere Teilmenge von `read`, `write`, `create`;
 *   `kind` ist `folder` (Vorgabe: der Ort selbst und alles darunter) oder
 *   `hiddenSubfolders` (alles in einem direkten Unterordner, dessen Name mit
 *   einem Punkt beginnt).
 * @returns {ReadonlyArray<Readonly<object>>}
 * @throws {TypeError} bei einem Eintrag außerhalb des Vertrags.
 */
function createList(entries) {
  if (!Array.isArray(entries)) throw new TypeError('Protected folders: list expected.');
  return Object.freeze(
    entries.map((e, i) => {
      if (!e || typeof e !== 'object')
        throw new TypeError(`Protected folders: entry ${i} missing.`);
      if (typeof e.reason !== 'string' || e.reason === '') {
        throw new TypeError(`Protected folders: entry ${i} without reason.`);
      }
      const kind = e.kind === undefined ? 'folder' : e.kind;
      if (!PROTECTED_KINDS.includes(kind)) {
        throw new TypeError(`Protected folders: unknown kind ${String(kind)}.`);
      }
      if (!Array.isArray(e.blocks) || e.blocks.length === 0) {
        throw new TypeError(`Protected folders: entry ${i} blocks nothing.`);
      }
      for (const s of e.blocks) {
        if (!SCOPES.includes(s))
          throw new TypeError(`Protected folders: unknown scope ${String(s)}.`);
      }
      return Object.freeze({
        path: absolutePath(e.path, `entry ${i}`),
        reason: e.reason,
        kind,
        blocks: Object.freeze(SCOPES.filter((s) => e.blocks.includes(s))),
      });
    }),
  );
}

/**
 * Die geschützten Ordner des Programms für die Dokument-Funktionen (V5 a).
 *
 * @param {object} places
 * @param {string} places.programFolder Ordner des laufenden Programms
 *   (`path.dirname(process.execPath)`; bei der portablen Fassung der Ordner,
 *   in den ihr Start-Rahmen das Programm entpackt).
 * @param {string} places.userDataFolder `app.getPath('userData')`.
 * @param {string} [places.addonFolder] Ordner der Add-ons.
 * @param {string} [places.localeFolder] Ordner der eigenen Sprachdateien.
 * @param {string} [places.settingsFile] Datei des Einstellungs-Speichers.
 * @param {string} [places.portableDataFolder] Daten-Ordner neben der portablen
 *   Programmdatei (`ermittlePortablenBetrieb(...).datenOrdner`).
 * @param {string} [places.portableProgramFile] Die portable Programmdatei selbst.
 * @returns {ReadonlyArray<Readonly<object>>} Liste für `resolveList`.
 */
function createProgramList(places) {
  if (!places || typeof places !== 'object')
    throw new TypeError('Protected folders: places missing.');
  const entries = [
    { path: places.programFolder, reason: 'programFolder' },
    { path: places.userDataFolder, reason: 'userDataFolder' },
  ];
  // Die übrigen Orte liegen heute im Nutzerdaten-Ordner. Sie stehen dennoch
  // einzeln in der Liste, damit eine spätere Verlegung den Schutz nicht still
  // verliert.
  for (const reason of [
    'addonFolder',
    'localeFolder',
    'settingsFile',
    'portableDataFolder',
    'portableProgramFile',
  ]) {
    if (places[reason] === undefined || places[reason] === null) continue;
    entries.push({ path: places[reason], reason });
  }
  return createList(entries.map((e) => ({ ...e, blocks: PROGRAM_BLOCKS })));
}

/**
 * Löst eine Liste einmal auf: jeder Eintrag in Text- und in aufgelöster Form.
 *
 * @param {ReadonlyArray<object>} list Aus `createList` oder `createProgramList`.
 * @param {{fileSystem?: {realpath: Function, lstat: Function}}} [options]
 * @returns {Promise<Readonly<{entries: ReadonlyArray<object>}>>} Gekennzeichnet
 *   als aufgelöst (`isResolvedList`).
 * @throws bei einem Fehler der Auflösung: Eine Liste, die sich nicht auflösen
 *   lässt, schützt nicht verlässlich und wird nicht ausgegeben.
 */
async function resolveList(list, options = {}) {
  // Lauf-Zeit-Bezug innerhalb des Ordners: `path-check.js` lädt dieses Modul
  // auf oberster Ebene, die Auflösung bis zum tiefsten vorhandenen Vorfahren
  // lebt dort; ein Bezug auf oberster Ebene schlösse den Kreis beim Laden.
  const { realLocation } = require('./path-check');
  const valid = createList(list);
  const fileSystem = options.fileSystem || fsPromises;
  const entries = [];
  for (const e of valid) {
    entries.push(e);
    let resolved;
    try {
      resolved = await realLocation(e.path, fileSystem);
    } catch (err) {
      // Welcher Eintrag scheiterte, ohne seinen Pfad: Grund fürs Protokoll.
      if (err && typeof err === 'object' && typeof e.reason === 'string') {
        err.entryReason = e.reason;
      }
      throw err;
    }
    if (!isSamePath(resolved, e.path)) entries.push(Object.freeze({ ...e, path: resolved }));
  }
  const result = Object.freeze({ entries: Object.freeze(entries) });
  resolvedLists.add(result);
  return result;
}

function failureCode(err) {
  const code = (err && (err.checkCode || err.code)) || 'unknown';
  const reason = err && typeof err.entryReason === 'string' ? ` (${err.entryReason})` : '';
  return `${String(code)}${reason}`;
}

/**
 * Quelle der aufgelösten Liste für die Prüf-Stellen (4T-002922). Eine
 * gelungene Ermittlung wird festgehalten, eine gescheiterte nicht: Der nächste
 * Aufruf ermittelt neu. Gleichzeitige Aufrufe teilen eine laufende Ermittlung.
 * Bis dahin hielt der Start ein einmal ermitteltes Versprechen fest, und ein
 * Scheitern beim ersten Start sperrte jeden Schreib-Kanal bis zum Neustart.
 * Durch lässt die Quelle nichts: Scheitert die Ermittlung, wird ihr Aufruf
 * abgelehnt, und die Prüf-Stelle weist ab. Ins Protokoll geht der Grund samt
 * betroffenem Eintrag, nie ein Pfad oder die Fehlermeldung.
 *
 * @param {() => Promise<object>} resolve Ermittelt die Liste, etwa
 *   `() => resolveProgramList(start)`.
 * @param {{warn?: Function}} [options]
 * @returns {() => Promise<Readonly<{entries: ReadonlyArray<object>}>>}
 */
function createListSource(resolve, options = {}) {
  if (typeof resolve !== 'function') {
    throw new TypeError('Protected folders: resolve function expected.');
  }
  const warn = typeof options.warn === 'function' ? options.warn : console.warn;
  let done = null;
  let running = null;
  return function protectedFolders() {
    if (done) return Promise.resolve(done);
    if (running) return running;
    // `resolve` läuft erst im nächsten Schritt der Versprechens-Kette: Auch ein
    // sofortiger Wurf wird so zur Ablehnung, und das Zurücksetzen von `running`
    // geschieht stets nach dieser Zuweisung, sodass der nächste Aufruf neu
    // ermittelt (Zweitblick zu 4T-002922, Befund 2).
    running = Promise.resolve()
      .then(() => resolve())
      .then(
        (list) => {
          done = list;
          return list;
        },
        (err) => {
          warn('Liste der geschützten Ordner nicht ermittelbar:', failureCode(err));
          throw err;
        },
      )
      .finally(() => {
        running = null;
      });
    return running;
  };
}

/**
 * Macht aus dem Parameter `protectedFolders` der Prüf-Stellen eine Quelle:
 * eine Funktion bleibt, ein Versprechen oder eine Liste wird zur festen Quelle.
 */
function asListSource(value) {
  if (typeof value === 'function') return value;
  const fixed = Promise.resolve(value);
  fixed.catch(() => {});
  return () => fixed;
}

/** Stammt die Liste aus `resolveList`? */
function isResolvedList(value) {
  return resolvedLists.has(value);
}

function hits(entry, candidate) {
  if (entry.kind === 'folder') return isInsideArea(entry.path, candidate);
  // hiddenSubfolders: Der Ort selbst ist nicht gemeint, nur was in einem
  // direkten Unterordner mit führendem Punkt liegt.
  if (!isInsideArea(entry.path, candidate) || isSamePath(entry.path, candidate)) return false;
  const first = path.relative(path.resolve(entry.path), path.resolve(candidate)).split(path.sep)[0];
  return first.startsWith('.');
}

/**
 * Der erste geschützte Ort, in dem einer der Kandidaten liegt und der den
 * verlangten Umfang sperrt; sonst `null`. Rein, ohne Datei-Zugriff.
 *
 * @param {string[]} candidates Absolute Pfade desselben Ziels (Text, echter Ort).
 * @param {ReadonlyArray<object>|Readonly<{entries: ReadonlyArray<object>}>} list
 *   Eine Liste aus `createList` oder eine aufgelöste aus `resolveList`.
 * @param {string} scope `read`, `write` oder `create`.
 * @returns {Readonly<object>|null} Der getroffene Eintrag.
 */
function findProtectedPlace(candidates, list, scope) {
  const entries = isResolvedList(list) ? list.entries : list;
  if (!Array.isArray(candidates) || !Array.isArray(entries) || !SCOPES.includes(scope)) {
    throw new TypeError('Protected folders: candidates, list and scope expected.');
  }
  for (const entry of entries) {
    if (!entry.blocks.includes(scope)) continue;
    if (candidates.some((c) => hits(entry, c))) return entry;
  }
  return null;
}

module.exports = {
  PROGRAM_BLOCKS,
  createList,
  createProgramList,
  resolveList,
  createListSource,
  asListSource,
  isResolvedList,
  findProtectedPlace,
};
