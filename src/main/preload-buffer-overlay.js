// 4T-002023 (Epic 3E-000192): Der Anteil der Preload-Brücke an der
// Puffer-Overlay-Schicht des Index — Melden und Zurücknehmen des geschriebenen
// Stands einer offenen Datei und die Meldung, dass er sich geändert hat.
//
// **Warum ein eigenes Modul.** Die Meldung kommt seit 4T-002023 aus dem
// Hauptprozess an alle Fenster (Entscheidung des Product Owners vom 2026-09-29,
// «Beide folgen»): Einbettung und Diagramm folgen dem geschriebenen Stand ihres
// Ziels auch dann, wenn es in einem anderen Fenster geöffnet ist. Vorher löste
// das tippende Fenster das Ereignis allein bei sich selbst aus. Die drei
// Einträge gehören als Kanal-Gruppe zusammen, und `preload.js` steht auf seinem
// eingefrorenen Größen-Budget; der Schnitt folgt dem Muster `datenbankBruecke`.
//
// Reine Kanal-Bindungen ohne eigenen Zustand. `ipcRenderer` kommt als Parameter
// und nicht per Require, damit das Modul ohne Electron prüfbar bleibt.
'use strict';

/**
 * Die Kanal-Bindungen der Puffer-Overlay-Schicht.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses.
 * @returns {object} Einträge für das Brücken-Objekt.
 */
function bufferOverlayBridge(ipcRenderer) {
  return {
    // 4T-000935 (Befund B-08): geschriebenen Stand einer offenen Datei an den
    // Index-Overlay melden bzw. ihn zurücknehmen (Speichern, Verwerfen,
    // Schließen). Die gerenderte Ansicht zeigt damit auch in eingebetteten
    // Konstrukten den Stand des Editors und nicht den der Platte.
    setIndexOverlay: (filePath, content) =>
      ipcRenderer.invoke('index:overlay', { filePath, content }),
    clearIndexOverlay: (filePath) =>
      ipcRenderer.invoke('index:overlay', { filePath, content: null }),
    // 4T-002023: Meldung an ALLE Fenster, den Melder eingeschlossen, nach jedem
    // Setzen und jeder Rücknahme. Nutzlast { filePath }.
    onIndexOverlayChanged: (cb) =>
      ipcRenderer.on('index:overlayChanged', (_e, nutzlast) => cb(nutzlast)),
  };
}

module.exports = { bufferOverlayBridge };
