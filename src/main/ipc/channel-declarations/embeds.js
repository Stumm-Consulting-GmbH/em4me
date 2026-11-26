// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/embeds.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NOT_YET_DECLARED = [
  // G2
  ['canvas:loeseAustauschZiele', 'G2'],
  ['chart:readTableDocument', 'G2'],
  ['embed:read', 'G2'],
  ['embed:readImage', 'G2'],
  ['embed:resolveTarget', 'G2'],
  ['kanban:notizAngaben', 'G2'],
];

module.exports = { GROUPS: ['embeds'], NOT_YET_DECLARED };
