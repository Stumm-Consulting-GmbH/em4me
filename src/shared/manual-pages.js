// 4T-0213 (Epic 3E-0042): Seiten-Registry des Handbuchs.
//
// CJS wie src/shared/commands.js, damit Main (Whitelist des IPC-Seiten-
// Loaders help:getManualPage) und Renderer (Tab-Titel, Navigation,
// Generator-Zuordnung) dieselbe Quelle lesen.
//
// Felder pro Eintrag:
//   id        stabile, sprachneutrale Seiten-Kennung. Bei gebuendelten
//             Seiten zugleich der Dateiname src/i18n/help/<id>.<lang>.md.
//   titleKey  i18n-Key des lokalisierten Seiten-Titels (Tab-Titel).
//   source    'bundled'   = Markdown-Datei pro Sprache unter src/i18n/help/
//             'generated' = Renderer-Generator, registriert in
//                           modules/manual.js (4T-0212).
//
// Die Array-Reihenfolge ist zugleich die Link-Reihenfolge der
// Ueberblicksseite (redaktionell dort gepflegt, hier nur Konvention).
'use strict';

const MANUAL_PAGES = [
  { id: 'overview', titleKey: 'manual.page.overview.title', source: 'bundled' },
  // 4T-0212: generierte Seiten — Funktions-Tabelle aus HELP_FEATURE_GROUPS
  // plus Kurzname-/Zugang-Keys, Tastenkuerzel aus der Kommando-Registry
  // (Generatoren in modules/manual.js).
  { id: 'functions', titleKey: 'manual.page.functions.title', source: 'generated' },
  { id: 'shortcuts', titleKey: 'manual.page.shortcuts.title', source: 'generated' },
  // 4T-0214: Themen-Seiten (gebuendelt, eine Datei pro Sprache).
  { id: 'markdown-basics', titleKey: 'manual.page.markdownBasics.title', source: 'bundled' },
  // 4T-0380 (Epic 3E-0071): Editor-Kontextmenue (Rechtsklick) — Aufbau,
  // Selektions-Semantik, Toggle, Zustands-Haekchen, Read-only, Live-Modus.
  { id: 'context-menu', titleKey: 'manual.page.contextMenu.title', source: 'bundled' },
  // 4T-0609 (Epic 3E-0114): Format-Toolbar (Sichtbarkeit im Edit-Modus,
  // Standard-Belegung mit Zustands-Anzeige, Ueberschrift-Menue, Tabellen-
  // Raster, Ueberlauf, Belegungs-Pflege, Abgrenzung, Aus-Zustand).
  { id: 'toolbar', titleKey: 'manual.page.toolbar.title', source: 'bundled' },
  { id: 'blocks', titleKey: 'manual.page.blocks.title', source: 'bundled' },
  { id: 'inline', titleKey: 'manual.page.inline.title', source: 'bundled' },
  { id: 'tasks', titleKey: 'manual.page.tasks.title', source: 'bundled' },
  // 4T-0529 (Epic 3E-0095): Erinnerungen (⏰-Melde-Marker auf Aufgaben,
  // Benachrichtigungs- und Nachhol-Dialog, Erinnerungs-Liste; die
  // Ueberwachung laeuft nur bei laufender App mit geoeffnetem Bereich).
  { id: 'reminders', titleKey: 'manual.page.reminders.title', source: 'bundled' },
  { id: 'images', titleKey: 'manual.page.images.title', source: 'bundled' },
  // 4T-0792 (Epic 3E-0125): Anlagen (Einfuegen und Ziehen, Ablage-Ort samt
  // Einstellung, Oeffnen in der Standardanwendung). Direkt hinter „Bilder",
  // weil der haeufigste Fall ein eingefuegtes Bild ist und beide Seiten
  // aufeinander verweisen.
  { id: 'attachments', titleKey: 'manual.page.attachments.title', source: 'bundled' },
  { id: 'math-diagrams', titleKey: 'manual.page.mathDiagrams.title', source: 'bundled' },
  { id: 'linking', titleKey: 'manual.page.linking.title', source: 'bundled' },
  // 4T-0342 (Epic 3E-0061): Unterseiten (U+2215-Namens-Konvention,
  // relative Links, Anlage, Breadcrumb/Sektion, Umbenennen mit Kaskade).
  { id: 'subpages', titleKey: 'manual.page.subpages.title', source: 'bundled' },
  // 4T-0457 (Epic 3E-0084): Graphenansicht (Bereichs-Graph-Tab und Datei-
  // Graph-Panel, Bedienung, Pfeil-Semantik, Tiefe/Richtung, Grenzen).
  { id: 'graph', titleKey: 'manual.page.graph.title', source: 'bundled' },
  { id: 'frontmatter', titleKey: 'manual.page.frontmatter.title', source: 'bundled' },
  // 4T-0451 (Epic 3E-0083): Eigenschafts-Profile (Profil-Dateien mit
  // Definitions-Format, Zuordnung/Standard-Profil, Konflikt-Regeln,
  // Wirkung in beiden Eigenschafts-Editoren, weiche Validierung).
  {
    id: 'property-profiles',
    titleKey: 'manual.page.propertyProfiles.title',
    source: 'bundled',
  },
  // 4T-0356 (Epic 3E-0065): Frontmatter-Abfrage (perspective-query-Fence,
  // boolesche Filter-Grammatik, dynamische klickbare Datei-Liste).
  { id: 'frontmatter-query', titleKey: 'manual.page.frontmatterQuery.title', source: 'bundled' },
  // 4T-0415 (Epic 3E-0078): Skript-Bloecke (perspective-script-Fence,
  // Sandbox, Vertrauensmodell, pq-API-Referenz mit Beispielen).
  { id: 'scripts', titleKey: 'manual.page.scripts.title', source: 'bundled' },
  // 4T-0429 (Epic 3E-0080): Vorlagen (Vorlagen-Ordner mit Bereichs-
  // Uebersteuerung, Anwendungs-Wege, Platzhalter-Referenz, Ordner-Regeln).
  { id: 'templates', titleKey: 'manual.page.templates.title', source: 'bundled' },
  // 4T-0437 (Epic 3E-0081): Journale (Regale und Granularitaeten, Ordner-/
  // Namens-Schemata, Kalender-Panel, Navigations-Block, Datums-Properties).
  { id: 'journals', titleKey: 'manual.page.journals.title', source: 'bundled' },
  // 4T-0892 (Epic 3E-0168, Befund L-09): Ansichten und Darstellung — die vier
  // Ansichts-Modi samt Live-Modus, die Editor-Darstellungs-Schalter, das
  // Erscheinungsbild (Theme, Fokus-Modus, Zoom, Breite, Schriften), der
  // Einstellungs-Zugang, Sprachen und Menueleiste. Direkt vor „Sidebar",
  // weil beide Seiten die Oberflaeche beschreiben und die Sidebar-Seite den
  // Panel-Teil davon uebernimmt.
  { id: 'views-display', titleKey: 'manual.page.viewsDisplay.title', source: 'bundled' },
  // 4T-0290 (Epic 3E-0051): Sidebar-Seite (Panels, Anordnung, Reiter-Gruppen).
  { id: 'sidebar', titleKey: 'manual.page.sidebar.title', source: 'bundled' },
  // 4T-0613 (Epic 3E-0115): Lesezeichen (allgemeine und bereichsgebundene mit
  // relativen Pfaden, Panel-Zweiteilung, Anlage/Umwandeln, Reihenfolge).
  { id: 'bookmarks', titleKey: 'manual.page.bookmarks.title', source: 'bundled' },
  // 4T-0467 (Epic 3E-0086): Farbschemas (Slot-Modell, Pflege, Modus-Zuordnung,
  // Kontrast-Grenzen).
  { id: 'color-schemes', titleKey: 'manual.page.colorSchemes.title', source: 'bundled' },
  // 4T-0321 (Epic 3E-0057): Applikationen und Fenster (Mehrfachstart,
  // Titel-Systematik); die Bereichs-Abschnitte ergaenzt 3E-0058.
  { id: 'apps-windows', titleKey: 'manual.page.appsWindows.title', source: 'bundled' },
  // 4T-0850 (Epic 3E-0147): Bücher (Buch-Ordner mit Buch-Datei und
  // Begleitdatei, Inhaltsverzeichnis, Struktur-Pflege, Leseführung,
  // Verschieben mit Nachführung, Reparatur). Direkt hinter „Applikationen,
  // Fenster und Bereiche“, weil ein geöffnetes Buch ein Kontext auf
  // derselben Ebene wie Bereich und Arbeitsbereich ist.
  { id: 'books', titleKey: 'manual.page.books.title', source: 'bundled' },
  // 4T-0334 (Epic 3E-0060): Dokument-Historie (Markdown-Data-Begleitdatei,
  // Drei-Ebenen-Schaltung, Historien-Ansicht mit Vergleich/Wiederherstellen).
  { id: 'history', titleKey: 'manual.page.history.title', source: 'bundled' },
  // 4T-0360 (Epic 3E-0066): Dokument-Notizen (eine Notiz je Dokument in der
  // .mdd-notes-Sektion, Sidebar-Panel mit Vorschau, Abgrenzung zur Historie).
  { id: 'notes', titleKey: 'manual.page.notes.title', source: 'bundled' },
  // 4T-0366 (Epic 3E-0067): Block-Eigenschaften (Metadaten pro Block-Anker in
  // der .mdd-blockData-Sektion, Panel mit Cursor-Folge, Indikator am Block).
  { id: 'block-properties', titleKey: 'manual.page.blockProperties.title', source: 'bundled' },
  { id: 'tools', titleKey: 'manual.page.tools.title', source: 'bundled' },
  // 4T-0523 (Epic 3E-0094): Kommando-Platzierung (eigene Statusbar-Buttons
  // mit Mehr-Menue, Hide-Liste der Standard-Buttons, nutzerdefinierte
  // Kontextmenue-Sektion, Makros; Abgrenzung zur Kommando-Palette).
  { id: 'command-placement', titleKey: 'manual.page.commandPlacement.title', source: 'bundled' },
  // 4T-0296 (Epic 3E-0052): Erweiterungs-System (Schalten, Abhaengigkeiten,
  // Wirkung des Aus-Zustands, erweiterungs-eigene Einstellungs-Bereiche).
  { id: 'extensions', titleKey: 'manual.page.extensions.title', source: 'bundled' },
  // 4T-0301 (Epic 3E-0053): Entwickler-Seite — eigene externe
  // Erweiterungen erstellen (Manifest-Referenz, Erweiterungs-API v1,
  // Referenz-Beispiel, Sicherheits-Hinweis).
  { id: 'extensions-dev', titleKey: 'manual.page.extensionsDev.title', source: 'bundled' },
  { id: 'perspective-table', titleKey: 'manual.page.perspectiveTable.title', source: 'bundled' },
  // 4T-0422 (Epic 3E-0079): Perspective Datatable (typisierte Datentabelle
  // mit Aggregaten, berechneten Spalten, Grid-Bearbeitung, Ansichts-Filter).
  { id: 'datatable', titleKey: 'manual.page.datatable.title', source: 'bundled' },
  // 4T-0518 (Epic 3E-0092): Ereignisse (perspective-events-Fence mit
  // Direktiven und Datenzeilen, internes Profil, Staffelung/Meilensteine,
  // Ansichten, Aggregation ueber Frontmatter, Verknuepfungen).
  { id: 'events', titleKey: 'manual.page.events.title', source: 'bundled' },
  // 4T-0547 (Epic 3E-0097): Kalender-Systeme (Bloecke mit parallelen
  // Kalendern, Ebenen mit fuenf Beziehungs-Typen, Epochen, Umrechnung,
  // Einstellungs-Pflege, Wert-Syntax @{...}, Picker).
  { id: 'custom-calendars', titleKey: 'manual.page.customCalendars.title', source: 'bundled' },
  { id: 'emoji', titleKey: 'manual.page.emoji.title', source: 'bundled' },
];

function manualPageById(id) {
  if (typeof id !== 'string' || id === '') return null;
  return MANUAL_PAGES.find((p) => p.id === id) || null;
}

module.exports = { MANUAL_PAGES, manualPageById };
