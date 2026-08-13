// --- Pane-Rendering, Render-Skip-Cache und Auto-Reload -----------------------
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
// Baut den Inhalt einer Pane auf (Render-DOM, System-Seiten, Zoom, Scroll-
// Wiederherstellung), haelt den Render-Skip-Cache und zieht den Bestand nach,
// wenn eine Datei von aussen wechselt oder verschwindet.
'use strict';

import { api } from '../app/api.js';
import {
  applyZoomToPane,
  getPaneEls,
  outerSplitter,
  paneRoots,
  state,
  withDialog,
} from '../app/app-state.js';
import { paneEditors, syncEditorForPane, updateWindowTitle } from '../editor/editor.js';
import { applyRenderPipeline } from '../render-mermaid.js';
// 4T-0277 (Epic 3E-0049): System-Seiten (Einstellungen) montieren ihr DOM
// statt Editor/Render-Pane; Zyklus laufzeit-unkritisch (Muster manual.js).
import { renderSystemPane } from '../app/system-pages.js';
import { refreshSearchIfVisible } from '../search/search.js';
// 4T-0531 (Epic 3E-0088): Panel-Registry fuer die generische Sichtbarkeits-
// Anwendung in applyAllLayouts (statt hartkodierter apply-Liste).
import { sidebarPanels } from '../sidebar-layout.js';
import { syncToolbarToActiveTab, updateActivePaneClasses } from '../tabs/tabs.js';
// 4T-0991 (Epic 3E-0196): Existenz-Hinweis des Lesezeichen-Baums.
import { noteBookmarkFileExistence } from '../bookmarks/bookmarks-tree.js';
import { renderProperties } from '../properties/properties-fields.js';
import { renderTags } from '../editor/autocomplete-help.js';

import { renderTabbar } from './tabbar.js';
// 4T-0989: Laufzeit-Zyklus pane-render <-> views (Kern). applyAllLayouts ruft
// den Empty-State, der Kern ruft renderPaneContent; beide Richtungen sind
// reine Funktionsaufrufe zur Laufzeit (Muster der dokumentierten
// Modularisierungs-Zyklen views <-> editor, history-status, templates).
import { updateEmptyState } from './views.js';

// 4T-0179: Dieses Laufzeit-Flag wird ausschliesslich hier geschrieben und
// bleibt deshalb modul-privat; ueber die Modul-Grenze fuehrt kein
// beschreibbarer Export (Entwicklungsrichtlinien).
let suppressScrollSave = false;

// R4-12 (4T-0180): Render-Skip-Cache pro Pane. Merkt sich, fuer welchen
// Stand (content-Referenz, Pfad, Sprache, Theme) das Render-DOM der Pane
// zuletzt aufgebaut wurde. renderPaneContent ueberspringt den teuren
// markdown-it-Voll-Parse samt Nachverarbeitung, wenn der Stand unveraendert
// ist — das entkoppelt die applyAllLayouts-Kaskade (Tab-Wechsel in Pane 0
// rendert nicht laenger auch Pane 1 neu, Mermaid-Flackern entfaellt).
// Sprache und Theme gehoeren in den Schluessel, weil applyTranslations
// bzw. die Mermaid-Theme-Farben im DOM stecken.
const paneRenderCache = [null, null];

export function notePaneRendered(paneIdx, tab) {
  paneRenderCache[paneIdx] = {
    content: tab.content,
    path: tab.path || '',
    lang: state.language || '',
    theme: document.documentElement.getAttribute('data-theme') || '',
  };
}

// Invalidierung bei jedem Datei-Schreib-/Reload-Ereignis: eingebettete
// Inhalte (Wiki-Embeds) anderer Dateien koennen sich geaendert haben,
// ohne dass content/path der eigenen Pane sich aendern.
export function invalidatePaneRenderCache() {
  paneRenderCache[0] = null;
  paneRenderCache[1] = null;
}

