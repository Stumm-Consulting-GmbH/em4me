// CodeMirror-Aufbau pro Pane: Compartments, Rechtschreib-Schalter, die beiden
// Editor-Zustaende, Index-Overlay, Heading-Folding-API und Fenstertitel.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-1002 (Epic 3E-0196): Linter, Tastenbelegungen, Einfuege-Handler und
// Vorschau-Aufbau liegen in den Nachbar-Modulen editor-lint.js,
// editor-keymaps.js, editor-paste.js und editor-preview.js; ihre Werte kommen
// als Import zurueck, Reihenfolge und Praezedenz der Extension-Liste in
// createEditorState bleiben davon unberuehrt.
'use strict';

import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers as cmLineNumbers,
  keymap,
  drawSelection,
  placeholder,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view';
import { Table as LezerTable } from '@lezer/markdown';
import { t, hatUebersetzungen } from '../../i18n.js';
import {
  syntaxHighlighting,
  codeFolding,
  foldedRanges,
  foldable,
  foldEffect,
  unfoldEffect,
} from '@codemirror/language';
// 4T-0294: Linter und Typewriter-Scroll sind schaltbare Erweiterungen.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-0581 (Epic 3E-0107): Schalter-Aufloesung der Rechtschreibpruefung.
import { SPELLCHECK_EXTENSION_ID, spellcheckAttributeValue } from '../../../shared/spellcheck.js';
// 4T-0589 (Epic 3E-0109): Die reinen Pipe-Tabellen-Text-Helfer leben im
// Shared-Modul table-edit.js (gemeinsamer Kern mit den Tabellen-Operationen
// des Kontextmenüs); editor.js re-exportiert sie für Bestands-Konsumenten.
import {
  findUnescapedPipes,
  isTableLine,
  parseTableCells,
  buildEmptyTableRow,
  findCellAt,
} from '../../../shared/markdown/table-edit.js';
export { findUnescapedPipes, isTableLine, parseTableCells, buildEmptyTableRow, findCellAt };
// 4T-0655 (Epic 3E-0112): Nummerierungs-Invariante beider Editor-Zustaende
// (Nutzung nur in Funktionskörpern, Laufzeit-Zyklus unkritisch).
import { listRenumberFilter } from './editor-list-tools.js';
// 4T-1002 (Epic 3E-0196): Tastenbelegungen des Editors. Laufzeit-Zyklus ueber
// editor-list-tools.js und editor-table-tools.js, Zugriffe nur in
// Funktionskoerpern.
import {
  buildEditorCommandKeymap,
  listExitKeymap,
  listIndentKeymap,
  readOnlyGuardKeymap,
  tabIndentKeymap,
  tableEditKeymap,
} from './editor-keymaps.js';
// 4T-1002: Markdown-Linter. Laufzeit-Zyklus, Zugriffe nur in Funktionskoerpern.
import { lintField, lintHoverTooltip, lintUpdateListener, scheduleLint } from './editor-lint.js';
// 4T-1002: Einfuege- und Anlagen-Handler. Laufzeit-Zyklus, Zugriffe nur in
// Funktionskoerpern.
import { imageOpenHandler, pasteLinkHandler } from './editor-paste.js';
// 4T-1002: Vorschau-Aufbau des Render-Pane.
import { schedulePreviewUpdate } from './editor-preview.js';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';

