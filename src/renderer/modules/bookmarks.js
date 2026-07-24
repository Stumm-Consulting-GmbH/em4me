// Lesezeichen-Baum: Persistenz, Rendering, Drag-and-Drop, Inline-Edit und Kontextmenue.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-0612 (Epic 3E-0115): zweigeteiltes Panel — allgemeine Lesezeichen (globaler
// Baum, absolute Pfade, electron-store) und Bereichs-Lesezeichen (bereichs-
// gebundener Baum, wurzel-relative Pfade, Area_Settings.mdda ueber die
// 4T-0611-Bruecken). Rendering, Drag-and-Drop, Inline-Edit, Kontextmenue und
// Existenz-Pruefung teilen sich beide Abschnitte ueber eine Abschnitts-
// Abstraktion (bookmarkSection); Drag-and-Drop bleibt strikt innerhalb des
// eigenen Abschnitts, der Wechsel laeuft ueber "umwandeln" im Kontextmenue.
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
import { appendContextMenuItem, hideContextMenu, placeContextMenuAt } from './dialogs.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Panel-Registry — Bookmarks registriert
// sich am Modul-Ende; Einblenden aktiviert den Gruppen-Reiter.
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
// 4T-0611/4T-0612 (Epic 3E-0115): prozess-neutrale Pfad-Helfer der Bereichs-
// Lesezeichen (esbuild bundelt das CJS-Modul transparent).
import { toAbsolute, toRootRelative, mapBookmarkFilePaths } from '../../shared/bookmark-tree.js';

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

// 4T-0612 (Epic 3E-0115): Bereichs-Lesezeichen aus der Bereichsdatei laden
// (leer ohne Bereich). Wird beim App-Start, beim Bereichs-Wechsel (app-init)
// und beim Aenderungs-Broadcast eines anderen Fensters aufgerufen.
export async function loadAreaBookmarks() {
  try {
    const res = await api.bookmarksGetConfig();
    state.bookmarks.areaTree = res && res.ok && Array.isArray(res.config) ? res.config : [];
  } catch {
    state.bookmarks.areaTree = [];
  }
  // Der Existenz-Cache haelt aufgeloeste absolute Pfade; nach einem Bereichs-
  // Wechsel koennen dieselben relativen Ziele auf andere Dateien zeigen.
  bookmarkExistsCache.clear();
  for (let p = 0; p < state.panes.length; p++) applyBookmarksVisibility(p);
}

