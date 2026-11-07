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
//
// **Lauf nach Ereignis** (4T-002460, Epic 3E-000367, Story 4S-001143): Der
// Ereignis-Prüfer (src/main/checks/workflow-event-check.js) stellt über
// `workflow:eventDue` zu; angenommen wird nach denselben Schritten 1 bis 5 mit
// den Kanälen `workflow:event*` (`nimmEreignisAn`). Der Lauf startet mit der
// Herkunft `event` und dem auslösenden Ereignis, aus dem `starteWorkflow` die
// Platzhalter `{{file}}`, `{{from}}` und `{{task}}` belegt (3l). Ein belegtes
// Fenster lässt die Fälligkeit stehen; der Prüfer stellt sie erneut zu, und die
// Warteschlange des Bereichs hält die Reihenfolge der Ereignisse. Je Fenster
// ist höchstens ein Anspruch unterwegs, gleich welcher Art.
//
// **Not-Bremse** (4T-002461, Story 4S-001144, 3d): Eine Ereignis-Fälligkeit mit
// `brake` ist kein Lauf, sondern die Meldung, dass der Ereignis-Prüfer den
// Workflow nach mehr als `brake.limit` Läufen in `brake.minutes` Minuten
// entschärft hat; Scharf-Zustand und Grund im Lauf-Stand hat der Hauptprozess
// schon geschrieben. Das Fenster, das sie annimmt (über dieselben Schritte wie
// einen Lauf, damit sie genau ein Fenster erreicht), zeigt den Grund in der
// Statusleiste und fordert die Benachrichtigung des Betriebssystems über den
// Kanal `notify:system` an (Art `workflow`, Muster workflow-benachrichtigung.js);
// ob sie erscheint, entscheidet der Kanal.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { showStatusbarHint } from '../views/views.js';
import { einsetzen } from './workflow-lauf-texte.js';
import { laeuftWorkflow, starteWorkflow } from './workflow-start.js';
import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';
import { EVENT_TYPES } from '../../../shared/workflows/workflow-event.js';

const NACHGEHOLT_MS = 6000;
// Die Brems-Meldung bleibt länger stehen, weil sie eine Handlung verlangt.
const BREMSE_MS = 10000;
const HERKUNFT = Object.freeze(['schedule', 'catch-up']);
const EREIGNIS_HERKUNFT = 'event';

let anspruchUnterwegs = false;
let eingerichtet = false;
let ereignisEingerichtet = false;

// Die Kanäle einer Art: Zeitplan oder Ereignis.
const ZEITPLAN_KANAL = Object.freeze({
  claim: (key) => api.workflowScheduleClaim(key),
  release: (key) => api.workflowScheduleRelease(key),
  finished: (key) => api.workflowScheduleFinished(key),
});
const EREIGNIS_KANAL = Object.freeze({
  claim: (key) => api.workflowEventClaim(key),
  release: (key) => api.workflowEventRelease(key),
  finished: (key) => api.workflowEventFinished(key),
});

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

const pfadOderNichts = (p) => p === null || p === undefined || typeof p === 'string';

function ereignisGueltig(item) {
  if (!item || typeof item.key !== 'string' || typeof item.path !== 'string') return false;
  if (typeof item.root !== 'string' || item.origin !== EREIGNIS_HERKUNFT) return false;
  const e = item.event;
  return (
    !!e &&
    typeof e === 'object' &&
    EVENT_TYPES.includes(e.type) &&
    pfadOderNichts(e.file) &&
    pfadOderNichts(e.from) &&
    (e.task === null || e.task === undefined || typeof e.task === 'string')
  );
}

async function sende(fn, key) {
  try {
    return await fn(key);
  } catch (err) {
    console.warn(
      '[Workflows] Kanal des unbeaufsichtigten Laufs fehlgeschlagen:',
      err && err.message,
    );
    return null;
  }
}

