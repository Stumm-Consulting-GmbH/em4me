'use strict';

// 4T-002032 (Epic 3E-000260): Format-Vertrag der Ergebnismenge — das
// versionierte Übergabe-Format zwischen Auswertung und Anzeige einer Abfrage
// (Konzept «Datenbank-Anwendungen als Markdown», Entscheidungen E8.1 bis E8.5
// und E21.6). Das Modul beantwortet eine Frage: wie eine Ergebnismenge
// aussieht. Es legt ihren Aufbau fest, bietet Aufbau-Funktionen für jeden
// Baustein und einen Prüfer, der Abweichungen als Liste meldet statt zu werfen.
//
// Tragende Festlegungen:
//   - Das Format trägt typisierte Werte, keine Anzeige (E8.1). Der Anzeige-Wert
//     «hervorgehoben» (`kind: 'rich'`) bleibt für die drei bestehenden Ebenen
//     erlaubt und ist in einer Zeile mit Datensatz-Herkunft eine Abweichung.
//   - Werte-Raum ist das Werte-Modell von `query-format.js` plus der
//     Datensatz-Verweis mit Tabelle, Kennung und Anzeige-Form (E8.2).
//   - Daten und Darstellungs-Wünsche liegen getrennt (E8.3); eine
//     Darstellungsform darf die Wünsche übergehen.
//   - Eine Form für alle Ebenen (E8.4): Spalten-Beschreibung, eine Zeilen-Liste
//     mit Herkunft je Zeile, Gruppen als Struktur über den Zeilen. Die
//     Zeilen-Liste ist immer vollständig, auch bei Gruppierung.
//   - Zustände wie bisher, neu die Format-Version mit additiver Regel (E8.5):
//     Unbekannte Zusatz-Angaben sind keine Abweichung.
//   - Die Spalte trägt technischen Namen und aufgelöste Beschriftung (E21.6);
//     das Format ist damit sprachabhängig.
//   - Nur einfache Objekte, Listen und Grundwerte, weil die Menge über die
//     Prozess-Grenze läuft (strukturierter Klon) und auch einen JSON-Rundlauf
//     unverändert übersteht.
//
// Das Format ist einseitig: Es trägt Ergebnisse zur Anzeige und keinen Weg
// zurück zum Schreiben. Nach der Entscheidung F5 vom 2026-09-28 ist es intern
// versioniert und noch keine zugesagte Schnittstelle für Add-ons.
//
// Blatt-Stellung: Das Modul lädt allein `query-format.js`, dessen
// Werte-Erkennung die Heimat der bestehenden Werte-Arten ist. Prozess-neutral,
// ohne DOM und ohne Electron, damit Haupt- und Anzeige-Prozess es gleichermaßen
// laden.

const { isDate, isDur, isLink, isRich } = require('./query-format.js');

// --- Typen -----------------------------------------------------------------------

/**
 * Ein Wert des Werte-Raums (E8.2). `null` steht für «fehlend».
 * @typedef {null|string|number|boolean|DateValue|DurValue|LinkValue|RichValue|RecordRef|Value[]} Value
 */
/** @typedef {{ kind: 'date', ms: number }} DateValue  Zeitpunkt in Epoch-Millisekunden. */
/** @typedef {{ kind: 'dur', ms: number }} DurValue  Dauer in Millisekunden. */
/** @typedef {{ kind: 'link', path: string, name: string }} LinkValue  Datei-Verweis. */
/**
 * Hervorgehobener Anzeige-Wert aus `bold()`; nur auf den drei bestehenden Ebenen.
 * @typedef {{ kind: 'rich', segs: Array<{ text?: string, link?: { path: string, name: string }, bold?: boolean }> }} RichValue
 */
/**
 * Verweis auf einen Datensatz (E8.2): Tabelle (technischer Name), Kennung
 * (etwa `r-00042`) und Anzeige-Form, damit der Empfänger ohne Nachladen der
 * Ziel-Tabelle etwas zeigen kann.
 * @typedef {{ kind: 'record', table: string, id: string, display: string }} RecordRef
 */
