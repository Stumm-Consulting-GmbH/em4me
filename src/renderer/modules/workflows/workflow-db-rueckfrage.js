// 4T-002544 (Epic 3E-000368): Die Rückfragen des Prüfers nach Tabellen,
// Feldern und Abfrage-Dateien auf der Seite des Fensters (Ausführungs-
// Entscheidung 4 der Konzept-Runde 4T-002543).
//
// **Muster der Workflow-Namen:** Der Prüfer fragt synchron; dieses Modul hält
// die Auskunft des Hauptprozesses (Kanal `workflow:dbCatalog`) und meldet die
// Rückfragen `dbTable` und `dbQuery`, seit 4T-002692 dazu `dbFile`
// (Tabellen-Datei oder Karteikarte für die Stufe «Hinweis»), über
// `registriereRueckfragen` an. Solange
// keine Auskunft vorliegt, antworten sie mit null, und die Prüfung entfällt,
// wie der Kern es ohne Rückfrage vorsieht.
//
// **Träge und frisch:** Geholt wird erst, wenn eine Prüfung fragt; jede
// Index-Meldung (`onBacklinksInvalidated`: ein Speichern, ein Bereichs-Wechsel)
// und jedes Umschalten einer Erweiterung macht die Auskunft alt, und die
// nächste Frage holt sie neu. Kommt eine neue Auskunft an, rechnen die
// Kopfzeilen der Live-Ansicht neu (`liveRebuildEffect`), damit ein Befund nicht
// erst mit dem nächsten Tastendruck erscheint.
//
// **Nach «noch nicht bereit» sofort nachholen (4T-002816):** Antwortet der
// Hauptprozess mit `ok: false` (Index im Aufbau, kein Bereich), holt die
// nächste Index-Meldung die Auskunft sofort neu, statt nur auf die nächste
// Frage zu warten. Der Index-Aufbau endet in jedem Fall mit dieser Meldung;
// ein eigenes Signal «Datenbank bereit» braucht es deshalb nicht. Geholt wird
// je Meldung höchstens einmal, nie im Takt; ohne vorheriges «noch nicht bereit»
// bleibt es beim trägen Holen.
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
// Die letzte Antwort war «noch nicht bereit» (4T-002816).
let wartetAufBereit = false;
// Eine Index-Meldung kam, während eine Auskunft unterwegs war.
let meldungWaehrendLauf = false;

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
    // Index noch im Aufbau oder kein Bereich: beim nächsten Fragen erneut,
    // und mit der nächsten Index-Meldung sofort.
    alt = true;
    wartetAufBereit = true;
  } else if (antwort) {
    wartetAufBereit = false;
  }
  if (neu === stand) return;
  stand = neu;
  nachschlagen = neu ? createDbLookup(antwort) : null;
  neuRechnen();
}

function auffrischen() {
  if (!alt || laufend) return;
  alt = false;
  laufend = hole().finally(() => {
    laufend = null;
    // Kam die Meldung, während die Auskunft unterwegs war, gilt sie jetzt:
    // einmal nachholen, nie in einer Schleife.
    if (meldungWaehrendLauf) {
      meldungWaehrendLauf = false;
      if (wartetAufBereit) auffrischen();
    }
  });
}

// Eine Index-Meldung: Die Auskunft ist alt. Stand zuletzt «noch nicht bereit»
// aus, wird sofort neu geholt, damit die Befunde ohne Tastendruck erscheinen.
function aufIndexMeldung() {
  alt = true;
  if (laufend) {
    meldungWaehrendLauf = true;
    return;
  }
  if (wartetAufBereit) auffrischen();
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

/**
 * Die Rückfrage nach der Art einer Datei (4T-002692): Tabellen-Datei,
 * Karteikarte oder keins von beiden.
 *
 * @param {string} pfad Pfad relativ zur Bereichs-Wurzel.
 * @returns {object|null}
 */
export function dbFileRueckfrage(pfad) {
  auffrischen();
  return nachschlagen ? nachschlagen.dbFile(pfad) : null;
}

/** Meldet die drei Rückfragen an und hört auf die Meldungen des Bestands. */
export function initWorkflowDbRueckfrage() {
  registriereRueckfragen({
    dbTable: dbTableRueckfrage,
    dbQuery: dbQueryRueckfrage,
    dbFile: dbFileRueckfrage,
  });
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(aufIndexMeldung);
  }
  document.addEventListener('scg:extensions-changed', () => (alt = true));
}
