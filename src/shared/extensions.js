// 4T-0292 (Epic 3E-0052): Erweiterungs-Registry mit Manifest-Modell.
//
// Single Source of Truth für die internen Erweiterungen der App: jede
// abschaltbare Bestands-Funktion beschreibt sich hier deklarativ (ID,
// Name-/Beschreibungs-Keys, Kategorie, Abhängigkeiten, Kommando-IDs).
// Einstellungs-UI (Bereich „Erweiterungen"), Pipeline-Aufbau (markdown.js),
// Kommando-Filterung (Dispatcher, Menü, Handbuch-Generatoren) und die
// erweiterungs-eigenen Einstellungs-Bereiche lesen aus dieser einen Quelle.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM) — Main (Menü-Filterung), Preload (Pipeline-Neuaufbau) und
// Renderer (Lebenszyklus, Settings-UI) laden dasselbe Modul. Bewusst ohne
// Importe aus App-Modulen: Code-Hooks mit App-Abhängigkeit (CodeMirror-
// Extensions, UI-Mounts) hängen zur Laufzeit am Renderer-Lebenszyklus-
// Modul (attach-Muster, Begründung im Kopf-Kommentar von
// sidebar-layout.js), die markdown-it-Plugin-Zuordnung lebt bei ihrer
// Implementierung in markdown.js.
//
// Wirk-Semantik der Persistenz: der Store-Key 'extensions.disabled'
// (EXTENSIONS_DISABLED_KEY) trägt NUR die vom Nutzer bewusst
// deaktivierten IDs. Abhängige Erweiterungen deaktivieren sich effektiv
// mit (effectiveDisabledSet), behalten aber ihren eigenen Schalter-Stand —
// beim Wiedereinschalten der Abhängigkeit kehren sie automatisch zurück.
// Default ist die leere Liste: alle Erweiterungen an, Verhalten identisch
// zum Stand vor dem Erweiterungs-System.
//
// Kern-Abgrenzung: was hier nicht registriert ist, ist Kern und nicht
// abschaltbar (isExtensionId liefert false, unbekannte IDs in der
// Disabled-Liste werden beim Normalisieren verworfen). Damit ist technisch
// ausgeschlossen, dass die App in einen funktionsunfähigen Zustand
// geschaltet wird.
'use strict';

// Store-Schlüssel der Disabled-Liste (electron-store nestet den Punkt-Pfad
// zu { extensions: { disabled: [...] } }; gelesen wird er über denselben
// Punkt-Pfad — bewusst konsistent zu den übrigen Settings-Keys).
const EXTENSIONS_DISABLED_KEY = 'extensions.disabled';

// Kategorien in Anzeige-Reihenfolge des Einstellungs-Bereichs. Betrifft
// nur interne Erweiterungen; externe tragen die eigene Kategorie
// EXTERNAL_CATEGORY und erscheinen ausschließlich im Bereich
// „Erweiterungen (extern)" (4T-0300).
const EXTENSION_CATEGORIES = ['render', 'linking', 'tools'];

// 4T-0299 (Epic 3E-0053): Kategorie- und Herkunfts-Kennzeichnung externer
// Erweiterungen. Sie registrieren sich zur Laufzeit an derselben Registry
// und demselben Lebenszyklus wie die internen (Epic-Architekturentscheidung);
// der Unterschied liegt im Laden (fremder Code aus dem Dateisystem, Host in
// extension-host.js) und in der Persistenz-Semantik (eigene Enabled-Liste
// mit invertiertem Default, src/shared/extensions-external.js — externe IDs
// gehören NIE in extensions.disabled).
const EXTERNAL_CATEGORY = 'external';

