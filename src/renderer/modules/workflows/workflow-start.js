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
//   4. Lauf-Stand je gelaufener Datei über `workflow:recordRun` (4T-002348; ein
//      fremder Workflow bekommt keinen, 4T-002426, workflow-fremd.js) und
//      der Hinweis in der Statusleiste; danach die Meldung an die Seite
//      «Workflow-Läufe» mit demselben Ergebnis (4T-002350, workflow-lauf-stand.js).
//
// **Lauf nach Zeitplan** (4T-002421, Story 4S-001132): Der Empfänger im Fenster
// (workflow-zeitplan-lauf.js) startet mit der Herkunft `schedule` oder
// `catch-up`. Ein solcher Lauf hat keinen Zuschauer: Eine offene Eingabe — auch
// aus einer mit `from-template` eingesetzten Vorlage, die das Prüfen vor Laufen
// nicht sieht — und die Befehle `confirm` und `delete` beenden ihn vor dem
// ersten Schritt mit dem Befund `manualOnly`, ohne Dialog. Alle übrigen Regeln
// gelten wie beim Start von Hand. Mit dem Lauf-Stand gehen Herkunft und Journal
// an den Hauptprozess; das Journal sammelt die Pfade, die die Schritte als
// berührt melden. `notify` und ein Fehlschlag gehen bei ihm zusätzlich als
// Benachrichtigung des Betriebssystems hinaus (4T-002423,
// workflow-benachrichtigung.js).
//
// **Pflege-Befehle** (4T-002424, Regeln P1 und P4): Enthält der vorbereitete
// Lauf samt aufgerufener Workflows ein `delete`, nennt **eine** Bestätigung
// vor dem ersten Schritt alle Ziele mit Pfad; «Nein» lässt keinen Schritt
// laufen und verbucht `canceled`. Vor jedem `delete` schließt das Fenster seine
// Reiter auf das Ziel. `confirm` stellt seine Frage im Lauf mit «Ja» und
// «Nein». Beides gibt es nur beim Start von Hand; ein Lauf nach Zeitplan ist
// schon in der Vorbereitung abgewiesen.
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
import { verbucheLaufStand } from './workflow-fremd.js';
import { ABBRUCH_MS, meldeEnde, meldeNotify } from './workflow-benachrichtigung.js';
import { initWorkflowStatusleiste } from './workflow-statusleiste.js';
import { einsetzen } from './workflow-lauf-texte.js';
import { ZEITPLAN_HERKUNFT, laufVerbucht } from './workflow-lauf-stand.js';
import { aktuelleRueckfragen, pruefeWorkflow } from './workflow-pruefung.js';
import {
  bestaetigeLoeschZiele,
  flushPendingBuffers,
  frageJaNein,
  runWindowAction,
  schliesseVorDemLoeschen,
} from './workflow-window.js';
import { MD_EXT_RE } from '../../../shared/markdown/link-scan.js';
import { toLogicalName } from '../../../shared/subpages.js';
import {
  MANUAL_ONLY_COMMANDS,
  prepareRun,
  templateInputs,
  templateRefs,
  workflowInputs,
} from '../../../shared/workflows/workflow-core.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';
import {
  MAX_CALL_DEPTH,
  deleteTargets,
  runWorkflow,
} from '../../../shared/workflows/workflow-runner.js';

// Wirkungen, die keine Datei verändern, gehören nicht ins Journal.
const UNBERUEHRT = Object.freeze(['unchanged', 'opened', 'closed']);

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
  // 4T-002423: das Statusleisten-Element «Workflows» öffnet die Seite über
  // dieselbe Kommando-Ausführung.
  initWorkflowStatusleiste({ executeCommand: (id) => verdrahtung.executeCommand(id) });
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

// Text der Zwischenablage zum Start des Laufs (4T-002424, Story 4S-001136);
// leer, wenn sie leer oder nicht lesbar ist — das ist kein Fehlschlag.
function zwischenablage() {
  try {
    const text = typeof api.clipboardReadText === 'function' ? api.clipboardReadText() : '';
    return typeof text === 'string' ? text : '';
  } catch (err) {
    console.warn('[Workflows] Zwischenablage nicht lesbar:', err && err.message);
    return '';
  }
}

// Kontext des aktiven Dokuments für die Befehls-Zeilen (S-b), mit der
// Zwischenablage einmal je Lauf wie die Uhrzeit.
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
    clipboard: zwischenablage(),
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

// Stellt die noch offenen Fragen; false bei Abbruch eines Dialogs. Ohne
// Zuschauer (Lauf nach Zeitplan) wird nie gefragt: Die erste offene Eingabe
// kommt als `{ offen }` zurück.
async function frage(inputs, lage) {
  const { antworten } = lage;
  const offen = inputs.filter((i) => !Object.prototype.hasOwnProperty.call(antworten, i.key));
  if (offen.length === 0) return true;
  if (lage.unbeaufsichtigt) return { offen: offen[0] };
  const neu = await collectAnswers(offen);
  if (neu === null) return false;
  Object.assign(antworten, neu);
  return true;
}

