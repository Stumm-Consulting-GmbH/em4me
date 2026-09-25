// Start-Sequenz des Renderers: Zustands-Flags und Warteschlangen des Fensters,
// die Registrierung der Broadcast-Empfaenger, init() und die Aufruf-Sequenz der
// UI-Bindings.
// 4T-000179 (Epic 3E-000039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-001001 (Epic 3E-000196): Broadcast-Empfaenger, Kommando-Tabelle, Bindings und
// Splitter liegen seither in den Modulen unter modules/app/; hier bleiben der
// Zustand des Fensters, sein Aufbau und die Verdrahtungs-Reihenfolge.
// 4T-001505 (Zug 3E-000277): dazu die Wiederherstellung der Spalten aus dem
// Sitzungs-Abbild, ausgezogen nach app/sitzungs-wiederherstellung.js.
'use strict';

import { loadTranslations, applyTranslations, normalizeLocale } from '../i18n.js';
// 4T-001594 (Epic 3E-000129): Rueckfall-Sprache aus der einen Quelle — sie ist
// das, was die Auswahl zeigt, wenn die eingestellte eigene Sprache fehlt.
import { FALLBACK_LOCALE } from '../../shared/locales.js';
import { liveRebuildEffect } from './live/live-shared.js';
import { api } from './app/api.js';
import { rerenderAllMermaidBlocks, resetMermaidConfiguredTheme } from './render-mermaid.js';
import {
  applyThemePrefToButton,
  contextMenu,
  getPaneEls,
  langSelect,
  normalizeSidebarCollapsed,
  setEditorViewDefaults,
  state,
} from './app/app-state.js';
// 4T-001653 (Epic 3E-000287): Die Canvas-Einbettung bekommt ihren Zugang zum
// Fenster-Zustand hereingereicht statt ihn zu importieren; ein Import von
// app-state.js dort zoege den Canvas-Ordner in den grossen Datei-Zyklus des
// Renderers (Muster initMacros, Begruendung im Kopf von canvas-pane.js).
import { initCanvasPane, waehleCanvasFlaecheAbZeile } from './canvas/canvas-pane.js';
// 4T-001847 (Epic 3E-000110): Zugang der Tafel-Ansicht zum Fenster-Zustand.
import { initKanbanPane } from './kanban/kanban-pane.js';
// 4T-001852 (Epic 3E-000110): die beiden Wege zu einer Tafel.
import { initTafelAnlegen } from './kanban/kanban-anlegen.js';
// 4T-001668 (Epic 3E-000287): Bedienung des Canvas-Blocks außerhalb der
// Canvas-Ansicht (Entscheidung E8).
import { initCanvasBlock } from './canvas/canvas-block-zustand.js';
// 4T-001654 (Epic 3E-000287): Rückgängig und Wiederholen auf der Historie der
// Spalte, unabhängig vom Fokus — der Weg, den das Tastenkürzel-Verzeichnis
// des Editors in der Canvas-Ansicht nicht anbietet.
import { rueckgaengigInSpalte, wiederholenInSpalte } from './editor/editor-historie.js';
// 4T-001683 (Epic 3E-000287): Das Kontextmenü der Fläche nutzt das gemeinsame
// Menü des Fensters. Die Canvas-Seite liefert die Einträge, gebaut wird es
// hier — der Canvas-Ordner darf die Menü-Helfer nicht importieren.
import { hideContextMenu, showContextMenuItems } from './dialogs/context-menu-utils.js';
// 4T-001341 (Epic 3E-000238): Die Modus-Liste kommt aus der einen Quelle.
import { EDIT_VIEW_MODES } from './views/view-modes.js';
import { paneEditors, updateWindowTitle } from './editor/editor.js';
import { ladeEingabeSchalter } from './editor/editor-eingabe-schalter.js';
// 4T-000581 (Epic 3E-000107): Store-Schluessel und Normalisierung des Schalters.
import { SPELLCHECK_KEY, normalizeSpellcheckSetting } from '../../shared/spellcheck.js';
import { loadOutlineSettings } from './panels/panel-outline.js';
import { loadOutgoingSettings } from './panels/panel-outgoing.js';
import { loadBacklinksSettings } from './panels/panel-backlinks.js';
import { loadSubpagesSettings } from './panels/panel-subpages.js';
import { initTaskStates, performStatusToggle, statusToggleAufText } from './task-states.js';
// 4T-000498 (Epic 3E-000090): Erweiterung "Aufgaben" — Konfiguration laden,
// Pipeline-Labels lokalisieren, Semantik-Hook registrieren.
import { initTasks } from './tasks.js';
// 4T-000506 (Epic 3E-000096): Task-Bearbeitungs-Dialog (Kommando task.editDialog
// plus Edit-Handler der Abfrage-Treffer).
import { initTaskDialog } from './task-dialog.js';
// 4T-000526 (Epic 3E-000095): Erinnerungs-Dialog (Zustellung fälliger Anker,
// Tipp-Ruhe, Snooze/Erledigt, optionale System-Notification); 4T-000528:
// Kommando „Erinnerung setzen" (Picker auf der Checkbox-Zeile).
import { initReminders } from './reminders.js';
// 4T-000287/4T-000288 (Epic 3E-000051): Sidebar-Layout-Modell — der Persist-Helfer
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
// 4T-000292 (Epic 3E-000052): Erweiterungs-Lebenszyklus — Store-Laden beim
// Start, Anwenden bei Broadcast; Re-Render-/Rebuild-Hooks hängen unten als
// Dokument-Listener (Muster task-states/frontmatter-display). 4T-000294:
// Laufzeit-Hooks der UI-tragenden Erweiterungen (Panels, Statusbar-Buttons,
// Fokus-Modus) registriert init() über attachExtensionRuntime.
import {
  applyExtensionsState,
  attachExtensionPersistence,
  initExtensionsFromStore,
  isExtensionActive,
} from './extensions/extension-lifecycle.js';
import './settings/sidebar-settings.js';
// 4T-000624 (Epic 3E-000119): benannte Sidebar-Varianten (Store-Laden beim
// Start, Broadcast-Empfang, Kommando-Dialoge).
import { initSidebarVariantsFromStore, refreshAreaVariants } from './sidebar-variants.js';
// 4T-001580 (Epic 3E-000283): Einstellungs-Bereich „Statusleiste". Die
// Position in der Navigations-Gruppe „Allgemein" entsteht aus dieser
// Import-Reihenfolge — hinter „Sidebar", vor „Panel-Reihenfolge" (vorläufig;
// der endgültige Platz hängt an der Entscheidung zu 4T-001581).
import './settings/statusbar-settings.js';
import './settings/panel-order-settings.js';
// 4T-000327 (Epic 3E-000059): Bereichs-Panel (registriert sich beim Import an
// der Sidebar-Registry).
import { loadAreaPanelSettings } from './area-panel.js';
// 4T-000434 (Epic 3E-000081): Kalender-Panel (Init-Wiring, Toggle, Settings).
import { loadCalendarSettings } from './calendar/calendar-panel.js';
// 4T-000456 (Epic 3E-000084): Datei-Graph-Panel (Init-Wiring, Toggle, Settings).
import { loadFileGraphSettings } from './file-graph-panel.js';
// 4T-000527 (Epic 3E-000095): Erinnerungs-Panel (Init-Wiring, Toggle, Settings).
import { loadRemindersSettings } from './reminders-panel.js';
// 4T-000372 (Epic 3E-000069): Uhr-Panel (Init-Wiring, Toggle, Sichtbarkeit und
// Anzeige-Optionen aus dem Store).
import { initClockOptionsFromStore, loadClockSettings } from './clock/clock-panel.js';
// 4T-000637 (Epic 3E-000069): Wecker-Liste der Uhr-Erweiterung (app-weit).
import { initAlarmsFromStore } from './clock/clock-alarms-panel.js';
// 4T-000638 (Epic 3E-000069): Timer-Liste und Stoppuhr (ebenfalls app-weit).
import { initTimersFromStore } from './clock/clock-timers-panel.js';
import './settings/clock-settings.js';
import { loadAreaBookmarks } from './bookmarks/bookmarks.js';
import { loadBookmarksSettings, loadBookmarksTree } from './bookmarks/bookmarks-tree.js';
import {
  handleAppendTabFromOtherWindow,
  openInPane,
  reportMenuStateNow,
  syncToolbarToActiveTab,
} from './tabs/tabs.js';
import { applyAllLayouts, markFileMissing, reloadFile } from './views/pane-render.js';
import { newUntitledTab, openDraftsAsUntitled } from './views/untitled-tabs.js';
import { persistSetting, showStatusbarHint } from './views/views.js';
// 4T-000332 (Epic 3E-000060): Statusbar-Element der Dokument-Historie.
import { initHistoryStatus, updateHistoryStatus } from './views/history-status.js';
// 4T-000333 (Epic 3E-000060): Historien-Ansicht — Registrierung explizit über
// initHistoryPage (kein Modul-Seiteneffekt, wegen des Import-Zyklus ueber
// tabs/history-status; siehe Kommentar im Modul).
import { initHistoryPage } from './views/history-page.js';
// 4T-000455 (Epic 3E-000084): Bereichs-Graph-Tab — Registrierung explizit über
// initGraphTab (kein Modul-Seiteneffekt, Muster history-page.js).
import { initGraphTab } from './graph/graph-tab.js';
// 4T-000620 (Epic 3E-000117): Bereichs-Statistik als System-Seite; Registrierung
// ueber initAreaStatsPage (kein Modul-Seiteneffekt, Muster graph-tab.js).
import { initAreaStatsPage } from './area-stats-page.js';
// 4T-000868 (Epic 3E-000162): Regal-Ansicht als System-Seite, Registrierung
// explizit ueber initShelfViewPage (Muster area-stats-page.js).
import { initShelfViewPage } from './books/shelf-view.js';
// 4T-001599 (Epic 3E-000191): My Extended Memory als System-Seite,
// Registrierung explizit ueber initMemoryPage (Muster shelf-view.js).
import { initMemoryPage } from './memory-page.js';
// 4T-001759 (Epic 3E-000253): Die Uebersicht der Datenbank beim Binden des
// Bereichs — hier fuer das frisch gestartete Fenster, dessen Fenster-Meldung
// waehrend der Wiederherstellung eintrifft (Begruendung an der Funktion).
import { zeigeUebersichtBeimBinden } from './database/datenbank-uebersicht-seite.js';
// 4T-000480 (Epic 3E-000089): Kommando-Palette; initCommandPalette injiziert den
// Ausfuehrungs-Pfad ueber die commandHandlers-Map (Zyklus-Vermeidung).
import { initCommandPalette } from './command-palette.js';
// 4T-000520 (Epic 3E-000094): Kommando-Platzierung — eigenes Statusbar-Segment
// und Hide-Liste; Bereich der Einstellungs-Seite registriert sich per
// Import-Seiteneffekt (Muster panel-order-settings.js).
import { initCommandPlacementFromStore, initCommandPlacementUi } from './command-placement.js';
// 4T-001579 (Epic 3E-000283): Überlauf-Messung und Pull-up-Menüs der
// Statusleiste.
import { initStatusbarOverflow } from './statusbar-overflow.js';
// 4T-000607 (Epic 3E-000114): Format-Toolbar — Store-Stand, Verdrahtung und
// Neuaufbau beim Erweiterungs-Schalten.
import { initFormatToolbarFromStore, initFormatToolbarUi } from './editor/format-toolbar.js';
import './settings/command-placement-settings.js';
import './settings/format-toolbar-settings.js';
import './settings/mindmap-settings.js';
// 4T-000522 (Epic 3E-000094): Makros — initMacros injiziert Handler-Map und
// Dispatch-Rebuild (Zyklus-Vermeidung, Muster initCommandPalette).
import { initMacros } from './macros.js';
import { loadPropertiesSettings, loadTagsSettings } from './properties/properties-tags.js';
// 4T-000359 (Epic 3E-000066): Notizen-Panel (Init-Wiring, Toggle, Settings laden).
import { loadNotesSettings } from './panels/notes-panel.js';
// 4T-000759 (Epic 3E-000142): Suchergebnis-Panel (Init-Wiring, Toggle, Settings).
// Der Import registriert zugleich das Panel in der Sidebar-Registry.
import { loadSearchResultsSettings } from './search/search-panel.js';
// 4T-001769 (Epic 3E-000290): Karten-Liste der Canvas-Fläche (Settings). Der
// Import registriert zugleich das Panel in der Sidebar-Registry.
import { loadCanvasListSettings } from './panels/panel-canvas-liste.js';
// 4T-000844 (Epic 3E-000147): Inhaltsverzeichnis-Panel des Buches (Init-Wiring,
// Toggle, Settings). Der Import registriert zugleich das Panel in der
// Sidebar-Registry. 4T-000846/4T-000847: dazu die Leseführung über
// Kapitel-Grenzen und das Verschieben der aktiven Kapitel-Datei.
import { loadBookPanelSettings } from './books/book-panel.js';
import './settings/settings-search.js';
import './search/search-area.js';
// 4T-000364 (Epic 3E-000067): Block-Eigenschaften-Panel (Init-Wiring, Toggle, Settings).
import { loadBlockPropsSettings } from './properties/block-props-panel.js';
// 4T-000284 (Epic 3E-000050): Frontmatter-Anzeige — Store-Laden beim Start,
// Anwenden bei Broadcast (Setting render.showFrontmatter).
import { initFrontmatterDisplayFromStore } from './frontmatter-display.js';
// 4T-000471 (Epic 3E-000087): Ueberschriften-Nummerierung — Store-Laden beim
// Start, Anwenden bei Broadcast (Setting render.headingNumbering).
import { initHeadingNumberingFromStore } from './heading-numbering.js';
import { initMindmapOptionenFromStore } from './mindmap/mindmap-einstellungen.js';
// 4T-000465 (Epic 3E-000086): Farbschemas — Store-Laden und Anwenden beim Start,
// Anwenden beim Theme-Wechsel und beim Multi-Window-Broadcast.
import { initColorSchemesFromStore, applyActiveColorScheme } from './color-schemes.js';
// 4T-000412 (Epic 3E-000078): Skript-Blöcke — Schalt-Zustand beim Start laden
// (Store-Key scripts.run, Default aus; UI und Broadcast folgen in 4T-000414).
// 4T-000413: Neustart sichtbarer Skript-Blöcke bei Index-Invalidierung
// (Skripte lesen den Daten-Snapshot des Index).
// 4T-000414: Anwenden bei Broadcast (Setting scripts.run).
import { initPerspectiveScriptsFromStore } from './query/perspective-script-view.js';
// 4T-000277/4T-000279 (Epic 3E-000049): die Einstellungs-Seite hat den modalen
// Dialog vollstaendig abgeloest; Appearance-Helfer und Broadcast-Merge
// leben jetzt dort.
import {
  applyAppearanceVars,
  readAppearanceFromStore,
  registerSettingsSection,
  unregisterSettingsSection,
} from './settings/settings-page.js';
// 4T-000298 (Epic 3E-000053): Host der externen Erweiterungen — Store-/Scan-
// Laden beim Start (vor dem Sidebar-Layout, damit Erweiterungs-Panels
// ihre persistierte Position behalten), App-Andockpunkte über das
// attach-Muster, Angleichen beim Multi-Window-Broadcast.
import {
  attachExtensionHostRuntime,
  attachExternalPersistence,
  initExternalExtensions,
} from './extensions/extension-host.js';
import { bindSearchUi, initSearchFromSettings } from './search/search.js';
// 4T-000644 (Epic 3E-000127): Erststart-Anlauf der geführten Produkt-Tour.
import { maybeStartTourOnFirstRun } from './tour/tour.js';
// 4T-001001 (Epic 3E-000196): die ausgezogenen Teile dieses Moduls. Sie stehen
// bewusst am Ende des Import-Blocks, damit die Lade-Reihenfolge der uebrigen
// Module unveraendert bleibt.
import { registerAppBroadcasts } from './app/app-broadcasts.js';
import { registerSettingsBroadcasts } from './app/app-settings-broadcasts.js';
import { commandHandlers, rebuildHotkeyDispatchMap } from './app/app-commands.js';
// 4T-001594 (Epic 3E-000129): dazu die Liste der eingespielten eigenen
// Sprachen und der sichtbare Rueckfall, wenn ihre Datei fehlt.
// 4T-001596: dazu der Alterungs-Hinweis, wenn ihr Eintraege fehlen.
import {
  applyLanguageChange,
  fuelleSprachAuswahl,
  holeEigeneSprachen,
  zeigeSprachRueckfall,
  pruefeSprachLuecken,
} from './app/app-language.js';
import {
  applyExtensionButtonVisibility,
  applyPanelButtonOrder,
  registerExtensionRuntimeHooks,
} from './app/app-extension-runtime.js';
import { bindAppUi } from './app/app-bindings.js';
import { bindInputEvents, bindOverlayAndBlurEvents } from './app/app-input-bindings.js';
import { bindMenuEvents } from './app/app-menu-bindings.js';
import { bindPaneEvents, initOuterSplitter } from './app/app-pane-bindings.js';
import { restorePanes } from './app/sitzungs-wiederherstellung.js';

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