/**
 * Spalten-Beschreibung (E8.4, E21.6).
 * @typedef {object} Column
 * @property {string} name  technischer Name; bei den drei bestehenden Ebenen der Ausdrucks-Quelltext
 * @property {string} label  aufgelöste Beschriftung (sprachabhängig)
 * @property {string|null} alias  Alias des Autors (`AS`) oder null
 * @property {string} source  Ausdrucks-Quelltext
 * @property {string|null} valueType  einheitliche Werte-Art aller nicht fehlenden Werte, sonst null
 */
/**
 * Herkunft einer Zeile, eine von vier Arten (E8.4).
 * @typedef {{ kind: 'file', path: string, name: string }
 *   | { kind: 'block', path: string, name: string, anchor: string }
 *   | { kind: 'task', path: string, name: string, line: number, raw: string }
 *   | { kind: 'record', table: string, id: string }} Origin
 */
/**
 * Zusatzangaben einer Aufgaben-Zeile, roh und ungerundet; gerundet wird in der Darstellung.
 * @typedef {{ urgency: number, blocked: boolean, duplicateId: boolean }} TaskInfo
 */
/**
 * Eine Zeile: je Spalte ein Wert, dazu Herkunft und bei Aufgaben die Zusatzangaben
 * (Pflicht bei Aufgaben-Herkunft, sonst null). 4T-002044: Bei `DISPLAY tree BY
 * <Feld>` trägt eine Datensatz-Zeile, deren Tabelle das Feld als Verweis-Feld
 * führt, zusätzlich `parent`, den Verweis des Feldes oder null; sonst fehlt es.
 * @typedef {{ values: Value[], origin: Origin, taskInfo: TaskInfo|null, parent?: RecordRef|null }} Row
 */
/**
 * Gruppe als Struktur über den Zeilen: Gruppen-Wert (null = «ohne Wert»),
 * Indizes aller Zeilen der Gruppe in `rows` und die Untergruppen oder null.
 * 4T-002078: In einer gruppierten Tabelle trägt jede Gruppe zusätzlich
 * `values`, je Spalte den Wert über ihren Zeilen; sonst fehlt die Angabe.
 * @typedef {{ value: Value, rows: number[], groups: Group[]|null, values?: Value[] }} Group
 */
/**
 * Darstellungs-Wünsche des Abfrage-Autors (E8.3); eine Darstellungsform darf sie übergehen.
 * @typedef {object} Wishes
 * @property {number|null} layoutColumns  `COLUMNS n`
 * @property {boolean} withoutId  `WITHOUT ID`
 * @property {string[]} hide  `HIDE`
 * @property {string[]} show  `SHOW`
 * @property {boolean} short  `SHORT`
 * @property {DisplayWish|null} [display]  `DISPLAY <Form> [BY <Feld>]`; fehlt ohne Angabe (4T-002043)
 */
/**
 * Die gewählte Darstellungsform (4T-002043): Name der Form, klein geschrieben,
 * und das Feld nach `BY` oder null. Ob es die Form gibt und ob sie passt,
 * entscheidet die Anzeige; der Vertrag prüft nur die Gestalt.
 * @typedef {{ form: string, by: string|null }} DisplayWish
 */
/**
 * Zustand (E8.5). Ein Abfrage-Fehler erscheint bei `status: 'ready'` mit leerer Zeilen-Liste.
 * @typedef {object} State
 * @property {'unavailable'|'oversized'|'indexing'|'error'|'ready'} status
 * @property {{ code: string, message: string, pos: number, clause?: string, name?: string }|null} queryError
 *   Abfrage-Fehler wie heute, samt der Zusatz-Angaben einzelner Fehler-Codes
 * @property {string|null} hint  Hinweis-Code wie `columnsIgnored`
 * @property {{ root: string, fileCount: number|null, byteSize: number|null }|null} area
 */
