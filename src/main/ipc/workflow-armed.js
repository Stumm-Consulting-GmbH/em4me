// 4T-002422 (Epic 3E-000366, Story 4S-001133): Die Kanäle der Scharf-Schaltung
// eines Workflows nach Zeitplan (Entscheidung 2e der Konzept-Runde 4T-002418).
//
// Kanäle (Namensraum workflow:*, wie Ausführung, Ordner und Seite):
//   workflow:setArmed     Fenster -> Hauptprozess (invoke), Nutzlast
//                         { workflowPath, armed: boolean }; Antwort
//                         { ok: true, status, nextDue } oder
//                         { ok: false, code, findings? }.
//   workflow:armedState   Fenster -> Hauptprozess (invoke), Nutzlast
//                         { workflowPath }; Antwort { ok: true, isWorkflow,
//                         scheduled, status, nextDue } oder { ok: false, code }.
//                         Für den Knopf über dem Block und das Kontextmenü des
//                         Bereichs-Panels, die nur eine Datei kennen.
//
// **Scharf schalten** fährt zuerst das Prüfen vor Laufen (G6) am Text, den auch
// der Zeitplan-Prüfer sieht (ungespeicherter Stand vor der Platte,
// `readWorkflowText`), und weist ab, wenn `armable` fehlt — auch beim Befund
// «nur von Hand» (`manualOnly`, 4T-002419); die Befunde gehen mit Zeile und
// Code an das Fenster zurück. Danach schreibt es Prüfsumme (`definitionsPruefsumme`)
// und ersten Termin ab der Wanduhr-Minute der Scharf-Schaltung in einer
// Änderung (`setArmedSchedule`). **Entschärfen** nimmt beides zurück; es fragt
// weder Auslöser noch Erweiterung, weil das Zurücknehmen nie etwas auslöst.
//
// **Grenzen** (fail-closed, der Kanal ist eine Vertrauens-Grenze): nur Pfade in
// der Bereichs-Wurzel des SENDENDEN Fensters — ein Workflow eines verknüpften
// Bereichs wird abgewiesen (2h, 4T-002426, wie `workflow:recordRun`); nur
// Workflows mit `trigger: schedule`; scharf schalten nur bei eingeschalteter
// Erweiterung «Workflows».
//
// **Prüfung im Hauptprozess ohne die Rückfragen des Fensters:** Ob ein
// Kommando, Makro oder Workflow bekannt ist, weiß allein das Fenster
// (Registrierung in workflow-pruefung.js); dynamische Kommandos fehlen der
// Registry des Hauptprozesses. Der Kern lässt diese Prüfungen ohne Rückfrage
// aus. Das Fenster prüft deshalb vor dem Aufruf mit allen Rückfragen
// (workflow-scharf.js), der Hauptprozess dahinter fail-closed mit allem, was er
// selbst weiß: Form, Zeitplan, «nur von Hand», Pfade, Vorlagen-Schalter.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { isInsideArea } = require('../area/area-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { localNowString } = require('../../shared/reminders.js');
const { analyzeWorkflow } = require('../../shared/workflows/workflow-core.js');
const { WORKFLOWS_EXTENSION_ID } = require('../../shared/workflows/workflow-konstanten.js');
const {
  SCHEDULE_TRIGGER,
  nextScheduleDue,
} = require('../../shared/workflows/workflow-schedule.js');
const { definitionsPruefsumme } = require('../workflows/workflow-definition-hash.js');
const {
  ARMED_STATUS,
  armedStatus,
  createWorkflowRunState,
} = require('../workflows/workflow-run-state.js');
const { readRunState, readWorkflowText } = require('./workflow-runs.js');

const MAX_PFAD = 4096;
const istObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Ein Befund in übertragbarer Form: Code, Zeile, Angaben.
function befundAus(f) {
  return {
    code: f.code,
    line: Number.isInteger(f.line) ? f.line : null,
    detail: istObjekt(f.detail) ? { ...f.detail } : {},
  };
}

/**
 * Registriert die Kanäle der Scharf-Schaltung.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {object} deps.backlinks Bereichs-Index (`bufferTextFor`).
 * @param {() => object|null} [deps.getStore] Einstellungs-Speicher (Schalter der Erweiterungen).
 * @param {() => number} [deps.now] Uhr in Millisekunden (Prüffälle).
 */
