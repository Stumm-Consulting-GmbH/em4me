// Lesezeichen-Baum: Persistenz, Rendering, Drag-and-Drop, Inline-Edit und Kontextmenue.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { EditorView } from '@codemirror/view';
import { t } from '../i18n.js';

import { api } from './api.js';
import { activeTab, getPaneEls, state } from './app-state.js';
// 4T-0294 (Epic 3E-0052): Lesezeichen sind eine Werkzeug-Erweiterung.
// Abschalten meldet nur die UI ab — der persistierte Bookmark-Baum
// bleibt erhalten und kehrt beim Einschalten zurueck (Daten-Schonung).
import { isExtensionActive } from './extension-lifecycle.js';
import { paneEditors } from './editor.js';
import { applySidebarVisibility } from './panels.js';

import {
  activatePane,
  activateTab,
  findTabAcrossPanes,
  openInPane,
  reportMenuStateNow,
} from './tabs.js';
import {
  isAllEmpty,
  persistSetting,
  scrollRenderedToLine,
  showStatusbarHint,
  updateEmptyState,
} from './views.js';
import { hideContextMenu, placeContextMenuAt } from './dialogs.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Panel-Registry — Bookmarks registriert
// sich am Modul-Ende; Einblenden aktiviert den Gruppen-Reiter.
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';

// === 4T-0075 (Epic 3E-0013): Bookmarks-Basis ================================
// Persistente Lesezeichen mit Tree-Datenmodell (Folder + File-Knoten).
// In dieser Basis-Stufe ist der Tree praktisch flach (alle Bookmarks im
// Root), weil es noch keine UI zum Erzeugen von Ordnern gibt. Die
// Folder-Knoten werden vom Render-Pfad jedoch schon unterstuetzt, damit
// 4T-0078 (Ordner-Operationen) und 4T-0079 (Drag-and-Drop) ohne Migration
// aufsetzen koennen.

export const BOOKMARK_ICON_FILE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
export const BOOKMARK_ICON_FOLDER_OPEN =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>';
export const BOOKMARK_ICON_FOLDER_CLOSED =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
export const BOOKMARK_ICON_CHEVRON =
  '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

export function newBookmarkId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Tiefe Kopie des Baums fuer Update-Operationen. Da der Baum ueberschaubar
// klein ist (typisch < 100 Knoten), reicht JSON-Roundtrip.
export function cloneBookmarksTree() {
  return JSON.parse(JSON.stringify(state.bookmarks.tree || []));
}

export function findBookmarkByPath(nodes, filePath) {
  if (!nodes || !filePath) return null;
  for (const n of nodes) {
    if (n.type === 'file' && n.filePath === filePath) return n;
    if (n.type === 'folder' && Array.isArray(n.children)) {
      const hit = findBookmarkByPath(n.children, filePath);
      if (hit) return hit;
    }
  }
  return null;
}

export function findNodeById(nodes, id) {
  if (!nodes || !id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === 'folder' && Array.isArray(n.children)) {
      const hit = findNodeById(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function removeNodeById(nodes, id) {
  if (!nodes) return false;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1);
      return true;
    }
    if (nodes[i].type === 'folder' && Array.isArray(nodes[i].children)) {
      if (removeNodeById(nodes[i].children, id)) return true;
    }
  }
  return false;
}

// 4T-0078: Liefert das Array, in dem der Knoten direkt liegt (Parent-Children
// oder Root). Wird beim Verschieben und Loeschen gebraucht, um den Knoten
// aus dem alten Container zu entfernen.
export function findParentArray(rootArray, id, parentArray) {
  const arr = parentArray || rootArray;
  if (!arr) return null;
  for (const n of arr) {
    if (n.id === id) return arr;
    if (n.type === 'folder' && Array.isArray(n.children)) {
      const hit = findParentArray(rootArray, id, n.children);
      if (hit) return hit;
    }
  }
  return null;
}

// 4T-0078: Liefert {parent, container, index} fuer den Knoten mit der id.
// parent ist der Folder-Knoten (oder null, wenn der Knoten direkt im Root
// liegt). container ist das Array, in dem der Knoten enthalten ist. index
// ist die Position im container. Liefert null, wenn die id nicht gefunden.
export function findNodeLocation(tree, id, parent) {
  if (!Array.isArray(tree)) return null;
  for (let i = 0; i < tree.length; i++) {
    const n = tree[i];
    if (n.id === id) return { parent: parent || null, container: tree, index: i };
    if (n.type === 'folder' && Array.isArray(n.children)) {
      const hit = findNodeLocation(n.children, id, n);
      if (hit) return hit;
    }
  }
  return null;
}