// Manifest-Felder pro Erweiterung:
//   id            stabile Kennung (kebab-case; Persistenz-Schlüssel in
//                 extensions.disabled).
//   category      'render' | 'linking' | 'tools' (EXTENSION_CATEGORIES).
//   nameKey       i18n-Key des Anzeige-Namens (extension.<id>.name).
//   descKey       i18n-Key der Kurzbeschreibung (extension.<id>.description).
//   dependencies  optionale Liste von Erweiterungs-IDs; ist eine davon
//                 deaktiviert, ist diese Erweiterung effektiv mit-deaktiviert.
//   commands      optionale Liste von Kommando-IDs (src/shared/commands.js),
//                 die bei deaktivierter Erweiterung aus Dispatcher, Menü,
//                 Editor-Keymap und Handbuch-Generatoren gefiltert werden.
//   featureKeys   optionale Liste von Funktions-Katalog-Schlüsseln
//                 (help.feature.*), die diese Erweiterung trägt. Nötig nur
//                 bei gebündelten Erweiterungen mit eigenen extension.*-Texten;
//                 wo der descKey selbst ein Katalog-Schlüssel ist, ergibt sich
//                 die Zuordnung daraus (4T-0941, Grundlage der Kennzeichnung
//                 auf der generierten Funktions-Seite).
//   settingsSections  optionale Liste von Bereichs-IDs der Einstellungs-
//                 Seite (settings-page.js), die zu dieser Erweiterung
//                 gehören: sie erscheinen nur bei aktiver Erweiterung in
//                 der Bereichsnavigation; ihre persistierten Werte bleiben
//                 beim Abschalten erhalten (4T-0295).
//
// Die Reihenfolge innerhalb einer Kategorie bestimmt die Zeilen-Reihenfolge
// im Einstellungs-Bereich.
//
// nameKey/descKey referenzieren die bestehenden Funktions-Katalog-Keys
// (help.featureName.* / help.feature.*), wo die Erweiterung 1:1 einem
// Katalog-Eintrag entspricht — keine duplizierten Übersetzungen; nur
// gebündelte Erweiterungen ohne 1:1-Eintrag erhalten eigene
// extension.*-Keys.
//
// Zuschnitt der Render-Erweiterungen (4T-0293): pro Katalog-Funktion eine
// Erweiterung; gebündelt sind nur (a) 'figures' (Bild-Größen und Implicit
// Figures — beide verändern die Bild-Darstellung und greifen ineinander:
// das Größen-Suffix sitzt am selben Bild, das die Figure wrappt),
// (b) 'typography' (Tief-/Hochstellen und Unterstreichen — drei kleine
// Inline-Konstrukte derselben Familie, einzeln wären es Mikro-Schalter)
// und (c) 'attributes' (Bracketed Spans und Heading-Attribute — beide
// hängen technisch am selben attrs-Plugin und sind nicht unabhängig
// schaltbar). 'task-states' (erweiterte Task-Status) ist EINE Erweiterung
// für Rendering und Verwaltung (der Einstellungs-Bereich Task-Status
// docken in 4T-0295 hier an); die Basis-Checkboxen `[ ]`/`[x]` bleiben
// Kern.
const INTERNAL_EXTENSIONS = [
  {
    id: 'callouts',
    category: 'render',
    nameKey: 'help.featureName.callouts',
    descKey: 'help.feature.callouts',
  },
  {
    id: 'custom-containers',
    category: 'render',
    nameKey: 'help.featureName.customContainers',
    descKey: 'help.feature.customContainers',
  },
  {
    id: 'highlight',
    category: 'render',
    nameKey: 'help.featureName.highlight',
    descKey: 'help.feature.highlight',
  },
  {
    id: 'footnotes',
    category: 'render',
    nameKey: 'help.featureName.footnotes',
    descKey: 'help.feature.footnotes',
  },
  {
    id: 'emoji',
    category: 'render',
    nameKey: 'help.featureName.emoji',
    descKey: 'help.feature.emoji',
  },
  {
    id: 'abbreviations',
    category: 'render',
    nameKey: 'help.featureName.abbreviations',
    descKey: 'help.feature.abbreviations',
  },
  {
    id: 'figures',
    category: 'render',
    nameKey: 'extension.figures.name',
    descKey: 'extension.figures.description',
    featureKeys: ['help.feature.imageSize', 'help.feature.implicitFigures'],
  },
  {
    id: 'definition-lists',
    category: 'render',
    nameKey: 'help.featureName.definitionLists',
    descKey: 'help.feature.definitionLists',
  },
  {
    id: 'line-blocks',
    category: 'render',
    nameKey: 'help.featureName.lineBlocks',
    descKey: 'help.feature.lineBlocks',
  },
  {
    id: 'typography',
    category: 'render',
    nameKey: 'extension.typography.name',
    descKey: 'extension.typography.description',
    featureKeys: ['help.feature.subSup', 'help.feature.insertion'],
  },
  {
    id: 'attributes',
    category: 'render',
    nameKey: 'extension.attributes.name',
    descKey: 'extension.attributes.description',
    featureKeys: ['help.feature.headingAttributes'],
  },
  {
    id: 'spoiler',
    category: 'render',
    nameKey: 'help.featureName.spoiler',
    descKey: 'help.feature.spoiler',
  },
  {
    id: 'critic-markup',
    category: 'render',
    nameKey: 'help.featureName.criticMarkup',
    descKey: 'help.feature.criticMarkup',
  },
  {
    // 4T-0479 (Epic 3E-0089): %%-Kommentare — privater Text zwischen
    // %%-Markern, in keiner Ansicht und keinem Export sichtbar. Aus-
    // Zustand: %% bleibt Literal (kein Strippen, keine Editor-Einfaerbung).
    id: 'comments',
    category: 'render',
    nameKey: 'help.featureName.comments',
    descKey: 'help.feature.comments',
  },
  {
    // 4T-0470 (Epic 3E-0087): Gliederungs-Nummerierung — automatische
    // Ueberschriften-Nummern als Anzeige-Praefix samt Zeilenende-Markern
    // {-}/{+}. Aus-Zustand (Erweiterungs-Pruefschritt 2026-07-12): keine
    // Nummern, Marker bleiben Literal-Text (Plugin nicht registriert, kein
    // Strip in Render/Live/Portable); der Einstellungs-Bereich
    // "headingNumbering" (4T-0471) blendet sich mit aus.
    id: 'heading-numbering',
    category: 'render',
    nameKey: 'help.featureName.headingNumbering',
    descKey: 'help.feature.headingNumbering',
    settingsSections: ['headingNumbering'],
  },
  {
    id: 'task-states',
    category: 'render',
    nameKey: 'help.featureName.taskStates',
    descKey: 'help.feature.taskStates',
    // 4T-0295: der bestehende Einstellungs-Bereich Task-Status ist der
    // erste erweiterungs-eigene Bereich (Epic-Architekturentscheidung).
    settingsSections: ['taskStates'],
  },
  {
    id: 'perspective-table',
    category: 'render',
    nameKey: 'help.featureName.perspectiveTable',
    descKey: 'help.feature.perspectiveTable',
  },
  // 4T-0417 (Epic 3E-0079): Perspective Datatable als schaltbare Render-
  // Erweiterung (PO-Festlegung aus der Test-Iteration vom 2026-07-09;
  // zugleich Anlass für den Erweiterungs-Prüfschritt in der CLAUDE.md).
  {
    id: 'perspective-datatable',
    category: 'render',
    nameKey: 'help.featureName.datatable',
    descKey: 'help.feature.datatable',
  },
  // 4T-0595 (Epic 3E-0111): Inline-Berechnungen `{= Ausdruck =}` — neues
  // Markdown-Konstrukt, damit schaltbar (Erweiterungs-Prüfschritt). Aus-
  // Zustand: die Marker bleiben regulärer Fließtext in allen Ansichten und
  // Exporten (Plugin nicht registriert). Direkt hinter der Datatable, weil
  // beide dieselbe Ausdrucks-Sprache der Perspective-Abfrage nutzen.
  {
    id: 'inline-calc',
    category: 'render',
    nameKey: 'help.featureName.inlineCalc',
    descKey: 'help.feature.inlineCalc',
  },
  {
    id: 'katex',
    category: 'render',
    nameKey: 'help.featureName.katex',
    descKey: 'help.feature.katex',
  },
  {
    id: 'mermaid',
    category: 'render',
    nameKey: 'help.featureName.mermaid',
    descKey: 'help.feature.mermaid',
  },
  {
    id: 'code-highlight',
    category: 'render',
    nameKey: 'help.featureName.codeHighlight',
    descKey: 'help.feature.codeHighlight',
  },
  // Vernetzungs-Erweiterungen (4T-0294). 'wiki-links' umfasst die
  // Link-Syntax samt Ankern, Block-Ankern und die beiden Panels
  // Ausgehende Links/Backlinks (deren Auswertung ist Wiki-Syntax-
  // Auswertung); 'wiki-embeds' ist getrennt schaltbar und haengt an
  // 'wiki-links'. 'autocomplete' ist eigenstaendig — seine Trigger
  // pruefen zur Laufzeit den Zustand von wiki-links bzw. tags (eine
  // harte Abhaengigkeit auf BEIDE wuerde das Abschalten von nur einem
  // faelschlich das ganze Autocomplete kosten).
  {
    id: 'wiki-links',
    category: 'linking',
    nameKey: 'extension.wiki-links.name',
    descKey: 'extension.wiki-links.description',
    featureKeys: [
      'help.feature.wikiLinkAnchors',
      'help.feature.blockAnchors',
      'help.feature.outgoingLinks',
      'help.feature.backlinks',
    ],
    // 4T-0567 (Epic 3E-0104): view.toggleSubpages gehoert zur Wiki-Link-
    // Auswertung (Panel-getVisible prueft wiki-links seit 4T-0341) — vorher
    // lief das unless()-Gate des Menue-Eintrags ins Leere und Menue/Palette
    // boten das Panel auch bei deaktivierter Erweiterung an.
    commands: ['view.toggleOutgoingLinks', 'view.toggleBacklinks', 'view.toggleSubpages'],
  },
  {
    id: 'wiki-embeds',
    category: 'linking',
    nameKey: 'help.featureName.wikiEmbeds',
    descKey: 'help.feature.wikiEmbeds',
    dependencies: ['wiki-links'],
  },
  {
    id: 'tags',
    category: 'linking',
    nameKey: 'help.featureName.tags',
    descKey: 'help.feature.tags',
    commands: ['view.toggleTags'],
  },
  {
    id: 'autocomplete',
    category: 'linking',
    nameKey: 'help.featureName.autocomplete',
    descKey: 'help.feature.autocomplete',
  },
  // 4T-0456 (Epic 3E-0084): Graphenansicht als schaltbare Vernetzungs-
  // Erweiterung (Erweiterungs-Pruefschritt vom 2026-07-10, dokumentiert im
  // Epic). Buendelt Bereichs-Graph-Tab und Datei-Graph-Panel — gebuendelte
  // Erweiterung mit eigenen extension.*-Keys (kein 1:1-Katalog-Eintrag).
  // Bewusst OHNE Abhaengigkeit auf 'wiki-links': der Link-Graph wertet
  // Wiki- UND Markdown-Links aus dem Kern-Link-Index aus. Im Aus-Zustand
  // entfallen beide Kommandos (Menue, Dispatcher, Handbuch-Generatoren),
  // das Panel ist ausgeblendet und das Bereichs-Panel-Kontextmenue zeigt
  // keinen Graph-Eintrag.
  {
    id: 'graph-view',
    category: 'linking',
    nameKey: 'extension.graph-view.name',
    descKey: 'extension.graph-view.description',
    featureKeys: ['help.feature.areaGraph', 'help.feature.fileGraph'],
    commands: ['graph.openArea', 'view.toggleGraphPanel'],
  },
  // Werkzeug-Erweiterungen (4T-0294). 'focus-mode' buendelt Fokus-Modus
  // und Typewriter-Scroll (eine Schreib-Umgebung, zwei Facetten).
  {
    id: 'linter',
    category: 'tools',
    nameKey: 'help.featureName.linter',
    descKey: 'help.feature.linter',
  },
  // 4T-0581 (Epic 3E-0107): Rechtschreibpruefung des Betriebssystems
  // (Erweiterungs-Pruefschritt des Epics: abgrenzbare Zusatz-Funktion,
  // Leitlinie "im Zweifel schaltbar"). Direkt hinter dem Linter, weil beide
  // Maengel im Editor markieren. Ohne commands-Liste: die Funktion wirkt
  // ueber ein Content-Attribut und das Kontextmenue, eigene Registry-
  // Kommandos hat sie nicht. Im Aus-Zustand entfaellt der Einstellungs-
  // Bereich, das Content-Attribut faellt auf den CodeMirror-Standard
  // zurueck (keine Pruefung) und das Kontextmenue zeigt keine Vorschlags-
  // Sektion; der Schalter-Stand bleibt gespeichert.
  {
    id: 'spellcheck',
    category: 'tools',
    nameKey: 'help.featureName.spellcheck',
    descKey: 'help.feature.spellcheck',
    settingsSections: ['spellcheck'],
  },
  // 4T-0620 (Epic 3E-0117): Bereichs-Statistik als schaltbares Zusatz-
  // Werkzeug (Erweiterungs-Pruefschritt des Epics). Ein Katalog-Eintrag
  // steht ihr gegenueber, deshalb die help.*-Keys statt eigener
  // extension.*-Keys (Muster linter, bookmarks). Im Aus-Zustand entfallen
  // Kommando, Menue-Eintrag, Kontextmenue-Eintrag des Bereichs-Panels und
  // der Eintrag der generierten Tastenkuerzel-Seite.
  {
    id: 'area-stats',
    category: 'tools',
    nameKey: 'help.featureName.areaStats',
    descKey: 'help.feature.areaStats',
    commands: ['stats.openArea'],
  },
  {
    id: 'bookmarks',
    category: 'tools',
    nameKey: 'help.featureName.bookmarks',
    descKey: 'help.feature.bookmarks',
    commands: ['file.bookmarkAdd', 'view.toggleBookmarks'],
  },
  // 4T-0849 (Epic 3E-0147): Bücher als schaltbare Werkzeug-Erweiterung
  // (Entscheidung 7 des Konzept-Protokolls vom 2026-08-03, Story S-0758).
  // Ab Werk eingeschaltet wie jede interne Erweiterung (Default ist die leere
  // Disabled-Liste). Direkt hinter den Lesezeichen, weil beide eine Ordnung
  // über bestehenden Dateien führen und ihr Panel zur selben Gruppe der
  // Sidebar gehört. Ein Buch bündelt Öffnen, Anlegen, Inhaltsverzeichnis,
  // Struktur-Pflege, Leseführung und Verschieben in EINER Erweiterung: die
  // Teile sind einzeln sinnlos, ein Buch ohne Inhaltsverzeichnis gäbe es
  // nicht. Katalog-Keys der Funktion statt eigener extension.*-Keys (Muster
  // bookmarks, area-stats).
  //
  // Im Aus-Zustand entfallen die sieben Kommandos (Datei-Menü, Palette,
  // Dispatcher, Editor-Keymap, generierte Tastenkürzel-Seite), über das
  // Erweiterungs-Gate des Panel-Zugangs-Modells (extensionId 'books' in
  // panel-access.js) zusätzlich Statusbar-Button und Untermenü-Eintrag des
  // Inhaltsverzeichnisses, und im Main die Buch-Erkennung beim Öffnen —
  // Buch-Dateien öffnen dann wie gewöhnliche Markdown-Dateien (Story S-0758,
  // AK2). Ohne settingsSections: einen eigenen Einstellungs-Bereich hat die
  // Erweiterung nicht. Daten-neutral: Buch-Datei, Begleitdatei und Kapitel
  // bleiben unangetastet, das Wieder-Einschalten bringt den Stand unverändert
  // zurück (AK3).
  {
    id: 'books',
    category: 'tools',
    nameKey: 'help.featureName.books',
    descKey: 'help.feature.books',
    commands: [
      'book.open',
      'book.create',
      'book.close',
      'book.nextChapter',
      'book.previousChapter',
      'book.moveChapterFile',
      'view.toggleBookPanel',
      // 4T-0867 (Epic 3E-0162): Buecherregale sind eine Stufe desselben
      // Funktionsblocks und laufen unter demselben Schalter (Epic-Entscheidung;
      // ein eigener Schalter erzeugte den Zustand "Regal an, Buecher aus").
      'shelf.open',
      'shelf.create',
      'shelf.close',
    ],
  },
  {
    id: 'focus-mode',
    category: 'tools',
    nameKey: 'extension.focus-mode.name',
    descKey: 'extension.focus-mode.description',
    featureKeys: ['help.feature.focusMode', 'help.feature.typewriterScroll'],
    commands: ['view.toggleFocusMode', 'view.toggleTypewriterScroll'],
  },
  // 4T-0697 (Epic 3E-0141): Sidebar-Spalten ein-/ausklappen als schaltbare
  // Werkzeug-Erweiterung (Erweiterungs-Prüfschritt des Epics: abgrenzbare
  // Komfort-Funktion, Leitlinie „im Zweifel schaltbar", direktes Vorbild
  // Fokus-Modus ist ebenfalls schaltbar). Gebündelte Erweiterung mit eigenen
  // extension.*-Keys. Im Aus-Zustand entfallen beide Kommandos (Menü, Palette,
  // Dispatcher) und ein gespeicherter Kollaps-Zustand wird beim Deaktivieren
  // aufgehoben (Laufzeit-Hook clearSidebarCollapsed in app-init.js), sodass
  // keine Spalte unbedienbar eingeklappt zurückbleibt.
  {
    id: 'sidebar-collapse',
    category: 'tools',
    nameKey: 'extension.sidebar-collapse.name',
    descKey: 'extension.sidebar-collapse.description',
    featureKeys: ['help.feature.sidebarCollapse'],
    commands: ['view.toggleSidebarLeft', 'view.toggleSidebarRight'],
  },
  // 4T-0599 (Epic 3E-0112): Struktur-Bearbeitung von Listen als schaltbare
  // Werkzeug-Erweiterung (Erweiterungs-Prüfschritt). Gebündelte Erweiterung
  // mit eigenen extension.*-Keys, weil sie mehrere Katalog-Funktionen
  // zusammenfasst. Im Aus-Zustand entfallen die beiden Verschiebe-Kommandos
  // (der Tastendruck fällt dann auf das zeilenweise Verschieben der
  // Standard-Belegung durch), und Tab/Umschalt+Tab rücken wieder zeilenweise
  // ein — exakt das Verhalten vor dieser Erweiterung.
  {
    id: 'outliner',
    category: 'tools',
    nameKey: 'extension.outliner.name',
    descKey: 'extension.outliner.description',
    featureKeys: ['help.feature.listOutline'],
    commands: ['list.moveUp', 'list.moveDown', 'list.selectSubtree'],
  },
  // 4T-0426 (Epic 3E-0080): Vorlagen als schaltbare Werkzeug-Erweiterung
  // (Architekturentscheidung 6 des Epics). Im Aus-Zustand entfallen beide
  // Kommandos (Menü, Dispatcher, Kontextmenü); der Einstellungs-Bereich
  // (4T-0428) und der Ordner-Regel-Trigger (4T-0427) docken hier an — die
  // Ordner-Regeln sind Teil derselben Erweiterung, kein eigener Schalter.
  {
    id: 'templates',
    category: 'tools',
    nameKey: 'help.featureName.templates',
    descKey: 'help.feature.templates',
    commands: ['file.newFromTemplate', 'edit.insertTemplate'],
    // 4T-0428: der Einstellungs-Bereich "Vorlagen" gehört zur Erweiterung
    // und erscheint nur bei aktivem Schalter (Muster taskStates).
    // 4T-0555 (Epic 3E-0100): dazu die abgespaltene Bereichs-Sektion.
    settingsSections: ['templates', 'templatesArea'],
  },
  // 4T-0433 (Epic 3E-0081): Journale als schaltbare Werkzeug-Erweiterung
  // (Architekturentscheidung 6 des Epics, Erweiterungs-Prüfschritt vom
  // 2026-07-09). Im Aus-Zustand entfallen beide Kommandos (Menü,
  // Dispatcher); Kalender-Panel (4T-0434), Navigations-Fence (4T-0435)
  // und Einstellungs-Bereich (4T-0436) docken hier an. Bewusst OHNE
  // Abhängigkeit auf 'templates': die Vorlagen-Kopplung der Journale
  // liegt auf Daten-Ebene (konfigurierte Journal-Vorlage), nicht auf
  // Kommando-Ebene.
  {
    id: 'journals',
    category: 'tools',
    nameKey: 'help.featureName.journals',
    descKey: 'help.feature.journals',
    commands: ['journal.openToday', 'journal.openForDate'],
    // 4T-0436: der Einstellungs-Bereich "Journale" gehört zur Erweiterung
    // und erscheint nur bei aktivem Schalter (Muster templates).
    settingsSections: ['journals'],
  },
  // 4T-0604 (Epic 3E-0113): Erstellungs- und Änderungszeitpunkt als schaltbare
  // Werkzeug-Erweiterung (Erweiterungs-Prüfschritt, PO-Festlegung vom
  // 2026-07-19). Bewusst abschaltbar, weil die Automatik beim Speichern das
  // Dokument verändert. Im Aus-Zustand läuft der Speicher-Hook nicht und der
  // Einstellungs-Bereich „Zeitstempel" entfällt; Dokumente bleiben beim
  // Speichern byte-identisch. Kein Kommando, die Funktion wirkt allein über
  // den Speicher-Pfad.
  {
    id: 'frontmatter-timestamps',
    category: 'tools',
    nameKey: 'help.featureName.frontmatterTimestamps',
    descKey: 'help.feature.frontmatterTimestamps',
    settingsSections: ['frontmatterTimestamps'],
  },
  // 4T-0546 (Epic 3E-0097): Kalender-Systeme als schaltbare Werkzeug-
  // Erweiterung (Workshop-Punkt 7). Gebündelte Erweiterung mit eigenen
  // extension.*-Keys (Einstellungs-Sektion, Picker, Wert-Syntax). Bewusst
  // OHNE Abhängigkeit auf 'date-picker': die Popup-Bausteine werden nur
  // auf Code-Ebene wiederverwendet, beide Funktionen sind unabhängig
  // schaltbar. Im Aus-Zustand bleiben @{…}-Werte unangetasteter Klartext
  // (keine Dekoration, kein Klick), Kommando und Einstellungs-Sektion
  // entfallen; die calendarSystems-Sektion der Bereichsdatei bleibt
  // unangetastet erhalten.
  {
    id: 'custom-calendars',
    category: 'tools',
    nameKey: 'extension.custom-calendars.name',
    descKey: 'extension.custom-calendars.description',
    featureKeys: ['help.feature.customCalendars', 'help.feature.derivedCalendars'],
    commands: ['calendar.insertValue'],
    settingsSections: ['calendarSystems'],
  },
  // 4T-0448 (Epic 3E-0083): Eigenschafts-Profile als schaltbare Werkzeug-
  // Erweiterung (Architekturentscheidung 6 des Epics, Erweiterungs-
  // Prüfschritt vom 2026-07-09). Im Aus-Zustand verhalten sich Properties-
  // Editor und Block-Panel exakt wie ohne Konfiguration (Inferenz und
  // Heuristik; der Renderer prüft isExtensionActive vor der Auflösung);
  // Kommandos gibt es keine. Der Einstellungs-Bereich (4T-0450) dockt hier
  // an (Muster templates/journals).
  {
    id: 'property-profiles',
    category: 'tools',
    nameKey: 'help.featureName.propertyProfiles',
    descKey: 'help.feature.propertyProfiles',
    settingsSections: ['propertyProfiles'],
  },
  // 4T-0461 (Epic 3E-0085): Tab-Gruppen als schaltbare Werkzeug-Erweiterung
  // (Erweiterungs-Prüfschritt vom 2026-07-10, dokumentiert im Epic). Keine
  // Registry-Kommandos: die Verwaltung läuft über Tab- und Kopf-Kontextmenü
  // (bei deaktivierter Erweiterung ausgeblendet); der Tab-Streifen rendert
  // flach, Modell und Sitzungs-Persistenz bleiben erhalten, sodass das
  // Wieder-Einschalten die Gruppen unverändert zurückbringt.
  {
    id: 'tab-groups',
    category: 'tools',
    nameKey: 'help.featureName.tabGroups',
    descKey: 'help.feature.tabGroups',
  },
  // 4T-0498 (Epic 3E-0090): Aufgaben als schaltbare Werkzeug-Erweiterung
  // (Querschnitt C des Konzept-Workshops vom 2026-07-10). Buendelt die
  // Task-Marker-Darstellung (Termine/Prioritaet/Wiederholung als Badges
  // in Render-Pane, Live-Modus und Portable-Export), die Automatik-Daten
  // beim Status-Wechsel, den Global Filter und die Wiederholung beim
  // Abschluss — gebuendelte Erweiterung mit eigenen extension.*-Keys
  // (kein 1:1-Katalog-Eintrag). Im Aus-Zustand bleiben Marker reiner
  // Text und es wird nichts automatisch geschrieben. Bewusst OHNE
  // Abhaengigkeit auf 'task-states': Marker und Automatik funktionieren
  // auch mit den Basis-Checkboxen; die Status-Ketten-Semantik der
  // erweiterten Zeichen kommt bei aktivem task-states dazu.
  {
    id: 'tasks',
    category: 'tools',
    nameKey: 'extension.tasks.name',
    descKey: 'extension.tasks.description',
    featureKeys: [
      'help.feature.taskMarkers',
      'help.feature.taskGlobalFilter',
      'help.feature.taskDialog',
    ],
    settingsSections: ['tasks'],
    // 4T-0506 (Epic 3E-0096): der Task-Bearbeitungs-Dialog entfaellt im
    // Aus-Zustand (Dispatcher, Palette, Kontextmenue, Hilfe-Seiten).
    commands: ['task.editDialog'],
  },
  // 4T-0528 (Epic 3E-0095): Erinnerungen als schaltbare Werkzeug-Erweiterung
  // (Workshop-Punkt 8) mit Abhaengigkeit zur Erweiterung "Aufgaben" (die
  // Anker sind Task-Marker; zweiter Nutzer der dependencies-Mechanik nach
  // wiki-embeds). Buendelt ⏰-Marker-Funktion, Pruefer/Benachrichtigungen
  // und Erinnerungs-Liste — gebuendelte Erweiterung mit eigenen
  // extension.*-Keys (kein 1:1-Katalog-Eintrag). Im Aus-Zustand (eigener
  // Schalter oder transitiv ueber "Aufgaben"): keine Ueberwachung (Gate im
  // Main-Pruefer), kein Panel, beide Kommandos gefiltert, Autocomplete-/
  // Dialog-/Klick-Anbindung aus; Anker bleiben Task-Marker-Badges.
  {
    id: 'reminders',
    category: 'tools',
    nameKey: 'extension.reminders.name',
    descKey: 'extension.reminders.description',
    featureKeys: [
      'help.feature.reminders',
      'help.feature.reminderNotifications',
      'help.feature.reminderList',
    ],
    dependencies: ['tasks'],
    commands: ['task.setReminder', 'view.toggleReminders'],
    settingsSections: ['reminders'],
  },
  // 4T-0512 (Epic 3E-0092): Ereignisse als schaltbare Werkzeug-Erweiterung
  // (Workshop-Punkt 8 vom 2026-07-10) mit Abhaengigkeit zu den Eigenschafts-
  // Profilen (das feste interne Profil "Ereignis" ist ein Profil-Konstrukt;
  // dritter Nutzer der dependencies-Mechanik). Buendelt den perspective-
  // events-Fence (eingebettete Verwaltung und Frontmatter-Aggregation),
  // Rechen-Kern-Anzeige und das Einfuege-Kommando — gebuendelte Erweiterung
  // mit eigenen extension.*-Keys (mehrere Katalog-Eintraege, kein 1:1).
  // Im Aus-Zustand (eigener Schalter oder transitiv ueber die Profile):
  // Fences bleiben neutrale Code-Blöcke (Render, Live, Portable), das
  // Kommando ist gefiltert, das interne Profil verschwindet aus Aufloesung
  // und Profil-Liste (4T-0517).
  {
    id: 'events',
    category: 'tools',
    nameKey: 'extension.events.name',
    descKey: 'extension.events.description',
    featureKeys: [
      'help.feature.events',
      'help.feature.eventsAggregation',
      'help.feature.eventsLinks',
    ],
    dependencies: ['property-profiles'],
    commands: ['edit.insertEvents'],
  },
  // 4T-0538 (Epic 3E-0098): Arbeitsbereiche als schaltbare Werkzeug-
  // Erweiterung (Workshop-Punkt 8 vom 2026-07-11), ohne Abhaengigkeiten.
  // Im Aus-Zustand entfallen die vier Kommandos (Menue-Block, Palette,
  // Dispatcher, Verwaltungs-Dialog) und der Arbeitsbereichs-Teil des
  // Fenster-Titels; Ablage UND laufende Persistenz offener Arbeits-
  // bereiche bleiben unangetastet (Kern sitzt im Main), das Wieder-
  // Einschalten bringt alles ohne Datenverlust zurueck.
  {
    id: 'workspaces',
    category: 'tools',
    nameKey: 'help.featureName.workspaces',
    descKey: 'help.feature.workspaces',
    commands: ['workspace.saveAs', 'workspace.create', 'workspace.close', 'workspace.manage'],
  },
  // 4T-0632 (Epic 3E-0102): mitgelieferte Demo-Area (Erweiterungs-
  // Pruefschritt des Epics: abgrenzbare Einstiegs-Funktion ohne Kern-
  // Abhaengigkeiten). Im Aus-Zustand entfallen Menuepunkt und Palette-
  // Kommando; bereits erstellte Demo-Ordner sind normale Bereiche und
  // bleiben unberuehrt.
  {
    id: 'demo-area',
    category: 'tools',
    nameKey: 'help.featureName.demoArea',
    descKey: 'help.feature.demoArea',
    commands: ['area.createDemo'],
  },
  // 4T-0486 (Epic 3E-0091): Datums- und Uhrzeit-Eingabe als schaltbare
  // Werkzeug-Erweiterung (Erweiterungs-Pruefschritt des Epics: abgrenzbare
  // Komfort-Funktion ohne Kern-Abhaengigkeiten). Im Aus-Zustand entfallen
  // die drei Kommandos (Dispatcher, Palette, Hilfe) und der Schreib-
  // Trigger "\\"; ab 4T-0487 auch die Klick-Dekoration der Datums-Werte.
  // Eingefuegte Werte bleiben reiner Text.
  {
    id: 'date-picker',
    category: 'tools',
    nameKey: 'help.featureName.datePicker',
    descKey: 'help.feature.datePicker',
    commands: ['edit.insertDateTime', 'edit.insertDate', 'edit.insertTime'],
  },
  {
    id: 'word-count',
    category: 'tools',
    nameKey: 'help.featureName.wordCount',
    descKey: 'help.feature.wordCount',
  },
  // 4T-0372 (Epic 3E-0069): Uhr — analoge und digitale Zeit plus Datum in
  // einem Sidebar-Panel (Erweiterungs-Pruefschritt des Epics: abgrenzbare
  // Anzeige-Funktion ohne Kern-Abhaengigkeiten, Default an). Im Aus-Zustand
  // entfallen Panel, Statusbar-Button, Toggle-Kommando (Menue, Palette,
  // Dispatcher) und der Einstellungs-Bereich; der Timer wird abgeraeumt,
  // die Optionen bleiben gespeichert (Muster command-placement).
  {
    id: 'clock',
    category: 'tools',
    nameKey: 'help.featureName.clock',
    descKey: 'help.feature.clock',
    commands: ['view.toggleClock'],
    settingsSections: ['clock'],
  },
  {
    id: 'code-copy',
    category: 'tools',
    nameKey: 'help.featureName.codeCopyButton',
    descKey: 'help.feature.codeCopyButton',
  },
  // 4T-0520 (Epic 3E-0094): Kommando-Platzierung als schaltbare Werkzeug-
  // Erweiterung (Querschnitt B des Konzept-Workshops vom 2026-07-10).
  // Buendelt die nutzerdefinierten Statusbar-Kommando-Buttons, die
  // Hide-Liste der Standard-Statusbar-Elemente, die Kontextmenue-Sektion
  // und die Makros — gebuendelte Erweiterung mit eigenen extension.*-Keys
  // (kein 1:1-Katalog-Eintrag). Im Aus-Zustand: Standard-Statusbar (keine
  // eigenen Buttons, Hide-Liste inaktiv), keine Kontextmenue-Sektion,
  // Makro-Kommandos deregistriert, Einstellungs-Bereich ausgeblendet; die
  // Konfiguration bleibt gespeichert. Ohne commands-Liste: eigene
  // statische Registry-Kommandos hat die Erweiterung nicht, die
  // dynamischen macro.*-Kommandos meldet der Laufzeit-Hook ab.
  {
    id: 'command-placement',
    category: 'tools',
    nameKey: 'extension.command-placement.name',
    descKey: 'extension.command-placement.description',
    featureKeys: [
      'help.feature.statusbarCommandButtons',
      'help.feature.statusbarHideList',
      'help.feature.contextMenuCommands',
      'help.feature.macros',
    ],
    settingsSections: ['commandPlacement'],
  },
  // 4T-0607 (Epic 3E-0114): Format-Toolbar als schaltbare Werkzeug-
  // Erweiterung (eigenständige UI-Fläche, Erweiterungs-Prüfschritt des
  // Epics). Im Aus-Zustand verschwindet die Leiste vollständig (heutiges
  // Bild ohne Toolbar); die Belegungs-Konfiguration bleibt gespeichert
  // (Muster command-placement). Ohne commands-Liste: die Leiste löst nur
  // bestehende Registry-Kommandos aus und bringt keine eigenen mit.
  {
    id: 'toolbar',
    category: 'tools',
    nameKey: 'help.featureName.formatToolbar',
    descKey: 'help.feature.formatToolbar',
    settingsSections: ['formatToolbar'],
  },
  // 4T-0585 (Epic 3E-0108): Titelzeile — Dateiname als „Zeile 0" über dem
  // Dokument mit Direkt-Umbenennen (Erweiterungs-Prüfschritt des Epics:
  // abgrenzbare Zusatz-Fläche). Eigenständige UI-Fläche ohne eigene
  // Konfiguration (Minimal-Form, Muster code-copy); im Aus-Zustand
  // verschwindet die Zeile vollständig (heutiges Bild ohne Titelzeile).
  // Ohne commands-Liste: die Zeile bringt keine eigenen Registry-Kommandos
  // mit, das Umbenennen läuft über den bestehenden file:rename-Pfad.
  {
    id: 'title-line',
    category: 'tools',
    nameKey: 'help.featureName.titleLine',
    descKey: 'help.feature.titleLine',
  },
  // 4T-0590 (Epic 3E-0109): Tabellen-Werkzeuge — Kontextmenü-Untermenü
  // „Tabelle" mit Bearbeitungs-Operationen für beide Tabellenarten
  // (Pipe-Tabelle und Perspective Table). Erweiterungs-Prüfschritt des
  // Epics: abgrenzbares Werkzeug-Paket; im Aus-Zustand entfallen Untermenü
  // und alle table.*-Kommandos (Kommando-Filterung, Muster focus-mode).
  // Keine eigene Einstellungs-Sektion.
  {
    id: 'table-tools',
    category: 'tools',
    nameKey: 'help.featureName.tableTools',
    descKey: 'help.feature.tableTools',
    commands: [
      'table.alignLeft',
      'table.alignCenter',
      'table.alignRight',
      'table.rowUp',
      'table.rowDown',
      'table.rowInsert',
      'table.rowDelete',
      'table.colLeft',
      'table.colRight',
      'table.colInsert',
      'table.colDelete',
      'table.transpose',
    ],
  },
];

