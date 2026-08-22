// --- Ansichts-Kern ----------------------------------------------------------
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul.
// 4T-0989 (Epic 3E-0196): in den Ordner views/ geteilt; hier bleiben der
// Ansichts-Modus samt Editor-Ansicht-Schaltern, das automatische Speichern,
// die Statusbar-Hinweise, der Persist-Helfer der Einstellungen, der
// Empty-State und die Sitzungs-Persistenz der Panes.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import {
  EDITOR_VIEW_FM_KEYS,
  activeTab,
  areaPanelVisiblePref,
  dialogDepth,
  emptyState,
  getPaneEls,
  paneRoots,
  panesContainer,
  state,
  statusbarHint,
} from '../app/app-state.js';
// 4T-0572 (Epic 3E-0105): Frontmatter-Lesen/-Schreiben der dokument-
// gebundenen Editor-Ansicht-Schalter. Direkter Import aus dem Electron-
// freien Shared-Modul (Muster live-widgets.js), damit die Content-
// Transformation ohne Preload-Bruecke unit-testbar bleibt.
import { extractFrontmatter, writeFrontmatter } from '../../../shared/markdown/frontmatter.js';
import { paneEditors, syncEditorForPane, updateWindowTitle } from '../editor/editor.js';
import { reportMenuStateNow, syncToolbarToActiveTab } from '../tabs/tabs.js';
// 4T-0459 (Epic 3E-0085): Gruppen-Anteil des Panes-Snapshots (reiner Helfer).
import { buildGroupsSnapshot } from '../tabs/tab-groups.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-0991 (Epic 3E-0196): bookmarks.js ist in den Feature-Ordner bookmarks/
// geteilt.
import { applyBookmarksVisibility } from '../bookmarks/bookmarks.js';
import { refreshSearchIfVisible } from '../search/search.js';

// 4T-0989: Laufzeit-Zyklen des Ordners. views (Kern) ruft renderTabbar/
// renderPaneContent und die Zeitstempel-Automatik, waehrend pane-render den
// Empty-State und save-export Hinweis, Persistenz und Frontmatter-
// Transformation zurueckruft. Beide Richtungen sind reine Funktionsaufrufe
// zur Laufzeit (Muster der dokumentierten Modularisierungs-Zyklen
// views <-> editor, history-status, templates, title-line).
// 4T-1047 (Epic 3E-0151): Zeichnen und Einpassen kommen aus der Pane-Ebene,
// die Verfuegbarkeits-Regel aus dem zyklusfreien Modus-Modul (Begruendung im
// Kopf von mindmap-modus.js).
import {
  MINDMAP_JUMP_EVENT,
  fitMindmap,
  renderMindmap,
  setzeCursorAufZeile,
} from '../mindmap/mindmap-pane.js';
import { resolveViewModeForTab } from '../mindmap/mindmap-modus.js';
import { renderPaneContent } from './pane-render.js';
import { stampTabTimestamps } from './save-export.js';
import { renderTabbar } from './tabbar.js';
import { applyContentViewClass, isViewMode } from './view-modes.js';

// 4T-0179: Diese beiden Laufzeit-Flags werden ausschliesslich hier
// geschrieben und bleiben deshalb modul-privat; ueber die Modul-Grenze fuehrt
// kein beschreibbarer Export (Entwicklungsrichtlinien).
let autoSaveTimer = null;
let hintTimer = null;

