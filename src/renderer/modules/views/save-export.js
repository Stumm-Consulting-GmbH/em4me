// --- Speichern, Zeitstempel-Automatik und portabler Export ------------------
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
// Speichern und Speichern unter samt Konflikt-Behandlung, der Zeitstempel-
// Automatik (created/updated) und dem Export als portables Markdown.
'use strict';

// 4T-0604 (Epic 3E-0113): History-Isolation fuer den Zeitstempel-Dispatch.
import { isolateHistory } from '@codemirror/commands';
import { getLanguage } from '../../i18n.js';

import { api, getDocText } from '../app/api.js';
// 4T-0435 (Epic 3E-0081): Export-Ersetzung des Journal-Navigations-Blocks.
import { replaceJournalNavFencesForExport } from '../calendar/journal-nav-view.js';
// 4T-1066 (Epic 3E-0212): Timeline-Fences werden zur statischen Pipe-Tabelle.
import { replaceJournalTimelineFencesForExport } from '../calendar/journal-timeline-view.js';
import { EDITOR_VIEW_FM_KEYS, getEditorViewDefaults, state, withDialog } from '../app/app-state.js';
// 4T-0572 (Epic 3E-0105): Frontmatter-Lesen der dokument-gebundenen Editor-
// Ansicht-Schalter. Direkter Import aus dem Electron-freien Shared-Modul
// (Muster live-widgets.js), damit die Content-Transformation ohne Preload-
// Bruecke unit-testbar bleibt.
import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
// 4T-0604 (Epic 3E-0113): reiner Kern der Zeitstempel-Automatik.
import { applyTimestampFields } from '../../../shared/markdown/frontmatter-timestamps.js';
import {
  clearIndexOverlayFor,
  paneEditors,
  syncEditorForPane,
  updateWindowTitle,
} from '../editor/editor.js';
// 4T-0585 (Epic 3E-0108): Titelzeile — nach Speichern unter den angezeigten
// Dateinamen nachziehen (Laufzeit-Zyklus ueber title-line.js ist unkritisch).
import { updateTitleLineForPane } from './title-line.js';
import { closeTab, meldeFehlendeTeile } from '../tabs/tabs.js';
// 4T-0332 (Epic 3E-0060): Statusbar-Zustand der Dokument-Historie (Laufzeit-
// Zyklus save-export <-> history-status, Muster 4T-0179).
import { updateHistoryStatus } from './history-status.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

import { invalidatePaneRenderCache, reloadFile } from './pane-render.js';
import { renderTabbar } from './tabbar.js';
// 4T-0989: Laufzeit-Zyklus save-export <-> views (Kern). Der Kern ruft
// stampTabTimestamps im Auto-Save-Pfad, save-export ruft Hinweis, Persistenz
// und die Frontmatter-Transformation; beide Richtungen sind reine
// Funktionsaufrufe zur Laufzeit.
import { buildEditorViewFrontmatterUpdate, persistState, showStatusbarHint } from './views.js';

// --- Speichern --------------------------------------------------------------
// Speichert einen bestimmten Tab. Wenn kein Pfad vorhanden, leitet in
// saveTabAs weiter. Aktualisiert originalContent + dirty + UI bei Erfolg.
// Returnt true bei Erfolg (oder kein Speichern noetig), false bei Fehler/Abbruch.
// --- 4T-0604 (Epic 3E-0113): Zeitstempel-Automatik beim Speichern ------------

// Konfiguration aus dem Laufzeit-Zustand. Liefert null, wenn die Erweiterung
// abgeschaltet ist oder beide Felder aus sind; dann bleibt das Dokument beim
// Speichern unberührt.
function timestampConfigFromState() {
  if (!isExtensionActive('frontmatter-timestamps')) return null;
  const ts = state.frontmatterTimestamps || {};
  if (!ts.createdEnabled && !ts.updatedEnabled) return null;
  return {
    createdEnabled: ts.createdEnabled === true,
    createdField: ts.createdField || 'created',
    updatedEnabled: ts.updatedEnabled === true,
    updatedField: ts.updatedField || 'updated',
    withTime: ts.format !== 'date',
    autoCreate: ts.autoCreate === true,
  };
}

