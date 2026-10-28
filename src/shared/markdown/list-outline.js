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
//
// 4T-002343 (Epic 3E-000365): Eingezäunte Code-Blöcke unter einem Listenpunkt
// erkennt der Kern seither selbst (list-fence.js, withFences unten): Ihre
// Zeilen gelten als Code, und eine Leerzeile darin trennt nicht. Die
// Festlegung «Eine Leerzeile trennt» gilt damit für Leerzeilen außerhalb
// eines Code-Blocks.
'use strict';

const { zaunMaske, zaunAbfrage } = require('./list-fence.js');

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

// 4T-001716 (Epic 3E-000301): Kopf eines Listenpunkts samt Kästchen — die eine
// Erkennung, die der Zeilenumbruch im Listenpunkt, die Einzugs-Rechnung
// (src/shared/haengender-einzug.js) und die Eingabetaste der nummerierten
// Aufgaben-Liste lesen. Anders als LIST_LINE_RE erkennt sie den Trenner `1)`
// und das Kästchen `[ ]`, `[x]`, `[X]` hinter dem Marker; LIST_LINE_RE bleibt
// unverändert, weil Einrücken, Verschieben und Nummerierung auf seinem
// Ausschluss von `1)` stehen (E13 des Epics). Hinter Marker und Kästchen steht
// mindestens ein Leerzeichen oder Tabulator; ein Kästchen ohne folgenden
// Leerraum ist Text.
const LIST_ITEM_HEAD_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(?:(\[[ xX]\])([ \t]+))?/;

// Zerlegt eine Zeile als Listenpunkt samt Kästchen; null, wenn sie keiner
// ist. `contentColumn` ist der Zeichen-Index, an dem der Text beginnt — ein
// Tabulator zählt hier als ein Zeichen. Die Breite in Zeichenbreiten
// (Tabulator voll) rechnet die Einzugs-Rechnung aus denselben Teilen.
function parseListItemHead(text) {
  const m = LIST_ITEM_HEAD_RE.exec(String(text == null ? '' : text));
  if (!m) return null;
  const ordered = /\d/.test(m[2]);
  return {
    indent: m[1],
    marker: m[2],
    ordered,
    delimiter: ordered ? m[2].slice(-1) : null,
    gap: m[3],
    checkbox: m[4] || null,
    checkboxGap: m[4] ? m[5] : '',
    contentColumn: m[0].length,
  };
}

// 4T-001716 (Epic 3E-000301, E10): harter Zeilenumbruch am Zeilenende — ein
// Rückstrich als letztes Zeichen, der nicht selbst maskiert ist (gerade Zahl
// von Rückstrichen davor). Liefert den Index, an dem der Leerraum vor ihm
// beginnt, oder -1. Die eine Erkennung für den Zeilenumbruch im Listenpunkt
// und die Aufgaben-Marker (src/shared/tasks/task-markers.js).
const HARD_BREAK_END_RE = /[ \t]*(?<=(?:^|[^\\])(?:\\\\)*)\\$/;

