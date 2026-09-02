// Kommando-Tabelle des Renderers: ein Handler je Registry-Kommando, dazu die
// Binding-Aufloesung des Tastatur-Dispatchers und die Vorschalt-Helfer der
// Handler.
//
// Auszug aus app-init.js, 4T-1001 (Epic 3E-0196). Die Tabelle bleibt als
// kanonische Dispatch-Registry ungeteilt (Entscheidung des Product Owners vom
// 2026-08-13, Option A) und traegt dafuer einen Eintrag in der Ausnahmeliste
// des Datei-Groessen-Budgets; der Quelltext-Waechter
// test/unit/renderer/kommando-dispatcher.test.js liest sie aus dieser Datei.
'use strict';

import { api } from './api.js';
import {
  activeTab,
  adjustTabZoom,
  resetTabZoom,
  state,
  toggleFocusMode,
  toggleTypewriterScroll,
} from './app-state.js';
import { paneEditors } from '../editor/editor.js';
import { toggleOutlinePanel } from '../panels/panel-outline.js';
import { toggleOutgoingPanel } from '../panels/panel-outgoing.js';
import { toggleBacklinksPanel } from '../panels/panel-backlinks.js';
import { toggleSubpagesPanel } from '../panels/panel-subpages.js';
import { toggleSidebarCollapse } from '../panels/sidebar-collapse.js';
import { runTaskEditDialogCommand } from '../task-dialog.js';
import { runSetReminderCommand } from '../reminders.js';
import { showApplyVariantPicker, showSaveVariantDialog } from '../sidebar-variants.js';
import { toggleAreaPanel } from '../area-panel.js';
import { toggleCalendarPanel } from '../calendar/calendar-panel.js';
import { toggleFileGraphPanel } from '../file-graph-panel.js';
import { toggleRemindersPanel } from '../reminders-panel.js';
import { toggleClockPanel } from '../clock/clock-panel.js';
import { toggleBookmarksPanel } from '../bookmarks/bookmarks.js';
import { addBookmarkForActiveFile } from '../bookmarks/bookmarks-actions.js';
import { activateTab, closeTab, moveActiveTabBetweenPanes, openDialog } from '../tabs/tabs.js';
import {
  createSubpageForActiveFile,
  detachActiveSubpage,
  rejoinActiveDocumentParts,
  renameActiveFile,
} from '../views/file-actions.js';
import { exportActiveTabAsPdf } from '../views/pdf-export.js';
import {
  exportCurrentTabAsPortable,
  saveCurrentTab,
  saveCurrentTabAs,
} from '../views/save-export.js';
import { toggleScrollSyncForActiveTab } from '../views/scroll-sync.js';
import { newUntitledTab } from '../views/untitled-tabs.js';
import {
  performAutoSave,
  setViewMode,
  toggleEditMode,
  toggleShowFoldGutter,
  toggleShowLineNumbers,
  toggleWrapLines,
} from '../views/views.js';
import { insertTemplateCommand, newFileFromTemplate } from '../templates.js';
import {
  closeWorkspace,
  createWorkspace,
  saveWorkspaceAs,
  showWorkspaceManager,
} from './workspaces.js';
import { insertEventsBlock } from '../events/events-editor.js';
import { openDatePickerAtSelection } from '../calendar/date-picker.js';
import { openCalendarPickerAtSelection } from '../calendar/calendar-picker.js';
import { openJournalEntryForDate, openTodayJournalEntry } from '../calendar/journals.js';
import { openHistoryPageForActiveTab } from '../views/history-page.js';
import { openAreaGraphTab } from '../graph/graph-tab.js';
import { openAreaStatsPage } from '../area-stats-page.js';
import { showCommandPalette } from '../command-palette.js';
import {
  oeffneFeldFormular,
  togglePropertiesPanel,
  toggleTagsPanel,
} from '../properties/properties-tags.js';
// 4T-1176 (Epic 3E-0220): Abfrage zu einem Profil einfuegen.
import { fuegeProfilAbfrageEin } from '../properties/properties-profil-abfrage.js';
import { activeNotesEditorView, toggleNotesPanel } from '../panels/notes-panel.js';
import { toggleSearchResultsPanel } from '../search/search-panel.js';
import { stepReading, toggleBookPanel } from '../books/book-panel.js';
import { moveActiveChapterFile } from '../books/book-repair.js';
import { toggleBlockPropsPanel } from '../properties/block-props-panel.js';
import { openManualPage } from '../manual.js';
import { startTour } from '../tour/tour.js';
import { openSettingsPage } from '../settings/settings-page.js';
import { nextMatch, openSearchBar, prevMatch, search } from '../search/search.js';
import { COMMANDS, mergeBindings } from '../../../shared/commands/commands.js';
import {
  eventToBinding,
  normalizeBinding,
  isShiftSymbolEvent,
  stripShiftFromBinding,
  formatTimestamp,
} from '../../../shared/commands/command-bindings.js';
import { disabledCommandIdSet } from '../../../shared/extensions/extensions-core.js';
import { getDisabledExtensionIds } from '../extensions/extension-lifecycle.js';

// --- Kommando-Dispatcher (4T-0207, Epic 3E-0015) ------------------------------
// Handler pro Kommando-ID der Registry. Die Bindings selbst leben in
// src/shared/commands/commands.js (Defaults) plus state.hotkeyOverrides (Store-Key
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
/**
 * Schaltet das automatische Speichern um (gemeinsamer Pfad fuer Menue-IPC
 * und Kommando).
 */
