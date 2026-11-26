// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/locales.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NO_PATH_CHANNELS = ['locales:confirmReplace', 'locales:gapNotice', 'locales:list'];

const NOT_YET_DECLARED = [
  // G1
  ['locales:read', 'G1'],
  ['locales:remove', 'G1'],
  // G3
  ['locales:import', 'G3'],
  // GD
  ['locales:openDialog', 'GD'],
  ['locales:removeDialog', 'GD'],
  ['locales:saveTemplate', 'GD'],
  ['locales:updateDialog', 'GD'],
];

module.exports = { GROUPS: ['locales'], NO_PATH_CHANNELS, NOT_YET_DECLARED };
