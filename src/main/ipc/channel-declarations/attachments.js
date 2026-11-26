// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/attachments.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths, DOC } = require('./declaration-form');

const NO_PATH_CHANNELS = ['attachments:getConfig'];

const WRITE_DECLARATIONS = {
  'attachment:store': paths(
    { at: '0.dokumentPfad', form: 'path', scope: 'read', grants: DOC },
    {
      at: '0.quellPfad',
      form: 'path',
      scope: 'read',
      grants: ['area', 'folder', 'file'],
      optional: true,
    },
    {
      at: '0.name',
      form: 'name',
      under: { at: '0.dokumentPfad', parent: true },
      scope: 'create',
      grants: DOC,
      optional: true,
    },
  ),
};

const NOT_YET_DECLARED = [
  // G1
  ['attachments:setAreaConfig', 'G1'],
  ['attachments:setGlobalConfig', 'G1'],
  // G2
  ['attachment:open', 'G2'],
];

module.exports = {
  GROUPS: ['attachments'],
  NO_PATH_CHANNELS,
  WRITE_DECLARATIONS,
  NOT_YET_DECLARED,
};
