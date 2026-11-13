// 4T-002347 (Epic 3E-000184): Der Befehls-Katalog der Workflows als Daten.
//
// **Quelle** ist der Befehls-Katalog im Entscheidungs-Protokoll der
// Konzept-Stufe (4T-002330), entschieden vom Product Owner am 2026-10-20
// (K1 englische Schlüsselwörter, K2 Umfang, K3 Stufen-Spalte, K6 Platzhalter).
// Der Katalog führt **alle** Befehle aller Stufen, damit der Prüfer einen
// unbekannten Befehl von einem Befehl einer späteren Stufe unterscheidet.
//
// **Schema nur für entschiedene Stufen** (Entscheidung der Sitzung vom
// 2026-10-22, O6): Die Befehle der Stufen 3 und D tragen Schlüsselwort und
// Stufe, aber kein Argument-Schema. Ihre Konzept-Runden sind offen; ein Schema
// jetzt nähme deren Grammatik vorweg. Für den Befund «spätere Stufe» genügt die
// Stufe.
//
// **Stufe 2** (4T-002424, Stories 4S-001135 und 4S-001136): Die fünf
// Pflege-Befehle `delete`, `add-tag`, `remove-tag`, `complete-task` und
// `confirm` tragen ihr Schema nach den Regeln P1 bis P5 der Konzept-Runde
// 4T-002418. Mit der Stufe 2 in `ENABLED_STAGES` werden allein sie und der
// Platzhalter `{{clipboard}}` frei; die Stufen 3 und D bleiben gesperrt.
//
// **Stufe 3, Bedingungen und Schleife** (4T-002464, Stories 4S-001147 und
// 4S-001148, Entscheidungen 3f und 3g der Konzept-Runde 4T-002458): Die
// Bedingungen `if-exists "Pfad"`, `if-missing "Pfad"` und
// `if-property "Pfad" name ["Wert"]` und die Schleife `for-each "Ordner/Muster"`
// tragen ihr Schema. Sie bedingen nicht mehr, wie die Konzept-Stufe sie
// beschrieb, «die folgende Zeile», sondern öffnen einen **Block**: `else`
// leitet wahlweise den Teil ein, der gilt, wenn die Bedingung nicht zutrifft,
// `end` schließt den Block. Beide Block-Wörter sind eigene Schlüsselwörter
// ohne Argument und stehen je auf einer eigenen Zeile (G2 bleibt). Mit der
// Stufe 3 in `ENABLED_STAGES` gilt: **Ein Befehl ohne Schema bleibt gesperrt**
// (`script` bis 4T-002465), der Prüfer meldet ihn weiter als spätere Stufe.
//
// **Stufe 3, Skript-Schritt** (4T-002465, Story 4S-001149, Entscheidungen 3h
// und 3n): `script "Abschnitt" as "name"` führt den Skript-Block unter der
// Überschrift «Abschnitt» der Workflow-Datei in der Sandbox der Skript-Blöcke
// aus; das Wortpaar `as "name"` ist eine benannte Option der Gruppe
// `result` und für `script` Pflicht, bei `db-create` wahlfrei (Stufe D),
// bei jedem anderen Befehl ein Befund «unbekannte Option». Das Ergebnis steht danach als `{{script:name}}` in
// jedem folgenden Argument. `if-script "Abschnitt"` ist die vierte Bedingung
// der Block-Form; sie trifft zu, wenn das Skript `true` oder einen nicht
// leeren Text liefert. Beide laufen im Fenster, nie im Hauptprozess.
//
// **Stufe D, Datenbank-Befehle** (4T-002544, Stories 4S-001196 bis
// 4S-001202, Entscheidungen Da, Db, Dc, Dg und Dh der Konzept-Runde
// 4T-002543): Acht der zehn Befehle tragen ihr Schema, `db-export` und
// `db-import` bleiben spätere Ausbaustufe (Dh). Zwei neue Argument-Arten:
// `table` nennt eine Tabelle beim Namen oder als Pfad (Ausführungs-
// Entscheidung 2), `record` einen Datensatz als Kennung oder Anzeige-Form
// (Da). Die Abfrage-Datei ist ein Pfad. `db-create` und `db-update` tragen
// **Paare** `feld="Wert"` (G4) als Pflicht (`pairs: 'required'`); jeder
// andere Befehl kennt keine Paare. `db-query` schreibt mit der neuen Option
// `into "Datei"` (Gruppe `target`, Pflicht) und wahlfrei `under
// "Überschrift"`; `at-start` derselben Gruppe gilt dort nicht, deshalb nennt
// ein Schema mit `options` die zulässigen Options-Wörter ausdrücklich.
// `db-for-each` öffnet wie `for-each` einen Block bis `end` (Dc). Mit der
// Stufe D in `ENABLED_STAGES` ist die Prüfung frei; die Ausführung bauen die
// Folge-Tasks des Epics.
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
const ENABLED_STAGES = Object.freeze([1, 2, 3, 'D']);