import { mdHighlightStyle } from '../live/live-deco.js';
// 4T-1312: haengender Einzug umgebrochener Zeilen, in beiden Instanzen fest.
import { haengenderEinzugPlugin } from './editor-einzug.js';
import {
  calloutMarkerField,
  commentMarkerField,
  footnoteMarkerField,
  frontmatterField,
  inlineCalcMarkerField,
  markMarkerField,
  searchHighlightField,
} from '../live/live-marker-fields.js';
import { liveBasePathFacet } from '../live/live-block-field.js';
import { livePreviewExtensions } from '../live/live-widgets.js';
// 4T-0365 (Epic 3E-0067): Block-Metadaten-Indikator im Live-Modus (StateField)
// und Cache-Nachladen beim Tab-/Datei-Wechsel.
import { blockMetaField, refreshBlockMetaForPane } from '../block-meta-indicator.js';
import { api, getDocText } from '../app/api.js';
import { foldChangeNotifier, foldGutterExtensions, foldStructureField } from './folding.js';
import { scheduleWordCountUpdate, updateWordCountStatusbar } from '../render-mermaid.js';
import { activeTab, editorActivity, getPaneEls, state, tabDisplayName } from '../app/app-state.js';
// 4T-0318 (Epic 3E-0057): gestufter Titel-Suffix (App/Bereich/Fenster) als
// reine Funktion.
import { buildTitleSuffix } from '../app/window-title.js';
import { activateBacklinksFor } from '../panels/panel-backlinks.js';
import { scheduleOutgoingRender } from '../panels/panel-outgoing.js';
import {
  applyOutlineActiveHighlight,
  computeOutlineActiveLine,
  renderOutline,
  scheduleOutlineActiveUpdate,
  scheduleOutlineRender,
} from '../panels/panel-outline.js';
import { scheduleSubpagesRender } from '../panels/panel-subpages.js';
import { scheduleMindmapRender } from '../mindmap/mindmap-pane.js';
// 4T-0341 (Epic 3E-0061): Breadcrumb folgt Tab-/Modus-Wechseln (Laufzeit-
// Zyklus editor <-> views, Muster wie panels.js).
import { updateSubpageBreadcrumb } from '../views/subpage-breadcrumb.js';
import { saveScroll } from '../views/pane-render.js';
import { setupScrollSyncForPane } from '../views/scroll-sync.js';
import { renderTabbar } from '../views/tabbar.js';
import { scheduleAutoSave } from '../views/views.js';
import { renderProperties } from '../properties/properties-fields.js';
// 4T-0364 (Epic 3E-0067): Cursor-Folge und Doc-Aenderung des Block-
// Eigenschaften-Panels (Laufzeit-Zyklus editor <-> block-props-panel, Muster wie
// panels.js/properties-tags.js).
import {
  scheduleBlockPropsCursorUpdate,
  scheduleBlockPropsRender,
} from '../properties/block-props-panel.js';
import { autocompleteExtension, renderTags } from './autocomplete-help.js';
// 4T-0486 (Epic 3E-0091): Schreib-Trigger "\\" oeffnet den Datums-/
// Uhrzeit-Picker (Erweiterungs-Gate liegt im Handler selbst).
// 4T-0487 (PO-Befund Runde 1): dateValuePlugin dekoriert klickbare
// Datums-/Uhrzeit-Werte als Basis-Extension in Quelltext- UND Live-Modus.
import { datePickerTriggerExtension, dateValuePlugin } from '../calendar/date-picker.js';
// 4T-0546 (Epic 3E-0097): calendarValuePlugin dekoriert klickbare
// @{Kalendername: Wert}-Vorkommen (Quelltext- und Live-Modus).
import { calendarValuePlugin } from '../calendar/calendar-picker.js';
// 4T-0943 (Epic 3E-0197): Strg-Zustand der Wert-Marken; Logik im Modul.
import { modifierZustandExtension } from '../live/modifier-zustand.js';
import { scheduleSearchRefresh, search } from '../search/search.js';
// 4T-0377 (Epic 3E-0071): Editor-Kontextmenü (Rechtsklick, Quelltext- und
// Live-Modus). Laufzeit-Zyklus wie bei den übrigen Nachbar-Modulen: das
// Menü-Modul liest paneEditors aus diesem Modul, die Zugriffe stehen auf
// beiden Seiten nur in Funktionskörpern.
import { showEditorContextMenu } from './editor-context-menu.js';
// 4T-0607 (Epic 3E-0114): Format-Toolbar — Sichtbarkeit folgt dem
// Edit-Zustand (syncEditorForPane), die Gedrückt-Zustände der Buttons dem
// Cursor (updateListener). Laufzeit-Zyklus wie editor-context-menu.js.
import { scheduleFormatToolbarStateRefresh, updateFormatToolbarForPane } from './format-toolbar.js';
// 4T-0585 (Epic 3E-0108): Titelzeile — Sichtbarkeit und Text folgen dem
// aktiven Tab und Ansichts-Modus (syncEditorForPane, Muster Format-Toolbar).
import { updateTitleLineForPane } from '../views/title-line.js';

// --- CodeMirror-Editor ------------------------------------------------------
// Pro Pane eine EditorView, die je nach aktivem Tab das Dokument, den
// Read-Only-Stand und die Toggle-Compartments (Zeilennummern, Umbruch)
// aktualisiert. Tab-Wechsel innerhalb derselben Pane resettet das Doc.
export const paneEditors = []; // paneIdx -> EditorView
export const editorCompartments = {
  readOnly: new Compartment(),
  lineNumbers: new Compartment(),
  lineWrap: new Compartment(),
  // 4T-0088 (Epic 3E-0014): basePath fuer Block-Widgets (Tabellen, Code,
  // Embeds) im Live-Modus. Wird bei Tab-Wechsel ueber syncEditorForPane
  // rekonfiguriert, damit der StateField (kein View-Zugriff) den richtigen
  // Pfad fuer Image-Aufloesung kennt.
  basePath: new Compartment(),
  // 4T-0013: Gliederung (Folding-Gutter inkl. Struktur-Field und Width-Sync)
  // toggelbar pro Tab. codeFolding() bleibt dauerhaft aktiv, damit die
  // Tastenkuerzel Strg+Umschalt+[/] auch bei ausgeblendetem Gutter wirken.
  foldGutter: new Compartment(),
  // 4T-0019: Typewriter-Scroll als Compartment, damit der Listener zur
  // Laufzeit ein-/ausgeschaltet werden kann, ohne den Editor neu aufzubauen.
  typewriter: new Compartment(),
  // 4T-0080 (Epic 3E-0014): Live-Preview-Plugin per Compartment, pro
  // Tab-Wechsel ueber syncEditorForPane rekonfiguriert basierend auf
  // tab.viewMode === 'live'. Der urspruengliche Spike-Toggle Strg+Umschalt+P
  // wurde mit 4T-0085 durch den vierten View-Modus abgeloest.
  livePreview: new Compartment(),
  // 4T-0207 (Epic 3E-0015): Registry-gespeiste Keymap der editorScoped-
  // Kommandos (Fold). Compartment, damit 4T-0208 bei hotkeys:changed zur
  // Laufzeit rekonfigurieren kann, ohne den Editor neu aufzubauen.
  commandKeymap: new Compartment(),
  // 4T-0581 (Epic 3E-0107): spellcheck-Attribut der Editor-Flaeche. Das ist
  // der eigentliche Schalter der Rechtschreibpruefung — im Main steht
  // webPreferences.spellcheck fest auf true, weil ein damit erzeugtes
  // WebContents sich sonst nie mehr zum Pruefen bewegen laesst. Compartment,
  // damit der Schalter ohne Neustart und ohne Editor-Neuaufbau wirkt.
  spellcheck: new Compartment(),
};

