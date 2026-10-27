// 4T-002347 (Epic 3E-000184): Die Workflow-Dateien einer Bereichs-Wurzel.
//
// **Das Kennzeichen liegt schon im Index.** `extractProperties` legt
// `workflow: true` als Eigenschaft `workflow` mit dem Wert `'true'` in
// `entry.propertiesPerFile` ab; diese Sicht liest die Map, ohne eine Datei zu
// öffnen und ohne eine eigene Index-Marke. Erkannt wird mit derselben Funktion
// wie im Format-Kern (`isWorkflowFlag`), damit Liste und Erkennung nicht
// auseinanderlaufen. Ob eine gelistete Datei genau einen Block trägt, sagt erst
// das Lesen der Datei im Kern; die Liste ist die Menge der gekennzeichneten
// Dateien.
//
// Read-only ohne eigenen Scan wie die Nachbarn: Status-Durchreichung und
// Puffer-Overlay nach dem Muster von `datenbank-bestand.js`, damit eine offene,
// noch nicht gespeicherte Workflow-Datei schon erscheint.
'use strict';

const path = require('node:path');
const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');
const {
  WORKFLOW_FLAG_KEY,
  isWorkflowFlag,
} = require('../../shared/workflows/workflow-document.js');

/**
 * Die Workflow-Dateien des Bereichs.
 *
 * @param {string|null} filePath eine Datei, über die die Wurzel bestimmt wird.
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters, falls vorhanden.
 * @returns {{status: string, wurzel?: string, dateien: {absPath: string, relPath: string}[]}}
 *   `status` wie bei den Nachbar-Sichten: `ready`, `indexing` oder `unavailable`.
 */
function workflowFilesFor(filePath, areaRoot) {
  if (!filePath && !areaRoot) return { status: 'unavailable', dateien: [] };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable', dateien: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', dateien: [] };
  if (entry.status === 'indexing') return { status: 'indexing', dateien: [] };
  // Fehler- und Übergroß-Status wie unavailable (Muster eigenschafts-werte.js):
  // kein eingefrorener Index eines toten Beobachters als verbindliche Liste.
  if (entry.status === 'oversized' || entry.status === 'error') {
    return { status: 'unavailable', dateien: [] };
  }
  const sicht = entryWithOverlay(entry, overlaysUnder(root));
  const dateien = [];
  for (const [absPath, props] of sicht.propertiesPerFile) {
    if (!props || !isWorkflowFlag(props[WORKFLOW_FLAG_KEY])) continue;
    dateien.push({ absPath, relPath: path.relative(root, absPath).split(path.sep).join('/') });
  }
  dateien.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { status: 'ready', wurzel: root, dateien };
}

module.exports = { workflowFilesFor };