// 4T-0078: Sammelt alle IDs des Teilbaums ab `node` (inkl. node selbst).
// Wird im Modal-Picker fuer den Zyklus-Schutz gebraucht (verbotene Ziele).
export function collectSubtreeIds(node) {
  const ids = new Set();
  function walk(n) {
    if (!n || !n.id) return;
    ids.add(n.id);
    if (n.type === 'folder' && Array.isArray(n.children)) {
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return ids;
}

// 4T-0183 (Knip-Zusatzfund): sortFoldersFirst entfernt — ohne Aufrufer;
// "Folder first" wird ueber die Insert-Logik (insertAtEndOfGroup) und die
// einmalige Migration in loadBookmarksTree gesichert.

// 4T-0078: Neuen Knoten am Ende seiner Type-Gruppe in den Container einfuegen.
// Folder-Knoten landen vor dem ersten File-Knoten; File-Knoten am Ende.
// Damit ist die persistierte Daten-Reihenfolge konsistent mit dem Render.
export function insertAtEndOfGroup(container, node) {
  if (!Array.isArray(container) || !node) return;
  if (node.type === 'folder') {
    const firstFileIdx = container.findIndex((n) => n && n.type === 'file');
    if (firstFileIdx < 0) container.push(node);
    else container.splice(firstFileIdx, 0, node);
  } else {
    container.push(node);
  }
}

// 4T-0078: Zaehlt rekursiv die Inhalte eines Folders.
export function countFolderContents(folder) {
  let files = 0;
  let folders = 0;
  function walk(node) {
    if (!node || !Array.isArray(node.children)) return;
    for (const c of node.children) {
      if (c.type === 'file') files++;
      else if (c.type === 'folder') {
        folders++;
        walk(c);
      }
    }
  }
  walk(folder);
  return { files, folders };
}

export async function persistBookmarksTree() {
  // 4T-0079 Bugfix: Tree wandert auf eigenen Key 'bookmarksTree'. Vorher
  // wurde 'bookmarks' als Array geschrieben, was die unter dem gleichen
  // Top-Level-Key liegenden Punkt-Notationen 'bookmarks.visibleColumn0'
  // und 'bookmarks.sortMigrationDone' aus electron-store entfernte (Array
  // ueberschreibt Object). Folge: Sichtbarkeits-Preference ueberlebte den
  // App-Neustart nicht.
  // W-20 (4T-0309): ueber den Persist-Helfer — ein Store-Schreibfehler wuerde
  // die Struktur-Aenderung sonst still beim naechsten Start verlieren.
  await persistSetting('bookmarksTree', state.bookmarks.tree);
}

export async function loadBookmarksTree() {
  let stored = await api.getSetting('bookmarksTree');
  if (!Array.isArray(stored)) {
    // 4T-0079 Bugfix: Migration vom alten Key 'bookmarks' (Array) auf den
    // neuen Key 'bookmarksTree'. Aelter gespeicherte Trees liegen unter
    // 'bookmarks' und werden hier umkopiert. Anschliessend wird 'bookmarks'
    // auf null gesetzt, damit das Object-Format ('bookmarks.visibleColumn0'
    // etc.) wieder Platz hat.
    const legacy = await api.getSetting('bookmarks');
    if (Array.isArray(legacy)) {
      stored = legacy;
      await api.setSetting('bookmarksTree', legacy);
      await api.setSetting('bookmarks', null);
    }
  }
  state.bookmarks.tree = Array.isArray(stored) ? stored : [];
  // 4T-0079: Einmalige Migration in "Folder first"-Reihenfolge fuer
  // Bestandsdaten aus 4T-0075/4T-0078-Zeit (vor der Insert-Sort-Einfuehrung
  // konnten Knoten in gemischter Reihenfolge entstehen). Ab 4T-0079
  // respektiert das Rendering die Daten-Reihenfolge 1:1, damit Drag-and-Drop
  // frei sortieren kann.
  const migrationDone = await api.getSetting('bookmarks.sortMigrationDone');
  if (!migrationDone && state.bookmarks.tree.length > 0) {
    applyFolderFirstSortInPlace(state.bookmarks.tree);
    await persistBookmarksTree();
  }
  if (!migrationDone) {
    await api.setSetting('bookmarks.sortMigrationDone', true);
  }
}

// 4T-0079: In-place rekursive Folder-First-Sortierung. Wird einmalig bei
// der Migration aufgerufen; danach respektiert das Rendering die Daten-
// Reihenfolge 1:1, damit DnD frei sortieren kann.
export function applyFolderFirstSortInPlace(nodes) {
  if (!Array.isArray(nodes)) return;
  nodes.sort((a, b) => {
    const ai = a && a.type === 'folder' ? 0 : 1;
    const bi = b && b.type === 'folder' ? 0 : 1;
    return ai - bi;
  });
  for (const n of nodes) {
    if (n.type === 'folder' && Array.isArray(n.children)) {
      applyFolderFirstSortInPlace(n.children);
    }
  }
}

// 4T-0339 (Epic 3E-0061): Datei-Umbenennen — gespeicherte Lesezeichen-Pfade
// nachziehen. Der Anzeigename wird nur mitgezogen, wenn er dem alten
// Dateinamen entspricht (vom Nutzer umbenannte Lesezeichen bleiben).
export async function updateBookmarkPathsForRename(oldPath, newPath) {
  let changed = false;
  const oldName = api.basename(oldPath);
  const newName = api.basename(newPath);
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n && n.type === 'file' && n.filePath === oldPath) {
        if (n.displayName === oldName) n.displayName = newName;
        n.filePath = newPath;
        changed = true;
      } else if (n && n.type === 'folder') {
        walk(n.children);
      }
    }
  };
  walk(state.bookmarks.tree);
  if (changed) {
    await persistBookmarksTree();
    for (let p = 0; p < state.panes.length; p++) renderBookmarks(p);
  }
  return changed;
}

export async function persistBookmarksSettings() {
  await api.setSetting('bookmarks.visibleColumn0', !!state.bookmarks.visibleByPane[0]);
  await api.setSetting('bookmarks.visibleColumn1', !!state.bookmarks.visibleByPane[1]);
}

export async function loadBookmarksSettings() {
  const v0 = await api.getSetting('bookmarks.visibleColumn0');
  const v1 = await api.getSetting('bookmarks.visibleColumn1');
  state.bookmarks.visibleByPane[0] = !!v0;
  state.bookmarks.visibleByPane[1] = !!v1;
}

export async function addBookmarkForActiveFile() {
  const tab = activeTab();
  if (!tab || !tab.path) {
    showStatusbarHint(null, { text: t('bookmarks.add.untitled'), duration: 2000 });
    return;
  }
  const existing = findBookmarkByPath(state.bookmarks.tree, tab.path);
  if (existing) {
    showStatusbarHint(null, { text: t('bookmarks.add.alreadyExists'), duration: 2000 });
    return;
  }
  const isFirstBookmark = !Array.isArray(state.bookmarks.tree) || state.bookmarks.tree.length === 0;
  const tree = cloneBookmarksTree();
  const displayName = api.basename(tab.path);
  const node = {
    type: 'file',
    id: newBookmarkId('b'),
    filePath: tab.path,
    displayName,
    addedAt: new Date().toISOString(),
  };

  // 4T-0078: Ablage-Logik. Wenn die Sidebar-Sektion sichtbar ist und ein
  // Folder selektiert ist -> in diesen Folder; wenn ein Bookmark selektiert
  // ist -> auf gleicher Ebene wie dieser (Geschwister); sonst -> im Root.
  let parentFolderName = '';
  let placed = false;
  const sel = state.bookmarks.selectedId;
  const sectionVisible = !!state.bookmarks.visibleByPane[state.activePaneIndex];
  if (sel && sectionVisible) {
    const loc = findNodeLocation(tree, sel);
    if (loc) {
      const selNode = loc.container[loc.index];
      if (selNode.type === 'folder') {
        if (!Array.isArray(selNode.children)) selNode.children = [];
        // 4T-0078: ans Ende der File-Gruppe in diesem Ordner.
        insertAtEndOfGroup(selNode.children, node);
        selNode.expanded = true;
        parentFolderName = selNode.name || '';
        placed = true;
      } else {
        // Bookmark selektiert -> auf gleicher Ebene direkt dahinter. Da
        // der selektierte Bookmark in der File-Gruppe liegt, bleibt der
        // neue Knoten in derselben Gruppe (Folder-First-Ordnung erhalten).
        loc.container.splice(loc.index + 1, 0, node);
        parentFolderName = loc.parent ? loc.parent.name || '' : '';
        placed = true;
      }
    }
  }
  if (!placed) insertAtEndOfGroup(tree, node);
  state.bookmarks.tree = tree;
  await persistBookmarksTree();
  // 4T-0075: Beim ersten Bookmark die Sektion automatisch sichtbar machen
  // und persistieren - sonst muesste der Nutzer den Statusbar-Stern oder
  // das Menue zusaetzlich nutzen, um zu sehen, dass etwas passiert ist.
  if (isFirstBookmark) {
    state.bookmarks.visibleByPane[state.activePaneIndex] = true;
    await persistBookmarksSettings();
    applyBookmarksVisibility(state.activePaneIndex);
    // R3-11 (4T-0187): auch die andere Pane rendern — eine dort bereits
    // sichtbare (leere) Bookmarks-Sektion zeigte den neuen Eintrag nicht.
    for (let i = 0; i < state.panes.length; i++) {
      if (i !== state.activePaneIndex) renderBookmarks(i);
    }
    if (typeof reportMenuStateNow === 'function') reportMenuStateNow();
  } else {
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  }
  updateBookmarksToggleButton();
  // 4T-0078: Toast nennt die Ablage-Stelle, sofern in einem Ordner.
  const toastKey = parentFolderName ? 'bookmarks.add.toast.inFolder' : 'bookmarks.add.toast';
  const toastText = t(toastKey)
    .replace('{name}', displayName)
    .replace('{folder}', parentFolderName);
  showStatusbarHint(null, { text: toastText, duration: 2000 });
}