// 4T-0581 (Epic 3E-0107): Ist die Pruefung gerade wirksam? Schalter aus den
// Einstellungen UND aktive Erweiterung.
export function isSpellcheckActive() {
  return (
    spellcheckAttributeValue(
      state.spellcheck === true,
      isExtensionActive(SPELLCHECK_EXTENSION_ID),
    ) === 'true'
  );
}

// Die Extension fuer das spellcheck-Compartment im aktuellen Zustand.
// CodeMirror setzt am Inhalts-Element von Haus aus spellcheck="false"; ein
// ausdrueckliches 'false' ist damit genau der Bestand ohne diese Erweiterung.
function spellcheckContentAttributes() {
  return EditorView.contentAttributes.of({
    spellcheck: spellcheckAttributeValue(
      state.spellcheck === true,
      isExtensionActive(SPELLCHECK_EXTENSION_ID),
    ),
  });
}

// Zieht den Schalter in allen offenen Editor-Flaechen nach: die Haupt-Editoren
// der Spalten direkt, die Notiz-Felder ueber ein Dokument-Ereignis (sie liegen
// in notes-panel.js, das seinerseits aus diesem Modul liest — der Umweg
// vermeidet den Modul-Zyklus, Muster scg:taskstates-changed).
export function refreshSpellcheckInEditors() {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({
      effects: editorCompartments.spellcheck.reconfigure(spellcheckContentAttributes()),
    });
  }
  document.dispatchEvent(new CustomEvent('scg:spellcheck-changed'));
}

// Fuer das Notiz-Feld: dieselbe Rekonfiguration auf einer fremden View.
export function applySpellcheckToView(view) {
  if (!view) return;
  view.dispatch({
    effects: editorCompartments.spellcheck.reconfigure(spellcheckContentAttributes()),
  });
}

// 4T-0398 (Epic 3E-0066): Schlanke EditorState-Factory fuer das Notizen-Feld.
// Bewusst ohne die Dokument-Last des Haupt-Editors (Linter/IPC, Folding,
// Autocomplete, Live-Preview, Scroll-Sync, tab.content-Kopplung): nur Basis-
// Editing mit Undo, Markdown-Syntaxfarbe, die Format-Keymap aus der Kommando-
// Registry (Strg+B usw.) und ein Save-Callback bei Doc-Aenderung. Damit wirken
// das bestehende Editor-Kontextmenue (editor-context-menu.js) und die
// Formatierungs-Kuerzel unveraendert, weil beide rein gegen die EditorView-API
// arbeiten. Die Fold-Kommandos der Keymap sind ohne codeFolding() no-op.
export function createNotesEditorState({ content = '', placeholderText = '', onDocChanged } = {}) {
  return EditorState.create({
    doc: content,
    extensions: [
      EditorView.lineWrapping,
      // 4T-0603 (Epic 3E-0113): eingebauten lang-markdown-Paste-Handler
      // abschalten, damit der eigene pasteLinkHandler mit unseren Regeln
      // (Spitze-Klammern, Schalter, Code-Schutz) allein greift.
      markdown({ extensions: [LezerTable], pasteURLAsLink: false }),
      syntaxHighlighting(mdHighlightStyle, { fallback: true }),
      haengenderEinzugPlugin,
      history(),
      // 4T-0640 (Epic 3E-0069): Schreibschutz-Wache vor der Markdown-Belegung.
      readOnlyGuardKeymap,
      // 4T-0655 (Epic 3E-0112): Nummerierungs-Invariante auch im Notiz-Feld,
      // damit sich Listen dort wie im Haupt-Editor verhalten (die Listen-
      // Kommandos wirken ueber buildEditorCommandKeymap ohnehin schon hier).
      EditorState.transactionFilter.of(listRenumberFilter),
      // 4T-0603 (Epic 3E-0113): URL-in-Auswahl als Markdown-Link auch im
      // Notiz-Editor, damit das Verhalten (Schalter, Spitze-Klammern bei
      // Klammer-URLs, Code-Schutz) mit dem Haupt-Editor übereinstimmt.
      pasteLinkHandler,
      // 4T-0790 (Epic 3E-0125): Doppelklick auf ein Bild oeffnet die Anlage.
      imageOpenHandler,
      // 4T-0581 (Epic 3E-0107): Das Notiz-Feld folgt demselben Schalter wie
      // der Haupt-Editor (einheitliches Verhalten beider Schreibflaechen).
      editorCompartments.spellcheck.of(spellcheckContentAttributes()),
      placeholderText ? placeholder(placeholderText) : [],
      buildEditorCommandKeymap(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      drawSelection(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // 4T-0526 (Epic 3E-0095): Tipp-Aktivitaet fuer die Tipp-Ruhe
          // des Erinnerungs-Dialogs (auch das Notizen-Feld zaehlt).
          editorActivity.lastDocEditAt = Date.now();
          if (typeof onDocChanged === 'function') onDocChanged();
        }
      }),
    ],
  });
}

// 4T-0019: Typewriter-Scroll-Extension. Bei jeder Cursor- oder Selektions-
// Aenderung wird die Cursor-Zeile vertikal in der Editor-Viewport-Mitte
// gehalten. Nicht angewendet bei reinen Doc-Aenderungen ohne Cursor-Bewegung
// — sonst wuerde das Tippen am Zeilenende ein Stottern verursachen.
export const typewriterScrollExtension = EditorView.updateListener.of((update) => {
  if (!update.selectionSet) return;
  // Nur im Edit-Modus aktiv. Im Read-Only-Modus bewegt der Nutzer den
  // Cursor nicht aktiv durch den Text, das wuerde nur stoeren.
  if (update.state.readOnly) return;
  const head = update.state.selection.main.head;
  update.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
});

