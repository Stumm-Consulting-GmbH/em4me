// CodeMirror-Aufbau pro Pane, Listen-/Tabellen-Komfort, Markdown-Linter und Typewriter-Scroll.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { CALLOUT_TYPES } from '../../shared/callouts.js';
import { EditorState, Compartment, StateField, StateEffect, Prec } from '@codemirror/state';
import {
  EditorView,
  lineNumbers as cmLineNumbers,
  keymap,
  drawSelection,
  placeholder,
  Decoration,
  hoverTooltip,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view';
import { Table as LezerTable } from '@lezer/markdown';
import { t } from '../i18n.js';
import {
  syntaxHighlighting,
  syntaxTree,
  ensureSyntaxTree,
  codeFolding,
  foldCode,
  unfoldCode,
  foldAll,
  unfoldAll,
  foldedRanges,
  foldable,
  foldEffect,
  unfoldEffect,
} from '@codemirror/language';
// 4T-0207 (Epic 3E-0015): Editor-Keymap (Fold-Kommandos) aus der Kommando-
// Registry statt des pauschalen foldKeymap; Bindings damit konfigurierbar.
import { COMMANDS, mergeBindings, acceleratorToCmKey } from '../../shared/commands.js';
// 4T-0292 (Epic 3E-0052): Kommandos deaktivierter Erweiterungen auch aus
// der Editor-Keymap filtern (Muster der Dispatcher-Map in app-init.js);
// 4T-0294: Linter und Typewriter-Scroll sind schaltbare Erweiterungen.
import { disabledCommandIdSet } from '../../shared/extensions.js';
import { getDisabledExtensionIds, isExtensionActive } from './extension-lifecycle.js';
// 4T-0589 (Epic 3E-0109): Die reinen Pipe-Tabellen-Text-Helfer leben im
// Shared-Modul table-edit.js (gemeinsamer Kern mit den Tabellen-Operationen
// des Kontextmenüs); editor.js re-exportiert sie für Bestands-Konsumenten.
import {
  findUnescapedPipes,
  isTableLine,
  parseTableCells,
  buildEmptyTableRow,
  findCellAt,
} from '../../shared/markdown/table-edit.js';
export { findUnescapedPipes, isTableLine, parseTableCells, buildEmptyTableRow, findCellAt };
// 4T-0590 (Epic 3E-0109): Laufzeit-Backend der table.*-Kommandos (Nutzung
// nur in Funktionskörpern, Laufzeit-Zyklus unkritisch).
import { runTableCommand } from './editor-table-tools.js';
// 4T-0599 (Epic 3E-0112): Struktur-Kern der Listen-Bearbeitung plus sein
// Laufzeit-Backend (Nutzung ebenfalls nur in Funktionskörpern).
import { LIST_LINE_RE, LIST_INDENT_STEP } from '../../shared/markdown/list-outline.js';
import {
  runListMove,
  runListIndentSubtree,
  runListExit,
  runListSelectSubtree,
  listRenumberFilter,
} from './editor-list-tools.js';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentMore,
  indentLess,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
// 4T-0603 (Epic 3E-0113): Link-Erzeugung und URL-Erkennung für den
// Paste-in-Auswahl-Handler (reiner Shared-Baustein).
import { insertExternalLink, detectPasteUrl } from '../../shared/markdown-format.js';
// 4T-0642 (Epic 3E-0125): Anlagen aus Zwischenablage und Ziehen ablegen.
import { anlagenAusDataTransfer, legeAnlagenAb } from './attachments.js';

import {
  calloutMarkerField,
  commentMarkerField,
  computeCommentRanges,
  detectFrontmatterLines,
  footnoteMarkerField,
  frontmatterField,
  inlineCalcMarkerField,
  markMarkerField,
  mdHighlightStyle,
  searchHighlightField,
} from './live-deco.js';
import { liveBasePathFacet, livePreviewExtensions, positionInsideCode } from './live-widgets.js';
// 4T-0365 (Epic 3E-0067): Block-Metadaten-Indikator im Live-Modus (StateField)
// und Cache-Nachladen beim Tab-/Datei-Wechsel.
import { blockMetaField, refreshBlockMetaForPane } from './block-meta-indicator.js';
import { api, getDocText } from './api.js';
import { foldChangeNotifier, foldGutterExtensions, foldStructureField } from './folding.js';
import {
  applyRenderPipeline,
  scheduleWordCountUpdate,
  updateWordCountStatusbar,
} from './render-mermaid.js';
import { activeTab, editorActivity, getPaneEls, state, tabDisplayName } from './app-state.js';
// 4T-0318 (Epic 3E-0057): gestufter Titel-Suffix (App/Bereich/Fenster) als
// reine Funktion.
import { buildTitleSuffix } from './window-title.js';
// 4T-0324 (Epic 3E-0058): Außen-Link-Warnung — Ziel-Auflösung für die
// Linter-Regel outsideAreaLink (der Render-Pane-Marker läuft über die
// Render-Pipeline in render-mermaid.js).
import { isOutsideActiveArea, resolveLocalTarget } from './area.js';
import {
  activateBacklinksFor,
  applyOutlineActiveHighlight,
  computeOutlineActiveLine,
  renderOutline,
  scheduleOutgoingRender,
  scheduleOutlineActiveUpdate,
  scheduleOutlineRender,
  scheduleSubpagesRender,
} from './panels.js';
// 4T-0341 (Epic 3E-0061): Breadcrumb folgt Tab-/Modus-Wechseln (Laufzeit-
// Zyklus editor <-> views, Muster wie panels.js).
import { updateSubpageBreadcrumb } from './views.js';
// 4T-0790 (Epic 3E-0125): Bild-Anlage per Doppelklick oeffnen.
import { oeffneBildAusQuelle } from './views.js';
import {
  notePaneRendered,
  renderTabbar,
  saveScroll,
  scheduleAutoSave,
  setupScrollSyncForPane,
} from './views.js';
import { renderProperties } from './properties-tags.js';
// 4T-0364 (Epic 3E-0067): Cursor-Folge und Doc-Aenderung des Block-
// Eigenschaften-Panels (Laufzeit-Zyklus editor <-> block-props-panel, Muster wie
// panels.js/properties-tags.js).
import { scheduleBlockPropsCursorUpdate, scheduleBlockPropsRender } from './block-props-panel.js';
import { autocompleteExtension, renderTags } from './autocomplete-help.js';
// 4T-0486 (Epic 3E-0091): Schreib-Trigger "\\" oeffnet den Datums-/
// Uhrzeit-Picker (Erweiterungs-Gate liegt im Handler selbst).
// 4T-0487 (PO-Befund Runde 1): dateValuePlugin dekoriert klickbare
// Datums-/Uhrzeit-Werte als Basis-Extension in Quelltext- UND Live-Modus.
import { datePickerTriggerExtension, dateValuePlugin } from './date-picker.js';
// 4T-0546 (Epic 3E-0097): calendarValuePlugin dekoriert klickbare
// @{Kalendername: Wert}-Vorkommen (Quelltext- und Live-Modus).
import { calendarValuePlugin } from './calendar-picker.js';
import { scheduleSearchRefresh, search } from './search.js';
// 4T-0377 (Epic 3E-0071): Editor-Kontextmenü (Rechtsklick, Quelltext- und
// Live-Modus). Kein Import-Zyklus — das Menü-Modul zieht nur dialogs/api.
import { showEditorContextMenu } from './editor-context-menu.js';
// 4T-0378 (Epic 3E-0071): Format-/Link-Kommando-Funktionen für die Editor-
// Keymap (Hotkey-Pfad); dasselbe FORMAT_COMMANDS speist das Kontextmenü.
import { FORMAT_COMMANDS } from './editor-format.js';
// 4T-0607 (Epic 3E-0114): Format-Toolbar — Sichtbarkeit folgt dem
// Edit-Zustand (syncEditorForPane), die Gedrückt-Zustände der Buttons dem
// Cursor (updateListener). Laufzeit-Zyklus wie editor-context-menu.js.
import { scheduleFormatToolbarStateRefresh, updateFormatToolbarForPane } from './format-toolbar.js';
// 4T-0585 (Epic 3E-0108): Titelzeile — Sichtbarkeit und Text folgen dem
// aktiven Tab und Ansichts-Modus (syncEditorForPane, Muster Format-Toolbar).
import { updateTitleLineForPane } from './title-line.js';

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
};