// --- View-Modus + Toggles (alle pro Tab) ------------------------------------
export function setViewMode(mode) {
  // 4T-1047 (Epic 3E-0151): 'mindmap' als fuenfter Modus. Ist die
  // Erweiterung aus, faellt er auf die Lese-Ansicht zurueck, statt eine
  // leere Pane zu zeigen (Story 4S-0804, AK7).
  const gewuenscht = resolveViewModeForTab(mode);
  // 4T-1054: Die Modus-Liste kommt aus view-modes.js, nicht als sechste
  // Kopie hierher.
  if (!isViewMode(gewuenscht)) return;
  const tab = activeTab();
  if (!tab) return;
  mode = gewuenscht;
  // 4T-0277: System-Seiten (Einstellungen) kennen keine View-Modi — das
  // Seiten-DOM ersetzt Editor und Render-Pane vollstaendig.
  if (tab.systemPage) return;
  tab.viewMode = mode;
  // Edit-Modus ist nur in Source/Split/Live sinnvoll. Beim Wechsel auf
  // "Gerendert" wird der Edit-Modus automatisch ausgeschaltet, damit der
  // Statusbar-Toggle konsistent zum sichtbaren View ist. Bei Source,
  // Split und Live (4T-0085) wird Edit-Modus NICHT automatisch
  // eingeschaltet — der User aktiviert ihn explizit via Strg+E oder
  // den Bearbeiten-Button. So bleibt Live konsistent zu Source und
  // Split (alle drei zeigen den Editor read-only, bis User editieren
  // will).
  if (mode === 'rendered' && tab.editMode) {
    tab.editMode = false;
  }
  const els = getPaneEls(state.activePaneIndex);
  applyContentViewClass(els.content, `view-${mode}`);
  // 4T-0351 (Epic 3E-0063): Beim Wechsel in einen Modus mit sichtbarem
  // Render-Pane (Gerendert/Geteilt) das Render-DOM aus dem aktuellen
  // tab.content aufbauen. syncEditorForPane synchronisiert nur den Editor;
  // ausserhalb des Split-Modus laeuft bei Quelltext-Aenderungen kein
  // schedulePreviewUpdate, das Render-Pane bliebe sonst auf dem Stand des
  // letzten Renders stehen (im reinen Quelltext-Modus eingegebene Aenderungen
  // erschienen beim Wechsel in die gerenderte Ansicht nicht). renderPaneContent
  // ruft syncEditorForPane selbst auf und ueberspringt den Voll-Render per
  // Skip-Cache, wenn sich content/Pfad/Sprache/Theme nicht geaendert haben.
  if (mode === 'rendered' || mode === 'split') {
    renderPaneContent(state.activePaneIndex);
  } else if (mode === 'mindmap') {
    // 4T-1047: Die Karte baut auf tab.content auf, nicht auf dem Editor;
    // ein Editor-Abgleich ist hier ohne Wirkung. Nach dem Zeichnen einmal
    // einpassen, damit der Nutzer die ganze Karte sieht.
    renderMindmap(state.activePaneIndex);
    fitMindmap(state.activePaneIndex);
  } else {
    syncEditorForPane(state.activePaneIndex);
  }
  syncToolbarToActiveTab();
  persistState();
  // Modus-Wechsel kann den Such-Scope aendern (Quelltext <-> Vorschau).
  refreshSearchIfVisible();
}

// 4T-1054 (Epic 3E-0151): Sprung aus der Mindmap. Die Karte meldet nur den
// Wunsch; welcher Modus die Stelle zeigt, entscheidet die Ansichts-Ebene.
// Geteilte Ansicht, weil der Nutzer die Quellzeile und das gerenderte
// Dokument nebeneinander sehen soll (PO-Entscheidung vom 2026-08-16). Der
// Cursor wird erst **nach** dem Wechsel gesetzt: Im Mindmap-Modus ist der
// Editor ausgeblendet, und ein Sprung dorthin bliebe unsichtbar.
document.addEventListener(MINDMAP_JUMP_EVENT, (ev) => {
  const detail = ev && ev.detail ? ev.detail : {};
  if (detail.zeile == null) return;
  setViewMode('split');
  setzeCursorAufZeile(
    detail.paneIdx != null ? detail.paneIdx : state.activePaneIndex,
    detail.zeile,
  );
});

