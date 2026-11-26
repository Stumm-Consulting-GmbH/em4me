// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/reminders.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NO_PATH_CHANNELS = [
  'alarm:confirm',
  'alarm:open',
  'alarm:snooze',
  'notify:system',
  'reminders:claim',
  'reminders:list',
  'reminders:open',
  'reminders:release',
  'reminders:retrigger',
  'reminders:systemNotify',
  'timer:claim',
  'timer:open',
];

const NOT_YET_DECLARED = [
  // G2
  ['reminders:openSource', 'G2'],
  // G3
  ['reminders:edit', 'G3'],
  ['reminders:mute', 'G3'],
];

module.exports = { GROUPS: ['reminders'], NO_PATH_CHANNELS, NOT_YET_DECLARED };