// 4T-0590 (Epic 3E-0109): Tabellen-Kommandos (editorScoped) als dünne
// Wrapper auf das Laufzeit-Backend in editor-table-tools.js. Das Objekt
// entsteht lokal (kein Top-Level-Zugriff auf das zyklisch geladene Modul);
// runTableCommand wird erst beim Aufruf aufgelöst.
const TABLE_OPS = [
  'alignLeft',
  'alignCenter',
  'alignRight',
  'rowUp',
  'rowDown',
  'rowInsert',
  'rowDelete',
  'colLeft',
  'colRight',
  'colInsert',
  'colDelete',
  'transpose',
];
const TABLE_COMMAND_FUNCTIONS = Object.fromEntries(
  TABLE_OPS.map((op) => [`table.${op}`, (view) => runTableCommand(view, op)]),
);

// 4T-0207: CodeMirror-Funktionen der editorScoped-Kommandos. Die Bindings
// kommen aus der Registry (Defaults plus User-Overrides aus state).
export const EDITOR_COMMAND_FUNCTIONS = {
  'editor.fold': foldCode,
  'editor.unfold': unfoldCode,
  'editor.foldAll': foldAll,
  'editor.unfoldAll': unfoldAll,
  // 4T-0378: Zeichen-Format- und Link-Kommandos (editorScoped).
  ...FORMAT_COMMANDS,
  // 4T-0590: Tabellen-Operationen des Kontextmenü-Untermenüs.
  ...TABLE_COMMAND_FUNCTIONS,
  // 4T-0599 (Epic 3E-0112): Listenpunkt samt Teilbaum verschieben. Liefert
  // der Handler false (keine Listenzeile), faellt der Tastendruck an den
  // defaultKeymap durch, der Alt+Pfeil auf moveLineUp/-Down bindet — das
  // Kuerzel bleibt damit ausserhalb von Listen wie bisher nuetzlich.
  'list.moveUp': (view) => runListMove(view, -1),
  'list.moveDown': (view) => runListMove(view, +1),
  // 4T-0600 (Epic 3E-0112): Listenpunkt samt Teilbaum auswaehlen.
  'list.selectSubtree': (view) => runListSelectSubtree(view),
};

export function buildEditorCommandKeymap() {
  const effective = mergeBindings(state.hotkeyOverrides);
  // 4T-0292: Kommandos effektiv deaktivierter Erweiterungen ohne Binding.
  const disabledCommands = disabledCommandIdSet(getDisabledExtensionIds());
  const entries = [];
  for (const cmd of COMMANDS) {
    if (!cmd.editorScoped) continue;
    if (disabledCommands.has(cmd.id)) continue;
    const run = EDITOR_COMMAND_FUNCTIONS[cmd.id];
    if (!run) continue;
    for (const binding of effective[cmd.id] || []) {
      const key = acceleratorToCmKey(binding);
      if (key) entries.push({ key, run });
    }
  }
  return keymap.of(entries);
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

// R2-01 (4T-0174): Preview-Debounce pro Pane (vorher global — ein Tipp in
// Pane B cancelte den anstehenden Preview-Refresh von Pane A, deren
// Split-Vorschau blieb stale).
export const pendingPreviewTimers = [null, null];

// 4T-0016: Tab/Shift+Tab in Markdown-Listen rueckt Listen-Eintraege ein bzw.
// aus. Erkannt werden ungeordnete Marker (`-`, `*`, `+`, inkl. Task-Liste
// `- [ ]` / `- [x]`) und geordnete Marker (`1.`, `2.`, ...). Die Variante
// mit Klammer (`1)`) wird bewusst nicht unterstuetzt. Einrueck-Schrittweite
// ist zwei Leerzeichen. Beim Einruecken einer geordneten Liste wird die
// Nummer auf `1.` zurueckgesetzt (neue Sub-Liste), beim Ausruecken bleibt
// die Nummer unveraendert. In Code-Bloecken (FencedCode / CodeBlock) greift
// die Logik nicht, damit der Default-Tab dort erhalten bleibt.
//
// 4T-0599 (Epic 3E-0112): Regex und Schrittweite leben im Struktur-Kern
// src/shared/markdown/list-outline.js (dort nutzen sie auch die reinen
// Teilbaum-Operationen); hier bleiben sie als Re-Export fuer die Bestands-
// Konsumenten stehen. Muster src/shared/markdown/table-edit.js.
export { LIST_LINE_RE, LIST_INDENT_STEP };

export function lineInsideCodeBlock(state, line) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(line.from, 1);
  while (node) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
    node = node.parent;
  }
  return false;
}

// Liefert true, wenn mindestens eine Zeile in der aktuellen Selektion ein
// Listen-Marker traegt; sonst false (dann faellt der Tab-Handler durch und
// CodeMirror behaelt sein Default-Verhalten).
export function selectionTouchesList(state) {
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) {
      const line = state.doc.line(n);
      if (!LIST_LINE_RE.test(line.text)) continue;
      if (lineInsideCodeBlock(state, line)) continue;
      return true;
    }
  }
  return false;
}

// Erzeugt eine Transaktion, die Listen-Zeilen der aktuellen Selektion ein-
// oder ausrueckt. delta = +1 (Einruecken) oder -1 (Ausruecken). Nicht-Listen-
// Zeilen bleiben unveraendert. Alle Aenderungen laufen als ein dispatch, damit
// Strg+Z sie als atomaren Schritt rueckgaengig macht.
export function applyListIndent(view, delta) {
  const state = view.state;
  if (state.readOnly) return false;
  // 4T-0599 (Epic 3E-0112): Bei aktiver Erweiterung nimmt der Ein-Zeilen-Fall
  // den Teilbaum mit und nummeriert danach neu. Der Handler liefert false,
  // wenn er nicht greift (mehrzeilige Auswahl, keine Listenzeile, Code-
  // Block) — dann laeuft unveraendert das zeilenweise Bestands-Verhalten.
  if (isExtensionActive('outliner') && runListIndentSubtree(view, delta)) return true;
  if (!selectionTouchesList(state)) return false;
  const changes = [];
  const seenLines = new Set();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) {
      if (seenLines.has(n)) continue;
      seenLines.add(n);
      const line = state.doc.line(n);
      const m = LIST_LINE_RE.exec(line.text);
      if (!m) continue;
      if (lineInsideCodeBlock(state, line)) continue;
      const leading = m[1];
      const marker = m[2];
      const isOrdered = /^\d+\.\s$/.test(marker);
      if (delta > 0) {
        if (isOrdered) {
          // Marker (z.B. "2. ") inklusive Leerzeichen ersetzen durch
          // "  1. " (Sub-Liste startet wieder bei 1).
          changes.push({
            from: line.from,
            to: line.from + leading.length + marker.length,
            insert: leading + ' '.repeat(LIST_INDENT_STEP) + '1. ',
          });
        } else {
          // 2 Leerzeichen vor dem Marker einfuegen, Marker unveraendert.
          changes.push({
            from: line.from + leading.length,
            insert: ' '.repeat(LIST_INDENT_STEP),
          });
        }
      } else {
        if (leading.length === 0) continue; // Ebene 0 -> No-Op
        // Bis zu LIST_INDENT_STEP fuehrende Whitespace-Zeichen entfernen.
        const removeCount = Math.min(LIST_INDENT_STEP, leading.length);
        changes.push({
          from: line.from,
          to: line.from + removeCount,
          insert: '',
        });
      }
    }
  }
  if (!changes.length) return false;
  view.dispatch(
    state.update({
      changes,
      userEvent: delta > 0 ? 'input.indent.more' : 'input.indent.less',
      scrollIntoView: true,
    }),
  );
  return true;
}

