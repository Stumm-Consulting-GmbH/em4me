// 4T-002349 (Epic 3E-000184): Die Kennung des Kommandos eines Workflows.
//
// Jeder Workflow des Workflow-Ordners ist ein dynamisches Kommando
// `workflow.<Pfad-Kennung>` der Kommando-Registry (Story 4S-001105, Entscheidung
// 3c der Konzept-Stufe: die Kennung aus dem Pfad relativ zum Ordner, damit zwei
// gleichnamige Workflows in verschiedenen Unterordnern unterscheidbar bleiben).
// Eine Funktion für Kommando-Palette und Menü, deshalb prozess-neutral.
//
// **Regel** (technisch entschieden, Plan des Tasks, Abschnitt 2.2): `workflow.`
// und der Pfad mit `/` als Trenner, in Unicode-Normalform NFC, einschließlich
// Endung, mit `encodeURIComponent` kodiert. Die Kodierung ist umkehrbar und
// enthält weder Anführungszeichen noch Rückstrich, die die Zeilen-Suche der
// Tastenkürzel-Seite brächen (`querySelector` mit `data-command-id`); NFC hält
// dieselbe Datei auf jedem Datei-System bei derselben Kennung.
//
// **Grenze:** Umbenennen oder Verschieben ändert die Kennung. In der Anwendung
// ziehen Tastenkürzel und Plätze mit (4T-002364, `workflow-binding-rewrite.js`
// und `src/main/workflows/workflow-binding-follow.js`); außerhalb der Anwendung
// zeigen sie danach ins Leere.
'use strict';

const WORKFLOW_COMMAND_PREFIX = 'workflow.';

function normalisiere(relPath) {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .normalize('NFC');
}

/**
 * Die Kommando-Kennung eines Workflows aus seinem Pfad relativ zum Ordner.
 *
 * @param {string} relPath Pfad relativ zum Workflow-Ordner.
 * @returns {string|null} `workflow.<Pfad-Kennung>` oder null bei leerem Pfad.
 */
function workflowCommandId(relPath) {
  const pfad = normalisiere(relPath);
  return pfad ? WORKFLOW_COMMAND_PREFIX + encodeURIComponent(pfad) : null;
}

/**
 * Der Pfad relativ zum Ordner aus einer Kommando-Kennung.
 *
 * @param {string} id Kommando-Kennung.
 * @returns {string|null} der Pfad oder null, wenn die Kennung keine eines Workflows ist.
 */
function relPathOfCommandId(id) {
  if (typeof id !== 'string' || !id.startsWith(WORKFLOW_COMMAND_PREFIX)) return null;
  try {
    const pfad = decodeURIComponent(id.slice(WORKFLOW_COMMAND_PREFIX.length));
    return pfad || null;
  } catch {
    return null;
  }
}

module.exports = { WORKFLOW_COMMAND_PREFIX, relPathOfCommandId, workflowCommandId };