// 4T-0179: foldGutterExtensions nach folding.js verschoben (Wert-
// Einbettung der Gutter-Plugins; Body-Reihenfolge der Modul-Zyklen).

// 4T-0935 (Befund B-08): Der geschriebene Stand einer offenen Datei wandert
// verzoegert in den Index-Overlay des Hauptprozesses, damit die eingebetteten
// Konstrukte der gerenderten Ansicht (Abfrage-Listen, Skript-Bloecke,
// Ereignis-Aggregationen) ihn sehen — ohne Speichern und ohne dass der
// Platten-Stand angetastet wird.
//
// Verzoegert aus demselben Grund wie Lint und automatisches Speichern: Der
// Text geht als Ganzes hinueber, das lohnt nicht je Tastendruck. Das
// anschliessende Ereignis loest die Neubefuellung aus; app-init.js hoert
// darauf und ruft dieselben drei Auffrisch-Wege wie bei einer
// Index-Invalidierung (bewusst ueber ein Dokument-Ereignis statt ueber einen
// Import, der einen Modul-Zyklus ergaebe).
export const INDEX_OVERLAY_DEBOUNCE_MS = 300;
export const INDEX_OVERLAY_EVENT = 'scg:index-overlay-changed';
// 4T-0948: Der Melde-Plan haengt an der DATEI und nicht am Modul. Vorher gab
// es genau einen Timer fuer alle Dateien, und ein neuer Plan raeumte den
// ausstehenden einer anderen Datei mit ab. Getroffen hat das jeden Reiter-
// Wechsel innerhalb der Debounce-Zeit: syncEditorForPane tauscht dabei das
// Editor-Dokument aus, das zaehlt als Doc-Aenderung und plant den Overlay des
// NEUEN Reiters — der geschriebene Stand des eben verlassenen wurde nie
// gemeldet. Der Fehler lag im Bestand von 4T-0935 und traf alle Verbraucher
// der Schicht, nicht nur die Wiki-Einbettung, ueber die er auffiel.
const indexOverlayTimers = new Map(); // Datei-Pfad -> Timer

export function scheduleIndexOverlay(tab) {
  // Ohne Pfad gibt es keinen Index-Eintrag, den man ueberlagern koennte
  // (Unbenannt-Reiter, Handbuch- und System-Seiten).
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) return;
  const filePath = tab.path;
  const content = tab.content;
  const laufend = indexOverlayTimers.get(filePath);
  if (laufend) clearTimeout(laufend);
  const timer = setTimeout(async () => {
    indexOverlayTimers.delete(filePath);
    try {
      await api.setIndexOverlay(filePath, content);
      // 4T-0948 (Befund E-01): Der gemeldete Pfad reist mit. Nur so kann der
      // Nachzug die Spalten finden, die genau diese Datei einbetten, statt
      // pauschal alle neu zu zeichnen.
      document.dispatchEvent(new CustomEvent(INDEX_OVERLAY_EVENT, { detail: { filePath } }));
    } catch (err) {
      console.warn('Index-Overlay konnte nicht gesetzt werden:', err);
    }
  }, INDEX_OVERLAY_DEBOUNCE_MS);
  indexOverlayTimers.set(filePath, timer);
}

// Gegenstueck: Speichern, Verwerfen und Schliessen nehmen den Overlay
// zurueck, damit wieder der Platten-Stand gilt. Ein noch laufender
// Melde-Timer wird dabei abgeraeumt, sonst schriebe er den verworfenen Stand
// unmittelbar danach zurueck.
//
// 4T-0948: Abgeraeumt wird nur der Plan DIESER Datei. Vorher traf es den
// einen Modul-Timer und damit gegebenenfalls den ausstehenden Plan einer
// ganz anderen Datei.
export async function clearIndexOverlayFor(filePath) {
  if (!filePath) return;
  const laufend = indexOverlayTimers.get(filePath);
  if (laufend) {
    clearTimeout(laufend);
    indexOverlayTimers.delete(filePath);
  }
  try {
    await api.clearIndexOverlay(filePath);
    // 4T-0948: auch die Ruecknahme meldet ihren Pfad — nach Verwerfen oder
    // Schliessen soll eine Einbettung dieser Datei wieder den Platten-Stand
    // zeigen.
    document.dispatchEvent(new CustomEvent(INDEX_OVERLAY_EVENT, { detail: { filePath } }));
  } catch (err) {
    console.warn('Index-Overlay konnte nicht zurueckgenommen werden:', err);
  }
}