// 4T-0572 (Epic 3E-0105): Frontmatter-Update fuer Editor-Ansicht-Schalter als
// reine Content-Transformation. updates ist ein Objekt Frontmatter-Key →
// Boolean. Liefert den neuen Dokument-Text oder null, wenn nicht geschrieben
// werden kann (defektes YAML wird nie ueberschrieben, Muster history-status).
// writeFrontmatter legt bei frontmatter-losen Dokumenten einen Block an und
// erhaelt EOL-Stil, Kommentare und fremde Schluessel.
export function buildEditorViewFrontmatterUpdate(content, updates) {
  const source = typeof content === 'string' ? content : '';
  let fm;
  try {
    fm = extractFrontmatter(source);
  } catch {
    return null;
  }
  if (!fm || fm.parseError) return null;
  const data = { ...(fm.data || {}), ...updates };
  const result = writeFrontmatter(source, data);
  if (!result.ok || typeof result.text !== 'string') return null;
  return result.text;
}

// 4T-0572 (Epic 3E-0105, Weg A): gemeinsamer Kern der drei Editor-Ansicht-
// Toggles. Der neue Wert wird in das Frontmatter des aktiven Dokuments
// geschrieben (dokument-gebunden, portabel); die Datei wird dadurch
// aenderungsbeduerftig und ueber den normalen Speicher-Weg persistiert
// (bewusste PO-Entscheidung, konsistent mit numbered-headings). Fluechtig
// (nur Tab-Zustand, kein Frontmatter-Schreiben) bleiben Handbuch- und
// System-Tabs (read-only), fehlende Dateien sowie Unbenannt-Tabs — deren
// abweichende Werte uebernimmt saveTabAs beim ersten Speichern. Bei
// defektem Frontmatter-YAML wird nicht geschrieben (fluechtiger Toggle
// plus Statusbar-Hinweis).
function toggleEditorViewFlag(field) {
  const tab = activeTab();
  if (!tab) return false;
  const paneIdx = state.activePaneIndex;
  const newValue = !tab[field];
  tab[field] = newValue;
  const writable = !!tab.path && !tab.manualPage && !tab.systemPage && !tab.missing;
  if (writable) {
    const updated = buildEditorViewFrontmatterUpdate(tab.content, {
      [EDITOR_VIEW_FM_KEYS[field]]: newValue,
    });
    if (updated == null) {
      showStatusbarHint('statusbar.viewToggleYamlError', { duration: 2500, error: true });
    } else if (updated !== tab.content) {
      tab.content = updated;
      const wasDirty = tab.dirty;
      tab.dirty = tab.content !== tab.originalContent;
      if (wasDirty !== tab.dirty) {
        renderTabbar(paneIdx);
        updateWindowTitle();
      }
      scheduleAutoSave();
    }
  }
  syncEditorForPane(paneIdx);
  syncToolbarToActiveTab();
  return true;
}

export function toggleWrapLines() {
  if (!toggleEditorViewFlag('wrapLines')) return;
  persistState();
}

export function toggleShowLineNumbers() {
  if (!toggleEditorViewFlag('showLineNumbers')) return;
  persistState();
  refreshSearchIfVisible();
}

// 4T-0013: Gliederung (Heading-Folding-Gutter) pro Tab toggeln. Analog zu
// toggleShowLineNumbers; reconfiguriert das foldGutter-Compartment ueber
// syncEditorForPane und synchronisiert Statusbar-Button und Menue-Haken.
export function toggleShowFoldGutter() {
  if (!toggleEditorViewFlag('showFoldGutter')) return;
  reportMenuStateNow();
  persistState();
}

// --- Auto-Save (opt-in) ----------------------------------------------------
// Aktiviert per Toggle im Datei-Menue. Speichert nach 2 s Inaktivitaet (per
// scheduleAutoSave aus dem EditorView-Update-Listener) und bei Fenster-
// Fokusverlust alle dirtigen Tabs, die einen Pfad haben. Tabs ohne Pfad
// ("Unbenannt") werden nicht automatisch gespeichert.

