// Tab-Lebenszyklus (Oeffnen, Aktivieren, Schliessen, Verschieben/Kopieren zwischen Panes und Fenstern).
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { t } from '../i18n.js';

import { api, $ } from './api.js';
import { updateWordCountStatusbar } from './render-mermaid.js';
import {
  DEFAULT_VIEW_MODE,
  DEFAULT_ZOOM,
  MAX_PANES,
  MIME_TAB,
  WINDOW_DRAG_TOKEN,
  activeTab,
  areaPanelVisiblePref,
  btnEdit,
  createEmptyPane,
  createTab,
  getEditorViewDefaults,
  paneRoots,
  renderZoomIndicator,
  state,
  tabDisplayName,
  withDialog,
} from './app-state.js';
// 4T-0568 (Epic 3E-0104): geordnete Panel-Liste im Menue-State — Reihenfolge
// aus dem shared Modell bzw. dem Reihenfolge-Setting, Erweiterungs-Filterung
// wie an der Statusbar (isExtensionActive kommt weiter unten mit den
// Tab-Gruppen-Imports).
import { PANEL_ACCESS } from '../../shared/panel-access.js';
import { getPanelToggleOrder } from './sidebar-layout.js';
import { updateWindowTitle } from './editor.js';
import {
  renderOutgoingLinks,
  updateBacklinksToggleButton,
  updateOutlineToggleButton,
} from './panels.js';
import { updateBookmarksToggleButton } from './bookmarks.js';
// 4T-0456 (Epic 3E-0084): Datei-Graph-Panel folgt der aktiven Datei
// (debounct; Hooks in activateTab/closeTab, Muster Outgoing-Links).
import { scheduleFileGraphRender } from './file-graph-panel.js';
import {
  flushPendingPropertiesSave,
  updatePropertiesToggleButton,
  updateTagsToggleButton,
} from './properties-tags.js';
import {
  applyAllLayouts,
  persistState,
  renderTabbar,
  saveTab,
  showStatusbarHint,
  updateScrollSyncButton,
} from './views.js';
// 4T-0323 (Epic 3E-0058): Renderer-seitige Bereichs-Vorpruefung.
import { isOutsideActiveArea } from './area.js';
// 4T-0332 (Epic 3E-0060): Statusbar-Zustand der Dokument-Historie folgt dem
// aktiven Tab (Laufzeit-Zyklus tabs <-> history-status, Muster 4T-0179).
import { updateHistoryStatus } from './history-status.js';
// 4T-0213 (Epic 3E-0042): Handbuch-Tab-Transfer zwischen Fenstern laeuft
// ueber openManualPage (Einfach-Instanz-Pruefung im Zielfenster).
import { openManualPage } from './manual.js';
// 4T-0277 (Epic 3E-0049): System-Seiten-Transfer analog zum Handbuch;
// 4T-0279: onClose-Haken beim Schliessen eines System-Tabs.
import { openSystemPage, systemPageById } from './system-pages.js';
import { refreshSearchIfVisible } from './search.js';
// 4T-0459 (Epic 3E-0085): Tab-Gruppen-Invarianten — Leergruppen-Bereinigung
// nach Schliessen/Verschieben, Gruppen-Beitritt bei Einfuegung ins
// Block-Innere (reine Helfer, unit-getestet). 4T-0460: Klapp-Logik
// (Kopf-Klick, Aktivierungs-Wechsel, Sichtbarkeits-Garantie des aktiven
// Tabs) und Gruppen-Block-Verschiebung per Kopf-Ziehen.
import {
  addTabToGroup,
  addTabsToGroup,
  groupById,
  groupIdForInsertion,
  groupRange,
  insertTabNextTo,
  moveGroupWithinPane,
  pruneEmptyGroups,
} from './tab-groups.js';
// 4T-0461 (Epic 3E-0085): bei deaktivierter Erweiterung tab-groups sind
// alle Tabs sichtbar — die Klapp-bezogene Aktivierungs-Logik entfaellt,
// damit gespeicherte Klapp-Zustaende nicht veraendert werden.
import { isExtensionActive } from './extension-lifecycle.js';
// 4T-0765 (Epic 3E-0158): Mehrfach-Auswahl der Reiterleiste (reine Helfer).
import {
  clearSelection,
  moveTabsWithinPane,
  pruneSelection,
  setSelection,
} from './tab-selection.js';

// K-04 (4T-0310): Tab-Drag-Payload parsen — gehoert fachlich zum Tab-System
// (zuvor Fremdkoerper in settings-search.js). Verwirft Payloads mit fremdem
// Fenster-Token.
export function parseTabDrag(e) {
  try {
    const raw = e.dataTransfer.getData(MIME_TAB);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // R4-04 (4T-0170): Drops aus einem anderen BrowserWindow derselben App
    // verwerfen — deren Pane-/Tab-Indizes beziehen sich auf fremden State.
    if (!data || data.windowToken !== WINDOW_DRAG_TOKEN) return null;
    return data;
  } catch {
    return null;
  }
}

// --- Datei öffnen -----------------------------------------------------------
export async function openDialog() {
  const files = await api.openDialog();
  if (files.length > 0) await openInPane(state.activePaneIndex, files);
}

