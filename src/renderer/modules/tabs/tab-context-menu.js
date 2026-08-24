// Kontextmenue der Reiterleiste: Verschieben und Kopieren zwischen Spalten und
// Fenstern, Umbenennen, Unterseite loesen, Lesezeichen und die Gruppen-
// Eintraege (deren Aktionen in tab-group-menu.js liegen).
// 4T-0978 (Epic 3E-0196): aus modules/dialogs/dialogs.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert).
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { contextMenu, state } from '../app/app-state.js';
// 4T-0318 (Epic 3E-0057): Ziel-Labels mit App-Kontext.
import { buildWindowTargetLabel } from '../app/window-title.js';
import {
  activateTab,
  closeTab,
  copyTabToNewWindow,
  copyTabToWindow,
  moveTabBetweenPanes,
  moveTabToNewWindow,
  moveTabToWindow,
} from './tabs.js';
// 4T-1175 (Epic 3E-0220): Feld-Formular des Dokuments oeffnen.
import { oeffneFeldFormular } from '../properties/properties-tags.js';
// 4T-0339 (Epic 3E-0061): Umbenennen aus dem Tab-Kontextmenue (Laufzeit-
// Zyklus dialogs <-> views, Muster wie panels.js).
import { detachSubpageForTab, renameFileForTab } from '../views/file-actions.js';
// 4T-0774 (Epic 3E-0128): Loesen-Eintrag nur an einer Unterseite.
import { isSubpageBasename } from '../../../shared/subpages.js';
// 4T-0766 (Epic 3E-0158): Die drei Gruppen-Eintraege beziehen sich auf die
// Mehrfach-Auswahl, sobald der angeklickte Reiter Teil von ihr ist.
import { hasMultiSelection, isTabSelected, selectedIndices } from './tab-selection.js';
// 4T-0461: Gruppen-Menuepunkte entfallen bei deaktivierter Erweiterung.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-0612 (Epic 3E-0115): Lesezeichen direkt aus dem Tab-Kontextmenue anlegen.
// 4T-0991 (Epic 3E-0196): bookmarks.js ist in den Feature-Ordner bookmarks/
// geteilt; die Anlage-Fluesse liegen in bookmarks-actions.js, die Abfrage im
// Datenmodell.
import {
  addAreaBookmarkForPath,
  addGeneralBookmarkForPath,
} from '../bookmarks/bookmarks-actions.js';
import { bookmarkTargetsForPath } from '../bookmarks/bookmarks-tree.js';
// 4T-0978: generische Menue-Helfer aus dem Dialog-Bereich.
import { appendContextMenuItem, placeContextMenuAt } from '../dialogs/context-menu-utils.js';
// 4T-0978: die Aktionen hinter den Gruppen-Eintraegen.
import {
  addTabsToGroupAction,
  newGroupWithTabs,
  removeTabsFromGroupAction,
} from './tab-group-menu.js';

