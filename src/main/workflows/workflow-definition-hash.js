// 4T-002420 (Epic 3E-000366): Die Prüfsumme der Definition eines Workflows,
// Schutz der Scharf-Schaltung gegen eine geänderte Definition (Story
// 4S-001131, Entscheidung 2e der Konzept-Runde der Stufe 2).
//
// **Was die Definition ist** (Ausführungs-Entscheidung der Sitzung vom
// 2026-10-28 im Epic): der Befehls-Block und die Zeitplan-Felder des
// Dateikopfs `trigger`, `schedule` und `missed`. Name, Beschreibung und der
// Beschreibungs-Text außerhalb des Blocks gehören nicht dazu; eine Änderung
// dort lässt einen scharfen Workflow scharf.
//
// **Gelesen wird mit den Heimaten des Bestands**, kein zweiter Erkenner: den
// Block liefert `readWorkflowDocument` (Zaun-Regel der obersten Ebene, genau ein
// Block), die Kopf-Felder `extractFrontmatter`, beide nach Abzug eines
// Byte-Order-Zeichens wie im Format-Kern.
//
// **Normalisierung:** Zeilenenden fallen beim Zerlegen weg (`\r\n` und `\n`
// gleich), Leerraum am Zeilenende der Block-Zeilen wird abgeschnitten; sonst
// zählt jedes Zeichen, auch Leer- und Kommentar-Zeilen im Block. Die
// Kopf-Felder gehen mit ihrem gelesenen Wert ein, Zeichenketten ohne Leerraum
// am Rand, ein fehlendes Feld als `null`. Ein fehlendes Feld und sein
// ausgeschriebener Vorgabe-Wert (`trigger: manual`, `missed: run-once`)
// ergeben bewusst verschiedene Prüfsummen: Die Prüfsumme kennt keine Vorgaben
// der Grammatik und setzt im Zweifel zurück, nie umgekehrt.
//
// **Keine Prüfsumme** (null) ohne Kennzeichen im Dateikopf oder ohne genau
// einen Block: Eine solche Datei läuft nicht und kann nicht scharf sein.
//
// **Verfahren:** SHA-256 über die kanonische Form als UTF-8, hexadezimal wie
// die Inhalts-Prüfsummen der Dokument-Historie, gerechnet mit `node:crypto`.
//
// **Ort im Hauptprozess** (Nacharbeit vom 2026-10-28): Die Prüfsumme braucht
// allein der Hauptprozess, der den Lauf-Stand schreibt und liest; der Ordner
// `src/shared/workflows/` bleibt frei von Node-Modulen (Wächter in
// test/unit/workflow-core.test.js). Gelesen wird mit den prozessneutralen
// Heimaten aus `src/shared/`.
//
// Kein Electron, kein Datei-Zugriff.
'use strict';

const crypto = require('node:crypto');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');

/** Die Zeitplan-Felder des Dateikopfs, die zur Definition gehören. */
const DEFINITION_KOPF_FELDER = Object.freeze(['trigger', 'schedule', 'missed']);

function kopfWert(wert) {
  if (wert === undefined || wert === null) return null;
  return typeof wert === 'string' ? wert.trim() : wert;
}

/**
 * Die kanonische Form der Definition, aus der die Prüfsumme entsteht.
 *
 * @param {string} text Inhalt der Workflow-Datei.
 * @returns {string|null} JSON-Text aus Kopf-Feldern und Block-Zeilen, oder null
 *   ohne Kennzeichen oder ohne genau einen Block.
 */
function definitionsKanon(text) {
  const quelle = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  const doc = readWorkflowDocument(quelle);
  if (!doc.isWorkflow || !doc.block) return null;
  const daten = extractFrontmatter(quelle).data || {};
  const kopf = DEFINITION_KOPF_FELDER.map((feld) => [feld, kopfWert(daten[feld])]);
  const block = doc.block.lines.map((zeile) => zeile.trimEnd());
  return JSON.stringify({ kopf, block });
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Die Prüfsumme der Definition einer Workflow-Datei.
 *
 * @param {string} text Inhalt der Workflow-Datei.
 * @returns {string|null} SHA-256 hexadezimal (64 Zeichen) oder null, wenn die
 *   Datei keine lauffähige Definition trägt.
 */
function definitionsPruefsumme(text) {
  const kanon = definitionsKanon(text);
  return kanon === null ? null : sha256Hex(kanon);
}

module.exports = { DEFINITION_KOPF_FELDER, definitionsKanon, definitionsPruefsumme };
