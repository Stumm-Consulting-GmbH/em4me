// Interaktion des Live-Modus: Klick-Pfade (Links, Fussnoten, Aufgaben-Kästchen,
// Treffer der Abfrage-Widgets), Hover-Tooltips und die Rebuild-Auslöser an
// document.
// 4T-000982 (Epic 3E-000196): aus live-widgets.js herausgelöst. Das Modul trägt
// Seiteneffekte: die vier document-Listener registrieren sich beim Laden. Es
// muss deshalb im Import-Graph erreichbar bleiben (live-widgets.js zieht es
// über livePreviewExtensions), sonst fallen Sprach- und Einstellungs-Refreshes
// des Live-Modus still aus.
'use strict';

import { EditorView, hoverTooltip } from '@codemirror/view';

import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { openInPane } from '../tabs/tabs.js';
// 4T-000409 (Epic 3E-000077): scrollToAnchorAfterOpen/normalizedAnchorId fuer den
// Anker-Sprung der Block-Treffer der Perspective-Abfrage.
import {
  normalizedAnchorId,
  scrollToAnchorAfterOpen,
  scrollToLineAfterOpen,
} from '../views/anchor-navigation.js';
import { activateLink } from '../views/link-navigation.js';
// 4T-000504 (Epic 3E-000096): Rueckschreib-Aktionen der Task-Abfrage-Treffer
// (Status-Toggle, Verschieben, Bearbeiten) — zentraler Klick-Dispatch.
import { handleTaskQueryAction } from '../task-query-actions.js';
// 4T-000204: Toggling-Kette des Aufgaben-Status (task-states.js ist zyklenfrei:
// importiert nur api/i18n/shared).
import { performStatusToggle } from '../task-states.js';
import { liveRebuildEffect } from './live-shared.js';
import { findFootnoteDefinitionRange, findFootnoteDefinitionText } from './live-scans.js';

