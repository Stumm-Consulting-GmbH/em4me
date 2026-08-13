// Start-Sequenz des Renderers: Zustands-Flags und Warteschlangen des Fensters,
// die Registrierung der Broadcast-Empfaenger, init() samt Sitzungs-
// Wiederherstellung und die Aufruf-Sequenz der UI-Bindings.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-1001 (Epic 3E-0196): Broadcast-Empfaenger, Kommando-Tabelle, Bindings und
// Splitter liegen seither in den Modulen unter modules/app/; hier bleiben der
// Zustand des Fensters, sein Aufbau und die Verdrahtungs-Reihenfolge.
'use strict';

import { loadTranslations, applyTranslations, t, normalizeLocale } from '../i18n.js';
import { liveRebuildEffect } from './live/live-shared.js';
import { api } from './app/api.js';
import { rerenderAllMermaidBlocks, resetMermaidConfiguredTheme } from './render-mermaid.js';
import {
  MAX_PANES,
  applyThemePrefToButton,
  createEmptyPane,
  createTab,
  langSelect,
  normalizeSidebarCollapsed,
  setEditorViewDefaults,
  state,
} from './app/app-state.js';
import { paneEditors, updateWindowTitle } from './editor/editor.js';
// 4T-0581 (Epic 3E-0107): Store-Schluessel und Normalisierung des Schalters.
import { SPELLCHECK_KEY, normalizeSpellcheckSetting } from '../../shared/spellcheck.js';
import { loadOutlineSettings } from './panels/panel-outline.js';
import { loadOutgoingSettings } from './panels/panel-outgoing.js';
import { loadBacklinksSettings } from './panels/panel-backlinks.js';
import { loadSubpagesSettings } from './panels/panel-subpages.js';
import { initTaskStates } from './task-states.js';
// 4T-0498 (Epic 3E-0090): Erweiterung "Aufgaben" — Konfiguration laden,
// Pipeline-Labels lokalisieren, Semantik-Hook registrieren.
import { initTasks } from './tasks.js';
// 4T-0506 (Epic 3E-0096): Task-Bearbeitungs-Dialog (Kommando task.editDialog
// plus Edit-Handler der Abfrage-Treffer).
import { initTaskDialog } from './task-dialog.js';
// 4T-0526 (Epic 3E-0095): Erinnerungs-Dialog (Zustellung fälliger Anker,
// Tipp-Ruhe, Snooze/Erledigt, optionale System-Notification); 4T-0528:
// Kommando „Erinnerung setzen" (Picker auf der Checkbox-Zeile).
import { initReminders } from './reminders.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Sidebar-Layout-Modell — der Persist-Helfer
// mit Statusbar-Feedback wird zur Laufzeit angehängt (das Modul selbst
// importiert bewusst keine App-Module, siehe Kopf-Kommentar dort); das
// persistierte Layout samt Breiten lädt initSidebarLayoutFromStore.
import {
  attachActivePaneIndexGetter,
  attachSidebarLayoutPersistence,
  initPanelToggleOrderFromStore,
  initSidebarActiveByColumn,
  initSidebarLayoutFromStore,
  loadSidebarGroupHeights,
  loadSidebarPanelHeights,
} from './sidebar-layout.js';
// 4T-0292 (Epic 3E-0052): Erweiterungs-Lebenszyklus — Store-Laden beim
// Start, Anwenden bei Broadcast; Re-Render-/Rebuild-Hooks hängen unten als
// Dokument-Listener (Muster task-states/frontmatter-display). 4T-0294:
// Laufzeit-Hooks der UI-tragenden Erweiterungen (Panels, Statusbar-Buttons,
// Fokus-Modus) registriert init() über attachExtensionRuntime.
import {
  applyExtensionsState,
  attachExtensionPersistence,
  initExtensionsFromStore,
  isExtensionActive,
} from './extensions/extension-lifecycle.js';
import './settings/sidebar-settings.js';
// 4T-0624 (Epic 3E-0119): benannte Sidebar-Varianten (Store-Laden beim
// Start, Broadcast-Empfang, Kommando-Dialoge).
import { initSidebarVariantsFromStore, refreshAreaVariants } from './sidebar-variants.js';
import './settings/panel-order-settings.js';
// 4T-0327 (Epic 3E-0059): Bereichs-Panel (registriert sich beim Import an
// der Sidebar-Registry).
import { loadAreaPanelSettings } from './area-panel.js';
// 4T-0434 (Epic 3E-0081): Kalender-Panel (Init-Wiring, Toggle, Settings).
import { loadCalendarSettings } from './calendar/calendar-panel.js';
// 4T-0456 (Epic 3E-0084): Datei-Graph-Panel (Init-Wiring, Toggle, Settings).
import { loadFileGraphSettings } from './file-graph-panel.js';
// 4T-0527 (Epic 3E-0095): Erinnerungs-Panel (Init-Wiring, Toggle, Settings).
import { loadRemindersSettings } from './reminders-panel.js';
// 4T-0372 (Epic 3E-0069): Uhr-Panel (Init-Wiring, Toggle, Sichtbarkeit und
// Anzeige-Optionen aus dem Store).
import { initClockOptionsFromStore, loadClockSettings } from './clock/clock-panel.js';
// 4T-0637 (Epic 3E-0069): Wecker-Liste der Uhr-Erweiterung (app-weit).
import { initAlarmsFromStore } from './clock/clock-alarms-panel.js';
// 4T-0638 (Epic 3E-0069): Timer-Liste und Stoppuhr (ebenfalls app-weit).
import { initTimersFromStore } from './clock/clock-timers-panel.js';
import './settings/clock-settings.js';
import { loadAreaBookmarks } from './bookmarks/bookmarks.js';
import { loadBookmarksSettings, loadBookmarksTree } from './bookmarks/bookmarks-tree.js';
import { handleAppendTabFromOtherWindow, openInPane } from './tabs/tabs.js';
import { applyAllLayouts, markFileMissing, reloadFile } from './views/pane-render.js';
import { openDraftsAsUntitled } from './views/untitled-tabs.js';
import { persistSetting, showStatusbarHint } from './views/views.js';
// 4T-0459 (Epic 3E-0085): Gruppen-Anteil der Sitzungs-Wiederherstellung
// (frische IDs, defensive Normalisierung; Alt-Snapshots ohne groups laden
// unveraendert).
import { restoreGroupsIntoPane } from './tabs/tab-groups.js';
// 4T-0332 (Epic 3E-0060): Statusbar-Element der Dokument-Historie.
import { initHistoryStatus, updateHistoryStatus } from './views/history-status.js';
// 4T-0333 (Epic 3E-0060): Historien-Ansicht — Registrierung explizit über
// initHistoryPage (kein Modul-Seiteneffekt, wegen des Import-Zyklus ueber
// tabs/history-status; siehe Kommentar im Modul).
import { initHistoryPage } from './views/history-page.js';
// 4T-0455 (Epic 3E-0084): Bereichs-Graph-Tab — Registrierung explizit über
// initGraphTab (kein Modul-Seiteneffekt, Muster history-page.js).
import { initGraphTab } from './graph/graph-tab.js';
// 4T-0620 (Epic 3E-0117): Bereichs-Statistik als System-Seite; Registrierung
// ueber initAreaStatsPage (kein Modul-Seiteneffekt, Muster graph-tab.js).
import { initAreaStatsPage } from './area-stats-page.js';
// 4T-0868 (Epic 3E-0162): Regal-Ansicht als System-Seite, Registrierung
// explizit ueber initShelfViewPage (Muster area-stats-page.js).
import { initShelfViewPage } from './books/shelf-view.js';
// 4T-0480 (Epic 3E-0089): Kommando-Palette; initCommandPalette injiziert den
// Ausfuehrungs-Pfad ueber die commandHandlers-Map (Zyklus-Vermeidung).
import { initCommandPalette } from './command-palette.js';
// 4T-0520 (Epic 3E-0094): Kommando-Platzierung — eigenes Statusbar-Segment
// und Hide-Liste; Bereich der Einstellungs-Seite registriert sich per
// Import-Seiteneffekt (Muster panel-order-settings.js).
import { initCommandPlacementFromStore, initCommandPlacementUi } from './command-placement.js';
// 4T-0607 (Epic 3E-0114): Format-Toolbar — Store-Stand, Verdrahtung und
// Neuaufbau beim Erweiterungs-Schalten.
import { initFormatToolbarFromStore, initFormatToolbarUi } from './editor/format-toolbar.js';
import './settings/command-placement-settings.js';
import './settings/format-toolbar-settings.js';
// 4T-0522 (Epic 3E-0094): Makros — initMacros injiziert Handler-Map und
// Dispatch-Rebuild (Zyklus-Vermeidung, Muster initCommandPalette).
import { initMacros } from './macros.js';
import { loadPropertiesSettings, loadTagsSettings } from './properties/properties-tags.js';
// 4T-0359 (Epic 3E-0066): Notizen-Panel (Init-Wiring, Toggle, Settings laden).
import { loadNotesSettings } from './panels/notes-panel.js';
// 4T-0759 (Epic 3E-0142): Suchergebnis-Panel (Init-Wiring, Toggle, Settings).
// Der Import registriert zugleich das Panel in der Sidebar-Registry.
import { loadSearchResultsSettings } from './search/search-panel.js';
// 4T-0844 (Epic 3E-0147): Inhaltsverzeichnis-Panel des Buches (Init-Wiring,
// Toggle, Settings). Der Import registriert zugleich das Panel in der
// Sidebar-Registry. 4T-0846/4T-0847: dazu die Leseführung über
// Kapitel-Grenzen und das Verschieben der aktiven Kapitel-Datei.
import { loadBookPanelSettings } from './books/book-panel.js';
import './settings/settings-search.js';
import './search/search-area.js';
// 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Panel (Init-Wiring, Toggle, Settings).
import { loadBlockPropsSettings } from './properties/block-props-panel.js';
// 4T-0284 (Epic 3E-0050): Frontmatter-Anzeige — Store-Laden beim Start,
// Anwenden bei Broadcast (Setting render.showFrontmatter).
import { initFrontmatterDisplayFromStore } from './frontmatter-display.js';
// 4T-0471 (Epic 3E-0087): Ueberschriften-Nummerierung — Store-Laden beim
// Start, Anwenden bei Broadcast (Setting render.headingNumbering).
import { initHeadingNumberingFromStore } from './heading-numbering.js';
// 4T-0465 (Epic 3E-0086): Farbschemas — Store-Laden und Anwenden beim Start,
// Anwenden beim Theme-Wechsel und beim Multi-Window-Broadcast.
import { initColorSchemesFromStore, applyActiveColorScheme } from './color-schemes.js';
// 4T-0412 (Epic 3E-0078): Skript-Blöcke — Schalt-Zustand beim Start laden
// (Store-Key scripts.run, Default aus; UI und Broadcast folgen in 4T-0414).
// 4T-0413: Neustart sichtbarer Skript-Blöcke bei Index-Invalidierung
// (Skripte lesen den Daten-Snapshot des Index).
// 4T-0414: Anwenden bei Broadcast (Setting scripts.run).
import { initPerspectiveScriptsFromStore } from './query/perspective-script-view.js';
// 4T-0277/4T-0279 (Epic 3E-0049): die Einstellungs-Seite hat den modalen
// Dialog vollstaendig abgeloest; Appearance-Helfer und Broadcast-Merge
// leben jetzt dort.
import {
  applyAppearanceVars,
  readAppearanceFromStore,
  registerSettingsSection,
  unregisterSettingsSection,
} from './settings/settings-page.js';
// 4T-0298 (Epic 3E-0053): Host der externen Erweiterungen — Store-/Scan-
// Laden beim Start (vor dem Sidebar-Layout, damit Erweiterungs-Panels
// ihre persistierte Position behalten), App-Andockpunkte über das
// attach-Muster, Angleichen beim Multi-Window-Broadcast.
import {
  attachExtensionHostRuntime,
  attachExternalPersistence,
  initExternalExtensions,
} from './extensions/extension-host.js';
import { bindSearchUi, initSearchFromSettings } from './search/search.js';
// 4T-1001 (Epic 3E-0196): die ausgezogenen Teile dieses Moduls. Sie stehen
// bewusst am Ende des Import-Blocks, damit die Lade-Reihenfolge der uebrigen
// Module unveraendert bleibt.
import { registerAppBroadcasts } from './app/app-broadcasts.js';
import { registerSettingsBroadcasts } from './app/app-settings-broadcasts.js';
import { commandHandlers, rebuildHotkeyDispatchMap } from './app/app-commands.js';
import { applyLanguageChange } from './app/app-language.js';
import {
  applyExtensionButtonVisibility,
  applyPanelButtonOrder,
  registerExtensionRuntimeHooks,
} from './app/app-extension-runtime.js';
import { bindAppUi } from './app/app-bindings.js';
import { bindInputEvents, bindOverlayAndBlurEvents } from './app/app-input-bindings.js';
import { bindMenuEvents } from './app/app-menu-bindings.js';
import { bindPaneEvents, initOuterSplitter } from './app/app-pane-bindings.js';

