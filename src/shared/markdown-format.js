// 4T-0378 (Epic 3E-0071): Toggle-Kern der Zeichen-Format-Kommandos.
//
// Rein und Electron-/DOM-frei (CJS, wie src/shared/commands.js), damit die
// Toggle-Regeln und Randfälle ohne UI unit-testbar sind. Jede Funktion nimmt
// den Dokument-Text plus einen Selektions-Bereich [from, to) und liefert eine
// CodeMirror-taugliche Änderung { from, to, insert } samt neuer Selektion
// { selFrom, selTo } (absolute Offsets nach der Änderung). Der Renderer
// (editor-format.js) liest die Selektion aus der View, ruft hier auf und
// dispatcht das Ergebnis.
'use strict';

// Die sieben Zeichen-Formate mit ihren Markern. open/close getrennt wegen des
// asymmetrischen Critic-Kommentars ({>>…<<}). `avoid` markiert 1-Zeichen-
// Marker, die nicht anschlagen dürfen, wenn direkt ein gleiches Zeichen
// daneben steht (Kursiv `*` neben Fett `**`, Mathe `$` neben Block `$$`).
const INLINE_FORMATS = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*', avoid: '*' },
  strikethrough: { open: '~~', close: '~~' },
  highlight: { open: '==', close: '==' },
  code: { open: '`', close: '`' },
  math: { open: '$', close: '$', avoid: '$' },
  comment: { open: '{>>', close: '<<}' },
};

// Reihenfolge für „Formatierung entfernen": spezifische/längere Marker zuerst
// (Kommentar, dann 2-Zeichen, dann 1-Zeichen), Fett vor Kursiv.
const CLEAR_ORDER = ['comment', 'bold', 'strikethrough', 'highlight', 'italic', 'code', 'math'];

function isWordChar(ch) {
  return ch != null && /[\p{L}\p{N}_]/u.test(ch);
}

// Wort-Bereich um pos (Doppelklick-Semantik). Liegt pos zwischen zwei
// Nicht-Wortzeichen, ist der Bereich leer (from === to === pos).
function wordRangeAt(text, pos) {
  let a = pos;
  let b = pos;
  while (a > 0 && isWordChar(text[a - 1])) a--;
  while (b < text.length && isWordChar(text[b])) b++;
  return { from: a, to: b };
}

// Whitespace-Ränder aus [from, to) heraustrimmen, damit Marker nicht an
// Leerzeichen kleben. Liefert bei reinem Whitespace einen leeren Bereich am
// Anfang.
function trimSpan(text, from, to) {
  let a = from;
  let b = to;
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  return { from: a, to: b };
}

// Steht bei pos der `marker`, ohne dass ein `avoid`-Zeichen unmittelbar
// außerhalb anschließt? side = 'open' prüft das Zeichen links vor dem Marker,
// side = 'close' das Zeichen rechts nach dem Marker.
function markerBoundary(text, pos, marker, avoid, side) {
  if (!avoid) return true;
  if (side === 'open') return text[pos - 1] !== avoid;
  return text[pos + marker.length] !== avoid;
}

// Ziel-Bereich [a, b) eines Zeichen-Format-Toggles: getrimmte Selektion
// bzw. Wort unter dem Cursor (Doppelklick-Semantik). Gemeinsame Basis von
// applyInlineFormat und detectInlineFormats.
function formatTargetSpan(text, from, to) {
  if (from === to) {
    return wordRangeAt(text, from);
  }
  const t = trimSpan(text, from, to);
  if (t.from === t.to) return { from, to: from };
  return t;
}

// Fall 1 eines Toggles: Marker liegen direkt außerhalb [a, b).
function hasOuterMarkers(text, a, b, format) {
  const { open, close, avoid } = format;
  return (
    a - open.length >= 0 &&
    b + close.length <= text.length &&
    text.slice(a - open.length, a) === open &&
    text.slice(b, b + close.length) === close &&
    markerBoundary(text, a - open.length, open, avoid, 'open') &&
    markerBoundary(text, b, close, avoid, 'close')
  );
}

