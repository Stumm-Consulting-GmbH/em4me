// Lesezeichen: Modale Dialoge — Entfernen-Bestaetigung und Ziel-Wahl beim
// Verschieben.
// 4T-000991 (Epic 3E-000196): aus bookmarks.js in den Ordner bookmarks/
// ausgezogen. Der Dialog-Zustand liegt unveraendert im Renderer-State
// (state.bookmarks.moveDialog), weil ihn die Esc-Kaskade und die
// Bestaetigungs-Handler aus app-init lesen.
'use strict';

import { t } from '../../i18n.js';

import { state } from '../app/app-state.js';

import { removeBookmark } from './bookmarks-actions.js';
import { BOOKMARK_ICON_FOLDER_CLOSED, cssEscape, renderBookmarks } from './bookmarks-render.js';
import {
  SECTION_GENERAL,
  bookmarkSection,
  cloneSectionTree,
  collectSubtreeIds,
  findNodeLocation,
  insertAtEndOfGroup,
  persistAreaBookmarksTree,
  persistBookmarksTree,
} from './bookmarks-tree.js';
// Laufzeit-Zyklus innerhalb des Ordners: siehe Kopf von bookmarks-render.js.
import { loadAreaBookmarks, updateBookmarksToggleButton } from './bookmarks.js';

// === Bestaetigungs-Dialog beim Folder-Entfernen ============================
export function openBookmarkConfirmRemoveDialog(node, counts, section) {
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
  // 4T-000612: Abschnitt merken, damit die Bestaetigung im richtigen Baum loescht.
  modal.dataset.section = (section || bookmarkSection(SECTION_GENERAL)).kind;
  modal.hidden = false;
  const okBtn = document.getElementById('btn-bookmark-confirm-remove-ok');
  if (okBtn) okBtn.focus();
}

export function closeBookmarkConfirmRemoveDialog() {
  const modal = document.getElementById('bookmark-confirm-remove-modal');
  if (modal) {
    modal.hidden = true;
    delete modal.dataset.targetId;
    delete modal.dataset.section;
  }
}

export async function confirmBookmarkConfirmRemove() {
  const modal = document.getElementById('bookmark-confirm-remove-modal');
  if (!modal) return;
  const id = modal.dataset.targetId;
  const sec = bookmarkSection(modal.dataset.section || SECTION_GENERAL);
  closeBookmarkConfirmRemoveDialog();
  if (id) await removeBookmark(id, sec);
}

// === Modal-Picker "In Ordner verschieben..." ===============================
// 4T-000612: das Verschieben bleibt innerhalb DESSELBEN Abschnitts (der Picker
// listet nur Ordner dieses Abschnitts). Ein Wechsel zwischen den Abschnitten
// laeuft ueber "umwandeln".
export function openBookmarkMoveDialog(sourceId, section) {
  const sec = section || bookmarkSection(SECTION_GENERAL);
  const loc = findNodeLocation(sec.getTree(), sourceId);
  if (!loc) return;
  const node = loc.container[loc.index];
  // Bei Folder: Zyklus-Schutz - Source und alle Nachfahren als Ziel sperren.
  // Bei Bookmark: nur der eigene Parent ist sinnlos (No-Op), aber wir
  // erlauben den Klick und filtern beim Verschieben (No-Op).
  const blockedIds = node.type === 'folder' ? collectSubtreeIds(node) : new Set();
  state.bookmarks.moveDialog = {
    sourceId,
    targetFolderId: null,
    blockedIds,
    sectionKind: sec.kind,
  };
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
  // S-11 (4T-000188): initialen Fokus setzen wie bei den uebrigen Modals
  // (Cancel-Button als sichere Default-Aktion); vorher blieb der Fokus
  // hinter dem Modal und die Zielwahl war nur per Maus moeglich.
  const cancelBtn = document.getElementById('btn-bookmark-move-cancel');
  if (cancelBtn) setTimeout(() => cancelBtn.focus(), 0);
}

export function closeBookmarkMoveDialog() {
  const modal = document.getElementById('bookmark-move-modal');
  if (modal) modal.hidden = true;
  state.bookmarks.moveDialog = {
    sourceId: null,
    targetFolderId: null,
    blockedIds: null,
    sectionKind: 'general',
  };
}

// S-11 (4T-000188): gemeinsame Zielwahl fuer Klick UND Tastatur (Enter/
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
  const sec = bookmarkSection(state.bookmarks.moveDialog.sectionKind || SECTION_GENERAL);
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
  // Alle Folder-Knoten des Abschnitts rekursiv listen.
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
  walk(sec.getTree(), 0);
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
  const sec = bookmarkSection(state.bookmarks.moveDialog.sectionKind || SECTION_GENERAL);
  const loc = findNodeLocation(sec.getTree(), sourceId);
  if (!loc) {
    btn.disabled = true;
    return;
  }
  const currentParentId = loc.parent ? loc.parent.id : null;
  btn.disabled = (currentParentId || null) === (targetFolderId || null);
}

export async function confirmBookmarkMove() {
  const { sourceId, targetFolderId } = state.bookmarks.moveDialog;
  const sec = bookmarkSection(state.bookmarks.moveDialog.sectionKind || SECTION_GENERAL);
  closeBookmarkMoveDialog();
  if (!sourceId) return;
  const tree = cloneSectionTree(sec);
  const loc = findNodeLocation(tree, sourceId);
  if (!loc) return;
  const node = loc.container.splice(loc.index, 1)[0];
  if (!targetFolderId) {
    // 4T-000078: ans Ende der entsprechenden Gruppe im Root.
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
  sec.setTree(tree);
  if (sec.isArea) {
    const res = await persistAreaBookmarksTree();
    if (!res.ok) await loadAreaBookmarks();
  } else {
    await persistBookmarksTree();
  }
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}
