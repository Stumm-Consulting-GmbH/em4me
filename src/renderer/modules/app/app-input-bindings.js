// Fensterweite Eingabe-Wege: Ziehen und Ablegen externer Dateien, Klicks
// ausserhalb von Menues, die Escape-Kaskade und der Kommando-Tastendruck;
// dazu die Auffrischung am Puffer-Overlay des Index und das Sichern bei
// Fokusverlust.
//
// Auszug aus app-init.js, 4T-1001 (Epic 3E-0196).
'use strict';

import { t } from '../../i18n.js';
import { api } from './api.js';
import { closeWordCountDialog, refreshEmbedsOfTarget } from '../render-mermaid.js';
import {
  MIME_TAB,
  aboutModal,
  aliasModal,
  contextMenu,
  dropOverlay,
  paneRoots,
  setFocusMode,
  state,
} from './app-state.js';
import { INDEX_OVERLAY_EVENT, paneEditors } from '../editor/editor.js';
import { fuegeAnlagenEin } from '../editor/editor-paste.js';
import { anlagenAusDataTransfer } from '../attachments.js';
import { cancelPanelDrag } from '../panels/sidebar-dnd.js';
import { cancelInlineEdit } from '../bookmarks/bookmarks-edit.js';
import {
  closeBookmarkConfirmRemoveDialog,
  closeBookmarkMoveDialog,
} from '../bookmarks/bookmarks-dialogs.js';
import { handleBookmarkDragEnd } from '../bookmarks/bookmarks-dnd.js';
import { openInPane } from '../tabs/tabs.js';
import { refreshVisibleFrontmatterQueries } from '../query/frontmatter-query-view.js';
import { performAutoSave } from '../views/views.js';
import { cancelAliasDialog, hideAbout } from '../dialogs/dialogs.js';
import { hideContextMenu } from '../dialogs/context-menu-utils.js';
import { refreshVisibleEventsAggregations } from '../events/events-aggregation.js';
import { renderTags } from '../editor/autocomplete-help.js';
import { refreshVisiblePerspectiveScripts } from '../query/perspective-script-view.js';
import {
  closeRegexHelp,
  closeSearchBar,
  getSearchEls,
  isRegexHelpOpen,
  refreshSearchIfVisible,
  search,
} from '../search/search.js';
import { handleCommandKeydown } from './app-commands.js';
import { paneIndexAtPoint } from './app-pane-bindings.js';

/**
 * Registriert die fensterweiten Eingabe-Listener (zweiter Teil der
 * bindUi-Sequenz). Die Reihenfolge der beiden window-keydown-Listener ist
 * bindend: die Escape-Kaskade laeuft vor dem Kommando-Dispatch.
 */
