// 4T-002348 (Epic 3E-000184): Der Anteil der Preload-Brücke an der Ausführung
// der Workflows — ein Schritt an den Hauptprozess, die Antwort auf einen
// Puffer-Auftrag und der Lauf-Stand; seit 4T-002355 dazu die Liste des
// Workflow-Ordners und die Konfiguration seiner Einstellungs-Abschnitte.
//
// Eigenes Modul nach dem Muster `datenbankBruecke`, weil `preload.js` auf
// seinem eingefrorenen Größen-Budget steht. Den Lese-Kanal für den Lauf-Stand
// trägt seit 4T-002350 die Seite «Workflow-Läufe» bei.
//
// Reine Kanal-Bindungen ohne eigenen Zustand. `ipcRenderer` kommt als Parameter
// und nicht per Require, damit das Modul ohne Electron prüfbar bleibt.
'use strict';

/**
 * Die Kanal-Bindungen der Workflow-Ausführung.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses.
 * @returns {object} Einträge für das Brücken-Objekt.
 */
function workflowsBridge(ipcRenderer) {
  return {
    // Einen gefüllten Schritt im Hauptprozess ausführen; Nutzlast
    // { workflowPath, step }, Antwort das Ergebnis-Objekt des Schritts.
    workflowStep: (workflowPath, step) =>
      ipcRenderer.invoke('workflow:step', { workflowPath, step }),
    // Auftrag des Hauptprozesses an dieses Fenster: Es hält den ungespeicherten
    // Stand der Ziel-Datei. Nutzlast { requestId, path, edit }.
    onWorkflowBufferEdit: (cb) =>
      ipcRenderer.on('workflow:bufferEdit', (_e, auftrag) => cb(auftrag)),
    // Antwort auf diesen Auftrag mit derselben Kennung.
    workflowBufferEditDone: (antwort) => ipcRenderer.invoke('workflow:bufferEditDone', antwort),
    // Lauf-Stand am Ende eines Laufs; Nutzlast { workflowPath, run }.
    workflowRecordRun: (workflowPath, run) =>
      ipcRenderer.invoke('workflow:recordRun', { workflowPath, run }),
    // 4T-002355: die Liste des Workflow-Ordners dieses Fensters; die Abfrage
    // meldet das Fenster zugleich an der Beobachtung des Ordners an.
    workflowFolderList: () => ipcRenderer.invoke('workflow:folderList'),
    // Der Ordner oder seine Festlegung hat sich geändert: Liste neu abfragen.
    onWorkflowFolderChanged: (cb) => ipcRenderer.on('workflow:folderChanged', () => cb()),
    // Konfigurations-Stand beider Ebenen und Schreiben der Bereichs-Sektion
    // (Einstellungs-Abschnitte «Workflows»).
    workflowGetConfig: () => ipcRenderer.invoke('workflow:getConfig'),
    workflowSetAreaConfig: (config) => ipcRenderer.invoke('workflow:setAreaConfig', config),
    // 4T-002355 (Teil 2): Handgriff aus dem Untermenü «Datei → Workflows»
    // ({ kind, path? }), «Neuer Workflow …» (Ordner festhalten, Datei anlegen)
    // und die Frage, ob eine Datei des Bereichs ein Workflow ist (Kontextmenü).
    onWorkflowMenuAction: (cb) => ipcRenderer.on('workflow:menuAction', (_e, aktion) => cb(aktion)),
    workflowSetFolder: (folder) => ipcRenderer.invoke('workflow:setFolder', { folder }),
    workflowCreate: (name) => ipcRenderer.invoke('workflow:create', { name }),
    workflowFileInfo: (filePath) => ipcRenderer.invoke('workflow:fileInfo', filePath),
    // 4T-002350: alle Workflows des Bereichs mit Lauf-Stand (Seite «Workflow-Läufe»).
    workflowRuns: () => ipcRenderer.invoke('workflow:runs'),
  };
}

module.exports = { workflowsBridge };