/**
 * Die Ergebnismenge.
 * @typedef {object} ResultSet
 * @property {number} formatVersion
 * @property {'files'|'blocks'|'tasks'|'records'|null} scope  Auswertungs-Ebene; null, wenn nicht ausgewertet
 * @property {'list'|'table'|null} type  Ausgabe-Typ; null, wenn nicht ausgewertet
 * @property {Column[]} columns
 * @property {Row[]} rows  immer vollständig, auch bei Gruppierung
 * @property {Group[]|null} groups
 * @property {Column[]} [groupColumns]  4T-002078: bei einer gruppierten Tabelle je
 *   Ausdruck von `GROUP BY` eine Spalten-Beschreibung, die Werte-Art aus den
 *   Gruppen-Werten der Stufe; sonst fehlt die Angabe
 * @property {Wishes} wishes
 * @property {State} state
 */
/** @typedef {{ path: string, code: string }} Finding  Abweichung mit Fundort. */

// --- Konstanten ------------------------------------------------------------------

const FORMAT_VERSION = 1;

const RESULT_SCOPES = Object.freeze(['files', 'blocks', 'tasks', 'records']);
const RESULT_TYPES = Object.freeze(['list', 'table']);
const RESULT_STATUSES = Object.freeze(['unavailable', 'oversized', 'indexing', 'error', 'ready']);
const VALUE_TYPES = Object.freeze([
  'string',
  'number',
  'boolean',
  'date',
  'dur',
  'link',
  'rich',
  'record',
  'list',
]);
const ORIGIN_KINDS = Object.freeze(['file', 'block', 'task', 'record']);

// Welche Herkunft zu welcher Ebene gehört; eine Zeile einer fremden Art ist
// eine Abweichung, weil die Darstellung sonst die falschen Angaben liest.
const ORIGIN_OF_SCOPE = Object.freeze({
  files: 'file',
  blocks: 'block',
  tasks: 'task',
  records: 'record',
});

const FINDING_CODES = Object.freeze([
  'notObject',
  'formatVersionInvalid',
  'scopeUnknown',
  'typeUnknown',
  'stateInvalid',
  'statusUnknown',
  'queryErrorInvalid',
  'hintInvalid',
  'areaInvalid',
  'rowsWithoutResult',
  'columnsInvalid',
  'columnInvalid',
  'rowsInvalid',
  'rowInvalid',
  'rowLengthMismatch',
  'valueKindUnknown',
  'valueInvalid',
  'valueTypeMismatch',
  'originInvalid',
  'originScopeMismatch',
  'taskInfoInvalid',
  'taskInfoWithoutTask',
  'richInRecordRow',
  'parentInvalid',
  'groupsInvalid',
  'groupInvalid',
  'groupRowUnknown',
  'groupRowOutsideParent',
  'groupValuesInvalid',
  'groupValuesLengthMismatch',
  'wishesInvalid',
  'notPlainObject',
  'functionValue',
  'undefinedValue',
  'nonFiniteNumber',
  'unsupportedPrimitive',
  'sparseArray',
  'cycle',
]);

