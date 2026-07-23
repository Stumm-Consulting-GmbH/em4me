// 4T-0061 (Epic 3E-0012): Callout-Typen-Definition.
//
// Wurde 2026-05-24 mit 4T-0087 (Epic 3E-0014) aus src/main/preload.js
// extrahiert, damit der Renderer-Prozess die Definition ebenfalls
// importieren kann (Live-Modus-Callouts brauchen Icon-SVG und i18n-
// Titel-Keys). Single Source of Truth fuer beide Konsumenten.
//
// CommonJS-Modul, weil preload.js CommonJS ist. esbuild bundelt es
// transparent in den ESM-Renderer.
'use strict';

const CALLOUT_LUCIDE_SVG_PREFIX =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">';
const CALLOUT_LUCIDE_SVG_SUFFIX = '</svg>';

function calloutIcon(inner) {
  return CALLOUT_LUCIDE_SVG_PREFIX + inner + CALLOUT_LUCIDE_SVG_SUFFIX;
}

const CALLOUT_TYPES = {
  note: {
    titleKey: 'callout.note.title',
    iconSvg: calloutIcon(
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    ),
  },
  info: {
    titleKey: 'callout.info.title',
    iconSvg: calloutIcon(
      '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/>',
    ),
  },
  tip: {
    titleKey: 'callout.tip.title',
    iconSvg: calloutIcon(
      '<line x1="9" x2="15" y1="18" y2="18"/><line x1="10" x2="14" y1="22" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
    ),
  },
  success: {
    titleKey: 'callout.success.title',
    iconSvg: calloutIcon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  },
  question: {
    titleKey: 'callout.question.title',
    iconSvg: calloutIcon(
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
    ),
  },
  warning: {
    titleKey: 'callout.warning.title',
    iconSvg: calloutIcon(
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
    ),
  },
  failure: {
    titleKey: 'callout.failure.title',
    iconSvg: calloutIcon(
      '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    ),
  },
  danger: {
    titleKey: 'callout.danger.title',
    iconSvg: calloutIcon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  },
  example: {
    titleKey: 'callout.example.title',
    iconSvg: calloutIcon(
      '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    ),
  },
  quote: {
    titleKey: 'callout.quote.title',
    iconSvg: calloutIcon(
      '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
    ),
  },
};

module.exports = { CALLOUT_TYPES, calloutIcon };
