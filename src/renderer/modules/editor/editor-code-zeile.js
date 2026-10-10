// 4T-001716 (Epic 3E-000301): Code-Block-Test der Editor-Zeilen als Blatt-Modul.
//
// Die Funktion lag bis hierher in editor-keymaps.js und ist unverändert
// hierher verschoben. Grund ist der Modul-Zyklus: Das neue Modul
// editor-list-enter.js braucht den Test, und editor-keymaps.js braucht
// editor-list-enter.js für das Kommando `list.lineBreak`. Über dieses Blatt
// entsteht kein neuer Zyklus über Ordner-Grenzen (Wächter
// scripts/lint-ordner-importe.js). Es importiert nichts aus dem Renderer.
//
// 4T-001862 (Epic 3E-000301): Aus demselben Grund liegt hier auch die
// Tabellen-Erkennung `isTableContextLine`, unverändert aus editor-keymaps.js
// verschoben (dort als Re-Export erhalten). Die Eingabetaste in Listen läuft
// vor der Tabellen-Belegung und muss Tabellen-Zeilen selbst ablehnen
// (Bestands-Befund B8 des Epics).
'use strict';

import { syntaxTree } from '@codemirror/language';
import { findUnescapedPipes, isTableLine } from '../../../shared/markdown/table-edit.js';

/**
 * Liegt die Zeile in einem Code-Block (FencedCode oder CodeBlock)?
 *
 * @param {import('@codemirror/state').EditorState} state Editor-Zustand.
 * @param {{from: number}} line Zeilen-Objekt des Dokuments.
 * @returns {boolean} true innerhalb eines Code-Blocks.
 */
export function lineInsideCodeBlock(state, line) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(line.from, 1);
  while (node) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
    node = node.parent;
  }
  return false;
}

// R2-19 (4T-000186): Tabellen-Erkennung deckt auch randlose GFM-Tabellen ab
// (die Preview rendert sie laengst). Rand-Pipe-Zeilen wie bisher rein
// textuell; Zeilen ohne Rand-Pipes nur dann, wenn der Lezer-Baum sie
// tatsaechlich einer Table zuordnet — eine einzelne Pipe in Fliesstext
// darf Tab/Enter nicht kapern.
export function isTableContextLine(state, line) {
  if (isTableLine(line.text)) return true;
  if (findUnescapedPipes(line.text).length === 0) return false;
  let n = syntaxTree(state).resolveInner(Math.min(line.from + 1, line.to), 1);
  while (n) {
    if (n.name === 'Table') return true;
    n = n.parent;
  }
  return false;
}
