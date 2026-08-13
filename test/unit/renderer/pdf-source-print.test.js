// @vitest-environment jsdom
// 4T-0311 (Epic 3E-0055): Unit-Tests der Quelltext-Druck-Aufbereitung —
// Zeilen-Split mit zeilenuebergreifenden hljs-Spans, Zeilennummern-Aufbau
// und Leerzeilen-Verhalten.
import { describe, it, expect } from 'vitest';
import {
  highlightMarkdownSource,
  splitHighlightedLines,
  buildPdfSourcePrintElement,
} from '../../../src/renderer/modules/views/pdf-source-print.js';

describe('splitHighlightedLines', () => {
  it('zerlegt einfaches HTML an Zeilengrenzen', () => {
    expect(splitHighlightedLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('haelt zeilenuebergreifende Spans pro Zeile balanciert', () => {
    const html = '<span class="hljs-code">```js\nconst x = 1;\n```</span>';
    const lines = splitHighlightedLines(html);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      const opens = (line.match(/<span/g) || []).length;
      const closes = (line.match(/<\/span>/g) || []).length;
      expect(opens, line).toBe(closes);
      expect(line).toContain('hljs-code');
    }
    expect(lines[1]).toContain('const x = 1;');
  });

  it('behandelt leere Eingaben und Leerzeilen', () => {
    expect(splitHighlightedLines('')).toEqual(['']);
    expect(splitHighlightedLines('a\n\nb')).toEqual(['a', '', 'b']);
  });

  it('verschachtelte Spans werden geschlossen und wieder geoeffnet', () => {
    const html = '<span class="a"><span class="b">x\ny</span></span>';
    const lines = splitHighlightedLines(html);
    expect(lines[0]).toBe('<span class="a"><span class="b">x</span></span>');
    expect(lines[1]).toBe('<span class="a"><span class="b">y</span></span>');
  });
});

describe('highlightMarkdownSource', () => {
  it('hebt Markdown-Konstrukte mit hljs-Klassen hervor', () => {
    const html = highlightMarkdownSource('# Titel\n\n**fett**');
    expect(html).toContain('hljs-section');
    expect(html).toContain('hljs-strong');
  });

  it('escaped HTML-Inhalte im Quelltext', () => {
    const html = highlightMarkdownSource('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildPdfSourcePrintElement', () => {
  const SAMPLE = '# Titel\n\nText mit **fett**\n```js\nconst x = 1;\n```';

  it('baut pro Quellzeile eine Druckzeile, ohne Nummern per Default', () => {
    const el = buildPdfSourcePrintElement(SAMPLE);
    expect(el.classList.contains('pdf-source-print')).toBe(true);
    expect(el.classList.contains('with-line-numbers')).toBe(false);
    expect(el.querySelectorAll('.pdf-source-line')).toHaveLength(6);
    expect(el.querySelectorAll('.pdf-source-lineno')).toHaveLength(0);
  });

  it('setzt Zeilennummern und die Breiten-Variable bei aktivem Toggle', () => {
    const el = buildPdfSourcePrintElement(SAMPLE, { showLineNumbers: true });
    expect(el.classList.contains('with-line-numbers')).toBe(true);
    const numbers = [...el.querySelectorAll('.pdf-source-lineno')].map((n) => n.textContent);
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(el.style.getPropertyValue('--pdf-source-lineno-width')).toBe('1ch');
  });

  it('Breiten-Variable folgt der Stellenzahl der groessten Nummer', () => {
    const el = buildPdfSourcePrintElement('x\n'.repeat(11), { showLineNumbers: true });
    // 11 Zeilen plus die Zeile nach dem letzten \n -> 12 Zeilen, 2 Stellen.
    expect(el.style.getPropertyValue('--pdf-source-lineno-width')).toBe('2ch');
  });

  it('Leerzeilen kollabieren nicht (Zero-Width-Space als Inhalt)', () => {
    const el = buildPdfSourcePrintElement('a\n\nb');
    const codes = [...el.querySelectorAll('.pdf-source-code')];
    expect(codes[1].textContent).toBe('​');
  });
});