// Cross-Pane-Lookup (Variante B): wenn die Datei in IRGENDEINER Pane offen ist,
// dorthin springen und Tab aktivieren — kein Duplikat.
// 4T-0631 (Epic 3E-0102): inheritGroup kennzeichnet Öffnungen, die ein Klick
// im Inhalt eines Dokument-Tabs auslöst — neue Tabs erben dann die Tab-Gruppe
// des zum Aufruf-Zeitpunkt aktiven Tabs der Ziel-Pane. Bewusst ein explizites
// Flag der Aufrufer statt einer Pauschal-Heuristik: Panel-, Paletten- und
// Dialog-Öffnungen bleiben ungruppiert (Epic-Architekturentscheidung 6).
// 4T-0648 (Epic 3E-0130): Der Einfüge-Ort ist nicht mehr das Gruppen-Ende,
// sondern die Stelle unmittelbar RECHTS NEBEN dem Herkunfts-Tab. Der
// Zusammenhang zwischen Herkunft und Ziel bleibt so sichtbar; am Gruppen-Ende
// lag das Ziel bei mehreren Mitgliedern weit von seiner Herkunft entfernt.
// Die Positions-Regel gilt unabhängig von der Erweiterung tab-groups (sie ist
// eine Reiter-Positions-Regel, keine Gruppen-Funktion); die Gruppen-Zuordnung
// übernimmt insertTabNextTo aus dem Herkunfts-Tab und hält damit die
// Zusammenhangs-Invariante.
export async function openInPane(targetPaneIdx, paths, { inheritGroup = false } = {}) {
  // R4-09 (4T-0186): tatsaechliche Ziel-Pane zurueckgeben — wenn die Datei
  // bereits in der anderen Spalte offen ist, landet die Aktivierung dort,
  // und Anker-/Zeilen-Sprünge der Aufrufer muessen dieser Pane folgen.
  let landedPaneIdx = targetPaneIdx;
  // Den Herkunfts-Tab einmalig VOR dem Öffnen festhalten: das Öffnen selbst
  // verschiebt die Aktivierung (auch über den Bereits-offen-Zweig), der
  // Klick kam aber aus dem jetzt aktiven Tab. Als Objekt-Referenz, weil sich
  // Indizes durch jedes Einfügen verschieben.
  let refTab = null;
  if (inheritGroup) {
    const srcPane = state.panes[targetPaneIdx];
    refTab = srcPane && srcPane.activeIndex >= 0 ? srcPane.tabs[srcPane.activeIndex] : null;
  }
  for (const raw of paths) {
    const p = raw;
    // 4T-0323 (Epic 3E-0058): harte Bereichs-Grenze — Dateien ausserhalb des
    // Bereichs werden nicht geoeffnet (Drag & Drop, Links, Lesezeichen etc.);
    // lokalisierte Meldung statt des generischen Lesefehlers. Die
    // autoritative zweite Linie sitzt main-seitig in file:read.
    if (isOutsideActiveArea(p)) {
      showStatusbarHint('statusbar.outsideAreaFile', { duration: 3000, error: true });
      continue;
    }
    // 4T-0331 (Epic 3E-0060): Markdown-Data-Begleitdateien (.mdd/.mdda/.mddb)
    // sind keine Dokumente — lokalisierter Hinweis statt generischem
    // Lesefehler. Die autoritative zweite Linie sitzt main-seitig in file:read.
    // 4T-0352 (Epic 3E-0064): explizite Endungs-Liste statt mddb?-Muster,
    // damit die neue .mdda-Endung sicher mitgefasst wird.
    if (/\.(mdd|mdda|mddb)$/i.test(p)) {
      showStatusbarHint('statusbar.mddFile', { duration: 3000, error: true });
      continue;
    }
    const found = findTabAcrossPanes(p);
    if (found) {
      activatePane(found.paneIdx);
      activateTab(found.paneIdx, found.tabIdx);
      api.pushRecent(p);
      landedPaneIdx = found.paneIdx;
      continue;
    }
    try {
      const data = await api.readFile(p);
      // W-01 (4T-0309): {ok,error}-Vertrag — Lesefehler ueber den vorhandenen
      // catch (Statusbar-Hinweis) statt frueherer IPC-Exception.
      if (!data || !data.ok) throw new Error((data && data.error) || 'read failed');
      // 4T-0572 (Epic 3E-0105): die drei Editor-Ansicht-Schalter loest
      // createTab selbst auf (Frontmatter → Voreinstellung); viewMode faellt
      // wie bisher auf state.defaultViewMode zurueck.
      const pane = state.panes[targetPaneIdx];
      const tab = createTab(data.path, data.content);
      // 4T-0648: unmittelbar rechts neben dem Herkunfts-Tab einfügen (Gruppe
      // wird dabei aus ihm übernommen); ohne Herkunft — oder wenn sie
      // inzwischen geschlossen bzw. in die andere Spalte gewandert ist — wie
      // bisher ans Streifen-Ende.
      const refIdx = refTab ? pane.tabs.indexOf(refTab) : -1;
      let newIdx = refIdx >= 0 ? insertTabNextTo(pane, tab, refIdx) : -1;
      if (newIdx < 0) {
        pane.tabs.push(tab);
        newIdx = pane.tabs.length - 1;
      }
      // Mehrere Pfade in einem Aufruf: der nächste folgt diesem Tab, sonst
      // stünden sie in umgekehrter Reihenfolge hinter der Herkunft.
      if (refTab) refTab = tab;
      activatePane(targetPaneIdx);
      activateTab(targetPaneIdx, newIdx);
      api.pushRecent(data.path);
      landedPaneIdx = targetPaneIdx;
    } catch (err) {
      console.error('Konnte Datei nicht lesen:', p, err);
      // R4-10 (4T-0187): sichtbares Feedback statt stillem Konsolen-Log.
      showStatusbarHint(null, {
        text: t('open.failedHint').replace('{name}', api.basename(p) || p),
        error: true,
        duration: 3000,
      });
    }
  }
  applyAllLayouts();
  persistState();
  return landedPaneIdx;
}

export function findTabAcrossPanes(path) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((t) => t.path === path);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx };
  }
  return null;
}

// --- Pane-Aktivierung -------------------------------------------------------
export function activatePane(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  if (state.activePaneIndex === paneIdx) {
    updateActivePaneClasses();
    syncToolbarToActiveTab();
    updateOutlineToggleButton();
    updateBacklinksToggleButton();
    // R5-11 (4T-0187): Properties-/Tags-Toggle folgen der aktiven Pane.
    updatePropertiesToggleButton();
    updateTagsToggleButton();
    renderZoomIndicator();
    return;
  }
  // 4T-0765 (Epic 3E-0158): Die Auswahl gehoert zur einzelnen Leiste und
  // verfaellt beim Wechsel der Spalte — sonst bezoege sich eine unsichtbar
  // gewordene Menge spaeter auf Reiter, die der Anwender laengst vergessen hat.
  const vorherigePane = state.panes[state.activePaneIndex];
  if (vorherigePane) clearSelection(vorherigePane);
  state.activePaneIndex = paneIdx;
  updateActivePaneClasses();
  syncToolbarToActiveTab();
  updateOutlineToggleButton();
  updateBacklinksToggleButton();
  // R5-11 (4T-0187): Properties-/Tags-Toggle zeigten nach Pane-Wechsel den
  // Zustand der vorherigen Pane (Muster Outline/Backlinks).
  updatePropertiesToggleButton();
  updateTagsToggleButton();
  // 4T-0017: Pane-Wechsel aendert den fokussierten Tab — Indikator nachziehen.
  renderZoomIndicator();
  // Bei aktiver Suche im neuen Pane neu suchen.
  refreshSearchIfVisible();
}

