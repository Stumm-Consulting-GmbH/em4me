// --- Backlinks-Sidebar (4T-000015) -------------------------------------------
// 4T-000990 (Epic 3E-000196): aus panels.js in den Ordner panels/ ausgezogen,
// samt eigener Panel-Registrierung am Modul-Ende.
// Zeigt eingehende Referenzen auf die aktive Datei aus dem Suchraum
// (Datei-Ordner + 2 Unterordner-Ebenen). Indexierung laeuft im Main-Prozess;
// der Renderer fragt pro Pane bei Tab-Wechsel die Backlinks an und gibt die
// alte Wurzel frei (paarweises request/release fuer Refcounting +
// 60-s-Soft-Timer).
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
// 4T-000294 (Epic 3E-000052): Backlinks gehören zur Wiki-Link-Erweiterung — ihre
// Auswertung ist Wiki-Syntax-Auswertung. Deaktiviert verschwindet das Panel;
// die Sichtbarkeits-Preference bleibt persistiert und greift beim
// Wiedereinschalten.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { openOrJumpToPath } from '../bookmarks/bookmarks.js';
// 4T-000347 (Epic 3E-000062): bereichsrelative Ordner-Anzeige (gemeinsam mit der
// Tag-Datei-Liste), damit gleichnamige Dateien aus verschiedenen Ordnern des
// Bereichs eindeutig unterscheidbar sind.
import { relativeDirFromRoot } from '../path-format.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { isAllEmpty, persistSetting } from '../views/views.js';

import { applySidebarVisibility } from './panels.js';

export async function activateBacklinksFor(paneIdx, filePath) {
  // R3-02 (4T-000175): currentFileByPane SYNCHRON setzen und eine Request-
  // Generation ziehen, bevor irgendein await die Kontrolle abgibt. Parallele
  // Aufrufe (Tab-Wechsel + Invalidate) konnten sonst doppelt releasen und
  // ein veraltetes Ergebnis nach dem neuen rendern.
  const prev = state.backlinks.currentFileByPane[paneIdx];
  state.backlinks.currentFileByPane[paneIdx] = filePath || null;
  if (!state.backlinks.requestGenByPane) state.backlinks.requestGenByPane = [0, 0];
  const gen = ++state.backlinks.requestGenByPane[paneIdx];

  if (prev && prev !== filePath) {
    // B-01 (4T-000175): Release mit Owner-Kontext (Pane). Doppel-Release ist
    // im Owner-Modell idempotent.
    try {
      await api.releaseBacklinks(prev, paneIdx);
    } catch {
      /* ignore */
    }
  }
  if (!filePath) {
    state.backlinks.lastResultsByPane[paneIdx] = { status: 'unavailable' };
    renderBacklinks(paneIdx);
    return;
  }
  // Wir fragen direkt an. Status 'ready' kommt im Normalfall sync zurueck.
  let payload;
  try {
    payload = await api.requestBacklinks(filePath, paneIdx);
  } catch {
    payload = { status: 'unavailable' };
  }
  // Race-Sicherung: nur die juengste Anfrage dieser Pane darf rendern.
  if (state.backlinks.requestGenByPane[paneIdx] !== gen) return;
  if (state.backlinks.currentFileByPane[paneIdx] !== filePath) return;
  state.backlinks.lastResultsByPane[paneIdx] = payload;
  renderBacklinks(paneIdx);
}

export async function deactivateBacklinksFor(paneIdx) {
  const prev = state.backlinks.currentFileByPane[paneIdx];
  // R3-02: synchron leeren, bevor das await die Kontrolle abgibt.
  state.backlinks.currentFileByPane[paneIdx] = null;
  state.backlinks.lastResultsByPane[paneIdx] = null;
  if (state.backlinks.requestGenByPane) state.backlinks.requestGenByPane[paneIdx]++;
  if (prev) {
    try {
      await api.releaseBacklinks(prev, paneIdx);
    } catch {
      /* ignore */
    }
  }
}

