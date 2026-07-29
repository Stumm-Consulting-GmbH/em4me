// Start-Sequenz, IPC-Listener-Verdrahtung, Kommando-Dispatcher und Splitter-Init.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { loadTranslations, applyTranslations, t, normalizeLocale } from '../i18n.js';

import { clearLiveBlockRenderCache, liveRebuildEffect } from './live-widgets.js';
import { api, $ } from './api.js';
import {
  closeWordCountDialog,
  openWordCountDialog,
  rerenderAllMermaidBlocks,
  resetMermaidConfiguredTheme,
  updateWordCountStatusbar,
} from './render-mermaid.js';
import {
  MAX_PANES,
  MIME_TAB,
  THEME_NEXT,
  aboutModal,
  activeTab,
  adjustTabZoom,
  aliasModal,
  applyThemePrefToButton,
  btnEdit,
  btnTheme,
  contextMenu,
  createEmptyPane,
  createTab,
  dropOverlay,
  getPaneEls,
  langSelect,
  outerSplitter,
  paneRoots,
  panesContainer,
  renderZoomIndicator,
  resetTabZoom,
  normalizeSidebarCollapsed,
  setEditorViewDefaults,
  setFocusMode,
  state,
  tabDisplayName,
  toggleFocusMode,
  toggleTypewriterScroll,
  withDialog,
} from './app-state.js';
import {
  buildEditorCommandKeymap,
  editorCompartments,
  fuegeAnlagenEin,
  paneEditors,
  scheduleLint,
  syncEditorForPane,
  typewriterScrollExtension,
  updateWindowTitle,
} from './editor.js';
// 4T-0789 (Epic 3E-0125): Anlagen aus einem Zieh-Vorgang einsammeln.
import { anlagenAusDataTransfer } from './attachments.js';
import {
  activateBacklinksFor,
  applyBacklinksVisibility,
  applyOutgoingVisibility,
  applySidebarVisibility,
  bindOutlineEvents,
  bindSidebarPanelDnd,
  bindSidebarSplitters,
  cancelPanelDrag,
  clearSidebarCollapsed,
  loadBacklinksSettings,
  loadOutgoingSettings,
  loadOutlineSettings,
  loadSubpagesSettings,
  refreshAllOutlineFoldIndicators,
  renderAllSidebars,
  renderOutgoingLinks,
  scheduleOutlineActiveUpdate,
  scheduleOutlineRender,
  scheduleSubpagesRender,
  toggleBacklinksPanel,
  toggleOutgoingPanel,
  toggleOutlinePanel,
  toggleSidebarCollapse,
  toggleSubpagesPanel,
} from './panels.js';
import {
  applyTaskStates,
  initTaskStates,
  refreshTaskStateLabels,
  resolveStoredTaskStates,
} from './task-states.js';
// 4T-0498 (Epic 3E-0090): Erweiterung "Aufgaben" — Konfiguration laden,
// Pipeline-Labels lokalisieren, Semantik-Hook registrieren.
import { applyTasksConfig, initTasks, refreshTaskMarkerLabels } from './tasks.js';
// 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog (Kommando task.editDialog
// plus Edit-Handler der Abfrage-Treffer).
import { runTaskEditDialogCommand, initTaskDialog } from './task-dialog.js';
// 4T-0526 (Epic 3E-0095): Erinnerungs-Dialog (Zustellung fälliger Anker,
// Tipp-Ruhe, Snooze/Erledigt, optionale System-Notification); 4T-0528:
// Kommando „Erinnerung setzen" (Picker auf der Checkbox-Zeile).
import { initReminders, runSetReminderCommand } from './reminders.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Sidebar-Layout-Modell — der Persist-Helfer
// mit Statusbar-Feedback wird zur Laufzeit angehängt (das Modul selbst
// importiert bewusst keine App-Module, siehe Kopf-Kommentar dort); das
// persistierte Layout samt Breiten lädt initSidebarLayoutFromStore.
import {
  applySidebarLayout,
  attachSidebarLayoutPersistence,
  getPanelToggleOrder,
  initPanelToggleOrderFromStore,
  initSidebarLayoutFromStore,
  loadSidebarPanelHeights,
  resetSidebarLayout,
  setIconHeadings,
  setPanelToggleOrder,
  sidebarPanelById,
} from './sidebar-layout.js';
// 4T-0568 (Epic 3E-0104): Zugangs-Metadaten fuer die dynamische Anordnung
// der Panel-Buttons im source-toggles-Segment.
import { PANEL_ACCESS } from '../../shared/panel-access.js';
// 4T-0292 (Epic 3E-0052): Erweiterungs-Lebenszyklus — Store-Laden beim
// Start, Anwenden bei Broadcast; Re-Render-/Rebuild-Hooks hängen unten als
// Dokument-Listener (Muster task-states/frontmatter-display). 4T-0294:
// Laufzeit-Hooks der UI-tragenden Erweiterungen (Panels, Statusbar-Buttons,
// Fokus-Modus) registriert init() über attachExtensionRuntime.
import {
  applyExtensionsState,
  attachExtensionPersistence,
  attachExtensionRuntime,
  initExtensionsFromStore,
  isExtensionActive,
} from './extension-lifecycle.js';
// 4T-0289: Bereich „Sidebar" der Einstellungs-Seite — Import nur wegen des
// Registrierungs-Seiteneffekts (registerSettingsSection).
import './sidebar-settings.js';
// 4T-0624 (Epic 3E-0119): benannte Sidebar-Varianten (Store-Laden beim
// Start, Broadcast-Empfang, Kommando-Dialoge).
import {
  applySidebarVariant,
  findAreaVariantById,
  findGlobalVariantById,
  initSidebarVariantsFromStore,
  refreshAreaVariants,
  setGlobalVariantsFromBroadcast,
  showApplyVariantPicker,
  showSaveVariantDialog,
} from './sidebar-variants.js';
// 4T-0569 (Epic 3E-0104): Bereich „Panel-Reihenfolge" — Import nur wegen des
// Registrierungs-Seiteneffekts, direkt nach „Sidebar" (Navigations-Folge).
import './panel-order-settings.js';
// 4T-0327 (Epic 3E-0059): Bereichs-Panel (registriert sich beim Import an
// der Sidebar-Registry).
import { loadAreaPanelSettings, refreshAreaPanels, toggleAreaPanel } from './area-panel.js';
// 4T-0434 (Epic 3E-0081): Kalender-Panel (Init-Wiring, Toggle, Settings).
import {
  initCalendarPanel,
  loadCalendarSettings,
  refreshCalendarPanels,
  toggleCalendarPanel,
} from './calendar-panel.js';
// 4T-0456 (Epic 3E-0084): Datei-Graph-Panel (Init-Wiring, Toggle, Settings).
import {
  initFileGraphPanel,
  loadFileGraphSettings,
  toggleFileGraphPanel,
} from './file-graph-panel.js';
// 4T-0527 (Epic 3E-0095): Erinnerungs-Panel (Init-Wiring, Toggle, Settings).
import {
  initRemindersPanel,
  loadRemindersSettings,
  toggleRemindersPanel,
} from './reminders-panel.js';
// 4T-0372 (Epic 3E-0069): Uhr-Panel (Init-Wiring, Toggle, Sichtbarkeit und
// Anzeige-Optionen aus dem Store).
import {
  initClockOptionsFromStore,
  initClockPanel,
  loadClockSettings,
  toggleClockPanel,
} from './clock-panel.js';
// 4T-0637 (Epic 3E-0069): Wecker-Liste der Uhr-Erweiterung (app-weit).
import { initAlarmsFromStore } from './clock-alarms-panel.js';
// 4T-0638 (Epic 3E-0069): Timer-Liste und Stoppuhr (ebenfalls app-weit).
import { initTimersFromStore } from './clock-timers-panel.js';
// 4T-0372: Bereich „Uhr" der Einstellungs-Seite — Import nur wegen des
// Registrierungs-Seiteneffekts (registerSettingsSection).
import './clock-settings.js';
import {
  addBookmarkForActiveFile,
  applyBookmarksVisibility,
  cancelInlineEdit,
  closeBookmarkConfirmRemoveDialog,
  closeBookmarkMoveDialog,
  confirmBookmarkConfirmRemove,
  confirmBookmarkMove,
  handleBookmarkDragEnd,
  loadAreaBookmarks,
  loadBookmarksSettings,
  loadBookmarksTree,
  reloadGeneralBookmarksTree,
  toggleBookmarksPanel,
  updateBookmarksToggleButton,
} from './bookmarks.js';
import {
  activatePane,
  activateTab,
  closeTab,
  handleAppendTabFromOtherWindow,
  moveActiveTabBetweenPanes,
  moveGroupInPane,
  moveTabBetweenPanes,
  openDialog,
  openInPane,
  parseTabDrag,
  reorderTabsWithinPane,
  reportMenuStateNow,
} from './tabs.js';
// 4T-0355 (Epic 3E-0065): Neubefüllung sichtbarer Abfrage-Listen bei Index-
// Invalidierung.
import { refreshVisibleFrontmatterQueries } from './frontmatter-query-view.js';
import {
  applyAllLayouts,
  collectUnsavedDrafts,
  createSubpageForActiveFile,
  exportActiveTabAsPdf,
  exportCurrentTabAsPortable,
  handleFileRenamed,
  handleLinkUpdateApplied,
  handleRenderedClick,
  invalidatePaneRenderCache,
  detachActiveSubpage,
  markFileMissing,
  newUntitledTab,
  openDraftsAsUntitled,
  performAutoSave,
  persistSetting,
  reloadFile,
  renameActiveFile,
  renderAllPanes,
  saveCurrentTab,
  saveCurrentTabAs,
  saveScroll,
  saveTab,
  setViewMode,
  showStatusbarHint,
  toggleEditMode,
  toggleScrollSyncForActiveTab,
  toggleShowFoldGutter,
  toggleShowLineNumbers,
  toggleWrapLines,
} from './views.js';
// 4T-0459 (Epic 3E-0085): Gruppen-Anteil der Sitzungs-Wiederherstellung
// (frische IDs, defensive Normalisierung; Alt-Snapshots ohne groups laden
// unveraendert).
import { restoreGroupsIntoPane } from './tab-groups.js';
import { cancelAliasDialog, hideAbout, hideContextMenu, showAbout } from './dialogs.js';
// 4T-0426 (Epic 3E-0080): Vorlagen-Kommandos (neue Datei aus Vorlage,
// Vorlage an der Cursor-Position einfuegen).
import { insertTemplateCommand, newFileFromTemplate } from './templates.js';
// 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Dialoge und -Kommandos.
import {
  closeWorkspace,
  createWorkspace,
  saveWorkspaceAs,
  showWorkspaceManager,
} from './workspaces.js';
// 4T-0512 (Epic 3E-0092): Einfüge-Kommando des Ereignis-Blocks;
// 4T-0515: Index-Refresh der sichtbaren Ereignis-Aggregationen.
import { insertEventsBlock, refreshVisibleEventsAggregations } from './events-editor.js';
// 4T-0486 (Epic 3E-0091): Datums-/Uhrzeit-Picker an der Cursor-Position
// (drei Kommando-Varianten ueber die Schalter-Vorbelegung).
import { openDatePickerAtSelection } from './date-picker.js';
// 4T-0546 (Epic 3E-0097): Kalender-Wert-Kommando (Picker am Cursor) und
// Renderer-Zustand der Wert-Badges (die Preload-Pipeline wird parallel
// ueber api.calendarConfigureRender versorgt).
import { openCalendarPickerAtSelection } from './calendar-picker.js';
import { setAreaCalendarConfig } from './calendar-config.js';
// 4T-0433 (Epic 3E-0081): Journal-Kommandos (heutiger Eintrag, Eintrag
// fuer Datum) ueber den gemeinsamen Oeffnen-/Anlage-Pfad.
import { openJournalEntryForDate, openTodayJournalEntry } from './journals.js';
// 4T-0332 (Epic 3E-0060): Statusbar-Element der Dokument-Historie.
import { initHistoryStatus, updateHistoryStatus } from './history-status.js';
// 4T-0333 (Epic 3E-0060): Historien-Ansicht — Registrierung explizit über
// initHistoryPage (kein Modul-Seiteneffekt, wegen des Import-Zyklus ueber
// tabs/history-status; siehe Kommentar im Modul).
import { initHistoryPage, openHistoryPageForActiveTab } from './history-page.js';
// 4T-0455 (Epic 3E-0084): Bereichs-Graph-Tab — Registrierung explizit über
// initGraphTab (kein Modul-Seiteneffekt, Muster history-page.js).
import { initGraphTab, openAreaGraphTab } from './graph-tab.js';
// 4T-0620 (Epic 3E-0117): Bereichs-Statistik als System-Seite; Registrierung
// ueber initAreaStatsPage (kein Modul-Seiteneffekt, Muster graph-tab.js).
import { initAreaStatsPage, openAreaStatsPage } from './area-stats-page.js';
// 4T-0480 (Epic 3E-0089): Kommando-Palette; initCommandPalette injiziert den
// Ausfuehrungs-Pfad ueber die commandHandlers-Map (Zyklus-Vermeidung).
import { initCommandPalette, showCommandPalette } from './command-palette.js';
// 4T-0520 (Epic 3E-0094): Kommando-Platzierung — eigenes Statusbar-Segment
// und Hide-Liste; Bereich der Einstellungs-Seite registriert sich per
// Import-Seiteneffekt (Muster panel-order-settings.js).
import {
  applyCommandPlacementUi,
  initCommandPlacementFromStore,
  initCommandPlacementUi,
} from './command-placement.js';
// 4T-0607 (Epic 3E-0114): Format-Toolbar — Store-Stand, Verdrahtung und
// Neuaufbau beim Erweiterungs-Schalten.
import {
  applyFormatToolbarUi,
  initFormatToolbarFromStore,
  initFormatToolbarUi,
} from './format-toolbar.js';
import './command-placement-settings.js';
// 4T-0608 (Epic 3E-0114): Bereich „Format-Toolbar" registriert sich per
// Import-Seiteneffekt (Muster command-placement-settings.js).
import './format-toolbar-settings.js';
// 4T-0522 (Epic 3E-0094): Makros — initMacros injiziert Handler-Map und
// Dispatch-Rebuild (Zyklus-Vermeidung, Muster initCommandPalette).
import { initMacros } from './macros.js';
import {
  addPropertiesField,
  applyTagsVisibility,
  handleProfilesChanged,
  loadPropertiesSettings,
  loadTagsSettings,
  togglePropertiesPanel,
  toggleTagsPanel,
} from './properties-tags.js';
// 4T-0359 (Epic 3E-0066): Notizen-Panel (Init-Wiring, Toggle, Settings laden).
import {
  activeNotesEditorView,
  initNotesPanel,
  loadNotesSettings,
  toggleNotesPanel,
} from './notes-panel.js';
// 4T-0759 (Epic 3E-0142): Suchergebnis-Panel (Init-Wiring, Toggle, Settings).
// Der Import registriert zugleich das Panel in der Sidebar-Registry.
import {
  initSearchResultsPanel,
  loadSearchResultsSettings,
  setzeSprungHandler,
  toggleSearchResultsPanel,
} from './such-panel.js';
// 4T-0760 (Epic 3E-0142): Sprung zu einem Treffer der Raum-Suche. Der Import
// registriert zugleich den Sprung-Weg des Handbuchs.
import { markiereOffeneRaumSeite, springeZuTreffer } from './such-sprung.js';
// 4T-0761 (Epic 3E-0142): Einstellungen als zweiter Lieferant. Der Import
// registriert Lieferant und Sprung-Weg.
import './such-einstellungen.js';
// 4T-0616 (Epic 3E-0116): Bereich als dritter Lieferant. Der Import
// registriert Lieferant, Sprung-Weg und Markier-Weg.
import './such-bereich.js';
import { setzeRaumIndex } from './such-lauf.js';
// 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel (Init-Wiring, Toggle, Settings).
import {
  initBlockPropsPanel,
  loadBlockPropsSettings,
  toggleBlockPropsPanel,
} from './block-props-panel.js';
// 4T-0365 (Epic 3E-0067): Block-Metadaten-Indikator (Broadcast-Listener für die
// Indikator-Aktualisierung bei Metadaten-Änderungen).
import { initBlockMetaIndicators } from './block-meta-indicator.js';
import { renderTags, renderTagsFromCache } from './autocomplete-help.js';
// 4T-0213 (Epic 3E-0042): offene Handbuch-Tabs beim Sprachwechsel neu
// laden bzw. generieren (Inhalt und Tab-Titel wechseln mit); 4T-0216:
// der Hilfe-Einstieg (F1, Hilfe-Menue) oeffnet die Ueberblicksseite.
import { openManualPage, refreshOpenManualTabs } from './manual.js';
// 4T-0284 (Epic 3E-0050): Frontmatter-Anzeige — Store-Laden beim Start,
// Anwenden bei Broadcast (Setting render.showFrontmatter).
import {
  applyFrontmatterDisplay,
  applyFrontmatterExpanded,
  initFrontmatterDisplayFromStore,
} from './frontmatter-display.js';
// 4T-0471 (Epic 3E-0087): Ueberschriften-Nummerierung — Store-Laden beim
// Start, Anwenden bei Broadcast (Setting render.headingNumbering).
import { applyHeadingNumbering, initHeadingNumberingFromStore } from './heading-numbering.js';
// 4T-0465 (Epic 3E-0086): Farbschemas — Store-Laden und Anwenden beim Start,
// Anwenden beim Theme-Wechsel und beim Multi-Window-Broadcast.
import {
  initColorSchemesFromStore,
  applyActiveColorScheme,
  setColorSchemeState,
} from './color-schemes.js';
// 4T-0412 (Epic 3E-0078): Skript-Blöcke — Schalt-Zustand beim Start laden
// (Store-Key scripts.run, Default aus; UI und Broadcast folgen in 4T-0414).
// 4T-0413: Neustart sichtbarer Skript-Blöcke bei Index-Invalidierung
// (Skripte lesen den Daten-Snapshot des Index).
// 4T-0414: Anwenden bei Broadcast (Setting scripts.run).
import {
  applyPerspectiveScriptsEnabled,
  initPerspectiveScriptsFromStore,
  refreshVisiblePerspectiveScripts,
} from './perspective-script-view.js';
// 4T-0277/4T-0279 (Epic 3E-0049): die Einstellungs-Seite hat den modalen
// Dialog vollstaendig abgeloest; Appearance-Helfer und Broadcast-Merge
// leben jetzt dort.
import {
  applyAppearanceVars,
  mergeAppearanceSnapshot,
  openSettingsPage,
  readAppearanceFromStore,
  refreshSettingsPageForAreaChange,
  registerSettingsSection,
  unregisterSettingsSection,
} from './settings-page.js';
// 4T-0298 (Epic 3E-0053): Host der externen Erweiterungen — Store-/Scan-
// Laden beim Start (vor dem Sidebar-Layout, damit Erweiterungs-Panels
// ihre persistierte Position behalten), App-Andockpunkte über das
// attach-Muster, Angleichen beim Multi-Window-Broadcast.
import {
  attachExtensionHostRuntime,
  attachExternalPersistence,
  initExternalExtensions,
  syncExternalExtensionsFromBroadcast,
} from './extension-host.js';
import {
  bindSearchUi,
  closeRegexHelp,
  closeSearchBar,
  getSearchEls,
  initSearchFromSettings,
  isRegexHelpOpen,
  nextMatch,
  openSearchBar,
  prevMatch,
  renderRegexHelp,
  search,
  setzeRaumMarkierHandler,
  setzeRaumSprungHandler,
  updateSearchCounter,
  updateSearchScopeLabel,
} from './search.js';
// 4T-0207 (Epic 3E-0015): Kommando-Registry — zentraler Tastatur-Dispatcher
// ersetzt die verstreuten Hotkey-Vergleiche der frueheren keydown-Listener.
import {
  COMMANDS,
  eventToBinding,
  normalizeBinding,
  isShiftSymbolEvent,
  stripShiftFromBinding,
  mergeBindings,
  formatTimestamp,
} from '../../shared/commands.js';
// 4T-0292: Kommandos deaktivierter Erweiterungen aus der Dispatcher-Map
// filtern (die Editor-Keymap filtert editor.js, das Menue der Main).
import { disabledCommandIdSet } from '../../shared/extensions.js';
import { getDisabledExtensionIds } from './extension-lifecycle.js';

