// 4T-001505 (Zug 3E-000277): Die Wiederherstellung der Spalten aus dem
// Sitzungs-Abbild des Haupt-Prozesses.
//
// **Warum ein eigenes Modul.** Die Start-Sequenz hat beim neunten Rebase-Lauf
// des Zuges ihr Datei-Budget von 500 Code-Zeilen gerissen (502), weil zwei
// Seiten sie im selben Zeitraum verlängert haben, jede für sich innerhalb des
// Budgets. Geschnitten wird deshalb an einer fachlichen Naht, statt den Wächter
// über einen Eintrag in seiner Ausnahmeliste zu lockern. Es ist dieselbe
// Entscheidung, die 4T-001758 für den Datenbank-Anteil der Preload-Brücke
// getroffen hat und die 4T-001759 für diese Datei bereits einmal ausgetragen
// hat, als sie auf eine init-Funktion verzichtete.
//
// **Warum gerade dieser Block.** Er ist die eine geschlossene Fachlichkeit der
// Datei neben dem Start-Ablauf selbst: Aus dem gespeicherten Abbild werden
// Spalten, Reiter und Gruppen. Der Aufruf steht an genau einer Stelle in
// init(), und die Reihenfolge der Start-Sequenz bleibt unberührt. Das Muster
// sind die Auszüge aus 4T-001001 im selben Ordner.
//
// Der Rumpf ist unverändert verschoben; kein Aufrufer außerhalb von
// app-init.js ist berührt.
'use strict';

import { t } from '../../i18n.js';
import { api } from './api.js';
import { MAX_PANES, createEmptyPane, createTab, state } from './app-state.js';
// 4T-000459 (Epic 3E-000085): Gruppen-Anteil der Sitzungs-Wiederherstellung
// (frische IDs, defensive Normalisierung; Alt-Snapshots ohne groups laden
// unveraendert).
import { restoreGroupsIntoPane } from '../tabs/tab-groups.js';
import { showStatusbarHint } from '../views/views.js';

export async function restorePanes(saved) {
  // saved = [{paths, activeIndex, viewMode (legacy)?, tabSettings?}, ...]
  // W-14 (4T-000308): Zahl der nicht lesbaren Tabs sammeln, um am Ende einen
  // Hinweis zu geben (statt still zu verwerfen).
  let missingCount = 0;
  state.panes = [];
  for (let i = 0; i < Math.min(saved.length, MAX_PANES); i++) {
    state.panes.push(createEmptyPane());
  }
  if (state.panes.length === 0) state.panes.push(createEmptyPane());

  for (let i = 0; i < state.panes.length; i++) {
    const entry = saved[i];
    const paths = Array.isArray(entry.paths) ? entry.paths : [];
    const tabSettings = Array.isArray(entry.tabSettings) ? entry.tabSettings : [];
    // Migration: alter Pane-viewMode → für alle Tabs der Pane übernehmen.
    const legacyViewMode = entry.viewMode;
    for (let j = 0; j < paths.length; j++) {
      const p = paths[j];
      try {
        const data = await api.readFile(p);
        // W-01 (4T-000309): {ok,error}-Vertrag — Lesefehler ueber den catch
        // (missing-Tab, W-14) statt frueherer IPC-Exception.
        if (!data || !data.ok) throw new Error((data && data.error) || 'read failed');
        const settings = tabSettings[j] || {};
        if (legacyViewMode && !settings.viewMode) settings.viewMode = legacyViewMode;
        Object.assign(settings, { readOnly: !!data.nurLesen, fehlendeTeile: data.fehlend });
        state.panes[i].tabs.push(createTab(data.path, data.content, settings));
      } catch {
        // W-14 (4T-000308): Tab nicht still verwerfen. Der Fehler trifft nicht
        // nur geloeschte Dateien, sondern auch transiente Faelle (Lock,
        // Berechtigung), bei denen die Datei noch existiert; ein Verwerfen
        // wuerde den Tab beim naechsten persistState() dauerhaft aus der
        // Sitzung entfernen. Stattdessen als missing-Tab aufnehmen (Muster
        // markFileMissing) — beim naechsten Start wird die Datei erneut
        // gelesen, ein transienter Fehler kostet den Tab nicht mehr.
        const settings = tabSettings[j] || {};
        if (legacyViewMode && !settings.viewMode) settings.viewMode = legacyViewMode;
        const tab = createTab(p, '', settings);
        tab.missing = true;
        state.panes[i].tabs.push(tab);
        missingCount++;
      }
    }
    const wantedActive = Number.isInteger(entry.activeIndex) ? entry.activeIndex : 0;
    // R3-13 (4T-000187): den aktiven Tab ueber den PFAD in der bereinigten
    // Liste suchen — geloeschte Dateien verschieben sonst den Index und
    // ein Nachbar-Tab wird aktiv.
    const wantedPath = paths[wantedActive];
    let restoredActive = state.panes[i].tabs.findIndex((tb) => tb.path === wantedPath);
    if (restoredActive < 0) {
      restoredActive = Math.min(wantedActive, state.panes[i].tabs.length - 1);
    }
    state.panes[i].activeIndex =
      state.panes[i].tabs.length === 0 ? -1 : Math.max(0, restoredActive);

    // 4T-000459 (Epic 3E-000085): Tab-Gruppen der Pane wiederherstellen. Jeder
    // Snapshot-Pfad erzeugt oben genau einen Tab (missing eingeschlossen),
    // daher fluchten die tabSettings-Indizes mit den Tab-Indizes. Alte
    // Snapshots ohne groups-Feld laufen unveraendert durch (No-op).
    restoreGroupsIntoPane(
      state.panes[i],
      entry.groups,
      tabSettings.map((s) => (s && Number.isInteger(s.group) ? s.group : -1)),
    );
  }

  // Wenn linke Pane leer und rechte gefüllt: rechte hochziehen.
  if (
    state.panes.length === 2 &&
    state.panes[0].tabs.length === 0 &&
    state.panes[1].tabs.length > 0
  ) {
    state.panes = [state.panes[1]];
  } else if (state.panes.length === 2 && state.panes[1].tabs.length === 0) {
    state.panes.pop();
  }
  state.activePaneIndex = 0;

  // W-14 (4T-000308): sichtbares Feedback, wenn Tabs nicht gelesen werden
  // konnten (statt stillem Verwerfen). Sie bleiben als missing-Tabs erhalten.
  if (missingCount > 0) {
    showStatusbarHint('session.restoreMissing', {
      error: true,
      duration: 4000,
      text: t('session.restoreMissing').replace('{count}', String(missingCount)),
    });
  }
}