export function updateActivePaneClasses() {
  paneRoots.forEach((r, i) => r.classList.toggle('active-pane', i === state.activePaneIndex));
}

// Setzt View-Buttons + Toggle-Buttons passend zum aktiven Tab.
// Toggles werden ausgegraut, wenn keine Quellcode-Pane sichtbar ist.
export function syncToolbarToActiveTab() {
  const tab = activeTab();
  // 4T-0572 (Epic 3E-0105): ohne aktiven Tab zeigen die Toggles die globale
  // Voreinstellung statt der frueheren hartkodierten Konstanten.
  const viewDefaults = getEditorViewDefaults();
  const viewMode = tab ? tab.viewMode : DEFAULT_VIEW_MODE;
  const wrap = tab ? tab.wrapLines : viewDefaults.wrapLines;
  const numbers = tab ? tab.showLineNumbers : viewDefaults.showLineNumbers;
  const foldGutter = tab ? tab.showFoldGutter : viewDefaults.showFoldGutter;

  // 4T-0277: System-Seiten (Einstellungen) kennen keine View-Modi — die
  // vier View-Buttons sind fuer sie deaktiviert (sichtbar deaktiviert
  // statt still wirkungslos, Entwicklungsrichtlinien §3).
  const systemTab = !!(tab && tab.systemPage);
  document.querySelectorAll('.view-btn').forEach((b) => {
    b.classList.toggle('active', !systemTab && b.dataset.view === viewMode);
    b.disabled = systemTab;
  });

  const sourceVisible =
    !systemTab && (viewMode === 'source' || viewMode === 'split' || viewMode === 'live');
  const wrapBtn = $('#btn-wrap');
  const numbersBtn = $('#btn-numbers');
  const foldGutterBtn = $('#btn-fold-gutter');
  wrapBtn.classList.toggle('active', wrap);
  numbersBtn.classList.toggle('active', numbers);
  if (foldGutterBtn) {
    foldGutterBtn.classList.toggle('active', foldGutter);
    foldGutterBtn.disabled = !sourceVisible || !tab;
  }
  wrapBtn.disabled = !sourceVisible || !tab;
  numbersBtn.disabled = !sourceVisible || !tab;
  if (btnEdit) {
    btnEdit.classList.toggle('active', !!(tab && tab.editMode));
    // 4T-0213: Handbuch-Tabs sind dauerhaft read-only — Stift deaktiviert,
    // Tooltip erklaert den Grund (data-i18n-title fuer Sprachwechsel).
    // 4T-0277: System-Seiten ebenso (Tooltip bleibt der Standard-Text;
    // das Formular der Seite ist selbst der Bearbeitungs-Ort).
    const manualTab = !!(tab && tab.manualPage);
    btnEdit.disabled = !tab || manualTab || systemTab;
    const titleKey = manualTab ? 'manual.editDisabled' : 'statusbar.edit';
    btnEdit.setAttribute('data-i18n-title', titleKey);
    btnEdit.title = t(titleKey);
  }
  // 4T-0070: Scroll-Sync-Toggle in der Statusbar an den aktiven Tab anpassen.
  updateScrollSyncButton();
  // 4T-0332 (Epic 3E-0060): Historien-Zustand des aktiven Tabs nachziehen
  // (asynchron; veraltete Antworten verwirft das Modul selbst).
  void updateHistoryStatus();
  reportMenuStateNow();
  updateWindowTitle();
}

// 4T-0568 (Epic 3E-0104): Roh-Praeferenz je Panel (Haekchen-Semantik der
// bisherigen xxxVisible-Flags: der geschaltete Wunsch-Zustand einer Spalte,
// OHNE Empty-State-Override — identisch zur Active-State-Quelle der
// Statusbar-Buttons). getVisible der Registry ist bewusst NICHT die Quelle,
// weil es die effektive Sichtbarkeit inklusive Empty-State liefert.
// 4T-0624 (Epic 3E-0119): auf paneIdx parametrisiert und ueber
// panelRawVisible exportiert — die Sidebar-Varianten frieren die
// Roh-Sichtbarkeit beider Spalten ein.
const PANEL_RAW_VISIBLE = {
  bookmarks: (paneIdx) => !!(state.bookmarks && state.bookmarks.visibleByPane[paneIdx]),
  area: (paneIdx) => !!areaPanelVisiblePref(paneIdx),
  // 4T-0844 (Epic 3E-0147): Inhaltsverzeichnis des Buches.
  book: (paneIdx) => !!(state.bookPanel && state.bookPanel.visibleByPane[paneIdx]),
  outline: (paneIdx) => !!state.outline.visibleByPane[paneIdx],
  subpages: (paneIdx) => !!(state.subpages && state.subpages.visibleByPane[paneIdx]),
  filegraph: (paneIdx) => !!(state.fileGraph && state.fileGraph.visibleByPane[paneIdx]),
  // 4T-0887 (PO-Befund der Test-Iteration 0.105.0): Das Such-Panel fehlte in
  // dieser Tabelle seit ihrer Einfuehrung; unbekannte IDs liefern false, das
  // Menue-Haekchen der Suchergebnisse blieb dadurch dauerhaft leer.
  searchresults: (paneIdx) => !!(state.searchResults && state.searchResults.visibleByPane[paneIdx]),
  calendar: (paneIdx) => !!(state.calendar && state.calendar.visibleByPane[paneIdx]),
  reminders: (paneIdx) => !!(state.reminders && state.reminders.visibleByPane[paneIdx]),
  clock: (paneIdx) => !!(state.clock && state.clock.visibleByPane[paneIdx]),
  notes: (paneIdx) => !!(state.notes && state.notes.visibleByPane[paneIdx]),
  properties: (paneIdx) => !!(state.properties && state.properties.visibleByPane[paneIdx]),
  tags: (paneIdx) => !!(state.tags && state.tags.visibleByPane[paneIdx]),
  blockprops: (paneIdx) => !!(state.blockProps && state.blockProps.visibleByPane[paneIdx]),
  outgoing: (paneIdx) => !!(state.outgoing && state.outgoing.visibleByPane[paneIdx]),
  backlinks: (paneIdx) => !!(state.backlinks && state.backlinks.visibleByPane[paneIdx]),
};

