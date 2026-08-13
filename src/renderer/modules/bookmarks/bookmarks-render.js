// Lesezeichen: Aufbau des Panel-Baums (beide Abschnitte).
// 4T-0991 (Epic 3E-0196): aus bookmarks.js in den Ordner bookmarks/
// ausgezogen. Baut ueber dem Datenmodell (bookmarks-tree.js) auf.
// Laufzeit-Zyklus innerhalb des Ordners: Der Baum-Aufbau haengt die Handler
// von Drag-and-Drop, Inline-Edit und Aktionen ein, und dieselben Handler
// stossen nach ihrer Aenderung den Neu-Aufbau an. Beide Richtungen greifen
// ausschliesslich zur Laufzeit (kein Top-Level-Wert-Zugriff); eine Aufloesung
// haette die Verdrahtung veraendert und damit den Zuschnitt verlassen.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

import {
  ensureBookmarksSectionPersistedVisible,
  openBookmarkNode,
  toggleBookmarkFolder,
} from './bookmarks-actions.js';
import {
  clearAllBookmarkDropIndicators,
  handleBookmarkDragEnd,
  handleBookmarkDragOverNode,
  handleBookmarkDragOverRoot,
  handleBookmarkDragStart,
  handleBookmarkDrop,
} from './bookmarks-dnd.js';
import { appendBookmarkInlineEditInput, showBookmarkContextMenu } from './bookmarks-edit.js';
import {
  SECTION_AREA,
  SECTION_GENERAL,
  bookmarkSection,
  collectFileNodes,
  noteBookmarkFileExistence,
  readBookmarkFileExistence,
  resolveBookmarkPath,
} from './bookmarks-tree.js';

export const BOOKMARK_ICON_FILE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
export const BOOKMARK_ICON_FOLDER_OPEN =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>';
export const BOOKMARK_ICON_FOLDER_CLOSED =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
export const BOOKMARK_ICON_CHEVRON =
  '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/(["\\])/g, '\\$1');
}

// 4T-0612: Rendert beide Abschnitte in das Panel. Der Bereichs-Abschnitt und
// die Abschnitts-Koepfe erscheinen nur bei geoeffnetem Bereich; die
// Reihenfolge steuert state.bookmarks.areaFirst.
export function renderBookmarks(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookmarksTree || !els.bookmarksEmpty) return;
  const areaActive = isExtensionActive('bookmarks') && !!state.areaPath;
  if (els.bookmarksAreaGroup) els.bookmarksAreaGroup.hidden = !areaActive;
  // Abschnitts-Koepfe nur bei geoeffnetem Bereich (sonst gewohntes Ein-
  // Abschnitts-Bild). Der Bereichs-Kopf sitzt in der Bereichs-Gruppe und ist
  // ueber deren hidden schon mit abgedeckt.
  if (els.bookmarksGeneralHead) els.bookmarksGeneralHead.hidden = !areaActive;
  // Reihenfolge der beiden Gruppen im Body.
  if (
    els.bookmarksAreaGroup &&
    els.bookmarksGeneralGroup &&
    els.bookmarksGeneralGroup.parentElement
  ) {
    const body = els.bookmarksGeneralGroup.parentElement;
    if (state.bookmarks.areaFirst)
      body.insertBefore(els.bookmarksAreaGroup, els.bookmarksGeneralGroup);
    else body.insertBefore(els.bookmarksGeneralGroup, els.bookmarksAreaGroup);
  }
  if (areaActive) renderSectionInto(els, paneIdx, bookmarkSection(SECTION_AREA));
  else if (els.bookmarksAreaTree) els.bookmarksAreaTree.innerHTML = '';
  renderSectionInto(els, paneIdx, bookmarkSection(SECTION_GENERAL));
}

