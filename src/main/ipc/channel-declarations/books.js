// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/books.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = ['books:close', 'books:getInfo', 'books:getState'];

const WRITE_DECLARATIONS = {
  'books:createAt': paths(
    { at: '0.parentDir', form: 'folder', scope: 'create', grants: ['folder'] },
    {
      at: '0.name',
      form: 'name',
      under: { at: '0.parentDir' },
      scope: 'create',
      grants: ['folder'],
    },
  ),
};

const NOT_YET_DECLARED = [
  // G1
  ['books:applyTreeOp', 'G1'],
  ['books:createChapter', 'G1'],
  ['books:moveChapterFileTo', 'G1'],
  ['books:openChapter', 'G1'],
  ['books:reassignChapter', 'G1'],
  ['books:setInfo', 'G1'],
  ['books:suggestMissing', 'G1'],
  // G3
  ['books:openPath', 'G3'],
  // GD
  ['books:createDialog', 'GD'],
  ['books:moveChapterFile', 'GD'],
  ['books:openDialog', 'GD'],
  ['books:reassignChapterDialog', 'GD'],
];

module.exports = { GROUPS: ['books'], NO_PATH_CHANNELS, WRITE_DECLARATIONS, NOT_YET_DECLARED };
