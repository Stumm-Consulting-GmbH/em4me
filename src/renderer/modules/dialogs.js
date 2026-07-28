// Tab-Kontextmenue, Ueber-Dialog und Alias-Auswahl-Dialog.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { t } from '../i18n.js';

import { api, $ } from './api.js';
import {
  aboutModal,
  aboutVersionEl,
  aliasModal,
  contextMenu,
  state,
  tabDisplayName,
} from './app-state.js';
// 4T-0318 (Epic 3E-0057): Ziel-Labels mit App-Kontext.
import { buildWindowTargetLabel } from './window-title.js';
import {
  activateTab,
  closeTab,
  copyTabToNewWindow,
  copyTabToWindow,
  moveTabBetweenPanes,
  moveTabToNewWindow,
  moveTabToWindow,
} from './tabs.js';
// 4T-0339 (Epic 3E-0061): Umbenennen aus dem Tab-Kontextmenue (Laufzeit-
// Zyklus dialogs <-> views, Muster wie panels.js).
// 4T-0461 (Epic 3E-0085): applyAllLayouts/persistState fuer die
// Gruppen-Menue-Aktionen (Render und Sitzungs-Persistenz nach Modell-Edit).
import { applyAllLayouts, persistState, renameFileForTab } from './views.js';
// 4T-0461: Gruppen-Modell-Helfer fuer Kontextmenue und Dialog.
import {
  TAB_GROUP_COLOR_KEYS,
  addTabsToGroup,
  createTabGroupFromTabs,
  dissolveGroup,
  groupById,
  nextFreeColor,
  removeTabsFromGroup,
} from './tab-groups.js';
// 4T-0766 (Epic 3E-0158): Die drei Gruppen-Eintraege beziehen sich auf die
// Mehrfach-Auswahl, sobald der angeklickte Reiter Teil von ihr ist.
import { hasMultiSelection, isTabSelected, selectedIndices } from './tab-selection.js';
// 4T-0461: Gruppen-Menuepunkte entfallen bei deaktivierter Erweiterung.
import { isExtensionActive } from './extension-lifecycle.js';
// 4T-0612 (Epic 3E-0115): Lesezeichen direkt aus dem Tab-Kontextmenue anlegen.
import {
  addAreaBookmarkForPath,
  addGeneralBookmarkForPath,
  bookmarkTargetsForPath,
} from './bookmarks.js';

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

// --- Tab-Gruppen: Kontextmenue-Aktionen und Kopf-Menue (4T-0461) --------------

// Neue-Gruppe-Fluss: Gruppe mit Standard-Name ("Gruppe n") und naechster
// freier Palette-Farbe anlegen, dann direkt den Umbenennen-Dialog oeffnen.
// Abbruch im Dialog behaelt Standard-Name und -Farbe (Gruppe bleibt).
// 4T-0766 (Epic 3E-0158): auf eine Index-Liste erweitert — bei einer Menge
// ruecken die Mitglieder an der Stelle des ersten Ausgewaehlten zusammen.
async function newGroupWithTabs(paneIdx, tabIdxList) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const defaultName = t('tabGroup.defaultName').replace(
    '{n}',
    String((pane.groups || []).length + 1),
  );
  const group = createTabGroupFromTabs(pane, tabIdxList, {
    name: defaultName,
    color: nextFreeColor(pane),
  });
  if (!group) return;
  applyAllLayouts();
  persistState();
  const result = await showTabGroupDialog({ name: group.name, color: group.color });
  if (!result) return;
  group.name = result.name;
  group.color = result.color;
  applyAllLayouts();
  persistState();
}

function addTabsToGroupAction(paneIdx, tabIdxList, groupId) {
  const pane = state.panes[paneIdx];
  if (!pane || !addTabsToGroup(pane, tabIdxList, groupId)) return;
  // 4T-0767 (Epic 3E-0158): Tritt der aktive Reiter einer zugeklappten Gruppe
  // bei, bleibt sie zu — die Sichtbarkeits-Garantie ist entfallen.
  applyAllLayouts();
  persistState();
}

function removeTabsFromGroupAction(paneIdx, tabIdxList) {
  const pane = state.panes[paneIdx];
  if (!pane || !removeTabsFromGroup(pane, tabIdxList)) return;
  applyAllLayouts();
  persistState();
}

