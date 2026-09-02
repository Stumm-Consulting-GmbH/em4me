// --- Unterseiten-Sektion (4T-000341, Epic 3E-000061) ------------------------------
// 4T-000990 (Epic 3E-000196): aus panels.js in den Ordner panels/ ausgezogen,
// samt eigener Panel-Registrierung am Modul-Ende.
// Listet die direkten Unterseiten der aktiven Datei (Basename-Praefix mit
// U+2215, Quelle ist der Nachfahren-Scan des Main — deterministisch ohne
// Index-Aufwaermung). Klick oeffnet die Datei in der Pane. Aktualisierung
// bei Tab-Wechsel (syncEditorForPane), nach Anlage/Umbenennen und ueber
// den backlinks:invalidated-Broadcast (externe Datei-Aenderungen).
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
// Muster Outgoing: Unterseiten sind Vernetzungs-Funktionalitaet und hängen
// deshalb an der Wiki-Link-Erweiterung.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { openInPane, reportMenuStateNow } from '../tabs/tabs.js';
import { isAllEmpty, persistSetting } from '../views/views.js';
// 4T-000341: Segment-Logik fuer die Unterseiten-Sektion.
import { lastSegment, segmentsOf } from '../../../shared/subpages.js';

import { applySidebarVisibility } from './panels.js';

export const SUBPAGES_RENDER_DEBOUNCE_MS = 150;

export function scheduleSubpagesRender(paneIdx) {
  if (!state.subpages) return;
  const timers = state.subpages.updateTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    renderSubpages(paneIdx);
  }, SUBPAGES_RENDER_DEBOUNCE_MS);
}

export async function renderSubpages(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.subpagesList || !els.subpagesStatus) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const token = ++state.subpages.renderTokens[paneIdx];
  const showEmpty = (key) => {
    els.subpagesList.innerHTML = '';
    els.subpagesStatus.hidden = false;
    els.subpagesStatus.textContent = t(key);
  };
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showEmpty('subpages.empty');
    return;
  }
  let scan;
  try {
    scan = await api.subpageDescendants(tab.path);
  } catch {
    scan = null;
  }
  // Async-Race: Tab koennte inzwischen gewechselt haben.
  if (token !== state.subpages.renderTokens[paneIdx]) return;
  if (!scan || !scan.ok || !Array.isArray(scan.files)) {
    showEmpty('subpages.empty');
    return;
  }
  // Nur DIREKTE Unterseiten (genau ein Segment tiefer als die aktive Datei).
  const ownDepth = segmentsOf(
    api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
  ).length;
  const children = scan.files
    .map((f) => ({
      path: f,
      base: api.basename(f).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
    }))
    .filter((c) => segmentsOf(c.base).length === ownDepth + 1)
    .sort((a, b) => lastSegment(a.base).localeCompare(lastSegment(b.base)));
  if (children.length === 0) {
    showEmpty('subpages.empty');
    return;
  }
  els.subpagesStatus.hidden = true;
  els.subpagesStatus.textContent = '';
  els.subpagesList.innerHTML = '';
  for (const child of children) {
    const row = document.createElement('div');
    row.className = 'subpages-entry';
    row.textContent = lastSegment(child.base);
    row.title = child.path;
    row.addEventListener('click', () => {
      openInPane(paneIdx, [child.path]);
    });
    els.subpagesList.appendChild(row);
  }
}

export function applySubpagesVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.subpagesSection) return;
  // Muster Outgoing: im Empty-State und bei deaktivierter Wiki-Link-
  // Erweiterung unsichtbar (Unterseiten sind Vernetzungs-Funktionalitaet).
  const visible =
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.subpages.visibleByPane[paneIdx];
  els.subpagesSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderSubpages(paneIdx);
  }
  updateSubpagesToggleButton();
}

// 4T-000567 (Epic 3E-000104): Active-State des neuen Statusbar-Buttons
// (Muster updateOutgoingToggleButton).
export function updateSubpagesToggleButton() {
  const btn = document.getElementById('btn-subpages');
  if (!btn) return;
  const visible = !!state.subpages.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleSubpagesPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.subpages.visibleByPane[paneIdx];
  state.subpages.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('subpages', paneIdx);
  applySubpagesVisibility(paneIdx);
  await persistSubpagesSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistSubpagesSettings() {
  await persistSetting('subpages.visibleColumn0', !!state.subpages.visibleByPane[0]);
  await persistSetting('subpages.visibleColumn1', !!state.subpages.visibleByPane[1]);
}

export async function loadSubpagesSettings() {
  const v0 = await api.getSetting('subpages.visibleColumn0');
  const v1 = await api.getSetting('subpages.visibleColumn1');
  state.subpages.visibleByPane[0] = !!v0;
  state.subpages.visibleByPane[1] = !!v1;
}

// === 4T-000341 (Epic 3E-000061): Panel-Registrierung =============================
// Import-Seiteneffekt; Statusbar-Button seit 4T-000567 (Epic 3E-000104,
// Zugangs-Symmetrie).
registerSidebarPanel({
  id: 'subpages',
  titleKey: 'subpages.title',
  buttonId: 'btn-subpages',
  sectionClass: 'sidebar-subpages',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('wiki-links') &&
    !!(state.subpages && state.subpages.visibleByPane[paneIdx]),
  applyVisibility: applySubpagesVisibility,
  toggle: toggleSubpagesPanel,
});
