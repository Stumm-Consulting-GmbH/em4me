// 4T-002544 (Epic 3E-000368): Die Rückfragen des Prüfers nach Tabellen,
// Feldern und Abfrage-Dateien auf der Seite des Fensters (Ausführungs-
// Entscheidung 4 der Konzept-Runde 4T-002543).
//
// **Muster der Workflow-Namen:** Der Prüfer fragt synchron; dieses Modul hält
// die Auskunft des Hauptprozesses (Kanal `workflow:dbCatalog`) und meldet die
// Rückfragen `dbTable` und `dbQuery` über `registriereRueckfragen` an. Solange
// keine Auskunft vorliegt, antworten sie mit null, und die Prüfung entfällt,
// wie der Kern es ohne Rückfrage vorsieht.
//
// **Träge und frisch:** Geholt wird erst, wenn eine Prüfung fragt; jede
// Index-Meldung (`onBacklinksInvalidated`: ein Speichern, ein Bereichs-Wechsel)
// und jedes Umschalten einer Erweiterung macht die Auskunft alt, und die
// nächste Frage holt sie neu. Kommt eine neue Auskunft an, rechnen die
// Kopfzeilen der Live-Ansicht neu (`liveRebuildEffect`), damit ein Befund nicht
// erst mit dem nächsten Tastendruck erscheint.
'use strict';

import { api } from '../app/api.js';
import { paneEditors } from '../editor/editor.js';
import { liveRebuildEffect } from '../live/live-shared.js';
import { createDbLookup } from '../../../shared/workflows/workflow-db-lookup.js';
import { registriereRueckfragen } from './workflow-pruefung.js';

// Die Rückfragen der zuletzt gelieferten Auskunft; null = keine.
let nachschlagen = null;
let stand = null;
let alt = true;
let laufend = null;

function neuRechnen() {
  for (const view of paneEditors) {
    if (view) view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
}

async function hole() {
  let antwort;
  try {
    antwort = await api.workflowDbCatalog();
  } catch {
    antwort = null;
  }
  const neu = antwort && antwort.ok && antwort.enabled ? JSON.stringify(antwort) : null;
  if (antwort && !antwort.ok) {
    // Index noch im Aufbau oder kein Bereich: beim nächsten Fragen erneut.
    alt = true;
  }
  if (neu === stand) return;
  stand = neu;
  nachschlagen = neu ? createDbLookup(antwort) : null;
  neuRechnen();
}

function auffrischen() {
  if (!alt || laufend) return;
  alt = false;
  laufend = hole().finally(() => (laufend = null));
}

/**
 * Die Rückfrage nach einer Tabelle (`checkWorkflow`, `prepareRun`).
 *
 * @param {string} angabe Name oder Pfad der Tabelle.
 * @returns {object|null}
 */
export function dbTableRueckfrage(angabe) {
  auffrischen();
  return nachschlagen ? nachschlagen.dbTable(angabe) : null;
}

/**
 * Die Rückfrage nach einer Abfrage-Datei.
 *
 * @param {string} pfad Pfad relativ zur Bereichs-Wurzel.
 * @returns {object|null}
 */
export function dbQueryRueckfrage(pfad) {
  auffrischen();
  return nachschlagen ? nachschlagen.dbQuery(pfad) : null;
}

/** Meldet die beiden Rückfragen an und hört auf die Meldungen des Bestands. */
export function initWorkflowDbRueckfrage() {
  registriereRueckfragen({ dbTable: dbTableRueckfrage, dbQuery: dbQueryRueckfrage });
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => (alt = true));
  }
  document.addEventListener('scg:extensions-changed', () => (alt = true));
}