export async function toggleAutoSaveSetting() {
  state.autoSave = !state.autoSave;
  await api.setSetting('autoSave', state.autoSave);
  if (state.autoSave) performAutoSave();
}

// 4T-0207: Sitzungs-Restore-Toggle — gemeinsamer Pfad wie oben.
/**
 * Schaltet die Sitzungs-Wiederherstellung um (gemeinsamer Pfad wie oben).
 */
export async function toggleRestoreSessionSetting() {
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
  // 4T-0843 (Epic 3E-0147): Buch oeffnen/anlegen/schliessen (Main fuehrt aus).
  'book.open': () => {
    void api.books.openDialog();
  },
  'book.create': () => {
    void api.books.createDialog();
  },
  'book.close': () => {
    void api.books.close();
  },
  // 4T-0867 (Epic 3E-0162): Buecherregal oeffnen/anlegen/schliessen (Main
  // fuehrt aus, Muster der Buch-Kommandos).
  'shelf.open': () => {
    void api.shelves.openDialog();
  },
  'shelf.create': () => {
    void api.shelves.createDialog();
  },
  'shelf.close': () => {
    void api.shelves.close();
  },
  // 4T-0846 (Story 4S-0755): Leseführung über Kapitel-Grenzen — der
  // Lese-Ordnung des aktiven Buches vor und zurück folgen. An Anfang und Ende
  // meldet das Panel die Grenze, statt umzulaufen.
  'book.nextChapter': () => {
    stepReading(state.activePaneIndex, 1);
  },
  'book.previousChapter': () => {
    stepReading(state.activePaneIndex, -1);
  },
  // 4T-0847 (Story 4S-0756): Datei des gerade gelesenen Kapitels physisch
  // innerhalb des Buch-Ordners verschieben (Ordner-Dialog im Main).
  'book.moveChapterFile': () => {
    moveActiveChapterFile(state.activePaneIndex);
  },
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
  // 4T-1176 (Epic 3E-0220, E7): Abfrage zu einem Profil einfuegen.
  'edit.insertProfileQuery': () => {
    void fuegeProfilAbfrageEin();
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
  // 4T-1293 (Epic 3E-0224): geteiltes Dokument wieder zu einer Datei machen.
  'file.rejoinParts': () => {
    rejoinActiveDocumentParts();
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
  // 4T-0890 (Epic 3E-0168, Befund L-05): portabler Markdown-Export, jetzt
  // über dieselbe Registry-Strecke wie der PDF-Export daneben (Palette und
  // belegbares Kürzel). Der Menü-Eintrag ruft weiterhin über den IPC-Kanal
  // dieselbe Funktion auf; ihr eigener Guard prüft den aktiven Tab.
  'file.exportPortable': () => {
    exportCurrentTabAsPortable();
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
  // 4T-1047 (Epic 3E-0151): Bei ausgeschalteter Erweiterung filtert der
  // Dispatcher das Kommando bereits heraus; setViewMode faengt den Rest ab.
  'view.modeMindmap': () => {
    setViewMode('mindmap');
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
  // 4T-1174 (Epic 3E-0220): Feld-Formular des Dokuments oeffnen.
  'view.openFieldForm': () => {
    void oeffneFeldFormular(state.activePaneIndex);
  },
  // 4T-0359 (Epic 3E-0066): Notizen-Sektion toggeln.
  'view.toggleNotes': () => {
    toggleNotesPanel(state.activePaneIndex);
  },
  // 4T-0759 (Epic 3E-0142): Suchergebnis-Sektion toggeln.
  'view.toggleSearchResults': () => {
    toggleSearchResultsPanel(state.activePaneIndex);
  },
  // 4T-0844 (Epic 3E-0147): Inhaltsverzeichnis-Sektion des Buches toggeln.
  'view.toggleBookPanel': () => {
    toggleBookPanel(state.activePaneIndex);
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
  // 4T-0644 (Epic 3E-0127): geführte Produkt-Tour. Der Eintrag hier ist der
  // Ausführungs-Pfad für Kommando-Palette und ein in den Einstellungen
  // belegtes Kürzel; der Menü-Weg läuft über seinen eigenen Kanal.
  'help.tour': () => {
    startTour();
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
let hotkeyDispatchMap = new Map();

/**
 * Baut die Zuordnung normalisiertes Binding -> Kommando-ID neu (Start,
 * Hotkey-Broadcast, Erweiterungs-Wechsel, Makro-Registrierung).
 */
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

// Tastenkürzel — zentraler Kommando-Dispatcher (4T-0207, Epic 3E-0015).
// Ersetzt die frueheren verstreuten Hotkey-Vergleiche: eventToBinding
// normalisiert den Tastendruck, der Map-Lookup ist O(1), der Handler
// kommt aus commandHandlers. Fuer Symbol-Tasten (z.B. '+', das auf
// englischem Layout Shift braucht) gibt es einen zweiten Lookup ohne
// Shift-Modifier — das erhaelt das layoutunabhaengige Zoom-Verhalten
// aus 4T-0017. Die Escape-Kaskade und die Nicht-Registry-Bindings
// (Tab-Indent, Such-Enter, Strg+Mausrad) bleiben eigene Listener.
/**
 * Loest einen Tastendruck ueber die Dispatch-Zuordnung auf und fuehrt den
 * Handler aus. Registriert wird er in app-input-bindings.js, bewusst nach der
 * Escape-Kaskade.
 *
 * @param {KeyboardEvent} e Tastatur-Ereignis des Fensters.
 */
export function handleCommandKeydown(e) {
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
}