// 4T-0612: Rendert den Baum EINES Abschnitts in dessen Tree-Container. Bindet
// Kontextmenue und Root-Drag-and-Drop einmal pro Gruppe (die Abschnitts-
// Objekt-Methoden lesen den State live, ein einmal gebundenes Objekt bleibt
// gueltig). Existenz-Pruefung mit dem aufgeloesten absoluten Pfad als
// Cache-Schluessel.
function renderSectionInto(els, paneIdx, section) {
  const treeEl = section.treeElOf(els);
  const emptyEl = section.emptyElOf(els);
  const groupEl = section.groupElOf(els);
  if (!treeEl) return;
  const tree = section.getTree();
  treeEl.innerHTML = '';
  const isEmpty = !tree || tree.length === 0;
  if (emptyEl) emptyEl.hidden = !isEmpty;
  // 4T-0078: Rechtsklick auf den leeren Gruppen-Bereich zeigt "Neuer Ordner".
  if (groupEl && !groupEl.dataset.contextBound) {
    groupEl.addEventListener('contextmenu', (ev) => {
      if (ev.target.closest && ev.target.closest('.bookmark-node')) return;
      ev.preventDefault();
      ev.stopPropagation();
      showBookmarkContextMenu(ev, null, section);
    });
    groupEl.dataset.contextBound = '1';
  }
  // 4T-0079: Drop auf den leeren Gruppen-Bereich legt am Ende des Roots ab.
  if (groupEl && !groupEl.dataset.dndBound) {
    groupEl.addEventListener('dragover', (ev) => handleBookmarkDragOverRoot(ev, groupEl, section));
    groupEl.addEventListener('drop', (ev) => {
      if (ev.target.closest && ev.target.closest('.bookmark-row')) return;
      handleBookmarkDrop(ev, section);
    });
    groupEl.addEventListener('dragleave', (ev) => {
      if (!groupEl.contains(ev.relatedTarget)) clearAllBookmarkDropIndicators();
    });
    groupEl.dataset.dndBound = '1';
  }
  if (isEmpty) return;
  // 4T-0079: Render iteriert in Daten-Reihenfolge (kein Render-Sort mehr).
  for (const node of tree) {
    const li = renderBookmarkNode(node, 0, section);
    if (li) treeEl.appendChild(li);
  }
  // Datei-Existenz-Check pro Bookmark (R3-08: Ergebnis gecacht).
  const fileNodes = [];
  collectFileNodes(tree, fileNodes);
  const markMissing = (nodeId) => {
    const li = treeEl.querySelector(`li[data-id="${cssEscape(nodeId)}"]`);
    if (li) li.classList.add('is-missing');
  };
  for (const node of fileNodes) {
    const resolved = resolveBookmarkPath(section, node);
    if (!resolved) continue;
    const cached = readBookmarkFileExistence(resolved);
    if (cached === false) {
      markMissing(node.id);
      api
        .fileExists(resolved)
        .then((exists) => {
          noteBookmarkFileExistence(resolved, exists);
          if (exists) {
            const li = treeEl.querySelector(`li[data-id="${cssEscape(node.id)}"]`);
            if (li) li.classList.remove('is-missing');
          }
        })
        .catch(() => {
          /* ignore */
        });
    } else if (cached === undefined) {
      api
        .fileExists(resolved)
        .then((exists) => {
          noteBookmarkFileExistence(resolved, exists);
          if (!exists) markMissing(node.id);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }
}

export function renderBookmarkNode(node, depth, section) {
  if (!node) return null;
  const sec = section || bookmarkSection(SECTION_GENERAL);
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
    row.addEventListener('dragstart', (ev) => handleBookmarkDragStart(ev, node, sec));
    row.addEventListener('dragover', (ev) => handleBookmarkDragOverNode(ev, node, row, sec));
    row.addEventListener('drop', (ev) => handleBookmarkDrop(ev, sec));
    row.addEventListener('dragend', handleBookmarkDragEnd);
  }

  if (node.type === 'folder') {
    const expanded = node.expanded !== false;
    const chevron = document.createElement('span');
    chevron.className = 'bookmark-chevron' + (expanded ? ' is-open' : '');
    chevron.innerHTML = BOOKMARK_ICON_CHEVRON;
    chevron.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleBookmarkFolder(node.id, sec);
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
        toggleBookmarkFolder(node.id, sec);
      });
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBookmarkContextMenu(ev, node, sec);
      });
    }

    if (expanded && Array.isArray(node.children) && node.children.length > 0) {
      const childUl = document.createElement('ul');
      childUl.className = 'bookmark-children';
      // 4T-0079: Daten-Reihenfolge respektieren (kein Render-Sort).
      for (const child of node.children) {
        const childLi = renderBookmarkNode(child, depth + 1, sec);
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
      // 4T-0612: Tooltip zeigt den aufgeloesten absoluten Pfad (Bereichs-Ziele
      // eingeschlossen); ohne Bereich der Rohpfad.
      label.title = resolveBookmarkPath(sec, node) || node.filePath || '';
      row.appendChild(label);

      row.addEventListener('click', async () => {
        state.bookmarks.selectedId = node.id;
        await ensureBookmarksSectionPersistedVisible();
        for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
        openBookmarkNode(sec, node);
      });
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBookmarkContextMenu(ev, node, sec);
      });
    }
  }
  return li;
}
