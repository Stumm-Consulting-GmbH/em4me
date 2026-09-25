// Laufzeit-Anteil der Erweiterungs-UI: Sichtbarkeit der Statusbar-Buttons
// erweiterungs-gebundener Panels, Anordnung der Panel-Buttons und die
// Laufzeit-Hooks der UI-tragenden Erweiterungen.
//
// Auszug aus app-init.js, 4T-001001 (Epic 3E-000196).
'use strict';

import { updateWordCountStatusbar } from '../render-mermaid.js';
import { state } from './app-state.js';
import {
  editorCompartments,
  paneEditors,
  refreshSpellcheckInEditors,
  typewriterScrollExtension,
} from '../editor/editor.js';
import { renderAllSidebars } from '../panels/panels.js';
import { applyOutgoingVisibility } from '../panels/panel-outgoing.js';
import { applyBacklinksVisibility } from '../panels/panel-backlinks.js';
import { clearSidebarCollapsed } from '../panels/sidebar-collapse.js';
import { getPanelToggleOrder } from '../sidebar-layout.js';
import { PANEL_ACCESS } from '../../../shared/panel-access.js';
import { applyBookmarksVisibility } from '../bookmarks/bookmarks.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { applyCommandPlacementUi } from '../command-placement.js';
import { applyFormatToolbarUi } from '../editor/format-toolbar.js';
import { applyTagsVisibility } from '../properties/properties-tags.js';
import { applyBookPanelVisibility } from '../books/book-panel.js';
import { attachExtensionRuntime, isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-001656 (Epic 3E-000287): Kennung der Canvas-Erweiterung aus dem
// prozessneutralen Kern — dieselbe Quelle, aus der Registry, Render-Weiche und
// Rueckfall sie holen.
import { CANVAS_EXTENSION_ID } from '../../../shared/canvas/canvas-core.js';
// 4T-001847 (Epic 3E-000110): Kennung der Kanban-Erweiterung. Sie steht im
// Modus-Modul und nicht im Format-Kern, weil kein Preload-Teil nach ihr fragt
// (Begruendung im Kopf von kanban-modus.js).
import { KANBAN_EXTENSION_ID } from '../kanban/kanban-modus.js';

// 4T-000294: Statusbar-Buttons erweiterungs-gebundener Panels folgen dem
// Schalt-Zustand (keine toten UI-Elemente). Die Wort-Statistik verwaltet
// ihr hidden selbst (updateWordCountStatusbar setzt es pro Update neu).
//
// 4T-000900 (Epic 3E-000016): Die frueher hier gepflegte Hand-Liste ist entfallen
// und wird aus dem Panel-Zugangs-Modell abgeleitet. Sie war exakt redundant
// (neun Eintraege, in beide Richtungen deckungsgleich mit den Feldern
// extensionId und buttonId), und ihre doppelte Pflege war eine belegte
// Fehlerquelle: In 4T-000568 fehlte das Erinnerungen-Panel als einziges, sein
// Button blieb im Aus-Zustand als totes Element stehen, waehrend der
// Menue-Eintrag korrekt entfiel. Ein fehlender Eintrag ist jetzt nicht mehr
// moeglich, weil es keinen zweiten Ort mehr gibt.
const EXTENSION_STATUSBAR_BUTTONS = PANEL_ACCESS.filter((p) => p.extensionId && p.buttonId).map(
  (p) => [p.extensionId, p.buttonId],
);

/**
 * Blendet die Statusbar-Buttons erweiterungs-gebundener Panels nach dem
 * Schalt-Zustand ein bzw. aus. Idempotent.
 */
export function applyExtensionButtonVisibility() {
  for (const [extId, elId] of EXTENSION_STATUSBAR_BUTTONS) {
    const el = document.getElementById(elId);
    if (el) el.hidden = !isExtensionActive(extId);
  }
}

// 4T-000568 (Epic 3E-000104): Panel-Buttons im source-toggles-Segment nach der
// effektiven Toggle-Reihenfolge anordnen (identisch zum Panel-Untermenue).
// Idempotent; laeuft beim Init und bei Reihenfolge-Aenderung
// (scg:panel-toggle-order-changed, 4T-000569).
// 4T-000576 (Epic 3E-000106): Das Segment enthaelt nur noch die Panel-Buttons;
// die drei Editor-Toggles sind in die mittlere Statusbar-Zone gezogen. Der
// frueher noetige Anker auf den Gliederungs-Button entfaellt damit, jeder
// Button wandert der Reihe nach ans Segment-Ende.
/**
 * Ordnet die Panel-Buttons des source-toggles-Segments nach der effektiven
 * Toggle-Reihenfolge. Idempotent.
 */
export function applyPanelButtonOrder() {
  const container = document.querySelector('.source-toggles');
  if (!container) return;
  for (const id of getPanelToggleOrder()) {
    const meta = PANEL_ACCESS.find((p) => p.id === id);
    const btn = meta ? document.getElementById(meta.buttonId) : null;
    if (btn && btn.parentElement === container) container.appendChild(btn);
  }
}

// 4T-000294: Laufzeit-Hooks der UI-tragenden Erweiterungen (attach-Muster,
// von init() nach dem Laden des Schalt-Zustands registriert — ist eine
// Erweiterung beim Anhaengen bereits deaktiviert, laeuft deactivate sofort
// und bringt die UI auf Stand). Panels: applyXxxVisibility blendet die
// Sektion aus bzw. ein und gibt bei Backlinks die Index-Wurzel frei;
// Fokus-Modus: UI-Wirkung abschalten, ohne die persistierten Preferences
// (focusMode, typewriterScroll) zu veraendern — Daten-Schonung, beim
// Wiedereinschalten kehrt der Zustand zurueck.
/**
 * Haengt die Laufzeit-Hooks der UI-tragenden Erweiterungen an (aus init()
 * nach dem Laden des Schalt-Zustands aufgerufen).
 */
export function registerExtensionRuntimeHooks() {
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
  // 4T-000849 (Epic 3E-000147): Buch-Panel und Statusbar-Button folgen dem
  // Schalt-Zustand der Buecher-Erweiterung.
  const refreshBookPanel = () => {
    for (let i = 0; i < state.panes.length; i++) applyBookPanelVisibility(i);
    applyExtensionButtonVisibility();
  };
  attachExtensionRuntime('books', {
    deactivate: refreshBookPanel,
    activate: refreshBookPanel,
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
  // 4T-000697 (Epic 3E-000141): Aus-Zustand der Sidebar-Kollaps-Erweiterung —
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
  // 4T-000520 (Epic 3E-000094): Aus-Zustand = Standard-Statusbar (Segment
  // leer, Hide-Liste inaktiv); An-Zustand stellt beides wieder her. Die
  // Konfiguration bleibt gespeichert.
  attachExtensionRuntime('command-placement', {
    deactivate: applyCommandPlacementUi,
    activate: applyCommandPlacementUi,
  });
  // 4T-000607 (Epic 3E-000114): Aus-Zustand entfernt die Format-Toolbar
  // vollstaendig; An-Zustand stellt sie im Edit-Modus wieder her. Die
  // Belegungs-Konfiguration bleibt gespeichert.
  attachExtensionRuntime('toolbar', {
    deactivate: applyFormatToolbarUi,
    activate: applyFormatToolbarUi,
  });
  // 4T-000581 (Epic 3E-000107): Aus-Zustand nimmt das spellcheck-Attribut von den
  // Editor-Flaechen zurueck (CodeMirror-Standard, also keine Pruefung); der
  // An-Zustand stellt es her, sofern der Schalter des Einstellungs-Bereichs
  // gesetzt ist. Der Schalter-Stand bleibt in beiden Richtungen gespeichert.
  attachExtensionRuntime('spellcheck', {
    deactivate: refreshSpellcheckInEditors,
    activate: refreshSpellcheckInEditors,
  });
  // 4T-001656 (Epic 3E-000287): Aus-Zustand der Canvas-Flaeche. Der Rueckfall
  // in canvas-modus.js greift beim OEFFNEN eines Dokuments; wird die
  // Erweiterung abgeschaltet, waehrend eine Flaeche offen ist, bliebe das
  // geoeffnete Dokument ohne diesen Hook in einer Ansicht stehen, die es nicht
  // mehr gibt — mit ausgeblendetem Schalter und ohne Menue-Eintrag also
  // unverlassbar. Alle offenen Dokumente im Canvas-Modus fallen deshalb auf die
  // Lese-Ansicht, in der die Fence als gewoehnlicher Code-Block erscheint
  // (Entscheidung E6). Geschrieben wird dabei nichts: Der Modus ist eine
  // Eigenschaft des geoeffneten Dokuments, nicht der Datei.
  //
  // Kein activate-Gegenstueck: Beim Wiedereinschalten den vorherigen Modus
  // zurueckzuholen hiesse, ihn ueber den Aus-Zustand hinweg zu merken; der
  // Anwender waehlt die Ansicht mit einem Klick wieder, und die Flaeche selbst
  // ist unveraendert da (AK6). Das Neuzeichnen und die Menue-Meldung uebernimmt
  // der scg:extensions-changed-Handler, der nach den Hooks laeuft.
  attachExtensionRuntime(CANVAS_EXTENSION_ID, {
    deactivate: () => {
      for (const pane of state.panes) {
        for (const tab of pane.tabs || []) {
          if (tab.viewMode === 'canvas') tab.viewMode = 'rendered';
        }
      }
    },
  });
  // 4T-001847 (Epic 3E-000110): Aus-Zustand der Tafel-Ansicht, wörtlich aus
  // demselben Grund wie darüber. Der Rückfall in kanban-modus.js greift beim
  // ÖFFNEN eines Dokuments; wird die Erweiterung abgeschaltet, während eine
  // Tafel offen ist, bliebe das geöffnete Dokument ohne diesen Hook in einer
  // Ansicht stehen, die es nicht mehr gibt — mit ausgeblendetem Schalter und
  // ohne Menü-Eintrag also unverlassbar. Alle offenen Dokumente im Tafel-Modus
  // fallen deshalb auf die Lese-Ansicht, in der die Tafel als gewöhnliches
  // Markdown erscheint (Story 4S-000978, AK2). Geschrieben wird dabei nichts:
  // Der Modus ist eine Eigenschaft des geöffneten Dokuments, nicht der Datei
  // (AK8).
  //
  // Kein activate-Gegenstück, aus demselben Grund wie bei der Canvas: Den
  // vorherigen Modus über den Aus-Zustand hinweg zu merken, kostete mehr, als
  // der eine Klick des Anwenders wert ist; die Tafel selbst steht unverändert
  // im Dokument (AK5).
  attachExtensionRuntime(KANBAN_EXTENSION_ID, {
    deactivate: () => {
      for (const pane of state.panes) {
        for (const tab of pane.tabs || []) {
          if (tab.viewMode === 'kanban') tab.viewMode = 'rendered';
        }
      }
    },
  });
}
