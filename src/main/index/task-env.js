// 4T-002080 (Epic 3E-000259): die Aufgaben-Umgebung einer Abfrage, einmal
// gebaut für alle Kanäle, die eine Abfrage auswerten.
//
// Der Erzeuger (`frontmatterQueryFor` in query.js) wertet die Aufgaben-Ebene
// nur aus, wenn ihm diese Umgebung sagt, dass die Erweiterung «Aufgaben» an
// ist, und welche Vorgaben gelten: Global Filter, globale Abfrage und die
// Auflösung der Status-Zeichen. Bis hierher baute allein der Abfrage-Kanal
// der Anzeige sie (src/main/ipc/index-views.js); die Kanäle von Wertevorrat
// und Lookup-Feld riefen den Erzeuger ohne sie, und jede Aufgaben-Abfrage war
// dort ein Abfrage-Fehler, also eine leere Quelle. Eine Stelle für alle
// Aufrufer verhindert, dass ein weiterer Kanal sie wieder vergisst oder anders
// baut.
//
// **Die Einstellungs-Werte kommen von außen.** Kein Modul dieses Ordners
// kennt den Einstellungs-Speicher (Muster index-schalter.js); der Aufrufer im
// IPC liest die drei Einträge je Lauf frisch und reicht sie herein, damit eine
// geänderte Einstellung sofort wirkt.
//
// **Der Fingerabdruck** fasst die Werte zusammen, von denen die Treffer einer
// Aufgaben-Abfrage abhängen. Ein Zwischenspeicher, der gegen den Index-Stand
// prüft, braucht ihn im Schlüssel: Eine geänderte Einstellung bewegt den
// Index-Stand nicht und ließe sonst die alten Treffer stehen. Die
// Status-Auflösung ist eine Funktion und nicht vergleichbar; der Abdruck
// enthält deshalb die Status-Definitionen, aus denen sie gebaut ist.
//
// Prozess-neutral und ohne Electron-Zugriff.

'use strict';

const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { createTaskStatusTypeResolver } = require('../../shared/markdown/plugins.js');

function getrimmt(wert) {
  return typeof wert === 'string' ? wert.trim() : '';
}

/**
 * Aufgaben-Umgebung einer Abfrage aus den Einstellungs-Werten.
 *
 * @param {object} [werte] Die Einstellungs-Werte, je Lauf frisch gelesen.
 * @param {string[]} [werte.disabledExtensions] Abgeschaltete Erweiterungen
 *   (`extensions.disabled`).
 * @param {object|null} [werte.tasksConfig] Aufgaben-Konfiguration
 *   (`tasksConfig`) mit `globalFilter` und `globalQuery`.
 * @param {object|null} [werte.taskStates] Status-Definitionen (`taskStates`).
 * @returns {{enabled: boolean, globalFilter: string, globalQuery: string,
 *   statusTypeOf: Function, fingerprint: string}} Die Umgebung, wie der
 *   Erzeuger sie erwartet, dazu ihr Fingerabdruck.
 */
function buildTaskEnv(werte) {
  const w = werte || {};
  const tasksConfig = w.tasksConfig && typeof w.tasksConfig === 'object' ? w.tasksConfig : null;
  const taskStates = w.taskStates === undefined ? null : w.taskStates;
  const enabled = isExtensionEnabled(
    'tasks',
    Array.isArray(w.disabledExtensions) ? w.disabledExtensions : [],
  );
  const globalFilter = getrimmt(tasksConfig && tasksConfig.globalFilter);
  // 4T-000505 (Epic 3E-000096): globale Abfrage (implizite FROM-/WHERE-Vorgabe
  // aus den Einstellungen) für alle TASKS-Abfragen.
  const globalQuery = getrimmt(tasksConfig && tasksConfig.globalQuery);
  let fingerprint;
  try {
    fingerprint = JSON.stringify([enabled, globalFilter, globalQuery, taskStates]);
  } catch {
    // Nicht serialisierbare Status-Definitionen: ein Abdruck, der nie
    // wiederkehrt, statt eines, der fälschlich gleich wäre.
    fingerprint = `unvergleichbar:${Date.now()}:${Math.random()}`;
  }
  return {
    enabled,
    globalFilter,
    globalQuery,
    statusTypeOf: createTaskStatusTypeResolver(taskStates),
    fingerprint,
  };
}

module.exports = { buildTaskEnv };