// 4T-0624 (Epic 3E-0119): Roh-Sichtbarkeit eines Panels in einer Spalte
// (unbekannte Panel-IDs liefern false).
export function panelRawVisible(id, paneIdx) {
  const getter = PANEL_RAW_VISIBLE[id];
  return getter ? getter(paneIdx) : false;
}

// 4T-0626 (Epic 3E-0119): Provider der Sidebar-Varianten-Listen fuer den
// Menue-State ({ global, area, areaName }). Injektion statt Import, damit
// kein Zyklus tabs.js <-> sidebar-variants.js entsteht (sidebar-variants
// importiert panelRawVisible und reportMenuStateNow von hier).
let sidebarVariantsMenuProvider = null;
export function setSidebarVariantsMenuProvider(fn) {
  sidebarVariantsMenuProvider = typeof fn === 'function' ? fn : null;
}
function sidebarVariantsMenuState() {
  if (!sidebarVariantsMenuProvider) return { global: [], area: [], areaName: null };
  return sidebarVariantsMenuProvider();
}

// Geordnete Panel-Liste fuer das Ansichtsmenue-Untermenue: effektive
// Toggle-Reihenfolge, Panels deaktivierter Erweiterungen entfallen (wie an
// der Statusbar ueber EXTENSION_STATUSBAR_BUTTONS).
export function panelToggleStates() {
  const out = [];
  for (const id of getPanelToggleOrder()) {
    const meta = PANEL_ACCESS.find((p) => p.id === id);
    if (!meta) continue;
    if (meta.extensionId && !isExtensionActive(meta.extensionId)) continue;
    const getter = PANEL_RAW_VISIBLE[id];
    out.push({ id, visible: getter ? getter(state.activePaneIndex) : false });
  }
  return out;
}

// Spiegelt den menue-relevanten Stand an den Main-Prozess, damit das
// Fenster-Menue Haekchen und Disabled-States passend zum aktiven Tab anzeigt.
export function reportMenuStateNow() {
  const tab = activeTab();
  const viewMode = tab ? tab.viewMode : null;
  // 4T-0572 (Epic 3E-0105): Fallbacks ohne aktiven Tab aus der globalen
  // Voreinstellung statt hartkodierter Literale/Konstanten.
  const viewDefaults = getEditorViewDefaults();
  api.reportMenuState({
    locale: state.language,
    viewMode,
    lineNumbers: tab ? !!tab.showLineNumbers : viewDefaults.showLineNumbers,
    wordWrap: tab ? !!tab.wrapLines : viewDefaults.wrapLines,
    // 4T-0013: Haekchen-Stand fuer das Gliederungs-Toggle im Ansicht-Menue.
    foldGutter: tab ? !!tab.showFoldGutter : viewDefaults.showFoldGutter,
    togglesEnabled: viewMode === 'source' || viewMode === 'split' || viewMode === 'live',
    hasActiveTab: !!tab,
    // 4T-0213: Handbuch-Tabs — Menue deaktiviert Bearbeiten/Speichern.
    manualTab: !!(tab && tab.manualPage),
    // 4T-0277: System-Seiten (Einstellungen) — Menue deaktiviert zusaetzlich
    // View-Modi und Export.
    systemTab: !!(tab && tab.systemPage),
    // 4T-0568 (Epic 3E-0104): geordnete Panel-Liste fuer das Panel-
    // Untermenue (ersetzt die frueheren elf xxxVisible-Einzel-Flags; damit
    // fuehren erstmals auch Notizen/Block-Eigenschaften/Datei-Graph/
    // Erinnerungen korrekte Haekchen — die vier Flags fielen zuvor in
    // normalizeMenuState unter den Tisch).
    panels: panelToggleStates(),
    // 4T-0626 (Epic 3E-0119): Sidebar-Varianten-Listen fuer das Untermenue
    // „Sidebar-Anordnungen" ({ global, area, areaName }; der Main baut
    // daraus die Eintraege — Muster Panel-Untermenue).
    sidebarVariants: sidebarVariantsMenuState(),
    // 4T-0019: Haekchen-Stand fuer Fokus-Modus und Typewriter-Scroll im
    // Ansicht-Menue (beide pro Fenster wirksam, global persistiert).
    focusMode: !!state.focusMode,
    typewriterScroll: !!state.typewriterScroll,
    // 4T-0697 (Epic 3E-0141): Kollaps-Zustand der linken/rechten Sidebar-
    // Spalte der AKTIVEN Pane-Group (die beiden Menue-Haekchen folgen der
    // aktiven Spalte; bei geteilter Ansicht schaltet jede Pane-Group
    // unabhaengig).
    sidebarCollapsedLeft: !!state.sidebarCollapsed.left[state.activePaneIndex],
    sidebarCollapsedRight: !!state.sidebarCollapsed.right[state.activePaneIndex],
    // 4T-0019: Edit-Modus pro Tab. Im Menue als Checkbox "Bearbeiten" mit
    // Accelerator Strg+E. Damit ist der Modus auch im Fokus-Modus
    // erreichbar (Toolbar-Button ist dort ausgeblendet).
    editMode: tab ? !!tab.editMode : false,
    // 4T-0070: Scroll-Synchronisation pro Tab. Im Menue als Checkbox.
    scrollSyncEnabled: tab ? !!tab.scrollSyncEnabled : false,
  });
}