// Eigene Keymap mit hoher Praezedenz, damit Tab/Shift-Tab vor dem
// defaultKeymap greifen. Gibt false zurueck, wenn keine Listen-Zeile betroffen
// ist; CodeMirror reicht den Tastendruck dann an die naechste Bindung weiter
// (Default-Verhalten ausserhalb von Listen bleibt unveraendert).
export const listIndentKeymap = Prec.high(
  keymap.of([
    { key: 'Tab', run: (view) => applyListIndent(view, +1) },
    { key: 'Shift-Tab', run: (view) => applyListIndent(view, -1) },
  ]),
);

// 4T-0656 (Epic 3E-0112): Tabulator ausserhalb von Listen und Tabellen.
//
// Ohne diese Belegung ist die Taste dort unbelegt (CodeMirror bindet sie im
// Standard bewusst nicht), der Tastendruck erreicht die Anwendung und der
// Fokus wandert zum naechsten Element — in der geteilten Ansicht also in die
// Render-Pane. Der Product Owner hat das als stoerend gemeldet und
// entschieden, es einstellbar zu machen (Store-Key input.tabIndents,
// Default an).
//
// Bewusst ohne Compartment: Der Handler liest den Laufzeit-Zustand bei jedem
// Tastendruck, damit der Schalter ohne Rekonfiguration aller offenen Panes
// wirkt. Die Belegung traegt keine erhoehte Praezedenz und greift damit erst,
// wenn Tabellen- und Listen-Handler abgelehnt haben. indentMore/indentLess
// pruefen den Schreibschutz selbst.
export const tabIndentKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => (state.tabIndents !== false ? indentMore(view) : false),
    shift: (view) => (state.tabIndents !== false ? indentLess(view) : false),
  },
]);

// === 4T-0640 (Epic 3E-0069): Schreibschutz-Wache der Tastenbelegung ==========
// EditorState.readOnly blockiert nur den DOM-Eingabepfad, nicht Kommandos aus
// einer Tastenbelegung. Die Standard-Kommandos (@codemirror/commands) pruefen
// den Schreibschutz deshalb selbst, ebenso alle App-eigenen Handler
// (applyListIndent, handleTableTab/-Enter, Picker, Kontextmenue). Die
// eingekaufte Markdown-Belegung tut es NICHT: sie bindet Enter an
// insertNewlineContinueMarkup und Backspace an deleteMarkupBackward, und
// beide schreiben bedingungslos. Im reinen Lesemodus erzeugte Enter am Ende
// einer nummerierten Liste dadurch die naechste Nummer (PO-Meldung).
//
// Statt die Belegung abzuschalten (addKeymap: false) und ihre Kommandos
// selbst nachzubauen, faengt diese Wache die schreibenden Tasten VOR jeder
// anderen Bindung ab, solange der Schreibschutz gilt. Prec.highest ist
// noetig, weil lang-markdown seine Belegung mit Prec.high einhaengt. Der
// Schutz wirkt damit auch fuer kuenftige Erweiterungen, die dieselben Tasten
// belegen; im Bearbeitungs-Modus liefert die Wache false und alles laeuft
// unveraendert weiter.
const READ_ONLY_GUARD_KEYS = ['Enter', 'Shift-Enter', 'Mod-Enter', 'Backspace', 'Delete'];

export const readOnlyGuardKeymap = Prec.highest(
  keymap.of(READ_ONLY_GUARD_KEYS.map((key) => ({ key, run: (view) => view.state.readOnly }))),
);

// 4T-0600 (Epic 3E-0112): Listen-Ausstieg auf der obersten Ebene. Braucht
// Prec.highest, weil die eingekaufte Markdown-Belegung mit Prec.high kommt
// und Enter sonst vor diesem Handler behandelt. Steht in der Extension-Liste
// NACH der Schreibschutz-Wache, damit die im Lesemodus zuerst greift; in
// allen anderen Faellen liefert der Handler false und die eingekaufte
// Fortsetzung laeuft unveraendert.
export const listExitKeymap = Prec.highest(
  keymap.of([{ key: 'Enter', run: (view) => runListExit(view) }]),
);

// === 4T-0074 (Epic 3E-0013): Tabellen-Editor-Komfort =========================
// Tab/Umschalt+Tab springen zwischen Zellen einer klassischen Pipe-Tabelle.
// Enter am Zeilenende erzeugt eine neue Tabellenzeile mit derselben Spalten-
// Anzahl. Trennerzeilen (|---|---|) und Kopfzeilen werden gleich behandelt
// wie Inhaltszeilen — der Cursor springt einfach durch. Perspective-Tabellen
// (`perspective-table`-Code-Bloecke aus 3E-0006/3E-0007/3E-0008) sind nicht betroffen,
// weil dort eine andere Syntax greift und der Cursor in einem CodeBlock-
// Kontext steht (lineInsideCodeBlock liefert true, Handler bricht ab).
//
// Konflikt-Reihenfolge mit Listen-Indent (4T-0016): tableEditKeymap steht in
// der Extension-Liste VOR listIndentKeymap. Bei nicht-Tabellen-Zeilen liefert
// der Tabellen-Handler false, und die Tab-/Shift+Tab-Taste faellt an
// listIndentKeymap weiter.

// R2-19 (4T-0186): Tabellen-Erkennung deckt auch randlose GFM-Tabellen ab
// (die Preview rendert sie laengst). Rand-Pipe-Zeilen wie bisher rein
// textuell; Zeilen ohne Rand-Pipes nur dann, wenn der Lezer-Baum sie
// tatsaechlich einer Table zuordnet — eine einzelne Pipe in Fliesstext
// darf Tab/Enter nicht kapern.
export function isTableContextLine(state, line) {
  if (isTableLine(line.text)) return true;
  if (findUnescapedPipes(line.text).length === 0) return false;
  let n = syntaxTree(state).resolveInner(Math.min(line.from + 1, line.to), 1);
  while (n) {
    if (n.name === 'Table') return true;
    n = n.parent;
  }
  return false;
}

export function handleTableTab(view, direction) {
  const state = view.state;
  if (state.readOnly) return false;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (range.from !== range.to) return false;
  const cursorPos = range.from;
  const line = state.doc.lineAt(cursorPos);
  const lineText = line.text;
  // R2-19 (4T-0186): randlose GFM-Tabellen einschliessen.
  if (!isTableContextLine(state, line)) return false;
  if (lineInsideCodeBlock(state, line)) return false;
  const cells = parseTableCells(lineText);
  if (!cells || cells.length === 0) return false;
  const col = cursorPos - line.from;
  const cellIdx = findCellAt(cells, col);
  if (cellIdx < 0) return false;

  if (direction === 'forward') {
    if (cellIdx < cells.length - 1) {
      // Naechste Zelle in derselben Zeile.
      const target = cells[cellIdx + 1];
      const anchor = line.from + Math.max(target.contentStart, target.start);
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      return true;
    }
    // Letzte Zelle: in die naechste Tabellen-Zeile oder neue Zeile erzeugen.
    if (line.number < state.doc.lines) {
      const nextLine = state.doc.line(line.number + 1);
      if (isTableContextLine(state, nextLine)) {
        const nextCells = parseTableCells(nextLine.text);
        if (nextCells && nextCells.length > 0) {
          const target = nextCells[0];
          const anchor = nextLine.from + Math.max(target.contentStart, target.start);
          view.dispatch({ selection: { anchor }, scrollIntoView: true });
          return true;
        }
      }
    }
    // Neue Tabellenzeile anhaengen.
    const newRow = buildEmptyTableRow(cells.length);
    const insertPos = line.to;
    // Cursor in die erste Zelle der neuen Zeile: "| | | |" -> Position 2
    // (zwischen erster Pipe und erstem Trenn-Space).
    const cursorTarget = insertPos + 1 + 2;
    view.dispatch({
      changes: { from: insertPos, insert: '\n' + newRow },
      selection: { anchor: cursorTarget },
      scrollIntoView: true,
      userEvent: 'input.table.newrow',
    });
    return true;
  }
  // backward
  if (cellIdx > 0) {
    const target = cells[cellIdx - 1];
    const anchor = line.from + Math.max(target.contentStart, target.start);
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    return true;
  }
  if (line.number > 1) {
    const prevLine = state.doc.line(line.number - 1);
    if (isTableContextLine(state, prevLine)) {
      const prevCells = parseTableCells(prevLine.text);
      if (prevCells && prevCells.length > 0) {
        const target = prevCells[prevCells.length - 1];
        const anchor = prevLine.from + Math.max(target.contentStart, target.start);
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
        return true;
      }
    }
  }
  // Erste Zelle der ersten Tabellen-Zeile: kein Effekt, aber Tab-Default
  // (Einfuegen eines Tab-Zeichens) wuerde die Tabelle zerstoeren. Wir
  // schlucken die Taste hier.
  return true;
}

