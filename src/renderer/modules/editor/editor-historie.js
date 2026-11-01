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
import { Annotation, Prec, StateEffect, StateField } from '@codemirror/state';
import { keymap } from '@codemirror/view';

// 4T-002121: Der Zeitstempel beim Speichern (save-export.js) ist ein eigener,
// isolierter Rückgängig-Schritt. Allein genommen nahm das erste Strg+Z nur ihn
// zurück; das dadurch ausgelöste automatische Speichern setzte ihn zwei
// Sekunden später neu, und die Eingabe davor blieb unerreichbar. Deshalb nimmt
// ein Rückgängig, über dem zuoberst ein Stempel liegt, den Stempel und den
// Schritt davor zusammen zurück. Der Stempel bleibt ein eigener Schritt, weil
// die Historie Nutzer-Schritte nur so sicher über ihn hinweg abbildet (eine
// Ganz-Dokument-Ersetzung verdoppelte sonst beim Rückgängig den Dateikopf).
//
// Die Erweiterung hängt der Stempel-Dispatch selbst an den Zustand
// (`stempelEffekte`), damit der Editor-Aufbau unberührt bleibt; der Merker
// ist ein Feld des Zustands: wahr nach einem Stempel, falsch nach jeder
// anderen Änderung des Dokuments. Wiederholen bleibt unverändert.
export const stempelSchritt = Annotation.define();

const stempelZuoberst = StateField.define({
  create: () => false,
  update: (wert, tr) => (tr.docChanged ? tr.annotation(stempelSchritt) === true : wert),
});

function stempelGesetzt(state) {
  return typeof state.field === 'function' && state.field(stempelZuoberst, false) === true;
}

// Stempel und Schritt davor in einem Zug; ohne Stempel zuoberst `false`, damit
// das Tastenkürzel an die übrigen Belegungen weiterfällt.
function stempelZuruecknehmen(view) {
  if (view.state.readOnly || !stempelGesetzt(view.state)) return false;
  if (undo(view) !== true) return false;
  undo(view);
  return true;
}

/**
 * Effekte für den Stempel-Dispatch: hängt beim ersten Stempel eines Zustands
 * Merker und Tastenkürzel an, mit gesetztem Merker, weil ein neu
 * angehängtes Feld die laufende Transaktion nicht mehr sieht.
 *
 * @param {object} state Zustand vor dem Stempel.
 * @returns {Array} Effekte für `dispatch`.
 */
export function stempelEffekte(state) {
  if (state.field(stempelZuoberst, false) !== undefined) return [];
  return [
    StateEffect.appendConfig.of([
      stempelZuoberst.init(() => true),
      Prec.highest(keymap.of([{ key: 'Mod-z', run: stempelZuruecknehmen }])),
    ]),
  ];
}

/**
 * Ein Schritt zurück in der Historie der Spalte.
 *
 * Ein schreibgeschütztes Dokument bleibt unberührt — dieselbe Reißleine wie
 * auf dem Schreibweg der Canvas: Was nicht geschrieben werden darf, wird auch
 * nicht zurückgenommen. Liegt zuoberst ein Zeitstempel, gehen er und der
 * Schritt davor zusammen zurück (4T-002121).
 *
 * @param {object} view EditorView der Spalte, oder etwas Unbrauchbares.
 * @returns {boolean} `true`, wenn ein Schritt zurückgenommen wurde.
 */
export function rueckgaengigInSpalte(view) {
  if (!view || !view.state || view.state.readOnly) return false;
  if (stempelZuruecknehmen(view)) return true;
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
