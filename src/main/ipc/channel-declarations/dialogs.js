// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/dialogs.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = [
  'calendar:blockedDelete',
  'calendar:confirmDependents',
  'calendar:confirmEpochGuard',
  'canvas:austauschBericht',
  'dialog:confirmCloseDirty',
  'dialog:confirmConflict',
  'dialog:showSaveError',
  'events:confirmDelete',
  'html:katexStyles',
  'journals:confirmNachtragen',
  'kanban:confirmDeleteColumn',
  'print:system',
  'shell:openExternal',
  'spellcheck:addWord',
  'spellcheck:listWords',
  'spellcheck:removeWord',
  'spellcheck:replace',
];

const WRITE_DECLARATIONS = {
  'pdf:print': paths({ at: '0', form: 'path', scope: 'write', grants: ['file'] }),
  'html:write': paths({ at: '0', form: 'path', scope: 'write', grants: ['file'] }),
};

const NOT_YET_DECLARED = [
  // G1
  ['area:confirmTrashFile', 'G1'],
  // GD
  ['html:chooseTarget', 'GD'],
  ['pdf:chooseTarget', 'GD'],
  ['pptx:chooseTarget', 'GD'],
];

module.exports = { GROUPS: ['dialogs'], NO_PATH_CHANNELS, WRITE_DECLARATIONS, NOT_YET_DECLARED };
