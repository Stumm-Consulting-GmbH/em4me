// 4T-002423 (Epic 3E-000366, Entscheidung 2f, Story 4S-001134): Das
// Statusleisten-Element «Workflows».
//
// **Was es zeigt:** den letzten Lauf nach Zeitplan des Bereichs (Herkunft
// `schedule` oder `catch-up`) mit Ergebnis-Zeichen, Name des Workflows und
// Uhrzeit; der Tooltip nennt dazu Datum, Uhrzeit und das Ergebnis im Wortlaut
// der Seite «Workflow-Läufe». Ist noch kein Lauf nach Zeitplan verbucht, steht
// dort «Workflows».
//
// **Wann es steht:** nur, solange mindestens ein Workflow des Bereichs scharf
// ist, und nur bei eingeschalteter Erweiterung `workflows`. Die Daten kommen
// aus dem Lese-Kanal der Seite (`workflow:runs`): je eigenem Workflow der
// Scharf-Zustand (`armed === 'armed'`, 4T-002422) und der letzte Lauf mit
// seiner Herkunft (`lastRun.origin`, 4T-002420). Workflows verknüpfter
// Bereiche lassen sich nicht scharf schalten und zählen nicht.
//
// **Der letzte Lauf nach Zeitplan bleibt stehen**, wenn danach ein Lauf von
// Hand denselben Workflow überschreibt: Das Fenster merkt sich den jüngsten
// gesehenen, solange sein Workflow im Bereich steht. Die Begleitdatei hält je
// Workflow nur den letzten Lauf; nach einem Neustart zählt allein sie.
//
// **Wann es nachzieht:** nach jedem verbuchten Lauf dieses Fensters
// (Zuhörer von workflow-lauf-stand.js, auch nach Läufen nach Zeitplan), nach
// einer Änderung im Bereichs-Index, beim Wechsel
// der Erweiterung, wenn das Fenster den Fokus bekommt (ein Lauf in einem
// anderen Fenster desselben Bereichs) und nach jeder Scharf-Schaltung oder
// Entschärfung in diesem Fenster (Zuhörer `onScharfGeaendert` aus
// workflow-scharf.js, 4T-002422).
//
// **Klick** öffnet die Seite «Workflow-Läufe» über ihr Kommando. **Faltung:**
// Das Element ist ein `button` am Anfang der rechten Zone und damit Kandidat
// des Zusammenklappens (statusbar-overflow.js); dessen Beobachtung sieht das
// Einsetzen und das Umschalten von `hidden` selbst. Im Pull-up-Menü steht der
// Tooltip.
//
// **Angelegt wird es hier**, nicht in index.html: Die Datei steht unter der
// Größen-Ratsche ohne Wachstum (scripts/lint-datei-groessen.js), und das
// Element gehört ohnehin allein dieser Erweiterung.
//
// Eigener Zustand: die Verdrahtung, der gemerkte Lauf und die laufende Anfrage.
'use strict';

import { intlLocale, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  ergebnisText,
  istZeitplanLauf,
  onLaufVerbucht,
  zeitpunktText,
} from './workflow-lauf-stand.js';
import { einsetzen } from './workflow-lauf-texte.js';
import { onScharfGeaendert } from './workflow-scharf.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';

export const WORKFLOW_STATUSLEISTE_ID = 'statusbar-workflows';
// Kommando der Seite «Workflow-Läufe»; dieselbe Kennung wie in
// workflow-laeufe-seite.js, hier ohne Import, weil jenes Modul den Start
// importiert und dieser dieses (Prüffall sichert die Gleichheit).
export const WORKFLOW_LAEUFE_KOMMANDO = `ext.${WORKFLOWS_EXTENSION_ID}.openRuns`;

// Ergebnis-Zeichen je Status des Lauf-Stands.
const ZEICHEN = Object.freeze({ ok: '✓', failed: '✗', stopped: '■', canceled: '–' });
const BUENDEL_MS = 300;

let verdrahtung = { executeCommand: () => false };
let gemerkt = null; // { name, absPath, lastRun }
let anfrage = 0;
let buendelTimer = null;
let registriert = false;

/**
 * Das Ergebnis-Zeichen eines Status.
 *
 * @param {string} status
 * @returns {string}
 */
export function ergebnisZeichen(status) {
  return Object.hasOwn(ZEICHEN, status) ? ZEICHEN[status] : '?';
}

/**
 * Steht mindestens ein eigener Workflow scharf?
 *
 * @param {object[]} workflows Einträge des Kanals `workflow:runs`.
 * @returns {boolean}
 */
export function hatScharfenWorkflow(workflows) {
  return (workflows || []).some((w) => w && !w.foreign && w.armed === 'armed');
}