// Schritte 2 bis 5 für beide Arten: Wurzel, Belegung, Anspruch, Start, Ende.
async function nimmAn(item, kanal, starte) {
  if (!gleicheWurzel(state.areaPath, item.root)) return 'fremd';
  if (anspruchUnterwegs || laeuftWorkflow()) return 'belegt';
  anspruchUnterwegs = true;
  let antwort;
  try {
    antwort = await sende(kanal.claim, item.key);
  } finally {
    anspruchUnterwegs = false;
  }
  if (!antwort || !antwort.granted) return 'vergeben';
  // Zwischen Anspruch und Start kann ein Start von Hand gekommen sein.
  if (laeuftWorkflow() || !isExtensionActive(WORKFLOWS_EXTENSION_ID)) {
    await sende(kanal.release, item.key);
    return 'belegt';
  }
  let ok;
  try {
    // Kein `await` zwischen der Prüfung oben und diesem Aufruf: Die Sperre je
    // Fenster (A2) sitzt in starteWorkflow vor dessen erstem `await`.
    ok = await starte();
  } finally {
    await sende(kanal.finished, item.key);
  }
  return ok ? 'gelaufen' : 'gescheitert';
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
  const ausgang = await nimmAn(item, ZEITPLAN_KANAL, () =>
    starteWorkflow({ path: item.path, origin: item.origin }),
  );
  if (ausgang === 'gelaufen' && item.origin === 'catch-up') {
    const name = typeof item.name === 'string' && item.name !== '' ? item.name : item.path;
    showStatusbarHint('workflow.lauf.nachgeholt', {
      text: einsetzen(t('workflow.lauf.nachgeholt'), { name }),
      error: false,
      duration: NACHGEHOLT_MS,
    });
  }
  return ausgang;
}

/**
 * Nimmt eine zugestellte Ereignis-Fälligkeit an, wenn sie diesem Fenster
 * gehört, und startet den Lauf mit der Herkunft `event` (4T-002460).
 *
 * @param {object} item `{ key, root, path, name, origin: 'event', event }` aus
 *   `workflow:eventDue`; `event` ist `{ type, file, from, task }` mit absoluten Pfaden.
 * @returns {Promise<string>} Ausgang wie bei `nimmFaelligkeitAn`.
 */
export async function nimmEreignisAn(item) {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return 'aus';
  if (!ereignisGueltig(item)) return 'ungueltig';
  if (item.brake !== undefined) {
    if (!bremseGueltig(item.brake)) return 'ungueltig';
    return nimmAn(item, EREIGNIS_KANAL, async () => {
      meldeNotBremse(item);
      return true;
    });
  }
  return nimmAn(item, EREIGNIS_KANAL, () =>
    starteWorkflow({ path: item.path, origin: EREIGNIS_HERKUNFT, ereignis: item.event }),
  );
}

function bremseGueltig(brake) {
  return (
    !!brake &&
    typeof brake === 'object' &&
    Number.isInteger(brake.limit) &&
    brake.limit > 0 &&
    Number.isFinite(brake.minutes) &&
    brake.minutes > 0
  );
}

/**
 * Meldet die Not-Bremse eines Workflows: Hinweis in der Statusleiste und
 * Benachrichtigung des Betriebssystems mit dem Grund.
 *
 * @param {{key: string, path: string, name?: string, brake: {limit: number, minutes: number}}} item
 */
export function meldeNotBremse(item) {
  const name = typeof item.name === 'string' && item.name !== '' ? item.name : item.path;
  const text = einsetzen(t('workflow.lauf.bremse'), {
    name,
    limit: item.brake.limit,
    minutes: item.brake.minutes,
  });
  showStatusbarHint('workflow.lauf.bremse', { text, error: true, duration: BREMSE_MS });
  if (typeof api.systemNotify !== 'function') return;
  const anfrage = {
    title: String(name),
    body: text,
    meldung: { art: 'workflow', keys: [`workflow:bremse:${item.key}`] },
  };
  try {
    Promise.resolve(api.systemNotify(anfrage)).catch((err) => {
      console.warn('[Workflows] Benachrichtigung fehlgeschlagen:', err && err.message);
    });
  } catch (err) {
    console.warn('[Workflows] Benachrichtigung fehlgeschlagen:', err && err.message);
  }
}

function empfange(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) void nimmFaelligkeitAn(item);
}

function empfangeEreignis(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) void nimmEreignisAn(item);
}

/**
 * Richtet den Empfang ein und holt den offenen Stand nach. Mehrfacher Aufruf
 * meldet den Zuhörer nur einmal an. Seit 4T-002460 auch für die
 * Ereignis-Fälligkeiten, an derselben Stelle, damit die Verdrahtung in
 * workflow-commands.js bleibt.
 *
 * @returns {Promise<void>}
 */
export async function initWorkflowZeitplanLauf() {
  if (!eingerichtet) {
    eingerichtet = true;
    api.onWorkflowDue(empfange);
  }
  if (!ereignisEingerichtet && typeof api.onWorkflowEventDue === 'function') {
    ereignisEingerichtet = true;
    api.onWorkflowEventDue(empfangeEreignis);
  }
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return;
  const stand = await sende(api.workflowScheduleOpen);
  if (stand) empfange(stand);
  if (typeof api.workflowEventOpen === 'function') {
    const ereignisse = await sende(api.workflowEventOpen);
    if (ereignisse) empfangeEreignis(ereignisse);
  }
}
