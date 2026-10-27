// 4T-002347 (Epic 3E-000184): Der Befehls-Katalog der Workflows als Daten.
//
// **Quelle** ist der Befehls-Katalog im Entscheidungs-Protokoll der
// Konzept-Stufe (4T-002330), entschieden vom Product Owner am 2026-10-20
// (K1 englische Schlüsselwörter, K2 Umfang, K3 Stufen-Spalte, K6 Platzhalter).
// Der Katalog führt **alle** Befehle aller Stufen, damit der Prüfer einen
// unbekannten Befehl von einem Befehl einer späteren Stufe unterscheidet.
//
// **Schema nur für die Stufe 1** (Entscheidung der Sitzung vom 2026-10-22, O6):
// Die Befehle der Stufen 2, 3 und D tragen Schlüsselwort und Stufe, aber kein
// Argument-Schema. Ihre Konzept-Runden sind offen; ein Schema jetzt nähme deren
// Grammatik vorweg. Für den Befund «spätere Stufe» genügt die Stufe.
//
// **Nachschlagen nur über eigene Eigenschaften.** Ein Schlüsselwort kommt aus
// dem Dokument; ein blanker Zugriff fände `constructor` und `toString` als
// geerbte Einträge (Entwicklungsrichtlinien, Kapitel 11).
//
// Prozess-neutral: reine Daten, kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

// Eine einzige Obergrenze der Wartezeit für Makro und Workflow (Katalog:
// «wie die Verzögerung im Makro»).
const { MACRO_MAX_DELAY_SECONDS } = require('../commands/command-placement.js');

/** Die Stufen, deren Befehle die ausgelieferte Fassung ausführt. */
const ENABLED_STAGES = Object.freeze([1]);

/**
 * Argument-Arten einer Befehls-Zeile.
 * path: Pfad in Anführungszeichen, relativ zur Bereichs-Wurzel.
 * name: neuer Datei-Name in Anführungszeichen, ohne Trennzeichen.
 * text: Text in Anführungszeichen.
 * key: Eigenschafts-Name, als Wort oder in Anführungszeichen.
 * value: Wert in Anführungszeichen oder als Zahl.
 * number: Zahl ohne Anführungszeichen.
 * commandId: Kommando-Kennung ohne Anführungszeichen.
 */
const ARG_TYPES = Object.freeze(['path', 'name', 'text', 'key', 'value', 'number', 'commandId']);

// Benannte Optionen (G4): Wortpaar `option "Wert"` oder ein einzelnes Wort.
// `group` ordnet sie einer Options-Gruppe des Befehls zu, `value` ist die Art
// des Werts oder null für ein einzelnes Wort.
const OPTIONS = Object.freeze({
  'from-template': Object.freeze({ group: 'source', kind: 'template', value: 'path' }),
  'from-file': Object.freeze({ group: 'source', kind: 'file', value: 'path' }),
  'from-section': Object.freeze({ group: 'source', kind: 'section', value: 'text' }),
  under: Object.freeze({ group: 'position', kind: 'under', value: 'text' }),
  'at-start': Object.freeze({ group: 'position', kind: 'atStart', value: null }),
});

// Positions-Argument; `nonEmpty` verlangt einen nicht leeren Text.
function arg(type, nonEmpty = false) {
  return Object.freeze({ type, nonEmpty });
}

function stufeEins(args, groups = {}) {
  return Object.freeze({ stage: 1, args: Object.freeze(args), groups: Object.freeze(groups) });
}

function spaeter(stage) {
  return Object.freeze({ stage, args: null, groups: null });
}

const PATH = arg('path');

const WORKFLOW_COMMANDS = Object.freeze({
  // Dateien und Ordner
  create: stufeEins([PATH], { source: 'optional' }),
  rename: stufeEins([PATH, arg('name')]),
  move: stufeEins([PATH, PATH]),
  copy: stufeEins([PATH, PATH]),
  mkdir: stufeEins([PATH]),
  open: stufeEins([PATH]),
  close: stufeEins([PATH]),
  delete: spaeter(2),
  // Inhalte und Dateikopf
  append: stufeEins([PATH], { source: 'required' }),
  insert: stufeEins([PATH], { position: 'required', source: 'required' }),
  replace: stufeEins([PATH, arg('text', true), arg('text')]),
  'set-property': stufeEins([PATH, arg('key', true), arg('value')]),
  'remove-property': stufeEins([PATH, arg('key', true)]),
  'add-tag': spaeter(2),
  'remove-tag': spaeter(2),
  'complete-task': spaeter(2),
  // Anwendung
  command: stufeEins([arg('commandId')]),
  macro: stufeEins([arg('text', true)]),
  workflow: stufeEins([arg('text', true)]),
  wait: stufeEins([arg('number')]),
  notify: stufeEins([arg('text', true)]),
  confirm: spaeter(2),
  // Ablauf
  stop: stufeEins([arg('text', true)]),
  'if-exists': spaeter(3),
  'if-missing': spaeter(3),
  'if-property': spaeter(3),
  'for-each': spaeter(3),
  script: spaeter(3),
  // Datenbank (Stufe D)
  'db-create': spaeter('D'),
  'db-update': spaeter('D'),
  'db-delete': spaeter('D'),
  'db-query': spaeter('D'),
  'db-for-each': spaeter('D'),
  'db-open': spaeter('D'),
  'db-open-list': spaeter('D'),
  'db-check': spaeter('D'),
  'db-export': spaeter('D'),
  'db-import': spaeter('D'),
});