export function renderPaneContent(paneIdx) {
  const els = getPaneEls(paneIdx);
  const pane = state.panes[paneIdx];

  // Suppress save während wir DOM-Updates machen, die scroll-Events auslösen.
  suppressScrollSave = true;

  if (!pane || pane.activeIndex < 0) {
    syncEditorForPane(paneIdx);
    els.renderedHtml.innerHTML = '';
    paneRenderCache[paneIdx] = null;
    // 4T-0277: war zuletzt eine System-Seite aktiv, bliebe ihr DOM sonst
    // in der leeren Pane sichtbar stehen.
    els.content.classList.remove('view-system');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressScrollSave = false;
      });
    });
    return;
  }

  const tab = pane.tabs[pane.activeIndex];
  syncEditorForPane(paneIdx);

  // 4T-0277: System-Seiten (Einstellungen) montieren ihr eigenes DOM in
  // .pane-system; Editor und Render-Pane sind per view-system-Klasse
  // versteckt. Render-DOM und Skip-Cache werden geleert, damit die Suche
  // keine Treffer im unsichtbaren Alt-Inhalt des vorherigen Tabs findet.
  if (tab.systemPage) {
    els.renderedHtml.innerHTML = '';
    paneRenderCache[paneIdx] = null;
    els.content.classList.remove('view-source', 'view-split', 'view-rendered', 'view-live');
    els.content.classList.add('view-system');
    renderSystemPane(paneIdx, tab);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressScrollSave = false;
      });
    });
    return;
  }
  els.content.classList.remove('view-system');

  const cached = paneRenderCache[paneIdx];
  const canSkip =
    !!cached &&
    cached.content === tab.content &&
    cached.path === (tab.path || '') &&
    cached.lang === (state.language || '') &&
    cached.theme === (document.documentElement.getAttribute('data-theme') || '');
  if (!canSkip) {
    els.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
    // R2-13/R5-07 (4T-0179): vereinheitlichte Render-Nachverarbeitung
    // (inkl. Search-Refresh, der hier zuvor fehlte).
    applyRenderPipeline(els.renderedHtml, tab.path);
    notePaneRendered(paneIdx, tab);
  }

  // View-Mode-Klassen auf dem .content-Element setzen.
  els.content.classList.remove('view-source', 'view-split', 'view-rendered', 'view-live');
  els.content.classList.add(`view-${tab.viewMode}`);

  // 4T-0017: Zoom des aktiven Tabs auf die Inhalts-Container der Pane
  // anwenden. Tab-Wechsel innerhalb einer Pane wechselt damit den Zoom.
  applyZoomToPane(paneIdx);

  // Scroll-Position wiederherstellen — und erst danach den Save wieder freigeben.
  requestAnimationFrame(() => {
    const view = paneEditors[paneIdx];
    if (view) view.scrollDOM.scrollTop = tab.scrollSrc || 0;
    els.renderedEl.scrollTop = tab.scrollRen || 0;
    requestAnimationFrame(() => {
      suppressScrollSave = false;
      // Suche nach DOM-Wechsel neu ausfuehren (Tab-/View-Wechsel, Reload).
      if (paneIdx === state.activePaneIndex) refreshSearchIfVisible();
    });
  });
}

export function renderAllPanes() {
  for (let i = 0; i < state.panes.length; i++) {
    renderTabbar(i);
    renderPaneContent(i);
  }
}

export function applyAllLayouts() {
  const split = state.panes.length === 2;
  paneRoots[1].hidden = !split;
  outerSplitter.hidden = !split;
  if (!split) {
    paneRoots[0].style.flex = '1 1 0';
    paneRoots[1].style.flex = '';
  }

  updateActivePaneClasses();
  syncToolbarToActiveTab();
  renderAllPanes();
  updateEmptyState();
  // 4T-0014: Panel-Sichtbarkeit pro Pane anwenden (versteckt -> sichtbar
  // oder umgekehrt; Inhalte werden bei sichtbarer Sidebar gerendert).
  // 4T-0531 (Epic 3E-0088): generisch ueber die Panel-Registry statt einer
  // hartkodierten apply-Liste — die kannte nur die sieben aelteren Panels;
  // ein als sichtbar persistiertes Kalender-, Block-Eigenschaften-, Datei-
  // Graph-, Bereichs- oder Unterseiten-Panel blieb nach dem Start verborgen,
  // bis sein Toggle einmal feuerte (PO-Auftrag aus der 0.59.0-Iteration).
  for (let i = 0; i < state.panes.length; i++) {
    for (const def of sidebarPanels()) {
      if (typeof def.applyVisibility === 'function') def.applyVisibility(i);
    }
  }
}

export function saveScroll(paneIdx) {
  if (suppressScrollSave) return;
  const els = getPaneEls(paneIdx);
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  const view = paneEditors[paneIdx];
  if (view) tab.scrollSrc = view.scrollDOM.scrollTop;
  tab.scrollRen = els.renderedEl.scrollTop;
}