export function renderBacklinks(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.backlinksResults || !els.backlinksStatus) return;
  const payload = state.backlinks.lastResultsByPane[paneIdx];
  els.backlinksResults.innerHTML = '';
  els.backlinksStatus.hidden = true;
  els.backlinksStatus.textContent = '';
  if (!payload) {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.indexing');
    return;
  }
  if (payload.status === 'unavailable') {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.unavailable');
    return;
  }
  if (payload.status === 'oversized') {
    els.backlinksStatus.hidden = false;
    const meta = payload.meta || {};
    const files = meta.fileCount || 0;
    const mb = meta.byteSize ? Math.round(meta.byteSize / (1024 * 1024)) : 0;
    els.backlinksStatus.textContent = t('backlinks.oversized')
      .replace('{files}', String(files))
      .replace('{mb}', String(mb));
    return;
  }
  if (payload.status === 'indexing') {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.indexing');
    return;
  }
  // B-21 (4T-000187): Watcher-Fehler sichtbar machen statt leerem Panel.
  if (payload.status === 'error') {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.watchError');
    return;
  }
  // ready
  const groups = Array.isArray(payload.results) ? payload.results : [];
  // 4T-000347 (Epic 3E-000062): Index-Wurzel fuer die relative Ordner-Anzeige der
  // Quelldateien (im Bereich der Bereichs-Wurzelordner, sonst die Ordner-Wurzel).
  const wurzel = payload.meta && payload.meta.wurzel;
  // B-22 (4T-000187): Hinweis auf beim Scan uebersprungene (unlesbare) Ordner.
  const skipped = payload.meta && payload.meta.skippedDirs ? payload.meta.skippedDirs : 0;
  if (skipped > 0) {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.skippedDirs').replace('{n}', String(skipped));
  }
  if (groups.length === 0) {
    if (skipped === 0) {
      els.backlinksStatus.hidden = false;
      els.backlinksStatus.textContent = t('backlinks.empty');
    }
    return;
  }
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'backlinks-group';

    const header = document.createElement('div');
    header.className = 'backlinks-group-header';
    // 4T-000347 (Epic 3E-000062): zweizeilig — Basename prominent, darunter der
    // Ordner relativ zur Index-Wurzel. Datei direkt in der Wurzel -> nur der
    // Basename (kein Ordner-Zusatz). Voller Pfad bleibt im Tooltip.
    const nameEl = document.createElement('div');
    nameEl.className = 'backlinks-group-name';
    nameEl.textContent = api.basename(group.quelldatei);
    header.appendChild(nameEl);
    const relDir = relativeDirFromRoot(wurzel, group.quelldatei);
    if (relDir) {
      const dirEl = document.createElement('div');
      dirEl.className = 'backlinks-group-dir';
      dirEl.textContent = relDir;
      header.appendChild(dirEl);
    }
    header.title = group.quelldatei;
    const firstHit = group.hits[0];
    header.addEventListener('click', () => {
      openOrJumpToPath(group.quelldatei, firstHit ? firstHit.zeile : 1);
    });
    groupEl.appendChild(header);

    for (const hit of group.hits) {
      const hitEl = document.createElement('div');
      hitEl.className = 'backlinks-hit';
      const meta = document.createElement('span');
      meta.className = 'backlinks-hit-meta';
      // R3-09 (4T-000185): Zeilen-Label lokalisiert (Muster vom Outgoing-
      // Panel); der Anker-Teil ('#<anker>') ist sprachneutrale Markdown-
      // Notation und bleibt unuebersetzt.
      let metaText = t('backlinks.line').replace('{line}', String(hit.zeile));
      if (hit.anker) metaText += ', #' + hit.anker;
      metaText += '  ';
      meta.textContent = metaText;
      hitEl.appendChild(meta);
      const snip = document.createElement('span');
      snip.className = 'backlinks-hit-snippet';
      snip.textContent = hit.snippet || '';
      hitEl.appendChild(snip);
      // 4T-000050 (Epic 3E-000010): Wenn der Backlink ueber einen Alias der
      // aktiven Datei zustande kommt, wird ein dezentes 'via <alias>'-Tag
      // angehaengt. Macht transparent, dass die Quelldatei nicht den
      // Datei-Namen verwendet hat, sondern einen Alias.
      if (hit.viaAlias) {
        const aliasTag = document.createElement('span');
        aliasTag.className = 'backlink-via-alias';
        aliasTag.textContent = t('backlinks.viaAlias').replace('{alias}', hit.viaAlias);
        hitEl.appendChild(aliasTag);
      }
      hitEl.title = hit.snippet || '';
      hitEl.addEventListener('click', () => {
        openOrJumpToPath(group.quelldatei, hit.zeile);
      });
      groupEl.appendChild(hitEl);
    }
    els.backlinksResults.appendChild(groupEl);
  }
  // Tooltip im Info-Symbol auf die konkrete Wurzel setzen.
  if (els.backlinksInfo) {
    const wurzel = payload.meta && payload.meta.wurzel;
    if (wurzel) {
      els.backlinksInfo.title = t('backlinks.scopeTooltip').replace('{root}', wurzel);
    }
  }
}

export function applyBacklinksVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.backlinksSection) return;
  // 4T-000075: Backlinks im Empty-State zwangsweise unsichtbar.
  // 4T-000294: bei deaktivierter Wiki-Link-Erweiterung ebenso — der
  // else-Zweig gibt zugleich die Index-Wurzel frei (keine Index-Last).
  const visible =
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.backlinks.visibleByPane[paneIdx];
  els.backlinksSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    // Bei Aktivierung aktuelle Datei abfragen.
    const pane = state.panes[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    activateBacklinksFor(paneIdx, tab && tab.path ? tab.path : null);
  } else {
    deactivateBacklinksFor(paneIdx);
  }
  updateBacklinksToggleButton();
}

export function updateBacklinksToggleButton() {
  const btn = document.getElementById('btn-backlinks');
  if (!btn) return;
  const visible = !!state.backlinks.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleBacklinksPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.backlinks.visibleByPane[paneIdx];
  state.backlinks.visibleByPane[paneIdx] = next;
  // 4T-000288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('backlinks', paneIdx);
  applyBacklinksVisibility(paneIdx);
  await persistBacklinksSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistBacklinksSettings() {
  await persistSetting('backlinks.visibleColumn0', !!state.backlinks.visibleByPane[0]);
  await persistSetting('backlinks.visibleColumn1', !!state.backlinks.visibleByPane[1]);
}

export async function loadBacklinksSettings() {
  const v0 = await api.getSetting('backlinks.visibleColumn0');
  const v1 = await api.getSetting('backlinks.visibleColumn1');
  state.backlinks.visibleByPane[0] = !!v0;
  state.backlinks.visibleByPane[1] = !!v1;
}

// === 4T-000287 (Epic 3E-000051): Panel-Registrierung =============================
// Import-Seiteneffekt: getVisible spiegelt die effektive Sichtbarkeits-Logik
// aus applyBacklinksVisibility inklusive Empty-State-Override (4T-000075).
registerSidebarPanel({
  id: 'backlinks',
  titleKey: 'backlinks.title',
  buttonId: 'btn-backlinks',
  sectionClass: 'sidebar-backlinks',
  getVisible: (paneIdx) =>
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.backlinks.visibleByPane[paneIdx],
  applyVisibility: applyBacklinksVisibility,
  toggle: toggleBacklinksPanel,
});