export function handleTableEnter(view) {
  const state = view.state;
  if (state.readOnly) return false;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (range.from !== range.to) return false;
  const cursorPos = range.from;
  const line = state.doc.lineAt(cursorPos);
  const lineText = line.text;
  // R2-19 (4T-0186): randlose GFM-Tabellen einschliessen.
  if (!isTableContextLine(state, line)) return false;
  if (lineInsideCodeBlock(state, line)) return false;
  // Nur am Zeilenende greifen (nach dem Cursor folgt nur Whitespace bis
  // zum Zeilenende). Mittendrin uebernimmt Default.
  const afterCursor = lineText.substring(cursorPos - line.from);
  if (afterCursor.trim() !== '') return false;
  const cells = parseTableCells(lineText);
  if (!cells || cells.length === 0) return false;

  // Wenn die aktuelle Zeile vollstaendig leer ist (alle Zellen ohne Inhalt),
  // wertet der Nutzer das als Ausstieg aus der Tabelle. Wir loeschen die
  // leere Zeile und lassen einen Default-Enter folgen (durchfallen). Damit
  // landet der Cursor in einer leeren Absatzzeile unterhalb der Tabelle.
  const allEmpty = cells.every((c) => c.contentStart === c.contentEnd);
  if (allEmpty) {
    // Tabellen-Ausstieg: leere Zeile loeschen, Cursor in eine leere
    // Absatzzeile unterhalb der Tabelle setzen.
    const lineFrom = line.from;
    // Auch das vorangehende Newline mit entfernen, sofern vorhanden, damit
    // die Tabelle nicht eine Leerzeile am Ende behaelt.
    const deleteFrom = lineFrom > 0 ? lineFrom - 1 : lineFrom;
    // R2-06 (4T-0174): Mitten im Dokument braucht der Ausstieg ZWEI
    // Newlines (Cursor dazwischen = echte leere Absatzzeile vor dem
    // Folgetext); vorher landete der Cursor direkt am Anfang des
    // Folgetexts. Am Doc-Ende reicht eines (bisheriges Verhalten).
    const hasFollowingContent = line.to < state.doc.length;
    view.dispatch({
      changes: { from: deleteFrom, to: line.to, insert: hasFollowingContent ? '\n\n' : '\n' },
      selection: { anchor: deleteFrom + 1 },
      scrollIntoView: true,
      userEvent: 'delete.line',
    });
    return true;
  }

  // Neue Tabellenzeile anhaengen.
  const newRow = buildEmptyTableRow(cells.length);
  const insertPos = line.to;
  const cursorTarget = insertPos + 1 + 2;
  view.dispatch({
    changes: { from: insertPos, insert: '\n' + newRow },
    selection: { anchor: cursorTarget },
    scrollIntoView: true,
    userEvent: 'input.table.newrow',
  });
  return true;
}

export const tableEditKeymap = Prec.high(
  keymap.of([
    { key: 'Tab', run: (view) => handleTableTab(view, 'forward') },
    { key: 'Shift-Tab', run: (view) => handleTableTab(view, 'backward') },
    { key: 'Enter', run: (view) => handleTableEnter(view) },
  ]),
);

// 4T-0020: Markdown-Linter-Light. Vier Regeln (bare-url, empty-link-text,
// missing-alt-text, broken-wiki-link), Erkennung per Regex auf den Dokument-
// Text mit syntaxTree-Schutz gegen Code-Bloecke und Markdown-Link-Knoten.
// Decorations werden als CodeMirror-StateField gehalten; ein UpdateListener
// triggert mit 300-ms-Debounce einen asynchronen Lint-Lauf, dessen Ergebnis
// per StateEffect ins Feld dispatcht wird. Tooltip via hoverTooltip mit
// lokalisiertem Inhalt.

export const LINT_DEBOUNCE_MS = 300;

// Regel 1: bare URL (http(s):// oder mailto:). Endet nicht in typischen
// trailing-Zeichen, die in Fliesstext angrenzen koennen. Schluss-Komma/
// -Klammer werden ebenfalls nicht zur URL gezaehlt, sonst werden Saetze
// wie "Siehe https://example.com, ..." kosmetisch falsch markiert.
export const LINT_BARE_URL_RE = /\b(?:https?:\/\/|mailto:)[^\s<>"`[\]()]+/g;
// Regeln 2 + 3: leere Linktexte. Gruppe 1 unterscheidet ueber den optionalen
// '!' Bild vs. Link. Wir matchen sowohl Inline-Form `[](url)` als auch
// Referenz-Form `[][ref]`.
export const LINT_EMPTY_LINK_RE = /(!?)\[\]\((\s*[^\s)]+[^)]*?)\)|(!?)\[\]\[([^\]]+)\]/g;
// Regel 4: Wiki-Link [[Ziel]] oder [[Ziel|Anzeige]].
// 4T-0068 (Epic 3E-0012): Negative-Lookbehind `(?<!!)` schliesst Embeds
// `![[...]]` aus. Sonst markiert der Wiki-Link-Linter Embed-Targets wie
// Bilder oder PDFs faelschlich als broken-wiki-link, weil das Backlinks-
// Index nur Markdown-Dateien kennt. Broken-Embed-Detection als eigene
// Linter-Regel ist Folge-Thema fuer das 1.0.0-Epic 3E-0016.
export const LINT_WIKI_RE = /(?<!!)\[\[([^\]\n|]+?)(?:\|[^\]\n]*)?\]\]/g;
// 4T-0324 (Epic 3E-0058): lokaler Markdown-Link [text](ziel) — Ziel-Extraktion
// fuer die Bereichs-Pruefung; URLs und reine Anker werden im Lauf uebersprungen.
// 4T-0476 (Epic 3E-0088): die <…>-Form als eigene Alternative (Gruppe 1), damit
// Ziele mit Leerzeichen vollständig erfasst werden statt am Blank abzubrechen;
// Gruppe 2 = klammerlose Form. %-Kodierung dekodiert resolveLocalTarget.
export const LINT_MD_LINK_RE = /(?<!!)\[[^\]\n]*\]\(\s*(?:<([^<>\n]+)>|([^)\s>]+))[^)\n]*\)/g;

export const setLintDecorations = StateEffect.define();

