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
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { analyzeTemplate } = require('../template-engine.js');
const {
  ENABLED_STAGES,
  FORBIDDEN_PLACEHOLDER_TYPES,
  MAX_WAIT_SECONDS,
  RESERVED_COMMAND_PREFIXES,
  laterStagePlaceholder,
  lookupCommand,
  lookupOption,
  referenceState,
} = require('./workflow-catalog.js');
const { readBlock } = require('./workflow-line-reader.js');
const { checkAreaPath, checkFileName } = require('./workflow-paths.js');
const { SCHEDULE_TRIGGER } = require('./workflow-schedule.js');

const ZAHL_RE = /^\d+(?:\.\d+)?$/;
const KOMMANDO_RE = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/;
// Ersatz eines Platzhalters für die Vorab-Prüfung eines Pfads: ein harmloser
// Name, damit allein die Literal-Anteile über die Grenze urteilen.
const PLATZHALTER_ERSATZ = 'x';
// Was einen Zuschauer braucht und deshalb nur von Hand läuft.
const NUR_VON_HAND_BEFEHLE = Object.freeze(['confirm', 'delete']);
const NUR_VON_HAND_EINGABEN = Object.freeze(['prompt', 'select']);

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
    return {
      analysis: null,
      problems: [{ code: 'placeholderInvalid', detail: { engine: analysis.error.code } }],
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
  if (typ === 'path') {
    const grenze = checkAreaPath(hatPlatzhalter(analysis) ? pfadProbe(analysis) : token.value);
    if (grenze && !(grenze.code === 'pathEmpty' && hatPlatzhalter(analysis))) {
      melde(grenze.code, token, grenze.kind ? { kind: grenze.kind } : {});
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
  if (!(options.stages || ENABLED_STAGES).includes(eintrag.stage)) {
    melde('laterStage', null, { keyword: anweisung.keyword, stage: eintrag.stage });
    return { step: null, findings };
  }
  const { tokens } = anweisung;
  const args = [];
  let i = 0;
  for (const spec of eintrag.args) {
    const token = tokens[i];
    const option = token && token.type === 'word' ? lookupOption(token.value) : null;
    if (!token || option) {
      melde('missingArgument', token || null, { position: args.length + 1, expected: spec.type });
      break;
    }
    pruefeArgument(spec, token, melde, options);
    if (args.length === 0) pruefeBezug(anweisung.keyword, token, melde, options);
    args.push({ type: spec.type, raw: token.value, form: token.type });
    i++;
  }
  const gruppen = {};
  while (i < tokens.length) {
    const token = tokens[i];
    const option = token.type === 'word' ? lookupOption(token.value) : null;
    if (!option) {
      melde('extraArgument', token);
      i++;
      continue;
    }
    if (!eintrag.groups[option.group]) melde('unknownOption', token, { option: token.value });
    else if (gruppen[option.group]) melde('duplicateOption', token, { option: token.value });
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
  const step = {
    line: anweisung.line,
    blockLine: anweisung.blockLine,
    keyword: anweisung.keyword,
    args,
    source: gruppen.source || null,
    position: gruppen.position || null,
  };
  return { step: findings.length === 0 ? step : null, findings };
}

/**
 * Die Befunde «nur von Hand» einer Anweisung in einem Workflow nach Zeitplan.
 *
 * @param {object} anweisung aus `readBlock`.
 * @returns {object[]} Befunde `manualOnly` mit `armOnly: true`.
 */
function manualOnlyFindings(anweisung) {
  const { findings, melde } = neuerBericht(anweisung);
  if (NUR_VON_HAND_BEFEHLE.includes(anweisung.keyword)) {
    melde('manualOnly', null, { keyword: anweisung.keyword });
  }
  for (const token of anweisung.tokens) {
    if (token.type !== 'string') continue;
    const analysis = analyzeTemplate(token.value);
    if (!analysis.ok) continue; // schon als `placeholderInvalid` gemeldet
    for (const seg of analysis.segments) {
      if (seg.type === 'input' && NUR_VON_HAND_EINGABEN.includes(seg.kind)) {
        melde('manualOnly', token, { placeholder: seg.kind });
      }
    }
  }
  return findings.map((f) => ({ ...f, armOnly: true }));
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
 * @param {{ownName?: string, templatesEnabled?: boolean, stages?: Array,
 *   isKnownCommand?: Function, isKnownMacro?: Function, isKnownWorkflow?: Function}} [options]
 * @returns {{ok: boolean, armable: boolean, steps: object[], findings: object[]}}
 *   `ok` genau dann, wenn kein Befund den Lauf verhindert (`blocksRun`);
 *   `armable` genau dann, wenn der Auslöser `schedule` ist und gar kein Befund
 *   vorliegt; `steps` nur aus fehlerfreien Zeilen.
 */
function checkWorkflow(doc, options = {}) {
  if (!doc || !doc.isWorkflow) return { ok: false, armable: false, steps: [], findings: [] };
  const nachZeitplan = Boolean(doc.meta && doc.meta.trigger === SCHEDULE_TRIGGER);
  const findings = [...doc.findings];
  const steps = [];
  if (doc.block) {
    const gelesen = readBlock(doc.block.lines, doc.block.contentLine);
    findings.push(...gelesen.findings);
    for (const anweisung of gelesen.statements) {
      const ergebnis = checkStatement(anweisung, options);
      findings.push(...ergebnis.findings);
      if (nachZeitplan) findings.push(...manualOnlyFindings(anweisung));
      if (ergebnis.step) steps.push(ergebnis.step);
    }
  }
  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
  const ok = findings.every((f) => !blocksRun(f));
  return { ok, armable: ok && nachZeitplan && findings.length === 0, steps, findings };
}

module.exports = {
  // 4T-002421: ein Lauf nach Zeitplan weist diese Befehle auch in einem
  // aufgerufenen Workflow ab, der selbst von Hand ausgelöst wird.
  MANUAL_ONLY_COMMANDS: NUR_VON_HAND_BEFEHLE,
  blocksRun,
  checkPlaceholders,
  checkStatement,
  checkWorkflow,
  manualOnlyFindings,
};