// --- Validierung -----------------------------------------------------------------
// Prüft eine Registry-Liste als Ganzes. Liefert ein Array von Fehler-
// Strings (leer = gültig). Regeln: Pflichtfelder und Typen, eindeutige
// IDs, bekannte Kategorien, Abhängigkeiten nur auf registrierte IDs,
// keine Abhängigkeits-Zyklen.
function validateExtensionRegistry(list) {
  const errors = [];
  if (!Array.isArray(list)) return ['Registry ist keine Liste'];
  const ids = new Set();
  for (const m of list) {
    if (!m || typeof m !== 'object') {
      errors.push('Manifest ist kein Objekt');
      continue;
    }
    const id = m.id;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
      errors.push(`Ungültige Erweiterungs-ID: ${String(id)}`);
      continue;
    }
    if (ids.has(id)) errors.push(`Doppelte Erweiterungs-ID: ${id}`);
    ids.add(id);
    // 4T-0299: externe Einträge (origin 'external') tragen die Kategorie
    // EXTERNAL_CATEGORY und einen Klartext-Namen statt i18n-Keys.
    const isExternal = m.origin === 'external';
    if (isExternal) {
      if (m.category !== EXTERNAL_CATEGORY) {
        errors.push(`${id}: externe Erweiterung ohne Kategorie '${EXTERNAL_CATEGORY}'`);
      }
      if (typeof m.name !== 'string' || m.name === '') {
        errors.push(`${id}: name fehlt`);
      }
    } else {
      if (!EXTENSION_CATEGORIES.includes(m.category)) {
        errors.push(`${id}: unbekannte Kategorie ${String(m.category)}`);
      }
      if (typeof m.nameKey !== 'string' || typeof m.descKey !== 'string') {
        errors.push(`${id}: nameKey/descKey fehlen`);
      }
    }
    if (m.dependencies !== undefined && !Array.isArray(m.dependencies)) {
      errors.push(`${id}: dependencies ist keine Liste`);
    }
    if (m.commands !== undefined && !Array.isArray(m.commands)) {
      errors.push(`${id}: commands ist keine Liste`);
    }
    if (m.settingsSections !== undefined && !Array.isArray(m.settingsSections)) {
      errors.push(`${id}: settingsSections ist keine Liste`);
    }
  }
  // Abhängigkeiten: nur registrierte Ziele, keine Zyklen (Tiefensuche mit
  // Pfad-Markierung).
  const byId = new Map(list.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
  for (const m of byId.values()) {
    for (const dep of m.dependencies || []) {
      if (!byId.has(dep)) errors.push(`${m.id}: unbekannte Abhängigkeit ${String(dep)}`);
    }
  }
  const visiting = new Set();
  const done = new Set();
  function visit(id, path) {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`Abhängigkeits-Zyklus: ${[...path, id].join(' -> ')}`);
      return;
    }
    visiting.add(id);
    const m = byId.get(id);
    for (const dep of (m && m.dependencies) || []) {
      if (byId.has(dep)) visit(dep, [...path, id]);
    }
    visiting.delete(id);
    done.add(id);
  }
  for (const id of byId.keys()) visit(id, []);
  return errors;
}