export function createEditorState(opts = {}) {
  return EditorState.create({
    doc: opts.content || '',
    extensions: [
      editorCompartments.readOnly.of(EditorState.readOnly.of(opts.readOnly !== false)),
      // 4T-0013: Heading-Folding mit Hierarchie-Spuren. Der eigene
      // headingFoldGutter ersetzt CodeMirrors foldGutter und zeichnet pro
      // Heading-Ebene eine vertikale Spur plus eine 7. Spur fuer Block-
      // Folding (ListItem, Blockquote, FencedCode, HTMLBlock, Table). Die
      // Region-Erkennung nutzt weiterhin den foldService aus
      // @codemirror/lang-markdown (ueber foldable/foldedRanges/foldEffect);
      // codeFolding() aktiviert das foldState-Field, das ohne foldGutter()
      // sonst nicht im State waere. Die Fold-Tastenkuerzel kommen seit
      // 4T-0207 aus der Kommando-Registry (commandKeymap-Compartment unten).
      codeFolding(),
      // foldStructureField dauerhaft aktiv, weil das Outline-Panel (4T-0014)
      // seine Heading-Liste daraus liest. Nur die visuelle Spalte
      // (headingFoldGutter + foldGutterWidthSync) wird ueber das Compartment
      // ein-/ausgeschaltet.
      foldStructureField,
      editorCompartments.foldGutter.of(opts.showFoldGutter !== false ? foldGutterExtensions : []),
      foldChangeNotifier,
      editorCompartments.lineNumbers.of(opts.lineNumbers ? cmLineNumbers() : []),
      editorCompartments.lineWrap.of(opts.wrapLines ? EditorView.lineWrapping : []),
      // 4T-0019: Typewriter-Scroll als Compartment, zur Laufzeit togglebar.
      // 4T-0294: nur bei aktiver Fokus-Modus-Erweiterung (die persistierte
      // Preference bleibt erhalten und greift beim Wiedereinschalten).
      editorCompartments.typewriter.of(
        state.typewriterScroll && isExtensionActive('focus-mode') ? typewriterScrollExtension : [],
      ),
      // 4T-0085: Live-Preview-Extensions, initial leer. syncEditorForPane
      // rekonfiguriert das Compartment pro Tab-Wechsel basierend auf
      // tab.viewMode === 'live'.
      editorCompartments.livePreview.of([]),
      // 4T-0088: basePath-Compartment, initial leer. syncEditorForPane
      // rekonfiguriert pro Tab-Wechsel.
      editorCompartments.basePath.of(liveBasePathFacet.of(opts.basePath || '')),
      // 4T-0581 (Epic 3E-0107): spellcheck-Attribut aus dem aktuellen
      // Schalter-Zustand; refreshSpellcheckInEditors rekonfiguriert es.
      editorCompartments.spellcheck.of(spellcheckContentAttributes()),
      // 4T-0603 (Epic 3E-0113): eingebauten lang-markdown-Paste-Handler
      // abschalten, damit der eigene pasteLinkHandler mit unseren Regeln
      // (Spitze-Klammern, Schalter, Code-Schutz) allein greift.
      markdown({ extensions: [LezerTable], pasteURLAsLink: false }),
      syntaxHighlighting(mdHighlightStyle, { fallback: true }),
      haengenderEinzugPlugin,
      history(),
      // 4T-0640 (Epic 3E-0069): Schreibschutz-Wache. Sie steht bewusst vor
      // allen anderen Belegungen und traegt Prec.highest, damit sie auch die
      // mit Prec.high eingehaengte Markdown-Belegung ueberholt.
      readOnlyGuardKeymap,
      // 4T-0600 (Epic 3E-0112): Listen-Ausstieg auf der obersten Ebene, vor
      // der eingekauften Markdown-Belegung.
      listExitKeymap,
      // 4T-0655 (Epic 3E-0112): Nummerierungs-Invariante. Haengt die Nummern-
      // Korrektur beruehrter Listen-Bloecke an dieselbe Transaktion, damit
      // Bearbeitung und Korrektur ein Rueckgaengig-Schritt bleiben.
      EditorState.transactionFilter.of(listRenumberFilter),
      // 4T-0074: Tab/Shift-Tab/Enter in Pipe-Tabellen — VOR dem Listen-Indent
      // registriert, damit Tabellen-Kontext zuerst greift. Bei Nicht-Tabellen-
      // Zeilen liefert der Handler false und faellt an listIndentKeymap weiter.
      tableEditKeymap,
      // 4T-0016: Tab/Shift-Tab fuer Listen-Indent vor dem defaultKeymap.
      listIndentKeymap,
      // 4T-0656: Tabulator ausserhalb von Listen und Tabellen (einstellbar).
      // Ohne erhoehte Praezedenz, damit die beiden Handler darueber Vorrang
      // behalten.
      tabIndentKeymap,
      // 4T-0207: Fold-Bindings aus der Registry (vorher statisches
      // foldKeymap). Vor defaultKeymap registriert, damit ein User-Binding
      // auf eine dort belegte Kombination (z.B. Strg+[) Vorrang hat.
      editorCompartments.commandKeymap.of(buildEditorCommandKeymap()),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      // 4T-0020: Markdown-Linter-Light. lintField haelt die Decorations,
      // lintUpdateListener triggert mit Debounce einen neuen Lauf,
      // lintHoverTooltip zeigt Regel-Beschreibungen beim Hover.
      lintField,
      lintUpdateListener,
      lintHoverTooltip,
      // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile (Editor und
      // Zeilennummern-Spalte). Bewusst dauerhaft eingebunden statt in einem
      // Compartment: der Schalter appearance.highlightActiveLine gilt
      // app-weit, nicht pro Tab, und muesste sonst bei jeder Aenderung ueber
      // alle offenen Panes rekonfiguriert werden. Sichtbar wird die Zeile
      // erst ueber die Root-Klasse highlight-active-line (styles.css); ohne
      // sie bleibt der bisherige Transparent-Zustand. Der Notiz-Editor
      // (createNotesEditorState) bindet die Extensions bewusst nicht ein.
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      searchHighlightField,
      // 4T-0049: YAML-Frontmatter im Source-Pane visuell abgesetzt darstellen.
      frontmatterField,
      // 4T-0061: Callout-Header-Marker `[!type][+-]?` visuell abheben.
      calloutMarkerField,
      // 4T-0062: Highlight-Inhalt zwischen `==…==` gelb hinterlegen.
      markMarkerField,
      // 4T-0063: Footnote-Referenzen und -Definitionen markieren.
      footnoteMarkerField,
      // 4T-0479: %%-Kommentar-Bereiche dezent einfaerben.
      commentMarkerField,
      // 4T-0596: Inline-Berechnungen {= … =} dezent einfaerben (beide Modi).
      inlineCalcMarkerField,
      // 4T-0057: Autocomplete fuer Wiki-Links und Tags.
      autocompleteExtension,
      // 4T-0486: Schreib-Trigger "\\" fuer den Datums-/Uhrzeit-Picker.
      datePickerTriggerExtension,
      // 4T-0487: klickbare Datums-/Uhrzeit-Werte (Quelltext- und Live-Modus).
      dateValuePlugin,
      // 4T-0546: klickbare Kalender-Werte @{Name: Wert} (beide Modi).
      calendarValuePlugin,
      // 4T-0943: Sichtbarkeit des Strg-Zugangs in der aktiven Zeile.
      modifierZustandExtension,
      // 4T-0603 (Epic 3E-0113): URL-in-Auswahl als Markdown-Link einfügen.
      pasteLinkHandler,
      // 4T-0790 (Epic 3E-0125): Doppelklick auf ein Bild oeffnet die Anlage.
      imageOpenHandler,
      EditorView.updateListener.of((update) => {
        const pIdx = paneEditors.indexOf(update.view);
        if (pIdx < 0) return;
        const pane = state.panes[pIdx];
        if (!pane || pane.activeIndex < 0) return;
        const tab = pane.tabs[pane.activeIndex];
        if (!tab) return;
        if (update.docChanged) {
          // 4T-0526 (Epic 3E-0095): Tipp-Aktivitaet fuer die Tipp-Ruhe
          // des Erinnerungs-Dialogs.
          editorActivity.lastDocEditAt = Date.now();
          // R2-11 (4T-0180): geteilte Serialisierung (eine Voll-Text-Kopie
          // pro Doc-Version statt einer pro Konsument) plus Laengen-
          // Shortcut: ungleiche Laenge ist immer dirty, nur bei gleicher
          // Laenge faellt der O(n)-Stringvergleich an.
          tab.content = getDocText(update.state.doc);
          const wasDirty = tab.dirty;
          tab.dirty =
            update.state.doc.length !== tab.originalContent.length
              ? true
              : tab.content !== tab.originalContent;
          if (wasDirty !== tab.dirty) {
            renderTabbar(pIdx);
            updateWindowTitle();
          }
          if (tab.viewMode === 'split') schedulePreviewUpdate(pIdx);
          scheduleAutoSave();
          // 4T-0935 (Befund B-08): geschriebenen Stand an den Index-Overlay
          // melden, damit eingebettete Konstrukte der gerenderten Ansicht ihn
          // sehen, ohne dass gespeichert wurde.
          scheduleIndexOverlay(tab);
          // R5-01 (4T-0171): Doc-Aenderung macht die Source-Such-Offsets
          // ungueltig. Sofort invalidieren (Replace darf nie mit alten
          // from/to dispatchen) und die sichtbare Suche debounced neu
          // aufbauen.
          if (search.visible && search.scope === 'source' && search.matches.length > 0) {
            search.matches = [];
            search.currentIndex = -1;
            scheduleSearchRefresh();
          }
          // 4T-0014: Outline rendert bei jeder Doc-Aenderung neu (Debounce
          // 200 ms), damit die Hierarchie immer aktuell ist.
          if (state.outline.visibleByPane[pIdx]) scheduleOutlineRender(pIdx);
          // 4T-1047: Mindmap folgt mit demselben Debounce (zeichnet nur im Modus).
          scheduleMindmapRender(pIdx);
          // 4T-0072: Word Count neu berechnen (150 ms Debounce).
          if (pIdx === state.activePaneIndex) scheduleWordCountUpdate();
          // 4T-0073: Outgoing-Links neu berechnen (150 ms Debounce).
          if (state.outgoing && state.outgoing.visibleByPane[pIdx]) scheduleOutgoingRender(pIdx);
          // 4T-0364 (Epic 3E-0067): Anker-Liste und Verwaisten-Abgleich des
          // Block-Eigenschaften-Panels bei Doc-Aenderung nachziehen (Anker
          // koennen dazukommen oder verschwinden).
          if (state.blockProps && state.blockProps.visibleByPane[pIdx])
            scheduleBlockPropsRender(pIdx);
        }
        // 4T-0014: Cursor-Bewegung triggert Aktiv-Sektion-Update mit
        // 100 ms Debounce. Selection-Change reicht — Doc-Change-Pfad oben
        // setzt ohnehin neu auf, weil die Heading-Struktur sich aendern kann.
        if (update.selectionSet && state.outline.visibleByPane[pIdx]) {
          scheduleOutlineActiveUpdate(pIdx);
        }
        // 4T-0364 (Epic 3E-0067): Cursor-Bewegung laesst das Block-
        // Eigenschaften-Panel dem Anker unter dem Cursor folgen.
        if (update.selectionSet && state.blockProps && state.blockProps.visibleByPane[pIdx]) {
          scheduleBlockPropsCursorUpdate(pIdx);
        }
        // 4T-0072: Selektionswechsel aktualisiert die Word-Count-Anzeige
        // direkt (Selektionstext ist klein, kein Debounce noetig).
        if (update.selectionSet && pIdx === state.activePaneIndex) {
          updateWordCountStatusbar();
        }
        // 4T-0607 (Epic 3E-0114): Cursor-/Dokument-Aenderungen ziehen die
        // Gedrueckt-Zustaende der Format-Toolbar nach (rAF-Debounce im
        // Modul; bei versteckter Leiste ein No-op).
        if (update.selectionSet || update.docChanged) {
          scheduleFormatToolbarStateRefresh(update.view);
        }
      }),
    ],
  });
}

