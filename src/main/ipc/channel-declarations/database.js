// 4T-002648 (Epic 3E-000416): Erklärungen der Kanäle, die die Kanal-Gruppe
// `src/main/ipc/database.js` anmeldet.
// Form einer Erklärung, Herkunft der Einträge und die Prüfung beim
// Zusammensetzen stehen im Einstieg `src/main/ipc/channel-declarations.js`.
'use strict';

const NOT_YET_DECLARED = [
  // G1
  ['database:auftrag', 'G1'],
  ['database:ausdruecke', 'G1'],
  ['database:changeLog', 'G1'],
  ['database:datensaetze', 'G1'],
  ['database:datensatz', 'G1'],
  ['database:karteikarte', 'G1'],
  ['database:konsistenz', 'G1'],
  ['database:liste', 'G1'],
  ['database:maskeSchreiben', 'G1'],
  ['database:neuanlage', 'G1'],
  ['database:positionsliste', 'G1'],
  ['database:sperre', 'G1'],
  ['database:verweisZiel', 'G1'],
  ['database:verwendung', 'G1'],
  // G3
  ['database:overview', 'G3'],
  ['database:table', 'G3'],
];

module.exports = { GROUPS: ['database'], NOT_YET_DECLARED };