// Zeile, an der eine Eingabe entsteht: der Schritt, der sie trägt, oder die
// Zeile, die die Vorlage einsetzt.
function zeileDerEingabe(key, steps, refs, vorlagen) {
  const schritt = steps.find((s) => workflowInputs([s]).some((i) => i.key === key));
  if (schritt) return schritt.line;
  const ref = (refs || []).find((r) =>
    templateInputs([r], vorlagen, {}).inputs.some((i) => i.key === key),
  );
  return ref ? ref.line : null;
}

function ohneZuschauer(name, pfad, line, detail) {
  return { fehler: befundEnde(name, pfad, { line, code: 'manualOnly', detail }) };
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
  if (lage.unbeaufsichtigt) {
    const nurVonHand = analyse.steps.find((s) => MANUAL_ONLY_COMMANDS.includes(s.keyword));
    if (nurVonHand) {
      return ohneZuschauer(name, pfad, nurVonHand.line, { keyword: nurVonHand.keyword });
    }
  }
  const befehle = await frage(workflowInputs(analyse.steps), lage);
  if (befehle === false) return { abbruch: true };
  if (befehle.offen) {
    const zeile = zeileDerEingabe(befehle.offen.key, analyse.steps, [], {});
    return ohneZuschauer(name, pfad, zeile, { placeholder: befehle.offen.kind });
  }
  const bezuege = templateRefs(analyse.steps, lage.kontext, lage.antworten);
  if (bezuege.findings.length > 0) return { fehler: befundEnde(name, pfad, bezuege.findings[0]) };
  const vorlagen = await leseVorlagen(bezuege.refs);
  const eingaben = templateInputs(bezuege.refs, vorlagen, lage.antworten);
  if (eingaben.findings.length > 0) return { fehler: befundEnde(name, pfad, eingaben.findings[0]) };
  const vorlagenFragen = await frage(eingaben.inputs, lage);
  if (vorlagenFragen === false) return { abbruch: true };
  if (vorlagenFragen.offen) {
    const key = vorlagenFragen.offen.key;
    const zeile = zeileDerEingabe(key, analyse.steps, bezuege.refs, vorlagen);
    return ohneZuschauer(name, pfad, zeile, { placeholder: vorlagenFragen.offen.kind });
  }
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

// Lauf-Stand in der Form von `normalizeRun` (4T-002348). Die Herkunft geht
// nur bei einem Lauf nach Zeitplan mit, weil der Hauptprozess ohne Angabe
// `manual` setzt (4T-002420); das Journal, sobald der Lauf Schritte hatte.
function laufStand(ergebnis, startedAt, extra = {}) {
  const run = { status: ergebnis.status, startedAt };
  if (ergebnis.status !== 'ok' && typeof ergebnis.line === 'number') run.line = ergebnis.line;
  if (ergebnis.status === 'failed') run.code = ergebnis.code;
  if (ZEITPLAN_HERKUNFT.includes(extra.origin)) run.origin = extra.origin;
  if (Array.isArray(extra.journal)) run.journal = extra.journal;
  return run;
}

// 4T-002350: Nach dem Schreiben bekommt die Seite «Workflow-Läufe» das Ergebnis,
// aus dem auch der Hinweis entsteht; eine abgewiesene Antwort des Hauptprozesses
// geht wie ein Fehler in die Konsole.
async function merke(pfad, run, ergebnis = null) {
  await verbucheLaufStand(pfad, run); // 4T-002426: ein fremder Workflow ohne Lauf-Stand
  laufVerbucht(pfad, run, ergebnis);
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

// Das Journal eines Laufs (2g): je Workflow-Datei die Pfade, die ein Schritt
// als berührt meldet, mit Zeile und Befehl. Ein Fenster-Handgriff meldet seine
// Wirkung erst nach seiner Ausführung; er gehört zur Datei des Schritts davor.
function neuesJournal() {
  const jeDatei = new Map();
  let letzteDatei = null;
  function vermerke(pfad, antwort) {
    const wirkung = antwort && antwort.ok ? antwort.effect : null;
    if (!wirkung || !Array.isArray(wirkung.paths) || UNBERUEHRT.includes(wirkung.kind)) return;
    if (!jeDatei.has(pfad)) jeDatei.set(pfad, []);
    for (const p of wirkung.paths) {
      if (typeof p !== 'string' || p === '') continue;
      jeDatei.get(pfad).push({ line: antwort.line, command: antwort.keyword, path: p });
    }
  }
  return {
    async step(pfad, step) {
      letzteDatei = pfad;
      if (step.keyword === 'delete' && !(await schliesseVorDemLoeschen(step.args[0]))) {
        const detail = { path: step.args[0] };
        return { ok: false, line: step.line, keyword: step.keyword, code: 'closeCanceled', detail };
      }
      const antwort = await api.workflowStep(pfad, step);
      vermerke(pfad, antwort);
      return antwort;
    },
    async runWindowAction(antwort) {
      const pfad = letzteDatei;
      const ergebnis = await runWindowAction(antwort);
      vermerke(pfad, ergebnis);
      return ergebnis;
    },
    von: (pfad) => jeDatei.get(pfad) || [],
  };
}

function laufDeps(startedAt, herkunft) {
  const journal = neuesJournal();
  return {
    step: journal.step,
    runWindowAction: journal.runWindowAction,
    flushBuffers: flushPendingBuffers,
    executeCommand: (id) => verdrahtung.executeCommand(id),
    runMacro: (name, ebene) => verdrahtung.runMacro(name, ebene),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    confirm: (frage) => frageJaNein(laufName, frage),
    // 4T-002423: nach Zeitplan zusätzlich als Benachrichtigung des Betriebssystems.
    notify: (text) => meldeNotify(text, { name: laufName, herkunft }),
    finish: (plan, ergebnis) =>
      merke(
        plan.path,
        laufStand(ergebnis, startedAt, { origin: herkunft, journal: journal.von(plan.path) }),
        ergebnis,
      ),
  };
}

async function lauf(pfad, text, herkunft) {
  // Zahl in Millisekunden, wie `normalizeRun` im Hauptprozess sie verlangt (4T-002350).
  const startedAt = Date.now();
  const quelle = typeof text === 'string' ? text : await leseText(pfad);
  if (quelle === null) {
    const name = dateiName(pfad);
    meldeEnde(
      { status: 'failed', workflow: name, line: null, code: 'fileMissing', detail: { path: name } },
      herkunft,
    );
    return false;
  }
  const lage = {
    kette: [],
    ebene: 0,
    antworten: {},
    unbeaufsichtigt: herkunft !== 'manual',
    kontext: laufKontext(),
    liste: await workflowListe(),
  };
  const vorbereitet = await bereite(pfad, quelle, lage);
  if (vorbereitet.abbruch) {
    await merke(pfad, laufStand({ status: 'canceled' }, startedAt, { origin: herkunft }));
    return false;
  }
  if (vorbereitet.fehler) {
    meldeEnde(vorbereitet.fehler, herkunft);
    if (vorbereitet.fehler.code !== 'notWorkflow') {
      const run = laufStand(vorbereitet.fehler, startedAt, { origin: herkunft });
      await merke(pfad, run, vorbereitet.fehler);
    }
    return false;
  }
  laufName = vorbereitet.plan.name;
  const ziele = deleteTargets(vorbereitet.plan);
  if (ziele.length > 0 && !(await bestaetigeLoeschZiele(laufName, ziele))) {
    await merke(pfad, laufStand({ status: 'canceled' }, startedAt, { origin: herkunft }));
    return false;
  }
  const ergebnis = await runWorkflow(vorbereitet.plan, laufDeps(startedAt, herkunft));
  if (ergebnis.status !== 'ok') meldeEnde(ergebnis, herkunft);
  return ergebnis.status === 'ok';
}

/**
 * Startet einen Workflow in diesem Fenster.
 *
 * @param {{path: string, text?: string, origin?: string}} anfrage `path` absolut;
 *   `text` der Stand im Editor, sonst wird er gelesen; `origin` `schedule` oder
 *   `catch-up` für einen Lauf nach Zeitplan (4T-002421), sonst Start von Hand.
 * @returns {Promise<boolean>} true, wenn der Lauf bis zum Ende gelungen ist.
 */
export async function starteWorkflow({ path, text, origin } = {}) {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return false;
  if (laufName !== null) {
    const meldung = einsetzen(t('workflow.lauf.laeuftBereits'), { name: laufName });
    hinweis('workflow.lauf.laeuftBereits', meldung, true, ABBRUCH_MS);
    return false;
  }
  if (typeof path !== 'string' || path === '') return false;
  laufName = dateiName(path).replace(MD_EXT_RE, '');
  const herkunft = ZEITPLAN_HERKUNFT.includes(origin) ? origin : 'manual';
  try {
    return await lauf(path, text, herkunft);
  } catch (err) {
    console.error('[Workflows] Lauf fehlgeschlagen:', err);
    const fehler = { status: 'failed', workflow: laufName, line: null, code: 'unexpected' };
    meldeEnde({ ...fehler, detail: {} }, herkunft);
    return false;
  } finally {
    laufName = null;
  }
}
