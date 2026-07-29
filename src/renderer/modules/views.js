// View-Modus-Umschaltung, Tabbar-/Pane-Rendering, Speichern/Auto-Save, Link-Aktivierung und Anker-Navigation.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { EditorView } from '@codemirror/view';
// 4T-0345 (Epic 3E-0062): History-Isolation, damit der programmatische Link-
// Fix eine eigene Undo-Einheit bildet (nicht mit Nutzer-Eingaben gruppiert).
import { isolateHistory } from '@codemirror/commands';
import { t, getLanguage } from '../i18n.js';

import { api, getDocText } from './api.js';
// K-02 (4T-0186): identische Slugs wie der markdown-it-anchor-Render-Pfad.
import { githubLikeSlug } from '../../shared/markdown/slug.js';
// 4T-0336 (Epic 3E-0061): Unterseiten-Namens-Logik — Expansion relativer
// Ziele ('/Name', '..') gegen den Basename der aktiven Datei.
import {
  SUBPAGE_SEP,
  basenameValidationError,
  expandRelativeTarget,
  isRelativeTarget,
  isSubpageBasename,
  lastSegment,
  parentBasename,
  parentChain,
  segmentValidationError,
  toFileBasename,
  toLogicalName,
} from '../../shared/subpages.js';
// 4T-0345 (Epic 3E-0062): Rewrite-Kern fuer den Buffer-Fix offener dirty Tabs
// beim automatischen Link-Update (shared Modul aus 4T-0344, esbuild-Interop).
import { computeLinkRewrites } from '../../shared/link-rewrite.js';
import { syntaxTree } from '@codemirror/language';
import { extractHeadingText } from './panels.js';
// 4T-0365 (Epic 3E-0067): Klick-Pfad des Block-Metadaten-Indikators (öffnet das
// Block-Eigenschaften-Panel mit dem Anker als Kontext).
import { openBlockPropsForAnchor } from './block-props-panel.js';
import {
  applyRenderPipeline,
  rerenderAllMermaidBlocks,
  waitForMermaidIdle,
} from './render-mermaid.js';
// 4T-0355 (Epic 3E-0065): Idle-Barriere, damit der PDF-Export die befüllten
// Abfrage-Listen druckt statt des leeren Platzhalters.
import { waitForFrontmatterQueriesIdle } from './frontmatter-query-view.js';
// 4T-0435 (Epic 3E-0081): Idle-Barriere und Export-Ersetzung des Journal-
// Navigations-Blocks.
import { replaceJournalNavFencesForExport, waitForJournalNavIdle } from './journal-nav-view.js';
// 4T-0412 (Epic 3E-0078): Idle-Barriere der Skript-Blöcke für den PDF-Export.
import { waitForPerspectiveScriptsIdle } from './perspective-script-view.js';
// 4T-0311 (Epic 3E-0055): Druck-Aufbereitung der Quelltext-Ansicht.
import { buildPdfSourcePrintElement } from './pdf-source-print.js';
// 4T-0465 (Epic 3E-0086): PDF-Farb-Overrides aus dem aktiven Hell-Schema.
import { pdfColorOverrides } from './color-schemes.js';
import {
  EDITOR_VIEW_FM_KEYS,
  MIME_TAB,
  WINDOW_DRAG_TOKEN,
  activeTab,
  applyZoomToPane,
  areaPanelVisiblePref,
  createTab,
  dialogDepth,
  emptyState,
  getEditorViewDefaults,
  getPaneEls,
  outerSplitter,
  paneRoots,
  panesContainer,
  state,
  statusbarHint,
  tabDisplayName,
  withDialog,
} from './app-state.js';
// 4T-0572 (Epic 3E-0105): Frontmatter-Lesen/-Schreiben der dokument-
// gebundenen Editor-Ansicht-Schalter. Direkter Import aus dem Electron-
// freien Shared-Modul (Muster live-widgets.js), damit die Content-
// Transformation ohne Preload-Bruecke unit-testbar bleibt.
import { extractFrontmatter, writeFrontmatter } from '../../shared/markdown/frontmatter.js';
// 4T-0604 (Epic 3E-0113): reiner Kern der Zeitstempel-Automatik (created/updated).
import { applyTimestampFields } from '../../shared/markdown/frontmatter-timestamps.js';
import { paneEditors, syncEditorForPane, updateWindowTitle } from './editor.js';
// 4T-0585 (Epic 3E-0108): Titelzeile — nach Umbenennen und Speichern unter
// den angezeigten Dateinamen nachziehen (Laufzeit-Zyklus über title-line.js
// ist unkritisch, Muster format-toolbar/editor-context-menu).
import { updateTitleLineForPane } from './title-line.js';
// 4T-0204: Toggle-Pfad der Status-Zeichen; seit 4T-0497 folgt der Klick
// der konfigurierten Toggling-Kette (gemeinsame Funktion beider Ansichten).
import { performStatusToggle, isBasicTaskChar } from './task-states.js';
// 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen der Task-Abfrage-Treffer
// (Status-Toggle, Verschieben, Bearbeiten) — zentraler Klick-Dispatch.
import { handleTaskQueryAction } from './task-query-actions.js';
import { scheduleSubpagesRender } from './panels.js';
import {
  applyBookmarksVisibility,
  noteBookmarkFileExistence,
  updateBookmarkPathsForRename,
} from './bookmarks.js';
// 4T-0531 (Epic 3E-0088): Panel-Registry fuer die generische Sichtbarkeits-
// Anwendung in applyAllLayouts (statt hartkodierter apply-Liste).
import { sidebarPanels } from './sidebar-layout.js';
import {
  activatePane,
  activateTab,
  closeTab,
  dropTabIntoGroup,
  moveGroupInPane,
  moveTabBetweenPanes,
  openInPane,
  parseTabDrag,
  reorderTabsWithinPane,
  reportMenuStateNow,
  syncToolbarToActiveTab,
  toggleGroupCollapsed,
  updateActivePaneClasses,
} from './tabs.js';
// 4T-0332 (Epic 3E-0060): Statusbar-Zustand der Dokument-Historie (Laufzeit-
// Zyklus views <-> history-status, Muster 4T-0179).
import { updateHistoryStatus } from './history-status.js';
// 4T-0213 (Epic 3E-0042): Handbuch-Link-Resolver — Links in Handbuch-Tabs
// loesen gegen die Seiten-Registry auf statt gegen das Dateisystem.
import { findManualTabAcrossPanes, openManualPage, resolveManualHref } from './manual.js';
// 4T-0277 (Epic 3E-0049): System-Seiten (Einstellungen) montieren ihr DOM
// statt Editor/Render-Pane; Zyklus laufzeit-unkritisch (Muster manual.js).
import { renderSystemPane } from './system-pages.js';
import {
  planeGruppenMenueSchliessen,
  planeGruppenMitgliederMenue,
  schliesseGruppenMenueSofort,
  showAliasDialog,
  showGroupContextMenu,
  showLinkPreviewDialog,
  showLinkReportDialog,
  showNameInputDialog,
  showTabContextMenu,
} from './dialogs.js';
// 4T-0461 (Epic 3E-0085): bei deaktivierter Erweiterung tab-groups rendert
// der Streifen flach (keine Koepfe/Kennungen, alle Tabs sichtbar).
import { isExtensionActive } from './extension-lifecycle.js';
import { applyTagsVisibility, persistTagsSettings, renderProperties } from './properties-tags.js';
import { renderTags } from './autocomplete-help.js';
import { refreshSearchIfVisible } from './search.js';
// 4T-0427 (Epic 3E-0080): Ordner-Regel-Trigger der Unterseiten-Anlage.
// Laufzeit-Zyklus views <-> templates ist unkritisch (Funktionsaufrufe erst
// zur Laufzeit; Muster der dokumentierten Modularisierungs-Zyklen).
import { openCreatedFileWithRule } from './templates.js';
// 4T-0459 (Epic 3E-0085): Gruppen-Anteil des Panes-Snapshots (reiner Helfer).
// 4T-0460: groupById fuer den Tabbar-Aufbau (Koepfe, Kennungen, Verbergen).
import { buildGroupsSnapshot, groupById } from './tab-groups.js';
// 4T-0765 (Epic 3E-0158): Mehrfach-Auswahl der Reiterleiste — Markierung,
// Auswahl-Gesten und die Menge, die beim Ziehen mitwandert.
import {
  extendSelection,
  hasMultiSelection,
  isTabSelected,
  selectedIndices,
  toggleSelection,
} from './tab-selection.js';

// --- Rendering --------------------------------------------------------------
// 4T-0179: Diese drei Laufzeit-Flags werden ausschliesslich in diesem
// Modul-Bereich geschrieben (ESM-Imports sind read-only) und deshalb hier
// statt im State-Block deklariert.
export let suppressScrollSave = false;
export let autoSaveTimer = null;
export let hintTimer = null;

export function renderTabbar(paneIdx) {
  const els = getPaneEls(paneIdx);
  const pane = state.panes[paneIdx];
  if (!pane) return;
  els.tabbar.innerHTML = '';

  // 4T-0460 (Epic 3E-0085): Gruppen-Koepfe stehen vor dem ersten Mitglied;
  // Mitglieder zugeklappter Gruppen sind verborgen (nur der Kopf bleibt).
  // 4T-0461: bei deaktivierter Erweiterung rendert der Streifen flach —
  // Modell und Sitzungs-Daten bleiben erhalten (Wieder-Einschalten stellt
  // die Gruppen unveraendert zurueck).
  const groupsActive = isExtensionActive('tab-groups');
  const seenGroups = new Set();
  // 4T-0765 (Epic 3E-0158): Die Markierung erscheint erst ab zwei Mitgliedern
  // — eine Auswahl aus einem Reiter ist der Normalfall und sieht aus wie
  // bisher.
  const mehrfachAuswahl = hasMultiSelection(pane);

  pane.tabs.forEach((tab, idx) => {
    const group = groupsActive && tab.groupId ? groupById(pane, tab.groupId) : null;
    if (group && !seenGroups.has(group.id)) {
      seenGroups.add(group.id);
      els.tabbar.appendChild(buildGroupHeadEl(paneIdx, group, idx));
    }
    if (group && group.collapsed) return;

    const el = document.createElement('div');
    el.className =
      'tab' +
      (idx === pane.activeIndex ? ' active' : '') +
      (tab.missing ? ' tab-missing' : '') +
      (tab.dirty ? ' dirty' : '') +
      (group ? ' tab-grouped' : '') +
      (mehrfachAuswahl && isTabSelected(pane, idx) ? ' tab-selected' : '');
    // 4T-0765: Der Streifen rendert nur sichtbare Reiter, der Index bleibt
    // aber der Modell-Index — das Ziehen einer Menge markiert darueber ihre
    // Elemente.
    el.dataset.tabIndex = String(idx);
    if (group) {
      el.style.setProperty('--tab-group-color', `var(--tab-group-${group.color})`);
    }
    const baseName = tabDisplayName(tab);
    el.title = tab.path || baseName;
    el.draggable = true;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = (tab.dirty ? '• ' : '') + baseName;
    el.appendChild(title);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = t('tab.close');
    close.addEventListener('mousedown', (e) => e.stopPropagation());
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(paneIdx, idx);
    });
    el.appendChild(close);

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(paneIdx, idx);
        return;
      }
      activatePane(paneIdx);
    });
    el.addEventListener('click', (e) => {
      if (e.target === close) return;
      // 4T-0765 (Epic 3E-0158): Auswahl-Gesten. Umschalt bildet die Spanne ab
      // dem aktiven Reiter, Strg nimmt einzeln auf und heraus; beide lassen
      // die Aktivierung unangetastet bzw. fuehren sie ohne Ruecksetzen der
      // Auswahl aus. Ein Klick ohne Zusatztaste setzt sie auf diesen Reiter.
      if (e.shiftKey) {
        extendSelection(pane, idx, groupsActive);
        renderTabbar(paneIdx);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const aufgenommen = toggleSelection(pane, idx);
        if (aufgenommen) activateTab(paneIdx, idx, { keepSelection: true });
        else renderTabbar(paneIdx);
        return;
      }
      activateTab(paneIdx, idx);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTabContextMenu(e, paneIdx, idx);
    });

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      // 4T-0765 (Epic 3E-0158): Ist der gezogene Reiter Teil einer
      // Mehrfach-Auswahl, wandert die ganze Menge. tabIndex bleibt als
      // Einzel-Feld erhalten, damit fremde Panes und Fenster den Payload
      // unveraendert lesen (dort zaehlt weiterhin der gezogene Reiter).
      const menge = mehrfachAuswahl && isTabSelected(pane, idx) ? selectedIndices(pane) : [idx];
      e.dataTransfer.setData(
        MIME_TAB,
        JSON.stringify({
          fromPane: paneIdx,
          tabIndex: idx,
          tabIndices: menge,
          windowToken: WINDOW_DRAG_TOKEN,
        }),
      );
      for (const i of menge) {
        const ziel = els.tabbar.querySelector(`.tab[data-tab-index="${i}"]`);
        if (ziel) ziel.classList.add('dragging');
      }
    });
    el.addEventListener('dragend', () => {
      els.tabbar.querySelectorAll('.tab.dragging').forEach((t) => t.classList.remove('dragging'));
    });
    el.addEventListener('dragover', (e) => {
      if (!Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const isLeftHalf = e.clientX - rect.left < rect.width / 2;
      el.classList.toggle('drag-over-left', isLeftHalf);
      el.classList.toggle('drag-over-right', !isLeftHalf);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-left', 'drag-over-right');
    });
    el.addEventListener('drop', (e) => {
      if (!Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over-left', 'drag-over-right');
      const data = parseTabDrag(e);
      if (!data) return;
      const rect = el.getBoundingClientRect();
      const isLeftHalf = e.clientX - rect.left < rect.width / 2;
      const insertIdx = isLeftHalf ? idx : idx + 1;
      // 4T-0460: Kopf-Ziehen — die ganze Gruppe an die Drop-Position
      // (nur innerhalb der eigenen Leiste; fremde Bloecke schnappen).
      if (data.kind === 'group') {
        if (data.fromPane === paneIdx) moveGroupInPane(paneIdx, data.groupId, insertIdx);
        return;
      }
      // 4T-0765 (Epic 3E-0158): Mehrfach-Auswahl als Block bewegen, solange
      // sie in ihrer eigenen Leiste bleibt.
      const menge = Array.isArray(data.tabIndices) ? data.tabIndices : [];
      if (menge.length > 1 && data.fromPane === paneIdx) {
        reorderTabsWithinPane(paneIdx, menge, insertIdx);
        return;
      }
      moveTabBetweenPanes(data.fromPane, data.tabIndex, paneIdx, insertIdx);
    });

    els.tabbar.appendChild(el);
  });
}

