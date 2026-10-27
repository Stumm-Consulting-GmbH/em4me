// 4T-002350 (Epic 3E-000184): Der Lese-Kanal der Seite «Workflow-Läufe» — alle
// Workflows des Bereichs mit ihrem Lauf-Stand (Story 4S-001106).
//
// Kanal (Namensraum workflow:*, wie Ausführung und Ordner):
//   workflow:runs  Fenster -> Hauptprozess (invoke), ohne Nutzlast; Antwort
//                  { ok: true, status, workflows } oder { ok: false, code }.
//                  `status` wie bei der Index-Sicht: `ready`, `indexing` oder
//                  `unavailable`; je Workflow { name, description, relPath,
//                  absPath, runs, lastRun, runStateDefect }.
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
// Die Bereichs-Wurzel ist immer die des sendenden Fensters. Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const mddStore = require('../documents/mdd-store');
const { mddPathFor } = require('../documents/document-parts-io');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');
const { MAX_WORKFLOW_BYTES } = require('../workflows/workflow-folder.js');

// Der Text einer Workflow-Datei: ungespeicherter Stand vor der Platte; null,
// wenn sie nicht lesbar oder zu groß ist.
async function leseText(absPath, backlinks) {
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
  const text = await leseText(datei.absPath, backlinks);
  const basis = path.basename(datei.absPath);
  const doc = text === null ? null : readWorkflowDocument(text, { fileName: basis });
  // Der Index kann einer Änderung um einen Takt nachlaufen: Was der Kern nicht
  // als Workflow erkennt, steht nicht auf der Seite (dieselbe Erkennung wie beim
  // Start). Eine nicht lesbare Datei bleibt mit ihrem Dateinamen stehen.
  if (doc && !doc.isWorkflow) return null;
  const { stand, defekt } = await readRunState(datei.absPath);
  return {
    name: doc ? doc.meta.name : basis.replace(/\.[^.]+$/, ''),
    description: doc ? doc.meta.description : '',
    relPath: datei.relPath,
    absPath: datei.absPath,
    runs: stand ? stand.runs : 0,
    lastRun: stand ? stand.lastRun : null,
    runStateDefect: defekt,
  };
}

/**
 * Alle Workflows einer Bereichs-Wurzel mit Lauf-Stand, nach Name und Ort sortiert.
 *
 * @param {string} root Bereichs-Wurzel.
 * @param {object} backlinks Index-Fassade (`workflowFilesFor`, `bufferTextFor`).
 * @returns {Promise<{ok: true, status: string, workflows: object[]}>}
 */
async function listWorkflowRuns(root, backlinks) {
  const sicht = backlinks.workflowFilesFor(null, root);
  if (sicht.status !== 'ready') return { ok: true, status: sicht.status, workflows: [] };
  const eintraege = await Promise.all(sicht.dateien.map((d) => eintrag(d, backlinks)));
  const workflows = eintraege.filter(Boolean);
  workflows.sort((a, b) => a.name.localeCompare(b.name) || a.relPath.localeCompare(b.relPath));
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
 */
function registerWorkflowRunsIpc(handle, deps) {
  const { senderWindow, areaOfWindow, backlinks } = deps;
  handle('workflow:runs', async (event) => {
    const win = senderWindow(event);
    const area = win ? areaOfWindow(win) : null;
    if (!area || !area.rootPath) return { ok: false, code: 'noArea' };
    try {
      return await listWorkflowRuns(area.rootPath, backlinks);
    } catch (err) {
      console.error('[workflow] Lauf-Stände nicht lesbar:', err && err.message);
      return { ok: false, code: 'unexpected' };
    }
  });
}

module.exports = { listWorkflowRuns, readRunState, registerWorkflowRunsIpc };