// Die eingebaute Registry ist per Konstruktion gültig; ein Verstoß wäre ein
// Programmier-Fehler und soll beim ersten Laden (Tests, App-Start) laut
// scheitern statt still falsch zu filtern.
{
  const errors = validateExtensionRegistry(INTERNAL_EXTENSIONS);
  if (errors.length > 0) {
    throw new Error(`Ungültige Erweiterungs-Registry: ${errors.join('; ')}`);
  }
}

// --- Externe Erweiterungen (4T-0299, Epic 3E-0053) --------------------------------
// Zur Laufzeit registrierte externe Manifeste (origin 'external'). Der
// Renderer-Host registriert sie nach dem Verzeichnis-Scan; die übrigen
// Registry-Funktionen (effectiveDisabledSet, isExtensionEnabled,
// disabledCommandIdSet, …) arbeiten damit einheitlich über interne und
// externe Erweiterungen. Pro Prozess eigenständig: Main und Preload
// brauchen keine externe Registrierung (Menü-Filterung und Pipeline
// arbeiten dort rein intern bzw. über configureExternalMarkdownPlugins).
const externalExtensions = [];

// Registriert ein externes Manifest ({ id, name, description? }; Kategorie
// und Herkunft setzt die Funktion selbst). Wirft bei ungültigem Eintrag
// oder ID-Kollision — der Aufrufer (Host) behandelt das als Lade-Fehler
// der einzelnen Erweiterung, nicht als App-Fehler. Re-Registrierung
// derselben ID ersetzt den Eintrag (idempotent, z.B. nach erneutem Scan).
function registerExternalExtension(entry) {
  const manifest = {
    id: entry && entry.id,
    category: EXTERNAL_CATEGORY,
    origin: 'external',
    name: entry && entry.name,
    description: typeof (entry && entry.description) === 'string' ? entry.description : '',
  };
  const existing = externalExtensions.findIndex((m) => m.id === manifest.id);
  const others = externalExtensions.filter((_, i) => i !== existing);
  const errors = validateExtensionRegistry([...INTERNAL_EXTENSIONS, ...others, manifest]);
  if (errors.length > 0) {
    throw new Error(`Ungültige externe Erweiterung: ${errors.join('; ')}`);
  }
  if (existing >= 0) externalExtensions[existing] = manifest;
  else externalExtensions.push(manifest);
  return manifest;
}