// Kontextmenue des Gruppen-Kopfs: Umbenennen/Farbe, Aufloesen (Tabs
// bleiben offen), Schliessen (alle Mitglieder mit Dirty-Dialogen).
export function showGroupContextMenu(event, paneIdx, groupId) {
  const pane = state.panes[paneIdx];
  const group = pane ? groupById(pane, groupId) : null;
  if (!group) return;
  contextMenu.innerHTML = '';
  const items = [
    {
      key: 'tabGroup.menu.rename',
      dataId: 'tabgroup-rename',
      action: () => renameGroup(paneIdx, groupId),
    },
    { separator: true },
    {
      key: 'tabGroup.menu.dissolve',
      dataId: 'tabgroup-dissolve',
      action: () => dissolveGroupAction(paneIdx, groupId),
    },
    {
      key: 'tabGroup.menu.closeGroup',
      dataId: 'tabgroup-close',
      action: () => closeGroupTabs(paneIdx, groupId),
    },
  ];
  for (const it of items) appendContextMenuItem(contextMenu, it);
  placeContextMenuAt(contextMenu, event.clientX, event.clientY);
}

// --- Aufklapp-Menue einer zugeklappten Gruppe (4T-0768, Epic 3E-0158) --------
//
// Eine zugeklappte Gruppe verbirgt ihre Mitglieder vollstaendig; das Menue
// macht den Wechsel zu einem Zeigen und einem Klick. Mechanik und Zeiten sind
// die der Submenues in appendContextMenuItem: Oeffnen beim Zeigen, Schliessen
// mit Verzoegerung, Abbruch des Schliess-Timers beim Wiedereintritt in
// Ausloeser ODER Menue. Nur so ueberquert der Zeiger die Luecke zwischen Kopf
// und Menue, ohne dass es flackert. Platziert wird unter dem Kopf (Muster
// showHeadingMenu der Format-Toolbar).
//
// Das Menue nutzt bewusst das gemeinsame #context-menu: Damit gelten die
// vorhandenen Schliess-Wege (Klick ausserhalb, Escape) ohne eigenen Code.
const GRUPPEN_MENUE_OEFFNEN_MS = 300;
const GRUPPEN_MENUE_SCHLIESSEN_MS = 250;
let gruppenMenueOeffnenTimer = null;
let gruppenMenueSchliessenTimer = null;
let gruppenMenueGroupId = null;

function gruppenMenueOffen(groupId) {
  return gruppenMenueGroupId === groupId && !contextMenu.hidden;
}

export function planeGruppenMitgliederMenue(paneIdx, groupId, anchorEl) {
  if (gruppenMenueSchliessenTimer) {
    clearTimeout(gruppenMenueSchliessenTimer);
    gruppenMenueSchliessenTimer = null;
  }
  if (gruppenMenueOffen(groupId)) return;
  if (gruppenMenueOeffnenTimer) clearTimeout(gruppenMenueOeffnenTimer);
  gruppenMenueOeffnenTimer = setTimeout(() => {
    gruppenMenueOeffnenTimer = null;
    zeigeGruppenMitgliederMenue(paneIdx, groupId, anchorEl);
  }, GRUPPEN_MENUE_OEFFNEN_MS);
}

export function planeGruppenMenueSchliessen() {
  if (gruppenMenueOeffnenTimer) {
    clearTimeout(gruppenMenueOeffnenTimer);
    gruppenMenueOeffnenTimer = null;
  }
  if (!gruppenMenueGroupId) return;
  if (gruppenMenueSchliessenTimer) clearTimeout(gruppenMenueSchliessenTimer);
  gruppenMenueSchliessenTimer = setTimeout(() => {
    gruppenMenueSchliessenTimer = null;
    schliesseGruppenMenueSofort();
  }, GRUPPEN_MENUE_SCHLIESSEN_MS);
}

// Sofort schliessen: Kopf-Klick (Aufklappen), Beginn eines Ziehens.
export function schliesseGruppenMenueSofort() {
  if (gruppenMenueOeffnenTimer) {
    clearTimeout(gruppenMenueOeffnenTimer);
    gruppenMenueOeffnenTimer = null;
  }
  if (gruppenMenueSchliessenTimer) {
    clearTimeout(gruppenMenueSchliessenTimer);
    gruppenMenueSchliessenTimer = null;
  }
  if (gruppenMenueGroupId) hideContextMenu();
}