export async function removeBookmark(id) {
  const tree = cloneBookmarksTree();
  if (!removeNodeById(tree, id)) return;
  state.bookmarks.tree = tree;
  if (state.bookmarks.selectedId === id) state.bookmarks.selectedId = null;
  await persistBookmarksTree();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
  // 4T-0075: Wenn jetzt kein Bookmark mehr da ist und kein Tab offen, soll
  // der Empty-State-Pane wieder ausgeblendet werden (Sidebar verschwindet).
  if (state.bookmarks.tree.length === 0) updateEmptyState();
}

// 4T-0079: Wenn der Nutzer in der Lesezeichen-Sidebar aktiv mit einem Knoten
// interagiert (Klick), persistieren wir die Sektions-Sichtbarkeit auf true.
// Seit 4T-0330 zeigt der Empty-State die Sektion nur noch bei
// eingeschaltetem Schalter (kein Override mehr) — der Auto-Set ist damit in
// der Regel ein No-op und bleibt als Absicherung erhalten, dass eine aktiv
// genutzte Sektion nach dem Oeffnen einer Datei sichtbar bleibt.
export async function ensureBookmarksSectionPersistedVisible() {
  if (state.bookmarks.visibleByPane[state.activePaneIndex]) return;
  state.bookmarks.visibleByPane[state.activePaneIndex] = true;
  await persistBookmarksSettings();
  if (typeof reportMenuStateNow === 'function') reportMenuStateNow();
}

export async function toggleBookmarkFolder(id) {
  const tree = cloneBookmarksTree();
  const node = findNodeById(tree, id);
  if (!node || node.type !== 'folder') return;
  node.expanded = !node.expanded;
  state.bookmarks.tree = tree;
  await persistBookmarksTree();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
}

export async function openBookmarkFile(filePath) {
  if (!filePath) return;
  try {
    const exists = await api.fileExists(filePath);
    if (!exists) {
      showStatusbarHint(null, { text: t('bookmarks.notFound'), error: true, duration: 2500 });
      // Re-Render, damit der Eintrag visuell als "fehlend" markiert wird.
      for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
      return;
    }
  } catch {
    /* fileExists-Fehler: still ignorieren, openOrJumpToPath haendelt das */
  }
  await openOrJumpToPath(filePath, 1);
}

