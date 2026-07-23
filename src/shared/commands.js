// 4T-0207 (Epic 3E-0015): Zentrale Kommando-Registry.
//
// Single Source of Truth fuer alle konfigurierbaren Tastenkuerzel der App.
// Reine Daten plus reine Funktionen (CJS, ohne DOM- und ohne Electron-
// Abhaengigkeit), damit Main (Menue-Accelerators) und Renderer (Tastatur-
// Dispatcher, Hilfe-Tabelle, Settings-UI) dieselbe Quelle lesen. Muster
// analog src/shared/callouts.js und src/shared/markdown/**.
//
// Speicher-Format der Bindings: key-basierte Electron-Accelerator-Strings
// (z.B. 'CmdOrCtrl+Shift+I', 'F3', 'CmdOrCtrl+Plus'). Bewusst NICHT der
// physische `code` (Epic-Vorueberlegung verworfen): Electron-Menue-
// Accelerators sind key-basiert, und der bisherige Renderer-Vergleich
// matcht ebenfalls `e.key` (deckt z.B. '+' auf deutscher Tastatur,
// englischer Tastatur und Numpad gleichermassen ab, Kommentar 4T-0017).
//
// User-Overrides liegen in electron-store unter dem EINEN Key 'hotkeys'
// als flaches Objekt { [commandId]: acceleratorString }. Leerer String =
// bewusst entbunden. Hinweis: pro-Kommando-Keys wie 'hotkeys.file.save'
// scheiden aus, weil electron-store Punkt-Pfade verschachtelt und die
// Kommando-IDs selbst Punkte tragen.
'use strict';

// Die fuenf Kategorie-Keys entsprechen den Hilfe-Dialog-Gruppen.
const COMMAND_CATEGORIES = [
  'help.group.file',
  'help.group.editing',
  'help.group.view',
  'help.group.navigation',
  'help.group.general',
];

