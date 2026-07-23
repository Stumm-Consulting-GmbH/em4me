// 4T-0599 (Epic 3E-0112): Laufzeit-Backend der Listen-Struktur-Kommandos.
//
// Bindeglied zwischen dem reinen Struktur-Kern (src/shared/markdown/
// list-outline.js) und der EditorView: Kontext am Cursor bestimmen, Kern
// rufen, Ergebnis in genau einer Transaktion zurückschreiben (ein
// Rückgängig-Schritt). Eigenes Modul statt Erweiterung von editor.js, weil
// diese Datei über dem Zerlegungs-Prüfwert der Entwicklungsrichtlinien liegt.
//
// Zwei Wirkungsbereiche (PO-Festlegung 4 vom 2026-07-21): Berührt die
// Auswahl nur eine Zeile, wirkt die Operation auf diese Zeile samt Teilbaum.
// Berührt sie mehrere, wirkt sie zeilenweise auf genau den markierten
// Bereich.
//
// Kontext-Ausschnitt: Der Kern arbeitet auf einem Zeilen-Array. Übergeben
// wird der umgebende Listen-Block (Grenze ist die Leerzeile) plus je eine
// Zeile Puffer. Der Puffer ist nötig, damit ein markierter Bereich über die
// Blockgrenze hinaus wandern kann; der Block selbst muss vollständig
// enthalten sein, weil die Neu-Nummerierung sonst die Startnummer der Liste
// nicht kennt.
//
// Modul-Zyklus editor.js <-> editor-list-tools.js wie bei
// editor-table-tools.js: editor.js hält die dünnen Kommando-Wrapper als
// lokales Objekt und ruft die Funktionen hier erst zur Laufzeit; dieses
// Modul nutzt die editor.js-Exporte ebenfalls nur in Funktionskörpern.
'use strict';

import {
  moveSubtree,
  moveLineRange,
  indentSubtree,
  outdentSubtree,
  shiftLineRange,
  subtreeRange,
  parseListLine,
  renumberOrdered,
} from '../../shared/markdown/list-outline.js';
import { lineInsideCodeBlock } from './editor.js';
import { isExtensionActive } from './extension-lifecycle.js';

// Zeilen-Ausschnitt um den betroffenen Bereich samt Code-Maske. first/last
// sind 1-basierte CodeMirror-Zeilennummern.
function contextFor(state, first, last) {
  let from = Math.min(blockBounds(state.doc, first).first, first);
  if (from > 1) from--;
  let to = Math.max(blockBounds(state.doc, last).last, last);
  if (to < state.doc.lines) to++;
  const lines = [];
  const code = [];
  for (let n = from; n <= to; n++) {
    const line = state.doc.line(n);
    lines.push(line.text);
    code.push(lineInsideCodeBlock(state, line));
  }
  return { from, to, lines, opts: { isCode: (i) => !!code[i] } };
}

// Erste und letzte von der Auswahl berührte Zeile (1-basiert) plus die
// Information, ob es der Ein-Zeilen-Fall ist.
function selectedLines(state) {
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to).number;
  return { first, last, single: first === last };
}

// Zeichen-Position des Zeilenanfangs im neuen Text (Zeilen-Array ab dem
// Anfang des ersetzten Bereichs). Muster editor-table-tools.js.
function offsetOfLine(lines, index, base) {
  let pos = base;
  for (let i = 0; i < index; i++) pos += lines[i].length + 1;
  return pos;
}

// Ergebnis des Kerns in einer Transaktion zurückschreiben.
function writeBack(view, ctx, nextLines, selection, userEvent) {
  const state = view.state;
  const from = state.doc.line(ctx.from).from;
  const to = state.doc.line(ctx.to).to;
  view.dispatch({
    changes: { from, to, insert: nextLines.join('\n') },
    selection,
    userEvent,
    scrollIntoView: true,
  });
  return true;
}

