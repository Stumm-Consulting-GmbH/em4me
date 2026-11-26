// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/profiles.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NO_PATH_CHANNELS = ['profiles:getConfig', 'profiles:list'];

const NOT_YET_DECLARED = [
  // G1
  ['profiles:fieldValues', 'G1'],
  ['profiles:linkTargets', 'G1'],
  ['profiles:lookup', 'G1'],
  ['profiles:resolve', 'G1'],
  ['properties:usedValues', 'G1'],
  // G2
  ['profiles:setAreaConfig', 'G2'],
  // GD
  ['profiles:chooseFolder', 'GD'],
];

module.exports = { GROUPS: ['profiles'], NO_PATH_CHANNELS, NOT_YET_DECLARED };
