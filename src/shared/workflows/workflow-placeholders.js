// 4T-002347 (Epic 3E-000184): Platzhalter der Workflows (G5, S-a, S-b).
//
// Platzhalter gelten in jedem Text-Argument und werden mit der Vorlagen-Engine
// gefüllt (K6: ein Satz für Vorlagen und Workflows). Alle Eingabe-Dialoge eines
// Laufs werden **vor dem ersten Schritt** erhoben; ein Abbruch lässt keinen
// Schritt laufen. Die Abfolge für den Start (4T-002349):
//
//   1. `workflowInputs` — die Eingaben der Befehls-Zeilen.
//   2. Dialog-Kette des Bestands (`collectAnswers`).
//   3. `templateRefs` — die Pfade hinter `from-template`, gefüllt, weil sie
//      selbst Platzhalter tragen dürfen.
//   4. Der Aufrufer liest die Vorlagen.
//   5. `templateInputs` — die noch nicht beantworteten Eingaben der Vorlagen
//      (S-a), danach erneut die Dialog-Kette.
//   6. `prepareRun` — alle Schritte gefüllt und erneut geprüft.
//
// **S-b, Bedeutung von `{{title}}` und `{{folder}}`:** In einer Befehls-Zeile
// meinen sie das aktive Dokument (Kontext des Aufrufers), in einer eingesetzten
// Vorlage die Ziel-Datei des Schritts wie im Bestand der Vorlagen; `{{file}}`
// und `{{area}}` bleiben in beiden das aktive Dokument und der Bereich.
//
// **Wörtliche Quellen** (Entscheidung der Sitzung vom 2026-10-22, O2): Allein
// `from-template` füllt Platzhalter, das ist der Sinn einer Vorlage.
// `from-section` und `from-file` übernehmen ihren Inhalt wörtlich und werden
// erst beim Schritt gelesen (O1), weil ein früherer Schritt sie ändern kann.
//
// **Ein Zeitpunkt je Lauf:** Der Aufrufer gibt `nowMs` einmal mit, damit Datums-
// Platzhalter in mehreren Zeilen nicht um Mitternacht verschiedene Tage nennen.
//
// **Ein leerer Platzhalter am Pfad-Anfang hinterlässt keinen Trenner:**
// `"{{folder}}/Neu.md"` ergibt im Wurzel-Ordner `Neu.md` und nicht `/Neu.md`,
// das als absoluter Pfad abgewiesen würde. Ein Schrägstrich, der im Text selbst
// am Anfang steht, bleibt und wird abgewiesen.
//
// Alle Ergebnisse sind als JSON übertragbar; sie gehen an den Hauptprozess.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { analyzeTemplate, fillTemplate } = require('../template-engine.js');
const { MD_EXT_RE } = require('../markdown/link-scan.js');
const { toLogicalName } = require('../subpages.js');
const { checkAreaPath, checkFileName } = require('./workflow-paths.js');
const { referenceState } = require('./workflow-catalog.js');

const TEXT_ARTEN = new Set(['path', 'name', 'text', 'key', 'value']);

function befund(step, code, detail = {}) {
  return { code, line: step.line, blockLine: step.blockLine, column: null, detail };
}

// Die Texte eines Schritts mit Platzhaltern, in Lese-Reihenfolge.
function texteDes(step) {
  const texte = step.args
    .filter((a) => TEXT_ARTEN.has(a.type) && a.form !== 'word')
    .map((a) => a.raw);
  if (step.source && step.source.raw !== undefined) texte.push(step.source.raw);
  if (step.position && step.position.raw !== undefined) texte.push(step.position.raw);
  return texte;
}

// Eingaben einer Analyse ohne die bereits bekannten Schlüssel.
function neueEingaben(analysis, bekannt, hinein) {
  for (const input of analysis.inputs) {
    if (bekannt.has(input.key)) continue;
    bekannt.add(input.key);
    hinein.push(input);
  }
}

/**
 * Die Eingabe-Dialoge der Befehls-Zeilen, im Format der Vorlagen-Engine,
 * entdoppelt und in Reihenfolge des ersten Vorkommens.
 *
 * @param {object[]} steps geprüfte Schritte aus `checkWorkflow`.
 * @returns {object[]} Eingaben `{ key, kind, question, defaultValue|options }`.
 */
function workflowInputs(steps) {
  const bekannt = new Set();
  const inputs = [];
  for (const step of steps || []) {
    for (const raw of texteDes(step)) {
      const analysis = analyzeTemplate(raw);
      if (analysis.ok) neueEingaben(analysis, bekannt, inputs);
    }
  }
  return inputs;
}