function zeitpunkt(lastRun) {
  const ms = lastRun ? Date.parse(lastRun.at) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Der jüngste Lauf nach Zeitplan unter den Workflows.
 *
 * @param {object[]} workflows Einträge des Kanals `workflow:runs`.
 * @returns {{name: string, absPath: string, lastRun: object}|null}
 */
export function letzterZeitplanLauf(workflows) {
  let bester = null;
  for (const w of workflows || []) {
    if (!w || w.foreign || !w.lastRun || !istZeitplanLauf(w.lastRun.origin)) continue;
    const ms = zeitpunkt(w.lastRun);
    if (ms === null) continue;
    if (!bester || ms > zeitpunkt(bester.lastRun)) {
      bester = { name: w.name, absPath: w.absPath, lastRun: w.lastRun };
    }
  }
  return bester;
}

/**
 * Die Uhrzeit eines Laufs in der Sprache der Oberfläche; ein Lauf vor dem
 * heutigen Tag nennt zusätzlich Tag und Monat.
 *
 * @param {string} at UTC ISO-8601 aus der Begleitdatei.
 * @param {Date} [jetzt]
 * @returns {string}
 */
export function uhrzeitText(at, jetzt = new Date()) {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return '';
  const datum = new Date(ms);
  const heute = datum.toDateString() === jetzt.toDateString();
  const form = heute
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
  return datum.toLocaleString(intlLocale() || undefined, form);
}

/**
 * Schreibt den Stand in das Element.
 *
 * @param {HTMLElement} el das Element der Statusleiste.
 * @param {{sichtbar: boolean, letzter?: object|null}} stand
 */
export function zeichneWorkflowStatusleiste(el, { sichtbar, letzter = null }) {
  el.hidden = !sichtbar;
  if (!sichtbar) return;
  el.setAttribute('aria-label', t('statusbar.workflows.label'));
  if (!letzter) {
    el.textContent = t('statusbar.workflows.label');
    el.title = t('statusbar.workflows.titleNoRun');
    delete el.dataset.status;
    return;
  }
  const { name, absPath, lastRun } = letzter;
  el.textContent = `${ergebnisZeichen(lastRun.status)} ${name} ${uhrzeitText(lastRun.at)}`;
  el.title = einsetzen(t('statusbar.workflows.title'), {
    name,
    time: zeitpunktText(lastRun.at),
    result: ergebnisText(absPath, lastRun),
  });
  el.dataset.status = lastRun.status;
}

// Der jüngere zweier Läufe; der gemerkte nur, solange sein Workflow im Bereich steht.
function juengerer(ausKanal, workflows) {
  const steht =
    gemerkt && (workflows || []).some((w) => !w.foreign && w.absPath === gemerkt.absPath);
  const merk = steht ? gemerkt : null;
  if (!merk) return ausKanal;
  if (!ausKanal) return merk;
  return zeitpunkt(ausKanal.lastRun) >= zeitpunkt(merk.lastRun) ? ausKanal : merk;
}

function elementEl() {
  return document.getElementById(WORKFLOW_STATUSLEISTE_ID);
}

/**
 * Legt das Element am Anfang der rechten Zone der Statusleiste an, verborgen;
 * ein vorhandenes bleibt. Ohne Statusleiste null.
 *
 * @returns {HTMLButtonElement|null}
 */
export function legeWorkflowStatusleisteAn() {
  const vorhanden = elementEl();
  if (vorhanden) return vorhanden;
  const zone = document.querySelector('footer.statusbar .statusbar-right');
  if (!zone) return null;
  const el = document.createElement('button');
  el.id = WORKFLOW_STATUSLEISTE_ID;
  el.className = 'statusbar-workflows';
  el.type = 'button';
  el.hidden = true;
  el.setAttribute('aria-label', t('statusbar.workflows.label'));
  zone.insertBefore(el, zone.firstChild);
  return el;
}

/**
 * Liest den Stand über den Kanal `workflow:runs` und zeichnet das Element.
 *
 * @returns {Promise<void>}
 */
export async function aktualisiereWorkflowStatusleiste() {
  const el = elementEl();
  if (!el) return;
  const nummer = ++anfrage;
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID) || typeof api.workflowRuns !== 'function') {
    zeichneWorkflowStatusleiste(el, { sichtbar: false });
    return;
  }
  let antwort = null;
  try {
    antwort = await api.workflowRuns();
  } catch (err) {
    console.warn('[Workflows] Stand der Statusleiste nicht lesbar:', err && err.message);
  }
  // Eine jüngere Anfrage oder ein Ausschalten in der Zwischenzeit gewinnt.
  if (nummer !== anfrage) return;
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID) || !antwort || antwort.ok !== true) {
    zeichneWorkflowStatusleiste(el, { sichtbar: false });
    return;
  }
  // Während der Index aufgebaut wird, bleibt der bisherige Stand stehen.
  if (antwort.status !== 'ready') return;
  const workflows = Array.isArray(antwort.workflows) ? antwort.workflows : [];
  gemerkt = juengerer(letzterZeitplanLauf(workflows), workflows);
  zeichneWorkflowStatusleiste(el, { sichtbar: hatScharfenWorkflow(workflows), letzter: gemerkt });
}

function planeAktualisierung() {
  clearTimeout(buendelTimer);
  buendelTimer = setTimeout(() => void aktualisiereWorkflowStatusleiste(), BUENDEL_MS);
}

/** Vergisst den gemerkten Lauf (Prüffälle). */
export function workflowStatusleisteZuruecksetzen() {
  gemerkt = null;
  anfrage = 0;
  clearTimeout(buendelTimer);
}

/**
 * Verdrahtet Klick und Nachziehen und zeichnet einmal.
 *
 * @param {{executeCommand?: Function}} w Kommando-Ausführung (aus workflow-start.js).
 */
export function initWorkflowStatusleiste(w) {
  verdrahtung = { ...verdrahtung, ...(w || {}) };
  if (registriert) return;
  registriert = true;
  const el = legeWorkflowStatusleisteAn();
  if (el) {
    el.addEventListener('click', () => {
      verdrahtung.executeCommand(WORKFLOW_LAEUFE_KOMMANDO);
    });
  }
  onLaufVerbucht(() => void aktualisiereWorkflowStatusleiste());
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(planeAktualisierung);
  }
  document.addEventListener(
    'scg:extensions-changed',
    () => void aktualisiereWorkflowStatusleiste(),
  );
  onScharfGeaendert(() => void aktualisiereWorkflowStatusleiste());
  window.addEventListener('focus', planeAktualisierung);
  // Sprachwechsel: Tooltip, Uhrzeit und Beschriftung neu.
  document.addEventListener('i18n-language-changed', planeAktualisierung);
  void aktualisiereWorkflowStatusleiste();
}
