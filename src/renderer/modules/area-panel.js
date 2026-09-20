// 4T-000327 (Epic 3E-000059): Bereichs-Panel — Ordnerbaum des Bereichs oben,
// Markdown-Dateiliste des ausgewaehlten Ordners darunter. Registriert sich
// als siebtes Panel an der Sidebar-Registry (links/rechts andockbar,
// Reiter-Gruppen-faehig); ohne aktiven Bereich zeigt der Body einen
// Empty-State. Verzeichnis-Daten liefert der Main-Prozess (area:listDir,
// lazy pro aufgeklapptem Ordner); alle Eintraege tragen den vollen Pfad
// als Tooltip (PO-Entscheidung). Die BESCHRIFTUNG einer Datei-Zeile steht seit
// 4T-001775 ohne Markdown-Endung (Epic 3E-000304); der Tooltip fuehrt weiter
// den vollen Pfad und ist damit die Auskunft ueber den echten Dateinamen.
'use strict';

import { t } from '../i18n.js';

import { api } from './app/api.js';
import { areaPanelVisiblePref, getPaneEls, state } from './app/app-state.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
// Sichtbarkeits-Anwendung laeuft ueber das Slot-Mounting der dynamischen
// Sidebar (Muster der Bestands-Panels in panels.js).
import { applySidebarVisibility } from './panels/panels.js';
// 4T-000568 (Epic 3E-000104): reportMenuStateNow — Haekchen im Panel-Untermenue
// folgt dem Toggle (Muster panels.js).
import { openInPane, reportMenuStateNow } from './tabs/tabs.js';
import { persistSetting, updateEmptyState } from './views/views.js';
// 4T-001365 (Epic 3E-000171): Start-Seite (Merker, Kennzeichnung) und die
// Kontextmenues des Panels als eigene Module; 4T-001349 (Epic 3E-000170)
// ergaenzt die Anlage-Wege. Alle Abhaengigkeiten laufen nur in diese Richtung.
import { ladeStartSeite, markiereStartSeite } from './area-start-page.js';
import {
  showAreaDirContextMenu,
  showAreaFileContextMenu,
  showAreaPanelContextMenu,
} from './area-panel-menus.js';
import { erstelleAnlageWege } from './area-panel-anlage.js';
// 4T-001225 (Epic 3E-000122, Befund F1 des Linux-Nachweises): Pfad-Trenner und
// Vergleichs-Verhalten kommen aus dem zentralen Plattform-Modul; der frueher
// hart verdrahtete Backslash liess unter Linux Pfade wie `/bereich\ordner`
// entstehen, deren Listing still leer blieb.
import { isFilesystemCaseInsensitive, pathSeparator } from '../../shared/platform.js';
// 4T-001775 (Epic 3E-000304): Beschriftung einer Datei-Zeile ohne Markdown-
// Endung — dieselbe Quelle wie die Reiter-Beschriftung (keine zweite
// Endungs-Liste, Epic-Entscheidung E3).
import { fileLabelFromBasename } from '../../shared/subpages.js';

// Listing-Cache pro Ordner-Pfad ({ dirs, files }). Wird beim Bereichs-
// Wechsel und bei Watcher-Ereignissen (4T-000328) verworfen.
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

// 4T-001349 (Epic 3E-000170): Die beiden Anlage-Wege liegen in einem eigenen
// Modul und bekommen hier einmal die Bruecke zum Panel gereicht — Neuaufbau,
// Listing-Verwerfung, Auswahl und Aufklapp-Zustand. Der Rueckruf-Weg vermeidet
// den Import-Zyklus (Muster area-panel-menus.js).
const anlageWege = erstelleAnlageWege({
  render: (paneIdx) => renderAreaPanel(paneIdx),
  listingVerwerfen: (dirPath) => listingCache.delete(dirPath),
  ausgewaehlterOrdner: selectedDir,
  istGleicherPfad: isSamePathRenderer,
  istAufgeklappt: isExpanded,
  setzeAufgeklappt: setExpanded,
});

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
  // 4T-001349 (Epic 3E-000170): Rechtsklick auf eine Ordner-Zeile bietet die
  // Anlage von Unterordner und Markdown-Datei IN DIESEM Ordner an — nicht im
  // gerade ausgewaehlten (AK8). Der Aufruf faengt das Ereignis ab, sonst
  // uebernaehme das Sektions-Menue mit den panel-weiten Eintraegen.
  row.addEventListener('contextmenu', (ev) =>
    showAreaDirContextMenu(ev, dirPath, {
      neuerOrdner: (d) => void anlageWege.neuerOrdner(paneIdx, d),
      neueDatei: (d) => void anlageWege.neueDatei(paneIdx, d),
    }),
  );
  return row;
}

// Vergleich fuer die Selektions-Hervorhebung — lokale Kopie ohne Import-Kette
// zu area.js. 4T-001225: Kleinschreibung und Backslash-Normierung gelten nur auf
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