export const lintField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    // Bei Doc-Change Decorations leeren — ein neuer Lint-Lauf laeuft nach
    // dem Debounce und dispatcht frische Decorations. So bleiben keine
    // verrutschten Marker stehen, etwa nach Tab-Wechsel.
    let next = tr.docChanged ? Decoration.none : value;
    for (const effect of tr.effects) {
      if (effect.is(setLintDecorations)) next = effect.value;
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0061 (Epic 3E-0012): Callout-Typ-Whitelist. W-10 (4T-0310): aus der
// gemeinsamen Registry CALLOUT_TYPES (src/shared/callouts.js) abgeleitet
// statt hartkodierte Kopie — Single Source of Truth.
export const CALLOUT_TYPE_WHITELIST = new Set(Object.keys(CALLOUT_TYPES));
export const LINT_CALLOUT_HEADER_RE = /^>\s+\[!([a-z]+)\]/gm;

export const LINT_RULES = {
  bareUrl: { className: 'cm-linter-mark cm-linter-bare-url' },
  emptyLinkText: { className: 'cm-linter-mark cm-linter-empty-link-text' },
  missingAltText: { className: 'cm-linter-mark cm-linter-missing-alt-text' },
  brokenWikiLink: { className: 'cm-linter-mark cm-linter-broken-wiki-link' },
  // 4T-0054 (Epic 3E-0011): broken Heading-/Block-Anker im Wiki-Link.
  // Selbe Decoration-CSS-Klasse wie brokenWikiLink (visuell identisch),
  // eigener Regel-Identifier fuer den Tooltip (unterscheidet 'Datei
  // existiert nicht' von 'Datei existiert, Anker nicht').
  brokenWikiAnchor: { className: 'cm-linter-mark cm-linter-broken-wiki-link' },
  // 4T-0336 (Epic 3E-0061): Ordner-Pfad-Form und Unterseiten-Form zeigen
  // auf verschiedene Dateien. Selbe Decoration-CSS-Klasse wie
  // brokenWikiLink (visuell identisch), eigener Regel-Identifier fuer den
  // Tooltip.
  ambiguousWikiTarget: { className: 'cm-linter-mark cm-linter-broken-wiki-link' },
  // 4T-0061 (Epic 3E-0012): Unbekannter Callout-Typ ausserhalb der Whitelist.
  unknownCalloutType: { className: 'cm-linter-mark cm-linter-unknown-callout-type' },
  // 4T-0324 (Epic 3E-0058): Link-Ziel ausserhalb des aktiven Bereichs.
  outsideAreaLink: { className: 'cm-linter-mark cm-linter-outside-area-link' },
  // 4T-0533 (Epic 3E-0089): unpaariger %%-Kommentar-Marker (wirkt bis
  // Dokument-Ende). Generische Wellenlinie ueber cm-linter-mark; eigener
  // Regel-Identifier fuer den Tooltip.
  unpairedCommentMarker: { className: 'cm-linter-mark cm-linter-unpaired-comment' },
};

// detail (optional): Zusatz-Info fuer den Tooltip (4T-0324: der aufgeloeste
// Ziel-Pfad des Aussen-Links).
export function makeLintMark(ruleId, detail) {
  const attributes = { 'data-lint-rule': ruleId };
  if (detail) attributes['data-lint-detail'] = detail;
  return Decoration.mark({
    class: LINT_RULES[ruleId].className,
    attributes,
  });
}

// Pruefung, ob die Position innerhalb von Code-Kontext liegt (FencedCode,
// CodeBlock, InlineCode). In diesem Fall greifen die Regeln 1-4 nicht.
export function lintIsInCodeContext(state, pos) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode')
      return true;
    node = node.parent;
  }
  return false;
}

// Pruefung, ob die Position innerhalb einer Markdown-Link-Syntax oder eines
// Autolinks liegt. Verhindert false positives fuer bare-url: eine URL in
// [text](url) oder <https://...> ist kein Verstoss.
export function lintIsInLinkContext(state, pos) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === 'Link' || node.name === 'Autolink' || node.name === 'URL') return true;
    node = node.parent;
  }
  return false;
}

// 4T-0049: Pruefung, ob die Position innerhalb des YAML-Frontmatter-Blocks
// am Datei-Anfang liegt. Frontmatter ist YAML, nicht Markdown — die Linter-
// Regeln 1-4 duerfen darin nicht greifen. Beispiel: `aliases: [foo]` darf
// nicht als 'leere Wiki-Link' gemeldet werden, eine URL im 'website:'-Wert
// darf nicht als bare-url markiert werden.
export function lintIsInFrontmatter(state, pos, precomputedRange) {
  // K-04 (4T-0310): den Frontmatter-Bereich optional durchreichen (runLint
  // ermittelt ihn einmal pro Lauf statt pro Treffer).
  const range =
    precomputedRange !== undefined ? precomputedRange : detectFrontmatterLines(state.doc);
  if (!range) return false;
  const fromOffset = state.doc.line(range.fromLine).from;
  const toOffset = state.doc.line(range.toLine).to;
  return pos >= fromOffset && pos <= toOffset;
}

// Pro EditorView ein Debounce-Timer, damit Doc-Aenderungen den Lint-Lauf
// nicht haeufiger als alle LINT_DEBOUNCE_MS triggern.
export const lintTimers = new WeakMap();

export function scheduleLint(view) {
  const existing = lintTimers.get(view);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    lintTimers.delete(view);
    runLint(view);
  }, LINT_DEBOUNCE_MS);
  lintTimers.set(view, timer);
}