// --- Auto-Reload ------------------------------------------------------------
// opts.alreadyConfirmed (4T-0945): Der Aufrufer hat den Konflikt-Dialog
// bereits gezeigt und die Antwort 'neu laden' erhalten. Ohne diese Angabe
// fragte der Speicher-Weg zweimal dasselbe.
export async function reloadFile(filePath, opts = {}) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((t) => t.path === filePath);
    if (idx < 0) continue;
    const tab = state.panes[p].tabs[idx];

    // Dirty-Buffer: nicht stillschweigend ueberschreiben, sondern Nutzer fragen.
    if (tab.dirty && !opts.alreadyConfirmed) {
      const choice = await withDialog(() => api.confirmConflict({ detail: filePath }));
      if (choice !== 'reload') {
        // 'keepOurs': Buffer behalten. Der externe Stand wird beim naechsten
        // Speichern ueberschrieben; das ist die bewusste Entscheidung.
        //
        // 4T-0945: Sie wird hier festgehalten, und zwar mit dem Stand, GEGEN
        // den entschieden wurde. Das leistet zweierlei: Das Speichern fragt
        // nicht ein zweites Mal dasselbe, und die ueberschriebene fremde
        // Fassung wird dabei trotzdem gesichert. Ohne diesen Merker wuerde
        // die Zusage «die ueberschriebene Fassung bleibt abrufbar» genau im
        // haeufigsten Weg ins Leere gehen, weil die Entscheidung dort faellt
        // und nicht erst beim Speichern.
        const aktuell = await api.readFile(filePath);
        if (aktuell && aktuell.ok) tab.foreignOverride = aktuell.content;
        continue;
      }
      // 'reload' faellt durch zum normalen Reload-Pfad
    }

    try {
      // R4-08 (4T-0170): Inhalt vor dem IO-Roundtrip merken. Tastenschlaege
      // im await-Fenster duerfen nicht stillschweigend ueberschrieben werden.
      const contentBeforeRead = tab.content;
      const data = await api.readFile(filePath);
      // W-01 (4T-0309): {ok,error}-Vertrag — Lesefehler ueber den vorhandenen
      // catch (markFileMissing) statt frueherer IPC-Exception.
      if (!data || !data.ok) throw new Error((data && data.error) || 'read failed');
      if (tab.content !== contentBeforeRead) {
        const choice = await withDialog(() => api.confirmConflict({ detail: filePath }));
        if (choice !== 'reload') continue;
      }
      tab.content = data.content;
      tab.originalContent = data.content;
      tab.dirty = false;
      tab.missing = false;
      // 4T-0945: Mit dem geladenen Stand ist der Speicher-Konflikt erledigt;
      // das automatische Speichern nimmt diesen Reiter wieder auf, und eine
      // frueher getroffene Vorentscheidung ist gegenstandslos.
      tab.saveConflict = false;
      tab.foreignOverride = null;
      // R4-12 (4T-0180): externer Datei-Wechsel — Render-Skip-Caches
      // verwerfen (auch andere Panes koennten die Datei einbetten).
      invalidatePaneRenderCache();
      // R3-08 (4T-0180): Bookmark-Existenz-Cache nachfuehren.
      noteBookmarkFileExistence(filePath, true);
      if (idx === state.panes[p].activeIndex) {
        renderPaneContent(p);
        // 4T-0051: Properties-Sektion nach externer Aenderung neu rendern.
        if (state.properties && state.properties.visibleByPane[p]) {
          renderProperties(p);
        }
        // 4T-0056: Tag-Sektion ebenfalls aktualisieren.
        if (state.tags && state.tags.visibleByPane[p]) {
          renderTags(p);
        }
      }
      renderTabbar(p);
      if (p === state.activePaneIndex && idx === state.panes[p].activeIndex) {
        updateWindowTitle();
      }
    } catch {
      markFileMissing(filePath);
    }
  }
}

export function markFileMissing(filePath) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((t) => t.path === filePath);
    if (idx >= 0) {
      state.panes[p].tabs[idx].missing = true;
      renderTabbar(p);
    }
  }
  // R4-12/R3-08 (4T-0180): Embeds auf die Datei sollen beim naechsten
  // Render als broken erscheinen; Bookmark-Existenz-Cache nachfuehren.
  invalidatePaneRenderCache();
  noteBookmarkFileExistence(filePath, false);
}