// --- Kleine Helfer ---------------------------------------------------------------

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
}
function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}
function isStringOrNull(v) {
  return v === null || typeof v === 'string';
}
function isStringList(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}
function requireArray(v, what) {
  if (!Array.isArray(v)) throw new TypeError(`result-set: ${what} muss eine Liste sein`);
  return v;
}
function join(base, key) {
  if (typeof key === 'number') return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

/**
 * Prüft, ob ein Wert ein Datensatz-Verweis ist (nur die Art, nicht die Angaben).
 * @param {unknown} v
 * @returns {boolean}
 */
function isRecordRef(v) {
  return isPlainObject(v) && v.kind === 'record';
}

// Ein Datensatz-Verweis mit vollständigen Angaben (Tabelle, Kennung, Anzeige-Form).
function isValidRecordRef(v) {
  return (
    isRecordRef(v) &&
    isNonEmptyString(v.table) &&
    isNonEmptyString(v.id) &&
    typeof v.display === 'string'
  );
}

/**
 * Werte-Art eines Werts im Sinne von `Column.valueType`; null für «fehlend»
 * und für alles außerhalb des Werte-Raums.
 * @param {unknown} v
 * @returns {string|null}
 */
function valueTypeOf(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return typeof v;
  if (isDate(v)) return 'date';
  if (isDur(v)) return 'dur';
  if (isLink(v)) return 'link';
  if (isRich(v)) return 'rich';
  if (isRecordRef(v)) return 'record';
  return null;
}

/**
 * Einheitliche Werte-Art einer Werte-Folge (etwa einer Spalte über alle
 * Zeilen): fehlende Werte zählen nicht; gemischt oder ganz leer ergibt null.
 * @param {Value[]} values
 * @returns {string|null}
 */
function uniformValueType(values) {
  let found = null;
  for (const v of requireArray(values, 'values')) {
    const t = valueTypeOf(v);
    if (t === null) continue;
    if (found === null) found = t;
    else if (found !== t) return null;
  }
  return found;
}

// --- Aufbau-Funktionen -----------------------------------------------------------

/**
 * @param {{ name: string, label: string, alias?: string|null, source: string, valueType?: string|null }} spec
 * @returns {Column}
 */
function makeColumn({ name, label, alias = null, source, valueType = null }) {
  return { name, label, alias, source, valueType };
}

/** @returns {Origin} */
function fileOrigin(path, name) {
  return { kind: 'file', path, name };
}
/** @returns {Origin} */
function blockOrigin(path, name, anchor) {
  return { kind: 'block', path, name, anchor };
}
/** @returns {Origin} */
function taskOrigin(path, name, line, raw) {
  return { kind: 'task', path, name, line, raw };
}
/** @returns {Origin} */
function recordOrigin(table, id) {
  return { kind: 'record', table, id };
}

/**
 * @param {string} table
 * @param {string} id
 * @param {string} display
 * @returns {RecordRef}
 */
function makeRecordRef(table, id, display) {
  return { kind: 'record', table, id, display };
}

/**
 * @param {{ urgency: number, blocked: boolean, duplicateId: boolean }} spec
 * @returns {TaskInfo}
 */
function makeTaskInfo({ urgency, blocked, duplicateId }) {
  return { urgency, blocked, duplicateId };
}

/**
 * @param {Value[]} values  je Spalte ein Wert, in Spalten-Reihenfolge
 * @param {Origin} origin
 * @param {TaskInfo|null} [taskInfo]
 * @returns {Row}
 */
function makeRow(values, origin, taskInfo = null) {
  return { values: requireArray(values, 'values').slice(), origin, taskInfo };
}

/**
 * @param {Value} value  Gruppen-Wert, null für die Gruppe «ohne Wert»
 * @param {number[]} rows  Indizes aller Zeilen der Gruppe
 * @param {Group[]|null} [groups]  Untergruppen
 * @returns {Group}
 */
function makeGroup(value, rows, groups = null) {
  return {
    value,
    rows: requireArray(rows, 'rows').slice(),
    groups: groups === null ? null : requireArray(groups, 'groups').slice(),
  };
}

/**
 * @param {Partial<Wishes>} [spec]
 * @returns {Wishes}
 */
function makeWishes({
  layoutColumns = null,
  withoutId = false,
  hide = [],
  show = [],
  short = false,
  display = null,
} = {}) {
  const wishes = {
    layoutColumns,
    withoutId,
    hide: requireArray(hide, 'hide').slice(),
    show: requireArray(show, 'show').slice(),
    short,
  };
  // 4T-002043: Die Darstellungsform steht nur in der Menge, wenn der Autor eine
  // nennt (additiv nach E8.5); ohne Angabe bleibt die Menge wie zuvor.
  if (display !== null) wishes.display = { form: display.form, by: display.by ?? null };
  return wishes;
}

/**
 * @param {State['status']} status
 * @param {{ queryError?: State['queryError'], hint?: string|null, area?: { root: string, fileCount?: number|null, byteSize?: number|null }|null }} [extra]
 * @returns {State}
 */
function makeState(status, { queryError = null, hint = null, area = null } = {}) {
  return {
    status,
    // Der Abfrage-Fehler reist vollständig: Neben code, message und pos trägt
    // er je nach Fehler weitere Angaben (clause, name), die die Anzeige in die
    // Meldung einsetzt (syntaxErrorText in frontmatter-query-view.js).
    queryError: queryError === null ? null : { ...queryError },
    hint,
    area:
      area === null
        ? null
        : { root: area.root, fileCount: area.fileCount ?? null, byteSize: area.byteSize ?? null },
  };
}

/**
 * Baut eine Ergebnismenge der aktuellen Format-Version. Der Zustand ist Pflicht.
 * @param {{ scope?: ResultSet['scope'], type?: ResultSet['type'], columns?: Column[], rows?: Row[], groups?: Group[]|null, groupColumns?: Column[]|null, wishes?: Wishes, state: State }} spec
 * @returns {ResultSet}
 */
function makeResultSet({
  scope = null,
  type = null,
  columns = [],
  rows = [],
  groups = null,
  groupColumns = null,
  wishes = makeWishes(),
  state,
}) {
  if (!isPlainObject(state)) throw new TypeError('result-set: state ist Pflicht');
  const rs = {
    formatVersion: FORMAT_VERSION,
    scope,
    type,
    columns: requireArray(columns, 'columns').slice(),
    rows: requireArray(rows, 'rows').slice(),
    groups: groups === null ? null : requireArray(groups, 'groups').slice(),
    wishes,
    state,
  };
  // 4T-002078: Die Spalten der Gruppen-Werte stehen nur in einer gruppierten
  // Tabelle (additiv nach E8.5); jede andere Menge bleibt wie zuvor.
  if (groupColumns !== null) rs.groupColumns = requireArray(groupColumns, 'groupColumns').slice();
  return rs;
}

// --- Prüfer: Übertragbarkeit (Regel 8) ------------------------------------------

// Läuft über das GANZE Gebilde, auch über unbekannte Zusatz-Angaben: Die
// additive Regel erlaubt Unbekanntes, aber nichts, was die Prozess-Grenze oder
// einen JSON-Rundlauf nicht unverändert übersteht.
function checkTransferable(v, path, out, ancestors) {
  if (v === undefined) return void out.push({ path, code: 'undefinedValue' });
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push({ path, code: 'nonFiniteNumber' });
    return;
  }
  if (typeof v === 'function') return void out.push({ path, code: 'functionValue' });
  if (typeof v !== 'object') return void out.push({ path, code: 'unsupportedPrimitive' });
  if (ancestors.has(v)) return void out.push({ path, code: 'cycle' });
  if (Array.isArray(v)) {
    if (Object.getPrototypeOf(v) !== Array.prototype) out.push({ path, code: 'notPlainObject' });
    ancestors.add(v);
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) out.push({ path: join(path, i), code: 'sparseArray' });
      else checkTransferable(v[i], join(path, i), out, ancestors);
    }
    ancestors.delete(v);
    return;
  }
  if (!isPlainObject(v)) return void out.push({ path, code: 'notPlainObject' });
  ancestors.add(v);
  for (const key of Object.keys(v)) checkTransferable(v[key], join(path, key), out, ancestors);
  ancestors.delete(v);
}

