// 4T-002424 (Epic 3E-000366): Die Pflege-Befehle `delete` und `complete-task`
// der Workflows im Hauptprozess (Story 4S-001135, Regeln P1, P3 und P5 der
// Konzept-Runde 4T-002418). `add-tag` und `remove-tag` sind Dateikopf-Befehle
// und laufen mit `set-property` über `workflow-content-steps.js`; `confirm`
// läuft im Fenster.
//
// **`delete` (P1)** legt Datei oder Ordner in den Papierkorb des
// Betriebssystems, mit derselben Bauart wie das Löschen im Bereichs-Panel
// (`area:trashFile` in `src/main/ipc/areas.js`): `shell.trashItem` ist der
// EINZIGE Lösch-Aufruf, es gibt keinen Rückfall auf ein endgültiges Löschen,
// und ein abgelehntes Versprechen wird als Fehlschlag gemeldet. Bei einer Datei
// gehen danach ihre Begleit-Dateien mit, zuerst die Pflicht-Arten aus
// `companion-files.js` (Beleg-Datei einer Tabelle), dann die Begleitdatei
// `.mdd`, wie P1 es festlegt («eine Begleitdatei geht mit»). Die Reihenfolge
// ist die des Panels: erst die Datei, dann die Begleiter; scheitert ein
// Begleiter, ist die Datei dennoch weg, der Schritt gelingt, und der Rest wird
// im Protokoll und im Ergebnis genannt (`companionLeft`). Ein Ordner geht als
// Ganzes, samt allem darin. Die Bereichs-Wurzel selbst wird nie gelöscht.
// Die Bestätigung aller Ziele vor dem ersten Schritt und das Schließen der
// Reiter dieses Fensters vor dem Löschen leistet das Fenster
// (`workflow-start.js`, `workflow-window.js`).
//
// **`complete-task` (P3)** sucht im aktuellen Stand der Datei (ungespeicherter
// Stand eines Fensters vor der Platte) die erste offene Aufgaben-Zeile, deren
// Beschreibung den Suchtext enthält (wörtlich, Groß- und Kleinschreibung
// beachtet wie bei `replace`). Aufgaben-Zeilen sind die des Index
// (`parseContent`: ohne Dateikopf und Code-Blöcke), offen sind die Typen TODO,
// IN_PROGRESS und ON_HOLD der Status-Einstellung, und bei eingeschalteter
// Erweiterung «Aufgaben» zählt der Global Filter wie in der Aufgaben-Abfrage.
// Abgehakt wird im startenden Fenster über denselben Weg wie in der
// Aufgaben-Abfrage (`toggleTaskFromQuery`), damit Erledigt-Datum,
// Wiederholung und die Weiche zum Editor-Puffer (P5, A3) dieselben sind; der
// Hauptprozess antwortet deshalb mit dem Fenster-Handgriff `completeTask`.
// Kein Treffer ist ein Fehlschlag des Schritts (A1).
//
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isSamePath } = require('../area/area-path');
const { pflichtBegleitPfade } = require('../documents/companion-files');
const { buildTaskEnv } = require('../index/task-env');
const { parseContent } = require('../index/parse');
const { MDD_EXT, companionPathFor } = require('../../shared/markdown-data-family');
const { modelMatchesGlobalFilter, parseTaskLine } = require('../../shared/tasks/task-markers.js');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { readCurrentText } = require('./workflow-content-steps.js');

/** Die Befehle dieses Moduls. */
const MAINTENANCE_KEYWORDS = Object.freeze(['delete', 'complete-task']);
// Status-Typen einer offenen Aufgabe («not done» der Referenz-Semantik).
const OFFENE_TYPEN = Object.freeze(['TODO', 'IN_PROGRESS', 'ON_HOLD']);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

function fsCode(err) {
  return err && err.code ? err.code : null;
}

