// 4T-0537 (Epic 3E-0098): Acht-Farben-Palette der Tab-Gruppen als
// Shared-Konstante (CJS, Muster src/shared/commands.js) — aus
// src/renderer/modules/tab-groups.js hierher gezogen, damit Renderer
// (Tab-Gruppen-UI, Arbeitsbereichs-UI) und Main (Schema-Normalisierung
// der Arbeitsbereichs-Farben) denselben Wahrheitsort lesen.
//
// Feste Acht-Farben-Palette (PO-Entscheidung vom 2026-07-08: keine freie
// Farbwahl in v1). Schluessel sind stabil (Sitzungs-Persistenz); die
// theme-abgestimmten Werte haengen an CSS-Variablen --tab-group-<key>.
'use strict';

const TAB_GROUP_COLOR_KEYS = ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];

// 4T-0538: Hex-Werte der Palette fuer Main-seitige Zeichnungen (Farbpunkt-
// Icons im Arbeitsbereichs-Untermenue), geeicht an den Light-Theme-Werten
// der CSS-Variablen --tab-group-<key> in src/renderer/styles.css (dort
// steht der Rueck-Verweis; bei Farb-Aenderungen beide Stellen pflegen).
const TAB_GROUP_COLOR_VALUES = {
  blue: '#1a73e8',
  red: '#d93025',
  green: '#188038',
  yellow: '#f9ab00',
  purple: '#9334e6',
  orange: '#e8710a',
  cyan: '#007b83',
  pink: '#d01884',
};

// 4T-0630 (Epic 3E-0102): Dark-Werte und Text-Farben beider Themes fuer die
// Main-seitige Titelleisten-Faerbung nach Arbeitsbereichs-Farbe — geeicht an
// den Theme-Bloecken der CSS-Variablen --tab-group-<key>/-fg in
// src/renderer/styles.css (dort steht der Rueck-Verweis; bei Farb-
// Aenderungen alle Stellen pflegen).
const TAB_GROUP_COLOR_VALUES_DARK = {
  blue: '#8ab4f8',
  red: '#f28b82',
  green: '#81c995',
  yellow: '#fdd663',
  purple: '#c58af9',
  orange: '#fcad70',
  cyan: '#78d9ec',
  pink: '#ff8bcb',
};

const TAB_GROUP_COLOR_TEXT_VALUES = {
  blue: '#ffffff',
  red: '#ffffff',
  green: '#ffffff',
  yellow: '#202124',
  purple: '#ffffff',
  orange: '#ffffff',
  cyan: '#ffffff',
  pink: '#ffffff',
};

// Im Dark-Theme sind alle Paletten-Flaechen pastellig hell — die Text-Farbe
// ist durchgaengig das dunkle Grau der CSS-Variablen.
const TAB_GROUP_COLOR_TEXT_VALUES_DARK = {
  blue: '#202124',
  red: '#202124',
  green: '#202124',
  yellow: '#202124',
  purple: '#202124',
  orange: '#202124',
  cyan: '#202124',
  pink: '#202124',
};

module.exports = {
  TAB_GROUP_COLOR_KEYS,
  TAB_GROUP_COLOR_VALUES,
  TAB_GROUP_COLOR_VALUES_DARK,
  TAB_GROUP_COLOR_TEXT_VALUES,
  TAB_GROUP_COLOR_TEXT_VALUES_DARK,
};