// 4T-000320/4T-000012/M-08 (4T-000185): Die Empfaenger werden synchron beim
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
// R3-07 (4T-000174): eine fruehe IPC-Rejection liess das Fenster sonst
// halb-initialisiert (haengender await ohne Diagnose). Minimaler Fallback:
// Fehler loggen und die UI-Bindings nachholen, damit Menue/Buttons des
// leeren Fensters bedienbar bleiben.
// 4T-000179: init() wird NICHT mehr als Modul-Seiteneffekt gestartet,
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

// 4T-001654 (Epic 3E-000287), seit 4T-001849 (Epic 3E-000110) von beiden
// Flaechen-Ansichten genutzt: Ersetzt einen Zeilen-Bereich im Editor der Spalte
// als EINE Transaktion und damit als EINEN Rueckgaengig-Schritt. Die
// `userEvent`-Anmerkung haelt sie in der Historie getrennt (Muster writeBody in
// perspective-datatable-editor.js).
//
// **Eine Fassung statt zweier.** Canvas-Flaeche und Kanban-Tafel schreiben
// beide ueber Zeilen-Nummern in dasselbe Dokument; zwei Kopien dieses Rumpfes
// waeren zwei Orte, an denen die Rand-Faelle (leerer Bereich, Bereich hinter
// dem Dokument-Ende) auseinanderlaufen koennen.
//
// Zeilen-Nummern sind 1-basiert; `bisZeile < vonZeile` heisst «nichts zu
// ersetzen, nur einfuegen».
function ersetzeZeilenBereich(paneIdx, { vonZeile, bisZeile, text }) {
  const view = paneEditors[paneIdx];
  if (!view || view.state.readOnly) return false;
  const doc = view.state.doc;
  const von = Math.max(1, Math.min(Number(vonZeile) || 1, doc.lines + 1));
  const bis = Number(bisZeile) || 0;
  let changes;
  if (bis < von) {
    // Kein Bereich zu ersetzen: Der Text wird als neue Zeile eingefuegt.
    if (von > doc.lines) changes = { from: doc.length, to: doc.length, insert: `\n${text}` };
    else {
      const stelle = doc.line(von).from;
      changes = { from: stelle, to: stelle, insert: `${text}\n` };
    }
  } else {
    changes = {
      from: doc.line(von).from,
      to: doc.line(Math.min(bis, doc.lines)).to,
      insert: text,
    };
  }
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

async function init() {
  // Theme
  const initialTheme = await api.getTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  // 4T-000465 (Epic 3E-000086): aktives Farbschema früh laden und anwenden (nach
  // data-theme, damit der Modus feststeht, und vor dem ersten Paint).
  await initColorSchemesFromStore();
  api.onThemeChanged((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    // 4T-000465 (Epic 3E-000086): Farbschema des neuen Modus neu anwenden — die
    // Inline-Variablen am Wurzel-Element übersteuern data-theme, ohne Re-Apply
    // klebt die zuvor gesetzte Palette über beiden Modi.
    applyActiveColorScheme();
    // 4T-000021: alle gerenderten Mermaid-Diagramme neu rendern, damit sie
    // dem neuen Theme folgen. Greift nur, wenn Mermaid bereits geladen ist.
    rerenderAllMermaidBlocks();
    // 4T-000089: Live-Modus-Mermaid-Widgets neu bauen. mermaidConfiguredTheme
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

  // 4T-000030: Theme-Pref (light/dark/system) aus dem Main laden und auf den
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
    // K-05 (4T-000310): konsistent zum Statusbar-Pfad mit catch kapseln.
    Promise.resolve(api.setThemePref(value)).catch((err) => {
      console.warn('setThemePref schlug fehl:', err);
    });
  });

  // 4T-001335 (Epic 3E-000237): einmal geholt, weil konstant; der Titel liest sie
  // danach synchron. Faellt sie aus, bleibt es beim produktiven Titel.
  state.auspraegung = await Promise.resolve(api.getAuspraegung()).catch(() => null);

  // Sprache
  let lang = await api.getSetting('language');
  if (!lang) {
    // normalizeLocale greift NUR ohne gespeicherte Einstellung: Es fuehrt jede
    // unbekannte Angabe auf die Rueckfall-Sprache zurueck und wuerde eine
    // gespeicherte eigene Kennung `custom:<code>` auf 'en' biegen (4T-001594).
    const locale = await api.getLocale();
    lang = normalizeLocale(locale);
  }
  state.language = lang;
  const sprachErgebnis = await loadTranslations(lang);
  applyTranslations(document);
  // 4T-001594: Die eingespielten Sprachen stehen als eigene Gruppe unter den
  // mitgelieferten. Der Aufruf steht NACH dem Laden des Katalogs, weil die
  // Gruppen-Beschriftung eine Uebersetzung ist.
  fuelleSprachAuswahl(await holeEigeneSprachen());
  // Fehlt die Datei der eingestellten eigenen Sprache, steht die Oberflaeche
  // auf der Rueckfall-Sprache; das Auswahl-Element zeigt sie, die Einstellung
  // bleibt unangetastet.
  langSelect.value = sprachErgebnis && sprachErgebnis.fallback ? FALLBACK_LOCALE : lang;
  if (sprachErgebnis && sprachErgebnis.fallback) zeigeSprachRueckfall(sprachErgebnis.id);
  // 4T-001596: Der Alterungs-Hinweis steht NACH fuelleSprachAuswahl, weil er
  // den Anzeige-Namen aus der Liste nimmt, und schliesst den Rueckfall aus:
  // Nach einem Rueckfall steht eine mitgelieferte Fassung.
  await pruefeSprachLuecken();
  // 4T-000330 (Epic 3E-000057): Titel neu setzen, sobald das Woerterbuch da ist.
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
  // 4T-001576 (Epic 3E-000282): Die drei input.*-Schalter des Eingabe-Verhaltens
  // im Editor (Tabulator aus 4T-000656, Cursor-Sprung aus diesem Vorgang, URL
  // beim Einfügen aus 4T-000603) laden gebündelt im Editor-Modul; die Handler
  // lesen sie synchron aus dem Zustand, damit sie ohne Rekonfiguration wirken.
  // Begründung des Umzugs aus init() steht im Kopf jener Datei.
  await ladeEingabeSchalter();
  // 4T-000581 (Epic 3E-000107): Schalter der Rechtschreibpruefung (Default aus).
  // Muss vor dem ersten createEditorState stehen, damit das
  // spellcheck-Compartment gleich mit dem richtigen Wert entsteht.
  state.spellcheck = normalizeSpellcheckSetting(await api.getSetting(SPELLCHECK_KEY));
  // 4T-000604 (Epic 3E-000113): Zeitstempel-Automatik laden. Gebündelt über
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
  // 4T-000085: Default-View-Modus fuer neue Tabs.
  const storedDefaultViewMode = await api.getSetting('app.defaultViewMode');
  if (
    storedDefaultViewMode &&
    ['rendered', 'split', 'source', 'live'].includes(storedDefaultViewMode)
  ) {
    state.defaultViewMode = storedDefaultViewMode;
  }
  // 4T-001341 (Epic 3E-000238): Ziel-Ansicht des Wechsels in den Aenderungsmodus.
  // Ein unbekannter oder fehlender Wert laesst die Voreinstellung stehen, damit
  // ein Bestandsprofil ohne die Einstellung sich unveraendert verhaelt.
  const storedEditViewMode = await api.getSetting('app.editViewMode');
  if (storedEditViewMode && EDIT_VIEW_MODES.includes(storedEditViewMode)) {
    state.editViewMode = storedEditViewMode;
  }
  // 4T-000572 (Epic 3E-000105): globale Voreinstellung der drei Editor-Ansicht-
  // Schalter laden (nur echtes true/false uebernimmt; sonst bleibt die
  // Konstante). Muss vor restorePanes stehen, damit wiederhergestellte Tabs
  // bereits gegen die Voreinstellung aufloesen.
  setEditorViewDefaults({
    wrapLines: await api.getSetting('editor.defaultWrapLines'),
    showLineNumbers: await api.getSetting('editor.defaultLineNumbers'),
    showFoldGutter: await api.getSetting('editor.defaultFoldGutter'),
  });
  // 4T-000572: einmalige Start-Bereinigung der abgeloesten Per-Datei-Persistenz
  // 'app.fileSettings' (PO-Entscheidung: loeschen, nicht konvertieren —
  // die pfad-basierte Ablage war genau die nicht-portable Loesung, die das
  // Frontmatter-Modell ersetzt). Null-Setzen statt Delete: Muster der
  // Bookmarks-Legacy-Migration; der Store kennt keine Delete-Bruecke.
  const legacyFileSettings = await api.getSetting('app.fileSettings');
  if (legacyFileSettings != null) {
    void api.setSetting('app.fileSettings', null);
  }
  // 4T-000204: Task-Status-Set laden und beide Pipeline-Instanzen
  // konfigurieren (nach loadTranslations — Default-Labels via t()).
  await initTaskStates();
  // 4T-000498: Aufgaben-Konfiguration laden (nach loadTranslations — die
  // Badge-Labels kommen via t()) und den Toggle-Semantik-Hook registrieren.
  await initTasks();
  // 4T-000506 (Epic 3E-000096): Bearbeiten-Knopf der Task-Abfrage-Treffer auf
  // den Task-Dialog verdrahten.
  initTaskDialog();
  // 4T-000526 (Epic 3E-000095): Erinnerungs-Dialog an die Main-Zustellung
  // anschließen (nach loadTranslations — Dialog-Texte via t()).
  initReminders();
  // 4T-000284: Frontmatter-Anzeige-Setting laden und die Preload-Pipeline
  // konfigurieren, bevor die Panes gerendert werden.
  await initFrontmatterDisplayFromStore();
  // 4T-000471 (Epic 3E-000087): Nummerierungs-Setting laden und die Preload-
  // Pipeline konfigurieren, bevor die Panes gerendert werden.
  await initHeadingNumberingFromStore();
  // 4T-001048: Mindmap-Voreinstellung laden, bevor eine Karte gezeichnet wird.
  await initMindmapOptionenFromStore();
  // 4T-000412 (Epic 3E-000078): Skript-Block-Schalter laden, bevor die Panes
  // gerendert werden (entscheidet Ausführung vs. Quelltext-Darstellung).
  await initPerspectiveScriptsFromStore();
  // 4T-000292: Erweiterungs-Schalt-Zustand laden und die Preload-Pipeline
  // mit dem aktiven Plugin-Satz aufbauen, bevor die Panes gerendert werden.
  attachExtensionPersistence(persistSetting);
  await initExtensionsFromStore();
  // 4T-000298 (Epic 3E-000053): externe Erweiterungen scannen und die
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

  // 4T-000287 (Epic 3E-000051): Persist-Helfer des Sidebar-Layout-Modells
  // anhängen (Statusbar-Feedback bei Store-Schreibfehlern, Muster W-20).
  attachSidebarLayoutPersistence(persistSetting);
  // 4T-000942 (Befund B-07): Geber der aktiven Editor-Spalte fuer die
  // spaltenweise Reiter-Wahl (das Layout-Modul haelt sich frei von
  // App-Importen, Muster des Persist-Helfers darueber).
  attachActivePaneIndexGetter(() => state.activePaneIndex);
  // 4T-000288: Sidebar-Layout und Breiten laden (inklusive Migration der
  // bisherigen gemeinsamen Breite outline.width) — vor applyAllLayouts,
  // damit das erste Slot-Mounting bereits das persistierte Layout sieht.
  await initSidebarLayoutFromStore();
  // 4T-000942: die spaltenweise Reiter-Wahl gleich danach, damit das erste
  // Rendern sie bereits sieht (ohne Wahl gilt der Layout-Wert).
  await initSidebarActiveByColumn();
  // 4T-000569 (Epic 3E-000104): persistierte Panel-Toggle-Reihenfolge laden und
  // die Statusbar-Leiste darauf anordnen (bindUi lief mit dem Default; die
  // Menue-Seite zieht ueber die laufenden reportMenuStateNow-Meldungen nach).
  await initPanelToggleOrderFromStore();
  applyPanelButtonOrder();
  // 4T-000520 (Epic 3E-000094): persistierte Kommando-Platzierung laden —
  // vor initCommandPlacementUi (siehe unten), das Segment und Hide-Liste
  // auf diesen Stand bringt.
  await initCommandPlacementFromStore();
  // 4T-000607 (Epic 3E-000114): persistierte Format-Toolbar-Belegung laden —
  // vor initFormatToolbarUi (siehe unten), das die Leisten darauf aufbaut.
  await initFormatToolbarFromStore();
  // 4T-000475 (Epic 3E-000088): manuell eingestellte Panel-Höhen laden — vor
  // applyAllLayouts, damit das erste Slot-Mounting die Höhen bereits kennt.
  await loadSidebarPanelHeights();
  // 4T-000855 (Epic 3E-000164): Gruppen-Höhen des zweiten Höhen-Modells laden,
  // im selben Init-Schritt und aus demselben Grund wie die Panel-Höhen.
  await loadSidebarGroupHeights();
  // 4T-000624 (Epic 3E-000119): benannte Sidebar-Varianten laden; 4T-000625:
  // dazu die Bereichs-Varianten des Fenster-Bereichs.
  await initSidebarVariantsFromStore();
  await refreshAreaVariants();
  // 4T-000014: Outline-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadOutlineSettings();
  // 4T-000015: Backlinks-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadBacklinksSettings();
  // 4T-000073: Outgoing-Links-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadOutgoingSettings();
  // 4T-000075: Bookmark-Baum und Sektions-Sichtbarkeit aus den Settings laden.
  await loadBookmarksTree();
  await loadBookmarksSettings();
  // 4T-000612 (Epic 3E-000115): Bereichs-Lesezeichen aus der Bereichsdatei laden
  // (leer ohne Bereich; der Bereichs-Wechsel zieht ueber onWindowDisplayInfo
  // nach).
  await loadAreaBookmarks();
  // 4T-000051: Properties-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadPropertiesSettings();
  // 4T-000056: Tag-Sichtbarkeit pro Spalte aus den Settings laden.
  await loadTagsSettings();
  // 4T-000359 (Epic 3E-000066): Notizen-Panel-Sichtbarkeit pro Spalte laden.
  await loadNotesSettings();
  // 4T-000759 (Epic 3E-000142): Suchergebnis-Panel-Sichtbarkeit pro Spalte laden.
  await loadSearchResultsSettings();
  // 4T-001769 (Epic 3E-000290): Karten-Listen-Panel-Sichtbarkeit pro Spalte laden.
  await loadCanvasListSettings();
  // 4T-000844 (Epic 3E-000147): Inhaltsverzeichnis-Panel-Sichtbarkeit pro Spalte laden.
  await loadBookPanelSettings();
  // 4T-000434 (Epic 3E-000081): Kalender-Panel-Sichtbarkeit pro Spalte laden.
  await loadCalendarSettings();
  // 4T-000456 (Epic 3E-000084): Datei-Graph-Panel-Sichtbarkeit pro Spalte laden.
  await loadFileGraphSettings();
  // 4T-000527 (Epic 3E-000095): Erinnerungs-Panel-Sichtbarkeit pro Spalte laden.
  await loadRemindersSettings();
  // 4T-000372 (Epic 3E-000069): Uhr-Panel-Sichtbarkeit pro Spalte und die
  // globalen Anzeige-Optionen laden, bevor die Panes gerendert werden.
  await loadClockSettings();
  await initClockOptionsFromStore();
  // 4T-000637 (Epic 3E-000069): Wecker-Liste laden (app-weit, nicht pro Bereich).
  await initAlarmsFromStore();
  // 4T-000638 (Epic 3E-000069): Timer und Stoppuhr laden; laufende Einträge
  // rechnen ihre Zeit aus den gespeicherten Zeitstempeln weiter.
  await initTimersFromStore();
  // 4T-000364 (Epic 3E-000067): Block-Eigenschaften-Panel-Sichtbarkeit laden.
  await loadBlockPropsSettings();
  // 4T-000341 (Epic 3E-000061): Unterseiten-Sichtbarkeit pro Spalte laden.
  await loadSubpagesSettings();
  // 4T-000327 (Epic 3E-000059): Bereichs-Panel-Sichtbarkeit pro Spalte laden.
  await loadAreaPanelSettings();
  // 4T-000018: Schriftart und -groesse fuer Editor und Render-Pane aus den
  // Settings laden und als CSS-Variablen auf :root setzen, bevor die Panes
  // gerendert werden — damit greifen die Werte direkt beim ersten Paint.
  applyAppearanceVars(await readAppearanceFromStore());
  // 4T-000019: Fokus-Modus und Typewriter-Scroll aus den Settings laden.
  // Beide werden global gehalten (nicht pro Fenster) und auf das frische
  // Fenster angewendet, bevor die Panes erzeugt werden, sodass das
  // Compartment beim ersten createEditorState bereits die richtige
  // Konfiguration hat.
  state.focusMode = !!(await api.getSetting('focusMode'));
  state.typewriterScroll = !!(await api.getSetting('typewriterScroll'));
  // 4T-000294: Fokus-Modus nur bei aktiver Erweiterung anwenden (die
  // persistierte Preference bleibt in jedem Fall erhalten).
  document.body.classList.toggle('focus-mode', state.focusMode && isExtensionActive('focus-mode'));
  // 4T-000697 (Epic 3E-000141): Kollaps-Zustand der Sidebar-Spalten global laden
  // (Muster Fokus-Modus). Auf das frische Fenster angewendet, bevor die Panes
  // gerendert werden; renderSidebarSide zieht ihn beim ersten Render nach. Ist
  // die Erweiterung 'sidebar-collapse' deaktiviert, hebt ihr Laufzeit-Hook den
  // geladenen Zustand beim Anhängen (registerExtensionRuntimeHooks) wieder auf.
  state.sidebarCollapsed = normalizeSidebarCollapsed(await api.getSetting('sidebarCollapsed'));
  // 4T-000207: Hotkey-Overrides laden und Dispatcher-Map bauen — VOR bindUi
  // und dem ersten Editor-Aufbau, damit Dispatcher und Editor-Keymap von
  // Anfang an die effektiven Bindings nutzen. Ohne Overrides entspricht
  // alles exakt den Registry-Defaults (Verhaltens-Identitaet).
  const storedHotkeys = await api.getSetting('hotkeys');
  state.hotkeyOverrides =
    storedHotkeys && typeof storedHotkeys === 'object' && !Array.isArray(storedHotkeys)
      ? storedHotkeys
      : {};
  rebuildHotkeyDispatchMap();
  // 4T-000294: Laufzeit-Hooks der UI-tragenden Erweiterungen anhaengen und
  // die Statusbar-Buttons auf den geladenen Schalt-Zustand bringen.
  registerExtensionRuntimeHooks();
  applyExtensionButtonVisibility();
  // 4T-000522 (Epic 3E-000094): Makro-Kommandos registrieren, BEVOR das
  // Segment rendert (Statusbar-Buttons auf macro.-Kommandos filtern
  // gegen die Registry).
  // 4T-001653 (Epic 3E-000287): Zugang der Canvas-Einbettung zum Fenster-
  // Zustand. Vor dem ersten Zeichnen, weil renderCanvas ohne ihn nichts tut.
  initCanvasPane({
    getPaneEls,
    aktivesDokument: (paneIdx) => {
      const pane = state.panes[paneIdx];
      return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    },
    // 4T-001653: Traegt das Dokument ploetzlich eine Flaeche oder keine mehr,
    // muessen Schaltflaeche und Menue-Eintrag nachziehen. Der Rueckruf haengt
    // am 200-ms-Takt der Canvas und feuert nur beim echten Wechsel, damit der
    // Menue-Report nicht bei jedem Tastendruck ueber die Bruecke geht.
    beiVerfuegbarkeitsWechsel: () => {
      syncToolbarToActiveTab();
      reportMenuStateNow();
    },
    // 4T-001654 (Befund 1 des Product Owners vom 2026-09-10): Darf die Flaeche
    // der Spalte gerade geschrieben werden? Beides muss stimmen — der Reiter
    // im Aenderungs-Modus UND die EditorView nicht schreibgeschuetzt; genau
    // diese beiden Bedingungen fragt auch `schreibeDokument` darunter ab,
    // bevor es dispatcht. Ohne die Antwort bot die Flaeche im Anzeige-Modus
    // Griffe an, deren Ergebnis beim Loslassen verworfen wurde.
    istAenderbar: (paneIdx) => {
      const pane = state.panes[paneIdx];
      const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
      const view = paneEditors[paneIdx];
      return !!tab && !!tab.editMode && !!view && !view.state.readOnly;
    },
    // 4T-001654 (Epic 3E-000287): Schreibweg der Canvas-Bedienung. Die
    // Einbettung darf `editor.js` nicht importieren (Zyklus editor ->
    // canvas-pane -> editor), deshalb kommt der Zugriff auf die EditorView von
    // hier. Eine Bedien-Handlung = eine Transaktion = ein Rueckgaengig-Schritt;
    // die `userEvent`-Anmerkung haelt sie in der Historie getrennt (Muster
    // writeBody in perspective-datatable-editor.js). Gemessen am 2026-09-10:
    // Der Weg traegt auch bei dem per CSS versteckten Editor der Canvas-Ansicht.
    schreibeDokument: (paneIdx, daten) => ersetzeZeilenBereich(paneIdx, daten),
    // 4T-001654: Rückgängig und Wiederholen der Canvas-Ansicht. Sie laufen
    // über DIESELBE Historie wie im Editor — die Bedien-Handlungen der Fläche
    // schreiben als gewöhnliche Transaktionen hinein. Der Weg über das
    // Tastenkürzel-Verzeichnis des Editors trägt hier nicht, weil dieser in
    // der Canvas-Ansicht versteckt und nicht fokussiert ist.
    rueckgaengig: (paneIdx) => rueckgaengigInSpalte(paneEditors[paneIdx]),
    wiederholen: (paneIdx) => wiederholenInSpalte(paneEditors[paneIdx]),
    // 4T-001683: Das Kontextmenü der Fläche im gemeinsamen Menü des Fensters.
    // Damit gelten die Schließ-Wege des Bestands (Klick außerhalb,
    // Escape-Kaskade in app-input-bindings.js) ohne eigenes Zutun.
    zeigeKontextmenue: (paneIdx, { x, y, eintraege }) => showContextMenuItems(eintraege, x, y),
    schliesseKontextmenue: () => hideContextMenu(),
    kontextmenueOffen: () => !contextMenu.hidden,
  });
  // 4T-001847 (Epic 3E-000110): Zugang der Tafel-Ansicht zum Fenster-Zustand,
  // nach demselben Muster und aus demselben Grund wie bei der Canvas darüber.
  // Der Satz ist bewusst schmal: Dieser Vorgang liefert den Modus, die
  // Zeichnung kommt mit 4T-001848 und ergänzt ihn dort, wo sie sie braucht.
  initKanbanPane({
    getPaneEls,
    aktivesDokument: (paneIdx) => {
      const pane = state.panes[paneIdx];
      return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    },
    // 4T-001847: Wird ein Dokument während des Schreibens zu einer Tafel oder
    // hört auf, eine zu sein, müssen Schaltfläche und Menü-Eintrag nachziehen.
    // Der Rückruf hängt am 200-ms-Takt der Tafel und feuert nur beim echten
    // Wechsel, damit der Menü-Report nicht bei jedem Tastendruck über die
    // Brücke geht.
    beiVerfuegbarkeitsWechsel: () => {
      syncToolbarToActiveTab();
      reportMenuStateNow();
    },
    // 4T-001848 (Epic 3E-000110): Die Fläche erbt die Änderbarkeit ihres
    // Dokuments (Entscheidung des Bestands vom 2026-09-09). Dieselbe Antwort
    // und dieselbe Herkunft wie bei der Canvas darüber: Reiter im
    // Änderungs-Modus UND EditorView nicht schreibgeschützt.
    istAenderbar: (paneIdx) => {
      const pane = state.panes[paneIdx];
      const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
      const view = paneEditors[paneIdx];
      return !!tab && !!tab.editMode && !!view && !view.state.readOnly;
    },
    // 4T-001849 (Epic 3E-000110): Schreibweg der Karten-Bedienung. Dieselbe
    // Herkunft und dieselbe Begruendung wie bei der Canvas darueber: Der
    // Kanban-Ordner darf `editor.js` nicht importieren (Zyklus editor ->
    // kanban-pane -> editor), deshalb kommt der Zugriff auf die EditorView von
    // hier. Eine Bedien-Handlung = eine Transaktion = ein Rueckgaengig-Schritt;
    // die `userEvent`-Anmerkung haelt sie in der Historie getrennt.
    schreibeDokument: (paneIdx, daten) => ersetzeZeilenBereich(paneIdx, daten),
    // 4T-001849: Der Statuswechsel auf der Karte laeuft ueber DIESELBE
    // Status-Kette wie der Klick auf das Kaestchen in der Lese-Ansicht
    // (performStatusToggle: Ketten-Toggle, Automatik-Daten, Wiederholung, ein
    // Undo-Schritt). Eine zweite Status-Logik entsteht nicht (Story 4S-000973).
    statusUmschalten: (paneIdx, zeilenNummer) => {
      const view = paneEditors[paneIdx];
      if (!view || view.state.readOnly) return false;
      return !!performStatusToggle(view, zeilenNummer);
    },
    // 4T-001850 (Epic 3E-000110): Derselbe Statuswechsel als Text-Rechnung.
    // Beim Verschieben in eine Spalte, die abhakt, muessen Verschieben und
    // Abhaken EINE Transaktion sein; der Weg darueber schriebe selbst und
    // ergaebe zwei Rueckgaengig-Schritte. Es ist dieselbe Kette — die Funktion
    // ruft `performStatusToggle` ueber eine Ein-Zeilen-Attrappe — und keine
    // zweite Status-Logik (Story 4S-000976).
    statusAufText: (text, zeilenNummer) => statusToggleAufText(text, zeilenNummer),
    // Nachtrag zu 4T-001849 vom 2026-09-21: Rueckgaengig und Wiederholen der
    // Tafel-Ansicht, wortgleich zur Canvas darueber und aus demselben Grund.
    // Der Tafel-Modus blendet `.pane-source` aus (kanban.css neben
    // canvas.css); das Tastenkuerzel-Verzeichnis des Editors haengt an dessen
    // Inhalts-Element und ist damit unerreichbar. Dieselbe Historie: Jede
    // Bedien-Handlung der Tafel schreibt als gewoehnliche Transaktion hinein.
    rueckgaengig: (paneIdx) => rueckgaengigInSpalte(paneEditors[paneIdx]),
    wiederholen: (paneIdx) => wiederholenInSpalte(paneEditors[paneIdx]),
    // 4T-001849: Das Kontextmenue der Karte im gemeinsamen Menue des Fensters.
    // Damit gelten die Schliess-Wege des Bestands (Klick ausserhalb,
    // Escape-Kaskade in app-input-bindings.js) ohne eigenes Zutun.
    zeigeKontextmenue: (paneIdx, { x, y, eintraege }) => showContextMenuItems(eintraege, x, y),
    schliesseKontextmenue: () => hideContextMenu(),
    // 4T-001851 (Epic 3E-000110): Die Rueckfrage vor dem Loeschen einer nicht
    // leeren Spalte laeuft ueber den Rueckfrage-Dialog des Bestands im
    // Hauptprozess (Muster events:confirmDelete); ein eigener Dialog der Tafel
    // entsteht nicht. Fehlt die Bruecke, wird nicht geloescht: Ohne Rueckfrage
    // verschwaenden Karten ungefragt.
    bestaetigeSpaltenLoeschung: (_paneIdx, angaben) =>
      typeof api.kanbanConfirmDeleteColumn === 'function'
        ? api.kanbanConfirmDeleteColumn(angaben)
        : Promise.resolve(false),
  });
  // 4T-001852 (Epic 3E-000110): Zugang der beiden Anlege-Wege. Er ist schmal,
  // weil beide Wege ansetzen, wo es noch keine gezeichnete Tafel gibt: das
  // neue Dokument über den Weg von «Datei → Neu», das Umwandeln über denselben
  // Editor-Schreibweg, den die Bedienung der Tafel als `schreibeDokument`
  // bekommt — eine Transaktion, ein Rückgängig-Schritt.
  initTafelAnlegen({
    aktivesDokument: (paneIdx) => {
      const pane = state.panes[paneIdx];
      return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    },
    neuesDokument: (optionen) => newUntitledTab(optionen),
    istAenderbar: (paneIdx) => {
      const pane = state.panes[paneIdx];
      const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
      const view = paneEditors[paneIdx];
      return !!tab && !!tab.editMode && !!view && !view.state.readOnly;
    },
    schreibeDokument: (paneIdx, daten) => ersetzeZeilenBereich(paneIdx, daten),
    hinweis: (schluessel) => showStatusbarHint(schluessel, { error: true, duration: 2500 }),
  });
  // 4T-001668 (Epic 3E-000287): Zugang und Klapp-Zustand des Canvas-Blocks
  // außerhalb der Canvas-Ansicht (Entscheidung E8). Denselben Grund wie oben
  // für die Injektion: Der Canvas-Ordner darf weder den Fenster-Zustand noch
  // die Kommando-Palette importieren.
  initCanvasBlock({
    aktivesDokument: (paneIdx) => {
      const pane = state.panes[paneIdx];
      return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    },
    // Der Modus-Wechsel läuft über den Kommando-Handler und nicht an ihm
    // vorbei: `commandHandlers` IST der Dispatcher, den auch Menü, Palette und
    // Tastenkürzel bedienen (executeCommandById reicht genau hierher durch).
    // Damit gilt für den Knopf im Block dieselbe eine Regel wie für die drei
    // übrigen Zugänge zum Modus.
    oeffneFlaeche: (paneIdx, startZeile) => {
      if (paneIdx >= 0) state.activePaneIndex = paneIdx;
      const handler = commandHandlers['view.modeCanvas'];
      if (typeof handler === 'function') handler();
      waehleCanvasFlaecheAbZeile(state.activePaneIndex, startZeile);
    },
  });
  initMacros({
    registerHandler: (commandId, fn) => {
      commandHandlers[commandId] = fn;
    },
    unregisterHandler: (commandId) => {
      delete commandHandlers[commandId];
    },
    refreshHotkeys: rebuildHotkeyDispatchMap,
  });
  // 4T-000520 (Epic 3E-000094): Kommando-Platzierung verdrahten (Mehr-Menue,
  // Resize-Beobachtung, Broadcast-Empfang) und Segment plus Hide-Liste
  // auf den geladenen Stand bringen.
  initCommandPlacementUi();
  // 4T-000607 (Epic 3E-000114): Format-Toolbar verdrahten (Mehr-Menues,
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
  // 4T-000331 (Epic 3E-000060): defekte .mdd — Protokollierung ist main-seitig
  // ausgesetzt, der Nutzer sieht den Grund in der Statusbar.
  api.onMddDefect(() => {
    showStatusbarHint('history.defectHint', { duration: 5000, error: true });
    // Zustand koennte auf pausiert gewechselt haben.
    void updateHistoryStatus();
  });
  // 4T-000332 (Epic 3E-000060): Statusbar-Element der Dokument-Historie
  // (Klick-Menue fuer den Datei-Schalter, Initial-Zustand).
  initHistoryStatus();
  // 4T-000333 (Epic 3E-000060): Historien-Ansicht als System-Seite registrieren.
  initHistoryPage();
  // 4T-000455 (Epic 3E-000084): Bereichs-Graph-Seite registrieren.
  initGraphTab();
  // 4T-000620 (Epic 3E-000117): Bereichs-Statistik-Seite registrieren.
  initAreaStatsPage();
  // 4T-000868 (Epic 3E-000162): Regal-Ansichts-Seite registrieren.
  initShelfViewPage();
  // 4T-001599 (Epic 3E-000191): My-Extended-Memory-Seite registrieren.
  initMemoryPage();
  // 4T-000480 (Epic 3E-000089): Kommando-Palette — Ausfuehrungs-Pfad injizieren
  // (global dispatchte Kommandos laufen ueber die commandHandlers-Map).
  initCommandPalette({
    // 4T-000520 (Epic 3E-000094): Rueckgabe des Handler-Ergebnisses, damit
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
  // 4T-000368 (Epic 3E-000068): wiederhergestellte Entwuerfe als Unbenannt-Tabs im
  // ersten Pane oeffnen (vor applyAllLayouts, damit sie mitgerendert werden).
  if (initialState && Array.isArray(initialState.drafts) && initialState.drafts.length > 0) {
    openDraftsAsUntitled(initialState.drafts);
  }

  applyAllLayouts();

  // Init ist durch — gepufferte Datei-Argumente vom kalten Start jetzt oeffnen,
  // und ab jetzt direkt verarbeiten statt zu puffern.
  initDone = true;
  // 4T-000614 (Epic 3E-000115): ehrliches Bereitschafts-Signal fuer E2E-Tests.
  // bindUi() bindet die Statusbar-Toggle-Klicks (u.a. #btn-bookmarks) erst hier
  // im init()-Verlauf, waehrend applyPanelButtonOrder() die Panel-Buttons schon
  // deutlich frueher umsortiert. Der bisherige E2E-Marker (erster Panel-Button)
  // ist damit kein verlaesslicher Beleg mehr, dass init() vollstaendig durch ist
  // und die Buttons klickbar sind. Dieses Attribut steht erst nach initDone und
  // nach bindUi(); Tests, die unmittelbar nach dem Fenster-Start klicken oder
  // tippen, warten darauf. Fuer den Produktivbetrieb ohne Wirkung.
  document.body.setAttribute('data-renderer-ready', '1');
  // 4T-001759 (Epic 3E-000253): Anlauf der Datenbank-Übersicht für das frisch
  // gestartete Fenster; die Begründung steht an der Funktion.
  void zeigeUebersichtBeimBinden();
  // 4T-001579 (Epic 3E-000283): Überlauf-Messung der Statusleiste verdrahten.
  // Der Aufruf steht bewusst hier, nach applyAllLayouts() und dem
  // Bereitschafts-Signal: Erst dann trägt die Leiste ihren tatsächlichen
  // Bestand (Panel-Reihenfolge, Erweiterungs-Gates, Ausblend-Liste,
  // Kommando-Buttons, Ansichts-Schalter des aktiven Reiters), und nur eine
  // Messung am fertigen Bestand ist eine Aussage.
  // 4T-001580: Der Aufruf ist seither asynchron — er lädt zuerst den
  // persistierten Falt-Modus, damit die erste Messung ihn bereits sieht und
  // die Leiste nicht sichtbar von ausgeklappt nach eingeklappt springt.
  await initStatusbarOverflow();
  // 4T-000644 (Epic 3E-000127): Erststart-Anlauf der geführten Produkt-Tour. Der
  // Aufruf liegt bewusst NACH dem Bereitschafts-Signal, weil die Tour die
  // fertig gebundenen Bedienelemente hervorhebt und ihre Anker erst dann
  // stehen; er wird nicht abgewartet, damit die Start-Sequenz durchläuft.
  maybeStartTourOnFirstRun().catch(() => {
    // Merker nicht lesbar oder Tour nicht aufbaubar: Das Fenster startet ohne
    // Tour weiter, die Tour bleibt von Hand erreichbar.
  });
  if (pendingExternalFiles.length > 0) {
    const files = pendingExternalFiles.splice(0);
    await openInPane(state.activePaneIndex, files);
  }
  // 4T-000012: ggf. gepufferte Tab-Appends aus anderen Fenstern abarbeiten.
  if (pendingAppendPayloads.length > 0) {
    const payloads = pendingAppendPayloads.splice(0);
    for (const p of payloads) await handleAppendTabFromOtherWindow(p);
  }
  // M-08 (4T-000185): waehrend der Initialisierung eingetroffenen
  // Sprachwechsel nachziehen (Renn-Fenster zwischen Store-Lesen und
  // Listener-Wirksamkeit).
  if (pendingLanguageChange && pendingLanguageChange !== state.language) {
    await applyLanguageChange(pendingLanguageChange, { persist: false });
  }
  pendingLanguageChange = null;
  // 4T-000539 (Epic 3E-000098): waehrend der Initialisierung eingetroffenen
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

// --- UI-Bindings ------------------------------------------------------------
// 4T-001001: bindUi ist die Aufruf-Sequenz der Binding-Module in der Reihenfolge
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
