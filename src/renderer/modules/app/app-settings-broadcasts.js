// Empfangs-Wege der strukturgleichen Einstellungs-Broadcasts (Aufgaben,
// Lesezeichen-Baum, Anzeige-Schalter, Sidebar-Layout und -Varianten) und der
// zugehoerigen scg:-Dokument-Ereignisse.
//
// Auszug aus app-init.js, 4T-001001 (Epic 3E-000196). Alle Registrierungen laufen
// synchron ueber registerSettingsBroadcasts, das app-init.js auf Modul-Ebene
// aufruft — Electron-IPC puffert nicht.
'use strict';

import { api } from './api.js';
import { state } from './app-state.js';
import { paneEditors } from '../editor/editor.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { scheduleOutlineRender } from '../panels/panel-outline.js';
import { applyTaskStates, resolveStoredTaskStates } from '../task-states.js';
import { applyTasksConfig } from '../tasks.js';
import {
  applySidebarLayout,
  setIconHeadings,
  setPanelHeightMode,
  setPanelToggleOrder,
} from '../sidebar-layout.js';
import { refreshAreaVariants, setGlobalVariantsFromBroadcast } from '../sidebar-variants.js';
import { reloadGeneralBookmarksTree } from '../bookmarks/bookmarks.js';
import { invalidatePaneRenderCache, renderAllPanes } from '../views/pane-render.js';
import { applyFrontmatterDisplay, applyFrontmatterExpanded } from '../frontmatter-display.js';
import { applyHeadingNumbering } from '../heading-numbering.js';
import { setColorSchemeState } from '../color-schemes.js';
import { applyPerspectiveScriptsEnabled } from '../query/perspective-script-view.js';

// 4T-001001: Das Init-Fertig-Flag gehoert app-init.js; eine Zuweisung an ein
// importiertes Binding waere in ESM ein TypeError, deshalb kommt der Zugriff
// als Funktion aus den Deps (Muster der attach-Helfer im Bestand).
let initDone = () => false;

/**
 * Registriert die Einstellungs-Broadcasts und die zugehoerigen
 * Dokument-Ereignisse.
 *
 * @param {object} deps Abhaengigkeiten aus app-init.js.
 * @param {() => boolean} deps.initDone Ist init() durchgelaufen?
 */
