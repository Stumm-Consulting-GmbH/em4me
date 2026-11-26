// IPC-Kanal-Gruppe Lese-Position: die zuletzt gesehene Stelle je Dokument
// lesen und merken.
//
// 4T-002641 (Epic 3E-000397, Entscheidung V4). Kanal-Gruppe: lesePosition:*.
//
// Eigener Zustand: keiner; die Tabelle hält `src/main/lese-positionen.js`.
// Jeder Wert aus dem Anzeige-Prozess gilt als ungeprüft: Der Pfad muss eine
// nicht-leere Zeichenkette unter 4096 Zeichen sein, die Stelle geht durch
// den Kern (`normalisiereStelle`); alles andere wird still abgewiesen. Der
// Pfad dient ausschließlich als Schlüssel der Tabelle und nie einem
// Datei-Zugriff.
'use strict';

const ablage = require('../lese-positionen');

/** `lesePosition:lesen` — Stelle zu `pfad` oder `null`. */
function lesePositionLesen(_event, pfad) {
  return ablage.lies(pfad);
}

/** `lesePosition:merken` — merkt die Stelle; gibt nichts zurück. */
function lesePositionMerken(_event, pfad, stelle) {
  ablage.merke(pfad, stelle);
}

/**
 * Registriert die Kanäle der Lese-Position.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} _deps Abhängigkeiten aus main.js (dieses Modul braucht keine).
 */
function registerLesePositionenIpc(handle, _deps) {
  handle('lesePosition:lesen', lesePositionLesen);
  handle('lesePosition:merken', lesePositionMerken);
}

module.exports = { registerLesePositionenIpc, lesePositionLesen, lesePositionMerken };