function zeigeGruppenMitgliederMenue(paneIdx, groupId, anchorEl) {
  const pane = state.panes[paneIdx];
  const group = pane ? groupById(pane, groupId) : null;
  // Zwischen Zeigen und Ablauf der Verzoegerung kann sich alles geaendert
  // haben: Gruppe aufgeklappt, aufgeloest, Reiter geschlossen.
  if (!group || !group.collapsed || !anchorEl.isConnected) return;
  const mitglieder = [];
  pane.tabs.forEach((tab, i) => {
    if (tab.groupId === groupId) mitglieder.push({ tab, i });
  });
  if (mitglieder.length === 0) return;
  contextMenu.innerHTML = '';
  for (const { tab, i } of mitglieder) {
    appendContextMenuItem(contextMenu, {
      label: (tab.dirty ? '• ' : '') + tabDisplayName(tab),
      dataId: 'tabgroup-member',
      // Haekchen-Spalte fuer alle Eintraege: sie markiert den aktiven Reiter
      // und haelt die uebrigen buendig (Muster Absatz-Submenue).
      checked: i === pane.activeIndex,
      action: () => activateTab(paneIdx, i),
    });
  }
  const rect = anchorEl.getBoundingClientRect();
  placeContextMenuAt(contextMenu, rect.left, rect.bottom + 2);
  gruppenMenueGroupId = groupId;
  contextMenu.addEventListener('mouseenter', beiMenueEintritt);
  contextMenu.addEventListener('mouseleave', beiMenueAustritt);
}

function beiMenueEintritt() {
  if (gruppenMenueSchliessenTimer) {
    clearTimeout(gruppenMenueSchliessenTimer);
    gruppenMenueSchliessenTimer = null;
  }
}

function beiMenueAustritt() {
  planeGruppenMenueSchliessen();
}

async function renameGroup(paneIdx, groupId) {
  const pane = state.panes[paneIdx];
  const group = pane ? groupById(pane, groupId) : null;
  if (!group) return;
  const result = await showTabGroupDialog({ name: group.name, color: group.color });
  if (!result) return;
  group.name = result.name;
  group.color = result.color;
  applyAllLayouts();
  persistState();
}

function dissolveGroupAction(paneIdx, groupId) {
  const pane = state.panes[paneIdx];
  if (!pane || !dissolveGroup(pane, groupId)) return;
  applyAllLayouts();
  persistState();
}

// "Gruppe schliessen": alle Mitglieder ueber den regulaeren Schliess-Pfad
// (inklusive Speichern-Dialogen). Bricht der Nutzer einen Dirty-Dialog ab,
// stoppt der Vorgang — der betroffene und die restlichen Tabs bleiben
// offen. Pane und Indizes werden pro Schritt frisch aufgeloest, weil
// closeTab Panes kollabieren kann.
async function closeGroupTabs(paneIdx, groupId) {
  const pane = state.panes[paneIdx];
  if (!pane) return;
  const members = pane.tabs.filter((tb) => tb.groupId === groupId);
  for (const tabObj of members) {
    const pIdx = state.panes.indexOf(pane);
    if (pIdx < 0) return;
    const tIdx = pane.tabs.indexOf(tabObj);
    if (tIdx < 0) continue;
    await closeTab(pIdx, tIdx);
    if (pane.tabs.includes(tabObj)) return;
  }
}

