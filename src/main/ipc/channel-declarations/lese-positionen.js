// Zusammenführung des Funktions-Releases am 2026-11-25 (Zug 3E-000410 mit
// Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/lese-positionen.js` anmeldet (Lese-Position je Dokument aus
// Epic 3E-000397).
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
//
// Beide Kanäle nehmen einen Pfad aus dem Fenster, der nur als Schlüssel einer
// Tabelle dient; sie stehen deshalb in der Übergangs-Liste mit der Einstufung
// `new` (nicht einzeln erhoben). Ihre Erklärung gehört zu Stufe 2 (3E-000417).
'use strict';

const NOT_YET_DECLARED = [
  // new
  ['lesePosition:lesen', 'new'],
  ['lesePosition:merken', 'new'],
];

module.exports = { GROUPS: ['lese-positionen'], NOT_YET_DECLARED };
