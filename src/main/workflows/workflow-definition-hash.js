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
// **Stufe 3** (4T-002463, Epic 3E-000367, Story 4S-001146, Entscheidung 3c
// und Ausführungs-Entscheidung 3 der Konzept-Runde 4T-002458): dazu die
// Ereignis-Zeile `event`, **nur wenn sie im Dateikopf steht**. Ein fehlendes
// Feld geht hier nicht als `null` ein, sondern gar nicht, damit die Prüfsumme
// eines vor der Stufe 3 scharf geschalteten Workflows mit Zeitplan gleich
// bleibt (Ausführungs-Entscheidung der Sitzung vom 2026-10-31). Jede Änderung
// bleibt erkannt: Hinzufügen, Entfernen und Ändern der Zeile ändern die
// kanonische Form.
//
// **Nachbesserung 4T-002465** (Epic 3E-000367, Story 4S-001149, Rahmen 3c/1f
// der Konzept-Runde 4T-002458: «Es läuft nie ein Inhalt ohne Zuschauer, den
// niemand freigegeben hat»): dazu der Quelltext jedes Skript-Blocks, den ein
// Schritt `script` oder `if-script` des Blocks über seinen Abschnitt
// referenziert. Aufgelöst wird mit `scriptBlock` wie im Prüfen vor Laufen
// (src/shared/workflows/workflow-check.js), je Schritt in Lese-Reihenfolge als
// Paar aus Abschnitts-Name und Quelltext (Zeilen ohne Leerraum am Ende), ein
// nicht auflösbarer Abschnitt mit dem Code der Abschnitts-Suche statt eines
// Quelltexts. Eine Änderung in einem referenzierten Abschnitt setzt damit auf
// «Definition geändert»; andere Abschnitte des Dokuments bleiben ohne
// Wirkung. **Ohne Skript-Schritt geht das Feld gar nicht ein**, damit die
// Prüfsumme eines scharfen Workflows ohne Skript nach dem Update gleich bleibt
// (wie bei der Ereignis-Zeile). Weil auch der ungespeicherte Stand des Editors
// als ganzer Text hierher kommt (`readWorkflowText`), gilt das für ihn ebenso.
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
const { SCRIPT_KEYWORDS } = require('../../shared/workflows/workflow-catalog.js');
const {
  readWorkflowDocument,
  scriptBlock,
} = require('../../shared/workflows/workflow-document.js');
const { readBlock } = require('../../shared/workflows/workflow-line-reader.js');

/** Die Zeitplan-Felder des Dateikopfs, die zur Definition gehören. */
const DEFINITION_KOPF_FELDER = Object.freeze(['trigger', 'schedule', 'missed']);
/** Die Ereignis-Zeile; Teil der Definition, wenn sie im Dateikopf steht (Stufe 3). */
const DEFINITION_EREIGNIS_FELD = 'event';

/**
 * Die Skript-Abschnitte, die die Schritte `script` und `if-script` eines
 * Blocks referenzieren, je Schritt in Lese-Reihenfolge; dieselbe Auflösung wie
 * im Prüfen vor Laufen (`scriptBlock` über den Text des Dokuments).
 *
 * @param {string} quelle Text der Workflow-Datei ohne Byte-Order-Zeichen.
 * @param {{lines: string[], contentLine: number}} block aus `readWorkflowDocument`.
 * @returns {Array<[string, string[]|string]>} je Schritt Abschnitts-Name und
 *   Quelltext-Zeilen, bei nicht auflösbarem Abschnitt der Code der Suche.
 */
function referenzierteSkripte(quelle, block) {
  const skripte = [];
  for (const anweisung of readBlock(block.lines, block.contentLine).statements) {
    if (!SCRIPT_KEYWORDS.includes(anweisung.keyword)) continue;
    const abschnitt = anweisung.tokens[0];
    if (!abschnitt || abschnitt.type !== 'string' || abschnitt.value.trim() === '') continue;
    const gefunden = scriptBlock(quelle, abschnitt.value);
    skripte.push([
      abschnitt.value,
      gefunden.ok ? gefunden.source.split('\n').map((zeile) => zeile.trimEnd()) : gefunden.code,
    ]);
  }
  return skripte;
}

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
  const ereignis = kopfWert(daten[DEFINITION_EREIGNIS_FELD]);
  if (ereignis !== null) kopf.push([DEFINITION_EREIGNIS_FELD, ereignis]);
  const block = doc.block.lines.map((zeile) => zeile.trimEnd());
  const skripte = referenzierteSkripte(quelle, doc.block);
  return JSON.stringify(skripte.length > 0 ? { kopf, block, skripte } : { kopf, block });
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

module.exports = {
  DEFINITION_EREIGNIS_FELD,
  DEFINITION_KOPF_FELDER,
  definitionsKanon,
  definitionsPruefsumme,
};
