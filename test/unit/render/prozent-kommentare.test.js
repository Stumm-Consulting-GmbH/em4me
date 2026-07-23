// 4T-0479 (Epic 3E-0089): %%-Kommentare — Scanner, Strip und Render-Pfade.
//
// Deckt die code-bewusste Vorverarbeitung (stripPercentComments /
// findPercentCommentRanges in plugins.js) sowie die Anbindung in
// renderMarkdown und convertMarkdownPortable (markdown.js) ab: privater
// Text zwischen %%-Markern verschwindet aus jeder gerenderten Ansicht und
// jedem Export, bleibt aber im Quelltext; %% in Code-Bloecken und Code-
// Spans bleibt Literal; \%% ist ein Escape; unpaariges %% wirkt bis EOF;
// der Strip ist zeilentreu (data-source-line).
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import {
  stripPercentComments,
  findPercentCommentRanges,
} from '../../../src/shared/markdown/plugins.js';

// Standard-Zustand nach jedem Test: alle Erweiterungen an (Kommentare aktiv).
afterEach(() => {
  configureExtensions([]);
});

describe('stripPercentComments (4T-0479)', () => {
  it('entfernt einen Inline-Kommentar inklusive Marker', () => {
    expect(stripPercentComments('a %%privat%% b')).toBe('a  b');
  });

  it('entfernt einen mehrzeiligen Kommentar zeilentreu (Newlines bleiben)', () => {
    const src = 'A\n%%c1\nc2%%\nB';
    const out = stripPercentComments(src);
    expect(out).toBe('A\n\n\nB');
    // Zeilentreue: gleiche Zeilenzahl vor und nach dem Strip.
    expect(out.split('\n').length).toBe(src.split('\n').length);
  });

  it('unpaariges oeffnendes %% wirkt bis zum Dokument-Ende', () => {
    expect(stripPercentComments('vor %%rest bis ende')).toBe('vor ');
  });

  it('Escape \\%% bleibt Literal (einzeln)', () => {
    const src = 'ein \\%% mitten im Text';
    expect(stripPercentComments(src)).toBe(src);
  });

  it('Escape \\%% bleibt Literal (beide Marker eines Paars escapet)', () => {
    const src = '\\%%kein Kommentar\\%%';
    expect(stripPercentComments(src)).toBe(src);
  });

  it('%% in einem Inline-Code-Span bleibt Literal', () => {
    const single = 'Text `%%literal%%` danach';
    expect(stripPercentComments(single)).toBe(single);
    const doubled = 'Text ``%%literal%%`` danach';
    expect(stripPercentComments(doubled)).toBe(doubled);
  });

  it('%% in einem Fenced-Code-Block bleibt Literal (Backtick und Tilde)', () => {
    const backtick = '```\n%%literal%%\n```';
    expect(stripPercentComments(backtick)).toBe(backtick);
    const tilde = '~~~\n%%literal%%\n~~~';
    expect(stripPercentComments(tilde)).toBe(tilde);
  });

  it('nicht geschlossener Fence schuetzt %% bis zum Dokument-Ende', () => {
    const src = '```\n%%literal%% bleibt';
    expect(stripPercentComments(src)).toBe(src);
  });

  it('leerer Kommentar %%%% wird vollstaendig entfernt', () => {
    expect(stripPercentComments('a %%%% b')).toBe('a  b');
  });

  it('ein einzelnes % bleibt unberuehrt', () => {
    expect(stripPercentComments('50% Rabatt heute')).toBe('50% Rabatt heute');
  });
});