// --- Prüfer: Werte (Regel 4 und 7) -----------------------------------------------

function isValidSegment(s) {
  if (!isPlainObject(s)) return false;
  if (s.link !== undefined) {
    return (
      isPlainObject(s.link) && typeof s.link.path === 'string' && typeof s.link.name === 'string'
    );
  }
  return typeof s.text === 'string';
}

// Prüft einen Wert des Werte-Raums. Die vier bestehenden Objekt-Arten erkennt
// `query-format.js` (Heimat des Werte-Modells), die Angaben prüft der Vertrag.
function checkValue(v, path, out, inRecordRow) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => checkValue(x, join(path, i), out, inRecordRow));
    return;
  }
  if (!isPlainObject(v)) return void out.push({ path, code: 'valueInvalid' });
  if (isDate(v) || isDur(v)) {
    if (typeof v.ms !== 'number') out.push({ path, code: 'valueInvalid' });
    return;
  }
  if (isLink(v)) {
    if (!isNonEmptyString(v.path) || typeof v.name !== 'string') {
      out.push({ path, code: 'valueInvalid' });
    }
    return;
  }
  if (isRich(v)) {
    if (!v.segs.every(isValidSegment)) out.push({ path, code: 'valueInvalid' });
    // E8.1: Eine Datenbank-Zelle hat einen Wert und keine Auszeichnung.
    if (inRecordRow) out.push({ path, code: 'richInRecordRow' });
    return;
  }
  if (isRecordRef(v)) {
    if (!isValidRecordRef(v)) out.push({ path, code: 'valueInvalid' });
    return;
  }
  // Eine benannte, aber unbekannte Art ist ein eigener Befund, weil sie auf
  // eine neuere Format-Version oder einen Tippfehler des Erzeugers deutet;
  // ein Objekt ohne Art oder mit bekannter Art in falscher Form ist ungültig.
  const unknownKind = typeof v.kind === 'string' && !VALUE_TYPES.includes(v.kind);
  out.push({ path, code: unknownKind ? 'valueKindUnknown' : 'valueInvalid' });
}