// --- Tab-Verwaltung ---------------------------------------------------------
// 4T-0765 (Epic 3E-0158): opts.keepSelection haelt die Mehrfach-Auswahl. Ohne
// das Flag setzt jede Aktivierung die Auswahl auf den aktivierten Reiter
// zurueck — das haelt die Invariante „der aktive Reiter ist Mitglied" ohne
// Sonderfaelle und verhindert, dass eine Menge eine Oeffnung aus einem
// Dokument heraus (Wiki-Link, Palette) stillschweigend ueberdauert. Gesetzt
// wird das Flag allein vom Strg-Klick-Pfad der Reiterleiste.
export function activateTab(paneIdx, tabIdx, opts = {}) {
  const pane = state.panes[paneIdx];
  if (!pane || tabIdx < 0 || tabIdx >= pane.tabs.length) return;
  pane.activeIndex = tabIdx;
  if (!opts.keepSelection) setSelection(pane, tabIdx);
  // 4T-0767 (Epic 3E-0158): Eine Aktivierung von aussen (Datei-Oeffnen,
  // Wiki-Link, Kommando-Palette, Cross-Pane-Lookup, Fenster-Transfer,
  // Strg+Tab) klappt die Gruppe NICHT mehr auf (Entscheidung des Product
  // Owners vom 2026-07-28). Der Zustand der Leiste aendert sich nie von
  // selbst; die aktive Datei nennen Fenstertitel und Aufklapp-Menue.
  activatePane(paneIdx);
  // K-04 (4T-0310): kein direktes renderTabbar/renderPaneContent hier — das
  // folgende applyAllLayouts() rendert ueber renderAllPanes ohnehin alle Panes
  // (Tabbar-DOM wurde sonst zwei- bis dreifach pro Aktivierung gebaut).
  applyAllLayouts();
  // 4T-0017: Indikator zeigt den Zoom des fokussierten Tabs; bei Tab-Wechsel
  // innerhalb der aktiven Pane mit anpassen.
  renderZoomIndicator();
  // 4T-0072: Word Count an die jetzt aktive Datei anpassen.
  updateWordCountStatusbar();
  // 4T-0073: Outgoing-Links neu rendern, sofern Sektion sichtbar.
  if (state.outgoing && state.outgoing.visibleByPane[paneIdx]) {
    renderOutgoingLinks(paneIdx);
  }
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Panel folgt der aktiven Datei.
  if (state.fileGraph && state.fileGraph.visibleByPane[paneIdx]) {
    scheduleFileGraphRender(paneIdx);
  }
  // 4T-0075: Statusbar-Stern an den Bookmark-Stand der aktiven Datei anpassen.
  updateBookmarksToggleButton();
  persistState();
}

export async function closeTab(paneIdx, tabIdx, opts = {}) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const tab = pane.tabs[tabIdx];
  if (!tab) return;

  // W-15 (4T-0308): Pending Properties-Sidebar-Save vor dem Schliessen
  // flushen. Sonst laeuft der 500-ms-Debounce nach dem Splice ins Leere
  // (liest die Felder des dann anderen/keines Tabs) und die letzte
  // Sidebar-Eingabe geht verloren. Der Flush ist synchron und schreibt in
  // tab.content, sodass der folgende Dirty-Check korrekt anschlaegt.
  flushPendingPropertiesSave(paneIdx);

  // Dirty-Check: bei ungespeicherten Aenderungen Dialog mit Speichern/
  // Verwerfen/Abbrechen. Bei intern ausgeloestem Schliessen (z.B. Tab in
  // anderes Fenster verschieben) wird der Check uebersprungen.
  if (tab.dirty && !opts.skipDirtyCheck) {
    activatePane(paneIdx);
    activateTab(paneIdx, tabIdx);
    const detail = tab.path || tabDisplayName(tab);
    const result = await withDialog(() => api.confirmCloseDirty({ detail }));
    if (result === 'cancel') return;
    if (result === 'save') {
      const ok = await saveTab(paneIdx, tabIdx);
      if (!ok) return;
    }
    // 'discard' faellt durch zum Schliessen
  }

  const stillElsewhere = tab.path
    ? state.panes.some((p, pi) =>
        p.tabs.some((tb, ti) => tb.path === tab.path && !(pi === paneIdx && ti === tabIdx)),
      )
    : true;
  if (tab.path && !stillElsewhere) await api.unwatchFile(tab.path);

  pane.tabs.splice(tabIdx, 1);
  // 4T-0279: System-Seiten (Einstellungen) raeumen beim Schliessen auf —
  // Tab-Schliessen ohne Anwenden entspricht Abbrechen (Revert der
  // Live-Vorschau, Capture-Teardown). Gilt fuer jeden Schliess-Pfad
  // (Button, Tab-X, Strg+W, Fenster-Transfer).
  if (tab.systemPage) {
    const page = systemPageById(tab.systemPage);
    if (page && typeof page.onClose === 'function') page.onClose();
  }
  if (pane.tabs.length === 0) {
    pane.activeIndex = -1;
  } else if (pane.activeIndex >= pane.tabs.length) {
    pane.activeIndex = pane.tabs.length - 1;
  } else if (tabIdx < pane.activeIndex) {
    pane.activeIndex -= 1;
  }
  // 4T-0459 (Epic 3E-0085): letzte Mitglieder hinterlassen keine leere Gruppe.
  pruneEmptyGroups(pane);
  // 4T-0765 (Epic 3E-0158): der geschlossene Reiter faellt aus der Auswahl.
  pruneSelection(pane);
  // 4T-0767 (Epic 3E-0158): Der Aktivierungs-Index bleibt gueltig (Korrektur
  // oben), wird aber nicht mehr auf Sichtbarkeit gezogen. Der Kanten-Fall
  // „letzter sichtbarer Reiter geschlossen" endet damit in einer Leiste, die
  // nur Koepfe zeigt; aufloesbar ueber Kopf-Klick oder Aufklapp-Menue.
  collapseEmptyPanes();
  applyAllLayouts();
  // 4T-0072: Word-Count an die neue aktive Datei anpassen, ggf. ausblenden.
  updateWordCountStatusbar();
  // 4T-0073: Outgoing-Links an die neue aktive Datei anpassen.
  if (state.outgoing && state.outgoing.visibleByPane[paneIdx]) {
    renderOutgoingLinks(paneIdx);
  }
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Panel an die neue aktive Datei anpassen.
  if (state.fileGraph && state.fileGraph.visibleByPane[paneIdx]) {
    scheduleFileGraphRender(paneIdx);
  }
  // 4T-0075: Statusbar-Stern an den neuen Aktiv-Tab anpassen.
  updateBookmarksToggleButton();
  persistState();
}

export function collapseEmptyPanes() {
  if (state.panes.length === 2 && state.panes[1].tabs.length === 0) {
    state.panes.pop();
    if (state.activePaneIndex >= state.panes.length) state.activePaneIndex = state.panes.length - 1;
  }
  if (state.panes.length === 2 && state.panes[0].tabs.length === 0) {
    state.panes.shift();
    state.activePaneIndex = 0;
  }
}