// Schreibt den gestempelten Text in Tab und Ansicht. In der aktiven Ansicht
// wird nur der Frontmatter-Kopf ersetzt (bis endOffset), damit Cursor und
// Scrollposition im Text erhalten bleiben; der Rest des Dokuments ist ohnehin
// unverändert.
function stampFrontmatterInPaneView(paneIdx, tabIdx, nextContent) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.tabs[tabIdx];
  if (!tab) return;
  const view = paneEditors[paneIdx];
  if (pane.activeIndex !== tabIdx || !view) {
    // Nicht sichtbarer Tab: nur den Puffer aktualisieren; der Doc-Aufbau beim
    // Aktivieren (syncEditorForPane) nutzt tab.content.
    tab.content = nextContent;
    return;
  }
  const beforeEnd = extractFrontmatter(getDocText(view.state.doc)).endOffset || 0;
  const afterEnd = extractFrontmatter(nextContent).endOffset || 0;
  view.dispatch({
    changes: { from: 0, to: beforeEnd, insert: nextContent.slice(0, afterEnd) },
    // Eigene Undo-Einheit: ein Strg+Z nimmt den Stempel zurück, ohne die
    // vorherige Nutzer-Eingabe mit aufzurollen.
    annotations: isolateHistory.of('full'),
  });
  tab.content = getDocText(view.state.doc);
}

// Setzt created/updated vor dem Schreiben. Ohne aktive Automatik, ohne
// Datei-Pfad oder wenn nichts zu ändern ist, passiert nichts — das Dokument
// bleibt dann byte-identisch.
export async function stampTabTimestamps(paneIdx, tabIdx, tab) {
  const config = timestampConfigFromState();
  if (!config || !tab || !tab.path) return;
  let birthtimeMs = 0;
  try {
    const times = await api.getFileTimes(tab.path);
    if (times && times.birthtimeMs) birthtimeMs = times.birthtimeMs;
  } catch {
    // Ohne Dateisystem-Zeit fällt created auf den Speicherzeitpunkt zurück.
  }
  const next = applyTimestampFields(tab.content, config, { nowMs: Date.now(), birthtimeMs });
  if (next == null || next === tab.content) return;
  stampFrontmatterInPaneView(paneIdx, tabIdx, next);
}

