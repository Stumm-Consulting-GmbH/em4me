// 4T-002647 (Epic 3E-000416): Das Buch der Freigaben des Hauptprozesses.
//
// Es hält je Fenster fest, was der Anwender (oder das Programm auf seinen
// Wunsch) freigegeben hat: einen Bereich, einen Ordner, eine einzelne Datei.
// Die Prüf-Funktion (`path-check.js`) liest daraus, ob ein Fenster einen Pfad
// lesen oder schreiben darf. Bisher führte der Hauptprozess darüber kein Buch
// (Konzept-Stufe 4T-002645, Befund 1, Lösungsansatz T1).
//
// **Ein Buch für zwei Nutzer.** Dasselbe Buch trägt die Griffe der
// Datei-Schnittstelle für Add-ons (Konzept 4T-001062, T3): Ein Griff ist ein
// Eintrag mit einem Add-on als Inhaber. Deshalb ist der Inhaber ein Feld, und
// der Umfang unterscheidet `read`, `write` und `create` (ein Griff im Modus
// `create` darf lesen und anlegen, aber nicht überschreiben).
//
// **Kein Umfang schließt einen anderen ein.** Wer lesen und schreiben darf,
// trägt beide Werte ein. Eine eingebaute Folgerung «schreiben heißt auch
// lesen» wäre eine zweite, unsichtbare Regel neben der Liste; die Liste ist
// die eine Quelle.
//
// **Zwei Formen der Wurzel.** `root` ist der Ort nach Auflösung der
// Verknüpfungen, `chosenRoot` die Text-Form, wie der Anwender oder der Dialog
// sie nannte (nach `path.resolve`). Beide liefert `checkRoot` in
// `path-check.js`. Die gewählte Form braucht es, weil die Auflösung aus einem
// zugeordneten Netz-Laufwerk (`E:\…`) den Netz-Pfad macht, aus einem
// Verzeichnis-Knoten sein Ziel und aus einem Kurznamen den langen Namen; das
// Fenster zeigt und nennt aber die gewählte Form. Die Prüf-Funktion nimmt am
// Text beide Formen an und hält den echten Ort des Ziels allein gegen `root`.
// Das Buch selbst ist frei von Datei-Zugriffen, damit es ohne Fenster und ohne
// Platte prüfbar ist.
//
// **Ende.** Jeder Eintrag endet mit seinem Fenster (`endWindow`, Anschluss an
// das Schließen des Fensters). Ein Eintrag mit Ende `binding` endet zusätzlich
// mit dem Lösen der Bindung, aus der er stammt (Bereich, Buch, Regal; ebenso
// der Griff eines Add-ons auf den geöffneten Bereich). Einträge eines Add-ons
// enden außerdem mit seinem Ausschalten oder Entfernen (`endOwner`). Was über
// das Beenden des Programms hinaus gilt, führt nicht das Buch, sondern die
// Sitzungs-Liste des Hauptprozesses (T13).
//
// Electron-frei; eigener Zustand nur in der Instanz (Erzeuger-Funktion nach dem
// Muster `createAppRegistry`), kein Zustand auf Modul-Ebene. Die Fenster-
// Kennung ist `webContents.id`, hier nur eine Zahl.
'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EXTENSION_ID_RE } = require('../../shared/extensions/extensions-external');

const KINDS = Object.freeze(['area', 'folder', 'file']);
const SCOPES = Object.freeze(['read', 'write', 'create']);
// Herkunft nach T1 und T5 der Konzept-Stufe. `workspace`: Bereich aus einem
// benannten Arbeitsbereich; `area`: Griff eines Add-ons auf den geöffneten
// Bereich des Fensters (4T-001062, T3); `binding`: die Bindung eines Bereichs,
// Buchs oder Regals an die Applikation des Fensters (`binding-grants.js`). An
// der Bindungs-Stelle ist der Weg dorthin (Dialog, Liste, Sitzung,
// Arbeitsbereich) nicht mehr bekannt, und für die Prüfung hat er keine Wirkung.
const ORIGINS = Object.freeze([
  'dialog',
  'osHandoff',
  'recentList',
  'workspace',
  'session',
  'droppedFile',
  'confirmedLink',
  'confirmedEntry',
  'area',
  'binding',
]);
const ENDS = Object.freeze(['window', 'binding']);
const TRANSFER_MODES = Object.freeze(['copy', 'move']);
const OWNER_PROGRAM = 'program';
// Ein Add-on ist Inhaber unter `addon:<Kennung>`. Der eigene Namensraum ist
// nötig, weil die Paket-Kennung eines Add-ons `program` heißen dürfte und dann
// die Freigaben des Programms selbst erhielte. Die Form der Kennung kommt aus
// ihrer Heimat `src/shared/extensions/extensions-external.js` (Review-Befund Z2
// vom 2026-11-22).
const ADDON_PREFIX = 'addon:';
const FILTER_FIELDS = Object.freeze(['owner', 'kind', 'origin', 'end']);

