// 4T-002355 (Epic 3E-000184): Die Liste des Workflow-Ordners je Fenster für den
// Menü-Aufbau.
//
// **Warum ein Zwischenstand.** Das Menü eines Fensters wird synchron gebaut
// (`applyMenuToWindow` in `menu/menu-apply.js`), die Liste entsteht aber erst
// durch Lesen des Ordners. Dieses Modul hält deshalb je Fenster die zuletzt
// gelesene Liste; fehlt sie, liefert es null (das Untermenü bleibt einen
// Augenblick weg) und liest sie nach, danach baut es das Menü dieses Fensters
// neu (Muster: die zuletzt bereite Antwort, `database/datenbank-bereich.js` im
// Fenster).
//
// **Wann neu gelesen wird.** (1) Beim ersten Menü-Aufbau eines Fensters; das
// Lesen geht über `folderListFor` und meldet das Fenster damit an der
// Beobachtung des Ordners an. (2) Bei jeder Meldung des Dienstes (`onChange`):
// Änderung im Ordner, an seiner Festlegung oder am Erweiterungs-Schalter.
// (3) Bei jeder Abfrage des Fensters über `workflow:folderList` (`merke`), etwa
// nach einem Bereichs-Wechsel. Das Menü wird nur neu gebaut, wenn sich die
// Liste tatsächlich geändert hat.
//
// Eigener Zustand: die Listen je Fenster und die laufenden Lese-Vorgänge.
'use strict';

/**
 * Baut den Zwischenstand der Menü-Listen.
 *
 * @param {object} deps
 * @param {object} deps.dienst Dienst des Workflow-Ordners (`folderListFor`, `onChange`).
 * @param {Map} deps.windows Fenster-Register (Kennung des Anzeige-Prozesses -> Fenster).
 * @param {(win: object) => void} deps.applyMenuToWindow Menü eines Fensters neu setzen.
 * @returns {{listFor: Function, merke: Function, lade: Function}}
 */
function createWorkflowMenuLists({ dienst, windows, applyMenuToWindow }) {
  const listen = new Map(); // Fenster-Kennung -> Liste
  const laufend = new Set();
  const bekannt = new Set(); // Fenster mit Abmelde-Haken

  function vergiss(win, id) {
    if (bekannt.has(id)) return;
    bekannt.add(id);
    win.webContents.once('destroyed', () => {
      listen.delete(id);
      bekannt.delete(id);
    });
  }

  function merke(win, liste) {
    if (!win || win.isDestroyed() || !liste) return;
    const id = win.webContents.id;
    vergiss(win, id);
    const vorher = listen.get(id);
    listen.set(id, liste);
    if (vorher && JSON.stringify(vorher) === JSON.stringify(liste)) return;
    applyMenuToWindow(win);
  }

  async function lade(win) {
    if (!win || win.isDestroyed()) return;
    const id = win.webContents.id;
    if (laufend.has(id)) return;
    laufend.add(id);
    try {
      merke(win, await dienst.folderListFor(win));
    } catch (err) {
      console.warn('Workflow-Menü: Liste nicht lesbar:', err && err.message);
    } finally {
      laufend.delete(id);
    }
  }

  // Die Liste eines Fensters für den Menü-Aufbau; null, solange sie fehlt.
  function listFor(id) {
    if (listen.has(id)) return listen.get(id);
    const win = windows.get(id);
    if (win && !win.isDestroyed()) void lade(win);
    return null;
  }

  dienst.onChange((ids) => {
    for (const id of ids) {
      const win = windows.get(id);
      if (win && !win.isDestroyed()) void lade(win);
    }
  });

  return { listFor, merke, lade };
}

module.exports = { createWorkflowMenuLists };
