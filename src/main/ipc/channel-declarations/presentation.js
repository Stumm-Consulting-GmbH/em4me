// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppen
// `presentation-export.js`, `presentation-export-pptx.js`,
// `presentation-export-bilder.js` und `presentation-window.js` unter
// `src/main/ipc/` anmelden.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = [
  'audience:input',
  'audience:ready',
  'presentationWindow:close',
  'presentationWindow:open',
  'presentationWindow:slide',
];

const WRITE_DECLARATIONS = {
  'presentationPdf:print': paths({ at: '0', form: 'path', scope: 'write', grants: ['file'] }),
  'presentationHtml:write': paths(
    { at: '0', form: 'folder', scope: 'create', grants: ['folder'] },
    {
      at: '1',
      form: 'name',
      under: { at: '0' },
      scope: 'create',
      grants: ['folder'],
      optional: true,
    },
    { at: '2[].name', form: 'name', under: { at: '1' }, scope: 'create', grants: ['folder'] },
  ),
  'presentationPptx:export': paths({
    at: '0.zielPfad',
    form: 'path',
    scope: 'write',
    grants: ['file'],
  }),
  'presentationImages:export': paths(
    { at: '0.zielOrdner', form: 'folder', scope: 'create', grants: ['folder'] },
    {
      at: '0.unterordner',
      form: 'name',
      under: { at: '0.zielOrdner' },
      scope: 'create',
      grants: ['folder'],
      optional: true,
    },
  ),
};

const NOT_YET_DECLARED = [
  // GD
  ['presentationHtml:chooseFolder', 'GD'],
  ['presentationImages:chooseFolder', 'GD'],
];

module.exports = {
  GROUPS: [
    'presentation-export',
    'presentation-export-pptx',
    'presentation-export-bilder',
    'presentation-window',
  ],
  NO_PATH_CHANNELS,
  WRITE_DECLARATIONS,
  NOT_YET_DECLARED,
};
