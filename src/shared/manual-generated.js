// 4T-0716 (Epic 3E-0137): Geteilte Erzeugung der generierten Handbuch-Seiten.
//
// Prozessneutrales CommonJS-Modul (Muster src/shared/manual-pages.js): reine
// Daten und reine Funktionen ohne DOM- und ohne Electron-Abhängigkeit, damit
// die Funktions- und die Tastenkürzel-Seite in App und Web-Bau aus einer
// Quelle entstehen statt in zwei Fassungen zu leben. Die Erzeugung liegt zuvor
// im Renderer (manual.js über autocomplete-help.js); dieser Schnitt ist
// verhaltensneutral, das erzeugte Markdown bleibt Zeichen für Zeichen gleich.
//
// Die veränderlichen Anteile kommen als Parameter herein: eine
// Übersetzungs-Funktion `t` (Verhalten wie die Renderer-t: reiner Schlüssel-
// Nachschlag, keine Platzhalter-Interpolation), die wirksamen Bindings (App:
// gemergte Nutzer-Overrides; Web: Default-Bindings der Registry) und die Menge
// deaktivierter Kommandos (App: aus den Erweiterungen; Web: leer). So bleibt
// das Modul frei von Laufzeit-Zustand.
'use strict';

// COMMANDS liefert die Kommando-Reihenfolge, bindingToDisplayString den
// deutschen Anzeige-String eines Bindings (Muster wie zuvor im Renderer).
const { COMMANDS, bindingToDisplayString } = require('./commands.js');

