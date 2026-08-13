// Menues und Dialog der Tab-Gruppen: Kontextmenue-Aktionen des Reiter-Menues,
// Kopf-Menue der Gruppe, Aufklapp-Menue einer zugeklappten Gruppe und der
// Gruppen-Dialog (Name und Farbe).
// 4T-0978 (Epic 3E-0196): aus modules/dialogs/dialogs.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert). Eigenes Modul neben
// tab-context-menu.js, weil beide zusammen ueber dem Zeilen-Budget lagen;
// die Trennlinie folgt der Fachlichkeit (Gruppen gegen Reiter). Der
// Gruppen-Dialog liegt bewusst hier und nicht bei den uebrigen Modalen: Er
// braucht die Farb-Palette des Gruppen-Modells, und ein Verbleib in dialogs/
// haette einen Zyklus dialogs <-> tabs erzeugt.
'use strict';

import { t } from '../../i18n.js';

import { $ } from '../app/api.js';
import { contextMenu, state, tabDisplayName } from '../app/app-state.js';
import { activateTab, closeTab } from './tabs.js';
// 4T-0461 (Epic 3E-0085): applyAllLayouts/persistState fuer die
// Gruppen-Menue-Aktionen (Render und Sitzungs-Persistenz nach Modell-Edit).
import { applyAllLayouts } from '../views/pane-render.js';
import { persistState } from '../views/views.js';
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
// 4T-0978: generische Menue-Helfer aus dem Dialog-Bereich.
import {
  appendContextMenuItem,
  hideContextMenu,
  placeContextMenuAt,
  registerContextMenuCloseHook,
} from '../dialogs/context-menu-utils.js';

// --- Tab-Gruppen: Kontextmenue-Aktionen und Kopf-Menue (4T-0461) --------------

// Neue-Gruppe-Fluss: Gruppe mit Standard-Name ("Gruppe n") und naechster
// freier Palette-Farbe anlegen, dann direkt den Umbenennen-Dialog oeffnen.
// Abbruch im Dialog behaelt Standard-Name und -Farbe (Gruppe bleibt).
// 4T-0766 (Epic 3E-0158): auf eine Index-Liste erweitert — bei einer Menge
// ruecken die Mitglieder an der Stelle des ersten Ausgewaehlten zusammen.
export async function newGroupWithTabs(paneIdx, tabIdxList) {
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

export function addTabsToGroupAction(paneIdx, tabIdxList, groupId) {
  const pane = state.panes[paneIdx];
  if (!pane || !addTabsToGroup(pane, tabIdxList, groupId)) return;
  // 4T-0767 (Epic 3E-0158): Tritt der aktive Reiter einer zugeklappten Gruppe
  // bei, bleibt sie zu — die Sichtbarkeits-Garantie ist entfallen.
  applyAllLayouts();
  persistState();
}

export function removeTabsFromGroupAction(paneIdx, tabIdxList) {
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

// 4T-0978: Der Besitz am gemeinsamen #context-menu endet, sobald es
// geschlossen wird, gleich von wem. Vor dem Schnitt setzte hideContextMenu die
// Kennung selbst zurück; jetzt meldet dieses Modul den Rücksetzer dort an.
registerContextMenuCloseHook(() => {
  gruppenMenueGroupId = null;
});

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