// --- Initialer Main-Zustand -------------------------------------------------
// Der Main-Prozess schickt nach did-finish-load IMMER ein 'window:initialState'.
// Den Listener registrieren wir synchron beim Modul-Laden — sonst koennten wir
// das Event verpassen, falls did-finish-load feuert, bevor init() den ersten
// awaitable Punkt erreicht.
export const initialStatePromise = new Promise((resolve) => {
  api.onInitialState((payload) => resolve(payload || { panes: [] }));
});

// 4T-0012: Display-Info-Push vom Main. Synchron registrieren, weil der erste
// Push direkt nach initialState feuert. Wenn der State sich aendert, Titel neu
// rendern, damit der Suffix sofort sichtbar wird. 4T-0318: zusaetzlich
// App-Kontext (eigene Fenster-ID, App-Nummer, Bereichs-Daten) uebernehmen.
api.onWindowDisplayInfo((info) => {
  if (!info) return;
  const prevAreaPath = state.areaPath;
  state.windowId = typeof info.windowId === 'number' ? info.windowId : state.windowId;
  state.displayNumber = info.displayNumber || 1;
  state.totalWindowCount = info.totalCount || 1;
  state.appNumber = info.appNumber || 1;
  state.numberedAppCount = info.numberedAppCount || 1;
  state.appCount = info.appCount || 1;
  state.areaName = info.areaName || null;
  state.areaPath = info.areaPath || null;
  // 4T-0788 (Epic 3E-0125): Wurzel der Bild-Aufloesung fensterlokal nachziehen.
  // Bewusst bei JEDER Meldung und nicht nur im Wechsel-Zweig unten: Der Aufruf
  // ist idempotent und billig, und beim Start ist er der einzige Weg, mit dem
  // die Preload-Pipeline von einem gebundenen Bereich erfaehrt.
  if (typeof api.configureAttachmentArea === 'function') {
    api.configureAttachmentArea(state.areaPath);
  }
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Name der eigenen App.
  state.workspaceName = info.workspaceName || null;
  updateWindowTitle();
  // 4T-0327 (Epic 3E-0059): Bereichs-Wechsel (Bindung einer leeren App)
  // baut die Bereichs-Panels frisch auf.
  if (prevAreaPath !== state.areaPath) {
    refreshAreaPanels();
    // 4T-0612 (Epic 3E-0115): Bereichs-Lesezeichen sind bereichs-gebunden und
    // ziehen beim Binding-Wechsel nach (Bereichs-Abschnitt neu laden bzw.
    // ausblenden).
    void loadAreaBookmarks();
    // 4T-0434 (Epic 3E-0081): der Kalender haengt an der Journal-
    // Konfiguration des Bereichs und zieht mit.
    refreshCalendarPanels();
    // 4T-0546 (Epic 3E-0097): die Kalender-System-Konfiguration ist
    // bereichs-gebunden und zieht beim Binding-Wechsel nach.
    void refreshCalendarSystems();
    // 4T-0555 (Epic 3E-0100): eine offene Einstellungs-Seite baut ihre
    // Navigations-Gruppe „Aktueller Bereich" und die bereichsgebundenen
    // Entwuerfe neu auf.
    refreshSettingsPageForAreaChange();
    // 4T-0625 (Epic 3E-0119): Bereichs-Varianten der Sidebar sind
    // bereichs-gebunden und ziehen beim Binding-Wechsel nach.
    void refreshAreaVariants();
    // 4T-0788 (Epic 3E-0125): Mit der Wurzel aendert sich, welche Bilder
    // aufgeloest werden. Ein bereits offenes Dokument zeigte seine Anlagen
    // sonst erst nach einem manuellen Neu-Rendern.
    renderAllPanes();
  }
});

// Window-Close-Anfrage vom Main-Prozess. Wir pruefen alle dirtigen Tabs in
// diesem Fenster und fragen pro Tab nach (Speichern/Verwerfen/Abbrechen).
// Wenn der Nutzer "Abbrechen" waehlt, wird das Schliessen abgebrochen,
// sonst confirmClose() an Main melden.
// 4T-0320 (Epic 3E-0057): Registrierung synchron beim Modul-Laden statt in
// init() — Electron-IPC puffert nicht, und ein Quit direkt nach dem Oeffnen
// eines frischen Fensters (z.B. Beenden unmittelbar nach "Neue Applikation")
// verlor die window:requestClose-Nachricht: das Fenster schloss nie, das
// Beenden hing. Vor Abschluss von init() gibt es keine dirtigen Tabs, der
// Handler ist dann ein direktes confirmClose.
api.onWindowRequestClose(async () => {
  await withDialog(async () => {
    // 4T-0368 (Epic 3E-0068): Bei aktiver Einstellung Unbenannt-Tabs mit Inhalt
    // ohne Dialog als Entwurf sichern; Dialoge nur noch fuer dirty bestehende
    // Dateien. Einzelnes Tab-Schliessen (closeTab) bleibt davon unberuehrt.
    const keepDrafts = (await api.getSetting('keepUnsavedDrafts')) !== false;
    if (keepDrafts) {
      const drafts = collectUnsavedDrafts();
      if (drafts.length > 0) await api.saveDrafts(drafts);
    }
    const dirty = [];
    for (let p = 0; p < state.panes.length; p++) {
      for (let i = 0; i < state.panes[p].tabs.length; i++) {
        const tb = state.panes[p].tabs[i];
        if (!tb.dirty) continue;
        // Echte Nutzer-Entwuerfe (kein Pfad, keine System-/Handbuch-Seite) sind
        // bereits als Entwurf gesichert — kein Dialog.
        const isUserDraft = !tb.path && !tb.manualPage && !tb.systemPage;
        if (keepDrafts && isUserDraft) continue;
        dirty.push({ paneIdx: p, tabIdx: i, tab: tb });
      }
    }
    for (const d of dirty) {
      activatePane(d.paneIdx);
      activateTab(d.paneIdx, d.tabIdx);
      const detail = d.tab.path || tabDisplayName(d.tab);
      const result = await api.confirmCloseDirty({ detail });
      if (result === 'cancel') {
        // M-01 (4T-0173): Abbruch dem Main melden, sonst bleibt
        // isQuitting nach einem abgebrochenen Beenden dauerhaft true
        // und die Session-Persistenz faellt aus.
        api.cancelWindowClose();
        return;
      }
      if (result === 'save') {
        const ok = await saveTab(d.paneIdx, d.tabIdx);
        if (!ok) {
          // Speichern abgebrochen/gescheitert: ebenfalls Abbruch melden.
          api.cancelWindowClose();
          return;
        }
      }
      // 'discard': fortfahren ohne Speichern
    }
    api.confirmClose();
  });
});

// Externe Datei-Argumente (kalter Start mit "Öffnen mit" oder Doppelklick auf
// .md) werden vom Main per 'file:openExternal' geschickt — zeitlich direkt
// nach 'window:initialState'. Dieser Listener MUSS deshalb auch synchron beim
// Modul-Laden registriert werden, sonst geht die Nachricht verloren, weil
// Electron-IPC keine Nachrichten puffert. Solange init() nicht durch ist,
// sammeln wir die Files; danach werden sie geoeffnet.
export let initDone = false;
export const pendingExternalFiles = [];

// 4T-0012: Append-Tab-Event aus einem anderen Fenster. Synchron registrieren,
// damit kein Event verloren geht. Solange init() nicht durch ist, sammeln; im
// Anschluss abarbeiten.
export const pendingAppendPayloads = [];
api.onAppendTabFromOtherWindow((payload) => {
  if (!payload) return;
  if (!initDone) {
    pendingAppendPayloads.push(payload);
    return;
  }
  handleAppendTabFromOtherWindow(payload);
});
api.onOpenExternal((files) => {
  if (!Array.isArray(files) || files.length === 0) return;
  if (!initDone) {
    pendingExternalFiles.push(...files);
  } else {
    openInPane(state.activePaneIndex, files);
  }
});

// M-08 (4T-0185): Sprachwechsel-Broadcast aus einem anderen Fenster.
// Synchron beim Modul-Laden registrieren (Electron-IPC puffert nicht);
// vor initDone ankommende Wechsel werden gemerkt und am Ende von init()
// angewendet — init() laedt die Sprache ohnehin frisch aus dem Store,
// der Merker faengt nur das Renn-Fenster zwischen Store-Lesen und
// initDone ab. Anwendung wie der lokale Wechsel, aber ohne erneutes
// Persistieren (der Ausloeser hat den Store bereits geschrieben).
export let pendingLanguageChange = null;
api.onLanguageChanged((newLang) => {
  if (!newLang) return;
  if (!initDone) {
    pendingLanguageChange = newLang;
    return;
  }
  if (newLang === state.language) return;
  applyLanguageChange(newLang, { persist: false });
});

// 4T-0204: taskStates-Broadcast (auch das ausloesende Fenster empfaengt
// ihn — applyTaskStates ist idempotent). Vor initDone ankommende
// Aenderungen ignorieren: init() laedt den Store-Stand ohnehin frisch.
api.onTaskStatesChanged((stored) => {
  if (!initDone) return;
  applyTaskStates(resolveStoredTaskStates(stored));
});

// 4T-0498: tasksConfig-Broadcast (auch das ausloesende Fenster empfaengt
// ihn — applyTasksConfig ist idempotent, Muster taskStates).
api.onTasksConfigChanged((stored) => {
  if (!initDone) return;
  applyTasksConfig(stored);
});

// 4T-0612 (Epic 3E-0115, PO-Testbefund EXE 0.91.0.919): Broadcast des globalen
// (allgemeinen) Lesezeichen-Baums aus einem anderen Fenster — den frischen Baum
// uebernehmen und den allgemeinen Abschnitt neu rendern. Der Main verteilt ohne
// das ausloesende Fenster; vor initDone eintreffende Broadcasts ignorieren, weil
// init() den Baum ohnehin frisch aus dem Store laedt (loadBookmarksTree).
if (typeof api.onBookmarksTreeChanged === 'function') {
  api.onBookmarksTreeChanged((tree) => {
    if (!initDone) return;
    reloadGeneralBookmarksTree(tree);
  });
}

// 4T-0284: Frontmatter-Anzeige-Broadcast (auch das ausloesende Fenster
// empfaengt ihn — applyFrontmatterDisplay ist idempotent).
api.onFrontmatterDisplayChanged((enabled) => {
  if (!initDone) return;
  applyFrontmatterDisplay(enabled);
});

// 4T-0471 (Epic 3E-0087): Nummerierungs-Broadcast (auch das ausloesende
// Fenster empfaengt ihn — applyHeadingNumbering ist idempotent).
api.onHeadingNumberingChanged((cfg) => {
  if (!initDone) return;
  applyHeadingNumbering(cfg && cfg.enabled, cfg && cfg.startLevel);
});

// 4T-0465 (Epic 3E-0086): Farbschema-Broadcast (auch das auslösende Fenster
// empfängt ihn — setColorSchemeState normalisiert und wendet idempotent an).
if (typeof api.onColorSchemeChanged === 'function') {
  api.onColorSchemeChanged((schemeState) => {
    if (!initDone) return;
    setColorSchemeState(schemeState);
  });
}

// 4T-0414 (Epic 3E-0078): Skript-Block-Schalter-Broadcast (auch das
// ausloesende Fenster empfaengt ihn — applyPerspectiveScriptsEnabled ist
// idempotent, ein unveraenderter Zustand ist ein No-op).
if (typeof api.onPerspectiveScriptsChanged === 'function') {
  api.onPerspectiveScriptsChanged((enabled) => {
    if (!initDone) return;
    applyPerspectiveScriptsEnabled(enabled);
  });
}

// 4T-0312 (Epic 3E-0055): Broadcast der ausgeklappten Darstellung (auch
// das ausloesende Fenster empfaengt ihn — Root-Klassen-Toggle, idempotent,
// rein CSS-getragen ohne Re-Render).
if (typeof api.onFrontmatterExpandedChanged === 'function') {
  api.onFrontmatterExpandedChanged((expanded) => {
    if (!initDone) return;
    applyFrontmatterExpanded(expanded === true);
  });
}

// 4T-0292: extensions-Broadcast (auch das ausloesende Fenster empfaengt
// ihn — persist:false, und ein unveraenderter Zustand ist dort ein No-op).
// 4T-0539 (Epic 3E-0098): vor initDone eintreffende Broadcasts werden
// gemerkt und am Ende von init() angewendet (Muster pendingLanguageChange)
// — vorher gingen sie endgueltig verloren, wenn ein Fenster in seiner
// Startphase einen Schalt-Broadcast empfing (aufgedeckt durch WS-05 der
// Arbeitsbereichs-Spec). Danach zieht der Fenster-Titel nach, weil sein
// Arbeitsbereichs-Teil am Erweiterungs-Zustand haengt (workspaces).
let pendingExtensionsChange = null;
if (typeof api.onExtensionsChanged === 'function') {
  api.onExtensionsChanged((ids) => {
    if (!initDone) {
      pendingExtensionsChange = ids;
      return;
    }
    void Promise.resolve(applyExtensionsState(ids, { persist: false })).then(() =>
      updateWindowTitle(),
    );
  });
}

// 4T-0298 (Epic 3E-0053): Broadcast der EXTERNEN Erweiterungen (auch das
// ausloesende Fenster empfaengt ihn — der Host laedt Store und Scan neu
// und gleicht idempotent an; ein unveraenderter Zustand ist ein No-op).
if (typeof api.onExternalExtensionsChanged === 'function') {
  api.onExternalExtensionsChanged(() => {
    if (!initDone) return;
    syncExternalExtensionsFromBroadcast();
  });
}

// 4T-0289: Sidebar-Layout-Broadcast (auch das ausloesende Fenster empfaengt
// ihn — persist:false, und ein unveraendertes Layout ist dort ein No-op).
if (typeof api.onSidebarLayoutChanged === 'function') {
  api.onSidebarLayoutChanged((layout) => {
    if (!initDone) return;
    applySidebarLayout(layout, { persist: false });
  });
}

// 4T-0639 (Epic 3E-0069): Broadcast der Panel-Ueberschriften (Icon oder
// Text). Der Empfangspfad persistiert nicht — das Ausloeser-Fenster hat
// bereits geschrieben.
if (typeof api.onSidebarIconHeadingsChanged === 'function') {
  api.onSidebarIconHeadingsChanged((value) => {
    if (!initDone) return;
    void setIconHeadings(value, { persist: false });
  });
}

// 4T-0624 (Epic 3E-0119): Varianten-Broadcast (auch das ausloesende Fenster
// empfaengt ihn — der Empfangspfad normalisiert und persistiert nicht).
if (typeof api.onSidebarLayoutVariantsChanged === 'function') {
  api.onSidebarLayoutVariantsChanged((variants) => {
    if (!initDone) return;
    setGlobalVariantsFromBroadcast(variants);
  });
}

// 4T-0625 (Epic 3E-0119): Bereichs-Varianten-Broadcast — jedes Fenster
// liest seine fenster-eigene Bereichs-Konfiguration frisch (Fenster
// fremder Bereiche erhalten unveraenderten Inhalt, der JSON-Vergleich im
// Modul unterdrueckt dann das Aenderungs-Event).
if (typeof api.onSidebarVariantsChanged === 'function') {
  api.onSidebarVariantsChanged(() => {
    if (!initDone) return;
    void refreshAreaVariants();
  });
}

