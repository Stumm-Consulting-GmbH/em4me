// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/index-views.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths, DOC } = require('./declaration-form');

const NO_PATH_CHANNELS = ['areaSearch:release', 'areaStats:collect', 'events:query'];

const WRITE_DECLARATIONS = {
  'task:applyLineEdit': paths({ at: '0.filePath', form: 'path', scope: 'write', grants: DOC }),
  'events:applyFrontmatterEdit': paths({
    at: '0.filePath',
    form: 'path',
    scope: 'write',
    grants: DOC,
  }),
};

const NOT_YET_DECLARED = [
  // G1
  ['areaReplace:run', 'G1'],
  ['areaSearch:run', 'G1'],
  ['calendarEpoch:scan', 'G1'],
  ['tagRename:scan', 'G1'],
  // G3
  ['autocomplete:anchors', 'G3'],
  ['autocomplete:imageTargets', 'G3'],
  ['autocomplete:tags', 'G3'],
  ['autocomplete:wikiTargets', 'G3'],
  ['backlinks:release', 'G3'],
  ['backlinks:request', 'G3'],
  ['frontmatterQuery:run', 'G3'],
  ['graph:edges', 'G3'],
  ['index:overlay', 'G3'],
  ['linter:resolveWikiTargets', 'G3'],
  ['perspectiveScript:data', 'G3'],
  ['tags:request', 'G3'],
  ['taskQuery:edit', 'G3'],
  ['wikiLink:resolveByAlias', 'G3'],
  ['wikiLink:resolveInIndex', 'G3'],
];

module.exports = {
  GROUPS: ['index-views'],
  NO_PATH_CHANNELS,
  WRITE_DECLARATIONS,
  NOT_YET_DECLARED,
};
