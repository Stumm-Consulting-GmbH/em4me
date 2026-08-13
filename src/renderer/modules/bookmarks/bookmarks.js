// Lesezeichen-Panel: Sichtbarkeit, Panel-Registrierung und Sprung-Helfer.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-0991 (Epic 3E-0196): in den Feature-Ordner bookmarks/ geteilt. Hier
// bleiben die Panel-Seite (Sichtbarkeit, Statusbar-Zustand, Registrierung),
// das Nachladen der Baeume ueber die Fenster-Grenze und die beiden
// Bestands-Exporte openOrJumpToPath/placeCursorAtLine, die andere Bereiche
// der Anwendung als Sprung-Helfer nutzen. Datenmodell, Aufbau des Baums,
// Drag-and-Drop, Aktionen, Inline-Edit und Modale liegen in den
// Nachbar-Modulen des Ordners.
'use strict';

import { EditorView } from '@codemirror/view';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
// 4T-0294 (Epic 3E-0052): Lesezeichen sind eine Werkzeug-Erweiterung.
// Abschalten meldet nur die UI ab — der persistierte Bookmark-Baum
// bleibt erhalten und kehrt beim Einschalten zurueck (Daten-Schonung).
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { paneEditors } from '../editor/editor.js';
import { applySidebarVisibility } from '../panels/panels.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Panel-Registry — Bookmarks registriert
// sich am Modul-Ende; Einblenden aktiviert den Gruppen-Reiter.
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import {
  activatePane,
  activateTab,
  findTabAcrossPanes,
  openInPane,
  reportMenuStateNow,
} from '../tabs/tabs.js';
import { scrollRenderedToLine } from '../views/anchor-navigation.js';
import { isAllEmpty, persistSetting, updateEmptyState } from '../views/views.js';
import { toRootRelative } from '../../../shared/bookmark-tree.js';

// Laufzeit-Zyklus innerhalb des Ordners: siehe Kopf von bookmarks-render.js.
import { renderBookmarks } from './bookmarks-render.js';
import {
  clearBookmarkExistsCache,
  hasAnyBookmarks,
  isActiveFileBookmarked,
  persistAreaBookmarksTree,
  persistBookmarksSettings,
  persistBookmarksTree,
} from './bookmarks-tree.js';

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
  clearBookmarkExistsCache();
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
  clearBookmarkExistsCache();
  for (let p = 0; p < state.panes.length; p++) applyBookmarksVisibility(p);
  updateEmptyState();
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

// 4T-0612 (Epic 3E-0115): Reihenfolge-Schalter aus den Einstellungen. Wirkt
// sofort (Panel neu rendern) und persistiert global.
export async function setBookmarksAreaFirst(value) {
  const next = value !== false;
  state.bookmarks.areaFirst = next;
  await persistSetting('bookmarks.areaFirst', next);
  for (let p = 0; p < state.panes.length; p++) renderBookmarks(p);
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
  if (next) clearBookmarkExistsCache();
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('bookmarks', paneIdx);
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
