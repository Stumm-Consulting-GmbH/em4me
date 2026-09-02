// Empfangs-Wege der Fenster-, Datei-, Sprach-, Rechtschreib- und
// Erweiterungs-Meldungen des Main-Prozesses, dazu die Kalender-Konfiguration
// des Bereichs.
//
// Auszug aus app-init.js, 4T-001001 (Epic 3E-000196). Alle Registrierungen laufen
// synchron ueber registerAppBroadcasts, das app-init.js auf Modul-Ebene an der
// Stelle des frueheren Blocks aufruft — Electron-IPC puffert nicht, eine erst
// in init() registrierte Meldung ginge verloren.
'use strict';

import { clearLiveBlockRenderCache, liveRebuildEffect } from '../live/live-shared.js';
import { api } from './api.js';
import { state, tabDisplayName, withDialog } from './app-state.js';
import {
  editorCompartments,
  paneEditors,
  refreshSpellcheckInEditors,
  syncEditorForPane,
  updateWindowTitle,
} from '../editor/editor.js';
import { buildEditorCommandKeymap } from '../editor/editor-keymaps.js';
import { scheduleLint } from '../editor/editor-lint.js';
import { normalizeSpellcheckSetting } from '../../../shared/spellcheck.js';
// 4T-001225 (Epic 3E-000122): eine Pfad-Normierung fuer beide Vergleichs-Seiten.
import { normalizeForCompare } from '../area.js';
import { handleSpellcheckContext } from '../editor/editor-context-menu.js';
import { refreshAreaVariants } from '../sidebar-variants.js';
import { refreshAreaPanels } from '../area-panel.js';
import { refreshCalendarPanels } from '../calendar/calendar-panel.js';
import { loadAreaBookmarks } from '../bookmarks/bookmarks.js';
import {
  activatePane,
  activateTab,
  closeTab,
  handleAppendTabFromOtherWindow,
  openInPane,
  reportMenuStateNow,
} from '../tabs/tabs.js';
import { invalidatePaneRenderCache, renderAllPanes } from '../views/pane-render.js';
import { saveTab } from '../views/save-export.js';
import { collectUnsavedDrafts } from '../views/untitled-tabs.js';
import { setAreaCalendarConfig } from '../calendar/calendar-config.js';
import { applyCommandPlacementUi } from '../command-placement.js';
import { applyFormatToolbarUi } from '../editor/format-toolbar.js';
import { refreshOpenManualTabs } from '../manual.js';
import { refreshSettingsPageForAreaChange } from '../settings/settings-page.js';
import { syncExternalExtensionsFromBroadcast } from '../extensions/extension-host.js';
import { applyExtensionsState } from '../extensions/extension-lifecycle.js';
import { rebuildHotkeyDispatchMap } from './app-commands.js';
import { applyLanguageChange } from './app-language.js';
import { applyExtensionButtonVisibility, applyPanelButtonOrder } from './app-extension-runtime.js';

// 4T-001001: Flag und Warteschlangen gehoeren app-init.js; eine Zuweisung an ein
// importiertes Binding waere in ESM ein TypeError, deshalb kommen Lesezugriff
// und Schreibweg als Funktionen bzw. als Behaelter aus den Deps (Muster der
// attach-Helfer im Bestand).
let initDone = () => false;
let pendingExternalFiles = [];
let pendingAppendPayloads = [];
let setPendingLanguageChange = () => {};
let setPendingExtensionsChange = () => {};

// 4T-000871 (Buch = Bereich): Der Main zieht eine soeben in einer fremden
// Applikation geoeffnete Buch-Datei zurueck — der Reiter wandert in die
// Buch-Applikation, die die Datei selbst oeffnet. Synchron registrieren
// (Electron-IPC puffert nicht); vor initDone genuegt das Streichen aus der
// Pending-Liste. Ein bereits bearbeiteter Reiter bleibt zur Sicherheit
// stehen (kein Fern-Schliessen ungespeicherter Aenderungen). Ein zweiter
// Anlauf nach kurzer Frist faengt das Rennen mit einem noch laufenden
// openInPane ab.
// 4T-001225 (Epic 3E-000122, Befund F2): dieselbe Normierung wie die Bereichs-
// Vergleiche — plattformabhängig statt hart Windows-affin. Beide Seiten des
// Vergleichs (Main-Ziele und Tab-Pfade) laufen durch diese eine Funktion.
function normalisierterPfad(p) {
  return normalizeForCompare(String(p || ''));
}
function schliesseZurueckgezogene(ziele) {
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    for (let t = pane.tabs.length - 1; t >= 0; t--) {
      const tab = pane.tabs[t];
      if (tab && tab.path && !tab.dirty && ziele.includes(normalisierterPfad(tab.path))) {
        void closeTab(p, t, { skipDirtyCheck: true });
      }
    }
  }
}

