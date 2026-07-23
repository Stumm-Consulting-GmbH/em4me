// 4T-0520 (Epic 3E-0094): kuratiertes internes Icon-Set der Kommando-
// Platzierung. Inline-SVG-Strings im Stil der bestehenden Statusbar-Icons
// (viewBox 0 0 24 24, stroke currentColor, 14 px, runde Kappen — Muster
// THEME_ICON_SVGS in app-state.js); ein Teil der Pfade stammt aus den
// bereits eingebetteten Lucide-SVGs (ISC-lizenziert), der Rest ist eigene
// einfache Geometrie im selben Stil. Prozessneutral (CJS, keine DOM- oder
// Electron-Abhängigkeit), damit die Modell-Normalisierung
// (command-placement.js) die Icon-IDs ohne Renderer validieren kann.
'use strict';

function svg(inner) {
  return (
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner +
    '</svg>'
  );
}

// Reihenfolge = Anzeige-Reihenfolge im Icon-Raster des Anlage-Dialogs.
const COMMAND_ICONS = {
  zap: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  star: svg(
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  ),
  play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  plus: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  cross: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  'arrow-right': svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
  'arrow-up': svg('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'),
  'arrow-down': svg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  pencil: svg(
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  ),
  trash: svg(
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  ),
  copy: svg(
    '<rect width="13" height="13" x="9" y="9" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  ),
  save: svg(
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>' +
      '<path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  ),
  file: svg(
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
      '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  ),
  folder: svg(
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  ),
  link: svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
      '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  tag: svg(
    '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>' +
      '<circle cx="7.5" cy="7.5" r="0.5"/>',
  ),
  eye: svg(
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
      '<circle cx="12" cy="12" r="3"/>',
  ),
  clock: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  // 4T-0636 (Epic 3E-0069): Modus-Icons der Uhr-Umschaltleiste (Timer und
  // Stoppuhr; Uhr und Wecker nutzen 'clock' und 'bell'). Ueber das kuratierte
  // Set stehen sie zugleich im Icon-Raster der Kommando-Anlage zur Wahl.
  hourglass: svg(
    '<path d="M5 22h14"/><path d="M5 2h14"/>' +
      '<path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/>' +
      '<path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  ),
  stopwatch: svg(
    '<line x1="10" x2="14" y1="2" y2="2"/><circle cx="12" cy="14" r="8"/><path d="M12 10v4"/>',
  ),
  calendar: svg(
    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/>' +
      '<path d="M3 10h18"/>',
  ),
  bell: svg(
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
      '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  ),
  list: svg(
    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>' +
      '<path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  ),
  table: svg(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>' +
      '<path d="M9 3v18"/>',
  ),
  bookmark: svg('<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'),
  flag: svg(
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  ),
  terminal: svg('<polyline points="4 17 10 11 4 5"/><path d="M12 19h8"/>'),
  heart: svg(
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  ),
  wand: svg(
    '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>' +
      '<path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>' +
      '<path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  ),
  refresh: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  // 4T-0607 (Epic 3E-0114): Format-Icons für die Format-Toolbar (Lucide-
  // Pfade im selben Stil; über das kuratierte Set auch in den Anlage-
  // Dialogen der Kommando-Platzierung wählbar).
  bold: svg('<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>'),
  italic: svg(
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/>' +
      '<line x1="15" x2="9" y1="4" y2="20"/>',
  ),
  strikethrough: svg(
    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/>' +
      '<line x1="4" x2="20" y1="12" y2="12"/>',
  ),
  highlighter: svg(
    '<path d="m9 11-6 6v3h9l3-3"/>' +
      '<path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8Z"/>',
  ),
  code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  heading: svg('<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>'),
  'list-ordered': svg(
    '<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/>' +
      '<path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  ),
  'list-todo': svg(
    '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/>' +
      '<path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  ),
  quote: svg('<path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/>'),
  brackets: svg('<path d="M16 3h3v18h-3"/><path d="M8 21H5V3h3"/>'),
  'external-link': svg(
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ),
};

const COMMAND_ICON_IDS = Object.keys(COMMAND_ICONS);
const DEFAULT_COMMAND_ICON = 'zap';

module.exports = { COMMAND_ICONS, COMMAND_ICON_IDS, DEFAULT_COMMAND_ICON };
