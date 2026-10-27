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
// Seit 4T-002348 (Epic 3E-000184) fragt auch die Ausführung der Workflow-Befehle
// (src/main/workflows/workflow-content-steps.js) hier nach dem Besitzer.
//
// Eigener Zustand: keiner. Kein Kanal-Modul im Sinne der Registrier-Funktion;
// die Kanal-Gruppen laden es und reichen ihre Deps herein.
'use strict';

/**
 * Wer hält den ungespeicherten Stand einer Datei, gemessen am anfragenden
 * Fenster? 4T-002348 (Epic 3E-000184): ausgezogen aus
 * `uebergibAnPufferBesitzer`, weil die Workflow-Befehle auch den Fall
 * brauchen, dass der Absender den Stand selbst hält; die Regel bleibt an
 * dieser einen Stelle.
 *
 * @param {object} quellen Abhängigkeiten der aufrufenden Kanal-Gruppe.
 * @param {Map} quellen.windows Fenster-Register (Kennung des Anzeige-Prozesses -> Fenster).
 * @param {object} quellen.backlinks Bereichs-Index (Besitzer eines ungespeicherten Stands).
 * @param {object} event IPC-Ereignis der Anfrage (Absender).
 * @param {string} pfad Datei, deren Stand gemeint ist.
 * @returns {{art: 'keiner'|'absender'|'anderes', fenster: object|null}} `keiner`
 *   auch dann, wenn das Fenster des Besitzers nicht mehr da ist.
 */
function pufferBesitzer(quellen, event, pfad) {
  const { windows, backlinks } = quellen || {};
  const keiner = { art: 'keiner', fenster: null };
  if (typeof pfad !== 'string' || !pfad) return keiner;
  const besitzer =
    backlinks && typeof backlinks.bufferOwnerFor === 'function'
      ? backlinks.bufferOwnerFor(pfad)
      : null;
  const absender = event && event.sender ? event.sender.id : null;
  if (besitzer == null) return keiner;
  if (besitzer === absender) return { art: 'absender', fenster: null };
  const ziel = windows ? windows.get(besitzer) : null;
  if (!ziel || ziel.isDestroyed()) return keiner;
  return { art: 'anderes', fenster: ziel };
}

/**
 * Reicht einen Auftrag an das Fenster weiter, dessen ungespeicherter Stand für
 * die Datei gilt, sofern es nicht das anfragende ist.
 *
 * @param {object} quellen Abhängigkeiten der aufrufenden Kanal-Gruppe (wie bei `pufferBesitzer`).
 * @param {object} event IPC-Ereignis der Anfrage (Absender).
 * @param {string} pfad Datei, deren Stand gemeint ist.
 * @param {string} kanal Kanal, über den das Ziel-Fenster den Auftrag empfängt.
 * @param {object} nutzlast Auftrag für das Ziel-Fenster.
 * @returns {boolean} true, wenn der Auftrag an ein anderes Fenster ging; false,
 *   wenn kein ungespeicherter Stand vorliegt, er beim Absender selbst liegt oder
 *   sein Fenster nicht mehr da ist — dann schreibt der Absender wie bisher.
 */
function uebergibAnPufferBesitzer(quellen, event, pfad, kanal, nutzlast) {
  const besitzer = pufferBesitzer(quellen, event, pfad);
  if (besitzer.art !== 'anderes') return false;
  besitzer.fenster.webContents.send(kanal, nutzlast);
  return true;
}

module.exports = { pufferBesitzer, uebergibAnPufferBesitzer };
