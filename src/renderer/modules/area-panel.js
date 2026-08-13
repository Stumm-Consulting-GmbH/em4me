// 4T-0327 (Epic 3E-0059): Bereichs-Panel — Ordnerbaum des Bereichs oben,
// Markdown-Dateiliste des ausgewaehlten Ordners darunter. Registriert sich
// als siebtes Panel an der Sidebar-Registry (links/rechts andockbar,
// Reiter-Gruppen-faehig); ohne aktiven Bereich zeigt der Body einen
// Empty-State. Verzeichnis-Daten liefert der Main-Prozess (area:listDir,
// lazy pro aufgeklapptem Ordner); alle Eintraege tragen den vollen Pfad
// als Tooltip (PO-Entscheidung).
'use strict';

import { t } from '../i18n.js';

import { api } from './app/api.js';
import { areaPanelVisiblePref, getPaneEls, state } from './app/app-state.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
// Sichtbarkeits-Anwendung laeuft ueber das Slot-Mounting der dynamischen
// Sidebar (Muster der Bestands-Panels in panels.js).
import { applySidebarVisibility } from './panels/panels.js';
// 4T-0568 (Epic 3E-0104): reportMenuStateNow — Haekchen im Panel-Untermenue
// folgt dem Toggle (Muster panels.js).
import { openInPane, reportMenuStateNow } from './tabs/tabs.js';
import { persistSetting, showStatusbarHint, updateEmptyState } from './views/views.js';
// 4T-0427 (Epic 3E-0080): Ordner-Regel-Trigger für "Neue Datei in diesem
// Ordner" (gemeinsamer Einhak-Punkt der App-Anlagen).
import { openCreatedFileWithRule } from './templates.js';
// 4T-0455 (Epic 3E-0084): Kontextmenü-Eintrag "Bereichs-Graph" am Panel.
import { openAreaGraphTab } from './graph/graph-tab.js';
// 4T-0620 (Epic 3E-0117): zweiter panel-weiter Einstieg — Bereichs-Statistik.
import { openAreaStatsPage } from './area-stats-page.js';
import { hideContextMenu, placeContextMenuAt } from './dialogs/context-menu-utils.js';
import { isExtensionActive } from './extensions/extension-lifecycle.js';
// 4T-0612 (Epic 3E-0115): "Als Bereichs-Lesezeichen" im Kontextmenue der
// Datei-Zeilen des Bereichs-Panels (Dateien liegen per Definition im Bereich).
import { addAreaBookmarkForPath } from './bookmarks/bookmarks-actions.js';

// Listing-Cache pro Ordner-Pfad ({ dirs, files }). Wird beim Bereichs-
// Wechsel und bei Watcher-Ereignissen (4T-0328) verworfen.
const listingCache = new Map();

export function invalidateAreaListings() {
  listingCache.clear();
}

async function ensureListing(dirPath) {
  if (listingCache.has(dirPath)) return listingCache.get(dirPath);
  try {
    const result = await api.areaListDir(dirPath);
    if (result && result.ok) {
      const entry = { dirs: result.dirs || [], files: result.files || [] };
      listingCache.set(dirPath, entry);
      return entry;
    }
  } catch {
    // Lese-Fehler unten als leeres Listing behandeln.
  }
  const empty = { dirs: [], files: [] };
  listingCache.set(dirPath, empty);
  return empty;
}

function joinPath(dir, name) {
  return `${dir.replace(/[\\/]+$/, '')}\\${name}`;
}

function isExpanded(paneIdx, dirPath) {
  return state.areaPanel.expandedByPane[paneIdx].includes(dirPath);
}

function setExpanded(paneIdx, dirPath, expanded) {
  const list = state.areaPanel.expandedByPane[paneIdx];
  const idx = list.indexOf(dirPath);
  if (expanded && idx < 0) list.push(dirPath);
  if (!expanded && idx >= 0) list.splice(idx, 1);
}

function selectedDir(paneIdx) {
  return state.areaPanel.selectedDirByPane[paneIdx] || state.areaPath;
}

