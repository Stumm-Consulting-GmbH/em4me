// 4T-001181 (Epic 3E-000156): Positivliste der Katalog-Zeilen, die zum Kern
// der Anwendung gehoeren und deshalb KEINER Erweiterung zugeordnet sind.
//
// Der Vollstaendigkeits-Waechter in funktions-seite-erweiterungen.test.js
// verlangt fuer jede Zeile des Funktions-Katalogs (HELP_FEATURE_GROUPS) genau
// eine Antwort: Entweder nennt eine Erweiterung sie (descKey oder featureKeys),
// oder sie steht hier. Eine Zeile ohne Antwort ist ein Befund — genau der Fall
// von 4T-001177, in dem vier Zeilen der Profil-Erweiterung im Aus-Zustand
// Funktionen behaupteten, die es dann nicht gab.
//
// Warum eine Datei unter test/ und keine Markierung an der Registry: Die Liste
// ist Pruef-Wissen, kein Produkt-Wissen. Die Anwendung braucht sie nicht (der
// Kern ist, was keine Erweiterung abschaltet), und die Registry bleibt die eine
// Quelle dafuer, was schaltbar ist. Der Preis ist eine zweite Liste, die mit
// dem Katalog altert — genau das prueft der Waechter in beide Richtungen: Ein
// Eintrag hier, der nicht mehr im Katalog steht, ist ebenso ein Befund wie eine
// Katalog-Zeile ohne Antwort. Erst-Zuordnung am 2026-09-03 nach Durchsicht der
// 196 Katalog-Zeilen: 81 nennen Erweiterungen, 115 stehen hier.
//
// Wer eine Katalog-Zeile anlegt, entscheidet damit: schaltbar (Registry) oder
// Kern (hier). Die Frage stellt der Erweiterungs-Pruefschritt der Leitdatei
// ohnehin je Epic; der Waechter macht die Antwort zur Pflicht.
'use strict';