// 4T-0569 (Epic 3E-0104): Panel-Toggle-Reihenfolge-Broadcast (Muster
// Sidebar-Layout: auch das ausloesende Fenster empfaengt ihn — persist:false,
// eine unveraenderte Reihenfolge ist im Setter ein No-op).
if (typeof api.onPanelToggleOrderChanged === 'function') {
  api.onPanelToggleOrderChanged((order) => {
    if (!initDone) return;
    void setPanelToggleOrder(order, { persist: false });
  });
}

// 4T-0208: hotkeys-Broadcast (auch das ausloesende Fenster empfaengt ihn —
// Anwendung ist idempotent): Overrides uebernehmen, Dispatcher-Map neu
// bauen und die Editor-Keymap aller Panes rekonfigurieren. Die Menue-
// Accelerators baut der Main selbst neu; der Hilfe-Dialog rendert beim
// naechsten Oeffnen ohnehin frisch aus der Registry.
if (typeof api.onHotkeysChanged === 'function') {
  api.onHotkeysChanged(async (overrides) => {
    if (!initDone) return;
    state.hotkeyOverrides =
      overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    rebuildHotkeyDispatchMap();
    for (const view of paneEditors) {
      if (!view) continue;
      view.dispatch({
        effects: editorCompartments.commandKeymap.reconfigure(buildEditorCommandKeymap()),
      });
    }
    // 4T-0212: eine offene Tastenkuerzel-Seite des Handbuchs zeigt die
    // effektiven Bindings — nach Override-Aenderung neu generieren.
    if (await refreshOpenManualTabs()) renderAllPanes();
  });
}

// 4T-0204: Nach jeder Task-Status-Aenderung offene Tabs neu rendern
// (Live-Rebuild haengt als eigener Listener in live-widgets.js). Der
// Render-Cache kennt nur content/path/lang/theme — ohne Invalidierung
// wuerde der Re-Render uebersprungen.
document.addEventListener('scg:taskstates-changed', () => {
  if (!initDone) return;
  invalidatePaneRenderCache();
  renderAllPanes();
});

// 4T-0498: Nach jeder Aufgaben-Konfigurations-Aenderung (Global Filter,
// Ausblende-Option, Labels) offene Tabs neu rendern (Muster taskStates;
// Live-Rebuild haengt als eigener Listener in live-widgets.js).
document.addEventListener('scg:tasks-changed', () => {
  if (!initDone) return;
  invalidatePaneRenderCache();
  renderAllPanes();
});

// 4T-0284: Nach dem Umschalten der Frontmatter-Anzeige offene Tabs neu
// rendern (Live-Rebuild haengt als eigener Listener in live-widgets.js);
// der Render-Cache kennt nur content/path/lang/theme und muss invalidiert
// werden, sonst wuerde der Re-Render uebersprungen.
document.addEventListener('scg:frontmatter-display-changed', () => {
  if (!initDone) return;
  invalidatePaneRenderCache();
  renderAllPanes();
});

// 4T-0471 (Epic 3E-0087): Nach dem Umschalten der Nummerierung offene Tabs
// neu rendern (Render-Cache invalidieren) und die Gliederungs-Ansicht neu
// aufbauen; der Live-Rebuild haengt als eigener Listener in live-widgets.js.
document.addEventListener('scg:heading-numbering-changed', () => {
  if (!initDone) return;
  invalidatePaneRenderCache();
  renderAllPanes();
  for (let paneIdx = 0; paneIdx < paneEditors.length; paneIdx++) {
    if (paneEditors[paneIdx]) scheduleOutlineRender(paneIdx);
  }
});

// 4T-0292/4T-0293: Nach jedem Erweiterungs-Umschalten offene Tabs neu
// rendern (die Preload-Pipeline wurde vom Lebenszyklus bereits neu
// aufgebaut; Render-Cache und Live-Block-Cache tragen Output des alten
// Plugin-Satzes und werden invalidiert). Zusätzlich Kommando-Filterung
// nachziehen (Dispatcher-Map, Editor-Keymap), die dauerhaft aktiven
// Marker-Felder rebuilden (liveRebuildEffect) und das Live-Preview-
// Compartment einmal leeren — syncEditorForPane setzt es passend zum
// Tab-Modus wieder ein, wodurch alle Widgets und Felder mit dem neuen
// Schalt-Zustand komplett neu entstehen (eq()-gleiche Widgets würden ihr
// altes DOM sonst behalten). Ein Lint-Nachlauf aktualisiert
// erweiterungs-abhängige Regeln.
document.addEventListener('scg:extensions-changed', async () => {
  if (!initDone) return;
  invalidatePaneRenderCache();
  clearLiveBlockRenderCache();
  rebuildHotkeyDispatchMap();
  applyExtensionButtonVisibility();
  // 4T-0520 (Epic 3E-0094): platzierte Buttons folgen dem Schalt-Zustand
  // ihrer Kommando-Erweiterungen (Konsistenz zu Menue und Palette), das
  // Ein-/Ausblenden von Panel-Buttons aendert zudem die Ueberlauf-Lage.
  applyCommandPlacementUi();
  // 4T-0607 (Epic 3E-0114): Toolbar-Buttons folgen ebenso dem Schalt-
  // Zustand ihrer Kommando-Erweiterungen; die Sichtbarkeit der Leiste
  // selbst zieht der syncEditorForPane-Lauf am Ende dieses Handlers nach.
  applyFormatToolbarUi();
  // 4T-0568 (Epic 3E-0104): das Panel-Untermenue filtert nach dem
  // Erweiterungs-Zustand der gemeldeten Liste — frisch melden.
  reportMenuStateNow();
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({
      effects: [
        editorCompartments.commandKeymap.reconfigure(buildEditorCommandKeymap()),
        editorCompartments.livePreview.reconfigure([]),
        liveRebuildEffect.of(null),
      ],
    });
    scheduleLint(view);
  }
  // 4T-0294: offene generierte Handbuch-Seiten (Tastenkuerzel) zeigen die
  // gefilterten Kommandos — vor dem Neuzeichnen aktualisieren.
  await refreshOpenManualTabs();
  renderAllPanes();
  for (let i = 0; i < state.panes.length; i++) syncEditorForPane(i);
});