function unregisterExternalExtension(id) {
  const idx = externalExtensions.findIndex((m) => m.id === id);
  if (idx >= 0) externalExtensions.splice(idx, 1);
  return idx >= 0;
}

// --- Zugriff ---------------------------------------------------------------------
// allExtensions() umfasst interne UND registrierte externe Erweiterungen —
// Konsumenten, die nur interne meinen (z.B. der Einstellungs-Bereich
// „Erweiterungen"), filtern über die Kategorie bzw. internalExtensions().
function allExtensions() {
  return externalExtensions.length === 0
    ? INTERNAL_EXTENSIONS
    : [...INTERNAL_EXTENSIONS, ...externalExtensions];
}

function internalExtensions() {
  return INTERNAL_EXTENSIONS;
}

function extensionById(id, list = allExtensions()) {
  return list.find((m) => m.id === id) || null;
}

function isExtensionId(id, list = allExtensions()) {
  return extensionById(id, list) !== null;
}

// --- Disabled-Zustand ---------------------------------------------------------------
// Bereinigt einen (auch defekten) Store-Wert zur Liste bekannter IDs:
// Nicht-Arrays werden zur leeren Liste, unbekannte IDs und Duplikate
// verworfen (robust gegen künftige Zu- und Abgänge von Erweiterungen).
function normalizeDisabledIds(raw, list = allExtensions()) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !isExtensionId(id, list) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

