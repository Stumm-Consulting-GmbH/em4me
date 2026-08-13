// Lesezeichen: Datenmodell, Abschnitts-Abstraktion und Persistenz.
// 4T-0991 (Epic 3E-0196): aus bookmarks.js in den Ordner bookmarks/
// ausgezogen. Blatt-Modul des Ordners — es kennt weder Rendering noch
// Bedienung und importiert kein Geschwister-Modul.
// 4T-0612 (Epic 3E-0115): zweigeteiltes Panel — allgemeine Lesezeichen
// (globaler Baum, absolute Pfade, electron-store) und Bereichs-Lesezeichen
// (bereichsgebundener Baum, wurzel-relative Pfade, Area_Settings.mdda ueber
// die 4T-0611-Bruecken).
'use strict';

import { api } from '../app/api.js';
import { activeTab, state } from '../app/app-state.js';
import { persistSetting } from '../views/views.js';
// 4T-0611/4T-0612 (Epic 3E-0115): prozess-neutrale Pfad-Helfer der Bereichs-
// Lesezeichen (esbuild bundelt das CJS-Modul transparent).
import { toAbsolute, toRootRelative } from '../../../shared/bookmark-tree.js';

// === 4T-0075 (Epic 3E-0013): Bookmarks-Basis ================================
// Persistente Lesezeichen mit Tree-Datenmodell (Folder + File-Knoten).

export function newBookmarkId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// === 4T-0612 (Epic 3E-0115): Abschnitts-Abstraktion =========================
// Ein Abschnitt buendelt Baum, Persistenz-Ziel und DOM-Container. 'general'
// ist der bestehende globale Baum (absolute Pfade), 'area' der bereichs-
// gebundene Baum (wurzel-relative Pfade). Die Objekt-Methoden lesen den State
// LIVE, damit ein einmal in einem Event-Listener gebundenes Abschnitts-Objekt
// ueber spaetere Renders hinweg gueltig bleibt.
export const SECTION_GENERAL = 'general';
export const SECTION_AREA = 'area';

export function bookmarkSection(kind) {
  const isArea = kind === SECTION_AREA;
  return {
    kind: isArea ? SECTION_AREA : SECTION_GENERAL,
    isArea,
    getTree: () => (isArea ? state.bookmarks.areaTree : state.bookmarks.tree),
    setTree: (tree) => {
      if (isArea) state.bookmarks.areaTree = tree;
      else state.bookmarks.tree = tree;
    },
    treeElOf: (els) => (isArea ? els.bookmarksAreaTree : els.bookmarksTree),
    emptyElOf: (els) => (isArea ? els.bookmarksAreaEmpty : els.bookmarksEmpty),
    groupElOf: (els) => (isArea ? els.bookmarksAreaGroup : els.bookmarksGeneralGroup),
  };
}

// Tiefe Kopie des allgemeinen Baums fuer Update-Operationen. Da der Baum
// ueberschaubar klein ist (typisch < 100 Knoten), reicht JSON-Roundtrip.
export function cloneBookmarksTree() {
  return JSON.parse(JSON.stringify(state.bookmarks.tree || []));
}

// 4T-0612: Tiefe Kopie des Baums EINES Abschnitts (allgemein oder Bereich).
export function cloneSectionTree(section) {
  return JSON.parse(JSON.stringify(section.getTree() || []));
}

