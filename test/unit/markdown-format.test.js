// 4T-000378 (Epic 3E-000071): Unit-Matrix für den Toggle-Kern der Zeichen-
// Format-Kommandos (src/shared/markdown-format.js). Deckt pro Format setzen
// und entfernen, Wort unter Cursor, leeres Paar, Whitespace-Trim,
// Verschachtelung, „Formatierung entfernen", die Link-Aktionen und den
// Schutz-Kontext (Wiki-Link, Inline-Quelltext) ab.
import { describe, it, expect } from 'vitest';
import {
  applyInlineFormat,
  clearInlineFormats,
  detectInlineFormats,
  wordRangeAt,
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
  insertPerspectiveTable,
  PERSPECTIVE_TABLE_TEMPLATE,
  insertCallout,
  insertHorizontalRule,
  insertCodeBlock,
} from '../../src/shared/markdown-format.js';
// 4T-001309: Gegenprobe des eingefuegten Geruests am Parser des Konstrukts.
import { parsePerspectiveTableBlock } from '../../src/shared/markdown/perspective-table.js';

// Wendet ein Änderungs-Ergebnis auf den Text an (wie CodeMirror dispatch).
function applyResult(text, r) {
  return text.slice(0, r.from) + r.insert + text.slice(r.to);
}

describe('applyInlineFormat: setzen', () => {
  it('Fett um eine Selektion', () => {
    const r = applyInlineFormat('hello world', 6, 11, 'bold');
    expect(applyResult('hello world', r)).toBe('hello **world**');
    // Selektion umschließt weiter den Inhalt (ohne Marker).
    expect(r.selFrom).toBe(8);
    expect(r.selTo).toBe(13);
  });
  it('Kursiv um eine Selektion', () => {
    const r = applyInlineFormat('word', 0, 4, 'italic');
    expect(applyResult('word', r)).toBe('*word*');
  });
  it('Durchgestrichen, Hervorheben, Code, Mathe', () => {
    expect(applyResult('x', applyInlineFormat('x', 0, 1, 'strikethrough'))).toBe('~~x~~');
    expect(applyResult('x', applyInlineFormat('x', 0, 1, 'highlight'))).toBe('==x==');
    expect(applyResult('x', applyInlineFormat('x', 0, 1, 'code'))).toBe('`x`');
    expect(applyResult('x', applyInlineFormat('x', 0, 1, 'math'))).toBe('$x$');
  });
  it('Kommentar mit asymmetrischen Markern', () => {
    const r = applyInlineFormat('note', 0, 4, 'comment');
    expect(applyResult('note', r)).toBe('{>>note<<}');
    expect(r.selFrom).toBe(3);
    expect(r.selTo).toBe(7);
  });
});

describe('applyInlineFormat: Toggle entfernen', () => {
  it('Marker direkt außerhalb der Selektion', () => {
    const r = applyInlineFormat('**world**', 2, 7, 'bold');
    expect(applyResult('**world**', r)).toBe('world');
    expect(r.selFrom).toBe(0);
    expect(r.selTo).toBe(5);
  });
  it('Marker innerhalb der Selektion (Selektion schließt Marker ein)', () => {
    const r = applyInlineFormat('**world**', 0, 9, 'bold');
    expect(applyResult('**world**', r)).toBe('world');
  });
  it('Kommentar entfernen', () => {
    const r = applyInlineFormat('{>>note<<}', 3, 7, 'comment');
    expect(applyResult('{>>note<<}', r)).toBe('note');
  });
  it('erneutes Anwenden ist die Umkehrung (Setzen dann Entfernen)', () => {
    const set = applyInlineFormat('word', 0, 4, 'bold');
    const text2 = applyResult('word', set); // '**word**'
    const off = applyInlineFormat(text2, set.selFrom, set.selTo, 'bold');
    expect(applyResult(text2, off)).toBe('word');
  });
});

describe('applyInlineFormat: Selektions-Semantik', () => {
  it('leere Selektion nimmt das Wort unter dem Cursor', () => {
    const r = applyInlineFormat('hello world', 8, 8, 'bold');
    expect(applyResult('hello world', r)).toBe('hello **world**');
  });
  it('leere Selektion ohne Wort fügt ein leeres Paar mit Cursor dazwischen ein', () => {
    const r = applyInlineFormat('a  b', 2, 2, 'bold');
    expect(applyResult('a  b', r)).toBe('a **** b');
    expect(r.selFrom).toBe(r.selTo);
    expect(r.selFrom).toBe(4); // zwischen den beiden **
  });
  it('Whitespace-Ränder bleiben außerhalb der Marker', () => {
    const r = applyInlineFormat('a b c', 1, 4, 'bold');
    expect(applyResult('a b c', r)).toBe('a **b** c');
  });
});

