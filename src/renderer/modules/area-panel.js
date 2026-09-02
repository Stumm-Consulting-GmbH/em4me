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
// 4T-1365 (Epic 3E-0171): Start-Seite (Merker, Kennzeichnung) und die
// Kontextmenues des Panels als eigene Module; beide Abhaengigkeiten laufen nur
// in diese Richtung.
import { ladeStartSeite, markiereStartSeite } from './area-start-page.js';
import { showAreaFileContextMenu, showAreaPanelContextMenu } from './area-panel-menus.js';
// 4T-1225 (Epic 3E-0122, Befund F1 des Linux-Nachweises): Pfad-Trenner und
// Vergleichs-Verhalten kommen aus dem zentralen Plattform-Modul; der frueher
// hart verdrahtete Backslash liess unter Linux Pfade wie `/bereich\ordner`
// entstehen, deren Listing still leer blieb.
import { isFilesystemCaseInsensitive, pathSeparator } from '../../shared/platform.js';

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
  return `${dir.replace(/[\\/]+$/, '')}${pathSeparator()}${name}`;
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

// Vergleich fuer die Selektions-Hervorhebung — lokale Kopie ohne Import-Kette
// zu area.js. 4T-1225: Kleinschreibung und Backslash-Normierung gelten nur auf
// case-insensitiven Dateisystemen (zentrale Plattform-Auskunft); unter Linux
// sind zwei nur in der Schreibweise verschiedene Pfade zwei Orte, und der
// Backslash ist dort ein legales Namenszeichen.
function isSamePathRenderer(a, b) {
  const norm = (p) => {
    let s = String(p || '');
    if (isFilesystemCaseInsensitive()) s = s.replace(/\//g, '\\').toLowerCase();
    return s.replace(/[\\/]+$/, '');
  };
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
    markiereStartSeite(row, full); // 4T-1365 (Epic 3E-0171)
    row.addEventListener('click', () => {
      openInPane(paneIdx, [full]);
    });
    // 4T-0612 (Epic 3E-0115): Rechtsklick auf eine Datei-Zeile bietet "Als
    // Bereichs-Lesezeichen" an (nur bei aktiver Lesezeichen-Erweiterung).
    row.addEventListener('contextmenu', (ev) =>
      showAreaFileContextMenu(ev, full, refreshSichtbareAreaPanels),
    );
    frag.appendChild(row);
  }
  return frag;
}

// 4T-1365 (Epic 3E-0171): Neuaufbau aller sichtbaren Bereichs-Panels; als
// Rueckruf an die Kontextmenues gereicht, damit dort kein Rueckgriff auf dieses
// Modul noetig ist (kein Zyklus).
function refreshSichtbareAreaPanels() {
  for (let i = 0; i < state.panes.length; i++) {
    if (getAreaPanelVisible(i)) void renderAreaPanel(i);
  }
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
  // 4T-1365 (Epic 3E-0171): Start-Seite vor dem Aufbau lesen, damit die
  // Kennzeichnung der Datei-Zeilen synchron entscheidbar bleibt.
  await ladeStartSeite();
  if (token !== areaRenderToken[paneIdx]) return;
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
    els.areaFilesTitle.textContent = dir === root ? state.areaName || '' : dir.split(/[\\/]/).pop();
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

// 4T-0455 (Epic 3E-0084): Kontextmenü des Bereichs-Panels auf freier Fläche.
// Listener auf die ganze Sektion (Muster Bookmarks-Sektion); Rechtsklicks auf
// Datei-Zeilen fängt showAreaFileContextMenu vorher ab (stopPropagation) und
// nimmt die Panel-Einträge dort mit auf. Beide Menüs liegen seit 4T-1365 in
// area-panel-menus.js.
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