// Listenpunkt samt Teilbaum bzw. markierten Bereich verschieben.
// direction -1 = nach oben, +1 = nach unten. Liefert false, wenn keine
// Listen-Operation greift; der Tastendruck fällt dann an die Standard-
// Belegung durch (dort verschiebt er die einzelne Zeile).
export function runListMove(view, direction) {
  if (!view || view.state.readOnly) return false;
  const state = view.state;
  if (state.selection.ranges.length !== 1) return false;
  const { first, last, single } = selectedLines(state);
  const ctx = contextFor(state, first, last);
  const index = first - ctx.from;
  if (single) {
    const line = state.doc.line(first);
    if (lineInsideCodeBlock(state, line)) return false;
    if (!parseListLine(line.text)) return false;
    const result = moveSubtree(ctx.lines, index, direction, ctx.opts);
    if (!result) return true; // Listenzeile ohne Geschwister: bewusst wirkungslos
    const base = state.doc.line(ctx.from).from;
    const column = state.selection.main.head - line.from;
    const target = result.lines[result.cursorLine] || '';
    const ch = Math.max(0, Math.min(target.length, column + result.cursorShift));
    const anchor = offsetOfLine(result.lines, result.cursorLine, base) + ch;
    return writeBack(view, ctx, result.lines, { anchor }, 'move.line');
  }
  // Mehrzeilige Auswahl: genau der markierte Bereich wandert eine Zeile.
  // Ohne Listenzeile darin bleibt es beim Standard-Verhalten der Belegung,
  // damit Auswahl und Undo-Verhalten außerhalb von Listen unverändert sind.
  let touchesList = false;
  for (let n = first; n <= last && !touchesList; n++) {
    const candidate = state.doc.line(n);
    if (lineInsideCodeBlock(state, candidate)) continue;
    if (parseListLine(candidate.text)) touchesList = true;
  }
  if (!touchesList) return false;
  const lastIndex = last - ctx.from;
  const result = moveLineRange(ctx.lines, index, lastIndex, direction, ctx.opts);
  if (!result) return false;
  const base = state.doc.line(ctx.from).from;
  const anchor = offsetOfLine(result.lines, result.from, base);
  const head = offsetOfLine(result.lines, result.to, base) + result.lines[result.to].length;
  return writeBack(view, ctx, result.lines, { anchor, head }, 'move.line');
}

// === 4T-0655 (Epic 3E-0112): Nummerierungs-Invariante ========================
// Die Nummern im Quelltext sollen nach JEDER Bearbeitung mit der gerenderten
// Ansicht übereinstimmen, nicht nur nach den Struktur-Kommandos oben. Der
// auslösende Fall: Wird die Leerzeile zwischen zwei bei 1 beginnenden Listen
// gelöscht, verschmelzen sie zu einer Liste; die Anzeige zählt durch, der
// Quelltext zeigt weiter 1, 2, 1, 2.
//
// Umsetzung als Transaktions-Filter, nicht als nachgelagerter Listener: Der
// Filter hängt die Korrektur an DIESELBE Transaktion, damit die Bearbeitung
// ein Rückgängig-Schritt bleibt und die Nummern nicht sichtbar nachspringen.
//
// Ausgelöst wird nur bei echten Bearbeitungen des Nutzers (Eingabe, Löschen,
// Verschieben). Bewusst ausgenommen: Rückgängig und Wiederherstellen (sonst
// wäre die Korrektur nicht zurücknehmbar) sowie alle Transaktionen ohne
// Nutzer-Ereignis, insbesondere das Laden einer Datei — sonst würde ein
// bloßes Öffnen fremde Dokumente umschreiben und als geändert markieren.
const RENUMBER_USER_EVENTS = ['input', 'delete', 'move'];

