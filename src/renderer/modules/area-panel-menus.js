// 4T-1365 (Epic 3E-0171): Kontextmenues des Bereichs-Panels — die panel-weiten
// Eintraege (Bereichs-Graph, Bereichs-Statistik) und das Menue einer
// Datei-Zeile (Start-Seite, Bereichs-Lesezeichen, dazu dieselben panel-weiten
// Eintraege).
//
// Ausgezogen aus area-panel.js, das an seinem Groessen-Budget stand: Die
// Menues sind eine eigene Verantwortlichkeit — sie beantworten, WELCHE
// Handlungen an einer Stelle des Panels angeboten werden, waehrend area-panel.js
// den Ordnerbaum und die Dateiliste DARSTELLT. Der Schnitt folgt damit der
// Verantwortlichkeit; die Zeilenzahl war sein Anlass, nicht sein Kriterium
// (Datei-Groessen-Budget, Konzept "Test-Strategie und Qualitaetssicherung",
// Kapitel 9).
//
// Die Abhaengigkeit laeuft nur in eine Richtung: area-panel.js ruft hierher.
// Was dieses Modul vom Panel braucht — den Neuaufbau nach einer Aenderung —
// reicht der Aufrufer als Rueckruf herein, statt dass hier zurueckimportiert
// wuerde (kein Zyklus, Entwicklungsrichtlinien zum Modul-Schnitt).
//
// Eigener Zustand: keiner.
'use strict';

import { t } from '../i18n.js';
import { state } from './app/app-state.js';
import { openAreaGraphTab } from './graph/graph-tab.js';
import { openAreaStatsPage } from './area-stats-page.js';
import { hideContextMenu, placeContextMenuAt } from './dialogs/context-menu-utils.js';
import { isExtensionActive } from './extensions/extension-lifecycle.js';
import { addAreaBookmarkForPath } from './bookmarks/bookmarks-actions.js';
import { appendStartPageItem, startSeiteVerfuegbar } from './area-start-page.js';

// Trenner-Element; seit 4T-1365 an drei Stellen gebraucht.
function appendSeparator(menu) {
  const sep = document.createElement('div');
  sep.className = 'context-menu-separator';
  menu.appendChild(sep);
}

// 4T-0455 (Epic 3E-0084): panel-weite Eintraege — der Einstieg zum
// Bereichs-Graph. Ausgelagert, weil sie sowohl auf freier Panel-Flaeche als
// auch auf Datei-Zeilen erreichbar bleiben muessen.
// 4T-0620 (Epic 3E-0117): seither zwei unabhaengige Einstiege — Bereichs-Graph
// und Bereichs-Statistik — mit je eigener Erweiterung. Das Menue erscheint,
// sobald MINDESTENS EINE der beiden aktiv ist, und zeigt genau die aktiven.
function areaPanelEntries() {
  if (!state.areaPath) return [];
  const entries = [];
  if (isExtensionActive('graph-view')) {
    entries.push({
      id: 'area-panel-graph',
      labelKey: 'menu.view.areaGraph',
      run: openAreaGraphTab,
    });
  }
  if (isExtensionActive('area-stats')) {
    entries.push({
      id: 'area-panel-stats',
      labelKey: 'menu.view.areaStats',
      run: openAreaStatsPage,
    });
  }
  return entries;
}

function areaPanelItemsAvailable() {
  return areaPanelEntries().length > 0;
}

// Haengt die panel-weiten Eintraege an ein Kontextmenue an (No-op ohne Bereich
// oder mit beiden Erweiterungen im Aus-Zustand).
function appendAreaPanelItems(menu) {
  for (const entry of areaPanelEntries()) {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    // Stabiler Anker fuer die E2E-Pruefung (Muster area-file-bookmark).
    item.dataset.menuId = entry.id;
    item.textContent = t(entry.labelKey);
    item.addEventListener('click', () => {
      hideContextMenu();
      entry.run();
    });
    menu.appendChild(item);
  }
}

/**
 * Kontextmenue einer Datei-Zeile im Bereichs-Panel.
 *
 * Zeigt EIN kombiniertes Menue: die Start-Seiten-Handlung (4T-1365, haengt an
 * keiner Erweiterung), darunter "Als Bereichs-Lesezeichen" (4T-0612, nur bei
 * aktiver Lesezeichen-Erweiterung; die Datei liegt per Definition im Bereich),
 * darunter durch Trenner abgesetzt die panel-weiten Eintraege. So bleiben die
 * Panel-Eintraege auch auf Datei-Zeilen erreichbar (Bestand vor 4T-0612; sonst
 * fing das Datei-Menue den Rechtsklick ab und verdeckte den Graph-Eintrag).
 * Traegt keine Gruppe etwas bei, uebernimmt kein Eintrag und das Ereignis
 * blubbert zum Sektions-Menue durch (dort greift dieselbe Pruefung).
 *
 * @param {MouseEvent} ev Ausloesendes Ereignis.
 * @param {string} absPath Absoluter Pfad der angeklickten Datei.
 * @param {() => void} aufRefresh Neuaufbau der sichtbaren Panels.
 */
export function showAreaFileContextMenu(ev, absPath, aufRefresh) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  const bookmarksActive = isExtensionActive('bookmarks');
  const panelAvailable = areaPanelItemsAvailable();
  const startPage = startSeiteVerfuegbar();
  if (!bookmarksActive && !panelAvailable && !startPage) return;
  ev.preventDefault();
  ev.stopPropagation();
  menu.innerHTML = '';
  if (startPage) {
    appendStartPageItem(menu, absPath, hideContextMenu, aufRefresh);
    if (bookmarksActive || panelAvailable) appendSeparator(menu);
  }
  if (bookmarksActive) {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.dataset.menuId = 'area-file-bookmark';
    item.textContent = t('bookmarks.addAsArea');
    item.addEventListener('click', () => {
      hideContextMenu();
      addAreaBookmarkForPath(absPath);
    });
    menu.appendChild(item);
  }
  // Trenner nur zwischen zwei tatsaechlich vorhandenen Gruppen (Muster der
  // uebrigen Kontextmenues, z.B. bookmarks.js).
  if (bookmarksActive && panelAvailable) appendSeparator(menu);
  appendAreaPanelItems(menu);
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

/**
 * Kontextmenue auf freier Panel-Flaeche — nur die panel-weiten Eintraege.
 *
 * @param {MouseEvent} ev Ausloesendes Ereignis.
 */
export function showAreaPanelContextMenu(ev) {
  if (!areaPanelItemsAvailable()) return;
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  ev.preventDefault();
  menu.innerHTML = '';
  appendAreaPanelItems(menu);
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}
