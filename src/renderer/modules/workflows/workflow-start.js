// 4T-002349 (Epic 3E-000184): Der Start eines Workflows im Fenster.
//
// Alle Start-Wege laufen hier zusammen: Kommando-Palette samt Statusleiste,
// Kontextmenü und Tastenkürzel (workflow-commands.js), der Knopf «Starten» über
// dem Block (workflow-start-knopf.js), das Menü und das Bereichs-Panel
// (4T-002355) und die Seite «Workflow-Läufe» (4T-002350).
//
// **Abfolge** (Plan des Tasks, Abschnitt 1):
//   1. Höchstens ein Lauf je Fenster (A2); ein zweiter Start wird mit Hinweis
//      abgewiesen. Die Sperre sitzt vor dem ersten `await`.
//   2. Vorbereitung des ganzen Aufruf-Baums **vor dem ersten Schritt**
//      (Entscheidung der Sitzung vom 2026-10-23, E2, im Rahmen der
//      freigegebenen Stories): je Datei Prüfen vor Laufen (G6, dieselbe Prüfung
//      wie die Kopfzeile), Eingabe-Dialoge der Befehls-Zeilen und der
//      eingesetzten Vorlagen (G5, S-a) mit einer gemeinsamen Antwort-Liste,
//      Füllen über `prepareRun`; danach die aufgerufenen Workflows ebenso. Ein
//      Kreis über mehrere Workflows ist ein Selbstaufruf (E5), ein gleicher Name
//      zweier Workflows ein Befund «mehrdeutig» (E1).
//   3. Der Lauf über den Ablauf-Kern `src/shared/workflows/workflow-runner.js`.
//   4. Lauf-Stand je gelaufener Datei über `workflow:recordRun` (4T-002348) und
//      der Hinweis in der Statusleiste; danach die Meldung an die Seite
//      «Workflow-Läufe» mit demselben Ergebnis (4T-002350, workflow-lauf-stand.js).
//
// **Welcher Text:** der übergebene (der Stand im Editor beim Knopf), sonst der
// ungespeicherte Stand eines in diesem Fenster geöffneten Reiters, sonst die
// Datei; Start und Prüf-Anzeige sehen so denselben Stand.
//
// Kommando-Ausführung und Makro-Ablauf kommen über `initWorkflowStart` herein
// (Verdrahtung aus macros.js), nicht über Importe.
'use strict';