function checkWindowId(windowId) {
  if (!Number.isSafeInteger(windowId) || windowId < 1) {
    throw new TypeError(`Grant book: invalid window id ${String(windowId)}.`);
  }
}

function checkOwner(owner) {
  if (owner === OWNER_PROGRAM) return;
  if (
    typeof owner !== 'string' ||
    !owner.startsWith(ADDON_PREFIX) ||
    !EXTENSION_ID_RE.test(owner.slice(ADDON_PREFIX.length))
  ) {
    throw new TypeError(`Grant book: invalid owner ${String(owner)}.`);
  }
}

function checkAbsolute(value, field) {
  if (typeof value !== 'string' || value.includes('\0') || !path.isAbsolute(value)) {
    throw new TypeError(`Grant book: ${field} must be an absolute path.`);
  }
  return path.resolve(value);
}

/** Inhaber-Angabe eines Add-ons aus seiner Paket-Kennung. */
function addonOwner(addonId) {
  const owner = `${ADDON_PREFIX}${String(addonId)}`;
  checkOwner(owner);
  return owner;
}

function fromList(value, list, field) {
  if (!list.includes(value)) {
    throw new TypeError(`Grant book: unknown value ${String(value)} for ${field}.`);
  }
  return value;
}

function normalizedScope(scope) {
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new TypeError('Grant book: scope must be a non-empty list.');
  }
  const set = new Set();
  for (const s of scope) set.add(fromList(s, SCOPES, 'scope'));
  // Feste Reihenfolge, damit gleiche Freigaben gleich aussehen.
  return Object.freeze(SCOPES.filter((s) => set.has(s)));
}

// Ein unbekanntes Filter-Feld bricht laut: Still übergangen, würde es aus
// «beende nur diese» ein «beende alle» machen.
function matches(entry, filter) {
  if (!filter || typeof filter !== 'object') {
    throw new TypeError('Grant book: filter must be an object.');
  }
  for (const field of Object.keys(filter)) {
    if (!FILTER_FIELDS.includes(field)) {
      throw new TypeError(`Grant book: unknown filter field ${field}.`);
    }
  }
  for (const field of FILTER_FIELDS) {
    if (filter[field] !== undefined && entry[field] !== filter[field]) return false;
  }
  return true;
}

/**
 * Erzeugt ein leeres Buch der Freigaben.
 *
 * @returns {{
 *   grant: Function, revoke: Function, end: Function, endWindow: Function,
 *   endOwner: Function, query: Function, entry: Function, transfer: Function
 * }}
 */
