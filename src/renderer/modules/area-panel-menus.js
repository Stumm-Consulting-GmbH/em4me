// 4T-001365 (Epic 3E-000171): Kontextmenues des Bereichs-Panels — die panel-weiten
// Eintraege (Bereichs-Graph, Bereichs-Statistik) und das Menue einer
// Datei-Zeile (Start-Seite, Bereichs-Lesezeichen, dazu dieselben panel-weiten
// Eintraege). 4T-001349 (Epic 3E-000170): dazu das Menue einer Ordner-Zeile
// (Unterordner und Markdown-Datei anlegen).
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
// 4T-001350 (Epic 3E-000170): DERSELBE Umbenennen-Weg wie das Datei-Menue,
// ueber den Pfad adressiert (Entscheidung E3 des Epics). Kein zweiter Weg und
// damit keine zweite Quelle der Verweis-Nachfuehrung.
import { renameFileAtPath } from './views/file-actions.js';
// 4T-001351 (Epic 3E-000170): Loeschen in den Papierkorb des Betriebssystems.
import { trashFileAtPath } from './views/file-trash.js';

// Trenner-Element; seit 4T-001365 an drei Stellen gebraucht.
function appendSeparator(menu) {
  const sep = document.createElement('div');
  sep.className = 'context-menu-separator';
  menu.appendChild(sep);
}

// 4T-000455 (Epic 3E-000084): panel-weite Eintraege — der Einstieg zum
// Bereichs-Graph. Ausgelagert, weil sie sowohl auf freier Panel-Flaeche als
// auch auf Datei-Zeilen erreichbar bleiben muessen.
// 4T-000620 (Epic 3E-000117): seither zwei unabhaengige Einstiege — Bereichs-Graph
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

// Einzelner Menue-Eintrag; seit 4T-001349 an drei Stellen gebraucht (die
// panel-weiten Eintraege, der Lesezeichen-Eintrag und das Ordner-Menue).
// `menuId` ist der stabile Anker fuer die E2E-Pruefung.
function appendItem(menu, menuId, label, run) {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.dataset.menuId = menuId;
  item.textContent = label;
  item.addEventListener('click', () => {
    hideContextMenu();
    run();
  });
  menu.appendChild(item);
}

// Haengt die panel-weiten Eintraege an ein Kontextmenue an (No-op ohne Bereich
// oder mit beiden Erweiterungen im Aus-Zustand).
function appendAreaPanelItems(menu) {
  for (const entry of areaPanelEntries()) {
    appendItem(menu, entry.id, t(entry.labelKey), entry.run);
  }
}

/**
 * Kontextmenue einer Datei-Zeile im Bereichs-Panel.
 *
 * Zeigt EIN kombiniertes Menue aus vier Gruppen, jede fuer sich optional und
 * durch Trenner abgesetzt: die Start-Seiten-Handlung (4T-001365, haengt an
 * keiner Erweiterung), "Als Bereichs-Lesezeichen" (4T-000612, nur bei aktiver
 * Lesezeichen-Erweiterung; die Datei liegt per Definition im Bereich), die
 * panel-weiten Eintraege und zuletzt die Datei-Verwaltung (4T-001350). So
 * bleiben die Panel-Eintraege auch auf Datei-Zeilen erreichbar (Bestand vor
 * 4T-000612; sonst fing das Datei-Menue den Rechtsklick ab und verdeckte den
 * Graph-Eintrag).
 *
 * Die Datei-Verwaltung steht bewusst ZULETZT: Sie greift in den Bestand ein,
 * waehrend die Gruppen darueber ihn nur zeigen oder merken. Ein Eintrag mit
 * Wirkung auf die Datei gehoert nicht dorthin, wo die Maus beim Oeffnen des
 * Menues ohnehin steht.
 *
 * Seit 4T-001350 traegt das Menue IMMER mindestens einen Eintrag, weil das
 * Umbenennen an keiner Erweiterung haengt; die fruehere Weiche, die bei leerem
 * Menue zum Sektions-Menue durchblubbern liess, ist damit gegenstandslos.
 *
 * @param {MouseEvent} ev Ausloesendes Ereignis.
 * @param {string} absPath Absoluter Pfad der angeklickten Datei.
 * @param {() => void} aufRefresh Neuaufbau der sichtbaren Panels.
 */
export function showAreaFileContextMenu(ev, absPath, aufRefresh) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  ev.preventDefault();
  ev.stopPropagation();
  menu.innerHTML = '';
  // Gruppen als Aufbau-Funktionen; der Trenner entsteht zwischen zwei
  // tatsaechlich vorhandenen Gruppen (Muster der uebrigen Kontextmenues).
  const gruppen = [];
  if (startSeiteVerfuegbar()) {
    gruppen.push(() => appendStartPageItem(menu, absPath, hideContextMenu, aufRefresh));
  }
  if (isExtensionActive('bookmarks')) {
    gruppen.push(() =>
      appendItem(menu, 'area-file-bookmark', t('bookmarks.addAsArea'), () =>
        addAreaBookmarkForPath(absPath),
      ),
    );
  }
  if (areaPanelItemsAvailable()) gruppen.push(() => appendAreaPanelItems(menu));
  gruppen.push(() => {
    appendItem(menu, 'area-file-rename', t('areaPanel.menuRename'), () =>
      renameFileAtPath(absPath),
    );
    appendItem(menu, 'area-file-delete', t('areaPanel.menuDelete'), () =>
      trashFileAtPath(absPath, absPath.split(/[\\/]/).pop()),
    );
  });
  gruppen.forEach((bauen, i) => {
    if (i > 0) appendSeparator(menu);
    bauen();
  });
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

/**
 * Kontextmenue einer Ordner-Zeile im Bereichs-Panel (4T-001349, Epic 3E-000170).
 *
 * Zeigt die beiden Anlage-Handlungen des angeklickten Ordners, darunter durch
 * Trenner abgesetzt die panel-weiten Eintraege — dieselbe Gruppen-Regel wie im
 * Datei-Menue, damit Graph und Statistik auch hier erreichbar bleiben.
 *
 * Die Anlage-Handlungen haengen an keiner Erweiterung: Das Anlegen im Bereich
 * gehoert zum Panel selbst und nicht zu einer zuschaltbaren Zusatz-Funktion.
 *
 * @param {MouseEvent} ev Ausloesendes Ereignis.
 * @param {string} dirPath Absoluter Pfad des angeklickten Ordners.
 * @param {{neuerOrdner: (d: string) => void, neueDatei: (d: string) => void}} aktionen
 *   Anlage-Handlungen des Panels; hereingereicht statt importiert (kein Zyklus).
 */
export function showAreaDirContextMenu(ev, dirPath, aktionen) {
  const menu = document.getElementById('context-menu');
  if (!menu || !state.areaPath || !dirPath) return;
  ev.preventDefault();
  ev.stopPropagation();
  menu.innerHTML = '';
  appendItem(menu, 'area-dir-new-folder', t('areaPanel.menuNewFolder'), () =>
    aktionen.neuerOrdner(dirPath),
  );
  appendItem(menu, 'area-dir-new-file', t('areaPanel.menuNewFile'), () =>
    aktionen.neueDatei(dirPath),
  );
  if (areaPanelItemsAvailable()) {
    appendSeparator(menu);
    appendAreaPanelItems(menu);
  }
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