describe('findPercentCommentRanges (4T-0479)', () => {
  it('liefert from/to inklusive der Marker fuer einen Inline-Kommentar', () => {
    // 'a %%x%% b' — Marker beginnt bei Offset 2, schliessende %% bei 5,
    // to = 5 + 2 = 7 (exklusive obere Grenze).
    expect(findPercentCommentRanges('a %%x%% b')).toEqual([{ from: 2, to: 7, closed: true }]);
  });

  it('unpaariges %% endet bei der Text-Laenge', () => {
    const src = 'vor %%rest';
    expect(findPercentCommentRanges(src)).toEqual([{ from: 4, to: src.length, closed: false }]);
  });

  it('erkennt mehrere getrennte Kommentare', () => {
    // '%%a%% x %%b%%' — zwei Paare.
    expect(findPercentCommentRanges('%%a%% x %%b%%')).toEqual([
      { from: 0, to: 5, closed: true },
      { from: 8, to: 13, closed: true },
    ]);
  });

  // 4T-0533: closed-Flag als Grundlage des Linter-Hinweises auf unpaarige
  // Marker. Ein Dokument, das exakt mit dem schliessenden %% endet, ist
  // geschlossen (to == Textlaenge reicht als Unpaarig-Kriterium NICHT);
  // ein Escape am Text-Ende schliesst nicht.
  it('closed-Flag: Schliesser am Text-Ende zaehlt als geschlossen', () => {
    expect(findPercentCommentRanges('a %%x%%')).toEqual([{ from: 2, to: 7, closed: true }]);
  });

  it('closed-Flag: Escape am Text-Ende schliesst nicht', () => {
    const src = 'a %%x \\%%';
    expect(findPercentCommentRanges(src)).toEqual([{ from: 2, to: src.length, closed: false }]);
  });
});

describe('renderMarkdown mit %%-Kommentaren (4T-0479)', () => {
  it('Kommentar-Inhalt erscheint nicht im HTML', () => {
    const html = renderMarkdown('Sichtbar %%geheim privat%% Text', 'de');
    expect(html).not.toContain('geheim');
    expect(html).toContain('Sichtbar');
    expect(html).toContain('Text');
  });

  it('Escape \\%% erscheint als woertliches %%', () => {
    const html = renderMarkdown('Woertlich \\%% hier', 'de');
    expect(html).toContain('%%');
  });

  it('%% in einem Code-Block erscheint als Literal', () => {
    const html = renderMarkdown('```\n%%literal%%\n```', 'de');
    expect(html).toContain('%%literal%%');
  });

  it('data-source-line einer Ueberschrift NACH einem mehrzeiligen Kommentar bleibt zeilentreu', () => {
    // Ueberschrift steht im Gesamt-Quelltext auf Zeile 8; der zeilentreue
    // Strip haelt data-source-line auf 8 (Scroll-Sync, Checkbox-Toggle).
    const src = 'Zeile1\n\n%%\nk1\nk2\n%%\n\n# Titel';
    const html = renderMarkdown(src, 'de');
    expect(html).toContain('data-source-line="8"');
    expect(html).not.toContain('k1');
  });
});

describe('convertMarkdownPortable mit %%-Kommentaren (4T-0479)', () => {
  it('Kommentare fehlen im Export, Code-Fence-Inhalt bleibt erhalten', () => {
    const src = 'Sichtbar %%privat export%% Text\n\n```\n%%literal%%\n```\n';
    const out = convertMarkdownPortable(src);
    expect(out).not.toContain('privat export');
    expect(out).toContain('%%literal%%');
    expect(out).toContain('Sichtbar');
  });

  it('bei einem Dokument ohne Kommentare veraendert die Erweiterung den Text nicht (Alt-Verhalten)', () => {
    // Byte-Vergleich zwischen aktiver und deaktivierter Kommentar-
    // Erweiterung: ohne %%-Marker ist der Strip ein No-Op, die Ausgabe
    // bleibt identisch zum Stand vor der Funktion.
    const doc = 'Nur Text ohne Kommentar.\n\nZweiter Absatz.\n';
    configureExtensions([]);
    const withExt = convertMarkdownPortable(doc);
    configureExtensions(['comments']);
    const withoutExt = convertMarkdownPortable(doc);
    expect(withExt).toBe(withoutExt);
  });
});
