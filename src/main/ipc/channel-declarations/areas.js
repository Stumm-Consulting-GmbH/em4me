// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppen
// `areas.js`, `area-copy.js` und `area-features.js` unter
// `src/main/ipc/` anmelden.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = [
  'area:close',
  'area:getDatabaseConfig',
  'area:getStartPage',
  'areaLink:getConfig',
  'bookmarks:getConfig',
  'calendar:getConfig',
  'calendar:setAreaConfig',
  'journals:getConfig',
  'sidebarVariants:getConfig',
  'sidebarVariants:setAreaConfig',
];

const WRITE_DECLARATIONS = {
  'demoArea:createAt': paths({ at: '0', form: 'folder', scope: 'create', grants: ['folder'] }),
};

const NOT_YET_DECLARED = [
  // G0
  ['journals:setAreaConfig', 'G0'],
  // G1
  ['area:copyFile', 'G1'],
  ['area:createFile', 'G1'],
  ['area:createFolder', 'G1'],
  ['area:istKarteikarte', 'G1'],
  ['area:listDir', 'G1'],
  ['area:setDatabaseConfig', 'G1'],
  ['area:setStartPage', 'G1'],
  ['area:trashFile', 'G1'],
  ['areaLink:beurteile', 'G1'],
  ['areaLink:resolve', 'G1'],
  ['bookmarks:setAreaConfig', 'G1'],
  ['journals:createEntry', 'G1'],
  ['journals:entriesExist', 'G1'],
  ['journals:ergaenzeProperties', 'G1'],
  ['journals:ergaenzePropertiesBatch', 'G1'],
  ['journals:scanEintraege', 'G1'],
  ['journals:statEntry', 'G1'],
  // new (Zusammenführung des Funktions-Releases am 2026-11-25; Erklärung in Stufe 2, 3E-000417)
  ['journals:uebertrageAufgaben', 'new'],
  // G3
  ['area:openPath', 'G3'],
  ['areaLink:setConfig', 'G3'],
  // GD
  ['area:open', 'GD'],
  ['demoArea:create', 'GD'],
];

module.exports = {
  GROUPS: ['areas', 'area-copy', 'area-features'],
  NO_PATH_CHANNELS,
  WRITE_DECLARATIONS,
  NOT_YET_DECLARED,
};