// 4T-0546 (Epic 3E-0097): calendarSystems-Konfiguration des Bereichs in
// den Modul-Zustand der Pipeline laden (Wert-Badges, Klick-Pfad,
// Kommando-Verfuegbarkeit) — frisch beim Start, bei Bereichs-Wechsel und
// nach jedem calendar:changed-Broadcast. Danach offene Tabs neu rendern
// (Muster taskStates) und die Live-Widgets rebuilden.
async function refreshCalendarSystems() {
  let config;
  try {
    const res = await api.calendarGetConfig();
    config = res && res.ok ? res.config : null;
  } catch {
    config = null;
  }
  setAreaCalendarConfig(config);
  if (typeof api.calendarConfigureRender === 'function') api.calendarConfigureRender(config);
  if (!initDone) return;
  invalidatePaneRenderCache();
  renderAllPanes();
  for (const view of paneEditors) {
    if (view) view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
}
if (typeof api.onCalendarChanged === 'function') {
  api.onCalendarChanged(() => void refreshCalendarSystems());
}
void refreshCalendarSystems();

// 4T-0294: Statusbar-Buttons erweiterungs-gebundener Panels folgen dem
// Schalt-Zustand (keine toten UI-Elemente). Die Wort-Statistik verwaltet
// ihr hidden selbst (updateWordCountStatusbar setzt es pro Update neu).
const EXTENSION_STATUSBAR_BUTTONS = [
  ['wiki-links', 'btn-outgoing-links'],
  ['wiki-links', 'btn-backlinks'],
  // 4T-0567 (Epic 3E-0104): die neuen Buttons der bisher button-losen
  // Panels folgen demselben Gate wie ihre Panel-Sichtbarkeit.
  ['wiki-links', 'btn-subpages'],
  ['graph-view', 'btn-filegraph'],
  ['tags', 'btn-tags'],
  ['bookmarks', 'btn-bookmarks'],
  // 4T-0568 (Epic 3E-0104): Erinnerungen fehlte als einziges erweiterungs-
  // gebundenes Panel in dieser Liste — der Button blieb bei deaktivierter
  // Erweiterung als totes Element stehen, waehrend der Menue-Eintrag
  // korrekt entfiel (Symmetrie-Kriterium des Epics).
  ['reminders', 'btn-reminders'],
  // 4T-0372 (Epic 3E-0069): Uhr-Button folgt dem Schalt-Zustand der
  // Erweiterung (kein totes UI-Element im Aus-Zustand).
  ['clock', 'btn-clock'],
];

function applyExtensionButtonVisibility() {
  for (const [extId, elId] of EXTENSION_STATUSBAR_BUTTONS) {
    const el = document.getElementById(elId);
    if (el) el.hidden = !isExtensionActive(extId);
  }
}

// 4T-0568 (Epic 3E-0104): Panel-Buttons im source-toggles-Segment nach der
// effektiven Toggle-Reihenfolge anordnen (identisch zum Panel-Untermenue).
// Idempotent; laeuft beim Init und bei Reihenfolge-Aenderung
// (scg:panel-toggle-order-changed, 4T-0569).
// 4T-0576 (Epic 3E-0106): Das Segment enthaelt nur noch die Panel-Buttons;
// die drei Editor-Toggles sind in die mittlere Statusbar-Zone gezogen. Der
// frueher noetige Anker auf den Gliederungs-Button entfaellt damit, jeder
// Button wandert der Reihe nach ans Segment-Ende.
function applyPanelButtonOrder() {
  const container = document.querySelector('.source-toggles');
  if (!container) return;
  for (const id of getPanelToggleOrder()) {
    const meta = PANEL_ACCESS.find((p) => p.id === id);
    const btn = meta ? document.getElementById(meta.buttonId) : null;
    if (btn && btn.parentElement === container) container.appendChild(btn);
  }
}

document.addEventListener('scg:panel-toggle-order-changed', () => {
  applyPanelButtonOrder();
  // Menue folgt derselben Reihenfolge — Neuaufbau ueber den Meldepfad.
  reportMenuStateNow();
});

// 4T-0294: Laufzeit-Hooks der UI-tragenden Erweiterungen (attach-Muster,
// von init() nach dem Laden des Schalt-Zustands registriert — ist eine
// Erweiterung beim Anhaengen bereits deaktiviert, laeuft deactivate sofort
// und bringt die UI auf Stand). Panels: applyXxxVisibility blendet die
// Sektion aus bzw. ein und gibt bei Backlinks die Index-Wurzel frei;
// Fokus-Modus: UI-Wirkung abschalten, ohne die persistierten Preferences
// (focusMode, typewriterScroll) zu veraendern — Daten-Schonung, beim
// Wiedereinschalten kehrt der Zustand zurueck.
function registerExtensionRuntimeHooks() {
  const refreshWikiPanels = () => {
    for (let i = 0; i < state.panes.length; i++) {
      applyOutgoingVisibility(i);
      applyBacklinksVisibility(i);
    }
    applyExtensionButtonVisibility();
  };
  attachExtensionRuntime('wiki-links', {
    deactivate: refreshWikiPanels,
    activate: refreshWikiPanels,
  });
  const refreshTagsPanel = () => {
    for (let i = 0; i < state.panes.length; i++) applyTagsVisibility(i);
    applyExtensionButtonVisibility();
  };
  attachExtensionRuntime('tags', { deactivate: refreshTagsPanel, activate: refreshTagsPanel });
  const refreshBookmarksPanel = () => {
    for (let i = 0; i < state.panes.length; i++) applyBookmarksVisibility(i);
    applyExtensionButtonVisibility();
  };
  attachExtensionRuntime('bookmarks', {
    deactivate: refreshBookmarksPanel,
    activate: refreshBookmarksPanel,
  });
  attachExtensionRuntime('word-count', {
    deactivate: updateWordCountStatusbar,
    activate: updateWordCountStatusbar,
  });
  attachExtensionRuntime('focus-mode', {
    deactivate: () => {
      document.body.classList.remove('focus-mode');
      for (const view of paneEditors) {
        if (!view) continue;
        view.dispatch({ effects: editorCompartments.typewriter.reconfigure([]) });
      }
      reportMenuStateNow();
    },
    activate: () => {
      document.body.classList.toggle('focus-mode', state.focusMode);
      for (const view of paneEditors) {
        if (!view) continue;
        view.dispatch({
          effects: editorCompartments.typewriter.reconfigure(
            state.typewriterScroll ? typewriterScrollExtension : [],
          ),
        });
      }
      reportMenuStateNow();
    },
  });
  // 4T-0697 (Epic 3E-0141): Aus-Zustand der Sidebar-Kollaps-Erweiterung —
  // gespeicherten Kollaps-Zustand aufheben, damit keine Spalte unbedienbar
  // eingeklappt zurückbleibt (im Aus-Zustand fehlen Kommando und Icon zum
  // Ausklappen). PO-Befund vom 2026-07-23: Die Kopf-Icons zogen dem Schalt-
  // Zustand nicht sofort nach — ihre Injektion lebt im Render-Pfad
  // renderSidebarSide, den der scg:extensions-changed-Handler (renderAllPanes)
  // nicht anfasst; die Icons blieben beim Deaktivieren stehen und fehlten beim
  // Wieder-Aktivieren, bis eine andere Bedienung ein Rendern auslöste. Beide
  // Übergänge rendern deshalb jetzt alle Sidebars neu. Beim Deaktivieren räumt
  // clearSidebarCollapsed weiterhin den gespeicherten Zustand; sein eigener
  // Re-Render wird unterdrückt (render:false), der Hook rendert danach genau
  // einmal — kein doppeltes Rendern.
  attachExtensionRuntime('sidebar-collapse', {
    deactivate: () => {
      clearSidebarCollapsed({ render: false });
      renderAllSidebars();
    },
    activate: renderAllSidebars,
  });
  // 4T-0520 (Epic 3E-0094): Aus-Zustand = Standard-Statusbar (Segment
  // leer, Hide-Liste inaktiv); An-Zustand stellt beides wieder her. Die
  // Konfiguration bleibt gespeichert.
  attachExtensionRuntime('command-placement', {
    deactivate: applyCommandPlacementUi,
    activate: applyCommandPlacementUi,
  });
  // 4T-0607 (Epic 3E-0114): Aus-Zustand entfernt die Format-Toolbar
  // vollstaendig; An-Zustand stellt sie im Edit-Modus wieder her. Die
  // Belegungs-Konfiguration bleibt gespeichert.
  attachExtensionRuntime('toolbar', {
    deactivate: applyFormatToolbarUi,
    activate: applyFormatToolbarUi,
  });
}

// 4T-0288 (Epic 3E-0051): Nach jeder Layout-Änderung (Reiterwechsel,
// später Drag-and-Drop und Einstellungs-Bereich aus 4T-0289) das
// Slot-Mounting aller Panes nachziehen. applySidebarVisibility ist
// idempotent; Panel-Inhalte sind vom Umhängen unberührt.
document.addEventListener('scg:sidebar-layout-changed', () => {
  if (!initDone) return;
  for (let i = 0; i < state.panes.length; i++) applySidebarVisibility(i);
});

// 4T-0639 (Epic 3E-0069): Umschalten zwischen Text- und Icon-Überschriften
// zieht dasselbe Slot-Mounting nach — Köpfe, Reiter und die Breiten-
// Untergrenze hängen daran.
document.addEventListener('scg:sidebar-icon-headings-changed', () => {
  if (!initDone) return;
  for (let i = 0; i < state.panes.length; i++) applySidebarVisibility(i);
});

// --- Kommando-Dispatcher (4T-0207, Epic 3E-0015) ------------------------------
// Handler pro Kommando-ID der Registry. Die Bindings selbst leben in
// src/shared/commands.js (Defaults) plus state.hotkeyOverrides (Store-Key
// 'hotkeys'); der Dispatcher loest Tastendruecke per O(1)-Map-Lookup auf.
//
// Rueckgabe-Konvention: ein Handler, der `false` zurueckgibt, hat den
// Tastendruck NICHT verarbeitet (Kontext-Guard, z.B. unsichtbare
// Suchleiste) — der Dispatcher unterdrueckt dann auch das preventDefault,
// identisch zum bisherigen Verhalten der Einzel-Listener.
//
// Kontext-Guards bleiben in den Handlern (Edit-Modus fuer
// search.openReplace, sichtbare Suchleiste fuer search.next/prev), wo sie
// vor der Migration in den keydown-Listenern lagen. Die editorScoped-
// Kommandos (Fold) laufen NICHT hier, sondern als CodeMirror-Keymap
// (buildEditorCommandKeymap in editor.js).

// 4T-0207: Auto-Save-Toggle — gemeinsamer Pfad fuer Menue-IPC und Kommando
// (vorher Inline-Closure am IPC-Listener).
async function toggleAutoSaveSetting() {
  state.autoSave = !state.autoSave;
  await api.setSetting('autoSave', state.autoSave);
  if (state.autoSave) performAutoSave();
}

// 4T-0207: Sitzungs-Restore-Toggle — gemeinsamer Pfad wie oben.
async function toggleRestoreSessionSetting() {
  state.restoreSession = !state.restoreSession;
  await api.setSetting('restoreSession', state.restoreSession);
}

// 4T-0486 (Epic 3E-0091): gemeinsamer Pfad der drei Picker-Kommandos.
// Editor-Aufloesung und Guards wie edit.insertTimestamp; die Schalter-
// Vorbelegung unterscheidet die Varianten.
function runDatePickerCommand(dateEnabled, timeEnabled) {
  let view = activeNotesEditorView();
  if (!view) {
    const tab = activeTab();
    if (!tab || !tab.editMode || tab.viewMode === 'rendered') return false;
    view = paneEditors[state.activePaneIndex];
  }
  if (!view || view.state.readOnly) return false;
  openDatePickerAtSelection(view, { dateEnabled, timeEnabled });
}

export const commandHandlers = {
  // 4T-0480 (Epic 3E-0089): Kommando-Palette (filterbares Popup aller
  // Registry-Kommandos; Ausfuehrung laeuft zurueck ueber diese Map).
  'app.commandPalette': () => {
    void showCommandPalette();
  },
  // 4T-0624 (Epic 3E-0119): benannte Sidebar-Varianten — speichern per
  // Namens-Dialog, anwenden per Auswahl-Popup.
  'sidebar.saveVariant': () => {
    void showSaveVariantDialog();
  },
  'sidebar.applyVariant': () => {
    void showApplyVariantPicker();
  },
  'file.newTab': () => {
    newUntitledTab();
  },
  // 4T-0319 (Epic 3E-0057): neue logische Applikation (Main erzeugt App
  // samt leerem Fenster); ohne Default-Binding, per Settings belegbar.
  'app.newApplication': () => {
    api.newApplication();
  },
  // 4T-0322 (Epic 3E-0058): Bereich oeffnen/schliessen (Main fuehrt aus).
  'area.open': () => {
    api.openArea();
  },
  'area.close': () => {
    api.closeArea();
  },
  // 4T-0632 (Epic 3E-0102): Demo-Area erstellen (Main fuehrt aus).
  'area.createDemo': () => {
    api.createDemoArea();
  },
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Lebenszyklus (Dialoge im
  // Renderer, Operationen im Main; Verfuegbarkeits-Dimmung in der Palette).
  'workspace.saveAs': () => {
    void saveWorkspaceAs();
  },
  'workspace.create': () => {
    void createWorkspace();
  },
  'workspace.close': () => {
    closeWorkspace();
  },
  'workspace.manage': () => {
    void showWorkspaceManager();
  },
  'file.open': () => {
    openDialog();
  },
  // 4T-0338 (Epic 3E-0061): Unterseite zur aktiven Datei anlegen.
  'file.newSubpage': () => {
    createSubpageForActiveFile();
  },
  // 4T-0426 (Epic 3E-0080): neue Datei aus Vorlage (Auswahl-Popup und
  // Platzhalter-Dialoge; Abbruch erzeugt keine Datei).
  'file.newFromTemplate': () => {
    newFileFromTemplate();
  },
  // 4T-0426: Vorlage an der Cursor-Position einfuegen (Guards und
  // Rueckgabe-Konvention wie edit.insertTimestamp).
  'edit.insertTemplate': () => {
    return insertTemplateCommand();
  },
  // 4T-0512 (Epic 3E-0092): leeren Ereignis-Block an der Cursor-Position
  // einfuegen (Guards wie edit.insertTemplate).
  'edit.insertEvents': () => {
    return insertEventsBlock();
  },
  // 4T-0433 (Epic 3E-0081): Journal-Eintraege oeffnen bzw. anlegen.
  'journal.openToday': () => {
    openTodayJournalEntry();
  },
  'journal.openForDate': () => {
    openJournalEntryForDate();
  },
  // 4T-0546 (Epic 3E-0097): Kalender-Datum ueber den Picker einfuegen
  // (fokussierter Editor wie edit.insertTimestamp: Notiz-Feld hat Vorrang,
  // sonst der Haupt-Editor der aktiven Spalte mit Edit-Modus-Guard).
  'calendar.insertValue': () => {
    let view = activeNotesEditorView();
    if (!view) {
      const tab = activeTab();
      if (!tab || !tab.editMode || tab.viewMode === 'rendered') return false;
      view = paneEditors[state.activePaneIndex];
    }
    if (!view || view.state.readOnly) return false;
    void openCalendarPickerAtSelection(view);
  },
  // 4T-0339 (Epic 3E-0061): aktive Datei umbenennen.
  'file.rename': () => {
    renameActiveFile();
  },
  // 4T-0774 (Epic 3E-0128): aktive Unterseite von ihrer uebergeordneten Seite
  // loesen (Hinweis, wenn die aktive Datei keine Unterseite ist).
  'file.detachSubpage': () => {
    detachActiveSubpage();
  },
  'file.save': () => {
    saveCurrentTab();
  },
  'file.saveAs': () => {
    saveCurrentTabAs();
  },
  // 4T-0303 (Epic 3E-0054): PDF-Export des gerenderten Inhalts. Der
  // Einstellungs-Tab-Guard sitzt in exportActiveTabAsPdf selbst.
  'file.exportPdf': () => {
    exportActiveTabAsPdf();
  },
  // 4T-0075: legt die aktive Datei als Bookmark im Root ab.
  'file.bookmarkAdd': () => {
    addBookmarkForActiveFile();
  },
  'file.toggleAutoSave': () => {
    toggleAutoSaveSetting();
  },
  'app.toggleRestoreSession': () => {
    toggleRestoreSessionSetting();
  },
  'app.openSettings': () => {
    // 4T-0277: oeffnet die Einstellungs-Seite (Tab) statt des Modals.
    openSettingsPage();
  },
  'view.modeRendered': () => {
    setViewMode('rendered');
  },
  'view.modeSplit': () => {
    setViewMode('split');
  },
  'view.modeSource': () => {
    setViewMode('source');
  },
  'view.modeLive': () => {
    setViewMode('live');
  },
  'view.toggleEdit': () => {
    toggleEditMode();
  },
  // Sidebar-Toggles: Renderer-Fallback zusaetzlich zu den Menue-
  // Accelerators, damit sie auch greifen, wenn das Menue temporaer nicht
  // ansprechbar ist (4T-0014/4T-0015/4T-0073). Seit 4T-0207 deckt der
  // Fallback auch view.toggleProperties ab (vorher einziger Toggle ohne
  // Renderer-Pfad, kleine Konsistenz-Verbesserung ohne Verhaltens-Bruch).
  'view.toggleOutline': () => {
    toggleOutlinePanel(state.activePaneIndex);
  },
  'view.toggleOutgoingLinks': () => {
    toggleOutgoingPanel(state.activePaneIndex);
  },
  'view.toggleBacklinks': () => {
    toggleBacklinksPanel(state.activePaneIndex);
  },
  'view.toggleBookmarks': () => {
    toggleBookmarksPanel(state.activePaneIndex);
  },
  'view.toggleProperties': () => {
    togglePropertiesPanel(state.activePaneIndex);
  },
  // 4T-0359 (Epic 3E-0066): Notizen-Sektion toggeln.
  'view.toggleNotes': () => {
    toggleNotesPanel(state.activePaneIndex);
  },
  // 4T-0759 (Epic 3E-0142): Suchergebnis-Sektion toggeln.
  'view.toggleSearchResults': () => {
    toggleSearchResultsPanel(state.activePaneIndex);
  },
  'view.toggleTags': () => {
    toggleTagsPanel(state.activePaneIndex);
  },
  // 4T-0341 (Epic 3E-0061): Unterseiten-Sektion toggeln.
  'view.toggleSubpages': () => {
    toggleSubpagesPanel(state.activePaneIndex);
  },
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Sektion toggeln.
  'view.toggleGraphPanel': () => {
    toggleFileGraphPanel(state.activePaneIndex);
  },
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Sektion toggeln.
  'view.toggleReminders': () => {
    toggleRemindersPanel(state.activePaneIndex);
  },
  // 4T-0567 (Epic 3E-0104): Bereichs- und Kalender-Panel toggeln
  // (Zugangs-Symmetrie: Palette und belegbares Kuerzel wie alle Panels).
  'view.toggleAreaPanel': () => {
    toggleAreaPanel(state.activePaneIndex);
  },
  'view.toggleCalendarPanel': () => {
    toggleCalendarPanel(state.activePaneIndex);
  },
  // 4T-0372 (Epic 3E-0069): Uhr-Sektion toggeln.
  'view.toggleClock': () => {
    toggleClockPanel(state.activePaneIndex);
  },
  'view.toggleFocusMode': () => {
    toggleFocusMode();
  },
  // 4T-0697 (Epic 3E-0141): linke/rechte Sidebar-Spalte der aktiven Pane-
  // Group ein-/ausklappen (Kommando-Palette, belegbares Kürzel, Menü).
  'view.toggleSidebarLeft': () => {
    toggleSidebarCollapse(state.activePaneIndex, 'left');
  },
  'view.toggleSidebarRight': () => {
    toggleSidebarCollapse(state.activePaneIndex, 'right');
  },
  'view.toggleScrollSync': () => {
    toggleScrollSyncForActiveTab();
  },
  'view.toggleFoldGutter': () => {
    toggleShowFoldGutter();
  },
  'view.toggleLineNumbers': () => {
    toggleShowLineNumbers();
  },
  'view.toggleWordWrap': () => {
    toggleWrapLines();
  },
  'view.toggleTypewriterScroll': () => {
    toggleTypewriterScroll();
  },
  'tab.close': () => {
    const pane = state.panes[state.activePaneIndex];
    if (pane && pane.activeIndex >= 0) closeTab(state.activePaneIndex, pane.activeIndex);
  },
  'tab.next': () => {
    const pane = state.panes[state.activePaneIndex];
    if (pane && pane.tabs.length > 0) {
      activateTab(state.activePaneIndex, (pane.activeIndex + 1) % pane.tabs.length);
    }
  },
  'tab.prev': () => {
    const pane = state.panes[state.activePaneIndex];
    if (pane && pane.tabs.length > 0) {
      activateTab(
        state.activePaneIndex,
        (pane.activeIndex - 1 + pane.tabs.length) % pane.tabs.length,
      );
    }
  },
  'tab.moveRight': () => {
    moveActiveTabBetweenPanes('right');
  },
  'tab.moveLeft': () => {
    moveActiveTabBetweenPanes('left');
  },
  'search.open': () => {
    openSearchBar();
  },
  'search.openReplace': () => {
    // Ersetzen ist nur im Edit-Modus aktiv (Source ist editierbar); der
    // Tastendruck gilt trotzdem als verarbeitet (bisheriges Verhalten).
    const tab = activeTab();
    if (tab && tab.editMode) openSearchBar({ replaceMode: true });
  },
  'search.next': () => {
    if (!search.visible) return false;
    nextMatch();
  },
  'search.prev': () => {
    if (!search.visible) return false;
    prevMatch();
  },
  'zoom.in': () => {
    adjustTabZoom(state.activePaneIndex, +1);
  },
  'zoom.out': () => {
    adjustTabZoom(state.activePaneIndex, -1);
  },
  'zoom.reset': () => {
    resetTabZoom(state.activePaneIndex);
  },
  // 4T-0207 (Epic 3E-0015): Lokalzeit-Timestamp 'yyyy-mm-dd hh:mm' an der
  // Cursor-Position; aktive Markierung wird ersetzt. Nur in editierbaren
  // Ansichten (Source/Split/Live im Edit-Modus); im Reading-Modus und bei
  // Read-only-Editor bewusst wirkungslos. EditorState.readOnly blockiert
  // programmatische Dispatches nicht von selbst, daher expliziter Guard.
  'edit.insertTimestamp': () => {
    // 4T-0398 (Epic 3E-0066): fokussierter Editor — das Notiz-Feld hat Vorrang,
    // sonst der Haupt-Editor der aktiven Spalte (mit dessen Edit-Modus-Guard).
    let view = activeNotesEditorView();
    if (!view) {
      const tab = activeTab();
      if (!tab || !tab.editMode || tab.viewMode === 'rendered') return false;
      view = paneEditors[state.activePaneIndex];
    }
    if (!view || view.state.readOnly) return false;
    view.dispatch({
      ...view.state.replaceSelection(formatTimestamp(new Date())),
      scrollIntoView: true,
      userEvent: 'input',
    });
  },
  // 4T-0486 (Epic 3E-0091): Datums-/Uhrzeit-Picker — gleiche Editor-
  // Aufloesung und Guards wie edit.insertTimestamp (Notiz-Feld hat
  // Vorrang, sonst Haupt-Editor der aktiven Spalte im Edit-Modus).
  'edit.insertDateTime': () => runDatePickerCommand(true, true),
  'edit.insertDate': () => runDatePickerCommand(true, false),
  'edit.insertTime': () => runDatePickerCommand(false, true),
  // 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog (Task-Zeile bearbeiten,
  // leere Zeile anlegen; Editor-Aufloesung und Guards im Modul).
  'task.editDialog': () => {
    void runTaskEditDialogCommand();
  },
  // 4T-0528 (Epic 3E-0095): Erinnerung setzen (Picker auf der Checkbox-
  // Zeile; Editor-Aufloesung und Guards im Modul).
  'task.setReminder': () => {
    void runSetReminderCommand();
  },
  // 4T-0216 (Epic 3E-0042): F1 bzw. Hilfe -> Hilfe oeffnet die Handbuch-
  // Ueberblicksseite (das fruehere Modal ist vollstaendig zurueckgebaut).
  'help.open': () => {
    openManualPage('overview');
  },
  // 4T-0620 (Epic 3E-0117): Bereichs-Statistik. Der Eintrag hier ist der
  // Ausfuehrungs-Pfad fuer Kommando-Palette, belegtes Kuerzel und
  // Statusbar-Platzierung; der Menue-Weg laeuft ueber seinen eigenen Kanal.
  'stats.openArea': () => {
    openAreaStatsPage();
  },
  // 4T-0781 (Epic 3E-0161): drei Kommandos hatten bis hierher nur ihren
  // Menue- bzw. Statusbar-Weg und fielen aus Palette und Kuerzel-Dispatch
  // heraus, weil beide ausschliesslich ueber diese Map laufen. Sie rufen
  // dieselben Funktionen wie die zugehoerigen Menue-Kanaele; der Waechter
  // test/unit/renderer/kommando-dispatcher.test.js haelt die Map seither
  // gegen die Registry.
  'graph.openArea': () => {
    openAreaGraphTab();
  },
  'history.open': () => {
    openHistoryPageForActiveTab();
  },
  'view.toggleBlockProps': () => {
    void toggleBlockPropsPanel(state.activePaneIndex);
  },
};

// Map normalisiertes Binding -> Kommando-ID. Wird beim Start aus Registry
// plus Overrides gebaut; 4T-0208 baut sie bei hotkeys:changed neu.
export let hotkeyDispatchMap = new Map();

export function rebuildHotkeyDispatchMap() {
  const effective = mergeBindings(state.hotkeyOverrides);
  // 4T-0292: Kommandos effektiv deaktivierter Erweiterungen verlieren ihr
  // Binding — kein toter Hotkey bei abgeschalteter Funktion.
  const disabledCommands = disabledCommandIdSet(getDisabledExtensionIds());
  const map = new Map();
  for (const cmd of COMMANDS) {
    if (cmd.editorScoped) continue;
    if (disabledCommands.has(cmd.id)) continue;
    for (const binding of effective[cmd.id] || []) {
      const normalized = normalizeBinding(binding);
      if (normalized && !map.has(normalized)) map.set(normalized, cmd.id);
    }
  }
  hotkeyDispatchMap = map;
}

// M-08 (4T-0185): Gemeinsamer Sprachwechsel-Pfad fuer den lokalen
// Dropdown-Wechsel (persist: true) und den Multi-Window-Broadcast
// (persist: false; der Ausloeser hat den Store bereits geschrieben).
export async function applyLanguageChange(newLang, { persist }) {
  state.language = newLang;
  if (persist) await api.setSetting('language', newLang);
  else if (langSelect) langSelect.value = newLang;
  await loadTranslations(newLang);
  applyTranslations(document);
  // 4T-0204: Default-Status-Labels in der neuen Sprache aufloesen und
  // beide Pipelines neu konfigurieren (rendert ueber das eigene Event
  // auch die Panes; das folgende renderAllPanes ist dadurch idempotent).
  refreshTaskStateLabels();
  // 4T-0498: Badge-Labels der Task-Marker in der neuen Sprache aufloesen
  // (Muster refreshTaskStateLabels).
  refreshTaskMarkerLabels();
  // 4T-0087: Live-Plugin-Re-Build fuer alle offenen Editor-Views ausloesen,
  // damit Callout-Default-Titel-Widgets mit dem neuen Sprach-Stand neu
  // gebaut werden. Listener sitzt direkt am livePreviewPlugin.
  document.dispatchEvent(new CustomEvent('i18n-language-changed'));
  // 4T-0213: offene Handbuch-Tabs in der neuen Sprache neu laden bzw.
  // generieren — VOR renderAllPanes, damit der folgende Render den neuen
  // Inhalt zeichnet; Tab-Titel ziehen ueber renderTabbar/tabDisplayName.
  await refreshOpenManualTabs();
  reportMenuStateNow();
  renderAllPanes();
  // 4T-0017: Zoom-Indikator-Text ist nicht ueber data-i18n abgedeckt
  // (enthaelt Platzhalter); explizit neu rendern.
  renderZoomIndicator();
  // 4T-0072: Word-Count-Statusbar-Text ist nicht ueber data-i18n abgedeckt
  // (Template mit Platzhaltern und Intl.NumberFormat); neu rendern.
  updateWordCountStatusbar();
  // 4T-0073: Outgoing-Links-Eintraege enthalten i18n-Strings (Type-Badge-
  // Title, Zeilen-Label); sichtbare Sektionen neu rendern.
  for (let p = 0; p < state.panes.length; p++) {
    if (state.outgoing && state.outgoing.visibleByPane[p]) renderOutgoingLinks(p);
  }
  // 4T-0075: Bookmarks-Sektion enthaelt nicht-i18n-Texte (Datei-Namen), aber
  // die Kontext-Menue-Strings und der Empty-Hinweis sind data-i18n abgedeckt.
  // Aktiv-Stern aktualisieren, weil Tooltip lokalisiert ist.
  updateBookmarksToggleButton();
  // Such-Labels (Scope, Counter) sind nicht ueber data-i18n abgedeckt.
  if (search.visible) {
    updateSearchScopeLabel();
    updateSearchCounter();
  }
  // Regex-Hilfe wird dynamisch befuellt; bei offener Anzeige neu rendern.
  if (isRegexHelpOpen()) renderRegexHelp();
  // 4T-0330 (Epic 3E-0057): der Klammer-Suffix des Fenstertitels ist
  // lokalisiert (App/Bereich/Fenster) und zieht beim Sprachwechsel mit.
  updateWindowTitle();
  // 4T-0279: eine offene Einstellungs-Seite braucht keinen Sonderpfad —
  // renderAllPanes oben re-montiert sie ueber renderSystemPane in der
  // neuen Sprache (der Entwurf lebt im Modul-Zustand und bleibt erhalten).
}

// --- Initialisierung --------------------------------------------------------
// R3-07 (4T-0174): eine fruehe IPC-Rejection liess das Fenster sonst
// halb-initialisiert (haengender await ohne Diagnose). Minimaler Fallback:
// Fehler loggen und die UI-Bindings nachholen, damit Menue/Buttons des
// leeren Fensters bedienbar bleiben.
// 4T-0179: init() wird NICHT mehr als Modul-Seiteneffekt gestartet,
// sondern vom Entry (renderer.js) nach Abschluss ALLER Modul-Bodies
// aufgerufen. Die esbuild-Linearisierung der Modul-Zyklen garantiert
// sonst nicht, dass alle const-Initialisierungen (CodeMirror-Felder,
// Extensions) vor dem ersten Editor-Aufbau gelaufen sind.
export function startRenderer() {
  init().catch((err) => {
    console.error('[init] Initialisierung fehlgeschlagen:', err);
    try {
      bindUi();
      bindPaneEvents();
      bindSearchUi();
    } catch {
      // Bindings teils schon registriert oder DOM unvollstaendig — das
      // Konsolen-Log oben bleibt die primaere Diagnose.
    }
  });
}

export async function init() {
  // Theme
  const initialTheme = await api.getTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  // 4T-0465 (Epic 3E-0086): aktives Farbschema früh laden und anwenden (nach
  // data-theme, damit der Modus feststeht, und vor dem ersten Paint).
  await initColorSchemesFromStore();
  api.onThemeChanged((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    // 4T-0465 (Epic 3E-0086): Farbschema des neuen Modus neu anwenden — die
    // Inline-Variablen am Wurzel-Element übersteuern data-theme, ohne Re-Apply
    // klebt die zuvor gesetzte Palette über beiden Modi.
    applyActiveColorScheme();
    // 4T-0021: alle gerenderten Mermaid-Diagramme neu rendern, damit sie
    // dem neuen Theme folgen. Greift nur, wenn Mermaid bereits geladen ist.
    rerenderAllMermaidBlocks();
    // 4T-0089: Live-Modus-Mermaid-Widgets neu bauen. mermaidConfiguredTheme
    // nullen, damit ensureMermaidConfigured beim naechsten Aufruf neu
    // initialisiert. Pro Pane-View ein liveRebuildEffect dispatchen,
    // damit der StateField die Widgets mit neuem Theme im Cache-Key
    // baut (eq()-Mismatch triggert Widget-Neu-Render).
    resetMermaidConfiguredTheme();
    for (const view of paneEditors) {
      if (!view) continue;
      view.dispatch({ effects: liveRebuildEffect.of(null) });
    }
  });

  // 4T-0030: Theme-Pref (light/dark/system) aus dem Main laden und auf den
  // Statusbar-Button anwenden. Pref aenderungen aus dem Menue oder einem
  // anderen Fenster kommen ueber onThemePrefChanged. Menue-Klicks landen
  // ueber onMenuSetTheme im Renderer, der dann setThemePref aufruft —
  // damit greift der gleiche Broadcast-Pfad fuer beide Quellen.
  try {
    state.themePref = await api.getThemePref();
  } catch {
    state.themePref = 'system';
  }
  applyThemePrefToButton(state.themePref);
  api.onThemePrefChanged((pref) => {
    state.themePref = pref;
    applyThemePrefToButton(pref);
  });
  api.onMenuSetTheme((value) => {
    // K-05 (4T-0310): konsistent zum Statusbar-Pfad mit catch kapseln.
    Promise.resolve(api.setThemePref(value)).catch((err) => {
      console.warn('setThemePref schlug fehl:', err);
    });
  });

  // Sprache
  let lang = await api.getSetting('language');
  if (!lang) {
    const locale = await api.getLocale();
    lang = normalizeLocale(locale);
  }
  state.language = lang;
  await loadTranslations(lang);
  applyTranslations(document);
  langSelect.value = lang;
  // 4T-0330 (Epic 3E-0057): Titel neu setzen, sobald das Woerterbuch da ist.
  // Der erste DisplayInfo-Push kann VOR dem Laden der Uebersetzungen
  // eintreffen (im gepackten Build laedt fetch die Sprachdateien langsamer);
  // ein leeres frisches Fenster haette sonst den rohen Key im Titel-Suffix
  // stehen (z.B. "(window.title.app)"), weil nichts weiter den Titel anfasst.
  updateWindowTitle();

  // Restore-Setting (Quelle der Wahrheit fuer das Haekchen im Hilfe-Menue;
  // die eigentliche Restore-Entscheidung trifft der Main-Prozess vor dem
  // Fenster-Aufbau).
  state.restoreSession = await api.getSetting('restoreSession');
  state.autoSave = !!(await api.getSetting('autoSave'));
  // 4T-0603 (Epic 3E-0113): Schalter „URL beim Einfügen in eine Auswahl als
  // Link" (Default an); der Editor-Paste-Handler liest state.pasteUrlAsLink
  // synchron.
  state.pasteUrlAsLink = (await api.getSetting('input.pasteUrlAsLink')) !== false;
  // 4T-0656 (Epic 3E-0112): Tabulator rueckt ausserhalb von Listen und
  // Tabellen ein (Default an); die Editor-Belegung liest state.tabIndents
  // synchron, damit der Schalter ohne Rekonfiguration wirkt.
  state.tabIndents = (await api.getSetting('input.tabIndents')) !== false;
  // 4T-0604 (Epic 3E-0113): Zeitstempel-Automatik laden. Gebündelt über
  // Promise.all, damit der Start nicht um sechs einzelne IPC-Runden verzögert
  // wird; der Speicher-Hook liest state.frontmatterTimestamps synchron.
  const [tsCreated, tsCreatedField, tsUpdated, tsUpdatedField, tsFormat, tsAutoCreate] =
    await Promise.all([
      api.getSetting('frontmatter.createdEnabled'),
      api.getSetting('frontmatter.createdField'),
      api.getSetting('frontmatter.updatedEnabled'),
      api.getSetting('frontmatter.updatedField'),
      api.getSetting('frontmatter.timestampFormat'),
      api.getSetting('frontmatter.autoCreateField'),
    ]);
  state.frontmatterTimestamps = {
    createdEnabled: tsCreated === true,
    createdField: tsCreatedField || 'created',
    updatedEnabled: tsUpdated === true,
    updatedField: tsUpdatedField || 'updated',
    format: tsFormat === 'date' ? 'date' : 'datetime',
    autoCreate: tsAutoCreate === true,
  };
  // 4T-0085: Default-View-Modus fuer neue Tabs.
  const storedDefaultViewMode = await api.getSetting('app.defaultViewMode');
  if (
    storedDefaultViewMode &&
    ['rendered', 'split', 'source', 'live'].includes(storedDefaultViewMode)
  ) {
    state.defaultViewMode = storedDefaultViewMode;
  }
  // 4T-0572 (Epic 3E-0105): globale Voreinstellung der drei Editor-Ansicht-
  // Schalter laden (nur echtes true/false uebernimmt; sonst bleibt die
  // Konstante). Muss vor restorePanes stehen, damit wiederhergestellte Tabs
  // bereits gegen die Voreinstellung aufloesen.
  setEditorViewDefaults({
    wrapLines: await api.getSetting('editor.defaultWrapLines'),
    showLineNumbers: await api.getSetting('editor.defaultLineNumbers'),
    showFoldGutter: await api.getSetting('editor.defaultFoldGutter'),
  });
  // 4T-0572: einmalige Start-Bereinigung der abgeloesten Per-Datei-Persistenz
  // 'app.fileSettings' (PO-Entscheidung: loeschen, nicht konvertieren —
  // die pfad-basierte Ablage war genau die nicht-portable Loesung, die das
  // Frontmatter-Modell ersetzt). Null-Setzen statt Delete: Muster der
  // Bookmarks-Legacy-Migration; der Store kennt keine Delete-Bruecke.
  const legacyFileSettings = await api.getSetting('app.fileSettings');
  if (legacyFileSettings != null) {
    void api.setSetting('app.fileSettings', null);
  }
  // 4T-0204: Task-Status-Set laden und beide Pipeline-Instanzen
  // konfigurieren (nach loadTranslations — Default-Labels via t()).
  await initTaskStates();
  // 4T-0498: Aufgaben-Konfiguration laden (nach loadTranslations — die
  // Badge-Labels kommen via t()) und den Toggle-Semantik-Hook registrieren.
  await initTasks();
  // 4T-0506 (Epic 3E-0096): Bearbeiten-Knopf der Task-Abfrage-Treffer auf
  // den Task-Dialog verdrahten.
  initTaskDialog();
  // 4T-0526 (Epic 3E-0095): Erinnerungs-Dialog an die Main-Zustellung
  // anschließen (nach loadTranslations — Dialog-Texte via t()).
  initReminders();
  // 4T-0284: Frontmatter-Anzeige-Setting laden und die Preload-Pipeline
  // konfigurieren, bevor die Panes gerendert werden.
  await initFrontmatterDisplayFromStore();
  // 4T-0471 (Epic 3E-0087): Nummerierungs-Setting laden und die Preload-
  // Pipeline konfigurieren, bevor die Panes gerendert werden.
  await initHeadingNumberingFromStore();
  // 4T-0412 (Epic 3E-0078): Skript-Block-Schalter laden, bevor die Panes
  // gerendert werden (entscheidet Ausführung vs. Quelltext-Darstellung).
  await initPerspectiveScriptsFromStore();
  // 4T-0292: Erweiterungs-Schalt-Zustand laden und die Preload-Pipeline
  // mit dem aktiven Plugin-Satz aufbauen, bevor die Panes gerendert werden.
  attachExtensionPersistence(persistSetting);
  await initExtensionsFromStore();
  // 4T-0298 (Epic 3E-0053): externe Erweiterungen scannen und die
  // aktivierten, bestaetigten laden — nach den internen (Registry-
  // Anbindung), vor dem Sidebar-Layout (Panel-Positionen) und vor dem
  // Erst-Render (Markdown-Plugins wirken ab dem ersten Aufbau).
  attachExternalPersistence(persistSetting);
  attachExtensionHostRuntime({
    commandHandlers,
    registerSettingsSection,
    unregisterSettingsSection,
  });
  await initExternalExtensions();

  // 4T-0287 (Epic 3E-0051): Persist-Helfer des Sidebar-Layout-Modells
  // anhängen (Statusbar-Feedback bei Store-Schreibfehlern, Muster W-20).
  attachSidebarLayoutPersistence(persistSetting);
  // 4T-0288: Sidebar-Layout und Breiten laden (inklusive Migration der
  // bisherigen gemeinsamen Breite outline.width) — vor applyAllLayouts,
  // damit das erste Slot-Mounting bereits das persistierte Layout sieht.
  await initSidebarLayoutFromStore();
  // 4T-0569 (Epic 3E-0104): persistierte Panel-Toggle-Reihenfolge laden und
  // die Statusbar-Leiste darauf anordnen (bindUi lief mit dem Default; die
  // Menue-Seite zieht ueber die laufenden reportMenuStateNow-Meldungen nach).
  await initPanelToggleOrderFromStore();
  applyPanelButtonOrder();
  // 4T-0520 (Epic 3E-0094): persistierte Kommando-Platzierung laden —
  // vor initCommandPlacementUi (siehe unten), das Segment und Hide-Liste
  // auf diesen Stand bringt.
  await initCommandPlacementFromStore();
  // 4T-0607 (Epic 3E-0114): persistierte Format-Toolbar-Belegung laden —
  // vor initFormatToolbarUi (siehe unten), das die Leisten darauf aufbaut.
  await initFormatToolbarFromStore();
  // 4T-0475 (Epic 3E-0088): manuell eingestellte Panel-Höhen laden — vor
  // applyAllLayouts, damit das erste Slot-Mounting die Höhen bereits kennt.
  await loadSidebarPanelHeights();
  // 4T-0624 (Epic 3E-0119): benannte Sidebar-Varianten laden; 4T-0625:
  // dazu die Bereichs-Varianten des Fenster-Bereichs.
  await initSidebarVariantsFromStore();
  await refreshAreaVariants();
  // 4T-0014: Outline-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadOutlineSettings();
  // 4T-0015: Backlinks-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadBacklinksSettings();
  // 4T-0073: Outgoing-Links-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadOutgoingSettings();
  // 4T-0075: Bookmark-Baum und Sektions-Sichtbarkeit aus den Settings laden.
  await loadBookmarksTree();
  await loadBookmarksSettings();
  // 4T-0612 (Epic 3E-0115): Bereichs-Lesezeichen aus der Bereichsdatei laden
  // (leer ohne Bereich; der Bereichs-Wechsel zieht ueber onWindowDisplayInfo
  // nach).
  await loadAreaBookmarks();
  // 4T-0051: Properties-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadPropertiesSettings();
  // 4T-0056: Tag-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadTagsSettings();
  // 4T-0359 (Epic 3E-0066): Notizen-Panel-Sichtbarkeit pro Spalte laden.
  await loadNotesSettings();
  // 4T-0759 (Epic 3E-0142): Suchergebnis-Panel-Sichtbarkeit pro Spalte laden.
  await loadSearchResultsSettings();
  // 4T-0434 (Epic 3E-0081): Kalender-Panel-Sichtbarkeit pro Spalte laden.
  await loadCalendarSettings();
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Panel-Sichtbarkeit pro Spalte laden.
  await loadFileGraphSettings();
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Panel-Sichtbarkeit pro Spalte laden.
  await loadRemindersSettings();
  // 4T-0372 (Epic 3E-0069): Uhr-Panel-Sichtbarkeit pro Spalte und die
  // globalen Anzeige-Optionen laden, bevor die Panes gerendert werden.
  await loadClockSettings();
  await initClockOptionsFromStore();
  // 4T-0637 (Epic 3E-0069): Wecker-Liste laden (app-weit, nicht pro Bereich).
  await initAlarmsFromStore();
  // 4T-0638 (Epic 3E-0069): Timer und Stoppuhr laden; laufende Einträge
  // rechnen ihre Zeit aus den gespeicherten Zeitstempeln weiter.
  await initTimersFromStore();
  // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel-Sichtbarkeit laden.
  await loadBlockPropsSettings();
  // 4T-0341 (Epic 3E-0061): Unterseiten-Sichtbarkeit pro Spalte laden.
  await loadSubpagesSettings();
  // 4T-0327 (Epic 3E-0059): Bereichs-Panel-Sichtbarkeit pro Spalte laden.
  await loadAreaPanelSettings();
  // 4T-0018: Schriftart und -groesse fuer Editor und Render-Pane aus den
  // Settings laden und als CSS-Variablen auf :root setzen, bevor die Panes
  // gerendert werden — damit greifen die Werte direkt beim ersten Paint.
  applyAppearanceVars(await readAppearanceFromStore());
  // 4T-0019: Fokus-Modus und Typewriter-Scroll aus den Settings laden.
  // Beide werden global gehalten (nicht pro Fenster) und auf das frische
  // Fenster angewendet, bevor die Panes erzeugt werden, sodass das
  // Compartment beim ersten createEditorState bereits die richtige
  // Konfiguration hat.
  state.focusMode = !!(await api.getSetting('focusMode'));
  state.typewriterScroll = !!(await api.getSetting('typewriterScroll'));
  // 4T-0294: Fokus-Modus nur bei aktiver Erweiterung anwenden (die
  // persistierte Preference bleibt in jedem Fall erhalten).
  document.body.classList.toggle('focus-mode', state.focusMode && isExtensionActive('focus-mode'));
  // 4T-0697 (Epic 3E-0141): Kollaps-Zustand der Sidebar-Spalten global laden
  // (Muster Fokus-Modus). Auf das frische Fenster angewendet, bevor die Panes
  // gerendert werden; renderSidebarSide zieht ihn beim ersten Render nach. Ist
  // die Erweiterung 'sidebar-collapse' deaktiviert, hebt ihr Laufzeit-Hook den
  // geladenen Zustand beim Anhängen (registerExtensionRuntimeHooks) wieder auf.
  state.sidebarCollapsed = normalizeSidebarCollapsed(await api.getSetting('sidebarCollapsed'));
  // 4T-0207: Hotkey-Overrides laden und Dispatcher-Map bauen — VOR bindUi
  // und dem ersten Editor-Aufbau, damit Dispatcher und Editor-Keymap von
  // Anfang an die effektiven Bindings nutzen. Ohne Overrides entspricht
  // alles exakt den Registry-Defaults (Verhaltens-Identitaet).
  const storedHotkeys = await api.getSetting('hotkeys');
  state.hotkeyOverrides =
    storedHotkeys && typeof storedHotkeys === 'object' && !Array.isArray(storedHotkeys)
      ? storedHotkeys
      : {};
  rebuildHotkeyDispatchMap();
  // 4T-0294: Laufzeit-Hooks der UI-tragenden Erweiterungen anhaengen und
  // die Statusbar-Buttons auf den geladenen Schalt-Zustand bringen.
  registerExtensionRuntimeHooks();
  applyExtensionButtonVisibility();
  // 4T-0522 (Epic 3E-0094): Makro-Kommandos registrieren, BEVOR das
  // Segment rendert (Statusbar-Buttons auf macro.-Kommandos filtern
  // gegen die Registry).
  initMacros({
    registerHandler: (commandId, fn) => {
      commandHandlers[commandId] = fn;
    },
    unregisterHandler: (commandId) => {
      delete commandHandlers[commandId];
    },
    refreshHotkeys: rebuildHotkeyDispatchMap,
  });
  // 4T-0520 (Epic 3E-0094): Kommando-Platzierung verdrahten (Mehr-Menue,
  // Resize-Beobachtung, Broadcast-Empfang) und Segment plus Hide-Liste
  // auf den geladenen Stand bringen.
  initCommandPlacementUi();
  // 4T-0607 (Epic 3E-0114): Format-Toolbar verdrahten (Mehr-Menues,
  // Resize-Beobachtung pro Leiste, Broadcast-Empfang) und die Leisten auf
  // den geladenen Stand bringen.
  initFormatToolbarUi();

  // Bindings
  bindUi();
  bindPaneEvents();
  bindSearchUi();
  await initSearchFromSettings();

  // Datei-Events. onOpenExternal wird bereits beim Modul-Laden synchron
  // registriert (siehe oben), damit das 'file:openExternal' beim kalten Start
  // mit Datei-Argument nicht verpasst wird.
  api.onFileChanged((p) => reloadFile(p));
  api.onFileRemoved((p) => markFileMissing(p));
  // 4T-0331 (Epic 3E-0060): defekte .mdd — Protokollierung ist main-seitig
  // ausgesetzt, der Nutzer sieht den Grund in der Statusbar.
  api.onMddDefect(() => {
    showStatusbarHint('history.defectHint', { duration: 5000, error: true });
    // Zustand koennte auf pausiert gewechselt haben.
    void updateHistoryStatus();
  });
  // 4T-0332 (Epic 3E-0060): Statusbar-Element der Dokument-Historie
  // (Klick-Menue fuer den Datei-Schalter, Initial-Zustand).
  initHistoryStatus();
  // 4T-0333 (Epic 3E-0060): Historien-Ansicht als System-Seite registrieren.
  initHistoryPage();
  // 4T-0455 (Epic 3E-0084): Bereichs-Graph-Seite registrieren.
  initGraphTab();
  // 4T-0620 (Epic 3E-0117): Bereichs-Statistik-Seite registrieren.
  initAreaStatsPage();
  // 4T-0480 (Epic 3E-0089): Kommando-Palette — Ausfuehrungs-Pfad injizieren
  // (global dispatchte Kommandos laufen ueber die commandHandlers-Map).
  initCommandPalette({
    // 4T-0520 (Epic 3E-0094): Rueckgabe des Handler-Ergebnisses, damit
    // executeCommandById die Guard-Konvention (false = nicht verarbeitet)
    // als Fehlschlag-Signal fuer Buttons und Makro-Schritte sieht; die
    // Palette selbst ignoriert die Rueckgabe unveraendert.
    executeCommand: (commandId) => {
      const handler = commandHandlers[commandId];
      if (!handler) return false;
      return handler();
    },
  });

  // Initialen Zustand vom Main-Prozess uebernehmen. Main schickt das Event
  // IMMER (auch leer), sodass wir deterministisch darauf warten koennen,
  // statt selbst aus den Settings zu lesen — das gehoert im Multi-Window-Setup
  // in den Main-Prozess, der die Pane-Zuordnung pro Fenster kennt.
  const initialState = await initialStatePromise;
  if (initialState && Array.isArray(initialState.panes) && initialState.panes.length > 0) {
    await restorePanes(initialState.panes);
  }
  // 4T-0368 (Epic 3E-0068): wiederhergestellte Entwuerfe als Unbenannt-Tabs im
  // ersten Pane oeffnen (vor applyAllLayouts, damit sie mitgerendert werden).
  if (initialState && Array.isArray(initialState.drafts) && initialState.drafts.length > 0) {
    openDraftsAsUntitled(initialState.drafts);
  }

  applyAllLayouts();

  // Init ist durch — gepufferte Datei-Argumente vom kalten Start jetzt oeffnen,
  // und ab jetzt direkt verarbeiten statt zu puffern.
  initDone = true;
  // 4T-0614 (Epic 3E-0115): ehrliches Bereitschafts-Signal fuer E2E-Tests.
  // bindUi() bindet die Statusbar-Toggle-Klicks (u.a. #btn-bookmarks) erst hier
  // im init()-Verlauf, waehrend applyPanelButtonOrder() die Panel-Buttons schon
  // deutlich frueher umsortiert. Der bisherige E2E-Marker (erster Panel-Button)
  // ist damit kein verlaesslicher Beleg mehr, dass init() vollstaendig durch ist
  // und die Buttons klickbar sind. Dieses Attribut steht erst nach initDone und
  // nach bindUi(); Tests, die unmittelbar nach dem Fenster-Start klicken oder
  // tippen, warten darauf. Fuer den Produktivbetrieb ohne Wirkung.
  document.body.setAttribute('data-renderer-ready', '1');
  if (pendingExternalFiles.length > 0) {
    const files = pendingExternalFiles.splice(0);
    await openInPane(state.activePaneIndex, files);
  }
  // 4T-0012: ggf. gepufferte Tab-Appends aus anderen Fenstern abarbeiten.
  if (pendingAppendPayloads.length > 0) {
    const payloads = pendingAppendPayloads.splice(0);
    for (const p of payloads) await handleAppendTabFromOtherWindow(p);
  }
  // M-08 (4T-0185): waehrend der Initialisierung eingetroffenen
  // Sprachwechsel nachziehen (Renn-Fenster zwischen Store-Lesen und
  // Listener-Wirksamkeit).
  if (pendingLanguageChange && pendingLanguageChange !== state.language) {
    await applyLanguageChange(pendingLanguageChange, { persist: false });
  }
  pendingLanguageChange = null;
  // 4T-0539 (Epic 3E-0098): waehrend der Initialisierung eingetroffenen
  // Erweiterungs-Schalt-Broadcast nachziehen (gleiches Renn-Fenster wie der
  // Sprachwechsel; applyExtensionsState ist bei unveraendertem Zustand ein
  // No-op). Der Fenster-Titel folgt dem Erweiterungs-Zustand.
  if (pendingExtensionsChange) {
    const ids = pendingExtensionsChange;
    pendingExtensionsChange = null;
    await applyExtensionsState(ids, { persist: false });
    updateWindowTitle();
  }
}

export async function restorePanes(saved) {
  // saved = [{paths, activeIndex, viewMode (legacy)?, tabSettings?}, ...]
  // W-14 (4T-0308): Zahl der nicht lesbaren Tabs sammeln, um am Ende einen
  // Hinweis zu geben (statt still zu verwerfen).
  let missingCount = 0;
  state.panes = [];
  for (let i = 0; i < Math.min(saved.length, MAX_PANES); i++) {
    state.panes.push(createEmptyPane());
  }
  if (state.panes.length === 0) state.panes.push(createEmptyPane());

  for (let i = 0; i < state.panes.length; i++) {
    const entry = saved[i];
    const paths = Array.isArray(entry.paths) ? entry.paths : [];
    const tabSettings = Array.isArray(entry.tabSettings) ? entry.tabSettings : [];
    // Migration: alter Pane-viewMode → für alle Tabs der Pane übernehmen.
    const legacyViewMode = entry.viewMode;

    for (let j = 0; j < paths.length; j++) {
      const p = paths[j];
      try {
        const data = await api.readFile(p);
        // W-01 (4T-0309): {ok,error}-Vertrag — Lesefehler ueber den catch
        // (missing-Tab, W-14) statt frueherer IPC-Exception.
        if (!data || !data.ok) throw new Error((data && data.error) || 'read failed');
        const settings = tabSettings[j] || {};
        if (legacyViewMode && !settings.viewMode) settings.viewMode = legacyViewMode;
        state.panes[i].tabs.push(createTab(data.path, data.content, settings));
      } catch {
        // W-14 (4T-0308): Tab nicht still verwerfen. Der Fehler trifft nicht
        // nur geloeschte Dateien, sondern auch transiente Faelle (Lock,
        // Berechtigung), bei denen die Datei noch existiert; ein Verwerfen
        // wuerde den Tab beim naechsten persistState() dauerhaft aus der
        // Sitzung entfernen. Stattdessen als missing-Tab aufnehmen (Muster
        // markFileMissing) — beim naechsten Start wird die Datei erneut
        // gelesen, ein transienter Fehler kostet den Tab nicht mehr.
        const settings = tabSettings[j] || {};
        if (legacyViewMode && !settings.viewMode) settings.viewMode = legacyViewMode;
        const tab = createTab(p, '', settings);
        tab.missing = true;
        state.panes[i].tabs.push(tab);
        missingCount++;
      }
    }
    const wantedActive = Number.isInteger(entry.activeIndex) ? entry.activeIndex : 0;
    // R3-13 (4T-0187): den aktiven Tab ueber den PFAD in der bereinigten
    // Liste suchen — geloeschte Dateien verschieben sonst den Index und
    // ein Nachbar-Tab wird aktiv.
    const wantedPath = paths[wantedActive];
    let restoredActive = state.panes[i].tabs.findIndex((tb) => tb.path === wantedPath);
    if (restoredActive < 0) {
      restoredActive = Math.min(wantedActive, state.panes[i].tabs.length - 1);
    }
    state.panes[i].activeIndex =
      state.panes[i].tabs.length === 0 ? -1 : Math.max(0, restoredActive);

    // 4T-0459 (Epic 3E-0085): Tab-Gruppen der Pane wiederherstellen. Jeder
    // Snapshot-Pfad erzeugt oben genau einen Tab (missing eingeschlossen),
    // daher fluchten die tabSettings-Indizes mit den Tab-Indizes. Alte
    // Snapshots ohne groups-Feld laufen unveraendert durch (No-op).
    restoreGroupsIntoPane(
      state.panes[i],
      entry.groups,
      tabSettings.map((s) => (s && Number.isInteger(s.group) ? s.group : -1)),
    );
  }

  // Wenn linke Pane leer und rechte gefüllt: rechte hochziehen.
  if (
    state.panes.length === 2 &&
    state.panes[0].tabs.length === 0 &&
    state.panes[1].tabs.length > 0
  ) {
    state.panes = [state.panes[1]];
  } else if (state.panes.length === 2 && state.panes[1].tabs.length === 0) {
    state.panes.pop();
  }
  state.activePaneIndex = 0;

  // W-14 (4T-0308): sichtbares Feedback, wenn Tabs nicht gelesen werden
  // konnten (statt stillem Verwerfen). Sie bleiben als missing-Tabs erhalten.
  if (missingCount > 0) {
    showStatusbarHint('session.restoreMissing', {
      error: true,
      duration: 4000,
      text: t('session.restoreMissing').replace('{count}', String(missingCount)),
    });
  }
}

// --- UI-Bindings ------------------------------------------------------------
export function bindUi() {
  // "Öffnen", "Über", "Hilfe" und die Sitzungs-Checkbox sind seit 4T-0002 nicht
  // mehr in der UI, sondern im nativen Menue (siehe 4T-0001). Hier bleiben nur
  // noch die Bindings fuer Empty-State-Button und die Modal-Schliesser, plus
  // die Statusbar-Toggles und der Sprach-Selektor.
  $('#btn-open-empty').addEventListener('click', openDialog);
  $('#btn-about-close').addEventListener('click', hideAbout);
  aboutModal.querySelector('.about-modal-backdrop').addEventListener('click', hideAbout);

  // 4T-0674 (Epic 3E-0135): Rückverweis auf die Produkt-Webseite. Der Klick
  // öffnet die sprachabhängige Adresse (about.websiteUrl) im Standard-Browser
  // über die bestehende externe-Link-Brücke; der http/https-Guard sitzt im
  // Main-Handler. Von sich aus nimmt die App keine Verbindung auf.
  const aboutWebsiteLink = $('#about-website-link');
  if (aboutWebsiteLink) {
    aboutWebsiteLink.addEventListener('click', (e) => {
      e.preventDefault();
      api.openExternal(t('about.websiteUrl'));
    });
  }

  // 4T-0072: Word-Count-Statusbar-Button und Detail-Dialog.
  const wordcountBtn = document.getElementById('statusbar-wordcount');
  if (wordcountBtn) {
    wordcountBtn.addEventListener('click', openWordCountDialog);
  }
  const wordcountModal = document.getElementById('wordcount-modal');
  if (wordcountModal) {
    const closeBtn = document.getElementById('btn-wordcount-close');
    if (closeBtn) closeBtn.addEventListener('click', closeWordCountDialog);
    const backdrop = wordcountModal.querySelector('.wordcount-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeWordCountDialog);
  }

  // 4T-0050: Alias-Disambiguation-Dialog. Cancel-Button und Backdrop-Klick
  // schliessen mit null (Abbruch). Die Kandidaten-Buttons werden pro
  // Dialog-Aufruf dynamisch verkabelt; siehe showAliasDialog.
  $('#btn-alias-cancel').addEventListener('click', cancelAliasDialog);
  aliasModal.querySelector('.alias-modal-backdrop').addEventListener('click', cancelAliasDialog);

  // 4T-0279: Der modale Einstellungs-Dialog ist vollstaendig abgeloest —
  // alle Bindings (Buttons, Backdrop, Live-Vorschau, Datalist-Trick)
  // leben jetzt in settings-page.js am Seiten-DOM.

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });

  $('#btn-wrap').addEventListener('click', toggleWrapLines);
  $('#btn-numbers').addEventListener('click', toggleShowLineNumbers);
  $('#btn-fold-gutter').addEventListener('click', toggleShowFoldGutter);
  if (btnEdit) btnEdit.addEventListener('click', toggleEditMode);
  // 4T-0070: Statusbar-Toggle fuer Scroll-Synchronisation. Wirkt pro Tab,
  // analog zu btn-edit. Tooltip wird zur Laufzeit aus dem Tab-State gesetzt.
  const btnScrollSync = document.getElementById('btn-scroll-sync');
  if (btnScrollSync) btnScrollSync.addEventListener('click', toggleScrollSyncForActiveTab);
  if (typeof api.onMenuToggleScrollSync === 'function') {
    api.onMenuToggleScrollSync(() => toggleScrollSyncForActiveTab());
  }

  // 4T-0030: Klick auf den Statusbar-Theme-Button zykliert den Pref. Die
  // tatsaechliche Theme-Anwendung passiert ueber den Broadcast aus dem Main
  // ('theme:prefChanged' aktualisiert das Icon, 'theme:changed' das
  // data-theme-Attribut und Mermaid).
  if (btnTheme) {
    btnTheme.addEventListener('click', async () => {
      const next = THEME_NEXT[state.themePref] || 'system';
      // Optimistisches Icon-Update, damit der Klick sofort eine Rueckmeldung
      // gibt; der Broadcast aus Main bestaetigt den Wert anschliessend.
      state.themePref = next;
      applyThemePrefToButton(next);
      try {
        await api.setThemePref(next);
      } catch (err) {
        console.warn('setThemePref schlug fehl:', err);
      }
    });
  }

  // 4T-0014: Statusbar-Toggle fuer Outline-Panel der aktiven Spalte.
  const btnOutline = $('#btn-outline');
  if (btnOutline) {
    btnOutline.addEventListener('click', () => toggleOutlinePanel(state.activePaneIndex));
  }
  // 4T-0015: Statusbar-Toggle fuer Backlinks-Panel der aktiven Spalte.
  const btnBacklinks = $('#btn-backlinks');
  if (btnBacklinks) {
    btnBacklinks.addEventListener('click', () => toggleBacklinksPanel(state.activePaneIndex));
  }
  // 4T-0073: Statusbar-Toggle fuer Outgoing-Links-Panel der aktiven Spalte.
  const btnOutgoingLinks = $('#btn-outgoing-links');
  if (btnOutgoingLinks) {
    btnOutgoingLinks.addEventListener('click', () => toggleOutgoingPanel(state.activePaneIndex));
  }
  // 4T-0075: Statusbar-Toggle fuer Bookmarks-Panel der aktiven Spalte.
  const btnBookmarks = $('#btn-bookmarks');
  if (btnBookmarks) {
    btnBookmarks.addEventListener('click', () => toggleBookmarksPanel(state.activePaneIndex));
  }
  // 4T-0327/4T-0330: der Statusbar-Toggle des Bereichs-Panels bindet sich
  // synchron beim Modul-Laden in area-panel.js (das Panel ist vor init()
  // sichtbar; ein frueher Klick darf nicht verpuffen).
  // 4T-0078: Bestaetigungs-Dialog beim Folder-Entfernen.
  const bookmarkConfirmRemoveModal = document.getElementById('bookmark-confirm-remove-modal');
  if (bookmarkConfirmRemoveModal) {
    const okBtn = document.getElementById('btn-bookmark-confirm-remove-ok');
    if (okBtn) okBtn.addEventListener('click', confirmBookmarkConfirmRemove);
    const cancelBtn = document.getElementById('btn-bookmark-confirm-remove-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeBookmarkConfirmRemoveDialog);
    const backdrop = bookmarkConfirmRemoveModal.querySelector('.bookmark-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeBookmarkConfirmRemoveDialog);
  }
  // 4T-0078: Modal-Picker "In Ordner verschieben...".
  const bookmarkMoveModal = document.getElementById('bookmark-move-modal');
  if (bookmarkMoveModal) {
    const confirmBtn = document.getElementById('btn-bookmark-move-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmBookmarkMove);
    const cancelBtn = document.getElementById('btn-bookmark-move-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeBookmarkMoveDialog);
    const backdrop = bookmarkMoveModal.querySelector('.bookmark-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeBookmarkMoveDialog);
  }
  // 4T-0051: Statusbar-Toggle fuer Properties-Panel der aktiven Spalte.
  const btnProperties = $('#btn-properties');
  if (btnProperties) {
    btnProperties.addEventListener('click', () => togglePropertiesPanel(state.activePaneIndex));
  }
  // 4T-0051: Add-Field-Buttons pro Pane verkabeln (Sidebar-Sektion).
  // R4-05 (4T-0177): ueber die statische Pane-Anzahl iterieren — beim
  // bindUi-Lauf ist state.panes.length immer 1, die zweite Pane blieb
  // sonst dauerhaft unverkabelt.
  for (let p = 0; p < MAX_PANES; p++) {
    const elsP = getPaneEls(p);
    if (elsP && elsP.propertiesAddBtn) {
      elsP.propertiesAddBtn.addEventListener('click', () => addPropertiesField(p));
    }
  }
  // 4T-0051: Menue-Trigger 'Ansicht -> Properties' toggelt das Panel der
  // aktiven Spalte. Pattern wie Outline/Backlinks.
  if (typeof api.onMenuToggleProperties === 'function') {
    api.onMenuToggleProperties(() => togglePropertiesPanel(state.activePaneIndex));
  }
  // 4T-0448 (Epic 3E-0083): profiles:changed-Broadcast (Konfigurations-
  // Aenderung, auch aus anderen Fenstern) zieht die Profil-Aufloesung der
  // Eigenschafts-Editoren nach.
  if (typeof api.onProfilesChanged === 'function') {
    api.onProfilesChanged(() => handleProfilesChanged());
  }
  // 4T-0359 (Epic 3E-0066): Notizen-Panel — Statusbar-Toggle, Menue-Trigger und
  // einmaliges Event-Wiring der Textareas beider Spalten (initNotesPanel).
  const btnNotes = $('#btn-notes');
  if (btnNotes) {
    btnNotes.addEventListener('click', () => toggleNotesPanel(state.activePaneIndex));
  }
  if (typeof api.onMenuToggleNotes === 'function') {
    api.onMenuToggleNotes(() => toggleNotesPanel(state.activePaneIndex));
  }
  initNotesPanel();
  // 4T-0759 (Epic 3E-0142): Suchergebnis-Panel — Statusbar-Toggle und
  // Tastatur-Wiring. Der Menue-Weg laeuft ueber den generischen
  // Panel-Trigger (onMenuTogglePanel), ein eigener Kanal entfaellt.
  const btnSearchResults = $('#btn-search-results');
  if (btnSearchResults) {
    btnSearchResults.addEventListener('click', () =>
      toggleSearchResultsPanel(state.activePaneIndex),
    );
  }
  initSearchResultsPanel();
  // 4T-0760 (Epic 3E-0142): Beide Sprung-Wege der Raum-Suche verdrahten —
  // aus der Trefferliste (Klick, Enter) und aus der Suchleiste (F3). Beide
  // fuehren durch dieselbe Funktion, damit Liste und Zaehler nicht
  // auseinanderlaufen.
  setzeRaumSprungHandler(springeZuTreffer);
  setzeRaumMarkierHandler(markiereOffeneRaumSeite);
  setzeSprungHandler((treffer, index) => {
    setzeRaumIndex(index);
    void springeZuTreffer(treffer);
    updateSearchCounter();
  });
  // 4T-0434 (Epic 3E-0081): Kalender-Panel — Statusbar-Toggle und
  // einmaliges Event-Wiring beider Spalten.
  const btnCalendar = $('#btn-calendar');
  if (btnCalendar) {
    btnCalendar.addEventListener('click', () => toggleCalendarPanel(state.activePaneIndex));
  }
  initCalendarPanel();
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Panel — Steuerungs-Wiring und
  // Index-Invalidierungs-Refresh.
  initFileGraphPanel();
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Panel — Statusbar-Toggle,
  // Menue-Trigger und Refresh-Broadcasts.
  const btnReminders = $('#btn-reminders');
  if (btnReminders) {
    btnReminders.addEventListener('click', () => toggleRemindersPanel(state.activePaneIndex));
  }
  if (typeof api.onMenuToggleReminders === 'function') {
    api.onMenuToggleReminders(() => toggleRemindersPanel(state.activePaneIndex));
  }
  initRemindersPanel();
  // 4T-0372 (Epic 3E-0069): Uhr-Panel — Statusbar-Toggle plus Timer-,
  // Sprach- und Broadcast-Wiring. Der Menue-Weg laeuft ueber den zentralen
  // Panel-Trigger (onMenuTogglePanel), ein eigener Kanal entfaellt.
  const btnClock = $('#btn-clock');
  if (btnClock) {
    btnClock.addEventListener('click', () => toggleClockPanel(state.activePaneIndex));
  }
  initClockPanel();
  // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel — Statusbar-Toggle,
  // Menue-Trigger und einmaliges Event-Wiring beider Spalten.
  const btnBlockprops = $('#btn-blockprops');
  if (btnBlockprops) {
    btnBlockprops.addEventListener('click', () => toggleBlockPropsPanel(state.activePaneIndex));
  }
  if (typeof api.onMenuToggleBlockProps === 'function') {
    api.onMenuToggleBlockProps(() => toggleBlockPropsPanel(state.activePaneIndex));
  }
  initBlockPropsPanel();
  // 4T-0365 (Epic 3E-0067): Broadcast-Listener des Block-Metadaten-Indikators.
  initBlockMetaIndicators();
  // 4T-0056: Statusbar-Toggle fuer Tags-Panel der aktiven Spalte.
  const btnTags = $('#btn-tags');
  if (btnTags) {
    btnTags.addEventListener('click', () => toggleTagsPanel(state.activePaneIndex));
  }
  // 4T-0056: Filter-Input pro Pane mit input-Event verkabeln.
  // R4-05 (4T-0177): statische Pane-Anzahl, siehe oben.
  for (let p = 0; p < MAX_PANES; p++) {
    const elsP = getPaneEls(p);
    if (elsP && elsP.tagsFilter) {
      elsP.tagsFilter.addEventListener('input', () => {
        state.tags.queryByPane[p] = elsP.tagsFilter.value;
        // R5-14 (4T-0180): Query-Filterung ist clientseitig — aus dem
        // Payload-Cache rendern statt pro Tastendruck einen IPC zu feuern.
        renderTagsFromCache(p);
      });
    }
  }
  // 4T-0056: Menue-Trigger 'Ansicht -> Tags' toggelt das Panel.
  if (typeof api.onMenuToggleTags === 'function') {
    api.onMenuToggleTags(() => toggleTagsPanel(state.activePaneIndex));
  }
  // 4T-0341 (Epic 3E-0061): Menue-Trigger 'Ansicht -> Unterseiten'.
  if (typeof api.onMenuToggleSubpages === 'function') {
    api.onMenuToggleSubpages(() => toggleSubpagesPanel(state.activePaneIndex));
  }
  // 4T-0456 (Epic 3E-0084): Menue-Trigger 'Ansicht -> Datei-Graph'.
  if (typeof api.onMenuToggleFileGraph === 'function') {
    api.onMenuToggleFileGraph(() => toggleFileGraphPanel(state.activePaneIndex));
  }
  // 4T-0626 (Epic 3E-0119): Untermenue 'Ansicht -> Sidebar-Anordnungen' —
  // Standard-Anordnung, Variante anwenden (scope global|area), Speichern.
  if (typeof api.onMenuResetSidebarLayout === 'function') {
    api.onMenuResetSidebarLayout(() => {
      void resetSidebarLayout();
    });
  }
  if (typeof api.onMenuApplySidebarVariant === 'function') {
    api.onMenuApplySidebarVariant((payload) => {
      if (!payload || typeof payload.id !== 'string') return;
      const variant =
        payload.scope === 'area'
          ? findAreaVariantById(payload.id)
          : findGlobalVariantById(payload.id);
      if (variant) void applySidebarVariant(variant);
    });
  }
  if (typeof api.onMenuSaveSidebarVariant === 'function') {
    api.onMenuSaveSidebarVariant(() => {
      void showSaveVariantDialog();
    });
  }
  // 4T-0567 (Epic 3E-0104): Statusbar-Toggles der bisher button-losen
  // Panels Unterseiten und Datei-Graph (Zugangs-Symmetrie).
  const btnSubpages = $('#btn-subpages');
  if (btnSubpages) {
    btnSubpages.addEventListener('click', () => toggleSubpagesPanel(state.activePaneIndex));
  }
  const btnFileGraph = $('#btn-filegraph');
  if (btnFileGraph) {
    btnFileGraph.addEventListener('click', () => toggleFileGraphPanel(state.activePaneIndex));
  }
  // 4T-0568 (Epic 3E-0104): zentraler Menue-Trigger des Panel-Untermenues —
  // Payload ist die Panel-ID, der Toggle kommt aus der Panel-Registry.
  if (typeof api.onMenuTogglePanel === 'function') {
    api.onMenuTogglePanel((id) => {
      const def = sidebarPanelById(id);
      if (def && typeof def.toggle === 'function') void def.toggle(state.activePaneIndex);
    });
  }
  // 4T-0568 (Epic 3E-0104): Panel-Buttons einmalig in die effektive
  // Toggle-Reihenfolge bringen (statische DOM-Reihenfolge ist nur Fallback).
  applyPanelButtonOrder();
  // 4T-0207: Die frueheren Einzel-Listener fuer Sidebar-Toggles und
  // Bookmark (4T-0014/4T-0015/4T-0073/4T-0075) sind im zentralen
  // Kommando-Dispatcher aufgegangen (siehe unten, Abschnitt Tastenkuerzel).
  // 4T-0014: Folding-Aenderungen aus dem Editor (Gutter, Tastenkuerzel,
  // programmatisch) in die Outline durchreichen. Pfeil-Indikator wird gezielt
  // aktualisiert, ohne den gesamten Baum neu zu rendern.
  document.addEventListener('scg:foldchange', (ev) => {
    const pIdx = ev && ev.detail && typeof ev.detail.paneIdx === 'number' ? ev.detail.paneIdx : -1;
    if (pIdx < 0) return;
    if (!state.outline.visibleByPane[pIdx]) return;
    refreshAllOutlineFoldIndicators(pIdx);
  });

  langSelect.addEventListener('change', async (e) => {
    await applyLanguageChange(e.target.value, { persist: true });
  });

  // 4T-0017: Strg+Mausrad zoomt den Inhalt der fokussierten Pane in 10-%-
  // Schritten. preventDefault verhindert den Electron-/Browser-Default-Zoom.
  // passive:false ist Voraussetzung, damit preventDefault greift.
  panesContainer.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? +1 : -1;
      adjustTabZoom(state.activePaneIndex, delta);
    },
    { passive: false },
  );

  // 4T-0017: Zoom-Indikator in der Statusbar als Reset-Klickziel.
  const zoomIndicator = document.getElementById('zoom-indicator');
  if (zoomIndicator) {
    zoomIndicator.addEventListener('click', () => resetTabZoom(state.activePaneIndex));
  }

  // File-Drag&Drop für EXTERNE Dateien (nicht für Tab-Drag).
  let dragCounter = 0;
  function isFileDrag(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }
  window.addEventListener('dragenter', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounter += 1;
    if (dragCounter === 1) dropOverlay.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer) return;
    if (Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
    dragCounter = Math.max(0, dragCounter - 1);
    // 4T-0789: Hervorhebung mit zuruecksetzen, sonst traegt das Overlay sie
    // beim naechsten Ziehen ueber eine Nicht-Ablege-Zone noch.
    if (dragCounter === 0) schliesseDropUeberlagerung();
  });
  // 4T-0789 (Epic 3E-0125): Ablege-Zone der Anlagen. Massgeblich ist der ORT,
  // nicht der Dateityp (Architekturentscheidung des Epics): Die beiden Flaechen
  // des geoeffneten Dokuments nehmen Anlagen entgegen, alles uebrige oeffnet
  // weiter wie bisher. Der Ort ist vor dem Loslassen sichtbar, und eine
  // Markdown-Datei laesst sich so bewusst als Anlage anhaengen.
  //
  // Im leeren Zustand blendet updateEmptyState beide Flaechen aus; closest
  // findet dann nichts, und das Ziehen faellt von selbst auf das Oeffnen
  // zurueck. Der Fall braucht keine Sonderregel.
  //
  // Das Overlay traegt pointer-events: none und verdeckt die Erkennung nicht.
  function ablegeZone(e) {
    const el = e.target instanceof Element ? e.target : null;
    return el ? el.closest('.pane-source, .pane-rendered') : null;
  }
  const dropOverlayInner = dropOverlay ? dropOverlay.querySelector('.drop-overlay-inner') : null;
  window.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    // Rueckmeldung, welches der beiden Ergebnisse eintritt, samt Hervorhebung
    // der Flaeche; ohne sie waere das Ergebnis erst nach dem Loslassen sichtbar.
    const zone = ablegeZone(e);
    if (dropOverlayInner) {
      dropOverlayInner.textContent = t(zone ? 'drop.hintAttachment' : 'drop.hint');
    }
    dropOverlay.classList.toggle('is-attachment', !!zone);
  });

  // 4T-0789 (Epic 3E-0125), zweiter Befund des Product Owners: Das Aufraeumen
  // der Ueberlagerung laeuft in der CAPTURE-Phase und damit unabhaengig davon,
  // ob ein Handler weiter unten die Weitergabe stoppt.
  //
  // Anlass: Der drop-Handler der Editor-Flaeche muss stopPropagation rufen
  // (sonst legt der Fenster-Handler dieselbe Anlage ein zweites Mal ab). Das
  // Ereignis erreichte den Bubble-Handler unten daraufhin nicht mehr, und die
  // Ueberlagerung „Als Anlage ablegen" blieb nach dem Ablegen stehen. Die
  // Capture-Phase laeuft VOR dem Ziel-Element und ist von stopPropagation im
  // Bubble-Weg nicht betroffen.
  //
  // 'dragend' faengt zusaetzlich den Fall ab, dass der Zieh-Vorgang ohne Drop
  // endet (Abbruch mit Esc, Loslassen ausserhalb des Fensters).
  function schliesseDropUeberlagerung() {
    dragCounter = 0;
    dropOverlay.hidden = true;
    dropOverlay.classList.remove('is-attachment');
  }
  window.addEventListener('drop', schliesseDropUeberlagerung, true);
  window.addEventListener('dragend', schliesseDropUeberlagerung, true);

  window.addEventListener('drop', async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    schliesseDropUeberlagerung();

    // 4T-0789: Ablegen in der RENDER-Ansicht. Die Editor-Flaeche behandelt
    // ihren Drop selbst (drop-Handler in editor.js) und stoppt die Weitergabe,
    // weil das eingesetzte Editor-Modul sonst zusaetzlich den Datei-Inhalt als
    // Text einliest; hier kommen deshalb nur noch die uebrigen Flaechen an.
    const zone = ablegeZone(e);
    if (zone) {
      const paneEl = zone.closest('.pane-group');
      const paneIdx = paneEl ? Number(paneEl.dataset.pane) || 0 : state.activePaneIndex;
      const view = paneEditors[paneIdx];
      if (view && !view.state.readOnly) {
        const anlagen = anlagenAusDataTransfer(e.dataTransfer);
        if (anlagen.length > 0) {
          // In der Render-Ansicht gibt es keine Schreibmarke; der Verweis
          // landet am Dokument-Ende.
          await fuegeAnlagenEin(view, anlagen, view.state.doc.length);
          return;
        }
      }
    }

    const files = [];
    for (const f of e.dataTransfer.files) {
      const p = api.getPathForFile(f);
      if (p) files.push(p);
    }
    const targetPane = paneIndexAtPoint(e.clientX);
    if (files.length > 0) await openInPane(targetPane, files);
  });

  // Klicks außerhalb von Menüs schließen sie.
  document.addEventListener('mousedown', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
    // Regex-Hilfe schliessen bei Klick ausserhalb (Hilfe-Button toggelt selbst).
    if (isRegexHelpOpen()) {
      const help = getSearchEls();
      if (!help.helpPopover.contains(e.target) && !help.btnHelp.contains(e.target)) {
        closeRegexHelp();
      }
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Reihenfolge: Regex-Hilfe > Suchleiste > Modale (Hilfe, About) > Menues.
      if (isRegexHelpOpen()) {
        closeRegexHelp();
        return;
      }
      if (search.visible) {
        closeSearchBar();
        return;
      }
      // 4T-0019: Vor dem allgemeinen Hide-Block pruefen, ob etwas Sichtbares
      // mit Vorrang offen ist. Wenn ja, schliesst Esc nur dieses Element und
      // der Fokus-Modus bleibt unangetastet. Sonst verlaesst Esc den Fokus-
      // Modus (sofern aktiv). 4T-0216: das Hilfe-Modal ist aus der Kaskade
      // entfallen (Handbuch-Seiten sind normale Tabs ohne Esc-Semantik);
      // 4T-0279: der Einstellungs-Dialog ebenso (Seite statt Modal, Esc
      // schliesst den Tab bewusst nicht).
      const wordcountModalEl = document.getElementById('wordcount-modal');
      const hasOpenOverlay =
        !contextMenu.hidden ||
        !aboutModal.hidden ||
        !aliasModal.hidden ||
        (wordcountModalEl && !wordcountModalEl.hidden);
      hideContextMenu();
      hideAbout();
      // 4T-0072: Esc schliesst auch den Word-Count-Detail-Dialog.
      closeWordCountDialog();
      // 4T-0078: Esc schliesst die Bookmark-Modals und bricht Inline-Edit ab.
      closeBookmarkConfirmRemoveDialog();
      closeBookmarkMoveDialog();
      if (state.bookmarks && state.bookmarks.editingId) cancelInlineEdit();
      // 4T-0079: Esc bricht laufenden Drag-Vorgang ab (Indikatoren entfernen,
      // State leeren). Die Browser-DnD-API beendet den Drag-Vorgang
      // intern eh, wir raeumen den Visualisierungs-Zustand auf.
      if (state.bookmarks && state.bookmarks.dragging && state.bookmarks.dragging.sourceId) {
        handleBookmarkDragEnd();
      }
      // 4T-0289: Esc raeumt analog einen laufenden Panel-Drag auf.
      cancelPanelDrag();
      // 4T-0050: Esc bricht den Alias-Dialog ab; Resolver liefert null,
      // damit der wartende Klick-Handler sauber zuruecksetzt.
      if (!aliasModal.hidden) cancelAliasDialog();
      if (!hasOpenOverlay && state.focusMode) setFocusMode(false);
    }
    // F1 ist jetzt am Menue-Eintrag "Hilfe" als Accelerator gebunden, kein
    // manueller Handler hier mehr noetig.
  });

  // Tastenkürzel — zentraler Kommando-Dispatcher (4T-0207, Epic 3E-0015).
  // Ersetzt die frueheren verstreuten Hotkey-Vergleiche: eventToBinding
  // normalisiert den Tastendruck, der Map-Lookup ist O(1), der Handler
  // kommt aus commandHandlers. Fuer Symbol-Tasten (z.B. '+', das auf
  // englischem Layout Shift braucht) gibt es einen zweiten Lookup ohne
  // Shift-Modifier — das erhaelt das layoutunabhaengige Zoom-Verhalten
  // aus 4T-0017. Die Escape-Kaskade und die Nicht-Registry-Bindings
  // (Tab-Indent, Such-Enter, Strg+Mausrad) bleiben eigene Listener.
  window.addEventListener('keydown', (e) => {
    const binding = eventToBinding(e);
    if (!binding) return;
    let commandId = hotkeyDispatchMap.get(binding);
    if (commandId === undefined && isShiftSymbolEvent(e)) {
      commandId = hotkeyDispatchMap.get(stripShiftFromBinding(binding));
    }
    if (commandId === undefined) return;
    const handler = commandHandlers[commandId];
    if (!handler) return;
    if (handler() !== false) e.preventDefault();
  });

  // Menue-Aktionen vom Main-Prozess. Klicks auf Menue-Eintraege werden ueber
  // IPC an den Renderer geschickt, der dieselben Funktionen aufruft, die auch
  // an die Kommando-Handler gebunden sind (die fruehere Toolbar ist seit
  // 4T-0002 nicht mehr in der UI).
  api.onMenuNew(() => newUntitledTab());
  // 4T-0319 (Epic 3E-0057): 'Datei -> Neue Applikation'.
  api.onMenuNewApplication(() => api.newApplication());
  // 4T-0322 (Epic 3E-0058): 'Datei -> Bereich oeffnen.../Bereich schliessen'.
  api.onMenuOpenArea(() => api.openArea());
  // 4T-0632 (Epic 3E-0102): Demo-Area erstellen (Dialog und Ablauf im Main).
  if (typeof api.onMenuCreateDemoArea === 'function') {
    api.onMenuCreateDemoArea(() => api.createDemoArea());
  }
  api.onMenuCloseArea(() => api.closeArea());
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Aktionen aus dem Datei-Menue
  // (Dialoge im Renderer, Lebenszyklus im Main).
  api.onMenuWorkspaceSaveAs(() => {
    void saveWorkspaceAs();
  });
  api.onMenuWorkspaceCreate(() => {
    void createWorkspace();
  });
  api.onMenuWorkspaceClose(() => closeWorkspace());
  api.onMenuWorkspaceManage(() => {
    void showWorkspaceManager();
  });
  api.onMenuOpenFile(() => openDialog());
  // 4T-0338 (Epic 3E-0061): 'Datei -> Neue Unterseite...'.
  api.onMenuNewSubpage(() => createSubpageForActiveFile());
  // 4T-0426 (Epic 3E-0080): 'Datei -> Neue Datei aus Vorlage...'.
  api.onMenuNewFromTemplate(() => newFileFromTemplate());
  // 4T-0433 (Epic 3E-0081): 'Datei -> Heutiger Journal-Eintrag' und
  // 'Datei -> Journal-Eintrag fuer Datum...'.
  api.onMenuJournalToday(() => openTodayJournalEntry());
  api.onMenuJournalForDate(() => openJournalEntryForDate());
  // 4T-0339 (Epic 3E-0061): 'Datei -> Umbenennen...' plus zentraler
  // Nachzug nach einem Umbenennen (Broadcast aus dem Main).
  api.onMenuRenameFile(() => renameActiveFile());
  // 4T-0774 (Epic 3E-0128): 'Datei -> Von der uebergeordneten Seite loesen...'.
  api.onMenuDetachSubpage(() => detachActiveSubpage());
  api.onFileRenamed((payload) => {
    if (payload) handleFileRenamed(payload.oldPath, payload.newPath);
  });
  // 4T-0345 (Epic 3E-0062): angewendetes Link-Update nachziehen (nicht-dirty
  // Tabs neu laden, dirty Tabs Buffer-Fix als Undo-Transaktion).
  api.onLinkUpdateApplied((payload) => {
    if (payload) handleLinkUpdateApplied(payload);
  });
  api.onMenuViewChange((mode) => setViewMode(mode));
  api.onMenuToggleLineNumbers(() => toggleShowLineNumbers());
  api.onMenuToggleWordWrap(() => toggleWrapLines());
  if (typeof api.onMenuToggleFoldGutter === 'function') {
    api.onMenuToggleFoldGutter(() => toggleShowFoldGutter());
  }
  api.onMenuSave(() => saveCurrentTab());
  api.onMenuSaveAs(() => saveCurrentTabAs());
  // 4T-0041: Export 'Portables Markdown...'.
  if (typeof api.onMenuExportPortable === 'function') {
    api.onMenuExportPortable(() => exportCurrentTabAsPortable());
  }
  // 4T-0303 (Epic 3E-0054): Export 'Als PDF exportieren...'.
  if (typeof api.onMenuExportPdf === 'function') {
    api.onMenuExportPdf(() => exportActiveTabAsPdf());
  }
  // 4T-0207: gemeinsamer Toggle-Pfad mit dem Kommando file.toggleAutoSave.
  api.onMenuToggleAutoSave(() => toggleAutoSaveSetting());
  // 4T-0216: Hilfe-Menue-Eintrag oeffnet die Handbuch-Ueberblicksseite.
  api.onMenuOpenHelp(() => openManualPage('overview'));
  api.onMenuOpenAbout(() => showAbout());
  // 4T-0277: Menue-Eintrag Datei -> Einstellungen oeffnet die Seite.
  if (typeof api.onMenuOpenSettings === 'function') {
    api.onMenuOpenSettings(() => openSettingsPage());
  }
  // 4T-0333 (Epic 3E-0060): Ansicht -> Dokument-Historie oeffnet die
  // Historien-Ansicht des aktiven Dokuments.
  if (typeof api.onMenuOpenHistory === 'function') {
    api.onMenuOpenHistory(() => openHistoryPageForActiveTab());
  }
  // 4T-0620 (Epic 3E-0117): Ansicht -> Bereichs-Statistik oeffnet die
  // Kennzahlen-Seite (und erhebt bei bereits offener Seite neu).
  if (typeof api.onMenuOpenAreaStats === 'function') {
    api.onMenuOpenAreaStats(() => openAreaStatsPage());
  }
  // 4T-0455 (Epic 3E-0084): Ansicht -> Bereichs-Graph oeffnet den Graph-Tab.
  if (typeof api.onMenuOpenAreaGraph === 'function') {
    api.onMenuOpenAreaGraph(() => openAreaGraphTab());
  }
  // 4T-0480 (Epic 3E-0089): Ansicht -> Kommando-Palette oeffnet das Popup.
  if (typeof api.onMenuOpenCommandPalette === 'function') {
    api.onMenuOpenCommandPalette(() => void showCommandPalette());
  }
  // 4T-0019: Fokus-Modus und Typewriter-Scroll ueber Menue toggeln.
  if (typeof api.onMenuToggleFocusMode === 'function') {
    api.onMenuToggleFocusMode(() => toggleFocusMode());
  }
  if (typeof api.onMenuToggleTypewriterScroll === 'function') {
    api.onMenuToggleTypewriterScroll(() => toggleTypewriterScroll());
  }
  // 4T-0697 (Epic 3E-0141): Menue-Eintraege "Linke/Rechte Sidebar einklappen"
  // toggeln die jeweilige Spalte der aktiven Pane-Group.
  if (typeof api.onMenuToggleSidebarLeft === 'function') {
    api.onMenuToggleSidebarLeft(() => toggleSidebarCollapse(state.activePaneIndex, 'left'));
  }
  if (typeof api.onMenuToggleSidebarRight === 'function') {
    api.onMenuToggleSidebarRight(() => toggleSidebarCollapse(state.activePaneIndex, 'right'));
  }
  // 4T-0019: Bearbeiten-Toggle ueber das Ansicht-Menue (Strg+E). Loest den
  // bisherigen Renderer-only-Tastenkuerzel-Handler ab, sodass der Modus auch
  // im Fokus-Modus (ohne sichtbaren Toolbar-Button) togglebar bleibt.
  if (typeof api.onMenuToggleEdit === 'function') {
    api.onMenuToggleEdit(() => toggleEditMode());
  }
  // 4T-0018: Multi-Window-Broadcast: ein anderes Fenster hat eine appearance.*-
  // Einstellung geaendert. Lokale CSS-Variablen aktualisieren.
  if (typeof api.onAppearanceChanged === 'function') {
    api.onAppearanceChanged((values) => {
      if (!values) return;
      applyAppearanceVars(values);
      // R5-08 (4T-0177): offenen Settings-Snapshot mitziehen, sonst
      // revertiert "Abbrechen" auf den Stand vor dem Broadcast und
      // ueberschreibt die Aenderung des anderen Fensters.
      mergeAppearanceSnapshot(values);
    });
  }
  // 4T-0207: gemeinsamer Toggle-Pfad mit dem Kommando app.toggleRestoreSession.
  api.onMenuToggleRestoreSession(() => toggleRestoreSessionSetting());
  // 4T-0014: Menue-Eintrag "Ansicht -> Inhaltsverzeichnis" toggelt die
  // Outline-Sichtbarkeit der aktiv fokussierten Spalte; der Menue-Haken
  // wird ueber reportMenuStateNow() im Anschluss an den Toggle aktualisiert.
  if (typeof api.onMenuToggleOutline === 'function') {
    api.onMenuToggleOutline(async () => {
      await toggleOutlinePanel(state.activePaneIndex);
      reportMenuStateNow();
    });
  }
  // 4T-0015: Menue-Eintrag "Ansicht -> Backlinks" und Live-Update-Listener.
  if (typeof api.onMenuToggleBacklinks === 'function') {
    api.onMenuToggleBacklinks(async () => {
      await toggleBacklinksPanel(state.activePaneIndex);
      reportMenuStateNow();
    });
  }
  // 4T-0073: Menue-Eintrag "Ansicht -> Outgoing-Links".
  if (typeof api.onMenuToggleOutgoingLinks === 'function') {
    api.onMenuToggleOutgoingLinks(async () => {
      await toggleOutgoingPanel(state.activePaneIndex);
      reportMenuStateNow();
    });
  }
  // 4T-0075: "Datei -> Lesezeichen -> Aktive Datei merken" (Strg+D) und
  // "Ansicht -> Lesezeichen" (Strg+Umschalt+L) Toggle der Sektion.
  if (typeof api.onMenuBookmarkAdd === 'function') {
    api.onMenuBookmarkAdd(() => addBookmarkForActiveFile());
  }
  if (typeof api.onMenuToggleBookmarks === 'function') {
    api.onMenuToggleBookmarks(async () => {
      await toggleBookmarksPanel(state.activePaneIndex);
      reportMenuStateNow();
    });
  }
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => {
      // Bei Index-Update alle sichtbaren Backlinks-Sektionen frisch anfordern.
      for (let i = 0; i < state.panes.length; i++) {
        if (state.backlinks.visibleByPane[i]) {
          const pane = state.panes[i];
          const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
          activateBacklinksFor(i, tab && tab.path ? tab.path : null);
        }
        // 4T-0341 (Epic 3E-0061): sichtbare Unterseiten-Sektionen folgen
        // Datei-Anlagen/-Loeschungen im Suchraum.
        if (state.subpages && state.subpages.visibleByPane[i]) scheduleSubpagesRender(i);
        // B-20 (4T-0187): sichtbare Tag-Sektionen ebenfalls aktualisieren —
        // vorher blieb die Tag-Liste nach Index-Updates stehen, bis der
        // Nutzer Tab oder Filter wechselte.
        if (state.tags && state.tags.visibleByPane[i]) {
          renderTags(i);
        }
      }
      // 4T-0355 (Epic 3E-0065): sichtbare Abfrage-Listen bei Index-Update neu
      // befüllen (debounced; modus-agnostisch über data-fm-base).
      refreshVisibleFrontmatterQueries();
      // 4T-0413 (Epic 3E-0078): sichtbare Skript-Blöcke neu starten — ihr
      // Daten-Snapshot spiegelt denselben Index (debounced, data-script-base).
      refreshVisiblePerspectiveScripts();
      // 4T-0515 (Epic 3E-0092): sichtbare Ereignis-Aggregationen folgen dem
      // Index (debounced; Quell-Datei-Änderungen wirken live).
      refreshVisibleEventsAggregations();
      // B-18 (4T-0187): Lint-Nachlauf — wenn der Index gerade ready wurde,
      // koennen broken-wiki-link-Marker jetzt gesetzt bzw. entfernt werden,
      // ohne auf die naechste Eingabe zu warten. scheduleLint debounct.
      for (const view of paneEditors) {
        if (view) scheduleLint(view);
      }
    });
  }

  // Auto-Save bei Fenster-Fokusverlust (Wechsel in andere App oder Fenster).
  window.addEventListener('blur', () => {
    if (state.autoSave) performAutoSave();
  });

  initOuterSplitter();
}

