// Schliess-Kaskade einer Applikation: schliesst alle Fenster einer App
// sequenziell ueber den regulaeren Close-Pfad und laesst sich vom Nutzer
// abbrechen.
//
// Auszug aus window-manager.js, 4T-1231 (Epic 3E-0228). Die Rumpf-Inhalte
// reisen unveraendert mit; geaendert ist allein die Naht zu den Nachbarn:
// `appRegistry` und `windows` waren frueher freie Variablen derselben Datei
// und kommen jetzt als Abhaengigkeit.
//
// Eigentuemer-Zustand dieses Moduls:
//   cascadeCancel : Abbruch-Haken der laufenden Kaskade; null, solange keine
//                   laeuft.
'use strict';

/**
 * Baut die Schliess-Kaskade.
 *
 * @param {object} deps
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {Map<number, object>} deps.windows Fenster-Registry des Hauptprozesses.
 * @returns {object} closeAppWindows, closeAreaApp und cancelCascade.
 */
function erzeugeSchliessKaskade({ appRegistry, windows }) {
  // "Bereich schliessen" schliesst alle Fenster der Bereichs-App ueber den
  // regulaeren Close-Pfad (Speichern-Nachfragen pro Dokument). Sequenziell,
  // damit ein Nutzer-Abbruch (Speichern-Dialog -> Abbrechen) die Kaskade
  // stoppt; window:cancelClose meldet den Abbruch hierher.
  let cascadeCancel = null;

  function closeWindowAndWait(win) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        cascadeCancel = null;
        resolve(result);
      };
      cascadeCancel = () => finish(false);
      win.once('closed', () => finish(true));
      win.close();
    });
  }

  // Gemeinsamer Kaskaden-Kern fuer "Bereich schliessen" und "Arbeitsbereich
  // schliessen" (4T-0537): alle Fenster der App sequenziell ueber den
  // regulaeren Close-Pfad, Nutzer-Abbruch stoppt die Kaskade.
  async function closeAppWindows(appId) {
    for (const windowId of [...appRegistry.windowsOf(appId)]) {
      const win = windows.get(windowId);
      if (!win || win.isDestroyed()) continue;
      const closed = await closeWindowAndWait(win);
      if (!closed) return { ok: false, canceled: true };
    }
    return { ok: true };
  }

  async function closeAreaApp(appId) {
    if (!appRegistry.getArea(appId)) return { ok: false };
    return closeAppWindows(appId);
  }

  // 4T-0322: laufende Bereich-Schliessen-Kaskade abbrechen (window:cancelClose).
  function cancelCascade() {
    if (cascadeCancel) cascadeCancel();
  }

  return { closeAppWindows, closeAreaApp, cancelCascade };
}

module.exports = { erzeugeSchliessKaskade };