/** Die Bedingungen, die einen Block öffnen (3f). */
const CONDITION_KEYWORDS = Object.freeze(['if-exists', 'if-missing', 'if-property', 'if-script']);
/** Der Skript-Schritt und die Bedingung über ein Skript (3h). */
const SCRIPT_KEYWORD = 'script';
const SCRIPT_CONDITION_KEYWORD = 'if-script';
const SCRIPT_KEYWORDS = Object.freeze([SCRIPT_KEYWORD, SCRIPT_CONDITION_KEYWORD]);
/** Die Schleife, die einen Block öffnet (3g). */
const LOOP_KEYWORD = 'for-each';
/** Die Schleife über die Datensätze einer Abfrage (Dc, 4T-002544). */
const DB_LOOP_KEYWORD = 'db-for-each';
/** Beide Schleifen; keine darf in einer Schleife stehen (Dc). */
const LOOP_KEYWORDS = Object.freeze([LOOP_KEYWORD, DB_LOOP_KEYWORD]);
/** Die Datenbank-Befehle der Stufe D mit Schema, in der Reihenfolge des Katalogs. */
const DB_KEYWORDS = Object.freeze([
  'db-create',
  'db-update',
  'db-delete',
  'db-query',
  DB_LOOP_KEYWORD,
  'db-open',
  'db-open-list',
  'db-check',
]);
/** Die Wörter, die einen Block teilen oder schließen. */
const ELSE_KEYWORD = 'else';
const END_KEYWORD = 'end';
/** Alle Block-Wörter, in der Reihenfolge des Katalogs (Hervorhebung, 4T-002464). */
const BLOCK_KEYWORDS = Object.freeze([
  ...CONDITION_KEYWORDS,
  ...LOOP_KEYWORDS,
  ELSE_KEYWORD,
  END_KEYWORD,
]);
/** Größte Tiefe verschachtelter Blöcke, Schleife mitgezählt (3f). */
const MAX_BLOCK_DEPTH = 3;
/** Größte Zahl der Dateien einer Schleife (3g). */
const MAX_LOOP_FILES = 500;

/**
 * Argument-Arten einer Befehls-Zeile.
 * path: Pfad in Anführungszeichen, relativ zur Bereichs-Wurzel.
 * name: neuer Datei-Name in Anführungszeichen, ohne Trennzeichen.
 * text: Text in Anführungszeichen.
 * key: Eigenschafts-Name, als Wort oder in Anführungszeichen.
 * value: Wert in Anführungszeichen oder als Zahl.
 * number: Zahl ohne Anführungszeichen.
 * commandId: Kommando-Kennung ohne Anführungszeichen.
 * pattern: Ordner und Datei-Muster in Anführungszeichen, relativ zur
 *   Bereichs-Wurzel (`for-each`, 4T-002464).
 * table: Tabelle in Anführungszeichen, als Name oder Pfad relativ zur
 *   Bereichs-Wurzel (Stufe D, 4T-002544).
 * record: Datensatz in Anführungszeichen, als Kennung oder Anzeige-Form
 *   (Stufe D, 4T-002544).
 */