describe('applyInlineFormat: Verschachtelung mit avoid', () => {
  it('Kursiv auf ein fettes Wort ergibt fett+kursiv, ohne die Fett-Marker zu zerstören', () => {
    const r = applyInlineFormat('**word**', 2, 7, 'italic');
    expect(applyResult('**word**', r)).toBe('***word***');
  });
  it('Mathe fasst ein $$-Paar nicht an', () => {
    const r = applyInlineFormat('$$x$$', 2, 3, 'math');
    // avoid verhindert das Entfernen der $$-Marker; es wird innen ergänzt.
    expect(applyResult('$$x$$', r)).toBe('$$$x$$$');
  });
});

describe('clearInlineFormats', () => {
  it('räumt verschachtelte Marker vollständig ab', () => {
    const r = clearInlineFormats('***text***', 0, 10);
    expect(applyResult('***text***', r)).toBe('text');
  });
  it('kombinierte Formate: fett + kursiv + durchgestrichen', () => {
    const src = '**a** *b* ~~c~~';
    const r = clearInlineFormats(src, 0, src.length);
    expect(applyResult(src, r)).toBe('a b c');
  });
  it('lässt Wiki-Link-Struktur unberührt', () => {
    const src = '**[[wiki]]**';
    const r = clearInlineFormats(src, 0, src.length);
    expect(applyResult(src, r)).toBe('[[wiki]]');
  });
  it('entfernt Highlight, Code, Mathe und Kommentar', () => {
    const src = '==h== `c` $m$ {>>k<<}';
    const r = clearInlineFormats(src, 0, src.length);
    expect(applyResult(src, r)).toBe('h c m k');
  });
});

describe('wordRangeAt', () => {
  it('erkennt Wortgrenzen inklusive Umlauten', () => {
    expect(wordRangeAt('grün text', 2)).toEqual({ from: 0, to: 4 });
  });
  it('leerer Bereich zwischen Nicht-Wortzeichen', () => {
    expect(wordRangeAt('a  b', 2)).toEqual({ from: 2, to: 2 });
  });
});

describe('Link-Aktionen', () => {
  it('Wiki-Link um die Selektion', () => {
    const r = insertWikiLink('word', 0, 4);
    expect(applyResult('word', r)).toBe('[[word]]');
    expect(r.selFrom).toBe(2);
    expect(r.selTo).toBe(6);
  });
  it('Wiki-Link ohne Selektion: leeres Paar mit Cursor dazwischen', () => {
    const r = insertWikiLink('', 0, 0);
    expect(applyResult('', r)).toBe('[[]]');
    expect(r.selFrom).toBe(2);
    expect(r.selTo).toBe(2);
  });
  it('Externer Link mit selektiertem url-Platzhalter', () => {
    const r = insertExternalLink('text', 0, 4);
    expect(applyResult('text', r)).toBe('[text](url)');
    expect('[text](url)'.slice(r.selFrom, r.selTo)).toBe('url');
  });
  it('Externer Link mit übergebener URL: Adresse eingesetzt, Cursor dahinter', () => {
    const r = insertExternalLink('text', 0, 4, 'https://example.org');
    const out = applyResult('text', r);
    expect(out).toBe('[text](https://example.org)');
    // Leere Selektion direkt hinter dem Link.
    expect(r.selFrom).toBe(r.selTo);
    expect(r.selFrom).toBe(out.length);
  });
  it('Externer Link mit Klammer-URL: Spitze-Klammern', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    const r = insertExternalLink('Anker', 0, 5, url);
    expect(applyResult('Anker', r)).toBe(`[Anker](<${url}>)`);
  });
  it('Externer Link mit Leerzeichen-URL: Spitze-Klammern', () => {
    const r = insertExternalLink('x', 0, 1, 'a b');
    expect(applyResult('x', r)).toBe('[x](<a b>)');
  });
});

