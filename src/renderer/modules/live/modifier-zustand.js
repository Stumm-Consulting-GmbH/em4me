// 4T-0943 (Epic 3E-0197): Sichtbarkeit des Modifier-Zugangs.
//
// Werte in der Zeile mit dem Cursor sind seit 4T-0943 dekoriert, reagieren
// dort aber nur auf den Strg-Klick (E1 im Epic: der einfache Klick bleibt dem
// Cursor vorbehalten). Traegt die Marke dort dieselbe Klick-Optik wie sonst,
// verspricht sie eine Reaktion, die der einfache Klick nicht einloest — genau
// die stumme Stelle, die das Epic beseitigen soll.
//
// Deshalb setzt diese Erweiterung waehrend gedrueckter Strg-/Cmd-Taste die
// Klasse `cm-mod-gedrueckt` auf den Editor; nur dann zeigen die
// Modifier-Marken Zeiger und Unterstreichung (styles). Beim Verlassen des
// Fokus faellt der Zustand zurueck, weil ein keyup ausserhalb des Editors
// nicht mehr ankaeme und die Optik sonst haengen bliebe.
'use strict';

import { EditorView } from '@codemirror/view';

const KLASSE = 'cm-mod-gedrueckt';

function istModifier(event) {
  return event.key === 'Control' || event.key === 'Meta';
}

function setze(view, an) {
  view.dom.classList.toggle(KLASSE, an);
}

export const modifierZustandExtension = EditorView.domEventHandlers({
  keydown(event, view) {
    if (istModifier(event)) setze(view, true);
    return false;
  },
  keyup(event, view) {
    if (istModifier(event)) setze(view, false);
    return false;
  },
  blur(event, view) {
    setze(view, false);
    return false;
  },
});
