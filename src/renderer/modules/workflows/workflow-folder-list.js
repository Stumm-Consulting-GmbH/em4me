// 4T-002355 (Epic 3E-000184): Die Liste des Workflow-Ordners auf der Seite des
// Fensters — die Schnittstelle, aus der die Kommandos `workflow.<Pfad-Kennung>`
// entstehen (4T-002349).
//
// **Abfrage und Meldung.** `getWorkflowFolderList()` fragt den Hauptprozess
// (Kanal `workflow:folderList`) und meldet das Fenster damit an der Beobachtung
// des Ordners an; danach meldet der Hauptprozess jede Änderung im Ordner und an
// seiner Festlegung (`workflow:folderChanged`). Dieses Modul fragt dann nach und
// ruft jeden Zuhörer mit der neuen Liste. Ein Bereichs-Wechsel des Fensters ändert
// den wirksamen Ordner; `refreshWorkflowFolderList()` holt ihn nach
// (app-broadcasts.js).
//
// **Träge:** Solange niemand die Liste verlangt hat, fragt das Modul nichts ab und
// meldet sich nicht an; ein Fenster ohne Workflows kostet nichts.
//
// Form der Liste wie die Antwort des Kanals: `{ ok, enabled, source, folder,
// missing, items, workflows }`; `items` ist der Baum (je Ebene die Workflows
// nach Name, danach die Unterordner als `{ kind: 'group', name, relPath, items }`),
// `workflows` dieselben Einträge `{ kind: 'workflow', name, description, relPath,
// absPath }` flach in Anzeige-Reihenfolge; `relPath` ist relativ zum Ordner mit
// `/` als Trenner.
'use strict';

import { api } from '../app/api.js';

const LEER = Object.freeze({
  ok: false,
  enabled: false,
  source: 'none',
  folder: null,
  missing: false,
  items: [],
  workflows: [],
});

let aktiv = false;
let stand = null;
let laufend = null;
const zuhoerer = new Set();

function melde() {
  for (const cb of zuhoerer) {
    try {
      cb(stand);
    } catch (err) {
      console.warn('Workflow-Liste: Zuhörer fehlgeschlagen:', err && err.message);
    }
  }
}

async function frage() {
  let antwort;
  try {
    antwort = await api.workflowFolderList();
  } catch {
    antwort = null;
  }
  stand = antwort && antwort.ok ? antwort : LEER;
  return stand;
}

function aktiviere() {
  if (aktiv) return;
  aktiv = true;
  api.onWorkflowFolderChanged(() => void refreshWorkflowFolderList());
}

/**
 * Die aktuelle Liste; beim ersten Aufruf vom Hauptprozess geholt.
 *
 * @returns {Promise<object>} die Liste in der Form oben.
 */
export async function getWorkflowFolderList() {
  aktiviere();
  if (stand) return stand;
  if (!laufend) laufend = frage().finally(() => (laufend = null));
  return laufend;
}

/**
 * Liste neu holen und die Zuhörer rufen; ohne vorherige Abfrage ohne Wirkung.
 *
 * @returns {Promise<object|null>} die neue Liste oder null, wenn das Modul ruht.
 */
export async function refreshWorkflowFolderList() {
  if (!aktiv) return null;
  const neu = await frage();
  melde();
  return neu;
}

/**
 * Zuhörer für jede neue Liste; Rückgabe meldet ab.
 *
 * @param {(liste: object) => void} cb
 * @returns {() => void}
 */
export function onWorkflowFolderListChanged(cb) {
  zuhoerer.add(cb);
  return () => zuhoerer.delete(cb);
}