export async function runLint(view) {
  // View koennte zwischenzeitlich entfernt worden sein (Pane geschlossen).
  const paneIdx = paneEditors.indexOf(view);
  if (paneIdx < 0) return;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  // R2-14 (4T-0180): Im Reading-Modus ist der Editor unsichtbar — Voll-Lint
  // inkl. IPC-Roundtrip lohnt nicht. Der Nachhol-Lauf beim Wechsel in einen
  // Editor-Modus wird in syncEditorForPane angestossen.
  if (tab.viewMode === 'rendered') return;
  // 4T-0294: deaktivierte Linter-Erweiterung — bestehende Marker raeumen
  // (das Umschalten stoesst scheduleLint an) und keinen Lauf starten.
  if (!isExtensionActive('linter')) {
    view.dispatch({ effects: setLintDecorations.of(Decoration.none) });
    return;
  }
  const stateAtStart = view.state;
  const text = getDocText(stateAtStart.doc);
  // Snapshot der Doc-Laenge fuer Stale-Check beim spaeten Dispatch.
  const docLengthAtStart = stateAtStart.doc.length;

  // R2-08 (4T-0174): Syntax-Baum moeglichst vollstaendig parsen (50-ms-
  // Budget). Bei grossen Dateien ist der Baum sonst unvollstaendig und die
  // Kontext-Pruefungen (Code-Block, Frontmatter) liefern False-Positives
  // in spaeten Dokument-Teilen. Bleibt der Baum unvollstaendig, werden
  // Marker auf den geparsten Bereich begrenzt (lieber keine Meldung als
  // eine falsche); der naechste Lint-Lauf nach dem Lezer-Nachlauf raeumt auf.
  const tree = ensureSyntaxTree(stateAtStart, docLengthAtStart, 50);
  const parsedUpTo = tree ? docLengthAtStart : syntaxTree(stateAtStart).length;

  // K-04 (4T-0310): Frontmatter-Bereich einmal pro Lauf ermitteln und an die
  // Treffer-Pruefungen durchreichen (statt pro Regex-Treffer neu zu scannen).
  const fmRange = detectFrontmatterLines(stateAtStart.doc);
  const ranges = [];
  const pushRange = (from, to, ruleId, detail) => {
    if (to > parsedUpTo) return;
    if (from >= 0 && to > from && to <= docLengthAtStart) {
      ranges.push({ from, to, mark: makeLintMark(ruleId, detail) });
    }
  };

  // Regel 1: bare URLs
  for (const m of text.matchAll(LINT_BARE_URL_RE)) {
    const from = m.index;
    const to = from + m[0].length;
    if (lintIsInCodeContext(stateAtStart, from)) continue;
    if (lintIsInLinkContext(stateAtStart, from)) continue;
    if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
    pushRange(from, to, 'bareUrl');
  }

  // Regeln 2 + 3: leere Link-/Bild-Texte
  for (const m of text.matchAll(LINT_EMPTY_LINK_RE)) {
    const from = m.index;
    const to = from + m[0].length;
    if (lintIsInCodeContext(stateAtStart, from)) continue;
    if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
    const isImage = m[1] === '!' || m[3] === '!';
    pushRange(from, to, isImage ? 'missingAltText' : 'emptyLinkText');
  }

  // Regel 4 + 5: broken-wiki-link und broken-wiki-anchor. Erst alle Wiki-
  // Link-Matches im Dokument sammeln, dann genau einen IPC-Roundtrip an
  // den Main schicken, dort gegen den Backlinks-Index pruefen.
  // 4T-0054: targets enthalten jetzt auch Anker (z.B. 'Datei#Heading'
  // oder 'Datei#^block-id'). Main trennt sie selbst und prueft sowohl
  // Datei-Existenz als auch Heading-Slug bzw. Block-ID.
  // 4T-0294: Wiki-Regeln nur bei aktiver Wiki-Link-Erweiterung — ohne sie
  // ist `[[Ziel]]` regulaerer Text, ein Broken-Link-Marker waere falsch.
  const wikiMatches = [];
  if (isExtensionActive('wiki-links'))
    for (const m of text.matchAll(LINT_WIKI_RE)) {
      const from = m.index;
      const to = from + m[0].length;
      if (lintIsInCodeContext(stateAtStart, from)) continue;
      if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
      // 4T-0067 (Epic 3E-0012): In Tabellen-Zellen muss das Pipe als `\|`
      // escapet werden, damit der Tabellen-Parser es nicht als Spaltentrenner
      // sieht. Der Original-Regex stoppt am ersten Pipe und nimmt das
      // Backslash davor mit ins Target — das wird hier wieder abgeschnitten.
      const target = (m[1] || '').replace(/\\$/, '').trim();
      if (!target) continue;
      wikiMatches.push({ from, to, target });
    }
  // Regel 7 (4T-0324, Epic 3E-0058): Link-Ziele ausserhalb des Bereichs
  // (nur in Bereichs-Apps). Wiki-Links werden doc-relativ aufgeloest
  // (Index-/Alias-Fallbacks zielen in den Dokument-Baum und bleiben aussen
  // vor); Markdown-Links relativ oder absolut. Aussen markierte Wiki-Spans
  // werden von der Broken-Pruefung uebersprungen (ein Marker pro Link).
  const outsideWikiSpans = new Set();
  if (state.areaPath && tab.path) {
    for (const w of wikiMatches) {
      const filePart = w.target.split('#')[0].trim();
      if (!filePart) continue;
      const withExt = /\.[a-z0-9]+$/i.test(filePart) ? filePart : `${filePart}.md`;
      const resolved = resolveLocalTarget(tab.path, withExt);
      if (resolved && isOutsideActiveArea(resolved)) {
        outsideWikiSpans.add(w.from);
        pushRange(w.from, w.to, 'outsideAreaLink', resolved);
      }
    }
    for (const m of text.matchAll(LINT_MD_LINK_RE)) {
      // 4T-0476: Gruppe 1 = <…>-Form (Leerzeichen erlaubt), Gruppe 2 = klammerlos.
      const target = ((m[1] !== undefined ? m[1] : m[2]) || '').trim();
      if (!target || target.startsWith('#') || /^[a-z]{2,}:/i.test(target)) continue;
      const from = m.index;
      const to = from + m[0].length;
      if (lintIsInCodeContext(stateAtStart, from)) continue;
      if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
      const resolved = resolveLocalTarget(tab.path, target);
      if (resolved && isOutsideActiveArea(resolved)) {
        pushRange(from, to, 'outsideAreaLink', resolved);
      }
    }
  }

  if (wikiMatches.length > 0 && tab.path) {
    const targets = [...new Set(wikiMatches.map((w) => w.target))];
    try {
      const result = await api.resolveWikiTargets(tab.path, targets);
      if (result && result.status === 'ready') {
        const existingSet = new Set(result.existing || []);
        const brokenAnchorSet = new Set(result.brokenAnchor || []);
        // 4T-0336 (Epic 3E-0061): mehrdeutige Ziele (Ordner-Pfad- und
        // Unterseiten-Form treffen verschiedene Dateien).
        const ambiguousSet = new Set(result.ambiguous || []);
        for (const w of wikiMatches) {
          if (outsideWikiSpans.has(w.from)) continue;
          if (ambiguousSet.has(w.target)) {
            pushRange(w.from, w.to, 'ambiguousWikiTarget');
            continue;
          }
          if (existingSet.has(w.target)) continue;
          if (brokenAnchorSet.has(w.target)) {
            // 4T-0054: Datei existiert, aber Heading-/Block-Anker nicht.
            pushRange(w.from, w.to, 'brokenWikiAnchor');
          } else {
            pushRange(w.from, w.to, 'brokenWikiLink');
          }
        }
      }
      // Bei 'indexing' / 'unavailable': Regel 4/5 wird in diesem Lauf
      // unterdrueckt, die anderen drei Regeln werden trotzdem angewendet.
    } catch {
      // IPC-Fehler ignorieren; Regel 4/5 entfaellt fuer diesen Lauf.
    }
  }

  // Regel 6 (4T-0061): unbekannter Callout-Typ. Header-Regex matcht den Typ-
  // Slug aus `> [!type]`; wenn der Typ nicht in der Whitelist steht, wird der
  // Slug-Bereich markiert. Wird in Code- und Frontmatter-Kontext unterdrueckt.
  // 4T-0294: nur bei aktiver Callout-Erweiterung — ohne sie ist der
  // Header regulaerer Blockquote-Text, ein Typ-Marker waere falsch.
  LINT_CALLOUT_HEADER_RE.lastIndex = 0;
  if (isExtensionActive('callouts'))
    for (const m of text.matchAll(LINT_CALLOUT_HEADER_RE)) {
      const type = m[1];
      if (CALLOUT_TYPE_WHITELIST.has(type)) continue;
      // Markierter Bereich: nur der Typ-Slug innerhalb der eckigen Klammern.
      const slugFrom = m.index + m[0].indexOf(type);
      const slugTo = slugFrom + type.length;
      if (lintIsInCodeContext(stateAtStart, slugFrom)) continue;
      if (lintIsInFrontmatter(stateAtStart, slugFrom, fmRange)) continue;
      pushRange(slugFrom, slugTo, 'unknownCalloutType');
    }

  // Regel 8 (4T-0533, Epic 3E-0089): unpaariger %%-Kommentar-Marker. Ein
  // oeffnendes %% ohne Schliessung blendet den gesamten Dokument-Rest aus
  // allen Ansichten und Exporten aus — der Hinweis sitzt am Entstehungsort
  // (nur die zwei Marker-Zeichen). Bereiche kommen aus dem geteilten,
  // code- und frontmatter-bewussten Scanner (computeCommentRanges, pro
  // Doc-Version gecacht); eigene Kontext-Checks entfallen deshalb. Nur bei
  // aktiver comments-Erweiterung — ohne sie ist %% Literal.
  if (isExtensionActive('comments')) {
    for (const r of computeCommentRanges(stateAtStart.doc)) {
      if (r.closed) continue;
      pushRange(r.from, r.from + 2, 'unpairedCommentMarker');
    }
  }

  // Stale-Check: wenn das Dokument inzwischen veraendert wurde, sind die
  // gesammelten Positionen ggf. ungueltig. Dann verwerfen wir das Ergebnis;
  // ein neuer Lauf ist eh schon ueber den UpdateListener angestossen.
  // R2-09 (4T-0174): Doc-Identitaet statt Laenge — CM6-Docs sind immutabel,
  // jede Aenderung erzeugt eine neue Instanz. Der Laengen-Vergleich liess
  // laengengleiche Aenderungen waehrend des IPC-awaits durch (falsch
  // platzierte Marker).
  if (paneEditors.indexOf(view) < 0) return;
  if (view.state.doc !== stateAtStart.doc) return;

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const set = Decoration.set(ranges.map((r) => r.mark.range(r.from, r.to)));
  view.dispatch({ effects: setLintDecorations.of(set) });
}

// UpdateListener triggert Debounce-Lauf bei Doc-Aenderungen.
export const lintUpdateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged) scheduleLint(update.view);
});

// Hover-Tooltip mit lokalisiertem Inhalt. Sucht an der Hover-Position die
// erste Lint-Marker-Decoration und baut daraus einen kleinen DOM-Tooltip.
export const lintHoverTooltip = hoverTooltip((view, pos) => {
  const decoSet = view.state.field(lintField, false);
  if (!decoSet) return null;
  let hit = null;
  decoSet.between(Math.max(0, pos - 1), pos + 1, (from, to, value) => {
    const ruleId = value.spec && value.spec.attributes && value.spec.attributes['data-lint-rule'];
    if (!ruleId) return;
    // 4T-0324: optionale Zusatz-Info (aufgeloester Ziel-Pfad).
    const detail = value.spec && value.spec.attributes && value.spec.attributes['data-lint-detail'];
    hit = { from, to, ruleId, detail };
    return false;
  });
  if (!hit) return null;
  const target = view.state.doc.sliceString(hit.from, hit.to);
  return {
    pos: hit.from,
    end: hit.to,
    above: true,
    create() {
      return { dom: buildLintTooltipDom(hit.ruleId, target, hit.detail) };
    },
  };
});