// --- Initialer Main-Zustand -------------------------------------------------
// Der Main-Prozess schickt nach did-finish-load IMMER ein 'window:initialState'.
// Den Listener registrieren wir synchron beim Modul-Laden — sonst koennten wir
// das Event verpassen, falls did-finish-load feuert, bevor init() den ersten
// awaitable Punkt erreicht.
const initialStatePromise = new Promise((resolve) => {
  api.onInitialState((payload) => resolve(payload || { panes: [] }));
});

// Zustand des Startvorgangs: das Fertig-Flag und die Warteschlangen, in denen
// vor dem Ende von init() eintreffende Meldungen liegen bleiben. Sie gehoeren
// bewusst hierher und nicht in die Broadcast-Module: init() liest und leert
// sie am Ende, und eine Zuweisung an ein importiertes Binding waere in ESM ein
// TypeError. Die Empfaenger bekommen Lesezugriff und Schreibweg als Deps.
let initDone = false;
const pendingExternalFiles = [];
const pendingAppendPayloads = [];
let pendingLanguageChange = null;
let pendingExtensionsChange = null;

// 4T-0320/4T-0012/M-08 (4T-0185): Die Empfaenger werden synchron beim
// Modul-Laden registriert und nicht erst in init() — Electron-IPC puffert
// nicht, und eine Meldung, die vor dem ersten await von init() eintrifft,
// ginge sonst verloren (belegt bei window:requestClose, file:openExternal,
// tab:appendFromOtherWindow und dem Sprachwechsel-Broadcast). Die Aufrufe
// stehen deshalb an der Stelle des frueheren Listener-Blocks.
registerAppBroadcasts({
  initDone: () => initDone,
  pendingExternalFiles,
  pendingAppendPayloads,
  setPendingLanguageChange: (wert) => {
    pendingLanguageChange = wert;
  },
  setPendingExtensionsChange: (wert) => {
    pendingExtensionsChange = wert;
  },
});
registerSettingsBroadcasts({ initDone: () => initDone });

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