export function renderBookmarks(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookmarksTree || !els.bookmarksEmpty) return;
  const tree = state.bookmarks.tree;
  els.bookmarksTree.innerHTML = '';
  const isEmpty = !tree || tree.length === 0;
  els.bookmarksEmpty.hidden = !isEmpty;
  // 4T-0078: Rechtsklick auf den ganzen Sektions-Bereich (Header, leerer
  // Bereich unter der Liste, ul selbst) zeigt "Neuer Ordner". Klicks auf
  // einen Knoten werden vom Knoten-Listener mit stopPropagation abgefangen,
  // bevor dieser hier feuert. Listener wird nur einmal pro Sektion gebunden;
  // die Section selbst wird zwischen Renders nicht ersetzt.
  if (els.bookmarksSection && !els.bookmarksSection.dataset.contextBound) {
    els.bookmarksSection.addEventListener('contextmenu', (ev) => {
      // Knoten-Listener stoppen die Propagation eigentlich; defensiv
      // pruefen, ob der Klick tatsaechlich nicht auf einem Knoten landet.
      if (ev.target.closest && ev.target.closest('.bookmark-node')) return;
      ev.preventDefault();
      showBookmarkContextMenu(ev, null);
    });
    els.bookmarksSection.dataset.contextBound = '1';
  }
  // 4T-0079: Drop auf den leeren Sektions-Bereich (oder Empty-Hinweis)
  // legt am Ende des Roots ab. Listener auf die ganze Sektion; Knoten-
  // Handler greifen via stopPropagation davor.
  if (els.bookmarksSection && !els.bookmarksSection.dataset.dndBound) {
    els.bookmarksSection.addEventListener('dragover', (ev) => {
      handleBookmarkDragOverRoot(ev, els.bookmarksSection);
    });
    els.bookmarksSection.addEventListener('drop', (ev) => {
      if (ev.target.closest && ev.target.closest('.bookmark-row')) return;
      handleBookmarkDrop(ev);
    });
    els.bookmarksSection.addEventListener('dragleave', (ev) => {
      // Indikator wegnehmen, sobald die Maus die Sektion verlaesst (nicht
      // bei jedem Hover-Wechsel zwischen Kindern).
      if (!els.bookmarksSection.contains(ev.relatedTarget)) {
        clearAllBookmarkDropIndicators();
      }
    });
    els.bookmarksSection.dataset.dndBound = '1';
  }
  if (isEmpty) return;
  // 4T-0079: Render iteriert in Daten-Reihenfolge (kein Render-Sort mehr,
  // damit DnD die Reihenfolge frei bestimmen kann). Folder-First wird ueber
  // die Insert-Logik (insertAtEndOfGroup) und die einmalige Migration in
  // loadBookmarksTree gesichert.
  for (const node of tree) {
    const li = renderBookmarkNode(node, 0);
    if (li) els.bookmarksTree.appendChild(li);
  }
  // Datei-Existenz-Check pro Bookmark.
  // R3-08 (4T-0180): Ergebnis gecacht — renderBookmarks laeuft ueber die
  // applyAllLayouts-Kaskade bei jedem Tab-Klick und feuerte zuvor pro
  // Bookmark einen fileExists-IPC. Cache-Pflege: reloadFile/
  // markFileMissing fuehren bekannte Wechsel nach, das Einblenden der
  // Sektion (toggleBookmarksPanel) verwirft den Cache komplett.
  const fileNodes = [];
  collectFileNodes(tree, fileNodes);
  const markMissing = (nodeId) => {
    const li = els.bookmarksTree.querySelector(`li[data-id="${cssEscape(nodeId)}"]`);
    if (li) li.classList.add('is-missing');
  };
  for (const node of fileNodes) {
    const cached = bookmarkExistsCache.get(node.filePath);
    if (cached === false) {
      markMissing(node.id);
      // Missing-Eintraege (seltener Fall) weiter pruefen — eine ausserhalb
      // der App wiederhergestellte Datei soll nicht bis zum Sichtbarkeits-
      // Toggle rot bleiben. Der IPC-Spareffekt liegt bei den existierenden
      // Eintraegen (Normalfall).
      api
        .fileExists(node.filePath)
        .then((exists) => {
          bookmarkExistsCache.set(node.filePath, !!exists);
          if (exists) {
            const li = els.bookmarksTree.querySelector(`li[data-id="${cssEscape(node.id)}"]`);
            if (li) li.classList.remove('is-missing');
          }
        })
        .catch(() => {
          /* ignore */
        });
    } else if (cached === undefined) {
      api
        .fileExists(node.filePath)
        .then((exists) => {
          bookmarkExistsCache.set(node.filePath, !!exists);
          if (!exists) markMissing(node.id);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }
}

// R3-08 (4T-0180): Existenz-Cache fuer Bookmark-Ziele samt Pflege-Hook
// fuer bekannte Datei-Ereignisse (reloadFile -> true, markFileMissing ->
// false). Unbekannte Pfade werden beim naechsten Render frisch geprueft.
export const bookmarkExistsCache = new Map();

export function noteBookmarkFileExistence(filePath, exists) {
  if (!filePath) return;
  bookmarkExistsCache.set(filePath, !!exists);
}

export function collectFileNodes(nodes, out) {
  for (const n of nodes) {
    if (n.type === 'file') out.push(n);
    if (n.type === 'folder' && Array.isArray(n.children)) collectFileNodes(n.children, out);
  }
}

export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/(["\\])/g, '\\$1');
}

export function renderBookmarkNode(node, depth) {
  if (!node) return null;
  const li = document.createElement('li');
  li.className = 'bookmark-node bookmark-' + node.type;
  li.dataset.id = node.id;
  li.setAttribute('role', 'treeitem');
  if (state.bookmarks.selectedId === node.id) li.classList.add('is-selected');

  const isEditing = state.bookmarks.editingId === node.id;

  const row = document.createElement('div');
  row.className = 'bookmark-row';
  row.style.paddingLeft = depth * 16 + 6 + 'px';
  li.appendChild(row);

  // 4T-0079: HTML5-Drag-and-Drop am Row-Element. draggable nur, wenn nicht
  // im Inline-Edit-Modus (sonst stoert Drag das Tippen).
  if (!isEditing) {
    row.draggable = true;
    row.addEventListener('dragstart', (ev) => handleBookmarkDragStart(ev, node));
    row.addEventListener('dragover', (ev) => handleBookmarkDragOverNode(ev, node, row));
    row.addEventListener('drop', (ev) => handleBookmarkDrop(ev));
    row.addEventListener('dragend', handleBookmarkDragEnd);
  }

  if (node.type === 'folder') {
    const expanded = node.expanded !== false;
    const chevron = document.createElement('span');
    chevron.className = 'bookmark-chevron' + (expanded ? ' is-open' : '');
    chevron.innerHTML = BOOKMARK_ICON_CHEVRON;
    chevron.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleBookmarkFolder(node.id);
    });
    row.appendChild(chevron);

    const icon = document.createElement('span');
    icon.className = 'bookmark-icon';
    icon.innerHTML = expanded ? BOOKMARK_ICON_FOLDER_OPEN : BOOKMARK_ICON_FOLDER_CLOSED;
    row.appendChild(icon);

    if (isEditing) {
      // 4T-0078: Inline-Edit fuer Ordner-Name.
      appendBookmarkInlineEditInput(
        row,
        node.id,
        node.name || t('bookmarks.newFolder.defaultName'),
      );
    } else {
      const label = document.createElement('span');
      label.className = 'bookmark-label';
      label.textContent = node.name || t('bookmarks.newFolder.defaultName');
      row.appendChild(label);

      row.addEventListener('click', async () => {
        state.bookmarks.selectedId = node.id;
        await ensureBookmarksSectionPersistedVisible();
        for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
      });
      row.addEventListener('dblclick', () => {
        toggleBookmarkFolder(node.id);
      });
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBookmarkContextMenu(ev, node);
      });
    }

    if (expanded && Array.isArray(node.children) && node.children.length > 0) {
      const childUl = document.createElement('ul');
      childUl.className = 'bookmark-children';
      // 4T-0079: Daten-Reihenfolge respektieren (kein Render-Sort).
      for (const child of node.children) {
        const childLi = renderBookmarkNode(child, depth + 1);
        if (childLi) childUl.appendChild(childLi);
      }
      li.appendChild(childUl);
    }
  } else {
    // file
    // 4T-0079: Spacer in Chevron-Breite, damit das File-Icon auf der gleichen
    // X-Position wie ein Folder-Icon derselben Ebene landet (sonst rueckt das
    // File-Icon zu weit links und die Hierarchie wirkt unklar).
    const spacer = document.createElement('span');
    spacer.className = 'bookmark-chevron-spacer';
    row.appendChild(spacer);

    const icon = document.createElement('span');
    icon.className = 'bookmark-icon';
    icon.innerHTML = BOOKMARK_ICON_FILE;
    row.appendChild(icon);

    if (isEditing) {
      // 4T-0078: Inline-Edit fuer Bookmark-DisplayName.
      const initial = node.displayName || (node.filePath ? api.basename(node.filePath) : '');
      appendBookmarkInlineEditInput(row, node.id, initial);
    } else {
      const label = document.createElement('span');
      label.className = 'bookmark-label';
      label.textContent = node.displayName || (node.filePath ? api.basename(node.filePath) : '');
      label.title = node.filePath || '';
      row.appendChild(label);

      row.addEventListener('click', async () => {
        state.bookmarks.selectedId = node.id;
        await ensureBookmarksSectionPersistedVisible();
        for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
        openBookmarkFile(node.filePath);
      });
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBookmarkContextMenu(ev, node);
      });
    }
  }
  return li;
}

// === 4T-0079: Drag-and-Drop ===============================================
// HTML5-DnD-API. Drei Drop-Zonen pro Knoten:
//   - obere Drittel: davor (gleiche Ebene)
//   - mittlere Drittel: in Folder hinein (nur bei Folder-Knoten; bei
//     Bookmarks faellt das in "davor" oder "danach" je nach Position)
//   - untere Drittel: danach (gleiche Ebene)
// Zyklus-Schutz: ein Folder kann nicht in sich selbst oder einen seiner
// Nachfahren gezogen werden. Drop auf den leeren Sektions-Bereich legt am
// Ende des Roots ab.

