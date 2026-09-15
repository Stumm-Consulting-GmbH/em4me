// 4T-001746 (Epic 3E-000289): Der Satz der Datei-Endungen, die das Programm als
// **Bild** führt — als geteilte Konstante (CJS, Muster
// src/shared/tab-group-colors.js).
//
// **Warum sie hierher gehört.** Bis zu diesem Vorgang stand derselbe Satz an
// drei Stellen wörtlich nebeneinander: als lokale Konstante im Renderer
// (src/renderer/modules/attachments.js, Markdown-Verweis einer abgelegten
// Anlage), als eingebautes Feld-Literal in der Wiki-Gruppe der Markdown-Plugins
// (src/shared/markdown/plugins/wiki.js, Art einer Einbettung `![[…]]`) und noch
// einmal im Inventar-Werkzeug. Die Bild-Angabe der Canvas-Karte (G8) ist die
// vierte Stelle, und vier Kopien laufen spätestens bei der nächsten Endung
// auseinander. Der Kommentar im Renderer sagte die Kopplung ausdrücklich an
// («Bewusst dieselbe Menge wie die Bild-Erkennung des Wiki-Embed-Plugins») —
// hier steht sie jetzt als **eine** Quelle statt als Zusage.
//
// **Warum im obersten geteilten Verzeichnis.** Der Satz ist keine Aussage über
// Markdown und keine über die Canvas, sondern eine über Dateien; er wird vom
// Renderer, von der Markdown-Pipeline und vom prozess-neutralen Canvas-Kern
// gelesen. Das ist genau die Lage, für die der Bestand seine Konstanten-Module
// unmittelbar unter `src/shared/` ablegt.
//
// **Nicht** hierher gehört die Endungs-Liste in `src/main/preload.js`: Sie ist
// eine Sicherheits-Positivliste für die Umwandlung in Daten-Adressen und
// beantwortet eine andere Frage («was darf in eine `data:`-Adresse»), nicht
// dieselbe in einer zweiten Schreibweise.
//
// Prozessneutral: reine Daten und eine reine Funktion, kein DOM, kein Electron,
// kein Datei-Zugriff.
'use strict';

// Die acht Endungen, die die Anwendung bei ihren Anlagen und Einbettungen als
// Bild behandelt. Kleinschreibung ohne Punkt.
const BILD_ENDUNGEN = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

// Endung eines Namens in Kleinschreibung, ohne Punkt; leer, wenn keine dasteht.
function bildEndungVon(name) {
  const treffer = typeof name === 'string' ? name.match(/\.([a-z0-9]+)$/i) : null;
  return treffer ? treffer[1].toLowerCase() : '';
}

/**
 * Trägt der Name eine der zulässigen Bild-Endungen?
 *
 * @param {string} name Dateiname oder Pfad.
 * @returns {boolean}
 */
function istBildDatei(name) {
  return BILD_ENDUNGEN.has(bildEndungVon(name));
}

module.exports = {
  BILD_ENDUNGEN,
  bildEndungVon,
  istBildDatei,
};
