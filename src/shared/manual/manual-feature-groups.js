// 4T-001075 (Epic 3E-000211): Registry der Funktions-Gruppen, aus
// manual-generated.js herausgeloest.
//
// Der Schnitt trennt Daten von Erzeugung: Diese Datei traegt allein die
// kanonische Gruppen-Tabelle der generierten Funktions-Seite, manual-
// generated.js die beiden Generatoren. Erzwungen hat ihn das Datei-Groessen-
// Budget — die Tabelle waechst per Konvention mit jedem neuen Katalog-Eintrag
// (Entwicklungsrichtlinien, Kapitel 13), ein eingefrorener Deckel auf einer
// Pflicht-Registry haette also bei jeder neuen Funktion erneut gerissen. Die
// Tabelle selbst bleibt ungeteilt: Sie ist die eine Quelle der Funktions-Seite.
'use strict';

// Funktions-Gruppen: kanonische Quelle der generierten Funktions-Seite. Die
// Reihenfolge innerhalb einer Gruppe bestimmt die Tabellen-Zeilen; Gruppen-
// Titel aus help.group.*, Eintraege aus help.feature.* plus Kurzname-/Zugang-
// Keys (help.featureName.* / help.featureAccess.*).
const HELP_FEATURE_GROUPS = [
  {
    groupKey: 'help.group.file',
    features: [
      'help.feature.openFiles',
      'help.feature.newTab',
      // 4T-000342 (Epic 3E-000061): Unterseite anlegen und Datei umbenennen —
      // Datei-Verwaltung direkt hinter dem Anlage-Cluster.
      'help.feature.subpageCreate',
      'help.feature.renameFile',
      // 4T-000349 (Epic 3E-000062): Link-Update beim Umbenennen, direkt hinter der
      // Umbenennen-Grundfunktion.
      'help.feature.renameLinkUpdate',
      // 4T-000775 (Epic 3E-000128): Unterseite loesen — technisch und fuer den
      // Anwender eine Umbenennung, deshalb im Umbenennen-Cluster.
      'help.feature.subpageDetach',
      // 4T-000585 (Epic 3E-000108): Titelzeile mit Direkt-Umbenennen, direkt
      // hinter dem Umbenennen-Cluster (gleiche Datei-Operation über einen
      // neuen Bedien-Zugang).
      'help.feature.titleLine',
      // 4T-001294 (Epic 3E-000224): Teilung großer Dokumente und ihr Gegenstück.
      // Beides sind Operationen am Datei-Bestand des Anwenders und stehen
      // deshalb im Verwaltungs-Cluster; die Teilung zuerst, weil das
      // Wiedervereinen sie voraussetzt.
      'help.feature.documentSplit',
      'help.feature.rejoinParts',
      // 4T-000429 (Epic 3E-000080): Vorlagen und Ordner-Regeln — Datei-Anlage-
      // Funktionen, direkt hinter dem Anlage-/Verwaltungs-Cluster.
      'help.feature.templates',
      'help.feature.templateRules',
      // 4T-000433 (Epic 3E-000081): Journale — periodische Dokumente hinter dem
      // Vorlagen-Cluster; 4T-000437 und 4T-001067: die beiden Journal-Blöcke.
      'help.feature.journals',
      'help.feature.journalNav',
      'help.feature.journalTimeline',
      'help.feature.save',
      'help.feature.autoSave',
      // 4T-000334 (Epic 3E-000060): Dokument-Historie — Protokollierung,
      // Drei-Ebenen-Schalter und Historien-Ansicht, direkt hinter dem
      // Speicher-Cluster (dokumentbezogene Persistenz).
      'help.feature.history',
      'help.feature.historyControl',
      'help.feature.historyView',
      // 4T-000360 (Epic 3E-000066): Dokument-Notizen — dokumentgebundene .mdd-Daten
      // wie die Historie, direkt hinter dem Historie-Cluster.
      'help.feature.documentNotes',
      // 4T-000366 (Epic 3E-000067): Block-Metadaten — blockgebundene .mdd-Daten,
      // direkt hinter den uebrigen Begleitdatei-Funktionen.
      'help.feature.blockMetadata',
      // 4T-000792 (Epic 3E-000125): Anlagen — Dateien, die beim Einfuegen oder
      // Ziehen entstehen, samt ihrem Oeffnen. Vor dem Export-Cluster, weil sie
      // wie Vorlagen und Journale Dateien ANLEGEN, waehrend Export und
      // Speichern bestehende Dokumente hinausschreiben.
      'help.feature.attachments',
      'help.feature.attachmentOpen',
      // 4T-000042 (Epic 3E-000008): Export 'Portables Markdown...' fuer Perspective-Tabellen.
      'help.feature.exportPortable',
      // 4T-000305 (Epic 3E-000054): PDF-Export direkt neben dem Portable-Export.
      'help.feature.exportPdf',
      'help.feature.autoReload',
      'help.feature.restoreSession',
      // 4T-000370 (Epic 3E-000068): Entwurfs-Zwischenspeicher — was ueberlebt das
      // Beenden, direkt neben der Sitzungs-Wiederherstellung.
      'help.feature.unsavedDrafts',
      'help.feature.windowState',
      // 4T-000538 (Epic 3E-000098): Arbeitsbereiche — benannte Fenster- und
      // Tab-Sammlungen, direkt hinter dem Sitzungs-/Fenster-Cluster.
      'help.feature.workspaces',
      // 4T-000849 (Epic 3E-000147): Bücher — ein Kontext auf derselben Ebene wie
      // Bereich und Arbeitsbereich (Entscheidung 11), deshalb direkt hinter
      // den Arbeitsbereichen im Datei-Cluster.
      'help.feature.books',
      // 4T-000850 (Epic 3E-000147): die fünf Buch-Funktionen unmittelbar hinter
      // dem Modell-Überblick, in der Reihenfolge, in der ein Anwender sie
      // antrifft — Inhaltsverzeichnis, Struktur-Pflege, Leseführung,
      // Verschieben, Reparatur. Sie bleiben im Datei-Cluster beim Überblick
      // stehen, weil sie ohne ihn nicht verständlich sind.
      'help.feature.bookToc',
      'help.feature.bookStructure',
      'help.feature.bookReading',
      'help.feature.bookMoveFile',
      'help.feature.bookRepair',
      // 4T-000869 (Epic 3E-000162): Buecherregale unmittelbar hinter den
      // Buch-Funktionen — erst das Regal (Modell, Oeffnen, Anlegen,
      // Zuordnen), dann seine Ansicht (Kacheln, Zeilen, Umschalter).
      'help.feature.bookshelf',
      'help.feature.shelfView',
      // 4T-000604 (Epic 3E-000113): Erstellungs- und Änderungszeitpunkt — die
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
      // 4T-000601 (Epic 3E-000112): Listen-Outliner — Struktur-Bearbeitung,
      // automatische Nummerierung und das Fortsetzen/Beenden beim
      // Zeilenumbruch, direkt hinter der Listen-Einrückung (dieselbe
      // Funktions-Familie).
      'help.feature.listOutline',
      'help.feature.listNumbering',
      'help.feature.listExit',
      // 4T-000074 (Epic 3E-000013): Tabellen-Editor-Komfort (Tab/Shift+Tab/Enter).
      'help.feature.tableEditor',
      // 4T-000590 (Epic 3E-000109): Tabellen-Werkzeuge (Kontextmenü-Untermenü
      // „Tabelle") direkt hinter dem Tabellen-Editor-Komfort.
      'help.feature.tableTools',
      // 4T-000209 (Epic 3E-000015): Timestamp-Kommando, hinter dem
      // Editier-Komfort-Bestand.
      'help.feature.insertTimestamp',
      // 4T-000488 (Epic 3E-000091): Datums-/Uhrzeit-Picker mit klickbaren
      // Werten, direkt hinter dem thematisch verwandten Timestamp.
      'help.feature.datePicker',
      'help.feature.search',
      'help.feature.searchReplace',
      // 4T-000762 (Epic 3E-000142): Suchraum nach Reiter-Typ (Handbuch und
      // Einstellungen), direkt hinter dem Such-Bestand.
      'help.feature.searchScopes',
      // 4T-000617 (Epic 3E-000116): bereichsweite Volltext-Suche, unmittelbar
      // hinter dem Suchraum-Eintrag, weil sie dessen dritter Fall ist.
      'help.feature.areaSearch',
      'help.feature.linter',
      // 4T-000583 (Epic 3E-000107): Rechtschreibpruefung direkt hinter dem
      // Linter, weil beide Maengel im Editor markieren.
      'help.feature.spellcheck',
      // 4T-000035 (Epic 3E-000006): perspective-table mit Querverweis auf den eigenen Tab.
      'help.feature.perspectiveTable',
      // 4T-000047 (Epic 3E-000009): Sortierung, Status-Hervorhebung, Spalten-Default.
      'help.feature.perspectiveTableExtended',
      // 4T-000052 (Epic 3E-000010): Frontmatter-Erkennung und Properties-Sidebar.
      'help.feature.frontmatter',
      'help.feature.properties',
      // 4T-001340 (Epic 3E-000238): Werte-Vorschlaege aus dem Bestand, direkt hinter
      // dem Properties-Editor, auf dem sie wirken — und VOR dem Profil-Cluster,
      // weil sie gerade ohne Profil helfen.
      'help.feature.propertyValueSuggestions',
      // 4T-000448 (Epic 3E-000083): Eigenschafts-Profile — zentrale Feld-
      // Definitionen, direkt hinter dem Properties-Editor, auf dem sie wirken.
      'help.feature.propertyProfiles',
      // 4T-001144 (Epic 3E-000218): Profil-Vererbung, direkt hinter den
      // Eigenschafts-Profilen, deren Definitions-Bestand sie teilt.
      'help.feature.profileInheritance',
      // 4T-000491 (Epic 3E-000093): Komplett-Übernahme der Profil-Felder, direkt
      // hinter den Eigenschafts-Profilen, auf denen sie aufsetzt.
      'help.feature.profileBulkFill',
      // 4T-001162 (Epic 3E-000219): Wertevorräte und Zuordnungs-Wege der Stufe 2,
      // direkt hinter den Eigenschafts-Profilen, deren Definitions- und
      // Auflösungs-Bestand sie erweitern.
      'help.feature.profileValueSources',
      'help.feature.profileBindings',
      // 4T-001177 (Epic 3E-000220): die beiden Zugaenge der Stufe 3, direkt hinter
      // den Zuordnungs-Wegen — das Formular zeigt deren Ergebnis am Dokument,
      // die erzeugte Abfrage fragt danach ueber den ganzen Bestand.
      'help.feature.profileFieldForm',
      'help.feature.profileQuery',
      // 4T-001188 (Epic 3E-000221): die beiden Feld-Arten der Stufe 4, direkt
      // hinter den Zugaengen — sie erweitern denselben Definitions-Bestand um
      // Felder, die ihren Wert nicht tragen, sondern bekommen, und um Felder,
      // die eine Struktur tragen statt eines einzelnen Werts.
      'help.feature.profileDerivedFields',
      'help.feature.profileStructuredFields',
      // 4T-000356 (Epic 3E-000065): Frontmatter-Abfrage (perspective-query),
      // baut auf den Frontmatter-Properties auf.
      'help.feature.frontmatterQuery',
      // 4T-000406 (Epic 3E-000076): Ausbau der Abfrage-Sprache — Quellen-Auswahl,
      // Tabellen-Ausgabe sowie Sortierung/Limit/Mehrspaltigkeit als eigene
      // Katalog-Eintraege direkt hinter der Basis-Abfrage.
      'help.feature.querySources',
      'help.feature.queryTable',
      'help.feature.querySort',
      // 4T-000410 (Epic 3E-000077): Block-Abfrage (BLOCKS-Scope) direkt hinter
      // den uebrigen Abfrage-Eintraegen.
      'help.feature.queryBlocks',
      // 4T-001075 (Epic 3E-000211): Ausbau der Abfrage-Sprache um den Bezug auf
      // die Traeger-Datei, die Wert-Bausteine zusammengesetzter Spalten und
      // die Hervorhebung — drei Eintraege im Zuschnitt der uebrigen
      // Sprach-Eintraege (Cluster, nicht je Einzel-Funktion), direkt hinter
      // dem Bestands-Cluster der Abfrage.
      'help.feature.queryContext',
      'help.feature.queryValues',
      'help.feature.queryHighlight',
      // 4T-000422 (Epic 3E-000079): Perspective Datatable — Konstrukt, Grid-
      // Bearbeitung und Ansichts-Funktionen direkt hinter dem Abfrage-
      // Cluster (nutzt dessen Ausdrucks-Sprache).
      'help.feature.datatable',
      'help.feature.datatableGrid',
      'help.feature.datatableView',
      // 4T-000415 (Epic 3E-000078): Skript-Blöcke (perspective-script) direkt
      // hinter dem Abfrage-/Datentabellen-Cluster (nutzen dessen Daten-Modell).
      'help.feature.scriptBlocks',
      // 4T-000595 (Epic 3E-000111): Inline-Berechnungen direkt hinter dem
      // Abfrage-Cluster (gleiche Ausdrucks-Sprache der Perspective-Abfrage).
      'help.feature.inlineCalc',
      // 4T-000058 (Epic 3E-000011): Block-Anker schreiben und Autocomplete fuer [[ und #.
      'help.feature.blockAnchors',
      'help.feature.autocomplete',
      // 4T-000065 (Epic 3E-000012): Markdown-Syntax-Erweiterungen.
      'help.feature.callouts',
      'help.feature.highlight',
      'help.feature.footnotes',
      // 4T-000205 (Epic 3E-000017): Markdown-Erweiterungen 0.27.0, direkt
      // hinter dem Bestands-Cluster callouts/highlight/footnotes.
      'help.feature.emoji',
      'help.feature.abbreviations',
      'help.feature.implicitFigures',
      'help.feature.imageSize',
      'help.feature.definitionLists',
      'help.feature.lineBlocks',
      'help.feature.customContainers',
      // 4T-000384 (Epic 3E-000072): Mehrspalten-Block direkt hinter dem
      // Container-Bestand (gleiche ::: -Syntax-Familie).
      'help.feature.multiColumns',
      'help.feature.subSup',
      'help.feature.insertion',
      'help.feature.headingAttributes',
      'help.feature.spoiler',
      'help.feature.criticMarkup',
      // 4T-000479 (Epic 3E-000089): %%-Kommentare direkt nach Critic Markup.
      'help.feature.comments',
      'help.feature.taskStates',
      // 4T-000500 (Epic 3E-000090): Task-Marker und Global Filter direkt hinter den Task-Status.
      'help.feature.taskMarkers',
      'help.feature.taskGlobalFilter',
      // 4T-000509 (Epic 3E-000096): Abfrage- und Komfort-Stufe des Aufgaben-
      // Ausbaus direkt hinter dem Task-Fundament.
      'help.feature.taskQuery',
      'help.feature.taskQueryActions',
      'help.feature.taskDialog',
      'help.feature.taskAutocomplete',
      'help.feature.taskDependencies',
      'help.feature.taskUrgency',
      // 4T-000529 (Epic 3E-000095): Erinnerungs-System (⏰-Melde-Marker,
      // Benachrichtigungen, Erinnerungs-Liste) direkt hinter dem
      // Aufgaben-Cluster (setzt auf den Task-Zeilen auf).
      'help.feature.reminders',
      'help.feature.reminderNotifications',
      'help.feature.reminderList',
      // 4T-000518 (Epic 3E-000092): Ereignis-Verwaltung — datums-getriebene
      // Eintrags-Pflege, direkt hinter dem Erinnerungs-Cluster (gleiche
      // Termin-Domäne); Aggregation und Verknüpfungen als eigene Einträge.
      'help.feature.events',
      'help.feature.eventsAggregation',
      'help.feature.eventsLinks',
      // 4T-000547 (Epic 3E-000097): Kalender-Systeme direkt hinter dem
      // Ereignis-Cluster (gleiche Termin-/Zeit-Domäne).
      'help.feature.customCalendars',
      // 4T-000749 (Epic 3E-000138): abgeleitete Zeitrechnungen direkt hinter den
      // Kalender-Systemen, auf denen sie aufsetzen.
      'help.feature.derivedCalendars',
      // 4T-000071 (Epic 3E-000013): Code-Block Copy-Button im Render-Pane.
      'help.feature.codeCopyButton',
      // 4T-000380 (Epic 3E-000071): Editor-Kontextmenue als zentraler Editier-
      // Zugang; die einzelnen Format-/Absatz-/Einfuege-Kommandos gehen hier auf.
      'help.feature.editorContextMenu',
      // 4T-000523 (Epic 3E-000094): die nutzerdefinierte Sektion direkt hinter
      // dem Editor-Kontextmenue, dessen Ende sie bildet.
      'help.feature.contextMenuCommands',
      // 4T-000607 (Epic 3E-000114): die Format-Toolbar direkt hinter den
      // uebrigen Editier-Zugaengen (loest dieselben Format-, Absatz-,
      // Einfuege- und Link-Kommandos aus wie das Kontextmenue).
      'help.feature.formatToolbar',
      // 4T-000603 (Epic 3E-000113): Link-Einfügen in die Auswahl — Editier-
      // Automatik beim Einfügen, hinter den übrigen Editier-Zugängen.
      'help.feature.pasteLink',
    ],
  },
  {
    groupKey: 'help.group.view',
    features: [
      'help.feature.viewModes',
      // 4T-000085 (Epic 3E-000014): Live-Modus als vierter View-Modus.
      'help.feature.livePreview',
      // 4T-001050 (Epic 3E-000151): Mindmap als fuenfter View-Modus samt ihren
      // Darstellungs-Optionen, direkt hinter dem Live-Modus (gleiche Familie).
      'help.feature.mindmap',
      'help.feature.mindmapDisplay',
      'help.feature.sourceToggles',
      // 4T-000290 (Epic 3E-000051): dynamische Sidebar (Seite, Reihenfolge,
      // Reiter-Gruppen) — Ansicht-Eigenschaft, die Panels selbst bleiben
      // in der Navigations-Gruppe.
      'help.feature.sidebarLayout',
      // 4T-000373 (Epic 3E-000069): Darstellung der Panel-Überschriften, direkt
      // hinter der Anordnung (beides Sidebar-Konfiguration).
      'help.feature.sidebarIconHeadings',
      // 4T-000475 (Epic 3E-000088): manuell einstellbare Panel-Höhen, direkt hinter
      // der Sidebar-Anordnung (beide steuern das Layout der Seitenleiste).
      'help.feature.panelHeights',
      // 4T-000856 (Epic 3E-000164): Bezugsgröße dieser Höhen (einzelnes Panel oder
      // Reiter-Gruppe), unmittelbar hinter den Höhen selbst.
      'help.feature.panelHeightMode',
      // 4T-000570 (Epic 3E-000104): Reihenfolge der Panel-Zugänge (Untermenü und
      // Statusbar-Leiste) — Anordnungs-Eigenschaft wie sidebarLayout/
      // panelHeights, die Panels selbst bleiben in der Navigations-Gruppe.
      'help.feature.panelToggleOrder',
      // 4T-000627 (Epic 3E-000119): benannte Sidebar-Varianten direkt hinter den
      // übrigen Anordnungs-Eigenschaften (Snapshots genau dieser Anordnung).
      'help.feature.sidebarVariants',
      // 4T-000699 (Epic 3E-000141): Ein-/Ausklappen ganzer Sidebar-Spalten direkt
      // hinter den übrigen Sidebar-Eigenschaften (Zustand über der Panel-
      // Sichtbarkeit, je Editor-Spalte).
      'help.feature.sidebarCollapse',
      // 4T-000523 (Epic 3E-000094): nutzerdefinierte Statusbar-Zugaenge direkt
      // hinter der Panel-Zugangs-Reihenfolge (gleiche Statusbar-Familie).
      'help.feature.statusbarCommandButtons',
      'help.feature.statusbarHideList',
      'help.feature.foldGutter',
      // 4T-000573 (Epic 3E-000105): dokument-gebundene Editor-Ansicht-Schalter
      // direkt hinter dem Gliederungs-Folding (gleiche Schalter-Familie).
      'help.feature.editorViewSettings',
      // 4T-000579 (Epic 3E-000106): Hervorhebung der Cursor-Zeile, direkt hinter
      // den uebrigen Editor-Ansicht-Schaltern.
      'help.feature.activeLine',
      'help.feature.zoom',
      // 4T-000384 (Epic 3E-000072): Inhalts-Breite der gerenderten Ansicht
      // direkt hinter dem Zoom (beides Größen-Steuerung der Ansicht).
      'help.feature.contentWidth',
      // 4T-000837 (Epic 3E-000161): Schriftart und -größe direkt hinter der
      // Inhalts-Breite — dieselbe Einstellungs-Gruppe „Darstellung", und
      // fachlich die dritte Größen-Steuerung neben Zoom und Breite.
      'help.feature.fonts',
      'help.feature.settings',
      'help.feature.focusMode',
      'help.feature.typewriterScroll',
      // 4T-000072 (Epic 3E-000013): Word Count in der Statusbar mit Detail-Dialog.
      'help.feature.wordCount',
      // 4T-000372 (Epic 3E-000069): Uhr-Panel direkt hinter der Wort-Statistik —
      // beides reine Anzeige-Funktionen ohne Dokument-Bezug.
      'help.feature.clock',
      // 4T-000373 (Epic 3E-000069): die drei Zeit-Werkzeuge des Uhr-Panels
      // schließen direkt an die Uhr an.
      'help.feature.clockAlarms',
      'help.feature.clockTimers',
      // 4T-000752 (Epic 3E-000146): Monatskalender als fuenfter Modus, direkt
      // hinter den uebrigen Zeit-Werkzeugen des Panels.
      'help.feature.clockCalendar',
      // 4T-000028 (Render-Lift 0.10.0): drei neue Features im Render-Pane.
      'help.feature.codeHighlight',
      'help.feature.katex',
      'help.feature.mermaid',
      // 4T-000065 (Epic 3E-000012): Scroll-Synchronisation in der Split-Ansicht.
      'help.feature.scrollSync',
      // 4T-000285 (Epic 3E-000050): Frontmatter-Zeile im Gerenderten.
      'help.feature.frontmatterDisplay',
      'help.feature.headingNumbering',
    ],
  },
  {
    groupKey: 'help.group.navigation',
    features: [
      'help.feature.tabs',
      // 4T-000676 (Epic 3E-000130): Einfuege-Position neuer Reiter direkt hinter
      // dem Tab-Eintrag — sie gilt mit UND ohne Gruppen und steht deshalb vor
      // dem Gruppen-Eintrag.
      'help.feature.tabPlacement',
      // 4T-000462 (Epic 3E-000085): Tab-Gruppen direkt hinter dem Tab-Eintrag
      // (Struktur desselben Tab-Streifens).
      'help.feature.tabGroups',
      // 4T-000769 (Epic 3E-000158): Mehrfach-Auswahl unmittelbar hinter den
      // Gruppen — sie ist die Geste, mit der Mengen in Gruppen bewegt werden.
      'help.feature.tabSelection',
      // 4T-000579 (Epic 3E-000106): Ecken-Form der Reiter, direkt hinter den
      // Tab-Eintraegen (dieselbe Leiste, reine Darstellungs-Option).
      'help.feature.roundedTabs',
      'help.feature.multiWindow',
      // 4T-000321 (Epic 3E-000057): logische Applikationen (Mehrfachstart).
      'help.feature.multiApp',
      // 4T-000326 (Epic 3E-000058): Bereiche und Zuletzt-geoeffnete-Bereiche.
      'help.feature.area',
      'help.feature.recentAreas',
      // 4T-001366 (Epic 3E-000171): Start-Seite eines Bereichs, direkt hinter den
      // Bereichs-Einstiegen — sie wirkt genau in dem Moment, den jene eroeffnen.
      'help.feature.areaStartPage',
      // 4T-000632 (Epic 3E-000102): mitgelieferte Demo-Area, direkt hinter den
      // Bereichs-Einstiegen (sie erzeugt und oeffnet einen Bereich).
      'help.feature.demoArea',
      // 4T-000329 (Epic 3E-000059): Bereichs-Panel (Ordnerbaum plus Dateiliste).
      'help.feature.areaPanel',
      // 4T-000437 (Epic 3E-000081): Kalender-Panel der Journale, direkt hinter
      // dem Bereichs-Panel (beide bereichsgebundene Einstiegs-Panels).
      'help.feature.journalCalendar',
      // 4T-000621 (Epic 3E-000117): Bereichs-Statistik schliesst den Block der
      // bereichsgebundenen Eintraege ab — sie wertet genau den Datei-Raum
      // aus, den die Eintraege davor eroeffnen und anzeigen.
      'help.feature.areaStats',
      'help.feature.outline',
      'help.feature.backlinks',
      // 4T-000073 (Epic 3E-000013): Outgoing-Links-Sidebar.
      'help.feature.outgoingLinks',
      // 4T-000457 (Epic 3E-000084): Graphenansicht — beide Formen direkt hinter
      // den Link-Beziehungs-Panels (Backlinks/Outgoing-Links).
      'help.feature.areaGraph',
      'help.feature.fileGraph',
      // 4T-000052 (Epic 3E-000010): Aliases als alternative Wiki-Link-Ziele.
      'help.feature.aliases',
      // 4T-000058 (Epic 3E-000011): Wiki-Link-Anker, Wiki-Embeds und Tag-System.
      'help.feature.wikiLinkAnchors',
      'help.feature.wikiEmbeds',
      // 4T-000342 (Epic 3E-000061): Unterseiten direkt im Vernetzungs-Cluster
      // hinter Wiki-Links/Embeds.
      'help.feature.subpages',
      'help.feature.subpagesNavigation',
      'help.feature.tags',
      'help.feature.anchorLinks',
      'help.feature.links',
      // 4T-000075/4T-000078/4T-000079 (Epic 3E-000013): Lesezeichen-Sidebar mit
      // Tree-Struktur, Ordnern und Drag-and-Drop.
      'help.feature.bookmarks',
      // 4T-000613 (Epic 3E-000115): Bereichs-Lesezeichen direkt hinter den
      // allgemeinen Lesezeichen (zweiter Abschnitt desselben Panels).
      'help.feature.areaBookmarks',
    ],
  },
  {
    groupKey: 'help.group.general',
    features: [
      'help.feature.theme',
      // 4T-000467 (Epic 3E-000086): Farbschemas neben Theme (app-weite Darstellung).
      'help.feature.colorSchemes',
      'help.feature.languages',
      'help.feature.menuBar',
      // 4T-000209 (Epic 3E-000015): konfigurierbare Tastenkuerzel als
      // app-weite Eigenschaft, neben Theme/Sprachen/Menueleiste.
      'help.feature.customHotkeys',
      // 4T-000523 (Epic 3E-000094): Makros als app-weite Bedien-Eigenschaft
      // neben den konfigurierbaren Tastenkuerzeln (Registrierungs-Kniff:
      // jedes Makro ist ein regulaeres Kommando).
      'help.feature.macros',
      // 4T-000296 (Epic 3E-000052): das Erweiterungs-System als app-weite
      // Eigenschaft (Schalten interner Erweiterungen).
      'help.feature.extensions',
      // 4T-000301 (Epic 3E-000053): externe Erweiterungen (Installieren,
      // Vertrauens-Ablauf, Erweiterungs-API) direkt neben dem internen
      // Erweiterungs-Eintrag.
      'help.feature.extensionsExternal',
      // 4T-000892 (Epic 3E-000168, Befund L-10): das Erstellen eigener externer
      // Erweiterungen hatte eine Handbuch-Seite, aber keinen Katalog-Eintrag.
      // Direkt hinter dem Eintrag zu den externen Erweiterungen, deren
      // Entwickler-Sicht er bildet.
      'help.feature.extensionsDev',
      // 4T-000216 (Epic 3E-000042): das Handbuch selbst als Katalog-Eintrag.
      'help.feature.manual',
      // 4T-001090 (Epic 3E-000127): die Produkt-Tour direkt hinter dem Handbuch-
      // Eintrag. Beide sind Hilfe-Zugaenge ohne eigene Syntax und ohne
      // Konfiguration; die Tour fuehrt vor, was das Handbuch erklaert.
      'help.feature.tour',
    ],
  },
];

module.exports = { HELP_FEATURE_GROUPS };