// 4T-0460 (Epic 3E-0085): Gruppen-Kopf im Tab-Streifen. Name auf Farbflaeche
// (Palette-Variablen, theme-konform), Klick klappt zu/auf, Ziehen verschiebt
// die ganze Gruppe, Drop eines Tabs auf den Kopf = Beitritt. Zugeklappt
// zeigt der Kopf die Mitglieder-Zahl.
function buildGroupHeadEl(paneIdx, group, firstMemberIdx) {
  const pane = state.panes[paneIdx];
  const head = document.createElement('div');
  // 4T-0767 (Epic 3E-0158): Liegt der aktive Reiter in dieser Gruppe, traegt
  // der Kopf die Aktiv-Kennzeichnung. Bei einer zugeklappten Gruppe ist das
  // die einzige Stelle, an der die Leiste den aktiven Reiter noch zeigt.
  const traegtAktiven = pane.activeIndex >= 0 && pane.tabs[pane.activeIndex]?.groupId === group.id;
  head.className =
    'tab-group-head' + (group.collapsed ? ' collapsed' : '') + (traegtAktiven ? ' active' : '');
  head.dataset.groupId = group.id;
  head.style.setProperty('--tab-group-color', `var(--tab-group-${group.color})`);
  head.style.setProperty('--tab-group-fg', `var(--tab-group-${group.color}-fg)`);
  head.draggable = true;
  head.title = group.name
    ? `${group.name} — ${t('tabGroup.head.tooltip')}`
    : t('tabGroup.head.tooltip');

  const label = document.createElement('span');
  label.className = 'tab-group-head-label';
  label.textContent = group.name;
  head.appendChild(label);

  if (group.collapsed) {
    const count = document.createElement('span');
    count.className = 'tab-group-head-count';
    count.textContent = String(pane.tabs.filter((tb) => tb.groupId === group.id).length);
    head.appendChild(count);
  }

  head.addEventListener('mousedown', () => activatePane(paneIdx));
  head.addEventListener('click', () => {
    // 4T-0768 (Epic 3E-0158): Das Aufklappen macht das Menue gegenstandslos.
    schliesseGruppenMenueSofort();
    toggleGroupCollapsed(paneIdx, group.id);
  });
  // 4T-0768: Aufklapp-Menue beim Ueberfahren — nur bei zugeklappten Gruppen,
  // eine aufgeklappte zeigt ihre Mitglieder ohnehin.
  if (group.collapsed) {
    head.addEventListener('mouseenter', () => planeGruppenMitgliederMenue(paneIdx, group.id, head));
    head.addEventListener('mouseleave', () => planeGruppenMenueSchliessen());
  }
  // 4T-0461: Verwaltung ueber das Kopf-Kontextmenue (Umbenennen/Farbe,
  // Aufloesen, Schliessen).
  head.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showGroupContextMenu(e, paneIdx, group.id);
  });

  head.addEventListener('dragstart', (e) => {
    // 4T-0768: Ein beginnendes Ziehen schliesst das Aufklapp-Menue.
    schliesseGruppenMenueSofort();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      MIME_TAB,
      JSON.stringify({
        kind: 'group',
        fromPane: paneIdx,
        groupId: group.id,
        windowToken: WINDOW_DRAG_TOKEN,
      }),
    );
    head.classList.add('dragging');
  });
  head.addEventListener('dragend', () => head.classList.remove('dragging'));
  head.addEventListener('dragover', (e) => {
    if (!Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    head.classList.add('drag-over-join');
  });
  head.addEventListener('dragleave', () => head.classList.remove('drag-over-join'));
  head.addEventListener('drop', (e) => {
    if (!Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
    e.preventDefault();
    e.stopPropagation();
    head.classList.remove('drag-over-join');
    const data = parseTabDrag(e);
    if (!data) return;
    if (data.kind === 'group') {
      // Fremde Gruppe auf den Kopf: vor dem eigenen Block einreihen.
      if (data.fromPane === paneIdx && data.groupId !== group.id) {
        moveGroupInPane(paneIdx, data.groupId, firstMemberIdx);
      }
      return;
    }
    // 4T-0766 (Epic 3E-0158): Eine Mehrfach-Auswahl tritt als Ganzes bei.
    dropTabIntoGroup(data.fromPane, data.tabIndex, paneIdx, group.id, data.tabIndices);
  });

  return head;
}

// R4-12 (4T-0180): Render-Skip-Cache pro Pane. Merkt sich, fuer welchen
// Stand (content-Referenz, Pfad, Sprache, Theme) das Render-DOM der Pane
// zuletzt aufgebaut wurde. renderPaneContent ueberspringt den teuren
// markdown-it-Voll-Parse samt Nachverarbeitung, wenn der Stand unveraendert
// ist — das entkoppelt die applyAllLayouts-Kaskade (Tab-Wechsel in Pane 0
// rendert nicht laenger auch Pane 1 neu, Mermaid-Flackern entfaellt).
// Sprache und Theme gehoeren in den Schluessel, weil applyTranslations
// bzw. die Mermaid-Theme-Farben im DOM stecken.
export const paneRenderCache = [null, null];

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
export async function reloadFile(filePath) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((t) => t.path === filePath);
    if (idx < 0) continue;
    const tab = state.panes[p].tabs[idx];

    // Dirty-Buffer: nicht stillschweigend ueberschreiben, sondern Nutzer fragen.
    if (tab.dirty) {
      const choice = await withDialog(() => api.confirmConflict({ detail: filePath }));
      if (choice !== 'reload') {
        // 'keepOurs': Buffer behalten. Beim naechsten Save wird der externe
        // Stand ueberschrieben — der originalContent bleibt jetzt aus
        // unserer Sicht "veraltet", aber das ist die bewusste Entscheidung.
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

// --- Link-Aktivierung (gemeinsam fuer Render-Pane und Live-Modus) ----------
// 4T-0082 (Epic 3E-0014): Aus handleRenderedClick extrahierte Klick-Logik.
// Verarbeitet einen href ohne DOM-Bezug; isWikilink steuert den Alias-Fallback
// (relevant nur bei Wiki-Links, deren direkter Datei-Pfad nicht aufloesbar
// ist). Wird sowohl vom Render-Pane-Klick auf <a>-Elementen als auch vom
// Live-Modus-Klick auf cm-live-link/cm-live-wikilink-Decorations aufgerufen.
export async function activateLink(paneIdx, href, isWikilink, baseOverride) {
  if (!href) return;
  activatePane(paneIdx);

  if (/^https?:\/\//i.test(href)) {
    api.openExternal(href);
    return;
  }
  // 4T-0056: Klick auf einen Tag-Link (#tag:<name>) aktiviert den Tag in
  // der Tag-Sidebar (Sektion einblenden falls noetig, Filter setzen).
  if (href.startsWith('#tag:')) {
    const tagName = decodeURIComponent(href.slice(5));
    if (!state.tags.visibleByPane[paneIdx]) {
      state.tags.visibleByPane[paneIdx] = true;
      applyTagsVisibility(paneIdx);
      persistTagsSettings();
      if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
        reportMenuStateNow();
      }
    }
    state.tags.filterByPane[paneIdx] = tagName;
    renderTags(paneIdx);
    return;
  }
  if (href.startsWith('#')) {
    // 4T-0054: Anker im selben Dokument. K-02 (4T-0186): modusbewusst —
    // im Live-/Source-Modus wird die Heading- bzw. Block-Anker-Zeile im
    // Editor angesprungen statt ins unsichtbare Render-DOM zu scrollen.
    navigateToAnchorInPane(paneIdx, href.slice(1));
    return;
  }
  if (/^[a-z]+:/i.test(href)) {
    if (href.startsWith('mailto:')) api.openExternal(href);
    return;
  }
  // 4T-0054: Pfad und Anker trennen. Nach dem Oeffnen der Ziel-Datei
  // scrollen wir zum Anker (Heading-Slug oder Block-ID).
  const hashIdx = href.indexOf('#');
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const anchorPart = hashIdx >= 0 ? href.slice(hashIdx + 1) : '';
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const baseTab = pane.tabs[pane.activeIndex];
  // 4T-0213: Handbuch-Tabs sind pfadlos — relative Links werden gegen die
  // Seiten-Registry aufgeloest (Ziel-Seite oeffnen bzw. aktivieren,
  // optional zum Anker scrollen), nicht gegen das Dateisystem. Nicht
  // registrierte Ziele bleiben bewusst wirkungslos.
  if (baseTab.manualPage && !baseOverride) {
    const hashIdxManual = href.indexOf('#');
    const manualPathPart = hashIdxManual >= 0 ? href.slice(0, hashIdxManual) : href;
    const manualAnchorPart = hashIdxManual >= 0 ? href.slice(hashIdxManual + 1) : '';
    const pageId = resolveManualHref(manualPathPart);
    if (pageId) {
      await openManualPage(pageId);
      if (manualAnchorPart) {
        const target = findManualTabAcrossPanes(pageId);
        if (target) scrollToAnchorAfterOpen(target.paneIdx, manualAnchorPart);
      }
    }
    return;
  }
  // R2-02 (4T-0174): Links in Markdown-Embeds loesen gegen die Embed-Datei
  // auf (baseOverride aus data-embed-base), nicht gegen den Pane-Tab.
  const basePath = baseOverride || baseTab.path;
  // 4T-0336 (Epic 3E-0061): relative Unterseiten-Links ('/Name.md', '..')
  // gegen den Basename der aktiven bzw. Embed-Basis-Datei expandieren.
  // Ergebnis ist die U+2215-Dateinamens-Form; danach laeuft der normale
  // Aufloesungs-Weg (dokument-relativ, dann Index-Fallback).
  let effectivePath = pathPart;
  if (isWikilink && isRelativeTarget(pathPart)) {
    if (!basePath) return;
    const activeBase = api.basename(basePath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const targetNoExt = pathPart.replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const expanded = expandRelativeTarget(activeBase, targetNoExt);
    if (!expanded) return; // '..' auf einer Top-Level-Seite
    effectivePath = expanded + '.md';
  }
  const resolved = await api.resolveLink(basePath, effectivePath);
  if (!resolved) return;
  const exists = await api.fileExists(resolved);
  if (!exists) {
    if (isWikilink && basePath) {
      // 4T-0337 (Epic 3E-0061): deterministischer Versuch ohne Index —
      // Unterseiten liegen konventionell im Ordner der Elternseite, also
      // '/' -> U+2215 im selben Ordner uebersetzen (Ordner-Pfad-Match hat
      // durch den fileExists-Check oben weiterhin Vorrang).
      if (/[/\\]/.test(effectivePath)) {
        const translated = toFileBasename(effectivePath.replace(/\\/g, '/'));
        const cand = await api.resolveLink(basePath, translated);
        if (cand && (await api.fileExists(cand))) {
          // 4T-0631 (Epic 3E-0102): Link-Klicks im Dokument-Inhalt erben die
          // Tab-Gruppe des Quell-Tabs (gilt fuer alle openInPane-Aufrufe der
          // Link-Aufloesung hier; activateLink wird nur von den Klick-Pfaden
          // des Render-Panes und des Live-Modus gerufen).
          const realPane = await openInPane(paneIdx, [cand], { inheritGroup: true });
          if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
          return;
        }
      }
      // B-13 (4T-0175): Suchraum-Fallback ueber den Backlinks-Index —
      // was das Panel als Treffer meldet (Aufloesung ueber den ganzen
      // Suchraum), muss auch klickbar sein. Erst Datei-Treffer im Index,
      // dann der bestehende Alias-Fallback.
      // 4T-0336: volle logische Ziel-Form statt nur des Basenames — der
      // Resolver matcht Pfad-Form (B-13) und Unterseiten-Form; fuehrende
      // './'-/'../'-Ordner-Segmente traegt der Suffix-Match nicht.
      const basename = effectivePath
        .replace(/\.(md|markdown|mdown|mkd)$/i, '')
        .replace(/\\/g, '/')
        .replace(/^(\.\.?\/)+/, '');
      try {
        const idx = await api.resolveWikiTargetInIndex(basePath, basename);
        if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
          const target =
            idx.candidates.length === 1
              ? idx.candidates[0]
              : await showAliasDialog(basename, idx.candidates);
          if (target) {
            // R4-09 (4T-0186): tatsaechliche Ziel-Pane verwenden — die
            // Datei kann in der anderen Spalte bereits offen sein.
            const realPane = await openInPane(paneIdx, [target], { inheritGroup: true });
            if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
          }
          return;
        }
      } catch {
        /* Index nicht verfuegbar — weiter zum Alias-Fallback */
      }
      // 4T-0050 (Epic 3E-0010): Alias-Fallback. Eindeutiger Treffer oeffnet
      // direkt; mehrdeutiger Treffer zeigt den Disambiguation-Dialog.
      const aliasTarget = await tryResolveByAlias(basePath, resolved);
      if (aliasTarget) {
        const realPane = await openInPane(paneIdx, [aliasTarget], { inheritGroup: true });
        if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
      }
    }
    return;
  }
  const isMd = await api.isMarkdownPath(resolved);
  if (!isMd) {
    // 4T-0790 (Epic 3E-0125): Ein Verweis auf eine Nicht-Markdown-Datei blieb
    // hier bisher wirkungslos — eine eingefuegte Anlage waere damit sichtbar,
    // aber unerreichbar gewesen. Jetzt oeffnet sie die Standardanwendung. Die
    // beiden Grenzen (Wurzel, Rueckfrage bei ausfuehrbaren Endungen) liegen im
    // Hauptprozess, damit sie fuer jeden Aufrufer identisch gelten.
    await oeffneAnlage(paneIdx, resolved);
    return;
  }
  // R4-09 (4T-0186): tatsaechliche Ziel-Pane verwenden.
  const realPane = await openInPane(paneIdx, [resolved], { inheritGroup: true });
  if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
}

// 4T-0790 (Epic 3E-0125): Bild-Quelle aus dem Dokument (relativer Pfad) gegen
// die aktive Datei aufloesen und oeffnen. Gemeinsame Strecke von Render-Klick
// und Editor-Doppelklick.
export async function oeffneBildAusQuelle(paneIdx, quelle) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || !tab.path) return false;
  let dekodiert = quelle;
  try {
    dekodiert = decodeURI(quelle);
  } catch {
    /* literales '%' im Namen: unkodiert weiterverwenden */
  }
  const absolut = await api.resolveLink(tab.path, dekodiert);
  if (!absolut) return false;
  return oeffneAnlage(paneIdx, absolut);
}

