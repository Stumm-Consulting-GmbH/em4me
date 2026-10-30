// 4T-002350 (Epic 3E-000184): Der Lese-Kanal der Seite «Workflow-Läufe» — alle
// Workflows des Bereichs mit ihrem Lauf-Stand (Story 4S-001106).
//
// Kanal (Namensraum workflow:*, wie Ausführung und Ordner):
//   workflow:runs  Fenster -> Hauptprozess (invoke), ohne Nutzlast; Antwort
//                  { ok: true, status, workflows } oder { ok: false, code }.
//                  `status` wie bei der Index-Sicht: `ready`, `indexing` oder
//                  `unavailable`; je Workflow { name, description, relPath,
//                  absPath, runs, lastRun, runStateDefect, scheduled, armed,
//                  nextDue, skipped }.
//
// **Welche Workflows:** alle gekennzeichneten Dateien des Bereichs aus dem
// Bereichs-Index (`workflowFilesFor`, 4T-002347), nicht nur die des
// Workflow-Ordners; die Seite listet nach der Story alle Workflows des
// Bereichs, auch die außerhalb des Ordners, die über den Knopf am Block laufen.
// Name und Beschreibung liest der Format-Kern (`readWorkflowDocument`), aus dem
// ungespeicherten Stand eines Fensters vor der Platte, damit die Seite dieselbe
// Bezeichnung zeigt wie der Hinweis eines Laufs.
//
// **Lauf-Stand:** gelesen aus der Begleitdatei über `getWorkflowRun`
// (mdd-store.js, 4T-002348); geschrieben wird hier nichts. Eine fehlende
// Begleitdatei heißt «noch nie gelaufen», eine defekte meldet `runStateDefect`,
// ohne dass der Workflow aus der Liste fällt.
//
// **Workflows verknüpfter Bereiche** (4T-002426, Epic 3E-000366, Entscheidung
// 2h): Nach den eigenen folgen die Workflows der zugestimmten Quellen
// (`workflow-linked-sources.js`), je mit `sourceKey`, `sourceName` und
// `foreign: true`, aber **ohne Lauf-Stand**: Ihre Begleitdatei liegt im fremden
// Bereich und wird weder gelesen noch geschrieben (Entscheidung 1f); die Seite
// zeigt an ihrer Stelle den Hinweis auf die Quelle. `relPath` ist bei ihnen
// relativ zum Workflow-Ordner der Quelle.
//
// **Stufe 2** (4T-002422, Epic 3E-000366, Entscheidungen 2d, 2e, 2g): je
// eigenem Workflow dazu `scheduled` (Auslöser `schedule`, der Schalter
// «Scharf» erscheint nur dann), `armed` als Zustand gegen den aktuellen Text
// (`armed`, `notArmed`, `definitionChanged`; `armedStatus` aus
// workflow-run-state.js, dieselbe Rechnung wie im Zeitplan-Prüfer), `nextDue`
// nur bei Zustand `armed` (ein nicht scharfer Workflow hat keinen nächsten
// Lauf, AK6 der Story) und `skipped` (verfallener Termin, `{ at, due }`).
// `lastRun` trägt seit 4T-002420 Herkunft (`origin`) und Journal. Ein fremder
// Eintrag hat `scheduled: false` und `armed: 'notArmed'`: Er wird nie scharf
// (2h).
//
// Die Bereichs-Wurzel ist immer die des sendenden Fensters. Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const mddStore = require('../documents/mdd-store');
const { mddPathFor } = require('../documents/document-parts-io');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');
const { MAX_WORKFLOW_BYTES } = require('../workflows/workflow-folder.js');
const { createLinkedWorkflowSources } = require('../workflows/workflow-linked-sources.js');
const { SCHEDULE_TRIGGER } = require('../../shared/workflows/workflow-schedule.js');
const { ARMED_STATUS, armedStatus } = require('../workflows/workflow-run-state.js');

/**
 * Der Text einer Workflow-Datei: ungespeicherter Stand vor der Platte; null,
 * wenn sie nicht lesbar oder zu groß ist. Seit 4T-002421 liest auch der
 * Zeitplan-Prüfer (checks/workflow-schedule-check.js) über diese Funktion, damit
 * er dieselbe Definition sieht wie die Seite «Workflow-Läufe».
 *
 * @param {string} absPath absoluter Pfad der Workflow-Datei.
 * @param {object} backlinks Index-Fassade (`bufferTextFor`).
 * @returns {Promise<string|null>}
 */
