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
// `notify` und `stop` im startenden Fenster, alle übrigen Befehle im
// Hauptprozess über `deps.step`; antwortet er mit einem Fenster-Handgriff, führt
// ihn `deps.runWindowAction` aus.
//
// **Abbruch** (A1, A5): Der erste Fehlschlag beendet den Lauf, ausgeführte
// Schritte bleiben. `stop` beendet den ganzen Lauf, auch aus einem
// verschachtelten Workflow heraus. Eine Ausnahme einer Abhängigkeit wird zum
// Fehlschlag `unexpected`, nie still verschluckt.
//
// **Aufruf-Tiefe** (A4): eine Zählung über Workflows und Makros wie bei den
// Makros. Der gestartete Workflow ist Ebene 0, ein `workflow`- oder
// `macro`-Schritt öffnet die nächste; abgewiesen wird ab Ebene
// `MAX_CALL_DEPTH` (5). Ein Makro läuft mit seiner Ebene, damit der Zähler der
// Makros dieselbe Kette weiterzählt.
'use strict';

const { MACRO_MAX_CALL_DEPTH } = require('../commands/command-placement.js');

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
  'unexpected',
]);

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

/**
 * Führt einen vorbereiteten Workflow aus.
 *
 * @param {{path: string, name: string, steps: object[], children?: object}} plan
 *   Schritte aus `prepareRun`; `children` ordnet der Zeile eines
 *   `workflow`-Schritts den vorbereiteten Unter-Workflow zu.
 * @param {object} deps `step(path, step)`, `runWindowAction(antwort)`,
 *   `flushBuffers()`, `executeCommand(id)`, `runMacro(name, ebene)` →
 *   `{ ok, reason? }`, `sleep(ms)`, `notify(text)`, wahlweise
 *   `finish(plan, ergebnis)` am Ende jedes Workflows, auch eines verschachtelten.
 * @param {number} [ebene] Aufruf-Ebene, 0 für den gestarteten Workflow.
 * @returns {Promise<object>} `{ status: 'ok' }`, `{ status: 'stopped', workflow,
 *   path, line, text, inner? }` oder `{ status: 'failed', workflow, path, line,
 *   code, detail }`; Ort ist immer der dieses Workflows, der innere steht in
 *   `inner` bzw. `detail.inner`.
 */
async function runWorkflow(plan, deps, ebene = 0) {
  let ergebnis = { status: 'ok' };
  for (const step of plan.steps || []) {
    let ende;
    try {
      ende = await schritt(plan, step, deps, ebene);
    } catch (err) {
      ende = fehlschlag(plan, step, 'unexpected', { message: err && err.message });
    }
    if (ende) {
      ergebnis = ende;
      break;
    }
  }
  // Der Lauf-Stand ist Spur: `finish` fängt seine Fehler selbst ab.
  if (typeof deps.finish === 'function') await deps.finish(plan, ergebnis);
  return ergebnis;
}

module.exports = { MAX_CALL_DEPTH, RUNNER_CODES, runWorkflow };
