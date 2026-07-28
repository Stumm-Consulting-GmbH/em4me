// 4T-0167: Zentrale Selektor-Konstanten der E2E-Suite. Eine Quelle fuer
// Smoke- (SM-*) und spaetere Funktions-Specs (4T-0195), damit UI-Umbauten
// nur hier nachgezogen werden muessen. Selektoren entsprechen dem realen
// DOM aus src/renderer/index.html bzw. renderer.js (renderTabbar u.a.).
'use strict';

const SEL = {
  // Grundgeruest
  statusbar: 'footer.statusbar',
  emptyState: '#empty-state',
  paneGroup0: '.pane-group[data-pane="0"]',
  content0: '.pane-group[data-pane="0"] .content',
  paneSource0: '.pane-group[data-pane="0"] .pane-source',
  // 4T-0577 (Epic 3E-0106): Editor-Huelle der Quelltext-Spalte. Traegt im
  // Lese-Zustand die Klasse read-only (das contenteditable-Attribut der
  // cm-content steht dort ebenfalls auf true und taugt nicht als Beleg).
  paneSourceEditor0: '.pane-group[data-pane="0"] .pane-source-editor',
  paneRendered0: '.pane-group[data-pane="0"] .pane-rendered',
  markdownBody0: '.pane-group[data-pane="0"] .pane-rendered .markdown-body',
  editorContent0: '.pane-group[data-pane="0"] .pane-source .cm-content',

  // Tabs (dynamisch via renderTabbar: .tab mit .active/.dirty, .tab-title, .tab-close)
  tabbar0: '.pane-group[data-pane="0"] .tabbar',
  tabs0: '.pane-group[data-pane="0"] .tabbar .tab',
  activeTab0: '.pane-group[data-pane="0"] .tabbar .tab.active',
  dirtyTab0: '.pane-group[data-pane="0"] .tabbar .tab.dirty',

  // Tab-Gruppen (4T-0460, Epic 3E-0085): Kopf, Zaehler und Reiter-Kennung
  groupHeads0: '.pane-group[data-pane="0"] .tabbar .tab-group-head',
  groupHeadLabel0: '.pane-group[data-pane="0"] .tabbar .tab-group-head .tab-group-head-label',
  groupHeadCount0: '.pane-group[data-pane="0"] .tabbar .tab-group-head .tab-group-head-count',
  groupedTabs0: '.pane-group[data-pane="0"] .tabbar .tab.tab-grouped',

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

  // Titelzeile (4T-0585, Epic 3E-0108): zwei Instanzen pro Pane, data-host
  // steuert die Sichtbarkeit je Ansichts-Modus (source: Quelltext/Geteilt/
  // Live; rendered: Reading).
  titleLineSource0: '.pane-group[data-pane="0"] .pane-source .title-line',
  titleLineRendered0: '.pane-group[data-pane="0"] .pane-rendered .title-line',
  titleLineSourceText0: '.pane-group[data-pane="0"] .pane-source .title-line .title-line-text',
  titleLineRenderedText0: '.pane-group[data-pane="0"] .pane-rendered .title-line .title-line-text',
  // 4T-0646 (Epic 3E-0128): Die Zeile besteht aus dem nie editierbaren
  // Eltern-Anteil und dem editierbaren eigenen Segment.
  titleLineRenderedPrefix0:
    '.pane-group[data-pane="0"] .pane-rendered .title-line .title-line-prefix',
  titleLineRenderedSegment0:
    '.pane-group[data-pane="0"] .pane-rendered .title-line .title-line-segment',
  titleLineSourceSegment0:
    '.pane-group[data-pane="0"] .pane-source .title-line .title-line-segment',
};

module.exports = { SEL };