async function statOderNull(abs) {
  try {
    return await fs.stat(abs);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

async function liegtDa(pfad) {
  try {
    await fs.access(pfad);
    return true;
  } catch {
    return false;
  }
}

/**
 * Die erste offene Aufgaben-Zeile eines Texts mit dem Suchtext.
 *
 * @param {string} abs Pfad der Datei (für den Parser).
 * @param {string} text aktueller Stand der Datei.
 * @param {string} suche Suchtext.
 * @param {{enabled: boolean, globalFilter: string, statusTypeOf: Function}} env
 * @returns {{line: number, taskText: string}|null}
 */
function findOpenTask(abs, text, suche, env) {
  const { tasks } = parseContent(abs, String(text));
  for (const aufgabe of tasks || []) {
    const model = parseTaskLine(aufgabe.text);
    if (!model) continue;
    if (!OFFENE_TYPEN.includes(env.statusTypeOf(model.statusChar))) continue;
    if (env.enabled && !modelMatchesGlobalFilter(model, env.globalFilter)) continue;
    if (!model.description.includes(suche)) continue;
    return { line: aufgabe.zeile, taskText: aufgabe.text };
  }
  return null;
}

/**
 * Baut die Ausführung der Pflege-Befehle `delete` und `complete-task`.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {object} deps.backlinks Bereichs-Index (Puffer-Stand).
 * @param {() => object|null} [deps.getStore] Einstellungs-Speicher (Aufgaben-Umgebung).
 * @param {(p: string) => Promise<void>} [deps.trashItem] Papierkorb; Vorgabe
 *   `shell.trashItem` aus Electron (Prüffälle geben eine Attrappe).
 * @returns {{runMaintenanceStep: Function}}
 */
function createWorkflowMaintenanceSteps(deps) {
  const papierkorb =
    typeof deps.trashItem === 'function'
      ? deps.trashItem
      : (p) => require('electron').shell.trashItem(p);

  function aufgabenUmgebung() {
    const store = typeof deps.getStore === 'function' ? deps.getStore() : null;
    if (!store) return buildTaskEnv({});
    return buildTaskEnv({
      disabledExtensions: store.get('extensions.disabled'),
      tasksConfig: store.get('tasksConfig'),
      taskStates: store.get('taskStates'),
    });
  }

  async function begleiterMitnehmen(abs) {
    const begleiter = [...(await pflichtBegleitPfade(abs))];
    const mdd = companionPathFor(abs, MDD_EXT);
    if (await liegtDa(mdd)) begleiter.push(mdd);
    const liegenGeblieben = [];
    for (const pfad of begleiter) {
      try {
        await papierkorb(pfad);
      } catch (err) {
        console.warn(
          '[workflow] Begleit-Datei nicht mitgenommen:',
          pfad,
          '—',
          err && err.message ? err.message : err,
        );
        liegenGeblieben.push(pfad);
      }
    }
    return liegenGeblieben;
  }

  async function loeschen(ctx, step) {
    const ziel = await resolveAreaPath(ctx.root, step.args[0]);
    if (!ziel.ok) return ziel;
    if (isSamePath(path.resolve(ctx.root), ziel.abs)) {
      return fehlschlag('deleteAreaRoot', { path: step.args[0] });
    }
    const stat = await statOderNull(ziel.abs);
    if (!stat) return fehlschlag('targetMissing', { path: step.args[0] });
    try {
      await papierkorb(ziel.abs);
    } catch (err) {
      return fehlschlag('trashFailed', {
        path: step.args[0],
        message: err && err.message ? err.message : String(err),
      });
    }
    const effect = { kind: 'trashed', paths: [ziel.abs], via: 'disk' };
    if (stat.isFile()) {
      const liegenGeblieben = await begleiterMitnehmen(ziel.abs);
      if (liegenGeblieben.length > 0) effect.companionLeft = liegenGeblieben;
    }
    return { ok: true, effect };
  }

  async function abhaken(ctx, step) {
    const [relPfad, suche] = step.args;
    const ziel = await resolveAreaPath(ctx.root, relPfad);
    if (!ziel.ok) return ziel;
    const stat = await statOderNull(ziel.abs);
    if (!stat) return fehlschlag('targetMissing', { path: relPfad });
    if (!stat.isFile()) return fehlschlag('notAFile', { path: relPfad });
    const gelesen = await readCurrentText(ctx.backlinks || deps.backlinks, ziel.abs);
    if (!gelesen.ok) return fehlschlag('targetMissing', { path: relPfad, fsCode: gelesen.fsCode });
    const treffer = findOpenTask(ziel.abs, gelesen.text, suche, aufgabenUmgebung());
    if (!treffer) return fehlschlag('taskNotFound', { path: relPfad, text: suche });
    return {
      ok: true,
      window: {
        action: 'completeTask',
        path: ziel.abs,
        line: treffer.line,
        taskText: treffer.taskText,
      },
    };
  }

  /**
   * Führt einen Pflege-Schritt aus.
   *
   * @param {object} ctx Lauf-Kontext: `root`, `owner`, `event`, `workflowAbs`, `backlinks`.
   * @param {object} step gefüllter Schritt aus `prepareRun`.
   * @returns {Promise<object>} `{ ok: true, effect }`, `{ ok: true, window }` oder
   *   `{ ok: false, code, detail }`.
   */
  async function runMaintenanceStep(ctx, step) {
    try {
      return step.keyword === 'delete' ? await loeschen(ctx, step) : await abhaken(ctx, step);
    } catch (err) {
      console.error('[workflow] Schritt fehlgeschlagen:', step.keyword, err && err.message);
      return fehlschlag('writeFailed', { fsCode: fsCode(err) });
    }
  }

  return { runMaintenanceStep };
}

module.exports = { MAINTENANCE_KEYWORDS, createWorkflowMaintenanceSteps, findOpenTask };
