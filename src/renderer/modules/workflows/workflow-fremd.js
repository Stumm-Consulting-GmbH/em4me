// 4T-002426 (Epic 3E-000366, Story 4S-001138, Entscheidung 2h): Die Workflows
// verknüpfter Bereiche im Fenster — Bezeichnung mit dem Kürzel der Quelle,
// Erkennung eines fremden Pfades und das Ergebnis eines Laufs in der Statusleiste.
//
// **Woher die Liste kommt.** Die Liste des Workflow-Ordners (`workflow-folder-list.js`)
// trägt seit 4T-002426 das Feld `linked`: je zugestimmter Quelle Kürzel, Name,
// Baum und flache Liste, jeder Workflow mit `sourceKey` und `sourceName`
// (Hauptprozess: `src/main/workflows/workflow-linked-sources.js`). Die Kommandos
// (`workflow-commands.js`) melden jede neue Liste hierher (`merkeFremde`).
//
// **Bezeichnung** (Form wie bei den Vorlagen: Name, dazu die Herkunft): «Name
// (@kürzel)» aus dem Schlüssel `workflow.verknuepft.eintrag`, in Menü, Palette
// und auf der Seite «Workflow-Läufe» dieselbe.
//
// **Ergebnis in der Statusleiste** (AK4 des Tasks, AK7 der Story): Ein fremder
// Workflow bekommt keinen Lauf-Stand, weder im fremden Bereich (Entscheidung 1f)
// noch im eigenen. Den Abbruch meldet der Start ohnehin in der Statusleiste;
// den gelungenen Lauf meldet dieses Modul, sobald der Start ihn verbucht
// (`onLaufVerbucht`), weil er sonst nirgends sichtbar wäre.
//
// Eigener Zustand: die zuletzt gemeldeten fremden Workflows.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { onLaufVerbucht } from './workflow-lauf-stand.js';
import { einsetzen } from './workflow-lauf-texte.js';

const HINWEIS_MS = 4000;

let fremde = []; // flach: { name, relPath, absPath, sourceKey, sourceName }
let angemeldet = false;

function schluessel(pfad) {
  return String(pfad).replace(/\\/g, '/').toLowerCase();
}

/**
 * Die fremden Workflows einer Liste, flach in der Reihenfolge der Quellen.
 *
 * @param {{linked?: object[]}|null} liste Liste aus workflow-folder-list.js.
 * @returns {object[]} Einträge mit `sourceKey`.
 */
export function fremdeWorkflows(liste) {
  const quellen = liste && Array.isArray(liste.linked) ? liste.linked : [];
  const out = [];
  for (const quelle of quellen) {
    if (!quelle || typeof quelle.key !== 'string' || quelle.key === '') continue;
    for (const w of Array.isArray(quelle.workflows) ? quelle.workflows : []) {
      if (!w || typeof w.absPath !== 'string' || w.absPath === '') continue;
      out.push({ ...w, sourceKey: w.sourceKey || quelle.key, sourceName: quelle.name || null });
    }
  }
  return out;
}

/**
 * Die Bezeichnung eines fremden Workflows: Name und Kürzel der Quelle.
 *
 * @param {string} name Name des Workflows.
 * @param {string} sourceKey Kürzel der Quelle.
 * @returns {string}
 */
export function fremdeBezeichnung(name, sourceKey) {
  return einsetzen(t('workflow.verknuepft.eintrag'), { name, prefix: sourceKey });
}

/**
 * Merkt die fremden Workflows der jüngsten Liste.
 *
 * @param {object|null} liste Liste aus workflow-folder-list.js.
 */
export function merkeFremde(liste) {
  fremde = fremdeWorkflows(liste);
}

/**
 * Der fremde Workflow zu einem Pfad oder null.
 *
 * @param {string} pfad absoluter Pfad einer Workflow-Datei.
 * @returns {object|null}
 */
export function fremderWorkflow(pfad) {
  if (typeof pfad !== 'string' || pfad === '') return null;
  const gesucht = schluessel(pfad);
  return fremde.find((w) => schluessel(w.absPath) === gesucht) || null;
}

/**
 * Ist der Pfad die Datei eines Workflows aus einem verknüpften Bereich?
 *
 * @param {string} pfad absoluter Pfad.
 * @returns {boolean}
 */
export function istFremderWorkflow(pfad) {
  return fremderWorkflow(pfad) !== null;
}

/**
 * Schreibt den Lauf-Stand eines Laufs über `workflow:recordRun` — für einen
 * fremden Workflow nicht: Er bekommt keinen Lauf-Stand (Entscheidung 1f), und
 * der Hauptprozess wiese ihn ohnehin ab. Aufgerufen vom Start (workflow-start.js);
 * die Prüfung liegt hier, damit der Start sie in einer Zeile ruft.
 *
 * @param {string} pfad absoluter Pfad der Workflow-Datei.
 * @param {object} run die Angaben in der Form von `normalizeRun`.
 * @returns {Promise<boolean>} true, wenn der Hauptprozess den Stand angenommen hat.
 */
export async function verbucheLaufStand(pfad, run) {
  if (istFremderWorkflow(pfad)) return false;
  try {
    const antwort = await api.workflowRecordRun(pfad, run);
    if (antwort && antwort.ok === false) {
      console.warn('[Workflows] Lauf-Stand nicht gespeichert:', pfad, antwort.code);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Workflows] Lauf-Stand nicht gespeichert:', pfad, err && err.message);
    return false;
  }
}

/**
 * Meldet den gelungenen Lauf eines fremden Workflows in der Statusleiste.
 *
 * @param {string} pfad absoluter Pfad der Workflow-Datei.
 * @param {{status: string}|null} run die verbuchten Angaben.
 * @returns {boolean} true, wenn ein Hinweis erschien.
 */
export function meldeFremdenLauf(pfad, run) {
  const w = fremderWorkflow(pfad);
  if (!w || !run || run.status !== 'ok') return false;
  const text = einsetzen(t('workflow.lauf.fremdErfolgreich'), {
    name: w.name,
    prefix: w.sourceKey,
  });
  showStatusbarHint('workflow.lauf.fremdErfolgreich', { text, duration: HINWEIS_MS });
  return true;
}

/** Hängt die Meldung an die verbuchten Läufe dieses Fensters (einmal). */
export function initFremdeWorkflows() {
  if (angemeldet) return;
  angemeldet = true;
  // Den Abbruch meldet der Start selbst; hier kommt allein der gelungene Lauf hinzu.
  onLaufVerbucht((pfad, run) => meldeFremdenLauf(pfad, run));
}
