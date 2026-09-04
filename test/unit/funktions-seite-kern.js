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
  'help.feature.tableEditor',
  'help.feature.insertTimestamp',
  'help.feature.search',
  'help.feature.searchReplace',
  'help.feature.searchScopes',
  'help.feature.areaSearch',
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
  // help.group.view — Ansichten, Sidebar, Darstellung, Uhr
  'help.feature.viewModes',
  'help.feature.livePreview',
  'help.feature.mindmapDisplay',
  'help.feature.sourceToggles',
  'help.feature.sidebarLayout',
  'help.feature.sidebarIconHeadings',
  'help.feature.panelHeights',
  'help.feature.panelHeightMode',
  'help.feature.panelToggleOrder',
  'help.feature.sidebarVariants',
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
  'help.feature.multiApp',
  'help.feature.area',
  'help.feature.recentAreas',
  'help.feature.areaStartPage',
  'help.feature.areaPanel',
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