function fuelle(raw, kontext, answers) {
  const analysis = analyzeTemplate(raw);
  if (!analysis.ok) return { ok: false, engine: analysis.error.code };
  const gefuellt = fillTemplate(analysis, { ...kontext, answers: answers || {} });
  return gefuellt.ok
    ? { ok: true, text: gefuellt.text }
    : { ok: false, engine: gefuellt.error.code };
}

// Wie `fuelle`, ohne führenden Trenner hinter leeren Platzhaltern am Anfang;
// Rückstriche werden zu Schrägstrichen.
function fuellePfad(raw, kontext, answers) {
  const analysis = analyzeTemplate(raw);
  if (!analysis.ok) return { ok: false, engine: analysis.error.code };
  const erstesLiteral = analysis.segments.findIndex((s) => s.type === 'lit');
  let segments = analysis.segments;
  if (erstesLiteral > 0) {
    const davor = fillTemplate(
      { ok: true, segments: segments.slice(0, erstesLiteral) },
      { ...kontext, answers: answers || {} },
    );
    if (davor.ok && davor.text === '') {
      const lit = segments[erstesLiteral];
      segments = [...segments];
      segments[erstesLiteral] = { ...lit, text: lit.text.replace(/^[\\/]+/, '') };
    }
  }
  const gefuellt = fillTemplate({ ok: true, segments }, { ...kontext, answers: answers || {} });
  if (!gefuellt.ok) return { ok: false, engine: gefuellt.error.code };
  return { ok: true, text: gefuellt.text.replace(/\\/g, '/') };
}

// Füllt einen Pfad und prüft ihn auf die Bereichs-Grenze.
function pfadWert(step, raw, kontext, answers, findings) {
  const gefuellt = fuellePfad(raw, kontext, answers);
  if (!gefuellt.ok) {
    findings.push(befund(step, 'placeholderInvalid', { engine: gefuellt.engine }));
    return null;
  }
  const grenze = checkAreaPath(gefuellt.text);
  if (grenze) {
    findings.push(
      befund(step, grenze.code, grenze.kind ? { kind: grenze.kind, path: gefuellt.text } : {}),
    );
    return null;
  }
  return gefuellt.text;
}

/**
 * Die Vorlagen hinter `from-template`, mit gefülltem und geprüftem Pfad.
 *
 * @param {object[]} steps geprüfte Schritte.
 * @param {object} context Kontext des aktiven Dokuments (`file`, `title`,
 *   `folder`, `area`, `nowMs`, `locale`).
 * @param {object} answers Antworten der Dialog-Kette.
 * @returns {{refs: {line: number, blockLine: number, path: string}[], findings: object[]}}
 */
function templateRefs(steps, context, answers) {
  const refs = [];
  const findings = [];
  for (const step of steps || []) {
    if (!step.source || step.source.kind !== 'template') continue;
    const pfad = pfadWert(step, step.source.raw, context, answers, findings);
    if (pfad !== null) refs.push({ line: step.line, blockLine: step.blockLine, path: pfad });
  }
  return { refs, findings };
}

const hat = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/**
 * Die noch nicht beantworteten Eingaben der eingesetzten Vorlagen (S-a).
 *
 * @param {object[]} refs aus `templateRefs`.
 * @param {object} templates Pfad → Text der Vorlage, `null` für «nicht lesbar».
 * @param {object} answers bereits erhobene Antworten.
 * @returns {{inputs: object[], findings: object[]}}
 */
function templateInputs(refs, templates, answers) {
  const bekannt = new Set(Object.keys(answers || {}));
  const inputs = [];
  const findings = [];
  for (const ref of refs || []) {
    const text = hat(templates, ref.path) ? templates[ref.path] : null;
    if (typeof text !== 'string') {
      findings.push(befund(ref, 'templateUnreadable', { path: ref.path }));
      continue;
    }
    const analysis = analyzeTemplate(text);
    if (!analysis.ok) {
      findings.push(
        befund(ref, 'templateInvalid', { path: ref.path, engine: analysis.error.code }),
      );
      continue;
    }
    neueEingaben(analysis, bekannt, inputs);
  }
  return { inputs, findings };
}

// Kontext einer Ziel-Datei für das Füllen einer Vorlage (S-b), wie im Bestand
// der Vorlagen: logischer Titel ohne Endung, Ordner wurzel-relativ.
function zielKontext(context, zielPfad) {
  const schnitt = zielPfad.lastIndexOf('/');
  const basis = zielPfad.slice(schnitt + 1).replace(MD_EXT_RE, '');
  return {
    ...context,
    title: toLogicalName(basis),
    folder: schnitt >= 0 ? zielPfad.slice(0, schnitt) : '',
  };
}

