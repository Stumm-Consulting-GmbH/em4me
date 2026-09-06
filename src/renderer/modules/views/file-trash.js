// 4T-001351 (Epic 3E-000170): Eine Datei des Bereichs in den Papierkorb des
// Betriebssystems verschieben.
//
// Eigenes Modul und nicht in file-actions.js, aus zwei Gruenden. Der eine ist
// fachlich: Die uebrigen Datei-Aktionen benennen um oder haengen um und lassen
// den Bestand bestehen; diese hier nimmt ihn weg und traegt deshalb eine
// eigene Abfolge, eine eigene Rueckfrage und eine eigene Sorgfalt. Der andere
// ist das Groessen-Budget von file-actions.js (466 von 500 Zeilen), das den
// Zusatz nicht mehr getragen haette.
//
// Eigener Zustand: keiner.
'use strict';

import { api } from '../app/api.js';
import { state, withDialog } from '../app/app-state.js';
import { closeTab } from '../tabs/tabs.js';

import { showStatusbarHint } from './views.js';

/**
 * Verschiebt eine Datei des Bereichs in den Papierkorb.
 *
 * **Die Reihenfolge ist die eigentliche Entscheidung dieses Wegs** und steht
 * hier, damit sie beim naechsten Umbau nicht versehentlich gedreht wird:
 *
 *  1. **Rueckfrage** mit dem Namen der Datei. Zuerst, weil das die grosse Frage
 *     ist; wer hier abbricht, soll nicht vorher noch nach seinem ungesicherten
 *     Stand gefragt worden sein.
 *  2. **Offene Reiter schliessen**, ueber alle Panes. Dabei laeuft die
 *     BESTEHENDE Abfrage ueber ungesicherte Aenderungen (Sichern, Verwerfen,
 *     Abbrechen). Ein Abbruch dort bricht den ganzen Vorgang ab — es ist bis
 *     dahin nichts geloescht (AK6).
 *  3. **Erst dann loeschen.** Vor dem Schliessen zu loeschen waere der Fehler,
 *     der die Datei zurueckbraechte: Ein offener Reiter mit ungesichertem Stand
 *     kann sie nach dem Loeschen wieder schreiben.
 *
 * Was der Fehlschlag in Schritt 3 hinterlaesst, ist ausdruecklich benannt: Die
 * Datei ist unangetastet — es gibt keinen halben Loesch-Zustand, weil der
 * Hauptprozess genau einen Aufruf kennt —, ihre Reiter sind aber geschlossen.
 * Das ist der Preis der Reihenfolge und die harmlosere Haelfte: Ein Klick im
 * Panel oeffnet sie wieder, waehrend die umgekehrte Reihenfolge Inhalte
 * kosten koennte.
 *
 * **Verweise werden nicht nachgefuehrt** (Entscheidung E4 des Epics). Anders
 * als beim Umbenennen gibt es kein Ersatz-Ziel; die Verweise werden zu
 * gebrochenen Verweisen und sind als solche erkennbar. Die Rueckfrage sagt das
 * zu, bevor der Anwender zustimmt.
 *
 * @param {string} absPath Absoluter Pfad der Datei im Bereich.
 * @param {string} anzeigeName Name, den die Rueckfrage nennt.
 */
export async function trashFileAtPath(absPath, anzeigeName) {
  if (typeof absPath !== 'string' || !absPath) return;
  const bestaetigt = await withDialog(() => api.areaConfirmTrashFile(anzeigeName || absPath));
  if (!bestaetigt) return;
  if (!(await schliesseOffeneReiter(absPath))) return;
  let ergebnis;
  try {
    ergebnis = await api.areaTrashFile(absPath);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    showStatusbarHint('areaPanel.deleteFailed', { duration: 5000, error: true });
    return;
  }
  showStatusbarHint('areaPanel.deleteDone', { duration: 3000 });
}

// Schliesst jeden Reiter dieser Datei in jeder Pane, einen nach dem anderen und
// jedes Mal neu gesucht: Das Schliessen verkuerzt nicht nur die Reiter-Liste,
// es kann auch eine leer gewordene Pane einziehen — ein ueber die Runde
// gemerkter Index zeigte danach woandershin. Ein Abbruch der Speichern-Abfrage
// meldet sich als false und stoppt alles. Die Schleife endet, weil jeder
// erfolgreiche Durchgang genau einen Treffer entfernt.
async function schliesseOffeneReiter(absPath) {
  for (;;) {
    let treffer = null;
    for (let p = 0; p < state.panes.length && !treffer; p++) {
      const idx = state.panes[p].tabs.findIndex((tab) => tab.path === absPath);
      if (idx >= 0) treffer = [p, idx];
    }
    if (!treffer) return true;
    if (!(await closeTab(treffer[0], treffer[1]))) return false;
  }
}