export const BOOKMARK_DND_MIME = 'application/x-bookmark-id';

export function handleBookmarkDragStart(ev, node) {
  if (!node || !node.id) return;
  if (ev.dataTransfer) {
    ev.dataTransfer.setData(BOOKMARK_DND_MIME, node.id);
    ev.dataTransfer.effectAllowed = 'move';
  }
  state.bookmarks.dragging = {
    sourceId: node.id,
    blockedIds: node.type === 'folder' ? collectSubtreeIds(node) : new Set([node.id]),
    targetId: null,
    zone: null,
  };
  ev.stopPropagation();
}

// Liefert die Drop-Zone fuer einen gegebenen Maus-Y-Wert relativ zur Knoten-
// Row. Bei Bookmarks gibt es nur "before"/"after" (keine "into"-Zone, weil
// Bookmarks keine Children haben).
export function computeDropZone(ev, rowEl, isFolder) {
  const rect = rowEl.getBoundingClientRect();
  const offset = ev.clientY - rect.top;
  const third = rect.height / 3;
  if (isFolder) {
    if (offset < third) return 'before';
    if (offset > rect.height - third) return 'after';
    return 'into';
  }
  return offset < rect.height / 2 ? 'before' : 'after';
}

export function clearAllBookmarkDropIndicators() {
  document
    .querySelectorAll(
      '.bookmark-row.is-drop-before, .bookmark-row.is-drop-after, .bookmark-row.is-drop-into, .bookmarks-tree.is-drop-root, .sidebar-bookmarks.is-drop-root',
    )
    .forEach((el) => {
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-into', 'is-drop-root');
    });
}

export function handleBookmarkDragOverNode(ev, node, rowEl) {
  const drag = state.bookmarks.dragging;
  if (!drag || !drag.sourceId) return;
  // Zyklus-Schutz: gegen sich selbst oder Nachfahren.
  if (drag.blockedIds && drag.blockedIds.has(node.id)) {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  const zone = computeDropZone(ev, rowEl, node.type === 'folder');
  // Indikator nur dann neu setzen, wenn sich Ziel oder Zone geaendert haben.
  if (drag.targetId === node.id && drag.zone === zone) return;
  clearAllBookmarkDropIndicators();
  rowEl.classList.add('is-drop-' + zone);
  drag.targetId = node.id;
  drag.zone = zone;
}

export function handleBookmarkDragOverRoot(ev, containerEl) {
  const drag = state.bookmarks.dragging;
  if (!drag || !drag.sourceId) return;
  // Verhindern, dass das Event auch von Knoten-Handlern bearbeitet wird:
  // dragover am Knoten ruft stopPropagation, der Container-Handler greift
  // nur, wenn nicht auf einem Knoten gehovert wird.
  if (ev.target.closest && ev.target.closest('.bookmark-row')) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  if (drag.targetId === '__root__' && drag.zone === 'append') return;
  clearAllBookmarkDropIndicators();
  containerEl.classList.add('is-drop-root');
  drag.targetId = '__root__';
  drag.zone = 'append';
}

export async function handleBookmarkDrop(ev) {
  const drag = state.bookmarks.dragging;
  if (!drag || !drag.sourceId) {
    // Kein interner Bookmark-Drag -> Event durchreichen, damit der App-
    // weite window-Drop-Handler (init.js) Datei-Drops aus dem Explorer
    // weiter empfangen kann. Sonst blockiert mein preventDefault/
    // stopPropagation den Datei-Open-Flow.
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  const sourceId = drag.sourceId;
  const targetId = drag.targetId;
  const zone = drag.zone;
  state.bookmarks.dragging = { sourceId: null, blockedIds: null, targetId: null, zone: null };
  clearAllBookmarkDropIndicators();
  if (!targetId || !zone) return;
  await moveBookmarkNodeByDrop(sourceId, targetId, zone);
}

export function handleBookmarkDragEnd() {
  state.bookmarks.dragging = { sourceId: null, blockedIds: null, targetId: null, zone: null };
  clearAllBookmarkDropIndicators();
}

export async function moveBookmarkNodeByDrop(sourceId, targetId, zone) {
  if (!sourceId || !targetId || !zone) return;
  const tree = cloneBookmarksTree();
  const sourceLoc = findNodeLocation(tree, sourceId);
  if (!sourceLoc) return;
  // Source aus dem alten Container entfernen.
  const node = sourceLoc.container.splice(sourceLoc.index, 1)[0];
  if (targetId === '__root__') {
    // Drop auf den leeren Sektions-Bereich -> ans Ende des Roots.
    tree.push(node);
    state.bookmarks.tree = tree;
    await persistBookmarksTree();
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
    updateBookmarksToggleButton();
    return;
  }
  const targetLoc = findNodeLocation(tree, targetId);
  if (!targetLoc) {
    // Ziel nicht mehr da (sollte nicht passieren): an Root anhaengen.
    tree.push(node);
    state.bookmarks.tree = tree;
    await persistBookmarksTree();
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
    updateBookmarksToggleButton();
    return;
  }
  const targetNode = targetLoc.container[targetLoc.index];
  if (zone === 'into' && targetNode.type === 'folder') {
    if (!Array.isArray(targetNode.children)) targetNode.children = [];
    targetNode.children.push(node);
    targetNode.expanded = true;
  } else if (zone === 'before') {
    targetLoc.container.splice(targetLoc.index, 0, node);
  } else {
    // after
    targetLoc.container.splice(targetLoc.index + 1, 0, node);
  }
  state.bookmarks.tree = tree;
  await persistBookmarksTree();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

// 4T-0078: Inline-Edit-Input fuer Bookmark-/Folder-Namen. Enter committet,
// Esc bricht ab, Blur committet ebenfalls (uebliches UI-Verhalten in
// Browser-Lesezeichen-Managern).
export function appendBookmarkInlineEditInput(row, id, initialValue) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'bookmark-inline-edit-input';
  input.value = initialValue;
  input.setAttribute('aria-label', t('bookmarks.rename.prompt'));
  let finalized = false;
  const commit = () => {
    if (finalized) return;
    finalized = true;
    commitInlineEdit(id, input.value);
  };
  const cancel = () => {
    if (finalized) return;
    finalized = true;
    cancelInlineEdit();
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      commit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      cancel();
    } else {
      // Keystroke nicht weiterleiten (sonst greifen z.B. Strg+D global).
      ev.stopPropagation();
    }
  });
  input.addEventListener('blur', () => commit());
  // Klick auf den Input darf nicht den row-Click oder dblclick triggern.
  input.addEventListener('click', (ev) => ev.stopPropagation());
  input.addEventListener('dblclick', (ev) => ev.stopPropagation());
  row.appendChild(input);
}