// 4T-0612: Absoluter Ziel-Pfad eines Knotens. Allgemein direkt, Bereich gegen
// die aktuelle Bereichs-Wurzel aufgeloest. null, wenn kein Bereich offen ist
// oder das Ziel unaufloesbar bleibt.
export function resolveBookmarkPath(section, node) {
  if (!node) return null;
  if (!section.isArea) return node.filePath || null;
  if (!state.areaPath) return null;
  return toAbsolute(state.areaPath, node.filePath);
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

export function collectFileNodes(nodes, out) {
  for (const n of nodes) {
    if (n.type === 'file') out.push(n);
    if (n.type === 'folder' && Array.isArray(n.children)) collectFileNodes(n.children, out);
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

// === Persistenz =============================================================

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

// 4T-0612 (Epic 3E-0115): Bereichs-Baum in die bookmarks-Sektion der
// Bereichsdatei schreiben (IPC-Bruecke aus 4T-0611). Der Handler validiert die
// Grenze, entfernt die Sektion bei leerer Liste und broadcastet 'bookmarks:
// changed'. Liefert { ok } zurueck; bei Erfolg wird der normalisierte Stand
// uebernommen, damit In-Memory und Datei deckungsgleich sind. Bei Fehler (IO,
// oder als Sicherheitsnetz 'outside-area') bleibt der zuletzt geladene Stand
// massgeblich — der Aufrufer meldet und laedt neu.
export async function persistAreaBookmarksTree() {
  try {
    const res = await api.bookmarksSetAreaConfig(state.bookmarks.areaTree);
    if (res && res.ok) {
      if (Array.isArray(res.config)) state.bookmarks.areaTree = res.config;
      return { ok: true };
    }
    return { ok: false, error: res ? res.error : 'unknown' };
  } catch {
    return { ok: false, error: 'ipc' };
  }
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

export async function persistBookmarksSettings() {
  await api.setSetting('bookmarks.visibleColumn0', !!state.bookmarks.visibleByPane[0]);
  await api.setSetting('bookmarks.visibleColumn1', !!state.bookmarks.visibleByPane[1]);
}

export async function loadBookmarksSettings() {
  const v0 = await api.getSetting('bookmarks.visibleColumn0');
  const v1 = await api.getSetting('bookmarks.visibleColumn1');
  state.bookmarks.visibleByPane[0] = !!v0;
  state.bookmarks.visibleByPane[1] = !!v1;
  // 4T-0612 (Epic 3E-0115): Abschnitts-Reihenfolge (global, Default an).
  const areaFirst = await api.getSetting('bookmarks.areaFirst');
  state.bookmarks.areaFirst = areaFirst !== false;
}

// === Abfragen ueber beide Abschnitte ========================================

// 4T-0612: Gibt es in irgendeinem Abschnitt Lesezeichen? Steuert Empty-State
// und Panel-Sichtbarkeit.
export function hasAnyBookmarks() {
  const general = Array.isArray(state.bookmarks.tree) && state.bookmarks.tree.length > 0;
  const area =
    !!state.areaPath &&
    Array.isArray(state.bookmarks.areaTree) &&
    state.bookmarks.areaTree.length > 0;
  return general || area;
}

// 4T-0612: Welche Lesezeichen-Ziele kommen fuer einen absoluten Pfad in Frage?
// Genutzt von den Kontextmenue-Eintraegen am Tab und im Bereichs-Panel.
// general/area sind true, wenn dort noch KEIN Lesezeichen auf die Datei
// existiert; insideArea ist true, wenn ein Bereich offen ist und die Datei
// innerhalb liegt.
export function bookmarkTargetsForPath(absPath) {
  const general = !!absPath && !findBookmarkByPath(state.bookmarks.tree, absPath);
  let insideArea = false;
  let area = false;
  if (absPath && state.areaPath) {
    const rel = toRootRelative(state.areaPath, absPath);
    if (rel !== null) {
      insideArea = true;
      area = !findBookmarkByPath(state.bookmarks.areaTree, rel);
    }
  }
  return { general, area, insideArea };
}

// 4T-0612: Ist die aktive Datei in irgendeinem Abschnitt als Lesezeichen
// gemerkt? (Statusbar-Stern-Zustand).
export function isActiveFileBookmarked() {
  const tab = activeTab();
  const p = tab && tab.path;
  if (!p) return false;
  if (findBookmarkByPath(state.bookmarks.tree, p)) return true;
  if (state.areaPath) {
    const rel = toRootRelative(state.areaPath, p);
    if (rel !== null && findBookmarkByPath(state.bookmarks.areaTree, rel)) return true;
  }
  return false;
}

// === Existenz-Cache =========================================================
// R3-08 (4T-0180): Existenz-Cache fuer Bookmark-Ziele samt Pflege-Hook
// fuer bekannte Datei-Ereignisse (reloadFile -> true, markFileMissing ->
// false). Unbekannte Pfade werden beim naechsten Render frisch geprueft.
// Schluessel ist der aufgeloeste ABSOLUTE Pfad (allgemein direkt, Bereich
// gegen die Wurzel aufgeloest), damit relative Bereichs-Ziele nicht mit
// absoluten kollidieren.
// 4T-0991 (Epic 3E-0196): Die Map bleibt Modul-Variable und wird nur ueber
// Zugriffs-Funktionen angeboten (Entwicklungsrichtlinien: veraenderlicher
// Zustand wandert nie als Export ueber Modul-Grenzen).
const bookmarkExistsCache = new Map();

export function noteBookmarkFileExistence(filePath, exists) {
  if (!filePath) return;
  bookmarkExistsCache.set(filePath, !!exists);
}

// true/false, wenn der Pfad bekannt ist; undefined, wenn er noch nie
// geprueft wurde (der Aufrufer stoesst dann die Pruefung an).
export function readBookmarkFileExistence(filePath) {
  return bookmarkExistsCache.get(filePath);
}

export function clearBookmarkExistsCache() {
  bookmarkExistsCache.clear();
}
