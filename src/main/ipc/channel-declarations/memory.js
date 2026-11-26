// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/memory.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NO_PATH_CHANNELS = [
  'memory:addWorkspace',
  'memory:getViewData',
  'memory:remove',
  'memory:suggestions',
];

const NOT_YET_DECLARED = [
  // G1
  ['memory:refresh', 'G1'],
  // G3
  ['memory:addPath', 'G3'],
  // GD
  ['memory:addFromDialog', 'GD'],
];

module.exports = { GROUPS: ['memory'], NO_PATH_CHANNELS, NOT_YET_DECLARED };