// W-20/K-05 (4T-0309): Zentraler Persist-Helfer. Ein Store-Schreibfehler
// (api.setSetting kann rejecten) darf nicht still verpuffen — sonst wirkt die
// Aenderung im Speicher weiter und geht beim Neustart kommentarlos verloren.
// Gibt true/false zurueck und zeigt bei Fehler einen Statusbar-Hinweis.
export async function persistSetting(key, value) {
  try {
    await api.setSetting(key, value);
    return true;
  } catch (err) {
    console.warn('setSetting fehlgeschlagen:', key, err);
    showStatusbarHint('statusbar.persistFailed', { duration: 2500, error: true });
    return false;
  }
}

export function showStatusbarHint(messageKey, opts = {}) {
  if (!statusbarHint) return;
  const { error = false, duration = 1000, text } = opts;
  statusbarHint.textContent = text != null ? text : t(messageKey);
  statusbarHint.classList.toggle('error', error);
  statusbarHint.classList.add('visible');
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    statusbarHint.classList.remove('visible');
    hintTimer = null;
  }, duration);
}

export function scheduleAutoSave() {
  if (!state.autoSave) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    performAutoSave();
  }, 2000);
}

export async function performAutoSave() {
  if (!state.autoSave) return;
  if (dialogDepth > 0) return;
  let savedAny = false;
  let failed = false;
  let konflikt = false;
  for (let p = 0; p < state.panes.length; p++) {
    for (let i = 0; i < state.panes[p].tabs.length; i++) {
      const tab = state.panes[p].tabs[i];
      // 4T-0945: Ein erkannter Konflikt setzt diesen Reiter aus, bis der
      // Anwender entscheidet (Speichern von Hand oder Neuladen). Sonst
      // liefe der Hinweis alle zwei Sekunden erneut auf.
      if (!tab.dirty || !tab.path || tab.saveConflict) continue;
      try {
        // 4T-0604 (Epic 3E-0113): Zeitstempel-Felder auch im Autosave-Pfad.
        await stampTabTimestamps(p, i, tab);
        // W-02 (4T-0309): {ok,error}-Vertrag — Fehler ueber den catch.
        // 4T-0945 (Story 4S-0786): auch im Hintergrund wird der Stand geprueft.
        // Eine im Nachlade-Dialog getroffene Entscheidung gilt hier ebenso:
        // Sie ist gefallen, das Hintergrund-Speichern setzt sie um und sichert
        // die ueberschriebene Fassung, statt den Reiter auszusetzen.
        const vorentschieden = tab.foreignOverride != null;
        const res = await api.saveFile(tab.path, tab.content, {
          expected: vorentschieden ? tab.foreignOverride : tab.originalContent,
          force: vorentschieden,
        });
        if (res && res.reason === 'conflict') {
          // Bewusst ohne Dialog: Ein Fenster, das ungefragt aufspringt,
          // waehrend man in einer anderen Datei tippt, waere ein Uebergriff.
          // Der Schaden ist bereits verhindert, sobald nicht geschrieben wird;
          // der Reiter bleibt geaendert und nichts geht verloren.
          tab.saveConflict = true;
          konflikt = true;
          continue;
        }
        if (!res || !res.ok) throw new Error((res && res.error) || 'save failed');
        tab.originalContent = tab.content;
        tab.dirty = false;
        tab.foreignOverride = null;
        renderTabbar(p);
        savedAny = true;
      } catch (err) {
        console.error('Auto-Save fehlgeschlagen:', tab.path, err);
        failed = true;
      }
    }
  }
  if (savedAny) updateWindowTitle();
  if (konflikt) {
    // Der Konflikt-Hinweis geht den beiden anderen vor: Er ist der einzige,
    // der eine Handlung verlangt, und er steht laenger.
    showStatusbarHint('statusbar.saveConflict', { error: true, duration: 6000 });
  } else if (failed) {
    showStatusbarHint('statusbar.saveFailed', { error: true, duration: 3000 });
  } else if (savedAny) {
    showStatusbarHint('statusbar.saved', { duration: 1000 });
  }
}