// 4T-0078: Kontext-Menue fuer Bookmarks. Je nach Knotentyp:
//  - Bookmark (file): Umbenennen, In Ordner verschieben..., Entfernen.
//  - Folder:           Neuer Unterordner, Umbenennen, In Ordner verschieben...,
//                      Entfernen (mit Bestaetigung bei nicht-leerem Inhalt).
//  - Leerer Sektions-Bereich: Neuer Ordner (im Root).
export function showBookmarkContextMenu(ev, node) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.innerHTML = '';
  // R3-15 (4T-0187): ausloesende Pane merken, damit der Inline-Edit-Fokus
  // bei Zwei-Spalten-Ansicht in der richtigen Sidebar landet.
  const paneEl = ev.target instanceof Element ? ev.target.closest('.pane-group') : null;
  const menuPaneIdx = paneEl ? parseInt(paneEl.dataset.pane, 10) : state.activePaneIndex;

  const addItem = (labelKey, handler, opts) => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    if (opts && opts.danger) item.classList.add('context-menu-item-danger');
    item.textContent = t(labelKey);
    item.addEventListener('click', () => {
      hideContextMenu();
      handler();
    });
    menu.appendChild(item);
  };
  const addSeparator = () => {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);
  };

  if (!node) {
    // Klick auf leeren Sektions-Bereich oder Sektions-Header.
    addItem('bookmarks.newFolder', () => createNewFolderUI(null, menuPaneIdx));
  } else if (node.type === 'folder') {
    addItem('bookmarks.newSubfolder', () => createNewFolderUI(node.id, menuPaneIdx));
    addItem('bookmarks.rename', () =>
      startInlineEdit(node.id, { isNew: false, paneIdx: menuPaneIdx }),
    );
    addItem('bookmarks.moveTo', () => openBookmarkMoveDialog(node.id));
    addSeparator();
    addItem('bookmarks.remove', () => removeNodeWithConfirm(node.id), { danger: true });
  } else {
    addItem('bookmarks.rename', () =>
      startInlineEdit(node.id, { isNew: false, paneIdx: menuPaneIdx }),
    );
    addItem('bookmarks.moveTo', () => openBookmarkMoveDialog(node.id));
    addSeparator();
    addItem('bookmarks.remove', () => removeBookmark(node.id), { danger: true });
  }

  // R3-10 (4T-0187): an den Viewport klemmen (gemeinsamer Helper).
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

// 4T-0078: Neuen Folder anlegen. parentFolderId === null oder undefined
// bedeutet "im Root". Der Knoten wird mit einem Default-Namen angelegt und
// sofort in den Inline-Edit-Modus gesetzt; bei Esc wird der Knoten wieder
// entfernt (editingIsNew = true).
export async function createNewFolderUI(parentFolderId, paneIdx) {
  const tree = cloneBookmarksTree();
  const folder = {
    type: 'folder',
    id: newBookmarkId('f'),
    name: t('bookmarks.newFolder.defaultName'),
    expanded: true,
    children: [],
  };
  if (parentFolderId) {
    const loc = findNodeLocation(tree, parentFolderId);
    if (loc && loc.container[loc.index].type === 'folder') {
      const parent = loc.container[loc.index];
      if (!Array.isArray(parent.children)) parent.children = [];
      // 4T-0078: Folder ans Ende der Folder-Gruppe einsortieren.
      insertAtEndOfGroup(parent.children, folder);
      parent.expanded = true;
    } else {
      insertAtEndOfGroup(tree, folder);
    }
  } else {
    insertAtEndOfGroup(tree, folder);
  }
  state.bookmarks.tree = tree;
  state.bookmarks.editingId = folder.id;
  state.bookmarks.editingIsNew = true;
  await persistBookmarksTree();
  // Sicherstellen, dass die Sektion sichtbar ist (sonst sieht der Nutzer
  // nichts vom neuen Inline-Edit).
  if (!state.bookmarks.visibleByPane[state.activePaneIndex]) {
    state.bookmarks.visibleByPane[state.activePaneIndex] = true;
    await persistBookmarksSettings();
    applyBookmarksVisibility(state.activePaneIndex);
    if (typeof reportMenuStateNow === 'function') reportMenuStateNow();
  } else {
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  }
  focusInlineEditInput(paneIdx);
}

// 4T-0078: Inline-Edit fuer Folder-Name oder Bookmark-DisplayName starten.
export function startInlineEdit(id, options) {
  state.bookmarks.editingId = id;
  state.bookmarks.editingIsNew = !!(options && options.isNew);
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  // R3-15 (4T-0187): Input der ausloesenden Pane fokussieren.
  focusInlineEditInput(options && options.paneIdx);
}

export function focusInlineEditInput(paneIdx) {
  // R3-15 (4T-0187): bevorzugt den Input der angegebenen Pane fokussieren —
  // document.querySelector traf bei Zwei-Spalten-Ansicht immer die linke
  // Sidebar. setTimeout(0), damit das DOM nach dem Render bereit ist.
  setTimeout(() => {
    let input = null;
    if (Number.isInteger(paneIdx)) {
      input = document.querySelector(
        `.pane-group[data-pane="${paneIdx}"] .bookmark-inline-edit-input`,
      );
    }
    if (!input) input = document.querySelector('.bookmark-inline-edit-input');
    if (input) {
      input.focus();
      input.select();
    }
  }, 0);
}

export async function commitInlineEdit(id, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    // Leerer Name: bei "Neuer Ordner" entfernen, sonst Aenderung verwerfen.
    if (state.bookmarks.editingIsNew) {
      await cancelInlineEdit();
      return;
    }
    state.bookmarks.editingId = null;
    state.bookmarks.editingIsNew = false;
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
    return;
  }
  const tree = cloneBookmarksTree();
  const loc = findNodeLocation(tree, id);
  if (loc) {
    const node = loc.container[loc.index];
    if (node.type === 'folder') node.name = trimmed;
    else node.displayName = trimmed;
  }
  state.bookmarks.tree = tree;
  state.bookmarks.editingId = null;
  state.bookmarks.editingIsNew = false;
  await persistBookmarksTree();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