export function registerSettingsBroadcasts(deps) {
  initDone = deps.initDone;

  // 4T-000204: taskStates-Broadcast (auch das ausloesende Fenster empfaengt
  // ihn — applyTaskStates ist idempotent). Vor initDone ankommende
  // Aenderungen ignorieren: init() laedt den Store-Stand ohnehin frisch.
  api.onTaskStatesChanged((stored) => {
    if (!initDone()) return;
    applyTaskStates(resolveStoredTaskStates(stored));
  });

  // 4T-000498: tasksConfig-Broadcast (auch das ausloesende Fenster empfaengt
  // ihn — applyTasksConfig ist idempotent, Muster taskStates).
  api.onTasksConfigChanged((stored) => {
    if (!initDone()) return;
    applyTasksConfig(stored);
  });

  // 4T-000612 (Epic 3E-000115, PO-Testbefund EXE 0.91.0.919): Broadcast des globalen
  // (allgemeinen) Lesezeichen-Baums aus einem anderen Fenster — den frischen Baum
  // uebernehmen und den allgemeinen Abschnitt neu rendern. Der Main verteilt ohne
  // das ausloesende Fenster; vor initDone eintreffende Broadcasts ignorieren, weil
  // init() den Baum ohnehin frisch aus dem Store laedt (loadBookmarksTree).
  if (typeof api.onBookmarksTreeChanged === 'function') {
    api.onBookmarksTreeChanged((tree) => {
      if (!initDone()) return;
      reloadGeneralBookmarksTree(tree);
    });
  }

  // 4T-000284: Frontmatter-Anzeige-Broadcast (auch das ausloesende Fenster
  // empfaengt ihn — applyFrontmatterDisplay ist idempotent).
  api.onFrontmatterDisplayChanged((enabled) => {
    if (!initDone()) return;
    applyFrontmatterDisplay(enabled);
  });

  // 4T-000471 (Epic 3E-000087): Nummerierungs-Broadcast (auch das ausloesende
  // Fenster empfaengt ihn — applyHeadingNumbering ist idempotent).
  api.onHeadingNumberingChanged((cfg) => {
    if (!initDone()) return;
    applyHeadingNumbering(cfg && cfg.enabled, cfg && cfg.startLevel);
  });

  // 4T-000465 (Epic 3E-000086): Farbschema-Broadcast (auch das auslösende Fenster
  // empfängt ihn — setColorSchemeState normalisiert und wendet idempotent an).
  if (typeof api.onColorSchemeChanged === 'function') {
    api.onColorSchemeChanged((schemeState) => {
      if (!initDone()) return;
      setColorSchemeState(schemeState);
    });
  }

  // 4T-000414 (Epic 3E-000078): Skript-Block-Schalter-Broadcast (auch das
  // ausloesende Fenster empfaengt ihn — applyPerspectiveScriptsEnabled ist
  // idempotent, ein unveraenderter Zustand ist ein No-op).
  if (typeof api.onPerspectiveScriptsChanged === 'function') {
    api.onPerspectiveScriptsChanged((enabled) => {
      if (!initDone()) return;
      applyPerspectiveScriptsEnabled(enabled);
    });
  }

  // 4T-000312 (Epic 3E-000055): Broadcast der ausgeklappten Darstellung (auch
  // das ausloesende Fenster empfaengt ihn — Root-Klassen-Toggle, idempotent,
  // rein CSS-getragen ohne Re-Render).
  if (typeof api.onFrontmatterExpandedChanged === 'function') {
    api.onFrontmatterExpandedChanged((expanded) => {
      if (!initDone()) return;
      applyFrontmatterExpanded(expanded === true);
    });
  }

  // 4T-000289: Sidebar-Layout-Broadcast (auch das ausloesende Fenster empfaengt
  // ihn — persist:false, und ein unveraendertes Layout ist dort ein No-op).
  if (typeof api.onSidebarLayoutChanged === 'function') {
    api.onSidebarLayoutChanged((layout) => {
      if (!initDone()) return;
      applySidebarLayout(layout, { persist: false });
    });
  }

  // 4T-000639 (Epic 3E-000069): Broadcast der Panel-Ueberschriften (Icon oder
  // Text). Der Empfangspfad persistiert nicht — das Ausloeser-Fenster hat
  // bereits geschrieben.
  if (typeof api.onSidebarIconHeadingsChanged === 'function') {
    api.onSidebarIconHeadingsChanged((value) => {
      if (!initDone()) return;
      void setIconHeadings(value, { persist: false });
    });
  }

  // 4T-000855 (Epic 3E-000164): Broadcast des Hoehen-Modells der Sidebar-Bloecke.
  // Wie oben persistiert der Empfangspfad nicht.
  if (typeof api.onSidebarHeightModeChanged === 'function') {
    api.onSidebarHeightModeChanged((value) => {
      if (!initDone()) return;
      void setPanelHeightMode(value, { persist: false });
    });
  }

  // 4T-000624 (Epic 3E-000119): Varianten-Broadcast (auch das ausloesende Fenster
  // empfaengt ihn — der Empfangspfad normalisiert und persistiert nicht).
  if (typeof api.onSidebarLayoutVariantsChanged === 'function') {
    api.onSidebarLayoutVariantsChanged((variants) => {
      if (!initDone()) return;
      setGlobalVariantsFromBroadcast(variants);
    });
  }

  // 4T-000625 (Epic 3E-000119): Bereichs-Varianten-Broadcast — jedes Fenster
  // liest seine fenster-eigene Bereichs-Konfiguration frisch (Fenster
  // fremder Bereiche erhalten unveraenderten Inhalt, der JSON-Vergleich im
  // Modul unterdrueckt dann das Aenderungs-Event).
  if (typeof api.onSidebarVariantsChanged === 'function') {
    api.onSidebarVariantsChanged(() => {
      if (!initDone()) return;
      void refreshAreaVariants();
    });
  }

  // 4T-000569 (Epic 3E-000104): Panel-Toggle-Reihenfolge-Broadcast (Muster
  // Sidebar-Layout: auch das ausloesende Fenster empfaengt ihn — persist:false,
  // eine unveraenderte Reihenfolge ist im Setter ein No-op).
  if (typeof api.onPanelToggleOrderChanged === 'function') {
    api.onPanelToggleOrderChanged((order) => {
      if (!initDone()) return;
      void setPanelToggleOrder(order, { persist: false });
    });
  }

  // 4T-000204: Nach jeder Task-Status-Aenderung offene Tabs neu rendern
  // (Live-Rebuild haengt als eigener Listener in live-widgets.js). Der
  // Render-Cache kennt nur content/path/lang/theme — ohne Invalidierung
  // wuerde der Re-Render uebersprungen.
  document.addEventListener('scg:taskstates-changed', () => {
    if (!initDone()) return;
    invalidatePaneRenderCache();
    renderAllPanes();
  });

  // 4T-000498: Nach jeder Aufgaben-Konfigurations-Aenderung (Global Filter,
  // Ausblende-Option, Labels) offene Tabs neu rendern (Muster taskStates;
  // Live-Rebuild haengt als eigener Listener in live-widgets.js).
  document.addEventListener('scg:tasks-changed', () => {
    if (!initDone()) return;
    invalidatePaneRenderCache();
    renderAllPanes();
  });

  // 4T-000284: Nach dem Umschalten der Frontmatter-Anzeige offene Tabs neu
  // rendern (Live-Rebuild haengt als eigener Listener in live-widgets.js);
  // der Render-Cache kennt nur content/path/lang/theme und muss invalidiert
  // werden, sonst wuerde der Re-Render uebersprungen.
  document.addEventListener('scg:frontmatter-display-changed', () => {
    if (!initDone()) return;
    invalidatePaneRenderCache();
    renderAllPanes();
  });

  // 4T-000471 (Epic 3E-000087): Nach dem Umschalten der Nummerierung offene Tabs
  // neu rendern (Render-Cache invalidieren) und die Gliederungs-Ansicht neu
  // aufbauen; der Live-Rebuild haengt als eigener Listener in live-widgets.js.
  document.addEventListener('scg:heading-numbering-changed', () => {
    if (!initDone()) return;
    invalidatePaneRenderCache();
    renderAllPanes();
    for (let paneIdx = 0; paneIdx < paneEditors.length; paneIdx++) {
      if (paneEditors[paneIdx]) scheduleOutlineRender(paneIdx);
    }
  });

  // 4T-000288 (Epic 3E-000051): Nach jeder Layout-Änderung (Reiterwechsel,
  // später Drag-and-Drop und Einstellungs-Bereich aus 4T-000289) das
  // Slot-Mounting aller Panes nachziehen. applySidebarVisibility ist
  // idempotent; Panel-Inhalte sind vom Umhängen unberührt.
  document.addEventListener('scg:sidebar-layout-changed', () => {
    if (!initDone()) return;
    for (let i = 0; i < state.panes.length; i++) applySidebarVisibility(i);
  });

  // 4T-000639 (Epic 3E-000069): Umschalten zwischen Text- und Icon-Überschriften
  // zieht dasselbe Slot-Mounting nach — Köpfe, Reiter und die Breiten-
  // Untergrenze hängen daran.
  document.addEventListener('scg:sidebar-icon-headings-changed', () => {
    if (!initDone()) return;
    for (let i = 0; i < state.panes.length; i++) applySidebarVisibility(i);
  });

  // 4T-000855 (Epic 3E-000164): Ein Wechsel des Höhen-Modells zieht dasselbe
  // Slot-Mounting nach — die Herkunft der Block-Höhen ändert sich, und die
  // Griffe schreiben danach in den anderen Speicher.
  document.addEventListener('scg:sidebar-height-mode-changed', () => {
    if (!initDone()) return;
    for (let i = 0; i < state.panes.length; i++) applySidebarVisibility(i);
  });
}