// Grenzen des Listen-Blocks um eine Zeile im übergebenen Text-Objekt.
// Blockgrenze ist die Leerzeile (Festlegung des Product Owners): Sie beginnt
// eine neue Liste, die wieder bei ihrer eigenen Startnummer zählt. Damit die
// Anzeige dasselbe zeigt, setzt die Render-Pipeline die Nummer am ersten
// Punkt nach einer Leerzeile zurück (4T-0660).
function blockBounds(doc, lineNumber) {
  let first = lineNumber;
  while (first > 1 && doc.line(first - 1).text.trim() !== '') first--;
  let last = lineNumber;
  while (last < doc.lines && doc.line(last + 1).text.trim() !== '') last++;
  return { first, last };
}

// Code-Maske für einen Zeilenbereich des NEUEN Dokuments. Der Syntaxbaum
// existiert nur für den Start-Zustand der Transaktion, deshalb wird jede
// Zeilen-Position über das invertierte Änderungs-Set dorthin zurückgerechnet.
// Für neu eingefügte Zeilen liefert die Rückrechnung die Einfüge-Stelle, was
// als Näherung genügt.
//
// Der Filter läuft bei jedem Tastendruck, deshalb wird der teure Teil (das
// Auflösen im Syntaxbaum) nur für die Zeilen berechnet, die überhaupt wie ein
// Listenpunkt aussehen. Alle übrigen sind für die Neu-Nummerierung ohnehin
// bedeutungslos.
function codeMaskFor(tr, back, doc, first, lines) {
  const mask = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!parseListLine(lines[i])) continue;
    const posB = doc.line(first + i).from;
    const posA = Math.max(0, Math.min(tr.startState.doc.length, back.mapPos(posB)));
    mask[i] = lineInsideCodeBlock(tr.startState, tr.startState.doc.lineAt(posA));
  }
  return mask;
}

// Zeile, die durch DIESE Bearbeitung leer geworden ist. Sie trennt die Liste
// neu, und die Liste dahinter ist damit frisch entstanden: Ihre erste Nummer
// stammt aus der vorherigen durchgehenden Zählung und ist keine bewusst
// gesetzte Startnummer, weshalb sie wieder bei 1 beginnt. Eine Leerzeile, die
// schon vorher da war, lässt die Startnummer dagegen unangetastet (eine
// bewusst bei 3 beginnende Liste bleibt bei 3).
function becameBlank(tr, back, doc, lineNumber) {
  if (lineNumber < 1 || lineNumber > doc.lines) return false;
  if (doc.line(lineNumber).text.trim() !== '') return false;
  const posB = doc.line(lineNumber).from;
  const posA = Math.max(0, Math.min(tr.startState.doc.length, back.mapPos(posB)));
  return tr.startState.doc.lineAt(posA).text.trim() !== '';
}

// Startnummern-Vorgabe „alles ab 1" für die Ebenen eines frisch getrennten
// Blocks.
function restartNumbers(lines) {
  const starts = new Map();
  for (const text of lines) {
    const item = parseListLine(text);
    if (item && item.ordered && !starts.has(item.level)) starts.set(item.level, 1);
  }
  return starts;
}

// Minimale Änderungen: nur der Marker wird ersetzt, nicht die ganze Zeile.
// Sonst wanderte der Cursor beim Tippen an den Zeilenrand.
function markerChanges(doc, first, before, after) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    const oldItem = parseListLine(before[i]);
    const newItem = parseListLine(after[i]);
    if (!oldItem || !newItem) continue;
    const lineFrom = doc.line(first + i).from;
    changes.push({
      from: lineFrom + oldItem.indent.length,
      to: lineFrom + oldItem.prefixLength,
      insert: newItem.marker,
    });
  }
  return changes;
}

