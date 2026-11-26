// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/settings.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
//
// 4T-002649: `theme:setPref` nimmt nur einen Wert aus fester Auswahl und
// schreibt den festen Schlüssel `themePref`; das Fenster nennt weder Pfad noch
// Schlüssel. `recent:push` nimmt einen Pfad, dessen Umgebung der Hauptprozess
// liest; seine Erklärung gehört zur Prüfung gegen das Buch der Freigaben
// (Stufe 2).
//
// 4T-002650: `settings:get` und `settings:set` nehmen einen Schlüssel des
// Einstellungs-Speichers und sind mit der Art `keys` erklärt; das Schreiben
// prüft die Tabelle `src/main/app/settings-classes.js`. `settings:setScriptsRun`
// nimmt nur einen Wahrheitswert und schreibt den festen Schlüssel
// `scripts.run`.
'use strict';

const { keys } = require('./declaration-form');

const NO_PATH_CHANNELS = [
  'theme:current',
  'theme:getPref',
  'theme:setPref',
  'settings:setScriptsRun',
];

const KEY_DECLARATIONS = {
  'settings:get': keys({ at: '0', form: 'settingKey', scope: 'read' }),
  'settings:set': keys({ at: '0', form: 'settingKey', scope: 'write' }),
};

const NOT_YET_DECLARED = [
  // G3
  ['recent:push', 'G3'],
];

module.exports = { GROUPS: ['settings'], NO_PATH_CHANNELS, KEY_DECLARATIONS, NOT_YET_DECLARED };
