// 4T-0546 (Epic 3E-0097): Renderer-Zustand der calendarSystems-
// Konfiguration des Bereichs (normalisierte Form aus calendar:getConfig).
// Eine Quelle fuer Live-Badges (live-widgets.js), Klick-Pfad und Kommando
// (calendar-picker.js) und die Verfuegbarkeits-Regel der Kommando-Palette;
// gesetzt von app-init (Start, Bereichs-Wechsel, calendar:changed-
// Broadcast). Die Preload-Pipeline (Render-Pane, Portable-Export) haelt
// ihren eigenen Zustand in markdown.js und wird von app-init parallel
// ueber api.calendarConfigureRender versorgt — das Renderer-Bundle darf
// markdown.js nicht importieren (fs-abhaengige markdown-it-Plugins).
// Bewusst zyklenfrei: dieses Modul importiert nichts.
'use strict';

let areaCalendarConfig = null;

export function setAreaCalendarConfig(config) {
  areaCalendarConfig = config || null;
}

export function getAreaCalendarConfig() {
  return areaCalendarConfig;
}

// Gibt es im Bereich mindestens einen benutzbaren Kalender?
// (Verfuegbarkeits-Regel des Einfuege-Kommandos.)
export function hasCalendarConfig() {
  return !!(areaCalendarConfig && areaCalendarConfig.blocks.some((b) => b.calendars.length > 0));
}
