// --- Reiterleiste (Tabbar) --------------------------------------------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
// Baut den Reiter-Streifen einer Pane samt Gruppen-Koepfen auf: Beschriftung,
// Zustands-Klassen, Auswahl-Gesten, Kontextmenues und die Zieh-Gesten
// (Reiter, Mengen, ganze Gruppen). Reines DOM — die Modell-Aenderungen
// liegen in tabs/.
'use strict';

import { t } from '../../i18n.js';

import {
  MIME_TAB,
  WINDOW_DRAG_TOKEN,
  getPaneEls,
  state,
  tabDisplayName,
} from '../app/app-state.js';
// 4T-000461 (Epic 3E-000085): bei deaktivierter Erweiterung tab-groups rendert
// der Streifen flach (keine Koepfe/Kennungen, alle Tabs sichtbar).
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  activatePane,
  activateTab,
  closeTab,
  dropTabIntoGroup,
  moveGroupInPane,
  moveTabBetweenPanes,
  parseTabDrag,
  reorderTabsWithinPane,
  toggleGroupCollapsed,
} from '../tabs/tabs.js';
// 4T-000978 (Epic 3E-000196): Die Reiter- und Gruppen-Menues liegen seit dem
// Schnitt im Tab-Bereich.
import { showTabContextMenu } from '../tabs/tab-context-menu.js';
import {
  planeGruppenMenueSchliessen,
  planeGruppenMitgliederMenue,
  schliesseGruppenMenueSofort,
  showGroupContextMenu,
} from '../tabs/tab-group-menu.js';
// 4T-000460 (Epic 3E-000085): groupById fuer den Tabbar-Aufbau (Koepfe,
// Kennungen, Verbergen).
import { groupById } from '../tabs/tab-groups.js';
// 4T-000765 (Epic 3E-000158): Mehrfach-Auswahl der Reiterleiste — Markierung,
// Auswahl-Gesten und die Menge, die beim Ziehen mitwandert.
import {
  extendSelection,
  hasMultiSelection,
  isTabSelected,
  selectedIndices,
  toggleSelection,
} from '../tabs/tab-selection.js';

export function renderTabbar(paneIdx) {
  const els = getPaneEls(paneIdx);
  const pane = state.panes[paneIdx];
  if (!pane) return;
  els.tabbar.innerHTML = '';

  // 4T-000460 (Epic 3E-000085): Gruppen-Koepfe stehen vor dem ersten Mitglied;
  // Mitglieder zugeklappter Gruppen sind verborgen (nur der Kopf bleibt).
  // 4T-000461: bei deaktivierter Erweiterung rendert der Streifen flach —
  // Modell und Sitzungs-Daten bleiben erhalten (Wieder-Einschalten stellt
  // die Gruppen unveraendert zurueck).
  const groupsActive = isExtensionActive('tab-groups');
  const seenGroups = new Set();
  // 4T-000765 (Epic 3E-000158): Die Markierung erscheint erst ab zwei Mitgliedern
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
    // 4T-000765: Der Streifen rendert nur sichtbare Reiter, der Index bleibt
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
      // 4T-000765 (Epic 3E-000158): Auswahl-Gesten. Umschalt bildet die Spanne ab
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
      // 4T-000765 (Epic 3E-000158): Ist der gezogene Reiter Teil einer
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
      // 4T-000460: Kopf-Ziehen — die ganze Gruppe an die Drop-Position
      // (nur innerhalb der eigenen Leiste; fremde Bloecke schnappen).
      if (data.kind === 'group') {
        if (data.fromPane === paneIdx) moveGroupInPane(paneIdx, data.groupId, insertIdx);
        return;
      }
      // 4T-000765 (Epic 3E-000158): Mehrfach-Auswahl als Block bewegen, solange
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

// 4T-000460 (Epic 3E-000085): Gruppen-Kopf im Tab-Streifen. Name auf Farbflaeche
// (Palette-Variablen, theme-konform), Klick klappt zu/auf, Ziehen verschiebt
// die ganze Gruppe, Drop eines Tabs auf den Kopf = Beitritt. Zugeklappt
// zeigt der Kopf die Mitglieder-Zahl.
function buildGroupHeadEl(paneIdx, group, firstMemberIdx) {
  const pane = state.panes[paneIdx];
  const head = document.createElement('div');
  // 4T-000767 (Epic 3E-000158): Liegt der aktive Reiter in dieser Gruppe, traegt
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
    // 4T-000768 (Epic 3E-000158): Das Aufklappen macht das Menue gegenstandslos.
    schliesseGruppenMenueSofort();
    toggleGroupCollapsed(paneIdx, group.id);
  });
  // 4T-000768: Aufklapp-Menue beim Ueberfahren — nur bei zugeklappten Gruppen,
  // eine aufgeklappte zeigt ihre Mitglieder ohnehin.
  if (group.collapsed) {
    head.addEventListener('mouseenter', () => planeGruppenMitgliederMenue(paneIdx, group.id, head));
    head.addEventListener('mouseleave', () => planeGruppenMenueSchliessen());
  }
  // 4T-000461: Verwaltung ueber das Kopf-Kontextmenue (Umbenennen/Farbe,
  // Aufloesen, Schliessen).
  head.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showGroupContextMenu(e, paneIdx, group.id);
  });

  head.addEventListener('dragstart', (e) => {
    // 4T-000768: Ein beginnendes Ziehen schliesst das Aufklapp-Menue.
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
    // 4T-000766 (Epic 3E-000158): Eine Mehrfach-Auswahl tritt als Ganzes bei.
    dropTabIntoGroup(data.fromPane, data.tabIndex, paneIdx, group.id, data.tabIndices);
  });

  return head;
}