// 4T-0790 (Epic 3E-0125): Anlage oeffnen und einen Misserfolg sichtbar machen.
// Gemeinsame Strecke von Link-Klick, Bild-Klick und Wiki-Embed, damit die
// Meldungen und die Grenzen nicht dreimal ausgelegt werden.
export async function oeffneAnlage(paneIdx, absolutePfad) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  let ergebnis;
  try {
    ergebnis = await api.openAttachment({
      pfad: absolutePfad,
      dokumentPfad: (tab && tab.path) || '',
    });
  } catch (err) {
    ergebnis = { ok: false, error: (err && err.message) || String(err) };
  }
  if (ergebnis && ergebnis.ok) return true;
  // Ein vom Anwender abgebrochener Bestaetigungs-Dialog ist kein Fehler und
  // bekommt deshalb keine Meldung.
  const grund = ergebnis && ergebnis.error;
  if (grund === 'abgebrochen') return false;
  const key =
    grund === 'ausserhalb-der-wurzel'
      ? 'attachments.open.outsideRoot'
      : grund === 'nicht-gefunden' || grund === 'kein-file'
        ? 'attachments.open.notFound'
        : 'attachments.open.failed';
  showStatusbarHint(key, { error: true, duration: 4000 });
  return false;
}

// --- Render-Klick (Markdown-Links) ------------------------------------------
// Duenner Wrapper um activateLink: extrahiert href und Wikilink-Flag aus
// dem <a>-Element des Render-Panes.
export async function handleRenderedClick(e, paneIdx) {
  // K-11 (4T-0186): Task-Checkbox-Klick im Render-Pane — toggelt den
  // Marker im Quelltext (Paritaet zum Live-Modus-Task-Toggle).
  if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
    toggleTaskFromRendered(paneIdx, e.target);
    return;
  }
  // 4T-0204: Klick auf eine erweiterte Status-Box — gleiche Mechanik,
  // Semantik: erweiterter Status wird abgeschlossen (`[x]`).
  const stateBox = e.target instanceof Element ? e.target.closest('.task-state-box') : null;
  if (stateBox) {
    toggleTaskFromRendered(paneIdx, stateBox);
    return;
  }
  // 4T-0355 (Epic 3E-0065): Klick auf einen Frontmatter-Abfrage-Eintrag öffnet
  // die exakte Zieldatei über den absoluten Index-Pfad (data-fm-path), ohne
  // erneute Namensauflösung. Vor der generischen <a>-Behandlung, weil die
  // Einträge selbst <a href="#"> sind. 4T-0409 (Epic 3E-0077): Block-Treffer
  // tragen zusätzlich data-fm-anchor ('^id') — nach dem Öffnen springt die
  // bestehende Anker-Mechanik zum Block (modusbewusst, wie der Wiki-Link).
  // 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen der Task-Treffer (Status-
  // Toggle, Verschieben, Bearbeiten) — vor dem Treffer-Link, weil die
  // Aktions-Elemente innerhalb desselben Listen-Eintrags liegen.
  if (handleTaskQueryAction(e.target, paneIdx)) {
    e.preventDefault();
    return;
  }
  const fmItem = e.target instanceof Element ? e.target.closest('[data-fm-path]') : null;
  if (fmItem && fmItem.dataset.fmPath) {
    e.preventDefault();
    activatePane(paneIdx);
    const fmAnchor = fmItem.dataset.fmAnchor || '';
    // 4T-0502 (Epic 3E-0096): Task-Treffer tragen die Quell-Zeile — nach dem
    // Öffnen springt der modusbewusste Zeilen-Sprung dorthin.
    const fmLine = parseInt(fmItem.dataset.fmLine || '', 10);
    // 4T-0631 (Epic 3E-0102): Abfrage-Treffer-Klick im Dokument erbt die Gruppe.
    const realPane = await openInPane(paneIdx, [fmItem.dataset.fmPath], { inheritGroup: true });
    if (fmAnchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(fmAnchor));
    else if (Number.isFinite(fmLine)) scrollToLineAfterOpen(realPane, fmLine);
    return;
  }
  // 4T-0365 (Epic 3E-0067): Klick auf den Block-Metadaten-Indikator öffnet das
  // Panel „Block-Eigenschaften" mit dem Anker als Kontext (vor der generischen
  // <a>-Behandlung — der Indikator ist ein <button>, kein Link).
  const metaInd = e.target instanceof Element ? e.target.closest('.block-meta-indicator') : null;
  if (metaInd && metaInd.dataset.anchorId) {
    e.preventDefault();
    openBlockPropsForAnchor(paneIdx, metaInd.dataset.anchorId);
    return;
  }
  // 4T-0790 (Epic 3E-0125): Klick auf ein eingebettetes Bild oeffnet es in der
  // Standardanwendung. Ein Bild ist kein Link und faellt sonst durch den
  // closest('a')-Zweig unten hindurch, ohne dass etwas geschieht. In der
  // Render-Ansicht genuegt der einfache Klick, weil es hier keine Schreibmarke
  // gibt (PO-Festlegung 2026-07-29; im Editor gilt der Doppelklick).
  //
  // Der Pfad wird aus dem Quelltext-Attribut geholt, nicht aus `src`: Dort
  // steht nach der Aufloesung ein data:-URI, aus dem sich kein Pfad mehr
  // ableiten laesst.
  if (e.target instanceof HTMLImageElement) {
    const quelle = e.target.getAttribute('data-src-original') || '';
    if (quelle && !/^(https?:|data:)/i.test(quelle)) {
      e.preventDefault();
      await oeffneBildAusQuelle(paneIdx, quelle);
      return;
    }
  }
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  // R2-02 (4T-0174): Klicks innerhalb eines Markdown-Embeds tragen die
  // Embed-Datei als Resolve-Basis (data-embed-base am Embed-Body).
  const embedBody = a.closest('.wiki-embed-md-body');
  const baseOverride =
    embedBody && embedBody.dataset.embedBase ? embedBody.dataset.embedBase : null;
  await activateLink(paneIdx, href, a.classList.contains('wikilink'), baseOverride);
}

// K-11 (4T-0186): Klick auf eine Task-Checkbox im Render-Pane. Das <li>
// traegt die Quell-Zeile (sourceLineMapper); dort wird der Marker
// `[ ]`/`[x]` im Editor-Doc getoggelt. Der UpdateListener pflegt danach
// tab.content, Dirty-Flag und (im Split) die Vorschau; das native
// Checkbox-Visual toggelt der Browser selbst — DOM und Quelle bleiben
// damit auch ohne Re-Render des Reading-Panes synchron.
export function toggleTaskFromRendered(paneIdx, checkboxEl) {
  // Checkboxen in Markdown-Embeds bleiben passiv: deren data-source-line
  // bezieht sich auf die Embed-Datei, nicht auf das aktive Doc.
  if (checkboxEl.closest('.wiki-embed-md-body')) return;
  // 4T-0213: im read-only Handbuch-Tab bleibt der Status-Klick inert
  // (EditorState.readOnly blockiert programmatische Dispatches nicht).
  const paneForGuard = state.panes[paneIdx];
  const tabForGuard =
    paneForGuard && paneForGuard.activeIndex >= 0
      ? paneForGuard.tabs[paneForGuard.activeIndex]
      : null;
  if (tabForGuard && tabForGuard.manualPage) return;
  const li = checkboxEl.closest('li[data-source-line]');
  const view = paneEditors[paneIdx];
  if (!li || !view) return;
  const ln = parseInt(li.dataset.sourceLine, 10);
  // 4T-0497: der Klick folgt der konfigurierten Toggling-Kette (Basis
  // `[ ]` <-> `[x]` fest, erweiterte Status auf ihr Folge-Symbol); der
  // Dispatch samt Undo-Haertung (4T-0484) liegt in performStatusToggle.
  const toggle = performStatusToggle(view, ln);
  if (!toggle) return;
  // 4T-0204: sobald eine Status-Box beteiligt ist (Quelle oder Ziel),
  // aendert sich die Darstellung (Box <-> Checkbox bzw. Glyph/Farbe);
  // anders als beim nativen Checkbox-Visual (K-11) muss das Reading-Pane
  // dann neu rendern. renderPaneContent stellt die Scroll-Position aus
  // tab.scrollRen wieder her.
  if (!isBasicTaskChar(toggle.fromChar) || !isBasicTaskChar(toggle.toChar)) {
    renderPaneContent(paneIdx);
  }
}

// 4T-0054: Nach dem Oeffnen einer Datei (Klick auf [[Datei#Anker]]) zum
// Anker scrollen. Render-Pane braucht einen Repaint, daher Verzoegerung;
// 100 ms reicht typischerweise auch fuer groessere Dokumente.
// R4-09 (4T-0186): modusbewusst (Editor-Sprung in source/live).
export function scrollToAnchorAfterOpen(paneIdx, anchorId) {
  setTimeout(() => navigateToAnchorInPane(paneIdx, anchorId), 100);
}