// 4T-000546 (Epic 3E-000097): calendarSystems-Konfiguration des Bereichs in
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
  if (!initDone()) return;
  invalidatePaneRenderCache();
  renderAllPanes();
  for (const view of paneEditors) {
    if (view) view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
}

/**
 * Registriert die Broadcast-Empfaenger des Fensters.
 *
 * @param {object} deps Abhaengigkeiten aus app-init.js.
 * @param {() => boolean} deps.initDone Ist init() durchgelaufen?
 * @param {string[]} deps.pendingExternalFiles Warteschlange der Datei-Argumente.
 * @param {object[]} deps.pendingAppendPayloads Warteschlange fremder Reiter.
 * @param {(wert: string|null) => void} deps.setPendingLanguageChange Merker des Sprachwechsels.
 * @param {(wert: string[]|null) => void} deps.setPendingExtensionsChange Merker des Schalt-Broadcasts.
 */
export function registerAppBroadcasts(deps) {
  initDone = deps.initDone;
  pendingExternalFiles = deps.pendingExternalFiles;
  pendingAppendPayloads = deps.pendingAppendPayloads;
  setPendingLanguageChange = deps.setPendingLanguageChange;
  setPendingExtensionsChange = deps.setPendingExtensionsChange;

  // 4T-000012: Display-Info-Push vom Main. Synchron registrieren, weil der erste
  // Push direkt nach initialState feuert. Wenn der State sich aendert, Titel neu
  // rendern, damit der Suffix sofort sichtbar wird. 4T-000318: zusaetzlich
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
    // 4T-000788 (Epic 3E-000125): Wurzel der Bild-Aufloesung fensterlokal nachziehen.
    // Bewusst bei JEDER Meldung und nicht nur im Wechsel-Zweig unten: Der Aufruf
    // ist idempotent und billig, und beim Start ist er der einzige Weg, mit dem
    // die Preload-Pipeline von einem gebundenen Bereich erfaehrt.
    if (typeof api.configureAttachmentArea === 'function') {
      api.configureAttachmentArea(state.areaPath);
    }
    // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Name der eigenen App.
    state.workspaceName = info.workspaceName || null;
    // 4T-000871 (Buch = Bereich): Buchname der eigenen App (Titel-Stufe "Buch").
    state.bookName = info.bookName || null;
    // 4T-000873 (Regal = Bereich): Regal-Name der eigenen App.
    state.shelfName = info.shelfName || null;
    updateWindowTitle();
    // 4T-000327 (Epic 3E-000059): Bereichs-Wechsel (Bindung einer leeren App)
    // baut die Bereichs-Panels frisch auf.
    if (prevAreaPath !== state.areaPath) {
      refreshAreaPanels();
      // 4T-000612 (Epic 3E-000115): Bereichs-Lesezeichen sind bereichs-gebunden und
      // ziehen beim Binding-Wechsel nach (Bereichs-Abschnitt neu laden bzw.
      // ausblenden).
      void loadAreaBookmarks();
      // 4T-000434 (Epic 3E-000081): der Kalender haengt an der Journal-
      // Konfiguration des Bereichs und zieht mit.
      refreshCalendarPanels();
      // 4T-000546 (Epic 3E-000097): die Kalender-System-Konfiguration ist
      // bereichs-gebunden und zieht beim Binding-Wechsel nach.
      void refreshCalendarSystems();
      // 4T-000555 (Epic 3E-000100): eine offene Einstellungs-Seite baut ihre
      // Navigations-Gruppe „Aktueller Bereich" und die bereichsgebundenen
      // Entwuerfe neu auf.
      refreshSettingsPageForAreaChange();
      // 4T-000625 (Epic 3E-000119): Bereichs-Varianten der Sidebar sind
      // bereichs-gebunden und ziehen beim Binding-Wechsel nach.
      void refreshAreaVariants();
      // 4T-000788 (Epic 3E-000125): Mit der Wurzel aendert sich, welche Bilder
      // aufgeloest werden. Ein bereits offenes Dokument zeigte seine Anlagen
      // sonst erst nach einem manuellen Neu-Rendern.
      renderAllPanes();
    }
  });

  // Window-Close-Anfrage vom Main-Prozess. Wir pruefen alle dirtigen Tabs in
  // diesem Fenster und fragen pro Tab nach (Speichern/Verwerfen/Abbrechen).
  // Wenn der Nutzer "Abbrechen" waehlt, wird das Schliessen abgebrochen,
  // sonst confirmClose() an Main melden.
  // 4T-000320 (Epic 3E-000057): Registrierung synchron beim Modul-Laden statt in
  // init() — Electron-IPC puffert nicht, und ein Quit direkt nach dem Oeffnen
  // eines frischen Fensters (z.B. Beenden unmittelbar nach "Neue Applikation")
  // verlor die window:requestClose-Nachricht: das Fenster schloss nie, das
  // Beenden hing. Vor Abschluss von init() gibt es keine dirtigen Tabs, der
  // Handler ist dann ein direktes confirmClose.
  api.onWindowRequestClose(async () => {
    await withDialog(async () => {
      // 4T-000368 (Epic 3E-000068): Bei aktiver Einstellung Unbenannt-Tabs mit Inhalt
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
          // M-01 (4T-000173): Abbruch dem Main melden, sonst bleibt
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
  api.onOpenExternal((files) => {
    if (!Array.isArray(files) || files.length === 0) return;
    if (!initDone()) {
      pendingExternalFiles.push(...files);
    } else {
      openInPane(state.activePaneIndex, files);
    }
  });

  // 4T-000012: Append-Tab-Event aus einem anderen Fenster. Synchron registrieren,
  // damit kein Event verloren geht. Solange init() nicht durch ist, sammeln; im
  // Anschluss abarbeiten.
  api.onAppendTabFromOtherWindow((payload) => {
    if (!payload) return;
    if (!initDone()) {
      pendingAppendPayloads.push(payload);
      return;
    }
    handleAppendTabFromOtherWindow(payload);
  });

  // 4T-000871 (Buch = Bereich): Rueckzug einer Datei in die Buch-Applikation;
  // Helfer und Begruendung stehen oben im Modul.
  api.onCloseExternal?.((files) => {
    const ziele = (Array.isArray(files) ? files : []).map(normalisierterPfad).filter(Boolean);
    if (ziele.length === 0) return;
    if (!initDone()) {
      for (let i = pendingExternalFiles.length - 1; i >= 0; i--) {
        if (ziele.includes(normalisierterPfad(pendingExternalFiles[i]))) {
          pendingExternalFiles.splice(i, 1);
        }
      }
      return;
    }
    schliesseZurueckgezogene(ziele);
    setTimeout(() => schliesseZurueckgezogene(ziele), 400);
  });

  // M-08 (4T-000185): Sprachwechsel-Broadcast aus einem anderen Fenster.
  // Synchron beim Modul-Laden registrieren (Electron-IPC puffert nicht);
  // vor initDone ankommende Wechsel werden gemerkt und am Ende von init()
  // angewendet — init() laedt die Sprache ohnehin frisch aus dem Store,
  // der Merker faengt nur das Renn-Fenster zwischen Store-Lesen und
  // initDone ab. Anwendung wie der lokale Wechsel, aber ohne erneutes
  // Persistieren (der Ausloeser hat den Store bereits geschrieben).
  api.onLanguageChanged((newLang) => {
    if (!newLang) return;
    if (!initDone()) {
      setPendingLanguageChange(newLang);
      return;
    }
    if (newLang === state.language) return;
    applyLanguageChange(newLang, { persist: false });
  });

  // 4T-000292: extensions-Broadcast (auch das ausloesende Fenster empfaengt
  // ihn — persist:false, und ein unveraenderter Zustand ist dort ein No-op).
  // 4T-000539 (Epic 3E-000098): vor initDone eintreffende Broadcasts werden
  // gemerkt und am Ende von init() angewendet (Muster pendingLanguageChange)
  // — vorher gingen sie endgueltig verloren, wenn ein Fenster in seiner
  // Startphase einen Schalt-Broadcast empfing (aufgedeckt durch WS-05 der
  // Arbeitsbereichs-Spec). Danach zieht der Fenster-Titel nach, weil sein
  // Arbeitsbereichs-Teil am Erweiterungs-Zustand haengt (workspaces).
  if (typeof api.onExtensionsChanged === 'function') {
    api.onExtensionsChanged((ids) => {
      if (!initDone()) {
        setPendingExtensionsChange(ids);
        return;
      }
      void Promise.resolve(applyExtensionsState(ids, { persist: false })).then(() =>
        updateWindowTitle(),
      );
    });
  }

  // 4T-000582 (Epic 3E-000107): Vorschlags-Daten des Main-Prozesses an das
  // Editor-Kontextmenue reichen. Die Meldung folgt jedem Rechtsklick, der das
  // DOM-Ereignis nicht abbricht; ohne Tippfehler unter dem Zeiger ist sie leer
  // und das Menue bleibt unveraendert.
  if (typeof api.onSpellcheckContext === 'function') {
    api.onSpellcheckContext((payload) => handleSpellcheckContext(payload));
  }

  // 4T-000581 (Epic 3E-000107): Broadcast des Rechtschreib-Schalters (auch an das
  // ausloesende Fenster — die Rekonfiguration der Compartments ist idempotent).
  // Vor dem Ende von init() genuegt das Setzen des Zustands: die Editor-Flaechen
  // entstehen erst danach und lesen ihn beim Aufbau.
  if (typeof api.onSpellcheckChanged === 'function') {
    api.onSpellcheckChanged((value) => {
      state.spellcheck = normalizeSpellcheckSetting(value);
      if (initDone()) refreshSpellcheckInEditors();
    });
  }

  // 4T-000298 (Epic 3E-000053): Broadcast der EXTERNEN Erweiterungen (auch das
  // ausloesende Fenster empfaengt ihn — der Host laedt Store und Scan neu
  // und gleicht idempotent an; ein unveraenderter Zustand ist ein No-op).
  if (typeof api.onExternalExtensionsChanged === 'function') {
    api.onExternalExtensionsChanged(() => {
      if (!initDone()) return;
      syncExternalExtensionsFromBroadcast();
    });
  }

  // 4T-000208: hotkeys-Broadcast (auch das ausloesende Fenster empfaengt ihn —
  // Anwendung ist idempotent): Overrides uebernehmen, Dispatcher-Map neu
  // bauen und die Editor-Keymap aller Panes rekonfigurieren. Die Menue-
  // Accelerators baut der Main selbst neu; der Hilfe-Dialog rendert beim
  // naechsten Oeffnen ohnehin frisch aus der Registry.
  if (typeof api.onHotkeysChanged === 'function') {
    api.onHotkeysChanged(async (overrides) => {
      if (!initDone()) return;
      state.hotkeyOverrides =
        overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
      rebuildHotkeyDispatchMap();
      for (const view of paneEditors) {
        if (!view) continue;
        view.dispatch({
          effects: editorCompartments.commandKeymap.reconfigure(buildEditorCommandKeymap()),
        });
      }
      // 4T-000212: eine offene Tastenkuerzel-Seite des Handbuchs zeigt die
      // effektiven Bindings — nach Override-Aenderung neu generieren.
      if (await refreshOpenManualTabs()) renderAllPanes();
    });
  }

  // 4T-000292/4T-000293: Nach jedem Erweiterungs-Umschalten offene Tabs neu
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
    if (!initDone()) return;
    invalidatePaneRenderCache();
    clearLiveBlockRenderCache();
    rebuildHotkeyDispatchMap();
    applyExtensionButtonVisibility();
    // 4T-000520 (Epic 3E-000094): platzierte Buttons folgen dem Schalt-Zustand
    // ihrer Kommando-Erweiterungen (Konsistenz zu Menue und Palette), das
    // Ein-/Ausblenden von Panel-Buttons aendert zudem die Ueberlauf-Lage.
    applyCommandPlacementUi();
    // 4T-000607 (Epic 3E-000114): Toolbar-Buttons folgen ebenso dem Schalt-
    // Zustand ihrer Kommando-Erweiterungen; die Sichtbarkeit der Leiste
    // selbst zieht der syncEditorForPane-Lauf am Ende dieses Handlers nach.
    applyFormatToolbarUi();
    // 4T-000568 (Epic 3E-000104): das Panel-Untermenue filtert nach dem
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
    // 4T-000294: offene generierte Handbuch-Seiten (Tastenkuerzel) zeigen die
    // gefilterten Kommandos — vor dem Neuzeichnen aktualisieren.
    await refreshOpenManualTabs();
    renderAllPanes();
    for (let i = 0; i < state.panes.length; i++) syncEditorForPane(i);
  });

  // 4T-000546 (Epic 3E-000097): Registrierung und Erstabruf bleiben ein Paar (die
  // Begruendung steht oben bei refreshCalendarSystems).
  if (typeof api.onCalendarChanged === 'function') {
    api.onCalendarChanged(() => void refreshCalendarSystems());
  }
  void refreshCalendarSystems();

  document.addEventListener('scg:panel-toggle-order-changed', () => {
    applyPanelButtonOrder();
    // Menue folgt derselben Reihenfolge — Neuaufbau ueber den Meldepfad.
    reportMenuStateNow();
  });
}
