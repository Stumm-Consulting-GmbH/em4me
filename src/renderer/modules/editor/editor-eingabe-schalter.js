// 4T-001576 (Epic 3E-000282): Lade-Weg der persistierten `input.*`-Schalter des
// Eingabe-Verhaltens im Editor.
//
// **Gegenstand.** Die drei Schalter, die die Eingabe-Handler des Editors
// synchron aus dem Laufzeit-Zustand lesen: der Tabulator ausserhalb von Listen
// und Tabellen (`input.tabIndents`, gelesen von `tabIndentKeymap` in
// editor-keymaps.js), der Cursor-Sprung hinter den Listen-Marker
// (`input.cursorSprung`, gelesen von `istCursorSprungAktiv` derselben Datei)
// und die Umwandlung einer eingefuegten URL in einen Link
// (`input.pasteUrlAsLink`, gelesen vom Einfuege-Handler in editor-paste.js).
// Alle drei sind bewusst OHNE Compartment gebaut, damit eine Aenderung ohne
// Rekonfiguration der offenen Flaechen wirkt; sie brauchen deshalb nur ihren
// Startwert im Zustand.
//
// **Warum ein eigenes Modul.** Die ersten beiden Schalter standen bis hierher
// als je eine Zeile im Rumpf von `init()` (app-init.js) — der Verdrahtungs-
// Knoten des Renderers, der sein Datei-Groessen-Budget ausgeschoepft hat. Der
// Cursor-Sprung waere die dritte gleichartige Zeile geworden. Statt den Knoten
// weiter wachsen zu lassen, laden die Schalter jetzt dort, wo der Editor sie
// braucht, und zwar in EINER IPC-Runde statt in drei (Muster des gebuendelten
// Lesens der Zeitstempel-Automatik in `init()`). Muster des Umzugs selbst ist
// der Falt-Modus der Statusleiste, der mit 4T-001580 aus `init()` in
// `initStatusbarOverflow()` gewandert ist.
//
// Der Aufruf steht in `init()` an genau der Stelle, an der zuvor die beiden
// Lese-Zeilen standen, und wird wie bisher abgewartet: vor dem ersten
// `createEditorState`.
//
// Eigener Zustand: keiner. Geschrieben wird allein der Fenster-Zustand.
'use strict';

import { api } from '../app/api.js';
import { state } from '../app/app-state.js';

/**
 * Laedt die drei `input.*`-Schalter des Eingabe-Verhaltens in den
 * Laufzeit-Zustand.
 *
 * Vorgabe aller drei Schalter ist «an»; nur ein ausdruecklich gespeichertes
 * `false` schaltet ab. Ein Profil ohne den Schluessel (frische Installation,
 * Bestands-Profil vor der Einstellung) bleibt damit beim eingeschalteten
 * Verhalten — fuer den Cursor-Sprung ist das E5 des Epics 3E-000282.
 *
 * @returns {Promise<void>} erfuellt, sobald alle drei Werte im Zustand stehen.
 */
export async function ladeEingabeSchalter() {
  const [tabIndents, cursorSprung, pasteUrlAsLink] = await Promise.all([
    api.getSetting('input.tabIndents'),
    api.getSetting('input.cursorSprung'),
    api.getSetting('input.pasteUrlAsLink'),
  ]);
  state.tabIndents = tabIndents !== false;
  state.cursorSprung = cursorSprung !== false;
  state.pasteUrlAsLink = pasteUrlAsLink !== false;
}