// --- Prüfer: Bausteine -----------------------------------------------------------

function checkOrigin(o, path, out) {
  if (!isPlainObject(o) || !ORIGIN_KINDS.includes(o.kind)) {
    return void out.push({ path, code: 'originInvalid' });
  }
  let ok;
  if (o.kind === 'record') ok = isNonEmptyString(o.table) && isNonEmptyString(o.id);
  else {
    ok = isNonEmptyString(o.path) && typeof o.name === 'string';
    if (o.kind === 'block') ok = ok && isNonEmptyString(o.anchor);
    if (o.kind === 'task') ok = ok && Number.isInteger(o.line) && o.line >= 1;
    if (o.kind === 'task') ok = ok && typeof o.raw === 'string';
  }
  if (!ok) out.push({ path, code: 'originInvalid' });
}

function checkTaskInfo(t, path, out) {
  const ok =
    isPlainObject(t) &&
    typeof t.urgency === 'number' &&
    typeof t.blocked === 'boolean' &&
    typeof t.duplicateId === 'boolean';
  if (!ok) out.push({ path, code: 'taskInfoInvalid' });
}

function checkColumns(columns, out, path = 'columns') {
  if (!Array.isArray(columns)) return void out.push({ path, code: 'columnsInvalid' });
  columns.forEach((c, i) => {
    const ok =
      isPlainObject(c) &&
      typeof c.name === 'string' &&
      typeof c.label === 'string' &&
      typeof c.source === 'string' &&
      isStringOrNull(c.alias) &&
      (c.valueType === null || VALUE_TYPES.includes(c.valueType));
    if (!ok) out.push({ path: join(path, i), code: 'columnInvalid' });
  });
}

function checkRow(row, i, rs, out) {
  const path = join('rows', i);
  if (!isPlainObject(row)) return void out.push({ path, code: 'rowInvalid' });
  checkOrigin(row.origin, join(path, 'origin'), out);
  const kind = isPlainObject(row.origin) ? row.origin.kind : null;
  const expected = RESULT_SCOPES.includes(rs.scope) ? ORIGIN_OF_SCOPE[rs.scope] : null;
  if (expected && kind !== expected && ORIGIN_KINDS.includes(kind)) {
    out.push({ path: join(path, 'origin'), code: 'originScopeMismatch' });
  }
  // Eine Aufgaben-Zeile trägt ihre Zusatzangaben immer, weil die Darstellung
  // Dringlichkeit und Kennzeichen daraus liest; jede andere Zeile trägt keine.
  if (row.taskInfo !== null || kind === 'task') {
    checkTaskInfo(row.taskInfo, join(path, 'taskInfo'), out);
    if (kind !== 'task') out.push({ path: join(path, 'taskInfo'), code: 'taskInfoWithoutTask' });
  }
  // 4T-002044: Der Eltern-Verweis des Baums darf fehlen oder null sein; steht er
  // da, ist er ein vollständiger Datensatz-Verweis an einer Datensatz-Zeile.
  const parent = row.parent;
  if (parent !== undefined && parent !== null && !(kind === 'record' && isValidRecordRef(parent))) {
    out.push({ path: join(path, 'parent'), code: 'parentInvalid' });
  }
  if (!Array.isArray(row.values)) return void out.push({ path, code: 'rowInvalid' });
  const columns = Array.isArray(rs.columns) ? rs.columns : null;
  if (columns && row.values.length !== columns.length) {
    out.push({ path: join(path, 'values'), code: 'rowLengthMismatch' });
  }
  checkValues(row.values, join(path, 'values'), columns, kind === 'record', out);
}