// Klick auf den Stift-Toggle in der Statusbar bzw. Strg+E. Im Render-Modus
// wechselt der Klick zuerst nach „Geteilt", weil Bearbeiten dort sichtbar
// werden muss; danach (oder im Source/Split-Modus) wird der Edit-Modus
// umgeschaltet. Nach Aktivierung bekommt der Editor den Tastatur-Fokus.
export function toggleEditMode() {
  const tab = activeTab();
  if (!tab) return;
  // 4T-0213: Handbuch-Tabs sind dauerhaft read-only — der Toggle bleibt
  // wirkungslos (Statusbar-Stift ist zusaetzlich deaktiviert, Strg+E und
  // Menue-Pfad laufen ebenfalls hier durch). 4T-0277: System-Seiten ebenso.
  if (tab.manualPage || tab.systemPage) return;
  if (tab.viewMode === 'rendered') {
    tab.viewMode = 'split';
    const els = getPaneEls(state.activePaneIndex);
    applyContentViewClass(els.content, 'view-split');
    tab.editMode = true;
  } else {
    tab.editMode = !tab.editMode;
  }
  syncEditorForPane(state.activePaneIndex);
  syncToolbarToActiveTab();
  persistState();
  refreshSearchIfVisible();
  if (tab.editMode) {
    const view = paneEditors[state.activePaneIndex];
    if (view) view.focus();
  }
}

// --- Empty-State ------------------------------------------------------------
// 4T-0075 (Epic 3E-0013): isAllEmpty als zentrale Helper-Funktion. Wird nicht
// nur vom Empty-State selbst, sondern auch von den Sidebar-Sichtbarkeits-
// Funktionen genutzt, um im Empty-State alle Sektionen ausser Bookmarks
// zwangsweise auszublenden (sie ergeben ohne Tab eh keinen Sinn).
export function isAllEmpty() {
  return state.panes.length === 1 && state.panes[0].tabs.length === 0;
}

export function updateEmptyState() {
  const allEmpty = isAllEmpty();
  if (allEmpty) {
    emptyState.classList.remove('hidden');
    // 4T-0075: Wenn die Lesezeichen-Sektion etwas zu zeigen hat, bleibt der
    // Pane-Container sichtbar, damit die Sidebar sie anzeigen kann. Der
    // Empty-State-Block (mit Oeffnen-Button) liegt als pointer-events-loses
    // Overlay ueber dem Pane-Container und laesst Klicks auf die Sidebar
    // durch. Tabbar, Source-Pane, Render-Pane und der innere Splitter werden
    // ueber die Klasse .is-empty-with-bookmarks per CSS ausgeblendet, damit
    // nur Sidebar und Statusbar uebrig bleiben.
    // 4T-0327 (Epic 3E-0059): gleiche Mechanik fuer die leere Bereichs-App —
    // das Bereichs-Panel ist dort der Einstieg (erste Datei waehlen).
    // 4T-0330 (PO-Testbefund): beides haengt an den Panel-SCHALTERN, nicht
    // mehr an der blossen Existenz — ausgeschaltete Panels blenden die
    // Sidebar im Empty-State aus.
    const hasBookmarks =
      state.bookmarks && Array.isArray(state.bookmarks.tree) && state.bookmarks.tree.length > 0;
    const bookmarksWanted =
      hasBookmarks && !!(state.bookmarks.visibleByPane[0] || state.bookmarks.visibleByPane[1]);
    const areaWanted = !!state.areaPath && (areaPanelVisiblePref(0) || areaPanelVisiblePref(1));
    // 4T-0527 (PO-Testbefund 2026-07-11): das Erinnerungs-Panel ist bereichs-
    // weit und soll im geoeffneten Bereich auch ohne offene Datei sichtbar
    // bleiben (Muster Bereichs-Panel). Nur bei aktiver Erweiterung.
    const remindersWanted =
      !!state.areaPath &&
      isExtensionActive('reminders') &&
      isExtensionActive('tasks') &&
      !!(state.reminders && (state.reminders.visibleByPane[0] || state.reminders.visibleByPane[1]));
    // 4T-0372 (Epic 3E-0069): die Uhr zeigt nichts Dokument- oder Bereichs-
    // Gebundenes und bleibt deshalb auch ohne offene Datei und ohne Bereich
    // sichtbar, sofern der Nutzer sie eingeschaltet hat.
    const clockWanted =
      isExtensionActive('clock') &&
      !!(state.clock && (state.clock.visibleByPane[0] || state.clock.visibleByPane[1]));
    if (bookmarksWanted || areaWanted || remindersWanted || clockWanted) {
      panesContainer.style.visibility = '';
      paneRoots[0].classList.add('is-empty-with-bookmarks');
      if (paneRoots[1]) paneRoots[1].classList.add('is-empty-with-bookmarks');
      applyBookmarksVisibility(0);
    } else {
      panesContainer.style.visibility = 'hidden';
      paneRoots[0].classList.remove('is-empty-with-bookmarks');
      if (paneRoots[1]) paneRoots[1].classList.remove('is-empty-with-bookmarks');
    }
  } else {
    emptyState.classList.add('hidden');
    panesContainer.style.visibility = '';
    paneRoots[0].classList.remove('is-empty-with-bookmarks');
    if (paneRoots[1]) paneRoots[1].classList.remove('is-empty-with-bookmarks');
  }
}

