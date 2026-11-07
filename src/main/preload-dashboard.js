// 4T-002510 (Epic 3E-000402): Der Dashboard-Anteil der Preload-Brücke.
//
// Zwei Aufrufe an die Kanäle des Dashboards (src/main/ipc/dashboard.js) und der
// Abfrage-Aufruf selbst, der seither die Werte der Filter mitnimmt. Der
// Abfrage-Aufruf steht hier und nicht mehr in preload.js, weil dessen
// Größenwert eingefroren ist (scripts/datei-groessen-ausnahmen.json); er heißt
// unverändert `runFrontmatterQuery`, damit kein Aufrufer nachgezogen werden
// muss. Die Felder werden einzeln kopiert wie im Handler, deshalb sind beide
// Enden nachgezogen (Entwicklungsrichtlinien, Kapitel 1).
//
// Keine Fach-Logik: Prüfung und Auswertung liegen im Hauptprozess.
'use strict';

/**
 * Die Einträge der Brücke rund um Dashboards.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses; als Parameter
 *   und nicht per Require, damit das Modul ohne Electron prüfbar bleibt (Muster
 *   `diagrammeBruecke`).
 * @returns {object} Einträge für das Brücken-Objekt.
 */
function dashboardBruecke(ipcRenderer) {
  return {
    // 4T-000354 (Epic 3E-000065): Frontmatter-Abfrage (perspective-query),
    // Auswertung im Main; lang ist die Programmsprache der Formatierer
    // (4T-001072). Seit 4T-002510 dazu `params`, die Werte der Filter eines
    // Dashboards; ohne sie bleibt der Aufruf, wie er war.
    runFrontmatterQuery: (filePath, query, lang, params) =>
      ipcRenderer.invoke('frontmatterQuery:run', {
        filePath,
        query: query || '',
        lang,
        ...(params === undefined ? {} : { params }),
      }),
    // Die im Bereich vergebenen Werte einer Kopf-Eigenschaft. Antwort
    // { status, values, wurzel? } oder { ok: false, code: 'abgewiesen' }.
    dashboardFilterWerte: (filePath, eigenschaft) =>
      ipcRenderer.invoke('dashboard:filterWerte', { filePath, eigenschaft }),
    // Ziel einer Kachel mit Abfrage-Datei. Antwort { ok: true, pfad, abfrage,
    // quelle } oder { ok: false, code, name? }.
    dashboardAbfrageDatei: (basePath, ziel) =>
      ipcRenderer.invoke('dashboard:abfrageDatei', { basePath, ziel }),
  };
}

module.exports = { dashboardBruecke };
