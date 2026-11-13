// 4T-002347 (Epic 3E-000184): Der Prüfer der Workflow-Zeilen (G6, «Prüfen vor
// Laufen»).
//
// Vor dem ersten Schritt prüft die Anwendung die ganze Datei; ein Befund
// irgendwo verhindert den ganzen Lauf, damit kein halber Lauf Dateien
// hinterlässt (Story 4S-001101). Geprüft wird, **was ohne Lauf feststeht**:
// Grammatik, Befehle und ihre Stufen, Zahl und Art der Argumente, Optionen,
// Platzhalter und die Bereichs-Grenze der Pfade. **Nicht** geprüft wird die
// Existenz von Dateien und Abschnitten: Ein früherer Schritt desselben Laufs
// kann sie anlegen oder ändern, ihr Fehlen ist deshalb ein Fehlschlag des
// Schritts zur Laufzeit (Entscheidung der Sitzung vom 2026-10-22, O1, nach den
// freigegebenen Stories 4S-001102 und 4S-001103).
//
// **Im Zweifel streng:** Wo die Grammatik eine Schreibweise offen lässt, gilt
// die engere, weil eine spätere Lockerung keine vorhandene Datei bricht, eine
// spätere Verschärfung schon.
//
// **Bekanntheit von Kommando, Makro und Workflow** kennt der Kern nicht; der
// Aufrufer gibt sie als Rückfragen mit, damit die Befunde dennoch vor dem
// ersten Schritt in derselben Liste stehen. Ohne Rückfrage entfällt die
// Prüfung. Argumente mit Platzhaltern prüft `prepareRun` nach dem Füllen.
//
// Befund-Form: `{ code, line, blockLine, column, detail }`; der Kern kennt
// keine Sprache, die Texte entstehen in der Anzeige.
//
// **Befund «nur von Hand» (4T-002419, Story 4S-001130):** Ein Lauf nach
// Zeitplan hat keinen Zuschauer. In einem Workflow mit `trigger: schedule` sind
// deshalb Eingabe-Platzhalter (`{{prompt:…}}`, `{{select:…}}`) und die Befehle
// `confirm` und `delete` ein Befund `manualOnly` (Management-Summary der
// Konzept-Runde 4T-002418, Teil 3, Punkt 3). Er trägt das Kennzeichen
// `armOnly: true`: Er verhindert die Scharf-Schaltung, nicht den Start von
// Hand. `ok` zählt ihn deshalb nicht mit; `armable` sagt, ob sich der
// Workflow scharf schalten lässt (Zeitplan-Auslöser und kein Befund
// irgendeiner Art). Erkannt wird, was in den Befehls-Zeilen steht; Eingaben
// einer mit `from-template` eingesetzten Vorlage kennt erst der Lauf.
//
// **Ereignis (4T-002459, Story 4S-001142):** Ein Lauf nach Ereignis hat
// ebenso keinen Zuschauer; der Befund `manualOnly` gilt bei `trigger: event`
// unverändert (Management-Summary der Konzept-Runde 4T-002458, Teil 3,
// Punkt 4; `delete` ist dort nach D3 ohnehin ausgeschlossen), und `armable`
// kennt beide Auslöser. Dazu meldet der Prüfer jeden Platzhalter, den das
// Ereignis nicht liefert (3l): `{{file}}` bei `area-opened`, `{{from}}` außer
// bei `file-moved`, `{{task}}` außer bei `task-done`, als Befund
// `placeholderNotProvided`. Er verhindert nach der Story Lauf **und**
// Scharf-Schaltung, wie jeder Befund des Ereignisses, und trägt deshalb kein
// `armOnly`. Ob ein Bereich `trigger: event` tatsächlich scharf schaltet,
// entscheiden die Bedienorte und der Hauptprozess (4T-002463).
//
// **Bedingungen und Schleife (4T-002464, Stories 4S-001147 und 4S-001148,
// Entscheidungen 3f und 3g):** Die Paarung der Block-Wörter steht ohne Lauf
// fest und wird deshalb hier geprüft, je mit Zeile: ein Block ohne `end`
// (`blockEndMissing` an der öffnenden Zeile), ein `end` ohne offenen Block
// (`blockEndExtra`), ein `else` ohne offene Bedingung, auch direkt in einer
// Schleife (`elseWithoutCondition`), ein zweites `else` im selben Block
// (`elseDuplicate`), ein Block tiefer als `MAX_BLOCK_DEPTH` (`blockTooDeep`)
// und eine Schleife in einer Schleife (`loopNested`). Dazu die Platzhalter der
// Schleife: `{{item}}` und `{{item:name}}` außerhalb einer Schleife
// (`itemOutsideLoop`), und in der Schleife dort, wo ihr Wert vor dem ersten
// Schritt feststehen muss (`itemNotAllowed`): im Namen eines aufgerufenen
// Workflows oder Makros, weil der Aufruf-Baum vorher vorbereitet wird, im Pfad
// einer Vorlage, weil Vorlagen vorher gelesen werden, und im Ziel von
// `delete`, weil die eine Bestätigung vor dem ersten Schritt alle Ziele nennt
// (Regel P1). Das Muster einer Schleife prüft `parseLoopPattern`
// (`loopPatternInvalid`). **Die Tiefe zählt jeden Block**, die Schleife
// eingeschlossen (im Zweifel streng). Dieselbe Paarung liest der Ablauf-Kern
// über `blockStructure`, damit es keinen zweiten Erkenner gibt.
//
// **Skript-Schritt (4T-002465, Story 4S-001149, Entscheidungen 3h und 3n):**
// `script "Abschnitt" as "name"` und `if-script "Abschnitt"` laufen in der
// Sandbox der Skript-Blöcke und folgen deren Einstellung «Skript-Blöcke
// ausführen». **Die Einstellung ist eine Eingabe des Prüfers**
// (`options.scriptsEnabled`) und fail-closed: Nur ein ausdrückliches `true`
// gibt frei; fehlt die Angabe, meldet der Prüfer an jeder Zeile mit `script`
// oder `if-script` den Befund `scriptsDisabled`, der Lauf **und**
// Scharf-Schaltung verhindert (kein `armOnly`). Die Stelle, die prüft, liefert
// den Wert: das Fenster den Schalter der Skript-Blöcke, der Hauptprozess bei
// der Scharf-Schaltung den gespeicherten Wert. Anders als ein Abschnitt für
// `from-section` steht der Skript-Block **vor dem ersten Schritt** fest: Ein
// Abschnitt, den die Datei nicht hat (`scriptSectionUnknown`), der mehrdeutig
// ist (`scriptSectionAmbiguous`) oder keinen Skript-Block enthält
// (`scriptSectionNoScript`), ist ein Befund, und der Schritt trägt den
// geprüften Quelltext in `script` weiter. Dazu der Name des Ergebnisses: kein
// zulässiger Name (`scriptNameInvalid`), ein zweiter Schritt mit demselben
// Namen (`scriptNameDuplicate`) und `{{script:name}}` in einer Zeile vor dem
// Schritt, der das Ergebnis liefert, oder ohne einen solchen
// (`scriptResultBeforeStep`), und wie bei `{{item}}` dort, wo der Wert vor dem
// ersten Schritt feststehen muss (`scriptResultNotAllowed`). Ein Schritt mit
// `{{script:…}}` wird vor dem Lauf nur zur Probe gefüllt und erst im Lauf
// endgültig (`prepareRun`, Ablauf-Kern).
//
// **Datenbank-Befehle der Stufe D (4T-002544, Entscheidungen Da bis Dg und
// Dm der Konzept-Runde 4T-002543):** Hier stehen allein die Bausteine, die
// jede Zeile betreffen: die Paare `feld="Wert"` (`pairsMissing` bei
// `db-create` und `db-update` ohne Paar, `fieldDuplicate` bei einem Feld
// zweimal in einer Zeile, `extraArgument` bei jedem anderen Befehl), die
// zulässigen Options-Wörter eines Schemas und die Schleife `db-for-each` in
// der Paarung der Blöcke: Sie öffnet einen Block wie `for-each`, keine
// Schleife darf in einer Schleife stehen, gleich welcher Art (Dc), und
// `blockStructure` nennt je Element die Art der umgebenden Schleife
// (`loopKind`), damit `{{item}}` nur in `for-each` und `{{record:…}}` nur
// in `db-for-each` gilt. Die Befunde gegen Tabellen, Felder und
// Abfrage-Dateien prüft `workflow-check-db.js` über die Rückfragen `dbTable`
// und `dbQuery`, dazu den Schalter der Erweiterung «Datenbank».
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { analyzeTemplate, normalizeScriptName } = require('../template-engine.js');
const {
  CONDITION_KEYWORDS,
  ELSE_KEYWORD,
  ENABLED_STAGES,
  END_KEYWORD,
  FORBIDDEN_PLACEHOLDER_TYPES,
  LOOP_KEYWORD,
  LOOP_KEYWORDS,
  MAX_BLOCK_DEPTH,
  MAX_WAIT_SECONDS,
  RESERVED_COMMAND_PREFIXES,
  SCRIPT_KEYWORD,
  SCRIPT_KEYWORDS,
  hasSchema,
  laterStagePlaceholder,
  lookupCommand,
  lookupOption,
  referenceState,
} = require('./workflow-catalog.js');
const { readBlock } = require('./workflow-line-reader.js');
const { scriptBlock } = require('./workflow-document.js');
const { checkAreaPath, checkFileName } = require('./workflow-paths.js');
const { SCHEDULE_TRIGGER } = require('./workflow-schedule.js');
const { EVENT_TRIGGER, eventProvides } = require('./workflow-event.js');
// 4T-002547: `festVorDemLauf` liegt bei den Datenbank-Befunden, die es mitbenutzen.
const { dbFindings, festVorDemLauf } = require('./workflow-check-db.js');

