// 4T-000599 (Epic 3E-000112): Struktur-Kern der Listen-Bearbeitung.
//
// Reine Text-Operationen auf einem Zeilen-Array: Teilbaum eines Listenpunkts
// bestimmen, Punkt samt Teilbaum verschieben, ein- und ausrücken, nummerierte
// Listen neu durchnummerieren. Rein und Electron-/DOM-frei (CJS, Muster
// src/shared/markdown/table-edit.js), damit Renderer (Bundler-Import) und
// Unit-Tests dasselbe Modul nutzen. Die Konstanten LIST_LINE_RE und
// LIST_INDENT_STEP sind aus editor.js hierher gewandert; editor.js
// re-exportiert sie für die Bestands-Konsumenten.
//
// Festlegungen des Product Owners (2026-07-21, Herleitung in 4T-000599):
// - Eine Leerzeile trennt: Listen-Block und Teilbaum enden dort.
// - Einrücken ohne vorhergehendes Geschwister bleibt erlaubt.
// - Neu-Nummerierung fortlaufend je Ebene, beginnend bei der Startnummer der
//   jeweiligen Teilliste (eine bei `3.` beginnende Liste zählt mit `4.`
//   weiter). Die Nummern stehen im Quelltext, damit Quell- und gerenderte
//   Ansicht übereinstimmen.
// - Verschieben ändert nie die Ebene und springt über den kompletten
//   Nachbar-Ast; ohne Geschwister in der Richtung ist es wirkungslos.
//
// Ebenen-Begriff: Die Ebene eines Punktes ist die Anzahl seiner führenden
// Leerraum-Zeichen. Geschwister sind Punkte gleicher Einrückung im selben
// Block. Uneinheitlich eingerückte Bestands-Dokumente führen damit höchstens
// zu einer wirkungslosen Operation, nie zu kaputter Struktur.
//
// Code-Blöcke kennt der Kern nicht selbst (kein Syntaxbaum). Der Aufrufer
// übergibt betroffene Zeilen über das Prädikat opts.isCode; sie gelten nie
// als Listenpunkt und zählen als Fortsetzungszeilen ihres Punktes. Intern
// wird daraus eine Maske, die jede Umordnung mitmacht — sonst zeigte sie
// nach dem Verschieben auf die falschen Zeilen.
'use strict';

// Listen-Marker am Zeilenanfang: ungeordnet (`-`, `*`, `+`, inklusive
// Aufgaben-Zeilen `- [ ]`) und geordnet (`1.`). Die Klammer-Variante `1)`
// wird bewusst nicht unterstützt (Bestands-Entscheidung aus 4T-000016).
const LIST_LINE_RE = /^(\s*)((?:[-*+]|\d+\.)\s)/;
const LIST_INDENT_STEP = 2;

// Zerlegt eine Zeile in Einrückung, Marker und Inhalt. Liefert null, wenn
// die Zeile kein Listenpunkt ist. `gap` ist das Trennzeichen hinter dem
// Marker; die Neu-Nummerierung schreibt es unverändert zurück, damit ein
// Tabulator erhalten bleibt.
function parseListLine(text) {
  const m = LIST_LINE_RE.exec(String(text == null ? '' : text));
  if (!m) return null;
  const indent = m[1];
  const marker = m[2];
  const ordered = /^\d+\.\s$/.test(marker);
  return {
    indent,
    level: indent.length,
    marker,
    gap: marker.slice(marker.length - 1),
    ordered,
    number: ordered ? parseInt(marker, 10) : null,
    prefixLength: indent.length + marker.length,
    content: String(text).slice(indent.length + marker.length),
  };
}

// Führender Leerraum einer beliebigen Zeile (auch ohne Marker).
function leadingWhitespace(text) {
  const m = /^[ \t]*/.exec(String(text == null ? '' : text));
  return m ? m[0] : '';
}

// Länge des Zeilen-Präfixes (Einrückung plus Marker). Für Fortsetzungszeilen
// ist es allein die Einrückung. Grundlage der Cursor-Spalten-Korrektur.
function prefixLength(text) {
  const item = parseListLine(text);
  return item ? item.prefixLength : leadingWhitespace(text).length;
}

function isBlank(text) {
  return String(text == null ? '' : text).trim() === '';
}

// Code-Maske aus dem Prädikat des Aufrufers; null, wenn keines übergeben ist.
function buildMask(lines, opts) {
  if (!opts || typeof opts.isCode !== 'function') return null;
  return lines.map((_, i) => !!opts.isCode(i));
}