// Registry aller Kommandos. Felder pro Eintrag:
//   id              Namespace.kommandoName, stabil (Persistenz-Schluessel).
//   defaultBindings Array (Laenge 0 oder 1) von Accelerator-Strings.
//                   Array-Form bereitet spaetere Mehrfach-Bindings vor.
//   labelKey        Anzeigename fuer die Settings-Tabelle (Bestands-Key
//                   aus menu.* wo vorhanden, sonst command.*).
//   descKey         Beschreibung fuer die Hilfe-Tabelle (help.shortcut.*);
//                   null = Kommando erscheint nicht in der Hilfe.
//   categoryKey     eine der fuenf Hilfe-Gruppen (Settings-Gruppierung).
//   menu            true = hat einen Menue-Eintrag (Accelerator-Anzeige).
//   editorScoped    true = wirkt als CodeMirror-Keymap im Editor (Fold-
//                   Kommandos), nicht ueber den globalen Dispatcher.
//
// Die Array-Reihenfolge bestimmt die Zeilen-Reihenfolge der generierten
// Hilfe-Tabelle (Eintraege mit gleichem descKey buendeln in eine Zeile)
// und die Reihenfolge innerhalb der Settings-Gruppen (4T-0208).
const COMMANDS = [
  {
    id: 'file.newTab',
    defaultBindings: ['CmdOrCtrl+N'],
    labelKey: 'menu.file.new',
    descKey: 'help.shortcut.newTab',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0319 (Epic 3E-0057): neue logische Applikation. Bewusst ohne
  // Default-Binding — der Menue-Weg genuegt, ein Kuerzel ist ueber die
  // Einstellungen belegbar.
  {
    id: 'app.newApplication',
    defaultBindings: [],
    labelKey: 'menu.file.newApp',
    descKey: 'help.shortcut.newApp',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'file.open',
    defaultBindings: ['CmdOrCtrl+O'],
    labelKey: 'menu.file.open',
    descKey: 'help.shortcut.openFile',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0338 (Epic 3E-0061): Unterseite zur aktiven Datei anlegen. Ohne
  // Default-Binding (Menue-Weg; Kuerzel ueber die Einstellungen belegbar).
  {
    id: 'file.newSubpage',
    defaultBindings: [],
    labelKey: 'menu.file.newSubpage',
    descKey: 'help.shortcut.newSubpage',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0426 (Epic 3E-0080): neue Datei aus Vorlage (Auswahl-Popup, Platz-
  // halter-Dialoge). Ohne Default-Binding (Menue-Weg; Kuerzel belegbar).
  {
    id: 'file.newFromTemplate',
    defaultBindings: [],
    labelKey: 'menu.file.newFromTemplate',
    descKey: 'help.shortcut.newFromTemplate',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0426 (Epic 3E-0080): Vorlage an der Cursor-Position einfuegen. Kein
  // Menueleisten-Eintrag (Zugang: Editor-Kontextmenue, Kuerzel belegbar);
  // Guards wie edit.insertTimestamp (nur editierbare Ansichten).
  {
    id: 'edit.insertTemplate',
    defaultBindings: [],
    labelKey: 'command.edit.insertTemplate',
    descKey: 'help.shortcut.insertTemplate',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  // 4T-0512 (Epic 3E-0092): leeren Ereignis-Block an der Cursor-Position
  // einfuegen. Kein Menueleisten-Eintrag (Zugang: Kommando-Palette, Kuerzel
  // belegbar); Guards wie edit.insertTemplate (nur editierbare Ansichten).
  // Bei deaktivierter Erweiterung "Ereignisse" gefiltert (Manifest).
  // 4T-0546 (Epic 3E-0097): Kalender-Datum einfügen — öffnet den Picker
  // für benutzerdefinierte Kalender und fügt den kanonischen Wert
  // @{Kalendername: Wert} am Cursor ein. Ohne Default-Kürzel (Palette;
  // Kürzel per Einstellungen belegbar); aktiv nur bei Bereich mit
  // mindestens einem Kalender (Verfügbarkeits-Regel der Palette).
  {
    id: 'calendar.insertValue',
    defaultBindings: [],
    labelKey: 'command.calendar.insertValue',
    descKey: 'help.shortcut.insertCalendarValue',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'edit.insertEvents',
    defaultBindings: [],
    labelKey: 'command.edit.insertEvents',
    descKey: 'help.shortcut.insertEvents',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  // 4T-0433 (Epic 3E-0081): heutigen Journal-Eintrag oeffnen bzw. anlegen
  // (bei mehreren Tages-Journalen Auswahl-Popup). Ohne Default-Binding
  // (Menue-Weg; Kuerzel per Einstellungen belegbar).
  {
    id: 'journal.openToday',
    defaultBindings: [],
    labelKey: 'menu.file.journalToday',
    descKey: 'help.shortcut.journalToday',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0433 (Epic 3E-0081): Journal-Eintrag fuer ein gewaehltes Datum
  // (Datums-Dialog, dann Journal-Auswahl).
  {
    id: 'journal.openForDate',
    defaultBindings: [],
    labelKey: 'menu.file.journalForDate',
    descKey: 'help.shortcut.journalForDate',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0322 (Epic 3E-0058): Bereich oeffnen/schliessen. Ohne Default-
  // Bindings (Menue-Weg; Kuerzel per Einstellungen belegbar).
  {
    id: 'area.open',
    defaultBindings: [],
    labelKey: 'menu.file.openArea',
    descKey: 'help.shortcut.openArea',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'area.close',
    defaultBindings: [],
    labelKey: 'menu.file.closeArea',
    descKey: 'help.shortcut.closeArea',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0632 (Epic 3E-0102): mitgelieferte Demo-Area in einen leeren Ordner
  // kopieren und als Bereich oeffnen. Ohne Default-Binding (Menue-Weg;
  // Kuerzel per Einstellungen belegbar); Teil der Erweiterung demo-area.
  {
    id: 'area.createDemo',
    defaultBindings: [],
    labelKey: 'menu.file.createDemoArea',
    descKey: 'help.shortcut.createDemoArea',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Lebenszyklus. Alle vier ohne
  // Default-Bindings (Menue-Weg; Kuerzel per Einstellungen belegbar);
  // Verfuegbarkeits-Dimmung in der Palette (saveAs nur ohne bestehende
  // Zuordnung, close nur im Arbeitsbereichs-Fenster).
  {
    id: 'workspace.saveAs',
    defaultBindings: [],
    labelKey: 'menu.file.workspaceSaveAs',
    descKey: 'help.shortcut.workspaceSaveAs',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'workspace.create',
    defaultBindings: [],
    labelKey: 'menu.file.workspaceCreate',
    descKey: 'help.shortcut.workspaceCreate',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'workspace.close',
    defaultBindings: [],
    labelKey: 'menu.file.workspaceClose',
    descKey: 'help.shortcut.workspaceClose',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'workspace.manage',
    defaultBindings: [],
    labelKey: 'menu.file.workspaceManage',
    descKey: 'help.shortcut.workspaceManage',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'tab.close',
    defaultBindings: ['CmdOrCtrl+W'],
    labelKey: 'command.tab.close',
    descKey: 'help.shortcut.closeTab',
    categoryKey: 'help.group.navigation',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'file.save',
    defaultBindings: ['CmdOrCtrl+S'],
    labelKey: 'menu.file.save',
    descKey: 'help.shortcut.save',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'file.saveAs',
    defaultBindings: ['CmdOrCtrl+Shift+S'],
    labelKey: 'menu.file.saveAs',
    descKey: 'help.shortcut.saveAs',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0339 (Epic 3E-0061): aktive Datei umbenennen (inkl. Unterseiten-
  // Kaskade aus 4T-0340). Ohne Default-Binding (Menue-/Kontextmenue-Weg).
  {
    id: 'file.rename',
    defaultBindings: [],
    labelKey: 'menu.file.rename',
    descKey: 'help.shortcut.renameFile',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  // 4T-0303 (Epic 3E-0054): PDF-Export des gerenderten Inhalts. Umschalt-
  // Modifier, weil Strg+P im Edit-Modus von CodeMirror gegrabbt wird
  // (Begruendung aus 4T-0024 uebernommen).
  {
    id: 'file.exportPdf',
    defaultBindings: ['CmdOrCtrl+Shift+P'],
    labelKey: 'menu.file.exportPdf',
    descKey: 'help.shortcut.exportPdf',
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'app.openSettings',
    defaultBindings: ['CmdOrCtrl+,'],
    labelKey: 'menu.file.settings',
    descKey: 'help.shortcut.openSettings',
    categoryKey: 'help.group.general',
    menu: true,
    editorScoped: false,
  },
  {
    // 4T-0333 (Epic 3E-0060): Historien-Ansicht des aktiven Dokuments als
    // read-only System-Seite; bewusst ohne Default-Binding.
    id: 'history.open',
    defaultBindings: [],
    labelKey: 'menu.view.history',
    descKey: 'help.shortcut.openHistory',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    // 4T-0455 (Epic 3E-0084): Bereichs-Graph als read-only System-Seite;
    // bewusst ohne Default-Binding (Menue-Weg; Kuerzel belegbar). Nur bei
    // aktivem Bereich aktiv (Menue-Guard hasArea plus Renderer-Guard).
    id: 'graph.openArea',
    defaultBindings: [],
    labelKey: 'menu.view.areaGraph',
    descKey: 'help.shortcut.areaGraph',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleEdit',
    defaultBindings: ['CmdOrCtrl+E'],
    labelKey: 'menu.view.edit',
    descKey: 'help.shortcut.toggleEdit',
    categoryKey: 'help.group.editing',
    menu: true,
    editorScoped: false,
  },
  // Neues Kommando (Epic 3E-0015): Lokalzeit-Timestamp an der Cursor-
  // Position. Kein Menue-Eintrag (die App hat kein Bearbeiten-Menue).
  {
    id: 'edit.insertTimestamp',
    defaultBindings: ['CmdOrCtrl+Shift+D'],
    labelKey: 'command.edit.insertTimestamp',
    descKey: 'help.shortcut.insertTimestamp',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  // 4T-0486 (Epic 3E-0091): Datums-/Uhrzeit-Picker in drei Varianten
  // (Schalter-Vorbelegung: beide / nur Datum / nur Uhrzeit). Strg+Alt+T/D/U
  // gegen die Registry als frei verifiziert; T, D und U tragen auf
  // deutschem Layout keine AltGr-Drittbelegung (AltGr normalisiert der
  // Dispatcher zu Strg+Alt). Kein Menue-Eintrag (Muster insertTimestamp);
  // Kommandos gehoeren zur Erweiterung 'date-picker' (extensions.js).
  {
    id: 'edit.insertDateTime',
    defaultBindings: ['CmdOrCtrl+Alt+T'],
    labelKey: 'command.edit.insertDateTime',
    descKey: 'help.shortcut.insertDateTime',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'edit.insertDate',
    defaultBindings: ['CmdOrCtrl+Alt+D'],
    labelKey: 'command.edit.insertDate',
    descKey: 'help.shortcut.insertDate',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'edit.insertTime',
    defaultBindings: ['CmdOrCtrl+Alt+U'],
    labelKey: 'command.edit.insertTime',
    descKey: 'help.shortcut.insertTime',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  // 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog — auf einer Task-Zeile
  // bearbeitend, auf einer leeren Zeile anlegend. Kuerzel Strg+Alt+A
  // (konfliktfrei gegen Registry und FIXED_BINDINGS verifiziert, per
  // Einstellungen umbelegbar); Editor-Aufloesung und Guards wie die
  // Picker-Kommandos.
  {
    id: 'task.editDialog',
    defaultBindings: ['CmdOrCtrl+Alt+A'],
    labelKey: 'command.task.editDialog',
    descKey: 'help.shortcut.taskEditDialog',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  // 4T-0528 (Epic 3E-0095): Erinnerung setzen — Picker (Datum plus Uhrzeit)
  // auf der Checkbox-Zeile, setzt oder aktualisiert den ⏰-Marker. Kuerzel
  // Strg+Alt+R (konfliktfrei gegen Registry und FIXED_BINDINGS verifiziert,
  // per Einstellungen umbelegbar); Muster task.editDialog.
  {
    id: 'task.setReminder',
    defaultBindings: ['CmdOrCtrl+Alt+R'],
    labelKey: 'command.task.setReminder',
    descKey: 'help.shortcut.taskSetReminder',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'view.modeRendered',
    defaultBindings: ['CmdOrCtrl+1'],
    labelKey: 'menu.view.rendered',
    descKey: 'help.shortcut.viewModes',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.modeSplit',
    defaultBindings: ['CmdOrCtrl+2'],
    labelKey: 'menu.view.split',
    descKey: 'help.shortcut.viewModes',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.modeSource',
    defaultBindings: ['CmdOrCtrl+3'],
    labelKey: 'menu.view.source',
    descKey: 'help.shortcut.viewModes',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.modeLive',
    defaultBindings: ['CmdOrCtrl+4'],
    labelKey: 'menu.view.live',
    descKey: 'help.shortcut.livePreview',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'zoom.in',
    defaultBindings: ['CmdOrCtrl+Plus'],
    labelKey: 'command.zoom.in',
    descKey: 'help.shortcut.zoom',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'zoom.out',
    defaultBindings: ['CmdOrCtrl+-'],
    labelKey: 'command.zoom.out',
    descKey: 'help.shortcut.zoom',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'zoom.reset',
    defaultBindings: ['CmdOrCtrl+0'],
    labelKey: 'command.zoom.reset',
    descKey: 'help.shortcut.zoom',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'view.toggleFocusMode',
    defaultBindings: ['CmdOrCtrl+Shift+F'],
    labelKey: 'menu.view.focusMode',
    descKey: 'help.shortcut.focusMode',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleOutline',
    defaultBindings: ['CmdOrCtrl+Shift+I'],
    labelKey: 'menu.view.outline',
    descKey: 'help.shortcut.toggleOutline',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleOutgoingLinks',
    defaultBindings: ['CmdOrCtrl+Shift+O'],
    labelKey: 'menu.view.outgoingLinks',
    descKey: 'help.shortcut.toggleOutgoingLinks',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleBacklinks',
    defaultBindings: ['CmdOrCtrl+Shift+B'],
    labelKey: 'menu.view.backlinks',
    descKey: 'help.shortcut.toggleBacklinks',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0341 (Epic 3E-0061): Unterseiten-Sektion toggeln. Ohne Default-
  // Binding (Menue-Weg; Kuerzel ueber die Einstellungen belegbar).
  {
    id: 'view.toggleSubpages',
    defaultBindings: [],
    labelKey: 'menu.view.subpages',
    descKey: 'help.shortcut.toggleSubpages',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Sektion toggeln. Ohne Default-
  // Binding (Menue-Weg; Kuerzel ueber die Einstellungen belegbar).
  {
    id: 'view.toggleGraphPanel',
    defaultBindings: [],
    labelKey: 'menu.view.fileGraph',
    descKey: 'help.shortcut.toggleFileGraph',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Sektion toggeln. Ohne Default-
  // Binding (Menue-/Statusbar-Weg; Kuerzel ueber die Einstellungen belegbar).
  {
    id: 'view.toggleReminders',
    defaultBindings: [],
    labelKey: 'menu.view.reminders',
    descKey: 'help.shortcut.toggleReminders',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0567 (Epic 3E-0104): Bereichs- und Kalender-Panel toggeln — Zugangs-
  // Symmetrie aller Sidebar-Panels (Panel-Untermenue, Palette, belegbares
  // Kuerzel). Ohne Default-Binding.
  {
    id: 'view.toggleAreaPanel',
    defaultBindings: [],
    labelKey: 'areaPanel.title',
    descKey: 'help.shortcut.toggleAreaPanel',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleCalendarPanel',
    defaultBindings: [],
    labelKey: 'calendar.title',
    descKey: 'help.shortcut.toggleCalendarPanel',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0372 (Epic 3E-0069): Uhr-Panel toggeln. Ohne Default-Binding
  // (Menue-/Statusbar-Weg; Kuerzel ueber die Einstellungen belegbar) —
  // Muster der uebrigen Panel-Toggles.
  {
    id: 'view.toggleClock',
    defaultBindings: [],
    labelKey: 'clock.panel.title',
    descKey: 'help.shortcut.toggleClock',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0697 (Epic 3E-0141): linke bzw. rechte Sidebar-Spalte der aktiven
  // Editor-Spalte als Ganzes ein-/ausklappen. Ohne Default-Binding (Menü-
  // und Palette-Weg; Kürzel über die Einstellungen belegbar), Muster
  // view.toggleAreaPanel. descKey-Beschreibung und der Funktions-Katalog-
  // Eintrag entstehen im Hilfe- und Handbuch-Task 4T-0699.
  {
    id: 'view.toggleSidebarLeft',
    defaultBindings: [],
    labelKey: 'menu.view.collapseSidebarLeft',
    descKey: 'help.shortcut.toggleSidebarLeft',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleSidebarRight',
    defaultBindings: [],
    labelKey: 'menu.view.collapseSidebarRight',
    descKey: 'help.shortcut.toggleSidebarRight',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'file.bookmarkAdd',
    defaultBindings: ['CmdOrCtrl+D'],
    labelKey: 'menu.file.bookmarks.add',
    descKey: 'help.shortcut.addBookmark',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleBookmarks',
    defaultBindings: ['CmdOrCtrl+Shift+L'],
    labelKey: 'menu.view.bookmarks',
    descKey: 'help.shortcut.toggleBookmarks',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // Kategorie editing analog zum Feature-Eintrag help.feature.properties
  // (Frontmatter-Pflege ist Bearbeitungs-Funktionalitaet).
  {
    id: 'view.toggleProperties',
    defaultBindings: ['CmdOrCtrl+;'],
    labelKey: 'menu.view.properties',
    descKey: 'help.shortcut.toggleProperties',
    categoryKey: 'help.group.editing',
    menu: true,
    editorScoped: false,
  },
  // 4T-0359 (Epic 3E-0066): Notizen-Sidebar-Sektion toggeln. Ohne Default-
  // Binding (Menue-Weg; Kuerzel ueber die Einstellungen belegbar, wie Unterseiten).
  {
    id: 'view.toggleNotes',
    defaultBindings: [],
    labelKey: 'menu.view.notes',
    descKey: 'help.shortcut.toggleNotes',
    categoryKey: 'help.group.editing',
    menu: true,
    editorScoped: false,
  },
  // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Sidebar-Sektion toggeln. Ohne
  // Default-Binding (Menue-Weg; Kuerzel ueber die Einstellungen belegbar).
  {
    id: 'view.toggleBlockProps',
    defaultBindings: [],
    labelKey: 'menu.view.blockProps',
    descKey: 'help.shortcut.toggleBlockProps',
    categoryKey: 'help.group.editing',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleTags',
    defaultBindings: ['CmdOrCtrl+Shift+T'],
    labelKey: 'menu.view.tags',
    descKey: 'help.shortcut.toggleTags',
    categoryKey: 'help.group.navigation',
    menu: true,
    editorScoped: false,
  },
  // 4T-0624 (Epic 3E-0119): benannte Sidebar-Varianten. Speichern friert
  // Anordnung und Panel-Sichtbarkeit ein, Anwenden waehlt ueber ein
  // Listen-Popup; beide ohne Default-Binding, per Settings belegbar.
  {
    id: 'sidebar.saveVariant',
    defaultBindings: [],
    labelKey: 'menu.view.sidebarLayoutSave',
    descKey: 'help.shortcut.saveSidebarVariant',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'sidebar.applyVariant',
    defaultBindings: [],
    labelKey: 'command.applySidebarVariant',
    descKey: 'help.shortcut.applySidebarVariant',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'editor.fold',
    defaultBindings: ['CmdOrCtrl+Shift+['],
    labelKey: 'command.editor.fold',
    descKey: 'help.shortcut.foldRegion',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'editor.unfold',
    defaultBindings: ['CmdOrCtrl+Shift+]'],
    labelKey: 'command.editor.unfold',
    descKey: 'help.shortcut.unfoldRegion',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'editor.foldAll',
    defaultBindings: ['CmdOrCtrl+Alt+['],
    labelKey: 'command.editor.foldAll',
    descKey: 'help.shortcut.foldAll',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'editor.unfoldAll',
    defaultBindings: ['CmdOrCtrl+Alt+]'],
    labelKey: 'command.editor.unfoldAll',
    descKey: 'help.shortcut.foldAll',
    categoryKey: 'help.group.view',
    menu: false,
    editorScoped: true,
  },
  // 4T-0378 (Epic 3E-0071): Zeichen-Format- und Link-Kommandos. editorScoped
  // (wirken als CodeMirror-Keymap im Editor), ohne Menüleisten-Eintrag —
  // Zugang über Editor-Kontextmenü und Hotkey. Nur Fett/Kursiv tragen ein
  // Default-Binding (Strg+B/Strg+I, gegen die Registry als frei verifiziert);
  // die übrigen sind über die Einstellungen belegbar.
  {
    id: 'format.bold',
    defaultBindings: ['CmdOrCtrl+B'],
    labelKey: 'command.format.bold',
    descKey: 'help.shortcut.formatBold',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.italic',
    defaultBindings: ['CmdOrCtrl+I'],
    labelKey: 'command.format.italic',
    descKey: 'help.shortcut.formatItalic',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.strikethrough',
    defaultBindings: [],
    labelKey: 'command.format.strikethrough',
    descKey: 'help.shortcut.formatStrikethrough',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.highlight',
    defaultBindings: [],
    labelKey: 'command.format.highlight',
    descKey: 'help.shortcut.formatHighlight',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.code',
    defaultBindings: [],
    labelKey: 'command.format.code',
    descKey: 'help.shortcut.formatCode',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.math',
    defaultBindings: [],
    labelKey: 'command.format.math',
    descKey: 'help.shortcut.formatMath',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.comment',
    defaultBindings: [],
    labelKey: 'command.format.comment',
    descKey: 'help.shortcut.formatComment',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'format.clear',
    defaultBindings: [],
    labelKey: 'command.format.clear',
    descKey: 'help.shortcut.formatClear',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'link.insertWiki',
    defaultBindings: [],
    labelKey: 'command.link.insertWiki',
    descKey: 'help.shortcut.linkWiki',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'link.insertExternal',
    defaultBindings: [],
    labelKey: 'command.link.insertExternal',
    descKey: 'help.shortcut.linkExternal',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  // 4T-0379 (Epic 3E-0071): Absatz- und Einfüge-Kommandos. editorScoped, ohne
  // Menüleisten-Eintrag und ohne Default-Binding (über die Einstellungen
  // belegbar); Zugang über das Editor-Kontextmenü.
  {
    id: 'paragraph.bulletList',
    defaultBindings: [],
    labelKey: 'command.paragraph.bulletList',
    descKey: 'help.shortcut.paragraphBulletList',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.orderedList',
    defaultBindings: [],
    labelKey: 'command.paragraph.orderedList',
    descKey: 'help.shortcut.paragraphOrderedList',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.taskList',
    defaultBindings: [],
    labelKey: 'command.paragraph.taskList',
    descKey: 'help.shortcut.paragraphTaskList',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  // 4T-0599 (Epic 3E-0112): Listenpunkt samt Unterpunkten verschieben.
  // Alt+Pfeil ist gegen Registry und FIXED_BINDINGS als frei verifiziert.
  // Der defaultKeymap bindet dieselbe Kombination auf moveLineUp/-Down; das
  // commandKeymap-Compartment steht davor und gewinnt, und der Handler faellt
  // ausserhalb von Listen bewusst an die Standard-Belegung durch (ein
  // Kuerzel, kontextabhaengige Wirkung). Beide Kommandos teilen sich einen
  // descKey und stehen damit in einer Zeile der Kuerzel-Seite.
  {
    id: 'list.moveUp',
    defaultBindings: ['Alt+Up'],
    labelKey: 'command.list.moveUp',
    descKey: 'help.shortcut.listMove',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'list.moveDown',
    defaultBindings: ['Alt+Down'],
    labelKey: 'command.list.moveDown',
    descKey: 'help.shortcut.listMove',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  // 4T-0600 (Epic 3E-0112): Listenpunkt samt Unterpunkten auswaehlen.
  // Bewusst ohne Default-Kuerzel (Kommando-Palette; Kuerzel belegbar).
  {
    id: 'list.selectSubtree',
    defaultBindings: [],
    labelKey: 'command.list.selectSubtree',
    descKey: 'help.shortcut.listSelectSubtree',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.heading1',
    defaultBindings: [],
    labelKey: 'command.paragraph.heading1',
    descKey: 'help.shortcut.paragraphHeading1',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.heading2',
    defaultBindings: [],
    labelKey: 'command.paragraph.heading2',
    descKey: 'help.shortcut.paragraphHeading2',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.heading3',
    defaultBindings: [],
    labelKey: 'command.paragraph.heading3',
    descKey: 'help.shortcut.paragraphHeading3',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.heading4',
    defaultBindings: [],
    labelKey: 'command.paragraph.heading4',
    descKey: 'help.shortcut.paragraphHeading4',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.heading5',
    defaultBindings: [],
    labelKey: 'command.paragraph.heading5',
    descKey: 'help.shortcut.paragraphHeading5',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.heading6',
    defaultBindings: [],
    labelKey: 'command.paragraph.heading6',
    descKey: 'help.shortcut.paragraphHeading6',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.noHeading',
    defaultBindings: [],
    labelKey: 'command.paragraph.noHeading',
    descKey: 'help.shortcut.paragraphNoHeading',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'paragraph.quote',
    defaultBindings: [],
    labelKey: 'command.paragraph.quote',
    descKey: 'help.shortcut.paragraphQuote',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'insert.footnote',
    defaultBindings: [],
    labelKey: 'command.insert.footnote',
    descKey: 'help.shortcut.insertFootnote',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'insert.table',
    defaultBindings: [],
    labelKey: 'command.insert.table',
    descKey: 'help.shortcut.insertTable',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'insert.callout',
    defaultBindings: [],
    labelKey: 'command.insert.callout',
    descKey: 'help.shortcut.insertCallout',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'insert.horizontalRule',
    defaultBindings: [],
    labelKey: 'command.insert.horizontalRule',
    descKey: 'help.shortcut.insertHorizontalRule',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'insert.codeBlock',
    defaultBindings: [],
    labelKey: 'command.insert.codeBlock',
    descKey: 'help.shortcut.insertCodeBlock',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  // 4T-0590 (Epic 3E-0109): Tabellen-Operationen des Kontextmenü-Untermenüs
  // „Tabelle" (Erweiterung table-tools). Ein Kommando-Satz für beide
  // Tabellenarten (Pipe-Tabelle und Perspective Table); die Ausführung
  // erkennt die Tabellenart am Cursor-Kontext. Ohne Standard-Kürzel,
  // über Palette und Kontextmenü erreichbar, mit Kürzeln belegbar.
  {
    id: 'table.alignLeft',
    defaultBindings: [],
    labelKey: 'command.table.alignLeft',
    descKey: 'help.shortcut.tableAlignLeft',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.alignCenter',
    defaultBindings: [],
    labelKey: 'command.table.alignCenter',
    descKey: 'help.shortcut.tableAlignCenter',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.alignRight',
    defaultBindings: [],
    labelKey: 'command.table.alignRight',
    descKey: 'help.shortcut.tableAlignRight',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.rowUp',
    defaultBindings: [],
    labelKey: 'command.table.rowUp',
    descKey: 'help.shortcut.tableRowUp',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.rowDown',
    defaultBindings: [],
    labelKey: 'command.table.rowDown',
    descKey: 'help.shortcut.tableRowDown',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.rowInsert',
    defaultBindings: [],
    labelKey: 'command.table.rowInsert',
    descKey: 'help.shortcut.tableRowInsert',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.rowDelete',
    defaultBindings: [],
    labelKey: 'command.table.rowDelete',
    descKey: 'help.shortcut.tableRowDelete',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.colLeft',
    defaultBindings: [],
    labelKey: 'command.table.colLeft',
    descKey: 'help.shortcut.tableColLeft',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.colRight',
    defaultBindings: [],
    labelKey: 'command.table.colRight',
    descKey: 'help.shortcut.tableColRight',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.colInsert',
    defaultBindings: [],
    labelKey: 'command.table.colInsert',
    descKey: 'help.shortcut.tableColInsert',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.colDelete',
    defaultBindings: [],
    labelKey: 'command.table.colDelete',
    descKey: 'help.shortcut.tableColDelete',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'table.transpose',
    defaultBindings: [],
    labelKey: 'command.table.transpose',
    descKey: 'help.shortcut.tableTranspose',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: true,
  },
  {
    id: 'tab.next',
    defaultBindings: ['CmdOrCtrl+Tab'],
    labelKey: 'command.tab.next',
    descKey: 'help.shortcut.switchTab',
    categoryKey: 'help.group.navigation',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'tab.prev',
    defaultBindings: ['CmdOrCtrl+Shift+Tab'],
    labelKey: 'command.tab.prev',
    descKey: 'help.shortcut.switchTab',
    categoryKey: 'help.group.navigation',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'tab.moveRight',
    defaultBindings: ['CmdOrCtrl+Alt+Right'],
    labelKey: 'command.tab.moveRight',
    descKey: 'help.shortcut.moveTab',
    categoryKey: 'help.group.navigation',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'tab.moveLeft',
    defaultBindings: ['CmdOrCtrl+Alt+Left'],
    labelKey: 'command.tab.moveLeft',
    descKey: 'help.shortcut.moveTab',
    categoryKey: 'help.group.navigation',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'search.open',
    defaultBindings: ['CmdOrCtrl+F'],
    labelKey: 'command.search.open',
    descKey: 'help.shortcut.openSearch',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'search.openReplace',
    defaultBindings: ['CmdOrCtrl+H'],
    labelKey: 'command.search.openReplace',
    descKey: 'help.shortcut.searchReplace',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'search.next',
    defaultBindings: ['F3'],
    labelKey: 'command.search.next',
    descKey: 'help.shortcut.searchNav',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'search.prev',
    defaultBindings: ['Shift+F3'],
    labelKey: 'command.search.prev',
    descKey: 'help.shortcut.searchNav',
    categoryKey: 'help.group.editing',
    menu: false,
    editorScoped: false,
  },
  {
    id: 'help.open',
    defaultBindings: ['F1'],
    labelKey: 'menu.help.help',
    descKey: 'help.shortcut.openHelp',
    categoryKey: 'help.group.general',
    menu: true,
    editorScoped: false,
  },
  {
    // 4T-0480 (Epic 3E-0089): Kommando-Palette. CmdOrCtrl+K ist am Bestand
    // konfliktfrei (Registry, FIXED_BINDINGS und CodeMirror-defaultKeymap
    // auf Windows; CmdOrCtrl+Shift+P gehoert dem PDF-Export, CmdOrCtrl+P
    // grabbt CodeMirror im Edit-Modus, siehe 4T-0024).
    id: 'app.commandPalette',
    defaultBindings: ['CmdOrCtrl+K'],
    labelKey: 'menu.view.commandPalette',
    descKey: 'help.shortcut.commandPalette',
    categoryKey: 'help.group.general',
    menu: true,
    editorScoped: false,
  },
  // Menue-Kommandos ohne Default-Binding (Entscheidungspunkt 4 aus
  // 4T-0207): in der Settings-UI bindbar, ohne Hilfe-Zeile (descKey null,
  // Kommandos ohne Binding erscheinen dort ohnehin nicht).
  {
    id: 'file.toggleAutoSave',
    defaultBindings: [],
    labelKey: 'menu.file.autoSave',
    descKey: null,
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'app.toggleRestoreSession',
    defaultBindings: [],
    labelKey: 'menu.help.restoreSession',
    descKey: null,
    categoryKey: 'help.group.file',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleScrollSync',
    defaultBindings: [],
    labelKey: 'menu.view.scrollSync',
    descKey: null,
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleFoldGutter',
    defaultBindings: [],
    labelKey: 'menu.view.foldGutter',
    descKey: 'help.shortcut.toggleFoldGutter',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleLineNumbers',
    defaultBindings: [],
    labelKey: 'menu.view.lineNumbers',
    descKey: 'help.shortcut.toggleLineNumbers',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleWordWrap',
    defaultBindings: [],
    labelKey: 'menu.view.wordWrap',
    descKey: 'help.shortcut.toggleWordWrap',
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
  {
    id: 'view.toggleTypewriterScroll',
    defaultBindings: [],
    labelKey: 'menu.view.typewriterScroll',
    descKey: null,
    categoryKey: 'help.group.view',
    menu: true,
    editorScoped: false,
  },
];

// --- Binding-Normalisierung ---------------------------------------------------
// Kanonisches Match-Format: 'Ctrl+Alt+Shift+KEY' (Modifier in fixer
// Reihenfolge, Buchstaben gross, benannte Tasten in kanonischer Schreibung).
// Sowohl Accelerator-Strings aus der Registry/dem Store als auch keydown-
// Events werden auf dieses Format abgebildet; der Dispatcher vergleicht
// per O(1)-Map-Lookup.

const MODIFIER_ALIASES = new Map([
  ['cmdorctrl', 'ctrl'],
  ['commandorcontrol', 'ctrl'],
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  // Windows-only-App: Cmd/Super/Meta werden pragmatisch wie Ctrl behandelt,
  // damit fremd geschriebene Accelerators nicht stillschweigend zerfallen.
  ['cmd', 'ctrl'],
  ['command', 'ctrl'],
  ['super', 'ctrl'],
  ['meta', 'ctrl'],
  ['alt', 'alt'],
  ['altgr', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
]);

// Kanonische Schreibweise benannter Tasten (Match-Format). Einzelzeichen
// laufen separat (Grossschreibung).
const KEY_ALIASES = new Map([
  ['plus', 'Plus'],
  ['space', 'Space'],
  ['esc', 'Escape'],
  ['escape', 'Escape'],
  ['return', 'Enter'],
  ['enter', 'Enter'],
  ['tab', 'Tab'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['del', 'Delete'],
  ['insert', 'Insert'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['arrowup', 'Up'],
  ['arrowdown', 'Down'],
  ['arrowleft', 'Left'],
  ['arrowright', 'Right'],
]);

// Zerlegt einen Binding-String an '+', wobei ein literales '+' als Taste
// erhalten bleibt ('Ctrl++' -> ['Ctrl', '+']).
function splitBindingTokens(binding) {
  const raw = String(binding == null ? '' : binding);
  const tokens = [];
  let cur = '';
  for (const ch of raw) {
    if (ch === '+') {
      if (cur === '') {
        tokens.push('+');
      } else {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur !== '') tokens.push(cur);
  return tokens;
}

function canonicalKeyName(token) {
  const lower = token.toLowerCase();
  if (KEY_ALIASES.has(lower)) return KEY_ALIASES.get(lower);
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();
  if (token.length === 1) {
    if (token === '+') return 'Plus';
    return token.toUpperCase();
  }
  return token;
}

// Accelerator-/Binding-String -> kanonisches Match-Format oder null bei
// leerem/unbrauchbarem Eintrag (z.B. nur Modifier).
function normalizeBinding(binding) {
  const tokens = splitBindingTokens(binding);
  if (tokens.length === 0) return null;
  let ctrl = false;
  let alt = false;
  let shift = false;
  let key = null;
  for (const token of tokens) {
    const mod = MODIFIER_ALIASES.get(token.toLowerCase());
    if (mod === 'ctrl') ctrl = true;
    else if (mod === 'alt') alt = true;
    else if (mod === 'shift') shift = true;
    else key = canonicalKeyName(token);
  }
  if (!key) return null;
  return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '') + key;
}

// Tasten, die fuer sich genommen reine Modifier sind: keydown-Events dazu
// ergeben kein Binding.
const MODIFIER_EVENT_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'AltGraph',
  'OS',
  'Hyper',
  'Super',
]);

// keydown-Event -> kanonisches Match-Format (identisch zum Ergebnis von
// normalizeBinding) oder null bei reinem Modifier-Druck.
function eventToBinding(e) {
  if (!e || typeof e.key !== 'string' || e.key === '') return null;
  if (MODIFIER_EVENT_KEYS.has(e.key)) return null;
  let key = e.key;
  if (key === ' ') key = 'Space';
  else key = canonicalKeyName(key);
  const ctrl = !!(e.ctrlKey || e.metaKey);
  const alt = !!e.altKey;
  const shift = !!e.shiftKey;
  return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '') + key;
}

// Symbol-Tasten brauchen je nach Layout Shift (z.B. '+' auf englischer
// Tastatur als Shift+'='). Fuer solche Events versucht der Dispatcher
// zusaetzlich einen Lookup ohne Shift-Modifier — das erhaelt das bisherige
// Verhalten der Zoom-Hotkeys (4T-0017) layoutunabhaengig.
function isShiftSymbolEvent(e) {
  return (
    !!e &&
    !!e.shiftKey &&
    typeof e.key === 'string' &&
    e.key.length === 1 &&
    !/^[a-zA-Z0-9]$/.test(e.key)
  );
}

function stripShiftFromBinding(normalized) {
  return String(normalized || '').replace('Shift+', '');
}

// --- Dynamische Kommandos (4T-0299, Epic 3E-0053) ---------------------------------
// Externe Erweiterungen registrieren Kommandos zur Laufzeit (Host in
// extension-host.js). Die Eintraege wandern in DIESELBE COMMANDS-Liste —
// Dispatcher-Map, Editor-Keymap, Tastenkuerzel-Editor und mergeBindings
// iterieren die Liste live und ziehen ohne Sonderpfad nach. Konventionen:
// IDs im Namensraum 'ext.<erweiterungs-id>.<name>' (kollisionsfrei zu den
// eingebauten Namespaces), kein Menue-Eintrag (menu:false, das Menue baut
// der Main aus seiner eigenen Registry-Instanz), descKey null (die
// generierte Tastenkuerzel-Seite listet nur eingebaute Kommandos; die
// Kuerzel externer Erweiterungen verwaltet der Tastenkuerzel-Editor).
// Handler-Zuordnung bleibt Renderer-Sache (commandHandlers in app-init).
// 4T-0522 (Epic 3E-0094): zweiter dynamischer Namensraum 'macro.<id>' fuer
// die Makros der Kommando-Platzierung (Registrierung in macros.js) — der
// Registrierungs-Kniff macht Makros ohne Sonderpfad kuerzel-, paletten-
// und platzierbar.
function registerDynamicCommand(def) {
  if (!def || typeof def.id !== 'string') return false;
  if (!def.id.startsWith('ext.') && !def.id.startsWith('macro.')) return false;
  if (typeof def.labelKey !== 'string' || def.labelKey === '') return false;
  const defaults = Array.isArray(def.defaultBindings)
    ? def.defaultBindings.filter((b) => typeof b === 'string' && normalizeBinding(b) !== null)
    : [];
  unregisterDynamicCommand(def.id);
  COMMANDS.push({
    id: def.id,
    defaultBindings: defaults.slice(0, 1),
    labelKey: def.labelKey,
    descKey: null,
    categoryKey: 'help.group.general',
    menu: false,
    editorScoped: false,
    dynamic: true,
  });
  return true;
}

function unregisterDynamicCommand(id) {
  const idx = COMMANDS.findIndex((c) => c.id === id && c.dynamic === true);
  if (idx >= 0) COMMANDS.splice(idx, 1);
  return idx >= 0;
}

// --- Merge-Logik ----------------------------------------------------------------
// Effektive Bindings = Registry-Defaults ueberlagert mit User-Overrides
// ({ [commandId]: acceleratorString }; leerer String = entbunden).
// Unbekannte Kommando-IDs und Nicht-String-Werte im Store werden ignoriert.
function mergeBindings(overrides) {
  const src =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  const result = {};
  for (const cmd of COMMANDS) {
    const ov = Object.prototype.hasOwnProperty.call(src, cmd.id) ? src[cmd.id] : undefined;
    if (typeof ov === 'string') {
      result[cmd.id] = ov === '' ? [] : [ov];
    } else {
      result[cmd.id] = cmd.defaultBindings.slice();
    }
  }
  return result;
}

// Fuer die Menue-Factory: { [commandId]: acceleratorString } fuer alle
// Menue-Kommandos; leerer String = Eintrag ohne Accelerator.
function effectiveMenuAccelerators(overrides) {
  const merged = mergeBindings(overrides);
  const out = {};
  for (const cmd of COMMANDS) {
    if (!cmd.menu) continue;
    const bindings = merged[cmd.id];
    out[cmd.id] = bindings.length > 0 ? bindings[0] : '';
  }
  return out;
}

// --- Anzeige-Konvertierung -------------------------------------------------------
// Binding -> deutscher Anzeige-String fuer die bestehende Hilfe-Pipeline
// (splitShortcutKeys + localizeKey in autocomplete-help.js uebersetzen die
// deutschen Tokens in die aktive Sprache). 'Ctrl+Shift+I' -> 'Strg+Umschalt+I',
// 'Ctrl+Plus' -> 'Strg++', 'Ctrl+Alt+Right' -> 'Strg+Alt+→'.
const DISPLAY_KEY_MAP = new Map([
  ['Plus', '+'],
  ['Right', '→'],
  ['Left', '←'],
  ['Up', '↑'],
  ['Down', '↓'],
  ['Escape', 'Esc'],
]);

function bindingToDisplayString(binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return '';
  const parts = [];
  let rest = normalized;
  if (rest.startsWith('Ctrl+')) {
    parts.push('Strg');
    rest = rest.slice(5);
  }
  if (rest.startsWith('Alt+')) {
    parts.push('Alt');
    rest = rest.slice(4);
  }
  if (rest.startsWith('Shift+')) {
    parts.push('Umschalt');
    rest = rest.slice(6);
  }
  parts.push(DISPLAY_KEY_MAP.has(rest) ? DISPLAY_KEY_MAP.get(rest) : rest);
  return parts.join('+');
}

// Binding -> CodeMirror-Keymap-Spezifikation ('Ctrl-Shift-[') fuer die
// editorScoped-Kommandos. Buchstaben klein (CM-Konvention), benannte
// Tasten in CM-Schreibweise (ArrowRight etc.).
const CM_KEY_MAP = new Map([
  ['Plus', '+'],
  ['Right', 'ArrowRight'],
  ['Left', 'ArrowLeft'],
  ['Up', 'ArrowUp'],
  ['Down', 'ArrowDown'],
]);

function acceleratorToCmKey(binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return null;
  const parts = [];
  let rest = normalized;
  if (rest.startsWith('Ctrl+')) {
    parts.push('Ctrl');
    rest = rest.slice(5);
  }
  if (rest.startsWith('Alt+')) {
    parts.push('Alt');
    rest = rest.slice(4);
  }
  if (rest.startsWith('Shift+')) {
    parts.push('Shift');
    rest = rest.slice(6);
  }
  let key = rest;
  if (CM_KEY_MAP.has(key)) key = CM_KEY_MAP.get(key);
  else if (/^[A-Z]$/.test(key)) key = key.toLowerCase();
  parts.push(key);
  return parts.join('-');
}

// --- Capture-Regeln und Konflikt-Erkennung (4T-0208) -------------------------------
// Fixe Nicht-Registry-Bindings: kontextgebundene App-Semantik (Esc-Kaskade,
// Listen-/Tabellen-Indent, Such-Enter). Beim Capture gelten sie als Konflikt
// und sind nur abbrechbar, nicht ueberschreibbar. Alt allein und Maus-
// Bindings koennen gar nicht erfasst werden (reiner Modifier bzw. kein
// Tastatur-Event) und brauchen keinen Eintrag.
const FIXED_BINDINGS = [
  { binding: 'Tab', descKey: 'help.shortcut.tabIndent' },
  { binding: 'Shift+Tab', descKey: 'help.shortcut.tabIndent' },
  { binding: 'Enter', descKey: 'help.shortcut.searchNavEnter' },
  { binding: 'Shift+Enter', descKey: 'help.shortcut.searchNavEnter' },
  { binding: 'Alt+Enter', descKey: 'help.shortcut.replaceAll' },
  { binding: 'Escape', descKey: 'help.shortcut.escape' },
];

// Sperr-Regel fuer das Capture (4T-0208, Entscheidungspunkt 3 als Regel
// statt erschoepfender Liste): ohne Strg- oder Alt-Modifier sind nur
// F-Tasten zulaessig. Modifierlose Zeichen-Tasten (auch mit Umschalt)
// wuerden das normale Tippen kapern; nacktes Tab/Esc/Enter faellt damit
// ebenfalls weg.
function isBindingCapturable(binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return false;
  let rest = normalized;
  let hasStrongModifier = false;
  if (rest.startsWith('Ctrl+')) {
    hasStrongModifier = true;
    rest = rest.slice(5);
  }
  if (rest.startsWith('Alt+')) {
    hasStrongModifier = true;
    rest = rest.slice(4);
  }
  if (rest.startsWith('Shift+')) rest = rest.slice(6);
  if (hasStrongModifier) return true;
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(rest);
}

// Prueft eine Ziel-Kombination gegen den Draft-Stand aller anderen
// Kommandos (effektive Bindings, { commandId: bindingString }) und die
// fixen Bindings. Liefert null (frei), { type: 'fixed', descKey } oder
// { type: 'command', commandId }; Selbst-Zuweisung ist kein Konflikt.
function findBindingConflict(draft, commandId, binding) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return null;
  for (const fixed of FIXED_BINDINGS) {
    if (normalizeBinding(fixed.binding) === normalized) {
      return { type: 'fixed', descKey: fixed.descKey };
    }
  }
  const src = draft && typeof draft === 'object' ? draft : {};
  for (const cmd of COMMANDS) {
    if (cmd.id === commandId) continue;
    const other = src[cmd.id];
    if (typeof other === 'string' && other !== '' && normalizeBinding(other) === normalized) {
      return { type: 'command', commandId: cmd.id };
    }
  }
  return null;
}

// 4T-0211 (Hotfix 0.28.1): Findet doppelt vergebene Bindings in einem
// Draft ({ commandId: bindingString }). Liefert Konflikt-Gruppen
// [{ binding: <normalisiert>, commandIds: [...] }]; leeres Array =
// konsistent. Entbundene Kommandos ('') und unbekannte IDs zaehlen nicht;
// verglichen wird normalisiert (Schreibweisen-unabhaengig). Dient als
// Apply-Sicherheitsnetz der Settings-UI, nachdem der Einzel-Reset einen
// Weg in den Duplikat-Zustand offen gelassen hatte.
function findDuplicateBindings(draft) {
  const src = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const byBinding = new Map();
  for (const cmd of COMMANDS) {
    const value = src[cmd.id];
    if (typeof value !== 'string' || value === '') continue;
    const normalized = normalizeBinding(value);
    if (!normalized) continue;
    if (!byBinding.has(normalized)) byBinding.set(normalized, []);
    byBinding.get(normalized).push(cmd.id);
  }
  const duplicates = [];
  for (const [binding, commandIds] of byBinding) {
    if (commandIds.length > 1) duplicates.push({ binding, commandIds });
  }
  return duplicates;
}

// --- Timestamp-Format -------------------------------------------------------------
// Lokalzeit-Timestamp 'yyyy-mm-dd hh:mm' fuer das Kommando
// edit.insertTimestamp. Bewusst Lokalzeit statt UTC: Notiz-Text in der
// Zeitrealitaet des Nutzers, keine persistierten Daten (Epic-Entscheidung;
// die UTC-Konvention der project-standards gilt hier nicht).
function formatTimestamp(date) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  COMMANDS,
  COMMAND_CATEGORIES,
  FIXED_BINDINGS,
  registerDynamicCommand,
  unregisterDynamicCommand,
  normalizeBinding,
  eventToBinding,
  isShiftSymbolEvent,
  stripShiftFromBinding,
  mergeBindings,
  effectiveMenuAccelerators,
  bindingToDisplayString,
  acceleratorToCmKey,
  isBindingCapturable,
  findBindingConflict,
  findDuplicateBindings,
  formatTimestamp,
};