function hardBreakStart(text) {
  const m = HARD_BREAK_END_RE.exec(String(text == null ? '' : text));
  return m ? m.index : -1;
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

// 4T-002343: Zeilen eingezäunter Code-Blöcke unter einem Listenpunkt, als
// Maske über das Zeilen-Array (true von der öffnenden bis zur schließenden
// Zaun-Zeile) und als Abfrage über einen großen Bestand mit Zugriff
// `textAt(n)` auf die Zeilen first bis last. Regeln in list-fence.js.
function fencedLines(lines) {
  const textAt = (i) => String(lines[i] == null ? '' : lines[i]);
  return zaunMaske(lines.length, textAt, parseListItemHead);
}

function fencedLineLookup(textAt, first, last) {
  return zaunAbfrage((n) => String(textAt(n)), first, last, parseListItemHead);
}

// 4T-002343: Optionen samt Zaun-Zuständen der Zeilen `lines`. Zeilen eines
// Code-Blocks gelten als Code (nie Listenpunkt, Fortsetzung ihres Punkts),
// `inFence(i)` sagt, ob eine Leerzeile im Block liegt und damit nicht trennt.
// Bereits für dieselben Zeilen erweiterte Optionen kommen unverändert zurück,
// damit die Kern-Funktionen sich gegenseitig rufen, ohne neu zu zählen.
const FENCES_OF = Symbol('fencesOf');

function withFences(lines, opts) {
  if (opts && opts[FENCES_OF] === lines) return opts;
  const fenced = fencedLines(lines);
  const own = opts && typeof opts.isCode === 'function' ? opts.isCode : undefined;
  const isCode = fenced.includes(true) ? (i) => !!fenced[i] || (own ? !!own(i) : false) : own;
  return { ...opts, isCode, inFence: (i) => !!fenced[i], [FENCES_OF]: lines };
}

// Trennt Zeile i die Liste? Eine Leerzeile außerhalb eines Code-Blocks
// (Festlegung des Product Owners vom 2026-07-21, 4T-002343).
function separates(lines, i, opts) {
  return isBlank(lines[i]) && !(opts && opts.inFence && opts.inFence(i));
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
// 4T-002306: erst die Zeile zerlegen, dann das Code-Prädikat fragen. Der
// Nummerierungs-Filter des Editors löst das Prädikat im Syntaxbaum auf und
// darf es deshalb nur für Zeilen bezahlen, die wie ein Listenpunkt aussehen.
function itemAt(lines, index, opts) {
  if (index < 0 || index >= lines.length) return null;
  const item = parseListLine(lines[index]);
  if (!item) return null;
  if (opts && typeof opts.isCode === 'function' && opts.isCode(index)) return null;
  return item;
}

// 4T-002306 (Epic 3E-000353, Story-Zusage AK5 in 4S-000058): Ändert eine neue
// Nummer die Länge des Markers (aus «9.» wird «10.», aus «1.» wieder «11.»),
// wandert die Inhalts-Spalte des Punkts. Seine eingerückten Folgezeilen
// wandern um dieselbe Strecke mit, sonst stünden sie danach neben dem Anfang
// seines Textes. Folgezeile ist, was das zeilenweise Einrücken als Folgezeile
// mitnimmt (carryContinuationLines in editor-keymaps.js): eingerückte Zeilen
// bis zur Leerzeile, zum nächsten Listenpunkt (Kopf-Erkennung samt Trenner
// «1)»), zur nicht eingerückten Zeile oder zur ersten Code-Zeile. Zeilen, die
// links der alten Inhalts-Spalte beginnen, bleiben stehen; so landet keine
// Zeile links der neuen. `opts.keep(j)` nimmt eine Zeile von der Mitnahme
// aus, ohne die Suche zu beenden (der Nummerierungs-Filter des Editors schont
// so Zeilen, die die Bearbeitung selbst schon verschoben hat).
function carryContinuation(lines, index, oldColumn, newColumn, opts) {
  const shift = newColumn - oldColumn;
  if (shift === 0) return;
  for (let j = index + 1; j < lines.length; j++) {
    const text = lines[j];
    if (isBlank(text) || parseListItemHead(text)) return;
    const leading = leadingWhitespace(text).length;
    if (leading === 0) return;
    if (opts && typeof opts.isCode === 'function' && opts.isCode(j)) return;
    if (leading < oldColumn) continue;
    if (opts && typeof opts.keep === 'function' && opts.keep(j)) continue;
    lines[j] = shift > 0 ? ' '.repeat(shift) + text : text.slice(-shift);
  }
}

// Nummer eines geordneten Punkts setzen und die Folgezeilen mitführen
// (4T-002306). `item` ist die Zerlegung der Zeile vor der Änderung.
function setOrderedNumber(lines, index, item, value, opts) {
  lines[index] = item.indent + value + '.' + item.gap + item.content;
  const next = parseListLine(lines[index]);
  carryContinuation(lines, index, item.prefixLength, next.prefixLength, opts);
}

// Grenzen des Listen-Blocks um index. Ein Block ist eine zusammenhängende
// Folge nicht-leerer Zeilen aus Listenpunkten und deren eingerückten
// Fortsetzungszeilen; eine nicht eingerückte Nicht-Listen-Zeile (etwa ein
// vorangehender Absatz) begrenzt ihn ebenso wie eine Leerzeile. Liefert null,
// wenn index selbst kein Listenpunkt ist. 4T-002343: Eine Leerzeile in einem
// Code-Block des Punkts gehört zum Block.
function scanListBlock(lines, index, opts) {
  if (!Array.isArray(lines)) return null;
  opts = withFences(lines, opts);
  if (!itemAt(lines, index, opts)) return null;
  const belongs = (i) => {
    if (i < 0 || i >= lines.length || separates(lines, i, opts)) return false;
    if (isBlank(lines[i])) return true;
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
  opts = withFences(lines, opts);
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
  opts = withFences(lines, opts);
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
  opts = withFences(lines, opts);
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
// Zähler zurück. Liefert immer ein neues Array. 4T-002343: Eine Leerzeile in
// einem Code-Block eines Punkts setzt nichts zurück.
function renumberOrdered(lines, from, to, opts) {
  opts = withFences(lines, opts);
  const result = lines.slice();
  const counters = new Map();
  const seenLevels = new Set();
  const starts = opts && opts.startNumbers instanceof Map ? opts.startNumbers : null;
  const start = Math.max(0, from);
  const end = Math.min(result.length - 1, to);
  for (let i = start; i <= end; i++) {
    if (separates(result, i, opts)) {
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
        setOrderedNumber(result, i, item, running.value, opts);
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
    if (item.ordered && value !== item.number) setOrderedNumber(result, i, item, value, opts);
  }
  return result;
}

// Bereich auf die Grenzen der berührten Listen-Blöcke ausdehnen, damit die
// Neu-Nummerierung nicht mitten in einer Teilliste ansetzt und deren
// Startnummer verfälscht. 4T-002343: Grenze ist eine Leerzeile außerhalb eines
// Code-Blocks (opts aus withFences für dieselben Zeilen).
function expandToBlocks(lines, from, to, opts) {
  let start = Math.max(0, from);
  let end = Math.min(lines.length - 1, to);
  while (start > 0 && !separates(lines, start - 1, opts)) start--;
  while (end < lines.length - 1 && !separates(lines, end + 1, opts)) end++;
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
  opts = withFences(lines, opts);
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
    opts,
  );
  const starts = collectStartNumbers(lines, touched.from, touched.to, opts);
  const moved = spliceRange(lines, cut.from, cut.to, target);
  const movedMask = spliceRange(mask, cut.from, cut.to, target);
  const newFrom = direction < 0 ? sibling.from : own.from + (sibling.to - sibling.from + 1);
  const span = expandToBlocks(moved, touched.from, touched.to, withFences(moved));
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
  opts = withFences(lines, opts);
  const mask = buildMask(lines, opts);
  const target = direction < 0 ? start - 1 : start + 1;
  const last = target + (end - start);
  const touched = expandToBlocks(lines, Math.min(start, target), Math.max(end, last), opts);
  const starts = collectStartNumbers(lines, touched.from, touched.to, opts);
  const moved = spliceRange(lines, start, end, target);
  const movedMask = spliceRange(mask, start, end, target);
  const span = expandToBlocks(moved, touched.from, touched.to, withFences(moved));
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
  setOrderedNumber(lines, index, follower, 1, opts);
}

// Einrückung des Teilbaums um eine Ebene ändern. delta > 0 rückt ein,
// delta < 0 rückt aus. Beim Einrücken bekommt der Wurzel-Punkt zunächst die
// Nummer 1; die Neu-Nummerierung korrigiert sie anschließend auf den
// fortlaufenden Wert, falls er auf der neuen Ebene schon ein Geschwister hat.
function shiftSubtree(lines, index, delta, opts) {
  opts = withFences(lines, opts);
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
    // 4T-002343: Eine Leerzeile im Code-Block des Teilbaums bleibt leer, wie
    // beim zeilenweisen Einrücken (4T-002326).
    if (isBlank(next[i])) continue;
    if (shift > 0) {
      next[i] = ' '.repeat(shift) + next[i];
    } else {
      const remove = Math.min(-shift, leadingWhitespace(next[i]).length);
      next[i] = next[i].slice(remove);
    }
  }
  if (delta > 0 && item.ordered) {
    const moved = parseListLine(next[index]);
    if (moved) setOrderedNumber(next, index, moved, 1, opts);
  }
  if (delta < 0) startFollowerAtOne(next, own.to + 1, item, opts);
  const span = expandToBlocks(lines, own.from, own.to, opts);
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
  opts = withFences(lines, opts);
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
    if (moved) setOrderedNumber(next, anchor, moved, 1, opts);
  }
  if (shift < 0) startFollowerAtOne(next, end + 1, item, opts);
  const span = expandToBlocks(lines, start, end, opts);
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

// === 4T-001862 und 4T-001977 (Epic 3E-000301, E11): Rechnungen der Eingabetaste ===
// Reine Rechnungen für die eigene Eingabetaste in Listen
// (src/renderer/modules/editor/editor-list-enter.js). Sie lesen Listenpunkte
// über parseListItemHead, weil die Eingabetaste auch den Trenner `1)` und das
// Kästchen kennen muss; LIST_LINE_RE bleibt unverändert (E13). Die Block- und
// Teilbaum-Regeln sind dieselben wie bei scanListBlock und subtreeRange: Eine
// Leerzeile und eine nicht eingerückte Zeile ohne Marker beenden den Block,
// eingerückte Zeilen ohne Marker (Folgezeilen, Code) gehören zum Punkt
// darüber, die Ebene ist die Länge der Einrückung. subtreeRange selbst trägt
// hier nicht, weil es auf LIST_LINE_RE steht und einen Punkt mit Trenner `1)`
// gar nicht als Punkt erkennt. Gezählt werden nur Listenpunkte, nie der
// Leerraum einer Zeile: Folgezeilen sind tiefer eingerückt, ohne Unterpunkte
// zu sein.

// Kopf des Listenpunkts an Position index; Code-Zeilen sind nie Punkte.
function itemHeadAt(lines, index, opts) {
  if (index < 0 || index >= lines.length) return null;
  const head = parseListItemHead(lines[index]);
  if (!head) return null;
  if (opts && typeof opts.isCode === 'function' && opts.isCode(index)) return null;
  return head;
}

// Beendet die Zeile den Listen-Block? Leerzeile oder nicht eingerückte Zeile
// ohne Marker (Regel von scanListBlock).
function endsListBlock(lines, index, head) {
  if (isBlank(lines[index])) return true;
  return !head && leadingWhitespace(lines[index]).length === 0;
}

function itemNumber(head) {
  return head && head.ordered ? parseInt(head.marker, 10) : null;
}

// Folgt dem Punkt an index unmittelbar eine Folgezeile (eingerückt, ohne
// Marker, nicht leer)? Eine Code-Zeile im Punkt zählt als Folgezeile.
function hasContinuationLine(lines, index, opts) {
  const item = itemHeadAt(lines, index, opts);
  const next = index + 1;
  if (!item || next >= lines.length || isBlank(lines[next])) return false;
  if (itemHeadAt(lines, next, opts)) return false;
  return leadingWhitespace(lines[next]).length > item.indent.length;
}

// Erster Unterpunkt des Punkts an index: der erste Listenpunkt hinter ihm,
// der tiefer eingerückt ist. Folgezeilen werden übersprungen; ein Punkt
// gleicher oder geringerer Ebene und das Block-Ende beenden die Suche. Mit
// opts.after beginnt die Suche erst hinter dieser Zeile (Eingabetaste am Ende
// einer Folgezeile). Liefert { index, head, number } oder null.
function firstSubItem(lines, index, opts) {
  const item = itemHeadAt(lines, index, opts);
  if (!item) return null;
  const after = opts && Number.isInteger(opts.after) ? opts.after : index;
  for (let i = after + 1; i < lines.length; i++) {
    const head = itemHeadAt(lines, i, opts);
    if (endsListBlock(lines, i, head)) return null;
    if (!head) continue;
    if (head.indent.length <= item.indent.length) return null;
    return { index: i, head, number: itemNumber(head) };
  }
  return null;
}

// Elternpunkt des Punkts an index: der nächste Listenpunkt darüber mit
// geringerer Einrückung im selben Block. Liefert { index, head, number } oder
// null.
function parentItem(lines, index, opts) {
  const item = itemHeadAt(lines, index, opts);
  if (!item) return null;
  for (let i = index - 1; i >= 0; i--) {
    const head = itemHeadAt(lines, i, opts);
    if (endsListBlock(lines, i, head)) return null;
    if (head && head.indent.length < item.indent.length) {
      return { index: i, head, number: itemNumber(head) };
    }
  }
  return null;
}

// Nächstes Geschwister des Punkts an index (gleiche Einrückung, im selben
// Teilbaum des Elternpunkts); Unterpunkte und Folgezeilen dazwischen werden
// übersprungen. Liefert den Index oder -1.
function nextSiblingIndex(lines, index, opts) {
  const item = itemHeadAt(lines, index, opts);
  if (!item) return -1;
  for (let i = index + 1; i < lines.length; i++) {
    const head = itemHeadAt(lines, i, opts);
    if (endsListBlock(lines, i, head)) return -1;
    if (!head || head.indent.length > item.indent.length) continue;
    return head.indent.length === item.indent.length ? i : -1;
  }
  return -1;
}

// Marker eines neuen Punkts nach der Art eines vorhandenen (E17): dessen
// Einrückung, Zeichen oder Nummer `number` samt Trenner, Abstand und — nur wenn
// das Vorbild eines trägt — ein Kästchen, das immer leer ist.
function buildListMarker(head, number) {
  const marker = head.ordered ? String(number) + head.delimiter : head.marker;
  const box = head.checkbox ? '[ ]' + head.checkboxGap : '';
  return head.indent + marker + head.gap + box;
}

// Neu-Nummerierung ab dem nummerierten Punkt an index: Er bekommt `first`,
// jedes folgende Geschwister gleicher Ebene und gleichen Trenners eins mehr,
// solange die bisherigen Nummern lückenlos aufeinander folgten — die Regel der
// eingekauften Fortsetzung (renumberList in @codemirror/lang-markdown), damit
// eine bewusst gleich nummerierte Liste (`1.`, `1.`, `1.`) stehen bleibt. Mit
// opts.prev muss schon der erste Punkt auf diese Nummer folgen. Liefert die
// Änderungen als { index, from, to, insert } mit Spalten innerhalb der Zeile;
// unveränderte Nummern fehlen.
function renumberSiblings(lines, index, first, opts) {
  const start = itemHeadAt(lines, index, opts);
  if (!start || !start.ordered) return [];
  const level = start.indent.length;
  const changes = [];
  let prev = opts && Number.isInteger(opts.prev) ? opts.prev : null;
  let value = first;
  for (let i = index; i < lines.length; i++) {
    const head = itemHeadAt(lines, i, opts);
    if (i > index && endsListBlock(lines, i, head)) break;
    if (!head || head.indent.length > level) continue;
    if (head.indent.length < level || head.delimiter !== start.delimiter) break;
    const number = itemNumber(head);
    if (prev !== null && number !== prev + 1) break;
    if (number !== value) {
      const digits = head.marker.length - 1;
      changes.push({ index: i, from: level, to: level + digits, insert: String(value) });
    }
    prev = number;
    value += 1;
  }
  return changes;
}

module.exports = {
  LIST_LINE_RE,
  LIST_INDENT_STEP,
  parseListLine,
  parseListItemHead,
  carryContinuation,
  hardBreakStart,
  prefixLength,
  scanListBlock,
  subtreeRange,
  siblingRange,
  // 4T-002343: Zaun-Zustände für die selbsttätige Nummerierung im Editor.
  fencedLines,
  fencedLineLookup,
  collectStartNumbers,
  renumberOrdered,
  moveSubtree,
  moveLineRange,
  indentSubtree,
  outdentSubtree,
  shiftLineRange,
  hasContinuationLine,
  firstSubItem,
  parentItem,
  nextSiblingIndex,
  buildListMarker,
  renumberSiblings,
};