// Effektiv deaktivierte IDs: die bewusst deaktivierten plus transitiv alle
// Erweiterungen, deren Abhängigkeiten (direkt oder indirekt) deaktiviert
// sind. Reine Funktion; die Eingabe wird zuerst normalisiert.
function effectiveDisabledSet(rawDisabled, list = allExtensions()) {
  const disabled = new Set(normalizeDisabledIds(rawDisabled, list));
  // Fixpunkt-Iteration: solange neue abhängige Erweiterungen dazukommen,
  // weiter prüfen (Registry ist klein; Zyklen sind per Validierung
  // ausgeschlossen).
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of list) {
      if (disabled.has(m.id)) continue;
      if ((m.dependencies || []).some((dep) => disabled.has(dep))) {
        disabled.add(m.id);
        grew = true;
      }
    }
  }
  return disabled;
}

// Effektiver Aktiv-Zustand einer ID. Unbekannte IDs sind Kern und damit
// immer aktiv.
function isExtensionEnabled(id, rawDisabled, list = allExtensions()) {
  if (!isExtensionId(id, list)) return true;
  return !effectiveDisabledSet(rawDisabled, list).has(id);
}

// 4T-0941: Katalog-Schlüssel aller effektiv deaktivierten Erweiterungen —
// Grundlage der Kennzeichnung auf der generierten Funktions-Seite.
//
// Zwei Quellen, beide am Manifest: Bei den meisten Erweiterungen IST der
// `descKey` der Katalog-Schlüssel ihrer Zeile; gebündelte Erweiterungen mit
// eigenen `extension.*`-Texten nennen ihre Zeilen in `featureKeys`. Die
// Zuordnung wird damit an einer Stelle gepflegt und nicht doppelt geführt.
function disabledFeatureKeySet(rawDisabled, list = allExtensions()) {
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const keys = new Set();
  for (const m of list) {
    if (!disabled.has(m.id)) continue;
    if (typeof m.descKey === 'string' && m.descKey.startsWith('help.feature.')) keys.add(m.descKey);
    for (const k of m.featureKeys || []) keys.add(k);
  }
  return keys;
}