// Options-Objekt der Neu-Nummerierung: mitgewanderte Code-Maske plus die vor
// der Umordnung erhobenen Startnummern.
function renumberOpts(mask, starts) {
  return {
    isCode: mask ? (i) => !!mask[i] : undefined,
    startNumbers: starts,
  };
}

// Listenpunkt an Position index, sofern die Zeile keine Code-Zeile ist.
function itemAt(lines, index, opts) {
  if (index < 0 || index >= lines.length) return null;
  if (opts && typeof opts.isCode === 'function' && opts.isCode(index)) return null;
  return parseListLine(lines[index]);
}

// Grenzen des Listen-Blocks um index. Ein Block ist eine zusammenhängende
// Folge nicht-leerer Zeilen aus Listenpunkten und deren eingerückten
// Fortsetzungszeilen; eine nicht eingerückte Nicht-Listen-Zeile (etwa ein
// vorangehender Absatz) begrenzt ihn ebenso wie eine Leerzeile. Liefert null,
// wenn index selbst kein Listenpunkt ist.
function scanListBlock(lines, index, opts) {
  if (!Array.isArray(lines) || !itemAt(lines, index, opts)) return null;
  const belongs = (i) => {
    if (i < 0 || i >= lines.length || isBlank(lines[i])) return false;
    if (itemAt(lines, i, opts)) return true;
    return leadingWhitespace(lines[i]).length > 0;
  };
  let from = index;
  while (belongs(from - 1)) from--;
  let to = index;
  while (belongs(to + 1)) to++;
  // Fortsetzungszeilen am Block-Ende gehören dazu, am Block-Anfang nicht:
  // dort beginnt der Block beim ersten Listenpunkt.
  while (from < index && !itemAt(lines, from, opts)) from++;
  return { from, to };
}

// Teilbaum eines Listenpunkts: der Punkt selbst plus alle Folgezeilen bis zum
// nächsten Listenpunkt gleicher oder geringerer Einrückung. Nicht-Listen-
// Zeilen (Fortsetzung, Code) gehören immer dazu.
function subtreeRange(lines, index, opts) {
  const item = itemAt(lines, index, opts);
  if (!item) return null;
  const block = scanListBlock(lines, index, opts);
  if (!block) return null;
  let to = index;
  for (let i = index + 1; i <= block.to; i++) {
    const next = itemAt(lines, i, opts);
    if (next && next.level <= item.level) break;
    to = i;
  }
  return { from: index, to };
}

// Teilbaum des Geschwisters in Richtung direction (-1 oben, +1 unten): der
// nächste Listenpunkt gleicher Einrückung im selben Block. Ein Punkt
// geringerer Einrückung beendet die Geschwister-Kette und liefert null.
function siblingRange(lines, index, direction, opts) {
  const item = itemAt(lines, index, opts);
  const block = scanListBlock(lines, index, opts);
  const own = subtreeRange(lines, index, opts);
  if (!item || !block || !own) return null;
  if (direction > 0) {
    const start = own.to + 1;
    if (start > block.to) return null;
    const next = itemAt(lines, start, opts);
    if (!next || next.level !== item.level) return null;
    return subtreeRange(lines, start, opts);
  }
  for (let i = index - 1; i >= block.from; i--) {
    const prev = itemAt(lines, i, opts);
    if (!prev) continue;
    if (prev.level > item.level) continue;
    if (prev.level < item.level) return null;
    return subtreeRange(lines, i, opts);
  }
  return null;
}

// Startnummern je Einrück-Ebene im Bereich [from, to]: die Nummer des ersten
// geordneten Punktes, den die Ebene zeigt. Wird VOR einer Umordnung erhoben
// und der Neu-Nummerierung danach vorgegeben. Ohne diesen Schritt würde ein
// Punkt, der durch das Verschieben an die erste Position rutscht, seine
// eigene Nummer zur Startnummer der Liste machen (aus `2. B` an erster
// Stelle würde eine bei 2 beginnende Liste).
function collectStartNumbers(lines, from, to, opts) {
  const starts = new Map();
  const start = Math.max(0, from);
  const end = Math.min(lines.length - 1, to);
  for (let i = start; i <= end; i++) {
    const item = itemAt(lines, i, opts);
    if (!item || !item.ordered) continue;
    if (!starts.has(item.level)) starts.set(item.level, item.number);
  }
  return starts;
}

