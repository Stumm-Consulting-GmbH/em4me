// 4T-0167: Zentrale Selektor-Konstanten der E2E-Suite. Eine Quelle fuer
// Smoke- (SM-*) und spaetere Funktions-Specs (4T-0195), damit UI-Umbauten
// nur hier nachgezogen werden muessen. Selektoren entsprechen dem realen
// DOM aus src/renderer/index.html bzw. renderer.js (renderTabbar u.a.).
'use strict';

// 4T-0899: Spalten-gebundene Selektoren als Funktion einer Spalten-Nummer.
// Anlass ist die Bestandsaufnahme des Charter-Durchgangs: Der Satz war
// durchgehend auf data-pane="0" verdrahtet, weshalb nur vier von 71 Specs die
// zweite Spalte ueberhaupt beruehrten — jede musste ihre Selektoren selbst
// bauen. Die bestehenden *0-Namen bleiben unveraendert und leiten sich jetzt
// aus dieser einen Quelle ab, damit es keine zweite Fassung gibt.
function paneSel(idx) {
  const g = `.pane-group[data-pane="${idx}"]`;
  return {
    paneGroup: g,
    content: `${g} .content`,
    paneSource: `${g} .pane-source`,
    // 4T-0577 (Epic 3E-0106): Editor-Huelle der Quelltext-Spalte. Traegt im
    // Lese-Zustand die Klasse read-only (das contenteditable-Attribut der
    // cm-content steht dort ebenfalls auf true und taugt nicht als Beleg).
    paneSourceEditor: `${g} .pane-source-editor`,
    paneRendered: `${g} .pane-rendered`,
    markdownBody: `${g} .pane-rendered .markdown-body`,
    editorContent: `${g} .pane-source .cm-content`,
    // Tabs (dynamisch via renderTabbar: .tab mit .active/.dirty, .tab-title, .tab-close)
    tabbar: `${g} .tabbar`,
    tabs: `${g} .tabbar .tab`,
    activeTab: `${g} .tabbar .tab.active`,
    dirtyTab: `${g} .tabbar .tab.dirty`,
    // Tab-Gruppen (4T-0460, Epic 3E-0085): Kopf, Zaehler und Reiter-Kennung
    groupHeads: `${g} .tabbar .tab-group-head`,
    groupHeadLabel: `${g} .tabbar .tab-group-head .tab-group-head-label`,
    groupHeadCount: `${g} .tabbar .tab-group-head .tab-group-head-count`,
    groupedTabs: `${g} .tabbar .tab.tab-grouped`,
    // Sidebar-Spalten der Pane (bislang nur in Sidebar-Specs von Hand gebaut)
    sidebarLeft: `${g} .pane-sidebar-left`,
    sidebarRight: `${g} .pane-sidebar-right`,
    // Titelzeile (4T-0585, Epic 3E-0108): zwei Instanzen pro Pane, data-host
    // steuert die Sichtbarkeit je Ansichts-Modus (source: Quelltext/Geteilt/
    // Live; rendered: Reading).
    titleLineSource: `${g} .pane-source .title-line`,
    titleLineRendered: `${g} .pane-rendered .title-line`,
    titleLineSourceText: `${g} .pane-source .title-line .title-line-text`,
    titleLineRenderedText: `${g} .pane-rendered .title-line .title-line-text`,
    // 4T-0646 (Epic 3E-0128): Die Zeile besteht aus dem nie editierbaren
    // Eltern-Anteil und dem editierbaren eigenen Segment.
    titleLineRenderedPrefix: `${g} .pane-rendered .title-line .title-line-prefix`,
    titleLineRenderedSegment: `${g} .pane-rendered .title-line .title-line-segment`,
    titleLineSourceSegment: `${g} .pane-source .title-line .title-line-segment`,
  };
}

const P0 = paneSel(0);

const SEL = {
  // Spalten-Selektoren einer beliebigen Spalte (0 = links, 1 = rechts)
  pane: paneSel,

  // Grundgeruest
  statusbar: 'footer.statusbar',
  emptyState: '#empty-state',
  paneGroup0: P0.paneGroup,
  content0: P0.content,
  paneSource0: P0.paneSource,
  paneSourceEditor0: P0.paneSourceEditor,
  paneRendered0: P0.paneRendered,
  markdownBody0: P0.markdownBody,
  editorContent0: P0.editorContent,

  // Tabs
  tabbar0: P0.tabbar,
  tabs0: P0.tabs,
  activeTab0: P0.activeTab,
  dirtyTab0: P0.dirtyTab,

  // Tab-Gruppen
  groupHeads0: P0.groupHeads,
  groupHeadLabel0: P0.groupHeadLabel,
  groupHeadCount0: P0.groupHeadCount,
  groupedTabs0: P0.groupedTabs,

  // Statusbar-Buttons
  viewBtn: (mode) => `.view-toggle .view-btn[data-view="${mode}"]`,
  btnEdit: '#btn-edit',
  btnTheme: '#btn-theme',

  // Suche
  searchBar: '#search-bar',
  searchInput: '#search-input',
  searchCount: '#search-count',

  // Render-Inhalte
  codeCopyButton: '.code-copy-button',

  // Titelzeile
  titleLineSource0: P0.titleLineSource,
  titleLineRendered0: P0.titleLineRendered,
  titleLineSourceText0: P0.titleLineSourceText,
  titleLineRenderedText0: P0.titleLineRenderedText,
  titleLineRenderedPrefix0: P0.titleLineRenderedPrefix,
  titleLineRenderedSegment0: P0.titleLineRenderedSegment,
  titleLineSourceSegment0: P0.titleLineSourceSegment,
};

module.exports = { SEL };