export function moveTabBetweenPanes(fromPane, fromIdx, toPane, toIdx) {
  if (fromPane === toPane) {
    return reorderTabWithinPane(fromPane, fromIdx, toIdx);
  }
  const pane = state.panes[fromPane];
  const tab = pane.tabs[fromIdx];
  if (!tab) return;

  ensurePaneExists(toPane);

  // R4-02 (4T-0170): Duplikat-Check nur bei gesetztem Pfad. Bei Unbenannt-
  // Tabs matchte `null === null` den erstbesten Unbenannt-Tab der Ziel-Pane;
  // der gezogene Tab wurde gesplict und nie eingefuegt (Totalverlust).
  const targetExisting = tab.path
    ? state.panes[toPane].tabs.findIndex((tt) => tt.path === tab.path)
    : -1;
  if (targetExisting >= 0) {
    pane.tabs.splice(fromIdx, 1);
    if (pane.activeIndex >= pane.tabs.length) pane.activeIndex = pane.tabs.length - 1;
    // 4T-0459 (Epic 3E-0085): Gruppen-Invariante der Quell-Pane erhalten.
    pruneEmptyGroups(pane);
    // 4T-0765 (Epic 3E-0158): ein Reiter, der die Leiste verlaesst, verlaesst
    // auch ihre Auswahl.
    pruneSelection(pane);
    activatePane(toPane);
    activateTab(toPane, targetExisting);
    collapseEmptyPanes();
    applyAllLayouts();
    persistState();
    return;
  }

  pane.tabs.splice(fromIdx, 1);
  if (pane.activeIndex >= pane.tabs.length) pane.activeIndex = pane.tabs.length - 1;
  // 4T-0459 (Epic 3E-0085): Gruppen sind pro Tab-Leiste — der Wechsel in die
  // andere Pane beendet die Mitgliedschaft; landet der Tab dort im Inneren
  // eines Gruppen-Blocks, tritt er dieser Gruppe bei (Zusammenhangs-
  // Invariante). Leere Quell-Gruppen werden bereinigt.
  pruneEmptyGroups(pane);
  // 4T-0765 (Epic 3E-0158): dito fuer die Auswahl der Quell-Leiste.
  pruneSelection(pane);

  const insertAt = Math.max(0, Math.min(toIdx, state.panes[toPane].tabs.length));
  tab.groupId = groupIdForInsertion(state.panes[toPane].tabs, insertAt);
  state.panes[toPane].tabs.splice(insertAt, 0, tab);
  state.panes[toPane].activeIndex = insertAt;

  collapseEmptyPanes();
  const newToPane = state.panes.indexOf(state.panes[toPane] || pane);
  activatePane(newToPane >= 0 ? newToPane : 0);
  applyAllLayouts();
  persistState();
}

export function reorderTabWithinPane(paneIdx, fromIdx, toIdx) {
  const pane = state.panes[paneIdx];
  if (!pane || fromIdx === toIdx) return;
  const [tab] = pane.tabs.splice(fromIdx, 1);
  let newIdx = toIdx;
  if (toIdx > fromIdx) newIdx -= 1;
  newIdx = Math.max(0, Math.min(newIdx, pane.tabs.length));
  // 4T-0459 (Epic 3E-0085): Gruppen-Semantik des Ziehens — wer strikt ins
  // Innere eines Gruppen-Blocks faellt, tritt der Gruppe bei; wer den
  // eigenen Block verlaesst, tritt aus (Zusammenhangs-Invariante). Wird die
  // eigene Gruppe dadurch leer, entfaellt sie.
  tab.groupId = groupIdForInsertion(pane.tabs, newIdx, tab.groupId);
  pane.tabs.splice(newIdx, 0, tab);
  pane.activeIndex = newIdx;
  pruneEmptyGroups(pane);
  renderTabbar(paneIdx);
  persistState();
}

// 4T-0765 (Epic 3E-0158): Mehrfach-Auswahl als Block verschieben — das
// Gegenstueck zu reorderTabWithinPane fuer mehr als einen Reiter. Nur
// innerhalb der eigenen Leiste; ueber die Spaltengrenze wandert weiterhin der
// einzelne gezogene Reiter (die Auswahl gehoert zur Leiste).
export function reorderTabsWithinPane(paneIdx, tabIdxList, insertIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  if (!moveTabsWithinPane(pane, tabIdxList, insertIdx)) return;
  pruneEmptyGroups(pane);
  renderTabbar(paneIdx);
  persistState();
}

// --- Tab-Gruppen-Aktionen (4T-0460, Epic 3E-0085) -----------------------------

// Kopf-Klick: Gruppe zu- oder aufklappen.
// 4T-0767 (Epic 3E-0158): Das Zuklappen gelingt jetzt auch dann, wenn der
// aktive Reiter in der Gruppe liegt — genau der Fall, in dem es am
// nuetzlichsten ist. Er bleibt aktiv, sein Inhalt bleibt im Pane, und der
// Kopf traegt die Aktiv-Kennzeichnung. Der fruehere Aktivierungs-Wechsel
// (4T-0460) entfaellt samt seinem Abbruch fuer den Fall, dass kein anderer
// sichtbarer Reiter existiert.
export function toggleGroupCollapsed(paneIdx, groupId) {
  const pane = state.panes[paneIdx];
  const group = pane ? groupById(pane, groupId) : null;
  if (!group) return;
  group.collapsed = !group.collapsed;
  applyAllLayouts();
  persistState();
}

// Drop auf den Gruppen-Kopf: der Tab tritt der Gruppe bei (ans Block-Ende).
// Cross-Pane laeuft ueber den regulaeren Verschiebe-Pfad (Duplikat-Check,
// Aktivierung, Pane-Kollabierung); die Gruppe wird danach ueber ihr Objekt
// wiedergefunden, weil sich Pane-Indizes durch collapseEmptyPanes
// verschieben koennen.
// 4T-0767 (Epic 3E-0158): Tritt der aktive Reiter einer zugeklappten Gruppe
// bei, bleibt sie zu — die Sichtbarkeits-Garantie ist entfallen.
// 4T-0766 (Epic 3E-0158): tabIdxList traegt eine Mehrfach-Auswahl; sie tritt
// als Ganzes bei (nur innerhalb der eigenen Leiste, die Auswahl gehoert zur
// Leiste). Ohne Liste bleibt es beim gezogenen Reiter.
export function dropTabIntoGroup(fromPane, fromIdx, toPane, groupId, tabIdxList = null) {
  const targetPane = state.panes[toPane];
  const group = targetPane ? groupById(targetPane, groupId) : null;
  if (!group) return;
  if (fromPane === toPane) {
    const menge = Array.isArray(tabIdxList) && tabIdxList.length > 1 ? tabIdxList : [fromIdx];
    if (!addTabsToGroup(targetPane, menge, groupId)) return;
    applyAllLayouts();
    persistState();
    return;
  }
  const range = groupRange(targetPane, groupId);
  moveTabBetweenPanes(fromPane, fromIdx, toPane, range ? range.end + 1 : targetPane.tabs.length);
  const landedPaneIdx = state.panes.findIndex(
    (p) => Array.isArray(p.groups) && p.groups.includes(group),
  );
  if (landedPaneIdx < 0) return;
  const landedPane = state.panes[landedPaneIdx];
  if (landedPane.activeIndex < 0) return;
  addTabToGroup(landedPane, landedPane.activeIndex, groupId);
  applyAllLayouts();
  persistState();
}