const ARG_TYPES = Object.freeze([
  'path',
  'name',
  'text',
  'key',
  'value',
  'number',
  'commandId',
  'pattern',
  'table',
  'record',
]);

// Benannte Optionen (G4): Wortpaar `option "Wert"` oder ein einzelnes Wort.
// `group` ordnet sie einer Options-Gruppe des Befehls zu, `value` ist die Art
// des Werts oder null für ein einzelnes Wort.
const OPTIONS = Object.freeze({
  'from-template': Object.freeze({ group: 'source', kind: 'template', value: 'path' }),
  'from-file': Object.freeze({ group: 'source', kind: 'file', value: 'path' }),
  'from-section': Object.freeze({ group: 'source', kind: 'section', value: 'text' }),
  under: Object.freeze({ group: 'position', kind: 'under', value: 'text' }),
  'at-start': Object.freeze({ group: 'position', kind: 'atStart', value: null }),
  // 4T-002465: Name des Ergebnisses eines Skript-Schritts (3h).
  as: Object.freeze({ group: 'result', kind: 'result', value: 'text' }),
  // 4T-002544: Ziel-Datei von `db-query` (Db).
  into: Object.freeze({ group: 'target', kind: 'into', value: 'path' }),
});

// Positions-Argument; `nonEmpty` verlangt einen nicht leeren Text, `optional`
// erlaubt das Fehlen am Ende der Zeile (der Wert von `if-property`).
function arg(type, nonEmpty = false, optional = false) {
  return Object.freeze({ type, nonEmpty, optional });
}

function stufe(stage, args, groups = {}) {
  return Object.freeze({ stage, args: Object.freeze(args), groups: Object.freeze(groups) });
}

function stufeEins(args, groups = {}) {
  return stufe(1, args, groups);
}

function stufeZwei(args) {
  return stufe(2, args);
}

function stufeDrei(args, groups = {}) {
  return stufe(3, args, groups);
}

// Stufe D (4T-002544): `pairs` ist 'required' oder null, `options` die
// zulässigen Options-Wörter oder null für «alle der Gruppen».
function stufeD(args, { groups = {}, pairs = null, options = null } = {}) {
  return Object.freeze({
    stage: 'D',
    args: Object.freeze(args),
    groups: Object.freeze(groups),
    pairs,
    options: options ? Object.freeze(options) : null,
  });
}

function spaeter(stage) {
  return Object.freeze({ stage, args: null, groups: null });
}

const PATH = arg('path');
const TABLE = arg('table', true);
const RECORD = arg('record', true);