async function init() {
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
  // 4T-0581 (Epic 3E-0107): Schalter der Rechtschreibpruefung (Default aus).
  // Muss vor dem ersten createEditorState stehen, damit das
  // spellcheck-Compartment gleich mit dem richtigen Wert entsteht.
  state.spellcheck = normalizeSpellcheckSetting(await api.getSetting(SPELLCHECK_KEY));
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
  // 4T-0942 (Befund B-07): Geber der aktiven Editor-Spalte fuer die
  // spaltenweise Reiter-Wahl (das Layout-Modul haelt sich frei von
  // App-Importen, Muster des Persist-Helfers darueber).
  attachActivePaneIndexGetter(() => state.activePaneIndex);
  // 4T-0288: Sidebar-Layout und Breiten laden (inklusive Migration der
  // bisherigen gemeinsamen Breite outline.width) — vor applyAllLayouts,
  // damit das erste Slot-Mounting bereits das persistierte Layout sieht.
  await initSidebarLayoutFromStore();
  // 4T-0942: die spaltenweise Reiter-Wahl gleich danach, damit das erste
  // Rendern sie bereits sieht (ohne Wahl gilt der Layout-Wert).
  await initSidebarActiveByColumn();
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
  // 4T-0855 (Epic 3E-0164): Gruppen-Höhen des zweiten Höhen-Modells laden,
  // im selben Init-Schritt und aus demselben Grund wie die Panel-Höhen.
  await loadSidebarGroupHeights();
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
  // 4T-0844 (Epic 3E-0147): Inhaltsverzeichnis-Panel-Sichtbarkeit pro Spalte laden.
  await loadBookPanelSettings();
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
  // 4T-0868 (Epic 3E-0162): Regal-Ansichts-Seite registrieren.
  initShelfViewPage();
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

async function restorePanes(saved) {
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
// 4T-1001: bindUi ist die Aufruf-Sequenz der Binding-Module in der Reihenfolge
// des frueheren Rumpfes. Bindend ist dabei nur, dass die Escape-Kaskade vor
// dem Kommando-Dispatch registriert wird (beide am selben window, in
// app-input-bindings.js) und dass der aeussere Splitter zuletzt kommt.
function bindUi() {
  bindAppUi();
  bindInputEvents();
  bindMenuEvents();
  bindOverlayAndBlurEvents();
  initOuterSplitter();
}
