// 4T-002459 (Epic 3E-000367): Ereignis-Grammatik der Workflows (Story
// 4S-001142).
//
// **Quelle** sind die Entscheidungen 3a, 3b und 3l der Konzept-Runde
// (4T-002458, Product Owner am 2026-10-30, «Alle wie empfohlen.»): ein
// Auslöser `trigger: event` und genau eine lesbare Zeile nach dem Muster der
// Zeitplan-Zeile (`workflow-schedule.js`),
//
//   event: <Ereignis> [in "<Ordner oder Datei>"] [matching "<Muster>"]
//
// mit den sechs Ereignissen `file-created`, `file-changed`, `file-moved`,
// `task-done`, `area-opened` und `reminder-due`. `in` grenzt auf einen Ordner
// samt Unterordnern oder auf eine Datei ein, `matching` auf ein Muster des
// Datei-Namens; beides ist optional.
//
// **Ausführungs-Entscheidungen im gesetzten Rahmen** (im Task festgehalten):
// - Wie beim Zeitplan zählen Groß- und Kleinschreibung der Schlüsselwörter
//   (Ereignis, `in`, `matching`) nicht, und Leerraum zwischen den Teilen ist
//   beliebig. Der Text in Anführungszeichen bleibt wörtlich.
// - **Im Zweifel streng:** `in` steht vor `matching`; die Werte stehen in
//   geraden Anführungszeichen; ein Muster trägt keinen Pfad-Trenner, weil es
//   allein den Datei-Namen meint (den Ordner grenzt `in` ein). Bei
//   `area-opened` und `reminder-due` sind `in` und `matching` ein Befund: Das
//   Öffnen eines Bereichs hat keine Datei, und für fällige Erinnerungen ist eine
//   Eingrenzung nicht entschieden. Eine spätere Lockerung bricht keine
//   vorhandene Datei, eine spätere Verschärfung schon.
// - **Abgleich ohne Rücksicht auf Groß- und Kleinschreibung,** bei Ordner,
//   Datei und Muster, weil die Haupt-Plattform Windows Namen so vergleicht;
//   ein Pfad zählt wurzel-relativ mit `/` wie der Platzhalter `{{file}}`. Bei
//   `file-moved` gilt der neue Pfad.
// - Das Muster kennt `*` (beliebig viele Zeichen) und `?` (genau ein
//   Zeichen), wie die Datei-Muster der Ordner-Aktionen und der Shell.
//
// **Platzhalter nach 3l:** `{{file}}` ist die Datei des Ereignisses, außer bei
// `area-opened`; `{{from}}` liefert nur `file-moved` (der alte Pfad), `{{task}}`
// nur `task-done` (der Aufgaben-Text). Was ein Ereignis nicht liefert, meldet
// der Prüfer (`workflow-check.js`).
//
// Der Kern kennt keine Sprache: Befunde sind Codes, die Texte entstehen in der
// Anzeige.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { checkAreaPath } = require('./workflow-paths.js');

/** Der Auslöser-Wert eines Workflows nach Ereignis im Dateikopf. */
// Schreibweisen-Faltung von Ordner und Pfad entscheidet die zentrale
// Plattform-Auskunft, nicht eine eigene Regel (Erosions-Wächter E2).
const { pathCompareKey } = require('../platform');

const EVENT_TRIGGER = 'event';

/** Die Ereignisse der Stufe 3 (3a), in der Reihenfolge des Katalogs. */
const EVENT_TYPES = Object.freeze([
  'file-created',
  'file-changed',
  'file-moved',
  'task-done',
  'area-opened',
  'reminder-due',
]);

// Ereignisse ohne Eingrenzung durch `in` und `matching`.
const OHNE_FILTER = Object.freeze(['area-opened', 'reminder-due']);

/**
 * Die Platzhalter, deren Wert vom Ereignis abhängt, und je Ereignis die, die es
 * liefert (3l).
 */
const EVENT_PLACEHOLDERS = Object.freeze(['file', 'from', 'task']);
const GELIEFERT = Object.freeze({
  'file-created': Object.freeze(['file']),
  'file-changed': Object.freeze(['file']),
  'file-moved': Object.freeze(['file', 'from']),
  'task-done': Object.freeze(['file', 'task']),
  'area-opened': Object.freeze([]),
  'reminder-due': Object.freeze(['file']),
});

/** Befund-Codes der Ereignis-Prüfung. */
const EVENT_FINDINGS = Object.freeze({
  /** Die Zeile folgt keiner Form der Grammatik. */
  unreadable: 'eventUnreadable',
  /** Das Ereignis gibt es nicht. */
  unknown: 'eventUnknown',
  /** Ordner oder Datei hinter `in` liegt außerhalb des Bereichs. */
  outsideArea: 'eventOutsideArea',
  /** Das Muster hinter `matching` ist leer oder trägt einen Pfad-Trenner. */
  patternInvalid: 'eventPatternInvalid',
  /** `in` oder `matching` bei einem Ereignis ohne Datei-Eingrenzung. */
  filterNotAllowed: 'eventFilterNotAllowed',
});