export async function cancelInlineEdit() {
  const id = state.bookmarks.editingId;
  const wasNew = state.bookmarks.editingIsNew;
  state.bookmarks.editingId = null;
  state.bookmarks.editingIsNew = false;
  if (wasNew && id) {
    // "Neuer Ordner" abgebrochen -> Knoten wieder loeschen.
    const tree = cloneBookmarksTree();
    if (removeNodeById(tree, id)) {
      state.bookmarks.tree = tree;
      await persistBookmarksTree();
    }
  }
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

// 4T-0078: "Entfernen" mit Bestaetigung bei nicht-leerem Folder.
export async function removeNodeWithConfirm(id) {
  const loc = findNodeLocation(state.bookmarks.tree, id);
  if (!loc) return;
  const node = loc.container[loc.index];
  if (node.type === 'folder') {
    const counts = countFolderContents(node);
    if (counts.files > 0 || counts.folders > 0) {
      openBookmarkConfirmRemoveDialog(node, counts);
      return;
    }
  }
  // Leerer Folder oder File: direkt entfernen.
  await removeBookmark(id);
}

// === Bestaetigungs-Dialog beim Folder-Entfernen ============================
export function openBookmarkConfirmRemoveDialog(node, counts) {
  const modal = document.getElementById('bookmark-confirm-remove-modal');
  if (!modal) return;
  const msg = document.getElementById('bookmark-confirm-remove-message');
  if (msg) {
    msg.textContent = t('bookmarks.remove.confirmFolder.message')
      .replace('{name}', node.name || '')
      .replace('{count}', String(counts.files))
      .replace('{subcount}', String(counts.folders));
  }
  modal.dataset.targetId = node.id;
  modal.hidden = false;
  const okBtn = document.getElementById('btn-bookmark-confirm-remove-ok');
  if (okBtn) okBtn.focus();
}

export function closeBookmarkConfirmRemoveDialog() {
  const modal = document.getElementById('bookmark-confirm-remove-modal');
  if (modal) {
    modal.hidden = true;
    delete modal.dataset.targetId;
  }
}

export async function confirmBookmarkConfirmRemove() {
  const modal = document.getElementById('bookmark-confirm-remove-modal');
  if (!modal) return;
  const id = modal.dataset.targetId;
  closeBookmarkConfirmRemoveDialog();
  if (id) await removeBookmark(id);
}

// === Modal-Picker "In Ordner verschieben..." ===============================
export function openBookmarkMoveDialog(sourceId) {
  const loc = findNodeLocation(state.bookmarks.tree, sourceId);
  if (!loc) return;
  const node = loc.container[loc.index];
  // Bei Folder: Zyklus-Schutz - Source und alle Nachfahren als Ziel sperren.
  // Bei Bookmark: nur der eigene Parent ist sinnlos (No-Op), aber wir
  // erlauben den Klick und filtern beim Verschieben (No-Op).
  const blockedIds = node.type === 'folder' ? collectSubtreeIds(node) : new Set();
  state.bookmarks.moveDialog = { sourceId, targetFolderId: null, blockedIds };
  const modal = document.getElementById('bookmark-move-modal');
  if (!modal) return;
  // Source-Anzeige.
  const sourceEl = document.getElementById('bookmark-move-source');
  if (sourceEl) {
    const label = node.type === 'folder' ? node.name || '' : node.displayName || '';
    sourceEl.textContent = t('bookmarks.moveTo.sourceLabel').replace('{name}', label);
  }
  renderBookmarkMoveTree();
  updateBookmarkMoveConfirmButton();
  modal.hidden = false;
  // S-11 (4T-0188): initialen Fokus setzen wie bei den uebrigen Modals
  // (Cancel-Button als sichere Default-Aktion); vorher blieb der Fokus
  // hinter dem Modal und die Zielwahl war nur per Maus moeglich.
  const cancelBtn = document.getElementById('btn-bookmark-move-cancel');
  if (cancelBtn) setTimeout(() => cancelBtn.focus(), 0);
}

export function closeBookmarkMoveDialog() {
  const modal = document.getElementById('bookmark-move-modal');
  if (modal) modal.hidden = true;
  state.bookmarks.moveDialog = { sourceId: null, targetFolderId: null, blockedIds: null };
}

// S-11 (4T-0188): gemeinsame Zielwahl fuer Klick UND Tastatur (Enter/
// Leertaste auf fokussierter Zeile). Das Re-Render baut die Zeilen neu —
// der Fokus wird auf die gewaehlte Zeile zurueckgesetzt, damit die
// Tastatur-Bedienung nicht abreisst.
function selectBookmarkMoveTarget(folderId) {
  state.bookmarks.moveDialog.targetFolderId = folderId;
  renderBookmarkMoveTree();
  updateBookmarkMoveConfirmButton();
  const container = document.getElementById('bookmark-move-tree');
  if (!container) return;
  const sel = container.querySelector(
    `.bookmark-move-row[data-folder-id="${cssEscape(folderId || '')}"]`,
  );
  if (sel) sel.focus();
}

export function renderBookmarkMoveTree() {
  const container = document.getElementById('bookmark-move-tree');
  if (!container) return;
  container.innerHTML = '';
  const bindRowActivation = (row, folderId) => {
    row.tabIndex = 0;
    row.addEventListener('click', () => selectBookmarkMoveTarget(folderId));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectBookmarkMoveTarget(folderId);
      }
    });
  };
  // Virtueller Root-Eintrag oben.
  const rootRow = document.createElement('div');
  rootRow.className = 'bookmark-move-row bookmark-move-root';
  rootRow.dataset.folderId = '';
  rootRow.textContent = t('bookmarks.moveTo.rootLabel');
  bindRowActivation(rootRow, null);
  if (state.bookmarks.moveDialog.targetFolderId === null) rootRow.classList.add('is-selected');
  container.appendChild(rootRow);
  // Alle Folder-Knoten rekursiv listen.
  function walk(nodes, depth) {
    for (const n of nodes) {
      if (n.type !== 'folder') continue;
      const row = document.createElement('div');
      row.className = 'bookmark-move-row';
      row.dataset.folderId = n.id;
      row.style.paddingLeft = 12 + depth * 16 + 'px';
      const blocked =
        state.bookmarks.moveDialog.blockedIds && state.bookmarks.moveDialog.blockedIds.has(n.id);
      if (blocked) row.classList.add('is-blocked');
      const icon = document.createElement('span');
      icon.className = 'bookmark-icon';
      icon.innerHTML = BOOKMARK_ICON_FOLDER_CLOSED;
      row.appendChild(icon);
      const label = document.createElement('span');
      label.className = 'bookmark-label';
      label.textContent = n.name || t('bookmarks.newFolder.defaultName');
      row.appendChild(label);
      if (!blocked) bindRowActivation(row, n.id);
      if (state.bookmarks.moveDialog.targetFolderId === n.id) row.classList.add('is-selected');
      container.appendChild(row);
      if (Array.isArray(n.children)) walk(n.children, depth + 1);
    }
  }
  walk(state.bookmarks.tree, 0);
}