// --- Rendering ---------------------------------------------------------------

// Baut eine Baum-Zeile: Caret (nur klappbar), Ordnername; Klick auf den
// Namen waehlt den Ordner fuer die Dateiliste, Klick auf den Caret klappt.
function buildDirRow(paneIdx, dirPath, name, depth, hasChildren) {
  const row = document.createElement('div');
  row.className = 'area-dir-row';
  row.style.paddingLeft = `${6 + depth * 14}px`;
  row.title = dirPath;
  if (isSamePathRenderer(selectedDir(paneIdx), dirPath)) row.classList.add('selected');

  const caret = document.createElement('span');
  caret.className = 'area-dir-caret';
  caret.textContent = hasChildren ? (isExpanded(paneIdx, dirPath) ? '▾' : '▸') : '';
  caret.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!hasChildren) return;
    setExpanded(paneIdx, dirPath, !isExpanded(paneIdx, dirPath));
    await renderAreaPanel(paneIdx);
  });
  row.appendChild(caret);

  const label = document.createElement('span');
  label.className = 'area-dir-name';
  label.textContent = name;
  row.appendChild(label);

  row.addEventListener('click', async () => {
    state.areaPanel.selectedDirByPane[paneIdx] = dirPath;
    // Auswahl klappt den Ordner zugleich auf (haeufigster Arbeitsfluss).
    if (hasChildren && !isExpanded(paneIdx, dirPath)) setExpanded(paneIdx, dirPath, true);
    await renderAreaPanel(paneIdx);
  });
  return row;
}

// Vergleich wie area.js (Kleinschreibung, Backslashes) — lokale Kopie fuer
// die Selektions-Hervorhebung, bewusst ohne Import-Kette.
function isSamePathRenderer(a, b) {
  const norm = (p) =>
    String(p || '')
      .replace(/\//g, '\\')
      .replace(/[\\]+$/, '')
      .toLowerCase();
  const na = norm(a);
  return na !== '' && na === norm(b);
}

async function renderDirInto(container, paneIdx, dirPath, name, depth) {
  const listing = await ensureListing(dirPath);
  const hasChildren = listing.dirs.length > 0;
  container.appendChild(buildDirRow(paneIdx, dirPath, name, depth, hasChildren));
  if (hasChildren && isExpanded(paneIdx, dirPath)) {
    for (const child of listing.dirs) {
      await renderDirInto(container, paneIdx, joinPath(dirPath, child), child, depth + 1);
    }
  }
}

// 4T-0612 (Epic 3E-0115, PO-Testbefund): Dateiliste eines Ordners in ein
// losgeloestes Fragment bauen statt direkt in den Live-Container zu haengen.
// Der Aufrufer (renderAreaPanel) setzt das Fragment token-geschuetzt ein, damit
// ueberlappende Render-Laeufe sich nicht ins Gehege kommen.
async function buildFilesFragment(paneIdx, dirPath) {
  const listing = await ensureListing(dirPath);
  const frag = document.createDocumentFragment();
  if (listing.files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'area-files-empty';
    empty.textContent = t('areaPanel.filesEmpty');
    frag.appendChild(empty);
    return frag;
  }
  for (const name of listing.files) {
    const full = joinPath(dirPath, name);
    const row = document.createElement('div');
    row.className = 'area-file-row';
    row.textContent = name;
    row.title = full;
    row.addEventListener('click', () => {
      openInPane(paneIdx, [full]);
    });
    // 4T-0612 (Epic 3E-0115): Rechtsklick auf eine Datei-Zeile bietet "Als
    // Bereichs-Lesezeichen" an (nur bei aktiver Lesezeichen-Erweiterung).
    row.addEventListener('contextmenu', (ev) => showAreaFileContextMenu(ev, full));
    frag.appendChild(row);
  }
  return frag;
}

// 4T-0455 (Epic 3E-0084): Panel-weite Kontextmenue-Eintraege des Bereichs-
// Panels — derzeit der Einstieg zum Bereichs-Graph. Ausgelagert, weil sie
// sowohl auf freier Panel-Flaeche (showAreaPanelContextMenu) als auch auf
// Datei-Zeilen (showAreaFileContextMenu) erreichbar bleiben muessen.
// 4T-0620 (Epic 3E-0117): Die panel-weiten Eintraege sind seither zwei
// unabhaengige Einstiege — Bereichs-Graph und Bereichs-Statistik — mit je
// eigener Erweiterung. Das Menue erscheint, sobald MINDESTENS EINE der
// beiden aktiv ist, und zeigt genau die aktiven Eintraege.
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

// Haengt die panel-weiten Eintraege an ein Kontextmenue an (No-op ohne
// Bereich oder mit beiden Erweiterungen im Aus-Zustand).
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

// 4T-0612 (Epic 3E-0115): Kontextmenue einer Datei-Zeile im Bereichs-Panel.
// Zeigt EIN kombiniertes Menue: oben der Datei-Eintrag "Als Bereichs-
// Lesezeichen" (nur bei aktiver Lesezeichen-Erweiterung, die Datei liegt per
// Definition im Bereich), darunter durch einen Trenner abgesetzt die panel-
// weiten Eintraege (Bereichs-Graph). So bleiben die Panel-Eintraege auch auf
// Datei-Zeilen erreichbar (Bestand vor 4T-0612; sonst fing das Datei-Menue
// den Rechtsklick ab und verdeckte den Graph-Eintrag). Sind beide
// Erweiterungen aus, uebernimmt kein Eintrag und das Ereignis blubbert zum
// Sektions-Menue durch (dort greift dieselbe Graph-Pruefung).
function showAreaFileContextMenu(ev, absPath) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  const bookmarksActive = isExtensionActive('bookmarks');
  const panelAvailable = areaPanelItemsAvailable();
  if (!bookmarksActive && !panelAvailable) return;
  ev.preventDefault();
  ev.stopPropagation();
  menu.innerHTML = '';
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
  if (bookmarksActive && panelAvailable) {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);
  }
  appendAreaPanelItems(menu);
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

