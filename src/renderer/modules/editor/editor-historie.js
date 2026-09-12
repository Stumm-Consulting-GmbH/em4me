// 4T-001654 (Epic 3E-000287): Rückgängig und Wiederholen auf der Historie
// einer Spalte, unabhängig davon, wo der Fokus gerade liegt.
//
// **Warum es dieses Modul gibt.** Die Historie des Dokuments lebt im
// CodeMirror-Zustand der Spalte, und ihr einziger Bedienort war bisher das
// Tastenkürzel-Verzeichnis des Editors (`historyKeymap`, editor.js). Dieses
// hängt am Inhalts-Element der EditorView: Wer den Editor nicht fokussiert
// hat, erreicht die Historie nicht. Genau das ist die Lage in der
// Canvas-Ansicht, in der der Editor per CSS versteckt ist und der Fokus auf
// der Fläche liegt (Befund des Product Owners vom 2026-09-10).
//
// Die beiden Funktionen sind der programmatische Weg auf dieselbe Historie:
// ein Schritt zurück oder vor, ohne Umweg über die Tastatur des Editors. Sie
// stehen hier und nicht in `editor.js`, weil sie keinen Zustand dieses Moduls
// brauchen und ein eigener kleiner Ort sie mit einer Attrappe prüfbar macht.
// Der Aufrufer reicht die EditorView herein (app-init.js aus `paneEditors`);
// die Canvas-Seite kennt weder CodeMirror noch den Fenster-Zustand.
'use strict';

import { redo, undo } from '@codemirror/commands';

/**
 * Ein Schritt zurück in der Historie der Spalte.
 *
 * Ein schreibgeschütztes Dokument bleibt unberührt — dieselbe Reißleine wie
 * auf dem Schreibweg der Canvas: Was nicht geschrieben werden darf, wird auch
 * nicht zurückgenommen.
 *
 * @param {object} view EditorView der Spalte, oder etwas Unbrauchbares.
 * @returns {boolean} `true`, wenn ein Schritt zurückgenommen wurde.
 */
export function rueckgaengigInSpalte(view) {
  if (!view || !view.state || view.state.readOnly) return false;
  return undo(view) === true;
}

/**
 * Ein Schritt vorwärts in der Historie der Spalte.
 *
 * @param {object} view EditorView der Spalte, oder etwas Unbrauchbares.
 * @returns {boolean} `true`, wenn ein Schritt wiederhergestellt wurde.
 */
export function wiederholenInSpalte(view) {
  if (!view || !view.state || view.state.readOnly) return false;
  return redo(view) === true;
}