const ZAHL_RE = /^\d+(?:\.\d+)?$/;
const KOMMANDO_RE = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/;
// Ersatz eines Platzhalters für die Vorab-Prüfung eines Pfads: ein harmloser
// Name, damit allein die Literal-Anteile über die Grenze urteilen.
const PLATZHALTER_ERSATZ = 'x';
// Was einen Zuschauer braucht und deshalb nur von Hand läuft; 4T-002545 (D3,
// De): `db-delete` wie `delete`, `db-open`, weil die Maske zurückfragt.
const NUR_VON_HAND_BEFEHLE = Object.freeze(['confirm', 'delete', 'db-delete', 'db-open']);
const NUR_VON_HAND_EINGABEN = Object.freeze(['prompt', 'select']);
// Die Auslöser ohne Zuschauer, die sich scharf schalten lassen.
const UNBEAUFSICHTIGTE_AUSLOESER = Object.freeze([SCHEDULE_TRIGGER, EVENT_TRIGGER]);
// Die Platzhalter der Schleife (Knoten-Namen der Vorlagen-Engine).
const SCHLEIFEN_PLATZHALTER = Object.freeze(['item', 'item:name']);
const MUSTER_TRENNER_RE = /[\\/]/;
const JOKER_RE = /[*?]/;
// Präfix der Knoten-Namen der Skript-Ergebnisse (`{{script:name}}`).
const SKRIPT_PLATZHALTER = 'script:';
// Befund-Codes der Abschnitts-Suche je Code von `scriptBlock`.
const SKRIPT_ABSCHNITT_BEFUNDE = Object.freeze({
  sectionUnknown: 'scriptSectionUnknown',
  sectionAmbiguous: 'scriptSectionAmbiguous',
  noScript: 'scriptSectionNoScript',
});