// Nummeriert geordnete Listenpunkte im Bereich [from, to] neu durch. Je
// Einrück-Ebene läuft ein eigener Zähler; er startet mit der vorgefundenen
// Nummer des ersten Punktes seiner Teilliste oder, wenn opts.startNumbers
// einen Wert für diese Ebene trägt, mit der Vorgabe (sie gilt nur für die
// erste Teilliste der Ebene im Bereich). Eine Leerzeile, ein Wechsel des
// Listen-Typs auf derselben Ebene oder das Verlassen der Ebene setzt den
// Zähler zurück. Liefert immer ein neues Array.
function renumberOrdered(lines, from, to, opts) {
  const result = lines.slice();
  const counters = new Map();
  const seenLevels = new Set();
  const starts = opts && opts.startNumbers instanceof Map ? opts.startNumbers : null;
  const start = Math.max(0, from);
  const end = Math.min(result.length - 1, to);
  for (let i = start; i <= end; i++) {
    if (isBlank(result[i])) {
      counters.clear();
      continue;
    }
    const item = itemAt(result, i, opts);
    if (!item) continue;
    for (const level of [...counters.keys()]) {
      if (level > item.level) counters.delete(level);
    }
    const running = counters.get(item.level);
    if (running && running.ordered === item.ordered) {
      running.value += 1;
      if (item.ordered) {
        result[i] = item.indent + running.value + '.' + item.gap + item.content;
      }
      continue;
    }
    // Erster Punkt einer Teilliste: Startwert ist die Vorgabe für diese
    // Ebene, sonst die eigene Nummer.
    let value = item.ordered ? item.number : 0;
    if (item.ordered && !seenLevels.has(item.level) && starts && starts.has(item.level)) {
      value = starts.get(item.level);
    }
    seenLevels.add(item.level);
    counters.set(item.level, { ordered: item.ordered, value });
    if (item.ordered && value !== item.number) {
      result[i] = item.indent + value + '.' + item.gap + item.content;
    }
  }
  return result;
}

// Bereich auf die Grenzen der berührten Listen-Blöcke ausdehnen, damit die
// Neu-Nummerierung nicht mitten in einer Teilliste ansetzt und deren
// Startnummer verfälscht.
function expandToBlocks(lines, from, to) {
  let start = Math.max(0, from);
  let end = Math.min(lines.length - 1, to);
  while (start > 0 && !isBlank(lines[start - 1])) start--;
  while (end < lines.length - 1 && !isBlank(lines[end + 1])) end++;
  return { from: start, to: end };
}

// Bereich [from, to] eines Arrays an Position target einsetzen (reine
// Umordnung, target zählt im Array ohne den herausgelösten Bereich).
function spliceRange(arr, from, to, target) {
  if (!arr) return null;
  const block = arr.slice(from, to + 1);
  const rest = arr.slice(0, from).concat(arr.slice(to + 1));
  return rest.slice(0, target).concat(block, rest.slice(target));
}

// Listenpunkt samt Teilbaum über den benachbarten Ast hinweg verschieben.
// direction -1 = nach oben, +1 = nach unten. Liefert null, wenn es in der
// Richtung kein Geschwister gibt; die Ebene bleibt in jedem Fall unberührt.
function moveSubtree(lines, index, direction, opts) {
  const own = subtreeRange(lines, index, opts);
  const sibling = siblingRange(lines, index, direction, opts);
  if (!own || !sibling) return null;
  const mask = buildMask(lines, opts);
  const offset = index - own.from;
  const cut = direction < 0 ? own : sibling;
  const target = direction < 0 ? sibling.from : own.from;
  const touched = expandToBlocks(
    lines,
    Math.min(own.from, sibling.from),
    Math.max(own.to, sibling.to),
  );
  const starts = collectStartNumbers(lines, touched.from, touched.to, opts);
  const moved = spliceRange(lines, cut.from, cut.to, target);
  const movedMask = spliceRange(mask, cut.from, cut.to, target);
  const newFrom = direction < 0 ? sibling.from : own.from + (sibling.to - sibling.from + 1);
  const span = expandToBlocks(moved, touched.from, touched.to);
  const result = renumberOrdered(moved, span.from, span.to, renumberOpts(movedMask, starts));
  const cursorLine = newFrom + offset;
  return {
    lines: result,
    cursorLine,
    cursorShift: prefixLength(result[cursorLine]) - prefixLength(lines[index]),
  };
}