function registerWorkflowArmedIpc(handle, deps) {
  const { senderWindow, areaOfWindow, backlinks } = deps;
  const laufStand = createWorkflowRunState(deps);
  const jetztMs = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const ausListe = () => {
    const store = typeof deps.getStore === 'function' ? deps.getStore() : null;
    const liste = store ? store.get('extensions.disabled') : [];
    return Array.isArray(liste) ? liste : [];
  };

  // Bereichs-Wurzel des Absenders und die Workflow-Datei darin.
  function lage(event, nutzlast) {
    const owner = senderWindow(event);
    const area = owner ? areaOfWindow(owner) : null;
    if (!area || !area.rootPath) return { ok: false, code: 'noArea' };
    const pfad = istObjekt(nutzlast) ? nutzlast.workflowPath : null;
    if (typeof pfad !== 'string' || pfad.length > MAX_PFAD || !path.isAbsolute(pfad)) {
      return { ok: false, code: 'invalidPath' };
    }
    const abs = path.resolve(pfad);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, code: 'outsideArea' };
    return { ok: true, owner, abs };
  }

  // Text und Prüfung der Datei, dazu der gelesene Lauf-Stand.
  async function lies(abs) {
    const text = await readWorkflowText(abs, backlinks);
    if (text === null) return { ok: false, code: 'unreadable' };
    const analyse = analyzeWorkflow(text, {
      fileName: path.basename(abs),
      templatesEnabled: isExtensionEnabled('templates', ausListe()),
    });
    if (!analyse.isWorkflow) return { ok: false, code: 'notWorkflow' };
    return { ok: true, text, analyse };
  }

  async function schalteScharf(ort) {
    if (!isExtensionEnabled(WORKFLOWS_EXTENSION_ID, ausListe())) {
      return { ok: false, code: 'extensionOff' };
    }
    const datei = await lies(ort.abs);
    if (!datei.ok) return datei;
    const { analyse, text } = datei;
    if (analyse.meta.trigger !== SCHEDULE_TRIGGER) return { ok: false, code: 'noSchedule' };
    const hash = definitionsPruefsumme(text);
    if (!analyse.armable || hash === null) {
      return { ok: false, code: 'findings', findings: analyse.findings.map(befundAus) };
    }
    const nextDue = nextScheduleDue(analyse.meta.schedule, localNowString(new Date(jetztMs())));
    if (nextDue === null) return { ok: false, code: 'noNextDue' };
    const res = await laufStand.setArmedSchedule(ort.owner, ort.abs, { hash, nextDue });
    if (!res.ok) return res;
    return { ok: true, status: ARMED_STATUS.armed, nextDue };
  }

  handle('workflow:setArmed', async (event, nutzlast) => {
    const ort = lage(event, nutzlast);
    if (!ort.ok) return ort;
    if (typeof nutzlast.armed !== 'boolean') return { ok: false, code: 'invalidPath' };
    try {
      if (nutzlast.armed) return await schalteScharf(ort);
      const res = await laufStand.setArmedSchedule(ort.owner, ort.abs, null);
      if (!res.ok) return res;
      return { ok: true, status: ARMED_STATUS.notArmed, nextDue: null };
    } catch (err) {
      console.error('[workflow] Scharf-Schaltung fehlgeschlagen:', err && err.message);
      return { ok: false, code: 'unexpected' };
    }
  });

  handle('workflow:armedState', async (event, nutzlast) => {
    const ort = lage(event, nutzlast);
    if (!ort.ok) return ort;
    try {
      const datei = await lies(ort.abs);
      if (!datei.ok) {
        return datei.code === 'notWorkflow' ? { ok: true, isWorkflow: false } : datei;
      }
      const { stand, defekt } = await readRunState(ort.abs);
      const armed = !defekt && stand ? stand.armed : null;
      const status = armedStatus(armed, datei.text);
      return {
        ok: true,
        isWorkflow: true,
        scheduled: datei.analyse.meta.trigger === SCHEDULE_TRIGGER,
        status,
        nextDue: status === ARMED_STATUS.armed && stand ? stand.nextDue : null,
      };
    } catch (err) {
      console.error('[workflow] Scharf-Zustand nicht lesbar:', err && err.message);
      return { ok: false, code: 'unexpected' };
    }
  });
}

module.exports = { registerWorkflowArmedIpc };