export function buildLintTooltipDom(ruleId, target, detail) {
  const dom = document.createElement('div');
  dom.className = 'cm-linter-tooltip';
  const title = document.createElement('div');
  title.className = 'cm-linter-tooltip-title';
  title.textContent = t(`linter.${ruleId}.short`);
  dom.appendChild(title);
  const desc = document.createElement('div');
  desc.className = 'cm-linter-tooltip-desc';
  let text = t(`linter.${ruleId}.tooltip`);
  if (
    ruleId === 'brokenWikiLink' ||
    ruleId === 'brokenWikiAnchor' ||
    ruleId === 'ambiguousWikiTarget'
  ) {
    const cleaned = target
      .replace(/^\[\[|\]\]$/g, '')
      .split('|')[0]
      .trim();
    text = text.replace('{target}', cleaned);
  } else if (ruleId === 'unknownCalloutType') {
    text = text.replace('{type}', target);
  } else if (ruleId === 'outsideAreaLink') {
    // 4T-0324: voller aufgeloester Ziel-Pfad aus dem Marker-Detail.
    text = text.replace('{target}', detail || target);
  }
  desc.textContent = text;
  dom.appendChild(desc);
  return dom;
}

// 4T-0603 (Epic 3E-0113): Paste-Handler Link-Einfügen in die Auswahl. Bei
// nicht-leerer Auswahl und einer als URL erkannten Zwischenablage entsteht ein
// Markdown-Link [Auswahl](URL) statt des ersetzten Texts. Konservativ: nur bei
// aktivem Schalter (state.pasteUrlAsLink, Default an), einfacher Auswahl,
// eindeutiger URL und außerhalb von Code-Kontexten; sonst fällt der Handler auf
// das Standard-Einfügen zurück (Rückgabe false). Ein dispatch = ein Undo-
// Schritt. Voraussetzung ist, dass der eingebaute lang-markdown-Paste-Handler
// per pasteURLAsLink: false abgeschaltet ist (siehe markdown()-Aufrufe), sonst
// würde er zuerst greifen.
//
// Strg+Umschalt+V ist reines Einfügen und darf keinen Link erzeugen. Das
// paste-Ereignis trägt den Umschalt-Zustand nicht (nachgemessen: nur der
// vorausgehende keydown kennt ihn), deshalb merkt sich der keydown-Zweig bei
// jedem Strg/Cmd+V, ob Umschalt gedrückt war. Der Wert wird im paste sofort
// zurückgesetzt; ein hängen gebliebener Zustand (Tastendruck ohne folgendes
// Einfügen) korrigiert sich mit dem nächsten V-Tastendruck.
let pasteMatchStyle = false;

