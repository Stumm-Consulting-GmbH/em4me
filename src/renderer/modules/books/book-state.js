// Gemeinsamer Zustand des Buch-Panels und der Zugriff auf den Preload-
// Namensraum: gemeldeter Buch-Zustand, abgeleitete Abfragen und das Öffnen
// eines Kapitels.
// 4T-000980 (Epic 3E-000196): aus modules/books/book-panel.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert). Das Modul sitzt bewusst
// zwischen den reinen Helfern und den drei Fach-Modulen: Struktur-Pflege,
// Reparatur und Kern greifen alle auf denselben Zustand zu, und nur so bleibt
// der Import-Graph des Ordners zyklenfrei.
//
// Der Zustand liegt hinter Zugriffs-Funktionen und nicht als beschreibbares
// Export-Binding, weil ein `export let` über Modul-Grenzen hinweg nicht
// zulässig ist (Entwicklungsrichtlinien §1).
'use strict';

import { api } from '../app/api.js';
import { state } from '../app/app-state.js';

import { chapterPathFromFile, pathKey } from './book-helpers.js';

// Einzige Zugriffsstelle auf den Preload-Namensraum des Buches. Liefert null,
// solange die Bridge fehlt (frühe Startphase, Unit-Kontext ohne Stub).
export function booksApi() {
  const ns = api && api.books;
  return ns && typeof ns.getState === 'function' ? ns : null;
}

// Laufender Buch-Zustand des Fensters. Bewusst Modul-Zustand und nicht in
// `state`: Er gehört dem Main-Prozess, wird von dort gemeldet und nie hier
// persistiert (Muster des Trefferbestands in search-panel.js).
let bookState = { active: null };

// Übernimmt einen gemeldeten Zustand. Ein unbrauchbarer Wert fällt auf „kein
// Buch" zurück, damit ein defekter Push das Panel nicht in einem
// Zwischenstand stehen lässt. Das Neuzeichnen stößt der Kern an.
export function applyBookState(next) {
  bookState = next && typeof next === 'object' ? next : { active: null };
}

export function activeBook() {
  return bookState && bookState.active ? bookState.active : null;
}

// Buch-relativer Pfad des Kapitels, das in dieser Spalte gerade gelesen wird
// (aktiver Reiter im Buch-Ordner); null sonst.
export function activeChapter(paneIdx) {
  const book = activeBook();
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!book || !tab || !tab.path) return null;
  return chapterPathFromFile(book.bookDir, tab.path);
}

export function missingKeys(book) {
  const list = Array.isArray(book && book.missing) ? book.missing : [];
  return new Set(list.map(pathKey));
}

// 4T-000848 (Story 4S-000757): Wiederfinde-Vorschläge eines fehlenden Kapitels aus
// dem gemeldeten Zustand — namensgleiche Dateien an anderer Stelle des
// Buch-Ordners. Der Main-Prozess legt sie dem Zustands-Paket bei (er hat den
// Datei-Bestand für den Abgleich ohnehin gelesen); Kapitel ohne Fund fehlen in
// der Abbildung. Der Vergleich läuft über den Pfad-Schlüssel, weil die
// Schreibweise aus zwei Quellen stammt (Deklaration und Dateisystem).
export function suggestionsFor(book, relPath) {
  const map = book && book.missingSuggestions;
  if (!map || typeof map !== 'object') return [];
  const key = pathKey(relPath);
  for (const [candidate, list] of Object.entries(map)) {
    if (pathKey(candidate) === key) {
      return (Array.isArray(list) ? list : []).filter(
        (entry) => typeof entry === 'string' && entry !== '',
      );
    }
  }
  return [];
}

export async function openChapter(relPath) {
  const ns = booksApi();
  if (!ns || typeof ns.openChapter !== 'function') return;
  try {
    await ns.openChapter(relPath);
  } catch (err) {
    console.warn('Kapitel öffnen fehlgeschlagen:', relPath, err);
  }
}

// Kapitel, dessen Zeile nach dem nächsten Neuaufbau den Fokus zurückbekommt
// ({ paneIdx, path }); null, wenn keiner ansteht. Gesetzt wird er in der
// Struktur-Pflege, eingelöst beim Neuzeichnen im Kern.
let pendingFocus = null;

export function setPendingFocus(next) {
  pendingFocus = next && next.path ? { paneIdx: next.paneIdx || 0, path: next.path } : null;
}

// Liest den vorgemerkten Fokus und löscht ihn im selben Zug: Er gilt genau für
// den nächsten Neuaufbau.
export function takePendingFocus() {
  const aktuell = pendingFocus;
  pendingFocus = null;
  return aktuell;
}