// Die Werte einer Zeile oder einer Gruppe gegen den Werte-Raum und die
// Werte-Art ihrer Spalte.
function checkValues(values, path, columns, inRecordRow, out) {
  values.forEach((v, j) => {
    const vPath = join(path, j);
    checkValue(v, vPath, out, inRecordRow);
    const col = columns && isPlainObject(columns[j]) ? columns[j] : null;
    const t = valueTypeOf(v);
    if (col && typeof col.valueType === 'string' && t !== null && t !== col.valueType) {
      out.push({ path: vPath, code: 'valueTypeMismatch' });
    }
  });
}

// 4T-002078: Die Werte über einer Gruppe dürfen fehlen; stehen sie da, sind sie
// eine Liste mit einem Wert je Spalte, nach denselben Regeln wie eine Zeile.
function checkGroupValues(g, gPath, rs, out) {
  if (g.values === undefined) return;
  const vPath = join(gPath, 'values');
  if (!Array.isArray(g.values)) return void out.push({ path: vPath, code: 'groupValuesInvalid' });
  const columns = Array.isArray(rs.columns) ? rs.columns : null;
  if (columns && g.values.length !== columns.length) {
    out.push({ path: vPath, code: 'groupValuesLengthMismatch' });
  }
  checkValues(g.values, vPath, columns, rs.scope === 'records', out);
}

function checkGroups(groups, path, rowCount, parentRows, out, rs) {
  if (!Array.isArray(groups)) return void out.push({ path, code: 'groupsInvalid' });
  groups.forEach((g, i) => {
    const gPath = join(path, i);
    if (!isPlainObject(g) || !Array.isArray(g.rows)) {
      return void out.push({ path: gPath, code: 'groupInvalid' });
    }
    checkValue(g.value, join(gPath, 'value'), out, false);
    checkGroupValues(g, gPath, rs, out);
    g.rows.forEach((r, j) => {
      const rPath = join(join(gPath, 'rows'), j);
      if (!Number.isInteger(r) || r < 0 || r >= rowCount) {
        out.push({ path: rPath, code: 'groupRowUnknown' });
      } else if (parentRows && !parentRows.has(r)) {
        out.push({ path: rPath, code: 'groupRowOutsideParent' });
      }
    });
    if (g.groups !== null) {
      checkGroups(g.groups, join(gPath, 'groups'), rowCount, new Set(g.rows), out, rs);
    }
  });
}

function checkWishes(w, out) {
  if (!isPlainObject(w)) return void out.push({ path: 'wishes', code: 'wishesInvalid' });
  const bad = (key) => out.push({ path: join('wishes', key), code: 'wishesInvalid' });
  if (!(w.layoutColumns === null || Number.isInteger(w.layoutColumns))) bad('layoutColumns');
  if (typeof w.withoutId !== 'boolean') bad('withoutId');
  if (!isStringList(w.hide)) bad('hide');
  if (!isStringList(w.show)) bad('show');
  if (typeof w.short !== 'boolean') bad('short');
  // 4T-002043: Die Darstellungsform darf fehlen; steht sie da, trägt sie einen
  // Namen und ein Feld oder null.
  const d = w.display;
  const displayOk =
    d === undefined ||
    d === null ||
    (isPlainObject(d) && isNonEmptyString(d.form) && isStringOrNull(d.by));
  if (!displayOk) bad('display');
}

