// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/dashboard.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NOT_YET_DECLARED = [
  // G2
  ['dashboard:abfrageDatei', 'G2'],
  ['dashboard:filterWerte', 'G2'],
];

module.exports = { GROUPS: ['dashboard'], NOT_YET_DECLARED };