// Markierten Zeilen-Bereich um genau eine Zeile verschieben (Fall „mehrere
// Zeilen markiert"). Anders als moveSubtree bewegt er den Bereich wörtlich um
// eine Zeile und erweitert ihn nicht um nicht markierte Unterpunkte.
function moveLineRange(lines, from, to, direction, opts) {
  const start = Math.max(0, from);
  const end = Math.min(lines.length - 1, to);
  if (start > end) return null;
  if (direction < 0 && start === 0) return null;
  if (direction > 0 && end === lines.length - 1) return null;
  const mask = buildMask(lines, opts);
  const target = direction < 0 ? start - 1 : start + 1;
  const last = target + (end - start);
  const touched = expandToBlocks(lines, Math.min(start, target), Math.max(end, last));
  const starts = collectStartNumbers(lines, touched.from, touched.to, opts);
  const moved = spliceRange(lines, start, end, target);
  const movedMask = spliceRange(mask, start, end, target);
  const span = expandToBlocks(moved, touched.from, touched.to);
  return {
    lines: renumberOrdered(moved, span.from, span.to, renumberOpts(movedMask, starts)),
    from: target,
    to: last,
  };
}

// Ziel-Einrückung beim Einrücken: die Inhalts-Spalte des Vorgänger-
// Geschwisters, das dadurch zum Elternpunkt wird. null bedeutet „nicht
// möglich", der Aufrufer lässt die Operation dann wirkungslos.
//
// Eine feste Schrittweite genügt hier nicht (Befund des Product Owners vom
// 2026-07-21, an der Render-Pipeline verifiziert): Ein Unterpunkt gilt nur
// dann als Unterpunkt, wenn er im Fenster zwischen der Inhalts-Spalte des
// Elternpunkts und drei Zeichen darüber hinaus beginnt. Das sind bei `- `
// zwei Zeichen, bei `1. ` drei und bei `10. ` vier.
//
// Ohne Vorgänger-Geschwister gibt es keinen Punkt, unter den der eigene
// rutschen könnte, und damit keine Ebene, die sich ausdrücken ließe. Eine
// Schrittweiten-Verschiebung wäre dort reine Optik und fiele bei mehrfachem
// Einrücken aus dem gültigen Fenster: Die Zeile gälte dann nicht mehr als
// Listenpunkt, sondern als Fortsetzungstext des Punktes darüber (PO-Befund
// und -Festlegung vom 2026-07-21, Weg 1). Deshalb passiert dort nichts.
function indentTarget(lines, index, item, opts) {
  const prev = siblingRange(lines, index, -1, opts);
  if (!prev) return null;
  const parent = itemAt(lines, prev.from, opts);
  return parent ? parent.prefixLength : null;
}

// Ziel-Einrückung beim Ausrücken: die Einrückung des Elternpunkts, also des
// nächsten Punktes oberhalb mit geringerer Einrückung. Gibt es keinen, landet
// der Punkt auf Ebene 0.
function outdentTarget(lines, index, item, opts) {
  const block = scanListBlock(lines, index, opts);
  const from = block ? block.from : 0;
  for (let i = index - 1; i >= from; i--) {
    const above = itemAt(lines, i, opts);
    if (above && above.level < item.level) return above.level;
  }
  return 0;
}

// Beim Ausrücken bleiben die ehemaligen Geschwister hinter dem verschobenen
// Punkt als eigene Teilliste zurück, und zwar direkt unter ihm. Sie muss bei
// 1 beginnen: Eine geordnete Liste kann einen Absatz nur unterbrechen, wenn
// ihre erste Nummer 1 ist (an der Render-Pipeline verifiziert, 4T-000661).
// Bliebe dort die alte Nummer stehen, zöge der Renderer die Zeile als
// Fortsetzungstext in den Punkt darüber — sie erschiene einzeilig.
function startFollowerAtOne(lines, index, item, opts) {
  const follower = itemAt(lines, index, opts);
  if (!follower || !follower.ordered) return;
  if (follower.level !== item.level) return;
  lines[index] = follower.indent + '1.' + follower.gap + follower.content;
}

