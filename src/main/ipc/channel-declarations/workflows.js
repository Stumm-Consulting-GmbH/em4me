// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/workflows.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = [
  'workflow:bufferEditDone',
  'workflow:folderList',
  'workflow:getConfig',
  'workflow:runs',
  'workflow:scheduleOpen',
];

const NOT_YET_DECLARED = [
  // G1
  ['workflow:armedState', 'G1'],
  ['workflow:create', 'G1'],
  ['workflow:fileInfo', 'G1'],
  ['workflow:recordRun', 'G1'],
  ['workflow:scheduleClaim', 'G1'],
  ['workflow:scheduleFinished', 'G1'],
  ['workflow:scheduleRelease', 'G1'],
  ['workflow:setArmed', 'G1'],
  ['workflow:step', 'G1'],
  // G3
  ['workflow:setAreaConfig', 'G3'],
  // new
  ['workflow:dbCatalog', 'new'],
  ['workflow:dbRead', 'new'],
  ['workflow:eventClaim', 'new'],
  ['workflow:eventFinished', 'new'],
  ['workflow:eventOpen', 'new'],
  ['workflow:eventRelease', 'new'],
];

// 4T-002649: Der Workflow-Ordner läuft seit dem allgemeinen Einstellungs-Weg
// über diesen Kanal, auch der anwendungsweite. Er wird als Ablage der
// Workflows gebunden (`bind`); leer heißt beim anwendungsweiten «nicht
// festgelegt».
const WRITE_DECLARATIONS = {
  'workflow:setFolder': paths({
    at: '0.folder',
    form: 'folder',
    scope: 'bind',
    optional: true,
    grants: ['area', 'folder'],
  }),
};

module.exports = { GROUPS: ['workflows'], NO_PATH_CHANNELS, WRITE_DECLARATIONS, NOT_YET_DECLARED };