// Fall 2 eines Toggles: Marker liegen innen am Rand von [a, b).
function hasInnerMarkers(text, a, b, format) {
  const { open, close } = format;
  return (
    b - a >= open.length + close.length &&
    text.slice(a, a + open.length) === open &&
    text.slice(b - close.length, b) === close
  );
}

// Kern: ein Zeichen-Format auf [from, to) toggeln. Erst Ziel-Bereich [a, b)
// bestimmen (Selektion getrimmt bzw. Wort unter Cursor), dann Marker außen
// oder innen erkennen (Toggle aus) oder hinzufügen (Toggle ein).
function applyInlineFormat(text, from, to, formatId) {
  const format = INLINE_FORMATS[formatId];
  if (!format) throw new Error(`Unbekanntes Format: ${formatId}`);
  const { open, close } = format;

  const span = formatTargetSpan(text, from, to);
  const a = span.from;
  const b = span.to;

  // Fall 1: Marker direkt außerhalb [a, b) -> entfernen.
  if (hasOuterMarkers(text, a, b, format)) {
    const inner = text.slice(a, b);
    return {
      from: a - open.length,
      to: b + close.length,
      insert: inner,
      selFrom: a - open.length,
      selTo: a - open.length + inner.length,
    };
  }

  // Fall 2: Marker liegen innen am Rand der Selektion -> entfernen.
  if (hasInnerMarkers(text, a, b, format)) {
    const inner = text.slice(a + open.length, b - close.length);
    return { from: a, to: b, insert: inner, selFrom: a, selTo: a + inner.length };
  }

  // Fall 3: Marker hinzufügen.
  if (a === b) {
    // Leeres Paar mit Cursor dazwischen.
    return {
      from: a,
      to: b,
      insert: open + close,
      selFrom: a + open.length,
      selTo: a + open.length,
    };
  }
  const inner = text.slice(a, b);
  return {
    from: a,
    to: b,
    insert: open + inner + close,
    selFrom: a + open.length,
    selTo: a + open.length + inner.length,
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Alle Zeichen-Format-Marker aus einem String streifen (iterativ bis Fixpunkt,
// damit verschachtelte Kombinationen wie ***fett+kursiv*** vollständig
// abgebaut werden). Nur Marker-Paare, keine Struktur (Links bleiben).
function stripAllMarkers(s) {
  let prev;
  do {
    prev = s;
    for (const key of CLEAR_ORDER) {
      const { open, close } = INLINE_FORMATS[key];
      const re = new RegExp(`${escapeRegex(open)}([\\s\\S]*?)${escapeRegex(close)}`, 'g');
      s = s.replace(re, '$1');
    }
  } while (s !== prev);
  return s;
}

// „Formatierung entfernen": streift alle Zeichen-Format-Marker innerhalb der
// Selektion (bzw. des Worts unter dem Cursor). Link-Syntax bleibt unberührt,
// weil deren Marker ([ ] ( )) nicht in CLEAR_ORDER stehen.
function clearInlineFormats(text, from, to) {
  let a = from;
  let b = to;
  if (a === b) {
    const w = wordRangeAt(text, a);
    a = w.from;
    b = w.to;
  }
  const mid = stripAllMarkers(text.slice(a, b));
  return { from: a, to: b, insert: mid, selFrom: a, selTo: a + mid.length };
}

// 4T-0607 (Epic 3E-0114): aktive Zeichen-Formate an der Selektion für die
// gedrückt-Darstellung der Format-Toolbar. Ein Format gilt genau dann als
// aktiv, wenn applyInlineFormat es an derselben Selektion entfernen würde
// (Fall 1 oder Fall 2) — Anzeige und Toggle-Wirkung bleiben deckungsgleich.
// Liefert die Liste der aktiven Format-IDs.
function detectInlineFormats(text, from, to) {
  const span = formatTargetSpan(text, from, to);
  const active = [];
  for (const formatId of Object.keys(INLINE_FORMATS)) {
    const format = INLINE_FORMATS[formatId];
    if (
      hasOuterMarkers(text, span.from, span.to, format) ||
      hasInnerMarkers(text, span.from, span.to, format)
    ) {
      active.push(formatId);
    }
  }
  return active;
}

// Wiki-Link um die Selektion: [[Selektion]]. Ohne Selektion leeres [[]] mit
// Cursor dazwischen (das bestehende Wiki-Link-Autocomplete greift dort).
function insertWikiLink(text, from, to) {
  const inner = text.slice(from, to);
  if (inner.length === 0) {
    return { from, to, insert: '[[]]', selFrom: from + 2, selTo: from + 2 };
  }
  return {
    from,
    to,
    insert: `[[${inner}]]`,
    selFrom: from + 2,
    selTo: from + 2 + inner.length,
  };
}

// Externer Link [Selektion](url). Ohne url-Argument bleibt der Platzhalter
// 'url' selektiert, damit der Nutzer die Adresse direkt tippt (Kommando
// link.insertExternal). Mit url (4T-0603, Epic 3E-0113: Link-Einfügen in die
// Auswahl) wird die übergebene Adresse eingesetzt und der Cursor hinter den
// Link gestellt; enthält die Adresse Leerzeichen oder Klammern, wird sie in die
// Spitze-Klammern-Schreibweise <…> gesetzt (CommonMark-Ziel-Konvention).
function insertExternalLink(text, from, to, url) {
  const inner = text.slice(from, to);
  if (url == null) {
    const placeholder = 'url';
    const insert = `[${inner}](${placeholder})`;
    const urlStart = from + 1 + inner.length + 2; // hinter "]("
    return { from, to, insert, selFrom: urlStart, selTo: urlStart + placeholder.length };
  }
  const dest = /[\s()]/.test(url) ? `<${url}>` : url;
  const insert = `[${inner}](${dest})`;
  const end = from + insert.length;
  return { from, to, insert, selFrom: end, selTo: end };
}

// 4T-0603 (Epic 3E-0113): Erkennt, ob ein eingefügter Zwischenablage-Text als
// einzelnes, eindeutiges Link-Ziel taugt. Rückgabe: die normalisierte URL
// (http(s)://… und file://… unverändert, www.<domain> erhält das
// https://-Präfix) oder null. Konservativ: getrimmt, genau ein Token ohne
// internen Whitespace und mit erkanntem Schema; sonst greift das normale
// Einfügen. Rein und ohne DOM, damit die Erkennung unit-testbar ist.
function detectPasteUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length === 0 || /\s/.test(s)) return null;
  if (/^(?:https?|file):\/\/\S+$/i.test(s)) return s;
  if (/^www\.[^\s.]+\.\S+$/i.test(s)) return `https://${s}`;
  return null;
}

// Liegt [relFrom, relTo) (zeilenrelativ) innerhalb eines Marker-Paars, dessen
// öffnender/schließender Marker openLen/closeLen Zeichen lang ist? Der Bereich
// zählt nur als „innen", wenn die Selektion vollständig zwischen den Markern
// liegt (die Marker selbst gehören nicht dazu).
function spanContains(line, relFrom, relTo, regex, openLen, closeLen) {
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(line)) !== null) {
    const innerStart = m.index + openLen;
    const innerEnd = m.index + m[0].length - closeLen;
    if (relFrom >= innerStart && relTo <= innerEnd) return true;
  }
  return false;
}