export function bindPaneEvents() {
  paneRoots.forEach((root, idx) => {
    root.addEventListener('mousedown', () => activatePane(idx));

    // 4T-0359 (Epic 3E-0066): spezifisch auf das Render-Pane (siehe buildPaneEls);
    // die Notizen-Vorschau traegt ebenfalls .markdown-body.
    const renderedHtml = root.querySelector('.pane-rendered .markdown-body');
    renderedHtml.addEventListener('click', (e) => handleRenderedClick(e, idx));

    const sourceEl = root.querySelector('.pane-source');
    const renderedEl = root.querySelector('.pane-rendered');
    sourceEl.addEventListener('scroll', () => saveScroll(idx));
    renderedEl.addEventListener('scroll', () => {
      saveScroll(idx);
      // 4T-0014: aktive Sektion folgt im Render-Modus dem Scroll-Stand.
      if (state.outline.visibleByPane[idx]) {
        scheduleOutlineActiveUpdate(idx);
      }
    });

    bindOutlineEvents(idx);
    bindSidebarSplitters(idx);
    // 4T-0289: Drag-and-Drop der Panel-Header und Container-Drop-Zonen.
    bindSidebarPanelDnd(idx);

    initInnerSplitter(idx);

    const tabbar = root.querySelector('.tabbar');
    tabbar.addEventListener('dragover', (e) => {
      if (Array.from(e.dataTransfer.types).includes(MIME_TAB)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tabbar.classList.add('drag-target');
      }
    });
    tabbar.addEventListener('dragleave', () => {
      tabbar.classList.remove('drag-target');
    });
    tabbar.addEventListener('drop', (e) => {
      if (!Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
      e.preventDefault();
      tabbar.classList.remove('drag-target');
      const data = parseTabDrag(e);
      if (!data) return;
      // 4T-0460 (Epic 3E-0085): Kopf-Ziehen auf die freie Tabbar-Flaeche —
      // die ganze Gruppe ans Leisten-Ende (nur eigene Leiste).
      if (data.kind === 'group') {
        if (data.fromPane === idx) {
          moveGroupInPane(idx, data.groupId, state.panes[idx].tabs.length);
        }
        return;
      }
      // 4T-0765 (Epic 3E-0158): Mehrfach-Auswahl auf die freie Flaeche — die
      // ganze Menge ans Leisten-Ende (nur eigene Leiste).
      const menge = Array.isArray(data.tabIndices) ? data.tabIndices : [];
      if (menge.length > 1 && data.fromPane === idx) {
        reorderTabsWithinPane(idx, menge, state.panes[idx].tabs.length);
        return;
      }
      moveTabBetweenPanes(data.fromPane, data.tabIndex, idx, state.panes[idx].tabs.length);
    });
  });
}

export function paneIndexAtPoint(clientX) {
  if (state.panes.length === 1) return 0;
  const rect1 = paneRoots[1].getBoundingClientRect();
  return clientX >= rect1.left ? 1 : 0;
}

// --- Splitter ---------------------------------------------------------------
export function initInnerSplitter(paneIdx) {
  const els = getPaneEls(paneIdx);
  let dragging = false;
  els.innerSplitter.addEventListener('mousedown', (e) => {
    const pane = state.panes[paneIdx];
    if (!pane || pane.activeIndex < 0) return;
    const tab = pane.tabs[pane.activeIndex];
    if (!tab || tab.viewMode !== 'split') return;
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = els.content.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    els.sourceEl.style.flex = `${clamped} 1 0`;
    els.renderedEl.style.flex = `${1 - clamped} 1 0`;
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}

export function initOuterSplitter() {
  let dragging = false;
  outerSplitter.addEventListener('mousedown', (e) => {
    if (state.panes.length !== 2) return;
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = panesContainer.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    paneRoots[0].style.flex = `${clamped} 1 0`;
    paneRoots[1].style.flex = `${1 - clamped} 1 0`;
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}
