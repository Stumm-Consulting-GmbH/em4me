// 4T-002349 (Epic 3E-000184): Der Ablauf-Kern eines Workflow-Laufs.
//
// Führt die vorbereiteten Schritte eines Laufs strikt nacheinander aus (A1).
// Reine Funktion ohne DOM- und Electron-Abhängigkeit: Alle Wirkungen kommen
// als Abhängigkeiten herein (Vorbild `src/shared/macro-runner.js`), damit der
// Ablauf ohne Fenster und ohne IPC prüfbar ist. Die Vorbereitung (Prüfen vor
// Laufen, Eingabe-Dialoge, Füllen, Aufruf-Baum) leistet der Aufrufer
// (`src/renderer/modules/workflows/workflow-start.js`); hier beginnt der Lauf
// erst, wenn nichts mehr zu fragen ist.
//
// **Wo ein Schritt läuft** (A3): `command`, `macro`, `workflow`, `wait`,
// `notify`, `stop` und seit 4T-002424 `confirm` im startenden Fenster, alle
// übrigen Befehle im
// Hauptprozess über `deps.step`; antwortet er mit einem Fenster-Handgriff, führt
// ihn `deps.runWindowAction` aus.
//
// **Abbruch** (A1, A5): Der erste Fehlschlag beendet den Lauf, ausgeführte
// Schritte bleiben. `stop` beendet den ganzen Lauf, auch aus einem
// verschachtelten Workflow heraus. Eine Ausnahme einer Abhängigkeit wird zum
// Fehlschlag `unexpected`, nie still verschluckt.
//
// **`confirm`** (4T-002424, Regel P4 der Konzept-Runde 4T-002418): Die Frage
// geht an `deps.confirm`; «Ja» setzt den Lauf fort, «Nein» beendet ihn ohne
// Fehlschlag wie `stop`, mit der Frage als Text und dem Kennzeichen
// `declined`, damit die Anzeige «mit Nein beantwortet» sagen kann.
//
// **Aufruf-Tiefe** (A4): eine Zählung über Workflows und Makros wie bei den
// Makros. Der gestartete Workflow ist Ebene 0, ein `workflow`- oder
// `macro`-Schritt öffnet die nächste; abgewiesen wird ab Ebene
// `MAX_CALL_DEPTH` (5). Ein Makro läuft mit seiner Ebene, damit der Zähler der
// Makros dieselbe Kette weiterzählt.
//
// **Bedingungen und Schleife** (4T-002464, Stories 4S-001147 und 4S-001148,
// Entscheidungen 3f und 3g): Die Schritte bleiben eine flache Liste in
// Lese-Reihenfolge; `else` und `end` sind eigene Schritte. Die Paarung liest
// der Kern über `blockStructure` aus dem Prüfer, derselben Erkennung wie das
// Prüfen vor Laufen, das jede fehlerhafte Paarung schon vor dem ersten Schritt
// abgewiesen hat. Die Frage, ob eine Bedingung zutrifft, und die Liste einer
// Schleife beantwortet der Hauptprozess über denselben Weg wie jeden
// Datei-Schritt (`deps.step`, nach dem Puffer-Abgleich), weil nur er den
// Bereich sieht: `{ ok: true, value }` für eine Bedingung, `{ ok: true, files }`
// mit wurzel-relativen Pfaden für eine Schleife. Ein Block, dessen Bedingung
// nicht zutrifft, wird übersprungen, `else` läuft im anderen Fall. Die Liste
// einer Schleife steht beim Eintritt fest, der Kern ordnet sie alphabetisch
// (`compareLoopPaths`) und wiederholt den Block je Datei; ein zurückgestellter
// Schritt (`deferred` aus `prepareRun`) wird dabei je Datei mit `{{item}}`
// gefüllt. Mehr als `MAX_LOOP_FILES` Dateien sind ein Fehlschlag
// `tooManyFiles` vor der ersten Wiederholung; eine leere Liste ist keiner. Ein
// Fehlschlag in einem Block ist ein Fehlschlag des Laufs (A1).
//
// **Skript-Schritt** (4T-002465, Story 4S-001149, Entscheidungen 3h und 3n):
// `script` und `if-script` laufen nie im Hauptprozess, sondern über
// `deps.runScript(source, ort)` in der Sandbox der Skript-Blöcke im Fenster;
// `source` ist der Quelltext, den das Prüfen vor Laufen unter der Überschrift
// gefunden hat. Die Antwort ist `{ ok: true, value }` mit einem Text, einer
// Zahl, einem Wahrheitswert oder null, sonst `{ ok: false, code, detail }`
// (Fehler im Skript, Zeitgrenze, Einstellung aus); jede Nicht-Antwort ist ein
// Fehlschlag des Schritts (A1). Das Ergebnis von `script … as "name"` gilt
// als Text (`scriptResultText`) ab dem nächsten Schritt in `{{script:name}}`;
// ein Schritt mit diesem Platzhalter kommt zurückgestellt aus `prepareRun` und
// wird hier mit den bis dahin gelieferten Ergebnissen gefüllt. Fehlt ein
// Ergebnis, weil sein Schritt in einem nicht gelaufenen Zweig steht, ist das
// der Fehlschlag `scriptResultMissing`. `if-script` trifft zu, wenn das Skript
// `true`, einen nicht leeren Text oder eine Zahl ungleich null liefert
// (`scriptResultTrue`).
'use strict';

