// Bindings der Bedien-Elemente: Statusbar-Schalter, Modale, Panel-Zugaenge
// und deren einmaliges Init-Wiring, Sprach-Auswahl und Zoom.
//
// Auszug aus app-init.js, 4T-001001 (Epic 3E-000196).
'use strict';

import { t } from '../../i18n.js';
import { api, $ } from './api.js';
import { closeWordCountDialog, openWordCountDialog } from '../render-mermaid.js';
import {
  MAX_PANES,
  THEME_NEXT,
  aboutModal,
  adjustTabZoom,
  aliasModal,
  applyThemePrefToButton,
  btnEdit,
  btnTheme,
  getPaneEls,
  langSelect,
  panesContainer,
  resetTabZoom,
  state,
} from './app-state.js';
import { refreshAllOutlineFoldIndicators, toggleOutlinePanel } from '../panels/panel-outline.js';
import { toggleOutgoingPanel } from '../panels/panel-outgoing.js';
import { toggleBacklinksPanel } from '../panels/panel-backlinks.js';
import { toggleSubpagesPanel } from '../panels/panel-subpages.js';
import { resetSidebarLayout, sidebarPanelById } from '../sidebar-layout.js';
import {
  applySidebarVariant,
  findAreaVariantById,
  findGlobalVariantById,
  showSaveVariantDialog,
} from '../sidebar-variants.js';
import { initCalendarPanel, toggleCalendarPanel } from '../calendar/calendar-panel.js';
// 4T-001065 (Epic 3E-000212): Broadcast-Anbindung des Journal-Timeline-Blocks.
import { initJournalTimeline } from '../calendar/journal-timeline-view.js';
import { initFileGraphPanel, toggleFileGraphPanel } from '../file-graph-panel.js';
import { initRemindersPanel, toggleRemindersPanel } from '../reminders-panel.js';
import { initClockPanel, toggleClockPanel } from '../clock/clock-panel.js';
import { toggleBookmarksPanel } from '../bookmarks/bookmarks.js';
import {
  closeBookmarkConfirmRemoveDialog,
  closeBookmarkMoveDialog,
  confirmBookmarkConfirmRemove,
  confirmBookmarkMove,
} from '../bookmarks/bookmarks-dialogs.js';
import { openDialog, reportMenuStateNow } from '../tabs/tabs.js';
import { toggleScrollSyncForActiveTab } from '../views/scroll-sync.js';
import {
  setViewMode,
  toggleEditMode,
  toggleShowFoldGutter,
  toggleShowLineNumbers,
  toggleWrapLines,
} from '../views/views.js';
import { cancelAliasDialog, hideAbout } from '../dialogs/dialogs.js';
import { addPropertiesField } from '../properties/properties-suggest.js';
import { handleProfilesChanged } from '../properties/properties-types.js';
import { togglePropertiesPanel, toggleTagsPanel } from '../properties/properties-tags.js';
import { initNotesPanel, toggleNotesPanel } from '../panels/notes-panel.js';
import {
  initSearchResultsPanel,
  setzeSprungHandler,
  toggleSearchResultsPanel,
} from '../search/search-panel.js';
import { initBookPanel, toggleBookPanel } from '../books/book-panel.js';
import { markiereOffeneRaumSeite, springeZuTreffer } from '../search/search-jump.js';
import { setzeRaumIndex } from '../search/search-run.js';
import { initBlockPropsPanel, toggleBlockPropsPanel } from '../properties/block-props-panel.js';
import { initBlockMetaIndicators } from '../block-meta-indicator.js';
import { renderTagsFromCache } from '../editor/autocomplete-help.js';
import {
  setzeRaumMarkierHandler,
  setzeRaumSprungHandler,
  updateSearchCounter,
} from '../search/search.js';
import { applyLanguageChange } from './app-language.js';
import { applyPanelButtonOrder } from './app-extension-runtime.js';

