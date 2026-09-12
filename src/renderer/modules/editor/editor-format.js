// 4T-000378 / 4T-000379 (Epic 3E-000071): Ausführung der Format-, Link-, Absatz- und
// Einfüge-Kommandos auf dem CodeMirror-Dokument. Ein Ausführungs-Pfad für beide
// Zugänge: EDITOR_COMMAND_FUNCTIONS in editor.js (Hotkey über die commandKeymap)
// und die Kontextmenü-Anbindung in editor-context-menu.js (Klick). Die reinen
// Text-Transformationen liegen in src/shared/markdown-format.js.
'use strict';

import { getDocText } from '../app/api.js';
// 4T-000498 (Epic 3E-000090): Erstellt-Automatik der Erweiterung "Aufgaben"
// beim Umwandeln einer Zeile in eine Task-Zeile.
import { withCreatedDate } from '../tasks.js';
import {
  applyInlineFormat,
  clearInlineFormats,
  insertWikiLink,
  insertExternalLink,
  isProtectedForFormatting,
  toggleListType,
  setHeadingLevel,
  toggleQuote,
  detectParagraphState,
  insertFootnote,
  insertTable,
  insertPerspectiveTable,
  insertTableOfSize,
  insertCallout,
  insertHorizontalRule,
  insertCodeBlock,
  insertCanvas,
} from '../../../shared/markdown-format.js';

// Wendet ein reines Transformations-Ergebnis (Zeichen-Format oder Link) auf die
// Haupt-Selektion der View an. Im Read-only-Editor wirkungslos (programmatische
// Dispatches umgehen EditorState.readOnly nicht von selbst — expliziter Guard
// wie bei edit.insertTimestamp). Mit guard = true bleibt die Aktion zudem
// folgenlos, wenn die Selektion in einem Wiki-Link-Ziel oder Inline-Quelltext
// liegt, wo Marker die Struktur zerstören würden; „Formatierung entfernen"
// nutzt guard = false, damit es dort im Gegenteil aufräumen kann.
function dispatchFormat(view, compute, { guard = true } = {}) {
  if (!view || view.state.readOnly) return false;
  const text = getDocText(view.state.doc);
  const { from, to } = view.state.selection.main;
  if (guard && isProtectedForFormatting(text, from, to)) {
    view.focus();
    return false;
  }
  const r = compute(text, from, to);
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: r.insert },
    selection: { anchor: r.selFrom, head: r.selTo },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}

function makeFormatCommand(formatId) {
  return (view) =>
    dispatchFormat(view, (text, from, to) => applyInlineFormat(text, from, to, formatId));
}

