// Einfuegen und Anlagen im Editor: Link-in-Auswahl beim Einfuegen, Anlagen aus
// Zwischenablage und Ziehen, Doppelklick auf ein Bild.
//
// Auszug aus editor.js, 4T-1002 (Epic 3E-0196). Die beiden domEventHandlers
// sind einmalige Extension-Werte und leben ausschliesslich hier.
'use strict';

import { EditorView } from '@codemirror/view';
import { getDocText } from '../app/api.js';
import { state } from '../app/app-state.js';
// 4T-0642 (Epic 3E-0125): Anlagen aus Zwischenablage und Ziehen ablegen.
import { anlagenAusDataTransfer, legeAnlagenAb } from '../attachments.js';
// 4T-0603 (Epic 3E-0113): Link-Erzeugung und URL-Erkennung für den
// Paste-in-Auswahl-Handler (reiner Shared-Baustein).
import { detectPasteUrl, insertExternalLink } from '../../../shared/markdown-format.js';
import { positionInsideCode } from '../live/live-shared.js';
// 4T-0790 (Epic 3E-0125): Bild-Anlage per Doppelklick oeffnen.
import { oeffneBildAusQuelle } from '../views/link-navigation.js';
// 4T-1002: Laufzeit-Zyklus mit dem Kern — paneEditors wird ausschliesslich in
// Funktionskoerpern gelesen.
import { paneEditors } from './editor.js';

// 4T-0603 (Epic 3E-0113): Paste-Handler Link-Einfügen in die Auswahl. Bei
// nicht-leerer Auswahl und einer als URL erkannten Zwischenablage entsteht ein
// Markdown-Link [Auswahl](URL) statt des ersetzten Texts. Konservativ: nur bei
// aktivem Schalter (state.pasteUrlAsLink, Default an), einfacher Auswahl,
// eindeutiger URL und außerhalb von Code-Kontexten; sonst fällt der Handler auf
// das Standard-Einfügen zurück (Rückgabe false). Ein dispatch = ein Undo-
// Schritt. Voraussetzung ist, dass der eingebaute lang-markdown-Paste-Handler
// per pasteURLAsLink: false abgeschaltet ist (siehe markdown()-Aufrufe), sonst
// würde er zuerst greifen.
//
// Strg+Umschalt+V ist reines Einfügen und darf keinen Link erzeugen. Das
// paste-Ereignis trägt den Umschalt-Zustand nicht (nachgemessen: nur der
// vorausgehende keydown kennt ihn), deshalb merkt sich der keydown-Zweig bei
// jedem Strg/Cmd+V, ob Umschalt gedrückt war. Der Wert wird im paste sofort
// zurückgesetzt; ein hängen gebliebener Zustand (Tastendruck ohne folgendes
// Einfügen) korrigiert sich mit dem nächsten V-Tastendruck.
let pasteMatchStyle = false;