// 4T-0502 (Epic 3E-0096): Zeilen-Sprung nach dem Oeffnen (Task-Treffer der
// Abfrage) — gleiches Timing wie der Anker-Sprung, modusbewusst wie
// navigateToAnchorInPane (Reading scrollt das Render-Pane ueber das
// data-source-line-Mapping, Source/Live setzen den Editor-Cursor).
export function scrollToLineAfterOpen(paneIdx, lineNumber) {
  setTimeout(() => {
    const pane = state.panes[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    if (!tab) return;
    if (tab.viewMode === 'rendered' || tab.viewMode === 'split') {
      scrollRenderedToLine(paneIdx, lineNumber);
    }
    if (tab.viewMode !== 'rendered') {
      scrollEditorToLine(paneIdx, lineNumber);
    }
  }, 100);
}

export function scrollToAnchorInPane(paneIdx, anchorId) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.renderedHtml || !anchorId) return;
  try {
    const escaped =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(anchorId)
        : anchorId.replace(/(["\\])/g, '\\$1');
    const target = els.renderedHtml.querySelector(`[id="${escaped}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // Ungueltiger Selector — defensive Aufgabe, kein UI-Effekt.
  }
}

// --- Modus-uebergreifende Ziel-Navigation (4T-0186) --------------------------
// K-02/R3-03/R4-09: Anker- und Zeilen-Sprünge muessen in jedem Ansichts-
// Modus wirken. Reading scrollt das Render-Pane (Anker-Element bzw.
// data-source-line-Mapping); Source/Live setzen den Editor-Cursor auf die
// Ziel-Zeile — im Live-Modus klappt das auch Block-Widgets auf. Split
// bedient beide Seiten (Scroll-Sync zieht ohnehin nach).

// R3-06: DOM-ids sind Heading-Slugs bzw. Block-IDs ohne '^'. Rohe Anker
// aus Panels/Quelltext vor der Uebergabe normalisieren.
export function normalizedAnchorId(anchor) {
  const a = String(anchor || '').trim();
  if (!a) return '';
  if (a.startsWith('^')) return a.slice(1).trim();
  return githubLikeSlug(a) || a;
}

export function scrollEditorToLine(paneIdx, lineNumber) {
  const view = paneEditors[paneIdx];
  if (!view) return false;
  const ln = Math.max(1, Math.min(view.state.doc.lines, lineNumber | 0));
  const pos = view.state.doc.line(ln).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  });
  return true;
}

// Heading-Zeile zu einem Slug finden — mit derselben Duplikat-
// Deduplizierung wie markdown-it-anchor (slug, slug-1, slug-2, …).
// Quelle ist der Lezer-Baum (immer aktive markdown()-Extension), NICHT
// das foldStructureField — das existiert nur bei eingeschaltetem
// Fold-Gutter.
export function findHeadingLineForSlug(view, slug) {
  if (!view || !slug) return 0;
  const doc = view.state.doc;
  const seen = new Map();
  let found = 0;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (found) return false;
      if (!/^(?:ATX|Setext)Heading[1-6]$/.test(node.name)) return;
      const fromLine = doc.lineAt(node.from).number;
      const base = githubLikeSlug(extractHeadingText(doc, fromLine));
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      const effective = n === 0 ? base : `${base}-${n}`;
      if (effective === slug) {
        found = fromLine;
        return false;
      }
    },
  });
  return found;
}

// Block-Anker-Zeile (`^id` am Zeilenende) im Doc finden.
export function findBlockAnchorLine(view, id) {
  if (!view || !id) return 0;
  const lines = getDocText(view.state.doc).split('\n');
  const needle = '^' + id;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    if (trimmed.endsWith(needle)) {
      const before = trimmed.slice(0, trimmed.length - needle.length);
      if (before === '' || /\s$/.test(before)) return i + 1;
    }
  }
  return 0;
}

export function navigateToAnchorInPane(paneIdx, anchorId) {
  if (!anchorId) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab) return;
  if (tab.viewMode === 'rendered' || tab.viewMode === 'split') {
    scrollToAnchorInPane(paneIdx, anchorId);
  }
  if (tab.viewMode !== 'rendered') {
    const view = paneEditors[paneIdx];
    if (!view) return;
    let line = findHeadingLineForSlug(view, anchorId);
    if (!line) line = findBlockAnchorLine(view, anchorId);
    if (line) scrollEditorToLine(paneIdx, line);
  }
}

// R3-03: Zeilen-Sprung ins Render-Pane (Reading-Modus). Kleiner Delay,
// damit ein unmittelbar vorausgegangener Tab-Wechsel-Render samt
// Scroll-Restore (Doppel-rAF in renderPaneContent) nicht dazwischenfunkt.
export function scrollRenderedToLine(paneIdx, lineNumber) {
  setTimeout(() => {
    const els = getPaneEls(paneIdx);
    if (!els || !els.renderedEl) return;
    const target = findRenderElementForLine(els.renderedEl, lineNumber);
    if (target && target.isConnected) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

// 4T-0050: Hilfsfunktion fuer den Wiki-Link-Alias-Fallback. Bekommt den
// auf den Basispfad aufgeloesten Datei-Pfad (der nicht existiert) und
// extrahiert daraus den Wiki-Link-Basename. Dann Backend-Lookup im
// Alias-Index. Bei keinem Treffer liefert die Funktion null (Renderer
// macht nichts weiter, Linter markiert den Link als broken). Bei einem
// Treffer den Pfad; bei mehreren den vom Nutzer im Dialog gewaehlten.
export async function tryResolveByAlias(activeFilePath, resolvedPath) {
  // Wiki-Link-Plugin (src/shared/markdown/plugins.js) haengt '.md' an, wenn das Ziel keine
  // Extension hat. Wir muessen den Basename ohne Extension extrahieren,
  // damit er gegen die Alias-Eintraege gematcht werden kann (Aliases sind
  // ohne Extension).
  const basename = api.basename(resolvedPath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
  if (!basename) return null;
  let result;
  try {
    result = await api.resolveWikiTargetByAlias(activeFilePath, basename);
  } catch {
    return null;
  }
  if (!result || result.status !== 'ready') return null;
  const candidates = result.candidates || [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Mehrdeutigkeit: Auswahl-Dialog.
  return await showAliasDialog(result.viaAlias || basename, candidates);
}

// --- Unterseite anlegen (4T-0338, Epic 3E-0061) ------------------------------
// Kommando 'file.newSubpage' bzw. Menue 'Datei -> Neue Unterseite...':
// fragt das Namens-Segment per Dialog ab, laesst den Main die Datei
// '<aktiver Basename>∕<Segment>.md' im Ordner der aktiven Datei anlegen
// (beliebige Tiefe, weil der aktive Basename selbst eine Unterseite sein
// kann) und oeffnet sie als Tab. Existiert die Zieldatei, wird sie
// geoeffnet statt ueberschrieben.
export async function createSubpageForActiveFile() {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('subpage.create.noFile', { duration: 2500, error: true });
    return;
  }
  const logicalName = toLogicalName(
    api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
  );
  const segment = await showNameInputDialog({
    title: t('subpage.create.title'),
    description: t('subpage.create.description').replace('{page}', logicalName),
    placeholder: t('subpage.create.placeholder'),
    okLabel: t('subpage.create.ok'),
    validate: (value) => {
      const err = segmentValidationError(value);
      return err ? `subpage.create.error.${err}` : null;
    },
  });
  if (!segment) return;
  let result;
  try {
    result = await api.createSubpage(tab.path, segment);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    showStatusbarHint('subpage.create.failed', { duration: 2500, error: true });
    return;
  }
  if (result.existed) {
    showStatusbarHint('subpage.create.exists', { duration: 2500 });
    await openInPane(state.activePaneIndex, [result.path]);
    return;
  }
  // 4T-0427 (Epic 3E-0080): frisch angelegte Unterseiten durchlaufen den
  // Ordner-Regel-Trigger (Vorlage füllen, öffnen, Cursor-Sprung); bereits
  // existierende Dateien (existed) sind keine Anlage und bleiben unberührt.
  await openCreatedFileWithRule(state.activePaneIndex, result.path);
}

// --- Datei umbenennen (4T-0339, Epic 3E-0061) --------------------------------
// Kommando 'file.rename' bzw. Menue/Tab-Kontextmenue: fragt den neuen
// Basename per Dialog ab (Vorbelegung aktueller Name ohne Extension) und
// laesst den Main die Datei im selben Ordner umbenennen. Der Nachzug in
// Tabs, Lesezeichen, Per-Datei-Settings und Sitzung laeuft zentral ueber
// den 'file:renamed'-Broadcast (handleFileRenamed), damit auch andere
// Fenster mit derselben Datei nachziehen.
export async function renameFileForTab(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane ? pane.tabs[tabIdx] : null;
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  // Ungespeicherte Aenderungen zuerst sichern — der Pfad wechselt, ein
  // Dirty-Stand darf nicht am alten Namen haengen bleiben.
  if (tab.dirty) {
    const saved = await saveTab(paneIdx, tabIdx);
    if (!saved) return;
  }
  const currentBase = api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, '');
  // 4T-0340: drei Ebenen-Faelle einheitlich als "eigenes Namens-Segment
  // aendern". Bei Unterseiten wird nur das letzte Segment editiert (die
  // Eltern-Kette bleibt), bei Top-Level-Seiten der ganze Basename. Der
  // Nachfahren-Scan liefert die Anzahl fuer den Kaskaden-Hinweis im Dialog.
  const isSub = isSubpageBasename(currentBase);
  let descendantCount = 0;
  try {
    const scan = await api.subpageDescendants(tab.path);
    if (scan && scan.ok && Array.isArray(scan.files)) descendantCount = scan.files.length;
  } catch {
    /* Scan-Fehler: Kaskade laeuft trotzdem, nur der Hinweis entfaellt */
  }
  let description = isSub
    ? t('rename.descriptionSegment').replace('{name}', toLogicalName(currentBase))
    : t('rename.description').replace('{name}', currentBase);
  if (descendantCount > 0) {
    description += ' ' + t('rename.cascadeHint').replace('{n}', String(descendantCount));
  }
  // 4T-0646 (Epic 3E-0128): Bei einer Unterseite nennt die Beschreibung die
  // Wirkung des Vollname-Schalters, bevor er betaetigt wird.
  if (isSub) description += ' ' + t('rename.fullNameHint');
  // 4T-0346 (Epic 3E-0062): Checkbox-Vorbelegung aus den App-Einstellungen
  // (beide Standard an). Die Vorschau-Checkbox haengt an der Update-Checkbox.
  const defaultUpdate = (await api.getSetting('renameUpdateLinks')) !== false;
  const defaultPreview = (await api.getSetting('renameLinkPreview')) !== false;
  // 4T-0646: Vollname-Schalter. Er wechselt Vorbelegung und Pruefung zwischen
  // Segment- und Vollname-Modus; im Vollname-Modus wird die logische
  // Slash-Schreibweise angezeigt und akzeptiert (U+2215-Uebersetzung wie in
  // der Titelzeile), sonst waere der Eltern-Anteil gar nicht eingebbar — das
  // Trennzeichen liegt auf keiner Tastatur.
  const logicalPrefix = isSub ? toLogicalName(parentBasename(currentBase)) + '/' : '';
  const checkboxes = [
    { id: 'updateLinks', label: t('rename.updateLinks'), checked: defaultUpdate },
    {
      id: 'showPreview',
      label: t('rename.showPreview'),
      checked: defaultPreview,
      requires: 'updateLinks',
    },
  ];
  if (isSub) {
    checkboxes.push({
      id: 'fullName',
      label: t('rename.fullName'),
      checked: false,
      onChange: (checked, field) => {
        const v = String(field.value || '').trim();
        if (checked) {
          field.value = v.startsWith(logicalPrefix) ? v : logicalPrefix + v;
        } else {
          field.value = v.startsWith(logicalPrefix)
            ? v.slice(logicalPrefix.length)
            : v.split('/').pop();
        }
        field.focus();
      },
    });
  }
  const input = await showNameInputDialog({
    title: t('rename.title'),
    description,
    initialValue: isSub ? lastSegment(currentBase) : currentBase,
    okLabel: t('rename.ok'),
    validate: (value, cbs) => {
      const fullName = !!(cbs && cbs.fullName);
      if (isSub && !fullName) {
        const err = segmentValidationError(value);
        if (!err) return null;
        // Segment-Modus: das Trennzeichen ist im Segment nicht erlaubt —
        // der Fehlertext der Unterseiten-Anlage passt dort exakt.
        if (err === 'separator') return 'subpage.create.error.separator';
        return `rename.error.${err}`;
      }
      // Vollname-Modus einer Unterseite: Slash-Form pruefen. Top-Level-Seiten
      // bleiben unveraendert beim bisherigen Verhalten.
      const err = basenameValidationError(isSub ? toFileBasename(value) : value);
      return err ? `rename.error.${err}` : null;
    },
    checkboxes,
  });
  if (!input) return;
  const fullName = !!(input.checkboxes && input.checkboxes.fullName);
  let newBase;
  if (!isSub) {
    newBase = input.value;
  } else if (fullName) {
    newBase = toFileBasename(input.value);
  } else {
    newBase = parentBasename(currentBase) + SUBPAGE_SEP + input.value;
  }
  if (newBase === currentBase) return;
  const updateLinks = !!(input.checkboxes && input.checkboxes.updateLinks);
  const showPreview = updateLinks && !!(input.checkboxes && input.checkboxes.showPreview);

  await applyRename(tab, newBase, updateLinks, showPreview);
}

// 4T-0774 (Epic 3E-0128): gemeinsamer Ausfuehrungs-Teil von Umbenennen und
// Loesen — optionale Vorschau, der Aufruf selbst, Fehler- und Ergebnis-
// Bericht. Beide Bedienwege unterscheiden sich nur im Dialog davor und im
// gebildeten Ziel-Basename.
async function applyRename(tab, newBase, updateLinks, showPreview) {
  // 4T-0346: optionale Vorschau vor der Umbenennung. Abbrechen bricht den
  // gesamten Vorgang ab (es ist noch nichts passiert).
  if (showPreview) {
    const proceed = await withDialog(() => runLinkUpdatePreview(tab.path, newBase));
    if (!proceed) return;
  }

  let result;
  try {
    result = await api.renameFile(tab.path, newBase, updateLinks);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    if (result && result.code === 'partial') {
      // 4T-0340: Teilfehler-Bericht — wie viele Dateien umbenannt wurden.
      showStatusbarHint(null, {
        text: t('rename.partial')
          .replace('{done}', String(result.renamedCount || 0))
          .replace('{total}', String(result.totalCount || 0)),
        duration: 4000,
        error: true,
      });
      return;
    }
    const key = result && result.code === 'exists' ? 'rename.exists' : 'rename.failed';
    showStatusbarHint(key, { duration: 2500, error: true });
    return;
  }
  // 4T-0346: Ergebnis-Bericht — nur bei aktivem Link-Update (PO-Anforderung);
  // ohne Update bleibt das bisherige Verhalten (Statusbar-Hinweise).
  if (updateLinks && result.linkUpdate) {
    await withDialog(() => showLinkUpdateReport(result));
  }
}

// --- Unterseite loesen (4T-0774, Epic 3E-0128) -------------------------------
// Kommando 'file.detachSubpage' bzw. Menue/Tab-Kontextmenue: macht aus einer
// Unterseite eine eigenstaendige Seite. Technisch ist das die Umbenennung auf
// das eigene letzte Namens-Segment — der Main bildet die Ziel-Paare ueber
// Praefix-Ersetzung, weshalb eigene Unterseiten mitwandern, die Kollisions-
// pruefung ueber alle Ziele vorab laeuft und die Verweis-Nachfuehrung
// unveraendert greift. Der Ziel-Name ist im Dialog aenderbar, damit eine
// Kollision auf der Zielebene an Ort und Stelle aufloesbar ist.
export async function detachSubpageForTab(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane ? pane.tabs[tabIdx] : null;
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  const currentBase = api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, '');
  if (!isSubpageBasename(currentBase)) {
    showStatusbarHint('detach.notSubpage', { duration: 3000, error: true });
    return;
  }
  // Ungespeicherte Aenderungen zuerst sichern (Semantik des Umbenennens).
  if (tab.dirty) {
    const saved = await saveTab(paneIdx, tabIdx);
    if (!saved) return;
  }
  let descendantCount = 0;
  try {
    const scan = await api.subpageDescendants(tab.path);
    if (scan && scan.ok && Array.isArray(scan.files)) descendantCount = scan.files.length;
  } catch {
    /* Scan-Fehler: das Loesen laeuft trotzdem, nur der Hinweis entfaellt */
  }
  const target = lastSegment(currentBase);
  let description = t('detach.description')
    .replace('{name}', toLogicalName(currentBase))
    .replace('{target}', target);
  if (descendantCount > 0) {
    description += ' ' + t('rename.cascadeHint').replace('{n}', String(descendantCount));
  }
  const defaultUpdate = (await api.getSetting('renameUpdateLinks')) !== false;
  const defaultPreview = (await api.getSetting('renameLinkPreview')) !== false;
  const input = await showNameInputDialog({
    title: t('detach.title'),
    description,
    initialValue: target,
    okLabel: t('detach.ok'),
    validate: (value) => {
      // Das Ergebnis ist eine eigenstaendige Seite: ein Schraegstrich waere
      // das Umhaengen unter eine andere Seite und liegt ausserhalb des Umfangs.
      const err = segmentValidationError(value);
      if (!err) return null;
      if (err === 'separator') return 'subpage.create.error.separator';
      return `rename.error.${err}`;
    },
    checkboxes: [
      { id: 'updateLinks', label: t('rename.updateLinks'), checked: defaultUpdate },
      {
        id: 'showPreview',
        label: t('rename.showPreview'),
        checked: defaultPreview,
        requires: 'updateLinks',
      },
    ],
  });
  if (!input) return;
  const newBase = input.value;
  if (newBase === currentBase) return;
  const updateLinks = !!(input.checkboxes && input.checkboxes.updateLinks);
  const showPreview = updateLinks && !!(input.checkboxes && input.checkboxes.showPreview);
  await applyRename(tab, newBase, updateLinks, showPreview);
}

export function detachActiveSubpage() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  return detachSubpageForTab(state.activePaneIndex, pane.activeIndex);
}

// 4T-0346 (Epic 3E-0062): Anzeigename einer Datei im Vorschau-/Bericht-Dialog
// (Basename, Unterseiten in Slash-Schreibweise).
function linkUpdateDisplayName(p) {
  return toLogicalName(api.basename(p));
}

// 4T-0346: ob ein Pfad in einem offenen Tab ungespeicherte Aenderungen hat
// (Dirty-Kennzeichnung; der Main fuehrt keinen Dirty-Status).
function isPathDirty(p) {
  return state.panes.some((pane) => pane.tabs.some((tb) => tb.path === p && tb.dirty));
}

// 4T-0346: Vorschau-Datenpfad. Holt die betroffenen Dateien (Dry-Run aus
// 4T-0345), ergaenzt die Dirty-Kennzeichnung aus den eigenen Tabs und zeigt den
// Vorschau-Dialog. Liefert true (Fortfahren) oder false (Abbrechen).
async function runLinkUpdatePreview(oldPath, newBase) {
  let preview;
  try {
    preview = await api.renameLinkUpdatePreview(oldPath, newBase);
  } catch {
    preview = null;
  }
  const items = preview && preview.ok && Array.isArray(preview.items) ? preview.items : [];
  const rows = items.map((it) => ({
    text: linkUpdateDisplayName(it.path),
    detail:
      t('linkUpdate.hits').replace('{n}', String(it.count)) +
      (isPathDirty(it.path) ? ` · ${t('linkUpdate.dirty')}` : ''),
  }));
  const summary =
    items.length > 0 ? t('linkUpdate.preview.summary').replace('{n}', String(items.length)) : '';
  return showLinkPreviewDialog({
    title: t('linkUpdate.preview.title'),
    summary,
    sections: [{ rows, emptyText: t('linkUpdate.preview.empty') }],
    continueLabel: t('linkUpdate.preview.continue'),
    cancelLabel: t('dialog.cancel'),
  });
}

// 4T-0346: Ergebnis-Bericht aus dem file:rename-Ergebnis (umbenannt, angepasst,
// fehlgeschlagen).
function showLinkUpdateReport(result) {
  const lu = result.linkUpdate || { updated: [], failed: [] };
  const renamedRows = (result.renamed || [result.path]).map((p) => ({
    text: linkUpdateDisplayName(p),
  }));
  const updatedRows = (lu.updated || []).map((u) => ({
    text: linkUpdateDisplayName(u.path),
    detail:
      t('linkUpdate.hits').replace('{n}', String(u.count)) +
      (isPathDirty(u.path) ? ` · ${t('linkUpdate.report.inBuffer')}` : ''),
  }));
  const failedRows = (lu.failed || []).map((f) => ({
    text: linkUpdateDisplayName(f.path),
    detail: f.error || '',
  }));
  return showLinkReportDialog({
    title: t('linkUpdate.report.title'),
    sections: [
      {
        title: t('linkUpdate.report.renamed'),
        rows: renamedRows,
        emptyText: t('linkUpdate.report.empty'),
      },
      {
        title: t('linkUpdate.report.updated'),
        rows: updatedRows,
        emptyText: t('linkUpdate.report.empty'),
      },
      {
        title: t('linkUpdate.report.failed'),
        rows: failedRows,
        emptyText: t('linkUpdate.report.empty'),
      },
    ],
    okLabel: t('dialog.ok'),
  });
}

export function renameActiveFile() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  return renameFileForTab(state.activePaneIndex, pane.activeIndex);
}

// Zentraler Nachzug nach einem Umbenennen (Broadcast erreicht alle
// Fenster): Tab-Pfade und -Titel, Per-Datei-Settings, Lesezeichen,
// Backlinks-Anmeldung; die Sitzungs-Persistenz schreibt den neuen Stand.
export async function handleFileRenamed(oldPath, newPath) {
  if (!oldPath || !newPath) return;
  let touchedActive = false;
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    let touchedPane = false;
    for (let i = 0; i < pane.tabs.length; i++) {
      const tab = pane.tabs[i];
      if (tab.path !== oldPath) continue;
      tab.path = newPath;
      tab.missing = false;
      touchedPane = true;
      if (p === state.activePaneIndex && i === pane.activeIndex) touchedActive = true;
    }
    if (touchedPane) renderTabbar(p);
  }
  // Backlinks-Owner-Registrierung folgt dem neuen Pfad (gleiche Wurzel;
  // die Paar-Buchung request/release muss den neuen Namen kennen).
  if (state.backlinks && Array.isArray(state.backlinks.currentFileByPane)) {
    for (let p = 0; p < state.backlinks.currentFileByPane.length; p++) {
      if (state.backlinks.currentFileByPane[p] === oldPath) {
        state.backlinks.currentFileByPane[p] = newPath;
      }
    }
  }
  try {
    await updateBookmarkPathsForRename(oldPath, newPath);
  } catch {
    /* Lesezeichen-Nachzug scheitert nicht hart */
  }
  noteBookmarkFileExistence(newPath, true);
  if (touchedActive) updateWindowTitle();
  invalidatePaneRenderCache();
  // 4T-0341: Breadcrumb und Unterseiten-Sektion folgen dem neuen Namen.
  for (let p = 0; p < state.panes.length; p++) {
    updateSubpageBreadcrumb(p);
    if (state.subpages && state.subpages.visibleByPane[p]) scheduleSubpagesRender(p);
    // 4T-0585 (Epic 3E-0108): Titelzeile zeigt den neuen Namen.
    updateTitleLineForPane(p);
  }
  persistState();
}

// 4T-0345 (Epic 3E-0062): angewendetes Link-Update im Renderer nachziehen.
// Nicht-dirty Tabs auf angepasste Pfade laden den vom Main bereits gefixten
// Disk-Stand nach; dirty Tabs erhalten den Fix auf ihrem Buffer-Stand als eine
// Undo-Transaktion und bleiben dirty. Der Buffer wird frisch geparst, damit
// eigene ungespeicherte Link-Aenderungen keine Positions-Verschiebung erzeugen.
// Jedes Fenster verarbeitet den Broadcast selbst (Mehrfach-Instanzen).
export async function handleLinkUpdateApplied(payload) {
  if (!payload || !Array.isArray(payload.renames)) return;
  const renames = payload.renames;
  const updatedPaths = new Set((payload.updated || []).map((u) => u && u.path).filter(Boolean));
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    let touchedPane = false;
    for (let i = 0; i < pane.tabs.length; i++) {
      const tab = pane.tabs[i];
      if (!tab.path || tab.manualPage || tab.systemPage) continue;
      const isActive = i === pane.activeIndex;
      if (tab.dirty) {
        // Buffer-Fix: frisch parsen, ganzes Dokument in einem Dispatch (= eine
        // Undo-Einheit). Der Editor-Update-Listener zieht tab.content und den
        // Dirty-Stand nach (Fix ist ungespeichert, Tab bleibt dirty).
        const res = computeLinkRewrites(tab.content, { renames, contextPath: tab.path });
        if (!res.changed) continue;
        const view = paneEditors[p];
        if (isActive && view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: res.newContent },
            // Eigene Undo-Einheit: ein Strg+Z nimmt nur den Link-Fix zurueck,
            // ohne die vorherige Nutzer-Eingabe mit rueckgaengig zu machen.
            annotations: isolateHistory.of('full'),
          });
        } else {
          // Nicht sichtbarer Tab: nur den Buffer aktualisieren; der Doc-Aufbau
          // beim Aktivieren (syncEditorForPane) nutzt tab.content.
          tab.content = res.newContent;
        }
        touchedPane = true;
      } else if (updatedPaths.has(tab.path)) {
        // Nicht-dirty: den vom Main gefixten Disk-Stand nachladen (kein Dialog,
        // da nicht dirty).
        try {
          const data = await api.readFile(tab.path);
          if (data && data.ok) {
            tab.content = data.content;
            tab.originalContent = data.content;
            tab.dirty = false;
            if (isActive) {
              invalidatePaneRenderCache();
              renderPaneContent(p);
            }
            touchedPane = true;
          }
        } catch {
          /* Lesefehler: Tab unveraendert lassen */
        }
      }
    }
    if (touchedPane) renderTabbar(p);
  }
}

// --- Unterseiten-Breadcrumb (4T-0341, Epic 3E-0061) ---------------------------
// Zeigt ueber dem Dokument die Eltern-Kette der aktiven Unterseite mit
// klickbaren Segmenten. Zwei Instanzen pro Pane (Render- und Source-Pane);
// data-host steuert den Ansichts-Modus: 'rendered' fuer Reading/Geteilt,
// 'source' fuer Live. Normale Seiten, Handbuch-/System-Tabs und der reine
// Quelltext-Modus bleiben ohne Breadcrumb. Portable- und PDF-Export sind
// nicht betroffen (Element liegt ausserhalb des markdown-body; Print-CSS
// blendet zusaetzlich aus). Nicht aufloesbare Zwischen-Ebenen erscheinen
// gekennzeichnet und sind nicht klickbar (Stil analog gebrochener Links).
const subpageBreadcrumbTokens = [0, 0];

export async function updateSubpageBreadcrumb(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.subpageBreadcrumbs || els.subpageBreadcrumbs.length === 0) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const token = ++subpageBreadcrumbTokens[paneIdx];
  const hideAll = () => {
    for (const el of els.subpageBreadcrumbs) {
      el.hidden = true;
      el.innerHTML = '';
    }
  };
  const base =
    tab && tab.path && !tab.manualPage && !tab.systemPage
      ? api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, '')
      : '';
  if (!base || !isSubpageBasename(base)) {
    hideAll();
    return;
  }
  // Eltern-Kette aufloesen: erst die Datei im eigenen Ordner (Konvention),
  // dann eindeutiger Index-Treffer; sonst als fehlend kennzeichnen.
  const resolvedChain = [];
  for (const ancestor of parentChain(base)) {
    let target = null;
    try {
      const cand = await api.resolveLink(tab.path, ancestor + '.md');
      if (cand && (await api.fileExists(cand))) {
        target = cand;
      } else {
        const idx = await api.resolveWikiTargetInIndex(tab.path, toLogicalName(ancestor));
        if (idx && idx.status === 'ready' && idx.candidates.length === 1) {
          target = idx.candidates[0];
        }
      }
    } catch {
      /* unaufloesbar — als fehlend kennzeichnen */
    }
    resolvedChain.push({ ancestor, target });
  }
  // Async-Race: Tab koennte inzwischen gewechselt haben.
  if (token !== subpageBreadcrumbTokens[paneIdx]) return;
  const buildInto = (el) => {
    el.innerHTML = '';
    const addSep = () => {
      const sep = document.createElement('span');
      sep.className = 'subpage-crumb-sep';
      sep.textContent = '/';
      el.appendChild(sep);
    };
    resolvedChain.forEach((item, i) => {
      if (i > 0) addSep();
      const label = lastSegment(item.ancestor);
      if (item.target) {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'subpage-crumb';
        a.textContent = label;
        a.title = item.target;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openInPane(paneIdx, [item.target]);
        });
        el.appendChild(a);
      } else {
        const s = document.createElement('span');
        s.className = 'subpage-crumb is-missing';
        s.textContent = label;
        s.title = t('subpages.crumbMissing');
        el.appendChild(s);
      }
    });
    addSep();
    const current = document.createElement('span');
    current.className = 'subpage-crumb-current';
    current.textContent = lastSegment(base);
    el.appendChild(current);
  };
  const mode = tab.viewMode || 'rendered';
  for (const el of els.subpageBreadcrumbs) {
    const host = el.dataset.host;
    const show = host === 'rendered' ? mode === 'rendered' || mode === 'split' : mode === 'live';
    if (!show) {
      el.hidden = true;
      el.innerHTML = '';
      continue;
    }
    buildInto(el);
    el.hidden = false;
  }
}

// --- Recent-Files-Menü ------------------------------------------------------
// --- View-Modus + Toggles (alle pro Tab) ------------------------------------
export function setViewMode(mode) {
  if (!['source', 'split', 'rendered', 'live'].includes(mode)) return;
  const tab = activeTab();
  if (!tab) return;
  // 4T-0277: System-Seiten (Einstellungen) kennen keine View-Modi — das
  // Seiten-DOM ersetzt Editor und Render-Pane vollstaendig.
  if (tab.systemPage) return;
  tab.viewMode = mode;
  // Edit-Modus ist nur in Source/Split/Live sinnvoll. Beim Wechsel auf
  // "Gerendert" wird der Edit-Modus automatisch ausgeschaltet, damit der
  // Statusbar-Toggle konsistent zum sichtbaren View ist. Bei Source,
  // Split und Live (4T-0085) wird Edit-Modus NICHT automatisch
  // eingeschaltet — der User aktiviert ihn explizit via Strg+E oder
  // den Bearbeiten-Button. So bleibt Live konsistent zu Source und
  // Split (alle drei zeigen den Editor read-only, bis User editieren
  // will).
  if (mode === 'rendered' && tab.editMode) {
    tab.editMode = false;
  }
  const els = getPaneEls(state.activePaneIndex);
  els.content.classList.remove('view-source', 'view-split', 'view-rendered', 'view-live');
  els.content.classList.add(`view-${mode}`);
  // 4T-0351 (Epic 3E-0063): Beim Wechsel in einen Modus mit sichtbarem
  // Render-Pane (Gerendert/Geteilt) das Render-DOM aus dem aktuellen
  // tab.content aufbauen. syncEditorForPane synchronisiert nur den Editor;
  // ausserhalb des Split-Modus laeuft bei Quelltext-Aenderungen kein
  // schedulePreviewUpdate, das Render-Pane bliebe sonst auf dem Stand des
  // letzten Renders stehen (im reinen Quelltext-Modus eingegebene Aenderungen
  // erschienen beim Wechsel in die gerenderte Ansicht nicht). renderPaneContent
  // ruft syncEditorForPane selbst auf und ueberspringt den Voll-Render per
  // Skip-Cache, wenn sich content/Pfad/Sprache/Theme nicht geaendert haben.
  if (mode === 'rendered' || mode === 'split') {
    renderPaneContent(state.activePaneIndex);
  } else {
    syncEditorForPane(state.activePaneIndex);
  }
  syncToolbarToActiveTab();
  persistState();
  // Modus-Wechsel kann den Such-Scope aendern (Quelltext <-> Vorschau).
  refreshSearchIfVisible();
}

// 4T-0572 (Epic 3E-0105): Frontmatter-Update fuer Editor-Ansicht-Schalter als
// reine Content-Transformation. updates ist ein Objekt Frontmatter-Key →
// Boolean. Liefert den neuen Dokument-Text oder null, wenn nicht geschrieben
// werden kann (defektes YAML wird nie ueberschrieben, Muster history-status).
// writeFrontmatter legt bei frontmatter-losen Dokumenten einen Block an und
// erhaelt EOL-Stil, Kommentare und fremde Schluessel.
export function buildEditorViewFrontmatterUpdate(content, updates) {
  const source = typeof content === 'string' ? content : '';
  let fm;
  try {
    fm = extractFrontmatter(source);
  } catch {
    return null;
  }
  if (!fm || fm.parseError) return null;
  const data = { ...(fm.data || {}), ...updates };
  const result = writeFrontmatter(source, data);
  if (!result.ok || typeof result.text !== 'string') return null;
  return result.text;
}

// 4T-0572 (Epic 3E-0105, Weg A): gemeinsamer Kern der drei Editor-Ansicht-
// Toggles. Der neue Wert wird in das Frontmatter des aktiven Dokuments
// geschrieben (dokument-gebunden, portabel); die Datei wird dadurch
// aenderungsbeduerftig und ueber den normalen Speicher-Weg persistiert
// (bewusste PO-Entscheidung, konsistent mit numbered-headings). Fluechtig
// (nur Tab-Zustand, kein Frontmatter-Schreiben) bleiben Handbuch- und
// System-Tabs (read-only), fehlende Dateien sowie Unbenannt-Tabs — deren
// abweichende Werte uebernimmt saveTabAs beim ersten Speichern. Bei
// defektem Frontmatter-YAML wird nicht geschrieben (fluechtiger Toggle
// plus Statusbar-Hinweis).
function toggleEditorViewFlag(field) {
  const tab = activeTab();
  if (!tab) return false;
  const paneIdx = state.activePaneIndex;
  const newValue = !tab[field];
  tab[field] = newValue;
  const writable = !!tab.path && !tab.manualPage && !tab.systemPage && !tab.missing;
  if (writable) {
    const updated = buildEditorViewFrontmatterUpdate(tab.content, {
      [EDITOR_VIEW_FM_KEYS[field]]: newValue,
    });
    if (updated == null) {
      showStatusbarHint('statusbar.viewToggleYamlError', { duration: 2500, error: true });
    } else if (updated !== tab.content) {
      tab.content = updated;
      const wasDirty = tab.dirty;
      tab.dirty = tab.content !== tab.originalContent;
      if (wasDirty !== tab.dirty) {
        renderTabbar(paneIdx);
        updateWindowTitle();
      }
      scheduleAutoSave();
    }
  }
  syncEditorForPane(paneIdx);
  syncToolbarToActiveTab();
  return true;
}

export function toggleWrapLines() {
  if (!toggleEditorViewFlag('wrapLines')) return;
  persistState();
}

export function toggleShowLineNumbers() {
  if (!toggleEditorViewFlag('showLineNumbers')) return;
  persistState();
  refreshSearchIfVisible();
}

// 4T-0013: Gliederung (Heading-Folding-Gutter) pro Tab toggeln. Analog zu
// toggleShowLineNumbers; reconfiguriert das foldGutter-Compartment ueber
// syncEditorForPane und synchronisiert Statusbar-Button und Menue-Haken.
export function toggleShowFoldGutter() {
  if (!toggleEditorViewFlag('showFoldGutter')) return;
  reportMenuStateNow();
  persistState();
}

// Erzeugt einen leeren "Unbenannt"-Tab im aktiven Pane (Datei → Neu / Strg+N).
// Edit-Modus aktiv, View "Geteilt", damit der Nutzer sofort tippen und die
// Vorschau live sehen kann. Nicht persistiert ueber App-Neustart, weil Tabs
// ohne Pfad in buildPanesSnapshot herausgefiltert werden.
export function newUntitledTab() {
  const targetPane = state.activePaneIndex;
  const tab = createTab(null, '', {
    viewMode: 'split',
    untitledIndex: state.untitledCounter++,
  });
  tab.editMode = true;
  state.panes[targetPane].tabs.push(tab);
  activatePane(targetPane);
  activateTab(targetPane, state.panes[targetPane].tabs.length - 1);
  applyAllLayouts();
  persistState();
  const view = paneEditors[targetPane];
  if (view) setTimeout(() => view.focus(), 0);
}

// 4T-0368 (Epic 3E-0068): Unbenannt-Tabs mit Inhalt fuer den Entwurfs-
// Zwischenspeicher einsammeln. Nur echte Nutzer-Entwuerfe (kein Pfad, keine
// read-only System-/Handbuch-Seite) mit nicht-leerem Inhalt; leere Tabs bleiben
// aussen vor. `order` haelt die Pane-/Tab-Reihenfolge fuer die Wiederherstellung.
export function collectUnsavedDrafts() {
  const drafts = [];
  let order = 0;
  state.panes.forEach((p) => {
    p.tabs.forEach((tab) => {
      const isUserDraft = !tab.path && !tab.manualPage && !tab.systemPage;
      if (isUserDraft && typeof tab.content === 'string' && tab.content.trim() !== '') {
        drafts.push({
          content: tab.content,
          tabSettings: {
            viewMode: tab.viewMode,
            wrapLines: tab.wrapLines,
            showLineNumbers: tab.showLineNumbers,
            showFoldGutter: tab.showFoldGutter,
            scrollSyncEnabled: !!tab.scrollSyncEnabled,
          },
          order,
        });
      }
      order++;
    });
  });
  return drafts;
}

// 4T-0368: wiederhergestellte Entwuerfe als dirty Unbenannt-Tabs im ersten Pane
// oeffnen (PO: erste Pane). originalContent bleibt leer, damit der Tab wie ein
// nie gespeicherter Entwurf dirty ist; leert der Nutzer ihn, wird er wieder
// non-dirty und beim naechsten App-Ende verworfen.
export function openDraftsAsUntitled(drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) return;
  const pane = state.panes[0];
  if (!pane) return;
  for (const d of drafts) {
    if (!d || typeof d.content !== 'string') continue;
    const settings = d.tabSettings && typeof d.tabSettings === 'object' ? d.tabSettings : {};
    const tab = createTab(null, d.content, { ...settings, untitledIndex: state.untitledCounter++ });
    tab.originalContent = '';
    tab.dirty = true;
    tab.editMode = true;
    pane.tabs.push(tab);
  }
  if (pane.activeIndex < 0 && pane.tabs.length > 0) pane.activeIndex = pane.tabs.length - 1;
}

// --- Speichern --------------------------------------------------------------
// Speichert einen bestimmten Tab. Wenn kein Pfad vorhanden, leitet in
// saveTabAs weiter. Aktualisiert originalContent + dirty + UI bei Erfolg.
// Returnt true bei Erfolg (oder kein Speichern noetig), false bei Fehler/Abbruch.
// --- 4T-0604 (Epic 3E-0113): Zeitstempel-Automatik beim Speichern ------------

// Konfiguration aus dem Laufzeit-Zustand. Liefert null, wenn die Erweiterung
// abgeschaltet ist oder beide Felder aus sind; dann bleibt das Dokument beim
// Speichern unberührt.
function timestampConfigFromState() {
  if (!isExtensionActive('frontmatter-timestamps')) return null;
  const ts = state.frontmatterTimestamps || {};
  if (!ts.createdEnabled && !ts.updatedEnabled) return null;
  return {
    createdEnabled: ts.createdEnabled === true,
    createdField: ts.createdField || 'created',
    updatedEnabled: ts.updatedEnabled === true,
    updatedField: ts.updatedField || 'updated',
    withTime: ts.format !== 'date',
    autoCreate: ts.autoCreate === true,
  };
}

// Schreibt den gestempelten Text in Tab und Ansicht. In der aktiven Ansicht
// wird nur der Frontmatter-Kopf ersetzt (bis endOffset), damit Cursor und
// Scrollposition im Text erhalten bleiben; der Rest des Dokuments ist ohnehin
// unverändert.
function stampFrontmatterInPaneView(paneIdx, tabIdx, nextContent) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.tabs[tabIdx];
  if (!tab) return;
  const view = paneEditors[paneIdx];
  if (pane.activeIndex !== tabIdx || !view) {
    // Nicht sichtbarer Tab: nur den Puffer aktualisieren; der Doc-Aufbau beim
    // Aktivieren (syncEditorForPane) nutzt tab.content.
    tab.content = nextContent;
    return;
  }
  const beforeEnd = extractFrontmatter(getDocText(view.state.doc)).endOffset || 0;
  const afterEnd = extractFrontmatter(nextContent).endOffset || 0;
  view.dispatch({
    changes: { from: 0, to: beforeEnd, insert: nextContent.slice(0, afterEnd) },
    // Eigene Undo-Einheit: ein Strg+Z nimmt den Stempel zurück, ohne die
    // vorherige Nutzer-Eingabe mit aufzurollen.
    annotations: isolateHistory.of('full'),
  });
  tab.content = getDocText(view.state.doc);
}

// Setzt created/updated vor dem Schreiben. Ohne aktive Automatik, ohne
// Datei-Pfad oder wenn nichts zu ändern ist, passiert nichts — das Dokument
// bleibt dann byte-identisch.
async function stampTabTimestamps(paneIdx, tabIdx, tab) {
  const config = timestampConfigFromState();
  if (!config || !tab || !tab.path) return;
  let birthtimeMs = 0;
  try {
    const times = await api.getFileTimes(tab.path);
    if (times && times.birthtimeMs) birthtimeMs = times.birthtimeMs;
  } catch {
    // Ohne Dateisystem-Zeit fällt created auf den Speicherzeitpunkt zurück.
  }
  const next = applyTimestampFields(tab.content, config, { nowMs: Date.now(), birthtimeMs });
  if (next == null || next === tab.content) return;
  stampFrontmatterInPaneView(paneIdx, tabIdx, next);
}

export async function saveTab(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return false;
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  // 4T-0213: Handbuch-Tabs sind read-only — Speichern wirkt nicht (und
  // darf nicht in den Save-As-Dialog der pfadlosen Tabs durchfallen).
  // 4T-0277: System-Seiten (Einstellungen) ebenso.
  if (tab.manualPage || tab.systemPage) return false;
  if (!tab.path) return saveTabAs(paneIdx, tabIdx);
  try {
    // 4T-0604 (Epic 3E-0113): Zeitstempel-Felder vor dem Schreiben setzen; der
    // gestempelte Text ist damit sowohl der gespeicherte als auch der im Tab
    // gehaltene Stand (originalContent unten zieht ihn als sauber nach).
    await stampTabTimestamps(paneIdx, tabIdx, tab);
    // W-02 (4T-0309): {ok,error}-Vertrag — Schreibfehler ueber den vorhandenen
    // catch (showSaveError) statt frueherer IPC-Exception.
    const res = await api.saveFile(tab.path, tab.content);
    if (!res || !res.ok) throw new Error((res && res.error) || 'save failed');
    tab.originalContent = tab.content;
    // R4-12 (4T-0180): andere Panes koennten diese Datei als Wiki-Embed
    // zeigen — deren Render-Skip-Cache verwerfen.
    invalidatePaneRenderCache();
    if (tab.dirty) {
      tab.dirty = false;
      renderTabbar(paneIdx);
      if (paneIdx === state.activePaneIndex && tabIdx === pane.activeIndex) {
        updateWindowTitle();
      }
    }
    // 4T-0332 (Epic 3E-0060): erst mit dem Speichern kann eine .mdd
    // entstehen — Statusbar-Zustand der Historie nachziehen.
    void updateHistoryStatus();
    return true;
  } catch (err) {
    await api.showSaveError(`${tab.path}\n${(err && err.message) || String(err)}`);
    return false;
  }
}

// Speichern unter: OS-Dialog im Main, schreibt, aktualisiert Tab und
// File-Watcher. opts.suggestedName (4T-0586, Epic 3E-0108): nackter
// Dateiname als Dialog-Vorbelegung für pfadlose Tabs — der Main-Handler
// löst ihn im Bereichs-Fall gegen den Bereichs-Root auf, sonst nutzt der
// OS-Dialog seinen Standard-Ordner.
export async function saveTabAs(paneIdx, tabIdx, opts) {
  const pane = state.panes[paneIdx];
  if (!pane) return false;
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  // 4T-0213: Handbuch-Tabs sind read-only — kein Speichern unter.
  // 4T-0277: System-Seiten (Einstellungen) ebenso.
  if (tab.manualPage || tab.systemPage) return false;
  // 4T-0572 (Epic 3E-0105): Uebernahme fluechtiger Editor-Ansicht-Toggles beim
  // ersten Speichern eines Unbenannt-Tabs — Werte, die von der globalen
  // Voreinstellung abweichen, wandern ins Frontmatter der neuen Datei. Bei
  // defektem Frontmatter-YAML im Entwurf entfaellt die Uebernahme still.
  let contentToSave = tab.content;
  let contentTakenOver = false;
  if (!tab.path) {
    const defaults = getEditorViewDefaults();
    const overrides = {};
    for (const [field, fmKey] of Object.entries(EDITOR_VIEW_FM_KEYS)) {
      if (!!tab[field] !== defaults[field]) overrides[fmKey] = !!tab[field];
    }
    if (Object.keys(overrides).length > 0) {
      const updated = buildEditorViewFrontmatterUpdate(contentToSave, overrides);
      if (updated != null && updated !== contentToSave) {
        contentToSave = updated;
        contentTakenOver = true;
      }
    }
  }
  // 4T-0604 (Epic 3E-0113): Zeitstempel-Felder auch beim Speichern unter. Der
  // Zielpfad steht erst nach dem Dialog fest, es gibt hier also keine
  // birthtime; created fällt auf den Speicherzeitpunkt zurück, was für die neu
  // entstehende Datei der richtige Wert ist.
  const timestampConfig = timestampConfigFromState();
  if (timestampConfig) {
    const stamped = applyTimestampFields(contentToSave, timestampConfig, {
      nowMs: Date.now(),
      birthtimeMs: 0,
    });
    if (stamped != null && stamped !== contentToSave) {
      contentToSave = stamped;
      contentTakenOver = true;
    }
  }
  try {
    const result = await api.saveFileAs(
      tab.path || (opts && opts.suggestedName) || null,
      contentToSave,
    );
    // W-03 (4T-0309): {ok, canceled, error}-Vertrag. Abbruch: still false.
    // Schreibfehler: ueber den catch (showSaveError).
    if (!result || !result.ok) {
      if (result && result.error) throw new Error(result.error);
      return false;
    }
    const oldPath = tab.path;
    tab.path = result.path;
    if (contentTakenOver) tab.content = contentToSave;
    tab.originalContent = tab.content;
    tab.dirty = false;
    // R4-12 (4T-0180): wie in saveTab — Embed-Frische anderer Panes.
    invalidatePaneRenderCache();
    if (oldPath && oldPath !== result.path) {
      // M-14 (4T-0170): Nur entwatchen, wenn kein anderer Tab denselben
      // alten Pfad noch offen hat (Check analog closeTab). Der eigene Tab
      // traegt bereits den neuen Pfad und matcht nicht mehr.
      const stillElsewhere = state.panes.some((p) => p.tabs.some((tb) => tb.path === oldPath));
      if (!stillElsewhere) api.unwatchFile(oldPath);
    }
    // Watcher fuer neuen Pfad registrieren (kleiner Round-Trip ueber file:read;
    // der zurueckgegebene Inhalt ist exakt das, was wir gerade geschrieben
    // haben, wir verwerfen ihn).
    try {
      await api.readFile(result.path);
    } catch {
      /* nur Watcher-Registrierung, Lesefehler hier irrelevant */
    }
    renderTabbar(paneIdx);
    // 4T-0585 (Epic 3E-0108): Titelzeile zeigt den neuen Dateinamen (der
    // Tab kann vorher pfadlos gewesen sein — Unbenannt-Platzhalter).
    if (tabIdx === pane.activeIndex) updateTitleLineForPane(paneIdx);
    // 4T-0572: uebernommene Editor-Ansicht-Flags in den Editor spiegeln
    // (nur wenn dieser Tab im Pane aktiv ist; sonst zieht activateTab nach).
    if (contentTakenOver && tabIdx === pane.activeIndex) {
      syncEditorForPane(paneIdx);
    }
    if (paneIdx === state.activePaneIndex && tabIdx === pane.activeIndex) {
      updateWindowTitle();
    }
    persistState();
    // R4-11 (4T-0170): Save-As auf einen bereits offenen Pfad wuerde sonst
    // Duplikat-Tabs hinterlassen (reloadFile/markFileMissing erreichen nur
    // den ersten). Der soeben gespeicherte Tab uebernimmt; andere Tabs mit
    // demselben Pfad werden geschlossen. skipDirtyCheck ist hier bewusst:
    // deren Buffer-Basis ist durch das Ueberschreiben der Datei ueberholt,
    // und die massgebliche Nutzer-Aktion ist der gerade bestaetigte Save-As.
    let dup = null;
    do {
      dup = null;
      for (let p = 0; p < state.panes.length && !dup; p++) {
        const ti = state.panes[p].tabs.findIndex((tb) => tb !== tab && tb.path === result.path);
        if (ti >= 0) dup = { paneIdx: p, tabIdx: ti };
      }
      if (dup) await closeTab(dup.paneIdx, dup.tabIdx, { skipDirtyCheck: true });
    } while (dup);
    return true;
  } catch (err) {
    await api.showSaveError((err && err.message) || String(err));
    return false;
  }
}

export function saveCurrentTab() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return Promise.resolve(false);
  return saveTab(state.activePaneIndex, pane.activeIndex);
}

export function saveCurrentTabAs() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return Promise.resolve(false);
  return saveTabAs(state.activePaneIndex, pane.activeIndex);
}

// 4T-0041 (Epic 3E-0008): Export 'Portables Markdown...'. Konvertiert
// perspective-table-Codebloecke im aktiven Tab durch inline HTML-Tabellen und
// speichert das Ergebnis ueber den OS-Save-As-Dialog. Vorbelegung des
// Dateinamens '<basename>-portable.md'. Der aktive Tab bleibt unveraendert.
export async function exportCurrentTabAsPortable() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return false;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return false;
  try {
    // 4T-0512 (Epic 3E-0092): aktive UI-Sprache fuer die statische
    // Ereignis-Tabelle im Export.
    let portableText = api.convertMarkdownPortable(tab.content, getLanguage());
    // 4T-0435 (Epic 3E-0081): journal-nav-Fences werden im Export durch die
    // statische Perioden-Beschriftung ersetzt (ohne Anlage-Links); außerhalb
    // eines Journal-Eintrags bleibt der Fence unverändert.
    portableText = await replaceJournalNavFencesForExport(portableText, tab.path || '');
    let suggestedPath = null;
    if (tab.path) {
      // '.md'-Suffix durch '-portable.md' ersetzen, falls vorhanden;
      // sonst '-portable.md' anhaengen.
      if (/\.md$/i.test(tab.path)) {
        suggestedPath = tab.path.replace(/\.md$/i, '-portable.md');
      } else {
        suggestedPath = tab.path + '-portable.md';
      }
    }
    const result = await api.saveFileAs(suggestedPath, portableText);
    // W-03/K-05 (4T-0309): Abbruch meldet jetzt false (nicht faelschlich true);
    // Schreibfehler ueber den catch.
    if (!result || !result.ok) {
      if (result && result.error) throw new Error(result.error);
      return false;
    }
    return true;
  } catch (err) {
    await api.showSaveError((err && err.message) || String(err));
    return false;
  }
}

// --- PDF-Export (4T-0303, Epic 3E-0054) --------------------------------------
// Variante B+: statt einzelne Container-Selektoren im Print-CSS zu
// ueberschreiben (Spezifitaets-Falle aus 4T-0024), werden die CSS-Custom-
// Properties am Wurzel-Element per JS auf die Light-Werte gesetzt und
// data-theme fuer die Print-Dauer auf 'light' gezwungen. Damit folgen ALLE
// theme-abhaengigen Container automatisch dem Light-Schema (inkl. der
// data-theme-praefixierten hljs- und Dark-Bloecke). Mermaid wird im
// Light-Theme neu gerendert; im finally wird alles zurueckgestellt.
//
// Werte-Satz (4T-0465, Epic 3E-0086, Export-Option 2): die Farben des aktiven
// HELL-Schemas, geliefert von pdfColorOverrides() (Farbschema-Modul). Ohne
// eigenes Schema sind das exakt die :root-Light-Werte aus styles.css; ein
// eigenes Hell-Schema wird farbtreu gedruckt, der Druck bleibt stets hell (nie
// das dunkle Schema). Die --syntax-*-Variablen fehlen bewusst: sie wirken nur
// im CodeMirror-Editor, der im Print versteckt ist.

// Reentranz-Schutz: Menuepunkt und Kuerzel duerfen waehrend eines laufenden
// Exports keinen zweiten Lauf starten (der Print-Zustand ist global).
let pdfExportRunning = false;

// Zwei rAF-Ticks plus kurzer Timeout: Print-Klassen, Variablen-Override und
// Mermaid-DOM-Tausch muessen im Layout angekommen sein, bevor printToPDF
// den Frame rastert (Reflow-Wait aus 4T-0024, rAF-basiert statt fix 50 ms).
function waitForReflow() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 50));
    });
  });
}

// Exportiert den gerenderten Inhalt des aktiven Tabs als PDF. Ablauf:
// Zielpfad-Dialog ZUERST (das Fenster steht dabei noch im Normal-Layout),
// dann Modus-/Theme-Vorbereitung, Druck im Main (pdf:print liest die
// Export-Einstellungen aus dem Store), Feedback in der Statusbar, im
// finally vollstaendige Ruecknahme. Returnt true bei geschriebener Datei.
export async function exportActiveTabAsPdf() {
  const paneIdx = state.activePaneIndex;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return false;
  const tab = pane.tabs[pane.activeIndex];
  // Einstellungs-Tab (System-Seite) ist vom Export ausgenommen (Menuepunkt
  // ist deaktiviert; der Guard deckt den Kuerzel-Pfad ab). Handbuch-Tabs
  // sind bewusst exportierbar.
  if (!tab || tab.systemPage) return false;
  if (pdfExportRunning) return false;
  pdfExportRunning = true;

  const els = getPaneEls(paneIdx);
  const root = document.documentElement;
  const savedViewMode = tab.viewMode;
  const savedTheme = root.getAttribute('data-theme') || '';
  const savedVars = {};
  let printStateApplied = false;
  let modeChanged = false;
  // 4T-0311: der Export folgt der aktiven Ansicht — die Quelltext-Ansicht
  // druckt den Quelltext (dedizierter Print-Block, CodeMirror ist wegen
  // Virtualisierung nicht druckbar); alle anderen Modi drucken gerendert.
  const sourceExport = tab.viewMode === 'source';
  let sourcePrintEl = null;
  try {
    // 1. Zielpfad: Tab mit Pfad -> <basename>.pdf im selben Ordner;
    //    pfadloser Tab (Unbenannt, Handbuch) -> Anzeigename im Home-
    //    Verzeichnis (Aufloesung im Main). Abbruch: still, kein Hinweis.
    let suggestedPath = null;
    let suggestedName = null;
    if (tab.path) {
      suggestedPath = tab.path.replace(/\.(md|markdown|mdown|mkd)$/i, '') + '.pdf';
    } else {
      const base = tabDisplayName(tab)
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
      if (base) suggestedName = `${base}.pdf`;
    }
    const target = await withDialog(() =>
      api.choosePdfExportTarget({ suggestedPath, suggestedName }),
    );
    if (!target || !target.ok || !target.path) return false;

    // 2. Inhalt: Quelltext-Ansicht baut den Print-Block aus dem
    //    Dokumenttext auf (Zeilennummern gemaess Tab-Toggle, 4T-0311);
    //    Geteilt und Live schalten temporaer auf 'rendered' (befuellt das
    //    Render-Pane frisch, falls der Inhalt seit dem letzten Render
    //    geaendert wurde); der Modus wird im finally wiederhergestellt.
    if (sourceExport) {
      sourcePrintEl = buildPdfSourcePrintElement(tab.content, {
        showLineNumbers: !!tab.showLineNumbers,
      });
      els.content.appendChild(sourcePrintEl);
      document.body.classList.add('printing-source');
    } else if (tab.viewMode !== 'rendered') {
      modeChanged = true;
      tab.viewMode = 'rendered';
      els.content.classList.remove('view-source', 'view-split', 'view-rendered', 'view-live');
      els.content.classList.add('view-rendered');
      renderPaneContent(paneIdx);
    }

    // 3. Theme fuer die Print-Dauer auf Light zwingen (B+). Gilt auch fuer
    //    den Quelltext-Druck (hljs-Farben haengen an data-theme).
    for (const [key, value] of Object.entries(pdfColorOverrides())) {
      savedVars[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, value);
    }
    root.setAttribute('data-theme', 'light');
    root.classList.add('printing');
    document.body.classList.add('printing');
    printStateApplied = true;

    // 4. Mermaid: erst laufende Renders abwarten (Queue-Barriere), dann
    //    alle Bloecke im Light-Theme neu rendern; danach Reflow-Wait.
    //    Beim Quelltext-Druck entfaellt Mermaid (kein gerendertes DOM im
    //    Druckbild; die versteckten Panes bleiben unangetastet).
    if (!sourceExport) {
      await waitForMermaidIdle();
      await rerenderAllMermaidBlocks();
      // 4T-0355: Abfrage-Listen fertig befüllen lassen, sonst druckt der
      // Export den leeren Platzhalter statt der Datei-Liste.
      await waitForFrontmatterQueriesIdle();
      // 4T-0435 (Epic 3E-0081): Journal-Navigation fertig befüllen lassen
      // (der Export druckt die Perioden-Beschriftung statt des Platzhalters).
      await waitForJournalNavIdle();
      // 4T-0412 (Epic 3E-0078): Skript-Blöcke fertig ausführen lassen
      // (Ergebnis, Fehler oder Timeout), bevor der Export druckt.
      await waitForPerspectiveScriptsIdle();
    }
    await waitForReflow();

    // 5. Druck im Main (printToPDF mit den Export-Einstellungen).
    const result = await api.printPdfToFile(target.path);
    if (result && result.ok) {
      showStatusbarHint('pdf.statusOk', { duration: 1500 });
      return true;
    }
    showStatusbarHint('pdf.statusError', {
      duration: 3000,
      error: true,
      text: t('pdf.statusError').replace('{error}', (result && result.error) || ''),
    });
    return false;
  } catch (err) {
    showStatusbarHint('pdf.statusError', {
      duration: 3000,
      error: true,
      text: t('pdf.statusError').replace('{error}', (err && err.message) || String(err)),
    });
    return false;
  } finally {
    // Vollstaendige Ruecknahme in umgekehrter Reihenfolge; laeuft auch bei
    // Abbruch im Dialog (dann ohne Print-Zustand) und bei Fehlern.
    if (sourcePrintEl) {
      sourcePrintEl.remove();
      document.body.classList.remove('printing-source');
    }
    if (printStateApplied) {
      document.body.classList.remove('printing');
      root.classList.remove('printing');
      for (const [key, value] of Object.entries(savedVars)) {
        if (value) root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      }
      if (savedTheme) root.setAttribute('data-theme', savedTheme);
      else root.removeAttribute('data-theme');
    }
    if (modeChanged) {
      tab.viewMode = savedViewMode;
      els.content.classList.remove('view-source', 'view-split', 'view-rendered', 'view-live');
      els.content.classList.add(`view-${savedViewMode}`);
      syncEditorForPane(paneIdx);
      syncToolbarToActiveTab();
    }
    // Mermaid zurueck ins aktive Theme (No-op, wenn das Theme Light war
    // und die Cache-Treffer greifen; beim Quelltext-Druck lief kein
    // Light-Re-Render).
    if (printStateApplied && savedTheme !== 'light' && !sourceExport) {
      await rerenderAllMermaidBlocks();
    }
    pdfExportRunning = false;
  }
}

// --- Auto-Save (opt-in) ----------------------------------------------------
// Aktiviert per Toggle im Datei-Menue. Speichert nach 2 s Inaktivitaet (per
// scheduleAutoSave aus dem EditorView-Update-Listener) und bei Fenster-
// Fokusverlust alle dirtigen Tabs, die einen Pfad haben. Tabs ohne Pfad
// ("Unbenannt") werden nicht automatisch gespeichert.

// W-20/K-05 (4T-0309): Zentraler Persist-Helfer. Ein Store-Schreibfehler
// (api.setSetting kann rejecten) darf nicht still verpuffen — sonst wirkt die
// Aenderung im Speicher weiter und geht beim Neustart kommentarlos verloren.
// Gibt true/false zurueck und zeigt bei Fehler einen Statusbar-Hinweis.
export async function persistSetting(key, value) {
  try {
    await api.setSetting(key, value);
    return true;
  } catch (err) {
    console.warn('setSetting fehlgeschlagen:', key, err);
    showStatusbarHint('statusbar.persistFailed', { duration: 2500, error: true });
    return false;
  }
}

export function showStatusbarHint(messageKey, opts = {}) {
  if (!statusbarHint) return;
  const { error = false, duration = 1000, text } = opts;
  statusbarHint.textContent = text != null ? text : t(messageKey);
  statusbarHint.classList.toggle('error', error);
  statusbarHint.classList.add('visible');
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    statusbarHint.classList.remove('visible');
    hintTimer = null;
  }, duration);
}

export function scheduleAutoSave() {
  if (!state.autoSave) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    performAutoSave();
  }, 2000);
}

export async function performAutoSave() {
  if (!state.autoSave) return;
  if (dialogDepth > 0) return;
  let savedAny = false;
  let failed = false;
  for (let p = 0; p < state.panes.length; p++) {
    for (let i = 0; i < state.panes[p].tabs.length; i++) {
      const tab = state.panes[p].tabs[i];
      if (!tab.dirty || !tab.path) continue;
      try {
        // 4T-0604 (Epic 3E-0113): Zeitstempel-Felder auch im Autosave-Pfad.
        await stampTabTimestamps(p, i, tab);
        // W-02 (4T-0309): {ok,error}-Vertrag — Fehler ueber den catch.
        const res = await api.saveFile(tab.path, tab.content);
        if (!res || !res.ok) throw new Error((res && res.error) || 'save failed');
        tab.originalContent = tab.content;
        tab.dirty = false;
        renderTabbar(p);
        savedAny = true;
      } catch (err) {
        console.error('Auto-Save fehlgeschlagen:', tab.path, err);
        failed = true;
      }
    }
  }
  if (savedAny) updateWindowTitle();
  if (failed) {
    showStatusbarHint('statusbar.saveFailed', { error: true, duration: 3000 });
  } else if (savedAny) {
    showStatusbarHint('statusbar.saved', { duration: 1000 });
  }
}

// Klick auf den Stift-Toggle in der Statusbar bzw. Strg+E. Im Render-Modus
// wechselt der Klick zuerst nach „Geteilt", weil Bearbeiten dort sichtbar
// werden muss; danach (oder im Source/Split-Modus) wird der Edit-Modus
// umgeschaltet. Nach Aktivierung bekommt der Editor den Tastatur-Fokus.
export function toggleEditMode() {
  const tab = activeTab();
  if (!tab) return;
  // 4T-0213: Handbuch-Tabs sind dauerhaft read-only — der Toggle bleibt
  // wirkungslos (Statusbar-Stift ist zusaetzlich deaktiviert, Strg+E und
  // Menue-Pfad laufen ebenfalls hier durch). 4T-0277: System-Seiten ebenso.
  if (tab.manualPage || tab.systemPage) return;
  if (tab.viewMode === 'rendered') {
    tab.viewMode = 'split';
    const els = getPaneEls(state.activePaneIndex);
    els.content.classList.remove('view-source', 'view-split', 'view-rendered', 'view-live');
    els.content.classList.add('view-split');
    tab.editMode = true;
  } else {
    tab.editMode = !tab.editMode;
  }
  syncEditorForPane(state.activePaneIndex);
  syncToolbarToActiveTab();
  persistState();
  refreshSearchIfVisible();
  if (tab.editMode) {
    const view = paneEditors[state.activePaneIndex];
    if (view) view.focus();
  }
}

// --- Scroll-Sync (4T-0070, Epic 3E-0012) -----------------------------------
// Synchronisiert beim Scrollen in der geteilten Ansicht (viewMode === 'split')
// die andere Pane proportional mit. Pro Tab via tab.scrollSyncEnabled
// togglebar. Anti-Loop-Schutz ueber das isSyncing-Flag pro Pane, das beim
// programmatischen Scrollen kurz gesetzt und in requestAnimationFrame
// zurueckgesetzt wird. Pro Pane unabhaengig — bei zwei Vertikal-Splits
// scrollt jede Pane mit ihrem eigenen Tab.

export const scrollSyncState = { isSyncing: [false, false] };

export function setupScrollSyncForPane(paneIdx) {
  const view = paneEditors[paneIdx];
  const els = getPaneEls(paneIdx);
  // Render-seitiger Scroll-Container ist .pane-rendered (els.renderedEl),
  // nicht das innere .markdown-body (els.renderedHtml). Letzteres ist nur
  // der Inhalt — overflow:auto sitzt auf der aeusseren Pane-Box.
  if (!view || !els || !els.renderedEl) return;
  view.scrollDOM.addEventListener('scroll', () => syncScrollFrom(paneIdx, 'source'));
  els.renderedEl.addEventListener('scroll', () => syncScrollFrom(paneIdx, 'rendered'));
}

export function syncScrollFrom(paneIdx, source) {
  if (scrollSyncState.isSyncing[paneIdx]) return;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab || !tab.scrollSyncEnabled) return;
  if (tab.viewMode !== 'split') return;
  const view = paneEditors[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!view || !els || !els.renderedEl) return;
  scrollSyncState.isSyncing[paneIdx] = true;
  try {
    if (source === 'source') syncSourceToRender(view, els.renderedEl);
    else syncRenderToSource(view, els.renderedEl);
  } catch {
    // Defensiv: bei DOM-Inkonsistenz lieber nichts tun als crashen.
  }
  requestAnimationFrame(() => {
    scrollSyncState.isSyncing[paneIdx] = false;
  });
}

// 4T-0070: Anchor-basierte Sync. Jedes Block-Open-Token traegt im Render-DOM
// ein data-source-line-Attribut (1-basierte Quell-Zeile, gesetzt vom
// sourceLineMapperPlugin im Preload). Beim Scrollen einer Pane wird die
// sichtbare Top-Zeile in der Quelle ermittelt; in der Ziel-Pane wird das
// Element gesucht, das diese Zeile (oder die naechste davor) abdeckt, und
// zum Top des Viewports gescrollt. Damit landet beim "Akzeptanzkriterien"-
// Heading tatsaechlich in beiden Panes dieselbe Stelle oben.
// R4-14 (4T-0180): Die [data-source-line]-Elemente samt geparster Zeile
// werden pro Render-DOM gecacht statt pro Scroll-Frame frisch per
// querySelectorAll + parseInt ermittelt. Invalidierung implizit: nach
// einem innerHTML-Ersatz sind die gecachten Elemente disconnected
// (Stichprobe erstes Element). Einzelne spaeter ersetzte Knoten (Mermaid
// tauscht <pre> gegen den Diagramm-Block) werden im Scan uebersprungen —
// das entspricht der frischen Query, in der der Ersatz-Knoten mangels
// data-source-line ebenfalls fehlte.
export function getSourceLineEntries(renderEl) {
  const cached = renderEl._scgLineEntries;
  if (cached && cached.length > 0 && cached[0].el.isConnected) return cached;
  const entries = [];
  for (const el of renderEl.querySelectorAll('[data-source-line]')) {
    const line = parseInt(el.dataset.sourceLine, 10);
    if (Number.isFinite(line)) entries.push({ line, el });
  }
  renderEl._scgLineEntries = entries;
  return entries;
}

export function syncSourceToRender(view, renderEl) {
  const sourceRect = view.scrollDOM.getBoundingClientRect();
  const pos = view.posAtCoords({ x: sourceRect.left + 10, y: sourceRect.top + 1 });
  if (pos == null) return;
  const line = view.state.doc.lineAt(pos).number;
  const target = findRenderElementForLine(renderEl, line);
  if (!target) return;
  const renderRect = renderEl.getBoundingClientRect();
  const elRect = target.getBoundingClientRect();
  const targetTop = elRect.top - renderRect.top + renderEl.scrollTop;
  renderEl.scrollTop = targetTop;
}

export function syncRenderToSource(view, renderEl) {
  const renderRect = renderEl.getBoundingClientRect();
  const entries = getSourceLineEntries(renderEl);
  let topEntry = null;
  for (const entry of entries) {
    if (!entry.el.isConnected) continue;
    const elRect = entry.el.getBoundingClientRect();
    if (elRect.bottom > renderRect.top + 1) {
      topEntry = entry;
      break;
    }
  }
  if (!topEntry) return;
  const line = topEntry.line;
  if (!Number.isFinite(line) || line < 1) return;
  if (line > view.state.doc.lines) return;
  const linePos = view.state.doc.line(line).from;
  const coords = view.coordsAtPos(linePos);
  if (!coords) return;
  const sourceRect = view.scrollDOM.getBoundingClientRect();
  const targetTop = coords.top - sourceRect.top + view.scrollDOM.scrollTop;
  view.scrollDOM.scrollTop = targetTop;
}

// Finde das beste Render-Element fuer eine gegebene Quell-Zeile. Strategie:
// "groesste Zeile <= line" — d.h. wir nehmen das Element, an dem der Block
// startet, der die gesuchte Zeile enthaelt. Wenn alle Elemente NACH der
// Zeile liegen (Edge-Case: ganz oben), nimm das erste.
// R4-14 (4T-0180): binaere Suche auf der gecachten, nach Dokument-
// Reihenfolge (= aufsteigender Quell-Zeile) sortierten Liste.
export function findRenderElementForLine(renderEl, line) {
  const entries = getSourceLineEntries(renderEl);
  if (entries.length === 0) return null;
  let lo = 0;
  let hi = entries.length - 1;
  let bestIdx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].line <= line) {
      bestIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Alle Elemente liegen nach der Zeile -> erstes nehmen (Edge-Case oben).
  if (bestIdx < 0) return entries[0].el;
  // Disconnected-Knoten (z.B. von Mermaid ersetzte <pre>) rueckwaerts
  // ueberspringen — wie bei der frischen Query, die sie nicht enthielte.
  for (let i = bestIdx; i >= 0; i--) {
    if (entries[i].el.isConnected) return entries[i].el;
  }
  return null;
}

export function toggleScrollSyncForActiveTab() {
  const tab = activeTab();
  if (!tab) return;
  tab.scrollSyncEnabled = !tab.scrollSyncEnabled;
  updateScrollSyncButton();
  reportMenuStateNow();
  persistState();
}

export function updateScrollSyncButton() {
  const btn = document.getElementById('btn-scroll-sync');
  if (!btn) return;
  const tab = activeTab();
  const enabled = !!(tab && tab.scrollSyncEnabled);
  btn.classList.toggle('active', enabled);
  btn.disabled = !tab;
  const titleKey = enabled ? 'statusbar.scrollSync.on' : 'statusbar.scrollSync.off';
  btn.setAttribute('data-i18n-title', titleKey);
  btn.title = t(titleKey);
}

// --- Empty-State ------------------------------------------------------------
// 4T-0075 (Epic 3E-0013): isAllEmpty als zentrale Helper-Funktion. Wird nicht
// nur vom Empty-State selbst, sondern auch von den Sidebar-Sichtbarkeits-
// Funktionen genutzt, um im Empty-State alle Sektionen ausser Bookmarks
// zwangsweise auszublenden (sie ergeben ohne Tab eh keinen Sinn).
export function isAllEmpty() {
  return state.panes.length === 1 && state.panes[0].tabs.length === 0;
}

export function updateEmptyState() {
  const allEmpty = isAllEmpty();
  if (allEmpty) {
    emptyState.classList.remove('hidden');
    // 4T-0075: Wenn die Lesezeichen-Sektion etwas zu zeigen hat, bleibt der
    // Pane-Container sichtbar, damit die Sidebar sie anzeigen kann. Der
    // Empty-State-Block (mit Oeffnen-Button) liegt als pointer-events-loses
    // Overlay ueber dem Pane-Container und laesst Klicks auf die Sidebar
    // durch. Tabbar, Source-Pane, Render-Pane und der innere Splitter werden
    // ueber die Klasse .is-empty-with-bookmarks per CSS ausgeblendet, damit
    // nur Sidebar und Statusbar uebrig bleiben.
    // 4T-0327 (Epic 3E-0059): gleiche Mechanik fuer die leere Bereichs-App —
    // das Bereichs-Panel ist dort der Einstieg (erste Datei waehlen).
    // 4T-0330 (PO-Testbefund): beides haengt an den Panel-SCHALTERN, nicht
    // mehr an der blossen Existenz — ausgeschaltete Panels blenden die
    // Sidebar im Empty-State aus.
    const hasBookmarks =
      state.bookmarks && Array.isArray(state.bookmarks.tree) && state.bookmarks.tree.length > 0;
    const bookmarksWanted =
      hasBookmarks && !!(state.bookmarks.visibleByPane[0] || state.bookmarks.visibleByPane[1]);
    const areaWanted = !!state.areaPath && (areaPanelVisiblePref(0) || areaPanelVisiblePref(1));
    // 4T-0527 (PO-Testbefund 2026-07-11): das Erinnerungs-Panel ist bereichs-
    // weit und soll im geoeffneten Bereich auch ohne offene Datei sichtbar
    // bleiben (Muster Bereichs-Panel). Nur bei aktiver Erweiterung.
    const remindersWanted =
      !!state.areaPath &&
      isExtensionActive('reminders') &&
      isExtensionActive('tasks') &&
      !!(state.reminders && (state.reminders.visibleByPane[0] || state.reminders.visibleByPane[1]));
    // 4T-0372 (Epic 3E-0069): die Uhr zeigt nichts Dokument- oder Bereichs-
    // Gebundenes und bleibt deshalb auch ohne offene Datei und ohne Bereich
    // sichtbar, sofern der Nutzer sie eingeschaltet hat.
    const clockWanted =
      isExtensionActive('clock') &&
      !!(state.clock && (state.clock.visibleByPane[0] || state.clock.visibleByPane[1]));
    if (bookmarksWanted || areaWanted || remindersWanted || clockWanted) {
      panesContainer.style.visibility = '';
      paneRoots[0].classList.add('is-empty-with-bookmarks');
      if (paneRoots[1]) paneRoots[1].classList.add('is-empty-with-bookmarks');
      applyBookmarksVisibility(0);
    } else {
      panesContainer.style.visibility = 'hidden';
      paneRoots[0].classList.remove('is-empty-with-bookmarks');
      if (paneRoots[1]) paneRoots[1].classList.remove('is-empty-with-bookmarks');
    }
  } else {
    emptyState.classList.add('hidden');
    panesContainer.style.visibility = '';
    paneRoots[0].classList.remove('is-empty-with-bookmarks');
    if (paneRoots[1]) paneRoots[1].classList.remove('is-empty-with-bookmarks');
  }
}

// --- Persistenz -------------------------------------------------------------
// Schickt den aktuellen Pane-Stand an den Main-Prozess. Main fuehrt die
// Multi-Window-Persistenz pro Fenster zusammen und schreibt sie in die Settings.
// 4T-0572 (Epic 3E-0105): die fruehere Per-Datei-Persistenz der drei Editor-
// Ansicht-Schalter (Store-Key 'app.fileSettings', R4-13) ist ersatzlos
// abgeloest — die Werte leben dokument-gebunden im Frontmatter.
export function persistState() {
  const snapshot = buildPanesSnapshot();
  api.reportPanes(snapshot);
}

export function buildPanesSnapshot() {
  // Unbenannt-Tabs (ohne Pfad) gehen NICHT in die persistierte Sitzung.
  // Dirty-Unbenannt werden vorher vom Schliessen-Dialog abgefangen
  // (Speichern → Pfad bekommen oder Verwerfen). Hier herausfiltern und
  // activeIndex auf die verbleibenden Tabs umrechnen.
  return state.panes.map((p) => {
    const indices = [];
    p.tabs.forEach((tab, i) => {
      if (tab.path) indices.push(i);
    });
    let activeIndex = -1;
    if (indices.length > 0) {
      const pos = indices.indexOf(p.activeIndex);
      activeIndex = pos >= 0 ? pos : 0;
    }
    // 4T-0459 (Epic 3E-0085): Gruppen additiv persistieren — auf den
    // GEFILTERTEN Indizes ausgedrueckt (Gruppen, deren Mitglieder alle
    // pfadlos sind, entfallen). Gruppen-freie Sitzungen erzeugen exakt
    // das bisherige Schema (kein groups-Feld, kein group-Eintrag).
    const { groups, groupOf } = buildGroupsSnapshot(p, indices);
    return {
      paths: indices.map((i) => p.tabs[i].path),
      activeIndex,
      tabSettings: indices.map((i, j) => ({
        viewMode: p.tabs[i].viewMode,
        wrapLines: p.tabs[i].wrapLines,
        showLineNumbers: p.tabs[i].showLineNumbers,
        showFoldGutter: p.tabs[i].showFoldGutter,
        // 4T-0070: Scroll-Synchronisation pro Tab in der Session erhalten.
        scrollSyncEnabled: !!p.tabs[i].scrollSyncEnabled,
        ...(groupOf[j] >= 0 ? { group: groupOf[j] } : {}),
      })),
      ...(groups.length > 0 ? { groups } : {}),
    };
  });
}