// 4T-000087: i18n-Refresh-Hook. Wenn die App-Sprache zur Laufzeit umgeschaltet
// wird, dispatcht der Sprach-Wechsel-Handler ein 'i18n-language-changed'-
// Event auf document. Wir loesen dann fuer jeden offenen Editor einen
// Live-Plugin-Re-Build aus, damit Callout-Default-Titel-Widgets mit dem
// neuen Sprach-Stand gebaut werden. Listener wird auf Modul-Ebene einmalig
// registriert; paneEditors wird zur Event-Zeit ausgelesen.
document.addEventListener('i18n-language-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-000204: Task-Status-Aenderungen (Settings-Apply oder Multi-Window-
// Broadcast) bauen die Live-Decorations ebenfalls neu — Marker-Pattern
// und State-Decos haengen am aktiven Set.
document.addEventListener('scg:taskstates-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-000498 (Epic 3E-000090): Aufgaben-Konfigurations-Aenderungen (Global
// Filter, Ausblende-Option, Labels) bauen die Live-Decorations ebenfalls
// neu — Badges und Filter-Ausblendung haengen daran (Muster taskStates).
document.addEventListener('scg:tasks-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-000471 (Epic 3E-000087): Nummerierungs-Aenderungen (Settings-Apply oder
// Multi-Window-Broadcast) bauen die Live-Decorations neu — Nummer-Widgets und
// Marker-Ausblendung haengen am aktiven Zustand (Muster taskStates).
document.addEventListener('scg:heading-numbering-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-000409 (Epic 3E-000077): Klick-Pfad der Abfrage-Treffer INNERHALB der Live-
// Block-Widgets. MarkdownBlockWidget.ignoreEvent() laesst CodeMirror alle
// Events aus dem Widget ignorieren — der fm-Zweig des livePreviewClickHandler
// unten feuert dort nie (eventBelongsToEditor prueft widget.ignoreEvent).
// Wie beim FrontmatterBlockWidget und beim Datatable-Editor bindet daher das
// Widget selbst den Listener auf seinem Container (Aufruf in
// MarkdownBlockWidget._enhance, live-widget-render.js). Block-Treffer tragen
// data-fm-anchor ('^id'); nach dem Oeffnen springt die bestehende Anker-
// Mechanik zum Block.
export function bindFrontmatterQueryClicks(container) {
  container.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const tgt = event.target;
    if (!(tgt instanceof Element)) return;
    // 4T-000504 (Epic 3E-000096): Rueckschreib-Aktionen der Task-Treffer laufen
    // auch im Widget ueber den zentralen Dispatch (vor dem Treffer-Link).
    if (handleTaskQueryAction(tgt)) {
      event.preventDefault();
      return;
    }
    const fmItem = tgt.closest('[data-fm-path]');
    if (!fmItem || !fmItem.dataset.fmPath) return;
    const editorEl = container.closest('.cm-editor');
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    const paneIdx = view ? paneEditors.indexOf(view) : -1;
    if (paneIdx < 0) return;
    event.preventDefault();
    const fmAnchor = fmItem.dataset.fmAnchor || '';
    // 4T-000502 (Epic 3E-000096): Task-Treffer springen zur Quell-Zeile.
    const fmLine = parseInt(fmItem.dataset.fmLine || '', 10);
    // 4T-000631 (Epic 3E-000102): Abfrage-Treffer-Klick im Dokument erbt die Gruppe.
    Promise.resolve(openInPane(paneIdx, [fmItem.dataset.fmPath], { inheritGroup: true })).then(
      (realPane) => {
        if (fmAnchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(fmAnchor));
        else if (Number.isFinite(fmLine)) scrollToLineAfterOpen(realPane, fmLine);
      },
    );
  });
}

// 4T-000082: Klick-Handler fuer Live-Modus-Links und Footnote-Verweise.
// Aktiv nur wenn das Live-Compartment den Plugin-Stack enthaelt; wird mit
// dem Plugin zusammen ein-/ausgeschaltet.
//
// **Wichtig: mousedown statt click.** CodeMirror setzt die Cursor-Position
// bereits beim mousedown-Event; ein click-Handler waere zu spaet (der
// Cursor sitzt dann schon im Link-Text statt am Klick-Ziel). Wir filtern
// auf Linksklick (event.button === 0), damit Rechts- und Mittelklick fuer
// Kontextmenue bzw. Browser-Default reserviert bleiben.
export const livePreviewClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    const tgt = event.target;
    if (!(tgt instanceof Element)) return false;
    // 4T-000409 (Epic 3E-000077): Der fruehere [data-fm-path]-Zweig (4T-000355) ist
    // hierher nie durchgedrungen — Abfrage-Treffer liegen im Live-Modus stets
    // in einem Block-Widget mit ignoreEvent() -> true, dessen Events CodeMirror
    // gar nicht erst an diese Handler gibt. Der Klick-Pfad laeuft jetzt ueber
    // bindFrontmatterQueryClicks (oben) direkt am Widget-Container.
    const linkEl = tgt.closest('[data-live-link-href]');
    if (linkEl) {
      const href = linkEl.getAttribute('data-live-link-href');
      const isWiki = linkEl.getAttribute('data-live-link-wikilink') === 'true';
      const paneIdx = paneEditors.indexOf(view);
      if (paneIdx < 0) return false;
      event.preventDefault();
      // activateLink ist async, wir warten nicht — Handler darf synchron
      // true zurueckgeben, damit CodeMirror den Default-mousedown ueberspringt.
      activateLink(paneIdx, href, isWiki);
      return true;
    }
    const refEl = tgt.closest('[data-live-footnote-id]');
    if (refEl) {
      const id = refEl.getAttribute('data-live-footnote-id');
      const range = findFootnoteDefinitionRange(view.state.doc, id);
      if (!range) return false;
      event.preventDefault();
      view.dispatch({
        effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
        selection: { anchor: range.from },
      });
      return true;
    }
    // 4T-000487 (Epic 3E-000091): Der Klick-Pfad der Datums-/Uhrzeit-Werte
    // haengt am dateValuePlugin (date-picker.js, Basis-Extension) und
    // gilt damit auch im Quelltext-Modus.
    // 4T-000083: Task-Box-Toggle im Live-Modus. Klick auf das gerenderte
    // Checkbox-Symbol (Mark-Decoration mit data-live-task-from) toggelt
    // den Marker `[ ]` <-> `[x]` im Doc. Aktive Cursor-Zeile zeigt die
    // rohe Quelle ohne Marker-Decoration — dort kein Toggle-Klick, normale
    // Cursor-Setzung greift.
    const taskEl = tgt.closest('[data-live-task-from]');
    if (taskEl) {
      // 4T-000213 (Epic 3E-000042): im read-only Handbuch-Tab bleibt der
      // Task-Klick inert — der dispatch unten wuerde das Doc trotz
      // EditorState.readOnly aendern (programmatische Dispatches sind
      // davon nicht blockiert).
      const guardPaneIdx = paneEditors.indexOf(view);
      const guardPane = guardPaneIdx >= 0 ? state.panes[guardPaneIdx] : null;
      const guardTab =
        guardPane && guardPane.activeIndex >= 0 ? guardPane.tabs[guardPane.activeIndex] : null;
      if (guardTab && guardTab.manualPage) return false;
      const fromStr = taskEl.getAttribute('data-live-task-from');
      const from = parseInt(fromStr, 10);
      if (Number.isNaN(from) || from < 0 || from > view.state.doc.length) return false;
      // 4T-000497: der Klick folgt der konfigurierten Toggling-Kette —
      // gemeinsame Funktion mit dem Render-Toggle (views.js), inklusive
      // der Undo-Haertung aus 4T-000484 (userEvent-Annotation). Die Zeile
      // wird frisch gelesen; eine veraltete Decoration toggelt damit den
      // aktuellen Zeilen-Stand oder gar nichts.
      const toggled = performStatusToggle(view, view.state.doc.lineAt(from).number);
      if (!toggled) return false;
      event.preventDefault();
      return true;
    }
    return false;
  },
});

