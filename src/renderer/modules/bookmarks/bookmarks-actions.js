// Lesezeichen: Aktionen an Knoten — Anlegen, Umwandeln, Entfernen, Auf- und
// Zuklappen, Oeffnen.
// 4T-0991 (Epic 3E-0196): aus bookmarks.js in den Ordner bookmarks/
// ausgezogen. Gegenueber der Bestandsaufnahme ein eigenes Modul, weil die
// Anlage- und Umwandlungs-Fluesse zusammen rund 300 Zeilen wiegen: im Kern
// haetten sie dessen Budget gesprengt, in bookmarks-edit.js dessen
// Zuschnitt (Inline-Edit und Kontextmenue) aufgeweicht.
// Laufzeit-Zyklus innerhalb des Ordners: siehe Kopf von bookmarks-render.js.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { activeTab, state } from '../app/app-state.js';
import { appendContextMenuItem, placeContextMenuAt } from '../dialogs/context-menu-utils.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { showStatusbarHint, updateEmptyState } from '../views/views.js';
import { mapBookmarkFilePaths, toAbsolute, toRootRelative } from '../../../shared/bookmark-tree.js';

import { renderBookmarks } from './bookmarks-render.js';
import {
  SECTION_AREA,
  SECTION_GENERAL,
  bookmarkSection,
  cloneBookmarksTree,
  cloneSectionTree,
  findBookmarkByPath,
  findNodeById,
  findNodeLocation,
  hasAnyBookmarks,
  insertAtEndOfGroup,
  newBookmarkId,
  persistAreaBookmarksTree,
  persistBookmarksSettings,
  persistBookmarksTree,
  removeNodeById,
  resolveBookmarkPath,
} from './bookmarks-tree.js';
import {
  applyBookmarksVisibility,
  loadAreaBookmarks,
  openOrJumpToPath,
  updateBookmarksToggleButton,
} from './bookmarks.js';

// === 4T-0612 (Epic 3E-0115): Anlage-Fluss mit Ziel-Wahl =====================

// Ziel-Wahl-Menue: bei geoeffnetem Bereich und Datei innerhalb des Bereichs
// wird gefragt, ob das Lesezeichen allgemein oder bereichsgebunden angelegt
// wird (Muster showCommandOverflowMenu). 4T-0612 (Epic 3E-0115, PO-Testbefund
// EXE 0.91.0.919): Das Menue erscheint oben links im Fenster, unterhalb der
// Menueleiste (dort sitzt das Datei-Menue, zu dem die Lesezeichen-Anlage
// gehoert), nicht mehr unten am Statusbar-Stern.
const BOOKMARK_TARGET_MENU_LEFT = 8;
const BOOKMARK_TARGET_MENU_TOP = 8;

function showBookmarkTargetMenu(absPath) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.innerHTML = '';
  appendContextMenuItem(menu, {
    key: 'bookmarks.target.general',
    dataId: 'bookmark-target-general',
    action: () => addGeneralBookmarkForPath(absPath),
  });
  appendContextMenuItem(menu, {
    key: 'bookmarks.target.area',
    dataId: 'bookmark-target-area',
    action: () => addAreaBookmarkForPath(absPath),
  });
  placeContextMenuAt(menu, BOOKMARK_TARGET_MENU_LEFT, BOOKMARK_TARGET_MENU_TOP);
}

export async function addBookmarkForActiveFile() {
  const tab = activeTab();
  if (!tab || !tab.path) {
    showStatusbarHint(null, { text: t('bookmarks.add.untitled'), duration: 2000 });
    return;
  }
  // Ziel-Wahl nur, wenn ein Bereich offen ist UND die Datei innerhalb liegt.
  const insideArea = !!state.areaPath && toRootRelative(state.areaPath, tab.path) !== null;
  if (insideArea) {
    showBookmarkTargetMenu(tab.path);
    return;
  }
  // Kein Bereich oder Datei ausserhalb: ohne Nachfrage allgemein anlegen
  // (heutiges Verhalten).
  await addGeneralBookmarkForPath(tab.path);
}

// 4T-0612: Lesezeichen fuer einen absoluten Pfad im allgemeinen Abschnitt
// anlegen. Genutzt vom Ziel-Wahl-Menue, vom Tab-Kontextmenue und vom
// bisherigen Strg+D-/Menue-Fluss.
export async function addGeneralBookmarkForPath(absPath) {
  return addBookmarkToSection(bookmarkSection(SECTION_GENERAL), absPath);
}