// 4T-0642 / 4T-0789 (Epic 3E-0125): Anlagen ablegen und den Verweis an einer
// Position einsetzen. Gemeinsame Strecke beider Eingabewege; das Ablegen
// selbst liegt im Modul attachments.js, der Ort im Hauptprozess.
//
// `pos` ist die Ziel-Position im Dokument; ohne Angabe steht der Verweis an der
// Schreibmarke. Ein einzelner dispatch bedeutet EINEN Undo-Schritt, auch bei
// mehreren Anlagen. Das Zuruecknehmen entfernt nur den Verweis; die abgelegte
// Datei bleibt liegen (im Handbuch erwaehnt).
export async function fuegeAnlagenEin(view, anlagen, pos) {
  const paneIdx = paneEditors.indexOf(view);
  const pane = paneIdx >= 0 ? state.panes[paneIdx] : null;
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const markdown = await legeAnlagenAb(anlagen, (tab && tab.path) || '');
  if (!markdown) return false;
  // Der Editor kann sich waehrend des Ablegens veraendert haben; die Position
  // wird deshalb erst jetzt gegen die aktuelle Laenge geklemmt.
  const laenge = view.state.doc.length;
  const sel = view.state.selection.main;
  const ziel = Math.max(0, Math.min(typeof pos === 'number' ? pos : sel.from, laenge));
  const ersetzeBis = typeof pos === 'number' ? ziel : Math.min(sel.to, laenge);
  view.dispatch({
    changes: { from: ziel, to: ersetzeBis, insert: markdown },
    selection: { anchor: ziel + markdown.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
  return true;
}

// 4T-0790 (Epic 3E-0125): Doppelklick auf ein Bild oeffnet es in der
// Standardanwendung. Im Editor gilt bewusst der DOPPELklick und nicht der
// einfache (PO-Festlegung 2026-07-29): Der einfache Klick setzt hier die
// Schreibmarke, und wer neben einem Bild weiterschreiben will, darf dabei
// keine fremde Anwendung starten. In der Render-Ansicht, wo es keine
// Schreibmarke gibt, genuegt der einfache Klick (views.js).
//
// Praktisch betrifft das den Live-Modus, weil nur dort Bilder als Widget
// erscheinen; im reinen Quelltext steht ihre Markdown-Zeile.
const imageOpenHandler = EditorView.domEventHandlers({
  // 4T-0789 (Epic 3E-0125), Befund des Product Owners aus der Test-Iteration:
  // Der Zieh-Weg gehoert IN den Editor und nicht nur an das Fenster.
  //
  // Das eingesetzte Editor-Modul bringt einen eigenen drop-Handler mit, der
  // eine gezogene Datei per FileReader als TEXT liest und ihren Inhalt ins
  // Dokument schreibt. Der Fenster-Handler lief danach und haengte den Verweis
  // an, sodass beides im Dokument stand: erst der Verweis, dann der komplette
  // Datei-Inhalt. Sichtbar wurde das bei einer Textdatei; bei einem Bild blieb
  // es unbemerkt, weil der Lese-Versuch dort nichts Brauchbares ergibt.
  //
  // Eigene domEventHandlers laufen VOR den eingebauten, und ein `true` bricht
  // die Kette ab — der eingebaute Handler kommt damit nicht mehr zum Zug.
  // stopPropagation hindert zusaetzlich den Fenster-Handler daran, dieselbe
  // Anlage ein zweites Mal abzulegen.
  drop(event, view) {
    if (!event.dataTransfer) return false;
    if (!Array.from(event.dataTransfer.types).includes('Files')) return false;
    const anlagen = anlagenAusDataTransfer(event.dataTransfer);
    if (anlagen.length === 0) return false;
    event.stopPropagation();
    if (view.state.readOnly) {
      // Ablegen ist ein Schreibvorgang; im Lese-Zustand unterbleibt er, wie
      // beim Einfuegen auch. Das Ereignis wird dennoch verbraucht, damit der
      // eingebaute Handler den Datei-Inhalt nicht doch noch einliest.
      return true;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    void fuegeAnlagenEin(view, anlagen, pos ?? view.state.doc.length);
    return true;
  },
  dblclick(event, view) {
    const ziel = event.target;
    if (!(ziel instanceof HTMLImageElement)) return false;
    const quelle = ziel.getAttribute('data-src-original') || '';
    if (!quelle || /^(https?:|data:)/i.test(quelle)) return false;
    const paneIdx = paneEditors.indexOf(view);
    if (paneIdx < 0) return false;
    event.preventDefault();
    void oeffneBildAusQuelle(paneIdx, quelle);
    return true;
  },
});

const pasteLinkHandler = EditorView.domEventHandlers({
  keydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyV') {
      pasteMatchStyle = event.shiftKey;
    }
    return false;
  },
  paste(event, view) {
    const matchStyle = pasteMatchStyle;
    pasteMatchStyle = false;
    if (matchStyle) return false;
    if (view.state.readOnly) return false;

    // 4T-0642 (Epic 3E-0125): Anlagen-Zweig VOR der URL-in-Auswahl-Pruefung.
    // Eine Zwischenablage mit Datei-Inhalt ist kein Text-Fall, und der Zweig
    // haengt bewusst NICHT am Schalter pasteUrlAsLink — das ist eine andere
    // Einstellung mit anderer Bedeutung.
    //
    // Strg+Umschalt+V bleibt unberuehrt: Der matchStyle-Merker oben hat den
    // Handler dann schon verlassen, reines Einfuegen legt also nichts ab.
    const anlagen = anlagenAusDataTransfer(event.clipboardData);
    if (anlagen.length > 0) {
      event.preventDefault();
      // Das Ablegen ist asynchron, das Ereignis nicht. Deshalb sofort
      // abbrechen und die Einfuegung nachziehen, sobald die Dateien liegen.
      void fuegeAnlagenEin(view, anlagen);
      return true;
    }

    if (state.pasteUrlAsLink === false) return false;
    const sel = view.state.selection.main;
    if (sel.empty) return false;
    const clip = event.clipboardData && event.clipboardData.getData('text/plain');
    const url = detectPasteUrl(clip);
    if (!url) return false;
    if (positionInsideCode(view.state, sel.from) || positionInsideCode(view.state, sel.to)) {
      return false;
    }
    const r = insertExternalLink(getDocText(view.state.doc), sel.from, sel.to, url);
    event.preventDefault();
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: r.insert },
      selection: { anchor: r.selFrom, head: r.selTo },
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
    return true;
  },
});

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
      // 4T-0603 (Epic 3E-0113): eingebauten lang-markdown-Paste-Handler
      // abschalten, damit der eigene pasteLinkHandler mit unseren Regeln
      // (Spitze-Klammern, Schalter, Code-Schutz) allein greift.
      markdown({ extensions: [LezerTable], pasteURLAsLink: false }),
      syntaxHighlighting(mdHighlightStyle, { fallback: true }),
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
  const currentDoc = getDocText(view.state.doc);
  if (currentDoc !== (tab.content || '')) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tab.content || '' },
    });
  }
  view.dispatch({
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

// 4T-0653: Laeuft im Render-Pane gerade eine Inline-Bearbeitung, darf der
// Vorschau-Aufbau nicht dazwischenfahren. renderPreviewForPane ersetzt das
// innerHTML der Pane vollstaendig und nimmt dabei die Eingabefelder mit.
// Betroffen sind die Zeilen-Bearbeitung der Ereignis-Tabelle (tr.pev-editing)
// und die Zellen-Bearbeitung der Datentabelle (.pdt-editing).
function hasOpenInlineEdit(paneIdx) {
  const els = getPaneEls(paneIdx);
  const root = els && els.renderedHtml;
  return !!(root && root.querySelector('tr.pev-editing, .pdt-editing'));
}

// 4T-0653: Bricht einen geplanten Vorschau-Aufbau ab. Fuer Komponenten, die
// ins Dokument schreiben und die Pane anschliessend SELBST synchron neu
// rendern (Ereignis-Fence, Datentabelle). Deren Schreib-Vorgang plant ueber
// den Dokument-Listener einen zweiten, verzoegerten Aufbau, der dieselbe
// Vorschau nochmal baut. Das ist nicht nur doppelte Arbeit: Er trifft
// verzoegert in eine laufende Bedienung und ersetzt das DOM unter ihr,
// woran zuvor die Zeilen-Bearbeitung (EV-03) und das Loeschen gespeicherter
// Filter (EV-06) unter Last scheiterten.
export function cancelPendingPreviewUpdate(paneIdx) {
  if (pendingPreviewTimers[paneIdx]) {
    clearTimeout(pendingPreviewTimers[paneIdx]);
    pendingPreviewTimers[paneIdx] = null;
  }
}

export function schedulePreviewUpdate(paneIdx) {
  if (pendingPreviewTimers[paneIdx]) clearTimeout(pendingPreviewTimers[paneIdx]);
  // R2-12 (4T-0180): adaptiver Debounce — der Voll-Render kostet bei
  // grossen Dokumenten zweistellige Millisekunden pro Lauf; seltener
  // rendern haelt die Eingabe-Latenz im Split-Modus stabil.
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const len = tab && tab.content ? tab.content.length : 0;
  const delay = len > 400000 ? 600 : len > 100000 ? 350 : 150;
  pendingPreviewTimers[paneIdx] = setTimeout(() => {
    pendingPreviewTimers[paneIdx] = null;
    // 4T-0653: Aufbau aufschieben statt die offene Bearbeitung zu zerstoeren.
    // Das Bestaetigen einer Ereignis-Zeile schreibt selbst ins Dokument und
    // plant damit genau den Aufbau, der die naechste Bearbeitung getroffen
    // haette. Sobald die Bearbeitung endet, laeuft der Aufbau nach; das
    // Rueckschreiben rendert die Pane ohnehin sofort selbst.
    if (hasOpenInlineEdit(paneIdx)) {
      schedulePreviewUpdate(paneIdx);
      return;
    }
    renderPreviewForPane(paneIdx);
  }, delay);
}

export function renderPreviewForPane(paneIdx) {
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  const els = getPaneEls(paneIdx);
  if (!els.renderedHtml) return;
  // R2-12 (4T-0180): fertig geladene PDF-Embed-Knoten zwischen zwei
  // Preview-Renders wiederverwenden — der Voll-DOM-Ersatz wuerde das
  // <embed> sonst bei jedem Tipp-Render neu laden (sichtbares Flackern,
  // PDF-Plugin-Reload). Reuse nur bei unveraendertem basePath; Schluessel
  // ist embedPath plus Breiten-Attribut.
  const oldPdfEmbeds = new Map();
  if (els.renderedHtml.dataset.previewBase === (tab.path || '')) {
    for (const span of els.renderedHtml.querySelectorAll(
      '.wiki-embed-processed[data-embed-kind="pdf"]',
    )) {
      const key = `${span.dataset.embedPath}|${span.dataset.embedWidth || ''}`;
      if (!oldPdfEmbeds.has(key)) oldPdfEmbeds.set(key, span);
    }
  }
  els.renderedHtml.dataset.previewBase = tab.path || '';
  els.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
  if (oldPdfEmbeds.size > 0) {
    for (const span of els.renderedHtml.querySelectorAll(
      '.wiki-embed[data-embed-kind="pdf"]:not(.wiki-embed-processed)',
    )) {
      const key = `${span.dataset.embedPath}|${span.dataset.embedWidth || ''}`;
      const old = oldPdfEmbeds.get(key);
      if (old) {
        span.replaceWith(old);
        oldPdfEmbeds.delete(key);
      }
    }
  }
  // R2-13/R5-07 (4T-0179): vereinheitlichte Render-Nachverarbeitung
  // (enthaelt seit 4T-0324 auch die Aussen-Link-Warnung der Bereichs-Apps).
  applyRenderPipeline(els.renderedHtml, tab.path);
  // R4-12 (4T-0180): Render-Skip-Cache nachfuehren — das DOM entspricht
  // jetzt diesem Tab-Stand, der naechste renderPaneContent kann skippen.
  notePaneRendered(paneIdx, tab);
  // 4T-0014: Aktive Outline-Sektion neu ermitteln, weil DOM-Heading-Knoten
  // im Render-Pane jetzt frische BoundingClientRects haben.
  if (state.outline && state.outline.visibleByPane[paneIdx]) {
    scheduleOutlineActiveUpdate(paneIdx);
  }
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
  const suffix = buildTitleSuffix(
    {
      // 4T-0538 (Epic 3E-0098): bei deaktivierter Erweiterung entfaellt der
      // Arbeitsbereichs-Teil (die App erscheint als normale Applikation).
      workspaceName: isExtensionActive('workspaces') ? state.workspaceName : null,
      areaName: state.areaName,
      appNumber: state.appNumber,
      numberedAppCount: state.numberedAppCount,
      displayNumber: state.displayNumber,
      totalWindowCount: state.totalWindowCount,
    },
    t,
  );
  document.title = base + suffix;

  // Aktive Tab-Anzahl ueber alle Panes hinweg.
  let tabCount = 0;
  for (const pane of state.panes) tabCount += pane.tabs.length;
  if (api && typeof api.notifyWindowMeta === 'function') {
    api.notifyWindowMeta({ activeTabName: name, tabCount });
  }
}