export function bindInputEvents() {
  // File-Drag&Drop für EXTERNE Dateien (nicht für Tab-Drag).
  let dragCounter = 0;
  function isFileDrag(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }
  window.addEventListener('dragenter', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounter += 1;
    if (dragCounter === 1) dropOverlay.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer) return;
    if (Array.from(e.dataTransfer.types).includes(MIME_TAB)) return;
    dragCounter = Math.max(0, dragCounter - 1);
    // 4T-0789: Hervorhebung mit zuruecksetzen, sonst traegt das Overlay sie
    // beim naechsten Ziehen ueber eine Nicht-Ablege-Zone noch.
    if (dragCounter === 0) schliesseDropUeberlagerung();
  });
  // 4T-0789 (Epic 3E-0125): Ablege-Zone der Anlagen. Massgeblich ist der ORT,
  // nicht der Dateityp (Architekturentscheidung des Epics): Die beiden Flaechen
  // des geoeffneten Dokuments nehmen Anlagen entgegen, alles uebrige oeffnet
  // weiter wie bisher. Der Ort ist vor dem Loslassen sichtbar, und eine
  // Markdown-Datei laesst sich so bewusst als Anlage anhaengen.
  //
  // Im leeren Zustand blendet updateEmptyState beide Flaechen aus; closest
  // findet dann nichts, und das Ziehen faellt von selbst auf das Oeffnen
  // zurueck. Der Fall braucht keine Sonderregel.
  //
  // Das Overlay traegt pointer-events: none und verdeckt die Erkennung nicht.
  function ablegeZone(e) {
    const el = e.target instanceof Element ? e.target : null;
    return el ? el.closest('.pane-source, .pane-rendered') : null;
  }
  const dropOverlayInner = dropOverlay ? dropOverlay.querySelector('.drop-overlay-inner') : null;
  window.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    // Rueckmeldung, welches der beiden Ergebnisse eintritt, samt Hervorhebung
    // der Flaeche; ohne sie waere das Ergebnis erst nach dem Loslassen sichtbar.
    const zone = ablegeZone(e);
    if (dropOverlayInner) {
      dropOverlayInner.textContent = t(zone ? 'drop.hintAttachment' : 'drop.hint');
    }
    dropOverlay.classList.toggle('is-attachment', !!zone);
  });

  // 4T-0789 (Epic 3E-0125), zweiter Befund des Product Owners: Das Aufraeumen
  // der Ueberlagerung laeuft in der CAPTURE-Phase und damit unabhaengig davon,
  // ob ein Handler weiter unten die Weitergabe stoppt.
  //
  // Anlass: Der drop-Handler der Editor-Flaeche muss stopPropagation rufen
  // (sonst legt der Fenster-Handler dieselbe Anlage ein zweites Mal ab). Das
  // Ereignis erreichte den Bubble-Handler unten daraufhin nicht mehr, und die
  // Ueberlagerung „Als Anlage ablegen" blieb nach dem Ablegen stehen. Die
  // Capture-Phase laeuft VOR dem Ziel-Element und ist von stopPropagation im
  // Bubble-Weg nicht betroffen.
  //
  // 'dragend' faengt zusaetzlich den Fall ab, dass der Zieh-Vorgang ohne Drop
  // endet (Abbruch mit Esc, Loslassen ausserhalb des Fensters).
  function schliesseDropUeberlagerung() {
    dragCounter = 0;
    dropOverlay.hidden = true;
    dropOverlay.classList.remove('is-attachment');
  }
  window.addEventListener('drop', schliesseDropUeberlagerung, true);
  window.addEventListener('dragend', schliesseDropUeberlagerung, true);

  window.addEventListener('drop', async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    schliesseDropUeberlagerung();

    // 4T-0789: Ablegen in der RENDER-Ansicht. Die Editor-Flaeche behandelt
    // ihren Drop selbst (drop-Handler in editor.js) und stoppt die Weitergabe,
    // weil das eingesetzte Editor-Modul sonst zusaetzlich den Datei-Inhalt als
    // Text einliest; hier kommen deshalb nur noch die uebrigen Flaechen an.
    const zone = ablegeZone(e);
    if (zone) {
      const paneEl = zone.closest('.pane-group');
      const paneIdx = paneEl ? Number(paneEl.dataset.pane) || 0 : state.activePaneIndex;
      const view = paneEditors[paneIdx];
      if (view && !view.state.readOnly) {
        const anlagen = anlagenAusDataTransfer(e.dataTransfer);
        if (anlagen.length > 0) {
          // In der Render-Ansicht gibt es keine Schreibmarke; der Verweis
          // landet am Dokument-Ende.
          await fuegeAnlagenEin(view, anlagen, view.state.doc.length);
          return;
        }
      }
    }

    const files = [];
    for (const f of e.dataTransfer.files) {
      const p = api.getPathForFile(f);
      if (p) files.push(p);
    }
    const targetPane = paneIndexAtPoint(e.clientX);
    if (files.length > 0) await openInPane(targetPane, files);
  });

  // Klicks außerhalb von Menüs schließen sie.
  document.addEventListener('mousedown', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
    // Regex-Hilfe schliessen bei Klick ausserhalb (Hilfe-Button toggelt selbst).
    if (isRegexHelpOpen()) {
      const help = getSearchEls();
      if (!help.helpPopover.contains(e.target) && !help.btnHelp.contains(e.target)) {
        closeRegexHelp();
      }
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Reihenfolge: Regex-Hilfe > Suchleiste > Modale (Hilfe, About) > Menues.
      if (isRegexHelpOpen()) {
        closeRegexHelp();
        return;
      }
      if (search.visible) {
        closeSearchBar();
        return;
      }
      // 4T-0019: Vor dem allgemeinen Hide-Block pruefen, ob etwas Sichtbares
      // mit Vorrang offen ist. Wenn ja, schliesst Esc nur dieses Element und
      // der Fokus-Modus bleibt unangetastet. Sonst verlaesst Esc den Fokus-
      // Modus (sofern aktiv). 4T-0216: das Hilfe-Modal ist aus der Kaskade
      // entfallen (Handbuch-Seiten sind normale Tabs ohne Esc-Semantik);
      // 4T-0279: der Einstellungs-Dialog ebenso (Seite statt Modal, Esc
      // schliesst den Tab bewusst nicht).
      const wordcountModalEl = document.getElementById('wordcount-modal');
      const hasOpenOverlay =
        !contextMenu.hidden ||
        !aboutModal.hidden ||
        !aliasModal.hidden ||
        (wordcountModalEl && !wordcountModalEl.hidden);
      hideContextMenu();
      hideAbout();
      // 4T-0072: Esc schliesst auch den Word-Count-Detail-Dialog.
      closeWordCountDialog();
      // 4T-0078: Esc schliesst die Bookmark-Modals und bricht Inline-Edit ab.
      closeBookmarkConfirmRemoveDialog();
      closeBookmarkMoveDialog();
      if (state.bookmarks && state.bookmarks.editingId) cancelInlineEdit();
      // 4T-0079: Esc bricht laufenden Drag-Vorgang ab (Indikatoren entfernen,
      // State leeren). Die Browser-DnD-API beendet den Drag-Vorgang
      // intern eh, wir raeumen den Visualisierungs-Zustand auf.
      if (state.bookmarks && state.bookmarks.dragging && state.bookmarks.dragging.sourceId) {
        handleBookmarkDragEnd();
      }
      // 4T-0289: Esc raeumt analog einen laufenden Panel-Drag auf.
      cancelPanelDrag();
      // 4T-0050: Esc bricht den Alias-Dialog ab; Resolver liefert null,
      // damit der wartende Klick-Handler sauber zuruecksetzt.
      if (!aliasModal.hidden) cancelAliasDialog();
      if (!hasOpenOverlay && state.focusMode) setFocusMode(false);
    }
    // F1 ist jetzt am Menue-Eintrag "Hilfe" als Accelerator gebunden, kein
    // manueller Handler hier mehr noetig.
  });

  // 4T-0207 (Epic 3E-0015): der zentrale Kommando-Dispatcher als zweiter
  // window-keydown-Listener, bewusst NACH der Escape-Kaskade. Der Handler
  // selbst liegt bei der Kommando-Tabelle (app-commands.js).
  window.addEventListener('keydown', handleCommandKeydown);
}