// Funktions-Gruppen: kanonische Quelle der generierten Funktions-Seite. Die
// Reihenfolge innerhalb einer Gruppe bestimmt die Tabellen-Zeilen; Gruppen-
// Titel aus help.group.*, Einträge aus help.feature.* plus Kurzname-/Zugang-
// Keys (help.featureName.* / help.featureAccess.*).
const HELP_FEATURE_GROUPS = [
  {
    groupKey: 'help.group.file',
    features: [
      'help.feature.openFiles',
      'help.feature.newTab',
      // 4T-0342 (Epic 3E-0061): Unterseite anlegen und Datei umbenennen —
      // Datei-Verwaltung direkt hinter dem Anlage-Cluster.
      'help.feature.subpageCreate',
      'help.feature.renameFile',
      // 4T-0349 (Epic 3E-0062): Link-Update beim Umbenennen, direkt hinter der
      // Umbenennen-Grundfunktion.
      'help.feature.renameLinkUpdate',
      // 4T-0775 (Epic 3E-0128): Unterseite loesen — technisch und fuer den
      // Anwender eine Umbenennung, deshalb im Umbenennen-Cluster.
      'help.feature.subpageDetach',
      // 4T-0585 (Epic 3E-0108): Titelzeile mit Direkt-Umbenennen, direkt
      // hinter dem Umbenennen-Cluster (gleiche Datei-Operation über einen
      // neuen Bedien-Zugang).
      'help.feature.titleLine',
      // 4T-0429 (Epic 3E-0080): Vorlagen und Ordner-Regeln — Datei-Anlage-
      // Funktionen, direkt hinter dem Anlage-/Verwaltungs-Cluster.
      'help.feature.templates',
      'help.feature.templateRules',
      // 4T-0433 (Epic 3E-0081): Journale — periodische Dokumente, direkt
      // hinter dem Vorlagen-Cluster (der Anlage-Pfad koppelt an die
      // Vorlagen-Infrastruktur). 4T-0437: plus der Navigations-Block.
      'help.feature.journals',
      'help.feature.journalNav',
      'help.feature.save',
      'help.feature.autoSave',
      // 4T-0334 (Epic 3E-0060): Dokument-Historie — Protokollierung,
      // Drei-Ebenen-Schalter und Historien-Ansicht, direkt hinter dem
      // Speicher-Cluster (dokumentbezogene Persistenz).
      'help.feature.history',
      'help.feature.historyControl',
      'help.feature.historyView',
      // 4T-0360 (Epic 3E-0066): Dokument-Notizen — dokumentgebundene .mdd-Daten
      // wie die Historie, direkt hinter dem Historie-Cluster.
      'help.feature.documentNotes',
      // 4T-0366 (Epic 3E-0067): Block-Metadaten — blockgebundene .mdd-Daten,
      // direkt hinter den uebrigen Begleitdatei-Funktionen.
      'help.feature.blockMetadata',
      // 4T-0792 (Epic 3E-0125): Anlagen — Dateien, die beim Einfuegen oder
      // Ziehen entstehen, samt ihrem Oeffnen. Vor dem Export-Cluster, weil sie
      // wie Vorlagen und Journale Dateien ANLEGEN, waehrend Export und
      // Speichern bestehende Dokumente hinausschreiben.
      'help.feature.attachments',
      'help.feature.attachmentOpen',
      // 4T-0042 (Epic 3E-0008): Export 'Portables Markdown...' fuer Perspective-Tabellen.
      'help.feature.exportPortable',
      // 4T-0305 (Epic 3E-0054): PDF-Export direkt neben dem Portable-Export.
      'help.feature.exportPdf',
      'help.feature.autoReload',
      'help.feature.restoreSession',
      // 4T-0370 (Epic 3E-0068): Entwurfs-Zwischenspeicher — was ueberlebt das
      // Beenden, direkt neben der Sitzungs-Wiederherstellung.
      'help.feature.unsavedDrafts',
      'help.feature.windowState',
      // 4T-0538 (Epic 3E-0098): Arbeitsbereiche — benannte Fenster- und
      // Tab-Sammlungen, direkt hinter dem Sitzungs-/Fenster-Cluster.
      'help.feature.workspaces',
      // 4T-0604 (Epic 3E-0113): Erstellungs- und Änderungszeitpunkt — die
      // Automatik wirkt beim Speichern, deshalb im Datei-Cluster hinter den
      // Sitzungs- und Fenster-Funktionen.
      'help.feature.frontmatterTimestamps',
    ],
  },
  {
    groupKey: 'help.group.editing',
    features: [
      'help.feature.editMode',
      'help.feature.tabIndent',
      // 4T-0601 (Epic 3E-0112): Listen-Outliner — Struktur-Bearbeitung,
      // automatische Nummerierung und das Fortsetzen/Beenden beim
      // Zeilenumbruch, direkt hinter der Listen-Einrückung (dieselbe
      // Funktions-Familie).
      'help.feature.listOutline',
      'help.feature.listNumbering',
      'help.feature.listExit',
      // 4T-0074 (Epic 3E-0013): Tabellen-Editor-Komfort (Tab/Shift+Tab/Enter).
      'help.feature.tableEditor',
      // 4T-0590 (Epic 3E-0109): Tabellen-Werkzeuge (Kontextmenü-Untermenü
      // „Tabelle") direkt hinter dem Tabellen-Editor-Komfort.
      'help.feature.tableTools',
      // 4T-0209 (Epic 3E-0015): Timestamp-Kommando, hinter dem
      // Editier-Komfort-Bestand.
      'help.feature.insertTimestamp',
      // 4T-0488 (Epic 3E-0091): Datums-/Uhrzeit-Picker mit klickbaren
      // Werten, direkt hinter dem thematisch verwandten Timestamp.
      'help.feature.datePicker',
      'help.feature.search',
      'help.feature.searchReplace',
      // 4T-0762 (Epic 3E-0142): Suchraum nach Reiter-Typ (Handbuch und
      // Einstellungen), direkt hinter dem Such-Bestand.
      'help.feature.searchScopes',
      // 4T-0617 (Epic 3E-0116): bereichsweite Volltext-Suche, unmittelbar
      // hinter dem Suchraum-Eintrag, weil sie dessen dritter Fall ist.
      'help.feature.areaSearch',
      'help.feature.linter',
      // 4T-0035 (Epic 3E-0006): perspective-table mit Querverweis auf den eigenen Tab.
      'help.feature.perspectiveTable',
      // 4T-0047 (Epic 3E-0009): Sortierung, Status-Hervorhebung, Spalten-Default.
      'help.feature.perspectiveTableExtended',
      // 4T-0052 (Epic 3E-0010): Frontmatter-Erkennung und Properties-Sidebar.
      'help.feature.frontmatter',
      'help.feature.properties',
      // 4T-0448 (Epic 3E-0083): Eigenschafts-Profile — zentrale Feld-
      // Definitionen, direkt hinter dem Properties-Editor, auf dem sie wirken.
      'help.feature.propertyProfiles',
      // 4T-0491 (Epic 3E-0093): Komplett-Übernahme der Profil-Felder, direkt
      // hinter den Eigenschafts-Profilen, auf denen sie aufsetzt.
      'help.feature.profileBulkFill',
      // 4T-0356 (Epic 3E-0065): Frontmatter-Abfrage (perspective-query),
      // baut auf den Frontmatter-Properties auf.
      'help.feature.frontmatterQuery',
      // 4T-0406 (Epic 3E-0076): Ausbau der Abfrage-Sprache — Quellen-Auswahl,
      // Tabellen-Ausgabe sowie Sortierung/Limit/Mehrspaltigkeit als eigene
      // Katalog-Eintraege direkt hinter der Basis-Abfrage.
      'help.feature.querySources',
      'help.feature.queryTable',
      'help.feature.querySort',
      // 4T-0410 (Epic 3E-0077): Block-Abfrage (BLOCKS-Scope) direkt hinter
      // den uebrigen Abfrage-Eintraegen.
      'help.feature.queryBlocks',
      // 4T-0422 (Epic 3E-0079): Perspective Datatable — Konstrukt, Grid-
      // Bearbeitung und Ansichts-Funktionen direkt hinter dem Abfrage-
      // Cluster (nutzt dessen Ausdrucks-Sprache).
      'help.feature.datatable',
      'help.feature.datatableGrid',
      'help.feature.datatableView',
      // 4T-0415 (Epic 3E-0078): Skript-Blöcke (perspective-script) direkt
      // hinter dem Abfrage-/Datentabellen-Cluster (nutzen dessen Daten-Modell).
      'help.feature.scriptBlocks',
      // 4T-0595 (Epic 3E-0111): Inline-Berechnungen direkt hinter dem
      // Abfrage-Cluster (gleiche Ausdrucks-Sprache der Perspective-Abfrage).
      'help.feature.inlineCalc',
      // 4T-0058 (Epic 3E-0011): Block-Anker schreiben und Autocomplete fuer [[ und #.
      'help.feature.blockAnchors',
      'help.feature.autocomplete',
      // 4T-0065 (Epic 3E-0012): Markdown-Syntax-Erweiterungen.
      'help.feature.callouts',
      'help.feature.highlight',
      'help.feature.footnotes',
      // 4T-0205 (Epic 3E-0017): Markdown-Erweiterungen 0.27.0, direkt
      // hinter dem Bestands-Cluster callouts/highlight/footnotes.
      'help.feature.emoji',
      'help.feature.abbreviations',
      'help.feature.implicitFigures',
      'help.feature.imageSize',
      'help.feature.definitionLists',
      'help.feature.lineBlocks',
      'help.feature.customContainers',
      // 4T-0384 (Epic 3E-0072): Mehrspalten-Block direkt hinter dem
      // Container-Bestand (gleiche ::: -Syntax-Familie).
      'help.feature.multiColumns',
      'help.feature.subSup',
      'help.feature.insertion',
      'help.feature.headingAttributes',
      'help.feature.spoiler',
      'help.feature.criticMarkup',
      // 4T-0479 (Epic 3E-0089): %%-Kommentare direkt nach Critic Markup.
      'help.feature.comments',
      'help.feature.taskStates',
      // 4T-0500 (Epic 3E-0090): Task-Marker und Global Filter direkt hinter den Task-Status.
      'help.feature.taskMarkers',
      'help.feature.taskGlobalFilter',
      // 4T-0509 (Epic 3E-0096): Abfrage- und Komfort-Stufe des Aufgaben-
      // Ausbaus direkt hinter dem Task-Fundament.
      'help.feature.taskQuery',
      'help.feature.taskQueryActions',
      'help.feature.taskDialog',
      'help.feature.taskAutocomplete',
      'help.feature.taskDependencies',
      'help.feature.taskUrgency',
      // 4T-0529 (Epic 3E-0095): Erinnerungs-System (⏰-Melde-Marker,
      // Benachrichtigungen, Erinnerungs-Liste) direkt hinter dem
      // Aufgaben-Cluster (setzt auf den Task-Zeilen auf).
      'help.feature.reminders',
      'help.feature.reminderNotifications',
      'help.feature.reminderList',
      // 4T-0518 (Epic 3E-0092): Ereignis-Verwaltung — datums-getriebene
      // Eintrags-Pflege, direkt hinter dem Erinnerungs-Cluster (gleiche
      // Termin-Domäne); Aggregation und Verknüpfungen als eigene Einträge.
      'help.feature.events',
      'help.feature.eventsAggregation',
      'help.feature.eventsLinks',
      // 4T-0547 (Epic 3E-0097): Kalender-Systeme direkt hinter dem
      // Ereignis-Cluster (gleiche Termin-/Zeit-Domäne).
      'help.feature.customCalendars',
      // 4T-0749 (Epic 3E-0138): abgeleitete Zeitrechnungen direkt hinter den
      // Kalender-Systemen, auf denen sie aufsetzen.
      'help.feature.derivedCalendars',
      // 4T-0071 (Epic 3E-0013): Code-Block Copy-Button im Render-Pane.
      'help.feature.codeCopyButton',
      // 4T-0380 (Epic 3E-0071): Editor-Kontextmenue als zentraler Editier-
      // Zugang; die einzelnen Format-/Absatz-/Einfuege-Kommandos gehen hier auf.
      'help.feature.editorContextMenu',
      // 4T-0523 (Epic 3E-0094): die nutzerdefinierte Sektion direkt hinter
      // dem Editor-Kontextmenue, dessen Ende sie bildet.
      'help.feature.contextMenuCommands',
      // 4T-0607 (Epic 3E-0114): die Format-Toolbar direkt hinter den
      // uebrigen Editier-Zugaengen (loest dieselben Format-, Absatz-,
      // Einfuege- und Link-Kommandos aus wie das Kontextmenue).
      'help.feature.formatToolbar',
      // 4T-0603 (Epic 3E-0113): Link-Einfügen in die Auswahl — Editier-
      // Automatik beim Einfügen, hinter den übrigen Editier-Zugängen.
      'help.feature.pasteLink',
    ],
  },
  {
    groupKey: 'help.group.view',
    features: [
      'help.feature.viewModes',
      // 4T-0085 (Epic 3E-0014): Live-Modus als vierter View-Modus.
      'help.feature.livePreview',
      'help.feature.sourceToggles',
      // 4T-0290 (Epic 3E-0051): dynamische Sidebar (Seite, Reihenfolge,
      // Reiter-Gruppen) — Ansicht-Eigenschaft, die Panels selbst bleiben
      // in der Navigations-Gruppe.
      'help.feature.sidebarLayout',
      // 4T-0373 (Epic 3E-0069): Darstellung der Panel-Überschriften, direkt
      // hinter der Anordnung (beides Sidebar-Konfiguration).
      'help.feature.sidebarIconHeadings',
      // 4T-0475 (Epic 3E-0088): manuell einstellbare Panel-Höhen, direkt hinter
      // der Sidebar-Anordnung (beide steuern das Layout der Seitenleiste).
      'help.feature.panelHeights',
      // 4T-0570 (Epic 3E-0104): Reihenfolge der Panel-Zugänge (Untermenü und
      // Statusbar-Leiste) — Anordnungs-Eigenschaft wie sidebarLayout/
      // panelHeights, die Panels selbst bleiben in der Navigations-Gruppe.
      'help.feature.panelToggleOrder',
      // 4T-0627 (Epic 3E-0119): benannte Sidebar-Varianten direkt hinter den
      // übrigen Anordnungs-Eigenschaften (Snapshots genau dieser Anordnung).
      'help.feature.sidebarVariants',
      // 4T-0699 (Epic 3E-0141): Ein-/Ausklappen ganzer Sidebar-Spalten direkt
      // hinter den übrigen Sidebar-Eigenschaften (Zustand über der Panel-
      // Sichtbarkeit, je Editor-Spalte).
      'help.feature.sidebarCollapse',
      // 4T-0523 (Epic 3E-0094): nutzerdefinierte Statusbar-Zugaenge direkt
      // hinter der Panel-Zugangs-Reihenfolge (gleiche Statusbar-Familie).
      'help.feature.statusbarCommandButtons',
      'help.feature.statusbarHideList',
      'help.feature.foldGutter',
      // 4T-0573 (Epic 3E-0105): dokument-gebundene Editor-Ansicht-Schalter
      // direkt hinter dem Gliederungs-Folding (gleiche Schalter-Familie).
      'help.feature.editorViewSettings',
      // 4T-0579 (Epic 3E-0106): Hervorhebung der Cursor-Zeile, direkt hinter
      // den uebrigen Editor-Ansicht-Schaltern.
      'help.feature.activeLine',
      'help.feature.zoom',
      // 4T-0384 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht
      // direkt hinter dem Zoom (beides Größen-Steuerung der Ansicht).
      'help.feature.contentWidth',
      'help.feature.settings',
      'help.feature.focusMode',
      'help.feature.typewriterScroll',
      // 4T-0072 (Epic 3E-0013): Word Count in der Statusbar mit Detail-Dialog.
      'help.feature.wordCount',
      // 4T-0372 (Epic 3E-0069): Uhr-Panel direkt hinter der Wort-Statistik —
      // beides reine Anzeige-Funktionen ohne Dokument-Bezug.
      'help.feature.clock',
      // 4T-0373 (Epic 3E-0069): die drei Zeit-Werkzeuge des Uhr-Panels
      // schließen direkt an die Uhr an.
      'help.feature.clockAlarms',
      'help.feature.clockTimers',
      // 4T-0752 (Epic 3E-0146): Monatskalender als fuenfter Modus, direkt
      // hinter den uebrigen Zeit-Werkzeugen des Panels.
      'help.feature.clockCalendar',
      // 4T-0028 (Render-Lift 0.10.0): drei neue Features im Render-Pane.
      'help.feature.codeHighlight',
      'help.feature.katex',
      'help.feature.mermaid',
      // 4T-0065 (Epic 3E-0012): Scroll-Synchronisation in der Split-Ansicht.
      'help.feature.scrollSync',
      // 4T-0285 (Epic 3E-0050): Frontmatter-Zeile im Gerenderten.
      'help.feature.frontmatterDisplay',
      'help.feature.headingNumbering',
    ],
  },
  {
    groupKey: 'help.group.navigation',
    features: [
      'help.feature.tabs',
      // 4T-0676 (Epic 3E-0130): Einfuege-Position neuer Reiter direkt hinter
      // dem Tab-Eintrag — sie gilt mit UND ohne Gruppen und steht deshalb vor
      // dem Gruppen-Eintrag.
      'help.feature.tabPlacement',
      // 4T-0462 (Epic 3E-0085): Tab-Gruppen direkt hinter dem Tab-Eintrag
      // (Struktur desselben Tab-Streifens).
      'help.feature.tabGroups',
      // 4T-0769 (Epic 3E-0158): Mehrfach-Auswahl unmittelbar hinter den
      // Gruppen — sie ist die Geste, mit der Mengen in Gruppen bewegt werden.
      'help.feature.tabSelection',
      // 4T-0579 (Epic 3E-0106): Ecken-Form der Reiter, direkt hinter den
      // Tab-Eintraegen (dieselbe Leiste, reine Darstellungs-Option).
      'help.feature.roundedTabs',
      'help.feature.multiWindow',
      // 4T-0321 (Epic 3E-0057): logische Applikationen (Mehrfachstart).
      'help.feature.multiApp',
      // 4T-0326 (Epic 3E-0058): Bereiche und Zuletzt-geoeffnete-Bereiche.
      'help.feature.area',
      'help.feature.recentAreas',
      // 4T-0632 (Epic 3E-0102): mitgelieferte Demo-Area, direkt hinter den
      // Bereichs-Einstiegen (sie erzeugt und oeffnet einen Bereich).
      'help.feature.demoArea',
      // 4T-0329 (Epic 3E-0059): Bereichs-Panel (Ordnerbaum plus Dateiliste).
      'help.feature.areaPanel',
      // 4T-0437 (Epic 3E-0081): Kalender-Panel der Journale, direkt hinter
      // dem Bereichs-Panel (beide bereichsgebundene Einstiegs-Panels).
      'help.feature.journalCalendar',
      // 4T-0621 (Epic 3E-0117): Bereichs-Statistik schliesst den Block der
      // bereichsgebundenen Eintraege ab — sie wertet genau den Datei-Raum
      // aus, den die Eintraege davor eroeffnen und anzeigen.
      'help.feature.areaStats',
      'help.feature.outline',
      'help.feature.backlinks',
      // 4T-0073 (Epic 3E-0013): Outgoing-Links-Sidebar.
      'help.feature.outgoingLinks',
      // 4T-0457 (Epic 3E-0084): Graphenansicht — beide Formen direkt hinter
      // den Link-Beziehungs-Panels (Backlinks/Outgoing-Links).
      'help.feature.areaGraph',
      'help.feature.fileGraph',
      // 4T-0052 (Epic 3E-0010): Aliases als alternative Wiki-Link-Ziele.
      'help.feature.aliases',
      // 4T-0058 (Epic 3E-0011): Wiki-Link-Anker, Wiki-Embeds und Tag-System.
      'help.feature.wikiLinkAnchors',
      'help.feature.wikiEmbeds',
      // 4T-0342 (Epic 3E-0061): Unterseiten direkt im Vernetzungs-Cluster
      // hinter Wiki-Links/Embeds.
      'help.feature.subpages',
      'help.feature.subpagesNavigation',
      'help.feature.tags',
      'help.feature.anchorLinks',
      'help.feature.links',
      // 4T-0075/4T-0078/4T-0079 (Epic 3E-0013): Lesezeichen-Sidebar mit
      // Tree-Struktur, Ordnern und Drag-and-Drop.
      'help.feature.bookmarks',
      // 4T-0613 (Epic 3E-0115): Bereichs-Lesezeichen direkt hinter den
      // allgemeinen Lesezeichen (zweiter Abschnitt desselben Panels).
      'help.feature.areaBookmarks',
    ],
  },
  {
    groupKey: 'help.group.general',
    features: [
      'help.feature.theme',
      // 4T-0467 (Epic 3E-0086): Farbschemas neben Theme (app-weite Darstellung).
      'help.feature.colorSchemes',
      'help.feature.languages',
      'help.feature.menuBar',
      // 4T-0209 (Epic 3E-0015): konfigurierbare Tastenkuerzel als
      // app-weite Eigenschaft, neben Theme/Sprachen/Menueleiste.
      'help.feature.customHotkeys',
      // 4T-0523 (Epic 3E-0094): Makros als app-weite Bedien-Eigenschaft
      // neben den konfigurierbaren Tastenkuerzeln (Registrierungs-Kniff:
      // jedes Makro ist ein regulaeres Kommando).
      'help.feature.macros',
      // 4T-0296 (Epic 3E-0052): das Erweiterungs-System als app-weite
      // Eigenschaft (Schalten interner Erweiterungen).
      'help.feature.extensions',
      // 4T-0301 (Epic 3E-0053): externe Erweiterungen (Installieren,
      // Vertrauens-Ablauf, Erweiterungs-API) direkt neben dem internen
      // Erweiterungs-Eintrag.
      'help.feature.extensionsExternal',
      // 4T-0216 (Epic 3E-0042): das Handbuch selbst als Katalog-Eintrag.
      'help.feature.manual',
    ],
  },
];

