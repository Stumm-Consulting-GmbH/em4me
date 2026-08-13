// Kommando-Tabellen und Tastenbelegungen des Editors: Registry-Keymap der
// editorScoped-Kommandos, Listen-Komfort, Schreibschutz-Wache, Listen-Ausstieg
// und Tabellen-Komfort.
//
// Auszug aus editor.js, 4T-1002 (Epic 3E-0196). Die Belegungen sind einmalige
// Extension-Werte und leben ausschliesslich hier; ihre Praezedenz-Zusagen
// stehen unveraendert an der jeweiligen Belegung, die Reihenfolge des Einbaus
// unveraendert in createEditorState.
'use strict';

import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { foldAll, foldCode, syntaxTree, unfoldAll, unfoldCode } from '@codemirror/language';
import { indentLess, indentMore } from '@codemirror/commands';
// 4T-0207 (Epic 3E-0015): Editor-Keymap (Fold-Kommandos) aus der Kommando-
// Registry statt des pauschalen foldKeymap; Bindings damit konfigurierbar.
import { COMMANDS, mergeBindings } from '../../../shared/commands/commands.js';
import { acceleratorToCmKey } from '../../../shared/commands/command-bindings.js';
// 4T-0292 (Epic 3E-0052): Kommandos deaktivierter Erweiterungen auch aus
// der Editor-Keymap filtern (Muster der Dispatcher-Map in app-init.js).
import { disabledCommandIdSet } from '../../../shared/extensions/extensions-core.js';
import { getDisabledExtensionIds, isExtensionActive } from '../extensions/extension-lifecycle.js';
import { state } from '../app/app-state.js';
import {
  buildEmptyTableRow,
  findCellAt,
  findUnescapedPipes,
  isTableLine,
  parseTableCells,
} from '../../../shared/markdown/table-edit.js';
// 4T-0599 (Epic 3E-0112): Struktur-Kern der Listen-Bearbeitung plus sein
// Laufzeit-Backend (Nutzung nur in Funktionskörpern).
import { LIST_INDENT_STEP, LIST_LINE_RE } from '../../../shared/markdown/list-outline.js';
import {
  runListExit,
  runListIndentSubtree,
  runListMove,
  runListSelectSubtree,
} from './editor-list-tools.js';
// 4T-0590 (Epic 3E-0109): Laufzeit-Backend der table.*-Kommandos (Nutzung
// nur in Funktionskörpern, Laufzeit-Zyklus unkritisch).
import { runTableCommand } from './editor-table-tools.js';
// 4T-0378 (Epic 3E-0071): Format-/Link-Kommando-Funktionen für die Editor-
// Keymap (Hotkey-Pfad); dasselbe FORMAT_COMMANDS speist das Kontextmenü.
// editor-format.js importiert nicht zurueck, der Spread unten darf deshalb
// bereits zur Lade-Zeit lesen.
import { FORMAT_COMMANDS } from './editor-format.js';

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

/**
 * Baut die Keymap der editorScoped-Kommandos aus Registry-Defaults und
 * Nutzer-Belegungen; Kommandos abgeschalteter Erweiterungen bleiben ohne
 * Bindung.
 *
 * @returns {import('@codemirror/state').Extension} Keymap-Extension.
 */
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

/**
 * Liegt die Zeile in einem Code-Block (FencedCode oder CodeBlock)?
 *
 * @param {import('@codemirror/state').EditorState} state Editor-Zustand.
 * @param {{from: number}} line Zeilen-Objekt des Dokuments.
 * @returns {boolean} true innerhalb eines Code-Blocks.
 */
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

/**
 * Springt mit Tab/Umschalt+Tab zwischen den Zellen einer Pipe-Tabelle und
 * haengt hinter der letzten Zelle eine neue Tabellenzeile an.
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @param {'forward'|'backward'} direction Sprung-Richtung.
 * @returns {boolean} true, wenn der Tastendruck verbraucht wurde.
 */
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

/**
 * Erzeugt mit Enter am Zeilenende eine neue Tabellenzeile; bei vollstaendig
 * leerer Zeile steigt die Schreibmarke aus der Tabelle aus.
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @returns {boolean} true, wenn der Tastendruck verbraucht wurde.
 */
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