export function updateBookmarkMoveConfirmButton() {
  const btn = document.getElementById('btn-bookmark-move-confirm');
  if (!btn) return;
  // Disabled, wenn das Ziel identisch mit dem aktuellen Parent des Sources
  // ist (No-Op).
  const { sourceId, targetFolderId } = state.bookmarks.moveDialog;
  if (!sourceId) {
    btn.disabled = true;
    return;
  }
  const loc = findNodeLocation(state.bookmarks.tree, sourceId);
  if (!loc) {
    btn.disabled = true;
    return;
  }
  const currentParentId = loc.parent ? loc.parent.id : null;
  btn.disabled = (currentParentId || null) === (targetFolderId || null);
}

export async function confirmBookmarkMove() {
  const { sourceId, targetFolderId } = state.bookmarks.moveDialog;
  closeBookmarkMoveDialog();
  if (!sourceId) return;
  const tree = cloneBookmarksTree();
  const loc = findNodeLocation(tree, sourceId);
  if (!loc) return;
  const node = loc.container.splice(loc.index, 1)[0];
  if (!targetFolderId) {
    // 4T-0078: ans Ende der entsprechenden Gruppe im Root.
    insertAtEndOfGroup(tree, node);
  } else {
    const targetLoc = findNodeLocation(tree, targetFolderId);
    if (!targetLoc || targetLoc.container[targetLoc.index].type !== 'folder') {
      // Sollte nicht passieren (Picker zeigt nur Folder); im Zweifel an
      // Root anhaengen, damit der Knoten nicht verloren geht.
      insertAtEndOfGroup(tree, node);
    } else {
      const target = targetLoc.container[targetLoc.index];
      if (!Array.isArray(target.children)) target.children = [];
      insertAtEndOfGroup(target.children, node);
      target.expanded = true;
    }
  }
  state.bookmarks.tree = tree;
  await persistBookmarksTree();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

export function applyBookmarksVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookmarksSection) return;
  // 4T-0075: Im Empty-State sichtbar, wenn mindestens ein Bookmark existiert —
  // damit der Nutzer beim App-Start direkt eine gemerkte Datei anklicken kann.
  // 4T-0330 (PO-Testbefund): der Statusbar-Schalter gilt dabei auch im
  // Empty-State — eine ausgeschaltete Sektion wird nicht mehr erzwungen
  // eingeblendet (der fruehere Override zeigte sie am Schalter vorbei).
  const allEmpty = isAllEmpty();
  const hasBookmarks = Array.isArray(state.bookmarks.tree) && state.bookmarks.tree.length > 0;
  const visible =
    isExtensionActive('bookmarks') &&
    !!state.bookmarks.visibleByPane[paneIdx] &&
    (!allEmpty || hasBookmarks);
  els.bookmarksSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderBookmarks(paneIdx);
  updateBookmarksToggleButton();
}

export function updateBookmarksToggleButton() {
  const btn = document.getElementById('btn-bookmarks');
  if (!btn) return;
  const visible = !!state.bookmarks.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  // .is-marked = aktive Datei ist als Bookmark gespeichert.
  const tab = activeTab();
  const marked = !!(tab && tab.path && findBookmarkByPath(state.bookmarks.tree, tab.path));
  btn.classList.toggle('is-marked', marked);
}

export async function toggleBookmarksPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.bookmarks.visibleByPane[paneIdx];
  state.bookmarks.visibleByPane[paneIdx] = next;
  // R3-08 (4T-0180): Einblenden verwirft den Existenz-Cache — der Nutzer
  // erwartet beim bewussten Oeffnen der Sektion einen frischen Stand.
  if (next) bookmarkExistsCache.clear();
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('bookmarks');
  applyBookmarksVisibility(paneIdx);
  // 4T-0330: im Empty-State haengt die Pane-Container-Sichtbarkeit an den
  // Panel-Praeferenzen — nachziehen, damit der Schalter dort sichtbar wirkt.
  updateEmptyState();
  await persistBookmarksSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

// 4T-0015: Tab finden und Cursor auf Zeile setzen — Helper fuer Backlinks-
// Sprung, kapselt findTabAcrossPanes plus Tab-/Pane-Aktivierung und Cursor-
// Sprung. Wenn der Tab in keiner Pane offen ist, wird er in der aktiven Spalte
// geoeffnet.
export async function openOrJumpToPath(targetPath, lineNumber) {
  if (!targetPath) return;
  const found = findTabAcrossPanes(targetPath);
  if (found) {
    if (found.paneIdx !== state.activePaneIndex) {
      activatePane(found.paneIdx);
    }
    if (state.panes[found.paneIdx].activeIndex !== found.tabIdx) {
      activateTab(found.paneIdx, found.tabIdx);
    }
    placeCursorAtLine(found.paneIdx, lineNumber);
    return;
  }
  // Neuen Tab in der aktiven Spalte oeffnen, dann Cursor setzen.
  await openInPane(state.activePaneIndex, [targetPath]);
  placeCursorAtLine(state.activePaneIndex, lineNumber);
}

// === 4T-0287 (Epic 3E-0051): Panel-Registrierung =============================
// getVisible spiegelt die effektive Sichtbarkeits-Logik aus
// applyBookmarksVisibility: im Empty-State erzwungen sichtbar, sobald
// mindestens ein Bookmark existiert (4T-0075).

registerSidebarPanel({
  id: 'bookmarks',
  titleKey: 'bookmarks.title',
  buttonId: 'btn-bookmarks',
  sectionClass: 'sidebar-bookmarks',
  getVisible: (paneIdx) => {
    if (!isExtensionActive('bookmarks')) return false;
    // 4T-0330 (PO-Testbefund): Schalter gilt auch im Empty-State (siehe
    // applyBookmarksVisibility).
    const hasBookmarks = Array.isArray(state.bookmarks.tree) && state.bookmarks.tree.length > 0;
    return !!state.bookmarks.visibleByPane[paneIdx] && (!isAllEmpty() || hasBookmarks);
  },
  applyVisibility: applyBookmarksVisibility,
  toggle: toggleBookmarksPanel,
});

export function placeCursorAtLine(paneIdx, lineNumber) {
  const view = paneEditors[paneIdx];
  if (!view) return;
  const ln = parseInt(lineNumber, 10);
  if (!Number.isFinite(ln) || ln < 1) return;
  // R3-03 (4T-0186): Im Reading-Modus ist der Editor unsichtbar — der
  // Cursor-Sprung verpuffte im versteckten Pane. Stattdessen das Render-
  // Pane zur naechstgelegenen data-source-line-Stelle scrollen.
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (tab && tab.viewMode === 'rendered') {
    scrollRenderedToLine(paneIdx, ln);
    return;
  }
  const doc = view.state.doc;
  const clamped = Math.min(ln, doc.lines);
  const lineObj = doc.line(clamped);
  view.dispatch({
    selection: { anchor: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
  });
  view.focus();
}