describe('detectPasteUrl (4T-000603)', () => {
  it('erkennt http(s)- und file-URLs unverändert', () => {
    expect(detectPasteUrl('https://example.org')).toBe('https://example.org');
    expect(detectPasteUrl('http://a.b/c')).toBe('http://a.b/c');
    expect(detectPasteUrl('file:///C:/x.md')).toBe('file:///C:/x.md');
  });
  it('ergänzt bei www.-Adressen das https-Präfix', () => {
    expect(detectPasteUrl('www.example.org')).toBe('https://www.example.org');
  });
  it('trimmt Rand-Whitespace', () => {
    expect(detectPasteUrl('  https://example.org \n')).toBe('https://example.org');
  });
  it('erkennt Klammer-URLs (Normalisierung erst beim Einsetzen)', () => {
    const u = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    expect(detectPasteUrl(u)).toBe(u);
  });
  it('lehnt Nicht-URLs und mehrdeutige Eingaben ab', () => {
    expect(detectPasteUrl('kein Link')).toBeNull(); // interner Whitespace
    expect(detectPasteUrl('example.org')).toBeNull(); // kein Schema, kein www.
    expect(detectPasteUrl('https://a b')).toBeNull(); // Whitespace im Token
    expect(detectPasteUrl('')).toBeNull();
    expect(detectPasteUrl(null)).toBeNull();
    expect(detectPasteUrl(42)).toBeNull();
  });
});

describe('isProtectedForFormatting', () => {
  it('Selektion im Wiki-Link-Ziel ist geschützt', () => {
    // "Ein [[Wiki-Ziel]] als Link" — "Wiki" liegt bei 6..10.
    const text = 'Ein [[Wiki-Ziel]] als Link';
    expect(isProtectedForFormatting(text, 6, 10)).toBe(true);
  });
  it('Cursor (leere Selektion) im Wiki-Link-Ziel ist geschützt', () => {
    const text = 'Ein [[Wiki-Ziel]] als Link';
    expect(isProtectedForFormatting(text, 8, 8)).toBe(true);
  });
  it('Selektion im Inline-Quelltext ist geschützt', () => {
    const text = 'Vor `code` nach';
    expect(isProtectedForFormatting(text, 5, 9)).toBe(true);
  });
  it('normaler Text ist nicht geschützt', () => {
    const text = 'Ein ganz normaler Satz';
    expect(isProtectedForFormatting(text, 9, 17)).toBe(false);
  });
  it('Selektion inklusive der Wiki-Marker ist nicht geschützt', () => {
    const text = 'Ein [[Wiki-Ziel]] als Link';
    expect(isProtectedForFormatting(text, 4, 17)).toBe(false);
  });
  it('Wiki-Link auf einer anderen Zeile schützt nicht', () => {
    const text = '[[oben]]\nnormaler Text';
    expect(isProtectedForFormatting(text, 12, 20)).toBe(false);
  });
});

describe('toggleListType (4T-000379)', () => {
  it('Aufzählung setzen und als Toggle wieder entfernen', () => {
    expect(toggleListType(['a', 'b'], 'bullet')).toEqual(['- a', '- b']);
    expect(toggleListType(['- a', '- b'], 'bullet')).toEqual(['a', 'b']);
  });
  it('nummerierte Liste fortlaufend ab 1', () => {
    expect(toggleListType(['a', 'b', 'c'], 'ordered')).toEqual(['1. a', '2. b', '3. c']);
  });
  it('Aufgabenliste', () => {
    expect(toggleListType(['a'], 'task')).toEqual(['- [ ] a']);
  });
  it('Typ-Wechsel ersetzt den Präfix statt zu stapeln', () => {
    expect(toggleListType(['- a'], 'ordered')).toEqual(['1. a']);
    expect(toggleListType(['1. a'], 'bullet')).toEqual(['- a']);
    expect(toggleListType(['- [ ] a'], 'bullet')).toEqual(['- a']);
  });
  it('Einrückung bleibt erhalten', () => {
    expect(toggleListType(['  a'], 'bullet')).toEqual(['  - a']);
  });
  it('leere Zeilen bleiben unverändert', () => {
    expect(toggleListType(['a', '', 'b'], 'bullet')).toEqual(['- a', '', '- b']);
  });
});

describe('setHeadingLevel (4T-000379)', () => {
  it('Überschrift setzen und als Toggle entfernen', () => {
    expect(setHeadingLevel(['Titel'], 1)).toEqual(['# Titel']);
    expect(setHeadingLevel(['# Titel'], 1)).toEqual(['Titel']);
  });
  it('Ebene wechseln', () => {
    expect(setHeadingLevel(['# Titel'], 3)).toEqual(['### Titel']);
  });
  it('Keine Überschrift (Ebene 0) entfernt jeden Grad', () => {
    expect(setHeadingLevel(['## Titel'], 0)).toEqual(['Titel']);
  });
});

describe('toggleQuote (4T-000379)', () => {
  it('Zitat setzen und entfernen', () => {
    expect(toggleQuote(['a', 'b'])).toEqual(['> a', '> b']);
    expect(toggleQuote(['> a', '> b'])).toEqual(['a', 'b']);
  });
});

