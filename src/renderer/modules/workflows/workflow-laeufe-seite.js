// 4T-002350 (Epic 3E-000184): Die Seite «Workflow-Läufe» — alle Workflows des
// Bereichs mit letztem Lauf, Ergebnis und Knopf «Starten» (Story 4S-001106).
//
// **Vorbild ist die Übersicht der Datenbank** (`datenbank-uebersicht-seite.js`):
// System-Seite im Reiter-System, eine Instanz je Fenster, lesend bis auf die
// Aktion je Zeile, ohne Sitzungs-Ablage; ein Wurzel-Tor für alle Zugänge, ein
// Knopf «Aktualisieren», flüchtiger Seiten-Zustand.
//
// **Die Daten** kommen aus einem Kanal des Hauptprozesses (`workflow:runs`,
// src/main/ipc/workflow-runs.js): die gekennzeichneten Dateien des Bereichs aus
// dem Index, je mit Name und dem Lauf-Stand ihrer Begleitdatei. Die Seite baut
// keine eigene Erhebung.
//
// **Aktualität** (AK3 des Tasks): Die Seite zieht nach, wenn ein Lauf dieses
// Fensters verbucht ist (workflow-lauf-stand.js), wenn sich die Liste des
// Workflow-Ordners ändert und, gebündelt, wenn der Index des Bereichs eine
// Änderung meldet; nur solange sie offen ist.
//
// **Zugang:** das Kommando `ext.workflows.openRuns` — dynamisch registriert im
// Namensraum der internen Erweiterung `workflows`, weil die Kommando-Registry
// auf ihrem eingefrorenen Wert steht; der Handler liegt in der Verteiler-Tabelle
// der Kommandos, sodass Palette, Tastenkürzel, Kommando-Platzierung und ein
// Menü-Eintrag ihn über `executeCommandById` erreichen. Verdrahtet aus
// `initWorkflowCommands` (workflow-commands.js) mit derselben Handler-Verdrahtung.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import {
  findSystemTabAcrossPanes,
  openSystemPage,
  registerSystemPage,
} from '../app/system-pages.js';
import { renderCommandButtons } from '../command-placement.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { showStatusbarHint } from '../views/views.js';
import { onWorkflowFolderListChanged } from './workflow-folder-list.js';
import { ergebnisText, onLaufVerbucht, zeitpunktText } from './workflow-lauf-stand.js';
import { starteWorkflow } from './workflow-start.js';
import {
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../../shared/commands/commands.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';

export const WORKFLOW_LAEUFE_PAGE_ID = 'workflow-runs';
export const WORKFLOW_LAEUFE_COMMAND_ID = `ext.${WORKFLOWS_EXTENSION_ID}.openRuns`;

// Bündelung der Index-Meldungen: Ein Speichern im Bereich soll nicht je
// Tastendruck alle Workflow-Dateien neu lesen lassen.
const INDEX_BUENDEL_MS = 400;

// Flüchtiger Seiten-Zustand; `frage` zählt die Abfragen, damit eine späte
// Antwort eine jüngere nicht überschreibt.
const seite = { container: null, daten: null, laden: false, frage: 0 };
let wiring = null;
let indexTimer = null;

// --- Zugang ------------------------------------------------------------------

/**
 * Öffnet die Seite (Kommando, Ansichtsmenü, «Datei → Workflows»).
 *
 * Das Wurzel-Tor des Aus-Zustands steht hier und nicht an den Zugängen (Muster
 * der Datenbank-Übersicht); ohne Bereich bleibt es beim Hinweis.
 *
 * @returns {boolean} true, wenn die Seite offen ist.
 */
export function oeffneWorkflowLaeufe() {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return false;
  if (!state.areaPath) {
    showStatusbarHint('workflow.seite.keinBereich', { duration: 3000, error: true });
    return false;
  }
  const offen = workflowLaeufeOffen();
  openSystemPage(WORKFLOW_LAEUFE_PAGE_ID);
  // Eine schon offene Seite holt beim erneuten Aufruf den frischen Stand; eine
  // neue holt ihn beim Montieren.
  if (offen) void holeUndZeichne();
  return true;
}

/** @returns {boolean} steht in diesem Fenster ein Reiter der Seite? */
export function workflowLaeufeOffen() {
  return !!findSystemTabAcrossPanes(WORKFLOW_LAEUFE_PAGE_ID);
}

// --- Daten -------------------------------------------------------------------

async function holeUndZeichne() {
  const nummer = ++seite.frage;
  seite.laden = true;
  zeichne();
  let antwort;
  try {
    antwort = await api.workflowRuns();
  } catch (err) {
    console.warn('[Workflows] Lauf-Stände nicht abrufbar:', err && err.message);
    antwort = { ok: false, code: 'unexpected' };
  }
  if (nummer !== seite.frage) return;
  seite.laden = false;
  seite.daten = antwort || { ok: false, code: 'unexpected' };
  zeichne();
}

// Gehört der Container gerade dieser Seite? Zwei System-Seiten einer Spalte
// teilen sich denselben Container (system-pages.js, data-system-page).
function besitzt(container) {
  return (
    !!container && container.isConnected && container.dataset.systemPage === WORKFLOW_LAEUFE_PAGE_ID
  );
}

// Nachziehen nur, solange die Seite montiert ist. Hat eine andere Seite den
// Container übernommen, gilt der Stand als veraltet; das nächste Montieren holt ihn.
function nachziehen() {
  if (!seite.container) return;
  if (!besitzt(seite.container)) {
    seite.daten = null;
    return;
  }
  void holeUndZeichne();
}

function nachziehenGebuendelt() {
  if (!seite.container) return;
  clearTimeout(indexTimer);
  indexTimer = setTimeout(nachziehen, INDEX_BUENDEL_MS);
}

// --- Bausteine ---------------------------------------------------------------

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

// Der Ordner relativ zur Wurzel des Bereichs; die Wurzel selbst mit Namen.
function ortText(relPath) {
  const teile = String(relPath).split('/');
  teile.pop();
  return teile.length > 0 ? teile.join('/') : t('workflow.seite.wurzel');
}

function laufZellen(zeile, w) {
  const zeit = el('td', 'wf-runs-time');
  const ergebnis = el('td', 'wf-runs-result');
  if (w.runStateDefect) {
    ergebnis.textContent = t('workflow.seite.begleitdateiDefekt');
    ergebnis.classList.add('wf-runs-result-failed');
  } else if (w.lastRun) {
    zeit.textContent = zeitpunktText(w.lastRun.at);
    ergebnis.textContent = ergebnisText(w.absPath, w.lastRun);
    ergebnis.dataset.status = w.lastRun.status;
    if (w.lastRun.status === 'failed') ergebnis.classList.add('wf-runs-result-failed');
  } else {
    // AK6 der Story: noch nie gelaufen, also ohne letzten Lauf.
    ergebnis.textContent = t('workflow.seite.nieGelaufen');
    ergebnis.classList.add('wf-runs-never');
  }
  zeile.appendChild(zeit);
  zeile.appendChild(ergebnis);
  zeile.appendChild(el('td', 'wf-runs-count', String(w.runs || 0)));
}

function startZelle(w) {
  const zelle = el('td', 'wf-runs-action');
  const knopf = el('button', 'wf-runs-start', t('workflow.start.knopf'));
  knopf.type = 'button';
  knopf.title = `${t('workflow.start.titel')}: ${w.name}`;
  knopf.addEventListener('click', () => void starteWorkflow({ path: w.absPath }));
  zelle.appendChild(knopf);
  return zelle;
}

function zeichneTabelle(wurzel, workflows) {
  const tabelle = el('table', 'wf-runs-table');
  const kopf = document.createElement('thead');
  const kopfZeile = document.createElement('tr');
  for (const key of ['name', 'ort', 'letzterLauf', 'ergebnis', 'laeufe']) {
    kopfZeile.appendChild(el('th', null, t(`workflow.seite.spalte.${key}`)));
  }
  // Die Aktions-Spalte bleibt ohne Überschrift (Muster der Datenbank-Übersicht).
  const aktion = el('th', 'wf-runs-action-head');
  aktion.setAttribute('aria-hidden', 'true');
  kopfZeile.appendChild(aktion);
  kopf.appendChild(kopfZeile);
  tabelle.appendChild(kopf);
  const koerper = document.createElement('tbody');
  for (const w of workflows) {
    const zeile = document.createElement('tr');
    zeile.dataset.path = w.absPath;
    const name = el('td', 'wf-runs-name', w.name);
    if (w.description) name.title = w.description;
    zeile.appendChild(name);
    zeile.appendChild(el('td', 'wf-runs-location', ortText(w.relPath)));
    laufZellen(zeile, w);
    zeile.appendChild(startZelle(w));
    koerper.appendChild(zeile);
  }
  tabelle.appendChild(koerper);
  wurzel.appendChild(tabelle);
}

// Der Satz an Stelle der Tabelle, wenn es keine gibt.
function lageText(daten) {
  if (!daten.ok) {
    return daten.code === 'noArea' ? t('workflow.seite.keinBereich') : t('workflow.seite.fehler');
  }
  if (daten.status === 'indexing') return t('workflow.seite.indexing');
  if (daten.status !== 'ready') return t('workflow.seite.fehler');
  return daten.workflows.length === 0 ? t('workflow.seite.leer') : null;
}

function seitenTitel() {
  return state.areaName
    ? `${t('workflow.seite.titel')}: ${state.areaName}`
    : t('workflow.seite.titel');
}

function zeichne() {
  const container = seite.container;
  if (!besitzt(container)) return;
  container.innerHTML = '';
  const wurzel = el('div', 'wf-runs-page');
  const kopf = el('div', 'wf-runs-head');
  kopf.appendChild(el('h3', 'wf-runs-heading', seitenTitel()));
  const knopf = el('button', 'wf-runs-refresh', t('workflow.seite.aktualisieren'));
  knopf.type = 'button';
  knopf.disabled = seite.laden;
  knopf.addEventListener('click', () => void holeUndZeichne());
  kopf.appendChild(knopf);
  wurzel.appendChild(kopf);
  const daten = seite.daten;
  if (seite.laden && !daten) wurzel.appendChild(el('p', 'wf-runs-note', t('workflow.seite.laden')));
  if (daten) {
    const lage = lageText(daten);
    if (lage !== null) wurzel.appendChild(el('p', 'wf-runs-note wf-runs-empty', lage));
    else zeichneTabelle(wurzel, daten.workflows);
  }
  container.appendChild(wurzel);
}

// --- Kommando ----------------------------------------------------------------

// Das Kommando steht nur bei eingeschalteter Erweiterung (Muster der
// Workflow-Kommandos); im Aus-Zustand verschwindet es aus Palette und Kürzeln.
function syncKommando() {
  if (!wiring) return;
  unregisterDynamicCommand(WORKFLOW_LAEUFE_COMMAND_ID);
  wiring.unregisterHandler(WORKFLOW_LAEUFE_COMMAND_ID);
  if (isExtensionActive(WORKFLOWS_EXTENSION_ID)) {
    registerDynamicCommand({ id: WORKFLOW_LAEUFE_COMMAND_ID, labelKey: 'workflow.seite.kommando' });
    // false meldet einem Makro, dass die Seite nicht aufging (kein Bereich).
    wiring.registerHandler(WORKFLOW_LAEUFE_COMMAND_ID, () =>
      oeffneWorkflowLaeufe() ? undefined : false,
    );
  }
  wiring.refreshHotkeys();
  renderCommandButtons();
}

// --- Registrierung -----------------------------------------------------------

let registriert = false;

/**
 * Registriert Seite und Kommando und hängt das Nachziehen an.
 *
 * @param {{registerHandler: Function, unregisterHandler: Function,
 *   refreshHotkeys: Function}} w Handler-Verdrahtung (aus initWorkflowCommands).
 */
export function initWorkflowLaeufe(w) {
  wiring = w;
  syncKommando();
  if (registriert) return;
  registriert = true;
  registerSystemPage({
    id: WORKFLOW_LAEUFE_PAGE_ID,
    titleKey: 'workflow.seite.titel',
    title: seitenTitel,
    onOpen() {
      seite.daten = null;
    },
    mount(container) {
      seite.container = container;
      zeichne();
      if (!seite.daten && !seite.laden) void holeUndZeichne();
    },
    onClose() {
      seite.container = null;
      clearTimeout(indexTimer);
    },
  });
  document.addEventListener('scg:extensions-changed', syncKommando);
  onLaufVerbucht(nachziehen);
  onWorkflowFolderListChanged(nachziehen);
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(nachziehenGebuendelt);
  }
}