// Platzhalter der Engine, die in einer Befehls-Zeile nicht gelten (Entscheidung
// der Sitzung vom 2026-10-22, O8): Eine Schreibmarke hat in einer Zeile kein
// Ziel, die Zwischenablage ist nach K3 Stufe 2.
const FORBIDDEN_PLACEHOLDER_TYPES = Object.freeze(['cursor']);
const LATER_STAGE_PLACEHOLDERS = Object.freeze({ clipboard: 2 });

// Kommando-Namensräume, die nur über ihr eigenes Schlüsselwort laufen: Die
// Aufruf-Tiefe nach A4 ist nur über `macro` und `workflow` durchsetzbar.
const RESERVED_COMMAND_PREFIXES = Object.freeze(['macro.', 'workflow.']);

const hat = (tafel, schluessel) => Object.prototype.hasOwnProperty.call(tafel, schluessel);

/**
 * Der Katalog-Eintrag eines Schlüsselworts.
 *
 * @param {string} keyword Schlüsselwort aus der Befehls-Zeile.
 * @returns {{stage: (number|string), args: object[]|null, groups: object|null}|null}
 */
function lookupCommand(keyword) {
  return typeof keyword === 'string' && hat(WORKFLOW_COMMANDS, keyword)
    ? WORKFLOW_COMMANDS[keyword]
    : null;
}

/**
 * Die Beschreibung einer benannten Option.
 *
 * @param {string} word Wort aus der Befehls-Zeile.
 * @returns {{group: string, kind: string, value: (string|null)}|null}
 */
function lookupOption(word) {
  return typeof word === 'string' && hat(OPTIONS, word) ? OPTIONS[word] : null;
}

/**
 * Die Lage eines Bezugs auf ein Makro oder einen Workflow nach der Rückfrage des
 * Aufrufers. Die Rückfrage darf einen Wahrheitswert oder die Zahl der Treffer
 * liefern; zwei Treffer gleichen Namens sind mehrdeutig (4T-002349, E1:
 * Entscheidung der Sitzung vom 2026-10-23 im Rahmen der freigegebenen Stories).
 * Ohne Rückfrage gilt der Bezug als bekannt, die Prüfung entfällt.
 *
 * @param {Function|undefined} frage Rückfrage `isKnownMacro` oder `isKnownWorkflow`.
 * @param {string} name Name aus der Befehls-Zeile.
 * @returns {'known'|'unknown'|'ambiguous'}
 */
function referenceState(frage, name) {
  if (typeof frage !== 'function') return 'known';
  const antwort = frage(name);
  if (typeof antwort === 'number') {
    if (antwort > 1) return 'ambiguous';
    return antwort === 1 ? 'known' : 'unknown';
  }
  return antwort ? 'known' : 'unknown';
}

/**
 * Stufe eines Platzhalters, der in einer späteren Stufe hinzukommt, sonst null.
 *
 * @param {string} name Name des Platzhalters.
 * @returns {number|null}
 */
function laterStagePlaceholder(name) {
  return hat(LATER_STAGE_PLACEHOLDERS, name) ? LATER_STAGE_PLACEHOLDERS[name] : null;
}

module.exports = {
  ARG_TYPES,
  ENABLED_STAGES,
  FORBIDDEN_PLACEHOLDER_TYPES,
  MAX_WAIT_SECONDS: MACRO_MAX_DELAY_SECONDS,
  OPTIONS,
  RESERVED_COMMAND_PREFIXES,
  WORKFLOW_COMMANDS,
  laterStagePlaceholder,
  lookupCommand,
  lookupOption,
  referenceState,
};
