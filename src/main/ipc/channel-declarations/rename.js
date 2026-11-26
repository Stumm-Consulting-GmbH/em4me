// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/rename.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths, DOC } = require('./declaration-form');

const WRITE_DECLARATIONS = {
  'file:rename': paths(
    { at: '0.oldPath', form: 'path', scope: 'write', grants: DOC },
    {
      at: '0.newBasename',
      form: 'name',
      under: { at: '0.oldPath', parent: true },
      scope: 'create',
      grants: DOC,
    },
  ),
  'subpage:create': paths(
    { at: '0.basePath', form: 'path', scope: 'read', grants: DOC },
    {
      at: '0.segment',
      form: 'name',
      under: { at: '0.basePath', parent: true },
      scope: 'create',
      grants: DOC,
    },
  ),
};

const NOT_YET_DECLARED = [
  // G3
  ['rename:linkUpdatePreview', 'G3'],
  ['subpage:descendants', 'G3'],
];

module.exports = { GROUPS: ['rename'], WRITE_DECLARATIONS, NOT_YET_DECLARED };
