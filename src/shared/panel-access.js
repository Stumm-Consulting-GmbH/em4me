// 4T-000567 (Epic 3E-000104): Prozess-neutrales Panel-Zugangs-Modell.
//
// Single Source of Truth fuer die Zugangs-Metadaten der eingebauten
// Sidebar-Panels: Statusbar-Button, Toggle-Kommando (Accelerator, Palette,
// belegbares Kuerzel) und Erweiterungs-Gate. Main (Ansichtsmenue-Untermenue)
// und Renderer (Statusbar-Leiste, Registry-Abgleich) lesen dieselbe Quelle
// (reine Daten, CJS ohne DOM-/Electron-Abhaengigkeit — Muster
// src/shared/commands/commands.js und src/shared/manual/manual-pages.js).
//
// Der Paritaets-Waechter test/unit/panel-access.test.js erzwingt, dass jedes
// Panel beide Zugaenge fuehrt (Button in index.html, Kommando in der
// Registry), dass die ID-Menge mit der Renderer-Registry uebereinstimmt und
// dass das Erweiterungs-Gate zur commands-Liste der Erweiterung passt.
'use strict';

// Felder pro Eintrag:
//   id           stabile Panel-Kennung, identisch zur Renderer-Registry
//                (registerSidebarPanel in sidebar-layout.js).
//   titleKey     i18n-Key des Panel-Titels; zugleich Label-Quelle des
//                Untermenue-Eintrags (die Werte decken sich mit den
//                bisherigen menu.view.*-Labels der Panel-Toggles).
//   buttonId     DOM-ID des Statusbar-Toggle-Buttons (index.html,
//                Segment source-toggles).
//   commandId    Toggle-Kommando der Registry (commands.js): Accelerator-
//                Anzeige im Menue, Palette, belegbares Kuerzel.
//   extensionId  Erweiterung, an der der Zugang haengt (null = Kern).
//                Das commandId muss dann in der commands-Liste dieser
//                Erweiterung stehen (extensions.js), damit Menue- und
//                Paletten-Gate mit der Panel-Sichtbarkeit uebereinstimmen.
//
// Die Array-Reihenfolge ist zugleich die Auslieferungs-Reihenfolge der
// Panel-Zugaenge in Untermenue und Statusbar-Leiste: thematisch gruppiert,
// konsistent zur Sidebar-Standard-Anordnung (DEFAULT_SIDEBAR_STRUCTURE in
// sidebar-layout.js) — linke Seite Gruppe fuer Gruppe, dann rechte Seite.
const PANEL_ACCESS = [
  {
    id: 'bookmarks',
    titleKey: 'bookmarks.title',
    buttonId: 'btn-bookmarks',
    commandId: 'view.toggleBookmarks',
    extensionId: 'bookmarks',
  },
  {
    id: 'area',
    titleKey: 'areaPanel.title',
    buttonId: 'btn-area',
    commandId: 'view.toggleAreaPanel',
    extensionId: null,
  },
  // 4T-000844 (Epic 3E-000147): Inhaltsverzeichnis des Buches, thematisch bei den
  // ortsgebenden Panels (Lesezeichen, Bereich).
  // 4T-000849 (Story 4S-000758): Erweiterungs-Gate auf 'books' gesetzt — im
  // Aus-Zustand entfaellt der Panel-Zugang an beiden Bedienorten
  // (Statusbar-Button ueber das Renderer-Gate, Untermenue-Eintrag ueber
  // unless() am Toggle-Kommando). Das commandId steht dafuer in der
  // commands-Liste der Erweiterung; der Paritaets-Waechter erzwingt das.
  {
    id: 'book',
    titleKey: 'bookPanel.title',
    buttonId: 'btn-book',
    commandId: 'view.toggleBookPanel',
    extensionId: 'books',
  },
  {
    id: 'outline',
    titleKey: 'outline.title',
    buttonId: 'btn-outline',
    commandId: 'view.toggleOutline',
    extensionId: null,
  },
  {
    id: 'subpages',
    titleKey: 'subpages.title',
    buttonId: 'btn-subpages',
    commandId: 'view.toggleSubpages',
    extensionId: 'wiki-links',
  },
  {
    id: 'filegraph',
    titleKey: 'graph.panelTitle',
    buttonId: 'btn-filegraph',
    commandId: 'view.toggleGraphPanel',
    extensionId: 'graph-view',
  },
  // 4T-000759 (Epic 3E-000142): Suchergebnis-Panel, Abschluss der Finde-Gruppe
  // der linken Seite (Gliederung, Unterseiten, Graph). Kern-Panel ohne
  // Erweiterungs-Gate: Die Suche gehoert zur Grundausstattung.
  {
    id: 'searchresults',
    titleKey: 'searchResults.title',
    buttonId: 'btn-search-results',
    commandId: 'view.toggleSearchResults',
    extensionId: null,
  },
  {
    id: 'calendar',
    titleKey: 'calendar.title',
    buttonId: 'btn-calendar',
    commandId: 'view.toggleCalendarPanel',
    extensionId: null,
  },
  {
    id: 'reminders',
    titleKey: 'reminders.panel.title',
    buttonId: 'btn-reminders',
    commandId: 'view.toggleReminders',
    extensionId: 'reminders',
  },
  // 4T-000372 (Epic 3E-000069): Uhr-Panel, thematisch in der Zeit-Gruppe hinter
  // Kalender und Erinnerungen (identisch zur Reiter-Gruppe der linken Seite
  // in DEFAULT_SIDEBAR_STRUCTURE).
  {
    id: 'clock',
    titleKey: 'clock.panel.title',
    buttonId: 'btn-clock',
    commandId: 'view.toggleClock',
    extensionId: 'clock',
  },
  {
    id: 'notes',
    titleKey: 'notes.title',
    buttonId: 'btn-notes',
    commandId: 'view.toggleNotes',
    extensionId: null,
  },
  {
    id: 'properties',
    titleKey: 'properties.title',
    buttonId: 'btn-properties',
    commandId: 'view.toggleProperties',
    extensionId: null,
  },
  {
    id: 'tags',
    titleKey: 'tags.title',
    buttonId: 'btn-tags',
    commandId: 'view.toggleTags',
    extensionId: 'tags',
  },
  {
    id: 'blockprops',
    titleKey: 'blockProps.title',
    buttonId: 'btn-blockprops',
    commandId: 'view.toggleBlockProps',
    extensionId: null,
  },
  {
    id: 'outgoing',
    titleKey: 'outgoing.title',
    buttonId: 'btn-outgoing-links',
    commandId: 'view.toggleOutgoingLinks',
    extensionId: 'wiki-links',
  },
  {
    id: 'backlinks',
    titleKey: 'backlinks.title',
    buttonId: 'btn-backlinks',
    commandId: 'view.toggleBacklinks',
    extensionId: 'wiki-links',
  },
];

// Auslieferungs-Reihenfolge der Panel-Zugaenge (Untermenue und Statusbar),
// direkt aus der Modell-Reihenfolge abgeleitet — eine Quelle, kein Drift.
const DEFAULT_PANEL_TOGGLE_ORDER = PANEL_ACCESS.map((p) => p.id);

function panelAccessById(id) {
  return PANEL_ACCESS.find((p) => p.id === id) || null;
}

// 4T-000569 (Epic 3E-000104): Reihenfolge-Setting normalisieren — unbekannte
// IDs entfallen, Duplikate reduzieren sich aufs erste Vorkommen, fehlende
// bekannte Panels werden am Ende in Modell-Reihenfolge ergaenzt (Muster
// normalizeSidebarLayout: kein Panel geht verloren, kuenftige Panels
// erscheinen automatisch). Nicht-Arrays liefern die Modell-Reihenfolge.
function normalizePanelToggleOrder(raw) {
  const known = new Set(DEFAULT_PANEL_TOGGLE_ORDER);
  const seen = new Set();
  const out = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_PANEL_TOGGLE_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

module.exports = {
  PANEL_ACCESS,
  DEFAULT_PANEL_TOGGLE_ORDER,
  panelAccessById,
  normalizePanelToggleOrder,
};
