// 4T-001716 (Epic 3E-000301): Eigene Eingabe-Behandlung in Listen — die eine
// Heimat nach E11 des Epics. Hier steht der Zeilenumbruch im Listenpunkt
// (Kommando `list.lineBreak`, Vorgabe Umschalt+Eingabe) und das Aufräumen
// einer leer gebliebenen Folgezeile; dazu die eigene Eingabetaste in Listen
// `runListEnter` (4T-001862, 4T-001977).
//
// **Umbruch-Form** ist der Rückstrich am Zeilenende (E10 des Epics). Die
// Folgezeile wird bis zur Inhalts-Spalte des Punkts eingerückt, damit sie zu
// ihm gehört und unter seinem Text beginnt (E2); die Spalte liefert die eine
// Erkennung `parseListItemHead` aus src/shared/markdown/list-outline.js. Eine
// eingerückte Folgezeile ohne Marker gehört zum nächsten Punkt darüber, dessen
// Marker links von ihr steht.
//
// **Schnittstelle zur Eingabetaste:** `listEnterKeymap` trägt Prec.highest und
// steht in beiden Editoren hinter der Schreibschutz-Wache und hinter dem
// Listen-Ausstieg `listExitKeymap`. Ihr Eingabetasten-Eintrag räumt zuerst
// eine leer gebliebene Folgezeile auf (`runListBreakEnterCleanup`, liefert
// immer false) und ruft danach `runListEnter`; allein dessen Rückgabe
// entscheidet, ob die Taste verbraucht ist. Liefert er false, läuft die
// eingekaufte Fortsetzung (`insertNewlineContinueMarkup` aus
// @codemirror/lang-markdown) unverändert.
//
// **`runListEnter`** (E11, E17 bis E20, E22 bis E24 des Epics) greift nur bei
// genau einer leeren Auswahl, nie im Schreibschutz, in Code- oder
// Tabellen-Zeilen (er läuft vor der Tabellen-Belegung, B8) und nie auf einem
// leeren Punkt, außer im Fall des leeren nummerierten Aufgaben-Punkts auf
// einer Unterebene. Die Fälle:
// - Punkt mit Inhalt, dem Unterpunkte folgen (4T-001862, Fälle 1 bis 7): Der
//   neue Punkt entsteht als erster Unterpunkt auf deren Ebene mit deren Art;
//   steht die Schreibmarke mitten im Text, wird der Rest der Zeile sein Inhalt.
// - Ende einer Folgezeile (Fall 10): neuer Punkt, bei folgenden Unterpunkten
//   auf deren Ebene, sonst auf der Ebene des Punkts.
// - Erste Zeile eines Punkts mit Folgezeile (Fall 11, E20): wie heute; nur ein
//   Rückstrich am Zeilenende wird vorher entfernt, weil er ohne Folgezeile
//   sichtbar bliebe. Das gilt auch, wenn dem Punkt außerdem Unterpunkte
//   folgen: Die Fall-Tabelle entscheidet dieses Zusammentreffen nicht, und E20
//   ist die engere Regel (Festlegung dieser Umsetzung, im Bericht als offene
//   Frage gemeldet).
// - Nummerierte Aufgabe, Schreibmarke am Zeilenende (4T-001977): Die
//   eingekaufte Fortsetzung erzeugt den Punkt, das leere Kästchen kommt in
//   derselben Transaktion dazu (E12).
// - Leerer nummerierter Aufgaben-Punkt auf einer Unterebene (Fall 9, E22):
//   rückt eine Ebene aus.
// Alle Fälle gelten in jedem Arbeitsmodus, ohne Bindung an die Erweiterung
// «Listen-Struktur» (E23); die Nummern ziehen sie deshalb selbst nach, weil der
// Nummerierungs-Filter an der Erweiterung hängt. Die Rechnungen liegen rein in
// src/shared/markdown/list-outline.js.
//
// **Festlegungen dieser Umsetzung** (technische Feinheiten im Rahmen von E10):
// Steht vor der Schreibmarke in einem Listenpunkt kein Text, setzt das
// Kommando keinen Rückstrich und lässt das Dokument unverändert — ein
// Rückstrich ohne Text davor wäre ein sichtbares Zeichen statt eines
// Umbruchs. Außerhalb von Listen fällt der Tastendruck dann an die
// Standard-Belegung durch. Die Einrückung übernimmt Tabulatoren der
// Punkt-Einrückung unverändert und ersetzt alle übrigen Zeichen bis zur
// Inhalts-Spalte durch Leerzeichen; ohne Tabulator sind das genau Leerzeichen
// bis zur Spalte.
//
// Kein Modul-Zyklus: Den Code-Block-Test und die Tabellen-Erkennung liest das
// Modul aus dem Blatt-Modul editor-code-zeile.js; nur editor-keymaps.js lädt dieses Modul (Kommando
// `list.lineBreak`), nicht umgekehrt. Ein Import aus editor-keymaps.js zöge
// es in die eingefrorene Zyklus-Komponente des Renderers
// (scripts/ordner-import-ausnahme.json).
'use strict';