// Kopf-Ziehen: die ganze Gruppe an eine neue Position im eigenen Streifen
// (Cross-Pane-Gruppen-Verschiebung ist bewusst nicht im Epic-Umfang).
export function moveGroupInPane(paneIdx, groupId, insertIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  if (!moveGroupWithinPane(pane, groupId, insertIdx)) return;
  renderTabbar(paneIdx);
  persistState();
}

export function ensurePaneExists(paneIdx) {
  while (state.panes.length <= paneIdx && state.panes.length < MAX_PANES) {
    state.panes.push(createEmptyPane());
  }
}

export function moveActiveTabBetweenPanes(direction) {
  const paneIdx = state.activePaneIndex;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tabIdx = pane.activeIndex;
  if (direction === 'right') {
    const targetPane = paneIdx === 0 ? 1 : null;
    if (targetPane === null) return;
    moveTabBetweenPanes(
      paneIdx,
      tabIdx,
      targetPane,
      state.panes[1] ? state.panes[1].tabs.length : 0,
    );
  } else if (direction === 'left') {
    if (paneIdx === 0) return;
    moveTabBetweenPanes(paneIdx, tabIdx, 0, state.panes[0].tabs.length);
  }
}

// Baut aus einem einzelnen Tab einen Single-Pane-Snapshot, wie ihn der
// Main-Prozess als initialPanes fuer ein neues Fenster erwartet.
export function singlePaneSnapshotFromTab(tab) {
  return [
    {
      paths: [tab.path],
      activeIndex: 0,
      tabSettings: [
        {
          viewMode: tab.viewMode,
          wrapLines: tab.wrapLines,
          showLineNumbers: tab.showLineNumbers,
          showFoldGutter: tab.showFoldGutter,
          // 4T-0070: Scroll-Synchronisation pro Tab.
          scrollSyncEnabled: !!tab.scrollSyncEnabled,
        },
      ],
    },
  ];
}

export async function copyTabToNewWindow(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const tab = pane.tabs[tabIdx];
  if (!tab) return;
  // 4T-0213: Handbuch-Tabs sind pfadlos — der Pfad-Snapshot wuerde im
  // neuen Fenster leer ausgehen. Transfer ueber den Payload-Mechanismus;
  // das Zielfenster oeffnet die Seite regulaer (frischer Inhalt).
  // 4T-0277: System-Seiten (Einstellungen) analog.
  if (tab.manualPage || tab.systemPage) {
    await api.openNewWindow([], buildTabPayload(tab));
    return;
  }
  await api.openNewWindow(singlePaneSnapshotFromTab(tab));
}

export async function moveTabToNewWindow(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const tab = pane.tabs[tabIdx];
  if (!tab) return;
  // R4-03 (4T-0170): Transfer ueber den Payload-Mechanismus (buildTabPayload
  // traegt content/dirty/editMode), nicht ueber den Pfad-Snapshot. Vorher las
  // das neue Fenster nur von Platte: dirty Buffer ging verloren, Unbenannt-
  // Tabs (path null) komplett. Der Main reicht den Payload nach
  // did-finish-load an das neue Fenster durch (gepufferter Append-Pfad).
  // Erst Fenster oeffnen, dann Tab schliessen. So bleibt die Datei waehrend
  // des Uebergangs sicher in mindestens einem Fenster offen — der File-Watcher
  // im Main-Prozess macht das ueber Refcounting korrekt.
  await api.openNewWindow([], buildTabPayload(tab));
  await closeTab(paneIdx, tabIdx, { skipDirtyCheck: true });
}

// 4T-0012: Tab-Payload fuer den Transfer in ein bestehendes Fenster. Im
// Gegensatz zu singlePaneSnapshotFromTab traegt dieser Snapshot auch den
// aktuellen (ggf. dirty) Buffer-Inhalt sowie editMode mit, damit die Bearbeitung
// im Zielfenster nahtlos weitergeht.
export function buildTabPayload(tab) {
  return {
    path: tab.path || null,
    content: tab.content || '',
    dirty: !!tab.dirty,
    // 4T-0213: Seiten-Kennung der Handbuch-Tabs wandert mit; das
    // Zielfenster oeffnet die Seite ueber openManualPage (inkl.
    // Einfach-Instanz-Pruefung) statt einen Unbenannt-Tab anzulegen.
    manualPage: tab.manualPage || null,
    // 4T-0277: Kennung der System-Seiten (Einstellungen) analog.
    systemPage: tab.systemPage || null,
    settings: {
      viewMode: tab.viewMode,
      wrapLines: tab.wrapLines,
      showLineNumbers: tab.showLineNumbers,
      showFoldGutter: tab.showFoldGutter,
      editMode: !!tab.editMode,
      // 4T-0017: Zoom des Tabs wandert mit (analog zu View-Modus und Edit-Mode).
      zoom: tab.zoom ?? DEFAULT_ZOOM,
      // 4T-0070: Scroll-Synchronisation pro Tab.
      scrollSyncEnabled: !!tab.scrollSyncEnabled,
    },
    untitledIndex: tab.untitledIndex || null,
  };
}

// 4T-0012: Tab in ein bereits offenes Zielfenster kopieren. Der Quell-Tab
// bleibt unveraendert offen.
export async function copyTabToWindow(targetWindowId, paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const tab = pane.tabs[tabIdx];
  if (!tab) return;
  const result = await api.appendTabToWindow(targetWindowId, buildTabPayload(tab));
  if (!result || !result.ok) {
    // 4T-0323: Bereichs-Grenze des Ziel-Fensters unterscheiden.
    const key =
      result && result.reason === 'outside-area'
        ? 'statusbar.outsideAreaFile'
        : 'statusbar.targetWindowGone';
    showStatusbarHint(key, { duration: 2500, error: true });
  }
}

