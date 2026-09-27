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
    // 4T-001792 (Epic 3E-000255, E10.14): Die Änderungsbelege EINES
    // Datensatzes für die lesende Beleg-Ansicht. Parameter sind der Pfad der
    // Tabellen-Datei und die interne Kennung des Datensatzes; der Kanal prüft
    // beide selbst und fail-closed.
    databaseChangeLog: (params) => ipcRenderer.invoke('database:changeLog', params),
    // 4T-001825 (Epic 3E-000254, Bauplan B1): Die beiden Einstiege der
    // Schreib-Schnittstelle. `databaseAuftrag` nimmt `{ auftrag }` mit der Liste
    // `anweisungen`, `databaseNeuanlage` nimmt `{ tabelle }`; beide Kanäle
    // prüfen selbst und fail-closed und liefern das sprachneutrale Ergebnis der
    // Schnittstelle unverändert zurück. Ein Aufrufer in der Oberfläche entsteht
    // erst mit der erzeugten Maske.
    databaseAuftrag: (params) => ipcRenderer.invoke('database:auftrag', params),
    databaseNeuanlage: (params) => ipcRenderer.invoke('database:neuanlage', params),
    // 4T-001938 (Epic 3E-000257, B4): EIN Datensatz für die Einzel-Maske, frisch
    // gelesen, mit Zellen, Erwartung, Bearbeitbarkeit und erzeugtem Körper.
    // Parameter `{ tabelle, kennung, sprache }`, `kennung: null` für die
    // Neuanlage; der Kanal prüft selbst und fail-closed.
    databaseDatensatz: (params) => ipcRenderer.invoke('database:datensatz', params),
    // 4T-001941 (Epic 3E-000257, B1): Die Sperre EINES Datensatzes für die
    // Einzel-Maske. Parameter `{ aktion, tabelle, kennung, stand }` mit den
    // Aktionen nehmen, freigeben, brechen und auskunft; der Kanal prüft selbst
    // und fail-closed und liefert ein sprachneutrales Ergebnis.
    databaseSperre: (params) => ipcRenderer.invoke('database:sperre', params),
    // 4T-001942 (Epic 3E-000257, B1): Die Datensätze EINER Tabelle für die
    // Wertehilfe der Verweis-Felder. Parameter `{ tabelle }` als Name oder Pfad;
    // der Kanal prüft selbst und fail-closed.
    databaseDatensaetze: (params) => ipcRenderer.invoke('database:datensaetze', params),
    // 4T-001943 (Epic 3E-000257, B1): Die erzeugte Maske EINER Tabelle als
    // Datei neben die Tabelle schreiben. Parameter `{ tabelle, sprache }`; der
    // Kanal prüft selbst und fail-closed und überschreibt nie eine vorhandene
    // Datei.
    databaseMaskeSchreiben: (params) => ipcRenderer.invoke('database:maskeSchreiben', params),
    // 4T-001944 (Epic 3E-000257, B3): Die Konsistenz-Prüfung über den Bestand.
    // Parameter `{ tabelle }` als Name oder Pfad EINER Tabelle oder `null` für
    // alle; der Kanal prüft selbst und fail-closed und schreibt nichts.
    databaseKonsistenz: (params) => ipcRenderer.invoke('database:konsistenz', params),
    // 4T-001945 (Epic 3E-000257, B2): Der Verwendungsnachweis. Parameter
    // `{ tabelle, kennung }` mit `tabelle` als Name oder Pfad und `kennung` als
    // interne Kennung oder `null` für die Tabellen-Ebene; der Kanal prüft selbst
    // und fail-closed und schreibt nichts.
    databaseVerwendung: (params) => ipcRenderer.invoke('database:verwendung', params),
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