const WORKFLOW_COMMANDS = Object.freeze({
  // Dateien und Ordner
  create: stufeEins([PATH], { source: 'optional' }),
  rename: stufeEins([PATH, arg('name')]),
  move: stufeEins([PATH, PATH]),
  copy: stufeEins([PATH, PATH]),
  mkdir: stufeEins([PATH]),
  open: stufeEins([PATH]),
  close: stufeEins([PATH]),
  delete: stufeZwei([PATH]),
  // Inhalte und Dateikopf
  append: stufeEins([PATH], { source: 'required' }),
  insert: stufeEins([PATH], { position: 'required', source: 'required' }),
  replace: stufeEins([PATH, arg('text', true), arg('text')]),
  'set-property': stufeEins([PATH, arg('key', true), arg('value')]),
  'remove-property': stufeEins([PATH, arg('key', true)]),
  'add-tag': stufeZwei([PATH, arg('text', true)]),
  'remove-tag': stufeZwei([PATH, arg('text', true)]),
  'complete-task': stufeZwei([PATH, arg('text', true)]),
  // Anwendung
  command: stufeEins([arg('commandId')]),
  macro: stufeEins([arg('text', true)]),
  workflow: stufeEins([arg('text', true)]),
  wait: stufeEins([arg('number')]),
  notify: stufeEins([arg('text', true)]),
  confirm: stufeZwei([arg('text', true)]),
  // Ablauf
  stop: stufeEins([arg('text', true)]),
  // Block-Form (3f, 3g): öffnet einen Block bis `end`, Bedingungen mit `else`.
  'if-exists': stufeDrei([PATH]),
  'if-missing': stufeDrei([PATH]),
  'if-property': stufeDrei([PATH, arg('key', true), arg('value', false, true)]),
  'for-each': stufeDrei([arg('pattern', true)]),
  'if-script': stufeDrei([arg('text', true)]),
  else: stufeDrei([]),
  end: stufeDrei([]),
  script: stufeDrei([arg('text', true)], { result: 'required' }),
  // Datenbank (Stufe D)
  'db-create': stufeD([TABLE], { groups: { result: 'optional' }, pairs: 'required' }),
  'db-update': stufeD([TABLE, RECORD], { pairs: 'required' }),
  'db-delete': stufeD([TABLE, RECORD]),
  'db-query': stufeD([PATH], {
    groups: { target: 'required', position: 'optional' },
    options: ['into', 'under'],
  }),
  'db-for-each': stufeD([PATH]),
  'db-open': stufeD([TABLE, arg('record', true, true)]),
  'db-open-list': stufeD([PATH]),
  'db-check': stufeD([arg('table', true, true)]),
  'db-export': spaeter('D'),
  'db-import': spaeter('D'),
});

// Platzhalter der Engine, die in einer Befehls-Zeile nicht gelten (Entscheidung
// der Sitzung vom 2026-10-22, O8): Eine Schreibmarke hat in einer Zeile kein
// Ziel. Die Zwischenablage gehört nach K3 zur Stufe 2 und gilt, sobald diese
// Stufe in `ENABLED_STAGES` steht (4T-002424).
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
 * Stufe eines Platzhalters, dessen Stufe nicht freigegeben ist, sonst null.
 *
 * @param {string} name Name des Platzhalters.
 * @param {Array} [stages] die freigegebenen Stufen, Vorgabe `ENABLED_STAGES`.
 * @returns {number|null}
 */
function laterStagePlaceholder(name, stages = ENABLED_STAGES) {
  if (!hat(LATER_STAGE_PLACEHOLDERS, name)) return null;
  const stufeDesPlatzhalters = LATER_STAGE_PLACEHOLDERS[name];
  return stages.includes(stufeDesPlatzhalters) ? null : stufeDesPlatzhalters;
}

/**
 * Hat der Befehl ein Argument-Schema? Ein Befehl ohne Schema gilt als spätere
 * Stufe, auch wenn seine Stufe freigegeben ist (4T-002464).
 *
 * @param {{args: object[]|null}|null} eintrag aus `lookupCommand`.
 * @returns {boolean}
 */
function hasSchema(eintrag) {
  return !!eintrag && Array.isArray(eintrag.args);
}

module.exports = {
  ARG_TYPES,
  BLOCK_KEYWORDS,
  CONDITION_KEYWORDS,
  DB_KEYWORDS,
  DB_LOOP_KEYWORD,
  ELSE_KEYWORD,
  ENABLED_STAGES,
  END_KEYWORD,
  LOOP_KEYWORD,
  LOOP_KEYWORDS,
  MAX_BLOCK_DEPTH,
  MAX_LOOP_FILES,
  FORBIDDEN_PLACEHOLDER_TYPES,
  LATER_STAGE_PLACEHOLDERS,
  MAX_WAIT_SECONDS: MACRO_MAX_DELAY_SECONDS,
  OPTIONS,
  RESERVED_COMMAND_PREFIXES,
  SCRIPT_CONDITION_KEYWORD,
  SCRIPT_KEYWORD,
  SCRIPT_KEYWORDS,
  WORKFLOW_COMMANDS,
  hasSchema,
  laterStagePlaceholder,
  lookupCommand,
  lookupOption,
  referenceState,
};