// 4T-0328: Inline-Eingabe fuer "Neue Datei in diesem Ordner" — erscheint am
// Kopf der Dateiliste; Enter legt an und oeffnet, Escape bricht ab.
function showNewFileInput(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.areaFiles || !state.areaPath) return;
  if (els.areaFiles.querySelector('.area-new-file-input')) {
    els.areaFiles.querySelector('.area-new-file-input').focus();
    return;
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'area-new-file-input';
  input.placeholder = t('areaPanel.newFilePlaceholder');
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      input.remove();
      return;
    }
    if (e.key !== 'Enter') return;
    const name = input.value.trim();
    if (!name) return;
    const dir = selectedDir(paneIdx);
    const result = await api.areaCreateFile(dir, name);
    if (result && result.ok) {
      input.remove();
      listingCache.delete(dir);
      await renderAreaPanel(paneIdx);
      // 4T-0427 (Epic 3E-0080): Datei-Anlage über die App durchläuft den
      // Ordner-Regel-Trigger (Vorlage füllen, öffnen, Cursor-Sprung).
      await openCreatedFileWithRule(paneIdx, result.path);
      return;
    }
    const key =
      result && result.error === 'exists' ? 'areaPanel.newFileExists' : 'areaPanel.newFileError';
    showStatusbarHint(key, { duration: 2500, error: true });
  });
  els.areaFiles.prepend(input);
  input.focus();
}

// 4T-0612 (Epic 3E-0115, PO-Testbefund EXE 0.91.0.919): Concurrency-Token pro
// Pane gegen doppelte Baum-Listen. renderAreaPanel ist async und haengt seine
// Zeilen ueber mehrere await-Punkte hinweg an; zwei ueberlappende Laeufe
// derselben Pane (etwa der Bereichs-Wechsel-Push refreshAreaPanels und das
// Slot-Mounting der Startsequenz applyAllLayouts, die beide renderAreaPanel
// rufen) leerten den Baum-Container nur je zu Beginn und haengten danach beide
// an — die Ordner-Struktur erschien doppelt. Jeder Lauf zieht jetzt eine
// Generation, baut in ein losgeloestes Fragment und setzt es nur ein, wenn ihn
// kein juengerer Lauf ueberholt hat.
const areaRenderToken = [0, 0];