// 4T-0012: Tab in ein bereits offenes Zielfenster verschieben. Erst kopieren,
// und nur bei Erfolg den Quell-Tab schliessen (skipDirtyCheck, weil der Inhalt
// inkl. dirty Buffer mitwandert).
export async function moveTabToWindow(targetWindowId, paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const tab = pane.tabs[tabIdx];
  if (!tab) return;
  const result = await api.appendTabToWindow(targetWindowId, buildTabPayload(tab));
  if (!result || !result.ok) {
    // 4T-0323: Bereichs-Grenze des Ziel-Fensters unterscheiden.
    const key =
      result && result.reason === 'outside-area'
        ? 'statusbar.outsideAreaFile'
        : 'statusbar.targetWindowGone';
    showStatusbarHint(key, { duration: 2500, error: true });
    return;
  }
  await closeTab(paneIdx, tabIdx, { skipDirtyCheck: true });
}

// 4T-0012: Vom Main empfangenes Append-Event verarbeiten. Fuegt den Tab in der
// aktiven Pane an und aktiviert ihn. Wenn der Pfad in irgendeiner Pane schon
// offen ist, wird der bestehende Tab aktiviert (kein Duplikat); ein eventuell
// dirty Buffer aus dem Quell-Fenster wird in diesem Fall in den bestehenden
// Editor uebernommen, damit die Bearbeitung nicht verloren geht.
export async function handleAppendTabFromOtherWindow(payload) {
  const targetPane = state.activePaneIndex;
  if (targetPane < 0 || targetPane >= state.panes.length) return;
  const settings = payload.settings || {};

  // 4T-0213: Handbuch-Tab aus einem anderen Fenster — die Seite regulaer
  // oeffnen (aktiviert einen bereits offenen Tab statt zu duplizieren);
  // der Inhalt wird frisch geladen bzw. generiert, nicht aus dem Payload
  // uebernommen (Sprache dieses Fensters zaehlt).
  if (payload.manualPage) {
    await openManualPage(payload.manualPage);
    return;
  }

  // 4T-0277: System-Seite (Einstellungen) aus einem anderen Fenster — die
  // Seite regulaer oeffnen (aktiviert einen bereits offenen Tab statt zu
  // duplizieren); Formular-Zustand wandert bewusst nicht mit.
  if (payload.systemPage) {
    openSystemPage(payload.systemPage);
    return;
  }

  if (payload.path) {
    const existing = findTabAcrossPanes(payload.path);
    if (existing) {
      const target = state.panes[existing.paneIdx].tabs[existing.tabIdx];
      if (
        payload.dirty &&
        typeof payload.content === 'string' &&
        target.content !== payload.content
      ) {
        // W-13 (4T-0308): Traegt der Ziel-Tab selbst ungespeicherte
        // Aenderungen, den Quell-Buffer nicht stillschweigend uebernehmen,
        // sondern den Nutzer fragen (Konflikt-Dialog wie beim Auto-Reload).
        let takeIncoming = true;
        if (target.dirty) {
          const choice = await withDialog(() => api.confirmConflict({ detail: payload.path }));
          takeIncoming = choice === 'reload';
        }
        if (takeIncoming) {
          // R4-01 (4T-0170): KEIN manueller view.dispatch hier. Der Editor der
          // Pane zeigt zu diesem Zeitpunkt noch den bisherigen aktiven Tab;
          // ein Dispatch wuerde ueber den updateListener dessen Inhalt
          // ueberschreiben (stille Korruption, Auto-Save persistiert sie).
          // target.content setzen genuegt: activateTab unten laesst
          // syncEditorForPane den Editor aus tab.content befuellen.
          target.content = payload.content;
          target.dirty = target.content !== target.originalContent;
        }
      }
      activatePane(existing.paneIdx);
      activateTab(existing.paneIdx, existing.tabIdx);
      return;
    }
    try {
      const data = await api.readFile(payload.path);
      // W-01 (4T-0309): {ok,error}-Vertrag — Lesefehler ueber den catch, der
      // den dirty Buffer als missing-Tab uebernimmt (B-03).
      if (!data || !data.ok) throw new Error((data && data.error) || 'read failed');
      const tab = createTab(data.path, data.content, settings);
      tab.editMode = !!settings.editMode;
      if (payload.dirty && typeof payload.content === 'string') {
        tab.content = payload.content;
        tab.dirty = tab.content !== tab.originalContent;
      }
      state.panes[targetPane].tabs.push(tab);
      activateTab(targetPane, state.panes[targetPane].tabs.length - 1);
    } catch {
      // B-03 (4T-0308): Ziel-Datei nicht lesbar. Trug der transferierte Tab
      // einen ungespeicherten Buffer, ist der Quell-Tab bereits geschlossen
      // (skipDirtyCheck) — den Inhalt aus dem Payload als missing-Tab
      // uebernehmen statt zu verwerfen (sonst Datenverlust in beiden
      // Fenstern). originalContent leer halten, damit der Dirty-Schutz greift
      // (Muster R4-03 im Unbenannt-Pfad).
      if (payload.dirty && typeof payload.content === 'string') {
        const tab = createTab(payload.path, payload.content, settings);
        tab.editMode = !!settings.editMode;
        tab.missing = true;
        tab.originalContent = '';
        tab.dirty = (tab.content || '') !== '';
        state.panes[targetPane].tabs.push(tab);
        activateTab(targetPane, state.panes[targetPane].tabs.length - 1);
      } else {
        showStatusbarHint('statusbar.targetFileMissing', { duration: 2500, error: true });
      }
    }
    return;
  }

  // Unbenannt-Tab: lokalen Counter fortzaehlen, damit die Nummer im Zielfenster
  // konsistent zu dessen anderen Unbenannt-Tabs ist.
  const tab = createTab(null, payload.content || '', settings);
  tab.editMode = settings.editMode !== undefined ? !!settings.editMode : true;
  tab.untitledIndex = state.untitledCounter++;
  // R4-03 (4T-0170): Transferierter Unbenannt-Inhalt ist ungespeichert.
  // createTab setzt originalContent = content; damit wuerde der naechste
  // Editor-Sync dirty auf false normalisieren und der Close-Dialog-Schutz
  // entfiele (stiller Verlust beim Schliessen). originalContent leer halten.
  tab.originalContent = '';
  tab.dirty = (tab.content || '') !== '';
  state.panes[targetPane].tabs.push(tab);
  activateTab(targetPane, state.panes[targetPane].tabs.length - 1);
}