export function ensureEditorForPane(paneIdx) {
  if (paneEditors[paneIdx]) return paneEditors[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!els || !els.sourceEditor) return null;
  const view = new EditorView({
    state: createEditorState({ readOnly: true }),
    parent: els.sourceEditor,
  });
  paneEditors[paneIdx] = view;
  // 4T-0377 (Epic 3E-0071): Rechtsklick öffnet das Editor-Kontextmenü.
  // Handler auf view.dom (deckt Inhalt und Gutter beider Editier-Modi ab).
  view.dom.addEventListener('contextmenu', (e) => showEditorContextMenu(e, view));
  view.scrollDOM.addEventListener('scroll', () => saveScroll(paneIdx));
  // 4T-0070: Scroll-Sync-Listener auf beide Panes; aktiv nur, wenn der
  // aktive Tab tab.scrollSyncEnabled und viewMode 'split' hat.
  setupScrollSyncForPane(paneIdx);
  return view;
}

// Setzt Doc, readOnly, Zeilennummern und Umbruch der EditorView einer Pane
// passend zum aktiven Tab. Bei reinen Modus-Wechseln (z.B. Zeilennummern an)
// wird nur das jeweilige Compartment rekonfiguriert, kein Doc-Reset.
export function syncEditorForPane(paneIdx) {
  const view = ensureEditorForPane(paneIdx);
  if (!view) return;
  const pane = state.panes[paneIdx];
  const els = getPaneEls(paneIdx);
  if (!pane || pane.activeIndex < 0) {
    if (view.state.doc.length > 0) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    }
    view.dispatch({
      effects: [
        editorCompartments.readOnly.reconfigure(EditorState.readOnly.of(true)),
        editorCompartments.lineNumbers.reconfigure([]),
        editorCompartments.lineWrap.reconfigure([]),
        editorCompartments.foldGutter.reconfigure([]),
      ],
    });
    if (els && els.sourceEditor) els.sourceEditor.classList.add('read-only');
    // 4T-0341: ohne aktiven Tab keine Breadcrumb-Leiste.
    updateSubpageBreadcrumb(paneIdx);
    // 4T-0607 (Epic 3E-0114): ohne aktiven Tab keine Format-Toolbar.
    updateFormatToolbarForPane(paneIdx);
    // 4T-0585 (Epic 3E-0108): ohne aktiven Tab keine Titelzeile.
    updateTitleLineForPane(paneIdx);
    return;
  }
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  // 4T-1325 (Epic 3E-0236): Inhalt und Pfad in EINER Transaktion — getrennt gefahren
  // bauten die Live-Bloecke mit dem Pfad des VORHERIGEN Reiters (Begruendung im Task).
  const neuerText = tab.content || '';
  view.dispatch({
    ...(getDocText(view.state.doc) === neuerText
      ? {}
      : { changes: { from: 0, to: view.state.doc.length, insert: neuerText } }),
    effects: [
      editorCompartments.readOnly.reconfigure(EditorState.readOnly.of(!tab.editMode)),
      editorCompartments.lineNumbers.reconfigure(tab.showLineNumbers ? cmLineNumbers() : []),
      editorCompartments.lineWrap.reconfigure(tab.wrapLines ? EditorView.lineWrapping : []),
      editorCompartments.foldGutter.reconfigure(tab.showFoldGutter ? foldGutterExtensions : []),
      // 4T-0088: basePath an den neuen Tab anpassen. Block-Widgets im
      // Live-Modus (Tabellen, Code, Embeds) loesen relative Bild-/Embed-
      // Pfade gegen diesen Wert auf.
      editorCompartments.basePath.reconfigure(liveBasePathFacet.of(tab.path || '')),
      // 4T-0085: Live-Preview pro Tab. Compartment traegt das
      // livePreviewExtensions-Bundle nur, wenn tab.viewMode === 'live'.
      // 4T-0365 (Epic 3E-0067): der Block-Metadaten-Indikator (blockMetaField)
      // wird im Live-Modus mitgeladen.
      editorCompartments.livePreview.reconfigure(
        tab.viewMode === 'live' ? [...livePreviewExtensions, blockMetaField] : [],
      ),
    ],
  });
  if (els && els.sourceEditor) {
    els.sourceEditor.classList.toggle('read-only', !tab.editMode);
  }
  // 4T-0607 (Epic 3E-0114): Format-Toolbar-Sichtbarkeit folgt dem
  // Edit-Zustand und Ansichts-Modus des aktiven Tabs.
  updateFormatToolbarForPane(paneIdx);
  // 4T-0585 (Epic 3E-0108): Titelzeile folgt Tab und Ansichts-Modus.
  updateTitleLineForPane(paneIdx);
  // R2-14 (4T-0180): Nachhol-Lint fuer Editor-Modi. runLint bricht im
  // Reading-Modus frueh ab; wechselt der Tab (oder sein viewMode) in einen
  // Editor-Modus, stoesst dieser Schedule den Lauf nach. Debounce
  // kollabiert Doppel-Trigger mit dem docChanged-Pfad des Tab-Wechsels.
  if (tab.viewMode !== 'rendered') scheduleLint(view);
  // 4T-0365 (Epic 3E-0067): im Live-Modus die Block-Metadaten der Datei laden,
  // damit der Indikator unabhängig vom geöffneten Panel erscheint.
  if (tab.viewMode === 'live') refreshBlockMetaForPane(paneIdx, tab.path);
  // 4T-0014: Bei Tab-Wechsel die Outline der Pane an die neue Heading-
  // Struktur anpassen (sofern sichtbar). renderOutline ist guenstig genug,
  // um direkt zu laufen ohne weiteres Debounce.
  if (state.outline && state.outline.visibleByPane[paneIdx]) {
    renderOutline(paneIdx);
    computeOutlineActiveLine(paneIdx);
    applyOutlineActiveHighlight(paneIdx);
  }
  // 4T-0015: Bei Tab-Wechsel die Backlinks neu anfordern, falls Sektion
  // sichtbar. Refcount-Management laeuft ueber activate-/deactivate-Pfad.
  if (state.backlinks && state.backlinks.visibleByPane[paneIdx]) {
    activateBacklinksFor(paneIdx, tab && tab.path ? tab.path : null);
  }
  // 4T-0051: Bei Tab-Wechsel Properties-Sektion neu rendern, falls sichtbar.
  if (state.properties && state.properties.visibleByPane[paneIdx]) {
    renderProperties(paneIdx);
  }
  // 4T-0056: Tag-Sektion ebenfalls aktualisieren. Filter (filterByPane) und
  // Suchquery (queryByPane) bleiben pro Pane erhalten — der Tag-Index der
  // Wurzel ist gleich, nur die aktive Datei wechselt.
  if (state.tags && state.tags.visibleByPane[paneIdx]) {
    renderTags(paneIdx);
  }
  // 4T-0341 (Epic 3E-0061): Breadcrumb und Unterseiten-Sektion folgen dem
  // Tab- bzw. Ansichts-Modus-Wechsel.
  updateSubpageBreadcrumb(paneIdx);
  if (state.subpages && state.subpages.visibleByPane[paneIdx]) {
    scheduleSubpagesRender(paneIdx);
  }
}

