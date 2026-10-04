// 4T-001987 (Epic 3E-000332): Die Vorschlagsliste im Zell-Editor der
// Datentabelle — Anschluss an die Liste der Tabellenzelle der Live-Ansicht.
//
// **Echter Editor, gedachte Zeile.** Eine Zelle der Datentabelle hat während
// der Bearbeitung keinen stabilen Bereich im Dokument: Das Modell kennt keine
// Zeilen-Nummern, und jede Übernahme schreibt den ganzen Zaun neu. Die Quellen
// der Vorschlagsliste brauchen einen solchen Bereich auch nicht. Sie lesen vom
// Zustand allein die Zeile der Schreibmarke und die Zeichen hinter der
// ersetzten Stelle, und die geöffnete Datei finden sie über den Editor. Der
// Rückruf liefert deshalb den echten Editor des Bereichs und als Grundstand
// eine gedachte Tabellenzeile mit genau dieser einen Zelle. Die Quellen sehen
// `| <Feld-Inhalt> |`: Vor einer Raute steht ein Leerzeichen, eine
// Aufgabenzeile ist das nicht, und hinter der Stelle steht ` |`, sodass der
// Verweis-Abschluss die schließenden Klammern mitschreibt. Nachbarzellen gehen
// nicht ein; eine Datentabelle trennt ihre Zellen fest.
//
// **Nur Text-Spalten.** Zahl-Spalten haben ebenfalls ein Text-Feld und sind
// deshalb über den Spalten-Typ ausgeschlossen, nicht über die Feld-Art; Datum
// und Uhrzeit haben ein natives Feld, Wahrheitswerte keines.
//
// **Maskierung.** Die Liste rechnet im gedachten Stand mit der Maskierung der
// gewöhnlichen Tabelle, die Datentabelle maskiert beim Schreiben selbst. Die
// Übernahme eines Vorschlags schreibt roh in das Feld; maskiert wird erst beim
// Übernehmen der Zelle durch den Serialisierer der Datentabelle.
//
// Der Zell-Editor lädt das Modul als Namensraum (`cellSuggestions.attach`,
// `.handleKey`, `.close`); er steht nahe an seinem Zeilen-Budget.
'use strict';

import { EditorState } from '@codemirror/state';

import {
  attachCellSuggestions,
  closeCellSuggestions,
  handleCellSuggestionKey,
} from '../live/live-table-suggestions.js';

// Die gedachte Tabellenzeile und der Inhalts-Bereich ihrer einen Zelle.
export const IMAGINED_ROW = '|  |';
export const IMAGINED_CELL = Object.freeze({ from: 2, to: 2 });

/**
 * Verbindet das Eingabefeld einer frisch geöffneten Zelle mit der
 * Vorschlagsliste, sofern die Spalte vom Typ Text ist.
 *
 * @param {HTMLInputElement} input das Eingabefeld der Zelle.
 * @param {{view: object, td: HTMLElement, colType: string, isOpen: () => boolean}} options
 *   Editor des Bereichs, Zell-Element, Spalten-Typ und die Frage, ob die
 *   Bearbeitung dieses Feldes noch offen ist.
 * @returns {boolean} `true`, wenn die Liste angeschlossen wurde.
 */
export function attach(input, { view, td, colType, isOpen }) {
  if (colType !== 'text' || input.type !== 'text' || !view) return false;
  attachCellSuggestions(input, () =>
    isOpen() && input.isConnected && td.isConnected
      ? { view, state: EditorState.create({ doc: IMAGINED_ROW }), range: IMAGINED_CELL, cell: td }
      : null,
  );
  return true;
}

/** Tastendruck im Zell-Feld; `true`, wenn die offene Liste ihn verbraucht hat. */
export const handleKey = handleCellSuggestionKey;

/** Schließt eine offene Liste; beim Übernehmen und Abbrechen der Zelle. */
export const close = closeCellSuggestions;