// Einrückung des Teilbaums um eine Ebene ändern. delta > 0 rückt ein,
// delta < 0 rückt aus. Beim Einrücken bekommt der Wurzel-Punkt zunächst die
// Nummer 1; die Neu-Nummerierung korrigiert sie anschließend auf den
// fortlaufenden Wert, falls er auf der neuen Ebene schon ein Geschwister hat.
function shiftSubtree(lines, index, delta, opts) {
  const item = itemAt(lines, index, opts);
  const own = subtreeRange(lines, index, opts);
  if (!item || !own) return null;
  if (delta < 0 && item.level === 0) return null;
  const target =
    delta > 0 ? indentTarget(lines, index, item, opts) : outdentTarget(lines, index, item, opts);
  if (target === null) return null;
  const shift = target - item.level;
  if (shift === 0) return null;
  const next = lines.slice();
  for (let i = own.from; i <= own.to; i++) {
    if (shift > 0) {
      next[i] = ' '.repeat(shift) + next[i];
    } else {
      const remove = Math.min(-shift, leadingWhitespace(next[i]).length);
      next[i] = next[i].slice(remove);
    }
  }
  if (delta > 0 && item.ordered) {
    const moved = parseListLine(next[index]);
    if (moved) next[index] = moved.indent + '1.' + moved.gap + moved.content;
  }
  if (delta < 0) startFollowerAtOne(next, own.to + 1, item, opts);
  const span = expandToBlocks(lines, own.from, own.to);
  const starts = collectStartNumbers(lines, span.from, span.to, opts);
  const result = renumberOrdered(next, span.from, span.to, {
    isCode: opts && typeof opts.isCode === 'function' ? opts.isCode : undefined,
    startNumbers: starts,
  });
  return {
    lines: result,
    cursorLine: index,
    cursorShift: prefixLength(result[index]) - prefixLength(lines[index]),
  };
}

// 4T-000661: Einrückung eines markierten Zeilen-Bereichs. Die Verschiebung wird
// einmal aus der ersten betroffenen Listenzeile bestimmt (dieselbe Rechnung
// wie beim Cursor-Fall) und auf alle Zeilen des Bereichs angewendet: Die
// erste landet damit auf einer gültigen Ebene, und die relative Struktur der
// Auswahl bleibt erhalten. Nicht-Listen-Zeilen wandern mit, Leerzeilen nicht.
function shiftLineRange(lines, from, to, delta, opts) {
  const start = Math.max(0, from);
  const end = Math.min(lines.length - 1, to);
  let anchor = -1;
  for (let i = start; i <= end && anchor < 0; i++) {
    if (itemAt(lines, i, opts)) anchor = i;
  }
  if (anchor < 0) return null;
  const item = itemAt(lines, anchor, opts);
  if (delta < 0 && item.level === 0) return null;
  const target =
    delta > 0 ? indentTarget(lines, anchor, item, opts) : outdentTarget(lines, anchor, item, opts);
  if (target === null) return null;
  const shift = target - item.level;
  if (shift === 0) return null;
  const next = lines.slice();
  for (let i = start; i <= end; i++) {
    if (isBlank(next[i])) continue;
    if (shift > 0) {
      next[i] = ' '.repeat(shift) + next[i];
    } else {
      const remove = Math.min(-shift, leadingWhitespace(next[i]).length);
      next[i] = next[i].slice(remove);
    }
  }
  // Wie im Cursor-Fall: Der erste Punkt der neuen Ebene startet bei 1, die
  // Neu-Nummerierung korrigiert ihn danach, falls er dort schon ein
  // Geschwister hat.
  if (shift > 0 && item.ordered) {
    const moved = parseListLine(next[anchor]);
    if (moved) next[anchor] = moved.indent + '1.' + moved.gap + moved.content;
  }
  if (shift < 0) startFollowerAtOne(next, end + 1, item, opts);
  const span = expandToBlocks(lines, start, end);
  const starts = collectStartNumbers(lines, span.from, span.to, opts);
  const result = renumberOrdered(next, span.from, span.to, {
    isCode: opts && typeof opts.isCode === 'function' ? opts.isCode : undefined,
    startNumbers: starts,
  });
  return { lines: result, shift };
}

function indentSubtree(lines, index, opts) {
  return shiftSubtree(lines, index, +1, opts);
}

function outdentSubtree(lines, index, opts) {
  return shiftSubtree(lines, index, -1, opts);
}

module.exports = {
  LIST_LINE_RE,
  LIST_INDENT_STEP,
  parseListLine,
  prefixLength,
  scanListBlock,
  subtreeRange,
  siblingRange,
  collectStartNumbers,
  renumberOrdered,
  moveSubtree,
  moveLineRange,
  indentSubtree,
  outdentSubtree,
  shiftLineRange,
};
