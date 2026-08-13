// Lesezeichen: Inline-Edit der Namen und Kontextmenue des Baums.
// 4T-0991 (Epic 3E-0196): aus bookmarks.js in den Ordner bookmarks/
// ausgezogen. Der Edit-Zustand liegt unveraendert im Renderer-State
// (state.bookmarks.editingId/editingIsNew/editingSectionKind), weil ihn der
// Render und die Esc-Kaskade lesen.
// Laufzeit-Zyklus innerhalb des Ordners: siehe Kopf von bookmarks-render.js.
'use strict';

import { t } from '../../i18n.js';

import { state } from '../app/app-state.js';
import { hideContextMenu, placeContextMenuAt } from '../dialogs/context-menu-utils.js';
import { reportMenuStateNow } from '../tabs/tabs.js';

import {
  convertBookmarkToArea,
  convertBookmarkToGeneral,
  removeBookmark,
} from './bookmarks-actions.js';
import { openBookmarkConfirmRemoveDialog, openBookmarkMoveDialog } from './bookmarks-dialogs.js';
import { renderBookmarks } from './bookmarks-render.js';
import {
  SECTION_GENERAL,
  bookmarkSection,
  cloneSectionTree,
  countFolderContents,
  findNodeLocation,
  insertAtEndOfGroup,
  newBookmarkId,
  persistAreaBookmarksTree,
  persistBookmarksSettings,
  persistBookmarksTree,
  removeNodeById,
} from './bookmarks-tree.js';
import {
  applyBookmarksVisibility,
  loadAreaBookmarks,
  updateBookmarksToggleButton,
} from './bookmarks.js';

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
//  - Bookmark (file): Umbenennen, In Ordner verschieben..., Umwandeln, Entfernen.
//  - Folder:           Neuer Unterordner, Umbenennen, In Ordner verschieben...,
//                      Umwandeln, Entfernen (mit Bestaetigung bei Inhalt).
//  - Leerer Sektions-Bereich: Neuer Ordner (im Root).
// 4T-0612: der "umwandeln"-Eintrag richtet sich nach dem Abschnitt (allgemein
// -> Bereich nur bei geoeffnetem Bereich; Bereich -> allgemein immer).
export function showBookmarkContextMenu(ev, node, section) {
  const sec = section || bookmarkSection(SECTION_GENERAL);
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
    if (opts && opts.dataId) item.dataset.menuId = opts.dataId;
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
  // 4T-0612: Umwandeln-Eintrag passend zum Abschnitt.
  const addConvertItem = () => {
    if (!sec.isArea && state.areaPath) {
      addItem('bookmarks.convertToArea', () => convertBookmarkToArea(node.id), {
        dataId: 'bookmark-convert-to-area',
      });
    } else if (sec.isArea) {
      addItem('bookmarks.convertToGeneral', () => convertBookmarkToGeneral(node.id), {
        dataId: 'bookmark-convert-to-general',
      });
    }
  };

  if (!node) {
    // Klick auf leeren Sektions-Bereich oder Sektions-Header.
    addItem('bookmarks.newFolder', () => createNewFolderUI(null, menuPaneIdx, sec));
  } else if (node.type === 'folder') {
    addItem('bookmarks.newSubfolder', () => createNewFolderUI(node.id, menuPaneIdx, sec));
    addItem('bookmarks.rename', () =>
      startInlineEdit(node.id, { isNew: false, paneIdx: menuPaneIdx, section: sec }),
    );
    addItem('bookmarks.moveTo', () => openBookmarkMoveDialog(node.id, sec));
    addConvertItem();
    addSeparator();
    addItem('bookmarks.remove', () => removeNodeWithConfirm(node.id, sec), { danger: true });
  } else {
    addItem('bookmarks.rename', () =>
      startInlineEdit(node.id, { isNew: false, paneIdx: menuPaneIdx, section: sec }),
    );
    addItem('bookmarks.moveTo', () => openBookmarkMoveDialog(node.id, sec));
    addConvertItem();
    addSeparator();
    addItem('bookmarks.remove', () => removeBookmark(node.id, sec), { danger: true });
  }

  // R3-10 (4T-0187): an den Viewport klemmen (gemeinsamer Helper).
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

// 4T-0078: Neuen Folder anlegen. parentFolderId === null oder undefined
// bedeutet "im Root". Der Knoten wird mit einem Default-Namen angelegt und
// sofort in den Inline-Edit-Modus gesetzt; bei Esc wird der Knoten wieder
// entfernt (editingIsNew = true).
export async function createNewFolderUI(parentFolderId, paneIdx, section) {
  const sec = section || bookmarkSection(SECTION_GENERAL);
  const tree = cloneSectionTree(sec);
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
  sec.setTree(tree);
  state.bookmarks.editingId = folder.id;
  state.bookmarks.editingIsNew = true;
  state.bookmarks.editingSectionKind = sec.kind;
  if (sec.isArea) {
    const res = await persistAreaBookmarksTree();
    if (!res.ok) {
      await loadAreaBookmarks();
      return;
    }
  } else {
    await persistBookmarksTree();
  }
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
  state.bookmarks.editingSectionKind =
    options && options.section ? options.section.kind : SECTION_GENERAL;
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
  const sec = bookmarkSection(state.bookmarks.editingSectionKind);
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
  const tree = cloneSectionTree(sec);
  const loc = findNodeLocation(tree, id);
  if (loc) {
    const node = loc.container[loc.index];
    if (node.type === 'folder') node.name = trimmed;
    else node.displayName = trimmed;
  }
  sec.setTree(tree);
  state.bookmarks.editingId = null;
  state.bookmarks.editingIsNew = false;
  if (sec.isArea) {
    const res = await persistAreaBookmarksTree();
    if (!res.ok) await loadAreaBookmarks();
  } else {
    await persistBookmarksTree();
  }
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

export async function cancelInlineEdit() {
  const sec = bookmarkSection(state.bookmarks.editingSectionKind);
  const id = state.bookmarks.editingId;
  const wasNew = state.bookmarks.editingIsNew;
  state.bookmarks.editingId = null;
  state.bookmarks.editingIsNew = false;
  if (wasNew && id) {
    // "Neuer Ordner" abgebrochen -> Knoten wieder loeschen.
    const tree = cloneSectionTree(sec);
    if (removeNodeById(tree, id)) {
      sec.setTree(tree);
      if (sec.isArea) {
        const res = await persistAreaBookmarksTree();
        if (!res.ok) await loadAreaBookmarks();
      } else {
        await persistBookmarksTree();
      }
    }
  }
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

// 4T-0078: "Entfernen" mit Bestaetigung bei nicht-leerem Folder.
export async function removeNodeWithConfirm(id, section) {
  const sec = section || bookmarkSection(SECTION_GENERAL);
  const loc = findNodeLocation(sec.getTree(), id);
  if (!loc) return;
  const node = loc.container[loc.index];
  if (node.type === 'folder') {
    const counts = countFolderContents(node);
    if (counts.files > 0 || counts.folders > 0) {
      openBookmarkConfirmRemoveDialog(node, counts, sec);
      return;
    }
  }
  // Leerer Folder oder File: direkt entfernen.
  await removeBookmark(id, sec);
}