// Rendert Baum und Dateiliste einer Pane neu (No-op bei unsichtbarem Panel).
export async function renderAreaPanel(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.areaSection) return;
  const hasArea = !!state.areaPath;
  if (els.areaEmpty) els.areaEmpty.hidden = hasArea;
  if (els.areaSplit) els.areaSplit.hidden = !hasArea;
  if (!hasArea || els.areaSection.hidden) return;

  const token = ++areaRenderToken[paneIdx];
  const root = state.areaPath;
  // Wurzel ist immer aufgeklappt sichtbar.
  const dir = selectedDir(paneIdx);
  if (els.areaTree) {
    if (!isExpanded(paneIdx, root)) setExpanded(paneIdx, root, true);
    const treeFrag = document.createDocumentFragment();
    await renderDirInto(treeFrag, paneIdx, root, state.areaName || root, 0);
    // Ueberholt? Dann verwirft dieser Lauf sein Ergebnis, statt es einzuhaengen.
    if (token !== areaRenderToken[paneIdx]) return;
    els.areaTree.innerHTML = '';
    els.areaTree.appendChild(treeFrag);
  }
  if (els.areaFilesTitle) {
    els.areaFilesTitle.textContent = dir === root ? state.areaName || '' : dir.split('\\').pop();
    els.areaFilesTitle.title = dir;
  }
  if (els.areaFiles) {
    const filesFrag = await buildFilesFragment(paneIdx, dir);
    if (token !== areaRenderToken[paneIdx]) return;
    els.areaFiles.innerHTML = '';
    els.areaFiles.appendChild(filesFrag);
  }
}

// --- Sichtbarkeit, Toggle, Persistenz (Muster Outline) -------------------------

export function getAreaPanelVisible(paneIdx) {
  // Dreiwertige Praeferenz (app-state.js): Default sichtbar in Spalte 0
  // einer Bereichs-App — auch im Empty-State (dort ist das Panel der
  // Einstieg zur ersten Datei). 4T-0330 (PO-Testbefund): KEIN erzwungenes
  // Sichtbar mehr am Schalter vorbei; der Statusbar-Toggle gilt auch ohne
  // offene Datei.
  return areaPanelVisiblePref(paneIdx);
}

export function applyAreaPanelVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.areaSection) return;
  const visible = getAreaPanelVisible(paneIdx);
  els.areaSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderAreaPanel(paneIdx);
  updateAreaToggleButton();
}