// 4T-000612 (Epic 3E-000115, PO-Testbefund): Dateiliste eines Ordners in ein
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
    // 4T-001775 (Epic 3E-000304, Entscheidung des Product Owners vom
    // 2026-09-17, die E5 revidiert): Die Beschriftung steht OHNE Markdown-
    // Endung — dieselbe Form wie am Reiter, in der Titelzeile und im
    // Brotkrumen-Pfad. Gekuerzt ist allein die ANZEIGE: Klick, Umbenennen,
    // Loeschen und Kurzhinweis arbeiten unveraendert mit `full`, und der
    // Kurzhinweis ist damit der Ort, an dem zwei gleichstaemmige Dateien
    // ('Notiz.md' und 'Notiz.markdown') unterscheidbar bleiben (E8).
    //
    // Fremde Dateiarten behalten ihre Endung (E4). Im Listing des Bereichs
    // erscheinen sie heute nicht — area:listDir filtert auf Markdown —, der
    // Rueckfall der gemeinsamen Funktion gilt hier aber unverdreht weiter.
    row.textContent = fileLabelFromBasename(name);
    row.title = full;
    markiereStartSeite(row, full); // 4T-001365 (Epic 3E-000171)
    row.addEventListener('click', () => {
      openInPane(paneIdx, [full]);
    });
    // 4T-000612 (Epic 3E-000115): Rechtsklick auf eine Datei-Zeile bietet "Als
    // Bereichs-Lesezeichen" an (nur bei aktiver Lesezeichen-Erweiterung).
    row.addEventListener('contextmenu', (ev) =>
      showAreaFileContextMenu(ev, full, refreshSichtbareAreaPanels),
    );
    frag.appendChild(row);
  }
  return frag;
}

// 4T-001365 (Epic 3E-000171): Neuaufbau aller sichtbaren Bereichs-Panels; als
// Rueckruf an die Kontextmenues gereicht, damit dort kein Rueckgriff auf dieses
// Modul noetig ist (kein Zyklus).
//
// 4T-001731 (Epic 3E-000306): Der Rueckruf verwirft seither ZUERST die
// Listings. Er ist der Nachzug nach einer Aenderung durch das Kontextmenue, und
// seit dem Kopieren gehoert dazu eine Aenderung am Verzeichnis-Inhalt selbst:
// Ohne die Verwerfung baute der Neuaufbau aus dem Zwischenspeicher und zeigte
// die Kopie erst, wenn der gedrosselte Verzeichnis-Waechter nachkommt — also
// nicht unmittelbar (AK9). Dieselbe Reihenfolge fahren die Anlage-Wege
// (area-panel-anlage.js: verwerfen, dann rendern). Fuer den zweiten Nutzer des
// Rueckrufs, die Start-Seiten-Festlegung, kostet das ein erneutes Listing je
// sichtbarer Pane und aendert sonst nichts.
function refreshSichtbareAreaPanels() {
  invalidateAreaListings();
  for (let i = 0; i < state.panes.length; i++) {
    if (getAreaPanelVisible(i)) void renderAreaPanel(i);
  }
}

// 4T-000612 (Epic 3E-000115, PO-Testbefund EXE 0.91.0.919): Concurrency-Token pro
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
  // 4T-001365 (Epic 3E-000171): Start-Seite vor dem Aufbau lesen, damit die
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
  // Einstieg zur ersten Datei). 4T-000330 (PO-Testbefund): KEIN erzwungenes
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
  // 4T-000330: im Empty-State haengt die Pane-Container-Sichtbarkeit an den
  // Panel-Praeferenzen — nachziehen, damit Aus-Schalten die Sidebar ausblendet.
  updateEmptyState();
  await persistAreaPanelSettings();
  // 4T-000568 (Epic 3E-000104): Menue-Haekchen nachziehen (Muster panels.js).
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

// 4T-000328: Struktur-Aenderungen im Bereich (Main-Watcher, debounced) —
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

// 4T-000455 (Epic 3E-000084): Kontextmenü des Bereichs-Panels auf freier Fläche.
// Listener auf die ganze Sektion (Muster Bookmarks-Sektion); Rechtsklicks auf
// Datei-Zeilen fängt showAreaFileContextMenu vorher ab (stopPropagation) und
// nimmt die Panel-Einträge dort mit auf. Beide Menüs liegen seit 4T-001365 in
// area-panel-menus.js.
for (let i = 0; i < 2; i++) {
  const els = getPaneEls(i);
  if (els && els.areaSection) {
    els.areaSection.addEventListener('contextmenu', (ev) => showAreaPanelContextMenu(ev));
  }
}

// 4T-000328: "+"-Buttons am Dateilisten-Kopf beider Panes verdrahten (statisches
// Markup, einmalige Bindung beim Modul-Laden).
for (let i = 0; i < 2; i++) {
  const els = getPaneEls(i);
  if (els && els.areaNewFileBtn) {
    els.areaNewFileBtn.addEventListener('click', () => void anlageWege.neueDatei(i));
  }
}

// 4T-000330 (PO-Testbefund-Nachlauf): Statusbar-Toggle synchron beim Modul-
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