// Transaktions-Filter: hängt die Nummern-Korrektur der berührten Listen-
// Blöcke an die laufende Transaktion an. Liefert die Transaktion unverändert
// zurück, wenn nichts zu korrigieren ist.
export function listRenumberFilter(tr) {
  if (!tr.docChanged || tr.startState.readOnly) return tr;
  if (!RENUMBER_USER_EVENTS.some((event) => tr.isUserEvent(event))) return tr;
  if (!isExtensionActive('outliner')) return tr;
  const doc = tr.newDoc;
  const back = tr.changes.invert(tr.startState.doc);
  const seen = new Set();
  const changes = [];
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const from = doc.lineAt(Math.min(fromB, doc.length)).number;
    const to = doc.lineAt(Math.min(toB, doc.length)).number;
    for (let n = from; n <= to; n++) {
      if (seen.has(n)) continue;
      const bounds = blockBounds(doc, n);
      for (let b = bounds.first; b <= bounds.last; b++) seen.add(b);
      const lines = [];
      let hasOrdered = false;
      for (let b = bounds.first; b <= bounds.last; b++) {
        const text = doc.line(b).text;
        lines.push(text);
        if (!hasOrdered) {
          const item = parseListLine(text);
          if (item && item.ordered) hasOrdered = true;
        }
      }
      // Ohne geordneten Punkt gibt es nichts zu nummerieren; der teure Teil
      // (Syntaxbaum auflösen) entfällt dann.
      if (!hasOrdered) continue;
      const mask = codeMaskFor(tr, back, doc, bounds.first, lines);
      const opts = { isCode: (i) => !!mask[i] };
      // Ist in diesem Bereich eben erst eine Zeile leer geworden, trennt sie
      // die Liste neu: Der Teil davor behält seine Zählung, der Teil dahinter
      // ist eine frische Liste und beginnt wieder bei 1.
      let split = -1;
      for (let i = 0; i < lines.length && split < 0; i++) {
        if (becameBlank(tr, back, doc, bounds.first + i)) split = i;
      }
      let next;
      if (split >= 0) {
        next = renumberOrdered(lines, 0, split - 1, opts);
        next = renumberOrdered(next, split + 1, lines.length - 1, {
          isCode: opts.isCode,
          startNumbers: restartNumbers(lines.slice(split + 1)),
        });
      } else {
        next = renumberOrdered(lines, 0, lines.length - 1, opts);
      }
      changes.push(...markerChanges(doc, bounds.first, lines, next));
    }
  });
  if (!changes.length) return tr;
  // sequential: die Positionen beziehen sich auf das Dokument NACH tr.
  return [tr, { changes, sequential: true }];
}

// 4T-0600 (Epic 3E-0112): Listenpunkt samt Teilbaum auswählen. Grundlage für
// Kopieren und Ausschneiden ganzer Äste; wirkt auch im Schreibschutz, weil
// eine Auswahl das Dokument nicht verändert.
export function runListSelectSubtree(view) {
  if (!view) return false;
  const state = view.state;
  if (state.selection.ranges.length !== 1) return false;
  const { first } = selectedLines(state);
  const line = state.doc.line(first);
  if (lineInsideCodeBlock(state, line)) return false;
  if (!parseListLine(line.text)) return false;
  const ctx = contextFor(state, first, first);
  const range = subtreeRange(ctx.lines, first - ctx.from, ctx.opts);
  if (!range) return false;
  view.dispatch({
    selection: {
      anchor: state.doc.line(ctx.from + range.from).from,
      head: state.doc.line(ctx.from + range.to).to,
    },
    scrollIntoView: true,
  });
  return true;
}

