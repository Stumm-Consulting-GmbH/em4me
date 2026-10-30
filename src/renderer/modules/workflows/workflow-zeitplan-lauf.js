// 4T-002421 (Epic 3E-000366, Story 4S-001132): Der Empfänger des Laufs nach
// Zeitplan im Fenster.
//
// Der Zeitplan-Prüfer im Hauptprozess (src/main/checks/workflow-schedule-check.js)
// stellt eine Fälligkeit über das Zustell-Register an ALLE Fenster zu
// (`workflow:due`); gestartet wird der Lauf in genau einem Fenster des Bereichs.
// Dieses Modul entscheidet, ob es dieses Fenster ist, und zwar VOR dem Anspruch:
//
//   1. Erweiterung «Workflows» an, sonst nichts (AK7).
//   2. Die Bereichs-Wurzel des Fensters ist die der Fälligkeit; ein Fenster eines
//      anderen Bereichs oder ohne Bereich beansprucht nie (AK3).
//   3. In diesem Fenster läuft kein Workflow (A2) und kein anderer Anspruch ist
//      unterwegs; sonst wartet die Fälligkeit auf den nächsten Takt, in dem der
//      Prüfer sie erneut zustellt (AK5).
//   4. Anspruch beim Hauptprozess; der erste gewinnt, jeder weitere läuft ins
//      Leere. Ist das Fenster danach belegt (ein Start von Hand kam dazwischen),
//      gibt es den Anspruch zurück.
//   5. Lauf über `starteWorkflow` mit der Herkunft, danach die Meldung des Endes,
//      mit der der Hauptprozess `nextDue` fortschreibt — gleich wie der Lauf
//      ausging.
//
// Ein nachgeholter Lauf (Herkunft `catch-up`) meldet sich nach dem Gelingen in
// der Statusleiste mit «Workflow ‹Name› nachgeholt»; ein Abbruch meldet sich wie
// jeder Lauf mit Zeile und Grund (workflow-start.js).
//
// Den offenen Stand holt das Fenster bei der Einrichtung nach, weil eine
// Fälligkeit, die während des Fenster-Starts zugestellt wurde, sonst bis zum
// nächsten Takt wartete (Muster `reminders:open`).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { showStatusbarHint } from '../views/views.js';
import { einsetzen } from './workflow-lauf-texte.js';
import { laeuftWorkflow, starteWorkflow } from './workflow-start.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';

const NACHGEHOLT_MS = 6000;
const HERKUNFT = Object.freeze(['schedule', 'catch-up']);

let anspruchUnterwegs = false;
let eingerichtet = false;

/**
 * Gleiche Bereichs-Wurzel? Ohne Rücksicht auf Trenner und Groß- und
 * Kleinschreibung, weil derselbe Ort verschieden geschrieben ankommen kann.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function gleicheWurzel(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

function gueltig(item) {
  return (
    !!item &&
    typeof item.key === 'string' &&
    typeof item.path === 'string' &&
    typeof item.root === 'string' &&
    HERKUNFT.includes(item.origin)
  );
}

async function sende(fn, key) {
  try {
    return await fn(key);
  } catch (err) {
    console.warn('[Workflows] Zeitplan-Kanal fehlgeschlagen:', err && err.message);
    return null;
  }
}

/**
 * Nimmt eine zugestellte Fälligkeit an, wenn sie diesem Fenster gehört, und
 * startet den Lauf.
 *
 * @param {object} item `{ key, root, path, name, origin, due }` aus `workflow:due`.
 * @returns {Promise<string>} Ausgang: `aus`, `ungueltig`, `fremd`, `belegt`,
 *   `vergeben`, `gelaufen` oder `gescheitert` (für Prüffälle und Protokoll).
 */
export async function nimmFaelligkeitAn(item) {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return 'aus';
  if (!gueltig(item)) return 'ungueltig';
  if (!gleicheWurzel(state.areaPath, item.root)) return 'fremd';
  if (anspruchUnterwegs || laeuftWorkflow()) return 'belegt';
  anspruchUnterwegs = true;
  let antwort;
  try {
    antwort = await sende(api.workflowScheduleClaim, item.key);
  } finally {
    anspruchUnterwegs = false;
  }
  if (!antwort || !antwort.granted) return 'vergeben';
  // Zwischen Anspruch und Start kann ein Start von Hand gekommen sein.
  if (laeuftWorkflow() || !isExtensionActive(WORKFLOWS_EXTENSION_ID)) {
    await sende(api.workflowScheduleRelease, item.key);
    return 'belegt';
  }
  let ok;
  try {
    // Kein `await` zwischen der Prüfung oben und diesem Aufruf: Die Sperre je
    // Fenster (A2) sitzt in starteWorkflow vor dessen erstem `await`.
    ok = await starteWorkflow({ path: item.path, origin: item.origin });
  } finally {
    await sende(api.workflowScheduleFinished, item.key);
  }
  if (ok && item.origin === 'catch-up') {
    const name = typeof item.name === 'string' && item.name !== '' ? item.name : item.path;
    showStatusbarHint('workflow.lauf.nachgeholt', {
      text: einsetzen(t('workflow.lauf.nachgeholt'), { name }),
      error: false,
      duration: NACHGEHOLT_MS,
    });
  }
  return ok ? 'gelaufen' : 'gescheitert';
}

function empfange(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) void nimmFaelligkeitAn(item);
}

/**
 * Richtet den Empfang ein und holt den offenen Stand nach. Mehrfacher Aufruf
 * meldet den Zuhörer nur einmal an.
 *
 * @returns {Promise<void>}
 */
export async function initWorkflowZeitplanLauf() {
  if (!eingerichtet) {
    eingerichtet = true;
    api.onWorkflowDue(empfange);
  }
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return;
  const stand = await sende(api.workflowScheduleOpen);
  if (stand) empfange(stand);
}