async function readWorkflowText(absPath, backlinks) {
  const puffer =
    backlinks && typeof backlinks.bufferTextFor === 'function'
      ? backlinks.bufferTextFor(absPath)
      : null;
  if (typeof puffer === 'string') return puffer;
  try {
    const stat = await fsp.stat(absPath);
    if (stat.size > MAX_WORKFLOW_BYTES) return null;
    return await fsp.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Der Lauf-Stand einer Workflow-Datei aus ihrer Begleitdatei.
 *
 * @param {string} absPath absoluter Pfad der Workflow-Datei.
 * @returns {Promise<{stand: {runs: number, lastRun: object|null}|null, defekt: boolean}>}
 */
async function readRunState(absPath) {
  let raw;
  try {
    raw = await fsp.readFile(mddPathFor(absPath), 'utf8');
  } catch {
    // Keine Begleitdatei: noch nie gelaufen oder ohne sie kopiert (AK6 der Story).
    return { stand: null, defekt: false };
  }
  const parsed = mddStore.parseContainer(raw);
  if (!parsed.ok) return { stand: null, defekt: true };
  return { stand: mddStore.getWorkflowRun(parsed.container), defekt: false };
}

async function eintrag(datei, backlinks) {
  const text = await readWorkflowText(datei.absPath, backlinks);
  const basis = path.basename(datei.absPath);
  const doc = text === null ? null : readWorkflowDocument(text, { fileName: basis });
  // Der Index kann einer Änderung um einen Takt nachlaufen: Was der Kern nicht
  // als Workflow erkennt, steht nicht auf der Seite (dieselbe Erkennung wie beim
  // Start). Eine nicht lesbare Datei bleibt mit ihrem Dateinamen stehen.
  if (doc && !doc.isWorkflow) return null;
  const { stand, defekt } = await readRunState(datei.absPath);
  // 4T-002422: Scharf-Zustand gegen den Text; eine nicht lesbare Datei mit
  // Scharf-Schaltung gilt wie eine geänderte (die Prüfsumme passt nicht).
  const armed = stand && stand.armed ? stand.armed : null;
  let status = ARMED_STATUS.notArmed;
  if (armed) status = text === null ? ARMED_STATUS.definitionChanged : armedStatus(armed, text);
  return {
    name: doc ? doc.meta.name : basis.replace(/\.[^.]+$/, ''),
    description: doc ? doc.meta.description : '',
    relPath: datei.relPath,
    absPath: datei.absPath,
    runs: stand ? stand.runs : 0,
    lastRun: stand ? stand.lastRun : null,
    runStateDefect: defekt,
    scheduled: Boolean(doc && doc.meta.trigger === SCHEDULE_TRIGGER),
    armed: status,
    nextDue: status === ARMED_STATUS.armed && stand ? stand.nextDue : null,
    skipped: stand ? stand.skipped : null,
  };
}

// 4T-002426: Eintrag eines fremden Workflows, ohne Lauf-Stand.
function fremderEintrag(w) {
  return {
    name: w.name,
    description: w.description || '',
    relPath: w.relPath,
    absPath: w.absPath,
    sourceKey: w.sourceKey,
    sourceName: w.sourceName || null,
    foreign: true,
    runs: 0,
    lastRun: null,
    runStateDefect: false,
    scheduled: false,
    armed: ARMED_STATUS.notArmed,
    nextDue: null,
    skipped: null,
  };
}

/**
 * Alle Workflows einer Bereichs-Wurzel mit Lauf-Stand, nach Name und Ort sortiert;
 * danach die Workflows der zugestimmten verknüpften Bereiche ohne Lauf-Stand.
 *
 * @param {string} root Bereichs-Wurzel.
 * @param {object} backlinks Index-Fassade (`workflowFilesFor`, `bufferTextFor`).
 * @param {{linked?: object[]}} [optionen] `linked` je Quelle aus `workflow-linked-sources.js`.
 * @returns {Promise<{ok: true, status: string, workflows: object[]}>}
 */
async function listWorkflowRuns(root, backlinks, optionen = {}) {
  const sicht = backlinks.workflowFilesFor(null, root);
  if (sicht.status !== 'ready') return { ok: true, status: sicht.status, workflows: [] };
  const eintraege = await Promise.all(sicht.dateien.map((d) => eintrag(d, backlinks)));
  const workflows = eintraege.filter(Boolean);
  workflows.sort((a, b) => a.name.localeCompare(b.name) || a.relPath.localeCompare(b.relPath));
  for (const quelle of Array.isArray(optionen.linked) ? optionen.linked : []) {
    const fremde = (quelle.workflows || []).map(fremderEintrag);
    fremde.sort((a, b) => a.name.localeCompare(b.name) || a.relPath.localeCompare(b.relPath));
    workflows.push(...fremde);
  }
  return { ok: true, status: 'ready', workflows };
}

/**
 * Registriert den Lese-Kanal der Seite «Workflow-Läufe».
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {object} deps.backlinks Bereichs-Index (Fassade backlinks.js).
 * @param {object} [deps.linkedWorkflowSources] Quellen verknüpfter Bereiche (Prüffälle).
 */
function registerWorkflowRunsIpc(handle, deps) {
  const { senderWindow, areaOfWindow, backlinks } = deps;
  // 4T-002426: die Workflows der zugestimmten verknüpften Bereiche.
  const fremde = deps.linkedWorkflowSources || createLinkedWorkflowSources(deps);
  handle('workflow:runs', async (event) => {
    const win = senderWindow(event);
    const area = win ? areaOfWindow(win) : null;
    if (!area || !area.rootPath) return { ok: false, code: 'noArea' };
    try {
      const linked = await fremde.list(area.rootPath);
      return await listWorkflowRuns(area.rootPath, backlinks, { linked });
    } catch (err) {
      console.error('[workflow] Lauf-Stände nicht lesbar:', err && err.message);
      return { ok: false, code: 'unexpected' };
    }
  });
}

module.exports = { listWorkflowRuns, readRunState, readWorkflowText, registerWorkflowRunsIpc };
