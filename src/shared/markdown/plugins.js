// 4T-000179 (Epic 3E-000039): aus src/main/preload.js extrahiert.
// Eigene markdown-it-Plugins der Pipeline (Source-Line-Mapping, Wiki-Links,
// Wiki-Embeds, Tags, Block-Anker, Callouts). Electron-frei; die Instanz-
// Registrierung (md.use/mdPortable.use) macht markdown.js in der
// Original-Reihenfolge.
//
// 4T-000985 (Epic 3E-000196): Der Inhalt liegt seither in den Gruppen-Modulen
// unter ./plugins/; diese Datei ist das Barrel des Subsystems und damit
// eine bewusste Fassade (Entscheidung E3 der Bestandsaufnahme 4T-000964).
// Ihre Export-Flaeche ist unveraendert, deshalb blieben markdown.js,
// main.js, preload.js, die Renderer-Verbraucher und die Test-Dateien vom
// Schnitt unberuehrt. Neue Verbraucher duerfen ebenso gut direkt das
// passende Gruppen-Modul laden; das Barrel bleibt der Weg fuer alle, die
// den Plugin-Satz als Ganzes meinen.
//
// Die Gruppen:
//   ./plugins/structure.js  Quellzeilen-Zuordnung, Ueberschriften-
//                           Nummerierung, Listen-Neustart
//   ./plugins/wiki.js       Wiki-Links, Wiki-Embeds, Tags, Block-Anker
//   ./plugins/callouts.js   Callouts und Custom Containers
//   ./plugins/inline.js     Line Blocks, Superscript, Spoiler, Critic Markup
//   ./plugins/tasks.js      erweiterte Task-Zustaende und Task-Marker
//   ./plugins/comments.js   %%-Kommentare (Scanner und Strip)
//   ./plugins/calendar.js   Kalender-Wert-Syntax @{Name: Wert}
'use strict';

const {
  sourceLineMapperPlugin,
  headingNumbersPlugin,
  listRestartPlugin,
  stripHeadingMarkers,
} = require('./plugins/structure.js');
const {
  wikiLinksPlugin,
  wikiEmbedsPlugin,
  tagsPlugin,
  blockAnchorsPlugin,
} = require('./plugins/wiki.js');
const {
  calloutsPlugin,
  customContainersPlugin,
  parseColumnsCount,
} = require('./plugins/callouts.js');
const {
  lineBlocksPlugin,
  superscriptPlugin,
  spoilerPlugin,
  criticMarkupPlugin,
} = require('./plugins/inline.js');
const {
  TASK_STATE_DEFAULTS,
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  TASK_STATE_NEXT_FORBIDDEN_CHARS,
  configureTaskStates,
  getActiveTaskStates,
  taskStatusType,
  taskToggleTarget,
  createTaskStatusTypeResolver,
  extendedTaskStatesPlugin,
  configureTaskMarkers,
  getTaskMarkersConfig,
  taskMarkersPlugin,
  taskMarkerBadgeSpec,
  isDueOverdue,
} = require('./plugins/tasks.js');
const { findPercentCommentRanges, stripPercentComments } = require('./plugins/comments.js');
const {
  calendarValueBadgeSpec,
  calendarSpanText,
  CALENDAR_SPAN_LABEL_KEYS,
  calendarValuesPlugin,
} = require('./plugins/calendar.js');

module.exports = {
  sourceLineMapperPlugin,
  headingNumbersPlugin,
  listRestartPlugin,
  wikiLinksPlugin,
  wikiEmbedsPlugin,
  tagsPlugin,
  blockAnchorsPlugin,
  calloutsPlugin,
  lineBlocksPlugin,
  customContainersPlugin,
  parseColumnsCount,
  superscriptPlugin,
  spoilerPlugin,
  criticMarkupPlugin,
  TASK_STATE_DEFAULTS,
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  TASK_STATE_NEXT_FORBIDDEN_CHARS,
  configureTaskStates,
  getActiveTaskStates,
  taskStatusType,
  taskToggleTarget,
  createTaskStatusTypeResolver,
  extendedTaskStatesPlugin,
  configureTaskMarkers,
  getTaskMarkersConfig,
  taskMarkersPlugin,
  taskMarkerBadgeSpec,
  isDueOverdue,
  findPercentCommentRanges,
  stripPercentComments,
  stripHeadingMarkers,
  // 4T-000546 (Epic 3E-000097): Kalender-Wert-Badges.
  calendarValueBadgeSpec,
  calendarSpanText,
  CALENDAR_SPAN_LABEL_KEYS,
  calendarValuesPlugin,
};