// Schutz-Kontexte: Zeichen-Formate und Link-Aktionen ergeben innerhalb eines
// Wiki-Link-Ziels ([[…]]) oder Inline-Quelltexts (`…`) keinen Sinn — dort
// würden die Marker die Struktur zerstören bzw. als Literal erscheinen. Der
// Renderer fragt das vor dem Anwenden ab und lässt die Aktion dann fallen.
// Einzeilig geprüft (beide Konstrukte sind einzeilig).
function isProtectedForFormatting(text, from, to) {
  const lineStart = text.lastIndexOf('\n', from - 1) + 1;
  let lineEnd = text.indexOf('\n', to);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const relFrom = from - lineStart;
  const relTo = to - lineStart;
  return (
    spanContains(line, relFrom, relTo, /\[\[[^\]\n]*\]\]/g, 2, 2) ||
    spanContains(line, relFrom, relTo, /`[^`\n]+`/g, 1, 1)
  );
}

// --- 4T-0379: Absatz-Transformationen (zeilenweise) -------------------------

// Einrückung und Inhalt einer Zeile ohne ihren Listen-Präfix (Aufzählung,
// Aufgabe oder nummeriert). Die Task-Variante `- [ ] ` wird vor der einfachen
// Aufzählung `- ` geprüft, weil sie damit beginnt.
function stripListPrefix(line) {
  const m = line.match(/^(\s*)(?:[-*+] \[[ xX]\] |[-*+] |\d+\. )?(.*)$/);
  return { indent: m[1], content: m[2] };
}

function lineHasListType(line, type) {
  if (type === 'task') return /^\s*[-*+] \[[ xX]\] /.test(line);
  if (type === 'bullet') return /^\s*[-*+] (?!\[[ xX]\] )/.test(line);
  if (type === 'ordered') return /^\s*\d+\. /.test(line);
  return false;
}

// Aufzählung/Nummeriert/Aufgabenliste als Toggle über die Zeilen. Sind alle
// nicht-leeren Zeilen bereits vom Ziel-Typ, wird der Präfix entfernt; sonst
// gesetzt (ein bestehender Listen-Präfix eines anderen Typs wird ersetzt, die
// Einrückung bleibt). Nummerierte Liste fortlaufend ab 1.
function toggleListType(lines, type) {
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const allTargetType = nonEmpty.length > 0 && nonEmpty.every((l) => lineHasListType(l, type));
  let counter = 1;
  return lines.map((line) => {
    if (line.trim() === '') return line;
    const { indent, content } = stripListPrefix(line);
    if (allTargetType) return indent + content;
    const prefix = type === 'ordered' ? `${counter++}. ` : type === 'task' ? '- [ ] ' : '- ';
    return indent + prefix + content;
  });
}

// Überschrift-Ebene 1..6 setzen oder mit 0 entfernen. Sind alle nicht-leeren
// Zeilen bereits auf der Ziel-Ebene, wird auf 0 geschaltet (Toggle).
function setHeadingLevel(lines, level) {
  const strip = (l) => l.replace(/^#{1,6} /, '');
  if (level === 0) return lines.map((l) => (l.trim() === '' ? l : strip(l)));
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const allAtLevel =
    nonEmpty.length > 0 &&
    nonEmpty.every((l) => {
      const m = l.match(/^(#{1,6}) /);
      return !!m && m[1].length === level;
    });
  return lines.map((line) => {
    if (line.trim() === '') return line;
    const content = strip(line);
    return allAtLevel ? content : '#'.repeat(level) + ' ' + content;
  });
}

// Zitat (`> `) als Toggle über die Zeilen.
function toggleQuote(lines) {
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const allQuoted = nonEmpty.length > 0 && nonEmpty.every((l) => /^> /.test(l));
  return lines.map((line) => {
    if (allQuoted) return line.replace(/^> /, '');
    return line.trim() === '' ? line : '> ' + line;
  });
}

// Absatz-Zustand der Zeile für die Häkchen im Absatz-Submenü.
function detectParagraphState(lineText) {
  const hm = lineText.match(/^(#{1,6}) /);
  let list = null;
  if (/^\s*[-*+] \[[ xX]\] /.test(lineText)) list = 'task';
  else if (/^\s*[-*+] /.test(lineText)) list = 'bullet';
  else if (/^\s*\d+\. /.test(lineText)) list = 'ordered';
  return { list, heading: hm ? hm[1].length : 0, quote: /^> /.test(lineText) };
}

// --- 4T-0379: Einfüge-Schablonen --------------------------------------------

// Nächste freie numerische Fußnoten-Nummer ([^n]).
function nextFootnoteNumber(text) {
  const nums = [...text.matchAll(/\[\^(\d+)\]/g)].map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// Leerzeilen-Puffer vor/nach einem Block, damit er als eigener Absatz steht
// (verhindert u.a. das Setext-Missverständnis bei ---). Ziel: je eine
// Leerzeile (zwei \n) Abstand, soweit nicht schon vorhanden.
function blockPadding(text, pos) {
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const haveBefore =
    before.length === 0 ? 2 : /\n\n$/.test(before) ? 2 : /\n$/.test(before) ? 1 : 0;
  const haveAfter = after.length === 0 ? 2 : /^\n\n/.test(after) ? 2 : /^\n/.test(after) ? 1 : 0;
  return { lead: '\n'.repeat(2 - haveBefore), trail: '\n'.repeat(2 - haveAfter) };
}

// Fügt einen Block an der Cursor-Position ein, mit Leerzeilen-Puffer, und
// setzt den Cursor auf cursorInBody (Offset im body). Gemeinsame Basis für
// Tabelle, Horizontale Linie und Quelltext-Block.
function insertBlock(text, pos, body, cursorInBody) {
  const { lead, trail } = blockPadding(text, pos);
  const insert = lead + body + trail;
  const cur = pos + lead.length + cursorInBody;
  return { changes: [{ from: pos, to: pos, insert }], selFrom: cur, selTo: cur };
}

// Fußnote: Referenz [^n] an der Cursor-Position, Definitionszeile [^n]: am
// Dokument-Ende, Cursor in die Definition. Zwei Änderungen in einem dispatch.
function insertFootnote(text, pos) {
  const n = nextFootnoteNumber(text);
  const ref = `[^${n}]`;
  const def = (text.endsWith('\n') ? '' : '\n') + `[^${n}]: `;
  const changes = [
    { from: pos, to: pos, insert: ref },
    { from: text.length, to: text.length, insert: def },
  ];
  // Die Referenz-Einfügung an pos verschiebt das Dokument-Ende um ref.length.
  const cur = text.length + ref.length + def.length;
  return { changes, selFrom: cur, selTo: cur };
}

// 4T-0608 (Epic 3E-0114): leere Pipe-Tabelle in Raster-Größe. rows zählt
// inklusive Kopfzeile (Raster-Semantik „r × c" wie in der Live-
// Beschriftung des Pickers), Minimum 1×1 (Kopfzeile plus Trenner).
function pipeTableTemplate(rows, cols) {
  const r = Math.max(1, Math.floor(rows) || 1);
  const c = Math.max(1, Math.floor(cols) || 1);
  const row = '|' + '  |'.repeat(c);
  const lines = [row, '|' + ' --- |'.repeat(c)];
  for (let i = 1; i < r; i++) lines.push(row);
  return lines.join('\n');
}

// Cursor in die erste Kopfzelle (hinter "| "). Ein Einfüge-Aufruf ist ein
// einzelner dispatch — Undo nimmt die ganze Tabelle in einem Schritt.
function insertTableOfSize(text, pos, rows, cols) {
  return insertBlock(text, pos, pipeTableTemplate(rows, cols), 2);
}

function insertTable(text, pos) {
  // Standard-Schablone des insert.table-Kommandos: 2×2 (Kopf plus eine
  // Datenzeile) — identisch zu insertTableOfSize(…, 2, 2).
  return insertTableOfSize(text, pos, 2, 2);
}

// Hinweisblock: Callout-Schablone mit selektiertem Typ "note" (per Tippen
// änderbar) und einer Folgezeile für den Inhalt.
function insertCallout(text, pos) {
  const { lead, trail } = blockPadding(text, pos);
  const insert = lead + '> [!note]\n> ' + trail;
  const typeStart = pos + lead.length + 4; // hinter "> [!"
  return { changes: [{ from: pos, to: pos, insert }], selFrom: typeStart, selTo: typeStart + 4 };
}

function insertHorizontalRule(text, pos) {
  return insertBlock(text, pos, '---', 3);
}

function insertCodeBlock(text, pos) {
  // Cursor auf der Sprach-Position hinter den öffnenden Backticks.
  return insertBlock(text, pos, '```\n\n```', 3);
}

module.exports = {
  INLINE_FORMATS,
  wordRangeAt,
  trimSpan,
  applyInlineFormat,
  clearInlineFormats,
  detectInlineFormats,
  insertWikiLink,
  insertExternalLink,
  detectPasteUrl,
  isProtectedForFormatting,
  toggleListType,
  setHeadingLevel,
  toggleQuote,
  detectParagraphState,
  nextFootnoteNumber,
  insertFootnote,
  pipeTableTemplate,
  insertTableOfSize,
  insertTable,
  insertCallout,
  insertHorizontalRule,
  insertCodeBlock,
};
