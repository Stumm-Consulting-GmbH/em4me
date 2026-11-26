// 4T-002617 (Epic 3E-000391): Lage der Schreibmarke zu einem Code-Block (V6).
//
// Blatt-Modul ohne Renderer-Importe (Muster editor-code-zeile.js): Es liest
// allein den Lezer-Baum und das Dokument eines Editor-Zustands. Es liefert zu
// einer Stelle den umgebenden Zaun mit Sprache, Öffner- und Schluss-Zeile,
// Körper-Bereich und bei Mermaid die Diagramm-Art. Gebraucht von der Auswahl
// der Mermaid-Bausteine und vom Datums-Wähler (fenceLanguageAt).
'use strict';

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { artAusKoerper } from '../../../shared/mermaid-bausteine.js';

function zaunKnoten(baum, pos, seite) {
  let node = baum.resolveInner(pos, seite);
  while (node) {
    if (node.name === 'FencedCode') return node;
    node = node.parent;
  }
  return null;
}

/**
 * Der Code-Block mit Zaun an einer Stelle des Dokuments.
 *
 * @param {import('@codemirror/state').EditorState} state Editor-Zustand.
 * @param {number} pos Stelle im Dokument (Schreibmarke).
 * @param {{seite?: number, baum?: import('@lezer/common').Tree}} [opts]
 *   seite: Seite der Suche im Baum wie bei resolveInner, 1 nur rechts der
 *   Stelle, -1 nur links, 0 (Vorgabe) erst rechts, dann links, damit auch das
 *   Zeilen-Ende einer Schluss-Zeile und das Dokument-Ende eines offenen Blocks
 *   zum Block gehören. baum: ein schon vorliegender Syntax-Baum; ohne ihn wird
 *   der Baum bis zum Dokument-Ende vervollständigt, soweit das in 50 ms gelingt
 *   (lange Dokumente, deren Baum im Zustand noch nicht bis zur Stelle reicht),
 *   sonst gilt der Baum des Zustands, solange er das Ende der Zeile der Stelle
 *   erreicht. Reicht er nicht so weit, ist über die Stelle nichts auszusagen,
 *   und das Ergebnis ist `{ unvollstaendig: true }` statt eines falschen null
 *   (ein Zaun jenseits des geparsten Bereichs fehlte sonst im Baum). Mit
 *   übergebenem Baum entfällt diese Prüfung.
 * @returns {null | { unvollstaendig: true } | {
 *   sprache: string, oeffnerZeile: number, schlussZeile: number | null,
 *   koerperVon: number, koerperBis: number, imKoerper: boolean,
 *   art: string | null }} null außerhalb jedes Code-Blocks mit Zaun; Zeilen als
 *   Nummern (1-basiert), Körper als Offsets [koerperVon, koerperBis] (Anfang
 *   der ersten bis Ende der letzten Körper-Zeile); `art` nur bei Mermaid,
 *   `flowchart`, `sequenceDiagram`, `gantt`, `classDiagram` oder der gelesene
 *   Wert, null ohne Kopfzeile.
 */
export function zaunAnStelle(state, pos, { seite = 0, baum = null } = {}) {
  let b = baum;
  if (!b) {
    b = ensureSyntaxTree(state, state.doc.length, 50);
    if (!b) {
      b = syntaxTree(state);
      if (b.length < state.doc.lineAt(pos).to) return { unvollstaendig: true };
    }
  }
  const fence =
    seite === 0 ? zaunKnoten(b, pos, 1) || zaunKnoten(b, pos, -1) : zaunKnoten(b, pos, seite);
  if (!fence) return null;
  const doc = state.doc;
  let sprache = '';
  // Der Lezer-Baum trägt je Zaun-Zeile ein CodeMark-Kind: eines für den Öffner
  // und, nur wenn der Block geschlossen ist, ein zweites für die Schluss-Zeile.
  // Den Schluss von dort zu lesen erspart jede eigene Zaun-Regel samt
  // Einrückungs-Rechnung (Zweitblick zu 3E-000391, Runden 2 und 3: eine
  // Schluss-Zeile darf anders eingerückt sein als der Öffner, und die Regel
  // aus fence-level.js kennt nur bis zu drei Leerzeichen).
  let schlussMark = null;
  for (let child = fence.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeInfo') sprache = doc.sliceString(child.from, child.to).trim();
    if (child.name === 'CodeMark' && child.from > fence.from) schlussMark = child;
  }
  const oeffnerZeile = doc.lineAt(fence.from).number;
  const letzte = doc.lineAt(fence.to).number;
  // Ohne Schluss-Zeile endet der Block am Dokument-Ende, dann gehört die
  // letzte Zeile zum Körper (Muster getPerspectiveContext).
  const hatSchluss =
    letzte > oeffnerZeile && schlussMark !== null && doc.lineAt(schlussMark.from).number === letzte;
  const schlussZeile = hatSchluss ? letzte : null;
  const ersteKoerper = oeffnerZeile + 1;
  const letzteKoerper = hatSchluss ? letzte - 1 : letzte;
  const hatKoerper = ersteKoerper <= letzteKoerper;
  const koerperVon = hatKoerper ? doc.line(ersteKoerper).from : doc.line(oeffnerZeile).to;
  const koerperBis = hatKoerper ? doc.line(letzteKoerper).to : koerperVon;
  const zeile = doc.lineAt(pos).number;
  const imKoerper = hatKoerper && zeile >= ersteKoerper && zeile <= letzteKoerper;
  let art = null;
  if (sprache === 'mermaid' && hatKoerper) {
    const kopf = artAusKoerper(doc.sliceString(koerperVon, koerperBis).split('\n'));
    if (kopf) art = kopf.art;
  }
  return { sprache, oeffnerZeile, schlussZeile, koerperVon, koerperBis, imKoerper, art };
}