/**
 * Liest das Muster einer Schleife `for-each` (3g): Ordner, danach wahlweise
 * `**` für «samt Unterordnern», zuletzt das Muster des Datei-Namens mit `*`
 * (beliebig viele Zeichen) und `?` (genau ein Zeichen) wie beim Muster eines
 * Ereignisses. Ein abschließendes `**` steht für «alle Dateien samt
 * Unterordnern». Joker im
 * Ordner-Teil und ein `**` an anderer Stelle sind ungültig (im Zweifel streng).
 *
 * @param {string} text das Muster, gefüllt oder mit Ersatz je Platzhalter.
 * @returns {{ok: true, folder: string, recursive: boolean, name: string}|{ok: false}}
 *   `folder` wurzel-relativ mit `/`, leer für die Wurzel.
 */
function parseLoopPattern(text) {
  const segmente = String(text == null ? '' : text)
    .split(MUSTER_TRENNER_RE)
    .filter((t) => t !== '' && t !== '.');
  if (segmente.length === 0) return { ok: false };
  let name = segmente.pop();
  let recursive = false;
  if (name === '**') {
    recursive = true;
    name = '*';
  } else if (segmente[segmente.length - 1] === '**') {
    segmente.pop();
    recursive = true;
  }
  if (name.trim() === '' || name.includes('**')) return { ok: false };
  if (segmente.some((t) => JOKER_RE.test(t))) return { ok: false };
  return { ok: true, folder: segmente.join('/'), recursive, name };
}

/**
 * Passt ein Datei-Name auf das Namens-Muster einer Schleife? Ohne Rücksicht auf
 * Groß- und Kleinschreibung, wie beim Muster eines Ereignisses.
 *
 * @param {string} muster `name` aus `parseLoopPattern`.
 * @param {string} dateiName Name ohne Ordner.
 * @returns {boolean}
 */