const { MACRO_MAX_CALL_DEPTH } = require('../commands/command-placement.js');
const { analyzeTemplate } = require('../template-engine.js');
const {
  CONDITION_KEYWORDS,
  ELSE_KEYWORD,
  END_KEYWORD,
  LOOP_KEYWORD,
  MAX_LOOP_FILES,
  SCRIPT_CONDITION_KEYWORD,
  SCRIPT_KEYWORD,
} = require('./workflow-catalog.js');
const { blockStructure } = require('./workflow-check.js');
const { fillLoopStep } = require('./workflow-placeholders.js');

const MAX_CALL_DEPTH = MACRO_MAX_CALL_DEPTH;
// Die Fehlschlag-Codes dieses Moduls; ihre Texte liegen unter
// `workflow.fehlschlag.<code>`.
const RUNNER_CODES = Object.freeze([
  'commandFailed',
  'macroFailed',
  'macroUnknown',
  'workflowFailed',
  'workflowUnknown',
  'depthExceeded',
  'tooManyFiles',
  'scriptFailed',
  'scriptTimeout',
  'scriptsDisabled',
  'scriptResultMissing',
  'unexpected',
]);

// Die Codes, mit denen `deps.runScript` einen Fehlschlag melden darf; jeder
// andere wird `scriptFailed`.
const SKRIPT_CODES = Object.freeze(['scriptFailed', 'scriptTimeout', 'scriptsDisabled']);

/**
 * Das Ergebnis eines Skripts als Text für `{{script:name}}` (4T-002465).
 *
 * @param {*} value Antwort von `deps.runScript`.
 * @returns {string} leer für null und alles, was kein Text, keine endliche Zahl
 *   und kein Wahrheitswert ist.
 */
function scriptResultText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Trifft `if-script` zu? Wahr bei `true`, einem nicht leeren Text (Leerraum
 * allein zählt als leer) und einer Zahl ungleich null (4T-002465).
 *
 * @param {*} value Antwort von `deps.runScript`.
 * @returns {boolean}
 */
function scriptResultTrue(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  return false;
}