function createGrantBook() {
  // windowId -> Map(id -> Eintrag); die Einfüge-Reihenfolge bleibt erhalten.
  const windows = new Map();

  function store(windowId, e) {
    let list = windows.get(windowId);
    if (!list) {
      list = new Map();
      windows.set(windowId, list);
    }
    list.set(e.id, e);
  }

  /**
   * Trägt eine Freigabe für ein Fenster ein.
   *
   * @param {number} windowId `webContents.id` des Fensters.
   * @param {object} spec
   * @param {string} spec.root Absoluter Pfad nach Auflösung der Verknüpfungen.
   * @param {string} [spec.chosenRoot] Gewählte Text-Form; ohne Angabe `root`.
   * @param {'area'|'folder'|'file'} spec.kind
   * @param {Array<'read'|'write'|'create'>} spec.scope
   * @param {string} spec.origin Eine der Herkünfte aus `ORIGINS`.
   * @param {string} [spec.owner='program'] `program` oder `addon:<Kennung>` (`addonOwner`).
   * @param {'window'|'binding'} [spec.end='window']
   * @returns {Readonly<object>} Der eingetragene Eintrag samt neuer `id`.
   * @throws {TypeError} bei einer Angabe außerhalb des Vertrags.
   */
  function grant(windowId, spec) {
    checkWindowId(windowId);
    if (!spec || typeof spec !== 'object') throw new TypeError('Grant book: spec missing.');
    const {
      root,
      chosenRoot = root,
      kind,
      scope,
      origin,
      owner = OWNER_PROGRAM,
      end = 'window',
    } = spec;
    const resolvedRoot = checkAbsolute(root, 'root');
    const chosen = checkAbsolute(chosenRoot, 'chosenRoot');
    checkOwner(owner);
    const e = Object.freeze({
      id: randomUUID(),
      windowId,
      root: resolvedRoot,
      chosenRoot: chosen,
      kind: fromList(kind, KINDS, 'kind'),
      scope: normalizedScope(scope),
      origin: fromList(origin, ORIGINS, 'origin'),
      owner,
      end: fromList(end, ENDS, 'end'),
      transferredFrom: null,
    });
    store(windowId, e);
    return e;
  }

  /**
   * Entzieht einen Eintrag. Ein Eintrag eines anderen Fensters bleibt unberührt.
   *
   * @returns {boolean} `true`, wenn der Eintrag bestand und entfernt wurde.
   */
  function revoke(windowId, id) {
    checkWindowId(windowId);
    const list = windows.get(windowId);
    if (!list || !list.delete(id)) return false;
    if (list.size === 0) windows.delete(windowId);
    return true;
  }

  /**
   * Beendet die Einträge eines Fensters, die zum Filter passen.
   *
   * @param {number} windowId
   * @param {{owner?: string, kind?: string, origin?: string, end?: string}} [filter]
   *   Ohne Filter alle Einträge des Fensters.
   * @returns {number} Zahl der beendeten Einträge.
   */
  function end(windowId, filter = {}) {
    checkWindowId(windowId);
    const list = windows.get(windowId);
    if (!list) {
      matches({}, filter);
      return 0;
    }
    let count = 0;
    for (const [id, e] of list) {
      if (matches(e, filter)) {
        list.delete(id);
        count += 1;
      }
    }
    if (list.size === 0) windows.delete(windowId);
    return count;
  }

  /** Alle Einträge eines Fensters enden, etwa mit seinem Schließen. */
  function endWindow(windowId) {
    return end(windowId);
  }

  /**
   * Alle Einträge eines Inhabers enden, in allen Fenstern (Ausschalten oder
   * Entfernen eines Add-ons).
   *
   * @returns {number} Zahl der beendeten Einträge.
   */
  function endOwner(owner) {
    checkOwner(owner);
    let count = 0;
    for (const windowId of [...windows.keys()]) count += end(windowId, { owner });
    return count;
  }

  /**
   * Die Einträge eines Fensters als eingefrorene Liste, in Einfüge-Reihenfolge.
   *
   * @param {number} windowId
   * @param {{owner?: string, kind?: string, origin?: string, end?: string}} [filter]
   * @returns {ReadonlyArray<Readonly<object>>}
   */
  function query(windowId, filter = {}) {
    checkWindowId(windowId);
    const list = windows.get(windowId);
    if (!list) {
      matches({}, filter);
      return Object.freeze([]);
    }
    return Object.freeze([...list.values()].filter((e) => matches(e, filter)));
  }

  /** Ein Eintrag eines Fensters über seine Kennung, sonst `null`. */
  function entry(windowId, id) {
    checkWindowId(windowId);
    const list = windows.get(windowId);
    return (list && list.get(id)) || null;
  }

  /**
   * Gibt Einträge an ein anderes Fenster (Dokument in ein neues oder anderes
   * Fenster geben, T5). Die neuen Einträge tragen dieselben Angaben, eine neue
   * Kennung und `transferredFrom`. Bei einem Fehler ändert sich nichts.
   *
   * @param {number} fromWindow
   * @param {number} toWindow
   * @param {string[]} ids Einträge des abgebenden Fensters.
   * @param {{mode: 'copy'|'move'}} options Ohne Vorgabe: Der Aufrufer
   *   entscheidet ausdrücklich, ob das abgebende Fenster die Freigabe behält.
   * @returns {{ok: true, entries: ReadonlyArray<object>}|{ok: false, code: string, id: string}}
   *   Codes: `unknownId`, `notTransferable` (Eintrag eines Add-ons: Ein Griff
   *   gehört zu Add-on und Fenster).
   */
  function transfer(fromWindow, toWindow, ids, options) {
    checkWindowId(fromWindow);
    checkWindowId(toWindow);
    if (fromWindow === toWindow) throw new TypeError('Grant book: transfer to the same window.');
    if (!Array.isArray(ids)) throw new TypeError('Grant book: ids must be a list.');
    const mode = fromList(options && options.mode, TRANSFER_MODES, 'mode');
    const source = windows.get(fromWindow);
    const old = [];
    for (const id of ids) {
      const e = source && source.get(id);
      if (!e) return { ok: false, code: 'unknownId', id };
      if (e.owner !== OWNER_PROGRAM) return { ok: false, code: 'notTransferable', id };
      old.push(e);
    }
    const fresh = old.map((e) =>
      Object.freeze({ ...e, id: randomUUID(), windowId: toWindow, transferredFrom: fromWindow }),
    );
    for (const e of fresh) store(toWindow, e);
    if (mode === 'move') for (const e of old) revoke(fromWindow, e.id);
    return { ok: true, entries: Object.freeze(fresh) };
  }

  return { grant, revoke, end, endWindow, endOwner, query, entry, transfer };
}

module.exports = {
  KINDS,
  SCOPES,
  ORIGINS,
  ENDS,
  OWNER_PROGRAM,
  addonOwner,
  createGrantBook,
};