// 4T-0612: Lesezeichen fuer einen absoluten Pfad im Bereichs-Abschnitt anlegen.
// Genutzt vom Ziel-Wahl-Menue, vom Tab-Kontextmenue und vom Kontextmenue der
// Datei-Zeilen im Bereichs-Panel. Datei ausserhalb -> Ablehnung mit Hinweis.
export async function addAreaBookmarkForPath(absPath) {
  return addBookmarkToSection(bookmarkSection(SECTION_AREA), absPath);
}

// Gemeinsamer Anlage-Fluss fuer beide Abschnitte. absPath ist immer absolut;
// fuer den Bereichs-Abschnitt wird er gegen die Wurzel relativiert (Datei
// ausserhalb -> Ablehnung). Ablage-Logik (Selektion) und Auto-Sichtbarkeit
// wie im bisherigen allgemeinen Fluss.
async function addBookmarkToSection(section, absPath) {
  if (!absPath) return;
  let storedPath = absPath;
  if (section.isArea) {
    const rel = state.areaPath ? toRootRelative(state.areaPath, absPath) : null;
    if (rel === null) {
      showStatusbarHint(null, { text: t('bookmarks.outsideArea'), error: true, duration: 2500 });
      return;
    }
    storedPath = rel;
  }
  const existing = findBookmarkByPath(section.getTree(), storedPath);
  if (existing) {
    showStatusbarHint(null, { text: t('bookmarks.add.alreadyExists'), duration: 2000 });
    return;
  }
  const treeBefore = section.getTree();
  const wasEmpty = !Array.isArray(treeBefore) || treeBefore.length === 0;
  const tree = cloneSectionTree(section);
  const displayName = api.basename(absPath);
  const node = {
    type: 'file',
    id: newBookmarkId('b'),
    filePath: storedPath,
    displayName,
    addedAt: new Date().toISOString(),
  };

  // 4T-0078/4T-0612: Ablage-Logik. Ein selektierter Knoten DESSELBEN
  // Abschnitts steuert die Position (in dessen Ordner bzw. als Geschwister);
  // sonst ans Ende der File-Gruppe im Root.
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
        insertAtEndOfGroup(selNode.children, node);
        selNode.expanded = true;
        parentFolderName = selNode.name || '';
        placed = true;
      } else {
        loc.container.splice(loc.index + 1, 0, node);
        parentFolderName = loc.parent ? loc.parent.name || '' : '';
        placed = true;
      }
    }
  }
  if (!placed) insertAtEndOfGroup(tree, node);
  section.setTree(tree);

  if (section.isArea) {
    const res = await persistAreaBookmarksTree();
    if (!res.ok) {
      await loadAreaBookmarks();
      showStatusbarHint(null, { text: t('bookmarks.outsideArea'), error: true, duration: 2500 });
      return;
    }
  } else {
    await persistBookmarksTree();
  }

  // 4T-0075/4T-0612: Beim ersten Lesezeichen eines Abschnitts die Sektion
  // automatisch sichtbar machen, wenn sie noch nicht sichtbar ist.
  if (wasEmpty && !state.bookmarks.visibleByPane[state.activePaneIndex]) {
    state.bookmarks.visibleByPane[state.activePaneIndex] = true;
    await persistBookmarksSettings();
    applyBookmarksVisibility(state.activePaneIndex);
    // R3-11 (4T-0187): auch die andere Pane rendern.
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

// === 4T-0612 (Epic 3E-0115): Umwandeln zwischen den Abschnitten =============

// Einen Knoten (Datei oder Ordner mit Unterbaum) aus den allgemeinen in die
// Bereichs-Lesezeichen umwandeln. Alle Datei-Ziele des Unterbaums muessen
// innerhalb des Bereichs liegen; liegt eines ausserhalb, wird der GANZE
// Vorgang abgelehnt (outside-area-Semantik). Zuerst wird der Bereichs-Baum
// geschrieben (kann als Sicherheitsnetz scheitern); erst bei Erfolg wird der
// Knoten aus dem allgemeinen Baum entfernt, damit nichts verloren geht.
export async function convertBookmarkToArea(nodeId) {
  if (!state.areaPath) return;
  const loc = findNodeLocation(state.bookmarks.tree, nodeId);
  if (!loc) return;
  const source = loc.container[loc.index];
  const converted = mapBookmarkFilePaths(source, (abs) => toRootRelative(state.areaPath, abs));
  if (converted === null) {
    showStatusbarHint(null, {
      text: t('bookmarks.convert.outsideArea'),
      error: true,
      duration: 2500,
    });
    return;
  }
  const nextArea = cloneSectionTree(bookmarkSection(SECTION_AREA));
  insertAtEndOfGroup(nextArea, converted);
  state.bookmarks.areaTree = nextArea;
  const res = await persistAreaBookmarksTree();
  if (!res.ok) {
    await loadAreaBookmarks();
    showStatusbarHint(null, {
      text: t('bookmarks.convert.outsideArea'),
      error: true,
      duration: 2500,
    });
    return;
  }
  const nextGeneral = cloneBookmarksTree();
  removeNodeById(nextGeneral, nodeId);
  state.bookmarks.tree = nextGeneral;
  if (state.bookmarks.selectedId === nodeId) state.bookmarks.selectedId = null;
  await persistBookmarksTree();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

// Einen Knoten aus den Bereichs- in die allgemeinen Lesezeichen umwandeln.
// Die relativen Ziele werden gegen die aktuelle Wurzel absolut gemacht. Zuerst
// wird der allgemeine Baum geschrieben, dann der Knoten aus dem Bereichs-Baum
// entfernt.
export async function convertBookmarkToGeneral(nodeId) {
  if (!state.areaPath) return;
  const loc = findNodeLocation(state.bookmarks.areaTree, nodeId);
  if (!loc) return;
  const source = loc.container[loc.index];
  const converted = mapBookmarkFilePaths(source, (rel) => toAbsolute(state.areaPath, rel));
  if (converted === null) return;
  const nextGeneral = cloneBookmarksTree();
  insertAtEndOfGroup(nextGeneral, converted);
  state.bookmarks.tree = nextGeneral;
  await persistBookmarksTree();
  const nextArea = cloneSectionTree(bookmarkSection(SECTION_AREA));
  removeNodeById(nextArea, nodeId);
  state.bookmarks.areaTree = nextArea;
  if (state.bookmarks.selectedId === nodeId) state.bookmarks.selectedId = null;
  const res = await persistAreaBookmarksTree();
  if (!res.ok) await loadAreaBookmarks();
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
}

// === Entfernen, Auf- und Zuklappen, Oeffnen =================================

export async function removeBookmark(id, section) {
  const sec = section || bookmarkSection(SECTION_GENERAL);
  const tree = cloneSectionTree(sec);
  if (!removeNodeById(tree, id)) return;
  sec.setTree(tree);
  if (state.bookmarks.selectedId === id) state.bookmarks.selectedId = null;
  if (sec.isArea) {
    const res = await persistAreaBookmarksTree();
    if (!res.ok) await loadAreaBookmarks();
  } else {
    await persistBookmarksTree();
  }
  for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  updateBookmarksToggleButton();
  // 4T-0075: Wenn jetzt kein Bookmark mehr da ist und kein Tab offen, soll
  // der Empty-State-Pane wieder ausgeblendet werden (Sidebar verschwindet).
  if (!hasAnyBookmarks()) updateEmptyState();
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

export async function toggleBookmarkFolder(id, section) {
  const sec = section || bookmarkSection(SECTION_GENERAL);
  const tree = cloneSectionTree(sec);
  const node = findNodeById(tree, id);
  if (!node || node.type !== 'folder') return;
  node.expanded = !node.expanded;
  sec.setTree(tree);
  if (sec.isArea) {
    const res = await persistAreaBookmarksTree();
    if (!res.ok) await loadAreaBookmarks();
  } else {
    await persistBookmarksTree();
  }
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

// 4T-0612: Einen Knoten oeffnen (Abschnitts-aufloesend). Bereichs-Ziele werden
// gegen die aktuelle Wurzel absolut gemacht.
export async function openBookmarkNode(section, node) {
  const abs = resolveBookmarkPath(section, node);
  if (!abs) {
    showStatusbarHint(null, { text: t('bookmarks.notFound'), error: true, duration: 2500 });
    return;
  }
  await openBookmarkFile(abs);
}