// 4T-0600 (Epic 3E-0112): Listen-Ausstieg auf der obersten Ebene.
//
// Die eingekaufte Enter-Automatik deckt fast alles ab (in der Anwendung
// gemessen): Sie setzt jede Marker-Art fort, nummeriert nach, hängt bei
// Aufgaben eine leere Checkbox an und rückt auf einem leeren Unterpunkt
// korrekt eine Ebene aus. Nur auf der obersten Ebene beendet sie die Liste
// nicht, sondern hinterlässt eine Leerzeile UND einen weiteren leeren Punkt.
// Seit der Leerzeilen-Trennung aus 4T-0660 wiegt das schwerer als früher: Der
// Versuch auszusteigen erzeugte eine zweite Liste statt eines Absatzes.
//
// Dieser Handler greift genau in diesem einen Fall und lässt sonst die
// eingekaufte Belegung unverändert arbeiten; nachgebaut wird nichts, was
// bereits funktioniert.
export function runListExit(view) {
  if (!view || view.state.readOnly) return false;
  if (!isExtensionActive('outliner')) return false;
  const state = view.state;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1 || !range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;
  if (lineInsideCodeBlock(state, line)) return false;
  const item = parseListLine(line.text);
  if (!item || item.level !== 0) return false;
  // Leer ist der Punkt, wenn hinter dem Marker nichts steht; bei einer
  // Aufgaben-Zeile zählt die leere Checkbox nicht als Inhalt.
  const rest = item.content.replace(/^\[[ xX]\]\s*/, '').trim();
  if (rest !== '') return false;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: '' },
    selection: { anchor: line.from },
    userEvent: 'delete.list.exit',
    scrollIntoView: true,
  });
  return true;
}

// 4T-0661: Ein- bzw. Ausrücken eines markierten Zeilen-Bereichs. Die Auswahl
// bleibt erhalten, die Verschiebung folgt der Struktur (Inhalts-Spalte des
// Elternpunkts) statt einer festen Schrittweite.
function runListIndentRange(view, delta, first, last) {
  const state = view.state;
  let touchesList = false;
  for (let n = first; n <= last && !touchesList; n++) {
    const candidate = state.doc.line(n);
    if (lineInsideCodeBlock(state, candidate)) continue;
    if (parseListLine(candidate.text)) touchesList = true;
  }
  if (!touchesList) return false;
  const ctx = contextFor(state, first, last);
  const result = shiftLineRange(ctx.lines, first - ctx.from, last - ctx.from, delta, ctx.opts);
  if (!result) return true;
  const base = state.doc.line(ctx.from).from;
  const anchor = offsetOfLine(result.lines, first - ctx.from, base);
  const headLine = last - ctx.from;
  const head = offsetOfLine(result.lines, headLine, base) + result.lines[headLine].length;
  return writeBack(
    view,
    ctx,
    result.lines,
    { anchor, head },
    delta > 0 ? 'input.indent.more' : 'input.indent.less',
  );
}

// Ein- bzw. Ausrücken mit Teilbaum-Mitnahme für den Ein-Zeilen-Fall.
// delta = +1 (einrücken) oder -1 (ausrücken). Liefert false, wenn der Fall
// nicht greift; der Aufrufer fällt dann auf das zeilenweise Verhalten zurück.
export function runListIndentSubtree(view, delta) {
  if (!view || view.state.readOnly) return false;
  const state = view.state;
  if (state.selection.ranges.length !== 1) return false;
  const { first, last, single } = selectedLines(state);
  // 4T-0661: Bei einer Markierung über mehrere Zeilen wirkt die Operation
  // zeilenweise auf genau den markierten Bereich, aber mit derselben
  // Einrück-Tiefe wie im Cursor-Fall.
  if (!single) return runListIndentRange(view, delta, first, last);
  const line = state.doc.line(first);
  if (lineInsideCodeBlock(state, line)) return false;
  if (!parseListLine(line.text)) return false;
  const ctx = contextFor(state, first, first);
  const index = first - ctx.from;
  const result =
    delta > 0
      ? indentSubtree(ctx.lines, index, ctx.opts)
      : outdentSubtree(ctx.lines, index, ctx.opts);
  if (!result) return true; // z.B. Ausrücken auf Ebene 0: bewusst wirkungslos
  const base = state.doc.line(ctx.from).from;
  const column = state.selection.main.head - line.from;
  const target = result.lines[result.cursorLine] || '';
  const ch = Math.max(0, Math.min(target.length, column + result.cursorShift));
  const anchor = offsetOfLine(result.lines, result.cursorLine, base) + ch;
  return writeBack(
    view,
    ctx,
    result.lines,
    { anchor },
    delta > 0 ? 'input.indent.more' : 'input.indent.less',
  );
}
