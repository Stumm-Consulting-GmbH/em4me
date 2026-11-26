// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/exchange.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NO_PATH_CHANNELS = ['exchange:apply', 'exchange:build', 'exchange:list'];

const NOT_YET_DECLARED = [
  // G3
  ['exchange:plan', 'G3'],
  // GD
  ['exchange:openDialog', 'GD'],
];

module.exports = { GROUPS: ['exchange'], NO_PATH_CHANNELS, NOT_YET_DECLARED };
