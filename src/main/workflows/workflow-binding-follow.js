// 4T-002364 (Epic 3E-000184): Tastenkürzel und Plätze eines Workflows ziehen
// mit, wenn er in der Anwendung umbenannt oder verschoben wird (Entscheidung
// des Product Owners zu P1 vom 2026-10-23, Story 4S-001105, AK10).
//
// **Ort.** Jede Bewegung einer Datei in der Anwendung läuft durch
// `renameSingleFile` (`src/main/documents/link-update.js`); dort wird
// `nachBewegung` nach gelungener Bewegung gerufen, im Muster der Start-Seite
// (`followAreaStartPage`). Geschrieben wird einmal im Hauptprozess, weil die
// Belegungen anwendungsweit gespeichert sind; der Rundruf an die Fenster läuft
// über die eine Verteilung (`src/main/ipc/settings-verteilung.js`).
//
// **Abbildung.** Für jeden wirksamen Workflow-Ordner der offenen Fenster, der
// den alten Pfad enthält, ist die alte Kennung die des alten Pfads relativ zum
// Ordner. Enthält er auch den neuen, ist die neue Kennung die des neuen Pfads;
// sonst bleibt alles gespeichert (Entscheidung O1 des Tasks vom 2026-10-24:
// Die Belegungen wirken nicht, solange die Datei draußen liegt, und wirken
// wieder, sobald sie an denselben Ort zurückkehrt). Der Ordner zählt ohne
// Rücksicht auf den Schalter der Erweiterung, damit eine Umbenennung bei
// abgeschalteter Erweiterung die Belegungen trotzdem mitnimmt. Ob die Datei das
// Workflow-Kennzeichen trägt, wird nicht gelesen: Umgeschrieben wird nur, was
// unter der alten Kennung gespeichert ist.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { isInsideArea } = require('../area/area-path');
const { pathCompareKey } = require('../../shared/platform.js');
const { workflowCommandId } = require('../../shared/workflows/workflow-command-id.js');
const {
  BELEGUNGS_SCHLUESSEL,
  belegungsAbbildung,
  schreibeBelegungenUm,
} = require('../../shared/workflows/workflow-binding-rewrite.js');

// Pfad relativ zum Ordner mit `/` als Trenner, oder null außerhalb. Der Rest
// wird aus dem Pfad selbst geschnitten statt über path.relative gebildet, weil
// dessen Schreibungs-Regel an der Plattform des Pfad-Moduls hängt und nicht an
// der des Datei-Systems (macOS vergliche sonst schreibungs-genau).
function relativImOrdner(ordner, datei) {
  if (!isInsideArea(ordner, datei)) return null;
  const basis = path.resolve(ordner).replace(/[\\/]+$/, '');
  const rest = path.resolve(datei).slice(basis.length + 1);
  return rest ? rest.split(path.sep).join('/') : null;
}

/**
 * Die Kennungs-Paare einer Bewegung über alle Ordner.
 *
 * @param {string[]} ordnerListe Wirksame Workflow-Ordner (absolut).
 * @param {string} oldPath Bisheriger Pfad.
 * @param {string} newPath Neuer Pfad.
 * @returns {Array<[string, string]>} Paare alt -> neu.
 */
function kennungsPaare(ordnerListe, oldPath, newPath) {
  const paare = [];
  for (const ordner of ordnerListe) {
    const relAlt = relativImOrdner(ordner, oldPath);
    const relNeu = relAlt ? relativImOrdner(ordner, newPath) : null;
    if (!relAlt || !relNeu) continue;
    paare.push([workflowCommandId(relAlt), workflowCommandId(relNeu)]);
  }
  return paare;
}

// Doppelte Ordner zählen einmal (Vergleichs-Schlüssel der Plattform).
function eindeutig(ordnerListe) {
  const gesehen = new Map();
  for (const ordner of ordnerListe) {
    if (typeof ordner !== 'string' || ordner === '') continue;
    const schluessel = pathCompareKey(path.resolve(ordner));
    if (!gesehen.has(schluessel)) gesehen.set(schluessel, ordner);
  }
  return [...gesehen.values()];
}

/**
 * Die wirksamen Workflow-Ordner aller offenen Fenster.
 *
 * @param {object} deps
 * @param {Map} deps.windows Fenster-Register.
 * @param {(win: object) => Promise<{folder: string|null}>} deps.resolveForWindow
 *   Auflösung je Fenster (Dienst `workflow-folder-service.js`).
 * @returns {() => Promise<string[]>}
 */
function ordnerAllerFenster({ windows, resolveForWindow }) {
  return async () => {
    const ordner = [];
    for (const win of windows ? windows.values() : []) {
      if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) continue;
      const lage = await resolveForWindow(win);
      if (lage && lage.folder) ordner.push(lage.folder);
    }
    return ordner;
  };
}

/**
 * Baut den Nachzug der Belegungen.
 *
 * @param {object} deps
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {(key: string, value: *, sender: null) => void} deps.verteileEinstellung
 *   Verteilung an alle Fenster (`createSettingsVerteilung`).
 * @param {() => Promise<string[]>} deps.ordnerJeFenster Wirksame Ordner der offenen Fenster.
 * @returns {{nachBewegung: (oldPath: string, newPath: string) => Promise<{geaendert: string[]}>}}
 */
function createWorkflowBindingFollow({ getStore, verteileEinstellung, ordnerJeFenster }) {
  async function nachBewegung(oldPath, newPath) {
    const store = getStore();
    if (!store) return { geaendert: [] };
    const ordner = eindeutig(await ordnerJeFenster());
    const abbildung = belegungsAbbildung(kennungsPaare(ordner, oldPath, newPath));
    if (abbildung.size === 0) return { geaendert: [] };
    const werte = {};
    for (const schluessel of BELEGUNGS_SCHLUESSEL) werte[schluessel] = store.get(schluessel);
    const neu = schreibeBelegungenUm(werte, abbildung);
    // Geschrieben und verteilt wird allein, was sich geändert hat.
    for (const [schluessel, wert] of Object.entries(neu)) {
      store.set(schluessel, wert);
      verteileEinstellung(schluessel, wert, null);
    }
    return { geaendert: Object.keys(neu) };
  }
  return { nachBewegung };
}

module.exports = { createWorkflowBindingFollow, kennungsPaare, ordnerAllerFenster };