/**
 * Verdrahtet Statusbar, Modale und Panel-Zugaenge (erster Teil der
 * bindUi-Sequenz).
 */
export function bindAppUi() {
  // "Öffnen", "Über", "Hilfe" und die Sitzungs-Checkbox sind seit 4T-000002 nicht
  // mehr in der UI, sondern im nativen Menue (siehe 4T-000001). Hier bleiben nur
  // noch die Bindings fuer Empty-State-Button und die Modal-Schliesser, plus
  // die Statusbar-Toggles und der Sprach-Selektor.
  $('#btn-open-empty').addEventListener('click', openDialog);
  $('#btn-about-close').addEventListener('click', hideAbout);
  aboutModal.querySelector('.about-modal-backdrop').addEventListener('click', hideAbout);

  // 4T-000674 (Epic 3E-000135): Rückverweis auf die Produkt-Webseite. Der Klick
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

  // 4T-000072: Word-Count-Statusbar-Button und Detail-Dialog.
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

  // 4T-000050: Alias-Disambiguation-Dialog. Cancel-Button und Backdrop-Klick
  // schliessen mit null (Abbruch). Die Kandidaten-Buttons werden pro
  // Dialog-Aufruf dynamisch verkabelt; siehe showAliasDialog.
  $('#btn-alias-cancel').addEventListener('click', cancelAliasDialog);
  aliasModal.querySelector('.alias-modal-backdrop').addEventListener('click', cancelAliasDialog);

  // 4T-000279: Der modale Einstellungs-Dialog ist vollstaendig abgeloest —
  // alle Bindings (Buttons, Backdrop, Live-Vorschau, Datalist-Trick)
  // leben jetzt in settings-page.js am Seiten-DOM.

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });

  $('#btn-wrap').addEventListener('click', toggleWrapLines);
  $('#btn-numbers').addEventListener('click', toggleShowLineNumbers);
  $('#btn-fold-gutter').addEventListener('click', toggleShowFoldGutter);
  if (btnEdit) btnEdit.addEventListener('click', toggleEditMode);
  // 4T-000070: Statusbar-Toggle fuer Scroll-Synchronisation. Wirkt pro Tab,
  // analog zu btn-edit. Tooltip wird zur Laufzeit aus dem Tab-State gesetzt.
  const btnScrollSync = document.getElementById('btn-scroll-sync');
  if (btnScrollSync) btnScrollSync.addEventListener('click', toggleScrollSyncForActiveTab);
  if (typeof api.onMenuToggleScrollSync === 'function') {
    api.onMenuToggleScrollSync(() => toggleScrollSyncForActiveTab());
  }

  // 4T-000030: Klick auf den Statusbar-Theme-Button zykliert den Pref. Die
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

  // 4T-000014: Statusbar-Toggle fuer Outline-Panel der aktiven Spalte.
  const btnOutline = $('#btn-outline');
  if (btnOutline) {
    btnOutline.addEventListener('click', () => toggleOutlinePanel(state.activePaneIndex));
  }
  // 4T-000015: Statusbar-Toggle fuer Backlinks-Panel der aktiven Spalte.
  const btnBacklinks = $('#btn-backlinks');
  if (btnBacklinks) {
    btnBacklinks.addEventListener('click', () => toggleBacklinksPanel(state.activePaneIndex));
  }
  // 4T-000073: Statusbar-Toggle fuer Outgoing-Links-Panel der aktiven Spalte.
  const btnOutgoingLinks = $('#btn-outgoing-links');
  if (btnOutgoingLinks) {
    btnOutgoingLinks.addEventListener('click', () => toggleOutgoingPanel(state.activePaneIndex));
  }
  // 4T-000075: Statusbar-Toggle fuer Bookmarks-Panel der aktiven Spalte.
  const btnBookmarks = $('#btn-bookmarks');
  if (btnBookmarks) {
    btnBookmarks.addEventListener('click', () => toggleBookmarksPanel(state.activePaneIndex));
  }
  // 4T-000327/4T-000330: der Statusbar-Toggle des Bereichs-Panels bindet sich
  // synchron beim Modul-Laden in area-panel.js (das Panel ist vor init()
  // sichtbar; ein frueher Klick darf nicht verpuffen).
  // 4T-000078: Bestaetigungs-Dialog beim Folder-Entfernen.
  const bookmarkConfirmRemoveModal = document.getElementById('bookmark-confirm-remove-modal');
  if (bookmarkConfirmRemoveModal) {
    const okBtn = document.getElementById('btn-bookmark-confirm-remove-ok');
    if (okBtn) okBtn.addEventListener('click', confirmBookmarkConfirmRemove);
    const cancelBtn = document.getElementById('btn-bookmark-confirm-remove-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeBookmarkConfirmRemoveDialog);
    const backdrop = bookmarkConfirmRemoveModal.querySelector('.bookmark-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeBookmarkConfirmRemoveDialog);
  }
  // 4T-000078: Modal-Picker "In Ordner verschieben...".
  const bookmarkMoveModal = document.getElementById('bookmark-move-modal');
  if (bookmarkMoveModal) {
    const confirmBtn = document.getElementById('btn-bookmark-move-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmBookmarkMove);
    const cancelBtn = document.getElementById('btn-bookmark-move-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeBookmarkMoveDialog);
    const backdrop = bookmarkMoveModal.querySelector('.bookmark-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeBookmarkMoveDialog);
  }
  // 4T-000051: Statusbar-Toggle fuer Properties-Panel der aktiven Spalte.
  const btnProperties = $('#btn-properties');
  if (btnProperties) {
    btnProperties.addEventListener('click', () => togglePropertiesPanel(state.activePaneIndex));
  }
  // 4T-000051: Add-Field-Buttons pro Pane verkabeln (Sidebar-Sektion).
  // R4-05 (4T-000177): ueber die statische Pane-Anzahl iterieren — beim
  // bindUi-Lauf ist state.panes.length immer 1, die zweite Pane blieb
  // sonst dauerhaft unverkabelt.
  for (let p = 0; p < MAX_PANES; p++) {
    const elsP = getPaneEls(p);
    if (elsP && elsP.propertiesAddBtn) {
      elsP.propertiesAddBtn.addEventListener('click', () => addPropertiesField(p));
    }
  }
  // 4T-000051: Menue-Trigger 'Ansicht -> Properties' toggelt das Panel der
  // aktiven Spalte. Pattern wie Outline/Backlinks.
  if (typeof api.onMenuToggleProperties === 'function') {
    api.onMenuToggleProperties(() => togglePropertiesPanel(state.activePaneIndex));
  }
  // 4T-000448 (Epic 3E-000083): profiles:changed-Broadcast (Konfigurations-
  // Aenderung, auch aus anderen Fenstern) zieht die Profil-Aufloesung der
  // Eigenschafts-Editoren nach.
  if (typeof api.onProfilesChanged === 'function') {
    api.onProfilesChanged(() => handleProfilesChanged());
  }
  // 4T-000359 (Epic 3E-000066): Notizen-Panel — Statusbar-Toggle, Menue-Trigger und
  // einmaliges Event-Wiring der Textareas beider Spalten (initNotesPanel).
  const btnNotes = $('#btn-notes');
  if (btnNotes) {
    btnNotes.addEventListener('click', () => toggleNotesPanel(state.activePaneIndex));
  }
  if (typeof api.onMenuToggleNotes === 'function') {
    api.onMenuToggleNotes(() => toggleNotesPanel(state.activePaneIndex));
  }
  initNotesPanel();
  // 4T-000759 (Epic 3E-000142): Suchergebnis-Panel — Statusbar-Toggle und
  // Tastatur-Wiring. Der Menue-Weg laeuft ueber den generischen
  // Panel-Trigger (onMenuTogglePanel), ein eigener Kanal entfaellt.
  const btnSearchResults = $('#btn-search-results');
  if (btnSearchResults) {
    btnSearchResults.addEventListener('click', () =>
      toggleSearchResultsPanel(state.activePaneIndex),
    );
  }
  initSearchResultsPanel();
  // 4T-000844 (Epic 3E-000147): Inhaltsverzeichnis-Panel des Buches —
  // Statusbar-Toggle, Leseführungs-Knöpfe beider Spalten und das Abholen des
  // ersten Buch-Zustands. Der Menü-Weg läuft über den generischen
  // Panel-Trigger (onMenuTogglePanel), ein eigener Kanal entfällt.
  const btnBook = $('#btn-book');
  if (btnBook) {
    btnBook.addEventListener('click', () => toggleBookPanel(state.activePaneIndex));
  }
  initBookPanel();
  // 4T-000760 (Epic 3E-000142): Beide Sprung-Wege der Raum-Suche verdrahten —
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
  // 4T-000434 (Epic 3E-000081): Kalender-Panel — Statusbar-Toggle und
  // einmaliges Event-Wiring beider Spalten.
  const btnCalendar = $('#btn-calendar');
  if (btnCalendar) {
    btnCalendar.addEventListener('click', () => toggleCalendarPanel(state.activePaneIndex));
  }
  initCalendarPanel();
  // 4T-001065 (Epic 3E-000212): Journal-Timeline-Block — Broadcasts, die die
  // Punkt-Markierung der eingehaengten Bloecke nachziehen.
  initJournalTimeline();
  // 4T-000456 (Epic 3E-000084): Datei-Graph-Panel — Steuerungs-Wiring und
  // Index-Invalidierungs-Refresh.
  initFileGraphPanel();
  // 4T-000527 (Epic 3E-000095): Erinnerungs-Panel — Statusbar-Toggle,
  // Menue-Trigger und Refresh-Broadcasts.
  const btnReminders = $('#btn-reminders');
  if (btnReminders) {
    btnReminders.addEventListener('click', () => toggleRemindersPanel(state.activePaneIndex));
  }
  if (typeof api.onMenuToggleReminders === 'function') {
    api.onMenuToggleReminders(() => toggleRemindersPanel(state.activePaneIndex));
  }
  initRemindersPanel();
  // 4T-000372 (Epic 3E-000069): Uhr-Panel — Statusbar-Toggle plus Timer-,
  // Sprach- und Broadcast-Wiring. Der Menue-Weg laeuft ueber den zentralen
  // Panel-Trigger (onMenuTogglePanel), ein eigener Kanal entfaellt.
  const btnClock = $('#btn-clock');
  if (btnClock) {
    btnClock.addEventListener('click', () => toggleClockPanel(state.activePaneIndex));
  }
  initClockPanel();
  // 4T-000364 (Epic 3E-000067): Block-Eigenschaften-Panel — Statusbar-Toggle,
  // Menue-Trigger und einmaliges Event-Wiring beider Spalten.
  const btnBlockprops = $('#btn-blockprops');
  if (btnBlockprops) {
    btnBlockprops.addEventListener('click', () => toggleBlockPropsPanel(state.activePaneIndex));
  }
  if (typeof api.onMenuToggleBlockProps === 'function') {
    api.onMenuToggleBlockProps(() => toggleBlockPropsPanel(state.activePaneIndex));
  }
  initBlockPropsPanel();
  // 4T-000365 (Epic 3E-000067): Broadcast-Listener des Block-Metadaten-Indikators.
  initBlockMetaIndicators();
  // 4T-000056: Statusbar-Toggle fuer Tags-Panel der aktiven Spalte.
  const btnTags = $('#btn-tags');
  if (btnTags) {
    btnTags.addEventListener('click', () => toggleTagsPanel(state.activePaneIndex));
  }
  // 4T-000056: Filter-Input pro Pane mit input-Event verkabeln.
  // R4-05 (4T-000177): statische Pane-Anzahl, siehe oben.
  for (let p = 0; p < MAX_PANES; p++) {
    const elsP = getPaneEls(p);
    if (elsP && elsP.tagsFilter) {
      elsP.tagsFilter.addEventListener('input', () => {
        state.tags.queryByPane[p] = elsP.tagsFilter.value;
        // R5-14 (4T-000180): Query-Filterung ist clientseitig — aus dem
        // Payload-Cache rendern statt pro Tastendruck einen IPC zu feuern.
        renderTagsFromCache(p);
      });
    }
  }
  // 4T-000056: Menue-Trigger 'Ansicht -> Tags' toggelt das Panel.
  if (typeof api.onMenuToggleTags === 'function') {
    api.onMenuToggleTags(() => toggleTagsPanel(state.activePaneIndex));
  }
  // 4T-000341 (Epic 3E-000061): Menue-Trigger 'Ansicht -> Unterseiten'.
  if (typeof api.onMenuToggleSubpages === 'function') {
    api.onMenuToggleSubpages(() => toggleSubpagesPanel(state.activePaneIndex));
  }
  // 4T-000456 (Epic 3E-000084): Menue-Trigger 'Ansicht -> Datei-Graph'.
  if (typeof api.onMenuToggleFileGraph === 'function') {
    api.onMenuToggleFileGraph(() => toggleFileGraphPanel(state.activePaneIndex));
  }
  // 4T-000626 (Epic 3E-000119): Untermenue 'Ansicht -> Sidebar-Anordnungen' —
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
  // 4T-000567 (Epic 3E-000104): Statusbar-Toggles der bisher button-losen
  // Panels Unterseiten und Datei-Graph (Zugangs-Symmetrie).
  const btnSubpages = $('#btn-subpages');
  if (btnSubpages) {
    btnSubpages.addEventListener('click', () => toggleSubpagesPanel(state.activePaneIndex));
  }
  const btnFileGraph = $('#btn-filegraph');
  if (btnFileGraph) {
    btnFileGraph.addEventListener('click', () => toggleFileGraphPanel(state.activePaneIndex));
  }
  // 4T-000568 (Epic 3E-000104): zentraler Menue-Trigger des Panel-Untermenues —
  // Payload ist die Panel-ID, der Toggle kommt aus der Panel-Registry.
  if (typeof api.onMenuTogglePanel === 'function') {
    api.onMenuTogglePanel((id) => {
      const def = sidebarPanelById(id);
      if (def && typeof def.toggle === 'function') {
        // 4T-000887 (PO-Befund der Test-Iteration 0.105.0): Die Menue-Meldung
        // gehoert an den zentralen Kanal statt in die einzelnen Panel-Pfade —
        // ob ein Toggle selbst meldete, hing zuvor vom Panel ab, und das
        // Haekchen konnte bis zum naechsten fremden Ereignis veralten.
        void Promise.resolve(def.toggle(state.activePaneIndex)).finally(() => reportMenuStateNow());
      }
    });
  }
  // 4T-000568 (Epic 3E-000104): Panel-Buttons einmalig in die effektive
  // Toggle-Reihenfolge bringen (statische DOM-Reihenfolge ist nur Fallback).
  applyPanelButtonOrder();
  // 4T-000207: Die frueheren Einzel-Listener fuer Sidebar-Toggles und
  // Bookmark (4T-000014/4T-000015/4T-000073/4T-000075) sind im zentralen
  // Kommando-Dispatcher aufgegangen (siehe unten, Abschnitt Tastenkuerzel).
  // 4T-000014: Folding-Aenderungen aus dem Editor (Gutter, Tastenkuerzel,
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

  // 4T-000017: Strg+Mausrad zoomt den Inhalt der fokussierten Pane in 10-%-
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

  // 4T-000017: Zoom-Indikator in der Statusbar als Reset-Klickziel.
  const zoomIndicator = document.getElementById('zoom-indicator');
  if (zoomIndicator) {
    zoomIndicator.addEventListener('click', () => resetTabZoom(state.activePaneIndex));
  }
}
