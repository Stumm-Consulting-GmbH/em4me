// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/files.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths, DOC } = require('./declaration-form');

const WRITE_DECLARATIONS = {
  'file:save': paths({ at: '0', form: 'path', scope: 'write', grants: DOC }),
  'parts:rejoin': paths({ at: '0', form: 'path', scope: 'write', grants: DOC }),
};

const NOT_YET_DECLARED = [
  // G2
  ['file:read', 'G2'],
  // G3
  ['file:exists', 'G3'],
  ['file:getTimes', 'G3'],
  ['file:isMarkdown', 'G3'],
  ['file:resolveLink', 'G3'],
  ['file:unwatch', 'G3'],
  // GD
  ['file:openDialog', 'GD'],
  ['file:saveAs', 'GD'],
];

module.exports = { GROUPS: ['files'], WRITE_DECLARATIONS, NOT_YET_DECLARED };