export async function saveTab(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  if (!pane) return false;
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  // 4T-0213: Handbuch-Tabs sind read-only — Speichern wirkt nicht (und
  // darf nicht in den Save-As-Dialog der pfadlosen Tabs durchfallen).
  // 4T-0277: System-Seiten (Einstellungen) ebenso.
  if (tab.manualPage || tab.systemPage) return false;
  // 4T-1291 (Epic 3E-0224): Der Anwender hat die Teilung dieses Dokuments
  // abgelehnt und «nur lesen» gewählt. Der Reiter bleibt bedienbar, schreibt
  // aber nicht mehr — ungeteilt speichern hieße, die Datei weiter wachsen zu
  // lassen, und genau das war seine Entscheidung nicht.
  if (tab.readOnly) {
    // Zwei Wege führen in den Nur-Lese-Zustand, und sie brauchen verschiedene
    // Hinweise: ein fehlender Teil (4T-1292) verlangt eine Handlung am
    // Dateisystem, die abgelehnte Teilung (4T-1291) nicht.
    if (Array.isArray(tab.fehlendeTeile) && tab.fehlendeTeile.length > 0) {
      meldeFehlendeTeile(tab.fehlendeTeile);
    } else {
      showStatusbarHint('statusbar.splitReadOnly', { duration: 8000 });
    }
    return false;
  }
  if (!tab.path) return saveTabAs(paneIdx, tabIdx);
  try {
    // 4T-0604 (Epic 3E-0113): Zeitstempel-Felder vor dem Schreiben setzen; der
    // gestempelte Text ist damit sowohl der gespeicherte als auch der im Tab
    // gehaltene Stand (originalContent unten zieht ihn als sauber nach).
    await stampTabTimestamps(paneIdx, tabIdx, tab);
    // W-02 (4T-0309): {ok,error}-Vertrag — Schreibfehler ueber den vorhandenen
    // catch (showSaveError) statt frueherer IPC-Exception.
    // 4T-0945 (Story 4S-0786): Der zuletzt gelesene bzw. geschriebene Stand
    // geht als Erwartung mit; weicht die Datei davon ab, schreibt der Main
    // nicht, sondern meldet den Konflikt.
    //
    // Hat der Anwender im Nachlade-Dialog bereits «eigene behalten» gewaehlt,
    // ist die Erwartung der Stand, gegen den er entschieden hat: Dann wird
    // ohne zweite Frage geschrieben und dabei gesichert. Hat sich die Datei
    // seitdem ERNEUT geaendert, greift die Pruefung und fragt wieder.
    const vorentschieden = tab.foreignOverride != null;
    let res = await api.saveFile(tab.path, tab.content, {
      expected: vorentschieden ? tab.foreignOverride : tab.originalContent,
      force: vorentschieden,
    });
    if (res && res.reason === 'conflict') {
      const choice = await withDialog(() => api.confirmConflict({ detail: tab.path }));
      if (choice !== 'keepOurs') {
        // Neu laden: der eigene Puffer weicht dem fremden Stand. Der Dialog
        // ist bereits beantwortet, deshalb ohne zweite Rueckfrage.
        await reloadFile(tab.path, { alreadyConfirmed: true });
        return false;
      }
      // Eigene Fassung behalten: schreiben und die ueberschriebene fremde
      // Fassung in der Historie sichern.
      res = await api.saveFile(tab.path, tab.content, { force: true });
    }
    // 4T-1291 (Epic 3E-0224): Das Dokument müsste geteilt werden, und der
    // Anwender hat in der Ankündigung «nur lesen» gewählt. Geschrieben wurde
    // nichts; der Reiter merkt sich das, damit die Frage nicht bei jedem
    // Tastendruck wiederkommt.
    if (res && res.reason === 'readOnly') {
      tab.readOnly = true;
      showStatusbarHint('statusbar.splitReadOnly', { duration: 8000 });
      return false;
    }
    // 4T-1292 (Epic 3E-0224): Der Haupt-Prozess hat einen fehlenden Teil
    // festgestellt und nicht geschrieben. Das kann auch einen Reiter treffen,
    // der beim Öffnen noch vollständig war — dann ist die Datei seither
    // verschwunden, und der Reiter zieht den Zustand jetzt nach.
    if (res && res.reason === 'partsMissing') {
      tab.readOnly = true;
      tab.fehlendeTeile = res.fehlend || null;
      meldeFehlendeTeile(res.fehlend);
      return false;
    }
    if (!res || !res.ok) throw new Error((res && res.error) || 'save failed');
    // Der geschriebene Stand weicht vom Puffer ab, wenn das Dokument eben zum
    // ersten Mal geteilt wurde: Die Kopf-Datei trägt jetzt die Zuordnungs-Zeile
    // im Frontmatter. Der Puffer zieht nach, sonst meldete das nächste
    // Speichern einen Konflikt gegen den eigenen Schreibvorgang. Der Weg ist
    // derselbe wie bei der Zeitstempel-Automatik, samt eigener Undo-Einheit.
    if (typeof res.content === 'string' && res.content !== tab.content) {
      stampFrontmatterInPaneView(paneIdx, tabIdx, res.content);
    }
    // Das Dokument ist über der Schwelle, hat aber keine Überschrift der
    // obersten zwei Ebenen, an der sich schneiden ließe (AK3, O5). Der Hinweis
    // kommt einmal je Reiter: Ein Dialog bei jedem Speichern wäre binnen Tagen
    // weggeklickt, und geschrieben wurde ja regulär.
    if (res.hinweis === 'kein-schnittpunkt' && !tab.splitHinweisGezeigt) {
      tab.splitHinweisGezeigt = true;
      showStatusbarHint('statusbar.splitNoHeading', { duration: 8000 });
    }
    // Der Hinweis auf die Sicherung gilt fuer beide Wege zur Entscheidung:
    // den Dialog eben und den im Nachlade-Dialog vorentschiedenen Fall. Er
    // haengt am Ergebnis des Schreibens, nicht an der Absicht, damit er nicht
    // erscheint, wenn es gar nichts zu ueberschreiben gab.
    if (res.gesichert) showStatusbarHint('statusbar.saveConflictKept', { duration: 6000 });
    tab.originalContent = tab.content;
    tab.saveConflict = false;
    // 4T-1291: Das Hintergrund-Speichern hatte diesen Reiter ausgesetzt, weil
    // die Teilung eine Frage an den Anwender verlangt. Sie ist jetzt
    // beantwortet und geschrieben; der Reiter läuft wieder mit.
    tab.splitPending = false;
    tab.foreignOverride = null;
    // R4-12 (4T-0180): andere Panes koennten diese Datei als Wiki-Embed
    // zeigen — deren Render-Skip-Cache verwerfen.
    invalidatePaneRenderCache();
    if (tab.dirty) {
      tab.dirty = false;
      renderTabbar(paneIdx);
      if (paneIdx === state.activePaneIndex && tabIdx === pane.activeIndex) {
        updateWindowTitle();
      }
    }
    // 4T-0332 (Epic 3E-0060): erst mit dem Speichern kann eine .mdd
    // entstehen — Statusbar-Zustand der Historie nachziehen.
    void updateHistoryStatus();
    // 4T-0935 (Befund B-08): Mit dem Speichern gilt wieder der Platten-Stand;
    // der Puffer-Overlay des Index wird zurueckgenommen. Der Index selbst
    // zieht ueber den Datei-Beobachter nach.
    void clearIndexOverlayFor(tab.path);
    return true;
  } catch (err) {
    await api.showSaveError(`${tab.path}\n${(err && err.message) || String(err)}`);
    return false;
  }
}