// 4T-0013: Read-/Write-API fuer Heading-Folding zur Verwendung durch das
// Outline-Panel (4T-0014). Liest den Folding-Status einer Heading-Zeile bzw.
// klappt sie programmatisch ein/aus. Region wird ueber den markdown-foldService
// (foldable) bestimmt; tatsaechlicher Folding-Zustand kommt aus foldedRanges.

// Ermittelt die foldbare Region (from..to) fuer die Zeile mit 1-basiertem Index.
// Gibt null zurueck, wenn die Zeile kein faltbares Heading ist.
export function getHeadingRegion(view, line) {
  if (!view) return null;
  const doc = view.state.doc;
  if (line < 1 || line > doc.lines) return null;
  const lineObj = doc.line(line);
  return foldable(view.state, lineObj.from, lineObj.to);
}

export function isHeadingRegionFolded(view, line) {
  const region = getHeadingRegion(view, line);
  if (!region) return false;
  let folded = false;
  foldedRanges(view.state).between(region.from, region.to, (from, to) => {
    if (from === region.from && to === region.to) {
      folded = true;
      return false;
    }
  });
  return folded;
}

export function foldHeadingRegion(view, line) {
  const region = getHeadingRegion(view, line);
  if (!region) return false;
  if (isHeadingRegionFolded(view, line)) return false;
  view.dispatch({ effects: foldEffect.of(region) });
  return true;
}