// --- Kontextmenü ------------------------------------------------------------
export async function showTabContextMenu(event, paneIdx, tabIdx) {
  contextMenu.innerHTML = '';

  // 4T-0012: Fensterliste abrufen, um zu entscheiden, ob das Tab-Verschieben/
  // Kopieren als flache Eintraege (Solo) oder als Submenues (Multi) angezeigt
  // wird. Bei Fehler fallen wir auf Solo zurueck — kein Blocker.
  // 4T-0318: Selbst-Filter ueber die eindeutige Fenster-ID — displayNumber
  // ist seither app-lokal und kollidiert zwischen Applikationen.
  let otherWindows;
  try {
    const list = await api.listWindows();
    otherWindows = (Array.isArray(list) ? list : []).filter((w) => w.id !== state.windowId);
  } catch {
    otherWindows = [];
  }

  const items = [];

  if (paneIdx === 0) {
    items.push({
      key: 'tab.moveRight',
      action: () =>
        moveTabBetweenPanes(0, tabIdx, 1, state.panes[1] ? state.panes[1].tabs.length : 0),
    });
  } else {
    items.push({
      key: 'tab.moveLeft',
      action: () => moveTabBetweenPanes(paneIdx, tabIdx, 0, state.panes[0].tabs.length),
    });
  }
  items.push({ separator: true });

  if (otherWindows.length === 0) {
    // Solo-Fall: flache Eintraege wie bisher.
    items.push({ key: 'tab.moveToNewWindow', action: () => moveTabToNewWindow(paneIdx, tabIdx) });
    items.push({ key: 'tab.copyToNewWindow', action: () => copyTabToNewWindow(paneIdx, tabIdx) });
  } else {
    // Multi-Fall: Submenues mit "Neues Fenster" + einem Eintrag pro anderem Fenster.
    // 4T-0318: Ziel-Label mit App-Kontext, sobald mehrere Applikationen
    // laufen ("App 2, Fenster 1" bzw. "Bereich Notizen, Fenster 2").
    const moveSubmenu = [
      { key: 'tab.menu.targetNewWindow', action: () => moveTabToNewWindow(paneIdx, tabIdx) },
      { separator: true },
      ...otherWindows.map((w) => ({
        label: buildWindowTargetLabel(w, t),
        tooltip: buildWindowTooltip(w),
        action: () => moveTabToWindow(w.id, paneIdx, tabIdx),
      })),
    ];
    const copySubmenu = [
      { key: 'tab.menu.targetNewWindow', action: () => copyTabToNewWindow(paneIdx, tabIdx) },
      { separator: true },
      ...otherWindows.map((w) => ({
        label: buildWindowTargetLabel(w, t),
        tooltip: buildWindowTooltip(w),
        action: () => copyTabToWindow(w.id, paneIdx, tabIdx),
      })),
    ];
    items.push({ key: 'tab.menu.moveToSubmenu', submenu: moveSubmenu });
    items.push({ key: 'tab.menu.copyToSubmenu', submenu: copySubmenu });
  }

  items.push({ separator: true });
  // 4T-0339 (Epic 3E-0061): Umbenennen nur fuer Datei-Tabs (mit Pfad,
  // keine Handbuch-/System-Seiten).
  const ctxPane = state.panes[paneIdx];
  const ctxTab = ctxPane ? ctxPane.tabs[tabIdx] : null;
  if (ctxTab && ctxTab.path && !ctxTab.manualPage && !ctxTab.systemPage) {
    items.push({ key: 'tab.rename', action: () => renameFileForTab(paneIdx, tabIdx) });
    // 4T-0774 (Epic 3E-0128): Loesen nur an einer Unterseite anbieten — im
    // Kontextmenue steht die gemeinte Datei fest, anders als im Datei-Menue.
    if (isSubpageBasename(api.basename(ctxTab.path).replace(/\.(md|markdown|mdown|mkd)$/i, ''))) {
      items.push({ key: 'tab.detachSubpage', action: () => detachSubpageForTab(paneIdx, tabIdx) });
    }
    // 4T-1175 (Epic 3E-0220, E5): Feld-Formular des Dokuments. Es steht hier
    // bei den uebrigen Datei-Aktionen und macht keinen eigenen Menue-Block
    // auf (AK2) — der Struktur-Pruefschritt vom 2026-08-21 haelt genau das
    // fest. Entfaellt bei abgeschalteter Erweiterung (AK3), Muster der
    // Gruppen-Eintraege weiter unten.
    //
    // Der Eintrag meint den ANGEKLICKTEN Reiter, das Formular zeigt aber
    // immer den aktiven (AK3). Deshalb wird der Reiter zuerst aktiviert; ohne
    // das oeffnete der Eintrag das Formular eines fremden Dokuments.
    if (isExtensionActive('property-profiles')) {
      items.push({
        key: 'tab.openFieldForm',
        dataId: 'tab-field-form',
        action: () => {
          activateTab(paneIdx, tabIdx);
          void oeffneFeldFormular(paneIdx);
        },
      });
    }
  }
  // 4T-0612 (Epic 3E-0115): Lesezeichen aus dem Tab-Menue anlegen (nur Datei-
  // Tabs, nur bei aktiver Lesezeichen-Erweiterung). Der Bereichs-Eintrag
  // erscheint nur bei geoeffnetem Bereich und Datei innerhalb; bereits
  // gemerkte Ziele blenden ihren Eintrag aus.
  if (
    isExtensionActive('bookmarks') &&
    ctxTab &&
    ctxTab.path &&
    !ctxTab.manualPage &&
    !ctxTab.systemPage
  ) {
    const targets = bookmarkTargetsForPath(ctxTab.path);
    if (targets.general) {
      items.push({
        key: 'bookmarks.addAsGeneral',
        dataId: 'tab-bookmark-general',
        action: () => addGeneralBookmarkForPath(ctxTab.path),
      });
    }
    if (targets.insideArea && targets.area) {
      items.push({
        key: 'bookmarks.addAsArea',
        dataId: 'tab-bookmark-area',
        action: () => addAreaBookmarkForPath(ctxTab.path),
      });
    }
  }
  // 4T-0461 (Epic 3E-0085): Gruppen-Verwaltung — neue Gruppe, Beitritt zu
  // bestehenden Gruppen der Leiste (Untermenue), Austritt. Entfaellt bei
  // deaktivierter Erweiterung tab-groups.
  if (isExtensionActive('tab-groups') && ctxPane && ctxTab) {
    // 4T-0766 (Epic 3E-0158): Menge statt Einzel-Reiter, sobald der
    // angeklickte Reiter Teil einer Mehrfach-Auswahl ist. Die uebrigen
    // Eintraege des Menues meinen genau eine Datei und bleiben beim
    // angeklickten Reiter (Umbenennen, Lesezeichen, Fenster-Transfer).
    const menge =
      hasMultiSelection(ctxPane) && isTabSelected(ctxPane, tabIdx)
        ? selectedIndices(ctxPane)
        : [tabIdx];
    const mehrere = menge.length > 1;
    const mengenTabs = menge.map((i) => ctxPane.tabs[i]).filter(Boolean);
    items.push({ separator: true });
    items.push({
      key: mehrere ? 'tabGroup.menu.newGroupSelection' : 'tabGroup.menu.newGroup',
      dataId: 'tabgroup-new',
      action: () => newGroupWithTabs(paneIdx, menge),
    });
    // Bei einer Menge bleiben alle Gruppen der Leiste waehlbar: Sie kann aus
    // mehreren Gruppen stammen, und „schon drin" gilt dann nur fuer einen Teil.
    const otherGroups = (ctxPane.groups || []).filter((g) => mehrere || g.id !== ctxTab.groupId);
    if (otherGroups.length > 0) {
      items.push({
        key: mehrere ? 'tabGroup.menu.addToSelection' : 'tabGroup.menu.addTo',
        dataId: 'tabgroup-add',
        submenu: otherGroups.map((g) => ({
          label: g.name || t('tabGroup.unnamed'),
          action: () => addTabsToGroupAction(paneIdx, menge, g.id),
        })),
      });
    }
    if (mengenTabs.some((tb) => tb.groupId)) {
      items.push({
        key: mehrere ? 'tabGroup.menu.removeFromSelection' : 'tabGroup.menu.removeFrom',
        dataId: 'tabgroup-remove',
        action: () => removeTabsFromGroupAction(paneIdx, menge),
      });
    }
    items.push({ separator: true });
  }
  items.push({ key: 'tab.close', action: () => closeTab(paneIdx, tabIdx) });

  for (const it of items) appendContextMenuItem(contextMenu, it);

  placeContextMenuAt(contextMenu, event.clientX, event.clientY);
}

// 4T-0012: Tooltip-Text fuer einen Fenster-Eintrag im Tab-Kontextmenue:
// Dateiname des aktiven Tabs des Zielfensters, bei mehreren Tabs zusaetzlich
// "(+N weitere)" (lokalisiert).
export function buildWindowTooltip(w) {
  const name = w && w.activeTabName ? w.activeTabName : '';
  if (w && typeof w.tabCount === 'number' && w.tabCount > 1) {
    const suffix = t('tab.menu.tooltipMoreTabsSuffix').replace('{n}', String(w.tabCount - 1));
    return name ? `${name} ${suffix}` : suffix;
  }
  return name;
}