/**
 * Registriert die Auffrischung am Puffer-Overlay des Index und das
 * Auto-Speichern bei Fokusverlust (letzter Teil der bindUi-Sequenz vor dem
 * Splitter).
 */
export function bindOverlayAndBlurEvents() {
  // 4T-0935 (Befund B-08): Der Puffer-Overlay des Index hat sich geändert
  // (Tippen im Editor, Speichern, Verwerfen, Schließen). Dieselben
  // Auffrisch-Wege wie bei einer Index-Invalidierung, und zwar für genau die
  // Verbraucher, die den Overlay lesen. Wer weiter am Platten-Stand hängt
  // (Graph, Rückverweise, Linter), wird hier bewusst nicht angestoßen.
  //
  // 4T-0950 (Befund E-03): Das Tag-Panel gehört seit seiner Freischaltung
  // dazu. Ohne diesen Anstoß bliebe die Umstellung der Datenquelle wirkungslos,
  // weil das Panel sonst nur beim Reiter-Wechsel neu zeichnet — im Test des
  // Product Owners blieb es leer, obwohl die Quelle bereits richtig war.
  document.addEventListener(INDEX_OVERLAY_EVENT, (ev) => {
    refreshVisibleFrontmatterQueries();
    refreshVisiblePerspectiveScripts();
    refreshVisibleEventsAggregations();
    for (let i = 0; i < state.panes.length; i++) {
      if (state.tags && state.tags.visibleByPane[i]) renderTags(i);
    }
    // 4T-0948 (Befund E-01): Wiki-Einbettungen der gemeldeten Datei erneut
    // aufloesen. Ohne diesen Anstoss bliebe der Kanal-Fix in der Lage
    // wirkungslos, in der Huelle und Quelle nebeneinander stehen: Text und
    // Pfad der Huelle aendern sich beim Tippen in der Quelle nicht, also
    // zeichnet ihre Spalte nicht neu. Die Einbettung der gerade bearbeiteten
    // Spalte ist mit erfasst, weil der Filter am Ziel haengt und nicht an
    // der Spalte.
    // 4T-0949 (Befund E-02): Eine offene Suche laeuft erneut. Die Schicht
    // meldet verzoegert; wer in den 300 ms danach sucht, bekaeme sonst den
    // Stand von vorhin und behielte ihn, weil kein weiterer Lauf folgt. Der
    // Aufruf ist billig, wenn keine Suchleiste offen ist (fruehes return).
    refreshSearchIfVisible();
    const gemeldeterPfad = ev && ev.detail && ev.detail.filePath;
    if (gemeldeterPfad) {
      for (let i = 0; i < state.panes.length; i++) {
        const pane = state.panes[i];
        if (!pane || pane.activeIndex < 0) continue;
        const tab = pane.tabs[pane.activeIndex];
        const wurzel = paneRoots[i];
        if (!tab || !tab.path || !wurzel) continue;
        void refreshEmbedsOfTarget(wurzel, gemeldeterPfad, tab.path);
      }
    }
  });

  // Auto-Save bei Fenster-Fokusverlust (Wechsel in andere App oder Fenster).
  window.addEventListener('blur', () => {
    if (state.autoSave) performAutoSave();
  });
}