// 4T-000082: Hover-Tooltip fuer Footnote-Verweise. Zeigt die Definition aus
// dem Doc-Body als kleinen Tooltip; nutzt CodeMirrors hoverTooltip-API
// (gleiche Infrastruktur wie der Linter-Tooltip aus 4T-000020).
export const liveFootnoteHoverTooltip = hoverTooltip((view, pos) => {
  const domAt = view.domAtPos(pos);
  let el = domAt && domAt.node;
  if (el && el.nodeType === 3) el = el.parentElement;
  if (!(el instanceof Element)) return null;
  const refEl = el.closest('[data-live-footnote-id]');
  if (!refEl) return null;
  const id = refEl.getAttribute('data-live-footnote-id');
  const defText = findFootnoteDefinitionText(view.state.doc, id);
  if (!defText) return null;
  return {
    pos,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-live-footnote-tooltip';
      dom.textContent = defText;
      return { dom };
    },
  };
});

// 4T-000197: Hover-Tooltip fuer Abbreviation-Vorkommen. Zeigt den Langtext
// aus der Definitionszeile; gleiche Infrastruktur wie der Footnote-
// Tooltip (data-Attribut der Mark-Decoration traegt den Text bereits).
export const liveAbbrHoverTooltip = hoverTooltip((view, pos) => {
  const domAt = view.domAtPos(pos);
  let el = domAt && domAt.node;
  if (el && el.nodeType === 3) el = el.parentElement;
  if (!(el instanceof Element)) return null;
  const abbrEl = el.closest('[data-live-abbr-title]');
  if (!abbrEl) return null;
  const title = abbrEl.getAttribute('data-live-abbr-title');
  if (!title) return null;
  return {
    pos,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-live-footnote-tooltip';
      dom.textContent = title;
      return { dom };
    },
  };
});
