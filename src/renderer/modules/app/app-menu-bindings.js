// Menue-Aktionen des Main-Prozesses: Klicks auf Menue-Eintraege kommen per
// IPC im Renderer an und rufen dieselben Funktionen wie die Kommando-Handler.
//
// Auszug aus app-init.js, 4T-1001 (Epic 3E-0196).
'use strict';

import { api } from './api.js';
import { state, toggleFocusMode, toggleTypewriterScroll } from './app-state.js';
import { paneEditors } from '../editor/editor.js';
import { scheduleLint } from '../editor/editor-lint.js';
import { toggleOutlinePanel } from '../panels/panel-outline.js';
import { toggleOutgoingPanel } from '../panels/panel-outgoing.js';
import { activateBacklinksFor, toggleBacklinksPanel } from '../panels/panel-backlinks.js';
import { scheduleSubpagesRender } from '../panels/panel-subpages.js';
import { toggleSidebarCollapse } from '../panels/sidebar-collapse.js';
import { toggleBookmarksPanel } from '../bookmarks/bookmarks.js';
import { addBookmarkForActiveFile } from '../bookmarks/bookmarks-actions.js';
import { openDialog, reportMenuStateNow } from '../tabs/tabs.js';
import { refreshVisibleFrontmatterQueries } from '../query/frontmatter-query-view.js';
import {
  createSubpageForActiveFile,
  detachActiveSubpage,
  handleFileRenamed,
  renameActiveFile,
} from '../views/file-actions.js';
import { handleLinkUpdateApplied } from '../views/link-update.js';
import { exportActiveTabAsPdf } from '../views/pdf-export.js';
import {
  exportCurrentTabAsPortable,
  saveCurrentTab,
  saveCurrentTabAs,
} from '../views/save-export.js';
import { newUntitledTab } from '../views/untitled-tabs.js';
import {
  setViewMode,
  toggleEditMode,
  toggleShowFoldGutter,
  toggleShowLineNumbers,
  toggleWrapLines,
} from '../views/views.js';
import { showAbout } from '../dialogs/dialogs.js';
import { newFileFromTemplate } from '../templates.js';
import {
  closeWorkspace,
  createWorkspace,
  saveWorkspaceAs,
  showWorkspaceManager,
} from './workspaces.js';
import { refreshVisibleEventsAggregations } from '../events/events-aggregation.js';
import { openJournalEntryForDate, openTodayJournalEntry } from '../calendar/journals.js';
import { openHistoryPageForActiveTab } from '../views/history-page.js';
import { openAreaGraphTab } from '../graph/graph-tab.js';
import { openAreaStatsPage } from '../area-stats-page.js';
import { showCommandPalette } from '../command-palette.js';
import { moveActiveChapterFile } from '../books/book-repair.js';
import { renderTags } from '../editor/autocomplete-help.js';
import { openManualPage } from '../manual.js';
import { refreshVisiblePerspectiveScripts } from '../query/perspective-script-view.js';
import {
  applyAppearanceVars,
  mergeAppearanceSnapshot,
  openSettingsPage,
} from '../settings/settings-page.js';
import { toggleAutoSaveSetting, toggleRestoreSessionSetting } from './app-commands.js';

/**
 * Registriert die Menue-Kanaele des Fensters (Teil der bindUi-Sequenz).
 */
export function bindMenuEvents() {
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
  // 4T-0887 (Befund L-04): 'Buch und Buecherregal -> Kapitel-Datei
  // verschieben...' — derselbe Pfad wie Kommando-Palette und Kontextmenue des
  // Inhaltsverzeichnisses (Ordner-Dialog im Main, Hinweis ohne Kapitel).
  if (typeof api.onMenuMoveChapterFile === 'function') {
    api.onMenuMoveChapterFile(() => moveActiveChapterFile(state.activePaneIndex));
  }
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
}