// 4T-0612 (Epic 3E-0115, PO-Testbefund EXE 0.91.0.919): Mehr-Fenster-Konsistenz
// der ALLGEMEINEN Lesezeichen. Der globale Baum liegt im electron-store
// (settings-Key bookmarksTree); ein Schreibvorgang in einem Fenster meldet
// 'bookmarksTree:changed' an die uebrigen Fenster (Main als Verteiler, ohne das
// ausloesende Fenster). Der Empfaenger uebernimmt den frischen Baum und rendert
// den allgemeinen Abschnitt neu. Der Existenz-Cache wird verworfen, weil neue
// Ziele hinzugekommen sein koennen; updateEmptyState blendet in einer leeren
// App die Sidebar ein, sobald ein Lesezeichen vorhanden ist.
export function reloadGeneralBookmarksTree(tree) {
  state.bookmarks.tree = Array.isArray(tree) ? tree : [];
  bookmarkExistsCache.clear();
  for (let p = 0; p < state.panes.length; p++) applyBookmarksVisibility(p);
  updateEmptyState();
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
// 4T-0612 (Epic 3E-0115): zusaetzlich der Bereichs-Baum. Dessen Ziele sind
// wurzel-relativ; ein Umbenennen von Dateien UND Ordnern innerhalb des
// Bereichs zieht die relativen Pfade nach (Datei: exakter Match, Ordner:
// Praefix-Ersatz fuer alle darunter liegenden Ziele). Das globale Modell
// bleibt unveraendert (weiterhin nur exakter absoluter Match).
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
  if (changed) await persistBookmarksTree();

  // Bereichs-Baum: wurzel-relative Ziele. Nur nachziehen, wenn ein Bereich
  // offen ist und beide Pfade innerhalb liegen (sonst betrifft das Umbenennen
  // den Bereichs-Baum nicht).
  let areaChanged = false;
  if (state.areaPath && Array.isArray(state.bookmarks.areaTree)) {
    const oldRel = toRootRelative(state.areaPath, oldPath);
    const newRel = toRootRelative(state.areaPath, newPath);
    if (oldRel !== null && newRel !== null) {
      const walkArea = (nodes) => {
        for (const n of nodes || []) {
          if (n && n.type === 'file' && typeof n.filePath === 'string') {
            if (n.filePath === oldRel) {
              if (n.displayName === oldName) n.displayName = newName;
              n.filePath = newRel;
              areaChanged = true;
            } else if (n.filePath.startsWith(oldRel + '/')) {
              // Datei unterhalb eines umbenannten Ordners: Praefix ersetzen.
              n.filePath = newRel + n.filePath.slice(oldRel.length);
              areaChanged = true;
            }
          } else if (n && n.type === 'folder') {
            walkArea(n.children);
          }
        }
      };
      walkArea(state.bookmarks.areaTree);
      if (areaChanged) await persistAreaBookmarksTree();
    }
  }

  if (changed || areaChanged) {
    for (let p = 0; p < state.panes.length; p++) renderBookmarks(p);
  }
  return changed || areaChanged;
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

// 4T-0612 (Epic 3E-0115): Reihenfolge-Schalter aus den Einstellungen. Wirkt
// sofort (Panel neu rendern) und persistiert global.
export async function setBookmarksAreaFirst(value) {
  const next = value !== false;
  state.bookmarks.areaFirst = next;
  await persistSetting('bookmarks.areaFirst', next);
  for (let p = 0; p < state.panes.length; p++) renderBookmarks(p);
}

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
function isActiveFileBookmarked() {
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
    const cached = bookmarkExistsCache.get(resolved);
    if (cached === false) {
      markMissing(node.id);
      api
        .fileExists(resolved)
        .then((exists) => {
          bookmarkExistsCache.set(resolved, !!exists);
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
          bookmarkExistsCache.set(resolved, !!exists);
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
// Schluessel ist der aufgeloeste ABSOLUTE Pfad (allgemein direkt, Bereich
// gegen die Wurzel aufgeloest), damit relative Bereichs-Ziele nicht mit
// absoluten kollidieren.
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

// === 4T-0079: Drag-and-Drop ===============================================
// HTML5-DnD-API. Drei Drop-Zonen pro Knoten:
//   - obere Drittel: davor (gleiche Ebene)
//   - mittlere Drittel: in Folder hinein (nur bei Folder-Knoten; bei
//     Bookmarks faellt das in "davor" oder "danach" je nach Position)
//   - untere Drittel: danach (gleiche Ebene)
// Zyklus-Schutz: ein Folder kann nicht in sich selbst oder einen seiner
// Nachfahren gezogen werden. Drop auf den leeren Sektions-Bereich legt am
// Ende des Roots ab.
// 4T-0612: Drag-and-Drop bleibt strikt innerhalb des eigenen Abschnitts —
// der Drag traegt seinen Abschnitt (sectionKind), fremde Abschnitte lehnen
// den Drop ab (Cross-Drag ueber die Grenze ist bewusst nicht im Umfang;
// der Wechsel laeuft ueber "umwandeln").

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
  // 4T-0612: kein Drop ueber die Abschnitts-Grenze.
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
  // 4T-0612: kein Drop ueber die Abschnitts-Grenze.
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
  // 4T-0612: Drop im fremden Abschnitt wird abgewiesen (kein Cross-Drag).
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
  // 4T-0612: Abschnitt merken, damit die Bestaetigung im richtigen Baum loescht.
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
// 4T-0612: das Verschieben bleibt innerhalb DESSELBEN Abschnitts (der Picker
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
  // S-11 (4T-0188): initialen Fokus setzen wie bei den uebrigen Modals
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

export function applyBookmarksVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookmarksSection) return;
  // 4T-0075: Im Empty-State sichtbar, wenn mindestens ein Bookmark existiert —
  // damit der Nutzer beim App-Start direkt eine gemerkte Datei anklicken kann.
  // 4T-0330 (PO-Testbefund): der Statusbar-Schalter gilt dabei auch im
  // Empty-State — eine ausgeschaltete Sektion wird nicht mehr erzwungen
  // eingeblendet (der fruehere Override zeigte sie am Schalter vorbei).
  // 4T-0612: "hat Lesezeichen" umfasst beide Abschnitte.
  const allEmpty = isAllEmpty();
  const visible =
    isExtensionActive('bookmarks') &&
    !!state.bookmarks.visibleByPane[paneIdx] &&
    (!allEmpty || hasAnyBookmarks());
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
  // .is-marked = aktive Datei ist als Bookmark gespeichert (in irgendeinem
  // Abschnitt).
  btn.classList.toggle('is-marked', isActiveFileBookmarked());
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
// mindestens ein Bookmark existiert (4T-0075). 4T-0612: beide Abschnitte.

registerSidebarPanel({
  id: 'bookmarks',
  titleKey: 'bookmarks.title',
  buttonId: 'btn-bookmarks',
  sectionClass: 'sidebar-bookmarks',
  getVisible: (paneIdx) => {
    if (!isExtensionActive('bookmarks')) return false;
    // 4T-0330 (PO-Testbefund): Schalter gilt auch im Empty-State (siehe
    // applyBookmarksVisibility).
    return !!state.bookmarks.visibleByPane[paneIdx] && (!isAllEmpty() || hasAnyBookmarks());
  },
  applyVisibility: applyBookmarksVisibility,
  toggle: toggleBookmarksPanel,
});

// 4T-0612 (Epic 3E-0115): Mehr-Fenster-Konsistenz. Schreibt ein anderes Fenster
// desselben Bereichs die bookmarks-Sektion, laedt dieses Fenster den Bereichs-
// Baum neu (Filter auf die eigene Bereichs-Wurzel; der Broadcast geht an alle
// Fenster). Der eigene Schreibvorgang loest den Broadcast ebenfalls aus; das
// Neuladen ist dann idempotent.
if (typeof api.onBookmarksChanged === 'function') {
  api.onBookmarksChanged((payload) => {
    if (!payload || payload.rootPath !== state.areaPath) return;
    void loadAreaBookmarks();
  });
}

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
