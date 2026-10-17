// 4T-002278 (Epic 3E-000348): Die Kanäle des Publikums-Fensters der
// Präsentation (Story 4S-001075), als eigene Kanal-Gruppe nach dem Muster von
// presentation-export.js. Der Fenster-Erzeuger selbst liegt in
// src/main/praesentation-fenster.js.
//
// **Warum eine eigene Kanal-Gruppe:** Die Zuständigkeit lässt sich in einem
// Satz sagen — ein Hauptfenster öffnet und schließt sein Publikums-Fenster und
// reicht ihm die gezeichnete Folie, das Publikums-Fenster meldet seine Eingaben
// zurück. Kein anderer Kanal teilt diesen Gegenstand.
//
// Aus dem Hauptfenster (Preload preload.js):
//   presentationWindow:open    öffnet das Publikums-Fenster des Absenders;
//                              Antwort { ok, vollbild, schonOffen }.
//   presentationWindow:close   schließt es; Antwort true, wenn eines offen war.
//   presentationWindow:slide   reicht die gezeichnete Folie weiter
//                              ({ html, index, gesamt, breite, hoehe }).
// An das Hauptfenster (webContents.send):
//   presentationWindow:input   eine geprüfte Eingabe des Publikums-Fensters.
//   presentationWindow:closed  das Publikums-Fenster ist geschlossen.
//
// Aus dem Publikums-Fenster (Preload preload-publikum.js):
//   audience:ready             Antwort ist die zuletzt gelieferte Folie oder null.
//   audience:input             eine Eingabe (Taste, Rad, Klick, Beenden).
// An das Publikums-Fenster:
//   audience:slide             die Folie.
//
// **Schmale Endpunkte:** Jeder Kanal prüft seine Nutzlast (praesentation-
// fenster.js, `pruefeFolie`, `pruefeEingabe`), und die Kanäle des
// Publikums-Fensters wirken nur für einen Absender, der als Publikums-Fenster
// eingetragen ist; ein Hauptfenster kann über sie nichts auslösen.
'use strict';

const { createPraesentationFenster } = require('../praesentation-fenster');

/**
 * Registriert die Kanäle des Publikums-Fensters.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {Function} deps.BrowserWindow Electron-Klasse.
 * @param {object} [deps.screen] Electron-Bildschirm-Modul; Vorgabe: das der Laufzeit,
 *   gelesen erst beim Registrieren (nach dem ready-Ereignis).
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} [deps.tForWindow] Übersetzung.
 * @param {boolean} [deps.imTestlauf] E2E-Lauf erkannt.
 * @param {Function} [deps.erzeuger] Ersatz des Fenster-Erzeugers (Prüfungen).
 * @returns {object} der Fenster-Erzeuger (für Prüfungen).
 */
function registerPresentationWindowIpc(handle, deps) {
  const { BrowserWindow, senderWindow, tForWindow, imTestlauf } = deps;
  const screen = deps.screen || require('electron').screen;
  const fenster = (deps.erzeuger || createPraesentationFenster)({
    BrowserWindow,
    screen,
    // Ohne eigenes Symbol: Das Fenster zeigt das des Programms. Die Wahl der
    // Symbol-Datei je Plattform bleibt damit allein in window-manager.js.
    imTestlauf: !!imTestlauf,
    titel: (owner) =>
      typeof tForWindow === 'function' ? tForWindow(owner, 'presentation.publikumTitel') : '',
  });

  handle('presentationWindow:open', (event) => fenster.oeffne(senderWindow(event)));
  handle('presentationWindow:close', (event) => fenster.schliesse(senderWindow(event)));
  handle('presentationWindow:slide', (event, folie) =>
    fenster.sendeFolie(senderWindow(event), folie),
  );
  handle('audience:ready', (event) => fenster.bereit(event && event.sender));
  handle('audience:input', (event, eingabe) => fenster.eingabe(event && event.sender, eingabe));
  return fenster;
}

module.exports = { registerPresentationWindowIpc };
