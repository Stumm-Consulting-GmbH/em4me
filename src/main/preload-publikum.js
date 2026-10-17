// 4T-002278 (Epic 3E-000348): Das Preload des Publikums-Fensters der
// Präsentation. Es läuft mit `sandbox: true` und kennt deshalb allein das
// Modul `electron`; es reicht der Seite genau die drei Wege dieses Fensters,
// nichts aus dem Preload des Hauptfensters:
//
//   bereit()          meldet die geladene Seite; Antwort ist die zuletzt
//                     gelieferte Folie oder null.
//   onFolie(cb)       jede neue Folie: { html, index, gesamt, breite, hoehe }.
//   eingabe(daten)    eine Eingabe (Taste, Rad, Klick, Beenden) an das
//                     Hauptfenster; geprüft wird sie im Hauptprozess.
//
// Der Kanal-Vertrag steht im Kopf von src/main/ipc/presentation-window.js.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('publikum', {
  bereit: () => ipcRenderer.invoke('audience:ready'),
  onFolie: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('audience:slide', (_e, folie) => cb(folie));
  },
  eingabe: (daten) => ipcRenderer.invoke('audience:input', daten),
});