import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import {
  buildListMarker,
  firstSubItem,
  hardBreakStart,
  hasContinuationLine,
  nextSiblingIndex,
  parentItem,
  parseListItemHead,
  renumberSiblings,
} from '../../../shared/markdown/list-outline.js';
import { isTableContextLine, lineInsideCodeBlock } from './editor-code-zeile.js';

// Tabellen-Zeile: beginnt nach Leerraum mit einem senkrechten Strich.
function isTableRow(text) {
  return /^[ \t]*\|/.test(text);
}

// Einrückung einer Folgezeile: Tabulatoren der Punkt-Einrückung bleiben, alle
// übrigen Zeichen bis zur Inhalts-Spalte werden Leerzeichen.
function continuationIndent(lineText, head) {
  return lineText.slice(0, head.contentColumn).replace(/[^\t]/g, ' ');
}

// Listenpunkt, zu dem die Zeile gehört: die Zeile selbst, wenn sie einer ist,
// sonst bei einer eingerückten Zeile ohne Marker der nächste Punkt darüber,
// dessen Marker links von ihr steht. Eine Leerzeile oder eine nicht
// eingerückte Zeile ohne Marker beendet die Suche. Liefert { line, head }
// oder null.
function owningItem(state, line) {
  const own = parseListItemHead(line.text);
  if (own) return { line, head: own };
  const indent = /^[ \t]*/.exec(line.text)[0].length;
  if (indent === 0) return null;
  for (let n = line.number - 1; n >= 1; n--) {
    const above = state.doc.line(n);
    if (above.text.trim() === '') return null;
    const head = parseListItemHead(above.text);
    if (head && !lineInsideCodeBlock(state, above)) {
      if (head.indent.length < indent) return { line: above, head };
      continue;
    }
    if (!/^[ \t]/.test(above.text)) return null;
  }
  return null;
}

/**
 * Fügt an der Schreibmarke einen harten Zeilenumbruch ein (Rückstrich,
 * Zeilenwechsel) und rückt die neue Zeile in einem Listenpunkt bis zu dessen
 * Inhalts-Spalte ein. Steht die Marke mitten im Text, wandert der Rest der
 * Zeile hinter die Einrückung (E21 des Epics).
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @returns {boolean} true, wenn der Tastendruck verbraucht wurde.
 */