// Tab-Gruppen-Dialog: Name plus Acht-Farben-Auswahl (Swatches aus der
// Palette; Auswahl per Klick, Enter bestaetigt, Esc bricht ab). Liefert
// { name, color } oder null.
export function showTabGroupDialog(opts) {
  const modal = $('#tab-group-modal');
  const input = $('#tab-group-name');
  const colorsEl = $('#tab-group-colors');
  const btnOk = $('#btn-tab-group-ok');
  const btnCancel = $('#btn-tab-group-cancel');
  if (!modal || !input || !colorsEl) return Promise.resolve(null);

  return new Promise((resolve) => {
    input.value = (opts && opts.name) || '';
    input.placeholder = t('tabGroup.dialog.namePlaceholder');
    btnOk.textContent = t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');

    let selected = TAB_GROUP_COLOR_KEYS.includes(opts && opts.color)
      ? opts.color
      : TAB_GROUP_COLOR_KEYS[0];
    colorsEl.innerHTML = '';
    for (const key of TAB_GROUP_COLOR_KEYS) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'tab-group-swatch' + (key === selected ? ' selected' : '');
      sw.dataset.color = key;
      sw.title = t(`tabGroup.color.${key}`);
      sw.style.setProperty('--tab-group-color', `var(--tab-group-${key})`);
      sw.addEventListener('click', () => {
        selected = key;
        colorsEl
          .querySelectorAll('.tab-group-swatch')
          .forEach((b) => b.classList.toggle('selected', b === sw));
      });
      colorsEl.appendChild(sw);
    }

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onOk = () => finish({ name: input.value.trim(), color: selected });
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

// R3-10 (4T-0187): gemeinsame Viewport-Klemmung fuer alle Kontextmenues
// (Tab-Menue und Bookmark-Menue) — vorher klemmte nur das Tab-Menue und
// das Bookmark-Menue konnte unten/rechts aus dem Fenster ragen.
export function placeContextMenuAt(menu, clientX, clientY) {
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  let x = clientX;
  let y = clientY;
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
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

// 4T-0012: Baut ein Kontextmenue-Item (oder Submenu-Item). Unterstuetzt drei
// Formen: Separator (`{separator: true}`), normaler Eintrag (`{key|label, action}`),
// Submenu-Eintrag (`{key|label, submenu: [...]}`). Submenus sind DOM-Kinder
// des Wrappers, damit der globale Outside-Click-Handler sie nicht abwuergt.
export function appendContextMenuItem(parent, item) {
  if (item.separator) {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    parent.appendChild(sep);
    return;
  }
  const label = item.label != null ? item.label : t(item.key);
  if (Array.isArray(item.submenu) && item.submenu.length > 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'context-menu-item context-menu-item-submenu';
    // 4T-0378: optionale Selektor-Kennung auch am Submenü-Wrapper (z.B. Format).
    if (item.dataId) wrapper.dataset.menuId = item.dataId;
    const lbl = document.createElement('span');
    lbl.className = 'context-menu-item-label';
    lbl.textContent = label;
    wrapper.appendChild(lbl);
    const arrow = document.createElement('span');
    arrow.className = 'context-menu-submenu-arrow';
    arrow.textContent = '▸';
    wrapper.appendChild(arrow);

    const sub = document.createElement('div');
    sub.className = 'context-menu context-menu-submenu';
    sub.hidden = true;
    for (const subItem of item.submenu) appendContextMenuItem(sub, subItem);
    wrapper.appendChild(sub);

    let closeTimer = null;
    const open = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      sub.hidden = false;
      placeSubmenu(wrapper, sub);
    };
    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        sub.hidden = true;
        closeTimer = null;
      }, 250);
    };
    wrapper.addEventListener('mouseenter', open);
    wrapper.addEventListener('mouseleave', scheduleClose);
    sub.addEventListener('mouseenter', open);
    sub.addEventListener('mouseleave', scheduleClose);
    parent.appendChild(wrapper);
    return;
  }
  const div = document.createElement('div');
  div.className = 'context-menu-item';
  div.textContent = label;
  // 4T-0377: optionale Test-/Selektor-Kennung (z.B. Klipboard-Aktionen).
  if (item.dataId) div.dataset.menuId = item.dataId;
  // 4T-0379: optionales Zustands-Häkchen (Absatz-Submenü). checked === false
  // reserviert die Häkchen-Spalte fürs Alignment, checked === true zeigt ✓.
  if (item.checked !== undefined) {
    div.classList.add('context-menu-item-checkable');
    if (item.checked) div.classList.add('context-menu-item-checked');
    const check = document.createElement('span');
    check.className = 'context-menu-check';
    check.textContent = item.checked ? '✓' : '';
    div.prepend(check);
  }
  if (item.tooltip) div.title = item.tooltip;
  // 4T-0521 (Epic 3E-0094): optionales Icon (Inline-SVG-String aus dem
  // kuratierten Set) vor dem Label — genutzt von der nutzerdefinierten
  // Kontextmenü-Sektion der Kommando-Platzierung.
  if (item.icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = item.icon;
    div.prepend(iconSpan);
  }
  // 4T-0377: deaktivierter Eintrag (z.B. Ausschneiden ohne Selektion) — grau
  // über die bestehende CSS-Klasse .disabled, ohne Click-Handler.
  if (item.disabled) {
    div.classList.add('disabled');
  } else {
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      item.action();
    });
  }
  parent.appendChild(div);
}

