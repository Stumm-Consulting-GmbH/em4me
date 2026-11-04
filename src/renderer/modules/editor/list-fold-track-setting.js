// 4T-002433 (Epic 3E-000375): Einstellung «Gliederungsspuren bei Listen».
//
// Legt fest, wo die Gliederungsspuren für Listen und nummerierte Listen
// erscheinen: `aussen` («links außen», Vorgabe und heutiges Verhalten — die
// Spuren stehen im Gliederungs-Rand links neben dem Text) oder `struktur`
// («in der Struktur der Liste» — die Spur steht an der Einrückung des
// Listenpunkts). Die Einstellung gehört dem Anwender, nicht der Datei
// (Abgrenzung der Story 4S-001121), und gilt in jedem Fenster sofort (AK6).
//
// **Schnittstelle für das Zeichnen der Spur** (4T-002434 baut darauf auf):
//
//   - `LIST_FOLD_TRACK_AUSSEN`, `LIST_FOLD_TRACK_STRUKTUR` — die beiden Werte;
//     `LIST_FOLD_TRACK_POSITIONS` in Anzeige-Reihenfolge der Auswahl.
//   - `LIST_FOLD_TRACK_KEY` — der Einstellungs-Schlüssel
//     `editor.listFoldTrackPosition`.
//   - `normalisiereListFoldTrackPosition(wert)` — jeder Wert außer `struktur`
//     fällt auf `aussen` zurück, auch ein fehlender oder defekter (AK4 der
//     Story).
//   - `getListFoldTrackPosition()` — der wirksame Wert dieses Fensters.
//   - `initListFoldTrackPositionFromStore()` — App-Start: gespeicherten Wert
//     laden (app-init.js, vor dem Wiederherstellen der Dokumente).
//   - `setListFoldTrackPosition(wert, { persist })` — Wert setzen; Einstellungs-
//     Seite mit Persistenz, Empfang der Fenster-Verteilung mit
//     `persist: false`. Ein unveränderter Wert ist ein No-op.
//   - Ereignis `LIST_FOLD_TRACK_EVENT` (`scg:listfoldtrackchange`) auf
//     `document`, ausgelöst bei jedem wirksamen Wechsel, mit
//     `detail: { position }`. Auf `document` und nicht auf `window`, weil alle
//     `scg:`-Ereignisse des Renderers dort laufen (Muster `scg:foldchange` in
//     folding.js und `scg:statusbar-unavailable-mode-changed`). Hörer im
//     Bestand: folding.js stößt das Neuzeichnen des Gliederungs-Rands jedes
//     offenen Editors an, ohne Falt-Zustände zu ändern.
//
// Aufbau nach dem Muster `statusbar-availability.js` (Normalisierung, Laden,
// Setzen); ein zentrales Schema mit Vorgaben gibt es für Renderer-
// Einstellungen nicht, die Vorgabe entsteht durch die Normalisierung hier.
'use strict';

import { api } from '../app/api.js';

export const LIST_FOLD_TRACK_AUSSEN = 'aussen';
export const LIST_FOLD_TRACK_STRUKTUR = 'struktur';
export const LIST_FOLD_TRACK_POSITIONS = [LIST_FOLD_TRACK_AUSSEN, LIST_FOLD_TRACK_STRUKTUR];
export const LIST_FOLD_TRACK_KEY = 'editor.listFoldTrackPosition';
export const LIST_FOLD_TRACK_EVENT = 'scg:listfoldtrackchange';

let position = LIST_FOLD_TRACK_AUSSEN;

/**
 * Bringt einen beliebigen (auch defekten) Stand auf einen der beiden Werte.
 *
 * Jeder Wert außer `struktur` fällt auf die Vorgabe `aussen` zurück —
 * dieselbe Rückfall-Regel wie `normalisiereUnverfuegbarModus` in
 * statusbar-availability.js.
 *
 * @param {*} wert Rohwert aus Speicher, Verteilung oder Einstellungs-Entwurf.
 * @returns {'aussen'|'struktur'} Gültiger Wert.
 */
export function normalisiereListFoldTrackPosition(wert) {
  return wert === LIST_FOLD_TRACK_STRUKTUR ? LIST_FOLD_TRACK_STRUKTUR : LIST_FOLD_TRACK_AUSSEN;
}

/**
 * @returns {'aussen'|'struktur'} Der wirksame Wert dieses Fensters.
 */
export function getListFoldTrackPosition() {
  return position;
}

/**
 * App-Start: gespeicherten Wert laden. Ein fehlender oder defekter Stand
 * ergibt die Vorgabe «links außen». Löst kein Ereignis aus, weil beim Start
 * noch kein Editor gezeichnet ist, der nachziehen müsste.
 *
 * @returns {Promise<'aussen'|'struktur'>} Der geladene Wert.
 */
export async function initListFoldTrackPositionFromStore() {
  let gespeichert;
  try {
    gespeichert = await api.getSetting(LIST_FOLD_TRACK_KEY);
  } catch (err) {
    console.warn('Lage der Gliederungsspuren bei Listen laden fehlgeschlagen:', err);
  }
  position = normalisiereListFoldTrackPosition(gespeichert);
  return position;
}

/**
 * Wert setzen — normalisiert, meldet den Wechsel an die Editoren und
 * persistiert.
 *
 * `persist: false` für den Empfang der Fenster-Verteilung
 * (`listFoldTrackPosition:changed`), damit der Speicher nicht doppelt
 * geschrieben wird; ein unveränderter Wert ist ein No-op und löst kein
 * Ereignis aus (Muster `setStatusbarUnavailableMode`).
 *
 * @param {*} wert Gewünschter Wert.
 * @param {{persist?: boolean}} [opts] Persistierung steuern.
 * @returns {Promise<'aussen'|'struktur'>} Der wirksame Wert.
 */
export async function setListFoldTrackPosition(wert, { persist = true } = {}) {
  const naechster = normalisiereListFoldTrackPosition(wert);
  if (naechster === position) return position;
  position = naechster;
  document.dispatchEvent(
    new CustomEvent(LIST_FOLD_TRACK_EVENT, { detail: { position: naechster } }),
  );
  if (persist) {
    try {
      await api.setSetting(LIST_FOLD_TRACK_KEY, naechster);
    } catch (err) {
      console.warn('Lage der Gliederungsspuren bei Listen speichern fehlgeschlagen:', err);
    }
  }
  return position;
}