function checkState(s, out) {
  if (!isPlainObject(s)) return void out.push({ path: 'state', code: 'stateInvalid' });
  if (!RESULT_STATUSES.includes(s.status)) {
    out.push({ path: 'state.status', code: 'statusUnknown' });
  }
  const e = s.queryError;
  if (
    e !== null &&
    !(
      isPlainObject(e) &&
      typeof e.code === 'string' &&
      typeof e.message === 'string' &&
      Number.isInteger(e.pos)
    )
  ) {
    out.push({ path: 'state.queryError', code: 'queryErrorInvalid' });
  }
  if (!isStringOrNull(s.hint)) out.push({ path: 'state.hint', code: 'hintInvalid' });
  const a = s.area;
  if (
    a !== null &&
    !(
      isPlainObject(a) &&
      typeof a.root === 'string' &&
      (a.fileCount === null || Number.isInteger(a.fileCount)) &&
      (a.byteSize === null || Number.isInteger(a.byteSize))
    )
  ) {
    out.push({ path: 'state.area', code: 'areaInvalid' });
  }
}

// --- Prüfer ----------------------------------------------------------------------

/**
 * Prüft eine Ergebnismenge gegen den Vertrag der Format-Version 1 und liefert
 * die Abweichungen mit Fundort; eine leere Liste heißt «gültig». Der Prüfer
 * wirft nicht. Unbekannte Zusatz-Angaben sind keine Abweichung (E8.5), müssen
 * aber übertragbar sein.
 * @param {unknown} rs
 * @returns {Finding[]}
 */
function validateResultSet(rs) {
  const out = [];
  if (!isPlainObject(rs)) {
    out.push({ path: '', code: 'notObject' });
    return out;
  }
  checkTransferable(rs, '', out, new Set());
  // Ein Kreis im Gebilde würde die Bausteinprüfung endlos laufen lassen; die
  // Menge ist ohnehin nicht übertragbar, die gefundenen Abweichungen genügen.
  if (out.some((f) => f.code === 'cycle')) return out;

  if (!Number.isInteger(rs.formatVersion) || rs.formatVersion < 1) {
    out.push({ path: 'formatVersion', code: 'formatVersionInvalid' });
  }
  checkState(rs.state, out);
  const state = isPlainObject(rs.state) ? rs.state : null;
  const evaluated = state && state.status === 'ready' && !state.queryError;
  if (!(rs.scope === null ? !evaluated : RESULT_SCOPES.includes(rs.scope))) {
    out.push({ path: 'scope', code: 'scopeUnknown' });
  }
  if (!(rs.type === null ? !evaluated : RESULT_TYPES.includes(rs.type))) {
    out.push({ path: 'type', code: 'typeUnknown' });
  }
  checkColumns(rs.columns, out);
  if (!Array.isArray(rs.rows)) {
    out.push({ path: 'rows', code: 'rowsInvalid' });
  } else {
    // E8.5: Ohne ausgewertetes Ergebnis (anderer Zustand oder Abfrage-Fehler)
    // ist die Zeilen-Liste leer.
    if (state && !evaluated && rs.rows.length > 0) {
      out.push({ path: 'rows', code: 'rowsWithoutResult' });
    }
    rs.rows.forEach((row, i) => checkRow(row, i, rs, out));
  }
  if (rs.groups !== null) {
    const rowCount = Array.isArray(rs.rows) ? rs.rows.length : 0;
    checkGroups(rs.groups, 'groups', rowCount, null, out, rs);
  }
  if (rs.groupColumns !== undefined) checkColumns(rs.groupColumns, out, 'groupColumns');
  checkWishes(rs.wishes, out);
  return out;
}

module.exports = {
  FORMAT_VERSION,
  RESULT_SCOPES,
  RESULT_TYPES,
  RESULT_STATUSES,
  VALUE_TYPES,
  ORIGIN_KINDS,
  FINDING_CODES,
  isRecordRef,
  valueTypeOf,
  uniformValueType,
  makeColumn,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
  makeRecordRef,
  makeTaskInfo,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
};
