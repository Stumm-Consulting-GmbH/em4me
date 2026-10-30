// 4T-002349 (Epic 3E-000184): Die Workflows des Workflow-Ordners als Kommandos.
//
// Jeder Workflow der Liste aus 4T-002355 (`workflow-folder-list.js`) wird ein
// reguläres Kommando der Registry im Namensraum `workflow.<Pfad-Kennung>`
// (Story 4S-001105, Regel S1 in der Fassung von 3c). Vorbild sind die Makros
// (`syncMacroCommands` in macros.js): Als Registry-Kommando ist ein Workflow ohne
// Sonderpfad in der Kommando-Palette zu finden, über die Kommando-Platzierung auf
// Statusleiste und Kontextmenü zu legen und unter «Einstellungen →
// Tastenkürzel» zu belegen. Die Bezeichnung ist der Name des Workflows, über den
// Laufzeit-Übersetzungs-Weg der Erweiterungen.
//
// Workflow-Dateien außerhalb des Ordners erscheinen nicht (AK5 der Story); sie
// starten über den Knopf am Block.
//
// **Workflows verknüpfter Bereiche** (4T-002426, Epic 3E-000366, Entscheidung 2h):
// Die fremden Workflows der Liste (`linked`) werden ebenso Kommandos, mit der
// Kennung `workflow.@<Kürzel>:<Pfad-Kennung>` (`linkedWorkflowCommandId`) und der
// Bezeichnung «Name (@kürzel)» (`workflow-fremd.js`). Sie starten wie ein eigener
// Workflow und wirken in der eigenen Wurzel. In die Namens-Zählung der Prüfung
// (`zaehleWorkflows`) gehen sie nicht ein: Ein Aufruf per Name löst allein im
// eigenen Bereich auf, ein zugestimmter fremder Bereich macht einen eigenen
// Aufruf also nie mehrdeutig.
//
// Verdrahtung über `initWorkflowCommands`, gerufen aus `initMacros` mit derselben
// Handler-Verdrahtung, weil app-init.js auf seinem eingefrorenen Wert steht.
'use strict';