export function unfoldHeadingRegion(view, line) {
  const region = getHeadingRegion(view, line);
  if (!region) return false;
  if (!isHeadingRegionFolded(view, line)) return false;
  view.dispatch({ effects: unfoldEffect.of(region) });
  return true;
}

// Setzt den Fenstertitel auf "[•] <Dateiname> — EM4me" passend zum
// aktiven Tab. 4T-0318 (Epic 3E-0057): der Klammer-Suffix ist gestuft —
// App-Teil bei mehreren nummerierten Applikationen bzw. Bereichsname der
// eigenen App, Fenster-Teil bei mehreren Fenstern der App, kombiniert z.B.
// "(App 2, Fenster 3)". Sendet ausserdem den aktiven Tab-Namen und die
// Tab-Anzahl an den Main, damit andere Fenster die Info im Tab-Kontextmenue
// als Tooltip nutzen koennen.
export function updateWindowTitle() {
  const tab = activeTab();
  const name = tab ? tabDisplayName(tab) : '';
  const base = tab ? `${tab.dirty ? '• ' : ''}${name} — EM4me` : 'EM4me';
  const info = {
    // 4T-0538 (Epic 3E-0098): bei deaktivierter Erweiterung entfaellt der
    // Arbeitsbereichs-Teil (die App erscheint als normale Applikation).
    workspaceName: isExtensionActive('workspaces') ? state.workspaceName : null,
    // 4T-0871 (Buch = Bereich): Titel-Stufe "Buch {name}"; bei
    // abgeschalteter Erweiterung faellt der Titel auf den Bereichs-Teil
    // zurueck (die Bereichs-Bindung der Buch-App bleibt bestehen).
    bookName: isExtensionActive('books') ? state.bookName : null,
    // 4T-0873: Regal-Stufe, dieselbe Erweiterung wie die Bücher.
    shelfName: isExtensionActive('books') ? state.shelfName : null,
    areaName: state.areaName,
    appNumber: state.appNumber,
    numberedAppCount: state.numberedAppCount,
    displayNumber: state.displayNumber,
    totalWindowCount: state.totalWindowCount,
  };
  // 4T-1044 (Weg A): Suffix erst ab geladenem Woerterbuch, sonst stuende der rohe
  // Schluessel im Titel. Ohne Ruecksprung, damit die Fenster-Meta unten laeuft.
  const suffix = hatUebersetzungen() ? buildTitleSuffix(info, t) : '';
  document.title = base + suffix;

  // Aktive Tab-Anzahl ueber alle Panes hinweg.
  let tabCount = 0;
  for (const pane of state.panes) tabCount += pane.tabs.length;
  if (api && typeof api.notifyWindowMeta === 'function') {
    api.notifyWindowMeta({ activeTabName: name, tabCount });
  }
}
