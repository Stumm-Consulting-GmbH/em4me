// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/help.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NOT_YET_DECLARED = [
  // G1
  ['help:getAllManualPages', 'G1'],
  ['help:getManualPage', 'G1'],
];

module.exports = { GROUPS: ['help'], NOT_YET_DECLARED };