import { intlLocale, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { activeTab, state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { findOpenTab } from '../task-query-actions.js';
import { collectAnswers, folderDisplayFor, templateDocumentContext } from '../templates.js';
import { showStatusbarHint } from '../views/views.js';
import { getWorkflowFolderList } from './workflow-folder-list.js';
import { abbruchText, einsetzen } from './workflow-lauf-texte.js';
import { laufVerbucht } from './workflow-lauf-stand.js';
import { aktuelleRueckfragen, pruefeWorkflow } from './workflow-pruefung.js';
import { flushPendingBuffers, runWindowAction } from './workflow-window.js';
import { MD_EXT_RE } from '../../../shared/markdown/link-scan.js';
import { toLogicalName } from '../../../shared/subpages.js';
import {
  prepareRun,
  templateInputs,
  templateRefs,
  workflowInputs,
} from '../../../shared/workflows/workflow-core.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';
import { MAX_CALL_DEPTH, runWorkflow } from '../../../shared/workflows/workflow-runner.js';

// Anzeige-Dauer der Hinweise: `notify` wie ein gewöhnlicher Hinweis, der
// Abbruch länger, weil Name, Zeile und Grund zu lesen sind.
const NOTIFY_MS = 4000;
const ABBRUCH_MS = 6000;

let verdrahtung = {
  executeCommand: () => false,
  runMacro: async () => ({ ok: false, reason: 'unknown' }),
};
let laufName = null;

/**
 * Nimmt Kommando-Ausführung und Makro-Ablauf entgegen.
 *
 * @param {{executeCommand?: Function, runMacro?: Function}} w
 */
export function initWorkflowStart(w) {
  verdrahtung = { ...verdrahtung, ...(w || {}) };
}

/** @returns {boolean} läuft in diesem Fenster gerade ein Workflow? */
export function laeuftWorkflow() {
  return laufName !== null;
}

function dateiName(pfad) {
  return String(pfad).split(/[\\/]/).pop() || '';
}

// Pfade vergleichen; ohne Rücksicht auf Groß- und Kleinschreibung, weil
// derselbe Ort aus Reiter und Ordner-Liste verschieden geschrieben sein kann.
function gleicherPfad(a, b) {
  const norm = (p) => String(p).replace(/\\/g, '/').toLowerCase();
  return norm(a) === norm(b);
}

function hinweis(key, text, fehler, dauer) {
  showStatusbarHint(key, { text, error: fehler, duration: dauer });
}

// Der Stand einer Datei: ungespeicherter Reiter dieses Fensters vor der Platte.
async function leseText(pfad) {
  const offen = findOpenTab(pfad);
  if (offen) {
    const aktiv = state.panes[offen.paneIdx].activeIndex === offen.tabIdx;
    const view = aktiv ? paneEditors[offen.paneIdx] : null;
    return view ? view.state.doc.toString() : String(offen.tab.content ?? '');
  }
  try {
    const daten = await api.readFile(pfad);
    return daten && daten.ok ? daten.content : null;
  } catch (err) {
    console.warn('[Workflows] Datei nicht lesbar:', pfad, err && err.message);
    return null;
  }
}

// Kontext des aktiven Dokuments für die Befehls-Zeilen (S-b).
function laufKontext() {
  const tab = activeTab();
  const pfad = tab && tab.path ? tab.path : '';
  const basis = pfad ? dateiName(pfad).replace(MD_EXT_RE, '') : '';
  return {
    ...templateDocumentContext(),
    title: basis ? toLogicalName(basis) : '',
    folder: pfad ? folderDisplayFor(api.dirname(pfad)) : '',
    nowMs: Date.now(),
    locale: intlLocale(),
  };
}

async function leseVorlagen(refs) {
  const texte = {};
  for (const ref of refs) {
    if (Object.prototype.hasOwnProperty.call(texte, ref.path)) continue;
    let antwort = null;
    try {
      antwort = await api.templatesRead(ref.path);
    } catch (err) {
      console.warn('[Workflows] Vorlage nicht lesbar:', ref.path, err && err.message);
    }
    texte[ref.path] = antwort && antwort.ok ? antwort.content : null;
  }
  return texte;
}

// Stellt die noch offenen Fragen; false bei Abbruch eines Dialogs.
async function frage(inputs, antworten) {
  const offen = inputs.filter((i) => !Object.prototype.hasOwnProperty.call(antworten, i.key));
  if (offen.length === 0) return true;
  const neu = await collectAnswers(offen);
  if (neu === null) return false;
  Object.assign(antworten, neu);
  return true;
}

function befundEnde(name, pfad, befund) {
  return {
    status: 'failed',
    befund: true,
    workflow: name,
    path: pfad,
    line: typeof befund.line === 'number' ? befund.line : null,
    code: befund.code,
    detail: befund.detail || {},
  };
}

// Bereitet einen `workflow`-Schritt vor: Ziel über die Ordner-Liste, Tiefe,
// Kreis, dann die Datei selbst.
async function bereiteUnter(plan, step, lage) {
  const zielName = String(step.args[0]).trim();
  const befund = (code, detail) => ({
    fehler: befundEnde(plan.name, plan.path, { line: step.line, code, detail }),
  });
  if (lage.ebene + 1 >= MAX_CALL_DEPTH) {
    return befund('depthExceeded', { name: zielName, max: MAX_CALL_DEPTH });
  }
  const treffer = lage.liste.filter((w) => w.name === zielName);
  if (treffer.length === 0) return befund('workflowUnknown', { name: zielName });
  if (treffer.length > 1) return befund('workflowAmbiguous', { name: zielName });
  const ziel = treffer[0].absPath;
  const kette = [...lage.kette, plan.path];
  if (kette.some((p) => gleicherPfad(p, ziel))) return befund('selfCall', { name: zielName });
  const text = await leseText(ziel);
  const unter =
    text === null
      ? {
          fehler: {
            status: 'failed',
            workflow: zielName,
            line: null,
            code: 'fileMissing',
            detail: { path: zielName },
          },
        }
      : await bereite(ziel, text, { ...lage, kette, ebene: lage.ebene + 1 });
  if (!unter.fehler) return unter;
  return {
    fehler: {
      status: 'failed',
      workflow: plan.name,
      path: plan.path,
      line: step.line,
      code: 'workflowFailed',
      detail: { name: unter.fehler.workflow, inner: unter.fehler },
    },
  };
}

// Bereitet eine Datei vor. Ergebnis: { plan }, { abbruch: true } oder { fehler }.
async function bereite(pfad, text, lage) {
  const analyse = pruefeWorkflow(text, { fileName: dateiName(pfad) });
  if (!analyse.isWorkflow) {
    const name = dateiName(pfad).replace(MD_EXT_RE, '');
    return { fehler: { status: 'failed', workflow: name, line: null, code: 'notWorkflow' } };
  }
  const { name } = analyse.meta;
  if (!analyse.ok) return { fehler: befundEnde(name, pfad, analyse.findings[0]) };
  if (!(await frage(workflowInputs(analyse.steps), lage.antworten))) return { abbruch: true };
  const bezuege = templateRefs(analyse.steps, lage.kontext, lage.antworten);
  if (bezuege.findings.length > 0) return { fehler: befundEnde(name, pfad, bezuege.findings[0]) };
  const vorlagen = await leseVorlagen(bezuege.refs);
  const eingaben = templateInputs(bezuege.refs, vorlagen, lage.antworten);
  if (eingaben.findings.length > 0) return { fehler: befundEnde(name, pfad, eingaben.findings[0]) };
  if (!(await frage(eingaben.inputs, lage.antworten))) return { abbruch: true };
  const gefuellt = prepareRun(analyse.steps, lage.kontext, lage.antworten, vorlagen, {
    ownName: name,
    ...aktuelleRueckfragen(),
  });
  if (!gefuellt.ok) return { fehler: befundEnde(name, pfad, gefuellt.findings[0]) };
  const plan = { path: pfad, name, steps: gefuellt.steps, children: {} };
  for (const step of gefuellt.steps) {
    if (step.keyword !== 'workflow') continue;
    const unter = await bereiteUnter(plan, step, lage);
    if (!unter.plan) return unter;
    plan.children[step.line] = unter.plan;
  }
  return { plan };
}

// Lauf-Stand in der Form von `normalizeRun` (4T-002348).
function laufStand(ergebnis, startedAt) {
  const run = { status: ergebnis.status, startedAt };
  if (ergebnis.status !== 'ok' && typeof ergebnis.line === 'number') run.line = ergebnis.line;
  if (ergebnis.status === 'failed') run.code = ergebnis.code;
  return run;
}

// 4T-002350: Nach dem Schreiben bekommt die Seite «Workflow-Läufe» das Ergebnis,
// aus dem auch der Hinweis entsteht; eine abgewiesene Antwort des Hauptprozesses
// geht wie ein Fehler in die Konsole.
async function merke(pfad, run, ergebnis = null) {
  try {
    const antwort = await api.workflowRecordRun(pfad, run);
    if (antwort && antwort.ok === false)
      console.warn('[Workflows] Lauf-Stand nicht gespeichert:', pfad, antwort.code);
  } catch (err) {
    console.warn('[Workflows] Lauf-Stand nicht gespeichert:', pfad, err && err.message);
  }
  laufVerbucht(pfad, run, ergebnis);
}

function meldeEnde(ergebnis) {
  const stop = ergebnis.status === 'stopped';
  const key = stop ? 'workflow.lauf.beendet' : 'workflow.lauf.abgebrochen';
  hinweis(key, abbruchText(ergebnis), !stop, ABBRUCH_MS);
}

async function workflowListe() {
  try {
    const liste = await getWorkflowFolderList();
    return liste && Array.isArray(liste.workflows) ? liste.workflows : [];
  } catch (err) {
    console.warn('[Workflows] Liste des Workflow-Ordners nicht lesbar:', err && err.message);
    return [];
  }
}

function laufDeps(startedAt) {
  return {
    step: (pfad, step) => api.workflowStep(pfad, step),
    runWindowAction,
    flushBuffers: flushPendingBuffers,
    executeCommand: (id) => verdrahtung.executeCommand(id),
    runMacro: (name, ebene) => verdrahtung.runMacro(name, ebene),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    notify: (text) =>
      hinweis(
        'workflow.lauf.hinweis',
        einsetzen(t('workflow.lauf.hinweis'), { text }),
        false,
        NOTIFY_MS,
      ),
    finish: (plan, ergebnis) => merke(plan.path, laufStand(ergebnis, startedAt), ergebnis),
  };
}

async function lauf(pfad, text) {
  // Zahl in Millisekunden, wie `normalizeRun` im Hauptprozess sie verlangt (4T-002350).
  const startedAt = Date.now();
  const quelle = typeof text === 'string' ? text : await leseText(pfad);
  if (quelle === null) {
    const name = dateiName(pfad);
    meldeEnde({
      status: 'failed',
      workflow: name,
      line: null,
      code: 'fileMissing',
      detail: { path: name },
    });
    return false;
  }
  const lage = {
    kette: [],
    ebene: 0,
    antworten: {},
    kontext: laufKontext(),
    liste: await workflowListe(),
  };
  const vorbereitet = await bereite(pfad, quelle, lage);
  if (vorbereitet.abbruch) {
    await merke(pfad, { status: 'canceled', startedAt });
    return false;
  }
  if (vorbereitet.fehler) {
    meldeEnde(vorbereitet.fehler);
    if (vorbereitet.fehler.code !== 'notWorkflow')
      await merke(pfad, laufStand(vorbereitet.fehler, startedAt), vorbereitet.fehler);
    return false;
  }
  laufName = vorbereitet.plan.name;
  const ergebnis = await runWorkflow(vorbereitet.plan, laufDeps(startedAt));
  if (ergebnis.status !== 'ok') meldeEnde(ergebnis);
  return ergebnis.status === 'ok';
}

/**
 * Startet einen Workflow in diesem Fenster.
 *
 * @param {{path: string, text?: string}} anfrage `path` absolut; `text` der
 *   Stand im Editor, sonst wird er gelesen.
 * @returns {Promise<boolean>} true, wenn der Lauf bis zum Ende gelungen ist.
 */
export async function starteWorkflow({ path, text } = {}) {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return false;
  if (laufName !== null) {
    const meldung = einsetzen(t('workflow.lauf.laeuftBereits'), { name: laufName });
    hinweis('workflow.lauf.laeuftBereits', meldung, true, ABBRUCH_MS);
    return false;
  }
  if (typeof path !== 'string' || path === '') return false;
  laufName = dateiName(path).replace(MD_EXT_RE, '');
  try {
    return await lauf(path, text);
  } catch (err) {
    console.error('[Workflows] Lauf fehlgeschlagen:', err);
    meldeEnde({ status: 'failed', workflow: laufName, line: null, code: 'unexpected', detail: {} });
    return false;
  } finally {
    laufName = null;
  }
}
