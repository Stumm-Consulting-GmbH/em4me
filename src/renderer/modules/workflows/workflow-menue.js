// 4T-002355 (Epic 3E-000184): Die Handgriffe des Untermenüs «Datei → Workflows»
// im Fenster und das Kommando «Neuer Workflow …».
//
// **Eine Meldung, vier Handgriffe.** Das Menü baut der Hauptprozess
// (`src/main/menu/menu-workflows.js`); ein Klick kommt als `workflow:menuAction`
// mit der Art der Handlung hier an: `start` startet den Workflow des Pfades über
// den Start aus 4T-002349, `runs` ruft das Kommando der Seite «Workflow-Läufe»
// (4T-002350), `new` legt einen Workflow an, `folder` öffnet die Einstellungen
// beim Abschnitt «Workflows» des Bereichs (ohne Bereich beim anwendungsweiten).
//
// **«Neuer Workflow …»** (Entscheidung 3d der Konzept-Stufe, Story 4S-001109):
// Ohne festgelegten Ordner fragt er zuerst nach dem Ordner und hält die Wahl
// fest (mit Bereich in dessen Einstellungen, sonst anwendungsweit), danach nach
// dem Namen; die Datei legt der Hauptprozess an (`workflow:create`), danach
// öffnet sie sich in der aktiven Spalte. Als Kommando steht er im Namensraum
// der internen Erweiterung (`ext.workflows.newWorkflow`), weil die
// Kommando-Registry auf ihrem eingefrorenen Wert steht — Muster des Kommandos
// der Seite «Workflow-Läufe».
//
// Verdrahtung über `initWorkflowMenue`, gerufen aus `initWorkflowCommands`.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { renderCommandButtons } from '../command-placement.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { activateSection } from '../settings/settings-mount.js';
import { openSettingsPage } from '../settings/settings-page.js';
import { openInPane } from '../tabs/tabs.js';
import { showStatusbarHint } from '../views/views.js';
import { starteWorkflow } from './workflow-start.js';
import {
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../../shared/commands/commands.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';

// Kommando der Seite «Workflow-Läufe» (4T-002350, workflow-laeufe-seite.js).
export const WORKFLOW_RUNS_COMMAND_ID = 'ext.workflows.openRuns';
export const NEW_WORKFLOW_COMMAND_ID = 'ext.workflows.newWorkflow';

// Hinweis je Code des Hauptprozesses (workflow-new-file.js und workflow:create).
const FEHLER_HINWEIS = {
  invalidName: 'areaPanel.newNameInvalid',
  exists: 'workflow.neu.existiert',
  folderMissing: 'workflow.neu.ordnerFehlt',
  noFolder: 'workflow.neu.ordnerFehlt',
};

let wiring = null; // { executeCommand, registerHandler, unregisterHandler, refreshHotkeys }
let angemeldet = false;

function hinweis(key) {
  showStatusbarHint(key, { duration: 4000, error: true });
}

async function rufe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Öffnet die Einstellungen beim Abschnitt «Workflows» des Bereichs, ohne
 * Bereich beim anwendungsweiten Abschnitt.
 */
export function oeffneOrdnerEinstellung() {
  openSettingsPage();
  activateSection(state.areaPath ? 'workflowsArea' : 'workflows');
}

// Ohne festgelegten Ordner zuerst den Ordner erfragen und festhalten.
async function sichereOrdner() {
  const liste = await rufe(() => api.workflowFolderList());
  if (!liste || !liste.ok || !liste.enabled) return false;
  if (liste.folder) return true;
  const wahl = await rufe(() => api.templatesChooseFolder('workflows'));
  if (!wahl || !wahl.ok || !wahl.path) return false;
  const gesetzt = await rufe(() => api.workflowSetFolder(wahl.path));
  if (gesetzt && gesetzt.ok) return true;
  hinweis('workflow.neu.ordnerNichtGesetzt');
  return false;
}

/**
 * «Neuer Workflow …»: Ordner sicherstellen, Namen erfragen, Datei anlegen und
 * öffnen.
 *
 * @returns {Promise<boolean>} true, wenn eine Datei angelegt wurde.
 */
export async function neuerWorkflow() {
  if (!(await sichereOrdner())) return false;
  const name = await showNameInputDialog({
    title: t('workflow.neu.titel'),
    description: t('workflow.neu.beschreibung'),
    okLabel: t('workflow.neu.anlegen'),
    validate: (wert) => (String(wert || '').trim() === '' ? 'workflow.neu.nameLeer' : null),
  });
  if (!name) return false;
  const ergebnis = await rufe(() => api.workflowCreate(name));
  if (!ergebnis || !ergebnis.ok) {
    hinweis(FEHLER_HINWEIS[ergebnis && ergebnis.code] || 'workflow.neu.fehler');
    return false;
  }
  await openInPane(state.activePaneIndex, [ergebnis.path]);
  return true;
}

/**
 * Führt einen Handgriff des Untermenüs aus.
 *
 * @param {{kind: string, path?: string}} aktion Nutzlast von `workflow:menuAction`.
 */
export function fuehreMenueAktionAus(aktion) {
  const art = aktion && aktion.kind;
  if (art === 'start' && typeof aktion.path === 'string' && aktion.path !== '') {
    void starteWorkflow({ path: aktion.path });
  } else if (art === 'runs' && wiring) {
    void wiring.executeCommand(WORKFLOW_RUNS_COMMAND_ID);
  } else if (art === 'new') {
    void neuerWorkflow();
  } else if (art === 'folder') {
    oeffneOrdnerEinstellung();
  }
}

// Das Kommando steht nur bei eingeschalteter Erweiterung (Muster der übrigen
// Workflow-Kommandos).
function syncKommando() {
  if (!wiring) return;
  unregisterDynamicCommand(NEW_WORKFLOW_COMMAND_ID);
  wiring.unregisterHandler(NEW_WORKFLOW_COMMAND_ID);
  if (isExtensionActive(WORKFLOWS_EXTENSION_ID)) {
    registerDynamicCommand({ id: NEW_WORKFLOW_COMMAND_ID, labelKey: 'workflow.menu.new' });
    wiring.registerHandler(NEW_WORKFLOW_COMMAND_ID, () => void neuerWorkflow());
  }
  wiring.refreshHotkeys();
  renderCommandButtons();
}

/**
 * Verdrahtet die Meldung des Menüs und das Kommando.
 *
 * @param {{executeCommand: Function, registerHandler: Function,
 *   unregisterHandler: Function, refreshHotkeys: Function}} w
 */
export function initWorkflowMenue(w) {
  wiring = w;
  syncKommando();
  if (angemeldet) return;
  angemeldet = true;
  // Ohne Brücken-Eintrag (Prüfumgebungen anderer Module) bleibt allein das Kommando.
  if (typeof api.onWorkflowMenuAction === 'function') {
    api.onWorkflowMenuAction((aktion) => fuehreMenueAktionAus(aktion));
  }
  document.addEventListener('scg:extensions-changed', () => syncKommando());
}