const ZEILE_RE = /^(\S+)(?:\s+in\s+"([^"]*)")?(?:\s+matching\s+"([^"]*)")?$/i;
const TRENNER_RE = /[\\/]/;

const fail = (code, detail = {}) => ({ ok: false, code, detail });

// Ordner oder Datei wurzel-relativ mit `/`, ohne leere und `.`-Segmente.
function zielPfad(text) {
  return text
    .split(TRENNER_RE)
    .filter((s) => s !== '' && s !== '.')
    .join('/');
}

/**
 * Liest die Ereignis-Zeile aus dem Dateikopf.
 *
 * @param {*} text Wert des Felds `event`.
 * @returns {{ok: true, rule: {event: string, in: (string|null),
 *   matching: (string|null)}}|{ok: false, code: string, detail: object}}
 *   `in` wurzel-relativ mit `/`, ohne abschließenden Trenner.
 */
function parseEvent(text) {
  if (typeof text !== 'string') return fail(EVENT_FINDINGS.unreadable, { event: String(text) });
  const zeile = text.trim();
  const m = zeile.match(ZEILE_RE);
  if (!m) return fail(EVENT_FINDINGS.unreadable, { event: zeile });
  const event = m[1].toLowerCase();
  if (!EVENT_TYPES.includes(event)) return fail(EVENT_FINDINGS.unknown, { event: m[1] });
  const roh = m[2];
  const muster = m[3];
  if (OHNE_FILTER.includes(event) && (roh !== undefined || muster !== undefined)) {
    return fail(EVENT_FINDINGS.filterNotAllowed, { event });
  }
  let ziel = null;
  if (roh !== undefined) {
    const grenze = checkAreaPath(roh);
    if (grenze && grenze.code === 'pathOutsideArea') {
      return fail(EVENT_FINDINGS.outsideArea, { path: roh, kind: grenze.kind });
    }
    ziel = zielPfad(roh);
    if (ziel === '') return fail(EVENT_FINDINGS.unreadable, { event: zeile });
  }
  if (muster !== undefined && (muster.trim() === '' || TRENNER_RE.test(muster))) {
    return fail(EVENT_FINDINGS.patternInvalid, { pattern: muster });
  }
  return { ok: true, rule: { event, in: ziel, matching: muster === undefined ? null : muster } };
}

// Das Muster als regulärer Ausdruck über den ganzen Datei-Namen.
function musterRegex(muster) {
  const quelle = [...muster]
    .map((z) => {
      if (z === '*') return '.*';
      if (z === '?') return '.';
      return z.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${quelle}$`, 'i');
}

const normiert = (pfad) => String(pfad == null ? '' : pfad).replace(/\\/g, '/');

/**
 * Passt ein Ereignis auf eine Ereignis-Regel?
 *
 * @param {{event: string, in: (string|null), matching: (string|null)}} rule
 *   Regel aus `parseEvent`.
 * @param {{type: string, path?: string}} ereignis das eingetretene Ereignis;
 *   `path` wurzel-relativ (bei `file-moved` der neue Pfad).
 * @returns {boolean}
 */
function eventMatches(rule, ereignis) {
  if (!rule || !ereignis || ereignis.type !== rule.event) return false;
  if (rule.in === null && rule.matching === null) return true;
  const pfad = normiert(ereignis.path);
  if (pfad === '') return false;
  if (rule.in !== null) {
    const ziel = pathCompareKey(rule.in);
    const klein = pathCompareKey(pfad);
    if (klein !== ziel && !klein.startsWith(`${ziel}/`)) return false;
  }
  if (rule.matching !== null) {
    const name = pfad.slice(pfad.lastIndexOf('/') + 1);
    if (!musterRegex(rule.matching).test(name)) return false;
  }
  return true;
}

/**
 * Liefert das Ereignis den Platzhalter? Platzhalter, deren Wert nicht vom
 * Ereignis abhängt (`{{date}}`, `{{area}}` …), liefert jedes.
 *
 * @param {string} event Ereignis aus `EVENT_TYPES`.
 * @param {string} placeholder Name des Platzhalters ohne Klammern.
 * @returns {boolean}
 */
function eventProvides(event, placeholder) {
  if (!EVENT_PLACEHOLDERS.includes(placeholder)) return true;
  return Object.prototype.hasOwnProperty.call(GELIEFERT, event)
    ? GELIEFERT[event].includes(placeholder)
    : false;
}

module.exports = {
  EVENT_FINDINGS,
  EVENT_PLACEHOLDERS,
  EVENT_TRIGGER,
  EVENT_TYPES,
  eventMatches,
  eventProvides,
  parseEvent,
};