const KERN_ZEILEN = [
  // help.group.file — Dateien, Speichern, Historie, Anhaenge, Export, Buecher
  'help.feature.openFiles',
  // 4T-001502 (Epic 3E-000174): Datei ueber ihren Namen oeffnen. Kern und
  // nicht schaltbar (Entscheidung E6 des Product Owners vom 2026-09-06): Die
  // Trennlinie des Bestands laeuft zwischen Funktionen, die Inhalt erzeugen,
  // rendern oder eine eigene Oberflaeche hinzufuegen, und reinen
  // Zugangs-Wegen; das Overlay, das diesen traegt, steht folgerichtig selbst
  // nicht in der Erweiterungs-Registry.
  'help.feature.quickOpen',
  'help.feature.newTab',
  'help.feature.subpageCreate',
  'help.feature.renameFile',
  'help.feature.renameLinkUpdate',
  'help.feature.subpageDetach',
  'help.feature.documentSplit',
  'help.feature.rejoinParts',
  'help.feature.templateRules',
  'help.feature.journalNav',
  'help.feature.journalTimeline',
  'help.feature.save',
  'help.feature.autoSave',
  'help.feature.history',
  'help.feature.historyControl',
  'help.feature.historyView',
  'help.feature.documentNotes',
  'help.feature.blockMetadata',
  'help.feature.attachments',
  'help.feature.attachmentOpen',
  'help.feature.exportPortable',
  // 4T-001480 (Epic 3E-000177, Entscheidung E6): Drucken ist Kern wie der
  // PDF-Export — eine Ausgabe-Grundfunktion ohne sinnvollen Aus-Zustand.
  'help.feature.print',
  'help.feature.exportPdf',
  'help.feature.autoReload',
  'help.feature.restoreSession',
  'help.feature.unsavedDrafts',
  'help.feature.windowState',
  'help.feature.bookToc',
  'help.feature.bookStructure',
  'help.feature.bookReading',
  'help.feature.bookMoveFile',
  'help.feature.bookRepair',
  'help.feature.bookshelf',
  'help.feature.shelfView',
  // help.group.editing — Editor, Suche, Eigenschaften, Abfragen, Aufgaben
  'help.feature.editMode',
  'help.feature.tabIndent',
  'help.feature.listNumbering',
  'help.feature.listExit',
  // 4T-001577 (Epic 3E-000282): Der Cursor-Sprung in Listen ist Kern und keine
  // schaltbare Erweiterung (Entscheidung E4 des Epics): Die Registry fuehrt
  // Markdown-Konstrukte und abgrenzbare Funktions-Pakete, eine
  // Verhaltens-Option der Cursor-Bewegung ist keine solche Einheit. Sie liegt
  // als Schalter im Einstellungs-Bereich Verhalten.
  'help.feature.listenCursor',
  'help.feature.tableEditor',
  // 4T-001347 (Epic 3E-000239): Die Tabellen-Bearbeitung im Live-Modus ist Kern
  // und keine schaltbare Erweiterung (Entscheidung des Product Owners vom
  // 2026-09-04): Sie ist kein neues Markdown-Konstrukt, sondern die
  // Bedienbarkeit eines vorhandenen, und ihr Aus-Zustand waere der Defekt,
  // den das Epic behebt.
  'help.feature.liveTableEdit',
  'help.feature.insertTimestamp',
  'help.feature.search',
  'help.feature.searchReplace',
  'help.feature.searchScopes',
  'help.feature.areaSearch',
  // 4T-001527 (Epic 3E-000169): Kern und nicht schaltbar — das bereichsweite
  // Ersetzen ist das Schreib-Gegenstueck der Bereichs-Suche, und die steht zwei
  // Zeilen darueber ebenfalls im Kern. Eine Erweiterung, die allein das
  // Ersetzen abschaltet, liesse eine halbe Suche zurueck; die Antwort auf den
  // Erweiterungs-Pruefschritt des Epics steht im Loesungs-Kapitel von 4T-001527.
  'help.feature.areaReplace',
  'help.feature.perspectiveTableExtended',
  'help.feature.frontmatter',
  'help.feature.properties',
  'help.feature.frontmatterQuery',
  'help.feature.querySources',
  'help.feature.queryTable',
  'help.feature.querySort',
  'help.feature.queryBlocks',
  'help.feature.queryContext',
  'help.feature.queryValues',
  'help.feature.queryHighlight',
  'help.feature.datatableGrid',
  'help.feature.datatableView',
  'help.feature.scriptBlocks',
  'help.feature.multiColumns',
  'help.feature.taskQuery',
  'help.feature.taskQueryActions',
  'help.feature.taskAutocomplete',
  'help.feature.taskDependencies',
  'help.feature.taskUrgency',
  'help.feature.editorContextMenu',
  'help.feature.pasteLink',
  // help.group.database — 4T-001760 (Epic 3E-000253): Die neun Katalog-Zeilen
  // der Gruppe «Datenbank» standen hier bis zum 2026-09-15 vorlaeufig als Kern,
  // weil es die Erweiterung, die sie abschaltet, noch nicht gab. Sie ist mit
  // diesem Vorgang entstanden (Registry-Eintrag `database`), und die neun
  // Zeilen sind an ihr Feld featureKeys umgezogen; der Waechter erzwingt es,
  // weil eine Zeile an beiden Orten als zwei Antworten auffaellt.
  //
  // 4T-001761: Der Suchraum-Schnitt haengt an der Marke der Tabellen-Datei und
  // bleibt im Aus-Zustand bestehen (Entscheidung E-C); die Zeile beschreibt
  // deshalb Kern-Verhalten. Sie ist damit als einzige der neun zurueck in
  // dieser Liste, und die Erweiterung nannte danach acht.
  'help.feature.databaseSearchScope',
  // 4T-001762: Die Zeile beschreibt den Schalter selbst und seinen Aus-Zustand;
  // sie gilt in beiden Schalter-Stellungen und darf nicht als abgeschaltet
  // gekennzeichnet werden. Stünde sie im Feld featureKeys der Erweiterung,
  // trüge ausgerechnet die Erklärung des Aus-Zustands im Aus-Zustand die
  // Kennzeichnung «abgeschaltet», und der Anwender sähe sie durchgestrichen,
  // wo er nachliest, warum etwas fehlt. Vorbild im Bestand ist
  // 'help.feature.extensions' weiter unten: die Zeile über das Schalten
  // selbst steht ebenfalls im Kern. Die beiden anderen neuen Zeilen des
  // Vorgangs, databaseArea und databaseOverview, sind dagegen an die
  // Erweiterung gegangen; sie nennt seither zehn statt acht.
  'help.feature.databaseExtension',
  // help.group.view — Ansichten, Sidebar, Darstellung, Uhr
  'help.feature.viewModes',
  'help.feature.livePreview',
  'help.feature.mindmapDisplay',
  // 4T-001656 (Epic 3E-000287): 'help.feature.canvas' stand hier vorlaeufig aus
  // 4T-001653 und ist mit diesem Vorgang in die Registry umgezogen (Erweiterung
  // 'canvas'). Der Waechter meldet die zwei Antworten, wenn beide Orte die Zeile
  // fuehren — deshalb steht sie hier nicht mehr.
  'help.feature.sourceToggles',
  'help.feature.sidebarLayout',
  'help.feature.sidebarIconHeadings',
  'help.feature.panelHeights',
  'help.feature.panelHeightMode',
  'help.feature.panelToggleOrder',
  'help.feature.sidebarVariants',
  // 4T-001582 (Epic 3E-000283): Zusammenklappen der Statusleiste. Kern und
  // nicht schaltbar (Entscheidung E7 des Epics): Es ist kein abgrenzbares
  // Funktions-Paket, sondern die Antwort der Leiste auf ihre eigene Breite —
  // ein Aus-Zustand waere die behobene Fehlstellung. Die Wahlfreiheit traegt
  // die Einstellung «Zusammenklappen», nicht ein Erweiterungs-Schalter.
  'help.feature.statusleisteFalten',
  // 4T-001766 (Epic 3E-000186): Darstellung nicht aktivierbarer
  // Schaltflaechen. Kern und nicht schaltbar (Entscheidung E7 des Epics): Das
  // Vorhaben bringt eine Einstellung und kein abgrenzbares Funktions-Paket —
  // ein Aus-Zustand waere genau der Vorgabewert «blass anzeigen», also ein
  // zweiter Schalter fuer dieselbe Entscheidung. Die Wahlfreiheit traegt die
  // Einstellung «Nicht aktivierbare Schaltflaechen».
  'help.feature.nichtAktivierbareSchalter',
  'help.feature.foldGutter',
  'help.feature.editorViewSettings',
  'help.feature.activeLine',
  'help.feature.zoom',
  'help.feature.contentWidth',
  'help.feature.fonts',
  'help.feature.settings',
  'help.feature.clockAlarms',
  'help.feature.clockTimers',
  'help.feature.clockCalendar',
  'help.feature.scrollSync',
  'help.feature.frontmatterDisplay',
  // help.group.navigation — Tabs, Fenster, Bereiche, Gliederung, Verweise
  'help.feature.tabs',
  'help.feature.tabPlacement',
  'help.feature.tabSelection',
  'help.feature.roundedTabs',
  'help.feature.multiWindow',
  // 4T-001740 (Epic 3E-000308, Entscheidung E9): «Neues Fenster» ist Kern wie
  // seine beiden Nachbarn. Ein Schalter, der gerade diesen einen Weg zu einem
  // zweiten Fenster abschaltet, waere gegenueber dem Reiter-Weg und der neuen
  // Applikation ohne Begruendung.
  'help.feature.newWindow',
  'help.feature.multiApp',
  'help.feature.area',
  'help.feature.recentAreas',
  'help.feature.areaStartPage',
  'help.feature.areaPanel',
  // 4T-001352 (Epic 3E-000170), Ergebnis des Erweiterungs-Prüfschritts: Kern.
  // Anlegen, Umbenennen und Löschen im Bereichs-Panel sind kein zuschaltbares
  // Konstrukt, sondern der Umgang mit dem Bestand, den das Panel zeigt; ein
  // Aus-Zustand ließe den Anwender vor einem Baum stehen, den er nur ansehen
  // darf, und das Umbenennen bliebe über das Datei-Menü ohnehin erreichbar.
  // Die Begründung steht im Lösungs-Kapitel von 4T-001352.
  'help.feature.areaFileCreate',
  'help.feature.areaFileRenameDelete',
  // 4T-001732 (Epic 3E-000306, Entscheidung E8): Kopieren im Bereichs-Panel ist
  // Kern wie seine drei Nachbarn derselben Menue-Gruppe. Ein Schalter, der
  // gerade diese eine Handhabung abschaltet, waere gegenueber den anderen drei
  // ohne Begruendung.
  'help.feature.areaFileCopy',
  'help.feature.journalCalendar',
  'help.feature.outline',
  'help.feature.aliases',
  'help.feature.subpages',
  'help.feature.subpagesNavigation',
  'help.feature.anchorLinks',
  'help.feature.links',
  'help.feature.areaBookmarks',
  // help.group.general — Thema, Sprache, Menue, Erweiterungen, Hilfe
  'help.feature.theme',
  'help.feature.colorSchemes',
  'help.feature.languages',
  'help.feature.menuBar',
  'help.feature.customHotkeys',
  'help.feature.extensions',
  'help.feature.extensionsExternal',
  'help.feature.extensionsDev',
  'help.feature.manual',
  'help.feature.tour',
];

// Reine Funktion fuer den Waechter und seine Gegenprobe: Welche Katalog-Zeile
// hat keine Antwort, welche zwei, welcher Kern-Eintrag ist veraltet?
function zuordnungsBefunde(katalog, erweiterungen, kern) {
  const gedeckt = new Map();
  for (const m of erweiterungen) {
    const keys = [m.descKey, ...(m.featureKeys || [])].filter((k) =>
      String(k || '').startsWith('help.feature.'),
    );
    for (const k of keys) gedeckt.set(k, [...(gedeckt.get(k) || []), m.id]);
  }
  const kernMenge = new Set(kern);
  const katalogMenge = new Set(katalog);
  return {
    ohneAntwort: katalog.filter((k) => !gedeckt.has(k) && !kernMenge.has(k)),
    zweiAntworten: katalog.filter((k) => gedeckt.has(k) && kernMenge.has(k)),
    veraltet: kern.filter((k) => !katalogMenge.has(k)),
    doppeltGedeckt: [...gedeckt].filter(([, ids]) => ids.length > 1).map(([k]) => k),
  };
}

module.exports = { KERN_ZEILEN, zuordnungsBefunde };