// Statische Rest-Liste der bewusst nicht konfigurierbaren Bindings (Esc-
// Kaskade, Alt-Menü, Tab-Indent, Maus, Such-Enter), hinter den aus der
// Registry erzeugten Zeilen.
const STATIC_HELP_SHORTCUTS = [
  { keys: ['Strg+Mausrad'], descKey: 'help.shortcut.zoomWheel' },
  { keys: ['Tab', 'Umschalt+Tab'], descKey: 'help.shortcut.tabIndent' },
  { keys: ['Mittlere Maustaste'], descKey: 'help.shortcut.middleClickClose' },
  { keys: ['Enter', 'Umschalt+Enter'], descKey: 'help.shortcut.searchNavEnter' },
  // K-16 (4T-0191): "Alle ersetzen" im Ersetzen-Feld.
  { keys: ['Umschalt+Enter', 'Alt+Enter'], descKey: 'help.shortcut.replaceAll' },
  { keys: ['Esc'], descKey: 'help.shortcut.escape' },
  { keys: ['Alt'], descKey: 'help.shortcut.menuBar' },
];

// Tasten-Lokalisierung: Tastennamen sehen je Sprache anders aus ("Strg" vs.
// "Ctrl", "Umschalt" vs. "Shift"). Die deutschen Anzeige-Tokens werden über
// i18n-Keys übersetzt, mit dem deutschen Token als Rückfall.
const KEY_LABEL_KEY = {
  Strg: 'help.key.ctrl',
  Umschalt: 'help.key.shift',
  Alt: 'help.key.alt',
  Tab: 'help.key.tab',
  Enter: 'help.key.enter',
  Esc: 'help.key.esc',
  'Mittlere Maustaste': 'help.key.middleClick',
  // 4T-0027: Mausrad als eigene "Taste" fuer den Zoom-per-Mausrad-Shortcut.
  Mausrad: 'help.key.mouseWheel',
};

