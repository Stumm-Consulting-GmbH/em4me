// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/shelves.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = [
  'shelves:close',
  'shelves:getInfo',
  'shelves:getState',
  'shelves:getViewData',
];

const WRITE_DECLARATIONS = {
  'shelves:createAt': paths(
    { at: '0.parentDir', form: 'folder', scope: 'create', grants: ['folder'] },
    {
      at: '0.name',
      form: 'name',
      under: { at: '0.parentDir' },
      scope: 'create',
      grants: ['folder'],
    },
  ),
  'shelves:assignBook': paths({
    at: '0',
    form: 'name',
    under: { binding: 'shelf' },
    scope: 'write',
    grants: ['area'],
  }),
};

const NOT_YET_DECLARED = [
  // G1
  ['shelves:setInfo', 'G1'],
  ['shelves:unassignBook', 'G1'],
  // G3
  ['shelves:openPath', 'G3'],
  // GD
  ['shelves:createDialog', 'GD'],
  ['shelves:openDialog', 'GD'],
];

module.exports = { GROUPS: ['shelves'], NO_PATH_CHANNELS, WRITE_DECLARATIONS, NOT_YET_DECLARED };