// 4T-0315 (Epic 3E-0056): viewport-feste Platzierung der Submenues. Die
// Submenues oeffnen per CSS rechts vom Eintrag (left: 100%); bei Tabs nahe
// dem rechten Fensterrand lag das Submenue damit ausserhalb des Fensters
// und war nicht bedienbar (nur das Hauptmenue wird seit R3-10 geklemmt).
// Beim Oeffnen wird gemessen: laeuft das Submenue rechts ueber, oeffnet es
// links vom Eintrag (Klasse); laeuft es unten ueber, wird es per Inline-top
// nach oben verschoben. Vor jeder Messung wird der Vorzustand
// zurueckgesetzt, damit erneutes Oeffnen frisch rechnet.
export function placeSubmenu(wrapper, sub) {
  sub.classList.remove('context-menu-submenu-left');
  sub.style.top = '';
  const rect = sub.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    sub.classList.add('context-menu-submenu-left');
  }
  const clamped = sub.getBoundingClientRect();
  if (clamped.bottom > window.innerHeight) {
    const wrapperTop = wrapper.getBoundingClientRect().top;
    // Basis-Offset -5px (CSS); zusaetzlich so weit nach oben schieben,
    // dass die Unterkante 4px Abstand zum Fensterrand haelt. Nicht ueber
    // die Fenster-Oberkante hinaus.
    const overflow = clamped.bottom - window.innerHeight + 4;
    const top = Math.max(-wrapperTop, -5 - overflow);
    sub.style.top = `${top}px`;
  }
}

export function hideContextMenu() {
  contextMenu.hidden = true;
  contextMenu.innerHTML = '';
  // 4T-0768 (Epic 3E-0158): Das Aufklapp-Menue der Gruppen teilt sich dieses
  // Element. Wer es schliesst (Klick auf einen Eintrag, Klick ausserhalb,
  // Escape), beendet damit auch dessen Besitz — sonst zoege eine spaetere
  // Schliess-Verzoegerung ein inzwischen fremdes Menue weg.
  gruppenMenueGroupId = null;
}

// --- About-Modal ------------------------------------------------------------
export async function showAbout() {
  if (!aboutVersionEl.textContent || aboutVersionEl.textContent.trim() === '—') {
    try {
      const v = await api.getVersion();
      aboutVersionEl.textContent = v;
    } catch {
      aboutVersionEl.textContent = '?';
    }
  }
  aboutModal.hidden = false;
  setTimeout(() => $('#btn-about-close').focus(), 0);
}

export function hideAbout() {
  aboutModal.hidden = true;
}

// --- Alias-Modal (4T-0050) --------------------------------------------------
// Promise-basiertes Modal. Aufrufer ruft showAliasDialog(alias, candidates)
// und wartet auf den ausgewaehlten Pfad oder null (Abbruch durch Esc,
// Backdrop oder Cancel-Button). Nur ein Dialog gleichzeitig aktiv;
// pendingAliasResolver speichert den Promise-Resolver fuer den aktuellen
// Aufruf.
export let pendingAliasResolver = null;

export function showAliasDialog(alias, candidates) {
  return new Promise((resolve) => {
    // Falls ein vorheriger Dialog noch offen war: alten Promise mit null
    // abschliessen, damit Aufrufer nicht haengen.
    if (pendingAliasResolver) {
      const prev = pendingAliasResolver;
      pendingAliasResolver = null;
      prev(null);
    }
    pendingAliasResolver = resolve;

    const desc = aliasModal.querySelector('#alias-description');
    const list = aliasModal.querySelector('#alias-candidates');
    // Beschreibung lokalisieren: 'Mehrere Dateien fuehren den Alias "<alias>".'
    const tmpl = t('alias.dialogDescription');
    desc.textContent = tmpl.replace('{alias}', alias);

    // Kandidaten-Liste aufbauen. Buttons enthalten den Datei-Namen (fett)
    // und das Verzeichnis darunter (klein, gedaempft).
    list.innerHTML = '';
    for (const fullPath of candidates) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      const name = api.basename(fullPath);
      const dir = api.dirname(fullPath);
      const nameEl = document.createElement('span');
      nameEl.className = 'alias-candidate-name';
      nameEl.textContent = name;
      const dirEl = document.createElement('span');
      dirEl.className = 'alias-candidate-dir';
      dirEl.textContent = dir;
      btn.appendChild(nameEl);
      btn.appendChild(dirEl);
      btn.addEventListener('click', () => resolveAliasDialog(fullPath));
      li.appendChild(btn);
      list.appendChild(li);
    }

    aliasModal.hidden = false;
    // Fokus auf den ersten Kandidaten-Button setzen, damit Pfeil-Navigation
    // direkt funktioniert.
    setTimeout(() => {
      const firstBtn = list.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }, 0);
  });
}