function localizeKey(token, t) {
  const key = KEY_LABEL_KEY[token];
  if (!key) return token;
  const translated = t(key);
  return translated === key ? token : translated;
}

// Helfer für den "+"-Split der Anzeige-Tokens ("Strg+E" -> ["Strg", "E"],
// "Strg++" -> ["Strg", "+"], das zweite Plus ist Inhalt, nicht Trenner).
function splitShortcutKeys(k) {
  if (k.endsWith('+') && k.length >= 2 && k[k.length - 2] === '+') {
    const head = k.slice(0, -1); // "Strg+"
    const headTokens = head.split('+').filter((s) => s !== '');
    return [...headTokens, '+'];
  }
  return k.split('+');
}

// Pipe-Zeichen für Tabellen-Zellen escapen: vorhandene \|-Escapes der Quell-
// Strings zuerst neutralisieren, dann einheitlich neu escapen, sonst würde ein
// bereits escaptes Pipe doppelt maskiert.
function escapeTableCell(value) {
  return String(value == null ? '' : value)
    .replace(/\\\|/g, '|')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

// Tastenkürzel-Zeilen aus der Kommando-Registry mit den wirksamen Bindings
// plus statischer Rest-Liste. Kommandos ohne descKey und deaktivierte
// Kommandos entfallen; Einträge mit gleichem descKey bündeln in eine Zeile.
function buildHelpShortcutRows({ effectiveBindings, disabledCommandIds }) {
  // 4T-0294: Kommandos effektiv deaktivierter Erweiterungen erscheinen
  // nicht (die generierte Handbuch-Seite zeigt keine toten Kuerzel).
  const disabled = disabledCommandIds || new Set();
  const rows = [];
  const rowByDescKey = new Map();
  for (const cmd of COMMANDS) {
    if (!cmd.descKey) continue;
    if (disabled.has(cmd.id)) continue;
    const bindings = effectiveBindings[cmd.id] || [];
    if (bindings.length === 0) continue;
    let row = rowByDescKey.get(cmd.descKey);
    if (!row) {
      row = { keys: [], descKey: cmd.descKey };
      rowByDescKey.set(cmd.descKey, row);
      rows.push(row);
    }
    for (const binding of bindings) {
      const display = bindingToDisplayString(binding);
      if (display && !row.keys.includes(display)) row.keys.push(display);
    }
  }
  return [...rows, ...STATIC_HELP_SHORTCUTS];
}

// Funktions-Seite: H2 pro Gruppe aus HELP_FEATURE_GROUPS, darunter eine
// dreispaltige Pipe-Tabelle (Funktion, Beschreibung, Zugang).
function generateFunctionsPage(t) {
  const lines = [];
  lines.push(`# ${t('manual.page.functions.title')}`);
  lines.push('');
  lines.push(t('manual.functions.intro'));
  lines.push('');
  for (const group of HELP_FEATURE_GROUPS) {
    lines.push(`## ${t(group.groupKey)}`);
    lines.push('');
    lines.push(
      `| ${t('manual.functions.colFunction')} | ${t('manual.functions.colDescription')} | ${t('manual.functions.colAccess')} |`,
    );
    lines.push('|---|---|---|');
    for (const featureKey of group.features) {
      const name = featureKey.replace('help.feature.', '');
      const nameCell = escapeTableCell(t(`help.featureName.${name}`));
      const descCell = escapeTableCell(t(featureKey));
      const accessCell = escapeTableCell(t(`help.featureAccess.${name}`));
      lines.push(`| **${nameCell}** | ${descCell} | ${accessCell} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Tastenkürzel-Seite: Registry-Zeilen mit den wirksamen Bindings plus
// statische Rest-Liste. Tasten erscheinen als Inline-Code, lokalisiert über
// localizeKey.
function generateShortcutsPage({ t, effectiveBindings, disabledCommandIds }) {
  const lines = [];
  lines.push(`# ${t('manual.page.shortcuts.title')}`);
  lines.push('');
  lines.push(t('help.shortcutsConfigurableNote'));
  lines.push('');
  lines.push(`| ${t('manual.shortcuts.colKeys')} | ${t('manual.shortcuts.colDescription')} |`);
  lines.push('|---|---|');
  for (const row of buildHelpShortcutRows({ effectiveBindings, disabledCommandIds })) {
    const keys = row.keys
      .map(
        (k) =>
          '`' +
          splitShortcutKeys(k)
            .map((token) => localizeKey(token, t))
            .join('+') +
          '`',
      )
      .join(' / ');
    lines.push(`| ${keys} | ${escapeTableCell(t(row.descKey))} |`);
  }
  return lines.join('\n');
}

module.exports = {
  HELP_FEATURE_GROUPS,
  STATIC_HELP_SHORTCUTS,
  KEY_LABEL_KEY,
  escapeTableCell,
  splitShortcutKeys,
  localizeKey,
  buildHelpShortcutRows,
  generateFunctionsPage,
  generateShortcutsPage,
};
