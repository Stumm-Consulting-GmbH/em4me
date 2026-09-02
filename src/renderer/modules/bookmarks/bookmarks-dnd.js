// === 4T-000079: Drag-and-Drop der Lesezeichen ================================
// 4T-000991 (Epic 3E-000196): aus bookmarks.js in den Ordner bookmarks/
// ausgezogen.
// HTML5-DnD-API. Drei Drop-Zonen pro Knoten:
//   - obere Drittel: davor (gleiche Ebene)
//   - mittlere Drittel: in Folder hinein (nur bei Folder-Knoten; bei
//     Bookmarks faellt das in "davor" oder "danach" je nach Position)
//   - untere Drittel: danach (gleiche Ebene)
// Zyklus-Schutz: ein Folder kann nicht in sich selbst oder einen seiner
// Nachfahren gezogen werden. Drop auf den leeren Sektions-Bereich legt am
// Ende des Roots ab.
// 4T-000612: Drag-and-Drop bleibt strikt innerhalb des eigenen Abschnitts —
// der Drag traegt seinen Abschnitt (sectionKind), fremde Abschnitte lehnen
// den Drop ab (Cross-Drag ueber die Grenze ist bewusst nicht im Umfang;
// der Wechsel laeuft ueber "umwandeln").
//
// Der Zieh-Zustand liegt unveraendert im Renderer-State (state.bookmarks.
// dragging) und nicht als Modul-Variable, weil ihn der Esc-Abbruch aus
// app-init und der Render lesen.
'use strict';

import { state } from '../app/app-state.js';

import { renderBookmarks } from './bookmarks-render.js';
import {
  SECTION_GENERAL,
  bookmarkSection,
  cloneSectionTree,
  collectSubtreeIds,
  findNodeLocation,
  persistAreaBookmarksTree,
  persistBookmarksTree,
} from './bookmarks-tree.js';
// Laufzeit-Zyklus innerhalb des Ordners (siehe Kopf von bookmarks-render.js):
// Sichtbarkeit, Stern-Zustand und das Nachladen des Bereichs-Baums liegen im
// Kern, der umgekehrt den Panel-Aufbau anstoesst.
import { loadAreaBookmarks, updateBookmarksToggleButton } from './bookmarks.js';

export const BOOKMARK_DND_MIME = 'application/x-bookmark-id';

export function handleBookmarkDragStart(ev, node, section) {
  if (!node || !node.id) return;
  const sec = section || bookmarkSection(SECTION_GENERAL);
  if (ev.dataTransfer) {
    ev.dataTransfer.setData(BOOKMARK_DND_MIME, node.id);
    ev.dataTransfer.effectAllowed = 'move';
  }
  state.bookmarks.dragging = {
    sourceId: node.id,
    blockedIds: node.type === 'folder' ? collectSubtreeIds(node) : new Set([node.id]),
    targetId: null,
    zone: null,
    sectionKind: sec.kind,
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
      '.bookmark-row.is-drop-before, .bookmark-row.is-drop-after, .bookmark-row.is-drop-into, .bookmarks-group.is-drop-root',
    )
    .forEach((el) => {
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-into', 'is-drop-root');
    });
}

export function handleBookmarkDragOverNode(ev, node, rowEl, section) {
  const drag = state.bookmarks.dragging;
  if (!drag || !drag.sourceId) return;
  const sec = section || bookmarkSection(SECTION_GENERAL);
  // 4T-000612: kein Drop ueber die Abschnitts-Grenze.
  if (drag.sectionKind !== sec.kind) {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
    return;
  }
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

export function handleBookmarkDragOverRoot(ev, containerEl, section) {
  const drag = state.bookmarks.dragging;
  if (!drag || !drag.sourceId) return;
  const sec = section || bookmarkSection(SECTION_GENERAL);
  // 4T-000612: kein Drop ueber die Abschnitts-Grenze.
  if (drag.sectionKind !== sec.kind) {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
    return;
  }
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

export async function handleBookmarkDrop(ev, section) {
  const drag = state.bookmarks.dragging;
  if (!drag || !drag.sourceId) {
    // Kein interner Bookmark-Drag -> Event durchreichen, damit der App-
    // weite window-Drop-Handler (init.js) Datei-Drops aus dem Explorer
    // weiter empfangen kann. Sonst blockiert mein preventDefault/
    // stopPropagation den Datei-Open-Flow.
    return;
  }
  const sec = section || bookmarkSection(SECTION_GENERAL);
  ev.preventDefault();
  ev.stopPropagation();
  // 4T-000612: Drop im fremden Abschnitt wird abgewiesen (kein Cross-Drag).
  if (drag.sectionKind !== sec.kind) {
    state.bookmarks.dragging = {
      sourceId: null,
      blockedIds: null,
      targetId: null,
      zone: null,
      sectionKind: null,
    };
    clearAllBookmarkDropIndicators();
    return;
  }
  const sourceId = drag.sourceId;
  const targetId = drag.targetId;
  const zone = drag.zone;
  state.bookmarks.dragging = {
    sourceId: null,
    blockedIds: null,
    targetId: null,
    zone: null,
    sectionKind: null,
  };
  clearAllBookmarkDropIndicators();
  if (!targetId || !zone) return;
  await moveBookmarkNodeByDrop(sourceId, targetId, zone, sec);
}

export function handleBookmarkDragEnd() {
  state.bookmarks.dragging = {
    sourceId: null,
    blockedIds: null,
    targetId: null,
    zone: null,
    sectionKind: null,
  };
  clearAllBookmarkDropIndicators();
}

export async function moveBookmarkNodeByDrop(sourceId, targetId, zone, section) {
  if (!sourceId || !targetId || !zone) return;
  const sec = section || bookmarkSection(SECTION_GENERAL);
  const tree = cloneSectionTree(sec);
  const sourceLoc = findNodeLocation(tree, sourceId);
  if (!sourceLoc) return;
  // Source aus dem alten Container entfernen.
  const node = sourceLoc.container.splice(sourceLoc.index, 1)[0];
  const commit = async () => {
    sec.setTree(tree);
    if (sec.isArea) {
      const res = await persistAreaBookmarksTree();
      if (!res.ok) await loadAreaBookmarks();
    } else {
      await persistBookmarksTree();
    }
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
    updateBookmarksToggleButton();
  };
  if (targetId === '__root__') {
    // Drop auf den leeren Sektions-Bereich -> ans Ende des Roots.
    tree.push(node);
    await commit();
    return;
  }
  const targetLoc = findNodeLocation(tree, targetId);
  if (!targetLoc) {
    // Ziel nicht mehr da (sollte nicht passieren): an Root anhaengen.
    tree.push(node);
    await commit();
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
  await commit();
}