import { registerExtensionTranslations } from '../../i18n.js';
import { renderCommandButtons } from '../command-placement.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { getWorkflowFolderList, onWorkflowFolderListChanged } from './workflow-folder-list.js';
import {
  fremdeBezeichnung,
  fremdeWorkflows,
  initFremdeWorkflows,
  merkeFremde,
} from './workflow-fremd.js';
import { richteGerenderteKoepfeEin } from './workflow-kopf-gerendert.js';
import { initWorkflowLaeufe } from './workflow-laeufe-seite.js';
import { initWorkflowMenue } from './workflow-menue.js';
import { registriereRueckfragen } from './workflow-pruefung.js';
import { registriereScharfKnopf } from './workflow-scharf-knopf.js';
import { registriereStartKnopf } from './workflow-start-knopf.js';
import { initWorkflowStart, laeuftWorkflow, starteWorkflow } from './workflow-start.js';
import { initWorkflowZeitplanLauf } from './workflow-zeitplan-lauf.js';
import {
  COMMANDS,
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../../shared/commands/commands.js';
import {
  WORKFLOW_COMMAND_PREFIX,
  linkedWorkflowCommandId,
  workflowCommandId,
} from '../../../shared/workflows/workflow-command-id.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';

// Namensraum der Laufzeit-Bezeichnungen (ext.<ns>.<Pfad-Kennung>); bewusst kein
// realer Erweiterungs-Ordnername, Muster der Makros.
const I18N_NAMESPACE = 'workflows-ordner';

let wiring = null; // { registerHandler, unregisterHandler, refreshHotkeys }
let workflows = [];
let fremde = []; // 4T-002426: Workflows der zugestimmten verknüpften Bereiche

function gueltig(eintrag) {
  return (
    eintrag &&
    typeof eintrag.name === 'string' &&
    eintrag.name !== '' &&
    typeof eintrag.relPath === 'string' &&
    typeof eintrag.absPath === 'string' &&
    eintrag.absPath !== ''
  );
}

/**
 * Wie viele Workflows der Liste diesen Namen tragen (Rückfrage der Prüfung;
 * mehr als einer ist mehrdeutig, E1).
 *
 * @param {string} name
 * @returns {number}
 */
export function zaehleWorkflows(name) {
  return workflows.filter((w) => w.name === name).length;
}

/**
 * Gleicht die `workflow.`-Kommandos mit der Liste ab: alle abmelden, dann den
 * aktuellen Bestand anmelden (im Aus-Zustand der Erweiterung keinen).
 *
 * @param {{workflows?: object[]}|null} liste Liste aus workflow-folder-list.js.
 */
export function syncWorkflowCommands(liste) {
  workflows = liste && Array.isArray(liste.workflows) ? liste.workflows.filter(gueltig) : [];
  fremde = fremdeWorkflows(liste).filter(gueltig);
  merkeFremde(liste);
  if (!wiring) return;
  const bisher = COMMANDS.filter(
    (c) => c.dynamic === true && c.id.startsWith(WORKFLOW_COMMAND_PREFIX),
  ).map((c) => c.id);
  for (const id of bisher) {
    unregisterDynamicCommand(id);
    wiring.unregisterHandler(id);
  }
  const an = isExtensionActive(WORKFLOWS_EXTENSION_ID);
  const eintraege = an ? workflows : [];
  const buendel = {};
  const neu = [];
  for (const eintrag of eintraege) {
    const id = workflowCommandId(eintrag.relPath);
    if (!id) continue;
    const schluessel = id.slice(WORKFLOW_COMMAND_PREFIX.length);
    buendel[schluessel] = eintrag.name;
    neu.push({ id, schluessel, eintrag });
  }
  // 4T-002426: die fremden Workflows, je mit dem Kürzel ihrer Quelle.
  for (const eintrag of an ? fremde : []) {
    const id = linkedWorkflowCommandId(eintrag.sourceKey, eintrag.relPath);
    if (!id || neu.some((n) => n.id === id)) continue;
    const schluessel = id.slice(WORKFLOW_COMMAND_PREFIX.length);
    buendel[schluessel] = fremdeBezeichnung(eintrag.name, eintrag.sourceKey);
    neu.push({ id, schluessel, eintrag });
  }
  registerExtensionTranslations(I18N_NAMESPACE, { en: buendel }, 'en');
  for (const { id, schluessel, eintrag } of neu) {
    registerDynamicCommand({ id, labelKey: `ext.${I18N_NAMESPACE}.${schluessel}` });
    wiring.registerHandler(id, () => {
      // Während eines Laufs weist der Start mit Hinweis ab; false meldet das
      // einem Makro, das dieses Kommando als Schritt aufruft.
      const besetzt = laeuftWorkflow();
      void starteWorkflow({ path: eintrag.absPath });
      if (besetzt) return false;
      return undefined;
    });
  }
  wiring.refreshHotkeys();
  renderCommandButtons();
}

async function holeListe() {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) {
    syncWorkflowCommands({ workflows, linked: [] });
    return;
  }
  try {
    syncWorkflowCommands(await getWorkflowFolderList());
  } catch (err) {
    console.warn('[Workflows] Liste des Workflow-Ordners nicht lesbar:', err && err.message);
  }
}

/**
 * Verdrahtet Kommandos, Start und Knopf.
 *
 * @param {{registerHandler: Function, unregisterHandler: Function,
 *   refreshHotkeys: Function, executeCommand: Function, runMacro: Function}} w
 */
export function initWorkflowCommands(w) {
  wiring = w;
  // 4T-002426: Ergebnis eines fremden Laufs in der Statusleiste.
  initFremdeWorkflows();
  initWorkflowStart({ executeCommand: w.executeCommand, runMacro: w.runMacro });
  registriereRueckfragen({ isKnownWorkflow: zaehleWorkflows });
  registriereStartKnopf();
  // 4T-002422: «Scharf» rechts neben «Starten», nur bei `trigger: schedule`.
  registriereScharfKnopf();
  // 4T-002351: Kopfzeile samt Knopf auch in der gerenderten Ansicht (PO 2026-10-23).
  richteGerenderteKoepfeEin();
  // 4T-002350: Seite «Workflow-Läufe» und ihr Kommando, mit derselben Verdrahtung.
  initWorkflowLaeufe(w);
  // 4T-002355: Handgriffe des Untermenüs «Datei → Workflows» und «Neuer Workflow …».
  initWorkflowMenue(w);
  // 4T-002421: Empfang der Läufe nach Zeitplan samt Nachholen des offenen Stands.
  void initWorkflowZeitplanLauf();
  onWorkflowFolderListChanged((liste) => syncWorkflowCommands(liste));
  document.addEventListener('scg:extensions-changed', () => void holeListe());
  void holeListe();
}
