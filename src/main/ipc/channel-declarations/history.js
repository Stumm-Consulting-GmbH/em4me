// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/history.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths, DOC } = require('./declaration-form');

const NO_PATH_CHANNELS = ['history:getAreaDefault', 'history:setAreaDefault'];

const WRITE_DECLARATIONS = {
  'note:write': paths({ at: '0', form: 'path', scope: 'write', grants: DOC }),
  'blockData:write': paths({ at: '0', form: 'path', scope: 'write', grants: DOC }),
  'blockData:rename': paths({ at: '0', form: 'path', scope: 'write', grants: DOC }),
};

const NOT_YET_DECLARED = [
  // G3
  ['blockData:read', 'G3'],
  ['history:getRevision', 'G3'],
  ['history:getState', 'G3'],
  ['history:list', 'G3'],
  ['note:read', 'G3'],
];

module.exports = { GROUPS: ['history'], NO_PATH_CHANNELS, WRITE_DECLARATIONS, NOT_YET_DECLARED };
