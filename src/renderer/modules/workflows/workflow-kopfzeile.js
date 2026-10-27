// 4T-002351 (Epic 3E-000184): Der gemeinsame Baustein der Kopfzeile über dem
// `workflow`-Block, für die Live-Ansicht (`workflow-kopf.js`) und die
// gerenderte Ansicht samt Vorschau der geteilten Ansicht
// (`workflow-kopf-gerendert.js`).
//
// **Warum ein eigenes Modul** (Nachzug vom 2026-10-24 auf die Entscheidung des
// Product Owners vom 2026-10-23): Beide Ansichten zeigen dieselbe Kopfzeile mit
// demselben Prüf-Ergebnis und demselben Knopf «Starten». Ein zweiter Aufbau
// liefe bei der nächsten Änderung auseinander; deshalb entstehen Vorprüfung,
// Markup und Aufruf der Aktionen hier, und keine der beiden Ansichten baut eine
// Kopfzeile selbst. Das Modul kennt keinen Editor.
//
// **Schnittstelle für den Knopf «Starten» (4T-002349):** `registriereKopfAktion`.
// Jede registrierte Funktion bekommt bei jedem Aufbau der Kopfzeile
// `{ element, analyse, zaunZeile, view, dokument }`: `element` ist die rechte
// Spalte `span.cm-wf-aktionen`, `view` der Editor der Live-Ansicht (in der
// gerenderten Ansicht `null`), `dokument()` liefert Pfad und Text des
// Dokuments im Augenblick des Aufrufs.
'use strict';

import { WORKFLOWS_EXTENSION_ID } from '../../../shared/workflows/workflow-konstanten.js';
import { t } from '../../i18n.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { pruefeWorkflow } from './workflow-pruefung.js';

const aktionen = [];

/**
 * Registriert eine Funktion, die in die rechte Spalte der Kopfzeile schreibt.
 *
 * @param {(ctx: {element: HTMLElement, analyse: object, zaunZeile: number,
 *   view: import('@codemirror/view').EditorView|null,
 *   dokument: () => {path: string, text: string}}) => void} fn
 */
export function registriereKopfAktion(fn) {
  if (typeof fn === 'function' && !aktionen.includes(fn)) aktionen.push(fn);
}

// Für die Prüfdateien: Registrierungen wieder entfernen.
export function kopfAktionenZuruecksetzen() {
  aktionen.length = 0;
}

export const KEIN_WORKFLOW = Object.freeze({ isWorkflow: false, blockLines: [], findings: [] });

/**
 * Die Analyse, aus der die Kopfzeilen entstehen. Eine Datei ohne Dateikopf ist
 * kein Workflow; das spart die Analyse in jedem gewöhnlichen Dokument. Die
 * Vorprüfung ist bewusst großzügig (`trim` entfernt auch ein Byte-Order-
 * Zeichen); was ein Dateikopf ist, entscheidet der Kern.
 *
 * @param {string} ersteZeile Erste Zeile des Dokuments.
 * @param {() => string} holeText Liefert den ganzen Text erst, wenn er gebraucht wird.
 * @param {string} [fileName] Pfad des Dokuments, Rückfall für den Namen.
 * @returns {object} Ergebnis von `pruefeWorkflow` oder `KEIN_WORKFLOW`.
 */
export function kopfAnalyse(ersteZeile, holeText, fileName) {
  if (!isExtensionActive(WORKFLOWS_EXTENSION_ID)) return KEIN_WORKFLOW;
  if (String(ersteZeile ?? '').trim() !== '---') return KEIN_WORKFLOW;
  return pruefeWorkflow(holeText(), { fileName: fileName || undefined });
}

/**
 * Baut die Kopfzeile eines Blocks und ruft die registrierten Aktionen.
 *
 * @param {{zaunZeile: number, aussage: {ok: boolean, text: string, liste: string[]},
 *   analyse: object, view?: object|null, dokument: () => {path: string, text: string}}} k
 * @returns {HTMLDivElement}
 */
export function baueKopfzeile({ zaunZeile, aussage, analyse, view = null, dokument }) {
  const kopf = document.createElement('div');
  kopf.className = 'cm-wf-kopf';
  kopf.dataset.wfZeile = String(zaunZeile);
  kopf.dataset.wfOk = String(aussage.ok);
  const pruefung = document.createElement('span');
  pruefung.className = `cm-wf-pruefung ${aussage.ok ? 'cm-wf-pruefung-ok' : 'cm-wf-pruefung-befund'}`;
  pruefung.textContent = aussage.text;
  pruefung.title = [t('workflow.pruefung.titel'), ...aussage.liste].join('\n');
  const rechts = document.createElement('span');
  rechts.className = 'cm-wf-aktionen';
  kopf.append(pruefung, rechts);
  for (const fn of aktionen) {
    try {
      fn({ element: rechts, analyse, zaunZeile, view, dokument });
    } catch (err) {
      console.warn('[Workflows] Aktion der Kopfzeile fehlgeschlagen:', err);
    }
  }
  return kopf;
}
