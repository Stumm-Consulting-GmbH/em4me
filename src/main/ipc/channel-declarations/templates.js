// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/templates.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const { paths } = require('./declaration-form');

const NO_PATH_CHANNELS = ['templates:getConfig', 'templates:list'];

const WRITE_DECLARATIONS = {
  'templates:createFile': paths(
    { at: '0.dirPath', form: 'folder', scope: 'create', grants: ['area', 'folder'] },
    {
      at: '0.name',
      form: 'name',
      under: { at: '0.dirPath' },
      scope: 'create',
      grants: ['area', 'folder'],
    },
  ),
  // 4T-002649: der globale Vorlagen-Ordner. Er wird nicht beschrieben, sondern
  // als Quelle der Vorlagen gebunden (`bind`, wie ein Bereich); leer heißt
  // «nicht festgelegt». Die Ordner der Regeln sind keine Angabe: Sie werden nur
  // mit dem Pfad einer neu angelegten Datei verglichen, nichts liest oder
  // schreibt dort.
  'templates:setGlobalConfig': paths({
    at: '0.folder',
    form: 'folder',
    scope: 'bind',
    optional: true,
    grants: ['area', 'folder'],
  }),
};

const NOT_YET_DECLARED = [
  // G1
  ['templates:read', 'G1'],
  // G3
  ['templates:ruleFor', 'G3'],
  ['templates:setAreaConfig', 'G3'],
  // GD
  ['templates:chooseFolder', 'GD'],
];

module.exports = { GROUPS: ['templates'], NO_PATH_CHANNELS, WRITE_DECLARATIONS, NOT_YET_DECLARED };
