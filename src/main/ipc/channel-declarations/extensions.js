// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/extensions.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
//
// 4T-002650: Die Kanäle, die eine Kennung eines Add-ons nehmen, sind mit der
// Art `keys` erklärt. Jeder Handler nimmt die Kennung nur aus dem letzten Scan
// (`scannedPackage` oder `externalExtensionInfo` in
// `src/main/extensions/extension-packages.js`) und bildet jeden Pfad selbst.
'use strict';

const { keys } = require('./declaration-form');

const NO_PATH_CHANNELS = ['extensions:openDir', 'extensions:scanExternal'];

const KEY_DECLARATIONS = {
  'extensions:confirmTrust': keys({ at: '0', form: 'extensionId', scope: 'write' }),
  'extensions:getMarkdownPluginSource': keys({ at: '0', form: 'extensionId', scope: 'read' }),
  'extensions:removeExternal': keys({ at: '0', form: 'extensionId', scope: 'write' }),
  'extensions:setEnabled': keys({ at: '0', form: 'extensionId', scope: 'write' }),
  'extensions:reportError': keys({ at: '0', form: 'extensionId', scope: 'write' }),
};

module.exports = { GROUPS: ['extensions'], NO_PATH_CHANNELS, KEY_DECLARATIONS };