export function runListLineBreak(view) {
  if (!view || view.state.readOnly) return false;
  const state = view.state;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (lineInsideCodeBlock(state, line)) return false;
  if (isTableRow(line.text)) return false;
  const owner = owningItem(state, line);
  // Text vor der Schreibmarke beginnt hinter dem Kopf des eigenen Punkts
  // bzw. hinter der Einrückung der Folgezeile.
  const ownHead = owner && owner.line.number === line.number ? owner.head : null;
  const textStart = ownHead ? ownHead.contentColumn : /^[ \t]*/.exec(line.text)[0].length;
  const column = Math.max(range.head - line.from, textStart);
  const before = line.text.slice(textStart, column).replace(/[ \t]+$/, '');
  if (before === '') return !!owner;
  const restOffset = column + /^[ \t]*/.exec(line.text.slice(column))[0].length;
  const indent = owner ? continuationIndent(owner.line.text, owner.head) : '';
  const from = line.from + textStart + before.length;
  const insert = '\\\n' + indent;
  view.dispatch({
    changes: { from, to: line.from + restOffset, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.linebreak',
    scrollIntoView: true,
  });
  return true;
}

// Leer gebliebene Folgezeile an der Schreibmarke: eine Zeile nur aus
// Einrückung, Schreibmarke an ihrem Ende, die Zeile darüber endet auf einen
// Rückstrich, und sie gehört zu einem Listenpunkt. Liefert die Lage oder null.
function emptyContinuationAt(state) {
  if (state.readOnly || state.selection.ranges.length !== 1) return null;
  const range = state.selection.main;
  if (!range.empty) return null;
  const line = state.doc.lineAt(range.head);
  if (line.number === 1 || range.head !== line.to) return null;
  if (line.text === '' || line.text.trim() !== '') return null;
  const prev = state.doc.line(line.number - 1);
  const breakStart = hardBreakStart(prev.text);
  if (breakStart < 0) return null;
  if (lineInsideCodeBlock(state, prev)) return null;
  if (!owningItem(state, prev)) return null;
  return { line, prev, breakFrom: prev.from + breakStart };
}

/**
 * Rücktaste am Ende einer leer gebliebenen Folgezeile: löscht Zeilenwechsel,
 * Einrückung und den Rückstrich samt Leerraum davor; die Schreibmarke steht
 * danach am Ende des Texts der Zeile darüber (AK16).
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @returns {boolean} true, wenn der Tastendruck verbraucht wurde.
 */
export function runListBreakBackspace(view) {
  const spot = view ? emptyContinuationAt(view.state) : null;
  if (!spot) return false;
  view.dispatch({
    changes: { from: spot.breakFrom, to: spot.line.to },
    selection: { anchor: spot.breakFrom },
    userEvent: 'delete.backward',
    scrollIntoView: true,
  });
  return true;
}

/**
 * Eingabetaste auf einer leer gebliebenen Folgezeile: entfernt den
 * Rückstrich der Zeile darüber und leert die Folgezeile (AK16). Liefert
 * immer false, damit die weitere Behandlung der Taste folgt (Modul-Kopf).
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @returns {false} Die Taste ist nie verbraucht.
 */
export function runListBreakEnterCleanup(view) {
  const spot = view ? emptyContinuationAt(view.state) : null;
  if (!spot) return false;
  view.dispatch({
    changes: [
      { from: spot.breakFrom, to: spot.prev.to },
      { from: spot.line.from, to: spot.line.to },
    ],
    selection: { anchor: spot.line.from - (spot.prev.to - spot.breakFrom) },
    userEvent: 'delete.linebreak',
    scrollIntoView: true,
  });
  return false;
}

// === 4T-001862 und 4T-001977: die eigene Eingabetaste in Listen ============

// Listen-Block um die Zeile (Grenze ist die Leerzeile, wie beim
// Nummerierungs-Filter) als Zeilen-Array für die reinen Rechnungen. Der
// Code-Test läuft nur für Zeilen, die wie ein Listenpunkt aussehen, und wird
// gemerkt; er löst den Syntaxbaum auf.
function blockAround(state, lineNumber) {
  const doc = state.doc;
  let first = lineNumber;
  while (first > 1 && doc.line(first - 1).text.trim() !== '') first--;
  let last = lineNumber;
  while (last < doc.lines && doc.line(last + 1).text.trim() !== '') last++;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(doc.line(n).text);
  const code = new Map();
  const isCode = (i) => {
    if (!code.has(i)) code.set(i, lineInsideCodeBlock(state, doc.line(first + i)));
    return code.get(i);
  };
  return { first, lines, opts: { isCode } };
}

// Änderungen der Neu-Nummerierung (Spalten je Zeile) in Dokument-Positionen.
function numberChanges(state, ctx, changes) {
  return changes.map((c) => {
    const from = state.doc.line(ctx.first + c.index).from;
    return { from: from + c.from, to: from + c.to, insert: c.insert };
  });
}

// Nummerierte Aufgabe: nummerierter Punkt mit Kästchen, beide Trenner (E13).
function isNumberedTask(head) {
  return !!head && head.ordered && !!head.checkbox;
}

// Text hinter Marker und Abstand; leer ist der Punkt, wenn dort höchstens ein
// Kästchen steht (Erkennung wie runListExit in editor-list-tools.js).
function itemBody(text, head) {
  return text.slice(head.indent.length + head.marker.length + head.gap.length);
}

function isEmptyBody(body) {
  return body.replace(/^\[[ xX]\]/, '').trim() === '';
}

// Ende des Texts vor `column` ohne Leerraum davor, nicht vor `min`.
function trimBack(text, column, min) {
  let cut = column;
  while (cut > min && /[ \t]/.test(text.charAt(cut - 1))) cut--;
  return cut;
}

function dispatchEnter(view, changes, anchor) {
  view.dispatch({
    changes,
    selection: { anchor },
    userEvent: 'input',
    scrollIntoView: true,
  });
  return true;
}

// Eingekaufte Fortsetzung mit eigener Ergänzung in einer Transaktion (E12):
// Die Fortsetzung rechnet auf einem Zwischen-Zustand (ohne den Rückstrich ab
// `stripFrom`, falls gesetzt), ihr `dispatch` wird abgefangen, und Rückstrich-
// Entfernung, ihre Änderung und das leere Kästchen gehen als eine Transaktion
// hinaus — ein Rückgängig-Schritt. Nachgebaut wird nichts: Nummer, Trenner,
// Einrückung, Nummern-Nachzug und lockere Listen bleiben ihre Sache.
function continueBought(view, { stripFrom = null, stripTo = null, checkbox = false }) {
  const state = view.state;
  const pre = stripFrom === null ? null : { changes: { from: stripFrom, to: stripTo } };
  const base = pre ? state.update({ ...pre, selection: { anchor: stripFrom } }).state : state;
  let captured = null;
  const handled = insertNewlineContinueMarkup({
    state: base,
    dispatch: (tr) => {
      captured = tr;
    },
  });
  if (!handled || !captured) return false;
  const specs = pre ? [pre] : [];
  specs.push({ changes: captured.changes, selection: captured.selection, sequential: !!pre });
  if (checkbox) {
    const head = captured.selection.main.head;
    specs.push({
      changes: { from: head, insert: '[ ] ' },
      selection: { anchor: head + 4 },
      sequential: true,
    });
  }
  specs[0] = { ...specs[0], userEvent: 'input', scrollIntoView: true };
  view.dispatch(state.update(...specs));
  return true;
}

// Fälle 1 bis 7: neuer erster Unterpunkt auf der Ebene der vorhandenen
// Unterpunkte, mit deren Art (E17); der Rest der Zeile ab der Schreibmarke
// wird sein Inhalt (E18), die bisherigen Unterpunkte zählen weiter.
function enterAsFirstSubItem(view, ctx, index, head, column, sub) {
  const state = view.state;
  const text = ctx.lines[index];
  const line = state.doc.line(ctx.first + index);
  const cut = trimBack(text, column, head.indent.length + head.marker.length);
  const rest = text.slice(column).replace(/^[ \t]+/, '');
  const marker = buildListMarker(sub.head, sub.number);
  const changes = [{ from: line.from + cut, to: line.to, insert: '\n' + marker + rest }];
  if (sub.head.ordered) {
    const renumber = renumberSiblings(ctx.lines, sub.index, sub.number + 1, ctx.opts);
    changes.push(...numberChanges(state, ctx, renumber));
  }
  return dispatchEnter(view, changes, line.from + cut + 1 + marker.length);
}

// Fall 10 (E19): Eingabetaste am Ende einer Folgezeile — neuer Punkt, bei
// folgenden Unterpunkten auf deren Ebene, sonst auf der Ebene des Punkts mit
// dessen Art (Kästchen leer). Ein Rückstrich am Ende der Folgezeile fällt weg,
// weil die Zeile danach keine Folgezeile mehr hat.
function enterAtContinuationEnd(view, ctx, index, ownerIndex, ownerHead) {
  const state = view.state;
  const text = ctx.lines[index];
  const line = state.doc.line(ctx.first + index);
  const sub = firstSubItem(ctx.lines, ownerIndex, { ...ctx.opts, after: index });
  let marker;
  let renumber = [];
  if (sub) {
    marker = buildListMarker(sub.head, sub.number);
    if (sub.head.ordered)
      renumber = renumberSiblings(ctx.lines, sub.index, sub.number + 1, ctx.opts);
  } else {
    const number = ownerHead.ordered ? parseInt(ownerHead.marker, 10) + 1 : null;
    marker = buildListMarker(ownerHead, number);
    const sibling = ownerHead.ordered ? nextSiblingIndex(ctx.lines, ownerIndex, ctx.opts) : -1;
    if (sibling >= 0) {
      renumber = renumberSiblings(ctx.lines, sibling, number + 1, {
        ...ctx.opts,
        prev: number - 1,
      });
    }
  }
  const breakAt = hardBreakStart(text);
  const indent = /^[ \t]*/.exec(text)[0].length;
  const cut = trimBack(text, breakAt >= 0 ? breakAt : text.length, indent);
  const changes = [{ from: line.from + cut, to: line.to, insert: '\n' + marker }];
  changes.push(...numberChanges(state, ctx, renumber));
  return dispatchEnter(view, changes, line.from + cut + 1 + marker.length);
}

// Fall 9 (E22): Leerer nummerierter Aufgaben-Punkt auf einer Unterebene rückt
// eine Ebene aus. Er bekommt Einrückung und Art des Elternpunkts — bei Nummern
// die nächste (Trenner der Eltern-Ebene), ein leeres Kästchen, wenn der
// Elternpunkt eines trägt. Die Geschwister dahinter bleiben Unterpunkte und
// beginnen als eigene Teilliste bei 1 (Regel startFollowerAtOne in
// list-outline.js: eine nummerierte Liste unterbricht einen Absatz nur mit
// 1); die Geschwister des Elternpunkts zählen weiter.
function outdentEmptyNumberedTask(view, ctx, index, head) {
  const state = view.state;
  const parent = parentItem(ctx.lines, index, ctx.opts);
  if (!parent) return false;
  const line = state.doc.line(ctx.first + index);
  const number = parent.head.ordered ? parent.number + 1 : null;
  const marker = buildListMarker(parent.head, number);
  const changes = [{ from: line.from, to: line.to, insert: marker }];
  const own = parseInt(head.marker, 10);
  const follower = nextSiblingIndex(ctx.lines, index, ctx.opts);
  if (follower >= 0) {
    const renumber = renumberSiblings(ctx.lines, follower, 1, { ...ctx.opts, prev: own });
    changes.push(...numberChanges(state, ctx, renumber));
  }
  const sibling = parent.head.ordered ? nextSiblingIndex(ctx.lines, parent.index, ctx.opts) : -1;
  if (sibling >= 0) {
    const renumber = renumberSiblings(ctx.lines, sibling, number + 1, {
      ...ctx.opts,
      prev: parent.number,
    });
    changes.push(...numberChanges(state, ctx, renumber));
  }
  return dispatchEnter(view, changes, line.from + marker.length);
}

// Schreibmarke in der Zeile des Punkts selbst.
function enterOnItemLine(view, ctx, index, head, column) {
  const text = ctx.lines[index];
  const body = itemBody(text, head);
  if (isEmptyBody(body)) {
    // Fall 8 bleibt unverändert; nur Fall 9 greift auf einem leeren Punkt.
    const boxEnd = text.length - body.length + 3;
    const numberedTask = head.ordered && /^\[[ xX]\][ \t]*$/.test(body);
    if (!numberedTask || head.indent.length === 0 || column < boxEnd) return false;
    return outdentEmptyNumberedTask(view, ctx, index, head);
  }
  if (column < head.contentColumn) return false;
  const atEnd = column === text.length;
  if (hasContinuationLine(ctx.lines, index, ctx.opts)) {
    // Fall 11 (E20): wie heute; ein Rückstrich am Zeilenende fällt weg.
    const breakAt = atEnd ? hardBreakStart(text) : -1;
    if (breakAt < 0 && !(atEnd && isNumberedTask(head))) return false;
    const line = view.state.doc.line(ctx.first + index);
    const strip = breakAt >= 0 ? { stripFrom: line.from + breakAt, stripTo: line.to } : {};
    return continueBought(view, { ...strip, checkbox: atEnd && isNumberedTask(head) });
  }
  const sub = firstSubItem(ctx.lines, index, ctx.opts);
  if (sub) return enterAsFirstSubItem(view, ctx, index, head, column, sub);
  if (atEnd && isNumberedTask(head)) return continueBought(view, { checkbox: true });
  return false;
}

/**
 * Eigene Eingabetaste in Listen (Modul-Kopf). Liefert false in allen Fällen,
 * die sie nicht selbst behandelt; dann läuft die eingekaufte Fortsetzung.
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @returns {boolean} true, wenn der Tastendruck verbraucht wurde.
 */
export function runListEnter(view) {
  if (!view || view.state.readOnly) return false;
  const state = view.state;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (lineInsideCodeBlock(state, line) || isTableContextLine(state, line)) return false;
  const owner = owningItem(state, line);
  if (!owner) return false;
  const ctx = blockAround(state, line.number);
  const index = line.number - ctx.first;
  const column = range.head - line.from;
  if (owner.line.number === line.number) {
    return enterOnItemLine(view, ctx, index, owner.head, column);
  }
  if (line.text.trim() === '' || column !== line.length) return false;
  return enterAtContinuationEnd(view, ctx, index, owner.line.number - ctx.first, owner.head);
}

// Belegung beider Editoren, hinter der Schreibschutz-Wache und dem
// Listen-Ausstieg eingehängt (Muster listExitKeymap in editor-keymaps.js).
// Das Aufräumen liefert immer false; danach entscheidet runListEnter.
export const listEnterKeymap = Prec.highest(
  keymap.of([
    { key: 'Backspace', run: (view) => runListBreakBackspace(view) },
    {
      key: 'Enter',
      run: (view) => {
        runListBreakEnterCleanup(view);
        return runListEnter(view);
      },
    },
  ]),
);
