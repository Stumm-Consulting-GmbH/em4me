// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/windows.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NO_PATH_CHANNELS = [
  'app:auspraegung',
  'app:locale',
  'app:newApplication',
  'app:oeffneDatenOrdner',
  'app:portablerBetrieb',
  'app:version',
  'drafts:save',
  'window:cancelClose',
  'window:confirmClose',
  'window:list',
  'window:metaChanged',
  'window:reportMenuState',
  'window:setFullScreen',
  'window:toggleDevTools',
  'workspace:close',
  'workspace:confirmDelete',
  'workspace:create',
  'workspace:delete',
  'workspace:list',
  'workspace:rename',
  'workspace:reorder',
  'workspace:saveAs',
  'workspace:setColor',
];

const NOT_YET_DECLARED = [
  // G1
  ['workspace:open', 'G1'],
  // G2
  ['tab:appendToWindow', 'G2'],
  // G3
  ['window:openNew', 'G3'],
  ['window:reportPanes', 'G3'],
];

module.exports = { GROUPS: ['windows'], NO_PATH_CHANNELS, NOT_YET_DECLARED };