export function updateAreaToggleButton() {
  const btn = document.getElementById('btn-area');
  if (!btn) return;
  const visible = getAreaPanelVisible(state.activePaneIndex);
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleAreaPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !getAreaPanelVisible(paneIdx);
  state.areaPanel.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('area', paneIdx);
  applyAreaPanelVisibility(paneIdx);
  // 4T-0330: im Empty-State haengt die Pane-Container-Sichtbarkeit an den
  // Panel-Praeferenzen — nachziehen, damit Aus-Schalten die Sidebar ausblendet.
  updateEmptyState();
  await persistAreaPanelSettings();
  // 4T-0568 (Epic 3E-0104): Menue-Haekchen nachziehen (Muster panels.js).
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistAreaPanelSettings() {
  await persistSetting('areaPanel.visibleColumn0', !!state.areaPanel.visibleByPane[0]);
  await persistSetting('areaPanel.visibleColumn1', !!state.areaPanel.visibleByPane[1]);
}

export async function loadAreaPanelSettings() {
  const v0 = await api.getSetting('areaPanel.visibleColumn0');
  const v1 = await api.getSetting('areaPanel.visibleColumn1');
  // Nur explizit persistierte Werte uebernehmen; undefined laesst den
  // dreiwertigen Default (null) stehen, damit Bereichs-Fenster unabhaengig
  // von der Lade-Reihenfolge mit sichtbarem Panel starten.
  if (v0 !== undefined && v0 !== null) state.areaPanel.visibleByPane[0] = !!v0;
  if (v1 !== undefined && v1 !== null) state.areaPanel.visibleByPane[1] = !!v1;
}

// Nach Bereichs-Wechseln (DisplayInfo-Push) alles frisch aufbauen. Den
// Sichtbarkeits-Default fuer Bereichs-Fenster liefert getAreaPanelVisible
// (dreiwertiges Modell), hier wird nichts geschaltet.
export function refreshAreaPanels() {
  invalidateAreaListings();
  // Empty-State-Mechanik nachziehen: die leere Bereichs-App zeigt den
  // Pane-Container (Sidebar) statt ihn komplett zu verstecken.
  updateEmptyState();
  for (let i = 0; i < state.panes.length; i++) {
    state.areaPanel.selectedDirByPane[i] = null;
    state.areaPanel.expandedByPane[i] = [];
    applyAreaPanelVisibility(i);
  }
}

// 4T-0328: Struktur-Aenderungen im Bereich (Main-Watcher, debounced) —
// Listings neu lesen, sichtbare Panels unter Erhalt von Aufklapp- und
// Auswahl-Zustand neu rendern. Synchron beim Modul-Laden registriert.
if (typeof api.onAreaChanged === 'function') {
  api.onAreaChanged(() => {
    invalidateAreaListings();
    for (let i = 0; i < state.panes.length; i++) {
      if (getAreaPanelVisible(i)) renderAreaPanel(i);
    }
  });
}

// 4T-0455 (Epic 3E-0084): Kontextmenü des Bereichs-Panels auf freier Fläche —
// Einstieg zum Bereichs-Graph (Task-Zugang neben dem Ansicht-Menü). Listener
// auf die ganze Sektion (Muster Bookmarks-Sektion); bei deaktivierter graph-
// view-Erweiterung erscheint kein Menü (kein toter Eintrag). Rechtsklicks auf
// Datei-Zeilen fängt showAreaFileContextMenu vorher ab (stopPropagation) und
// nimmt die Panel-Einträge dort mit auf.
function showAreaPanelContextMenu(ev) {
  if (!areaPanelItemsAvailable()) return;
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  ev.preventDefault();
  menu.innerHTML = '';
  appendAreaPanelItems(menu);
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

for (let i = 0; i < 2; i++) {
  const els = getPaneEls(i);
  if (els && els.areaSection) {
    els.areaSection.addEventListener('contextmenu', (ev) => showAreaPanelContextMenu(ev));
  }
}

// 4T-0328: "+"-Buttons am Dateilisten-Kopf beider Panes verdrahten (statisches
// Markup, einmalige Bindung beim Modul-Laden).
for (let i = 0; i < 2; i++) {
  const els = getPaneEls(i);
  if (els && els.areaNewFileBtn) {
    els.areaNewFileBtn.addEventListener('click', () => showNewFileInput(i));
  }
}

// 4T-0330 (PO-Testbefund-Nachlauf): Statusbar-Toggle synchron beim Modul-
// Laden binden statt in init() — das Panel ist ueber den fruehen
// DisplayInfo-Push schon sichtbar, bevor init() durch ist; ein Klick in
// dieser Phase verpuffte sonst wirkungslos.
{
  const btnArea = document.getElementById('btn-area');
  if (btnArea) {
    btnArea.addEventListener('click', () => toggleAreaPanel(state.activePaneIndex));
  }
}

// --- Registry-Anbindung ---------------------------------------------------------

registerSidebarPanel({
  id: 'area',
  titleKey: 'areaPanel.title',
  buttonId: 'btn-area',
  sectionClass: 'sidebar-area',
  getVisible: (paneIdx) => getAreaPanelVisible(paneIdx),
  applyVisibility: applyAreaPanelVisibility,
  toggle: toggleAreaPanel,
});