// Alphabetische Ordnung der Dateien einer Schleife: fest auf Deutsch, damit
// die Reihenfolge nicht von der Sprache der Oberfläche abhängt, Ziffern als
// Zahl wie im Datei-Explorer, bei Gleichheit nach Zeichen-Code.
const SORTIERUNG = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * Vergleicht zwei Pfade einer Schleife für die alphabetische Abarbeitung.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareLoopPaths(a, b) {
  const grob = SORTIERUNG.compare(a, b);
  if (grob !== 0) return grob;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function fehlschlag(plan, step, code, detail = {}) {
  return { status: 'failed', workflow: plan.name, path: plan.path, line: step.line, code, detail };
}

async function makroSchritt(plan, step, deps, ebene) {
  const name = String(step.args[0]);
  if (ebene + 1 >= MAX_CALL_DEPTH) return fehlschlag(plan, step, 'depthExceeded', { name });
  const ergebnis = await deps.runMacro(name, ebene + 1);
  if (ergebnis && ergebnis.ok) return null;
  const grund = ergebnis && ergebnis.reason;
  if (grund === 'depth') return fehlschlag(plan, step, 'depthExceeded', { name });
  if (grund === 'unknown') return fehlschlag(plan, step, 'macroUnknown', { name });
  return fehlschlag(plan, step, 'macroFailed', { name });
}

async function workflowSchritt(plan, step, deps, ebene) {
  const name = String(step.args[0]);
  if (ebene + 1 >= MAX_CALL_DEPTH) return fehlschlag(plan, step, 'depthExceeded', { name });
  const kind = plan.children && plan.children[step.line];
  if (!kind) return fehlschlag(plan, step, 'workflowUnknown', { name });
  const ergebnis = await runWorkflow(kind, deps, ebene + 1);
  if (ergebnis.status === 'ok') return null;
  if (ergebnis.status === 'stopped') {
    return { ...ergebnis, workflow: plan.name, path: plan.path, line: step.line, inner: ergebnis };
  }
  return fehlschlag(plan, step, 'workflowFailed', { name: kind.name, inner: ergebnis });
}

async function hauptprozessSchritt(plan, step, deps) {
  if (typeof deps.flushBuffers === 'function') await deps.flushBuffers();
  let antwort = await deps.step(plan.path, step);
  if (antwort && antwort.ok && antwort.window) antwort = await deps.runWindowAction(antwort);
  if (antwort && antwort.ok) return null;
  const code = antwort && typeof antwort.code === 'string' ? antwort.code : 'unexpected';
  return fehlschlag(plan, step, code, (antwort && antwort.detail) || {});
}

// Eine Frage an den Hauptprozess (Bedingung oder Liste einer Schleife):
// `{ antwort }` oder `{ ende }` mit dem Fehlschlag.
async function abfrage(plan, step, deps) {
  if (typeof deps.flushBuffers === 'function') await deps.flushBuffers();
  const antwort = await deps.step(plan.path, step);
  if (antwort && antwort.ok) return { antwort };
  const code = antwort && typeof antwort.code === 'string' ? antwort.code : 'unexpected';
  return { ende: fehlschlag(plan, step, code, (antwort && antwort.detail) || {}) };
}

// Die Namen der Skript-Ergebnisse, die ein zurückgestellter Schritt braucht.
function gebrauchteErgebnisse(step) {
  const texte = [];
  const roh = step.deferred.step;
  for (const a of roh.args || []) if (typeof a.raw === 'string') texte.push(a.raw);
  if (roh.source && typeof roh.source.raw === 'string') texte.push(roh.source.raw);
  if (roh.position && typeof roh.position.raw === 'string') texte.push(roh.position.raw);
  const namen = [];
  for (const text of texte) {
    const analysis = analyzeTemplate(text);
    if (!analysis.ok) continue;
    for (const seg of analysis.segments) {
      if (seg.type === 'context' && seg.name.startsWith('script:')) namen.push(seg.name.slice(7));
    }
  }
  return namen;
}

// Ein zurückgestellter Schritt, für die Datei der Schleife und mit den
// gelieferten Skript-Ergebnissen gefüllt.
function gefuellt(lauf, step, item) {
  const { plan } = lauf;
  if (!step.deferred) return { step };
  if (step.deferred.item !== false && item === null) {
    return { ende: fehlschlag(plan, step, 'unexpected', {}) };
  }
  const fehlt = gebrauchteErgebnisse(step).find(
    (name) => !Object.prototype.hasOwnProperty.call(lauf.skripte, name),
  );
  if (fehlt !== undefined)
    return { ende: fehlschlag(plan, step, 'scriptResultMissing', { name: fehlt }) };
  const ergebnis = fillLoopStep(step, item, lauf.skripte);
  if (ergebnis.ok) return { step: ergebnis.step };
  // Ein Befund der Füllung; sein Text steht unter den Befunden der Prüfung.
  const erster = ergebnis.findings[0] || { code: 'unexpected', detail: {} };
  return { ende: { ...fehlschlag(plan, step, erster.code, erster.detail || {}), befund: true } };
}

// Ein Schritt; null heißt «gelungen, weiter», sonst das Ende des Laufs.
async function schritt(plan, step, deps, ebene) {
  switch (step.keyword) {
    case 'command': {
      const id = String(step.args[0]);
      const ok = await deps.executeCommand(id);
      return ok === false ? fehlschlag(plan, step, 'commandFailed', { command: id }) : null;
    }
    case 'macro':
      return makroSchritt(plan, step, deps, ebene);
    case 'workflow':
      return workflowSchritt(plan, step, deps, ebene);
    case 'wait':
      await deps.sleep(Number(step.args[0]) * 1000);
      return null;
    case 'notify':
      deps.notify(String(step.args[0]));
      return null;
    case 'confirm': {
      const frage = String(step.args[0]);
      if ((await deps.confirm(frage)) === true) return null;
      return {
        status: 'stopped',
        workflow: plan.name,
        path: plan.path,
        line: step.line,
        text: frage,
        declined: true,
      };
    }
    case 'stop':
      return {
        status: 'stopped',
        workflow: plan.name,
        path: plan.path,
        line: step.line,
        text: String(step.args[0]),
      };
    default:
      return hauptprozessSchritt(plan, step, deps);
  }
}

// Ein Schritt samt Ausnahme-Schutz; null heißt «weiter».
async function sicherSchritt(plan, step, deps, ebene) {
  try {
    return await schritt(plan, step, deps, ebene);
  } catch (err) {
    return fehlschlag(plan, step, 'unexpected', { message: err && err.message });
  }
}

// Führt das Skript eines Schritts in der Sandbox aus (3h): `{ antwort }` mit
// dem Wert oder `{ ende }` mit dem Fehlschlag des Schritts.
async function skript(plan, step, deps) {
  if (typeof deps.runScript !== 'function' || typeof step.script !== 'string') {
    return { ende: fehlschlag(plan, step, 'unexpected', {}) };
  }
  const antwort = await deps.runScript(step.script, { path: plan.path, line: step.line });
  if (antwort && antwort.ok === true) return { antwort: { value: antwort.value } };
  const code = antwort && SKRIPT_CODES.includes(antwort.code) ? antwort.code : 'scriptFailed';
  return { ende: fehlschlag(plan, step, code, (antwort && antwort.detail) || {}) };
}

// Die Frage einer Bedingung: `if-script` im Fenster, alle übrigen im Hauptprozess.
async function bedingung(plan, step, deps) {
  if (step.keyword !== SCRIPT_CONDITION_KEYWORD) return abfrage(plan, step, deps);
  const frage = await skript(plan, step, deps);
  return frage.ende ? frage : { antwort: { value: scriptResultTrue(frage.antwort.value) } };
}

// Der Schritt `script … as "name"`: Ergebnis ablegen oder der Fehlschlag.
async function skriptSchritt(lauf, step) {
  const { plan, deps } = lauf;
  const frage = await skript(plan, step, deps);
  if (frage.ende) return frage.ende;
  lauf.skripte[step.result] = scriptResultText(frage.antwort.value);
  return null;
}

// Führt die Schritte `von` bis ausschließlich `bis` aus; `item` ist der Pfad
// der Datei der umgebenden Schleife oder null.
async function bereich(lauf, von, bis, item) {
  const { plan, steps, blocks, deps, ebene } = lauf;
  let i = von;
  while (i < bis) {
    const roh = steps[i];
    const block = blocks[i];
    const vorbereitet = gefuellt(lauf, roh, item);
    if (vorbereitet.ende) return vorbereitet.ende;
    const step = vorbereitet.step;
    if (block && CONDITION_KEYWORDS.includes(step.keyword)) {
      const frage = await bedingung(plan, step, deps).catch((err) => ({
        ende: fehlschlag(plan, step, 'unexpected', { message: err && err.message }),
      }));
      if (frage.ende) return frage.ende;
      const ende = block.end;
      const zweig =
        frage.antwort.value === true
          ? [i + 1, block.else === null ? ende : block.else]
          : [block.else === null ? ende : block.else + 1, ende];
      const ergebnis = await bereich(lauf, zweig[0], zweig[1], item);
      if (ergebnis) return ergebnis;
      i = ende + 1;
      continue;
    }
    if (block && step.keyword === LOOP_KEYWORD) {
      const ergebnis = await schleife(lauf, i, step, block);
      if (ergebnis) return ergebnis;
      i = block.end + 1;
      continue;
    }
    if (step.keyword === ELSE_KEYWORD || step.keyword === END_KEYWORD) {
      i++;
      continue;
    }
    const ende =
      step.keyword === SCRIPT_KEYWORD
        ? await skriptSchritt(lauf, step).catch((err) =>
            fehlschlag(plan, step, 'unexpected', { message: err && err.message }),
          )
        : await sicherSchritt(plan, step, deps, ebene);
    if (ende) return ende;
    i++;
  }
  return null;
}

// Eine Schleife: Liste beim Eintritt, Grenze vor der ersten Wiederholung.
async function schleife(lauf, i, step, block) {
  const { plan, deps } = lauf;
  const frage = await abfrage(plan, step, deps).catch((err) => ({
    ende: fehlschlag(plan, step, 'unexpected', { message: err && err.message }),
  }));
  if (frage.ende) return frage.ende;
  const files = Array.isArray(frage.antwort.files) ? frage.antwort.files : [];
  if (files.length > MAX_LOOP_FILES) {
    return fehlschlag(plan, step, 'tooManyFiles', { max: MAX_LOOP_FILES, count: files.length });
  }
  const liste = files.map((p) => String(p).replace(/\\/g, '/')).sort(compareLoopPaths);
  for (const datei of liste) {
    const ergebnis = await bereich(lauf, i + 1, block.end, datei);
    if (ergebnis) return ergebnis;
  }
  return null;
}

/**
 * Führt einen vorbereiteten Workflow aus.
 *
 * @param {{path: string, name: string, steps: object[], children?: object}} plan
 *   Schritte aus `prepareRun`; `children` ordnet der Zeile eines
 *   `workflow`-Schritts den vorbereiteten Unter-Workflow zu.
 * @param {object} deps `step(path, step)`, `runWindowAction(antwort)`,
 *   `flushBuffers()`, `executeCommand(id)`, `runMacro(name, ebene)` →
 *   `{ ok, reason? }`, `sleep(ms)`, `notify(text)`, `confirm(frage)` → true für
 *   «Ja», `runScript(source, { path, line })` → `{ ok: true, value }` oder
 *   `{ ok: false, code, detail }` (4T-002465), wahlweise
 *   `finish(plan, ergebnis)` am Ende jedes Workflows, auch eines verschachtelten.
 * @param {number} [ebene] Aufruf-Ebene, 0 für den gestarteten Workflow.
 * @returns {Promise<object>} `{ status: 'ok' }`, `{ status: 'stopped', workflow,
 *   path, line, text, inner? }` oder `{ status: 'failed', workflow, path, line,
 *   code, detail }`; Ort ist immer der dieses Workflows, der innere steht in
 *   `inner` bzw. `detail.inner`.
 */
async function runWorkflow(plan, deps, ebene = 0) {
  const steps = plan.steps || [];
  const { blocks } = blockStructure(steps);
  const lauf = { plan, steps, blocks, deps, ebene, skripte: {} };
  const ende = await bereich(lauf, 0, steps.length, null);
  const ergebnis = ende || { status: 'ok' };
  // Der Lauf-Stand ist Spur: `finish` fängt seine Fehler selbst ab.
  if (typeof deps.finish === 'function') await deps.finish(plan, ergebnis);
  return ergebnis;
}

/**
 * Die Ziele aller `delete`-Schritte eines vorbereiteten Laufs samt der
 * aufgerufenen Workflows, in Lauf-Reihenfolge und ohne Doppel (4T-002424,
 * Regel P1: eine Bestätigung nennt alle Ziele des Laufs).
 *
 * @param {{steps?: object[], children?: object}} plan wie bei `runWorkflow`.
 * @returns {string[]} Pfade relativ zur Bereichs-Wurzel.
 */
function deleteTargets(plan) {
  const ziele = [];
  const besuche = (p) => {
    for (const step of (p && p.steps) || []) {
      const ziel = String(step.args && step.args[0]);
      if (step.keyword === 'delete' && !ziele.includes(ziel)) ziele.push(ziel);
      if (step.keyword === 'workflow' && p.children) besuche(p.children[step.line]);
    }
  };
  besuche(plan);
  return ziele;
}

module.exports = {
  MAX_CALL_DEPTH,
  RUNNER_CODES,
  compareLoopPaths,
  deleteTargets,
  runWorkflow,
  scriptResultText,
  scriptResultTrue,
};