// Speichern unter: OS-Dialog im Main, schreibt, aktualisiert Tab und
// File-Watcher. opts.suggestedName (4T-0586, Epic 3E-0108): nackter
// Dateiname als Dialog-Vorbelegung für pfadlose Tabs — der Main-Handler
// löst ihn im Bereichs-Fall gegen den Bereichs-Root auf, sonst nutzt der
// OS-Dialog seinen Standard-Ordner.
export async function saveTabAs(paneIdx, tabIdx, opts) {
  const pane = state.panes[paneIdx];
  if (!pane) return false;
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  // 4T-0213: Handbuch-Tabs sind read-only — kein Speichern unter.
  // 4T-0277: System-Seiten (Einstellungen) ebenso.
  if (tab.manualPage || tab.systemPage) return false;
  // 4T-0572 (Epic 3E-0105): Uebernahme fluechtiger Editor-Ansicht-Toggles beim
  // ersten Speichern eines Unbenannt-Tabs — Werte, die von der globalen
  // Voreinstellung abweichen, wandern ins Frontmatter der neuen Datei. Bei
  // defektem Frontmatter-YAML im Entwurf entfaellt die Uebernahme still.
  let contentToSave = tab.content;
  let contentTakenOver = false;
  if (!tab.path) {
    const defaults = getEditorViewDefaults();
    const overrides = {};
    for (const [field, fmKey] of Object.entries(EDITOR_VIEW_FM_KEYS)) {
      if (!!tab[field] !== defaults[field]) overrides[fmKey] = !!tab[field];
    }
    if (Object.keys(overrides).length > 0) {
      const updated = buildEditorViewFrontmatterUpdate(contentToSave, overrides);
      if (updated != null && updated !== contentToSave) {
        contentToSave = updated;
        contentTakenOver = true;
      }
    }
  }
  // 4T-0604 (Epic 3E-0113): Zeitstempel-Felder auch beim Speichern unter. Der
  // Zielpfad steht erst nach dem Dialog fest, es gibt hier also keine
  // birthtime; created fällt auf den Speicherzeitpunkt zurück, was für die neu
  // entstehende Datei der richtige Wert ist.
  const timestampConfig = timestampConfigFromState();
  if (timestampConfig) {
    const stamped = applyTimestampFields(contentToSave, timestampConfig, {
      nowMs: Date.now(),
      birthtimeMs: 0,
    });
    if (stamped != null && stamped !== contentToSave) {
      contentToSave = stamped;
      contentTakenOver = true;
    }
  }
  try {
    const result = await api.saveFileAs(
      tab.path || (opts && opts.suggestedName) || null,
      contentToSave,
    );
    // W-03 (4T-0309): {ok, canceled, error}-Vertrag. Abbruch: still false.
    // Schreibfehler: ueber den catch (showSaveError).
    if (!result || !result.ok) {
      if (result && result.error) throw new Error(result.error);
      return false;
    }
    const oldPath = tab.path;
    tab.path = result.path;
    if (contentTakenOver) tab.content = contentToSave;
    tab.originalContent = tab.content;
    tab.dirty = false;
    // R4-12 (4T-0180): wie in saveTab — Embed-Frische anderer Panes.
    invalidatePaneRenderCache();
    if (oldPath && oldPath !== result.path) {
      // M-14 (4T-0170): Nur entwatchen, wenn kein anderer Tab denselben
      // alten Pfad noch offen hat (Check analog closeTab). Der eigene Tab
      // traegt bereits den neuen Pfad und matcht nicht mehr.
      const stillElsewhere = state.panes.some((p) => p.tabs.some((tb) => tb.path === oldPath));
      if (!stillElsewhere) api.unwatchFile(oldPath);
    }
    // Watcher fuer neuen Pfad registrieren (kleiner Round-Trip ueber file:read;
    // der zurueckgegebene Inhalt ist exakt das, was wir gerade geschrieben
    // haben, wir verwerfen ihn).
    try {
      await api.readFile(result.path);
    } catch {
      /* nur Watcher-Registrierung, Lesefehler hier irrelevant */
    }
    renderTabbar(paneIdx);
    // 4T-0585 (Epic 3E-0108): Titelzeile zeigt den neuen Dateinamen (der
    // Tab kann vorher pfadlos gewesen sein — Unbenannt-Platzhalter).
    if (tabIdx === pane.activeIndex) updateTitleLineForPane(paneIdx);
    // 4T-0572: uebernommene Editor-Ansicht-Flags in den Editor spiegeln
    // (nur wenn dieser Tab im Pane aktiv ist; sonst zieht activateTab nach).
    if (contentTakenOver && tabIdx === pane.activeIndex) {
      syncEditorForPane(paneIdx);
    }
    if (paneIdx === state.activePaneIndex && tabIdx === pane.activeIndex) {
      updateWindowTitle();
    }
    persistState();
    // R4-11 (4T-0170): Save-As auf einen bereits offenen Pfad wuerde sonst
    // Duplikat-Tabs hinterlassen (reloadFile/markFileMissing erreichen nur
    // den ersten). Der soeben gespeicherte Tab uebernimmt; andere Tabs mit
    // demselben Pfad werden geschlossen. skipDirtyCheck ist hier bewusst:
    // deren Buffer-Basis ist durch das Ueberschreiben der Datei ueberholt,
    // und die massgebliche Nutzer-Aktion ist der gerade bestaetigte Save-As.
    let dup = null;
    do {
      dup = null;
      for (let p = 0; p < state.panes.length && !dup; p++) {
        const ti = state.panes[p].tabs.findIndex((tb) => tb !== tab && tb.path === result.path);
        if (ti >= 0) dup = { paneIdx: p, tabIdx: ti };
      }
      if (dup) await closeTab(dup.paneIdx, dup.tabIdx, { skipDirtyCheck: true });
    } while (dup);
    return true;
  } catch (err) {
    await api.showSaveError((err && err.message) || String(err));
    return false;
  }
}