describe('detectParagraphState (4T-000379)', () => {
  it('erkennt Überschrift, Listen-Typen und Zitat', () => {
    expect(detectParagraphState('# t')).toEqual({ list: null, heading: 1, quote: false });
    expect(detectParagraphState('- i')).toEqual({ list: 'bullet', heading: 0, quote: false });
    expect(detectParagraphState('- [ ] i')).toEqual({ list: 'task', heading: 0, quote: false });
    expect(detectParagraphState('1. i')).toEqual({ list: 'ordered', heading: 0, quote: false });
    expect(detectParagraphState('> q')).toEqual({ list: null, heading: 0, quote: true });
    expect(detectParagraphState('plain')).toEqual({ list: null, heading: 0, quote: false });
  });
});

describe('Einfüge-Schablonen (4T-000379)', () => {
  // Bildet CodeMirrors Mehrfach-Änderung nach: Änderungen mit Original-
  // Positionen, bei gleicher Position in Array-Reihenfolge.
  function applyChanges(text, changes) {
    const sorted = changes
      .map((c, i) => ({ ...c, i }))
      .sort((a, b) => a.from - b.from || a.i - b.i);
    let out = '';
    let last = 0;
    for (const c of sorted) {
      out += text.slice(last, c.from) + c.insert;
      last = c.to;
    }
    return out + text.slice(last);
  }
  it('nächste Fußnoten-Nummer', () => {
    expect(nextFootnoteNumber('kein Marker')).toBe(1);
    expect(nextFootnoteNumber('a [^1] b [^3]')).toBe(4);
  });
  it('Fußnote: Referenz und Definition, Cursor in der Definition', () => {
    const r = insertFootnote('hello', 5);
    expect(applyChanges('hello', r.changes)).toBe('hello[^1]\n[^1]: ');
    expect(r.selFrom).toBe('hello[^1]\n[^1]: '.length);
  });
  it('Horizontale Linie mit Leerzeilen-Puffer', () => {
    const r = insertHorizontalRule('text', 4);
    expect(applyChanges('text', r.changes)).toBe('text\n\n---');
  });
  it('Tabelle, Cursor in der ersten Kopfzelle', () => {
    const r = insertTable('', 0);
    expect(applyChanges('', r.changes)).toBe('|  |  |\n| --- | --- |\n|  |  |');
    expect(r.selFrom).toBe(2);
  });
  // 4T-001309 (Epic 3E-000235): Geruest der Perspective-Tabelle. Geprueft wird das
  // Ergebnis als Ganzes und nicht nur die Zeilen-Zahl: Der Block muss der
  // Notation der Perspective-Tabelle folgen, sonst rendert er nicht.
  it('Perspective-Tabelle, Cursor in der ersten Kopfzelle', () => {
    const r = insertPerspectiveTable('', 0);
    const out = applyChanges('', r.changes);
    expect(out).toBe(
      ['```perspective-table', '{|', '|-', '! ', '! ', '|-', '| ', '| ', '|}', '```'].join('\n'),
    );
    // Hinter der Marke der ersten Kopfzelle, also am Ende der vierten Zeile.
    expect(out.slice(0, r.selFrom).split('\n')).toHaveLength(4);
    expect(out.slice(0, r.selFrom).endsWith('! ')).toBe(true);
    expect(r.selTo).toBe(r.selFrom);
  });
  it('Perspective-Tabelle mitten in einer Zeile beginnt in einer eigenen Zeile', () => {
    const r = insertPerspectiveTable('Text', 4);
    const out = applyChanges('Text', r.changes);
    expect(out.startsWith('Text\n\n```perspective-table')).toBe(true);
  });
  // Der eigentliche Nachweis: Das Geruest ist nicht nur formal richtig
  // geschrieben, sondern wird vom Parser des Konstrukts als Tabelle mit
  // Kopf- und Datenzeile gelesen. Eine Schablone, die nur wie eine Tabelle
  // aussieht, waere im Programm ein Code-Block.
  it('das Geruest der Perspective-Tabelle wird als Tabelle gelesen', () => {
    const körper = PERSPECTIVE_TABLE_TEMPLATE.split('\n').slice(1, -1).join('\n');
    const modell = parsePerspectiveTableBlock(körper);
    expect(modell).not.toBeNull();
    expect(modell.rows).toHaveLength(2);
    expect(modell.rows[0].cells.map((c) => c.type)).toEqual(['th', 'th']);
    expect(modell.rows[1].cells.map((c) => c.type)).toEqual(['td', 'td']);
  });
  it('Quelltext-Block, Cursor auf der Sprach-Position', () => {
    const r = insertCodeBlock('', 0);
    expect(applyChanges('', r.changes)).toBe('```\n\n```');
    expect(r.selFrom).toBe(3);
  });
  it('Hinweisblock mit selektiertem Typ note', () => {
    const r = insertCallout('', 0);
    const out = applyChanges('', r.changes);
    expect(out).toBe('> [!note]\n> ');
    expect(out.slice(r.selFrom, r.selTo)).toBe('note');
  });
});

