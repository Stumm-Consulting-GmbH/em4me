// 4T-001978 (Epic 3E-000330): Die eine Regel, nach der ein Bearbeitungs-Auftrag
// an das Fenster geht, das den ungespeicherten Stand einer Datei hält.
//
// Der Hauptprozess merkt sich je Datei, welches Fenster ihren geschriebenen
// Stand zuletzt gemeldet hat (`bufferOwnerFor`, src/main/index/overlay.js).
// Eine Bearbeitung aus einem ANDEREN Fenster gehört dorthin: Auf der Platte
// steht die Zeile so nicht, und ein Schreiben dort holte im Fenster des Stands
// den Konflikt-Dialog. Seit 4T-001727 nutzen das die Erinnerungen
// (`reminders:edit` in src/main/ipc/reminders.js), seit 4T-001978 die
// Handgriffe an einem Treffer der Aufgaben-Abfrage (`taskQuery:edit` in
// src/main/ipc/index-views.js). Beide Kanäle tragen ihren eigenen Auftrag,
// entschieden wird hier, damit nicht zwei Stellen dieselbe Regel tragen.
//
// Eigener Zustand: keiner. Kein Kanal-Modul im Sinne der Registrier-Funktion;
// die beiden Kanal-Gruppen laden es und reichen ihre Deps herein.
'use strict';

/**
 * Reicht einen Auftrag an das Fenster weiter, dessen ungespeicherter Stand für
 * die Datei gilt, sofern es nicht das anfragende ist.
 *
 * @param {object} quellen Abhängigkeiten der aufrufenden Kanal-Gruppe.
 * @param {Map} quellen.windows Fenster-Register (Kennung des Anzeige-Prozesses -> Fenster).
 * @param {object} quellen.backlinks Bereichs-Index (Besitzer eines ungespeicherten Stands).
 * @param {object} event IPC-Ereignis der Anfrage (Absender).
 * @param {string} pfad Datei, deren Stand gemeint ist.
 * @param {string} kanal Kanal, über den das Ziel-Fenster den Auftrag empfängt.
 * @param {object} nutzlast Auftrag für das Ziel-Fenster.
 * @returns {boolean} true, wenn der Auftrag an ein anderes Fenster ging; false,
 *   wenn kein ungespeicherter Stand vorliegt, er beim Absender selbst liegt oder
 *   sein Fenster nicht mehr da ist — dann schreibt der Absender wie bisher.
 */
function uebergibAnPufferBesitzer(quellen, event, pfad, kanal, nutzlast) {
  const { windows, backlinks } = quellen || {};
  if (typeof pfad !== 'string' || !pfad) return false;
  const besitzer =
    backlinks && typeof backlinks.bufferOwnerFor === 'function'
      ? backlinks.bufferOwnerFor(pfad)
      : null;
  const absender = event && event.sender ? event.sender.id : null;
  if (besitzer == null || besitzer === absender) return false;
  const ziel = windows ? windows.get(besitzer) : null;
  if (!ziel || ziel.isDestroyed()) return false;
  ziel.webContents.send(kanal, nutzlast);
  return true;
}

module.exports = { uebergibAnPufferBesitzer };