// 4T-000379: Absatz-Aktion — transformiert alle Zeilen der Selektion (bzw. die
// Cursor-Zeile) über eine reine Zeilen-Funktion und hält die Selektion auf dem
// transformierten Bereich.
function dispatchLineTransform(view, transform) {
  if (!view || view.state.readOnly) return false;
  const { from, to } = view.state.selection.main;
  const firstLine = view.state.doc.lineAt(from);
  const lastLine = view.state.doc.lineAt(to);
  const lines = [];
  for (let n = firstLine.number; n <= lastLine.number; n++) {
    lines.push(view.state.doc.line(n).text);
  }
  const insert = transform(lines).join('\n');
  view.dispatch({
    changes: { from: firstLine.from, to: lastLine.to, insert },
    selection: { anchor: firstLine.from, head: firstLine.from + insert.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}

function makeParagraphCommand(transform) {
  return (view) => dispatchLineTransform(view, transform);
}

// 4T-000379: Einfüge-Aktion — eine reine Schablonen-Funktion liefert die
// CodeMirror-Änderungen (ggf. mehrere) und die Cursor-/Selektions-Position.
function dispatchInsert(view, compute) {
  if (!view || view.state.readOnly) return false;
  const text = getDocText(view.state.doc);
  const pos = view.state.selection.main.head;
  const r = compute(text, pos);
  view.dispatch({
    changes: r.changes,
    selection: { anchor: r.selFrom, head: r.selTo },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}

// 4T-001682 (Epic 3E-000287): Der Statusleisten-Hinweis kommt über einen
// Laufzeit-Import (Muster canvas-pane.js und live-table-zelle.js). Ein
// statischer Bezug auf `views.js` zöge diese Datei in die große
// Import-Zyklen-Komponente des Renderers — views.js führt über editor.js und
// editor-keymaps.js hierher zurück —, und der Ordner-Import-Wächter ist eine
// Ratsche. Ein Fehlschlag bleibt folgenlos: Der Hinweis ist Beiwerk, das
// Unterlassen der Einfügung ist die eigentliche Wirkung und schon geschehen.
function zeigeHinweis(schluessel) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(schluessel, { error: true, duration: 3000 }))
    .catch(() => {});
}

// 4T-001682: Einfüge-Kommando der Canvas-Fläche.
//
// Derselbe Dispatch-Pfad wie die übrigen Einfüge-Schablonen (eine
// Transaktion, `userEvent: 'input'`, Undo nimmt die Fläche in einem Schritt
// zurück — AK5). Der eine Unterschied zum Nachbarn ist der **gesagte**
// Fehlschlag: Ohne Editor oder in einem nicht änderbaren Dokument bleibt das
// Kommando wirkungslos und sagt es (AK4, Guard-Muster `insertEventsBlock`).
// Ein stiller Fehlschlag wäre für den Anwender nicht von einem Fehler zu
// unterscheiden, und anders als bei Fußnote oder Tabelle ist die Canvas das
// Konstrukt, mit dem er zum ersten Mal überhaupt zu einer Fläche kommt.
function insertCanvasCommand(view) {
  if (!view || view.state.readOnly) {
    zeigeHinweis('canvas.keinEditor');
    return false;
  }
  return dispatchInsert(view, insertCanvas);
}

// 4T-000379: Absatz-Zustand der Cursor-Zeile für die Häkchen im Absatz-Submenü.
export function getParagraphState(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return detectParagraphState(line.text);
}

// 4T-000608 (Epic 3E-000114): parametrisiertes Tabellen-Einfügen des Raster-
// Pickers der Format-Toolbar — derselbe Dispatch-Pfad wie insert.table
// (ein dispatch, Undo nimmt die Tabelle in einem Schritt zurück).
export function insertTableSized(view, rows, cols) {
  return dispatchInsert(view, (text, pos) => insertTableOfSize(text, pos, rows, cols));
}

// Kommando-ID -> CodeMirror-Command (view) => boolean. Wird von editor.js in
// EDITOR_COMMAND_FUNCTIONS gemerged und vom Kontextmenü direkt aufgerufen.
export const FORMAT_COMMANDS = {
  // 4T-000378: Zeichen-Formate und Links.
  'format.bold': makeFormatCommand('bold'),
  'format.italic': makeFormatCommand('italic'),
  'format.strikethrough': makeFormatCommand('strikethrough'),
  'format.highlight': makeFormatCommand('highlight'),
  'format.code': makeFormatCommand('code'),
  'format.math': makeFormatCommand('math'),
  'format.comment': makeFormatCommand('comment'),
  'format.clear': (view) => dispatchFormat(view, clearInlineFormats, { guard: false }),
  'link.insertWiki': (view) => dispatchFormat(view, insertWikiLink),
  'link.insertExternal': (view) => dispatchFormat(view, insertExternalLink),
  // 4T-000379: Absatz-Aktionen.
  'paragraph.bulletList': makeParagraphCommand((l) => toggleListType(l, 'bullet')),
  'paragraph.orderedList': makeParagraphCommand((l) => toggleListType(l, 'ordered')),
  // 4T-000498 (Epic 3E-000090): beim Umwandeln IN eine Task-Zeile haengt die
  // Erstellt-Automatik der Erweiterung "Aufgaben" das Erstellt-Datum an
  // (withCreatedDate prueft Erweiterung, Schalter und Global Filter
  // selbst; der Rueckweg — Task-Zeile zu Bullet — bleibt unberuehrt).
  'paragraph.taskList': makeParagraphCommand((l) =>
    toggleListType(l, 'task').map((line) => withCreatedDate(line)),
  ),
  'paragraph.heading1': makeParagraphCommand((l) => setHeadingLevel(l, 1)),
  'paragraph.heading2': makeParagraphCommand((l) => setHeadingLevel(l, 2)),
  'paragraph.heading3': makeParagraphCommand((l) => setHeadingLevel(l, 3)),
  'paragraph.heading4': makeParagraphCommand((l) => setHeadingLevel(l, 4)),
  'paragraph.heading5': makeParagraphCommand((l) => setHeadingLevel(l, 5)),
  'paragraph.heading6': makeParagraphCommand((l) => setHeadingLevel(l, 6)),
  'paragraph.noHeading': makeParagraphCommand((l) => setHeadingLevel(l, 0)),
  'paragraph.quote': makeParagraphCommand(toggleQuote),
  // 4T-000379: Einfüge-Schablonen.
  'insert.footnote': (view) => dispatchInsert(view, insertFootnote),
  'insert.table': (view) => dispatchInsert(view, insertTable),
  'insert.perspectiveTable': (view) => dispatchInsert(view, insertPerspectiveTable),
  'insert.callout': (view) => dispatchInsert(view, insertCallout),
  'insert.horizontalRule': (view) => dispatchInsert(view, insertHorizontalRule),
  'insert.codeBlock': (view) => dispatchInsert(view, insertCodeBlock),
  // 4T-001682 (Epic 3E-000287): leere Canvas-Fläche an der Schreibmarke.
  'insert.canvas': insertCanvasCommand,
};
