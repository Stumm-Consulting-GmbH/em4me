// 4T-001758 (Epic 3E-000253): Der Datenbank-Anteil der Preload-Bruecke.
//
// **Warum ein eigenes Modul und nicht vier weitere Zeilen in `preload.js`.**
// Die Bruecke ist eine genuin tabellarische Einheit, und sie steht mit 500
// Code-Zeilen exakt auf ihrem Datei-Budget; jede weitere Zeile dort waere ein
// Befund des Groessen-Waechters gewesen. Statt den Waechter ueber einen Eintrag
// in seiner Ausnahmeliste zu lockern, bekommt der Datenbank-Anteil eine eigene
// Naht: Er waechst mit jeder Stufe der Datenbank weiter, und die
// Kanal-Gruppen des Haupt-Prozesses sind aus demselben Grund laengst in eigene
// Module unter `ipc/` geschnitten.
//
// Reine Kanal-Bindungen ohne eigenen Zustand. `ipcRenderer` kommt als Parameter
// und nicht per Require, damit das Modul ohne Electron pruefbar bleibt.
'use strict';

/**
 * Die Kanal-Bindungen rund um die Datenbank.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses.
 * @returns {object} Eintraege fuer das Bruecken-Objekt.
 */
function datenbankBruecke(ipcRenderer) {
  return {
    // 4T-001510 (Epic 3E-000250, E4): Der Katalog der Datenbank in zwei
    // Auskuenften. Seit 4T-001758 traegt der Ueberblick zusaetzlich die
    // Bereichs-Art und ist auch ohne offene Datei aufrufbar.
    databaseOverview: (params) => ipcRenderer.invoke('database:overview', params),
    databaseTable: (params) => ipcRenderer.invoke('database:table', params),
    // 4T-001758 (Epic 3E-000253): Anzeige-Einstellung der Datenbank im Bereich
    // (Muster der Start-Seite: ein Lese- und ein Schreib-Kanal).
    getAreaDatabaseConfig: () => ipcRenderer.invoke('area:getDatabaseConfig'),
    setAreaDatabaseConfig: (config) => ipcRenderer.invoke('area:setDatabaseConfig', config),
    // 4T-001759 (Epic 3E-000253): Der Menue-Weg zur Uebersichts-Seite. Er steht
    // hier und nicht bei den uebrigen Menue-Kanaelen in preload.js, weil jene
    // Datei exakt auf ihrem Groessen-Budget steht; die Datenbank-Naht ist
    // genau fuer diesen Fall gezogen worden.
    onMenuOpenDatabaseOverview: (cb) => ipcRenderer.on('menu:openDatabaseOverview', () => cb()),
  };
}

module.exports = { datenbankBruecke };
