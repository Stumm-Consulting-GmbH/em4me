// --- Speichern, Zeitstempel-Automatik und portabler Export ------------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
// Speichern und Speichern unter samt Konflikt-Behandlung, der Zeitstempel-
// Automatik (created/updated) und dem Export als portables Markdown.
'use strict';

// 4T-000604 (Epic 3E-000113): History-Isolation fuer den Zeitstempel-Dispatch.
import { isolateHistory } from '@codemirror/commands';
// 4T-001594 (Epic 3E-000129): currentDictionary reicht den Katalog einer
// eigenen Sprache an den dritten Leser weiter (siehe unten am Aufruf).
import { currentDictionary, getLanguage, t } from '../../i18n.js';
import { isCustomLocale } from '../../../shared/locales.js';

import { api, getDocText } from '../app/api.js';
// 4T-000435 (Epic 3E-000081): Export-Ersetzung des Journal-Navigations-Blocks.
import { replaceJournalNavFencesForExport } from '../calendar/journal-nav-view.js';
// 4T-001066 (Epic 3E-000212): Timeline-Fences werden zur statischen Pipe-Tabelle.
import { replaceJournalTimelineFencesForExport } from '../calendar/journal-timeline-view.js';
// 4T-001471 (Epic 3E-000178): dritte Fence-Ersetzung des portablen Exports.
// Der Fence-Kern ist electron-frei und ohne DOM geprueft; das Zeichnen liegt
// bei den uebrigen Mermaid-Render-Wegen.
import {
  collectMermaidSources,
  hasMermaidFence,
  mermaidSvgBlock,
  replaceMermaidFences,
} from '../../../shared/mermaid-fence.js';
import { renderMermaidSvgsForExport } from '../render-mermaid.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { EDITOR_VIEW_FM_KEYS, getEditorViewDefaults, state, withDialog } from '../app/app-state.js';
// 4T-000572 (Epic 3E-000105): Frontmatter-Lesen der dokument-gebundenen Editor-
// Ansicht-Schalter. Direkter Import aus dem Electron-freien Shared-Modul
// (Muster live-widgets.js), damit die Content-Transformation ohne Preload-
// Bruecke unit-testbar bleibt.
import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
// 4T-000604 (Epic 3E-000113): reiner Kern der Zeitstempel-Automatik.
import { applyTimestampFields } from '../../../shared/markdown/frontmatter-timestamps.js';
import {
  clearIndexOverlayFor,
  paneEditors,
  syncEditorForPane,
  updateWindowTitle,
} from '../editor/editor.js';
// 4T-000585 (Epic 3E-000108): Titelzeile — nach Speichern unter den angezeigten
// Dateinamen nachziehen (Laufzeit-Zyklus ueber title-line.js ist unkritisch).
import { updateTitleLineForPane } from './title-line.js';
import { closeTab, meldeFehlendeTeile } from '../tabs/tabs.js';
// 4T-000332 (Epic 3E-000060): Statusbar-Zustand der Dokument-Historie (Laufzeit-
// Zyklus save-export <-> history-status, Muster 4T-000179).
import { updateHistoryStatus } from './history-status.js';

import { invalidatePaneRenderCache, reloadFile } from './pane-render.js';
import { renderTabbar } from './tabbar.js';
// 4T-000989: Laufzeit-Zyklus save-export <-> views (Kern). Der Kern ruft
// stampTabTimestamps im Auto-Save-Pfad, save-export ruft Hinweis, Persistenz
// und die Frontmatter-Transformation; beide Richtungen sind reine
// Funktionsaufrufe zur Laufzeit.
import { buildEditorViewFrontmatterUpdate, persistState, showStatusbarHint } from './views.js';