// 4T-000607 (Epic 3E-000114): Zustands-Erkennung der Format-Toolbar. Ein
// Format gilt als aktiv, wenn applyInlineFormat es an derselben Selektion
// entfernen wuerde — Anzeige und Toggle-Wirkung bleiben deckungsgleich.
describe('detectInlineFormats: aktive Zeichen-Formate', () => {
  it('erkennt Marker um das Wort unter dem Cursor', () => {
    expect(detectInlineFormats('ein **fett** wort', 7, 7)).toEqual(['bold']);
    expect(detectInlineFormats('ein *kursiv* wort', 7, 7)).toEqual(['italic']);
    expect(detectInlineFormats('ein `code` wort', 6, 6)).toEqual(['code']);
  });
  it('erkennt Marker direkt ausserhalb der Selektion', () => {
    // Selektion umfasst genau den Inhalt zwischen den Markern.
    expect(detectInlineFormats('a ==mark== b', 4, 8)).toEqual(['highlight']);
  });
  it('erkennt Marker innen am Rand der Selektion', () => {
    // Selektion umfasst die Marker mit.
    expect(detectInlineFormats('a ~~weg~~ b', 2, 9)).toEqual(['strikethrough']);
  });
  it('liefert ohne Marker eine leere Liste', () => {
    expect(detectInlineFormats('nur text', 4, 4)).toEqual([]);
    expect(detectInlineFormats('', 0, 0)).toEqual([]);
  });
  it('haelt Fett und Kursiv per avoid-Regel auseinander', () => {
    // **fett**: kursiv schlaegt nicht an (avoid-Zeichen direkt daneben).
    expect(detectInlineFormats('**fett**', 4, 4)).toEqual(['bold']);
    // ***beides***: nur Fett wird als entfernbar erkannt — konsistent zur
    // Toggle-Wirkung von applyInlineFormat an derselben Stelle.
    expect(detectInlineFormats('***beides***', 5, 5)).toEqual(['bold']);
  });
});

// 4T-000608 (Epic 3E-000114): Raster-Picker-Geometrie der Pipe-Tabellen.
// rows zaehlt inklusive Kopfzeile (Raster-Semantik "r x c").
describe('insertTableOfSize: Raster-Tabellen', () => {
  function applyChanges(text, changes) {
    const sorted = changes
      .map((c, i) => ({ ...c, i }))
      .sort((a, b) => a.from - b.from || a.i - b.i);
    let out = '';
    let last = 0;
    for (const c of sorted) {
      out += text.slice(last, c.from) + c.insert;
      last = c.to;
    }
    return out + text.slice(last);
  }
  it('erzeugt r Zeilen (inklusive Kopf) mal c Spalten', () => {
    expect(pipeTableTemplate(3, 4)).toBe(
      '|  |  |  |  |\n| --- | --- | --- | --- |\n|  |  |  |  |\n|  |  |  |  |',
    );
  });
  it('Minimum 1x1: Kopfzeile plus Trenner, defensive Klemmung', () => {
    expect(pipeTableTemplate(1, 1)).toBe('|  |\n| --- |');
    expect(pipeTableTemplate(0, -3)).toBe('|  |\n| --- |');
  });
  it('2x2 ist identisch zur insert.table-Schablone', () => {
    expect(insertTableOfSize('', 0, 2, 2)).toEqual(insertTable('', 0));
  });
  it('fuegt mit Leerzeilen-Puffer ein, Cursor in der ersten Kopfzelle', () => {
    const r = insertTableOfSize('text', 4, 2, 3);
    expect(applyChanges('text', r.changes)).toBe(
      'text\n\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |',
    );
    // Cursor hinter "| " der Kopfzeile (nach dem Zwei-Zeilen-Puffer).
    expect(r.selFrom).toBe(8);
    expect(r.selTo).toBe(8);
  });
  it('ein einziger changes-Eintrag — Undo nimmt die Tabelle in einem Schritt', () => {
    expect(insertTableOfSize('', 0, 5, 2).changes).toHaveLength(1);
  });
});