function loopNameMatches(muster, dateiName) {
  const quelle = [...String(muster)]
    .map((z) => {
      if (z === '*') return '.*';
      if (z === '?') return '.';
      return z.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${quelle}$`, 'i').test(String(dateiName));
}

/**
 * Prüft die Platzhalter eines Texts nach G5 und den Regeln der freigegebenen
 * Stufen; `{{clipboard}}` gilt ab der Stufe 2 (4T-002424).
 *
 * @param {string} raw Text mit Platzhaltern.
 * @param {Array} [stages] die freigegebenen Stufen, Vorgabe `ENABLED_STAGES`.
 * @returns {{analysis: object|null, problems: {code: string, detail: object}[]}}
 */
function checkPlaceholders(raw, stages = ENABLED_STAGES) {
  const analysis = analyzeTemplate(raw);
  if (!analysis.ok) {
    // 4T-002544 (Dd): `{{db:…}}` ohne drei Angaben hat einen eigenen Grund.
    const db = analysis.error.code === 'invalidParams' && analysis.error.name === 'db';
    return {
      analysis: null,
      problems: [
        db
          ? { code: 'dbPlaceholderInvalid', detail: { placeholder: 'db' } }
          : { code: 'placeholderInvalid', detail: { engine: analysis.error.code } },
      ],
    };
  }
  const problems = [];
  for (const seg of analysis.segments) {
    if (FORBIDDEN_PLACEHOLDER_TYPES.includes(seg.type)) {
      problems.push({ code: 'placeholderNotAllowed', detail: { placeholder: seg.type } });
    } else if (seg.type === 'context' && laterStagePlaceholder(seg.name, stages) !== null) {
      problems.push({
        code: 'laterStage',
        detail: { placeholder: seg.name, stage: laterStagePlaceholder(seg.name, stages) },
      });
    }
  }
  return { analysis, problems };
}

const hatPlatzhalter = (analysis) => analysis.segments.some((s) => s.type !== 'lit');

// Literal-Anteile eines Pfads mit einem Ersatz je Platzhalter.
function pfadProbe(analysis) {
  return analysis.segments.map((s) => (s.type === 'lit' ? s.text : PLATZHALTER_ERSATZ)).join('');
}

function neuerBericht(anweisung) {
  const findings = [];
  const melde = (code, token, detail = {}) =>
    findings.push({
      code,
      line: anweisung.line,
      blockLine: anweisung.blockLine,
      column: (token ? token.from : anweisung.from) + 1,
      detail,
    });
  return { findings, melde };
}

// Prüft einen Text-Baustein (Text, Pfad, Name, Schlüssel) samt Platzhaltern.
function pruefeText(typ, token, melde, nonEmpty, stages) {
  const { analysis, problems } = checkPlaceholders(token.value, stages || ENABLED_STAGES);
  for (const p of problems) melde(p.code, token, p.detail);
  if (!analysis) return;
  if (typ === 'path' || typ === 'pattern') {
    const probe = hatPlatzhalter(analysis) ? pfadProbe(analysis) : token.value;
    const grenze = checkAreaPath(probe);
    if (grenze && !(grenze.code === 'pathEmpty' && hatPlatzhalter(analysis))) {
      melde(grenze.code, token, grenze.kind ? { kind: grenze.kind } : {});
    } else if (typ === 'pattern' && !parseLoopPattern(probe).ok) {
      melde('loopPatternInvalid', token, { pattern: token.value });
    }
  } else if (typ === 'name' && !hatPlatzhalter(analysis)) {
    const name = checkFileName(token.value);
    if (name) melde(name.code, token);
  } else if (nonEmpty && token.value.trim() === '') {
    melde('textEmpty', token);
  }
}

// Prüft einen Baustein gegen die Argument-Art; liefert false bei falscher Art.
function pruefeArgument(spec, token, melde, options) {
  const { type } = spec;
  if (type === 'number') {
    if (token.type !== 'word' || !ZAHL_RE.test(token.value)) melde('invalidNumber', token);
    else if (Number(token.value) > MAX_WAIT_SECONDS) {
      melde('valueOutOfRange', token, { max: MAX_WAIT_SECONDS });
    }
    return true;
  }
  if (type === 'commandId') {
    if (token.type !== 'word' || !KOMMANDO_RE.test(token.value)) melde('commandIdInvalid', token);
    else if (RESERVED_COMMAND_PREFIXES.some((p) => token.value.startsWith(p))) {
      melde('commandReserved', token);
    } else if (
      typeof options.isKnownCommand === 'function' &&
      !options.isKnownCommand(token.value)
    ) {
      melde('commandUnknown', token, { command: token.value });
    }
    return true;
  }
  const wortErlaubt = type === 'key' || (type === 'value' && ZAHL_RE.test(token.value));
  if (token.type === 'string' || (token.type === 'word' && wortErlaubt)) {
    if (token.type === 'string' || type === 'key') {
      pruefeText(type, token, melde, spec.nonEmpty, options.stages);
    }
    return true;
  }
  melde('argumentType', token, { expected: type });
  return false;
}

// Rückfragen und Selbstaufruf für `macro` und `workflow` (Argument ohne
// Platzhalter; mit Platzhaltern folgt die Prüfung in prepareRun).
function pruefeBezug(keyword, token, melde, options) {
  if (token.type !== 'string' || /\{\{/.test(token.value)) return;
  const name = token.value.trim();
  if (keyword === 'workflow' && options.ownName && name === options.ownName) {
    melde('selfCall', token);
    return;
  }
  if (keyword !== 'workflow' && keyword !== 'macro') return;
  const lage = referenceState(
    keyword === 'workflow' ? options.isKnownWorkflow : options.isKnownMacro,
    name,
  );
  if (lage === 'unknown') melde(`${keyword}Unknown`, token, { name });
  else if (lage === 'ambiguous') melde(`${keyword}Ambiguous`, token, { name });
}

// Nimmt ein Paar `feld="Wert"` auf (G4, 4T-002544): ein Feld zweimal in einer
// Zeile ist `fieldDuplicate` (ohne Rücksicht auf die Schreibung, wie die
// Definition doppelte Felder erkennt); der Wert ist Text (Ausführungs-
// Entscheidung 6) und darf Platzhalter tragen.
function paarAufnehmen(token, pairs, melde, stages) {
  const name = token.key.trim();
  if (pairs.some((p) => p.key.toLowerCase() === name.toLowerCase())) {
    melde('fieldDuplicate', token, { field: name });
  }
  pruefeText('text', token, melde, false, stages);
  pairs.push({ key: name, raw: token.value });
}

/**
 * Prüft eine gelesene Anweisung gegen den Katalog.
 *
 * @param {object} anweisung aus `readBlock`.
 * @param {object} options siehe `checkWorkflow`.
 * @returns {{step: object|null, findings: object[]}}
 */
function checkStatement(anweisung, options) {
  const { findings, melde } = neuerBericht(anweisung);
  const eintrag = lookupCommand(anweisung.keyword);
  if (!eintrag) {
    melde('unknownCommand', null, { keyword: anweisung.keyword });
    return { step: null, findings };
  }
  if (!hasSchema(eintrag) || !(options.stages || ENABLED_STAGES).includes(eintrag.stage)) {
    melde('laterStage', null, { keyword: anweisung.keyword, stage: eintrag.stage });
    return { step: null, findings };
  }
  const { tokens } = anweisung;
  const args = [];
  let i = 0;
  for (const spec of eintrag.args) {
    const token = tokens[i];
    const option = token && token.type === 'word' ? lookupOption(token.value) : null;
    if (!token || option || (token.type === 'pair' && eintrag.pairs)) {
      if (spec.optional) break;
      melde('missingArgument', token || null, { position: args.length + 1, expected: spec.type });
      break;
    }
    pruefeArgument(spec, token, melde, options);
    if (args.length === 0) pruefeBezug(anweisung.keyword, token, melde, options);
    args.push({ type: spec.type, raw: token.value, form: token.type });
    i++;
  }
  const gruppen = {};
  const pairs = [];
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === 'pair' && eintrag.pairs) {
      paarAufnehmen(token, pairs, melde, options.stages);
      i++;
      continue;
    }
    const option = token.type === 'word' ? lookupOption(token.value) : null;
    if (!option) {
      melde('extraArgument', token);
      i++;
      continue;
    }
    const zulaessig = !eintrag.options || eintrag.options.includes(token.value);
    if (!eintrag.groups[option.group] || !zulaessig) {
      melde('unknownOption', token, { option: token.value });
    } else if (gruppen[option.group]) melde('duplicateOption', token, { option: token.value });
    const wert = option.value ? tokens[i + 1] : null;
    if (option.value && (!wert || wert.type !== 'string')) {
      melde('missingArgument', wert || token, { option: token.value, expected: option.value });
      i += wert && wert.type !== 'word' ? 2 : 1;
      continue;
    }
    if (wert) pruefeText(option.value, wert, melde, true, options.stages);
    if (option.kind === 'template' && options.templatesEnabled === false)
      melde('templatesDisabled', token);
    if (eintrag.groups[option.group] && !gruppen[option.group]) {
      gruppen[option.group] = wert ? { kind: option.kind, raw: wert.value } : { kind: option.kind };
    }
    i += wert ? 2 : 1;
  }
  for (const [gruppe, pflicht] of Object.entries(eintrag.groups)) {
    if (pflicht === 'required' && !gruppen[gruppe]) melde('missingOption', null, { group: gruppe });
  }
  if (eintrag.pairs === 'required' && pairs.length === 0) melde('pairsMissing', null);
  const step = {
    line: anweisung.line,
    blockLine: anweisung.blockLine,
    keyword: anweisung.keyword,
    args,
    source: gruppen.source || null,
    position: gruppen.position || null,
  };
  // 4T-002544: Paare und Ziel der Datenbank-Befehle, nur wo das Schema sie kennt.
  if (eintrag.pairs) step.pairs = pairs;
  if (eintrag.groups.target) step.target = gruppen.target || null;
  // 4T-002545: der Name hinter `as` von `db-create` für `{{created:…}}` (Da).
  if (eintrag.pairs && gruppen.result) step.result = normalizeScriptName(gruppen.result.raw);
  return { step: findings.length === 0 ? step : null, findings };
}

// Der Wert-Baustein hinter der Option `as` einer Anweisung, sonst null.
function ergebnisBaustein(anweisung) {
  const i = anweisung.tokens.findIndex((t) => t.type === 'word' && t.value === 'as');
  const wert = i >= 0 ? anweisung.tokens[i + 1] : null;
  return wert && wert.type === 'string' ? wert : null;
}

// Die Befunde einer Zeile mit `script` oder `if-script`; ergänzt den
// geprüften Schritt um Quelltext und Namen des Ergebnisses.
function skriptZeile(anweisung, schritt, text, options, geliefert, melde) {
  if (options.scriptsEnabled !== true) melde('scriptsDisabled', null);
  const abschnitt = anweisung.tokens[0];
  if (abschnitt && abschnitt.type === 'string' && abschnitt.value.trim() !== '') {
    const block = scriptBlock(text, abschnitt.value);
    if (!block.ok) {
      melde(SKRIPT_ABSCHNITT_BEFUNDE[block.code], abschnitt, { section: abschnitt.value });
    } else if (schritt) {
      schritt.script = block.source;
    }
  }
  if (anweisung.keyword !== SCRIPT_KEYWORD) return;
  const wert = ergebnisBaustein(anweisung);
  const name = wert ? normalizeScriptName(wert.value) : null;
  if (wert && name === null) melde('scriptNameInvalid', wert, { name: wert.value });
  else if (name !== null && geliefert.has(name)) {
    melde('scriptNameDuplicate', wert, { name: wert.value });
  }
  if (name === null) return;
  geliefert.add(name);
  if (schritt) schritt.result = name;
}

/**
 * Die Befunde des Skript-Schritts (4T-002465) über alle Anweisungen einer
 * Datei; ergänzt die geprüften Schritte um den Quelltext (`script`) und den
 * normierten Namen des Ergebnisses (`result`).
 *
 * @param {object[]} anweisungen aus `readBlock`, in Lese-Reihenfolge.
 * @param {(object|null)[]} schritte je Anweisung der Schritt aus
 *   `checkStatement` oder null.
 * @param {string} text Inhalt der Workflow-Datei (`doc.source`).
 * @param {{scriptsEnabled?: boolean}} options
 * @returns {object[]} Befunde.
 */
function scriptFindings(anweisungen, schritte, text, options = {}) {
  const alle = [];
  const geliefert = new Set();
  anweisungen.forEach((anweisung, index) => {
    const { findings, melde } = neuerBericht(anweisung);
    for (const { token, analysis } of textAnalysen(anweisung)) {
      for (const seg of analysis.segments) {
        if (seg.type !== 'context' || !seg.name.startsWith(SKRIPT_PLATZHALTER)) continue;
        const name = seg.name.slice(SKRIPT_PLATZHALTER.length);
        if (!geliefert.has(name)) melde('scriptResultBeforeStep', token, { name });
        const fest = festVorDemLauf(anweisung, token);
        if (fest) melde('scriptResultNotAllowed', token, { name, ...fest });
      }
    }
    if (SCRIPT_KEYWORDS.includes(anweisung.keyword)) {
      skriptZeile(anweisung, schritte[index], text, options, geliefert, melde);
    }
    alle.push(...findings);
  });
  return alle;
}

// Die Platzhalter-Analysen der Texte einer Anweisung, mit ihrem Baustein.
// Seit 4T-002544 auch die Werte der Paare `feld="Wert"`.
function textAnalysen(anweisung) {
  const analysen = [];
  for (const token of anweisung.tokens) {
    if (token.type !== 'string' && token.type !== 'pair') continue;
    const analysis = analyzeTemplate(token.value);
    if (analysis.ok) analysen.push({ token, analysis }); // sonst `placeholderInvalid`
  }
  return analysen;
}

/**
 * Die Befunde «nur von Hand» einer Anweisung in einem Workflow nach Zeitplan
 * oder Ereignis.
 *
 * @param {object} anweisung aus `readBlock`.
 * @returns {object[]} Befunde `manualOnly` mit `armOnly: true`.
 */
function manualOnlyFindings(anweisung) {
  const { findings, melde } = neuerBericht(anweisung);
  if (NUR_VON_HAND_BEFEHLE.includes(anweisung.keyword)) {
    melde('manualOnly', null, { keyword: anweisung.keyword });
  }
  for (const { token, analysis } of textAnalysen(anweisung)) {
    for (const seg of analysis.segments) {
      if (seg.type === 'input' && NUR_VON_HAND_EINGABEN.includes(seg.kind)) {
        melde('manualOnly', token, { placeholder: seg.kind });
      }
    }
  }
  return findings.map((f) => ({ ...f, armOnly: true }));
}

/**
 * Die Platzhalter einer Anweisung, die das Ereignis nicht liefert (3l).
 *
 * @param {object} anweisung aus `readBlock`.
 * @param {string} event Ereignis der Regel (`meta.event.event`).
 * @returns {object[]} Befunde `placeholderNotProvided`; sie verhindern den Lauf.
 */
function eventPlaceholderFindings(anweisung, event) {
  const { findings, melde } = neuerBericht(anweisung);
  for (const { token, analysis } of textAnalysen(anweisung)) {
    for (const seg of analysis.segments) {
      if (seg.type === 'context' && !eventProvides(event, seg.name)) {
        melde('placeholderNotProvided', token, { placeholder: seg.name, event });
      }
    }
  }
  return findings;
}

/**
 * Die Paarung der Block-Wörter (3f, 3g) über Anweisungen oder Schritte.
 *
 * @param {{keyword: string, line: number, blockLine?: number, from?: number}[]} items
 *   in Lese-Reihenfolge, aus `readBlock` oder `checkWorkflow`.
 * @returns {{findings: object[], blocks: Object<number, {else: (number|null),
 *   end: (number|null), loop: boolean}>, inLoop: boolean[], loopKind:
 *   (string|null)[], loopOf: (number|null)[]}} `blocks` je Index eines
 *   öffnenden Worts; `inLoop` je Index, ob das Element in einer Schleife
 *   steht (die Zeilen der Schleife und ihr `end` selbst nicht); `loopKind`
 *   je Index das Schlüsselwort dieser Schleife (`for-each` oder
 *   `db-for-each`, 4T-002544) oder null, `loopOf` den Index ihrer Zeile.
 */
function blockStructure(items) {
  const findings = [];
  const blocks = {};
  const inLoop = [];
  const loopKind = [];
  const loopOf = [];
  const stapel = [];
  const merkeSchleife = (index) => {
    const schleife = stapel.find((b) => b.loop);
    loopKind[index] = schleife ? schleife.item.keyword : null;
    loopOf[index] = schleife ? schleife.index : null;
  };
  const melde = (item, code, detail = {}) =>
    findings.push({
      code,
      line: item.line,
      blockLine: item.blockLine,
      column: (typeof item.from === 'number' ? item.from : 0) + 1,
      detail,
    });
  (items || []).forEach((item, index) => {
    const kw = item.keyword;
    const inSchleife = stapel.some((b) => b.loop);
    merkeSchleife(index);
    if (CONDITION_KEYWORDS.includes(kw) || LOOP_KEYWORDS.includes(kw)) {
      inLoop[index] = inSchleife;
      const loop = LOOP_KEYWORDS.includes(kw);
      if (loop && inSchleife) melde(item, 'loopNested');
      if (stapel.length >= MAX_BLOCK_DEPTH) {
        melde(item, 'blockTooDeep', { keyword: kw, max: MAX_BLOCK_DEPTH });
      }
      blocks[index] = { else: null, end: null, loop };
      stapel.push({ index, item, loop });
      return;
    }
    if (kw === END_KEYWORD) {
      const oben = stapel.pop();
      if (!oben) melde(item, 'blockEndExtra');
      else blocks[oben.index].end = index;
      inLoop[index] = stapel.some((b) => b.loop);
      merkeSchleife(index);
      return;
    }
    inLoop[index] = inSchleife;
    if (kw !== ELSE_KEYWORD) return;
    const oben = stapel[stapel.length - 1];
    if (!oben || oben.loop) melde(item, 'elseWithoutCondition');
    else if (blocks[oben.index].else !== null) melde(item, 'elseDuplicate');
    else blocks[oben.index].else = index;
  });
  for (const offen of stapel) {
    melde(offen.item, 'blockEndMissing', { keyword: offen.item.keyword });
  }
  return { findings, blocks, inLoop, loopKind, loopOf };
}

// Die Platzhalter der Schleife in einer Analyse.
function schleifenPlatzhalter(analysis) {
  return analysis.segments.filter(
    (seg) => seg.type === 'context' && SCHLEIFEN_PLATZHALTER.includes(seg.name),
  );
}

/**
 * Trägt der Text einen Platzhalter eines Skript-Ergebnisses (`{{script:name}}`,
 * 4T-002465)?
 *
 * @param {string} raw Text mit Platzhaltern.
 * @returns {boolean}
 */
function hasScriptPlaceholder(raw) {
  const analysis = analyzeTemplate(String(raw == null ? '' : raw));
  return (
    analysis.ok &&
    analysis.segments.some((s) => s.type === 'context' && s.name.startsWith(SKRIPT_PLATZHALTER))
  );
}

/**
 * Trägt der Text einen Platzhalter der Schleife (`{{item}}`, `{{item:name}}`)?
 *
 * @param {string} raw Text mit Platzhaltern.
 * @returns {boolean}
 */
function hasLoopPlaceholder(raw) {
  const analysis = analyzeTemplate(String(raw == null ? '' : raw));
  return analysis.ok && schleifenPlatzhalter(analysis).length > 0;
}

/**
 * Die Befunde der Schleifen-Platzhalter einer Anweisung.
 *
 * @param {object} anweisung aus `readBlock`.
 * @param {boolean} inSchleife steht die Anweisung in einer Schleife?
 * @returns {object[]} `itemOutsideLoop` oder `itemNotAllowed`.
 */
function loopPlaceholderFindings(anweisung, inSchleife) {
  const { findings, melde } = neuerBericht(anweisung);
  for (const { token, analysis } of textAnalysen(anweisung)) {
    const treffer = schleifenPlatzhalter(analysis);
    if (treffer.length === 0) continue;
    if (!inSchleife) {
      for (const seg of treffer) melde('itemOutsideLoop', token, { placeholder: seg.name });
      continue;
    }
    const fest = festVorDemLauf(anweisung, token);
    if (fest) melde('itemNotAllowed', token, fest);
  }
  return findings;
}

/**
 * Verhindert der Befund den Lauf? Ein Befund «nur von Hand» verhindert allein
 * die Scharf-Schaltung.
 *
 * @param {{armOnly?: boolean}} finding
 * @returns {boolean}
 */
function blocksRun(finding) {
  return finding.armOnly !== true;
}

/**
 * Prüft eine gelesene Workflow-Datei vor dem Lauf.
 *
 * @param {object} doc Ergebnis von `readWorkflowDocument`.
 * @param {{ownName?: string, templatesEnabled?: boolean, scriptsEnabled?: boolean,
 *   databaseEnabled?: boolean, stages?: Array, isKnownCommand?: Function,
 *   isKnownMacro?: Function, isKnownWorkflow?: Function, dbTable?: Function,
 *   dbQuery?: Function}} [options] `scriptsEnabled` ist die
 *   Einstellung «Skript-Blöcke ausführen»; nur `true` gibt `script` und
 *   `if-script` frei (4T-002465). `databaseEnabled`, `dbTable` und
 *   `dbQuery` siehe `workflow-check-db.js` (4T-002544).
 * @returns {{ok: boolean, armable: boolean, steps: object[], findings: object[]}}
 *   `ok` genau dann, wenn kein Befund den Lauf verhindert (`blocksRun`);
 *   `armable` genau dann, wenn der Auslöser `schedule` oder `event` ist und gar
 *   kein Befund vorliegt; `steps` nur aus fehlerfreien Zeilen.
 */
function checkWorkflow(doc, options = {}) {
  if (!doc || !doc.isWorkflow) return { ok: false, armable: false, steps: [], findings: [] };
  const ausloeser = doc.meta ? doc.meta.trigger : null;
  const unbeaufsichtigt = UNBEAUFSICHTIGTE_AUSLOESER.includes(ausloeser);
  const ereignis = ausloeser === EVENT_TRIGGER && doc.meta.event ? doc.meta.event.event : null;
  const findings = [...doc.findings];
  const steps = [];
  if (doc.block) {
    const gelesen = readBlock(doc.block.lines, doc.block.contentLine);
    findings.push(...gelesen.findings);
    const struktur = blockStructure(gelesen.statements);
    findings.push(...struktur.findings);
    const schritte = [];
    gelesen.statements.forEach((anweisung, index) => {
      const ergebnis = checkStatement(anweisung, options);
      findings.push(...ergebnis.findings);
      // 4T-002544: `{{item}}` gilt nur in `for-each`, nicht in `db-for-each`.
      findings.push(
        ...loopPlaceholderFindings(anweisung, struktur.loopKind[index] === LOOP_KEYWORD),
      );
      if (unbeaufsichtigt) findings.push(...manualOnlyFindings(anweisung));
      if (ereignis) findings.push(...eventPlaceholderFindings(anweisung, ereignis));
      schritte.push(ergebnis.step);
      if (ergebnis.step) steps.push(ergebnis.step);
    });
    findings.push(...scriptFindings(gelesen.statements, schritte, doc.source, options));
    findings.push(...dbFindings(gelesen.statements, struktur, options));
  }
  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
  const ok = findings.every((f) => !blocksRun(f));
  return { ok, armable: ok && unbeaufsichtigt && findings.length === 0, steps, findings };
}

module.exports = {
  // 4T-002421: ein Lauf nach Zeitplan weist diese Befehle auch in einem
  // aufgerufenen Workflow ab, der selbst von Hand ausgelöst wird.
  MANUAL_ONLY_COMMANDS: NUR_VON_HAND_BEFEHLE,
  blockStructure,
  blocksRun,
  checkPlaceholders,
  checkStatement,
  checkWorkflow,
  eventPlaceholderFindings,
  hasLoopPlaceholder,
  hasScriptPlaceholder,
  loopNameMatches,
  loopPlaceholderFindings,
  manualOnlyFindings,
  parseLoopPattern,
  scriptFindings,
};