// --- Speichern --------------------------------------------------------------
// Speichert einen bestimmten Tab. Wenn kein Pfad vorhanden, leitet in
// saveTabAs weiter. Aktualisiert originalContent + dirty + UI bei Erfolg.
// Returnt true bei Erfolg (oder kein Speichern noetig), false bei Fehler/Abbruch.
// --- 4T-000604 (Epic 3E-000113): Zeitstempel-Automatik beim Speichern ------------

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
  // 4T-000213: Handbuch-Tabs sind read-only — Speichern wirkt nicht (und
  // darf nicht in den Save-As-Dialog der pfadlosen Tabs durchfallen).
  // 4T-000277: System-Seiten (Einstellungen) ebenso.
  if (tab.manualPage || tab.systemPage) return false;
  // 4T-001291 (Epic 3E-000224): Der Anwender hat die Teilung dieses Dokuments
  // abgelehnt und «nur lesen» gewählt. Der Reiter bleibt bedienbar, schreibt
  // aber nicht mehr — ungeteilt speichern hieße, die Datei weiter wachsen zu
  // lassen, und genau das war seine Entscheidung nicht.
  if (tab.readOnly) {
    // Zwei Wege führen in den Nur-Lese-Zustand, und sie brauchen verschiedene
    // Hinweise: ein fehlender Teil (4T-001292) verlangt eine Handlung am
    // Dateisystem, die abgelehnte Teilung (4T-001291) nicht.
    if (Array.isArray(tab.fehlendeTeile) && tab.fehlendeTeile.length > 0) {
      meldeFehlendeTeile(tab.fehlendeTeile);
    } else {
      showStatusbarHint('statusbar.splitReadOnly', { duration: 8000 });
    }
    return false;
  }
  if (!tab.path) return saveTabAs(paneIdx, tabIdx);
  try {
    // 4T-000604 (Epic 3E-000113): Zeitstempel-Felder vor dem Schreiben setzen; der
    // gestempelte Text ist damit sowohl der gespeicherte als auch der im Tab
    // gehaltene Stand (originalContent unten zieht ihn als sauber nach).
    await stampTabTimestamps(paneIdx, tabIdx, tab);
    // W-02 (4T-000309): {ok,error}-Vertrag — Schreibfehler ueber den vorhandenen
    // catch (showSaveError) statt frueherer IPC-Exception.
    // 4T-000945 (Story 4S-000786): Der zuletzt gelesene bzw. geschriebene Stand
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
    // 4T-001291 (Epic 3E-000224): Das Dokument müsste geteilt werden, und der
    // Anwender hat in der Ankündigung «nur lesen» gewählt. Geschrieben wurde
    // nichts; der Reiter merkt sich das, damit die Frage nicht bei jedem
    // Tastendruck wiederkommt.
    if (res && res.reason === 'readOnly') {
      tab.readOnly = true;
      showStatusbarHint('statusbar.splitReadOnly', { duration: 8000 });
      return false;
    }
    // 4T-001292 (Epic 3E-000224): Der Haupt-Prozess hat einen fehlenden Teil
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
    // 4T-001291: Das Hintergrund-Speichern hatte diesen Reiter ausgesetzt, weil
    // die Teilung eine Frage an den Anwender verlangt. Sie ist jetzt
    // beantwortet und geschrieben; der Reiter läuft wieder mit.
    tab.splitPending = false;
    tab.foreignOverride = null;
    // R4-12 (4T-000180): andere Panes koennten diese Datei als Wiki-Embed
    // zeigen — deren Render-Skip-Cache verwerfen.
    invalidatePaneRenderCache();
    if (tab.dirty) {
      tab.dirty = false;
      renderTabbar(paneIdx);
      if (paneIdx === state.activePaneIndex && tabIdx === pane.activeIndex) {
        updateWindowTitle();
      }
    }
    // 4T-000332 (Epic 3E-000060): erst mit dem Speichern kann eine .mdd
    // entstehen — Statusbar-Zustand der Historie nachziehen.
    void updateHistoryStatus();
    // 4T-000935 (Befund B-08): Mit dem Speichern gilt wieder der Platten-Stand;
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
// File-Watcher. opts.suggestedName (4T-000586, Epic 3E-000108): nackter
// Dateiname als Dialog-Vorbelegung für pfadlose Tabs — der Main-Handler
// löst ihn im Bereichs-Fall gegen den Bereichs-Root auf, sonst nutzt der
// OS-Dialog seinen Standard-Ordner.
export async function saveTabAs(paneIdx, tabIdx, opts) {
  const pane = state.panes[paneIdx];
  if (!pane) return false;
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  // 4T-000213: Handbuch-Tabs sind read-only — kein Speichern unter.
  // 4T-000277: System-Seiten (Einstellungen) ebenso.
  if (tab.manualPage || tab.systemPage) return false;
  // 4T-000572 (Epic 3E-000105): Uebernahme fluechtiger Editor-Ansicht-Toggles beim
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
  // 4T-000604 (Epic 3E-000113): Zeitstempel-Felder auch beim Speichern unter. Der
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
    // W-03 (4T-000309): {ok, canceled, error}-Vertrag. Abbruch: still false.
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
    // R4-12 (4T-000180): wie in saveTab — Embed-Frische anderer Panes.
    invalidatePaneRenderCache();
    if (oldPath && oldPath !== result.path) {
      // M-14 (4T-000170): Nur entwatchen, wenn kein anderer Tab denselben
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
    // 4T-000585 (Epic 3E-000108): Titelzeile zeigt den neuen Dateinamen (der
    // Tab kann vorher pfadlos gewesen sein — Unbenannt-Platzhalter).
    if (tabIdx === pane.activeIndex) updateTitleLineForPane(paneIdx);
    // 4T-000572: uebernommene Editor-Ansicht-Flags in den Editor spiegeln
    // (nur wenn dieser Tab im Pane aktiv ist; sonst zieht activateTab nach).
    if (contentTakenOver && tabIdx === pane.activeIndex) {
      syncEditorForPane(paneIdx);
    }
    if (paneIdx === state.activePaneIndex && tabIdx === pane.activeIndex) {
      updateWindowTitle();
    }
    persistState();
    // R4-11 (4T-000170): Save-As auf einen bereits offenen Pfad wuerde sonst
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

// 4T-000041 (Epic 3E-000008): Export 'Portables Markdown...'. Konvertiert
// perspective-table-Codebloecke im aktiven Tab durch inline HTML-Tabellen und
// speichert das Ergebnis ueber den OS-Save-As-Dialog. Vorbelegung des
// Dateinamens '<basename>-portable.md'. Der aktive Tab bleibt unveraendert.

// 4T-001471 (Epic 3E-000178): Mermaid-Fences durch ihr eingebranntes Bild
// ersetzen. Unveraendert bleibt der Fence in drei Faellen: die Erweiterung ist
// ausgeschaltet (Gleichlauf zur gerenderten Ansicht, die den Block dann als
// Code laesst), der Text traegt kein Diagramm, oder das Bild erkennt sich als
// Fehler (Epic-Entscheidung E4).
async function replaceMermaidFencesForExport(text) {
  const source = String(text == null ? '' : text);
  if (!isExtensionActive('mermaid')) return source;
  if (!hasMermaidFence(source)) return source;
  const bilder = await renderMermaidSvgsForExport(collectMermaidSources(source));
  if (bilder.size === 0) return source;
  // Die Ersetzung laeuft ueber eine Callback-Funktion, nie ueber einen
  // Ersetzungs-TEXT, in dem Dollar-Folgen des SVG Sonderzeichen waeren
  // (Fehlerklasse L7, Beleg 4T-001423).
  return replaceMermaidFences(source, (body) => {
    const svgHtml = bilder.get(body);
    return svgHtml ? mermaidSvgBlock(svgHtml, t('export.mermaidAlt')) : null;
  });
}
export async function exportCurrentTabAsPortable() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) return false;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return false;
  try {
    // 4T-000512 (Epic 3E-000092): aktive UI-Sprache fuer die statische
    // Ereignis-Tabelle im Export.
    // 4T-001594 (Epic 3E-000129): Bei einer eingespielten eigenen Sprache kommt
    // der Katalog mit. Der dritte Leser sitzt in src/shared und kennt das
    // Benutzerprofil nicht — er kann eine Datei ausserhalb des Buendels nicht
    // selbst lesen und bekommt die Beschriftungen deshalb vom Aufrufer.
    // Fehlt die Datei, steht getLanguage() bereits auf der Rueckfall-Sprache,
    // und der mitgelieferte Weg greift ohne Sonderfall.
    let portableText = api.convertMarkdownPortable(
      tab.content,
      getLanguage(),
      isCustomLocale(getLanguage()) ? currentDictionary() : undefined,
    );
    // 4T-000435 (Epic 3E-000081): journal-nav-Fences werden im Export durch die
    // statische Perioden-Beschriftung ersetzt (ohne Anlage-Links); außerhalb
    // eines Journal-Eintrags bleibt der Fence unverändert.
    portableText = await replaceJournalNavFencesForExport(portableText, tab.path || '');
    // 4T-001066 (Epic 3E-000212): Timeline-Fences werden zum statischen Gitter
    // als Pipe-Tabelle (ohne Anlage-Links); außerhalb eines Journal-Eintrags
    // bleibt der Fence ebenfalls unverändert.
    portableText = await replaceJournalTimelineFencesForExport(portableText, tab.path || '');
    // 4T-001471 (Epic 3E-000178): Mermaid-Fences werden als inline SVG
    // eingebrannt, im Hell-Theme und unabhaengig vom Ansichts-Modus des Tabs;
    // ein fehlerhaftes Diagramm und der Aus-Zustand der Erweiterung lassen den
    // Fence stehen. Zuletzt in der Kette, weil die beiden Journal-Ersetzungen
    // keine Diagramme erzeugen und die Reihenfolge damit frei ist.
    portableText = await replaceMermaidFencesForExport(portableText);
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
    // W-03/K-05 (4T-000309): Abbruch meldet jetzt false (nicht faelschlich true);
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

// --- Ausgabe der Canvas-Fläche als JSON-Canvas-Datei (4T-001805) ----------------
//
// Derselbe Ablauf wie beim portablen Export darüber — Inhalt holen, umwandeln,
// Ziel vorschlagen, über die Preload-Brücke speichern —, um zwei Schritte
// erweitert: die Auflösung der Verweis-Ziele zu Pfaden, die das fremde Format
// verlangt, und die Ergebnis-Meldung mit dem Verlust-Bericht.
//
// **Die Übersetzung steht nicht hier**, sondern im prozessneutralen Kern
// `canvas-austausch.js`; dieses Modul besorgt das, was der Kern bewusst nicht
// kann — Bereich, Dateisystem und Sprache (Architektur-Entscheidungen des Epics
// 3E-000292 vom 2026-09-19).
//
// Die beiden Canvas-Module kommen über **Laufzeit-Importe**, wie sie der
// Canvas-Ordner in der Gegenrichtung schon benutzt: Ein statischer Bezug zöge
// die beiden Ordner in eine Kopplung, die der Ordner-Import-Wächter als Ratsche
// eingefroren hat.

// Die Ziel-Angaben einer Fläche als Abbildung «geschriebenes Ziel → Pfad», vom
// Hauptprozess aufgelöst. Ein Ziel, das er nicht findet, fehlt in der Abbildung;
// der Kern zählt es dann als Posten und schreibt es, wie es auf der Karte steht.
async function zielAbbildungFuer(flaeche, dokumentPfad, zerlegeZiel) {
  const ziele = new Map();
  if (!dokumentPfad) return ziele;
  const anfragen = [];
  const anker = new Map();
  for (const el of flaeche.model.elemente) {
    if (!el || el.art !== 'karte') continue;
    const istBild = el.doc == null && el.bild != null;
    const roh = el.doc != null ? el.doc : el.bild;
    if (roh == null || String(roh) === '') continue;
    const geschrieben = String(roh);
    if (anker.has(geschrieben)) continue;
    // Das Bild-Ziel trägt keinen Anker; die Zerlegung gilt dem Dokument-Verweis
    // und liefert für ein Bild denselben Pfad zurück.
    const zerlegt = istBild ? { pfad: geschrieben, anker: '' } : zerlegeZiel(geschrieben);
    anker.set(geschrieben, zerlegt.anker || '');
    anfragen.push({ pfad: zerlegt.pfad, art: istBild ? 'bild' : 'doc', geschrieben });
  }
  if (anfragen.length === 0) return ziele;
  let antwort;
  try {
    antwort = await api.resolveCanvasExchangeTargets(
      dokumentPfad,
      anfragen.map((a) => ({ pfad: a.pfad, art: a.art })),
    );
  } catch {
    antwort = null;
  }
  if (!antwort || !antwort.ok || !Array.isArray(antwort.treffer)) return ziele;
  const gefunden = new Map(antwort.treffer.map((tr) => [String(tr.pfad), String(tr.datei)]));
  for (const anfrage of anfragen) {
    const datei = gefunden.get(anfrage.pfad);
    if (!datei) continue;
    const eintrag = { file: datei };
    const ank = anker.get(anfrage.geschrieben);
    // Der Anker wandert in das eigene Feld des fremden Formats; ein `#` im
    // Dateipfad hätte dort keine Aussage.
    if (ank) eintrag.subpath = `#${ank}`;
    ziele.set(anfrage.geschrieben, eintrag);
  }
  return ziele;
}

// Der Vorschlag für den Speichern-Dialog: der Name des Dokuments mit der
// Endung '.canvas', in seinem Ordner. Ohne Pfad entscheidet der Dialog.
function canvasZielVorschlag(dokumentPfad) {
  if (!dokumentPfad) return null;
  const ohneEndung = String(dokumentPfad).replace(/\.[^./\\]+$/, '');
  return `${ohneEndung}.canvas`;
}

/**
 * Gibt die Fläche, deren Reiter in der Canvas-Ansicht gewählt ist, als Datei im
 * offenen Format JSON Canvas aus (Story 4S-000959).
 *
 * @returns {Promise<boolean>} true, wenn eine Datei geschrieben wurde.
 */
export async function exportCurrentCanvasAsJsonCanvas() {
  const [pane, verweis, kern] = await Promise.all([
    import('../canvas/canvas-pane.js'),
    import('../canvas/canvas-verweis-anzeige.js'),
    import('../../../shared/canvas/canvas-austausch.js'),
  ]);
  const gewaehlt = pane.aktiveCanvasFlaeche(state.activePaneIndex);
  // Reißleine hinter der Verfügbarkeits-Bedingung `canvasFlaecheOffen`: Ohne
  // offene Canvas-Ansicht gibt es keine gewählte Fläche, und ein stiller
  // Fehlschlag wäre für den Anwender von einem Fehler nicht zu unterscheiden
  // (Guard-Muster der Flächen-Kommandos).
  if (!gewaehlt) {
    showStatusbarHint('canvas.austausch.keineFlaeche', { duration: 2500, error: true });
    return false;
  }
  try {
    const ziele = await zielAbbildungFuer(
      gewaehlt.flaeche,
      gewaehlt.dokumentPfad,
      verweis.zerlegeZiel,
    );
    const { canvas, verluste } = kern.flaecheNachJsonCanvas(gewaehlt.flaeche.model, { ziele });
    const result = await api.saveFileAs(
      canvasZielVorschlag(gewaehlt.dokumentPfad),
      kern.serialisiereJsonCanvas(canvas),
      'jsonCanvas',
    );
    // Abbruch im Speichern-Dialog ist kein Fehler: keine Datei, keine Meldung.
    if (!result || !result.ok) {
      if (result && result.error) throw new Error(result.error);
      return false;
    }
    await api.showCanvasExchangeReport({
      richtung: 'export',
      zahlen: {
        karten: canvas.nodes.filter((k) => k.type === 'text' || k.type === 'file').length,
        gruppen: canvas.nodes.filter((k) => k.type === 'group').length,
        verbindungen: canvas.edges.length,
      },
      uebrigeFlaechen: gewaehlt.uebrige,
      verluste,
    });
    return true;
  } catch (err) {
    await api.showSaveError((err && err.message) || String(err));
    return false;
  }
}
