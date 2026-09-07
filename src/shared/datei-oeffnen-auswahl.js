// 4T-001499 (Epic 3E-000174): Trefferlage des schnellen Datei-Oeffnens — welche
// Dateien zu einer Eingabe passen, und in welchem Zustand die Namens-Quelle ist.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM), wie die
// Nachbarn `wiki-vorschlaege.js` und `schlagwort-vorschlaege.js`. Der Aufrufer
// reicht die IPC-Bruecke herein, statt dass dieses Modul sie sich holt; damit
// bleibt die Entscheidung ohne Renderer pruefbar.
//
// **Filter und Reihenfolge liegen NICHT hier.** Sie stehen in `waehleWikiZiele`
// und werden von dort genutzt, nicht nachgebaut: Beide Zugaenge suchen dieselben
// Namen im selben Index und sollen sie gleich ordnen. Waeren es zwei Regeln,
// liefe die Reihenfolge des Oeffnen-Wegs frueher oder spaeter gegen die der
// Verweis-Vervollstaendigung, ohne dass es jemandem auffiele (Fehlerklasse L5,
// Doppel-Mechanismen ohne gemeinsame Heimat).
//
// Was dieses Modul beitraegt, ist der **Zustand**: Der bestehende Aufrufer der
// Quelle (`autocomplete-help.js`) behandelt jeden Nicht-`ready`-Fall wie «kein
// Vorschlag» und gibt `null` zurueck. Fuer ein Dropdown genuegt das, weil dort
// nichts erscheint. Ein Oeffnen-Dialog steht sichtbar offen und muss sagen
// koennen, ob nichts passt oder der Index noch baut — das sind fuer den
// Anwender zwei verschiedene Auskuenfte.
'use strict';

const { waehleWikiZiele } = require('./wiki-vorschlaege.js');

// Wieviele Treffer der Oeffnen-Dialog hoechstens zeigt. Bewusst ein eigener
// Wert und nicht das Render-Limit der Vervollstaendigung (30): Der Dialog hat
// mehr Flaeche als ein Editor-Dropdown, und wer ohne Eingabe oeffnet, blaettert
// hier durch die zuletzt bearbeiteten Dateien. Aendert sich der eine Wert,
// aendert sich der andere nicht mit.
const OEFFNEN_TREFFER_LIMIT = 50;

// Die vier Zustaende, in denen die Liste stehen kann. Sie sind die vollstaendige
// Fallunterscheidung fuer die Anzeige; ein fuenfter Fall waere ein Befund.
const ZUSTAND = {
  // Quelle bereit, mindestens ein Treffer.
  treffer: 'treffer',
  // Quelle bereit, aber die Eingabe passt auf nichts.
  leer: 'leer',
  // Der Index wird gerade aufgebaut; ein spaeterer Versuch kann Treffer liefern.
  aufbau: 'aufbau',
  // Keine Quelle: keine aktive Datei, zu grosser Bestand, toter Watcher oder
  // ein Fehler auf dem Weg. Fuer den Anwender ist das ein Fall, nicht vier —
  // er kann in keinem davon etwas anderes tun als spaeter erneut zu schauen.
  nichtVerfuegbar: 'nichtVerfuegbar',
};

// Bildet die Antwort der Namens-Quelle auf die Trefferlage ab.
//
// @param {object|null} antwort Antwort von `autocomplete:wikiTargets`
//   (`{ status, suggestions }`).
// @param {string} eingabe der bereits getippte Teil des Namens.
// @param {number} limit Hoechstzahl der Treffer.
// @returns {{ zustand: string, treffer: object[] }}
function trefferlage(antwort, eingabe, limit = OEFFNEN_TREFFER_LIMIT) {
  const status = antwort && antwort.status;
  if (status === 'indexing') return { zustand: ZUSTAND.aufbau, treffer: [] };
  if (status !== 'ready') return { zustand: ZUSTAND.nichtVerfuegbar, treffer: [] };
  const treffer = waehleWikiZiele(antwort.suggestions || [], eingabe, limit);
  return { zustand: treffer.length ? ZUSTAND.treffer : ZUSTAND.leer, treffer };
}

// Holt die Namen zur aktiven Datei und liefert die **Antwort der Quelle**, aus
// der `trefferlage` dann bei jedem Tastendruck die Liste rechnet.
//
// Warum die Antwort und nicht gleich die fertige Liste: Der Abruf laeuft ueber
// IPC und geschieht **einmal beim Oeffnen**, das Filtern dagegen bei jedem
// Zeichen. Das ist dasselbe Muster, nach dem die Kommando-Palette ihre
// Eintraege einmal baut und danach oertlich filtert, und nach dem die
// Verweis-Vervollstaendigung mit derselben Quelle arbeitet.
//
// `api` ist die Preload-Bruecke (`window.api` im Renderer), als Parameter statt
// als Zugriff auf ein globales Objekt — sonst waere dieses Modul nicht mehr
// prozessneutral und der Fehlerfall nur mit Renderer pruefbar.
//
// Ein Wurf der Bruecke wird zur Antwort «nicht verfuegbar» und nicht
// weitergereicht: Fuer den Anwender ist ein abgebrochener IPC-Aufruf dasselbe
// wie ein nicht verfuegbarer Index, und ein offener Dialog soll daran nicht
// zerbrechen.
// 4T-001514: `aktiveDatei` darf leer sein. Der Haupt-Prozess nimmt dann den
// geoeffneten Bereich als Namensraum — und genau in dieser Lage, ein frisch
// geoeffneter Bereich ohne Reiter, wird der Zugang am dringendsten gebraucht.
// Fehlt beides, meldet die Gegenseite `unavailable`, und der Zustand traegt es.
async function holeQuellAntwort(api, aktiveDatei) {
  const ohne = { status: 'unavailable', suggestions: [] };
  if (!api || typeof api.autocompleteWikiTargets !== 'function') return ohne;
  try {
    return (await api.autocompleteWikiTargets(aktiveDatei)) || ohne;
  } catch {
    return ohne;
  }
}

module.exports = { OEFFNEN_TREFFER_LIMIT, ZUSTAND, trefferlage, holeQuellAntwort };
