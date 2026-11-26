// 4T-002649 (Epic 3E-000416): Der Anteil der Preload-Brücke an den Wegen des
// Fensters in den Einstellungs-Speicher: der allgemeine Weg (`settings:get`,
// `settings:set`) und die eigenen Kanäle der Einstellungen, die der allgemeine
// Weg seither abweist (Tabelle der Klassen in `app/settings-classes.js`).
//
// Eigenes Modul nach dem Muster `workflowsBridge`, weil `preload.js` auf
// seinem eingefrorenen Größen-Budget steht: Die beiden Einträge des
// allgemeinen Wegs sind mit unveränderten Namen hierher gezogen, damit der
// neue Kanal des Vorlagen-Ordners die Brücke nicht wachsen lässt. Die eigenen
// Kanäle der Erlaubnisse (4T-002650) gehören ebenfalls hierher.
//
// Reine Kanal-Bindungen ohne eigenen Zustand. `ipcRenderer` kommt als Parameter
// und nicht per Require, damit das Modul ohne Electron prüfbar bleibt.
'use strict';

/**
 * Die Kanal-Bindungen der Einstellungs-Wege.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses.
 * @returns {object} Einträge für das Brücken-Objekt.
 */
function settingsBridge(ipcRenderer) {
  return {
    // Allgemeiner Weg: lesen jeden Schlüssel, schreiben nur Klasse 1; die
    // Antwort ist `{ ok: true }` oder `{ ok: false, error: 'settings:<Grund>' }`.
    getSetting: (key) => ipcRenderer.invoke('settings:get', key),
    setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    // Globaler Vorlagen-Ordner samt Ordner-Regeln ({ folder, rules }), Antwort
    // `{ ok, error? }` (Einstellungs-Bereich «Vorlagen»).
    templatesSetGlobalConfig: (config) => ipcRenderer.invoke('templates:setGlobalConfig', config),
    // 4T-002650 (Epic 3E-000416): die Erlaubnisse. Ein- und Ausschalten eines
    // externen Add-ons und sein letzter Fehler, Antwort `{ ok, enabled?, error? }`;
    // der Schalter der Skript-Blöcke mit Bestätigung des Hauptprozesses beim
    // Einschalten, Antwort `{ ok, enabled?, error? }`.
    setExternalExtensionEnabled: (id, on) => ipcRenderer.invoke('extensions:setEnabled', id, on),
    reportExternalExtensionError: (id, text) =>
      ipcRenderer.invoke('extensions:reportError', id, text),
    setScriptsRun: (on) => ipcRenderer.invoke('settings:setScriptsRun', on),
  };
}

module.exports = { settingsBridge };