export function resolveAliasDialog(chosenPath) {
  aliasModal.hidden = true;
  if (pendingAliasResolver) {
    const r = pendingAliasResolver;
    pendingAliasResolver = null;
    r(chosenPath);
  }
}

export function cancelAliasDialog() {
  resolveAliasDialog(null);
}

// --- Namens-Eingabe-Modal (4T-0338, Epic 3E-0061) ----------------------------
// Generischer Eingabe-Dialog fuer Unterseite-anlegen und Datei-umbenennen.
// Promise-basiert wie showAliasDialog: liefert den bestaetigten Namen oder
// null bei Abbruch (Esc, Backdrop, Abbrechen-Button). opts:
//   title        Dialog-Titel (bereits lokalisiert)
//   description  Beschreibungs-Zeile (bereits lokalisiert)
//   initialValue Vorbelegung des Eingabefelds
//   placeholder  Platzhalter-Text
//   okLabel      Beschriftung des Bestaetigen-Buttons (bereits lokalisiert)
//   validate     (value) => i18n-Key des Fehlers oder null (gueltig)
// 4T-0346 (Epic 3E-0062): opts.checkboxes ist eine optionale Liste
//   [{ id, label, checked, requires? }]. Ohne die Option verhaelt sich der
//   Dialog wie bisher (Rueckgabe: String bzw. null). Mit der Option zeigt er die
//   Checkboxen und liefert bei OK ein Objekt { value, checkboxes: { id: bool } };
//   `requires` deaktiviert eine Checkbox, solange die referenzierte aus ist.
export function showNameInputDialog(opts) {
  const modal = $('#name-input-modal');
  const titleEl = $('#name-input-title');
  const descEl = $('#name-input-description');
  const input = $('#name-input-field');
  const errorEl = $('#name-input-error');
  const btnOk = $('#btn-name-input-ok');
  const btnCancel = $('#btn-name-input-cancel');
  const checkboxContainer = $('#name-input-checkboxes');
  if (!modal || !input) return Promise.resolve(null);

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    descEl.textContent = (opts && opts.description) || '';
    descEl.hidden = !descEl.textContent;
    input.value = (opts && opts.initialValue) || '';
    input.placeholder = (opts && opts.placeholder) || '';
    errorEl.hidden = true;
    errorEl.textContent = '';
    btnOk.textContent = (opts && opts.okLabel) || t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');

    const checkboxDefs = opts && Array.isArray(opts.checkboxes) ? opts.checkboxes : [];
    const checkboxInputs = {};
    if (checkboxContainer) {
      checkboxContainer.innerHTML = '';
      checkboxContainer.hidden = checkboxDefs.length === 0;
      for (const def of checkboxDefs) {
        const label = document.createElement('label');
        label.className = 'name-input-checkbox';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `name-input-cb-${def.id}`;
        cb.checked = !!def.checked;
        const span = document.createElement('span');
        span.textContent = def.label || '';
        label.appendChild(cb);
        label.appendChild(span);
        checkboxContainer.appendChild(label);
        checkboxInputs[def.id] = cb;
      }
      const applyDeps = () => {
        for (const def of checkboxDefs) {
          if (!def.requires) continue;
          const master = checkboxInputs[def.requires];
          const dep = checkboxInputs[def.id];
          if (master && dep) dep.disabled = !master.checked;
        }
      };
      for (const def of checkboxDefs) {
        if (def.requires && checkboxInputs[def.requires]) {
          checkboxInputs[def.requires].addEventListener('change', applyDeps);
        }
      }
      applyDeps();
    }
    const readCheckboxes = () => {
      const out = {};
      for (const def of checkboxDefs) {
        const cb = checkboxInputs[def.id];
        out[def.id] = !!(cb && cb.checked && !cb.disabled);
      }
      return out;
    };

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onOk = () => {
      const value = input.value.trim();
      const errKey = opts && typeof opts.validate === 'function' ? opts.validate(value) : null;
      if (errKey) {
        errorEl.textContent = t(errKey);
        errorEl.hidden = false;
        input.focus();
        return;
      }
      finish(checkboxDefs.length > 0 ? { value, checkboxes: readCheckboxes() } : value);
    };
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

// 4T-0346 (Epic 3E-0062): gemeinsamer Listen-Aufbau fuer Vorschau und Bericht.
// sections: Liste von { title?, emptyText?, rows: [{ text, detail? }] }. Leere
// Sektionen zeigen ihren emptyText (oder werden uebersprungen). Ein Dialog, zwei
// Betriebsarten (Architektur-Entscheidung des Epics).
function renderLinkUpdateSections(container, sections) {
  container.innerHTML = '';
  for (const section of sections) {
    if (section.title) {
      const h = document.createElement('h3');
      h.className = 'link-update-section-title';
      h.textContent = section.title;
      container.appendChild(h);
    }
    if (!section.rows || section.rows.length === 0) {
      if (section.emptyText) {
        const p = document.createElement('p');
        p.className = 'link-update-empty';
        p.textContent = section.emptyText;
        container.appendChild(p);
      }
      continue;
    }
    const ul = document.createElement('ul');
    ul.className = 'link-update-rows';
    for (const row of section.rows) {
      const li = document.createElement('li');
      const main = document.createElement('span');
      main.className = 'link-update-row-main';
      main.textContent = row.text;
      li.appendChild(main);
      if (row.detail) {
        const detail = document.createElement('span');
        detail.className = 'link-update-row-detail';
        detail.textContent = row.detail;
        li.appendChild(detail);
      }
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }
}

// 4T-0346 (Epic 3E-0062): Vorschau vor dem Link-Update. opts:
//   title, summary (lokalisiert), sections (fuer renderLinkUpdateSections),
//   continueLabel, cancelLabel. Liefert true (Fortfahren) oder false (Abbruch).
export function showLinkPreviewDialog(opts) {
  const modal = $('#link-preview-modal');
  const titleEl = $('#link-preview-title');
  const summaryEl = $('#link-preview-summary');
  const listEl = $('#link-preview-list');
  const btnContinue = $('#btn-link-preview-continue');
  const btnCancel = $('#btn-link-preview-cancel');
  if (!modal || !listEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    summaryEl.textContent = (opts && opts.summary) || '';
    summaryEl.hidden = !summaryEl.textContent;
    renderLinkUpdateSections(listEl, (opts && opts.sections) || []);
    btnContinue.textContent = (opts && opts.continueLabel) || t('dialog.ok');
    btnCancel.textContent = (opts && opts.cancelLabel) || t('dialog.cancel');

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnContinue.removeEventListener('click', onContinue);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onContinue = () => finish(true);
    const onCancel = () => finish(false);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onContinue();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnContinue.addEventListener('click', onContinue);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => btnContinue.focus(), 0);
  });
}

// 4T-0346 (Epic 3E-0062): Ergebnis-Bericht nach dem Link-Update. opts:
//   title, sections, okLabel. Liefert nichts (nur Bestaetigung).
export function showLinkReportDialog(opts) {
  const modal = $('#link-report-modal');
  const titleEl = $('#link-report-title');
  const bodyEl = $('#link-report-body');
  const btnOk = $('#btn-link-report-ok');
  if (!modal || !bodyEl) return Promise.resolve();

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    renderLinkUpdateSections(bodyEl, (opts && opts.sections) || []);
    btnOk.textContent = (opts && opts.okLabel) || t('dialog.ok');

    const finish = () => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', finish);
      backdrop.removeEventListener('click', finish);
      resolve();
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', finish);
    backdrop.addEventListener('click', finish);

    modal.hidden = false;
    setTimeout(() => btnOk.focus(), 0);
  });
}