// --- Persistenz -------------------------------------------------------------
// Schickt den aktuellen Pane-Stand an den Main-Prozess. Main fuehrt die
// Multi-Window-Persistenz pro Fenster zusammen und schreibt sie in die Settings.
// 4T-0572 (Epic 3E-0105): die fruehere Per-Datei-Persistenz der drei Editor-
// Ansicht-Schalter (Store-Key 'app.fileSettings', R4-13) ist ersatzlos
// abgeloest — die Werte leben dokument-gebunden im Frontmatter.
export function persistState() {
  const snapshot = buildPanesSnapshot();
  api.reportPanes(snapshot);
}

export function buildPanesSnapshot() {
  // Unbenannt-Tabs (ohne Pfad) gehen NICHT in die persistierte Sitzung.
  // Dirty-Unbenannt werden vorher vom Schliessen-Dialog abgefangen
  // (Speichern → Pfad bekommen oder Verwerfen). Hier herausfiltern und
  // activeIndex auf die verbleibenden Tabs umrechnen.
  return state.panes.map((p) => {
    const indices = [];
    p.tabs.forEach((tab, i) => {
      if (tab.path) indices.push(i);
    });
    let activeIndex = -1;
    if (indices.length > 0) {
      const pos = indices.indexOf(p.activeIndex);
      activeIndex = pos >= 0 ? pos : 0;
    }
    // 4T-0459 (Epic 3E-0085): Gruppen additiv persistieren — auf den
    // GEFILTERTEN Indizes ausgedrueckt (Gruppen, deren Mitglieder alle
    // pfadlos sind, entfallen). Gruppen-freie Sitzungen erzeugen exakt
    // das bisherige Schema (kein groups-Feld, kein group-Eintrag).
    const { groups, groupOf } = buildGroupsSnapshot(p, indices);
    return {
      paths: indices.map((i) => p.tabs[i].path),
      activeIndex,
      tabSettings: indices.map((i, j) => ({
        viewMode: p.tabs[i].viewMode,
        wrapLines: p.tabs[i].wrapLines,
        showLineNumbers: p.tabs[i].showLineNumbers,
        showFoldGutter: p.tabs[i].showFoldGutter,
        // 4T-0070: Scroll-Synchronisation pro Tab in der Session erhalten.
        scrollSyncEnabled: !!p.tabs[i].scrollSyncEnabled,
        ...(groupOf[j] >= 0 ? { group: groupOf[j] } : {}),
      })),
      ...(groups.length > 0 ? { groups } : {}),
    };
  });
}