// 4T-0642 / 4T-0789 (Epic 3E-0125): Anlagen ablegen und den Verweis an einer
// Position einsetzen. Gemeinsame Strecke beider Eingabewege; das Ablegen
// selbst liegt im Modul attachments.js, der Ort im Hauptprozess.
//
// `pos` ist die Ziel-Position im Dokument; ohne Angabe steht der Verweis an der
// Schreibmarke. Ein einzelner dispatch bedeutet EINEN Undo-Schritt, auch bei
// mehreren Anlagen. Das Zuruecknehmen entfernt nur den Verweis; die abgelegte
// Datei bleibt liegen (im Handbuch erwaehnt).
export async function fuegeAnlagenEin(view, anlagen, pos) {
  const paneIdx = paneEditors.indexOf(view);
  const pane = paneIdx >= 0 ? state.panes[paneIdx] : null;
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const markdown = await legeAnlagenAb(anlagen, (tab && tab.path) || '');
  if (!markdown) return false;
  // Der Editor kann sich waehrend des Ablegens veraendert haben; die Position
  // wird deshalb erst jetzt gegen die aktuelle Laenge geklemmt.
  const laenge = view.state.doc.length;
  const sel = view.state.selection.main;
  const ziel = Math.max(0, Math.min(typeof pos === 'number' ? pos : sel.from, laenge));
  const ersetzeBis = typeof pos === 'number' ? ziel : Math.min(sel.to, laenge);
  view.dispatch({
    changes: { from: ziel, to: ersetzeBis, insert: markdown },
    selection: { anchor: ziel + markdown.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
  return true;
}

// 4T-0790 (Epic 3E-0125): Doppelklick auf ein Bild oeffnet es in der
// Standardanwendung. Im Editor gilt bewusst der DOPPELklick und nicht der
// einfache (PO-Festlegung 2026-07-29): Der einfache Klick setzt hier die
// Schreibmarke, und wer neben einem Bild weiterschreiben will, darf dabei
// keine fremde Anwendung starten. In der Render-Ansicht, wo es keine
// Schreibmarke gibt, genuegt der einfache Klick (views.js).
//
// Praktisch betrifft das den Live-Modus, weil nur dort Bilder als Widget
// erscheinen; im reinen Quelltext steht ihre Markdown-Zeile.
export const imageOpenHandler = EditorView.domEventHandlers({
  // 4T-0789 (Epic 3E-0125), Befund des Product Owners aus der Test-Iteration:
  // Der Zieh-Weg gehoert IN den Editor und nicht nur an das Fenster.
  //
  // Das eingesetzte Editor-Modul bringt einen eigenen drop-Handler mit, der
  // eine gezogene Datei per FileReader als TEXT liest und ihren Inhalt ins
  // Dokument schreibt. Der Fenster-Handler lief danach und haengte den Verweis
  // an, sodass beides im Dokument stand: erst der Verweis, dann der komplette
  // Datei-Inhalt. Sichtbar wurde das bei einer Textdatei; bei einem Bild blieb
  // es unbemerkt, weil der Lese-Versuch dort nichts Brauchbares ergibt.
  //
  // Eigene domEventHandlers laufen VOR den eingebauten, und ein `true` bricht
  // die Kette ab — der eingebaute Handler kommt damit nicht mehr zum Zug.
  // stopPropagation hindert zusaetzlich den Fenster-Handler daran, dieselbe
  // Anlage ein zweites Mal abzulegen.
  drop(event, view) {
    if (!event.dataTransfer) return false;
    if (!Array.from(event.dataTransfer.types).includes('Files')) return false;
    const anlagen = anlagenAusDataTransfer(event.dataTransfer);
    if (anlagen.length === 0) return false;
    event.stopPropagation();
    if (view.state.readOnly) {
      // Ablegen ist ein Schreibvorgang; im Lese-Zustand unterbleibt er, wie
      // beim Einfuegen auch. Das Ereignis wird dennoch verbraucht, damit der
      // eingebaute Handler den Datei-Inhalt nicht doch noch einliest.
      return true;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    void fuegeAnlagenEin(view, anlagen, pos ?? view.state.doc.length);
    return true;
  },
  dblclick(event, view) {
    const ziel = event.target;
    if (!(ziel instanceof HTMLImageElement)) return false;
    const quelle = ziel.getAttribute('data-src-original') || '';
    if (!quelle || /^(https?:|data:)/i.test(quelle)) return false;
    const paneIdx = paneEditors.indexOf(view);
    if (paneIdx < 0) return false;
    event.preventDefault();
    void oeffneBildAusQuelle(paneIdx, quelle);
    return true;
  },
});

export const pasteLinkHandler = EditorView.domEventHandlers({
  keydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyV') {
      pasteMatchStyle = event.shiftKey;
    }
    return false;
  },
  paste(event, view) {
    const matchStyle = pasteMatchStyle;
    pasteMatchStyle = false;
    if (matchStyle) return false;
    if (view.state.readOnly) return false;

    // 4T-0642 (Epic 3E-0125): Anlagen-Zweig VOR der URL-in-Auswahl-Pruefung.
    // Eine Zwischenablage mit Datei-Inhalt ist kein Text-Fall, und der Zweig
    // haengt bewusst NICHT am Schalter pasteUrlAsLink — das ist eine andere
    // Einstellung mit anderer Bedeutung.
    //
    // Strg+Umschalt+V bleibt unberuehrt: Der matchStyle-Merker oben hat den
    // Handler dann schon verlassen, reines Einfuegen legt also nichts ab.
    const anlagen = anlagenAusDataTransfer(event.clipboardData);
    if (anlagen.length > 0) {
      event.preventDefault();
      // Das Ablegen ist asynchron, das Ereignis nicht. Deshalb sofort
      // abbrechen und die Einfuegung nachziehen, sobald die Dateien liegen.
      void fuegeAnlagenEin(view, anlagen);
      return true;
    }

    if (state.pasteUrlAsLink === false) return false;
    const sel = view.state.selection.main;
    if (sel.empty) return false;
    const clip = event.clipboardData && event.clipboardData.getData('text/plain');
    const url = detectPasteUrl(clip);
    if (!url) return false;
    if (positionInsideCode(view.state, sel.from) || positionInsideCode(view.state, sel.to)) {
      return false;
    }
    const r = insertExternalLink(getDocText(view.state.doc), sel.from, sel.to, url);
    event.preventDefault();
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: r.insert },
      selection: { anchor: r.selFrom, head: r.selTo },
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
    return true;
  },
});