function argumentWert(step, arg, context, answers, findings) {
  if (arg.type === 'number') return Number(arg.raw);
  if (arg.type === 'commandId') return arg.raw;
  if (arg.form === 'word') return arg.type === 'value' ? Number(arg.raw) : arg.raw;
  if (arg.type === 'path') return pfadWert(step, arg.raw, context, answers, findings);
  const gefuellt = fuelle(arg.raw, context, answers);
  if (!gefuellt.ok) {
    findings.push(befund(step, 'placeholderInvalid', { engine: gefuellt.engine }));
    return null;
  }
  if (arg.type === 'name') {
    const name = checkFileName(gefuellt.text);
    if (name) findings.push(befund(step, name.code));
  }
  return gefuellt.text;
}

function quelleWert(step, args, context, answers, templates, findings) {
  const { source } = step;
  if (!source) return null;
  if (source.kind === 'section') {
    const name = fuelle(source.raw, context, answers);
    if (name.ok) return { kind: 'section', name: name.text };
    findings.push(befund(step, 'placeholderInvalid', { engine: name.engine }));
    return null;
  }
  const pfad = pfadWert(step, source.raw, context, answers, findings);
  if (pfad === null) return null;
  if (source.kind === 'file') return { kind: 'file', path: pfad };
  const text = hat(templates, pfad) ? templates[pfad] : null;
  if (typeof text !== 'string') {
    findings.push(befund(step, 'templateUnreadable', { path: pfad }));
    return null;
  }
  const ziel = typeof args[0] === 'string' ? args[0] : '';
  const gefuellt = fuelle(text, zielKontext(context, ziel), answers);
  if (!gefuellt.ok) {
    findings.push(befund(step, 'templateInvalid', { path: pfad, engine: gefuellt.engine }));
    return null;
  }
  return { kind: 'template', path: pfad, text: gefuellt.text };
}

function bezugPruefen(step, args, options, findings) {
  const name = typeof args[0] === 'string' ? args[0].trim() : '';
  const { keyword } = step;
  if (keyword === 'workflow' && options.ownName && name === options.ownName) {
    findings.push(befund(step, 'selfCall'));
    return;
  }
  if (keyword !== 'workflow' && keyword !== 'macro') return;
  const lage = referenceState(
    keyword === 'workflow' ? options.isKnownWorkflow : options.isKnownMacro,
    name,
  );
  if (lage === 'unknown') findings.push(befund(step, `${keyword}Unknown`, { name }));
  else if (lage === 'ambiguous') findings.push(befund(step, `${keyword}Ambiguous`, { name }));
}

/**
 * Füllt alle Schritte und prüft sie erneut, vor dem ersten Schritt.
 *
 * @param {object[]} steps geprüfte Schritte aus `checkWorkflow`.
 * @param {object} context Kontext des aktiven Dokuments, mit einem `nowMs` je Lauf.
 * @param {object} answers alle Antworten der Dialog-Kette.
 * @param {object} templates Pfad → Text der Vorlagen aus `templateRefs`.
 * @param {{ownName?: string, isKnownMacro?: Function, isKnownWorkflow?: Function}} [options]
 * @returns {{ok: boolean, steps: object[], findings: object[]}} Schritte je
 *   `{ line, blockLine, keyword, args, source, position }`.
 */
function prepareRun(steps, context, answers, templates, options = {}) {
  const findings = [];
  const fertig = [];
  for (const step of steps || []) {
    const args = step.args.map((a) => argumentWert(step, a, context, answers, findings));
    bezugPruefen(step, args, options, findings);
    const source = quelleWert(step, args, context, answers, templates, findings);
    let position = null;
    if (step.position && step.position.kind === 'atStart') position = { kind: 'atStart' };
    else if (step.position) {
      const ueberschrift = fuelle(step.position.raw, context, answers);
      if (ueberschrift.ok) position = { kind: 'under', heading: ueberschrift.text };
      else findings.push(befund(step, 'placeholderInvalid', { engine: ueberschrift.engine }));
    }
    fertig.push({
      line: step.line,
      blockLine: step.blockLine,
      keyword: step.keyword,
      args,
      source,
      position,
    });
  }
  return { ok: findings.length === 0, steps: findings.length === 0 ? fertig : [], findings };
}

module.exports = { prepareRun, templateInputs, templateRefs, workflowInputs };