// Kommando-IDs aller effektiv deaktivierten Erweiterungen — Grundlage der
// Filterung in Dispatcher, Editor-Keymap, Menü und Handbuch-Generatoren.
function disabledCommandIdSet(rawDisabled, list = allExtensions()) {
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const commands = new Set();
  for (const m of list) {
    if (!disabled.has(m.id)) continue;
    for (const cmdId of m.commands || []) commands.add(cmdId);
  }
  return commands;
}

// Bereichs-IDs der Einstellungs-Seite, deren Erweiterung effektiv
// deaktiviert ist — die Bereichsnavigation blendet sie aus (4T-0295).
function disabledSettingsSectionIdSet(rawDisabled, list = allExtensions()) {
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const sections = new Set();
  for (const m of list) {
    if (!disabled.has(m.id)) continue;
    for (const sectionId of m.settingsSections || []) sections.add(sectionId);
  }
  return sections;
}

module.exports = {
  EXTENSIONS_DISABLED_KEY,
  EXTENSION_CATEGORIES,
  EXTERNAL_CATEGORY,
  allExtensions,
  internalExtensions,
  registerExternalExtension,
  unregisterExternalExtension,
  extensionById,
  isExtensionId,
  validateExtensionRegistry,
  normalizeDisabledIds,
  effectiveDisabledSet,
  isExtensionEnabled,
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
};
