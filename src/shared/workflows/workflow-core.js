// 4T-002347 (Epic 3E-000184): Der Einstieg in den Format-Kern der Workflows.
//
// **Die Schnittstelle des Ordners** für alle Verbraucher: Prüf-Anzeige über dem
// Block (4T-002351), Start und Lauf-Steuerung (4T-002349), Ausführung im
// Hauptprozess (4T-002348), Menü und Seite «Workflow-Läufe» (4T-002355,
// 4T-002350). `analyzeWorkflow` setzt Erkennung, Zeilen-Leser und Prüfer zu
// einem Ergebnis zusammen; die übrigen Funktionen reicht das Modul aus den
// Fach-Modulen weiter, damit Verbraucher allein von hier laden.
//
// Hauptprozess und Anzeige-Prozess sehen damit denselben Befund (Lösungsansatz
// des Tasks). Der Kern kennt keine Sprache: Befunde sind Codes mit Zeile im
// Dokument (`line`) und im Block (`blockLine`); welche Zählung ein Hinweis
// nennt, entscheidet die Anzeige (Entscheidung der Sitzung vom 2026-10-22, O9:
// die Zeile im Dokument).
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { checkWorkflow } = require('./workflow-check.js');
const { readLine } = require('./workflow-line-reader.js');
const {
  isWorkflowFlag,
  readWorkflowDocument,
  sectionBody,
  WORKFLOW_FLAG_KEY,
} = require('./workflow-document.js');
const { checkAreaPath } = require('./workflow-paths.js');
const {
  prepareRun,
  templateInputs,
  templateRefs,
  workflowInputs,
} = require('./workflow-placeholders.js');

/**
 * Erkennt, liest und prüft eine Workflow-Datei vor dem Lauf.
 *
 * @param {string} text Inhalt der Datei (der aktuelle, auch ungespeicherte Stand).
 * @param {{fileName?: string, ownName?: string, templatesEnabled?: boolean,
 *   isKnownCommand?: Function, isKnownMacro?: Function, isKnownWorkflow?: Function}} [options]
 *   `ownName` fällt ohne Angabe auf den Namen der Datei selbst zurück.
 * @returns {{isWorkflow: boolean, meta: object|null, blockLines: number[],
 *   block: object|null, ok: boolean, steps: object[], findings: object[]}}
 */
function analyzeWorkflow(text, options = {}) {
  const doc = readWorkflowDocument(text, { fileName: options.fileName });
  if (!doc.isWorkflow) {
    return {
      isWorkflow: false,
      meta: null,
      blockLines: [],
      block: null,
      ok: false,
      steps: [],
      findings: [],
    };
  }
  const geprueft = checkWorkflow(doc, { ...options, ownName: options.ownName || doc.meta.name });
  return {
    isWorkflow: true,
    meta: doc.meta,
    blockLines: doc.blockLines,
    block: doc.block,
    ok: geprueft.ok,
    steps: geprueft.steps,
    findings: geprueft.findings,
  };
}

module.exports = {
  WORKFLOW_FLAG_KEY,
  analyzeWorkflow,
  checkAreaPath,
  isWorkflowFlag,
  prepareRun,
  readLine,
  sectionBody,
  templateInputs,
  templateRefs,
  workflowInputs,
};