export function saveCurrentTab() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return Promise.resolve(false);
  return saveTab(state.activePaneIndex, pane.activeIndex);
}

export function saveCurrentTabAs() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return Promise.resolve(false);
  return saveTabAs(state.activePaneIndex, pane.activeIndex);
}

// 4T-0041 (Epic 3E-0008): Export 'Portables Markdown...'. Konvertiert
// perspective-table-Codebloecke im aktiven Tab durch inline HTML-Tabellen und
// speichert das Ergebnis ueber den OS-Save-As-Dialog. Vorbelegung des
// Dateinamens '<basename>-portable.md'. Der aktive Tab bleibt unveraendert.
export async function exportCurrentTabAsPortable() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return false;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return false;
  try {
    // 4T-0512 (Epic 3E-0092): aktive UI-Sprache fuer die statische
    // Ereignis-Tabelle im Export.
    let portableText = api.convertMarkdownPortable(tab.content, getLanguage());
    // 4T-0435 (Epic 3E-0081): journal-nav-Fences werden im Export durch die
    // statische Perioden-Beschriftung ersetzt (ohne Anlage-Links); außerhalb
    // eines Journal-Eintrags bleibt der Fence unverändert.
    portableText = await replaceJournalNavFencesForExport(portableText, tab.path || '');
    // 4T-1066 (Epic 3E-0212): Timeline-Fences werden zum statischen Gitter
    // als Pipe-Tabelle (ohne Anlage-Links); außerhalb eines Journal-Eintrags
    // bleibt der Fence ebenfalls unverändert.
    portableText = await replaceJournalTimelineFencesForExport(portableText, tab.path || '');
    let suggestedPath = null;
    if (tab.path) {
      // '.md'-Suffix durch '-portable.md' ersetzen, falls vorhanden;
      // sonst '-portable.md' anhaengen.
      if (/\.md$/i.test(tab.path)) {
        suggestedPath = tab.path.replace(/\.md$/i, '-portable.md');
      } else {
        suggestedPath = tab.path + '-portable.md';
      }
    }
    const result = await api.saveFileAs(suggestedPath, portableText);
    // W-03/K-05 (4T-0309): Abbruch meldet jetzt false (nicht faelschlich true);
    // Schreibfehler ueber den catch.
    if (!result || !result.ok) {
      if (result && result.error) throw new Error(result.error);
      return false;
    }
    return true;
  } catch (err) {
    await api.showSaveError((err && err.message) || String(err));
    return false;
  }
}
