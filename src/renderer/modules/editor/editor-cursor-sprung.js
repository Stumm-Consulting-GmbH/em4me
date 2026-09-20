// 4T-001575 (Epic 3E-000282): Schreibposition einer Listenzeile — die reine
// Spalten-Rechnung des Cursor-Sprungs hinter den Listen-Marker.
//
// **Warum ein eigenes Modul und warum es nichts aus dem Renderer importiert.**
// Die Rechnung ist ohne Editor prüfbar und gehört deshalb nicht in die
// Tastenbelegung. Sie importiert ausschliesslich den gemeinsamen Struktur-Kern
// (src/shared/markdown/list-outline.js) und bleibt damit ausserhalb der
// Import-Zyklen-Komponente des Renderers: Ein Modul, das die Tastenbelegung
// einbindet, darf selbst nichts aus ihr beziehen, sonst waechst die Komponente
// um eine Datei (Befund des Waechters scripts/lint-ordner-importe.js beim
// ersten Zuschnitt dieses Vorgangs, der `lineInsideCodeBlock` von dort holte).
// Der Tasten-Handler liegt deshalb in editor-keymaps.js, wo Code-Block-Test und
// Laufzeit-Zustand schon zu Hause sind.
'use strict';

import { parseListLine } from '../../../shared/markdown/list-outline.js';

// Status-Kaestchen einer Aufgaben-Zeile samt seinem Abstand zum Text. Das
// Zeichen in der Klammer bleibt bewusst offen (`[^\]]`), damit die erweiterten
// Status-Zeichen aus 4S-000352 mitzaehlen; editor-list-tools.js kommt beim
// Listen-Ausstieg mit `[ xX]` aus, weil es dort nur um den leeren Punkt geht.
// Der verlangte Abstand (oder das Zeilenende) trennt das Kaestchen von einem
// gleich aussehenden Link-Text: `- [x](ziel)` ist kein Kaestchen.
const STATUS_KAESTCHEN_RE = /^\[[^\]]\](?:[ \t]+|$)/;

/**
 * Spalte der Schreibposition einer Listenzeile: hinter Einrueckung und Marker,
 * bei einer Aufgaben-Zeile zusaetzlich hinter dem Status-Kaestchen (E3 des
 * Epics).
 *
 * Reine Text-Funktion ohne Editor-Bezug. Die Marker-Breite kommt aus der
 * gemeinsamen Erkennung (`parseListLine`), damit «Listenzeile» hier dasselbe
 * heisst wie bei Einrueckung, Verschieben und Ausstieg.
 *
 * @param {string} text Text der Zielzeile.
 * @returns {number|null} Spalte (0-basiert) oder null, wenn keine Listenzeile.
 */
export function schreibSpalte(text) {
  const item = parseListLine(text);
  if (!item) return null;
  const kaestchen = STATUS_KAESTCHEN_RE.exec(item.content);
  const spalte = item.prefixLength + (kaestchen ? kaestchen[0].length : 0);
  return Math.min(spalte, String(text).length);
}
